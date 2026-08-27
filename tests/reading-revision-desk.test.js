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
  await new Promise(resolve => server.listen(8133, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const text = 'Alpha passage identifies the exact oxygen-gradient method under review.\n\nA second paragraph keeps the manuscript long enough to navigate.';
    const comments = Array.from({ length: 20 }, (_, index) => ({
      id: 'review-' + (index + 1), sourceId: 'report-1', author: 'Reviewer 3',
      sourceGroup: index < 15 ? 'Major concerns' : 'Internal inconsistencies and corrections',
      sourceNumber: String(index + 1), text: 'Reviewer comment ' + (index + 1) + ' about the oxygen-gradient method.',
      level: index > 14 ? 'editorial' : 'specific', topic: index > 14 ? 'consistency' : 'methods',
      locationHint: 'Section 3.1', para: 0, start: 0, end: 13, quote: 'Alpha passage',
      anchors: [{ para: 0, start: 0, end: 13, quote: 'Alpha passage', method: 'ai' }],
      pdfAnchors: [], anchored: true, anchorMethod: 'ai', matchConfidence: .96,
      locationStatus: 'confident', replies: [], response: '', responseWrittenByUser: false,
      resolved: false, addedAt: Date.now()
    }));
    const chapter = {
      id: 'revision-paper', kind: 'text', title: 'Oxygen Gradient Revision', authors: 'Research Team',
      sourceName: 'revision.docx', fr: text, category: 'In review', reviewComments: comments,
      reviewReports: [{ id: 'report-1', name: 'reviewer.docx', extractorVersion: 4, addedAt: Date.now() }],
      reviewUpdatedAt: Date.now(), textHighlights: [], highlights: {}, readerHighlights: [], notes: {},
      readerNotes: {}, pageNotes: {}, questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: [],
      addedAt: Date.now(), updatedAt: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter], savedAt: Date.now(), deleted: {}, merged: {}, categoryOrder: ['In review'], categoryOrderUpdatedAt: Date.now() }));
    localStorage.removeItem('readingRoom.lastOpen.v1');
  });

  await page.goto('http://localhost:8133/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.click('[data-view="reviewPage"]');
  await page.waitForTimeout(150);
  if (pageErrors.length) throw new Error(pageErrors.join('; '));
  try { await page.waitForSelector('.revision-inbox-group', { timeout: 4000 }); }
  catch (error) {
    const debug = await page.evaluate(() => ({
      nav: document.querySelector('[data-view="reviewPage"]').textContent,
      desk: document.getElementById('reviewerDesk').innerHTML,
      libraryCount: document.getElementById('libraryCount').textContent,
      shelf: document.getElementById('shelf').textContent,
      error: document.getElementById('errorMessage').textContent,
      savedComments: ((JSON.parse(localStorage.getItem('readingRoom.v1') || '{}').chapters || [])[0] || {}).reviewComments?.length || 0
    }));
    throw new Error(error.message + '\n' + JSON.stringify(debug));
  }
  check('revision desk initially renders only twelve comments', await page.locator('.reviewer-inbox-card').count() === 12);
  check('reviewer concerns retain their source hierarchy', (await page.locator('.revision-inbox-group').first().textContent()).includes('Major concerns') && (await page.locator('.reviewer-inbox-card').first().textContent()).includes('Concern 1'));
  check('the remaining queue is available without a giant first render', await page.locator('#revisionShowMore').textContent().then(text => text.includes('8 remaining')));

  await page.fill('#revisionInboxSearch', 'comment 1 about');
  await page.waitForFunction(() => document.querySelectorAll('.reviewer-inbox-card').length === 1);
  check('revision search narrows comments and papers', (await page.locator('.reviewer-inbox-card').textContent()).includes('comment 1 about'));
  check('a verified item offers direct passage navigation', (await page.locator('[data-open-review-paper]').textContent()).includes('Open passage'));
  await page.click('[data-open-review-paper]');
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  try { await page.waitForSelector('.review-comment-anchor.is-focused', { timeout: 4000 }); }
  catch (error) {
    const debug = await page.evaluate(() => ({
      anchors: document.querySelectorAll('.review-comment-anchor').length,
      cards: document.querySelectorAll('[data-review-card]').length,
      focusedCards: document.querySelectorAll('[data-review-card].focused').length,
      text: document.getElementById('textDocument').textContent.slice(0, 300)
    }));
    throw new Error(error.message + '\n' + JSON.stringify(debug));
  }
  check('opening a revision item selects its exact manuscript passage', await page.locator('.review-comment-anchor.is-focused').count() > 0);
  check('revision desk flow has no page errors', pageErrors.length === 0, pageErrors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  server.close();
  process.exit(1);
});
