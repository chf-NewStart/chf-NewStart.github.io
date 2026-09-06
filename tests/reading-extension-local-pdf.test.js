const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\nPhloem local PDF test').buffer;

function backgroundHarness(options = {}) {
  const state = { actionHandler: null, createdTabs: [], removedTabs: [], pending: null, notices: [], optionsOpened: 0, fetches: [], messages: [], reloadedTabs: [], updatedTabs: [], focusedWindows: [], scriptCalls: [] };
  let createdTabId = 90;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      openOptionsPage: async () => { state.optionsOpened++; },
      getURL: name => 'chrome-extension://phloem/' + name
    },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    action: { onClicked: { addListener(handler) { state.actionHandler = handler; } }, setBadgeText() {} },
    notifications: { create(value) { state.notices.push(value); } },
    extension: { isAllowedFileSchemeAccess: async () => options.fileAllowed !== false },
    storage: { local: { set: async value => { state.pending = value.phloemPending; } } },
    scripting: {
      executeScript: async request => {
        state.scriptCalls.push(request.func && request.func.name);
        if (!options.executeScript) throw new Error('No scripted page response.');
        return [{ result: await options.executeScript(request, state) }];
      }
    },
    tabs: {
      query: async () => options.tabs || [],
      create: async value => {
        state.createdTabs.push(value);
        return Object.assign({ id: createdTabId++, status: 'loading' }, value, options.createdTab || {});
      },
      get: async id => options.getTab ? options.getTab(id, state) : { id, status: 'complete', url: state.createdTabs[0] && state.createdTabs[0].url },
      remove: async id => { state.removedTabs.push(id); },
      sendMessage: async (id, message) => {
        state.messages.push({ id, message });
        if (options.sendMessageFails) throw new Error('Receiving end does not exist.');
        return Object.prototype.hasOwnProperty.call(options, 'messageResponse') ? options.messageResponse : { protocol: 2 };
      },
      reload: async id => { state.reloadedTabs.push(id); },
      update: async (id, value) => { state.updatedTabs.push({ id, value }); }
    },
    windows: { update: async (id, value) => { state.focusedWindows.push({ id, value }); } }
  };
  const context = {
    chrome,
    URL,
    Uint8Array,
    Date,
    Math,
    decodeURIComponent,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout(handler) { handler(); return 1; },
    fetch: async (url, init) => {
      state.fetches.push({ url, init });
      if (options.fetchError) throw options.fetchError;
      return options.response || {
        ok: false,
        status: 0,
        headers: { get: () => null },
        arrayBuffer: async () => PDF_BYTES
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'carrel-extension/background.js'), 'utf8'), context);
  return { context, state };
}

function optionsHarness(options = {}) {
  const state = { pending: null, createdTabs: [], messages: [], reloadedTabs: [], updatedTabs: [] };
  const elements = {};
  ['fileStatus', 'checkAgain', 'localPdf', 'importStatus'].forEach(id => {
    elements[id] = {
      hidden: id === 'importStatus',
      className: '',
      textContent: '',
      value: '',
      addEventListener() {},
      classList: { toggle() {}, remove() {} }
    };
  });
  const context = {
    chrome: {
      extension: { isAllowedFileSchemeAccess: async () => true },
      storage: { local: { set: async value => { state.pending = value.phloemPending; } } },
      tabs: {
        query: async () => options.tabs || [],
        create: async value => { state.createdTabs.push(value); },
        sendMessage: async (id, message) => {
          state.messages.push({ id, message });
          if (options.sendMessageFails) throw new Error('Receiving end does not exist.');
          return Object.prototype.hasOwnProperty.call(options, 'messageResponse') ? options.messageResponse : { protocol: 2 };
        },
        reload: async id => { state.reloadedTabs.push(id); },
        update: async (id, value) => { state.updatedTabs.push({ id, value }); }
      },
      windows: { update: async () => {} }
    },
    document: {
      hidden: false,
      getElementById: id => elements[id],
      addEventListener() {}
    },
    window: { addEventListener() {} },
    Uint8Array,
    Date,
    Math,
    String,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout(handler) { handler(); return 1; }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'carrel-extension/options.js'), 'utf8'), context);
  return { context, state, elements };
}

function contentHarness(pending) {
  const state = { documentHandlers: {}, windowHandlers: {}, posted: [], removedKeys: [], messageResponses: [], timer: null };
  function makeElement(tag) {
    return {
      tag,
      id: '',
      className: '',
      textContent: '',
      children: [],
      removed: false,
      setAttribute() {},
      appendChild(child) { this.children.push(child); return child; },
      remove() { this.removed = true; },
      querySelector(selector) {
        const wanted = selector.charAt(0) === '.' ? selector.slice(1) : '';
        const queue = this.children.slice();
        while (queue.length) {
          const child = queue.shift();
          if (wanted && child.className === wanted) return child;
          queue.push(...(child.children || []));
        }
        return null;
      }
    };
  }
  const root = makeElement('html');
  const windowObject = {
    addEventListener(type, handler) { state.windowHandlers[type] = handler; },
    postMessage(data, origin, transfer) { state.posted.push({ data, origin, transfer: transfer || [] }); }
  };
  const context = {
    chrome: {
      storage: {
        local: {
          get(key, callback) { callback({ phloemPending: pending }); },
          remove(key) { state.removedKeys.push(key); }
        },
        onChanged: { addListener(handler) { state.storageHandler = handler; } }
      },
      runtime: { onMessage: { addListener(handler) { state.messageHandler = handler; } } }
    },
    document: {
      readyState: 'loading',
      documentElement: root,
      createElement: makeElement,
      addEventListener(type, handler) { state.documentHandlers[type] = handler; }
    },
    window: windowObject,
    location: { origin: 'https://houfu72.com' },
    Uint8Array,
    Date,
    String,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout(handler) { state.timer = handler; return 1; },
    clearTimeout() { state.timer = null; }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'carrel-extension/content.js'), 'utf8'), context);
  return { context, state, root };
}

(async () => {
  const local = backgroundHarness();
  assert.strictEqual(await local.context.importFromUrl('file:///Users/chf/Downloads/science.ado8575.pdf'), true);
  assert.strictEqual(local.state.fetches.length, 1);
  assert.strictEqual(local.state.pending.name, 'science.ado8575.pdf');
  assert.strictEqual(local.state.pending.sourceUrl, '');
  assert.ok(local.state.pending.b64.length > 0);
  assert.strictEqual(local.state.createdTabs.length, 1);
  assert.strictEqual(local.state.createdTabs[0].url, 'https://houfu72.com/reading.html');
  console.log('PASS  local file response status 0 is accepted after PDF signature validation');

  const oversizedLocal = backgroundHarness({
    response: {
      ok: false, status: 0, headers: { get: () => null },
      arrayBuffer: async () => ({ byteLength: 201 * 1024 * 1024 })
    }
  });
  assert.strictEqual(await oversizedLocal.context.importFromUrl('file:///Users/chf/Downloads/too-large.pdf'), false);
  assert.match(oversizedLocal.state.notices[0].message, /over 200 MB/);
  console.log('PASS  toolbar import shares the finite 200 MB memory guard');

  const denied = backgroundHarness({ fileAllowed: false });
  assert.strictEqual(await denied.context.importFromUrl('file:///Users/chf/Downloads/science.ado8575.pdf'), false);
  assert.strictEqual(denied.state.fetches.length, 0);
  assert.strictEqual(denied.state.optionsOpened, 1);
  console.log('PASS  denied file access opens the direct-import fallback');

  const hidden = backgroundHarness();
  assert.strictEqual(await hidden.state.actionHandler({ id: 42 }), false);
  assert.strictEqual(hidden.state.fetches.length, 0);
  assert.strictEqual(hidden.state.optionsOpened, 1);
  assert.match(hidden.state.notices[0].message, /Choose the PDF directly/);
  console.log('PASS  a hidden local tab URL opens the direct-import fallback');

  const web = backgroundHarness({
    response: { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => PDF_BYTES }
  });
  assert.strictEqual(await web.context.importFromUrl('https://example.com/missing.pdf'), false);
  assert.match(web.state.notices[0].message, /404/);
  console.log('PASS  network PDFs still require a successful HTTP response');

  const apsPdfUrl = 'https://journals.aps.org/prxlife/pdf/10.1103/PRXLife.3.022001';
  const apsAbstractUrl = 'https://journals.aps.org/prxlife/abstract/10.1103/PRXLife.3.022001';
  const challengeHeaders = {
    get: name => ({ 'cf-mitigated': 'challenge', 'content-type': 'text/html; charset=UTF-8' }[String(name).toLowerCase()] || null)
  };
  const pageFetchScript = async request => {
    const name = request.func && request.func.name;
    if (name === 'pageFetchReadiness') return { ready: true, href: apsAbstractUrl };
    if (name === 'pageFetchStart') return { ok: true, size: PDF_BYTES.byteLength, chunkCount: 1, disposition: 'attachment; filename="aps-paper.pdf"' };
    if (name === 'pageFetchChunk') return Buffer.from(new Uint8Array(PDF_BYTES)).toString('base64');
    if (name === 'pageFetchCleanup') return true;
    throw new Error('Unexpected injected function: ' + name);
  };
  const challengedAps = backgroundHarness({
    response: { ok: false, status: 403, headers: challengeHeaders, arrayBuffer: async () => { throw new Error('challenge HTML should not be read'); } },
    tabs: [{ id: 700, windowId: 7 }],
    createdTab: { id: 501 },
    executeScript: pageFetchScript
  });
  assert.strictEqual(await challengedAps.context.importFromUrl(apsPdfUrl), true);
  assert.strictEqual(challengedAps.state.createdTabs.length, 1);
  assert.strictEqual(challengedAps.state.createdTabs[0].url, apsAbstractUrl);
  assert.strictEqual(challengedAps.state.createdTabs[0].active, false);
  assert.deepStrictEqual(challengedAps.state.removedTabs, [501]);
  assert.strictEqual(challengedAps.state.pending.name, 'aps-paper.pdf');
  assert.strictEqual(challengedAps.state.pending.sourceUrl, apsPdfUrl);
  assert.deepStrictEqual(challengedAps.state.scriptCalls, ['pageFetchReadiness', 'pageFetchStart', 'pageFetchChunk', 'pageFetchCleanup']);
  assert.strictEqual(challengedAps.state.notices.length, 0);
  console.log('PASS  an APS Cloudflare challenge is recovered through a temporary same-origin article page');

  const hiddenApsChallenge = backgroundHarness({
    fetchError: new Error('Failed to fetch'),
    tabs: [{ id: 702, windowId: 7 }],
    createdTab: { id: 502 },
    executeScript: pageFetchScript
  });
  assert.strictEqual(await hiddenApsChallenge.context.importFromUrl(apsPdfUrl), true);
  assert.strictEqual(hiddenApsChallenge.state.pending.name, 'aps-paper.pdf');
  assert.deepStrictEqual(hiddenApsChallenge.state.removedTabs, [502]);
  assert.strictEqual(hiddenApsChallenge.state.notices.length, 0);
  console.log('PASS  APS recovery also runs when Chrome hides the challenged response');

  const challengedApsLink = backgroundHarness({
    response: { ok: false, status: 403, headers: challengeHeaders, arrayBuffer: async () => PDF_BYTES },
    tabs: [{ id: 701, windowId: 7 }],
    getTab: id => ({ id, status: 'complete', url: apsAbstractUrl }),
    executeScript: pageFetchScript
  });
  assert.strictEqual(await challengedApsLink.context.importFromUrl(apsPdfUrl, { id: 77, url: apsAbstractUrl }), true);
  assert.strictEqual(challengedApsLink.state.createdTabs.length, 0);
  assert.strictEqual(challengedApsLink.state.removedTabs.length, 0);
  assert.strictEqual(challengedApsLink.state.pending.name, 'aps-paper.pdf');
  console.log('PASS  an APS PDF link reuses its already-open article tab without a visible helper tab');

  const injectedPage = backgroundHarness();
  injectedPage.context.window = {};
  injectedPage.context.location = { origin: 'https://journals.aps.org', href: apsAbstractUrl };
  injectedPage.context.fetch = async url => ({
    ok: true,
    status: 200,
    headers: { get: name => String(name).toLowerCase() === 'content-type' ? 'application/pdf' : null },
    arrayBuffer: async () => PDF_BYTES.slice(0)
  });
  const injectedMeta = await injectedPage.context.pageFetchStart(apsPdfUrl, 'test-transfer', 1024 * 1024, 9);
  assert.strictEqual(injectedMeta.ok, true);
  assert.strictEqual(injectedMeta.chunkCount, Math.ceil(PDF_BYTES.byteLength / 9));
  const injectedChunks = [];
  for (let i = 0; i < injectedMeta.chunkCount; i++) injectedChunks.push(injectedPage.context.pageFetchChunk('test-transfer', i));
  assert.strictEqual(Buffer.concat(injectedChunks.map(value => Buffer.from(value, 'base64'))).toString(), Buffer.from(PDF_BYTES).toString());
  assert.strictEqual(injectedPage.context.pageFetchCleanup('test-transfer'), true);
  assert.strictEqual(injectedPage.context.window.__readInPhloemTransfers, undefined);
  console.log('PASS  the injected APS fetch validates, chunks, and clears real PDF bytes');

  const unsupportedChallenge = backgroundHarness({
    response: { ok: false, status: 403, headers: challengeHeaders, arrayBuffer: async () => PDF_BYTES }
  });
  assert.strictEqual(await unsupportedChallenge.context.importFromUrl('https://example.com/challenged.pdf'), false);
  assert.strictEqual(unsupportedChallenge.state.scriptCalls.length, 0);
  assert.match(unsupportedChallenge.state.notices[0].message, /403/);
  console.log('PASS  the page-context bridge remains limited to explicitly supported publishers');

  const stale = backgroundHarness({
    tabs: [{ id: 77, windowId: 9 }],
    sendMessageFails: true
  });
  assert.strictEqual(await stale.context.importFromUrl('file:///Users/chf/Downloads/science.ado8575.pdf'), true);
  assert.deepStrictEqual(stale.state.reloadedTabs, [77]);
  assert.strictEqual(stale.state.createdTabs.length, 0);
  assert.strictEqual(stale.state.updatedTabs[0].id, 77);
  assert.strictEqual(stale.state.focusedWindows[0].id, 9);
  console.log('PASS  a stale existing Phloem tab reloads before receiving the PDF');

  const picker = optionsHarness();
  const file = { name: 'science.ado8575.pdf', size: PDF_BYTES.byteLength, arrayBuffer: async () => PDF_BYTES };
  assert.strictEqual(await picker.context.importLocalPdf(file), true);
  assert.strictEqual(picker.state.pending.name, 'science.ado8575.pdf');
  assert.strictEqual(picker.state.pending.sourceUrl, '');
  assert.strictEqual(picker.elements.importStatus.className, 'import-status ready');
  assert.strictEqual(picker.state.createdTabs.length, 1);
  assert.strictEqual(picker.state.createdTabs[0].url, 'https://houfu72.com/reading.html');
  console.log('PASS  direct file picker transfers a local PDF without file-URL access');

  const largePicker = optionsHarness();
  const largeBook = { name: '658749937-次第花開-希阿榮博堪布.pdf', size: 126385421, arrayBuffer: async () => PDF_BYTES };
  assert.strictEqual(await largePicker.context.importLocalPdf(largeBook), true);
  assert.strictEqual(largePicker.state.pending.name, '658749937-次第花開-希阿榮博堪布.pdf');
  assert.strictEqual(largePicker.elements.importStatus.className, 'import-status ready');
  console.log('PASS  121 MB Chinese book clears the new large-PDF guard');

  const oversizedPicker = optionsHarness();
  let oversizedRead = false;
  const oversizedBook = { name: 'too-large.pdf', size: 201 * 1024 * 1024, arrayBuffer: async () => { oversizedRead = true; return PDF_BYTES; } };
  assert.strictEqual(await oversizedPicker.context.importLocalPdf(oversizedBook), false);
  assert.strictEqual(oversizedRead, false);
  assert.match(oversizedPicker.elements.importStatus.textContent, /over 200 MB/);
  console.log('PASS  finite 200 MB browser-memory guard remains explicit');

  const stalePicker = optionsHarness({ tabs: [{ id: 88, windowId: 10 }], sendMessageFails: true });
  assert.strictEqual(await stalePicker.context.importLocalPdf(file), true);
  assert.deepStrictEqual(stalePicker.state.reloadedTabs, [88]);
  assert.strictEqual(stalePicker.state.createdTabs.length, 0);
  assert.strictEqual(stalePicker.state.updatedTabs[0].id, 88);
  console.log('PASS  direct picker reloads a stale existing Phloem receiver');

  const contentSource = fs.readFileSync(path.join(ROOT, 'carrel-extension/content.js'), 'utf8');
  assert.match(contentSource, /phloem-deliver-pending/);
  console.log('PASS  Phloem content script exposes the pending-PDF receiver ping');

  const transferId = Date.now();
  const pending = {
    name: '00_Appointment_Brief_and_Checklist.pdf', sourceUrl: '', at: transferId,
    b64: [Buffer.from(new Uint8Array(PDF_BYTES)).toString('base64')]
  };
  const handoff = contentHarness(pending);
  const overlay = handoff.context.importOverlay;
  assert.ok(overlay && !overlay.removed);
  assert.strictEqual(handoff.state.posted.length, 0);
  handoff.state.windowHandlers.message({
    source: handoff.context.window,
    data: { type: 'phloem-ext-ready', protocol: 2 }
  });
  assert.strictEqual(handoff.state.removedKeys.length, 0);
  handoff.state.documentHandlers.DOMContentLoaded();
  assert.strictEqual(handoff.state.posted.length, 1);
  assert.strictEqual(handoff.state.posted[0].data.transferId, transferId);
  assert.strictEqual(handoff.state.posted[0].data.type, 'carrel-ext-import');
  assert.strictEqual(handoff.state.posted[0].transfer.length, 1);
  assert.strictEqual(handoff.state.posted[0].transfer[0], handoff.state.posted[0].data.bytes);
  console.log('PASS  PDF handoff waits for the app receiver and transfers the buffer instead of cloning it');
  handoff.state.windowHandlers.message({
    source: handoff.context.window,
    data: { type: 'phloem-ext-import-accepted', transferId }
  });
  assert.ok(!overlay.removed && handoff.state.timer);
  handoff.state.windowHandlers.message({
    source: handoff.context.window,
    data: { type: 'phloem-ext-import-complete', transferId, ok: true }
  });
  assert.deepStrictEqual(handoff.state.removedKeys, ['phloemPending']);
  assert.ok(overlay.removed);
  assert.strictEqual(handoff.context.importOverlay, null);
  console.log('PASS  pending bytes survive until Phloem confirms the PDF actually opened');

  let protocolReply = null;
  handoff.state.messageHandler({ type: 'phloem-deliver-pending' }, null, value => { protocolReply = value; });
  assert.strictEqual(protocolReply && protocolReply.protocol, 2);
  console.log('PASS  the current content relay identifies its handoff protocol');

  const cachedPage = contentHarness(Object.assign({}, pending, { at: transferId + 1 }));
  const cachedOverlay = cachedPage.context.importOverlay;
  cachedPage.state.documentHandlers.DOMContentLoaded();
  assert.deepStrictEqual(cachedPage.state.removedKeys, ['phloemPending']);
  assert.ok(cachedOverlay && !cachedOverlay.removed && cachedPage.state.timer);
  const compatibilityTimeout = cachedPage.state.timer;
  compatibilityTimeout();
  assert.ok(cachedOverlay.removed);
  assert.strictEqual(cachedPage.context.importOverlay, null);
  console.log('PASS  an older cached Phloem page releases the import cover without a refresh');

  const outdatedReceiver = backgroundHarness({ tabs: [{ id: 79, windowId: 9 }], messageResponse: undefined });
  assert.strictEqual(await outdatedReceiver.context.importFromUrl('file:///Users/chf/Downloads/science.ado8575.pdf'), true);
  assert.deepStrictEqual(outdatedReceiver.state.reloadedTabs, [79]);
  console.log('PASS  an outdated but still-listening Phloem relay is reloaded before handoff');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'carrel-extension/manifest.json'), 'utf8'));
  assert.strictEqual(manifest.version, '1.1.17');
  assert.ok(manifest.permissions.includes('scripting'));
  assert.strictEqual(manifest.content_scripts[0].run_at, 'document_start');
  assert.match(fs.readFileSync(path.join(ROOT, 'carrel-extension/options.html'), 'utf8'), /large books up to 200 MB/);
  const readingSource = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
  assert.match(readingSource, /phloem-ext-import-accepted/);
  assert.match(readingSource, /phloem-ext-import-complete/);
  assert.match(readingSource, /phloem-ext-ready/);
  assert.match(readingSource, /preparedBytes instanceof ArrayBuffer/);
  assert.match(readingSource, /Keep international filenames/);
  console.log('PASS  overlay starts before page paint and Phloem sends the completion acknowledgement');
})().catch(error => {
  console.error('FAIL ', error);
  process.exit(1);
});
