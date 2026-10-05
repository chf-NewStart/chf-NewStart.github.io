/* The paper reader stays in Zen; run with PHLOEM_BROWSER=chromium|webkit. */
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
const PORT = +(process.env.PHLOEM_ZEN_TEST_PORT || 8328);
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
function seedLibrary() {
  if (sessionStorage.getItem('phloem.zenFixture')) return;
  sessionStorage.setItem('phloem.zenFixture', '1');
  const at = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{
    id: 'zen-text', kind: 'text', title: 'Zen fixture text paper',
    fr: 'First paragraph for quiet reading.\n\nA second paragraph stays in the paper.',
    notes: {}, pageNotes: {}, questions: [], tags: [], addedAt: at, updatedAt: at
  }], deleted: {}, merged: {}, savedAt: at }));
  localStorage.removeItem('readingRoom.lastOpen.v1');
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
}
async function generatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= 3; number++) {
    const page = doc.addPage([612, 792]);
    page.drawText('Zen fixture PDF passage for workspace clipping. Page ' + number,
      { x: 52, y: 710, size: 13, font });
  }
  return Buffer.from(await doc.save());
}
async function waitZen(page, paperId) {
  await page.waitForFunction(id => document.body.classList.contains('zen')
    && !document.getElementById('readerPage').classList.contains('hidden')
    && localStorage.getItem('readingRoom.lastOpen.v1') === id, paperId);
  assert.equal(await page.locator('#zenExit').isVisible(), true, 'Zen has a visible exit control');
  assert.equal(await page.locator('#readerBack').isVisible(), false, 'regular reader toolbar is tucked away in Zen');
  assert.equal(await page.evaluate(() => document.fullscreenElement === null), true,
    'automatic Zen entry does not request browser fullscreen');
  assert.doesNotMatch(await page.locator('#readerToast').textContent(), /Zen reading/i,
    'automatic Zen entry does not show the manual Zen toast');
}
async function staysZen(page, message) {
  assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen')), true, message);
  assert.equal(await page.locator('#readerPage').isVisible(), true, 'the same paper remains open');
  assert.equal(await page.locator('#readerBack').isVisible(), false, 'the old desk toolbar remains hidden');
}
async function atLibrary(page) {
  await page.locator('#libraryPage').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#readerPage').isVisible(), false, 'returning to the library closes the reader');
  assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen')), false,
    'library remains outside Zen');
}
async function backToLibrary(page) {
  await page.locator('#zenExit').click();
  await atLibrary(page);
}
async function openMoreAction(page, selector) {
  await page.locator('#zenMore').click();
  await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
  await page.locator(selector).click();
  await page.locator('#zenMoreMenu').waitFor({ state: 'hidden' });
}
async function waitPdfPage(page, number) {
  await page.waitForFunction(value => {
    const active = document.querySelector('.pdf-page.book-active[data-page="' + value + '"] canvas');
    return !!active?.width && document.getElementById('pdfFrame').dataset.pagedReady === 'true'
      && document.getElementById('pageNumber').textContent.trim().startsWith(value + ' /');
  }, number);
}
async function notebookExitReopenBack(page, paperId, pdfPage, closeFirst = false) {
  await openMoreAction(page, '#zenNotebook');
  await page.locator('#notebook').waitFor({ state: 'visible' });
  await staysZen(page, 'Notebook is open before the direct library exit');
  if (closeFirst) {
    // Model rapid Close notes then X before the pending history traversal returns.
    await page.evaluate(() => {
      document.getElementById('sheetClose').click();
      document.getElementById('zenExit').click();
    });
    await atLibrary(page);
  } else await backToLibrary(page);
  assert.equal(await page.locator('#sheetScrim').isVisible(), false, 'X dismisses the open Notebook scrim');
  // Reopen immediately: pending sheet/history cleanup must not consume the new reader entry.
  await page.locator('[data-continue-paper="' + paperId + '"]').click();
  await waitZen(page, paperId);
  if (pdfPage) await waitPdfPage(page, pdfPage);
  assert.equal(await page.locator('#notebook').isVisible(), false,
    'reopening after X starts with the Notebook closed');
  await page.goBack();
  await atLibrary(page);
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
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seedLibrary);
    await page.addInitScript(() => {
      window.__zenFullscreenRequests = 0;
      window.__zenFullscreenExits = 0;
      let fullscreenElement = null;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
      Element.prototype.requestFullscreen = function () {
        window.__zenFullscreenRequests++;
        fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      };
      document.exitFullscreen = () => {
        window.__zenFullscreenExits++;
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      };
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen')), false,
      'the library itself does not start in Zen');

    await page.locator('[data-continue-paper="zen-text"]').click();
    await waitZen(page, 'zen-text');
    assert.equal(await page.evaluate(() => window.__zenFullscreenRequests), 0,
      'default text Zen does not request fullscreen');
    assert.deepEqual(await page.locator('#zenDock > button, #zenDock > .zen-tool > button')
      .evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).map(button => button.id)),
    ['zenExit', 'zenGuide', 'zenAnnotate', 'zenUndo', 'zenWorkspace', 'zenMore'],
    'Zen-only reading keeps the compact dock with direct paper Undo');
    await page.keyboard.press('f');
    await page.waitForFunction(() => window.__zenFullscreenRequests === 1 && !!document.fullscreenElement);
    await staysZen(page, 'F enters browser fullscreen without leaving Zen');
    await page.keyboard.press('f');
    await page.waitForFunction(() => window.__zenFullscreenExits === 1 && !document.fullscreenElement);
    await staysZen(page, 'F exits browser fullscreen without revealing the desk');

    await openMoreAction(page, '#zenNotebook');
    await page.locator('#notebook').waitFor({ state: 'visible' });
    await staysZen(page, 'Notebook opens over the Zen paper');
    const paperNote = 'This paper note must survive closing the Zen overlay.';
    await page.locator('[data-tab="notesPanel"]').click();
    await page.locator('#pageNote').fill(paperNote);
    await page.waitForFunction(value => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === 'zen-text')?.pageNotes?.document === value, paperNote);
    await page.locator('#sheetClose').click();
    await page.locator('#notebook').waitFor({ state: 'hidden' });
    await staysZen(page, 'closing Notebook returns to quiet Zen reading');
    await openMoreAction(page, '#zenNotebook');
    assert.equal(await page.locator('#pageNote').inputValue(), paperNote, 'reopening Notebook restores the saved note');
    await page.locator('#sheetClose').focus();
    await page.keyboard.press('Escape');
    await page.locator('#notebook').waitFor({ state: 'hidden' });
    await staysZen(page, 'the first Escape closes Notebook only');
    await page.keyboard.press('Escape');
    await atLibrary(page);

    await page.locator('[data-continue-paper="zen-text"]').click();
    await waitZen(page, 'zen-text');
    await notebookExitReopenBack(page, 'zen-text');
    await page.locator('[data-continue-paper="zen-text"]').click();
    await waitZen(page, 'zen-text');
    await notebookExitReopenBack(page, 'zen-text', null, true);
    assert.equal(await page.evaluate(value => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === 'zen-text')?.pageNotes?.document === value, paperNote), true,
    'direct Notebook exit and browser Back preserve the text paper note');

    await page.locator('[data-continue-paper="zen-text"]').click();
    await waitZen(page, 'zen-text');
    await openMoreAction(page, '#zenSettings');
    await page.locator('#comfortBar').waitFor({ state: 'visible' });
    await staysZen(page, 'reading settings open over the Zen paper');
    await page.keyboard.press('Escape');
    await page.locator('#comfortBar').waitFor({ state: 'hidden' });
    await staysZen(page, 'Escape dismisses settings before closing the paper');
    await openMoreAction(page, '#zenSettings');
    await page.locator('#comfortBar').waitFor({ state: 'visible' });
    await backToLibrary(page);
    assert.equal(await page.locator('#comfortBar').isVisible(), false, 'X returns straight to the library from settings');
    await page.locator('[data-continue-paper="zen-text"]').click();
    await waitZen(page, 'zen-text');
    await page.locator('#zenMore').click();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    await backToLibrary(page);
    assert.equal(await page.locator('#zenMoreMenu').isVisible(), false, 'X returns straight to the library from an open popout');

    await page.locator('[data-continue-paper="zen-text"]').click();
    await page.reload({ waitUntil: 'load' });
    await waitZen(page, 'zen-text');
    assert.equal(await page.evaluate(() => window.__zenFullscreenRequests), 0,
      'reload into Zen does not request fullscreen');
    await openMoreAction(page, '#zenNotebook');
    assert.equal(await page.locator('#pageNote').inputValue(), paperNote, 'the paper note survives a full reload');
    await page.locator('#sheetClose').click();
    await backToLibrary(page);
    await page.locator('[data-continue-paper="zen-text"]').click();
    await waitZen(page, 'zen-text');
    await backToLibrary(page);

    await page.locator('#pdfFile').setInputFiles({ name: 'zen-fixture.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page.book-active canvas')?.width
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    const pdfId = await page.evaluate(() => localStorage.getItem('readingRoom.lastOpen.v1'));
    assert.notEqual(pdfId, 'zen-text');
    await waitZen(page, pdfId);
    assert.equal(await page.evaluate(() => window.__zenFullscreenRequests), 0,
      'default PDF Zen does not request fullscreen');

    await openMoreAction(page, '#zenReadingControls');
    await page.locator('#readerControlsDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#readerControlsDialog').evaluate(node => node instanceof HTMLDialogElement && node.open),
      true, 'reading controls use an open native dialog');
    for (const id of ['renameReaderTitle', 'pageNumber', 'prevPage', 'nextPage', 'zoomLabel', 'zoomIn', 'zoomOut', 'tocBtn', 'reflowBtn']) {
      assert.equal(await page.locator('#' + id).count(), 1, id + ' remains a single existing control');
      assert.equal(await page.locator('#readerControlsDialog #' + id).count(), 1, id + ' is reachable inside Reading controls');
    }
    await staysZen(page, 'Reading controls preserve Zen beneath the dialog');
    await page.locator('#renameReaderTitle').click();
    await page.locator('#renamePaperDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#readerControlsDialog').isVisible(), false,
      'Rename replaces Reading controls with its own dialog');
    assert.equal(await page.locator('#renamePaperTitle').evaluate(node => document.activeElement === node), true,
      'the rename field receives focus after Reading controls closes');
    await page.locator('#renamePaperTitle').fill('Zen renamed PDF');
    await page.locator('#renamePaperTitle').press('Enter');
    await page.locator('#renamePaperDialog').waitFor({ state: 'hidden' });
    await staysZen(page, 'renaming the paper keeps Zen active');
    assert.equal(await page.locator('#readerTitle').textContent(), 'Zen renamed PDF');
    await openMoreAction(page, '#zenReadingControls');
    await page.locator('#nextPage').click();
    await waitPdfPage(page, 2);
    await page.keyboard.press('Escape');
    await page.locator('#readerControlsDialog').waitFor({ state: 'hidden' });
    await staysZen(page, 'Escape dismisses the Reading controls dialog first');
    await notebookExitReopenBack(page, pdfId, 2);
    await page.locator('[data-continue-paper="' + pdfId + '"]').click();
    await waitPdfPage(page, 2);
    await waitZen(page, pdfId);
    await openMoreAction(page, '#zenReadingControls');
    await page.locator('#prevPage').click();
    await waitPdfPage(page, 1);
    await page.keyboard.press('Escape');
    await page.locator('#readerControlsDialog').waitFor({ state: 'hidden' });

    const passage = 'Zen fixture PDF passage';
    const selected = await page.evaluate(text => {
      const span = [...document.querySelectorAll('.pdf-page.book-active .text-layer span')]
        .find(node => node.textContent.includes(text) && node.firstChild);
      if (!span) return '';
      const start = span.firstChild.textContent.indexOf(text);
      const range = document.createRange();
      range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + text.length);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 88 }));
      return selection.toString();
    }, passage);
    assert.equal(selected, passage, 'PDF passage is selected in Zen');
    await page.locator('#selectionSaveExcerpt').waitFor({ state: 'visible' });
    await page.locator('#selectionSaveExcerpt').click();
    await page.locator('#excerptsPanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#notebook').isVisible(), true,
      'Save excerpt reveals the requested Clips notebook panel');
    await staysZen(page, 'Save excerpt reveals Clips over the same Zen paper');
    assert.equal(await page.evaluate(value => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'))?.readingExcerpts?.items?.some(item => item.quote === value), passage), true,
    'selected passage is saved as a clip');
    await page.locator('#sheetClose').click();
    await page.locator('#notebook').waitFor({ state: 'hidden' });

    assert.equal(await page.locator('#zenWorkspace').isVisible(), true,
      'Zen gives Workspace a direct visible control');
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    const split = await page.evaluate(() => {
      const paper = document.getElementById('documentPane').getBoundingClientRect();
      const workspace = document.getElementById('workspacePanel').getBoundingClientRect();
      return { viewport: innerWidth, paperWidth: paper.width, workspaceWidth: workspace.width,
        gap: workspace.left - paper.right,
        background: getComputedStyle(document.getElementById('workspaceBoard')).backgroundImage,
        zen: document.body.classList.contains('zen') };
    });
    assert(split.zen && split.paperWidth >= split.viewport * .35 && split.workspaceWidth >= split.viewport * .35
      && Math.abs(split.paperWidth - split.workspaceWidth) < split.viewport * .16 && Math.abs(split.gap) < 4,
    'direct Zen Workspace opens the split reading/workspace view: ' + JSON.stringify(split));
    assert.equal(split.background, 'none', 'Zen workspace keeps blank paper');
    await page.locator('#workspaceMore summary').click();
    await page.locator('#workspaceNewNote').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'))?.readingExcerpts?.items?.some(item => item.quote === ''));
    const noteId = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1')).readingExcerpts.items.find(item => item.quote === '').id);
    const card = page.locator('.workspace-card[data-clip-id="' + noteId + '"]');
    await card.waitFor({ state: 'visible' });
    const note = 'A sticky thought beside this PDF';
    await card.locator('textarea.workspace-note').fill(note);
    await page.waitForFunction(value => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'))?.readingExcerpts?.items?.some(item => item.note === value), note);
    await card.locator('.workspace-handle').focus();
    assert.equal(await card.locator('textarea.workspace-note').isVisible(), false,
      'sticky editor folds back into the card');
    assert.equal(await card.locator('.workspace-note-preview').textContent(), note);
    await page.screenshot({ path: '/tmp/phloem-zen-workspace-' + ENGINE + '.png' });
    await page.locator('#workspaceClose').click();
    await page.locator('#workspacePanel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen')), true,
      'closing Workspace returns to Zen reading');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page.book-active canvas')?.width
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    await waitZen(page, pdfId);
    assert.equal(await page.evaluate(() => window.__zenFullscreenRequests), 0,
      'PDF reload into Zen also avoids fullscreen');
    assert.equal(await page.evaluate(value => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'))?.readingExcerpts?.items?.some(item => item.note === value), note), true,
    'workspace sticky thought survives PDF reload');
    await page.goBack();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen')), false,
      'system browser Back from Zen reaches the ordinary library');
    assert.deepEqual(errors, [], 'default-Zen flow has no page errors');
    console.log('PASS  Zen-only text/PDF reading: library exits, layered Escape, fullscreen, notes, reading controls, PDF resume and split Workspace');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
