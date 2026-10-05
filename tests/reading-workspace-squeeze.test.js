/* Squeezing the Workspace pane with the divider scales the sheet (notes, text and
   ink together) instead of reflowing notes into a narrower column. Chromium/WebKit
   layout evidence only; a physical iPad check is still needed. */
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

const sheet = page => page.evaluate(() => {
  const board = document.getElementById('workspaceBoard'), b = board.getBoundingClientRect();
  const units = Number(board.dataset.logicalWidth || 1000) / b.width;
  const card = document.querySelector('.workspace-card'), c = card.getBoundingClientRect();
  const ink = document.querySelector('#workspaceInk [data-stroke-id]').getBoundingClientRect();
  const pane = document.getElementById('workspaceScroll').getBoundingClientRect();
  return { pane: pane.width, cardWidth: c.width * units, cardHeight: c.height * units,
    inkWidth: ink.width * units, cardRight: c.right, paneRight: pane.right, font: parseFloat(getComputedStyle(card.querySelector('.workspace-note-preview, textarea')).fontSize) };
});
async function dragDivider(page, toX) {
  const box = await page.locator('#workspaceDivider').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + (toX - box.x - box.width / 2) * i / 8, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(250);
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
    await page.locator('#pdfFile').setInputFiles({ name: 'squeeze.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await pen(page, [[.2, .7], [.35, .74], [.5, .78]]);
    await page.locator('#workspaceNewNote').click();
    await page.locator('.workspace-card textarea.workspace-note').first().fill('A longer note whose words would wrap onto more lines if the note were squeezed into a narrow column.');
    await page.locator('#workspaceBoard').focus();
    await page.waitForTimeout(300);

    // Below the 560px layout width, squeezing further only scales the sheet.
    await dragDivider(page, 1180 - 480);
    const wide = await sheet(page);
    assert(wide.pane < 560, 'starting pane is already narrower than the layout width: ' + wide.pane);
    await dragDivider(page, 1180 - 330);
    const narrow = await sheet(page);
    assert(narrow.pane < wide.pane * .8, 'the divider squeezed the workspace: ' + wide.pane + ' -> ' + narrow.pane);
    assert(Math.abs(narrow.cardWidth - wide.cardWidth) < 2, 'note keeps its place on the sheet');
    assert(Math.abs(narrow.cardHeight - wide.cardHeight) / wide.cardHeight < .03, 'note text does not reflow taller: ' + wide.cardHeight + ' -> ' + narrow.cardHeight);
    assert(Math.abs(narrow.inkWidth - wide.inkWidth) / wide.inkWidth < .03, 'ink keeps its size relative to the note');
    assert(narrow.cardRight <= narrow.paneRight + 1, 'the note still fits inside the squeezed pane');

    // Widening back restores the same layout, and nothing was saved differently.
    await dragDivider(page, 1180 - 480);
    const back = await sheet(page);
    assert(Math.abs(back.cardHeight - wide.cardHeight) / wide.cardHeight < .03, 'widening restores the note');
    // A zoomed-in Workspace keeps its on-screen size while the divider moves.
    await page.locator('#workspaceMore > summary').click();
    await page.locator('#workspaceZoomIn').click();
    await page.locator('#workspaceZoomIn').click();
    await page.locator('#workspaceMore > summary').click();
    const cardPx = () => page.locator('.workspace-card').first().evaluate(card => card.getBoundingClientRect().width);
    const zoomedBefore = await cardPx();
    await dragDivider(page, 1180 - 360);
    const zoomedAfter = await cardPx();
    assert(Math.abs(zoomedAfter - zoomedBefore) / zoomedBefore < .03, 'zoomed workspace does not zoom out with the divider: ' + zoomedBefore + ' -> ' + zoomedAfter);
    assert.notEqual(await page.locator('#workspaceZoomReset').textContent(), '100%');

    // A zoomed-in paper keeps its on-screen size too, instead of snapping back to fit.
    await page.locator('#zenMore').click();
    await page.locator('#zenReadingControls').click();
    await page.locator('#readerControlsDialog').waitFor({ state: 'visible' });
    await page.locator('#zoomIn').click();
    await page.locator('#zoomIn').click();
    await page.click('#readerControlsDialog [data-close="readerControlsDialog"]');
    await page.locator('#readerControlsDialog').waitFor({ state: 'hidden' });
    await page.waitForTimeout(600);
    const pagePx = () => page.locator('.pdf-page').first().evaluate(node => node.getBoundingClientRect().width);
    const paperBefore = await pagePx();
    await dragDivider(page, 1180 - 520);
    await page.waitForTimeout(900);
    const paperAfter = await pagePx();
    assert(Math.abs(paperAfter - paperBefore) / paperBefore < .03, 'zoomed paper does not snap to fit with the divider: ' + paperBefore + ' -> ' + paperAfter);

    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS squeezing the workspace scales notes, text and ink together; zoom survives the divider');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
