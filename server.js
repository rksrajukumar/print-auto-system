const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = Number(process.env.PORT || 8080);
const JOB_TIMEOUT_SECONDS = Number(process.env.JOB_TIMEOUT_SECONDS || 300);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 20);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/*
  In-memory state for the first version.
  Jobs are intentionally deleted after completion/cancellation.
  For production persistence, replace this map with PostgreSQL/Redis.
*/
const clients = new Map(); // clientId -> { ws, printerName, connectedAt }
const jobs = new Map();    // jobId -> job

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
});

function json(res, status, body) {
  res.status(status).json(body);
}

function safeSend(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function clientStatus(clientId) {
  const c = clients.get(clientId);
  return c ? { online: true, printerName: c.printerName } : { online: false };
}

// Health
app.get("/health", (req, res) => {
  json(res, 200, {
    ok: true,
    service: "auto-print-server",
    time: new Date().toISOString(),
    clients: clients.size,
    jobs: jobs.size
  });
});

// Client registration/status
app.get("/api/client/:clientId/status", (req, res) => {
  json(res, 200, clientStatus(req.params.clientId));
});

// Upload a print job for a specific PC client.
// Form fields: clientId, file
app.post("/api/print", upload.single("file"), (req, res) => {
  if (!req.file) return json(res, 400, { ok: false, error: "file is required" });

  const clientId = String(req.body.clientId || "").trim();
  if (!clientId) {
    fs.rm(req.file.path, { force: true }, () => {});
    return json(res, 400, { ok: false, error: "clientId is required" });
  }

  const jobId = uuidv4();
  const now = Date.now();

  const job = {
    jobId,
    clientId,
    originalName: req.file.originalname || "print-file",
    storedPath: req.file.path,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + JOB_TIMEOUT_SECONDS * 1000).toISOString(),
    status: "pending"
  };

  jobs.set(jobId, job);

  const target = clients.get(clientId);
  if (target) {
    job.status = "sent";
    safeSend(target.ws, {
      type: "print_job",
      jobId,
      fileName: job.originalName,
      downloadUrl: `/api/jobs/${jobId}/download`
    });
  }

  json(res, 201, {
    ok: true,
    jobId,
    status: job.status,
    expiresAt: job.expiresAt,
    client: clientStatus(clientId)
  });
});

// Client downloads the actual file.
app.get("/api/jobs/:jobId/download", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: "job not found" });
  if (!fs.existsSync(job.storedPath)) {
    return res.status(410).json({ ok: false, error: "file expired" });
  }
  res.download(job.storedPath, job.originalName);
});

// Client acknowledges completion/cancellation.
app.post("/api/jobs/:jobId/complete", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return json(res, 404, { ok: false, error: "job not found" });

  job.status = req.body.status === "cancelled" ? "cancelled" : "completed";
  job.completedAt = new Date().toISOString();
  removeJobFile(job);
  jobs.delete(job.jobId);

  json(res, 200, { ok: true, status: job.status });
});

function removeJobFile(job) {
  if (job && job.storedPath) fs.rm(job.storedPath, { force: true }, () => {});
}

// WebSocket client protocol:
// client connects to ws://SERVER/ws?clientId=ABC123&printerName=HP
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const clientId = String(url.searchParams.get("clientId") || "").trim();
  const printerName = String(url.searchParams.get("printerName") || "").trim();

  if (!clientId) {
    ws.close(1008, "clientId required");
    return;
  }

  const old = clients.get(clientId);
  if (old && old.ws !== ws) {
    try { old.ws.close(4000, "replaced by new connection"); } catch (_) {}
  }

  clients.set(clientId, {
    ws,
    printerName,
    connectedAt: new Date().toISOString()
  });

  safeSend(ws, {
    type: "registered",
    clientId,
    serverTime: new Date().toISOString()
  });

  // Deliver all pending jobs for this client.
  for (const job of jobs.values()) {
    if (job.clientId === clientId && job.status === "pending") {
      job.status = "sent";
      safeSend(ws, {
        type: "print_job",
        jobId: job.jobId,
        fileName: job.originalName,
        downloadUrl: `/api/jobs/${job.jobId}/download`
      });
    }
  }

  ws.on("message", raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") {
        safeSend(ws, { type: "pong", time: new Date().toISOString() });
      } else if (msg.type === "job_status" && msg.jobId) {
        const job = jobs.get(msg.jobId);
        if (!job || job.clientId !== clientId) return;
        if (msg.status === "completed" || msg.status === "cancelled") {
          job.status = msg.status;
          removeJobFile(job);
          jobs.delete(job.jobId);
        }
      }
    } catch (_) {}
  });

  ws.on("close", () => {
    const current = clients.get(clientId);
    if (current && current.ws === ws) clients.delete(clientId);
  });
});

// Cancel expired jobs every 10 seconds.
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (new Date(job.expiresAt).getTime() <= now) {
      removeJobFile(job);
      const c = clients.get(job.clientId);
      if (c) safeSend(c.ws, {
        type: "job_cancelled",
        jobId,
        reason: "timeout"
      });
      jobs.delete(jobId);
    }
  }
}, 10000);

app.get("/", (req, res) => {
  res.type("html").send(`
    <h2>Auto Print Server</h2>
    <p>Central server is running.</p>
    <p><a href="/health">Health</a></p>
  `);
});

server.listen(PORT, () => {
  console.log(`Auto Print Server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://SERVER:${PORT}/ws`);
});