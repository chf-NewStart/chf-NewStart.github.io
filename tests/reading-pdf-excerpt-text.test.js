/* Real PDF.js text, native ranges, saved highlights, Workspace persistence, and
   source navigation. Run with PHLOEM_BROWSER=chromium or PHLOEM_BROWSER=webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..'), ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  const file = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript'
      : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(data);
  });
});
async function fixture() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), page = doc.addPage([612, 792]);
  [
    ['nutritional', 710], ['sources support meta-', 684], ['bolic flux.', 658],
    ['Known spellings: metabolic and nitrogen-fixing.', 610],
    ['nitrogen-', 564], ['fixing bacteria.', 538],
    ['An inline meta-bolic example.', 490], ['6,689 reactions (VYTOP)', 444]
  ].forEach(([text, y]) => page.drawText(text, { x: 50, y, size: 18, font }));
  page.drawText('micro', { x: 50, y: 398, size: 18, font: bold });
  page.drawText('scope', { x: 50 + bold.widthOfTextAtSize('micro', 18), y: 398, size: 18, font });
  return Buffer.from(await doc.save());
}
async function ready(page) {
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady === 'true'
    && [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].some(span => span.textContent === 'bolic flux.'));
  await page.evaluate(() => document.fonts.ready);
}
async function select(page, first, start, last, end, expected) {
  const raw = await page.evaluate(({ first, start, last, end }) => {
    const spans = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')];
    const a = spans.find(span => span.textContent === first).firstChild;
    const b = spans.find(span => span.textContent === last).firstChild;
    const range = document.createRange(); range.setStart(a, start); range.setEnd(b, end);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const native = selection.toString();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 97 }));
    return { range: range.toString(), native };
  }, { first, start, last, end });
  await page.locator('#selectionToWorkspace').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#selectionExcerpt').textContent(), '“' + expected + '”');
  assert.equal(await page.evaluate(() => getSelection().toString()), raw.native,
    'readable PDF quote does not move or expand the native selection');
  return raw.range;
}
async function current(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
    .find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('excerptTextFixture')) return;
      localStorage.setItem('excerptTextFixture', '1');
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
      localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html');
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'excerpt-layout.pdf', mimeType: 'application/pdf', buffer: await fixture() });
    await ready(page);
    assert.equal(await select(page, 'nutritional', 0, 'sources support meta-', 7, 'nutritional sources'), 'nutritionalsources');
    await page.locator('#selectionClose').click();
    await select(page, 'nitrogen-', 0, 'fixing bacteria.', 6, 'nitrogen-fixing');
    await page.locator('#selectionClose').click();
    await select(page, 'nitrogen-', 5, 'fixing bacteria.', 6, 'gen-fixing');
    await page.locator('#selectionClose').click();
    await select(page, 'sources support meta-', 16, 'sources support meta-', 21, 'meta-');
    await page.locator('#selectionClose').click();
    await select(page, 'An inline meta-bolic example.', 10, 'An inline meta-bolic example.', 20, 'meta-bolic');
    await page.locator('#selectionClose').click();
    await select(page, 'micro', 0, 'scope', 5, 'microscope');
    await page.locator('#selectionClose').click();
    const number = '6,689 reactions (VYTOP)';
    await select(page, number, 0, number, number.length, number);
    await page.locator('#selectionClose').click();
    await select(page, number, 2, number, number.length - 1, '689 reactions (VYTOP');
    await page.locator('#selectionClose').click();
    await select(page, 'sources support meta-', 16, 'bolic flux.', 5, 'metabolic');
    await page.locator('#selectionHighlight').click();
    await page.locator('#highlightQuickMore').click();
    await page.locator('#selectionToWorkspace').click();
    await page.locator('.workspace-quote').waitFor({ state: 'visible' });
    const paper = await current(page), clip = paper.readingExcerpts.items[0];
    assert.equal(clip.quote, 'metabolic', 'Workspace receives the normalized saved-highlight text');
    assert.equal(paper.highlights['1'][0].text, 'metabolic');
    assert.equal(paper.highlights['1'][0].rects.length, 2, 'highlight geometry still covers both selected lines');
    await page.reload(); await ready(page);
    if (!await page.locator('#workspacePanel').isVisible()) await page.locator('#zenWorkspace').click();
    const card = page.locator('.workspace-card[data-clip-id="' + clip.id + '"]');
    await card.waitFor({ state: 'visible' });
    assert.equal(await card.locator('.workspace-quote').textContent(), 'metabolic', 'normalized clip survives reload');
    assert.equal((await current(page)).readingExcerpts.items[0].quote, 'metabolic');
    await card.locator('summary').click();
    await card.locator('.workspace-source').click();
    const cue = page.locator('.excerpt-source-cue-layer[data-excerpt-id="' + clip.id + '"]');
    await cue.waitFor({ state: 'visible' });
    const coverage = await cue.evaluate(layer => {
      const spans = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')];
      const marks = [...layer.querySelectorAll('.excerpt-source-cue')].map(node => node.getBoundingClientRect());
      return [['sources support meta-', 16, 20], ['bolic flux.', 0, 5], ['Known spellings: metabolic and nitrogen-fixing.', 16, 25]].map(([text, start, end]) => {
        const node = spans.find(span => span.textContent === text).firstChild, range = document.createRange();
        range.setStart(node, start); range.setEnd(node, end); const target = range.getBoundingClientRect();
        return marks.some(mark => Math.max(0, Math.min(mark.right, target.right) - Math.max(mark.left, target.left))
          * Math.max(0, Math.min(mark.bottom, target.bottom) - Math.max(mark.top, target.top)) > target.width * target.height * .25);
      });
    });
    assert.deepEqual(coverage, [true, true, false], 'Go to source covers the split word, not its later inline occurrence');
    assert.equal((await current(page)).highlights['1'].length, 1, 'temporary source cue does not save extra highlights');
    assert.deepEqual(errors, []);
    console.log('PASS PDF excerpt spacing, hyphens, exact selection, saved highlight, reload, and source mapping (' + ENGINE + ')');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
