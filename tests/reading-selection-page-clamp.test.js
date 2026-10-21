/* A mouse drag that starts in a PDF page's text keeps its selection on that page. Before the clamp a
   drag ending in blank space (a margin, the desk) could jump across pages: the selection covered the rest
   of the page and more, and Highlight then refused it because it spanned pages. Each scenario runs in a
   fresh page so earlier highlights cannot change the UI state. PHLOEM_BROWSER=chromium|webkit */
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

async function scenario(browser, port, where) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1250 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => localStorage.setItem('readingRoom.comfort.v1',
    JSON.stringify({ pdfLayout: 'scroll', guideOrientation: 'row', focus: false })));
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page[data-page="2"]'));
  await page.evaluate(() => document.querySelector('#pdfFrame .pdf-page[data-page="2"]').scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelectorAll('#pdfFrame .pdf-page[data-page="2"] .text-layer span').length > 10);
  await page.waitForTimeout(800);
  const geo = await page.evaluate(() => {
    const pg = document.querySelector('#pdfFrame .pdf-page[data-page="2"]');
    pg.scrollIntoView({ block: 'start' });
    const layer = pg.querySelector('.text-layer');
    const spans = [...layer.querySelectorAll('span')].filter(s => !s.children.length && s.textContent.trim().length > 6);
    const s = spans[Math.floor(spans.length / 3)], r = s.getBoundingClientRect(), pr = pg.getBoundingClientRect();
    return { start: { x: r.left + 2, y: r.top + r.height / 2 }, pr: { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom },
             viewportH: innerHeight };
  });
  const p = geo.pr;
  const targets = {
    'the right margin': [p.r - 6, geo.start.y + 40],
    'the bottom margin': [(p.l + p.r) / 2, Math.min(p.b - 6, geo.viewportH - 4)],
    'the desk beside the page': [p.r + 30, geo.start.y + 60],
    'the left margin': [p.l + 4, geo.start.y + 60],
  };
  const end = targets[where];
  await page.mouse.move(geo.start.x, geo.start.y);
  await page.mouse.down();
  await page.mouse.move((geo.start.x + end[0]) / 2, (geo.start.y + end[1]) / 2, { steps: 6 });
  await page.mouse.move(end[0], end[1], { steps: 10 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => {
    const s = window.getSelection(), layer = document.querySelector('#pdfFrame .pdf-page[data-page="2"] .text-layer');
    return { chars: s.toString().replace(/\s+/g, ' ').trim().length,
             anchorOnPage: !!(s.anchorNode && layer.contains(s.anchorNode)), focusOnPage: !!(s.focusNode && layer.contains(s.focusNode)) };
  });
  await page.evaluate(() => document.getElementById('highlightBtn').click());
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => {
    const h = (JSON.parse(localStorage.getItem('readingRoom.v1') || '{}').chapters || [{}])[0].highlights || {};
    return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.length]));
  });
  await context.close();
  return { sel, saved };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    for (const where of ['the right margin', 'the bottom margin', 'the desk beside the page', 'the left margin']) {
      const { sel, saved } = await scenario(browser, port, where);
      check(`drag into ${where}: the selection stays on its page`, sel.chars > 0 && sel.anchorOnPage && sel.focusOnPage, JSON.stringify(sel));
      check(`drag into ${where}: Highlight saves it on that page`, (saved['2'] || 0) === 1 && Object.keys(saved).length === 1, JSON.stringify(saved));
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ENGINE}: ${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
