/* Display-only ink shaping for Workspace handwriting: the stabilizer smooths sensor
   jitter without moving the stroke's ends, and the wider pressure response makes firm
   strokes broader than light ones. Strokes without these options draw exactly as before. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'reading-ink.js'), 'utf8'), { window, document: {}, Set, Math });
const { pathData } = window.PhloemInk;

function jittery(pressure = () => .4) {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - .5;
  const points = [];
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    points.push([.1 + .8 * t + rnd() * .0016, .5 + .05 * Math.sin(t * 12) + rnd() * .0016, pressure(t)]);
  }
  return points;
}
// Mean absolute turn per unit length of the drawn outline's first edge: jitter raises it.
function roughness(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number), pts = [];
  for (const part of d.split('M ').slice(1)) { const n = part.match(/-?\d+(\.\d+)?/g).map(Number); pts.push([n[0], n[1]]); }
  let turn = 0, length = 0;
  for (let i = 2; i < pts.length; i++) {
    const a = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
    const b = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    let delta = Math.abs(b - a); if (delta > Math.PI) delta = 2 * Math.PI - delta;
    turn += delta; length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return nums.length && turn / Math.max(1, length);
}

test('the stabilizer smooths jitter and keeps the ends in place', () => {
  const points = jittery();
  const plain = pathData({ width: 2.4, style: 'natural', points }, .5);
  const steady = pathData({ width: 2.4, style: 'natural', points, stabilize: 2.2 }, .5);
  assert(roughness(steady) < roughness(plain) * .7, 'stabilized ink turns less: ' + roughness(plain) + ' -> ' + roughness(steady));
  const first = d => d.match(/-?\d+(\.\d+)?/g).slice(0, 2).map(Number);
  assert(Math.hypot(...first(steady).map((v, i) => v - first(plain)[i])) < 1, 'the stroke still starts where the Pencil touched down');
});

test('the wider pressure response separates light and firm strokes', () => {
  // A single sample draws a dot whose arc radius is the third number of its path.
  const radius = (pressure, options) => Number(pathData({ width: 2.4, style: 'natural', points: [[.5, .5, pressure]], ...options }, .5).match(/-?\d+(\.\d+)?/g)[2]);
  const oldSpread = radius(.9, {}) / radius(.1, {}), newSpread = radius(.9, { response: [.55, 1] }) / radius(.1, { response: [.55, 1] });
  assert(newSpread > oldSpread * 1.2, 'firm vs light width ratio grows: ' + oldSpread.toFixed(2) + ' -> ' + newSpread.toFixed(2));
});

test('strokes without the options draw exactly as before', () => {
  const points = jittery(t => .3 + .4 * t);
  const a = pathData({ width: 2.4, style: 'natural', points }, .5);
  const b = pathData({ width: 2.4, style: 'natural', points, stabilize: 0 }, .5);
  assert.equal(a, b);
});
