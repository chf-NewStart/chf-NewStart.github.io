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
  await new Promise(resolve => server.listen(8126, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    const chapter = {
      id: 'ch_note_first', kind: 'text', title: 'Note-first test', authors: 'Tester',
      fr: 'Platform integration connects several kinds of metabolic data in one model.\n\nA second paragraph keeps the paper realistic.',
      textHighlights: [], highlights: {}, readerHighlights: [], notes: {}, readerNotes: {},
      pageNotes: {}, questions: [], aiThreads: [], termLookups: {}, reviews: {}, tags: [], at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter] }));
    localStorage.setItem('readingRoom.lastOpen.v1', chapter.id);
  });

  await page.goto('http://localhost:8126/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#textDocument .original'));
  await page.evaluate(() => {
    const paragraph = document.querySelector('#textDocument .original');
    const node = paragraph.firstChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 20);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));

  check('selection card has no Ask AI shortcut', await page.locator('#selectionAsk').count() === 0);
  check('selection card offers two primary actions', await page.locator('#selectionCard .selection-action').count() === 2);
  check('selection card stays compact', await page.locator('#selectionCard').evaluate(element => element.getBoundingClientRect().width <= 362));
  check('AI thread is hidden before a note exists', !(await page.locator('#selectionNoteAi').isVisible()));

  await page.click('#selectionAddNote');
  check('note action becomes the note workspace', await page.locator('#selectionCard').evaluate(element => element.classList.contains('note-open')));
  check('note action creates the supporting highlight', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].textHighlights.length === 1));
  check('AI thread stays hidden for an empty note', !(await page.locator('#selectionNoteAi').isVisible()));

  await page.fill('#selectionNote', 'This is the bridge between the data sources.');
  check('note is saved on the highlight', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].textHighlights[0].note === 'This is the bridge between the data sources.'));
  check('AI thread appears after note text exists', await page.locator('#selectionNoteAi').isVisible());

  await page.click('#selectionNoteAi');
  check('thread opens inside the note card', await page.locator('#selectionAiBox').isVisible());
  check('thread context includes passage and note', await page.locator('#selectionContextText').textContent().then(text => text.includes('selected passage + your note')));
  check('thread returns to the note', await page.locator('#selectionAiBack').textContent().then(text => text.includes('Note')));
  await page.click('#selectionAiBack');
  check('back restores the note editor', await page.locator('#selectionNote').isVisible());
  check('note survives the thread round trip', await page.locator('#selectionNote').inputValue().then(value => value.includes('bridge between')));

  check('note-first flow has no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
