/* Spotlight guide: a round lens that enlarges the paper under it 1.1x while the rest of
   the pane blurs and dims. Checks the geometry (the lens shows the paper under its centre,
   enlarged), PDF and text papers, the Zen and Settings mode buttons staying in step,
   persistence, the copy stepping aside while annotating, and a clean switch back to Rows.
   PHLOEM_BROWSER=chromium|webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const SHOTS = process.env.PHLOEM_SHOTS || '';
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html' : filename.endsWith('.js') ? 'text/javascript'
      : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function generatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const words = 'Phloem carries sugar from sources to sinks while the reader carries meaning from the page to memory'.split(' ');
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 300, y: 380, width: 12, height: 12, color: rgb(.85, .1, .1) });
    for (let line = 0; line < 34; line++) {
      const text = Array.from({ length: 11 }, (_, i) => words[(line * 3 + i + p) % words.length]).join(' ');
      page.drawText(text, { x: 56, y: 730 - line * 19, size: 12, font });
    }
  }
  return Buffer.from(await doc.save());
}
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch({ headless: true });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false, guideOrientation: 'row', guideDim: 85 })); } });
  await page.goto('http://127.0.0.1:' + port + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.locator('#pdfFile').setInputFiles({ name: 'spotlight.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
  await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
  await page.waitForTimeout(600);

  // 1. Zen guide menu offers the three shapes; Spotlight turns the guide on.
  await page.click('#zenGuide');
  await page.locator('#zenGuideMenu').waitFor({ state: 'visible' });
  const modes = await page.locator('#zenGuideMenu [data-zen-guide-orientation]').evaluateAll(b => b.map(x => x.textContent.trim()));
  check('Zen guide menu offers Rows, Columns, Spotlight', JSON.stringify(modes) === JSON.stringify(['Rows', 'Columns', 'Spotlight']), JSON.stringify(modes));
  await page.click('#zenGuideMenu [data-zen-guide-orientation="spot"]');
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    on: document.getElementById('focusBtn').getAttribute('aria-pressed'),
    orient: document.getElementById('paneSpotlight').dataset.guideOrientation,
    zenPressed: document.querySelector('[data-zen-guide-orientation="spot"]').getAttribute('aria-pressed'),
    deskPressed: document.querySelector('[data-guide-orientation="spot"]').getAttribute('aria-pressed'),
    sizeLabel: document.getElementById('zenGuideSizeLabel').textContent,
    spanHidden: document.getElementById('guideSpanGroup').hidden,
  }));
  check('Spotlight turns the guide on in spot shape', state.on === 'true' && state.orient === 'spot', JSON.stringify(state));
  check('Zen and Settings buttons agree', state.zenPressed === 'true' && state.deskPressed === 'true');
  check('size slider is labelled Size and Span is hidden', state.sizeLabel === 'Size' && state.spanHidden === true);

  // 2. Hover moves the lens; the lens is round and shows enlarged paper.
  await page.click('#zenGuide'); // close the menu
  const pane = await page.locator('#documentPane').boundingBox();
  const target = await page.evaluate(() => { const r = document.querySelector('#pdfFrame .pdf-page').getBoundingClientRect(); return { x: r.left + r.width * .5, y: r.top + r.height * .3 }; });
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.waitForTimeout(400);
  const lens = await page.evaluate(() => {
    const lens = document.getElementById('spotLens'), r = lens.getBoundingClientRect(), cs = getComputedStyle(lens);
    const veil = getComputedStyle(document.querySelector('.spot-veil'));
    const content = document.getElementById('spotLensContent');
    const win = content.querySelector('.spot-window');
    return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: cs.borderTopLeftRadius, vis: cs.visibility, display: cs.display,
      pages: content.querySelectorAll('.pdf-page').length, winShown: !!win && getComputedStyle(win).display !== 'none' && win.width > 0,
      transform: content.style.transform, veilBlur: veil.backdropFilter || veil.webkitBackdropFilter || '', veilDisplay: veil.display,
      shadeDisplay: getComputedStyle(document.querySelector('.guide-shade-top')).display,
      ids: content.querySelectorAll('[id]').length, links: content.querySelectorAll('.pdf-link').length, dataPage: content.querySelectorAll('[data-page]').length };
  });
  check('lens is a circle centred on the pointer', Math.abs(lens.w - lens.h) < 1 && lens.radius === '50%' && Math.abs(lens.cx - target.x) < 2 && Math.abs(lens.cy - target.y) < 2, JSON.stringify({ w: lens.w, h: lens.h, cx: lens.cx, cy: lens.cy, t: target }));
  check('lens holds a page copy with its pixel window', lens.display === 'block' && lens.vis === 'visible' && lens.pages >= 1 && lens.winShown, JSON.stringify(lens));
  check('lens enlarges 1.1x', /scale\(1\.1\)/.test(lens.transform), lens.transform);
  check('outside blurs (veil) instead of the band shades', /blur/.test(lens.veilBlur) && lens.veilDisplay === 'block' && lens.shadeDisplay === 'none', lens.veilBlur);
  check('copies carry no ids, links or page numbers', lens.ids === 0 && lens.links === 0 && lens.dataPage === 0, JSON.stringify(lens));

  // 3. Pixel check: the red square drawn at a known PDF spot appears enlarged in the lens.
  const square = await page.evaluate(() => {
    const holder = document.querySelector('#pdfFrame .pdf-page'), r = holder.getBoundingClientRect();
    // pdf-lib: square at x 300..312, y 380..392 (bottom-left origin) on a 612x792 page.
    return { x: r.left + (306 / 612) * r.width, y: r.top + ((792 - 386) / 792) * r.height, size: 12 / 612 * r.width };
  });
  await page.mouse.move(square.x, square.y, { steps: 3 });
  await page.waitForTimeout(400);
  const shot = await page.screenshot();
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, ENGINE + '-pdf-lens.png'), shot);
  const measured = await page.evaluate(async ({ png, cx, cy }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, ratio = c.width / innerWidth;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    const R = 60 * ratio, X = cx * ratio, Y = cy * ratio;
    for (let y = Math.max(0, Math.floor(Y - R)); y < Math.min(c.height, Y + R); y++) for (let x = Math.max(0, Math.floor(X - R)); x < Math.min(c.width, X + R); x++) {
      const i = (y * c.width + x) * 4; if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    return maxX < 0 ? null : { w: (maxX - minX + 1) / ratio, h: (maxY - minY + 1) / ratio, cx: (minX + maxX) / 2 / ratio, cy: (minY + maxY) / 2 / ratio };
  }, { png: shot.toString('base64'), cx: square.x, cy: square.y });
  check('red square sits under the lens centre', measured && Math.abs(measured.cx - square.x) < 2.5 && Math.abs(measured.cy - square.y) < 2.5, JSON.stringify({ measured, square }));
  check('red square is enlarged ~1.1x', measured && measured.w / square.size > 1.04 && measured.w / square.size < 1.18, measured && (measured.w / square.size).toFixed(3));

  // 4. Scrolling keeps the lens magnifying what is under it now.
  await page.mouse.wheel(0, 300); await page.waitForTimeout(500);
  const afterScroll = await page.evaluate(() => {
    const content = document.getElementById('spotLensContent'), lens = document.getElementById('spotLens').getBoundingClientRect();
    const k = 1.1, r = lens.width / 2, m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(content.style.transform);
    const overlay = document.getElementById('paneSpotlight').getBoundingClientRect();
    const ux = (r - +m[1]) / k, uy = (r - +m[2]) / k;
    const clone = content.querySelector('.pdf-page'), real = document.elementFromPoint(overlay.left + ux, overlay.top + uy)?.closest?.('.pdf-page');
    const cloneTop = parseFloat(clone.style.top) + parseFloat(content.firstElementChild.style.top);
    return { centreMatchesLens: Math.abs(overlay.left + ux - (lens.left + r)) < 1.5 && Math.abs(overlay.top + uy - (lens.top + r)) < 1.5,
      cloneTopVsReal: real ? Math.abs((overlay.top + cloneTop) - real.getBoundingClientRect().top) : -1 };
  });
  check('after a scroll the copy lines up with the real page', afterScroll.centreMatchesLens && afterScroll.cloneTopVsReal >= 0 && afterScroll.cloneTopVsReal < 1.5, JSON.stringify(afterScroll));

  // 5. Annotating: the copy steps aside so marks land where they are seen.
  await page.evaluate(() => { document.getElementById('zenAnnotate')?.click(); });
  await page.waitForTimeout(200);
  const penBtn = page.locator('[data-pdf-write-toggle]').first();
  if (await penBtn.count()) {
    await page.evaluate(() => document.querySelector('[data-pdf-write-toggle]').click());
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => ({ cls: document.getElementById('paneSpotlight').classList.contains('spot-lens-off'), vis: getComputedStyle(document.getElementById('spotLens')).visibility }));
    check('pen mode hides the copy (the circle shows the real paper)', off.cls && off.vis === 'hidden', JSON.stringify(off));
    await page.evaluate(() => document.querySelector('[data-pdf-write-toggle]').click());
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => getComputedStyle(document.getElementById('spotLens')).visibility);
    check('leaving pen mode brings the lens back', back === 'visible', back);
  } else check('pen toggle exists', false);
  // Close the annotate popout with its own button (Escape would close the paper in WebKit).
  await page.evaluate(() => { const menu = document.getElementById('zenAnnotateMenu'); if (menu && !menu.classList.contains('hidden')) document.getElementById('zenAnnotate').click(); });

  // 6. Persistence and a clean switch back to Rows.
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')));
  check('Spotlight persists with its spot', saved.guideOrientation === 'spot' && saved.spotX > 0 && saved.spotY > 0, JSON.stringify({ o: saved.guideOrientation, x: saved.spotX, y: saved.spotY }));
  await page.evaluate(() => document.querySelector('[data-guide-orientation="row"]').click());
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => ({ reader: !document.getElementById('readerPage').classList.contains('hidden'), lens: getComputedStyle(document.getElementById('spotLens')).display, veil: getComputedStyle(document.querySelector('.spot-veil')).display,
    shade: getComputedStyle(document.querySelector('.guide-shade-top')).display, copies: document.getElementById('spotLensContent').childElementCount }));
  check('Rows restores the band and empties the lens', rows.reader && rows.lens === 'none' && rows.veil === 'none' && rows.shade === 'block' && rows.copies === 0, JSON.stringify(rows));

  // 7. A text paper: the lens copies the paragraphs under it.
  await page.evaluate(() => document.querySelector('[data-guide-orientation="spot"]').click());
  await page.evaluate(() => document.getElementById('zenExit').click());
  await page.waitForFunction(() => !document.getElementById('libraryPage').classList.contains('hidden'));
  const cleared = await page.evaluate(() => document.getElementById('spotLensContent').childElementCount);
  check('leaving the reader drops the copies', cleared === 0, String(cleared));
  await page.click('#importPdfBtn');
  await page.click('#newTextBtn');
  await page.fill('#textTitle', 'Spotlight text');
  await page.fill('#textBody', Array.from({ length: 40 }, (_, i) => 'Paragraph ' + (i + 1) + '. Sugar moves through the phloem from leaves to fruit, and a reader moves through a paper from page to memory.').join('\n\n'));
  await page.click('#saveTextBtn');
  await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length > 10);
  await page.waitForTimeout(500);
  const para = await page.evaluate(() => { const r = document.querySelectorAll('#textDocument .para')[3].getBoundingClientRect(); return { x: r.left + 80, y: r.top + r.height / 2 }; });
  await page.mouse.move(para.x, para.y, { steps: 3 });
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => {
    const content = document.getElementById('spotLensContent'), wrap = content.firstElementChild;
    return { wrapClass: wrap && wrap.className, paras: content.querySelectorAll('.para').length, ids: content.querySelectorAll('[id]').length,
      font: wrap && getComputedStyle(wrap).getPropertyValue('--read-size'), realFont: getComputedStyle(document.getElementById('textDocument')).getPropertyValue('--read-size') };
  });
  check('text paper: lens copies the paragraphs under it', text.paras >= 1 && /spot-doc/.test(text.wrapClass) && text.ids === 0 && text.font === text.realFont, JSON.stringify(text));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, ENGINE + '-text-lens.png') });

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`${ENGINE}: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
