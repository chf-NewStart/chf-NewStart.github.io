/* The paper/Workspace divider ignores a resting hand. While Apple Pencil is down, or just
   after it lifts, finger touches on the divider do nothing; palm-sized contacts do nothing;
   Pencil resizes only from the middle grip; and a touch that doesn't drag leaves the split
   alone. A deliberate finger drag still resizes. Synthetic pointer events in Chromium; not a
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

    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'divider-palm.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    const percent = () => page.evaluate(() => Number(document.getElementById('workspaceDivider').getAttribute('aria-valuenow')));
    // Drag on the divider with one pointer; options: type, dy from the divider's middle, contact size, pen held elsewhere.
    const drag = (opts) => page.evaluate(async ({ type, dy = 0, size = 8, dx = -160, penElsewhere = false, penJustLifted = false }) => {
      const divider = document.getElementById('workspaceDivider'), r = divider.getBoundingClientRect();
      divider.setPointerCapture = () => {}; divider.hasPointerCapture = () => false; divider.releasePointerCapture = () => {};
      const x = r.left + r.width / 2, y = r.top + r.height / 2 + dy;
      const fire = (target, kind, props) => target.dispatchEvent(new PointerEvent(kind, { bubbles: true, cancelable: true, isPrimary: true, button: 0, ...props }));
      const paper = document.getElementById('pdfFrame');
      if (penElsewhere || penJustLifted) fire(paper, 'pointerdown', { pointerType: 'pen', pointerId: 40, buttons: 1, pressure: .5, clientX: x - 100, clientY: y });
      if (penJustLifted) fire(paper, 'pointerup', { pointerType: 'pen', pointerId: 40, buttons: 0, pressure: 0, clientX: x - 100, clientY: y });
      const base = { pointerType: type, pointerId: 41, width: size, height: size, pressure: .5 };
      fire(divider, 'pointerdown', { ...base, buttons: 1, clientX: x, clientY: y });
      for (let i = 1; i <= 8; i++) fire(divider, 'pointermove', { ...base, buttons: 1, clientX: x + dx * i / 8, clientY: y });
      fire(divider, 'pointerup', { ...base, buttons: 0, clientX: x + dx, clientY: y });
      if (penElsewhere) fire(paper, 'pointerup', { pointerType: 'pen', pointerId: 40, buttons: 0, pressure: 0, clientX: x - 100, clientY: y });
      await new Promise(resolve => setTimeout(resolve, 900));
    }, opts);
    const start = await percent();
    await drag({ type: 'touch', penElsewhere: true });
    assert.equal(await percent(), start, 'a finger on the divider while Pencil is writing does nothing');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 900)));
    await drag({ type: 'touch', size: 70 });
    assert.equal(await percent(), start, 'a palm-sized contact on the divider does nothing');
    await drag({ type: 'pen', dy: 200 });
    assert.equal(await percent(), start, 'Pencil away from the middle grip does nothing');
    await drag({ type: 'touch', dx: 2 });
    assert.equal(await percent(), start, 'a touch that does not drag leaves the split alone');
    await drag({ type: 'touch', penJustLifted: true });
    assert.equal(await percent(), start, 'a finger right after Pencil lifts does nothing');
    await drag({ type: 'touch' });
    const fingered = await percent();
    assert(fingered < start - 5, `a deliberate finger drag still resizes: ${start} -> ${fingered}`);
    await drag({ type: 'pen', dx: 120 });
    assert(await percent() > fingered + 5, 'Pencil on the middle grip still resizes');
    assert.deepEqual(errors, []);
    console.log('PASS the divider ignores a resting hand and stray Pencil, and still resizes on purpose');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
