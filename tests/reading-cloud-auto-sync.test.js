/* Real import/provider functions with delayed local storage and in-memory cloud
   fixtures. No credentials, OAuth windows, or external cloud requests are used. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `section exists: ${start}`);
  return source.slice(from, to);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function importHarness(kind) {
  const storage = deferred(), reader = deferred(), queued = [], states = [], errors = [];
  const bytes = Uint8Array.from([0x50, 0x4b, 1, 2]).buffer;
  const context = vm.createContext({
    ArrayBuffer, Uint8Array, state: { chapters: [] }, now: () => 1000000,
    byId: () => ({ textContent: 'Import' }), uid: () => 'new-paper', normalize: x => x,
    pdfFingerprint: async () => 'file-hash', filenameTitle: () => 'New paper',
    loadPdfLib: async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) }) }),
    derivePdfDetails: async () => ({ title: 'New paper', authors: '' }),
    parseDocx: async () => ({ paragraphs: ['New draft.'], kinds: [], comments: [], trackedChanges: {} }),
    matchPriorReviewComments: () => [],
    putPdf: () => storage.promise,
    find: id => context.state.chapters.find(ch => ch.id === id),
    gdriveOn: () => true, iCloudOn: () => true,
    gdriveSetPdfState: (id, value) => states.push({ provider: 'drive', id, value }),
    iCloudSetDocumentState: (id, value) => states.push({ provider: 'icloud', id, value }),
    scheduleSync: () => queued.push('source-ready'), persist: () => queued.push('metadata'),
    renderShelf() {}, updateReviewBadge() {}, showReaderToast() {},
    showError: error => errors.push(error), openReader: () => reader.promise, currentId: 'new-paper'
  });
  vm.runInContext(section('  function findImportedPaper(', '  function importSourceFile('), context);
  const file = { name: `new-paper.${kind}`, arrayBuffer: async () => bytes };
  const done = kind === 'pdf' ? context.importPdf(file) : context.importDocx(file);
  return { context, storage, reader, queued, states, errors, done };
}

for (const kind of ['pdf', 'docx']) {
  test(`${kind} import queues both originals after durable storage, even while the reader is opening`, async () => {
    const h = importHarness(kind);
    await settle();
    assert.equal(h.context.state.chapters.length, 1);
    assert.deepEqual(h.queued, ['metadata']);
    assert.equal(h.states.length, 0, 'no original claimed queued before storage commits');
    h.storage.resolve(true); await settle();
    assert.deepEqual(h.queued, ['metadata', 'source-ready']);
    assert.deepEqual(h.states.map(item => item.provider), ['drive', 'icloud']);
    assert.ok(h.states.every(item => item.value.state === 'queued'));
    h.reader.resolve(true); assert.equal(await h.done, true);
    assert.deepEqual(h.errors, []);
  });

  test(`${kind} storage failure does not falsely mark the original as queued`, async () => {
    const h = importHarness(kind);
    await settle(); h.storage.resolve(false); h.reader.resolve(true);
    assert.equal(await h.done, true, 'reader still opens its in-memory copy');
    assert.equal(h.states.length, 0);
    assert.deepEqual(h.queued, ['metadata']);
  });
}

function cloudHarness(provider) {
  const writes = [], uploads = [], tokens = [], signals = [];
  const saved = deferred();
  let blockFirst = false, schedules = 0, retries = 0, gestures = 0;
  const store = new Map([['old', Uint8Array.from([1, 2, 3]).buffer]]);
  const context = vm.createContext({
    ArrayBuffer, Uint8Array, Date, JSON, window: {}, navigator: {}, zenOn: false, gestureLive: () => false,
    state: { chapters: [{ id: 'old', kind: 'pdf', fileSize: 3 }], deleted: {} },
    iCloudSyncing: false, gdriveSyncing: false, gdriveRoaming: false,
    gdriveToken: null, gdriveTokenAt: 0, gdriveEmail: '',
    libraryDriveRestoreArmed: false, libraryDriveRestoreMessage: '', gdriveArmed: false,
    GDRIVE_FILE: 'carrel-library.json', GDRIVE_PDF_LIMIT: 200 * 1024 * 1024,
    gdrivePdfStates: {}, iCloudDocumentStates: {}, importedSourceWrites: {}, now: () => 1000000, penOnGlass: () => false,
    scheduleSync: () => schedules++, scheduleSyncRetry: () => retries++,
    gdriveOn: () => true, iCloudOn: () => true,
    nativeGooglePlugin: () => null,
    gdriveTokenFresh: () => !!context.gdriveToken,
    pdfFingerprint: async () => 'old-hash',
    gdriveSaveAuth() {}, gdriveLearnEmail() {},
    gdriveArmGestureSync: () => gestures++,
    gdriveGetToken: async interactive => { tokens.push(interactive); return 'fixture-token'; },
    gdriveListAll: async () => [{ id: 'library', name: 'carrel-library.json' }],
    mergeState: () => false, persist() {}, renderShelf() {}, updateReviewBadge() {},
    repairDuplicateStorage: async () => {},
    localState: () => context.state, chaptersForSync: async () => context.state.chapters,
    getLocalPdf: async id => store.get(id), getPdf: async id => store.get(id),
    binarySourceSpec: ch => ch.kind === 'pdf' ? { name: `pdf-${ch.id}.pdf`, mime: 'application/pdf' } : null,
    gdriveSetPdfState: (id, value) => { context.gdrivePdfStates[id] = value; },
    gdriveForgetUpload() {}, iCloudSetDocumentState: (id, value) => { context.iCloudDocumentStates[id] = value; },
    find: id => context.state.chapters.find(ch => ch.id === id),
    iCloudSetStatus: message => signals.push(message), iCloudAccountMessage: status => status,
    iCloudUploadSource: async (ch, bytes) => { uploads.push([ch.id, bytes.byteLength]); return true; },
    gdriveUploadPdf: async (token, ch, bytes) => { uploads.push([ch.id, bytes.byteLength]); return true; },
    gdrivePruneMergedPdfs: async () => {},
    syncUi: message => signals.push(message), showReaderToast() {},
    byId: () => ({ textContent: '', title: '', classList: { contains: () => true } }),
    fetch: async (url, options) => {
      if (options && options.method === 'PATCH') {
        writes.push(JSON.parse(options.body));
        if (blockFirst && writes.length === 1) await saved.promise;
        return { ok: true };
      }
      return { ok: true, json: async () => ({ chapters: [] }) };
    }
  });
  const plugin = {
    status: async () => ({ available: true }), fetchLibrary: async () => ({ found: false }),
    saveLibrary: async ({ payload }) => {
      writes.push(JSON.parse(payload));
      if (blockFirst && writes.length === 1) await saved.promise;
    },
    fetchDocuments: async () => ({ documents: [] }), deleteDocuments: async () => {}
  };
  context.iCloudPlugin = () => plugin;
  vm.runInContext(section('  var importedSourceWrites=', '  async function importPdf('), context);
  vm.runInContext(section('  async function iCloudSync(', '  /* Google Drive sync'), context);
  vm.runInContext(section('  async function gdriveRoamPdfs(', '  async function gdriveFetchSource('), context);
  vm.runInContext(section('  async function gdriveSync(', "  byId('gdriveConnectBtn').onclick"), context);
  context.gdriveToken = 'fresh-fixture-token';
  return {
    context, plugin, writes, uploads, tokens, signals, store,
    sync: () => provider === 'icloud' ? context.iCloudSync(false) : context.gdriveSync(false),
    block() { blockFirst = true; }, release: () => saved.resolve(),
    schedules: () => schedules, retries: () => retries, gestures: () => gestures
  };
}

for (const provider of ['drive', 'icloud']) {
  test(`${provider} retains a second request while an older library upload is in flight`, async () => {
    const h = cloudHarness(provider); h.block();
    const first = h.sync(); await settle();
    assert.equal(h.writes.length, 1);
    h.context.state.chapters.push({ id: 'new', kind: 'pdf', fileSize: 4 });
    h.store.set('new', Uint8Array.from([1, 2, 3, 4]).buffer);
    await h.sync();
    assert.equal(h.schedules(), 1, 'busy request schedules a later pass instead of disappearing');
    assert.deepEqual(h.writes[0].chapters.map(ch => ch.id), ['old'], 'first snapshot really predates import');
    h.release(); await first;
    await h.sync();
    assert.deepEqual(h.writes[1].chapters.map(ch => ch.id), ['old', 'new']);
    assert.ok(h.uploads.some(([id, size]) => id === 'new' && size === 4), 'new original is transferred');
  });

  test(`${provider} direct background call defers while the Pencil is down`, async () => {
    const h = cloudHarness(provider); h.context.penOnGlass = () => true;
    await h.sync();
    assert.equal(h.writes.length, 0); assert.equal(h.schedules(), 1);
  });

  test(`${provider} transient transfer failure schedules a retry`, async () => {
    const h = cloudHarness(provider);
    if (provider === 'drive') h.context.gdriveUploadPdf = async () => { throw new Error('Offline'); };
    else h.context.iCloudUploadSource = async () => { throw new Error('Offline'); };
    await h.sync();
    assert.equal(h.retries(), 1);
  });

  test(`${provider} does not upload old bytes with replacement metadata during a delayed or failed write`, async () => {
    const h = cloudHarness(provider), storage = deferred();
    const replacement = Uint8Array.from([4, 5, 6]).buffer;
    h.context.putPdf = () => storage.promise;
    const kept = h.context.keepImportedSource('old', replacement);
    h.context.state.chapters[0].contentHash = 'new-hash';
    await h.sync(); assert.equal(h.uploads.length, 0, 'pending replacement cannot use old stored bytes');
    storage.resolve(false); assert.equal(await kept, false);
    await h.sync(); assert.equal(h.uploads.length, 0, 'failed replacement also cannot relabel the old bytes');
    h.context.putPdf = async (id, bytes) => { h.store.set(id, bytes); return true; };
    await h.context.keepImportedSource('old', replacement);
    await h.sync();
    assert.deepEqual(h.uploads, [['old', 3]], 'a successful retry transfers the replacement');
  });

  test(`${provider} discards a stale local read when a same-size replacement completes during it`, async () => {
    const h = cloudHarness(provider), read = deferred(), bytes = Uint8Array.from([4, 5, 6]).buffer;
    const getter = provider === 'drive' ? 'getPdf' : 'getLocalPdf';
    h.context[getter] = () => read.promise;
    const first = h.sync(); await settle();
    h.context.putPdf = async (id, bytes) => { h.store.set(id, bytes); return true; };
    await h.context.keepImportedSource('old', bytes);
    h.context.state.chapters[0].contentHash = 'new-hash';
    read.resolve(Uint8Array.from([1, 2, 3]).buffer);
    await first; assert.equal(h.uploads.length, 0, 'stale old-byte read is not uploaded');
    h.context[getter] = async id => h.store.get(id);
    let actual;
    if (provider === 'drive') h.context.gdriveUploadPdf = async (token, ch, bytes) => { actual = { hash: ch.contentHash, bytes: [...new Uint8Array(bytes)] }; };
    else h.context.iCloudUploadSource = async (ch, bytes) => { actual = { hash: ch.contentHash, bytes: [...new Uint8Array(bytes)] }; return true; };
    await h.sync();
    assert.deepEqual(actual, { hash: 'new-hash', bytes: [4, 5, 6] });
  });
}

test('iCloud rechecks a queued same-size original even if its prior remote metadata appears current', async () => {
  const h = cloudHarness('icloud');
  h.context.state.chapters[0].contentHash = 'new-hash';
  h.context.iCloudDocumentStates.old = { state: 'queued' };
  h.plugin.fetchDocuments = async () => ({ documents: [{ id: 'old', byteCount: 3, contentHash: 'new-hash' }] });
  await h.sync();
  assert.equal(h.uploads.length, 1, 'explicitly queued replacement is not skipped by metadata equality');
});

test('expired native Google access refreshes silently before uploading, without web OAuth', async () => {
  const h = cloudHarness('drive');
  h.context.window.PHLOEM_NATIVE = true; h.context.gdriveToken = null;
  h.context.nativeGooglePlugin = () => ({ getToken: async options => { h.tokens.push(options.interactive); return { accessToken: 'refreshed' }; } });
  h.context.loadGis = () => { throw new Error('Web OAuth must not load'); };
  vm.runInContext(section('  var gdriveTokenSettle=', '  async function gdriveListAll('), h.context);
  await h.sync();
  assert.deepEqual(h.tokens, [false]);
  assert.equal(h.gestures(), 0); assert.equal(h.writes.length, 1);
  assert.equal(h.context.gdriveToken, 'refreshed');
});

test('native startup waits for its bridge and never arms browser sign-in', async () => {
  const h = cloudHarness('drive');
  h.context.window.PHLOEM_NATIVE = true; h.context.gdriveToken = null;
  await h.sync();
  assert.equal(h.gestures(), 0); assert.equal(h.writes.length, 0);
});

test('expired browser access does not start OAuth from an automatic sync', async () => {
  const h = cloudHarness('drive'); h.context.gdriveToken = null;
  await h.sync();
  assert.equal(h.gestures(), 1); assert.equal(h.tokens.length, 0); assert.equal(h.writes.length, 0);
});

test('native sign-in required and iCloud account unavailable do not retry or prompt automatically', async () => {
  const drive = cloudHarness('drive');
  drive.context.window.PHLOEM_NATIVE = true;
  drive.context.nativeGooglePlugin = () => ({});
  drive.context.gdriveGetToken = async () => { throw Object.assign(new Error('Sign in in Settings'), { code: 'GDRIVE_SIGN_IN_REQUIRED' }); };
  await drive.sync();
  assert.equal(drive.retries(), 0); assert.equal(drive.gestures(), 0);
  const cloud = cloudHarness('icloud');
  cloud.plugin.status = async () => ({ available: false, accountStatus: 'noAccount' });
  await cloud.sync();
  assert.equal(cloud.retries(), 0); assert.equal(cloud.writes.length, 0);
});

test('temporary iCloud account failures do receive bounded automatic retries', async () => {
  for (const accountStatus of ['temporarilyUnavailable', 'couldNotDetermine']) {
    const h = cloudHarness('icloud');
    h.plugin.status = async () => ({ available: false, accountStatus });
    await h.sync(); assert.equal(h.retries(), 1, accountStatus);
  }
});

test('a 401 native token renewal keeps Drive busy and retains a concurrent import request', async () => {
  const h = cloudHarness('drive'), refresh = deferred();
  h.context.window.PHLOEM_NATIVE = true;
  h.context.nativeGooglePlugin = () => ({ getToken: () => refresh.promise });
  vm.runInContext(section('  var gdriveTokenSettle=', '  async function gdriveListAll('), h.context);
  let lists = 0;
  h.context.gdriveListAll = async () => {
    if (++lists === 1) throw Object.assign(new Error('401'), { auth: true });
    return [{ id: 'library', name: 'carrel-library.json' }];
  };
  const first = h.sync(); await settle();
  assert.equal(h.context.gdriveSyncing, true, 'renewal still owns the active sync');
  await h.sync();
  assert.equal(h.schedules(), 1); assert.equal(lists, 1);
  refresh.resolve({ accessToken: 'renewed' }); await first;
  assert.equal(h.context.gdriveSyncing, false); assert.equal(h.writes.length, 1);
});

for (const provider of ['drive', 'icloud']) {
  test(`${provider} finishing an older upload does not clear a replacement's queued status`, async () => {
    const h = cloudHarness(provider), upload = deferred();
    h.context.state.chapters[0].contentHash = 'old-hash';
    if (provider === 'drive') h.context.gdriveUploadPdf = async () => upload.promise;
    else {
      h.context.ICLOUD_DOCUMENT_LIMIT = 200 * 1024 * 1024;
      h.context.originalSourceFilename = ch => ch.id + '.pdf';
      h.plugin.uploadDocument = async () => upload.promise;
      vm.runInContext(section('  async function iCloudUploadSource(', '  async function iCloudDownloadSource('), h.context);
    }
    const first = h.sync(); await settle();
    h.context.putPdf = async (id, bytes) => { h.store.set(id, bytes); return true; };
    await h.context.keepImportedSource('old', Uint8Array.from([4, 5, 6]).buffer);
    h.context.state.chapters[0].contentHash = 'new-hash';
    upload.resolve(true); await first;
    const state = provider === 'drive' ? h.context.gdrivePdfStates.old : h.context.iCloudDocumentStates.old;
    assert.equal(state.state, 'queued', 'the replacement still needs its own transfer');
  });

  test(`${provider} refuses stale original bytes after a failed replacement and reload`, async () => {
    const h = cloudHarness(provider);
    // The reload lost pending-write memory; only the new metadata and old durable bytes remain.
    h.context.state.chapters[0].contentHash = 'new-hash';
    h.context.importedSourceWrites = {};
    let transfers = 0;
    if (provider === 'drive') {
      h.context.gdriveUploads = {};
      h.context.gdriveStartPdfUpload = async () => { transfers++; throw new Error('must not upload'); };
      vm.runInContext(section('  async function gdriveUploadPdf(', '  async function gdriveRoamPdfs('), h.context);
    } else {
      h.context.ICLOUD_DOCUMENT_LIMIT = 200 * 1024 * 1024;
      h.context.originalSourceFilename = ch => ch.id + '.pdf';
      h.plugin.uploadDocument = async () => { transfers++; };
      vm.runInContext(section('  async function iCloudUploadSource(', '  async function iCloudDownloadSource('), h.context);
    }
    await h.sync();
    assert.equal(transfers, 0, 'no provider receives old bytes tagged with the new hash');
    const state = provider === 'drive' ? h.context.gdrivePdfStates.old : h.context.iCloudDocumentStates.old;
    assert.equal(state.state, 'paused');
    assert.equal(state.sourceMismatch, true, 'the card can explain that re-importing is needed');
  });
}
