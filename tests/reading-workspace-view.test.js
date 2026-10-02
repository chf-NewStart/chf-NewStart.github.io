/* Minimal browser fixture for workspace draft and ink safety. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const html = `<!doctype html><html><head><style>
body { margin:0; } #workspacePanel { width:1000px; }
#workspaceTools { height:44px; } #workspaceScroll { width:1000px; height:650px; overflow:auto; }
#workspaceBoard { position:relative; width:1000px; height:2000px; }
#workspaceCards, #workspaceInk { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.workspace-card { position:absolute; pointer-events:auto; background:white; }
</style></head><body>
<aside id="workspacePanel"><div id="workspaceTools">
  <button type="button" data-workspace-tool="pen">Pen</button>
  <button type="button" data-workspace-tool="eraser">Eraser</button>
  <select id="workspaceSize"><option value="1.2">Fine</option></select>
</div><button id="workspaceUndo"></button><button id="workspaceRedo"></button>
<button id="workspaceMoreSpace"></button><button id="workspaceNewNote"></button>
<button id="workspaceClose"></button><p id="workspaceStatus"></p>
<div id="workspaceScroll"><div id="workspaceBoard">
  <div id="workspaceCards"></div><svg id="workspaceInk"></svg>
</div></div></aside></body></html>`;

async function fixture(browser, withClip = true) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent(html);
  for (const file of ['reading-workspace.js', 'reading-ink.js', 'reading-workspace-view.js'])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(hasClip => {
    const at = Date.now();
    const item = { id: 'clip', quote: 'A source', note: 'Original note',
      anchor: { kind: 'text', para: 0, offset: 0 }, createdAt: at, updatedAt: at };
    const board = window.PhloemWorkspaceState.normalize();
    const workspace = hasClip ? window.PhloemWorkspaceState.place(board, 'clip',
      { x: 40, y: 40, width: 420 }, at) : board;
    const state = { id: 'paper-a', epoch: 1, open: true, unavailable: false, busy: false,
      items: hasClip ? [item] : [], workspace };
    const calls = { erase: [], add: [], update: 0 };
    let failUpdate = false;
    const adapter = {
      context: () => state,
      place: () => true,
      updateNote(id, note, expected) {
        calls.update++;
        const live = state.items.find(value => value.id === id);
        if (!live || live.updatedAt !== expected) return false;
        live.note = note; live.updatedAt++;
        return !failUpdate;
      },
      goToSource: async () => true, removeClip: () => true, addNote: () => null,
      addStroke(raw) {
        calls.add.push(raw);
        state.workspace = window.PhloemWorkspaceState.addStroke(state.workspace, raw, Date.now());
        return true;
      },
      eraseStrokes(ids) {
        calls.erase.push(ids);
        state.workspace = window.PhloemWorkspaceState.removeStrokes(state.workspace, ids, Date.now());
        return true;
      },
      grow: () => true, close: () => {}, onTool: () => {}
    };
    const view = window.PhloemWorkspaceView.create(adapter);
    window.fixture = { state, calls, view, failUpdate(value) { failUpdate = value; } };
    view.render();
  }, withClip);
  return page;
}

test('workspace view retains failed-save drafts through render, reset, and paper switch', async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => fixture.failUpdate(true));
      await page.locator('.workspace-note').fill('Unsaved local draft');
      const before = await page.evaluate(() => ({
        canonical: fixture.state.items[0].note, draft: fixture.view.hasDrafts(),
        value: document.querySelector('.workspace-note').value
      }));
      assert.deepEqual(before, { canonical: 'Unsaved local draft', draft: true, value: 'Unsaved local draft' });
      const after = await page.evaluate(() => {
        fixture.view.render();
        fixture.view.reset();
        fixture.state.id = 'paper-b'; fixture.state.epoch++;
        fixture.state.items = []; fixture.state.workspace = PhloemWorkspaceState.normalize();
        fixture.view.render();
        return { draft: fixture.view.hasDrafts(), note: fixture.state.items.length };
      });
      assert.deepEqual(after, { draft: true, note: 0 });
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('closing a clean focused field does not create an orphan draft', async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await fixture(browser);
    try {
      await page.locator('.workspace-note').focus();
      const result = await page.evaluate(() => {
        fixture.state.open = false;
        fixture.view.render();
        fixture.view.reset();
        return fixture.view.hasDrafts();
      });
      assert.equal(result, false);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('remote edit keeps a separate copyable local draft', async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => fixture.failUpdate(true));
      await page.locator('.workspace-note').fill('My draft');
      const result = await page.evaluate(() => {
        fixture.state.items[0].note = 'Remote edit';
        fixture.state.items[0].updatedAt++;
        fixture.view.render();
        const orphan = document.querySelector('.workspace-draft textarea');
        return { hasDraft: fixture.view.hasDrafts(), cardCount: document.querySelectorAll('.workspace-card').length,
          copy: orphan && orphan.value, readOnly: orphan && orphan.readOnly,
          current: [...document.querySelectorAll('.workspace-card textarea')].map(node => node.value) };
      });
      assert.equal(result.hasDraft, true);
      assert.equal(result.cardCount, 2);
      assert.equal(result.copy, 'My draft');
      assert.equal(result.readOnly, true);
      assert.ok(result.current.includes('Remote edit'));
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('logical ink near origin is not rendered as normalized half-page coordinates', async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await fixture(browser, false);
    try {
      const bounds = await page.evaluate(() => {
        fixture.state.workspace = PhloemWorkspaceState.addStroke(fixture.state.workspace,
          { id: 'dot', color: 'black', width: 1, points: [[.5, .5, .5]] }, Date.now());
        fixture.view.render();
        const box = document.querySelector('[data-stroke-id="dot"]').getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      assert.ok(Math.abs(bounds.x) < 10 && Math.abs(bounds.y) < 10, JSON.stringify(bounds));
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('far eraser misses a dot and collinear line; cancellation restores stroke opacity', async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await fixture(browser, false);
    try {
      await page.evaluate(() => {
        const at = Date.now();
        fixture.state.workspace = PhloemWorkspaceState.addStroke(fixture.state.workspace,
          { id: 'dot', color: 'black', width: 1, points: [[.5, .5, .5]] }, at);
        fixture.state.workspace = PhloemWorkspaceState.addStroke(fixture.state.workspace,
          { id: 'line', color: 'black', width: 1, points: [[100, 100, .5], [200, 100, .5]] }, at);
        fixture.view.render();
        document.getElementById('workspaceBoard').addEventListener('pointerdown', event => {
          window.fixture.lastPointerId = event.pointerId;
        }, true);
      });
      await page.locator('[data-workspace-tool="eraser"]').click();
      const rect = await page.locator('#workspaceBoard').boundingBox();
      await page.mouse.move(rect.x + 900, rect.y + 500);
      await page.mouse.down();
      await page.mouse.move(rect.x + 920, rect.y + 520);
      await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => fixture.calls.erase), []);
      await page.mouse.move(rect.x + 150, rect.y + 100);
      await page.mouse.down();
      await page.mouse.move(rect.x + 160, rect.y + 100);
      const faded = await page.evaluate(() => document.querySelector('[data-stroke-id="line"]').style.opacity);
      assert.equal(faded, '0.2');
      await page.evaluate(() => {
        document.getElementById('workspaceBoard').dispatchEvent(new PointerEvent('pointercancel',
          { bubbles: true, pointerId: fixture.lastPointerId, pointerType: 'mouse' }));
      });
      await page.mouse.up();
      const after = await page.evaluate(() => ({
        opacity: document.querySelector('[data-stroke-id="line"]').style.opacity,
        erases: fixture.calls.erase.length,
        strokes: fixture.state.workspace.strokes.length
      }));
      assert.equal(after.opacity, '');
      assert.equal(after.erases, 0);
      assert.equal(after.strokes, 2);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
