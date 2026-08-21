const express=require("express");
const multer=require("multer");
const QRCode=require("qrcode");
const fs=require("fs"),path=require("path"),crypto=require("crypto");

const app=express(), PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,"data"), UP=path.join(DATA,"uploads");
fs.mkdirSync(UP,{recursive:true});
const DBF=path.join(DATA,"db.json");

const seed={
 settings:{upiId:"9097676711@upi",upiNumber:"9097676711",paymentQr:"",baseAmount:10,bwPerPage:1,colourPerPage:5,minAmount:10,maxFileMb:5},
 clients:[],
 jobs:[]
};
function read(){try{return JSON.parse(fs.readFileSync(DBF,"utf8"))}catch(e){fs.writeFileSync(DBF,JSON.stringify(seed,null,2));return structuredClone(seed)}}
let db=read();
function save(){fs.writeFileSync(DBF,JSON.stringify(db,null,2))}
function token(){return crypto.randomBytes(24).toString("hex")}
function clientByPc(pc){return db.clients.find(c=>c.pcId===pc)}
function authClient(req,res,next){
 const pc=req.header("x-pc-id"), secret=req.header("x-client-secret"), c=clientByPc(pc);
 if(!c||!c.enabled||c.secret!==secret)return res.status(401).json({error:"Unauthorized client"});
 c.lastSeen=new Date().toISOString(); c.online=true; save(); req.client=c; next();
}
const storage=multer.diskStorage({destination:UP,filename:(req,file,cb)=>cb(null,Date.now()+"-"+crypto.randomBytes(4).toString("hex")+"-"+path.basename(file.originalname))});
const upload=multer({storage,limits:{fileSize:5*1024*1024}});

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/api/health",(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

app.get("/api/admin/clients",(req,res)=>res.json(db.clients.map(c=>({...c,secret:undefined}))));
app.post("/api/admin/clients",(req,res)=>{
 const pc=(req.body.pcId||"").trim();
 if(!pc)return res.status(400).json({error:"pcId required"});
 if(clientByPc(pc))return res.status(409).json({error:"PC ID already exists"});
 const c={id:Date.now(),name:req.body.name||pc,shopName:req.body.shopName||"",pcId:pc,
   secret:token(),enabled:true,online:false,upiId:req.body.upiId||"",upiNumber:req.body.upiNumber||"",
   paymentQr:req.body.paymentQr||"",lastSeen:null,createdAt:new Date().toISOString()};
 db.clients.push(c);save();
 res.json({client:{...c,secret:undefined},secret:c.secret});
});
app.post("/api/admin/clients/:id/rotate-secret",(req,res)=>{
 const c=db.clients.find(x=>x.id==req.params.id);if(!c)return res.status(404).json({error:"Not found"});
 c.secret=token();c.online=false;save();res.json({secret:c.secret});
});
app.patch("/api/admin/clients/:id",(req,res)=>{
 const c=db.clients.find(x=>x.id==req.params.id);if(!c)return res.status(404).json({error:"Not found"});
 for(const k of ["name","shopName","upiId","upiNumber","paymentQr","enabled"])if(k in req.body)c[k]=req.body[k];
 save();res.json({...c,secret:undefined});
});
app.delete("/api/admin/clients/:id",(req,res)=>{
 const i=db.clients.findIndex(x=>x.id==req.params.id);if(i<0)return res.status(404).end();
 db.clients.splice(i,1);save();res.json({ok:true});
});

app.get("/api/admin/settings",(req,res)=>res.json(db.settings));
app.put("/api/admin/settings",(req,res)=>{db.settings={...db.settings,...req.body};save();res.json(db.settings)});

app.get("/api/public/:pcId/config",(req,res)=>{
 const c=clientByPc(req.params.pcId);if(!c||!c.enabled)return res.status(404).json({error:"Client unavailable"});
 const s=db.settings, upiId=c.upiId||s.upiId, upiNumber=c.upiNumber||s.upiNumber, qr=c.paymentQr||s.paymentQr;
 res.json({client:{name:c.name,pcId:c.pcId},payment:{upiId,upiNumber,qr},rates:{baseAmount:s.baseAmount,bwPerPage:s.bwPerPage,colourPerPage:s.colourPerPage,minAmount:s.minAmount}});
});
app.get("/api/public/:pcId/upload-link",(req,res)=>{
 const c=clientByPc(req.params.pcId);if(!c||!c.enabled)return res.status(404).json({error:"Client unavailable"});
 const base=`${req.protocol}://${req.get("host")}`;
 const link=`${base}/upload.html?pc=${encodeURIComponent(c.pcId)}`;
 QRCode.toDataURL(link,{margin:1,width:300}).then(qr=>res.json({link,qr}));
});

app.post("/api/public/:pcId/job",upload.single("file"),(req,res)=>{
 const c=clientByPc(req.params.pcId); if(!c||!c.enabled)return res.status(404).json({error:"Client unavailable"});
 if(!req.file)return res.status(400).json({error:"File required"});
 const pages=Math.max(1,parseInt(req.body.pages||"1",10));
 const copies=Math.max(1,parseInt(req.body.copies||"1",10));
 const type=req.body.printType==="colour"?"colour":"bw";
 const s=db.settings;
 const amount=Math.max(Number(s.minAmount),Number(s.baseAmount)+pages*copies*(type==="colour"?Number(s.colourPerPage):Number(s.bwPerPage)));
 const job={id:Date.now(),pcId:c.pcId,file:req.file.filename,originalName:req.file.originalname,pages,copies,printType:type,paper:req.body.paper||"A4",amount,status:"waiting_payment",createdAt:new Date().toISOString()};
 db.jobs.push(job);save();
 res.json({ok:true,jobId:job.id,amount,upiId:c.upiId||s.upiId,upiNumber:c.upiNumber||s.upiNumber,paymentQr:c.paymentQr||s.paymentQr});
});

app.post("/api/public/job/:id/payment-done",(req,res)=>{
 const j=db.jobs.find(x=>x.id==req.params.id);
 if(!j)return res.status(404).json({error:"Job not found"});
 if(j.status!=="waiting_payment")return res.json({ok:true,status:j.status});
 j.status="queued";j.paymentConfirmedByCustomer=true;j.queuedAt=new Date().toISOString();save();
 res.json({ok:true,status:"queued"});
});
app.get("/api/client/jobs",authClient,(req,res)=>{
 const list=db.jobs.filter(j=>j.pcId===req.client.pcId&&j.status==="queued").map(j=>({...j,download:`/api/client/jobs/${j.id}/file`}));
 res.json(list);
});
app.get("/api/client/jobs/:id/file",authClient,(req,res)=>{
 const j=db.jobs.find(x=>x.id==req.params.id&&x.pcId===req.client.pcId);if(!j)return res.status(404).end();
 const fp=path.join(UP,j.file);if(!fs.existsSync(fp))return res.status(404).end();res.download(fp,j.originalName);
});
app.post("/api/client/jobs/:id/status",authClient,(req,res)=>{
 const j=db.jobs.find(x=>x.id==req.params.id&&x.pcId===req.client.pcId);if(!j)return res.status(404).json({error:"Job not found"});
 j.status=req.body.status||"completed";j.error=req.body.error||"";j.completedAt=new Date().toISOString();
 if(j.status==="completed"||j.status==="failed"){const fp=path.join(UP,j.file);try{fs.unlinkSync(fp)}catch{}}
 save();res.json({ok:true});
});

app.get("/api/admin/jobs",(req,res)=>res.json(db.jobs.slice().reverse()));
setInterval(()=>{let changed=false;const now=Date.now();for(const c of db.clients){if(c.online&&c.lastSeen&&now-Date.parse(c.lastSeen)>120000){c.online=false;changed=true}}if(changed)save()},30000);

app.listen(PORT,()=>console.log(`AUTO PRINT SERVER listening on :${PORT}`));
