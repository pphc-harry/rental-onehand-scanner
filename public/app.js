'use strict';
const $=id=>document.getElementById(id);
let worker=null,loading=null,busy=false,pending=null,stream=null,generation=0;
const locationKey='rental-scanner-new-location';
const locationInputs=[$('new-location'),$('review-location')];
const isLocation=value=>value.trim().length>0&&value.length<=60&&!/[\u0000-\u001f\u007f]/.test(value);
const validLocation=()=>isLocation($('new-location').value);
function setLocation(value){for(const input of locationInputs){input.value=value;input.setAttribute('aria-invalid',String(!isLocation(value)));}try{localStorage.setItem(locationKey,value);}catch{}$('location-error').textContent=validLocation()?'':'Enter a location (up to 60 characters) to confirm.';controls();}
for(const input of locationInputs)input.addEventListener('input',()=>setLocation(input.value));
try{setLocation(localStorage.getItem(locationKey)||'');}catch{setLocation('');}
async function api(body){const r=await fetch('/api/rental',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});const d=await r.json();if(!r.ok)throw Error(d.status||'sheet_unavailable');return d;}
function matchMessage(d){return d.status==='pending'?'Already saved on this device. Sync pending entries before scanning this cert again.':d.status==='invalid_checkbox'?'This row has an invalid checkbox or formula. Check the Sheet first.':d.status==='not_found'?'No matching cert in column A. Nothing checked.':d.status==='duplicate'?'Multiple rows have this cert. Resolve duplicates in the Sheet first.':d.status==='changed'?'The card details changed. Retake to review them again.':'Could not verify the local checklist. Refresh the list and retry.';}
function controls(){for(const id of ['start','choose','grader'])$(id).disabled=busy||!!pending;$('capture').disabled=busy||!!pending||!stream;$('stop').hidden=!stream;$('discard').disabled=busy;$('confirm').disabled=busy||!validLocation();for(const input of locationInputs)input.disabled=busy;}
function message(text){$('status').textContent=$('review-status').textContent=text;}
function openReview(){$('review').hidden=false;$('review').showModal();document.body.classList.add('review-open');$('review-title').focus({preventScroll:true});}
function closeReview(){pending=null;$('review').close();$('review').hidden=true;document.body.classList.remove('review-open');controls();(stream?$('capture'):$('choose')).focus({preventScroll:true});}
async function scan(image){if(busy||pending)return;busy=true;pending={number:''};controls();$('number').textContent='Reading…';$('confirm').hidden=true;$('retry-match').hidden=true;$('receipt').textContent='Confirm saves locally; every 5 cards sync to the Sheet.';$('match').textContent='';$('card-name').textContent='';$('current-location').textContent='—';$('preview').src=makeCanvas(image,Math.min(2400,Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height))).toDataURL('image/jpeg',.92);message('Reading this captured camera frame…');openReview();
 try{const w=await engine(),result=await ($('grader').value==='CGC'?detectCGC(w,image):detect(w,image));pending.number=result.number||'';$('number').textContent=pending.number||'Could not read reliably';if(pending.number){message('Finding this cert in the local checklist…');const d=await rentalBatch.lookup(pending.number);if(d.status==='matched'){pending.match=d;$('card-name').textContent=d.card;$('current-location').textContent=d.location;$('match').textContent=`${d.location} · ${d.card}`;$('confirm').hidden=false;$('receipt').textContent=d.checked?'Already checked. Confirm to save the selected New Location.':'Confirm saves locally, ready for batch sync.';message('Compare every digit, card and location before confirming.');}else message(matchMessage(d));}else message('Adjust the label and retake. Nothing was checked.');}
 catch{if(pending.number){message('Cert read successfully, but the local checklist is unavailable. Retry matching without retaking.');$('retry-match').hidden=false;}else{$('number').textContent='Could not read reliably';message('Try another photo. Nothing was checked.');}}
 finally{busy=false;controls();($('confirm').hidden||$('confirm').disabled?$('discard'):$('confirm')).focus({preventScroll:true});}}
$('confirm').onclick=async()=>{if(busy||!pending?.number||!pending.match||!validLocation())return;const newLocation=$('new-location').value.trim();busy=true;controls();try{await rentalBatch.save(pending.match,newLocation);const result=`${pending.number} saved on this device · New Location: ${newLocation}. Pending Sheet sync.`;closeReview();message(result);}catch{$('receipt').textContent='Local save failed or this cert is already pending. Keep this screen open; check pending entries before retrying.';}finally{busy=false;controls();}};
$('retry-match').onclick=async()=>{if(busy||!pending?.number)return;busy=true;controls();try{const d=await rentalBatch.lookup(pending.number);if(d.status==='matched'){pending.match=d;$('card-name').textContent=d.card;$('current-location').textContent=d.location;$('match').textContent=`${d.location} · ${d.card}`;$('confirm').hidden=false;$('retry-match').hidden=true;message('Compare every digit, card and location before confirming.');}else message(matchMessage(d));}catch{message('Checklist still unavailable. Saved cert and photo kept; retry shortly.');}finally{busy=false;controls();}};
$('discard').onclick=()=>{if(!busy){closeReview();message('Ready to scan again. Nothing was checked.');}};
$('review').addEventListener('cancel',e=>{e.preventDefault();if(!busy)$('discard').click();});
$('review').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const b=[...$('review').querySelectorAll('button:not([hidden]):not(:disabled),input:not(:disabled)')];if(!b.length){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===b[0]||!b.includes(document.activeElement))){e.preventDefault();b.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===b.at(-1)){e.preventDefault();b[0].focus();}});
function stopCamera(){generation++;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('camera').hidden=true;controls();}
async function openCamera(){if(busy||pending)return;const g=++generation;busy=true;controls();try{const s=await deadline(navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}}).then(s=>{if(g!==generation){s.getTracks().forEach(t=>t.stop());return null;}return s;}),25000,()=>generation++);if(!s)return;stream=s;$('video').srcObject=s;$('camera').hidden=false;await deadline($('video').play(),12000);message('Frame the label, then tap to capture.');}catch{stopCamera();message('Camera unavailable. Allow camera access or choose a photo.');}finally{busy=false;controls();}}
// Match the centered object-fit:cover viewport, rather than capturing hidden sensor edges.
function captureVisibleFrame(video){
 const box=video.getBoundingClientRect(),vw=video.videoWidth,vh=video.videoHeight;
 if(!vw||!vh||!box.width||!box.height)return null;
 const scale=Math.max(box.width/vw,box.height/vh),sw=box.width/scale,sh=box.height/scale;
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(sw));c.height=Math.max(1,Math.round(sh));
 c.getContext('2d').drawImage(video,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,c.width,c.height);
 return c;
}
$('capture').onclick=()=>{if(!stream||busy||pending)return;const c=captureVisibleFrame($('video'));if(c)void scan(c);};
$('start').onclick=openCamera;$('stop').onclick=stopCamera;$('choose').onclick=()=>$('file').click();
$('file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||busy||pending)return;busy=true;controls();const url=URL.createObjectURL(f);try{const image=new Image();image.src=url;await deadline(image.decode(),15000);busy=false;await scan(image);}catch{message('Could not open the photo. Try JPEG or PNG.');}finally{URL.revokeObjectURL(url);busy=false;controls();}};
function setTheme(theme){const dark=theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';for(const id of ['theme','review-theme']){$(id).textContent=dark?'Light mode':'Dark mode';$(id).setAttribute('aria-pressed',String(dark));}document.querySelector('meta[name="theme-color"]').content=dark?'#131a23':'#f8fafb';try{localStorage.setItem('rental-onehand-theme',dark?'dark':'light');}catch{}}
for(const id of ['theme','review-theme'])$(id).onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
setTheme(document.documentElement.dataset.theme);
void rentalBatch.init();
addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});controls();
