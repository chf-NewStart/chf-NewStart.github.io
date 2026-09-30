import {placement} from './geometry.mjs';
const $ = id => document.getElementById(id);
const items = []; let active = null, serial = 0, drag = null, exporting = false;
const defaults = () => ({size:'2064x2752',mode:'fit',zoom:1,x:0,y:0,background:'#f4f1e9'});
let emptySettings = defaults();
const settings = () => active ? active.settings : emptySettings;
const dimensions = () => settings().size.split('x').map(Number);
function draw(canvas, width, height) {
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {alpha:false}), s = settings();
  ctx.fillStyle = s.background; ctx.fillRect(0,0,width,height);
  if (!active) return;
  const [ow,oh] = dimensions(), p = placement(active.image.naturalWidth,active.image.naturalHeight,ow,oh,s.mode,s.zoom,s.x,s.y);
  s.x = p.offsetX; s.y = p.offsetY;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(active.image,p.left*width/ow,p.top*height/oh,p.width*width/ow,p.height*height/oh);
}
function render() {
  const s = settings(), [w,h] = dimensions();
  $('empty').hidden = !!active; $('preview').hidden = !active;
  $('size').value = s.size; $('fit').setAttribute('aria-pressed', s.mode === 'fit'); $('crop').setAttribute('aria-pressed',s.mode === 'crop');
  $('padding').hidden = s.mode !== 'fit'; $('cropControls').hidden = s.mode !== 'crop';
  $('zoom').value = Math.round(s.zoom*100); $('zoomValue').value = `${Math.round(s.zoom*100)}%`; $('background').value = s.background;
  $('modeInfo').textContent = s.mode === 'fit' ? 'Keep the entire image, with padding where needed.' : 'Fill the frame. Drag the image to choose what stays.';
  $('previewHint').textContent = s.mode === 'fit' ? 'Fit keeps the whole screenshot.' : 'Drag to position · arrow keys to fine-tune';
  $('preview').classList.toggle('cropping',s.mode === 'crop');
  $('outputSize').textContent = `${w} × ${h} px`; $('download').disabled = !active || exporting;
  $('sourceInfo').textContent = active ? `${active.name} · ${active.image.naturalWidth} × ${active.image.naturalHeight}` : 'Your images never leave this device.';
  if (active) {
    const p = placement(active.image.naturalWidth,active.image.naturalHeight,w,h,s.mode,s.zoom,s.x,s.y);
    $('quality').textContent = p.scale > 1.01 ? `Enlarging to ${Math.round(p.scale*100)}% of the original. Exact-size PNG, but no extra detail is added.` : 'Preview is scaled down. Export uses the exact dimensions above.';
    const ratio = Math.min(1,1200/Math.max(w,h)); draw($('preview'),Math.round(w*ratio),Math.round(h*ratio));
  }
  for(const card of $('queue').children){const selected=card.dataset.id===String(active?.id);card.classList.toggle('active',selected);card.querySelector('.pick').setAttribute('aria-pressed',selected);}
}
function rebuildQueue() {
  $('queue').replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');card.className='image-card';card.dataset.id=item.id;
    const pick=document.createElement('button');pick.type='button';pick.className='pick';pick.title=item.name;pick.setAttribute('aria-label',`Edit ${item.name}`);
    const thumb=document.createElement('img');thumb.src=item.url;thumb.alt='';
    const name=document.createElement('span');name.textContent=item.name;pick.append(thumb,name);
    pick.addEventListener('click',()=>{active=item;render();});
    const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${item.name}`);
    remove.addEventListener('click',()=>{const i=items.indexOf(item);items.splice(i,1);URL.revokeObjectURL(item.url);if(active===item)active=items[Math.min(i,items.length-1)]||null;rebuildQueue();render();});
    card.append(pick,remove);$('queue').append(card);
  }
}
async function loadFiles(files) {
  const errors=[];
  for(const file of files){
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)){errors.push(`${file.name}: choose PNG, JPEG, or WebP.`);continue;}
    if(file.size>30*1024*1024 || items.length>=12){errors.push('Limit: 12 images, 30 MB each. Remove an image to make room.');continue;}
    const url=URL.createObjectURL(file), image=new Image();image.src=url;
    try{await image.decode();if(image.naturalWidth*image.naturalHeight>40e6)throw new Error('too large');}
    catch{URL.revokeObjectURL(url);errors.push(`${file.name}: unreadable or larger than 40 megapixels.`);continue;}
    const item={id:++serial,name:file.name||'Screenshot.png',image,url,settings:{...settings()}};
    item.settings.zoom=1;item.settings.x=0;item.settings.y=0;items.push(item);active=item;
  }
  rebuildQueue();render();$('status').textContent=errors.join(' ');$('files').value='';
}
for(const id of ['add','chooseEmpty'])$(id).addEventListener('click',()=>$('files').click());
$('files').addEventListener('change',e=>loadFiles([...e.target.files]));
window.addEventListener('dragover',e=>{e.preventDefault();});
window.addEventListener('drop',e=>{e.preventDefault();$('dropZone').classList.remove('dragging');if(e.dataTransfer.files.length)loadFiles([...e.dataTransfer.files]);});
$('dropZone').addEventListener('dragenter',()=>$('dropZone').classList.add('dragging'));
$('dropZone').addEventListener('dragleave',e=>{if(!$('dropZone').contains(e.relatedTarget))$('dropZone').classList.remove('dragging');});
window.addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();loadFiles(files);}});
$('size').addEventListener('change',()=>{Object.assign(settings(),{size:$('size').value,x:0,y:0,zoom:1});render();});
for(const mode of ['fit','crop'])$(mode).addEventListener('click',()=>{settings().mode=mode;render();});
$('zoom').addEventListener('input',()=>{settings().zoom=Number($('zoom').value)/100;render();});
$('reset').addEventListener('click',()=>{Object.assign(settings(),{x:0,y:0,zoom:1});render();});
$('background').addEventListener('input',()=>{settings().background=$('background').value;render();});
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{settings().background=button.dataset.color;render();}));
$('preview').addEventListener('pointerdown',e=>{if(!active||settings().mode!=='crop'||e.button!==0)return;e.preventDefault();$('preview').focus();$('preview').setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};});
$('preview').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const [w,h]=dimensions(),r=$('preview').getBoundingClientRect();settings().x+=(e.clientX-drag.x)*w/r.width;settings().y+=(e.clientY-drag.y)*h/r.height;drag.x=e.clientX;drag.y=e.clientY;render();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('preview').addEventListener(event,()=>{drag=null;});
$('preview').addEventListener('keydown',e=>{if(!active||settings().mode!=='crop'||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const n=e.shiftKey?40:4;settings().x+=e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0;settings().y+=e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0;render();});
$('download').addEventListener('click',async()=>{
  if(!active||exporting)return;exporting=true;render();$('status').textContent='Preparing PNG…';
  const [w,h]=dimensions(),canvas=document.createElement('canvas'),name=active.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-')||'screenshot';
  try{draw(canvas,w,h);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG encoding failed');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${name}-${w}x${h}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('status').textContent=`PNG ready: ${w} × ${h}. Check your downloads.`;}
  catch{$('status').textContent='Could not create the PNG. Try removing other images to free memory.';}
  finally{canvas.width=canvas.height=1;exporting=false;render();}
});
render();
