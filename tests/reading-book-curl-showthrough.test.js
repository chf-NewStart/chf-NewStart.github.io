/* Page-curl underside orientation. One-page view (Page layout): the back of the turning leaf is
   the same page seen from behind, so its show-through must appear MIRRORED on screen. Two-page
   spread (Book layout): the back is the next physical page, which must read the right way round.
   Mid-turn, the on-screen mapping of the back sheet is the overlay's fold reflection times the back
   sheet's own transform; its determinant is negative when the content appears mirrored.
   PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PDF = path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : file.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
}

async function midTurn(browser, port, layout, key) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.addInitScript(l => {
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: l, guideOrientation: 'row', focus: false, guideDim: 55 }));
  }, layout);
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page.book-active canvas')?.width);
  await page.waitForTimeout(900);
  if (key === 'ArrowLeft') {   // start one leaf in so there is a page to turn back to
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState);
    await page.waitForTimeout(900);
  }
  const sample = page.evaluate(() => new Promise(resolve => {
    const deadline = performance.now() + 8000;
    (function poll() {
      const frame = document.getElementById('pdfFrame'), overlay = frame.querySelector('.book-curl-overlay');
      const progress = +frame.dataset.curlProgress;
      if (overlay && progress > .2 && progress < .8 && overlay.style.transform.startsWith('matrix(')) {
        const m = overlay.style.transform.slice(7, -1).split(',').map(Number);
        const sheet = overlay.querySelector('.book-curl-back-sheet');
        const t = new DOMMatrixReadOnly(getComputedStyle(sheet).transform === 'none' ? undefined : getComputedStyle(sheet).transform);
        const overlayDet = m[0] * m[3] - m[1] * m[2], sheetDet = t.a * t.d - t.b * t.c;
        resolve({ progress, overlayDet, sheetDet, composite: overlayDet * sheetDet, single: overlay.classList.contains('book-curl-single'),
                  backPage: overlay.dataset.backPage, sourcePage: overlay.dataset.page,
                  washDet: (w => { const x = new DOMMatrixReadOnly(getComputedStyle(w).transform === 'none' ? undefined : getComputedStyle(w).transform); return x.a * x.d - x.b * x.c; })(overlay.querySelector('.book-curl-back-wash')) });
        return;
      }
      if (performance.now() > deadline) { resolve(null); return; }
      requestAnimationFrame(poll);
    })();
  }));
  await page.keyboard.press(key);
  const result = await sample;
  await context.close();
  return result;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      const one = await midTurn(browser, port, 'page', key);
      check(`one-page view, ${key}: a curl is sampled mid-turn`, !!one && one.single, JSON.stringify(one));
      if (one) {
        check(`one-page view, ${key}: the overlay is a reflection across the fold`, one.overlayDet < -0.99 && one.overlayDet > -1.01, one.overlayDet.toFixed(3));
        check(`one-page view, ${key}: the back shows the same page`, one.backPage === one.sourcePage, `${one.backPage}/${one.sourcePage}`);
        check(`one-page view, ${key}: its show-through appears mirrored on screen`, one.composite < 0, one.composite.toFixed(3));
        check(`one-page view, ${key}: the shading wash keeps its orientation`, one.overlayDet * one.sheetDet * one.washDet > 0, (one.overlayDet * one.sheetDet * one.washDet).toFixed(3));
      }
      const spread = await midTurn(browser, port, 'book', key);
      check(`two-page spread, ${key}: a curl is sampled mid-turn`, !!spread && !spread.single, JSON.stringify(spread));
      if (spread) {
        check(`two-page spread, ${key}: the back is a different physical page`, spread.backPage !== spread.sourcePage, `${spread.backPage}/${spread.sourcePage}`);
        check(`two-page spread, ${key}: that page reads the right way round`, spread.composite > 0, spread.composite.toFixed(3));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ENGINE}: ${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
