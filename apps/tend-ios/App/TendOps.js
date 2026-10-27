// What Siri, the Lock Screen buttons and the "Where did you stop?" notification do to the notebook while the room
// isn't open. Each operation only combines TendCore's rules, so the result is a `tend-focus-v1` notebook the room
// (and an Android backup) reads as its own. The iPhone app runs this next to core.js in JavaScriptCore; Node runs it
// in tests/tend-native-ops.test.cjs.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TendOps = factory(root.TendCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const clean = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  // A focus timer at the notebook's own rhythm, as the room's "Skip break" makes one.
  const freshFocus = state => C.setRhythm(C.createState(), state.settings.focus, state.settings.short, state.settings.long).timer;

  // "Start Tend" → "What are you working on?" → the answer is this session's question. A session already under way
  // is filed first (ended early, keeping any notes it had), so starting from Siri never loses one.
  function start(state, { question, minutes, now, id }) {
    question = clean(question, 500);
    if (!question) throw new Error('Choose one question or task first.');
    let next = C.advance(state, now), filed = null;
    if (['running', 'paused'].includes(next.timer.status)) next = C.endEarly(next, now);
    if (next.pending) { filed = next.pending; next = C.saveReview(next, next.pending, false); }
    let timer = next.timer.phase === 'focus' && next.timer.status === 'idle' ? next.timer : freshFocus(next);
    if (Number.isFinite(minutes) && minutes > 0) {
      const ms = Math.round(Math.min(120, Math.max(1, minutes))) * C.MINUTE;
      timer = { ...timer, durationMs: ms, remainingMs: ms };
    }
    return { state: C.start({ ...next, timer, task: { question, finish: '' } }, now, id), filed };
  }

  function pause(state, { now }) { return { state: C.pause(state, now) }; }

  function resume(state, { now }) {
    const next = C.advance(state, now);
    return { state: next.timer.status === 'paused' ? C.start(next, now) : next };
  }

  // "Done": a focus session under way ends now and waits for its note, a break ends, and a finished session stays
  // as it is, waiting for its note.
  function finish(state, { now }) { return { state: C.endEarly(state, now) }; }

  // The answer to "Where did you stop?" is the session's next small action: the thread the room offers as the next
  // question. It saves a session that is waiting for its reflection; for one already saved, it adds to that note.
  function note(state, { id, text, now }) {
    text = String(text || '').trim().slice(0, 4000);
    const next = C.advance(state, now);
    if (!text) return { state: next, saved: false };
    const join = before => (before ? before + '\n' + text : text).slice(0, 4000);
    if (next.pending && (!id || next.pending.id === id)) {
      return { state: C.saveReview(next, { ...next.pending, next: join(next.pending.next) }, false), saved: true };
    }
    if (id && next.sessions.some(item => item.id === id)) {
      return { state: { ...next, sessions: next.sessions.map(item => item.id === id ? { ...item, next: join(item.next) } : item) }, saved: true };
    }
    return { state: next, saved: false };
  }

  const operations = { start, pause, resume, finish, note };
  // One operation on the saved notebook (JSON text, or null before the first save). Returns JSON text for Swift,
  // with `changed` false when there is nothing new to save. A notebook that can't be read throws, so the app never
  // writes over it.
  function run(name, stored, args) {
    if (!Object.prototype.hasOwnProperty.call(operations, name)) throw new Error('Unknown operation: ' + name);
    let state;
    try { state = stored ? C.restore(stored, args.now) : C.createState(); }
    catch (_) { throw new Error('Tend couldn’t read its notebook, so nothing was changed. Open Tend to check it.'); }
    const result = operations[name](state, args);
    return JSON.stringify({ ...result, changed: !stored || JSON.stringify(result.state) !== JSON.stringify(state) });
  }
  return { start, pause, resume, finish, note, run };
});
