'use strict';
const {SHEET_ID,TAB_ID,validLocation}=require('./rental.cjs');
const base=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const fields='sheets(properties(sheetId),data(startRow,rowData(values(formattedValue,dataValidation,userEnteredValue,userEnteredFormat(backgroundColorStyle)))))';
const text=v=>String(v??'').trim();
const isNumber=v=>typeof v==='string'&&/^\d{6,12}$/.test(v);
function decode(grid,header=false){
 if(grid?.sheets?.length!==1||grid.sheets[0].properties?.sheetId!==TAB_ID)throw Error('schema_changed');
 const rows=[];
 for(const block of grid.sheets[0].data||[])for(const [i,r] of (block.rowData||[]).entries()){
  const row=(block.startRow||0)+i+1,c=r.values||[];
  if(row===1){if(header&&['Cert','Location','Checklist','New Location','Card'].some((v,j)=>text(c[j]?.formattedValue)!==v))throw Error('schema_changed');continue;}
  const number=text(c[0]?.formattedValue);if(!number)continue;
  const checkbox=c[2],color=checkbox?.userEnteredFormat?.backgroundColorStyle?.rgbColor;
  rows.push({number,row,location:text(c[1]?.formattedValue),card:text(c[4]?.formattedValue),newLocation:text(c[3]?.formattedValue),checked:checkbox?.userEnteredValue?.boolValue===true,highlighted:color?.green===1&&!color?.red&&!color?.blue,valid:checkbox?.dataValidation?.condition?.type==='BOOLEAN'&&!checkbox.dataValidation.condition.values?.length&&!checkbox.userEnteredValue?.formulaValue&&!c[3]?.userEnteredValue?.formulaValue});
 }
 if(header&&!grid.sheets[0].data?.some(b=>(b.startRow||0)===0&&b.rowData?.length))throw Error('schema_changed');
 return rows;
}
async function snapshot(google){
 const grid=await google(`${base}?ranges=${encodeURIComponent("'Sheet1'!A1:E")}&includeGridData=true&fields=${encodeURIComponent(fields)}`);
 return {status:'ready',version:1,target:SHEET_ID,loadedAt:new Date().toISOString(),rows:decode(grid,true)};
}
function validItems(items){return Array.isArray(items)&&items.length>0&&items.length<=5&&new Set(items.map(x=>x?.number)).size===items.length&&new Set(items.map(x=>x?.id)).size===items.length&&items.every(x=>x&&typeof x.id==='string'&&x.id.length>0&&x.id.length<=100&&isNumber(x.number)&&validLocation(x.newLocation)&&x.expected&&Number.isInteger(x.expected.row)&&x.expected.row>=2&&['location','card','newLocation'].every(k=>typeof x.expected[k]==='string')&&typeof x.expected.checked==='boolean'&&typeof x.expected.highlighted==='boolean');}
async function sync(items,google){
 if(!validItems(items))return {status:'invalid'};
 const fresh=await snapshot(google),results=[],writes=[],requests=[];
 for(const item of items){
  const matches=fresh.rows.filter(r=>r.number===item.number),found=matches[0];
  const result={id:item.id,number:item.number};
  if(matches.length!==1){results.push({...result,status:matches.length?'duplicate':'not_found'});continue;}
  if(!found.valid){results.push({...result,status:'invalid_checkbox'});continue;}
  if(['row','location','card'].some(k=>item.expected[k]!==found[k])){results.push({...result,status:'changed'});continue;}
  const newLocation=item.newLocation.trim();
  if(found.checked&&found.highlighted&&found.newLocation===newLocation){results.push({...result,status:'already_checked',match:found});continue;}
  if(['checked','highlighted','newLocation'].some(k=>item.expected[k]!==found[k])){results.push({...result,status:'changed'});continue;}
  writes.push({item,found,newLocation});
  requests.push({updateCells:{range:{sheetId:TAB_ID,startRowIndex:found.row-1,endRowIndex:found.row,startColumnIndex:2,endColumnIndex:4},rows:[{values:[{userEnteredValue:{boolValue:true}},{userEnteredValue:{stringValue:newLocation}}]}],fields:'userEnteredValue'}});
  requests.push({repeatCell:{range:{sheetId:TAB_ID,startRowIndex:found.row-1,endRowIndex:found.row,startColumnIndex:2,endColumnIndex:3},cell:{userEnteredFormat:{backgroundColorStyle:{rgbColor:{red:0,green:1,blue:0}}}},fields:'userEnteredFormat.backgroundColorStyle'}});
 }
 if(requests.length){
  const receipt=await google(`${base}:batchUpdate?fields=${encodeURIComponent('updatedSpreadsheet('+fields+')')}`,{method:'POST',body:{requests,includeSpreadsheetInResponse:true,responseIncludeGridData:true,responseRanges:[`'Sheet1'!A${Math.min(...writes.map(x=>x.found.row))}:E${Math.max(...writes.map(x=>x.found.row))}`]}});
  const after=decode(receipt.updatedSpreadsheet);
  for(const {item,found,newLocation} of writes){
   const match=after.find(r=>r.row===found.row);
   if(!match||!match.valid||match.number!==item.number||match.location!==found.location||match.card!==found.card||!match.checked||!match.highlighted||match.newLocation!==newLocation)throw Error('write_unverified');
   results.push({id:item.id,number:item.number,status:'checked',match});
  }
 }
 return {status:'synced',results};
}
// Retry only read/rate-limit responses. An ambiguous write is revalidated on the next sync.
function withRetry(google,sleep=ms=>new Promise(r=>setTimeout(r,ms))){return async(url,options)=>{for(let attempt=0;;attempt++){try{return await google(url,options);}catch(e){if(e.status!==429||attempt>=2)throw e;await sleep(1000*2**attempt+Math.floor(Math.random()*300));}}};}
module.exports={snapshot,sync,validItems,decode,withRetry};
