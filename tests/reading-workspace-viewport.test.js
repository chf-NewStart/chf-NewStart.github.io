const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/reading-workspace.css">
<style>body{margin:0}#workspaceScroll{width:600px;height:500px;flex:none}
#pdfPane{width:300px;height:100px;overflow:auto}.workspace-more-panel{position:static}</style></head><body>
<div id="pdfPane">PDF zoom belongs elsewhere</div>
<div id="workspaceMore"><div class="workspace-more-panel">
<div class="workspace-zoom-controls" role="group" aria-label="Workspace zoom">
<button id="workspaceZoomOut" aria-label="Zoom workspace out">−</button>
<button id="workspaceZoomReset" aria-label="Reset workspace zoom">100%</button>
<button id="workspaceZoomIn" aria-label="Zoom workspace in">＋</button></div></div></div>
<div id="workspaceScroll" class="workspace-scroll"><div id="workspaceStage" class="workspace-stage">
<div id="workspaceBoard" class="workspace-board"><article class="workspace-card" style="left:20px;top:20px;width:180px;height:200px">
<div class="workspace-card-body">Note surface</div><textarea class="workspace-note"></textarea></article>
<svg id="workspaceInk" class="workspace-ink" preserveAspectRatio="none" viewBox="0 0 1000 2000"><path id="originalInk" d="M100 400L350 450" fill="none" stroke="black" stroke-width="3"/></svg></div>
</div></div><script src="/reading-workspace.js" defer></script><script src="/reading-workspace-viewport.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',()=>{
  const calls=[], data={positions:{note:{x:20,y:40,width:300}},strokes:[{points:[[4,5,.5]]}]};
  const stored=JSON.parse(localStorage.getItem('fixture.extent')||'{}');
  let height=stored.height||2000, width=stored.width||1000, busy=false, notePointers=0;
  const maxHeight=window.PhloemWorkspaceState?.MAX_HEIGHT||1000000;
  const maxWidth=window.PhloemWorkspaceState?.MAX_WIDTH||1000000;
  const render=()=>{
    viewport.layout(height,width);
    document.getElementById('workspaceInk').setAttribute('viewBox','0 0 '+width+' '+height);
  };
  const store=()=>localStorage.setItem('fixture.extent',JSON.stringify({height,width}));
  const viewport=PhloemWorkspaceViewport.create({isBusy:()=>busy,onNeedSpace(y,x){
    calls.push({y,x});
    if(y<=height&&x<=width)return;
    height=Math.min(maxHeight,Math.max(height,Math.ceil(y/1000)*1000));
    width=Math.min(maxWidth,Math.max(width,Math.ceil(x/1000)*1000));
    store(); render();
  }});
  render();
  document.querySelector('.workspace-card').addEventListener('pointerdown',()=>notePointers++);
  window.fixture={viewport,calls,data,maxHeight,maxWidth,get height(){return height},get width(){return width},get notePointers(){return notePointers},
    setBusy(value){busy=value},setHeight(value){height=Math.min(maxHeight,value);store();render()},
    setWidth(value){width=Math.min(maxWidth,value);store();render()},render};
});</script></body></html>`;
const server = http.createServer((request, response) => {
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
  if (['/reading-workspace.css', '/reading-workspace.js', '/reading-workspace-viewport.js'].includes(request.url)) {
    const file = path.join(ROOT, request.url.slice(1));
    response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : 'text/javascript');
    response.end(fs.readFileSync(file)); return;
  }
  response.statusCode = 404; response.end();
});

test.before(async () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve)));
test.after(async () => new Promise(resolve => server.close(resolve)));
async function browser() {
  const options = { headless: true };
  const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
  if (executablePath) options.executablePath = executablePath;
  return playwright[ENGINE].launch(options);
}
async function pageFor(instance) {
  const page = await instance.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return page;
}
const geometry = page => page.evaluate(() => {
  const scroll = document.getElementById('workspaceScroll');
  const board = document.getElementById('workspaceBoard');
  const stage = document.getElementById('workspaceStage');
  return { zoom: fixture.viewport.getZoom(), logicalWidth: fixture.width, logicalHeight: fixture.height, boardWidth: board.clientWidth,
    boardHeight: board.clientHeight, boardRect: board.getBoundingClientRect().toJSON(),
    stageWidth: stage.offsetWidth, stageHeight: stage.offsetHeight,
    scrollWidth: scroll.clientWidth, scrollHeight: scroll.clientHeight,
    scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop,
    saved: JSON.stringify(fixture.data) };
});

test('stage matches transformed paper, controls clamp, and local zoom survives reload', async () => {
  const instance = await browser();
  try {
    const page = await pageFor(instance);
    const before = await geometry(page);
    assert.equal(before.boardWidth, 600);
    assert.equal(before.boardHeight, 1200);
    assert.equal(before.stageWidth, 600);
    await page.locator('#workspaceZoomIn').click();
    const enlarged = await geometry(page);
    assert.equal(enlarged.zoom, 1.25);
    assert.equal(enlarged.boardWidth, 600, 'saved-coordinate baseline does not scale');
    assert.equal(enlarged.boardHeight, 1200);
    assert.equal(enlarged.stageWidth, 750);
    assert.equal(enlarged.stageHeight, 1500);
    assert.equal(enlarged.saved, before.saved);
    assert.equal(await page.locator('#workspaceZoomReset').textContent(), '125%');
    const controlSizes = await page.locator('.workspace-zoom-controls button').evaluateAll(nodes =>
      nodes.map(node => ({ width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height })));
    assert(controlSizes.every(size => size.width >= 44 && size.height >= 44));
    await page.reload();
    assert.equal((await geometry(page)).zoom, 1.25);
    for (let i = 0; i < 14 && !(await page.locator('#workspaceZoomIn').isDisabled()); i++)
      await page.locator('#workspaceZoomIn').click();
    assert.equal((await geometry(page)).zoom, 3);
    assert.equal(await page.locator('#workspaceZoomIn').isDisabled(), true);
    await page.locator('#workspaceZoomReset').focus();
    await page.keyboard.press('Enter');
    assert.equal((await geometry(page)).zoom, 1);
    await page.close();
  } finally { await instance.close(); }
});

test('Ctrl wheel zoom anchors the cursor inside workspace only', async () => {
  const instance = await browser();
  try {
    const page = await pageFor(instance);
    const result = await page.evaluate(() => {
      const scroll = document.getElementById('workspaceScroll');
      scroll.scrollTop = 300;
      const x = 450, y = 260, rect = scroll.getBoundingClientRect();
      const before = { x: (scroll.scrollLeft + x - rect.left) / fixture.viewport.getZoom(),
        y: (scroll.scrollTop + y - rect.top) / fixture.viewport.getZoom() };
      const wheel = new WheelEvent('wheel', { bubbles:true, cancelable:true, ctrlKey:true,
        deltaY:-180, clientX:x, clientY:y });
      document.getElementById('workspaceBoard').dispatchEvent(wheel);
      const after = { x: (scroll.scrollLeft + x - rect.left) / fixture.viewport.getZoom(),
        y: (scroll.scrollTop + y - rect.top) / fixture.viewport.getZoom() };
      const changed = fixture.viewport.getZoom();
      document.getElementById('pdfPane').dispatchEvent(new WheelEvent('wheel',
        { bubbles:true, cancelable:true, ctrlKey:true, deltaY:-300 }));
      const pdfZoom = fixture.viewport.getZoom();
      document.querySelector('.workspace-note').dispatchEvent(new WheelEvent('wheel',
        { bubbles:true, cancelable:true, ctrlKey:true, deltaY:-300 }));
      return { before, after, changed, pdfZoom, editorZoom: fixture.viewport.getZoom(), prevented: wheel.defaultPrevented };
    });
    assert(result.prevented);
    assert(result.changed > 1);
    assert(Math.abs(result.after.x - result.before.x) < 1);
    assert(Math.abs(result.after.y - result.before.y) < 1);
    assert.equal(result.pdfZoom, result.changed);
    assert.equal(result.editorZoom, result.changed);
    await page.close();
  } finally { await instance.close(); }
});

test('blank two finger pinch anchors its moving centroid while a note retains its own touches', async () => {
  const instance = await browser();
  try {
    const page = await pageFor(instance);
    const result = await page.evaluate(() => {
      const scroll = document.getElementById('workspaceScroll');
      const board = document.getElementById('workspaceBoard');
      scroll.scrollTop = 300;
      const emit = (node, type, id, x, y) => {
        const event = new PointerEvent(type, { bubbles:true, cancelable:true, pointerType:'touch',
          pointerId:id, isPrimary:id===1, clientX:x, clientY:y, buttons:type==='pointerup'?0:1 });
        node.dispatchEvent(event); return event.defaultPrevented;
      };
      const onePrevented = emit(board, 'pointerdown', 1, 260, 200);
      const movePrevented = emit(board, 'pointermove', 1, 260, 205);
      emit(board, 'pointerdown', 2, 340, 200);
      const top = scroll.getBoundingClientRect().top;
      const originalPoint = { x: (scroll.scrollLeft + 300), y: (scroll.scrollTop + 202.5 - top) };
      const pinchPrevented = emit(board, 'pointermove', 2, 400, 200);
      const zoom = fixture.viewport.getZoom();
      const anchored = { x: (scroll.scrollLeft + 330) / zoom, y: (scroll.scrollTop + 202.5 - top) / zoom };
      emit(board, 'pointerup', 1, 260, 205); emit(board, 'pointerup', 2, 400, 200);
      const note = document.querySelector('.workspace-card-body');
      emit(note, 'pointerdown', 3, 45, 45); emit(note, 'pointerdown', 4, 95, 45);
      emit(note, 'pointermove', 4, 145, 45);
      emit(note, 'pointerup', 3, 45, 45); emit(note, 'pointerup', 4, 145, 45);
      fixture.setBusy(true);
      emit(board, 'pointerdown', 5, 260, 200); emit(board, 'pointerdown', 6, 340, 200);
      emit(board, 'pointermove', 6, 420, 200);
      emit(board, 'pointerup', 5, 260, 200); emit(board, 'pointerup', 6, 420, 200);
      return { onePrevented, movePrevented, pinchPrevented, zoom, originalPoint,
        anchored, afterNote:fixture.viewport.getZoom(), notePointers:fixture.notePointers,
        touchAction:getComputedStyle(board).touchAction };
    });
    assert.equal(result.onePrevented, false);
    assert.equal(result.movePrevented, false);
    assert(result.pinchPrevented);
    assert(result.zoom > 1.5);
    assert(Math.abs(result.anchored.x - result.originalPoint.x) < 1);
    assert(Math.abs(result.anchored.y - result.originalPoint.y) < 1, JSON.stringify(result));
    assert.equal(result.afterNote, result.zoom);
    assert.equal(result.notePointers, 2);
    assert.match(result.touchAction, /pan-x/);
    await page.close();
  } finally { await instance.close(); }
});

test('Chromium native two touch stream zooms the workspace without changing page scale',
  { skip: ENGINE !== 'chromium' }, async () => {
    const instance = await browser();
    try {
      const context = await instance.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port + '/');
      const client = await context.newCDPSession(page);
      const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
      const pageScale = await page.evaluate(() => visualViewport.scale);
      await page.evaluate(() => { document.getElementById('workspaceScroll').scrollTop = 300; });
      await touch('touchStart', [[1, 300, 400]]);
      await touch('touchMove', [[1, 300, 340]]);
      await touch('touchEnd', []);
      const panned = await page.evaluate(() => document.getElementById('workspaceScroll').scrollTop);
      assert(panned > 300, `one finger should scroll the workspace: ${panned}`);
      await touch('touchStart', [[1, 260, 400]]);
      await touch('touchStart', [[1, 260, 400], [2, 340, 400]]);
      await touch('touchMove', [[1, 240, 400], [2, 360, 400]]);
      await touch('touchMove', [[1, 220, 400], [2, 380, 400]]);
      await touch('touchEnd', []);
      const result = await page.evaluate(() => ({ zoom: fixture.viewport.getZoom(), scale: visualViewport.scale }));
      assert(result.zoom > 1.3, JSON.stringify(result));
      assert.equal(result.scale, pageScale, 'browser or PDF scale stays unchanged');
      await context.close();
    } finally { await instance.close(); }
  });

for (const [name, start, end] of [
  ['vertical out', [[350, 350], [350, 430]], [[350, 300], [350, 480]]],
  ['diagonal out', [[300, 340], [360, 400]], [[260, 300], [400, 440]]],
  ['vertical in', [[350, 300], [350, 480]], [[350, 355], [350, 425]]],
  ['diagonal in', [[260, 300], [400, 440]], [[310, 350], [350, 390]]],
  ['diagonal out with centroid pan', [[300, 340], [360, 400]], [[330, 300], [470, 440]]]
]) {
  test(`Chromium native pinch ${name} completes and releases one-finger scrolling`,
    { skip: ENGINE !== 'chromium' }, async () => {
      const instance = await browser();
      try {
        const context = await instance.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        const initial = await page.evaluate(() => {
          document.getElementById('workspaceScroll').scrollTop = 300;
          window.pinchCancels = 0;
          document.addEventListener('pointercancel', () => pinchCancels++, true);
          return { scale: visualViewport.scale, saved: JSON.stringify(fixture.data) };
        });
        const client = await context.newCDPSession(page);
        const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type,
          touchPoints: points.map(([x, y], index) => ({ id: index + 1, x, y })) });
        await touch('touchStart', [start[0]]);
        await touch('touchStart', start);
        for (let step = 1; step <= 5; step++) {
          await touch('touchMove', start.map((point, index) =>
            point.map((value, axis) => value + (end[index][axis] - value) * step / 5)));
        }
        await touch('touchEnd', []);
        const result = await page.evaluate(() => ({ zoom: fixture.viewport.getZoom(),
          scale: visualViewport.scale, cancelled: pinchCancels, saved: JSON.stringify(fixture.data),
          scrollTop: document.getElementById('workspaceScroll').scrollTop }));
        const distance = points => Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]);
        const expected = Math.max(.5, Math.min(3, distance(end) / distance(start)));
        assert(Math.abs(result.zoom - expected) < .01, JSON.stringify({ name, expected, result }));
        assert.equal(result.cancelled, 0, 'native browser panning does not take over the pinch');
        assert.equal(result.scale, initial.scale);
        assert.equal(result.saved, initial.saved);
        await touch('touchStart', [[240, 450]]);
        await touch('touchMove', [[240, 380]]);
        await touch('touchEnd', []);
        await page.waitForFunction(before => document.getElementById('workspaceScroll').scrollTop > before,
          result.scrollTop);
        assert.equal(await page.evaluate(() => fixture.viewport.getZoom()), result.zoom,
          'the next single-finger gesture pans without retaining pinch state');
        await context.close();
      } finally { await instance.close(); }
    });
}

test('zoom out on portrait paper asks for bounded extent once and preserves saved data', async () => {
  const instance = await browser();
  try {
    const page = await pageFor(instance);
    const before = await geometry(page);
    await page.evaluate(() => {
      const scroll = document.getElementById('workspaceScroll');
      scroll.style.width = '400px'; scroll.style.height = '850px';
      fixture.render();
    });
    await page.locator('#workspaceZoomOut').click();
    await page.locator('#workspaceZoomOut').click();
    await page.locator('#workspaceZoomOut').click();
    await page.locator('#workspaceZoomOut').click();
    const after = await geometry(page);
    const calls = await page.evaluate(() => [...fixture.calls]);
    assert.equal(after.zoom, .5);
    assert.equal(after.boardWidth, 400 * after.logicalWidth / 1000);
    assert.equal(after.boardHeight, 400 * after.logicalHeight / 1000);
    assert(after.boardRect.width >= after.scrollWidth, 'zoomed-out visible background is actual paper');
    assert(after.stageHeight >= after.scrollHeight);
    assert(calls.length > 0 && calls.length < 8, 'growth follows viewport need without a render loop');
    const capacity = await page.evaluate(() => fixture.maxHeight);
    assert(calls.every(value => Number.isFinite(value.y) && value.y <= capacity));
    assert(calls.every(value => Number.isFinite(value.x) && value.x <= after.logicalWidth));
    assert.equal(after.saved, before.saved);
    await page.evaluate(() => fixture.render());
    assert.deepEqual(await page.evaluate(() => [...fixture.calls]), calls);
    await page.close();
  } finally { await instance.close(); }
});

test('scrolling beyond the former 20000-unit ceiling extends paper once without changing ink', async () => {
  const instance = await browser();
  try {
    const page = await pageFor(instance);
    const before = await geometry(page);
    const result = await page.evaluate(() => {
      fixture.setHeight(20000);
      const scroll = document.getElementById('workspaceScroll');
      scroll.scrollTop = scroll.scrollHeight - scroll.clientHeight;
      scroll.dispatchEvent(new Event('scroll'));
      return { height: fixture.height, capacity: fixture.maxHeight, calls: [...fixture.calls] };
    });
    assert.equal(result.capacity, 1000000);
    assert.equal(result.height, 21000);
    assert.equal(result.calls.length, 1, 'one bounded callback grows past the old ceiling');
    assert(result.calls[0].y > 20000 && result.calls[0].y < result.height);
    assert.equal((await geometry(page)).saved, before.saved);
    await page.evaluate(() => fixture.render());
    assert.deepEqual(await page.evaluate(() => [...fixture.calls]), result.calls,
      'rendering the enlarged sheet does not reenter growth');
    await page.close();
  } finally { await instance.close(); }
});
