/* Phone-sized Fold path: controls must be discoverable before any auto-scroll. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_FOLD_PHONE_PORT || 8293);
const BROWSER = process.env.PHLOEM_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(BROWSER), 'PHLOEM_BROWSER must be chromium or webkit');
const server = http.createServer((request, response) => {
  const file = path.join(ROOT, decodeURIComponent(request.url.split('?')[0]));
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(data);
  });
});

async function fixture() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.setTitle('Phone fold fixture');
  for (let pageNumber = 1; pageNumber <= 2; pageNumber++) {
    const page = document.addPage([612, 792]);
    for (let line = 0; line < 12; line++) {
      page.drawText(`Left passage ${line} on page ${pageNumber}`, { x: 32, y: 744 - 45 * line, size: 12, font });
      page.drawText(`Right passage ${line} on page ${pageNumber}`, { x: 320, y: 744 - 45 * line, size: 12, font });
    }
  }
  return Buffer.from(await document.save());
}

async function ready(page) {
  // Leaving the reader retains its old canvas and ready flag. Reopening awaits
  // stored data before clearing that flag, so require the reader to be visible too.
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelector('#pdfFrame[data-position-ready="true"] .pdf-page .text-layer span') && document.querySelector('.pdf-page canvas')?.width > 0);
}

async function chapter(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return state.chapters.find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1'));
  });
}

async function assertInitiallyInside(page, target, scrollport, label) {
  const geometry = await page.evaluate(({ target, scrollport }) => {
    const control = document.querySelector(target), container = document.querySelector(scrollport);
    const c = control.getBoundingClientRect(), p = container.getBoundingClientRect();
    return { control: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
      port: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
      scrollLeft: container.scrollLeft, scrollTop: container.scrollTop,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
  }, { target, scrollport });
  const { control, port } = geometry;
  assert.equal(geometry.scrollLeft, 0, `${label}: scrollport begins at left edge: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.scrollTop, 0, `${label}: scrollport begins at top edge: ${JSON.stringify(geometry)}`);
  assert.ok(control.left >= port.left && control.right <= port.right && control.top >= port.top && control.bottom <= port.bottom,
    `${label} fully visible in its scrollport before Playwright auto-scroll: ${JSON.stringify(geometry)}`);
  assert.ok(control.left >= 0 && control.right <= geometry.viewportWidth && control.top >= 0 && control.bottom <= geometry.viewportHeight,
    `${label} fully visible in phone viewport: ${JSON.stringify(geometry)}`);
}

function seed() {
  if (sessionStorage.getItem('fold-phone-fixture')) return;
  sessionStorage.setItem('fold-phone-fixture', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browserType = BROWSER === 'webkit' ? webkit : chromium;
  const executablePath = BROWSER === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
  let browser;
  try {
    browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
      isMobile: true, deviceScaleFactor: 3, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seed);
    await page.goto(`http://127.0.0.1:${PORT}/reading.html`);
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'phone-fold-fixture.pdf', mimeType: 'application/pdf', buffer: await fixture() });
    await ready(page);
    assert.ok((await chapter(page)).contentHash, 'imported PDF is fingerprinted');
    // Zen is the only reader (1a215db5): the phone bottom bar gave way to Zen's More.
    assert.ok(await page.locator('#zenMore').isVisible(), 'phone More button is visible');
    assert.ok(await page.locator('#settingsBtn').isHidden(), 'Desk settings is not directly visible inside the phone reader');

    // The opt-in lives in Desk settings. Return using the visible phone Back (X) control.
    const paperId = await page.evaluate(() => localStorage.getItem('readingRoom.lastOpen.v1'));
    await page.locator('#zenExit').click();
    await page.locator('#settingsBtn').click();
    await page.locator('#settingsDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#pdfFoldEnabled').isChecked(), false, 'folding is opt-in');
    await assertInitiallyInside(page, '#pdfFoldEnabled', '#settingsDialog', 'fold opt-in');
    await page.locator('#pdfFoldEnabled').check();
    await page.locator('[data-close="settingsDialog"]').click();
    await page.locator('[data-continue-paper="' + paperId + '"]').first().click();
    await ready(page);

    // On a phone the Zen More menu reveals the Reading settings control.
    await page.locator('#zenMore').click();
    assert.ok(await page.locator('#zenSettings').isVisible(), 'Reading settings appears in phone More menu');
    await page.locator('#zenSettings').click();
    await page.locator('#comfortBar').waitFor({ state: 'visible' });
    assert.ok(await page.locator('[data-pdf-layout="scroll"]').getAttribute('aria-pressed') === 'true', 'Scroll layout is active');
    await assertInitiallyInside(page, '#openPdfFold', '#comfortBar', 'Fold section');
    await page.screenshot({ path: `/tmp/phloem-fold-phone-${BROWSER}-controls.png` });
    const before = await chapter(page);
    const annotations = JSON.stringify([before.pdfInk, before.pdfInkDeleted, before.highlights, before.pageNotes]);

    await page.locator('#openPdfFold').click();
    await page.locator('#pdfFoldDialog').waitFor({ state: 'visible' });
    await page.locator('#pdfFoldTop').fill('25');
    await page.locator('#pdfFoldBottom').fill('55');
    await page.locator('#confirmPdfFold').click();
    await page.locator('.pdf-page[data-page="1"] .pdf-fold-seam').waitFor({ state: 'visible' });
    const folded = await chapter(page);
    assert.ok(Object.keys(folded.pdfFolds.byHash[folded.contentHash].items).length === 1, 'fold saved');
    assert.equal(JSON.stringify([folded.pdfInk, folded.pdfInkDeleted, folded.highlights, folded.pageNotes]), annotations, 'source annotations untouched');
    await page.screenshot({ path: `/tmp/phloem-fold-phone-${BROWSER}-folded.png` });
    await page.locator('.pdf-page[data-page="1"] .pdf-fold-seam').click();
    await page.waitForFunction(() => !document.querySelector('.pdf-fold-seam'));
    assert.deepEqual(errors, [], 'no browser errors');
    console.log(`PASS ${BROWSER} 390x844: phone-visible opt-in/Fold controls, confirm, preserved annotations, seam restore; screenshots in /tmp/phloem-fold-phone-${BROWSER}-*.png`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
