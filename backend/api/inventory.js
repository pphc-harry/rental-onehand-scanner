const {google,guard}=require('../lib/google.cjs');
const {reconcile}=require('../lib/inventory.cjs');
module.exports=async(req,res)=>{
 if(req.method==='GET'){res.setHeader('Cache-Control','no-store');return res.status(200).json({status:'ready'});}
 if(!guard(req,res))return;
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({status:'invalid'});}
 if(!body||Object.keys(body).some(k=>!['number','dryRun'].includes(k))||typeof body.number!=='string'||!/^\d{6,12}$/.test(body.number))return res.status(400).json({status:'invalid'});
 // Old tabs cannot bypass saving. Refresh to v12 before any stock mutation.
 if(body.dryRun!==true)return res.status(409).json({status:'upgrade_required'});
 try{return res.status(200).json(await reconcile(body.number,google,{dryRun:true}));}
 catch{return res.status(502).json({status:'unverified'});}
};
