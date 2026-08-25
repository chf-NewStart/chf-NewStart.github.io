let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

(async () => {
  await new Promise(resolve => server.listen(8130, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    const stamp = Date.now();
    const paper = (id, title, authors, tags, age, category) => {
      const chapter = { id, kind: 'text', title, authors, tags, fr: 'A short test paper.', notes: {}, pageNotes: {}, questions: [], addedAt: stamp - age, updatedAt: stamp - age, readPage: 1 };
      if (category !== undefined) chapter.category = category;
      return chapter;
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
      paper('paper_roots', 'Root architecture under drought', 'Lina Mora', ['Plant physiology'], 0),
      paper('paper_models', 'Constraint models for carbon allocation', 'Dev Rao', ['Modelling'], 1000, 'Metabolic models'),
      paper('paper_field', 'Field observations across seasons', 'Maya Chen', [], 2000),
      paper('paper_microbes', 'Rhizosphere communities and nutrient exchange', 'Owen Bell', ['Microbiome'], 3000)
    ] }));
  });

  await page.goto('http://localhost:8130/reading.html', { waitUntil: 'load' });
  await page.waitForSelector('.paper-stack-entry.is-selected');

  check('left pane is labelled as a paper stack', await page.locator('.pile-head strong').textContent() === 'Paper stack');
  check('right field notebook remains present', await page.locator('.open-book-wrap .closed-book').count() === 1);
  check('every paper exposes a category strip', await page.locator('.paper-category-strip').count() === 4);
  check('first tag becomes the initial DIY category', await page.locator('[data-shelf-paper="paper_roots"] .paper-category-mark').textContent() === 'Plant physiology');
  check('untagged papers fall back to Unsorted', await page.locator('[data-shelf-paper="paper_field"] .paper-category-mark').textContent() === 'Unsorted');

  const selectedHeight = await page.locator('.paper-stack-entry.is-selected').evaluate(element => element.getBoundingClientRect().height);
  const restingHeight = await page.locator('[data-shelf-paper="paper_models"]').evaluate(element => element.parentElement.getBoundingClientRect().height);
  check('selected sheet is pulled out to reveal its sticky note', selectedHeight > 190, selectedHeight);
  check('resting sheets expose only their category strip', restingHeight < 60, restingHeight);

  await page.locator('[data-shelf-paper="paper_models"] .paper-category-strip').hover();
  await page.waitForTimeout(320);
  const hoverHeight = await page.locator('[data-shelf-paper="paper_models"]').evaluate(element => element.parentElement.getBoundingClientRect().height);
  check('hover pulls a sheet out', hoverHeight > 190, hoverHeight);
  check('revealed sticky keeps the handwritten title and author', await page.locator('[data-shelf-paper="paper_models"] .paper-sticky-note').textContent().then(text => text.includes('Constraint models') && text.includes('Dev Rao')));

  await page.locator('[data-shelf-paper="paper_models"]').click({ position: { x: 120, y: 20 } });
  check('clicking a sheet selects it without opening the reader', await page.locator('#libraryPage').evaluate(element => !element.classList.contains('hidden')));
  check('the unchanged right notebook follows the selected paper', await page.locator('.closed-book-title').textContent() === 'Constraint models for carbon allocation');

  page.once('dialog', dialog => dialog.accept('Methods'));
  await page.locator('.paper-stack-entry.is-selected .paper-category-edit').click();
  check('category can be renamed from its exposed strip', await page.locator('.paper-stack-entry.is-selected .paper-category-mark').textContent() === 'Methods');
  check('renamed category is saved with the paper', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === 'paper_models').category === 'Methods'));

  await page.fill('#librarySearch', 'Methods');
  check('search includes DIY categories', await page.locator('.paper-stack-entry').count() === 1);
  await page.fill('#librarySearch', '');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobile = await page.locator('.bookcase').boundingBox();
  const mobileSelectedHeight = await page.locator('.paper-stack-entry.is-selected').evaluate(element => element.getBoundingClientRect().height);
  check('mobile stack stays compact above the notebook', mobile && mobile.height <= 285, mobile && mobile.height);
  check('mobile selected note still reveals inside the stack', mobileSelectedHeight >= 160 && mobileSelectedHeight <= 180, mobileSelectedHeight);
  check('paper stack has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
