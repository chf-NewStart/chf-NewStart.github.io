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
<button data-workspace-tool="move">Move</button><button id="workspaceUndo"></button>
<details id="workspaceMore"><summary>More</summary><button id="workspaceRedo"></button>
<button id="workspaceMoreSpace"></button><button id="workspaceNewNote"></button>
<button id="workspaceReturn"></button></details>
<div id="workspacePenOptions"><select id="workspaceSize"><option value="2.4">Medium</option>
<option value="1.2">Fine</option></select><select id="workspaceNib">
<option value="marker">Marker</option><option value="natural">Natural</option></select></div>
</div><button id="workspaceClose"></button><p id="workspaceStatus"></p>
<div id="workspaceScroll"><div id="workspaceBoard"><div id="workspaceCards"></div>
<svg id="workspaceInk"></svg></div></div></aside></body></html>`;

async function fixture(browser, withClip = true) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent(html);
  for (const file of ['reading-workspace.js', 'reading-ink.js', 'reading-workspace-view.js'])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(hasClip => {
    const at = Date.now();
    const workspace = hasClip ? PhloemWorkspaceState.place(PhloemWorkspaceState.normalize(),
      'clip', { x: 40, y: 40, width: 420 }, at) : PhloemWorkspaceState.normalize();
    const state = { id: 'paper-a', epoch: 1, open: true, unavailable: false, busy: false,
      items: hasClip ? [{ id: 'clip', quote: 'A source', note: 'A note',
        anchor: { kind: 'text', para: 0, offset: 0 }, createdAt: at, updatedAt: at }] : [], workspace };
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
  }, withClip);
  return page;
}

test('medium marker ink is one continuous path; legacy natural ink remains distinct and data stays intact', async () => {
  const browser = await launch();
  try {
    const page = await fixture(browser, false);
    try {
      const result = await page.evaluate(() => {
        fixture.draw([[100, 100], [130, 125], [160, 140], [190, 180]]);
        const marker = fixture.state.workspace.strokes[0];
        const original = JSON.stringify(marker.points);
        const markerPath = document.querySelector(`[data-stroke-id="${marker.id}"]`).getAttribute('d');
        fixture.state.workspace = PhloemWorkspaceState.addStroke(fixture.state.workspace,
          { id: 'legacy', color: 'black', width: marker.width, points: marker.points }, Date.now());
        fixture.view.render();
        return { marker, original, markerPath,
          legacyPath: document.querySelector('[data-stroke-id="legacy"]').getAttribute('d'),
          after: JSON.stringify(fixture.state.workspace.strokes.find(s => s.id === marker.id).points) };
      });
      assert.equal(result.marker.width, 2.4);
      assert.equal(result.marker.nib, 'marker');
      assert.equal(result.marker.style, 'natural');
      assert.equal(await page.locator(`[data-stroke-id="${result.marker.id}"]`).count(), 1,
        'the continuous marker is one SVG path element');
      assert.match(result.markerPath, / L /, 'the marker path joins sampled points');
      assert.notEqual(result.markerPath, result.legacyPath);
      assert.equal(result.after, result.original, 'rendering does not rewrite saved pressure points');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('long hold straightens only open strokes and cancellation clears its timer', async () => {
  const browser = await launch();
  try {
    const page = await fixture(browser, false);
    try {
      await page.evaluate(() => {
        fixture.emit('pointerdown', 100, 100, 31);
        fixture.emit('pointermove', 160, 100, 31);
      });
      await page.waitForTimeout(650);
      const held = await page.evaluate(() => ({ active: fixture.view.active(), status: document.getElementById('workspaceStatus').textContent,
        adds: fixture.calls.add.length }));
      await page.evaluate(() => {
        fixture.emit('pointermove', 210, 125, 31);
        fixture.emit('pointerup', 220, 130, 31);
      });
      let result = await page.evaluate(() => fixture.state.workspace.strokes.at(-1));
      assert(result, 'held stroke was saved: ' + JSON.stringify(held));
      assert.equal(result.shape, 'line');
      assert.equal(result.points.length, 2);
      assert.deepEqual(result.points[1].slice(0, 2), [220, 130], 'endpoint adjusts after straightening');
      await page.evaluate(() => {
        fixture.emit('pointerdown', 300, 100, 32);
        fixture.emit('pointermove', 310, 100, 32);
      });
      await page.waitForTimeout(650);
      await page.evaluate(() => {
        fixture.emit('pointerup', 310, 100, 32);
        fixture.emit('pointerdown', 400, 100, 33);
        fixture.emit('pointermove', 460, 100, 33);
        fixture.emit('pointermove', 460, 160, 33);
        fixture.emit('pointermove', 400, 100, 33);
      });
      await page.waitForTimeout(650);
      await page.evaluate(() => fixture.emit('pointerup', 400, 100, 33));
      result = await page.evaluate(() => fixture.state.workspace.strokes);
      const short = result.find(s => s.points[0][0] === 300);
      const loop = result.find(s => s.points[0][0] === 400);
      assert.equal(short.shape, undefined);
      assert.equal(loop.shape, undefined);
      assert(loop.points.length > 2);
      await page.evaluate(() => {
        fixture.emit('pointerdown', 500, 100, 34);
        fixture.emit('pointermove', 570, 100, 34);
        fixture.emit('pointercancel', 570, 100, 34);
      });
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(() => fixture.calls.add.length), 3,
        'cancelled hold cannot commit later through its timer');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('ink over a note follows its move and resize; free ink stays put; eraser and undo use shown geometry', async () => {
  const browser = await launch();
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => {
        fixture.draw([[100, 95], [145, 105]], 40);
        fixture.draw([[700, 300], [750, 330]], 41);
      });
      const initial = await page.evaluate(() => {
        const strokes = fixture.state.workspace.strokes;
        const attached = strokes.find(s => s.anchor), free = strokes.find(s => !s.anchor);
        return { attached, free, attachedPath: document.querySelector(`[data-stroke-id="${attached.id}"]`).getAttribute('d'),
          freePath: document.querySelector(`[data-stroke-id="${free.id}"]`).getAttribute('d') };
      });
      assert.deepEqual(initial.attached.anchor, { clipId: 'clip', x: 40, y: 40, width: 420 });
      // Let the Pencil's synthetic-click guard expire before a separate finger/mouse action.
      await page.waitForTimeout(450);
      await page.locator('.workspace-card-handle').focus();
      await page.keyboard.press('ArrowRight');
      await page.locator('.workspace-note-menu summary').click();
      await page.locator('.workspace-note-larger').click();
      const moved = await page.evaluate(({ attachedId, freeId }) => {
        const positions = fixture.state.workspace.positions;
        const attached = fixture.state.workspace.strokes.find(s => s.id === attachedId);
        return { position: positions.clip,
          shown: PhloemWorkspaceState.displayStroke(attached, positions),
          attachedPath: document.querySelector(`[data-stroke-id="${attachedId}"]`).getAttribute('d'),
          freePath: document.querySelector(`[data-stroke-id="${freeId}"]`).getAttribute('d'),
          handleText: document.querySelector('.workspace-card-handle').textContent };
      }, { attachedId: initial.attached.id, freeId: initial.free.id });
      assert.equal(moved.position.width, 500);
      assert.equal(moved.position.x, 5);
      assert.equal(moved.handleText, '', 'six-dot handle is visual only');
      assert.notEqual(moved.attachedPath, initial.attachedPath);
      assert.equal(moved.freePath, initial.freePath);
      assert.equal(moved.shown.width, initial.attached.width * 500 / 420);
      assert.deepEqual(moved.shown.points[0].slice(0, 2),
        [5 + (initial.attached.points[0][0] - 40) * 500 / 420,
          40 + (initial.attached.points[0][1] - 40) * 500 / 420]);
      await page.locator('[data-workspace-tool="eraser"]').click();
      const erased = await page.evaluate(({ x, y }) => {
        fixture.emit('pointerdown', x, y, 42);
        fixture.emit('pointerup', x, y, 42);
        return { calls: fixture.calls.erase, ids: fixture.state.workspace.strokes.map(s => s.id) };
      }, { x: moved.shown.points[0][0], y: moved.shown.points[0][1] });
      assert(erased.calls.some(ids => ids.includes(initial.attached.id)));
      assert(erased.ids.includes(initial.free.id));
      await page.locator('#workspaceUndo').click();
      const restored = await page.evaluate(() => fixture.state.workspace.strokes.find(s => s.anchor));
      assert(restored && restored.id !== initial.attached.id);
      assert.deepEqual(restored.anchor, initial.attached.anchor);
      assert.equal(restored.nib, 'marker');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('drag handle remains usable and ink near the bottom asks for growing paper', async () => {
  const browser = await launch();
  try {
    const page = await fixture(browser);
    try {
      const moved = await page.locator('.workspace-card-handle').evaluate(handle => {
        handle.setPointerCapture = () => {};
        const rect = handle.getBoundingClientRect(), x = rect.left + 8, y = rect.top + 8;
        const emit = (type, clientX, clientY) => handle.dispatchEvent(new PointerEvent(type,
          { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 50,
            button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX, clientY }));
        emit('pointerdown', x, y); emit('pointermove', x + 30, y + 25); emit('pointerup', x + 30, y + 25);
        return { box: fixture.state.workspace.positions.clip, calls: fixture.calls.place.length };
      });
      assert.equal(moved.calls, 1);
      assert.equal(moved.box.x, 70);
      assert.equal(moved.box.y, 65);
      await page.evaluate(() => {
        document.getElementById('workspaceScroll').scrollTop = 1350;
        fixture.draw([[700, 1900], [750, 1930]], 51);
      });
      const grown = await page.evaluate(() => ({ height: fixture.state.workspace.height,
        ensure: fixture.calls.ensure, stroke: fixture.state.workspace.strokes[0] }));
      assert(grown.ensure.some(y => y > 2000));
      assert.equal(grown.height, 3000);
      assert(grown.stroke.points[1][1] >= 1930);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
