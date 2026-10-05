/* Full-app hit-target regression for automatically extended workspace paper.
   Run with PHLOEM_BROWSER=chromium or PHLOEM_BROWSER=webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.PHLOEM_EXTENDED_PAPER_TEST_PORT || 0);
assert(['chromium', 'webkit'].includes(ENGINE));
const server = http.createServer((request, response) => {
  const name = path.join(ROOT, decodeURIComponent(request.url.split('?')[0]));
  fs.readFile(name, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
function seed() {
  if (sessionStorage.getItem('phloem.extendedPaperFixture')) return;
  sessionStorage.setItem('phloem.extendedPaperFixture', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
  localStorage.removeItem('phloem.workspaceZoom.v1');
}
async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText('Extended workspace paper stays writable.', { x: 52, y: 710, size: 14, font });
  return Buffer.from(await pdf.save());
}
async function paper(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
    .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
async function waitPdf(page) {
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden')
    && document.querySelector('.pdf-page canvas')?.width > 0
    && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
}
async function openWorkspace(page) {
  if (!(await page.locator('#workspacePanel').isVisible())) await page.locator('#zenWorkspace').click();
  await page.locator('#workspaceBoard').waitFor({ state: 'visible' });
}
async function zoom(page, requested) {
  await page.evaluate(value => localStorage.setItem('phloem.workspaceZoom.v1', String(value)), requested);
  await page.reload({ waitUntil: 'load' });
  await waitPdf(page); await openWorkspace(page);
  await page.waitForFunction(percent => document.getElementById('workspaceZoomReset').textContent === percent + '%', Math.round(requested * 100));
}
async function scrollToLogical(page, y) {
  // Scroll only as far as the browser currently allows; each genuine scroll
  // event asks the app for more paper until the destination can be displayed.
  for (let attempt = 0; attempt < 12; attempt++) {
    const position = await page.evaluate(y => {
      const scroll = document.getElementById('workspaceScroll'), board = document.getElementById('workspaceBoard');
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'));
      const scale = board.getBoundingClientRect().width / (ch.readingWorkspace?.width || 1000);
      scroll.scrollTop = y * scale - scroll.clientHeight / 2;
      return { height: ch.readingWorkspace?.height || 2000, current: scroll.scrollTop, target: y * scale - scroll.clientHeight / 2 };
    }, y);
    await page.waitForTimeout(70);
    if (position.height > y && Math.abs(position.current - position.target) < 2) return;
  }
  throw new Error('Could not scroll to extended paper at ' + y);
}
async function writeAt(page, { logicalY, xFraction = .35, label, stylusTouch = false }) {
  await scrollToLogical(page, logicalY);
  const beforeStrokes = (await paper(page)).readingWorkspace?.strokes || [];
  const before = beforeStrokes.length;
  const result = await page.evaluate(async ({ logicalY, xFraction, stylusTouch }) => {
    const scroll = document.getElementById('workspaceScroll'), board = document.getElementById('workspaceBoard');
    const r = scroll.getBoundingClientRect(), b = board.getBoundingClientRect();
    const scale = b.width / Number(board.dataset.logicalWidth || 1000);
    const x = r.left + scroll.clientWidth * xFraction, y = b.top + logicalY * scale;
    const start = document.elementFromPoint(x, y);
    const originalCapture = board.setPointerCapture;
    // Constructed Pencil events cannot establish native pointer capture, but
    // their initial DOM target must be the actual visible surface under the tip.
    board.setPointerCapture = () => {};
    try {
      for (let i = 0; i < 6; i++) {
        const type = i === 0 ? 'pointerdown' : i === 5 ? 'pointerup' : 'pointermove';
        const px = x + i * 4, py = y + Math.sin(i) * 6;
        const target = document.elementFromPoint(px, py);
        if (target && stylusTouch) {
          const touch = { identifier: 78, touchType: 'stylus', force: i === 5 ? 0 : .6, clientX: px, clientY: py, target: start };
          const event = new Event(i === 0 ? 'touchstart' : i === 5 ? 'touchend' : 'touchmove', { bubbles: true, cancelable: true });
          Object.defineProperties(event, { changedTouches: { value: [touch] },
            touches: { value: i === 5 ? [] : [touch] }, targetTouches: { value: i === 5 ? [] : [touch] } });
          target.dispatchEvent(event);
        } else if (target) target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
            pointerType: 'pen', pointerId: 78, isPrimary: true, button: 0, buttons: i === 5 ? 0 : 1,
            pressure: i === 5 ? 0 : .6, clientX: px, clientY: py }));
        // Let native scroll/focus/ResizeObserver tasks run between samples.
        // Atomic down/move/up batches can hide cancellation during growth.
        if (i < 5) await new Promise(resolve => setTimeout(resolve, 24));
      }
    } finally { board.setPointerCapture = originalCapture; }
    return { start: { id: start?.id, className: start?.getAttribute('class') }, x, y,
      board: b.toJSON(), scroll: r.toJSON(), scrollHeight: scroll.scrollHeight,
      logicalY, visible: x > r.left && x < r.right && y > r.top && y < r.bottom };
  }, { logicalY, xFraction, stylusTouch });
  assert(result.visible, label + ' is visible: ' + JSON.stringify(result));
  try {
    await page.waitForFunction(count => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'));
      return ch?.readingWorkspace?.strokes.length === count;
    }, before + 1, { timeout: 2000 });
  } catch (error) {
    throw new Error(label + ' did not save a stroke from the actual hit target: ' + JSON.stringify(result), { cause: error });
  }
  const saved = (await paper(page)).readingWorkspace.strokes.find(stroke => !beforeStrokes.some(old => old.id === stroke.id));
  assert(saved.points.every(p => p[1] > 2000), label + ' saves coordinates on extended paper');
  assert(Math.abs(saved.points[0][1] - logicalY) < 2, label + ' keeps the intended logical Y: ' + JSON.stringify({ point: saved.points[0], result }));
  const rendered = await page.locator('#workspaceInk path[data-stroke-id="' + saved.id + '"]').evaluate(node => {
    const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  assert(rendered.width > 5 && rendered.height > 1, label + ' renders a visible stroke');
  assert(Math.abs(rendered.x - result.x) < 10 && Math.abs(rendered.y - result.y) < 15,
    label + ' draws under the actual Pencil contact: ' + JSON.stringify({ rendered, result }));
  console.log(label + ': saved and rendered at y=' + saved.points[0][1]);
  return saved;
}

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });
  let browser;
  try {
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    browser = await playwright[ENGINE].launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.addInitScript(seed);
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'extended-paper.pdf', mimeType: 'application/pdf', buffer: await fixturePdf() });
    await waitPdf(page); await openWorkspace(page);
    const saved = [];
    saved.push(await writeAt(page, { logicalY: 2300, label: '100% auto-extended lower paper' }));
    await zoom(page, .5);
    saved.push(await writeAt(page, { logicalY: 3400, label: '50% auto-extended lower paper' }));
    await zoom(page, 1.25);
    saved.push(await writeAt(page, { logicalY: 4700, label: '125% auto-extended lower paper' }));
    await zoom(page, 2);
    saved.push(await writeAt(page, { logicalY: 5600, label: '200% auto-extended lower paper' }));
    saved.push(await writeAt(page, { logicalY: 5800, label: '200% lower-paper TouchEvent stylus fallback', stylusTouch: true }));
    await page.reload({ waitUntil: 'load' }); await waitPdf(page); await openWorkspace(page);
    const reloaded = await paper(page);
    assert.deepEqual([...reloaded.readingWorkspace.strokes].sort((a, b) => a.id.localeCompare(b.id)),
      [...saved].sort((a, b) => a.id.localeCompare(b.id)), 'every extended-paper stroke survives reload unchanged');
    assert.equal(Object.values(reloaded.pdfInk || {}).flat().length, 0, 'workspace writing does not alter PDF ink');
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), saved.length, 'persisted strokes render after reload');
    await zoom(page, .5);
    saved.push(await writeAt(page, { logicalY: 3600, xFraction: .75, label: '50% right-hand visible paper' }));
    // One continuous Pencil stroke that crosses the old 1000-unit right edge at
    // 50% must keep going: no run of samples flattened against x=1000.
    const crossing = await page.evaluate(async () => {
      const scroll = document.getElementById('workspaceScroll'), board = document.getElementById('workspaceBoard');
      scroll.scrollLeft = 0;
      await new Promise(resolve => setTimeout(resolve, 60));
      const b = board.getBoundingClientRect(), r = scroll.getBoundingClientRect();
      const scale = b.width / Number(board.dataset.logicalWidth || 1000);
      const y = r.top + r.height * .4, logicalY = (y - b.top) / scale;
      const capture = board.setPointerCapture; board.setPointerCapture = () => {};
      try {
        for (let i = 0; i <= 20; i++) {
          const logicalX = 800 + i * 50, x = b.left + logicalX * scale;
          const type = i === 0 ? 'pointerdown' : i === 20 ? 'pointerup' : 'pointermove';
          const target = i === 0 ? document.elementFromPoint(x, y) : board;
          target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 79,
            isPrimary: true, button: 0, buttons: i === 20 ? 0 : 1, pressure: i === 20 ? 0 : .6, clientX: x, clientY: y }));
          if (i < 20) await new Promise(resolve => setTimeout(resolve, 16));
        }
      } finally { board.setPointerCapture = capture; }
      return { logicalY, visibleRight: (r.right - b.left) / scale, width: Number(board.dataset.logicalWidth) };
    });
    assert(crossing.visibleRight > 1800, '50% zoom shows paper well past the old edge: ' + JSON.stringify(crossing));
    const crossed = (await paper(page)).readingWorkspace;
    const stroke = crossed.strokes.find(item => !saved.some(old => old.id === item.id));
    assert(stroke, 'the crossing stroke was saved');
    const xs = stroke.points.map(point => point[0]);
    assert(xs[0] < 1000 && Math.max(...xs) > 1700, 'the stroke continues past x=1000: ' + JSON.stringify(xs));
    assert(xs.filter(x => Math.abs(x - 1000) < .5).length <= 1, 'no samples pile up on the old edge: ' + JSON.stringify(xs));
    assert(xs.every((x, i) => i === 0 || x >= xs[i - 1] - .01), 'samples stay in drawing order across the edge');
    assert(crossed.width >= 2000, 'the saved paper is wide enough for the stroke: ' + crossed.width);
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id="' + stroke.id + '"]').count(), 1, 'the crossing stroke renders');
    saved.push(stroke);
    assert.deepEqual(errors, [], 'full-app fixture has no uncaught errors');
    console.log('Extended workspace paper checks passed (' + ENGINE + ')');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
