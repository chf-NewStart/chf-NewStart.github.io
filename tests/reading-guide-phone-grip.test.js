/* The guide's handle on a phone (Houfu, 2026-11-02, a screenshot of the round white handle
   over "disappointed": "the guide side pin the white thing is obstructing the text. Or move it
   only to margin so it doesn't block anything"). On a phone the handle is a slim tab at the
   band's right edge, in the margin: it covers no word, its touch area stays out of the text,
   a drag from it moves the band without a jump, and pinning shows on the tab instead of a dot
   on the words. An iPad keeps its round handle. PHLOEM_BROWSER=chromium|webkit */
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
// Every line box of text the band crosses, as client rects.
const textLines = page => page.evaluate(() => {
  const band = document.getElementById('guideBand').getBoundingClientRect(), out = [];
  document.querySelectorAll('#textDocument .para .original').forEach(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 1 && r.bottom > band.top - 60 && r.top < band.bottom + 60) out.push(r.toJSON());
  });
  return out;
});
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

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

  {
    const { context, page } = await fresh(PHONE);
    check('the phone layout is on', await page.evaluate(() => document.body.classList.contains('phone-ui')));
    const grip = await rect(page, '#guideGrip'), band = await rect(page, '#guideBand');
    const lines = await textLines(page);
    const textRight = Math.max(...lines.map(r => r.right));
    check('the handle hangs off the band\'s right edge', Math.abs(grip.right - band.right) < 1 && grip.top >= band.top - .5 && grip.bottom <= band.bottom + .5, JSON.stringify({ grip, band: { right: band.right, top: band.top, bottom: band.bottom } }));
    check('it sits in the margin, right of every line', grip.left >= textRight - .5, Math.round(grip.left) + ' vs text ' + Math.round(textRight));
    check('it covers no word', !lines.some(r => overlaps(r, grip)), lines.length + ' lines');
    check('it is still a 44pt-tall target', grip.height >= 44, grip.height);
    // The touch area (the ::before) reaches 2px to the left of the tab.
    const hit = await page.evaluate(() => {
      const g = document.getElementById('guideGrip').getBoundingClientRect();
      const probe = (x, y) => document.elementFromPoint(x, y) === document.getElementById('guideGrip');
      return { inTab: probe(g.left + g.width / 2, g.top + g.height / 2), justLeft: probe(g.left - 1, g.top + g.height / 2), farLeft: probe(g.left - 4, g.top + g.height / 2) };
    });
    check('its touch area stays out of the text', hit.inTab && hit.justLeft && !hit.farLeft, JSON.stringify(hit));
    if (process.env.PHLOEM_SHOTS) await page.screenshot({ path: path.join(process.env.PHLOEM_SHOTS, ENGINE + '-phone-grip.png') });

    // A drag from the tab: the first 2px barely move the band; 120px down moves it 120px.
    const start = { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2 };
    const before = await rect(page, '#guideBand');
    await gripEvent(page, 'pointerdown', start);
    await gripEvent(page, 'pointermove', { x: start.x, y: start.y + 2 });
    await page.waitForTimeout(120);
    const nudged = await rect(page, '#guideBand');
    check('grabbing the tab does not make the band jump', Math.abs(nudged.top - before.top - 2) < 4, Math.round(nudged.top - before.top));
    await gripEvent(page, 'pointermove', { x: start.x, y: start.y + 120 });
    await page.waitForTimeout(120);
    await gripEvent(page, 'pointerup', { x: start.x, y: start.y + 120 });
    const after = await rect(page, '#guideBand');
    check('dragging the tab moves the band with the finger', Math.abs(after.top - before.top - 120) < 6, Math.round(after.top - before.top));
    await page.waitForTimeout(250);
    const gripAfter = await rect(page, '#guideGrip');
    check('the tab came along, still at the right edge', Math.abs(gripAfter.right - after.right) < 1 && Math.abs(gripAfter.top - after.top - 6) < 1.5, JSON.stringify({ g: gripAfter, b: after }));

    // Pinned: no dot on the words; the tab turns accent.
    await page.evaluate(() => { document.getElementById('paneSpotlight').classList.add('locked'); });
    const pinned = await page.evaluate(() => ({
      dot: getComputedStyle(document.getElementById('guideBand'), '::after').display,
      tab: getComputedStyle(document.getElementById('guideGrip')).color,
      ink: getComputedStyle(document.body).getPropertyValue('--muted')
    }));
    check('pinned leaves no dot on the words', pinned.dot === 'none', pinned.dot);
    check('pinned colours the tab instead', !!pinned.tab && pinned.tab !== 'rgba(0, 0, 0, 0)', pinned.tab);
    await context.close();
  }

  {
    const { context, page } = await fresh(TABLET);
    check('an iPad is not the phone layout', !(await page.evaluate(() => document.body.classList.contains('phone-ui'))));
    const grip = await rect(page, '#guideGrip'), band = await rect(page, '#guideBand');
    check('an iPad keeps its round handle at the left', Math.abs(grip.left - band.left - 8) < 1.5 && Math.abs(grip.width - 42) < 1 && Math.abs(grip.width - grip.height) < 1, JSON.stringify({ left: grip.left - band.left, w: grip.width, h: grip.height }));
    await context.close();
  }

  check('no page errors', !errors.length, errors.join(' | '));
  await browser.close(); server.close();
  console.log(ENGINE + ': ' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
