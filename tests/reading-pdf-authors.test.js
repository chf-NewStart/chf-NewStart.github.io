let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PDF_BASE64 = 'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXSAvUGFyZW50IDcgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1BhZ2VNb2RlIC9Vc2VOb25lIC9QYWdlcyA3IDAgUiAvVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoKNiAwIG9iago8PAovQXV0aG9yIChBZGEgTG92ZWxhY2UpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA4MjQxNzA5MTQtMDQnMDAnKSAvQ3JlYXRvciAoYW5vbnltb3VzKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA4MjQxNzA5MTQtMDQnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAodW5zcGVjaWZpZWQpIC9UaXRsZSAoQW5hbHl0aWNhbCBlbmdpbmVzIGZvciBmaWVsZCByZXNlYXJjaCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjU1Cj4+CnN0cmVhbQpHYXNKTGJtTTxBJjs5TDlgPm1EcW03LEwwSmowTCRIJUQ/I1tGLXJaOEhuIy4yJiRYIixcMSVpZmwmMlxqRGxZS2dBaTFQZm9BPClcY2FVaiJuV0MyNFxFOztiK0g3aztlWjY1J05WYjwpaVdDTldVSSp0Vj9YTm1Xb1xjWkgnQiZxIlshI0poSGhQVT02U24sL1k4MWhrRikwPT9jbCs4X1ZqV3E+VDppaGRoXlNfQmxTKXRhJ08xN2VSLmBsODo6aEI1ay5MT29QIiorOi4kUjdmNiI8WmM6QUg7Skk9bCRhPEFGbW5LTDNVZmgtNDVjZV5jPEgycTxAQGl0fj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA5CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDkgMDAwMDAgbiAKMDAwMDAwMDMyMSAwMDAwMCBuIAowMDAwMDAwNTE0IDAwMDAwIG4gCjAwMDAwMDA1ODIgMDAwMDAgbiAKMDAwMDAwMDg3NSAwMDAwMCBuIAowMDAwMDAwOTM0IDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDYyYjQwMTc3YzM1NDhjZTk1MTBmZDlkMGVlNmYzYjExPjw2MmI0MDE3N2MzNTQ4Y2U5NTEwZmQ5ZDBlZTZmM2IxMT5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgOQo+PgpzdGFydHhyZWYKMTI3OQolJUVPRgo=';
const PDF_PATH = process.env.PHLOEM_AUTHOR_TEST_PDF || '';
const PDF_BUFFER = PDF_PATH ? null : Buffer.from(PDF_BASE64, 'base64');
const EXPECTED_AUTHORS = process.env.PHLOEM_AUTHOR_TEST_EXPECTED || 'Ada Lovelace and Grace Hopper';
const EXPECTED_TITLE = process.env.PHLOEM_AUTHOR_TEST_TITLE || 'Analytical engines for field research';
const PORT = +(process.env.PHLOEM_AUTHOR_TEST_PORT || 8128);
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('authorTestSeeded')) return;
    sessionStorage.setItem('authorTestSeeded', '1');
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  if (PDF_PATH) await page.setInputFiles('#pdfFile', PDF_PATH);
  else await page.setInputFiles('#pdfFile', {
    name: 'author-test.pdf', mimeType: 'application/pdf', buffer: PDF_BUFFER
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
  await page.waitForTimeout(300);
  let paper = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
  check('new import accepts a valid metadata title in its writing system', paper.title === EXPECTED_TITLE, paper.title);
  check('new import prefers the full page-one author credit', paper.authors === EXPECTED_AUTHORS, paper.authors);

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    state.chapters[0].authors = '';
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
    localStorage.setItem('readingRoom.lastOpen.v1', state.chapters[0].id);
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].authors);
  paper = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
  check('older blank author credit repairs on open', paper.authors === EXPECTED_AUTHORS, paper.authors);

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    state.chapters[0].authors = 'Curated Author Credit';
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  await page.waitForTimeout(300);
  paper = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]);
  check('manual author credit remains untouched', paper.authors === 'Curated Author Credit', paper.authors);
  check('author recovery has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
