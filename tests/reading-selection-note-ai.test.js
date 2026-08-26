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
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ guideStyle: 'tint', guideDim: 70 }));
  });

  await page.goto('http://localhost:8126/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#textDocument .original'));
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && !document.getElementById('notesPanel').classList.contains('hidden') && document.getElementById('aiPanel').classList.contains('hidden'));
  check('reader opens to notes instead of AI', await page.evaluate(() => !document.getElementById('notesPanel').classList.contains('hidden') && document.getElementById('aiPanel').classList.contains('hidden')));
  check('guide and reading settings share one toolbar control', await page.locator('#guideTool').count() === 1 && await page.getByRole('button', { name: 'Reading', exact: true }).count() === 0);
  check('guide no longer offers competing styles', await page.locator('[data-guide-style]').count() === 0);
  await page.click('#comfortBtn');
  check('guide dimness remains directly available', await page.locator('#guideDimRange').isVisible() && await page.locator('#guideDimRange').inputValue() === '70');
  check('legacy tint settings migrate to line focus', await page.locator('.guide-shade-top').evaluate(element => getComputedStyle(element).opacity === '0.7'));
  check('retired guide style is removed from saved settings', await page.evaluate(() => !Object.prototype.hasOwnProperty.call(JSON.parse(localStorage.getItem('readingRoom.comfort.v1')), 'guideStyle')));
  await page.click('#comfortBtn');
  await page.evaluate(() => localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1'));
  await page.click('#focusBtn');
  check('main half toggles the whole guide control on', await page.locator('#guideTool').evaluate(element => element.classList.contains('active')) && await page.locator('#focusBtn').getAttribute('aria-pressed') === 'true');
  await page.click('#comfortBtn');
  await page.click('button[data-guide-orientation="column"]');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('paneSpotlight');
    const band = document.getElementById('guideBand');
    return overlay.classList.contains('placed') && band.getBoundingClientRect().width < overlay.getBoundingClientRect().width * .2;
  });
  check('guide offers a vertical column flow', await page.locator('#paneSpotlight').getAttribute('data-guide-orientation') === 'column' && await page.locator('button[data-guide-orientation="column"]').getAttribute('aria-pressed') === 'true');
  check('column flow explains its right-to-left order', (await page.locator('button[data-guide-orientation="column"]').getAttribute('title')).includes('right to left'));
  check('row-only span control leaves the column UI', await page.locator('#guideSpanGroup').evaluate(element => element.hidden) && await page.locator('#guideSizeLabel').textContent() === 'Width');
  const verticalGuide = await page.locator('#guideBand').evaluate((band) => {
    const guide = band.getBoundingClientRect();
    const pane = document.getElementById('paneSpotlight').getBoundingClientRect();
    return { tall: guide.height > pane.height * .65, narrow: guide.width < pane.width * .18, center: (guide.left + guide.width / 2 - pane.left) / pane.width };
  });
  check('column guide is tall and narrow', verticalGuide.tall && verticalGuide.narrow, JSON.stringify(verticalGuide));
  check('column guide begins on the right side', verticalGuide.center > .55, verticalGuide.center.toFixed(2));
  await page.locator('#documentPane').evaluate((pane) => {
    const overlay = document.getElementById('paneSpotlight').getBoundingClientRect();
    pane.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: overlay.left + overlay.width * .3, clientY: overlay.top + overlay.height * .45 }));
  });
  await page.waitForTimeout(140);
  const movedCenter = await page.locator('#guideBand').evaluate((band) => {
    const guide = band.getBoundingClientRect();
    const pane = document.getElementById('paneSpotlight').getBoundingClientRect();
    return (guide.left + guide.width / 2 - pane.left) / pane.width;
  });
  check('column guide follows horizontal pointer movement', movedCenter < verticalGuide.center - .1, movedCenter.toFixed(2));
  await page.click('button[data-guide-orientation="row"]');
  check('legacy comfort settings default to row flow', await page.locator('#paneSpotlight').getAttribute('data-guide-orientation') === 'row');
  await page.click('#comfortBtn');
  await page.click('#focusBtn');
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
  check('selected text still offers Define', await page.locator('#selectionExplain').isVisible());
  check('AI thread is hidden before a note exists', !(await page.locator('#selectionNoteAi').isVisible()));

  await page.click('#selectionExplain');
  await page.waitForFunction(() => !document.getElementById('lookupCard').classList.contains('hidden'));
  check('definition opens inside the selection workspace', await page.locator('#lookupCard').evaluate(element => element.parentElement.id === 'selectionCard'));
  check('selected passage remains visible while defining', await page.locator('#selectionCard').isVisible() && (await page.locator('#selectionExcerpt').textContent()).length > 4);
  check('the selected words remain visibly selected on the paper', await page.evaluate(() => window.getSelection().toString().trim().length > 0));
  check('highlight and note actions remain available while defining', await page.locator('#selectionHighlight').isVisible() && await page.locator('#selectionAddNote').isVisible());
  await page.click('#lookupClose');
  check('closing the definition keeps the selected passage open', await page.locator('#selectionCard').isVisible());

  await page.click('#selectionAddNote');
  check('note action becomes the note workspace', await page.locator('#selectionCard').evaluate(element => element.classList.contains('note-open')));
  check('note action creates the supporting highlight', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].textHighlights.length === 1));
  check('a saved highlight still offers Define', await page.locator('#selectionExplain').isVisible());
  check('AI thread stays hidden for an empty note', !(await page.locator('#selectionNoteAi').isVisible()));

  await page.fill('#selectionNote', 'This is the bridge between the data sources.');
  check('note is saved on the highlight', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].textHighlights[0].note === 'This is the bridge between the data sources.'));
  check('AI thread appears after note text exists', await page.locator('#selectionNoteAi').isVisible());

  await page.click('#selectionNoteAi');
  check('thread opens inside the note card', await page.locator('#selectionAiBox').isVisible());
  check('saved note is visible inside its thread', await page.locator('#selectionAiNoteText').textContent().then(text => text === 'This is the bridge between the data sources.'));
  check('generic context banner is replaced by the note itself', !(await page.locator('#selectionContext').isVisible()));
  check('thread returns to the note', await page.locator('#selectionAiBack').textContent().then(text => text.includes('Note')));
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = await page.locator('#selectionCard').boundingBox();
  check('note thread stays on-screen on mobile', mobileCard && mobileCard.y >= 0 && mobileCard.y + mobileCard.height <= 844);
  check('note remains visible in the mobile thread', await page.locator('#selectionAiNoteText').isVisible());
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
