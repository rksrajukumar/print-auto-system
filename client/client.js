const fs=require("fs"),path=require("path"),os=require("os"),http=require("http"),https=require("https"),{execFile}=require("child_process");
const CONFIG=path.join(__dirname,"client-config.json");
const SERVER=process.env.AUTO_PRINT_SERVER||process.argv[2];
if(!SERVER){console.error("Set AUTO_PRINT_SERVER or pass server URL");process.exit(1)}
function request(url,opts={},body){return new Promise((resolve,reject)=>{let u=new URL(url);let lib=u.protocol==="https:"?https:http;
let req=lib.request(u,{method:opts.method||"GET",headers:{"Content-Type":"application/json",...(opts.headers||{})}},r=>{let d="";r.on("data",x=>d+=x);r.on("end",()=>{try{resolve({status:r.statusCode,data:JSON.parse(d)})}catch{resolve({status:r.statusCode,data:d})}})});req.on("error",reject);if(body)req.write(JSON.stringify(body));req.end()})}
async function register(){let r=await request(SERVER+"/api/client/register",{method:"POST"}, {name:os.hostname(),shopName:os.hostname()});
if(r.status!==200)throw new Error(JSON.stringify(r.data));fs.writeFileSync(CONFIG,JSON.stringify({server:SERVER,clientId:r.data.clientId,secret:r.data.secret},null,2));console.log("SERVER GENERATED CLIENT ID:",r.data.clientId);console.log("CUSTOMER URL:",r.data.customerUrl)}
async function getConfig(){return JSON.parse(fs.readFileSync(CONFIG,"utf8"))}
async function poll(){let c=await getConfig();let r=await request(c.server+"/api/client/jobs",{headers:{"x-client-id":c.clientId,"x-client-secret":c.secret}});
if(r.status!==200){console.log("Server auth/connection error");return}
for(const j of r.data){try{await printJob(c,j)}catch(e){await status(c,j.id,"failed",String(e))}}
}
function download(url,c,j){return new Promise((resolve,reject)=>{let u=new URL(url),lib=u.protocol==="https:"?https:http,fp=path.join(os.tmpdir(),`auto-print-${j.id}-${path.basename(j.originalName)}`);
lib.get(u,{headers:{"x-client-id":c.clientId,"x-client-secret":c.secret}},r=>{let out=fs.createWriteStream(fp);r.pipe(out);out.on("finish",()=>out.close(()=>resolve(fp)));r.on("error",reject)}).on("error",reject)})}
function status(c,id,s,error=""){return request(c.server+"/api/client/jobs/"+encodeURIComponent(id)+"/status",{method:"POST",headers:{"x-client-id":c.clientId,"x-client-secret":c.secret}},{status:s,error})}
async function printJob(c,j){
 await status(c,j.id,"printing");
 let fp=await download(c.server+j.download,c,j);
 /* Uses the Windows default printer. For production-grade A3/color/copy
    enforcement, install SumatraPDF and set SUMATRA_PATH. */
 const sumatra=process.env.SUMATRA_PATH||"";
 await new Promise((resolve,reject)=>{
   if(sumatra && /\.pdf$/i.test(fp)){
     const args=["-silent","-print-to-default",fp,"-print-settings",`${j.copies}x,${j.paper}`];
     if(j.printType==="colour")args[args.length-1]+=",color"; else args[args.length-1]+=",monochrome";
     execFile(sumatra,args,e=>e?reject(e):resolve());
   }else{
     execFile("powershell.exe",["-NoProfile","-Command",`Start-Process -FilePath '${fp.replace(/'/g,"''")}' -Verb Print`],e=>e?reject(e):resolve());
   }
 });
 await status(c,j.id,"completed");try{fs.unlinkSync(fp)}catch{}
 console.log("PRINTED:",j.originalName,j.clientId)
}
(async()=>{if(!fs.existsSync(CONFIG))await register();console.log("AUTO PRINT CLIENT RUNNING");setInterval(poll,3000);poll()})().catch(e=>{console.error(e);process.exit(1)})
