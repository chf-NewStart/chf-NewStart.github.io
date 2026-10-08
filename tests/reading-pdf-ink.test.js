/* Browser integration coverage for PDF handwriting. Synthetic Pointer/Touch
   events verify app logic, not physical Pencil pressure or palm rejection. */
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isDeepStrictEqual: same } = require('util');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_INK_TEST_PORT || 8167);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';

function makeInkPdf() {
  const stream = 'BT /F1 18 Tf 0 g 1 0 0 1 72 700 Tm (Alpha beta gamma delta epsilon) Tj ET\n';
  const objects = ['',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + 'endstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 7 0 R >>',
    '<< /Length 0 >>\nstream\nendstream'
  ];
  let source = '%PDF-1.4\n% Phloem handwriting fixture with a blank second page\n';
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
let failures = 0, checks = 0;
function check(name, condition, extra) {
  checks++;
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra === undefined ? '' : '  [' + extra + ']'));
  if (!condition) failures++;
}
function checkStoredInk() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'reading-ink.js'), 'utf8'), sandbox);
  const engine = sandbox.window.PhloemInk;
  const first = { id: 'one', color: 'blue', width: 3, points: [[.1, .2, .4], [.3, .4, .8]], at: 10, updatedAt: 10 };
  const second = { id: 'two', color: 'red', width: 5, points: [[.7, .8, .5]], at: 20, updatedAt: 20 };
  const merged = engine.merge({ '1': [first] }, {}, { '2': [second] }, {});
  check('stored ink merges independent strokes on separate pages', merged.pages['1'][0].id === 'one' && merged.pages['2'][0].id === 'two');
  const stale = engine.merge({ '1': [first] }, { one: 30 }, { '1': [first] }, {});
  check('ink deletion tombstones defeat stale remote copies', !stale.pages['1']?.length && stale.deleted.one === 30);
  const restored = engine.merge({ '1': [first] }, { one: 30 }, { '1': [{ ...first, updatedAt: 31 }] }, {});
  check('newer intentional restoration beats its deletion tombstone', restored.pages['1'][0].id === 'one' && restored.pages['1'][0].updatedAt === 31);
  const newer = { ...first, color: 'red', updatedAt: 20 };
  const forward = engine.merge({ '1': [first] }, {}, { '1': [newer, second] }, {});
  const reverse = engine.merge({ '1': [newer, second] }, {}, { '1': [first] }, {});
  check('ink merge is order-independent and retains the latest same-ID stroke', JSON.stringify(forward) === JSON.stringify(reverse) && forward.pages['1'].length === 2 && forward.pages['1'][0].color === 'red');
  const sanitized = engine.normalize({ '1': [first, { ...second, points: [[Infinity, .3, .5]] }, { ...second, id: '__proto__' }, { ...second, id: 'clamped', color: '<script>', width: 900, points: [[-2, 3, 8]] }], invalid: [first], '0': [first] }, {});
  check('import normalization rejects invalid ink and clamps unsafe dimensions', Object.keys(sanitized.pages).join() === '1' && sanitized.pages['1'].length === 2 && sanitized.pages['1'][1].color === 'black' && sanitized.pages['1'][1].width <= 12 && JSON.stringify(sanitized.pages['1'][1].points[0]) === '[0,1,1]');
}
function seedReader() {
  if (localStorage.getItem('ink.fixture.seeded')) return;
  localStorage.setItem('ink.fixture.seeded', '1');
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
      && !document.getElementById('readerPage').classList.contains('hidden');
  });
}
/* Zen is the sole reader (1a215db5 "Make Zen the sole reader and return directly to
   library"): its ✕ now leaves for the library and clears the open paper, so the test
   stays on the Zen paper and reaches every control the way a reader does now. */
async function useDefaultZen(page) {
  await page.waitForFunction(() => document.body.classList.contains('zen'));
}
async function openZenMore(page) {
  if (!await page.locator('#zenMoreMenu').isVisible()) await page.locator('#zenMore').click();
  await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
}
async function setReadingSettings(page, open) {
  if (await page.locator('#comfortBar').isVisible() === open) return;
  if (open) { await openZenMore(page); await page.locator('#zenSettings').click(); }
  else await page.locator('#comfortClose').click();
  await page.locator('#comfortBar').waitFor({ state: open ? 'visible' : 'hidden' });
}
async function paperControl(page, selector) {
  await openZenMore(page);
  await page.locator('#zenReadingControls').click();
  await page.locator('#readerControlsDialog').waitFor({ state: 'visible' });
  await page.locator(selector).click();
  if (await page.locator('#readerControlsDialog').isVisible()) await page.locator('#readerControlsDialog [data-close="readerControlsDialog"]').click();
  await page.locator('#readerControlsDialog').waitFor({ state: 'hidden' });
}
async function zenLayout(page, layout) {
  await openZenMore(page);
  await page.locator('#zenLayout').click();
  await page.locator('[data-zen-pdf-layout="' + layout + '"]').click();
}
// Handwriting saves once the Pencil has rested for a moment (v194), so reading the stored
// library right after a stroke first waits for that save.
let strokeAt = 0, penDown = false;
async function chapter(page) {
  // Some gestures here are dispatched inside the page, so allow for the save, except while
  // a Pencil is still down: pausing then would turn the stroke into a held straight line.
  if (!penDown) await page.waitForTimeout(Math.max(1400, strokeAt + 1500 - Date.now()));
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id);
  });
}
async function ink(page, number = 1) { return (await chapter(page)).pdfInk?.[number] || []; }
function identities(strokes) { return JSON.stringify(strokes.map(({ updatedAt, ...stroke }) => stroke).sort((a, b) => a.id.localeCompare(b.id))); }
async function markCount(page) { return Object.values((await chapter(page)).highlights || {}).reduce((count, items) => count + items.length, 0); }
async function click(page, selector) { await page.locator(selector).evaluate(element => element.click()); }
// Paper Undo sits directly on the Zen dock since 62af6da4 "Expose paper undo".
async function zenAction(page, selector) {
  const menu = selector === '#zenFind' ? 'More' : 'Annotate';
  if (selector !== '#zenUndo' && !await page.locator('#zen' + menu + 'Menu').isVisible()) await page.locator('#zen' + menu).click();
  await page.locator(selector).click();
}
async function showZenAction(page, selector) {
  const menu = selector === '#zenFind' ? 'More' : 'Annotate';
  if (selector !== '#zenUndo' && !await page.locator('#zen' + menu + 'Menu').isVisible()) await page.locator('#zen' + menu).click();
}
async function writeMode(page, enabled = true) {
  if ((await page.locator('#zenWrite').getAttribute('aria-pressed') === 'true') !== enabled) await zenAction(page, '#zenWrite');
  await page.waitForTimeout(60);
}
async function positionPage(page, number) {
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
async function pointer(page, type, location, options = {}) {
  return page.evaluate(({ type, location, options }) => {
    const target = document.elementFromPoint(location.x, location.y) || document.getElementById('documentPane');
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: options.pointerType || 'pen', pointerId: options.id || 71, isPrimary: true, button: 0,
      buttons: options.buttons === undefined ? /up|cancel/.test(type) ? 0 : 1 : options.buttons,
      pressure: options.pressure === undefined ? /up|cancel/.test(type) ? 0 : .6 : options.pressure, clientX: location.x, clientY: location.y });
    target.dispatchEvent(event); return { prevented: event.defaultPrevented, target: target.tagName };
  }, { type, location, options }).finally(() => {
    if ((options.pointerType || 'pen') !== 'pen') return;
    if (type === 'pointerdown') penDown = true;
    if (/up|cancel/.test(type)) { penDown = false; strokeAt = Date.now(); }
  });
}
async function touch(page, type, location, options = {}) {
  return page.evaluate(({ type, location, options }) => {
    const target = document.elementFromPoint(location.x, location.y) || document.getElementById('documentPane');
    const stylus = { identifier: 91, target, touchType: 'stylus', clientX: location.x, clientY: location.y, pageX: location.x + scrollX, pageY: location.y + scrollY, force: .65 };
    const palm = { identifier: 92, target, touchType: 'direct', clientX: location.x + 15, clientY: location.y + 15, force: .4 };
    const changedTouches = options.palm ? [palm] : [stylus];
    const touches = /end|cancel/.test(type) ? options.palm ? [stylus] : [] : options.palm ? [stylus, palm] : [stylus];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { changedTouches: { value: changedTouches }, touches: { value: touches }, targetTouches: { value: touches } });
    target.dispatchEvent(event); return event.defaultPrevented;
  }, { type, location, options });
}
async function stroke(page, from, to, options = {}) {
  await pointer(page, 'pointerdown', from, { ...options, pressure: .2 });
  for (let step = 1; step <= 8; step++) await pointer(page, 'pointermove', { x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }, { ...options, pressure: .2 + .7 * step / 8 });
  await pointer(page, options.cancel ? 'pointercancel' : 'pointerup', to, options);
  await page.waitForTimeout(100);
}
async function backup(page) {
  const downloaded = page.waitForEvent('download');
  await click(page, '#backupBtn');
  return JSON.parse(fs.readFileSync(await (await downloaded).path(), 'utf8'));
}
async function hasPreview(page) {
  return page.locator('.pdf-ink-preview').count();
}
async function checkZenUndo(browser) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(18000);
    await page.addInitScript(seedReader);
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'zen-undo.pdf', mimeType: 'application/pdf', buffer: makeInkPdf() });
    await waitForPdf(page);
    await useDefaultZen(page);
    await showZenAction(page, '#zenUndo');
    const undo = page.locator('#zenUndo');
    check('Zen exposes a named Undo button, disabled when there is no edit history', await undo.isVisible() && await undo.isDisabled()
      && /undo/i.test(await undo.getAttribute('aria-label')));

    await zenAction(page, '#zenWrite');
    await positionPage(page, 1);
    let from = await point(page, .2, .3), to = await point(page, .4, .35);
    await stroke(page, from, to);
    await page.locator('#pdfInkDone').click();
    check('Zen Undo remains enabled after closing the handwriting toolbar', !await undo.isDisabled() && (await ink(page)).length === 1
      && !await page.locator('#pdfInkToolbar').isVisible() && await page.locator('#zenWrite').getAttribute('aria-pressed') === 'false');
    if (process.env.PHLOEM_ZEN_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_ZEN_SCREENSHOT + '-enabled.png' });
    await zenAction(page, '#zenUndo');
    check('Zen Undo removes saved ink with Write off and keeps Zen open', (await ink(page)).length === 0
      && await page.locator('body').evaluate(element => element.classList.contains('zen')));
    check('empty Undo history synchronizes Zen, touch-dock, and handwriting controls', await undo.isDisabled()
      && await page.locator('#touchUndo').isDisabled() && await page.locator('#pdfInkUndo').isDisabled());
    await click(page, '#pdfInkRedo');
    check('shared Redo re-enables Zen Undo and restores the same ink', (await ink(page)).length === 1 && !await undo.isDisabled());
    await zenAction(page, '#zenUndo');

    // Interleave ink and a real PDF text highlight, then unwind the shared trail.
    await zenAction(page, '#zenWrite');
    await positionPage(page, 1);
    from = await point(page, .2, .3); to = await point(page, .4, .35);
    await stroke(page, from, to);
    const savedInk = identities(await ink(page));
    await page.locator('#pdfInkDone').click();
    const textPoints = await page.locator('.pdf-page[data-page="1"] .text-layer span').first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      return [{ x: rect.left + 2, y: rect.top + rect.height / 2 }, { x: rect.left + rect.width * .6, y: rect.top + rect.height / 2 }];
    });
    await stroke(page, textPoints[0], textPoints[1]);
    check('Zen text highlighting enables Undo without entering Write', await markCount(page) === 1 && !await undo.isDisabled()
      && await page.locator('#zenWrite').getAttribute('aria-pressed') === 'false');
    await zenAction(page, '#zenUndo');
    check('Zen Undo follows chronology: newest text highlight is removed before older ink', await markCount(page) === 0
      && identities(await ink(page)) === savedInk && !await undo.isDisabled());
    await zenAction(page, '#zenUndo');
    check('Zen Undo then removes the older ink and disables the empty history', (await ink(page)).length === 0
      && await markCount(page) === 0 && await undo.isDisabled());

    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const geometry = await page.locator('#zenDock').evaluate(dock => {
        const controls = Array.from(dock.querySelectorAll(':scope > button, :scope > .zen-tool > button')).filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width && rect.height;
        }).map(button => {
          const rect = button.getBoundingClientRect();
          return { id: button.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
        });
        return { controls, viewport: { width: innerWidth, height: innerHeight } };
      });
      check('Zen dock keeps all seven touch-sized controls onscreen at ' + viewport.width + '×' + viewport.height,
        same(geometry.controls.map(rect => rect.id), ['zenExit', 'zenGuide', 'zenLayout', 'zenAnnotate', 'zenUndo', 'zenWorkspace', 'zenMore'])
        && geometry.controls.every(rect => rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.y >= 0
          && rect.right <= geometry.viewport.width + 1 && rect.bottom <= geometry.viewport.height + 1), JSON.stringify(geometry));
      if (process.env.PHLOEM_ZEN_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_ZEN_SCREENSHOT + '-' + viewport.width + 'x' + viewport.height + '.png' });
      await zenAction(page, '#zenFind');
      const findGeometry = await page.locator('#findBar').evaluate(element => {
        const rect = element.getBoundingClientRect(), dock = document.getElementById('zenDock').getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, dockLeft: dock.left, width: innerWidth, height: innerHeight };
      });
      check('Zen Find stays onscreen and clear of the dock at ' + viewport.width + '×' + viewport.height,
        findGeometry.x >= 0 && findGeometry.y >= 0 && findGeometry.bottom <= findGeometry.height
          && findGeometry.right < findGeometry.dockLeft, JSON.stringify(findGeometry));
      if (process.env.PHLOEM_ZEN_SCREENSHOT && viewport.height < 600) await page.screenshot({ path: process.env.PHLOEM_ZEN_SCREENSHOT + '-short-find.png' });
      await zenAction(page, '#zenFind');
    }
    await page.setViewportSize({ width: 1180, height: 1000 });
    await waitForPdf(page);
    await page.waitForTimeout(300);
    await zenAction(page, '#zenWrite');
    await positionPage(page, 1);
    from = await point(page, .2, .3); to = await point(page, .4, .35);
    await stroke(page, from, to);
    await page.locator('#pdfInkDone').click();
    const beforeReload = identities(await ink(page));
    await page.reload({ waitUntil: 'load' });
    await waitForPdf(page);
    await useDefaultZen(page);
    await showZenAction(page, '#zenUndo');
    check('reopening keeps saved ink but correctly resets the session-only Zen Undo history', beforeReload !== '[]'
      && same(JSON.parse(identities(await ink(page))), JSON.parse(beforeReload)) && await page.locator('#zenUndo').isDisabled(),
      JSON.stringify({ beforeReload, afterReload: identities(await ink(page)), disabled: await page.locator('#zenUndo').isDisabled() }));
    check('Zen Undo workflows have no uncaught page errors', errors.length === 0, errors.join('; '));
  } finally { await context.close(); }
}

(async () => {
  let browser;
  try {
    checkStoredInk();
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(18000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seedReader);
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'handwriting-blank-page.pdf', mimeType: 'application/pdf', buffer: makeInkPdf() });
    await waitForPdf(page);
    await useDefaultZen(page);
    check('PDF opens with highlighting as the default and Write off', await page.locator('#zenWrite').getAttribute('aria-pressed') === 'false' && !await page.locator('#pdfInkToolbar').isVisible());
    await positionPage(page, 1);
    let from = await point(page, .2, .3), to = await point(page, .4, .35);
    await stroke(page, from, to);
    check('Pencil movement in blank margins does not write without explicit Write mode', (await ink(page)).length === 0 && await markCount(page) === 0);
    await writeMode(page);
    check('Write mode exposes ink controls and synchronizes the Zen dock', await page.locator('#pdfInkToolbar').isVisible() && await page.locator('#zenWrite').getAttribute('aria-pressed') === 'true');
    await positionPage(page, 1);
    from = await point(page, .2, .3); to = await point(page, .4, .35);
    await pointer(page, 'pointerdown', from, { pressure: .2 });
    await touch(page, 'touchstart', from);
    await pointer(page, 'pointermove', to, { pressure: .8 });
    await touch(page, 'touchmove', to);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.pdf-ink-preview path')).some(path => path.getBoundingClientRect().width > 0), null, { timeout: 2000 }).catch(() => null);
    const previewVisible = await page.locator('.pdf-ink-preview path').evaluateAll(paths => paths.some(path => path.getAttribute('fill') && path.getBoundingClientRect().width > 0 && path.getBoundingClientRect().height > 0));
    check('handwriting visibly previews before lift without saving', previewVisible && (await ink(page)).length === 0);
    await pointer(page, 'pointerdown', to, { pointerType: 'touch', id: 92 });
    await pointer(page, 'pointerup', to, { pointerType: 'touch', id: 92 });
    check('a palm lifting cannot commit or cancel the active Pencil stroke', !!await hasPreview(page) && (await ink(page)).length === 0);
    await pointer(page, 'pointerup', to);
    await touch(page, 'touchend', to);
    await page.waitForTimeout(100);
    let first = (await ink(page))[0];
    check('new handwriting defaults to saved Natural ink', first?.style === 'natural');
    check('the first saved stroke uses Fine width by default', first?.width === 1.5);
    check('paired Pointer and stylus events save exactly one freehand stroke', (await ink(page)).length === 1 && !!first?.id && !await hasPreview(page));
    check('stroke stores normalized page coordinates and pressure samples', first?.points.length >= 2 && first.points.every(p => p.length === 3 && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1 && p[2] >= 0 && p[2] <= 1) && first.points.some(p => Math.abs(p[2] - .2) < .01) && first.points.some(p => Math.abs(p[2] - .8) < .01), JSON.stringify(first));
    check('writing creates no text highlights and renders a saved SVG stroke', await markCount(page) === 0 && await page.locator('.pdf-ink-stroke[data-ink-id="' + first?.id + '"]').count() === 1);
    const beforeStyleChange=JSON.stringify(await ink(page));
    await setReadingSettings(page, true);
    await page.locator('[data-pdf-ink-style="clean"]').click();
    check('Clean is selectable without rewriting existing Natural notes', await page.locator('[data-pdf-ink-style="clean"]').getAttribute('aria-pressed') === 'true' && JSON.stringify(await ink(page)) === beforeStyleChange);
    await setReadingSettings(page, false);
    const beforeFinger = JSON.stringify(await ink(page));
    const fingerDown = await pointer(page, 'pointerdown', from, { pointerType: 'touch', id: 98 });
    const fingerMove = await pointer(page, 'pointermove', to, { pointerType: 'touch', id: 98 });
    await pointer(page, 'pointerup', to, { pointerType: 'touch', id: 98 });
    check('finger gestures do not draw and remain available for scrolling', !fingerDown.prevented && !fingerMove.prevented && JSON.stringify(await ink(page)) === beforeFinger);

    const rapidFrom = await point(page, .55, .3), rapidTo = await point(page, .7, .35);
    await page.evaluate(({ from, to }) => {
      function fire(type, point, id) {
        const target = document.elementFromPoint(point.x, point.y);
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: id, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: .6, clientX: point.x, clientY: point.y }));
      }
      // Both gestures start before requestAnimationFrame can paint the first dot.
      fire('pointerdown', from, 71); fire('pointerup', from, 71);
      fire('pointerdown', from, 71); fire('pointermove', to, 71);
    }, { from: rapidFrom, to: rapidTo });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.pdf-ink-preview path')).some(path => path.getBoundingClientRect().width > 0), null, { timeout: 2000 }).catch(() => null);
    // Saves wait while a Pencil is down (v194), so the dot's save is checked after the lift.
    check('a fast Pencil dot cannot prevent the following stroke preview from painting', await page.locator('.pdf-ink-preview path').count() > 0);
    await pointer(page, 'pointercancel', rapidTo);
    check('the fast dot saves once the Pencil rests', (await ink(page)).length === JSON.parse(beforeFinger).length + 1);
    await click(page, '#pdfInkUndo');
    check('fast tap creates one undoable dot without committing the cancelled next stroke', identities(await ink(page)) === identities(JSON.parse(beforeFinger)));

    await click(page, '[data-pdf-ink-color="blue"]');
    await click(page, '[data-pdf-ink-width="5"]');
    from = await point(page, .22, .45); to = await point(page, .45, .47);
    await touch(page, 'touchstart', from);
    await touch(page, 'touchmove', to);
    await touch(page, 'touchstart', to, { palm: true });
    await touch(page, 'touchend', to, { palm: true });
    check('stylus Touch fallback previews and ignores a palm release', (await ink(page)).length === 1 && !!await hasPreview(page));
    await touch(page, 'touchend', to);
    await page.waitForTimeout(100);
    const blue = (await ink(page))[1];
    check('Touch fallback commits one stroke in the chosen color and width', (await ink(page)).length === 2 && blue?.color === 'blue' && blue.width === 5, JSON.stringify(blue));

    const beforeCancel = JSON.stringify(await ink(page));
    const cancellations = [
      ['pointer cancellation', async () => pointer(page, 'pointercancel', to)],
      ['lost pointer capture', async () => pointer(page, 'lostpointercapture', to)],
      ['window blur', async () => page.evaluate(() => window.dispatchEvent(new Event('blur')))],
      ['page hiding', async () => page.evaluate(() => window.dispatchEvent(new Event('pagehide')))],
      ['window resize', async () => page.evaluate(() => window.dispatchEvent(new Event('resize')))],
      ['document scrolling', async () => page.evaluate(() => document.getElementById('documentPane').dispatchEvent(new Event('scroll')))],
      ['paired stylus touch cancellation', async () => touch(page, 'touchcancel', to)]
    ];
    for (const [name, cancel] of cancellations) {
      await pointer(page, 'pointerdown', from);
      await touch(page, 'touchstart', from);
      await pointer(page, 'pointermove', to);
      await cancel();
      await pointer(page, 'pointerup', to);
      await touch(page, 'touchend', to);
      await page.waitForTimeout(50);
      check(name + ' leaves no partial ink or stuck preview', JSON.stringify(await ink(page)) === beforeCancel && !await hasPreview(page));
    }
    await touch(page, 'touchstart', from);
    await touch(page, 'touchmove', to);
    await touch(page, 'touchcancel', to);
    check('standalone stylus touch cancellation does not commit', JSON.stringify(await ink(page)) === beforeCancel && !await hasPreview(page));
    await pointer(page, 'pointerdown', from);
    await pointer(page, 'pointermove', to);
    await click(page, '#pdfInkDone');
    await pointer(page, 'pointerup', to);
    check('Done cancels an unfinished stroke and returns Pencil to highlighting', JSON.stringify(await ink(page)) === beforeCancel && !await hasPreview(page) && await page.locator('#zenWrite').getAttribute('aria-pressed') === 'false');

    // Create a genuine text highlight before exercising the ink eraser.
    await positionPage(page, 1);
    const textPoints = await page.locator('.pdf-page[data-page="1"] .text-layer span').first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      return [{ x: rect.left + 2, y: rect.top + rect.height / 2 }, { x: rect.left + rect.width * .6, y: rect.top + rect.height / 2 }];
    });
    await stroke(page, textPoints[0], textPoints[1]);
    const textMarks = JSON.stringify((await chapter(page)).highlights);
    check('leaving Write preserves default Pencil text highlighting', await markCount(page) === 1);
    await writeMode(page);
    await positionPage(page, 1);
    await click(page, '[data-pdf-ink-tool="eraser"]');
    from = await point(page, .2, .3); to = await point(page, .4, .35);
    await stroke(page, from, to, { cancel: true });
    check('cancelled ink erasing preserves strokes', (await ink(page)).length === 2);
    await stroke(page, from, to);
    check('ink eraser deletes the touched stroke only, preserving text highlights', (await ink(page)).length === 1 && (await ink(page))[0].id === blue?.id && JSON.stringify((await chapter(page)).highlights) === textMarks);
    await click(page, '#pdfInkUndo');
    check('ink Undo restores the erased stroke identity and all pressure samples', identities(await ink(page)) === identities(JSON.parse(beforeCancel)));
    await click(page, '#pdfInkRedo');
    check('ink Redo reapplies the stroke erasure', (await ink(page)).length === 1 && JSON.stringify((await chapter(page)).highlights) === textMarks);
    await click(page, '#pdfInkUndo');
    await click(page, '[data-pdf-ink-tool="pen"]');
    await click(page, '[data-pdf-ink-color="red"]');
    await click(page, '[data-pdf-ink-width="1.5"]');
    await positionPage(page, 2);
    await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"] canvas')?.width > 0);
    check('second PDF fixture page has no selectable text', await page.locator('.pdf-page[data-page="2"] .text-layer span').count() === 0);
    from = await point(page, .2, .2, 2); to = await point(page, .4, .24, 2);
    await stroke(page, from, to);
    const pageTwo = await ink(page, 2);
    check('Write draws directly on a blank/scanned-style PDF page', pageTwo.length === 1 && pageTwo[0].color === 'red' && pageTwo[0].width === 1.5 && (await ink(page)).length === 2);
    let fullInk = JSON.stringify((await chapter(page)).pdfInk);
    const firstChapterId = (await chapter(page)).id;
    const snapshot = await backup(page);
    check('downloaded JSON backup includes page ink and pressure samples', JSON.stringify(snapshot.chapters.find(item => item.id === firstChapterId).pdfInk) === fullInk);
    await click(page, '[data-pdf-ink-tool="eraser"]');
    await stroke(page, from, to);
    check('erasing on page two is isolated from page-one ink', (await ink(page, 2)).length === 0 && (await ink(page)).length === 2);
    await page.setInputFiles('#restoreFile', { name: 'older-handwriting-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot)) });
    await page.waitForFunction(() => document.getElementById('syncStatus').textContent.includes('Backup merged'));
    check('restoring an older backup cannot resurrect an erased ink stroke', (await ink(page, 2)).length === 0 && !!(await chapter(page)).pdfInkDeleted?.[pageTwo[0].id]);
    await click(page, '#pdfInkUndo');
    check('Undo can intentionally restore erased ink after a stale backup merge', identities(await ink(page, 2)) === identities(pageTwo));
    fullInk = JSON.stringify((await chapter(page)).pdfInk);

    const restoreContext = await browser.newContext({ viewport: { width: 1180, height: 1000 }, serviceWorkers: 'block' });
    const restorePage = await restoreContext.newPage();
    await restorePage.addInitScript(seedReader);
    await restorePage.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
    await restorePage.waitForFunction(() => document.body.classList.contains('library-ready'));
    await restorePage.setInputFiles('#restoreFile', { name: 'handwriting-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot)) });
    await restorePage.waitForFunction(() => document.getElementById('syncStatus').textContent.includes('Backup merged'));
    const imported = await restorePage.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === id), firstChapterId);
    check('backup import into an empty library restores all page ink and text annotations', same(imported.pdfInk, snapshot.chapters.find(item => item.id === firstChapterId).pdfInk) && same(imported.highlights, JSON.parse(textMarks)), JSON.stringify({ inkMatches: same(imported.pdfInk, snapshot.chapters.find(item => item.id === firstChapterId).pdfInk), highlightsMatch: same(imported.highlights, JSON.parse(textMarks)) }));
    await restoreContext.close();

    await page.reload({ waitUntil: 'load' });
    await waitForPdf(page);
    await useDefaultZen(page);
    check('all page ink and text highlights survive reload', same((await chapter(page)).pdfInk, JSON.parse(fullInk)) && same((await chapter(page)).highlights, JSON.parse(textMarks)), JSON.stringify({ inkMatches: same((await chapter(page)).pdfInk, JSON.parse(fullInk)), highlightsMatch: same((await chapter(page)).highlights, JSON.parse(textMarks)) }));
    check('Write is safely off after reopening the reader', await page.locator('#zenWrite').getAttribute('aria-pressed') === 'false');
    check('chosen ink style survives reopening the app', await page.locator('[data-pdf-ink-style="clean"]').getAttribute('aria-pressed') === 'true');
    await positionPage(page, 1);
    const original = await page.locator('.pdf-page[data-page="1"]').boundingBox();
    await paperControl(page, '#zoomIn');
    await page.waitForTimeout(500);
    await positionPage(page, 1);
    check('zoom changes visual scale without modifying normalized ink', (await page.locator('.pdf-page[data-page="1"]').boundingBox()).width > original.width && same((await chapter(page)).pdfInk, JSON.parse(fullInk)) && await page.locator('.pdf-page[data-page="1"] .pdf-ink-stroke').count() === 2);
    await paperControl(page, '#zoomLabel');
    await page.waitForTimeout(250);
    await writeMode(page);
    await positionPage(page, 1);
    from = await point(page, .25, .3); to = await point(page, .45, .35);
    await pointer(page, 'pointerdown', from);
    await pointer(page, 'pointermove', to);
    await paperControl(page, '#reflowBtn');
    await page.waitForFunction(() => !document.getElementById('textDocument').classList.contains('hidden') && !document.getElementById('reflowBtn').disabled);
    await pointer(page, 'pointerup', to);
    check('switching to Reader view cancels ink without altering PDF or text annotations', same((await chapter(page)).pdfInk, JSON.parse(fullInk)) && !await hasPreview(page) && same((await chapter(page)).highlights, JSON.parse(textMarks)));
    await showZenAction(page, '#zenWrite');
    check('Write is disabled or hidden when no original PDF surface is displayed', await page.locator('#zenAnnotateMenu').isVisible() && (await page.locator('#zenWrite').isDisabled() || !await page.locator('#zenWrite').isVisible()));
    await page.locator('#zenAnnotate').click();
    await paperControl(page, '#reflowBtn');
    await waitForPdf(page);
    await writeMode(page);
    await positionPage(page, 1);
    for (const layout of ['page', 'book']) {
      await zenLayout(page, layout);
      await page.waitForFunction(layout => document.querySelector('[data-pdf-layout="' + layout + '"]').getAttribute('aria-pressed') === 'true'
        && document.getElementById('pdfFrame').dataset.pagedReady === 'true'
        && document.querySelector('.pdf-page[data-page="1"].book-active .pdf-ink-layer'), layout);
      await writeMode(page);
      await click(page, '[data-pdf-ink-tool="pen"]');
      const beforeLayoutInk = await ink(page);
      const y = layout === 'page' ? .55 : .65;
      from = await point(page, .3, y); to = await point(page, .6, y + .04);
      await stroke(page, from, to);
      await pointer(page, 'click', to);
      const afterLayoutInk = await ink(page), added = afterLayoutInk.find(item => !beforeLayoutInk.some(old => old.id === item.id));
      check(layout + ' layout accepts visible Pencil ink with normalized page anchoring', afterLayoutInk.length === beforeLayoutInk.length + 1
        && added?.points.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)
        && Math.abs(added.points[0][0] - .3) < .005 && Math.abs(added.points[0][1] - y) < .005
        && await page.locator('.pdf-page[data-page="1"] .pdf-ink-stroke[data-ink-id="' + added?.id + '"]').count() === 1);
      check(layout + ' handwriting does not turn pages, create highlights, or lock the guide', await page.locator('.pdf-page[data-page="1"]').evaluate(element => element.classList.contains('book-active'))
        && same((await chapter(page)).highlights, JSON.parse(textMarks))
        && !await page.locator('#paneSpotlight').evaluate(element => element.classList.contains('locked')));
      await paperControl(page, '#nextPage');
      await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"].book-active') && document.getElementById('pdfFrame').dataset.pagedReady === 'true' && !document.getElementById('pdfFrame').dataset.curlState);
      await paperControl(page, '#prevPage');
      await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"].book-active') && document.getElementById('pdfFrame').dataset.pagedReady === 'true' && !document.getElementById('pdfFrame').dataset.curlState);
      check(layout + ' page navigation restores the same saved ink on returning', same(await ink(page), afterLayoutInk)
        && await page.locator('.pdf-page[data-page="1"] .pdf-ink-stroke[data-ink-id="' + added?.id + '"]').count() === 1);
    }
    if (process.env.PHLOEM_INK_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_INK_SCREENSHOT });
    check(browserName + ' handwriting workflows have no uncaught page errors', errors.length === 0, errors.join('; '));
    await checkZenUndo(browser);
    console.log('PDF handwriting: ' + (checks - failures) + '/' + checks + ' passed (' + browserName + ').');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error('FATAL', error); server.close(); process.exitCode = 1; });
