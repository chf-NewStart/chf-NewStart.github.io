/* Listen keeps the sentence being read in focus and in view; the guide follows the voice;
   the voice menu is never greyed out; the iPad app speaks with its own (downloaded) voices.
   Speech uses stand-in engines that record each sentence.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });

const PARAGRAPHS = ['INTRODUCTION'];
for (let i = 1; i <= 14; i++) PARAGRAPHS.push(`Paragraph ${i} opens here [${i}]. Sinks pull sugar from leaves (Smith et al., 2020) in part ${i}. The fruit grows as part ${i} ends.`);

function seed() {
  if (localStorage.getItem('readingRoom.v1')) return;
  const stamp = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{ id: 'focus-paper', kind: 'text', title: 'Focus fixture', fr: window.__PARAS.join('\n\n'),
    notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }], deleted: {}, merged: {}, savedAt: stamp }));
  localStorage.setItem('readingRoom.lastOpen.v1', 'focus-paper');
}
function webSpeech() {
  window.__said = [];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = { speaking: false, pending: false, current: null, getVoices: () => window.__voices || [],
    addEventListener() {}, cancel() { this.speaking = false; },
    speak(u) { if (u.text.trim()) { window.__said.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate }); this.current = u; this.speaking = true; } } };
  window.__finish = () => { const u = synth.current; synth.current = null; synth.speaking = false; if (u && u.onend) u.onend(); };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
}
// The iPad app: Web Speech lists nothing; the PhloemSpeech plugin has the downloaded voices.
function appSpeech() {
  window.PHLOEM_NATIVE = true;
  window.__native = []; window.__voices = [];
  let pending = null;
  const plugin = {
    voices: () => Promise.resolve({ voices: [
      { voiceURI: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha', lang: 'en-US', quality: 1, localService: true },
      { voiceURI: 'com.apple.voice.premium.en-GB.Malcolm', name: 'Jamie (Premium)', lang: 'en-GB', quality: 3, localService: true }] }),
    speak: options => { window.__native.push(options); return new Promise(resolve => { pending = resolve; }); },
    cancel: () => { if (pending) pending({ finished: false }); pending = null; return Promise.resolve(); },
    addListener: () => Promise.resolve({ remove() {} })
  };
  window.__nativeFinish = () => { const done = pending; pending = null; if (done) done({ finished: true }); };
  window.Capacitor = { Plugins: { PhloemSpeech: plugin }, isNativePlatform: () => true };
}
const spokenRange = page => page.evaluate(() => { const h = CSS.highlights && CSS.highlights.get('voice-sentence'); return h ? [...h][0].toString() : ''; });

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${server.address().port}/reading.html`;
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 760 }, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(paras => { window.__PARAS = paras; }, PARAGRAPHS);
    await page.addInitScript(seed);
    await page.addInitScript(webSpeech);
    await page.addInitScript(() => { window.__voices = [{ name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', default: true }, { name: 'Jamie (Premium)', lang: 'en-GB', voiceURI: 'jamie' }]; });
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length === 15);

    // Listen sits on the dock itself, not behind •••.
    assert.equal(await page.locator('#zenListen').isVisible(), true, 'Listen is a dock button');
    await page.locator('#zenListen').click();
    await page.waitForFunction(() => window.__said.length === 1);
    assert.equal(await page.locator('#zenListen').getAttribute('aria-expanded'), 'true');
    await page.evaluate(() => window.__finish()); await page.waitForTimeout(450);
    // The sentence with its citation on the page is the one marked; everything else dims.
    assert.equal(await spokenRange(page), 'Paragraph 1 opens here [1].');
    await page.evaluate(() => window.__finish()); await page.waitForTimeout(500);
    assert.equal(await spokenRange(page), 'Sinks pull sugar from leaves (Smith et al., 2020) in part 1.');
    const looks = await page.evaluate(() => {
      const paras = [...document.querySelectorAll('#textDocument .para')];
      return { body: document.body.className, reading: getComputedStyle(paras[1]).opacity, other: getComputedStyle(paras[3]).opacity };
    });
    assert.match(looks.body, /voice-focus/); assert.match(looks.body, /voice-sentence-on/);
    assert.equal(looks.reading, '1'); assert.ok(+looks.other < 0.6, 'other paragraphs dim: ' + looks.other);
    console.log('PASS  Listen on the dock; the spoken sentence is marked and the rest of the paper dims (' + name + ')');

    // Reading down the paper keeps the sentence in the clear part of the page.
    for (let i = 0; i < 24; i++) { await page.evaluate(() => window.__finish()); await page.waitForTimeout(60); }
    await page.waitForTimeout(900);
    let spot = await page.evaluate(() => {
      const r = [...CSS.highlights.get('voice-sentence')][0].getBoundingClientRect(), bar = document.getElementById('voiceBar').getBoundingClientRect(), pane = document.getElementById('documentPane');
      return { top: r.top, bottom: r.bottom, barTop: bar.top, scroll: pane.scrollTop };
    });
    assert.ok(spot.scroll > 200, 'the paper scrolled along: ' + spot.scroll);
    assert.ok(spot.top > 0 && spot.bottom < spot.barTop, 'the sentence is above the Listen bar: ' + JSON.stringify(spot));
    // A hand on the paper: following waits.
    await page.mouse.move(500, 300); await page.mouse.wheel(0, -600); await page.waitForTimeout(500);
    const handScroll = await page.evaluate(() => document.getElementById('documentPane').scrollTop);
    for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__finish()); await page.waitForTimeout(60); }
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => document.getElementById('documentPane').scrollTop), handScroll, 'scrolling by hand is not undone');
    console.log('PASS  the paper follows the voice, and waits while you scroll by hand');

    // Reading guide on: the guide frames the sentence and the paper is not dimmed.
    await page.locator('#voiceNext').click(); await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('zenGuideToggle').click());
    await page.locator('#voiceNext').click(); await page.waitForTimeout(1100);
    const guided = await page.evaluate(() => {
      const band = document.getElementById('guideBand').getBoundingClientRect(), r = [...CSS.highlights.get('voice-sentence')][0].getBoundingClientRect();
      return { body: document.body.className, bandTop: band.top, bandBottom: band.bottom, top: r.top, bottom: r.bottom, other: getComputedStyle(document.querySelectorAll('#textDocument .para')[2]).opacity };
    });
    assert.doesNotMatch(guided.body, /voice-focus/); assert.equal(guided.other, '1');
    assert.ok(guided.bandTop <= guided.top + 2 && guided.bandBottom >= guided.bottom - 2, 'the guide band covers the sentence: ' + JSON.stringify(guided));
    // The pointer does not pull the guide away while Listen plays.
    const guideY = () => page.evaluate(() => document.getElementById('paneSpotlight').style.getPropertyValue('--guide-y'));
    const placed = await guideY();
    await page.mouse.move(600, 640); await page.mouse.move(610, 650); await page.waitForTimeout(200);
    assert.equal(await guideY(), placed, 'the voice keeps the guide');
    // Paused, the guide follows the pointer again.
    await page.locator('#voicePlay').click(); await page.waitForTimeout(1000);
    await page.mouse.move(600, 640); await page.mouse.move(610, 650); await page.waitForTimeout(200);
    assert.notEqual(await guideY(), placed, 'paused: the pointer carries the guide');
    await page.locator('#voicePlay').click(); await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('zenGuideToggle').click());
    console.log('PASS  with the reading guide on, the guide follows the voice instead of the pointer');

    // Speed is a slider; a new speed is kept and used for the next sentence.
    // v227: the slider runs in doublings (−1…1 = 0.5×…2×), so 1.3× sits at log2(1.3).
    await page.locator('#voiceRate').fill(Math.log2(1.3).toFixed(2));
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#voiceRateValue').textContent(), '1.3×');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.voice.v1')).rate), 1.3);
    assert.equal(await page.evaluate(() => window.__said[window.__said.length - 1].rate), 1.3);
    await page.locator('#voiceClose').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('voice-focus') || !!document.querySelector('.voice-reading')), false, '✕ clears the focus');
    assert.deepEqual(errors, []);
    console.log('PASS  speed slider');

    // No voices listed yet (WKWebView, a cold browser): the menu still works and fills in later.
    const cold = await context.newPage();
    await cold.addInitScript(paras => { window.__PARAS = paras; }, PARAGRAPHS);
    await cold.addInitScript(seed);
    await cold.addInitScript(webSpeech);
    await cold.addInitScript(() => { window.__voices = []; });
    await cold.goto(url);
    await cold.waitForFunction(() => document.querySelectorAll('#textDocument .para').length === 15);
    await cold.locator('#zenListen').click();
    await cold.waitForFunction(() => window.__said.length === 1);
    assert.equal(await cold.locator('#voiceVoice').isDisabled(), false, 'never greyed out');
    assert.deepEqual(await cold.locator('#voiceVoice option').allTextContents(), ['System voice']);
    await cold.evaluate(() => { window.__voices = [{ name: 'Daniel', lang: 'en-GB', voiceURI: 'daniel', default: true }]; });
    await cold.waitForFunction(() => document.getElementById('voiceVoice').options[0].textContent === 'Daniel', null, { timeout: 4000 });
    await cold.close();
    console.log('PASS  an empty voice list is "System voice", enabled, and fills in when voices arrive');

    // The iPad app: its own voices, including a downloaded Premium one, through PhloemSpeech.
    const app = await context.newPage(), appErrors = [];
    app.on('pageerror', e => appErrors.push(String(e)));
    await app.addInitScript(() => { localStorage.clear(); });
    await app.addInitScript(paras => { window.__PARAS = paras; }, PARAGRAPHS);
    await app.addInitScript(seed);
    await app.addInitScript(webSpeech);
    await app.addInitScript(appSpeech);
    await app.goto(url);
    await app.waitForFunction(() => document.querySelectorAll('#textDocument .para').length === 15);
    await app.locator('#zenListen').click();
    await app.waitForFunction(() => window.__native.length === 1);
    assert.equal(await app.evaluate(() => window.__said.length), 0, 'Web Speech is not used in the app');
    assert.deepEqual(await app.locator('#voiceVoice option').allTextContents(), ['Jamie (Premium)', 'Samantha']);
    assert.equal(await app.evaluate(() => window.__native[0].voiceURI), 'com.apple.voice.premium.en-GB.Malcolm', 'Jamie is chosen first');
    await app.evaluate(() => window.__nativeFinish()); await app.waitForFunction(() => window.__native.length === 2);
    await app.locator('#voiceVoice').selectOption('com.apple.voice.compact.en-US.Samantha');
    await app.waitForFunction(() => window.__native.length === 3);
    assert.deepEqual(await app.evaluate(() => [window.__native[2].text, window.__native[2].voiceURI]), [await app.evaluate(() => window.__native[1].text), 'com.apple.voice.compact.en-US.Samantha'], 'switching voices re-reads the sentence in the new voice');
    assert.equal(await app.locator('#voiceHelpBtn').isVisible(), false, 'a natural voice is installed: no guide');
    assert.deepEqual(appErrors, []);
    console.log('PASS  the iPad app lists and speaks with its downloaded voices');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
