/* User-visible download queue, Library touch controls and return-to-speech position. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {PDFDocument,StandardFonts}=require('pdf-lib');
let pw;try{pw=require('playwright');}catch(_){pw=require('playwright-core');}
const ROOT=path.resolve(__dirname,'..');let pdf,requests=0;
const server=http.createServer((q,r)=>{
 const pathname=q.url.split('?')[0];
 if(pathname==='/fixture.pdf'){requests++;setTimeout(()=>{r.writeHead(200,{'content-type':'application/pdf'});r.end(pdf);},120);return;}
 if(pathname==='/missing.pdf'){r.writeHead(404);r.end();return;}
 fs.readFile(path.join(ROOT,pathname==='/'?'reading.html':pathname),(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.setHeader('content-type',pathname.endsWith('.html')?'text/html':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'application/octet-stream');r.end(b);});
});
function setup(){
 const stamp=Date.now(),note=Array.from({length:45},(_,i)=>'Paragraph '+(i+1)+' starts here. The fruit receives carbon from its source leaves.').join('\n\n');
 localStorage.setItem('readingRoom.v1',JSON.stringify({chapters:[
  {id:'note',kind:'text',title:'Listening fixture',fr:note,addedAt:stamp,updatedAt:stamp},
  {id:'remote',kind:'pdf',title:'Cloud PDF',sourceUrl:location.origin+'/fixture.pdf',pageCount:1,addedAt:stamp,updatedAt:stamp},
  {id:'missing',kind:'pdf',title:'Missing original',sourceUrl:location.origin+'/missing.pdf',pageCount:1,addedAt:stamp,updatedAt:stamp}
 ],deleted:{},merged:{},savedAt:stamp}));
 class Utterance{constructor(text){this.text=text;}}
 window.__said=[];const synth={speaking:false,pending:false,getVoices:()=>[{name:'Samantha',lang:'en-US',voiceURI:'sam',localService:true}],addEventListener(){},cancel(){this.speaking=false;},speak(u){if(u.text.trim()){window.__said.push(u.text);this.speaking=true;this.current=u;}}};
 Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});window.SpeechSynthesisUtterance=Utterance;
}
(async()=>{
 const p=await PDFDocument.create(),page=p.addPage([612,792]),font=await p.embedFont(StandardFonts.TimesRoman);page.drawText('An offline original.',{x:50,y:700,font,size:15});pdf=Buffer.from(await p.save());
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const name=process.env.PHLOEM_BROWSER||'chromium',browser=await pw[name].launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
 try{
  const ctx=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),tab=await ctx.newPage();const errors=[];tab.on('pageerror',e=>errors.push(String(e)));
  await tab.addInitScript(setup);await tab.goto('http://127.0.0.1:'+server.address().port+'/reading.html');
  await tab.waitForFunction(()=>document.body.classList.contains('library-ready')&&!document.getElementById('libraryDownloadAll').disabled);
  for(const selector of ['#libraryOfflineFilter','[data-library-view="wall"]','[data-library-view="list"]','#libraryDownloadAll','#importPdfBtn','#librarySort'])
   assert.equal(await tab.locator(selector).evaluate(e=>getComputedStyle(e).touchAction),'manipulation',selector+' prevents double-tap page zoom');
  await tab.locator('#libraryDownloadAll').click();await tab.evaluate(()=>document.getElementById('libraryDownloadAll').click());
  await tab.waitForFunction(()=>/2 of 3/.test(document.getElementById('libraryDownloadStatus').textContent)&&!document.getElementById('libraryDownloadAll').disabled);
  assert.equal(requests,1,'a repeated tap does not start a second download');
  assert.match(await tab.locator('#libraryDownloadStatus').textContent(),/1 unavailable/,'a missing original is not reported as saved');
  const stored=await tab.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('marginFiles',2);q.onsuccess=()=>{const db=q.result,r=db.transaction('pdfs').objectStore('pdfs').get('remote');r.onsuccess=()=>{resolve(r.result&&r.result.byteLength);db.close();};r.onerror=reject;};q.onerror=reject;}));
  assert.equal(stored,pdf.length,'the actual PDF bytes were durably stored');
  await tab.locator('#libraryDownloadAll').click();await tab.waitForFunction(()=>!document.getElementById('libraryDownloadAll').disabled);assert.equal(requests,1,'already saved originals are not fetched again');
  await tab.locator('[data-continue-paper="note"]').click();await tab.waitForSelector('#textDocument .para');await tab.locator('#zenListen').click();
  await tab.waitForFunction(()=>window.__said.length>0&&!document.getElementById('voiceNow').disabled);
  const before=await tab.evaluate(()=>window.__said.length);
  await tab.locator('#documentPane').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'));});await tab.waitForTimeout(150);
  await tab.locator('#voiceNow').click();await tab.waitForTimeout(1100);
  const at=await tab.evaluate(()=>{const pane=document.getElementById('documentPane'),node=document.querySelector('#textDocument .voice-reading');const p=pane.getBoundingClientRect(),r=node.getBoundingClientRect();return{visible:r.bottom>p.top&&r.top<p.bottom,said:window.__said.length};});
  assert.equal(at.visible,true,'Find now returns to the spoken paragraph after manual scrolling');assert.equal(at.said,before,'Find now does not seek or restart speech');
  assert.deepEqual(errors,[]);await ctx.close();
  const phone=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),mobile=await phone.newPage();await mobile.addInitScript(setup);await mobile.goto('http://127.0.0.1:'+server.address().port+'/reading.html');
  await mobile.waitForFunction(()=>document.body.classList.contains('library-ready'));
  await mobile.locator('[data-library-view="list"]').click();await mobile.locator('[data-library-view="wall"]').click();
  assert.equal(await mobile.locator('[data-library-view="wall"]').getAttribute('aria-pressed'),'true');
  await phone.close();console.log('PASS download durability, retry/deduplication, all Library touch controls, Find now and phone view toggles ('+name+')');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
