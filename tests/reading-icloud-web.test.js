let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

/* iCloud on the website: a fake CloudKit JS stands in for Apple's script so the test
   can check that the browser reads the library the iPad app wrote (same record names
   and fields as PhloemCloudPlugin.swift), uploads its own papers there, and fetches an
   iPad-only original when it is opened. */
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_ICLOUD_WEB_TEST_PORT || 8171);

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname === '/__phloem_icloud_fixture.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Phloem iCloud fixture</title>');
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

/* Runs in the page before reading.js. Records live in memory and assets are blob: URLs. */
function fakeCloudKit(seed) {
  window.PHLOEM_CLOUDKIT_CONFIG = { apiToken: 'test-token' };
  const store = window.__ckStore = { records: {}, tag: 0, signedIn: false, configured: null };
  const nextTag = () => 'tag-' + (++store.tag);
  /* Real asset downloadURLs are https; the reader's CSP blocks blob: in fetch, so the
     fake serves assets from same-origin /__ck/ URLs through a fetch shim. */
  const assets = {}, realFetch = window.fetch.bind(window);
  let assetSeq = 0;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    const match = url && url.match(/\/__ck\/(\d+)$/);
    if (match && assets[match[1]]) return Promise.resolve(new Response(assets[match[1]]));
    return realFetch(input, init);
  };
  async function documentName(id) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    return 'document-' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  if (location.protocol !== 'http:') return;
  const ready = (async () => {
    const bytes = await (await fetch('/assets/phloem-guide/phloem-field-guide.pdf')).arrayBuffer();
    store.records['library-v1'] = {
      recordType: 'PhloemLibrary', recordName: 'library-v1', recordChangeTag: nextTag(),
      fields: {
        payload: { value: new Blob([JSON.stringify(seed.library)], { type: 'application/json' }) },
        formatVersion: { value: 1, type: 'INT64' }
      }
    };
    const name = await documentName('ipad-paper');
    store.records[name] = {
      recordType: 'PhloemDocument', recordName: name, recordChangeTag: nextTag(),
      fields: {
        documentID: { value: 'ipad-paper' }, filename: { value: 'ipad-paper.pdf' }, mimeType: { value: 'application/pdf' },
        byteCount: { value: bytes.byteLength, type: 'INT64' }, contentHash: { value: '' },
        file: { value: new Blob([bytes], { type: 'application/pdf' }) }
      }
    };
    store.ipadBytes = bytes.byteLength;
  })();
  function out(record, desiredKeys) {
    const fields = {};
    Object.keys(record.fields).forEach(key => {
      if (desiredKeys && desiredKeys.indexOf(key) < 0) return;
      const field = record.fields[key];
      fields[key] = field.value instanceof Blob
        ? { value: { downloadURL: location.origin + '/__ck/' + (assets[++assetSeq] = field.value, assetSeq), size: field.value.size }, type: 'ASSETID' }
        : { value: field.value, type: field.type };
    });
    return { recordType: record.recordType, recordName: record.recordName, recordChangeTag: record.recordChangeTag, fields };
  }
  const notFound = name => ({ ckErrorCode: 'NOT_FOUND', recordName: name, reason: 'Record not found' });
  const database = {
    async fetchRecords(names, options) {
      await ready;
      const records = [], errors = [];
      names.forEach(name => store.records[name] ? records.push(out(store.records[name], options && options.desiredKeys)) : errors.push(notFound(name)));
      return { hasErrors: errors.length > 0, errors, records };
    },
    async saveRecords(records) {
      await ready;
      const saved = [], errors = [];
      records.forEach(record => {
        const existing = store.records[record.recordName];
        if ((existing && record.recordChangeTag !== existing.recordChangeTag) || (!existing && record.recordChangeTag)) {
          errors.push({ ckErrorCode: 'CONFLICT', recordName: record.recordName, reason: 'record changed' });
          return;
        }
        const kept = { recordType: record.recordType, recordName: record.recordName, recordChangeTag: nextTag(), fields: record.fields };
        store.records[record.recordName] = kept;
        saved.push(out(kept));
      });
      return { hasErrors: errors.length > 0, errors, records: saved };
    },
    async deleteRecords(names) {
      await ready;
      const records = [], errors = [];
      names.forEach(name => {
        if (store.records[name]) { delete store.records[name]; records.push({ recordName: name, deleted: true }); }
        else errors.push(notFound(name));
      });
      return { hasErrors: errors.length > 0, errors, records };
    },
    async performQuery(query) {
      await ready;
      const records = Object.values(store.records).filter(r => r.recordType === query.recordType).map(r => ({ recordName: r.recordName, fields: {} }));
      return { hasErrors: false, errors: [], records, moreComesBack: false };
    }
  };
  const container = {
    privateCloudDatabase: database,
    _auth: { _signInURL: location.origin + '/reading.html?ckWebAuthToken=fake%2Btoken+raw' },
    async setUpAuth() { return store.signedIn ? { userRecordName: '_tester' } : null; },
    whenUserSignsIn() { return new Promise(() => {}); }
  };
  window.CloudKit = {
    configure(config) {
      store.configured = config;
      // Real CloudKit JS reads the return token only from apiTokenAuth.
      const token = config.containers[0].apiTokenAuth.ckWebAuthToken;
      if (token) { store.signedIn = true; store.token = token; }
    },
    getDefaultContainer() { return container; }
  };
}

async function seedWebLibrary(page, chapters, stamp) {
  await page.goto('http://localhost:' + PORT + '/__phloem_icloud_fixture.html');
  await page.evaluate(async fixture => {
    localStorage.clear();
    localStorage.setItem('readingRoom.v1', JSON.stringify({
      chapters: fixture.chapters, deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, savedAt: fixture.stamp
    }));
    localStorage.setItem('readingRoom.libraryView', 'wall');
    const bytes = await (await fetch('/assets/phloem-guide/phloem-field-guide.pdf')).arrayBuffer();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('marginFiles', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('pdfs')) request.result.createObjectStore('pdfs');
        if (!request.result.objectStoreNames.contains('derived')) request.result.createObjectStore('derived');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const write = database.transaction('pdfs', 'readwrite').objectStore('pdfs').put(bytes, 'web-paper');
        write.onerror = () => reject(write.error);
        write.onsuccess = () => { database.close(); resolve(); };
      };
    });
  }, { chapters, stamp });
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const stamp = Date.now();
  const pdfSize = fs.statSync(path.join(ROOT, 'assets/phloem-guide/phloem-field-guide.pdf')).size;
  const webPaper = paper({ id: 'web-paper', kind: 'pdf', title: 'Paper added on the website', sourceName: 'web-paper.pdf', pageCount: 6, fileSize: pdfSize, updatedAt: stamp - 1000 }, stamp);
  const ipadPaper = paper({ id: 'ipad-paper', kind: 'pdf', title: 'Paper added on the iPad', sourceName: 'ipad-paper.pdf', pageCount: 6, fileSize: pdfSize, updatedAt: stamp - 2000 }, stamp);

  /* Without an API token the website keeps iCloud hidden. */
  const plainContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await plainContext.addInitScript(() => { window.PHLOEM_CLOUDKIT_CONFIG = { apiToken: '' }; });
  const plain = await plainContext.newPage();
  plain.setDefaultTimeout(12000);
  await seedWebLibrary(plain, [webPaper], stamp);
  await plain.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await plain.waitForFunction(() => document.body.classList.contains('library-ready'));
  check('iCloud stays hidden on the website until an API token is set',
    await plain.evaluate(() => document.getElementById('icloudSettings').classList.contains('native-only')));
  await plainContext.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.addInitScript(fakeCloudKit, {
    library: { chapters: [ipadPaper], deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, savedAt: stamp - 2000 }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await seedWebLibrary(page, [webPaper], stamp);
  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));

  check('with a token, Settings shows Sync with iCloud on the website',
    await page.evaluate(() => !document.getElementById('icloudSettings').classList.contains('native-only')));
  await page.evaluate(() => { document.getElementById('settingsDialog').showModal(); });
  check('the off state names this browser, not an iPad',
    (await page.textContent('#icloudStatus')).includes('this device') || (await page.textContent('#icloudStatus')).includes('this browser'),
    await page.textContent('#icloudStatus'));

  /* Turning iCloud on sends the tab to Apple's sign-in page, which returns to the
     reader with ?ckWebAuthToken=… (here the fake skips straight to the return). */
  await Promise.all([page.waitForNavigation(), page.click('#icloudEnableBtn')]);
  await page.waitForFunction(() => /Synced with your private iCloud library/.test(document.getElementById('icloudStatus').textContent)).catch(async error => { console.log('status:', await page.textContent('#icloudStatus'), errors); throw error; });

  const returned = await page.evaluate(() => ({ url: location.href, token: window.__ckStore.token, appleButton: !document.getElementById('icloudAppleSignInBox').classList.contains('hidden'), open: document.getElementById('settingsDialog').open }));
  check('the returned token reaches CloudKit JS intact, with + kept', returned.token === 'fake+token+raw', returned.token);
  check('the token is removed from the address bar', !/ckWebAuthToken/.test(returned.url), returned.url);
  check('Apple’s own black button never shows', !returned.appleButton);
  check('Settings reopens on the iCloud result after the return', returned.open);

  const config = await page.evaluate(() => window.__ckStore.configured);
  const container = config && config.containers && config.containers[0];
  check('CloudKit JS is configured for the app’s container in production',
    container && container.containerIdentifier === 'iCloud.com.houfu72.phloem' && container.environment === 'production' && container.apiTokenAuth.persist === true,
    JSON.stringify(container && { id: container.containerIdentifier, env: container.environment }));

  const local = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.map(ch => ch.id).sort().join(','));
  check('the iPad’s paper is merged into the website library', local === 'ipad-paper,web-paper', local);

  const cloud = await page.evaluate(async () => {
    const store = window.__ckStore, library = store.records['library-v1'];
    const payload = JSON.parse(await library.fields.payload.value.text());
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('web-paper'));
    const name = 'document-' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    const doc = store.records[name];
    return {
      ids: payload.chapters.map(ch => ch.id).sort().join(','),
      formatType: library.fields.formatVersion.type,
      doc: doc && { id: doc.fields.documentID.value, byteType: doc.fields.byteCount.type, bytes: doc.fields.byteCount.value, size: doc.fields.file.value.size, mime: doc.fields.mimeType.value }
    };
  });
  check('the iCloud library now holds both papers', cloud.ids === 'ipad-paper,web-paper', cloud.ids);
  check('library fields keep the native INT64 type', cloud.formatType === 'INT64', cloud.formatType);
  check('the website’s original is uploaded under the native record name and fields',
    cloud.doc && cloud.doc.id === 'web-paper' && cloud.doc.byteType === 'INT64' && cloud.doc.bytes === pdfSize && cloud.doc.size === pdfSize && cloud.doc.mime === 'application/pdf',
    JSON.stringify(cloud.doc));

  const syncSignal = await page.textContent('#syncSignal');
  check('the sync signal shows iCloud', /iCloud/.test(syncSignal), syncSignal);

  /* Opening the iPad-only paper downloads its original into this browser. */
  await page.evaluate(() => document.getElementById('settingsDialog').close());
  const downloaded = await page.evaluate(async () => {
    window.__ckStore.downloads = 0;
    const card = document.querySelector('[data-continue-paper="ipad-paper"], [data-id="ipad-paper"]');
    if (card) card.click();
    for (let i = 0; i < 100; i++) {
      const size = await new Promise(resolve => {
        const request = indexedDB.open('marginFiles');
        request.onsuccess = () => {
          const get = request.result.transaction('pdfs').objectStore('pdfs').get('ipad-paper');
          get.onsuccess = () => { resolve(get.result ? get.result.byteLength : 0); request.result.close(); };
          get.onerror = () => resolve(0);
        };
        request.onerror = () => resolve(0);
      });
      if (size) return { found: !!card, size };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { found: !!card, size: 0 };
  });
  check('opening an iPad-only paper downloads its original from iCloud', downloaded.found && downloaded.size === pdfSize, JSON.stringify(downloaded));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); server.close(); process.exit(1); });
