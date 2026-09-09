let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_THINKING_SEARCH_TEST_PORT || 8145);
const PAPER_TITLE = 'Tomato source-to-sink dynamics';
const HIGHLIGHT = 'Carbon allocation shifts toward developing tomato fruit.';
const HIGHLIGHT_NOTE = 'Compare this sink transition with drought conditions.';
const PAGE_NOTE = 'Revisit the steady-state caveat before using this model.';
const REVIEW_COMMENT = 'Please justify the osmotic boundary condition in this model.';
const REVIEW_RESPONSE = 'A sensitivity analysis now addresses that concern.';
const UNSAFE_NOTE = 'Literal <img src=x onerror="window.__thinkingSearchXss=1"> annotation payload.';
const SHARED_THOUGHT = 'Shared retrieval pathway should remain easy to file.';

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/* A local seven-page PDF makes the final navigation assertion exercise PDF.js and
   the real reader, while all searchable phrases live only in Phloem annotations. */
function makePdf() {
  const pageCount = 7;
  const objects = [];
  const firstPageId = 4;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + Array.from({ length: pageCount }, (_, index) => (firstPageId + index * 2) + ' 0 R').join(' ') + '] /Count ' + pageCount + ' >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let index = 0; index < pageCount; index++) {
    const pageId = firstPageId + index * 2;
    const contentId = pageId + 1;
    const stream = 'BT /F1 18 Tf 1 0 0 1 72 700 Tm (' + pdfEscape('Fixture page ' + (index + 1)) + ') Tj ET';
    objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contentId + ' 0 R >>';
    objects[contentId] = '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + '\nendstream';
  }
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, 'ascii');
    output += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(output, 'ascii');
  output += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id++) output += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  output += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(output, 'ascii');
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    if (sessionStorage.getItem('thinkingSearchFixture')) return;
    sessionStorage.setItem('thinkingSearchFixture', '1');
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
    localStorage.setItem('readingRoom.theme', 'light');
    localStorage.removeItem('readingRoom.lastOpen.v1');
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', {
    name: 'thinking-search-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf()
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return state.chapters.some(paper => paper.sourceName === 'thinking-search-fixture.pdf' && paper.pageCount === 7);
  });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && /\/ 7$/.test(document.getElementById('pageNumber').textContent));
  /* Let import/open persistence settle before replacing the in-memory fixture on
     disk; otherwise a queued save from PDF setup can win the reload race. */
  await page.waitForTimeout(800);

  const paperIds = await page.evaluate(({ title, highlight, highlightNote, pageNote, reviewComment, reviewResponse, unsafeNote, sharedThought }) => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const paper = state.chapters.find(item => item.sourceName === 'thinking-search-fixture.pdf');
    const stamp = Date.now() + 120000;
    paper.title = title;
    paper.authors = 'Mina Calder';
    paper.category = 'Metabolism';
    paper.readPage = 2;
    paper.readThroughPage = 2;
    paper.highlights = {
      6: [{ id: 'thinking-highlight', text: highlight, note: highlightNote, color: 'yellow', rects: [], at: stamp - 2000 }]
    };
    paper.pageNotes = { 2: sharedThought, 3: unsafeNote, 4: pageNote };
    paper.notes = {};
    paper.readerNotes = {};
    paper.textHighlights = [];
    paper.readerHighlights = [];
    paper.reviewComments = [{
      id: 'thinking-review', author: 'Reviewer Delta', text: reviewComment, response: reviewResponse,
      page: 5, level: 'specific', topic: 'modeling', anchors: [], pdfAnchors: [],
      addedAt: stamp - 4000, updatedAt: stamp - 3000, resolved: false
    }];
    paper.updatedAt = stamp;
    const textPaper = (id, paperTitle, category, note, age) => ({
      id, kind: 'text', title: paperTitle, authors: 'Field Reader', category,
      fr: 'A compact paper used to exercise library search management.',
      notes: {}, readerNotes: {}, pageNotes: note ? { document: note } : {},
      highlights: {}, textHighlights: [], readerHighlights: [], questions: [], reviewComments: [], tags: [],
      addedAt: stamp - age - 10000, updatedAt: stamp - age, readPage: 1
    });
    const alpha = textPaper('thinking-alpha', 'Alpha allocation notebook', 'Metabolism', sharedThought, 3000);
    const zeta = textPaper('thinking-zeta', 'Zeta field notebook', 'Ecology', sharedThought, 1000);
    const keeper = textPaper('thinking-keeper', 'Metabolism background', 'Metabolism', '', 5000);
    const archive = textPaper('thinking-archive', 'Archived reference', 'Archive', '', 7000);
    state.chapters = [paper, alpha, zeta, keeper, archive];
    state.savedAt = stamp;
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
    localStorage.removeItem('readingRoom.lastOpen.v1');
    localStorage.removeItem('readingRoom.libraryView');
    return { pdf: paper.id, alpha: alpha.id, zeta: zeta.id };
  }, {
    title: PAPER_TITLE, highlight: HIGHLIGHT, highlightNote: HIGHLIGHT_NOTE, pageNote: PAGE_NOTE,
    reviewComment: REVIEW_COMMENT, reviewResponse: REVIEW_RESPONSE, unsafeNote: UNSAFE_NOTE,
    sharedThought: SHARED_THOUGHT
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return !document.getElementById('libraryPage').classList.contains('hidden') && state.chapters.length === 5;
  });

  const wallButton = page.locator('#libraryViewToggle [data-library-view="wall"]');
  const listButton = page.locator('#libraryViewToggle [data-library-view="list"]');
  await listButton.click();
  await page.waitForSelector('.library-list-row');

  await page.fill('#librarySearch', 'Mina Calder');
  await page.waitForSelector('.library-thinking-hit[data-thinking-type="Paper details"]');
  let legacyHit = page.locator('.library-thinking-hit[data-thinking-type="Paper details"]');
  check('search still finds existing paper metadata',
    await legacyHit.count() === 1
      && await legacyHit.evaluate(element => element.classList.contains('is-paper-match'))
      && await legacyHit.locator('.library-thinking-paper').textContent() === PAPER_TITLE);

  await page.fill('#librarySearch', 'osmotic boundary condition');
  await page.waitForSelector('.library-thinking-hit[data-thinking-type="Reviewer work"]');
  legacyHit = page.locator('.library-thinking-hit[data-thinking-type="Reviewer work"]');
  check('search still finds reviewer text and its revision response',
    (await legacyHit.locator('.library-thinking-excerpt').textContent()).includes(REVIEW_COMMENT)
      && (await legacyHit.locator('.library-thinking-note').textContent()).includes(REVIEW_RESPONSE)
      && await legacyHit.locator('.library-thinking-open').textContent() === 'Open on page 5');
  await legacyHit.locator('.library-thinking-open').click();
  await page.waitForFunction(() => {
    const card = document.querySelector('#readerReviewList [data-review-card="thinking-review"]');
    return !document.getElementById('readerPage').classList.contains('hidden')
      && !document.getElementById('reviewsPanel').classList.contains('hidden')
      && card?.classList.contains('focused')
      && document.getElementById('pageNumber').textContent.startsWith('5 / 7');
  });
  check('opening a reviewer hit focuses that exact comment and page', true);
  await page.click('#readerBack');
  await page.waitForFunction(() => !document.getElementById('libraryPage').classList.contains('hidden') && document.querySelector('.library-thinking-hit[data-thinking-type="Reviewer work"]'));

  await page.fill('#librarySearch', '');
  await page.waitForSelector('.library-list-row');
  check('clearing search restores the prior List preference',
    await listButton.getAttribute('aria-pressed') === 'true'
      && await page.locator('.library-list-row').count() === 5
      && await page.locator('.library-thinking-results').count() === 0);

  await page.selectOption('#librarySort', 'title');
  await page.locator('[data-library-category="Metabolism"]').click();
  await page.fill('#librarySearch', 'shared retrieval pathway');
  await page.waitForFunction(expected => {
    const groups = Array.from(document.querySelectorAll('.library-thinking-group'));
    return groups.map(group => group.querySelector('h3')?.textContent).join('|') === expected;
  }, 'Alpha allocation notebook|' + PAPER_TITLE);
  check('search keeps the active List category filter',
    await page.locator('[data-library-category="Metabolism"]').getAttribute('aria-pressed') === 'true'
      && await page.locator('.library-thinking-group').count() === 2);
  check('filtered search groups respect the visible title sort',
    await page.locator('#librarySort').inputValue() === 'title'
      && await page.locator('.library-thinking-group h3').evaluateAll(elements => elements.map(element => element.textContent).join('|')) === 'Alpha allocation notebook|' + PAPER_TITLE);

  let alphaSelect = page.locator('.library-thinking-group[data-thinking-group="' + paperIds.alpha + '"] .library-thinking-select');
  await alphaSelect.check();
  await page.waitForSelector('.library-list-bulkbar');
  check('each matching paper can be selected independently',
    await page.locator('.library-thinking-select:checked').count() === 1
      && (await page.locator('.library-list-selected-count').textContent()).includes('1 selected')
      && await alphaSelect.evaluate(element => document.activeElement === element));
  await page.locator('.library-list-bulk-clear').click();
  await page.waitForFunction(() => document.querySelectorAll('.library-thinking-select:checked').length === 0);

  const selectAllResults = page.locator('.library-thinking-select-all');
  await selectAllResults.check();
  await page.waitForFunction(() => document.querySelectorAll('.library-thinking-select:checked').length === 2);
  check('select-all chooses only the two visible category results',
    await page.locator('.library-thinking-select:checked').count() === 2
      && (await page.locator('.library-list-selected-count').textContent()).includes('2 selected'));
  await page.locator('.library-list-bulk-move summary').click();
  await page.locator('.library-list-bulk-category[data-bulk-category="Archive"]').click();
  await page.waitForSelector('.library-thinking-empty');
  check('bulk Move files every selected search result while retaining the category filter',
    await page.locator('[data-library-category="Metabolism"]').getAttribute('aria-pressed') === 'true'
      && await page.evaluate(ids => {
        const papers = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters;
        return [ids.pdf, ids.alpha].every(id => papers.find(paper => paper.id === id)?.category === 'Archive');
      }, paperIds));

  await page.locator('[data-library-category="all"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.library-thinking-group').length === 3);
  check('All restores matching papers in the selected title order after a move',
    await page.locator('.library-thinking-group h3').evaluateAll(elements => elements.map(element => element.textContent).join('|'))
      === 'Alpha allocation notebook|' + PAPER_TITLE + '|Zeta field notebook');

  const zetaSelect = page.locator('.library-thinking-group[data-thinking-group="' + paperIds.zeta + '"] .library-thinking-select');
  await zetaSelect.check();
  page.once('dialog', dialog => dialog.accept('Priority review'));
  await page.locator('.library-list-bulk-new').click();
  await page.waitForFunction(id => {
    const paper = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
    return paper?.category === 'Priority review' && !document.querySelector('.library-list-bulkbar');
  }, paperIds.zeta);
  check('New category files a per-paper search selection and clears the bulk state',
    await page.locator('.library-thinking-select:checked').count() === 0
      && await page.locator('.library-list-bulkbar').count() === 0);

  await page.fill('#librarySearch', '');
  await page.waitForFunction(() => document.querySelectorAll('.library-list-row').length === 5);

  await wallButton.click();
  await page.waitForSelector('.bookcase');
  await page.fill('#librarySearch', 'annotation payload');
  await page.waitForSelector('.library-thinking-hit[data-thinking-type="Page note"]');
  const unsafeHit = page.locator('.library-thinking-hit[data-thinking-type="Page note"]');
  await page.waitForTimeout(50);
  check('user annotation HTML is rendered as text instead of live markup',
    (await unsafeHit.locator('.library-thinking-note').textContent()).includes(UNSAFE_NOTE)
      && await unsafeHit.locator('.library-thinking-note img, .library-thinking-note script').count() === 0
      && await page.evaluate(() => window.__thinkingSearchXss) === undefined);
  await page.fill('#librarySearch', '');
  await page.waitForSelector('.bookcase');
  check('clearing search also restores the prior Wall preference',
    await wallButton.getAttribute('aria-pressed') === 'true'
      && await page.locator('.bookcase').count() === 1
      && await page.locator('.library-thinking-results').count() === 0);

  await page.fill('#librarySearch', 'steady-state caveat');
  await page.waitForSelector('.library-thinking-results');
  let hits = page.locator('.library-thinking-hit');
  let hit = page.locator('.library-thinking-hit[data-thinking-paper="' + paperIds.pdf + '"]');
  check('a phrase found only in an ordinary page note returns one annotation result', await hits.count() === 1 && await hit.count() === 1);
  check('a note-only result keeps its paper title', await hit.locator('.library-thinking-paper').textContent() === PAPER_TITLE);
  check('a note-only result shows the matching thought', (await hit.locator('.library-thinking-note').textContent()).includes(PAGE_NOTE));
  check('a note-only result retains its PDF location', await hit.locator('.library-thinking-open').textContent() === 'Open on page 4');

  await page.fill('#librarySearch', 'carbon allocation');
  await page.waitForFunction(expected => {
    const excerpt = document.querySelector('.library-thinking-excerpt');
    return excerpt && excerpt.textContent.includes(expected);
  }, HIGHLIGHT);
  hits = page.locator('.library-thinking-hit');
  hit = page.locator('.library-thinking-hit[data-thinking-paper="' + paperIds.pdf + '"]');
  check('a phrase found only in a highlighted passage returns one annotation result', await hits.count() === 1 && await hit.count() === 1);
  check('the highlight result identifies its paper', await hit.locator('.library-thinking-paper').textContent() === PAPER_TITLE);
  check('the result shows the highlighted excerpt', (await hit.locator('.library-thinking-excerpt').textContent()).includes(HIGHLIGHT));
  check('the result keeps the note attached to that highlight', (await hit.locator('.library-thinking-note').textContent()).includes(HIGHLIGHT_NOTE));
  check('the result offers an explicit page action', await hit.locator('.library-thinking-open').textContent() === 'Open on page 6');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobile = await page.evaluate(() => {
    const results = document.querySelector('.library-thinking-results');
    const hit = document.querySelector('.library-thinking-hit');
    const open = document.querySelector('.library-thinking-open');
    const hitBox = hit && hit.getBoundingClientRect();
    const openBox = open && open.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      resultsOverflow: results ? results.scrollWidth - results.clientWidth : 999,
      hitLeft: hitBox && hitBox.left,
      hitRight: hitBox && hitBox.right,
      openLeft: openBox && openBox.left,
      openRight: openBox && openBox.right,
      openHeight: openBox && openBox.height
    };
  });
  check('390px thinking results fit without horizontal overflow',
    mobile.documentOverflow <= 1
      && mobile.resultsOverflow <= 1
      && mobile.hitLeft >= 0
      && mobile.hitRight <= 391
      && mobile.openLeft >= 0
      && mobile.openRight <= 391,
    JSON.stringify(mobile));
  check('the mobile Open action keeps a 44px touch target', mobile.openHeight >= 44, mobile.openHeight);

  await page.setViewportSize({ width: 1280, height: 900 });
  await hit.locator('.library-thinking-open').click();
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.getElementById('pageNumber').textContent.startsWith('6 / 7'));
  check('opening the search hit lands on the annotated PDF page', await page.locator('#pageNumber').textContent() === '6 / 7');
  check('thinking search creates no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
