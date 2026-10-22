/* Two tabs of Phloem share one saved library (localStorage). Each tab saved its whole
   in-memory copy, so the tab that saved last quietly undid what the other had saved: a
   highlight made in one tab vanished when the other tab highlighted something. Now only
   the tab in use saves. A tab opened while Phloem is in use elsewhere shows a bar, saves
   nothing, and its "Use Phloem here" asks the other tab to save and step aside, then
   reloads with everything saved. A tab opened while the other one is in the background
   takes over at once, and the background tab shows the bar when it comes back.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
let checks = 0;
function check(name, condition, extra) { checks++; assert.ok(condition, name + (extra === undefined ? '' : ' [' + JSON.stringify(extra) + ']')); console.log('PASS  ' + name); }

const server = http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0]), file = path.join(ROOT, url === '/' ? 'reading.html' : url);
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function makePdf(lines) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), page = doc.addPage([612, 792]);
  lines.forEach((line, i) => page.drawText(line, { x: 52, y: 710 - i * 38, size: 13, font }));
  return Buffer.from(await doc.save());
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')));
const paper = lib => lib.chapters.find(ch => ch.sourceName === 'two-tabs.pdf');
const highlightTexts = ch => Object.values((ch && ch.highlights) || {}).flat().map(h => h.text).sort();
const strokes = ch => (ch && ch.readingWorkspace && ch.readingWorkspace.strokes || []).length;
const shownHighlights = page => page.evaluate(() => new Set([...document.querySelectorAll('#pdfFrame .saved-highlight')].map(n => n.dataset.hlId)).size);
const barShown = page => page.evaluate(() => { const bar = document.getElementById('otherTabBar'); return !!bar && getComputedStyle(bar).display !== 'none'; });

async function select(page, phrase) {
  await page.waitForFunction(phrase => [...document.querySelectorAll('.pdf-page .text-layer span')].some(span => span.textContent.includes(phrase)), phrase);
  await page.evaluate(phrase => {
    const span = [...document.querySelectorAll('.pdf-page .text-layer span')].find(node => node.textContent.includes(phrase) && node.firstChild);
    const start = span.firstChild.textContent.indexOf(phrase), range = document.createRange();
    range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + phrase.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 92 }));
  }, phrase);
  await page.locator('#selectionCreateHighlight').waitFor({ state: 'visible' });
}
async function highlight(page, phrase) {
  await select(page, phrase);
  await page.locator('#selectionCreateHighlight [data-selection-highlight-color="yellow"]').click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
}
// A Workspace stroke whose save is still waiting for the Pencil to rest.
async function strokeWithoutRest(page) {
  await page.locator('#zenWorkspace').click(); await page.locator('#workspacePanel').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const board = document.getElementById('workspaceBoard'); board.setPointerCapture = () => {}; board.hasPointerCapture = () => false;
    const r = board.getBoundingClientRect(), emit = (type, x, y) => board.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + x, clientY: r.top + y, pressure: .6 }));
    emit('pointerdown', 80, 90); for (let k = 1; k < 12; k++) { emit('pointermove', 80 + k * 3, 90 + k * 2); await new Promise(res => setTimeout(res, 16)); } emit('pointerup', 113, 112);
  });
}
const setVisibility = (page, state) => page.evaluate(state => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}, state);
async function load(page, port) {
  await page.goto(`http://127.0.0.1:${port}/reading.html`);
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
}
async function openedPaper(page) {
  await page.waitForFunction(() => document.querySelector('.pdf-page canvas')?.width && document.querySelector('.pdf-page .text-layer span'));
  await page.waitForTimeout(700);
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const pdf = await makePdf(['Alpha line from the first tab.', 'Beta line from the second tab.', 'Gamma line saved by the first tab.', 'Delta line after switching.', 'Epsilon line from the newest tab.', 'Zeta line after closing.']);
  const browser = await playwright[ENGINE].launch();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const open = async () => { const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e))); return page; };

    const a = await open();
    await load(a, port);
    await a.locator('#pdfFile').setInputFiles({ name: 'two-tabs.pdf', mimeType: 'application/pdf', buffer: pdf });
    await openedPaper(a);
    await highlight(a, 'Alpha line');
    check('one tab alone: no bar, and its highlight is saved', !await barShown(a) && JSON.stringify(highlightTexts(paper(await stored(a)))) === '["Alpha line"]', highlightTexts(paper(await stored(a))));

    /* ---- a second tab while the first is in use ---- */
    const b = await open();
    await load(b, port);
    await openedPaper(b);
    await b.waitForTimeout(500);
    // The first tab highlights after the second one has loaded the library.
    await highlight(a, 'Gamma line');
    await highlight(b, 'Beta line');
    await a.waitForTimeout(300);
    check('the second tab\'s save does not overwrite the first tab\'s newer highlight', JSON.stringify(highlightTexts(paper(await stored(a)))) === '["Alpha line","Gamma line"]', highlightTexts(paper(await stored(a))));
    check('the second tab says Phloem is open in another tab', await barShown(b) && /open in another tab/.test(await b.locator('#otherTabBar').innerText()));
    check('and it tells the reader the change was not saved', /Not saved/.test(await b.locator('#readerToast').innerText()), await b.locator('#readerToast').innerText());

    /* ---- "Use Phloem here": the first tab saves what is waiting and steps aside ---- */
    await strokeWithoutRest(a);
    check('a stroke is still waiting to save in the first tab', strokes(paper(await stored(a))) === 0);
    await Promise.all([b.waitForEvent('load'), b.locator('#otherTabUse').click()]);
    await b.waitForFunction(() => document.body.classList.contains('library-ready'));
    await openedPaper(b);
    await b.waitForTimeout(500);
    check('after Use Phloem here, the first tab saved its waiting stroke', strokes(paper(await stored(b))) === 1, strokes(paper(await stored(b))));
    check('the first tab now shows the bar, the second does not', await barShown(a) && !await barShown(b));
    check('the second tab reloaded with everything the first one saved', await shownHighlights(b) === 2, await shownHighlights(b));
    await highlight(b, 'Delta line');
    await highlight(a, 'Epsilon line');
    await a.waitForTimeout(300);
    check('now the second tab saves and the first does not', JSON.stringify(highlightTexts(paper(await stored(b)))) === '["Alpha line","Delta line","Gamma line"]', highlightTexts(paper(await stored(b))));

    /* ---- a new tab while the writer is in the background takes over ---- */
    await setVisibility(b, 'hidden');
    const c = await open();
    await load(c, port);
    await openedPaper(c);
    await c.waitForTimeout(500);
    check('a tab opened while the other is in the background has no bar', !await barShown(c));
    await highlight(c, 'Epsilon line');
    check('and saves, keeping everything before it', JSON.stringify(highlightTexts(paper(await stored(c)))) === '["Alpha line","Delta line","Epsilon line","Gamma line"]', highlightTexts(paper(await stored(c))));
    await setVisibility(b, 'visible');
    await b.waitForTimeout(200);
    check('the background tab shows the bar when it comes back', await barShown(b));
    await highlight(b, 'Beta line');
    await c.waitForTimeout(300);
    check('and its next change does not overwrite the newer tab', !highlightTexts(paper(await stored(c))).includes('Beta line') && highlightTexts(paper(await stored(c))).length === 4, highlightTexts(paper(await stored(c))));

    /* ---- closing the tabs: the next one opened saves as usual ---- */
    for (const page of [a, b, c]) await page.close();
    const d = await open();
    await load(d, port);
    // The reader reopens the last paper, unless closing the tabs cleared it (Chromium).
    await d.waitForTimeout(1500);
    if (await d.locator('#readerPage').evaluate(node => node.classList.contains('hidden'))) await d.locator('.continue-reading-card').first().click();
    await openedPaper(d);
    await d.waitForTimeout(500);
    check('after the other tabs close, a new tab has no bar', !await barShown(d));
    await highlight(d, 'Zeta line');
    // A tab closed without pagehide (WebKit here) leaves a fresh mark: this tab asks, then saves.
    await d.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.sourceName === 'two-tabs.pdf').highlights || {}).flat().some(h => h.text === 'Zeta line'), null, { timeout: 5000 }).catch(() => {});
    check('and saves', highlightTexts(paper(await stored(d))).includes('Zeta line'), highlightTexts(paper(await stored(d))));
    await d.reload();
    await d.waitForFunction(() => document.body.classList.contains('library-ready'));
    await openedPaper(d);
    await d.waitForTimeout(500);
    check('a reload of the same tab has no bar', !await barShown(d));

    check('no page errors', !errors.length, errors);
    await context.close();

    /* ---- a tab that does not save does not sync either ---- */
    const synced = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await synced.addInitScript(() => localStorage.setItem('readingRoom.gdrive.v1', JSON.stringify({ on: true, tok: 'test-token', tokAt: Date.now(), email: 'reader@example.com' })));
    const drive = { body: null, version: 0, requests: new Map() };
    await synced.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await synced.route('https://www.googleapis.com/**', async route => {
      const request = route.request(), url = request.url(), method = request.method(), page = request.frame().page();
      drive.requests.set(page, (drive.requests.get(page) || 0) + 1);
      if (url.includes('/drive/v3/files?') && method === 'GET') return route.fulfill({ json: { files: drive.body ? [{ id: 'lib', name: 'carrel-library.json', size: String(drive.body.length), version: String(drive.version) }] : [] } });
      if (url.includes('/drive/v3/files/lib?alt=media')) return route.fulfill({ contentType: 'application/json', body: drive.body });
      if (url.includes('/upload/drive/v3/files/lib?uploadType=media') && method === 'PATCH') { drive.body = request.postData(); drive.version++; return route.fulfill({ json: { id: 'lib', version: String(drive.version) } }); }
      if (url.includes('uploadType=multipart') && method === 'POST') { const parts = request.postData().split(/\r\n--phloem\d+/); drive.body = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n'); drive.version++; return route.fulfill({ json: { id: 'lib', version: String(drive.version) } }); }
      return route.fulfill({ json: {} });
    });
    const sa = await synced.newPage(), sb = await synced.newPage();
    for (const page of [sa, sb]) { page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e))); }
    await load(sa, port);
    await sa.waitForFunction(() => /Google Drive|synced/.test(document.getElementById('syncSignal').textContent), null, { timeout: 15000 }).catch(() => {});
    await load(sb, port);
    await sb.waitForTimeout(3000);
    await sb.evaluate(() => document.getElementById('gdriveSyncBtn').click());
    await sb.waitForTimeout(1500);
    check('the writer syncs with Drive', (drive.requests.get(sa) || 0) > 0, drive.requests.get(sa));
    check('a tab that does not save makes no Drive request, even from Sync now', await barShown(sb) && !drive.requests.get(sb), drive.requests.get(sb));
    await synced.close();
    check('no page errors with Drive', !errors.length, errors);
    console.log(`\n${checks} checks passed (${ENGINE})`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
