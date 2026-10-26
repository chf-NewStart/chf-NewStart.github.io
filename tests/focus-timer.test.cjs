const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../focus/core.js');
const MIN = C.MINUTE;
const seed = () => ({ ...C.createState(), task: { question: 'Compare transport assumptions', finish: 'One clear distinction' } });
test('an idle focus session needs one explicit task', () => {
  assert.throws(() => C.start(C.createState(), 1000, 'a'), /Choose one/);
  const state = C.start(seed(), 1000, 'a'); assert.equal(state.timer.task.question, seed().task.question);
});
test('background time and a reload use a deadline, not tick counts', () => {
  const state = C.start(seed(), 1000, 'a');
  const restored = C.restore(JSON.stringify(state), 1000 + 17 * MIN);
  assert.equal(C.remaining(restored.timer, 1000 + 17 * MIN), 8 * MIN);
});
test('a session left overnight records only its intended interval once', () => {
  const state = C.start(seed(), 1000, 'a'); const done = C.advance(state, 1000 + 12 * 60 * MIN);
  assert.equal(done.pending.durationMs, 25 * MIN); assert.equal(done.pending.endedAt, new Date(1000 + 25 * MIN).toISOString());
  assert.equal(C.advance(done, 1000 + 13 * 60 * MIN), done);
  const saved = C.saveReview(done, { learned: 'A distinction' }); assert.equal(saved.sessions.length, 1);
  assert.equal(C.saveReview(saved, {}), saved);
});
test('paused time is excluded, including after a reload', () => {
  let state = C.start(seed(), 1000, 'a'); state = C.pause(state, 1000 + 5 * MIN);
  state = C.restore(JSON.stringify(state), 1000 + 60 * MIN);
  assert.equal(C.remaining(state.timer), 20 * MIN);
  state = C.start(state, 1000 + 60 * MIN); state = C.advance(state, 1000 + 80 * MIN);
  assert.equal(state.pending.durationMs, 25 * MIN);
});
test('pausing after the deadline completes the session instead of losing it', () => {
  const state = C.pause(C.start(seed(), 0, 'a'), 26 * MIN);
  assert.equal(state.timer.status, 'review'); assert.equal(state.pending.completed, true);
});
test('ending early records only elapsed active time', () => {
  let state = C.start(seed(), 1000, 'a'); state = C.pause(state, 1000 + 3 * MIN);
  state = C.endEarly(state, 1000 + 60 * MIN);
  assert.equal(state.pending.durationMs, 3 * MIN); assert.equal(state.pending.completed, false);
  const saved = C.saveReview(state, {}, true); assert.equal(saved.completedCount, 0); assert.equal(saved.timer.durationMs, 5 * MIN);
});
test('the fourth full session earns a long break; it never auto-starts another focus', () => {
  let state = { ...seed(), completedCount: 3 }; state = C.start(state, 0, 'four');
  state = C.saveReview(C.advance(state, 25 * MIN), { next: 'Check the boundary condition' }, true);
  assert.equal(state.timer.durationMs, 15 * MIN); assert.equal(state.timer.status, 'idle');
  state = C.start(state, 25 * MIN, 'break'); state = C.advance(state, 24 * 60 * MIN);
  assert.equal(state.timer.phase, 'focus'); assert.equal(state.timer.status, 'idle'); assert.equal(state.sessions.length, 1);
  assert.equal(state.task.question, 'Check the boundary condition');
});
test('custom rhythms survive finishing a break', () => {
  let state = C.setRhythm(seed(), 50, 10, 25); state = C.start(state, 0, 'a');
  state = C.saveReview(C.advance(state, 50 * MIN), {}, true); state = C.start(state, 50 * MIN, 'b'); state = C.advance(state, 60 * MIN);
  assert.equal(state.timer.durationMs, 50 * MIN); assert.equal(state.settings.short, 10);
});
test('durations cannot change in the middle of a session', () => {
  const state = C.start(seed(), 0, 'a'); assert.equal(C.setRhythm(state, 50, 10), state);
});
test('pending reflection drafts survive a reload', () => {
  let state = C.advance(C.start(seed(), 0, 'a'), 25 * MIN); state.pending.learned = 'The pool is shared';
  state = C.restore(JSON.stringify(state), 26 * MIN);
  assert.equal(state.pending.learned, 'The pool is shared'); assert.equal(state.timer.status, 'review');
});
test('invalid and oversized backups fail without replacing usable state', () => {
  assert.throws(() => C.restore('{broken')); assert.throws(() => C.restore({ schema: 'other', sessions: [] }));
  assert.throws(() => C.restore({ schema: C.SCHEMA, sessions: new Array(10001) }));
  const state = seed(); state.settings.focus = Infinity; state.timer.status = 'running'; state.timer.endAt = 'bad';
  assert.equal(C.restore(state).timer.status, 'idle'); assert.equal(C.restore(state).settings.focus, 25);
});
test('backup restoration preserves notes as text and deduplicates session IDs', () => {
  let state = C.saveReview(C.advance(C.start(seed(), 0, 'a'), 25 * MIN), { learned: '<script>never execute me</script>' });
  state.sessions.push(state.sessions[0]); state = C.restore(JSON.stringify(state));
  assert.equal(state.sessions.length, 1); assert.equal(state.sessions[0].learned, '<script>never execute me</script>');
});
test('weekly exports use the local Monday boundary and preserve actual reflections', () => {
  const monday = new Date(2026, 9, 26, 10).getTime();
  const start = C.weekStart(monday); assert.equal(start.getDay(), 1); assert.equal(start.getHours(), 0);
  let state = C.saveReview(C.advance(C.start(seed(), monday, 'a'), monday + 25 * MIN), { learned: 'One finding', stuck: 'One question', next: 'One action' });
  state.plan = 'One weekly result'; const report = C.weeklyMarkdown(state, monday);
  assert.match(report, /One weekly result/); assert.match(report, /Learned: One finding/); assert.match(report, /1 session · 25 timer minutes/);
  assert.equal(C.weekSessions(state.sessions, new Date(2026, 10, 2, 10)).length, 0);
});
test('a discarded session leaves no record and keeps the question ready', () => {
  let state = C.advance(C.start(seed(), 0, 'a'), 25 * MIN);
  state = C.discardReview({ ...state, pending: { ...state.pending, learned: 'never mind' } });
  assert.equal(state.pending, null); assert.equal(state.sessions.length, 0); assert.equal(state.completedCount, 0);
  assert.equal(state.timer.status, 'idle'); assert.equal(state.timer.phase, 'focus'); assert.equal(state.task.question, seed().task.question);
  assert.equal(C.discardReview(state), state);
});
test('the web notification opt-in survives a reload and defaults to off', () => {
  assert.equal(C.createState().settings.notify, false);
  const state = C.createState(); state.settings.notify = true;
  assert.equal(C.restore(JSON.stringify(state)).settings.notify, true);
  assert.equal(C.restore({ ...C.createState(), settings: { focus: 25 } }).settings.notify, false);
});
test('counts read naturally', () => {
  assert.equal(C.plural(1, 'session'), '1 session'); assert.equal(C.plural(0, 'session'), '0 sessions'); assert.equal(C.plural(2, 'minute'), '2 minutes');
});
