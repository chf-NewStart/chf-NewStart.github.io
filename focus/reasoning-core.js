/* Authored questions only. This module owns calendar selection and private progress, with no network or UI. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./reasoning-content.js'));
  else root.TendReasoningCore = factory(root.TendReasoningContent);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (QUESTIONS) {
  'use strict';
  const KEY = 'houfu.tend.reasoning.v1', SCHEMA = 'tend-reasoning-v1';
  const MODES = ['daily', 'practice', 'review'], STAGES = ['predict', 'check', 'explain', 'complete'];
  const MAX_ATTEMPTS = 500, MAX_DAYS = 4000, MAX_NOTES = 500;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const question = id => QUESTIONS.find(q => q.id === id);
  const text = value => typeof value === 'string' ? value.slice(0, MAX_NOTES) : '';
  const pad = n => String(n).padStart(2, '0');
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function dayKey(value = new Date()) {
    if (validDay(value)) return value;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('A valid local date is needed.');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  // Calendar arithmetic is deliberately independent of elapsed hours: DST days can have 23 or 25 hours.
  function addDays(value, amount) {
    if (!Number.isFinite(amount)) throw new Error('A valid number of calendar days is needed.');
    const day = dayKey(value), [year, month, date] = day.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, date + Math.trunc(amount)));
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }
  const dayNumber = day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const optionsFor = (q, mode) => mode === 'review' ? q.variation.options : q.options;
  const prediction = (value, q, mode) => optionsFor(q, mode).some(o => o.id === value) ? value : null;
  function emptyState() {
    return { schema: SCHEMA, daily: {}, attempts: [], dailyCompleted: {}, reviews: [], nextId: 1 };
  }
  function normalize(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object' || (raw.schema && raw.schema !== SCHEMA)) return s;
    if (raw.daily && typeof raw.daily === 'object') for (const [day, id] of Object.entries(raw.daily).slice(-MAX_DAYS)) {
      if (validDay(day) && question(id)) s.daily[day] = id;
    }
    const seen = new Set();
    if (Array.isArray(raw.attempts)) for (const a of raw.attempts.slice(-MAX_ATTEMPTS)) {
      if (!a || typeof a.id !== 'string' || a.id.length > 100 || seen.has(a.id) || !question(a.questionId) || !MODES.includes(a.mode) || !validDay(a.day)) continue;
      if (a.mode === 'daily' && a.id !== `daily:${a.day}`) continue;
      if (a.mode === 'review' && (typeof a.reviewId !== 'string' || a.id !== a.reviewId)) continue;
      const q = question(a.questionId), stage = STAGES.includes(a.stage) ? a.stage : 'predict';
      seen.add(a.id);
      s.attempts.push({ id: a.id, questionId: q.id, mode: a.mode, day: a.day,
        reviewId: a.mode === 'review' ? a.reviewId : null, stage,
        initialPrediction: prediction(a.initialPrediction, q, a.mode), finalPrediction: prediction(a.finalPrediction, q, a.mode),
        reason: text(a.reason), changedMind: text(a.changedMind),
        hintsUsed: Number.isFinite(a.hintsUsed) ? Math.min((a.mode === 'review' ? q.variation.hints || q.hints : q.hints).length, Math.max(0, Math.floor(a.hintsUsed))) : 0,
        revealed: a.revealed === true, submittedAt: stamp(a.submittedAt), completedAt: stage === 'complete' ? stamp(a.completedAt) : null,
        variationPrediction: prediction(a.variationPrediction, q, 'review'), variationRevealed: a.variationRevealed === true });
    }
    if (raw.dailyCompleted && typeof raw.dailyCompleted === 'object') for (const [day, id] of Object.entries(raw.dailyCompleted).slice(-MAX_DAYS)) {
      if (validDay(day) && id === `daily:${day}`) s.dailyCompleted[day] = id;
    }
    const reviewIds = new Set();
    if (Array.isArray(raw.reviews)) for (const r of raw.reviews.slice(-MAX_ATTEMPTS)) {
      if (!r || !validDay(r.sourceDay) || !validDay(r.dueDay) || r.id !== `review:${r.sourceDay}` || reviewIds.has(r.id) || !question(r.questionId)) continue;
      reviewIds.add(r.id);
      s.reviews.push({ id: r.id, questionId: r.questionId, sourceDay: r.sourceDay, dueDay: r.dueDay, completedAt: stamp(r.completedAt) });
    }
    s.nextId = Number.isSafeInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : 1;
    // Old valid attempts can carry their completion even if a previous app version omitted the index.
    for (const a of s.attempts) if (a.mode === 'daily' && a.stage === 'complete' && a.completedAt) s.dailyCompleted[a.day] = a.id;
    return s;
  }
  function daily(state, date = new Date()) {
    const s = normalize(state), day = dayKey(date);
    if (!own(s.daily, day)) {
      const index = ((dayNumber(day) % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
      s.daily[day] = QUESTIONS[index].id;
    }
    return { state: s, question: question(s.daily[day]) };
  }
  function start(state, { questionId, mode = 'practice', day = dayKey(), reviewId = null } = {}) {
    let s = normalize(state); day = dayKey(day);
    if (!MODES.includes(mode)) throw new Error('Unknown reasoning activity.');
    if (mode === 'daily') { const selected = daily(s, day); s = selected.state; questionId = selected.question.id; }
    if (mode === 'review') {
      const review = s.reviews.find(r => r.id === reviewId && !r.completedAt && r.dueDay <= day);
      if (!review) throw new Error('This review is not available yet.');
      questionId = review.questionId;
    }
    if (!question(questionId)) throw new Error('Choose an authored question.');
    let id = mode === 'daily' ? `daily:${day}` : mode === 'review' ? reviewId : null;
    if (mode === 'practice') {
      do {
        id = `practice:${day}:${s.nextId}`;
        s.nextId = s.nextId >= Number.MAX_SAFE_INTEGER ? 1 : s.nextId + 1;
      } while (s.attempts.some(a => a.id === id));
    }
    const existing = s.attempts.find(a => a.id === id);
    if (existing) return { state: s, attempt: existing };
    const a = { id, questionId, mode, day, reviewId: mode === 'review' ? reviewId : null, stage: 'predict',
      initialPrediction: null, finalPrediction: null, reason: '', changedMind: '', hintsUsed: 0, revealed: false,
      submittedAt: null, completedAt: null, variationPrediction: null, variationRevealed: false };
    s.attempts.push(a);
    return { state: s, attempt: a };
  }
  function update(state, id, patch = {}) {
    const s = normalize(state), a = s.attempts.find(item => item.id === id);
    if (!a || !patch || typeof patch !== 'object') return s;
    const q = question(a.questionId);
    if (a.stage === 'predict') {
      if (own(patch, 'initialPrediction')) a.initialPrediction = a.finalPrediction = prediction(patch.initialPrediction, q, a.mode);
      if (own(patch, 'reason')) a.reason = text(patch.reason);
      if (patch.stage === 'check') a.stage = 'check';
    }
    if (['predict', 'check'].includes(a.stage)) {
      if (own(patch, 'finalPrediction')) a.finalPrediction = prediction(patch.finalPrediction, q, a.mode);
      if (own(patch, 'changedMind')) a.changedMind = text(patch.changedMind);
      if (Number.isFinite(patch.hintsUsed)) a.hintsUsed = Math.min((a.mode === 'review' ? q.variation.hints || q.hints : q.hints).length, Math.max(a.hintsUsed, Math.floor(patch.hintsUsed)));
    }
    if (['explain', 'complete'].includes(a.stage)) {
      if (own(patch, 'variationPrediction') && !a.variationRevealed) a.variationPrediction = prediction(patch.variationPrediction, q, 'review');
      if (patch.variationRevealed === true) a.variationRevealed = true;
    }
    return s;
  }
  function submit(state, id, { reveal = false } = {}) {
    const s = normalize(state), a = s.attempts.find(item => item.id === id);
    if (!a || !['predict', 'check'].includes(a.stage) || (!reveal && !a.finalPrediction)) return s;
    a.stage = 'explain'; a.revealed = reveal === true; a.submittedAt = new Date().toISOString();
    return s;
  }
  function complete(state, id, date = new Date()) {
    const s = normalize(state), a = s.attempts.find(item => item.id === id);
    if (!a || !['explain', 'complete'].includes(a.stage)) return s;
    const now = validDay(date) ? new Date(...date.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)), 12) : date instanceof Date ? date : new Date(date);
    const completedAt = now.toISOString();
    a.stage = 'complete'; a.completedAt = a.completedAt || completedAt;
    if (a.mode === 'daily' && !own(s.dailyCompleted, a.day)) {
      s.dailyCompleted[a.day] = a.id;
      const reviewId = `review:${a.day}`;
      if (!s.reviews.some(r => r.id === reviewId)) s.reviews.push({ id: reviewId, questionId: a.questionId, sourceDay: a.day,
        dueDay: addDays(dayKey(now), 3), completedAt: null });
    }
    if (a.mode === 'review') {
      const review = s.reviews.find(r => r.id === a.reviewId);
      if (review) review.completedAt = review.completedAt || completedAt;
    }
    return s;
  }
  function dueReviews(state, date = new Date()) {
    const day = dayKey(date);
    return normalize(state).reviews.filter(r => !r.completedAt && r.dueDay <= day).sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  }
  function summary(state) {
    const s = normalize(state), concepts = [...new Set(QUESTIONS.map(q => q.concept))];
    return concepts.map(concept => ({ concept,
      explored: Object.keys(s.dailyCompleted).filter(day => question(s.daily[day])?.concept === concept).length +
        s.attempts.filter(a => a.mode === 'practice' && a.stage === 'complete' && question(a.questionId).concept === concept).length,
      reviewed: s.reviews.filter(r => r.completedAt && question(r.questionId).concept === concept).length
    })).filter(c => c.explored || c.reviewed);
  }
  return { KEY, SCHEMA, QUESTIONS, emptyState, normalize, dayKey, addDays, daily, start, update, submit, complete, dueReviews, summary };
});
