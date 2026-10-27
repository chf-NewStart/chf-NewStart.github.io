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
  // Anything shorter is a quick timer (a plank, a rest): no reflection, and it stays out of the notebook.
  const QUICK = 5 * C.MINUTE;

  // The length in what Siri heard, at the start or the end: "plank 90 seconds", "90 second plank", "read this paper for
  // 50 minutes", "wall sit a minute and a half". Units must be spelled out ("90s music" stays a question), and a length
  // in the middle ("take a second look at figure 3") is left alone. Returns the length and the other words, or null.
  const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const NUMBER = '(\\d+(?:\\.\\d+)?|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\\s-](?:one|two|three|four|five|six|seven|eight|nine))?|'
    + Object.keys(WORDS).join('|') + ')';
  const UNIT = '(seconds?|secs?|minutes?|mins?|hours?|hrs?)';
  const PART = `(?:${NUMBER}(\\s+and\\s+a\\s+half)?[\\s-]*${UNIT}(\\s+and\\s+a\\s+half)?|half\\s+an?\\s+(hour|minute))`;
  const SPAN = `(?:\\bfor\\s+)?\\b${PART}(?:(?:\\s*,\\s*|\\s+and\\s+|\\s+)${PART})*\\b`;
  const AT_END = new RegExp(`${SPAN}[\\s.!?]*$`, 'i'), AT_START = new RegExp(`^\\s*${SPAN}`, 'i');
  const unitMs = unit => /^s/i.test(unit) ? 1000 : /^m/i.test(unit) ? C.MINUTE : 60 * C.MINUTE;
  const value = number => /\d/.test(number) ? Number(number) : number.toLowerCase().split(/[\s-]/).reduce((sum, word) => sum + WORDS[word], 0);
  function length(text) {
    text = String(text || '');
    const found = text.match(AT_END) || text.match(AT_START);
    if (!found) return null;
    let ms = 0;
    for (const part of found[0].matchAll(new RegExp(PART, 'gi'))) {
      ms += part[5] ? unitMs(part[5]) / 2 : (value(part[1]) + (part[2] || part[4] ? 0.5 : 0)) * unitMs(part[3]);
    }
    if (ms < 5000) return null;
    const rest = (text.slice(0, found.index) + ' ' + text.slice(found.index + found[0].length))
      .replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
    return { ms: Math.round(ms), rest };
  }

  // "Start Tend" → "What are you working on?" → the answer is this session's question, and any length in it sets the
  // session's length ("plank 90 seconds" makes a quick timer). A session already under way is filed first (ended
  // early, keeping any notes it had), so starting from Siri never loses one.
  function start(state, { question, minutes, now, id }) {
    const said = length(question);
    const label = clean(said ? said.rest : question, 500);
    let ms = Number.isFinite(minutes) && minutes > 0 ? minutes * C.MINUTE : said?.ms;
    if (ms) ms = Math.round(Math.min(120 * C.MINUTE, Math.max(5000, ms)));
    let next = C.advance(state, now), filed = null;
    const focusQuestion = label || (ms >= QUICK ? clean(next.task.question, 500) : '');
    if (!focusQuestion && !(ms < QUICK)) throw new Error('Choose one question or task first.');
    if (['running', 'paused'].includes(next.timer.status)) next = C.endEarly(next, now);
    if (next.pending) { filed = next.pending; next = C.saveReview(next, next.pending, false); }
    if (ms < QUICK) {
      return { state: C.start({ ...next, timer: C.quickTimer(label || 'Quick timer', ms) }, now, id), filed, quick: true, durationMs: ms };
    }
    let timer = next.timer.phase === 'focus' && next.timer.status === 'idle' ? next.timer : freshFocus(next);
    if (ms) timer = { ...timer, durationMs: ms, remainingMs: ms };
    const task = { question: focusQuestion, finish: focusQuestion === next.task.question ? next.task.finish : '' };
    return { state: C.start({ ...next, timer, task }, now, id), filed, quick: false, durationMs: timer.durationMs };
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
    let state, saved;
    try {
      state = stored ? C.restore(stored, args.now) : C.createState();
      // As saved, before restore catches the clock up: a timer that ran out while nobody looked is a change too.
      saved = stored && C.restore(stored, 0);
    } catch (_) { throw new Error('Tend couldn’t read its notebook, so nothing was changed. Open Tend to check it.'); }
    const result = operations[name](state, args);
    return JSON.stringify({ ...result, changed: !saved || JSON.stringify(result.state) !== JSON.stringify(saved) });
  }
  return { start, pause, resume, finish, note, length, run };
});
