/* A real full store still accepts a write the size of what it already holds, so the
   page-hide cursor save (which patches the stored library) used to succeed on the stale
   copy and then copy that stale library over the newer device snapshot. In the iPad app,
   where the merged library outgrows localStorage, sending the app to the background
   could then drop recent notes and handwriting. With the store full, a page-hide save
   now writes the newest library to the device snapshot instead. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});

function seedAndFillStorage() {
  if (!localStorage.getItem('phloem.storageFullFixture')) {
    const stamp = Date.now();
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
      { id: 'full-a', kind: 'text', title: 'Full storage fixture',
        fr: 'First paragraph of a paper.\n\nSecond paragraph of the same paper.',
        notes: {}, pageNotes: {}, questions: [], tags: [], addedAt: stamp, updatedAt: stamp }
    ], deleted: {}, merged: {}, savedAt: stamp }));
    localStorage.setItem('readingRoom.lastOpen.v1', 'full-a');
    localStorage.setItem('readingRoom.notebookCollapsed.v1', '0');
    localStorage.setItem('phloem.storageFullFixture', '1');
  }
  /* Like a real quota: the library key takes values up to a fixed size and refuses
     anything larger. The limit sits a little above the opened library, so cursor-sized
     changes fit and a new note does not. */
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && key === 'readingRoom.v1') {
      const limit = +(sessionStorage.getItem('phloem.quota') || 0);
      if (limit && String(value).length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return setItem.call(this, key, value);
  };
}
async function snapshot(page) {
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
async function openClips(page) {
  if (!await page.locator('#excerptsTab').isVisible()) {
    if (!await page.locator('#notebook').evaluate(el => el.classList.contains('sheet-open'))) {
      await page.locator('#zenMore').click();
      await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
      await page.locator('#zenNotebook').click();
      await page.waitForFunction(() => document.getElementById('notebook').classList.contains('sheet-open'));
    }
  }
  await page.locator('#excerptsTab').click();
}
async function waitReader(page) {
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden')
    && document.querySelectorAll('#textDocument .original').length === 2);
}
async function waitFor(check, label) {
  for (let attempt = 0; attempt < 50; attempt++) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(label);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await playwright.chromium.launch(launch);
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seedAndFillStorage);
    await page.goto(base + '/reading.html', { waitUntil: 'load' });
    await waitReader(page);
    await page.waitForTimeout(800);
    // The store is now "full": only values up to the opened library's size (plus room
    // for a cursor) still fit.
    await page.evaluate(() => sessionStorage.setItem('phloem.quota', String(localStorage.getItem('readingRoom.v1').length + 400)));
    await openClips(page);

    await page.locator('#newExcerptNote').click();
    const card = page.locator('.excerpt-card').first();
    await card.waitFor({ state: 'visible' });
    const note = 'Written while the small store is full, '.repeat(20);
    await card.locator('textarea.excerpt-note').fill(note);
    assert.equal(await card.locator('.excerpt-card-status').textContent(), 'Saved');
    assert(!(await page.evaluate(() => localStorage.getItem('readingRoom.v1'))).includes(note),
      'the fixture really kept localStorage stale');
    await waitFor(async () => (await snapshot(page)).includes(note), 'the device snapshot holds the new note');

    // The app goes to the background: the page is hidden and the cursor is saved.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    });
    await page.waitForTimeout(600);
    assert((await snapshot(page)).includes(note), 'hiding the page keeps the new note in the device snapshot');

    await page.evaluate(() => { delete document.visibilityState; });
    await page.reload({ waitUntil: 'load' });
    await waitReader(page);
    await openClips(page);
    await page.waitForFunction(text => [...document.querySelectorAll('.excerpt-card textarea.excerpt-note')]
      .some(input => input.value === text), note);
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS  a page-hide save with a full store keeps the newest library');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
