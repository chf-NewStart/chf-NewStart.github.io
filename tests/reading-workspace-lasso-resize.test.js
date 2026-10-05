/* Lasso resize and finger move, and the Pencil moving a note by its top strip, in the
   full app at iPad landscape size. Chromium uses native CDP touch; WebKit falls back
   to synthetic PointerEvents. Neither replaces a physical iPad and Apple Pencil check. */
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

async function fingerDrag(page, from, to) {
  if (ENGINE === 'chromium') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1, radiusX: 4, radiusY: 4, force: .5 }] });
    for (let i = 1; i <= 10; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 10, y: from.y + (to.y - from.y) * i / 10, id: 1, radiusX: 4, radiusY: 4, force: .5 }] });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.evaluate(({ from, to }) => {
      const board = document.getElementById('workspaceBoard'), capture = board.setPointerCapture; board.setPointerCapture = () => {};
      const target = document.elementFromPoint(from.x, from.y);
      const send = (type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 401, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
      send('pointerdown', from.x, from.y);
      for (let i = 1; i <= 10; i++) send('pointermove', from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10);
      send('pointerup', to.x, to.y); board.setPointerCapture = capture;
    }, { from, to });
  }
  await page.waitForTimeout(250);
}
const card0Tape = page => page.locator('.workspace-card').first().evaluate(card => { const after = getComputedStyle(card, '::after'); const grabber = getComputedStyle(card, '::before'); return after.top === '0px' && after.left === '0px' && grabber.content === '""' && grabber.height === '4px' && grabber.pointerEvents === 'none' ? 'none' : 'tape'; });
const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

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
    await page.locator('#pdfFile').setInputFiles({ name: 'lasso-resize.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });

    // 1. Finger drag on a corner handle resizes a lassoed stroke about the opposite corner.
    await pen(page, [[.25, .55], [.32, .58], [.40, .60]]);
    const original = live((await saved(page)).readingWorkspace)[0];
    await page.locator('[data-workspace-tool="select"]').click();
    await pen(page, [[.2, .5], [.45, .5], [.45, .66], [.2, .66], [.2, .5]], 82);
    const selection = page.locator('.workspace-selection-box');
    await selection.waitFor({ state: 'visible' });
    assert.equal(await page.locator('.workspace-selection-handle').count(), 4, 'four corner handles');
    const box0 = await selection.boundingBox();
    const se = centre(await page.locator('.workspace-selection-handle[data-corner="se"]').boundingBox());
    await fingerDrag(page, se, { x: se.x + box0.width, y: se.y + box0.height });
    const grown = live((await saved(page)).readingWorkspace)[0];
    const span = s => s.points.at(-1)[0] - s.points[0][0];
    assert(Math.abs(span(grown) / span(original) - 2) < .15, 'dragging the corner doubles the ink: ' + span(original) + ' -> ' + span(grown));
    assert(Math.abs(grown.width / original.width - 2) < .15, 'line weight scales with it');
    assert(Math.abs(grown.points[0][0] - original.points[0][0]) < 6, 'the opposite corner stays put');
    const box1 = await selection.boundingBox();
    assert(box1.width > box0.width * 1.8, 'the selection box follows the new size');
    assert.equal(await page.locator('#workspaceStatus').textContent(), '', 'no warning after resizing');

    // 2. A finger drag inside the selection moves it; the paper does not scroll.
    const scrollBefore = await page.evaluate(() => [workspaceScroll.scrollLeft, workspaceScroll.scrollTop]);
    const start = centre(box1);
    await fingerDrag(page, start, { x: start.x - 60, y: start.y + 40 });
    const moved = live((await saved(page)).readingWorkspace)[0];
    assert(moved.points[0][0] < grown.points[0][0] - 20 && moved.points[0][1] > grown.points[0][1] + 15, 'finger drag moved the selection: ' + JSON.stringify([grown.points[0], moved.points[0]]));
    assert.deepEqual(await page.evaluate(() => [workspaceScroll.scrollLeft, workspaceScroll.scrollTop]), scrollBefore, 'moving a selection never scrolls the paper');

    // 3. A finger that starts just outside the dashed box still moves it.
    const box2 = await selection.boundingBox();
    const edge = { x: box2.x + box2.width / 2, y: box2.y + box2.height + 10 };
    await fingerDrag(page, edge, { x: edge.x + 30, y: edge.y });
    const nudged = live((await saved(page)).readingWorkspace)[0];
    assert(nudged.points[0][0] > moved.points[0][0] + 10, 'a near miss by a finger still drags the selection');

    // 4. Keyboard resize, then Undo walks back through every step.
    await selection.focus();
    await page.keyboard.press('-');
    const smaller = live((await saved(page)).readingWorkspace)[0];
    assert(span(smaller) < span(nudged) * .95, 'minus shrinks the selection from the keyboard');
    for (let i = 0; i < 4; i++) { await page.locator('#workspaceUndo').click(); await page.waitForTimeout(80); }
    const restored = live((await saved(page)).readingWorkspace)[0];
    assert.deepEqual(restored.points, original.points, 'four Undos restore the original ink');
    assert.equal(restored.width, original.width);
    await page.locator('#workspaceRedo').evaluate(button => button.click());
    assert(Math.abs(span(live((await saved(page)).readingWorkspace)[0]) / span(original) - 2) < .15, 'Redo reapplies the resize');

    // 5. With the pen tool, the Pencil on a note's top strip moves the note and writes nothing.
    await page.keyboard.press('Escape');
    await page.locator('[data-workspace-tool="pen"]').click();
    await page.locator('#workspaceNewNote').click();
    const card = page.locator('.workspace-card').first();
    await card.waitFor({ state: 'visible' });
    assert.equal(await card0Tape(page), 'none', 'notes are plain: a top strip with a grabber bar, no tape or pin');
    await page.locator('#workspaceBoard').focus();
    const strokesBefore = live((await saved(page)).readingWorkspace).length;
    const cardBox = await card.boundingBox();
    assert(Math.abs(cardBox.height / cardBox.width - .75) < .06, 'a new rail note starts compact, a little shorter than wide: ' + JSON.stringify(cardBox));
    const tape = { x: cardBox.x + 40, y: cardBox.y + 20 };
    await page.evaluate(({ tape }) => {
      const handle = document.querySelector('.workspace-card .workspace-card-handle');
      const board = document.getElementById('workspaceBoard');
      const capture = handle.setPointerCapture; handle.setPointerCapture = () => {};
      const send = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 501, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: .5, clientX: x, clientY: y }));
      send(document.elementFromPoint(tape.x, tape.y) || board, 'pointerdown', tape.x, tape.y);
      // A captured Pencil keeps reporting to the note's grip.
      for (let i = 1; i <= 8; i++) send(handle, 'pointermove', tape.x + i * 15, tape.y + i * 10);
      send(handle, 'pointerup', tape.x + 120, tape.y + 80);
      handle.setPointerCapture = capture;
    }, { tape });
    await page.waitForTimeout(200);
    const cardAfter = await card.boundingBox();
    assert(cardAfter.x > cardBox.x + 80 && cardAfter.y > cardBox.y + 50, 'Pencil on the top strip moved the note: ' + JSON.stringify([cardBox, cardAfter]));
    assert.equal(live((await saved(page)).readingWorkspace).length, strokesBefore, 'Pencil on the top strip wrote no stroke');

    // 6. The Pencil elsewhere on the note still writes.
    const after = await card.boundingBox();
    await page.locator('#workspaceBoard').evaluate((board, b) => {
      const capture = board.setPointerCapture; board.setPointerCapture = () => {};
      const pts = [[.3, .6], [.5, .65], [.7, .7]].map(([fx, fy]) => [b.x + b.width * fx, b.y + b.height * fy]);
      pts.forEach(([x, y], i) => (document.elementFromPoint(x, y) || board).dispatchEvent(new PointerEvent(i === 0 ? 'pointerdown' : i === pts.length - 1 ? 'pointerup' : 'pointermove', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 502, isPrimary: true, button: 0, buttons: i === pts.length - 1 ? 0 : 1, pressure: .5, clientX: x, clientY: y })));
      board.setPointerCapture = capture;
    }, after);
    await page.waitForFunction(n => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
      return (ch.readingWorkspace.strokes || []).filter(s => Number((ch.readingWorkspace.deleted || {})[s.id] || 0) < Number(s.updatedAt || 0)).length === n + 1; }, strokesBefore);

    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS lasso resize, finger move, keyboard resize, undo/redo, Pencil top-strip drag');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
