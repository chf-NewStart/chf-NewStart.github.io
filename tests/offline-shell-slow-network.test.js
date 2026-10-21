/* From mainland China, houfu72.com (GitHub Pages) can take a minute to answer or never
   does. The journal and Phloem keep their data in the browser, so they should still
   open: once a service worker holds the page, a network that stays silent for 4 s gets
   the cached copy instead. Here the server simply stops answering for the app's own
   files, and both pages must still open quickly. Run with PHLOEM_BROWSER=chromium
   (default) or webkit. */
const fs = require('fs'), http = require('http'), path = require('path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.SLOW_SHELL_TEST_PORT || 8197);

let slow = false;
const held = new Set();
const SLOW_PATHS = /^\/(journal\.html|reading\.html|reading[-a-z]*\.(js|css))$/;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (slow && SLOW_PATHS.test(pathname)) { held.add(res); return; }
  const file = path.join(ROOT, pathname === '/' ? 'journal.html' : pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});
server.on('connection', socket => socket.setTimeout(0));

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

async function controlled(page, url, ready) {
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(ready);
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const base = 'http://localhost:' + PORT;

  /* The journal. */
  {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    await context.route(/^https?:\/\/(?!localhost)/, route => route.abort());
    const page = await context.newPage();
    await controlled(page, base + '/journal.html', () => !!document.getElementById('page'));
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
    check('the journal’s service worker covers only journal.html', /\/journal\.html$/.test(scope), scope);
    await page.fill('#page', 'Written before the network went quiet.');
    await page.waitForTimeout(600);
    slow = true;
    const start = Date.now();
    await page.reload({ waitUntil: 'load', timeout: 20000 });
    const took = Date.now() - start;
    const text = await page.inputValue('#page');
    check('with houfu72.com silent, the journal still opens from cache within seconds', took < 9000 && /network went quiet/.test(text), took + ' ms');
    slow = false;
    held.forEach(r => { try { r.destroy(); } catch (e) {} }); held.clear();
    await context.close();
  }

  /* Phloem's web reader. */
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route(/^https?:\/\/(?!localhost)/, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await controlled(page, base + '/reading.html', () => document.body.classList.contains('library-ready'));
    /* wait until the whole shell is cached */
    await page.waitForFunction(async () => { const keys = await caches.keys(); const c = keys.find(k => k.indexOf('phloem-shell-') === 0); return c && (await (await caches.open(c)).keys()).length >= 20; });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    slow = true;
    const start = Date.now();
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'), null, { timeout: 30000 });
    const took = Date.now() - start;
    check('with houfu72.com silent, Phloem still opens from cache', took < 15000, took + ' ms');
    await page.waitForTimeout(500);
    check('the cached reader runs without errors', errors.length === 0, errors.join(' | '));
    slow = false;
    held.forEach(r => { try { r.destroy(); } catch (e) {} }); held.clear();
    /* a network that answers still wins */
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    check('when the network answers again, the reader loads as usual', true);
    await context.close();
  }

  await browser.close();
  held.forEach(r => { try { r.destroy(); } catch (e) {} });
  server.close();
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); held.forEach(r => { try { r.destroy(); } catch (e) {} }); server.close(); process.exit(1); });
