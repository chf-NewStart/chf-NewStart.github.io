let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_FIND_HIGHLIGHT_TEST_PORT || 8146);
const TEXT_QUERY = 'carbon allocation';
const MULTI_QUERY = 'sink signal';
const SAVED_QUERY = 'fruit development';
const PDF_MULTI_QUERY = 'fruit';

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

function pdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/* The phrase intentionally crosses two PDF text items (and two fonts). PDF.js renders
   those as separate text-layer spans even though Phloem's searchable page text joins
   them into one sentence. This is the common case that exposed the missing ink. */
function makeSplitPhrasePdf() {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [5 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>';
  const parts = [
    ['F1', 'Carbon', 72],
    ['F2', 'allocation', 150],
    ['F1', 'shapes the developing fruit; fruit ripens.', 255]
  ];
  const stream = parts.map(part => 'BT /' + part[0] + ' 18 Tf 1 0 0 1 ' + part[2] + ' 700 Tm (' + pdfEscape(part[1]) + ') Tj ET').join('\n');
  objects[5] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>';
  objects[6] = '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + '\nendstream';
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, 'ascii');
    output += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(output, 'ascii');
  output += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id++) output += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  output += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(output, 'ascii');
}

async function enterFind(page, query) {
  await page.click('#findBtn');
  await page.fill('#findInput', query);
  await page.waitForFunction(() => /1 \/ 1/.test(document.getElementById('findCount').textContent));
}

/* Detect visible emphasis on the exact phrase rather than a wash over its entire
   paragraph. The check deliberately does not prescribe a class name. */
async function exactTextHighlight(page, query) {
  return page.evaluate(value => {
    const wanted = value.toLocaleLowerCase();
    const original = document.querySelector('#textDocument .original');
    if (!original) return { highlighted: false, reason: 'no paragraph' };
    const candidates = Array.from(original.querySelectorAll('*')).filter(element => {
      return element.textContent.trim().toLocaleLowerCase() === wanted && !element.children.length;
    });
    const visible = candidates.find(element => {
      const style = getComputedStyle(element);
      const color = style.backgroundColor;
      const alpha = color === 'transparent' ? 0 : +(color.match(/rgba?\([^)]*,\s*([\d.]+)\)$/) || [0, color.startsWith('rgb(') ? 1 : 0])[1];
      return alpha > 0 || style.backgroundImage !== 'none' || style.boxShadow !== 'none';
    });
    return {
      highlighted: !!visible,
      candidates: candidates.length,
      paragraphFlashed: !!original.closest('.para.find-flash')
    };
  }, query);
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);

  const textPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const textErrors = [];
  textPage.on('pageerror', error => textErrors.push(error.message));
  await textPage.addInitScript(() => {
    const body = 'Tomato carbon allocation changes rapidly during fruit development. A sink signal rises early, while a later sink signal confirms the transition.';
    const savedStart = body.indexOf('fruit development');
    const chapter = {
      id: 'find-text-fixture', kind: 'text', title: 'Source and sink notes', authors: 'Test Reader',
      fr: body,
      notes: {}, readerNotes: {}, pageNotes: {}, highlights: {},
      textHighlights: [{
        id: 'saved-highlight', para: 0, start: savedStart, end: savedStart + 'fruit development'.length,
        text: 'fruit development', color: 'mint', at: Date.now()
      }],
      readerHighlights: [],
      questions: [], reviewComments: [], tags: [], addedAt: Date.now(), updatedAt: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.lastOpen.v1', chapter.id);
  });
  await textPage.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await textPage.waitForSelector('#textDocument .original');
  await enterFind(textPage, TEXT_QUERY);
  const textVisual = await exactTextHighlight(textPage, TEXT_QUERY);
  check('text Find locates the phrase', (await textPage.locator('#findCount').textContent()).includes('1 / 1'));
  check('text Find highlights the exact target words, not only their paragraph', textVisual.highlighted, JSON.stringify(textVisual));

  /* The old implementation faded its only visual cue after 2.6 seconds. A Find target
     should remain inked while the Find bar and query remain active. */
  await textPage.waitForTimeout(2850);
  const lastingTextVisual = await exactTextHighlight(textPage, TEXT_QUERY);
  check('text Find target remains highlighted beyond the old 2.6 second fade', lastingTextVisual.highlighted, JSON.stringify(lastingTextVisual));

  await textPage.fill('#findInput', MULTI_QUERY);
  await textPage.waitForFunction(() => /1 \/ 2/.test(document.getElementById('findCount').textContent));
  const firstOccurrence = await textPage.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('#textDocument .find-target'));
    return { count: targets.length, active: targets.findIndex(target => target.classList.contains('find-current')) };
  });
  check('each text occurrence receives its own visible Find target', firstOccurrence.count === 2, JSON.stringify(firstOccurrence));
  check('the first occurrence is active initially', firstOccurrence.active === 0, JSON.stringify(firstOccurrence));
  await textPage.click('#findNext');
  await textPage.waitForFunction(() => /2 \/ 2/.test(document.getElementById('findCount').textContent));
  const secondOccurrence = await textPage.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('#textDocument .find-target'));
    return { count: targets.length, active: targets.findIndex(target => target.classList.contains('find-current')) };
  });
  check('Next keeps both occurrences visible and activates the second one', secondOccurrence.count === 2 && secondOccurrence.active === 1, JSON.stringify(secondOccurrence));

  /* Exercise cleanup with the transient Find span nested inside a real saved marker.
     Closing Find may remove its own ink, but must leave the reader's annotation. */
  await textPage.fill('#findInput', SAVED_QUERY);
  await textPage.waitForFunction(() => /1 \/ 1/.test(document.getElementById('findCount').textContent));
  check('Find can target text inside a normal saved highlight',
    await textPage.locator('mark[data-hl-id="saved-highlight"] .find-target').count() === 1);
  await textPage.locator('#findInput').focus();
  await textPage.keyboard.press('Escape');
  await textPage.waitForFunction(() => document.getElementById('findBar').classList.contains('hidden'));
  const cleanup = await textPage.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const paper = state.chapters.find(chapter => chapter.id === 'find-text-fixture');
    const saved = document.querySelector('mark[data-hl-id="saved-highlight"]');
    return {
      targets: document.querySelectorAll('.find-target, .find-span').length,
      savedText: saved && saved.textContent,
      savedCount: paper && paper.textHighlights && paper.textHighlights.length
    };
  });
  check('closing Find clears every transient target', cleanup.targets === 0, JSON.stringify(cleanup));
  check('closing Find preserves the saved highlight in the page and storage',
    cleanup.savedText === SAVED_QUERY && cleanup.savedCount === 1, JSON.stringify(cleanup));
  check('text Find creates no page errors', textErrors.length === 0, textErrors.join('; '));

  const pdfPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const pdfErrors = [];
  pdfPage.on('pageerror', error => pdfErrors.push(error.message));
  await pdfPage.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.removeItem('readingRoom.lastOpen.v1');
  });
  await pdfPage.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await pdfPage.setInputFiles('#pdfFile', { name: 'split-find-phrase.pdf', mimeType: 'application/pdf', buffer: makeSplitPhrasePdf() });
  await pdfPage.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const paper = state.chapters.find(chapter => chapter.sourceName === 'split-find-phrase.pdf');
    return paper && paper.pageCount === 1;
  });
  await pdfPage.waitForSelector('.pdf-page[data-page="1"] .text-layer span');
  await enterFind(pdfPage, TEXT_QUERY);
  await pdfPage.waitForTimeout(350);
  const splitVisual = await pdfPage.evaluate(() => {
    const pieces = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).filter(span => /carbon|allocation/i.test(span.textContent));
    const targets = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .find-target')).filter(target => target.textContent.trim());
    const hosts = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .find-piece-host'));
    const visible = element => {
      const style = getComputedStyle(element);
      return style.backgroundColor !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(style.backgroundColor) || style.boxShadow !== 'none';
    };
    return {
      texts: pieces.map(span => span.textContent),
      highlighted: pieces.map(span => span.classList.contains('find-span')),
      allHighlighted: pieces.length >= 2 && pieces.every(span => span.classList.contains('find-span')),
      exactTexts: targets.map(target => target.textContent),
      exactTargetsVisible: targets.length === 2 && targets.every(visible),
      broadHostsInvisible: hosts.length >= 2 && hosts.every(host => !visible(host))
    };
  });
  check('PDF Find locates a phrase split across text-layer spans', (await pdfPage.locator('#findCount').textContent()).includes('1 / 1'), JSON.stringify(splitVisual.texts));
  check('PDF Find visibly highlights every span belonging to the target phrase', splitVisual.allHighlighted, JSON.stringify(splitVisual));
  check('PDF Find paints only the exact target pieces, not their whole text items',
    splitVisual.exactTargetsVisible && splitVisual.broadHostsInvisible && splitVisual.exactTexts.join(' ') === 'Carbon allocation', JSON.stringify(splitVisual));
  await pdfPage.waitForTimeout(2850);
  check('PDF Find target remains highlighted beyond the old 2.6 second fade',
    await pdfPage.locator('.pdf-page[data-page="1"] .find-target').count() >= 2);

  await pdfPage.evaluate(() => document.getElementById('reflowBtn').click());
  await pdfPage.waitForTimeout(1800);
  const readerFind = await pdfPage.evaluate(() => ({
    visible: !document.getElementById('textDocument').classList.contains('hidden'),
    count: document.getElementById('findCount').textContent,
    targets: document.querySelectorAll('#textDocument .find-target.find-current').length
  }));
  check('switching to Reader view recalculates and repaints the open Find query',
    readerFind.visible && /1 \/ 1/.test(readerFind.count) && readerFind.targets >= 1, JSON.stringify(readerFind));
  await pdfPage.evaluate(() => document.getElementById('reflowBtn').click());
  await pdfPage.waitForTimeout(1800);
  const restoredPdfFind = await pdfPage.evaluate(() => ({
    visible: !document.getElementById('pdfFrame').classList.contains('hidden'),
    count: document.getElementById('findCount').textContent,
    targets: document.querySelectorAll('.pdf-page[data-page="1"] .find-target.find-current').length
  }));
  check('switching back to PDF recalculates and repaints the open Find query',
    restoredPdfFind.visible && /1 \/ 1/.test(restoredPdfFind.count) && restoredPdfFind.targets >= 2, JSON.stringify(restoredPdfFind));

  await pdfPage.fill('#findInput', PDF_MULTI_QUERY);
  await pdfPage.waitForFunction(() => /1 \/ 2/.test(document.getElementById('findCount').textContent));
  const firstPdfOccurrence = await pdfPage.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .find-target')).filter(target => target.textContent.trim() === 'fruit');
    return { count: targets.length, active: targets.findIndex(target => target.classList.contains('find-current')) };
  });
  check('same-span PDF occurrences receive separate targets with the first active',
    firstPdfOccurrence.count === 2 && firstPdfOccurrence.active === 0, JSON.stringify(firstPdfOccurrence));
  await pdfPage.click('#findNext');
  await pdfPage.waitForFunction(() => /2 \/ 2/.test(document.getElementById('findCount').textContent));
  const secondPdfOccurrence = await pdfPage.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .find-target')).filter(target => target.textContent.trim() === 'fruit');
    return { count: targets.length, active: targets.findIndex(target => target.classList.contains('find-current')) };
  });
  check('PDF Next keeps both hits visible and activates the second same-span occurrence',
    secondPdfOccurrence.count === 2 && secondPdfOccurrence.active === 1, JSON.stringify(secondPdfOccurrence));

  await pdfPage.evaluate(() => document.querySelector('[data-pdf-layout="page"]').click());
  await pdfPage.waitForTimeout(1800);
  const rebuiltFind = await pdfPage.evaluate(() => ({
    layout: document.querySelector('[data-pdf-layout="page"]').getAttribute('aria-pressed'),
    count: document.getElementById('findCount').textContent,
    targets: document.querySelectorAll('.pdf-page[data-page="1"] .find-target').length,
    current: Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .find-target')).filter(target => target.textContent.trim() === 'fruit' && target.classList.contains('find-current')).length
  }));
  check('Page-layout rebuilding preserves the open query and its active exact target',
    rebuiltFind.layout === 'true' && /2 \/ 2/.test(rebuiltFind.count) && rebuiltFind.targets >= 2 && rebuiltFind.current === 1, JSON.stringify(rebuiltFind));
  check('PDF Find creates no page errors', pdfErrors.length === 0, pdfErrors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
