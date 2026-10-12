/* Writing stays quick on a full Workspace (Galaxy tablet feedback, Oct 2026). The stroke
   being written draws in its own layer, not inside the SVG that holds every saved stroke;
   a lift adds one path without re-reading every other stroke; and the eraser tests only
   the strokes near it, yet still erases exactly what it touches. Real state and view code
   in a small page fixture. Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const launch = () => playwright[ENGINE].launch({ headless: true });

const html = `<!doctype html><html><head><style>
body { margin:0; } #workspacePanel { width:1000px; }
#workspaceTools { height:44px; } #workspaceScroll { width:1000px; height:650px; overflow:auto; }
#workspaceBoard { position:relative; width:1000px; height:2000px; }
#workspaceCards, #workspaceInk { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.workspace-card { position:absolute; display:flex; flex-direction:column; min-height:178px; pointer-events:auto; background:white; }
.workspace-card-body { flex:1; min-width:0; touch-action:none; }
.workspace-card-actions { position:absolute; top:100%; right:0; display:grid; width:164px; background:white; }
.workspace-card-actions button { min-height:44px; }
</style></head><body><aside id="workspacePanel"><div id="workspaceTools" tabindex="0">
<button data-workspace-tool="pen">Pen</button><button data-workspace-tool="eraser">Eraser</button>
<button data-workspace-tool="move">Move</button><button id="workspaceUndo"></button>
<details id="workspaceMore"><summary>More</summary><button id="workspaceRedo"></button>
<button id="workspaceMoreSpace"></button><button id="workspaceNewNote"></button>
<button id="workspaceReturn"></button></details>
<div id="workspacePenOptions"><select id="workspaceSize"><option value="2.4">Medium</option>
<option value="1.2">Fine</option></select></div>
</div><button id="workspaceClose"></button><p id="workspaceStatus"></p>
<div id="workspaceScroll"><div id="workspaceBoard"><div id="workspaceCards"></div>
<svg id="workspaceInk"></svg></div></div></aside></body></html>`;

async function fixture(browser, withClip = true, savedWorkspace = null) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent(html);
  for (const file of ['reading-workspace.js', 'reading-ink.js', 'reading-workspace-view.js'])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(({ hasClip, savedWorkspace }) => {
    const at = Date.now();
    const workspace = hasClip ? PhloemWorkspaceState.place(PhloemWorkspaceState.normalize(),
      'clip', { x: 40, y: 40, width: 420 }, at) : PhloemWorkspaceState.normalize();
    const state = { id: 'paper-a', epoch: 1, open: true, unavailable: false, busy: false,
      items: hasClip ? [{ id: 'clip', quote: 'A source', note: 'A note',
        anchor: { kind: 'text', para: 0, offset: 0 }, createdAt: at, updatedAt: at }] : [],
      workspace: savedWorkspace ? PhloemWorkspaceState.normalize(JSON.parse(savedWorkspace)) : workspace };
    const calls = { add: [], erase: [], place: [], ensure: [] };
    let placeClock = at;
    const adapter = {
      context: () => state,
      place(id, box) {
        calls.place.push({ id, box: { ...box } });
        state.workspace = PhloemWorkspaceState.place(state.workspace, id, box, ++placeClock);
        return true;
      },
      updateNote: () => true, goToSource: async () => true, removeClip: () => true,
      addNote: () => null, stickyStyle: () => ({ paper: '#eee', ink: '#333', tapeTilt: '0deg' }),
      addStroke(raw) {
        calls.add.push(raw);
        state.workspace = PhloemWorkspaceState.addStroke(state.workspace, raw, Date.now());
        return true;
      },
      eraseStrokes(ids) {
        calls.erase.push(ids);
        state.workspace = PhloemWorkspaceState.removeStrokes(state.workspace, ids, Date.now());
        return true;
      },
      ensureSpace(y) {
        calls.ensure.push(y);
        while (state.workspace.height <= y && state.workspace.height < PhloemWorkspaceState.MAX_HEIGHT)
          state.workspace = PhloemWorkspaceState.setHeight(state.workspace, state.workspace.height + 1000);
        return state.workspace.height > y;
      },
      grow: () => true, close: () => {}, onTool: () => {}
    };
    const board = document.getElementById('workspaceBoard');
    // Synthetic pen events are deliberately used to cover the same path in both engines.
    board.setPointerCapture = () => {}; board.hasPointerCapture = () => false;
    const view = PhloemWorkspaceView.create(adapter);
    window.fixture = { state, calls, view, pointer: 30,
      emit(type, x, y, pointerId = 30, pointerType = 'pen') {
        const rect = board.getBoundingClientRect();
        board.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
          pointerId, pointerType, isPrimary: true, button: 0,
          buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
          clientX: rect.left + x, clientY: rect.top + y, pressure: .6 }));
      },
      draw(points, pointerId = 30) {
        this.emit('pointerdown', points[0][0], points[0][1], pointerId);
        for (const [x, y] of points.slice(1)) this.emit('pointermove', x, y, pointerId);
        this.emit('pointerup', points.at(-1)[0], points.at(-1)[1], pointerId);
      }
    };
    view.render();
  }, { hasClip: withClip, savedWorkspace });
  return page;
}

(async () => {
  const browser = await launch();
  try {
    const page = await fixture(browser, false);
    await page.evaluate(() => {
      let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, at = Date.now(), strokes = [];
      for (let i = 0; i < 600; i++) { const x0 = 40 + (i % 15) * 60, y0 = 60 + Math.floor(i / 15) * 45, pts = [];
        for (let k = 0; k < 12; k++) pts.push([x0 + k * 1.2, y0 + Math.sin(k + i) * 6, .5 + rnd() * .3]);
        strokes.push({ id: 'old-' + i, color: 'black', width: 2.4, style: 'natural', createdAt: at, updatedAt: at, points: pts }); }
      fixture.state.workspace = PhloemWorkspaceState.normalize({ ...fixture.state.workspace, strokes }); fixture.view.render();
    });
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 600);

    // While writing, the live stroke is in its own layer over the ink, with the same viewBox.
    const live = await page.evaluate(() => {
      fixture.emit('pointerdown', 120, 1300); for (let k = 1; k < 20; k++) fixture.emit('pointermove', 120 + k * 6, 1300 + k * 2);
      return new Promise(resolve => requestAnimationFrame(() => { const preview = document.querySelector('.workspace-ink-preview'), layer = preview && preview.parentNode, ink = document.getElementById('workspaceInk');
        resolve({ inInk: !!preview && ink.contains(preview), layer: layer && layer.getAttribute('class'), sameBox: layer && layer.getAttribute('viewBox') === ink.getAttribute('viewBox'), drawn: !!(preview && preview.getAttribute('d')),
          box: layer && JSON.stringify(layer.getBoundingClientRect()) === JSON.stringify(ink.getBoundingClientRect()) }); }));
    });
    assert.deepEqual(live, { inInk: false, layer: 'workspace-live-ink', sameBox: true, drawn: true, box: true }, 'the live stroke draws in its own layer, exactly over the ink');

    // Lifting adds one path without re-reading (stringifying) every saved stroke.
    const lift = await page.evaluate(() => {
      const original = JSON.stringify; let calls = 0; JSON.stringify = function () { calls++; return original.apply(this, arguments); };
      try { fixture.emit('pointerup', 234, 1338); } finally { JSON.stringify = original; }
      return { calls, paths: document.querySelectorAll('#workspaceInk path[data-stroke-id]').length, last: document.querySelector('#workspaceInk path[data-stroke-id]:last-of-type').dataset.strokeId,
        preview: document.querySelectorAll('.workspace-ink-preview').length, saved: fixture.state.workspace.strokes.length };
    });
    assert.equal(lift.paths, 601, 'the new stroke is on the sheet'); assert.equal(lift.saved, 601);
    assert(!lift.last.startsWith('old-'), 'and stacks on top, in stored order');
    assert.equal(lift.preview, 0, 'the live stroke is gone once saved');
    assert(lift.calls < 20, `a lift does not re-read all 600 saved strokes (${lift.calls} serialisations)`);

    // The eraser erases exactly the strokes it crosses, found through its local index.
    await page.evaluate(() => document.querySelector('[data-workspace-tool="eraser"]').click());
    const erased = await page.evaluate(() => {
      const target = fixture.state.workspace.strokes.find(s => s.id === 'old-205'), [x, y] = target.points[6];
      const board = document.getElementById('workspaceBoard'), r = board.getBoundingClientRect(), sx = r.width / 1000, sy = r.height / Number(board.dataset.logicalHeight || 2000);
      fixture.emit('pointerdown', x * sx, (y - 14) * sy); fixture.emit('pointermove', x * sx, y * sy); fixture.emit('pointermove', x * sx, (y + 14) * sy); fixture.emit('pointerup', x * sx, (y + 14) * sy);
      const left = new Set(fixture.state.workspace.strokes.map(s => s.id));
      return { gone: ['old-205'].filter(id => !left.has(id)), alsoGone: [...Array(600).keys()].map(i => 'old-' + i).filter(id => id !== 'old-205' && !left.has(id)).length,
        paths: document.querySelectorAll('#workspaceInk path[data-stroke-id]').length, faded: [...document.querySelectorAll('#workspaceInk path')].filter(p => p.style.opacity).length };
    });
    assert.deepEqual(erased.gone, ['old-205'], 'the crossed stroke is erased');
    assert.equal(erased.alsoGone, 0, 'and no stroke it did not touch');
    assert.equal(erased.paths, 600); assert.equal(erased.faded, 0, 'nothing is left faded');
    console.log(`PASS live stroke in its own layer; lift re-reads ${lift.calls} values, not 600 strokes; eraser removes exactly the crossed stroke (${ENGINE})`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
