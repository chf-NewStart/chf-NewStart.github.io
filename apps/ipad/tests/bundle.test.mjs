import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildWeb, defaultRepoRoot, localRuntimeReferences, nativeHtml, nativeReaderJs, readerFiles, nativeFiles } from '../scripts/build-web.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

async function walk(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await walk(root, relative));
    else result.push(relative);
  }
  return result.sort();
}

test('bundles a local reader with all runtime dependencies and preserves website sources', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'phloem-ipad-bundle-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const outDir = path.join(temporary, 'www');
  const before = await Promise.all(['reading.html', 'reading.js', 'reading.css'].map(file => readFile(path.join(defaultRepoRoot, file))));
  await buildWeb({ outDir });
  const after = await Promise.all(['reading.html', 'reading.js', 'reading.css'].map(file => readFile(path.join(defaultRepoRoot, file))));
  assert.deepEqual(after.map(hash), before.map(hash), 'packaging must not edit the website');
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.equal(html, await readFile(path.join(outDir, 'reading.html'), 'utf8'), 'existing reader links must keep working');
  const references = localRuntimeReferences(html, before[2].toString(), before[1].toString(),
    JSON.parse(await readFile(path.join(outDir, 'carrel.webmanifest'), 'utf8')),
    await readFile(path.join(outDir, 'vendor/pdfjs/pdf.worker.compat.js'), 'utf8'));
  for (const reference of references) await access(path.join(outDir, reference));
  assert.match(html, /if\(window\.PHLOEM_NATIVE\|\|!\('serviceWorker' in navigator\)/);
  assert.ok(html.indexOf('/native/environment.js') < html.indexOf('navigator.serviceWorker'));
  assert.ok(html.indexOf('/native/ipad.js') > html.indexOf('<script src="/reading.js'));
  assert.equal((html.match(/<script\b[^>]*\bsrc=["']https?:/g) || []).length, 0, 'app shell must not load its code from a live website');
  for (const file of readerFiles.filter(file => file !== 'reading.js')) assert.equal(hash(await readFile(path.join(outDir, file))), hash(await readFile(path.join(defaultRepoRoot, file))));
  assert.equal(await readFile(path.join(outDir, 'reading.js'), 'utf8'), nativeReaderJs(before[1].toString()));
  const actual = await walk(outDir);
  const allowed = new Set([...readerFiles, ...nativeFiles.map(file => `native/${file}`),
    'vendor/tesseract/tesseract.min.js.LICENSE.txt', 'vendor/tesseract/worker.min.js.LICENSE.txt',
    'index.html', 'reading.html', 'bundle-manifest.json']);
  assert.deepEqual(actual.filter(file => !allowed.has(file) && !file.startsWith('licenses/')), [], 'unexpected portfolio, private paper, or media content must not ship');
  assert.equal(actual.some(file => /(?:^papers\/|^output\/|\.mp4$|\.mov$|^\.git\/|reading-sw\.js$)/i.test(file)), false);
  assert.deepEqual(actual.filter(file => file.endsWith('.pdf')), ['assets/phloem-guide/phloem-field-guide.pdf']);
  for (const core of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
    assert.match(await readFile(path.join(outDir, 'vendor/tesseract', core), 'utf8'), /data:application\/octet-stream;base64,/, 'OCR core must contain local WASM');
  }
  for (const name of ['tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt']) {
    assert.equal(await readFile(path.join(outDir, 'vendor/tesseract', name), 'utf8'),
      await readFile(path.join(defaultRepoRoot, 'apps/ipad/licenses', name), 'utf8'));
  }
});

test('rejects a changed service-worker guard rather than silently shipping it', async () => {
  const html = await readFile(path.join(defaultRepoRoot, 'reading.html'), 'utf8');
  assert.throws(() => nativeHtml(html.replace("location.protocol==='file:'", "location.protocol === 'file:'")), /registration guard/);
  assert.throws(() => nativeHtml(html.replace('</body>', "<script>navigator.serviceWorker.register('/another-worker.js')</script></body>")), /registration count/);
});

test('native packaging blocks browser sync credentials without disabling the native AI bridge', async () => {
  const original = await readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8');
  const js = nativeReaderJs(original);
  const syncLoad = js.match(/  try \{ if\(!window\.PHLOEM_NATIVE\)syncCfg = .*?catch\(e\)\{\}/)?.[0];
  const drive = js.match(/  function gdriveOn\(\)\{[^\n]+\}/)?.[0];
  assert.ok(syncLoad && drive, 'exercise actual transformed sync functions');
  assert.match(js, /function nativeAiPlugin\(\)/);
  assert.match(js, /nativePlugin\.request\(\{provider:route\.id/);
  assert.doesNotMatch(js, /AI is not available in this iPad preview/);
  const savedSync = JSON.stringify({ repo: 'sample/private-library', token: 'test-token', pass: 'test-pass' });
  const savedData = new Map([['readingRoom.sync.v1', savedSync], ['readingRoom.v1', 'test-notes']]);
  let reads = 0;
  const context = vm.createContext({
    window: { PHLOEM_NATIVE: true }, SYNC_KEY: 'readingRoom.sync.v1', syncCfg: null,
    localStorage: { getItem(key) { reads++; return savedData.get(key); }, setItem() { assert.fail('must not write stored credentials'); }, removeItem() { assert.fail('must not delete stored credentials'); } },
    gdriveCfg: { on: true, tok: 'existing-drive-token' }
  });
  vm.runInContext([syncLoad, drive].join('\n'), context);
  assert.equal(context.syncCfg, null);
  assert.equal(reads, 0, 'native startup must not read the GitHub sync configuration');
  assert.equal(context.gdriveOn(), false);
  assert.equal(savedData.get('readingRoom.sync.v1'), savedSync);
  assert.equal(savedData.get('readingRoom.v1'), 'test-notes');
  context.window.PHLOEM_NATIVE = false;
  vm.runInContext(syncLoad, context);
  assert.equal(context.syncCfg.token, 'test-token');
  assert.equal(context.gdriveOn(), true);
  assert.throws(() => nativeReaderJs(original.replace('function gdriveOn(){', 'function gdriveOn() {')), /Drive enabled check/);
});

test('native AI metadata never exposes a key and requests cross the registered bridge', async () => {
  const source = await readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8');
  const pick = expression => {
    const match = source.match(expression);
    assert.ok(match, `missing source match: ${expression}`);
    return match[0];
  };
  const functions = [
    pick(/  function nativeAiPlugin\(\)\{[^\n]+\}/),
    pick(/  function defaultAiSettings\(\)\{[\s\S]*?\n  \}/),
    pick(/  function loadAiSettings\(\)\{[\s\S]*?\n  \}/),
    pick(/  function saveAiSettings\(\)\{[^\n]+\}/),
    pick(/  function cloudAiRoute\(preferred\)\{[\s\S]*?\n  \}/),
    pick(/  function activeAiRoute\(skipBrowser\)\{[^\n]+\}/),
    pick(/  async function runAiMessages\(messages,maxTokens,onProgress,routeOverride\)\{[\s\S]*?\n  \}/)
  ].join('\n');
  const persisted = {
    provider: 'openai',
    providers: {
      openai: { key: 'must-be-scrubbed', keyPresent: true, model: 'gpt-test', endpoint: '' }
    }
  };
  let saved = null;
  const bridgeCalls = [];
  const context = vm.createContext({
    window: { PHLOEM_NATIVE: true, Capacitor: { Plugins: { PhloemAI: {
      async request(payload) { bridgeCalls.push(payload); return { text: 'Native reply', provider: 'OpenAI' }; }
    } } } },
    AI_SETTINGS_KEY: 'readingRoom.ai.providers.v1', LEGACY_AI_KEY: 'readingRoom.ai.v1',
    NATIVE_AI_CONSENT_VERSION: 1,
    AI_PROVIDERS: {
      gemini: { label: 'Gemini API', model: 'gemini-test' },
      deepseek: { label: 'DeepSeek', model: 'deepseek-test' },
      openai: { label: 'OpenAI', model: 'gpt-test' },
      anthropic: { label: 'Anthropic', model: 'claude-test' },
      compatible: { label: 'OpenAI-compatible', model: '', endpoint: '' }
    },
    localStorage: {
      getItem(key) { return key === 'readingRoom.ai.providers.v1' ? JSON.stringify(persisted) : 'legacy-key-must-not-load'; },
      setItem(key, value) { saved = { key, value }; }
    },
    browserLanguageModel: () => null,
    aiSettings: null,
    aiSetupError: message => Object.assign(new Error(message), { aiSetup: true }),
    aiProgress() {},
    runBrowserAi: () => assert.fail('native requests must not use browser AI'),
    runCloudAi: () => assert.fail('native requests must not expose keys to browser fetch')
  });
  vm.runInContext(functions, context);
  context.aiSettings = context.loadAiSettings();
  assert.equal(context.aiSettings.provider, 'openai');
  assert.equal(context.aiSettings.providers.openai.key, '');
  assert.equal(context.aiSettings.providers.openai.keyPresent, true);
  context.saveAiSettings();
  assert.equal(saved.key, 'readingRoom.ai.providers.v1');
  assert.equal(JSON.parse(saved.value).providers.openai.key, '');
  const result = await context.runAiMessages([{ role: 'user', content: 'Explain this.' }], 240);
  assert.equal(result.text, 'Native reply');
  assert.deepEqual(JSON.parse(JSON.stringify(bridgeCalls)), [{
    provider: 'openai', model: 'gpt-test', messages: [{ role: 'user', content: 'Explain this.' }],
    maxTokens: 240, consentVersion: 1
  }]);
  assert.equal(JSON.stringify(bridgeCalls).includes('must-be-scrubbed'), false);
});

test('missing or new unreviewed dependencies fail without erasing the existing output', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'phloem-ipad-missing-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fixture = path.join(temporary, 'repo');
  const output = path.join(temporary, 'www');
  await mkdir(fixture);
  await mkdir(output);
  await writeFile(path.join(output, 'keep.txt'), 'previous bundle');
  await copyFile(path.join(defaultRepoRoot, 'reading.html'), path.join(fixture, 'reading.html'));
  await assert.rejects(buildWeb({ repoRoot: fixture, outDir: output }), /Missing required iPad bundle asset/);
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'previous bundle');
  for (const file of [...readerFiles, ...nativeFiles.map(file => `apps/ipad/native/${file}`)]) {
    await mkdir(path.dirname(path.join(fixture, file)), { recursive: true });
    await copyFile(path.join(defaultRepoRoot, file), path.join(fixture, file));
  }
  const html = await readFile(path.join(fixture, 'reading.html'), 'utf8');
  await writeFile(path.join(fixture, 'reading.html'), html.replace('</head>', '<script src="/portfolio-only.js"></script></head>'));
  await assert.rejects(buildWeb({ repoRoot: fixture, outDir: output }), /outside the reviewed bundle allowlist: portfolio-only.js/);
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'previous bundle');
});

test('Capacitor configuration uses bundled assets instead of a remote server', async () => {
  const configPath = path.join(defaultRepoRoot, 'apps/ipad/capacitor.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(config.webDir, 'www');
  assert.equal(config.server?.url, undefined);
});

test('Xcode Debug and Release agree on the next Apple build identity', async () => {
  const project = await readFile(path.join(defaultRepoRoot, 'apps/ipad/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const builds = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1]);
  const versions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1]);
  assert.deepEqual(builds, ['8', '8']);
  assert.deepEqual(versions, ['1.1.0', '1.1.0']);
});

test('native AI security and privacy declarations remain attached to the app target', async () => {
  const appRoot = path.join(defaultRepoRoot, 'apps/ipad/ios/App');
  const plugin = await readFile(path.join(appRoot, 'App/PhloemAIPlugin.swift'), 'utf8');
  const adapter = await readFile(path.join(defaultRepoRoot, 'apps/ipad/native/ipad.js'), 'utf8');
  const reader = await readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8');
  const privacy = await readFile(path.join(appRoot, 'App/PrivacyInfo.xcprivacy'), 'utf8');
  const project = await readFile(path.join(appRoot, 'App.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(plugin, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  assert.match(plugin, /URLSessionConfiguration\.ephemeral/);
  assert.match(plugin, /request\.url\?\.host == expectedHost/);
  assert.match(plugin, /UIAlertController\(/);
  assert.match(plugin, /field\.isSecureTextEntry = true/);
  assert.match(adapter, /hide\(byId\('aiKey'\)\)/);
  assert.doesNotMatch(reader, /nativePlugin\.configure\(\{provider:id,key:/);
  for (const host of ['generativelanguage.googleapis.com', 'api.deepseek.com', 'api.openai.com', 'api.anthropic.com']) {
    assert.match(plugin, new RegExp(host.replaceAll('.', '\\.')));
  }
  assert.match(privacy, /NSPrivacyCollectedDataTypeOtherUserContent/);
  assert.match(privacy, /NSPrivacyCollectedDataTypeUserID/);
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(project, /PrivacyInfo\.xcprivacy in Resources/);
});

test('native provider defaults avoid retired compatibility model names', async () => {
  const reader = await readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8');
  assert.match(reader, /deepseek:\{label:'DeepSeek',model:'deepseek-flash'\}/);
  assert.match(reader, /anthropic:\{label:'Anthropic',model:'claude-sonnet-4-6'\}/);
  assert.doesNotMatch(reader, /anthropic:\{label:'Anthropic',model:'claude-sonnet-4-20250514'\}/);
});
