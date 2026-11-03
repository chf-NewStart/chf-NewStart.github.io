const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../focus/daily.js');

test('today’s warm-up changes at local midnight and cycles through all six', () => {
  const late = new Date(2026, 10, 3, 23, 59), early = new Date(2026, 10, 4, 0, 1);
  assert.notEqual(D.challengeFor(late).id, D.challengeFor(early).id);
  assert.equal(D.challengeFor(new Date(2026, 10, 3, 0, 0)).id, D.challengeFor(late).id);
  const seen = new Set(); for (let d = 0; d < 6; d++) seen.add(D.challengeFor(new Date(2026, 10, 3 + d, 12)).id);
  assert.equal(seen.size, D.CHALLENGES.length);
  assert.equal(D.dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('streak grows on consecutive days, ignores replays and practice, and lapses after a missed day', () => {
  const day = n => new Date(2026, 10, 3 + n, 9);
  const today = n => D.challengeFor(day(n)).id;
  let s = D.emptyState();
  s = D.record(s, today(0), 60, day(0)).state; assert.equal(D.streakOn(s, day(0)), 1);
  s = D.record(s, today(0), 70, day(0)).state; assert.equal(s.streak.count, 1, 'a replay the same day doesn’t count twice');
  const other = D.CHALLENGES.find(c => c.id !== today(1)).id;
  s = D.record(s, other, 50, day(1)).state; assert.equal(s.streak.count, 1, 'practising another task isn’t today’s');
  assert.equal(D.streakOn(s, day(1)), 1, 'still alive the next day');
  s = D.record(s, today(1), 40, day(1)).state; assert.equal(D.streakOn(s, day(1)), 2);
  assert.equal(D.streakOn(s, day(3)), 0, 'a missed day ends it');
  s = D.record(s, today(3), 40, day(3)).state; assert.equal(s.streak.count, 1);
});

test('bests keep the highest score and report a new best only when one is beaten', () => {
  const d = new Date(2026, 10, 3);
  let r = D.record(D.emptyState(), 'ink', 50, d); assert.equal(r.newBest, false); assert.equal(r.state.best.ink, 50);
  r = D.record(r.state, 'ink', 40, d); assert.equal(r.state.best.ink, 50); assert.equal(r.newBest, false);
  r = D.record(r.state, 'ink', 80, d); assert.equal(r.state.best.ink, 80); assert.equal(r.newBest, true);
  assert.equal(r.state.plays.ink, 3);
});

test('saved state from storage is cleaned before use', () => {
  assert.deepEqual(D.normalize(null), D.emptyState());
  const s = D.normalize({ best: { ink: 140, nope: 3, track: 'x' }, streak: { count: 2.7, last: '2026-11-03' } });
  assert.deepEqual(s.best, { ink: 100 }); assert.deepEqual(s.streak, { count: 2, last: '2026-11-03' });
});

test('scores stay between 0 and 100 and reward the thing each task measures', () => {
  assert.equal(D.score.track({ hits: 9, total: 9 }), 100);
  assert.equal(D.score.track({ hits: 0, total: 9 }), 0);
  // Only the ripe: tapping every red but every green too is worse than missing a few reds.
  assert.ok(D.score.ripe({ hitRed: 39, red: 39, heldGreen: 0, green: 6 }) < D.score.ripe({ hitRed: 30, red: 39, heldGreen: 6, green: 6 }));
  assert.equal(D.score.flank({ correct: 30, total: 30, rtSame: [400], rtOpposite: [420] }), 100);
  assert.ok(D.score.flank({ correct: 30, total: 30, rtSame: [400], rtOpposite: [700] }) < 100);
  assert.equal(D.score.ink({ correct: 28, total: 28, rtSame: [], rtClash: [700] }), 100);
  assert.equal(D.score.back({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 22 }), 100);
  assert.equal(D.score.time({ errors: [0, 0, 0] }), 100);
  assert.equal(D.score.time({ errors: [1, 1, 1] }), 0);
  for (const id of Object.keys(D.score)) assert.ok(D.CHALLENGES.some(c => c.id === id));
});

test('rest counts plays but never touches the streak or bests', () => {
  const d = new Date(2026, 10, 3);
  let s = D.rested(D.emptyState(), 'sigh'); s = D.rested(s, 'far'); s = D.rested(s, 'sigh');
  assert.deepEqual(s.plays, { sigh: 2, far: 1 });
  assert.deepEqual(s.best, {}); assert.equal(D.streakOn(s, d), 0);
  assert.ok(D.REST.every(r => r.kind === 'rest') && D.CHALLENGES.every(c => c.kind === 'focus'));
});

test('good things are trimmed, dated, kept in order and removable', () => {
  const d = new Date(2026, 10, 3, 21);
  let s = D.addGood(D.emptyState(), '  Walked to the lab in the sun ', '', d);
  s = D.addGood(s, '   ', 'blank ones are ignored', d);
  s = D.addGood(s, 'The model ran', 'I asked for help', new Date(2026, 10, 4, 8));
  assert.deepEqual(s.good, [{ d: '2026-11-03', t: 'Walked to the lab in the sun', w: '' }, { d: '2026-11-04', t: 'The model ran', w: 'I asked for help' }]);
  assert.equal(s.plays.good, 2);
  assert.equal(D.addGood(s, 'x'.repeat(900), '', d).good.at(-1).t.length, 500);
  assert.deepEqual(D.removeGood(s, 0).good.map(g => g.t), ['The model ran']);
  const dirty = D.normalize({ good: [{ d: 'yesterday', t: 'bad date' }, { d: '2026-11-01', t: 7 }, { d: '2026-11-02', t: 'kept', w: null }] });
  assert.deepEqual(dirty.good, [{ d: '2026-11-02', t: 'kept', w: '' }]);
});
