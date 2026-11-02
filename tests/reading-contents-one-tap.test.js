/* Contents one tap away (Houfu: "this paper button what it's doing. User might think it's paper
   info. Contents hiding too deep"). A paper with contents shows a Contents button in the Zen
   dock (T on a keyboard; first under More on a phone) that opens the list straight away; a paper
   without contents shows none. More's "This paper" is now "Pages & zoom", which is what it holds.
   The dock still fits on screen with the extra button. PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.PHLOEM_CONTENTS_TEST_PORT || 8153);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
}

const pdfEscape = value => String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
// Helvetica pages from [text, size, x, y] lines; printed page 1 is PDF page 5 when contents are given.
function makePdf(pages) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, i) => {
    const stream = lines.map(line => 'BT /F1 ' + line[1] + ' Tf 1 0 0 1 ' + line[2] + ' ' + line[3] + ' Tm (' + pdfEscape(line[0]) + ') Tj ET').join('\n');
    objects[4 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
    objects[5 + i * 2] = '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream';
  });
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) { offsets[id] = Buffer.byteLength(out, 'binary'); out += id + ' 0 obj\n' + objects[id] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'binary');
  out += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'binary');
}
const withContents = () => makePdf([
  [['A small textbook', 24, 72, 700]],
  [['Copyright', 14, 72, 700]],
  [['Contents', 24, 72, 730], ['1 Introduction 1', 14, 90, 650], ['1.1 Foundations 2', 14, 110, 620], ['2 Methods 4', 14, 90, 590]],
  [['Preface', 22, 72, 700], ['iv', 11, 300, 40]],
  [['1 Introduction', 24, 72, 700], ['The opening chapter.', 12, 72, 650], ['1', 11, 300, 40]],
  [['1.1 Foundations', 20, 72, 700], ['Core ideas.', 12, 72, 650], ['2', 11, 300, 40]],
  [['Examples', 20, 72, 700], ['3', 11, 300, 40]],
  [['2 Methods', 24, 72, 700], ['Experiments begin here.', 12, 72, 650], ['4', 11, 300, 40]],
  [['Appendix', 20, 72, 700], ['5', 11, 300, 40]]
]);
const withoutContents = () => makePdf([
  [['Leaf phloem loading', 22, 72, 700], ['Sucrose moves from mesophyll to sieve tubes.', 12, 72, 650]],
  [['Results', 20, 72, 700], ['Export rose with light.', 12, 72, 650]]
]);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const shown = (page, sel) => page.locator(sel).evaluate(node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
async function openPdf(page, name, buffer, expectContents) {
  await page.locator('#pdfFile').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span'), null, { timeout: 60000 });
  if (expectContents) await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden'), null, { timeout: 30000 }).catch(() => {});
  else await page.waitForTimeout(1200);
}
const pageLabel = page => page.evaluate(() => document.getElementById('pageNumber').textContent.trim());

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const errors = [];
  const fresh = async options => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { if (!localStorage.getItem('readingRoom.v1')) localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} })); });
    await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
    return { context, page };
  };

  /* Laptop: the dock button, the T key, and the renamed Pages & zoom. */
  {
    const { context, page } = await fresh({ viewport: { width: 1280, height: 800 } });
    await openPdf(page, 'printed-contents.pdf', withContents(), true);
    check('a paper with contents shows Contents in the dock', await shown(page, '#zenContents'));
    check('the dock button is labelled Contents with its key', await page.locator('#zenContents').getAttribute('title') === 'Contents (T)'
      && (await page.locator('#zenContents .zen-contents-caption').textContent()) === 'Contents');
    const order = await page.evaluate(() => Array.from(document.getElementById('zenDock').children).map(node => node.id));
    check('Contents sits right after the page layout', order.indexOf('zenContents') === order.indexOf('zenLayoutTool') + 1, order.join(','));
    await page.locator('#zenContents').click();
    await page.locator('#tocDialog').waitFor({ state: 'visible' });
    const entries = await page.locator('#tocList .toc-item').allTextContents();
    check('one click opens the list of contents', entries.join('|') === '1 Introduction|1.1 Foundations|2 Methods', entries.join('|'));
    check('no other dialog opens on the way', !await page.locator('#readerControlsDialog').evaluate(node => node.open));
    await page.getByRole('button', { name: '2 Methods', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('8 / 9'), null, { timeout: 10000 }).catch(() => {});
    check('an entry still goes to its page', (await pageLabel(page)).startsWith('8 / 9'), await pageLabel(page));
    check('the list closes after the jump', !await page.locator('#tocDialog').evaluate(node => node.open));

    await page.locator('#documentPane').focus().catch(() => {});
    await page.keyboard.press('t');
    await page.waitForFunction(() => document.getElementById('tocDialog').open, null, { timeout: 3000 }).catch(() => {});
    check('T opens Contents', await page.locator('#tocDialog').evaluate(node => node.open));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 3000 }).catch(() => {});
    check('Escape closes Contents and stays in the paper', !await page.locator('#tocDialog').evaluate(node => node.open)
      && !await page.locator('#readerPage').evaluate(node => node.classList.contains('hidden')));

    await page.locator('#zenMore').click();
    const pages = page.locator('#zenReadingControls');
    check('More names the page controls "Pages & zoom"', await pages.getAttribute('data-label') === 'Pages & zoom', await pages.getAttribute('data-label'));
    check('More no longer says "This paper"', !await page.locator('#zenMoreMenu [data-label="This paper"]').count());
    check('the phone-only Contents item stays out of the laptop menu', !await shown(page, '#zenPhoneContents'));
    await pages.click();
    await page.locator('#readerControlsDialog').waitFor({ state: 'visible' });
    check('its dialog is headed Pages & zoom', (await page.locator('#readerControlsHeading').textContent()) === 'Pages & zoom');
    check('Contents is still there too', await shown(page, '#readerControlsDialog #tocBtn'));
    await page.locator('[data-close="readerControlsDialog"]').click();
    await page.locator('#readerControlsDialog').waitFor({ state: 'hidden' });

    // The dock keeps every button on screen with Contents added.
    for (const [width, height] of [[1280, 800], [1024, 768], [768, 1024], [1180, 820], [1280, 600], [1280, 520], [1280, 460], [1024, 390]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const off = await page.evaluate(() => Array.from(document.getElementById('zenDock').children)
        .filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none')
        .filter(node => { const r = node.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight + .5 || r.left < 0 || r.right > innerWidth + .5; })
        .map(node => node.id));
      check('at ' + width + '×' + height + ' every dock button stays on screen', !off.length, off.join(','));
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    // A paper without contents: no button, and T does nothing.
    await page.locator('#zenExit').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    await openPdf(page, 'no-contents.pdf', withoutContents(), false);
    check('a paper without contents shows no Contents button', !await shown(page, '#zenContents'));
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    check('T does nothing without contents', !await page.locator('#tocDialog').evaluate(node => node.open));
    await context.close();
  }

  /* Phone: the bar stays Library · Look up · Listen · Find · More; Contents leads More. */
  {
    const { context, page } = await fresh({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPHONE });
    await openPdf(page, 'printed-contents.pdf', withContents(), true);
    check('the phone bar has no Contents button of its own', !await shown(page, '#zenContents'));
    await page.locator('#zenMore').tap();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    const firstId = await page.evaluate(() => (Array.from(document.getElementById('zenMoreMenu').children).find(node => node.getClientRects().length) || {}).id);
    check('Contents is the first item under More', firstId === 'zenPhoneContents', firstId);
    await page.locator('#zenPhoneContents').tap();
    await page.locator('#tocDialog').waitFor({ state: 'visible' });
    check('one tap from More opens the list', (await page.locator('#tocList .toc-item').count()) === 3);
    check('More closes behind it', await page.locator('#zenMoreMenu').evaluate(node => node.classList.contains('hidden')));
    await page.locator('[data-close="tocDialog"]').tap();
    await page.locator('#tocDialog').waitFor({ state: 'hidden' });

    await page.locator('#zenExit').tap();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    await openPdf(page, 'no-contents.pdf', withoutContents(), false);
    await page.locator('#zenMore').tap();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    check('without contents, More has no Contents item', !await shown(page, '#zenPhoneContents'));
    check('and Pages & zoom is still there', await shown(page, '#zenReadingControls'));
    await context.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All contents checks passed (' + ENGINE + ')');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
