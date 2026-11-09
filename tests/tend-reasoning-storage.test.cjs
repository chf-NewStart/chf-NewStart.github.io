/* Exercise the public browser storage adapter without mounting a UI or making any network request. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../focus/reasoning-core.js');
const QUESTIONS = C.QUESTIONS;
const source = fs.readFileSync(require.resolve('../focus/reasoning.js'), 'utf8');
function draft(reason) {
  const r = C.start(C.emptyState(), { mode: 'daily', day: '2026-11-08' });
  return C.update(r.state, r.attempt.id, { initialPrediction: QUESTIONS.find(q => q.id === r.attempt.questionId).options[0].id, reason });
}
function harness({ raw = null, android = false, native = false } = {}) {
  const data = { raw, failRead: false, failWrite: false, writes: 0, network: 0, posted: [] };
  const listeners = new Map();
  const context = {
    TendReasoningCore: C, TendReasoningContent: QUESTIONS, TEND_NATIVE: native,
    TEND_REASONING_STATE: native && raw ? JSON.parse(raw) : null,
    document: { readyState: 'loading', addEventListener(name, fn) { listeners.set(`document:${name}`, fn); } },
    addEventListener(name, fn) { listeners.set(name, fn); },
    dispatchEvent() {}, Event: class { constructor(type) { this.type = type; } },
    localStorage: {
      getItem(key) { assert.equal(key, C.KEY); if (data.failRead) throw new Error('read unavailable'); return data.raw; },
      setItem(key, value) { assert.equal(key, C.KEY); data.writes++; if (data.failWrite) throw new Error('quota exceeded'); data.raw = value; }
    },
    fetch() { data.network++; throw new Error('Unexpected network request'); },
    XMLHttpRequest: class { constructor() { data.network++; throw new Error('Unexpected network request'); } },
    navigator: { sendBeacon() { data.network++; throw new Error('Unexpected network request'); } }
  };
  if (android) context.TendAndroidReasoning = {
    load() { if (data.failRead) throw new Error('bridge read unavailable'); return data.raw; },
    save(value) { data.writes++; if (data.failWrite) return false; data.raw = value; return true; }
  };
  if (native) context.webkit = { messageHandlers: { tend: { postMessage(message) { data.posted.push(message); } } } };
  context.self = context;
  vm.runInNewContext(source, context, { filename: 'reasoning.js' });
  return { api: context.TendReasoning, context, data, listeners };
}

test('public snapshot and replace save locally, survive a fresh page, and use no network capability', () => {
  const expected = draft('A private local note');
  const h = harness();
  assert.deepEqual(h.api.snapshot(), C.emptyState());
  h.api.replace(expected);
  assert.deepEqual(h.api.snapshot(), expected);
  assert.deepEqual(JSON.parse(h.data.raw), expected);
  assert.deepEqual(harness({ raw: h.data.raw }).api.snapshot(), expected);
  assert.equal(h.data.network, 0);
});

test('failed browser writes retain the latest draft in memory rather than reloading an older persisted draft', () => {
  const old = draft('Earlier reasoning'), latest = draft('An unsaved revision with a new assumption');
  const h = harness({ raw: JSON.stringify(old) });
  assert.deepEqual(h.api.snapshot(), old);
  h.data.failWrite = true;
  h.api.replace(latest);
  assert.deepEqual(JSON.parse(h.data.raw), old, 'the old persisted copy is still intact');
  assert.deepEqual(h.api.snapshot(), latest, 'latest work remains available after the failed write');
  assert.deepEqual(h.api.snapshot(), latest, 'repeated reads do not discard the in-memory revision');
  h.data.failWrite = false;
  h.api.replace(h.api.snapshot());
  assert.deepEqual(harness({ raw: h.data.raw }).api.snapshot(), latest, 'work can be persisted after storage recovers');
  assert.equal(h.data.network, 0);
});

test('a false Android bridge save result retains the latest memory and can recover on a later write', () => {
  const old = draft('Earlier Android note'), latest = draft('Latest Android note');
  const h = harness({ raw: JSON.stringify(old), android: true });
  assert.deepEqual(h.api.snapshot(), old);
  h.data.failWrite = true;
  h.api.replace(latest);
  assert.deepEqual(JSON.parse(h.data.raw), old);
  assert.deepEqual(h.api.snapshot(), latest);
  h.data.failWrite = false;
  h.api.replace(h.api.snapshot());
  assert.deepEqual(harness({ raw: h.data.raw, android: true }).api.snapshot(), latest);
  assert.equal(h.data.network, 0);
});

test('unreadable saved JSON is preserved during reads and can be replaced explicitly with a valid backup', () => {
  for (const android of [false, true]) {
    const broken = '{"schema":"tend-reasoning-v1",not complete';
    const h = harness({ raw: broken, android });
    assert.deepEqual(h.api.snapshot(), C.emptyState());
    assert.deepEqual(h.api.snapshot(), C.emptyState());
    assert.equal(h.data.raw, broken, 'the unreadable original remains recoverable');
    assert.equal(h.data.writes, 0, 'reading a failed saved copy does not overwrite it');
    const restored = draft('A deliberately restored backup');
    h.api.replace(restored);
    assert.deepEqual(h.api.snapshot(), restored);
    assert.deepEqual(JSON.parse(h.data.raw), restored);
    assert.equal(h.data.network, 0);
  }
});

test('successful browser storage remains responsive to a newer copy saved by another tab', () => {
  const h = harness({ raw: JSON.stringify(draft('First tab')) });
  assert.equal(h.api.snapshot().attempts[0].reason, 'First tab');
  const newer = draft('Second tab');
  h.data.raw = JSON.stringify(newer);
  h.listeners.get('storage')({ key: C.KEY });
  assert.deepEqual(h.api.snapshot(), newer);
});

test('iPhone uses the existing local message bridge and retains memory after native save error feedback', () => {
  const old = draft('Earlier iPhone note'), latest = draft('Latest iPhone note');
  const h = harness({ raw: JSON.stringify(old), native: true });
  assert.deepEqual(h.api.snapshot(), old);
  h.api.replace(latest);
  assert.equal(h.data.posted.length, 1);
  assert.equal(h.data.posted[0].action, 'reasoningSave');
  assert.deepEqual(h.data.posted[0].state, latest);
  h.context.TendReasoningStorageError('Storage could not be updated.');
  assert.deepEqual(h.api.snapshot(), latest);
  assert.equal(h.data.network, 0);
});
