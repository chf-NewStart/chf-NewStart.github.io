/* Listen marks the spoken sentence on a PDF page whose text layer lists things in another
   order than they are read (Houfu, Oct 15 2026: on Taiz & Zeiger ch. 4 p. 48, a figure's
   labels and caption come last in the PDF's text, and after them no sentence on the page
   was highlighted). Here the right column comes first in the PDF but is read second. Also:
   a tap on the paper never moves the voice. Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });

async function paper() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.TimesRoman), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const left = ['Water in the soil may exist as a thin', 'film adhering to the surface of soil', 'particles, or it may fill the channel.',
    'Clay soils hold water tightly because', 'their channels are small and narrow.'];
  const right = ['In sandy soils the spaces between', 'particles are large, so water drains', 'from them and stays on the surfaces.',
    'Field capacity is the water content', 'of a soil after excess water drains.'];
  // The right column comes first in the PDF's own order, the left one is read first.
  right.forEach((line, i) => page.drawText(line, { x: 330, y: 700 - i * 15, size: 11, font }));
  left.forEach((line, i) => page.drawText(line, { x: 60, y: 700 - i * 15, size: 11, font }));
  page.drawText('Water in Soil', { x: 60, y: 740, size: 15, font: bold });
  return Buffer.from(await doc.save());
}
function speech() {
  window.__said = []; class Utterance { constructor(text) { this.text = text; } }
  const synth = { speaking: false, current: null, getVoices: () => [{ name: 'Samantha', lang: 'en-US', voiceURI: 's', default: true, localService: true }], addEventListener() {}, cancel() { this.speaking = false; },
    speak(u) { if (u.text.trim()) { window.__said.push(u.text); this.current = u; this.speaking = true; } } };
  window.__finish = () => { const u = synth.current; synth.current = null; synth.speaking = false; if (u && u.onend) u.onend(); };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true }); window.SpeechSynthesisUtterance = Utterance;
}
// What is marked on the page: the CSS highlight's text, or the marked lines without it.
const marked = page => page.evaluate(() => {
  const h = window.CSS && CSS.highlights && CSS.highlights.get('voice-pdf');
  return (h ? [...h].map(range => range.toString()).join(' ') : [...document.querySelectorAll('#pdfFrame .voice-span')].map(span => span.textContent).join(' ')).replace(/\s+/g, ' ').trim();
});

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(speech);
    await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
    await page.locator('#pdfFile').setInputFiles({ name: 'soil.pdf', mimeType: 'application/pdf', buffer: await paper() });
    await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span').length >= 6);
    await page.waitForTimeout(600);
    await page.locator('#zenListen').click();
    await page.waitForFunction(() => window.__said.length >= 1);
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(450);
      seen.push({ said: await page.evaluate(() => window.__said[window.__said.length - 1]), marked: await marked(page) });
      await page.evaluate(() => window.__finish());
    }
    const said = seen.map(step => step.said);
    // Lines are separate spans, so compare without the spaces between them.
    const bare = text => text.replace(/\s+/g, '');
    const order = said.map(text => text.slice(0, 12));
    assert.ok(said.indexOf(said.find(text => /^Water in the soil/.test(text))) < said.indexOf(said.find(text => /^In sandy soils/.test(text))), 'the left column is read first: ' + JSON.stringify(order));
    for (const step of seen.filter(step => /^(Water in the soil|Clay soils|In sandy soils)/.test(step.said)))
      assert.equal(bare(step.marked), bare(step.said), 'the spoken sentence, and only it, is marked on the page: ' + JSON.stringify(seen));
    console.log('PASS  the spoken sentence is marked even when the page lists its text in another order (' + name + ')');

    // A tap on the paper is a tap; only the pin moves the voice.
    const before = await page.evaluate(() => window.__said.length);
    const box = await page.locator('.pdf-page[data-page="1"]').boundingBox();
    await page.mouse.click(box.x + box.width * .2, box.y + box.height * .2);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__said.length), before, 'tapping the page does not restart the voice elsewhere');
    assert.deepEqual(errors, []);
    console.log('PASS  a tap on the page leaves the voice where it is');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
