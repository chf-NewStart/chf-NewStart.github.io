const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reading-workspace.js'), 'utf8');
const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock });
vm.runInContext(source, context, { filename: 'reading-workspace.js' });
const api = context.window.PhloemWorkspaceState;
const restoreStrokes = (value, targets, stamp) => api.restoreGroup(value, { positions: {}, strokes: targets }, stamp);
const plain = value => JSON.parse(JSON.stringify(value));
const board = (extra = {}) => ({ version: 3, width: 2000, height: 3000,
  positions: { note: { x: 200, y: 400, width: 420, updatedAt: 80 } },
  strokes: [], deleted: {}, ...extra });
const ink = (id, extra = {}) => ({ id, color: 'blue', width: 2,
  points: [[300, 500, .5], [350, 550, .8]], style: 'natural',
  createdAt: 50, updatedAt: 100, ...extra });
const metadata = { anchor: { clipId: 'note', x: 200, y: 400, width: 420 },
  nib: 'marker', shape: 'line' };

// The former reader restore loop explicitly stripped absent metadata before each
// addStroke. Keep it here as an independent compatibility reference.
function previousRestore(value, targets, stamp) {
  let next = api.normalize(value);
  for (const target of targets) {
    next.strokes = next.strokes.map(current => {
      if (current.id !== target.id) return current;
      const copy = { ...current };
      for (const key of ['anchor', 'nib', 'shape'])
        if (!Object.prototype.hasOwnProperty.call(target, key)) delete copy[key];
      return copy;
    });
    next = api.addStroke(next, target, stamp);
  }
  return next;
}

test('bulk restore matches the previous loop and preserves unselected content', () => {
  const input = board({ strokes: [ink('a', metadata), ink('b'), ink('untouched', { updatedAt: 120 })],
    deleted: { retired: 200 } });
  const targets = [ink('b', { ...metadata, color: 'red', points: [[1400, 2400, .7]] }),
    ink('a', { width: 4, points: [[800, 700, .2]] }), ink('new')];
  const result = plain(restoreStrokes(input, targets, 100));
  assert.deepEqual(result, plain(previousRestore(input, targets, 100)));
  assert.deepEqual(result.positions, input.positions);
  assert.deepEqual(result.deleted, input.deleted);
  assert.equal(result.width, input.width);
  assert.equal(result.height, input.height);
  assert.deepEqual(result.strokes.find(item => item.id === 'untouched'), input.strokes[2]);
  assert.deepEqual(result.strokes.map(item => item.id), ['a', 'b', 'new', 'untouched']);
  assert.deepEqual(plain(restoreStrokes(input, [...targets].reverse(), 100)), result);
});

test('exact restore removes absent metadata while ordinary addStroke still inherits it', () => {
  const input = board({ strokes: [ink('a', metadata)] });
  for (const retained of [[], ['anchor'], ['nib'], ['shape'], ['anchor', 'nib', 'shape']]) {
    const target = ink('a');
    for (const key of retained) target[key] = metadata[key];
    const restored = restoreStrokes(input, [target], 150).strokes[0];
    for (const key of Object.keys(metadata)) {
      assert.equal(Object.prototype.hasOwnProperty.call(restored, key), retained.includes(key), key);
      if (retained.includes(key)) assert.deepEqual(plain(restored[key]), metadata[key]);
    }
    assert.deepEqual(plain(restoreStrokes(input, [target], 150)),
      plain(previousRestore(input, [target], 150)));
  }
  const added = api.addStroke(input, ink('a'), 150).strokes[0];
  for (const key of Object.keys(metadata)) assert.deepEqual(plain(added[key]), metadata[key]);
});

test('restores advance live and deleted clocks with addStroke creation semantics', () => {
  const input = board({ strokes: [ink('live', { updatedAt: 600 }),
    ink('erased', { updatedAt: 200 })], deleted: { live: 500, erased: 700, untouched: 900 } });
  const targets = [ink('live', { createdAt: 1, updatedAt: 1 }),
    ink('erased', { createdAt: 1, updatedAt: 1 }), ink('new')];
  const result = plain(restoreStrokes(input, targets, 100));
  assert.deepEqual(result, plain(previousRestore(input, targets, 100)));
  const byId = Object.fromEntries(result.strokes.map(item => [item.id, item]));
  assert.deepEqual([byId.live.createdAt, byId.live.updatedAt], [50, 601]);
  assert.deepEqual([byId.erased.createdAt, byId.erased.updatedAt], [701, 701]);
  assert.deepEqual([byId.new.createdAt, byId.new.updatedAt], [100, 100]);
  assert.deepEqual(result.deleted, input.deleted);
});

test('invalid or duplicate targets reject the entire restore without changing inputs', () => {
  const input = board({ strokes: [ink('a', metadata), ink('b')] });
  const before = JSON.stringify(input);
  const inherited = [];
  inherited.length = 1;
  Object.setPrototypeOf(inherited, { 0: ink('a') });
  const invalid = [null, {}, Array(1), inherited, [ink('a'), ink('a')], [null],
    [ink('constructor')], [ink('__proto__')], [ink('prototype')], [ink('')],
    [ink('a', { color: 'pink' })], [ink('a', { width: 0 })],
    [ink('a', { points: [] })], [ink('a', { points: [[2001, 10, .5]] })],
    [ink('a', { points: [[10, Infinity, .5]] })],
    [ink('a', { points: [[10, 10, 2]] })], [ink('a', { points: [[10, 10]] })],
    [ink('a', { anchor: null })], [ink('a', { anchor: { ...metadata.anchor, clipId: 'constructor' } })],
    [ink('a', { nib: 'pen' })], [ink('a', { shape: 'circle' })],
    [ink('b', { color: 'red' }), ink('a', { nib: undefined })]];
  for (const targets of invalid) {
    assert.throws(() => restoreStrokes(input, targets, 150), { name: 'TypeError' });
    assert.equal(JSON.stringify(input), before);
  }
  for (const stamp of [-1, NaN, Infinity, NOW + 367 * 86400000]) {
    assert.throws(() => restoreStrokes(input, [ink('a')], stamp), { name: 'RangeError' });
    assert.equal(JSON.stringify(input), before);
  }
  const cap = NOW + 366 * 86400000;
  assert.throws(() => restoreStrokes(board({ strokes: [ink('a', { updatedAt: cap })] }),
    [ink('a')], cap), { name: 'RangeError' });
});

test('restore neither mutates nor shares editable geometry with its inputs', () => {
  const input = board({ strokes: [ink('a', metadata), ink('b')] });
  const targets = [ink('a', { ...metadata, points: [[600, 700, .4]] })];
  const before = JSON.stringify({ input, targets });
  const result = restoreStrokes(input, targets, 150);
  assert.equal(JSON.stringify({ input, targets }), before);
  result.strokes[0].points[0][0] = 900;
  result.strokes[0].anchor.x = 800;
  result.strokes[1].points[0][0] = 1000;
  result.positions.note.x = 900;
  result.deleted.a = 999;
  assert.equal(JSON.stringify({ input, targets }), before);
  assert.deepEqual(plain(restoreStrokes(input, [], 150)), plain(api.normalize(input)));
});

test('group restore matches sequential place and stroke restore for mixed selections', () => {
  const input = board({ positions: {
    note: { x: 200, y: 400, width: 420, updatedAt: 400 },
    other: { x: 700, y: 900, width: 280, updatedAt: 80 }
  }, strokes: [ink('a', metadata), ink('b')] });
  const target = { positions: {
    note: { x: 1900, y: 4000, width: 1200, updatedAt: 1 },
    new: { x: -30, y: -40 }
  }, strokes: [ink('a', { color: 'red' })] };
  const before = JSON.stringify({ input, target });
  let expected = api.normalize(input);
  for (const key of Object.keys(target.positions))
    expected = api.place(expected, key, target.positions[key], 100);
  expected = previousRestore(expected, target.strokes, 100);
  const result = plain(api.restoreGroup(input, target, 100));
  assert.deepEqual(result, plain(expected));
  assert.deepEqual(result.positions.note, { x: 1100, y: 3000, width: 900, updatedAt: 401 });
  assert.deepEqual(result.positions.new, { x: 0, y: 0, width: 420, updatedAt: 100 });
  assert.deepEqual(result.positions.other, input.positions.other);
  assert.equal(result.strokes.find(item => item.id === 'a').anchor, undefined);
  assert.equal(JSON.stringify({ input, target }), before);
});

test('group input and card validation remain atomic when a later edit fails', () => {
  const input = board({ strokes: [ink('a', metadata)] });
  const before = JSON.stringify(input);
  const targets = [null, [], {}, { positions: [], strokes: [] }, { positions: {}, strokes: {} },
    { positions: { note: { x: NaN, y: 10 } }, strokes: [] },
    { positions: { note: { x: 10, y: 10, width: '420' } }, strokes: [] },
    { positions: { constructor: { x: 10, y: 10 } }, strokes: [] },
    { positions: JSON.parse('{"__proto__":{"x":10,"y":10}}'), strokes: [] },
    { positions: { note: { x: 300, y: 500 }, invalid: null }, strokes: [] },
    { positions: { note: { x: 300, y: 500 } }, strokes: [ink('a', { width: Infinity })] }];
  for (const target of targets) {
    assert.throws(() => api.restoreGroup(input, target, 150), { name: 'TypeError' });
    assert.equal(JSON.stringify(input), before);
  }
  const cap = NOW + 366 * 86400000;
  assert.throws(() => api.restoreGroup(board({ positions: {
    note: { x: 200, y: 400, width: 420, updatedAt: cap }
  } }), { positions: { note: { x: 100, y: 100 } }, strokes: [] }, cap), { name: 'RangeError' });
});

test('large restores validate and copy points in a bounded number of passes', () => {
  const measured = vm.createContext({ window: {}, Date: Clock, copiedPoints: 0 });
  const copySite = 'points.push([point[0], point[1], point[2]]);';
  assert.equal(source.split(copySite).length, 2, 'point-copy instrumentation matches exactly once');
  vm.runInContext(source.replace(copySite,
    'copiedPoints++; points.push([point[0], point[1], point[2]]);'), measured);
  const count = 1000, pointsPerStroke = 32;
  const input = board({ strokes: Array.from({ length: count }, (_, i) => ink('ink-' + i,
    { points: Array.from({ length: pointsPerStroke }, (_, j) => [300 + j, 500 + i, .5]) })) });
  const targets = input.strokes.map(item => ({ ...item,
    points: item.points.map(point => [point[0] + 10, point[1], point[2]]) }));
  const positions = Object.fromEntries(Array.from({ length: 100 }, (_, i) =>
    ['note-' + i, { x: 30, y: i * 20, width: 420 }]));
  const result = measured.window.PhloemWorkspaceState.restoreGroup(input, { positions, strokes: targets }, 200);
  assert.equal(result.strokes.length, count);
  assert.equal(Object.keys(result.positions).length, 101);
  assert(result.strokes.every(item => item.points[0][0] === 310 && item.updatedAt === 200));
  assert(measured.copiedPoints >= count * pointsPerStroke * 2,
    'every input and restored stroke still passes point validation');
  assert(measured.copiedPoints <= count * pointsPerStroke * 4,
    `restore copied ${measured.copiedPoints} points; repeated whole-board copying returned`);
});

test('large mixed group moves bound full-board work while moving cards and ink', () => {
  const measured = vm.createContext({ window: {}, Date: Clock, copiedPoints: 0 });
  const copySite = 'points.push([point[0], point[1], point[2]]);';
  assert.equal(source.split(copySite).length, 2, 'point-copy instrumentation matches exactly once');
  vm.runInContext(source.replace(copySite,
    'copiedPoints++; points.push([point[0], point[1], point[2]]);'), measured);
  const count = 1000, pointsPerStroke = 32;
  const cards = Array.from({ length: 100 }, (_, i) =>
    ({ id: 'note-' + i, x: 30, y: i * 20, width: 420, height: 100 }));
  const input = board({ positions: Object.fromEntries(cards.map(card =>
    [card.id, { x: card.x, y: card.y, width: card.width, updatedAt: 100 }])),
  strokes: Array.from({ length: count }, (_, i) => ink('ink-' + i,
    { points: Array.from({ length: pointsPerStroke }, (_, j) => [600 + j, 500 + i, .5]) })) });
  const before = JSON.stringify(input);
  const result = measured.window.PhloemWorkspaceState.moveGroup(input,
    { clipIds: cards.map(card => card.id), strokeIds: input.strokes.map(item => item.id) },
    { x: 10, y: 20 }, cards, 200);
  assert.equal(result.strokes.length, count);
  assert(result.strokes.every(item => item.points[0][0] === 610 && item.updatedAt === 200));
  cards.forEach(card => assert.deepEqual(plain(result.positions[card.id]),
    { x: card.x + 10, y: card.y + 20, width: card.width, updatedAt: 200 }));
  assert.equal(JSON.stringify(input), before);
  assert(measured.copiedPoints >= count * pointsPerStroke * 2,
    'every input and moved stroke still passes point validation');
  assert(measured.copiedPoints <= count * pointsPerStroke * 5,
    `move copied ${measured.copiedPoints} points; repeated whole-board copying returned`);
});
