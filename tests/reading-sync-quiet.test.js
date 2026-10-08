/* Background sync waits for a quiet moment. A sync parses, merges and re-uploads the whole
   library largely on the main thread, so one that starts mid-handwriting freezes the page.
   It now waits for 6 quiet seconds (no touch, Pencil or key), at most 90 seconds, and runs
   at once when the page is hidden. Pure timing harness over the real reading.js code. */
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
function harness() {
  let clock = 1000000, serial = 0;
  const timers = new Map(), listeners = {}, runs = [];
  const context = vm.createContext({
    Date: { now: () => clock },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: clock + Math.max(0, ms || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { visibilityState: 'visible', addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); } },
    window: { addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); } },
    navigator: { onLine: true }, syncing: false, gdriveSyncing: false, iCloudSyncing: false,
    syncCfg: { repo: 'owner/name' }, gdriveOn: () => false, iCloudOn: () => true,
    doSync() { runs.push(clock); }, gdriveSync() {}, iCloudSync() {},
    syncTimer: null, workspacePenDown: 0, penOnGlass: () => context.workspacePenDown
  });
  vm.runInContext(section('  /* A sync downloads, parses', '  /* A device link is a direct hand-off'), context);
  function advance(ms) {
    const end = clock + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); clock = due[1].at; due[1].fn();
    }
    clock = end;
  }
  const input = type => (listeners[type] || []).forEach(fn => fn({ type }));
  return { context, advance, input, runs, listeners, now: () => clock, hide() { context.document.visibilityState = 'hidden'; (listeners.visibilitychange || []).forEach(fn => fn()); } };
}

test('with no recent input, a sync starts 4 seconds after the last save', () => {
  const h = harness();
  h.advance(60000);
  h.context.scheduleSync();
  h.advance(3999); assert.equal(h.runs.length, 0);
  h.advance(1); assert.equal(h.runs.length, 1);
});

test('a sync waits for 6 quiet seconds after the last touch, Pencil or key', () => {
  const h = harness();
  h.advance(60000);
  h.input('pointerup'); const lifted = h.now();
  h.context.scheduleSync();
  h.advance(4000); assert.equal(h.runs.length, 0, 'not while the hand was just writing');
  h.input('keydown'); const typed = h.now();
  h.advance(5999); assert.equal(h.runs.length, 0, 'typing restarts the quiet time');
  h.advance(1); assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0] - typed, 6000);
  assert.ok(h.runs[0] - lifted > 6000);
});

test('a Pencil held down keeps the sync waiting', () => {
  const h = harness();
  h.advance(60000);
  h.context.workspacePenDown = 1;
  h.context.scheduleSync();
  h.advance(20000); assert.equal(h.runs.length, 0);
  h.context.workspacePenDown = 0;
  h.advance(1000); assert.equal(h.runs.length, 1, 'it runs once the Pencil lifts and the page is quiet');
});

test('unbroken activity delays a sync by 90 seconds at most', () => {
  const h = harness();
  h.advance(60000);
  h.context.scheduleSync(); const asked = h.now();
  for (let i = 0; i < 200 && !h.runs.length; i++) { h.input('pointerdown'); h.advance(1000); }
  assert.equal(h.runs.length, 1);
  assert.ok(h.runs[0] - asked >= 90000 && h.runs[0] - asked <= 92000, `ran after ${h.runs[0] - asked} ms`);
});

test('saves that keep coming do not push a sync past 90 seconds', () => {
  const h = harness();
  h.advance(60000);
  h.context.scheduleSync(); const asked = h.now();
  for (let i = 0; i < 100 && !h.runs.length; i++) { h.input('pointerup'); h.context.scheduleSync(); h.advance(2000); }
  assert.equal(h.runs.length, 1);
  assert.ok(h.runs[0] - asked >= 90000 && h.runs[0] - asked <= 92000, `ran after ${h.runs[0] - asked} ms`);
});

test('hiding the page runs a waiting sync at once', () => {
  const h = harness();
  h.advance(60000);
  h.input('pointerup');
  h.context.scheduleSync();
  h.advance(1000); assert.equal(h.runs.length, 0);
  h.hide(); assert.equal(h.runs.length, 1);
  h.advance(60000); assert.equal(h.runs.length, 1, 'and only once');
});

test('the deadline and hiding never start a sync in the middle of a Pencil stroke', () => {
  const h = harness();
  h.context.workspacePenDown = 1;
  h.context.scheduleSync();
  h.advance(100000); assert.equal(h.runs.length, 0, '90-second deadline cannot interrupt a held stroke');
  h.hide(); assert.equal(h.runs.length, 0, 'hiding does not override an active stroke');
  h.context.workspacePenDown = 0;
  h.advance(1000); assert.equal(h.runs.length, 1);
});

test('a save during any in-flight provider waits and then gets another sync', () => {
  for (const provider of ['syncing', 'gdriveSyncing', 'iCloudSyncing']) {
    const h = harness();
    h.context[provider] = true;
    h.context.scheduleSync();
    h.advance(100000); assert.equal(h.runs.length, 0, `${provider} retains the pending request`);
    h.context[provider] = false;
    h.advance(1000); assert.equal(h.runs.length, 1, `${provider} completion allows the new snapshot`);
  }
});

test('offline changes are retained and returning online checks them after input settles', () => {
  const h = harness();
  h.context.navigator.onLine = false;
  h.context.scheduleSync();
  h.advance(10000); assert.equal(h.runs.length, 0);
  h.context.navigator.onLine = true;
  h.input('online'); h.input('pointerup');
  h.advance(5999); assert.equal(h.runs.length, 0);
  h.advance(1); assert.equal(h.runs.length, 1);
});

test('foreground and online refresh even without a local edit, but disconnected libraries do not', () => {
  const h = harness();
  h.input('visibilitychange');
  h.advance(4000); assert.equal(h.runs.length, 1);
  h.input('online');
  h.advance(4000); assert.equal(h.runs.length, 2);
  h.context.syncCfg = null; h.context.iCloudOn = () => false;
  h.input('online'); h.input('visibilitychange');
  h.advance(10000); assert.equal(h.runs.length, 2);
});

test('transient failures retry with bounded backoff; a new local change starts a fresh attempt', () => {
  const h = harness();
  h.context.doSync = () => { h.runs.push(h.now()); h.context.scheduleSyncRetry(); };
  h.context.scheduleSync();
  h.advance(200000);
  assert.equal(h.runs.length, 4, 'initial attempt plus three automatic retries');
  assert.deepEqual(h.runs.map((at, i) => i ? at - h.runs[i - 1] : at - 1000000), [4000, 19000, 34000, 64000]);
  h.context.scheduleSync();
  h.advance(4000); assert.equal(h.runs.length, 5, 'new work does not remain stuck after exhausted retries');
});
