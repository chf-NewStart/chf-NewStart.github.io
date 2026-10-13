/* The iPad froze for seconds after a Pencil stroke with a large annotated book open
   (Oct 2026). Each stroke's save started a quiet sync, and every sync downloaded the
   library this device had just uploaded, parsed it, merged it back paper by paper and
   read every original PDF's bytes from storage, 33 MB for that book alone. A sync now
   recognises its own last upload (the iCloud change tag, the Drive file version): it
   skips the parse and merge, uploads only when something changed, and only looks up
   whether an original is stored instead of reading it. A change from another device
   still merges. Runs the real reader with a fake iPad iCloud plugin and a mocked Drive.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
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
async function makePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) doc.addPage([612, 792]).drawText('Phloem carries sugar from source to sink, page ' + i, { x: 60, y: 700, size: 14, font });
  return Buffer.from(await doc.save());
}

// Spies installed before the reader loads: big JSON parses and reads of stored originals.
function spies() {
  window.__spy = { bigParses: 0, pdfReads: 0 };
  const parse = JSON.parse;
  JSON.parse = function (text) { if (typeof text === 'string' && text.length > 100 && text.includes('"chapters":[') && /iCloudSync/.test(new Error().stack)) { window.__spy.bigParses++; (window.__spy.stacks = window.__spy.stacks || []).push(new Error().stack.split('\n').slice(1, 4).join(' | ')); } return parse.apply(this, arguments); };
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function () { if (this.name === 'pdfs') window.__spy.pdfReads++; return get.apply(this, arguments); };
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
}
// The iPad app's PhloemCloud plugin, in memory, with CloudKit's change tags.
function fakeICloud() {
  localStorage.setItem('readingRoom.icloud.v1', JSON.stringify({ on: true, enabledAt: Date.now() }));
  const cloud = window.__cloud = { record: null, tag: 0, docs: {}, log: [] };
  window.PHLOEM_NATIVE = true;
  window.Capacitor = { Plugins: { PhloemCloud: {
    status: async () => ({ available: true, accountStatus: 'available' }),
    fetchLibrary: async () => { cloud.log.push('fetch'); return cloud.record ? { found: true, payload: cloud.record, changeTag: 'tag-' + cloud.tag } : { found: false }; },
    saveLibrary: async options => {
      if (cloud.record && options.changeTag !== 'tag-' + cloud.tag) { const error = new Error('conflict'); error.code = 'ICLOUD_CONFLICT'; throw error; }
      cloud.log.push('save'); cloud.record = options.payload; cloud.tag++; return { changeTag: 'tag-' + cloud.tag };
    },
    fetchDocuments: async () => ({ documents: Object.values(cloud.docs) }),
    uploadDocument: async options => { cloud.log.push('upload'); cloud.docs[options.id] = { id: options.id, byteCount: options.bytes.byteLength, contentHash: options.contentHash }; return {}; },
    deleteDocuments: async () => ({})
  } } };
}
// Hidden then visible: the reader syncs at once when the page is put away.
async function syncNow(page, done) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  await page.waitForFunction(done, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
async function openPdf(page, port, pdf) {
  await page.goto(`http://127.0.0.1:${port}/reading.html`);
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.locator('#pdfFile').setInputFiles({ name: 'munch.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady === 'true');
  await page.waitForTimeout(600);
}
// A Workspace stroke, the edit from the report; its save waits for the Pencil to rest.
async function writeStroke(page, dx) {
  if (!await page.locator('#workspacePanel').isVisible()) { await page.locator('#zenWorkspace').click(); await page.locator('#workspacePanel').waitFor({ state: 'visible' }); }
  await page.evaluate(async dx => {
    const board = document.getElementById('workspaceBoard'); board.setPointerCapture = () => {}; board.hasPointerCapture = () => false;
    const r = board.getBoundingClientRect(), emit = (type, x, y) => board.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + x, clientY: r.top + y, pressure: .6 }));
    emit('pointerdown', 80 + dx, 90); for (let k = 1; k < 12; k++) { emit('pointermove', 80 + dx + k * 3, 90 + k * 2); await new Promise(res => setTimeout(res, 16)); } emit('pointerup', 80 + dx + 33, 112);
  }, dx);
  await page.waitForTimeout(1700);
}
const strokesIn = payload => JSON.parse(payload).chapters.reduce((n, ch) => n + (ch.readingWorkspace && ch.readingWorkspace.strokes ? ch.readingWorkspace.strokes.length : 0), 0);

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const pdf = await makePdf(), browser = await playwright[ENGINE].launch();
  try {
    /* ---- iCloud on the iPad ---- */
    let context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }), page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(spies); await page.addInitScript(fakeICloud);
    await openPdf(page, port, pdf);
    await syncNow(page, () => window.__cloud.log.includes('upload'));
    const firstLog = await page.evaluate(() => window.__cloud.log.join());
    check('the first sync uploads the library and the original', firstLog.includes('save') && firstLog.includes('upload'), firstLog);

    await writeStroke(page, 0);
    let before = await page.evaluate(() => ({ ...window.__spy, saves: window.__cloud.log.filter(x => x === 'save').length }));
    await syncNow(page, saves => window.__cloud.log.filter(x => x === 'save').length > saves, before.saves);
    let after = await page.evaluate(() => ({ ...window.__spy, log: window.__cloud.log.slice(), record: window.__cloud.record }));
    check('after a stroke, the sync does not parse and merge its own last upload again', after.bigParses === before.bigParses, { before: before.bigParses, after: after.bigParses, stacks: after.stacks, log: after.log });
    check('and does not read the original PDF, which is already in iCloud', after.pdfReads === before.pdfReads, { before: before.pdfReads, after: after.pdfReads });
    check('the stroke still reaches iCloud', strokesIn(after.record) === 1 && after.log.slice(-2).join() === 'fetch,save', after.log);

    const saves = await page.evaluate(() => window.__cloud.log.filter(x => x === 'save').length);
    await writeStroke(page, 60);
    await syncNow(page, n => window.__cloud.log.filter(x => x === 'save').length > n, saves);
    check('a second stroke uploads again, still without re-reading the cloud copy', strokesIn(await page.evaluate(() => window.__cloud.record)) === 2 && (await page.evaluate(() => window.__spy.bigParses)) === after.bigParses);

    // Another device writes: the change tag moves on, and the merge happens as before.
    await page.evaluate(() => { const lib = JSON.parse(window.__cloud.record); const ch = lib.chapters.find(c => c.kind === 'pdf' && c.sourceName === 'munch.pdf');
      ch.title = 'Renamed on the Mac'; ch.fieldUpdatedAt = Object.assign({}, ch.fieldUpdatedAt, { title: Date.now() + 1000 }); ch.updatedAt = Date.now() + 1000; window.__cloud.record = JSON.stringify(lib); window.__cloud.tag++; });
    await writeStroke(page, 120);
    const merged = await page.evaluate(() => window.__spy.bigParses);
    await syncNow(page, () => (JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.sourceName === 'munch.pdf') || {}).title === 'Renamed on the Mac');
    await page.waitForFunction(() => window.__cloud.record.includes('Renamed on the Mac') && JSON.parse(window.__cloud.record).chapters.some(c => c.readingWorkspace && c.readingWorkspace.strokes.length === 3), null, { timeout: 15000 }).catch(() => {});
    const third = await page.evaluate(() => ({ parses: window.__spy.bigParses, log: window.__cloud.log.slice(-6) }));
    check('a change from another device is still downloaded and merged', third.parses > merged && strokesIn(await page.evaluate(() => window.__cloud.record)) === 3, { merged, third, strokes: strokesIn(await page.evaluate(() => window.__cloud.record)) });
    check('no page errors with iCloud', !errors.length, errors);
    await context.close();

    /* ---- Google Drive (web) ---- */
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(spies);
    await page.addInitScript(() => localStorage.setItem('readingRoom.gdrive.v1', JSON.stringify({ on: true, tok: 'test-token', tokAt: Date.now(), email: 'reader@example.com' })));
    const drive = { body: null, version: 0, downloads: 0, uploads: 0 };
    await context.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await context.route('https://www.googleapis.com/**', async route => {
      const request = route.request(), url = request.url(), method = request.method();
      if (url.includes('/drive/v3/files?') && method === 'GET') return route.fulfill({ json: { files: drive.body ? [{ id: 'lib', name: 'carrel-library.json', size: String(drive.body.length), version: String(drive.version) }] : [] } });
      if (url.includes('/drive/v3/files/lib?alt=media')) { drive.downloads++; return route.fulfill({ contentType: 'application/json', body: drive.body }); }
      if (url.includes('/upload/drive/v3/files/lib?uploadType=media') && method === 'PATCH') { drive.uploads++; drive.body = request.postData(); drive.version++; return route.fulfill({ json: { id: 'lib', version: String(drive.version) } }); }
      if (url.includes('uploadType=multipart') && method === 'POST') { drive.uploads++; const raw = request.postData(), parts = raw.split(/\r\n--phloem\d+/); drive.body = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n'); drive.version++; return route.fulfill({ json: { id: 'lib', version: String(drive.version) } }); }
      return route.fulfill({ status: 503, body: '' });
    });
    await openPdf(page, port, pdf);
    await syncNow(page, () => true); await page.waitForFunction(() => /Synced with your Google Drive|paused/.test(document.getElementById('gdriveStatus').textContent), null, { timeout: 15000 });
    check('Drive: the first sync uploads the library', drive.uploads >= 1 && drive.downloads === 0, { uploads: drive.uploads, downloads: drive.downloads });
    await writeStroke(page, 0);
    const driveBefore = { ...drive, parses: await page.evaluate(() => window.__spy.bigParses) };
    await syncNow(page, () => true); await page.waitForTimeout(200);
    for (let i = 0; i < 50 && drive.uploads === driveBefore.uploads; i++) await page.waitForTimeout(100);
    check('Drive: after a stroke, the sync uploads without downloading its own copy again', drive.uploads === driveBefore.uploads + 1 && drive.downloads === driveBefore.downloads && strokesIn(drive.body) === 1, { uploads: drive.uploads, downloads: drive.downloads, before: [driveBefore.uploads, driveBefore.downloads] });
    drive.body = JSON.stringify(Object.assign(JSON.parse(drive.body), { categoryOrder: ['From the Mac'], categoryOrderUpdatedAt: Date.now() + 1000 })); drive.version++;
    await writeStroke(page, 60);
    await syncNow(page, () => true); for (let i = 0; i < 50 && drive.downloads === driveBefore.downloads; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(400);
    check('Drive: a newer version from another device is downloaded and merged', drive.downloads === driveBefore.downloads + 1 && JSON.parse(drive.body).categoryOrder.includes('From the Mac') && strokesIn(drive.body) === 2, { uploads: drive.uploads, downloads: drive.downloads, strokes: strokesIn(drive.body) });
    check('no page errors with Drive', !errors.length, errors);
    console.log(`${checks} checks passed (${ENGINE})`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
