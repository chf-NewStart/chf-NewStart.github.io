/* Listen, Copy and "What does this mean?" in the reader. Speech uses a stand-in voice
   engine that records each sentence; the AI answer comes from a local stub.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });

const PARAGRAPHS = ['INTRODUCTION', 'Sinks pull sugar from leaves [3].', 'Figure 1. A leaf diagram.',
  'Quantifying the joint impact of sink strength and phloem loading on carbon export to sinks requires a model that couples both.',
  'RESULTS', 'Second paragraph here.', 'REFERENCES', '[1] Smith, A. (2020). A paper.'];

function seed() {
  if (localStorage.getItem('readingRoom.v1')) return;
  const stamp = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{ id: 'voice-paper', kind: 'text', title: 'Voice fixture', fr: window.__PARAS.join('\n\n'),
    notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }], deleted: {}, merged: {}, savedAt: stamp }));
  localStorage.setItem('readingRoom.lastOpen.v1', 'voice-paper');
  localStorage.setItem('readingRoom.ai.providers.v1', JSON.stringify({ provider: 'anthropic', providers: { anthropic: { key: 'test-key', model: 'claude-sonnet-4-6' } } }));
}
function fakeSpeech() {
  window.__said = [];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = { speaking: false, pending: false, current: null,
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', default: true }, { name: 'Jamie (Premium)', lang: 'en-GB', voiceURI: 'jamie' }],
    addEventListener() {}, cancel() { this.speaking = false; },
    speak(u) { if (u.text.trim()) { window.__said.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate }); this.current = u; this.speaking = true; } } };
  window.__finish = () => { const u = synth.current; synth.current = null; synth.speaking = false; if (u && u.onend) u.onend(); };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
}
async function select(page, text) {
  await page.evaluate(text => {
    const original = Array.from(document.querySelectorAll('#textDocument .original')).find(node => node.textContent.includes(text));
    const node = original.firstChild, at = node.textContent.indexOf(text), rect = original.getBoundingClientRect();
    original.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', pointerId: 2, isPrimary: true, button: 0, buttons: 1, clientX: rect.left + 3, clientY: rect.top + 8 }));
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + text.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    original.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 2, isPrimary: true, button: 0, buttons: 0, clientX: rect.left + 40, clientY: rect.top + 8 }));
  }, text);
  await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    if (name === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const asked = [];
    await context.route(/^https:\/\/api\.anthropic\.com\//, async route => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const body = JSON.parse(route.request().postData() || '{}'); asked.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ content: [{ type: 'text', text: 'It means the model must **link** how strongly fruit pull sugar with how fast leaves load it.' }] }) });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(paras => { window.__PARAS = paras; }, PARAGRAPHS);
    await page.addInitScript(seed);
    await page.addInitScript(fakeSpeech);
    await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length === 8);

    // Listen reads the paper's own words, skipping the caption and the reference list.
    await page.locator('#zenListen').click();
    await page.waitForFunction(() => window.__said.length === 1);
    let said = await page.evaluate(() => window.__said.map(s => s.text));
    assert.deepEqual(said, ['INTRODUCTION']);
    assert.equal(await page.evaluate(() => window.__said[0].voice), 'Jamie (Premium)', 'Jamie is chosen when the device has it');
    assert.equal(await page.locator('#voiceVoice').inputValue(), 'jamie');
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__finish()); await page.waitForTimeout(450); }
    said = await page.evaluate(() => window.__said.map(s => s.text));
    assert.deepEqual(said, ['INTRODUCTION', 'Sinks pull sugar from leaves.', 'Quantifying the joint impact of sink strength and phloem loading on carbon export to sinks requires a model that couples both.', 'RESULTS', 'Second paragraph here.']);
    assert.equal(await page.evaluate(() => document.querySelector('#textDocument .para.voice-reading')?.textContent.includes('Second paragraph')), true, 'the paragraph being read is marked');
    assert.match(await page.locator('#voiceLine').textContent(), /Second paragraph here/);
    await page.evaluate(() => window.__finish());
    await page.waitForFunction(() => /Finished/.test(document.getElementById('voiceLine').textContent));
    console.log('PASS  Listen reads the text, skips the caption and references, and marks the paragraph (' + name + ')');

    // Speed and voice choices are remembered; play restarts after the end.
    // 1× sits in the middle of the slider (log scale, 0.5× to 2×), and the ends are 0.5× and 2×.
    assert.equal(await page.locator('#voiceRate').inputValue(), '0');
    await page.locator('#voiceRate').fill('-1');
    assert.equal(await page.locator('#voiceRateValue').textContent(), '0.5×');
    await page.locator('#voiceRate').fill('0.03');
    assert.equal(await page.locator('#voiceRateValue').textContent(), '1×', 'settles on 1× near the middle');
    await page.locator('#voiceRate').fill('0.2');
    await page.waitForTimeout(450);
    await page.locator('#voiceVoice').selectOption('samantha');
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.voice.v1')));
    assert.deepEqual(prefs, { voice: 'samantha', rate: 1.15 });
    await page.locator('#voicePlay').click();
    await page.waitForFunction(() => window.__said.length === 6);
    assert.deepEqual(await page.evaluate(() => [window.__said[5].text, window.__said[5].voice, window.__said[5].rate]), ['INTRODUCTION', 'Samantha', 1.15]);
    console.log('PASS  speed and voice are kept');

    // Read from a section, or from any paragraph tapped while listening.
    const lastSaid = () => page.evaluate(() => window.__said[window.__said.length - 1].text);
    // The speed slider has room to be dragged (Houfu: "the speed slide bar is so short").
    assert.ok((await page.locator('#voiceRate').boundingBox()).width >= 150, 'speed slider is wide enough');
    // A tap on the read-from pin lists the sections.
    await page.locator('#voiceFrom').click();
    assert.equal(await page.locator('#voiceFrom').getAttribute('aria-expanded'), 'true');
    const sections = await page.locator('#voiceFromMenu [role=menuitem]').allTextContents();
    assert.deepEqual(sections, ['INTRODUCTION', 'RESULTS']);
    await page.locator('#voiceFromMenu [role=menuitem]', { hasText: 'RESULTS' }).click();
    await page.waitForFunction(() => window.__said[window.__said.length - 1].text === 'RESULTS');
    assert.equal(await page.locator('#voiceFromMenu').isHidden(), true);
    // Dragging the pin onto a line marks it on the way and reads from it on release.
    const arrow = await page.locator('#voiceFrom').boundingBox();
    const target = await page.locator('#textDocument .para', { hasText: 'Second paragraph here' }).boundingBox();
    await page.mouse.move(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x - 12, target.y + target.height / 2, { steps: 12 });
    await page.waitForFunction(() => /Second paragraph here/.test((document.querySelector('#textDocument .para.voice-drop-target') || {}).textContent || ''));
    assert.equal(await page.locator('.voice-drop-target').count(), 1);
    assert.equal(await page.locator('#voiceDrop').isVisible(), true);
    await page.mouse.up();
    await page.waitForFunction(() => window.__said[window.__said.length - 1].text === 'Second paragraph here.');
    assert.equal(await page.locator('#voiceDrop').isHidden(), true);
    assert.equal(await page.locator('.voice-drop-target').count(), 0);
    assert.equal(await page.locator('#voiceFromMenu').isHidden(), true, 'a drag does not open the section list');
    // Let go back over the bar: nothing changes.
    const before = await page.evaluate(() => window.__said.length);
    await page.mouse.move(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
    await page.mouse.down();
    await page.mouse.move(arrow.x + 60, arrow.y + arrow.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__said.length), before);
    if (name === 'chromium') {
      // A finger, as on Android Chrome: touch input, with the pin riding 44px above the finger.
      const cdp = await context.newCDPSession(page);
      const line = await page.locator('#textDocument .para', { hasText: 'Sinks pull sugar' }).boundingBox();
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const from = [arrow.x + arrow.width / 2, arrow.y + arrow.height / 2], to = [line.x + 30, line.y + line.height / 2 + 44];
      await touch('touchStart', ...from);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', from[0] + (to[0] - from[0]) * i / 12, from[1] + (to[1] - from[1]) * i / 12); await page.waitForTimeout(16); }
      await page.waitForFunction(() => /Sinks pull sugar/.test((document.querySelector('#textDocument .para.voice-drop-target') || {}).textContent || ''));
      await touch('touchEnd');
      await page.waitForFunction(() => window.__said[window.__said.length - 1].text === 'Sinks pull sugar from leaves.');
    }
    // Only the pin moves the voice (Houfu, Oct 15): a tap on another paragraph is just a tap.
    const saidBeforeTap = await page.evaluate(() => window.__said.length), sentenceBeforeTap = await lastSaid();
    await page.locator('#textDocument .para', { hasText: 'Quantifying the joint impact' }).locator('.original').click();
    await page.waitForTimeout(500);
    assert.doesNotMatch(sentenceBeforeTap, /Quantifying/);
    assert.equal(await page.evaluate(() => window.__said.length), saidBeforeTap, 'tapping the paper does not move the voice');
    assert.equal(await lastSaid(), sentenceBeforeTap);
    await page.locator('#voiceClose').click();
    assert.equal(await page.locator('#voiceBar').isHidden(), true);
    // Starting with a sentence selected reads from that sentence.
    await select(page, 'Second paragraph here');
    await page.locator('#zenListen').click();
    await page.waitForFunction(() => window.__said[window.__said.length - 1].text === 'Second paragraph here.');
    assert.equal(await lastSaid(), 'Second paragraph here.');
    await page.locator('#voiceClose').click();
    await page.evaluate(() => { getSelection().removeAllRanges(); document.getElementById('selectionClose').click(); });
    console.log('PASS  read from a section, the dragged pin (mouse and finger), or a selection; a tap on the paper does not move the voice; ✕ stops');

    // Copy puts the selected words on the clipboard.
    await select(page, 'Sinks pull sugar');
    await page.locator('#selectionCopy').click();
    await page.waitForFunction(() => /Copied|Copy was blocked/.test(document.getElementById('readerToast').textContent));
    if (name === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Sinks pull sugar');
    console.log('PASS  Copy');

    // A sentence goes to "What does this mean?", from the button or from Define.
    const sentence = 'Quantifying the joint impact of sink strength and phloem loading on carbon export to sinks requires a model that couples both.';
    await select(page, sentence);
    await page.locator('#selectionExplain').click();
    await page.waitForFunction(() => /link how strongly fruit pull sugar/.test(document.getElementById('lookupDefinition').textContent), null, { timeout: 8000 }).catch(async error => {
      console.error('lookup:', await page.evaluate(() => [document.getElementById('lookupTitle').textContent, document.getElementById('lookupDefinition').textContent, document.getElementById('lookupCard').className]), 'asked:', asked.length);
      throw error;
    });
    assert.equal(await page.locator('#lookupTitle').textContent(), 'What it means');
    assert.match(await page.locator('#lookupSource').textContent(), /explanation · verify/);
    assert.doesNotMatch(await page.locator('#lookupDefinition').textContent(), /\*\*/, 'plain text');
    const request = asked[asked.length - 1];
    assert.match(JSON.stringify(request), /Selected passage:\\n/);
    assert.match(JSON.stringify(request), /Quantifying the joint impact/);
    await page.locator('#lookupClose').click();
    await select(page, 'Sinks pull sugar from leaves');
    await page.locator('#selectionMeaning').click();
    await page.waitForFunction(() => document.getElementById('lookupTitle').textContent === 'What it means' && /link how strongly/.test(document.getElementById('lookupDefinition').textContent));
    assert.equal(asked.length, 2);
    console.log('PASS  What does this mean? (button, and Define on a sentence)');

    // Leaving the paper stops reading aloud.
    await page.locator('#lookupClose').click();
    await page.locator('#zenListen').click();
    await page.waitForFunction(() => !document.getElementById('voiceBar').classList.contains('hidden'));
    await page.locator('#zenExit').click();
    assert.equal(await page.locator('#voiceBar').isHidden(), true);
    assert.deepEqual(errors, []);
    console.log('PASS  leaving the paper stops Listen');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
