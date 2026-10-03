/* Minimal browser fixture for workspace draft and ink safety. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE), 'PHLOEM_BROWSER must be chromium or webkit');
function launchBrowser() {
  const launch = { headless: true };
  const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
  if (executablePath) launch.executablePath = executablePath;
  return playwright[ENGINE].launch(launch);
}
const html = `<!doctype html><html><head><style>
body { margin:0; } #workspacePanel { width:1000px; }
#workspaceTools { height:44px; } #workspaceScroll { width:1000px; height:650px; overflow:auto; }
#workspaceBoard { position:relative; width:1000px; height:2000px; }
#workspaceCards, #workspaceInk { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.workspace-card { position:absolute; pointer-events:auto; background:white; touch-action:auto; }
.workspace-card .workspace-quote, .workspace-card .workspace-note-preview { display:block; max-height:100px; overflow:auto; touch-action:none; white-space:pre-wrap; }
.workspace-card .workspace-note-preview[hidden], .workspace-card label[hidden] { display:none; }
.workspace-note-menu { position:relative; }
.workspace-card-actions { position:absolute; top:100%; right:0; display:grid; width:164px; background:white; }
.workspace-card-actions button { min-height:44px; }
</style></head><body>
<aside id="workspacePanel"><div id="workspaceTools" tabindex="0">
  <button id="workspacePenToggle" type="button" data-workspace-tool="pen">Pen</button>
  <button type="button" data-workspace-tool="eraser">Eraser</button>
  <button type="button" data-workspace-tool="move">Move</button>
  <button id="workspaceUndo"></button>
  <details id="workspaceMore"><summary>More</summary>
    <button id="workspaceRedo"></button><button id="workspaceMoreSpace"></button>
    <button id="workspaceNewNote"></button><button id="workspaceReturn"></button>
  </details>
  <div id="workspacePenOptions" hidden><button type="button" data-workspace-color="black">Black</button>
    <select id="workspaceSize"><option value="1.2">Fine</option></select></div>
</div><button id="workspaceClose"></button><p id="workspaceStatus"></p>
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
    const calls = { erase: [], add: [], place: [], update: 0 };
    let failUpdate = false, placeClock = at;
    const adapter = {
      context: () => state,
      place(id, box) {
        calls.place.push({ id, box: { ...box } });
        state.workspace = window.PhloemWorkspaceState.place(state.workspace, id, box, ++placeClock);
        return true;
      },
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
async function editClip(page) {
  await page.locator('.workspace-card .workspace-note-menu summary').click();
  await page.locator('.workspace-card .workspace-note-edit').click();
  await page.locator('.workspace-card textarea.workspace-note').waitFor({ state: 'visible' });
}
async function pinchClip(page, scale, cancel = false, surface = null) {
  return page.locator('.workspace-card[data-clip-id="clip"]').evaluate((card, { scale, cancel, surface }) => {
    const target = surface ? card.querySelector(surface) : card;
    const rect = target.getBoundingClientRect();
    const y = rect.top + Math.min(rect.height / 2, 28);
    const x1 = rect.left + rect.width * .25, x2 = rect.left + rect.width * .75;
    const finalX2 = x1 + (x2 - x1) * scale;
    const originalCapture = card.setPointerCapture;
    card.setPointerCapture = () => {};
    function emit(type, pointerId, x) {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerType: 'touch', pointerId, isPrimary: pointerId === 51,
        button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
        clientX: x, clientY: y }));
    }
    try {
      emit('pointerdown', 51, x1); emit('pointerdown', 52, x2);
      emit('pointermove', 52, finalX2);
      const preview = parseFloat(card.style.width) * 10;
      const placesBeforeRelease = fixture.calls.place.length;
      if (cancel) emit('pointercancel', 52, finalX2);
      else { emit('pointerup', 51, x1); emit('pointerup', 52, finalX2); }
      return { preview, placesBeforeRelease, placesAfter: fixture.calls.place.length,
        width: parseFloat(card.style.width) * 10,
        resizing: card.classList.contains('workspace-resizing') };
    } finally { card.setPointerCapture = originalCapture; }
  }, { scale, cancel, surface });
}
async function swipeContent(page, selector, pointerId, distance) {
  return page.locator(selector).evaluate((node, { pointerId, distance }) => {
    const rect = node.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + Math.min(rect.height / 2, 50);
    const board = document.getElementById('workspaceScroll');
    const before = { content: node.scrollTop, board: board.scrollTop };
    function emit(type, clientY) {
      const event = new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerType: 'touch', pointerId, isPrimary: true, button: 0,
        buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY });
      node.dispatchEvent(event); return event.defaultPrevented;
    }
    emit('pointerdown', y);
    const prevented = emit('pointermove', y - distance);
    emit('pointerup', y - distance);
    return { before, content: node.scrollTop, board: board.scrollTop, prevented,
      touchAction: getComputedStyle(node).touchAction };
  }, { pointerId, distance });
}

test('compact sticky note starts in read mode and Edit opens its textarea', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      assert.equal(await page.locator('.workspace-quote').textContent(), 'A source');
      assert.equal(await page.locator('.workspace-note-preview').textContent(), 'Original note');
      assert.equal(await page.locator('textarea.workspace-note').isVisible(), false);
      await editClip(page);
      assert.equal(await page.locator('textarea.workspace-note').isVisible(), true);
      assert.equal(await page.locator('.workspace-note-preview').isVisible(), false);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('sticky menu sizes one card in bounded steps without disturbing its draft', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await editClip(page);
      await page.evaluate(() => fixture.failUpdate(true));
      await page.locator('.workspace-note').fill('A draft retained while resizing');
      const menu = page.locator('.workspace-note-menu');
      await menu.locator('summary').click();
      await menu.locator('.workspace-note-larger').click();
      let result = await page.evaluate(() => ({ position: fixture.state.workspace.positions.clip,
        draft: fixture.view.hasDrafts(), value: document.querySelector('.workspace-note').value,
        cardWidth: parseFloat(document.querySelector('.workspace-card').style.width) * 10 }));
      assert.equal(result.position.width, 500);
      assert.equal(result.cardWidth, 500);
      assert.equal(result.position.x, 0, 'enlarging near the left edge clamps x inside the paper');
      assert.equal(result.draft, true);
      assert.equal(result.value, 'A draft retained while resizing');
      for (let i = 0; i < 12 && await menu.locator('.workspace-note-larger').isEnabled(); i++)
        await menu.locator('.workspace-note-larger').click();
      result = await page.evaluate(() => ({ position: fixture.state.workspace.positions.clip,
        places: fixture.calls.place.length }));
      assert.equal(result.position.width, 900, 'larger menu action stops at the note-width maximum');
      assert(result.position.x >= 0 && result.position.x + result.position.width <= 1000);
      assert.equal(await menu.locator('.workspace-note-larger').isEnabled(), false,
        'larger action becomes unavailable at its bound');
      for (let i = 0; i < 12 && await menu.locator('.workspace-note-smaller').isEnabled(); i++)
        await menu.locator('.workspace-note-smaller').click();
      result = await page.evaluate(() => ({ position: fixture.state.workspace.positions.clip,
        places: fixture.calls.place.length, draft: fixture.view.hasDrafts(), value: document.querySelector('.workspace-note').value }));
      assert.equal(result.position.width, 280, 'smaller menu action stops at the note-width minimum');
      assert.equal(await menu.locator('.workspace-note-smaller').isEnabled(), false,
        'smaller action becomes unavailable at its bound');
      assert.equal(result.draft, true);
      assert.equal(result.value, 'A draft retained while resizing');
      assert.equal(result.places, 14, 'bounded no-op actions do not write duplicate positions');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('small sticky at the paper edge keeps its 44px size actions inside a phone viewport', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        for (const id of ['workspacePanel', 'workspaceScroll', 'workspaceBoard'])
          document.getElementById(id).style.width = '390px';
        fixture.state.workspace = PhloemWorkspaceState.place(fixture.state.workspace, 'clip',
          { x: 0, y: 40, width: 280 }, Date.now() + 1000);
        fixture.view.render();
      });
      const menu = page.locator('.workspace-note-menu');
      await menu.locator('summary').click();
      await page.waitForFunction(() => {
        const outer = document.getElementById('workspaceScroll').getBoundingClientRect();
        const actions = document.querySelector('.workspace-card-actions').getBoundingClientRect();
        return actions.left >= outer.left + 5 && actions.right <= outer.right - 5;
      });
      const bounds = await page.evaluate(() => {
        const outer = document.getElementById('workspaceScroll').getBoundingClientRect();
        const actions = document.querySelector('.workspace-card-actions').getBoundingClientRect();
        const larger = document.querySelector('.workspace-note-larger').getBoundingClientRect();
        return { outer: { left: outer.left, right: outer.right, top: outer.top, bottom: outer.bottom },
          actions: { left: actions.left, right: actions.right, top: actions.top, bottom: actions.bottom },
          larger: { width: larger.width, height: larger.height } };
      });
      assert(bounds.actions.left >= bounds.outer.left + 5 && bounds.actions.right <= bounds.outer.right - 5,
        'actions popover remains inside the narrow paper: ' + JSON.stringify(bounds));
      assert(bounds.actions.top >= bounds.outer.top && bounds.actions.bottom <= bounds.outer.bottom,
        'actions popover remains vertically reachable: ' + JSON.stringify(bounds));
      assert(bounds.larger.width >= 44 && bounds.larger.height >= 44,
        'larger action remains a reachable touch target');
      await menu.locator('.workspace-note-larger').click();
      assert.equal(await page.evaluate(() => fixture.state.workspace.positions.clip.width), 360,
        'reachable larger action still saves the new size');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('two touch pointers preview and commit one centered size; cancellation rolls back', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      const before = await page.evaluate(() => ({ ...fixture.state.workspace.positions.clip }));
      const grown = await pinchClip(page, 1.6);
      assert(grown.preview > before.width && grown.preview <= 900, JSON.stringify(grown));
      assert.equal(grown.placesBeforeRelease, 0, 'pinch preview has not persisted');
      assert.equal(grown.placesAfter, 1, 'pinch commits exactly once after both fingers lift');
      assert.equal(grown.resizing, false);
      const saved = await page.evaluate(() => ({ ...fixture.state.workspace.positions.clip }));
      assert.equal(saved.width, grown.width);
      assert.equal(saved.y, before.y, 'pinch does not move the note vertically');
      assert(Math.abs((saved.x + saved.width / 2) - (before.x + before.width / 2)) < 1 || saved.x === 0,
        'pinch preserves horizontal center where bounds allow');
      const cancelled = await pinchClip(page, .5, true);
      assert(cancelled.preview < saved.width, JSON.stringify(cancelled));
      assert.equal(cancelled.placesAfter, 1, 'cancelled pinch does not persist another position');
      assert.equal(cancelled.width, saved.width, 'cancelled pinch rolls preview back');
      assert.deepEqual(await page.evaluate(() => ({ ...fixture.state.workspace.positions.clip })), saved);
      assert.equal(await page.evaluate(() => fixture.view.active()), false);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('long quote and note preview scroll with one finger, while pinch remains local and textarea stays native', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => {
        const item = fixture.state.items[0];
        item.quote = Array(40).fill('Long source passage line').join('\n');
        item.note = Array(40).fill('Long personal note line').join('\n');
        item.updatedAt++;
        fixture.view.render();
      });
      const overflow = await page.evaluate(() => ({
        quote: document.querySelector('.workspace-quote').scrollHeight > document.querySelector('.workspace-quote').clientHeight,
        preview: document.querySelector('.workspace-note-preview').scrollHeight > document.querySelector('.workspace-note-preview').clientHeight
      }));
      assert.deepEqual(overflow, { quote: true, preview: true });
      const quote = await swipeContent(page, '.workspace-quote', 71, 65);
      assert(quote.content > quote.before.content && quote.prevented,
        'one finger scrolls within a long quote: ' + JSON.stringify(quote));
      assert.equal(quote.board, quote.before.board, 'quote consumes its own scroll before the board');
      const preview = await swipeContent(page, '.workspace-note-preview', 72, 65);
      assert(preview.content > preview.before.content && preview.prevented,
        'one finger scrolls within a long note preview: ' + JSON.stringify(preview));
      assert.equal(preview.board, preview.before.board, 'preview consumes its own scroll before the board');
      await page.locator('.workspace-quote').evaluate(node => { node.scrollTop = node.scrollHeight; });
      const spill = await swipeContent(page, '.workspace-quote', 73, 80);
      assert(spill.board > spill.before.board, 'finger scroll passes to paper after reaching quote edge');
      const beforePlace = await page.evaluate(() => fixture.calls.place.length);
      const quotePinch = await pinchClip(page, 1.3, false, '.workspace-quote');
      const previewPinch = await pinchClip(page, .8, false, '.workspace-note-preview');
      assert(quotePinch.width > 420 && previewPinch.width < quotePinch.width,
        'two-finger gestures on quote and preview resize only their sticky note');
      assert.equal(await page.evaluate(() => fixture.calls.place.length), beforePlace + 2);
      await page.evaluate(() => fixture.view.focus('clip', true));
      const textarea = await swipeContent(page, 'textarea.workspace-note', 74, 50);
      assert.notEqual(textarea.touchAction, 'none', 'textarea retains native touch-action');
      assert.equal(textarea.prevented, false, 'card pinch handler does not intercept textarea touch');
      assert.equal(await page.evaluate(() => fixture.calls.place.length), beforePlace + 2,
        'one-finger content and textarea gestures do not save a new card width');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('blank workspace paper remains scrollable outside sticky-note pinch targets', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      const before = await page.evaluate(() => ({ ...fixture.state.workspace.positions.clip }));
      const scroll = page.locator('#workspaceScroll');
      const rect = await scroll.boundingBox();
      await page.mouse.move(rect.x + rect.width - 30, rect.y + 350);
      await page.mouse.wheel(0, 450);
      await page.waitForFunction(() => document.getElementById('workspaceScroll').scrollTop > 100);
      assert.deepEqual(await page.evaluate(() => ({ ...fixture.state.workspace.positions.clip })), before,
        'scrolling blank paper does not resize the note');
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 0);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('Escape closes a focused sticky menu and restores summary focus without consuming outside Escape', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => {
        window.escapeBubbles = 0;
        document.addEventListener('keydown', event => { if (event.key === 'Escape') window.escapeBubbles++; });
      });
      const menu = page.locator('.workspace-note-menu');
      await menu.locator('summary').click();
      await menu.locator('.workspace-source').focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.evaluate(node => node.open), false);
      assert.equal(await menu.locator('summary').evaluate(node => document.activeElement === node), true);
      assert.equal(await page.evaluate(() => window.escapeBubbles), 0, 'inside-menu Escape is consumed');
      await menu.locator('summary').click();
      await page.locator('#workspaceTools').focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.evaluate(node => node.open), false);
      assert.equal(await page.evaluate(() => window.escapeBubbles), 1, 'outside Escape still bubbles');
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('workspace view retains failed-save drafts through render, reset, and paper switch', async () => {
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => fixture.failUpdate(true));
      await editClip(page);
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
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await editClip(page);
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
  const browser = await launchBrowser();
  try {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => fixture.failUpdate(true));
      await editClip(page);
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
  const browser = await launchBrowser();
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
  const browser = await launchBrowser();
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
