/* The Workspace eraser measures the ink once per sweep, not on every Pencil sample,
   and still erases exactly what it crosses. Re-reading every stroke on each sample made
   the eraser stutter on an iPad. Not a substitute for a physical iPad and Pencil check. */
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
const live = workspace => (workspace?.strokes || []).filter(stroke => Number((workspace.deleted || {})[stroke.id] || 0) < Number(stroke.updatedAt || 0));
async function pen(page, fractions, pointerId = 77) {
  await page.locator('#workspaceBoard').evaluate((board, { fractions, pointerId }) => {
    const scroll = document.getElementById('workspaceScroll').getBoundingClientRect();
    const capture = board.setPointerCapture; board.setPointerCapture = () => {};
    try {
      fractions.forEach(([x, y], index) => {
        const type = index === 0 ? 'pointerdown' : index === fractions.length - 1 ? 'pointerup' : 'pointermove';
        const clientX = scroll.left + scroll.width * x, clientY = scroll.top + scroll.height * y;
        (document.elementFromPoint(clientX, clientY) || board).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
          pointerType: 'pen', pointerId, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
          pressure: type === 'pointerup' ? 0 : .6, clientX, clientY }));
      });
    } finally { board.setPointerCapture = capture; }
  }, { fractions, pointerId });
}
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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'eraser-sweep.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });

    // Twenty horizontal lines on the left and twenty in the middle, clear of the tool rail.
    for (let s = 0; s < 40; s++) {
      const y = .08 + .8 * (s % 20) / 20, x0 = s < 20 ? .05 : .45;
      const points = []; for (let i = 0; i <= 30; i++) points.push([x0 + .3 * i / 30, y]);
      await pen(page, points, 1000 + s);
    }
    const before = live((await saved(page)).readingWorkspace);
    assert.equal(before.length, 40, 'forty lines drawn');

    await page.locator('[data-workspace-tool="eraser"]').click();
    const sweep = await page.evaluate(() => {
      // Count how often the sweep walks the drawn ink; the old eraser did it on every sample.
      const inkLayer = document.getElementById('workspaceInk'), original = Element.prototype.querySelectorAll;
      let reads = 0, faded = 0;
      Element.prototype.querySelectorAll = function () { if (this === inkLayer) reads++; return original.apply(this, arguments); };
      const board = document.getElementById('workspaceBoard'), scroll = workspaceScroll.getBoundingClientRect();
      const capture = board.setPointerCapture; board.setPointerCapture = () => {};
      const send = (type, fx, fy) => { const x = scroll.left + scroll.width * fx, y = scroll.top + scroll.height * fy;
        (document.elementFromPoint(x, y) || board).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
          pointerType: 'pen', pointerId: 9, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: .5, clientX: x, clientY: y })); };
      try {
        // A vertical sweep through the left column only, in 120 Pencil samples.
        send('pointerdown', .2, .04);
        for (let i = 1; i < 120; i++) send('pointermove', .2, .04 + .88 * i / 120);
        faded = [...document.querySelectorAll('#workspaceInk [data-stroke-id]')].filter(path => path.style.opacity === '0.2').length;
        const sweepReads = reads;
        send('pointerup', .2, .92);
        return { sweepReads, faded };
      } finally { Element.prototype.querySelectorAll = original; board.setPointerCapture = capture; }
    });
    assert(sweep.sweepReads <= 3, 'one sweep reads the ink once, not on every Pencil sample: ' + sweep.sweepReads + ' reads');
    assert(sweep.faded >= 20, 'crossed lines fade while the sweep runs: ' + sweep.faded);
    const after = live((await saved(page)).readingWorkspace);
    assert.equal(after.length, 20, 'the sweep erased exactly the twenty lines it crossed');
    assert(after.every(stroke => stroke.points[0][0] > 400), 'only the right column is left');

    await page.locator('#workspaceUndo').click();
    assert.equal(live((await saved(page)).readingWorkspace).length, 40, 'Undo restores the whole sweep');
    assert.deepEqual(errors, []);
    console.log('PASS workspace eraser measures ink once per sweep and erases what it crosses');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
