/* Zoomed-in page turns land where reading continues (readers' feedback): finishing a page
   at its bottom-right and turning forward opens the next page, at the same zoom, on its
   top-left; turning back opens the previous page on its bottom-right; a jump opens on the
   top-left. Not zoomed in, pages stay centred. Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const ENGINE = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[ENGINE].launch();
  const page = await (await browser.newContext({ viewport: { width: 900, height: 760 }, serviceWorkers: 'block' })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false })); });
  await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) { const p = doc.addPage([612, 792]); p.drawText('Page ' + i + ' top left', { x: 40, y: 750, size: 14, font }); p.drawText('Page ' + i + ' bottom right', { x: 420, y: 30, size: 14, font }); }
  await page.locator('#pdfFile').setInputFiles({ name: 'zoom-turn.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  const ready = () => page.waitForFunction(() => { const f = document.getElementById('pdfFrame'); return f.classList.contains('paged-pdf-flow') && f.dataset.pagedReady && !f.dataset.curlState; });
  await ready(); await page.waitForTimeout(400);
  const where = () => page.evaluate(() => { const pane = document.getElementById('documentPane');
    return { page: document.getElementById('mPageLabel').textContent.split('/')[0].trim(), left: Math.round(pane.scrollLeft), top: Math.round(pane.scrollTop),
      maxLeft: Math.round(pane.scrollWidth - pane.clientWidth), maxTop: Math.round(pane.scrollHeight - pane.clientHeight) }; });
  const turn = async step => { await page.evaluate(s => document.getElementById(s > 0 ? 'nextPage' : 'prevPage').click(), step); await page.waitForTimeout(150); await ready(); await page.waitForTimeout(250); };

  // Not zoomed in: turning keeps the page centred (unchanged).
  await turn(1); const fit = await where();
  assert.equal(fit.page, '2'); assert(fit.maxTop <= 2 || Math.abs(fit.top - fit.maxTop / 2) <= 2, 'unzoomed pages stay centred: ' + JSON.stringify(fit));

  // Zoom in, read to the bottom-right, turn forward: top-left of the next page, same zoom.
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  for (let i = 0; i < 4; i++) { await page.keyboard.press('+'); await page.waitForTimeout(250); }
  await ready(); await page.waitForTimeout(300);
  const zoom = await page.locator('#zoomLabel').textContent();
  const zoomed = await where(); assert(zoomed.maxLeft > 100 && zoomed.maxTop > 100, 'zoomed in, the page scrolls both ways: ' + JSON.stringify(zoomed));
  await page.evaluate(() => { const pane = document.getElementById('documentPane'); pane.scrollTo(pane.scrollWidth, pane.scrollHeight); });
  await turn(1); const next = await where();
  assert.equal(next.page, '3'); assert.equal(await page.locator('#zoomLabel').textContent(), zoom, 'the zoom carries over');
  assert(next.left <= 2 && next.top <= 2, 'forward lands on the next page\'s top-left: ' + JSON.stringify(next));

  // Mid-page, turn back: the previous page opens on its bottom-right, where it was finished.
  await page.evaluate(() => { const pane = document.getElementById('documentPane'); pane.scrollTo(pane.scrollWidth / 3, pane.scrollHeight / 3); });
  await turn(-1); const back = await where();
  assert.equal(back.page, '2');
  assert(Math.abs(back.left - back.maxLeft) <= 2 && Math.abs(back.top - back.maxTop) <= 2, 'back lands on the previous page\'s bottom-right: ' + JSON.stringify(back));

  // A jump (not an adjacent turn) opens on the top-left, even when going back.
  await page.evaluate(() => { const pane = document.getElementById('documentPane'); pane.scrollTo(pane.scrollWidth, pane.scrollHeight); });
  await turn(1); await turn(1); await turn(1);
  assert.equal((await where()).page, '5');
  page.once('dialog', dialog => dialog.accept('1'));
  await page.evaluate(() => document.getElementById('mPageLabel').click());
  await page.waitForTimeout(200); await ready(); await page.waitForTimeout(250);
  const jump = await where(); assert.equal(jump.page, '1', 'the page jump went to page 1');
  assert(jump.left <= 2 && jump.top <= 2, 'a jump back opens on the top-left: ' + JSON.stringify(jump));
  assert.deepEqual(errors, []);
  console.log(`PASS zoomed (${zoom}) turns: forward → top-left, back → bottom-right, jump → top-left; unzoomed stays centred (${ENGINE})`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
