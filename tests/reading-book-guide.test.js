let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_BOOK_GUIDE_TEST_PORT || 8153);
const PDF = path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
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

async function ready(page, expectedPages) {
  await page.waitForFunction(expected => {
    const frame = document.getElementById('pdfFrame');
    const pages = Array.from(frame.querySelectorAll('.pdf-page.book-active')).map(holder => +holder.dataset.page);
    return frame.dataset.pagedReady === 'true' && !frame.hasAttribute('aria-busy') && !frame.dataset.curlState
      && JSON.stringify(pages) === JSON.stringify(expected);
  }, expectedPages);
}

async function metrics(page) {
  return page.evaluate(() => {
    function rect(element) {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }
    const pane = document.getElementById('documentPane');
    return {
      pages: Array.from(document.querySelectorAll('.pdf-page.book-active')).map(holder => ({ page: +holder.dataset.page, ...rect(holder) })),
      band: rect(document.getElementById('guideBand')),
      grip: rect(document.getElementById('guideGrip')),
      pane: rect(pane),
      scroll: [pane.scrollLeft, pane.scrollTop],
      note: document.getElementById('noteHeading').textContent,
      current: +(document.querySelector('.pdf-page.book-current')?.dataset.page || 0),
      dragging: document.getElementById('paneSpotlight').classList.contains('dragging'),
      curl: document.getElementById('pdfFrame').dataset.curlState || '',
      canvases: Array.from(document.querySelectorAll('.pdf-page.book-active canvas')).map(canvas => [canvas.width, canvas.height])
    };
  });
}

function centre(rect) { return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }; }
function onPage(state, pageNo) {
  const page = state.pages.find(item => item.page === pageNo);
  assert(page, 'expected visible leaf ' + pageNo);
  assert(state.band.left >= page.left - 1 && state.band.right <= page.right + 1,
    'guide belongs to leaf ' + pageNo + ': ' + JSON.stringify(state));
  assert(state.band.width > 30, 'guide remains visible');
}

/* Pointer capture retargets every move to #guideGrip. Send the same event sequence
   directly to that element in Chromium and WebKit so crossing the other page must
   work even though event.target never becomes that page. */
async function gripEvent(page, type, point) {
  await page.locator('#guideGrip').evaluate((grip, payload) => {
    grip.dispatchEvent(new PointerEvent(payload.type, {
      bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch', isPrimary: true,
      buttons: payload.type === 'pointerup' || payload.type === 'pointercancel' ? 0 : 1,
      clientX: payload.point.x, clientY: payload.point.y
    }));
  }, { type, point });
}

async function tapPage(page, pageNo, point) {
  await page.locator('.pdf-page[data-page="' + pageNo + '"] canvas').evaluate((canvas, p) => {
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 42, clientX: p.x, clientY: p.y }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 42, clientX: p.x, clientY: p.y }));
    canvas.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerType: 'touch', clientX: p.x, clientY: p.y }));
  }, point);
}

async function checkSpreadDrag(page, label) {
  let before = await metrics(page);
  const left = before.pages[0], right = before.pages[1];
  await tapPage(page, left.page, centre(left));
  before = await metrics(page);
  onPage(before, left.page);
  await gripEvent(page, 'pointerdown', centre(before.grip));
  await gripEvent(page, 'pointermove', centre(right));
  let state = await metrics(page);
  onPage(state, right.page);
  assert.equal(state.current, right.page, 'drag changes the page-note context');
  assert.equal(state.note, 'Page ' + right.page + ' note');
  assert.deepEqual(state.pages, before.pages, 'crossing does not move or refit the spread');
  assert.deepEqual(state.canvases, before.canvases, 'crossing keeps rendered canvases');
  assert.deepEqual(state.scroll, before.scroll, 'crossing does not navigate');
  assert.equal(state.curl, '', 'guide drag does not start a page curl');
  const gutter = { x: (left.right + right.left) / 2, y: Math.min(left.top, right.top) - 3 };
  await gripEvent(page, 'pointermove', gutter);
  state = await metrics(page);
  onPage(state, right.page);
  assert.equal(state.current, right.page, 'off-paper/gutter movement keeps the last guide leaf');
  if (right.left - left.right > 1) {
    await gripEvent(page, 'pointermove', { x: gutter.x, y: centre(right).y });
    onPage(await metrics(page), right.page);
  }
  await gripEvent(page, 'pointermove', { x: before.pane.right + 50, y: centre(right).y });
  onPage(await metrics(page), right.page);
  await gripEvent(page, 'pointermove', centre(left));
  state = await metrics(page);
  onPage(state, left.page);
  assert.equal(state.current, left.page, 'reverse drag restores the left-page context');
  await gripEvent(page, 'pointercancel', centre(left));
  assert.equal((await metrics(page)).dragging, false, 'cancel cleans up guide dragging');
  await gripEvent(page, 'pointermove', centre(right));
  onPage(await metrics(page), left.page);
  await tapPage(page, right.page, centre(right));
  onPage(await metrics(page), right.page);
  assert.equal((await metrics(page)).current, right.page, 'explicit target taps still select the other leaf');
  console.log('PASS  ' + label + ': both directions, gutter/outside hold, note context, cancellation, explicit tap');
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const launch = { headless: true };
    if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'book', focus: true, guideOrientation: 'row', guideScope: 'page' }));
      localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
      localStorage.setItem('readingRoom.guideAdjustSeen.v1', '1');
    });
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
    await page.setInputFiles('#pdfFile', PDF);
    await ready(page, [1]);
    await page.evaluate(() => document.getElementById('nextPage').click());
    await ready(page, [2, 3]);
    await page.waitForFunction(() => document.getElementById('paneSpotlight').classList.contains('placed'));
    await checkSpreadDrag(page, 'Book row guide');

    await page.evaluate(() => document.querySelector('[data-guide-orientation="column"]').click());
    await checkSpreadDrag(page, 'Book column guide');

    await page.evaluate(() => document.getElementById('zenBtn').click());
    await ready(page, [2, 3]);
    await page.waitForFunction(() => document.body.classList.contains('zen'));
    await page.evaluate(() => document.querySelector('[data-guide-orientation="row"]').click());
    await checkSpreadDrag(page, 'Zen Book row guide');

    // A previous spread or curl copy must not pull the guide onto a hidden page.
    let state = await metrics(page);
    const right = state.pages[1];
    await tapPage(page, 1, centre(right));
    onPage(await metrics(page), right.page);
    assert.equal((await metrics(page)).current, right.page);
    await page.evaluate(() => document.getElementById('nextPage').click());
    await ready(page, [4, 5]);
    state = await metrics(page);
    assert(state.band.width > 30, 'a turn reanchors on a newly visible leaf');
    console.log('PASS  inactive targets and a new spread cannot retain the old leaf');

    await page.evaluate(() => document.querySelector('[data-pdf-layout="page"]').click());
    await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady === 'true' && document.querySelectorAll('.pdf-page.book-active').length === 1);
    state = await metrics(page);
    const onlyPage = state.pages[0];
    await gripEvent(page, 'pointerdown', centre(state.grip));
    await gripEvent(page, 'pointermove', { x: onlyPage.right + 80, y: centre(onlyPage).y });
    onPage(await metrics(page), onlyPage.page);
    await gripEvent(page, 'pointerup', centre(onlyPage));
    console.log('PASS  Page layout keeps its single guide leaf');

    await page.evaluate(() => document.querySelector('[data-pdf-layout="scroll"]').click());
    await page.waitForFunction(() => !document.getElementById('documentPane').classList.contains('paged-pdf-flow') && document.getElementById('pdfFrame').dataset.positionReady === 'true');
    await page.evaluate(() => {
      const pane = document.getElementById('documentPane');
      const second = document.querySelector('.pdf-page[data-page="2"]');
      pane.scrollTop += second.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      pane.dispatchEvent(new Event('scroll'));
    });
    const scrollPoint = await page.locator('#documentPane').evaluate(pane => {
      const r = pane.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 100 };
    });
    await gripEvent(page, 'pointerdown', scrollPoint);
    await gripEvent(page, 'pointermove', scrollPoint);
    const scrollGuide = await page.evaluate(() => {
      const band = document.getElementById('guideBand').getBoundingClientRect();
      const second = document.querySelector('.pdf-page[data-page="2"]').getBoundingClientRect();
      return { x: band.left, right: band.right, pageLeft: second.left, pageRight: second.right };
    });
    assert(Math.abs(scrollGuide.x - scrollGuide.pageLeft) <= 1 && Math.abs(scrollGuide.right - scrollGuide.pageRight) <= 1, 'Scroll guide still uses its page at the pointer Y');
    await gripEvent(page, 'pointerup', scrollPoint);
    console.log('PASS  Scroll layout preserves coordinate-based guide placement');
    assert.deepEqual(errors, [], 'no browser page errors');
    console.log('PASS  no browser page errors (' + browserName + ')');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
