/* Saved PDF highlight drag into an open landscape workspace.
   Run with PHLOEM_BROWSER=chromium or PHLOEM_BROWSER=webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..'), ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const server = http.createServer((request, response) => {
  const filename = path.join(ROOT, decodeURIComponent(request.url.split('?')[0] || '/') === '/' ? 'reading.html' : decodeURIComponent(request.url.split('?')[0]));
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html' : filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function pdfFixture() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Please drag this saved passage into the adjacent workspace.', { x: 50, y: 700, size: 16, font });
  doc.addPage([612, 792]).drawText('A second page keeps native vertical scrolling available.', { x: 50, y: 700, size: 16, font });
  return Buffer.from(await doc.save());
}
async function paper(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id);
  });
}
async function selectPhrase(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].some(span => span.textContent.includes('drag this saved passage')));
  const selected = await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].find(node => node.textContent.includes('drag this saved passage'));
    const text = span.firstChild.textContent, start = text.indexOf('drag this saved passage');
    const range = document.createRange();range.setStart(span.firstChild,start);range.setEnd(span.firstChild,start+'drag this saved passage'.length);
    const selection = getSelection();selection.removeAllRanges();selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles:true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerType:'mouse', pointerId:91 }));
    return selection.toString();
  });
  assert.equal(selected, 'drag this saved passage');
  await page.locator('#selectionHighlight').waitFor({ state:'visible' });
  await page.locator('#selectionHighlight').click();
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .saved-highlight').length > 0);
}
async function highlightCenter(page) {
  return page.locator('.pdf-page[data-page="1"] .saved-highlight').first().evaluate(node => {
    const rect=node.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  });
}
async function workspaceCenter(page) {
  return page.locator('#workspaceBoard').evaluate(node => {
    const rect=node.getBoundingClientRect();return{x:rect.left+rect.width*.55,y:rect.top+Math.min(260,rect.height*.2)};
  });
}
async function nativeParagraphSelection(page) {
  return page.evaluate(() => {
    const span=[...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].find(node=>node.textContent.includes('drag this saved passage'));
    const range=document.createRange();range.selectNodeContents(span);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange',{bubbles:true}));
    return span.textContent;
  });
}
async function assertQuietSelectionDuringDrag(page,label) {
  await page.waitForTimeout(35);
  const state=await page.evaluate(()=>({
    text:getSelection().toString(),ranges:getSelection().rangeCount,
    selecting:document.body.classList.contains('selecting-paper'),
    cardVisible:!document.getElementById('selectionCard').classList.contains('hidden'),
    markerReady:document.getElementById('highlightBtn').classList.contains('ready')
  }));
  assert.deepEqual(state,{text:'',ranges:0,selecting:false,cardVisible:false,markerReady:false},label);
}
async function assertTextSelectionRestored(page,label) {
  const text=await nativeParagraphSelection(page);
  await page.waitForFunction(()=>getSelection().toString().includes('drag this saved passage'));
  const selectable=await page.locator('.pdf-page[data-page="1"] .text-layer span').first().evaluate(node=>{
    const style=getComputedStyle(node);return style.userSelect!=='none'&&style.webkitUserSelect!=='none';
  });
  assert.equal(selectable,true,label+' restores selectable PDF text');
  await page.locator('#selectionCard').waitFor({state:'visible'});
  assert.equal(await page.locator('#selectionExcerpt').textContent(),'“'+text+'”',label+' accepts a new passage selection');
  await page.locator('#selectionClose').click();
}
/* WKWebView emits stylus Touch events alongside Pencil Pointer events. Keep
   their target fixed to the original PDF span, including when Pencil leaves it. */
async function pairedStylusTouch(page,type,point) {
  await page.evaluate(({type,point})=>{
    if(type==='touchstart')window.__workspaceTestStylusTarget=document.elementFromPoint(point.x,point.y);
    const target=window.__workspaceTestStylusTarget||document.getElementById('documentPane');
    const stylus={identifier:810,target,touchType:'stylus',clientX:point.x,clientY:point.y,pageX:point.x+scrollX,pageY:point.y+scrollY,force:.55};
    const touches=/^touch(end|cancel)$/.test(type)?[]:[stylus];
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(event,{changedTouches:{value:[stylus]},touches:{value:touches},targetTouches:{value:touches}});
    target.dispatchEvent(event);
    if(!touches.length)delete window.__workspaceTestStylusTarget;
  },{type,point});
}
async function assertNoPencilHighlight(page,label) {
  assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('pencil-highlighting')),false,label+' does not start a Pencil marker gesture');
  assert.equal(await page.locator('.pencil-highlight-preview').count(),0,label+' does not paint a marker preview');
}

(async () => {
  await new Promise((resolve,reject) => { server.once('error',reject);server.listen(8341,'127.0.0.1',resolve); });
  let browser;
  try {
    const launch={headless:true}, executablePath=ENGINE==='webkit'?process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH:process.env.CHROME_PATH;
    if(executablePath)launch.executablePath=executablePath;
    browser=await playwright[ENGINE].launch(launch);
    const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(25000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('readingRoom.comfort.v1',JSON.stringify({pdfLayout:'page',focus:false}));
      localStorage.setItem('readingRoom.notebookCollapsed.v1','1');
    });
    await page.goto('http://127.0.0.1:8341/reading.html',{waitUntil:'load'});
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({name:'saved-highlight.pdf',mimeType:'application/pdf',buffer:await pdfFixture()});
    await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady==='true');
    if(await page.locator('body').evaluate(node=>node.classList.contains('zen')))await page.locator('#zenExit').click();
    await selectPhrase(page);
    const notePoint=await highlightCenter(page);
    await page.mouse.click(notePoint.x,notePoint.y);
    await page.locator('#selectionNote').fill('Keep this note attached to the exact saved passage.');
    await page.locator('#selectionClose').click();
    const initial=await paper(page),highlight=initial.highlights['1'][0];
    assert.equal(highlight.text,'drag this saved passage');
    await page.locator('#workspaceOpen').click();
    await page.locator('#workspacePanel').waitFor({state:'visible'});
    const from=await highlightCenter(page),to=await workspaceCenter(page);
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    await page.mouse.move(to.x,to.y,{steps:9});
    assert.equal(await page.locator('.workspace-highlight-ghost').isVisible(),true,'drag shows a passage ghost');
    await page.mouse.up();
    await page.waitForFunction(() => !!document.querySelector('.workspace-card .workspace-quote'));
    let after=await paper(page);
    assert(after.highlights['1'].some(item=>item.id===highlight.id),'source highlight remains');
    assert.equal(after.readingExcerpts.items.length,1,'drop creates a single excerpt');
    assert.equal(after.readingExcerpts.items[0].quote,highlight.text);
    assert.equal(after.readingExcerpts.items[0].anchor.page,1);
    assert.equal(await page.locator('.workspace-highlight-ghost').count(),0);
    assert.equal(await page.locator('.workspace-card .workspace-quote').textContent(),highlight.text);
    const fromAgain=await highlightCenter(page);
    await page.mouse.click(fromAgain.x,fromAgain.y);
    await page.locator('#selectionSavedTools').waitFor({state:'visible'});
    assert.equal(await page.locator('#selectionExcerpt').textContent(),'“'+highlight.text+'”','tap still opens the original highlight card');
    await page.locator('#selectionClose').click();
    const touchFrom=await highlightCenter(page),touchTo=await workspaceCenter(page);
    const pointer=async(type,point,id,pointerType='touch')=>page.evaluate(({type,point,id,pointerType})=>{
      const target=type==='pointerdown'?document.elementFromPoint(point.x,point.y):document;
      target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType,isPrimary:true,clientX:point.x,clientY:point.y}));
    },{type,point,id,pointerType});
    await pointer('pointerdown',touchFrom,70);await pointer('pointerup',touchFrom,70);
    await page.locator('#selectionSavedTools').waitFor({state:'visible'});
    assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('selecting-paper')),false,
      'touch tap opens the saved card and releases selection tracking');
    await page.locator('#selectionClose').click();
    await pointer('pointerdown',touchFrom,80);
    await nativeParagraphSelection(page);
    await page.waitForTimeout(430);
    assert.equal(await page.locator('.workspace-highlight-ghost').isVisible(),true,'saved passage hold claims the drag despite a native long-press selection');
    await assertQuietSelectionDuringDrag(page,'active held drag removes the browser paragraph selection');
    await nativeParagraphSelection(page);
    await assertQuietSelectionDuringDrag(page,'late Safari-style selectionchange cannot reselect the paragraph during drag');
    await pointer('pointermove',{x:touchFrom.x+35,y:touchFrom.y+8},80);
    await assertQuietSelectionDuringDrag(page,'moving the saved passage stays free of native selection');
    await pointer('pointercancel',touchFrom,80);
    assert.equal(await page.locator('.workspace-highlight-ghost').count(),0,'cancel removes the held ghost');
    assert.deepEqual((await paper(page)).highlights,initial.highlights,'cancel preserves source highlight geometry, color and note exactly');
    await assertTextSelectionRestored(page,'cancel');
    await pointer('pointerdown',touchFrom,71);
    await pointer('pointermove',{x:touchFrom.x+28,y:touchFrom.y+10},71);
    await pointer('pointerup',{x:touchFrom.x+28,y:touchFrom.y+10},71);
    assert.equal(await page.locator('.workspace-highlight-ghost').count(),0,'ordinary quick finger movement does not start a drag');
    await pointer('pointerdown',touchFrom,73);
    await pointer('pointerdown',{x:touchFrom.x+8,y:touchFrom.y},74);
    await page.waitForTimeout(430);
    assert.equal(await page.locator('.workspace-highlight-ghost').count(),0,'second finger cancels a pending hold');
    await pointer('pointercancel',touchFrom,73);
    await pointer('pointercancel',touchFrom,74);
    for(const dropInside of [true,false]){
      const pencilFrom=await highlightCenter(page),pencilTo=dropInside?await workspaceCenter(page):{x:pencilFrom.x+90,y:pencilFrom.y};
      const beforePencil=await paper(page),id=dropInside?81:82;
      await pointer('pointerdown',pencilFrom,id,'pen');
      await pairedStylusTouch(page,'touchstart',pencilFrom);
      await assertNoPencilHighlight(page,'paired Pencil drag candidate');
      await pointer('pointermove',pencilTo,id,'pen');
      await pairedStylusTouch(page,'touchmove',pencilTo);
      assert.equal(await page.locator('.workspace-highlight-ghost').isVisible(),true,'Pencil transfers the saved passage');
      await assertNoPencilHighlight(page,'paired Pencil move');
      await assertQuietSelectionDuringDrag(page,'paired Pencil drag leaves the PDF selection unchanged');
      if(!dropInside&&process.env.PHLOEM_DRAG_SCREENSHOT)await page.screenshot({path:process.env.PHLOEM_DRAG_SCREENSHOT});
      await pointer('pointerup',pencilTo,id,'pen');
      await assertNoPencilHighlight(page,'Pencil pointerup before trailing touchend');
      await pairedStylusTouch(page,'touchend',pencilTo);
      await page.waitForTimeout(70);
      const afterPencil=await paper(page);
      assert.deepEqual(afterPencil.highlights,initial.highlights,'paired Pencil events never add or expand a source highlight');
      assert.equal(afterPencil.readingExcerpts.items.length,1,'Pencil keeps one exact saved excerpt');
      assert.equal(afterPencil.readingExcerpts.items[0].quote,highlight.text);
      if(!dropInside)assert.deepEqual(afterPencil.readingWorkspace.positions,beforePencil.readingWorkspace.positions,'Pencil release outside workspace does not move the clip');
      assert.equal(await page.locator('.workspace-highlight-ghost').count(),0);
    }
    await page.locator('#highlightBtn').click();
    assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('marker-on')),true,'marker remains selected for finger drag');
    let cdp;
    if(ENGINE==='chromium'){
      cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchFrom.x,y:touchFrom.y,id:72}]});
    }else await pointer('pointerdown',touchFrom,72);
    await page.waitForTimeout(430);
    assert.equal(await page.locator('.workspace-highlight-ghost').isVisible(),true,'touch hold arms the drag');
    await nativeParagraphSelection(page);
    await assertQuietSelectionDuringDrag(page,'held finger drag with Marker selected rejects native paragraph selection');
    if(cdp){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchTo.x,y:touchTo.y+120,id:72}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await pointer('pointermove',{x:touchTo.x,y:touchTo.y+120},72);
      await pointer('pointerup',{x:touchTo.x,y:touchTo.y+120},72);
    }
    assert.equal(await page.locator('.workspace-highlight-ghost').count(),0);
    assert.equal((await paper(page)).readingExcerpts.items.length,1,'touch hold moves the existing clip without duplicating it');
    assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('selecting-paper')),false,
      'claimed highlight drag releases the paper selection tracker');
    assert.deepEqual((await paper(page)).highlights,initial.highlights,'successful drop preserves source highlight geometry, color and note exactly');
    assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('marker-on')),true,'finger drop preserves the selected Marker');
    await page.locator('#highlightBtn').click();
    assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('marker-on')),false,'switching Marker off restores ordinary text selection mode');
    await assertTextSelectionRestored(page,'drop');
    const moved=(await paper(page)).readingWorkspace.positions[after.readingExcerpts.items[0].id];
    assert(Math.abs(moved.y-after.readingWorkspace.positions[after.readingExcerpts.items[0].id].y)>50,
      'held drag actually moves the existing card');
    const clipId=after.readingExcerpts.items[0].id;
    const holdDrop=async(from,to,id)=>{
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id}]});
      else await pointer('pointerdown',from,id);
      await page.waitForTimeout(430);
      assert.equal(await page.locator('.workspace-highlight-ghost').isVisible(),true,'finger hold owns the saved highlight');
      if(cdp){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else{
        await pointer('pointermove',to,id);await pointer('pointerup',to,id);
      }
      assert.equal(await page.locator('.workspace-highlight-ghost').count(),0);
    };
    await page.locator('#pdfWriteBtn').evaluate(button=>button.click());
    assert.equal(await page.locator('#pdfWriteBtn').getAttribute('aria-pressed'),'true');
    await page.locator('#workspaceZoomIn').evaluate(button=>button.click());
    const zoomedTo=await page.locator('#workspaceBoard').evaluate(node=>{
      const rect=node.getBoundingClientRect();return{x:rect.left+rect.width*.2,y:rect.top+300};
    });
    const expected=await page.locator('#workspaceBoard').evaluate((node,point)=>{
      const rect=node.getBoundingClientRect();return{x:(point.x-rect.left)*1000/rect.width,y:(point.y-rect.top)*1000/rect.width};
    },zoomedTo);
    await holdDrop(await highlightCenter(page),zoomedTo,75);
    const zoomedPosition=(await paper(page)).readingWorkspace.positions[clipId];
    assert(Math.abs(zoomedPosition.x-expected.x)<2&&Math.abs(zoomedPosition.y-expected.y)<2,
      'drop uses logical board coordinates under workspace zoom: '+JSON.stringify({zoomedPosition,expected}));
    assert.equal(await page.locator('#pdfWriteBtn').getAttribute('aria-pressed'),'true','finger drag preserves the selected PDF pen');
    const toolbar=await page.locator('#workspaceTools button').first().evaluate(node=>{
      const rect=node.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    });
    await holdDrop(await highlightCenter(page),toolbar,76);
    assert.deepEqual((await paper(page)).readingWorkspace.positions[clipId],zoomedPosition,
      'floating workspace toolbar is not a paper drop target');
    if(cdp){
      await page.locator('[data-pdf-layout="scroll"]').evaluate(button=>button.click());
      await page.waitForFunction(()=>document.getElementById('documentPane').scrollHeight>document.getElementById('documentPane').clientHeight+100);
      await page.locator('#documentPane').evaluate(node=>{node.scrollTop=0;});
      const quickFrom=await highlightCenter(page),prior=await paper(page);
      const beforeScroll=await page.locator('#documentPane').evaluate(node=>node.scrollTop);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...quickFrom,id:77}]});
      for(let step=1;step<=4;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:quickFrom.x,y:quickFrom.y-step*15,id:77}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(before=>document.getElementById('documentPane').scrollTop>before,beforeScroll);
      await page.waitForTimeout(430);
      assert.equal(await page.locator('.workspace-highlight-ghost').count(),0,'native quick scroll does not leave a held ghost');
      const scrolled=await paper(page);
      assert.deepEqual(scrolled.readingWorkspace.positions[clipId],prior.readingWorkspace.positions[clipId]);
      assert.equal(scrolled.readingExcerpts.items.length,1,'native quick scroll does not copy a highlight');
      await page.locator('#documentPane').evaluate(node=>{node.scrollTop=0;});
      const pinchFrom=await highlightCenter(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pinchFrom,id:78}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pinchFrom,id:78},{x:pinchFrom.x+8,y:pinchFrom.y,id:79}]});
      await page.waitForTimeout(430);
      assert.equal(await page.locator('.workspace-highlight-ghost').count(),0,'native second finger does not restart a highlight hold');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pinchFrom.x-20,y:pinchFrom.y,id:78},{x:pinchFrom.x+28,y:pinchFrom.y,id:79}]});
      assert.match(await page.locator('#pdfFrame').evaluate(node=>node.style.transform),/scale\(/,
        'two fingers remain available to PDF pinch zoom');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(430);
      assert.equal(await page.locator('.workspace-highlight-ghost').count(),0);
      assert.deepEqual((await paper(page)).readingWorkspace.positions[clipId],zoomedPosition);
      await cdp.detach();
    }
    assert.deepEqual((await paper(page)).pdfInk||{},initial.pdfInk||{},'finger drags with PDF pen selected do not add handwriting');
    await page.locator('#workspaceClose').click();
    const noWorkspace=await highlightCenter(page);
    await page.mouse.move(noWorkspace.x,noWorkspace.y);await page.mouse.down();await page.mouse.move(noWorkspace.x+55,noWorkspace.y+20);await page.mouse.up();
    assert.equal((await paper(page)).readingExcerpts.items.length,1,'drag when workspace is closed does not add a clip');
    assert.deepEqual(errors,[]);
    console.log('PASS  Saved PDF highlight drag and source continuity ('+ENGINE+')');
  } finally {
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
