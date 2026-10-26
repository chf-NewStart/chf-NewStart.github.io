(() => {
  'use strict';
  const C = window.TendCore;
  const KEY = 'houfu.tend.v1';
  const $ = id => document.getElementById(id);
  const native = !!window.TEND_NATIVE;
  const post = (action, payload = {}) => window.webkit?.messageHandlers?.tend?.postMessage({ action, ...payload });
  let state, view = 'focus', quiet = false, reviewId = null, restoredBackup = null;
  let audio = null, alarm = null, wakeLock = null, wakeRequested = false, toastTimeout, lastTick = '', discardArmed = 0;
  let notificationPermission = 'notDetermined';
  const CHIME_LEVEL = .16, LATE_CHIME_MS = native ? 2000 : 90000, canNotify = !native && 'Notification' in window;
  try {
    const stored = native ? window.TEND_INITIAL_STATE : localStorage.getItem(KEY);
    state = stored ? C.restore(stored) : C.createState();
  } catch (error) {
    state = C.createState();
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = 'Saved data could not be opened. A new notebook is shown; your previous saved copy has not been changed. Restore a backup in Settings if you have one.';
  }
  function toast(message) {
    clearTimeout(toastTimeout); $('toast').textContent = message; $('toast').classList.add('show');
    toastTimeout = setTimeout(() => $('toast').classList.remove('show'), 4000);
  }
  function persist() {
    try {
      if (native) post('save', { state }); else localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      $('storage-warning').hidden = false;
      $('storage-warning').textContent = 'Your latest changes are only in memory because device storage could not be updated. Export a backup in Settings before leaving.';
    }
  }
  function commit(next, refresh = true) { state = next; persist(); if (refresh) render(); }
  const uid = () => window.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);
  function syncField(id, value) { if (document.activeElement !== $(id) && $(id).value !== value) $(id).value = value; }
  function audioReady() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext; if (!audio && Audio) audio = new Audio();
      if (audio?.state === 'running') scheduleAlarm(); else audio?.resume().then(scheduleAlarm, () => {});
    } catch (_) { /* Sound is optional. */ }
  }
  function tones(at, peak) {
    // A soft 8-bit arpeggio (C E G C on a triangle wave, like an old console), then once more, quieter.
    return [0, 1.25].flatMap((pass, round) => [523.25, 659.25, 783.99, 1046.5].map((frequency, i) => [pass + i * .11, frequency, round ? .6 : 1])).map(([delay, frequency, level]) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = at + delay;
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, start);
      if (peak) { gain.gain.linearRampToValueAtTime(peak * level, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + .3); }
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .32);
      return oscillator;
    });
  }
  function chime() {
    if (!state.settings.sound || audio?.state !== 'running') return;
    try { tones(audio.currentTime, CHIME_LEVEL); } catch (_) { /* A missing chime does not affect the timer. */ }
  }
  // The chime is scheduled ahead on the audio clock, which keeps time in a background tab while page timers are
  // throttled. Its first note also wakes the page (silently when sound is off) to show the reflection on time.
  function cancelAlarm(stopNodes = true) {
    if (alarm && stopNodes) alarm.nodes.forEach(node => { try { node.onended = null; node.stop(); node.disconnect(); } catch (_) { /* Already finished. */ } });
    alarm = null;
  }
  function scheduleAlarm() {
    const timer = state.timer;
    if (timer.status !== 'running' || audio?.state !== 'running') { cancelAlarm(); return; }
    const key = [timer.id, timer.phase, timer.endAt, state.settings.sound].join('|'), at = audio.currentTime + C.remaining(timer) / 1000;
    if (alarm && alarm.key === key && Math.abs(alarm.at - at) < .5) return;
    cancelAlarm();
    try {
      alarm = { key, timer: timer.id + timer.phase + timer.endAt, at, nodes: tones(at, state.settings.sound ? CHIME_LEVEL : 0) };
      alarm.nodes[0].onended = () => reconcile();
    } catch (_) { alarm = null; }
  }
  function notice(phase, late) {
    if (!canNotify || !state.settings.notify || late > 5 * C.MINUTE || Notification.permission !== 'granted' || document.hasFocus()) return;
    const title = phase === 'break' ? 'A little room to begin again' : 'A moment to gather';
    const options = { body: phase === 'break' ? 'Your break has finished. Return when you’re ready.' : 'Your focus interval has finished. Leave yourself a thread for next time.', icon: 'icon-192.png', tag: 'tend-session' };
    try { const note = new Notification(title, options); note.onclick = () => { window.focus(); note.close(); }; }
    catch (_) { navigator.serviceWorker?.ready.then(registration => registration.showNotification(title, options)).catch(() => {}); }
  }
  async function syncWakeLock() {
    if (native) return;
    const wanted = state.settings.keepAwake && state.timer.status === 'running' && !document.hidden;
    if (!wanted && wakeLock) { const old = wakeLock; wakeLock = null; await old.release().catch(() => {}); }
    if (wanted && !wakeLock && !wakeRequested && navigator.wakeLock) {
      wakeRequested = true;
      try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (_) { /* The OS can decline. */ }
      finally { wakeRequested = false; }
    }
  }
  function reconcile() {
    const next = C.advance(state);
    if (next !== state) {
      const ended = state.timer, late = Date.now() - ended.endAt;
      const rang = !!alarm && alarm.timer === ended.id + ended.phase + ended.endAt && alarm.at <= audio.currentTime + .05;
      cancelAlarm(!rang); commit(next); post('feedback');
      if (!rang && late < LATE_CHIME_MS) chime();
      notice(ended.phase, late);
      if (ended.phase === 'break') toast('Break finished. Begin again when you’re ready.');
    }
    scheduleAlarm(); renderTimer();
  }
  function renderTimer() {
    const timer = state.timer, isBreak = timer.phase === 'break', reviewing = timer.status === 'review';
    const ms = C.remaining(timer), totalSeconds = Math.ceil(ms / 1000);
    const time = String(Math.floor(totalSeconds / 60)).padStart(2, '0') + ':' + String(totalSeconds % 60).padStart(2, '0');
    const signature = time + timer.status + timer.phase;
    if (signature !== lastTick) {
      $('timer-display').textContent = time;
      $('timer-display').setAttribute('aria-label', Math.floor(totalSeconds / 60) + ' minutes and ' + totalSeconds % 60 + ' seconds remaining');
      document.title = timer.status === 'running' ? time + ' · ' + (isBreak ? 'Breathe' : 'Focus') + ' — Tend' : timer.status === 'paused' ? time + ' · Paused — Tend' : reviewing ? '✓ Time to reflect — Tend' : 'Tend — a little room to focus';
      lastTick = signature;
    }
    $('ring-progress').style.strokeDashoffset = String(100 * (1 - ms / timer.durationMs));
    $('timer-kind').textContent = isBreak ? 'A LITTLE BREATHING ROOM' : 'FOCUS SESSION';
    $('timer-state').textContent = reviewing ? 'READY TO REFLECT' : timer.status === 'paused' ? 'PAUSED' : isBreak ? 'TAKE A BREATH' : timer.status === 'running' ? 'STAY WITH THIS' : 'SETTLE IN';
    $('timer-caption').textContent = reviewing ? 'leave yourself a thread' : isBreak ? 'look away, stretch, get some water' : 'one question at a time';
    $('start-label').textContent = reviewing ? 'Reflect on this session' : timer.status === 'running' ? 'Pause' : timer.status === 'paused' ? 'Continue' : isBreak ? 'Start break' : 'Start focusing';
    $('start-symbol').textContent = reviewing ? '↳' : timer.status === 'running' ? 'Ⅱ' : '▶';
    $('timer-end').hidden = !['running', 'paused'].includes(timer.status) && !isBreak;
    $('timer-end').textContent = isBreak ? 'Skip break · return to focus' : 'Finish early & reflect';
    document.body.classList.toggle('is-break', isBreak);
  }
  function makeThought(item) {
    const li = document.createElement('li'); li.classList.toggle('done', item.done);
    const toggle = document.createElement('button'); toggle.className = 'thought-toggle'; toggle.setAttribute('aria-pressed', String(item.done));
    toggle.setAttribute('aria-label', (item.done ? 'Mark as unreviewed: ' : 'Mark as reviewed: ') + item.text);
    toggle.append(document.createElement('span'));
    toggle.addEventListener('click', () => commit({ ...state, later: state.later.map(thought => thought.id === item.id ? { ...thought, done: !thought.done } : thought) }));
    const content = document.createElement('span'); content.className = 'thought-text'; content.textContent = item.text;
    const remove = document.createElement('button'); remove.className = 'thought-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Delete thought: ' + item.text);
    remove.addEventListener('click', () => commit({ ...state, later: state.later.filter(thought => thought.id !== item.id) }));
    li.append(toggle, content, remove); return li;
  }
  function renderThoughts() {
    const open = state.later.filter(item => !item.done);
    $('later-preview').replaceChildren(...open.slice(-2).map(makeThought));
    $('later-all').replaceChildren(...[...state.later].reverse().map(makeThought));
    $('later-empty').hidden = !!state.later.length; $('clear-done').hidden = !state.later.some(item => item.done);
    $('parked-count').textContent = open.length ? open.length + ' to return to' : '';
    $('later-more').hidden = open.length <= 2; $('later-more').textContent = 'See all ' + open.length + ' in Notebook →';
    $('note-count').hidden = !open.length; $('note-count').textContent = open.length;
  }
  function renderSessions() {
    const today = state.sessions.filter(item => C.localDate(item.endedAt) === C.localDate());
    const todayMinutes = Math.round(today.reduce((sum, item) => sum + item.durationMs, 0) / C.MINUTE);
    $('today-sessions').textContent = today.length; $('today-sessions-word').textContent = today.length === 1 ? 'session' : 'sessions';
    $('today-minutes').textContent = todayMinutes; $('today-minutes-word').textContent = todayMinutes === 1 ? 'minute' : 'minutes';
    const week = C.weekSessions(state.sessions), start = C.weekStart(), chart = $('week-chart');
    const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(start); date.setDate(date.getDate() + i); return date; });
    const minutes = days.map(date => week.filter(item => C.localDate(item.endedAt) === C.localDate(date)).reduce((sum, item) => sum + item.durationMs, 0) / C.MINUTE);
    const max = Math.max(25, ...minutes);
    chart.replaceChildren(...days.map((date, i) => {
      const day = document.createElement('div'); day.className = 'chart-day'; day.classList.toggle('today', C.localDate(date) === C.localDate());
      const label = document.createElement('span'); label.className = 'chart-label'; label.textContent = date.toLocaleDateString(undefined, { weekday: 'narrow' });
      const bar = document.createElement('span'); bar.className = 'chart-bar'; bar.style.height = Math.max(3, minutes[i] / max * 100) + '%';
      day.title = date.toLocaleDateString(undefined, { weekday: 'long' }) + ': ' + Math.round(minutes[i]) + ' minutes'; day.append(bar, label); return day;
    }));
    chart.setAttribute('aria-label', days.map((date, i) => date.toLocaleDateString(undefined, { weekday: 'long' }) + ' ' + Math.round(minutes[i]) + ' minutes').join(', '));
    $('week-summary').textContent = week.length ? C.plural(week.length, 'session') + ' · ' + C.plural(Math.round(minutes.reduce((a, b) => a + b, 0)), 'minute') + ' recorded. A thread you’re building.' : 'Your first session belongs here.';
    const container = $('session-list'); container.replaceChildren();
    if (!state.sessions.length) {
      const empty = document.createElement('div'); empty.className = 'session-empty';
      const title = document.createElement('h3'); title.textContent = 'Small discoveries belong here.';
      const description = document.createElement('p'); description.className = 'small-note'; description.textContent = 'Finish a session and leave a few words for your future self.';
      const button = document.createElement('button'); button.className = 'button secondary'; button.textContent = 'Choose your first question →'; button.onclick = () => { changeView('focus'); $('question').focus(); };
      empty.append(title, description, button); container.append(empty); return;
    }
    [...state.sessions].reverse().forEach(item => {
      const card = document.createElement('article'); card.className = 'session-card';
      const meta = document.createElement('div'); meta.className = 'session-meta';
      const date = document.createElement('time'); date.dateTime = item.endedAt; date.textContent = new Date(item.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const minutes = document.createElement('span'); minutes.textContent = Math.round(item.durationMs / C.MINUTE) + ' min';
      const kind = document.createElement('span'); kind.textContent = item.completed ? 'Full interval' : 'Ended early'; meta.append(date, minutes, kind);
      const heading = document.createElement('h3'); heading.textContent = item.question; card.append(meta, heading);
      if (item.finish) { const finish = document.createElement('p'); finish.className = 'intended-outcome'; finish.textContent = item.finish; card.append(finish); }
      const notes = document.createElement('dl');
      [['Learned', item.learned], ['Stuck on', item.stuck], ['Next small action', item.next]].forEach(([label, value]) => {
        if (!value) return; const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; notes.append(dt, dd);
      });
      if (!notes.children.length) { const note = document.createElement('p'); note.className = 'small-note'; note.textContent = 'Session saved without reflection notes.'; card.append(note); }
      else card.append(notes); container.append(card);
    });
  }
  function showReview() {
    if (!state.pending) return;
    changeView('focus', false);
    if (reviewId !== state.pending.id) {
      $('learned').value = state.pending.learned; $('stuck').value = state.pending.stuck; $('next').value = state.pending.next; reviewId = state.pending.id;
    }
    $('review-summary').textContent = (state.pending.completed ? 'Interval finished' : 'Session ended early') + ' · ' + C.plural(Math.round(state.pending.durationMs / C.MINUTE), 'minute') + ' recorded. ' + state.pending.question;
    if (!$('review-dialog').open) $('review-dialog').showModal();
  }
  function render() {
    renderTimer();
    const locked = state.timer.phase === 'focus' && state.timer.status !== 'idle';
    syncField('question', locked ? state.timer.task.question : state.task.question); syncField('finish', locked ? state.timer.task.finish : state.task.finish);
    $('question').disabled = locked; $('finish').disabled = locked;
    document.querySelector('label[for=question]').textContent = locked ? 'Your question for this session' : 'What’s your one question or task?';
    syncField('weekly-plan', state.plan);
    const editable = state.timer.status === 'idle' && state.timer.phase === 'focus';
    document.querySelectorAll('[data-focus]').forEach(button => { button.disabled = !editable; button.setAttribute('aria-pressed', String(Number(button.dataset.focus) === state.settings.focus && Number(button.dataset.break) === state.settings.short)); });
    $('custom-rhythm').disabled = !editable;
    $('timer-footnote').replaceChildren(document.createTextNode(state.timer.phase === 'break' ? 'A little distance from the work. ' : state.settings.focus + ' minutes of focus, then ' + state.settings.short + ' to breathe. '));
    const source = document.createElement('a'); source.href = state.timer.phase === 'break' ? '#source-5' : '#source-3'; source.className = 'citation'; source.textContent = state.timer.phase === 'break' ? '[5]' : '[3]'; source.setAttribute('aria-label', 'Read the source for this practice'); $('timer-footnote').append(source);
    const dots = state.completedCount % 4 || (state.timer.phase === 'break' && state.completedCount > 0 ? 4 : 0);
    [...$('cycle').children].forEach((dot, i) => dot.classList.toggle('filled', i < dots));
    $('cycle').setAttribute('aria-label', dots + ' of 4 full sessions toward a longer break');
    $('sound-toggle').checked = state.settings.sound; $('awake-toggle').checked = state.settings.keepAwake;
    $('notify-toggle').checked = canNotify && state.settings.notify && Notification.permission === 'granted';
    renderThoughts(); renderSessions(); syncWakeLock(); scheduleAlarm();
    if (state.pending) showReview(); else if ($('review-dialog').open) $('review-dialog').close();
  }
  function changeView(next, updateHash = true) {
    if (!['focus', 'notebook', 'sources'].includes(next)) next = 'focus';
    if (next !== 'focus' && quiet) setQuiet(false);
    view = next;
    ['focus', 'notebook', 'sources'].forEach(name => {
      $('view-' + name).hidden = name !== view;
      $('tab-' + name).setAttribute('aria-selected', String(name === view)); $('tab-' + name).tabIndex = name === view ? 0 : -1;
    });
    if (updateHash && location.protocol !== 'file:') history.replaceState(null, '', '#' + view);
  }
  function setQuiet(value) {
    quiet = value; if (value) changeView('focus');
    document.body.classList.toggle('quiet', value); $('quiet-close').hidden = !value;
    $('quiet-open').setAttribute('aria-pressed', String(value));
  }
  function openSettings() {
    $('setting-focus').value = state.settings.focus; $('setting-short').value = state.settings.short; $('setting-long').value = state.settings.long;
    const locked = state.timer.status !== 'idle' || state.timer.phase !== 'focus';
    ['setting-focus', 'setting-short', 'setting-long', 'save-rhythm'].forEach(id => $(id).disabled = locked);
    $('rhythm-hint').textContent = locked ? 'Finish the current session or break before changing durations.' : 'Longer break after every four full sessions. Adjust the rhythm to your work.';
    $('settings-dialog').showModal(); if (native) post('notificationStatus');
  }
  function toggleTimer() {
    audioReady(); reconcile();
    if (state.pending) { showReview(); return; }
    if (state.timer.status === 'running') commit(C.pause(state));
    else {
      if (state.timer.phase === 'focus' && !state.task.question.trim()) { $('start-question').value = ''; $('start-dialog').showModal(); $('start-question').focus(); return; }
      commit(C.start(state, Date.now(), uid()));
      // iOS asks once, the first time a focus session starts: reminders are how a locked phone hears the end.
      if (native && state.timer.phase === 'focus' && notificationPermission === 'notDetermined') post('enableNotifications');
    }
  }
  function finishReview(takeBreak) {
    let next = C.saveReview(state, { learned: $('learned').value, stuck: $('stuck').value, next: $('next').value }, takeBreak);
    if (takeBreak) next = C.start(next, Date.now(), uid());
    commit(next); reviewId = null; toast(takeBreak ? 'Session saved. Take a little breathing room.' : 'Session saved. There’s a thread to come back to.');
  }
  function download(contents, filename, type) {
    if (native) { post('share', { contents, filename, type }); return; }
    const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  $('timer-start').addEventListener('click', toggleTimer);
  $('timer-end').addEventListener('click', () => {
    if (state.timer.phase === 'break' && state.timer.status === 'idle') commit({ ...state, timer: C.setRhythm(C.createState(), state.settings.focus, state.settings.short, state.settings.long).timer });
    else commit(C.endEarly(state));
  });
  $('question').addEventListener('input', () => commit({ ...state, task: { ...state.task, question: $('question').value } }, false));
  $('finish').addEventListener('input', () => commit({ ...state, task: { ...state.task, finish: $('finish').value } }, false));
  $('weekly-plan').addEventListener('input', () => commit({ ...state, plan: $('weekly-plan').value }, false));
  ['learned', 'stuck', 'next'].forEach(id => $(id).addEventListener('input', () => { if (state.pending) commit({ ...state, pending: { ...state.pending, [id]: $(id).value } }, false); }));
  $('later-form').addEventListener('submit', event => {
    event.preventDefault(); const thought = $('later-input').value.trim(); if (!thought) { $('later-input').focus(); return; }
    if (state.later.length >= 1000) { toast('Review or remove some parked thoughts before adding more.'); return; }
    commit({ ...state, later: [...state.later, { id: uid(), text: thought, done: false }] }); $('later-input').value = ''; toast('Parked. Come back to your question.');
  });
  $('clear-done').addEventListener('click', () => commit({ ...state, later: state.later.filter(item => !item.done) }));
  $('later-more').addEventListener('click', () => { changeView('notebook'); $('later-all').scrollIntoView({ block: 'center' }); });
  document.querySelectorAll('[data-focus]').forEach(button => button.addEventListener('click', () => commit(C.setRhythm(state, Number(button.dataset.focus), Number(button.dataset.break)))));
  $('custom-rhythm').addEventListener('click', openSettings); $('settings-open').addEventListener('click', openSettings);
  $('rhythm-form').addEventListener('submit', event => {
    event.preventDefault(); if (!$('rhythm-form').reportValidity()) return;
    commit(C.setRhythm(state, Number($('setting-focus').value), Number($('setting-short').value), Number($('setting-long').value)));
    $('settings-dialog').close(); toast('Your rhythm is set.');
  });
  $('sound-toggle').addEventListener('change', () => { audioReady(); commit({ ...state, settings: { ...state.settings, sound: $('sound-toggle').checked } }); });
  $('awake-toggle').addEventListener('change', () => commit({ ...state, settings: { ...state.settings, keepAwake: $('awake-toggle').checked } }));
  $('notify-toggle').addEventListener('change', async () => {
    let on = $('notify-toggle').checked;
    if (on && Notification.permission !== 'granted') {
      try { on = await Notification.requestPermission() === 'granted'; } catch (_) { on = false; }
      if (!on) toast('Notifications are blocked for this site. Allow them in your browser’s site settings.');
    }
    commit({ ...state, settings: { ...state.settings, notify: on } });
  });
  $('review-form').addEventListener('submit', event => { event.preventDefault(); audioReady(); finishReview(true); });
  $('review-save-close').addEventListener('click', () => finishReview(false));
  $('review-discard').addEventListener('click', () => {
    if (Date.now() - discardArmed > 4000) {
      discardArmed = Date.now(); $('review-discard').textContent = 'Press again to discard it';
      setTimeout(() => { if (Date.now() - discardArmed >= 4000) $('review-discard').textContent = 'Don’t save this session'; }, 4100); return;
    }
    discardArmed = 0; $('review-discard').textContent = 'Don’t save this session';
    commit(C.discardReview(state)); reviewId = null; toast('Session not saved. Your question is still here.');
  });
  $('start-form').addEventListener('submit', event => {
    event.preventDefault(); const question = $('start-question').value.trim(); if (!question) { $('start-question').focus(); return; }
    $('start-dialog').close(); commit({ ...state, task: { ...state.task, question } }); toggleTimer();
  });
  $('review-dialog').addEventListener('cancel', event => event.preventDefault());
  $('quiet-open').addEventListener('click', () => setQuiet(true)); $('quiet-close').addEventListener('click', () => setQuiet(false));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.view)));
  document.querySelector('.tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const names = ['focus', 'notebook', 'sources'], i = names.indexOf(view);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
    changeView(names[next]); $('tab-' + names[next]).focus();
  });
  document.addEventListener('click', event => {
    const source = event.target.closest('a[href^="#source-"]'); if (!source) return;
    event.preventDefault(); changeView('sources', false); const id = source.getAttribute('href').slice(1);
    requestAnimationFrame(() => { $(id)?.scrollIntoView({ block: 'center' }); $(id)?.focus({ preventScroll: true }); });
    if (location.protocol !== 'file:') history.replaceState(null, '', '#' + id);
  });
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); changeView('focus'); });
  $('export-week').addEventListener('click', () => download(C.weeklyMarkdown(state), 'tend-week-' + C.localDate(C.weekStart()) + '.md', 'text/markdown'));
  $('export-backup').addEventListener('click', () => download(JSON.stringify(state, null, 2), 'tend-backup-' + C.localDate() + '.json', 'application/json'));
  $('import-backup').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('This backup is too large to open here.');
      restoredBackup = C.restore(await file.text()); if (restoredBackup.timer.status === 'running') restoredBackup = C.pause(restoredBackup);
      $('settings-dialog').close(); $('restore-dialog').showModal();
    } catch (error) { toast(error.message || 'This backup could not be opened.'); }
    event.target.value = '';
  });
  $('restore-confirm').addEventListener('click', () => { if (!restoredBackup) return; $('restore-dialog').close(); commit(restoredBackup); restoredBackup = null; toast('Notebook restored.'); });
  $('enable-reminders').addEventListener('click', () => post(notificationPermission === 'denied' ? 'openSettings' : 'enableNotifications'));
  window.TendNativeStatus = result => {
    notificationPermission = result.notifications;
    $('notification-status').textContent = result.notifications === 'authorized' || result.notifications === 'provisional' ? 'Enabled. iOS notification and Focus settings still apply.' : result.notifications === 'denied' ? 'Disabled in iOS Settings. You can change this there.' : 'Optional reminders when the app is in the background.';
    $('enable-reminders').textContent = result.notifications === 'denied' ? 'Open Settings' : result.notifications === 'authorized' || result.notifications === 'provisional' ? 'Enabled' : 'Enable';
    $('enable-reminders').disabled = ['authorized', 'provisional'].includes(result.notifications);
  };
  window.TendNativeError = message => { $('storage-warning').hidden = false; $('storage-warning').textContent = String(message); };
  window.TendNativeToast = message => toast(String(message));
  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' && view === 'focus' && !event.target.closest('button,a')) { event.preventDefault(); toggleTimer(); }
    if (event.key.toLowerCase() === 'q') { event.preventDefault(); setQuiet(!quiet); }
    if (event.key.toLowerCase() === 'l') { event.preventDefault(); setQuiet(false); changeView('focus'); $('later-input').focus(); }
    if (event.key === 'Escape' && quiet) setQuiet(false);
  });
  window.addEventListener('storage', event => { if (native || event.key !== KEY || !event.newValue) return; try { state = C.restore(event.newValue); render(); } catch (_) { /* Keep this tab's usable state. */ } });
  document.addEventListener('visibilitychange', () => { reconcile(); syncWakeLock(); });
  window.addEventListener('tend-resume', () => { reconcile(); if (native) post('notificationStatus'); });
  window.addEventListener('pagehide', persist);
  // After a reload mid-session, the first touch or key lets the chime play again.
  ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, () => { if (state.timer.status === 'running') audioReady(); }, true));
  $('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('native-reminders').hidden = !native; $('web-timer-note').hidden = native; $('notify-row').hidden = !canNotify;
  const hash = location.hash.slice(1); changeView(hash.startsWith('source-') ? 'sources' : hash, false);
  render(); if (native) { post('ready'); persist(); }
  if (hash.startsWith('source-')) requestAnimationFrame(() => $(hash)?.scrollIntoView());
  setInterval(reconcile, 250);
  if (!native && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
})();
