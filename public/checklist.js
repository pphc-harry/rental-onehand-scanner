'use strict';
// Location session: pick a location, tick its cards off by scanning, then review what was not scanned.
window.rentalChecklist=(()=>{
 const nameKey='rental-scanner-name',store=window.rentalLocal;
 let tab='todo',finishing=false,greeted=false,shownLocations='',counts=new Map();
 const time=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
 async function data(){
  const [s,session,scans,queue]=await Promise.all([store.snapshot(),store.session(),store.scans(),store.queue()]);
  if(!session)return {snapshot:s};
  const mine=new Map(scans.filter(x=>x.session===session.id).map(x=>[x.number,x])),queued=new Map(queue.map(x=>[x.number,x]));
  const cards=(s?.rows||[]).filter(r=>rentalBatch.where(r)===session.location);
  return {snapshot:s,session,mine,queued,cards,done:cards.filter(r=>mine.has(r.number)),todo:cards.filter(r=>!mine.has(r.number)),waiting:queue.filter(x=>mine.get(x.number)?.id===x.id)};
 }
 function item(row,mark){const li=document.createElement('li'),text=document.createElement('span'),cert=document.createElement('span'),card=document.createElement('span'),m=document.createElement('span');cert.className='cert';cert.textContent=row.number;card.className='card';card.textContent=row.card;m.className='mark';m.textContent=mark;text.append(cert,card);li.append(text,m);return li;}
 function empty(text){const li=document.createElement('li');li.className='empty';li.textContent=text;return li;}
 function renderStart(snapshot){
  const list=rentalBatch.locations(snapshot),key=JSON.stringify(list);if(key===shownLocations)return;shownLocations=key;
  const select=$('location-select'),previous=select.value;
  select.replaceChildren(new Option(list.length?'Choose a location':'No locations loaded yet',''),...list.map(l=>new Option(`${l.name} · ${l.count} card${l.count===1?'':'s'}`,l.name)));
  select.value=list.some(l=>l.name===previous)?previous:'';counts=new Map(list.map(l=>[l.name,l.count]));beginLabel();
 }
 function beginLabel(){const n=counts.get($('location-select').value);$('begin').textContent=n?`Load ${n} card${n===1?'':'s'} →`:'Load cards →';}
 async function render(){
  const d=await data(),active=!!d.session;
  document.body.classList.toggle('in-session',active);$('start-screen').hidden=active;$('checklist').hidden=!active;
  if(!greeted){greeted=true;message(active?`Checking ${d.session.location}. Open the camera to scan.`:'Enter your name and choose a location to begin.');}
  if(!active)return renderStart(d.snapshot);
  const earlier=d.todo.filter(r=>r.checked).length;
  $('cl-title').textContent=d.session.location;$('cl-who').textContent=`${d.session.name} · since ${time(d.session.startedAt)}`;
  $('cl-progress').textContent=`${d.done.length} / ${d.cards.length} scanned${earlier?` · ${earlier} of the rest already ticked in the Sheet`:''}`;
  $('cl-bar').max=Math.max(1,d.cards.length);$('cl-bar').value=d.done.length;
  $('tab-todo').textContent=`To scan ${d.todo.length}`;$('tab-done').textContent=`Scanned ${d.done.length}`;
  for(const [id,name] of [['tab-todo','todo'],['tab-done','done']])$(id).setAttribute('aria-pressed',String(tab===name));
  const rows=tab==='todo'?d.todo.map(r=>item(r,d.queued.has(r.number)?'Waiting to sync':r.checked?'✓ in Sheet':'')):d.done.sort((a,b)=>d.mine.get(b.number).at-d.mine.get(a.number).at).map(r=>{const q=d.queued.get(r.number);return item(r,`${time(d.mine.get(r.number).at)} · ${q?(q.conflict?'Needs review':'Waiting to sync'):'Synced'}`);});
  $('card-list').replaceChildren(...(rows.length?rows:[empty(tab==='todo'?(d.cards.length?'Every card on this list is scanned.':'No cards at this location in the downloaded list.'):'Nothing scanned yet.')]));
 }
 async function begin(){
  const name=$('scanner-name').value.trim(),location=$('location-select').value;
  $('start-error').textContent=!rentalBatch.isText(name)?'Enter your name (up to 60 characters).':!location?'Choose a location.':'';
  if($('start-error').textContent)return;
  $('begin').disabled=true;
  try{localStorage.setItem(nameKey,name);}catch{}
  try{
   await rentalBatch.reload();
   if(!rentalBatch.locations(await store.snapshot()).some(l=>l.name===location)){$('start-error').textContent='That location is no longer in the Sheet. Choose again.';return;}
   tab='todo';await store.setSession({id:crypto.randomUUID(),name,location,startedAt:Date.now()});await rentalBatch.render();
   message(`Checking ${location}. Open the camera to scan.`);
  }catch{$('start-error').textContent='Local storage failed. Try again.';}
  finally{$('begin').disabled=false;}
 }
 function finishControls(){for(const id of ['finish-sync','finish-anyway','finish-cancel'])$(id).disabled=finishing;}
 function waitingText(d){const conflicts=d.waiting.filter(x=>x.conflict).length;return d.waiting.length?`${d.waiting.length} scan${d.waiting.length===1?'':'s'} waiting to sync${conflicts?` · ${conflicts} need review`:''}.`:'All scans from this session are synced to the Sheet.';}
 async function openFinish(){
  const d=await data();if(!d.session)return;
  $('finish-title').textContent=`Finish ${d.session.location}?`;
  $('finish-scanned').textContent=d.done.length;$('finish-missing').textContent=d.todo.length;$('finish-earlier').textContent=d.todo.filter(r=>r.checked).length;
  $('missing-list').replaceChildren(...(d.todo.length?d.todo.map(r=>item(r,r.checked?'✓ in Sheet':'')):[empty('Every card on this list is scanned.')]));
  $('finish-status').textContent=waitingText(d);$('finish-anyway').hidden=true;$('finish-sync').textContent=d.waiting.length?'Sync & finish':'Finish';
  $('finish').hidden=false;$('finish').showModal();
 }
 async function end(){await store.setSession(null);tab='todo';$('finish').close();stopCamera();await rentalBatch.render();message('Location finished. Choose the next location.');}
 async function syncAndFinish(){
  if(finishing)return;finishing=true;finishControls();$('finish-status').textContent='Syncing…';
  try{
   await rentalBatch.sync(true);const d=await data();
   if(!d.waiting.length)return await end();
   $('finish-status').textContent=`${waitingText(d)} They stay on this device and sync later.`;$('finish-anyway').hidden=false;
  }catch{$('finish-status').textContent='Local storage failed. Session kept.';}
  finally{finishing=false;finishControls();}
 }
 function init(){
  try{$('scanner-name').value=localStorage.getItem(nameKey)||'';}catch{}
  $('begin').onclick=()=>void begin();$('location-select').onchange=()=>{$('start-error').textContent='';beginLabel();};$('scanner-name').oninput=()=>$('start-error').textContent='';
  for(const [id,name] of [['tab-todo','todo'],['tab-done','done']])$(id).onclick=()=>{tab=name;void render();};
  $('finish-location').onclick=()=>void openFinish();
  $('finish-sync').onclick=()=>void syncAndFinish();
  $('finish-anyway').onclick=async()=>{if(finishing)return;finishing=true;finishControls();try{await end();}catch{$('finish-status').textContent='Local storage failed. Session kept.';}finally{finishing=false;finishControls();}};
  $('finish-cancel').onclick=()=>$('finish').close();
  $('finish').addEventListener('cancel',e=>{if(finishing)e.preventDefault();});
  $('finish').addEventListener('close',()=>{$('finish').hidden=true;$('finish-location').focus({preventScroll:true});});
 }
 return {init,render};
})();
