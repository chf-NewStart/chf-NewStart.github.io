const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock, Number, Math, JSON, Object, Array, Map, Set });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-folds.js'), 'utf8'), context,
  { filename: 'reading-folds.js' });
const folds = context.window.PhloemFolds;
const plain = value => JSON.parse(JSON.stringify(value));
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const record = (id, page = 1, y0 = .2, y1 = .4, updatedAt = 100, extra = {}) =>
  ({ id, page, y0, y1, updatedAt, ...extra });
const store = (hash = HASH_A, items = {}, deleted = {}) => ({ version: 1, byHash: { [hash]: { items, deleted } } });
const envelope = value => ({ folds: value, pending: [] });

test('plain-script API is frozen, DOM-free, and returns the fold/pending envelope', () => {
  assert.deepEqual(Object.keys(folds).sort(), ['activeBands', 'merge', 'normalize', 'remove', 'upsert']);
  assert.equal(Object.isFrozen(folds), true);
  assert.deepEqual(plain(folds.normalize()), { folds: { version: 1, byHash: {} }, pending: [] });
});

test('normalization keeps valid records and rejects malformed records individually', () => {
  const input = store(HASH_A, {
    good: record('good'), null: null, wrongKey: record('other'),
    badPage: record('badPage', 0), badFraction: record('badFraction', 1, .8, .2),
    badTime: record('badTime', 1, .1, .3, Number.MAX_SAFE_INTEGER + 1),
    unknownField: record('unknownField', 1, .1, .3, 110, { title: 'must not enter fold data' })
  }, { deleted: 120, invalid: Infinity });
  const before = JSON.stringify(input);
  const normalized = folds.normalize(input, [], NOW);
  assert.deepEqual(plain(normalized.folds), store(HASH_A, { good: record('good') }, { deleted: 120 }));
  assert.deepEqual(plain(normalized.pending), []);
  assert.equal(JSON.stringify(input), before);
});

test('unknown-version, hashless, and malformed-hash payloads remain unapplied and deduplicated', () => {
  const future = { version: 2, byHash: { [HASH_A]: { items: { keep: record('keep') } } } };
  const hashless = { version: 1, items: { legacy: [record('legacy')] } };
  const malformedHash = { version: 1, byHash: { localName: { items: { keep: record('keep') } } } };
  const reorderedFuture = { byHash: future.byHash, version: 2 };
  const input = folds.normalize({ version: 1, byHash: {} }, [future, hashless, malformedHash, reorderedFuture], NOW);
  assert.deepEqual(plain(input.folds), { version: 1, byHash: {} });
  assert.equal(input.pending.length, 3);
  assert.ok(input.pending.some(item => item.version === 2 && item.byHash));
  assert.ok(input.pending.some(item => item.version === 1 && item.items));
  assert.ok(input.pending.some(item => item.byHash && item.byHash.localName));
});

test('pending payload deduplication uses recursively sorted object keys', () => {
  const a = { version: 2, data: { z: 1, nested: { b: 2, a: 3 } } };
  const b = { data: { nested: { a: 3, b: 2 }, z: 1 }, version: 2 };
  const normalized = folds.normalize(null, [a, b], NOW);
  assert.equal(normalized.pending.length, 1);
  assert.deepEqual(normalized.pending[0], a);
});

test('a singleton opaque pending payload survives normalization and envelope merging', () => {
  const future = { version: 7, byHash: { [HASH_A]: { items: { future: record('future') } } } };
  const normalized = folds.normalize({ version: 1, byHash: {} }, future, NOW);
  assert.deepEqual(plain(normalized.folds), { version: 1, byHash: {} });
  assert.deepEqual(plain(normalized.pending), [future]);
  assert.deepEqual(plain(folds.merge({ folds: normalized.folds, pending: future }, null, NOW)), plain(normalized));
});

test('future live and deleted clocks are quarantined with their hash and ID, then revalidated', () => {
  const futureAt = NOW + 24 * 60 * 60 * 1000 + 1;
  const original = store(HASH_A, { far: record('far', 3, .3, .6, futureAt) }, { removed: futureAt });
  const first = folds.normalize(original, [], NOW);
  assert.deepEqual(plain(first.folds), { version: 1, byHash: {} });
  assert.equal(first.pending.length, 1);
  assert.deepEqual(first.pending[0].byHash[HASH_A].items.far, record('far', 3, .3, .6, futureAt));
  assert.equal(first.pending[0].byHash[HASH_A].deleted.removed, futureAt);
  const later = folds.normalize(first, [], futureAt);
  assert.deepEqual(plain(later.pending), []);
  assert.deepEqual(plain(later.folds), original);
});

test('valid clock skew is accepted and does not let MAX_SAFE_INTEGER or year 3000 poison edits', () => {
  const ahead = NOW + 4 * 60 * 60 * 1000;
  const input = store(HASH_A, {
    accepted: record('accepted', 1, .1, .2, ahead),
    max: record('max', 1, .3, .4, Number.MAX_SAFE_INTEGER),
    year3000: record('year3000', 1, .5, .6, Date.UTC(3000, 0, 1))
  }, { futureDelete: Date.UTC(3000, 0, 1) });
  const normalized = folds.normalize(input, [], NOW);
  assert.deepEqual(Object.keys(normalized.folds.byHash[HASH_A].items), ['accepted']);
  assert.equal(normalized.pending.length, 1);
  const removed = folds.remove(normalized, HASH_A, ['accepted'], NOW);
  assert.ok(removed.folds.byHash[HASH_A].deleted.accepted > ahead);
  assert.equal(removed.pending[0].byHash[HASH_A].items.max.updatedAt, Number.MAX_SAFE_INTEGER);
  assert.throws(() => folds.remove(envelope(store(HASH_A, { full: record('full', 1, .1, .2, NOW + 24 * 60 * 60 * 1000) })), HASH_A, ['full'], NOW), { name: 'RangeError' });
});

test('different hash buckets survive; same-hash duplicate additions merge deterministically', () => {
  const left = envelope(store(HASH_A, { left: record('left', 1, .1, .2, 120), tie: record('tie', 1, .1, .2, 200) }));
  const right = envelope({ version: 1, byHash: {
    [HASH_A]: { items: { right: record('right', 2, .3, .4, 130), tie: record('tie', 1, .7, .8, 200) }, deleted: {} },
    [HASH_B]: { items: { other: record('other', 1, .2, .3, 140) }, deleted: {} }
  } });
  const merged = folds.merge(left, right, NOW);
  assert.deepEqual(Object.keys(merged.folds.byHash).sort(), [HASH_A, HASH_B]);
  assert.deepEqual(Object.keys(merged.folds.byHash[HASH_A].items).sort(), ['left', 'right', 'tie']);
  assert.deepEqual(plain(merged.folds.byHash[HASH_A].items.tie), record('tie', 1, .7, .8, 200));
  assert.deepEqual(plain(merged), plain(folds.merge(right, left, NOW)));
  assert.equal(JSON.stringify(merged), JSON.stringify(folds.merge(right, left, NOW)), 'canonical serialization must converge across receive order');
  assert.deepEqual(plain(merged), plain(folds.merge(merged, merged, NOW)));
});

test('tombstones win timestamp ties and newer restores keep the original stable ID', () => {
  const live = envelope(store(HASH_A, { a: record('a', 1, .2, .4, 300), b: record('b', 1, .5, .6, 100) }));
  const removed = folds.remove(live, HASH_A, ['a'], NOW);
  assert.ok(removed.folds.byHash[HASH_A].deleted.a > 300);
  assert.deepEqual(plain(folds.activeBands(removed, HASH_A, 1)), [{ page: 1, y0: .5, y1: .6, ids: ['b'] }]);
  const stale = envelope(store(HASH_A, { a: record('a', 1, .2, .4, removed.folds.byHash[HASH_A].deleted.a) }));
  assert.deepEqual(plain(folds.activeBands(folds.merge(removed, stale, NOW), HASH_A, 1)), [{ page: 1, y0: .5, y1: .6, ids: ['b'] }]);
  const restored = folds.upsert(removed, HASH_A, { id: 'a', page: 1, y0: .2, y1: .4 }, NOW);
  assert.ok(restored.folds.byHash[HASH_A].items.a.updatedAt > removed.folds.byHash[HASH_A].deleted.a);
  assert.deepEqual(plain(folds.activeBands(restored, HASH_A, 1)[0].ids), ['a']);
});

test('equal live timestamps use numeric page/y tuple ordering; tombstone ties still win', () => {
  const a = envelope(store(HASH_A, { same: record('same', 2, .2, .5, 800) }));
  const b = envelope(store(HASH_A, { same: record('same', 10, .1, .3, 800) }));
  assert.deepEqual(plain(folds.merge(a, b, NOW)), plain(folds.merge(b, a, NOW)));
  assert.equal(folds.merge(a, b, NOW).folds.byHash[HASH_A].items.same.page, 10);
  const deleted = envelope(store(HASH_A, {}, { same: 800 }));
  assert.deepEqual(plain(folds.activeBands(folds.merge(a, deleted, NOW), HASH_A, 2)), []);
});

test('overlapping and touching active folds union for display while retaining every ID', () => {
  const state = envelope(store(HASH_A, {
    a: record('a', 2, .2, .35, 20), b: record('b', 2, .35, .5, 21),
    c: record('c', 2, .48, .7, 22), otherPage: record('otherPage', 3, .1, .5, 30)
  }));
  assert.deepEqual(plain(folds.activeBands(state, HASH_A, 2)), [{ page: 2, y0: .2, y1: .7, ids: ['a', 'b', 'c'] }]);
  assert.deepEqual(plain(folds.activeBands(state, HASH_A, 3, 2)), []);
  assert.equal(state.folds.byHash[HASH_A].items.otherPage.page, 3);
});

test('hashes are canonical SHA-256 hex and failed mutations leave inputs untouched', () => {
  const upper = HASH_A.toUpperCase();
  const state = envelope(store(upper, { one: record('one') }));
  const before = JSON.stringify(state);
  assert.equal(folds.normalize(state, [], NOW).folds.byHash[HASH_A].items.one.id, 'one');
  assert.throws(() => folds.upsert(state, 'local-file-name', { id: 'two', page: 1, y0: .1, y1: .2 }, NOW), { name: 'TypeError' });
  assert.throws(() => folds.remove(state, HASH_A, ['__proto__'], NOW), { name: 'TypeError' });
  assert.equal(JSON.stringify(state), before);
});

test('removing a union tombstones all contributing IDs as one immutable envelope operation', () => {
  const state = envelope(store(HASH_A, { a: record('a', 1, .2, .4, 20), b: record('b', 1, .35, .55, 21) }));
  const band = folds.activeBands(state, HASH_A, 1)[0];
  const removed = folds.remove(state, HASH_A, band.ids, NOW);
  assert.deepEqual(Object.keys(removed.folds.byHash[HASH_A].deleted), ['a', 'b']);
  assert.deepEqual(plain(folds.activeBands(removed, HASH_A, 1)), []);
  assert.deepEqual(Object.keys(state.folds.byHash[HASH_A].deleted), []);
});
