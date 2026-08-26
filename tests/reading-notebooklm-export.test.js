let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
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
  await new Promise(resolve => server.listen(8132, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const chapter = {
      id: 'notebooklm_pack', kind: 'pdf', title: 'Roots / Shoots: A field study', authors: 'Ada Botanist', sourceName: 'roots-shoots.pdf', pageCount: 6,
      fr: 'Roots sense local nitrate and change the architecture of the plant.\n\nShoots coordinate that response through long-distance signals.',
      pageNotes: { 1: 'Compare the local and systemic signals.' },
      notes: { 1: 'This paragraph is the bridge to the conclusion.' }, readerNotes: {}, readerHighlights: [], textHighlights: [],
      highlights: { 1: [{ id: 'mark1', text: 'Roots sense local nitrate', note: 'Ask whether this is causal or correlational.', color: 'yellow' }] },
      questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: ['plant signaling', 'revisit'], addedAt: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter] }));
    localStorage.setItem('readingRoom.lastOpen.v1', chapter.id);
    window.open = url => {
      window.__notebookLmOpenStart = url;
      return { closed: false, opener: window, location: { replace(next) { window.__notebookLmUrl = next; } }, close() { window.__notebookLmClosed = true; } };
    };
    const nativeObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob && blob.type === 'application/zip') blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer), view = new DataView(buffer), decoder = new TextDecoder(), entries = {};
        let offset = 0;
        while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
          const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
          const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength;
          const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength)), data = bytes.slice(dataStart, dataStart + size);
          entries[name] = /\.pdf$/i.test(name) ? { size, magic: decoder.decode(data.slice(0, 5)) } : decoder.decode(data);
          offset = dataStart + size;
        }
        window.__notebookPackage = { entries, hasEndRecord: view.getUint32(bytes.length - 22, true) === 0x06054b50 };
      });
      return nativeObjectUrl(blob);
    };
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        window.__notebookPackageName = this.download;
      }
      return nativeClick.call(this);
    };
  });

  await page.goto('http://localhost:8132/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  await page.evaluate(async () => {
    const bytes = await (await fetch('/assets/phloem-guide/phloem-field-guide.pdf')).arrayBuffer();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('marginFiles', 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('pdfs')) request.result.createObjectStore('pdfs'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const put = request.result.transaction('pdfs', 'readwrite').objectStore('pdfs').put(bytes, 'notebooklm_pack');
        put.onsuccess = resolve; put.onerror = () => reject(put.error);
      };
    });
  });
  if (await page.locator('#notebookReopen').isVisible()) await page.click('#notebookReopen');
  if (await page.locator('#notesPanel').evaluate(element => element.classList.contains('hidden'))) await page.click('[data-tab="notesPanel"]');
  check('NotebookLM handoff lives inside the notebook', await page.locator('#notesPanel #notebookLmBtn').count() === 1);
  const cardText = await page.locator('.notebook-listen').textContent();
  check('handoff offers both mind maps and audio', cardText.includes('Mind Map') && cardText.includes('Audio Overview'));

  const downloadPromise = page.waitForEvent('download');
  await page.click('#notebookLmBtn');
  const download = await downloadPromise, zipPath = await download.path();
  await page.waitForFunction(() => window.__notebookPackage);
  const exported = await page.evaluate(() => ({ name: window.__notebookPackageName, package: window.__notebookPackage, openedAt: window.__notebookLmOpenStart, notebookUrl: window.__notebookLmUrl }));
  const names = Object.keys(exported.package.entries), guideName = names.find(name => name.endsWith('Phloem guide.md'));
  const pack = exported.package.entries[guideName], readme = exported.package.entries['README — OPEN FIRST.txt'], pdf = exported.package.entries['roots-shoots.pdf'];
  check('package keeps an understandable ZIP filename', exported.name.includes('Roots Shoots A field study') && exported.name.endsWith('.zip'), exported.name);
  let unzipResult = '';
  try { unzipResult = childProcess.execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }); } catch (error) { unzipResult = String(error.stdout || error.message); }
  check('desktop unzip tools accept the generated package', unzipResult.includes('No errors detected'), unzipResult.trim().split('\n').slice(-1)[0]);
  check('package is a complete standard ZIP', exported.package.hasEndRecord);
  check('package contains instructions, PDF, and Phloem guide', !!readme && !!pdf && !!pack, names.join(', '));
  check('packaged original remains a PDF', pdf && pdf.magic === '%PDF-' && pdf.size > 1000, pdf && JSON.stringify(pdf));
  check('README says to unzip before uploading', readme.includes('cannot read this ZIP directly') && readme.includes('Unzip this package'));
  check('README says to upload both sources', readme.includes('Upload BOTH the PDF and the Phloem guide'));
  check('pack includes paper identity', pack.includes('# Roots / Shoots: A field study') && pack.includes('Ada Botanist'));
  check('pack includes source text', pack.includes('Shoots coordinate that response'));
  check('pack includes paper note', pack.includes('Compare the local and systemic signals.'));
  check('pack includes paragraph note', pack.includes('bridge to the conclusion'));
  check('pack includes highlight and attached note', pack.includes('Roots sense local nitrate') && pack.includes('causal or correlational'));
  check('pack separates reader reactions from author claims', pack.includes('Treat reader notes as questions or reactions—not as claims made by the author.'));
  check('pack gives Mind Map framing', pack.includes('### Mind Map framing') && pack.includes('methods, evidence, findings, limitations'));
  check('NotebookLM tab opens immediately while packaging', exported.openedAt === 'about:blank');
  check('prepared tab continues to NotebookLM', exported.notebookUrl === 'https://notebook.google.com/');
  const status = await page.locator('#notebookLmStatus').textContent();
  check('notebook shows the unzip and two-source handoff', status.includes('Unzip') && status.includes('PDF and Phloem guide'));
  check('export has no page errors', errors.length === 0, errors.join('; '));

  await context.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
