/* Rendering new PDF text updates the derived-data store, without saving the entire
   library. A review anchor repaired from that text is durable library data and must
   still be saved. Exercise the real reader and IndexedDB, without replacing app code. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const PAPER_ID = 'derived-persistence-fixture';
const SENTENCE = 'Probe position changed the measured oxygen concentration gradient across the vessel.';
const CLIPPED_QUOTE = 'measured oxygen concentration gradient';

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  if (pathname === '/fixture') {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><title>Storage fixture</title>');
    return;
  }
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});

async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  page.drawText(SENTENCE, { x: 35, y: 710, size: 11, font });
  page.drawText('Independent observations supported this result.', { x: 35, y: 670, size: 11, font });
  return Buffer.from(await pdf.save());
}

function observeLibraryWrites() {
  window.__libraryWrites = [];
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const result = setItem.call(this, key, value);
    if (this === localStorage && key === 'readingRoom.v1') {
      const paper = JSON.parse(value).chapters.find(ch => ch.id === 'derived-persistence-fixture');
      window.__libraryWrites.push({
        stack: new Error().stack || '',
        quote: paper && paper.reviewComments && paper.reviewComments[0] && paper.reviewComments[0].quote
      });
    }
    return result;
  };
}

async function seed(page, bytes, withReview) {
  await page.evaluate(async ({ bytes, withReview, id, clipped }) => {
    const stamp = Date.now();
    const reviewComments = withReview ? [{
      id: 'review-fixture', text: 'Please clarify how probe position affects the oxygen concentration gradient.',
      level: 'specific', page: 1, quote: clipped, anchored: true, anchorMethod: 'ai-pdf-quote',
      matchConfidence: .9, pdfAnchors: [{ page: 1, quote: clipped, confidence: .9, method: 'ai-pdf-quote' }],
      addedAt: stamp, updatedAt: stamp
    }] : [];
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{
      id, kind: 'pdf', title: 'Derived persistence fixture', sourceName: 'derived-persistence.pdf',
      authors: 'Fixture Author', contentHash: 'fixture-hash', fileSize: bytes.length, pageCount: 1,
      notes: {}, pageNotes: {}, questions: [], tags: [], reviewComments,
      addedAt: stamp, updatedAt: stamp, readPage: 1
    }], deleted: {}, merged: {}, savedAt: stamp }));
    localStorage.setItem('readingRoom.lastOpen.v1', id);
    localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll' }));
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('marginFiles', 2);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('pdfs');
        open.result.createObjectStore('derived');
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('pdfs', 'readwrite');
        transaction.objectStore('pdfs').put(new Uint8Array(bytes).buffer, id);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { bytes: [...bytes], withReview, id: PAPER_ID, clipped: CLIPPED_QUOTE });
}

async function waitForDerivedText(page) {
  await page.waitForFunction(async ({ id, sentence }) => new Promise(resolve => {
    const open = indexedDB.open('marginFiles', 2);
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('derived').objectStore('derived').get(id);
      read.onerror = () => { db.close(); resolve(false); };
      read.onsuccess = () => {
        const saved = read.result;
        db.close();
        resolve(!!(saved && saved.pageTexts && saved.pageTexts[0] && saved.pageTexts[0].includes(sentence)));
      };
    };
  }), { id: PAPER_ID, sentence: SENTENCE });
}

const renderWrites = page => page.evaluate(() => window.__libraryWrites.filter(write => write.stack.includes('renderPdfPageAt')));

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const launch = { headless: true };
  const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
  if (executablePath) launch.executablePath = executablePath;
  let browser;
  try {
    browser = await playwright[ENGINE].launch(launch);
    const bytes = await fixturePdf();
    for (const withReview of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(observeLibraryWrites);
      await page.goto(base + '/fixture');
      await seed(page, bytes, withReview);
      await page.goto(base + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('.pdf-page .text-layer')?.textContent.includes('Probe position'));
      await waitForDerivedText(page);
      const writes = await renderWrites(page);
      if (withReview) {
        assert.equal(writes.length, 1, 'the repaired review anchor triggers exactly one library save');
        assert.equal(writes[0].quote, SENTENCE, 'that save contains the complete repaired sentence');
      } else {
        assert.equal(writes.length, 0, 'extracting rebuildable page text does not save the entire library');
      }
      const stored = await page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id), PAPER_ID);
      assert.equal(stored.pageTexts, undefined, 'extracted text belongs in the derived store');
      if (withReview) {
        assert.equal(stored.reviewComments[0].quote, SENTENCE);
        assert.equal(stored.reviewComments[0].pdfAnchors[0].quote, SENTENCE);
        assert(stored.reviewUpdatedAt > 0, 'review repair receives a durable revision stamp');
      }
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('.pdf-page .text-layer')?.textContent.includes('Probe position'));
      await waitForDerivedText(page);
      assert.equal((await renderWrites(page)).length, 0, 'reopening with cached text and repaired anchors needs no render-time save');
      if (withReview) {
        const reopenedQuote = await page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id).reviewComments[0].quote, PAPER_ID);
        assert.equal(reopenedQuote, SENTENCE, 'the repaired anchor survives reopening');
      }
      assert.deepEqual(errors, []);
      console.log('PASS ' + ENGINE + ': ' + (withReview ? 'review repairs remain durable' : 'derived PDF text avoids whole-library saves'));
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
