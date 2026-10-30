const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const config=require('./archive-config.cjs');
const DRIVE='https://www.googleapis.com/drive/v3/files';
const SHEET=`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}`;
const fields='id,parents,description,appProperties,md5Checksum,size';
function sign(value){return createHmac('sha256',process.env.SCANNER_ACCESS_KEY).update('purchases-v1|'+value).digest('hex');}
function validTicket(t){if(!t||!/^[-\w]{10,100}$/.test(t.id)||!/^[-\w]{10,100}$/.test(t.lockId)||!/^\d{4}-\d\d-\d\dT/.test(t.capturedAt)||!Number.isFinite(Date.parse(t.capturedAt))||!['tap-camera','photo'].includes(t.source)||!Number.isInteger(t.logRow)||t.logRow<2||t.logRow>100000)return false;const a=Buffer.from(String(t.signature||'')),b=Buffer.from(sign([t.id,t.lockId,t.capturedAt,t.source,t.logRow].join('|')));return a.length===b.length&&timingSafeEqual(a,b);}
async function prepare(body,g){
 if(body.background===true&&!/^[a-f0-9]{64}$/.test(body.imageSha256||''))throw Error('invalid');
 if(!Number.isFinite(Date.parse(body.capturedAt))||!['tap-camera','photo'].includes(body.source))throw Error('invalid');
 const {ids}=await g(DRIVE+'/generateIds?count=2&space=drive&type=files');
 const t={id:ids[0],lockId:ids[1],capturedAt:new Date(body.capturedAt).toISOString(),source:body.source};const reservation={...t,receivedAt:new Date().toISOString(),status:'awaiting_photo'};
 const receipt=await g(`${SHEET}/values/Scans!A:N:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=true`,{method:'POST',body:{values:[values(reservation)]}});
 const match=receipt.updates?.updatedRange?.match(/!A(\d+):N\d+$/);if(!match||receipt.updates.updatedData?.values?.[0]?.[0]!==t.id)throw Error('log_unverified');
 t.logRow=Number(match[1]);rowRange(t.logRow);t.signature=sign([t.id,t.lockId,t.capturedAt,t.source,t.logRow].join('|'));
 if(body.background===true){
  const data={...t,receivedAt:reservation.receivedAt,status:'awaiting_photo',final:false,background:true,imageSha256:body.imageSha256};delete data.signature;
  await g(DRIVE+'?supportsAllDrives=true&fields=id',{method:'POST',body:{id:t.id,name:t.capturedAt.replace(/[:.]/g,'-')+'_'+t.id+'.jpg',parents:[config.folderId],mimeType:'image/jpeg',description:JSON.stringify(data),appProperties:{scanner:'purchases-v1',kind:'photo',pending:'true'}}});
  const check=await read(t.id,g);if(!check.data.background||check.data.logRow!==t.logRow)throw Error('reservation_unverified');
 }
 return t;
}
async function read(id,g){
 if(!/^[-\w]{10,100}$/.test(id))throw Error('invalid');
 const f=await g(`${DRIVE}/${id}?supportsAllDrives=true&fields=${fields}`);
 if(!f.parents?.includes(config.folderId)||f.appProperties?.scanner!=='purchases-v1'||f.appProperties?.kind!=='photo')throw Error('invalid');
 const data=JSON.parse(f.description);if(data.id!==id)throw Error('invalid');return {file:f,data};
}
async function save(data,g,pending=true){
 return g(`${DRIVE}/${data.id}?supportsAllDrives=true&fields=${fields}`,{method:'PATCH',body:{description:JSON.stringify(data),appProperties:{scanner:'purchases-v1',kind:'photo',pending:String(pending),final:String(!!data.final)}}});
}
function values(d){return [d.id,d.capturedAt,d.receivedAt,d.number||'',d.reason||'',d.status||'captured',d.row||'',`https://drive.google.com/file/d/${d.id}/view`,d.scanMs||0,d.sheetMs||0,(d.candidates||[]).join(' / '),d.source,'purchases-v1:'+ (d.grader||'unknown'),d.updatedAt||d.receivedAt];}
function rowRange(row){if(!Number.isInteger(row)||row<2||row>100000)throw Error('invalid_row');return `Scans!A${row}:N${row}`;}
async function sync(data,g){
 if(!data.logRow)return false;
 const range=rowRange(data.logRow),v=values(data);
 // Verify identity before writing the audit row; never touch the stock sheet here.
 const prior=await g(`${SHEET}/values/${range}`);
 if(prior.values?.[0]?.[0]!==data.id)throw Error('audit_row_moved');
 const receipt=await g(`${SHEET}/values/${range}?valueInputOption=RAW&includeValuesInResponse=true`,{method:'PUT',body:{values:[v]}});
 const saved=receipt.updatedData?.values?.[0];if(!saved||JSON.stringify(saved.map(String))!==JSON.stringify(v.map(String)))throw Error('audit_unverified');
 // Only final states clear the outbox. A crash after intent must remain visible.
 if(data.final)await g(`${DRIVE}/${data.id}?supportsAllDrives=true&fields=id`,{method:'PATCH',body:{appProperties:{pending:'false'}}});
 return true;
}
async function upload(body,g){
 const t=body.ticket;if(!validTicket(t)||typeof body.image!=='string'||body.image.length>3900000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image))throw Error('invalid');
 const bytes=Buffer.from(body.image.split(',')[1],'base64');if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('invalid');
 const hash=createHash('md5').update(bytes).digest('hex');
 // An async reservation already exists. Media-only PATCH cannot overwrite concurrent finalize metadata.
 let reserved;try{reserved=await read(t.id,g);}catch(e){if(e.status!==404)throw e;}
 if(reserved?.data.background){
  if(createHash('sha256').update(bytes).digest('hex')!==reserved.data.imageSha256)throw Error('content_conflict');
  if(reserved.data.lockId!==t.lockId||reserved.data.logRow!==t.logRow)throw Error('invalid');
  if(reserved.file.md5Checksum&&Number(reserved.file.size)>0){if(reserved.file.md5Checksum!==hash)throw Error('content_conflict');}
  else await g('https://www.googleapis.com/upload/drive/v3/files/'+t.id+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'PATCH',body:bytes,raw:true,contentType:'image/jpeg'});
  const check=await read(t.id,g);if(check.file.md5Checksum!==hash||Number(check.file.size)!==bytes.length)throw Error('upload_unverified');
  return {status:'photo_saved',id:t.id};
 }
 const data={...t,receivedAt:new Date().toISOString(),status:'captured',final:false,md5:hash};delete data.signature;
 const boundary='scanner_'+t.id;
 const meta={id:t.id,name:`${t.capturedAt.replace(/[:.]/g,'-')}_${t.id}.jpg`,parents:[config.folderId],mimeType:'image/jpeg',description:JSON.stringify(data),appProperties:{scanner:'purchases-v1',kind:'photo',pending:'true'}};
 const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 try{await g('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',{method:'POST',body:payload,raw:true,contentType:'multipart/related; boundary='+boundary});}
 catch(e){if(e.status!==409)throw e;const existing=await read(t.id,g);if(existing.file.md5Checksum!==hash)throw Error('content_conflict');if(existing.data.logRow)return {status:'photo_saved',id:t.id};return {status:'upload_pending',id:t.id};}
 const readback=await read(t.id,g);if(readback.file.md5Checksum!==hash||Number(readback.file.size)!==bytes.length)throw Error('upload_unverified');
 return {status:'photo_saved',id:t.id};
}
async function finalize(body,g,reconcile){
 const {data,file}=await read(body.id,g);
 const archive=data.background&&!(file.md5Checksum&&Number(file.size)>0)?'pending':'saved';
 if(body.ocr?.reason==='found'&&body.confirmed!==true)throw Error('invalid');
 if(data.final)return {...data.receipt,archive,audit:'pending',id:data.id};
 if(!data.logRow)return {status:'upload_pending',archive:'pending',id:data.id};
 const o=body.ocr;
 if(!['PSA','CGC'].includes(body.grader))throw Error('invalid');
 if(!o||typeof o.number!=='string'||!/^\d{0,12}$/.test(o.number)||(o.number&&!/^\d{6,12}$/.test(o.number))||!Array.isArray(o.candidates)||o.candidates.length>30||o.candidates.some(n=>!/^\d{6,12}$/.test(n))||!['found','empty','uncertain','ambiguous','error','cancelled'].includes(o.reason))throw Error('invalid');
 const candidates=[...new Set([...o.candidates,...(o.number?[o.number]:[])])];
 // Create-only Drive ID acts as a distributed, durable at-most-once stock-write claim.
 try{await g(`${DRIVE}?supportsAllDrives=true&fields=id`,{method:'POST',body:{id:data.lockId,name:'scan-operation-'+data.id,parents:[config.folderId],mimeType:'application/json',description:JSON.stringify({scanId:data.id,claimedAt:new Date().toISOString()}),appProperties:{scanner:'purchases-v1',kind:'claim'}}});}
 catch(e){if(e.status!==409)throw e;const latest=await read(body.id,g);return latest.data.final?{...latest.data.receipt,archive,audit:'pending',id:data.id}:{status:'processing',archive,audit:'pending',id:data.id};}
 Object.assign(data,{grader:body.grader,confirmed:body.confirmed===true,number:o.number,candidates,reason:o.reason,raw:String(o.raw||'').slice(0,8000),scanMs:Math.max(0,Math.min(3600000,Number(o.scanMs)||0)),status:'unverified',updatedAt:new Date().toISOString()});
 await save(data,g); // Persist intent before any stock mutation; recovery never replays it.
 const start=Date.now();let receipt;
 if(candidates.length>1||o.reason!=='found'||!o.number)receipt={status:candidates.length>1?'ocr_conflict':'ocr_failed'};
 else try{receipt=await reconcile(o.number,g);}catch{receipt={status:'unverified'};}
 Object.assign(data,{status:receipt.status,row:receipt.row||'',receipt,sheetMs:Date.now()-start,updatedAt:new Date().toISOString(),final:true});
 // Drive PATCH returns the persisted File resource (including description).
 // Check that response directly instead of a second serial Drive GET.
 const saved=await save(data,g),check=JSON.parse(saved.description||'null');
 if(saved.id!==data.id||!saved.parents?.includes(config.folderId)||saved.appProperties?.scanner!=='purchases-v1'||saved.appProperties?.kind!=='photo'||check?.id!==data.id||!check.final||JSON.stringify(check.receipt)!==JSON.stringify(receipt))throw Error('save_unverified');
 return {...receipt,archive,audit:'pending',id:data.id};
}
async function recover(g){
 const q=`'${config.folderId}' in parents and trashed=false and appProperties has { key='scanner' and value='purchases-v1' } and appProperties has { key='pending' and value='true' } and appProperties has { key='kind' and value='photo' } and appProperties has { key='final' and value='true' }`;
 const list=await g(`${DRIVE}?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=4&q=${encodeURIComponent(q)}&fields=files(id,description),nextPageToken`);
 let saved=0,failed=0;
 for(const f of list.files||[]){try{const d=JSON.parse(f.description);if(!d.final)continue;if(await sync(d,g))saved++;}catch{failed++;}}
 return {saved,failed,more:!!list.nextPageToken};
}
module.exports={prepare,upload,finalize,read,sync,recover,validTicket,values};
