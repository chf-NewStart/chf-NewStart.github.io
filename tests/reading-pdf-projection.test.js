const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, Number, Math, Object, Array, Set });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-pdf-projection.js'), 'utf8'), context,
  { filename: 'reading-pdf-projection.js' });
const projection = context.window.PhloemPdfProjection;
const plain = value => JSON.parse(JSON.stringify(value));

test('plain-script projection API is frozen and independent of browser globals', () => {
  assert.deepEqual(Object.keys(projection), ['build']);
  assert.equal(Object.isFrozen(projection), true);
});

test('no folds preserve identity coordinates and include the final page edge', () => {
  const map = projection.build({ width: 600, height: 1000, bands: [], seamHeight: 44 });
  assert.equal(map.displayHeight, 1000);
  assert.deepEqual(plain(map.visibleIntervals), [{ start: 0, end: 1000 }]);
  assert.deepEqual(plain(map.displayIntervals), [{ start: 0, end: 1000 }]);
  assert.deepEqual(plain(map.sourceToDisplay({ x: 32, y: 0 })), { kind: 'visible', point: { x: 32, y: 0 } });
  assert.deepEqual(plain(map.displayToSource({ x: 600, y: 1000 })), { kind: 'visible', point: { x: 600, y: 1000 } });
  assert.deepEqual(plain(map.sourceToDisplay({ x: 1, y: 1001 })), { kind: 'outside' });
});

test('one fold closes the gap to a 44px seam and maps source points below it upward', () => {
  const map = projection.build({ width: 612, height: 1000, bands: [{ y0: .2, y1: .4, ids: ['f1'] }], seamHeight: 44 });
  assert.equal(map.displayHeight, 844);
  assert.deepEqual(plain(map.sourceToDisplay({ x: 10, y: 500 })), { kind: 'visible', point: { x: 10, y: 344 } });
  assert.deepEqual(plain(map.displayToSource({ x: 10, y: 344 })), { kind: 'visible', point: { x: 10, y: 500 } });
  assert.deepEqual(plain(map.seamIntervals), [{ start: 200, end: 244, foldIds: ['f1'] }]);
});

test('fold start is hidden, fold end is visible, and seam start is owned by the seam', () => {
  const map = projection.build({ width: 500, height: 1000, bands: [{ y0: .2, y1: .4, id: 'f' }], seamHeight: 44 });
  assert.deepEqual(plain(map.sourceToDisplay({ x: 0, y: 200 })), { kind: 'hidden', foldIds: ['f'] });
  assert.deepEqual(plain(map.sourceToDisplay({ x: 0, y: 400 })), { kind: 'visible', point: { x: 0, y: 244 } });
  assert.deepEqual(plain(map.displayToSource({ x: 0, y: 200 })), { kind: 'seam', foldIds: ['f'] });
  assert.deepEqual(plain(map.displayToSource({ x: 0, y: 244 })), { kind: 'visible', point: { x: 0, y: 400 } });
  assert.deepEqual(plain(map.displayToSource({ x: 500, y: map.displayHeight })), { kind: 'visible', point: { x: 500, y: 1000 } });
});

test('overlapping/touching bands are unioned and multiple seams shift later intervals cumulatively', () => {
  const map = projection.build({ width: 400, height: 1000, bands: [
    { y0: .1, y1: .3, ids: ['a'] }, { y0: .28, y1: .4, ids: ['b'] },
    { y0: .6, y1: .8, ids: ['c'] }
  ], seamHeight: 44 });
  assert.deepEqual(plain(map.seamIntervals), [
    { start: 100, end: 144, foldIds: ['a', 'b'] },
    { start: 344, end: 388, foldIds: ['c'] }
  ]);
  assert.deepEqual(plain(map.sourceToDisplay({ x: 100, y: 900 })), { kind: 'visible', point: { x: 100, y: 488 } });
  assert.equal(map.displayHeight, 588);
  assert.equal(map.visibleIntervals.length, map.displayIntervals.length);
});

test('bands too small at the current zoom are suppressed without changing source geometry', () => {
  const map = projection.build({ width: 300, height: 100, bands: [{ y0: .2, y1: .6, ids: ['zoomed'] }], seamHeight: 44 });
  assert.equal(map.displayHeight, 100);
  assert.deepEqual(plain(map.seamIntervals), []);
  assert.deepEqual(plain(map.sourceToDisplay({ x: 12, y: 40 })), { kind: 'visible', point: { x: 12, y: 40 } });
});

test('overlapping individually-small bands are measured after their visible union', () => {
  const map = projection.build({ width: 300, height: 100, bands: [
    { y0: .2, y1: .48, ids: ['first'] }, { y0: .44, y1: .8, ids: ['second'] }
  ], seamHeight: 44 });
  assert.equal(map.displayHeight, 84);
  assert.deepEqual(plain(map.seamIntervals), [{ start: 20, end: 64, foldIds: ['first', 'second'] }]);
});

test('visible source points round-trip through display space around each fold', () => {
  const map = projection.build({ width: 612, height: 1000, bands: [
    { y0: .1, y1: .22, ids: ['one'] }, { y0: .55, y1: .73, ids: ['two'] }
  ], seamHeight: 44 });
  [0, 50, 220, 300, 549, 730, 800, 1000].forEach(y => {
    const forward = map.sourceToDisplay({ x: 123, y });
    if (forward.kind === 'visible') {
      const backward = map.displayToSource(forward.point);
      assert.equal(backward.kind, 'visible');
      assert.equal(backward.point.x, 123);
      assert.ok(Math.abs(backward.point.y - y) < 1e-9);
    }
  });
});

test('projectRect clips a crossing rectangle into visible fragments without stretching', () => {
  const map = projection.build({ width: 500, height: 1000, bands: [{ y0: .2, y1: .4, ids: ['cut'] }], seamHeight: 44 });
  assert.deepEqual(plain(map.projectRect({ x: 20, y: 100, width: 100, height: 700 })), [
    { x: 20, y: 100, width: 100, height: 100, sourceY: 100, sourceHeight: 100 },
    { x: 20, y: 244, width: 100, height: 400, sourceY: 400, sourceHeight: 400 }
  ]);
  assert.deepEqual(plain(map.projectRect({ x: 0, y: 210, width: 10, height: 90 })), []);
  assert.deepEqual(plain(map.projectRect({ x: -20, y: 390, width: 30, height: 20 })), [
    { x: 0, y: 244, width: 10, height: 10, sourceY: 400, sourceHeight: 10 }
  ]);
});

test('projectPolyline interpolates crossings and never joins paths across hidden source content', () => {
  const map = projection.build({ width: 500, height: 1000, bands: [{ y0: .2, y1: .4, ids: ['cut'] }], seamHeight: 44 });
  const paths = plain(map.projectPolyline([{ x: 50, y: 100 }, { x: 150, y: 500 }]));
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0], [{ x: 50, y: 100 }, { x: 75, y: 200 }]);
  assert.deepEqual(paths[1], [{ x: 125, y: 244 }, { x: 150, y: 344 }]);
});

test('a line that jumps completely across the folded band still splits at both intersections', () => {
  const map = projection.build({ width: 500, height: 1000, bands: [{ y0: .3, y1: .5, ids: ['jump'] }], seamHeight: 44 });
  const paths = plain(map.projectPolyline([{ x: 10, y: 100 }, { x: 90, y: 900 }]));
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0][1], { x: 30, y: 300 });
  assert.deepEqual(paths[1][0], { x: 50, y: 344 });
  assert.deepEqual(paths[1][1], { x: 90, y: 744 });
});

test('invalid dimensions are rejected and invalid bands are ignored independently', () => {
  assert.throws(() => projection.build({ width: 0, height: 100, bands: [] }), { name: 'TypeError' });
  const map = projection.build({ width: 500, height: 1000, bands: [null, { y0: .7, y1: .6 }, { y0: -.2, y1: .1 }, { y0: .2, y1: 1.1 }], seamHeight: 44 });
  assert.equal(map.displayHeight, 1000);
  assert.deepEqual(plain(map.seamIntervals), []);
});
