const {google}=require('../lib/google.cjs');
const rental=require('../lib/rental.cjs');
const batch=require('../lib/rental-batch.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({status:'method_not_allowed'});
 if(req.headers.origin&&!['https://rental-cert-scanner-20261027.vercel.app','https://rental-onehand-scanner-20261028.vercel.app','https://rental-onehand-main-20261029.vercel.app'].includes(req.headers.origin))return res.status(403).json({status:'forbidden'});
 if(!process.env.SCANNER_GOOGLE_SERVICE_ACCOUNT)return res.status(503).json({status:'not_configured'});
 let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({status:'invalid'});}
 if(b&&['snapshot','sync'].includes(b.action)){
  if(Object.keys(b).some(k=>!['action','items','confirmed'].includes(k))||(b.action==='sync'&&(b.confirmed!==true||!batch.validItems(b.items))))return res.status(400).json({status:'invalid'});
  try{const g=batch.withRetry(google);return res.status(200).json(b.action==='snapshot'?await batch.snapshot(g):await batch.sync(b.items,g));}
  catch(e){return res.status(e.status===429?429:502).json({status:e.status===429?'rate_limited':e.message==='schema_changed'?'schema_changed':'sheet_unavailable'});}
 }
 if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['action','number','confirmed','expected','newLocation'].includes(k))||!['lookup','confirm'].includes(b.action)||typeof b.number!=='string'||!/^\d{6,12}$/.test(b.number))return res.status(400).json({status:'invalid'});
 if(b.action==='confirm'&&(b.confirmed!==true||!b.expected||!Number.isInteger(b.expected.row)||typeof b.expected.card!=='string'||typeof b.expected.location!=='string'||!rental.validLocation(b.newLocation)))return res.status(400).json({status:'invalid'});
 try{return res.status(200).json(b.action==='lookup'?await rental.lookup(b.number,google):await rental.confirm(b.number,b.expected,google,b.newLocation));}
 catch{return res.status(502).json({status:'unverified'});}
};
