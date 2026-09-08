let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_TOC_TEST_PORT || 8137);
const PDF_PATH = process.env.PHLOEM_TOC_TEST_PDF || '';

function pdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/* A tiny no-bookmarks textbook: printed page 1 is PDF page 5. Building it here keeps
   the regression fixture readable and makes the missing-outline condition explicit. */
function makePdf() {
  const pages = [
    [['A small textbook', 24, 72, 700]],
    [['Copyright', 14, 72, 700]],
    [['Contents', 24, 72, 730], ['1 Introduction 1', 14, 90, 650], ['1.1 Foundations 2', 14, 110, 620], ['2 Methods 4', 14, 90, 590]],
    [['Preface', 22, 72, 700], ['iv', 11, 300, 40]],
    [['1 Introduction', 24, 72, 700], ['The opening chapter.', 12, 72, 650], ['1', 11, 300, 40]],
    [['1.1 Foundations', 20, 72, 700], ['Core ideas.', 12, 72, 650], ['2', 11, 300, 40]],
    [['Examples', 20, 72, 700], ['3', 11, 300, 40]],
    [['2 Methods', 24, 72, 700], ['Experiments begin here.', 12, 72, 650], ['4', 11, 300, 40]],
    [['Appendix', 20, 72, 700], ['5', 11, 300, 40]]
  ];
  const pageCount = pages.length;
  const fontId = 3;
  const firstPageId = 4;
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = [];
  for (let i = 0; i < pageCount; i++) kids.push((firstPageId + i * 2) + ' 0 R');
  objects[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>';
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, index) => {
    const pageId = firstPageId + index * 2;
    const contentId = pageId + 1;
    const stream = lines.map(line => 'BT /F1 ' + line[1] + ' Tf 1 0 0 1 ' + line[2] + ' ' + line[3] + ' Tm (' + pdfEscape(line[0]) + ') Tj ET').join('\n');
    objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contentId + ' 0 R >>';
    objects[contentId] = '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream';
  });
  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, 'binary');
    output += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(output, 'binary');
  output += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id++) output += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  output += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(output, 'binary');
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

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} })));
  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  if (PDF_PATH) await page.setInputFiles('#pdfFile', PDF_PATH);
  else await page.setInputFiles('#pdfFile', { name: 'printed-contents.pdf', mimeType: 'application/pdf', buffer: makePdf() });
  await page.waitForFunction(() => {
    const button = document.getElementById('tocBtn');
    return button && !button.classList.contains('hidden');
  });

  check('a printed contents page is found without PDF bookmarks', (await page.locator('#tocBtn').getAttribute('title')).includes('read from the PDF pages'));
  await page.click('#tocBtn');
  const entries = await page.locator('#tocList .toc-item').allTextContents();
  if (PDF_PATH) {
    check('the real book yields a substantial chapter menu', entries.length >= 20 && entries.includes('1 Introduction'), entries.length);
    await page.getByRole('button', { name: '1 Introduction', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('pageNumber').textContent !== '1 / 549');
    check('the real book maps Introduction beyond its contents pages', parseInt(await page.locator('#pageNumber').textContent(), 10) > 11, await page.locator('#pageNumber').textContent());
  } else {
    check('printed chapter and section entries become navigation', entries.join('|') === '1 Introduction|1.1 Foundations|2 Methods', entries.join('|'));
    check('section numbering becomes menu hierarchy', await page.locator('#tocList .toc-item').nth(1).getAttribute('data-depth') === '1');
    await page.getByRole('button', { name: '2 Methods', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('8 / 9'));
    check('printed page 4 maps to PDF page 8', true);
  }
  check('inferred contents creates no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
