/* Android (Galaxy) reader feedback:
   1. Dragging a selection over the blank gap between lines no longer jumps to the page's
      start or end (PDF.js's end-of-content guard); iPad keeps WebKit's own handles.
   2. A hovering pen (S Pen, Apple Pencil hover) no longer drags the reading guide; a pen
      tap places it like a finger, and a mouse still carries it.
   3. Holding a citation opens its card even when Android's own long-press (contextmenu, or
      taking the pointer away at ~400 ms) arrives before the half-second timer.
   Run with PHLOEM_BROWSER=chromium or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, PDFName, PDFString, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function paperPdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([612, 792]), refs = doc.addPage([612, 792]);
  ['Line one starts the paragraph here', 'Line two keeps going with words', 'Line three is in the middle now', 'Line four comes after the gap', 'Line five ends this short page']
    .forEach((t, i) => first.drawText(t, { x: 72, y: 700 - i * 34, size: 16, font }));
  first.drawText('As shown before [1].', { x: 72, y: 480, size: 16, font });
  first.drawText('Footer text far below', { x: 72, y: 120, size: 12, font });
  refs.drawText('REFERENCES', { x: 72, y: 720, size: 16, font });
  refs.drawText('[1] Alpha reference about the claim.', { x: 72, y: 690, size: 12, font });
  const link = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [180, 474, 200, 496], Border: [0, 0, 0], Dest: [refs.ref, PDFName.of('XYZ'), 0, 705, 0] }));
  first.node.set(PDFName.of('Annots'), doc.context.obj([link])); void PDFString;
  return Buffer.from(await doc.save());
}
async function openPaper(browser, options, comfort) {
  const page = await browser.newPage(options), errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(c => { localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} })); localStorage.setItem('readingRoom.comfort.v1', JSON.stringify(c)); }, comfort);
  await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`, { waitUntil: 'load' });
  await page.locator('#pdfFile').setInputFiles({ name: 'android.pdf', mimeType: 'application/pdf', buffer: await paperPdf() });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span').length >= 6 && document.querySelector('.pdf-page[data-page="1"] .pdf-link'));
  await page.waitForTimeout(700); return { page, errors };
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const ENGINE = process.env.PHLOEM_BROWSER || 'chromium', browser = await playwright[ENGINE].launch(), passes = [];

  // 1. Selection across a gap stays with the nearest words.
  {
    const { page, errors } = await openPaper(browser, { viewport: { width: 1100, height: 900 } }, { pdfLayout: 'scroll', focus: false });
    const boxes = await page.evaluate(() => Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')).filter(s => /^Line/.test(s.textContent)).map(s => { const r = s.getBoundingClientRect(); return { l: r.left, r: r.right, top: r.top, b: r.bottom }; }));
    const [l1, l2, l3, l4] = boxes;
    for (const [name, tx, ty] of [['the gap under line 3', (l3.l + l3.r) / 2, (l3.b + l4.top) / 2], ['past the end of line 2', l2.r + 60, (l2.top + l2.b) / 2], ['the margin left of line 4', l4.l - 30, (l4.top + l4.b) / 2]]) {
      await page.evaluate(() => window.getSelection().removeAllRanges());
      const sx = l1.l + 60, sy = (l1.top + l1.b) / 2; await page.mouse.move(sx, sy); await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(sx + (tx - sx) * k / 8, sy + (ty - sy) * k / 8);
      const text = await page.evaluate(() => window.getSelection().toString().replace(/\s+/g, ' ').trim());
      await page.mouse.up(); await page.waitForTimeout(120);
      assert(/Line two/.test(text) && !/Footer|five|As shown/.test(text) && !/^Line one/.test(text), `dragging to ${name} selects up to the nearby words, no jump: "${text}"`);
    }
    assert.equal(await page.locator('.text-layer.selecting').count(), 0, 'the guard resets when the drag ends');
    assert.deepEqual(errors, []); await page.close(); passes.push('gap drags stay with nearby words');
  }
  {
    const { page, errors } = await openPaper(browser, { viewport: { width: 1024, height: 1366 }, userAgent: IPAD, hasTouch: true }, { pdfLayout: 'scroll', focus: false });
    assert.equal(await page.locator('.text-layer-end').count(), 0, 'iPad keeps its own selection handles: no guard added');
    assert.deepEqual(errors, []); await page.close(); passes.push('iPad text layer unchanged');
  }

  // 2 + 3 on a Galaxy-sized Android phone.
  const phone = { viewport: { width: 384, height: 832 }, userAgent: ANDROID, hasTouch: true };
  if (ENGINE === 'chromium') Object.assign(phone, { isMobile: true, deviceScaleFactor: 3 });
  const { page, errors } = await openPaper(browser, phone, { pdfLayout: 'scroll', focus: true, guideOrientation: 'row', guideLock: false });
  const fire = (type, init) => page.evaluate(([type, init]) => { const target = document.elementFromPoint(init.clientX, init.clientY);
    const Ctor = type === 'contextmenu' ? MouseEvent : PointerEvent; const event = new Ctor(type, { bubbles: true, cancelable: true, isPrimary: true, button: 0, ...init });
    target.dispatchEvent(event); return { prevented: event.defaultPrevented, target: target.className }; }, [type, init]);
  const guideY = () => page.evaluate(() => getComputedStyle(document.getElementById('paneSpotlight')).getPropertyValue('--guide-y').trim());
  const pane = await page.evaluate(() => { const r = document.querySelector('.pdf-page[data-page="1"]').getBoundingClientRect(); return { x: r.left + r.width * .6, top: Math.max(80, r.top + 40), bottom: Math.min(innerHeight - 120, r.bottom - 40) }; });

  const startY = await guideY();
  for (const y of [pane.top, (pane.top + pane.bottom) / 2, pane.bottom]) await fire('pointermove', { pointerType: 'pen', pointerId: 31, buttons: 0, clientX: pane.x, clientY: y });
  await page.waitForTimeout(150);
  assert.equal(await guideY(), startY, 'a hovering pen leaves the guide where it is');
  await fire('pointermove', { pointerType: 'mouse', pointerId: 1, buttons: 0, clientX: pane.x, clientY: pane.bottom });
  await page.waitForTimeout(100);
  const mouseY = await guideY(); assert.notEqual(mouseY, startY, 'a mouse cursor still carries the guide');
  await fire('click', { pointerType: 'pen', pointerId: 31, clientX: pane.x, clientY: pane.top, detail: 1 });
  await page.waitForTimeout(400);
  assert.notEqual(await guideY(), mouseY, 'a pen tap places the guide where it taps');
  assert(!(await page.locator('#paneSpotlight').evaluate(el => el.classList.contains('locked'))), 'and does not pin it');
  passes.push('pen hover leaves the guide; pen tap places it; mouse still carries it');

  const link = await page.evaluate(() => { const a = document.querySelector('.pdf-page[data-page="1"] .pdf-link'); a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.waitForTimeout(300);
  const cardOpen = () => page.evaluate(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden'));
  const closeCard = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert(!(await cardOpen())); };
  const at = { clientX: link.x, clientY: link.y };

  // Android long-press: contextmenu at ~400 ms, then the pointer is taken away.
  await fire('pointerdown', { ...at, pointerType: 'touch', pointerId: 41, buttons: 1 });
  await page.waitForTimeout(380);
  const menu = await fire('contextmenu', at);
  assert(menu.prevented, 'the long-press menu is replaced by the card');
  assert(await cardOpen(), 'a finger held on a citation opens its card on Android\'s long-press');
  await fire('pointercancel', { ...at, pointerType: 'touch', pointerId: 41 });
  await page.waitForTimeout(200);
  assert(await cardOpen(), 'the card stays when Android takes the pointer');
  await page.waitForFunction(() => /Alpha reference/.test(document.getElementById('pdfReferencePreviewText').textContent));
  await closeCard();

  // S Pen: Android takes the pointer without a menu after the pen held still.
  await fire('pointerdown', { ...at, pointerType: 'pen', pointerId: 42, buttons: 1, pressure: .5 });
  await page.waitForTimeout(380);
  await fire('pointercancel', { ...at, pointerType: 'pen', pointerId: 42 });
  await page.waitForTimeout(150);
  assert(await cardOpen(), 'an S Pen held still on a citation opens its card');
  await closeCard();

  // An early cancel is a scroll or a zoom: no card.
  await fire('pointerdown', { ...at, pointerType: 'touch', pointerId: 43, buttons: 1 });
  await page.waitForTimeout(120);
  await fire('pointercancel', { ...at, pointerType: 'touch', pointerId: 43 });
  await page.waitForTimeout(600);
  assert(!(await cardOpen()), 'a quick touch that turns into a scroll opens nothing');

  // A mouse right-click stays a quiet no-op.
  await fire('pointerdown', { ...at, pointerType: 'mouse', pointerId: 1, button: 2, buttons: 2 });
  await fire('contextmenu', { ...at, button: 2 });
  await fire('pointerup', { ...at, pointerType: 'mouse', pointerId: 1, button: 2, buttons: 0 });
  await page.waitForTimeout(600);
  assert(!(await cardOpen()), 'a mouse right-click on a citation opens nothing');
  passes.push('citation hold opens on Android long-press (finger + S Pen), early cancel and right-click stay quiet');

  assert.deepEqual(errors, []);
  console.log('PASS ' + passes.join('; '));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
