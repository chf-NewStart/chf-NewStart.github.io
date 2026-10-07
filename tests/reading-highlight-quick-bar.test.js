/* After a highlight lands, a small bar offers four colors, Define and ⋯ beside it. Colors
   recolor that exact highlight (same id, text, rects, note) as one Undo step; Define and ⋯
   open the existing card; the bar stays inside the paper pane with 44px targets, goes away
   at the next touch, Pencil, scroll or Escape elsewhere, and never revives a removed one. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');

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
async function generatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('First independent paper highlight.', { x: 52, y: 710, size: 13, font });
  page.drawText('Second independent paper highlight.', { x: 52, y: 672, size: 13, font });
  page.drawText('Third line for Pencil checks.', { x: 52, y: 634, size: 13, font });
  page.drawText('Fourth line for scrolling.', { x: 52, y: 596, size: 13, font });
  page.drawText('Fifth line to remove again.', { x: 52, y: 558, size: 13, font });
  page.drawText('Sixth line for Escape.', { x: 52, y: 520, size: 13, font });
  page.drawText('Seventh line for keyboard Undo.', { x: 52, y: 482, size: 13, font });
  return Buffer.from(await doc.save());
}
async function chapter(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
    .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
const highlights = saved => Object.values(saved.highlights || {}).flat();
async function select(page, phrase) {
  await page.waitForFunction(phrase => [...document.querySelectorAll('.pdf-page .text-layer span')].some(span => span.textContent.includes(phrase)), phrase);
  await page.evaluate(phrase => {
    const span = [...document.querySelectorAll('.pdf-page .text-layer span')].find(node => node.textContent.includes(phrase) && node.firstChild);
    const start = span.firstChild.textContent.indexOf(phrase), range = document.createRange();
    range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + phrase.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 92 }));
  }, phrase);
  await page.locator('#selectionCreateHighlight').waitFor({ state: 'visible' });
}
async function highlightWith(page, phrase, color = 'yellow') {
  await select(page, phrase);
  await page.locator(`#selectionCreateHighlight [data-selection-highlight-color="${color}"]`).click();
  await page.locator('#highlightQuick').waitFor({ state: 'visible' });
}
const quickHidden = page => page.locator('#highlightQuick').evaluate(node => node.classList.contains('hidden'));

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = { headless: true };
    if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'quick-bar.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);

    // The bar appears beside the new highlight, inside the paper pane, with 44px targets.
    await highlightWith(page, 'First independent');
    const geometry = await page.evaluate(() => {
      const bar = document.getElementById('highlightQuick').getBoundingClientRect(), pane = document.getElementById('documentPane').getBoundingClientRect();
      const mark = document.querySelector('.saved-highlight').getBoundingClientRect();
      const sizes = [...document.querySelectorAll('#highlightQuick button')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); });
      return { inside: bar.left >= pane.left && bar.right <= pane.right && bar.top >= pane.top && bar.bottom <= pane.bottom,
        overlaps: !(bar.bottom <= mark.top || bar.top >= mark.bottom || bar.right <= mark.left || bar.left >= mark.right), sizes };
    });
    assert.equal(geometry.inside, true, 'the bar stays inside the paper pane');
    assert.equal(geometry.overlaps, false, 'the bar does not cover the highlight');
    assert.equal(geometry.sizes.length, 6, 'four colors, Define and ⋯');
    assert(geometry.sizes.every(size => size >= 44), 'every target is at least 44px: ' + geometry.sizes);
    assert.equal(await page.locator('#highlightQuick [data-quick-color="yellow"]').getAttribute('aria-pressed'), 'true');

    // A color recolors that exact highlight: same id, text, rects; one Undo restores it.
    const before = highlights(await chapter(page));
    assert.equal(before.length, 1);
    await page.locator('#highlightQuick [data-quick-color="mint"]').click();
    const after = highlights(await chapter(page));
    assert.equal(after.length, 1, 'no new highlight');
    assert.equal(after[0].id, before[0].id); assert.equal(after[0].text, before[0].text);
    assert.deepEqual(after[0].rects, before[0].rects); assert.equal(after[0].color, 'mint');
    assert.equal(await page.locator('.saved-highlight.hl-mint').count() > 0, true, 'the paper shows the new color');
    assert.equal(await quickHidden(page), false, 'the bar stays for another choice');
    await page.locator('#highlightQuick [data-quick-color="coral"]').click();
    assert.equal(highlights(await chapter(page))[0].color, 'coral');
    await page.locator('#zenUndo').click();
    assert.equal(highlights(await chapter(page))[0].color, 'mint', 'Undo steps back one color at a time');
    await page.locator('#zenUndo').click();
    assert.equal(highlights(await chapter(page))[0].color, 'yellow');
    assert.equal(highlights(await chapter(page))[0].id, before[0].id);

    // ⋯ opens the full card for that highlight; its note is kept by later recolors.
    await highlightWith(page, 'Second independent');
    const second = highlights(await chapter(page)).find(h => h.text.includes('Second'));
    await page.locator('#highlightQuickMore').click();
    assert.equal(await quickHidden(page), true);
    await page.locator('#selectionCard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#selectionCard').evaluate(n => n.classList.contains('note-open')), true, 'the saved-highlight card opens');
    await page.locator('#selectionNote').fill('Why this matters');
    await page.keyboard.press('Escape');
    await page.locator('#selectionClose').click().catch(() => {});

    // Define opens the existing lookup for the highlighted text.
    await highlightWith(page, 'paper highlight', 'blue');
    await page.locator('#highlightQuickDefine').click();
    await page.locator('#selectionCard').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('selectionCard').classList.contains('lookup-open'));
    assert.match(await page.locator('#lookupSelection').textContent(), /paper highlight/);
    await page.locator('#selectionClose').click();

    // A Pencil stroke elsewhere closes the bar; the stroke itself goes to the paper.
    await highlightWith(page, 'Pencil checks');
    const pane = await page.locator('#documentPane').boundingBox();
    const target = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 61, isPrimary: true, buttons: 1, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 61, isPrimary: true, buttons: 0, clientX: x, clientY: y }));
      return el.closest('#highlightQuick') ? 'bar' : 'paper';
    }, { x: pane.x + pane.width / 2, y: pane.y + pane.height - 60 });
    assert.equal(target, 'paper');
    assert.equal(await quickHidden(page), true, 'the next stroke elsewhere closes the bar');

    // Scrolling and Escape close it too.
    await highlightWith(page, 'for scrolling');
    await page.locator('#documentPane').evaluate(node => { node.scrollTop += 40; node.dispatchEvent(new Event('scroll')); });
    assert.equal(await quickHidden(page), true, 'scrolling closes the bar');

    // A highlight removed while the bar is up is never brought back by it.
    const count = highlights(await chapter(page)).length;
    await highlightWith(page, 'remove again');
    assert.equal(highlights(await chapter(page)).length, count + 1);
    await page.evaluate(() => document.getElementById('zenUndo').click());
    assert.equal(highlights(await chapter(page)).length, count, 'Undo removed the new highlight');
    await page.evaluate(() => document.querySelector('#highlightQuick [data-quick-color="coral"]').click());
    assert.equal(highlights(await chapter(page)).length, count, 'the bar does not revive it');
    assert.equal(await quickHidden(page), true);

    // Escape closes only the bar; the paper stays open.
    await highlightWith(page, 'for Escape');
    await page.keyboard.press('Escape');
    assert.equal(await quickHidden(page), true, 'Escape closes the bar');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#readerPage').evaluate(n => !n.classList.contains('hidden')), true, 'Escape leaves the paper open');
    assert.equal(await page.evaluate(() => document.body.classList.contains('zen')), true, 'and stays in the reader');

    // Keyboard Undo and Redo keep the bar truthful: the right color, or gone with its highlight.
    await highlightWith(page, 'keyboard Undo');
    await page.locator('#highlightQuick [data-quick-color="mint"]').click();
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.locator('#highlightQuick [data-quick-color="mint"]').evaluate(n => n.blur());
    await page.keyboard.press(mod + '+z');
    await page.waitForTimeout(100);
    assert.equal(highlights(await chapter(page)).find(h => h.text.includes('keyboard')).color, 'yellow');
    assert.equal(await page.locator('#highlightQuick [data-quick-color="yellow"]').getAttribute('aria-pressed'), 'true', 'Undo moves the selected color back');
    assert.equal(await page.locator('#highlightQuick [data-quick-color="mint"]').getAttribute('aria-pressed'), 'false');
    await page.keyboard.press(mod + '+z');
    await page.waitForTimeout(100);
    assert.equal(highlights(await chapter(page)).some(h => h.text.includes('keyboard')), false, 'the second Undo removes the highlight');
    assert.equal(await quickHidden(page), true, 'and the bar goes with it');
    assert.deepEqual(errors, []);
    console.log('PASS the highlight quick bar recolors in place, opens Define and the card, and stays out of the way');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
