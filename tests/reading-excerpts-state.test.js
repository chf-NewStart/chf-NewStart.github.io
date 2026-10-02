const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-excerpts.js'), 'utf8'), context,
  { filename: 'reading-excerpts.js' });
const excerpts = context.window.PhloemExcerpts;
const plain = value => JSON.parse(JSON.stringify(value));
const ids = value => Array.from(value.items, item => item.id);
const pdf = (page = 3) => ({ kind: 'pdf', page });
const record = (id, updatedAt = 100, overrides = {}) => ({
  id, quote: 'A passage', note: 'My note', anchor: pdf(), createdAt: 50, updatedAt, ...overrides
});
const store = (items = [], deleted = {}) => ({ version: 1, items, deleted });

test('plain-script API is frozen and normalizes an empty store', () => {
  assert.deepEqual(Object.keys(excerpts).sort(), ['merge', 'normalize', 'remove', 'upsert']);
  assert.equal(Object.isFrozen(excerpts), true);
  assert.deepEqual(plain(excerpts.normalize()), store());
});

test('normalization preserves valid neighbors and does not mutate input', () => {
  const input = store([
    record('first'), null, {}, record('bad-id', 100, { id: '' }),
    record('bad-page', 100, { anchor: pdf(0) }),
    record('bad-quote', 100, { quote: 'q'.repeat(12001) }),
    record('bad-note', 100, { note: 'n'.repeat(20001) }),
    record('bad-time', Infinity), record('second', 101)
  ], { invalid: Infinity, erased: 120 });
  const before = JSON.stringify(input);
  assert.deepEqual(plain(excerpts.normalize(input)),
    store([record('first'), record('second', 101)], { erased: 120 }));
  assert.equal(JSON.stringify(input), before);
});

test('unknown versions fail closed before all mutations', () => {
  const future = { version: 2, items: [record('keep')], deleted: {} };
  for (const operation of [
    () => excerpts.normalize(future), () => excerpts.merge(store(), future),
    () => excerpts.merge(future, store()),
    () => excerpts.upsert(future, record('new'), 200),
    () => excerpts.remove(future, 'keep', 200)
  ]) assert.throws(operation, error => error.code === 'UNSUPPORTED_VERSION' && error.version === 2);
  assert.deepEqual(plain(future), { version: 2, items: [record('keep')], deleted: {} });
});

test('upsert preserves creation time and advances a stable ID logical clock', () => {
  const blank = excerpts.upsert(store(), { id: 'a', quote: '', note: '', anchor: pdf() }, 100);
  assert.deepEqual(plain(blank.items[0]), record('a', 100,
    { quote: '', note: '', createdAt: 100 }));
  const edited = excerpts.upsert(blank, { id: 'a', quote: 'Selected', note: 'Why?', anchor: pdf(7) }, 100);
  assert.equal(edited.items[0].createdAt, 100);
  assert.equal(edited.items[0].updatedAt, 101);
  assert.equal(edited.items[0].anchor.page, 7);
  assert.equal(blank.items[0].note, '');
});

test('oversized upserts reject without truncation; imported oversized items are rejected', () => {
  for (const raw of [
    { id: 'q', quote: 'q'.repeat(12001), note: '', anchor: pdf() },
    { id: 'n', quote: '', note: 'n'.repeat(20001), anchor: pdf() }
  ]) assert.throws(() => excerpts.upsert(store(), raw, 100), { name: 'RangeError' });
  assert.equal(excerpts.normalize(store([record('q', 100, { quote: 'q'.repeat(12001) })])).items.length, 0);
  assert.equal(excerpts.normalize(store([record('n', 100, { note: 'n'.repeat(20001) })])).items.length, 0);
  const exact = excerpts.upsert(store(), {
    id: 'exact', quote: 'q'.repeat(12000), note: 'n'.repeat(20000), anchor: pdf()
  }, 100);
  assert.equal(exact.items[0].quote.length, 12000);
  assert.equal(exact.items[0].note.length, 20000);
});

test('removal defeats stale merges; later upsert restores the same ID', () => {
  const old = store([record('a', 100), record('b', 100)]);
  const erased = excerpts.remove(old, 'a', 100);
  assert.deepEqual(ids(erased), ['b']);
  assert.equal(erased.deleted.a, 101);
  assert.deepEqual(ids(excerpts.merge(erased, old)), ['b']);
  const restored = excerpts.upsert(erased,
    { id: 'a', quote: 'Restored', note: '', anchor: pdf() }, 100);
  assert.equal(restored.items.find(item => item.id === 'a').updatedAt, 102);
  assert.equal(restored.deleted.a, 101);
});

test('independent additions merge, tie conflicts are deterministic, and tombstones win ties', () => {
  const left = store([record('a'), record('same', 100, { note: 'Alpha' })]);
  const right = store([record('b'), record('same', 100, { note: 'Beta' })]);
  const ab = plain(excerpts.merge(left, right));
  assert.deepEqual(ab, plain(excerpts.merge(right, left)));
  assert.deepEqual(ab, plain(excerpts.merge(ab, ab)));
  assert.deepEqual(ab, plain(excerpts.normalize(ab)));
  assert.deepEqual(ab.items.map(item => item.id), ['a', 'b', 'same']);
  assert.equal(ab.items.find(item => item.id === 'same').note, 'Beta');
  assert.deepEqual(ids(excerpts.merge(ab, store([], { same: 100 }))), ['a', 'b']);
});

test('PDF anchors preserve validated position and PDF source hashes normalize to lowercase', () => {
  const anchor = { kind: 'pdf', page: 9, position: {
    v: 1, page: 9, x: .2, y: .8, screenX: .5, screenY: .4,
    pdfX: -20, pdfY: 330, zoom: 2.1, layout: 'book', zoomMode: 'fit', updatedAt: 120
  } };
  const sourceHash = 'A1'.repeat(32);
  const item = excerpts.normalize(store([record('p', 130, { anchor, sourceHash })])).items[0];
  assert.deepEqual(plain(item.anchor), anchor);
  assert.equal(item.sourceHash, sourceHash.toLowerCase());
  const wrongPosition = { kind: 'pdf', page: 2, position: { v: 1, page: 3, x: .5, y: .5 } };
  assert.deepEqual(plain(excerpts.normalize(store([record('p', 130, { anchor: wrongPosition })])).items[0].anchor),
    { kind: 'pdf', page: 2 });
});

test('text and reader anchors require paragraph and unit offset; all records require anchors', () => {
  const good = ['text', 'reader'].map((kind, index) =>
    record(`a${index}`, 120, { anchor: { kind, para: index, offset: .25 }, quote: '' }));
  const bad = [
    record('missing', 120, { anchor: undefined }),
    record('null', 120, { anchor: null }),
    record('negative', 120, { anchor: { kind: 'text', para: -1, offset: .5 } }),
    record('fraction', 120, { anchor: { kind: 'reader', para: .5, offset: .5 } }),
    record('beyond', 120, { anchor: { kind: 'text', para: 0, offset: 1.01 } }),
    record('coerced', 120, { anchor: { kind: 'reader', para: '1', offset: '0.5' } })
  ];
  assert.deepEqual(ids(excerpts.normalize(store([...good, ...bad]))), ['a0', 'a1']);
});

test('invalid or misplaced source hashes reject records and upserts', () => {
  const text = { kind: 'text', para: 0, offset: .5 };
  const bad = [
    record('short', 100, { sourceHash: 'abc' }),
    record('nonhex', 100, { sourceHash: 'z'.repeat(64) }),
    record('wrong-kind', 100, { sourceHash: 'a'.repeat(64), anchor: text })
  ];
  assert.deepEqual(ids(excerpts.normalize(store([...bad, record('good')]))), ['good']);
  for (const raw of bad)
    assert.throws(() => excerpts.upsert(store(), raw, 100), { name: 'TypeError' });
});

test('future clocks, unsafe numbers, and prototype-sensitive IDs cannot poison edits', () => {
  const cap = NOW + 366 * 24 * 60 * 60 * 1000;
  const deleted = JSON.parse('{"__proto__":999,"constructor":999,"prototype":999,"safe":101}');
  const state = store([
    record('valid', cap), record('future', cap + 1),
    record('unsafe', Number.MAX_SAFE_INTEGER), record('wrapped', new Number(100)),
    record('__proto__'), record('constructor'), record('prototype')
  ], deleted);
  assert.deepEqual(ids(excerpts.normalize(state)), ['valid']);
  assert.deepEqual(plain(excerpts.normalize(state).deleted), { safe: 101 });
  assert.throws(() => excerpts.upsert(store(), record('x'), cap + 1), { name: 'RangeError' });
  assert.throws(() => excerpts.remove(store(), 'x', Number.MAX_SAFE_INTEGER), { name: 'RangeError' });
  assert.throws(() => excerpts.upsert(store([record('ceiling', cap)]), record('ceiling'), cap),
    { name: 'RangeError' });
  assert.throws(() => excerpts.remove(store(), '__proto__', 200), { name: 'TypeError' });
  assert.throws(() => excerpts.upsert(store(), record('constructor'), 200), { name: 'TypeError' });
  assert.equal({}.polluted, undefined);
});
