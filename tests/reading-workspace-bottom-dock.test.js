/* The Workspace docked below the paper: the default in portrait and tall windows, with a
   horizontal divider, a dock remembered per orientation, and everything that floats on the
   paper (rail, toolbars, Find, selection card) kept on the paper half.
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
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PHRASE = 'carry this passage below';
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
    page.drawText(number === 1 ? 'Please ' + PHRASE + ' into the workspace.' : 'Bottom dock fixture page ' + number, { x: 60, y: 700, size: 16, font });
    for (let line = 0; line < 20; line++) page.drawText('Line ' + (line + 1) + ' of page ' + number + ' keeps the paper readable.', { x: 60, y: 640 - line * 24, size: 12, font });
  }
  return Buffer.from(await doc.save());
}
function seed() {
  if (sessionStorage.getItem('bottomDockSeeded')) return;
  sessionStorage.setItem('bottomDockSeeded', '1');
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
}
async function openPaper(browser, port, options) {
  const context = await browser.newContext(Object.assign({ hasTouch: true, serviceWorkers: 'block' }, options));
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seed);
  await page.goto('http://127.0.0.1:' + port + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.locator('#pdfFile').setInputFiles({ name: 'bottom-dock.pdf', mimeType: 'application/pdf', buffer: await pdfFixture() });
  await fitted(page);
  return { context, page, errors };
}
/* The active page is laid out and lies wholly inside the paper pane. */
async function fitted(page) {
  try {
    await page.waitForFunction(() => {
      const frame = document.getElementById('pdfFrame'), paper = document.querySelector('.pdf-page.book-active');
      if (frame.dataset.pagedReady !== 'true' || !paper || !paper.querySelector('canvas[width]')) return false;
      const a = document.getElementById('documentPane').getBoundingClientRect(), p = paper.getBoundingClientRect();
      return p.width > 100 && p.left >= a.left - 1 && p.right <= a.right + 1 && p.top >= a.top - 1 && p.bottom <= a.bottom + 1;
    });
  } catch (error) {
    throw new Error('page did not fit the paper pane: ' + JSON.stringify(await geometry(page)), { cause: error });
  }
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = id => { const node = document.getElementById(id); if (!node || !node.getClientRects().length) return null; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const divider = document.getElementById('workspaceDivider'), body = document.body.classList;
    const paper = document.querySelector('.pdf-page.book-active'), p = paper && paper.getBoundingClientRect();
    return { dock: body.contains('workspace-bottom') ? 'bottom' : body.contains('workspace-side') ? 'side' : body.contains('workspace-full') ? 'full' : '',
      folded: body.contains('workspace-paper-short'), pane: box('documentPane'), panel: box('workspacePanel'), divider: box('workspaceDivider'),
      rail: box('zenDock'), tools: box('workspaceTools'), close: box('workspaceClose'), paper: p && { left: p.left, top: p.top, right: p.right, bottom: p.bottom },
      orientation: divider.getAttribute('aria-orientation'), percent: Number(divider.getAttribute('aria-valuenow')),
      viewport: { width: innerWidth, height: innerHeight } };
  });
}
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function openWorkspace(page) {
  if (!(await page.locator('#workspacePanel').isVisible())) await page.locator('#zenWorkspace').click();
  await page.locator('#workspacePanel').waitFor({ state: 'visible' });
  await settle(page);
}
async function dockIs(page, dock) {
  await page.waitForFunction(name => document.body.classList.contains('workspace-' + name), dock);
  await settle(page);
}
async function dragDivider(page, to, middle) {
  const handle = await page.locator('#workspaceDivider').boundingBox();
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  const during = middle ? await middle() : null;
  await page.mouse.up();
  return during;
}
async function previewState(page) {
  return page.evaluate(() => {
    const preview = document.getElementById('workspaceDockPreview');
    return { visible: !preview.classList.contains('hidden'), dock: preview.dataset.dock, blocked: preview.classList.contains('blocked'),
      label: document.getElementById('workspaceDockPreviewLabel').textContent };
  });
}
async function stored(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id);
  });
}
async function stroke(page, fraction) {
  const board = await page.locator('#workspaceScroll').boundingBox();
  const x = board.x + board.width * fraction, y = board.y + Math.min(150, board.height * .55);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 30, { steps: 6 });
  await page.mouse.up();
}
function inside(inner, outer, slack = 1) {
  return inner && outer && inner.left >= outer.left - slack && inner.right <= outer.right + slack
    && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack;
}
async function selectPhrase(page, pointerType) {
  await page.waitForFunction(phrase => [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].some(span => span.textContent.includes(phrase)), PHRASE);
  const text = await page.evaluate(({ phrase, pointerType }) => {
    const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].find(node => node.textContent.includes(phrase));
    const start = span.firstChild.textContent.indexOf(phrase), range = document.createRange();
    range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + phrase.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType, pointerId: 77 }));
    return selection.toString();
  }, { phrase: PHRASE, pointerType });
  assert.equal(text, PHRASE);
  await page.locator('#selectionCard').waitFor({ state: 'visible' });
  await settle(page);
}
function cardBox(page) {
  return page.locator('#selectionCard').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
}

async function ipadPortrait(browser, port) {
  const { context, page, errors } = await openPaper(browser, port, { viewport: { width: 820, height: 1180 }, userAgent: IPAD_UA });
  await openWorkspace(page);
  await fitted(page);
  let g = await geometry(page);
  assert.equal(g.dock, 'bottom', 'portrait iPad docks the Workspace below the paper: ' + JSON.stringify(g));
  assert.equal(g.orientation, 'horizontal');
  assert(Math.abs(g.percent - 50) <= 1, 'the split starts at half: ' + g.percent);
  assert(Math.abs(g.panel.top - g.pane.bottom) < 2 && g.panel.width >= 818 && g.pane.width >= 818, 'paper on top, Workspace below, both full width');
  assert(g.divider.height >= 44 && g.divider.width >= 818 && Math.abs((g.divider.top + g.divider.bottom) / 2 - g.pane.bottom) < 2, 'a 44px divider straddles the seam');
  assert(g.rail.bottom <= g.pane.bottom && !g.folded, 'the Zen rail fits on the paper half');
  assert(inside(g.tools, g.panel) && inside(g.close, g.panel) && g.tools.top >= g.divider.bottom - 1, 'Workspace tools sit in one row below the divider strip');
  assert.equal(await page.locator('#workspaceDockToggle').evaluate(node => node.classList.contains('hidden')), true, 'no side-by-side offer in an 820px window');
  // The guide's spotlight and the excerpt return chip cover or sit on the paper half only.
  const overlays = await page.evaluate(() => {
    const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const chip = document.getElementById('excerptReturnChip'), hidden = chip.classList.contains('hidden');
    chip.classList.remove('hidden'); const chipBox = box(chip); chip.classList.toggle('hidden', hidden);
    return { spotlight: box(document.getElementById('paneSpotlight')), chip: chipBox };
  });
  assert(inside(overlays.spotlight, g.pane) && Math.abs(overlays.spotlight.bottom - g.pane.bottom) < 2, 'the guide spotlight covers just the paper: ' + JSON.stringify(overlays));
  assert(inside(overlays.chip, g.pane) && overlays.chip.bottom < g.pane.bottom - 12, 'the return chip sits on the paper half: ' + JSON.stringify(overlays));
  if (process.env.PHLOEM_BOTTOM_DOCK_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_BOTTOM_DOCK_SCREENSHOT + '-ipad-portrait.png' });
  // Book layout fits its page into the shorter paper half too.
  for (const layout of ['book', 'page']) {
    await page.locator('#zenLayout').click();
    await page.locator('[data-zen-pdf-layout="' + layout + '"]').click();
    await page.waitForFunction(name => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).pdfLayout === name, layout);
    await fitted(page);
  }

  // Divider drag resizes and persists.
  await dragDivider(page, { x: 410, y: 1180 * .65 });
  await fitted(page);
  g = await geometry(page);
  assert(g.percent >= 63 && g.percent <= 67, 'divider drag sets the split: ' + g.percent);
  assert(Math.abs(g.pane.height - 1180 * g.percent / 100) < 3 && Math.abs(g.panel.top - g.pane.bottom) < 2);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem('readingRoom.workspacePaperHeight.v1'))), g.percent, 'the split is saved');
  assert.equal(await page.evaluate(() => localStorage.getItem('readingRoom.workspacePaperWidth.v1')), null, 'the side-by-side split is untouched');
  await page.locator('#workspaceDivider').focus();
  await page.keyboard.press('ArrowUp');
  assert(Math.abs((await geometry(page)).percent - (g.percent - 2)) < .2, 'ArrowUp moves the horizontal divider up');
  await page.keyboard.press('ArrowDown');

  // Writing in the bottom Workspace: a stroke and a sticky note both save.
  await stroke(page, .3);
  await page.waitForFunction(() => document.querySelectorAll('#workspaceInk path').length === 1);
  await page.waitForFunction(() => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id)?.readingWorkspace?.strokes?.length === 1; });
  await page.locator('#workspaceNewNote').click();
  const note = page.locator('.workspace-card textarea.workspace-note').first();
  await note.waitFor({ state: 'visible' });
  await note.fill('Written below the paper');
  await page.waitForFunction(() => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id)?.readingExcerpts?.items?.some(item => item.note === 'Written below the paper'); });
  await page.locator('#workspaceUndo').focus();

  // The paper's own tools stay on the paper half.
  await page.locator('#zenAnnotate').click();
  await page.locator('#zenWrite').click();
  await page.locator('#pdfInkToolbar').waitFor({ state: 'visible' });
  g = await geometry(page);
  const ink = await page.locator('#pdfInkToolbar').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  assert(inside(ink, g.pane), 'pen toolbar stays on the paper half: ' + JSON.stringify({ ink, pane: g.pane }));
  await page.locator('#zenAnnotate').click(); // with Write on, ✎ ends it
  await page.locator('#pdfInkToolbar').waitFor({ state: 'hidden' });
  await page.locator('#zenWorkspaceMarker').click();
  await page.locator('#highlightToolbar').waitFor({ state: 'visible' });
  await settle(page);
  const marker = await page.locator('#highlightToolbar').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  assert(inside(marker, g.pane), 'highlight toolbar stays on the paper half: ' + JSON.stringify({ marker, pane: g.pane }));
  await page.locator('#zenWorkspaceMarker').click();
  await page.locator('#highlightToolbar').waitFor({ state: 'hidden' });
  await page.locator('#zenMore').click();
  await page.locator('#zenFind').click();
  await page.locator('#findBar').waitFor({ state: 'visible' });
  const find = await page.locator('#findBar').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  assert(inside(find, g.pane) && find.right <= g.rail.left, 'Find sits on the paper beside the rail: ' + JSON.stringify({ find, rail: g.rail }));
  await page.locator('#zenMore').click(); // with Find open, ••• closes it
  await page.locator('#findBar').waitFor({ state: 'hidden' });

  // A selection card stays on the paper; a saved highlight drags down into the Workspace.
  await selectPhrase(page, 'mouse');
  assert(inside(await cardBox(page), g.pane), 'selection card stays on the paper half');
  await page.locator('#selectionHighlight').click();
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .saved-highlight').length > 0);
  if (await page.locator('#selectionCard').isVisible()) await page.locator('#selectionClose').click();
  const mark = await page.locator('.pdf-page[data-page="1"] .saved-highlight').first().evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const target = await page.locator('#workspaceScroll').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width * .6, y: r.top + r.height * .6 }; });
  await page.mouse.move(mark.x, mark.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(phrase => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id)?.readingExcerpts?.items?.some(item => item.quote === phrase); }, PHRASE);

  // Carrying the divider to the right edge cannot fit side by side here: it says so.
  const split = (await geometry(page)).percent;
  const blocked = await dragDivider(page, { x: 812, y: (await geometry(page)).pane.bottom }, () => previewState(page));
  assert.deepEqual(blocked, { visible: true, dock: 'side', blocked: true, label: 'Too narrow to dock beside' }, 'the edge shows why it cannot dock beside');
  await page.locator('#readerToast').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#readerToast').textContent(), 'Too narrow to dock beside');
  g = await geometry(page);
  assert(g.dock === 'bottom' && Math.abs(g.percent - split) < .2 && !(await previewState(page)).visible, 'a blocked drop leaves the dock and split alone');

  // Rotation: landscape goes side by side, portrait comes back below at the saved split.
  await page.setViewportSize({ width: 1180, height: 820 });
  await dockIs(page, 'side');
  await fitted(page);
  g = await geometry(page);
  assert(g.orientation === 'vertical' && Math.abs(g.pane.right - g.panel.left) < 2 && g.panel.height >= 818, 'landscape keeps the side-by-side split: ' + JSON.stringify(g));
  assert(Math.abs(g.rail.right - (g.pane.right - 12)) < 8, 'the rail returns to the paper edge');
  assert.equal(await page.locator('#workspaceInk path').count(), 1, 'ink survives rotation');
  // Dragging the side divider down to the bottom edge docks the Workspace below.
  const down = await dragDivider(page, { x: g.divider.left + 22, y: 800 }, () => previewState(page));
  assert.deepEqual(down, { visible: true, dock: 'bottom', blocked: false, label: 'Workspace below' });
  await dockIs(page, 'bottom');
  await fitted(page);
  g = await geometry(page);
  assert(Math.abs(g.panel.top - g.pane.bottom) < 2 && g.orientation === 'horizontal', 'the snap docks the Workspace below');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.workspaceDock.v1'))), { landscape: 'bottom' }, 'the choice is kept for landscape');
  await page.setViewportSize({ width: 820, height: 1180 });
  await dockIs(page, 'bottom');
  assert(Math.abs((await geometry(page)).percent - split) < 1, 'portrait returns at its saved split');
  await page.setViewportSize({ width: 1180, height: 820 });
  await dockIs(page, 'bottom');
  // The ⋯ menu offers the other dock; choosing it is remembered for this orientation.
  await page.locator('#workspaceMore summary').click();
  await page.locator('#workspaceDockToggle').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#workspaceDockToggle').textContent()).trim(), 'Dock beside');
  const menu = await page.locator('.workspace-more-panel').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  assert(inside(menu, (await geometry(page)).panel), 'the ⋯ menu opens downward inside the Workspace');
  await page.locator('#workspaceDockToggle').click();
  await dockIs(page, 'side');
  await fitted(page);
  assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false, 'the menu closes after choosing');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.workspaceDock.v1'))), { landscape: 'side' });
  await page.locator('#workspaceMore summary').click();
  assert.equal((await page.locator('#workspaceDockToggle').textContent()).trim(), 'Dock below');
  await page.locator('#workspaceMore summary').click();
  assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false, 'a second tap closes the menu');

  // Second tap on the Workspace button closes it; a reload brings it back below in portrait.
  await page.locator('#zenWorkspace').click();
  await page.locator('#workspacePanel').waitFor({ state: 'hidden' });
  assert.equal((await geometry(page)).dock, '', 'closing clears the dock');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.reload();
  await fitted(page);
  await openWorkspace(page);
  await fitted(page);
  g = await geometry(page);
  assert(g.dock === 'bottom' && Math.abs(g.percent - split) < 1, 'the bottom split persists across reload: ' + JSON.stringify(g));
  assert.equal(await page.locator('#workspaceInk path').count(), 1, 'ink persists across reload');
  assert.deepEqual(errors, [], 'no page errors on iPad');
  await context.close();
}

async function phone(browser, port) {
  const { context, page, errors } = await openPaper(browser, port, { viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA });
  await openWorkspace(page);
  await fitted(page);
  let g = await geometry(page);
  assert.equal(g.dock, 'bottom', 'a phone docks the Workspace below the paper: ' + JSON.stringify(g));
  assert(g.percent >= 50 && g.percent <= 60 && !g.folded && g.rail.bottom <= g.pane.bottom, 'the default split leaves room for the whole rail: ' + JSON.stringify(g));
  const buttons = await page.locator('#workspaceTools .workspace-tool-row > :is(button,details)').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }));
  assert(buttons.length === 6 && buttons.every(box => box.width >= 44 && box.height >= 44 && inside(box, g.panel)), 'every Workspace tool is a full target inside the Workspace');
  assert(inside(g.close, g.panel) && g.close.left >= g.tools.right, 'close sits at the end of the tool row');
  if (process.env.PHLOEM_BOTTOM_DOCK_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_BOTTOM_DOCK_SCREENSHOT + '-phone.png' });
  await page.locator('#workspaceMore summary').click();
  const menu = await page.locator('.workspace-more-panel').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  assert(inside(menu, g.panel), 'the ⋯ menu fits inside the phone Workspace: ' + JSON.stringify({ menu, panel: g.panel }));
  assert.equal(await page.locator('#workspaceDockToggle').isVisible(), false, 'no side-by-side offer on a phone');
  await page.locator('#workspaceMore summary').click();
  assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false);

  // A shorter paper half folds the rail into columns that still fit on it.
  await dragDivider(page, { x: 195, y: 844 * .4 });
  await fitted(page);
  g = await geometry(page);
  assert(g.percent < 45 && g.folded && g.rail.bottom <= g.pane.bottom, 'the folded rail fits the short paper half: ' + JSON.stringify(g));
  assert.equal(await page.evaluate(() => Number(localStorage.getItem('readingRoom.workspacePaperHeight.v1'))), g.percent);

  await stroke(page, .25);
  await page.waitForFunction(() => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id)?.readingWorkspace?.strokes?.length === 1; });

  await dragDivider(page, { x: 195, y: 844 * .62 });
  await fitted(page);
  g = await geometry(page);
  await selectPhrase(page, 'touch');
  assert(inside(await cardBox(page), g.pane), 'the phone selection card sits on the paper half: ' + JSON.stringify({ card: await cardBox(page), pane: g.pane }));
  if (await page.locator('#selectionCard').isVisible()) await page.locator('#selectionClose').click();

  // On its side a phone has room for neither split: the Workspace covers the paper as before.
  await page.setViewportSize({ width: 844, height: 390 });
  await dockIs(page, 'full');
  g = await geometry(page);
  assert(g.panel.width >= 840 && g.panel.height >= 386 && !(await page.locator('#documentPane').isVisible()), 'landscape phone keeps the full-screen Workspace');
  await page.setViewportSize({ width: 390, height: 844 });
  await dockIs(page, 'bottom');
  await fitted(page);
  assert.equal(await page.locator('#workspaceInk path').count(), 1, 'ink survives the round trip');
  assert.deepEqual(errors, [], 'no page errors on the phone');
  await context.close();
}

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    await ipadPortrait(browser, port);
    console.log('PASS  iPad portrait: bottom dock, divider drag and persistence, rotation, snapping, tools on the paper half, writing below');
    await phone(browser, port);
    console.log('PASS  phone: bottom dock, folded rail, menus inside the Workspace, writing below, full-screen on its side');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
