/* Real-toolbar layout and color-selection coverage. Synthetic browser input does
   not replace on-device Pencil testing. */
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_PALETTE_TEST_PORT || 8187);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const COLORS = { black: '#20313b', blue: '#245bc1', red: '#ba3f35', green: '#24734b', purple: '#7842a3', orange: '#c26a1c', teal: '#157d86', gray: '#687782' };
let checks = 0, failures = 0;
function check(name, pass, detail) {
  checks++; if (!pass) failures++;
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + JSON.stringify(detail) : ''));
}
function fixturePdf() {
  const objects = ['', '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\nendstream'];
  let source = '%PDF-1.4\n', offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = Buffer.byteLength(source); source += i + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(source);
  source += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) source += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(source + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
}
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  fs.readFile(path.join(ROOT, pathname === '/' ? '/reading.html' : pathname), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
    response.end(data);
  });
});
function overlaps(a, b) { return a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1; }
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
      localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
      localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
    });
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html');
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'palette.pdf', mimeType: 'application/pdf', buffer: fixturePdf() });
    await page.waitForFunction(() => document.querySelector('.pdf-page canvas')?.width > 0);
    await page.locator('#pdfWriteBtn').evaluate(button => button.click());
    check('all eight color presets are exposed with accessible names', await page.locator('[data-pdf-ink-color]').evaluateAll(buttons => buttons.length === 8 && buttons.every(button => button.getAttribute('aria-label') && button.title)));
    check('Pen and Eraser are named icon-only controls', await page.locator('[data-pdf-ink-tool]').evaluateAll(buttons => buttons.length === 2 && buttons.every(button => button.getAttribute('aria-label') && !button.textContent.trim())));
    check('instructions remain accessible without adding a visible footer', await page.locator('#pdfInkHint').evaluate(hint => hint.classList.contains('sr-only') && hint.getBoundingClientRect().height <= 1 && document.getElementById('pdfInkToolbar').getAttribute('aria-describedby') === hint.id));
    for (const [name, color] of Object.entries(COLORS)) {
      await page.locator('[data-pdf-ink-tool="eraser"]').click();
      await page.locator('[data-pdf-ink-color="' + name + '"]').click();
      const state = await page.locator('[data-pdf-ink-color="' + name + '"]').evaluate(button => ({
        selected: button.getAttribute('aria-pressed'), color: getComputedStyle(button).getPropertyValue('--pdf-ink-color').trim(),
        selectedCount: document.querySelectorAll('[data-pdf-ink-color][aria-pressed="true"]').length,
        pen: document.querySelector('[data-pdf-ink-tool="pen"]').getAttribute('aria-pressed')
      }));
      check(name + ' is a single-tap choice that selects Pen and a unique swatch', state.selected === 'true' && state.color === color && state.selectedCount === 1 && state.pen === 'true');
    }
    check('toolbar explains straightening and shared whole-object erasing', /hold pencil to straighten/i.test(await page.locator('#pdfInkHint').textContent())
      && /whole strokes.*text highlights/i.test(await page.locator('#pdfInkHint').textContent())
      && /handwriting strokes and text highlights/i.test(await page.locator('[data-pdf-ink-tool="eraser"]').getAttribute('title')));
    for (const zen of [false, true]) {
      if (zen) await page.locator('#zenBtn').evaluate(button => button.click());
      for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 800 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(180);
        const geometry = await page.locator('#pdfInkToolbar').evaluate(toolbar => {
          const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          return { toolbar: rect(toolbar), buttons: Array.from(toolbar.querySelectorAll('button')).map(rect),
            scroll: toolbar.scrollHeight > toolbar.clientHeight + 1 || toolbar.scrollWidth > toolbar.clientWidth + 1,
            dock: rect(document.getElementById(document.body.classList.contains('zen') ? 'zenDock' : 'touchDock')) };
        });
        const label = (zen ? 'Zen ' : 'Reader ') + viewport.width + '×' + viewport.height;
        check(label + ' keeps every color and control visible at 44px without scrolling', !geometry.scroll && geometry.buttons.length === 16
          && geometry.buttons.every(r => r.width >= 43.9 && r.height >= 43.9 && r.x >= geometry.toolbar.x && r.right <= geometry.toolbar.right + .5 && r.y >= geometry.toolbar.y && r.bottom <= geometry.toolbar.bottom + .5)
          && geometry.toolbar.x >= 0 && geometry.toolbar.right <= viewport.width + .5 && geometry.toolbar.y >= 0 && geometry.toolbar.bottom <= viewport.height + .5,
        geometry.scroll ? geometry : undefined);
        check(label + ' does not cover the reading dock', !overlaps(geometry.toolbar, geometry.dock));
        check(label + ' uses compact rows', geometry.toolbar.height <= (viewport.width >= 1024 ? 61 : viewport.width >= 528 ? 110 : viewport.width >= 390 && !zen ? 160 : 205), geometry.toolbar);
        if (process.env.PHLOEM_PALETTE_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_PALETTE_SCREENSHOT + '-' + (zen ? 'zen' : 'reader') + '-' + viewport.width + 'x' + viewport.height + '.png' });
      }
    }
    const appearances = await page.evaluate(colors => {
      const frame = document.querySelector('.pdf-frame'); frame.classList.add('dark-paper'); frame.dataset.paperAppearance = 'night';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); frame.appendChild(svg);
      const results = Object.entries(colors).map(([name, color]) => {
        const ink = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ink.classList.add('pdf-ink-stroke'); ink.dataset.inkColor = name; ink.setAttribute('fill', color); svg.appendChild(ink);
        const dark = getComputedStyle(ink).fill;
        frame.dataset.paperAppearance = 'original'; const original = getComputedStyle(ink).fill; frame.dataset.paperAppearance = 'night';
        return { name, dark, original, stored: ink.getAttribute('fill') };
      });
      svg.remove(); return results;
    }, COLORS);
    check('all eight colors have lighter dark-paper equivalents without changing saved colors', appearances.every(item => item.dark !== item.original && item.stored === COLORS[item.name]), appearances);
    check('toolbar interactions have no uncaught page errors', errors.length === 0, errors.length ? errors : undefined);
    console.log('\n' + (checks - failures) + '/' + checks + ' checks passed (' + browserName + ').');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
