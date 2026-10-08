let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

/* A guide read only as a PDF: Find must search every page without Reader view
   having run first, and a mouse click on a contents entry must go to that page.
   The fixture PDF is written by hand, so this needs no pdf-lib. */
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_FIND_CONTENTS_TEST_PORT || 8148);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

// Three Helvetica pages: a List of Tables whose "Table 3" entry links to page 3,
// a plain page, and page 3 holding the table and a footnote that names it again.
function fixturePdf() {
  const pages = [
    ['(List of Tables) Tj', '(Table 1. Crop cycles for greenhouse tomatoes ........ 2) Tj', '(Table 3. Fertigation schedule for tomato ........ 3) Tj'],
    ['(Growing media and irrigation are described on this page.) Tj', '(Electrical conductivity is raised as the fruit load increases.) Tj'],
    ['(Table 3. Fertigation Schedule for Tomato \\(ppm nutrient\\)) Tj', '(Normal feed: N 190, P 50, K 400, Ca 190, Mg 65.) Tj', '(* See Table 3 for an explanation of these codes.) Tj']
  ];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  pages.forEach(lines => {
    const stream = 'BT /F1 14 Tf 18 TL 60 720 Td\n' + lines.join(' T*\n') + '\nET';
    objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
    const contentRef = objects.length;
    objects.push('PAGE'); kids.push({ index: objects.length - 1, contentRef });
  });
  const pageRef = n => (kids[n].index + 1) + ' 0 R';
  objects.push('<< /Type /Annot /Subtype /Link /Rect [60 676 420 694] /Border [0 0 0] /Dest [' + pageRef(2) + ' /XYZ 0 792 0] >>');
  const linkRef = objects.length;
  kids.forEach((kid, n) => {
    objects[kid.index] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + kid.contentRef + ' 0 R' + (n === 0 ? ' /Annots [' + linkRef + ' 0 R]' : '') + ' >>';
  });
  objects[1] = '<< /Type /Pages /Kids [' + kids.map((_, n) => pageRef(n)).join(' ') + '] /Count ' + kids.length + ' >>';
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => { const at = pdf.length; pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n'; return at; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}
const pageLabel = page => page.evaluate(() => document.getElementById('pageNumber').textContent.trim());

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { if (!localStorage.getItem('readingRoom.v1')) localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [] })); });
  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.locator('#pdfFile').setInputFiles({ name: 'fertigation-guide.pdf', mimeType: 'application/pdf', buffer: fixturePdf() });
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span') && document.querySelector('.pdf-page[data-page="1"] .pdf-link'), null, { timeout: 60000 });
  await page.waitForTimeout(600);

  // Find, before Reader view has ever built page texts for this paper.
  if (!await page.locator('#findInput').isVisible()) { await page.locator('#zenMore').click(); await page.locator('#zenFind').click(); }
  await page.locator('#findInput').fill('table 3');
  await page.waitForFunction(() => /\d+ \/ \d+|No matches/.test(document.getElementById('findCount').textContent), null, { timeout: 30000 });
  const count = await page.evaluate(() => document.getElementById('findCount').textContent);
  check('Find searches every page of a paper read only as a PDF', /1 \/ 3$/.test(count), count);
  await page.locator('#findNext').click();
  await page.waitForFunction(() => /2 \/ 3$/.test(document.getElementById('findCount').textContent));
  check('the next match is the table itself on page 3', /^p\. 3 · 2 \/ 3$/.test(await page.evaluate(() => document.getElementById('findCount').textContent)) && await pageLabel(page) === '3 / 3', await pageLabel(page));
  await page.locator('#findInput').press('Escape');
  check('Escape in the Find box closes it', !await page.locator('#findInput').isVisible());

  // A mouse click on the contents entry follows its link; Backspace comes back.
  await page.evaluate(() => document.querySelector('.pdf-page[data-page="1"]').scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.trim() === '1 / 3');
  const entry = await page.locator('.pdf-page[data-page="1"] .pdf-link').boundingBox();
  await page.mouse.click(entry.x + entry.width / 2, entry.y + entry.height / 2);
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.trim() === '3 / 3', null, { timeout: 10000 }).catch(() => {});
  check('a mouse click on a contents entry goes to that page', await pageLabel(page) === '3 / 3', await pageLabel(page));
  // The jump finishes by placing the linked passage; its message says how to come back.
  await page.waitForFunction(() => /Backspace comes back/.test(document.getElementById('readerToast').textContent), null, { timeout: 10000 }).catch(() => {});
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.trim() === '1 / 3', null, { timeout: 10000 }).catch(() => {});
  check('Backspace returns to the contents page', await pageLabel(page) === '1 / 3', await pageLabel(page));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All find and contents checks passed');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
