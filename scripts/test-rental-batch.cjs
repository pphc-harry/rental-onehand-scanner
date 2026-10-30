const assert=require('node:assert/strict');
const b=require('../backend/lib/rental-batch.cjs'),{TAB_ID}=require('../backend/lib/rental.cjs');
const headers=['Cert','Location','Checklist','New Location','Card'].map(v=>({formattedValue:v}));
// One-row Sheet. paint:false drops the green from every write, like the missing highlights seen on 2026-10-30.
function fake(row,opts={}){
 const writes=[],cells=()=>[{formattedValue:row.number},{formattedValue:row.location},{dataValidation:{condition:{type:'BOOLEAN'}},userEnteredValue:{boolValue:row.checked},userEnteredFormat:row.green?{backgroundColorStyle:{rgbColor:{green:1}}}:{}},{formattedValue:row.d,userEnteredValue:{stringValue:row.d}},{formattedValue:row.card}];
 return {row,writes,google:async(url,o={})=>{
  if(!o.method)return {sheets:[{properties:{sheetId:TAB_ID},data:[{rowData:[{values:headers},{values:cells()}]}]}]};
  writes.push(o.body.requests);
  for(const q of o.body.requests){if(q.updateCells){row.checked=true;row.d=q.updateCells.rows[0].values[1].userEnteredValue.stringValue;}if(q.repeatCell&&opts.paint!==false)row.green=true;}
  return {updatedSpreadsheet:{sheets:[{properties:{sheetId:TAB_ID},data:[{startRow:1,rowData:[{values:cells()}]}]}]}};
 }};
}
const row=(o={})=>({number:'141855033',location:'A7-04',card:'Card',checked:false,green:false,d:'',...o});
const item=(expected={})=>({id:'a',number:'141855033',newLocation:'A7-04',expected:{row:2,location:'A7-04',card:'Card',checked:false,highlighted:false,newLocation:'',...expected}});
const sync=async(f,i=item())=>{try{return (await b.sync([i],f.google)).results[0];}catch(e){return {status:'error '+e.message};}};
(async()=>{
 let f=fake(row());assert.equal((await sync(f)).status,'checked');assert.deepEqual([f.row.checked,f.row.green,f.row.d],[true,true,'A7-04']);
 assert.equal((await sync(f)).status,'already_checked');assert.equal(f.writes.length,1);
 // The failure seen live: the first write keeps the tick but not the green, so the phone retries.
 f=fake(row(),{paint:false});assert.equal((await sync(f)).status,'error write_unverified');assert.deepEqual([f.row.checked,f.row.green,f.row.d],[true,false,'A7-04']);
 f.google=fake(f.row).google;assert.equal((await sync(f)).status,'checked');assert.equal(f.row.green,true);
 // Ticked at this location without green: green is written, C and D keep their values.
 f=fake(row({checked:true,d:'A7-04'}));const r=await sync(f);assert.equal(r.status,'checked');assert.equal(r.match.highlighted,true);assert.equal(f.writes.length,1);
 f=fake(row({checked:true,d:'A7-04'}));assert.equal((await sync(f,item({checked:true,newLocation:'A7-04'}))).status,'checked');
 // Still changed, with no write: ticked at another location, card or row changed, or unticked since the scan.
 for(const [sheet,expected] of [[{checked:true,d:'B1'},{}],[{checked:true,d:''},{}],[{card:'Other'},{}],[{},{row:3}],[{},{checked:true,highlighted:true,newLocation:'A7-04'}]]){f=fake(row(sheet));assert.equal((await sync(f,item(expected))).status,'changed');assert.equal(f.writes.length,0);}
 f=fake(row({checked:true,d:'A7-04'}),{paint:false});assert.equal((await sync(f)).status,'error write_unverified');
 console.log({status:'passed',checks:['new card: tick + green + D in one batch','ticked + green + same D: already_checked, no write','tick kept without green: retry writes the green and reports checked','ticked at another location or with no D: changed, no write','changed card, moved row or unticked since scan: changed, no write','green still missing after the write: rejected']});
})().catch(e=>{console.error(e);process.exitCode=1});
