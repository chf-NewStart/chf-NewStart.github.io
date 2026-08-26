let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_TYPOGRAPHY_TEST_PORT || 8138);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
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
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const paper = {
      id: 'typeface_test', kind: 'text', title: 'A readable paper', authors: 'Phloem',
      fr: 'Typography should support a long and focused reading session.\n\nThis second paragraph makes the reader structure visible.',
      notes: {}, pageNotes: {}, tags: [], questions: [], highlights: {}, textHighlights: [],
      readerHighlights: [], readerNotes: {}, aiThreads: [], termLookups: {}, reviews: {}, at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [paper], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.lastOpen.v1', paper.id);
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelector('.para .original'));
  await page.click('#comfortBtn');
  check('typeface choice lives in the Reflow text settings', await page.locator('.comfort-text [data-reading-typeface="book"]').isVisible() && await page.locator('.comfort-text [data-reading-typeface="clean"]').isVisible());

  await page.click('[data-reading-typeface="clean"]');
  const cleanFont = await page.locator('.para .original').first().evaluate(node => getComputedStyle(node).fontFamily);
  const savedClean = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).typeface);
  check('Clean switches long-form text to DM Sans', cleanFont.includes('DM Sans'), cleanFont);
  check('Clean preference is saved', savedClean === 'clean', savedClean);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.para .original'));
  const persisted = await page.locator('[data-reading-typeface="clean"]').getAttribute('aria-pressed');
  const persistedFont = await page.locator('.para .original').first().evaluate(node => getComputedStyle(node).fontFamily);
  check('Clean remains selected after reload', persisted === 'true' && persistedFont.includes('DM Sans'), persistedFont);

  await page.click('#comfortBtn');
  await page.click('[data-reading-typeface="book"]');
  const bookFont = await page.locator('.para .original').first().evaluate(node => getComputedStyle(node).fontFamily);
  check('Book restores the serif reading stack', bookFont.includes('Charter') && !bookFont.includes('DM Sans'), bookFont);
  check('typeface controls have no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
