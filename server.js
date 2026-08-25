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
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CHANGE_ME';
const CLIENT_KEY_NAME = process.env.CLIENT_KEY_NAME || 'rksrajukumar';
// Accept the Render environment variable shown in the user's dashboard.
// Preferred name is CLIENT_REGISTRATION_KEY; rksrajukumar is supported as an alias.
const REG_KEY = process.env.CLIENT_REGISTRATION_KEY || process.env.rksrajukumar || '';
const ENV_DEFAULT_UPI_ID = process.env.DEFAULT_UPI_ID || '9097676711@upi';
const ENV_DEFAULT_UPI_QR = process.env.DEFAULT_UPI_QR || '';
const RATES = {
  BW_A4: Number(process.env.RATE_BW_A4 || 5),
  COLOR_A4: Number(process.env.RATE_COLOR_A4 || 10),
  BW_A3: Number(process.env.RATE_BW_A3 || 10),
  COLOR_A3: Number(process.env.RATE_COLOR_A3 || 20)
};
if (!REG_KEY) { console.error('Registration key is required: set CLIENT_REGISTRATION_KEY or rksrajukumar'); process.exit(1); }

fs.mkdirSync(JOB_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({clients:[], jobs:[], logs:[]}, null, 2));
let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
if (!db.settings) db.settings = {};
if (db.settings.defaultUpiId === undefined) db.settings.defaultUpiId = ENV_DEFAULT_UPI_ID;
if (db.settings.defaultUpiQr === undefined) db.settings.defaultUpiQr = ENV_DEFAULT_UPI_QR;
function defaultUpi(){ return {upiId: db.settings.defaultUpiId || ENV_DEFAULT_UPI_ID, upiQr: db.settings.defaultUpiQr || ENV_DEFAULT_UPI_QR}; }
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
  res.json({ok:true,clientId:c.id,deviceName:c.deviceName,printers:c.printers||[],uploadUrl,online:!!(c.lastSeen && Date.now()-Date.parse(c.lastSeen)<90000),upiId:c.upiId||defaultUpi().upiId,upiQr:c.upiQr||defaultUpi().upiQr,rates:RATES});
});

app.get('/api/v1/public/client/:clientId/qr.svg', async (req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).type('text/plain').send('Client not found');
  const base=(process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
  const uploadUrl=`${base}/upload/${encodeURIComponent(c.id)}`;
  try { const svg=await QRCode.toString(uploadUrl,{type:'svg',margin:2,width:320,errorCorrectionLevel:'M'}); res.type('image/svg+xml').send(svg); }
  catch(e){ res.status(500).type('text/plain').send('QR generation failed'); }
});

app.get('/health',(req,res)=>res.json({ok:true,status:'online',service:'auto-print-server',time:new Date().toISOString()}));

app.post('/api/v1/admin/login',(req,res)=>{
  if(req.body?.username!==ADMIN_USER || req.body?.password!==ADMIN_PASSWORD) return res.status(401).json({ok:false,error:'invalid_credentials'});
  const token=crypto.randomBytes(32).toString('hex'); adminSessions.add(token);
  res.json({ok:true,token});
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
  const jobs=db.jobs.filter(j=>j.clientId===req.client.id && j.printAuthorized===true && ['QUEUED','RETRY'].includes(j.status)).slice(0,10);
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
  const allowed=['DOWNLOADED','PRINTING','COMPLETED','FAILED','RETRY'];
  if(!allowed.includes(req.body?.status)) return res.status(400).json({ok:false,error:'invalid_status'});
  j.status=req.body.status; j.message=String(req.body.message||'').slice(0,500); j.updatedAt=new Date().toISOString();
  log('job','Job status updated',{jobId:j.id,status:j.status,clientId:req.client.id}); save();
  res.json({ok:true});
});

app.post('/api/v1/public/client/:clientId/upload',(req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.clientId && x.active);
  if(!c) return res.status(404).json({ok:false,error:'client_not_found'});
  const {fileName,fileBase64,printType='BW',paperSize='A4',copies=1}=req.body||{};
  if(!fileName || !fileBase64) return res.status(400).json({ok:false,error:'file_required'});
  const pt=String(printType).toUpperCase(), ps=String(paperSize).toUpperCase();
  if(!['BW','COLOR'].includes(pt)) return res.status(400).json({ok:false,error:'invalid_print_type'});
  if(!['A4','A3'].includes(ps)) return res.status(400).json({ok:false,error:'invalid_paper_size'});
  const copyCount=Math.max(1,Math.min(100,Number(copies)||1));
  let buf; try { buf=Buffer.from(String(fileBase64),'base64'); } catch(e){ return res.status(400).json({ok:false,error:'invalid_file'}); }
  if(!buf.length) return res.status(400).json({ok:false,error:'empty_file'});
  if(buf.length>20*1024*1024) return res.status(413).json({ok:false,error:'file_too_large'});
  const safe=path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g,'_');
  const disk=id('file')+'_'+safe; fs.writeFileSync(path.join(JOB_DIR,disk),buf);
  const rate=Number(RATES[`${pt}_${ps}`]||0); const amount=Number((rate*copyCount).toFixed(2));
  const j={id:id('job'),clientId:c.id,printerName:String((c.printers&&c.printers[0])||'').slice(0,150),fileName:safe,fileNameOnDisk:disk,status:'PAYMENT_PENDING',paymentStatus:'PENDING',paymentReference:'',amount,rate,printAuthorized:false,message:'Complete UPI payment. Return to this page and press I HAVE PAID.',printType:pt,paperSize:ps,copies:copyCount,source:'customer_qr',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  db.jobs.unshift(j); log('job','Customer print job created; payment pending',{jobId:j.id,clientId:c.id,amount,printType:pt,paperSize:ps,copies:copyCount}); save();
  const defs=defaultUpi(); const upiId=c.upiId||defs.upiId, upiQr=c.upiQr||defs.upiQr;
  const upiLink=upiId?`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(c.deviceName||'Auto Print')}&am=${amount.toFixed(2)}&cu=INR`:''; res.json({ok:true,jobId:j.id,status:j.status,paymentStatus:j.paymentStatus,amount,upiId,upiQr,upiLink,printNow:false,message:'Complete UPI payment. After returning to this page, press I HAVE PAID.'});
});

app.get('/api/v1/public/job/:jobId',(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.jobId);
  if(!j || j.source!=='customer_qr') return res.status(404).json({ok:false,error:'job_not_found'});
  res.json({ok:true,jobId:j.id,clientId:j.clientId,fileName:j.fileName,amount:j.amount,paymentStatus:j.paymentStatus,status:j.status,printAuthorized:!!j.printAuthorized,paymentReference:j.paymentReference||'',message:j.message||''});
});

app.post('/api/v1/public/job/:jobId/i-have-paid',(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.jobId && x.source==='customer_qr');
  if(!j) return res.status(404).json({ok:false,error:'job_not_found'});
  j.paymentStatus='CUSTOMER_MARKED_PAID'; j.status='PAYMENT_REPORTED'; j.paymentReference=''; j.message='Customer marked payment as completed.'; j.updatedAt=new Date().toISOString(); save();
  res.json({ok:true,paymentStatus:j.paymentStatus,printNow:false,message:'Payment marked. Press PRINT NOW to send the job to the shop computer.'});
});

app.post('/api/v1/public/job/:jobId/print-now',(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.jobId && x.source==='customer_qr');
  if(!j) return res.status(404).json({ok:false,error:'job_not_found'});
  if(j.paymentStatus!=='CUSTOMER_MARKED_PAID') return res.status(403).json({ok:false,error:'payment_not_marked_paid',printNow:false});
  j.printAuthorized=true; j.status='QUEUED'; j.message='PRINT NOW confirmed; waiting for client printer.'; j.updatedAt=new Date().toISOString(); save();
  res.json({ok:true,printNow:true,status:j.status});
});

app.post('/api/v1/admin/clients/:id/payment-settings',adminAuth,(req,res)=>{
  const c=db.clients.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ok:false,error:'client_not_found'});
  if(req.body?.upiId!==undefined) c.upiId=String(req.body.upiId||'').trim().slice(0,120);
  if(req.body?.upiQr!==undefined){
    const qr=String(req.body.upiQr||'');
    if(qr && !/^data:image\/(png|jpeg|webp);base64,/i.test(qr)) return res.status(400).json({ok:false,error:'upi_qr_must_be_png_jpg_or_webp_data_url'});
    if(qr.length>2000000) return res.status(413).json({ok:false,error:'upi_qr_too_large'});
    c.upiQr=qr;
  }
  save(); res.json({ok:true,clientId:c.id,upiId:c.upiId||defaultUpi().upiId,upiQr:c.upiQr||defaultUpi().upiQr});
});

app.get('/api/v1/admin/default-payment-settings',adminAuth,(req,res)=>{
  const d=defaultUpi();
  res.json({ok:true,upiId:d.upiId,upiQr:d.upiQr});
});

app.post('/api/v1/admin/default-payment-settings',adminAuth,(req,res)=>{
  const upiId=String(req.body?.upiId ?? '').trim().slice(0,120);
  const qr=String(req.body?.upiQr ?? '');
  if(qr && !/^data:image\/(png|jpeg|webp);base64,/i.test(qr)) return res.status(400).json({ok:false,error:'upi_qr_must_be_png_jpg_or_webp_data_url'});
  if(qr.length>2000000) return res.status(413).json({ok:false,error:'upi_qr_too_large'});
  db.settings.defaultUpiId=upiId;
  db.settings.defaultUpiQr=qr;
  save();
  res.json({ok:true,upiId:db.settings.defaultUpiId,upiQr:db.settings.defaultUpiQr});
});

app.get('/api/v1/admin/overview',adminAuth,(req,res)=>{
  const onlineCut=Date.now()-90000;
  const online=db.clients.filter(c=>c.lastSeen && Date.parse(c.lastSeen)>=onlineCut).length;
  res.json({ok:true,stats:{clients:db.clients.length,online,offline:db.clients.length-online,printers:db.clients.reduce((n,c)=>n+c.printers.length,0),jobs:db.jobs.length,completed:db.jobs.filter(j=>j.status==='COMPLETED').length,failed:db.jobs.filter(j=>j.status==='FAILED').length,paymentPending:db.jobs.filter(j=>j.paymentStatus==='PENDING').length,paymentReported:db.jobs.filter(j=>j.paymentStatus==='CUSTOMER_MARKED_PAID').length},clients:db.clients,jobs:db.jobs.slice(0,100),logs:db.logs.slice(0,100)});
});

app.post('/api/v1/admin/jobs',adminAuth,(req,res)=>{
  const {clientId,printerName,fileName,fileBase64}=req.body||{};
  const c=db.clients.find(x=>x.id===clientId && x.active); if(!c) return res.status(400).json({ok:false,error:'client_not_found'});
  if(!fileName || !fileBase64) return res.status(400).json({ok:false,error:'file_required'});
  let buf; try{buf=Buffer.from(String(fileBase64),'base64')}catch(e){return res.status(400).json({ok:false,error:'invalid_file'});}
  if(buf.length>20*1024*1024) return res.status(413).json({ok:false,error:'file_too_large'});
  const safe=path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g,'_');
  const disk=id('file')+'_'+safe; fs.writeFileSync(path.join(JOB_DIR,disk),buf);
  const j={id:id('job'),clientId,printerName:String(printerName||'').slice(0,150),fileName:safe,fileNameOnDisk:disk,status:'QUEUED',message:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  db.jobs.unshift(j); log('job','Print job created',{jobId:j.id,clientId,fileName:safe}); save(); res.json({ok:true,job:j});
});

app.post('/api/v1/admin/clients/:id/disable',adminAuth,(req,res)=>{const c=db.clients.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({ok:false});c.active=false;save();res.json({ok:true});});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,'0.0.0.0',()=>console.log(`Auto Print Server listening on ${PORT}`));
