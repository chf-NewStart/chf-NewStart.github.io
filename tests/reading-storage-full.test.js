/* When the ~5 MB localStorage library store is full (the iPad app hit this once its
   library merged device, iCloud and Google Drive copies), edits must still save to the
   IndexedDB snapshot, report "Saved", and come back after a reload. */
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
  // From here on the library key behaves like a full store.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && key === 'readingRoom.v1') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
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
    await openClips(page);

    await page.locator('#newExcerptNote').click();
    const card = page.locator('.excerpt-card').first();
    await card.waitFor({ state: 'visible' });
    const note = 'Written while the small store is full';
    await card.locator('textarea.excerpt-note').fill(note);
    assert.equal(await card.locator('.excerpt-card-status').textContent(), 'Saved',
      'a note saves to the device snapshot when localStorage is full');
    assert.doesNotMatch(await page.locator('#excerptsPanel').textContent(), /Not confirmed saved|Could not save/,
      'no failure status is shown');
    assert.equal(await page.locator('#errorDialog').evaluate(dialog => dialog.open), false,
      'no storage dialog interrupts the reader');
    assert(!(await page.evaluate(() => localStorage.getItem('readingRoom.v1'))).includes(note),
      'the fixture really kept localStorage stale');

    let saved = '';
    for (let attempt = 0; attempt < 40 && !saved.includes(note); attempt++) {
      await page.waitForTimeout(100);
      saved = await snapshot(page);
    }
    assert(saved.includes(note), 'the IndexedDB snapshot holds the new note');

    await page.reload({ waitUntil: 'load' });
    await waitReader(page);
    await openClips(page);
    await page.waitForFunction(text => [...document.querySelectorAll('.excerpt-card textarea.excerpt-note')]
      .some(input => input.value === text), note);
    const after = await snapshot(page);
    assert(after.includes(note), 'startup does not overwrite the newer snapshot with the stale store');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS  storage-full saves go to the device snapshot and survive reload');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
