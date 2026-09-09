let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_TITLE_TEST_PORT || 8142);
const BAD_METADATA_TITLE = 'OP-PLPH210546_1709..1723';
const BAD_SAVED_TITLE = 'OP-PLPH210546 1709..1723';
const PAGE_TITLE = 'A multi-organ metabolic model of tomato predicts plant responses to nutritional and genetic perturbations';
const CURATED_TITLE = 'Tomato metabolism under nutritional stress';

function pdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/* Publisher PDFs sometimes put a prepress job code in /Title even though page one
   carries the real article title. Keep this fixture tiny and explicit so title
   selection can be tested without a copyrighted or network-fetched paper. */
function publisherTitlePdf() {
  const lines = [
    ['A multi-organ metabolic model of tomato', 24, 72, 710, 'F2'],
    ['predicts plant responses to nutritional', 24, 72, 672, 'F2'],
    ['and genetic perturbations', 24, 72, 634, 'F2'],
    ['Leo Gerlin, Ludovic Cottret, Antoine Escourrou, Stephane Genin', 12, 72, 590, 'F1'],
    ['Abstract', 18, 72, 520, 'F2'],
    ['Predicting and understanding plant responses requires integrated models.', 11, 72, 490, 'F1']
  ];
  const stream = lines.map(line =>
    'BT /' + line[4] + ' ' + line[1] + ' Tf 1 0 0 1 ' + line[2] + ' ' + line[3] + ' Tm (' + pdfEscape(line[0]) + ') Tj ET'
  ).join('\n');
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Title (' + pdfEscape(BAD_METADATA_TITLE) + ') /Author (Oxford University Press) >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'binary');
    pdf += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf, 'binary');
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id++) pdf += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R /Info 7 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'binary');
}

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

async function storedPaper(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
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
    if (sessionStorage.getItem('titleTestSeeded')) return;
    sessionStorage.setItem('titleTestSeeded', '1');
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', {
    name: 'kiab548.pdf', mimeType: 'application/pdf', buffer: publisherTitlePdf()
  });
  await page.waitForFunction(expected => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return state.chapters[0] && state.chapters[0].title === expected;
  }, PAGE_TITLE);
  let paper = await storedPaper(page);
  check('fresh import prefers the visible page-one title over a publisher job code', paper.title === PAGE_TITLE, paper.title);

  await page.evaluate(badTitle => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    state.chapters[0].title = badTitle;
    state.chapters[0].updatedAt = state.savedAt = Date.now() + 60000;
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
    localStorage.setItem('readingRoom.lastOpen.v1', state.chapters[0].id);
  }, BAD_SAVED_TITLE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(expected => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return state.chapters[0] && state.chapters[0].title === expected;
  }, PAGE_TITLE);
  paper = await storedPaper(page);
  check('an older saved publisher-code title repairs when the PDF reopens', paper.title === PAGE_TITLE, paper.title);
  check('the repaired title is reflected in the open reader', await page.locator('#readerTitle').textContent() === PAGE_TITLE, await page.locator('#readerTitle').textContent());

  /* Let startup's final persistence pass settle before simulating a later manual
     library edit; otherwise that already-queued write can race this test mutation. */
  await page.waitForTimeout(700);
  await page.evaluate(curatedTitle => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    state.chapters[0].title = curatedTitle;
    state.chapters[0].updatedAt = state.savedAt = Date.now() + 120000;
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
  }, CURATED_TITLE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  await page.waitForTimeout(350);
  paper = await storedPaper(page);
  check('a normal curated title remains untouched on later reload', paper.title === CURATED_TITLE, paper.title);
  check('title recovery has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
