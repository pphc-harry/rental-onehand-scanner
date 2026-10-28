'use strict';
// IndexedDB transactions keep pending confirmations durable across reloads and tabs.
window.rentalLocal=(()=>{
 const opened=new Promise((resolve,reject)=>{const r=indexedDB.open('rental-onehand-batch5',1);r.onupgradeneeded=()=>{r.result.createObjectStore('meta');r.result.createObjectStore('queue',{keyPath:'number'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function tx(stores,mode,fn){const db=await opened;return new Promise((resolve,reject)=>{const t=db.transaction(stores,mode);let result;t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('storage_failed'));try{fn(t,v=>{result=v;});}catch(e){t.abort();reject(e);}});}
 const get=(store,key)=>tx([store],'readonly',(t,done)=>{const r=t.objectStore(store).get(key);r.onsuccess=()=>done(r.result);});
 return {
  snapshot:()=>get('meta','snapshot'),
  setSnapshot:value=>tx(['meta'],'readwrite',t=>t.objectStore('meta').put(value,'snapshot')),
  queue:()=>tx(['queue'],'readonly',(t,done)=>{const r=t.objectStore('queue').getAll();r.onsuccess=()=>done(r.result.sort((a,b)=>a.createdAt-b.createdAt));}),
  add:item=>tx(['queue'],'readwrite',t=>t.objectStore('queue').add(item)),
  remove:item=>tx(['queue'],'readwrite',t=>{const s=t.objectStore('queue'),r=s.get(item.number);r.onsuccess=()=>{if(r.result?.id===item.id)s.delete(item.number);};}),
  apply:results=>tx(['meta','queue'],'readwrite',t=>{
   const q=t.objectStore('queue'),m=t.objectStore('meta'),s=m.get('snapshot');
   s.onsuccess=()=>{const data=s.result;if(data){for(const result of results)if(result.match){const i=data.rows.findIndex(x=>x.row===result.match.row);if(i>=0)data.rows[i]=result.match;}m.put(data,'snapshot');}};
   for(const result of results){const r=q.get(result.number);r.onsuccess=()=>{if(r.result?.id!==result.id)return;if(['checked','already_checked'].includes(result.status))q.delete(result.number);else q.put({...r.result,conflict:result.status});};}
  })
 };
})();
