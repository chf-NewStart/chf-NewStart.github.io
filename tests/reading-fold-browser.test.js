/* Browser coverage for the deliberately opt-in, read-only Scroll fold view. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_FOLD_TEST_PORT || 8246);
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
async function fixture() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle('Paper folding fixture');
  for (let n = 0; n < 3; n++) {
    const page = doc.addPage([612, 792]);
    for (let line = 0; line < 18; line++) {
      page.drawText('Left passage ' + line + ' on page ' + (n + 1), { x: 32, y: 744 - line * 38, size: 11, font });
      page.drawText('Right passage ' + line + ' stays in order.', { x: 323, y: 734 - line * 38, size: 11, font });
    }
    page.drawRectangle({ x: 30, y: 105, width: 550, height: 18, color: rgb(.2, .5, .7) });
  }
  return Buffer.from(await doc.save());
}
async function chapter(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.id === localStorage.getItem('readingRoom.lastOpen.v1')));
}
function annotationBytes(ch) { return JSON.stringify([ch.pdfInk, ch.pdfInkDeleted, ch.highlights, ch.pageNotes]); }
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#pdfFrame[data-position-ready="true"] .pdf-page .text-layer span') && document.querySelector('.pdf-page canvas').width > 0);
}
async function settings(page) {
  if (!await page.locator('#comfortBar').isVisible()) {
    if (await page.locator('#comfortBtn').isVisible()) await page.locator('#comfortBtn').click();
    else { await page.locator('#touchMore').click(); await page.locator('#touchSettings').click(); }
  }
}
async function closeSettings(page) {
  if (await page.locator('#comfortBar').isVisible()) {
    await page.locator('#comfortBtn').click();
    await page.locator('#comfortBar').waitFor({state:'hidden'});
  }
}
async function openFold(page) {
  await settings(page);
  await page.locator('[data-open-pdf-fold]').filter({ visible: true }).first().click();
  await page.locator('#pdfFoldDialog').waitFor({ state: 'visible' });
}
async function band(page, top = 25, bottom = 55) {
  for (const [id, value] of [['pdfFoldTop', top], ['pdfFoldBottom', bottom]]) {
    await page.locator('#' + id).fill(String(value));
    await page.locator('#' + id).dispatchEvent('input');
  }
}
async function fold(page) {
  await openFold(page); await band(page); await page.locator('#confirmPdfFold').click();
  await page.locator('.pdf-page[data-page="1"] .pdf-fold-seam').waitFor({ state: 'visible' });
}
(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('fold-fixture')) return;
    sessionStorage.setItem('fold-fixture', '1');
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false }));
    localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
    localStorage.removeItem('readingRoom.lastOpen.v1');
  });
  try {
    await page.goto('http://127.0.0.1:' + PORT + '/reading.html');
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.setInputFiles('#pdfFile', { name: 'fold-fixture.pdf', mimeType: 'application/pdf', buffer: await fixture() });
    await ready(page);
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('readingRoom.v1')), ch = data.chapters.find(c => c.id === localStorage.getItem('readingRoom.lastOpen.v1'));
      ch.pdfInk = { '1': [{ id: 'ink-safekeeping', color: 'blue', width: 3, points: [[.1, .15, .5], [.2, .4, .8], [.25, .8, .5]], at: 100, updatedAt: 100 }] };
      ch.highlights = { '1': [{ id: 'mark-safekeeping', text: 'An annotated passage', color: 'yellow', rects: [{ x: .1, y: .2, w: .4, h: .025 }], at: 100, note: 'Do not change my note.' }] };
      ch.pageNotes = { '1': 'Keep the original page note.' };
      localStorage.setItem('readingRoom.v1', JSON.stringify(data));
    });
    await page.reload(); await ready(page);
    const before = await chapter(page), unchanged = annotationBytes(before);
    await page.locator('#settingsBtn').click();
    assert.equal(await page.locator('#pdfFoldEnabled').isChecked(), false, 'folding defaults off');
    await page.locator('#pdfFoldEnabled').check();
    await page.locator('[data-close="settingsDialog"]').click();
    await page.evaluate(() => {
      const holder=document.querySelector('.pdf-page[data-page="1"]'),target=holder.querySelector('.text-layer'),r=holder.getBoundingClientRect();
      const starts=[[.2,.15],[.2,.4],[.8,.15],[.8,.4]];
      const touches=(moving,count)=>starts.slice(0,count).map(([x,y],i)=>new Touch({identifier:i+1,target,clientX:r.left+r.width*x,clientY:r.top+r.height*y+(moving?(i%2?-50:50):0)}));
      for(let n=1;n<=4;n++)target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:touches(false,n),changedTouches:touches(false,n).slice(-1)}));
      target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:touches(true,4),changedTouches:touches(true,4)}));
      target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],changedTouches:touches(true,4)}));
    });
    await page.locator('#pdfFoldDialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#pdfFoldTop').inputValue(),'15','gesture previews the band between the fingers');
    assert.equal(await page.locator('#pdfFoldBottom').inputValue(),'40');
    assert.equal(JSON.stringify((await chapter(page)).pdfFolds),JSON.stringify(before.pdfFolds),'gesture never writes before confirmation');
    assert.equal(await page.locator('#pdfFrame').evaluate(el=>el.style.transform),'','four fingers cancel the provisional two-finger zoom');
    await page.locator('#cancelPdfFold').click();
    await openFold(page); await band(page); await page.locator('#cancelPdfFold').click();
    assert.equal(JSON.stringify((await chapter(page)).pdfFolds), JSON.stringify(before.pdfFolds), 'cancel does not write a fold');
    const sourceHeight = await page.locator('.pdf-page[data-page="1"]').evaluate(el => el.getBoundingClientRect().height);
    await fold(page);
    const folded = await chapter(page), hash = folded.contentHash;
    assert.equal(Object.keys(folded.pdfFolds.byHash[hash].items).length, 1);
    const foldedHeight = await page.locator('.pdf-page[data-page="1"]').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(foldedHeight < sourceHeight - 50, 'the gap really closes: '+JSON.stringify({sourceHeight,foldedHeight,folds:folded.pdfFolds}));
    assert.equal(annotationBytes(folded), unchanged, 'fold leaves annotations byte-for-byte intact');
    assert.ok(await page.locator('.pdf-page[data-page="1"] .pdf-sheet').isHidden(), 'hidden source text cannot be selected');
    const budgets = await page.locator('.pdf-page[data-page="1"]').evaluate(el => Array.from(el.querySelectorAll('canvas')).reduce((sum, c) => sum + c.width * c.height, 0));
    assert.ok(budgets <= 9e6, 'source and derived rasters share the tablet cap');
    await page.screenshot({ path: '/tmp/phloem-fold-preview.png' });
    await page.reload(); await ready(page);
    await page.locator('.pdf-fold-seam').first().waitFor({ state: 'visible' });
    await settings(page); await page.locator('[data-pdf-layout="page"]').click();
    await page.waitForFunction(()=>document.querySelector('#pdfFrame').classList.contains('paged-pdf-flow')&&!document.querySelector('.pdf-fold-seam'));
    assert.equal(JSON.stringify((await chapter(page)).pdfFolds),JSON.stringify(folded.pdfFolds),'Page layout retains folds without applying partial geometry');
    await settings(page); await page.locator('[data-pdf-layout="scroll"]').click();
    await page.locator('.pdf-fold-seam').first().waitFor({state:'visible'});
    await closeSettings(page);
    assert.equal(annotationBytes(await chapter(page)), unchanged, 'reload retains annotations');
    await page.locator('.pdf-fold-seam').first().click();
    await page.waitForFunction(() => !document.querySelector('.pdf-fold-seam'));
    assert.equal(await page.evaluate(() => {
      const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.id === localStorage.getItem('readingRoom.lastOpen.v1'));
      return window.PhloemFolds.activeBands({ folds: ch.pdfFolds, pending: ch.pdfFoldPending }, ch.contentHash, 1).length;
    }), 0, 'seam unfolds durably');
    await settings(page); await page.locator('#undoPdfFold').click();
    await page.locator('.pdf-fold-seam').first().waitFor({state:'visible'});
    assert.equal(annotationBytes(await chapter(page)), unchanged, 'undo restores only the fold');
    assert.deepEqual(Object.keys((await chapter(page)).pdfFolds.byHash[hash].items),Object.keys(folded.pdfFolds.byHash[hash].items),'undo restores the same fold identity');
    await page.locator('#unfoldAllPdf').click();
    await page.waitForFunction(() => !document.querySelector('.pdf-fold-seam'));
    assert.equal(annotationBytes(await chapter(page)), unchanged, 'unfold all preserves source annotations');
    await page.locator('#undoPdfFold').click();
    await page.locator('.pdf-fold-seam').first().waitFor({state:'visible'});
    await page.locator('#unfoldAllPdf').click();
    await page.waitForFunction(() => !document.querySelector('.pdf-fold-seam'));
    await closeSettings(page);
    await fold(page);
    const priorFold = JSON.stringify((await chapter(page)).pdfFolds);
    await page.locator('.pdf-fold-display').first().click({ position: { x: 100, y: 30 } });
    await page.waitForFunction(() => !document.querySelector('.pdf-fold-seam'));
    assert.equal(JSON.stringify((await chapter(page)).pdfFolds), priorFold, 'interaction reveal is temporary');
    assert.equal(annotationBytes(await chapter(page)), unchanged);
    await page.reload(); await ready(page);
    await page.locator('.pdf-fold-seam').first().waitFor({ state: 'visible' });
    await page.locator('#settingsBtn').click(); await page.locator('#pdfFoldEnabled').uncheck();
    await page.locator('[data-close="settingsDialog"]').click();
    assert.equal(await page.locator('.pdf-fold-seam').count(), 0, 'disabling renders original pages');
    assert.equal(JSON.stringify((await chapter(page)).pdfFolds), priorFold, 'disabling retains saved folds');
    assert.deepEqual(errors, [], 'no browser errors');
    console.log('PASS fold confirm/cancel, real gap collapse, persistence, shared raster cap, preserved annotations, layout switching, tap-unfold, unfold all, undo and temporary reveal');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
