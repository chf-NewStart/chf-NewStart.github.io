/* Lasso Duplicate and Delete, and one Undo order for everything on the Workspace: moving,
   resizing, adding and removing a note are Undo steps in order with handwriting and lasso
   changes. Chromium with synthetic Pencil events; not a substitute for a physical iPad check. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function generatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Paper highlight stays independent of workspace taps.', { x: 52, y: 710, size: 13, font });
  return Buffer.from(await doc.save());
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
  .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    browser = browser;


    if (ENGINE !== 'chromium') { console.log('SKIP needs Chromium'); return; }
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'lasso-actions.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const pen = async (pts, id) => page.evaluate(({ pts, id }) => {
      const board = document.getElementById('workspaceBoard'); const cap = board.setPointerCapture; board.setPointerCapture = () => {};
      try { pts.forEach(([x, y], i) => { const t = i === 0 ? 'pointerdown' : i === pts.length - 1 ? 'pointerup' : 'pointermove';
        (document.elementFromPoint(x, y) || board).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, composed: true,
          pointerType: 'pen', pointerId: id, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, pressure: t === 'pointerup' ? 0 : .6, clientX: x, clientY: y })); }); }
      finally { board.setPointerCapture = cap; } }, { pts, id });
    const line = (x0, y0, x1, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    const rect = (l, t, r, b) => [...line(l, t, r, t), ...line(r, t, r, b), ...line(r, b, l, b), ...line(l, b, l, t)];

    const cards = () => page.locator('.workspace-card').count();
    const strokes = () => page.locator('#workspaceInk path[data-stroke-id]').count();
    const settle = () => page.waitForTimeout(250);
    const undo = async () => { await page.locator('#workspaceUndo').click(); await settle(); };
    const redo = async () => { await page.locator('#workspaceBoard').focus(); await page.keyboard.press('Control+Shift+Z'); await settle(); };
    const tool = async name => { await page.locator(`[data-workspace-tool="${name}"]`).click(); await settle(); };
    const noteIds = () => page.$$eval('.workspace-card', nodes => nodes.map(n => n.dataset.clipId).sort());
    const panelText = () => page.locator('#workspacePanel').textContent();

    // A new note is one Undo step; Redo brings it back with its text.
    await page.locator('#workspaceNewNote').click(); await page.keyboard.type('keep me'); await page.keyboard.press('Escape');
    await page.locator('#workspaceBoard').focus(); await settle();
    assert.equal(await cards(), 1);
    const [noteId] = await noteIds();
    const first = await saved(page), createdAt = first.readingExcerpts.items[0].createdAt;
    await undo();
    assert.equal(await cards(), 0, 'Undo removes the note just added');
    await redo();
    assert.deepEqual(await noteIds(), [noteId], 'Redo brings back the same note');
    assert.match(await page.locator('.workspace-card .workspace-note-preview').first().textContent(), /keep me/);

    const card = page.locator('.workspace-card').first();
    let box = await card.boundingBox();
    await pen(line(box.x + 30, box.y + 80, box.x + box.width - 30, box.y + 90), 5);
    await pen(line(box.x + box.width + 60, box.y + 40, box.x + box.width + 160, box.y + 70), 6);
    await settle();
    assert.equal(await strokes(), 2);

    // Undo order: write, then drag the note by its strip. Undo moves the note back first.
    const handle = card.locator('.workspace-card-handle');
    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + 20, hb.y + hb.height / 2); await page.mouse.down();
    await page.mouse.move(hb.x + 80, hb.y + hb.height / 2 + 60, { steps: 6 }); await page.mouse.up(); await settle();
    const dragged = await card.boundingBox();
    assert(dragged.x - box.x > 40 && dragged.y - box.y > 40, 'the strip drag moved the note');
    await undo();
    let back = await card.boundingBox();
    assert(Math.abs(back.x - box.x) < 2 && Math.abs(back.y - box.y) < 2, `Undo puts the dragged note back: ${JSON.stringify(box)} -> ${JSON.stringify(back)}`);
    assert.equal(await strokes(), 2, 'the handwriting before the drag is untouched');
    await redo();
    back = await card.boundingBox();
    assert(Math.abs(back.x - dragged.x) < 2 && Math.abs(back.y - dragged.y) < 2, 'Redo drags it again');
    await undo();

    // Make larger is one Undo step.
    await card.locator('.workspace-note-menu summary').click();
    await card.locator('.workspace-note-larger').click(); await settle();
    const wider = await card.boundingBox();
    assert(wider.width > box.width + 20, 'Make larger widened the note');
    await page.keyboard.press('Escape');
    await undo();
    const unwidened = await card.boundingBox();
    assert(Math.abs(unwidened.width - box.width) < 2, `Undo restores the note size: ${box.width} ${wider.width} ${unwidened.width} ${await panelText()}`);

    // A lasso move, then a drag of that note on its own: both undo, newest first.
    await tool('select');
    await pen(rect(box.x - 30, box.y - 30, box.x + box.width + 200, box.y + box.height + 30), 7);
    await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
    let sel = await page.locator('.workspace-selection-box').boundingBox();
    await pen(line(sel.x + sel.width / 2, sel.y + sel.height / 2, sel.x + sel.width / 2 + 50, sel.y + sel.height / 2 + 40), 9);
    await settle();
    const lassoed = await card.boundingBox();
    assert(lassoed.x - box.x > 30, 'the lasso moved the note');
    await page.locator('#workspaceBoard').focus(); await page.keyboard.press('Escape');
    await tool('pen');
    const hb2 = await handle.boundingBox();
    await page.mouse.move(hb2.x + 20, hb2.y + hb2.height / 2); await page.mouse.down();
    await page.mouse.move(hb2.x + 20, hb2.y + hb2.height / 2 + 80, { steps: 6 }); await page.mouse.up(); await settle();
    await undo();
    back = await card.boundingBox();
    assert(Math.abs(back.x - lassoed.x) < 2 && Math.abs(back.y - lassoed.y) < 2, 'the first Undo reverses the lone drag');
    await undo();
    back = await card.boundingBox();
    assert(Math.abs(back.x - box.x) < 2 && Math.abs(back.y - box.y) < 2, 'the second Undo reverses the earlier lasso move');
    assert.doesNotMatch(await panelText(), /changed elsewhere|unavailable/i, 'an older lasso step is not blocked');

    // Duplicate: the copy (with the writing on it) lands just below-right and is selected.
    await tool('select');
    await pen(rect(box.x - 30, box.y - 30, box.x + box.width + 200, box.y + box.height + 30), 10);
    await page.locator('.workspace-selection-actions').waitFor({ state: 'visible' });
    const widthBefore = (await saved(page)).readingWorkspace.width;
    await page.locator('.workspace-selection-duplicate').click(); await settle();
    assert.equal(await cards(), 2, 'Duplicate copies the note');
    assert.equal((await saved(page)).readingWorkspace.width, widthBefore, 'duplicating never widens the paper');
    assert.equal(await strokes(), 4, 'Duplicate copies the writing on it and beside it');
    const ids = await noteIds(), copyId = ids.find(id => id !== noteId);
    const copyBox = await page.locator(`.workspace-card[data-clip-id="${copyId}"]`).boundingBox();
    assert(copyBox.x > box.x && copyBox.y > box.y && copyBox.x - box.x < 80, 'the copy is offset a little');
    assert.equal(await page.locator(`.workspace-card[data-clip-id="${copyId}"].workspace-selected`).count(), 1, 'the copy becomes the selection');
    assert.match(await page.locator(`.workspace-card[data-clip-id="${copyId}"] .workspace-note-preview`).textContent(), /keep me/);
    const copyInk = await page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.id === localStorage.getItem('readingRoom.lastOpen.v1')).readingWorkspace.strokes.filter(s => s.anchor && s.anchor.clipId === id).length, copyId);
    assert.equal(copyInk, 1, 'the writing on the copy is attached to the copy');
    await undo();
    assert.deepEqual(await noteIds(), [noteId], 'Undo removes the copy');
    assert.equal(await strokes(), 2);
    await redo();
    assert.equal(await cards(), 2, 'Redo brings the copy back');
    assert.equal(await strokes(), 4);

    // Delete: the selection goes, and Undo brings it back under the same ids.
    await page.locator('#workspaceBoard').focus(); await page.keyboard.press('Escape');
    await pen(rect(box.x - 30, box.y - 30, box.x + box.width + 200, box.y + box.height + 30), 11);
    await page.locator('.workspace-selection-actions').waitFor({ state: 'visible' });
    await page.locator('.workspace-selection-delete').click(); await settle();
    const left = await noteIds();
    assert(!left.includes(noteId), 'Delete removes the selected note');
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'the selection is cleared');
    await undo();
    assert(( await noteIds()).includes(noteId), 'Undo brings the deleted note back with the same id');
    assert.equal(await strokes(), 4, 'and its writing');
    assert.match(await page.locator(`.workspace-card[data-clip-id="${noteId}"] .workspace-note-preview`).textContent(), /keep me/);
    await redo();
    assert(!(await noteIds()).includes(noteId), 'Redo deletes it again');
    await undo();

    // The note menu's Remove needs no confirmation and is one Undo step.
    await tool('pen');
    page.once('dialog', dialog => { assert.fail(`unexpected dialog: ${dialog.message()}`); });
    const target = page.locator(`.workspace-card[data-clip-id="${copyId}"]`);
    await target.locator('.workspace-note-menu summary').click();
    await target.locator('.workspace-remove').click(); await settle();
    assert(!(await noteIds()).includes(copyId), 'Remove takes the note away');
    assert.equal(await strokes(), 3, 'with the writing on it');
    await undo();
    assert((await noteIds()).includes(copyId), 'Undo brings the removed note back');
    assert.equal(await strokes(), 4);

    // Undoing a Delete brings strokes back in a way older steps still recognise:
    // write, lasso, Delete, Undo, then Undo removes the writing.
    const pane = await page.locator('#workspaceScroll').boundingBox();
    const before = await strokes();
    await pen(line(pane.x + 40, pane.y + pane.height - 150, pane.x + 140, pane.y + pane.height - 120), 12);
    await settle();
    assert.equal(await strokes(), before + 1);
    await tool('select');
    await pen(rect(pane.x + 20, pane.y + pane.height - 175, pane.x + 165, pane.y + pane.height - 95), 13);
    await page.locator('.workspace-selection-actions').waitFor({ state: 'visible' });
    await page.locator('.workspace-selection-delete').click(); await settle();
    assert.equal(await strokes(), before, 'Delete removes the lassoed writing');
    await undo();
    assert.equal(await strokes(), before + 1, 'Undo brings it back');
    await undo();
    assert.equal(await strokes(), before, 'the next Undo removes the writing itself');
    assert.doesNotMatch(await panelText(), /changed elsewhere|unavailable/i);
    await redo();

    // At 50% Workspace zoom the bar keeps a finger-sized height.
    await page.locator('#workspaceMore summary').click();
    await page.locator('#workspaceZoomOut').click(); await page.locator('#workspaceZoomOut').click();
    await page.locator('#workspaceMore summary').click(); await settle();
    const pane2 = await page.locator('#workspaceScroll').boundingBox();
    await pen(rect(pane2.x + 10, pane2.y + 100, pane2.x + pane2.width - 80, pane2.y + pane2.height - 40), 14);
    await page.locator('.workspace-selection-actions').waitFor({ state: 'visible' });
    const del = await page.locator('.workspace-selection-delete').boundingBox();
    assert(del.height >= 36, `Delete stays finger-sized when zoomed out: ${JSON.stringify(del)}`);
    const palette = await page.locator('#workspaceTools').boundingBox();
    assert(del.x + del.width <= palette.x || del.y >= palette.y + palette.height || del.y + del.height <= palette.y, 'the tool palette does not cover Delete');

    // Everything survives a reload.
    await page.reload({ waitUntil: 'load' });
    const kept = await saved(page);
    assert.equal(kept.readingExcerpts.items.length, 2);
    assert.equal(kept.readingExcerpts.items.find(item => item.id === noteId).createdAt, createdAt, 'a restored note keeps its place in Clips');
    assert.deepEqual(errors, []);
    console.log('PASS lasso Duplicate and Delete, and note moves, resizes, adds and removes undo in order');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
