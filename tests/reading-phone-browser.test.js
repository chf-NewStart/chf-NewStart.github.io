/* Phone layout (Houfu, Oct 2026: listening and looking things up come first on a phone;
   notes are hard there). A window at most 600px wide that is not an iPad gets one bottom
   bar (Library, Look up, Listen, Find, More), a Look up card that takes a typed term or a
   tapped word, a four-button selection card, and denser text.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PARAS = ['INTRODUCTION', 'Angiosperms move sugar from source leaves to sink organs through the phloem [3].',
  'Quantifying the joint impact of sink strength and phloem loading on carbon export to sinks requires a model that couples both.',
  'RESULTS', 'Export rose with sink demand until loading capacity limited it.'];
const SENSES = { angiosperms: 'Any flowering plant of the clade Angiospermae.', phloem: 'The vascular tissue that carries sugars from leaves.' };

async function open(browser, options) {
  const context = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', userAgent: IPHONE }, options));
  const looked = [];
  await context.route(/wiktionary\.org/, route => { const word = decodeURIComponent(route.request().url().split('/definition/')[1] || '').toLowerCase(); looked.push(word);
    const sense = SENSES[word]; return sense ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: sense }] }] }) })
      : route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }); });
  await context.route(/wikipedia\.org|wikimedia\.org/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"query":{"pages":[]}}' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(paras => {
    if (localStorage.getItem('readingRoom.v1')) return; const stamp = Date.now();
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{ id: 'phone-paper', kind: 'text', title: 'Phone fixture', fr: paras.join('\n\n'), notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }], deleted: {}, merged: {}, savedAt: stamp }));
    localStorage.setItem('readingRoom.lastOpen.v1', 'phone-paper');
    window.__said = []; class Utterance { constructor(text) { this.text = text; } }
    const synth = { speaking: false, getVoices: () => [{ name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', default: true }], addEventListener() {}, cancel() { this.speaking = false; }, speak(u) { window.__said.push(u.text); this.speaking = true; } };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true }); window.SpeechSynthesisUtterance = Utterance;
  }, PARAS);
  await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
  await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length === 5 && !document.getElementById('readerPage').classList.contains('hidden'));
  return { context, page, errors, looked };
}
const visibleBar = page => page.evaluate(() => [...document.querySelectorAll('#zenDock > *')].filter(el => el.offsetParent && el.getBoundingClientRect().width > 0)
  .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(el => (el.querySelector('#zenMore') || el).dataset.phoneLabel || el.id));
async function wordPoint(page, word) {
  return page.evaluate(word => { const o = [...document.querySelectorAll('#textDocument .original')].find(n => n.textContent.includes(word)); const at = o.firstChild.textContent.indexOf(word);
    const r = document.createRange(); r.setStart(o.firstChild, at + 1); r.setEnd(o.firstChild, at + 2); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, word);
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch();
  try {
    let { context, page, errors, looked } = await open(browser);
    assert.equal(await page.evaluate(() => document.body.classList.contains('phone-ui')), true);
    assert.deepEqual(await visibleBar(page), ['Library', 'Look up', 'Listen', 'Find', 'More'], 'one bar, no pens, Undo or Workspace');
    const geometry = await page.evaluate(() => ({ reader: document.getElementById('readerPage').getBoundingClientRect().bottom, bar: document.getElementById('zenDock').getBoundingClientRect().top,
      padding: getComputedStyle(document.getElementById('textDocument')).paddingLeft }));
    assert.ok(geometry.reader <= geometry.bar + 1, 'the paper ends above the bar');
    assert.equal(geometry.padding, '18px');
    console.log('PASS  phone bar: Library, Look up, Listen, Find, More; the paper ends above it (' + name + ')');

    // Look up: a typed term, then a tapped word, in one card.
    await page.locator('#zenPhoneLookup').click();
    await page.locator('#lookupSearchInput').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#zenPhoneLookup').getAttribute('aria-expanded'), 'true');
    await page.locator('#lookupSearchInput').fill('phloem'); await page.locator('#lookupSearchInput').press('Enter');
    await page.waitForFunction(() => /carries sugars/.test(document.getElementById('lookupDefinition').textContent));
    const point = await wordPoint(page, 'Angiosperms');
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => /Angiospermae/.test(document.getElementById('lookupDefinition').textContent));
    assert.equal(await page.locator('#lookupSearchInput').inputValue(), 'Angiosperms');
    assert.deepEqual(looked.filter(w => w === 'phloem' || w === 'angiosperms'), ['phloem', 'angiosperms']);
    await page.locator('#lookupClose').click();
    assert.equal(await page.evaluate(() => document.getElementById('lookupCard').parentElement.id), 'selectionCard', 'the card goes back into the selection card');
    assert.equal(await page.evaluate(() => document.body.classList.contains('lookup-tapping')), false);
    console.log('PASS  Look up: typed term and tapped word; closing puts the card back');

    // Selection: four buttons, the rest behind More.
    await page.evaluate(() => { const o = [...document.querySelectorAll('#textDocument .original')].find(n => n.textContent.includes('Quantifying'));
      const b = o.getBoundingClientRect(); o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: b.left + 3, clientY: b.top + 8 }));
      const r = document.createRange(); r.setStart(o.firstChild, 0); r.setEnd(o.firstChild, 11); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange'));
      o.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: b.left + 30, clientY: b.top + 8 })); });
    await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
    const shown = () => page.evaluate(() => ['selectionPhoneRow', 'selectionHighlight', 'selectionAddNote', 'selectionMeaning', 'selectionToWorkspace', 'selectionCreateHighlight'].filter(id => document.getElementById(id).offsetParent));
    assert.deepEqual(await shown(), ['selectionPhoneRow']);
    assert.deepEqual(await page.locator('#selectionPhoneRow button span').allTextContents(), ['Define', 'Highlight', 'Copy', 'More']);
    await page.locator('#selectionPhoneMore').click();
    assert.deepEqual(await shown(), ['selectionPhoneRow', 'selectionAddNote', 'selectionMeaning', 'selectionCreateHighlight'], 'More shows note, explain and colours; no Workspace');
    assert.equal(await page.locator('#selectionPhoneMore').getAttribute('aria-expanded'), 'true');
    await page.locator('#selectionPhoneRow [data-phone-proxy="selectionHighlight"]').click();
    await page.waitForFunction(() => document.querySelector('#textDocument mark, #textDocument [data-hl-id]'));
    await page.evaluate(() => document.getElementById('selectionClose').click());
    console.log('PASS  selection card: Define, Highlight, Copy, More');

    // Listen from the bar; More holds the reading guide.
    await page.locator('#zenPhoneListen').click();
    await page.waitForFunction(() => window.__said.length > 0);
    assert.equal(await page.locator('#zenPhoneListen').getAttribute('aria-pressed'), 'true');
    const voiceBar = await page.evaluate(() => [document.getElementById('voiceBar').getBoundingClientRect().bottom, document.getElementById('zenDock').getBoundingClientRect().top]);
    assert.ok(voiceBar[0] <= voiceBar[1], 'the player sits above the bar');
    await page.locator('#voiceClose').click();
    await page.locator('#zenMore').click();
    assert.equal(await page.locator('#zenPhoneGuide').isVisible(), true);
    assert.equal(await page.locator('#zenListen').isVisible(), false, 'Listen is on the bar, not in More');
    await page.locator('#zenPhoneGuide').click();
    await page.locator('#zenGuideMenu').waitFor({ state: 'visible' });
    const guide = await page.evaluate(() => [document.getElementById('zenGuideMenu').getBoundingClientRect().bottom, document.getElementById('zenDock').getBoundingClientRect().top]);
    assert.ok(guide[0] <= guide[1], 'menus open above the bar');
    assert.deepEqual(errors, []); await context.close();
    console.log('PASS  Listen on the bar; More opens the guide above it');

    // An iPad keeps its side rail at any width; so does a wide window.
    for (const options of [{ userAgent: IPAD }, { viewport: { width: 1180, height: 820 }, userAgent: undefined, hasTouch: false }]) {
      ({ context, page, errors } = await open(browser, options));
      assert.equal(await page.evaluate(() => document.body.classList.contains('phone-ui')), false);
      assert.equal(await page.locator('#zenPhoneLookup').isVisible(), false);
      assert.equal(await page.locator('#zenUndo').isVisible(), true);
      assert.deepEqual(errors, []); await context.close();
    }
    console.log('PASS  iPad and desktop keep the side rail');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
