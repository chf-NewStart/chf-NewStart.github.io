const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_KEEPS_TEST_PORT || 8167);
const BASE = 'http://127.0.0.1:' + PORT;
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  const filename = path.join(ROOT, pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const type = filename.endsWith('.html') ? 'text/html' : filename.endsWith('.js') ? 'text/javascript'
      : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(bytes);
  });
});

/* Source-authored PDF: each page has its own text stream so PDF.js exposes real
   selectable text and real page geometry without a checked-in binary fixture. */
function makeTwoPagePdf() {
  const streams = [
    'BT /F1 18 Tf 0 g 1 0 0 1 72 700 Tm (First page introduces the field guide.) Tj ET\n',
    'BT /F1 18 Tf 0 g 1 0 0 1 72 700 Tm (Second page asks why moss bends toward light.) Tj ET\n'
  ];
  const objects = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(streams[0], 'ascii') + ' >>\nstream\n' + streams[0] + 'endstream',
    '<< /Length ' + Buffer.byteLength(streams[1], 'ascii') + ' >>\nstream\n' + streams[1] + 'endstream'
  ];
  let source = '%PDF-1.4\n% Phloem Keeps generated test PDF\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(source, 'ascii');
    source += index + ' 0 obj\n' + objects[index] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(source, 'ascii');
  source += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let index = 1; index < objects.length; index++)
    source += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  source += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\n';
  source += 'startxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(source, 'ascii');
}

function watchAiRequests(context, found) {
  context.on('request', request => {
    const url = request.url();
    if (/(?:api\.openai\.com|api\.anthropic\.com|api\.deepseek\.com|generativelanguage\.googleapis\.com|\/v1\/(?:chat\/completions|responses|messages)|\/api\/(?:ai|chat|generate))/i.test(url)
      || request.method() !== 'GET' && new URL(url).origin !== BASE)
      found.push(url);
  });
}

function seed() {
  if (localStorage.getItem('readingRoom.v1')) return;
  const paragraphs = [
    'First passage names the problem and sets out a careful question for later.',
    'Second passage holds the chosen sentence about moss and patient observation.',
    'Third passage marks an alternative explanation for the next visit.'
  ];
  const stamp = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({
    chapters: [{ id: 'keeps-fixture', kind: 'text', title: 'Keeps fixture', fr: paragraphs.join('\n\n'),
      notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }],
    deleted: {}, merged: {}, savedAt: stamp
  }));
  localStorage.setItem('readingRoom.lastOpen.v1', 'keeps-fixture');
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '0');
}
async function saved(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = state.chapters.find(item => item.id === 'keeps-fixture');
    return { keeps: chapter.readingKeeps, ai: chapter.questions, threads: chapter.aiThreads };
  });
}
async function ready(page) {
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden')
    && document.querySelectorAll('#textDocument .original').length === 3);
}
async function openKeeps(page) {
  // 1a215db5 made Zen the only reader: the notebook (and its Keeps panel) is
  // reached from Zen's More > Notebook instead of a desk side panel.
  if (!await page.locator('#notebook').evaluate(node => node.classList.contains('sheet-open'))) {
    await page.locator('#zenMore').click();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    await page.locator('#zenNotebook').click();
    await page.waitForFunction(() => document.getElementById('notebook').classList.contains('sheet-open'));
  }
  await page.locator('#readingKeepsPanel').evaluate(panel => { panel.open = true; });
}
async function closeNotebook(page) {
  // The Zen notebook floats over the paper with a scrim; close it to reach the page.
  if (await page.locator('#notebook').evaluate(node => node.classList.contains('sheet-open'))) {
    await page.locator('#sheetClose').click();
    await page.waitForFunction(() => !document.getElementById('notebook').classList.contains('sheet-open'));
  }
}
async function pdfPageControl(page, selector) {
  await closeNotebook(page);
  // Page navigation now lives in Zen's More > This paper dialog (1a215db5).
  await page.locator('#zenMore').click();
  await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
  await page.locator('#zenReadingControls').click();
  await page.locator('#readerControlsDialog').waitFor({ state: 'visible' });
  await page.locator(selector).click();
  await page.keyboard.press('Escape');
  await page.locator('#readerControlsDialog').waitFor({ state: 'hidden' });
}
async function dialogSave(page, text) {
  await page.locator('#readingKeepText').fill(text);
  await page.locator('#saveReadingKeep').click();
  await page.waitForFunction(() => !document.getElementById('readingKeepDialog').open);
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  let browser;
  try {
    const launch = { headless: true };
    if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright.chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    const aiRequests = [];
    watchAiRequests(context, aiRequests);
    const page = await context.newPage();
    page.setDefaultTimeout(18000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seed);
    await page.goto(BASE + '/reading.html', { waitUntil: 'load' });
    await ready(page);
    await openKeeps(page);

    await page.locator('#saveReadingBookmark').click();
    await page.locator('#readingKeepText').fill('Cancelled bookmark');
    await page.locator('#cancelReadingKeep').click();
    assert.equal((await saved(page)).keeps.items.length, 0, 'cancel does not mutate saved state');

    await page.locator('#saveReadingBookmark').click();
    await dialogSave(page, 'Start here');
    let state = await saved(page);
    assert.equal(state.keeps.items.length, 1);
    assert.equal(state.keeps.items[0].kind, 'bookmark');
    assert.equal(state.keeps.items[0].text, 'Start here');
    assert.equal(state.keeps.items[0].anchor.kind, 'text');
    assert.equal(state.ai.length, 0, 'personal keeps do not enter legacy AI questions');

    await page.locator('#leaveReadingThread').click();
    await dialogSave(page, 'Compare the two explanations');
    state = await saved(page);
    const thread = state.keeps.items.find(item => item.kind === 'thread');
    assert(thread && !thread.resolved, 'thread saved unresolved');
    assert.equal(await page.locator('#readingThreadResume').isVisible(), false,
      'resume chip is withheld until the next opening');

    await openKeeps(page);
    const threadRow = page.locator('.reading-keep').filter({ hasText: 'Compare the two explanations' });
    await page.locator('#readingKeepsPanel').screenshot({ path: '/tmp/phloem-keeps-panel.png' });
    await threadRow.getByRole('button', { name: 'Edit' }).click();
    await page.locator('#readingKeepDialog').screenshot({ path: '/tmp/phloem-keeps-dialog.png' });
    await dialogSave(page, 'Compare the new explanation');
    state = await saved(page);
    assert.equal(state.keeps.items.find(item => item.id === thread.id).text, 'Compare the new explanation');
    assert.equal(state.keeps.items.find(item => item.id === thread.id).createdAt, thread.createdAt,
      'edits retain creation time');

    await closeNotebook(page);
    const selected = await page.evaluate(() => {
      const element = document.querySelector('.original[data-para-index="1"]');
      const node = element.firstChild;
      const start = node.textContent.indexOf('chosen sentence');
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 'chosen sentence'.length);
      const selection = getSelection();
      selection.removeAllRanges();selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 33 }));
      return selection.toString();
    });
    assert.equal(selected, 'chosen sentence');
    await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
    await page.locator('#selectionParkQuestion').click();
    await dialogSave(page, 'What does this imply?');
    state = await saved(page);
    const question = state.keeps.items.find(item => item.kind === 'question');
    assert(question, 'question was saved');
    assert.equal(question.anchor.para, 1);
    assert.equal(question.anchor.quote, 'chosen sentence');
    assert(Math.abs(question.anchor.offset - 'Second passage holds the '.length /
      'Second passage holds the chosen sentence about moss and patient observation.'.length) < .02,
    'selection retains a relative paragraph offset');
    assert.equal(state.ai.length, 0);

    await openKeeps(page);
    const questionRow = page.locator('.reading-keep').filter({ hasText: 'What does this imply?' });
    await questionRow.getByRole('button', { name: 'Resolve' }).click();
    assert.equal((await saved(page)).keeps.items.find(item => item.id === question.id).resolved, true);
    await questionRow.getByRole('button', { name: 'Reopen' }).click();
    assert.equal((await saved(page)).keeps.items.find(item => item.id === question.id).resolved, false);

    await page.reload({ waitUntil: 'load' });
    await ready(page);
    assert.equal((await saved(page)).keeps.items.length, 3, 'keeps survive reload');
    assert.equal(await page.locator('#readingThreadResume').isVisible(), true, 'thread is offered after reopening');
    await page.locator('#readingThreadResume').click();
    assert.equal(await page.locator('#readingThreadResume').isVisible(), false);

    await openKeeps(page);
    await page.locator('.reading-keep').filter({ hasText: 'What does this imply?' })
      .getByRole('button', { name: 'Go to place' }).click();
    // Zen's notebook is a temporary overlay at every width (1a215db5), so the jump
    // closes it first, exactly as the phone sheet does below.
    await page.waitForFunction(() => !document.getElementById('notebook').classList.contains('sheet-open'));
    // The jump settles a layout frame after the overlay closes.
    await page.waitForFunction(() => document.querySelector('.para.current .original')?.dataset.paraIndex === '1',
      null, { timeout: 3000 }).catch(() => {});
    assert.equal(await page.locator('.para.current .original').getAttribute('data-para-index'), '1',
      'explicit jump returns to the saved paragraph');

    await page.setViewportSize({ width: 390, height: 844 });
    await openKeeps(page);
    await page.locator('.reading-keep').filter({ hasText: 'What does this imply?' })
      .getByRole('button', { name: 'Go to place' }).click();
    await page.waitForFunction(() => !document.getElementById('notebook').classList.contains('sheet-open'));
    assert.equal(await page.locator('.para.current .original').getAttribute('data-para-index'), '1',
      'mobile sheet closes before its explicit saved-place jump');
    await page.setViewportSize({ width: 1180, height: 820 });

    page.on('dialog', dialog => dialog.accept());
    await openKeeps(page);
    await page.locator('.reading-keep').filter({ hasText: 'Start here' })
      .getByRole('button', { name: 'Remove' }).click();
    state = await saved(page);
    assert.equal(state.keeps.items.some(item => item.kind === 'bookmark'), false);
    assert.equal(Object.keys(state.keeps.deleted).length, 1, 'remove leaves a tombstone');

    const remote = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
      const chapter = state.chapters.find(item => item.id === 'keeps-fixture');
      chapter.updatedAt -= 1000;
      chapter.readingKeeps = { version: 1, deleted: {}, items: [{
        id: 'remote-question', kind: 'question', text: 'A second device question',
        anchor: { kind: 'text', para: 2, offset: .5 }, resolved: false,
        createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000
      }] };
      return { chapters: [chapter], deleted: {}, merged: {} };
    });
    await page.locator('#restoreFile').setInputFiles({ name: 'keeps-backup.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(remote)) });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]
      .readingKeeps.items.some(item => item.id === 'remote-question'));
    assert.equal((await saved(page)).keeps.items.length, 3,
      'independent keep survives a merge from an older chapter');

    const future = { version: 2, items: [{ id: 'future-shape' }], futureField: { keep: true } };
    remote.chapters[0].readingKeeps = future;
    await page.locator('#restoreFile').setInputFiles({ name: 'keeps-future.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(remote)) });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]
      .readingKeeps.version === 2);
    state = await saved(page);
    assert.deepEqual(state.keeps, future, 'future payload is preserved opaquely');
    assert.equal(await page.locator('#saveReadingBookmark').isDisabled(), true,
      'future data blocks mutation until this app understands the version');
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1'))
      .chapters[0].readingKeepsPending);
    assert(pending.some(copy => copy.version === 1 && copy.items.length === 3),
      'known copy is retained alongside the future payload');
    assert.deepEqual(errors, [], 'no browser page errors');
    assert.deepEqual(aiRequests, [], 'text Keeps actions send no AI request');

    const pdfContext = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    const pdfAiRequests = [];
    watchAiRequests(pdfContext, pdfAiRequests);
    const pdfPage = await pdfContext.newPage();
    const pdfErrors = [];
    pdfPage.on('pageerror', error => pdfErrors.push(error.message));
    await pdfPage.addInitScript(seed);
    await pdfPage.addInitScript(() => {
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page' }));
    });
    await pdfPage.goto(BASE + '/reading.html', { waitUntil: 'load' });
    await ready(pdfPage);
    await pdfPage.locator('#pdfFile').setInputFiles({
      name: 'keeps-generated.pdf', mimeType: 'application/pdf', buffer: makeTwoPagePdf()
    });
    await pdfPage.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden')
      && document.querySelector('.pdf-page[data-page="1"] canvas')?.width > 0
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    await pdfPageControl(pdfPage, '#nextPage');
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"].book-active canvas')?.width > 0
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    await openKeeps(pdfPage);
    await pdfPage.locator('#saveReadingBookmark').click();
    await dialogSave(pdfPage, 'Return to page two');
    const pdfState = async () => pdfPage.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
      const chapter = state.chapters.find(item => item.kind === 'pdf' && item.sourceName === 'keeps-generated.pdf');
      return { id: chapter?.id, keeps: chapter?.readingKeeps, highlights: chapter?.highlights,
        ai: chapter?.questions, threads: chapter?.aiThreads };
    });
    let pdfSaved = await pdfState();
    assert(pdfSaved.id, 'generated PDF imported');
    const pdfBookmark = pdfSaved.keeps.items.find(item => item.kind === 'bookmark');
    assert.equal(pdfBookmark.anchor.kind, 'pdf');
    assert.equal(pdfBookmark.anchor.page, 2);
    assert.equal(pdfBookmark.anchor.position.page, 2);
    assert(pdfBookmark.anchor.position.x >= 0 && pdfBookmark.anchor.position.x <= 1);
    assert(pdfBookmark.anchor.position.y >= 0 && pdfBookmark.anchor.position.y <= 1);

    await closeNotebook(pdfPage);
    const pdfSelection = await pdfPage.evaluate(() => {
      const span = Array.from(document.querySelectorAll('.pdf-page[data-page="2"] .text-layer span'))
        .find(element => element.textContent.includes('moss bends'));
      if (!span || !span.firstChild) return null;
      const node = span.firstChild;
      const start = node.textContent.indexOf('moss bends');
      const range = document.createRange();range.setStart(node, start);range.setEnd(node, start + 'moss bends'.length);
      const selection = getSelection();selection.removeAllRanges();selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 34 }));
      return selection.toString();
    });
    assert.equal(pdfSelection, 'moss bends', 'generated PDF text is selectable');
    await pdfPage.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
    await pdfPage.locator('#selectionParkQuestion').click();
    await dialogSave(pdfPage, 'Why does the moss bend?');
    pdfSaved = await pdfState();
    const pdfQuestion = pdfSaved.keeps.items.find(item => item.kind === 'question');
    assert.equal(pdfQuestion.anchor.kind, 'pdf');
    assert.equal(pdfQuestion.anchor.page, 2);
    assert.equal(pdfQuestion.anchor.quote, 'moss bends');
    assert.equal(pdfQuestion.anchor.position.page, 2);
    assert.equal(Object.values(pdfSaved.highlights || {}).flat().length, 0,
      'parking a PDF question does not create a highlight');
    assert.equal(pdfSaved.ai.length, 0, 'PDF Keeps do not enter legacy AI questions');

    await pdfPage.reload({ waitUntil: 'load' });
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"] canvas')?.width > 0
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    assert.equal((await pdfState()).keeps.items.length, 2, 'PDF Keeps survive reopening');
    await pdfPageControl(pdfPage, '#prevPage');
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"].book-active canvas')?.width > 0
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    await openKeeps(pdfPage);
    await pdfPage.locator('.reading-keep').filter({ hasText: 'Return to page two' })
      .getByRole('button', { name: 'Go to place' }).click();
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"].book-active canvas')?.width > 0
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    // The jump saves its page once placement settles; a fitted paged PDF never scrolls to save it.
    await pdfPage.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.sourceName === 'keeps-generated.pdf').readPage === 2, null, { timeout: 5000 }).catch(() => {});
    const resumedPosition = await pdfPage.evaluate(() => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
        .find(item => item.sourceName === 'keeps-generated.pdf');
      const pane = document.getElementById('documentPane');
      const anchor = ch.readingKeeps.items.find(item => item.text === 'Return to page two').anchor.position;
      const paper = document.querySelector('.pdf-page[data-page="2"]').getBoundingClientRect();
      const viewport = pane.getBoundingClientRect();
      return { page: ch.readPage,
        actualX: (paper.left + paper.width * anchor.x - viewport.left) / pane.clientWidth,
        actualY: (paper.top + paper.height * anchor.y - viewport.top) / pane.clientHeight,
        targetX: anchor.screenX, targetY: anchor.screenY };
    });
    assert.equal(resumedPosition.page, 2, 'explicit jump returns to saved PDF page');
    assert(Math.abs(resumedPosition.actualX - resumedPosition.targetX) < .1
      && Math.abs(resumedPosition.actualY - resumedPosition.targetY) < .1,
    'saved PDF point returns to its viewport position: ' + JSON.stringify(resumedPosition));
    assert.deepEqual(pdfErrors, [], 'no PDF browser page errors');
    assert.deepEqual(pdfAiRequests, [], 'PDF Keeps actions send no AI request');
    console.log('PASS  Keeps text and generated PDF save/selection/reopen/jump; no AI requests');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
