// Separate rental integration approved by Harry, Discord 1564581498760470550.
const SHEET_ID='1XGWNnSCZtcTZ6LWHy7AMdwyqZEXoK6zNggKx7cdnkj8',TAB_ID=1932546105,TAB='Sheet1';
const base=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const fields='sheets(properties(sheetId),data(rowData(values(formattedValue,dataValidation,userEnteredValue,userEnteredFormat(backgroundColorStyle)))))';
const text=v=>String(v??'').trim();
const validLocation=v=>typeof v==='string'&&v.trim().length>0&&v.length<=60&&!/[\u0000-\u001f\u007f]/.test(v);
function inspect(grid,number){
 if(grid.sheets?.length!==1||grid.sheets[0].properties?.sheetId!==TAB_ID)throw Error('schema_changed');
 const cells=grid.sheets[0].data?.[0]?.rowData?.[0]?.values||[],c=cells[2];
 if(text(cells[0]?.formattedValue)!==number)throw Error('row_changed');
 if(c?.dataValidation?.condition?.type!=='BOOLEAN'||c.dataValidation.condition.values?.length||c.userEnteredValue?.formulaValue)throw Error('checkbox_changed');
 if(cells[3]?.userEnteredValue?.formulaValue)throw Error('location_formula');
 return {location:text(cells[1]?.formattedValue),newLocation:text(cells[3]?.formattedValue),card:text(cells[4]?.formattedValue),checked:c.userEnteredValue?.boolValue===true,highlighted:c.userEnteredFormat?.backgroundColorStyle?.rgbColor?.green===1&&!(c.userEnteredFormat?.backgroundColorStyle?.rgbColor?.red)&&!(c.userEnteredFormat?.backgroundColorStyle?.rgbColor?.blue)};
}
async function lookup(number,google){
 if(typeof number!=='string'||!/^\d{6,12}$/.test(number))return {status:'invalid'};
 const data=await google(`${base}/values/${encodeURIComponent("'Sheet1'!A1:E")}?valueRenderOption=FORMATTED_VALUE`);
 const rows=data.values;
 if(!rows?.length||['Cert','Location','Checklist','New Location','Card'].some((v,i)=>text(rows[0][i])!==v))throw Error('schema_changed');
 const matches=[];rows.forEach((r,i)=>{if(i&&text(r[0])===number)matches.push(i+1);});
 if(!matches.length)return {status:'not_found',number};
 if(matches.length!==1)return {status:'duplicate',number,count:matches.length};
 const row=matches[0],range=`'${TAB}'!A${row}:E${row}`;
 const grid=await google(`${base}?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=${encodeURIComponent(fields)}`);
 return {status:'matched',number,row,...inspect(grid,number)};
}
async function confirm(number,expected,google,newLocation){
 if(!validLocation(newLocation))return {status:'invalid_location'};
 newLocation=newLocation.trim();
 const found=await lookup(number,google);
 if(found.status!=='matched')return found;
 if(!expected||['row','location','card'].some(k=>expected[k]!==found[k]))return {status:'changed',number};
 if(found.checked&&found.highlighted&&found.newLocation===newLocation)return {...found,status:'already_checked'};
 const range=`'${TAB}'!A${found.row}:E${found.row}`;
 const receipt=await google(`${base}:batchUpdate?fields=${encodeURIComponent('updatedSpreadsheet('+fields+')')}`,{method:'POST',body:{includeSpreadsheetInResponse:true,responseIncludeGridData:true,responseRanges:[range],requests:[{repeatCell:{range:{sheetId:TAB_ID,startRowIndex:found.row-1,endRowIndex:found.row,startColumnIndex:2,endColumnIndex:3},cell:{userEnteredValue:{boolValue:true},userEnteredFormat:{backgroundColorStyle:{rgbColor:{red:0,green:1,blue:0}}}},fields:'userEnteredValue,userEnteredFormat.backgroundColorStyle'}},{repeatCell:{range:{sheetId:TAB_ID,startRowIndex:found.row-1,endRowIndex:found.row,startColumnIndex:3,endColumnIndex:4},cell:{userEnteredValue:{stringValue:newLocation}},fields:'userEnteredValue'}}]}});
 const after=inspect(receipt.updatedSpreadsheet,number);
 if(!after.checked||!after.highlighted||after.newLocation!==newLocation||after.card!==found.card||after.location!==found.location)throw Error('write_unverified');
 return {...found,status:'checked',checked:true,highlighted:true,newLocation};
}
module.exports={lookup,confirm,validLocation,SHEET_ID,TAB_ID};
