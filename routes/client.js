const express = require("express");
const { getPool } = require("../services/db");
const { registerClient } = require("../services/clientService");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const result = await registerClient(req.body || {});
    const base =
      process.env.PUBLIC_URL ||
      process.env.BASE_URL ||
      `http://localhost:${process.env.PORT || 10000}`;

    res.json({
      ok: true,
      ...result,
      upload_url: `${base}/upload/${result.client_id}`
    });
  } catch (error) {
    console.error("[CLIENT REGISTER]", error);
    res.status(500).json({
      ok: false,
      error: "registration_failed"
    });
  }
});

router.post("/heartbeat", async (req, res) => {
  try {
    const token = req.headers["x-client-token"];
    if (!token) return res.status(401).json({ ok: false });

    const db = getPool();
    const [rows] = await db.execute(
      "SELECT client_id FROM clients WHERE client_token=?",
      [token]
    );

    if (!rows.length) return res.status(401).json({ ok: false });

    await db.execute(
      `UPDATE clients
       SET status='online',
           last_seen=CURRENT_TIMESTAMP,
           pc_name=?,
           hostname=?,
           printer_name=?
       WHERE client_token=?`,
      [
        req.body.pc_name || "",
        req.body.hostname || "",
        req.body.printer_name || "",
        token
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("[CLIENT HEARTBEAT]", error);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
