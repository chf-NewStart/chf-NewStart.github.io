// Tend's pixel look: Plank Pixel digits with a blinking colon, a stepped ring of blocks that empties
// clockwise as the interval passes, and a pixel tomato that ripens from green to red while you focus.
// It reads the timer from the page (like theme.js), so app.js and the timer engine know nothing of it.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const dial = document.querySelector('.dial'), ring = document.querySelector('.dial-ring'), progress = $('ring-progress');
  if (!dial || !ring || !progress) return;

  // k outline, r body, s shade, h highlight, G leaf, g leaf light. Drawn to match tomato-button.png.
  const TOMATO = [
    '.......GG.......',
    '....GG.GG.GG....',
    '.....GGGGGG.....',
    '...kkGGggGGkk...',
    '..krrrGggGrrrk..',
    '.krhhrrGGrrrrrk.',
    '.krhrrrrrrrrrrk.',
    'krhrrrrrrrrrrrsk',
    'krrrrrrrrrrrrrsk',
    'krrrrrrrrrrrrssk',
    '.krrrrrrrrrrssk.',
    '.krsrrrrrrrsssk.',
    '..kssssssssssk..',
    '...kkkkkkkkkk...'
  ];
  const node = (name, attributes) => {
    const element = document.createElementNS(SVG, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  };
  function tomato(className) {
    const svg = node('svg', { viewBox: '0 0 16 14', class: className, 'aria-hidden': 'true', 'shape-rendering': 'crispEdges' });
    TOMATO.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        let width = 1; while (row[x + width] === row[x]) width++;
        if (row[x] !== '.') svg.append(node('rect', { x, y, width, height: 1, class: 'px-' + row[x] }));
        x += width;
      }
    });
    return svg;
  }

  // A midpoint circle of radius 17 cells on an 8 px grid, centred in the 320 px dial, ordered clockwise
  // from 12 o'clock. Each block is an equal share of the interval.
  const points = [], seen = new Set();
  for (let x = 17, y = 0, error = 1 - 17; x >= y;) {
    [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]].forEach(([dx, dy]) => {
      if (!seen.has(dx + ',' + dy)) { seen.add(dx + ',' + dy); points.push([dx, dy]); }
    });
    y++; if (error < 0) error += 2 * y + 1; else { x--; error += 2 * (y - x) + 1; }
  }
  const turn = ([dx, dy]) => (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
  points.sort((a, b) => turn(a) - turn(b));
  const blocks = node('g', { class: 'px-ring', 'shape-rendering': 'crispEdges' });
  const cells = points.map(([dx, dy]) => node('rect', { x: 157 + dx * 8, y: 157 + dy * 8, width: 6, height: 6 }));
  blocks.append(...cells); ring.append(blocks);

  const content = dial.querySelector('.dial-content'), display = $('timer-display');
  content?.prepend(tomato('px-tomato'));
  const time = document.createElement('span'); time.className = 'px-time'; time.setAttribute('aria-hidden', 'true');
  display?.after(time);

  let lit = -1, head = null;
  function update() {
    const left = 1 - Math.max(0, Math.min(100, parseFloat(progress.style.strokeDashoffset) || 0)) / 100;
    const count = Math.ceil(left * cells.length - 1e-6);
    if (count !== lit) { cells.forEach((cell, i) => cell.classList.toggle('on', i >= cells.length - count)); lit = count; }
    const next = cells[cells.length - count] || null;
    if (next !== head) { head?.classList.remove('head'); next?.classList.add('head'); head = next; }
    dial.style.setProperty('--ripe', (1 - left).toFixed(3));
    const text = display?.textContent || '';
    if (time.dataset.text !== text) {
      time.dataset.text = text;
      time.replaceChildren(...[...text].map(character => {
        const span = document.createElement('span'); span.textContent = character;
        if (character === ':') span.className = 'px-colon';
        return span;
      }));
    }
  }
  new MutationObserver(update).observe(progress, { attributes: true, attributeFilter: ['style'] });
  if (display) new MutationObserver(update).observe(display, { childList: true, characterData: true, subtree: true });
  update();

  // Today's harvest: one small tomato per session saved today, beside the count.
  const today = $('today-sessions');
  if (today) {
    const harvest = document.createElement('span'); harvest.className = 'px-harvest'; harvest.setAttribute('aria-hidden', 'true');
    today.parentElement.before(harvest);
    const grow = () => {
      const count = Math.min(12, parseInt(today.textContent, 10) || 0);
      if (harvest.childElementCount !== count) harvest.replaceChildren(...Array.from({ length: count }, () => tomato('px-fruit')));
    };
    new MutationObserver(grow).observe(today, { childList: true, characterData: true, subtree: true }); grow();
  }
})();
