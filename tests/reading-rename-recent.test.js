/* Rename through the real library/reader controls; keep original data intact. */
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PORT = +(process.env.PHLOEM_RENAME_TEST_PORT || 8198);
const engine = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0, failures = 0;
function check(name, passed) { checks++; if (!passed) failures++; console.log((passed ? 'PASS ' : 'FAIL ') + name); }
const server = http.createServer((request, response) => {
  const name = request.url.split('?')[0];
  fs.readFile(path.join(ROOT, name === '/' ? 'reading.html' : name), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.pdf') ? 'application/pdf' : 'text/html');
    response.end(data);
  });
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('renameFixture')) return;
      const stamp = Date.now();
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: Array.from({ length: 7 }, (_, index) => ({
        id: 'rename-' + index, kind: 'text', title: 'Book ' + index, sourceName: 'original-' + index + '.txt', authors: 'Test author',
        fr: 'First paragraph.\n\nSecond paragraph.', readPage: 1, pageNotes: { document: 'Keep my note' }, tags: ['keep'],
        lastOpenedAt: stamp - index * 1000, updatedAt: stamp - index * 1000, addedAt: stamp - 9000
      })) }));
      localStorage.setItem('renameFixture', '1');
      localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
      localStorage.removeItem('readingRoom.lastOpen.v1');
    });
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html');
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    const saved = id => page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id), id);
    check('six recent papers, newest first', (await page.locator('[data-continue-paper]').evaluateAll(cards => cards.map(card => card.dataset.continuePaper))).join(',') === 'rename-0,rename-1,rename-2,rename-3,rename-4,rename-5');
    for (const width of [1180, 390]) {
      await page.setViewportSize({ width, height: 900 });
      check(width + ' recent papers form one horizontally scrollable row', await page.locator('.continue-reading-cards').evaluate(rail => {
        const cards = [...rail.children], top = cards[0].offsetTop;
        return rail.scrollWidth > rail.clientWidth && cards.every(card => card.offsetTop === top);
      }));
      await page.locator('[data-continue-paper="rename-5"]').focus();
      check(width + ' keyboard focus reaches sixth card', await page.locator('[data-continue-paper="rename-5"]').evaluate(card => {
        const r = card.getBoundingClientRect(), rail = card.parentElement.getBoundingClientRect(); return r.left >= rail.left - 1 && r.right <= rail.right + 1;
      }));
    }
    await page.setViewportSize({ width: 1180, height: 900 });
    if (process.env.PHLOEM_RENAME_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_RENAME_SCREENSHOT + '-library.png' });
    await page.locator('#selectedPaper .rename-paper').click();
    if (process.env.PHLOEM_RENAME_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_RENAME_SCREENSHOT + '-dialog.png' });
    check('library Rename opens without opening the paper', await page.locator('#renamePaperDialog').isVisible() && !await page.locator('#readerPage').isVisible());
    await page.locator('#renamePaperTitle').fill('  My renamed book  ');
    await page.locator('#renamePaperTitle').press('Enter');
    check('wall rename persists, trims name, and preserves original file and notes', (await saved('rename-0')).title === 'My renamed book' && (await saved('rename-0')).sourceName === 'original-0.txt' && (await saved('rename-0')).pageNotes.document === 'Keep my note');
    check('wall and Continue reading refresh immediately', await page.locator('.closed-book-title').textContent() === 'My renamed book' && await page.locator('[data-continue-paper="rename-0"] strong').textContent() === 'My renamed book');
    await page.locator('[data-library-view="list"]').click();
    await page.locator('[data-library-paper="rename-1"] .library-list-more').click();
    await page.locator('[data-library-paper="rename-1"] .rename-paper').click();
    await page.locator('#renamePaperTitle').fill('Cancelled title');
    await page.locator('#renamePaperDialog button').filter({ hasText: 'Cancel' }).click();
    check('Cancel leaves the selected library paper unchanged', (await saved('rename-1')).title === 'Book 1');
    await page.locator('[data-library-paper="rename-1"] .library-list-more').click();
    await page.locator('[data-library-paper="rename-1"] .rename-paper').click();
    await page.locator('#renamePaperTitle').fill('List name');
    await page.locator('#renamePaperTitle').press('Enter');
    check('list Rename targets its own paper', (await saved('rename-1')).title === 'List name' && (await saved('rename-0')).title === 'My renamed book');
    await page.locator('.library-list-open[data-library-paper="rename-1"]').click();
    await page.locator('#readerTitle').click();
    check('clicking the open title selects its existing name', await page.locator('#renamePaperTitle').evaluate(input => input.value === 'List name' && input.selectionStart === 0 && input.selectionEnd === input.value.length));
    await page.locator('#renamePaperTitle').fill('   ');
    await page.locator('#renamePaperTitle').press('Enter');
    check('blank names do not save', await page.locator('#renamePaperDialog').isVisible() && (await saved('rename-1')).title === 'List name');
    await page.locator('#renamePaperTitle').fill('Reader <name> & notes');
    await page.locator('#renamePaperTitle').press('Enter');
    check('reader rename is plain text and manual choice is saved', await page.locator('#readerTitle').textContent() === 'Reader <name> & notes' && (await saved('rename-1')).titleEditedByUser === true);
    await page.reload();
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    check('custom name survives reload', (await saved('rename-1')).title === 'Reader <name> & notes');
    check('no uncaught page errors', errors.length === 0);
    console.log((checks - failures) + '/' + checks + ' passed (' + engine + ')');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
