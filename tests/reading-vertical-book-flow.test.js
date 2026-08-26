let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PDF = process.env.PHLOEM_VERTICAL_BOOK_TEST_PDF || path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const PORT = +(process.env.PHLOEM_VERTICAL_BOOK_TEST_PORT || 8134);
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

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(process.env.PHLOEM_VERTICAL_BOOK_TEST_PDF ? 30000 : 7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ guideOrientation: 'column', focus: true, guideDim: 55 }));
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => document.querySelector('.pdf-page.book-active canvas')?.width > 0);
  await page.waitForTimeout(500);

  check('column flow opens as a single-page book', await page.locator('#documentPane').evaluate(pane => pane.classList.contains('column-book-flow')));
  check('only the current book leaf is visible', await page.locator('.pdf-page').evaluateAll(pages => pages.filter(page => getComputedStyle(page).display !== 'none').length === 1));
  check('right-to-left page arrows are visible', await page.locator('#mPrev').textContent() === '→' && await page.locator('#mNext').textContent() === '←');
  check('column zoom becomes a readable text-fit action', await page.locator('#colZoomBtn').textContent() === 'Text');
  check('vertical text fit never shrinks below page fit', await page.locator('#zoomLabel').textContent().then(text => text === 'Fit' || parseInt(text, 10) >= 100), await page.locator('#zoomLabel').textContent());

  await page.click('#mNext');
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('2 /'));
  await page.waitForTimeout(350);
  check('left arrow turns forward to the next leaf', await page.locator('.pdf-page.book-active').getAttribute('data-page') === '2');

  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('3 /'));
  check('left keyboard arrow follows right-to-left reading order', true);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('2 /'));
  check('right keyboard arrow returns to the previous leaf', true);

  await page.waitForTimeout(300);
  await page.locator('#documentPane').evaluate(pane => {
    pane.scrollLeft = 0;
    function touch(x, y) { return new Touch({ identifier: 7, target: pane, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 }); }
    const y = pane.getBoundingClientRect().top + pane.clientHeight * .5;
    pane.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch(90, y)], targetTouches: [touch(90, y)], changedTouches: [touch(90, y)] }));
    pane.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(205, y + 3)], targetTouches: [touch(205, y + 3)], changedTouches: [touch(205, y + 3)] }));
    pane.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch(205, y + 3)] }));
  });
  await page.waitForFunction(() => document.getElementById('mPageLabel').textContent.startsWith('3 /'));
  check('swiping a leaf right turns forward like a bound book', true);

  await page.click('#mMore');
  await page.click('#comfortBtn');
  await page.click('button[data-guide-orientation="row"]');
  check('row flow keeps the continuous PDF scroller', await page.locator('#documentPane').evaluate(pane => !pane.classList.contains('column-book-flow')));
  await page.click('button[data-guide-orientation="column"]');
  await page.waitForFunction(() => document.getElementById('documentPane').classList.contains('column-book-flow'));
  check('column flow can be restored without reopening the book', true);
  if (process.env.PHLOEM_VERTICAL_BOOK_TEST_PDF) {
    for (let target = 4; target <= 20; target++) {
      await page.click('#mNext');
      await page.waitForFunction(pageNo => document.getElementById('mPageLabel').textContent.startsWith(pageNo + ' /'), target);
    }
    await page.waitForFunction(() => parseInt(document.getElementById('zoomLabel').textContent, 10) >= 200);
    await page.waitForFunction(() => document.querySelectorAll('.pdf-page.book-turning').length === 0);
    check('the scanned Chinese text block is enlarged on a phone', parseInt(await page.locator('#zoomLabel').textContent(), 10) >= 200, await page.locator('#zoomLabel').textContent());
    const guidePosition = await page.locator('#guideBand').evaluate(band => {
      const guide = band.getBoundingClientRect();
      const active = document.querySelector('.pdf-page.book-active');
      const paper = active.getBoundingClientRect();
      const canvas = active.querySelector('canvas');
      const sample = document.createElement('canvas');
      const scale = Math.min(1, 300 / Math.max(canvas.width, canvas.height));
      sample.width = Math.round(canvas.width * scale); sample.height = Math.round(canvas.height * scale);
      const context = sample.getContext('2d', { willReadFrequently: true }); context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const data = context.getImageData(0, 0, sample.width, sample.height).data;
      const tones = [];
      for (let y = 2; y < sample.height; y += 3) for (let x = 2; x < sample.width; x += 3) { const i = (y * sample.width + x) * 4; tones.push(data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114); }
      tones.sort((a, b) => a - b); const paperTone = tones[Math.floor(tones.length * .62)] || 235; const threshold = Math.max(72, Math.min(150, paperTone - 68));
      const xs = [];
      for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) { const i = (y * sample.width + x) * 4, lum = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; if (data[i + 3] > 200 && lum < threshold) xs.push(x / sample.width); }
      xs.sort((a, b) => a - b);
      return { center: (guide.left + guide.width / 2 - paper.left) / paper.width, inkRight: xs[Math.floor(xs.length * .985)] };
    });
    check('the vertical guide begins over the book text rather than its outer margin', Math.abs(guidePosition.center - guidePosition.inkRight) < .12, JSON.stringify(guidePosition));
  }
  check('vertical book flow has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
