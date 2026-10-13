/* Safari and the iPad don't focus a button or the board when they're tapped, so right after a
   tap in the Workspace a hardware keyboard's keys arrive on <body>. Escape then fell through
   to the reader, which closed the paper (Zen's Escape goes back to the library) instead of
   dropping the lasso selection: found by reading-workspace-lasso-resize on WebKit, Oct 2026.
   Keys on <body> now belong to the Workspace when it was the last thing touched; after a tap
   on the paper, Escape still leaves Zen as before. Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0;
function check(name, condition, extra) { checks++; assert.ok(condition, name + (extra === undefined ? '' : ' [' + JSON.stringify(extra) + ']')); console.log('PASS  ' + name); }

const server = http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0]), file = path.join(ROOT, url === '/' ? 'reading.html' : url);
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function makePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) doc.addPage([612, 792]).drawText('Sugar moves from source to sink in the phloem, page ' + i, { x: 60, y: 700, size: 14, font });
  return Buffer.from(await doc.save());
}
// Pen or touch input on the Workspace, as fractions of its visible area.
async function pointer(page, fractions, pointerType = 'pen', pointerId = 77) {
  await page.locator('#workspaceBoard').evaluate((board, { fractions, pointerType, pointerId }) => {
    const scroll = document.getElementById('workspaceScroll').getBoundingClientRect();
    const capture = board.setPointerCapture; board.setPointerCapture = () => {};
    try {
      fractions.forEach(([x, y], index) => {
        const type = index === 0 ? 'pointerdown' : index === fractions.length - 1 ? 'pointerup' : 'pointermove';
        const clientX = scroll.left + scroll.width * x, clientY = scroll.top + scroll.height * y;
        (document.elementFromPoint(clientX, clientY) || board).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
          pointerType, pointerId, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : .6, clientX, clientY }));
      });
    } finally { board.setPointerCapture = capture; }
  }, { fractions, pointerType, pointerId });
}
// What Safari leaves behind after a tap: nothing focused, so keys go to <body>.
const blurToBody = page => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); return document.activeElement === document.body; });
const paperOpen = page => page.evaluate(() => !document.getElementById('readerPage').classList.contains('hidden') && document.body.classList.contains('workspace-open'));

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/reading.html`);
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'escape.pdf', mimeType: 'application/pdf', buffer: await makePdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.click('#zenWorkspace'); await page.locator('#workspacePanel').waitFor({ state: 'visible' }); await page.waitForTimeout(300);

    // 1. Write, lasso the stroke, then Escape with focus on <body>.
    await pointer(page, [[.25, .55], [.32, .58], [.40, .60]]);
    await page.locator('[data-workspace-tool="select"]').click();
    await pointer(page, [[.2, .5], [.45, .5], [.45, .66], [.2, .66], [.2, .5]], 'pen', 82);
    await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
    check('keys go to <body> after the lasso, as on an iPad', await blurToBody(page));
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    check('Escape drops the lasso selection', await page.locator('.workspace-selection-box').count() === 0 || !await page.locator('.workspace-selection-box').isVisible());
    check('and the paper and the Workspace stay open', await paperOpen(page));

    // 2. A tap on Undo, then Escape with nothing selected: the paper still stays open.
    await page.locator('#workspaceUndo').click();
    await blurToBody(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    check('Escape right after a Workspace button tap does not close the paper', await paperOpen(page));

    // 3. A finger tap on the board, then Escape: still the Workspace's key.
    await page.locator('[data-workspace-tool="pen"]').click();
    await pointer(page, [[.6, .3], [.6, .3]], 'touch', 90);
    await blurToBody(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    check('Escape after a finger tap on the board does not close the paper', await paperOpen(page));

    // 4. After a tap on the paper, Escape leaves Zen for the library as it always has.
    await page.evaluate(() => {
      const frame = document.getElementById('pdfFrame'), r = frame.getBoundingClientRect(), x = r.left + r.width * .5, y = r.top + r.height * .5;
      const target = document.elementFromPoint(x, y) || frame;
      ['pointerdown', 'pointerup'].forEach(type => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 95, isPrimary: true, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: y })));
    });
    await blurToBody(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('readerPage').classList.contains('hidden'), null, { timeout: 4000 }).catch(() => {});
    check('after a tap on the paper, Escape still goes back to the library', await page.evaluate(() => document.getElementById('readerPage').classList.contains('hidden')));
    check('no page errors', !errors.length, errors);
    console.log(`${checks} checks passed (${ENGINE})`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
