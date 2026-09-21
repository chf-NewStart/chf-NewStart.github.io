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

test('saved credentials cannot start native sync or AI, including explicit AI route overrides', async () => {
  const original = await readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8');
  const js = nativeReaderJs(original);
  const syncLoad = js.match(/  try \{ if\(!window\.PHLOEM_NATIVE\)syncCfg = .*?catch\(e\)\{\}/)?.[0];
  const drive = js.match(/  function gdriveOn\(\)\{[^\n]+\}/)?.[0];
  const active = js.match(/  function activeAiRoute\(skipBrowser\)\{[^\n]+\}/)?.[0];
  const review = js.match(/  function reviewAiPlan\(\)\{[^\n]*[\s\S]*?\n  \}/)?.[0];
  const finish = js.match(/  async function finishSharedReviewPass\(route\)\{[^\n]*[\s\S]*?\n  \}/)?.[0];
  const execute = js.match(/  async function runAiMessages\([^\n]+\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(syncLoad && drive && active && review && finish && execute, 'exercise actual transformed production functions');
  const savedSync = JSON.stringify({ repo: 'sample/private-library', token: 'test-token', pass: 'test-pass' });
  const savedData = new Map([['readingRoom.sync.v1', savedSync], ['readingRoom.v1', 'test-notes']]);
  let reads = 0, calls = 0, completionRequests = 0, clearedPasses = 0;
  const existingPass = { id: 'review-pass', label: 'Shared pass', cfg: { endpoint: 'https://example.test', token: 'test-pass', jobId: 'test-job' } };
  const context = vm.createContext({
    window: { PHLOEM_NATIVE: true }, SYNC_KEY: 'readingRoom.sync.v1', syncCfg: null,
    localStorage: { getItem(key) { reads++; return savedData.get(key); }, setItem() { assert.fail('must not write stored credentials'); }, removeItem() { assert.fail('must not delete stored credentials'); } },
    gdriveCfg: { on: true, tok: 'existing-drive-token' },
    aiSettings: { provider: 'deepseek' },
    cloudAiRoute: () => ({ id: 'deepseek', label: 'DeepSeek', cfg: { key: 'existing-api-key' } }),
    browserLanguageModel: () => ({}), loadAiSettings: () => ({ provider: 'deepseek' }),
    sharedReviewPassRoute: () => existingPass,
    normalizePassEndpoint: endpoint => endpoint,
    fetch: async () => { completionRequests++; return {}; },
    saveSharedAiPass: value => { assert.equal(value, null); clearedPasses++; },
    aiSetupError: message => new Error(message), aiProgress() {},
    runCloudAi: () => { calls++; return 'cloud reply'; }, runBrowserAi: () => { calls++; return 'browser reply'; },
  });
  vm.runInContext([syncLoad, drive, active, review, finish, execute].join('\n'), context);
  assert.equal(context.syncCfg, null);
  assert.equal(reads, 0, 'native startup must not read the GitHub sync configuration');
  assert.equal(context.gdriveOn(), false);
  assert.equal(context.activeAiRoute(false), null);
  const nativePlan = context.reviewAiPlan();
  assert.equal(nativePlan.mode, 'none');
  assert.equal(nativePlan.classification, null);
  assert.equal(nativePlan.location, null);
  await assert.rejects(context.runAiMessages([], 100), /AI is not available in this iPad preview/);
  await assert.rejects(context.runAiMessages([], 100, null, { id: 'review-pass', cfg: { token: 'test-pass' } }), /AI is not available in this iPad preview/);
  await context.finishSharedReviewPass(existingPass);
  assert.equal(completionRequests, 0, 'native preview must not send review-pass completion requests');
  assert.equal(clearedPasses, 0, 'native preview must not clear an existing pass');
  assert.equal(calls, 0);
  assert.equal(savedData.get('readingRoom.sync.v1'), savedSync);
  assert.equal(savedData.get('readingRoom.v1'), 'test-notes');
  // The guard is conditional: the same bundled functions retain web behavior
  // if deliberately exercised outside the native environment.
  context.window.PHLOEM_NATIVE = false;
  vm.runInContext(syncLoad, context);
  assert.equal(context.syncCfg.token, 'test-token');
  assert.equal(context.gdriveOn(), true);
  assert.equal(context.activeAiRoute(false).id, 'deepseek');
  assert.equal(await context.runAiMessages([], 100), 'cloud reply');
  assert.equal(calls, 1);
  assert.equal(context.reviewAiPlan().classification, existingPass);
  await context.finishSharedReviewPass(existingPass);
  assert.equal(completionRequests, 1);
  assert.equal(clearedPasses, 1);
  assert.throws(() => nativeReaderJs(original.replace('function gdriveOn(){', 'function gdriveOn() {')), /Drive enabled check/);
  assert.throws(() => nativeReaderJs(original.replace('function reviewAiPlan(){', 'function reviewAiPlan() {')), /review AI plan/);
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
  assert.deepEqual(builds, ['2', '2']);
  assert.deepEqual(versions, ['0.1.0', '0.1.0']);
});
