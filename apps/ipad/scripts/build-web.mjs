import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
export const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '../../..');

// Explicit allowlist: never copy the portfolio, research library, or demo media.
// DOCX parsing lives in reading.js and uses the browser's DecompressionStream.
// The OCR invocation is English + LSTM; both SIMD and non-SIMD cores embed WASM.
export const readerFiles = Object.freeze([
  'reading.js', 'reading.css', 'carrel.webmanifest', 'LICENSE',
  'fonts/dm-sans-var-latin.woff2', 'fonts/houfu-hand.woff2',
  'assets/phloem-guide/phloem-field-guide.pdf',
  'favicon_io/phloem-favicon.ico',
  'favicon_io/phloem-book-vine-clean-180.png',
  'favicon_io/phloem-book-vine-clean-192.png',
  'favicon_io/phloem-book-vine-clean-512.png',
  'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.compat.js',
  'vendor/pdfjs/pdf.worker.min.js',
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/eng.traineddata.gz',
]);
export const nativeFiles = Object.freeze(['environment.js', 'ipad.css', 'ipad.js']);

function replaceOnce(source, expression, replacement, label, sourceName = 'reading.html') {
  const matches = [...source.matchAll(new RegExp(expression.source, 'g'))];
  if (matches.length !== 1) {
    throw new Error(`Unrecognized ${sourceName}: expected exactly one ${label}, found ${matches.length}. Review the native bundle transform.`);
  }
  return source.replace(expression, replacement);
}

export function nativeHtml(source) {
  let html = replaceOnce(source, /<head>/, '<head>\n  <script src="/native/environment.js"></script>', 'head opening');
  html = replaceOnce(html, /<\/head>/, '  <link rel="stylesheet" href="/native/ipad.css">\n</head>', 'head closing');
  html = replaceOnce(html,
    /if\(!\('serviceWorker' in navigator\)\|\|location\.protocol==='file:'\)return;/,
    "if(window.PHLOEM_NATIVE||!('serviceWorker' in navigator)||location.protocol==='file:')return;",
    'service-worker registration guard');
  html = replaceOnce(html, /<script src="\/reading\.js\?v=\d+" defer><\/script>/,
    '$&\n<script src="/native/ipad.js" defer></script>', 'deferred reader script');
  const registrations = html.match(/navigator\.serviceWorker\.register\(/g) || [];
  if (registrations.length !== 1) throw new Error('Unrecognized service-worker registration count; review the native HTML transform.');
  return html;
}

// This preview does not ship native OAuth or a credential store. These guards
// also cover credentials left in this app's webview by an earlier prototype;
// hiding settings alone would not stop startup sync. Never erase user storage.
export function nativeReaderJs(source) {
  let js = replaceOnce(source,
    /try \{ syncCfg = JSON\.parse\(localStorage\.getItem\(SYNC_KEY\)\); \} catch\(e\)\{\}/,
    'try { if(!window.PHLOEM_NATIVE)syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch(e){}',
    'GitHub sync startup load', 'reading.js');
  js = replaceOnce(js, /function gdriveOn\(\)\{return !!\(gdriveCfg&&gdriveCfg\.on\);\}/,
    'function gdriveOn(){return !window.PHLOEM_NATIVE&&!!(gdriveCfg&&gdriveCfg.on);}',
    'Drive enabled check', 'reading.js');
  js = replaceOnce(js, /function activeAiRoute\(skipBrowser\)\{/,
    'function activeAiRoute(skipBrowser){if(window.PHLOEM_NATIVE)return null;',
    'active AI route', 'reading.js');
  js = replaceOnce(js, /function reviewAiPlan\(\)\{/,
    "function reviewAiPlan(){if(window.PHLOEM_NATIVE)return{mode:'none',classification:null,location:null};",
    'review AI plan', 'reading.js');
  js = replaceOnce(js, /async function finishSharedReviewPass\(route\)\{/,
    'async function finishSharedReviewPass(route){if(window.PHLOEM_NATIVE)return;',
    'review-pass completion', 'reading.js');
  return replaceOnce(js, /async function runAiMessages\(messages,maxTokens,onProgress,routeOverride\)\{/,
    "async function runAiMessages(messages,maxTokens,onProgress,routeOverride){\n    if(window.PHLOEM_NATIVE)throw aiSetupError('AI is not available in this iPad preview.');",
    'AI execution entry point', 'reading.js');
}

function cleanAssetUrl(value, base = '/') {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;
  return decodeURIComponent(new URL(value, `https://bundle.invalid${base}`).pathname).slice(1);
}

// Audit local executable/style/font/manifest references, including lazy imports.
// Anchor links and social-card metadata are navigation, not bundled resources.
export function localRuntimeReferences(html, css, js, manifest, worker) {
  const references = new Set();
  const add = (url, base) => { const item = cleanAssetUrl(url, base); if (item) references.add(item); };
  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) add(match[1]);
  for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1]);
  for (const match of js.matchAll(/["'](\/(?:vendor|assets|fonts|favicon_io)\/[^"']+)["']/g)) {
    if (!/^\/vendor\/tesseract\/?$/.test(match[1])) add(match[1]);
  }
  for (const icon of manifest.icons || []) add(icon.src);
  for (const match of worker.matchAll(/import\(["']([^"']+)["']\)/g)) add(match[1], '/vendor/pdfjs/pdf.worker.compat.js');
  return [...references].sort();
}

async function requiredFile(root, relative) {
  const resolved = path.join(root, relative);
  let stat;
  try { stat = await lstat(resolved); }
  catch (error) { throw new Error(`Missing required iPad bundle asset: ${relative}`, { cause: error }); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Bundle asset must be a regular file: ${relative}`);
  return { source: resolved, destination: relative, size: stat.size };
}

async function extraLicenseFiles(repoRoot) {
  const base = 'apps/ipad/licenses';
  try { await lstat(path.join(repoRoot, base)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const entries = [];
  async function visit(relative) {
    for (const item of await readdir(path.join(repoRoot, relative), { withFileTypes: true })) {
      const child = path.posix.join(relative, item.name);
      if (item.isDirectory()) await visit(child);
      else {
        const entry = await requiredFile(repoRoot, child);
        entry.destination = `licenses/${child.slice(base.length + 1)}`;
        entries.push(entry);
      }
    }
  }
  await visit(base);
  return entries.sort((a, b) => a.destination.localeCompare(b.destination));
}

export async function buildWeb({ repoRoot = defaultRepoRoot, outDir = path.join(repoRoot, 'apps/ipad/www') } = {}) {
  repoRoot = path.resolve(repoRoot);
  outDir = path.resolve(outDir);
  if (outDir === repoRoot || repoRoot.startsWith(outDir + path.sep) || outDir === path.parse(outDir).root) {
    throw new Error('The web bundle output must not replace the source repository or its parent.');
  }
  const sourceHtml = await readFile(path.join(repoRoot, 'reading.html'), 'utf8');
  const html = nativeHtml(sourceHtml);
  const entries = await Promise.all(readerFiles.map(relative => requiredFile(repoRoot, relative)));
  for (const name of nativeFiles) {
    const entry = await requiredFile(repoRoot, `apps/ipad/native/${name}`);
    entry.destination = `native/${name}`;
    entries.push(entry);
  }
  const licenses = await extraLicenseFiles(repoRoot);
  entries.push(...licenses);
  // Keep the companion paths advertised in the upstream minified JS headers.
  for (const name of ['tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt']) {
    const notice = licenses.find(entry => entry.destination === `licenses/${name}`);
    if (notice) entries.push({ ...notice, destination: `vendor/tesseract/${name}` });
  }
  const [css, js, manifest, worker] = await Promise.all([
    readFile(path.join(repoRoot, 'reading.css'), 'utf8'),
    readFile(path.join(repoRoot, 'reading.js'), 'utf8'),
    readFile(path.join(repoRoot, 'carrel.webmanifest'), 'utf8').then(JSON.parse),
    readFile(path.join(repoRoot, 'vendor/pdfjs/pdf.worker.compat.js'), 'utf8'),
  ]);
  const bundledJs = nativeReaderJs(js);
  const selected = new Set(entries.map(entry => entry.destination));
  const missing = localRuntimeReferences(html, css, js, manifest, worker).filter(item => !selected.has(item));
  if (missing.length) throw new Error(`Reader dependencies are outside the reviewed bundle allowlist: ${missing.join(', ')}. Review and add actual reader assets explicitly.`);

  await mkdir(path.dirname(outDir), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(outDir), '.phloem-www-'));
  try {
    const inventory = [];
    for (const entry of entries) {
      const destination = path.join(staging, entry.destination);
      await mkdir(path.dirname(destination), { recursive: true });
      if (entry.destination === 'reading.js') await writeFile(destination, bundledJs);
      else await copyFile(entry.source, destination);
      const bytes = await readFile(destination);
      inventory.push({ path: entry.destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    await writeFile(path.join(staging, 'index.html'), html);
    await writeFile(path.join(staging, 'reading.html'), html);
    const report = {
      format: 1,
      entrypoint: 'index.html',
      sourceHtmlSha256: createHash('sha256').update(sourceHtml).digest('hex'),
      sourceReaderJsSha256: createHash('sha256').update(js).digest('hex'),
      serviceWorker: 'disabled in the native HTML only',
      cloudRoutes: 'Native bundle disables saved GitHub sync startup, Drive sync availability, AI selection, review planning, AI execution and review-pass completion. Stored credentials are not erased.',
      storage: 'Prototype uses the reader browser storage in the app webview; native persistence is a separate milestone.',
      files: inventory.sort((a, b) => a.path.localeCompare(b.path)),
      thirdPartyNotices: entries.some(entry => entry.destination.startsWith('licenses/')) ? 'See licenses/; review dependency licensing before distribution.' : 'Upstream vendored third-party notices are incomplete. Restore and review those notices before distribution.',
    };
    await writeFile(path.join(staging, 'bundle-manifest.json'), JSON.stringify(report, null, 2) + '\n');
    // Validation above happens before replacing the previously working bundle.
    await rm(outDir, { recursive: true, force: true });
    await rename(staging, outDir);
    return { outDir, copiedFiles: entries.length, bytes: inventory.reduce((sum, entry) => sum + entry.bytes, 0), report };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  buildWeb().then(result => {
    console.log(`Bundled Phloem for iPad: ${result.copiedFiles} assets (${(result.bytes / 1024 / 1024).toFixed(1)} MiB) → ${result.outDir}`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
