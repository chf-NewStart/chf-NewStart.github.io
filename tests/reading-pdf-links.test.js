let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_PDF_LINK_TEST_PORT || 8159);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

/* Named /FitR destinations exercise the coordinates used by journal citations. The
   first two annotations are adjacent and the third is narrower than two PDF points:
   dense or tiny citations used to become untappable after a phone-sized fit. Destination
   boundaries sit just above their reference baselines, as they do in publisher PDFs. */
function linkedPdfBuffer() {
  function stream(text) {
    return '<< /Length ' + Buffer.byteLength(text, 'ascii') + ' >>\nstream\n' + text + '\nendstream';
  }
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R /Names << /Dests 12 0 R >> >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 16 0 R] /Count 4 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 700] /Resources << /Font << /F1 15 0 R >> >> /Contents 4 0 R /Annots [9 0 R 10 0 R 11 0 R 13 0 R 14 0 R] >>',
    stream('BT\n/F1 16 Tf\n40 620 Td\n(Citations [1,2]) Tj\n0 -50 Td\n(Tiny citation [3]) Tj\n0 -50 Td\n(Safe external link) Tj\n0 -50 Td\n(Unsafe script link) Tj\nET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 700] /Resources << /Font << /F1 15 0 R >> >> /Contents 6 0 R >>',
    stream('BT\n/F1 16 Tf\n40 620 Td\n(Intervening page) Tj\nET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 700] /Resources << /Font << /F1 15 0 R >> >> /Contents 8 0 R >>',
    stream('BT\n/F1 18 Tf\n40 650 Td\n(REFERENCES) Tj\n/F1 14 Tf\n0 -60 Td\n([1] Alpha reference at the top of the list.) Tj\n0 -20 Td\n(Alpha continuation with journal details.) Tj\n0 -540 Td\n(Prior reference tail immediately above Beta.) Tj\n0 -10 Td\n([2] Beta reference near the bottom of the list.) Tj\n0 -10 Td\n(Beta continuation with journal details.) Tj\nET'),
    '<< /Type /Annot /Subtype /Link /Rect [150 615 151 638] /Border [0 0 0] /Dest (refA) >>',
    '<< /Type /Annot /Subtype /Link /Rect [154 615 155 638] /Border [0 0 0] /Dest (refB) >>',
    '<< /Type /Annot /Subtype /Link /Rect [150 565 151 588] /Border [0 0 0] /Dest (refTiny) >>',
    '<< /Names [(refA) [7 0 R /FitR 40 596 360 596] (refB) [7 0 R /FitR 40 26 360 26] (refTiny) [7 0 R /FitR 40 596 360 596]] >>',
    '<< /Type /Annot /Subtype /Link /Rect [40 515 180 538] /Border [0 0 0] /A << /S /URI /URI (https://example.com/paper) >> >>',
    '<< /Type /Annot /Subtype /Link /Rect [40 465 180 488] /Border [0 0 0] /A << /S /URI /URI (javascript:alert\\(1\\)) >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 700] /Resources << /Font << /F1 15 0 R >> >> /Contents 17 0 R >>',
    stream('BT\n/F1 16 Tf\n40 620 Td\n(Page after the references.) Tj\nET')
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

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject);server.listen(PORT, '127.0.0.1', resolve); });
  const executablePath = process.env.CHROME_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', guideOrientation: 'row', focus: false, guideDim: 55 }));
  });
  await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', { name: 'linked-references.pdf', mimeType: 'application/pdf', buffer: linkedPdfBuffer() });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .pdf-link').length === 4);

  const kinds = await page.locator('.pdf-page[data-page="1"] .pdf-link').evaluateAll(links => links.map(link => ({ kind: link.dataset.pdfLinkKind, dest: link.dataset.pdfDestination || '', href: link.href, rel: link.rel, target: link.target })));
  check('safe URL and three internal destinations render while unsafe JavaScript stays absent', kinds.length === 4 && kinds.filter(link => link.kind === 'internal').length === 3 && kinds.filter(link => link.kind === 'external').length === 1, JSON.stringify(kinds));
  const external = kinds.find(link => link.kind === 'external');
  check('safe external PDF URLs retain protected new-tab behavior', external && external.href === 'https://example.com/paper' && external.target === '_blank' && /noopener/.test(external.rel) && /noreferrer/.test(external.rel), JSON.stringify(external));

  await page.setViewportSize({ width: 360, height: 740 });
  /* The reader intentionally debounces both window- and pane-resize rebuilds. Wait
     past those two timers so a locator cannot retain the outgoing annotation layer. */
  await page.waitForTimeout(360);
  await page.waitForFunction(() => ['refA', 'refB', 'refTiny'].every(dest => {
    const link = document.querySelector('.pdf-link[data-pdf-destination="' + dest + '"]');
    return link && link.getBoundingClientRect().width >= 23.5;
  }));
  const phoneTargets = await page.locator('.pdf-link[data-pdf-link-kind="internal"]').evaluateAll(links => links.map(link => ({ dest: link.dataset.pdfDestination, width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height })));
  check('tiny and adjacent citations retain enlarged coarse-pointer phone targets', phoneTargets.length === 3 && phoneTargets.every(link => link.width >= 23.5 && link.height >= 23.5), JSON.stringify(phoneTargets));

  for (const expected of [{ dest: 'refA', text: 'Alpha reference' }, { dest: 'refB', text: 'Beta reference' }]) {
    const link = page.locator('.pdf-link[data-pdf-destination="' + expected.dest + '"]');
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(text => document.getElementById('pdfReferencePreviewText').textContent.includes(text), expected.text);
  }
  check('overlapping phone hitboxes route each authored citation center to its own reference', true);

  await page.setViewportSize({ width: 1000, height: 760 });
  await page.waitForTimeout(360);
  const refA = page.locator('.pdf-link[data-pdf-destination="refA"]');
  const refB = page.locator('.pdf-link[data-pdf-destination="refB"]');
  await refB.hover();
  await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden') && /Beta reference/.test(document.getElementById('pdfReferencePreviewText').textContent));
  const preview = await page.locator('#pdfReferencePreview').evaluate(card => ({ label: card.querySelector('.pdf-reference-preview-label').textContent, text: card.querySelector('p').textContent }));
  check('hover resolves a boundary destination into the intended bracketed reference', preview.label === 'Reference · p. 3' && /\[2\] Beta reference/.test(preview.text) && !/Prior reference tail|\[1\] Alpha reference/.test(preview.text), JSON.stringify(preview));

  const refABox = await refA.boundingBox();
  await page.touchscreen.tap(refABox.x + refABox.width / 2, refABox.y + refABox.height / 2);
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && document.querySelector('.pdf-destination-flash[data-pdf-y="596"]'));
  const firstJump = await page.evaluate(() => ({ top: parseFloat(document.querySelector('.pdf-destination-flash').style.top), scroll: document.getElementById('documentPane').scrollTop, toast: document.getElementById('readerToast').textContent }));
  check('click jumps to and flashes the first exact reference line', Number.isFinite(firstJump.top) && firstJump.top < 400 && /linked passage/.test(firstJump.toast), JSON.stringify(firstJump));

  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  const refBBox = await refB.boundingBox();
  await page.touchscreen.tap(refBBox.x + refBBox.width / 2, refBBox.y + refBBox.height / 2);
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && document.querySelector('.pdf-destination-flash[data-pdf-y="26"]'));
  await page.waitForTimeout(180);
  const secondJump = await page.evaluate(() => ({ page: document.getElementById('pageNumber').textContent, top: parseFloat(document.querySelector('.pdf-destination-flash').style.top), scroll: document.getElementById('documentPane').scrollTop }));
  check('a near-bottom /FitR coordinate stays on its destination page and line', secondJump.page.startsWith('3 /') && secondJump.top - firstJump.top > 500 && secondJump.scroll - firstJump.scroll > 400, JSON.stringify({ firstJump, secondJump }));

  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  check('Backspace returns to the citation page after an exact jump', true);

  await page.evaluate(() => {
    document.querySelector('.pdf-link[data-pdf-destination="refA"]').click();
    document.querySelector('.pdf-link[data-pdf-destination="refB"]').click();
  });
  await page.waitForFunction(() => document.querySelector('.pdf-destination-flash[data-pdf-y="26"]'));
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  check('rapid citation jumps preserve the original Backspace return spot', true);
  check('citation interactions produce no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
