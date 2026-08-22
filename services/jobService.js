const crypto = require("crypto");
const { getPool } = require("./db");
async function createJob(d) {
  const db = getPool();
  const jobId = "JOB-" + Date.now().toString(36).toUpperCase() + "-" +
                crypto.randomBytes(3).toString("hex").toUpperCase();
  await db.execute(
    `INSERT INTO jobs
    (job_id, client_id, file_name, file_path, print_type, paper_size, copies, amount, payment_status, job_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'queued')`,
    [jobId,d.client_id,d.file_name,d.file_path,d.print_type,d.paper_size,d.copies,d.amount]
  );
  return jobId;
}
module.exports = { createJob };
