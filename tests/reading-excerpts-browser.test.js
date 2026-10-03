/* Browser coverage for per-paper Clips and source/reading-place navigation.
   Run with PHLOEM_BROWSER=chromium or PHLOEM_BROWSER=webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const BROWSER = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(BROWSER), 'PHLOEM_BROWSER must be chromium or webkit');
const PORT = +(process.env.PHLOEM_EXCERPTS_TEST_PORT || 8325);
let base;
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  if (pathname === '/excerpt-view-fixture') {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><html><body><button id="newExcerptNote"></button><button id="excerptReturn"></button><span id="excerptCount"></span><p id="excerptStatus"></p><div id="excerptList"></div><script src="/reading-excerpts-view.js"></script></body></html>');
    return;
  }
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});

const QUOTE = 'patient observation carries the <script>untrusted</script> source words all the way through a long passage, including its ending';
function seedTextPapers() {
  if (localStorage.getItem('phloem.excerptsFixtureSeeded')) return;
  localStorage.setItem('phloem.excerptsFixtureSeeded', '1');
  const fixtureQuote = 'patient observation carries the <script>untrusted</script> source words all the way through a long passage, including its ending';
  const fixtureFirst = 'First passage establishes a reading place before the saved selection.';
  const fixtureSecond = 'Second passage says ' + fixtureQuote + ' and then repeats ' + fixtureQuote + ' before closing the paragraph.';
  const stamp = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
    { id: 'clip-a', kind: 'text', title: 'Clips fixture A', fr: fixtureFirst + '\n\n' + fixtureSecond,
      notes: {}, pageNotes: {}, questions: [], tags: [], addedAt: stamp, updatedAt: stamp },
    { id: 'clip-b', kind: 'text', title: 'Clips fixture B', fr: 'Another paper has its own notebook.\n\nIts second paragraph is independent.',
      notes: {}, pageNotes: {}, questions: [], tags: [], addedAt: stamp, updatedAt: stamp }
  ], deleted: {}, merged: {}, savedAt: stamp }));
  localStorage.setItem('readingRoom.lastOpen.v1', 'clip-a');
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '0');
}
async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 3; n++) {
    const page = doc.addPage([612, 792]);
    page.drawText('Clips fixture page ' + n + ' introduces the source passage.',
      { x: 72, y: 700, size: 17, font });
    page.drawText('The second line keeps this page visibly distinct.',
      { x: 72, y: 660, size: 13, font });
  }
  return Buffer.from(await doc.save());
}
async function chapter(page, id) {
  return page.evaluate(paperId => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === paperId), id);
}
async function currentChapter(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id);
  });
}
async function selectText(page, selector, substring, occurrence = 1) {
  const selected = await page.evaluate(({ selector, substring, occurrence }) => {
    const element = Array.from(document.querySelectorAll(selector)).find(candidate => candidate.textContent.includes(substring));
    if (!element) return { error: 'missing element' };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      let start = -1;
      for (let index = 0; index < occurrence; index++) {
        start = node.textContent.indexOf(substring, start + 1);
        if (start < 0) break;
      }
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + substring.length);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const text = selection.toString();
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 49 }));
      return { text };
    }
    return { error: 'missing substring' };
  }, { selector, substring, occurrence });
  assert.equal(selected.text, substring, JSON.stringify(selected));
  await page.locator('#selectionSaveExcerpt').waitFor({ state: 'visible' });
}
async function waitStored(page, id, predicate) {
  await page.waitForFunction(({ id, predicate }) => {
    const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id);
    const clips = ch && ch.readingExcerpts;
    if (!clips) return false;
    if (predicate.kind === 'length') return clips.items.length === predicate.value;
    if (predicate.kind === 'note') return clips.items.some(item => item.id === predicate.itemId && item.note === predicate.value);
    return false;
  }, { id, predicate });
}
function watchAi(context, found) {
  context.on('request', request => {
    const url = request.url();
    if (/(?:api\.openai\.com|api\.anthropic\.com|api\.deepseek\.com|generativelanguage\.googleapis\.com|\/v1\/(?:chat\/completions|responses|messages)|\/api\/(?:ai|chat|generate))/i.test(url)
      || request.method() !== 'GET' && new URL(url).origin !== base) found.push(url);
  });
}
async function openPaper(page, id) {
  await page.locator('[data-view="libraryPage"]').first().click();
  await page.locator('#libraryPage').waitFor({ state: 'visible' });
  await page.locator('[data-continue-paper="' + id + '"]').click();
  await page.waitForFunction(paperId => !document.getElementById('readerPage').classList.contains('hidden')
    && localStorage.getItem('readingRoom.lastOpen.v1') === paperId, id);
  await page.waitForFunction(() => document.body.classList.contains('zen'));
  await page.locator('#zenExit').click();
}
async function pdfReady(page, n) {
  await page.waitForFunction(pageNumber => {
    const holder = document.querySelector('.pdf-page[data-page="' + pageNumber + '"]');
    return holder && holder.querySelector('canvas')?.width > 0
      && document.getElementById('pdfFrame').dataset.pagedReady === 'true';
  }, n);
}
async function openMobileNotes(page) {
  const button = await page.locator('#mNotes').isVisible() ? page.locator('#mNotes') : page.locator('#touchNotes');
  assert.equal(await button.isVisible(), true, 'mobile Notes action is visibly available');
  await button.click();
  await page.waitForFunction(() => document.getElementById('notebook').classList.contains('sheet-open'));
}
async function closeOpenSheet(page) {
  if (!await page.locator('#notebook').evaluate(el => el.classList.contains('sheet-open'))) return;
  const close = page.locator('#sheetClose');
  assert.equal(await close.isVisible(), true, 'open notebook has a visible close control');
  await close.click();
  await page.waitForFunction(() => !document.getElementById('notebook').classList.contains('sheet-open'));
}
async function checkDraftProtection(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(base + '/excerpt-view-fixture');
    await page.waitForFunction(() => !!window.PhloemExcerptView);
    await page.evaluate(() => {
      const item = { id: 'clip-1', quote: 'Fixed source', note: 'Stored original', anchor: { kind: 'text', para: 0 }, createdAt: 1, updatedAt: 1 };
      window.__clipFixture = { id: 'paper-a', epoch: 1, items: [item], unavailable: false,
        updateCalls: 0, failWrites: true };
      window.__clipView = window.PhloemExcerptView.create({
        context: () => window.__clipFixture,
        addNote: () => null,
        updateNote: () => { window.__clipFixture.updateCalls++; return !window.__clipFixture.failWrites; },
        remove: () => false,
        goToSource: () => false,
        returnToReading: () => false
      });
      window.__clipView.render();
    });
    const live = page.locator('.excerpt-card:not(.excerpt-orphan) textarea.excerpt-note');
    await live.fill('Unsaved draft before switch');
    assert.equal(await page.evaluate(() => window.__clipView.hasDrafts()), true,
      'a failed write is recognized as an active unsaved draft');
    await page.evaluate(() => {
      window.__clipView.reset();
      window.__clipFixture.id = 'paper-b'; window.__clipFixture.epoch = 2; window.__clipFixture.items = [];
      window.__clipView.render();
      window.__clipFixture.id = 'paper-a'; window.__clipFixture.epoch = 3;
      window.__clipFixture.items = [{ id: 'clip-1', quote: 'Fixed source', note: 'Stored original',
        anchor: { kind: 'text', para: 0 }, createdAt: 1, updatedAt: 1 }];
      window.__clipView.render();
    });
    const orphan = page.locator('.excerpt-card.excerpt-orphan');
    assert.equal(await orphan.count(), 1, 'failed draft survives reset and paper switch');
    assert.equal(await orphan.locator('textarea.excerpt-note').inputValue(), 'Unsaved draft before switch');
    assert.equal(await orphan.locator('textarea.excerpt-note').getAttribute('readonly'), '',
      'orphan draft is read only');
    assert.equal(await page.locator('.excerpt-card:not(.excerpt-orphan) textarea.excerpt-note').inputValue(), 'Stored original',
      'canonical saved card stays separate');
    page.on('dialog', dialog => dialog.accept());
    await orphan.locator('.excerpt-remove').click();
    assert.equal(await orphan.count(), 0, 'draft can be dismissed explicitly');
    assert.equal(await page.evaluate(() => window.__clipView.hasDrafts()), false);
    await live.focus();
    await page.evaluate(() => {
      window.__clipFixture.items = [{ id: 'clip-1', quote: 'Fixed source', note: 'Updated elsewhere',
        anchor: { kind: 'text', para: 0 }, createdAt: 1, updatedAt: 2 }];
      window.__clipView.render();
    });
    const conflict = page.locator('.excerpt-card.excerpt-orphan');
    assert.equal(await conflict.count(), 1, 'focused stale editor becomes a separate draft');
    assert.equal(await conflict.locator('textarea.excerpt-note').inputValue(), 'Stored original');
    assert.equal(await conflict.locator('textarea.excerpt-note').getAttribute('readonly'), '');
    assert.equal(await live.inputValue(), 'Updated elsewhere', 'new saved card shows external note');
    const calls = await page.evaluate(() => window.__clipFixture.updateCalls);
    await conflict.locator('textarea.excerpt-note').dispatchEvent('input');
    assert.equal(await page.evaluate(() => window.__clipFixture.updateCalls), calls,
      'read only orphan cannot update the saved note');

    const warningPage = await context.newPage();
    await warningPage.goto(base + '/excerpt-view-fixture');
    await warningPage.waitForFunction(() => !!window.PhloemExcerptView);
    const warning = 'Not confirmed saved. Keep this page open; check the storage warning before leaving.';
    await warningPage.evaluate(message => {
      window.__warningState = { id: 'paper-warning', epoch: 1, items: [], unavailable: false };
      window.__warningView = window.PhloemExcerptView.create({
        context: () => window.__warningState,
        addNote: () => {
          window.__warningState.items.push({ id: 'note-2', quote: '', note: '',
            anchor: { kind: 'text', para: 0 }, createdAt: 2, updatedAt: 2 });
          document.getElementById('excerptStatus').textContent = message;
          return 'note-2';
        },
        updateNote: () => false,
        remove: () => false,
        goToSource: () => false,
        returnToReading: () => false
      });
      window.__warningView.render();
    }, warning);
    await warningPage.locator('#newExcerptNote').click();
    await warningPage.locator('.excerpt-card[data-excerpt-id="note-2"]').waitFor({ state: 'visible' });
    assert.equal(await warningPage.locator('#excerptStatus').textContent(), warning,
      'new note keeps the persistence warning from its adapter');
    assert.equal(await warningPage.locator('.excerpt-card[data-excerpt-id="note-2"] textarea.excerpt-note')
      .evaluate(input => document.activeElement === input), true,
    'the new note still opens its editor');
  } finally { await context.close(); }
}

(async () => {
  await new Promise((resolve, reject) => {
    const onError = error => {
      if (error.code !== 'EADDRINUSE') { reject(error); return; }
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    };
    server.once('error', onError);
    server.listen(PORT, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
  base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = BROWSER === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[BROWSER].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    const requests = [], errors = [];
    watchAi(context, requests);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seedTextPapers);
    await page.goto(base + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden')
      && document.querySelectorAll('#textDocument .original').length === 2);
    assert.equal(await page.locator('#excerptsTab').count(), 1, 'Clips tab is in the existing notebook');
    await selectText(page, '.original[data-para-index="1"]', QUOTE, 2);
    await page.locator('#selectionSaveExcerpt').click();
    await waitStored(page, 'clip-a', { kind: 'length', value: 1 });
    assert.equal(await page.locator('#excerptsPanel').isVisible(), true, 'save opens Clips');
    let saved = await chapter(page, 'clip-a');
    const clip = saved.readingExcerpts.items[0];
    assert.equal(saved.readingExcerpts.version, 1);
    assert.equal(clip.quote, QUOTE, 'full quote is saved');
    assert.equal(clip.anchor.kind, 'text');
    assert.equal(clip.anchor.para, 1);
    assert.equal(clip.note, '');
    assert(Number.isFinite(clip.createdAt) && Number.isFinite(clip.updatedAt));
    assert.equal((saved.textHighlights || []).length, 0, 'clip does not create a highlight');
    assert.equal(Object.values(saved.highlights || {}).flat().length, 0);
    assert.equal((saved.questions || []).length, 0, 'clip does not enter AI questions');
    const card = page.locator('.excerpt-card[data-excerpt-id="' + clip.id + '"]');
    assert.equal(await card.locator('.excerpt-quote').textContent(), QUOTE, 'quote is displayed in full');
    assert.equal(await card.locator('script').count(), 0, 'quote renders as safe text');
    assert.equal(await card.locator('.excerpt-quote textarea, .excerpt-quote [contenteditable]').count(), 0,
      'saved quote is immutable');
    const note = 'First thought\nSecond thought <img src=x onerror=alert(1)>';
    await card.locator('textarea.excerpt-note').fill(note);
    await waitStored(page, 'clip-a', { kind: 'note', itemId: clip.id, value: note });
    await page.screenshot({ path: '/tmp/phloem-excerpts-' + BROWSER + '-desktop.png' });
    await page.locator('#newExcerptNote').click();
    await waitStored(page, 'clip-a', { kind: 'length', value: 2 });
    saved = await chapter(page, 'clip-a');
    const free = saved.readingExcerpts.items.find(item => item.id !== clip.id);
    assert.equal(free.quote, '', 'standalone note has no quote');
    assert.equal(free.anchor.kind, 'text');
    assert.equal(await card.locator('textarea.excerpt-note').inputValue(), note,
      'creating a standalone note leaves the clipped note intact');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
    await page.waitForFunction(() => document.body.classList.contains('zen'));
    await page.locator('#zenExit').click();
    if (!await page.locator('#excerptsTab').isVisible()) await page.locator('#notebookReopen').click();
    await page.locator('#excerptsTab').click();
    assert.equal(await page.locator('.excerpt-card[data-excerpt-id="' + clip.id + '"] textarea.excerpt-note').inputValue(), note,
      'line breaks and literal markup survive reload');
    assert.equal(await page.locator('.excerpt-card script, .excerpt-card img').count(), 0,
      'note markup remains inert');
    await page.locator('.excerpt-card[data-excerpt-id="' + clip.id + '"] .excerpt-source').click();
    await page.locator('.excerpt-source-cue-layer[data-excerpt-id="' + clip.id + '"][data-source-para="1"] .excerpt-source-cue').first().waitFor({ state: 'visible' });
    const textCue = await page.evaluate(quote => {
      const root = document.querySelector('.original[data-para-index="1"]');
      const cue = document.querySelector('.excerpt-source-cue-layer[data-source-para="1"] .excerpt-source-cue');
      const node = [...root.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.includes(quote));
      if (!node || !cue) return null;
      const first = document.createRange(), second = document.createRange();
      first.setStart(node, node.textContent.indexOf(quote)); first.setEnd(node, node.textContent.indexOf(quote) + 12);
      second.setStart(node, node.textContent.lastIndexOf(quote)); second.setEnd(node, node.textContent.lastIndexOf(quote) + 12);
      return { cueTop: cue.getBoundingClientRect().top, firstTop: first.getBoundingClientRect().top,
        secondTop: second.getBoundingClientRect().top, cueText: cue.textContent };
    }, QUOTE);
    assert(textCue && Math.abs(textCue.cueTop - textCue.secondTop) < 8
      && textCue.secondTop > textCue.firstTop + 8, 'source cue selects the saved second occurrence: ' + JSON.stringify(textCue));
    assert.equal((await chapter(page, 'clip-a')).textHighlights.length, 0, 'temporary cue creates no saved text highlight');
    await page.locator('#excerptReturnChip').click();
    await page.waitForFunction(() => !document.querySelector('.excerpt-source-cue-layer'));
    assert.equal((await chapter(page, 'clip-a')).textHighlights.length, 0, 'return clears the cue without saving a highlight');
    await openPaper(page, 'clip-b');
    if (!await page.locator('#excerptsTab').isVisible()) await page.locator('#notebookReopen').click();
    await page.locator('#excerptsTab').click();
    assert.equal(await page.locator('.excerpt-card').count(), 0, 'Clips are isolated by document');
    await openPaper(page, 'clip-a');
    if (!await page.locator('#excerptsTab').isVisible()) await page.locator('#notebookReopen').click();
    await page.locator('#excerptsTab').click();
    assert.equal(await page.locator('.excerpt-card').count(), 2, 'original paper keeps its Clips');
    let asked = 0;
    page.on('dialog', async dialog => {
      asked++;
      if (asked === 1) await dialog.dismiss();
      else await dialog.accept();
    });
    await page.locator('.excerpt-card[data-excerpt-id="' + clip.id + '"] .excerpt-remove').click();
    assert.equal((await chapter(page, 'clip-a')).readingExcerpts.items.length, 2, 'cancel keeps clip');
    await page.locator('.excerpt-card[data-excerpt-id="' + clip.id + '"] .excerpt-remove').click();
    saved = await chapter(page, 'clip-a');
    assert.equal(saved.readingExcerpts.items.length, 1, 'confirmed removal drops clip');
    assert(saved.readingExcerpts.deleted[clip.id], 'confirmed removal records a tombstone');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('zen'));
    await page.locator('#zenExit').click();
    if (!await page.locator('#excerptsTab').isVisible()) await page.locator('#notebookReopen').click();
    await page.locator('#excerptsTab').click();
    assert.equal(await page.locator('.excerpt-card[data-excerpt-id="' + clip.id + '"]').count(), 0,
      'deleted clip stays deleted after reload');
    assert.deepEqual(errors, [], 'text flow has no page errors');
    assert.deepEqual(requests, [], 'text Clips do not send AI or other write requests');

    const pdfContext = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const pdfRequests = [], pdfErrors = [];
    watchAi(pdfContext, pdfRequests);
    const pdfPage = await pdfContext.newPage();
    pdfPage.setDefaultTimeout(25000);
    pdfPage.on('pageerror', error => pdfErrors.push(error.message));
    await pdfPage.addInitScript(seedTextPapers);
    await pdfPage.addInitScript(() => localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page' })));
    await pdfPage.goto(base + '/reading.html', { waitUntil: 'load' });
    await pdfPage.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
    await pdfPage.locator('#pdfFile').setInputFiles({ name: 'clips-generated.pdf', mimeType: 'application/pdf', buffer: await makePdf() });
    await pdfReady(pdfPage, 1);
    await pdfPage.waitForFunction(() => document.body.classList.contains('zen'));
    await pdfPage.locator('#zenExit').click();
    await pdfPage.locator('#nextPage').click();
    await pdfReady(pdfPage, 2);
    await pdfPage.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="2"].book-active'));
    await pdfPage.waitForFunction(() => Array.from(document.querySelectorAll('.pdf-page[data-page="2"] .text-layer span'))
      .some(span => span.textContent.includes('Clips fixture page 2')));
    await pdfPage.waitForFunction(() => !document.getElementById('documentPane').classList.contains('turning-book-leaf'));
    await selectText(pdfPage, '.pdf-page[data-page="2"] .text-layer span', 'Clips fixture page 2');
    await pdfPage.locator('#selectionSaveExcerpt').click();
    const pdf = await currentChapter(pdfPage);
    assert.equal(pdf.kind, 'pdf');
    assert.equal(pdf.readingExcerpts.items.length, 1);
    const pdfClip = pdf.readingExcerpts.items[0];
    assert.equal(pdfClip.quote, 'Clips fixture page 2');
    assert.equal(pdfClip.anchor.kind, 'pdf');
    assert.equal(pdfClip.anchor.page, 2);
    assert.equal(typeof pdfClip.sourceHash, 'string', 'PDF clip records its source fingerprint');
    assert(pdfClip.sourceHash.length > 0);
    assert.equal(Object.values(pdf.highlights || {}).flat().length, 0, 'PDF clip is not a highlight');
    await pdfPage.locator('#excerptsTab').click();
    await closeOpenSheet(pdfPage);
    await pdfPage.locator('#prevPage').click();
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"].book-active'));
    if (!await pdfPage.locator('#notebook').evaluate(el => el.classList.contains('sheet-open'))) await openMobileNotes(pdfPage);
    await pdfPage.locator('#excerptsTab').click();
    await pdfPage.locator('.excerpt-card[data-excerpt-id="' + pdfClip.id + '"] .excerpt-source').click();
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"].book-active'));
    await pdfPage.locator('.excerpt-source-cue-layer[data-excerpt-id="' + pdfClip.id + '"][data-source-page="2"] .excerpt-source-cue').first().waitFor({ state: 'visible' });
    assert.match(await pdfPage.locator('#pageNumber').textContent(), /^2\s*\//,
      'Go to source displays the PDF source page');
    assert.equal(Object.values((await currentChapter(pdfPage)).highlights || {}).flat().length, 0,
      'temporary PDF cue creates no saved highlight');
    const returnControl = pdfPage.locator('#excerptReturnChip');
    await returnControl.waitFor({ state: 'visible' });
    await pdfPage.waitForFunction(() => !document.getElementById('excerptReturnChip').disabled);
    await returnControl.click();
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"].book-active'));
    await pdfPage.waitForFunction(() => !document.querySelector('.excerpt-source-cue-layer'));
    assert.match(await pdfPage.locator('#pageNumber').textContent(), /^1\s*\//,
      'Return displays the prior reading page');
    assert.equal((await currentChapter(pdfPage)).readingExcerpts.items[0].sourceHash, pdfClip.sourceHash,
      'source and return preserve the PDF fingerprint');
    await pdfPage.setViewportSize({ width: 390, height: 844 });
    await openMobileNotes(pdfPage);
    await pdfPage.locator('#excerptsTab').click();
    const mobile = await pdfPage.evaluate(() => {
      const panel = document.getElementById('excerptsPanel').getBoundingClientRect();
      const textarea = document.querySelector('#excerptsPanel textarea.excerpt-note').getBoundingClientRect();
      return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        panelLeft: panel.left, panelRight: panel.right, fieldLeft: textarea.left, fieldRight: textarea.right };
    });
    assert(mobile.scrollWidth <= mobile.viewport + 1 && mobile.panelLeft >= -1
      && mobile.panelRight <= mobile.viewport + 1 && mobile.fieldLeft >= -1
      && mobile.fieldRight <= mobile.viewport + 1, 'mobile Clips and textarea fit: ' + JSON.stringify(mobile));
    await pdfPage.screenshot({ path: '/tmp/phloem-excerpts-' + BROWSER + '-phone.png' });
    await pdfPage.locator('.excerpt-card[data-excerpt-id="' + pdfClip.id + '"] .excerpt-source').click();
    await pdfPage.waitForFunction(() => !document.getElementById('notebook').classList.contains('sheet-open'));
    assert.equal(await pdfPage.locator('#excerptReturnChip').isVisible(), true,
      'Return to reading is reachable outside the closed mobile sheet');
    await pdfPage.locator('#excerptReturnChip').click();
    await pdfPage.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"].book-active'));
    assert.equal(await pdfPage.locator('#notebook').evaluate(el => el.classList.contains('sheet-open')), false,
      'return does not reopen the mobile sheet');
    await openMobileNotes(pdfPage);
    await pdfPage.locator('#excerptsTab').click();
    await pdfPage.locator('.excerpt-card[data-excerpt-id="' + pdfClip.id + '"] .excerpt-source').click();
    await pdfPage.setViewportSize({ width: 1180, height: 820 });
    await openPaper(pdfPage, 'clip-b');
    assert.equal(await pdfPage.locator('#excerptReturnChip').isVisible(), false,
      'switching papers invalidates stale return navigation');
    assert.deepEqual(pdfErrors, [], 'PDF flow has no page errors');
    assert.deepEqual(pdfRequests, [], 'PDF Clips do not send AI or other write requests');
    await checkDraftProtection(browser);
    console.log('PASS  Clips text/PDF persistence, isolation, source/return, removal, and mobile layout');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
