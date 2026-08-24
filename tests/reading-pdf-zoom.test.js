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
  await new Promise(resolve => server.listen(8127, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    if (sessionStorage.getItem('zoomTestSeeded')) return;
    sessionStorage.setItem('zoomTestSeeded', '1');
    const paper = {
      id: 'pdf_zoom_test', kind: 'pdf', title: 'Zoom migration paper', sourceName: 'zoom-test.pdf',
      zoom: .5, readPage: 1, pageCount: 1, notes: {}, pageNotes: {}, tags: [], questions: [],
      highlights: {}, textHighlights: [], readerHighlights: [], readerNotes: {}, aiThreads: [],
      termLookups: {}, reviews: {}, at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [paper] }));
    localStorage.setItem('readingRoom.lastOpen.v1', paper.id);
  });

  await page.goto('http://localhost:8127/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return saved.chapters[0].zoom === 0 && saved.chapters[0].zoomPreferenceV === 2;
  });
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
  check('legacy 50% initial zoom migrates to Fit', stored.zoom === 0 && stored.zoomPreferenceV === 2);

  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1'));
    saved.chapters[0].zoom = .5;
    saved.chapters[0].zoomPreferenceV = 2;
    localStorage.setItem('readingRoom.v1', JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
  check('deliberately saved 50% zoom remains respected', stored.zoom === .5 && stored.zoomPreferenceV === 2);
  check('zoom migration has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
