let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

/* Find's ink must sit on the words it found. Find brought a match into view with
   scrollIntoView, which scrolls every scrollable ancestor: the page's text and highlight
   layers clip their overflow, so a match in the lower half of a page also scrolled the
   text layer inside its own box, and every find highlight (and the selectable text)
   then sat a few hundred pixels away from the printed words. This two-column paper
   puts matches low on page 2, steps Find through them down and back up, and zoomed in,
   and checks the current highlight against the glyphs' place on the canvas. */

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_PDF_FIND_PLACE_TEST_PORT || 8188);
const QUERY = 'degradat';
const SIZE = 10;
const PAGE_W = 612, PAGE_H = 792;

/* Each line starts with a unique label, so the test knows which printed line the
   current highlight claims to be on and where that line's word is on the canvas.
   Each column is one text block with line breaks, as typeset papers are: PDF.js then
   ends every line with a <br>, and those breaks pile up in the text layer's flow until,
   on a dense page like a two-column introduction, they run past the layer's bottom.
   That overflow is what a scroll inside the layer can reach. */
const LEADING = 13;
async function makeFixture() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.setTitle('Two-column Find fixture');
  const expected = {};
  function column(page, pageNumber, lines, x, top) {
    page.drawText(lines.map(line => line.join(' ')).join('\n'), { x, y: top, size: SIZE, font, lineHeight: LEADING });
    lines.forEach(([label, body], index) => {
      const text = label + ' ' + body, at = text.toLowerCase().indexOf(QUERY);
      if (at < 0) return;
      expected[pageNumber + ':' + label] = {
        page: pageNumber,
        label,
        x: x + font.widthOfTextAtSize(text.slice(0, at), SIZE),
        width: font.widthOfTextAtSize(text.slice(at, at + QUERY.length), SIZE),
        baseline: top - index * LEADING
      };
    });
  }
  const plain = 'carbon moves along the sieve tube.';
  const match = 'protein degradation follows synthesis.';
  const lines = (prefix, count, matches, matchText) => Array.from({ length: count }, (_, i) => [prefix + (i + 1) + ':', matches.has(i) ? matchText : plain]);
  // Page 1: an abstract with its matches in the top half.
  const first = document.addPage([PAGE_W, PAGE_H]);
  first.drawText('Abstract', { x: 72, y: 740, size: 14, font });
  column(first, 1, lines('A', 8, new Set([2, 5]), match), 72, 710);
  // Page 2: an introduction in two columns, most matches well below the middle.
  const second = document.addPage([PAGE_W, PAGE_H]);
  column(second, 2, lines('L', 52, new Set([5, 30, 40, 49]), match), 48, 730);
  /* A small baseline offset keeps PDF.js from joining the two columns' lines. */
  column(second, 2, lines('R', 52, new Set([18, 36, 45]), 'synthesis and degradation occur.'), 326, 724);
  // Page 3: one more match, so the last match on page 2 is not the last in the paper.
  const third = document.addPage([PAGE_W, PAGE_H]);
  column(third, 3, lines('C', 6, new Set([1]), match), 72, 700);
  return { buffer: Buffer.from(await document.save()), expected };
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

function seedReader() {
  if (sessionStorage.getItem('phloem.findPlaceSeeded') === '1') return;
  sessionStorage.setItem('phloem.findPlaceSeeded', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    size: 100, measure: 780, leading: 1.7, typeface: 'book', airy: false,
    focus: false, guide: 'off', guideOrientation: 'row', pdfLayout: 'scroll',
    guideScope: 'page', guideSize: 'm', guideDim: 55, guideX: .72,
    guideY: .38, guideLock: false, tone: 'cream', driftSpeed: 4
  }));
  localStorage.setItem('readingRoom.theme', 'light');
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
}

async function openFind(page) {
  if (await page.locator('body').evaluate(body => body.classList.contains('zen'))) {
    await page.click('#zenMore');
    await page.click('#zenFind');
  } else await page.click('#findBtn');
  await page.locator('#findInput').waitFor({ state: 'visible' });
}

/* Wait until the reader pane and every page layer stop moving: Find scrolls smoothly. */
async function settle(page) {
  await page.waitForFunction(() => document.querySelector('.text-layer .find-target.find-current'));
  await page.evaluate(() => new Promise(resolve => {
    let last = '', still = 0, frames = 0;
    (function tick() {
      const pane = document.getElementById('documentPane');
      const layers = Array.from(document.querySelectorAll('.text-layer, .highlight-layer'));
      const now = [pane.scrollTop, pane.scrollLeft].concat(layers.map(layer => layer.scrollTop + ',' + layer.scrollLeft)).join('|');
      still = now === last ? still + 1 : 0; last = now; frames++;
      if (still >= 12 || frames > 600) resolve(); else requestAnimationFrame(tick);
    })();
  }));
}

/* The current highlight, the printed line it sits in, and that line's word as the
   canvas drew it (PDF points mapped onto the canvas's on-screen box). */
async function currentPlace(page, expected) {
  return page.evaluate(({ expected, size, pageW, pageH }) => {
    const targets = Array.from(document.querySelectorAll('.text-layer .find-target.find-current'));
    const pane = document.getElementById('documentPane');
    const layers = Array.from(document.querySelectorAll('.text-layer, .highlight-layer'));
    const scrolledLayers = layers.filter(layer => layer.scrollTop || layer.scrollLeft).map(layer => layer.className + '@' + layer.closest('.pdf-page').dataset.page + ':' + layer.scrollTop + ',' + layer.scrollLeft);
    if (!targets.length) return { found: false, scrolledLayers };
    const rects = targets.map(target => target.getBoundingClientRect());
    const box = { left: Math.min(...rects.map(r => r.left)), top: Math.min(...rects.map(r => r.top)), right: Math.max(...rects.map(r => r.right)), bottom: Math.max(...rects.map(r => r.bottom)) };
    const host = targets[0].parentElement;
    const holder = targets[0].closest('.pdf-page');
    const pageNumber = +holder.dataset.page;
    const label = (host.textContent.match(/^\s*([A-Z]\d+:)/) || [])[1] || '';
    const want = expected[pageNumber + ':' + label];
    const canvas = holder.querySelector('canvas').getBoundingClientRect();
    const sx = canvas.width / pageW, sy = canvas.height / pageH;
    const glyphs = want ? {
      left: canvas.left + want.x * sx,
      right: canvas.left + (want.x + want.width) * sx,
      top: canvas.top + (pageH - want.baseline - size * .72) * sy,
      bottom: canvas.top + (pageH - want.baseline) * sy
    } : null;
    const paneRect = pane.getBoundingClientRect();
    return {
      found: true, page: pageNumber, label, known: !!want, scrolledLayers,
      layerCount: layers.length,
      counter: document.getElementById('findCount').textContent,
      highlight: box, glyphs,
      dx: glyphs ? (box.left + box.right) / 2 - (glyphs.left + glyphs.right) / 2 : NaN,
      dy: glyphs ? (box.top + box.bottom) / 2 - (glyphs.top + glyphs.bottom) / 2 : NaN,
      widthRatio: glyphs ? (box.right - box.left) / Math.max(1, glyphs.right - glyphs.left) : NaN,
      fontPx: size * sy,
      pane: { top: paneRect.top, bottom: paneRect.top + pane.clientHeight, left: paneRect.left, right: paneRect.left + pane.clientWidth, scrollLeft: pane.scrollLeft, maxLeft: pane.scrollWidth - pane.clientWidth, scrollTop: pane.scrollTop, maxTop: pane.scrollHeight - pane.clientHeight }
    };
  }, { expected, size: SIZE, pageW: PAGE_W, pageH: PAGE_H });
}

function placeSummary(place) {
  return JSON.stringify({ counter: place.counter, label: place.label, dx: Math.round(place.dx), dy: Math.round(place.dy), widthRatio: +(place.widthRatio || 0).toFixed(2), scrolledLayers: place.scrolledLayers });
}

function onGlyphs(place) {
  return place.found && place.known
    && Math.abs(place.dx) <= Math.max(3, (place.glyphs.right - place.glyphs.left) * .2)
    && Math.abs(place.dy) <= place.fontPx * .6
    && place.widthRatio > .75 && place.widthRatio < 1.3;
}

function inPane(place) {
  const h = place.highlight, p = place.pane;
  return h.top >= p.top && h.bottom <= p.bottom && h.left >= p.left && h.right <= p.right;
}

async function stepTo(page, button, wantCounter) {
  await page.click(button);
  await page.waitForFunction(text => document.getElementById('findCount').textContent.includes(text), wantCounter);
  await settle(page);
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seedReader);
  const fixture = await makeFixture();

  await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', { name: 'two-column-find.pdf', mimeType: 'application/pdf', buffer: fixture.buffer });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    return canvas && canvas.width > 0 && document.querySelector('.pdf-page[data-page="1"] .text-layer span')
      && !document.getElementById('readerPage').classList.contains('hidden');
  });

  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"] .text-layer br'));
  const overflowing = await page.evaluate(() => {
    const layer = document.querySelector('.pdf-page[data-page="2"] .text-layer'), box = layer.getBoundingClientRect();
    const bottom = Math.max(...Array.from(layer.querySelectorAll('*')).map(node => node.getBoundingClientRect().bottom));
    return { past: Math.round(bottom - box.bottom), breaks: layer.querySelectorAll('br').length };
  });
  /* Chromium stacks those breaks down the layer; Playwright's WebKit places them at the
     layer's top, so there this page has no overflow to scroll and the checks below hold
     on either code. They still run there for the ink, the centring and the clip. */
  if (browserName === 'chromium') check('the fixture reproduces a dense page whose text layer runs past its own bottom', overflowing.past > 40, JSON.stringify(overflowing));
  else console.log('NOTE  ' + browserName + ' lays the page-2 line breaks out without overflow  [' + JSON.stringify(overflowing) + ']');

  await openFind(page);
  await page.fill('#findInput', QUERY);
  await page.waitForFunction(() => /p\. 1 · 1 \/ \d+/.test(document.getElementById('findCount').textContent));
  await settle(page);
  const total = +(await page.locator('#findCount').textContent()).match(/\/ (\d+)/)[1];
  const expectedCount = Object.keys(fixture.expected).length;
  check('Find counts every match in the paper', total === expectedCount, total + ' of ' + expectedCount);
  const abstract = await currentPlace(page, fixture.expected);
  check('the first abstract match is inked over its words', onGlyphs(abstract), placeSummary(abstract));

  // Step down through the paper, recording each match on page 2.
  const visits = [];
  for (let index = 2; index <= total; index++) {
    await stepTo(page, '#findNext', ' · ' + index + ' / ' + total);
    const place = await currentPlace(page, fixture.expected);
    visits.push({ index, place });
  }
  const pageTwo = visits.filter(visit => visit.place.page === 2);
  check('Find steps through all seven page-2 matches', pageTwo.length === 7, pageTwo.map(visit => visit.place.label).join(' '));
  const firstOnTwo = pageTwo[0], middleOnTwo = pageTwo[Math.floor(pageTwo.length / 2)], lastOnTwo = pageTwo[pageTwo.length - 1];
  const lowOnTwo = pageTwo.filter(visit => +visit.place.label.slice(1, -1) >= 27);
  check('the fixture puts page-2 matches in the lower half of the page', lowOnTwo.length >= 5, lowOnTwo.map(visit => visit.place.label).join(' '));
  for (const [name, visit] of [['first', firstOnTwo], ['middle', middleOnTwo], ['last', lastOnTwo]]) {
    if (!visit) { check('the ' + name + ' page-2 match was reached', false); continue; }
    check('stepping down: the ' + name + ' page-2 match (' + visit.place.label + ') is inked over its printed words', onGlyphs(visit.place), placeSummary(visit.place));
    check('stepping down: no text or highlight layer is scrolled at the ' + name + ' page-2 match', visit.place.scrolledLayers.length === 0, visit.place.scrolledLayers.join(' '));
    check('stepping down: the ' + name + ' page-2 match is in view', inPane(visit.place), JSON.stringify(visit.place.highlight));
  }
  const everyStep = visits.filter(visit => !onGlyphs(visit.place) || visit.place.scrolledLayers.length);
  check('every match in the paper is inked over its words with no layer scrolled', everyStep.length === 0, everyStep.map(visit => visit.index + ':' + placeSummary(visit.place)).join(' ; '));

  // Step back up from the last page-2 match to the first.
  await stepTo(page, '#findPrev', ' · ' + lastOnTwo.index + ' / ' + total);
  for (let index = lastOnTwo.index - 1; index >= firstOnTwo.index; index--) {
    await stepTo(page, '#findPrev', ' · ' + index + ' / ' + total);
    const place = await currentPlace(page, fixture.expected);
    const name = index === firstOnTwo.index ? 'first' : index === middleOnTwo.index ? 'middle' : 'match ' + index;
    check('stepping up: the ' + name + ' page-2 match (' + place.label + ') is inked over its words with no layer scrolled', onGlyphs(place) && !place.scrolledLayers.length, placeSummary(place));
  }

  // Zoomed in, Find still centers the match horizontally and inks the right words.
  await page.evaluate(() => { for (let i = 0; i < 3; i++) document.getElementById('zoomIn').click(); });
  await page.waitForFunction(() => {
    const pane = document.getElementById('documentPane');
    const canvas = document.querySelector('.pdf-page[data-page="2"] canvas');
    return pane.scrollWidth > pane.clientWidth + 100 && canvas && canvas.width > 0 && document.querySelector('.pdf-page[data-page="2"] .text-layer span');
  });
  await page.waitForTimeout(700);
  const rightLow = pageTwo.filter(visit => /^R/.test(visit.place.label)).slice(-1)[0];
  const leftLow = pageTwo.filter(visit => /^L/.test(visit.place.label) && visit.index !== rightLow.index).slice(-1)[0];
  for (const visit of [rightLow, leftLow]) {
    const current = +(await page.locator('#findCount').textContent()).match(/· (\d+) \//)[1];
    const button = visit.index > current ? '#findNext' : '#findPrev';
    let at = current;
    while (at !== visit.index) {
      at += visit.index > at ? 1 : -1;
      await stepTo(page, button, ' · ' + at + ' / ' + total);
    }
    if (visit.index === current) { await stepTo(page, '#findNext', ' · ' + (at + 1) + ' / ' + total); await stepTo(page, '#findPrev', ' · ' + at + ' / ' + total); }
    const place = await currentPlace(page, fixture.expected);
    check('zoomed in: ' + place.label + ' is inked over its words with no layer scrolled', onGlyphs(place) && !place.scrolledLayers.length, placeSummary(place));
    const center = (place.highlight.left + place.highlight.right) / 2, paneCenter = (place.pane.left + place.pane.right) / 2;
    const atEdge = place.pane.scrollLeft <= 1 || place.pane.scrollLeft >= place.pane.maxLeft - 1;
    check('zoomed in: ' + place.label + ' is brought into view and centred across', inPane(place) && (atEdge || Math.abs(center - paneCenter) <= 40), JSON.stringify({ center: Math.round(center), paneCenter: Math.round(paneCenter), scrollLeft: place.pane.scrollLeft, maxLeft: place.pane.maxLeft }));
  }

  /* iOS 15 has no overflow: clip, so there the layers stay scroll boxes. Force that, back
     at Fit, and Find must still scroll only the pane; a layer scrolled by anything else
     goes straight back to 0. */
  await page.addStyleTag({ content: '.text-layer, .highlight-layer { overflow: hidden !important; }' });
  await page.evaluate(() => document.getElementById('zoomLabel').click());
  await page.waitForFunction(() => {
    const pane = document.getElementById('documentPane');
    return pane.scrollWidth <= pane.clientWidth + 2 && document.querySelector('.pdf-page[data-page="2"] .text-layer br');
  });
  await page.waitForTimeout(700);
  const hiddenOverflow = await page.evaluate(() => getComputedStyle(document.querySelector('.text-layer')).overflowY);
  {
    let at = +(await page.locator('#findCount').textContent()).match(/· (\d+) \//)[1];
    const goal = lastOnTwo.index;
    if (at === goal) { await stepTo(page, '#findPrev', ' · ' + (at - 1) + ' / ' + total); at--; }
    while (at !== goal) { const button = goal > at ? '#findNext' : '#findPrev'; at += goal > at ? 1 : -1; await stepTo(page, button, ' · ' + at + ' / ' + total); }
    const place = await currentPlace(page, fixture.expected);
    check('without overflow: clip (' + hiddenOverflow + '), ' + place.label + ' is inked over its words with no layer scrolled', onGlyphs(place) && !place.scrolledLayers.length && inPane(place), placeSummary(place));
    const reset = await page.evaluate(() => new Promise(resolve => {
      const layer = document.querySelector('.pdf-page[data-page="2"] .text-layer');
      layer.scrollTop = 120; layer.scrollLeft = 30;
      const moved = layer.scrollTop;
      setTimeout(() => requestAnimationFrame(() => resolve({ moved, top: layer.scrollTop, left: layer.scrollLeft })), 120);
    }));
    check('without overflow: clip, a text layer scrolled by something else goes back to 0', reset.top === 0 && reset.left === 0, JSON.stringify(reset));
  }

  // The layers clip their overflow without being scroll containers where supported.
  await page.evaluate(() => document.querySelectorAll('style').forEach(style => { if (/overflow: hidden !important/.test(style.textContent)) style.remove(); }));
  const overflow = await page.evaluate(() => {
    const layer = document.querySelector('.text-layer'), ink = document.querySelector('.highlight-layer');
    return { text: getComputedStyle(layer).overflowY, highlight: getComputedStyle(ink).overflowY, clip: CSS.supports('overflow', 'clip') };
  });
  check('text and highlight layers are not scroll containers where overflow: clip exists', !overflow.clip || (overflow.text === 'clip' && overflow.highlight === 'clip'), JSON.stringify(overflow));

  check('Find in a two-column paper has no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  server.close();
  console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); server.close(); process.exit(1); });
