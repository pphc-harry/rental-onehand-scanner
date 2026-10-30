// Dedicated entry mode authorized by Harry, Discord 1564212779563487294.
// The inventory reconciler and its B-match/D-tick rules are not involved.
const sheetId='1VFqjD7hvA6RV7VRYOPLdubO9X6W5Annb-g0is1q34JI';
const base=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
const range='Sheet1!B2:B';
async function health(g){
 const meta=await g(base+'?fields=properties(title),sheets(properties(sheetId,title))');
 if(!meta.sheets?.some(s=>s.properties.sheetId===0&&s.properties.title==='Sheet1'))throw Error('schema_changed');
 const access=await g(`https://www.googleapis.com/drive/v3/files/${sheetId}?supportsAllDrives=true&fields=capabilities(canEdit)`);
 if(access.capabilities?.canEdit!==true)throw Error('not_writable');
 return {status:'ready',title:meta.properties.title,range};
}
async function record(number,g){
 if(typeof number!=='string'||!/^\d{6,12}$/.test(number))throw Error('invalid');
 // Independent, fresh reads can share one network wait; never cache certs/rows.
 const [prior,meta]=await Promise.all([
  g(base+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE'),
  g(base+'?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))')
 ]);
 const matches=(prior.values||[]).flatMap((r,i)=>String(r[0]??'')===number?[i+2]:[]);
 if(matches.length)return {status:'already_recorded',row:matches[0],count:matches.length};
 // values.append may expand its detected table into adjacent columns. Use an
 // atomic B-only insert + write instead. Concurrent new cards shift B, never
 // overwrite each other. Row 1 and other columns are outside the write range.
 const tab=meta.sheets?.find(s=>s.properties.sheetId===0&&s.properties.title==='Sheet1')?.properties;
 if(!tab)throw Error('schema_changed');
 const rowIndex=1+(prior.values||[]).length;
 if(rowIndex>=100000)throw Error('sheet_full');
 const cell={sheetId:0,startRowIndex:rowIndex,endRowIndex:rowIndex+1,startColumnIndex:1,endColumnIndex:2};
 const requests=[];
 if(rowIndex>=tab.gridProperties.rowCount)requests.push({appendDimension:{sheetId:0,dimension:'ROWS',length:rowIndex-tab.gridProperties.rowCount+1}});
 requests.push({insertRange:{range:cell,shiftDimension:'ROWS'}},{updateCells:{range:cell,rows:[{values:[{userEnteredValue:{stringValue:number}}]}],fields:'userEnteredValue'}});
 await g(base+':batchUpdate',{method:'POST',body:{requests}});
 // A concurrent insert can move the new cell. Verify by exact value within B.
 const saved=await g(base+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE');
 const found=(saved.values||[]).flatMap((r,i)=>r[0]===number?[i+2]:[]);
 if(found.length!==1)throw Error('readback_failed');
 return {status:'recorded',row:found[0],range:'Sheet1!B'+found[0]};
}
module.exports={record,health,sheetId,range};
