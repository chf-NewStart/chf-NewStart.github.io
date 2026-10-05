/* A tap releases a workspace lasso selection: fingers from anywhere, Pencil and
   mouse from outside it. Synthetic PointerEvents cover routing in Chromium and
   WebKit; a physical iPad and Apple Pencil check is still needed. */
const test = require('node:test');
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
body { margin:0; } .workspace-selection-box { position:absolute; z-index:3; } .workspace-selection-box[hidden] { display:none; } .workspace-lasso-layer { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; } #workspacePanel { width:1000px; }
#workspaceTools { height:44px; } #workspaceScroll { width:1000px; height:650px; overflow:auto; }
#workspaceBoard { position:relative; width:1000px; height:2000px; }
#workspaceCards, #workspaceInk { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.workspace-card { position:absolute; display:flex; flex-direction:column; min-height:178px; pointer-events:auto; background:white; }
.workspace-card-body { flex:1; min-width:0; touch-action:none; }
.workspace-card-actions { position:absolute; top:100%; right:0; display:grid; width:164px; background:white; }
.workspace-card-actions button { min-height:44px; }
</style></head><body><aside id="workspacePanel"><div id="workspaceTools" tabindex="0">
<button data-workspace-tool="pen">Pen</button><button data-workspace-tool="eraser">Eraser</button>
<button data-workspace-tool="move">Move</button><button data-workspace-tool="select">Lasso</button><button id="workspaceUndo"></button>
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


const box = page => page.evaluate(() => {
  const node = document.querySelector('.workspace-selection-box');
  if (!node || node.hidden) return null;
  const b = node.getBoundingClientRect(), board = document.getElementById('workspaceBoard').getBoundingClientRect();
  return { x: b.left - board.left, y: b.top - board.top, width: b.width, height: b.height };
});
async function lassoStroke(page) {
  await page.evaluate(() => {
    document.querySelector('[data-workspace-tool="select"]').click();
    fixture.draw([[540, 740], [720, 740], [720, 820], [540, 820], [540, 740]], 50);
  });
  const selected = await box(page);
  assert(selected, 'the lasso selected the free stroke');
  return selected;
}
async function tap(page, x, y, pointerType, pointerId) {
  await page.evaluate(({ x, y, pointerType, pointerId }) => {
    fixture.emit('pointerdown', x, y, pointerId, pointerType);
    fixture.emit('pointerup', x, y, pointerId, pointerType);
  }, { x, y, pointerType, pointerId });
}
const status = page => page.locator('#workspaceStatus').textContent();

test('a finger tap releases the lasso inside or outside; Pencil only from outside', async () => {
  const browser = await launch();
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => fixture.draw([[560, 760], [620, 790], [690, 800]]));
      const strokes = () => page.evaluate(() => JSON.stringify(fixture.state.workspace.strokes));
      const before = await strokes();

      await lassoStroke(page);
      await tap(page, 850, 1200, 'touch', 61);
      assert.equal(await box(page), null, 'finger tap outside releases the selection');
      assert.equal(await status(page), '', 'releasing on purpose shows no "Nothing selected" warning');

      let selected = await lassoStroke(page);
      await tap(page, selected.x + selected.width / 2, selected.y + selected.height / 2, 'touch', 62);
      assert.equal(await box(page), null, 'finger tap inside also releases the selection');

      selected = await lassoStroke(page);
      await tap(page, selected.x + selected.width / 2, selected.y + selected.height / 2, 'pen', 63);
      assert(await box(page), 'a Pencil tap inside keeps the selection for dragging');
      await tap(page, 850, 1200, 'pen', 64);
      assert.equal(await box(page), null, 'a Pencil tap outside releases it');
      assert.equal(await status(page), '');

      selected = await lassoStroke(page);
      await tap(page, 850, 1200, 'mouse', 65);
      assert.equal(await box(page), null, 'a mouse click outside releases it');

      assert.equal(await strokes(), before, 'tapping never moves or changes saved ink');
      assert.equal(await page.locator('#workspaceUndo').isDisabled(), false, 'release adds no history: the stroke is still the latest Undo');
      const undoDepth = await page.evaluate(() => { document.getElementById('workspaceUndo').click(); return fixture.state.workspace.strokes
        .filter(s => Number((fixture.state.workspace.deleted || {})[s.id] || 0) < Number(s.updatedAt || 0)).length; });
      assert.equal(undoDepth, 0, 'Undo after releases removes the stroke itself');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
