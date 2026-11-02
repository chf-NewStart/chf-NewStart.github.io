/* Daily reading on a phone and an iPad (Houfu: "See what else u could do to better reading
   experience on phone and on iPad. Make urself a daily user, and a designer").
   1. A PDF whose print is too small on a phone offers Reader view once, above the bar.
   2. Each paper opens in the view it was last read in on this device.
   3. Reader view and the PDF share one place, and Reader view reading moves the library's
      "Page N of M".
   4. A figure in Reader view opens on its own: zoom, sharp from the PDF, caption, its page.
   5. Accents set as separate glyphs ("Le´o") read as letters in Reader view.
   Pinch and swipe in the figure viewer need two touches or a touch drag, so they run in
   Chromium only (Playwright's WebKit cannot send them). PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.PHLOEM_DAILY_READING_TEST_PORT || 8156);
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

/* 5 first, without a browser: the accent swap itself, lifted out of reading.js. */
{
  const src = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
  const map = src.slice(src.indexOf('  var SPACING_ACCENTS='), src.indexOf('\n', src.indexOf('  var SPACING_ACCENTS=')));
  const helpers = src.slice(src.indexOf('  var ACCENT_BASES='), src.indexOf('  function renderText(ch){'));
  const api = new Function(map + helpers + '\nreturn {readerAccents, readerAccentStyle};')();
  const swap = text => { const style = api.readerAccentStyle([text]); const out = api.readerAccents(text, style); assert.equal(out.length, text.length); return out.normalize('NFC'); };
  check('a trailing accent joins the letter before it', swap('Le´o Gerlin, Universite´ de Toulouse, Robaina-Este´vez') === 'Léo Gerlin, Université de Toulouse, Robaina-Estévez');
  check("TeX's leading accent joins the letter after it", swap('L´eo and St´ephane at Universit´e') === 'Léo and Stéphane at Université');
  check('an apostrophe, a 3´ end and a lone prime stay', swap("don´t, the plant´s 3´ UTR and 5´-AGCT-3´") === "don´t, the plant´s 3´ UTR and 5´-AGCT-3´");
  check('umlaut, tilde and caron too', swap('Mu¨ller, Espan˜a, Dvorˇa´k') === 'Müller, España, Dvořák');
}

const pdfEscape = value => String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
// Helvetica (WinAnsi) pages: [text, size, x, y] lines and optional filled boxes [x, y, w, h, r, g, b].
function makePdf(pages) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((page, i) => {
    const boxes = (page.boxes || []).map(b => b[4] + ' ' + b[5] + ' ' + b[6] + ' rg ' + b.slice(0, 4).join(' ') + ' re f').join('\n');
    const text = page.lines.map(line => 'BT /F1 ' + line[1] + ' Tf 1 0 0 1 ' + line[2] + ' ' + line[3] + ' Tm (' + pdfEscape(line[0]) + ') Tj ET').join('\n');
    const stream = (boxes ? boxes + '\n' : '') + text;
    objects[4 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
    objects[5 + i * 2] = '<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream';
  });
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) { offsets[id] = Buffer.byteLength(out, 'latin1'); out += id + ' 0 obj\n' + objects[id] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
const SENTENCES = ['Sucrose moves from the mesophyll into the sieve tubes of the minor veins.', 'Loading raises the pressure that drives the flow toward the sinks.',
  'Roots, fruits and young leaves draw on that stream as they grow.', 'Export rose with light until the loading capacity limited it.'];
// Two columns of 9 pt type, the way journals set a paper: far too small at a phone's width.
const column = (page, x, from, to, offset) => { const lines = []; for (let y = from; y >= to; y -= 13) lines.push([SENTENCES[(lines.length + offset + page) % 4].slice(0, 46), 9, x, y]); return lines; };
const paperPdf = () => makePdf([
  { lines: [['Phloem loading in tomato leaves', 18, 72, 730], ['Le´o Gerlin and Ste´phane Genin', 10, 72, 708]].concat(column(1, 72, 680, 80, 0), column(1, 320, 680, 80, 2)) },
  // Page 2: text, then a figure (two boxes) across the page with its caption under it, then more text.
  { lines: column(2, 72, 730, 560, 1).concat(column(2, 320, 730, 560, 3), [['Figure 1. Sieve tube loading measured in the minor veins of a tomato leaf.', 9, 72, 300]], column(2, 72, 270, 80, 0), column(2, 320, 270, 80, 2)),
    boxes: [[90, 330, 200, 190, 0.85, 0.2, 0.2], [330, 330, 200, 190, 0.2, 0.45, 0.8]] },
  { lines: column(3, 72, 730, 80, 2).concat(column(3, 320, 730, 80, 1)) },
]);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPHONE, serviceWorkers: 'block' };
const IPAD_CONTEXT = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPAD, serviceWorkers: 'block' };
const isReader = page => page.evaluate(() => !document.getElementById('textDocument').classList.contains('hidden'));
const offerShown = page => page.evaluate(() => !document.getElementById('readerOffer').classList.contains('hidden'));
// The page under Reader view's reading line, from the page markers above it.
const readerPage = page => page.evaluate(() => {
  const pane = document.getElementById('documentPane').getBoundingClientRect(), y = pane.top + Math.min(pane.height * .3, 180);
  let at = 0; document.querySelectorAll('#textDocument .page-marker [data-goto-page]').forEach(b => { if (b.parentNode.getBoundingClientRect().top <= y) at = +b.dataset.gotoPage; });
  return at;
});
const pdfPage = page => page.evaluate(() => {
  const pane = document.getElementById('documentPane').getBoundingClientRect(), y = pane.top + pane.height * .4;
  const hit = [...document.querySelectorAll('#pdfFrame .pdf-page')].find(p => { const r = p.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
  return hit ? +hit.dataset.page : 0;
});
const card = page => page.evaluate(() => { const c = [...document.querySelectorAll('[data-continue-paper]')].find(c => /tomato/i.test(c.textContent)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const errors = [];
  const fresh = async options => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { if (!localStorage.getItem('readingRoom.v1')) localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() })); });
    await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
    return { context, page };
  };
  const importPaper = async page => {
    await page.locator('#pdfFile').setInputFiles({ name: 'tomato-phloem.pdf', mimeType: 'application/pdf', buffer: paperPdf() });
    await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span'), null, { timeout: 60000 });
  };
  const toReader = async page => {
    await page.evaluate(() => document.getElementById('reflowBtn').click());
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .page-marker').length >= 3 && !document.getElementById('textDocument').classList.contains('hidden'), null, { timeout: 60000 });
    await page.waitForTimeout(400);
  };
  const toPdf = async page => {
    await page.evaluate(() => document.getElementById('reflowBtn').click());
    await page.waitForFunction(() => !document.getElementById('pdfFrame').classList.contains('hidden') && document.querySelector('#pdfFrame .pdf-page'), null, { timeout: 60000 });
    await page.waitForTimeout(900);
  };
  const reopen = async page => {
    await page.locator('#zenExit').tap();
    await page.waitForFunction(() => document.querySelector('[data-continue-paper]'));
    const text = await card(page);
    await page.evaluate(() => [...document.querySelectorAll('[data-continue-paper]')].find(c => /tomato/i.test(c.textContent)).click());
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.getElementById('pdfFrame').dataset.positionReady === 'true', null, { timeout: 60000 });
    await page.waitForTimeout(900);
    return text;
  };
  const scrollReaderToPage = async (page, n) => {
    await page.evaluate(n => { const pane = document.getElementById('documentPane'); const marker = document.querySelector('#textDocument .page-marker [data-goto-page="' + n + '"]').parentNode; pane.scrollTop += marker.getBoundingClientRect().top - pane.getBoundingClientRect().top - 40; }, n);
    await page.waitForTimeout(900); // the scroll saves after 600 ms
  };

  /* Phone: the offer, the remembered view, the shared place, the figure viewer. */
  {
    const { context, page } = await fresh(PHONE);
    await importPaper(page);
    await page.waitForFunction(() => !document.getElementById('readerOffer').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
    check('small print on a phone offers Reader view', await offerShown(page));
    const box = await page.locator('#readerOffer').boundingBox(), bar = await page.locator('#zenDock').boundingBox();
    check('the offer sits just above the bar', box && bar && box.y + box.height <= bar.y && bar.y - (box.y + box.height) < 40, JSON.stringify({ box, bar }));
    await page.locator('#readerOfferGo').tap();
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .page-marker').length >= 3, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    check('its button opens Reader view and the chip goes', await isReader(page) && !await offerShown(page));

    const text = await page.evaluate(() => document.getElementById('textDocument').textContent.normalize('NFC'));
    check('split accents read as letters in Reader view', text.includes('Léo Gerlin') && text.includes('Stéphane'), text.slice(0, 160));

    await scrollReaderToPage(page, 3);
    check('reading page 3 in Reader view', await readerPage(page) === 3);
    const cardText = await reopen(page);
    check('the library counts Reader view reading', /Page 3 of 3/.test(cardText), cardText);
    check('the paper reopens in Reader view', await isReader(page));
    check('…at the same page', await readerPage(page) === 3);

    await toPdf(page);
    check('the PDF opens on the page read in Reader view', await pdfPage(page) === 3, String(await pdfPage(page)));
    await page.evaluate(() => { document.getElementById('documentPane').scrollTop = 0; });
    await page.waitForTimeout(900);
    check('back at page 1 of the PDF', await pdfPage(page) === 1);
    await toReader(page);
    check('Reader view follows the PDF to page 1', await readerPage(page) === 1, String(await readerPage(page)));
    await toPdf(page);
    await reopen(page);
    check('left on the PDF, it reopens on the PDF', !await isReader(page));
    await page.waitForTimeout(2600);
    check('the offer is not made twice for one paper', !await offerShown(page));

    /* Figure viewer. */
    await toReader(page);
    await page.evaluate(() => { const f = document.querySelector('.reader-fig-open'); const pane = document.getElementById('documentPane'); pane.scrollTop += f.getBoundingClientRect().top - pane.getBoundingClientRect().top - 120; });
    await page.waitForTimeout(400);
    check('the figure is a button in Reader view', await page.locator('.reader-fig-open img').count() === 1);
    await page.locator('.reader-fig-open').tap();
    await page.waitForFunction(() => document.getElementById('figureViewer').open);
    await page.waitForFunction(() => document.getElementById('figureViewerSharp').width > 0, null, { timeout: 8000 }).catch(() => {});
    const viewer = await page.evaluate(() => ({ title: document.getElementById('figureViewerTitle').textContent, caption: document.getElementById('figureViewerCaption').textContent, sharp: document.getElementById('figureViewerSharp').width, hint: !document.getElementById('figureViewerHint').classList.contains('hidden'), state: history.state && history.state.phloem, frame: document.getElementById('figureViewerFrame').getBoundingClientRect().width }));
    check('a tap opens the figure on its own', viewer.title === 'Figure 1' && /^Figure 1\. Sieve tube/.test(viewer.caption), JSON.stringify(viewer));
    check('the figure is drawn again from the PDF at screen sharpness', viewer.sharp >= viewer.frame * 1.9, JSON.stringify(viewer));
    check('the first time, it says how to zoom', viewer.hint);
    check('Back has a figure layer to close', viewer.state === 'figure');
    const stage = await page.locator('#figureViewerStage').boundingBox();
    await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.waitForTimeout(500);
    const zoomed = await page.evaluate(() => ({ transform: document.getElementById('figureViewerFrame').style.transform, hint: !document.getElementById('figureViewerHint').classList.contains('hidden') }));
    check('a double-tap zooms in', /scale\(2\.5\)/.test(zoomed.transform) && !zoomed.hint, JSON.stringify(zoomed));
    await page.waitForFunction(() => document.getElementById('figureViewerSharp').width > 0 && document.getElementById('figureViewerSharp').width >= document.getElementById('figureViewerFrame').getBoundingClientRect().width * 1.4, null, { timeout: 8000 }).catch(() => {});
    check('zoomed in, it is drawn again sharper', await page.evaluate(() => document.getElementById('figureViewerSharp').width) > viewer.sharp);
    await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.waitForTimeout(400);
    check('another double-tap fits it again', /scale\(1\)/.test(await page.evaluate(() => document.getElementById('figureViewerFrame').style.transform)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    check('Escape closes it and drops its layer', await page.evaluate(() => !document.getElementById('figureViewer').open && (!history.state || history.state.phloem !== 'figure')) && await isReader(page));
    await page.locator('.reader-fig-open').tap();
    await page.waitForFunction(() => document.getElementById('figureViewer').open);
    check('the zoom tip is not repeated', await page.evaluate(() => document.getElementById('figureViewerHint').classList.contains('hidden')));
    await page.goBack();
    await page.waitForTimeout(500);
    check('Back closes the figure and stays in the paper', await page.evaluate(() => !document.getElementById('figureViewer').open && !document.getElementById('readerPage').classList.contains('hidden')));
    await page.locator('.reader-fig-open').tap();
    await page.waitForFunction(() => document.getElementById('figureViewer').open);
    await page.locator('#figureViewerPage').tap();
    await page.waitForFunction(() => !document.getElementById('pdfFrame').classList.contains('hidden'), null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    check('View on page shows the figure on its PDF page', !await page.evaluate(() => document.getElementById('figureViewer').open) && await pdfPage(page) === 2, String(await pdfPage(page)));

    if (ENGINE === 'chromium') {
      await toReader(page);
      await page.locator('.reader-fig-open').tap();
      await page.waitForFunction(() => document.getElementById('figureViewer').open);
      await page.waitForTimeout(300);
      const session = await context.newCDPSession(page);
      const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: .5 })) });
      const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
      await touch('touchStart', [[1, cx - 40, cy], [2, cx + 40, cy]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[1, cx - 40 - i * 10, cy], [2, cx + 40 + i * 10, cy]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
      const pinched = await page.evaluate(() => +(document.getElementById('figureViewerFrame').style.transform.match(/scale\(([\d.]+)\)/) || [0, 0])[1]);
      check('pinching apart zooms the figure', pinched > 2.7 && pinched < 3.3, String(pinched));
      await page.keyboard.press('0');
      await page.waitForTimeout(200);
      check('0 fits the figure again', /scale\(1\)/.test(await page.evaluate(() => document.getElementById('figureViewerFrame').style.transform)), await page.evaluate(() => document.getElementById('figureViewerFrame').style.transform + ' focus=' + (document.activeElement && document.activeElement.id)));
      await touch('touchStart', [[3, cx, cy - 100]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[3, cx, cy - 100 + i * 18]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(500);
      check('a swipe down closes the figure', await page.evaluate(() => !document.getElementById('figureViewer').open) && await isReader(page));
    }
    await context.close();
  }

  /* Something open over the paper keeps the offer away until it closes: a long-press selection right
     after opening must not get a chip on top of its card. */
  {
    const { context, page } = await fresh(PHONE);
    await importPaper(page);
    await page.evaluate(() => {
      const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].find(s => s.textContent.length > 20 && s.getBoundingClientRect().top > 200);
      const range = document.createRange(); range.setStart(span.firstChild, 0); range.setEnd(span.firstChild, 12);
      getSelection().removeAllRanges(); getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3600);
    check('the offer never covers an open card', await page.evaluate(() => !document.getElementById('selectionCard').classList.contains('hidden')) && !await offerShown(page));
    await page.evaluate(() => { getSelection().removeAllRanges(); document.getElementById('selectionClose').click(); });
    await page.waitForFunction(() => !document.getElementById('readerOffer').classList.contains('hidden'), null, { timeout: 9000 }).catch(() => {});
    check('…and makes it once the card has closed', await offerShown(page));
    await context.close();
  }

  /* iPad: no offer (the print is large), the view is still remembered per paper. */
  {
    const { context, page } = await fresh(IPAD_CONTEXT);
    await importPaper(page);
    await page.waitForTimeout(3200);
    check('an iPad is not offered Reader view', !await offerShown(page) && !await page.evaluate(() => document.body.classList.contains('phone-ui')));
    await toReader(page);
    await reopen(page);
    check('an iPad also reopens a paper in Reader view', await isReader(page));
    await context.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All daily reading checks passed (' + ENGINE + ')');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
