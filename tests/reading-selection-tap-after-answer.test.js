/* A tap on a selection tile while a definition or an answer is open (Nov 2026). The answer
   closed on pointer-down, the shorter card was placed again under the finger, and the tap
   landed elsewhere: Copy, Save to Clips, To workspace, Park question, Highlight, a colour,
   Add note and the phone row's buttons did nothing. The answer now closes once the tap has
   landed, so the tile acts and the answer still goes away as before.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
    res.end(data);
  });
});
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) + ']' : ''));
  if (!ok) failures++;
}

const PARAS = ['Phloem loading in tomato source leaves sets how much sucrose reaches the fruit, and so how sweet the fruit becomes.',
  'We fitted a dynamic flux balance model to diurnal leaf export measured by carbon labelling, with starch as an explicit flux.',
  'The model predicted that starch turnover at night buffers export to the sinks when the photoperiod shortens.',
  'Leaf area index varied little between the cultivars we compared in the two seasons of the trial.',
  'Fruit sugar tracked the export measured at dawn more closely than the export measured at dusk.',
  'Sink strength rose with fruit load, and export followed it until the loading capacity of the leaf was reached.'];
function seed(paras) {
  if (localStorage.getItem('readingRoom.v1')) return;
  const stamp = Date.now();
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [{ id: 'tap-paper', kind: 'text', title: 'Taps after an answer', fr: paras.join('\n\n'), notes: {}, pageNotes: {}, tags: [], questions: [], textHighlights: [], addedAt: stamp, updatedAt: stamp }], deleted: {}, merged: {}, savedAt: stamp }));
  localStorage.setItem('readingRoom.lastOpen.v1', 'tap-paper');
  // "What does it mean?" answers on this device, scripted, so no network is needed.
  window.LanguageModel = { availability: async () => 'available', create: async () => ({ prompt: async () => 'In plain words, the passage says something specific about export.', destroy() {} }) };
  const clip = { writeText: async text => { window.__copied = text; } };
  try { Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true }); } catch (e) {}
}
async function select(page, index, touch) {
  await page.evaluate(({ index, touch }) => {
    const node = document.querySelectorAll('#textDocument .original')[index], box = node.getBoundingClientRect(), type = touch ? 'touch' : 'mouse';
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: type, clientX: box.left + 3, clientY: box.top + 8 }));
    const range = document.createRange(); range.setStart(node.firstChild, 0); range.setEnd(node.firstChild, 40);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: type, clientX: box.left + 30, clientY: box.top + 8 }));
  }, { index, touch });
  await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
}
// Select a passage and open "What does it mean?", so the answer fills the lower card.
async function answerOpen(page, index, touch) {
  await select(page, index, touch);
  if (touch && !(await page.locator('#selectionMeaning').isVisible())) await page.click('#selectionPhoneMore');
  await page.click('#selectionMeaning');
  await page.waitForFunction(() => /something specific about export/.test(document.getElementById('lookupDefinition').textContent));
  return page.evaluate(() => document.getElementById('selectionCard').getBoundingClientRect().top);
}
const saved = page => page.evaluate(() => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]; return { highlights: (ch.textHighlights || []).map(h => h.color), clips: (ch.readingExcerpts || { items: [] }).items.length }; });
const answerClosed = page => page.evaluate(() => document.getElementById('lookupCard').classList.contains('hidden'));
async function closeSheets(page) {
  if (await page.locator('#sheetClose').isVisible()) await page.click('#sheetClose');
  if (await page.locator('#workspacePanel').isVisible() && await page.locator('#zenWorkspace').isVisible()) await page.click('#zenWorkspace');
  if (await page.locator('#selectionClose').isVisible()) await page.click('#selectionClose');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await playwright[ENGINE].launch({ headless: true });
  try {
    /* A laptop: each tile acts on the first press while an answer is open. */
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seed, PARAS);
      await page.goto(origin + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('#textDocument .original').length === 6 && !document.getElementById('readerPage').classList.contains('hidden'));

      const top = await answerOpen(page, 3);
      await page.click('#selectionCopy');
      await page.waitForTimeout(150);
      const copied = await page.evaluate(() => window.__copied || '');
      check('Copy copies on the first press while an answer is open', copied.startsWith('Leaf area index') && /Copied/.test(await page.locator('#readerToast').textContent()), copied);
      check('and the answer then closes, as before', await answerClosed(page) && await page.locator('#selectionCard').isVisible());
      check('the card had moved when the answer opened (the case that lost taps)', top < 400, top);

      await answerOpen(page, 3);
      await page.click('#selectionAddNote');
      check('Add note opens the note on the first press', await page.locator('#selectionNoteBox').isVisible() && await answerClosed(page));
      await closeSheets(page);

      let before = await saved(page);
      await answerOpen(page, 4);
      await page.click('#selectionHighlight');
      await page.waitForTimeout(150);
      check('Highlight saves the highlight on the first press', (await saved(page)).highlights.length === before.highlights.length + 1);
      await closeSheets(page);

      before = await saved(page);
      await answerOpen(page, 5);
      await page.click('[data-selection-highlight-color="mint"]');
      await page.waitForTimeout(150);
      const colours = (await saved(page)).highlights;
      check('a colour swatch highlights in that colour on the first press', colours.length === before.highlights.length + 1 && colours.includes('mint'), colours);
      await closeSheets(page);

      before = await saved(page);
      await answerOpen(page, 1);
      await page.click('#selectionSaveExcerpt');
      await page.waitForTimeout(200);
      check('Save to Clips saves the clip on the first press', (await saved(page)).clips === before.clips + 1);
      await closeSheets(page);

      before = await saved(page);
      await answerOpen(page, 2);
      await page.click('#selectionToWorkspace');
      await page.waitForTimeout(250);
      check('To workspace places the passage on the first press', (await saved(page)).clips === before.clips + 1 && await page.locator('#workspacePanel').isVisible());
      await closeSheets(page);

      await answerOpen(page, 0);
      await page.click('#selectionParkQuestion');
      await page.waitForTimeout(150);
      check('Park question opens its dialog on the first press', await page.evaluate(() => document.getElementById('readingKeepDialog').open));
      if (await page.evaluate(() => document.getElementById('readingKeepDialog').open)) await page.click('#cancelReadingKeep');

      await answerOpen(page, 0);
      await page.click('#lookupClose');
      check('the answer\'s own × still closes only the answer', await answerClosed(page) && await page.locator('#selectionCard').isVisible());
      await page.click('#selectionClose');
      check('a tap outside the card still closes the card and the answer at once', await page.locator('#selectionCard').isHidden() && await answerClosed(page));
      check('no page errors on a laptop', errors.length === 0, errors.join('; '));
      await context.close();
    }

    /* A phone: the bottom sheet shrinks when the answer closes, so its buttons moved too. */
    {
      const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPHONE, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seed, PARAS);
      await page.goto(origin + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('phone-ui') && document.querySelectorAll('#textDocument .original').length === 6);

      await answerOpen(page, 3, true);
      await page.click('#selectionPhoneRow [data-phone-proxy="selectionCopy"]');
      await page.waitForTimeout(150);
      check('the phone row\'s Copy copies on the first tap while an answer is open', (await page.evaluate(() => window.__copied || '')).startsWith('Leaf area index') && await answerClosed(page));
      await closeSheets(page);

      const before = await saved(page);
      await answerOpen(page, 4, true);
      await page.click('#selectionPhoneRow [data-phone-proxy="selectionHighlight"]');
      await page.waitForTimeout(150);
      check('the phone row\'s Highlight saves on the first tap', (await saved(page)).highlights.length === before.highlights.length + 1);
      await closeSheets(page);

      await answerOpen(page, 5, true);
      const expanded = await page.locator('#selectionPhoneMore').getAttribute('aria-expanded');
      await page.click('#selectionPhoneMore');
      check('More folds on the first tap', await page.locator('#selectionPhoneMore').getAttribute('aria-expanded') !== expanded, expanded);
      check('no page errors on a phone', errors.length === 0, errors.join('; '));
      await context.close();
    }
  } catch (error) {
    console.error('FATAL', error);
    failures++;
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? failures + ' FAILED (' + ENGINE + ')' : 'All passed (' + ENGINE + ')');
  process.exit(failures ? 1 : 0);
})();
