let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_LIBRARY_RETURN_OFFLINE_TEST_PORT || 8148);

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname === '/__phloem_library_fixture.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Phloem library fixture</title>');
    return;
  }
  const requested = pathname === '/' ? '/reading.html' : pathname;
  const file = path.join(ROOT, requested);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css'
          : file.endsWith('.pdf') ? 'application/pdf'
            : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

function paper(fields, stamp) {
  return Object.assign({
    authors: 'Phloem Test Reader', notes: {}, readerNotes: {}, pageNotes: {}, highlights: {},
    textHighlights: [], readerHighlights: [], questions: [], reviewComments: [], reviewReports: [],
    tags: [], category: 'Unsorted', addedAt: stamp - 86400000, readPage: 1
  }, fields);
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);

  const stamp = Date.now();
  const chapters = [
    paper({
      id: 'pdf-durable', kind: 'pdf', title: 'Downloaded field paper', sourceName: 'downloaded-field-paper.pdf',
      pageCount: 6, fileSize: 453864, contentHash: 'a'.repeat(64),
      lastOpenedAt: stamp - 1000, updatedAt: stamp - 500000
    }, stamp),
    paper({
      id: 'text-recent', kind: 'text', title: 'Recent research note',
      fr: 'A recent research note.\n\nA second paragraph keeps its reading place.',
      lastOpenedAt: stamp - 2000, updatedAt: stamp - 400000
    }, stamp),
    paper({
      id: 'pdf-missing', kind: 'pdf', title: 'Cloud-only field paper', sourceName: 'cloud-only-field-paper.pdf',
      pageCount: 9, fileSize: 734003, contentHash: 'b'.repeat(64),
      lastOpenedAt: stamp - 3000, updatedAt: stamp - 300000
    }, stamp),
    paper({
      id: 'word-readable', kind: 'text', sourceType: 'docx', title: 'Readable Word draft',
      sourceName: 'readable-word-draft.docx', fileSize: 28672,
      fr: 'The extracted Word draft remains readable without its original file.',
      lastOpenedAt: stamp - 4000, updatedAt: stamp + 600000
    }, stamp),
    paper({
      id: 'text-older', kind: 'text', title: 'Older lab note',
      fr: 'An older plain-text note is also readable offline.',
      lastOpenedAt: stamp - 5000, updatedAt: stamp - 100000
    }, stamp)
  ];

  /* Establish the app origin first, then seed both metadata and the durable source
     store before reading.js gets a chance to scan either one. */
  await page.goto('http://localhost:' + PORT + '/__phloem_library_fixture.html');
  await page.evaluate(async fixture => {
    localStorage.clear();
    localStorage.setItem('readingRoom.v1', JSON.stringify({
      chapters: fixture.chapters, deleted: {}, merged: {}, categoryOrder: [],
      categoryOrderUpdatedAt: 0, savedAt: fixture.stamp
    }));
    localStorage.setItem('readingRoom.librarySort', 'touched');
    localStorage.setItem('readingRoom.libraryView', 'wall');
    localStorage.setItem('readingRoom.offlineOnly.v1', '0');
    localStorage.removeItem('readingRoom.lastOpen.v1');
    localStorage.removeItem('readingRoom.gdrive.v1');

    const response = await fetch('/assets/phloem-guide/phloem-field-guide.pdf');
    if (!response.ok) throw new Error('Could not load bundled PDF fixture');
    const bytes = await response.arrayBuffer();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('marginFiles', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('pdfs')) request.result.createObjectStore('pdfs');
        if (!request.result.objectStoreNames.contains('derived')) request.result.createObjectStore('derived');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const write = database.transaction('pdfs', 'readwrite').objectStore('pdfs').put(bytes, 'pdf-durable');
        write.onerror = () => reject(write.error);
        write.onsuccess = () => { database.close(); resolve(); };
      };
    });
  }, { chapters, stamp });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const offline = document.getElementById('libraryOfflineFilter');
    const durable = document.querySelector('[data-continue-paper="pdf-durable"]');
    return document.body.classList.contains('library-ready')
      && offline && !offline.disabled
      && document.querySelectorAll('.continue-reading-card').length === 3
      && durable && durable.dataset.localAvailability === 'downloaded';
  });

  const returnCards = await page.evaluate(() => Array.from(document.querySelectorAll('.continue-reading-card')).map(card => ({
    id: card.dataset.continuePaper,
    local: card.getAttribute('data-local-availability'),
    backup: card.getAttribute('data-backup-status')
  })));
  check('Continue reading shows exactly three papers', returnCards.length === 3, JSON.stringify(returnCards));
  check('Continue reading follows lastOpenedAt instead of the wall’s updatedAt order',
    returnCards.map(card => card.id).join(',') === 'pdf-durable,text-recent,pdf-missing',
    returnCards.map(card => card.id).join(','));
  check('a future updatedAt does not displace a more recently opened paper',
    !returnCards.some(card => card.id === 'word-readable'));

  const durableCard = returnCards.find(card => card.id === 'pdf-durable');
  const missingCard = returnCards.find(card => card.id === 'pdf-missing');
  const textCard = returnCards.find(card => card.id === 'text-recent');
  check('a durable PDF reports local download and backup state independently',
    durableCard && durableCard.local === 'downloaded' && durableCard.backup === 'local' && durableCard.local !== durableCard.backup,
    JSON.stringify(durableCard));
  check('a metadata-only PDF reports download-needed and backup state independently',
    missingCard && missingCard.local === 'needed' && missingCard.backup === 'local' && missingCard.local !== missingCard.backup,
    JSON.stringify(missingCard));
  check('plain text is readable offline without claiming a binary backup state',
    textCard && textCard.local === 'readable' && textCard.backup === null,
    JSON.stringify(textCard));

  await page.waitForSelector('#paperLocalStatus[data-paper-id="word-readable"]');
  const selectedAvailability = await page.evaluate(() => {
    const local = document.getElementById('paperLocalStatus');
    const backup = document.getElementById('paperDriveStatus');
    return {
      localId: local && local.dataset.paperId,
      localState: local && local.dataset.localAvailability,
      localLabel: local && local.textContent.trim(),
      backupId: backup && backup.dataset.paperId,
      backupState: backup && backup.dataset.backupStatus,
      backupLabel: backup && backup.textContent.trim()
    };
  });
  check('the selected cover exposes separate local-reading and backup rows',
    selectedAvailability.localId === 'word-readable'
      && selectedAvailability.backupId === 'word-readable'
      && selectedAvailability.localState === 'readable'
      && selectedAvailability.backupState === 'local'
      && /Readable offline/.test(selectedAvailability.localLabel)
      && /Backup not connected/.test(selectedAvailability.backupLabel),
    JSON.stringify(selectedAvailability));

  await page.click('#libraryOfflineFilter');
  await page.waitForFunction(() => document.getElementById('libraryOfflineFilter').getAttribute('aria-pressed') === 'true'
    && document.getElementById('libraryCount').textContent.trim() === '4 readable offline');
  const offlinePaperIds = await page.evaluate(() => Array.from(document.querySelectorAll('[data-shelf-paper]')).map(book => book.dataset.shelfPaper).sort());
  check('Offline keeps the durable PDF plus extracted Word and plain-text records',
    offlinePaperIds.join(',') === ['pdf-durable', 'text-older', 'text-recent', 'word-readable'].sort().join(','),
    offlinePaperIds.join(','));
  check('Offline excludes a PDF whose bytes are not durably stored', !offlinePaperIds.includes('pdf-missing'));

  const beforeOpen = await page.evaluate(() => {
    const item = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(chapter => chapter.id === 'text-recent');
    return { lastOpenedAt: item.lastOpenedAt, updatedAt: item.updatedAt };
  });
  await page.click('[data-continue-paper="text-recent"]');
  await page.waitForFunction(before => {
    const item = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(chapter => chapter.id === 'text-recent');
    return !document.getElementById('readerPage').classList.contains('hidden')
      && item.lastOpenedAt > before.lastOpenedAt;
  }, beforeOpen);
  const afterOpen = await page.evaluate(() => {
    const item = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(chapter => chapter.id === 'text-recent');
    return { lastOpenedAt: item.lastOpenedAt, updatedAt: item.updatedAt };
  });
  check('opening a paper advances lastOpenedAt', afterOpen.lastOpenedAt > beforeOpen.lastOpenedAt,
    beforeOpen.lastOpenedAt + ' → ' + afterOpen.lastOpenedAt);
  check('opening a paper does not rewrite its content updatedAt', afterOpen.updatedAt === beforeOpen.updatedAt,
    beforeOpen.updatedAt + ' → ' + afterOpen.updatedAt);
  check('library return and offline behavior create no page errors', errors.length === 0, errors.join('; '));

  await context.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
