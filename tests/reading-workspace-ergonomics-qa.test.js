/* Cross-feature QA for the iPad Workspace ergonomics pass: two/three-finger taps,
   the rail Note button, the direct paper color button, lasso moves, and the
   separate paper history, together in one full-app session with a reload.
   Chromium uses native CDP touch streams; WebKit falls back to synthetic touch
   PointerEvents. Neither replaces a physical iPad and Apple Pencil check. */
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
const paperHighlights = ch => Object.values(ch.highlights || {}).flat();
async function highlightPaper(page, phrase) {
  await page.waitForFunction(phrase => [...document.querySelectorAll('.pdf-page .text-layer span')].some(span => span.textContent.includes(phrase)), phrase);
  await page.evaluate(phrase => {
    const span = [...document.querySelectorAll('.pdf-page .text-layer span')].find(node => node.textContent.includes(phrase) && node.firstChild);
    const start = span.firstChild.textContent.indexOf(phrase), range = document.createRange();
    range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + phrase.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 92 }));
  }, phrase);
  await page.locator('#selectionCreateHighlight').waitFor({ state: 'visible' });
  await page.locator('#selectionCreateHighlight [data-selection-highlight-color="yellow"]').click();
  if (await page.locator('#selectionCard').isVisible()) await page.locator('#selectionClose').click();
}
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
async function fingersTap(page, count) {
  const box = await page.locator('#workspaceScroll').boundingBox();
  const points = Array.from({ length: count }, (_, i) => ({ x: box.x + box.width * (.35 + i * .12), y: box.y + box.height * .82 }));
  if (ENGINE === 'chromium') {
    const session = await page.context().newCDPSession(page);
    const touches = [];
    for (const [i, p] of points.entries()) {
      touches.push({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: .5 });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...touches] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.evaluate(points => {
      const send = (type, p, i) => (document.elementFromPoint(p.x, p.y)).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerType: 'touch', pointerId: 300 + i, isPrimary: i === 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: p.x, clientY: p.y }));
      points.forEach((p, i) => send('pointerdown', p, i)); points.forEach((p, i) => send('pointerup', p, i));
    }, points);
  }
  await page.waitForTimeout(60);
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
    await page.locator('#pdfFile').setInputFiles({ name: 'ergonomics-qa.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });

    // Paper highlight, then workspace ink, then a rail note.
    await highlightPaper(page, 'Paper highlight stays independent');
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')).highlights || {}).flat().length === 1);
    await pen(page, [[.25, .55], [.32, .58], [.40, .60]]);
    await page.locator('#workspaceNewNote').click();
    const note = page.locator('.workspace-card textarea.workspace-note').first();
    await note.fill('QA note from the rail');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')).readingExcerpts?.items?.some(item => item.note === 'QA note from the rail'));
    await page.locator('#workspaceBoard').focus();
    let ch = await saved(page);
    assert.equal(paperHighlights(ch).length, 1);
    assert.equal(live(ch.readingWorkspace).length, 1);
    const original = live(ch.readingWorkspace)[0];

    // Lasso the free ink and nudge it: one grouped move in workspace history.
    await page.locator('[data-workspace-tool="select"]').click();
    await pen(page, [[.2, .5], [.45, .5], [.45, .66], [.2, .66], [.2, .5]], 82);
    await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
    await page.locator('.workspace-selection-box').focus();
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForFunction(x => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return ch.readingWorkspace.strokes.some(s => s.points[0][0] > x + 10 && Number((ch.readingWorkspace.deleted || {})[s.id] || 0) < Number(s.updatedAt || 0)); }, original.points[0][0]);
    const moved = live((await saved(page)).readingWorkspace);
    assert.equal(moved.length, 1);
    assert(moved[0].points[0][0] > original.points[0][0] + 10, 'lasso nudge moved the ink: ' + JSON.stringify([original.points[0], moved[0].points[0]]));
    await page.keyboard.press('Escape');

    // Two-finger taps undo in order: the move, then the newer note, then the stroke.
    // Paper highlights are untouched.
    await fingersTap(page, 2);
    await page.waitForFunction(x => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return ch.readingWorkspace.strokes.some(s => Math.abs(s.points[0][0] - x) < .5 && Number((ch.readingWorkspace.deleted || {})[s.id] || 0) < Number(s.updatedAt || 0)); }, original.points[0][0]);
    assert.equal(await page.locator('#workspaceStatus').textContent(), 'Undid last workspace change');
    await fingersTap(page, 2);
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')).readingExcerpts.items.some(item => item.note === 'QA note from the rail'));
    assert.equal(live((await saved(page)).readingWorkspace).length, 1, 'the note goes before the older stroke');
    await fingersTap(page, 2);
    await page.waitForFunction(() => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return ch.readingWorkspace.strokes.every(s => Number((ch.readingWorkspace.deleted || {})[s.id] || 0) >= Number(s.updatedAt || 0)); });
    ch = await saved(page);
    assert.equal(paperHighlights(ch).length, 1, 'workspace taps never undo paper highlights');
    assert.equal(await page.locator('#zenUndo').isDisabled(), false, 'paper Undo stays available');

    // Three-finger taps redo the stroke, then bring the note back with its text.
    await fingersTap(page, 3);
    await page.waitForFunction(() => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return ch.readingWorkspace.strokes.some(s => Number((ch.readingWorkspace.deleted || {})[s.id] || 0) < Number(s.updatedAt || 0)); });
    await page.waitForTimeout(300);
    await fingersTap(page, 3);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')).readingExcerpts.items.some(item => item.note === 'QA note from the rail'));

    // Paper color button and paper Undo stay on the paper side.
    await page.locator('#zenWorkspaceMarker').click();
    await page.locator('#highlightToolbar [data-highlight-color="blue"]').click();
    await page.locator('#highlightDone').click();
    await page.locator('#zenUndo').click();
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')).highlights || {}).flat().length === 0);
    ch = await saved(page);
    assert.equal(live(ch.readingWorkspace).length, 1, 'paper Undo leaves workspace ink');

    // Everything survives a reload.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    ch = await saved(page);
    assert.equal(live(ch.readingWorkspace).length, 1);
    assert(ch.readingExcerpts.items.some(item => item.note === 'QA note from the rail'));
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS  Workspace ergonomics cross-feature QA (' + ENGINE + ')');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
