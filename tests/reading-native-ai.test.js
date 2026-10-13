/* Exercise the shipped native HTML/JS adapter with a mocked Keychain bridge.
   No real credentials or paid provider requests are used by this test. */
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
let browser;
let server;
let checks = 0;
function check(name, actual) {
  assert.ok(actual, name);
  console.log('PASS  ' + name);
  checks++;
}

(async () => {
  const { nativeHtml, nativeReaderJs } = await import(pathToFileURL(path.join(ROOT, 'apps/ipad/scripts/build-web.mjs')).href);
  server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const relative = pathname.startsWith('/native/') ? '/apps/ipad' + pathname : pathname === '/' ? '/reading.html' : pathname;
      const file = path.join(ROOT, relative);
      let data = await fs.readFile(file);
      if (pathname === '/reading.html' || pathname === '/') data = nativeHtml(data.toString());
      if (pathname === '/reading.js') data = nativeReaderJs(data.toString());
      const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      response.writeHead(200, { 'content-type': type });
      response.end(data);
    } catch (error) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  browser = await playwright[browserName].launch(launch);
  const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
  const page = await context.newPage();
  const pageErrors = [];
  const externalRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url());
    await route.abort();
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('native.ai.fixture')) {
      localStorage.setItem('native.ai.fixture', '1');
      const chapter = {
        id: 'native_ai_paper', kind: 'text', title: 'Native provider test', authors: 'Tester',
        fr: 'Photosynthesis converts light energy into chemical energy in plant cells.',
        textHighlights: [{ id: 'saved-mark', start: 0, end: 14, quote: 'Photosynthesis', color: 'yellow', note: 'Keep my existing note.' }],
        highlights: {}, readerHighlights: [], notes: { 0: 'Keep this paragraph note.' }, readerNotes: {},
        pageNotes: {}, questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: [], at: Date.now()
      };
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter] }));
      localStorage.setItem('readingRoom.lastOpen.v1', chapter.id);
      localStorage.setItem('readingRoom.ai.providers.v1', JSON.stringify({
        provider: 'deepseek', providers: {
          deepseek: { key: 'obsolete-js-key-must-be-scrubbed', keyPresent: true, model: 'deepseek-flash', endpoint: '' },
          openai: { key: '', keyPresent: true, model: 'gpt-5-mini', endpoint: '' },
          anthropic: { key: '', keyPresent: true, model: 'claude-sonnet-4-6', endpoint: '' }
        }
      }));
      localStorage.setItem('readingRoom.ai.v1', 'obsolete-legacy-key');
      // Test-only native storage is independent of Phloem's JavaScript settings.
      // It contains presence/receipt metadata only, never real credentials.
      localStorage.setItem('native.ai.keychain.fixture', JSON.stringify({
        providers: ['deepseek', 'openai', 'anthropic'], consentedProviders: [], consentVersion: 2
      }));
    }
    window.__nativeCalls = [];
    window.__nativeFailure = '';
    window.__nativeConfigureFailure = '';
    window.__nativeConfigureHasCredential = true;
    window.__nativeStatusPending = 0;
    window.__nativeConfigureHold = false;
    window.__nativeConfigurePending = false;
    window.__nativeRemoveHold = false;
    window.__nativeRemovePending = false;
    const delayedStatus = [];
    const nativeState = () => JSON.parse(localStorage.getItem('native.ai.keychain.fixture'));
    const saveNativeState = state => localStorage.setItem('native.ai.keychain.fixture', JSON.stringify(state));
    window.__resolveNativeStatus = () => {
      localStorage.removeItem('native.ai.status.hold');
      delayedStatus.splice(0).forEach(resolve => resolve());
    };
    window.confirm = () => true;
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { PhloemAI: {
        async status() {
          window.__nativeCalls.push({ method: 'status' });
          const capturedState = nativeState();
          if (localStorage.getItem('native.ai.status.hold')) {
            window.__nativeStatusPending++;
            await new Promise(resolve => delayedStatus.push(resolve));
            window.__nativeStatusPending--;
          }
          return { ...capturedState, countryCode: 'CAN', storefrontKnown: true, cloudAIAllowed: true };
        },
        addListener(event, listener) {
          if (event === 'storefrontChanged') {
            window.__emitStorefrontChanged = listener;
          }
          return Promise.resolve({ remove() {} });
        },
        async configure(payload) {
          window.__nativeCalls.push({ method: 'configure', payload });
          if (window.__nativeConfigureFailure) throw new Error(window.__nativeConfigureFailure);
          if (!window.__nativeConfigureHasCredential) return { hasCredential: false };
          if (window.__nativeConfigureHold) {
            window.__nativeConfigurePending = true;
            await new Promise(resolve => { window.__resolveNativeConfigure = resolve; });
            window.__nativeConfigurePending = false;
          }
          const state = nativeState();
          if (!state.providers.includes(payload.provider)) state.providers.push(payload.provider);
          if (!state.consentedProviders.includes(payload.provider)) state.consentedProviders.push(payload.provider);
          state.consentVersion = payload.consentVersion;
          saveNativeState(state);
          return { hasCredential: true };
        },
        async request(payload) {
          window.__nativeCalls.push({ method: 'request', payload });
          if (window.__nativeFailure) throw new Error(window.__nativeFailure);
          return { text: 'Mock native ' + payload.provider + ' reply.', provider: payload.provider };
        },
        async removeCredential(payload) {
          window.__nativeCalls.push({ method: 'removeCredential', payload });
          if (window.__nativeRemoveHold) {
            window.__nativeRemovePending = true;
            await new Promise(resolve => { window.__resolveNativeRemove = resolve; });
            window.__nativeRemovePending = false;
          }
          const state = nativeState();
          state.providers = state.providers.filter(provider => provider !== payload.provider);
          state.consentedProviders = state.consentedProviders.filter(provider => provider !== payload.provider);
          saveNativeState(state);
          return { removed: true };
        }
      } }
    };
  });
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.ai.providers.v1')));
  const calls = () => page.evaluate(() => window.__nativeCalls);
  const configureCalls = async () => (await calls()).filter(call => call.method === 'configure');
  const savedPaper = () => page.evaluate(() => {
    const chapter = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0];
    return { id: chapter.id, title: chapter.title, fr: chapter.fr, notes: chapter.notes, textHighlights: chapter.textHighlights };
  });
  // Zen is the only reader (73f8b633, 1a215db5). Desk settings live on the library
  // masthead, reached with the reader's X; closing them returns to the same paper.
  const readerVisible = () => page.evaluate(() => !document.getElementById('readerPage').classList.contains('hidden'));
  const openSettings = async () => {
    if (await readerVisible()) {
      if (await page.locator('#notebook').isVisible()) await page.click('#sheetClose');
      await page.click('#zenExit');
      await page.locator('#libraryPage').waitFor({ state: 'visible' });
    }
    await page.click('#settingsBtn');
    await page.waitForFunction(() => document.getElementById('settingsDialog').open);
  };
  const closeSettings = async () => {
    await page.click('[data-close="settingsDialog"]');
    await page.click('[data-continue-paper="native_ai_paper"]');
    await page.waitForFunction(() => document.body.classList.contains('zen') &&
      !document.getElementById('readerPage').classList.contains('hidden'));
  };
  const openNotebook = async () => {
    if (await page.locator('#notebook').isVisible()) return;
    await page.click('#zenMore');
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    await page.click('#zenNotebook');
    await page.locator('#notebook').waitFor({ state: 'visible' });
  };
  // Settings are opened from the library, which leaves the paper (and clears its
  // last-open marker), so a reload from there lands on the library.
  const reloadApp = async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready') ||
      !document.getElementById('readerPage').classList.contains('hidden'));
  };
  const reloadWithDelayedStatus = async () => {
    await page.evaluate(() => localStorage.setItem('native.ai.status.hold', '1'));
    await reloadApp();
    await openSettings();
    await page.waitForFunction(() => window.__nativeStatusPending > 0);
  };
  const releaseDelayedStatus = async () => {
    await page.evaluate(() => window.__resolveNativeStatus());
    await page.waitForFunction(() => window.__nativeStatusPending === 0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const openAi = async () => {
    await openNotebook();
    await page.click('[data-tab="aiPanel"]');
    await page.click('#aiUseCurrent');
  };
  await page.goto(origin + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  await page.waitForFunction(() => typeof window.__emitStorefrontChanged === 'function');
  // DeepSeek was removed (Oct 2026): someone who had set it up is told once, plainly.
  await page.waitForFunction(() => document.getElementById('errorDialog').open, null, { timeout: 5000 });
  check('a one-time notice says DeepSeek support was removed', await page.locator('#errorTitle').textContent() === 'DeepSeek support was removed' &&
    /deleted/.test(await page.locator('#errorMessage').textContent()));
  await page.click('[data-close="errorDialog"]');
  const originalPaper = await savedPaper();
  await page.evaluate(() => window.__emitStorefrontChanged({ countryCode: 'CHN', storefrontKnown: true, cloudAIAllowed: false }));
  await page.waitForFunction(() => document.documentElement.classList.contains('phloem-ai-region-restricted'));
  // The Discuss tab lives in the Zen Notebook; inspect it there before leaving for settings.
  await openNotebook();
  const chinaReader = {
    readerVisible: await page.locator('#readerPage').isVisible(),
    notesTabVisible: await page.locator('[data-tab="notesPanel"]').isVisible(),
    aiTabHidden: !(await page.locator('[data-tab="aiPanel"]').isVisible()),
    askHidden: !(await page.locator('#mAsk').isVisible()),
    locateHidden: !(await page.locator('#locateReviewsBtn').isVisible())
  };
  await openSettings();
  check('China mainland storefront hides cloud AI settings and actions',
    !(await page.locator('#aiSettingsSection').isVisible()) &&
    chinaReader.notesTabVisible && chinaReader.aiTabHidden && chinaReader.askHidden && chinaReader.locateHidden);
  check('China mainland storefront keeps the local reader and iCloud settings available',
    chinaReader.readerVisible && await page.locator('#icloudSettings').isVisible());
  check('China mainland settings explain the restriction without naming a provider',
    /China mainland App Store/.test(await page.locator('.native-ai-region-note').textContent()) &&
    !/OpenAI|ChatGPT/.test(await page.locator('.native-local-settings').textContent()));
  await closeSettings();
  await page.evaluate(() => window.__emitStorefrontChanged({ countryCode: 'CAN', storefrontKnown: true, cloudAIAllowed: true }));
  await page.waitForFunction(() => window.PHLOEM_AI_REGION && window.PHLOEM_AI_REGION.cloudAIAllowed &&
    !document.documentElement.classList.contains('phloem-ai-region-restricted'));
  await openSettings();
  assert.deepEqual(await page.locator('#aiProvider option').evaluateAll(options => options.map(option => option.value).sort()), ['anthropic', 'openai']);
  check('native settings offer OpenAI and Anthropic only (DeepSeek removed)', true);
  check('a reader who had chosen DeepSeek moves to OpenAI', await page.locator('#aiProvider').inputValue() === 'openai');
  check('the DeepSeek entry is gone from saved settings', !('deepseek' in (await settings()).providers) && (await settings()).provider !== 'deepseek');
  check('existing OpenAI Keychain metadata remains present', await page.locator('#aiKeyRemove').isVisible());
  check('an existing key without a native consent receipt still requires disclosure', await page.locator('#nativeAiConsent').isVisible() &&
    await page.locator('#nativeAiConsentLabel').isVisible() && !(await page.locator('#nativeAiEnabled').isVisible()));
  check('native key input stays hidden and disabled', !(await page.locator('#aiKey').isVisible()) && await page.locator('#aiKey').isDisabled());
  check('old JavaScript credentials are scrubbed without removing Keychain metadata',
    (await settings()).providers.openai.key === '' && (await settings()).providers.openai.keyPresent === true &&
    await page.evaluate(() => localStorage.getItem('readingRoom.ai.v1') === null));
  check('OpenAI destination, its data-use note and the university data note are shown',
    /api\.openai\.com/.test(await page.locator('#nativeAiDisclosure').textContent()) &&
    /not used for model training/.test(await page.locator('#nativeAiDisclosure').textContent()) &&
    /unpublished, confidential or restricted university material/.test(await page.locator('#nativeAiDisclosure').textContent()));
  check('OpenAI privacy policy link is provider-specific', (await page.locator('#nativeAiProviderPolicy').getAttribute('href')).includes('openai'));
  await page.click('#aiKeySave');
  check('saving requires affirmative consent before the native prompt', (await configureCalls()).length === 0 &&
    (await page.locator('#aiKeyStatus').textContent()).includes('accept the data-sharing disclosure'));
  await page.check('#nativeAiConsentCheck');
  for (const failure of ['API key entry was cancelled.', 'The API key could not be saved securely.']) {
    await page.evaluate(message => { window.__nativeConfigureFailure = message; }, failure);
    await page.click('#aiKeySave');
    await page.waitForFunction(message => document.getElementById('aiKeyStatus').textContent.includes(message), failure);
    check('failed or cancelled secure key setup keeps disclosure visible and AI unconfirmed',
      await page.locator('#nativeAiConsent').isVisible() && !(await page.locator('#nativeAiEnabled').isVisible()) &&
      !(await page.locator('#aiKeySave').isDisabled()));
  }
  await page.evaluate(() => { window.__nativeConfigureFailure = ''; });
  await page.evaluate(() => { window.__nativeConfigureHasCredential = false; });
  await page.click('#aiKeySave');
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('No API key was saved'));
  check('a native response without a saved credential does not mark consent as enabled',
    await page.locator('#nativeAiConsent').isVisible() && !(await page.locator('#nativeAiEnabled').isVisible()));
  await page.evaluate(() => { window.__nativeConfigureHasCredential = true; });
  await page.click('#aiKeySave');
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('stored in iOS Keychain'));
  assert.deepEqual((await configureCalls()).at(-1), { method: 'configure', payload: { provider: 'openai', consentVersion: 2, consentGranted: true } });
  check('secure native configure receives consent but no API key', true);
  check('consent checkbox resets after saving', !(await page.locator('#nativeAiConsentCheck').isChecked()));
  check('successful key save replaces the age/privacy form with an enabled summary',
    await page.locator('#nativeAiEnabled').isVisible() && !(await page.locator('#nativeAiConsent').isVisible()));
  if (process.env.PHLOEM_NATIVE_AI_SCREENSHOTS) {
    await page.locator('#settingsDialog').screenshot({ path: path.join(process.env.PHLOEM_NATIVE_AI_SCREENSHOTS, 'phloem-ai-consent-enabled-' + browserName + '.png') });
  }
  await page.click('#nativeAiReviewConsent');
  check('review disclosure reopens provider information without asking for age consent again',
    await page.locator('#nativeAiConsent').isVisible() && !(await page.locator('#nativeAiConsentLabel').isVisible()) &&
    /api\.openai\.com/.test(await page.locator('#nativeAiDisclosure').textContent()));
  if (process.env.PHLOEM_NATIVE_AI_SCREENSHOTS) {
    await page.locator('#settingsDialog').screenshot({ path: path.join(process.env.PHLOEM_NATIVE_AI_SCREENSHOTS, 'phloem-ai-consent-review-' + browserName + '.png') });
  }
  await page.click('#nativeAiReviewConsent');
  check('review disclosure can be collapsed again', !(await page.locator('#nativeAiConsent').isVisible()));
  const configuredBeforeModelChange = (await configureCalls()).length;
  await page.fill('#aiModel', 'gpt-5-pro');
  await page.click('#aiKeySave');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.ai.providers.v1')).providers.openai.model === 'gpt-5-pro');
  check('changing a consented provider model does not prompt for consent or API key again',
    (await configureCalls()).length === configuredBeforeModelChange && await page.locator('#nativeAiEnabled').isVisible() &&
    !(await page.locator('#nativeAiConsent').isVisible()));
  await closeSettings();
  await openSettings();
  check('reopening settings keeps the accepted disclosure collapsed',
    await page.locator('#nativeAiEnabled').isVisible() && !(await page.locator('#nativeAiConsent').isVisible()));
  await reloadApp();
  await page.waitForTimeout(1300);
  check('the DeepSeek notice is shown only once', !(await page.evaluate(() => document.getElementById('errorDialog').open)));
  await openSettings();
  check('OpenAI selection and credential presence survive reload', await page.locator('#aiProvider').inputValue() === 'openai' &&
    (await settings()).providers.openai.keyPresent === true);
  check('native consent receipt survives reload independently of JavaScript UI state',
    await page.locator('#nativeAiEnabled').isVisible() && !(await page.locator('#nativeAiConsent').isVisible()) &&
    (await calls()).some(call => call.method === 'status'));
  await closeSettings();
  await openAi();
  await page.fill('#aiQuestion', 'Explain the selected page.');
  await page.click('#aiAskBtn');
  await page.waitForFunction(() => document.getElementById('qaList').textContent.includes('Mock native openai reply.'));
  const openaiRequest = (await calls()).find(call => call.method === 'request').payload;
  check('OpenAI requests use native bridge with current model and consent', openaiRequest.provider === 'openai' &&
    openaiRequest.model === 'gpt-5-pro' && openaiRequest.consentVersion === 2 && openaiRequest.maxTokens === 1200);
  check('native request carries only chosen reading context and messages', openaiRequest.messages.some(message => message.content.includes('Photosynthesis')) &&
    openaiRequest.messages.some(message => message.content.includes('Explain the selected page.')) && !('key' in openaiRequest));
  const goodThread = await page.locator('#qaList').textContent();
  for (const failure of ['The AI provider returned HTTP 401: Invalid API key.', 'The AI provider returned HTTP 429: Rate limit reached.']) {
    await page.evaluate(message => { window.__nativeFailure = message; }, failure);
    await page.fill('#aiQuestion', 'Keep this failed question for retry.');
    await page.click('#aiAskBtn');
    await page.waitForFunction(message => document.getElementById('aiStatus').textContent.includes(message), failure);
    check(failure.includes('401') ? 'invalid-key error is surfaced and the question remains editable' : 'rate-limit error is surfaced and the question remains editable',
      await page.locator('#aiQuestion').inputValue() === 'Keep this failed question for retry.' && !(await page.locator('#aiAskBtn').isDisabled()));
    assert.deepEqual(await savedPaper(), originalPaper);
    check('failed native AI preserves the library, notes, highlights, and prior answer', await page.locator('#qaList').textContent() === goodThread);
  }
  await page.evaluate(() => { window.__nativeFailure = ''; });
  for (const provider of ['anthropic']) {
    await openSettings();
    await page.selectOption('#aiProvider', provider);
    check('switching to an unconsented ' + provider + ' key requires its own disclosure',
      await page.locator('#nativeAiConsent').isVisible() && await page.locator('#nativeAiConsentLabel').isVisible() &&
      !(await page.locator('#nativeAiEnabled').isVisible()));
    await page.check('#nativeAiConsentCheck');
    await page.click('#aiKeySave');
    await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('stored in iOS Keychain'));
    await closeSettings();
    await openAi();
    await page.fill('#aiQuestion', 'Check existing provider ' + provider);
    await page.click('#aiAskBtn');
    await page.waitForFunction(id => document.getElementById('qaList').textContent.includes('Mock native ' + id + ' reply.'), provider);
    check(provider + ' still routes through native bridge', (await calls()).some(call => call.method === 'request' && call.payload.provider === provider));
  }
  await openSettings();
  await page.selectOption('#aiProvider', 'openai');
  await page.click('#aiKeyRemove');
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('removed from iOS Keychain'));
  check('remove key reaches native Keychain bridge for OpenAI only', (await calls()).some(call => call.method === 'removeCredential' && call.payload.provider === 'openai'));
  check('removing OpenAI clears readiness without affecting other credentials', !(await settings()).providers.openai.keyPresent &&
    (await settings()).providers.anthropic.keyPresent);
  check('removing a key brings the required consent form back', await page.locator('#nativeAiConsent').isVisible() &&
    await page.locator('#nativeAiConsentLabel').isVisible() && !(await page.locator('#nativeAiEnabled').isVisible()));
  await reloadApp();
  await openSettings();
  check('removed OpenAI key remains removed after reload', await page.locator('#aiProvider').inputValue() === 'openai' &&
    (await page.locator('#aiKeyStatus').textContent()).includes('No key stored') && !(await page.locator('#aiKeyRemove').isVisible()));

  await reloadWithDelayedStatus();
  check('an unverified storefront keeps cloud AI hidden during native status lookup',
    !(await page.locator('#aiSettingsSection').isVisible()));
  await releaseDelayedStatus();
  await page.waitForFunction(() => window.PHLOEM_AI_REGION && window.PHLOEM_AI_REGION.cloudAIAllowed);
  await page.check('#nativeAiConsentCheck');
  await page.fill('#aiModel', 'gpt-draft-model');
  check('verified non-China storefront enables consent and model editing',
    await page.locator('#nativeAiConsentCheck').isChecked() && await page.locator('#aiModel').inputValue() === 'gpt-draft-model');

  await reloadWithDelayedStatus();
  await releaseDelayedStatus();
  await page.waitForFunction(() => window.PHLOEM_AI_REGION && window.PHLOEM_AI_REGION.cloudAIAllowed);
  await page.check('#nativeAiConsentCheck');
  await page.fill('#aiModel', 'gpt-5-mini');
  await page.click('#aiKeySave');
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('stored in iOS Keychain'));
  check('verified non-China storefront can complete key and consent setup',
    (await settings()).providers.openai.keyPresent && await page.locator('#nativeAiEnabled').isVisible() &&
    !(await page.locator('#nativeAiConsent').isVisible()) && await page.locator('#aiKeyRemove').isVisible());

  await reloadWithDelayedStatus();
  await releaseDelayedStatus();
  await page.waitForFunction(() => window.PHLOEM_AI_REGION && window.PHLOEM_AI_REGION.cloudAIAllowed);
  await page.click('#aiKeyRemove');
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('removed from iOS Keychain'));
  check('verified non-China storefront can remove its key and consent receipt',
    !(await settings()).providers.openai.keyPresent && !(await page.locator('#nativeAiEnabled').isVisible()) &&
    await page.locator('#nativeAiConsent').isVisible() && !(await page.locator('#aiKeyRemove').isVisible()));

  await page.evaluate(() => { window.__nativeConfigureHold = true; });
  await page.check('#nativeAiConsentCheck');
  await page.click('#aiKeySave');
  await page.waitForFunction(() => window.__nativeConfigurePending);
  await page.evaluate(() => localStorage.setItem('native.ai.status.hold', '1'));
  await closeSettings();
  await openSettings();
  await page.waitForFunction(() => window.__nativeStatusPending > 0);
  await page.evaluate(() => window.__resolveNativeConfigure());
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('stored in iOS Keychain'));
  await releaseDelayedStatus();
  check('status started while a secure key save is pending cannot undo that completed save',
    (await settings()).providers.openai.keyPresent && await page.locator('#nativeAiEnabled').isVisible() &&
    !(await page.locator('#nativeAiConsent').isVisible()));

  await page.evaluate(() => { window.__nativeRemoveHold = true; });
  await page.click('#aiKeyRemove');
  await page.waitForFunction(() => window.__nativeRemovePending);
  await page.evaluate(() => localStorage.setItem('native.ai.status.hold', '1'));
  await closeSettings();
  await openSettings();
  await page.waitForFunction(() => window.__nativeStatusPending > 0);
  await page.evaluate(() => window.__resolveNativeRemove());
  await page.waitForFunction(() => document.getElementById('aiKeyStatus').textContent.includes('removed from iOS Keychain'));
  await releaseDelayedStatus();
  check('status started while key removal is pending cannot restore that removed key or receipt',
    !(await settings()).providers.openai.keyPresent && !(await page.locator('#nativeAiEnabled').isVisible()) &&
    await page.locator('#nativeAiConsent').isVisible() && !(await page.locator('#aiKeyRemove').isVisible()));
  assert.deepEqual(await savedPaper(), originalPaper);
  check('provider setup, requests, and removal preserve existing paper data', true);
  check('no credentials are stored in JavaScript after native operations', Object.values((await settings()).providers).every(provider => !provider.key));
  check('native UI tests never make browser API requests', externalRequests.length === 0);
  check('native UI has no JavaScript errors', pageErrors.length === 0);
  console.log(`${checks} checks passed (${browserName}).`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
