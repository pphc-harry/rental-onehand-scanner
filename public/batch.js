'use strict';
window.rentalBatch=(()=>{
 let syncing=false,failed=false,loadingList=null,lastMessage='',retryTimer=null,idleTimer=null;
 const store=window.rentalLocal;
 const isText=value=>value.trim().length>0&&value.length<=60&&!/[\u0000-\u001f\u007f]/.test(value);
 // A card belongs to its New Location (D) once one is set, otherwise to its Location (B).
 const where=row=>String(row.newLocation??'').trim()||String(row.location??'').trim();
 // Cards ticked in C after the session started were scanned on another phone (or another app). Sessions without a baseline count none.
 const scannedElsewhere=session=>{const base=session.ticked&&new Set(session.ticked);return row=>!!base&&!!row.checked&&!base.has(row.number);};
 function locations(snapshot){const counts=new Map();for(const r of snapshot?.rows||[]){const l=where(r);if(isText(l))counts.set(l,(counts.get(l)||0)+1);}return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));}
 async function render(){
  const [snapshot,queue]=await Promise.all([store.snapshot(),store.queue()]);
  const conflicts=queue.filter(x=>x.conflict).length;
  $('sync-status').textContent=`${queue.length} pending${conflicts?` · ${conflicts} need review`:''}${syncing?' · Syncing…':lastMessage?' · '+lastMessage:''}`;
  $('list-status').textContent=snapshot?`Local list: ${snapshot.rows.length} rows · ${new Date(snapshot.loadedAt).toLocaleString()}`:'No local list yet. Connect to load the checklist.';
  // The chip is the only sync status on the scan screen; it opens the Sync & settings sheet.
  const chip=$('sync-chip');chip.textContent=syncing?'Syncing…':conflicts?`${conflicts} need${conflicts===1?'s':''} review`:failed&&queue.length?`${queue.length} not synced`:queue.length?`${queue.length} to sync`:'✓ Synced';chip.dataset.state=conflicts||failed&&queue.length?'warn':syncing||queue.length?'busy':'ok';
  $('sync-now').disabled=syncing||!queue.length;$('refresh-list').disabled=syncing||!!loadingList;
  $('pending-list').replaceChildren();
  for(const item of queue){const li=document.createElement('li'),label=document.createElement('span');label.textContent=`${item.number} → ${item.newLocation}${item.conflict?' · '+item.conflict+' — check Sheet, remove and rescan':''}`;li.append(label);if(item.conflict){const b=document.createElement('button');b.textContent='Remove local entry';b.disabled=syncing;b.onclick=async()=>{if(!confirm(`Remove pending ${item.number}? This will not change the Sheet. Rescan after checking its current data.`))return;try{await store.remove(item);await refresh();await render();}catch{lastMessage='Local storage failed. Entry retained.';}};li.append(b);}$('pending-list').append(li);}
  await window.rentalChecklist?.render();
 }
 async function refresh(quiet=false){
  if(loadingList)return loadingList;
  loadingList=(async()=>{if(!quiet){lastMessage='Loading checklist…';await render();}const data=await api({action:'snapshot'});if(data.status!=='ready'||data.version!==1||!Array.isArray(data.rows))throw Error('sheet_unavailable');await store.setSnapshot(data);if(!quiet)lastMessage='List refreshed';return data;})();
  try{return await loadingList;}finally{loadingList=null;await render();}
 }
 const reload=(quiet=false)=>refresh(quiet).catch(async e=>{lastMessage=e.message==='rate_limited'?'Sheet busy. Local list kept; retry shortly.':'Could not load Sheet. Existing local list kept.';await render();});
 const poll=()=>syncing?null:reload(true);
 async function lookup(number){let s=await store.snapshot();if(!s)s=await refresh();const session=await store.session();if(!session)throw Error('no_session');const matches=s.rows.filter(x=>x.number===number);if(matches.length!==1)return {status:matches.length?'duplicate':'not_found',number};if(!matches[0].valid)return {status:'invalid_checkbox',number};if(where(matches[0])!==session.location)return {status:'other_location',number,location:where(matches[0])};if((await store.scans()).some(x=>x.session===session.id&&x.number===number))return {status:'scanned',number};const queued=(await store.queue()).find(x=>x.number===number);if(queued)return {status:'pending',number};if(scannedElsewhere(session)(matches[0]))return {status:'team_scanned',number};return {...matches[0],status:'matched'};}
 // D receives the checked location; scannedBy stays on this device until the backend has a column for it.
 async function save(match){
  const session=await store.session();if(!session)throw Error('no_session');
  const id=crypto.randomUUID(),at=Date.now();
  await store.record({id,number:match.number,expected:{row:match.row,card:match.card,location:match.location,checked:match.checked,highlighted:match.highlighted,newLocation:match.newLocation},newLocation:session.location,scannedBy:session.name,createdAt:at},{id,number:match.number,location:session.location,by:session.name,at,session:session.id});
  lastMessage='Saved on this device';await render();
  clearTimeout(idleTimer);
  if((await store.queue()).filter(x=>!x.conflict).length>=5)void sync(false);else idleTimer=setTimeout(()=>void sync(true),30000);
 }
 async function sync(manual=true){
  if(syncing)return;
  if(!navigator.locks){lastMessage='Browser update needed for safe sync. Pending entries kept.';await render();return;}
  syncing=true;failed=false;clearTimeout(retryTimer);clearTimeout(idleTimer);lastMessage='';await render();
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
  });}catch(e){failed=true;lastMessage=e.message==='schema_changed'?'Sheet columns changed. Sync paused; pending entries kept.':e.message==='rate_limited'?'Sheet busy — retrying in 60s. Pending entries kept.':'Sync not verified. Pending entries kept; tap Sync now.';if(e.message==='rate_limited')retryTimer=setTimeout(()=>void sync(true),60000);}
  finally{syncing=false;await render();}
 }
 async function exportCSV(){
  const [s,q,scans]=await Promise.all([store.snapshot(),store.queue(),store.scans()]);const rows=[['Cert','Current Location','Card','New Location','State','Scanned by','Scanned at']];
  const last=new Map(scans.map(x=>[x.number,x])),by=n=>{const x=last.get(n);return x?[x.by,new Date(x.at).toLocaleString()]:['',''];};
  for(const r of s?.rows||[]){const p=q.find(x=>x.number===r.number);rows.push([r.number,r.location,r.card,p?.newLocation??r.newLocation,p?(p.conflict?'Needs review':'Pending sync'):(r.checked?'Checked in downloaded list':'Unchecked in downloaded list'),...by(r.number)]);}
  for(const p of q)if(!s?.rows.some(r=>r.number===p.number))rows.push([p.number,p.expected.location,p.expected.card,p.newLocation,'Pending sync',...by(p.number)]);
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='rental-local-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function init(){
  $('sync-now').onclick=()=>void sync(true);
  $('refresh-list').onclick=()=>void reload();
  $('export-local').onclick=()=>void exportCSV();
  const tools=$('tools');
  $('sync-chip').onclick=()=>{if($('pending-list').querySelector('button'))$('pending').open=true;tools.hidden=false;tools.showModal();};$('tools-close').onclick=()=>tools.close();
  tools.addEventListener('click',e=>{const r=tools.getBoundingClientRect();if(e.target===tools&&(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right))tools.close();});
  tools.addEventListener('close',()=>{tools.hidden=true;$('sync-chip').focus({preventScroll:true});});
  try{await render();await refresh().catch(e=>{lastMessage=e.message==='schema_changed'?'Sheet columns changed. Sync paused; contact your team.':'Could not refresh Sheet; using saved list if available';});await render();if((await store.queue()).some(x=>!x.conflict))void sync(true);}
  catch{ $('sync-status').textContent='Local storage unavailable. Confirm is blocked until storage works.';}
  addEventListener('online',()=>void sync(true));
  addEventListener('beforeunload',e=>{if($('pending-list').children.length){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void render();});
 }
 return {init,lookup,save,refresh,reload,poll,sync,render,locations,where,isText,scannedElsewhere};
})();
