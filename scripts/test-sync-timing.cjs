const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/batch.js','utf8');
function fixture(){
 let queue=[],timers=new Map(),next=0,calls=[],resolve,reject,now=100000;
 const els=new Map(),el=()=>({textContent:'',dataset:{},children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}});
 const store={snapshot:async()=>({rows:[],loadedAt:now}),queue:async()=>structuredClone(queue),session:async()=>({id:'test',location:'A',name:'QA'}),record:async x=>{queue.push(x);},apply:async results=>{queue=queue.filter(x=>!results.some(r=>r.id===x.id&&r.status==='checked'));for(const r of results)if(r.status!=='checked')queue.find(x=>x.id===r.id).conflict=r.status;}};
 class Clock extends Date{static now(){return now;}}
 const context={Date:Clock,window:{rentalLocal:store},$:id=>{if(!els.has(id))els.set(id,el());return els.get(id);},document:{createElement:el},navigator:{locks:{request:async(n,o,fn)=>fn({})}},crypto:require('crypto'),setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms,due:now+ms});return next;},clearTimeout:id=>timers.delete(id),api:async body=>{calls.push(body);return new Promise((ok,fail)=>{resolve=status=>ok({status:'synced',results:body.items.map(x=>({id:x.id,number:x.number,status:status||'checked'}))});reject=fail;});}};
 vm.runInNewContext(source,context);
 return {batch:context.window.rentalBatch,queue:()=>queue,timers:()=>[...timers.values()],calls:()=>calls,resolve:status=>resolve(status),reject:message=>reject(Error(message)),advance:ms=>{now+=ms;for(const [id,t] of timers)if(t.due<=now){timers.delete(id);t.fn();}}};
}
const match=i=>({number:String(123456+i),row:i+2,card:'QA',location:'A',checked:false,highlighted:false,newLocation:''});
const tick=()=>new Promise(r=>setImmediate(r));
async function five(f){for(let i=0;i<5;i++)await f.batch.save(match(i));await tick();assert.equal(f.calls().length,1);assert.equal(f.calls()[0].items.length,5);}
(async()=>{
 const checks=[];
 const f=fixture();await f.batch.save(match(0));f.advance(9000);await tick();assert.equal(f.calls().length,0);await f.batch.save(match(1));f.advance(9999);await tick();assert.equal(f.calls().length,0);f.advance(1);await tick();assert.equal(f.calls().length,1);f.resolve();await tick();assert.equal(f.queue().length,0);checks.push('10-second idle sync resets on latest confirmation; no premature request');
 const g=fixture();await five(g);g.advance(2000);await g.batch.save(match(5));g.advance(3000);g.resolve();await tick();assert.equal(g.queue().length,1);assert.equal(g.timers()[0].ms,7000);g.advance(6999);await tick();assert.equal(g.calls().length,1);g.advance(1);await tick();assert.equal(g.calls().length,2);g.resolve();await tick();assert.equal(g.queue().length,0);checks.push('sixth confirmation during five-card sync flushes at its original 10-second deadline');
 const h=fixture();await five(h);await h.batch.save(match(5));h.advance(10000);await tick();assert.equal(h.calls().length,1);h.resolve();await tick();assert.equal(h.timers()[0].ms,0);h.advance(0);await tick();assert.equal(h.calls().length,2);h.resolve();await tick();assert.equal(h.queue().length,0);checks.push('timer firing during slow in-flight sync is rearmed immediately on completion');
 const c=fixture();await five(c);c.resolve('changed');await tick();assert.equal(c.queue().length,5);assert.equal(c.timers().length,0);checks.push('conflicts retained without automatic retry loop');
 for(const message of ['rate_limited','schema_changed','sheet_unavailable']){const e=fixture();await five(e);await e.batch.save(match(5));e.reject(message);await tick();assert.equal(e.queue().length,6);assert.deepEqual(e.timers().map(t=>t.ms),message==='rate_limited'?[60000]:[]);}checks.push('429 keeps 60-second retry; schema/network failures keep pending and do not create a 10-second retry loop');
 console.log(JSON.stringify({status:'passed',checks,limitations:'Mock network/storage and virtual clock; browser tests exercise actual IndexedDB separately.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
