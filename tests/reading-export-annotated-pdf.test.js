/* Export annotated PDF: the original paper comes back with the reader's highlights (words
   still black under them), handwriting and notes written into it, at the same spots as on
   screen, including on a cropped page and a rotated page. The Zen ••• menu downloads it on
   the web; in the iPad app it goes to the share sheet, or stays hidden when there is none.
   Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, PDFName, StandardFonts, degrees } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
  const browser = await playwright[ENGINE].launch(); const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));

  // Page 1 is cropped (its visible box starts at 50,50); page 2 is rotated a quarter turn.
  const source = await PDFDocument.create(), font = await source.embedFont(StandardFonts.HelveticaBold);
  const first = source.addPage([612, 792]); first.setCropBox(50, 50, 512, 692);
  first.drawText('WORDS UNDER THE HIGHLIGHT', { x: 110, y: 585, size: 20, font });
  const second = source.addPage([612, 792]); second.setRotation(degrees(90));
  second.drawText('ROTATED PAGE', { x: 200, y: 300, size: 18, font });
  const sourceBytes = Buffer.from(await source.save());
  await page.locator('#pdfFile').setInputFiles({ name: 'field-notes.pdf', mimeType: 'application/pdf', buffer: sourceBytes });
  await page.waitForFunction(() => !!document.querySelector('.pdf-page canvas')?.width); await page.waitForTimeout(600);

  // Build from a reader's annotations: positions are fractions of the page as shown on screen.
  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
    const ch = { kind: 'pdf', title: 'Field notes',
      highlights: { 1: [{ id: 'h1', color: 'yellow', rects: [{ x: .1, y: .2, w: .5, h: .04 }], text: 'WORDS', note: 'Key claim' }],
        2: [{ id: 'h2', color: 'blue', rects: [{ x: .6, y: .7, w: .2, h: .05 }], text: '' }] },
      pdfInk: { 1: [{ id: 's1', color: 'red', width: 3, points: [[.1, .6, .5], [.5, .6, .5], [.85, .62, .5]] }] },
      pageNotes: { 1: 'Page one thought', document: 'Whole paper note' } };
    const built = await window.__phloemBuildAnnotatedPdf(ch, bytes);
    const pdfjs = await import('/vendor/pdfjs/pdf.min.js'); pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.compat.js';
    const doc = await pdfjs.getDocument({ data: built.bytes.slice(0) }).promise, pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n), view = p.getViewport({ scale: 1 }), canvas = document.createElement('canvas');
      canvas.width = Math.round(view.width); canvas.height = Math.round(view.height);
      const ctx = canvas.getContext('2d'); await p.render({ canvasContext: ctx, viewport: view, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
      const at = (u, v) => Array.from(ctx.getImageData(Math.round(u * canvas.width), Math.round(v * canvas.height), 1, 1).data.slice(0, 3));
      const darkest = (u0, v0, u1, v1) => { const d = ctx.getImageData(Math.round(u0 * canvas.width), Math.round(v0 * canvas.height), Math.round((u1 - u0) * canvas.width), Math.round((v1 - v0) * canvas.height)).data;
        let min = 255; for (let i = 0; i < d.length; i += 4) min = Math.min(min, .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]); return min; };
      pages.push({ w: canvas.width, h: canvas.height, at, darkest });
    }
    const [one, two] = pages;
    return { counts: built.counts, bytes: btoa(Array.from(built.bytes, b => String.fromCharCode(b)).join('')),
      size: [one.w, one.h, two.w, two.h],
      hlPaper: one.at(.5, .21), hlText: one.darkest(.1, .2, .6, .24), plain: one.at(.5, .4), ink: one.at(.3, .6), inkGap: one.at(.3, .66),
      rotatedHl: two.at(.7, .725), rotatedPlain: two.at(.3, .3) };
  }, sourceBytes.toString('base64'));

  assert.deepEqual(result.size, [512, 692, 792, 612], 'pages keep their crop and rotation');
  const [r, g, b] = result.hlPaper;
  assert(r > 215 && g > 170 && b < 175 && r - b > 60, `the highlight is yellow where it was on screen (${result.hlPaper})`);
  assert(result.hlText < 70, `words under the highlight stay dark (luma ${result.hlText.toFixed(0)})`);
  assert(result.plain.every(c => c > 245), `paper outside the highlight is untouched (${result.plain})`);
  assert(result.ink[0] > 150 && result.ink[0] - result.ink[1] > 70, `the red handwriting is where it was drawn (${result.ink})`);
  assert(result.inkGap.every(c => c > 245), `handwriting stays thin, not a smear (${result.inkGap})`);
  assert(result.rotatedHl[2] - result.rotatedHl[0] > 50, `a highlight on a rotated page lands in place (${result.rotatedHl})`);
  assert(result.rotatedPlain.every(c => c > 245), 'and nowhere else on that page');
  assert.deepEqual(result.counts, { highlights: 2, strokes: 1, notes: 3 });

  const out = await PDFDocument.load(Buffer.from(result.bytes, 'base64'));
  const notes = out.getPages().map(p => { const annots = p.node.lookup(PDFName.of('Annots')); if (!annots) return [];
    return annots.asArray().map(ref => { const a = out.context.lookup(ref); return [a.get(PDFName.of('Subtype')).toString(), a.lookup(PDFName.of('Contents')).decodeText()]; }); });
  assert.deepEqual(notes[0].map(n => n[0]), ['/Text', '/Text', '/Text'], 'notes become standard PDF comments');
  assert.deepEqual(notes[0].map(n => n[1]).sort(), ['Key claim', 'Page one thought', 'Whole paper note']);
  assert.deepEqual(notes[1], [], 'no stray comments on page 2');
  assert.equal(out.getPageCount(), 2);

  // Web: the Zen ••• menu downloads "<original name> — annotated.pdf".
  await page.click('#zenMore'); await page.waitForTimeout(200);
  assert(await page.isVisible('#zenExportAnnotated'), 'Export annotated PDF is in the ••• menu for a PDF');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#zenExportAnnotated')]);
  assert.match(download.suggestedFilename(), / — annotated\.pdf$/);
  const downloaded = await PDFDocument.load(fs.readFileSync(await download.path()));
  assert.equal(downloaded.getPageCount(), 2, 'the downloaded file is the whole paper');
  await page.waitForFunction(() => /Annotated PDF ready/.test(document.getElementById('readerToast').textContent));

  // iPad app: no browser downloads there. Without a file share sheet the action stays hidden.
  await page.evaluate(() => { window.PHLOEM_NATIVE = true; Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); });
  await page.click('#zenMore'); await page.waitForTimeout(200);
  assert(!(await page.isVisible('#zenExportAnnotated')), 'hidden in the iPad app when it cannot share files');
  await page.keyboard.press('Escape');
  // With a share sheet it shares; if iOS says the tap expired, the next tap shares the same file.
  await page.evaluate(() => { let calls = 0; window.__shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async data => { calls++; if (calls === 1) throw new DOMException('expired', 'NotAllowedError'); window.__shared.push(data.files[0].name + ':' + data.files[0].type); }, configurable: true }); });
  await page.click('#zenMore'); await page.waitForTimeout(200);
  assert(await page.isVisible('#zenExportAnnotated'), 'shown in the iPad app when the share sheet takes files');
  await page.click('#zenExportAnnotated');
  await page.waitForFunction(() => /tap Export annotated PDF again/.test(document.getElementById('readerToast').textContent));
  await page.click('#zenMore'); await page.waitForTimeout(200); await page.click('#zenExportAnnotated');
  await page.waitForFunction(() => window.__shared.length === 1);
  assert.match(await page.evaluate(() => window.__shared[0]), / — annotated\.pdf:application\/pdf$/);

  assert.deepEqual(errors, []);
  console.log(`PASS annotated PDF: yellow highlight with dark words (luma ${result.hlText.toFixed(0)}), red ink in place, rotated + cropped pages aligned, 3 PDF comments; web download + iPad share sheet (retry after expired tap), hidden without one`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
