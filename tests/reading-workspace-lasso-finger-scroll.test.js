/* In lasso mode a finger scrolls the Workspace, as with the pen; the Pencil draws the
   lasso and a finger tap still releases it. Chromium native CDP touch; not a substitute
   for a physical iPad check. */
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
    if (ENGINE !== 'chromium') { console.log('SKIP native touch scrolling needs Chromium CDP'); return; }
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'lasso-scroll.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await pen(page, [[.2, .3], [.3, .32], [.4, .34]]);
    await page.locator('[data-workspace-tool="select"]').click();

    const session = await context.newCDPSession(page);
    const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: .5 })) });
    const box = await page.locator('#workspaceScroll').boundingBox();
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];

    // 1. A one-finger drag on blank paper scrolls the Workspace and draws no lasso.
    const before = await page.evaluate(() => workspaceScroll.scrollTop);
    const [x, y] = at(.5, .8);
    await touch('touchStart', [[1, x, y]]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [[1, x, y - i * 25]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => workspaceScroll.scrollTop);
    assert(after > before + 100, 'a finger scrolls the paper in lasso mode: ' + before + ' -> ' + after);
    assert.equal(await page.locator('.workspace-lasso-preview').count(), 0, 'the finger drew no lasso');
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false);
    await page.evaluate(() => { workspaceScroll.scrollTop = 0; });
    await page.waitForTimeout(100);

    // 2. The Pencil still lassos the ink, and a finger tap on blank paper releases it.
    await pen(page, [[.15, .25], [.45, .25], [.45, .4], [.15, .4], [.15, .25]], 90);
    await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
    const [tx, ty] = at(.6, .75);
    await touch('touchStart', [[1, tx, ty]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'a finger tap off the selection releases it');
    assert.deepEqual(errors, []);
    console.log('PASS lasso mode: fingers scroll, the Pencil lassos, a finger tap releases');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
