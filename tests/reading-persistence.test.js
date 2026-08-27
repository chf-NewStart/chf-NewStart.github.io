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

async function getSnapshot(page) {
  return page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('marginFiles', 2);
    request.onerror = () => resolve('');
    request.onsuccess = () => {
      const read = request.result.transaction('derived').objectStore('derived').get('state:snapshot:latest');
      read.onerror = () => resolve('');
      read.onsuccess = () => resolve(read.result || '');
    };
  }));
}

(async () => {
  await new Promise(resolve => server.listen(8138, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('persistenceFixtureLoaded')) return;
    const stamp = Date.now();
    localStorage.setItem('readingRoom.v1', JSON.stringify({
      chapters: [
        { id: 'safe-paper', kind: 'text', title: 'A paper that survives', authors: 'Test Reader', fr: 'Persistent paper text.', notes: {}, pageNotes: {}, tags: [], questions: [], reviewComments: [null], reviewReports: [null], addedAt: stamp, updatedAt: stamp, readPage: 1 },
        null
      ],
      deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, savedAt: stamp
    }));
    sessionStorage.setItem('persistenceFixtureLoaded', '1');
  });

  await page.goto('http://localhost:8138/reading.html', { waitUntil: 'load' });
  await page.waitForSelector('.paper-category-tab.is-selected');
  check('one malformed paper cannot empty the readable library', await page.locator('#libraryCount').textContent() === '1 paper');
  check('malformed review entries are discarded without losing the paper', await page.evaluate(() => {
    const paper = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0];
    return paper.id === 'safe-paper' && paper.reviewComments.length === 0 && paper.reviewReports.length === 0;
  }));

  let snapshot = '';
  for (let attempt = 0; attempt < 30 && !snapshot; attempt++) {
    await page.waitForTimeout(100);
    snapshot = await getSnapshot(page);
  }
  check('library metadata is journaled beside local source files', !!snapshot && JSON.parse(snapshot).chapters[0].id === 'safe-paper');

  await page.evaluate(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, savedAt: 1 }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-shelf-paper="safe-paper"]');
  check('a newer device safety copy restores a library emptied before reload', await page.locator('#libraryCount').textContent() === '1 paper');
  check('the restored library is written back to normal storage', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.some(ch => ch.id === 'safe-paper')));

  const orphanContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const orphanPage = await orphanContext.newPage();
  const orphanErrors = [];
  orphanPage.on('pageerror', error => orphanErrors.push(error.message));
  await orphanPage.addInitScript(() => {
    if (sessionStorage.getItem('orphanFixtureLoaded')) return;
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, savedAt: 1 }));
    sessionStorage.setItem('orphanFixtureLoaded', '1');
  });
  await orphanPage.goto('http://localhost:8138/reading.html', { waitUntil: 'load' });
  await orphanPage.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('marginFiles', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const bytes = new TextEncoder().encode('%PDF-1.4\n% locally retained source').buffer;
      const write = request.result.transaction('pdfs', 'readwrite').objectStore('pdfs').put(bytes, 'orphan-pdf');
      write.onerror = () => reject(write.error);
      write.onsuccess = () => resolve();
    };
  }));
  await orphanPage.reload({ waitUntil: 'load' });
  await orphanPage.waitForSelector('[data-shelf-paper="orphan-pdf"]');
  check('an original PDF left in IndexedDB is recovered after metadata loss', await orphanPage.locator('#libraryCount').textContent() === '1 paper');
  check('persistence recovery has no page errors', errors.length === 0 && orphanErrors.length === 0, errors.concat(orphanErrors).join('; '));

  await orphanContext.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
