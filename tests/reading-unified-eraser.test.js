/* Synthetic browser regression coverage for a single PDF annotation eraser.
   This verifies application event/undo logic, not physical Pencil behaviour. */
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual: same } = require('util');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_UNIFIED_ERASER_TEST_PORT || 8176);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0, failures = 0;
function check(name, condition, extra) {
  checks++;
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra === undefined ? '' : '  [' + JSON.stringify(extra) + ']'));
  if (!condition) failures++;
}

function makePdf() {
  const lines = [
    [['Alpha', 72], ['beta', 122], ['gamma', 163], ['delta', 230], ['epsilon', 276], ['zeta', 343], ['eta', 384], ['theta', 418]],
    [['Iota', 72], ['kappa', 109], ['lambda', 166], ['mu', 236], ['nu', 269], ['xi', 299], ['omicron', 322], ['pi', 394]]
  ];
  const stream = lines.map((words, line) => words.map(([word, x], index) =>
    'BT /F' + (index % 2 + 1) + ' 18 Tf 0 g 1 0 0 1 ' + x + ' ' + (700 - line * 48) + ' Tm (' + word + ') Tj ET'
  ).join('\n')).join('\n') + '\n';
  const objects = ['',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 7 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + 'endstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 8 0 R >>',
    '<< /Length 0 >>\nstream\nendstream'
  ];
  let source = '%PDF-1.4\n% Unified annotation eraser fixture\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(source, 'ascii');
    source += index + ' 0 obj\n' + objects[index] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(source, 'ascii');
  source += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let index = 1; index < objects.length; index++) source += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(source + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n', 'ascii');
}

const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  fs.readFile(path.join(ROOT, pathname), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const type = pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'text/javascript'
      : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type }); response.end(data);
  });
});

function seedReader() {
  if (localStorage.getItem('unifiedEraser.fixture.seeded')) return;
  localStorage.setItem('unifiedEraser.fixture.seeded', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ size: 100, measure: 780, leading: 1.7, typeface: 'book', airy: false, focus: false, guide: 'none', guideOrientation: 'row', pdfLayout: 'scroll', guideScope: 'page', guideSize: 'm', guideDim: 55, guideX: .72, guideY: .38, guideLock: false, tone: 'cream', driftSpeed: 4 }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}
async function waitForPdf(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    return canvas && canvas.width > 0 && document.querySelectorAll('.pdf-page').length === 2
      && Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).some(span => span.textContent.trim() === 'Alpha')
      && !document.getElementById('readerPage').classList.contains('hidden');
  });
}
// Handwriting saves once the Pencil has rested for a moment (v194), so reading the stored
// library right after a stroke first waits for that save.
let strokeAt = 0;
async function chapter(page) {
  const wait = strokeAt + 1500 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
function ink(ch, number = 1) { return (ch.pdfInk || {})[number] || []; }
function highlights(ch, number = 1) { return (ch.highlights || {})[number] || []; }
function inkIdentity(items) { return items.map(({ updatedAt, ...stroke }) => stroke); }
function annotations(ch) {
  return { highlights: ch.highlights, pdfInk: Object.fromEntries(Object.entries(ch.pdfInk || {}).map(([number, strokes]) => [number, inkIdentity(strokes)])) };
}
async function click(page, selector) { await page.locator(selector).evaluate(element => element.click()); }
async function writeMode(page, enabled = true) {
  if ((await page.locator('#pdfWriteBtn').getAttribute('aria-pressed') === 'true') !== enabled) await click(page, '#pdfWriteBtn');
  await page.waitForTimeout(50);
}
async function positionPage(page, number = 1) {
  await page.locator('.pdf-page[data-page="' + number + '"]').evaluate(element => {
    const pane = document.getElementById('documentPane');
    pane.scrollTop += element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
  });
  await page.waitForTimeout(100);
}
async function point(page, x, y, number = 1) {
  return page.locator('.pdf-page[data-page="' + number + '"] .pdf-sheet').evaluate((element, coordinate) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width * coordinate.x, y: rect.top + rect.height * coordinate.y };
  }, { x, y });
}
async function wordPoint(page, word, end = false) {
  return page.evaluate(({ word, end }) => {
    const span = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).find(item => item.textContent.trim() === word);
    const rect = span.getBoundingClientRect();
    return { x: end ? rect.right - 2 : rect.left + 2, y: rect.top + rect.height / 2 };
  }, { word, end });
}
async function pointer(page, type, point, options = {}) {
  return page.evaluate(({ type, point, options }) => {
    const target = document.elementFromPoint(point.x, point.y) || document.getElementById('documentPane');
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: options.pointerType || 'pen', pointerId: options.id || 71, isPrimary: true, button: 0,
      buttons: /up|cancel/.test(type) ? 0 : 1, pressure: /up|cancel/.test(type) ? 0 : .6, clientX: point.x, clientY: point.y });
    target.dispatchEvent(event); return event.defaultPrevented;
  }, { type, point, options }).finally(() => { if (/up|cancel/.test(type)) strokeAt = Date.now(); });
}
async function touch(page, type, point, options = {}) {
  return page.evaluate(({ type, point, options }) => {
    const target = document.elementFromPoint(point.x, point.y) || document.getElementById('documentPane');
    const stylus = { identifier: 91, target, touchType: 'stylus', clientX: point.x, clientY: point.y, pageX: point.x + scrollX, pageY: point.y + scrollY, force: .6 };
    const palm = { identifier: 92, target, touchType: 'direct', clientX: point.x + 15, clientY: point.y + 15, force: .4 };
    const changedTouches = options.palm ? [palm] : [stylus];
    const touches = /end|cancel/.test(type) ? options.palm ? [stylus] : [] : options.palm ? [stylus, palm] : [stylus];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { changedTouches: { value: changedTouches }, touches: { value: touches }, targetTouches: { value: touches } });
    target.dispatchEvent(event); return event.defaultPrevented;
  }, { type, point, options }).finally(() => { if (/end|cancel/.test(type)) strokeAt = Date.now(); });
}
async function stroke(page, from, to, options = {}) {
  const steps = options.steps || 8;
  await pointer(page, 'pointerdown', from, options);
  for (let step = 1; step <= steps; step++) await pointer(page, 'pointermove', { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps }, options);
  await pointer(page, options.cancel ? 'pointercancel' : 'pointerup', to, options);
  await page.waitForTimeout(100);
}
async function mixedSweep(page) {
  const from = await wordPoint(page, 'Alpha'), to = await wordPoint(page, 'theta', true);
  return [{ x: from.x - 30, y: from.y }, { x: to.x + 30, y: to.y }];
}
async function mark(page, first, last, note) {
  await stroke(page, await wordPoint(page, first), await wordPoint(page, last, true));
  if (note) {
    const point = await wordPoint(page, first);
    await stroke(page, point, point);
    await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
    await page.locator('#selectionNote').fill(note);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
  }
}
async function reset(page, saved, mode) {
  await page.evaluate(saved => localStorage.setItem('readingRoom.v1', saved), saved);
  await page.reload({ waitUntil: 'load' });
  await waitForPdf(page);
  await positionPage(page);
  if (mode === 'write') {
    await writeMode(page);
    await click(page, '[data-pdf-ink-tool="eraser"]');
  } else if (mode === 'marker') {
    await click(page, '#highlightToolbar [data-highlight-eraser]');
  }
  await positionPage(page);
}
async function undo(page) { await click(page, '#pdfInkUndo'); await page.waitForTimeout(60); }
async function redo(page) { await click(page, '#pdfInkRedo'); await page.waitForTimeout(60); }
async function previewCounts(page) {
  return page.evaluate(() => ({ ink: document.querySelectorAll('.pdf-ink-erasing').length, highlights: document.querySelectorAll('.erasing-highlight').length }));
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(18000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seedReader);
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'unified-eraser.pdf', mimeType: 'application/pdf', buffer: makePdf() });
    await waitForPdf(page);
    await positionPage(page);
    await mark(page, 'Alpha', 'beta', 'Keep the first note and its identity.');
    await mark(page, 'Iota', 'kappa', 'Untouched second-line note.');
    await mark(page, 'epsilon', 'theta', 'Keep the third note and stacking order.');
    await writeMode(page);
    await positionPage(page);
    await stroke(page, await wordPoint(page, 'Alpha'), await wordPoint(page, 'beta', true));
    const epsilon = await wordPoint(page, 'epsilon');
    await stroke(page, { x: epsilon.x + 10, y: epsilon.y - 18 }, { x: epsilon.x + 10, y: epsilon.y + 18 });
    await stroke(page, await point(page, .2, .35), await point(page, .4, .35));
    await positionPage(page, 2);
    await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"] canvas')?.width > 0);
    await stroke(page, await point(page, .2, .25, 2), await point(page, .4, .25, 2));
    await writeMode(page, false);
    const baseline = await chapter(page);
    check('fixture has three real highlights with notes, three ink strokes, and blank-page ink', highlights(baseline).length === 3
      && highlights(baseline).every(item => !!item.note) && ink(baseline).length === 3 && ink(baseline, 2).length === 1, { highlights: highlights(baseline), ink: ink(baseline).length, blankInk: ink(baseline, 2).length });
    if (highlights(baseline).length !== 3 || ink(baseline).length !== 3 || ink(baseline, 2).length !== 1) throw new Error('Fixture setup failed');
    const saved = await page.evaluate(() => localStorage.getItem('readingRoom.v1'));

    for (const mode of ['write', 'marker']) {
      await reset(page, saved, mode);
      const before = await chapter(page), [from, to] = await mixedSweep(page);
      check(mode + ' eraser starts with a fresh disabled Undo history', await page.locator('#pdfInkUndo').isDisabled());
      await pointer(page, 'pointerdown', from);
      await touch(page, 'touchstart', from);
      await pointer(page, 'pointermove', to);
      await touch(page, 'touchmove', to);
      const preview = await previewCounts(page);
      check(mode + ' eraser previews both annotation types during a sparse sweep', preview.ink >= 2 && preview.highlights >= 2, preview);
      check(mode + ' eraser preview does not persist deletion before lift', same(annotations(await chapter(page)), annotations(before)));
      await pointer(page, 'pointerdown', to, { pointerType: 'touch', id: 92 });
      await pointer(page, 'pointerup', to, { pointerType: 'touch', id: 92 });
      await touch(page, 'touchend', to, { palm: true });
      check(mode + ' eraser ignores a palm lifting during an active Pencil gesture', same(annotations(await chapter(page)), annotations(before))
        && (await previewCounts(page)).ink >= 2);
      await pointer(page, 'pointerup', to);
      await touch(page, 'touchend', to);
      await page.waitForTimeout(100);
      const erased = await chapter(page);
      check(mode + ' eraser removes crossed ink and highlights together, retaining untouched annotations', highlights(erased).length === 1
        && highlights(erased)[0].id === highlights(before)[1].id && ink(erased).length === 1 && ink(erased)[0].id === ink(before)[2].id
        && same(ink(erased, 2), ink(before, 2)), { highlights: highlights(erased).length, ink: ink(erased).length });
      check(mode + ' eraser clears all dimming after commit', same(await previewCounts(page), { ink: 0, highlights: 0 }));
      check(mode + ' eraser keeps its chosen mode without unexpectedly entering Write', (await page.locator('#pdfWriteBtn').getAttribute('aria-pressed') === 'true') === (mode === 'write'));
      await undo(page);
      check(mode + ' single Undo restores highlight IDs, notes, full records and original stacking order', same((await chapter(page)).highlights, before.highlights));
      check(mode + ' same Undo restores ink IDs, ordered points, pressure and page ordering', same(annotations(await chapter(page)), annotations(before)));
      check(mode + ' mixed erase occupies exactly one Undo entry', await page.locator('#pdfInkUndo').isDisabled());
      await redo(page);
      check(mode + ' single Redo reapplies both deletions and leaves untouched annotations intact', same(annotations(await chapter(page)), annotations(erased)));
      await undo(page);
      check(mode + ' repeated Undo after Redo still restores exact annotation identities', same(annotations(await chapter(page)), annotations(before)));
    }

    const cancellations = [
      ['pointer cancellation', async (page, to) => pointer(page, 'pointercancel', to)],
      ['lost pointer capture', async (page, to) => pointer(page, 'lostpointercapture', to)],
      ['window blur', async page => page.evaluate(() => window.dispatchEvent(new Event('blur')))],
      ['page hiding', async page => page.evaluate(() => window.dispatchEvent(new Event('pagehide')))],
      ['document scrolling', async page => page.evaluate(() => document.getElementById('documentPane').dispatchEvent(new Event('scroll')))],
      ['paired stylus cancellation', async (page, to) => touch(page, 'touchcancel', to)]
    ];
    for (const mode of ['write', 'marker']) {
      await reset(page, saved, mode);
      const before = await chapter(page), [from, to] = await mixedSweep(page);
      for (const [name, cancel] of cancellations) {
        await pointer(page, 'pointerdown', from);
        await touch(page, 'touchstart', from);
        await pointer(page, 'pointermove', to);
        await cancel(page, to);
        await pointer(page, 'pointerup', to);
        await touch(page, 'touchend', to);
        check(mode + ' ' + name + ' does not erase or leave a preview/history entry', same(annotations(await chapter(page)), annotations(before))
          && same(await previewCounts(page), { ink: 0, highlights: 0 }) && await page.locator('#pdfInkUndo').isDisabled());
      }
      const down = await pointer(page, 'pointerdown', from, { pointerType: 'touch', id: 98 });
      const move = await pointer(page, 'pointermove', to, { pointerType: 'touch', id: 98 });
      await pointer(page, 'pointerup', to, { pointerType: 'touch', id: 98 });
      check(mode + ' eraser does not intercept finger scrolling or mutate annotations', !down && !move && same(annotations(await chapter(page)), annotations(before)));
      await touch(page, 'touchstart', from);
      await touch(page, 'touchmove', to);
      check(mode + ' touch-only Pencil fallback previews both types without saving', (await previewCounts(page)).ink >= 2
        && (await previewCounts(page)).highlights >= 2 && same(annotations(await chapter(page)), annotations(before)));
      await touch(page, 'touchend', to);
      check(mode + ' touch-only Pencil fallback erases both types once', highlights(await chapter(page)).length === 1 && ink(await chapter(page)).length === 1);
      await undo(page);
      check(mode + ' touch-only mixed erase is one reversible history action', same(annotations(await chapter(page)), annotations(before)) && await page.locator('#pdfInkUndo').isDisabled());
    }

    for (const mode of ['write', 'marker']) {
      await reset(page, saved, mode);
      const before = await chapter(page);
      await stroke(page, await wordPoint(page, 'Iota'), await wordPoint(page, 'kappa', true), { steps: 1 });
      check(mode + ' eraser supports highlight-only contact without touching ink', highlights(await chapter(page)).length === 2 && same((await chapter(page)).pdfInk, before.pdfInk));
      await undo(page);
      await stroke(page, await point(page, .2, .35), await point(page, .4, .35), { steps: 1 });
      check(mode + ' eraser supports ink-only contact on a text page', ink(await chapter(page)).length === 2 && same((await chapter(page)).highlights, before.highlights));
      await undo(page);
      await positionPage(page, 2);
      await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"] canvas')?.width > 0);
      check(mode + ' scanned-style fixture has no selectable text', await page.locator('.pdf-page[data-page="2"] .text-layer span').count() === 0);
      const blankBefore = await chapter(page);
      await stroke(page, await point(page, .17, .25, 2), await point(page, .43, .25, 2), { steps: 1, cancel: true });
      check(mode + ' cancelled blank-page erase preserves annotation storage byte-for-byte', JSON.stringify((await chapter(page)).highlights) === JSON.stringify(blankBefore.highlights)
        && JSON.stringify((await chapter(page)).pdfInk) === JSON.stringify(blankBefore.pdfInk) && await page.locator('#pdfInkUndo').isDisabled());
      await stroke(page, await point(page, .65, .3, 2), await point(page, .8, .3, 2), { steps: 1 });
      check(mode + ' empty blank-page sweep creates neither highlight buckets nor history', JSON.stringify((await chapter(page)).highlights) === JSON.stringify(blankBefore.highlights)
        && JSON.stringify((await chapter(page)).pdfInk) === JSON.stringify(blankBefore.pdfInk) && await page.locator('#pdfInkUndo').isDisabled());
      await stroke(page, await point(page, .17, .25, 2), await point(page, .43, .25, 2), { steps: 1 });
      check(mode + ' eraser works on blank/scanned-style pages without a text-layer target', ink(await chapter(page), 2).length === 0 && same(annotations(await chapter(page)).highlights, before.highlights)
        && same(inkIdentity(ink(await chapter(page))), inkIdentity(ink(before))));
      await undo(page);
      check(mode + ' Undo restores the blank-page stroke without changing other pages', same(annotations(await chapter(page)), annotations(before)));
    }

    await reset(page, saved, 'write');
    const zoomBefore = await chapter(page), widthBefore = (await page.locator('.pdf-page[data-page="1"]').boundingBox()).width;
    await click(page, '#zoomIn');
    await page.waitForTimeout(500);
    await positionPage(page);
    const [zoomFrom, zoomTo] = await mixedSweep(page);
    await stroke(page, zoomFrom, zoomTo, { steps: 1 });
    check('zoomed geometry still removes crossed ink and highlights together', (await page.locator('.pdf-page[data-page="1"]').boundingBox()).width > widthBefore
      && highlights(await chapter(page)).length === 1 && ink(await chapter(page)).length === 1);
    await undo(page);
    check('Undo after a zoomed erase preserves normalized annotations exactly', same(annotations(await chapter(page)), annotations(zoomBefore)));

    // Exercise the engine's hold hook through the complete reader integration,
    // including persisted geometry and the reader's shared annotation history.
    await reset(page, saved, 'write');
    await click(page, '#zoomLabel');
    await page.waitForTimeout(250);
    await positionPage(page);
    await click(page, '[data-pdf-ink-tool="pen"]');
    const holdBefore = await chapter(page), holdFrom = await point(page, .2, .25), holdTo = await point(page, .6, .28);
    await pointer(page, 'pointerdown', holdFrom);
    for (let step = 1; step <= 8; step++) await pointer(page, 'pointermove', {
      x: holdFrom.x + (holdTo.x - holdFrom.x) * step / 8,
      y: holdFrom.y + (holdTo.y - holdFrom.y) * step / 8 + (step < 8 ? Math.sin(step) * 6 : 0)
    });
    await page.waitForTimeout(700);
    check('holding a drawn line snaps the app preview without saving before Pencil lift', await page.locator('.pdf-ink-preview.pdf-ink-straight').count() === 1
      && same(annotations(await chapter(page)), annotations(holdBefore)));
    await pointer(page, 'pointerup', holdTo);
    const held = await chapter(page), heldStroke = ink(held).find(item => !ink(holdBefore).some(old => old.id === item.id));
    check('lifting a held line persists one two-point straight stroke without touching highlights', ink(held).length === ink(holdBefore).length + 1
      && heldStroke?.points.length === 2 && Math.abs(heldStroke.points[0][0] - .2) < .005 && Math.abs(heldStroke.points[0][1] - .25) < .005
      && Math.abs(heldStroke.points[1][0] - .6) < .005 && Math.abs(heldStroke.points[1][1] - .28) < .005 && same(held.highlights, holdBefore.highlights), heldStroke);
    await undo(page);
    check('one Undo removes the app-level held line and restores the previous annotation state', !!heldStroke && same(annotations(await chapter(page)), annotations(holdBefore))
      && await page.locator('#pdfInkUndo').isDisabled());
    await redo(page);
    check('one Redo restores the same straight-line identity, color, width and endpoints', !!heldStroke && same(annotations(await chapter(page)), annotations(held)));
    check('unified eraser workflows have no uncaught page errors', errors.length === 0, errors);
    console.log('Unified PDF eraser: ' + (checks - failures) + '/' + checks + ' passed (' + browserName + ').');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error('FATAL', error); server.close(); process.exitCode = 1; });
