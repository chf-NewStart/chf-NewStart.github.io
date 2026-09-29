/* Synthetic input + a deterministic gesture clock cover draw-and-hold and
   eraser lifecycle. Real Pencil latency/palm rejection still need an iPad. */
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const path = require('path');
const browserName = process.env.PHLOEM_BROWSER || 'chromium';

(async () => {
  let browser;
  try {
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, hasTouch: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<style>body{margin:0}.pdf-page,.pdf-sheet{width:1000px;height:1000px;position:relative}.pdf-ink-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style><div id="pane"><div class="pdf-page" data-page="1"><div class="pdf-sheet"></div></div></div>');
    await page.addScriptTag({ path: path.resolve(__dirname, '..', 'reading-ink.js') });
    const results = await page.evaluate(() => {
      const results = [];
      const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
      const pane = document.getElementById('pane'), sheet = pane.querySelector('.pdf-sheet');
      const original = { setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame };
      let clock = 0, serial = 0, timers = new Map(), frames = new Map();
      window.setTimeout = (fn, delay) => { const id = ++serial; timers.set(id, { at: clock + delay, fn }); return id; };
      window.clearTimeout = id => timers.delete(id);
      window.requestAnimationFrame = fn => { const id = ++serial; frames.set(id, fn); return id; };
      window.cancelAnimationFrame = id => frames.delete(id);
      const flush = () => { const pending = Array.from(frames.values()); frames.clear(); pending.forEach(fn => fn(clock)); };
      const tick = ms => {
        const end = clock + ms;
        for (;;) {
          const next = Array.from(timers.entries()).filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          clock = next[1].at; timers.delete(next[0]); next[1].fn(); flush();
        }
        clock = end; flush();
      };
      let enabled = true, paper = 'one', tool = 'pen', color = 'black', commits = [], erases = [], events = [], strokes = [];
      const controller = PhloemInk.create({ pane, getContext: () => enabled ? { id: paper } : null,
        getTool: () => tool, getColor: () => color, getWidth: () => 3, getStrokes: () => strokes,
        onStart() {}, onCommit(page, stroke) { commits.push({ page, ...JSON.parse(JSON.stringify(stroke)) }); },
        onErasePreview(page, from, to) { events.push({ type: 'preview', page, from, to }); },
        onErase(page, ids) { events.push({ type: 'commit' }); erases.push({ page, ids, previews: events.filter(e => e.type === 'preview').length }); },
        onEraseCancel() { events.push({ type: 'clear' }); }
      });
      const pointer = (type, x, y, pointerType = 'pen', pressure = .6) => {
        const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, pointerId: 91, button: 0,
          buttons: /up|cancel/.test(type) ? 0 : 1, clientX: x, clientY: y, pressure });
        sheet.dispatchEvent(event); flush(); return event.defaultPrevented;
      };
      const touch = (type, x, y, touchType = 'stylus') => {
        const sample = { identifier: 83, target: sheet, touchType, clientX: x, clientY: y, force: .6 };
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, { changedTouches: { value: [sample] }, touches: { value: /end|cancel/.test(type) ? [] : [sample] } });
        sheet.dispatchEvent(event); flush(); return event.defaultPrevented;
      };
      const straight = () => !!sheet.querySelector('.pdf-ink-straight');
      const path = () => sheet.querySelector('.pdf-ink-preview path')?.getAttribute('d');
      const reset = () => { controller.cancel(); enabled = true; paper = 'one'; tool = 'pen'; color = 'black'; commits = []; erases = []; events = []; strokes = []; sheet.style.transform = ''; };
      const draw = () => { pointer('pointerdown', 100, 100); pointer('pointermove', 160, 113); pointer('pointermove', 220, 96); pointer('pointermove', 300, 110); };
      try {
        draw(); const freehand = path();
        tick(599);
        check('a moving/freehand preview does not snap before the 600ms hold', !straight() && commits.length === 0);
        tick(1);
        check('holding a long endpoint straightens the preview without saving', straight() && path() !== freehand && commits.length === 0 && controller.active());
        const beforeAdjustment = path(); pointer('pointermove', 360, 180);
        check('moving after the hold adjusts the straight endpoint while retaining the start', straight() && path() !== beforeAdjustment && commits.length === 0);
        pointer('pointerup', 360, 180);
        check('lifting saves exactly one two-point straight stroke', commits.length === 1 && commits[0].points.length === 2
          && commits[0].points[0][0] === .1 && commits[0].points[0][1] === .1
          && commits[0].points[1][0] === .36 && commits[0].points[1][1] === .18);
        check('straight lines use one steady pressure/width after adjusting the endpoint', commits[0].points[0][2] === commits[0].points[1][2]);
        check('lift removes preview and all pending gesture timers', !sheet.querySelector('.pdf-ink-preview') && !controller.active() && timers.size === 0);
        tick(1200); check('an expired old hold cannot duplicate the saved line', commits.length === 1);

        reset(); draw(); pointer('pointerup', 300, 110); tick(700);
        check('ordinary strokes lifted promptly retain all freehand points', commits.length === 1 && commits[0].points.length === 4 && commits[0].points[1][1] === .113);
        reset(); draw(); tick(400); pointer('pointermove', 310, 112); tick(599);
        check('meaningful endpoint movement restarts the hold countdown', !straight() && commits.length === 0);
        tick(1); check('a fresh stable endpoint still snaps after its own hold', straight());

        reset(); draw(); tick(200); pointer('pointermove', 301, 111); tick(200); pointer('pointermove', 299, 109); tick(200);
        check('small Pencil jitter does not keep postponing the hold', straight());
        pointer('pointerup', 299, 109);
        check('the held line ends at the latest jitter sample, not an old hold anchor', commits[0]?.points[1][0] === .299 && commits[0]?.points[1][1] === .109);
        reset(); pointer('pointerdown', 100, 100); tick(1600); pointer('pointerup', 100, 100);
        check('a held dot remains a single-point dot', commits.length === 1 && commits[0].points.length === 1);
        reset(); pointer('pointerdown', 100, 100); pointer('pointermove', 109, 102); pointer('pointermove', 114, 100); tick(800);
        check('tiny handwriting is not straightened by a pause', !straight()); pointer('pointerup', 114, 100);
        check('tiny handwriting retains its original shape when saved', commits[0].points.length === 3);
        reset(); pointer('pointerdown', 100, 100); pointer('pointermove', 300, 100); pointer('pointermove', 300, 300); pointer('pointermove', 100, 300); pointer('pointermove', 140, 110); tick(800);
        check('closed loops and long returning scribbles are not flattened on pause', !straight());

        for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'resize', 'scroll', 'escape', 'controller']) {
          reset(); draw(); tick(400);
          if (cancel === 'pointercancel' || cancel === 'lostpointercapture') pointer(cancel, 300, 110);
          else if (cancel === 'controller') controller.cancel();
          else if (cancel === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          else if (cancel === 'scroll') pane.dispatchEvent(new Event('scroll'));
          else window.dispatchEvent(new Event(cancel));
          tick(900);
          check(cancel + ' cancels hold without saving or leaving a preview', commits.length === 0 && !controller.active() && !sheet.querySelector('.pdf-ink-preview') && timers.size === 0);
        }
        reset(); draw(); tick(600); controller.cancel(); tick(900);
        check('cancelling an already straightened line still does not save it', commits.length === 0 && !controller.active());
        for (const invalidation of ['context', 'disabled', 'geometry', 'detached']) {
          reset(); draw(); tick(400);
          if (invalidation === 'context') paper = 'another';
          if (invalidation === 'disabled') enabled = false;
          if (invalidation === 'geometry') sheet.style.transform = 'translateX(12px)';
          if (invalidation === 'detached') sheet.remove();
          tick(400);
          check(invalidation + ' change during a hold cancels safely without a later event', commits.length === 0 && !controller.active() && !sheet.querySelector('.pdf-ink-preview') && timers.size === 0);
          if (!sheet.isConnected) pane.querySelector('.pdf-page').appendChild(sheet);
        }
        reset(); touch('touchstart', 100, 100); touch('touchmove', 200, 113); touch('touchmove', 300, 110); tick(600);
        check('the legacy stylus-touch fallback also straightens while held', straight() && commits.length === 0);
        touch('touchmove', 350, 120); touch('touchend', 350, 120);
        check('legacy stylus lifting commits one adjusted line', commits.length === 1 && commits[0].points.length === 2 && commits[0].points[1][0] === .35);
        reset(); const fingerDown = pointer('pointerdown', 100, 100, 'touch'); pointer('pointermove', 300, 110, 'touch'); tick(700);
        const directTouch = touch('touchstart', 100, 100, 'direct'); touch('touchmove', 300, 110, 'direct'); tick(700);
        check('fingers are left available for scrolling and never start hold-to-draw', !fingerDown && !directTouch && !controller.active() && commits.length === 0 && timers.size === 0);

        reset(); tool = 'eraser'; pointer('pointerdown', 100, 100); pointer('pointermove', 300, 110); tick(900);
        check('eraser sweeps send initial and segment client coordinates without a hold timer', timers.size === 0 && events.length === 2
          && events[0].from.x === 100 && events[0].to.x === 100 && events[1].from.x === 100 && events[1].to.x === 300 && events[1].page === 1);
        pointer('pointerup', 300, 110);
        check('highlight-only eraser sweeps commit even with no handwriting IDs', erases.length === 1 && erases[0].ids.length === 0 && erases[0].previews > 0);
        check('eraser commit runs before external preview candidates are cleared', events.at(-2).type === 'commit' && events.at(-1).type === 'clear');
        reset(); tool = 'eraser'; strokes = [{ id: 'ink-one', width: 3, points: [[.1, .1], [.3, .1]] }];
        pointer('pointerdown', 200, 100); pointer('pointerup', 220, 100);
        check('handwriting eraser IDs still reach the same completed gesture callback', erases.length === 1 && erases[0].ids.join() === 'ink-one');
        reset(); tool = 'eraser'; pointer('pointerdown', 100, 100); pointer('pointermove', 300, 110); pointer('pointercancel', 300, 110);
        check('cancelled erasers clear candidate previews and never commit either type', erases.length === 0 && events.at(-1).type === 'clear');
        reset(); tool = 'eraser'; pointer('pointerdown', 100, 100); paper = 'another'; pointer('pointerup', 300, 110);
        check('stale-document erasers clear preview without committing', erases.length === 0 && events.at(-1).type === 'clear');

        for (const [name, hex] of Object.entries({ black: '#20313b', blue: '#245bc1', red: '#ba3f35', green: '#24734b', purple: '#7842a3', orange: '#c26a1c', teal: '#157d86', gray: '#687782' })) {
          const normalized = PhloemInk.normalize({ 1: [{ id: name, color: name, width: 3, points: [[.1, .1], [.3, .2]], at: 1 }] }, {});
          PhloemInk.render(sheet, normalized.pages[1]);
          check(name + ' survives normalization and renders with its exact palette color', normalized.pages[1][0].color === name && sheet.querySelector('[data-ink-id="' + name + '"]').getAttribute('fill') === hex);
        }
        const invalid = PhloemInk.normalize({ 1: [{ id: 'unsafe', color: '__proto__', width: 3, points: [[.1, .1]], at: 1 }] }, {});
        check('expanded palette still rejects prototype or arbitrary color values', invalid.pages[1][0].color === 'black');
      } finally {
        controller.cancel(); Object.assign(window, original);
      }
      return results;
    });
    results.push({ name: 'fixture has no JavaScript errors', pass: errors.length === 0, detail: errors.join('; ') });
    for (const result of results) console.log((result.pass ? 'PASS' : 'FAIL') + '  ' + result.name + (result.detail ? '  [' + result.detail + ']' : ''));
    const failures = results.filter(result => !result.pass).length;
    console.log('\n' + (results.length - failures) + '/' + results.length + ' PDF hold/eraser lifecycle checks passed (' + browserName + ').');
    if (failures) process.exitCode = 1;
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
})();
