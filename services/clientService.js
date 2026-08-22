const crypto = require("crypto");
const { getPool } = require("./db");

async function registerClient(body) {
  const db = getPool();
  const clientId = "CLIENT-" + crypto.randomBytes(6).toString("hex").toUpperCase();
  const token = crypto.randomBytes(48).toString("hex");
  await db.execute(
    `INSERT INTO clients
    (client_id, client_token, client_name, pc_name, hostname, printer_name, status, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, 'online', NOW())`,
    [clientId, token, body.client_name||"", body.pc_name||"",
     body.hostname||"", body.printer_name||""]
  );
  return { client_id: clientId, client_token: token };
}
module.exports = { registerClient };
