/* Lasso moves still save when the small (~5 MB) library store is full. A lasso move is an
   all-or-nothing save; it used to fail whenever localStorage refused it, even though the
   device snapshot could hold it, so the iPad app (whose library had filled the store)
   showed "Could not move this selection" on every move. Chromium; not a substitute for a
   physical iPad check. */
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
    await page.locator('#pdfFile').setInputFiles({ name: 'full-lasso.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
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
    await page.locator('#workspaceNewNote').click(); await page.keyboard.type('note'); await page.keyboard.press('Escape');
    await page.locator('#workspaceBoard').focus(); await page.waitForTimeout(500);
    const card = page.locator('.workspace-card').first();
    const box = await card.boundingBox();
    await pen(line(box.x + 30, box.y + 80, box.x + box.width - 30, box.y + 90), 5);
    await page.waitForTimeout(300);
    // From here on the library key behaves like a full store.
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === 'readingRoom.v1') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return setItem.call(this, key, value);
      };
    });
    await page.locator('[data-workspace-tool="select"]').click();
    await pen(rect(box.x - 30, box.y - 30, box.x + box.width + 30, box.y + box.height + 30), 7);
    await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
    const sel = await page.locator('.workspace-selection-box').boundingBox();
    await pen(line(sel.x + sel.width / 2, sel.y + sel.height / 2, sel.x + sel.width / 2 + 90, sel.y + sel.height / 2 + 60), 9);
    await page.waitForTimeout(400);
    const text = await page.locator('#workspacePanel').textContent();
    assert.doesNotMatch(text, /Could not move|could not save|changed elsewhere/i, 'the lasso move is not refused while the store is full');
    const moved = await card.boundingBox();
    assert(moved.x - box.x > 60 && moved.y - box.y > 40, `the note moved with the lasso: ${JSON.stringify(box)} -> ${JSON.stringify(moved)}`);
    let snap = '';
    for (let i = 0; i < 40; i++) {
      snap = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('marginFiles', 2); r.onerror = () => resolve('');
        r.onsuccess = () => { const g = r.result.transaction('derived').objectStore('derived').get('state:snapshot:latest'); g.onerror = () => resolve(''); g.onsuccess = () => resolve(g.result || ''); }; }));
      const local = await page.evaluate(() => localStorage.getItem('readingRoom.v1'));
      if (snap && snap !== local) break;
      await page.waitForTimeout(100);
    }
    const ws = JSON.parse(snap).chapters.find(ch => ch.readingWorkspace && Object.keys(ch.readingWorkspace.positions || {}).length).readingWorkspace;
    const stale = JSON.parse(await page.evaluate(() => localStorage.getItem('readingRoom.v1'))).chapters.find(ch => ch.readingWorkspace && Object.keys(ch.readingWorkspace.positions || {}).length).readingWorkspace;
    const id = Object.keys(ws.positions)[0];
    assert(ws.positions[id].x > stale.positions[id].x, 'the device snapshot holds the moved note while localStorage stays stale');
    assert.deepEqual(errors, []);
    console.log('PASS a lasso move saves to the device snapshot when the library store is full');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
