function deadline(p,ms,onTimeout){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout?.();reject(Error('Reading timed out. Check your connection and try again.'));},ms);})]).finally(()=>clearTimeout(timer));}
async function engine(){if(worker)return worker;if(!loading){loading=(async()=>{if(!window.Tesseract)throw Error('OCR engine unavailable. Check your connection and reload.');let cancelled=false;const init=Tesseract.createWorker('eng',1,{errorHandler:()=>{}}).then(w=>{if(cancelled){w.terminate();throw Error('OCR loading timed out');}return w;});const w=await deadline(init,60000,()=>{cancelled=true;});worker=w;return w;})().catch(e=>{loading=null;throw e;});}return loading;}
function makeCanvas(image,maxEdge=1800){const sw=image.naturalWidth||image.width,sh=image.naturalHeight||image.height;if(!sw||!sh)throw Error('Could not read image. Please use JPEG or PNG.');const scale=Math.min(2,maxEdge/Math.max(sw,sh));const c=document.createElement('canvas');c.width=Math.round(sw*scale);c.height=Math.round(sh*scale);const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.drawImage(image,0,0,c.width,c.height);return c;}
function wordsOf(data){return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));}
function findCandidates(data){const found=new Map();for(const w of wordsOf(data)){const number=w.text.trim();if(/^\d{6,12}$/.test(number)){const prior=found.get(number);if(!prior||w.confidence>prior.confidence)found.set(number,{number,confidence:w.confidence,bbox:w.bbox});}}return [...found.values()];}
async function recognize(w,c,mode,whitelist=''){await w.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist,user_defined_dpi:'300'});return (await deadline(w.recognize(c,{}, {text:true,blocks:true}),30000,()=>{w.terminate();worker=null;loading=null;})).data;}
function region(c,b){const h=b.y1-b.y0,pad=Math.max(8,h*.45),left=Math.max(0,b.x0-pad),top=Math.max(0,b.y0-pad),right=Math.min(c.width,b.x1+pad),bottom=Math.min(c.height,b.y1+pad);const out=document.createElement('canvas');const scale=Math.min(3,70/Math.max(h,1));out.width=Math.ceil((right-left)*scale);out.height=Math.ceil((bottom-top)*scale);out.getContext('2d').drawImage(c,left,top,right-left,bottom-top,0,0,out.width,out.height);return out;}
// Find connected red label borders at a bounded resolution, then deskew before OCR.
function labelRegions(source){
 const scale=Math.min(1,900/Math.max(source.width,source.height)),w=Math.round(source.width*scale),h=Math.round(source.height*scale);
 const small=document.createElement('canvas');small.width=w;small.height=h;const sx=small.getContext('2d',{willReadFrequently:true});sx.drawImage(source,0,0,w,h);
 const pixels=sx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h),queue=new Int32Array(w*h),labels=[],tilts=[];
 for(let i=0;i<mask.length;i++){const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2];mask[i]=r>100&&r>g*1.28&&r>b*1.12?1:0;}
 for(let start=0;start<mask.length;start++){
  if(!mask[start])continue;let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=start;mask[start]=0;
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const n=ny*w+nx;if(mask[n]){mask[n]=0;queue[tail++]=n;}}
  }
  // A border narrower than a whole label is one cut off at the frame edge: it only measures the tilt.
  const bw=maxX-minX,bh=maxY-minY,partial=bw/bh<1.7;if(tail<100||bw<75||bw/bh<1.1||bw/bh>7)continue;
  const tops=new Float64Array(bw+1).fill(h),bottoms=new Float64Array(bw+1).fill(-1);
  for(let j=0;j<tail;j++){const p=queue[j],x=p%w-minX,y=Math.floor(p/w);tops[x]=Math.min(tops[x],y);bottoms[x]=Math.max(bottoms[x],y);}
  // The hologram interrupts the lower red border. Columns containing only the
  // upper edge must not be fitted as the bottom edge (which inverted the crop).
  const fit=values=>{let n=0,a=0,b=0,c=0,d=0;for(let x=Math.ceil(bw*.08);x<bw*.92;x++){const y=values[x];if(y<0||y>=h||bottoms[x]-tops[x]<bh*.35)continue;n++;a+=x;b+=y;c+=x*x;d+=x*y;}const m=n>=bw*.15?(n*d-a*b)/(n*c-a*a):NaN;return {m,k:(b-m*a)/n};};
  const top=fit(tops),bottom=fit(bottoms);const slope=(top.m+bottom.m)/2,angle=Math.atan(slope),centerX=(minX+maxX)/2,centerY=(top.k+bottom.k)/2+slope*bw/2;
  const height=(bottom.k-top.k+(bottom.m-top.m)*bw/2)*Math.cos(angle);if(!Number.isFinite(angle)||height<15||!partial&&bw/height<2||bw/height>7||Math.abs(top.m-bottom.m)>(partial?.05:.3))continue;
  const crop=document.createElement('canvas');crop.width=1400;crop.height=Math.round(height/bw*1400+160);const ctx=crop.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);
  ctx.translate(crop.width/2,crop.height/2);const zoom=1400/(bw/scale);ctx.scale(zoom,zoom);ctx.rotate(-angle);ctx.drawImage(source,-centerX/scale,-centerY/scale);
  const sample=ctx.getImageData(140,Math.floor(crop.height*.2),1120,Math.floor(crop.height*.6)).data;let neutral=0;for(let i=0;i<sample.length;i+=4){const r=sample[i],g=sample[i+1],b=sample[i+2];if(Math.min(r,g,b)>135&&Math.max(r,g,b)-Math.min(r,g,b)<65)neutral++;}if(neutral/(sample.length/4)<.4)continue;
  if(partial){tilts.push({area:bw*height,angle:angle*180/Math.PI});continue;}
  labels.push({canvas:crop,area:bw*height,angle:angle*180/Math.PI});
 }
 const out=labels.sort((a,b)=>b.area-a.area).slice(0,4);out.tilt=tilts.sort((a,b)=>b.area-a.area)[0]?.angle||0;return out;
}
// A number reaching the photo edge may have lost digits outside the frame; it is never accepted.
function atEdge(c,b,inset=0){const margin=(b.y1-b.y0)*.8;return b.x0-inset<margin||c.width-inset-b.x1<margin;}
async function readNumber(w,c,seen=new Set(),inset=c.pad||0){
 const data=await recognize(w,c,'11'),hits=findCandidates(data),raw=[data.text];hits.forEach(h=>seen.add(h.number));
 if(hits.length!==1)return {number:'',reason:hits.length?'ambiguous':'empty',candidates:hits,canvas:c,raw:raw.join('\n')};
 if(atEdge(c,hits[0].bbox,inset))return {number:'',reason:'cut',bbox:hits[0].bbox,candidates:hits,canvas:c,raw:raw.join('\n')};
 const hit=hits[0],crop=region(c,hit.bbox),confirm=await recognize(w,crop,'7','0123456789');raw.push(confirm.text);const exact=confirm.text.trim().replace(/\s/g,'');if(/^\d{6,12}$/.test(exact))seen.add(exact);if(confirm.text.trim()===hit.number)await crossCheck(w,crop,seen,raw);
 return {number:seen.size===1&&confirm.text.trim()===hit.number&&hit.confidence>=40&&confirm.confidence>=40?hit.number:'',reason:seen.size===1&&confirm.text.trim()===hit.number&&hit.confidence>=40&&confirm.confidence>=40?'found':'uncertain',bbox:hit.bbox,candidates:hits,canvas:c,raw:raw.join('\n---\n')};
}
function numberZone(c){
 // PSA certificate sits in the lower-right label area. Keep the entire line,
 // including leading zeros; these are layout ratios, never fixture coordinates.
 const box={x0:Math.floor(c.width*.45),y0:Math.floor(c.height*.51),x1:Math.floor(c.width*.99),y1:Math.floor(c.height*.94)};
 const out=document.createElement('canvas');out.width=box.x1-box.x0;out.height=box.y1-box.y0;
 out.getContext('2d').drawImage(c,box.x0,box.y0,out.width,out.height,0,0,out.width,out.height);
 return {canvas:out,box};
}
function contrast(c,scale=1){
 const out=document.createElement('canvas');out.width=c.width*scale;out.height=c.height*scale;const x=out.getContext('2d');x.drawImage(c,0,0,out.width,out.height);
 const im=x.getImageData(0,0,out.width,out.height);for(let i=0;i<im.data.length;i+=4){const gray=im.data[i]*.299+im.data[i+1]*.587+im.data[i+2]*.114;const v=Math.max(0,Math.min(255,(gray-145)*1.7+145));im.data[i]=im.data[i+1]=im.data[i+2]=v;}x.putImageData(im,0,0);return out;
}
// Blur check for camera photos: the steepest brightness steps between neighbouring pixels, as a share of the photo's
// brightness range, at 480 px wide. Motion blur flattens the steps in one direction only, so the weaker direction counts.
function sharpness(c){
 const W=480,H=Math.max(2,Math.round(W*c.height/c.width)),o=document.createElement('canvas');o.width=W;o.height=H;const x=o.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0,W,H);
 const d=x.getImageData(0,0,W,H).data,g=new Uint8Array(W*H),level=new Uint32Array(256),dx=new Uint32Array(256),dy=new Uint32Array(256);for(let i=0;i<g.length;i++){g[i]=d[i*4]*.299+d[i*4+1]*.587+d[i*4+2]*.114;level[g[i]]++;}
 for(let y=0;y<H-1;y++)for(let i=y*W,end=i+W-1;i<end;i++){dx[Math.abs(g[i+1]-g[i])]++;dy[Math.abs(g[i+W]-g[i])]++;}
 const at=(h,q)=>{let total=0,n=0;h.forEach(v=>total+=v);for(let v=0;v<256;v++)if((n+=h[v])>total*q)return v;return 255;};
 return Math.min(at(dx,.995),at(dy,.995))/Math.max(1,at(level,.99)-at(level,.01));
}
// Two agreeing reads of the same pixels can share a misread (a blurred 2 read as 5 twice).
// Re-read the number crop with more contrast, at full and double size; any different number makes the scan uncertain.
// Black-and-white thresholding was tried and dropped: on blurred labels it turned a 9 into a 6.
async function crossCheck(w,crop,seen,raw){for(const input of [contrast(crop),contrast(crop,2)]){const t=(await recognize(w,input,'7','0123456789')).text.trim().replace(/\s/g,'');raw?.push(t);if(/^\d{6,12}$/.test(t))seen.add(t);}}
function numberLines(data){
 const hits=[];for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
  const words=line.words||[],text=words.map(w=>w.text.trim()).join(' ');
  if(!/^\d[\d\s]*$/.test(text))continue;const number=text.replace(/\s/g,'');if(!/^\d{6,12}$/.test(number))continue;
  // Reject separate number groups separated by more than a character height.
  if(words.some((w,i)=>i&&w.bbox.x0-words[i-1].bbox.x1>Math.max(w.bbox.y1-w.bbox.y0,words[i-1].bbox.y1-words[i-1].bbox.y0)))continue;
  hits.push({number,confidence:Math.min(...words.map(w=>w.confidence)),bbox:{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))}});
 }return hits;
}
async function retryLabel(w,c,first,seen=new Set((first.candidates||[]).map(h=>h.number))){
 if(first.number||first.reason==='ambiguous'||first.reason==='cut')return first;
 const zone=numberZone(c),raw=[first.raw];let agreed=null;
 // Always enter this path when the first pass is empty, even without an OCR bbox.
 for(const [input,mode,whitelist] of [[zone.canvas,'6',''],[contrast(zone.canvas),'6','0123456789']]){
  const data=await recognize(w,input,mode,whitelist);raw.push(data.text);const hits=numberLines(data);
  if(hits.length>1)return {...first,reason:'ambiguous',raw:raw.join('\n---\n'),path:'number-zone'};
  if(hits.length!==1)continue;const hit=hits[0];if(atEdge(zone.canvas,hit.bbox))return {...first,reason:'cut',raw:raw.join('\n---\n'),path:'number-zone'};seen.add(hit.number);
  const check=await recognize(w,region(zone.canvas,hit.bbox),'7');raw.push(check.text);
  const exact=check.text.trim().replace(/\s/g,'');if(/^\d{6,12}$/.test(exact))seen.add(exact);
  if(exact===hit.number&&hit.confidence>=50&&check.confidence>=50){await crossCheck(w,region(zone.canvas,hit.bbox),seen,raw);agreed={...hit,bbox:{x0:hit.bbox.x0+zone.box.x0,y0:hit.bbox.y0+zone.box.y0,x1:hit.bbox.x1+zone.box.x0,y1:hit.bbox.y1+zone.box.y0}};}
  if(agreed||seen.size>1)break;
 }
 if(seen.size>1)return {...first,number:'',reason:'uncertain',raw:raw.join('\n---\n'),path:'number-zone-conflict'};
 return agreed?{number:agreed.number,reason:'found',bbox:agreed.bbox,candidates:[agreed],canvas:c,raw:raw.join('\n---\n'),path:'number-zone'}:{...first,raw:raw.join('\n---\n'),path:'number-zone-failed'};
}
function rotated(c,degrees){
 const a=-degrees*Math.PI/180,cos=Math.abs(Math.cos(a)),sin=Math.abs(Math.sin(a)),out=document.createElement('canvas');out.width=Math.ceil(c.width*cos+c.height*sin);out.height=Math.ceil(c.width*sin+c.height*cos);
 const x=out.getContext('2d');x.fillStyle='white';x.fillRect(0,0,out.width,out.height);x.translate(out.width/2,out.height/2);x.rotate(a);x.drawImage(c,-c.width/2,-c.height/2);return out;
}
async function detectPass(w,image,seen){
 const full=makeCanvas(image,2400),labels=labelRegions(full),found=[],attempts=[];
 for(const label of labels){const first=await readNumber(w,label.canvas,seen);const out=labels.length===1?await retryLabel(w,label.canvas,first,seen):first;out.angle=label.angle;attempts.push(out);if(out.number)found.push(out);}
 // Multiple separated labels remain ambiguous even when they carry the same number.
 if(found.length>1)return {number:'',reason:'ambiguous',canvas:full,candidates:found.flatMap(r=>r.candidates),raw:attempts.map(r=>r.raw).join('\n---\n')};
 if(found.length===1&&labels.length===1)return found[0];
 if(labels.length>1)return {number:'',reason:'ambiguous',canvas:full,candidates:found.flatMap(r=>r.candidates),raw:attempts.map(r=>r.raw).join('\n---\n')};
 // A failed crop may recover from original pixels, but conflicting candidates
 // or multiple labels must never be silently replaced with another number.
 if(attempts.some(a=>a.reason==='ambiguous'||a.reason==='cut'||a.path==='number-zone-conflict'))return attempts[0];
 // With no whole label, a tilted cut-off border still straightens the whole-frame read; the tilted original is not read first, so its partial digits cannot conflict.
 const tilt=!labels.length&&Math.abs(labels.tilt)>=1.5?labels.tilt:0,flat=c=>tilt?rotated(c,tilt):c,whole=flat(full);
 let out=await readNumber(w,flat(makeCanvas(image)),seen);if(out.reason==='empty'){const data=await recognize(w,whole,'6'),hits=findCandidates(data);hits.forEach(h=>seen.add(h.number));if(hits.length===1&&atEdge(whole,hits[0].bbox))out={number:'',reason:'cut',canvas:whole,candidates:hits,raw:data.text};else if(hits.length===1){const confirm=await recognize(w,region(whole,hits[0].bbox),'7','0123456789');const exact=confirm.text.trim().replace(/\s/g,'');if(/^\d{6,12}$/.test(exact))seen.add(exact);if(exact===hits[0].number)await crossCheck(w,region(whole,hits[0].bbox),seen);out={number:confirm.text.trim()===hits[0].number&&hits[0].confidence>=40&&confirm.confidence>=40?hits[0].number:'',reason:'uncertain',canvas:whole,bbox:hits[0].bbox,candidates:hits,raw:data.text+'\n---\n'+confirm.text};if(out.number)out.reason='found';}else if(hits.length>1)out={number:'',reason:'ambiguous',canvas:whole,candidates:hits,raw:data.text};}
 if(tilt)out={...out,tilt,path:'straightened'};
 if(attempts.length){const prior=attempts[0];const seen=new Set((prior.candidates||[]).map(c=>c.number));if(out.number&&seen.size&&!seen.has(out.number))return {...prior,number:'',reason:'uncertain',path:'full-frame-conflict'};if(out.number)return {...out,path:'full-frame-recovery'};return prior;}
 return out;
}

function paddedCanvas(c){
 const pad=Math.max(24,Math.round(Math.min(c.width,c.height)*.08)),out=document.createElement('canvas');out.width=c.width+pad*2;out.height=c.height+pad*2;
 const x=out.getContext('2d');x.fillStyle='white';x.fillRect(0,0,out.width,out.height);x.drawImage(c,pad,pad);out.pad=pad;return out;
}
async function recoverEmpty(w,image,out,seen){
 // Only retry an empty scan. Never override conflicting or ambiguous digits.
 if(out.number||out.reason!=='empty'||seen.size)return out;
 const c=out.tilt?rotated(makeCanvas(image,2400),out.tilt):makeCanvas(image,2400),attempts=[out.raw];
 for(const input of [paddedCanvas(c),paddedCanvas(contrast(c))]){
  const retry=await readNumber(w,input,seen);attempts.push(retry.raw);
  out={...retry,raw:attempts.join('\n---\n'),path:'empty-recovery'};
  if(retry.number||retry.reason!=='empty'||seen.size)break;
 }
 return out;
}
// PSA labels also carry the cert number as a Code 128 barcode; its check character makes a read exact or nothing.
// Chrome on Android has a built-in reader. Other browsers (Safari on iPhone) load the zxing-wasm one from jsdelivr once, about 1 MB.
let barcodes=null;
function barcodeReader(){return barcodes??=(async()=>{const formats=['code_128'];if(window.BarcodeDetector&&(await BarcodeDetector.getSupportedFormats()).includes('code_128'))return new BarcodeDetector({formats});await new Promise((done,fail)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/barcode-detector@3.2.3/dist/iife/ponyfill.js';s.onload=done;s.onerror=fail;document.head.append(s);});await BarcodeDetectionAPI.prepareZXingModule({fireImmediately:true});return new BarcodeDetectionAPI.BarcodeDetector({formats});})().catch(e=>{barcodes=null;throw e;});}
// One cert number among the barcodes is a read; two different ones mean two labels in the photo. No barcode returns null.
// A reader still loading after 4 s is skipped for this photo (the printed number is read) and keeps loading for the next.
async function readBarcode(image){const found=await deadline((await deadline(barcodeReader(),4000)).detect(image),5000),numbers=[...new Set(found.map(b=>b.rawValue.trim()).filter(v=>/^\d{6,12}$/.test(v)))];return numbers.length?{number:numbers.length===1?numbers[0]:'',reason:numbers.length===1?'found':'ambiguous',path:'barcode',observed:numbers}:null;}
function recordOCR(result){
 // Keep only the latest bounded diagnostic locally; no photo or cert is stored.
 try{localStorage.setItem('rental-last-ocr',JSON.stringify({at:new Date().toISOString(),reason:result.reason,path:result.path||'standard',candidateCount:result.candidates?.length||0,conflict:(result.observed?.length||0)>1}));}catch{}
}
async function detect(w,image){const seen=new Set();let out=await detectPass(w,image,seen);out=await recoverEmpty(w,image,out,seen);if(out.number)seen.add(out.number);return {...out,...(seen.size>1?{number:'',reason:out.reason==='ambiguous'?'ambiguous':'uncertain',path:'scan-conflict'}:{}),observed:[...seen]};}

async function detectCGC(w,image){const seen=new Set(),c=makeCanvas(image,2400);let out=await readNumber(w,c,seen);if(out.reason==='empty'){const d=await recognize(w,c,'6'),hits=findCandidates(d);hits.forEach(h=>seen.add(h.number));if(hits.length===1&&atEdge(c,hits[0].bbox))out={number:'',reason:'cut',raw:d.text,canvas:c};else if(hits.length===1){const check=await recognize(w,region(c,hits[0].bbox),'7','0123456789');const exact=check.text.trim().replace(/\s/g,'');if(/^\d{6,12}$/.test(exact))seen.add(exact);if(exact===hits[0].number)await crossCheck(w,region(c,hits[0].bbox),seen);out={number:exact===hits[0].number&&check.confidence>=40&&hits[0].confidence>=40?exact:'',reason:'uncertain',raw:d.text+'\n'+check.text,canvas:c};if(out.number)out.reason='found';}}return {...out,...(seen.size>1?{number:'',reason:'uncertain'}:{}),observed:[...seen]};}
