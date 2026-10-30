const {google}=require('../lib/google.cjs');
const archive=require('../lib/purchases-archive.cjs');
const purchases=require('../lib/purchases.cjs');
const {waitUntil}=require('@vercel/functions');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({status:'method_not_allowed'});
 if(req.headers.origin&&req.headers.origin!=='https://purchases-cert-scanner.vercel.app')return res.status(403).json({status:'forbidden'});
 if(!process.env.SCANNER_GOOGLE_SERVICE_ACCOUNT||!process.env.SCANNER_ACCESS_KEY)return res.status(503).json({status:'not_configured'});
 let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({status:'invalid'});}
 if(!b||Object.keys(b).some(k=>!['action','capturedAt','source','ticket','image','id','ocr','confirmed','grader','imageSha256'].includes(k)))return res.status(400).json({status:'invalid'});
 try{
  let result;
  if(b.action==='health')result=await purchases.health(google);
  else if(b.action==='prepare')result={status:'ready',ticket:await archive.prepare(b,google)};
  else if(b.action==='prepare_async')result={status:'ready',ticket:await archive.prepare({...b,background:true},google)};
  else if(b.action==='upload')result=await archive.upload(b,google);
  else if(b.action==='finalize'){
   result=await archive.finalize(b,google,purchases.record);
   waitUntil(archive.read(b.id,google).then(({data})=>archive.sync(data,google)).then(()=>archive.recover(google)).catch(()=>{}));
  }else if(b.action==='status'){
   const {file,data}=await archive.read(b.id,google);
   result={status:data.status,receipt:data.receipt,final:!!data.final,archive:data.background&&!(file.md5Checksum&&Number(file.size)>0)?'pending':'saved',audit:file.appProperties.pending==='false'?'saved':'pending',id:data.id};
   if(data.final&&result.audit==='pending')waitUntil(archive.sync(data,google).catch(()=>{}));
  }else if(b.action==='recover')result={status:'recovered',...await archive.recover(google)};
  else return res.status(400).json({status:'invalid'});
  return res.status(200).json(result);
 }catch(e){return res.status(e.message==='invalid'?400:502).json({status:e.message==='invalid'?'invalid':'unverified',archive:'unverified'});}
};
