/* Workspace › More › Export Markdown downloads the board's quote cards and notes in board
   order (rows top to bottom, left to right), each quote with its paper (title, authors,
   year, DOI link) and page, and says plainly that handwriting is left out. Year and DOI come
   from a reading-list entry for the paper when the paper has none. Stored data is unchanged.
   The menu item is reachable on a desktop window, an iPad-sized window and a phone.
   Run in Chromium and with PHLOEM_BROWSER=webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));

// 1. The pure export, without a browser.
function pureChecks() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'reading-workspace.js'), 'utf8'), sandbox);
  const api = sandbox.window.PhloemWorkspaceState;
  const t = 1700000000000;
  const item = (id, quote, note, anchor) => ({ id, quote, note, anchor, createdAt: t, updatedAt: t });
  const result = api.exportMarkdown({
    paper: { title: 'Sugar *flow* in phloem', authors: 'Knoblauch M, Peters WS', year: 2016, venue: 'eLife', doi: 'https://doi.org/10.7554/eLife.15341' },
    items: [
      item('c-low', 'Bottom quote', '', { kind: 'pdf', page: 9 }),
      item('c-right', 'Right quote\nsecond line', 'Why this matters', { kind: 'pdf', page: 2 }),
      item('c-left', 'Left quote', '', { kind: 'text', para: 4, offset: 0 }),
      item('n-1', '', 'A note of my own', { kind: 'pdf', page: 1 }),
      item('c-off', 'Only in Clips', '', { kind: 'pdf', page: 3 })
    ],
    workspace: { version: 3, width: 1000, height: 2000, positions: {
      'c-low': { x: 0, y: 900, width: 420, updatedAt: t },
      'c-right': { x: 520, y: 100, width: 420, updatedAt: t },
      'c-left': { x: 10, y: 130, width: 420, updatedAt: t },
      'n-1': { x: 40, y: 500, width: 420, updatedAt: t }
    }, strokes: [{ id: 's1', color: 'black', width: 2, points: [[1, 1, .5], [5, 5, .5]], style: 'natural', createdAt: t, updatedAt: t }], deleted: {} },
    exportedAt: Date.UTC(2026, 10, 17)
  });
  const md = result.text;
  const order = ['Left quote', 'Right quote', 'A note of my own', 'Bottom quote'].map(text => md.indexOf(text));
  assert(order.every(index => index > 0), 'every card on the board is exported: ' + md);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'board order: one row left to right, then down');
  assert(!md.includes('Only in Clips'), 'a clip that is not on the board is not exported');
  assert(md.includes('## 1. Quote · paragraph 5'), 'a Reader view clip names its paragraph');
  assert(md.includes('## 2. Quote · p. 2'), 'a PDF clip names its page');
  assert(md.includes('> Right quote\n> second line'), 'multi-line quotes stay one blockquote');
  assert(md.includes('— *Sugar \\*flow\\* in phloem*, Knoblauch M, Peters WS (2016), eLife, p. 2. https://doi.org/10.7554/eLife.15341'), 'each quote carries its paper, page and DOI link');
  assert(md.includes('**Note:**\n\nWhy this matters'), "a quote's note follows it");
  assert(md.includes('## 3. Note\n\nA note of my own'), 'a note card is exported as a note');
  assert(md.includes('_Handwriting is not included: 1 stroke'), 'handwriting is said to be left out');
  assert(md.includes('on 2026-11-17. 3 quotes and 1 note'), 'the summary line counts quotes and notes');
  assert.deepEqual([result.quotes, result.notes, result.strokes], [3, 1, 1]);
  const empty = api.exportMarkdown({ paper: { title: 'Empty' }, items: [], workspace: undefined });
  assert(empty.text.includes('_Nothing is on this Workspace yet._') && !empty.text.includes('Handwriting'), 'an empty board exports cleanly');
  console.log('PASS pure export');
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') || filename.endsWith('.mjs') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText('Workspace export fixture page one.', { x: 52, y: 710, size: 14, font });
  pdf.addPage([612, 792]).drawText('Workspace export fixture page two.', { x: 52, y: 710, size: 14, font });
  return Buffer.from(await pdf.save());
}
const savedState = page => page.evaluate(() => localStorage.getItem('readingRoom.v1'));
async function waitPdf(page) {
  await page.waitForFunction(() => document.body.classList.contains('zen') && document.querySelector('.pdf-page canvas')?.width > 0);
}
async function openWorkspace(page) {
  if (!(await page.locator('#workspacePanel').isVisible())) {
    const phone = await page.evaluate(() => document.body.classList.contains('phone-ui'));
    if (phone) {
      // The phone's dock keeps Workspace under its menu.
      const direct = page.locator('#zenPhoneWorkspace');
      if (!(await direct.isVisible())) await page.locator('#zenMore').click();
      await direct.click();
    } else await page.locator('#zenWorkspace').click();
  }
  await page.locator('#workspaceBoard').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
}
async function exportFrom(page) {
  await page.locator('#workspaceMore > summary').click();
  const button = page.locator('#workspaceExport');
  await button.waitFor({ state: 'visible' });
  const box = await button.boundingBox(), size = page.viewportSize();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1,
    'Export Markdown sits inside the window: ' + JSON.stringify(box));
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
}

(async () => {
  pureChecks();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const pdfBytes = await fixturePdf();
    const sizes = [
      { label: 'desktop', viewport: { width: 1440, height: 900 } },
      { label: 'iPad', viewport: { width: 1180, height: 820 }, hasTouch: true },
      { label: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE === 'chromium',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
    ];
    for (const size of sizes) {
      const options = { viewport: size.viewport, serviceWorkers: 'block', acceptDownloads: true };
      if (size.hasTouch) options.hasTouch = true;
      if (size.isMobile) options.isMobile = true;
      if (size.userAgent) options.userAgent = size.userAgent;
      const context = await browser.newContext(options);
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      await page.locator('#pdfFile').setInputFiles({ name: 'export-fixture.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
      await waitPdf(page);
      await page.waitForFunction(() => {
        const s = JSON.parse(localStorage.getItem('readingRoom.v1') || '{}');
        return (s.chapters || []).some(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'));
      });
      // Seed two quotes, one note and a stroke on this paper, plus a list entry with its year and DOI.
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('readingRoom.v1')), id = localStorage.getItem('readingRoom.lastOpen.v1');
        const ch = s.chapters.find(entry => entry.id === id), t = Date.now() - 60000;
        ch.title = 'Phloem transport fixture'; ch.authors = 'Knoblauch M, Peters WS';
        const clip = (cid, quote, note, page) => ({ id: cid, quote, note, anchor: { kind: 'pdf', page }, createdAt: t, updatedAt: t });
        ch.readingExcerpts = { version: 1, items: [clip('excerpt-b', 'Second quote, page two.', 'My thought on it', 2),
          clip('excerpt-a', 'First quote, page one.', '', 1), clip('excerpt-n', '', 'Plain note card', 1)], deleted: {} };
        ch.readingWorkspace = { version: 3, width: 1000, height: 2000, deleted: {},
          positions: { 'excerpt-a': { x: 20, y: 40, width: 420, updatedAt: t }, 'excerpt-b': { x: 500, y: 60, width: 420, updatedAt: t },
            'excerpt-n': { x: 20, y: 600, width: 420, updatedAt: t } },
          strokes: [{ id: 'workspace-ink-1', color: 'blue', width: 2.4, points: [[100, 1200, .5], [300, 1250, .5]], style: 'natural', createdAt: t, updatedAt: t }] };
        ch.updatedAt = t;
        s.readingLists = { version: 1, lists: [{ id: 'rl-x', name: 'Fixture list', rank: 1, createdAt: t, updatedAt: t }],
          items: [{ id: 'ri-x', listId: 'rl-x', kind: 'paper', paperId: id, title: 'Phloem transport fixture', year: '2016', doi: '10.7554/eLife.15341', rank: 1, createdAt: t, updatedAt: t }], deleted: {} };
        localStorage.setItem('readingRoom.v1', JSON.stringify(s));
      });
      await page.reload({ waitUntil: 'load' });
      await waitPdf(page);
      await openWorkspace(page);
      await page.waitForFunction(() => document.querySelectorAll('.workspace-card').length === 3);
      const before = await savedState(page);
      const { name, text } = await exportFrom(page);
      assert.equal(name, 'Workspace - Phloem transport fixture.md', size.label + ' file name');
      const a = text.indexOf('First quote, page one.'), b = text.indexOf('Second quote, page two.'), n = text.indexOf('Plain note card');
      assert(a > 0 && a < b && b < n, size.label + ' board order: ' + text);
      assert(text.includes('## 1. Quote · p. 1') && text.includes('## 2. Quote · p. 2') && text.includes('## 3. Note'), size.label + ' headings name pages');
      assert(text.includes('— *Phloem transport fixture*, Knoblauch M, Peters WS (2016), p. 2. https://doi.org/10.7554/elife.15341'), size.label + ' year and DOI from the reading list: ' + text);
      assert(text.includes('**Note:**\n\nMy thought on it'), size.label + " quote's note");
      assert(text.includes('_Handwriting is not included: 1 stroke'), size.label + ' says handwriting is left out');
      await page.waitForFunction(() => /Exported 2 quotes and 1 note · handwriting left out\./.test(document.getElementById('workspaceStatus').textContent));
      assert.equal(await page.locator('#workspaceMore').evaluate(node => node.open), false, size.label + ' menu closes after export');
      assert.equal(await savedState(page), before, size.label + ' export changes no stored data');
      assert.deepEqual(errors, [], size.label + ' page errors');
      console.log(`PASS ${ENGINE} ${size.label}`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
