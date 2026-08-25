const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\nPhloem local PDF test').buffer;

function backgroundHarness(options = {}) {
  const state = { actionHandler: null, createdTabs: [], pending: null, notices: [], optionsOpened: 0, fetches: [] };
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
      query: async () => [],
      create: async value => { state.createdTabs.push(value); },
      update: async () => {}
    },
    windows: { update: async () => {} }
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

function optionsHarness() {
  const state = { pending: null, createdTabs: [] };
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
        query: async () => [],
        create: async value => { state.createdTabs.push(value); },
        update: async () => {}
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

  const picker = optionsHarness();
  const file = { name: 'science.ado8575.pdf', size: PDF_BYTES.byteLength, arrayBuffer: async () => PDF_BYTES };
  assert.strictEqual(await picker.context.importLocalPdf(file), true);
  assert.strictEqual(picker.state.pending.name, 'science.ado8575.pdf');
  assert.strictEqual(picker.state.pending.sourceUrl, '');
  assert.strictEqual(picker.elements.importStatus.className, 'import-status ready');
  assert.strictEqual(picker.state.createdTabs.length, 1);
  assert.strictEqual(picker.state.createdTabs[0].url, 'https://houfu72.com/reading.html');
  console.log('PASS  direct file picker transfers a local PDF without file-URL access');
})().catch(error => {
  console.error('FAIL ', error);
  process.exit(1);
});
