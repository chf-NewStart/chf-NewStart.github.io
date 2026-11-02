/* Text size on a phone (Houfu: "make the text size changeable is that doable for the phone?").
   More → Text size opens a sheet above the bar: small A, the size, big A. Text and Reader
   view change the type itself (shared with Reading settings, kept after a reload) and the
   paragraph being read stays where it was; a PDF page zooms instead, and the sheet offers
   Reader view, which rewraps the paper to the screen. Two fingers on text resize it too, on a
   phone only (an iPad palm beside a finger must not), checked in Chromium only: Playwright's
   WebKit cannot send two touches. PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.PHLOEM_TEXT_SIZE_TEST_PORT || 8154);
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
// Helvetica pages from [text, size, x, y] lines.
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
const SENTENCES = ['Sucrose moves from the mesophyll into the sieve tubes of the minor veins.', 'Loading raises the pressure that drives the flow toward the sinks.',
  'Roots, fruits and young leaves draw on that stream as they grow.', 'Export rose with light until the loading capacity limited it.'];
const paperPdf = () => makePdf([1, 2, 3].map(page => {
  const lines = [['Phloem transport, part ' + page, 18, 72, 730]];
  for (let row = 0; row < 26; row++) lines.push([SENTENCES[(row + page) % SENTENCES.length], 11, 72, 690 - row * 24]);
  return lines;
}));
const PARAS = Array.from({ length: 36 }, (_, i) => 'Paragraph ' + (i + 1) + '. ' + SENTENCES.join(' ') + ' ' + SENTENCES.slice(0, 2).join(' '));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPHONE, serviceWorkers: 'block' };
const shown = (page, sel) => page.locator(sel).evaluate(node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
const sheetOpen = page => page.locator('#zenTextMenu').evaluate(node => !node.classList.contains('hidden'));
const value = page => page.evaluate(() => document.getElementById('zenTextValue').textContent.trim());
const typeSize = page => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#textDocument .para .original')).fontSize));
// The paragraph crossing the reading line (180px down the pane), and where that line falls in it.
// Two fingers spreading (or closing) from one distance to another around (cx, cy), via Chromium's CDP.
async function pincher(context, page, cx, cy) {
  const session = await context.newCDPSession(page);
  const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: .5 })) });
  return async (from, to) => {
    const steps = 8;
    await touch('touchStart', [[1, cx, cy - from / 2], [2, cx, cy + from / 2]]);
    for (let i = 1; i <= steps; i++) { const d = from + (to - from) * i / steps; await touch('touchMove', [[1, cx, cy - d / 2], [2, cx, cy + d / 2]]); await page.waitForTimeout(20); }
    await touch('touchEnd', []);
    await page.waitForTimeout(150);
  };
}
const readingSpot = page => page.evaluate(() => {
  const pane = document.getElementById('documentPane').getBoundingClientRect(), y = pane.top + 180;
  const para = [...document.querySelectorAll('#textDocument .para')].find(node => node.getBoundingClientRect().bottom > y);
  const box = para.getBoundingClientRect();
  return { text: para.textContent.trim().slice(0, 14), frac: (y - box.top) / box.height };
});

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const errors = [];
  const fresh = async (options, seedText) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(paras => {
      if (localStorage.getItem('readingRoom.v1')) return;
      const stamp = Date.now();
      const chapters = paras ? [{ id: 'long-article', kind: 'text', title: 'A long article', fr: paras.join('\n\n'), notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }] : [];
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters, deleted: {}, merged: {}, savedAt: stamp }));
      if (paras) localStorage.setItem('readingRoom.lastOpen.v1', 'long-article');
    }, seedText ? PARAS : null);
    await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
    if (seedText) await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length === 36 && !document.getElementById('readerPage').classList.contains('hidden'));
    return { context, page };
  };
  const openSheet = async page => {
    await page.locator('#zenMore').tap();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    await page.locator('#zenPhoneText').tap();
    await page.locator('#zenTextMenu').waitFor({ state: 'visible' });
  };

  /* Phone, a text article: the sheet, the size, the reading spot, the limits, a reload. */
  {
    const { context, page } = await fresh(PHONE, true);
    await page.locator('#zenMore').tap();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    const items = await page.evaluate(() => Array.from(document.getElementById('zenMoreMenu').children).filter(node => node.getClientRects().length).map(node => node.dataset.label));
    check('More offers Text size first when there are no contents', items[0] === 'Text size', items.slice(0, 3).join(' | '));
    await page.locator('#zenPhoneText').tap();
    await page.locator('#zenTextMenu').waitFor({ state: 'visible' });
    check('Text size opens its sheet and More folds away', await sheetOpen(page) && await page.locator('#zenMoreMenu').evaluate(node => node.classList.contains('hidden')));
    const geometry = await page.evaluate(() => ({ sheet: document.getElementById('zenTextMenu').getBoundingClientRect().toJSON(), bar: document.getElementById('zenDock').getBoundingClientRect().top, height: innerHeight }));
    check('the sheet sits above the bar', geometry.sheet.bottom <= geometry.bar + .5, JSON.stringify(geometry));
    check('and leaves most of the text in view', geometry.sheet.top > geometry.height * .55, Math.round(geometry.sheet.top));
    check('it starts at 100%', await value(page) === '100%', await value(page));
    check('it suggests a pinch for text', /pinch/i.test(await page.locator('#zenTextNote').textContent()));
    check('a text article has no PDF switch', !await shown(page, '#zenTextMode'));

    const base = await typeSize(page);
    await page.locator('#zenTextBigger').tap();
    check('big A makes the words 10% bigger', await value(page) === '110%' && Math.abs(await typeSize(page) - base * 1.1) < .6, (await value(page)) + ' ' + base + '→' + (await typeSize(page)));
    check('Reading settings shows the same size', (await page.locator('#textSizeValue').textContent()) === '110%');
    await page.locator('#zenTextValue').tap();
    check('tapping the size puts it back to 100%', await value(page) === '100%' && Math.abs(await typeSize(page) - base) < .3);

    await page.evaluate(() => { document.getElementById('documentPane').scrollTop = 3000; });
    await page.waitForTimeout(300);
    const before = await readingSpot(page);
    for (let i = 0; i < 3; i++) await page.locator('#zenTextBigger').tap();
    await page.waitForTimeout(200);
    const after = await readingSpot(page);
    check('three taps reach 130%', await value(page) === '130%', await value(page));
    check('the paragraph being read stays on the reading line', after.text === before.text && Math.abs(after.frac - before.frac) < .08, JSON.stringify({ before, after }));
    for (let i = 0; i < 12; i++) if (!await page.locator('#zenTextBigger').isDisabled()) await page.locator('#zenTextBigger').tap();
    check('it stops at 190% and big A turns off', await value(page) === '190%' && await page.locator('#zenTextBigger').isDisabled());
    for (let i = 0; i < 14; i++) if (!await page.locator('#zenTextSmaller').isDisabled()) await page.locator('#zenTextSmaller').tap();
    check('it stops at 70% and small A turns off', await value(page) === '70%' && await page.locator('#zenTextSmaller').isDisabled());
    for (let i = 0; i < 5; i++) await page.locator('#zenTextBigger').tap();
    check('back up to 120%', await value(page) === '120%', await value(page));

    await page.locator('#zenMore').tap();
    await page.waitForTimeout(250);
    check('More while the sheet is open just closes the sheet', !await sheetOpen(page) && await page.locator('#zenMoreMenu').evaluate(node => node.classList.contains('hidden')));
    await openSheet(page);
    await page.locator('#zenTextClose').tap();
    check('× closes it', !await sheetOpen(page));

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length === 36 && !document.getElementById('readerPage').classList.contains('hidden'));
    check('the size is kept after a reload', Math.abs(await typeSize(page) - base * 1.2) < .6, base + ' → ' + (await typeSize(page)));
    await openSheet(page);
    check('and the sheet says 120%', await value(page) === '120%', await value(page));
    await page.locator('#zenTextValue').tap();

    if (ENGINE === 'chromium') {
      await page.locator('#zenTextClose').tap();
      const pinch = await pincher(context, page, 195, 420);
      await pinch(120, 170);
      const spread = await page.evaluate(() => document.getElementById('textSizeValue').textContent);
      check('spreading two fingers on text makes it bigger', spread === '140%', spread);
      check('a short note says the new size', /Text size 140%/.test(await page.locator('#readerToast').textContent()));
      await pinch(180, 90);
      const pinched = await page.evaluate(() => document.getElementById('textSizeValue').textContent);
      check('pinching them together makes it smaller', pinched === '70%', pinched);
      await pinch(100, 100);
      check('two fingers that do not spread leave the size alone', (await page.evaluate(() => document.getElementById('textSizeValue').textContent)) === '70%');
    }
    await context.close();
  }

  /* Phone, a PDF: the page zooms; Reader view rewraps it and then the type itself grows. */
  {
    const { context, page } = await fresh(PHONE, false);
    await page.locator('#pdfFile').setInputFiles({ name: 'phloem-transport.pdf', mimeType: 'application/pdf', buffer: paperPdf() });
    await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span'), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await openSheet(page);
    check('on a PDF the sheet shows the page zoom', await value(page) === 'Fit' && await page.locator('#zenTextMenu').getAttribute('data-mode') === 'pdf', await value(page));
    check('small A is off at Fit: smaller than the screen helps no one', await page.locator('#zenTextSmaller').isDisabled());
    check('it explains why and offers Reader view', /rewraps/.test(await page.locator('#zenTextNote').textContent()) && /Reader view/.test(await page.locator('#zenTextMode').textContent()));
    const width = () => page.evaluate(() => document.querySelector('.pdf-page[data-page="1"]').getBoundingClientRect().width);
    const fitWidth = await width();
    await page.locator('#zenTextBigger').tap();
    await page.waitForFunction(() => document.getElementById('zenTextValue').textContent === '120%', null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    check('big A zooms the page', await value(page) === '120%' && await width() > fitWidth * 1.15, (await value(page)) + ' ' + Math.round(fitWidth) + '→' + Math.round(await width()));
    await page.locator('#zenTextValue').tap();
    await page.waitForFunction(() => document.getElementById('zenTextValue').textContent === 'Fit', null, { timeout: 5000 }).catch(() => {});
    check('tapping the zoom fits the page again', await value(page) === 'Fit', await value(page));

    await page.locator('#zenTextMode').tap();
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length > 3 && document.getElementById('zenTextMenu').dataset.mode === 'text', null, { timeout: 60000 }).catch(() => {});
    check('Reader view rewraps the paper with the sheet still open', await sheetOpen(page) && await shown(page, '#textDocument') && await page.locator('#zenTextMenu').getAttribute('data-mode') === 'text');
    check('the sheet now shows the type size', await value(page) === '100%', await value(page));
    const base = await typeSize(page);
    await page.locator('#zenTextBigger').tap();
    check('and big A makes the rewrapped words bigger', await value(page) === '110%' && await typeSize(page) > base * 1.05, base + '→' + (await typeSize(page)));
    check('the switch back says PDF pages', /PDF pages/.test(await page.locator('#zenTextMode').textContent()));
    await page.locator('#zenTextMode').tap();
    await page.waitForFunction(() => document.getElementById('zenTextMenu').dataset.mode === 'pdf', null, { timeout: 30000 }).catch(() => {});
    check('PDF pages goes back to the page zoom', await shown(page, '#pdfFrame') && await value(page) === 'Fit', await value(page));
    await context.close();
  }

  /* Laptop: the sheet is for phones; Reading settings' A+ keeps the reading spot too. */
  {
    const { context, page } = await fresh({ viewport: { width: 1280, height: 800 } }, true);
    await page.locator('#zenMore').click();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    check('the laptop menu has no Text size item', !await shown(page, '#zenPhoneText'));
    await page.locator('#zenSettings').click();
    await page.locator('#comfortBar').waitFor({ state: 'visible' });
    await page.evaluate(() => { document.getElementById('documentPane').scrollTop = 2400; });
    await page.waitForTimeout(300);
    const before = await readingSpot(page);
    await page.locator('#textBigger').click();
    await page.locator('#textBigger').click();
    const after = await readingSpot(page);
    check('Reading settings A+ keeps the paragraph being read', after.text === before.text && Math.abs(after.frac - before.frac) < .08, JSON.stringify({ before, after }));
    await context.close();
  }

  /* iPad: no Text size sheet, and a pinch on text leaves the size alone. */
  if (ENGINE === 'chromium') {
    const { context, page } = await fresh({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, userAgent: IPAD, serviceWorkers: 'block' }, true);
    check('an iPad keeps its own layout', !await page.evaluate(() => document.body.classList.contains('phone-ui')));
    const pinch = await pincher(context, page, 500, 420);
    await pinch(120, 220);
    check('a pinch on an iPad does not resize the text', (await page.evaluate(() => document.getElementById('textSizeValue').textContent)) === '100%');
    await context.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All text size checks passed (' + ENGINE + ')');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
