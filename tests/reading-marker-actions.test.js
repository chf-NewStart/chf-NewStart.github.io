/* Real reader UI coverage with cached definitions and no live network calls;
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
  if (surface === 'zen' && !await page.locator('body').evaluate(body => body.classList.contains('zen'))) await page.locator('#zenBtn').click();
  if (surface === 'zen' && !await page.locator('#zenAnnotateMenu').isVisible()) await page.locator('#zenAnnotate').click();
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
      await page.waitForFunction(() => document.body.classList.contains('zen'));
      await page.locator('#zenExit').click();
      await page.waitForFunction(() => !document.body.classList.contains('zen'));
      check(label + ' shared Highlight toolbar retains Define without Ask AI', await page.locator('#highlightToolbar [data-marker-action="define"]').count() === 1
        && await page.locator('#highlightToolbar [data-marker-action="ask"]').count() === 0
        && !/Ask AI/.test(await page.locator('#highlightToolbar').textContent()));
      check(label + ' compact toolbar uses color swatches instead of a redundant Highlight button', await page.locator('#highlightToolbar [data-highlight-tool="marker"]').count() === 0
        && await page.locator('#highlightToolbar [data-highlight-color]').count() === 4);
      check(label + ' main AI panel retains its question composer and Ask button', await page.locator('#aiPanel #aiQuestion').count() === 1
        && await page.locator('#aiPanel #aiAskBtn').count() === 1 && (await page.locator('#aiAskBtn').textContent()).trim() === 'Ask');
      await palette(page);
      check(label + ' historical highlight is not chosen before reader selects it', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Select text'));
      await tap(page, '#highlightToolbar [data-marker-action="define"]');
      check(label + ' missing target guides without opening lookup', (await page.locator('#readerToast').textContent()).includes('Select text') && !await page.locator('#lookupCard').isVisible() && outbound.length === 0);
      await tap(page, '#textDocument mark[data-hl-id]');
      for (const surface of ['header', ...(touch ? ['dock'] : []), 'zen']) {
        await palette(page, surface);
        const description = await page.locator('#highlightToolbar [data-marker-action-context]').textContent();
        check(label + ' ' + surface + ' previews explicitly selected passage', description === '“beta gamma”', description);
        check(label + ' ' + surface + ' Define has a 44px target', await page.locator('#highlightToolbar [data-marker-action="define"]').evaluate(button => button.getBoundingClientRect().height >= 44 && button.getBoundingClientRect().width >= 44));
        await page.locator('#highlightToolbar [data-marker-action="define"]').click();
        await page.waitForFunction(() => document.getElementById('lookupTitle').textContent === 'Beta gamma definition');
        check(label + ' ' + surface + ' Define reuses cached explicit passage', (await page.locator('#lookupSelection').textContent()) === '“beta gamma”' && outbound.length === 0);
        await tap(page, '#lookupClose');
        if (surface === 'zen') await page.locator('#zenExit').click();
      }
      const afterDefine = await chapter(page);
      check(label + ' cached Define sends nothing and saves no AI thread', outbound.length === 0 && afterDefine.aiThreads.length === 0 && afterDefine.questions.length === 0);
      check(label + ' saved highlight and note remain intact', afterDefine.textHighlights.length === 1 && afterDefine.textHighlights[0].note === 'A note that must not be sent automatically.');
      await selectAlpha(page); await palette(page);
      check(label + ' pending native selection takes precedence over last highlight', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()) === '“Alpha”');
      await page.locator('#highlightToolbar [data-marker-action="define"]').click();
      await page.waitForFunction(() => document.getElementById('lookupTitle').textContent === 'Alpha definition');
      check(label + ' Define does not silently create highlight', (await chapter(page)).textHighlights.length === 1);
      await tap(page, '#lookupClose');
      /* Real clicks collapse the previous native Alpha range before choosing and
         removing the saved highlight; element.click() omits that browser step. */
      await page.locator('#textDocument mark[data-hl-id]').click();
      await page.locator('#selectionRemoveHighlight').click();
      await page.waitForFunction(() => !document.querySelector('#textDocument mark[data-hl-id]'));
      await palette(page);
      await tap(page, '#highlightToolbar [data-marker-action="define"]');
      const deletedState = await page.evaluate(() => ({
        context: document.querySelector('#highlightToolbar [data-marker-action-context]').textContent,
        toast: document.getElementById('readerToast').textContent,
        lookupHidden: document.getElementById('lookupCard').classList.contains('hidden'),
        nativeSelection: getSelection().toString()
      }));
      check(label + ' deleted last highlight is never reused by Define', deletedState.context.includes('Select text')
        && deletedState.toast.includes('Select text') && deletedState.lookupHidden, deletedState);
      await tap(page, '#readerBack');
      await page.setInputFiles('#pdfFile', { name: 'marker-actions-pages.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
      await page.waitForSelector('.pdf-page[data-page="1"] .text-layer span');
      await page.waitForFunction(() => document.body.classList.contains('zen'));
      await page.locator('#zenExit').click();
      await page.waitForFunction(() => !document.body.classList.contains('zen'));
      await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span')?.textContent.trim());
      await page.evaluate(() => {
        const span = document.querySelector('.pdf-page[data-page="1"] .text-layer span'), range = document.createRange();
        range.selectNodeContents(span); getSelection().removeAllRanges(); getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
      });
      await page.waitForFunction(() => document.getElementById('highlightBtn').classList.contains('ready'));
      await tap(page, '#selectionHighlight'); await palette(page);
      check(label + ' newly committed PDF highlight is available immediately', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Boundary marker test'));
      await tap(page, '#nextPage'); await page.waitForFunction(() => document.getElementById('pageNumber').textContent.trim().startsWith('2'));
      await palette(page); await tap(page, '#highlightToolbar [data-marker-action="define"]');
      check(label + ' previous-page PDF highlight cannot leak into Define', (await page.locator('#highlightToolbar [data-marker-action-context]').textContent()).includes('Select text')
        && (await page.locator('#readerToast').textContent()).includes('Select text') && !await page.locator('#lookupCard').isVisible() && outbound.length === 0);
      check(label + ' no runtime errors', errors.length === 0, errors);
      await context.close();
    }
  } catch (error) { failures++; console.error(error.stack || error); }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(`${checks} checks, ${failures} failures (${browserName})`); process.exitCode = failures ? 1 : 0; }
})();
