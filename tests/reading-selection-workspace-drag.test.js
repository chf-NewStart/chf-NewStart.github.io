/* A fresh (unsaved) text selection can be dragged into the open workspace by finger: a short
   hold on the selected words picks the passage up (Android has no native drag for selected
   text; before, only the drag handle worked). A quick tap leaves the selection alone. Chromium. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const PHRASE = 'carry this fresh passage';
async function select(page) {
  await page.waitForFunction(p => [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].some(s => s.textContent.includes(p)), PHRASE);
  return page.evaluate(p => {
    const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].find(s => s.textContent.includes(p));
    const start = span.firstChild.textContent.indexOf(p), range = document.createRange();
    range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + p.length);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 5 }));
    const r = range.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, PHRASE);
}
(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false })); localStorage.setItem('readingRoom.notebookCollapsed.v1', '1'); });
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Please carry this fresh passage into the workspace beside it.', { x: 50, y: 700, size: 16, font });
  await page.locator('#pdfFile').setInputFiles({ name: 'fresh.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await page.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady === 'true');
  await page.locator('#zenWorkspace').click(); await page.locator('#workspacePanel').waitFor({ state: 'visible' });
  const cdp = await context.newCDPSession(page);
  const board = await page.locator('#workspaceBoard').evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.left + r.width * .55, y: r.top + Math.min(260, r.height * .2) }; });

  // 1. A quick tap on the selection leaves it selected.
  let from = await select(page); await page.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => getSelection().toString()), PHRASE, 'a quick tap keeps the selection');
  assert.equal(await page.locator('.workspace-highlight-ghost').count(), 0);

  // 2. Hold, then drag the selected words into the workspace.
  from = await select(page); await page.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 2 }] });
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.workspace-highlight-ghost').isVisible(), true, 'a held finger picks up the passage');
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (board.x - from.x) * k / 6, y: from.y + (board.y - from.y) * k / 6, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => !!document.querySelector('.workspace-card .workspace-quote'));
  const saved = await page.evaluate(() => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.id === id); });
  assert.equal(saved.readingExcerpts.items.length, 1, 'one excerpt lands on the workspace');
  assert.equal(saved.readingExcerpts.items[0].quote, PHRASE);
  assert.equal(await page.locator('.workspace-highlight-ghost').count(), 0, 'the ghost is gone after the drop');
  // 3. iPad: untouched. Its native selection drag and Pencil marking stay as they were, so the
  //    hold never claims the selection there.
  const ipad = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const pad = await ipad.newPage(); pad.on('pageerror', e => errors.push(String(e)));
  await pad.addInitScript(() => { localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false })); localStorage.setItem('readingRoom.notebookCollapsed.v1', '1'); });
  await pad.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await pad.waitForFunction(() => document.body.classList.contains('library-ready'));
  await pad.locator('#pdfFile').setInputFiles({ name: 'fresh.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await pad.waitForFunction(() => document.getElementById('pdfFrame').dataset.pagedReady === 'true');
  await pad.locator('#zenWorkspace').click(); await pad.locator('#workspacePanel').waitFor({ state: 'visible' });
  const padCdp = await ipad.newCDPSession(pad), padFrom = await select(pad); await pad.waitForTimeout(200);
  await padCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...padFrom, id: 3 }] });
  await pad.waitForTimeout(450);
  assert.equal(await pad.locator('.workspace-highlight-ghost').count(), 0, 'on an iPad the hold does not claim the selection');
  await padCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(errors, []);
  console.log('PASS a fresh selection drags into the workspace by finger hold; a quick tap keeps the selection; iPad behaviour unchanged');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
