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
  // A short sentence, one long enough to be spoken in pieces, then two short ones.
  const lines = ['Water in the soil may exist as a thin film on particles.',
    'Clay soils hold water tightly because their channels are small and narrow,',
    'and the water that sits in those narrow channels is held by strong forces,',
    'so that roots must work much harder to pull it away from the clay particles,',
    'which is why a clay soil can still look damp while the plant above it wilts,',
    'even on mornings when the surface of the field appears to be fully wet.',
    'Sandy soils drain quickly and keep little water near the surface.',
    'Field capacity is the water content of a soil after it drains.'];
  page.drawText('Water in Soil', { x: 60, y: 740, size: 15, font: bold });
  lines.forEach((line, i) => page.drawText(line, { x: 60, y: 700 - i * 15, size: 11, font }));
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

async function open(browser, port) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(speech);
  await page.goto(`http://127.0.0.1:${port}/reading.html`);
  await page.locator('#pdfFile').setInputFiles({ name: 'soil.pdf', mimeType: 'application/pdf', buffer: await paper() });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span').length >= 6);
  await page.waitForTimeout(600);
  await page.locator('#zenListen').click();
  await page.waitForFunction(() => window.__said.length >= 1);
  return { context, page, errors };
}
const last = page => page.evaluate(() => window.__said[window.__said.length - 1]);
// Let the voice finish what it is saying until `pick` matches the sentence now being spoken.
async function speakUntil(page, pick) {
  for (let i = 0; i < 12 && !pick(await last(page)); i++) { await page.evaluate(() => window.__finish()); await page.waitForTimeout(120); }
  assert.ok(pick(await last(page)), 'reached the sentence: ' + await last(page));
}
async function closeAndReturn(page, how) {
  await page.locator(how === 'close' ? '#voiceClose' : '#zenListen').click();
  await page.waitForTimeout(400);
  assert.equal(await marked(page), '', 'after leaving Listen no sentence stays marked');
  assert.deepEqual(await page.evaluate(() => ({ bar: !document.getElementById('voiceBar').classList.contains('hidden'), dim: document.body.classList.contains('voice-focus') })), { bar: false, dim: false }, 'the bar closes and the paper is no longer dimmed');
  const n = await page.evaluate(() => window.__said.length);
  await page.locator('#zenListen').click();
  await page.waitForFunction(n => window.__said.length > n, n);
  return page.evaluate(n => window.__said[n], n);
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch(), port = server.address().port;
  try {
    /* 1. Well into a sentence: coming back starts that sentence again. Both ways of leaving. */
    for (const how of ['dock', 'close']) {
      const { context, page, errors } = await open(browser, port);
      await speakUntil(page, t => /^Sandy soils/.test(t));
      await page.waitForTimeout(1500);
      const back = await closeAndReturn(page, how);
      assert.ok(/^Sandy soils/.test(back), `left with the ${how} button well into a sentence, it resumes there: ` + back);
      console.log(`PASS  leaving with the ${how} button clears the marks, and coming back resumes at the sentence (${name})`);
      assert.deepEqual(errors, []); await context.close();
    }
    /* 2. Just after the voice moved on: coming back replays the sentence just heard, not the next. */
    {
      const { context, page, errors } = await open(browser, port);
      await speakUntil(page, t => /^Sandy soils/.test(t));
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__finish());
      await page.waitForTimeout(250);
      assert.ok(/^Field capacity/.test(await last(page)), 'the voice has just moved on to the next sentence');
      const back = await closeAndReturn(page, 'dock');
      assert.ok(/^Sandy soils/.test(back), 'left a moment after the voice moved on, it does not skip ahead: ' + back);
      console.log(`PASS  leaving just after a new sentence began resumes at the one just heard (${name})`);
      assert.deepEqual(errors, []); await context.close();
    }
    /* 3. In the second piece of a long sentence: coming back starts the sentence from its beginning. */
    {
      const { context, page, errors } = await open(browser, port);
      await speakUntil(page, t => /^Clay soils/.test(t));
      await page.evaluate(() => window.__finish());
      await page.waitForTimeout(1500);
      const piece = await last(page);
      assert.ok(!/^Clay soils/.test(piece) && /clay|roots|wilts|damp|wet/i.test(piece), 'the long sentence is spoken in pieces, and the voice is in a later one: ' + piece);
      const back = await closeAndReturn(page, 'dock');
      assert.ok(/^Clay soils/.test(back), 'left inside a long sentence, it resumes from that sentence\'s start: ' + back);
      console.log(`PASS  leaving inside a long sentence resumes from its start (${name})`);
      assert.deepEqual(errors, []); await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
