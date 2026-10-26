(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('tomato-tip') || !$('tip-dialog')) return;
  const tips = [
    { title: 'Keep one question in view.', body: 'Make this interval small enough to finish with a clearer understanding. You can choose the next question afterward.', source: 1, credit: 'Adapted from Deep Work · Cal Newport' },
    { title: 'Choose a stopping point.', body: 'A useful note, one assumption understood, or a clearer question can be enough for this interval.', source: 1, credit: 'Our research prompt, inspired by Deep Work' },
    { title: 'An interesting idea can wait.', body: 'If you drift, make a short note and return to the task you chose. The note gives the idea somewhere to stay.', source: 4, credit: 'An adaptation of if–then planning · Gollwitzer & Sheeran' },
    { title: 'Leave room for a break.', body: 'Step away and notice what recovery you need. Short breaks may help with energy and fatigue; demanding work can need longer.', source: 5, credit: 'Paraphrased from the break research · Albulescu et al.' },
    { title: 'Give one result some room.', body: 'Keep this week’s intended result concrete. Let fewer simultaneous commitments have more of your attention.', source: 2, credit: 'Adapted from Slow Productivity · Cal Newport' },
    { title: 'Leave yourself a thread.', body: 'Before you stop, write the next small action. You’ll have a place to begin when you return.', source: 3, credit: 'Our reflection prompt, inspired by the Pomodoro method' }
  ];
  let tipIndex = Math.floor(Math.random() * tips.length);
  function showTip(next = false) {
    if (next) tipIndex = (tipIndex + 1 + Math.floor(Math.random() * (tips.length - 1))) % tips.length;
    const tip = tips[tipIndex];
    $('tip-title').textContent = tip.title; $('tip-copy').textContent = tip.body; $('tip-attribution').textContent = tip.credit;
    $('tip-source-link').href = '#source-' + tip.source;
    if (!$('tip-dialog').open) $('tip-dialog').showModal();
  }
  $('tomato-tip').addEventListener('click', () => showTip());
  $('next-tip').addEventListener('click', () => showTip(true));
  $('tip-source-link').addEventListener('click', () => $('tip-dialog').close());
  const ring = $('ring-progress'), dot = $('progress-dot'), label = $('start-label');
  function updateDial() {
    if (!ring || !dot) return;
    const offset = Math.max(0, Math.min(100, parseFloat(ring.style.strokeDashoffset) || 0));
    const angle = 2 * Math.PI * (1 - offset / 100) - Math.PI / 2;
    dot.setAttribute('cx', String(160 + 137 * Math.cos(angle)));
    dot.setAttribute('cy', String(160 + 137 * Math.sin(angle)));
    document.body.classList.toggle('timer-running', label?.textContent === 'Pause');
  }
  if (ring) new MutationObserver(updateDial).observe(ring, { attributes: true, attributeFilter: ['style'] });
  if (label) new MutationObserver(updateDial).observe(label, { childList: true, characterData: true, subtree: true });
  updateDial();
})();
