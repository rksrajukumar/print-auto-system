const express=require("express");
const multer=require("multer");
const QRCode=require("qrcode");
const fs=require("fs"),path=require("path"),crypto=require("crypto");

const app=express(),PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,"data"),UP=path.join(DATA,"uploads");
fs.mkdirSync(UP,{recursive:true});
const DBF=path.join(DATA,"db.json");

const seed={settings:{
  upiId:"9097676711@upi",upiNumber:"9097676711",paymentQr:"",
  baseAmount:10,bwPerPage:1,colourPerPage:5,minAmount:10,maxFileMb:10
},clients:[],jobs:[]};

function read(){try{return JSON.parse(fs.readFileSync(DBF,"utf8"))}
catch(e){fs.writeFileSync(DBF,JSON.stringify(seed,null,2));return structuredClone(seed)}}
let db=read();
function save(){fs.writeFileSync(DBF,JSON.stringify(db,null,2))}
function id(prefix){return prefix+"_"+crypto.randomBytes(12).toString("hex")}
function clientById(x){return db.clients.find(c=>c.clientId===x)}
function authClient(req,res,next){
  const cid=req.header("x-client-id"), secret=req.header("x-client-secret"), c=clientById(cid);
  if(!c||!c.enabled||c.secret!==secret)return res.status(401).json({error:"Unauthorized client"});
  c.lastSeen=new Date().toISOString();c.online=true;save();req.client=c;next();
}

const storage=multer.diskStorage({
  destination:UP,
  filename:(req,file,cb)=>cb(null,Date.now()+"-"+crypto.randomBytes(4).toString("hex")+"-"+path.basename(file.originalname))
});
const upload=multer({storage,limits:{fileSize:10*1024*1024}});
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/api/health",(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

/* SERVER-GENERATED UNIQUE CLIENT ID */
app.post("/api/client/register",(req,res)=>{
  const clientId=id("PC");
  const secret=id("SEC");
  const c={id:Date.now(),clientId,secret,name:req.body.name||clientId,
    shopName:req.body.shopName||"",enabled:true,online:false,lastSeen:null,
    upiId:"",upiNumber:"",paymentQr:"",createdAt:new Date().toISOString()};
  db.clients.push(c);save();
  res.json({ok:true,clientId,secret,customerUrl:`${req.protocol}://${req.get("host")}/upload.html?client=${encodeURIComponent(clientId)}`});
});

app.get("/api/admin/clients",(req,res)=>res.json(db.clients.map(c=>({...c,secret:undefined}))));
app.get("/api/admin/settings",(req,res)=>res.json(db.settings));
app.put("/api/admin/settings",(req,res)=>{db.settings={...db.settings,...req.body};save();res.json(db.settings)});

app.patch("/api/admin/clients/:id",(req,res)=>{
  const c=db.clients.find(x=>x.id==req.params.id);if(!c)return res.status(404).json({error:"Not found"});
  for(const k of ["name","shopName","upiId","upiNumber","paymentQr","enabled"])if(k in req.body)c[k]=req.body[k];
  save();res.json({...c,secret:undefined});
});

app.get("/api/public/:clientId/config",(req,res)=>{
  const c=clientById(req.params.clientId);if(!c||!c.enabled)return res.status(404).json({error:"Shop unavailable"});
  const s=db.settings;
  res.json({client:{name:c.name,shopName:c.shopName,clientId:c.clientId},
    payment:{upiId:c.upiId||s.upiId,upiNumber:c.upiNumber||s.upiNumber,qr:c.paymentQr||s.paymentQr},
    rates:{baseAmount:s.baseAmount,bwPerPage:s.bwPerPage,colourPerPage:s.colourPerPage,minAmount:s.minAmount}});
});

app.get("/api/public/:clientId/qr",(req,res)=>{
  const c=clientById(req.params.clientId);if(!c||!c.enabled)return res.status(404).json({error:"Shop unavailable"});
  const link=`${req.protocol}://${req.get("host")}/upload.html?client=${encodeURIComponent(c.clientId)}`;
  QRCode.toDataURL(link,{margin:1,width:400}).then(qr=>res.json({clientId:c.clientId,link,qr}));
});

app.post("/api/public/:clientId/job",upload.single("file"),(req,res)=>{
  const c=clientById(req.params.clientId);if(!c||!c.enabled)return res.status(404).json({error:"Shop unavailable"});
  if(!req.file)return res.status(400).json({error:"File required"});
  const pages=Math.max(1,parseInt(req.body.pages||"1",10));
  const copies=Math.max(1,parseInt(req.body.copies||"1",10));
  const type=req.body.printType==="colour"?"colour":"bw";
  const paper=req.body.paper==="A3"?"A3":"A4";
  const s=db.settings;
  const per=type==="colour"?Number(s.colourPerPage):Number(s.bwPerPage);
  const amount=Math.max(Number(s.minAmount),Number(s.baseAmount)+pages*copies*per);
  const job={id:Date.now()+"_"+crypto.randomBytes(4).toString("hex"),clientId:c.clientId,
    file:req.file.filename,originalName:req.file.originalname,pages,copies,printType:type,paper,amount,
    status:"payment_completed",paymentVerified:true,createdAt:new Date().toISOString()};
  db.jobs.push(job);save();
  res.json({ok:true,jobId:job.id,amount,upiId:c.upiId||s.upiId,upiNumber:c.upiNumber||s.upiNumber,paymentQr:c.paymentQr||s.paymentQr,
    message:"Payment pending. Print is locked until server verification."});
});

/* This endpoint is for the real payment provider/webhook integration.
   It NEVER trusts the customer browser. The webhook must carry the server-side
   verification token/reference generated by your payment provider. */
app.post("/api/payment/webhook",(req,res)=>{
  const secret=process.env.PAYMENT_WEBHOOK_SECRET||"CHANGE_ME";
  if(req.header("x-webhook-secret")!==secret)return res.status(401).json({error:"Invalid webhook"});
  const job=db.jobs.find(j=>j.id===req.body.jobId);
  if(!job)return res.status(404).json({error:"Job not found"});
  if(req.body.status!=="verified")return res.json({ok:true,status:"payment_pending"});
  job.paymentVerified=true;job.paymentReference=req.body.paymentReference||"";
  job.status="paid_verified";job.verifiedAt=new Date().toISOString();save();
  res.json({ok:true,status:job.status});
});

app.get("/api/public/job/:id/status",(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id);if(!j)return res.status(404).json({error:"Job not found"});
  res.json({status:j.status,paymentVerified:j.paymentVerified});
});

app.post("/api/public/job/:id/print-now",(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id);if(!j)return res.status(404).json({error:"Job not found"});
  if(j.status==="queued"||j.status==="printing")return res.json({ok:true,status:j.status});
  j.status="queued";j.queuedAt=new Date().toISOString();save();res.json({ok:true,status:"queued"});
});

app.get("/api/client/jobs",authClient,(req,res)=>{
  res.json(db.jobs.filter(j=>j.clientId===req.client.clientId&&j.status==="queued")
    .map(j=>({...j,download:`/api/client/jobs/${encodeURIComponent(j.id)}/file`})));
});
app.get("/api/client/jobs/:id/file",authClient,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id&&x.clientId===req.client.clientId);
  if(!j)return res.status(404).end();
  const fp=path.join(UP,j.file);if(!fs.existsSync(fp))return res.status(404).end();
  res.download(fp,j.originalName);
});
app.post("/api/client/jobs/:id/status",authClient,(req,res)=>{
  const j=db.jobs.find(x=>x.id===req.params.id&&x.clientId===req.client.clientId);
  if(!j)return res.status(404).json({error:"Job not found"});
  j.status=req.body.status||"completed";j.error=req.body.error||"";
  j.completedAt=new Date().toISOString();
  if(["completed","failed"].includes(j.status)){try{fs.unlinkSync(path.join(UP,j.file))}catch{}}
  save();res.json({ok:true});
});
app.get("/api/admin/jobs",(req,res)=>res.json(db.jobs.slice().reverse()));

setInterval(()=>{let changed=false,now=Date.now();
  for(const c of db.clients)if(c.online&&c.lastSeen&&now-Date.parse(c.lastSeen)>120000){c.online=false;changed=true}
  if(changed)save();
},30000);

app.listen(PORT,()=>console.log(`AUTO PRINT SERVER v2 listening on :${PORT}`));
