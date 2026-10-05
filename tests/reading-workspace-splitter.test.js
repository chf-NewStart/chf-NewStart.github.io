/* Browser coverage for the resizable paper/workspace divider.
   Run with PHLOEM_BROWSER=chromium or PHLOEM_BROWSER=webkit. */
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

async function pdfFixture() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= 3; number++) {
    const page = doc.addPage([612, 792]);
    page.drawText('Workspace divider fixture page ' + number, { x: 52, y: 710, size: 16, font });
  }
  return Buffer.from(await doc.save());
}
function seed() {
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
}
async function ready(page) {
  try { await page.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame');
    return frame.dataset.pagedReady === 'true' && !!document.querySelector('.pdf-page.book-active canvas[width]');
  }); } catch (error) {
    const state = await page.evaluate(() => ({ ready: document.getElementById('pdfFrame').dataset.pagedReady,
      page: document.getElementById('pageNumber').textContent,
      active: [...document.querySelectorAll('.pdf-page.book-active')].map(node => node.dataset.page),
      pane: document.getElementById('documentPane').clientWidth,
      workspace: document.body.classList.contains('workspace-open') }));
    throw new Error('PDF did not become ready: ' + JSON.stringify(state), { cause: error });
  }
}
async function geometry(page) {
  return page.evaluate(() => {
    const pane = document.getElementById('documentPane'), panel = document.getElementById('workspacePanel');
    const paper = document.querySelector('.pdf-page.book-active');
    const a = pane.getBoundingClientRect(), b = panel.getBoundingClientRect(), p = paper?.getBoundingClientRect();
    const board = document.getElementById('workspaceBoard').getBoundingClientRect();
    const divider = document.getElementById('workspaceDivider').getBoundingClientRect();
    const dock = document.getElementById('touchDock').getBoundingClientRect();
    return { pane: { left: a.left, right: a.right, width: a.width, height: a.height },
      panel: { left: b.left, width: b.width }, paper: p && { width: p.width, height: p.height },
      board: { width: board.width, height: board.height }, divider: { left: divider.left, width: divider.width },
      dock: { right: dock.right }, percent: Number(document.getElementById('workspaceDivider').getAttribute('aria-valuenow')),
      page: document.getElementById('pageNumber').textContent,
      ready: document.getElementById('pdfFrame').dataset.pagedReady };
  });
}
async function fitted(page) {
  await ready(page);
  await page.waitForFunction(() => {
    const pane = document.getElementById('documentPane'), paper = document.querySelector('.pdf-page.book-active');
    if (!paper) return false;
    return paper.getBoundingClientRect().width <= pane.clientWidth - 20
      && paper.getBoundingClientRect().height <= pane.clientHeight - 20;
  });
}
async function openWorkspace(page) {
  if (await page.locator('body').evaluate(body => body.classList.contains('zen'))) await page.locator('#zenExit').click();
  if (!(await page.locator('#workspacePanel').isVisible())) await page.locator('#workspaceOpen').click();
  await page.locator('#workspacePanel').waitFor({ state: 'visible' });
}
async function drag(page, targetPercent, expectPaged = true) {
  const layout = await page.locator('#readerLayout').boundingBox(), handle = await page.locator('#workspaceDivider').boundingBox();
  const y = handle.y + handle.height / 2;
  await page.mouse.move(handle.x + handle.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(layout.x + layout.width * targetPercent / 100, y, { steps: 8 });
  await page.mouse.up();
  if (expectPaged) await fitted(page);
}

(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8339, '127.0.0.1', resolve);
  });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage(); page.setDefaultTimeout(25000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seed);
    await page.goto('http://127.0.0.1:8339/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'splitter.pdf', mimeType: 'application/pdf', buffer: await pdfFixture() });
    await ready(page);
    await page.locator('#nextPage').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"].book-active') && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    await page.locator('#zoomIn').evaluate(button => button.click());
    const zoomBefore = await page.locator('#zoomLabel').textContent();
    await openWorkspace(page);
    await fitted(page);
    let before = await geometry(page);
    assert(Math.abs(before.percent - 50) <= 1 && before.divider.width >= 44);
    assert(before.page.includes('2'));
    const ink = page.locator('#workspaceInk'), boardBox = await page.locator('#workspaceBoard').boundingBox();
    await page.mouse.move(boardBox.x + boardBox.width * .72, boardBox.y + 245);
    await page.mouse.down();
    await page.mouse.move(boardBox.x + boardBox.width * .83, boardBox.y + 290, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('#workspaceInk path').length === 1);
    const strokeBefore = await ink.locator('path').getAttribute('d');
    await page.locator('#workspaceMore summary').click();
    await page.locator('#workspaceNewNote').click();
    const draft = page.locator('.workspace-card textarea.workspace-note').first();
    await draft.waitFor({ state: 'visible' });
    await draft.fill('Keep this note through the divider drag');
    await drag(page, 65);
    let after = await geometry(page);
    assert(after.percent >= 63 && after.percent <= 67, JSON.stringify(after));
    assert(after.pane.width > before.pane.width + 100 && after.panel.width < before.panel.width - 100);
    assert(Math.abs(after.pane.right - after.panel.left) < 2);
    assert(after.board.width > 0 && after.board.height > 0, 'workspace canvas remains laid out');
    assert(after.page.includes('2'));
    assert(Math.abs(after.dock.right - (after.pane.right - 10)) < 8, 'dock follows paper edge');
    assert.equal(await ink.locator('path').getAttribute('d'), strokeBefore, 'saved ink stays at the same logical coordinates');
    assert.equal(await draft.inputValue(), 'Keep this note through the divider drag', 'note draft survives resize');
    await page.locator('#workspaceDivider').focus();
    await page.keyboard.press('ArrowLeft');
    await fitted(page);
    assert((await geometry(page)).percent < after.percent);
    await page.keyboard.press('Home');
    await fitted(page);
    assert.equal((await geometry(page)).percent, 50);
    await page.locator('#workspaceDivider').dblclick();
    assert.equal((await geometry(page)).percent, 50);
    await page.locator('#workspaceDivider').evaluate(divider => {
      const rect = divider.getBoundingClientRect(), start = { bubbles: true, pointerId: 73, pointerType: 'pen', clientX: rect.left + rect.width / 2, clientY: rect.top + 200 };
      divider.dispatchEvent(new PointerEvent('pointerdown', start));
      divider.dispatchEvent(new PointerEvent('pointermove', { ...start, clientX: rect.left + 150 }));
      divider.dispatchEvent(new PointerEvent('pointercancel', start));
    });
    assert.equal((await geometry(page)).percent, 50, 'Pencil cancellation rolls back the drag');
    await drag(page, 68);
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('readingRoom.workspacePaperWidth.v1'))), (await geometry(page)).percent);
    await page.locator('#workspaceClose').click();
    await ready(page);
    assert.equal(await page.locator('#workspaceDivider').isVisible(), false);
    assert.equal(await page.locator('#zoomLabel').textContent(), zoomBefore, 'pre-workspace PDF zoom returns');
    await openWorkspace(page);
    await fitted(page);
    assert(Math.abs((await geometry(page)).percent - 68) <= 1, 'saved split returns');
    await page.setViewportSize({ width: 900, height: 1280 });
    await page.waitForFunction(() => !document.getElementById('workspaceDivider').getClientRects().length);
    assert.equal(await page.locator('#workspaceDivider').isVisible(), false, 'portrait shows only workspace');
    await page.setViewportSize({ width: 1280, height: 900 });
    await fitted(page);
    assert(Math.abs((await geometry(page)).percent - 68) <= 1, 'landscape restores saved split');
    await page.reload();
    await ready(page);
    await openWorkspace(page);
    await fitted(page);
    assert(Math.abs((await geometry(page)).percent - 68) <= 1, 'split persists across reload');
    await page.locator('[data-pdf-layout="book"]').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('[data-pdf-layout="book"]').getAttribute('aria-pressed') === 'true');
    await fitted(page);
    await drag(page, 40);
    assert.equal((await geometry(page)).ready, 'true', 'Book refits after a divider drag');
    await page.locator('[data-pdf-layout="scroll"]').evaluate(button => button.click());
    await page.waitForFunction(() => !document.getElementById('pdfFrame').classList.contains('paged-pdf-flow'));
    await drag(page, 65, false);
    await page.waitForFunction(() => {
      const pane = document.getElementById('documentPane'), paper = document.querySelector('.pdf-page[data-page="2"]');
      return paper && paper.getBoundingClientRect().width <= pane.clientWidth + 2;
    });
    assert((await geometry(page)).page.includes('2'), 'Scroll retains the reading page');
    assert.deepEqual(errors, []);
    console.log('PASS  Workspace divider drag, fit, keyboard, dock, zoom, orientation, persistence (' + ENGINE + ')');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
