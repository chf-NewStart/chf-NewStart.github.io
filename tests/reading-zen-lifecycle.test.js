const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `reader section exists: ${start}`);
  return source.slice(from, to);
}
function classList() {
  const values = new Set();
  return {
    toggle(name, on) { if (on === undefined) on = !values.has(name); if (on) values.add(name); else values.delete(name); },
    add(name) { values.add(name); }, remove(name) { values.delete(name); },
    contains(name) { return values.has(name); }
  };
}
function node() { return { classList: classList(), attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function tick() { await new Promise(resolve => setImmediate(resolve)); }
function lock() {
  const handlers = {};
  return { releases: 0, addEventListener(name, callback) { handlers[name] = callback; },
    release() { this.releases++; return Promise.resolve(); },
    fireRelease() { if (handlers.release) handlers.release(); } };
}
function harness(wakeRequest) {
  const elements = Object.fromEntries(['zenDock', 'findBar', 'zenBtn', 'readerPage', 'mMore', 'zenFind'].map(id => [id, node()]));
  elements.findBar.classList.add('hidden');
  const calls = { fullscreen: 0, exitFullscreen: 0, toast: 0, refit: 0, sheet: 0, tablet: 0 };
  const document = {
    body: node(), visibilityState: 'visible', fullscreenElement: null,
    documentElement: {
      requestFullscreen() { calls.fullscreen++; return Promise.resolve(); },
      exitFullscreen() { calls.exitFullscreen++; return Promise.resolve(); }
    },
    addEventListener() {}
  };
  const context = vm.createContext({
    document, navigator: { wakeLock: wakeRequest ? { request: wakeRequest } : null },
    byId: id => elements[id], innerWidth: 1180, comfort: { focus: false },
    readerMode: 'text', pdfDoc: null,
    matchMedia: () => ({ matches: true }),
    syncTabletReaderUi() { calls.tablet++; },
    visibleFindReturnTarget: () => null, closeZenPopouts() {},
    toggleSheet() { calls.sheet++; }, setNotebookCollapsed() {},
    requestAnimationFrame() { calls.refit++; },
    renderPdfPage() {}, placeGuide() {}, updateProgress() {},
    showReaderToast() { calls.toast++; }, pagedPdfFlow: () => false,
    setTimeout: () => 1, clearTimeout() {}
  });
  vm.runInContext(section('  var zenOn=false,zenViaFullscreen=false,zenIdleTimer=0,zenWakeLock=null,zenWakePending=false;',
    '  byId(\'zenBtn\').onclick=function(){setZen(!zenOn);};'), context,
  { filename: 'reading.js Zen lifecycle' });
  return { context, elements, calls, document };
}

test('automatic Zen entry applies the reading state without fullscreen, toast, or competing refit', () => {
  const { context, elements, calls, document } = harness();
  context.setZen(true, { fullscreen: false, quiet: true, refit: false });
  assert.equal(context.zenOn, true);
  assert.equal(document.body.classList.contains('zen'), true);
  assert.equal(elements.zenBtn.attributes['aria-pressed'], 'true');
  assert.equal(calls.sheet, 1);
  assert.equal(calls.tablet, 1);
  assert.equal(calls.fullscreen, 0);
  assert.equal(calls.toast, 0);
  assert.equal(calls.refit, 0);
  context.setZen(false, { quiet: true, refit: false });
  assert.equal(document.body.classList.contains('zen'), false);
  assert.equal(calls.toast, 0);
  assert.equal(calls.refit, 0);
});

test('a pending wake-lock request is unique and releases if Zen exits before it resolves', async () => {
  const pending = deferred(); let requests = 0;
  const { context } = harness(() => { requests++; return pending.promise; });
  context.zenOn = true;
  context.holdZenWake(); context.holdZenWake();
  assert.equal(requests, 1);
  assert.equal(context.zenWakePending, true);
  context.zenOn = false;
  context.dropZenWake();
  const late = lock(); pending.resolve(late); await tick();
  assert.equal(late.releases, 1);
  assert.equal(context.zenWakeLock, null);
  assert.equal(context.zenWakePending, false);
});

test('an acquired lock prevents duplicate requests until it releases', async () => {
  const acquired = lock(); let requests = 0;
  const { context } = harness(() => { requests++; return Promise.resolve(acquired); });
  context.zenOn = true;
  context.holdZenWake(); context.holdZenWake(); await tick();
  assert.equal(requests, 1);
  assert.equal(context.zenWakeLock, acquired);
  context.holdZenWake(); assert.equal(requests, 1);
  acquired.fireRelease();
  assert.equal(context.zenWakeLock, null);
  context.holdZenWake();
  assert.equal(requests, 2);
});

test('a late release from an old lock cannot clear a newer lock', async () => {
  const old = lock(), current = lock(); let requests = 0;
  const { context } = harness(() => Promise.resolve(++requests === 1 ? old : current));
  context.zenOn = true;
  context.holdZenWake(); await tick();
  assert.equal(context.zenWakeLock, old);
  context.dropZenWake();
  assert.equal(old.releases, 1);
  context.holdZenWake(); await tick();
  assert.equal(context.zenWakeLock, current);
  old.fireRelease();
  assert.equal(context.zenWakeLock, current);
});
