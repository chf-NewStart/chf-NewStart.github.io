let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_PDF_CONTINUITY_TEST_PORT || 8151);

async function makeTwoColumnPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.setTitle('Two-column continuity fixture');
  for (let pageNumber = 1; pageNumber <= 6; pageNumber++) {
    const page = document.addPage([612, 792]);
    page.drawText('Continuity fixture · page ' + pageNumber, { x: 48, y: 748, size: 14, font, color: rgb(.12, .16, .14) });
    for (let line = 0; line < 12; line++) {
      const y = 700 - line * 34;
      page.drawText('Left column passage ' + (line + 1) + ' keeps its reading place.', { x: 48, y, size: 10, font });
      /* A small baseline offset keeps PDF.js from coalescing the two independently
         drawn strings into one synthetic full-width line. */
      page.drawText('Right column passage ' + (line + 1) + ' keeps its reading place.', { x: 326, y: y - 12, size: 10, font });
    }
  }
  return Buffer.from(await document.save());
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css'
          : file.endsWith('.pdf') ? 'application/pdf'
            : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

function seedReader() {
  if (sessionStorage.getItem('phloem.pdfContinuityFixtureSeeded') === '1') return;
  sessionStorage.setItem('phloem.pdfContinuityFixtureSeeded', '1');
  /* A present-but-empty library suppresses the first-run sample seed. This test imports
     that same sample deliberately so it owns the timing and the IndexedDB record. */
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    size: 100, measure: 780, leading: 1.7, typeface: 'book', airy: false,
    focus: false, guide: 'yellow', guideOrientation: 'row', pdfLayout: 'scroll',
    guideScope: 'page', guideSize: 'm', guideDim: 55, guideX: .72,
    guideY: .38, guideLock: false, tone: 'cream', driftSpeed: 4
  }));
  localStorage.setItem('readingRoom.theme', 'light');
  localStorage.setItem('readingRoom.paperAppearance.v1', 'cream');
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}

async function waitForDurablePdf(page, id) {
  await page.waitForFunction(async paperId => {
    try {
      return await new Promise(resolve => {
        const request = indexedDB.open('marginFiles', 2);
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const database = request.result;
          const get = database.transaction('pdfs').objectStore('pdfs').get(paperId);
          get.onerror = () => { database.close(); resolve(false); };
          get.onsuccess = () => { const found = !!get.result; database.close(); resolve(found); };
        };
      });
    } catch (error) { return false; }
  }, id);
}

async function waitForReader(page, pageNumber) {
  await page.waitForFunction(expectedPage => {
    const reader = document.getElementById('readerPage');
    const counter = document.getElementById('pageNumber');
    const holder = document.querySelector('.pdf-page[data-page="' + expectedPage + '"]');
    const canvas = holder && holder.querySelector('canvas');
    return reader && !reader.classList.contains('hidden')
      && counter && counter.textContent.trim().startsWith(expectedPage + ' /')
      && canvas && canvas.width > 0;
  }, pageNumber);
}

async function storedChapter(page, id) {
  return page.evaluate(paperId => {
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return saved.chapters.find(chapter => chapter.id === paperId);
  }, id);
}

/* The production cursor uses this exact visual point: horizontal center and 40% down
   the reading pane in Scroll view. Expressing it inside the paper makes the comparison
   independent of CSS pixels, device scale factor, and viewport size. */
async function pdfRelativeAnchor(page) {
  return page.evaluate(() => {
    const pane = document.getElementById('documentPane');
    const paneRect = pane.getBoundingClientRect();
    const clientX = paneRect.left + pane.clientWidth * .5;
    const clientY = paneRect.top + pane.clientHeight * .4;
    const holders = Array.from(document.querySelectorAll('.pdf-page'));
    let holder = holders.find(candidate => {
      const rect = candidate.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!holder) {
      holder = holders.reduce((best, candidate) => {
        const rect = candidate.getBoundingClientRect();
        const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
        return !best || distance < best.distance ? { candidate, distance } : best;
      }, null);
      holder = holder && holder.candidate;
    }
    const rect = holder && holder.getBoundingClientRect();
    return {
      page: holder ? +holder.dataset.page : 0,
      x: rect && rect.width ? (clientX - rect.left) / rect.width : NaN,
      y: rect && rect.height ? (clientY - rect.top) / rect.height : NaN,
      paperWidth: rect ? rect.width : 0,
      paperHeight: rect ? rect.height : 0,
      paneWidth: pane.clientWidth,
      paneHeight: pane.clientHeight
    };
  });
}

function samePdfRelativeAnchor(before, after, tolerance) {
  return before.page === after.page
    && Number.isFinite(before.x) && Number.isFinite(before.y)
    && Number.isFinite(after.x) && Number.isFinite(after.y)
    && Math.abs(before.x - after.x) <= tolerance
    && Math.abs(before.y - after.y) <= tolerance;
}

function samePdfVerticalAnchor(before, after, tolerance) {
  return before.page === after.page && Number.isFinite(before.y) && Number.isFinite(after.y)
    && Math.abs(before.y - after.y) <= tolerance;
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seedReader);

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', { name: 'two-column-continuity.pdf', mimeType: 'application/pdf', buffer: await makeTwoColumnPdf() });
  await page.waitForFunction(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    return id && saved.chapters.some(chapter => chapter.id === id && chapter.kind === 'pdf')
      && canvas && canvas.width > 0
      && !document.getElementById('readerPage').classList.contains('hidden');
  });
  const paperId = await page.evaluate(() => localStorage.getItem('readingRoom.lastOpen.v1'));
  await waitForDurablePdf(page, paperId);

  const counterState = await page.locator('#pageNumber').evaluate(counter => ({
    tag: counter.tagName,
    type: counter.getAttribute('type'),
    tabIndex: counter.tabIndex,
    label: counter.getAttribute('aria-label') || '',
    visible: !!(counter.offsetWidth || counter.offsetHeight || counter.getClientRects().length)
  }));
  await page.locator('#pageNumber').focus();
  const counterFocused = await page.evaluate(() => document.activeElement === document.getElementById('pageNumber'));
  check('the page counter is a visible, focusable jump button', counterState.tag === 'BUTTON'
    && counterState.type === 'button' && counterState.tabIndex >= 0 && counterState.visible
    && /jump/i.test(counterState.label) && counterFocused, JSON.stringify(counterState));
  const jumpDialog = page.waitForEvent('dialog').then(async dialog => {
    const details = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
    return details;
  });
  await page.locator('#pageNumber').press('Enter');
  const jumpDetails = await jumpDialog;
  check('keyboard activation opens the page jump prompt', jumpDetails.type === 'prompt' && /go to page/i.test(jumpDetails.message), JSON.stringify(jumpDetails));

  const initialSurfaces = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'light',
    paper: document.getElementById('pdfFrame').dataset.paperAppearance
  }));
  check('the fixture begins with a light interface and cream paper', initialSurfaces.theme === 'light' && initialSurfaces.paper === 'cream', JSON.stringify(initialSurfaces));
  await page.click('#themeBtn');
  const darkCream = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'light',
    paper: document.getElementById('pdfFrame').dataset.paperAppearance
  }));
  check('changing the interface theme leaves the paper appearance alone', darkCream.theme === 'dark' && darkCream.paper === 'cream', JSON.stringify(darkCream));

  await page.click('#comfortBtn');
  await page.locator('[data-paper-appearance="inverted"]').click();
  const darkInverted = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'light',
    paper: document.getElementById('pdfFrame').dataset.paperAppearance
  }));
  check('changing paper appearance leaves the dark interface alone', darkInverted.theme === 'dark' && darkInverted.paper === 'inverted', JSON.stringify(darkInverted));
  await page.click('#comfortBtn');
  await page.click('#themeBtn');
  const lightInverted = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'light',
    paper: document.getElementById('pdfFrame').dataset.paperAppearance
  }));
  check('returning the interface to light does not reset inverted paper', lightInverted.theme === 'light' && lightInverted.paper === 'inverted', JSON.stringify(lightInverted));
  await page.click('#themeBtn');
  check('theme and paper choices are stored under independent keys', await page.evaluate(() => {
    return localStorage.getItem('readingRoom.theme') === 'dark'
      && localStorage.getItem('readingRoom.paperAppearance.v1') === 'inverted';
  }));

  const chapterBeforeCursorSave = await storedChapter(page, paperId);
  await page.evaluate(() => {
    const pane = document.getElementById('documentPane');
    const holder = document.querySelector('.pdf-page[data-page="3"]');
    pane.scrollTop = Math.max(0, holder.offsetTop + holder.offsetHeight * .62 - pane.clientHeight * .4);
    pane.dispatchEvent(new Event('scroll'));
  });
  await waitForReader(page, 3);
  /* Page 3 now has a real PDF.js viewport. Place the anchor once more so the saved
     cursor must include authored-PDF coordinates, not just a page number. */
  await page.evaluate(() => {
    const pane = document.getElementById('documentPane');
    const holder = document.querySelector('.pdf-page[data-page="3"]');
    pane.scrollTop = Math.max(0, holder.offsetTop + holder.offsetHeight * .62 - pane.clientHeight * .4);
    pane.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(paperId => {
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = saved.chapters.find(candidate => candidate.id === paperId);
    const position = chapter && chapter.pdfPosition;
    return position && position.page === 3
      && Number.isFinite(position.pdfX) && Number.isFinite(position.pdfY)
      && Number.isFinite(position.x) && Number.isFinite(position.y);
  }, paperId);
  const chapterAfterCursorSave = await storedChapter(page, paperId);
  check('PDF cursor saves finite PDF and page-relative coordinates', chapterAfterCursorSave.pdfPosition.page === 3
    && Number.isFinite(chapterAfterCursorSave.pdfPosition.pdfX)
    && Number.isFinite(chapterAfterCursorSave.pdfPosition.pdfY)
    && Number.isFinite(chapterAfterCursorSave.pdfPosition.x)
    && Number.isFinite(chapterAfterCursorSave.pdfPosition.y), JSON.stringify(chapterAfterCursorSave.pdfPosition));
  check('saving only the PDF cursor does not change the chapter content timestamp', chapterAfterCursorSave.updatedAt === chapterBeforeCursorSave.updatedAt,
    JSON.stringify({ before: chapterBeforeCursorSave.updatedAt, after: chapterAfterCursorSave.updatedAt }));

  const beforeReload = await pdfRelativeAnchor(page);
  check('the test anchor is centered at 40% pane height inside page 3', beforeReload.page === 3
    && beforeReload.x >= 0 && beforeReload.x <= 1 && beforeReload.y >= 0 && beforeReload.y <= 1, JSON.stringify(beforeReload));

  await page.reload({ waitUntil: 'load' });
  await waitForReader(page, 3);
  await page.waitForTimeout(250);
  const afterReload = await pdfRelativeAnchor(page);
  check('reload restores the same PDF-relative center/40%-height anchor', samePdfRelativeAnchor(beforeReload, afterReload, .025),
    JSON.stringify({ before: beforeReload, after: afterReload }));
  const reloadedState = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'light',
    paper: document.getElementById('pdfFrame').dataset.paperAppearance
  }));
  check('interface theme and paper appearance persist independently across reload', reloadedState.theme === 'dark' && reloadedState.paper === 'inverted', JSON.stringify(reloadedState));
  const chapterAfterReload = await storedChapter(page, paperId);
  check('restoring the cursor also leaves the chapter content timestamp unchanged', chapterAfterReload.updatedAt === chapterBeforeCursorSave.updatedAt,
    JSON.stringify({ before: chapterBeforeCursorSave.updatedAt, after: chapterAfterReload.updatedAt }));

  const beforeResize = await pdfRelativeAnchor(page);
  const oldPaperWidth = beforeResize.paperWidth;
  /* Change both axes, as a tablet rotation does. Capturing after this resize but before
     rebuilding used to mix the new pane height with the old paper geometry. */
  await page.setViewportSize({ width: 960, height: 520 });
  await page.waitForFunction(({ pageNumber, oldWidth }) => {
    const holder = document.querySelector('.pdf-page[data-page="' + pageNumber + '"]');
    const canvas = holder && holder.querySelector('canvas');
    return holder && canvas && canvas.width > 0
      && Math.abs(holder.getBoundingClientRect().width - oldWidth) > 100;
  }, { pageNumber: beforeResize.page, oldWidth: oldPaperWidth });
  await page.waitForTimeout(300);
  const afterResize = await pdfRelativeAnchor(page);
  check('rotation-like resize preserves the same PDF-relative center/40%-height anchor', samePdfRelativeAnchor(beforeResize, afterResize, .04),
    JSON.stringify({ before: beforeResize, after: afterResize }));

  const beforeColumns = await pdfRelativeAnchor(page);
  await page.click('#colZoomBtn');
  await page.waitForFunction(() => document.getElementById('colZoomBtn').dataset.columnState === 'left');
  const leftColumn = await pdfRelativeAnchor(page);
  const leftState = await page.locator('#colZoomBtn').evaluate(button => ({ text: button.textContent.trim(), pressed: button.getAttribute('aria-pressed') }));
  await page.click('#colZoomBtn');
  await page.waitForFunction(() => document.getElementById('colZoomBtn').dataset.columnState === 'right');
  const rightColumn = await pdfRelativeAnchor(page);
  const rightState = await page.locator('#colZoomBtn').evaluate(button => ({ text: button.textContent.trim(), pressed: button.getAttribute('aria-pressed') }));
  await page.click('#colZoomBtn');
  await page.waitForFunction(() => document.getElementById('colZoomBtn').dataset.columnState === 'full');
  const afterColumns = await pdfRelativeAnchor(page);
  const fullState = await page.locator('#colZoomBtn').evaluate(button => ({ text: button.textContent.trim(), pressed: button.getAttribute('aria-pressed') }));
  check('Column cycles through explicit Left, Right, and Full states', leftState.text === 'Column · Left' && leftState.pressed === 'true'
    && rightState.text === 'Column · Right' && rightState.pressed === 'true'
    && fullState.text === 'Column · Full width' && fullState.pressed === 'false', JSON.stringify({ leftState, rightState, fullState }));
  check('Column changes preserve the same vertical PDF passage', samePdfVerticalAnchor(beforeColumns, leftColumn, .04)
    && samePdfVerticalAnchor(leftColumn, rightColumn, .04) && samePdfRelativeAnchor(beforeColumns, afterColumns, .04),
    JSON.stringify({ beforeColumns, leftColumn, rightColumn, afterColumns }));

  check('PDF continuity workflow has no page errors in ' + browserName, errors.length === 0, errors.join('; '));
  await context.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
