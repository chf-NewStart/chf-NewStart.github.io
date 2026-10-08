/* Exercise the real per-paper status functions without accounts or cloud requests. */
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
function harness({ native = true, drive = false, cloud = false, driveAvailable = true, cloudAvailable = true } = {}) {
  const paper = { id: 'paper', fileSize: 1024 }, label = { textContent: '' }, progress = {};
  const box = {
    dataset: { paperId: paper.id }, attributes: {}, className: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) {
      return selector === '.cover-cloud-label' ? label : { style: { setProperty(name, value) { progress[name] = value; } } };
    }
  };
  const context = vm.createContext({
    window: { PHLOEM_NATIVE: native, PHLOEM_GOOGLE_DRIVE: driveAvailable,
      Capacitor: { Plugins: driveAvailable ? { PhloemGoogle: {} } : {} } },
    gdriveCfg: { on: drive }, iCloudCfg: { on: cloud },
    iCloudPlugin: () => cloudAvailable ? {} : null,
    gdrivePdfStates: {}, iCloudDocumentStates: {},
    byId: id => id === 'paperDriveStatus' ? box : null,
    find: id => id === paper.id ? paper : null
  });
  vm.runInContext(source.match(/  function nativeGooglePlugin\(\)[^\n]+/)[0], context);
  vm.runInContext(section('  function gdriveOn()', '  function gdriveTokenFresh()'), context);
  vm.runInContext(section('  function iCloudOn()', '  function iCloudAccountMessage('), context);
  vm.runInContext(section('  function iCloudPaperStatus(', '  async function iCloudUploadSource('), context);
  vm.runInContext(section('  function gdriveFormatBytes(', '  function gdriveSaveUploads('), context);
  return { context, paper, box, label, progress, view: () => context.gdrivePaperStatus(paper) };
}

for (const native of [true, false]) {
  test(`${native ? 'native' : 'browser'} Drive-only status names Drive despite cached iCloud state`, () => {
    const h = harness({ native, drive: true });
    h.context.gdrivePdfStates.paper = { state: 'synced' };
    h.context.iCloudDocumentStates.paper = { state: 'paused' };
    assert.equal(h.view().label, 'Synced to Drive · 1 KB');
    assert.equal(h.view().tone, 'synced');
    assert.equal(h.view().progress, 100);
  });
}
test('iCloud-only status names iCloud despite cached Drive state', () => {
  const h = harness({ cloud: true });
  h.context.gdrivePdfStates.paper = { state: 'paused' };
  h.context.iCloudDocumentStates.paper = { state: 'remote' };
  assert.equal(h.view().label, 'Stored in iCloud · 1 KB');
  assert.equal(h.view().tone, 'synced');
});
for (const config of [
  {}, { drive: true, driveAvailable: false }, { cloud: true, cloudAvailable: false },
  { drive: true, cloud: true, driveAvailable: false, cloudAvailable: false }
]) {
  test(`disabled or unavailable providers ignore stale successes: ${JSON.stringify(config)}`, () => {
    const h = harness(config);
    h.context.gdrivePdfStates.paper = { state: 'synced' };
    h.context.iCloudDocumentStates.paper = { state: 'synced' };
    assert.equal(h.view().label, 'Backup not connected · 1 KB');
    assert.equal(h.view().tone, 'local');
    assert.equal(h.view().progress, 0);
  });
}
test('unavailable native Drive falls back to the enabled iCloud provider', () => {
  const h = harness({ drive: true, cloud: true, driveAvailable: false });
  assert.equal(h.view().label, 'iCloud · checking');
});
test('the browser does not require the native Drive plugin', () => {
  const h = harness({ native: false, drive: true, driveAvailable: false });
  assert.equal(h.view().label, 'Backup · checking Drive');
});
for (const provider of ['drive', 'cloud']) {
  test(`${provider} failed transfer is not reported as synced`, () => {
    const h = harness({ [provider]: true });
    const states = provider === 'drive' ? h.context.gdrivePdfStates : h.context.iCloudDocumentStates;
    for (const state of ['paused', 'missing', 'too-large', 'failed']) {
      states.paper = { state };
      assert.equal(h.view().tone, 'paused', state);
      assert.match(h.view().label, provider === 'drive' ? /Drive/ : /iCloud/);
    }
    states.paper = { state: 'paused', sourceMismatch: true };
    assert.match(h.view().label, /^Re-import original/);
  });
}
test('both providers remain visible once both originals are synced or remote', () => {
  const h = harness({ drive: true, cloud: true });
  h.context.gdrivePdfStates.paper = { state: 'synced' };
  h.context.iCloudDocumentStates.paper = { state: 'remote' };
  assert.equal(h.view().label, 'Drive + iCloud · synced');
  assert.equal(h.view().detail, 'Synced to Drive · 1 KB; Stored in iCloud · 1 KB');
  assert.equal(h.view().progress, 100);
});
for (const provider of ['drive', 'cloud']) {
  test(`a paused ${provider} transfer stays visible alongside a successful second provider`, () => {
    const h = harness({ drive: true, cloud: true });
    h.context.gdrivePdfStates.paper = { state: 'synced' };
    h.context.iCloudDocumentStates.paper = { state: 'synced' };
    const states = provider === 'drive' ? h.context.gdrivePdfStates : h.context.iCloudDocumentStates;
    states.paper = { state: 'paused' };
    assert.equal(h.view().label, 'Drive + iCloud · needs attention');
    assert.equal(h.view().tone, 'paused');
    assert.match(h.view().detail, /transfer paused/);
    states.paper.sourceMismatch = true;
    assert.equal(h.view().label, 'Drive + iCloud · re-import original');
  });
}
test('pending and active work are not hidden by another provider success', () => {
  const h = harness({ drive: true, cloud: true });
  h.context.gdrivePdfStates.paper = { state: 'synced' };
  assert.equal(h.view().label, 'Drive + iCloud · checking');
  h.context.iCloudDocumentStates.paper = { state: 'queued' };
  assert.equal(h.view().label, 'Drive + iCloud · upload pending');
  h.context.iCloudDocumentStates.paper = { state: 'uploading', progress: 40 };
  assert.equal(h.view().label, 'Drive + iCloud · uploading 40%');
  assert.equal(h.view().progress, 40);
  h.context.iCloudDocumentStates.paper = { state: 'fetching', progress: 125 };
  assert.equal(h.view().label, 'Drive + iCloud · downloading 100%');
});
test('either provider refresh preserves the combined label and accessible per-provider details', () => {
  const h = harness({ drive: true, cloud: true });
  h.context.gdriveSetPdfState('paper', { state: 'synced' });
  h.context.iCloudSetDocumentState('paper', { state: 'uploading', progress: 30 });
  assert.equal(h.label.textContent, 'Drive + iCloud · uploading 30%');
  assert.equal(h.box.attributes['aria-label'], 'Synced to Drive · 1 KB; Uploading to iCloud · 30%');
  assert.equal(h.box.attributes.title, h.box.attributes['aria-label']);
  assert.equal(h.progress['--cloud-progress'], '30%');
  h.context.gdriveSetPdfState('paper', { state: 'paused' });
  assert.equal(h.label.textContent, 'Drive + iCloud · needs attention');
  assert.equal(h.box.dataset.backupStatus, 'paused');
  assert.match(h.box.attributes['aria-label'], /^Drive transfer paused/);
});
test('a late disabled-provider callback cannot replace the active provider label', () => {
  const h = harness({ drive: true });
  h.context.gdriveSetPdfState('paper', { state: 'synced' });
  h.context.iCloudSetDocumentState('paper', { state: 'synced' });
  assert.equal(h.label.textContent, 'Synced to Drive · 1 KB');
  h.context.gdriveCfg.on = false;
  h.context.iCloudCfg.on = true;
  h.context.gdriveSetPdfState('paper', { state: 'paused' });
  assert.equal(h.label.textContent, 'Synced to iCloud · 1 KB');
  h.context.iCloudSetDocumentState('another-paper', { state: 'paused' });
  assert.equal(h.label.textContent, 'Synced to iCloud · 1 KB');
});
