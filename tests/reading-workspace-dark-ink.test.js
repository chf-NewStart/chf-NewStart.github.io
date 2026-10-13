/* Workspace ink in the dark theme (readers' feedback): on the dark sheet the black pen
   writes and shows white, and its swatch reads "White ink"; in the light theme the same
   handwriting is black again. Display only: strokes are still saved as black, so older
   app versions sync them unchanged. Writing on a (light) sticky note stays dark, and white
   ink that runs onto a note it doesn't belong to stays visible there.
   Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), zlib = require('node:zlib');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });

function lumas(png) {            // decode an 8-bit RGB/RGBA PNG (Playwright's screenshots) into luma values
  let i = 8, w = 0, h = 0, ct = 0, idat = [];
  while (i < png.length) { const n = png.readUInt32BE(i), t = png.toString('latin1', i + 4, i + 8), c = png.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') { w = c.readUInt32BE(0); h = c.readUInt32BE(4); ct = c[9]; } if (t === 'IDAT') idat.push(c); i += 12 + n; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3, stride = w * bpp, out = []; let prev = Buffer.alloc(stride), k = 0;
  for (let y = 0; y < h; y++) { const f = raw[k++], line = Buffer.from(raw.subarray(k, k + stride)); k += stride;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255; else if (f === 2) line[x] = (line[x] + b) & 255; else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; } }
    for (let x = 0; x < w; x++) out.push(.299 * line[x * bpp] + .587 * line[x * bpp + 1] + .114 * line[x * bpp + 2]); prev = line; }
  return out.sort((p, q) => p - q);
}
(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const ENGINE = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[ENGINE].launch();
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Dark ink paper', { x: 72, y: 700, size: 16, font });
  await page.locator('#pdfFile').setInputFiles({ name: 'dark-ink.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
  await page.locator('#zenWorkspace').click();
  await page.locator('#workspacePanel').waitFor({ state: 'visible' });
  await page.locator('#zenTheme').evaluate(button => button.click());
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');

  const write = (y, live) => page.locator('#workspaceInk').evaluate((ink, { y, live }) => {
    const rect = ink.getBoundingClientRect(), board = document.getElementById('workspaceBoard'); board.setPointerCapture = () => {};
    const fire = (type, x) => ink.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 91, isPrimary: true, button: 0,
      buttons: type === 'pointerup' ? 0 : 1, pressure: .6, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y }));
    fire('pointerdown', .2); for (let k = 1; k < 12; k++) fire('pointermove', .2 + k * .02);
    return new Promise(resolve => requestAnimationFrame(() => {
      const preview = document.querySelector('.workspace-ink-preview'), during = preview && getComputedStyle(preview).fill;
      if (!live) fire('pointerup', .44);
      resolve(during);
    }));
  }, { y, live });
  const fills = () => page.evaluate(() => [...document.querySelectorAll('#workspaceInk path[data-stroke-id]')].map(p => getComputedStyle(p).fill));
  const swatch = () => page.evaluate(() => { const b = document.querySelector('[data-workspace-color="black"]'); return { color: getComputedStyle(b).getPropertyValue('--workspace-color').trim(), label: b.getAttribute('aria-label') }; });
  const light = color => { const m = color.match(/\d+/g).map(Number); return (m[0] + m[1] + m[2]) / 3; };

  const during = await write(.05, false);
  assert(light(during) > 200, `in the dark theme the pen writes white (${during})`);
  const darkFills = await fills();
  assert.equal(darkFills.length, 1); assert(light(darkFills[0]) > 200, `and the saved stroke shows white (${darkFills[0]})`);
  assert.deepEqual(await swatch(), { color: '#ece7dc', label: 'White ink' });
  const saved = await page.evaluate(() => [...document.querySelectorAll('#workspaceInk path[data-stroke-id]')].map(p => p.dataset.inkColor));
  assert.deepEqual(saved, ['black'], 'it is still black ink underneath');

  // Writing on a sticky note keeps its dark ink, since notes stay light.
  const onNote = await page.evaluate(() => { const p = document.querySelector('#workspaceInk path[data-stroke-id]'); p.dataset.onNote = ''; const fill = getComputedStyle(p).fill; delete p.dataset.onNote; return fill; });
  assert(light(onNote) < 90, `handwriting on a sticky note stays dark (${onNote})`);

  // White ink that runs onto a note without belonging to it (an arrow drawn from the sheet onto
  // the note) still shows there: the pale note doesn't swallow it.
  await page.locator('#workspaceNewNote').click();
  const card = page.locator('.workspace-card').first(); await card.waitFor({ state: 'visible' });
  await page.locator('#workspaceBoard').focus(); await page.waitForTimeout(300);
  const note = await card.boundingBox(), y = note.y + note.height - 30, clip = { x: note.x + 12, y: y - 14, width: 40, height: 28 };
  const blank = lumas(await page.screenshot({ clip }))[0];
  await page.locator('#workspaceBoard').evaluate((board, { from, to, y }) => {
    const capture = board.setPointerCapture; board.setPointerCapture = () => {};
    try {
      for (let k = 0; k <= 16; k++) {
        const type = k === 0 ? 'pointerdown' : k === 16 ? 'pointerup' : 'pointermove', clientX = from + (to - from) * k / 16;
        (document.elementFromPoint(clientX, y) || board).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 92,
          isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : .6, clientX, clientY: y }));
      }
    } finally { board.setPointerCapture = capture; }
  }, { from: note.x - 160, to: note.x + 50, y });
  await page.waitForTimeout(250);
  const arrow = await page.evaluate(() => [...document.querySelectorAll('#workspaceInk path[data-stroke-id]')].map(p => ({ free: !('onNote' in p.dataset), fill: getComputedStyle(p).fill })));
  assert.equal(arrow.length, 2); assert(arrow[1].free && light(arrow[1].fill) > 200, `the arrow is free white ink (${JSON.stringify(arrow[1])})`);
  const crossing = lumas(await page.screenshot({ clip }))[0];
  assert(blank > 150 && crossing < blank - 100, `white ink stays visible on the note (darkest ${Math.round(crossing)} vs note ${Math.round(blank)})`);

  await page.locator('#zenTheme').evaluate(button => button.click());
  await page.waitForFunction(() => document.documentElement.dataset.theme !== 'dark');
  const lightFills = await fills();
  assert(light(lightFills[0]) < 90, `back in the light theme the same handwriting is black (${lightFills[0]})`);
  assert.equal((await swatch()).label, 'Black ink');
  assert.deepEqual(errors, []);
  console.log(`PASS dark theme writes and shows white (${darkFills[0]}), light theme black (${lightFills[0]}), notes stay dark, white ink shows on a note, saved as black (${ENGINE})`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
