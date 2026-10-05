let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_PENCIL_TEST_PORT || 8164);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';

/* Independent PDF text objects exercise pen endpoints across real PDF.js spans,
   including a reverse stroke over a line break. Alternating identical fonts keeps
   PDF.js from merging the words into one synthetic text item. */
function makePencilPdf() {
  const lines = [
    [['Alpha', 72], ['beta', 122], ['gamma', 163], ['delta', 230], ['epsilon', 276], ['zeta', 343], ['eta', 384], ['theta', 418]],
    [['Iota', 72], ['kappa', 109], ['lambda', 166], ['mu', 236], ['nu', 269], ['xi', 299], ['omicron', 322], ['pi', 394]]
  ];
  const stream = lines.map((words, line) => words.map(([word, x], index) =>
    'BT /F' + (index % 2 + 1) + ' 18 Tf 0 g 1 0 0 1 ' + x + ' ' + (700 - line * 32) + ' Tm (' + word + ') Tj ET'
  ).join('\n')).join('\n') + '\n';
  const objects = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + 'endstream'
  ];
  let source = '%PDF-1.4\n% Phloem Pencil fixture\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(source, 'ascii');
    source += index + ' 0 obj\n' + objects[index] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(source, 'ascii');
  source += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let index = 1; index < objects.length; index++) source += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  source += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(source, 'ascii');
}

const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : file.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra === undefined ? '' : '  [' + extra + ']'));
  if (!condition) failures++;
}

function seedReader() {
  if (localStorage.getItem('pencil.fixture.seeded')) return;
  localStorage.setItem('pencil.fixture.seeded', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    size: 100, measure: 780, leading: 1.7, typeface: 'book', airy: false,
    focus: true, guide: 'yellow', guideOrientation: 'row', pdfLayout: 'scroll',
    guideScope: 'page', guideSize: 'm', guideDim: 55, guideX: .72,
    guideY: .38, guideLock: false, tone: 'cream', driftSpeed: 4
  }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
  localStorage.setItem('readingRoom.highlightColor.v1', 'mint');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}

async function waitForPdf(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    return canvas && canvas.width > 0
      && Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).some(span => span.textContent === 'Alpha')
      && !document.getElementById('readerPage').classList.contains('hidden');
  });
}

async function highlights(page, kind = 'pdf') {
  return page.evaluate(kind => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = state.chapters.find(item => item.id === id);
    return kind === 'pdf' ? chapter.highlights['1'] || [] : chapter[kind === 'reader' ? 'readerHighlights' : 'textHighlights'] || [];
  }, kind);
}

/* Coordinates come from real glyph rectangles. No native Selection is installed
   for pen strokes: the application must derive the passage from pen movement. */
async function wordPoint(page, word, edge, mode = 'pdf') {
  return page.evaluate(({ word, edge, mode }) => {
    const hosts = Array.from(document.querySelectorAll(mode === 'pdf'
      ? '.pdf-page[data-page="1"] .text-layer span' : '#textDocument .original'));
    const host = hosts.find(element => mode === 'pdf' ? element.textContent.trim() === word : element.textContent.includes(word));
    if (!host) throw new Error('Missing fixture word: ' + word + ' (' + mode + ')');
    const index = host.textContent.indexOf(word) + (edge === 'end' ? word.length - 1 : 0);
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node, consumed = 0;
    while ((node = walker.nextNode())) {
      if (consumed + node.length > index) break;
      consumed += node.length;
    }
    const range = document.createRange();
    range.setStart(node, index - consumed);
    range.setEnd(node, index - consumed + 1);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width * (edge === 'end' ? .92 : .08), y: (rect.top + rect.bottom) / 2 };
  }, { word, edge, mode });
}

async function pointer(page, type, point, options = {}) {
  return page.evaluate(({ type, point, options }) => {
    // A browser targets the click that follows a pointerup at the element that was
    // hit by that pointerup, not at whatever a newly opened card now covers there.
    const hit = document.elementFromPoint(point.x, point.y) || document.getElementById('documentPane');
    const target = type === 'click' && window.__pencilUpTarget && window.__pencilUpTarget.isConnected ? window.__pencilUpTarget : hit;
    if (type === 'pointerup') window.__pencilUpTarget = hit;
    else if (type === 'click' || type === 'pointerdown') window.__pencilUpTarget = null;
    const event = new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: options.pointerType || 'pen',
      pointerId: options.pointerId || 71, isPrimary: true, button: 0,
      buttons: options.buttons === undefined ? type === 'pointerup' || type === 'pointercancel' || type === 'click' ? 0 : 1 : options.buttons,
      pressure: type === 'pointerup' || type === 'pointercancel' ? 0 : .55,
      clientX: point.x, clientY: point.y
    });
    target.dispatchEvent(event);
    return { prevented: event.defaultPrevented, target: target.className };
  }, { type, point, options });
}

async function stroke(page, from, to, options = {}) {
  await pointer(page, 'pointerdown', from, options);
  for (let step = 1; step <= 8; step++) {
    await pointer(page, 'pointermove', { x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }, options);
  }
  await pointer(page, options.cancel ? 'pointercancel' : 'pointerup', to, options);
  if (!options.cancel) await pointer(page, 'click', to, options);
  await page.waitForTimeout(160);
}

async function nativeTouchSelection(page, first, last) {
  return page.evaluate(({ first, last }) => {
    const spans = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span'));
    const start = spans.find(span => span.textContent.trim() === first);
    const end = spans.find(span => span.textContent.trim() === last);
    const rect = start.getBoundingClientRect();
    start.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 82,
      isPrimary: true, button: 0, buttons: 1, clientX: rect.left + 3, clientY: rect.top + rect.height / 2
    }));
    const range = document.createRange();
    range.setStart(start.firstChild, 1);
    range.setEnd(end.firstChild, end.firstChild.length - 1);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    const exact = selection.toString();
    document.dispatchEvent(new Event('selectionchange'));
    end.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 82, isPrimary: true, button: 0, buttons: 0 }));
    return exact;
  }, { first, last });
}

/* iPad WKWebView also emits TouchEvents whose Touch.touchType is "stylus".
   Construct the same observable event shape where a browser lacks an exposed
   Touch constructor, without pretending these are physical-device input tests. */
async function stylusTouch(page, type, point, options = {}) {
  return page.evaluate(({ type, point, options }) => {
    const target = document.elementFromPoint(point.x, point.y) || document.getElementById('documentPane');
    const stylus = { identifier: 91, target, touchType: 'stylus', clientX: point.x, clientY: point.y, pageX: point.x + scrollX, pageY: point.y + scrollY, force: .55 };
    const palm = { identifier: 92, target, touchType: 'direct', clientX: point.x + 25, clientY: point.y + 25, force: .4 };
    const changedTouches = options.palmOnly ? [palm] : [stylus];
    const touches = type === 'touchend' || type === 'touchcancel' ? options.palmOnly ? [stylus] : [] : options.palm ? [stylus, palm] : [stylus];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { changedTouches: { value: changedTouches }, touches: { value: touches }, targetTouches: { value: touches } });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, point, options });
}

/* Zen is the only reader since 1a215db5 ("Make Zen the sole reader"); the touch
   dock Mark button is hidden, so a finger reaches Mark via Zen Annotate -> Highlight. */
async function zenMark(page) {
  if (!await page.locator('#zenAnnotateMenu').isVisible()) await page.locator('#zenAnnotate').tap();
  await page.locator('#zenMarker').tap();
}
const zenMarkLabel = page => page.locator('#zenMarker').getAttribute('aria-label');

async function chooseEraser(page) {
  await page.evaluate(() => document.querySelector('#highlightToolbar [data-highlight-eraser]').click());
}

async function undo(page) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(120);
}

function highlightIdentity(items) {
  return items.map(item => ({ id: item.id, note: item.note || '', text: item.text, color: item.color })).sort((a, b) => a.id.localeCompare(b.id));
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1024, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(18000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seedReader);
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'pencil-highlighting.pdf', mimeType: 'application/pdf', buffer: makePencilPdf() });
    await waitForPdf(page);

    check(browserName + ' starts with touch UI and Marker off', await page.locator('#zenAnnotate').isVisible()
      && await page.locator('body').evaluate(body => body.classList.contains('touch-tablet-reader'))
      && await page.locator('#highlightBtn').getAttribute('aria-pressed') === 'false');

    await nativeTouchSelection(page, 'zeta', 'theta');
    await page.waitForTimeout(100);
    check('a native finger selection is pending before the Pencil begins', (await highlights(page)).length === 0 && await page.evaluate(() => !getSelection().isCollapsed));

    const alpha = await wordPoint(page, 'Alpha', 'start');
    const gamma = await wordPoint(page, 'gamma', 'end');
    const scrollBefore = await page.locator('#documentPane').evaluate(pane => [pane.scrollLeft, pane.scrollTop]);
    await pointer(page, 'pointerdown', alpha);
    await stylusTouch(page, 'touchstart', alpha);
    await pointer(page, 'pointermove', gamma);
    await stylusTouch(page, 'touchmove', gamma);
    const preview = await page.evaluate(() => ({
      drawing: document.body.classList.contains('pencil-highlighting'),
      count: document.querySelectorAll('.pencil-highlight-preview i').length,
      nativeSelection: getSelection().toString(),
      ink: Array.from(document.querySelectorAll('.pencil-highlight-preview i')).map(element => ({ mint: element.classList.contains('hl-mint'), gradient: getComputedStyle(element).backgroundImage.includes('linear-gradient') }))
    }));
    check('Pencil movement previews ink before saving without native selection handles', preview.drawing && preview.count > 0 && !preview.nativeSelection, JSON.stringify(preview));
    check('the live Pencil preview visibly uses the selected highlight color', preview.ink.length > 0 && preview.ink.every(ink => ink.mint && ink.gradient));
    check('Pencil preview has not saved the old native selection or the unfinished stroke', (await highlights(page)).length === 0);
    await pointer(page, 'pointerdown', gamma, { pointerType: 'touch', pointerId: 93 });
    await pointer(page, 'pointerup', gamma, { pointerType: 'touch', pointerId: 93 });
    check('a palm pointer lifting leaves the Pencil gesture active and unsaved', await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting'))
      && (await highlights(page)).length === 0);
    await pointer(page, 'pointerup', gamma);
    await stylusTouch(page, 'touchend', gamma);
    await pointer(page, 'click', gamma);
    await page.waitForTimeout(400);
    let saved = await highlights(page);
    check('lifting Pencil saves exactly the dragged PDF passage with Marker off', saved.length === 1
      && saved[0].text.replace(/\s/g, '') === 'Alphabetagamma'
      && await page.locator('#highlightBtn').getAttribute('aria-pressed') === 'false', JSON.stringify(saved));
    check('Pencil uses the selected color and valid normalized PDF rectangles', saved[0] && saved[0].color === 'mint'
      && saved[0].rects.length > 0 && saved[0].rects.every(rect => rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= 1.001 && rect.y + rect.h <= 1.001));
    check('Pencil release clears its preview and preserves scroll position', await page.locator('.pencil-highlight-preview').count() === 0
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting'))
      && JSON.stringify(await page.locator('#documentPane').evaluate(pane => [pane.scrollLeft, pane.scrollTop])) === JSON.stringify(scrollBefore));
    check('the compatibility click after a Pencil stroke does not pin the reading guide', !await page.locator('#paneSpotlight').evaluate(guide => guide.classList.contains('locked')));
    const firstSavedPoint = await wordPoint(page, 'beta', 'start');
    await stroke(page, firstSavedPoint, firstSavedPoint);
    check('a saved Pencil highlight still opens the existing note editor', !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.locator('#selectionNote').fill('Keep this observation with the highlighted passage.');
    await page.waitForTimeout(100);
    check('notes remain attached to a Pencil highlight', (await highlights(page))[0].note === 'Keep this observation with the highlighted passage.');
    await page.keyboard.press('Escape');

    const epsilon = await wordPoint(page, 'epsilon', 'start');
    const theta = await wordPoint(page, 'theta', 'end');
    await stroke(page, epsilon, theta, { cancel: true });
    await page.waitForTimeout(650);
    check('cancelled Pencil ink never saves and fully clears its gesture state', (await highlights(page)).length === 1
      && await page.locator('.pencil-highlight-preview').count() === 0
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));
    await pointer(page, 'pointerdown', epsilon);
    await stylusTouch(page, 'touchstart', epsilon);
    await pointer(page, 'pointermove', theta);
    await stylusTouch(page, 'touchmove', theta);
    await stylusTouch(page, 'touchcancel', theta);
    await pointer(page, 'pointerup', theta);
    await page.waitForTimeout(650);
    check('stylus touchcancel also cancels a paired Pointer stroke when pointercancel is absent', (await highlights(page)).length === 1
      && await page.locator('.pencil-highlight-preview').count() === 0
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));
    await stroke(page, epsilon, epsilon);
    check('a Pencil tap creates no accidental highlight', (await highlights(page)).length === 1);
    await pointer(page, 'pointermove', epsilon, { buttons: 0 });
    await pointer(page, 'pointermove', theta, { buttons: 0 });
    check('Pencil hovering without contact does not start ink or save a highlight', (await highlights(page)).length === 1
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));
    await pointer(page, 'pointerdown', epsilon);
    await pointer(page, 'pointermove', theta);
    await pointer(page, 'lostpointercapture', theta);
    await pointer(page, 'pointerup', theta);
    check('lost pointer capture cancels the stroke without a later lift saving it', (await highlights(page)).length === 1
      && await page.locator('.pencil-highlight-preview').count() === 0);
    await pointer(page, 'pointerdown', epsilon);
    await pointer(page, 'pointermove', theta);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await pointer(page, 'pointerup', theta);
    check('leaving the window cancels unfinished Pencil ink', (await highlights(page)).length === 1
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));
    await pointer(page, 'pointerdown', epsilon);
    await pointer(page, 'pointermove', theta);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await pointer(page, 'pointerup', theta);
    check('hiding the page cancels unfinished Pencil ink', (await highlights(page)).length === 1
      && await page.locator('.pencil-highlight-preview').count() === 0);

    const pi = await wordPoint(page, 'pi', 'end');
    const delta = await wordPoint(page, 'delta', 'start');
    await stroke(page, pi, delta);
    saved = await highlights(page);
    const reverse = saved[1];
    check('a reverse Pencil stroke crosses PDF spans and lines in reading order', saved.length === 2 && reverse
      && reverse.text.replace(/\s/g, '').startsWith('deltaepsilon') && reverse.text.replace(/\s/g, '').endsWith('omicronpi')
      && reverse.rects.some(rect => Math.abs(rect.y - reverse.rects[0].y) > .01), JSON.stringify(reverse));
    await stroke(page, pi, delta);
    check('repeating an existing Pencil passage does not duplicate it', (await highlights(page)).length === 2);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    check('Undo removes only the last new Pencil stroke and preserves earlier notes', (await highlights(page)).length === 1
      && (await highlights(page))[0].id === saved[0].id && (await highlights(page))[0].note === 'Keep this observation with the highlighted passage.');
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(100);
    check('Redo restores the Pencil stroke', (await highlights(page)).length === 2);

    const exactTouch = await nativeTouchSelection(page, 'Iota', 'kappa');
    await page.waitForTimeout(750);
    check('finger selection remains exact and requires explicit Mark after Pencil use', (await highlights(page)).length === 2
      && await page.evaluate(() => getSelection().toString()) === exactTouch);
    await zenMark(page);
    await page.waitForTimeout(120);
    saved = await highlights(page);
    check('the existing finger Mark action still saves the selected passage once', saved.length === 3 && saved[2].text === exactTouch.replace(/\s+/g, ' ').trim());
    const savedIds = saved.map(item => item.id);
    await page.reload({ waitUntil: 'load' });
    await waitForPdf(page);
    check('Pencil and finger highlights persist through reload', JSON.stringify((await highlights(page)).map(item => item.id)) === JSON.stringify(savedIds)
      && (await highlights(page))[0].note === 'Keep this observation with the highlighted passage.' && await page.locator('.saved-highlight').count() >= 3);

    const savedWord = await wordPoint(page, 'beta', 'start');
    await stroke(page, savedWord, savedWord);
    check('a Pencil tap on a saved PDF highlight opens its note card without duplicating or pinning the guide', (await highlights(page)).length === 3
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden'))
      && !await page.locator('#paneSpotlight').evaluate(guide => guide.classList.contains('locked')));
    await page.keyboard.press('Escape');
    if (process.env.PHLOEM_PENCIL_SCREENSHOT) {
      await zenMark(page);
      await page.screenshot({ path: process.env.PHLOEM_PENCIL_SCREENSHOT });
      await zenMark(page);
    }

    await pointer(page, 'pointerdown', await wordPoint(page, 'lambda', 'start'));
    await pointer(page, 'pointermove', await wordPoint(page, 'omicron', 'end'));
    await page.evaluate(() => document.getElementById('reflowBtn').click());
    await page.waitForFunction(() => !document.getElementById('textDocument').classList.contains('hidden')
      && !document.getElementById('reflowBtn').disabled
      && Array.from(document.querySelectorAll('#textDocument .original')).some(element => element.textContent.includes('gamma')));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await pointer(page, 'pointerup', gamma);
    check('switching PDF to Reader during a stroke cannot save it into either view', (await highlights(page)).length === 3
      && (await highlights(page, 'reader')).length === 0 && await page.locator('.pencil-highlight-preview').count() === 0);
    const reflowAlpha = await wordPoint(page, 'Alpha', 'start', 'reader');
    const reflowGamma = await wordPoint(page, 'gamma', 'end', 'reader');
    await stroke(page, reflowAlpha, reflowGamma);
    let readerSaved = await highlights(page, 'reader');
    check('Pencil also saves a Reader-view text highlight using ordinary text anchors', readerSaved.length === 1
      && readerSaved[0].text.replace(/\s/g, '') === 'Alphabetagamma' && readerSaved[0].start === 0 && readerSaved[0].end > readerSaved[0].start
      && await page.locator('#textDocument mark[data-hl-id]').count() > 0, JSON.stringify(readerSaved));
    check('Reader-view Pencil highlighting keeps existing PDF highlights intact', (await highlights(page)).length === 3);
    const readerSavedWord = await wordPoint(page, 'beta', 'start', 'reader');
    await stroke(page, readerSavedWord, readerSavedWord);
    check('a Pencil tap on a saved Reader highlight opens its note card without duplicating', (await highlights(page, 'reader')).length === 1
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.keyboard.press('Escape');

    await page.evaluate(() => document.querySelector('#highlightToolbar [data-highlight-color="coral"]').click());
    const reflowDelta = await wordPoint(page, 'delta', 'start', 'reader');
    const reflowTheta = await wordPoint(page, 'theta', 'end', 'reader');
    const stylusPrevented = await stylusTouch(page, 'touchstart', reflowDelta);
    await stylusTouch(page, 'touchmove', reflowTheta);
    await stylusTouch(page, 'touchstart', reflowTheta, { palm: true, palmOnly: true });
    await stylusTouch(page, 'touchend', reflowTheta, { palmOnly: true });
    check('a palm lifting cannot prematurely commit or stop an active stylus stroke', (await highlights(page, 'reader')).length === 1
      && await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));
    await stylusTouch(page, 'touchend', reflowTheta);
    await page.waitForTimeout(200);
    readerSaved = await highlights(page, 'reader');
    check('the iPad stylus TouchEvent fallback saves once in the newly chosen color', stylusPrevented && readerSaved.length === 2
      && readerSaved[1].color === 'coral' && readerSaved[1].text.replace(/\s/g, '') === 'deltaepsilonzetaetatheta', JSON.stringify(readerSaved));
    check('stylus fallback leaves no preview or stuck gesture', await page.locator('.pencil-highlight-preview').count() === 0
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));
    const reflowIota = await wordPoint(page, 'Iota', 'start', 'reader');
    const reflowPi = await wordPoint(page, 'pi', 'end', 'reader');
    await stylusTouch(page, 'touchstart', reflowIota);
    await stylusTouch(page, 'touchmove', reflowPi);
    await stylusTouch(page, 'touchcancel', reflowPi);
    await page.waitForTimeout(650);
    check('the stylus TouchEvent cancellation path never commits a partial stroke', (await highlights(page, 'reader')).length === 2
      && await page.locator('.pencil-highlight-preview').count() === 0
      && !await page.locator('body').evaluate(body => body.classList.contains('pencil-highlighting')));

    const readerBeta = await wordPoint(page, 'beta', 'start', 'reader');
    const readerBetaEnd = await wordPoint(page, 'beta', 'end', 'reader');
    await stroke(page, readerBeta, readerBetaEnd);
    check('a Pencil subset of a Reader highlight reopens it instead of layering another highlight', (await highlights(page, 'reader')).length === 2
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.keyboard.press('Escape');
    await stroke(page, readerBeta, await wordPoint(page, 'delta', 'end', 'reader'));
    check('a partly overlapping Pencil Reader stroke does not double-highlight its existing passage', (await highlights(page, 'reader')).length === 2
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.keyboard.press('Escape');
    await stroke(page, readerBeta, { x: readerBeta.x + 6, y: readerBeta.y });
    check('small Pencil jitter over a Reader highlight still opens its card without duplication', (await highlights(page, 'reader')).length === 2
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.locator('#selectionNote').fill('Keep this Reader note when undoing erasure.');
    await page.waitForTimeout(100);
    const readerBeforeErase = highlightIdentity(await highlights(page, 'reader'));
    await page.locator('#selectionRemoveHighlight').click();
    check('the Reader highlight card Remove button deletes its selected highlight', (await highlights(page, 'reader')).length === 1);
    await undo(page);
    check('Undo of the Reader Remove button restores the same highlight and its note', JSON.stringify(highlightIdentity(await highlights(page, 'reader'))) === JSON.stringify(readerBeforeErase));

    await chooseEraser(page);
    check('the shared toolbar stays visible with a pressed Eraser and labels the dock action Erase', await page.locator('body').evaluate(body => body.classList.contains('highlight-erasing'))
      && await page.locator('#highlightToolbar').isVisible()
      && await page.locator('#highlightToolbar [data-highlight-eraser]').getAttribute('aria-pressed') === 'true'
      && /Eraser on/.test(await zenMarkLabel(page)));
    const fingerDown = await pointer(page, 'pointerdown', readerBeta, { pointerType: 'touch', pointerId: 94 });
    const fingerMove = await pointer(page, 'pointermove', readerBetaEnd, { pointerType: 'touch', pointerId: 94 });
    await pointer(page, 'pointerup', readerBetaEnd, { pointerType: 'touch', pointerId: 94 });
    check('Eraser leaves finger gestures available for native scrolling without deleting anything', !fingerDown.prevented && !fingerMove.prevented
      && JSON.stringify(highlightIdentity(await highlights(page, 'reader'))) === JSON.stringify(readerBeforeErase));
    await pointer(page, 'pointerdown', readerBeta);
    await stylusTouch(page, 'touchstart', readerBeta);
    await pointer(page, 'pointermove', reflowTheta);
    await stylusTouch(page, 'touchmove', reflowTheta);
    await stylusTouch(page, 'touchend', reflowTheta, { palmOnly: true });
    check('an eraser sweep and a lifting palm do not delete anything before Pencil lifts', (await highlights(page, 'reader')).length === 2);
    await stylusTouch(page, 'touchcancel', reflowTheta);
    await pointer(page, 'pointerup', reflowTheta);
    check('paired stylus touch cancellation discards the entire pending Reader eraser sweep', JSON.stringify(highlightIdentity(await highlights(page, 'reader'))) === JSON.stringify(readerBeforeErase));
    await stroke(page, readerBeta, readerBeta);
    check('a Pencil eraser tap removes the complete Reader highlight, not just the touched letter', (await highlights(page, 'reader')).length === 1
      && (await highlights(page, 'reader'))[0].text.replace(/\s/g, '') === 'deltaepsilonzetaetatheta');
    await undo(page);
    check('Undo of a Pencil eraser tap restores the Reader highlight and its note', JSON.stringify(highlightIdentity(await highlights(page, 'reader'))) === JSON.stringify(readerBeforeErase));
    await stylusTouch(page, 'touchstart', readerBeta);
    await stylusTouch(page, 'touchmove', reflowTheta);
    await stylusTouch(page, 'touchend', reflowTheta);
    await page.waitForTimeout(120);
    check('stylus TouchEvent fallback erases every Reader highlight crossed by one sweep', (await highlights(page, 'reader')).length === 0);
    await undo(page);
    check('one Undo restores all Reader highlights erased in the same sweep with notes and identities intact', JSON.stringify(highlightIdentity(await highlights(page, 'reader'))) === JSON.stringify(readerBeforeErase));
    await page.evaluate(() => document.querySelector('#highlightToolbar [data-highlight-color="mint"]').click());
    check('choosing a highlight color exits Eraser and restores the Mark dock label', !await page.locator('body').evaluate(body => body.classList.contains('highlight-erasing'))
      && await page.locator('#highlightToolbar [data-highlight-eraser]').getAttribute('aria-pressed') === 'false'
      && /^Marker\. Current color/.test(await zenMarkLabel(page)));

    // Reader view is toggled from Zen More -> This paper (1a215db5).
    await page.locator('#zenMore').tap();
    await page.locator('#zenReadingControls').tap();
    await page.locator('#readerControlsDialog #reflowBtn').tap();
    await waitForPdf(page);
    const pdfBeta = await wordPoint(page, 'beta', 'start');
    const pdfBetaEnd = await wordPoint(page, 'beta', 'end');
    await stroke(page, pdfBeta, pdfBetaEnd);
    check('a Pencil subset of a PDF highlight reopens it without another layer', (await highlights(page)).length === 3
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.keyboard.press('Escape');
    await stroke(page, pdfBeta, await wordPoint(page, 'delta', 'end'));
    check('a partly overlapping Pencil PDF stroke does not double-highlight the existing passage', (await highlights(page)).length === 3
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.keyboard.press('Escape');
    await stroke(page, pdfBeta, { x: pdfBeta.x + 6, y: pdfBeta.y });
    check('small Pencil jitter over a PDF highlight opens its card without duplication', (await highlights(page)).length === 3
      && !await page.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));
    await page.keyboard.press('Escape');
    await stroke(page, pdfBeta, pdfBeta);
    const pdfBeforeErase = highlightIdentity(await highlights(page));
    const removeButtonPoint = await page.locator('#selectionRemoveHighlight').evaluate(button => {
      const rect = button.getBoundingClientRect();
      return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    });
    await stylusTouch(page, 'touchstart', removeButtonPoint);
    check('a rapid Pencil touch on the Remove control is not swallowed as the preceding stroke', !await stylusTouch(page, 'touchend', removeButtonPoint));
    await page.locator('#selectionRemoveHighlight').click();
    check('the PDF highlight card Remove button deletes its selected highlight', (await highlights(page)).length === 2);
    await undo(page);
    check('Undo of the PDF Remove button restores its highlight and earlier note', JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase));

    const pdfOverlap = await wordPoint(page, 'Iota', 'end');
    await chooseEraser(page);
    await stroke(page, pdfOverlap, pdfBeta, { cancel: true });
    check('a cancelled PDF eraser sweep preserves every overlapping highlight and note', JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase));
    await pointer(page, 'pointerdown', pdfOverlap);
    await stylusTouch(page, 'touchstart', pdfOverlap);
    await pointer(page, 'pointerup', pdfOverlap);
    await stylusTouch(page, 'touchend', pdfOverlap);
    await pointer(page, 'click', pdfOverlap);
    await page.waitForTimeout(120);
    check('one Pencil eraser tap removes every overlapping PDF layer at the touched passage', (await highlights(page)).length === 1
      && (await highlights(page))[0].text.replace(/\s/g, '') === 'Alphabetagamma');
    await undo(page);
    check('paired Pointer and stylus release records one undoable PDF eraser action', JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase));
    await stroke(page, pdfOverlap, pdfBeta);
    check('a Pencil PDF eraser sweep removes both separated and overlapping touched highlights', (await highlights(page)).length === 0);
    await undo(page);
    check('one Undo restores every PDF highlight from a multi-highlight eraser sweep', JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase));
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(120);
    check('one Redo reapplies the complete PDF multi-highlight eraser sweep', (await highlights(page)).length === 0);
    await undo(page);
    check('Undo after Redo restores the same PDF highlight identities and notes again', JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase));
    await chooseEraser(page);
    check('tapping the selected Eraser turns it off without editing any stored highlights', !await page.locator('body').evaluate(body => body.classList.contains('highlight-erasing'))
      && JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase));
    await page.reload({ waitUntil: 'load' });
    await waitForPdf(page);
    check('restored PDF and Reader highlights and their notes persist through reload after erasing', JSON.stringify(highlightIdentity(await highlights(page))) === JSON.stringify(pdfBeforeErase)
      && JSON.stringify(highlightIdentity(await highlights(page, 'reader'))) === JSON.stringify(readerBeforeErase));
    await chooseEraser(page);
    const fingerFromEraser = await nativeTouchSelection(page, 'Iota', 'lambda');
    await page.waitForTimeout(750);
    check('native finger selection while Eraser is active returns to Mark without losing the exact selection', !await page.locator('body').evaluate(body => body.classList.contains('highlight-erasing'))
      && /^Highlight selected passage/.test(await zenMarkLabel(page))
      && await page.evaluate(() => getSelection().toString()) === fingerFromEraser
      && (await highlights(page)).length === 3);
    await zenMark(page);
    await page.waitForTimeout(120);
    check('the pending finger Mark action still saves an overlapping selection after leaving Eraser', (await highlights(page)).length === 4
      && (await highlights(page)).some(item => item.text === fingerFromEraser.replace(/\s+/g, ' ').trim()));
    await undo(page);
    await chooseEraser(page);
    if (process.env.PHLOEM_ERASER_SCREENSHOT) {
      await zenMark(page);
      await page.screenshot({ path: process.env.PHLOEM_ERASER_SCREENSHOT });
    }
    check(browserName + ' Pencil workflows have no page errors', errors.length === 0, errors.join('; '));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error('FATAL', error); server.close(); process.exitCode = 1; });
