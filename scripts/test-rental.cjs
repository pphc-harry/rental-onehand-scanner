const assert=require('node:assert/strict'),fs=require('node:fs');
const r=require('../backend/lib/rental.cjs');
const headers=['Cert','Location','Checklist','New Location','Card'];
function fake(rows,opts={}){
 const writes=[];let checked=!!opts.checked,highlighted=!!opts.highlighted,newLocation=opts.newLocation||'';
 const grid=()=>({sheets:[{properties:{sheetId:r.TAB_ID},data:[{rowData:[{values:[{formattedValue:opts.moved?'99999999':rows[0]?.[0]},{formattedValue:rows[0]?.[1]},{dataValidation:{condition:{type:opts.badCheckbox?'TEXT_EQ':'BOOLEAN'}},userEnteredFormat:highlighted?{backgroundColorStyle:{rgbColor:{green:1}}}:{},userEnteredValue:{boolValue:checked}},{formattedValue:newLocation,userEnteredValue:opts.formula?{formulaValue:'=1'}:{stringValue:newLocation}},{formattedValue:rows[0]?.[4]}]}]}]}]});
 return {writes,google:async(url,o={})=>{
  assert.ok(url.includes(r.SHEET_ID));
  if(o.method){writes.push(o.body);assert.equal(o.body.requests.length,2);const [a,b]=o.body.requests.map(q=>q.repeatCell);
   assert.deepEqual(a.range,{sheetId:r.TAB_ID,startRowIndex:1,endRowIndex:2,startColumnIndex:2,endColumnIndex:3});
   assert.equal(a.fields,'userEnteredValue,userEnteredFormat.backgroundColorStyle');assert.deepEqual(a.cell,{userEnteredValue:{boolValue:true},userEnteredFormat:{backgroundColorStyle:{rgbColor:{red:0,green:1,blue:0}}}});
   assert.deepEqual(b.range,{...a.range,startColumnIndex:3,endColumnIndex:4});assert.equal(b.fields,'userEnteredValue');assert.ok(r.validLocation(b.cell.userEnteredValue.stringValue));
   checked=true;highlighted=!opts.missingPaint;if(!opts.missingLocation)newLocation=b.cell.userEnteredValue.stringValue;
   return {updatedSpreadsheet:grid()};
  }
  if(url.includes('/values/'))return {values:[opts.badSchema?['Cert','Location','Checklist','Card']:headers,...rows]};return grid();
 }};
}
(async()=>{
 const expected={row:2,location:'A1',card:'Card'},rows=[['00123456','A1',false,'','Card']];
 let f=fake(rows);assert.equal((await r.lookup('00123456',f.google)).card,'Card');assert.equal(f.writes.length,0);
 assert.equal((await r.confirm('00123456',expected,f.google,'007')).newLocation,'007');assert.equal(f.writes.length,1);
 assert.equal((await r.confirm('00123456',expected,f.google,'007')).status,'already_checked');assert.equal(f.writes.length,1);
 assert.equal((await r.confirm('00123456',expected,f.google,'8')).newLocation,'8');assert.equal(f.writes.length,2);
 for(const value of ['Shelf A-3','架 B 02','=1+1','007','x'.repeat(60)]){f=fake(rows);assert.equal((await r.confirm('00123456',expected,f.google,value)).newLocation,value);assert.equal(f.writes.length,1);}
 for(const value of [undefined,null,'','   ','x'.repeat(61),'a\nb','a\tb',7]){f=fake(rows);assert.equal((await r.confirm('00123456',expected,f.google,value)).status,'invalid_location');assert.equal(f.writes.length,0);}
 for(const [other,n,status] of [[rows,'123456','not_found'],[[['87654321','00123456',false,'00123456','00123456']],'00123456','not_found'],[[['00123456'],['00123456']],'00123456','duplicate']]){f=fake(other);assert.equal((await r.confirm(n,expected,f.google,'7')).status,status);assert.equal(f.writes.length,0);}
 for(const change of [{row:3},{location:'Changed'},{card:'Changed'}]){f=fake(rows);assert.equal((await r.confirm('00123456',{...expected,...change},f.google,'7')).status,'changed');assert.equal(f.writes.length,0);}
 for(const opts of [{moved:true},{badCheckbox:true},{badSchema:true},{formula:true}]){f=fake(rows,opts);await assert.rejects(r.confirm('00123456',expected,f.google,'7'));assert.equal(f.writes.length,0);}
 for(const opts of [{missingPaint:true},{missingLocation:true}]){f=fake(rows,opts);await assert.rejects(r.confirm('00123456',expected,f.google,'7'),/write_unverified/);}
 const handler=require('../backend/api/rental.js');process.env.SCANNER_GOOGLE_SERVICE_ACCOUNT='QA configured sentinel';
 async function request(body,headers={},method='POST'){let code,data;const res={setHeader(){},status(c){code=c;return this;},json(d){data=d;return this;}};await handler({body,headers,method},res);return {code,data};}
 assert.equal((await request({}, {},'GET')).code,405);assert.equal((await request({}, {origin:'https://unapproved.example'})).code,403);
 for(const body of [{action:'confirm',number:'00123456'},{action:'confirm',number:'00123456',confirmed:true,expected},{action:'confirm',number:'00123456',confirmed:true,expected,newLocation:'   '},{action:'lookup',number:'00123456',sheetId:'other'},{action:'lookup',number:123456},{action:'lookup',number:'12a456'},null,[]])assert.equal((await request(body)).code,400);
 const result={status:'passed',checks:['A-only exact full match, leading zeros','Card E and New Location D schema guards','C checkbox and bright green + D location in same batch','location validation and formula guard','same-location idempotent; checked card location can change','no writes on lookup/missing/duplicate/stale card/moved row/invalid checkbox','missing color or location receipt rejected','API method/origin/confirmation/target/input guards']};console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1});
