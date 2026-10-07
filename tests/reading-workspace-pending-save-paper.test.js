/* Handwriting that is still waiting to save (v194 saves once the Pencil rests) must land
   on the paper it was written on, and Undo before that save must win. Opening another
   paper right after writing, and undoing a stroke before the pause, both checked against
   the stored library. Chromium with synthetic Pencil events. */
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

    await page.waitForTimeout(1500);
    const paperA = await page.evaluate(() => localStorage.getItem('readingRoom.lastOpen.v1'));
    const stored = async id => page.evaluate(id => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ((ch && ch.readingWorkspace || {}).strokes || []).map(s => s.id);
    }, id);
    const startA = (await stored(paperA)).length;

    // Undo before the pause: the stroke never reaches storage.
    await scribble(0, 21);
    await page.locator('#workspaceUndo').click();
    await page.waitForTimeout(1800);
    assert.equal((await stored(paperA)).length, startA, 'a stroke undone before the save is not stored');
    // Redo before the pause, then a second stroke right after: both land once the Pencil rests.
    await page.locator('#workspaceBoard').focus(); await page.keyboard.press('Control+Shift+Z');
    await scribble(1, 22);
    await page.waitForTimeout(1800);
    assert.equal((await stored(paperA)).length, startA + 2, 'redo and the next stroke both save');

    // Three quick strokes, then another paper opens at once.
    for (let k = 2; k < 5; k++) await scribble(k, 30 + k);
    const shownA = await page.evaluate(() => [...document.querySelectorAll('#workspaceInk path[data-stroke-id]')].map(n => n.dataset.strokeId));
    await page.locator('#pdfFile').setInputFiles({ name: 'second-paper.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(id => localStorage.getItem('readingRoom.lastOpen.v1') && localStorage.getItem('readingRoom.lastOpen.v1') !== id, paperA);
    const paperB = await page.evaluate(() => localStorage.getItem('readingRoom.lastOpen.v1'));
    await page.waitForTimeout(1800);
    const savedA = await stored(paperA);
    assert.equal(savedA.length, startA + 5, 'the strokes written just before switching are stored on their paper');
    assert.deepEqual([...savedA].sort(), [...shownA].sort(), 'exactly the strokes that were on screen');
    assert.equal((await stored(paperB)).length, 0, 'the newly opened paper gets none of them');

    // Reopening the first paper after a reload shows them.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready') || document.body.classList.contains('zen'));
    assert.equal((await stored(paperA)).length, startA + 5, 'still stored after a reload');
    assert.deepEqual(errors, []);
    console.log('PASS pending handwriting saves to its own paper, and Undo before the save wins');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
