/* Regression for portrait iPad header clipping and the reader toolbar slipping
   beneath the sticky site header. Uses the real app, CSS and bundled sample PDF. */
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_HEADER_TEST_PORT || 8178);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  fs.readFile(path.join(ROOT, pathname), (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); res.end(data);
  });
});

/* Zen is the only reader since 1a215db5 ("Make Zen the sole reader and return
   directly to library"): the masthead belongs to the library, and an open paper
   owns the full screen with its Zen rail, whose X returns to the library. */
async function headerGeometry(page, scope) {
  return page.evaluate(scope => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const header = document.querySelector('.masthead');
    const reading = scope === 'reader';
    const owner = reading ? document.getElementById('zenDock') : header;
    const buttons = reading ? owner.querySelectorAll(':scope > button, :scope > .zen-tool > button') : owner.querySelectorAll('button');
    return {
      width: innerWidth, height: innerHeight,
      rootScroll: { x: scrollX, y: scrollY },
      headerVisible: header.getClientRects().length > 0,
      header: rect(header), reader: rect(document.getElementById('readerPage')),
      library: rect(document.getElementById('libraryPage')),
      back: rect(document.getElementById('zenExit')),
      buttons: Array.from(buttons).filter(button => button.getClientRects().length).map(button => {
        const box = rect(button);
        const at = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
        return { id: button.id || button.textContent.trim(), ...box, hit: at === button || button.contains(at) };
      })
    };
  }, scope);
}
function verifyButtons(info, label, touch) {
  assert(info.buttons.length > 0, label + ': controls are present');
  for (const button of info.buttons) {
    assert(button.left >= -.5 && button.right <= info.width + .5 && button.top >= -.5 && button.bottom <= info.height + .5, label + ': ' + button.id + ' is not clipped: ' + JSON.stringify(button));
    assert(button.hit, label + ': ' + button.id + ' is unobstructed');
    if (touch && button.id !== 'brandBtn') assert(button.width >= 44 && button.height >= 44, label + ': ' + button.id + ' preserves its touch target');
  }
  for (let i = 0; i < info.buttons.length; i++) for (let j = i + 1; j < info.buttons.length; j++) {
    const a = info.buttons[i], b = info.buttons[j];
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    assert(overlapX <= .5 || overlapY <= .5, label + ': ' + a.id + ' overlaps ' + b.id);
  }
}
function verifyHeader(info, label, touch) {
  assert(info.headerVisible && info.header.top >= -.5, label + ': masthead stays on screen');
  assert(info.library.top >= info.header.bottom - .5, label + ': Library remains below the masthead');
  verifyButtons(info, label, touch);
  console.log('PASS  ' + label + ': all header buttons fit, and Library is unobstructed');
}
function verifyReader(info, label, touch) {
  assert(!info.headerVisible, label + ': the masthead cannot cover the paper');
  assert(Math.abs(info.reader.top) <= .5 && Math.abs(info.reader.height - info.height) <= 1, label + ': the reader keeps the full visible height: ' + JSON.stringify(info.reader));
  assert(info.buttons.some(button => button.id === 'zenExit'), label + ': the Library (X) control is present');
  verifyButtons(info, label, touch);
  console.log('PASS  ' + label + ': every Zen control fits, and the Library X is unobstructed');
}
(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  let browser;
  try {
    const name = process.env.PHLOEM_BROWSER || 'chromium';
    const launch = { headless: true };
    if (name === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[name].launch(launch);
    const context = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => {
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false }));
      localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
      localStorage.removeItem('readingRoom.lastOpen.v1');
    });
    await page.goto('http://localhost:' + PORT + '/reading.html');
    await page.setInputFiles('#pdfFile', path.join(ROOT, 'assets/phloem-guide/phloem-field-guide.pdf'));
    await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.positionReady === 'true' && document.body.classList.contains('reading'));
    await page.waitForFunction(() => document.body.classList.contains('zen'));
    /* Realistic long metadata and sync/revision labels from the reported workflow. */
    await page.evaluate(() => {
      document.getElementById('readerTitle').textContent = 'Modelling metabolic fluxes in tomato fruit';
      document.getElementById('readerMeta').textContent = 'Fouillen, Martine Dieuaide-Noubhani, Jean-Pierre Mazat, Bertrand Beauvoit and Yves Gibon';
      document.getElementById('syncSignal').textContent = '☁ Drive · 11:05 AM';
      document.querySelector('[data-view="reviewPage"]').textContent = 'Revision · 12';
    });
    const widths = [721, 768, 834, 1024, 1366];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width > 1100 ? 1024 : 1194 });
      verifyReader(await headerGeometry(page, 'reader'), width + 'px reader', width <= 1100);
    }
    await page.setViewportSize({ width: 834, height: 1194 });
    /* Model a transient difference between iOS's layout and visible viewports.
       An extra root scroll extent must not move the reading screen or its controls. */
    const drift = await page.evaluate(() => {
      document.documentElement.style.paddingBottom = '30px';
      window.scrollTo(0, 30);
      const reader = document.getElementById('readerPage').getBoundingClientRect();
      const back = document.getElementById('zenExit').getBoundingClientRect();
      return { readerTop: reader.top, backTop: back.top, backBottom: back.bottom, masthead: document.querySelector('.masthead').getClientRects().length };
    });
    assert(Math.abs(drift.readerTop) <= .5 && drift.backTop >= -.5 && drift.backBottom <= 1194 && drift.masthead === 0, 'reader stays anchored during root viewport offset: ' + JSON.stringify(drift));
    await page.evaluate(() => { document.documentElement.style.paddingBottom = ''; window.scrollTo(0, 0); });
    console.log('PASS  root viewport offset cannot move the reader or its Library X');
    assert(await page.locator('.masthead').isHidden(), 'Zen hides masthead');
    const zen = await page.locator('#readerPage').boundingBox();
    assert(zen.y >= -.5 && zen.y <= .5 && Math.abs(zen.height - 1194) <= 1, 'Zen retains the full visible height');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('.masthead').isHidden(), 'phone retains its dedicated reader header');
    const phoneBack = await page.locator('#zenExit').boundingBox();
    assert(phoneBack.x >= 0 && phoneBack.y >= 0 && phoneBack.x + phoneBack.width <= 390, 'phone Library button remains on screen');
    await page.locator('#zenExit').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    assert(!await page.locator('body').evaluate(body => getComputedStyle(body).position === 'fixed'), 'library returns to normal document scrolling');
    console.log('PASS  Zen, phone reading and library return retain their layouts');
    /* The library masthead is the remaining header; check it at the same widths.
       (Measured after the phone pass so emulated zoom from the library's own
       layout width cannot carry into the reader checks.) */
    await page.evaluate(() => {
      document.getElementById('syncSignal').textContent = '☁ Drive · 11:05 AM';
      document.querySelector('[data-view="reviewPage"]').textContent = 'Revision · 12';
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: width > 1100 ? 1024 : 1194 });
      verifyHeader(await headerGeometry(page, 'library'), width + 'px library after leaving the paper', width <= 1100);
    }
    if (process.env.PHLOEM_HEADER_SCREENSHOT) {
      await page.setViewportSize({ width: 834, height: 1194 });
      await page.screenshot({ path: process.env.PHLOEM_HEADER_SCREENSHOT });
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
