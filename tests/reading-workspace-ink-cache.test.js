/* The Workspace keeps one SVG path per stroke between renders (v194). These cases came from
   the v194 review: a synced stroke that wins a merge with the same clock must repaint, the
   paths must keep the stored stroke order (which one covers an overlap), and a new stroke
   must not regenerate the paths of strokes that did not change. Real state and view code
   in a small page fixture. */
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const launch = () => playwright[ENGINE].launch({ headless: true,
  ...(ENGINE === 'webkit' && process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH
    ? { executablePath: process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH }
    : ENGINE === 'chromium' && process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH } : {}) });

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
    const merged = await page.evaluate(() => {
      const at = Date.now();
      const a = { id: 'equal-clock', color: 'black', width: 2.4, style: 'natural', createdAt: at, updatedAt: at, points: [[100, 100, .6], [200, 150, .6]] };
      fixture.state.workspace = PhloemWorkspaceState.normalize({ ...fixture.state.workspace, strokes: [a] }); fixture.view.render();
      const node = document.querySelector('[data-stroke-id="equal-clock"]'), before = node.getAttribute('d'), fillBefore = node.getAttribute('fill');
      const right = PhloemWorkspaceState.normalize({ ...fixture.state.workspace, strokes: [{ ...a, color: 'red', points: [[500, 500, .6], [600, 550, .6]] }] });
      fixture.state.workspace = PhloemWorkspaceState.merge(fixture.state.workspace, right); fixture.view.render();
      const live = fixture.state.workspace.strokes[0], rendered = document.querySelector('[data-stroke-id="equal-clock"]');
      return { winner: live.color, samePath: rendered.getAttribute('d') === before, sameFill: rendered.getAttribute('fill') === fillBefore };
    });
    if (merged.winner === 'red') {
      assert.equal(merged.samePath, false, 'an equal-clock merge winner repaints its new points');
      assert.equal(merged.sameFill, false, 'and its new color');
    } else assert.equal(merged.samePath, true);

    const edits = await page.evaluate(() => {
      const at = Date.now(), base = { id: 'edit-me', color: 'black', width: 2.4, style: 'natural', createdAt: at, updatedAt: at, points: [[100, 300, .6], [220, 340, .6]] };
      fixture.state.workspace = PhloemWorkspaceState.normalize({ ...fixture.state.workspace, strokes: [base] }); fixture.view.render();
      const path = () => document.querySelector('[data-stroke-id="edit-me"]').getAttribute('d');
      const plain = path();
      // The marker nib changes the outline without changing the clock.
      fixture.state.workspace = { ...fixture.state.workspace, strokes: fixture.state.workspace.strokes.map(s => ({ ...s, nib: 'marker' })) }; fixture.view.render();
      const marker = path();
      // A stroke edited in place (same object, same clock) moves on screen too.
      fixture.state.workspace.strokes[0].points.forEach(p => { p[0] += 0.4; p[1] += 250; }); fixture.view.render();
      const moved = path();
      // A rolling hash of the coordinates collides: +1 on x and -31 on y leaves x*31+y alone.
      fixture.state.workspace.strokes[0].points[0][0] += 1; fixture.state.workspace.strokes[0].points[0][1] -= 31; fixture.view.render();
      return { markerRepainted: marker !== plain, movedRepainted: moved !== marker, collisionRepainted: path() !== moved };
    });
    assert.equal(edits.collisionRepainted, true, 'a change a coordinate hash would miss still repaints the stroke');
    assert.equal(edits.markerRepainted, true, 'a nib change repaints the stroke');
    assert.equal(edits.movedRepainted, true, 'an in-place coordinate change repaints the stroke');

    const order = await page.evaluate(() => {
      const at = Date.now(), geometry = { width: 2.4, style: 'natural', createdAt: at, updatedAt: at, points: [[100, 100, .6], [200, 150, .6]] };
      fixture.state.workspace = PhloemWorkspaceState.normalize({ ...fixture.state.workspace, strokes: [{ ...geometry, id: 'z-stroke', color: 'black' }] }); fixture.view.render();
      const remote = PhloemWorkspaceState.normalize({ ...fixture.state.workspace, strokes: [{ ...geometry, id: 'a-stroke', color: 'red' }] });
      fixture.state.workspace = PhloemWorkspaceState.merge(fixture.state.workspace, remote); fixture.view.render();
      const dom = () => [...document.querySelectorAll('[data-stroke-id]')].map(n => n.dataset.strokeId);
      const live = dom(); fixture.view.reset(); fixture.view.render();
      return { saved: fixture.state.workspace.strokes.map(s => s.id), live, reloaded: dom() };
    });
    assert.deepEqual(order.live, order.saved, 'overlapping ink stacks in stored order');
    assert.deepEqual(order.reloaded, order.saved, 'and the same after a reset');

    const kept = await page.evaluate(() => {
      const at = Date.now(), strokes = Array.from({ length: 300 }, (_, i) => ({ id: 's' + String(i).padStart(4, '0'), color: 'black', width: 2.4, style: 'natural',
        createdAt: at, updatedAt: at, points: [[20 + i % 30 * 30, 40 + Math.floor(i / 30) * 40, .6], [40 + i % 30 * 30, 60 + Math.floor(i / 30) * 40, .6]] }));
      fixture.state.workspace = PhloemWorkspaceState.normalize({ ...PhloemWorkspaceState.normalize(), strokes }); fixture.view.render();
      const before = new Map([...document.querySelectorAll('[data-stroke-id]')].map(n => [n.dataset.strokeId, { node: n, d: n.getAttribute('d') }]));
      fixture.draw([[300, 900], [340, 930], [380, 950]]); fixture.view.render();
      const after = [...document.querySelectorAll('[data-stroke-id]')];
      const reused = after.filter(n => before.has(n.dataset.strokeId) && before.get(n.dataset.strokeId).node === n && before.get(n.dataset.strokeId).d === n.getAttribute('d')).length;
      return { before: before.size, after: after.length, reused, order: after.map(n => n.dataset.strokeId).join() === fixture.state.workspace.strokes.map(s => s.id).join() };
    });
    assert.equal(kept.after, kept.before + 1, 'one stroke adds one path');
    assert.equal(kept.reused, kept.before, 'every unchanged path stays the same element with the same outline');
    assert.equal(kept.order, true, 'the new path takes its stored place');
    await page.close();
    console.log('PASS cached ink repaints merge winners, keeps stored order, and leaves unchanged paths alone');
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
