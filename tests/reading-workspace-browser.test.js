/* Landscape iPad-like browser coverage for the freeform research workspace.
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
assert(['chromium', 'webkit'].includes(ENGINE), 'PHLOEM_BROWSER must be chromium or webkit');
const PORT = +(process.env.PHLOEM_WORKSPACE_TEST_PORT || 8327);
let base;
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

const QUOTE = 'ecological inference on page two';
const OTHER_QUOTE = 'second line marks a separate claim';
function seedLibrary() {
  if (sessionStorage.getItem('phloem.workspaceFixture')) return;
  sessionStorage.setItem('phloem.workspaceFixture', '1');
  const stamp = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
    { id: 'workspace-other', kind: 'text', title: 'Other workspace paper',
      fr: 'A separate paper has no workspace marks.\n\nIts notes stay independent.',
      notes: {}, pageNotes: {}, questions: [], tags: [], addedAt: stamp, updatedAt: stamp }
  ], deleted: {}, merged: {}, savedAt: stamp }));
  localStorage.removeItem('readingRoom.lastOpen.v1');
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.touchNotesPinned.v1');
}
async function generatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let pageNo = 1; pageNo <= 3; pageNo++) {
    const page = doc.addPage([612, 792]);
    page.drawText('Workspace fixture page ' + pageNo + ' contains ecological inference on page two.',
      { x: 52, y: 710, size: 13, font });
    page.drawText('The second line marks a separate claim for this workspace.',
      { x: 52, y: 675, size: 12, font });
  }
  return Buffer.from(await doc.save());
}
async function currentPaper(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id);
  });
}
async function paperById(page, id) {
  return page.evaluate(paperId => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === paperId), id);
}
async function waitPdf(page, pageNo) {
  await page.waitForFunction(n => {
    const holder = document.querySelector('.pdf-page[data-page="' + n + '"]');
    return !document.getElementById('readerPage').classList.contains('hidden')
      && holder && holder.querySelector('canvas')?.width > 0
      && holder.querySelector('.text-layer span')
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true';
  }, pageNo);
}
async function turnPage(page, direction, target) {
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady === 'true'
    && !document.getElementById('documentPane').classList.contains('turning-book-leaf'));
  const button = page.locator(direction === 'next' ? '#nextPage' : '#prevPage');
  assert.equal(await button.isVisible(), true, 'page turn has a visible control');
  await button.click();
  try {
    await page.waitForFunction(n => !!document.querySelector('.pdf-page[data-page="' + n + '"].book-active')
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true'
      && !document.getElementById('documentPane').classList.contains('turning-book-leaf'), target);
  } catch (error) {
    const state = await page.evaluate(() => ({ current: document.getElementById('pageNumber').textContent,
      ready: document.getElementById('pdfFrame').dataset.pagedReady,
      turning: document.getElementById('documentPane').classList.contains('turning-book-leaf'),
      active: [...document.querySelectorAll('.pdf-page.book-active')].map(node => node.dataset.page),
      nextDisabled: document.getElementById('nextPage').disabled }));
    throw new Error('page turn did not reach ' + target + ': ' + JSON.stringify(state), { cause: error });
  }
}
async function selectPdf(page, pageNo, phrase) {
  await page.waitForFunction(({ pageNo, phrase }) => Array.from(document.querySelectorAll('.pdf-page[data-page="' + pageNo + '"] .text-layer span'))
    .some(span => span.textContent.includes(phrase) && getComputedStyle(span).userSelect !== 'none'), { pageNo, phrase });
  const selected = await page.evaluate(({ pageNo, phrase }) => {
    const span = Array.from(document.querySelectorAll('.pdf-page[data-page="' + pageNo + '"] .text-layer span'))
      .find(element => element.textContent.includes(phrase));
    if (!span || !span.firstChild) return { error: 'missing span or node' };
    const node = span.firstChild, start = node.textContent.indexOf(phrase);
    if (start < 0) return { error: 'phrase not in first text node', node: node.textContent, span: span.textContent };
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    const range = document.createRange();
    range.setStart(node, start); range.setEnd(node, start + phrase.length);
    const selection = getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    const text = selection.toString();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 88 }));
    const rect = span.getBoundingClientRect(), style = getComputedStyle(span);
    return { text, active: !!document.querySelector('.pdf-page[data-page="' + pageNo + '"].book-active'),
      ready: document.getElementById('pdfFrame').dataset.pagedReady,
      rect: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
      display: style.display, visibility: style.visibility, userSelect: style.userSelect,
      parentUserSelect: getComputedStyle(span.parentElement).userSelect,
      rangeCount: selection.rangeCount, selectedRaw: selection.anchorNode?.textContent,
      activeElement: document.activeElement?.id };
  }, { pageNo, phrase });
  assert.equal(selected.text, phrase, 'PDF text selection covers the requested source words: ' + JSON.stringify(selected));
  await page.locator('#selectionToWorkspace').waitFor({ state: 'visible' });
}
async function openPaper(page, id) {
  await page.locator('[data-view="libraryPage"]').first().click();
  await page.locator('#libraryPage').waitFor({ state: 'visible' });
  await page.locator('[data-continue-paper="' + id + '"]').click();
  await page.waitForFunction(paperId => !document.getElementById('readerPage').classList.contains('hidden')
    && localStorage.getItem('readingRoom.lastOpen.v1') === paperId, id);
}
async function stroke(page, points, pointerType = 'pen') {
  await page.locator('#workspaceInk').evaluate((canvas, { points, pointerType }) => {
    const rect = canvas.getBoundingClientRect();
    const board = document.getElementById('workspaceBoard');
    // A constructed PointerEvent has no browser-managed active pointer to capture.
    // All samples are dispatched directly to the same target in this fixture.
    const capture = board.setPointerCapture;
    board.setPointerCapture = () => {};
    try {
      points.forEach(([x, y], index) => {
        const type = index === 0 ? 'pointerdown' : index === points.length - 1 ? 'pointerup' : 'pointermove';
        canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
          pointerType, pointerId: 77, isPrimary: true, button: 0,
          buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : .62,
          clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y }));
      });
    } finally { board.setPointerCapture = capture; }
  }, { points, pointerType });
}
async function pinchCard(card, scale) {
  return card.evaluate((node, scale) => {
    const rect = node.getBoundingClientRect();
    const y = rect.top + Math.min(rect.height / 2, 26);
    const x1 = rect.left + rect.width * .25, x2 = rect.left + rect.width * .75;
    const endX2 = x1 + (x2 - x1) * scale;
    const originalCapture = node.setPointerCapture;
    node.setPointerCapture = () => {};
    function emit(type, id, x) {
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerType: 'touch', pointerId: id, isPrimary: id === 61, button: 0,
        buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
    }
    try {
      emit('pointerdown', 61, x1); emit('pointerdown', 62, x2);
      emit('pointermove', 62, endX2);
      const preview = parseFloat(node.style.width) * 10;
      emit('pointerup', 61, x1); emit('pointerup', 62, endX2);
      return { preview, width: parseFloat(node.style.width) * 10,
        menuOpen: node.querySelector('.workspace-note-menu').open };
    } finally { node.setPointerCapture = originalCapture; }
  }, scale);
}
async function realChromiumPinchOnQuote(page, card) {
  const quote = card.locator('.workspace-quote');
  await quote.scrollIntoViewIfNeeded();
  const box = await quote.boundingBox();
  assert(box && box.width > 70 && box.height > 0, 'quote has a visible two-finger touch surface');
  const session = await page.context().newCDPSession(page);
  const y = box.y + Math.min(box.height / 2, 20);
  const x1 = box.x + box.width * .35;
  const x2 = box.x + box.width * .65;
  const point = (x, id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: .6 });
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(x1, 1)] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(x1, 1), point(x2, 2)] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(x1, 1), point(x1 + (x2 - x1) * 1.2, 2)] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point(x1, 1)] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}
function workspaceStrokes(ch) {
  const store = ch && ch.readingWorkspace;
  return store && Array.isArray(store.strokes) ? store.strokes : [];
}
async function waitStrokeCount(page, paperId, count) {
  await page.waitForFunction(({ paperId, count }) => {
    const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === paperId);
    return ch && ch.readingWorkspace && Array.isArray(ch.readingWorkspace.strokes)
      && ch.readingWorkspace.strokes.length === count;
  }, { paperId, count });
}
async function ensureWorkspaceOpen(page) {
  if (await page.locator('body').evaluate(node => node.classList.contains('zen'))) {
    const exit = page.locator('#zenExit');
    assert.equal(await exit.isVisible(), true, 'Zen exposes its explicit exit control');
    await exit.click();
    await page.waitForFunction(() => !document.body.classList.contains('zen'));
  }
  if (await page.locator('#workspacePanel').isVisible()) return;
  const open = page.locator('#workspaceOpen');
  assert.equal(await open.isVisible(), true, 'workspace has a visible opening control');
  await open.click();
  await page.locator('#workspacePanel').waitFor({ state: 'visible' });
}
async function openMore(page) {
  const menu = page.locator('#workspaceMore');
  if (!(await menu.evaluate(node => node.open))) await menu.locator('summary').click();
  assert.equal(await menu.evaluate(node => node.open), true, 'More menu opens through its visible summary');
}
async function openCardMenu(card) {
  const menu = card.locator('details.workspace-note-menu');
  if (!(await menu.evaluate(node => node.open))) await menu.locator('summary').click();
  assert.equal(await menu.evaluate(node => node.open), true, 'sticky note menu opens through its visible summary');
}
async function openPenOptions(page) {
  const options = page.locator('#workspacePenOptions');
  if (!(await options.isVisible())) await page.locator('#workspacePenToggle').click();
  await options.waitFor({ state: 'visible' });
}

(async () => {
  await new Promise((resolve, reject) => {
    const onError = error => {
      if (error.code !== 'EADDRINUSE') { reject(error); return; }
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    };
    server.once('error', onError);
    server.listen(PORT, '127.0.0.1', () => { server.removeListener('error', onError); resolve(); });
  });
  base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [], aiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => {
      if (/(?:api\.openai\.com|api\.anthropic\.com|api\.deepseek\.com|generativelanguage\.googleapis\.com|\/v1\/(?:chat\/completions|responses|messages))/i.test(request.url())) aiRequests.push(request.url());
    });
    await page.addInitScript(seedLibrary);
    await page.goto(base + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'workspace-generated.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await waitPdf(page, 1);
    const pdfId = (await currentPaper(page)).id;
    await ensureWorkspaceOpen(page);
    const split = await page.evaluate(() => {
      const viewport = innerWidth;
      const paper = document.getElementById('documentPane').getBoundingClientRect();
      const workspace = document.getElementById('workspacePanel').getBoundingClientRect();
      return { viewport, paper: { left: paper.left, right: paper.right, width: paper.width },
        workspace: { left: workspace.left, right: workspace.right, width: workspace.width } };
    });
    assert(split.paper.width >= split.viewport * .36 && split.workspace.width >= split.viewport * .36
      && Math.abs(split.paper.width - split.workspace.width) <= split.viewport * .16
      && split.paper.right <= split.workspace.left + 3,
    'landscape reading and workspace panes share the screen: ' + JSON.stringify(split));
    const cleanWorkspace = await page.evaluate(() => {
      const panel = document.getElementById('workspacePanel');
      const scroll = document.getElementById('workspaceScroll');
      return {
        background: getComputedStyle(document.getElementById('workspaceBoard')).backgroundImage,
        scrollHeight: scroll.getBoundingClientRect().height,
        panelHeight: panel.getBoundingClientRect().height,
        headingVisible: [...panel.querySelectorAll('.workspace-heading')].some(node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0),
        penOptionsVisible: document.getElementById('workspacePenOptions')?.getBoundingClientRect().height > 0,
        moreOpen: document.getElementById('workspaceMore')?.open
      };
    });
    assert.equal(cleanWorkspace.background, 'none', 'workspace starts as blank paper without a background pattern');
    assert.equal(cleanWorkspace.headingVisible, false, 'workspace has no large visible heading');
    assert.equal(cleanWorkspace.penOptionsVisible, false, 'pen options are closed by default');
    assert.equal(cleanWorkspace.moreOpen, false, 'More menu is closed by default');
    assert(cleanWorkspace.scrollHeight >= cleanWorkspace.panelHeight * .85,
      'paper uses at least 85% of workspace height: ' + JSON.stringify(cleanWorkspace));
    await page.waitForFunction(() => {
      const pane = document.getElementById('documentPane').getBoundingClientRect();
      const paper = document.querySelector('.pdf-page.book-active')?.getBoundingClientRect();
      return document.getElementById('pdfFrame').dataset.pagedReady === 'true'
        && paper && paper.width >= pane.width * .65;
    });
    await page.screenshot({ path: '/tmp/phloem-workspace-' + ENGINE + '-empty.png' });
    await openPenOptions(page);
    await openMore(page);
    await page.locator('#workspacePenOptions').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#workspacePenOptions').isVisible(), false,
      'opening More dismisses Pen options');
    await page.locator('#readerMeta').click();
    await page.waitForFunction(() => !document.getElementById('workspaceMore').open);
    assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false,
      'outside pointer press dismisses More');
    await openPenOptions(page);
    await page.locator('#workspacePenToggle').focus();
    await page.keyboard.press('Escape');
    await page.locator('#workspacePenOptions').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#workspacePenOptions').isVisible(), false,
      'Escape dismisses Pen options');
    await turnPage(page, 'next', 2);
    await selectPdf(page, 2, QUOTE);
    await page.locator('#selectionToWorkspace').click();
    await page.waitForFunction(id => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch && ch.readingExcerpts?.items?.some(item => item.quote === 'ecological inference on page two')
        && Object.keys(ch.readingWorkspace?.positions || {}).length === 1;
    }, pdfId);
    let pdf = await paperById(page, pdfId);
    const clip = pdf.readingExcerpts.items.find(item => item.quote === QUOTE);
    const placement = pdf.readingWorkspace.positions[clip.id];
    assert(placement && placement.x >= 0 && placement.x <= 1000 && placement.y >= 0 && placement.width > 0,
      'selected passage has a logical workspace placement');
    assert.equal(Object.values(pdf.highlights || {}).flat().length, 0, 'workspace clip does not mark the PDF');
    assert.equal(Object.values(pdf.pdfInk || {}).flat().length, 0, 'workspace actions do not draw on the PDF');
    const card = page.locator('.workspace-card[data-clip-id="' + clip.id + '"]');
    await card.waitFor({ state: 'visible' });
    assert.equal(await card.locator('.workspace-quote').textContent(), QUOTE);
    assert.equal(await card.locator('textarea.workspace-note').isVisible(), false,
      'a source sticky note does not expose its textarea by default');
    assert.equal(await card.locator('.workspace-quote').isVisible(), true,
      'the source quote stays visible on the compact sticky note');
    await openCardMenu(card);
    await page.locator('#readerMeta').click();
    await page.waitForFunction(() => !document.querySelector('.workspace-card .workspace-note-menu').open);
    assert.equal(await card.locator('.workspace-note-menu').evaluate(node => node.open), false,
      'outside pointer press dismisses the sticky note menu');
    await openCardMenu(card);
    await card.locator('.workspace-note-menu summary').focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.workspace-card .workspace-note-menu').open);
    assert.equal(await card.locator('.workspace-note-menu').evaluate(node => node.open), false,
      'Escape dismisses the sticky note menu');
    await page.screenshot({ path: '/tmp/phloem-workspace-' + ENGINE + '-landscape.png' });
    await turnPage(page, 'prev', 1);
    await openCardMenu(card);
    await card.locator('.workspace-source').click();
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="2"].book-active'));
    const cue = page.locator('.excerpt-source-cue-layer[data-excerpt-id="' + clip.id + '"]');
    await cue.waitFor({ state: 'visible' });
    const cueGeometry = await cue.evaluate((layer, phrase) => {
      const source = [...document.querySelectorAll('.pdf-page[data-page="2"] .text-layer span')]
        .find(node => node.textContent.includes(phrase) && node.firstChild);
      if (!source) return { error: 'source phrase missing' };
      const start = source.firstChild.textContent.indexOf(phrase), range = document.createRange();
      range.setStart(source.firstChild, start); range.setEnd(source.firstChild, start + phrase.length);
      const target = range.getBoundingClientRect();
      const marks = [...layer.querySelectorAll('.excerpt-source-cue')].map(node => node.getBoundingClientRect());
      return { page: layer.dataset.sourcePage, target: { x: target.x, y: target.y, width: target.width, height: target.height },
        marks: marks.map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })),
        overlap: marks.some(rect => Math.max(0, Math.min(rect.right, target.right) - Math.max(rect.left, target.left))
          * Math.max(0, Math.min(rect.bottom, target.bottom) - Math.max(rect.top, target.top)) > target.width * target.height * .25) };
    }, QUOTE);
    assert.equal(cueGeometry.page, '2', 'source cue belongs to the saved PDF page');
    assert(cueGeometry.marks.length > 0 && cueGeometry.overlap,
      'source cue paints the saved quote rather than a neighboring occurrence: ' + JSON.stringify(cueGeometry));
    assert.equal(await page.locator('.excerpt-source-cue-layer').count(), 1,
      'source navigation paints only one temporary cue');
    assert.equal(await page.locator('#findInput').inputValue(), '', 'source cue does not modify Find');
    assert.equal(Object.values((await paperById(page, pdfId)).highlights || {}).flat().length, 0,
      'source cue is not saved as a PDF highlight');
    await page.screenshot({ path: '/tmp/phloem-source-cue-' + ENGINE + '.png' });
    await cue.waitFor({ state: 'hidden', timeout: 7000 });
    await openMore(page);
    await page.locator('#workspaceReturn').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspaceReturn').isVisible(), true,
      'source visit exposes Return to reading in the workspace');
    await page.locator('#workspaceReturn').click();
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="1"].book-active'));
    await page.waitForFunction(() => {
      const button = document.getElementById('workspaceReturn');
      return button.classList.contains('hidden') && !button.disabled;
    });
    await turnPage(page, 'next', 2);

    await selectPdf(page, 2, OTHER_QUOTE);
    assert.equal(await page.locator('#selectionToWorkspace').getAttribute('draggable'), 'true',
      'selection action offers native drag and drop');
    const boardBox = await page.locator('#workspaceBoard').boundingBox();
    assert(boardBox, 'workspace board has a drop target');
    await page.locator('#selectionToWorkspace').dragTo(page.locator('#workspaceBoard'),
      { targetPosition: { x: boardBox.width * .7, y: Math.min(boardBox.height * .3, 420) } });
    await page.waitForFunction(id => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch?.readingExcerpts?.items?.some(item => item.quote === 'second line marks a separate claim')
        && Object.keys(ch.readingWorkspace?.positions || {}).length === 2;
    }, pdfId);
    assert.equal(Object.values((await paperById(page, pdfId)).highlights || {}).flat().length, 0,
      'dragging a passage to workspace does not highlight the PDF');

    const touchQuote = 'Workspace fixture page 2';
    await selectPdf(page, 2, touchQuote);
    await page.locator('#selectionToWorkspace').evaluate(button => {
      const start = button.getBoundingClientRect();
      const board = document.getElementById('workspaceBoard').getBoundingClientRect();
      const options = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 99,
        isPrimary: true, button: 0, buttons: 1 };
      button.dispatchEvent(new PointerEvent('pointerdown', { ...options,
        clientX: start.left + start.width / 2, clientY: start.top + start.height / 2 }));
      button.dispatchEvent(new PointerEvent('pointermove', { ...options,
        clientX: board.left + board.width * .7, clientY: board.top + Math.min(board.height * .25, 380) }));
      button.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0,
        clientX: board.left + board.width * .7, clientY: board.top + Math.min(board.height * .25, 380) }));
    });
    await page.waitForFunction(id => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch?.readingExcerpts?.items?.some(item => item.quote === 'Workspace fixture page 2')
        && Object.keys(ch.readingWorkspace?.positions || {}).length === 3;
    }, pdfId);
    assert.equal(Object.values((await paperById(page, pdfId)).highlights || {}).flat().length, 0,
      'touch pointer drag places a passage without PDF highlighting');

    const beforeFreeNote = await paperById(page, pdfId);
    await openMore(page);
    await page.locator('#workspaceNewNote').click();
    await page.waitForFunction(id => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch?.readingExcerpts?.items?.some(item => item.quote === '')
        && Object.keys(ch.readingWorkspace?.positions || {}).length === 4;
    }, pdfId);
    const afterFreeNote = await paperById(page, pdfId);
    const freeNote = afterFreeNote.readingExcerpts.items.find(item => item.quote === '');
    assert(freeNote && await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"]').count() === 1,
      'standalone note is placed on the workspace');
    assert(afterFreeNote.readingWorkspace.positions[freeNote.id].y > beforeFreeNote.readingWorkspace.positions[clip.id].y,
      'automatic Text note placement starts below the earlier clip');
    const freeOverlap = await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"]').evaluate(card => {
      const a = card.getBoundingClientRect();
      return Array.from(document.querySelectorAll('.workspace-card')).filter(other => other !== card).map(other => {
        const b = other.getBoundingClientRect();
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      });
    });
    assert(freeOverlap.every(area => area < 1),
      'automatic Text note placement avoids existing card boxes: ' + JSON.stringify(freeOverlap));
    const freeText = 'First connection\nA second line of thought';
    await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"] textarea.workspace-note').fill(freeText);
    await page.waitForFunction(({ id, clipId, note }) => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch?.readingExcerpts?.items?.some(item => item.id === clipId && item.note === note);
    }, { id: pdfId, clipId: freeNote.id, note: freeText });
    assert.equal(await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"] .workspace-note-preview').textContent(), freeText,
      'saved text appears in the compact sticky note preview');
    await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"] .workspace-handle').focus();
    assert.equal(await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"] textarea.workspace-note').isVisible(), false,
      'saved sticky note returns to read mode after editing');
    assert.equal(await page.locator('.workspace-card[data-clip-id="' + freeNote.id + '"] .workspace-note-preview').isVisible(), true,
      'saved sticky note preview is visible after editing');
    const heightBefore = (await paperById(page, pdfId)).readingWorkspace.height;
    await openMore(page);
    await page.locator('#workspaceMoreSpace').click();
    await page.waitForFunction(({ id, heightBefore }) => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch?.readingWorkspace?.height === heightBefore + 1000;
    }, { id: pdfId, heightBefore });
    assert.equal((await paperById(page, pdfId)).readingWorkspace.height, heightBefore + 1000,
      'More paper extends the same per-document workspace');
    const initialPlace = { ...placement };
    const handle = card.locator('.workspace-handle');
    await handle.scrollIntoViewIfNeeded();
    const handleRect = await handle.boundingBox();
    assert(handleRect, 'workspace card has a visible drag handle');
    await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleRect.x + handleRect.width / 2 + 85, handleRect.y + handleRect.height / 2 + 55, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(({ id, clipId, oldX, oldY }) => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      const pos = ch?.readingWorkspace?.positions?.[clipId];
      return pos && (Math.abs(pos.x - oldX) > 1 || Math.abs(pos.y - oldY) > 1);
    }, { id: pdfId, clipId: clip.id, oldX: initialPlace.x, oldY: initialPlace.y });
    const beforeKeyboardMove = (await paperById(page, pdfId)).readingWorkspace.positions[clip.id];
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(({ id, clipId, x }) => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
      return ch?.readingWorkspace?.positions?.[clipId]?.x > x;
    }, { id: pdfId, clipId: clip.id, x: beforeKeyboardMove.x });
    assert.match(await page.locator('#pageNumber').textContent(), /^2\s*\//,
      'ArrowRight on the card handle moves the card without turning the PDF page');
    let draggedPlace = { ...(await paperById(page, pdfId)).readingWorkspace.positions[clip.id] };

    await page.locator('[data-workspace-tool="pen"]').click();
    await openPenOptions(page);
    await page.locator('[data-workspace-color]').first().click();
    await stroke(page, [[.65, .12], [.69, .14], [.74, .16], [.78, .18]]);
    await waitStrokeCount(page, pdfId, 1);
    pdf = await paperById(page, pdfId);
    assert(workspaceStrokes(pdf)[0].points.length >= 2, 'Pencil stroke saves logical points');
    assert(workspaceStrokes(pdf)[0].points[0][0] > 500 && workspaceStrokes(pdf)[0].points[0][0] < 800
      && workspaceStrokes(pdf)[0].points[0][1] > 100,
    'Pencil points use absolute workspace coordinates');
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 1,
      'saved stroke is visible on the workspace ink layer');
    assert.equal(Object.values(pdf.pdfInk || {}).flat().length, 0, 'workspace ink is separate from PDF ink');
    assert.equal(await page.locator('#workspaceBoard').evaluate(board => document.activeElement === board), true,
      'Pencil input leaves keyboard focus on the workspace board');
    const strokeBeforeResize = workspaceStrokes(pdf)[0];
    const inkBeforeResize = await page.locator('#workspaceInk path[data-stroke-id]').evaluate(path => {
      const box = path.getBBox(); return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const pdfCanvasBeforeResize = await page.locator('.pdf-page[data-page="2"].book-active canvas').evaluate(canvas => canvas.getBoundingClientRect().width);
    const pdfZoomBeforeResize = pdf.zoom;
    // Synthetic Pencil input suppresses its trailing click for 400 ms, including
    // taps on a nearby sticky control. Exercise the menu after that guard ends.
    await page.waitForTimeout(450);
    await openCardMenu(card);
    await card.locator('.workspace-note-larger').click();
    await card.locator('.workspace-note-larger').click();
    await card.locator('.workspace-note-smaller').click();
    const menuWidth = (await paperById(page, pdfId)).readingWorkspace.positions[clip.id].width;
    assert.equal(menuWidth, draggedPlace.width + 80, 'larger/smaller controls change only this sticky note width');
    const pinch = await pinchCard(card, 1.2);
    await page.waitForFunction(({ id, clipId, width }) => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === id)?.readingWorkspace?.positions?.[clipId]?.width > width,
    { id: pdfId, clipId: clip.id, width: menuWidth });
    draggedPlace = { ...(await paperById(page, pdfId)).readingWorkspace.positions[clip.id] };
    assert(pinch.preview > menuWidth && draggedPlace.width <= 900 && draggedPlace.x >= 0
      && draggedPlace.x + draggedPlace.width <= 1000,
    'two-finger pinch enlarges this note within the paper bounds: ' + JSON.stringify({ pinch, draggedPlace }));
    assert.equal(pinch.menuOpen, false, 'pinch does not accidentally activate the note menu');
    pdf = await paperById(page, pdfId);
    assert.deepEqual(workspaceStrokes(pdf)[0], strokeBeforeResize,
      'resizing a sticky note does not scale or rewrite free workspace ink');
    assert.deepEqual(await page.locator('#workspaceInk path[data-stroke-id]').evaluate(path => {
      const box = path.getBBox(); return { x: box.x, y: box.y, width: box.width, height: box.height };
    }), inkBeforeResize, 'free ink keeps the same visual geometry after note resizing');
    assert.equal(await page.locator('.pdf-page[data-page="2"].book-active canvas').evaluate(canvas => canvas.getBoundingClientRect().width), pdfCanvasBeforeResize,
      'note resizing does not zoom the source PDF');
    assert.equal(pdf.zoom, pdfZoomBeforeResize, 'note resizing does not persist a PDF zoom change');
    assert.equal(Object.values(pdf.pdfInk || {}).flat().length, 0, 'note resizing does not draw on the source PDF');
    await page.screenshot({ path: '/tmp/phloem-sticky-resize-' + ENGINE + '.png' });
    if (ENGINE === 'chromium') {
      const beforeRealTouch = draggedPlace.width;
      await realChromiumPinchOnQuote(page, card);
      await page.waitForFunction(({ id, clipId, width }) => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
        .find(ch => ch.id === id)?.readingWorkspace?.positions?.[clipId]?.width > width,
      { id: pdfId, clipId: clip.id, width: beforeRealTouch });
      draggedPlace = { ...(await paperById(page, pdfId)).readingWorkspace.positions[clip.id] };
      assert(draggedPlace.width <= 900, 'browser-dispatched touch pinch remains bounded');
      assert.equal(Object.values((await paperById(page, pdfId)).pdfInk || {}).flat().length, 0,
        'real browser touch on a sticky quote leaves PDF ink untouched');
    }
    assert.equal(await page.evaluate(() => document.getElementById('workspacePanel').contains(document.activeElement)), true,
      'touch pinch retains keyboard focus inside the workspace');
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(modifier + '+z');
    await waitStrokeCount(page, pdfId, 0);
    await page.keyboard.press(modifier + '+Shift+z');
    await waitStrokeCount(page, pdfId, 1);
    assert.equal(Object.values((await paperById(page, pdfId)).pdfInk || {}).flat().length, 0,
      'workspace keyboard history leaves PDF ink untouched');
    await page.locator('[data-workspace-tool="eraser"]').click();
    await stroke(page, [[.64, .11], [.70, .145], [.75, .165], [.79, .19]]);
    await waitStrokeCount(page, pdfId, 0);
    await page.locator('#workspaceUndo').click();
    await waitStrokeCount(page, pdfId, 1);
    await openMore(page);
    await page.locator('#workspaceRedo').click();
    await waitStrokeCount(page, pdfId, 0);
    assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false,
      'More closes after choosing Redo');
    await page.locator('#workspaceUndo').click();
    await waitStrokeCount(page, pdfId, 1);
    assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false,
      'ink screenshot shows the compact rail with menus closed');
    await page.screenshot({ path: '/tmp/phloem-workspace-' + ENGINE + '-landscape.png' });
    await page.reload({ waitUntil: 'load' });
    await waitPdf(page, 2);
    await ensureWorkspaceOpen(page);
    await page.locator('.workspace-card[data-clip-id="' + clip.id + '"]').waitFor({ state: 'visible' });
    pdf = await paperById(page, pdfId);
    assert.equal(workspaceStrokes(pdf).length, 1, 'workspace ink survives reload');
    assert.deepEqual(pdf.readingWorkspace.positions[clip.id], draggedPlace,
      'moved card coordinates survive reload');
    assert.equal(pdf.readingExcerpts.items.find(item => item.id === freeNote.id).note, freeText,
      'standalone workspace note survives reload with line breaks');
    assert.equal(Object.values(pdf.pdfInk || {}).flat().length, 0);

    await page.setViewportSize({ width: 900, height: 1280 });
    const portrait = await page.evaluate(() => {
      const panel = document.getElementById('workspacePanel').getBoundingClientRect();
      return { panelWidth: panel.width, viewport: innerWidth, panelLeft: panel.left, panelRight: panel.right };
    });
    assert(portrait.panelWidth >= portrait.viewport * .9 && portrait.panelLeft >= -2
      && portrait.panelRight <= portrait.viewport + 2,
    'portrait workspace fills the screen: ' + JSON.stringify(portrait));
    await page.screenshot({ path: '/tmp/phloem-workspace-' + ENGINE + '-portrait.png' });
    await page.locator('#workspaceClose').click();
    await page.locator('#documentPane').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspacePanel').isVisible(), false, 'closing portrait workspace reveals the paper');
    await turnPage(page, 'prev', 1);
    await ensureWorkspaceOpen(page);
    const portraitCard = page.locator('.workspace-card[data-clip-id="' + clip.id + '"]');
    await openCardMenu(portraitCard);
    await portraitCard.locator('.workspace-source').click();
    await page.locator('#workspacePanel').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="2"].book-active')
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    await page.locator('.excerpt-source-cue-layer[data-excerpt-id="' + clip.id + '"][data-source-page="2"]')
      .waitFor({ state: 'visible' });
    assert.equal(Object.values((await paperById(page, pdfId)).highlights || {}).flat().length, 0,
      'portrait source visit shows a transient cue without saving a PDF highlight');

    await page.setViewportSize({ width: 1280, height: 900 });
    await openPaper(page, 'workspace-other');
    await ensureWorkspaceOpen(page);
    assert.equal(await page.locator('.workspace-card').count(), 0, 'other paper has no PDF clip cards');
    assert.equal(workspaceStrokes(await currentPaper(page)).length, 0, 'other paper has no workspace ink');
    await page.locator('#workspaceClose').click();
    await openPaper(page, pdfId);
    await waitPdf(page, 2);
    await ensureWorkspaceOpen(page);
    assert.equal(await page.locator('.workspace-card[data-clip-id="' + clip.id + '"]').count(), 1,
      'returning to PDF restores its workspace clip');
    assert.equal(workspaceStrokes(await currentPaper(page)).length, 1);
    assert.deepEqual(errors, [], 'workspace flow has no browser page errors');
    assert.deepEqual(aiRequests, [], 'workspace operations make no AI requests');
    console.log('PASS  Workspace split, clipping, placement, ink, reload, portrait, and paper isolation');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
