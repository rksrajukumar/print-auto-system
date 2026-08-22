const express = require("express");
const { getPool } = require("../services/db");
const router=express.Router();

router.get("/clients", async (req,res)=>{
  const db=getPool();
  await db.execute(`UPDATE clients SET status='offline'
    WHERE last_seen IS NULL OR last_seen < (NOW() - INTERVAL ? SECOND)`,
    [Number(process.env.OFFLINE_AFTER_SECONDS||90)]);
  const [rows]=await db.query(`SELECT client_id,client_name,pc_name,hostname,printer_name,status,last_seen,created_at
    FROM clients ORDER BY id DESC`);
  res.json({ok:true,clients:rows});
});
router.get("/jobs",async(req,res)=>{
  const [rows]=await getPool().query("SELECT * FROM jobs ORDER BY id DESC LIMIT 200");
  res.json({ok:true,jobs:rows});
});
router.get("/stats",async(req,res)=>{
  const db=getPool();
  const [[a]]=await db.query("SELECT COUNT(*) total FROM clients");
  const [[b]]=await db.query("SELECT COUNT(*) active FROM clients WHERE status='online'");
  const [[c]]=await db.query("SELECT COUNT(*) total FROM jobs");
  const [[d]]=await db.query("SELECT COUNT(*) pending FROM jobs WHERE job_status IN ('queued','sent','printing')");
  res.json({totalClients:a.total,activeClients:b.active,totalJobs:c.total,pendingJobs:d.pending});
});
module.exports=router;
