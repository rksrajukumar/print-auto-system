const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true, limit:'2mb'}));
const PORT = Number(process.env.PORT || 8080);
const BASE = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'CHANGE_THIS_ADMIN_KEY';
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname,'..','uploads'));
fs.mkdirSync(UPLOAD_DIR,{recursive:true});
app.use(express.static(path.join(__dirname,'public')));

const upload = multer({storage: multer.diskStorage({
  destination: (_req,_file,cb)=>cb(null,UPLOAD_DIR),
  filename: (_req,file,cb)=>cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${path.basename(file.originalname)}`)
})}); // intentionally no file-size limit

let pool;
async function getPool(){
  if(pool) return pool;
  pool = mysql.createPool({
    host:process.env.MYSQL_HOST||'127.0.0.1', port:Number(process.env.MYSQL_PORT||3306),
    user:process.env.MYSQL_USER||'auto_print', password:process.env.MYSQL_PASSWORD||'',
    database:process.env.MYSQL_DATABASE||'auto_print', waitForConnections:true, connectionLimit:10
  });
  await pool.query('SELECT 1');
  return pool;
}

const clients = new Map();
const jobs = new Map();
const sockets = new Map();
const defaultPayment = () => ({
  name: process.env.DEFAULT_UPI_NAME || 'Auto Print Server',
  upi_id: process.env.DEFAULT_UPI_ID || '',
  upi_number: process.env.DEFAULT_UPI_NUMBER || ''
});
const paymentFor = c => ({
  name: defaultPayment().name,
  upi_id: (c && c.upi_id) || defaultPayment().upi_id,
  upi_number: (c && c.upi_number) || defaultPayment().upi_number,
  qr_text: (c && c.qr_text) || ''
});
const id = () => crypto.randomBytes(10).toString('hex');
const adminAuth = (req,res,next) => {
  if(req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({error:'Unauthorized'});
  next();
};

async function saveClient(c){
  try{const p=await getPool(); await p.query(
    `INSERT INTO clients(id,name,token,upi_id,upi_number,qr_text,enabled,online,last_seen)
     VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),token=VALUES(token),upi_id=VALUES(upi_id),upi_number=VALUES(upi_number),qr_text=VALUES(qr_text),enabled=VALUES(enabled),online=VALUES(online),last_seen=VALUES(last_seen)`,
    [c.id,c.name,c.token,c.upi_id,c.upi_number,c.qr_text||'',c.enabled?1:0,c.online?1:0,c.last_seen?new Date(c.last_seen):null]
  );}catch(e){console.warn('DB client save skipped:',e.message)}
}
async function saveJob(j){
  try{const p=await getPool(); await p.query(
    `INSERT INTO jobs(id,client_id,original_name,stored_path,print_type,paper,copies,status) VALUES(?,?,?,?,?,?,?,?)`,
    [j.id,j.client_id,j.original_name,j.stored_path,j.options.print_type||'B/W',j.options.paper||'A4',Number(j.options.copies||1),j.status]
  );}catch(e){console.warn('DB job save skipped:',e.message)}
}

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'auto-print-server',time:new Date().toISOString()}));
app.get('/api/client/:id', (req,res)=>{
  const c=clients.get(req.params.id); if(!c||!c.enabled) return res.status(404).json({error:'Client not found'});
  res.json({id:c.id,name:c.name,upload_url:`${BASE}/upload/${c.id}`,payment:paymentFor(c)});
});
app.get('/upload/:id',(req,res)=>{
  if(!clients.has(req.params.id)) return res.status(404).send('Client not found');
  res.sendFile(path.join(__dirname,'public','customer.html'));
});

app.post('/api/client/register', async (req,res)=>{
  const {id:clientId,name,token}=req.body||{};
  if(!clientId||!token) return res.status(400).json({error:'id and token required'});
  let c=clients.get(clientId);
  if(c && c.token!==token) return res.status(403).json({error:'Invalid token'});
  c=c||{id:clientId,name:name||clientId,token,upi_id:'',upi_number:'',qr_text:'',enabled:true,online:false};
  c.name=name||c.name; c.online=true; c.last_seen=Date.now(); clients.set(c.id,c); await saveClient(c);
  res.json({ok:true,client_id:c.id,payment:paymentFor(c)});
});

app.post('/api/client/:id/heartbeat', async (req,res)=>{
  const c=clients.get(req.params.id);
  if(!c||c.token!==req.body.token) return res.status(403).json({error:'Invalid client'});
  c.online=true;c.last_seen=Date.now();clients.set(c.id,c);await saveClient(c);res.json({ok:true});
});

app.post('/api/upload/:id', upload.single('document'), async (req,res)=>{
  const c=clients.get(req.params.id);
  if(!c||!c.enabled) return res.status(404).json({error:'Client not found'});
  if(!req.file) return res.status(400).json({error:'Document is required'});
  const job={id:id(),client_id:c.id,original_name:req.file.originalname,stored_path:req.file.path,status:'queued',created_at:Date.now(),options:{print_type:req.body.print_type||'B/W',paper:req.body.paper||'A4',copies:req.body.copies||1}};
  jobs.set(job.id,job); await saveJob(job);
  sendJob(c.id,job);
  res.json({ok:true,job_id:job.id,message:'Job created. Payment is outside the server; no payment confirmation is requested.'});
});

app.get('/api/job/:id/file', (req,res)=>{
  const j=jobs.get(req.params.id); if(!j||!fs.existsSync(j.stored_path)) return res.status(404).end();
  res.download(j.stored_path,j.original_name);
});

app.get('/api/admin/payment',adminAuth,(_req,res)=>res.json(defaultPayment()));
app.get('/api/admin/clients',adminAuth,(_req,res)=>res.json([...clients.values()].map(c=>({id:c.id,name:c.name,online:!!c.online,last_seen:c.last_seen,enabled:c.enabled,upload_url:`${BASE}/upload/${c.id}`,payment:paymentFor(c)}))));
app.post('/api/admin/client',adminAuth,async(req,res)=>{
  const clientId=req.body.id||`PC${String(clients.size+1).padStart(3,'0')}`;
  if(clients.has(clientId)) return res.status(409).json({error:'Client ID already exists'});
  const c={id:clientId,name:req.body.name||clientId,token:crypto.randomBytes(24).toString('hex'),upi_id:req.body.upi_id||'',upi_number:req.body.upi_number||'',qr_text:req.body.qr_text||'',enabled:true,online:false};
  clients.set(c.id,c); await saveClient(c);
  res.json({ok:true,client:{id:c.id,name:c.name,token:c.token,upload_url:`${BASE}/upload/${c.id}`,payment:paymentFor(c)}});
});
app.put('/api/admin/client/:id/payment',adminAuth,async(req,res)=>{
  const c=clients.get(req.params.id); if(!c)return res.status(404).json({error:'Client not found'});
  c.upi_id=req.body.upi_id||'';c.upi_number=req.body.upi_number||'';c.qr_text=req.body.qr_text||'';clients.set(c.id,c);await saveClient(c);res.json({ok:true,payment:paymentFor(c)});
});
app.post('/api/admin/client/:id/enable',adminAuth,async(req,res)=>{const c=clients.get(req.params.id);if(!c)return res.status(404).json({error:'Client not found'});c.enabled=req.body.enabled!==false;clients.set(c.id,c);await saveClient(c);res.json({ok:true,enabled:c.enabled});});
app.get('/api/qr/client/:id',async(req,res)=>{const c=clients.get(req.params.id);if(!c)return res.status(404).end();res.type('png');QRCode.toFileStream(res,`${BASE}/upload/${c.id}`,{width:600,margin:2});});
app.get('/api/qr/payment/:id',async(req,res)=>{const c=clients.get(req.params.id);if(!c)return res.status(404).end();const p=paymentFor(c);const text=p.qr_text||`upi://pay?pa=${encodeURIComponent(p.upi_id)}&pn=${encodeURIComponent(p.name)}`;res.type('png');QRCode.toFileStream(res,text,{width:600,margin:2});});


// Admin dashboard routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const httpServer=app.listen(PORT,()=>console.log(`Auto Print Server running on ${BASE}`));
const wss=new WebSocketServer({server:httpServer,path:'/ws'});
function sendJob(clientId,j){const ws=sockets.get(clientId);if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'job',job:{id:j.id,filename:j.original_name,download:`${BASE}/api/job/${j.id}/file`,options:j.options}}));j.status='sent';}}
wss.on('connection',(ws)=>{
  let cid=null;
  ws.on('message',raw=>{try{const m=JSON.parse(raw.toString());
    if(m.type==='hello'){cid=m.client_id;const c=clients.get(cid);if(!c||c.token!==m.token){ws.close();return;}sockets.set(cid,ws);c.online=true;c.last_seen=Date.now();clients.set(cid,c);saveClient(c);ws.send(JSON.stringify({type:'hello_ack',client_id:cid}));
      for(const j of jobs.values()) if(j.client_id===cid && ['queued','sent'].includes(j.status)) sendJob(cid,j);
    }
    if(m.type==='status'&&m.job_id){const j=jobs.get(m.job_id);if(!j||j.client_id!==cid)return;j.status=m.status; if(['printed','cancelled','error'].includes(j.status)){setTimeout(()=>{try{fs.unlinkSync(j.stored_path)}catch(_e){}},250);}}
  }catch(_e){}});
  ws.on('close',()=>{if(cid){sockets.delete(cid);const c=clients.get(cid);if(c){c.online=false;c.last_seen=Date.now();clients.set(cid,c);saveClient(c);}}});
});

// Auto-cancel queued jobs when the target PC has not responded for 5 minutes.
setInterval(()=>{const now=Date.now();for(const j of jobs.values()){
  if(['printed','cancelled','error'].includes(j.status)) continue;
  const c=clients.get(j.client_id);
  if(c && (!c.online || !sockets.has(j.client_id)) && now-j.created_at>=5*60*1000){j.status='cancelled';try{fs.unlinkSync(j.stored_path)}catch(_e){}}
}},30000);


// Root route: open the admin dashboard directly at /
