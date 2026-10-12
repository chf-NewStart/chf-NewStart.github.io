/* Words under a PDF highlight stay black (the highlight layer blends with the page instead of
   sitting over it like tinted glass), and the Highlight strength slider lightens or deepens
   the colour without fading the words. Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), zlib = require('node:zlib');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
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
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
  const browser = await playwright[ENGINE].launch(); const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.addPage([612, 792]).drawText('HIGHLIGHTED TEXT SHOULD STAY BLACK', { x: 60, y: 700, size: 24, font });
  await page.locator('#pdfFile').setInputFiles({ name: 'crisp.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await page.waitForFunction(() => !!document.querySelector('.pdf-page canvas')?.width); await page.waitForTimeout(800);
  const box = await page.evaluate(() => { const p = document.querySelector('.pdf-page'), d = document.createElement('div');
    d.className = 'saved-highlight hl-yellow'; Object.assign(d.style, { left: '8%', top: '9.5%', width: '80%', height: '4.5%' });
    p.querySelector('.highlight-layer').appendChild(d); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const clip = { x: box.x + box.w * .08, y: box.y + box.h * .105, width: box.w * .8, height: box.h * .03 };
  const measure = async () => { await page.waitForTimeout(250); const l = lumas(await page.screenshot({ clip }));
    return { text: l.slice(0, 60).reduce((a, b) => a + b, 0) / 60, paper: l[Math.floor(l.length * .75)] }; };
  const strong = await measure();
  assert(strong.text < 25, `words under a highlight stay black (luma ${strong.text.toFixed(1)}; tinted glass gave ~89)`);
  assert(strong.paper < 235, 'the highlight colour is there');
  await page.evaluate(() => { const r = document.getElementById('highlightStrength'); r.value = '30'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  const light = await measure();
  assert(light.paper > strong.paper + 12, `a lower strength lightens the colour (${strong.paper.toFixed(0)} → ${light.paper.toFixed(0)})`);
  assert(light.text < 25, 'and the words are still black');
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).hlStrength), 30, 'strength persists');
  assert.deepEqual(errors, []);
  console.log(`PASS highlights keep words black (luma ${strong.text.toFixed(1)}), strength 85% → 30% lightens the colour (${strong.paper.toFixed(0)} → ${light.paper.toFixed(0)}), persists`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
