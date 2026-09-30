/* Real reader UI coverage. AI/network is not invoked by opening a quick action;
   synthetic pointer input is not a substitute for testing on a physical iPad. */
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_MARKER_ACTIONS_TEST_PORT || 8196);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0, failures = 0;
function check(name, passed, detail) {
  checks++; if (!passed) failures++;
  console.log((passed ? 'PASS ' : 'FAIL ') + name + (passed || detail === undefined ? '' : ' ' + JSON.stringify(detail)));
}
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  fs.readFile(path.join(ROOT, pathname), (error, body) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); res.end(body);
  });
});
function seed() {
  if (localStorage.getItem('markerActions.fixture')) return;
  localStorage.setItem('markerActions.fixture', '1');
  const paper = {
    id: 'marker-actions-text', kind: 'text', title: 'Marker actions paper', authors: 'Fixture',
    fr: 'Alpha beta gamma delta epsilon zeta eta theta.\n\nSecond paragraph for nearby passage context.',
    textHighlights: [{ id: 'chosen-highlight', para: 0, start: 6, end: 16, text: 'beta gamma', color: 'yellow', note: 'A note that must not be sent automatically.', at: Date.now() }],
    readerHighlights: [], highlights: {}, notes: {}, readerNotes: {}, pageNotes: {}, questions: [], aiThreads: [],
    termLookups: {
      'beta gamma': { title: 'Beta gamma definition', extract: 'A cached definition fixture.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Beta', imageChecked: true },
      'alpha': { title: 'Alpha definition', extract: 'An exact selected term fixture.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Alpha', imageChecked: true }
    }, tags: [], at: Date.now()
  };
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [paper], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.lastOpen.v1', paper.id);
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
}
async function tap(page, selector) { await page.locator(selector).evaluate(element => element.click()); await page.waitForTimeout(45); }
async function chapter(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === localStorage.getItem('readingRoom.lastOpen.v1'))); }
async function palette(page, surface = 'header') {
  const trigger = { header: 'highlightColorBtn', dock: 'touchHighlight', zen: 'zenMarker' }[surface];
  if (surface === 'zen' && !await page.locator('body').evaluate(body => body.classList.contains('zen'))) await tap(page, '#zenBtn');
  if (!await page.locator('#highlightToolbar').isVisible()) await tap(page, '#' + trigger);
}
async function selectAlpha(page) {
  await page.evaluate(() => {
    const original = document.querySelector('#textDocument .original'), node = original.firstChild, rect = original.getBoundingClientRect();
    original.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 45, isPrimary: true, button: 0, buttons: 1, clientX: rect.left + 3, clientY: rect.top + 8 }));
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 5);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    original.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 45, isPrimary: true, button: 0, buttons: 0 }));
  });
  await page.waitForFunction(() => document.getElementById('highlightBtn').classList.contains('ready'));
}
function pdfFixture() {
  const stream = 'BT /F1 20 Tf 72 700 Td (Boundary marker test) Tj ET\n';
  const objects = ['', '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream'];
  let source = '%PDF-1.4\n', offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = Buffer.byteLength(source); source += i + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(source); source += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) source += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(source + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true }; if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    for (const touch of [true, false]) {
      const label = touch ? 'touch' : 'desktop', context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [], outbound = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(/https:\/\/(?:api\.(?:openai|anthropic|deepseek)\.com|en\.wikipedia\.org|commons\.wikimedia\.org)\//, route => { outbound.push(route.request().url()); return route.abort(); });
      await page.addInitScript(seed);
      await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
      await page.waitForSelector('#textDocument mark[data-hl-id]');
      check(label + ' one shared toolbar has Define and Ask AI', await page.locator('[data-marker-action="define"]').count() === 1 && await page.locator('[data-marker-action="ask"]').count() === 1);
      await palette(page);
      check(label + ' historical highlight is not chosen before reader selects it', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Select text'));
      await tap(page, '#highlightToolbar [data-marker-action="define"]');
      check(label + ' missing target guides without opening lookup', (await page.locator('#readerToast').textContent()).includes('Select text') && !await page.locator('#lookupCard').isVisible() && outbound.length === 0);
      await tap(page, '#textDocument mark[data-hl-id]');
      for (const surface of ['header', ...(touch ? ['dock'] : []), 'zen']) {
        await palette(page, surface);
        const description = await page.locator('#highlightToolbar [data-marker-action-context]').textContent();
        check(label + ' ' + surface + ' previews explicitly selected passage', description === '“beta gamma”', description);
        check(label + ' ' + surface + ' quick actions have 44px targets', await page.locator('#highlightToolbar [data-marker-action]').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44 && button.getBoundingClientRect().width >= 44)));
        await page.locator('#highlightToolbar [data-marker-action="define"]').click();
        await page.waitForFunction(() => document.getElementById('lookupTitle').textContent === 'Beta gamma definition');
        check(label + ' ' + surface + ' Define reuses cached explicit passage', (await page.locator('#lookupSelection').textContent()) === '“beta gamma”' && outbound.length === 0);
        await tap(page, '#lookupClose');
        if (surface === 'zen') await tap(page, '#zenExit');
      }
      await palette(page);
      await page.locator('#highlightToolbar [data-marker-action="ask"]').click();
      await page.waitForFunction(() => document.activeElement.id === 'aiQuestion');
      check(label + ' Ask AI opens existing question composer', await page.locator('#aiPanel').isVisible());
      check(label + ' Ask AI uses explicit passage and related note', (await page.locator('#contextExcerpt').textContent()).includes('“beta gamma”') && (await page.locator('#contextLabel').textContent()).includes('+ note'));
      const afterAsk = await chapter(page);
      check(label + ' opening Ask AI sends nothing and saves no thread', outbound.length === 0 && afterAsk.aiThreads.length === 0 && afterAsk.questions.length === 0);
      check(label + ' saved highlight and note remain intact', afterAsk.textHighlights.length === 1 && afterAsk.textHighlights[0].note === 'A note that must not be sent automatically.');
      if (touch) await tap(page, '#sheetClose'); else await tap(page, '#notebookTuck');
      await selectAlpha(page); await palette(page);
      check(label + ' pending native selection takes precedence over last highlight', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()) === '“Alpha”');
      await page.locator('#highlightToolbar [data-marker-action="define"]').click();
      await page.waitForFunction(() => document.getElementById('lookupTitle').textContent === 'Alpha definition');
      check(label + ' Define does not silently create highlight', (await chapter(page)).textHighlights.length === 1);
      await tap(page, '#lookupClose'); await palette(page); await tap(page, '#highlightToolbar [data-marker-action="ask"]');
      check(label + ' Ask AI accepts selected text without a saved note', (await page.locator('#contextExcerpt').textContent()).includes('“Alpha”') && (await chapter(page)).textHighlights.length === 1 && outbound.length === 0);
      if (touch) await tap(page, '#sheetClose'); else await tap(page, '#notebookTuck');
      await tap(page, '#textDocument mark[data-hl-id]'); await tap(page, '#selectionRemoveHighlight'); await palette(page);
      await tap(page, '#highlightToolbar [data-marker-action="ask"]');
      check(label + ' deleted last highlight is never reused', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Select text') && (await page.locator('#readerToast').textContent()).includes('Select text'));
      await tap(page, '#readerBack');
      await page.setInputFiles('#pdfFile', { name: 'marker-actions-pages.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
      await page.waitForSelector('.pdf-page[data-page="1"] .text-layer span');
      await page.evaluate(() => {
        const span = document.querySelector('.pdf-page[data-page="1"] .text-layer span'), range = document.createRange();
        range.selectNodeContents(span); getSelection().removeAllRanges(); getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
      });
      await page.waitForFunction(() => document.getElementById('highlightBtn').classList.contains('ready'));
      await tap(page, '#selectionHighlight'); await palette(page);
      check(label + ' newly committed PDF highlight is available immediately', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Boundary marker test'));
      await tap(page, '#nextPage'); await page.waitForFunction(() => document.getElementById('pageNumber').textContent.trim().startsWith('2'));
      await palette(page); await tap(page, '#highlightToolbar [data-marker-action="ask"]');
      check(label + ' previous-page PDF highlight cannot leak into quick action', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Select text') && (await page.locator('#readerToast').textContent()).includes('Select text') && outbound.length === 0);
      check(label + ' no runtime errors', errors.length === 0, errors);
      await context.close();
    }
  } catch (error) { failures++; console.error(error.stack || error); }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(`${checks} checks, ${failures} failures (${browserName})`); process.exitCode = failures ? 1 : 0; }
})();
