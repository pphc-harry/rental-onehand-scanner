'use strict';
window.rentalBatch=(()=>{
 let syncing=false,loadingList=null,lastMessage='',retryTimer=null;
 const store=window.rentalLocal;
 async function render(){
  const [snapshot,queue]=await Promise.all([store.snapshot(),store.queue()]);
  const conflicts=queue.filter(x=>x.conflict).length;
  $('sync-status').textContent=`${queue.length} pending${conflicts?` · ${conflicts} need review`:''}${syncing?' · Syncing…':lastMessage?' · '+lastMessage:''}`;
  $('list-status').textContent=snapshot?`Local list: ${snapshot.rows.length} rows · ${new Date(snapshot.loadedAt).toLocaleString()}`:'No local list yet. Connect to load the checklist.';
  $('sync-now').disabled=syncing||!queue.length;$('refresh-list').disabled=syncing||!!loadingList;
  $('pending-list').replaceChildren();
  for(const item of queue){const li=document.createElement('li'),label=document.createElement('span');label.textContent=`${item.number} → ${item.newLocation}${item.conflict?' · '+item.conflict+' — check Sheet, remove and rescan':''}`;li.append(label);if(item.conflict){const b=document.createElement('button');b.textContent='Remove local entry';b.disabled=syncing;b.onclick=async()=>{if(!confirm(`Remove pending ${item.number}? This will not change the Sheet. Rescan after checking its current data.`))return;try{await store.remove(item);await refresh();await render();}catch{lastMessage='Local storage failed. Entry retained.';}};li.append(b);}$('pending-list').append(li);}
 }
 async function refresh(){
  if(loadingList)return loadingList;
  loadingList=(async()=>{lastMessage='Loading checklist…';await render();const data=await api({action:'snapshot'});if(data.status!=='ready'||data.version!==1||!Array.isArray(data.rows))throw Error('sheet_unavailable');await store.setSnapshot(data);lastMessage='List refreshed';return data;})();
  try{return await loadingList;}finally{loadingList=null;await render();}
 }
 async function lookup(number){let s=await store.snapshot();if(!s)s=await refresh();const matches=s.rows.filter(x=>x.number===number);if(matches.length!==1)return {status:matches.length?'duplicate':'not_found',number};if(!matches[0].valid)return {status:'invalid_checkbox',number};const queued=(await store.queue()).find(x=>x.number===number);if(queued)return {status:'pending',number};return {...matches[0],status:'matched'};}
 async function save(match,newLocation){
  await store.add({id:crypto.randomUUID(),number:match.number,expected:{row:match.row,card:match.card,location:match.location,checked:match.checked,highlighted:match.highlighted,newLocation:match.newLocation},newLocation,createdAt:Date.now()});
  lastMessage='Saved on this device';await render();
  if((await store.queue()).filter(x=>!x.conflict).length>=5)void sync(false);
 }
 async function sync(manual=true){
  if(syncing)return;
  if(!navigator.locks){lastMessage='Browser update needed for safe sync. Pending entries kept.';await render();return;}
  syncing=true;clearTimeout(retryTimer);lastMessage='';await render();
  try{await navigator.locks.request('rental-batch-sync',{ifAvailable:true},async lock=>{
   if(!lock){lastMessage='Another tab is syncing';return;}
   do{
    const all=(await store.queue()).filter(x=>!x.conflict);
    if(!all.length||(!manual&&all.length<5))break;
    const selected=all.slice(0,5),items=selected.map(({id,number,expected,newLocation})=>({id,number,expected,newLocation}));
    const response=await api({action:'sync',confirmed:true,items});
    if(response.status!=='synced'||!Array.isArray(response.results)||response.results.length!==items.length||!items.every(x=>response.results.filter(r=>r.id===x.id&&r.number===x.number).length===1))throw Error('sheet_unavailable');
    await store.apply(response.results);lastMessage=`${response.results.filter(x=>['checked','already_checked'].includes(x.status)).length} synced to Sheet`;await render();
   }while(true);
  });}catch(e){lastMessage=e.message==='schema_changed'?'Sheet columns changed. Sync paused; pending entries kept.':e.message==='rate_limited'?'Sheet busy — retrying in 60s. Pending entries kept.':'Sync not verified. Pending entries kept; tap Sync now.';if(e.message==='rate_limited')retryTimer=setTimeout(()=>void sync(true),60000);}
  finally{syncing=false;await render();}
 }
 async function exportCSV(){
  const [s,q]=await Promise.all([store.snapshot(),store.queue()]);const rows=[['Cert','Current Location','Card','New Location','State']];
  for(const r of s?.rows||[]){const p=q.find(x=>x.number===r.number);rows.push([r.number,r.location,r.card,p?.newLocation??r.newLocation,p?(p.conflict?'Needs review':'Pending sync'):(r.checked?'Checked in downloaded list':'Unchecked in downloaded list')]);}
  for(const p of q)if(!s?.rows.some(r=>r.number===p.number))rows.push([p.number,p.expected.location,p.expected.card,p.newLocation,'Pending sync']);
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='rental-local-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function init(){
  $('sync-now').onclick=()=>void sync(true);
  $('refresh-list').onclick=()=>void refresh().catch(async e=>{lastMessage=e.message==='rate_limited'?'Sheet busy. Local list kept; retry shortly.':'Could not load Sheet. Existing local list kept.';await render();});
  $('export-local').onclick=()=>void exportCSV();
  try{await render();await refresh().catch(e=>{lastMessage=e.message==='schema_changed'?'Sheet columns changed. Sync paused; contact your team.':'Could not refresh Sheet; using saved list if available';});await render();if((await store.queue()).some(x=>!x.conflict))void sync(true);}
  catch{ $('sync-status').textContent='Local storage unavailable. Confirm is blocked until storage works.';}
  addEventListener('online',()=>void sync(true));
  addEventListener('beforeunload',e=>{if($('pending-list').children.length){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void render();});
 }
 return {init,lookup,save,refresh,sync,render};
})();
