/* Tend's warm-up: six short attention tasks from the research literature (one a day) and three ways to rest.
   The pure parts (which task is today's, scores, streak, good things) are exported for tests. The rest draws into
   any element handed to TendDaily.mount, so the room's dialog and the standalone daily.html (Android) share one copy. */
(function (root) {
  'use strict';
  const KEY = 'houfu.tend.daily.v1';

  const CHALLENGES = [
    { id: 'track', kind: 'focus', name: 'Track the ripe ones', label: 'Sustained tracking', time: 'About 1½ min',
      why: 'A few tomatoes glow ripe, then turn green like the rest and start moving. Keep your eyes on them and tap them when everything stops. Each round adds one more to follow.',
      brain: 'Parietal cortex and frontal eye fields, the spotlight network that moves and holds attention.',
      note: 'Most people can keep about four moving things in mind at once. Holding three or four through a whole round is a strong result.' },
    { id: 'ripe', kind: 'focus', name: 'Only the ripe', label: 'Steady attention', time: 'About 1 min',
      why: 'Tomatoes flash one at a time. Tap for every ripe red one, and hold still when a green one shows up. Green ones are rare, which is how autopilot catches you.',
      brain: 'Right prefrontal cortex, which keeps you alert and on task when nothing new is happening.',
      note: 'Researchers use this task to catch mind-wandering. Tapping on green means your hands were running without you. A smaller wobble means a steadier mind.' },
    { id: 'flank', kind: 'focus', name: 'Middle arrow', label: 'Ignoring distraction', time: 'About 1 min',
      why: 'A row of five arrows appears. Answer which way the middle one points, and ignore its neighbours, which sometimes point the other way.',
      brain: 'Anterior cingulate cortex, the conflict detector that notices when two signals disagree.',
      note: 'The distraction cost is how much slower you get when the neighbours disagree. Everyone pays some; with practice the gap shrinks.' },
    { id: 'ink', kind: 'focus', name: 'Ink, not word', label: 'Holding back the obvious', time: 'About 1 min',
      why: 'A colour word appears in coloured ink. Tap the colour of the ink and ignore what the word says. You read faster than you name colours, so this takes effort.',
      brain: 'Anterior cingulate and lateral prefrontal cortex, which stop an automatic response so you can choose another.',
      note: 'This is the Stroop effect. Saying no to the word you read without trying is the same move as saying no to the tab you open without thinking.' },
    { id: 'back', kind: 'focus', name: 'Two back', label: 'Working memory', time: 'About 1½ min',
      why: 'A square lights up in a 3×3 grid, one after another. Tap Match when the square is in the same place as the one two steps earlier.',
      brain: 'Dorsolateral prefrontal cortex, the scratchpad for what you’re working on right now.',
      note: 'Two-back keeps a short list updating in your head: the skill of holding your question in mind while the page keeps changing.' },
    { id: 'time', kind: 'focus', name: 'Count the seconds', label: 'Time awareness', time: 'About 1½ min',
      why: 'No clock on screen. Tap Start, count silently, and tap Stop when you think the time is up. Three tries, a little longer each time.',
      brain: 'Right prefrontal cortex and basal ganglia, the interval clock that runs slow or fast when attention drifts.',
      note: 'When attention drifts, time slips. Noticing time pass helps you notice your mind wander sooner, which is what a tomato clock is for.' }
  ];
  const REST = [
    { id: 'sigh', kind: 'rest', name: 'Sigh it out', label: 'Lifts your mood', time: '1 min',
      why: 'Breathe in through your nose, then take a second short sip of air to fill right up, then let it all out slowly through your mouth. Follow the tomato. Keep it gentle: if you feel lightheaded, go back to breathing normally.',
      brain: 'In a 2023 Stanford study, five minutes a day of this “cyclic sighing” lifted people’s mood more than the same time spent on mindfulness meditation.' },
    { id: 'far', kind: 'rest', name: 'Look far away', label: 'Rests your eyes', time: '20 s',
      why: 'Find the farthest thing you can see, out of a window or across the room, at least 6 metres (20 feet) away. Tap Start, look at it and blink slowly. A chime calls you back.',
      brain: 'A close screen keeps the focusing muscles inside your eyes tight the whole time, which is part of why long sessions leave your eyes tired and your head a little dizzy. Eye doctors suggest the 20-20-20 rule: every 20 minutes, look 20 feet away for 20 seconds.' },
    { id: 'good', kind: 'rest', name: 'One good thing', label: 'Builds happiness', time: '1 min',
      why: 'Write down one thing that went well today, however small, and why it happened.',
      brain: 'In a well-known study, people who wrote down three good things and why they happened, every evening for one week, were happier and less down for six months afterwards (Seligman and colleagues, 2005).' }
  ];
  const ALL = [...CHALLENGES, ...REST];
  const GOOD_MAX = 1000, GOOD_CHARS = 500;

  const pad = n => String(n).padStart(2, '0');
  const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  // Days since 1970-01-01 in the person's own calendar, so the task changes at their midnight.
  const dayNumber = date => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  const challengeFor = date => CHALLENGES[((dayNumber(date) % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
  const yesterdayKey = date => dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));

  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
  const score = {
    track: ({ hits, total }) => clamp(100 * hits / (total || 1)),
    // Holding still on green matters more than tapping red: that is the lapse this task measures.
    ripe: ({ hitRed, red, heldGreen, green }) => clamp(40 * hitRed / (red || 1) + 60 * heldGreen / (green || 1)),
    flank: ({ correct, total, rtSame, rtOpposite }) => clamp(100 * correct / (total || 1) - Math.max(0, mean(rtOpposite) - mean(rtSame) - 30) / 6),
    ink: ({ correct, total, rtSame, rtClash }) => clamp(100 * correct / (total || 1) - Math.max(0, (rtSame.length ? mean(rtClash) - mean(rtSame) : 0) - 80) / 10),
    back: ({ hits, misses, falseAlarms, correctRejections }) => clamp(50 * (hits + misses ? hits / (hits + misses) : 1) + 50 * (correctRejections / ((correctRejections + falseAlarms) || 1))),
    time: ({ errors }) => clamp(100 - mean(errors) * 400)
  };

  function emptyState() { return { best: {}, plays: {}, streak: { count: 0, last: null }, good: [] }; }
  const cleanText = v => typeof v === 'string' ? v.trim().slice(0, GOOD_CHARS) : '';
  function normalize(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    for (const c of ALL) {
      if (c.kind === 'focus' && Number.isFinite(raw.best?.[c.id])) s.best[c.id] = clamp(raw.best[c.id]);
      if (Number.isFinite(raw.plays?.[c.id])) s.plays[c.id] = Math.max(0, Math.floor(raw.plays[c.id]));
    }
    if (Number.isFinite(raw.streak?.count) && typeof raw.streak.last === 'string') s.streak = { count: Math.max(0, Math.floor(raw.streak.count)), last: raw.streak.last };
    if (Array.isArray(raw.good)) s.good = raw.good.filter(g => g && /^\d{4}-\d{2}-\d{2}$/.test(g.d) && cleanText(g.t)).map(g => ({ d: g.d, t: cleanText(g.t), w: cleanText(g.w) })).slice(-GOOD_MAX);
    return s;
  }
  // The streak counts days on which today's task was finished; it survives until the end of the following day.
  function streakOn(state, date) { const l = state.streak.last; return l === dayKey(date) || l === yesterdayKey(date) ? state.streak.count : 0; }
  function record(state, id, value, date) {
    const s = normalize(state), prev = s.best[id];
    s.best[id] = prev == null ? value : Math.max(prev, value);
    s.plays[id] = (s.plays[id] || 0) + 1;
    if (challengeFor(date).id === id && s.streak.last !== dayKey(date)) s.streak = { count: streakOn(s, date) + 1, last: dayKey(date) };
    return { state: s, newBest: prev != null && value > prev };
  }
  function rested(state, id) { const s = normalize(state); s.plays[id] = (s.plays[id] || 0) + 1; return s; }
  function addGood(state, text, why, date) {
    const s = normalize(state), t = cleanText(text);
    if (!t) return s;
    s.good = [...s.good, { d: dayKey(date), t, w: cleanText(why) }].slice(-GOOD_MAX);
    s.plays.good = (s.plays.good || 0) + 1;
    return s;
  }
  function removeGood(state, index) { const s = normalize(state); s.good = s.good.filter((_, i) => i !== index); return s; }

  const api = { KEY, CHALLENGES, REST, dayKey, dayNumber, challengeFor, score, emptyState, normalize, streakOn, record, rested, addGood, removeGood };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  /* ---------- Saving: the app's own storage where there is one, this browser's otherwise ---------- */
  // iPhone hands the saved copy in as TEND_DAILY_STATE and keeps it in UserDefaults; Android lends TendAndroidDaily.
  let cache = null;
  function load() {
    if (cache) return cache;
    let raw = null;
    try { if (root.TendAndroidDaily) raw = JSON.parse(root.TendAndroidDaily.load() || 'null'); } catch (_) { /* Fall through. */ }
    if (raw == null && root.TEND_NATIVE && root.TEND_DAILY_STATE) raw = root.TEND_DAILY_STATE;
    if (raw == null) try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* Private mode: start fresh. */ }
    return (cache = normalize(raw));
  }
  function save(s) {
    cache = s;
    const json = JSON.stringify(s);
    try { localStorage.setItem(KEY, json); } catch (_) { /* Private mode: play still works. */ }
    try { if (root.TEND_NATIVE) root.webkit.messageHandlers.tend.postMessage({ action: 'dailySave', state: s }); } catch (_) { /* Not in the iPhone app. */ }
    try { root.TendAndroidDaily?.save(json); } catch (_) { /* Not in the Android app. */ }
  }
  root.addEventListener?.('storage', e => { if (e.key === KEY) cache = null; });
  function buzz() {
    try { if (root.TEND_NATIVE) root.webkit.messageHandlers.tend.postMessage({ action: 'feedback' }); } catch (_) { /* No haptics here. */ }
    try { root.TendAndroidDaily?.buzz(); } catch (_) { /* No haptics here. */ }
  }

  /* ---------- Sound: the room's 8-bit arpeggio, scheduled on the audio clock ---------- */
  let audio = null;
  function unlockAudio() {
    try { const A = root.AudioContext || root.webkitAudioContext; if (!audio && A) audio = new A(); if (audio && audio.state !== 'running') audio.resume().catch(() => {}); } catch (_) { /* Sound is optional. */ }
  }
  function chimeIn(seconds) {
    if (!audio || audio.state !== 'running') return () => {};
    const at = audio.currentTime + seconds;
    const nodes = [523.25, 659.25, 783.99, 1046.5].map((frequency, i) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = at + i * .11;
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.08, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + .3);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .32);
      return oscillator;
    });
    return () => nodes.forEach(n => { try { n.stop(); } catch (_) { /* Already played. */ } });
  }

  /* ---------- Drawing and play ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reducedMotion = () => !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shortDate = d => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
  const BOARD = '#060a08', GHOST = '#1d2924', GOLD = '#ffd65c';

  function drawTomato(ctx, x, y, r, ripe) {
    const s = r / 5.5, body = ripe ? '#ff5a43' : '#7fd35e', deep = ripe ? '#b8321f' : '#4b913a';
    ctx.save(); ctx.translate(Math.round(x - 6 * s), Math.round(y - 5.5 * s));
    const R = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(a * s, b * s, w * s + .5, h * s + .5); };
    R(2, 2, 8, 1, body); R(1, 3, 10, 5, body); R(2, 4, 2, 1, '#ffd3c7'); R(1, 8, 10, 1, deep); R(2, 9, 8, 1, deep);
    R(4, 10, 4, 1, '#2b0e09'); R(5, 0, 2, 1, '#2f9e57'); R(3, 1, 6, 1, '#76f7a5');
    ctx.restore();
  }

  function mount(host, options = {}) {
    let run = 0, current = null, cancelChime = () => {}, flashTimer = 0;
    const alive = t => t === run;
    host.classList.add('daily');
    host.innerHTML = `
      <div class="daily-home">
        <div class="daily-head"><p class="eyebrow" data-r="date">TODAY’S WARM-UP</p>${options.onClose ? '<button class="close-dialog icon-button" type="button" data-r="close" aria-label="Close warm-up">×</button>' : ''}</div>
        <section class="daily-today">
          <h3 class="daily-sub daily-today-sub">Today’s warm-up</h3>
          <h2 class="daily-title" data-r="name"></h2>
          <p class="daily-why" data-r="why"></p>
          <p class="daily-brain"><span>Brain</span> <span data-r="brain"></span></p>
          <p class="daily-meta"><span data-r="time"></span><span>Streak <b data-r="streak">0</b></span><span data-r="best"></span></p>
          <button class="button primary daily-go" type="button" data-r="go">▶ Start</button>
        </section>
        <section class="daily-rest-section">
          <h3 class="daily-sub">Rest</h3>
          <p class="daily-why">For breaks, or whenever your eyes feel tired or your head feels heavy.</p>
          <div class="daily-list daily-rest" data-r="rest"></div>
        </section>
        <section class="daily-practice"><h3 class="daily-sub">Practice any</h3><div class="daily-list" data-r="list"></div></section>
        <p class="small-note daily-fine">These tasks come from attention research. Practice makes you better at each one; how far that carries into everyday focus is still debated, so think of them as a warm-up before a tomato.</p>
      </div>
      <div class="daily-stage" hidden aria-live="polite">
        <div class="daily-stage-top"><h2 class="daily-title" data-r="stage-name"></h2><span class="daily-count" data-r="count"></span></div>
        <p class="daily-prompt" data-r="prompt"></p>
        <div class="daily-board" data-r="board"></div>
        <div class="daily-pad" data-r="pad"></div>
        <div class="daily-controls" data-r="controls"></div>
        <button class="text-button" type="button" data-r="quit">Stop and go back</button>
      </div>
      <div class="daily-result" hidden>
        <p class="eyebrow" data-r="r-name"></p>
        <div class="daily-score" data-r="r-score"></div>
        <div class="daily-stats" data-r="r-stats"></div>
        <p class="daily-why" data-r="r-note"></p>
        <p class="daily-brain" data-r="r-brain-line"><span data-r="r-brain-label">Brain</span> <span data-r="r-brain"></span></p>
        <div class="dialog-actions"><button class="button primary" type="button" data-r="again">Again</button><button class="button secondary" type="button" data-r="done">Done</button></div>
        <div data-r="r-extra" data-good-box></div>
      </div>`;
    const $ = k => host.querySelector(`[data-r="${k}"]`);
    const views = { home: host.querySelector('.daily-home'), stage: host.querySelector('.daily-stage'), result: host.querySelector('.daily-result') };
    const show = v => { for (const k in views) views[k].hidden = k !== v; host.scrollTop = 0; host.closest('dialog')?.scrollTo?.(0, 0); };
    const prompt = h => { $('prompt').innerHTML = h; };
    const count = t => { $('count').textContent = t; };
    const board = () => $('board');
    // A right or wrong answer lights the board's edge for a moment, long enough to see at a glance.
    function flash(ok) {
      const b = board(); clearTimeout(flashTimer); b.classList.remove('ok', 'bad'); b.classList.add(ok ? 'ok' : 'bad');
      flashTimer = setTimeout(() => b.classList.remove('ok', 'bad'), 260);
    }
    function controls(list) {
      const c = $('controls'); c.innerHTML = '';
      for (const [k, label, big] of list) { const b = el('button', 'button ' + (big === 'primary' ? 'primary' : 'secondary') + (big ? ' big' : ''), esc(label)); b.type = 'button'; b.dataset.k = k; c.appendChild(b); }
    }
    // Resolves with the chosen key (button or keyboard) and the reaction time, or null on timeout or quit.
    function waitInput(keys, ms) {
      const t = run;
      return new Promise(res => {
        let done = false; const t0 = performance.now();
        const finish = k => { if (done) return; done = true; clearTimeout(to); clearInterval(iv); $('controls').removeEventListener('pointerdown', onTap); document.removeEventListener('keydown', onKey, true); res({ k, rt: performance.now() - t0 }); };
        const onTap = e => { const b = e.target.closest('[data-k]'); if (b) { e.preventDefault(); finish(b.dataset.k); } };
        const onKey = e => { if (keys[e.key] && !e.target.closest?.('textarea,input')) { e.preventDefault(); e.stopPropagation(); finish(keys[e.key]); } };
        const to = ms ? setTimeout(() => finish(null), ms) : null;
        const iv = setInterval(() => { if (!alive(t)) finish(null); }, 100);
        $('controls').addEventListener('pointerdown', onTap); document.addEventListener('keydown', onKey, true);
      });
    }
    function canvas() {
      const b = board(); b.innerHTML = ''; const c = el('canvas'); b.appendChild(c);
      const rect = b.getBoundingClientRect(), dpr = Math.min(root.devicePixelRatio || 1, 2);
      c.width = rect.width * dpr; c.height = rect.height * dpr;
      const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
      return { c, ctx, W: rect.width, H: rect.height };
    }
    // Calls draw(progress 0→1) every frame for ms; resolves early if the run ends.
    function animate(t, ms, draw) {
      return new Promise(res => {
        const t0 = performance.now();
        const step = now => { if (!alive(t)) return res(); const p = Math.min(1, (now - t0) / ms); draw(p); if (p < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
    }
    const big = (text, color) => `<div class="daily-big"${color ? ` style="color:${color}"` : ''}>${text}</div>`;
    function goodList() {
      const good = load().good;
      if (!good.length) return '';
      const items = good.map((g, i) => ({ ...g, i })).reverse().slice(0, 30);
      return `<h3 class="daily-sub">Your good things</h3><ul class="daily-good">${items.map(g => `<li><span class="daily-good-date">${esc(shortDate(g.d))}</span><span class="daily-good-text">${esc(g.t)}</span>${g.w ? `<span class="daily-good-why">${esc(g.w)}</span>` : ''}<button class="text-button" type="button" data-remove="${g.i}" aria-label="Remove this good thing">Remove</button></li>`).join('')}</ul>${good.length > 30 ? `<p class="small-note">And ${good.length - 30} earlier.</p>` : ''}`;
    }
    host.addEventListener('click', e => {
      unlockAudio();
      const r = e.target.closest('[data-remove]');
      if (r) { save(removeGood(load(), Number(r.dataset.remove))); const box = r.closest('[data-good-box]'); if (box) box.innerHTML = goodList(); options.onChange?.(); }
    });

    const PLAY = {
      async track(t) {
        const slow = reducedMotion() ? .6 : 1, rounds = [{ n: 8, k: 2, v: 70 }, { n: 9, k: 3, v: 85 }, { n: 10, k: 4, v: 100 }];
        let hits = 0, total = 0; const per = [];
        for (let ri = 0; ri < rounds.length; ri++) {
          const R = rounds[ri]; if (!alive(t)) return;
          count(`Round ${ri + 1} of 3`); controls([]);
          const { c, ctx, W, H } = canvas(), r = Math.max(14, W / 22), balls = [];
          for (let i = 0; i < R.n; i++) {
            let b, tries = 0;
            do { b = { x: rand(r, W - r), y: rand(r, H - r) }; tries++; } while (tries < 200 && balls.some(o => Math.hypot(o.x - b.x, o.y - b.y) < r * 3));
            const a = rand(0, 6.28), v = R.v * slow * W / 360; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.target = i < R.k; balls.push(b);
          }
          let phase = 'show'; const picked = new Set();
          const draw = () => {
            ctx.fillStyle = BOARD; ctx.fillRect(0, 0, W, H);
            for (const b of balls) {
              drawTomato(ctx, b.x, b.y, r, (phase === 'show' || phase === 'reveal') && b.target);
              if (picked.has(b)) { ctx.strokeStyle = phase === 'reveal' ? (b.target ? '#76f7a5' : '#ff5a43') : GOLD; ctx.lineWidth = 3; ctx.strokeRect(b.x - r - 5, b.y - r - 5, 2 * r + 10, 2 * r + 10); }
            }
          };
          prompt(`Remember the <em>${R.k} ripe</em> tomatoes.`); draw(); await sleep(2200); if (!alive(t)) return;
          phase = 'move'; draw(); prompt('Follow them.'); await sleep(400);
          let last = performance.now(); const end = last + 7000;
          await new Promise(res => {
            const step = now => {
              if (!alive(t)) return res();
              const dt = Math.min(.05, (now - last) / 1000); last = now;
              for (const b of balls) {
                b.x += b.vx * dt; b.y += b.vy * dt;
                if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); } if (b.x > W - r) { b.x = W - r; b.vx = -Math.abs(b.vx); }
                if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy); } if (b.y > H - r) { b.y = H - r; b.vy = -Math.abs(b.vy); }
                if (Math.random() < dt * .6) { const a = Math.atan2(b.vy, b.vx) + rand(-.8, .8), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; }
              }
              // Tomatoes bounce off each other, so a target is never hidden behind another.
              for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
                const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
                if (d < 2 * r && d > 0) {
                  const nx = dx / d, ny = dy / d, p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
                  if (p > 0) { a.vx -= p * nx; a.vy -= p * ny; b.vx += p * nx; b.vy += p * ny; }
                  const o = (2 * r - d) / 2; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
                }
              }
              draw(); if (now < end) requestAnimationFrame(step); else res();
            };
            requestAnimationFrame(step);
          });
          if (!alive(t)) return;
          phase = 'pick'; prompt(`Tap the <em>${R.k}</em> you followed.`); draw();
          await new Promise(res => {
            const onTap = e => {
              const rect = c.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
              let best = null, bd = 1e9; for (const b of balls) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
              if (best && bd < r * 1.8) { picked.has(best) ? picked.delete(best) : picked.add(best); draw(); if (picked.size === R.k) { stop(); res(); } }
            };
            const iv = setInterval(() => { if (!alive(t)) { stop(); res(); } }, 100);
            const stop = () => { clearInterval(iv); c.removeEventListener('pointerdown', onTap); };
            c.addEventListener('pointerdown', onTap);
          });
          if (!alive(t)) return;
          phase = 'reveal'; draw();
          const h = [...picked].filter(b => b.target).length; hits += h; total += R.k; per.push(`${h}/${R.k}`);
          prompt(h === R.k ? 'All found.' : `Found ${h} of ${R.k}. The ripe ones are showing now.`); await sleep(1600);
        }
        return { score: score.track({ hits, total }), stats: [['Found', `${hits} of ${total}`], ['By round', per.join(' · ')]] };
      },

      async ripe(t) {
        const N = 45, G = 6, trials = shuffle(Array.from({ length: N }, (_, i) => i < G ? 'green' : 'red'));
        while (trials[0] === 'green' || trials[1] === 'green') shuffle(trials);
        controls([['tap', 'Tap · Space', true]]);
        let hitRed = 0, heldGreen = 0; const rts = [];
        for (let i = 0; i < N; i++) {
          if (!alive(t)) return;
          count(`${i + 1} / ${N}`); prompt(i < 3 ? 'Tap for <em>red</em>. Don’t tap for green.' : '');
          const { ctx, W, H } = canvas(), blank = () => { ctx.fillStyle = BOARD; ctx.fillRect(0, 0, W, H); };
          const say = (text, color) => { blank(); ctx.fillStyle = color; ctx.font = `${Math.round(W / 12)}px 'Plank Pixel', monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W / 2, H / 2); };
          blank(); drawTomato(ctx, W / 2, H / 2, W / 4, trials[i] === 'red');
          let said = false;
          const wait = waitInput({ ' ': 'tap', Enter: 'tap' }, 1100);
          setTimeout(() => { if (alive(t) && !said) { blank(); ctx.fillStyle = GHOST; ctx.fillRect(W / 2 - 12, H / 2 - 3, 24, 6); ctx.fillRect(W / 2 - 3, H / 2 - 12, 6, 24); } }, 300);
          const { k, rt } = await wait; if (!alive(t)) return;
          // Every answer gets feedback: green for a tap on red and for holding still on green, tomato for a tap on green.
          if (trials[i] === 'red') { if (k) { hitRed++; rts.push(rt); flash(true); } }
          else if (k) { said = true; flash(false); say('Hold on green', '#ff5a43'); }
          else { heldGreen++; said = true; flash(true); say('Held', '#76f7a5'); await sleep(450); if (!alive(t)) return; }
          if (k) await sleep(Math.max(0, 1100 - rt));
        }
        return { score: score.ripe({ hitRed, red: N - G, heldGreen, green: G }),
          stats: [['Green held', `${heldGreen} of ${G}`], ['Red tapped', `${hitRed} of ${N - G}`], ['Average reaction', `${Math.round(mean(rts))} ms`], ['Rhythm wobble', `± ${Math.round(sd(rts))} ms`]] };
      },

      async flank(t) {
        const N = 30; controls([['L', '◀ Left'], ['R', 'Right ▶']]);
        let correct = 0; const rtSame = [], rtOpposite = [];
        for (let i = 0; i < N; i++) {
          if (!alive(t)) return;
          count(`${i + 1} / ${N}`); prompt(i < 2 ? 'Which way does the <em>middle</em> arrow point? Arrow keys work too.' : '');
          const dir = pick(['L', 'R']), same = Math.random() < .45, side = same ? dir : (dir === 'L' ? 'R' : 'L'), ch = d => d === 'L' ? '&lt;' : '&gt;';
          board().innerHTML = big('+', GHOST); await sleep(rand(350, 650)); if (!alive(t)) return;
          board().innerHTML = `<div class="daily-arrows">${ch(side)}${ch(side)}<b>${ch(dir)}</b>${ch(side)}${ch(side)}</div>`;
          const { k, rt } = await waitInput({ ArrowLeft: 'L', ArrowRight: 'R' }, 2000); if (!alive(t)) return;
          flash(k === dir); if (k === dir) { correct++; (same ? rtSame : rtOpposite).push(rt); }
        }
        const cost = Math.round(mean(rtOpposite) - mean(rtSame));
        return { score: score.flank({ correct, total: N, rtSame, rtOpposite }),
          stats: [['Correct', `${correct} of ${N}`], ['Same-way rows', `${Math.round(mean(rtSame))} ms`], ['Opposite rows', `${Math.round(mean(rtOpposite))} ms`], ['Distraction cost', `${cost} ms`]] };
      },

      async ink(t) {
        const C = { RED: '#ff5a43', GREEN: '#76f7a5', GOLD, BLUE: '#6fb7ff' }, names = Object.keys(C), N = 28;
        controls(names.map((n, i) => [n, `${i + 1} ${n[0]}${n.slice(1).toLowerCase()}`]));
        let correct = 0; const rtSame = [], rtClash = [];
        for (let i = 0; i < N; i++) {
          if (!alive(t)) return;
          count(`${i + 1} / ${N}`); prompt(i < 2 ? 'Tap the <em>ink colour</em>. Keys 1–4 work too.' : '');
          const ink = pick(names), same = Math.random() < .25, word = same ? ink : pick(names.filter(n => n !== ink));
          board().innerHTML = ''; await sleep(300); if (!alive(t)) return;
          board().innerHTML = big(word, C[ink]);
          const { k, rt } = await waitInput({ 1: 'RED', 2: 'GREEN', 3: 'GOLD', 4: 'BLUE' }, 3000); if (!alive(t)) return;
          flash(k === ink); if (k === ink) { correct++; (same ? rtSame : rtClash).push(rt); }
        }
        return { score: score.ink({ correct, total: N, rtSame, rtClash }),
          stats: [['Correct', `${correct} of ${N}`], ['Word matches ink', rtSame.length ? `${Math.round(mean(rtSame))} ms` : '–'], ['Word clashes', `${Math.round(mean(rtClash))} ms`]] };
      },

      async back(t) {
        const N = 24, seq = [];
        for (let i = 0; i < N; i++) seq.push(i >= 2 && Math.random() < .3 ? seq[i - 2] : Math.floor(Math.random() * 9));
        controls([['M', 'Match · Space', true]]);
        let hits = 0, misses = 0, falseAlarms = 0, correctRejections = 0;
        board().innerHTML = '<div class="daily-grid">' + '<i></i>'.repeat(9) + '</div>';
        const cells = [...board().querySelectorAll('i')];
        for (let i = 0; i < N; i++) {
          if (!alive(t)) return;
          count(`${i + 1} / ${N}`); prompt(i < 3 ? 'Same place as <em>two steps back</em>? Tap Match.' : '');
          cells.forEach(c => c.classList.remove('on')); await sleep(400); if (!alive(t)) return;
          const cell = cells[seq[i]]; cell.classList.add('on'); setTimeout(() => cell.classList.remove('on'), 900);
          const { k, rt } = await waitInput({ ' ': 'M', Enter: 'M' }, 2200); if (!alive(t)) return;
          const target = i >= 2 && seq[i] === seq[i - 2];
          if (target) { if (k) { hits++; flash(true); } else { misses++; flash(false); } } else if (k) { falseAlarms++; flash(false); } else correctRejections++;
          if (k) await sleep(Math.max(0, 2200 - rt));
        }
        return { score: score.back({ hits, misses, falseAlarms, correctRejections }), stats: [['Matches caught', `${hits} of ${hits + misses}`], ['False alarms', String(falseAlarms)]] };
      },

      async time(t) {
        const targets = [10, 15, 25], errors = [];
        for (let i = 0; i < targets.length; i++) {
          if (!alive(t)) return;
          const T = targets[i]; count(`Try ${i + 1} of 3`);
          board().innerHTML = big(`${T}s`, GOLD); prompt(`Count <em>${T} seconds</em> in your head.`);
          controls([['go', 'Start · Space', true]]);
          let r = await waitInput({ ' ': 'go', Enter: 'go' }); if (!alive(t) || !r.k) return;
          board().innerHTML = big('· · ·', GHOST); prompt('Counting. Tap Stop the moment you think it’s over.');
          controls([['stop', 'Stop · Space', true]]); await sleep(150);
          const t0 = performance.now(); r = await waitInput({ ' ': 'stop', Enter: 'stop' }); if (!alive(t) || !r.k) return;
          const got = (performance.now() - t0) / 1000, e = got - T; errors.push(Math.abs(e) / T);
          board().innerHTML = big(`${got.toFixed(1)}s`);
          prompt(Math.abs(e) < .5 ? 'Spot on.' : e > 0 ? `${e.toFixed(1)} s late.` : `${(-e).toFixed(1)} s early.`);
          controls([]); await sleep(1800);
        }
        return { score: score.time({ errors }), stats: targets.map((T, i) => [`${T} s`, `${Math.round(errors[i] * 100)}% off`]) };
      },

      // Cyclic sighing: in, a short top-up, then a long slow breath out (about 10 s a breath, 6 to a minute).
      async sigh(t) {
        const { ctx, W, H } = canvas(), breaths = 6;
        const steps = [['In through the nose', 2600, .5, .86], ['A little more', 1000, .86, 1], ['Slowly out through the mouth', 6400, 1, .5]];
        const paint = size => { ctx.fillStyle = BOARD; ctx.fillRect(0, 0, W, H); drawTomato(ctx, W / 2, H / 2, W * .34 * size, true); };
        const ease = p => .5 - Math.cos(Math.PI * p) / 2;
        controls([]);
        for (let b = 0; b < breaths; b++) {
          for (const [label, ms, from, to] of steps) {
            if (!alive(t)) return;
            count(`Breath ${b + 1} of ${breaths}`); prompt(`<em>${label}</em>`);
            await animate(t, ms, p => paint(from + (to - from) * ease(p)));
          }
        }
        if (!alive(t)) return;
        save(rested(load(), 'sigh'));
        return { rest: true, headline: `${breaths} slow breaths`, again: 'One more minute', stats: [['Time', 'About a minute']] };
      },

      async far(t) {
        board().innerHTML = big('20', GOLD);
        controls([['go', 'Start · 20 s', 'primary']]);
        const r = await waitInput({ ' ': 'go', Enter: 'go' }); if (!alive(t) || !r.k) return;
        unlockAudio(); cancelChime(); cancelChime = chimeIn(20);
        controls([]); prompt('Look far away. <em>Blink slowly.</em>');
        for (let s = 20; s > 0; s--) { if (!alive(t)) return; count(`${s} s`); board().innerHTML = big(String(s), GHOST); await sleep(1000); }
        if (!alive(t)) return;
        buzz(); count('');
        save(rested(load(), 'far'));
        return { rest: true, headline: 'Welcome back', again: 'Another 20 s', stats: [] };
      },

      async good(t) {
        board().hidden = true;
        const pad = $('pad');
        pad.innerHTML = `<label for="daily-good-text">What went well today?</label><textarea id="daily-good-text" rows="2" maxlength="${GOOD_CHARS}" placeholder="e.g. The model finally ran."></textarea><label for="daily-good-why">Why did it happen? <span>optional</span></label><textarea id="daily-good-why" rows="2" maxlength="${GOOD_CHARS}" placeholder="e.g. I asked for help instead of guessing."></textarea><div class="daily-good-past" data-good-box>${goodList()}</div>`;
        controls([['save', 'Save', 'primary']]);
        while (alive(t)) {
          const r = await waitInput({}); if (!alive(t) || !r.k) return;
          const text = host.querySelector('#daily-good-text'), why = host.querySelector('#daily-good-why');
          if (!text.value.trim()) { prompt('<em>Write one thing that went well first.</em> Small counts: a good coffee, a clear paragraph.'); text.focus(); continue; }
          save(addGood(load(), text.value, why.value, new Date()));
          pad.innerHTML = '';
          return { rest: true, headline: 'Saved', again: 'Add another', stats: [], extra: goodList() };
        }
      }
    };

    let shownDay = null;
    function renderHome(resting) {
      const now = new Date(), today = challengeFor(now), s = load();
      shownDay = dayKey(now);
      views.home.classList.toggle('resting', !!resting);
      $('date').textContent = resting ? 'FOR YOUR BREAK' : `TODAY’S WARM-UP · ${now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}`;
      $('name').textContent = today.name; $('why').textContent = today.why; $('brain').textContent = today.brain;
      $('time').textContent = `${today.time} · ${today.label}`; $('streak').textContent = streakOn(s, now);
      $('best').innerHTML = s.best[today.id] != null ? `Best <b>${s.best[today.id]}</b>` : '';
      const item = (c, extra) => {
        const b = el('button', `daily-item ${c.kind}` + (c === today ? ' today' : ''));
        b.type = 'button';
        b.innerHTML = `<span class="daily-label">${esc(c.label)}</span><span class="daily-item-name">${esc(c.name)}</span><span class="daily-item-best">${esc(extra)}</span>`;
        b.addEventListener('click', () => start(c));
        return b;
      };
      $('rest').replaceChildren(...REST.map(c => item(c, c.id === 'good' && s.good.length ? `${s.good.length} saved` : c.time)));
      $('list').replaceChildren(...CHALLENGES.map(c => item(c, s.best[c.id] != null ? `Best ${s.best[c.id]}` : c.time)));
    }
    async function start(c, { skipIntro = false } = {}) {
      // A task counts for the day it was started on, even if it ends after midnight.
      const startedOn = new Date();
      cancelChime(); current = c; const t = ++run; show('stage');
      $('stage-name').textContent = c.name; prompt(esc(c.why)); count(''); controls([]);
      $('pad').innerHTML = ''; board().hidden = false; board().innerHTML = '';
      if (c.kind === 'focus') {
        if (!skipIntro) {
          board().innerHTML = big('?', GHOST); controls([['go', 'Start', 'primary']]);
          const r = await waitInput({ ' ': 'go', Enter: 'go' }); if (!alive(t) || !r.k) return;
          controls([]);
        }
        for (const n of [3, 2, 1]) { if (!alive(t)) return; board().innerHTML = big(n, GOLD); await sleep(800); }
        if (!alive(t)) return;
        prompt('');
      }
      const result = await PLAY[c.id](t); if (!alive(t) || !result) return;
      run++;
      let newBest = false;
      if (!result.rest) { const r = record(load(), c.id, result.score, startedOn); save(r.state); newBest = r.newBest; }
      $('r-name').textContent = c.name.toUpperCase() + (newBest ? ' · NEW BEST' : '');
      $('r-score').textContent = result.rest ? result.headline : result.score;
      $('r-score').classList.toggle('words', !!result.rest);
      $('r-stats').innerHTML = result.stats.map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join('');
      $('r-stats').hidden = !result.stats.length;
      $('r-note').textContent = c.note || ''; $('r-note').hidden = !c.note;
      $('r-brain-label').textContent = c.kind === 'rest' ? 'Why it helps' : 'Brain'; $('r-brain').textContent = c.brain;
      $('again').textContent = result.again || 'Again';
      $('r-extra').innerHTML = result.extra || '';
      show('result'); options.onChange?.();
    }
    let resting = false;
    function home(rest = resting) { resting = rest; run++; cancelChime(); renderHome(rest); show('home'); }
    $('go').addEventListener('click', () => start(challengeFor(new Date()), { skipIntro: true }));
    $('quit').addEventListener('click', () => home());
    $('done').addEventListener('click', () => options.onClose ? options.onClose() : home());
    $('again').addEventListener('click', () => start(current, { skipIntro: true }));
    $('close')?.addEventListener('click', () => options.onClose());
    home();
    // Left open past midnight, the home view moves on to the new day's task by itself.
    setInterval(() => { if (!views.home.hidden && shownDay !== dayKey(new Date())) renderHome(resting); }, 30000);
    return { home, stop: () => { run++; cancelChime(); } };
  }

  /* ---------- Where it lives: a strip under the timer in the room, or a page of its own ---------- */
  function room() {
    const page = document.getElementById('daily-page-root');
    if (page) {
      const close = () => { try { if (root.TendAndroidDaily) return root.TendAndroidDaily.close(); } catch (_) { /* Fall through. */ } location.href = './'; };
      mount(page, { onClose: close }).home(location.hash === '#rest');
      return;
    }
    const dialog = document.getElementById('daily-dialog'), strip = document.getElementById('daily-strip');
    if (!dialog || !strip) return;
    // During a break the strip offers rest instead of a task.
    const onBreak = () => document.body.classList.contains('is-break');
    let paintedDay = null;
    const paint = () => {
      const now = new Date(), c = challengeFor(now), n = streakOn(load(), now), rest = onBreak();
      paintedDay = dayKey(now);
      document.getElementById('daily-strip-eyebrow').textContent = rest ? 'FOR YOUR BREAK' : 'TODAY’S WARM-UP';
      document.getElementById('daily-strip-name').textContent = rest ? 'Rest your eyes and mood' : c.name;
      document.getElementById('daily-strip-meta').textContent = rest ? REST.map(r => r.name).join(' · ') : `${c.time} · ${c.label}${n ? ` · ${n}-day streak` : ''}`;
      document.getElementById('daily-open').textContent = rest ? 'Rest a minute' : 'Play the warm-up';
    };
    const game = mount(document.getElementById('daily-root'), { onClose: () => dialog.close(), onChange: paint });
    document.getElementById('daily-open').addEventListener('click', () => { game.home(onBreak()); dialog.showModal(); });
    dialog.addEventListener('close', () => { game.stop(); paint(); });
    new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });
    root.addEventListener('tend-daily-change', paint);
    root.addEventListener('tend-resume', paint);
    setInterval(() => { if (paintedDay !== dayKey(new Date())) paint(); }, 30000);
    paint();
  }

  // The room's backup takes a snapshot and hands a restored one back.
  const replace = raw => { save(normalize(raw)); root.dispatchEvent(new Event('tend-daily-change')); };
  root.TendDaily = { ...api, mount, snapshot: () => load(), replace };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', room); else room();
})(typeof self !== 'undefined' ? self : this);
