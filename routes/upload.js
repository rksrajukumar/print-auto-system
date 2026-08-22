const express=require("express");
const multer=require("multer");
const path=require("path"),fs=require("fs");
const {getPool}=require("../services/db");
const {createJob}=require("../services/jobService");
const router=express.Router();
const dir=path.join(process.cwd(),"uploads"); fs.mkdirSync(dir,{recursive:true});
const upload=multer({
 dest:dir,
 limits:{fileSize:Number(process.env.UPLOAD_MAX_MB||5)*1024*1024},
 fileFilter:(req,f,cb)=>cb(
   ["application/pdf","image/jpeg","image/png"].includes(f.mimetype)?null:new Error("Only PDF/JPG/PNG allowed"),
   ["application/pdf","image/jpeg","image/png"].includes(f.mimetype)
 )
});
router.post("/:clientId",upload.single("file"),async(req,res)=>{
 try{
   if(!req.file)return res.status(400).json({ok:false,error:"file_required"});
   const db=getPool();
   const [c]=await db.execute("SELECT client_id FROM clients WHERE client_id=?",[req.params.clientId]);
   if(!c.length)return res.status(404).json({ok:false,error:"client_not_found"});
   const jobId=await createJob({
     client_id:req.params.clientId,file_name:req.file.originalname,file_path:req.file.path,
     print_type:(req.body.print_type||"BW").toUpperCase(),
     paper_size:req.body.paper_size||"A4",
     copies:Math.max(1,Math.min(100,Number(req.body.copies||1))),
     amount:Number(req.body.amount||0)
   });
   res.json({ok:true,job_id:jobId,payment_status:"paid"});
 }catch(e){console.error(e);res.status(500).json({ok:false,error:e.message});}
});
module.exports=router;
