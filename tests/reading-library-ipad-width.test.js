/* The library header never widens the page on iPad widths. When the sort,
   Offline, Wall/List and Clean/Handwritten controls plus search overflowed one
   line (721-975px), mobile Safari grew the layout viewport and zoomed out, which
   later left the reader's X off screen on a phone. Browser evidence only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
// iPhone, iPad mini/Air/Pro portrait, split-view widths, and landscape.
const SIZES = [[390, 844], [744, 1133], [820, 1180], [834, 1194], [900, 1180], [1024, 1366], [1180, 820], [1366, 1024]];

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  let failures = 0;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    for (const [width, height] of SIZES) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: ENGINE === 'chromium', hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
      await page.locator('#librarySearch').waitFor({ state: 'visible' });
      const m = await page.evaluate(() => {
        const box = node => node.getBoundingClientRect();
        const controls = [...document.querySelectorAll('.section-head > *')].filter(node => node.getClientRects().length);
        return {
          doc: document.documentElement.scrollWidth,
          vw: window.innerWidth,
          rights: controls.map(node => [node.id || node.className, Math.round(box(node).right)]),
          search: box(document.querySelector('#librarySearch')).width
        };
      });
      try {
        assert.equal(m.vw, width, `layout viewport stays ${width}px (was ${m.vw})`);
        assert(m.doc <= width, `page does not scroll sideways at ${width}px (${m.doc})`);
        for (const [name, right] of m.rights) assert(right <= width, `${name} fits inside ${width}px (right ${right})`);
        assert(m.search >= 180, `search stays usable at ${width}px (${Math.round(m.search)}px wide)`);
        console.log(`PASS library header fits at ${width}x${height}`);
      } catch (error) {
        failures++;
        console.log(`FAIL ${error.message}`);
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
