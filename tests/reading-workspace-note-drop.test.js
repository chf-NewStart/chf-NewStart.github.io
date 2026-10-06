/* Notes go where the reader wants them. Tapping Note puts the new note in the middle of
   the visible Workspace (a second tap takes the nearest free spot). Dragging from Note with a
   finger or the mouse shows a note outline and drops the note where it is let go, held by
   its top strip; letting go off the Workspace adds nothing. Chromium CDP touch; not a
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
    if (ENGINE !== 'chromium') { console.log('SKIP drag needs Chromium CDP touch'); return; }
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'note-drop.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const cards = page.locator('.workspace-card');
    const view = await page.locator('#workspaceScroll').boundingBox();
    const close = async () => { await page.keyboard.press('Escape'); await page.locator('#workspaceBoard').focus(); await page.waitForTimeout(150); };

    // 1. Tap: centered in the view.
    await page.locator('#workspaceNewNote').click();
    await cards.first().waitFor({ state: 'visible' });
    await close();
    let box = await cards.nth(0).boundingBox();
    const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
    assert(Math.abs(box.x + box.width / 2 - cx) < 12, `tapped note is centred across the view: ${JSON.stringify(box)} vs ${cx}`);
    assert(Math.abs(box.y + box.height / 2 - cy) < 40, `tapped note is centred down the view: ${JSON.stringify(box)} vs ${cy}`);

    // 2. A second tap takes the nearest free spot instead of covering the first note.
    await page.locator('#workspaceNewNote').click();
    await page.waitForFunction(() => document.querySelectorAll('.workspace-card').length === 2);
    await close();
    const boxes = await cards.evaluateAll(list => list.map(card => card.getBoundingClientRect().toJSON()));
    const [a, b] = boxes.sort((p, q) => p.y - q.y);
    assert(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) < 1, 'second tapped note does not cover the first: ' + JSON.stringify(boxes));
    assert(Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy) < view.height * .6, 'second tapped note stays near the middle: ' + JSON.stringify(b));

    // 3. Finger drag from Note drops the note under the finger, by its top strip.
    const note = await page.locator('#workspaceNewNote').boundingBox();
    const start = { x: note.x + note.width / 2, y: note.y + note.height / 2 };
    const drop = { x: view.x + view.width * .35, y: view.y + view.height * .78 };
    const cdp = await context.newCDPSession(page);
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });
    await touch('touchStart', start);
    let sawGhost = false;
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', { x: start.x + (drop.x - start.x) * i / 12, y: start.y + (drop.y - start.y) * i / 12 });
      if (i === 8) sawGhost = await page.locator('.workspace-note-ghost').count() === 1;
    }
    await touch('touchEnd');
    assert(sawGhost, 'a note outline follows the finger while dragging');
    await page.waitForFunction(() => document.querySelectorAll('.workspace-card').length === 3);
    assert.equal(await page.locator('.workspace-note-ghost').count(), 0, 'outline is gone after the drop');
    await page.waitForTimeout(450);
    await close();
    assert.equal(await cards.count(), 3, 'the drag adds exactly one note (no extra tap note)');
    const third = (await cards.evaluateAll(list => list.map(card => card.getBoundingClientRect().toJSON())))
      .find(r => Math.abs(r.x + r.width / 2 - drop.x) < 16);
    assert(third, 'dropped note is centred on the finger: ' + JSON.stringify(drop));
    assert(drop.y - third.y > 0 && drop.y - third.y < 40, `finger holds the note by its top strip: top ${third.y}, finger ${drop.y}`);

    // 4. Mouse drag let go outside the Workspace adds nothing.
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x - 200, start.y, { steps: 6 });
    await page.mouse.move(view.x - 150, view.y + 100, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    assert.equal(await cards.count(), 3, 'dropping off the Workspace adds no note');
    assert.equal(await page.locator('.workspace-note-ghost').count(), 0);

    // 5. Mouse drag onto the Workspace works too, and it is saved where it was dropped.
    const drop2 = { x: view.x + view.width * .6, y: view.y + view.height * .3 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(drop2.x, drop2.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('.workspace-card').length === 4);
    const ch = await saved(page);
    assert.equal(Object.keys(ch.readingWorkspace.positions).length, 4, 'all four notes have saved positions');
    assert.deepEqual(errors, []);
    console.log('PASS note button: centred tap, no-overlap repeat, finger and mouse drag-to-place, off-board cancel');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
