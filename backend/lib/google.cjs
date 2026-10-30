const {createSign}=require('node:crypto');
let cached;
async function token(){
 if(cached&&cached.until>Date.now())return cached.value;
 const sa=JSON.parse(process.env.SCANNER_GOOGLE_SERVICE_ACCOUNT),now=Math.floor(Date.now()/1000),encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 // Reuse the existing RPW service account and its existing Drive/Sheets access.
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=unsigned+'.'+createSign('RSA-SHA256').update(unsigned).sign(sa.private_key,'base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(18000),body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!r.ok)throw Error('token_failed');const d=await r.json();cached={value:d.access_token,until:Date.now()+(d.expires_in-120)*1000};return cached.value;
}
async function google(url,options={}){
 const access=await token();
 const r=await fetch(url,{method:options.method||'GET',signal:AbortSignal.timeout(18000),headers:{Authorization:'Bearer '+access,'Content-Type':options.contentType||'application/json'},...(options.body!==undefined?{body:options.raw?options.body:JSON.stringify(options.body)}:{})});
 if(!r.ok){const e=Error('upstream_failed');e.status=r.status;throw e;}return r.status===204?{}:r.json();
}
function guard(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!process.env.SCANNER_GOOGLE_SERVICE_ACCOUNT||!(process.env.SCANNER_ACCESS_KEY?.length>=32)){res.status(503).json({status:'not_configured'});return false;}
 if(req.method!=='POST'){res.status(405).json({status:'method_not_allowed'});return false;}
 // Owner approved public scanner access: Discord 1558156730238767277.
 if(req.headers.origin&&req.headers.origin!=='https://psa-number-scanner.vercel.app'){res.status(403).json({status:'forbidden'});return false;}return true;
}
module.exports={google,guard};
