/* Guide thickness is a percent slider: an old saved S carries over as 60%, the slider sets the
   band's height, and the value persists. Chromium. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
(async () => {
  await new Promise(res => server.listen(0, res)); const port = server.address().port;
  const browser = await playwright[process.env.PHLOEM_BROWSER || 'chromium'].launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ size: 100, measure: 780, leading: 1.7, typeface: 'book', guide: 'yellow', guideOrientation: 'row', guideScope: 'page', guideSize: 's', guideDim: 85, focus: true })); } });
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Guide thickness in percent.', { x: 52, y: 710, size: 13, font });
  await page.locator('#pdfFile').setInputFiles({ name: 'guide-pct.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await page.waitForFunction(() => !!document.querySelector('.pdf-page canvas')?.width);
  const v0 = await page.evaluate(() => [document.getElementById('guideSizeRange').value, document.getElementById('zenGuideSizeRange').value]);
  assert.deepEqual(v0, ['60', '60'], 'a saved S carries over as 60% on both sliders');
  const h0 = await page.evaluate(() => parseFloat(document.getElementById('paneSpotlight').style.getPropertyValue('--guide-h')));
  await page.evaluate(() => { const r = document.getElementById('zenGuideSizeRange'); r.value = '180'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ desk: document.getElementById('guideSizeValue').textContent, zen: document.getElementById('zenGuideSizeValue').textContent,
    h: parseFloat(document.getElementById('paneSpotlight').style.getPropertyValue('--guide-h')) }));
  assert.equal(after.desk, '180%'); assert.equal(after.zen, '180%');
  assert(after.h > h0 * 2.5, `the band grows with the slider (${h0} → ${after.h})`);
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).guidePct);
  assert.equal(saved, 180, 'persists');
  assert.deepEqual(errors, []);
  console.log('PASS guide thickness slider: S carries over as 60%, Zen and desk sliders agree, 180% triples the band, persists');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
