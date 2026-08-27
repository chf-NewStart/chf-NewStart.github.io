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
  check('guide default dimness is 55%', await localPage.locator('#guideDimRange').inputValue() === '55');
  if (await localPage.locator('#notebookReopen').isVisible()) await localPage.click('#notebookReopen');
  await localPage.click('[data-tab="aiPanel"]');
  await localPage.click('#aiUseCurrent');
  await localPage.fill('#aiQuestion', 'What happens to light energy?');
  await localPage.click('#aiAskBtn');
  await localPage.waitForFunction(() => document.getElementById('qaList').textContent.includes('Local Gemini answer'));
  check('automatic provider uses on-device Gemini', await localPage.locator('#qaList').textContent().then(text => text.includes('Local Gemini answer')));
  check('on-device provider is recorded', await localPage.locator('#aiStatus').textContent().then(text => text.includes('Gemini Nano')));
  check('on-device flow has no page errors', localErrors.length === 0, localErrors.join('; '));
  await localContext.close();

  const deepSeekContext = await browser.newContext();
  const deepSeekPage = await deepSeekContext.newPage();
  let requestBody = null;
  let authorization = '';
  await deepSeekPage.route('https://api.deepseek.com/**', async route => {
    requestBody = route.request().postDataJSON();
    authorization = route.request().headers().authorization || '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '• DeepSeek answer' } }] }) });
  });
  await deepSeekPage.addInitScript(() => {
    const ch = {
      id: 'ch_ai_test', kind: 'text', title: 'AI provider test', authors: 'Tester',
      fr: 'Photosynthesis converts light energy into chemical energy in plant cells.',
      textHighlights: [], highlights: {}, readerHighlights: [], notes: {}, readerNotes: {},
      pageNotes: {}, questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: [], at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [ch] }));
    localStorage.setItem('readingRoom.lastOpen.v1', ch.id);
    localStorage.setItem('readingRoom.ai.v1', 'legacy-test-key');
  });
  await deepSeekPage.goto('http://localhost:8125/reading.html', { waitUntil: 'load' });
  await deepSeekPage.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  if (await deepSeekPage.locator('#notebookReopen').isVisible()) await deepSeekPage.click('#notebookReopen');
  await deepSeekPage.click('[data-tab="aiPanel"]');
  await deepSeekPage.click('#aiUseCurrent');
  await deepSeekPage.fill('#aiQuestion', 'Summarize this.');
  await deepSeekPage.click('#aiAskBtn');
  await deepSeekPage.waitForFunction(() => document.getElementById('qaList').textContent.includes('DeepSeek answer'));
  check('legacy key migrates to DeepSeek', authorization === 'Bearer legacy-test-key', authorization);
  check('DeepSeek uses current default model', requestBody && requestBody.model === 'deepseek-v4-flash', requestBody && requestBody.model);
  check('thread history reaches provider', requestBody && requestBody.messages && requestBody.messages.some(message => message.role === 'user' && message.content.includes('Summarize this.')));
  await deepSeekPage.click('#settingsBtn');
  check('migrated provider appears in settings', await deepSeekPage.locator('#aiProvider').inputValue() === 'deepseek');
  check('editable model appears in settings', await deepSeekPage.locator('#aiModel').inputValue() === 'deepseek-v4-flash');
  await deepSeekContext.close();

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
  await setupSourcePage.click('#settingsBtn');
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
  await setupTargetPage.click('#settingsBtn');
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
