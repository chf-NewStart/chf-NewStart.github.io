/* Every save writes the whole library, so a save per keystroke made typing a note lag
   once the library was large (about 160 ms per key on a throttled 4 MB library). Typing
   now saves once the keys pause, and hiding the page saves whatever is still waiting. */
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

function seed() {
  if (!localStorage.getItem('phloem.typingFixture')) {
    const stamp = Date.now();
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
      { id: 'typing-a', kind: 'text', title: 'Typing fixture',
        fr: 'First paragraph of a paper.\n\nSecond paragraph of the same paper.',
        notes: {}, pageNotes: {}, questions: [], tags: [], addedAt: stamp, updatedAt: stamp }
    ], deleted: {}, merged: {}, savedAt: stamp }));
    localStorage.setItem('readingRoom.lastOpen.v1', 'typing-a');
    localStorage.setItem('phloem.typingFixture', '1');
  }
  window.__librarySaves = 0;
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && key === 'readingRoom.v1') window.__librarySaves++;
    return setItem.call(this, key, value);
  };
}
const stored = page => page.evaluate(() => localStorage.getItem('readingRoom.v1') || '');
async function type(page, text) {
  for (const ch of text) {
    await page.evaluate(c => {
      const area = document.getElementById('pageNote');
      area.value += c;
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }, ch);
    await page.waitForTimeout(40);
  }
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
    await page.addInitScript(seed);
    await page.goto(base + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .original').length === 2);
    await page.waitForTimeout(800);

    await page.evaluate(() => { window.__librarySaves = 0; });
    await type(page, 'claim to check');
    const during = await page.evaluate(() => window.__librarySaves);
    assert(during <= 1, 'typing 14 keys wrote the library ' + during + ' times');
    console.log('PASS  typing does not save the library on every key  [' + during + ']');

    await page.waitForFunction(() => (localStorage.getItem('readingRoom.v1') || '').includes('claim to check'), null, { timeout: 4000 });
    console.log('PASS  the note is saved once typing pauses');

    await type(page, ' later');
    assert(!(await stored(page)).includes('claim to check later'), 'the last keys are still waiting');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    });
    assert((await stored(page)).includes('claim to check later'), 'hiding the page saves the waiting keys');
    console.log('PASS  hiding the page saves keys typed just before');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS  no page errors');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
