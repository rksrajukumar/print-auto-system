const express = require("express");
const { getPool } = require("../services/db");
const { registerClient } = require("../services/clientService");
const router = express.Router();

router.post("/register", async (req,res)=>{
  try {
    const r = await registerClient(req.body || {});
    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT||10000}`;
    res.json({ok:true, ...r, upload_url:`${base}/upload/${r.client_id}`});
  } catch(e) { console.error(e); res.status(500).json({ok:false,error:"registration_failed"}); }
});

router.post("/heartbeat", async (req,res)=>{
  try {
    const token=req.headers["x-client-token"];
    const db=getPool();
    const [rows]=await db.execute("SELECT client_id FROM clients WHERE client_token=?",[token]);
    if(!rows.length) return res.status(401).json({ok:false});
    await db.execute(
      `UPDATE clients SET status='online', last_seen=NOW(), pc_name=?, hostname=?, printer_name=? WHERE client_token=?`,
      [req.body.pc_name||"",req.body.hostname||"",req.body.printer_name||"",token]
    );
    res.json({ok:true});
  } catch(e){res.status(500).json({ok:false});}
});
module.exports=router;
