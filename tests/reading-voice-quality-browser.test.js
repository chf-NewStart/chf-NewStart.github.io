/* Listen on a device with only basic voices: the bar offers a guide to a natural voice, and
   when the reader comes back with Jamie downloaded, Listen switches to it by itself.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function setup() {
  const stamp = Date.now();
  if (!localStorage.getItem('readingRoom.v1')) {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{ id: 'quality-paper', kind: 'text', title: 'Quality fixture', fr: 'First sentence here.\n\nSecond sentence here.\n\nThird sentence here.',
      notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }], deleted: {}, merged: {}, savedAt: stamp }));
    localStorage.setItem('readingRoom.lastOpen.v1', 'quality-paper');
  }
  window.__said = [];
  window.__voices = [{ name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', default: true }];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = { speaking: false, pending: false, current: null, getVoices: () => window.__voices, addEventListener() {}, cancel() { this.speaking = false; },
    speak(u) { if (u.text.trim()) { window.__said.push({ text: u.text, voice: u.voice && u.voice.name }); this.current = u; this.speaking = true; } } };
  window.__finish = () => { const u = synth.current; synth.current = null; synth.speaking = false; if (u && u.onend) u.onend(); };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 900 }, userAgent: IPAD, hasTouch: true }), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(setup);
    await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length === 3);
    await page.locator('#zenListen').click();
    await page.waitForFunction(() => window.__said.length === 1);
    assert.equal(await page.locator('#voiceHelpBtn').isVisible(), true, 'only a basic voice: the guide is offered');
    await page.locator('#voiceHelpBtn').click();
    await page.locator('#voiceHelpDialog').waitFor({ state: 'visible' });
    // Safari only offers the voices that ship with iPadOS: the guide says so and points to the app.
    assert.match(await page.locator('#voiceHelpBtn').textContent(), /Safari offers only the basic voices/);
    assert.match(await page.locator('#voiceHelpTitle').textContent(), /iPad and iPhone/);
    assert.match(await page.locator('#voiceHelpSteps').textContent(), /Safari only lets websites use.*Phloem iPad app.*Read & Speak.*Voices.*English.*Jamie \(Premium\)/);
    await page.locator('#voiceHelpDialog [data-close]').click();
    console.log('PASS  basic voices only: Safari on iPad explains its limit and points to the app (' + name + ')');

    // Back from Settings with Jamie downloaded.
    await page.evaluate(() => {
      window.__voices.push({ name: 'Jamie (Premium)', lang: 'en-GB', voiceURI: 'com.apple.voice.premium.en-GB.Jamie' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => /Jamie \(Premium\) is ready for Listen/.test(document.getElementById('readerToast').textContent));
    assert.equal(await page.locator('#voiceVoice').inputValue(), 'com.apple.voice.premium.en-GB.Jamie');
    assert.equal(await page.locator('#voiceHelpBtn').isVisible(), false);
    await page.evaluate(() => window.__finish());
    await page.waitForFunction(() => window.__said.length >= 2);
    assert.equal(await page.evaluate(() => window.__said[window.__said.length - 1].voice), 'Jamie (Premium)', 'the next sentence is in the new voice');
    // A voice the reader picked is not taken away by a later download.
    await page.locator('#voiceVoice').selectOption('com.apple.voice.premium.en-GB.Jamie');
    await page.evaluate(() => { window.__voices.push({ name: 'Ava (Premium)', lang: 'en-US', voiceURI: 'com.apple.voice.premium.en-US.Ava' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#voiceVoice').inputValue(), 'com.apple.voice.premium.en-GB.Jamie');
    assert.deepEqual(errors, []);
    console.log('PASS  coming back with Jamie switches to it; a chosen natural voice is kept');

    // Android names no voice quality: the guide stays available, with Samsung's path too.
    const android = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X916B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
    await android.addInitScript(() => { window.__androidVoices = true; });
    await android.addInitScript(setup);
    await android.addInitScript(() => { window.__voices = [{ name: 'English United States', lang: 'en-US', voiceURI: 'English United States', default: true }]; });
    await android.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
    await android.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length === 3);
    await android.locator('#zenListen').click();
    await android.waitForFunction(() => window.__said.length === 1);
    assert.match(await android.locator('#voiceHelpBtn').textContent(), /Voice sounds robotic/);
    await android.locator('#voiceHelpBtn').click();
    assert.match(await android.locator('#voiceHelpTitle').textContent(), /Android/);
    assert.match(await android.locator('#voiceHelpSteps').textContent(), /Samsung Galaxy.*General management.*Install voice data/);
    console.log('PASS  Android: the guide is always one tap away, with the Samsung path');

    // Edge on Windows: the Online (Natural) cloud voices send the text away, so Listen leaves
    // them out (no network, no AI) and points to the voices Windows installs on the PC.
    const edge = await browser.newPage({ viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0' });
    await edge.addInitScript(setup);
    await edge.addInitScript(() => {
      const voice = (name, local, isDefault) => ({ name: `Microsoft ${name} - English (United States)`, lang: 'en-US', voiceURI: `Microsoft ${name} - English (United States)`, localService: local, default: !!isDefault });
      window.__voices = [voice('David', true, true), voice('Zira', true), voice('Aria Online (Natural)', false), voice('Jenny Online (Natural)', false),
        { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English', localService: false, default: false }];
      // A voice chosen before v226 that is now hidden.
      localStorage.setItem('readingRoom.voice.v1', JSON.stringify({ voice: 'Microsoft Aria Online (Natural) - English (United States)', rate: 1 }));
    });
    await edge.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
    await edge.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length === 3);
    await edge.locator('#zenListen').click();
    await edge.waitForFunction(() => window.__said.length === 1);
    assert.deepEqual(await edge.locator('#voiceVoice option').allTextContents(), ['Microsoft David - English (United States)', 'Microsoft Zira - English (United States)']);
    assert.equal(await edge.evaluate(() => window.__said[0].voice), 'Microsoft David - English (United States)', 'a saved Online voice falls back to one on the PC');
    assert.equal(await edge.locator('#voiceHelpBtn').isVisible(), true, 'only basic voices left: the guide is offered');
    await edge.locator('#voiceHelpBtn').click();
    assert.match(await edge.locator('#voiceHelpSteps').textContent(), /Time & language, then Speech.*Manage voices/);
    assert.doesNotMatch(await edge.locator('#voiceHelpSteps').textContent(), /\bEdge\b|Online/);
    console.log('PASS  Edge: Online (Natural) and Google voices are left out; the guide points to voices on the PC');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
