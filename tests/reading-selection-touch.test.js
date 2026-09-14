let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_SELECTION_TOUCH_TEST_PORT || 8153);

/* Draw every word as an independent PDF text object, with sub-point visual gaps.
   PDF.js consequently exposes adjacent text-layer spans without a literal space
   between them—the shape that previously made word snapping eat an entire line. */
function makeAdjacentSpanPdf() {
  const words = [
    ['Alpha', 72],
    ['beta', 118.6],
    ['gamma', 154.2],
    ['delta', 214.8],
    ['epsilon', 254.4],
    ['zeta', 311.8],
    ['eta', 346.5],
    ['theta', 372.8]
  ];
  /* Alternating two metrically identical font resources prevents PDF.js from
     coalescing the independently drawn words into one synthetic text item. */
  const stream = words.map(([word, x], index) =>
    'BT /F' + (index % 2 + 1) + ' 18 Tf 0 g 1 0 0 1 ' + x + ' 700 Tm (' + word + ') Tj ET'
  ).join('\n') + '\n';
  const objects = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + 'endstream'
  ];
  let source = '%PDF-1.4\n% Phloem adjacent-span fixture\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(source, 'ascii');
    source += index + ' 0 obj\n' + objects[index] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(source, 'ascii');
  source += 'xref\n0 ' + objects.length + '\n';
  source += '0000000000 65535 f \n';
  for (let index = 1; index < objects.length; index++) {
    source += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  }
  source += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\n';
  source += 'startxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(source, 'ascii');
}

const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css'
          : file.endsWith('.pdf') ? 'application/pdf'
            : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

function seedReader() {
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    size: 100, measure: 780, leading: 1.7, typeface: 'book', airy: false,
    focus: false, guide: 'yellow', guideOrientation: 'row', pdfLayout: 'scroll',
    guideScope: 'page', guideSize: 'm', guideDim: 55, guideX: .72,
    guideY: .38, guideLock: false, tone: 'cream', driftSpeed: 4
  }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
  localStorage.removeItem('readingRoom.highlightColor.v1');
}

/* Playwright exposes either a coarse or fine primary pointer, while real convertible
   hardware can advertise both capabilities. Preserve the native coarse result used
   by the touch dock and add the paired mouse/trackpad capability for hybrid checks. */
function installHybridPointerMedia() {
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = function(query) {
    const nativeResult = nativeMatchMedia(query);
    if (!/\((?:any-)?pointer\s*:\s*fine\)/.test(query)) return nativeResult;
    return {
      matches: true,
      media: query,
      onchange: nativeResult.onchange,
      addListener: listener => nativeResult.addListener(listener),
      removeListener: listener => nativeResult.removeListener(listener),
      addEventListener: (type, listener, options) => nativeResult.addEventListener(type, listener, options),
      removeEventListener: (type, listener, options) => nativeResult.removeEventListener(type, listener, options),
      dispatchEvent: event => nativeResult.dispatchEvent(event)
    };
  };
}

async function openFixture(page) {
  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', {
    name: 'adjacent-pdfjs-spans.pdf',
    mimeType: 'application/pdf',
    buffer: makeAdjacentSpanPdf()
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    const spans = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span'));
    return canvas && canvas.width > 0 && spans.some(span => span.textContent.trim())
      && !document.getElementById('readerPage').classList.contains('hidden');
  });
}

async function fixtureSpanState(page) {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span'))
      .filter(span => span.textContent.trim());
    const alpha = spans.findIndex(span => span.textContent.trim() === 'Alpha');
    const beta = spans.findIndex(span => span.textContent.trim() === 'beta');
    if (alpha < 0 || beta < 0) return { ready: false, texts: spans.map(span => span.textContent) };
    const left = spans[alpha].getBoundingClientRect();
    const right = spans[beta].getBoundingClientRect();
    return {
      ready: beta === alpha + 1,
      distinct: spans[alpha] !== spans[beta],
      sameLine: Math.abs((left.top + left.bottom) / 2 - (right.top + right.bottom) / 2) < Math.max(left.height, right.height) * .4,
      gap: right.left - left.right,
      texts: spans.map(span => span.textContent)
    };
  });
}

/* This uses the browser's Selection and Range objects, then sends the pointer
   lifecycle that the real PDF surface receives. The selected endpoints deliberately
   remain inside two different spans rather than landing on word boundaries. */
async function selectPartialAcrossSpans(page, leftLabel, rightLabel, pointerId, pointerType = 'touch', finishEvent = 'pointerup') {
  return page.evaluate(({ leftLabel, rightLabel, pointerId, pointerType, finishEvent }) => {
    const spans = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span'))
      .filter(span => span.textContent.trim());
    const left = spans.find(span => span.textContent.trim() === leftLabel);
    const right = spans.find(span => span.textContent.trim() === rightLabel);
    if (!left || !right || !left.firstChild || !right.firstChild) return null;
    const leftNode = left.firstChild;
    const rightNode = right.firstChild;
    const start = Math.max(1, leftNode.nodeValue.length - 2);
    const end = Math.min(2, rightNode.nodeValue.length - 1);
    const leftBox = left.getBoundingClientRect();
    const rightBox = right.getBoundingClientRect();
    left.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerType, pointerId,
      isPrimary: true, button: 0, buttons: 1,
      clientX: leftBox.right - 2, clientY: (leftBox.top + leftBox.bottom) / 2
    }));
    const range = document.createRange();
    range.setStart(leftNode, start);
    range.setEnd(rightNode, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    const exact = selection.toString();
    document.dispatchEvent(new PointerEvent(finishEvent, {
      bubbles: true, cancelable: true, pointerType, pointerId,
      isPrimary: true, button: 0, buttons: 0,
      clientX: rightBox.left + 2, clientY: (rightBox.top + rightBox.bottom) / 2
    }));
    return { exact, left: leftNode.nodeValue, right: rightNode.nodeValue, start, end, finishEvent };
  }, { leftLabel, rightLabel, pointerId, pointerType, finishEvent });
}

async function storedHighlights(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = state.chapters.find(item => item.id === id);
    return chapter && chapter.highlights && chapter.highlights['1'] || [];
  });
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seedReader);
  await openFixture(page);

  const capabilities = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
    dockVisible: (() => {
      const dock = document.getElementById('touchDock');
      const style = getComputedStyle(dock);
      const rect = dock.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })()
  }));
  check(browserName + ' runs the coarse-touch reader path', capabilities.coarse && capabilities.dockVisible, JSON.stringify(capabilities));

  const fixture = await fixtureSpanState(page);
  check(browserName + ' fixture exposes separate adjacent PDF.js spans', fixture.ready && fixture.distinct && fixture.sameLine && fixture.gap <= 3, JSON.stringify(fixture));

  const touchMark = page.locator('#touchHighlight');
  const touchPalette = page.locator('#touchHighlightPalette');
  await touchMark.click();
  check('touch Mark without a selection opens its color palette', await touchPalette.isVisible()
    && await touchMark.getAttribute('aria-expanded') === 'true'
    && await touchMark.getAttribute('aria-haspopup') === null);
  check('opening the touch palette does not enable the desktop marker', await page.locator('#highlightBtn').getAttribute('aria-pressed') === 'false'
    && !await page.locator('body').evaluate(body => body.classList.contains('marker-on')));
  await touchPalette.locator('[data-highlight-color="mint"]').click();
  check('touch color selection stays independent from desktop marker mode', await page.locator('#highlightBtn').getAttribute('aria-pressed') === 'false'
    && !await page.locator('body').evaluate(body => body.classList.contains('marker-on'))
    && await page.evaluate(() => localStorage.getItem('readingRoom.highlightColor.v1')) === 'mint');

  const selected = await selectPartialAcrossSpans(page, 'Alpha', 'beta', 41);
  check('the fixture selects partial endpoints in two distinct spans', !!selected && selected.start > 0
    && selected.end < selected.right.length && selected.exact.length > 0, JSON.stringify(selected));
  await page.waitForTimeout(180);
  const exactAfterRelease = await page.evaluate(() => window.getSelection().toString());
  check(browserName + ' preserves the exact native partial selection after touch release', !!selected && exactAfterRelease === selected.exact,
    JSON.stringify({ before: selected && selected.exact, after: exactAfterRelease }));
  const expectedText = selected && selected.exact.replace(/\s+/g, ' ').trim();
  const selectionCard = await page.locator('#selectionCard').evaluate(card => ({
    hidden: card.classList.contains('hidden'),
    excerpt: document.getElementById('selectionExcerpt').textContent
  }));
  check('the passage card keeps the same exact partial text', !selectionCard.hidden
    && selectionCard.excerpt === '“' + expectedText + '”', JSON.stringify(selectionCard));

  await page.waitForTimeout(2200);
  check('coarse-touch selection does not auto-save after pointer release or a delayed fuse', (await storedHighlights(page)).length === 0);
  check('pending touch selection advertises only the explicit Mark action', (await touchMark.getAttribute('aria-label') || '').includes('Highlight selected passage')
    && await touchMark.getAttribute('aria-expanded') === null
    && await touchMark.getAttribute('aria-controls') === null);

  await touchMark.click();
  await page.waitForTimeout(180);
  const saved = await storedHighlights(page);
  check('touch Mark saves the pending selection exactly once', saved.length === 1 && saved[0].text === expectedText, JSON.stringify(saved));
  check('touch Mark uses the chosen color without arming desktop marker mode', saved[0] && saved[0].color === 'mint'
    && await page.locator('#highlightBtn').getAttribute('aria-pressed') === 'false'
    && !await page.locator('body').evaluate(body => body.classList.contains('marker-on')));
  check('touch Mark returns to its idle color disclosure after saving', await touchMark.getAttribute('aria-expanded') === 'false'
    && await touchMark.getAttribute('aria-controls') === 'touchHighlightPalette');

  check(browserName + ' selection workflow has no page errors', errors.length === 0, errors.join('; '));
  await context.close();

  /* PDF highlights have a coordinate hit path separate from Reflow marks. Exercise
     that path with a fine pointer so persistent Marker can be on while editing. */
  const desktopContext = await browser.newContext({
    viewport: { width: 1180, height: 780 },
    hasTouch: false,
    isMobile: false,
    serviceWorkers: 'block'
  });
  const desktop = await desktopContext.newPage();
  desktop.setDefaultTimeout(18000);
  const desktopErrors = [];
  desktop.on('pageerror', error => desktopErrors.push(error.message));
  await desktop.addInitScript(seedReader);
  await openFixture(desktop);
  const desktopSelection = await selectPartialAcrossSpans(desktop, 'gamma', 'delta', 52, 'mouse');
  await desktop.waitForTimeout(180);
  await desktop.locator('#selectionHighlight').click();
  await desktop.waitForTimeout(180);
  const desktopExpected = desktopSelection && desktopSelection.exact.replace(/\s+/g, ' ').trim();
  check('the desktop PDF fixture has one saved partial highlight', (await storedHighlights(desktop)).length === 1
    && (await storedHighlights(desktop))[0].text === desktopExpected, JSON.stringify(await storedHighlights(desktop)));

  await desktop.locator('#highlightBtn').click();
  const highlightPoint = await desktop.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = state.chapters.find(item => item.id === id);
    const highlight = chapter.highlights['1'][0];
    const rect = highlight.rects[0];
    const paper = document.querySelector('.pdf-page[data-page="1"]').getBoundingClientRect();
    return {
      x: paper.left + (rect.x + rect.w / 2) * paper.width,
      y: paper.top + (rect.y + rect.h / 2) * paper.height
    };
  });
  await desktop.mouse.click(highlightPoint.x, highlightPoint.y);
  await desktop.waitForTimeout(180);
  const editState = await desktop.evaluate(() => ({
    count: (() => {
      const id = localStorage.getItem('readingRoom.lastOpen.v1');
      const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
      return state.chapters.find(item => item.id === id).highlights['1'].length;
    })(),
    cardOpen: !document.getElementById('selectionCard').classList.contains('hidden'),
    savedToolsVisible: !document.getElementById('selectionSavedTools').classList.contains('hidden'),
    markerOn: document.getElementById('highlightBtn').getAttribute('aria-pressed') === 'true'
  }));
  check('clicking a saved PDF highlight with desktop Marker on opens its edit card without erasing', editState.count === 1
    && editState.cardOpen && editState.savedToolsVisible && editState.markerOn, JSON.stringify(editState));
  await desktop.locator('#selectionRemoveHighlight').click();
  await desktop.waitForTimeout(180);
  check('only the explicit edit-card eraser removes that PDF highlight', (await storedHighlights(desktop)).length === 0
    && await desktop.locator('#selectionCard').evaluate(card => card.classList.contains('hidden')));

  const markerBeforeCancel = await desktop.evaluate(() => ({
    pressed: document.getElementById('highlightBtn').getAttribute('aria-pressed'),
    fine: matchMedia('(pointer: fine)').matches || matchMedia('(any-pointer: fine)').matches
  }));
  const cancelledSelection = await selectPartialAcrossSpans(desktop, 'epsilon', 'zeta', 53, 'mouse', 'pointercancel');
  check('the fine-pointer cancellation fixture ends a real partial Marker selection with pointercancel', markerBeforeCancel.pressed === 'true'
    && markerBeforeCancel.fine
    && !!cancelledSelection && cancelledSelection.finishEvent === 'pointercancel' && cancelledSelection.exact.length > 0,
    JSON.stringify(cancelledSelection));
  await desktop.waitForTimeout(720);
  check('a cancelled fine-pointer Marker selection does not auto-save after the commit delay', (await storedHighlights(desktop)).length === 0
    && await desktop.locator('#highlightBtn').getAttribute('aria-pressed') === 'true');
  check(browserName + ' desktop PDF highlight edit path has no page errors', desktopErrors.length === 0, desktopErrors.join('; '));
  await desktopContext.close();

  /* A convertible can expose coarse touch capability and still receive genuine mouse
     events. Desktop Marker follows the input event, while a touch selection continues
     to require the explicit dock action. */
  const hybridContext = await browser.newContext({
    viewport: { width: 1180, height: 780 },
    hasTouch: true,
    isMobile: false,
    deviceScaleFactor: 2,
    serviceWorkers: 'block'
  });
  const hybrid = await hybridContext.newPage();
  hybrid.setDefaultTimeout(18000);
  const hybridErrors = [];
  hybrid.on('pageerror', error => hybridErrors.push(error.message));
  await hybrid.addInitScript(installHybridPointerMedia);
  await hybrid.addInitScript(seedReader);
  await openFixture(hybrid);
  const hybridCapabilities = await hybrid.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches,
    fine: matchMedia('(pointer: fine)').matches || matchMedia('(any-pointer: fine)').matches,
    touchPoints: navigator.maxTouchPoints,
    markerVisible: document.getElementById('highlightBtn').getBoundingClientRect().width > 0,
    touchMarkVisible: document.getElementById('touchHighlight').getBoundingClientRect().width > 0
  }));
  check(browserName + ' hybrid fixture exposes touch capability and both marker controls', hybridCapabilities.coarse
    && hybridCapabilities.markerVisible && hybridCapabilities.touchMarkVisible, JSON.stringify(hybridCapabilities));

  await hybrid.evaluate(() => {
    window.__markerClickPointerType = '';
    document.getElementById('highlightBtn').addEventListener('click', event => {
      window.__markerClickPointerType = event.pointerType || '';
    }, { capture: true, once: true });
  });
  await hybrid.locator('#highlightBtn').click();
  const hybridMarkerState = await hybrid.evaluate(() => ({
    pointerType: window.__markerClickPointerType,
    markerOn: document.getElementById('highlightBtn').getAttribute('aria-pressed') === 'true',
    bodyMarkerOn: document.body.classList.contains('marker-on')
  }));
  check('a mouse click can arm persistent desktop Marker in a touch-capable context', hybridMarkerState.pointerType === 'mouse'
    && hybridMarkerState.markerOn && hybridMarkerState.bodyMarkerOn, JSON.stringify(hybridMarkerState));

  await hybrid.evaluate(() => {
    window.__markerKeyboardClick = null;
    document.getElementById('highlightBtn').addEventListener('click', event => {
      window.__markerKeyboardClick = { pointerType: event.pointerType || '', detail: event.detail };
    }, { capture: true, once: true });
  });
  await hybrid.locator('#highlightBtn').focus();
  await hybrid.keyboard.press('Enter');
  const hybridKeyboardState = await hybrid.evaluate(() => ({
    event: window.__markerKeyboardClick,
    markerOn: document.getElementById('highlightBtn').getAttribute('aria-pressed') === 'true',
    bodyMarkerOn: document.body.classList.contains('marker-on')
  }));
  check('keyboard activation with no pointerType still toggles Marker when a fine pointer is available', hybridKeyboardState.event
    && hybridKeyboardState.event.pointerType === '' && hybridKeyboardState.event.detail === 0
    && !hybridKeyboardState.markerOn && !hybridKeyboardState.bodyMarkerOn, JSON.stringify(hybridKeyboardState));

  await hybrid.locator('#highlightBtn').click();
  check('a second hybrid mouse click rearms Marker for the touch-selection check', await hybrid.locator('#highlightBtn').getAttribute('aria-pressed') === 'true');

  await hybrid.evaluate(() => {
    window.__hybridSelectionEvents = [];
    const remember = event => window.__hybridSelectionEvents.push({ type: event.type, pointerType: event.pointerType || '', text: window.getSelection().toString() });
    document.getElementById('documentPane').addEventListener('pointerdown', remember, { capture: true });
    document.addEventListener('selectionchange', remember, { capture: true });
    document.addEventListener('pointerup', remember, { capture: true });
  });
  const hybridSelection = await selectPartialAcrossSpans(hybrid, 'Alpha', 'beta', 61, 'touch');
  await hybrid.waitForTimeout(720);
  const hybridPendingState = await hybrid.evaluate(() => ({
    count: (() => {
      const id = localStorage.getItem('readingRoom.lastOpen.v1');
      const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
      return state.chapters.find(item => item.id === id).highlights['1']?.length || 0;
    })(),
    markerOn: document.getElementById('highlightBtn').getAttribute('aria-pressed') === 'true',
    touchLabel: document.getElementById('touchHighlight').getAttribute('aria-label') || '',
    nativeText: window.getSelection().toString(),
    events: window.__hybridSelectionEvents
  }));
  check('a touch selection stays pending despite hybrid desktop Marker mode', !!hybridSelection && hybridPendingState.count === 0
    && hybridPendingState.markerOn && hybridPendingState.touchLabel.includes('Highlight selected passage'),
    JSON.stringify({ selection: hybridSelection, state: hybridPendingState }));
  const hybridTouchBox = await hybrid.locator('#touchHighlight').boundingBox();
  await hybrid.touchscreen.tap(hybridTouchBox.x + hybridTouchBox.width / 2, hybridTouchBox.y + hybridTouchBox.height / 2);
  await hybrid.waitForTimeout(180);
  const hybridSaved = await storedHighlights(hybrid);
  const hybridExpected = hybridSelection && hybridSelection.exact.replace(/\s+/g, ' ').trim();
  check('the hybrid touch Mark explicitly saves the pending passage once', hybridSaved.length === 1
    && hybridSaved[0].text === hybridExpected && await hybrid.locator('#highlightBtn').getAttribute('aria-pressed') === 'true',
    JSON.stringify(hybridSaved));
  check(browserName + ' hybrid input path has no page errors', hybridErrors.length === 0, hybridErrors.join('; '));
  await hybridContext.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
