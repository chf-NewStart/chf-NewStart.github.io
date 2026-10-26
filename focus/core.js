(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TendCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'tend-focus-v1';
  const MINUTE = 60000;
  const text = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
  const number = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const freshTimer = (settings, phase = 'focus', minutes = settings.focus) => ({
    phase, status: 'idle', durationMs: minutes * MINUTE, remainingMs: minutes * MINUTE,
    endAt: null, startedAt: null, id: null, task: null
  });
  function createState() {
    const settings = { focus: 25, short: 5, long: 15, sound: true, keepAwake: false, notify: false };
    return { schema: SCHEMA, settings, plan: '', task: { question: '', finish: '' }, later: [],
      sessions: [], completedCount: 0, timer: freshTimer(settings), pending: null };
  }
  function remaining(timer, now = Date.now()) {
    return timer.status === 'running' ? Math.max(0, Math.min(timer.durationMs, timer.endAt - now)) : timer.remainingMs;
  }
  function elapsed(timer, now = Date.now()) { return Math.max(0, timer.durationMs - remaining(timer, now)); }
  function makePending(timer, now, completed) {
    return { id: timer.id, question: timer.task.question, finish: timer.task.finish,
      startedAt: new Date(timer.startedAt).toISOString(),
      endedAt: new Date(completed ? timer.endAt : now).toISOString(),
      durationMs: completed ? timer.durationMs : elapsed(timer, now), completed,
      learned: '', stuck: '', next: '' };
  }
  function advance(state, now = Date.now()) {
    const timer = state.timer;
    if (timer.status !== 'running' || remaining(timer, now) > 0) return state;
    if (timer.phase === 'break') return { ...state, timer: freshTimer(state.settings) };
    return { ...state, pending: makePending(timer, now, true),
      timer: { ...timer, status: 'review', remainingMs: 0, endAt: null } };
  }
  function start(state, now = Date.now(), id = 'session-' + now) {
    state = advance(state, now);
    const timer = state.timer;
    if (timer.status === 'review' || timer.status === 'running') return state;
    if (timer.status === 'paused') return { ...state, timer: { ...timer, status: 'running', endAt: now + timer.remainingMs } };
    if (timer.phase === 'focus' && !state.task.question.trim()) throw new Error('Choose one question or task first.');
    return { ...state, timer: { ...timer, status: 'running', endAt: now + timer.remainingMs,
      startedAt: now, id, task: timer.phase === 'focus' ? { ...state.task, question: state.task.question.trim() } : null } };
  }
  function pause(state, now = Date.now()) {
    state = advance(state, now);
    if (state.timer.status !== 'running') return state;
    return { ...state, timer: { ...state.timer, status: 'paused', remainingMs: remaining(state.timer, now), endAt: null } };
  }
  function endEarly(state, now = Date.now()) {
    state = advance(state, now);
    const timer = state.timer;
    if (!['running', 'paused'].includes(timer.status)) return state;
    if (timer.phase === 'break' || elapsed(timer, now) < 1000) return { ...state, timer: freshTimer(state.settings) };
    return { ...state, pending: makePending(timer, now, false),
      timer: { ...timer, status: 'review', remainingMs: remaining(timer, now), endAt: null } };
  }
  function saveReview(state, notes, takeBreak = false) {
    if (!state.pending) return state;
    const session = { ...state.pending, learned: text(notes.learned), stuck: text(notes.stuck), next: text(notes.next) };
    const sessions = state.sessions.some(item => item.id === session.id) ? state.sessions : [...state.sessions, session];
    const completedCount = state.completedCount + (session.completed ? 1 : 0);
    const longBreak = session.completed && completedCount % 4 === 0;
    return { ...state, sessions, completedCount, pending: null,
      task: { question: text(session.next || session.question, 500), finish: '' },
      timer: takeBreak ? freshTimer(state.settings, 'break', longBreak ? state.settings.long : state.settings.short) : freshTimer(state.settings) };
  }
  function discardReview(state) {
    if (!state.pending) return state;
    return { ...state, pending: null, timer: freshTimer(state.settings) };
  }
  function setRhythm(state, focus, short, long = state.settings.long) {
    if (state.timer.status !== 'idle' || state.timer.phase !== 'focus') return state;
    const settings = { ...state.settings, focus: Math.round(number(focus, 25, 5, 120)),
      short: Math.round(number(short, 5, 1, 30)), long: Math.round(number(long, 15, 5, 60)) };
    return { ...state, settings, timer: freshTimer(settings) };
  }
  function localDate(value = Date.now()) {
    const date = new Date(value);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function weekStart(value = Date.now()) {
    const date = new Date(value); date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date;
  }
  function weekSessions(sessions, now = Date.now()) {
    const start = weekStart(now).getTime(); const end = new Date(start); end.setDate(end.getDate() + 7);
    return sessions.filter(item => new Date(item.endedAt).getTime() >= start && new Date(item.endedAt).getTime() < end.getTime());
  }
  function normalizeSession(item) {
    if (!item || typeof item.id !== 'string' || !Number.isFinite(Date.parse(item.endedAt)) || !Number.isFinite(Date.parse(item.startedAt))) throw new Error('A saved session is invalid.');
    return { id: text(item.id, 160), question: text(item.question, 500), finish: text(item.finish, 500),
      startedAt: new Date(item.startedAt).toISOString(), endedAt: new Date(item.endedAt).toISOString(),
      durationMs: number(item.durationMs, 0, 0, 120 * MINUTE), completed: item.completed === true,
      learned: text(item.learned), stuck: text(item.stuck), next: text(item.next) };
  }
  function restore(input, now = Date.now()) {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data || data.schema !== SCHEMA || !Array.isArray(data.sessions) || data.sessions.length > 10000) throw new Error('This is not a Tend backup.');
    const state = createState();
    state.settings = { focus: Math.round(number(data.settings?.focus, 25, 5, 120)), short: Math.round(number(data.settings?.short, 5, 1, 30)),
      long: Math.round(number(data.settings?.long, 15, 5, 60)), sound: data.settings?.sound !== false, keepAwake: data.settings?.keepAwake === true, notify: data.settings?.notify === true };
    state.plan = text(data.plan); state.task = { question: text(data.task?.question, 500), finish: text(data.task?.finish, 500) };
    state.later = (Array.isArray(data.later) ? data.later : []).slice(0, 1000).filter(item => item && typeof item.id === 'string').map(item => ({ id: text(item.id, 160), text: text(item.text, 1000), done: item.done === true }));
    state.sessions = [...new Map(data.sessions.map(item => { const session = normalizeSession(item); return [session.id, session]; })).values()];
    state.completedCount = Math.round(number(data.completedCount, state.sessions.filter(item => item.completed).length, 0, 1000000));
    state.timer = freshTimer(state.settings);
    const timer = data.timer;
    if (timer && ['focus', 'break'].includes(timer.phase) && ['idle', 'running', 'paused', 'review'].includes(timer.status)) {
      const durationMs = number(timer.durationMs, state.settings.focus * MINUTE, MINUTE, 120 * MINUTE);
      const needsTask = timer.phase === 'focus' && timer.status !== 'idle';
      const validTask = typeof timer.task?.question === 'string' && timer.task.question.trim();
      const validClock = Number.isFinite(timer.startedAt) && typeof timer.id === 'string' && (timer.status !== 'running' || Number.isFinite(timer.endAt));
      if (timer.status === 'idle' || (validClock && (!needsTask || validTask))) {
        state.timer = { phase: timer.phase, status: timer.status, durationMs,
          remainingMs: number(timer.remainingMs, durationMs, 0, durationMs),
          endAt: timer.status === 'running' ? timer.endAt : null, startedAt: timer.startedAt, id: timer.id,
          task: validTask ? { question: text(timer.task.question, 500), finish: text(timer.task.finish, 500) } : null };
      }
    }
    if (data.pending && state.timer.status === 'review') state.pending = normalizeSession(data.pending);
    if (state.timer.status === 'review' && !state.pending) state.timer = freshTimer(state.settings);
    return advance(state, now);
  }
  const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');
  function weeklyMarkdown(state, now = Date.now()) {
    const sessions = weekSessions(state.sessions, now);
    const lines = ['# Research notes — week of ' + localDate(weekStart(now)), '', '## Intended result', '', state.plan || '(Not set)', '',
      '## Work recorded', '', plural(sessions.length, 'session') + ' · ' + plural(Math.round(sessions.reduce((sum, item) => sum + item.durationMs, 0) / MINUTE), 'timer minute'), '',
      'Timer minutes record elapsed sessions, not a measure of attention or research quality.', ''];
    sessions.forEach(item => {
      lines.push('### ' + localDate(item.endedAt) + ' — ' + item.question, '', 'Session: ' + (item.completed ? 'full interval' : 'ended early') + ' · ' + Math.round(item.durationMs / MINUTE) + ' min', '');
      if (item.finish) lines.push('Intended outcome: ' + item.finish, '');
      lines.push('Learned: ' + (item.learned || '(No note)'), '', 'Stuck on: ' + (item.stuck || '(No note)'), '', 'Next action: ' + (item.next || '(No note)'), '');
    });
    const parked = state.later.filter(item => !item.done);
    if (parked.length) lines.push('## Parked thoughts', '', ...parked.map(item => '- ' + item.text), '');
    return lines.join('\n');
  }
  return { SCHEMA, MINUTE, createState, remaining, elapsed, advance, start, pause, endEarly, saveReview, discardReview, setRhythm, localDate, weekStart, weekSessions, restore, weeklyMarkdown, plural };
});
