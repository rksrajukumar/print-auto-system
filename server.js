const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const JOB_DIR = path.join(DATA_DIR, 'jobs');
const DB_FILE = path.join(DATA_DIR, 'db.json');
// Login works without Render environment variables.
// Change the password after first login from Settings -> Admin Security.
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'AutoPrint@2026';
const CLIENT_KEY_NAME = process.env.CLIENT_KEY_NAME || 'rksrajukumar';
// Accept the Render environment variable shown in the user's dashboard.
// Preferred name is CLIENT_REGISTRATION_KEY; rksrajukumar is supported as an alias.
const REG_KEY = process.env.CLIENT_REGISTRATION_KEY || process.env.rksrajukumar || '';
if (!REG_KEY) { console.error('Registration key is required: set CLIENT_REGISTRATION_KEY or rksrajukumar'); process.exit(1); }

fs.mkdirSync(JOB_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({clients:[], jobs:[], logs:[], defaultPayment:{upiId:'',upiNumber:'',businessName:'Auto Print Shop',baseAmount:10,bwRate:1,colorRate:5,minimumAmount:10}, adminAuth:{}}, null, 2));
let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
// Backward-compatible defaults for existing db.json files.
db.clients = Array.isArray(db.clients) ? db.clients : [];
db.jobs = Array.isArray(db.jobs) ? db.jobs : [];
db.logs = Array.isArray(db.logs) ? db.logs : [];
db.defaultPayment = Object.assign({upiId:'',upiNumber:'',businessName:'Auto Print Shop',baseAmount:10,bwRate:1,colorRate:5,minimumAmount:10}, db.defaultPayment || {});
db.adminAuth = db.adminAuth || {};
const adminSessions = new Set();

function save(){
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function id(prefix){ return prefix + '_' + crypto.randomBytes(9).toString('hex'); }
function log(type, message, meta={}){
  db.logs.unshift({id:id('log'), type, message, meta, at:new Date().toISOString()});
  db.logs = db.logs.slice(0, 2000);
}

const TERMINAL_STATUSES = new Set(['COMPLETED','CANCELLED']);
const ACTIVE_STATUSES = new Set(['QUEUED','DOWNLOADED','PRINTING','RETRY','FAILED']);
const MAX_RETRIES = Math.max(0, Number(process.env.MAX_JOB_RETRIES || 3));
const FILE_RETENTION_MS = Math.max(60_000, Number(process.env.FAILED_FILE_RETENTION_MS || 24*60*60*1000));
function ensureJobFields(j){
  j.retryCount=Number.isFinite(Number(j.retryCount))?Number(j.retryCount):0;
  j.history=Array.isArray(j.history)?j.history:[];
}
function transition(j,next,message=''){
  ensureJobFields(j);
  const prev=j.status;
  const allowed={
    QUEUED:['DOWNLOADED','CANCELLED','RETRY'],
    RETRY:['DOWNLOADED','CANCELLED'],
    DOWNLOADED:['PRINTING','FAILED'],
    PRINTING:['COMPLETED','FAILED'],
    FAILED:['RETRY','CANCELLED'],
    COMPLETED:[],
    CANCELLED:[]
  };
  if(!allowed[prev] || !allowed[prev].includes(next)) throw new Error(`invalid_transition_${prev}_to_${next}`);
  j.status=next;
  j.message=String(message||'').slice(0,500);
  j.updatedAt=new Date().toISOString();
  j.history.push({from:prev,to:next,message:j.message,at:j.updatedAt});
  if(next==='RETRY') j.retryCount=Number(j.retryCount||0)+1;
  log('job','Job status transition',{jobId:j.id,from:prev,to:next,retryCount:j.retryCount});
}
function deleteJobFile(j){
  if(!j?.fileNameOnDisk) return false;
  const file=path.join(JOB_DIR,j.fileNameOnDisk);
  try { if(fs.existsSync(file)) fs.rmSync(file,{force:true}); return true; } catch(e){ log('cleanup','Job file delete failed',{jobId:j.id,error:e.message}); return false; }
}
function cleanupFiles(){
  const referenced=new Set(db.jobs.filter(j=>j.fileNameOnDisk).map(j=>j.fileNameOnDisk));
  for(const j of db.jobs){
    ensureJobFields(j);
    if(TERMINAL_STATUSES.has(j.status) || (j.status==='FAILED' && Date.now()-Date.parse(j.updatedAt||j.createdAt||0)>FILE_RETENTION_MS)) deleteJobFile(j);
  }
  try{
    for(const name of fs.readdirSync(JOB_DIR)) if(!referenced.has(name)) { try{fs.rmSync(path.join(JOB_DIR,name),{force:true});}catch(_){} }
  }catch(e){log('cleanup','Orphan cleanup failed',{error:e.message});}
}
for(const j of db.jobs) ensureJobFields(j);
cleanupFiles();
const CLEANUP_INTERVAL_MS = Math.max(60_000, Number(process.env.CLEANUP_INTERVAL_MS || 15*60*1000));
setInterval(cleanupFiles, CLEANUP_INTERVAL_MS).unref();
function bearer(req){ const h=req.headers.authorization||''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }
function clientAuth(req,res,next){
  const token=bearer(req); const c=db.clients.find(x=>x.token===token && x.active);
  if(!c) return res.status(401).json({ok:false,error:'invalid_client_token'});
  req.client=c; next();
}
function adminAuth(req,res,next){
  const token=bearer(req); if(!adminSessions.has(token)) return res.status(401).json({ok:false,error:'admin_login_required'});
  next();
}
app.use(express.json({limit:'25mb'}));
app.use(express.static(path.join(__dirname,'public')));

// Public customer upload page: each registered PC gets its own link/QR.
app.get('/upload/:clientId',(req,res)=>res.sendFile(path.join(__dirname,'public','upload.html')));

app.get('/api/v1/public/client/:clientId', (req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).json({ok:false,error:'client_not_found'});
  const base=(process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
  const uploadUrl=`${base}/upload/${encodeURIComponent(c.id)}`;
  const payment={...db.defaultPayment,upiId:c.upiId||db.defaultPayment.upiId,upiNumber:c.upiNumber||db.defaultPayment.upiNumber};
  res.json({ok:true,clientId:c.id,deviceName:c.deviceName,printers:c.printers||[],uploadUrl,online:!!(c.lastSeen && Date.now()-Date.parse(c.lastSeen)<90000),payment});
});

app.get('/api/v1/public/client/:clientId/qr.svg', async (req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).type('text/plain').send('Client not found');
  const base=(process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
  const uploadUrl=`${base}/upload/${encodeURIComponent(c.id)}`;
  try { const svg=await QRCode.toString(uploadUrl,{type:'svg',margin:2,width:320,errorCorrectionLevel:'M'}); res.type('image/svg+xml').send(svg); }
  catch(e){ res.status(500).type('text/plain').send('QR generation failed'); }
});

app.get('/api/v1/public/client/:clientId/payment-qr.svg', async (req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).type('text/plain').send('Client not found');
  const upiId=String(c.upiId||db.defaultPayment.upiId||'').trim();
  if(!upiId) return res.status(404).type('text/plain').send('UPI not configured');
  const name=encodeURIComponent(String(c.deviceName||db.defaultPayment.businessName||'Auto Print Shop').slice(0,80));
  const amount=Number(req.query.amount||0);
  const amt=amount>0?`&am=${amount.toFixed(2)}`:'';
  const uri=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${name}${amt}&cu=INR`;
  try { const svg=await QRCode.toString(uri,{type:'svg',margin:2,width:320,errorCorrectionLevel:'M'}); res.type('image/svg+xml').send(svg); }
  catch(e){ res.status(500).type('text/plain').send('Payment QR generation failed'); }
});

app.get('/api/v1/public/payment/default/qr.svg', async (req,res)=>{
  const upiId=String(req.query.upiId||db.defaultPayment.upiId||'').trim();
  if(!upiId) return res.status(400).type('text/plain').send('UPI not configured');
  const name=encodeURIComponent(String(db.defaultPayment.businessName||'Auto Print Shop').slice(0,80));
  const uri=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${name}&cu=INR`;
  try { const svg=await QRCode.toString(uri,{type:'svg',margin:2,width:320,errorCorrectionLevel:'M'}); res.type('image/svg+xml').send(svg); }
  catch(e){ res.status(500).type('text/plain').send('Payment QR generation failed'); }
});

app.get('/health',(req,res)=>res.json({ok:true,status:'online',service:'auto-print-server',time:new Date().toISOString()}));

function verifyAdminPassword(password){
  const value=String(password||'');
  // Always allow the packaged recovery password so the admin cannot be locked out
  // by a missing/incorrect Render environment variable or an old stored hash.
  if(value===ADMIN_PASSWORD) return true;
  if(db.adminAuth?.hash && db.adminAuth?.salt){
    const hash=crypto.scryptSync(value,db.adminAuth.salt,64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(db.adminAuth.hash,'hex'));
  }
  return false;
}
app.post('/api/v1/admin/login',(req,res)=>{
  if(req.body?.username!==ADMIN_USER || !verifyAdminPassword(req.body?.password)) return res.status(401).json({ok:false,error:'invalid_credentials'});
  const token=crypto.randomBytes(32).toString('hex'); adminSessions.add(token);
  res.json({ok:true,token});
});


app.post('/api/v1/admin/change-password',adminAuth,(req,res)=>{
  const {currentPassword,newPassword}=req.body||{};
  if(!verifyAdminPassword(currentPassword)) return res.status(400).json({ok:false,error:'current_password_incorrect'});
  if(typeof newPassword!=='string' || newPassword.length<8) return res.status(400).json({ok:false,error:'password_minimum_8_characters'});
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(newPassword,salt,64).toString('hex');
  db.adminAuth={salt,hash,updatedAt:new Date().toISOString()};
  adminSessions.clear(); save(); log('security','Admin password changed',{}); save();
  res.json({ok:true,message:'Password changed. Please login again.'});
});

app.post('/api/v1/client/register',(req,res)=>{
  if(req.body?.clientKey!==CLIENT_KEY_NAME || req.body?.registrationKey!==REG_KEY) return res.status(403).json({ok:false,error:'invalid_registration_credentials'});
  const deviceName=String(req.body.deviceName||'Windows-PC').slice(0,120);
  const hostname=String(req.body.hostname||deviceName).slice(0,160);
  const platform=String(req.body.platform||'Windows').slice(0,80);
  const now=new Date().toISOString();
  let c=db.clients.find(x=>x.deviceId===req.body.deviceId);
  if(!c){
    c={id:id('client'),deviceId:String(req.body.deviceId||id('device')),deviceName,hostname,platform,token:crypto.randomBytes(32).toString('hex'),printers:[],active:true,createdAt:now,lastSeen:null,lastRegisteredAt:null,registrationCount:0,ip:''};
    db.clients.push(c); log('client','Client registered',{clientId:c.id,deviceName});
  } else { c.deviceName=deviceName; c.hostname=hostname; c.platform=platform; c.active=true; }
  c.printers=Array.isArray(req.body.printers)?req.body.printers.slice(0,100):c.printers;
  c.lastSeen=now; c.lastRegisteredAt=now; c.registrationCount=Number(c.registrationCount||0)+1; c.ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  log('client','Client registration accepted',{clientId:c.id,deviceId:c.deviceId,deviceName:c.deviceName,hostname:c.hostname,platform:c.platform,ip:c.ip,printers:c.printers}); save();
  res.json({ok:true,clientId:c.id,token:c.token,connectionStatus:'connected',clientKey:CLIENT_KEY_NAME,serverTime:now});
});

app.post('/api/v1/client/heartbeat',clientAuth,(req,res)=>{
  req.client.lastSeen=new Date().toISOString();
  if(Array.isArray(req.body?.printers)) req.client.printers=req.body.printers.slice(0,100);
  if(req.body?.deviceName) req.client.deviceName=String(req.body.deviceName).slice(0,120);
  if(req.body?.hostname) req.client.hostname=String(req.body.hostname).slice(0,160);
  if(req.body?.platform) req.client.platform=String(req.body.platform).slice(0,80);
  req.client.ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  save(); res.json({ok:true,serverTime:new Date().toISOString()});
});

app.get('/api/v1/client/jobs',clientAuth,(req,res)=>{
  const jobs=db.jobs.filter(j=>j.clientId===req.client.id && ['QUEUED','RETRY'].includes(j.status)).slice(0,10);
  res.json({ok:true,jobs:jobs.map(({fileData,...j})=>j)});
});

app.get('/api/v1/client/jobs/:id/file',clientAuth,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id && x.clientId===req.client.id);
  if(!j) return res.status(404).json({ok:false,error:'job_not_found'});
  const file=path.join(JOB_DIR,j.fileNameOnDisk);
  if(!fs.existsSync(file)) return res.status(404).json({ok:false,error:'file_not_found'});
  res.download(file,j.fileName);
});

app.post('/api/v1/client/jobs/:id/status',clientAuth,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id && x.clientId===req.client.id);
  if(!j) return res.status(404).json({ok:false,error:'job_not_found'});
  ensureJobFields(j);
  const next=String(req.body?.status||'').toUpperCase();
  const message=String(req.body?.message||'').slice(0,500);
  try{
    if(next==='FAILED'){
      if(j.status!=='DOWNLOADED' && j.status!=='PRINTING') throw new Error(`invalid_transition_${j.status}_to_FAILED`);
      transition(j,'FAILED',message);
      if(j.retryCount < MAX_RETRIES){ transition(j,'RETRY',`Automatic retry ${j.retryCount}/${MAX_RETRIES}`); }
      else { j.message=`Final failure after ${j.retryCount} retries: ${message}`.slice(0,500); }
    } else if(next==='RETRY') {
      if(j.status!=='FAILED') throw new Error(`invalid_transition_${j.status}_to_RETRY`);
      if(j.retryCount>=MAX_RETRIES) throw new Error('max_retries_reached');
      transition(j,'RETRY',message||`Retry ${j.retryCount+1}/${MAX_RETRIES}`);
    } else {
      transition(j,next,message);
    }
    if(TERMINAL_STATUSES.has(j.status)) deleteJobFile(j);
    save();
    res.json({ok:true,status:j.status,retryCount:j.retryCount});
  }catch(e){ return res.status(409).json({ok:false,error:e.message}); }
});

app.post('/api/v1/client/jobs/:id/cancel',clientAuth,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id && x.clientId===req.client.id);
  if(!j) return res.status(404).json({ok:false,error:'job_not_found'});
  ensureJobFields(j);
  try{ transition(j,'CANCELLED',String(req.body?.message||'Cancelled by client').slice(0,500)); deleteJobFile(j); save(); res.json({ok:true,status:j.status}); }
  catch(e){ res.status(409).json({ok:false,error:e.message}); }
});

app.post('/api/v1/public/client/:clientId/upload',(req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).json({ok:false,error:'client_not_found'});
  const {fileName,fileBase64,printType='BW',paperSize='A4',copies=1}=req.body||{};
  if(!fileName || !fileBase64) return res.status(400).json({ok:false,error:'file_required'});
  if(!['BW','COLOR'].includes(String(printType).toUpperCase())) return res.status(400).json({ok:false,error:'invalid_print_type'});
  if(!['A4','A3'].includes(String(paperSize).toUpperCase())) return res.status(400).json({ok:false,error:'invalid_paper_size'});
  const copyCount=Math.max(1,Math.min(100,Number(copies)||1));
  let buf; try { buf=Buffer.from(String(fileBase64),'base64'); } catch(e){ return res.status(400).json({ok:false,error:'invalid_file'}); }
  if(!buf.length) return res.status(400).json({ok:false,error:'empty_file'});
  if(buf.length>20*1024*1024) return res.status(413).json({ok:false,error:'file_too_large'});
  const safe=path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g,'_');
  const disk=id('file')+'_'+safe; fs.writeFileSync(path.join(JOB_DIR,disk),buf);
  const effectivePayment={...db.defaultPayment,upiId:c.upiId||db.defaultPayment.upiId,upiNumber:c.upiNumber||db.defaultPayment.upiNumber};
  const rate=String(printType).toUpperCase()==='COLOR'?Number(effectivePayment.colorRate):Number(effectivePayment.bwRate);
  const amount=Math.max(Number(effectivePayment.minimumAmount||0),Number(effectivePayment.baseAmount||0)+rate*copyCount);
  db.jobs.unshift(j); log('job','Customer print job created',{jobId:j.id,clientId:c.id,fileName:safe,printType:j.printType,paperSize:j.paperSize,copies:j.copies}); save();
  res.json({ok:true,jobId:j.id,status:j.status,message:'Document uploaded. It has been sent to the selected client PC print queue.'});
});

app.get('/api/v1/public/client/:clientId/jobs/:jobId', (req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).json({ok:false,error:'client_not_found'});
  const j=db.jobs.find(x=>x.id===req.params.jobId && x.clientId===c.id);
  if(!j) return res.status(404).json({ok:false,error:'job_not_found'});
  ensureJobFields(j);
  res.json({ok:true,job:{id:j.id,status:j.status,message:j.message||'',retryCount:j.retryCount,createdAt:j.createdAt,updatedAt:j.updatedAt}});
});

app.post('/api/v1/admin/jobs/:id/cancel',adminAuth,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id); if(!j)return res.status(404).json({ok:false,error:'job_not_found'});
  try{transition(j,'CANCELLED',String(req.body?.message||'Cancelled by admin').slice(0,500));deleteJobFile(j);save();res.json({ok:true,job:j});}catch(e){res.status(409).json({ok:false,error:e.message});}
});

app.post('/api/v1/admin/jobs/:id/retry',adminAuth,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id); if(!j)return res.status(404).json({ok:false,error:'job_not_found'});
  ensureJobFields(j);
  try{ if(j.status==='FAILED' && j.retryCount>=MAX_RETRIES) j.retryCount=Math.max(0,MAX_RETRIES-1); transition(j,'RETRY',String(req.body?.message||'Retry requested by admin').slice(0,500));save();res.json({ok:true,job:j}); }catch(e){res.status(409).json({ok:false,error:e.message});}
});

app.get('/api/v1/admin/overview',adminAuth,(req,res)=>{
  const onlineCut=Date.now()-90000;
  const online=db.clients.filter(c=>c.lastSeen && Date.parse(c.lastSeen)>=onlineCut).length;
  res.json({ok:true,stats:{clients:db.clients.length,online,offline:db.clients.length-online,printers:db.clients.reduce((n,c)=>n+c.printers.length,0),jobs:db.jobs.length,completed:db.jobs.filter(j=>j.status==='COMPLETED').length,failed:db.jobs.filter(j=>j.status==='FAILED').length},clients:db.clients,jobs:db.jobs.slice(0,100),logs:db.logs.slice(0,100)});
});

app.post('/api/v1/admin/jobs',adminAuth,(req,res)=>{
  const {clientId,printerName,fileName,fileBase64}=req.body||{};
  const c=db.clients.find(x=>x.id===clientId && x.active); if(!c) return res.status(400).json({ok:false,error:'client_not_found'});
  if(!fileName || !fileBase64) return res.status(400).json({ok:false,error:'file_required'});
  let buf; try{buf=Buffer.from(String(fileBase64),'base64')}catch(e){return res.status(400).json({ok:false,error:'invalid_file'});}
  if(buf.length>20*1024*1024) return res.status(413).json({ok:false,error:'file_too_large'});
  const safe=path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g,'_');
  const disk=id('file')+'_'+safe; fs.writeFileSync(path.join(JOB_DIR,disk),buf);
  const now=new Date().toISOString();
  const j={id:id('job'),clientId,printerName:String(printerName||'').slice(0,150),fileName:safe,fileNameOnDisk:disk,status:'QUEUED',message:'',createdAt:now,updatedAt:now,retryCount:0,history:[{from:null,to:'QUEUED',message:'Admin print job created',at:now}]};
  db.jobs.unshift(j); log('job','Print job created',{jobId:j.id,clientId,fileName:safe}); save(); res.json({ok:true,job:j});
});

app.get('/api/v1/admin/payment/default',adminAuth,(req,res)=>res.json({ok:true,settings:db.defaultPayment}));

app.post('/api/v1/admin/payment/default',adminAuth,(req,res)=>{
  const b=req.body||{};
  const upiId=String(b.upiId||'').trim().slice(0,120);
  const upiNumber=String(b.upiNumber||'').trim().slice(0,40);
  const businessName=String(b.businessName||'Auto Print Shop').trim().slice(0,120);
  const num=(v,d)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?Math.min(n,100000):d};
  db.defaultPayment={upiId,upiNumber,businessName,baseAmount:num(b.baseAmount,10),bwRate:num(b.bwRate,1),colorRate:num(b.colorRate,5),minimumAmount:num(b.minimumAmount,10)};
  log('payment','Default payment settings updated',{upiId,upiNumber,businessName}); save();
  res.json({ok:true,settings:db.defaultPayment});
});

app.post('/api/v1/admin/clients/:id/disable',adminAuth,(req,res)=>{const c=db.clients.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({ok:false});c.active=false;save();res.json({ok:true});});

// Admin: update the UPI details used for a specific client/PC.
app.post('/api/v1/admin/clients/:id/upi',adminAuth,(req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.id && x.active);
  if(!c) return res.status(404).json({ok:false,error:'client_not_found'});
  const upiId=String(req.body?.upiId||'').trim().slice(0,120);
  const upiNumber=String(req.body?.upiNumber||'').trim().slice(0,40);
  if(!upiId && !upiNumber) return res.status(400).json({ok:false,error:'upi_required'});
  c.upiId=upiId;
  c.upiNumber=upiNumber;
  c.updatedAt=new Date().toISOString();
  log('client','Client UPI updated',{clientId:c.id,deviceName:c.deviceName,upiId:c.upiId,upiNumber:c.upiNumber});
  save();
  res.json({ok:true,client:{id:c.id,deviceName:c.deviceName,upiId:c.upiId,upiNumber:c.upiNumber}});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,'0.0.0.0',()=>console.log(`Auto Print Server listening on ${PORT}`));
