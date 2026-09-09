let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PDF = path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const PORT = +(process.env.PHLOEM_BOOK_TEST_PORT || 8134);
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

/* A deliberately tiny PDF with a real internal annotation from page 1 to page 3.
   Keeping it in memory exercises PDF.js's destination path without another fixture. */
function linkedPdfBuffer() {
  function stream(text) {
    return '<< /Length ' + Buffer.byteLength(text, 'ascii') + ' >>\nstream\n' + text + '\nendstream';
  }
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /Annots [9 0 R] >>',
    stream('BT\n/F1 18 Tf\n40 330 Td\n(Jump to page 3) Tj\nET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 10 0 R >> >> /Contents 6 0 R >>',
    stream('BT\n/F1 18 Tf\n40 330 Td\n(Page 2) Tj\nET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 10 0 R >> >> /Contents 8 0 R >>',
    stream('BT\n/F1 18 Tf\n40 330 Td\n(Page 3 destination) Tj\nET'),
    '<< /Type /Annot /Subtype /Link /Rect [36 310 230 354] /Border [0 0 1] /Dest [7 0 R /Fit] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
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

async function fullPageMetrics(page) {
  return page.locator('#documentPane').evaluate(pane => {
    const papers = Array.from(pane.querySelectorAll('.pdf-page.book-active'));
    const paneRect = pane.getBoundingClientRect();
    return {
      count: papers.length,
      pages: papers.map(paper => {
        const sheet = paper.querySelector('.pdf-sheet');
        const paperRect = paper.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        return {
          page: +paper.dataset.page,
          left: paperRect.left,
          right: paperRect.right,
          top: paperRect.top,
          bottom: paperRect.bottom,
          holderWidth: paper.offsetWidth,
          holderHeight: paper.offsetHeight,
          sheetWidth: sheet.offsetWidth,
          sheetHeight: sheet.offsetHeight,
          transform: sheet.style.transform,
          cropped: paper.classList.contains('book-cropped')
        };
      }),
      pane: { left: paneRect.left, right: paneRect.right, top: paneRect.top, bottom: paneRect.bottom }
    };
  });
}

function pagesAreComplete(metrics) {
  return metrics.pages.every(page => !page.cropped && !page.transform && page.holderWidth === page.sheetWidth && page.holderHeight === page.sheetHeight && page.left >= metrics.pane.left - 2 && page.right <= metrics.pane.right + 2 && page.top >= metrics.pane.top - 2 && page.bottom <= metrics.pane.bottom + 2);
}

async function waitForCompleteFit(page, count) {
  await page.waitForFunction(expected => {
    const pane = document.getElementById('documentPane'), paneRect = pane.getBoundingClientRect();
    const frame = document.getElementById('pdfFrame');
    const papers = Array.from(pane.querySelectorAll('.pdf-page.book-active'));
    return frame.dataset.pagedReady === 'true' && !frame.hasAttribute('aria-busy') && papers.length === expected && papers.every(paper => {
      const rect = paper.getBoundingClientRect(), sheet = paper.querySelector('.pdf-sheet');
      return !paper.classList.contains('book-cropped') && !sheet.style.transform && paper.offsetWidth === sheet.offsetWidth && paper.offsetHeight === sheet.offsetHeight && rect.left >= paneRect.left - 2 && rect.right <= paneRect.right + 2 && rect.top >= paneRect.top - 2 && rect.bottom <= paneRect.bottom + 2;
    });
  }, count);
}

async function waitForPagedReady(page) {
  await page.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame');
    return frame.dataset.pagedReady === 'true' && !frame.hasAttribute('aria-busy');
  });
}

/* Playwright's touchscreen API intentionally exposes taps rather than a free-moving
   finger. Dispatch real Touch objects so the reader's touchstart/move/end path—not its
   mouse/pointer fallback—owns these page curls and two-finger gestures. */
async function dispatchTouches(page, selector, type, touches, changedTouches) {
  await page.locator(selector).evaluate((target, payload) => {
    function makeTouch(point) {
      return new Touch({
        identifier: point.id,
        target,
        clientX: point.x,
        clientY: point.y,
        pageX: point.x,
        pageY: point.y,
        screenX: point.x,
        screenY: point.y,
        radiusX: 3,
        radiusY: 3,
        force: point.force === undefined ? .65 : point.force
      });
    }
    const active = payload.touches.map(makeTouch);
    const changed = payload.changedTouches.map(makeTouch);
    target.dispatchEvent(new TouchEvent(payload.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      touches: active,
      targetTouches: active,
      changedTouches: changed
    }));
  }, { type, touches, changedTouches: changedTouches === undefined ? touches : changedTouches });
}

async function dispatchTouchTap(page, selector, touch) {
  await dispatchTouches(page, selector, 'touchstart', [touch]);
  await page.waitForTimeout(32);
  await dispatchTouches(page, selector, 'touchend', [], [touch]);
}

async function waitForBottomCornerCurl(page, tappedY) {
  const handle = await page.waitForFunction(expectedY => {
    const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress;
    if (frame.dataset.curlState !== 'settling' || frame.dataset.curlOrigin !== 'bottom-corner' || progress <= .04 || progress >= .96) return false;
    const under = frame.querySelector('.book-curl-under'), overlay = frame.querySelector('.book-curl-overlay'), front = frame.querySelector('.book-curl-front'), probe = frame.querySelector('.book-curl-tip');
    const frameRect = frame.getBoundingClientRect(), frontRect = front?.getBoundingClientRect(), probeTop = parseFloat(probe?.style.top), probeClientY = frameRect.top + probeTop;
    return {
      state: frame.dataset.curlState,
      origin: frame.dataset.curlOrigin,
      direction: frame.dataset.curlDirection,
      source: frame.dataset.curlSource,
      back: frame.dataset.curlBack,
      progress,
      under: under?.dataset.page || '',
      underClass: under?.className || '',
      overlayBack: overlay?.dataset.backPage || '',
      front: front?.dataset.page || '',
      probeDisplay: probe ? getComputedStyle(probe).display : 'missing',
      probeClientY,
      tapYError: Math.abs(probeClientY - expectedY),
      bottomEdgeError: frontRect ? Math.abs(probeClientY - frontRect.bottom) : Infinity,
      legacy: frame.querySelectorAll('.book-turning').length,
      label: document.getElementById('pageNumber').textContent
    };
  }, tappedY);
  const metrics = await handle.jsonValue();
  await handle.dispose();
  return metrics;
}

function bottomCornerProbeStartsAtTap(metrics) {
  return metrics.probeDisplay === 'none' && Number.isFinite(metrics.probeClientY) && metrics.tapYError < 32 && metrics.bottomEdgeError < 44;
}

/* A bound leaf may bend diagonally, but its whole spine edge must remain in the
   stationary front half. Sample that edge as well as its two corners so a clip that
   merely happens to touch the spine at one point cannot satisfy the regression. */
async function curlSpineMetrics(page, sourceSelector) {
  return page.locator('#pdfFrame').evaluate((frame, selector) => {
    const source = frame.querySelector(selector);
    const rect = source.getBoundingClientRect();
    const points = [];
    const pattern = /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px/g;
    let match;
    while ((match = pattern.exec(source.style.clipPath))) points.push({ x: +match[1], y: +match[2] });
    function contains(point) {
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
        const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
        const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
        if (length && Math.abs(cross) <= length * .25 && dot >= -.25 && dot <= length * length + .25) return true;
      }
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    }
    const binding = frame.dataset.curlBinding || '';
    const bindingX = binding === 'right' ? rect.width : 0;
    const sampleX = bindingX;
    const sampleCount = 11;
    let attachedSamples = 0;
    for (let i = 0; i < sampleCount; i++) {
      const y = .75 + (rect.height - 1.5) * i / (sampleCount - 1);
      if (contains({ x: sampleX, y })) attachedSamples++;
    }
    const cornerTolerance = 1.25;
    const attachedCorners = [0, rect.height].filter(y => points.some(point => Math.abs(point.x - bindingX) <= cornerTolerance && Math.abs(point.y - y) <= cornerTolerance)).length;
    return {
      binding,
      limited: frame.dataset.curlSpineLimited || '',
      spineYRaw: frame.dataset.curlSpineY || '',
      spineY: parseFloat(frame.dataset.curlSpineY),
      width: rect.width,
      height: rect.height,
      progress: +frame.dataset.curlProgress,
      origin: frame.dataset.curlOrigin || '',
      source: frame.dataset.curlSource || '',
      back: frame.dataset.curlBack || '',
      clipPoints: points.length,
      attachedCorners,
      attachedSamples,
      sampleCount
    };
  }, sourceSelector);
}

async function curlFxMetrics(page) {
  return page.locator('#pdfFrame').evaluate(frame => {
    const fx = frame.querySelector('.book-curl-fx');
    const tip = fx?.querySelector('.book-curl-tip');
    const cast = fx?.querySelector('.book-curl-cast');
    const ridge = fx?.querySelector('.book-curl-ridge');
    function visible(element) {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && +style.opacity > .05 && rect.width > 0 && rect.height > 0;
    }
    return {
      direction: frame.dataset.curlDirection || '',
      origin: frame.dataset.curlOrigin || '',
      tipDisplay: tip ? getComputedStyle(tip).display : 'missing',
      tipVisible: visible(tip),
      castVisible: visible(cast),
      ridgeVisible: visible(ridge)
    };
  });
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    /* Explicit old two-page users migrate to Book. */
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfDirection: 'vertical', verticalPages: 'two', guideOrientation: 'column', focus: false, guideDim: 55 }));
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => document.querySelector('.pdf-page.book-active canvas')?.width > 0 && document.getElementById('zoomLabel').textContent === 'Fit');
  await waitForCompleteFit(page, 1);

  check('the old explicit two-page preference migrates to Book', await page.locator('[data-pdf-layout="book"]').getAttribute('aria-pressed') === 'true');
  check('a phone keeps the Book preference but shows one page', await page.locator('#documentPane').evaluate(pane => pane.classList.contains('paged-pdf-flow') && !pane.classList.contains('book-spread')) && await page.locator('.pdf-page.book-active').count() === 1);
  check('the guide cue no longer conflates columns with book layout', !(await page.locator('#guideDiscoveryNote').textContent()).includes('Vertical book'));
  check('paged arrows use familiar left-to-right direction', await page.locator('#mPrev').textContent() === '←' && await page.locator('#mNext').textContent() === '→');
  const mobilePage = await fullPageMetrics(page);
  check('mobile Book fallback keeps the complete authored page', pagesAreComplete(mobilePage), JSON.stringify(mobilePage));

  /* The unavailable previous corner on page 1 remains ordinary page content. It must
     neither stage a phantom leaf nor steal the next intentional double-tap zoom. */
  await page.evaluate(() => {
    const frame = document.getElementById('pdfFrame');
    window.__unavailableCornerCurlSeen = false;
    window.__unavailableCornerObserver = new MutationObserver(() => {
      if (frame.dataset.curlState || frame.querySelector('.book-curl-overlay')) window.__unavailableCornerCurlSeen = true;
    });
    window.__unavailableCornerObserver.observe(frame, { attributes: true, attributeFilter: ['data-curl-state'], childList: true, subtree: true });
  });
  const unavailableCornerBox = await page.locator('.pdf-page[data-page="1"].book-single').boundingBox();
  const unavailablePreviousCorner = { id: 5, x: unavailableCornerBox.x + 12, y: unavailableCornerBox.y + unavailableCornerBox.height - 12 };
  await dispatchTouchTap(page, '.pdf-page[data-page="1"] canvas', unavailablePreviousCorner);
  await page.waitForTimeout(90);
  const unavailableFirstTap = await page.locator('#pdfFrame').evaluate(frame => ({ curlSeen: window.__unavailableCornerCurlSeen, label: document.getElementById('mPageLabel').textContent, artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('an unavailable first-page bottom-left corner remains inert after its first tap', !unavailableFirstTap.curlSeen && unavailableFirstTap.label.startsWith('1 /') && unavailableFirstTap.artifacts === 0, JSON.stringify(unavailableFirstTap));

  await dispatchTouchTap(page, '.pdf-page[data-page="1"] canvas', { ...unavailablePreviousCorner, id: 8 });
  await page.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame');
    return document.getElementById('zoomLabel').textContent !== 'Fit' && document.getElementById('mPageLabel').textContent.startsWith('1 /') && !frame.dataset.curlState && frame.dataset.pagedReady === 'true' && !frame.hasAttribute('aria-busy');
  });
  const unavailableBoundary = await page.locator('#pdfFrame').evaluate(frame => {
    window.__unavailableCornerObserver.disconnect();
    return {
      curlSeen: window.__unavailableCornerCurlSeen,
      zoom: document.getElementById('zoomLabel').textContent,
      label: document.getElementById('mPageLabel').textContent,
      artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length,
      ready: frame.dataset.pagedReady,
      busy: frame.hasAttribute('aria-busy')
    };
  });
  check('the unavailable corner remains an ordinary first tap for double-tap zoom', !unavailableBoundary.curlSeen && unavailableBoundary.zoom !== 'Fit' && unavailableBoundary.label.startsWith('1 /') && unavailableBoundary.artifacts === 0 && unavailableBoundary.ready === 'true' && !unavailableBoundary.busy, JSON.stringify(unavailableBoundary));
  await page.evaluate(() => document.getElementById('zoomLabel').click());
  await page.waitForFunction(() => document.getElementById('zoomLabel').textContent === 'Fit');
  await waitForCompleteFit(page, 1);

  /* Consecutive input must queue relative turns, not repeatedly request the page that
     was current when the first asynchronous render began. */
  await page.evaluate(() => { document.getElementById('mNext').click(); document.getElementById('mNext').click(); });
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlSource === '1' && document.querySelector('.book-curl-under-single[data-page="2"]'));
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlSource === '2' && document.getElementById('mPageLabel').textContent.startsWith('2 /'));
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('rapid Next input advances two physical one-page leaves', await page.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0, await page.locator('#mPageLabel').textContent());

  await page.once('dialog', dialog => dialog.accept('2'));
  await page.click('#mPageLabel');
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('2 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => { const frame=document.getElementById('pdfFrame'),progress=+frame.dataset.curlProgress;return frame.dataset.curlOrigin==='middle'&&frame.dataset.curlDirection==='next'&&frame.dataset.curlSource==='2'&&frame.dataset.curlBack==='2'&&progress>.05&&progress<.9&&document.querySelector('.book-curl-under-single[data-page="3"]')&&document.getElementById('mPageLabel').textContent.startsWith('2 /'); });
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlDirection === 'prev' && document.getElementById('pdfFrame').dataset.curlSource === '3' && document.getElementById('pdfFrame').dataset.curlBack === '3' && document.querySelector('.book-curl-under-single[data-page="2"]'));
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('2 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('narrow Book fallback uses physical single-leaf arrows and keyboard', await page.locator('.book-turning').count() === 0);

  await page.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  /* The visual curl is gone one frame before its queued fit releases the turn lock. */
  await page.waitForTimeout(120);
  const phoneTouchBox = await page.locator('.pdf-page[data-page="2"] canvas').boundingBox();
  const phoneTouchStart = { id: 7, x: phoneTouchBox.x + phoneTouchBox.width - 5, y: phoneTouchBox.y + phoneTouchBox.height * .55 };
  const phoneTouchEnd = { id: 7, x: phoneTouchStart.x - phoneTouchBox.width * .97, y: phoneTouchStart.y + 2 };
  await dispatchTouches(page, '.pdf-page[data-page="2"] canvas', 'touchstart', [phoneTouchStart]);
  await dispatchTouches(page, '.pdf-page[data-page="2"] canvas', 'touchmove', [phoneTouchEnd]);
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && document.getElementById('pdfFrame').dataset.curlSource === '2' && document.getElementById('pdfFrame').dataset.curlBack === '2' && document.querySelector('.book-curl-under-single[data-page="3"]'));
  await dispatchTouches(page, '.pdf-page[data-page="2"] canvas', 'touchend', [], [phoneTouchEnd]);
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('a phone finger physically folds the next page into view', await page.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);

  await page.click('#mMore');
  await page.click('#comfortBtn');
  await page.click('[data-guide-orientation="row"]');
  check('Guide direction is independent of Book layout', await page.locator('#documentPane').evaluate(pane => pane.classList.contains('paged-pdf-flow')) && await page.locator('#paneSpotlight').getAttribute('data-guide-orientation') === 'row');
  await page.click('[data-pdf-layout="page"]');
  await page.waitForFunction(() => document.getElementById('documentPane').classList.contains('paged-pdf-flow') && !document.getElementById('documentPane').classList.contains('book-spread'));
  check('Page is an explicit one-page layout', await page.locator('.pdf-page.book-active').count() === 1 && await page.locator('[data-pdf-layout="page"]').getAttribute('aria-pressed') === 'true');
  await page.click('#mNext');
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlOrigin === 'middle' && document.getElementById('pdfFrame').dataset.curlSource === '3' && document.getElementById('pdfFrame').dataset.curlBack === '3' && document.querySelector('.book-curl-under-single[data-page="4"]'));
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('4 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('explicit Page mode uses the same physical single-page turn', await page.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);
  await page.click('[data-pdf-layout="scroll"]');
  await page.waitForFunction(() => !document.getElementById('documentPane').classList.contains('paged-pdf-flow'));
  check('Scroll restores the continuous downward reader', await page.locator('.pdf-page').evaluateAll(pages => pages.filter(page => getComputedStyle(page).display !== 'none').length > 1));
  await page.click('[data-pdf-layout="book"]');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-spread') && document.querySelectorAll('.pdf-page.book-active').length === 2);
  if (await page.locator('#comfortBtn').getAttribute('aria-expanded') === 'true') await page.click('#comfortBtn');
  await page.once('dialog', dialog => dialog.accept('1'));
  await page.click('#pageNumber');
  await page.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-cover') && document.querySelectorAll('.pdf-page.book-active').length === 1 && !document.querySelector('.pdf-page.book-turning'));
  await waitForCompleteFit(page, 1);
  check('the cover occupies the right-hand leaf before opening', await page.locator('.pdf-page[data-page="1"]').evaluate(paper => paper.classList.contains('book-spread-right')) && await page.locator('#bookBlankLeaf').evaluate(blank => blank.classList.contains('book-placeholder-left')));

  await page.click('#nextPage');
  await page.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress;
    return frame.dataset.curlState === 'settling' && frame.dataset.curlOrigin === 'middle' && progress > .05 && progress < .95;
  });
  const coverTurn = await page.locator('#pdfFrame').evaluate(frame => {
    const paper = frame.querySelector('.pdf-page[data-page="1"]'), paperRect = paper.getBoundingClientRect(), frameRect = frame.getBoundingClientRect();
    return {
      gridColumn: getComputedStyle(paper).gridColumnStart,
      source: frame.dataset.curlSource,
      back: frame.dataset.curlBack,
      direction: frame.dataset.curlDirection,
      origin: frame.dataset.curlOrigin,
      under: !!frame.querySelector('.book-curl-under[data-page="3"]'),
      overlay: !!frame.querySelector('.book-curl-overlay'),
      front: paper.classList.contains('book-curl-front'),
      legacy: !!frame.querySelector('.book-flip-next'),
      label: document.getElementById('pageNumber').textContent,
      tipOffset: Math.abs(parseFloat(frame.querySelector('.book-curl-tip').style.top) - (paperRect.top - frameRect.top + paperRect.height / 2))
    };
  });
  check('the arrow physically sweeps the cover from its outer middle edge', coverTurn.gridColumn === '2' && coverTurn.source === '1' && coverTurn.back === '2' && coverTurn.direction === 'next' && coverTurn.origin === 'middle' && coverTurn.under && coverTurn.overlay && coverTurn.front && !coverTurn.legacy && coverTurn.label.startsWith('1 /') && coverTurn.tipOffset < 24, JSON.stringify(coverTurn));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState && !document.querySelector('.book-curl-overlay'));
  await page.waitForFunction(() => document.getElementById('zoomLabel').textContent === 'Fit' && !document.getElementById('pdfFrame').dataset.curlState);
  await waitForCompleteFit(page, 2);
  const spread = await fullPageMetrics(page);
  const sorted = spread.pages.slice().sort((a, b) => a.left - b.left);
  check('Book uses conventional 2–3 page parity', (await page.locator('#pageNumber').textContent()).startsWith('2–3 /') && sorted.map(p => p.page).join(',') === '2,3', JSON.stringify(spread));
  check('both spread pages preserve their full PDF boxes', pagesAreComplete(spread), JSON.stringify(spread));
  check('the two leaves meet at a physical center seam', Math.abs(sorted[0].right - sorted[1].left) <= 2, String(sorted[1].left - sorted[0].right));

  /* A queued resize/fit must never land after a deliberate zoom and undo it. */
  await page.evaluate(() => { document.getElementById('zoomLabel').click(); document.getElementById('zoomIn').click(); document.getElementById('zoomIn').click(); });
  await page.waitForTimeout(450);
  check('manual zoom wins over an in-flight Fit', (await page.locator('#zoomLabel').textContent()).endsWith('%'), await page.locator('#zoomLabel').textContent());
  await page.click('#nextPage');
  await page.waitForFunction(() => { const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress; return frame.dataset.curlState === 'settling' && frame.dataset.curlOrigin === 'middle' && frame.dataset.curlSource === '3' && progress > .05 && progress < .9; });
  check('automatic physical turns remain available in a manually zoomed Book', await page.locator('#documentPane').evaluate(pane => pane.scrollWidth > pane.clientWidth + 2));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.click('#prevPage');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.evaluate(() => document.getElementById('zoomLabel').click());
  await page.waitForFunction(() => document.getElementById('zoomLabel').textContent === 'Fit');
  await waitForCompleteFit(page, 2);

  await page.locator('#nextPage').click();
  await page.waitForFunction(() => { const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress; return frame.dataset.curlState === 'settling' && frame.dataset.curlOrigin === 'middle' && frame.dataset.curlDirection === 'next' && progress > .05 && progress < .9; });
  const arrowCurl = await page.locator('#pdfFrame').evaluate(frame => ({ source: frame.dataset.curlSource, back: frame.dataset.curlBack, under: !!frame.querySelector('.book-curl-under[data-page="5"]'), label: document.getElementById('pageNumber').textContent, overlays: frame.querySelectorAll('.book-curl-overlay').length, legacy: frame.querySelectorAll('.book-turning').length }));
  check('the toolbar arrow turns one physical sheet with its reverse and under-page', arrowCurl.source === '3' && arrowCurl.back === '4' && arrowCurl.under && arrowCurl.label.startsWith('2–3 /') && arrowCurl.overlays === 1 && arrowCurl.legacy === 0, JSON.stringify(arrowCurl));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => { const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress; return frame.dataset.curlState === 'settling' && frame.dataset.curlOrigin === 'middle' && frame.dataset.curlDirection === 'prev' && progress > .05 && progress < .9; });
  const keyCurl = await page.locator('#pdfFrame').evaluate(frame => ({ source: frame.dataset.curlSource, back: frame.dataset.curlBack, under: !!frame.querySelector('.book-curl-under[data-page="2"]'), label: document.getElementById('pageNumber').textContent }));
  check('the keyboard arrow uses the same physical backward fold', keyCurl.source === '4' && keyCurl.back === '3' && keyCurl.under && keyCurl.label.startsWith('4–5 /'), JSON.stringify(keyCurl));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);

  await page.click('#prevPage');
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlSource === '2' && document.getElementById('pdfFrame').dataset.curlBack === '1' && document.querySelector('#bookBlankLeaf.book-curl-under-left'));
  const automaticCoverBlank = await page.locator('#bookBlankLeaf').evaluate(blank => {
    const rect = blank.getBoundingClientRect(), sourceRect = document.querySelector('.pdf-page[data-page="2"]').getBoundingClientRect();
    return { width: rect.width, height: rect.height, sourceWidth: sourceRect.width, sourceHeight: sourceRect.height, background: getComputedStyle(blank).backgroundColor, hidden: blank.getAttribute('aria-hidden'), inert: blank.hasAttribute('inert') };
  });
  check('closing onto the cover reveals a page-sized, toned blank board leaf', Math.abs(automaticCoverBlank.width - automaticCoverBlank.sourceWidth) < 2 && Math.abs(automaticCoverBlank.height - automaticCoverBlank.sourceHeight) < 2 && automaticCoverBlank.background !== 'rgb(255, 255, 255)' && automaticCoverBlank.hidden === 'true' && automaticCoverBlank.inert, JSON.stringify(automaticCoverBlank));
  await page.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-cover') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.evaluate(() => { document.getElementById('nextPage').click(); document.getElementById('nextPage').click(); });
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlSource === '1');
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlSource === '3' && document.getElementById('pageNumber').textContent.startsWith('2–3 /'));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('rapid Next input queues two physical spreads in order', await page.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0, await page.locator('#pageNumber').textContent());

  await page.once('dialog', dialog => dialog.accept('1'));
  await page.click('#pageNumber');
  await page.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-cover') && !document.getElementById('pdfFrame').dataset.curlState);
  await page.click('#nextPage');
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'settling' && document.getElementById('pdfFrame').dataset.curlSource === '1' && document.getElementById('pageNumber').textContent.startsWith('1 /'));
  /* Queue another Book turn, then leave for Page while the first physical fold is
     still alive. A stale queued turn must not surface after the layout switch. */
  await page.evaluate(() => {
    document.getElementById('nextPage').click();
    document.querySelector('[data-pdf-layout="page"]').click();
  });
  await page.waitForTimeout(800);
  const leftDuringTurn = await page.evaluate(() => ({
    label: document.getElementById('pageNumber').textContent,
    pagePressed: document.querySelector('[data-pdf-layout="page"]').getAttribute('aria-pressed'),
    turning: document.querySelectorAll('.pdf-page.book-turning').length,
    curlState: document.getElementById('pdfFrame').dataset.curlState || '',
    artifacts: document.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front').length
  }));
  check('leaving Book cancels its in-flight and queued physical turns', leftDuringTurn.pagePressed === 'true' && leftDuringTurn.label.startsWith('1 /') && leftDuringTurn.turning === 0 && !leftDuringTurn.curlState && leftDuringTurn.artifacts === 0, JSON.stringify(leftDuringTurn));
  await page.evaluate(() => document.querySelector('[data-pdf-layout="book"]').click());
  await page.waitForTimeout(500);
  check('returning to Book does not replay the cancelled turn', (await page.locator('#pageNumber').textContent()).startsWith('1 /') && await page.locator('#pdfFrame').evaluate(frame => frame.classList.contains('book-cover')), await page.locator('#pageNumber').textContent());
  await page.click('#nextPage');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);

  await page.locator('.pdf-page.book-spread-right').click({ position: { x: 12, y: 12 } });
  check('either leaf can become the active note page without moving the spread', (await page.locator('#pageNumber').textContent()).startsWith('2–3 /') && (await page.locator('#noteHeading').textContent()) === 'Page 3 note');

  await page.locator('#nextPage').click();
  await page.waitForFunction(() => { const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress; return frame.dataset.curlState === 'settling' && frame.dataset.curlSource === '3' && progress > .05 && progress < .9; });
  await page.setViewportSize({ width: 1410, height: 880 });
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('a resize may interrupt the animation but cannot lose the requested arrow turn', await page.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(page, 2);
  await page.locator('#nextPage').click();
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlBack === '6' && document.querySelector('#bookBlankLeaf.book-curl-under-right'));
  const automaticFinalBlank = await page.locator('#bookBlankLeaf').evaluate(blank => {
    const rect = blank.getBoundingClientRect(), source = document.querySelector('.pdf-page[data-page="5"]'), sourceRect = source.getBoundingClientRect();
    return { width: rect.width, height: rect.height, sourceWidth: sourceRect.width, sourceHeight: sourceRect.height };
  });
  check('the arrow reveals a full blank mate beneath the final physical leaf', Math.abs(automaticFinalBlank.width - automaticFinalBlank.sourceWidth) < 2 && Math.abs(automaticFinalBlank.height - automaticFinalBlank.sourceHeight) < 2, JSON.stringify(automaticFinalBlank));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('6 /') && !document.getElementById('pdfFrame').dataset.curlState);
  const ending = await page.locator('#pdfFrame').evaluate(frame => {
    const page = frame.querySelector('.pdf-page.book-active'), blank = frame.querySelector('.book-blank-right');
    const pr = page.getBoundingClientRect(), br = blank.getBoundingClientRect();
    return { page: +page.dataset.page, pageLeft: pr.left, pageRight: pr.right, blankLeft: br.left, blankRight: br.right, blankDisplay: getComputedStyle(blank).display };
  });
  check('an even final page sits on the left with a blank facing leaf', ending.page === 6 && ending.blankDisplay !== 'none' && Math.abs(ending.pageRight - ending.blankLeft) <= 2 && await page.locator('#nextPage').isDisabled(), JSON.stringify(ending));
  const finalProgress = await page.locator('#progressRail').evaluate((rail) => ({ now: rail.getAttribute('aria-valuenow'), width: document.getElementById('progressFill').style.width }));
  check('the final physical spread reports complete reading progress', finalProgress.now === '100' && finalProgress.width === '100%', JSON.stringify(finalProgress));

  await page.click('#prevPage');
  await page.waitForFunction(() => { const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress; return frame.dataset.curlState === 'settling' && frame.dataset.curlOrigin === 'middle' && frame.dataset.curlDirection === 'prev' && progress > .05 && progress < .9; });
  const automaticFinalPrevious = await page.locator('#pdfFrame').evaluate(frame => ({ source: frame.dataset.curlSource, back: frame.dataset.curlBack, under: !!frame.querySelector('.book-curl-under[data-page="4"]'), label: document.getElementById('pageNumber').textContent }));
  check('the final left page physically folds back onto the preceding spread', automaticFinalPrevious.source === '6' && automaticFinalPrevious.back === '5' && automaticFinalPrevious.under && automaticFinalPrevious.label.startsWith('6 /'), JSON.stringify(automaticFinalPrevious));
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);

  /* A direct destination supersedes an automatic leaf already in flight; the canceled
     destination must never flash or replay after the requested jump lands. */
  await page.click('#nextPage');
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlSource === '5' && +document.getElementById('pdfFrame').dataset.curlProgress > .05);
  await page.once('dialog', dialog => dialog.accept('3'));
  await page.click('#pageNumber');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('a page jump supersedes an in-flight arrow curl without replaying it', await page.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0 && !(await page.locator('#pageNumber').textContent()).startsWith('6 /'));
  check('jumping to an odd page opens its containing spread and keeps it active', (await page.locator('#noteHeading').textContent()) === 'Page 3 note');

  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForFunction(() => !document.getElementById('pdfFrame').classList.contains('book-spread') && document.querySelectorAll('.pdf-page.book-active').length === 1);
  const fallback = await fullPageMetrics(page);
  check('Book responsively falls back to one complete page without changing the preference', await page.locator('[data-pdf-layout="book"]').getAttribute('aria-pressed') === 'true' && pagesAreComplete(fallback), JSON.stringify(fallback));

  await page.setViewportSize({ width: 1180, height: 360 });
  await page.waitForFunction(() => !document.getElementById('pdfFrame').classList.contains('book-spread') && document.querySelectorAll('.pdf-page.book-active').length === 1 && document.getElementById('zoomLabel').textContent === 'Fit');
  await page.waitForTimeout(650);
  const shortLandscape = await fullPageMetrics(page);
  check('a short landscape pane still fits every authored page edge', pagesAreComplete(shortLandscape), JSON.stringify(shortLandscape));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-spread') && document.getElementById('pageNumber').textContent.startsWith('2–3 /'));
  check('the spread returns when the pane has room again', true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#nextPage');
  await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /'));
  const reducedArtifacts = await page.locator('#pdfFrame').evaluate(frame => ({ state: frame.dataset.curlState || '', origin: frame.dataset.curlOrigin || '', active: frame.classList.contains('book-curl-active'), artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('reduced motion swaps spreads without staging a physical animation', !reducedArtifacts.state && !reducedArtifacts.origin && !reducedArtifacts.active && reducedArtifacts.artifacts === 0, JSON.stringify(reducedArtifacts));

  /* A real desktop pointer owns a Book corner continuously. This has its own context:
     changing the viewport of the mobile-emulated page above does not change its hover
     and pointer capabilities. */
  const curlContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const curl = await curlContext.newPage();
  curl.setDefaultTimeout(15000);
  curl.on('pageerror', error => errors.push(error.message));
  await curl.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'book', guideOrientation: 'row', focus: false, guideDim: 55 }));
  });
  await curl.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await curl.setInputFiles('#pdfFile', PDF);
  await curl.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-cover') && document.querySelector('.pdf-page[data-page="1"] canvas')?.width > 0);
  await waitForCompleteFit(curl, 1);
  await curl.evaluate(() => { window.__bookCurlClicks = 0; document.getElementById('pdfFrame').addEventListener('click', () => window.__bookCurlClicks++); });
  const coverBoxForCurl = await curl.locator('.pdf-page[data-page="1"].book-spread-right').boundingBox();
  const coverGrab = { x: coverBoxForCurl.x + coverBoxForCurl.width - 5, y: coverBoxForCurl.y + coverBoxForCurl.height - 18 };
  await curl.mouse.move(coverGrab.x, coverGrab.y);await curl.mouse.down();
  await curl.mouse.move(coverGrab.x - coverBoxForCurl.width * .96, coverGrab.y - 80, { steps: 18 });
  await curl.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlBack === '2' && document.querySelector('.book-curl-under[data-page="3"]'));
  await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.querySelector('.book-turning') && !document.getElementById('pdfFrame').dataset.curlState);
  check('the cover physically opens with page 2 on its back and page 3 underneath', await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0 && await curl.evaluate(() => window.__bookCurlClicks === 0));
  await waitForCompleteFit(curl, 2);

  let rightBox = await curl.locator('.pdf-page.book-spread-right').boundingBox();
  let start = { x: rightBox.x + rightBox.width - 5, y: rightBox.y + rightBox.height - 18 };
  await curl.mouse.move(start.x, start.y);
  await curl.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'ready');
  check('only the physical outer edge advertises a grabbable next leaf', await curl.locator('#pdfFrame').getAttribute('data-curl-direction') === 'next' && await curl.locator('.book-curl-ready-next').count() === 1);
  await curl.mouse.move(rightBox.x + rightBox.width * .5, start.y);
  check('moving away from the edge clears the page pickup', !(await curl.locator('#pdfFrame').getAttribute('data-curl-state')) && await curl.locator('.book-curl-ready-next').count() === 0);

  /* Hold a shallow fold long enough to remove flick velocity. The page number must stay
     on the old spread throughout direct manipulation and after the canceled settle. */
  await curl.mouse.move(start.x, start.y);
  await curl.mouse.down();
  await curl.mouse.move(start.x - rightBox.width * .70, start.y - 96, { steps: 16 });
  await curl.waitForFunction(() => +document.getElementById('pdfFrame').dataset.curlProgress > .3);
  await curl.waitForFunction(() => document.querySelector('.book-curl-back-canvas')?.width > 0 && !document.querySelector('.book-curl-back-fallback'));
  const partialCurl = await curl.locator('#pdfFrame').evaluate(frame => ({
    state: frame.dataset.curlState,
    direction: frame.dataset.curlDirection,
    progress: +frame.dataset.curlProgress,
    source: frame.dataset.curlSource,
    back: frame.dataset.curlBack,
    overlay: !!frame.querySelector('.book-curl-overlay'),
    backPixels: frame.querySelector('.book-curl-back-canvas')?.width || 0,
    under: frame.querySelectorAll('.book-curl-under').length,
    clipped: !!frame.querySelector('.book-curl-front')?.style.clipPath,
    label: document.getElementById('pageNumber').textContent
  }));
  check('the held corner exposes a live reverse page, crease, and under-page', partialCurl.state === 'dragging' && partialCurl.direction === 'next' && partialCurl.source === '3' && partialCurl.back === '4' && partialCurl.overlay && partialCurl.backPixels > 0 && partialCurl.under === 1 && partialCurl.clipped && partialCurl.label.startsWith('2–3 /'), JSON.stringify(partialCurl));
  await curl.waitForTimeout(180);
  await curl.mouse.up();
  await curl.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  check('a shallow held fold falls back without changing the spread', (await curl.locator('#pageNumber').textContent()).startsWith('2–3 /') && await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);

  rightBox = await curl.locator('.pdf-page.book-spread-right').boundingBox();
  start = { x: rightBox.x + rightBox.width - 5, y: rightBox.y + rightBox.height * .5 };
  await curl.mouse.move(start.x, start.y);await curl.mouse.down();
  await curl.mouse.move(start.x + 72, start.y + 3, { steps: 6 });await curl.mouse.up();
  await curl.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  check('pulling the right edge outward cannot turn the book backward', (await curl.locator('#pageNumber').textContent()).startsWith('2–3 /') && await curl.locator('.book-curl-overlay').count() === 0);

  rightBox = await curl.locator('.pdf-page.book-spread-right').boundingBox();
  start = { x: rightBox.x + rightBox.width - 5, y: rightBox.y + rightBox.height - 18 };
  await curl.mouse.move(start.x, start.y);
  await curl.mouse.down();
  await curl.mouse.move(start.x - rightBox.width * .96, start.y - 105, { steps: 18 });
  check('the page counter waits while a committed-size fold is still held', (await curl.locator('#pageNumber').textContent()).startsWith('2–3 /'));
  await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('releasing past the spine completes exactly one physical spread', await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(curl, 2);

  /* The final even page has a deliberately blank facing leaf. It still needs the
     full page box while revealed underneath a physical curl; otherwise the desk
     flashes through during the last turn. */
  rightBox = await curl.locator('.pdf-page.book-spread-right').boundingBox();
  start = { x: rightBox.x + rightBox.width - 5, y: rightBox.y + rightBox.height - 18 };
  await curl.mouse.move(start.x, start.y);await curl.mouse.down();
  await curl.mouse.move(start.x - rightBox.width * .96, start.y - 105, { steps: 18 });
  await curl.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && document.querySelector('#bookBlankLeaf.book-curl-under-right'));
  const finalBlankCurl = await curl.locator('#bookBlankLeaf').evaluate((blank, expected) => {
    const rect = blank.getBoundingClientRect();
    return { width: rect.width, height: rect.height, expectedWidth: expected.width, expectedHeight: expected.height };
  }, rightBox);
  check('the final blank facing leaf stays page-sized underneath the curl', Math.abs(finalBlankCurl.width - rightBox.width) < 2 && Math.abs(finalBlankCurl.height - rightBox.height) < 2, JSON.stringify(finalBlankCurl));
  await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('6 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('the last physical fold lands on the even final page with its blank mate', await curl.locator('#bookBlankLeaf.book-blank-right').count() === 1 && await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(curl, 1);

  const finalLeftBox = await curl.locator('.pdf-page[data-page="6"].book-spread-left').boundingBox();
  start = { x: finalLeftBox.x + 5, y: finalLeftBox.y + 22 };
  await curl.mouse.move(start.x, start.y);await curl.mouse.down();
  await curl.mouse.move(start.x + finalLeftBox.width * .96, start.y + 94, { steps: 18 });
  await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('the final left leaf can be folded back to the preceding spread', await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(curl, 2);

  const leftBox = await curl.locator('.pdf-page.book-spread-left').boundingBox();
  start = { x: leftBox.x + 5, y: leftBox.y + 22 };
  await curl.mouse.move(start.x, start.y);
  await curl.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlDirection === 'prev');
  await curl.mouse.down();
  await curl.mouse.move(start.x + leftBox.width * .96, start.y + 94, { steps: 18 });
  await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('the left outer edge folds the previous sheet back into place', await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(curl, 2);

  rightBox = await curl.locator('.pdf-page.book-spread-right').boundingBox();
  start = { x: rightBox.x + rightBox.width - 5, y: rightBox.y + rightBox.height - 18 };
  await curl.mouse.move(start.x, start.y);await curl.mouse.down();
  await curl.mouse.move(start.x - rightBox.width * .62, start.y - 40, { steps: 10 });
  await curl.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging');
  await curl.evaluate(() => document.querySelector('[data-pdf-layout="page"]').click());
  await curl.waitForFunction(() => document.querySelector('[data-pdf-layout="page"]').getAttribute('aria-pressed') === 'true' && !document.getElementById('pdfFrame').dataset.curlState);
  const labelAfterModeSwitch = await curl.locator('#pageNumber').textContent();
  await curl.mouse.up();await curl.waitForTimeout(480);
  check('leaving Book mid-drag removes the fold and ignores the late pointer release', await curl.locator('#pageNumber').textContent() === labelAfterModeSwitch && await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0, labelAfterModeSwitch);

  /* Page presents one centered leaf at a virtual side binding. Its controls use the
     same fold geometry, with faint outgoing ink on the reverse and the destination
     directly underneath. */
  check('switching from the spread preserves page 3 as a single complete sheet', labelAfterModeSwitch.startsWith('3 /'));
  await waitForCompleteFit(curl, 1);
  await curl.click('#nextPage');
  await curl.waitForFunction(() => { const frame=document.getElementById('pdfFrame'),progress=+frame.dataset.curlProgress;return frame.dataset.curlState==='settling'&&frame.dataset.curlOrigin==='middle'&&frame.dataset.curlSource==='3'&&frame.dataset.curlBack==='3'&&progress>.05&&progress<.9&&document.querySelector('.book-curl-under-single[data-page="4"]'); });
  const automaticSingleCurl = await curl.locator('#pdfFrame').evaluate(frame => {
    const source=frame.querySelector('.pdf-page[data-page="3"]'),under=frame.querySelector('.book-curl-under-single[data-page="4"]'),sr=source.getBoundingClientRect(),ur=under.getBoundingClientRect(),fr=frame.getBoundingClientRect();
    return { direction:frame.dataset.curlDirection,label:document.getElementById('pageNumber').textContent,overlays:frame.querySelectorAll('.book-curl-overlay.book-curl-single').length,legacy:frame.querySelectorAll('.book-turning').length,overlap:Math.max(Math.abs(sr.left-ur.left),Math.abs(sr.top-ur.top),Math.abs(sr.right-ur.right),Math.abs(sr.bottom-ur.bottom)),tipOffset:Math.abs(parseFloat(frame.querySelector('.book-curl-tip').style.top)-(sr.top-fr.top+sr.height/2)),backOpacity:parseFloat(getComputedStyle(frame.querySelector('.book-curl-back-canvas')).opacity),underHidden:under.getAttribute('aria-hidden'),underInert:under.hasAttribute('inert')};
  });
  check('Page arrows lift a centered physical sheet instead of the old stiff card', automaticSingleCurl.direction === 'next' && automaticSingleCurl.label.startsWith('3 /') && automaticSingleCurl.overlays === 1 && automaticSingleCurl.legacy === 0 && automaticSingleCurl.overlap < 2 && automaticSingleCurl.tipOffset < 24 && automaticSingleCurl.backOpacity < .4 && automaticSingleCurl.underHidden === 'true' && automaticSingleCurl.underInert, JSON.stringify(automaticSingleCurl));
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await waitForCompleteFit(curl, 1);

  let singleBox = await curl.locator('.pdf-page[data-page="4"].book-single').boundingBox();
  start = { x: singleBox.x + 5, y: singleBox.y + 24 };
  await curl.mouse.move(start.x,start.y);await curl.mouse.down();
  await curl.mouse.move(start.x + singleBox.width * .96,start.y + 88,{steps:18});
  await curl.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && document.getElementById('pdfFrame').dataset.curlDirection === 'prev' && document.getElementById('pdfFrame').dataset.curlSource === '4' && document.getElementById('pdfFrame').dataset.curlBack === '4' && document.querySelector('.book-curl-under-single[data-page="3"]'));
  await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('the single page’s left edge folds directly back to the preceding sheet', await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(curl, 1);

  singleBox = await curl.locator('.pdf-page[data-page="3"].book-single').boundingBox();
  start = { x: singleBox.x + singleBox.width - 5, y: singleBox.y + singleBox.height - 18 };
  await curl.mouse.move(start.x,start.y);await curl.mouse.down();
  await curl.mouse.move(start.x - singleBox.width * .70,start.y - 86,{steps:16});
  await curl.waitForFunction(() => +document.getElementById('pdfFrame').dataset.curlProgress > .3 && document.querySelector('.book-curl-under-single[data-page="4"]'));
  await curl.waitForTimeout(180);await curl.mouse.up();
  await curl.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  check('a shallow single-page fold falls back without navigating', (await curl.locator('#pageNumber').textContent()).startsWith('3 /') && await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);

  singleBox = await curl.locator('.pdf-page[data-page="3"].book-single').boundingBox();
  start = { x: singleBox.x + singleBox.width - 5, y: singleBox.y + singleBox.height - 18 };
  await curl.mouse.move(start.x,start.y);await curl.mouse.down();
  await curl.mouse.move(start.x - singleBox.width * .96,start.y - 88,{steps:18});await curl.mouse.up();
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('a committed single-page drag advances exactly one sheet', await curl.locator('.book-curl-overlay,.book-curl-under,.book-curl-front').count() === 0);
  await waitForCompleteFit(curl, 1);

  /* If responsive fitting rebuilds the page while an arrow curl is running, the turn
     still lands—but it must never resurrect the retired rigid-card animation. */
  await curl.evaluate(() => {
    window.__singleLegacyTurnSeen = false;
    window.__singleLegacyTurnObserver = new MutationObserver(() => {
      if (document.querySelector('.pdf-page.book-turning')) window.__singleLegacyTurnSeen = true;
    });
    window.__singleLegacyTurnObserver.observe(document.getElementById('pdfFrame'), { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  await curl.click('#nextPage');
  await curl.waitForFunction(() => { const frame=document.getElementById('pdfFrame'),progress=+frame.dataset.curlProgress;return frame.dataset.curlState==='settling'&&frame.dataset.curlSource==='4'&&progress>.05&&progress<.9; });
  await curl.setViewportSize({ width: 1380, height: 870 });
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  const interruptedSingle = await curl.evaluate(() => {
    window.__singleLegacyTurnObserver.disconnect();
    return { legacySeen: window.__singleLegacyTurnSeen, artifacts: document.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length };
  });
  check('a Page resize never falls back to the old stiff card', !interruptedSingle.legacySeen && interruptedSingle.artifacts === 0, JSON.stringify(interruptedSingle));

  await curl.emulateMedia({ reducedMotion: 'reduce' });
  await curl.click('#nextPage');
  await curl.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('6 /'));
  const reducedSingle = await curl.locator('#pdfFrame').evaluate(frame => ({state:frame.dataset.curlState||'',origin:frame.dataset.curlOrigin||'',artifacts:frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length}));
  check('reduced motion changes a single page without staging a curl', !reducedSingle.state && !reducedSingle.origin && reducedSingle.artifacts === 0, JSON.stringify(reducedSingle));
  await curlContext.close();

  /* Touch-only tablets must manipulate the same paper geometry directly. A separate
     coarse-pointer context keeps this honest: synthetic TouchEvents never pass through
     the desktop pointer handlers exercised above. */
  const touchContext = await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const touch = await touchContext.newPage();
  touch.setDefaultTimeout(15000);
  touch.on('pageerror', error => errors.push(error.message));
  await touch.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'book', guideOrientation: 'row', focus: false, guideDim: 55 }));
  });
  await touch.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await touch.setInputFiles('#pdfFile', PDF);
  await touch.waitForFunction(() => document.getElementById('pdfFrame').classList.contains('book-cover') && document.querySelector('.pdf-page[data-page="1"] canvas')?.width > 0);
  await waitForCompleteFit(touch, 1);
  const touchCapabilities = await touch.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints, spread: document.getElementById('pdfFrame').classList.contains('book-spread'), touchAction: getComputedStyle(document.getElementById('documentPane')).touchAction }));
  check('the tablet regression runs through a coarse touch Book spread', touchCapabilities.coarse && touchCapabilities.touchPoints > 0 && touchCapabilities.spread && touchCapabilities.touchAction === 'none', JSON.stringify(touchCapabilities));
  await touch.evaluate(() => {
    window.__touchLegacyTurnSeen = false;
    window.__touchLegacyObserver = new MutationObserver(() => {
      if (document.querySelector('.pdf-page.book-turning')) window.__touchLegacyTurnSeen = true;
    });
    window.__touchLegacyObserver.observe(document.getElementById('pdfFrame'), { attributes: true, attributeFilter: ['class'], subtree: true });
  });

  const touchIntentBox = await touch.locator('.pdf-page[data-page="1"] canvas').boundingBox();
  const stillFinger = { id: 29, x: touchIntentBox.x + touchIntentBox.width * .5, y: touchIntentBox.y + touchIntentBox.height * .5 };
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchstart', [stillFinger]);
  await touch.waitForTimeout(340);
  check('resting a finger on tablet paper does not arm or turn a leaf', !(await touch.locator('#pdfFrame').getAttribute('data-curl-state')) && (await touch.locator('#pageNumber').textContent()).startsWith('1 /'));
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchend', [], [stillFinger]);
  const verticalStart = { id: 30, x: touchIntentBox.x + touchIntentBox.width * .52, y: touchIntentBox.y + touchIntentBox.height * .38 };
  const verticalMove = { id: 30, x: verticalStart.x + 6, y: verticalStart.y + 94 };
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchstart', [verticalStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchmove', [verticalMove]);
  check('vertical tablet motion is not mistaken for a page turn', !(await touch.locator('#pdfFrame').getAttribute('data-curl-state')) && (await touch.locator('#pageNumber').textContent()).startsWith('1 /'));
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchend', [], [verticalMove]);

  /* Open the cover with a finger in three stages. Progress and the crease tip must keep
     moving with the finger before release; the page counter remains on the old spread. */
  let touchBox = await touch.locator('.pdf-page[data-page="1"].book-spread-right').boundingBox();
  let fingerStart = { id: 31, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height * .72 };
  let fingerOne = { id: 31, x: fingerStart.x - touchBox.width * .30, y: fingerStart.y - 18 };
  let fingerTwo = { id: 31, x: fingerStart.x - touchBox.width * .62, y: fingerStart.y - 64 };
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchstart', [fingerStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchmove', [fingerOne]);
  await touch.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && +document.getElementById('pdfFrame').dataset.curlProgress > .08);
  const coverTouchOne = await touch.locator('#pdfFrame').evaluate(frame => ({ progress: +frame.dataset.curlProgress, tipLeft: parseFloat(frame.querySelector('.book-curl-tip').style.left) }));
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchmove', [fingerTwo]);
  await touch.waitForFunction(previous => +document.getElementById('pdfFrame').dataset.curlProgress > previous + .08, coverTouchOne.progress);
  const coverTouchTwo = await touch.locator('#pdfFrame').evaluate(frame => ({
    state: frame.dataset.curlState,
    direction: frame.dataset.curlDirection,
    source: frame.dataset.curlSource,
    back: frame.dataset.curlBack,
    progress: +frame.dataset.curlProgress,
    tipLeft: parseFloat(frame.querySelector('.book-curl-tip').style.left),
    under: !!frame.querySelector('.book-curl-under-right[data-page="3"]'),
    overlay: !!frame.querySelector('.book-curl-overlay[data-back-page="2"]'),
    clipped: !!frame.querySelector('.book-curl-front[data-page="1"]')?.style.clipPath,
    label: document.getElementById('pageNumber').textContent,
    legacy: frame.querySelectorAll('.book-turning').length
  }));
  check('an iPad finger continuously bends the cover with its physical back and under-page', coverTouchTwo.state === 'dragging' && coverTouchTwo.direction === 'next' && coverTouchTwo.source === '1' && coverTouchTwo.back === '2' && coverTouchTwo.progress > coverTouchOne.progress && coverTouchTwo.tipLeft < coverTouchOne.tipLeft - 30 && coverTouchTwo.under && coverTouchTwo.overlay && coverTouchTwo.clipped && coverTouchTwo.label.startsWith('1 /') && coverTouchTwo.legacy === 0, JSON.stringify({ first: coverTouchOne, second: coverTouchTwo }));
  const coverCommit = { id: 31, x: fingerStart.x - touchBox.width * .97, y: fingerStart.y - 78 };
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchmove', [coverCommit]);
  await dispatchTouches(touch, '.pdf-page[data-page="1"] canvas', 'touchend', [], [coverCommit]);
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('releasing the touch cover past its threshold opens one spread cleanly', await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);
  await waitForCompleteFit(touch, 2);

  /* A bottom corner is a tap target, not a direction lock: decisive vertical travel
     must still cancel the tap before its release can queue an automatic turn. */
  touchBox = await touch.locator('.pdf-page[data-page="3"].book-spread-right').boundingBox();
  const cornerVerticalStart = { id: 48, x: touchBox.x + touchBox.width - 12, y: touchBox.y + touchBox.height - 12 };
  const cornerVerticalMove = { id: 48, x: cornerVerticalStart.x - 1, y: cornerVerticalStart.y - 12 };
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchstart', [cornerVerticalStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchmove', [cornerVerticalMove]);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchend', [], [cornerVerticalMove]);
  await touch.waitForTimeout(560);
  check('vertical movement from a Book corner remains a gesture rather than a tap turn', (await touch.locator('#pageNumber').textContent()).startsWith('2–3 /') && !(await touch.locator('#pdfFrame').getAttribute('data-curl-state')) && await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);

  /* Quick taps on the two physical outer corners reuse the paper curl and return to
     the same spread after advancing and reversing exactly once. */
  touchBox = await touch.locator('.pdf-page[data-page="3"].book-spread-right').boundingBox();
  const bookCornerNext = { id: 49, x: touchBox.x + touchBox.width - 12, y: touchBox.y + touchBox.height - 12 };
  await dispatchTouchTap(touch, '.pdf-page[data-page="3"] canvas', bookCornerNext);
  const bookCornerNextCurl = await waitForBottomCornerCurl(touch, bookCornerNext.y);
  check('a Book bottom-right tap animates the next physical spread from that corner', bookCornerNextCurl.direction === 'next' && bookCornerNextCurl.source === '3' && bookCornerNextCurl.back === '4' && bookCornerNextCurl.front === '3' && bookCornerNextCurl.overlayBack === '4' && bookCornerNextCurl.under === '5' && bookCornerNextCurl.underClass.includes('book-curl-under-right') && bookCornerNextCurl.label.startsWith('2–3 /') && bookCornerNextCurl.legacy === 0 && bottomCornerProbeStartsAtTap(bookCornerNextCurl), JSON.stringify(bookCornerNextCurl));
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await waitForCompleteFit(touch, 2);
  const bookCornerNextFinal = await touch.locator('#pdfFrame').evaluate(frame => ({ pages: Array.from(frame.querySelectorAll('.pdf-page.book-active')).map(page => page.dataset.page).join(','), artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('the Book bottom-right tap advances exactly one spread', bookCornerNextFinal.pages === '4,5' && bookCornerNextFinal.artifacts === 0, JSON.stringify(bookCornerNextFinal));

  touchBox = await touch.locator('.pdf-page[data-page="4"].book-spread-left').boundingBox();
  const bookCornerPrevious = { id: 50, x: touchBox.x + 12, y: touchBox.y + touchBox.height - 12 };
  await dispatchTouchTap(touch, '.pdf-page[data-page="4"] canvas', bookCornerPrevious);
  const bookCornerPreviousCurl = await waitForBottomCornerCurl(touch, bookCornerPrevious.y);
  check('a Book bottom-left tap animates the previous physical spread from that corner', bookCornerPreviousCurl.direction === 'prev' && bookCornerPreviousCurl.source === '4' && bookCornerPreviousCurl.back === '3' && bookCornerPreviousCurl.front === '4' && bookCornerPreviousCurl.overlayBack === '3' && bookCornerPreviousCurl.under === '2' && bookCornerPreviousCurl.underClass.includes('book-curl-under-left') && bookCornerPreviousCurl.label.startsWith('4–5 /') && bookCornerPreviousCurl.legacy === 0 && bottomCornerProbeStartsAtTap(bookCornerPreviousCurl), JSON.stringify(bookCornerPreviousCurl));
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await waitForCompleteFit(touch, 2);
  const bookCornerPreviousFinal = await touch.locator('#pdfFrame').evaluate(frame => ({ pages: Array.from(frame.querySelectorAll('.pdf-page.book-active')).map(page => page.dataset.page).join(','), artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('the Book bottom-left tap returns exactly one spread', bookCornerPreviousFinal.pages === '2,3' && bookCornerPreviousFinal.artifacts === 0, JSON.stringify(bookCornerPreviousFinal));

  /* Pull the bottom loose corner hard toward the opposite top side. A free half-plane
     fold would cut through the left binding here; the constrained fold must instead
     meet a spine corner while every point on the binding remains stationary. */
  touchBox = await touch.locator('.pdf-page[data-page="3"].book-spread-right').boundingBox();
  const bookDiagonalStart = { id: 45, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height * .86 };
  const bookDiagonalMove = { id: 45, x: touchBox.x - touchBox.width * .18, y: touchBox.y + touchBox.height * .14 };
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchstart', [bookDiagonalStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchmove', [bookDiagonalMove]);
  await touch.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame');
    return frame.dataset.curlState === 'dragging' && frame.dataset.curlSpineLimited === 'true' && frame.dataset.curlSource === '3' && frame.dataset.curlBack === '4' && document.querySelector('.book-curl-under-right[data-page="5"]');
  });
  const bookSpine = await curlSpineMetrics(touch, '.book-curl-front[data-page="3"]');
  const bookSpineBoundaryError = Math.min(Math.abs(bookSpine.spineY), Math.abs(bookSpine.spineY - bookSpine.height));
  check('a deep diagonal Book pull stays physically attached along the entire left binding', bookSpine.binding === 'left' && bookSpine.limited === 'true' && bookSpine.origin === 'finger' && bookSpine.source === '3' && bookSpine.back === '4' && bookSpine.progress > .5 && bookSpine.progress < .7 && Number.isFinite(bookSpine.spineY) && bookSpine.spineY >= -1.5 && bookSpine.spineY <= bookSpine.height + 1.5 && bookSpineBoundaryError <= 1.5 && bookSpine.clipPoints >= 3 && bookSpine.attachedCorners === 2 && bookSpine.attachedSamples === bookSpine.sampleCount, JSON.stringify(bookSpine));
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchcancel', [], [bookDiagonalMove]);
  await touch.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  const bookSpineCancel = await touch.locator('#pdfFrame').evaluate(frame => ({ label: document.getElementById('pageNumber').textContent, binding: frame.dataset.curlBinding || '', limited: frame.dataset.curlSpineLimited || '', spineY: frame.dataset.curlSpineY || '', artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('canceling that diagonal Book pull leaves the original spread and no curl state', bookSpineCancel.label.startsWith('2–3 /') && !bookSpineCancel.binding && !bookSpineCancel.limited && !bookSpineCancel.spineY && bookSpineCancel.artifacts === 0, JSON.stringify(bookSpineCancel));

  /* A held partial fold loses its flick velocity and returns to the same spread. This
     catches touchend paths that accidentally invoke the retired compact card turn. */
  touchBox = await touch.locator('.pdf-page[data-page="3"].book-spread-right').boundingBox();
  fingerStart = { id: 32, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height - 22 };
  fingerTwo = { id: 32, x: fingerStart.x - touchBox.width * .66, y: fingerStart.y - 74 };
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchstart', [fingerStart]);
  await touch.waitForTimeout(60);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchmove', [fingerTwo]);
  await touch.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame'), progress = +frame.dataset.curlProgress;
    return frame.dataset.curlState === 'dragging' && frame.dataset.curlSource === '3' && frame.dataset.curlBack === '4' && progress > .2 && progress < .4 && document.querySelector('.book-curl-under-right[data-page="5"]');
  });
  await touch.waitForTimeout(360);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchend', [], [fingerTwo]);
  await touch.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  check('a shallow held tablet fold springs back without changing the spread', (await touch.locator('#pageNumber').textContent()).startsWith('2–3 /') && await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);

  touchBox = await touch.locator('.pdf-page[data-page="3"].book-spread-right').boundingBox();
  fingerStart = { id: 33, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height * .58 };
  const spreadCommit = { id: 33, x: fingerStart.x - touchBox.width * .97, y: fingerStart.y - 58 };
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchstart', [fingerStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchmove', [spreadCommit]);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchend', [], [spreadCommit]);
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('4–5 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('a committed tablet fold advances exactly one physical spread', await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);
  await waitForCompleteFit(touch, 2);

  touchBox = await touch.locator('.pdf-page[data-page="4"].book-spread-left').boundingBox();
  fingerStart = { id: 34, x: touchBox.x + 5, y: touchBox.y + touchBox.height * .42 };
  const spreadBack = { id: 34, x: fingerStart.x + touchBox.width * .97, y: fingerStart.y + 52 };
  await dispatchTouches(touch, '.pdf-page[data-page="4"] canvas', 'touchstart', [fingerStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="4"] canvas', 'touchmove', [spreadBack]);
  await touch.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlDirection === 'prev' && document.getElementById('pdfFrame').dataset.curlSource === '4' && document.getElementById('pdfFrame').dataset.curlBack === '3' && document.querySelector('.book-curl-under-left[data-page="2"]'));
  await dispatchTouches(touch, '.pdf-page[data-page="4"] canvas', 'touchend', [], [spreadBack]);
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2–3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('the left page follows a tablet finger back to the preceding spread', await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);
  await waitForCompleteFit(touch, 2);

  /* Page mode is a single virtually bound leaf rather than a spread: its outgoing ink
     appears faintly on the moving reverse while the destination occupies the exact
     same paper box. */
  await touch.evaluate(() => document.querySelector('[data-pdf-layout="page"]').click());
  await touch.waitForFunction(() => document.querySelector('[data-pdf-layout="page"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.pdf-page.book-active').length === 1 && !document.getElementById('pdfFrame').classList.contains('book-spread'));
  await waitForCompleteFit(touch, 1);

  touchBox = await touch.locator('.pdf-page[data-page="2"].book-single').boundingBox();
  const pageCornerNext = { id: 51, x: touchBox.x + touchBox.width - 12, y: touchBox.y + touchBox.height - 12 };
  await dispatchTouchTap(touch, '.pdf-page[data-page="2"] canvas', pageCornerNext);
  const pageCornerNextCurl = await waitForBottomCornerCurl(touch, pageCornerNext.y);
  check('a Page bottom-right tap animates the next bound leaf from that corner', pageCornerNextCurl.direction === 'next' && pageCornerNextCurl.source === '2' && pageCornerNextCurl.back === '2' && pageCornerNextCurl.front === '2' && pageCornerNextCurl.overlayBack === '2' && pageCornerNextCurl.under === '3' && pageCornerNextCurl.underClass.includes('book-curl-under-single') && pageCornerNextCurl.label.startsWith('2 /') && pageCornerNextCurl.legacy === 0 && bottomCornerProbeStartsAtTap(pageCornerNextCurl), JSON.stringify(pageCornerNextCurl));
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await waitForCompleteFit(touch, 1);
  const pageCornerNextFinal = await touch.locator('#pdfFrame').evaluate(frame => ({ pages: Array.from(frame.querySelectorAll('.pdf-page.book-active')).map(page => page.dataset.page).join(','), artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('the Page bottom-right tap advances exactly one page', pageCornerNextFinal.pages === '3' && pageCornerNextFinal.artifacts === 0, JSON.stringify(pageCornerNextFinal));

  touchBox = await touch.locator('.pdf-page[data-page="3"].book-single').boundingBox();
  const pageCornerPrevious = { id: 52, x: touchBox.x + 12, y: touchBox.y + touchBox.height - 12 };
  await dispatchTouchTap(touch, '.pdf-page[data-page="3"] canvas', pageCornerPrevious);
  const pageCornerPreviousCurl = await waitForBottomCornerCurl(touch, pageCornerPrevious.y);
  check('a Page bottom-left tap animates the previous bound leaf from that corner', pageCornerPreviousCurl.direction === 'prev' && pageCornerPreviousCurl.source === '3' && pageCornerPreviousCurl.back === '3' && pageCornerPreviousCurl.front === '3' && pageCornerPreviousCurl.overlayBack === '3' && pageCornerPreviousCurl.under === '2' && pageCornerPreviousCurl.underClass.includes('book-curl-under-single') && pageCornerPreviousCurl.label.startsWith('3 /') && pageCornerPreviousCurl.legacy === 0 && bottomCornerProbeStartsAtTap(pageCornerPreviousCurl), JSON.stringify(pageCornerPreviousCurl));
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2 /') && !document.getElementById('pdfFrame').dataset.curlState);
  await waitForCompleteFit(touch, 1);
  const pageCornerPreviousFinal = await touch.locator('#pdfFrame').evaluate(frame => ({ pages: Array.from(frame.querySelectorAll('.pdf-page.book-active')).map(page => page.dataset.page).join(','), artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('the Page bottom-left tap returns exactly one page', pageCornerPreviousFinal.pages === '2' && pageCornerPreviousFinal.artifacts === 0, JSON.stringify(pageCornerPreviousFinal));

  /* Page mode uses the same attached-sheet geometry even though it shows one leaf.
     Keep this cancellation separate so the following shallow/commit checks still
     begin on page 2. */
  touchBox = await touch.locator('.pdf-page[data-page="2"].book-single').boundingBox();
  const pageDiagonalStart = { id: 46, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height * .86 };
  const pageDiagonalMove = { id: 46, x: touchBox.x - touchBox.width * .18, y: touchBox.y + touchBox.height * .14 };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [pageDiagonalStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [pageDiagonalMove]);
  await touch.waitForFunction(() => {
    const frame = document.getElementById('pdfFrame');
    return frame.dataset.curlState === 'dragging' && frame.dataset.curlSpineLimited === 'true' && frame.dataset.curlSource === '2' && frame.dataset.curlBack === '2' && document.querySelector('.book-curl-under-single[data-page="3"]');
  });
  const pageSpine = await curlSpineMetrics(touch, '.book-curl-front[data-page="2"]');
  const pageSpineBoundaryError = Math.min(Math.abs(pageSpine.spineY), Math.abs(pageSpine.spineY - pageSpine.height));
  check('a deep diagonal Page pull also preserves the entire left binding edge', pageSpine.binding === 'left' && pageSpine.limited === 'true' && pageSpine.origin === 'finger' && pageSpine.source === '2' && pageSpine.back === '2' && pageSpine.progress > .5 && pageSpine.progress < .7 && Number.isFinite(pageSpine.spineY) && pageSpine.spineY >= -1.5 && pageSpine.spineY <= pageSpine.height + 1.5 && pageSpineBoundaryError <= 1.5 && pageSpine.clipPoints >= 3 && pageSpine.attachedCorners === 2 && pageSpine.attachedSamples === pageSpine.sampleCount, JSON.stringify(pageSpine));
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchcancel', [], [pageDiagonalMove]);
  await touch.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  const pageSpineCancel = await touch.locator('#pdfFrame').evaluate(frame => ({ label: document.getElementById('pageNumber').textContent, binding: frame.dataset.curlBinding || '', limited: frame.dataset.curlSpineLimited || '', spineY: frame.dataset.curlSpineY || '', artifacts: frame.querySelectorAll('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').length }));
  check('canceling that diagonal Page pull keeps page 2 and clears curl state', pageSpineCancel.label.startsWith('2 /') && !pageSpineCancel.binding && !pageSpineCancel.limited && !pageSpineCancel.spineY && pageSpineCancel.artifacts === 0, JSON.stringify(pageSpineCancel));

  touchBox = await touch.locator('.pdf-page[data-page="2"].book-single').boundingBox();
  fingerStart = { id: 35, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height * .66 };
  fingerOne = { id: 35, x: fingerStart.x - touchBox.width * .28, y: fingerStart.y - 14 };
  fingerTwo = { id: 35, x: fingerStart.x - touchBox.width * .64, y: fingerStart.y - 68 };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [fingerStart]);
  await touch.waitForTimeout(60);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [fingerOne]);
  await touch.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && +document.getElementById('pdfFrame').dataset.curlProgress > .08);
  const pageTouchOne = await touch.locator('#pdfFrame').evaluate(frame => ({ progress: +frame.dataset.curlProgress, tipLeft: parseFloat(frame.querySelector('.book-curl-tip').style.left) }));
  await touch.waitForTimeout(60);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [fingerTwo]);
  await touch.waitForFunction(previous => +document.getElementById('pdfFrame').dataset.curlProgress > previous + .08, pageTouchOne.progress);
  const pageTouchTwo = await touch.locator('#pdfFrame').evaluate(frame => {
    const source = frame.querySelector('.book-curl-front[data-page="2"]'), under = frame.querySelector('.book-curl-under-single[data-page="3"]'), sr = source.getBoundingClientRect(), ur = under.getBoundingClientRect();
    return { source: frame.dataset.curlSource, back: frame.dataset.curlBack, progress: +frame.dataset.curlProgress, tipLeft: parseFloat(frame.querySelector('.book-curl-tip').style.left), overlap: Math.max(Math.abs(sr.left-ur.left),Math.abs(sr.top-ur.top),Math.abs(sr.right-ur.right),Math.abs(sr.bottom-ur.bottom)), reverseOpacity: parseFloat(getComputedStyle(frame.querySelector('.book-curl-back-canvas')).opacity), label: document.getElementById('pageNumber').textContent, legacy: frame.querySelectorAll('.book-turning').length };
  });
  check('a Page-mode finger gets a live bound-leaf fold with the next page underneath', pageTouchTwo.source === '2' && pageTouchTwo.back === '2' && pageTouchTwo.progress > pageTouchOne.progress && pageTouchTwo.tipLeft < pageTouchOne.tipLeft - 30 && pageTouchTwo.overlap < 2 && pageTouchTwo.reverseOpacity < .4 && pageTouchTwo.label.startsWith('2 /') && pageTouchTwo.legacy === 0, JSON.stringify({ first: pageTouchOne, second: pageTouchTwo }));
  const pageTouchFx = await curlFxMetrics(touch);
  check('a forward iPad fold keeps paper lighting without drawing a fingertip mark', pageTouchFx.direction === 'next' && pageTouchFx.origin === 'finger' && pageTouchFx.tipDisplay === 'none' && !pageTouchFx.tipVisible && pageTouchFx.castVisible && pageTouchFx.ridgeVisible, JSON.stringify(pageTouchFx));
  await touch.waitForTimeout(360);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchend', [], [fingerTwo]);
  await touch.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  check('a shallow Page-mode touch fold cancels on the same sheet', (await touch.locator('#pageNumber').textContent()).startsWith('2 /') && await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);

  touchBox = await touch.locator('.pdf-page[data-page="2"].book-single').boundingBox();
  fingerStart = { id: 36, x: touchBox.x + touchBox.width - 5, y: touchBox.y + touchBox.height * .54 };
  const pageCommit = { id: 36, x: fingerStart.x - touchBox.width * .97, y: fingerStart.y - 46 };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [fingerStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [pageCommit]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchend', [], [pageCommit]);
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('a committed Page-mode finger advances exactly one bound leaf', await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);
  await waitForCompleteFit(touch, 1);

  touchBox = await touch.locator('.pdf-page[data-page="3"].book-single').boundingBox();
  fingerStart = { id: 37, x: touchBox.x + 5, y: touchBox.y + touchBox.height * .14 };
  const pageBack = { id: 37, x: touchBox.x + touchBox.width * 1.18, y: touchBox.y + touchBox.height * .86 };
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchstart', [fingerStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchmove', [pageBack]);
  await touch.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && document.getElementById('pdfFrame').dataset.curlDirection === 'prev' && document.getElementById('pdfFrame').dataset.curlSpineLimited === 'true' && document.getElementById('pdfFrame').dataset.curlSource === '3' && document.getElementById('pdfFrame').dataset.curlBack === '3' && document.querySelector('.book-curl-under-single[data-page="2"]'));
  const pageBackSpine = await curlSpineMetrics(touch, '.book-curl-front[data-page="3"]');
  const pageBackBoundaryError = Math.min(Math.abs(pageBackSpine.spineY), Math.abs(pageBackSpine.spineY - pageBackSpine.height));
  check('a deep diagonal Page pull also stays attached along the entire right binding', pageBackSpine.binding === 'right' && pageBackSpine.limited === 'true' && pageBackSpine.progress > .5 && pageBackSpine.progress < .7 && pageBackBoundaryError <= 1.5 && pageBackSpine.attachedCorners === 2 && pageBackSpine.attachedSamples === pageBackSpine.sampleCount, JSON.stringify(pageBackSpine));
  const pageBackFx = await curlFxMetrics(touch);
  check('a backward iPad fold has no grey fingertip mark either', pageBackFx.direction === 'prev' && pageBackFx.origin === 'finger' && pageBackFx.tipDisplay === 'none' && !pageBackFx.tipVisible && pageBackFx.castVisible && pageBackFx.ridgeVisible, JSON.stringify(pageBackFx));
  await dispatchTouches(touch, '.pdf-page[data-page="3"] canvas', 'touchend', [], [pageBack]);
  await touch.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('2 /') && !document.getElementById('pdfFrame').dataset.curlState);
  check('Page mode also folds backward under a tablet finger', await touch.locator('.book-curl-overlay,.book-curl-under,.book-curl-front,.book-turning').count() === 0);
  await waitForCompleteFit(touch, 1);

  /* Two fingers still own pinch-zoom, and an enlarged sheet still pans with one finger.
     Neither gesture may be mistaken for a turn by the new coarse-pointer curl path. */
  touchBox = await touch.locator('.pdf-page[data-page="2"] canvas').boundingBox();
  const pinchA = { id: 41, x: touchBox.x + touchBox.width * .42, y: touchBox.y + touchBox.height * .5 };
  const pinchB = { id: 42, x: touchBox.x + touchBox.width * .58, y: touchBox.y + touchBox.height * .5 };
  const pinchWideA = { id: 41, x: touchBox.x + touchBox.width * .32, y: pinchA.y - 10 };
  const pinchWideB = { id: 42, x: touchBox.x + touchBox.width * .68, y: pinchB.y + 10 };
  /* The second finger arrives after the first has made a still-unclaimed page gesture,
     matching an actual pinch more closely than beginning with two simultaneous contacts. */
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [pinchA]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [pinchA, pinchB], [pinchB]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [pinchWideA, pinchWideB]);
  const livePinch = await touch.locator('#pdfFrame').evaluate(frame => ({ transform: frame.style.transform, curl: frame.dataset.curlState || '', label: document.getElementById('pageNumber').textContent }));
  check('two fingers retain the live pinch preview without lifting a page', /scale\((?:1\.[1-9]|[2-9])/.test(livePinch.transform) && !livePinch.curl && livePinch.label.startsWith('2 /'), JSON.stringify(livePinch));
  /* Lift only the second finger: the first one must hand directly from pinch to pan,
     even while the enlarged PDF canvas is being rebuilt underneath it. */
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchend', [pinchWideA], [pinchWideB]);
  await touch.waitForFunction(() => {
    const pane = document.getElementById('documentPane');
    return !document.getElementById('pdfFrame').style.transform && document.getElementById('zoomLabel').textContent.endsWith('%') && (pane.scrollWidth > pane.clientWidth + 20 || pane.scrollHeight > pane.clientHeight + 20);
  });
  const beforePan = await touch.locator('#documentPane').evaluate(pane => ({ left: pane.scrollLeft, top: pane.scrollTop, maxLeft: pane.scrollWidth-pane.clientWidth, maxTop: pane.scrollHeight-pane.clientHeight, rect: (() => { const r=pane.getBoundingClientRect();return { left:r.left, top:r.top, width:r.width, height:r.height }; })() }));
  const panMove = { id: pinchWideA.id, x: pinchWideA.x + (beforePan.left > 12 ? 72 : -72), y: pinchWideA.y + (beforePan.top > 12 ? 58 : -58) };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [panMove]);
  const livePan = await touch.locator('#documentPane').evaluate((pane, before) => ({ left: pane.scrollLeft, top: pane.scrollTop, moved: Math.hypot(pane.scrollLeft-before.left,pane.scrollTop-before.top), curl: document.getElementById('pdfFrame').dataset.curlState || '', label: document.getElementById('pageNumber').textContent }), beforePan);
  check('one finger still pans an enlarged Page instead of starting a curl', livePan.moved > 10 && !livePan.curl && livePan.label.startsWith('2 /'), JSON.stringify(livePan));
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchend', [], [panMove]);
  await waitForPagedReady(touch);

  /* Once that enlarged page reaches its outer scroll boundary, continued finger travel
     becomes the same physical page curl instead of the old translated-card preview. */
  const zoomEdge = await touch.locator('#documentPane').evaluate(pane => {
    pane.scrollLeft = pane.scrollWidth - pane.clientWidth;
    const rect = pane.getBoundingClientRect();
    return { right: rect.right, top: rect.top, height: rect.height };
  });
  const zoomEdgeStart = { id: 44, x: zoomEdge.right - 28, y: zoomEdge.top + zoomEdge.height * .52 };
  const zoomEdgeMove = { id: 44, x: zoomEdgeStart.x - 300, y: zoomEdgeStart.y - 24 };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [zoomEdgeStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [zoomEdgeMove]);
  await touch.waitForFunction(() => document.getElementById('pdfFrame').dataset.curlState === 'dragging' && +document.getElementById('pdfFrame').dataset.curlProgress > .04 && document.getElementById('pdfFrame').dataset.curlOrigin === 'finger' && document.getElementById('pdfFrame').dataset.curlSource === '2' && document.querySelector('.book-curl-under-single[data-page="3"]'));
  const zoomEdgeCurl = await touch.locator('#pdfFrame').evaluate((frame, fingerX) => {
    const frameRect = frame.getBoundingClientRect(), tip = frame.querySelector('.book-curl-tip');
    return { progress: +frame.dataset.curlProgress, tipOffset: Math.abs(frameRect.left + parseFloat(tip.style.left) - fingerX), legacy: frame.querySelectorAll('.book-turning').length };
  }, zoomEdgeMove.x);
  check('an enlarged Page hands its claimed outer edge directly to the finger', zoomEdgeCurl.progress > .04 && zoomEdgeCurl.tipOffset < 48 && zoomEdgeCurl.legacy === 0, JSON.stringify(zoomEdgeCurl));
  await touch.waitForTimeout(180);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchend', [], [zoomEdgeMove]);
  await touch.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
  check('a held zoom-edge curl settles back without changing pages', (await touch.locator('#pageNumber').textContent()).startsWith('2 /'));

  const interiorPan = await touch.locator('#documentPane').evaluate(pane => {
    const maxLeft = pane.scrollWidth - pane.clientWidth;
    pane.scrollLeft = Math.max(0, maxLeft - 140);
    const rect = pane.getBoundingClientRect();
    return { x: rect.left + rect.width * .5, y: rect.top + rect.height * .48 };
  });
  const interiorStart = { id: 45, x: interiorPan.x, y: interiorPan.y };
  const interiorAtEdge = { id: 45, x: interiorStart.x - 180, y: interiorStart.y - 4 };
  const interiorPastEdge = { id: 45, x: interiorStart.x - 300, y: interiorStart.y - 7 };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [interiorStart]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [interiorAtEdge]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [interiorPastEdge]);
  check('an interior pan cannot unexpectedly become a page curl at the boundary', !(await touch.locator('#pdfFrame').getAttribute('data-curl-state')) && (await touch.locator('#pageNumber').textContent()).startsWith('2 /'));
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchend', [], [interiorPastEdge]);

  /* iPadOS can cancel every contact when the app switches, rotates, or a system gesture
     wins. That must revert the preview instead of accidentally committing its zoom. */
  touchBox = await touch.locator('.pdf-page[data-page="2"] canvas').boundingBox();
  const cancelZoom = await touch.locator('#zoomLabel').textContent();
  const cancelA = { id: 46, x: touchBox.x + touchBox.width * .43, y: touchBox.y + touchBox.height * .48 };
  const cancelB = { id: 47, x: touchBox.x + touchBox.width * .57, y: touchBox.y + touchBox.height * .48 };
  const cancelWideA = { id: 46, x: cancelA.x - 55, y: cancelA.y - 12 };
  const cancelWideB = { id: 47, x: cancelB.x + 55, y: cancelB.y + 12 };
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchstart', [cancelA, cancelB]);
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchmove', [cancelWideA, cancelWideB]);
  check('a live two-finger preview is present before iPadOS cancels it', (await touch.locator('#pdfFrame').getAttribute('style') || '').includes('transform'));
  await dispatchTouches(touch, '.pdf-page[data-page="2"] canvas', 'touchcancel', [], [cancelWideA, cancelWideB]);
  await waitForPagedReady(touch);
  const canceledPinch = await touch.locator('#pdfFrame').evaluate(frame => ({ transform: frame.style.transform, curl: frame.dataset.curlState || '', label: document.getElementById('pageNumber').textContent, zoom: document.getElementById('zoomLabel').textContent }));
  check('touchcancel reverts the pinch without turning or changing zoom', !canceledPinch.transform && !canceledPinch.curl && canceledPinch.label.startsWith('2 /') && canceledPinch.zoom === cancelZoom, JSON.stringify(canceledPinch));

  const touchLegacy = await touch.evaluate(() => { window.__touchLegacyObserver.disconnect(); return window.__touchLegacyTurnSeen; });
  check('tablet Page and Book gestures never revive the legacy rigid-card turn', !touchLegacy && await touch.locator('.book-turning').count() === 0);
  await touchContext.close();

  const migrationContext = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const migration = await migrationContext.newPage();
  await migration.addInitScript(() => {
    const oldPaper = { id: 'old_vertical_zoom', kind: 'pdf', title: 'Old vertical paper', zoom: 2.6, notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: 1, updatedAt: 1, readPage: 1 };
    const otherPaper = { id: 'preserved_scroll_zoom', kind: 'pdf', title: 'Another paper', zoom: 1.6, zoomPreferenceV: 2, notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: 1, updatedAt: 1, readPage: 1 };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [oldPaper, otherPaper], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.lastOpen.v1', oldPaper.id);
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfDirection: 'vertical', verticalPages: 'one', guideOrientation: 'column', focus: false, guideDim: 55 }));
  });
  await migration.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await migration.waitForFunction(() => document.querySelector('[data-pdf-layout="page"]').getAttribute('aria-pressed') === 'true');
  const migratedLayout = await migration.locator('[data-pdf-layout="page"]').getAttribute('aria-pressed');
  check('an old one-page vertical preference migrates to Page', migratedLayout === 'true', migratedLayout);
  const migratedPaper = await migration.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(chapter => chapter.id === 'old_vertical_zoom'));
  check('legacy crop auto-zoom is not reused as a Scroll preference', migratedPaper.zoom === 0 && migratedPaper.zoomPreferenceV === 2, JSON.stringify({ zoom: migratedPaper.zoom, version: migratedPaper.zoomPreferenceV }));
  const preservedPaper = await migration.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(chapter => chapter.id === 'preserved_scroll_zoom'));
  check('legacy migration preserves other papers’ deliberate Scroll zoom', preservedPaper.zoom === 1.6 && preservedPaper.zoomPreferenceV === 2, JSON.stringify({ zoom: preservedPaper.zoom, version: preservedPaper.zoomPreferenceV }));
  await migrationContext.close();

  const guideMigrationContext = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const guideMigration = await guideMigrationContext.newPage();
  await guideMigration.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ guideOrientation: 'column', focus: false, guideDim: 55 }));
  });
  await guideMigration.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  check('an old column Guide alone no longer opts the reader into Book', await guideMigration.locator('[data-pdf-layout="scroll"]').getAttribute('aria-pressed') === 'true');
  await guideMigrationContext.close();

  const linkContext = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  const linked = await linkContext.newPage();
  linked.on('pageerror', error => errors.push(error.message));
  await linked.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', guideOrientation: 'row', focus: false, guideDim: 55 }));
  });
  await linked.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await linked.setInputFiles('#pdfFile', { name: 'linked-pages.pdf', mimeType: 'application/pdf', buffer: linkedPdfBuffer() });
  await linked.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"].book-active .pdf-link') && document.getElementById('pageNumber').textContent.startsWith('1 /'));
  await linked.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('zoomIn').click(); });
  await linked.waitForFunction(() => document.getElementById('documentPane').scrollHeight > document.getElementById('documentPane').clientHeight + 100 && !document.querySelector('.pdf-page.book-turning'));
  await linked.waitForTimeout(700);
  const returnSpot = await linked.locator('#documentPane').evaluate(pane => {
    pane.scrollLeft = Math.min(137, pane.scrollWidth - pane.clientWidth);
    pane.scrollTop = Math.min(211, pane.scrollHeight - pane.clientHeight);
    return { left: pane.scrollLeft, top: pane.scrollTop };
  });
  /* Activate the transparent PDF annotation directly; Playwright's forced pointer click
     can target the canvas beneath this zero-content overlay in headless Chromium. */
  await linked.locator('.pdf-page[data-page="1"] .pdf-link').evaluate(link => link.click());
  await linked.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('3 /'));
  await linked.waitForFunction(() => document.getElementById('readerToast').textContent.includes('Jumped to p. 3'));
  const linkedPaper = await linked.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(chapter => chapter.sourceName === 'linked-pages.pdf'));
  check('the last leaf of an odd-length paper is persisted as read-through progress', linkedPaper.readThroughPage === 3, JSON.stringify({ page: linkedPaper.readPage, through: linkedPaper.readThroughPage }));
  await linked.keyboard.press('Backspace');
  await linked.waitForFunction(spot => {
    const pane = document.getElementById('documentPane');
    return document.getElementById('pageNumber').textContent.startsWith('1 /') && Math.abs(pane.scrollLeft - spot.left) < 3 && Math.abs(pane.scrollTop - spot.top) < 3;
  }, returnSpot);
  check('Backspace after an internal PDF link restores its source page and pan position', true);
  await linkContext.close();

  check('the paged reader has no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
