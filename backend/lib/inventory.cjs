const SHEET_ID='1hnu4QctKUNfw060Re-4pZF6jrYjj89C-Cd_OrXnFivg';
const TAB='Buy Sheet', TAB_ID=0;
const YELLOW={red:1,green:1,blue:0};
function normal(value){return String(value??'').trim();}
async function reconcile(number,google,{dryRun=false}={}){
 if(!/^\d{6,12}$/.test(number))return {status:'invalid'};
 const base=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
 const data=await google(`${base}/values/${encodeURIComponent("'Buy Sheet'!B1:D")}?valueRenderOption=FORMATTED_VALUE`);
 const rows=data.values;
 if(!rows?.length||rows[0]?.[0]!=='Card Cert'||!/^(?:\d{1,2}\/\d{1,2}\s+)?STOCK TAKE$/i.test(normal(rows[0]?.[2])))throw Error('schema_changed');
 const matches=[];rows.forEach((r,i)=>{if(i&&normal(r[0])===number)matches.push(i+1);});
 if(!matches.length)return {status:'not_found',number};
 if(matches.length!==1)return {status:'duplicate',number,count:matches.length};
 const row=matches[0],range=encodeURIComponent(`'${TAB}'!B${row}:D${row}`);
 const fields='sheets(properties(sheetId),data(rowData(values(formattedValue,dataValidation,userEnteredValue,effectiveFormat(backgroundColor)))))';
 const inspectGrid=(grid)=>{
  if(grid.sheets?.[0]?.properties?.sheetId!==TAB_ID)throw Error('schema_changed');
  const cells=grid.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values||[];
  if(normal(cells[0]?.formattedValue)!==number)throw Error('row_changed');
  const d=cells[2];
  if(d?.dataValidation?.condition?.type!=='BOOLEAN'||d.dataValidation.condition.values?.length)throw Error('checkbox_changed');
  if(d.userEnteredValue?.formulaValue)throw Error('checkbox_formula');
  return d;
 };
 const before=inspectGrid(await google(`${base}?ranges=${range}&includeGridData=true&fields=${encodeURIComponent(fields)}`));
 if(dryRun)return {status:'matched_read_only',number,row,checked:before.userEnteredValue?.boolValue===true};
 const r={sheetId:TAB_ID,startRowIndex:row-1,endRowIndex:row,startColumnIndex:3,endColumnIndex:4};
 const receipt=await google(`${base}:batchUpdate?fields=${encodeURIComponent('updatedSpreadsheet('+fields+')')}`,{method:'POST',body:{includeSpreadsheetInResponse:true,responseIncludeGridData:true,responseRanges:[`'${TAB}'!B${row}:D${row}`],requests:[{repeatCell:{range:r,cell:{userEnteredValue:{boolValue:true},userEnteredFormat:{backgroundColor:YELLOW,backgroundColorStyle:{rgbColor:YELLOW}}},fields:'userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.backgroundColorStyle'}}]}});
 const after=inspectGrid(receipt.updatedSpreadsheet);const color=after.effectiveFormat?.backgroundColor;
 if(after.userEnteredValue?.boolValue!==true||color?.red!==1||color?.green!==1||(color?.blue||0)!==0)throw Error('write_unverified');
 return {status:'checked',number,row,alreadyChecked:before.userEnteredValue?.boolValue===true};
}
module.exports={reconcile,SHEET_ID};
