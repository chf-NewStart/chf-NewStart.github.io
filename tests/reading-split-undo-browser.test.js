/* Full-app paper/workspace history isolation. Synthetic Pencil events exercise
   application input handling; they do not emulate physical pressure or palms. */
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
  page.drawText('First independent paper highlight.', { x: 52, y: 710, size: 13, font });
  page.drawText('Second independent paper highlight.', { x: 52, y: 672, size: 13, font });
  return Buffer.from(await doc.save());
}
async function chapter(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
    .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
function highlights(saved) { return Object.values(saved.highlights || {}).flat(); }
function paperInk(saved) { return Object.values(saved.pdfInk || {}).flat(); }
function workspaceInk(saved) { return saved.readingWorkspace?.strokes || []; }
async function expectCounts(page, paper, workspace, handwriting = 0) {
  await page.waitForFunction(({ paper, workspace, handwriting }) => {
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return Object.values(saved.highlights || {}).flat().length === paper
      && (saved.readingWorkspace?.strokes || []).length === workspace
      && Object.values(saved.pdfInk || {}).flat().length === handwriting;
  }, { paper, workspace, handwriting });
}
async function annotateMenu(page, open) {
  if (await page.locator('#zenAnnotateMenu').isVisible() !== open) await page.locator('#zenAnnotate').click();
  await page.locator('#zenAnnotateMenu').waitFor({ state: open ? 'visible' : 'hidden' });
}
async function workspaceMenu(page, open) {
  if (await page.locator('#workspaceMore').evaluate(node => node.open) !== open) {
    await page.locator('#workspaceMore summary').click();
  }
  await page.locator('#workspaceRedo').waitFor({ state: open ? 'visible' : 'hidden' });
}
async function historyButtons(page, expected) {
  assert.equal(await page.locator('#zenUndo').isVisible(), true, 'paper Undo is always visible');
  assert.equal(await page.locator('#workspaceUndo').isVisible(), true, 'workspace Undo is always visible');
  assert.equal(await page.locator('#zenUndo').isDisabled(), !expected.paperUndo, 'paper Undo state');
  assert.equal(await page.locator('#workspaceUndo').isDisabled(), !expected.workspaceUndo, 'workspace Undo state');
  await annotateMenu(page, true);
  assert.equal(await page.locator('#zenRedo').isVisible(), true, 'paper Redo is reachable through Annotate');
  assert.equal(await page.locator('#zenRedo').isDisabled(), !expected.paperRedo, 'paper Redo state');
  await annotateMenu(page, false);
  await workspaceMenu(page, true);
  assert.equal(await page.locator('#workspaceRedo').isDisabled(), !expected.workspaceRedo, 'workspace Redo state');
  await workspaceMenu(page, false);
}
async function redoPaper(page) {
  await annotateMenu(page, true);
  await page.locator('#zenRedo').click();
  await annotateMenu(page, false);
}
async function redoWorkspace(page) {
  await workspaceMenu(page, true);
  await page.locator('#workspaceRedo').click();
  await workspaceMenu(page, false);
}
async function highlight(page, phrase) {
  await page.waitForFunction(phrase => [...document.querySelectorAll('.pdf-page.book-active .text-layer span')]
    .some(span => span.textContent.includes(phrase)), phrase);
  const selected = await page.evaluate(phrase => {
    const span = [...document.querySelectorAll('.pdf-page.book-active .text-layer span')]
      .find(node => node.textContent.includes(phrase) && node.firstChild);
    const start = span.firstChild.textContent.indexOf(phrase);
    const range = document.createRange();
    range.setStart(span.firstChild, start);
    range.setEnd(span.firstChild, start + phrase.length);
    const selection = getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 92 }));
    return selection.toString();
  }, phrase);
  assert.equal(selected, phrase, 'the fixture selects actual rendered PDF text');
  await page.locator('#selectionCreateHighlight').waitFor({ state: 'visible' });
  await page.locator('#selectionCreateHighlight [data-selection-highlight-color="yellow"]').click();
  if (await page.locator('#selectionCard').isVisible()) await page.locator('#selectionClose').click();
}
async function drawWorkspace(page, offset = 0) {
  await page.locator('#workspaceInk').evaluate((canvas, offset) => {
    const rect = canvas.getBoundingClientRect();
    const board = document.getElementById('workspaceBoard');
    const capture = board.setPointerCapture;
    board.setPointerCapture = () => {};
    try {
      [[.20, .14 + offset], [.25, .17 + offset], [.31, .19 + offset]].forEach(([x, y], index, points) => {
        const type = index === 0 ? 'pointerdown' : index === points.length - 1 ? 'pointerup' : 'pointermove';
        canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen',
          pointerId: 77, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
          pressure: type === 'pointerup' ? 0 : .6,
          clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y }));
      });
    } finally { board.setPointerCapture = capture; }
  }, offset);
}
async function drawPaper(page) {
  await annotateMenu(page, true);
  await page.locator('#zenWrite').click();
  await page.locator('#pdfInkToolbar').waitFor({ state: 'visible' });
  await page.locator('.pdf-page.book-active .pdf-sheet').evaluate(sheet => {
    const rect = sheet.getBoundingClientRect();
    for (let index = 0; index <= 8; index++) {
      const type = index === 0 ? 'pointerdown' : index === 8 ? 'pointerup' : 'pointermove';
      const x = rect.left + rect.width * (.2 + index * .025);
      const y = rect.top + rect.height * (.35 + index * .007);
      const target = document.elementFromPoint(x, y);
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen',
        pointerId: 78, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
        pressure: type === 'pointerup' ? 0 : .6, clientX: x, clientY: y }));
    }
  });
  await page.locator('#pdfInkDone').click();
  await page.locator('#pdfInkToolbar').waitFor({ state: 'hidden' });
}
async function checkSplitBounds(page) {
  const boxes = await page.evaluate(() => {
    const box = id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height, center: (rect.left + rect.right) / 2 };
    };
    return { paper: box('documentPane'), workspace: box('workspacePanel'),
      paperUndo: box('zenUndo'), workspaceUndo: box('workspaceUndo'), viewport: { width: innerWidth, height: innerHeight } };
  });
  assert(boxes.paperUndo.center < boxes.paper.right, 'paper Undo belongs to the left pane: ' + JSON.stringify(boxes));
  assert(boxes.workspaceUndo.center > boxes.paper.right && boxes.workspaceUndo.center > boxes.workspace.left,
    'workspace Undo belongs to the right pane: ' + JSON.stringify(boxes));
  for (const key of ['paperUndo', 'workspaceUndo']) {
    const box = boxes[key];
    assert(box.width >= 43.5 && box.height >= 43.5 && box.left >= 0 && box.top >= 0
      && box.right <= boxes.viewport.width && box.bottom <= boxes.viewport.height,
    key + ' is an on-screen 44px touch target: ' + JSON.stringify(boxes));
  }
}

(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(+(process.env.PHLOEM_SPLIT_UNDO_TEST_PORT || 0), '127.0.0.1', resolve);
  });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phloem.splitUndoFixture')) return;
      sessionStorage.setItem('phloem.splitUndoFixture', '1');
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'split-undo.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen')
      && !!document.querySelector('.pdf-page.book-active canvas')?.width
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    assert.deepEqual(await page.locator('#zenDock > button, #zenDock > .zen-tool > button').evaluateAll(nodes =>
      nodes.filter(node => node.getClientRects().length).map(node => node.id)),
    ['zenExit', 'zenGuide', 'zenLayout', 'zenAnnotate', 'zenUndo', 'zenWorkspace', 'zenMore'], 'paper Undo is a direct Zen control');
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page.book-active canvas')?.width);
    await checkSplitBounds(page);
    assert.equal(await page.locator('#workspaceNib').count(), 0, 'workspace has no Marker style selector');
    await historyButtons(page, { paperUndo: false, paperRedo: false, workspaceUndo: false, workspaceRedo: false });
    await page.locator('#workspaceNewNote').click();
    const note = page.locator('.workspace-card textarea.workspace-note').first();
    await note.fill('Keep this workspace note through both ink histories.');
    await page.locator('.workspace-card .workspace-handle').first().focus();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'))?.readingExcerpts?.items
      ?.some(item => item.note === 'Keep this workspace note through both ink histories.'));
    const notes = (await chapter(page)).readingExcerpts.items;
    // The new note is itself a Workspace Undo step, beneath everything that follows.
    await historyButtons(page, { paperUndo: false, paperRedo: false, workspaceUndo: true, workspaceRedo: false });

    await highlight(page, 'First independent paper highlight.');
    await expectCounts(page, 1, 0);
    await drawWorkspace(page);
    await expectCounts(page, 1, 1);
    const initial = await chapter(page);
    assert.equal(workspaceInk(initial)[0].style, 'natural', 'new workspace ink uses the natural pen');
    assert.notEqual(workspaceInk(initial)[0].nib, 'marker', 'new workspace ink has no Marker nib');
    await historyButtons(page, { paperUndo: true, paperRedo: false, workspaceUndo: true, workspaceRedo: false });
    await page.locator('#zenUndo').click();
    await expectCounts(page, 0, 1);
    assert.deepEqual(workspaceInk(await chapter(page)), workspaceInk(initial), 'paper Undo leaves workspace ink byte-for-byte intact');
    await historyButtons(page, { paperUndo: false, paperRedo: true, workspaceUndo: true, workspaceRedo: false });
    await redoPaper(page);
    await expectCounts(page, 1, 1);
    assert.deepEqual(highlights(await chapter(page)), highlights(initial), 'paper Redo restores the original highlight');
    await page.locator('#workspaceUndo').click();
    await expectCounts(page, 1, 0);
    assert.deepEqual(highlights(await chapter(page)), highlights(initial), 'workspace Undo leaves paper highlights intact');
    await historyButtons(page, { paperUndo: true, paperRedo: false, workspaceUndo: true, workspaceRedo: true });
    await redoWorkspace(page);
    await expectCounts(page, 1, 1);

    // With redo pending on both sides, an edit clears only its own redo stack.
    await page.locator('#zenUndo').click();
    await page.locator('#workspaceUndo').click();
    await expectCounts(page, 0, 0);
    await historyButtons(page, { paperUndo: false, paperRedo: true, workspaceUndo: true, workspaceRedo: true });
    await highlight(page, 'Second independent paper highlight.');
    await expectCounts(page, 1, 0);
    await historyButtons(page, { paperUndo: true, paperRedo: false, workspaceUndo: true, workspaceRedo: true });
    await redoWorkspace(page);
    await expectCounts(page, 1, 1);
    await page.locator('#zenUndo').click();
    await page.locator('#workspaceUndo').click();
    await expectCounts(page, 0, 0);
    await drawWorkspace(page, .08);
    await expectCounts(page, 0, 1);
    await historyButtons(page, { paperUndo: false, paperRedo: true, workspaceUndo: true, workspaceRedo: false });
    await redoPaper(page);
    await expectCounts(page, 1, 1);
    assert.equal(highlights(await chapter(page))[0].text, 'Second independent paper highlight.', 'workspace edits preserve paper Redo');

    // Highlights and PDF handwriting share paper history, while workspace is separate.
    await drawPaper(page);
    await expectCounts(page, 1, 1, 1);
    const withHandwriting = await chapter(page);
    await page.locator('#zenUndo').click();
    await expectCounts(page, 1, 1, 0);
    assert.deepEqual(highlights(await chapter(page)), highlights(withHandwriting), 'paper Undo removes the latest handwriting before its highlight');
    assert.deepEqual(workspaceInk(await chapter(page)), workspaceInk(withHandwriting), 'paper handwriting Undo preserves workspace ink');
    await page.locator('#zenUndo').click();
    await expectCounts(page, 0, 1, 0);
    await historyButtons(page, { paperUndo: false, paperRedo: true, workspaceUndo: true, workspaceRedo: false });
    await redoPaper(page);
    await expectCounts(page, 1, 1, 0);
    await redoPaper(page);
    await expectCounts(page, 1, 1, 1);
    assert.deepEqual(paperInk(await chapter(page)).map(stroke => stroke.points), paperInk(withHandwriting).map(stroke => stroke.points),
      'paper Redo restores the handwriting geometry');
    await page.locator('#workspaceUndo').focus();
    await page.keyboard.press('Control+z');
    await expectCounts(page, 1, 0, 1);
    await page.locator('#workspaceMore summary').focus();
    await page.keyboard.press('Control+Shift+z');
    await expectCounts(page, 1, 1, 1);
    await historyButtons(page, { paperUndo: true, paperRedo: false, workspaceUndo: true, workspaceRedo: false });
    assert.deepEqual((await chapter(page)).readingExcerpts.items, notes, 'both histories preserve workspace note cards');
    await checkSplitBounds(page);
    await page.screenshot({ path: '/tmp/phloem-split-undo-' + ENGINE + '.png' });
    assert.deepEqual(errors, [], 'split paper/workspace history interactions have no page errors');
    console.log('PASS  Independent split paper/workspace Undo and Redo, new-edit isolation, handwriting and keyboard routing (' + ENGINE + ')');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
