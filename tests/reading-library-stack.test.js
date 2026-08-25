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
  check('all papers share one category sheet for now', await page.locator('.paper-category-strip').count() === 1);
  check('shared category is explicitly Unsorted', await page.locator('.paper-category-mark').textContent() === 'Unsorted');
  check('shared category reports its paper count', await page.locator('.paper-category-count').textContent() === '4 papers');
  check('one sticky note remains for every paper', await page.locator('.category-note-grid .paper-sticky-note').count() === 4);
  const firstTwoNotes = await page.locator('.category-note-grid .paper-sticky-note').evaluateAll(elements => elements.slice(0, 2).map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width })));
  check('sticky notes return to two per row', firstTwoNotes.length === 2 && Math.abs(firstTwoNotes[0].y - firstTwoNotes[1].y) < 2 && firstTwoNotes[1].x > firstTwoNotes[0].x, JSON.stringify(firstTwoNotes));
  check('sticky notes are compact instead of full-sheet width', firstTwoNotes.every(note => note.width < 230), JSON.stringify(firstTwoNotes));
  check('sticky keeps the handwritten title and author', await page.locator('[data-shelf-paper="paper_models"]').textContent().then(text => text.includes('Constraint models') && text.includes('Dev Rao')));

  await page.locator('[data-shelf-paper="paper_models"]').click({ position: { x: 120, y: 20 } });
  check('clicking a sheet selects it without opening the reader', await page.locator('#libraryPage').evaluate(element => !element.classList.contains('hidden')));
  check('the unchanged right notebook follows the selected paper', await page.locator('.closed-book-title').textContent() === 'Constraint models for carbon allocation');

  check('per-paper category pencils are removed', await page.locator('.paper-category-edit').count() === 0);
  await page.fill('#librarySearch', 'Constraint models');
  check('search narrows the shared sheet to the matching sticky', await page.locator('.category-note-grid .paper-sticky-note').count() === 1 && await page.locator('.paper-category-count').textContent() === '1 paper');
  await page.fill('#librarySearch', '');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobile = await page.locator('.bookcase').boundingBox();
  const mobileFirstTwo = await page.locator('.category-note-grid .paper-sticky-note').evaluateAll(elements => elements.slice(0, 2).map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width })));
  check('mobile stack stays compact above the notebook', mobile && mobile.height <= 285, mobile && mobile.height);
  check('mobile keeps the requested two-note row', mobileFirstTwo.length === 2 && Math.abs(mobileFirstTwo[0].y - mobileFirstTwo[1].y) < 2 && mobileFirstTwo[1].x > mobileFirstTwo[0].x, JSON.stringify(mobileFirstTwo));
  check('paper stack has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
