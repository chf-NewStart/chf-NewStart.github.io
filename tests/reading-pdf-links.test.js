let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
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
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 700] /Resources << /Font << /F1 15 0 R >> >> /Contents 4 0 R /Annots [9 0 R 10 0 R 11 0 R 13 0 R 14 0 R 18 0 R] >>',
    stream('BT\n/F1 16 Tf\n40 620 Td\n(Citations [1,2]) Tj\n0 -50 Td\n(Tiny citation [3]) Tj\n0 -50 Td\n(Safe external link) Tj\n0 -50 Td\n(Unsafe script link) Tj\n0 -50 Td\n(Email link) Tj\nET'),
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
    stream('BT\n/F1 16 Tf\n40 620 Td\n(Page after the references.) Tj\nET'),
    '<< /Type /Annot /Subtype /Link /Rect [40 415 180 438] /Border [0 0 0] /A << /S /URI /URI (mailto:test@example.com) >> >>'
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
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const executablePath = process.env.CHROME_PATH || undefined;
  const launch = { headless: true };
  if (browserName === 'chromium' && executablePath) launch.executablePath = executablePath;
  if (browserName === 'webkit' && process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH) launch.executablePath = process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH;
  const browser = await browserType.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const errors = [];
  const thirdPartyRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).hostname === 'example.com') thirdPartyRequests.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', guideOrientation: 'row', focus: false, guideDim: 55 }));
  });
  await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', { name: 'linked-references.pdf', mimeType: 'application/pdf', buffer: linkedPdfBuffer() });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .pdf-link').length === 5);

  const kinds = await page.locator('.pdf-page[data-page="1"] .pdf-link').evaluateAll(links => links.map(link => ({ kind: link.dataset.pdfLinkKind, dest: link.dataset.pdfDestination || '', href: link.href, rel: link.rel, target: link.target })));
  check('safe URLs and three internal destinations render while unsafe JavaScript stays absent', kinds.length === 5 && kinds.filter(link => link.kind === 'internal').length === 3 && kinds.filter(link => link.kind === 'external').length === 2, JSON.stringify(kinds));
  const external = kinds.find(link => link.href === 'https://example.com/paper');
  check('safe external PDF URLs retain protected new-tab behavior', external && external.href === 'https://example.com/paper' && external.target === '_blank' && /noopener/.test(external.rel) && /noreferrer/.test(external.rel), JSON.stringify(external));

  const refSelector = dest => '.pdf-link[data-pdf-destination="' + dest + '"]';
  const externalSelector = '.pdf-link[href="https://example.com/paper"]';
  const previewHidden = () => page.locator('#pdfReferencePreview').evaluate(card => card.classList.contains('hidden'));
  const readerPosition = () => page.evaluate(() => ({ page: document.getElementById('pageNumber').textContent, scroll: document.getElementById('documentPane').scrollTop, url: location.href }));
  async function screenshot(name) {
    if (!process.env.PHLOEM_PDF_LINK_SCREENSHOT_DIR) return;
    fs.mkdirSync(process.env.PHLOEM_PDF_LINK_SCREENSHOT_DIR, { recursive: true });
    const file = path.join(process.env.PHLOEM_PDF_LINK_SCREENSHOT_DIR, browserName + '-' + name + '.png');
    await page.screenshot({ path: file });
    console.log('SCREENSHOT  ' + file);
  }
  async function citationPoint(selector) {
    const link = page.locator(selector);
    await link.scrollIntoViewIfNeeded();
    return link.evaluate(anchor => {
      const layer = anchor.parentElement.getBoundingClientRect();
      const scaleX = layer.width / anchor.parentElement.offsetWidth, scaleY = layer.height / anchor.parentElement.offsetHeight;
      return { x: layer.left + (+anchor.dataset.pdfSourceLeft + +anchor.dataset.pdfSourceWidth / 2) * scaleX, y: layer.top + (+anchor.dataset.pdfSourceTop + +anchor.dataset.pdfSourceHeight / 2) * scaleY };
    });
  }
  async function pointer(selector, type, pointerType = 'pen', options = {}) {
    const point = options.point || await citationPoint(selector);
    await page.locator(selector).evaluate((link, args) => {
      const active = args.type === 'pointerdown' || args.type === 'pointermove' && args.options.buttons === 1;
      const target = args.options.hitTest ? document.elementFromPoint(args.point.x, args.point.y) || link : link;
      target.dispatchEvent(new PointerEvent(args.type, { bubbles: true, cancelable: true, isPrimary: true, pointerId: 71, pointerType: args.pointerType, button: 0, buttons: active ? 1 : 0, pressure: active ? 0.5 : 0, clientX: args.point.x, clientY: args.point.y, ...args.options }));
    }, { type, pointerType, point, options });
    return point;
  }
  async function hold(selector, pointerType = 'mouse', hitTest = false) {
    const point = await citationPoint(selector);
    if (pointerType === 'mouse') {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
    } else {
      await pointer(selector, 'pointerdown', pointerType, { point, hitTest });
      await page.waitForTimeout(600);
      await pointer(selector, 'pointerup', pointerType, { point, hitTest });
    }
    await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden'));
  }
  async function closePreview() {
    await page.locator('#pdfReferenceClose').click();
    check('the reference card has an explicit close action', await previewHidden());
  }
  check('PDF annotation anchors do not expose native hover titles', await page.locator('.pdf-link').evaluateAll(links => links.every(link => !link.hasAttribute('title'))));
  let popups = 0;
  const unexpectedPopup = popup => { popups++; popup.close(); };
  page.on('popup', unexpectedPopup);
  for (const selector of [refSelector('refA'), externalSelector]) {
    const point = await citationPoint(selector);
    const before = await readerPosition();
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(650);
    check('mouse hover stays quiet for ' + selector, await previewHidden());
    for (const type of ['pen', 'touch']) {
      await pointer(selector, 'pointerover', type, { point });
      await pointer(selector, 'pointermove', type, { point });
      await page.waitForTimeout(100);
      check(type + ' hover stays quiet for ' + selector, await previewHidden());
    }
    await page.mouse.click(point.x, point.y, { button: 'middle' });
    await page.touchscreen.tap(point.x, point.y);
    await pointer(selector, 'pointerdown', 'pen', { point });
    await pointer(selector, 'pointerup', 'pen', { point });
    await page.locator(selector).evaluate(link => link.click());
    await page.waitForTimeout(650);
    const after = await readerPosition();
    check('middle clicks, finger and synthetic pen taps do not open or navigate ' + selector, await previewHidden() && JSON.stringify(before) === JSON.stringify(after) && popups === 0, JSON.stringify({ before, after, popups }));
    // A left mouse click is deliberate (the cursor is a pointing hand): an internal
    // link jumps and Backspace returns; a web link opens its card, never a tab.
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(1200);
    if (selector === externalSelector) {
      check('a left click on a web link opens its card without leaving the paper', !await previewHidden() && popups === 0 && JSON.stringify(before) === JSON.stringify(await readerPosition()));
      await page.locator('#pdfReferenceClose').click();
    } else {
      const jumped = await readerPosition();
      check('a left click on an internal link jumps to its destination', JSON.stringify(jumped) !== JSON.stringify(before) && await previewHidden() && popups === 0, JSON.stringify({ before, jumped }));
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(1200);
      check('Backspace returns from a clicked internal link', JSON.stringify(await readerPosition()) === JSON.stringify(before), JSON.stringify({ before, back: await readerPosition() }));
    }
  }
  await page.locator(refSelector('refA')).focus();
  await page.waitForTimeout(650);
  check('keyboard focus alone stays quiet', await previewHidden());
  for (const key of ['Enter', 'Space']) {
    await page.locator(refSelector('refA')).focus();
    await page.keyboard.press(key);
    await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden'));
    check(key + ' explicitly opens an accessible reference card without navigating', (await readerPosition()).page.startsWith('1 /') && await page.locator('#pdfReferenceOpen').isVisible());
    if (key === 'Space') {
      await page.locator('#pdfReferenceClose').focus();
      await page.keyboard.press('Space');
      check('Space on the focused card close button dismisses it normally', await previewHidden());
    } else await closePreview();
  }

  await hold(externalSelector);
  const externalPreview = await page.locator('#pdfReferencePreview').evaluate(card => ({ label: card.querySelector('.pdf-reference-preview-label').textContent, text: card.querySelector('p').textContent, external: card.classList.contains('external'), action: document.getElementById('pdfReferenceOpen').textContent, href: document.getElementById('pdfReferenceOpen').href, rel: document.getElementById('pdfReferenceOpen').rel, target: document.getElementById('pdfReferenceOpen').target }));
  check('holding an external link opens a persistent text-only host and URL card', externalPreview.external && externalPreview.label === 'External link · example.com' && externalPreview.text === 'https://example.com/paper' && externalPreview.action === 'Open link', JSON.stringify(externalPreview));
  check('the explicit external action retains protected new-tab behavior', externalPreview.href === 'https://example.com/paper' && externalPreview.target === '_blank' && /noopener/.test(externalPreview.rel) && /noreferrer/.test(externalPreview.rel), JSON.stringify(externalPreview));
  await page.mouse.move(1, 1);
  await page.waitForTimeout(200);
  check('a released hold card remains available when the pointer leaves the link', !await previewHidden());
  check('showing an external preview does not request third-party content', thirdPartyRequests.length === 0, JSON.stringify(thirdPartyRequests));
  await screenshot('external-card');
  await closePreview();
  await hold('.pdf-link[href^="mailto:"]');
  const emailAction = await page.locator('#pdfReferenceOpen').getAttribute('href');
  check('a held email link retains its explicit action without loading remote content', emailAction === 'mailto:test@example.com' && thirdPartyRequests.length === 0, emailAction);
  await closePreview();

  for (const type of ['touch', 'pen']) {
    await hold(refSelector('refA'), type);
    await page.waitForFunction(() => /Alpha reference/.test(document.getElementById('pdfReferencePreviewText').textContent));
    check('stationary synthetic ' + type + ' hold opens the reference and survives release', !await previewHidden() && (await readerPosition()).page.startsWith('1 /'));
    await closePreview();
  }
  await page.locator('#pdfWriteBtn').evaluate(button => button.click());
  const inkPoint = await citationPoint(refSelector('refA'));
  await page.evaluate(point => {
    const target = document.elementFromPoint(point.x, point.y);
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, pointerType: 'pen', pointerId: 81, button: 0, buttons: 1, pressure: 0.6, clientX: point.x, clientY: point.y }));
  }, inkPoint);
  check('the active-ink collision test starts a Pencil stroke', await page.locator('body').evaluate(body => body.classList.contains('pdf-ink-drawing')));
  await pointer(refSelector('refA'), 'pointerdown', 'touch', { point: inkPoint, pointerId: 82 });
  await page.waitForTimeout(600);
  check('a primary finger hold during an active Pencil stroke stays quiet without interrupting ink', await previewHidden() && await page.locator('body').evaluate(body => body.classList.contains('pdf-ink-drawing')));
  await pointer(refSelector('refA'), 'pointerup', 'touch', { point: inkPoint, pointerId: 82 });
  await pointer(refSelector('refA'), 'pointercancel', 'pen', { point: inkPoint, pointerId: 81 });
  await hold(refSelector('refA'), 'touch');
  check('a finger hold remains available when Pen is selected but no stroke is active', !await previewHidden());
  await closePreview();
  await page.locator('#pdfWriteBtn').evaluate(button => button.click());
  for (const cancellation of ['movement', 'pointercancel', 'second contact', 'scroll', 'resize', 'Escape']) {
    const selector = refSelector('refA');
    const point = await citationPoint(selector);
    await pointer(selector, 'pointerdown', 'pen', { point });
    await page.waitForTimeout(150);
    if (cancellation === 'movement') await pointer(selector, 'pointermove', 'pen', { point: { x: point.x + 9, y: point.y }, buttons: 1 });
    if (cancellation === 'pointercancel') await pointer(selector, 'pointercancel', 'pen', { point });
    if (cancellation === 'second contact') await pointer(selector, 'pointerdown', 'touch', { point, pointerId: 72, isPrimary: false });
    if (cancellation === 'scroll') await page.locator('#documentPane').evaluate(pane => pane.dispatchEvent(new Event('scroll')));
    if (cancellation === 'resize') await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    if (cancellation === 'Escape') await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check(cancellation + ' cancels a pending reference hold', await previewHidden());
    await pointer(selector, 'pointerup', 'pen', { point });
    if (cancellation === 'second contact') await pointer(selector, 'pointerup', 'touch', { point, pointerId: 72, isPrimary: false });
  }

  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const fingerPoint = await citationPoint(refSelector('refA'));
    const finger = { x: fingerPoint.x, y: fingerPoint.y, radiusX: 2, radiusY: 2, force: 1, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
    await page.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden'));
    check('Chromium native finger hold opens a card without following the reference', (await readerPosition()).page.startsWith('1 /'));
    await closePreview();
    const movingPoint = await citationPoint(refSelector('refA'));
    const movingFinger = { ...finger, x: movingPoint.x, y: movingPoint.y };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movingFinger] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...movingFinger, x: movingFinger.x + 30 }] });
    await page.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('Chromium native finger movement cancels the reference hold', await previewHidden() && (await readerPosition()).page.startsWith('1 /'));
    await cdp.detach();
  }

  const previewDefault = await page.locator('#pdfLinkPreviewBtn').getAttribute('aria-pressed');
  check('PDF link previews default on with a pressed-state toggle', previewDefault === 'true', previewDefault);
  await page.locator('#pdfLinkPreviewBtn').evaluate(button => button.click());
  await page.waitForTimeout(700);
  const previewOff = await page.evaluate(() => ({ pressed: document.getElementById('pdfLinkPreviewBtn').getAttribute('aria-pressed'), label: document.getElementById('pdfLinkPreviewBtn').textContent, stored: JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).linkPreviews, hidden: document.getElementById('pdfReferencePreview').classList.contains('hidden') }));
  check('the preview toggle turns previews off and persists locally', previewOff.pressed === 'false' && previewOff.label === 'Previews off' && previewOff.stored === false && previewOff.hidden, JSON.stringify(previewOff));
  await hold(refSelector('refA'));
  const minimalCard = await page.locator('#pdfReferencePreview').evaluate(card => ({ text: document.getElementById('pdfReferencePreviewText').textContent, action: document.getElementById('pdfReferenceOpen').textContent, visible: !card.classList.contains('hidden') }));
  check('previews off still allows a held minimal action card without a reference snippet', minimalCard.visible && minimalCard.action === 'Go to reference' && !/Alpha|Finding/.test(minimalCard.text), JSON.stringify(minimalCard));
  await screenshot('minimal-card');
  await closePreview();
  await page.locator('#pdfLinkPreviewBtn').evaluate(button => button.click());

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
    await hold(refSelector(expected.dest));
    await page.waitForFunction(text => document.getElementById('pdfReferencePreviewText').textContent.includes(text), expected.text);
    await screenshot('phone-' + expected.dest + '-card');
    await closePreview();
  }
  check('overlapping phone hitboxes route each authored citation center to its own reference', true);
  const adjacentPoint = await citationPoint(refSelector('refA'));
  check('adjacent citation regression reaches the overlapping link above the intended one',
    await page.evaluate(point => document.elementFromPoint(point.x, point.y).dataset.pdfDestination !== 'refA', adjacentPoint));
  for (const expected of [{ dest: 'refA', text: 'Alpha reference' }, { dest: 'refB', text: 'Beta reference' }]) {
    await hold(refSelector(expected.dest), 'pen', true);
    const previewText = await page.locator('#pdfReferencePreviewText').textContent();
    check('Pencil hold resolves the authored citation beneath overlapping targets: ' + expected.dest,
      previewText.includes(expected.text), previewText);
    await closePreview();
  }
  await hold(refSelector('refTiny'), 'touch');
  await page.waitForFunction(() => /Alpha reference/.test(document.getElementById('pdfReferencePreviewText').textContent));
  check('a tiny authored citation remains reachable by a touch hold on a phone', !await previewHidden());
  await closePreview();

  await page.setViewportSize({ width: 1000, height: 760 });
  await page.waitForTimeout(360);
  await hold(refSelector('refB'));
  await page.waitForFunction(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden') && /Beta reference/.test(document.getElementById('pdfReferencePreviewText').textContent));
  const preview = await page.locator('#pdfReferencePreview').evaluate(card => ({ label: card.querySelector('.pdf-reference-preview-label').textContent, text: card.querySelector('p').textContent }));
  check('hold resolves a boundary destination into the intended bracketed reference', preview.label === 'Reference · p. 3' && /\[2\] Beta reference/.test(preview.text) && !/Prior reference tail|\[1\] Alpha reference/.test(preview.text), JSON.stringify(preview));
  await screenshot('reference-card');
  await closePreview();
  await hold(refSelector('refA'));
  await page.locator('#pdfReferenceOpen').click();
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && document.querySelector('.pdf-destination-flash[data-pdf-y="596"]'));
  const firstJump = await page.evaluate(() => {
    const flash = document.querySelector('.pdf-destination-flash');
    const spans = [...document.querySelectorAll('.pdf-page[data-page="3"] .text-layer span')];
    const rectFor = text => { const span = spans.find(node => node.textContent.includes(text)); return span && span.getBoundingClientRect(); };
    const box = flash.getBoundingClientRect(), alpha = rectFor('Alpha reference'), continuation = rectFor('Alpha continuation'), next = rectFor('Beta reference');
    const contains = rect => rect && box.left <= rect.left + 1 && box.right >= rect.right - 1 && box.top <= rect.top + 1 && box.bottom >= rect.bottom - 1;
    const overlaps = rect => rect && box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
    return { top: parseFloat(flash.style.top), scroll: document.getElementById('documentPane').scrollTop, toast: document.getElementById('readerToast').textContent, kind: flash.dataset.pdfFlashKind, lines: +flash.dataset.pdfReferenceLines, containsAlpha: contains(alpha), containsContinuation: contains(continuation), overlapsNext: overlaps(next) };
  });
  check('the explicit action highlights the complete reference entry without including the next reference', firstJump.kind === 'reference' && firstJump.lines === 2 && firstJump.containsAlpha && firstJump.containsContinuation && !firstJump.overlapsNext, JSON.stringify(firstJump));
  check('the explicit action keeps the exact reference jump and return affordance', Number.isFinite(firstJump.top) && firstJump.top < 400 && /linked passage/.test(firstJump.toast), JSON.stringify(firstJump));
  await screenshot('reference-destination');

  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  await hold(refSelector('refB'));
  await page.locator('#pdfReferenceOpen').click();
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && document.querySelector('.pdf-destination-flash[data-pdf-y="26"]'));
  await page.waitForTimeout(180);
  const secondJump = await page.evaluate(() => ({ page: document.getElementById('pageNumber').textContent, top: parseFloat(document.querySelector('.pdf-destination-flash').style.top), scroll: document.getElementById('documentPane').scrollTop }));
  check('a near-bottom /FitR coordinate stays on its destination page and line', secondJump.page.startsWith('3 /') && secondJump.top - firstJump.top > 500 && secondJump.scroll - firstJump.scroll > 400, JSON.stringify({ firstJump, secondJump }));

  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  check('Backspace returns to the citation page after an exact jump', true);

  await page.locator(refSelector('refA')).focus();
  await page.keyboard.press('Enter');
  await page.locator('#pdfReferenceOpen').evaluate(action => action.click());
  await page.locator(refSelector('refB')).evaluate(link => link.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })));
  await page.locator('#pdfReferenceOpen').evaluate(action => action.click());
  await page.waitForFunction(() => document.querySelector('.pdf-destination-flash[data-pdf-y="26"]'));
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  check('successive explicit reference actions preserve the original Backspace return spot', true);
  await page.locator('#pdfLinkPreviewBtn').evaluate(button => button.click());
  await hold(refSelector('refA'));
  await page.locator('#pdfReferenceOpen').click();
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && document.querySelector('.pdf-destination-flash[data-pdf-y="596"]'));
  check('turning previews off preserves navigation through the held card action', await previewHidden());
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('1 /'));
  await page.locator('#pdfLinkPreviewBtn').evaluate(button => button.click());
  await page.context().route('https://example.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'Explicit external action reached.' }));
  await hold(externalSelector);
  page.off('popup', unexpectedPopup);
  const [openedLink] = await Promise.all([page.waitForEvent('popup'), page.locator('#pdfReferenceOpen').click()]);
  await openedLink.waitForURL('https://example.com/paper');
  check('the explicit external card action opens its protected URL in a new tab', openedLink.url() === 'https://example.com/paper' && await previewHidden());
  await openedLink.close();
  await pointer(refSelector('refA'), 'pointerdown', 'touch');
  await page.setInputFiles('#pdfFile', { name: 'replacement-references.pdf', mimeType: 'application/pdf', buffer: linkedPdfBuffer() });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .pdf-link').length === 5);
  await page.waitForTimeout(700);
  check('changing the PDF cancels a pending reference hold', await previewHidden());
  check('citation interactions produce no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
