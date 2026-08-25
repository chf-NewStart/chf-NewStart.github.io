const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\nPhloem local PDF test').buffer;

function backgroundHarness(options = {}) {
  const state = { actionHandler: null, createdTabs: [], pending: null, notices: [], optionsOpened: 0, fetches: [], messages: [], reloadedTabs: [], updatedTabs: [], focusedWindows: [] };
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
    tabs: {
      query: async () => options.tabs || [],
      create: async value => { state.createdTabs.push(value); },
      sendMessage: async (id, message) => {
        state.messages.push({ id, message });
        if (options.sendMessageFails) throw new Error('Receiving end does not exist.');
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
    fetch: async (url, init) => {
      state.fetches.push({ url, init });
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
    btoa: value => Buffer.from(value, 'binary').toString('base64')
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'carrel-extension/options.js'), 'utf8'), context);
  return { context, state, elements };
}

function contentHarness(pending) {
  const state = { documentHandlers: {}, windowHandlers: {}, posted: [], removedKeys: [], timer: null };
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
    postMessage(data, origin) { state.posted.push({ data, origin }); }
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
  handoff.state.documentHandlers.DOMContentLoaded();
  assert.strictEqual(handoff.state.posted.length, 1);
  assert.strictEqual(handoff.state.posted[0].data.transferId, transferId);
  assert.strictEqual(handoff.state.posted[0].data.type, 'carrel-ext-import');
  handoff.state.windowHandlers.message({
    source: handoff.context.window,
    data: { type: 'phloem-ext-import-complete', transferId, ok: true }
  });
  assert.ok(overlay.removed);
  assert.strictEqual(handoff.context.importOverlay, null);
  console.log('PASS  import overlay covers the old paper until Phloem acknowledges completion');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'carrel-extension/manifest.json'), 'utf8'));
  assert.strictEqual(manifest.content_scripts[0].run_at, 'document_start');
  assert.match(fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8'), /phloem-ext-import-complete/);
  console.log('PASS  overlay starts before page paint and Phloem sends the completion acknowledgement');
})().catch(error => {
  console.error('FAIL ', error);
  process.exit(1);
});
