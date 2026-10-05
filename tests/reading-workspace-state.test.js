const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-workspace.js'), 'utf8'), context,
  { filename: 'reading-workspace.js' });
const workspace = context.window.PhloemWorkspaceState;
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ version: 3, width: 1000, height: 2000, positions: {}, strokes: [], deleted: {} });
const stroke = (id, updatedAt = 100, extra = {}) => ({
  id, color: 'black', width: 3, points: [[12, 1800, .5], [900, 1900, 1]],
  style: 'natural', createdAt: 50, updatedAt, ...extra
});
const board = (extra = {}) => ({ ...empty(), ...extra });
const ids = value => Array.from(value.strokes, item => item.id);

test('plain-script frozen API and canonical empty board', () => {
  assert.deepEqual(Object.keys(workspace).sort(),
    ['BOARD_WIDTH', 'MAX_HEIGHT', 'MAX_WIDTH', 'VERSION', 'addStroke', 'displayStroke', 'merge', 'moveGroup', 'normalize',
      'place', 'removeStrokes', 'selectGroup', 'setHeight', 'setWidth']);
  assert.equal(Object.isFrozen(workspace), true);
  assert.equal(workspace.VERSION, 3);
  assert.equal(workspace.BOARD_WIDTH, 1000);
  assert.equal(workspace.MAX_HEIGHT, 1_000_000);
  assert.equal(workspace.MAX_WIDTH, 1_000_000);
  assert.deepEqual(plain(workspace.normalize()), empty());
});

test('normalization skips malformed neighbors and leaves input untouched', () => {
  const input = board({
    height: 3000,
    positions: { a: { x: 20, y: 2200, width: 420, updatedAt: 100 },
      bad: { x: '20', y: 10, updatedAt: 100 } },
    strokes: [stroke('good'), null, {}, stroke('bad-points', 100, { points: [[10, NaN, .5]] }),
      stroke('bad-color', 100, { color: 'pink' }), stroke('bad-time', Infinity)],
    deleted: { invalid: Infinity, erased: 120 }
  });
  const before = JSON.stringify(input);
  const result = plain(workspace.normalize(input));
  assert.deepEqual(result, board({
    height: 3000, positions: { a: { x: 20, y: 2200, width: 420, updatedAt: 100 } },
    strokes: [stroke('good')], deleted: { erased: 120 }
  }));
  assert.equal(JSON.stringify(input), before);
});

test('unknown versions fail closed through every public operation', () => {
  const future = { ...empty(), version: 4, strokes: [stroke('keep')] };
  const operations = [
    () => workspace.normalize(future), () => workspace.merge(empty(), future),
    () => workspace.merge(future, empty()),
    () => workspace.place(future, 'a', { x: 0, y: 0 }, 100),
    () => workspace.addStroke(future, stroke('new'), 100),
    () => workspace.removeStrokes(future, ['keep'], 100),
    () => workspace.setHeight(future, 3000), () => workspace.setWidth(future, 2000),
    () => workspace.selectGroup(future, [], []),
    () => workspace.moveGroup(future, { clipIds: [], strokeIds: [] }, { x: 0, y: 0 }, [], 100)
  ];
  for (const run of operations)
    assert.throws(run, error => error.code === 'UNSUPPORTED_VERSION' && error.version === 4);
  assert.equal(future.strokes[0].id, 'keep');
});

test('version 1 and 2 boards migrate to a 1000-unit-wide version 3 without changing geometry', () => {
  for (const version of [1, 2]) {
    const legacy = { version, height: 20000,
      positions: { clip: { x: 40, y: 19000, width: 420, updatedAt: 100 } },
      strokes: [stroke('legacy', 100, { points: [[10, 19990, .5]], nib: 'marker', shape: 'line',
        anchor: { clipId: 'clip', x: 40, y: 19000, width: 420 } })], deleted: { erased: 150 } };
    const before = JSON.stringify(legacy);
    const migrated = plain(workspace.normalize(legacy));
    assert.equal(migrated.version, 3);
    assert.equal(migrated.width, 1000);
    assert.equal(migrated.height, 20000);
    assert.deepEqual(migrated.positions, legacy.positions);
    assert.deepEqual(migrated.strokes, legacy.strokes);
    assert.deepEqual(migrated.deleted, legacy.deleted);
    assert.equal(JSON.stringify(legacy), before);
    assert.deepEqual(plain(workspace.merge(empty(), legacy)).strokes, legacy.strokes);
  }
});

test('place uses logical coordinates, clamps card into board, and advances only same ID', () => {
  const first = workspace.place(empty(), 'a', { x: 900, y: 2500 }, 100);
  assert.deepEqual(plain(first.positions.a), { x: 580, y: 2000, width: 420, updatedAt: 100 });
  const second = workspace.place(first, 'b', { x: -40, y: -1, width: 1000 }, 100);
  assert.deepEqual(plain(second.positions.b), { x: 0, y: 0, width: 900, updatedAt: 100 });
  const moved = workspace.place(second, 'a', { x: 50, y: 1800, width: 280 }, 100);
  assert.deepEqual(plain(moved.positions.a), { x: 50, y: 1800, width: 280, updatedAt: 101 });
  assert.equal(first.positions.a.x, 580);
});

test('height grows only in 1000 steps and does not scale existing logical geometry', () => {
  const first = workspace.addStroke(empty(), {
    id: 'ink', color: 'teal', width: 1.5, points: [[0, 1900, 0], [1000, 4000, 1]]
  }, 100);
  const placed = workspace.place(first, 'clip', { x: 10, y: 1900, width: 420 }, 100);
  const taller = workspace.setHeight(placed, 3000);
  assert.equal(taller.height, 3000);
  assert.deepEqual(plain(taller.strokes[0].points), [[0, 1900, 0], [1000, 4000, 1]]);
  assert.deepEqual(plain(taller.positions.clip), plain(placed.positions.clip));
  assert.equal(placed.height, 2000);
  assert.throws(() => workspace.setHeight(taller, 5000), { name: 'RangeError' });
  assert.throws(() => workspace.setHeight(taller, 3000), { name: 'RangeError' });
  let grown = taller;
  for (let h = 4000; h <= 20000; h += 1000) grown = workspace.setHeight(grown, h);
  assert.equal(grown.height, 20000);
  grown = workspace.normalize(board({ height: workspace.MAX_HEIGHT - 1000 }));
  assert.equal(workspace.setHeight(grown, workspace.MAX_HEIGHT).height, workspace.MAX_HEIGHT);
  assert.throws(() => workspace.setHeight(workspace.setHeight(grown, workspace.MAX_HEIGHT),
    workspace.MAX_HEIGHT + 1000), { name: 'RangeError' });
  assert.deepEqual(plain(workspace.place(workspace.setHeight(grown, workspace.MAX_HEIGHT),
    'edge', { x: 1000, y: workspace.MAX_HEIGHT + 500, width: 420 }, 100).positions.edge),
  { x: 580, y: workspace.MAX_HEIGHT, width: 420, updatedAt: 100 });
  assert.deepEqual(ids(workspace.normalize(board({ strokes: [stroke('edge', 100,
    { points: [[1000, workspace.MAX_HEIGHT, .5]] })] }))), ['edge']);
});

test('independent card placements and strokes merge; greater height wins', () => {
  const left = board({ positions: { a: { x: 10, y: 20, width: 420, updatedAt: 100 } },
    strokes: [stroke('left')] });
  const right = board({ height: 3000,
    positions: { b: { x: 20, y: 2500, width: 420, updatedAt: 101 } },
    strokes: [stroke('right', 101)] });
  const merged = plain(workspace.merge(left, right));
  assert.equal(merged.height, 3000);
  assert.deepEqual(Object.keys(merged.positions), ['a', 'b']);
  assert.deepEqual(merged.positions.b, right.positions.b);
  assert.deepEqual(merged.strokes.map(item => item.id), ['left', 'right']);
  assert.deepEqual(merged, plain(workspace.merge(right, left)));
  assert.deepEqual(merged, plain(workspace.merge(merged, merged)));
});

test('equal-clock conflicts resolve deterministically; tombstones win stroke ties', () => {
  const a = board({ positions: { clip: { x: 10, y: 10, width: 420, updatedAt: 100 } },
    strokes: [stroke('same', 100, { color: 'blue' })] });
  const b = board({ positions: { clip: { x: 20, y: 10, width: 420, updatedAt: 100 } },
    strokes: [stroke('same', 100, { color: 'red' })] });
  const ab = plain(workspace.merge(a, b));
  assert.deepEqual(ab, plain(workspace.merge(b, a)));
  assert.equal(ab.positions.clip.x, 20);
  assert.equal(ab.strokes[0].color, 'red');
  assert.deepEqual(ids(workspace.merge(ab, board({ deleted: { same: 100 } }))), []);
});

test('addStroke edits preserve creation, and removeStrokes tombstones prevent stale resurrection', () => {
  const added = workspace.addStroke(empty(), {
    id: 'ink', color: 'blue', width: 2, points: [[0, 0, .2]]
  }, 100);
  const edited = workspace.addStroke(added, {
    id: 'ink', color: 'red', width: 4, points: [[100, 5000, .8]]
  }, 100);
  assert.equal(edited.strokes[0].createdAt, 100);
  assert.equal(edited.strokes[0].updatedAt, 101);
  const erased = workspace.removeStrokes(edited, ['ink', 'ink'], 100);
  assert.deepEqual(ids(erased), []);
  assert.equal(erased.deleted.ink, 102);
  assert.deepEqual(ids(workspace.merge(erased, edited)), []);
  const restored = workspace.addStroke(erased, {
    id: 'ink', color: 'black', width: 1, points: [[5, 5, .5]]
  }, 100);
  assert.equal(restored.strokes[0].updatedAt, 103);
  assert.equal(restored.deleted.ink, 102);
  assert.equal(added.strokes[0].color, 'blue');
});

test('stroke constraints, future clocks, and prototype IDs reject unsafe data', () => {
  const cap = NOW + 366 * 24 * 60 * 60 * 1000;
  const bad = [
    stroke('too-many', 100, { points: Array.from({ length: 8193 }, () => [0, 0, .5]) }),
    stroke('negative', 100, { points: [[0, -1, .5]] }),
    stroke('too-far', 100, { points: [[0, workspace.MAX_HEIGHT + 1, .5]] }),
    stroke('bad-pressure', 100, { points: [[0, 0, 1.1]] }),
    stroke('bad-width', 100, { width: 12.1 }),
    stroke('bad-style', 100, { style: 'clean' }),
    stroke('future', cap + 1), stroke('__proto__'), stroke('constructor')
  ];
  const deleted = JSON.parse('{"__proto__":999,"constructor":999,"prototype":999,"safe":101}');
  const result = workspace.normalize(board({ strokes: [...bad, stroke('good')], deleted }));
  assert.deepEqual(ids(result), ['good']);
  assert.deepEqual(plain(result.deleted), { safe: 101 });
  assert.throws(() => workspace.addStroke(empty(), { id: 'x', color: 'black', width: 1,
    points: [[0, -1, .5]] }, 100), { name: 'TypeError' });
  assert.throws(() => workspace.place(empty(), '__proto__', { x: 0, y: 0 }, 100), { name: 'TypeError' });
  assert.throws(() => workspace.removeStrokes(empty(), ['constructor'], 100), { name: 'TypeError' });
  assert.throws(() => workspace.removeStrokes(empty(), Array(1), 100), { name: 'TypeError' });
  assert.throws(() => workspace.place(empty(), 'x', { x: 0, y: 0 }, cap + 1), { name: 'RangeError' });
  assert.throws(() => workspace.addStroke(board({ strokes: [stroke('ceiling', cap)] }),
    { id: 'ceiling', color: 'black', width: 1, points: [[0, 0, .5]] }, cap), { name: 'RangeError' });
});

test('optional marker, line, and note anchor metadata normalize without losing valid ink', () => {
  const anchored = stroke('attached', 100, {
    nib: 'marker', shape: 'line', anchor: { clipId: 'clip', x: 50, y: 1500, width: 420 }
  });
  const invalidAnchors = [
    { clipId: 'clip', x: Infinity, y: 0, width: 420 },
    { clipId: 'clip', x: 900, y: 0, width: 420 },
    { clipId: 'clip', x: 0, y: -1, width: 420 },
    { clipId: 'clip', x: 0, y: 0, width: 0 },
    { clipId: '__proto__', x: 0, y: 0, width: 420 },
    { clipId: 'clip', x: 0, y: 0, width: 420, note: 'ignored' }
  ];
  const normalized = plain(workspace.normalize(board({ strokes: [anchored,
    ...invalidAnchors.slice(0, 5).map((base, index) =>
      stroke(`bad-${index}`, 100, { anchor: base, nib: 'unknown', shape: 'curve' }))] })));
  assert.deepEqual(normalized.strokes[0], anchored);
  for (const item of normalized.strokes.slice(1)) {
    assert.equal('anchor' in item, false);
    assert.equal('nib' in item, false);
    assert.equal('shape' in item, false);
  }
  assert.deepEqual(plain(workspace.normalize(board({ strokes: [
    stroke('extra', 100, { anchor: invalidAnchors[5] })] })).strokes[0].anchor),
  { clipId: 'clip', x: 0, y: 0, width: 420 });
  assert.throws(() => workspace.addStroke(empty(), {
    id: 'bad', color: 'black', width: 2, points: [[50, 1500, .5]],
    anchor: invalidAnchors[0]
  }, 100), { name: 'TypeError' });
});

test('anchored display geometry follows note move and uniform resize without mutation', () => {
  const base = { clipId: 'clip', x: 50, y: 1500, width: 400 };
  const original = stroke('attached', 100, { width: 4,
    points: [[60, 1510, .2], [150, 1550, .8]], nib: 'marker', shape: 'line', anchor: base });
  const before = JSON.stringify(original);
  const moved = plain(workspace.displayStroke(original,
    { clip: { x: 200, y: 3500, width: 600, updatedAt: 101 } }));
  assert.deepEqual(moved.points, [[215, 3515, .2], [350, 3575, .8]]);
  assert.equal(moved.width, 6);
  assert.equal(moved.nib, 'marker');
  assert.equal(moved.shape, 'line');
  assert.deepEqual(moved.anchor, base);
  assert.deepEqual(plain(workspace.displayStroke(original, {})), original);
  assert.equal(JSON.stringify(original), before);
  moved.points[0][0] = 999;
  moved.anchor.x = 999;
  assert.equal(original.points[0][0], 60);
  assert.equal(original.anchor.x, 50);
});

test('attached marker and line metadata survives merge in both directions, erase, and undo', () => {
  const raw = { id: 'ink', color: 'teal', width: 3,
    points: [[40, 1800, .5], [80, 1830, .8]], nib: 'marker', shape: 'line',
    anchor: { clipId: 'clip', x: 20, y: 1790, width: 420 } };
  const added = workspace.addStroke(empty(), raw, 100);
  assert.equal(added.strokes[0].nib, 'marker');
  const edited = workspace.addStroke(added, {
    id: 'ink', color: 'blue', width: 4, points: raw.points
  }, 101);
  assert.equal(edited.strokes[0].nib, 'marker');
  assert.equal(edited.strokes[0].shape, 'line');
  assert.deepEqual(plain(edited.strokes[0].anchor), raw.anchor);
  const other = board({ positions: { clip: { x: 100, y: 1900, width: 420, updatedAt: 102 } } });
  assert.deepEqual(plain(workspace.merge(edited, other)), plain(workspace.merge(other, edited)));
  const erased = workspace.removeStrokes(edited, ['ink'], 102);
  assert.deepEqual(ids(workspace.merge(erased, edited)), []);
  const restored = workspace.addStroke(erased, raw, 102);
  assert.equal(restored.strokes[0].nib, 'marker');
  assert.equal(restored.strokes[0].shape, 'line');
  assert.deepEqual(plain(restored.strokes[0].anchor), raw.anchor);
  assert.equal(restored.strokes[0].updatedAt, 103);
});
