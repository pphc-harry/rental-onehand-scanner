const {google,guard}=require('../lib/google.cjs');
const archive=require('../lib/archive.cjs');
const {reconcile}=require('../lib/inventory.cjs');
const {waitUntil}=require('@vercel/functions');
module.exports=async(req,res)=>{
 if(!guard(req,res))return;
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({status:'invalid'});}
 try{
  let result;
  if(body?.action==='prepare')result={status:'ready',ticket:await archive.prepare(body,google)};
  else if(body?.action==='upload')result=await archive.upload(body,google);
  else if(body?.action==='finalize'){
   result=await archive.finalize(body,google,reconcile);
   waitUntil(archive.read(body.id,google).then(({data})=>archive.sync(data,google)).then(()=>archive.recover(google)).catch(()=>{}));
  }else if(body?.action==='status'){
   const {file,data}=await archive.read(body.id,google);
   result={status:data.status,archive:'saved',audit:file.appProperties.pending==='false'?'saved':'pending',id:data.id};
   if(data.final&&result.audit==='pending')waitUntil(archive.sync(data,google).catch(()=>{}));
  }else if(body?.action==='recover')result={status:'recovered',...await archive.recover(google)};
  else return res.status(400).json({status:'invalid'});
  return res.status(200).json(result);
 }catch(e){return res.status(e.message==='invalid'?400:502).json({status:e.message==='invalid'?'invalid':'unverified',archive:'unverified'});}
};
