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

async function headerGeometry(page) {
  return page.evaluate(() => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const header = document.querySelector('.masthead');
    return {
      width: innerWidth, height: innerHeight,
      rootScroll: { x: scrollX, y: scrollY },
      header: rect(header), reader: rect(document.getElementById('readerPage')),
      back: rect(document.getElementById('readerBack')),
      buttons: Array.from(header.querySelectorAll('button')).filter(button => button.getClientRects().length).map(button => {
        const box = rect(button);
        const at = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
        return { id: button.id || button.textContent.trim(), ...box, hit: at === button || button.contains(at) };
      })
    };
  });
}
function verifyHeader(info, label, touch) {
  assert(info.header.top >= -.5, label + ': masthead stays on screen');
  assert(info.back.top >= info.header.bottom - .5, label + ': Library remains below the masthead');
  for (const button of info.buttons) {
    assert(button.left >= -.5 && button.right <= info.width + .5, label + ': ' + button.id + ' is not clipped: ' + JSON.stringify(button));
    assert(button.hit, label + ': ' + button.id + ' is unobstructed');
    if (touch && button.id !== 'brandBtn') assert(button.width >= 44 && button.height >= 44, label + ': ' + button.id + ' preserves its touch target');
  }
  for (let i = 0; i < info.buttons.length; i++) for (let j = i + 1; j < info.buttons.length; j++) {
    const a = info.buttons[i], b = info.buttons[j];
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    assert(overlap <= .5, label + ': ' + a.id + ' overlaps ' + b.id);
  }
  console.log('PASS  ' + label + ': all header buttons fit, and Library is unobstructed');
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
    /* Realistic long metadata and sync/revision labels from the reported workflow. */
    await page.evaluate(() => {
      document.getElementById('readerTitle').textContent = 'Modelling metabolic fluxes in tomato fruit';
      document.getElementById('readerMeta').textContent = 'Fouillen, Martine Dieuaide-Noubhani, Jean-Pierre Mazat, Bertrand Beauvoit and Yves Gibon';
      document.getElementById('syncSignal').textContent = '☁ Drive · 11:05 AM';
      document.querySelector('[data-view="reviewPage"]').textContent = 'Revision · 12';
    });
    for (const width of [721, 768, 834, 1024, 1366]) {
      await page.setViewportSize({ width, height: width > 1100 ? 1024 : 1194 });
      verifyHeader(await headerGeometry(page), width + 'px reader', width <= 1100);
    }
    await page.setViewportSize({ width: 834, height: 1194 });
    /* Model a transient difference between iOS's layout and visible viewports.
       An extra root scroll extent must not move the reading screen under its header. */
    const drift = await page.evaluate(() => {
      document.documentElement.style.paddingBottom = '30px';
      window.scrollTo(0, 30);
      const header = document.querySelector('.masthead').getBoundingClientRect();
      const back = document.getElementById('readerBack').getBoundingClientRect();
      return { headerTop: header.top, headerBottom: header.bottom, backTop: back.top };
    });
    assert(drift.headerTop >= -.5 && drift.backTop >= drift.headerBottom - .5, 'reader stays anchored during root viewport offset: ' + JSON.stringify(drift));
    await page.evaluate(() => { document.documentElement.style.paddingBottom = ''; window.scrollTo(0, 0); });
    console.log('PASS  root viewport offset cannot put the Library row behind the masthead');
    await page.locator('#zenBtn').click();
    assert(await page.locator('.masthead').isHidden(), 'Zen hides masthead');
    const zen = await page.locator('#readerPage').boundingBox();
    assert(zen.y >= -.5 && zen.y <= .5 && Math.abs(zen.height - 1194) <= 1, 'Zen retains the full visible height');
    await page.locator('#zenExit').click();
    verifyHeader(await headerGeometry(page), 'after leaving Zen', true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('.masthead').isHidden(), 'phone retains its dedicated reader header');
    const phoneBack = await page.locator('#readerBack').boundingBox();
    assert(phoneBack.x >= 0 && phoneBack.y >= 0 && phoneBack.x + phoneBack.width <= 390, 'phone Library button remains on screen');
    await page.locator('#readerBack').click();
    assert(!await page.locator('body').evaluate(body => getComputedStyle(body).position === 'fixed'), 'library returns to normal document scrolling');
    console.log('PASS  Zen, phone reading and library return retain their layouts');
    if (process.env.PHLOEM_HEADER_SCREENSHOT) {
      await page.setViewportSize({ width: 834, height: 1194 });
      await page.screenshot({ path: process.env.PHLOEM_HEADER_SCREENSHOT });
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
