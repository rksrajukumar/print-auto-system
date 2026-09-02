require("dotenv").config();
const path=require("path");
const http=require("http");
const express=require("express");
const cors=require("cors");
const {WebSocketServer}=require("ws");
const {getPool}=require("./services/db");
const hub=require("./services/clientHub");
const clientRoutes=require("./routes/client");
const adminRoutes=require("./routes/admin");
const uploadRoutes=require("./routes/upload");

const app=express();
app.use(cors());
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","admin","index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin","index.html")));
app.get("/upload/:clientId",(req,res)=>res.sendFile(path.join(__dirname,"public","upload","index.html")));
app.get("/health",(req,res)=>res.json({ok:true,service:"auto-print-server"}));

app.use("/api/client",clientRoutes);
app.use("/api/admin",adminRoutes);
app.use("/api/upload",uploadRoutes);

const server=http.createServer(app);
const wss=new WebSocketServer({server,path:"/ws"});
wss.on("connection",(ws)=>{
  let clientId=null;
  ws.on("message",async raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      const db=getPool();
      if(msg.type==="authenticate"){
        const [rows]=await db.execute("SELECT client_id FROM clients WHERE client_token=?",[msg.token]);
        if(!rows.length){ws.close();return;}
        clientId=rows[0].client_id; hub.add(clientId,ws);
        await db.execute("UPDATE clients SET status='online',last_seen=NOW() WHERE client_id=?",[clientId]);
        ws.send(JSON.stringify({type:"authenticated",client_id:clientId}));
      } else if(msg.type==="heartbeat"&&clientId){
        await db.execute(
          "UPDATE clients SET status='online',last_seen=NOW(),pc_name=?,hostname=?,printer_name=? WHERE client_id=?",
          [msg.pc_name||"",msg.hostname||"",msg.printer_name||"",clientId]
        );
      } else if(msg.type==="job_status"&&clientId&&msg.job_id){
        await db.execute("UPDATE jobs SET job_status=?,printed_at=IF(?='printed',NOW(),printed_at) WHERE job_id=? AND client_id=?",
          [msg.status,msg.status,msg.job_id,clientId]);
      }
    }catch(e){console.error("WS",e.message);}
  });
  ws.on("close",async()=>{
    if(clientId){hub.remove(clientId,ws);try{await getPool().execute("UPDATE clients SET status='offline' WHERE client_id=?",[clientId]);}catch{}}
  });
});
const PORT=Number(process.env.PORT||10000);
server.listen(PORT,"0.0.0.0",()=>console.log(`Auto Print Server listening on ${PORT}`));
