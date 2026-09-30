/* Exercise color changes through the rendered controls. Touch/Pencil simulation
   is browser coverage, not a replacement for physical iPad testing. */
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_TOOL_PALETTES_TEST_PORT || 8193);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0, failures = 0;
function check(name, passed, detail) {
  checks++; if (!passed) failures++;
  console.log((passed ? 'PASS ' : 'FAIL ') + name + (passed || detail === undefined ? '' : ' ' + JSON.stringify(detail)));
}
function fixturePdf() {
  const stream = ['Alpha beta gamma delta', 'Iota kappa lambda mu', 'Nu xi omicron pi'].map((line, index) =>
    'BT /F1 18 Tf 0 g 1 0 0 1 72 ' + (700 - index * 48) + ' Tm (' + line + ') Tj ET'
  ).join('\n') + '\n';
  const objects = ['', '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
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
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false, guide: 'none' }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}
async function activate(page, selector, touch) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
}
async function state(page) {
  return page.evaluate(() => ({
    write: document.body.classList.contains('pdf-ink-active'),
    sticky: document.body.classList.contains('marker-on'),
    eraser: document.body.classList.contains('highlight-erasing'),
    markerColor: document.getElementById('markerTools').dataset.highlightColor,
    markerPalettes: ['highlightToolbar'].filter(id => !document.getElementById(id).classList.contains('hidden')),
    inkColor: document.querySelector('[data-pdf-ink-color][aria-pressed="true"]')?.dataset.pdfInkColor,
    inkSelectionCount: document.querySelectorAll('[data-pdf-ink-color][aria-pressed="true"]').length,
    markerSelections: Array.from(document.querySelectorAll('.marker-swatch[data-highlight-color][aria-pressed="true"]')).map(button => button.dataset.highlightColor)
  }));
}
async function outside(page, touch) {
  if (await page.locator('body').evaluate(body => body.classList.contains('zen'))) {
    await activate(page, '#zenLayout', touch);
    await activate(page, '#zenLayout', touch);
  } else {
    // The title is now an explicit Rename action rather than inert chrome.
    await activate(page, '#readerTitle', touch);
    await activate(page, '#renamePaperDialog .icon-btn', touch);
  }
}
async function pencilOnPaper(page, palette, label) {
  const layer = page.locator('.pdf-page[data-page="1"] .text-layer');
  await layer.evaluate(element => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'pen',
      pointerId: 91, isPrimary: true, button: 0, buttons: 1, pressure: .6, clientX: box.left + 15, clientY: box.top + 20 }));
  });
  check(label + ' Pencil interaction on the paper keeps the colors available', await page.locator(palette).isVisible());
  await layer.evaluate(element => element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true,
    pointerType: 'pen', pointerId: 91, isPrimary: true, button: 0, buttons: 0 })));
}
async function checkWriteColors(page, touch, label, write) {
  await activate(page, write, touch);
  const swatches = page.locator('#pdfInkToolbar [data-pdf-ink-color]');
  check(label + ' Write immediately reveals all eight Pen colors', await page.locator('#pdfInkToolbar').isVisible()
    && await swatches.count() === 8 && await swatches.evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().width > 0)));
  for (const color of ['blue', 'purple']) {
    await activate(page, '[data-pdf-ink-color="' + color + '"]', touch);
    const current = await state(page);
    check(label + ' Pen stays open after choosing ' + color, await page.locator('#pdfInkToolbar').isVisible()
      && current.write && current.inkColor === color && current.inkSelectionCount === 1
      && !current.sticky && !current.eraser && current.markerPalettes.length === 0 && current.markerSelections.length === 0, current);
  }
  return page.locator('#pdfInkToolbar').evaluate(bar => ({ bottom: bar.getBoundingClientRect().bottom, left: bar.getBoundingClientRect().left }));
}
async function checkBottomToolbar(page, label, pen) {
  const geometry = await page.locator('#highlightToolbar').evaluate(bar => {
    const rect = bar.getBoundingClientRect();
    return { position: getComputedStyle(bar).position, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight, zen: document.body.classList.contains('zen'), scroll: bar.scrollWidth > bar.clientWidth + 1 || bar.scrollHeight > bar.clientHeight + 1,
      buttons: Array.from(bar.querySelectorAll('button')).map(button => {
        const r = button.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }), descriptions: Array.from(bar.querySelectorAll('[data-marker-action-context],#highlightHint')).map(element => {
        const r = element.getBoundingClientRect(), style = getComputedStyle(element);
        return { width: r.width, height: r.height, available: style.display !== 'none' && style.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true' };
      }) };
  });
  check(label + ' uses the same bottom-screen position as Pen', geometry.position === 'fixed'
    && Math.abs(geometry.bottom - pen.bottom) <= 1 && geometry.height - geometry.bottom <= (geometry.width <= 720 && !geometry.zen ? 74 : 20)
    && geometry.left >= 0 && geometry.right <= geometry.width && geometry.top > geometry.height / 2, geometry);
  check(label + ' exposes every tool and color at 44px without scrolling', !geometry.scroll && geometry.buttons.length === 8
    && geometry.buttons.every(button => button.width >= 43.9 && button.height >= 43.9 && button.left >= geometry.left
      && button.right <= geometry.right + .5 && button.top >= geometry.top && button.bottom <= geometry.bottom + .5), geometry);
  const centers = geometry.buttons.map(button => (button.top + button.bottom) / 2), centerSpread = Math.max(...centers) - Math.min(...centers);
  check(label + ' keeps the bar to one compact row, or two in narrow views', geometry.width > 720
    ? geometry.bottom - geometry.top <= 70 && centerSpread <= 1
    : geometry.bottom - geometry.top <= 120 && centerSpread <= 52, geometry);
  check(label + ' keeps passage context and instructions accessible without showing extra lines', geometry.descriptions.length === 2
    && geometry.descriptions.every(description => description.available && description.width <= 1.5 && description.height <= 1.5), geometry.descriptions);
}
async function checkPalette(page, touch, surface) {
  const label = (touch ? 'touch ' : 'desktop ') + surface.label;
  const pen = await checkWriteColors(page, touch, label, surface.write);
  await activate(page, surface.trigger, touch);
  let current = await state(page);
  check(label + ' Marker opens colors immediately and turns Pen off', await page.locator(surface.palette).isVisible()
    && !current.write && !await page.locator('#pdfInkToolbar').isVisible()
    && current.markerPalettes.length === 1 && current.markerPalettes[0] === surface.palette.slice(1), current);
  await checkBottomToolbar(page, label, pen);
  if (!touch && surface.label === 'header') check(label + ' keeps desktop sticky Marker behavior', current.sticky, current);
  if (touch) check(label + ' leaves finger selection in explicit Mark mode', !current.sticky, current);
  for (const color of ['mint', 'blue', 'coral']) {
    await activate(page, surface.palette + ' [data-highlight-color="' + color + '"]', touch);
    current = await state(page);
    check(label + ' keeps colors open after choosing ' + color, await page.locator(surface.palette).isVisible()
      && current.markerColor === color && current.markerSelections.length === 1
      && current.markerSelections.every(selected => selected === color) && !current.write, current);
    if (color === 'mint') await pencilOnPaper(page, surface.palette, label);
  }
  await outside(page, touch);
  current = await state(page);
  check(label + ' outside chrome dismisses colors and retains the chosen color', current.markerPalettes.length === 0
    && current.markerColor === 'coral' && !current.write, current);
  if (!touch && surface.label === 'header') check(label + ' outside click preserves sticky Marker', current.sticky, current);
  await activate(page, surface.reopen || surface.trigger, touch);
  check(label + ' can reopen its retained color choices', await page.locator(surface.palette).isVisible());
  const stickyBeforeEscape = (await state(page)).sticky;
  await page.keyboard.press('Escape');
  current = await state(page);
  check(label + ' Escape closes the bar before changing the active mode', current.markerPalettes.length === 0
    && current.sticky === stickyBeforeEscape && !current.write, current);
  await activate(page, surface.reopen || surface.trigger, touch);
  await activate(page, surface.write, touch);
  current = await state(page);
  check(label + ' switching to Write closes every Marker palette', current.write && current.markerPalettes.length === 0
    && !current.sticky && current.markerSelections.length === 0 && await page.locator('#pdfInkToolbar').isVisible(), current);
  await activate(page, '#pdfInkDone', touch);
  check(label + ' Done closes the Pen controls', !await page.locator('#pdfInkToolbar').isVisible() && !(await state(page)).write);
  await activate(page, surface.trigger, touch);
  await activate(page, '#highlightToolbar [data-highlight-eraser]', touch);
  current = await state(page);
  check(label + ' Eraser stays in the bottom bar', current.eraser && current.markerPalettes.length === 1
    && !current.write && current.markerSelections.length === 0, current);
  await activate(page, '#highlightToolbar [data-highlight-color="coral"]', touch);
  current = await state(page);
  check(label + ' a color returns from Eraser to Highlight without hiding the bar', !current.eraser
    && current.markerColor === 'coral' && current.markerPalettes.length === 1 && current.markerSelections.length === 1, current);
  await activate(page, '#highlightDone', touch);
  current = await state(page);
  check(label + ' Highlight Done closes the bar and clears sticky mode', current.markerPalettes.length === 0 && !current.sticky && !current.eraser, current);
  await activate(page, surface.trigger, touch);
  await activate(page, '#highlightToolbar [data-highlight-eraser]', touch);
  await activate(page, '#highlightDone', touch);
  current = await state(page);
  check(label + ' Done also clears Eraser', current.markerPalettes.length === 0 && !current.sticky && !current.eraser, current);
}
async function selectPassage(page, prefix) {
  await page.locator('.pdf-page[data-page="1"]').evaluate(holder => {
    const pane = document.getElementById('documentPane');
    pane.scrollTop += holder.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
  });
  await page.evaluate(prefix => {
    const span = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).find(item => item.textContent.startsWith(prefix));
    const box = span.getBoundingClientRect();
    span.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 87, isPrimary: true, button: 0, buttons: 1, clientX: box.left + 2, clientY: box.top + box.height / 2 }));
    const range = document.createRange();
    range.setStart(span.firstChild, 0); range.setEnd(span.firstChild, span.firstChild.length);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    span.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 87, isPrimary: true, button: 0, buttons: 0, clientX: box.right - 2, clientY: box.top + box.height / 2 }));
  }, prefix);
  await page.waitForFunction(() => document.getElementById('highlightBtn').classList.contains('ready'));
}
async function checkPendingMark(page, surface) {
  await selectPassage(page, surface.prefix);
  await activate(page, surface.trigger, true);
  await page.waitForFunction(prefix => {
    const library = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = library.chapters.find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return (chapter.highlights?.['1'] || []).some(item => item.text.startsWith(prefix) && item.color === 'coral');
  }, surface.prefix);
  const current = await state(page);
  check('touch ' + surface.label + ' commits a pending passage and opens the bottom bar', !current.sticky
    && !current.write && current.markerPalettes.length === 1, current);
  check('touch ' + surface.label + ' keeps the latest highlight available to Define without Ask AI',
    (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes(surface.prefix)
    && await page.locator('#highlightToolbar [data-marker-action="define"]').count() === 1
    && await page.locator('#highlightToolbar [data-marker-action="ask"]').count() === 0);
  if (process.env.PHLOEM_TOOL_PALETTE_SCREENSHOT) {
    await page.screenshot({ path: process.env.PHLOEM_TOOL_PALETTE_SCREENSHOT + '-' + surface.label.toLowerCase() + '.png' });
  }
  await activate(page, '#highlightUndo', true);
  await page.waitForFunction(prefix => {
    const library = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = library.chapters.find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
    return !(chapter.highlights?.['1'] || []).some(item => item.text.startsWith(prefix));
  }, surface.prefix);
  check('touch ' + surface.label + ' toolbar Undo reverses the shared latest edit without closing', await page.locator('#highlightToolbar').isVisible());
  await activate(page, '#highlightDone', true);
}
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, hasTouch: touch, isMobile: touch,
        deviceScaleFactor: touch ? 2 : 1, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seedReader);
      await page.addInitScript(() => Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined }));
      await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      await page.setInputFiles('#pdfFile', { name: 'tool-palettes.pdf', mimeType: 'application/pdf', buffer: fixturePdf() });
      await page.waitForFunction(() => document.querySelector('.pdf-page canvas')?.width > 0
        && Array.from(document.querySelectorAll('.text-layer span')).some(span => span.textContent.startsWith('Alpha')));
      check((touch ? 'touch' : 'desktop') + ' uses one shared Highlight toolbar with no old dropdowns',
        await page.locator('#highlightToolbar').count() === 1 && await page.locator('#highlightPalette,#touchHighlightPalette,#zenMarkerMenu,#zenMarkerToggle').count() === 0);
      const surfaces = [{ label: 'header', trigger: '#highlightBtn', reopen: '#highlightColorBtn', palette: '#highlightToolbar', write: touch ? '#touchWrite' : '#pdfWriteBtn', prefix: 'Alpha' }];
      if (touch) surfaces.push({ label: 'dock', trigger: '#touchHighlight', palette: '#highlightToolbar', write: '#touchWrite', prefix: 'Iota' });
      surfaces.push({ label: 'Zen', trigger: '#zenMarker', palette: '#highlightToolbar', write: '#zenWrite', prefix: 'Nu' });
      for (const surface of surfaces) {
        if (surface.label === 'Zen') await activate(page, '#zenBtn', touch);
        await checkPalette(page, touch, surface);
        if (touch) await checkPendingMark(page, surface);
      }
      if (touch) {
        for (const zen of [false, true]) {
          if (await page.locator('body').evaluate(body => body.classList.contains('zen')) !== zen) {
            await page.locator(zen ? '#zenBtn' : '#zenExit').evaluate(button => button.click());
          }
          for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 800 }]) {
            await page.setViewportSize(viewport);
            await page.waitForTimeout(80);
            await page.locator('#pdfWriteBtn').evaluate(button => button.click());
            const pen = await page.locator('#pdfInkToolbar').evaluate(bar => ({ bottom: bar.getBoundingClientRect().bottom }));
            await page.locator('#highlightColorBtn').evaluate(button => button.click());
            await checkBottomToolbar(page, (zen ? 'Zen ' : 'Reader ') + viewport.width + '×' + viewport.height, pen);
            if (process.env.PHLOEM_TOOL_PALETTE_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_TOOL_PALETTE_SCREENSHOT + '-' + (zen ? 'zen' : 'reader') + '-' + viewport.width + 'x' + viewport.height + '.png' });
            await page.locator('#highlightDone').click();
          }
        }
      }
      check((touch ? 'touch' : 'desktop') + ' palette interactions have no page errors', errors.length === 0, errors);
      await context.close();
    }
    console.log('\n' + (checks - failures) + '/' + checks + ' checks passed (' + browserName + ').');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
