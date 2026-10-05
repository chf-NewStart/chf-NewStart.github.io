/* Full-app lasso selection and grouped workspace moves. Synthetic pen/touch
   events cover application routing; real mouse input covers capture and drag.
   These checks do not emulate physical Pencil pressure or palm rejection. */
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
const QUOTE = 'Paper history remains independent of workspace selection.';
const NOTE = 'Move this sticky and its handwriting together.';
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
  doc.addPage([612, 792]).drawText(QUOTE, { x: 45, y: 710, size: 11, font });
  return Buffer.from(await doc.save());
}
async function chapter(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
    .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
async function workspaceMenu(page, open) {
  if (await page.locator('#workspaceMore').evaluate(node => node.open) !== open)
    await page.locator('#workspaceMore summary').click();
  await page.locator('#workspaceRedo').waitFor({ state: open ? 'visible' : 'hidden' });
}
async function redoWorkspace(page) {
  await workspaceMenu(page, true);
  await page.locator('#workspaceRedo').click();
  await workspaceMenu(page, false);
}
async function highlight(page) {
  await page.waitForFunction(phrase => [...document.querySelectorAll('.pdf-page.book-active .text-layer span')]
    .some(span => span.textContent.includes(phrase)), QUOTE);
  await page.evaluate(phrase => {
    const span = [...document.querySelectorAll('.pdf-page.book-active .text-layer span')]
      .find(node => node.textContent.includes(phrase) && node.firstChild);
    const start = span.firstChild.textContent.indexOf(phrase);
    const range = document.createRange();
    range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + phrase.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 92 }));
  }, QUOTE);
  await page.locator('#selectionCreateHighlight').waitFor({ state: 'visible' });
  await page.locator('#selectionCreateHighlight [data-selection-highlight-color="yellow"]').click();
  if (await page.locator('#selectionCard').isVisible()) await page.locator('#selectionClose').click();
}
async function drawPaper(page) {
  await page.locator('#zenAnnotate').click(); await page.locator('#zenWrite').click();
  await page.locator('#pdfInkToolbar').waitFor({ state: 'visible' });
  await page.locator('.pdf-page.book-active .pdf-sheet').evaluate(sheet => {
    const rect = sheet.getBoundingClientRect();
    for (let index = 0; index <= 6; index++) {
      const type = index === 0 ? 'pointerdown' : index === 6 ? 'pointerup' : 'pointermove';
      const clientX = rect.left + rect.width * (.18 + index * .024);
      const clientY = rect.top + rect.height * (.34 + index * .007);
      document.elementFromPoint(clientX, clientY).dispatchEvent(new PointerEvent(type, { bubbles: true,
        cancelable: true, pointerType: 'pen', pointerId: 78, isPrimary: true, button: 0,
        buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : .6, clientX, clientY }));
    }
  });
  await page.locator('#pdfInkDone').click(); await page.locator('#pdfInkToolbar').waitFor({ state: 'hidden' });
  assert.equal(Object.values((await chapter(page)).pdfInk || {}).flat().length, 1, 'fixture includes existing source PDF handwriting');
}
async function waitPdf(page) {
  await page.waitForFunction(() => document.body.classList.contains('zen')
    && !!document.querySelector('.pdf-page.book-active canvas')?.width
    && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
}
async function clientPoints(page, points) {
  return page.locator('#workspaceBoard').evaluate((board, points) => {
    const rect = board.getBoundingClientRect();
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return points.map(([x, y]) => ({ x: rect.left + x * rect.width / (saved.readingWorkspace.width || 1000),
      y: rect.top + y * rect.height / saved.readingWorkspace.height }));
  }, points);
}
async function synthetic(page, points, pointerType = 'pen', end = 'pointerup', pointerId = 81) {
  return page.evaluate(({ points, pointerType, end, pointerId }) => {
    const board = document.getElementById('workspaceBoard'), rect = board.getBoundingClientRect();
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    const capture = board.setPointerCapture;
    // Constructed PointerEvents have no browser-owned pointer to capture.
    board.setPointerCapture = () => {};
    let preview = false;
    try {
      for (let index = 0; index < points.length; index++) {
        const [x, y] = points[index];
        const clientX = rect.left + x * rect.width / (saved.readingWorkspace.width || 1000);
        const clientY = rect.top + y * rect.height / saved.readingWorkspace.height;
        const target = document.elementFromPoint(clientX, clientY);
        if (!target || !board.contains(target)) throw new Error('Fixture point is outside visible workspace: ' + JSON.stringify({ x, y, clientX, clientY }));
        const type = index === 0 ? 'pointerdown' : index === points.length - 1 ? end : 'pointermove';
        if (index === points.length - 1) preview = !!document.querySelector('.workspace-lasso-preview');
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
          pointerType, pointerId, isPrimary: true, button: 0,
          buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
          pressure: type === 'pointerup' || type === 'pointercancel' ? 0 : .62, clientX, clientY }));
      }
    } finally { board.setPointerCapture = capture; }
    return preview;
  }, { points, pointerType, end, pointerId });
}
async function mousePath(page, points) {
  const client = await clientPoints(page, points);
  await page.mouse.move(client[0].x, client[0].y); await page.mouse.down();
  for (const point of client.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}
function rectangle(left, top, right, bottom) {
  // Multiple samples per side also check that the complete loop is used.
  return [[left, top], [(left + right) / 2, top], [right, top], [right, (top + bottom) / 2],
    [right, bottom], [(left + right) / 2, bottom], [left, bottom], [left, (top + bottom) / 2], [left, top]];
}
async function visibleGeometry(page) {
  return page.evaluate(() => {
    const board = document.getElementById('workspaceBoard'), rect = board.getBoundingClientRect();
    const saved = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    const box = node => {
      const r = node.getBoundingClientRect();
      return { x: (r.left - rect.left) * (saved.readingWorkspace.width || 1000) / rect.width, y: (r.top - rect.top) * saved.readingWorkspace.height / rect.height,
        width: r.width * (saved.readingWorkspace.width || 1000) / rect.width, height: r.height * saved.readingWorkspace.height / rect.height };
    };
    return { card: box(document.querySelector('.workspace-card')),
      selection: document.querySelector('.workspace-selection-box:not([hidden])') ? box(document.querySelector('.workspace-selection-box')) : null };
  });
}
async function selectGroup(page, pointerType = 'pen') {
  const before = await chapter(page);
  await page.locator('[data-workspace-tool="select"]').click();
  const saved = await chapter(page), geometry = await visibleGeometry(page);
  const free = saved.readingWorkspace.strokes.find(stroke => stroke.id === fixture.free);
  const xs = free.points.map(p => p[0]), ys = free.points.map(p => p[1]);
  const box = geometry.card;
  const points = rectangle(Math.min(box.x, ...xs) - 12, Math.min(box.y, ...ys) - 12,
    Math.max(box.x + box.width, ...xs) + 12, Math.max(box.y + box.height, ...ys) + 12);
  if (pointerType === 'mouse') await mousePath(page, points);
  else assert.equal(await synthetic(page, points, pointerType), true, 'lasso has a visible preview before release');
  await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
  const selected = await page.locator('.workspace-selected').evaluateAll(nodes => nodes.map(node => node.dataset.clipId || node.dataset.strokeId).filter(Boolean).sort());
  assert.deepEqual(selected, [fixture.note, fixture.attached, fixture.free].sort(), pointerType + ' selects the sticky, its ink, and enclosed free ink only');
  assert.equal(await page.locator('.workspace-lasso-preview').count(), 0, 'completed loop removes its temporary preview');
  assert.deepEqual((await chapter(page)).readingWorkspace, before.readingWorkspace, 'selection itself does not change saved workspace content');
}
async function renderedInk(page) {
  return page.locator('#workspaceInk [data-stroke-id]').evaluateAll(nodes => Object.fromEntries(
    nodes.map(node => [node.dataset.strokeId, node.getAttribute('d')])));
}
function shown(saved, id) {
  const stroke = saved.readingWorkspace.strokes.find(item => item.id === id);
  const anchor = stroke.anchor, place = anchor && saved.readingWorkspace.positions[anchor.clipId];
  return stroke.points.map(point => !place ? point.slice() : [place.x + (point[0] - anchor.x) * place.width / anchor.width,
    place.y + (point[1] - anchor.y) * place.width / anchor.width, point[2]]);
}
function geometry(saved) {
  const place = saved.readingWorkspace.positions[fixture.note];
  return { note: { x: place.x, y: place.y, width: place.width },
    attached: shown(saved, fixture.attached), free: shown(saved, fixture.free), outside: shown(saved, fixture.outside) };
}
function near(actual, expected, message, tolerance = 3.5) {
  // WebKit rounds real mouse coordinates to screen pixels. At 50% workspace
  // zoom, one screen pixel spans roughly three logical workspace units.
  assert(Math.abs(actual - expected) < tolerance, message + ': ' + actual + ' vs ' + expected);
}
function assertMoved(before, after, dx, dy, tolerance = .8) {
  const a = geometry(before), b = geometry(after);
  near(b.note.x, a.note.x + dx, 'sticky logical x', tolerance); near(b.note.y, a.note.y + dy, 'sticky logical y', tolerance);
  assert.equal(b.note.width, a.note.width, 'group drag does not resize a sticky');
  for (const key of ['attached', 'free']) {
    assert.equal(b[key].length, a[key].length, key + ' retains its sampled points');
    b[key].forEach((point, index) => { near(point[0], a[key][index][0] + dx, key + ' moves once in x', tolerance);
      near(point[1], a[key][index][1] + dy, key + ' moves once in y', tolerance); assert.equal(point[2], a[key][index][2], key + ' pressure is preserved'); });
  }
  assert.deepEqual(after.readingWorkspace.strokes.find(s => s.id === fixture.outside),
    before.readingWorkspace.strokes.find(s => s.id === fixture.outside), 'unselected ink remains byte-for-byte unchanged');
  assert.deepEqual(after.readingWorkspace.strokes.find(s => s.id === fixture.attached),
    before.readingWorkspace.strokes.find(s => s.id === fixture.attached), 'group movement preserves attached ink source coordinates and metadata');
  assert.deepEqual(after.readingExcerpts.items, before.readingExcerpts.items, 'group movement preserves note content');
  assert.deepEqual(after.pdfInk, before.pdfInk, 'group movement leaves PDF handwriting alone');
  assert.deepEqual(after.highlights, before.highlights, 'group movement leaves PDF highlights alone');
}
async function dragGroup(page, dx, dy, pointerType = 'mouse', end = 'pointerup') {
  const { selection: box } = await visibleGeometry(page);
  assert(box, 'drag starts within the visible group selection');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const points = [[x, y], [x + dx / 2, y + dy / 2], [x + dx, y + dy]];
  if (pointerType === 'mouse' && end === 'pointerup') await mousePath(page, points);
  else await synthetic(page, points, pointerType, end);
}
async function zoom(page, percent) {
  await workspaceMenu(page, true);
  await page.locator('#workspaceZoomReset').click();
  if (percent === 50) for (let i = 0; i < 4; i++) await page.locator('#workspaceZoomOut').click();
  if (percent === 125) await page.locator('#workspaceZoomIn').click();
  assert.equal(await page.locator('#workspaceZoomReset').textContent(), percent + '%');
  await workspaceMenu(page, false);
  await page.locator('#workspaceScroll').evaluate(node => { node.scrollTop = 0; node.scrollLeft = 0; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const fixture = {};

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser, page;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(25000); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phloem.lassoFixture')) return;
      sessionStorage.setItem('phloem.lassoFixture', '1');
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'lasso.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await waitPdf(page); await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' }); await waitPdf(page);
    await drawPaper(page); await highlight(page);
    await workspaceMenu(page, true); await page.locator('#workspaceNewNote').click(); await workspaceMenu(page, false);
    const card = page.locator('.workspace-card').first();
    await card.locator('textarea.workspace-note').fill(NOTE); await card.locator('.workspace-handle').focus();
    fixture.note = await card.getAttribute('data-clip-id');
    await card.locator('.workspace-note-menu summary').click();
    // Shrink to the minimum width; new notes start square (400 units) since the sticky-note round.
    for (let i = 0; i < 5 && await card.locator('.workspace-note-smaller').isEnabled(); i++) await card.locator('.workspace-note-smaller').click();
    await card.locator('.workspace-note-menu summary').click();
    const initialPlace = (await chapter(page)).readingWorkspace.positions[fixture.note];
    const handle = await card.locator('.workspace-handle').boundingBox();
    const boardWidth = await page.locator('#workspaceBoard').evaluate(node => node.getBoundingClientRect().width * 1000 / Number(node.dataset.logicalWidth || 1000));
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + (100 - initialPlace.x) * boardWidth / 1000,
      handle.y + handle.height / 2 + (120 - initialPlace.y) * boardWidth / 1000, { steps: 6 }); await page.mouse.up();
    const box = (await visibleGeometry(page)).card;
    near(box.x, 100, 'fixture note x'); near(box.y, 120, 'fixture note y');
    await synthetic(page, [[710, 620], [735, 640], [760, 650]]);
    await synthetic(page, [[130, 235], [170, 245], [200, 260]]);
    await synthetic(page, [[440, 245], [475, 260], [510, 270]]);
    const drawn = await chapter(page), ink = drawn.readingWorkspace.strokes;
    assert.equal(ink.length, 3, 'fixture contains three separate strokes');
    fixture.attached = ink.find(stroke => stroke.anchor?.clipId === fixture.note)?.id;
    fixture.free = ink.find(stroke => Math.abs(stroke.points[0][0] - 440) < 1)?.id;
    fixture.outside = ink.find(stroke => Math.abs(stroke.points[0][0] - 710) < 1)?.id;
    assert(fixture.attached, 'writing that starts on the sticky belongs to it: ' + JSON.stringify(ink));
    assert(fixture.free && fixture.outside, 'fixture identifies the two separate free strokes');
    assert.equal(ink.find(stroke => stroke.id === fixture.free).anchor, undefined, 'second stroke is free handwriting');
    assert.equal(ink.find(stroke => stroke.id === fixture.outside).anchor, undefined, 'outside stroke is free handwriting');
    const select = page.locator('[data-workspace-tool="select"]');
    assert.equal(await select.getAttribute('aria-label'), 'Select handwriting and notes');
    assert.equal(await page.locator('[data-workspace-tool="move"]').count(), 0, 'shared tool selects both object types');
    await select.click();
    assert.equal(await synthetic(page, rectangle(122, 226, 208, 268)), true);
    await page.locator('.workspace-selection-box').waitFor({ state: 'visible' });
    assert.equal(await card.evaluate(node => node.classList.contains('workspace-selected')), true,
      'circling attached writing promotes its sticky even when the loop misses the card center');
    await page.locator('[data-workspace-tool="eraser"]').click();
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'tool change clears the selection box');
    assert.equal(await page.locator('.workspace-selected').count(), 0, 'tool change clears selected objects');

    for (const [percent, pointerType] of [[50, 'pen'], [125, 'mouse']]) {
      await zoom(page, percent); await selectGroup(page, pointerType);
      const before = await chapter(page);
      const beforeGeometry = geometry(before);
      await dragGroup(page, 32, 44);
      const after = await chapter(page); assertMoved(before, after, 32, 44, 3.5);
      const afterGeometry = geometry(after);
      await page.locator('#workspaceUndo').click();
      assert.deepEqual(geometry(await chapter(page)), beforeGeometry, percent + '% group move is one workspace Undo');
      if (percent === 50) {
        await page.locator('#workspaceUndo').click();
        const erased = await chapter(page);
        assert.equal(erased.readingWorkspace.strokes.length, 2, 'Undo after reverting a group move can still undo the previous ink addition');
        assert.equal(erased.readingWorkspace.strokes.some(stroke => stroke.id === fixture.free), false, 'the selected free stroke is the preceding ink action');
        await redoWorkspace(page);
        const restored = await chapter(page);
        const replacement = restored.readingWorkspace.strokes.find(stroke => !stroke.anchor &&
          Math.abs(stroke.points[0][0] - beforeGeometry.free[0][0]) < .1);
        assert(replacement, 'Redo restores the free stroke with its original geometry');
        fixture.free = replacement.id;
        assert.deepEqual(geometry(restored), beforeGeometry, 'restoring a preceding ink addition preserves the grouped geometry');
      }
      await redoWorkspace(page);
      assert.deepEqual(geometry(await chapter(page)), afterGeometry, percent + '% group move is one workspace Redo, including replacement ink IDs');
    }

    for (const [key, dx, dy] of [['ArrowRight', 5, 0], ['Shift+ArrowDown', 0, 20]]) {
      const before = await chapter(page);
      await page.locator('.workspace-selection-box').focus(); await page.keyboard.press(key);
      const after = await chapter(page); assertMoved(before, after, dx, dy);
      await page.locator('#workspaceUndo').click();
      assert.deepEqual(geometry(await chapter(page)), geometry(before), key + ' group nudge is one Undo');
      await redoWorkspace(page);
      assert.deepEqual(geometry(await chapter(page)), geometry(after), key + ' group nudge is one Redo');
    }

    // Erase history restores strokes under new IDs. The preceding grouped move
    // must follow that replacement through both Undo and Redo.
    await selectGroup(page);
    const beforeEraseMove = geometry(await chapter(page));
    await dragGroup(page, 7, 9, 'pen');
    const afterEraseMove = geometry(await chapter(page));
    await page.locator('[data-workspace-tool="eraser"]').click();
    const erasePoint = afterEraseMove.free[1];
    await synthetic(page, [[erasePoint[0] - 4, erasePoint[1]], erasePoint.slice(0, 2), [erasePoint[0] + 4, erasePoint[1]]]);
    assert.equal((await chapter(page)).readingWorkspace.strokes.length, 2, 'eraser removes the moved free stroke');
    await page.locator('#workspaceUndo').click();
    let restoredFree = (await chapter(page)).readingWorkspace.strokes.find(stroke => !stroke.anchor && stroke.id !== fixture.outside);
    assert(restoredFree, 'Undo restores the erased group member'); fixture.free = restoredFree.id;
    assert.deepEqual(geometry(await chapter(page)), afterEraseMove, 'Undo erase restores moved ink at its displayed position');
    await page.locator('#workspaceUndo').click();
    assert.deepEqual(geometry(await chapter(page)), beforeEraseMove, 'Undo group move follows the replacement member ID');
    await redoWorkspace(page);
    assert.deepEqual(geometry(await chapter(page)), afterEraseMove, 'Redo group move follows the replacement member ID');
    await redoWorkspace(page);
    assert.equal((await chapter(page)).readingWorkspace.strokes.length, 2, 'Redo erase still targets the restored and moved member');
    await page.locator('#workspaceUndo').click();
    restoredFree = (await chapter(page)).readingWorkspace.strokes.find(stroke => !stroke.anchor && stroke.id !== fixture.outside);
    assert(restoredFree, 'fixture restores the member after checking the complete history chain'); fixture.free = restoredFree.id;
    assert.deepEqual(geometry(await chapter(page)), afterEraseMove, 'second erase restoration preserves geometry');

    // A fresh group move clears only workspace Redo; pending paper Redo survives.
    await page.locator('#zenUndo').click();
    const withoutPaper = await chapter(page);
    assert.equal(Object.values(withoutPaper.highlights || {}).flat().length, 0);
    await page.locator('#workspaceUndo').click();
    await selectGroup(page, 'touch');
    const beforeFresh = await chapter(page);
    await dragGroup(page, 18, 22, 'touch'); assertMoved(beforeFresh, await chapter(page), 18, 22);
    await workspaceMenu(page, true);
    assert.equal(await page.locator('#workspaceRedo').isDisabled(), true, 'fresh group move clears workspace Redo');
    await workspaceMenu(page, false); await page.locator('#zenAnnotate').click();
    assert.equal(await page.locator('#zenRedo').isDisabled(), false, 'workspace move preserves pending paper Redo');
    await page.locator('#zenRedo').click(); await page.locator('#zenAnnotate').click();
    assert.deepEqual((await chapter(page)).highlights, drawn.highlights, 'paper Redo restores its exact original highlight');

    for (const cancel of ['pointercancel', 'Escape']) {
      await selectGroup(page);
      const before = await chapter(page);
      const pathsBefore = await renderedInk(page);
      await dragGroup(page, 24, 29, 'pen', cancel === 'pointercancel' ? 'pointercancel' : 'pointermove');
      if (cancel === 'Escape') await page.keyboard.press('Escape');
      assert.deepEqual((await chapter(page)).readingWorkspace, before.readingWorkspace, cancel + ' rolls group movement back without persisting it');
      const actual = (await visibleGeometry(page)).card, expected = geometry(before).note;
      near(actual.x, expected.x, cancel + ' restores visible note x'); near(actual.y, expected.y, cancel + ' restores visible note y');
      assert.deepEqual(await renderedInk(page), pathsBefore, cancel + ' restores every rendered stroke');
    }
    await page.locator('[data-workspace-tool="pen"]').click(); await select.click();
    const beforeCancel = await chapter(page);
    await synthetic(page, rectangle(45, 25, 95, 75), 'touch', 'pointercancel');
    assert.equal(await page.locator('.workspace-lasso-preview').count(), 0, 'pointercancel clears an unfinished loop');
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'canceled loop does not select objects');
    assert.deepEqual((await chapter(page)).readingWorkspace, beforeCancel.readingWorkspace, 'canceled loop does not add ink');
    await synthetic(page, rectangle(45, 25, 95, 75), 'pen');
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'an empty loop selects nothing');
    assert.deepEqual((await chapter(page)).readingWorkspace, beforeCancel.readingWorkspace, 'an empty loop is not an edit');

    // Select intercepts gestures that start over sticky text and its action menu.
    const noteBefore = (await chapter(page)).readingExcerpts;
    for (const selector of ['.workspace-note-preview', '.workspace-note-menu summary']) {
      await page.locator('[data-workspace-tool="pen"]').click(); await select.click();
      const start = await card.locator(selector).evaluate(node => {
        const r = node.getBoundingClientRect(), board = document.getElementById('workspaceBoard').getBoundingClientRect();
        const logical = Number(document.getElementById('workspaceBoard').dataset.logicalWidth || 1000);
        return [(r.left + r.width / 2 - board.left) * logical / board.width,
          (r.top + Math.min(r.height / 2, 10) - board.top) * logical / board.width];
      });
      await synthetic(page, [start, [start[0] + 8, start[1] + 8], start], 'pen');
      await card.locator(selector).evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
      assert.equal(await card.locator('textarea.workspace-note').isVisible(), false, 'lasso does not enter note editing');
      assert.equal(await card.locator('.workspace-note-menu').evaluate(node => node.open), false, 'lasso does not activate note buttons');
    }
    assert.deepEqual((await chapter(page)).readingExcerpts, noteBefore, 'lasso over note controls preserves all note content');

    await page.locator('[data-workspace-tool="pen"]').click(); await select.click();
    const beforeTwoFinger = await chapter(page);
    await page.evaluate(() => {
      const board = document.getElementById('workspaceBoard'), rect = board.getBoundingClientRect(), capture = board.setPointerCapture;
      const logical = Number(board.dataset.logicalWidth || 1000);
      board.setPointerCapture = () => {};
      const emit = (type, pointerId, x, y) => board.dispatchEvent(new PointerEvent(type, { bubbles: true,
        cancelable: true, pointerType: 'touch', pointerId, isPrimary: pointerId === 201,
        buttons: type === 'pointerup' ? 0 : 1, clientX: rect.left + x * rect.width / logical, clientY: rect.top + y * rect.width / logical }));
      try {
        emit('pointerdown', 201, 45, 30); emit('pointermove', 201, 60, 50);
        emit('pointerdown', 202, 95, 70); emit('pointermove', 201, 75, 65);
        emit('pointerup', 201, 75, 65); emit('pointerup', 202, 95, 70);
      } finally { board.setPointerCapture = capture; }
    });
    assert.equal(await page.locator('.workspace-lasso-preview').count(), 0, 'second finger cancels unfinished lasso preview');
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'two fingers do not commit an accidental selection');
    assert.deepEqual((await chapter(page)).readingWorkspace, beforeTwoFinger.readingWorkspace, 'two fingers do not create or move ink');

    await selectGroup(page, 'mouse');
    const persisted = await chapter(page);
    await page.screenshot({ path: '/tmp/phloem-lasso-' + ENGINE + '.png' });
    await page.reload({ waitUntil: 'load' }); await waitPdf(page);
    if (!(await page.locator('#workspacePanel').isVisible())) await page.locator('#zenWorkspace').click();
    await page.locator('.workspace-card').waitFor({ state: 'visible' });
    assert.deepEqual(geometry(await chapter(page)), geometry(persisted), 'grouped positions and handwriting persist after reload');
    assert.deepEqual((await chapter(page)).highlights, persisted.highlights, 'reload preserves independent paper marks');
    assert.equal(await page.locator('.workspace-selection-box').isVisible(), false, 'selection is transient across reload');
    assert.deepEqual(errors, [], 'lasso and group movement have no browser errors');
    console.log('PASS  Workspace lasso: pen/mouse/touch, attached ink, zoomed group moves, split history, cancellation and reload (' + ENGINE + ')');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/phloem-lasso-' + ENGINE + '-failure.png' }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
