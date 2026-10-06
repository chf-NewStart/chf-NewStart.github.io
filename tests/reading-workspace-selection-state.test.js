const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-workspace.js'), 'utf8'), context);
const workspace = context.window.PhloemWorkspaceState;
const plain = value => JSON.parse(JSON.stringify(value));
const board = (extra = {}) => ({ version: 3, width: 1000, height: 2000, positions: {}, strokes: [], deleted: {}, ...extra });
const ink = (id, points, extra = {}) => ({ id, color: 'black', width: 1, points,
  style: 'natural', createdAt: 50, updatedAt: 100, ...extra });
const rect = (x, y, width, height) => [[x, y], [x + width, y],
  [x + width, y + height], [x, y + height]];
const card = (id, x, y, height = 200, width = 280) => ({ id, x, y, width, height });
const selection = (clipIds = [], strokeIds = []) => ({ clipIds, strokeIds });
const at = (box, updatedAt = 100) => ({ x: box.x, y: box.y, width: box.width, updatedAt });

test('lasso selects measured card centers and returns canonical stable IDs and bounds', () => {
  const cards = [card('z', 600, 100), card('a', 20, 100), card('overlap', 250, 20)];
  const state = board({ positions: { unavailable: { x: 30, y: 100, width: 280, updatedAt: 100 } } });
  const before = JSON.stringify({ state, cards });
  const picked = plain(workspace.selectGroup(state, rect(0, 90, 890, 220), cards));
  assert.deepEqual(picked, { clipIds: ['a', 'overlap', 'z'], strokeIds: [],
    bounds: { x: 20, y: 20, width: 860, height: 280 } });
  // A small loop on a blank corner of a note selects that note (v189; it used to select nothing).
  assert.deepEqual(plain(workspace.selectGroup(state, rect(0, 100, 60, 50), cards)),
    { clipIds: ['a'], strokeIds: [], bounds: { x: 20, y: 100, width: 280, height: 200 } });
  // A loop on blank paper still selects nothing.
  assert.deepEqual(plain(workspace.selectGroup(state, rect(400, 600, 60, 50), cards)),
    { clipIds: [], strokeIds: [], bounds: null });
  assert.equal(JSON.stringify({ state, cards }), before);
});

test('lasso takes a note when it covers about a third of it, not when it only grazes an edge', () => {
  const cards = [card('n', 100, 100, 200, 300)];
  const state = board();
  // Left half of the note, centre outside the loop.
  assert.deepEqual(plain(workspace.selectGroup(state, rect(80, 80, 160, 240), cards)).clipIds, ['n']);
  // A thin sliver along the left edge, with ink elsewhere so the blank-note fallback is off.
  const inked = board({ strokes: [ink('free', [[60, 150, .5]])] });
  assert.deepEqual(plain(workspace.selectGroup(inked, rect(40, 80, 80, 240), cards)).clipIds, []);
});

test('lasso catches single points, boundary contact, and segments crossing with both endpoints outside', () => {
  const state = board({ strokes: [
    ink('point', [[150, 150, .6]]),
    ink('crossing', [[0, 150, .2], [300, 150, .8]]),
    ink('boundary', [[100, 100, 1]]),
    ink('thick-edge', [[99, 120, .8], [99, 180, .8]], { width: 3, nib: 'marker' }),
    ink('outside', [[80, 120, 1], [80, 180, 1]])
  ] });
  const picked = plain(workspace.selectGroup(state, rect(100, 100, 100, 100), []));
  assert.deepEqual(picked.strokeIds, ['boundary', 'crossing', 'point', 'thick-edge']);
  assert.deepEqual(picked.bounds, { x: 0, y: 100, width: 300, height: 80 });
});

test('lasso edge hits account for the renderer’s page units and broad marker radius', () => {
  const natural = board({ strokes: [ink('natural', [[90, 100, 1], [90, 200, 1]],
    { width: 8, shape: 'line' })] });
  assert.deepEqual(plain(workspace.selectGroup(natural, rect(97, 145, 2, 10), [])).strokeIds, ['natural']);
  assert.deepEqual(plain(workspace.selectGroup(natural, rect(99, 145, 2, 10), [])).strokeIds, []);
  const marker = board({ strokes: [ink('marker', [[80, 100, 1], [80, 200, 1]],
    { width: 8, nib: 'marker', shape: 'line' })] });
  assert.deepEqual(plain(workspace.selectGroup(marker, rect(91, 145, 2, 10), [])).strokeIds, ['marker']);
  assert.deepEqual(plain(workspace.selectGroup(marker, rect(94, 145, 2, 10), [])).strokeIds, []);
});

test('concave polygon excludes the empty notch while including both arms and crossing ink', () => {
  const polygon = [[0, 0], [300, 0], [300, 100], [100, 100], [100, 300], [0, 300]];
  const state = board({ strokes: [ink('top', [[250, 50, .5]]), ink('left', [[50, 250, .5]]),
    ink('notch', [[200, 200, .5]]), ink('cross', [[50, 200, .5], [200, 200, .5]])] });
  assert.deepEqual(plain(workspace.selectGroup(state, polygon, [])).strokeIds, ['cross', 'left', 'top']);
});

test('invalid and degenerate polygons safely produce an empty selection', () => {
  const state = board({ strokes: [ink('point', [[10, 10, .5]])] });
  for (const polygon of [null, [], [[0, 0]], [[0, 0], [10, 10], [20, 20]],
    [[0, 0], [0, 0], [0, 0]], [[0, 0], [10, NaN], [20, 0]],
    [[-1, 0], [10, 20], [20, 0]], [[0, 0], [1001, 20], [20, 0]],
    [[0, 0], [10, workspace.MAX_HEIGHT + 1], [20, 0]], Array(3)]) {
    assert.deepEqual(plain(workspace.selectGroup(state, polygon, [card('a', 0, 0)])),
      { clipIds: [], strokeIds: [], bounds: null });
  }
});

test('normalization excludes malformed or tombstoned strokes and malformed card neighbors', () => {
  const state = board({ strokes: [ink('erased', [[10, 10, .5]]),
    ink('live', [[12, 10, .5]]), ink('live', [[900, 900, .5]], { updatedAt: 99 }),
    ink('bad', [[10, NaN, .5]])], deleted: { erased: 100 } });
  const picked = plain(workspace.selectGroup(state, rect(0, 0, 50, 50),
    [null, {}, card('constructor', 0, 0), card('bad-width', 0, 0, 20, NaN)]));
  assert.deepEqual(picked, { clipIds: [], strokeIds: ['live'], bounds: { x: 12, y: 10, width: 0, height: 0 } });
});

test('selecting displayed anchored ink promotes its owner and all of that owner’s writing', () => {
  const owner = card('note', 400, 500, 300, 420);
  const anchor = { clipId: 'note', x: 0, y: 0, width: 280 };
  const state = board({ positions: { note: at(owner) }, strokes: [
    ink('near', [[10, 10, .4]], { anchor }),
    ink('far', [[200, 250, .8]], { anchor, nib: 'marker', shape: 'line' }),
    ink('unrelated', [[200, 200, .4]])
  ] });
  const picked = plain(workspace.selectGroup(state, rect(410, 510, 10, 10), [owner]));
  assert.deepEqual(picked, { clipIds: ['note'], strokeIds: ['far', 'near'],
    bounds: { x: 400, y: 500, width: 420, height: 375 } });
  const byCard = plain(workspace.selectGroup(state, rect(600, 640, 20, 20), [owner]));
  assert.deepEqual(byCard, picked);
  assert.deepEqual(plain(workspace.selectGroup(state, rect(0, 0, 20, 20), [owner])).strokeIds, []);
});

test('a card with no saved position supplies its anchored display transform', () => {
  const owner = card('note', 300, 500);
  const state = board({ strokes: [ink('attached', [[10, 10, .5]],
    { anchor: { clipId: 'note', x: 0, y: 0, width: 280 } })] });
  const picked = workspace.selectGroup(state, rect(305, 505, 10, 10), [owner]);
  assert.deepEqual(plain(picked.clipIds), ['note']);
  const moved = workspace.moveGroup(state, selection([], ['attached']), { x: 20, y: 30 }, [owner], 200);
  assert.deepEqual(plain(moved.positions.note), { x: 320, y: 530, width: 280, updatedAt: 200 });
  assert.deepEqual(plain(moved.strokes[0]), state.strokes[0]);
});

test('measured card placement controls selection and movement when display constrains its saved box', () => {
  const owner = card('note', 100, 1920, 180);
  const anchor = { clipId: 'note', x: 100, y: 2000, width: 280 };
  const state = board({ positions: { note: { ...at(owner), y: 2000 } },
    strokes: [ink('attached', [[120, 2010, .5]], { anchor })] });
  const picked = plain(workspace.selectGroup(state, rect(115, 1925, 10, 10), [owner]));
  assert.deepEqual(picked.clipIds, ['note']);
  assert.deepEqual(picked.strokeIds, ['attached']);
  const moved = plain(workspace.moveGroup(state, picked, { x: 10, y: 20 }, [owner], 200));
  assert.deepEqual(moved.positions.note, { x: 110, y: 1940, width: 280, updatedAt: 200 });
  assert.deepEqual(plain(workspace.displayStroke(moved.strokes[0], moved.positions)).points, [[130, 1950, .5]]);
  assert.equal(moved.height, 3000);
  assert.deepEqual(moved.strokes[0], state.strokes[0]);
});

test('an unavailable anchor owner uses raw fallback even when a stale position remains', () => {
  const state = board({ positions: { gone: { x: 500, y: 500, width: 280, updatedAt: 100 } },
    strokes: [ink('orphan', [[10, 10, .7], [20, 20, .9]],
      { anchor: { clipId: 'gone', x: 0, y: 0, width: 280 }, nib: 'marker', shape: 'line' })] });
  const picked = plain(workspace.selectGroup(state, rect(0, 0, 30, 30), []));
  assert.deepEqual(picked.clipIds, []);
  assert.deepEqual(picked.strokeIds, ['orphan']);
  const moved = plain(workspace.moveGroup(state, picked, { x: 40, y: 50 }, [], 200));
  assert.deepEqual(moved.strokes[0].points, [[50, 60, .7], [60, 70, .9]]);
  assert.equal('anchor' in moved.strokes[0], false);
  assert.equal(moved.strokes[0].nib, 'marker');
  assert.equal(moved.strokes[0].shape, 'line');
  assert.equal(moved.strokes[0].createdAt, 50);
  assert.deepEqual(moved.positions, state.positions);
  assert.equal(state.strokes[0].anchor.clipId, 'gone');
});

test('group movement translates notes and standalone ink once and leaves anchored raw ink untouched', () => {
  const a = card('a', 40, 100), b = card('b', 500, 500, 250);
  const anchor = { clipId: 'a', x: 40, y: 100, width: 280 };
  const state = board({ positions: { a: at(a, 500), b: at(b), other: at(card('other', 0, 0)) },
    strokes: [ink('attached', [[60, 120, .8]], { anchor }),
      ink('sibling', [[70, 200, .4]], { anchor }),
      ink('free', [[380, 350, .2], [410, 390, .9]],
        { color: 'purple', width: 4, nib: 'marker', shape: 'line', updatedAt: 700 }),
      ink('untouched', [[900, 900, .5]])], deleted: { erased: 900, free: 600 } });
  const before = JSON.stringify(state);
  const moved = plain(workspace.moveGroup(state, selection(['b'], ['free', 'attached']),
    { x: 20, y: 30 }, [a, b], 200));
  assert.deepEqual(moved.positions.a, { x: 60, y: 130, width: 280, updatedAt: 501 });
  assert.deepEqual(moved.positions.b, { x: 520, y: 530, width: 280, updatedAt: 200 });
  assert.deepEqual(moved.positions.other, state.positions.other);
  assert.deepEqual(moved.strokes.find(s => s.id === 'attached'), state.strokes[0]);
  assert.deepEqual(moved.strokes.find(s => s.id === 'sibling'), state.strokes[1]);
  assert.deepEqual(moved.strokes.find(s => s.id === 'free'), {
    ...state.strokes[2], points: [[400, 380, .2], [430, 420, .9]], updatedAt: 701
  });
  assert.deepEqual(moved.strokes.find(s => s.id === 'untouched'), state.strokes[3]);
  assert.deepEqual(moved.deleted, state.deleted);
  assert.equal(JSON.stringify(state), before);
  const shown = plain(workspace.displayStroke(moved.strokes.find(s => s.id === 'attached'), moved.positions));
  assert.deepEqual(shown.points, [[80, 150, .8]]);
});

test('one shared delta clamps all members at global boundaries without changing their separation', () => {
  const owner = card('a', 40, 100);
  const state = board({ positions: { a: at(owner) }, strokes: [ink('free', [[950, 50, .3], [970, 70, .5]])] });
  const moved = plain(workspace.moveGroup(state, selection(['a'], ['free']),
    { x: 2_000_000, y: -300 }, [owner], 200));
  assert.deepEqual(moved.positions.a, { x: workspace.MAX_WIDTH - 930, y: 50, width: 280, updatedAt: 200 });
  assert.deepEqual(moved.strokes[0].points, [[workspace.MAX_WIDTH - 20, 0, .3], [workspace.MAX_WIDTH, 20, .5]]);
  assert.equal(moved.width, workspace.MAX_WIDTH);
  const back = plain(workspace.moveGroup(state, selection(['a'], ['free']),
    { x: -500, y: 0 }, [owner], 200));
  assert.equal(back.positions.a.x, 0);
  assert.equal(back.strokes[0].points[0][0], 910);
});

test('fractional card coordinates tolerate floating-point residue at the right paper edge', () => {
  for (const [x, width] of [[105.94665881788914, 776], [222.25452060483013, 562],
    [40.22741814458258, 884.8466401983784]]) {
    const owner = card('a', x, 100, 200, width);
    const state = board({ positions: { a: at(owner) }, strokes: [ink('attached', [[x + 5, 120, .5]],
      { anchor: { clipId: 'a', x, y: 100, width } })] });
    const moved = plain(workspace.moveGroup(state, selection(['a']), { x: 2_000_000, y: 0 }, [owner], 200));
    assert.ok(Math.abs(moved.positions.a.x - (workspace.MAX_WIDTH - width)) < 1e-7);
    assert.equal(moved.positions.a.width, width);
    const shown = workspace.displayStroke(moved.strokes[0], moved.positions);
    assert.ok(Math.abs(shown.points[0][0] - (workspace.MAX_WIDTH - width + 5)) < 1e-7);
  }
});

test('attached ink protruding beyond its owner participates in shared movement bounds', () => {
  const owner = card('a', 100, 100);
  const state = board({ positions: { a: at(owner) }, strokes: [ink('attached', [[950, 80, .4]],
    { anchor: { clipId: 'a', x: 100, y: 100, width: 280 } })] });
  const moved = plain(workspace.moveGroup(state, selection(['a']), { x: 2_000_000, y: -500 }, [owner], 200));
  assert.equal(moved.positions.a.x, workspace.MAX_WIDTH - 850);
  assert.equal(moved.positions.a.y, 20);
  assert.deepEqual(plain(workspace.displayStroke(moved.strokes[0], moved.positions)).points, [[workspace.MAX_WIDTH, 0, .4]]);
});

test('movement grows paper in 1000-unit steps and clamps the entire group at MAX_HEIGHT', () => {
  const owner = card('a', 50, 1800, 180);
  const state = board({ positions: { a: at(owner) }, strokes: [ink('free', [[400, 1990, .5]])] });
  const moved = plain(workspace.moveGroup(state, selection(['a'], ['free']),
    { x: 0, y: 410 }, [owner], 200));
  assert.equal(moved.height, 3000);
  assert.equal(moved.positions.a.y, 2210);
  assert.equal(moved.strokes[0].points[0][1], 2400);
  assert.equal(state.height, 2000);
  const capped = plain(workspace.moveGroup(state, selection(['a'], ['free']),
    { x: 0, y: 2_000_000 }, [owner], 200));
  assert.equal(capped.height, workspace.MAX_HEIGHT);
  assert.equal(capped.strokes[0].points[0][1], workspace.MAX_HEIGHT);
  assert.equal(capped.positions.a.y, workspace.MAX_HEIGHT - 190);
});

test('empty or fully clamped moves return an independent normalized state without advancing clocks', () => {
  const state = board({ width: workspace.MAX_WIDTH, strokes: [ink('edge', [[workspace.MAX_WIDTH, 0, .5]])] });
  for (const picked of [selection(), selection([], ['edge'])]) {
    const result = workspace.moveGroup(state, picked, { x: 1, y: -1 }, [], 200);
    assert.notEqual(result, state);
    assert.deepEqual(plain(result), state);
  }
});

test('selection bounds are ignored and duplicate member IDs move only once', () => {
  const state = board({ strokes: [ink('free', [[100, 200, .5]])] });
  const moved = plain(workspace.moveGroup(state,
    { ...selection([], ['free', 'free']), bounds: { x: 1000, y: 0, width: 0, height: 0 } },
    { x: 20, y: 30 }, [], 100));
  assert.deepEqual(moved.strokes[0].points, [[120, 230, .5]]);
  assert.equal(moved.strokes[0].updatedAt, 101);
});

test('invalid delta, invalid or stale members, invalid timestamps, and exhausted clocks fail atomically', () => {
  const cap = NOW + 366 * 24 * 60 * 60 * 1000;
  const owner = card('a', 40, 100);
  const state = board({ positions: { a: at(owner) }, strokes: [ink('free', [[400, 200, .5]]),
    ink('exhausted', [[500, 200, .5]], { updatedAt: cap })], deleted: { erased: 200 } });
  const before = JSON.stringify(state);
  const valid = selection(['a'], ['free']);
  const runs = [
    () => workspace.moveGroup(state, valid, { x: NaN, y: 0 }, [owner], 200),
    () => workspace.moveGroup(state, valid, { x: 0, y: Infinity }, [owner], 200),
    () => workspace.moveGroup(state, valid, { x: '5', y: 0 }, [owner], 200),
    () => workspace.moveGroup(state, selection(['a'], ['free', 'missing']), { x: 5, y: 5 }, [owner], 200),
    () => workspace.moveGroup(state, selection(['a', 'missing'], ['free']), { x: 5, y: 5 }, [owner], 200),
    () => workspace.moveGroup(state, selection([], ['erased']), { x: 5, y: 5 }, [owner], 200),
    () => workspace.moveGroup(state, selection([], Array(1)), { x: 5, y: 5 }, [owner], 200),
    () => workspace.moveGroup(state, selection(['constructor']), { x: 5, y: 5 }, [owner], 200),
    () => workspace.moveGroup(state, valid, { x: 5, y: 5 }, [owner], cap + 1),
    () => workspace.moveGroup(state, selection(['a'], ['free', 'exhausted']), { x: 5, y: 5 }, [owner], 200)
  ];
  for (const run of runs) {
    assert.throws(run);
    assert.equal(JSON.stringify(state), before);
  }
});

test('group APIs fail closed on unknown versions even with empty or invalid selections', () => {
  const state = board({ version: 99 });
  for (const run of [() => workspace.selectGroup(state, [], []),
    () => workspace.moveGroup(state, selection(), { x: 0, y: 0 }, [], 100)])
    assert.throws(run, error => error.code === 'UNSUPPORTED_VERSION' && error.version === 99);
});
