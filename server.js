const express=require('express');
const http=require('http');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const multer=require('multer');
const {WebSocketServer}=require('ws');
const {v4:uuidv4}=require('uuid');

const PORT=Number(process.env.PORT||8080);
const API_KEY=process.env.API_KEY||'CHANGE_THIS_SECRET';
const JOB_TIMEOUT=Number(process.env.JOB_TIMEOUT_SECONDS||300);
const MAX_MB=Number(process.env.MAX_FILE_SIZE_MB||20);
const PUBLIC_URL=(process.env.PUBLIC_URL||'').replace(/\/$/,'');

const UPLOAD=path.resolve(process.env.UPLOAD_DIR||'uploads');
fs.mkdirSync(UPLOAD,{recursive:true});
const DATA=path.resolve('data');
fs.mkdirSync(DATA,{recursive:true});
const DB=path.join(DATA,'state.json');

let state={jobs:{},clients:{}};
try{if(fs.existsSync(DB))state=JSON.parse(fs.readFileSync(DB,'utf8'));}catch(e){}

function save(){
  const clients=Object.fromEntries(Object.entries(state.clients).map(([id,c])=>[id,{
    clientId:id,printerName:c.printerName||'',lastSeen:c.lastSeen||null,
    online:!!c.online,createdAt:c.createdAt||null,uploadToken:c.uploadToken
  }]));
  fs.writeFileSync(DB+'.tmp',JSON.stringify({jobs:state.jobs,clients},null,2));
  fs.renameSync(DB+'.tmp',DB);
}
function send(ws,x){if(ws&&ws.readyState===1)ws.send(JSON.stringify(x));}
function auth(req){return String(req.headers['x-api-key']||req.query.apiKey||'')===API_KEY;}
function tokenAuth(clientId,token){return !!clientId && !!token && state.clients[clientId]?.uploadToken===token;}
function del(j){if(j?.storedPath)fs.rm(j.storedPath,{force:true},()=>{});delete state.jobs[j.jobId];save();}
function publicBase(req){return PUBLIC_URL||`${req.protocol}://${req.get('host')}`;}
function uploadUrl(req,id,c){return `${publicBase(req)}/upload?clientId=${encodeURIComponent(id)}&token=${encodeURIComponent(c.uploadToken)}`;}

const app=express();
const server=http.createServer(app);
const wss=new WebSocketServer({noServer:true});
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.resolve(__dirname,'../../website')));
const upload=multer({dest:UPLOAD,limits:{fileSize:MAX_MB*1024*1024}});

app.get('/health',(q,r)=>r.json({
  ok:true,service:'Auto Print Server',time:new Date().toISOString(),
  clients:Object.values(state.clients).filter(x=>x.online).length,
  jobs:Object.keys(state.jobs).length
}));

app.get('/upload',(q,r)=>r.sendFile(path.resolve(__dirname,'../../website/upload.html')));

app.get('/api/client/:id/status',(q,r)=>{
  let c=state.clients[q.params.id];
  r.json({registered:!!c,online:!!c?.online,printerName:c?.printerName||'',lastSeen:c?.lastSeen||null});
});

app.get('/api/clients',(q,r)=>{
  if(!auth(q))return r.status(401).json({error:'unauthorized'});
  r.json(Object.values(state.clients).map(c=>({
    clientId:c.clientId,printerName:c.printerName||'',online:!!c.online,
    lastSeen:c.lastSeen||null,createdAt:c.createdAt||null,
    uploadUrl:uploadUrl(q,c.clientId,c)
  })));
});

app.get('/api/jobs',(q,r)=>{
  if(!auth(q))return r.status(401).json({error:'unauthorized'});
  r.json(Object.values(state.jobs).map(j=>({...j,storedPath:undefined})));
});

app.post('/api/print',upload.single('file'),(q,r)=>{
  const clientId=String(q.body.clientId||'').trim();
  const uploadToken=String(q.body.uploadToken||'').trim();
  const allowed=auth(q)||tokenAuth(clientId,uploadToken);
  if(!allowed){
    if(q.file)fs.rm(q.file.path,{force:true},()=>{});
    return r.status(401).json({error:'unauthorized'});
  }
  if(!q.file)return r.status(400).json({error:'file required'});
  const c=state.clients[clientId];
  if(!c){
    fs.rm(q.file.path,{force:true},()=>{});
    return r.status(404).json({error:'unknown clientId'});
  }
  const now=Date.now();
  const job={jobId:uuidv4(),clientId,originalName:q.file.originalname||'print-file',
    storedPath:q.file.path,status:'pending',
    createdAt:new Date(now).toISOString(),
    expiresAt:new Date(now+JOB_TIMEOUT*1000).toISOString()};
  state.jobs[job.jobId]=job;
  if(c.online){
    job.status='sent';
    send(c.ws,{type:'print_job',jobId:job.jobId,fileName:job.originalName,
      downloadUrl:`/api/jobs/${job.jobId}/download`,expiresAt:job.expiresAt});
  }
  save();
  r.status(201).json({ok:true,jobId:job.jobId,status:job.status,expiresAt:job.expiresAt});
});

app.get('/api/jobs/:id/download',(q,r)=>{
  let j=state.jobs[q.params.id];
  if(!j)return r.status(404).json({error:'not found'});
  if(!auth(q))return r.status(401).json({error:'unauthorized'});
  if(!fs.existsSync(j.storedPath))return r.status(410).json({error:'expired'});
  r.download(j.storedPath,j.originalName);
});

app.post('/api/jobs/:id/status',(q,r)=>{
  if(!auth(q))return r.status(401).json({error:'unauthorized'});
  let j=state.jobs[q.params.id];
  if(!j)return r.status(404).json({error:'not found'});
  if(!['completed','cancelled','error'].includes(q.body.status))return r.status(400).json({error:'invalid status'});
  del(j);r.json({ok:true});
});

wss.on('connection',(ws,req)=>{
  let u=new URL(req.url,'http://localhost');
  let id=String(u.searchParams.get('clientId')||'');
  let printer=String(u.searchParams.get('printerName')||'');
  let key=String(u.searchParams.get('apiKey')||'');
  if(!id||key!==API_KEY)return ws.close(1008,'unauthorized');

  let old=state.clients[id];
  if(old?.ws&&old.ws!==ws)try{old.ws.close()}catch(e){}

  const existing=state.clients[id];
  const uploadToken=existing?.uploadToken||crypto.randomBytes(24).toString('hex');
  state.clients[id]={
    clientId:id,printerName:printer,ws,online:true,
    lastSeen:new Date().toISOString(),
    createdAt:existing?.createdAt||new Date().toISOString(),
    uploadToken
  };
  save();

  send(ws,{type:'registered',clientId:id,
    uploadToken,uploadUrl:`/upload?clientId=${encodeURIComponent(id)}&token=${encodeURIComponent(uploadToken)}`});

  for(let j of Object.values(state.jobs)){
    if(j.clientId===id&&j.status==='pending'){
      j.status='sent';
      send(ws,{type:'print_job',jobId:j.jobId,fileName:j.originalName,
        downloadUrl:`/api/jobs/${j.jobId}/download`,expiresAt:j.expiresAt});
    }
  }
  save();

  ws.on('message',raw=>{
    try{
      let m=JSON.parse(raw.toString());
      if(m.type==='ping')send(ws,{type:'pong'});
      if(m.type==='job_status'&&m.jobId){
        let j=state.jobs[m.jobId];
        if(j&&j.clientId===id&&['completed','cancelled','error'].includes(m.status)){
          if(j.storedPath)fs.rm(j.storedPath,{force:true},()=>{});
          delete state.jobs[j.jobId];save();
        }
      }
    }catch(e){}
  });
  ws.on('close',()=>{
    let c=state.clients[id];
    if(c&&c.ws===ws){c.online=false;c.ws=null;c.lastSeen=new Date().toISOString();save();}
  });
});

server.on('upgrade',(req,socket,head)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/ws')return socket.destroy();
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});

setInterval(()=>{
  for(let j of Object.values(state.jobs)){
    if(Date.now()>=new Date(j.expiresAt).getTime()){
      let c=state.clients[j.clientId];
      if(c?.online)send(c.ws,{type:'job_cancelled',jobId:j.jobId,reason:'timeout'});
      del(j);
    }
  }
},10000);

server.listen(PORT,()=>console.log('Auto Print Server listening on '+PORT));
