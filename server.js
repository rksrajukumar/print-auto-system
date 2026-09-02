const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const multer = require("multer");
const QRCode = require("qrcode");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";
const CLIENT_REGISTRATION_KEY = process.env.CLIENT_REGISTRATION_KEY || "RK-AutoPrint-2026-8xK9";
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");

app.use(cors());
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, {recursive:true});

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, Date.now()+"-"+crypto.randomBytes(6).toString("hex")+path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: {fileSize: 25*1024*1024},
  fileFilter: (_, file, cb) => {
    const ok = [".pdf",".jpg",".jpeg",".png"].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only PDF, JPG, JPEG and PNG files are allowed."), ok);
  }
});

let pool;
async function db(){
  if(pool) return pool;
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if(url){
    pool = mysql.createPool(url);
  } else {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "auto_print",
      waitForConnections:true, connectionLimit:5
    });
  }
  await initDb();
  return pool;
}
async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS clients(
    id INT AUTO_INCREMENT PRIMARY KEY, client_id VARCHAR(80) UNIQUE NOT NULL,
    client_token VARCHAR(160) NOT NULL, client_name VARCHAR(160), pc_name VARCHAR(160),
    hostname VARCHAR(160), printer_name VARCHAR(255), status VARCHAR(30) DEFAULT 'offline',
    last_seen DATETIME NULL, disabled TINYINT(1) DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS jobs(
    id INT AUTO_INCREMENT PRIMARY KEY, job_id VARCHAR(80) UNIQUE NOT NULL,
    client_id VARCHAR(80) NOT NULL, original_name VARCHAR(255), stored_name VARCHAR(255),
    file_path TEXT, printer_name VARCHAR(255), print_type VARCHAR(20) DEFAULT 'BW',
    copies INT DEFAULT 1, status VARCHAR(30) DEFAULT 'QUEUED', error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_settings(
    id INT PRIMARY KEY, upi_id VARCHAR(255), upi_number VARCHAR(30), business_name VARCHAR(255),
    base_amount DECIMAL(10,2) DEFAULT 0, bw_rate DECIMAL(10,2) DEFAULT 0,
    color_rate DECIMAL(10,2) DEFAULT 0, minimum_amount DECIMAL(10,2) DEFAULT 0
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_settings(
    id INT PRIMARY KEY, password_hash VARCHAR(255) NOT NULL
  )`);
  const [a] = await pool.query("SELECT id FROM admin_settings WHERE id=1");
  if(!a.length) await pool.query("INSERT INTO admin_settings(id,password_hash) VALUES(1,?)",[await bcrypt.hash(ADMIN_PASSWORD,10)]);
  const [p] = await pool.query("SELECT id FROM payment_settings WHERE id=1");
  if(!p.length) await pool.query("INSERT INTO payment_settings(id) VALUES(1)");
}
function auth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    if(!h.startsWith("Bearer ")) throw new Error();
    req.admin=jwt.verify(h.slice(7),JWT_SECRET); next();
  }catch{res.status(401).json({error:"Unauthorized"});}
}
function clientAuth(req,res,next){
  const key=req.headers["x-client-token"] || req.headers.authorization?.replace(/^Bearer /,"");
  if(!key) return res.status(401).json({error:"Client token required"});
  db().then(async p=>{
    const [rows]=await p.query("SELECT * FROM clients WHERE client_token=? AND disabled=0",[key]);
    if(!rows.length) return res.status(401).json({error:"Invalid client token"});
    req.client=rows[0]; next();
  }).catch(e=>res.status(500).json({error:e.message}));
}
async function settings(){
  const p=await db(); const [r]=await p.query("SELECT * FROM payment_settings WHERE id=1"); return r[0]||{};
}

app.get("/health", async (_,res)=>{ try{await db();res.json({ok:true,status:"online",time:new Date().toISOString()});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.use(express.static(path.join(__dirname,"public")));

app.post("/api/v1/admin/login", async(req,res)=>{
  try{
    const p=await db(); const [r]=await p.query("SELECT password_hash FROM admin_settings WHERE id=1");
    const ok=req.body.username===ADMIN_USERNAME && r.length && await bcrypt.compare(req.body.password||"",r[0].password_hash);
    if(!ok) return res.status(401).json({error:"Invalid username or password"});
    res.json({token:jwt.sign({username:ADMIN_USERNAME},JWT_SECRET,{expiresIn:"12h"})});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/v1/admin/change-password",auth,async(req,res)=>{
  try{
    if(!req.body.newPassword || req.body.newPassword.length<8) return res.status(400).json({error:"New password must be at least 8 characters"});
    const p=await db(); const [r]=await p.query("SELECT password_hash FROM admin_settings WHERE id=1");
    if(!await bcrypt.compare(req.body.currentPassword||"",r[0].password_hash)) return res.status(400).json({error:"Current password is incorrect"});
    await p.query("UPDATE admin_settings SET password_hash=? WHERE id=1",[await bcrypt.hash(req.body.newPassword,10)]);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get("/api/v1/admin/payment/default",auth,async(_,res)=>res.json({settings:await settings()}));
app.post("/api/v1/admin/payment/default",auth,async(req,res)=>{
  const p=await db(), b=req.body;
  await p.query(`UPDATE payment_settings SET upi_id=?,upi_number=?,business_name=?,base_amount=?,bw_rate=?,color_rate=?,minimum_amount=? WHERE id=1`,
    [b.upiId||"",b.upiNumber||"",b.businessName||"",Number(b.baseAmount||0),Number(b.bwRate||0),Number(b.colorRate||0),Number(b.minimumAmount||0)]);
  res.json({ok:true});
});
app.get("/api/v1/public/payment/default/qr.svg",async(req,res)=>{
  try{ const u=String(req.query.upiId||"").trim(); if(!u)return res.status(400).send("UPI ID required");
    const amount=Number(req.query.amount||0).toFixed(2);
    const uri=`upi://pay?pa=${encodeURIComponent(u)}&pn=${encodeURIComponent((await settings()).business_name||"Auto Print")}&am=${amount}&cu=INR`;
    res.type("svg").send(await QRCode.toString(uri,{type:"svg",margin:1,width:320}));
  }catch(e){res.status(500).send(e.message);}
});

app.post("/api/v1/client/register",async(req,res)=>{
  try{
    if(req.body.registrationKey!==CLIENT_REGISTRATION_KEY) return res.status(403).json({error:"Invalid registration key"});
    const p=await db(), id="CLIENT-"+crypto.randomBytes(6).toString("hex").toUpperCase(), token=crypto.randomBytes(48).toString("hex");
    await p.query(`INSERT INTO clients(client_id,client_token,client_name,pc_name,hostname,printer_name,status,last_seen)
      VALUES(?,?,?,?,?,?, 'online', NOW())`,
      [id,token,req.body.client_name||"",req.body.pc_name||"",req.body.hostname||"",req.body.printer_name||""]);
    res.json({client_id:id,client_token:token,upload_url:`${BASE_URL}/upload/${id}`});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/v1/client/heartbeat",clientAuth,async(req,res)=>{
  const p=await db();
  await p.query("UPDATE clients SET status='online',last_seen=NOW(),pc_name=?,hostname=?,printer_name=? WHERE client_id=?",
    [req.body.pc_name||req.client.pc_name,req.body.hostname||req.client.hostname,req.body.printer_name||req.client.printer_name,req.client.client_id]);
  res.json({ok:true});
});
app.get("/api/v1/client/jobs",clientAuth,async(req,res)=>{
  const p=await db(); const [rows]=await p.query("SELECT * FROM jobs WHERE client_id=? AND status='QUEUED' ORDER BY id LIMIT 10",[req.client.client_id]);
  res.json({jobs:rows.map(j=>({...j,download_url:`/api/v1/client/jobs/${j.job_id}/file`}))});
});
app.get("/api/v1/client/jobs/:jobId/file",clientAuth,async(req,res)=>{
  const p=await db(); const [r]=await p.query("SELECT * FROM jobs WHERE job_id=? AND client_id=?",[req.params.jobId,req.client.client_id]);
  if(!r.length)return res.status(404).send("Job not found"); if(!fs.existsSync(r[0].file_path))return res.status(404).send("File missing");
  res.download(r[0].file_path,r[0].original_name);
});
app.post("/api/v1/client/jobs/:jobId/status",clientAuth,async(req,res)=>{
  const allowed=["DOWNLOADING","PRINTING","COMPLETED","FAILED","QUEUED"];
  if(!allowed.includes(req.body.status))return res.status(400).json({error:"Invalid status"});
  const p=await db(); await p.query("UPDATE jobs SET status=?,error_message=? WHERE job_id=? AND client_id=?",[req.body.status,req.body.error_message||null,req.params.jobId,req.client.client_id]);
  if(req.body.status==="COMPLETED") {
    const [r]=await p.query("SELECT file_path FROM jobs WHERE job_id=?",[req.params.jobId]);
    if(r[0]?.file_path && fs.existsSync(r[0].file_path)) fs.unlinkSync(r[0].file_path);
  }
  res.json({ok:true});
});

app.get("/upload/:clientId",async(req,res)=>{
  res.sendFile(path.join(__dirname,"public","upload.html"));
});
app.get("/api/v1/public/client/:clientId",async(req,res)=>{
  const p=await db(); const [r]=await p.query("SELECT client_id,client_name,pc_name,printer_name,status FROM clients WHERE client_id=? AND disabled=0",[req.params.clientId]);
  if(!r.length)return res.status(404).json({error:"Client not found"}); res.json({client:r[0],payment:await settings()});
});
app.post("/api/v1/public/upload/:clientId",upload.single("file"),async(req,res)=>{
  try{
    const p=await db(); const [c]=await p.query("SELECT * FROM clients WHERE client_id=? AND disabled=0",[req.params.clientId]);
    if(!c.length){if(req.file)fs.unlinkSync(req.file.path);return res.status(404).json({error:"Client not found"});}
    if(!req.file)return res.status(400).json({error:"File required"});
    const job="JOB-"+Date.now()+"-"+crypto.randomBytes(4).toString("hex").toUpperCase();
    const copies=Math.max(1,Math.min(100,Number(req.body.copies||1)));
    const type=req.body.printType==="COLOR"?"COLOR":"BW";
    await p.query(`INSERT INTO jobs(job_id,client_id,original_name,stored_name,file_path,printer_name,print_type,copies,status)
      VALUES(?,?,?,?,?,?,?,?,'QUEUED')`,
      [job,req.params.clientId,req.file.originalname,req.file.filename,req.file.path,c[0].printer_name||"",type,copies]);
    res.json({ok:true,job_id:job,status:"QUEUED"});
  }catch(e){if(req.file&&fs.existsSync(req.file.path))fs.unlinkSync(req.file.path);res.status(500).json({error:e.message});}
});
app.get("/api/v1/public/job/:jobId",async(req,res)=>{
  const p=await db(); const [r]=await p.query("SELECT job_id,client_id,original_name,print_type,copies,status,error_message,created_at,updated_at FROM jobs WHERE job_id=?",[req.params.jobId]);
  if(!r.length)return res.status(404).json({error:"Job not found"});res.json({job:r[0]});
});

app.get("/api/v1/admin/clients",auth,async(_,res)=>{const p=await db();const [r]=await p.query("SELECT * FROM clients ORDER BY id DESC");res.json({clients:r});});
app.post("/api/v1/admin/clients/:id/disable",auth,async(req,res)=>{const p=await db();await p.query("UPDATE clients SET disabled=1,status='offline' WHERE client_id=?",[req.params.id]);res.json({ok:true});});
app.get("/api/v1/admin/jobs",auth,async(_,res)=>{const p=await db();const [r]=await p.query("SELECT * FROM jobs ORDER BY id DESC LIMIT 500");res.json({jobs:r});});
app.get("/api/v1/public/client/:clientId/qr.svg",async(req,res)=>{
  const url=`${BASE_URL}/upload/${encodeURIComponent(req.params.clientId)}`;
  res.type("svg").send(await QRCode.toString(url,{type:"svg",margin:1,width:360}));
});

app.use((err,req,res,next)=>{console.error(err);res.status(400).json({error:err.message||"Request failed"});});
app.listen(PORT,()=>console.log(`Auto Print Server listening on ${PORT}`));
