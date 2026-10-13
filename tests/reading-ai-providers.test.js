let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
// Zen is the only reader (73f8b633, 1a215db5): the Notebook opens from More,
// and Desk settings live on the library masthead behind the reader's X.
async function openZenNotebook(page) {
  await page.locator('#zenMore').click();
  await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
  await page.locator('#zenNotebook').click();
  await page.locator('#notebook').waitFor({ state: 'visible' });
}
async function openDeskSettings(page) {
  if (await page.locator('#readerPage').isVisible()) {
    if (await page.locator('#notebook').isVisible()) await page.locator('#sheetClose').click();
    await page.locator('#zenExit').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
  }
  await page.locator('#settingsBtn').click();
  await page.locator('#settingsDialog').waitFor({ state: 'visible' });
}
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}
(async () => {
  await new Promise(resolve => server.listen(8125, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);

  const localContext = await browser.newContext();
  const localPage = await localContext.newPage();
  const localErrors = [];
  localPage.on('pageerror', error => localErrors.push(error.message));
  await localPage.addInitScript(() => {
    const ch = {
      id: 'ch_ai_test', kind: 'text', title: 'AI provider test', authors: 'Tester',
      fr: 'Photosynthesis converts light energy into chemical energy in plant cells.',
      textHighlights: [], highlights: {}, readerHighlights: [], notes: {}, readerNotes: {},
      pageNotes: {}, questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: [], at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [ch] }));
    localStorage.setItem('readingRoom.lastOpen.v1', ch.id);
    window.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({ prompt: async () => '• Local Gemini answer', destroy() {} })
    };
  });
  await localPage.goto('http://localhost:8125/reading.html', { waitUntil: 'load' });
  await localPage.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  check('guide default dimness is 85%', await localPage.locator('#guideDimRange').inputValue() === '85');
  await openZenNotebook(localPage);
  await localPage.click('[data-tab="aiPanel"]');
  await localPage.click('#aiUseCurrent');
  await localPage.fill('#aiQuestion', 'What happens to light energy?');
  await localPage.click('#aiAskBtn');
  await localPage.waitForFunction(() => document.getElementById('qaList').textContent.includes('Local Gemini answer'));
  check('automatic provider uses on-device Gemini', await localPage.locator('#qaList').textContent().then(text => text.includes('Local Gemini answer')));
  check('on-device provider is recorded', await localPage.locator('#aiStatus').textContent().then(text => text.includes('Gemini Nano')));
  check('on-device flow has no page errors', localErrors.length === 0, localErrors.join('; '));
  await localContext.close();

  /* DeepSeek left Phloem (Oct 2026; Waterloo IST lists it as not approved for University
     data). A reader who had it set up, through the old single-key slot or the provider
     settings, never sends it another request: the keys are deleted, the reader falls back
     to the private on-device mode, and a plain notice says so once. */
  const deepSeekContext = await browser.newContext();
  const deepSeekPage = await deepSeekContext.newPage();
  const deepSeekErrors = [];
  deepSeekPage.on('pageerror', error => deepSeekErrors.push(error.message));
  let deepSeekRequests = 0;
  await deepSeekPage.route(/deepseek\.com/, route => { deepSeekRequests++; return route.abort(); });
  await deepSeekPage.addInitScript(() => {
    if (localStorage.getItem('deepseek.fixture')) return;
    localStorage.setItem('deepseek.fixture', '1');
    const ch = {
      id: 'ch_ai_test', kind: 'text', title: 'AI provider test', authors: 'Tester',
      fr: 'Photosynthesis converts light energy into chemical energy in plant cells.',
      textHighlights: [], highlights: {}, readerHighlights: [], notes: {}, readerNotes: {},
      pageNotes: {}, questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: [], at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [ch] }));
    localStorage.setItem('readingRoom.lastOpen.v1', ch.id);
    localStorage.setItem('readingRoom.ai.v1', 'legacy-test-key');
    localStorage.setItem('readingRoom.ai.providers.v1', JSON.stringify({ provider: 'deepseek', providers: {
      deepseek: { key: 'saved-deepseek-key', model: 'deepseek-flash', endpoint: '' },
      openai: { key: '', model: 'gpt-5-mini', endpoint: '' } } }));
  });
  await deepSeekPage.goto('http://localhost:8125/reading.html', { waitUntil: 'load' });
  await deepSeekPage.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  await deepSeekPage.waitForFunction(() => document.getElementById('errorDialog').open, null, { timeout: 5000 }).catch(() => {});
  check('a reader who used DeepSeek is told once that it was removed', await deepSeekPage.locator('#errorTitle').textContent() === 'DeepSeek support was removed' &&
    await deepSeekPage.evaluate(() => document.getElementById('errorDialog').open));
  await deepSeekPage.click('[data-close="errorDialog"]');
  const retired = await deepSeekPage.evaluate(() => ({ legacy: localStorage.getItem('readingRoom.ai.v1'), saved: JSON.parse(localStorage.getItem('readingRoom.ai.providers.v1')) }));
  check('the old single DeepSeek key is deleted', retired.legacy === null);
  check('the saved DeepSeek key and provider are deleted', !('deepseek' in retired.saved.providers) && retired.saved.provider === 'auto' && !JSON.stringify(retired.saved).includes('deepseek-key'), JSON.stringify(retired.saved));
  await openZenNotebook(deepSeekPage);
  await deepSeekPage.click('[data-tab="aiPanel"]');
  await deepSeekPage.click('#aiUseCurrent');
  await deepSeekPage.fill('#aiQuestion', 'Summarize this.');
  await deepSeekPage.click('#aiAskBtn');
  await deepSeekPage.waitForTimeout(800);
  check('asking AI afterwards sends nothing to DeepSeek', deepSeekRequests === 0);
  await openDeskSettings(deepSeekPage);
  check('settings fall back to the private on-device mode', await deepSeekPage.locator('#aiProvider').inputValue() === 'auto');
  check('DeepSeek is no longer offered', !(await deepSeekPage.locator('#aiProvider option').evaluateAll(options => options.map(option => option.value))).includes('deepseek'));
  check('AI settings say cloud AI is optional and off until chosen, and warn about university material',
    /Cloud AI stays off until you choose a provider/.test(await deepSeekPage.locator('#aiDataNote').textContent()) &&
    /unpublished, confidential or restricted university material/.test(await deepSeekPage.locator('#aiDataNote').textContent()) &&
    /keeps the text on this device/.test(await deepSeekPage.locator('#aiDataNote').textContent()));
  await deepSeekPage.reload({ waitUntil: 'load' });
  await deepSeekPage.waitForTimeout(1300);
  check('the notice does not come back', !(await deepSeekPage.evaluate(() => document.getElementById('errorDialog').open)) && deepSeekRequests === 0);
  check('DeepSeek removal has no page errors', deepSeekErrors.length === 0, deepSeekErrors.join('; '));
  await deepSeekContext.close();

  // A new reader never sees the DeepSeek notice.
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto('http://localhost:8125/reading.html', { waitUntil: 'load' });
  await freshPage.waitForTimeout(1300);
  check('a new reader is not shown the DeepSeek notice', !(await freshPage.evaluate(() => document.getElementById('errorDialog').open && document.getElementById('errorTitle').textContent === 'DeepSeek support was removed')));
  await freshContext.close();

  const setupSourceContext = await browser.newContext();
  const setupSourcePage = await setupSourceContext.newPage();
  await setupSourcePage.addInitScript(() => {
    localStorage.setItem('readingRoom.ai.providers.v1', JSON.stringify({
      provider: 'openai',
      providers: { openai: { key: 'setup-transfer-test-key', model: 'gpt-5-mini', endpoint: '' } }
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__deviceSetupLink = value; } }
    });
  });
  await setupSourcePage.goto('http://localhost:8125/reading.html', { waitUntil: 'load' });
  await openDeskSettings(setupSourcePage);
  check('device setup link works without GitHub sync', await setupSourcePage.locator('#syncLinkBtn').isVisible());
  await setupSourcePage.click('#syncLinkBtn');
  const setupLink = await setupSourcePage.evaluate(() => window.__deviceSetupLink || '');
  check('device setup link is copied', setupLink.includes('#phloem-setup='));
  await setupSourceContext.close();

  const setupTargetContext = await browser.newContext();
  const setupTargetPage = await setupTargetContext.newPage();
  await setupTargetPage.addInitScript(() => { window.confirm = () => true; });
  await setupTargetPage.goto(setupLink, { waitUntil: 'load' });
  const importedAi = await setupTargetPage.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.ai.providers.v1') || 'null'));
  check('device setup imports selected AI provider', importedAi && importedAi.provider === 'openai', importedAi && importedAi.provider);
  check('device setup imports AI key', importedAi && importedAi.providers.openai.key === 'setup-transfer-test-key');
  check('device setup does not invent GitHub sync', await setupTargetPage.evaluate(() => localStorage.getItem('readingRoom.sync.v1') === null));
  await openDeskSettings(setupTargetPage);
  check('imported AI key appears ready in settings', await setupTargetPage.locator('#aiKeyStatus').textContent().then(text => text.includes('Ready to use OpenAI')));
  await setupTargetContext.close();

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
