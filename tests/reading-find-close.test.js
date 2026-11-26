let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');

/* Find has one obvious way out. The search field's own clear X only emptied the text
   and left the bar open, and Escape closed the bar only while focus was inside it: on
   the iPad a tapped ↑ or ↓ is not focused, so Escape then did nothing to Find (and in
   Zen, with focus on the page, it closed the paper instead). This checks the bar's ✕,
   Escape from the page, the step buttons and the field, the surfaces that own Escape
   first (a dialog, the reference card), and that Find opens and finds again after. */

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_FIND_CLOSE_TEST_PORT || 8191);
const QUERY = 'degradation';

function pdfBuffer() {
  function stream(text) {
    return '<< /Length ' + Buffer.byteLength(text, 'ascii') + ' >>\nstream\n' + text + '\nendstream';
  }
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R /Names << /Dests 9 0 R >> >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /Annots [8 0 R] >>',
    stream('BT\n/F1 14 Tf\n72 700 Td\n(Protein degradation follows synthesis [1].) Tj\n0 -40 Td\n(Carbon moves along the sieve tube.) Tj\n0 -40 Td\n(Synthesis and degradation occur together.) Tj\nET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    stream('BT\n/F1 14 Tf\n72 700 Td\n(REFERENCES) Tj\n0 -40 Td\n([1] Alpha reference on degradation rates.) Tj\nET'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Link /Rect [330 695 350 716] /Border [0 0 0] /Dest (refA) >>',
    '<< /Names [(refA) [5 0 R /FitR 72 650 540 680]] >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'ascii');
    pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'ascii');
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css'
          : file.endsWith('.pdf') ? 'application/pdf'
            : 'application/octet-stream';
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
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('phloem.findCloseSeeded') === '1') return;
    sessionStorage.setItem('phloem.findCloseSeeded', '1');
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', guide: 'off', guideOrientation: 'row', focus: false, guideDim: 55 }));
    localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  });
  await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', { name: 'find-close.pdf', mimeType: 'application/pdf', buffer: pdfBuffer() });
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span') && document.querySelector('.pdf-page[data-page="1"] .pdf-link'));

  const state = () => page.evaluate(() => ({
    open: !document.getElementById('findBar').classList.contains('hidden'),
    marks: document.querySelectorAll('.find-target, .find-span, .find-current-span').length,
    count: document.getElementById('findCount').textContent,
    reader: !document.getElementById('readerPage').classList.contains('hidden'),
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
    focusInBar: document.getElementById('findBar').contains(document.activeElement)
  }));
  const closed = s => !s.open && s.marks === 0 && s.count === '' && s.reader;
  async function openFind() {
    if (await page.locator('body').evaluate(body => body.classList.contains('zen'))) {
      await page.click('#zenMore');
      await page.click('#zenFind');
    } else await page.click('#findBtn');
    await page.locator('#findInput').waitFor({ state: 'visible' });
    if (await page.inputValue('#findInput') !== QUERY) await page.fill('#findInput', QUERY);
    await page.waitForFunction(() => / · 1 \/ 3/.test(document.getElementById('findCount').textContent) && document.querySelector('.text-layer .find-current'));
  }

  await openFind();
  const button = await page.evaluate(() => {
    const close = document.getElementById('findClose'), bar = document.getElementById('findBar');
    if (!close) return { missing: true };
    const rect = close.getBoundingClientRect(), barRect = bar.getBoundingClientRect();
    const others = Array.from(bar.children).filter(child => child !== close).map(child => child.getBoundingClientRect());
    const rules = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let list; try { list = sheet.cssRules; } catch (e) { continue; }
      for (const rule of Array.from(list || [])) if (rule.selectorText && /find-bar input::-webkit-search-cancel-button/.test(rule.selectorText)) rules.push(rule.style.display);
    }
    return {
      label: close.getAttribute('aria-label'), text: close.textContent.trim(), width: rect.width, height: rect.height,
      last: bar.lastElementChild === close,
      atEnd: others.every(other => other.right <= rect.left + 1 || other.bottom <= rect.top + 1),
      inside: rect.right <= barRect.right + 1 && rect.bottom <= barRect.bottom + 1,
      inputType: document.getElementById('findInput').type,
      cancelHidden: rules.includes('none')
    };
  });
  check('the Find bar ends with a ✕ labelled "Close Find" for VoiceOver', button.label === 'Close Find' && button.text === '✕' && button.last && button.atEnd && button.inside, JSON.stringify(button));
  check('the ✕ is at least 44 × 44 points', button.width >= 44 && button.height >= 44, button.width + ' × ' + button.height);
  check('the search field\'s own clear X is hidden, so the only X closes Find', button.inputType !== 'search' || button.cancelHidden, JSON.stringify(button));

  if (button.missing) { await page.focus('#findInput'); await page.keyboard.press('Escape'); }
  else await page.click('#findClose');
  let after = await state();
  check('the ✕ closes Find and clears every find highlight', closed(after), JSON.stringify(after));
  check('the ✕ returns focus to a control outside the bar, as Find\'s own Escape does', !after.focusInBar && after.focus !== 'BODY', after.focus);

  await openFind();
  after = await state();
  check('Find opens again after the ✕ and finds the matches again', after.open && after.marks > 0 && / · 1 \/ 3/.test(after.count), JSON.stringify(after));

  // Escape with focus on the page: what a tap on ↑ or ↓ leaves on the iPad.
  await page.click('#findNext');
  await page.waitForFunction(() => / · 2 \/ 3/.test(document.getElementById('findCount').textContent));
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('Escape');
  after = await state();
  check('Escape with focus on the page closes Find and clears its highlights', closed(after), JSON.stringify(after));
  check('that Escape keeps the paper open', after.reader && await page.locator('#libraryPage').evaluate(library => library.classList.contains('hidden')), JSON.stringify(after));

  for (const control of ['#findPrev', '#findNext', '#findInput']) {
    await openFind();
    await page.focus(control);
    await page.keyboard.press('Escape');
    after = await state();
    check('Escape with focus on ' + control + ' closes Find', closed(after), JSON.stringify(after));
  }

  // A dialog owns Escape first; the next Escape closes Find.
  await openFind();
  await page.evaluate(() => document.getElementById('readerControlsDialog').showModal());
  await page.keyboard.press('Escape');
  const dialogOpen = await page.evaluate(() => document.getElementById('readerControlsDialog').open);
  after = await state();
  check('Escape with a dialog open closes the dialog and leaves Find open', !dialogOpen && after.open && after.marks > 0, JSON.stringify({ dialogOpen, after }));
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('Escape');
  after = await state();
  check('the next Escape closes Find', closed(after), JSON.stringify(after));

  // The reference card owns Escape first.
  await openFind();
  await page.focus('.pdf-page[data-page="1"] .pdf-link[data-pdf-destination="refA"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden'));
  await page.keyboard.press('Escape');
  const previewHidden = await page.evaluate(() => document.getElementById('pdfReferencePreview').classList.contains('hidden'));
  after = await state();
  check('Escape with the reference card open closes the card and leaves Find open', previewHidden && after.open && after.marks > 0, JSON.stringify({ previewHidden, after }));
  await page.keyboard.press('Escape');
  after = await state();
  check('the next Escape closes Find, not the paper', closed(after), JSON.stringify(after));

  await openFind();
  after = await state();
  check('Find opens and finds again after every way of closing it', after.open && after.marks > 0 && / · 1 \/ 3/.test(after.count), JSON.stringify(after));

  check('closing Find has no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  server.close();
  console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); server.close(); process.exit(1); });
