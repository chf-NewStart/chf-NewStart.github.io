/* Citations that are plain text (no link annotation, as in many preprints): a finger or
   pen long-press that selects "[5]" or an author-year citation shows the reference card
   from the paper's own reference list instead of the highlight prompt (Android tester
   feedback, Oct 2026). A mouse selection of the same words still offers to highlight.
   Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-X916B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function paperPdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([612, 792]), refs = doc.addPage([612, 792]);
  first.drawText('Sinks pull sugar from leaves [5] in tomato.', { x: 72, y: 700, size: 16, font });
  first.drawText('As Smith et al. (2020) showed for roots.', { x: 72, y: 660, size: 16, font });
  first.drawText('Roots matter too (Brown, 2019; Smith et al., 2020).', { x: 72, y: 620, size: 16, font });
  refs.drawText('References', { x: 72, y: 720, size: 16, font });
  refs.drawText('[4] Fourth entry about leaves.', { x: 72, y: 690, size: 12, font });
  refs.drawText('[5] Fifth entry about sucrose sinks.', { x: 72, y: 670, size: 12, font });
  refs.drawText('Brown, A. 2019. Roots and shoots.', { x: 72, y: 640, size: 12, font });
  refs.drawText('Smith, J., Jones, K. 2020. Sources and sinks in tomato.', { x: 72, y: 620, size: 12, font });
  return Buffer.from(await doc.save());
}
async function openPaper(browser, options) {
  const page = await browser.newPage(options), errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} })); localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false })); });
  await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`, { waitUntil: 'load' });
  await page.locator('#pdfFile').setInputFiles({ name: 'unlinked.pdf', mimeType: 'application/pdf', buffer: await paperPdf() });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span').length >= 3);
  assert.equal(await page.locator('.pdf-page[data-page="1"] .pdf-link').count(), 0, 'the fixture has no link annotations');
  await page.waitForTimeout(500);
  return { page, errors };
}
/* A long-press: the pointer goes down on the word, the browser selects it, then takes the
   pointer away (pointercancel), as Android does for its own long-press. */
async function longPressSelect(page, pointerType, lineStart, word) {
  return page.evaluate(([pointerType, lineStart, word]) => {
    const span = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).find(node => node.textContent.startsWith(lineStart));
    const node = span.firstChild, at = node.textContent.indexOf(word), box = span.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, isPrimary: true, pointerId: 7, pointerType, clientX: box.left + 10, clientY: box.top + box.height / 2 };
    span.dispatchEvent(new PointerEvent('pointerdown', init));
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + word.length);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new PointerEvent(pointerType === 'mouse' ? 'pointerup' : 'pointercancel', init));
    return selection.toString();
  }, [pointerType, lineStart, word]);
}
async function card(page) {
  await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden')
    && !/Finding/.test(document.getElementById('pdfReferencePreviewText').textContent), null, { timeout: 5000 });
  return page.evaluate(() => ({ label: document.getElementById('pdfReferencePreviewLabel').textContent, text: document.getElementById('pdfReferencePreviewText').textContent,
    prompt: !document.getElementById('selectionCard').classList.contains('hidden'), selected: window.getSelection().toString() }));
}
async function closeCard(page) { await page.evaluate(() => document.getElementById('pdfReferenceClose').click()); }

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const ENGINE = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[ENGINE].launch();
  try {
    const tablet = { viewport: { width: 1180, height: 820 }, userAgent: ANDROID, hasTouch: true };
    const { page, errors } = await openPaper(browser, tablet);

    await longPressSelect(page, 'touch', 'Sinks pull', '5');
    let shown = await card(page);
    assert.match(shown.text, /^\[5\] Fifth entry about sucrose sinks/, 'a numbered citation shows its entry: ' + shown.text);
    assert.match(shown.label, /^Reference · p\. 2/);
    assert.equal(shown.prompt, false, 'no highlight prompt for the citation');
    assert.equal(shown.selected, '', 'the word selection is cleared');
    await page.evaluate(() => document.getElementById('pdfReferenceOpen').click());
    await page.waitForFunction(() => document.querySelector('.pdf-destination-flash'), null, { timeout: 5000 });
    console.log('PASS  [5] long-press shows the fifth reference and Go to reference jumps there');

    await page.evaluate(() => document.querySelector('.pdf-page[data-page="1"]').scrollIntoView());
    await page.waitForTimeout(300);
    await longPressSelect(page, 'pen', 'As Smith', 'Smith');
    shown = await card(page);
    assert.match(shown.text, /^Smith, J\., Jones, K\. 2020\. Sources and sinks/, 'a narrative author-year citation finds its entry: ' + shown.text);
    await closeCard(page);
    console.log('PASS  Smith et al. (2020) with a pen finds Smith 2020');

    await longPressSelect(page, 'touch', 'Roots matter', 'Brown');
    shown = await card(page);
    assert.match(shown.text, /^Brown, A\. 2019\. Roots and shoots/, 'the citation under the finger is chosen in a group: ' + shown.text);
    await closeCard(page);
    console.log('PASS  (Brown, 2019; Smith et al., 2020) picks Brown 2019 under the finger');

    await longPressSelect(page, 'touch', 'Sinks pull', 'sugar');
    await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => document.getElementById('pdfReferencePreview').classList.contains('hidden')), true, 'an ordinary word still offers to highlight');
    await page.evaluate(() => { window.getSelection().removeAllRanges(); document.querySelector('#selectionCard [data-close], #selectionClose')?.click(); });
    console.log('PASS  an ordinary word keeps the highlight prompt');

    await longPressSelect(page, 'mouse', 'Sinks pull', '5');
    await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => document.getElementById('pdfReferencePreview').classList.contains('hidden')), true, 'a mouse selection of a citation can still be highlighted');
    console.log('PASS  a mouse selection of [5] keeps the highlight prompt');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
