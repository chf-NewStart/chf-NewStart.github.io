/* Writing keeps going when the Workspace paper scrolls under the Pencil (Houfu, Oct 2026:
   "the writing will stop, then once i lift the pencil and write again, it will be back to
   normal"). On the iPad the end of a finger flick, or a resting palm, scrolled the paper
   just after the Pencil touched down; that scroll cancelled the stroke, so the line vanished
   and the Pencil drew nothing until it was lifted. Now the stroke continues, each sample
   lands on the paper under the Pencil, and the whole line saves. The eraser keeps erasing
   across a scroll too. Real state and view code in a small page fixture.
   Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';

const html = `<!doctype html><html><head><style>
body { margin:0; } #workspacePanel { width:1000px; }
#workspaceTools { height:44px; } #workspaceScroll { width:1000px; height:650px; overflow:auto; }
#workspaceBoard { position:relative; width:1000px; height:2000px; }
#workspaceCards, #workspaceInk { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
</style></head><body><aside id="workspacePanel"><div id="workspaceTools" tabindex="0">
<button data-workspace-tool="pen">Pen</button><button data-workspace-tool="eraser">Eraser</button>
<button id="workspaceUndo"></button>
<details id="workspaceMore"><summary>More</summary><button id="workspaceRedo"></button>
<button id="workspaceMoreSpace"></button><button id="workspaceNewNote"></button>
<button id="workspaceReturn"></button></details>
<div id="workspacePenOptions"><select id="workspaceSize"><option value="2.4">Medium</option></select></div>
</div><button id="workspaceClose"></button><p id="workspaceStatus"></p>
<div id="workspaceScroll"><div id="workspaceBoard"><div id="workspaceCards"></div>
<svg id="workspaceInk"></svg></div></div></aside></body></html>`;

(async () => {
  const browser = await playwright[ENGINE].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.setContent(html);
    for (const file of ['reading-workspace.js', 'reading-ink.js', 'reading-workspace-view.js'])
      await page.addScriptTag({ path: path.join(ROOT, file) });
    await page.evaluate(() => {
      const state = { id: 'paper-a', epoch: 1, open: true, unavailable: false, busy: false, items: [], workspace: PhloemWorkspaceState.normalize() };
      const calls = { add: [], erase: [] };
      const adapter = {
        context: () => state, place: () => true, updateNote: () => true, goToSource: async () => true, removeClip: () => true,
        addNote: () => null, stickyStyle: () => ({ paper: '#eee', ink: '#333', tapeTilt: '0deg' }),
        addStroke(raw) { calls.add.push(raw); state.workspace = PhloemWorkspaceState.addStroke(state.workspace, raw, Date.now()); return true; },
        eraseStrokes(ids) { calls.erase.push(ids); state.workspace = PhloemWorkspaceState.removeStrokes(state.workspace, ids, Date.now()); return true; },
        ensureSpace: y => state.workspace.height > y, grow: () => true, close: () => {}, onTool: () => {}
      };
      const board = document.getElementById('workspaceBoard'), scroll = document.getElementById('workspaceScroll');
      // Synthetic pen events cannot take native pointer capture; the same path runs in both engines.
      board.setPointerCapture = () => {}; board.hasPointerCapture = () => false;
      const view = PhloemWorkspaceView.create(adapter);
      // The Pencil is held at a screen position; the paper may move under it.
      const emit = (type, clientX, clientY) => board.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerId: 41, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX, clientY, pressure: .6 }));
      const scrolled = top => new Promise(resolve => { scroll.addEventListener('scroll', () => resolve(), { once: true }); scroll.scrollTop = top; });
      window.fixture = { state, calls, view, board, scroll, emit, scrolled };
      view.render();
    });
    // The view lets a scroll pass for 100 ms after a note's own scrolling, timed from page load;
    // a page this young would hide the old cancellation.
    await page.waitForFunction(() => performance.now() > 300);

    // A stroke begins, the paper scrolls 240px (the tail of a flick), and the Pencil writes on.
    const pen = await page.evaluate(async () => {
      const { emit, scroll, scrolled, board } = fixture, top = scroll.getBoundingClientRect().top;
      const y = top + 200;
      emit('pointerdown', 100, y); for (let x = 110; x <= 300; x += 10) emit('pointermove', x, y);
      await scrolled(240);
      for (let x = 310; x <= 500; x += 10) emit('pointermove', x, y + Math.sin(x / 20) * 4);
      const drawing = board.classList.contains('workspace-drawing'), preview = !!document.querySelector('.workspace-ink-preview');
      emit('pointerup', 500, y);
      return { drawing, preview, scrollTop: scroll.scrollTop, strokes: fixture.calls.add.map(s => s.points.map(p => [p[0], p[1]])),
        scale: board.getBoundingClientRect().width / 1000 };
    });
    assert.equal(pen.scrollTop, 240, 'the paper scrolled during the stroke');
    assert.equal(pen.drawing, true, 'the stroke is still being written after the paper scrolled');
    assert.equal(pen.preview, true, 'and its ink is still on screen');
    assert.equal(pen.strokes.length, 1, 'one stroke saves when the Pencil lifts');
    // Paper units per screen pixel: the sheet is fitted to the pane, less any scrollbar.
    const points = pen.strokes[0], unit = 1 / pen.scale;
    const before = points.filter(p => p[0] <= 300 * unit), after = points.filter(p => p[0] > 305 * unit);
    assert(before.length > 10 && after.length > 10, 'it holds what was written before and after the scroll: ' + JSON.stringify(points));
    assert(before.every(p => Math.abs(p[1] - 200 * unit) < 1), 'samples before the scroll stay where they were written');
    assert(after.every(p => Math.abs(p[1] - 440 * unit) < 6), 'samples after it land on the paper under the Pencil (240px lower): ' + JSON.stringify(after));

    // The next stroke is unaffected.
    const next = await page.evaluate(() => {
      const { emit, scroll } = fixture, y = scroll.getBoundingClientRect().top + 300;
      emit('pointerdown', 100, y); for (let x = 110; x <= 200; x += 10) emit('pointermove', x, y); emit('pointerup', 200, y);
      return fixture.calls.add.length;
    });
    assert.equal(next, 2, 'the next stroke saves as usual');

    // An eraser sweep that crosses a scroll still erases what it passes over after the scroll.
    const erased = await page.evaluate(async () => {
      const { emit, scroll, scrolled } = fixture;
      document.querySelector('[data-workspace-tool="eraser"]').click();
      const top = scroll.getBoundingClientRect().top;
      // The first stroke now sits at paper y = 200 and 440, i.e. screen y = top - 40 and top + 200.
      emit('pointerdown', 600, top + 120); emit('pointermove', 600, top + 130);
      await scrolled(0);
      // After scrolling back, paper y = 440 is at screen top + 440.
      for (let y = top + 400; y <= top + 480; y += 8) emit('pointermove', 400, y);
      emit('pointerup', 400, top + 480);
      return { erase: fixture.calls.erase, left: fixture.state.workspace.strokes.length };
    });
    assert.equal(erased.erase.length, 1, 'the sweep erases once it lifts');
    assert.equal(erased.left, 1, 'it erased the stroke it crossed after the scroll');
    console.log(`PASS a pen stroke survives the paper scrolling under it and saves whole; the eraser keeps erasing (${ENGINE})`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
