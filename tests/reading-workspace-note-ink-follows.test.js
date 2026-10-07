/* Writing on a sticky note moves with the note: a stroke drawn inside it, and one that
   starts just off its edge but lies mostly on it. Chromium native CDP touch drags the
   note; not a substitute for a physical iPad and Pencil check. */
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
// Handwriting saves once the Pencil has rested for a moment (v194), so wait for that save.
const saved = async page => (await page.waitForTimeout(1400), page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
  .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'))));
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
    if (ENGINE !== 'chromium') { console.log('SKIP native touch drag needs Chromium CDP'); return; }
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'note-ink.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.locator('#workspaceNewNote').click();
    const card = page.locator('.workspace-card').first();
    await card.waitFor({ state: 'visible' });
    await page.locator('#workspaceBoard').focus();
    await page.waitForTimeout(300);
    const b = await card.boundingBox(), sc = await page.locator('#workspaceScroll').boundingBox();
    const f = (x, y) => [(x - sc.x) / sc.width, (y - sc.y) / sc.height];
    // One stroke inside the note, one starting 12 px below it and running up onto it.
    await pen(page, [f(b.x + 40, b.y + 90), f(b.x + 100, b.y + 105), f(b.x + 160, b.y + 95)], 71);
    const bottom = b.y + b.height;
    await pen(page, [f(b.x + 60, bottom + 12), f(b.x + 70, bottom - 30), f(b.x + 90, bottom - 60), f(b.x + 150, bottom - 70)], 72);
    const strokes = live((await saved(page)).readingWorkspace);
    assert.equal(strokes.length, 2);
    assert(strokes.every(stroke => stroke.anchor), 'both strokes belong to the note: ' + JSON.stringify(strokes.map(s => !!s.anchor)));
    const inkBoxes = () => page.evaluate(() => [...document.querySelectorAll('#workspaceInk [data-stroke-id]')].map(p => { const r = p.getBoundingClientRect(); return [r.x, r.y]; }));
    const inkBefore = await inkBoxes();

    const session = await context.newCDPSession(page);
    const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: .5 })) });
    const grip = [b.x + 60, b.y + 18];
    await touch('touchStart', [[1, ...grip]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[1, grip[0] + i * 15, grip[1] + i * 20]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const moved = await card.boundingBox(), dx = moved.x - b.x, dy = moved.y - b.y;
    assert(Math.abs(dx) > 40 && Math.abs(dy) > 40, 'the note moved: ' + JSON.stringify({ dx, dy }));
    const inkAfter = await inkBoxes();
    inkAfter.forEach(([x, y], i) => {
      assert(Math.abs(x - inkBefore[i][0] - dx) < 3 && Math.abs(y - inkBefore[i][1] - dy) < 3,
        'stroke ' + i + ' moved with the note: ' + JSON.stringify({ before: inkBefore[i], after: [x, y], dx, dy }));
    });
    assert.deepEqual(errors, []);
    console.log('PASS writing on a note, including a stroke that starts just off it, moves with the note');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
