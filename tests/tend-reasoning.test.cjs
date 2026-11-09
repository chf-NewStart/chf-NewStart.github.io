const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const R = require('../focus/reasoning-core.js');
const Q = R.QUESTIONS;
const at = (day, hour = 12) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, hour); };
const attempt = (s, id) => s.attempts.find(a => a.id === id);
function begin(day = '2026-11-08') { return R.start(R.emptyState(), { mode: 'daily', day }); }
function finish(state, id, date) { return R.complete(R.submit(state, id, { reveal: true }), id, at(date)); }

test('fourteen substantive daily questions and fourteen preserved introductions have authored content', () => {
  assert.equal(Q.length, 28); assert.equal(new Set(Q.map(q => q.id)).size, 28);
  assert.equal(R.DAILY_QUESTIONS.length, 14);
  assert.ok(R.DAILY_QUESTIONS.every(q => q.daily && !q.introductory));
  assert.equal(Q.filter(q => q.introductory).length, 14);
  for (const q of Q) {
    assert.ok(q.title && q.prompt && q.concept && Object.hasOwn(q, 'diagram'), q.id);
    assert.ok(q.conditions.length >= 2 && q.hints.length >= 2 && q.explanation.length >= 2, q.id);
    assert.ok(q.check.constant && q.check.forces && q.check.equilibrium, q.id);
    assert.ok(q.options.some(o => o.id === q.answer), q.id);
    assert.ok(q.options.every(o => o.text && o.feedback), q.id);
    assert.ok(q.sources.length && q.sources.every(s => s.title && /^https:\/\//.test(s.url)), q.id);
    assert.ok(q.changes, q.id);
    assert.ok(q.variation.prompt && q.variation.conditions.length && q.variation.options.some(o => o.id === q.variation.answer), q.id);
    assert.ok(q.variation.explanation.length && q.variation.options.every(o => o.feedback), q.id);
  }
});

test('daily selection uses the local calendar, visits all fourteen and pins saved IDs', () => {
  const day = '2026-11-08';
  const morning = R.daily(R.emptyState(), at(day, 0));
  assert.equal(R.daily(morning.state, at(day, 23)).question.id, morning.question.id);
  const ids = new Set();
  for (let n = 0; n < 14; n++) ids.add(R.daily(R.emptyState(), R.addDays(day, n)).question.id);
  assert.equal(ids.size, 14);
  assert.ok([...ids].every(id => Q.find(q => q.id === id).daily));
  const pinned = JSON.parse(JSON.stringify(morning.state));
  Q.reverse();
  try { assert.equal(R.daily(pinned, at(day)).question.id, morning.question.id, 'content order changes cannot change an opened day'); }
  finally { Q.reverse(); }
  assert.equal(R.dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('an existing introductory day remains pinned while new days use the substantive bank', () => {
  const prior = R.emptyState(); prior.daily['2026-11-08'] = 'half-a-material';
  const opened = R.start(prior, { mode: 'daily', day: '2026-11-08' });
  assert.equal(opened.attempt.questionId, 'half-a-material');
  assert.equal(R.daily(JSON.parse(JSON.stringify(opened.state)), '2026-11-08').question.id, 'half-a-material');
  assert.equal(R.daily(opened.state, '2026-11-09').question.daily, true);
  const practice = R.start(opened.state, { mode: 'practice', questionId: 'half-a-material', day: '2026-11-09' });
  assert.equal(practice.attempt.questionId, 'half-a-material');
});

test('local midnight and DST are calendar boundaries rather than UTC or fixed elapsed hours', () => {
  const script = `const R=require(${JSON.stringify(require.resolve('../focus/reasoning-core.js'))});process.stdout.write(JSON.stringify([R.dayKey(new Date('2026-11-09T02:00:00Z')),R.addDays('2026-03-07',3),R.addDays('2026-10-31',3)]));`;
  const toronto = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'America/Toronto' } }));
  const tokyo = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'Asia/Tokyo' } }));
  assert.deepEqual(toronto, ['2026-11-08', '2026-03-10', '2026-11-03']);
  assert.deepEqual(tokyo, ['2026-11-09', '2026-03-10', '2026-11-03']);
});

test('draft and assumption-check revision survive refresh without overwriting the initial prediction', () => {
  let { state, attempt: a } = begin(); const q = Q.find(q => q.id === a.questionId);
  state = R.update(state, a.id, { initialPrediction: q.options[0].id, reason: 'My first model', hintsUsed: 1 });
  state = R.update(state, a.id, { stage: 'check' });
  state = R.update(state, a.id, { finalPrediction: q.options[1].id, changedMind: 'I noticed a condition', initialPrediction: q.options[1].id, hintsUsed: 0 });
  const saved = R.normalize(JSON.parse(JSON.stringify(state)));
  const resumed = R.start(saved, { mode: 'daily', day: a.day });
  assert.equal(resumed.state.attempts.length, 1);
  assert.equal(resumed.attempt.initialPrediction, q.options[0].id);
  assert.equal(resumed.attempt.finalPrediction, q.options[1].id);
  assert.equal(resumed.attempt.reason, 'My first model');
  assert.equal(resumed.attempt.changedMind, 'I noticed a condition');
  assert.equal(resumed.attempt.hintsUsed, 1);
});

test('submit freezes prediction; explicit reveal works with no prediction and does not finish the explanation', () => {
  let { state, attempt: a } = begin();
  assert.equal(attempt(R.submit(state, a.id), a.id).stage, 'predict');
  assert.equal(attempt(R.complete(state, a.id), a.id).stage, 'predict');
  state = R.submit(state, a.id, { reveal: true });
  assert.equal(attempt(state, a.id).stage, 'explain');
  assert.equal(attempt(state, a.id).revealed, true);
  assert.equal(attempt(state, a.id).initialPrediction, null);
  assert.deepEqual(state.dailyCompleted, {});
  const q = Q.find(q => q.id === a.questionId);
  state = R.update(state, a.id, { finalPrediction: q.answer, initialPrediction: q.answer });
  assert.equal(attempt(state, a.id).finalPrediction, null);
  state = R.complete(state, a.id, at('2026-11-08'));
  assert.equal(attempt(state, a.id).stage, 'complete');
  assert.equal(Object.keys(state.dailyCompleted).length, 1);
});

test('incorrect predictions and every hint earn the same single dated participation mark', () => {
  let { state, attempt: a } = begin(); const q = Q.find(q => q.id === a.questionId);
  state = R.update(state, a.id, { initialPrediction: q.options.find(o => o.id !== q.answer).id, hintsUsed: 99, stage: 'check' });
  state = R.submit(state, a.id);
  state = R.complete(state, a.id, at(a.day));
  const completedAt = attempt(state, a.id).completedAt;
  state = R.complete(R.normalize(JSON.parse(JSON.stringify(state))), a.id, at('2026-11-10'));
  assert.equal(attempt(state, a.id).hintsUsed, q.hints.length);
  assert.deepEqual(state.dailyCompleted, { [a.day]: a.id });
  assert.equal(state.reviews.length, 1);
  assert.equal(attempt(state, a.id).completedAt, completedAt);
  assert.equal(state.reviews[0].dueDay, '2026-11-11');
  assert.equal(R.start(state, { mode: 'daily', day: a.day }).state.attempts.length, 1);
});

test('a challenge completed after midnight counts its starting day and schedules review three days after completion', () => {
  const { state, attempt: a } = begin('2026-11-08');
  const finished = finish(state, a.id, '2026-11-09');
  assert.deepEqual(finished.dailyCompleted, { '2026-11-08': a.id });
  assert.equal(finished.reviews[0].dueDay, '2026-11-12');
  assert.equal(R.dueReviews(finished, at('2026-11-11')).length, 0);
  assert.equal(R.dueReviews(finished, at('2026-11-12')).length, 1);
  assert.equal(R.dueReviews(finished, at('2026-12-01')).length, 1, 'missed reviews remain optional and available');
});

test('review uses the authored variation, saves progress and completion, and does not issue another daily mark', () => {
  let { state, attempt: a } = begin(); state = finish(state, a.id, a.day);
  const review = state.reviews[0], q = Q.find(q => q.id === review.questionId);
  assert.throws(() => R.start(state, { mode: 'review', reviewId: review.id, day: a.day }), /not available/);
  const started = R.start(state, { mode: 'review', reviewId: review.id, day: review.dueDay }); state = started.state;
  state = R.update(state, started.attempt.id, { initialPrediction: q.variation.answer, hintsUsed: 99, stage: 'check' });
  assert.equal(attempt(state, started.attempt.id).finalPrediction, q.variation.answer);
  assert.equal(attempt(state, started.attempt.id).hintsUsed, (q.variation.hints || q.hints).length);
  state = R.complete(R.submit(state, started.attempt.id), started.attempt.id, at(review.dueDay));
  assert.equal(R.dueReviews(state, at(review.dueDay)).length, 0);
  assert.equal(state.reviews.length, 1); assert.equal(Object.keys(state.dailyCompleted).length, 1);
  const concept = R.summary(state).find(c => c.concept === q.concept);
  assert.equal(concept.explored, 1); assert.equal(concept.reviewed, 1);
});

test('practice and optional variations save without rewards or extra review scheduling', () => {
  let { state, attempt: a } = R.start(R.emptyState(), { mode: 'practice', questionId: Q[0].id, day: '2026-11-08' });
  state = finish(state, a.id, a.day);
  state = R.update(state, a.id, { variationPrediction: Q[0].variation.answer });
  state = R.update(state, a.id, { variationRevealed: true });
  state = R.normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(attempt(state, a.id).variationPrediction, Q[0].variation.answer);
  assert.equal(attempt(state, a.id).variationRevealed, true);
  assert.deepEqual(state.dailyCompleted, {}); assert.equal(state.reviews.length, 0);
  assert.notEqual(R.start(state, { mode: 'practice', questionId: Q[0].id, day: a.day }).attempt.id, a.id);
  assert.notEqual(R.start({ ...state, nextId: 1 }, { mode: 'practice', questionId: Q[0].id, day: a.day }).attempt.id, a.id, 'repaired counters do not reuse an existing practice attempt');
});

test('normalization bounds notes and hints, rejects invalid dates and unknown questions, and preserves no prototype fields', () => {
  let { state, attempt: a } = begin();
  state = R.update(state, a.id, { reason: '<script>private note</script>' + 'x'.repeat(900), hintsUsed: -2, initialPrediction: 'unknown' });
  const saved = R.normalize({ ...state, daily: { ...state.daily, '2026-02-30': Q[0].id, '2026-11-09': 'unknown' },
    attempts: [...state.attempts, { ...a, id: 'bad', questionId: 'unknown' }, { ...a, id: 'daily:2026-02-30', day: '2026-02-30' }, state.attempts[0]] });
  assert.equal(saved.attempts.length, 1);
  assert.equal(saved.attempts[0].reason.length, 500);
  assert.ok(saved.attempts[0].reason.startsWith('<script>private note</script>'), 'the storage module preserves private notes as text');
  assert.equal(saved.attempts[0].hintsUsed, 0); assert.equal(saved.attempts[0].initialPrediction, null);
  assert.deepEqual(Object.keys(saved.daily), [a.day]);
  assert.deepEqual(R.normalize({ schema: 'different' }), R.emptyState());
  assert.throws(() => R.start(saved, { questionId: 'unchecked' }), /authored/);
  assert.deepEqual(R.update(saved, 'missing', {}), saved);
});
