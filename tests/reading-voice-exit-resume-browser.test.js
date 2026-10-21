/* Leaving Listen clears its marks, and coming back resumes where it stopped (Houfu, Oct 21 2026:
   "the speakers highlight wont go when i exit the speaker mode, also if i reenter the speaker
   mode, dont make it speak elsewhere"). The dock's Listen used to pause on a second tap, which kept
   the sentence marked and the paper dimmed; after the close button, Listen restarted at the top of
   the page. Run with PHLOEM_BROWSER=chromium (default) or webkit. */
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
    for (const exit of ['the dock Listen button', 'the close button']) {
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
      for (let i = 0; i < 3; i++) { await page.waitForTimeout(300); await page.evaluate(() => window.__finish()); }
      await page.waitForTimeout(300);
      const speaking = await page.evaluate(() => window.__said[window.__said.length - 1]);
      assert.ok((await marked(page)).length > 0, 'while reading, the sentence is marked');
      await page.locator(exit === 'the close button' ? '#voiceClose' : '#zenListen').click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ bar: !document.getElementById('voiceBar').classList.contains('hidden'), dim: document.body.classList.contains('voice-focus') }));
      assert.equal(await marked(page), '', `after leaving with ${exit}, no sentence stays marked`);
      assert.deepEqual(after, { bar: false, dim: false }, `after leaving with ${exit}, the bar closes and the paper is no longer dimmed`);
      console.log(`PASS  leaving Listen with ${exit} clears its marks (${name})`);
      const n = await page.evaluate(() => window.__said.length);
      await page.locator('#zenListen').click();
      await page.waitForFunction(n => window.__said.length > n, n);
      assert.equal(await page.evaluate(n => window.__said[n], n), speaking, 'coming back resumes at the sentence it stopped on');
      console.log(`PASS  coming back after ${exit} resumes at the same sentence (${name})`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
