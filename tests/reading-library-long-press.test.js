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
  await new Promise(resolve => server.listen(8137, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  // An iPad-sized touch screen: no hover and a coarse pointer, like the app on glass.
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    const stamp = Date.now();
    const paper = (id, title, age) => ({ id, kind: 'text', title, authors: 'Test Author', tags: [], fr: 'A short test paper.', notes: {}, pageNotes: {}, questions: [], addedAt: stamp - age, updatedAt: stamp - age, readPage: 1 });
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
      paper('paper_roots', 'Root architecture under drought', 0),
      paper('paper_models', 'Constraint models for carbon allocation', 1000),
      paper('paper_microbes', 'Rhizosphere communities and nutrient exchange', 2000)
    ] }));
    localStorage.setItem('readingRoom.theme', 'light');
  });
  await page.goto('http://localhost:8137/reading.html', { waitUntil: 'load' });
  await page.waitForSelector('.category-note-grid .paper-sticky-note');
  check('the page sees a touch screen without hover', await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches));

  const target = page.locator('[data-shelf-paper="paper_models"]');
  await target.evaluate(async element => {
    const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    await new Promise(resolve => setTimeout(resolve, 650));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
  });
  await page.waitForTimeout(100);
  check('holding a note selects it for the card', (await page.locator('.closed-book-title').textContent()).includes('Constraint models for carbon allocation'));
  check('the held note is marked selected', await page.locator('[data-shelf-paper="paper_models"]').getAttribute('aria-pressed') === 'true');
  check('holding a note does not open its Move menu', await page.locator('.paper-sticky-wrap.is-menu-open').count() === 0);
  check('every Move menu stays hidden after a hold', await page.locator('.paper-category-menu').evaluateAll(menus => menus.every(menu => menu.hidden)));
  check('the reader stays closed after a hold', await page.locator('#readerPage').evaluate(element => element.classList.contains('hidden')));

  const heldWrap = page.locator('.paper-sticky-wrap').filter({ has: page.locator('[data-shelf-paper="paper_models"]') });
  await heldWrap.locator('.paper-category-move').tap();
  check('the note\'s own Move button still opens its menu', await heldWrap.evaluate(element => element.classList.contains('is-menu-open')));

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.category-note-grid .paper-sticky-note');
  await page.locator('[data-shelf-paper="paper_microbes"]').tap();
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  check('one tap on a note opens the paper', (await page.locator('#readerTitle').textContent()).includes('Rhizosphere communities'));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All long-press checks passed');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
