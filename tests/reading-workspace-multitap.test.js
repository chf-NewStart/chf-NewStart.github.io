/* Two-finger tap Undo and three-finger tap Redo for workspace handwriting.
   Synthetic touch PointerEvents cover application routing in Chromium and WebKit;
   they do not replace a physical iPad multi-touch and palm check. */
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

async function tapFixture(browser) {
  const page = await fixture(browser);
  await page.evaluate(() => {
    const scroll = document.getElementById('workspaceScroll');
    // Fingers on blank paper, a touch helper that can hold, move and release contacts.
    window.touch = {
      at(x, y) { const rect = document.getElementById('workspaceBoard').getBoundingClientRect(); return { x: rect.left + x, y: rect.top + y }; },
      send(type, id, x, y, target) {
        const point = this.at(x, y);
        const node = target || document.elementFromPoint(point.x, point.y) || scroll;
        node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true,
          pointerType: 'touch', pointerId: id, isPrimary: id === 101, button: 0,
          buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
          clientX: point.x, clientY: point.y }));
      },
      tap(points, { moveBy = 0, holdMs = 0, target } = {}) {
        const ids = points.map((_, index) => 101 + index);
        points.forEach(([x, y], index) => this.send('pointerdown', ids[index], x, y, target));
        if (moveBy) points.forEach(([x, y], index) => this.send('pointermove', ids[index], x + moveBy, y, target));
        const release = () => points.forEach(([x, y], index) => this.send('pointerup', ids[index], x + moveBy, y, target));
        if (!holdMs) { release(); return Promise.resolve(); }
        return new Promise(resolve => setTimeout(() => { release(); resolve(); }, holdMs));
      }
    };
    window.liveStrokes = () => fixture.state.workspace.strokes
      .filter(stroke => Number((fixture.state.workspace.deleted || {})[stroke.id] || 0) < Number(stroke.updatedAt || 0)).length;
  });
  return page;
}
const BLANK = [[600, 900], [700, 900]];

test('two-finger tap undoes and three-finger tap redoes workspace handwriting', async () => {
  const browser = await launch();
  try {
    const page = await tapFixture(browser);
    try {
      const result = await page.evaluate(async () => {
        const out = {};
        await touch.tap([[600, 900], [700, 900]]);
        out.emptyStatus = document.getElementById('workspaceStatus').textContent;
        fixture.draw([[560, 760], [620, 790], [690, 800]]);
        fixture.draw([[560, 840], [620, 860], [690, 870]], 31);
        out.drawn = liveStrokes();
        await touch.tap([[600, 900], [700, 900]]);
        out.afterUndo = liveStrokes();
        out.undoStatus = document.getElementById('workspaceStatus').textContent;
        out.redoEnabled = !document.getElementById('workspaceRedo').disabled;
        await touch.tap([[600, 900], [700, 900], [800, 900]]);
        out.afterRedo = liveStrokes();
        out.redoStatus = document.getElementById('workspaceStatus').textContent;
        await touch.tap([[600, 900], [700, 900]]);
        await touch.tap([[600, 900], [700, 900]]);
        out.afterTwoUndos = liveStrokes();
        out.undoDisabled = document.getElementById('workspaceUndo').disabled;
        // A one-finger tap is ordinary paper contact, never history.
        await touch.tap([[600, 900]]);
        out.afterSingle = liveStrokes();
        await new Promise(resolve => setTimeout(resolve, 1600));
        out.statusLater = document.getElementById('workspaceStatus').textContent;
        return out;
      });
      assert.equal(result.emptyStatus, 'Nothing to undo in Workspace', 'an empty history explains the silent gesture');
      assert.equal(result.drawn, 2);
      assert.equal(result.afterUndo, 1, 'two fingers undo the latest stroke only');
      assert.equal(result.undoStatus, 'Undid last workspace change');
      assert.equal(result.redoEnabled, true, 'the rail Redo reflects gesture history');
      assert.equal(result.afterRedo, 2, 'three fingers redo it');
      assert.equal(result.redoStatus, 'Redid workspace change');
      assert.equal(result.afterTwoUndos, 0);
      assert.equal(result.undoDisabled, true);
      assert.equal(result.afterSingle, 0);
      assert.equal(result.statusLater, '', 'gesture feedback clears itself');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('moving, slow, scrolled, palm-during-pen and form-control taps never change history', async () => {
  const browser = await launch();
  try {
    const page = await tapFixture(browser);
    try {
      const result = await page.evaluate(async () => {
        const out = {};
        fixture.draw([[560, 760], [620, 790], [690, 800]]);
        await touch.tap([[600, 900], [700, 900]], { moveBy: 20 });
        out.moved = liveStrokes();
        await touch.tap([[600, 900], [700, 900]], { holdMs: 520 });
        out.slow = liveStrokes();
        const scroll = document.getElementById('workspaceScroll');
        touch.send('pointerdown', 101, 600, 900); touch.send('pointerdown', 102, 700, 900);
        scroll.scrollTop += 40;
        touch.send('pointerup', 101, 600, 900); touch.send('pointerup', 102, 700, 900);
        out.scrolled = liveStrokes();
        scroll.scrollTop = 0;
        // Palm contacts resting while the Pencil writes.
        touch.send('pointerdown', 101, 600, 900); touch.send('pointerdown', 102, 700, 900);
        fixture.draw([[200, 760], [260, 790], [330, 800]], 44);
        touch.send('pointerup', 101, 600, 900); touch.send('pointerup', 102, 700, 900);
        out.palm = liveStrokes();
        const summary = document.querySelector('.workspace-note-menu summary');
        const rect = summary.getBoundingClientRect();
        for (const [type, id] of [['pointerdown', 101], ['pointerdown', 102], ['pointerup', 101], ['pointerup', 102]])
          summary.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id,
            clientX: rect.left + 10, clientY: rect.top + 10, buttons: type === 'pointerdown' ? 1 : 0 }));
        out.control = liveStrokes();
        touch.send('pointerdown', 101, 600, 900); touch.send('pointerdown', 102, 700, 900);
        touch.send('pointercancel', 101, 600, 900); touch.send('pointerup', 102, 700, 900);
        out.cancelled = liveStrokes();
        // After all of that, a clean tap still works.
        await touch.tap([[600, 900], [700, 900]]);
        out.clean = liveStrokes();
        return out;
      });
      assert.equal(result.moved, 1, 'a two-finger pan or pinch is not a tap');
      assert.equal(result.slow, 1, 'a two-finger hold is not a tap');
      assert.equal(result.scrolled, 1, 'a tap that scrolled the paper is not a tap');
      assert.equal(result.palm, 2, 'resting fingers during a Pencil stroke keep both strokes');
      assert.equal(result.control, 2, 'taps on note controls stay with the control');
      assert.equal(result.cancelled, 2, 'a system-cancelled contact voids the tap');
      assert.equal(result.clean, 1, 'a later clean two-finger tap undoes the newest stroke');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('with the lasso tool active, a two-finger tap still undoes and leaves no lasso behind', async () => {
  const browser = await launch();
  try {
    const page = await tapFixture(browser);
    try {
      const result = await page.evaluate(async () => {
        fixture.draw([[560, 760], [620, 790], [690, 800]]);
        document.querySelector('[data-workspace-tool="select"]').click();
        const capture = document.getElementById('workspaceBoard').setPointerCapture;
        document.getElementById('workspaceBoard').setPointerCapture = () => {};
        await touch.tap([[600, 900], [700, 900]]);
        document.getElementById('workspaceBoard').setPointerCapture = capture;
        return { strokes: liveStrokes(), lasso: document.querySelectorAll('.workspace-lasso-preview').length,
          status: document.getElementById('workspaceStatus').textContent };
      });
      assert.equal(result.strokes, 0, 'the second finger cancels the lasso and the tap undoes');
      assert.equal(result.lasso, 0, 'no partial lasso outline remains');
      assert.equal(result.status, 'Undid last workspace change');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('native Chromium touch streams undo with two fingers but a two-finger pan does not', { skip: ENGINE !== 'chromium' && 'CDP touch input is Chromium-only' }, async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true });
    const page = await fixture({ newPage: options => context.newPage(options) });
    try {
      await page.evaluate(() => {
        fixture.draw([[560, 260], [620, 290], [690, 300]]);
        fixture.draw([[560, 340], [620, 360], [690, 370]], 31);
      });
      const count = () => page.evaluate(() => document.querySelectorAll('#workspaceInk [data-stroke-id]').length);
      assert.equal(await count(), 2);
      const session = await context.newCDPSession(page);
      const box = await page.locator('#workspaceScroll').boundingBox();
      const y = box.y + 420, x1 = box.x + 560, x2 = x1 + 100;
      const point = (x, id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: .5 });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(x1, 1)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(x1, 1), point(x2, 2)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.querySelectorAll('#workspaceInk [data-stroke-id]').length === 1);
      for (let step = 1; step <= 4; step++) {
        const touchPoints = step === 1 ? [point(x1, 1), point(x2, 2)] : [{ ...point(x1, 1), y: y - step * 12 }, { ...point(x2, 2), y: y - step * 12 }];
        await session.send('Input.dispatchTouchEvent', { type: step === 1 ? 'touchStart' : 'touchMove', touchPoints });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
      assert.equal(await count(), 1, 'a moving two-finger contact is navigation, not Undo');
    } finally { await context.close(); }
  } finally { await browser.close(); }
});
