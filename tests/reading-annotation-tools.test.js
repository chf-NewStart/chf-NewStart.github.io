/* Tool-switch regression coverage through reader controls and synthetic Pencil
   events. Browser simulation does not replace physical Apple Pencil testing. */
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual: same } = require('util');
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_ANNOTATION_TOOLS_TEST_PORT || 8192);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0, failures = 0;
function check(name, passed, detail) {
  checks++; if (!passed) failures++;
  console.log((passed ? 'PASS ' : 'FAIL ') + name + (passed || detail === undefined ? '' : ' ' + JSON.stringify(detail)));
}
function fixturePdf() {
  const lines = [
    [['Alpha', 72], ['beta', 122], ['gamma', 163], ['delta', 230]],
    [['Iota', 72], ['kappa', 109], ['lambda', 166], ['mu', 236]]
  ];
  const stream = lines.map((words, line) => words.map(([word, x], index) =>
    'BT /F' + (index % 2 + 1) + ' 18 Tf 0 g 1 0 0 1 ' + x + ' ' + (700 - line * 48) + ' Tm (' + word + ') Tj ET'
  ).join('\n')).join('\n') + '\n';
  const objects = ['', '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream'];
  let source = '%PDF-1.4\n', offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = Buffer.byteLength(source); source += i + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(source);
  source += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) source += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(source + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
}
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  fs.readFile(path.join(ROOT, pathname), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
    response.end(data);
  });
});
function seedReader() {
  const restored = sessionStorage.getItem('annotationTools.fixture.restore');
  if (restored) {
    // Reset after the previous document's lifecycle flush, and make this deliberate
    // fixture state newer than its IndexedDB safety copy. Rewriting only the old
    // localStorage snapshot before reload lets recovery leak a prior test's ink.
    const state = JSON.parse(restored); state.savedAt = Date.now();
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
    sessionStorage.removeItem('annotationTools.fixture.restore');
  }
  if (localStorage.getItem('annotationTools.fixture.seeded')) return;
  localStorage.setItem('annotationTools.fixture.seeded', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ size: 100, measure: 780, leading: 1.7, typeface: 'book', airy: false, focus: false, guide: 'none', guideOrientation: 'row', pdfLayout: 'scroll', guideScope: 'page', guideSize: 'm', guideDim: 55, guideX: .72, guideY: .38, guideLock: false, tone: 'cream', driftSpeed: 4 }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}
async function waitForPdf(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    return canvas && canvas.width > 0 && !document.getElementById('readerPage').classList.contains('hidden')
      && Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).some(span => span.textContent.trim() === 'Alpha');
  });
}
async function positionPage(page) {
  await page.locator('.pdf-page[data-page="1"]').evaluate(element => {
    const pane = document.getElementById('documentPane');
    pane.scrollTop += element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
  });
  await page.waitForTimeout(80);
}
// Zen is the only reader since 1a215db5 ("Make Zen the sole reader"): the header
// Marker/Write buttons and the touch dock are hidden command targets, so every
// tool switch below goes through the Zen dock (Annotate -> Highlight / Write).
// Touch contexts tap the dock like a finger on iPad.
let touchContext = false;
async function press(locator) {
  if (touchContext) await locator.tap(); else await locator.click();
}
async function click(page, selector, pointerType) {
  if (/^#zen(?:Marker|Write|Undo)$/.test(selector)) {
    if (!await page.locator('#zenAnnotateMenu').isVisible()) await press(page.locator('#zenAnnotate'));
    await press(page.locator(selector));
    await page.waitForTimeout(40);
    return;
  }
  await page.locator(selector).evaluate((element, pointerType) => {
    if (pointerType) element.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true, pointerType, detail: 1 }));
    else element.click();
  }, pointerType);
  await page.waitForTimeout(40);
}
async function setWrite(page, enabled = true, selector = '#zenWrite') {
  if ((await page.locator(selector).getAttribute('aria-pressed') === 'true') !== enabled) await click(page, selector);
}
// Handwriting saves once the Pencil has rested for a moment (v194), so reading the stored
// library right after a stroke first waits for that save.
let strokeAt = 0;
async function chapter(page) {
  const wait = strokeAt + 1500 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
function highlights(ch) { return (ch.highlights || {})[1] || []; }
function ink(ch) { return (ch.pdfInk || {})[1] || []; }
function annotations(ch) {
  return { highlights: ch.highlights, pdfInk: Object.fromEntries(Object.entries(ch.pdfInk || {}).map(([number, strokes]) => [number, strokes.map(({ updatedAt, ...stroke }) => stroke)])) };
}
async function wordPoint(page, word, end = false) {
  return page.evaluate(({ word, end }) => {
    const span = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).find(item => item.textContent.trim() === word);
    const rect = span.getBoundingClientRect();
    return { x: end ? rect.right - 2 : rect.left + 2, y: rect.top + rect.height / 2 };
  }, { word, end });
}
async function pointer(page, type, point) {
  await page.evaluate(({ type, point }) => {
    const target = document.elementFromPoint(point.x, point.y) || document.getElementById('documentPane');
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 71, isPrimary: true, button: 0,
      buttons: /up|cancel/.test(type) ? 0 : 1, pressure: /up|cancel/.test(type) ? 0 : .6, clientX: point.x, clientY: point.y }));
  }, { type, point });
  if (/up|cancel/.test(type)) strokeAt = Date.now();
}
async function stylusTouch(page, type, point) {
  await page.evaluate(({ type, point }) => {
    const target = document.elementFromPoint(point.x, point.y) || document.getElementById('documentPane');
    const stylus = { identifier: 91, target, touchType: 'stylus', clientX: point.x, clientY: point.y, pageX: point.x + scrollX, pageY: point.y + scrollY, force: .6 };
    const touches = /end|cancel/.test(type) ? [] : [stylus];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { changedTouches: { value: [stylus] }, touches: { value: touches }, targetTouches: { value: touches } });
    target.dispatchEvent(event);
  }, { type, point });
}
async function beginStroke(page, from, to, paired) {
  await pointer(page, 'pointerdown', from);
  if (paired) await stylusTouch(page, 'touchstart', from);
  for (let i = 1; i <= 8; i++) {
    const point = { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 };
    await pointer(page, 'pointermove', point);
    if (paired) await stylusTouch(page, 'touchmove', point);
  }
}
async function endStroke(page, to, paired) {
  await pointer(page, 'pointerup', to);
  if (paired) await stylusTouch(page, 'touchend', to);
  await page.waitForTimeout(100);
}
async function stroke(page, first, last, paired = false) {
  await positionPage(page);
  const from = await wordPoint(page, first), to = await wordPoint(page, last, true);
  await beginStroke(page, from, to, paired);
  await endStroke(page, to, paired);
}
async function nativeTouchSelection(page) {
  await positionPage(page);
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span'));
    const first = spans.find(span => span.textContent.trim() === 'Iota'), last = spans.find(span => span.textContent.trim() === 'kappa');
    const rect = first.getBoundingClientRect();
    first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 82, isPrimary: true, button: 0, buttons: 1, clientX: rect.left + 3, clientY: rect.top + rect.height / 2 }));
    const range = document.createRange();
    range.setStart(first.firstChild, 0); range.setEnd(last.firstChild, last.firstChild.length);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    last.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 82, isPrimary: true, button: 0, buttons: 0 }));
  });
  // A pending native selection is actionable without visually selecting Marker
  // while the mutually exclusive Write tool is still active.
  await page.waitForFunction(() => document.getElementById('zenMarker').getAttribute('aria-label').includes('Highlight selected passage'));
}
async function ui(page) {
  return page.evaluate(() => ({
    writeOn: document.body.classList.contains('pdf-ink-active'),
    stickyMarker: document.body.classList.contains('marker-on'),
    erasing: document.body.classList.contains('highlight-erasing'),
    writeButtons: Array.from(document.querySelectorAll('[data-pdf-write-toggle]')).map(button => ({ pressed: button.getAttribute('aria-pressed'), active: button.classList.contains('active') })),
    inkTools: document.querySelectorAll('[data-pdf-ink-tool][aria-pressed="true"]').length,
    inkColors: document.querySelectorAll('[data-pdf-ink-color][aria-pressed="true"]').length,
    inkWidths: document.querySelectorAll('[data-pdf-ink-width][aria-pressed="true"]').length,
    markerSwatches: document.querySelectorAll('.marker-swatch[data-highlight-color][aria-pressed="true"],.marker-swatch[data-highlight-color].selected').length,
    markerActive: document.getElementById('highlightBtn').classList.contains('active') || document.getElementById('zenMarker').classList.contains('active') || document.getElementById('touchHighlight').classList.contains('active'),
    markerPressed: document.getElementById('highlightBtn').getAttribute('aria-pressed') === 'true',
    markerPopouts: ['highlightToolbar'].filter(id => !document.getElementById(id).classList.contains('hidden')),
    previews: document.querySelectorAll('.pdf-ink-preview,.pencil-highlight-preview,.pdf-ink-erasing,.erasing-highlight').length
  }));
}
function writeIsOff(state) { return !state.writeOn && state.writeButtons.every(button => button.pressed === 'false' && !button.active) && state.inkTools === 0 && state.inkColors === 0 && state.inkWidths === 0; }
function writeIsExclusive(state) { return state.writeOn && state.writeButtons.every(button => button.pressed === 'true' && button.active)
  && state.inkTools === 1 && state.inkColors === 1 && state.inkWidths === 1 && !state.stickyMarker && !state.erasing && !state.markerActive && !state.markerPressed && state.markerSwatches === 0 && state.markerPopouts.length === 0; }
async function reset(page, saved) {
  await page.evaluate(saved => sessionStorage.setItem('annotationTools.fixture.restore', saved), saved);
  await page.reload({ waitUntil: 'load' });
  await waitForPdf(page);
  await page.waitForFunction(() => document.body.classList.contains('zen'));
  await positionPage(page);
  const restored = await chapter(page), expected = JSON.parse(saved).chapters.find(item => item.id === restored.id);
  if (!expected || !same(annotations(restored), annotations(expected))) throw new Error('Fixture reset did not restore the baseline annotations');
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    for (const touch of [true, false]) {
      const label = touch ? 'touch' : 'desktop';
      const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      touchContext = touch;
      page.setDefaultTimeout(18000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seedReader);
      await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      await page.setInputFiles('#pdfFile', { name: 'annotation-tools.pdf', mimeType: 'application/pdf', buffer: fixturePdf() });
      await waitForPdf(page);
      await page.waitForFunction(() => document.body.classList.contains('zen'));
      check(label + ' initial default Pencil mode has no selected pen controls', writeIsOff(await ui(page)));
      await stroke(page, 'Alpha', 'beta', touch);
      const notePoint = await wordPoint(page, 'Alpha');
      await beginStroke(page, notePoint, notePoint, false);
      await endStroke(page, notePoint, false);
      await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
      await page.locator('#selectionNote').fill('Preserve this note through tool changes and Undo.');
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      await setWrite(page);
      await stroke(page, 'Alpha', 'beta', touch);
      await setWrite(page, false);
      const baseline = await chapter(page), saved = await page.evaluate(() => localStorage.getItem('readingRoom.v1'));
      check(label + ' baseline contains one noted highlight and one ink stroke', highlights(baseline).length === 1 && !!highlights(baseline)[0].note && ink(baseline).length === 1);
      if (highlights(baseline).length !== 1 || !highlights(baseline)[0].note || ink(baseline).length !== 1) throw new Error(label + ' fixture setup failed');

      // The header Marker/color chooser and touch-dock Mark entries were removed from
      // the reader in 1a215db5; their only user path is now the Zen Highlight entry.
      const markerEntries = [
        ['Zen Marker opening', page => click(page, '#zenMarker')],
        ['Zen Marker color', page => click(page, '#highlightToolbar [data-highlight-color="coral"]')]
      ];
      if (touch) markerEntries.push(['Zen Marker color (mint)', page => click(page, '#highlightToolbar [data-highlight-color="mint"]')]);
      else markerEntries.push(['shared color activates Highlight in Zen', page => click(page, '#highlightToolbar [data-highlight-color="blue"]')]);
      for (const [name, activate] of markerEntries) {
        await reset(page, saved);
        await setWrite(page, true);
        await activate(page);
        const state = await ui(page);
        check(label + ' ' + name + ' deselects all Write controls', writeIsOff(state), state);
        if (touch) check(label + ' ' + name + ' does not turn on desktop sticky Marker', !state.stickyMarker);
        if (!touch && name === 'shared color activates Highlight in Zen') check('desktop choosing a shared color explicitly arms sticky Highlight', state.stickyMarker && state.markerPressed);
        await stroke(page, 'Iota', 'kappa', touch);
        const after = await chapter(page);
        check(label + ' ' + name + ' makes exactly one highlight and no handwriting', highlights(after).length === 2 && ink(after).length === 1);
        check(label + ' ' + name + ' preserves existing note and annotations', same(highlights(after)[0], highlights(baseline)[0]) && same(ink(after), ink(baseline)));
        await click(page, '#pdfInkUndo');
        check(label + ' ' + name + ' Undo restores original annotations', same(annotations(await chapter(page)), annotations(baseline)));
      }

      for (const selector of ['#zenWrite']) {
        await reset(page, saved);
        // Arm Marker the Zen way (Highlight, then a color) before switching to Write.
        await click(page, '#zenMarker');
        await click(page, '#highlightToolbar [data-highlight-color="yellow"]');
        await click(page, selector);
        const state = await ui(page);
        check(label + ' ' + selector + ' selects only Write across all controls', writeIsExclusive(state), state);
        await stroke(page, 'Iota', 'kappa', touch);
        const after = await chapter(page);
        check(label + ' ' + selector + ' makes exactly one ink stroke and no highlight', ink(after).length === 2 && same(after.highlights, baseline.highlights));
        await click(page, '#pdfInkUndo');
        check(label + ' ' + selector + ' Undo preserves all original notes and strokes', same(annotations(await chapter(page)), annotations(baseline)));
        await click(page, selector);
        check(label + ' ' + selector + ' off deselects ink tool, color and width', writeIsOff(await ui(page)));
      }

      for (const fromWrite of [true, false]) {
        await reset(page, saved);
        await setWrite(page, fromWrite);
        await positionPage(page);
        const from = await wordPoint(page, 'Iota'), to = await wordPoint(page, 'kappa', true);
        await beginStroke(page, from, to, touch);
        check(label + ' ' + (fromWrite ? 'ink' : 'highlight') + ' stays uncommitted before switching', same(annotations(await chapter(page)), annotations(baseline)));
        // While a Pencil stroke is down, reading-ink.js deliberately owns every other
        // touch/pen contact (palm rejection), so a finger cannot open the Zen menu
        // mid-stroke. Touch therefore invokes the Zen command directly, as this test
        // always did; desktop uses the mouse through the Zen Annotate menu.
        const switchTo = fromWrite ? '#zenMarker' : '#zenWrite';
        if (touch) await page.locator(switchTo).evaluate(element => element.click());
        else await click(page, switchTo);
        await endStroke(page, to, touch);
        check(label + ' switching ' + (fromWrite ? 'Write to Marker' : 'Marker to Write') + ' cancels the active stroke and its duplicate event stream', same(annotations(await chapter(page)), annotations(baseline)) && (await ui(page)).previews === 0);
        await stroke(page, 'Iota', 'kappa', touch);
        const after = await chapter(page);
        check(label + ' next gesture after cancellation uses only the new tool', fromWrite ? highlights(after).length === 2 && ink(after).length === 1 : ink(after).length === 2 && highlights(after).length === 1);
      }

      for (const eraseFromWrite of [false, true]) {
        await reset(page, saved);
        await setWrite(page);
        await click(page, '#zenMarker');
        if (eraseFromWrite) { await setWrite(page); await click(page, '[data-pdf-ink-tool="eraser"]'); }
        else await click(page, '#highlightToolbar [data-highlight-eraser]');
        await stroke(page, 'Alpha', 'beta', touch);
        const erased = await chapter(page);
        check(label + ' shared eraser after switching removes both annotation types from ' + (eraseFromWrite ? 'Write' : 'Marker'), highlights(erased).length === 0 && ink(erased).length === 0, { highlights: highlights(erased), ink: ink(erased), ui: await ui(page) });
        await click(page, '#pdfInkUndo');
        check(label + ' one shared Undo restores note identity and ink after ' + (eraseFromWrite ? 'Write' : 'Marker') + ' erase', same(annotations(await chapter(page)), annotations(baseline)) && await page.locator('#pdfInkUndo').isDisabled());
      }
      if (touch) for (const selector of ['#zenMarker', '#selectionHighlight']) {
        await reset(page, saved);
        await setWrite(page);
        await nativeTouchSelection(page);
        check(label + ' native selection stays pending during Write before ' + selector, (await ui(page)).writeOn && same(annotations(await chapter(page)), annotations(baseline)));
        await click(page, selector, 'touch');
        const after = await chapter(page), state = await ui(page);
        check(label + ' ' + selector + ' exits Write without losing the selected passage', writeIsOff(state) && !state.stickyMarker
          && highlights(after).length === 2 && highlights(after)[1].text.includes('Iota') && highlights(after)[1].text.includes('kappa')
          && same(highlights(after)[0], highlights(baseline)[0]) && same(ink(after), ink(baseline)));
      }
      check(label + ' switching workflows have no uncaught browser errors', errors.length === 0, errors);
      await context.close();
    }
    console.log('Annotation tools: ' + (checks - failures) + '/' + checks + ' passed (' + browserName + ').');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error('FATAL', error); server.close(); process.exitCode = 1; });
