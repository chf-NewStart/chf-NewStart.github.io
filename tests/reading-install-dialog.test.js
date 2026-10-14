/* Install app: an iPad is offered the App Store app (iPad-only) with its current version,
   an iPhone gets the Home Screen web app, other browsers the web install; each says
   whether this page is the newest web version. Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const running = +(fs.readFileSync(path.join(ROOT, 'reading.html'), 'utf8').match(/reading\.js\?v=(\d+)/) || [])[1];

async function open(browser, options, newerWorker) {
  const context = await browser.newContext(Object.assign({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' }, options));
  await context.route(/^https:\/\/itunes\.apple\.com\/lookup/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ resultCount: 1, results: [{ version: '1.2.2', currentVersionReleaseDate: '2026-10-20T12:00:00Z', trackViewUrl: 'https://apps.apple.com/app/id6813510395' }] }) }));
  if (newerWorker) await context.route(/\/reading-sw\.js\?check=/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "var CACHE = 'phloem-shell-v" + (running + 1) + "';" }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} })));
  await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
  // The nav button is hidden on phone widths and behind an open paper; open it the same way.
  await page.waitForFunction(() => typeof document.getElementById('installNav').onclick === 'function');
  await page.evaluate(() => document.getElementById('installNav').click());
  await page.locator('#installDialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !/Checking/.test(document.getElementById('installVersion').textContent) && document.getElementById('installVersion').textContent);
  return { context, page, errors };
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const name = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[name].launch();
  try {
    let { context, page, errors } = await open(browser, { userAgent: IPAD, hasTouch: true });
    assert.equal(await page.locator('#installStore').isVisible(), true, 'an iPad is offered the App Store app');
    assert.equal(await page.locator('#installStoreLink').getAttribute('href'), 'https://apps.apple.com/app/id6813510395');
    await page.waitForFunction(() => /version 1\.2\.2/.test(document.getElementById('installStoreVersion').textContent));
    assert.match(await page.locator('#installStoreVersion').textContent(), /^Free · version 1\.2\.2 · updated /);
    assert.match(await page.locator('#installDialogHint').textContent(), /iCloud/);
    assert.equal(await page.locator('#installVersion').textContent(), 'You have the newest version of Phloem on the web (v' + running + ').');
    assert.deepEqual(errors, []); await context.close();
    console.log('PASS  iPad: App Store app with its version, and the web version is the newest');

    ({ context, page, errors } = await open(browser, { userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true }));
    assert.equal(await page.locator('#installStore').isVisible(), false);
    assert.equal(await page.locator('#installIpadLink').isVisible(), false);
    assert.match(await page.locator('#installDialogHint').textContent(), /made for iPad.*Add to Home Screen/);
    await context.close();
    console.log('PASS  iPhone: Home Screen web app');

    ({ context, page, errors } = await open(browser, {}, true));
    assert.equal(await page.locator('#installStore').isVisible(), false);
    assert.equal(await page.locator('#installIpadLink').isVisible(), true, 'other devices can still find the iPad app');
    assert.match(await page.locator('#installVersion').textContent(), new RegExp('A newer version \\(v' + (running + 1) + '\\) is ready\\. Reload to update'));
    assert.deepEqual(errors, []); await context.close();
    console.log('PASS  desktop: web install, iPad link, and a newer deploy offers a reload');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
