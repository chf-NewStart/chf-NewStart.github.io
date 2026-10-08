const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// State operations must stay usable without a DOM, canvas, or native bridge.
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-ink.js'), 'utf8'), context, { filename: 'reading-ink.js' });
const ink = context.window.PhloemInk;
assert.ok(ink, 'the PDF ink module exposes its browser API');

const plain = value => JSON.parse(JSON.stringify(value));
const stroke = (id, updatedAt = 100, extra = {}) => ({
  id, color: 'black', width: 3, points: [[0.1, 0.2, 0.4], [0.3, 0.4, 0.8]],
  at: 100, updatedAt, ...extra
});
const page = (value, number = '1') => value.pages[number] || [];
const ids = (value, number = '1') => Array.from(page(value, number), item => item.id).sort();
function canonical(value) {
  const data = plain(value);
  for (const entries of Object.values(data.pages)) entries.sort((a, b) => a.id.localeCompare(b.id));
  return data;
}

const readerSource = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
function readerSection(start, end) {
  const from = readerSource.indexOf(start);
  const to = readerSource.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `reader test hooks exist: ${start}`);
  return readerSource.slice(from, to);
}
function libraryHarness(chapters) {
  const state = { chapters: plain(chapters), deleted: {}, merged: {} };
  const ctx = vm.createContext({
    window: { PhloemInk: ink }, state, currentId: null, now: () => 1000,
    find: id => state.chapters.find(item => item.id === id),
    normalizedPdfPosition: () => null, newerPdfPosition: () => null,
    reviewStateStamp: () => 0, saveDerivedSoon() {}, derivedData: () => null,
    mergeDerivedInto: () => false, migrateReviewWorkspaceLabels: () => false,
    duplicateGroups: () => [], titleQuality: () => 0,
    mergeTags: (a, b) => [...a, ...b], mergeItemArrays: (a, b) => [...a, ...b],
    mergeNoteMap: (a, b) => ({ ...a, ...b }), mergeHighlightMap: (a, b) => ({ ...a, ...b }),
    mergeReviews: (a, b) => ({ ...a, ...b }), mergeLookups: (a, b) => ({ ...a, ...b })
  });
  vm.runInContext([
    readerSection('  function normalize(ch,options){', '\n  var pendingDuplicateStorage'),
    readerSection('  function mergePdfInk(', '\n  function pdfInkStamp('),
    readerSection('  function mergeDuplicateRecord(', '\n  function canonicalPaper('),
    readerSection('  var STAMPED_FIELDS=', '\n  // Typing saves once'),
    readerSection('  function mergeState(inc){', '\n  var syncDecryptBlocked')
  ].join('\n'), ctx);
  return ctx;
}
function chapter(updatedAt, pdfInk, pdfInkDeleted = {}, extra = {}) {
  return { id: 'paper', kind: 'pdf', updatedAt, addedAt: 1, pdfInk, pdfInkDeleted, ...extra };
}
const chapterIds = (value, number = '1') => ids({ pages: value.pdfInk }, number);

test('empty and legacy records normalize safely without DOM access', () => {
  for (const input of [undefined, null, false, 1, '', [], 'bad']) {
    const result = ink.normalize(input, input);
    assert.deepEqual(Object.keys(result.pages), []);
    assert.deepEqual(Object.keys(result.deleted), []);
  }
});

test('valid normalized vectors preserve geometry, pressure, style, identity, and timestamps', () => {
  const saved = stroke('ink-1', 120, { color: 'blue', width: 1.5 });
  const result = ink.normalize({ 1: [saved] }, {});
  assert.deepEqual(plain(page(result)[0]), saved);
});

test('each supported pen color and width round-trips', () => {
  for (const color of ['black', 'blue', 'red', 'green', 'purple', 'orange', 'teal', 'gray']) {
    for (const width of [1.5, 3, 5]) {
      const saved = stroke(`${color}-${width}`, 100, { color, width });
      const result = page(ink.normalize({ 1: [saved] }, {}))[0];
      assert.equal(result.color, color);
      assert.equal(result.width, width);
    }
  }
});

test('single-point Pencil dots are valid notes', () => {
  const result = ink.normalize({ 1: [stroke('dot', 100, { points: [[0.5, 0.5, 0.6]] })] }, {});
  assert.deepEqual(ids(result), ['dot']);
  assert.equal(page(result)[0].points.length, 1);
});

test('natural style and straight-line shape survive normalization, backup and merge', () => {
  const saved = stroke('natural-line', 130, { style: 'natural', shape: 'line' });
  const normalized = ink.normalize({ 1: [saved] }, {});
  assert.deepEqual(plain(page(normalized)[0]), saved);
  const restored = JSON.parse(JSON.stringify(normalized));
  assert.deepEqual(plain(page(ink.merge({}, {}, restored.pages, restored.deleted))[0]), saved);
  const invalid = page(ink.normalize({ 1: [stroke('invalid-style', 100, { style: 'unknown', shape: 'unknown' })] }, {}))[0];
  assert.equal(invalid.style, undefined);
  assert.equal(invalid.shape, undefined);
});

test('malformed stroke records cannot discard neighboring valid notes', () => {
  const result = ink.normalize({ 1: [
    null, false, [], {}, { id: 'missing-points' }, stroke('', 100),
    stroke('empty', 100, { points: [] }),
    stroke('not-array', 100, { points: 'not vector data' }),
    stroke('invalid-points', 100, { points: [null, [], ['bad', 'data']] }),
    stroke('good')
  ] }, {});
  assert.deepEqual(ids(result), ['good']);
});

test('normalized point coordinates and pressures are finite and bounded', () => {
  const result = ink.normalize({ 1: [stroke('bounded', 100, {
    points: [[-10, 8, 2], [0.4, 0.6, -1], [0.3, 0.4, 0.7]]
  })] }, {});
  assert.deepEqual(ids(result), ['bounded']);
  for (const point of page(result)[0].points) {
    assert.equal(point.length, 3);
    for (const coordinate of point) assert.ok(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
  }
});

test('non-finite geometry is rejected rather than drawing broken SVG paths', () => {
  const result = ink.normalize({ 1: [
    stroke('infinite', 100, { points: [[Infinity, 0.5, 0.5]] }),
    stroke('nan', 100, { points: [[NaN, 0.5, 0.5]] }),
    stroke('pressure', 100, { points: [[0.5, 0.5, Infinity]] }),
    stroke('good')
  ] }, {});
  assert.deepEqual(ids(result), ['good']);
});

test('invalid style metadata never reaches rendered SVG attributes', () => {
  const result = ink.normalize({ 1: [stroke('style', 100, {
    color: 'url(javascript:alert(1))', width: Infinity
  })] }, {});
  for (const entry of page(result)) {
    assert.ok(['black', 'blue', 'red'].includes(entry.color));
    assert.ok([1.5, 3, 5].includes(entry.width));
  }
});

test('page keys are restricted to positive whole PDF page numbers', () => {
  const result = ink.normalize({
    0: [stroke('zero')], '-1': [stroke('negative')], '1.5': [stroke('fraction')],
    bad: [stroke('not-a-page')], 2: [stroke('second')]
  }, {});
  assert.deepEqual(Object.keys(result.pages), ['2']);
  assert.deepEqual(ids(result, '2'), ['second']);
});

test('malformed page values and tombstones are ignored safely', () => {
  const result = ink.normalize({ 1: null, 2: {}, 3: 'bad', 4: [stroke('good')] }, {
    invalid: 'bad', infinite: Infinity, negative: -10, erased: 150
  });
  assert.deepEqual(ids(result, '4'), ['good']);
  assert.equal(result.deleted.erased, 150);
  for (const timestamp of Object.values(result.deleted)) assert.ok(Number.isFinite(timestamp) && timestamp > 0);
});

test('normalization is idempotent and does not mutate caller data', () => {
  const pages = { 1: [stroke('a')], 2: [stroke('b', 150)] };
  const deleted = { old: 120 };
  const before = JSON.stringify({ pages, deleted });
  const first = ink.normalize(pages, deleted);
  const second = ink.normalize(first.pages, first.deleted);
  assert.deepEqual(canonical(first), canonical(second));
  assert.equal(JSON.stringify({ pages, deleted }), before);
});

test('merging a saved state with itself is idempotent', () => {
  const pages = { 1: [stroke('a'), stroke('b')], 2: [stroke('c')] };
  const deleted = { gone: 130 };
  const result = ink.merge(pages, deleted, pages, deleted);
  assert.deepEqual(canonical(result), canonical(ink.normalize(pages, deleted)));
});

test('concurrent strokes from two devices are both retained', () => {
  const left = { 1: [stroke('ipad-a')] };
  const right = { 1: [stroke('ipad-b', 140)] };
  const result = ink.merge(left, {}, right, {});
  assert.deepEqual(ids(result), ['ipad-a', 'ipad-b']);
  assert.deepEqual(canonical(result), canonical(ink.merge(right, {}, left, {})));
});

test('independent PDF pages remain independent through merge', () => {
  const result = ink.merge({ 1: [stroke('page-one')] }, {}, { 2: [stroke('page-two')] }, {});
  assert.deepEqual(ids(result, '1'), ['page-one']);
  assert.deepEqual(ids(result, '2'), ['page-two']);
});

test('the newest revision of an existing stroke wins in either merge direction', () => {
  const old = { 1: [stroke('same', 120)] };
  const fresh = { 1: [stroke('same', 180, { color: 'red', points: [[0.8, 0.9, 0.7]] })] };
  for (const result of [ink.merge(old, {}, fresh, {}), ink.merge(fresh, {}, old, {})]) {
    assert.deepEqual(ids(result), ['same']);
    assert.deepEqual(plain(page(result)[0]), fresh[1][0]);
  }
});

test('erase tombstones beat older and equal stroke revisions', () => {
  for (const updatedAt of [100, 150]) {
    const result = ink.merge({ 1: [stroke('erased', updatedAt)] }, {}, {}, { erased: 150 });
    assert.deepEqual(ids(result), []);
    assert.equal(result.deleted.erased, 150);
  }
});

test('importing a stale backup cannot resurrect an erased stroke', () => {
  const backup = { 1: [stroke('erased', 100), stroke('retained', 105)] };
  const erased = ink.merge(backup, {}, {}, { erased: 150 });
  const firstRestore = ink.merge(erased.pages, erased.deleted, backup, {});
  const secondRestore = ink.merge(backup, {}, firstRestore.pages, firstRestore.deleted);
  assert.deepEqual(ids(firstRestore), ['retained']);
  assert.deepEqual(ids(secondRestore), ['retained']);
  assert.equal(secondRestore.deleted.erased, 150);
});

test('erasures from both devices survive and the newest deletion wins', () => {
  const result = ink.merge({}, { a: 140, shared: 160 }, {}, { b: 150, shared: 200 });
  assert.deepEqual(plain(result.deleted), { a: 140, shared: 200, b: 150 });
});

test('Undo can restore a stroke using a revision newer than its erase tombstone', () => {
  const restored = stroke('restored', 201);
  const result = ink.merge({}, { restored: 200 }, { 1: [restored] }, { restored: 200 });
  assert.deepEqual(ids(result), ['restored']);
  assert.deepEqual(plain(page(result)[0]), restored);
  const staleDevice = ink.merge(result.pages, result.deleted, { 1: [stroke('restored', 100)] }, { restored: 200 });
  assert.deepEqual(plain(page(staleDevice)[0]), restored);
});

test('a later redo deletion removes a previously restored stroke', () => {
  const result = ink.merge({ 1: [stroke('restored', 201)] }, { restored: 200 }, {}, { restored: 250 });
  assert.deepEqual(ids(result), []);
  assert.equal(result.deleted.restored, 250);
});

test('merging never mutates either device state', () => {
  const left = { pages: { 1: [stroke('a', 120)] }, deleted: { old: 130 } };
  const right = { pages: { 1: [stroke('a', 140), stroke('b', 150)] }, deleted: { gone: 160 } };
  const before = JSON.stringify({ left, right });
  ink.merge(left.pages, left.deleted, right.pages, right.deleted);
  assert.equal(JSON.stringify({ left, right }), before);
});

test('backup JSON round-trip preserves vectors and erase history', () => {
  const saved = ink.normalize({ 1: [stroke('note')], 8: [stroke('diagram', 170)] }, { erased: 180 });
  const backup = plain(saved);
  assert.deepEqual(canonical(ink.normalize(backup.pages, backup.deleted)), canonical(saved));
});

test('actual library merge preserves local ink when a newer chapter replaces metadata', () => {
  const ctx = libraryHarness([chapter(100, { 1: [stroke('local', 101)] }, {}, { title: 'Old title' })]);
  assert.equal(ctx.mergeState({ chapters: [chapter(200, { 1: [stroke('remote', 201)] }, {}, { title: 'New title' })] }), true);
  assert.equal(ctx.state.chapters[0].title, 'New title');
  assert.deepEqual(chapterIds(ctx.state.chapters[0]), ['local', 'remote']);
});

test('actual library merge accepts ink from older or equal chapters without replacing current notes', () => {
  for (const remoteStamp of [100, 200]) {
    const ctx = libraryHarness([chapter(200, { 1: [stroke('local', 150)] }, {}, { title: 'Current title', pageNotes: { 1: 'Keep this note' } })]);
    const remote = chapter(remoteStamp, { 1: [stroke('remote', 160)] }, {}, { title: 'Older title', pageNotes: { 1: 'Old note' } });
    assert.equal(ctx.mergeState({ chapters: [remote] }), true);
    assert.equal(ctx.state.chapters[0].title, 'Current title');
    assert.equal(ctx.state.chapters[0].pageNotes[1], 'Keep this note');
    assert.deepEqual(chapterIds(ctx.state.chapters[0]), ['local', 'remote']);
  }
});

test('an older-build chapter without ink fields cannot wipe saved handwriting', () => {
  const local = chapter(100, { 3: [stroke('keep', 120)] }, { erased: 130 });
  const ctx = libraryHarness([local]);
  assert.equal(ctx.mergeState({ chapters: [{ id: 'paper', kind: 'pdf', updatedAt: 300, addedAt: 1, title: 'Edited elsewhere' }] }), true);
  assert.deepEqual(chapterIds(ctx.state.chapters[0], '3'), ['keep']);
  assert.equal(ctx.state.chapters[0].pdfInkDeleted.erased, 130);
});

test('actual library merge applies erase tombstones independent of chapter LWW', () => {
  for (const remoteStamp of [50, 100, 200]) {
    const ctx = libraryHarness([chapter(100, { 1: [stroke('gone', 110), stroke('keep', 120)] })]);
    assert.equal(ctx.mergeState({ chapters: [chapter(remoteStamp, {}, { gone: 150 })] }), true);
    assert.deepEqual(chapterIds(ctx.state.chapters[0]), ['keep']);
    assert.equal(ctx.state.chapters[0].pdfInkDeleted.gone, 150);
    ctx.mergeState({ chapters: [chapter(500, { 1: [stroke('gone', 110)] })] });
    assert.deepEqual(chapterIds(ctx.state.chapters[0]), ['keep']);
  }
});

test('actual duplicate-paper merge retains ink from both copies and honors erasures', () => {
  const keep = chapter(100, { 1: [stroke('left'), stroke('gone')] });
  const extra = chapter(200, { 1: [stroke('right')], 2: [stroke('page-two')] }, { gone: 150 }, { id: 'duplicate' });
  const ctx = libraryHarness([]);
  ctx.mergeDuplicateRecord(keep, extra);
  assert.equal(keep.id, 'paper');
  assert.deepEqual(chapterIds(keep), ['left', 'right']);
  assert.deepEqual(chapterIds(keep, '2'), ['page-two']);
  assert.equal(keep.pdfInkDeleted.gone, 150);
});
