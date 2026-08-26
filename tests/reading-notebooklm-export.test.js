let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

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
      id: 'notebooklm_pack', kind: 'text', title: 'Roots / Shoots: A field study', authors: 'Ada Botanist',
      fr: 'Roots sense local nitrate and change the architecture of the plant.\n\nShoots coordinate that response through long-distance signals.',
      pageNotes: { document: 'Compare the local and systemic signals.' },
      notes: { 1: 'This paragraph is the bridge to the conclusion.' }, readerNotes: {}, highlights: {}, readerHighlights: [],
      textHighlights: [{ id: 'mark1', para: 0, start: 0, end: 25, text: 'Roots sense local nitrate', note: 'Ask whether this is causal or correlational.', color: 'yellow' }],
      questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: ['plant signaling', 'revisit'], addedAt: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter] }));
    localStorage.setItem('readingRoom.lastOpen.v1', chapter.id);
    window.open = url => { window.__notebookLmUrl = url; return {}; };
    const nativeObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob && blob.type && blob.type.startsWith('text/markdown')) blob.text().then(text => { window.__listeningPackText = text; });
      return nativeObjectUrl(blob);
    };
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        window.__listeningPackName = this.download;
        return;
      }
      return nativeClick.call(this);
    };
  });

  await page.goto('http://localhost:8132/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  if (await page.locator('#notebookReopen').isVisible()) await page.click('#notebookReopen');
  if (await page.locator('#notesPanel').evaluate(element => element.classList.contains('hidden'))) await page.click('[data-tab="notesPanel"]');
  check('audio handoff lives inside the notebook', await page.locator('#notesPanel #notebookLmBtn').count() === 1);
  check('handoff explains what it prepares', (await page.locator('.notebook-listen').textContent()).includes('reading trail'));

  await page.click('#notebookLmBtn');
  await page.waitForFunction(() => window.__listeningPackText);
  const exported = await page.evaluate(() => ({ name: window.__listeningPackName, text: window.__listeningPackText }));
  const pack = exported.text;
  check('listening pack keeps an understandable filename', exported.name.includes('Roots Shoots A field study') && exported.name.endsWith('.md'), exported.name);
  check('pack includes paper identity', pack.includes('# Roots / Shoots: A field study') && pack.includes('Ada Botanist'));
  check('pack includes source text', pack.includes('Shoots coordinate that response'));
  check('pack includes paper note', pack.includes('Compare the local and systemic signals.'));
  check('pack includes paragraph note', pack.includes('bridge to the conclusion'));
  check('pack includes highlight and attached note', pack.includes('Roots sense local nitrate') && pack.includes('causal or correlational'));
  check('pack separates reader reactions from author claims', pack.includes('Treat reader notes as questions or reactions—not as claims made by the author.'));
  check('NotebookLM opens after local preparation', await page.evaluate(() => window.__notebookLmUrl === 'https://notebooklm.google.com/'));
  check('notebook shows the upload handoff', (await page.locator('#notebookLmStatus').textContent()).includes('Upload the listening pack'));
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
