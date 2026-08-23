const express = require("express");
const { getPool } = require("../services/db");
const { registerClient } = require("../services/clientService");
const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const r = await registerClient(req.body || {});
    const base = process.env.PUBLIC_URL || process.env.BASE_URL ||
      `http://localhost:${process.env.PORT || 10000}`;
    res.json({ ok: true, ...r, upload_url: `${base}/upload/${r.client_id}` });
  } catch (e) {
    console.error("[CLIENT REGISTER]", e);
    res.status(500).json({ ok: false, error: "registration_failed" });
  }
});

router.post("/heartbeat", async (req, res) => {
  try {
    const token = req.headers["x-client-token"];
    if (!token) return res.status(401).json({ ok: false });
    const db = await getPool();
    const row = await db.get(
      "SELECT client_id FROM clients WHERE client_token = ?", token
    );
    if (!row) return res.status(401).json({ ok: false });

    await db.run(
      `UPDATE clients SET status='online', last_seen=CURRENT_TIMESTAMP,
       pc_name=?, hostname=?, printer_name=? WHERE client_token=?`,
      req.body.pc_name || "", req.body.hostname || "",
      req.body.printer_name || "", token
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[CLIENT HEARTBEAT]", e);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
