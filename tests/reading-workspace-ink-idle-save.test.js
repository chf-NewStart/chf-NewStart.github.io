/* Handwriting does not stall between strokes. Each save writes the whole library (several
   MB once iCloud and Drive merge in), so Workspace strokes save once the Pencil rests rather
   than at every lift, leaving the page saves them at once, and a new stroke adds one path
   without rebuilding the rest of the ink. Chromium with synthetic Pencil events; not a
   substitute for a physical iPad check. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function generatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Paper highlight stays independent of workspace taps.', { x: 52, y: 710, size: 13, font });
  return Buffer.from(await doc.save());
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
  .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    browser = browser;


    if (ENGINE !== 'chromium') { console.log('SKIP needs Chromium'); return; }
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'ink-idle-save.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const pen = async (pts, id) => page.evaluate(({ pts, id }) => {
      const board = document.getElementById('workspaceBoard'); const cap = board.setPointerCapture; board.setPointerCapture = () => {};
      try { pts.forEach(([x, y], i) => { const t = i === 0 ? 'pointerdown' : i === pts.length - 1 ? 'pointerup' : 'pointermove';
        (document.elementFromPoint(x, y) || board).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, composed: true,
          pointerType: 'pen', pointerId: id, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, pressure: t === 'pointerup' ? 0 : .6, clientX: x, clientY: y })); }); }
      finally { board.setPointerCapture = cap; } }, { pts, id });
    const line = (x0, y0, x1, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    const rect = (l, t, r, b) => [...line(l, t, r, t), ...line(r, t, r, b), ...line(r, b, l, b), ...line(l, b, l, t)];


    await page.evaluate(() => {
      window.__libraryWrites = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (this === localStorage && key === 'readingRoom.v1') window.__libraryWrites++; return setItem.call(this, key, value); };
    });
    const writes = () => page.evaluate(() => window.__libraryWrites);
    const storedStrokes = async () => { const ch = await saved(page); return ((ch.readingWorkspace || {}).strokes || []).length; };
    const pane = await page.locator('#workspaceScroll').boundingBox();
    const at = k => [pane.x + 60 + (k % 4) * 120, pane.y + 80 + Math.floor(k / 4) * 60];
    const scribble = async (k, id) => { const [x, y] = at(k); await pen(line(x, y, x + 80, y + 20, 16), id); };

    // Opening the Workspace narrows the paper, which saves the reading position; let it land.
    await page.waitForTimeout(1500);
    // Five strokes in a row: nothing writes the library while the hand keeps writing.
    const before = await writes(), storedBefore = await storedStrokes();
    for (let k = 0; k < 5; k++) { await scribble(k, 20 + k); await page.waitForTimeout(250); }
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 5, 'every stroke shows at once');
    assert.equal(await writes(), before, 'strokes in a row do not each rewrite the library');
    // Once the Pencil rests, one save holds all five.
    await page.waitForTimeout(1700);
    assert.equal(await writes(), before + 1, 'one save after the pause');
    assert.equal(await storedStrokes(), storedBefore + 5, 'that save holds every stroke');

    // A new stroke adds its own path and leaves the others' paths alone.
    await page.evaluate(() => document.querySelectorAll('#workspaceInk path[data-stroke-id]').forEach(node => { node.__kept = true; }));
    await scribble(6, 40);
    const kept = await page.evaluate(() => [...document.querySelectorAll('#workspaceInk path[data-stroke-id]')].map(node => !!node.__kept));
    assert.equal(kept.length, 6);
    assert.equal(kept.filter(Boolean).length, 5, 'the earlier paths are the same elements, not rebuilt');

    // Leaving the page (or the app) saves a stroke that is still waiting.
    const waiting = await writes();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert(await writes() > waiting, 'hiding the page saves at once');
    assert.equal(await storedStrokes(), storedBefore + 6, 'including the newest stroke');
    await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });

    // Undo and redo still work on strokes that saved late.
    await page.locator('#workspaceUndo').click(); await page.waitForTimeout(200);
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 5, 'Undo removes the newest stroke');
    await page.locator('#workspaceBoard').focus(); await page.keyboard.press('Control+Shift+Z'); await page.waitForTimeout(200);
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 6, 'Redo brings it back');

    // An eraser sweep that is cancelled leaves no faded ink behind.
    await page.locator('[data-workspace-tool="eraser"]').click();
    const [ex, ey] = at(0);
    await page.evaluate(({ x, y }) => {
      const board = document.getElementById('workspaceBoard'); board.setPointerCapture = () => {};
      const fire = (type, px) => (document.elementFromPoint(px, y) || board).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType: 'pen', pointerId: 77, isPrimary: true, button: 0, buttons: type === 'pointercancel' ? 0 : 1, pressure: .5, clientX: px, clientY: y + 10 }));
      fire('pointerdown', x - 10); for (let i = 0; i <= 10; i++) fire('pointermove', x - 10 + i * 10); fire('pointercancel', x + 90);
    }, { x: ex, y: ey });
    await page.waitForTimeout(200);
    const faded = await page.evaluate(() => [...document.querySelectorAll('#workspaceInk path[data-stroke-id]')].filter(node => node.style.opacity).length);
    assert.equal(faded, 0, 'a cancelled sweep restores the ink it faded');
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 6, 'and erases nothing');

    // Pencil use marks only the divider, never the whole page.
    assert.equal(await page.evaluate(() => document.body.classList.contains('workspace-pen-active')), false);

    // Everything survives a reload.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready') || document.body.classList.contains('zen'));
    assert.equal(await storedStrokes(), storedBefore + 6);
    assert.deepEqual(errors, []);
    console.log('PASS handwriting saves after a pause, saves on hide, and redraws only new ink');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
