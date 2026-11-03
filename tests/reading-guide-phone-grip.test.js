/* The guide's handle on a phone (Houfu, 2026-11-02: "the white thing is obstructing the text",
   then "the handle for the old one glass"). The round handle stays where it was, at the left of
   the guide, but it is clear glass: no fill, so the words under it show through; a drag from it
   moves the guide without a jump; pinned tints its rim instead of a dot on the words. An iPad
   has the same glass handle. PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.PHLOEM_GRIP_TEST_PORT || 8171);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
}

const SENTENCE = 'The evening is cool, and the skies are clear enough to see a handful of stars over the square.';
const PARAS = Array.from({ length: 30 }, (_, i) => 'Paragraph ' + (i + 1) + '. ' + SENTENCE + ' ' + SENTENCE);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPHONE, serviceWorkers: 'block' };
const TABLET = { viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPAD, serviceWorkers: 'block' };

async function gripEvent(page, type, point) {
  await page.locator('#guideGrip').evaluate((grip, payload) => {
    grip.dispatchEvent(new PointerEvent(payload.type, {
      bubbles: true, cancelable: true, pointerId: 51, pointerType: 'touch', isPrimary: true,
      buttons: payload.type === 'pointerup' ? 0 : 1, clientX: payload.point.x, clientY: payload.point.y
    }));
  }, { type, point });
}
const rect = (page, sel) => page.locator(sel).evaluate(node => node.getBoundingClientRect().toJSON());

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const errors = [];
  const fresh = async options => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(paras => {
      if (localStorage.getItem('readingRoom.v1')) return;
      const stamp = Date.now();
      const chapters = [{ id: 'story', kind: 'text', title: 'A story', fr: paras.join('\n\n'), notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp }];
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters, deleted: {}, merged: {}, savedAt: stamp }));
      localStorage.setItem('readingRoom.lastOpen.v1', 'story');
    }, PARAS);
    await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length === 30 && !document.getElementById('readerPage').classList.contains('hidden'));
    // Guide on, placed a third of the way down by a tap on the words.
    await page.evaluate(() => document.getElementById('focusBtn').click());
    const pane = await rect(page, '#documentPane');
    await page.touchscreen.tap(pane.left + pane.width / 2, pane.top + pane.height * .4);
    await page.waitForFunction(() => document.getElementById('paneSpotlight').classList.contains('placed'));
    await page.waitForTimeout(250);
    return { context, page };
  };

  const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const v = m[1].split(',').map(parseFloat); return v.length > 3 ? v[3] : 1; };
  {
    const { context, page } = await fresh(PHONE);
    check('the phone layout is on', await page.evaluate(() => document.body.classList.contains('phone-ui')));
    const grip = await rect(page, '#guideGrip'), band = await rect(page, '#guideBand');
    check('the round handle is back at the left of the guide', Math.abs(grip.left - band.left - 8) < 1.5 && Math.abs(grip.width - 42) < 1 && Math.abs(grip.width - grip.height) < 1, JSON.stringify({ left: grip.left - band.left, w: grip.width, h: grip.height }));
    const look = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('guideGrip')); const a = getComputedStyle(document.getElementById('guideGrip'), '::after'); return { bg: s.backgroundColor, image: s.backgroundImage, mask: a.maskImage || a.webkitMaskImage || '' }; });
    check('it is clear glass: no fill over the words', alpha(look.bg) < .1 && /radial-gradient/.test(look.image), JSON.stringify(look.bg));
    check('only its rim is frosted, the middle stays clear', /transparent|rgba\(0, 0, 0, 0\)/.test(look.mask), look.mask.slice(0, 80));
    if (process.env.PHLOEM_SHOTS) await page.screenshot({ path: path.join(process.env.PHLOEM_SHOTS, ENGINE + '-phone-grip.png') });

    const start = { x: grip.left + grip.width / 2 + 10, y: grip.top + grip.height / 2 + 10 };
    await gripEvent(page, 'pointerdown', start);
    await gripEvent(page, 'pointermove', { x: start.x, y: start.y + 2 });
    await page.waitForTimeout(120);
    const nudged = await rect(page, '#guideBand');
    check('grabbing the handle off-centre does not make the guide jump', Math.abs(nudged.top - band.top - 2) < 4, Math.round(nudged.top - band.top));
    await gripEvent(page, 'pointermove', { x: start.x, y: start.y + 120 });
    await page.waitForTimeout(120);
    await gripEvent(page, 'pointerup', { x: start.x, y: start.y + 120 });
    const after = await rect(page, '#guideBand');
    check('dragging the handle moves the guide with the finger', Math.abs(after.top - band.top - 120) < 6, Math.round(after.top - band.top));

    await page.evaluate(() => { document.getElementById('paneSpotlight').classList.add('locked'); });
    const pinned = await page.evaluate(() => ({ dot: getComputedStyle(document.getElementById('guideBand'), '::after').display, rim: getComputedStyle(document.getElementById('guideGrip')).borderTopColor }));
    check('pinned puts no dot on the words', pinned.dot === 'none', pinned.dot);
    check('pinned tints the rim instead', !/255, 255, 255/.test(pinned.rim), pinned.rim);
    await context.close();
  }

  {
    const { context, page } = await fresh(TABLET);
    check('an iPad is not the phone layout', !(await page.evaluate(() => document.body.classList.contains('phone-ui'))));
    const grip = await rect(page, '#guideGrip'), band = await rect(page, '#guideBand');
    check('an iPad has the same round handle at the left', Math.abs(grip.left - band.left - 8) < 1.5 && Math.abs(grip.width - 42) < 1, JSON.stringify({ left: grip.left - band.left, w: grip.width }));
    check('in glass too', alpha(await page.locator('#guideGrip').evaluate(n => getComputedStyle(n).backgroundColor)) < .1);
    await context.close();
  }

  check('no page errors', !errors.length, errors.join(' | '));
  await browser.close(); server.close();
  console.log(ENGINE + ': ' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
