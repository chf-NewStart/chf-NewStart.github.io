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
function node() { return { classList: classList(), attributes: {}, addEventListener() {}, querySelector() { return null; }, setAttribute(key, value) { this.attributes[key] = value; } }; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function tick() { await new Promise(resolve => setImmediate(resolve)); }
function lock() {
  const handlers = {};
  return { releases: 0, addEventListener(name, callback) { handlers[name] = callback; },
    release() { this.releases++; return Promise.resolve(); },
    fireRelease() { if (handlers.release) handlers.release(); } };
}
function harness(wakeRequest) {
  const elements = Object.fromEntries(['zenDock', 'findBar', 'zenExit', 'readerPage', 'mMore', 'zenMore'].map(id => [id, node()]));
  elements.findBar.classList.add('hidden');
  const calls = { fullscreen: 0, exitFullscreen: 0, toast: 0, refit: 0, sheet: 0, tablet: 0, pages: [] };
  const handlers = {};
  const document = {
    body: node(), visibilityState: 'visible', fullscreenElement: null,
    documentElement: {
      requestFullscreen() { calls.fullscreen++; document.fullscreenElement = document.documentElement; return Promise.resolve(); }
    },
    exitFullscreen() { calls.exitFullscreen++; document.fullscreenElement = null; return Promise.resolve(); },
    addEventListener(name, callback) { (handlers[name] ||= []).push(callback); }
  };
  const context = vm.createContext({
    document, window: { addEventListener(name, callback) { (handlers[name] ||= []).push(callback); } }, navigator: { wakeLock: wakeRequest ? { request: wakeRequest } : null },
    byId: id => elements[id], innerWidth: 1180, comfort: { focus: false },
    readerMode: 'text', pdfDoc: null,
    matchMedia: () => ({ matches: true }),
    syncTabletReaderUi() { calls.tablet++; },
    visibleFindReturnTarget: () => null, closeZenPopouts() {},
    toggleSheet() { calls.sheet++; }, setNotebookCollapsed() {},
    requestAnimationFrame() { calls.refit++; },
    renderPdfPage() {}, placeGuide() {}, updateProgress() {},
    showReaderToast() { calls.toast++; }, pagedPdfFlow: () => false,
    showPage(id) { calls.pages.push(id); },
    setTimeout: () => 1, clearTimeout() {}
  });
  vm.runInContext(section('  var zenOn=false,zenViaFullscreen=false,zenIdleTimer=0,zenWakeLock=null,zenWakePending=false;',
    '  /* Auto-scroll:'), context,
  { filename: 'reading.js Zen lifecycle' });
  return { context, elements, calls, document, emit(name, event) { for (const handler of handlers[name] || []) handler(event); } };
}

test('sole reader entry applies quiet reading without fullscreen, toast, or competing refit', () => {
  const { context, elements, calls, document } = harness();
  context.setZen(true, { quiet: true, refit: false });
  assert.equal(context.zenOn, true);
  assert.equal(document.body.classList.contains('zen'), true);
  assert.equal(elements.readerPage.classList.contains('show-tools'), false);
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

test('X delegates directly to the library instead of toggling the old reader interface', () => {
  const { context, elements, calls } = harness();
  context.setZen(true, { refit: false });
  elements.zenExit.onclick();
  assert.deepEqual(calls.pages, ['libraryPage']);
  assert.equal(context.zenOn, true, 'showPage owns reading cleanup, not an intermediate desk transition');
});

test('browser fullscreen can enter and leave without changing the reading interface', async () => {
  const { context, calls, document, emit } = harness();
  context.setZen(true, { refit: false });
  context.toggleReaderFullscreen();
  await tick();
  assert.equal(calls.fullscreen, 1);
  assert.equal(context.zenViaFullscreen, true);
  context.toggleReaderFullscreen();
  await tick();
  emit('fullscreenchange');
  assert.equal(calls.exitFullscreen, 1);
  assert.equal(context.zenViaFullscreen, false);
  assert.equal(context.zenOn, true);
  assert.equal(document.body.classList.contains('zen'), true);
  assert.deepEqual(calls.pages, []);
});

test('system fullscreen dismissal never exposes the old desk or leaves the paper', async () => {
  const { context, calls, document, emit } = harness();
  context.setZen(true, { refit: false });
  context.toggleReaderFullscreen();
  await tick();
  document.fullscreenElement = null;
  emit('fullscreenchange');
  assert.equal(context.zenViaFullscreen, false);
  assert.equal(context.zenOn, true);
  assert.equal(document.body.classList.contains('zen'), true);
  assert.deepEqual(calls.pages, []);
});

test('leaving the reader releases browser fullscreen if Phloem owns it', async () => {
  const { context, calls, document } = harness();
  context.setZen(true, { refit: false });
  context.toggleReaderFullscreen();
  await tick();
  context.setZen(false, { refit: false });
  assert.equal(calls.exitFullscreen, 1);
  assert.equal(context.zenViaFullscreen, false);
  assert.equal(document.body.classList.contains('zen'), false);
});

test('a late fullscreen acquisition is released if the paper has already closed', async () => {
  const pending = deferred();
  const { context, calls, document } = harness();
  document.documentElement.requestFullscreen = () => {
    calls.fullscreen++;
    return pending.promise.then(() => { document.fullscreenElement = document.documentElement; });
  };
  context.setZen(true, { refit: false });
  context.toggleReaderFullscreen();
  assert.equal(calls.fullscreen, 1);
  assert.equal(document.fullscreenElement, null, 'the request is still awaiting acquisition');
  context.setZen(false, { refit: false });
  assert.equal(calls.exitFullscreen, 0, 'there is no fullscreen to release before acquisition');
  pending.resolve();
  await tick();
  assert.equal(calls.exitFullscreen, 1, 'the late acquisition is immediately released');
  assert.equal(document.fullscreenElement, null);
  assert.equal(context.zenViaFullscreen, false);
  assert.equal(context.zenOn, false);
  assert.equal(document.body.classList.contains('zen'), false);
});

test('a fullscreen request completing after system dismissal does not claim stale ownership', async () => {
  const pending = deferred();
  const { context, calls, document, emit } = harness();
  document.documentElement.requestFullscreen = () => {
    calls.fullscreen++;
    document.fullscreenElement = document.documentElement;
    return pending.promise;
  };
  context.setZen(true, { refit: false });
  context.toggleReaderFullscreen();
  document.fullscreenElement = null;
  emit('fullscreenchange');
  pending.resolve();
  await tick();
  assert.equal(context.zenViaFullscreen, false);
  assert.equal(context.zenOn, true);
  assert.equal(document.body.classList.contains('zen'), true);
  assert.equal(calls.exitFullscreen, 0);
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

// A release outside the browser must not leave the dock awake for the rest of a session.
test('a lost dock pointer releases on blur, background, exit or an unpressed mouse return', () => {
  const { context, document, emit } = harness();
  context.setZen(true, { quiet: true, refit: false });
  context.zenDockPointerId = 9;
  emit('blur');
  assert.equal(context.zenDockPointerId, null);
  context.zenDockPointerId = 9;
  emit('pointermove', { pointerId: 9, pointerType: 'mouse', buttons: 0 });
  assert.equal(context.zenDockPointerId, null);
  context.zenDockPointerId = 9;
  document.visibilityState = 'hidden';
  emit('visibilitychange');
  assert.equal(context.zenDockPointerId, null);
  context.zenDockPointerId = 9;
  context.setZen(false, { refit: false });
  assert.equal(context.zenDockPointerId, null);
});
