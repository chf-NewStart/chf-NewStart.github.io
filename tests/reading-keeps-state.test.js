const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-keeps.js'), 'utf8'), context,
  { filename: 'reading-keeps.js' });
const keeps = context.window.PhloemKeeps;
const plain = value => JSON.parse(JSON.stringify(value));
const ids = value => Array.from(value.items, item => item.id);
const pdf = (page = 3) => ({ kind: 'pdf', page, quote: 'A useful passage' });
const record = (id, updatedAt = 100, overrides = {}) => ({
  id, kind: 'thread', text: 'A thought', anchor: pdf(), resolved: false,
  createdAt: 50, updatedAt, ...overrides
});
const store = (items = [], deleted = {}) => ({ version: 1, items, deleted });

test('plain-script API is frozen and requires no document, storage, or network', () => {
  assert.deepEqual(Object.keys(keeps).sort(), ['merge', 'normalize', 'remove', 'upsert']);
  assert.equal(Object.isFrozen(keeps), true);
  assert.deepEqual(plain(keeps.normalize()), store());
});

test('normalization keeps valid neighbors when an individual record is damaged', () => {
  const input = store([
    record('first'), null, {}, record('bad-kind', 100, { kind: 'other' }),
    record('bad-page', 100, { anchor: pdf(0) }),
    record('bad-id', 100, { id: '' }),
    record('bad-time', Infinity), record('second', 101)
  ], { invalid: Infinity, erased: 120 });
  const before = JSON.stringify(input);
  assert.deepEqual(plain(keeps.normalize(input)), store([record('first'), record('second', 101)], { erased: 120 }));
  assert.equal(JSON.stringify(input), before);
});

test('unsupported versions throw a distinct fail-closed signal through every entry point', () => {
  const future = { version: 2, items: [record('keep')], deleted: {} };
  for (const operation of [
    () => keeps.normalize(future), () => keeps.merge(store(), future),
    () => keeps.merge(future, store()),
    () => keeps.upsert(future, record('new'), 200),
    () => keeps.remove(future, 'keep', 200)
  ]) assert.throws(operation, error => error.code === 'UNSUPPORTED_VERSION' && error.version === 2);
  assert.deepEqual(plain(future), { version: 2, items: [record('keep')], deleted: {} });
});

test('upsert adds and edits with a logical timestamp and preserves creation time', () => {
  const added = keeps.upsert(store(), record('a', 5, { kind: 'bookmark', text: 'Read later' }), 100);
  assert.equal(added.items[0].createdAt, 100);
  assert.equal(added.items[0].updatedAt, 100);
  const edited = keeps.upsert(added, record('a', 3, { kind: 'question', text: 'Why?', resolved: true }), 100);
  assert.equal(edited.items[0].createdAt, 100);
  assert.equal(edited.items[0].updatedAt, 101);
  assert.equal(edited.items[0].kind, 'question');
  assert.equal(edited.items[0].resolved, true);
  assert.equal(added.items[0].kind, 'bookmark');
});

test('remove creates a tombstone that defeats stale merges; upsert can restore later', () => {
  const old = store([record('a', 100), record('b', 100)]);
  const erased = keeps.remove(old, 'a', 100);
  assert.deepEqual(ids(erased), ['b']);
  assert.equal(erased.deleted.a, 101);
  assert.deepEqual(ids(keeps.merge(erased, old)), ['b']);
  const restored = keeps.upsert(erased, record('a', 1, { text: 'Restored' }), 100);
  assert.equal(restored.items.find(item => item.id === 'a').updatedAt, 102);
  assert.equal(restored.deleted.a, 101);
  assert.equal(keeps.merge(restored, erased).items.find(item => item.id === 'a').text, 'Restored');
});

test('independent additions survive merges and tombstones win timestamp ties', () => {
  const left = store([record('a', 100), record('same', 100, { text: 'Left' })]);
  const right = store([record('b', 110), record('same', 100, { text: 'Right' })]);
  const merged = keeps.merge(left, right);
  assert.deepEqual(ids(merged), ['a', 'b', 'same']);
  assert.equal(merged.items.find(item => item.id === 'same').text, 'Right');
  const removed = keeps.merge(merged, store([], { same: 100 }));
  assert.deepEqual(ids(removed), ['a', 'b']);
  assert.equal(removed.deleted.same, 100);
});

test('normalization and merging are idempotent and commutative', () => {
  const a = store([record('z', 130), record('tie', 120, { text: 'Alpha' })], { gone: 140 });
  const b = store([record('a', 150), record('tie', 120, { text: 'Beta' })], { z: 130 });
  const ab = plain(keeps.merge(a, b));
  assert.deepEqual(ab, plain(keeps.merge(b, a)));
  assert.deepEqual(ab, plain(keeps.merge(ab, ab)));
  assert.deepEqual(ab, plain(keeps.normalize(ab)));
  assert.deepEqual(ab.items.map(item => item.id), ['a', 'tie']);
  assert.deepEqual(ab.deleted, { gone: 140, z: 130 });
});

test('PDF anchors preserve a validated reading position and bound free text', () => {
  const anchor = { kind: 'pdf', page: 9, quote: 'q'.repeat(500), position: {
    v: 1, page: 9, x: .2, y: .8, screenX: .5, screenY: .4,
    pdfX: -20, pdfY: 330, zoom: 2.1, layout: 'book', zoomMode: 'fit', updatedAt: 120
  } };
  const item = keeps.normalize(store([record('p', 130, { text: 't'.repeat(2500), anchor })])).items[0];
  assert.equal(item.text.length, 2000);
  assert.equal(item.anchor.quote.length, 400);
  assert.deepEqual(plain(item.anchor.position), anchor.position);
  assert.equal(keeps.normalize(store([record('bad', 130, { anchor: { ...anchor, page: 1.5 } })])).items.length, 0);
});

test('malformed optional PDF position is dropped without losing its page anchor', () => {
  const anchor = { kind: 'pdf', page: 2, position: { v: 1, page: 3, x: .5, y: .5 } };
  const item = keeps.normalize(store([record('p', 130, { anchor })])).items[0];
  assert.deepEqual(plain(item.anchor), { kind: 'pdf', page: 2 });
  anchor.position = { v: 1, page: 2, x: new Number(.4), y: .5 };
  assert.equal(keeps.normalize(store([record('p', 130, { anchor })])).items[0].anchor.position, undefined);
});

test('text and reader anchors require an integer paragraph and unit offset', () => {
  const good = ['text', 'reader'].map((kind, index) =>
    record(`a${index}`, 120, { anchor: { kind, para: index, offset: .25, quote: 'selected' } }));
  const bad = [
    record('negative', 120, { anchor: { kind: 'text', para: -1, offset: .5 } }),
    record('fraction', 120, { anchor: { kind: 'reader', para: .5, offset: .5 } }),
    record('beyond', 120, { anchor: { kind: 'text', para: 0, offset: 1.01 } }),
    record('coerced', 120, { anchor: { kind: 'reader', para: '1', offset: '0.5' } })
  ];
  assert.deepEqual(ids(keeps.normalize(store([...good, ...bad]))), ['a0', 'a1']);
});

test('future outliers, maximum integers, and coercive numbers cannot poison edits', () => {
  const cap = NOW + 366 * 24 * 60 * 60 * 1000;
  const state = store([
    record('valid', cap), record('future', cap + 1),
    record('unsafe', Number.MAX_SAFE_INTEGER), record('wrapped', new Number(100))
  ], { future: cap + 1, valid: 110, unsafe: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(ids(keeps.normalize(state)), ['valid']);
  assert.deepEqual(plain(keeps.normalize(state).deleted), { valid: 110 });
  assert.throws(() => keeps.upsert(store(), record('x'), cap + 1), { name: 'RangeError' });
  assert.throws(() => keeps.remove(store(), 'x', Number.MAX_SAFE_INTEGER), { name: 'RangeError' });
  assert.throws(() => keeps.upsert(store([record('ceiling', cap)]), record('ceiling'), cap), { name: 'RangeError' });
});

test('prototype-sensitive IDs and dictionary keys are rejected without pollution', () => {
  const deleted = JSON.parse('{"__proto__":999,"constructor":999,"prototype":999,"safe":101}');
  const state = keeps.normalize(store([
    record('__proto__'), record('constructor'), record('prototype'), record('safe')
  ], deleted));
  assert.deepEqual(ids(state), []);
  assert.deepEqual(plain(state.deleted), { safe: 101 });
  assert.equal({}.polluted, undefined);
  assert.throws(() => keeps.remove(store(), '__proto__', 200), { name: 'TypeError' });
  assert.throws(() => keeps.upsert(store(), record('constructor'), 200), { name: 'TypeError' });
});
