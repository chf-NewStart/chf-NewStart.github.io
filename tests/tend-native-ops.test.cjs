const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../focus/core.js');
const O = require('../apps/tend-ios/App/TendOps.js')(C);
const MIN = C.MINUTE;
const question = 'imma read this paper and find out how metabolic pathways help simplify the things';
// Round-trips through JSON text exactly as the iPhone app stores and hands the notebook over.
const run = (name, state, args) => JSON.parse(O.run(name, state ? JSON.stringify(state) : null, args));
test('Siri starts a session on its question at the notebook rhythm, from an empty notebook', () => {
  const { state } = run('start', null, { question: '  ' + question + '\n', now: 1000, id: 'siri-1' });
  assert.equal(state.schema, 'tend-focus-v1'); assert.equal(state.timer.status, 'running'); assert.equal(state.timer.id, 'siri-1');
  assert.equal(state.timer.task.question, question); assert.equal(state.task.question, question);
  assert.equal(state.timer.endAt, 1000 + 25 * MIN);
  const restored = C.restore(JSON.stringify(state), 1000 + 10 * MIN);
  assert.equal(C.remaining(restored.timer, 1000 + 10 * MIN), 15 * MIN);
});
test('a spoken length is used for this session only; the rhythm stays', () => {
  const custom = C.setRhythm(C.createState(), 50, 10);
  const { state } = run('start', custom, { question, minutes: 30, now: 0, id: 'a' });
  assert.equal(state.timer.durationMs, 30 * MIN); assert.equal(state.settings.focus, 50);
  assert.equal(run('start', custom, { question, now: 0, id: 'b' }).state.timer.durationMs, 50 * MIN);
  assert.equal(run('start', custom, { question, minutes: 500, now: 0, id: 'c' }).state.timer.durationMs, 120 * MIN);
});
test('an empty question is refused and an unreadable notebook is never replaced', () => {
  assert.throws(() => O.run('start', null, { question: '   ', now: 0, id: 'a' }), /Choose one/);
  assert.throws(() => O.run('start', '{"schema":"something-else"}', { question, now: 0, id: 'a' }), /couldn’t read its notebook/);
  assert.throws(() => O.run('nope', null, { now: 0 }), /Unknown operation/);
});
test('an operation that changes nothing says so, so the app saves nothing', () => {
  const { state } = run('start', null, { question, now: 0, id: 'a' });
  assert.equal(run('resume', state, { now: MIN }).changed, false);
  assert.equal(run('pause', state, { now: MIN }).changed, true);
  assert.equal(run('pause', null, { now: MIN }).changed, true);
});
test('starting over a running session files it as ended early, once', () => {
  let { state } = run('start', null, { question: 'First question', now: 0, id: 'a' });
  const second = run('start', state, { question, now: 10 * MIN, id: 'b' });
  state = second.state;
  assert.equal(second.filed.id, 'a'); assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].completed, false); assert.equal(state.sessions[0].durationMs, 10 * MIN);
  assert.equal(state.timer.id, 'b'); assert.equal(state.timer.task.question, question); assert.equal(state.timer.endAt, 35 * MIN);
});
test('starting over a finished session keeps the reflection already typed', () => {
  let state = C.start({ ...C.createState(), task: { question: 'First question', finish: '' } }, 0, 'a');
  state = C.advance(state, 30 * MIN); state = { ...state, pending: { ...state.pending, learned: 'A finding' } };
  state = run('start', state, { question, now: 31 * MIN, id: 'b' }).state;
  assert.equal(state.sessions[0].learned, 'A finding'); assert.equal(state.sessions[0].completed, true);
  assert.equal(state.completedCount, 1); assert.equal(state.timer.status, 'running');
});
test('starting during a break ends the break and begins focus', () => {
  let state = C.start({ ...C.createState(), task: { question: 'First question', finish: '' } }, 0, 'a');
  state = C.saveReview(C.advance(state, 25 * MIN), {}, true); state = C.start(state, 25 * MIN, 'break');
  assert.equal(state.timer.phase, 'break');
  state = run('start', state, { question, now: 27 * MIN, id: 'b' }).state;
  assert.equal(state.timer.phase, 'focus'); assert.equal(state.timer.durationMs, 25 * MIN); assert.equal(state.sessions.length, 1);
});
test('pause and resume from the Lock Screen keep the deadline honest', () => {
  let { state } = run('start', null, { question, now: 0, id: 'a' });
  state = run('pause', state, { now: 5 * MIN }).state;
  assert.equal(state.timer.status, 'paused'); assert.equal(state.timer.remainingMs, 20 * MIN);
  assert.equal(run('pause', state, { now: 6 * MIN }).state.timer.remainingMs, 20 * MIN);
  state = run('resume', state, { now: 60 * MIN }).state;
  assert.equal(state.timer.status, 'running'); assert.equal(state.timer.endAt, 80 * MIN);
  assert.equal(run('resume', state, { now: 61 * MIN }).state.timer.endAt, 80 * MIN);
});
test('Done ends the session early and waits for its note; after the time it is a full interval', () => {
  let { state } = run('start', null, { question, now: 0, id: 'a' });
  const early = run('finish', state, { now: 18 * MIN }).state;
  assert.equal(early.timer.status, 'review'); assert.equal(early.pending.durationMs, 18 * MIN); assert.equal(early.pending.completed, false);
  const late = run('finish', state, { now: 40 * MIN }).state;
  assert.equal(late.pending.completed, true); assert.equal(late.pending.durationMs, 25 * MIN);
  assert.deepEqual(run('finish', late, { now: 41 * MIN }).state.pending, late.pending);
});
test('the note saves the waiting session as its next step, and the room offers it as the next question', () => {
  let { state } = run('start', null, { question, now: 0, id: 'a' });
  const result = run('note', state, { id: 'a', text: ' stopped at figure 3, check the flux bounds ', now: 26 * MIN });
  state = result.state;
  assert.equal(result.saved, true); assert.equal(state.pending, null); assert.equal(state.timer.status, 'idle');
  assert.equal(state.sessions.length, 1); assert.equal(state.sessions[0].next, 'stopped at figure 3, check the flux bounds');
  assert.equal(state.sessions[0].question, question); assert.equal(state.task.question, 'stopped at figure 3, check the flux bounds');
});
test('a second note adds to the saved session instead of making a duplicate', () => {
  let { state } = run('start', null, { question, now: 0, id: 'a' });
  state = run('note', state, { id: 'a', text: 'first thought', now: 26 * MIN }).state;
  state = run('note', state, { id: 'a', text: 'second thought', now: 27 * MIN }).state;
  assert.equal(state.sessions.length, 1); assert.equal(state.sessions[0].next, 'first thought\nsecond thought');
  assert.equal(C.restore(JSON.stringify(state)).sessions.length, 1);
});
test('a note keeps what the room had typed into the reflection, and ignores unknown sessions', () => {
  let { state } = run('start', null, { question, now: 0, id: 'a' });
  state = C.advance(state, 25 * MIN); state = { ...state, pending: { ...state.pending, next: 'typed in the room' } };
  assert.equal(run('note', state, { text: 'from the Lock Screen', now: 26 * MIN }).state.sessions[0].next, 'typed in the room\nfrom the Lock Screen');
  const stray = run('note', state, { id: 'gone', text: 'hello', now: 26 * MIN });
  assert.equal(stray.saved, false); assert.equal(stray.state.pending.id, 'a');
  assert.equal(run('note', state, { id: 'a', text: '   ', now: 26 * MIN }).saved, false);
});
