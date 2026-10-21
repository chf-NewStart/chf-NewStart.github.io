/* On a laptop the paper can be moved by clicking and dragging blank paper, at any zoom where it
   runs off the pane, 1:1 and with a glide after a flick; by the arrow keys (sideways first, then
   the page turns at the edge); and a zoomed-in paper keeps scrollbars visible in Zen. Houfu
   (Chrome, Page/Book layout): "i cannot move the paper around once i zoom them in, on laptop",
   then at the normal zoom dragging down was "sometimes not respondant ... mimic natural dragging".
   PHLOEM_BROWSER=chromium|webkit */
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
const state = page => page.evaluate(() => {
  const p = document.getElementById('documentPane');
  return { l: Math.round(p.scrollLeft), t: Math.round(p.scrollTop), maxL: p.scrollWidth - p.clientWidth, maxT: p.scrollHeight - p.clientHeight,
    zoomed: p.classList.contains('paper-zoomed'), movable: p.classList.contains('paper-movable'), label: document.getElementById('pageNumber').textContent, selected: getSelection().toString().trim().length,
    scrollbar: getComputedStyle(p).scrollbarWidth };
});
/* A point on the visible page that is blank paper (not a word, link or mark), and one on a word. */
const points = page => page.evaluate(() => {
  const pane = document.getElementById('documentPane').getBoundingClientRect();
  const pages = [...document.querySelectorAll('#pdfFrame .pdf-page')].filter(p => { const r = p.getBoundingClientRect(); return r.width && r.bottom > pane.top + 40 && r.top < pane.bottom - 40 && r.right > pane.left + 40 && r.left < pane.right - 40; });
  let blank = null, word = null;
  for (let y = pane.top + 80; y < pane.bottom - 80 && !blank; y += 23) for (let x = pane.left + 80; x < pane.right - 140 && !blank; x += 29) {
    const el = document.elementFromPoint(x, y); if (!el || !pages.some(p => p.contains(el))) continue;
    if (el.closest('.text-layer') && el.nodeName === 'SPAN') continue;
    if (el.closest('a,.pdf-link,[data-hl-id],.book-curl-grip')) continue;
    blank = { x, y };
  }
  /* A word whose first letters are on screen, with room to drag right across it. */
  const span = [...document.querySelectorAll('#pdfFrame .text-layer span')].find(s => { const r = s.getBoundingClientRect(); return !s.children.length && s.textContent.trim().length > 3 && r.width > 30 && r.left > pane.left + 20 && r.left + 170 < pane.right - 20 && r.top > pane.top + 60 && r.bottom < pane.bottom - 60 && document.elementFromPoint(r.left + 4, (r.top + r.bottom) / 2) === s; });
  if (span) { const r = span.getBoundingClientRect(); word = { x: r.left + 4, y: (r.top + r.bottom) / 2 }; }
  return { blank, word };
});
async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 5 }); await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up(); await page.waitForTimeout(250);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    /* Scroll layout at its normal zoom: the paper runs on below the pane, so it can be grabbed. */
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      await page.addInitScript(() => localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', guideOrientation: 'row', focus: false })));
      await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      await page.setInputFiles('#pdfFile', PDF);
      await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
      await page.waitForTimeout(1200);
      await page.evaluate(() => { document.getElementById('documentPane').scrollTop = 1200; });
      await page.waitForTimeout(300);
      const start = await state(page);
      check('scroll, normal zoom: the paper can be grabbed but is not marked zoomed', start.movable && !start.zoomed && start.scrollbar !== 'thin', JSON.stringify(start));
      const { blank } = await points(page);
      check('scroll, normal zoom: found blank paper to press', !!blank);
      if (blank) {
        /* A slow, steady drag that comes to rest before letting go: 1:1, no glide. */
        await page.mouse.move(blank.x, blank.y); await page.mouse.down();
        for (let i = 1; i <= 10; i++) { await page.mouse.move(blank.x, blank.y - 20 * i); await page.waitForTimeout(25); }
        await page.waitForTimeout(150); await page.mouse.up();
        const held = await state(page); await page.waitForTimeout(500); const after = await state(page);
        check('scroll, normal zoom: dragging up 200 px moves the paper up 200 px', Math.abs(held.t - start.t - 200) <= 3, `${start.t} -> ${held.t}`);
        check('scroll, normal zoom: a drag that came to rest does not glide on', after.t === held.t && held.selected === 0, `${held.t} -> ${after.t}`);
        /* A flick: the paper keeps going after the release, slows, and stops by itself. */
        await page.mouse.move(blank.x, blank.y); await page.mouse.down();
        await page.mouse.move(blank.x, blank.y - 240, { steps: 8 }); await page.mouse.up();
        const released = await state(page);
        await page.waitForTimeout(250); const gliding = await state(page);
        await page.waitForTimeout(2200); const settled = await state(page); await page.waitForTimeout(300); const still = await state(page);
        check('scroll, normal zoom: a flick keeps the paper gliding', gliding.t > released.t + 40, `${released.t} -> ${gliding.t}`);
        check('scroll, normal zoom: the glide slows and stops by itself', still.t === settled.t && settled.t > gliding.t, `${gliding.t} -> ${settled.t} -> ${still.t}`);
        /* A click stops a glide at once. */
        await page.mouse.move(blank.x, blank.y); await page.mouse.down();
        await page.mouse.move(blank.x, blank.y - 240, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(80);
        await page.mouse.click(blank.x, blank.y); const clicked = await state(page);
        await page.waitForTimeout(400); const afterClick = await state(page);
        check('scroll, normal zoom: a click stops the glide', afterClick.t === clicked.t, `${clicked.t} -> ${afterClick.t}`);
        /* A plain click on blank paper still behaves as a click: it clears a selection. */
        const sp = await page.evaluate(() => { const s = [...document.querySelectorAll('#pdfFrame .text-layer span')].find(x => x.textContent.trim().length > 10 && x.getBoundingClientRect().top > 150 && x.getBoundingClientRect().bottom < 650); const r = s.getBoundingClientRect(); return { x: r.left + 2, y: (r.top + r.bottom) / 2, x2: r.right - 2 }; });
        await page.mouse.move(sp.x, sp.y); await page.mouse.down(); await page.mouse.move(sp.x2, sp.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(400);
        const picked = (await state(page)).selected;
        const { blank: spot } = await points(page);
        await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(300);
        const cleared = await state(page);
        check('scroll, normal zoom: words still select by dragging, and a click on blank paper clears it', picked > 0 && cleared.selected === 0 && cleared.t === (await state(page)).t, `${picked} -> ${cleared.selected}`);
      }
      await context.close();
    }
    for (const layout of ['page', 'book', 'scroll']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      await page.addInitScript(l => localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: l, guideOrientation: 'row', focus: false })), layout);
      await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      await page.setInputFiles('#pdfFile', PDF);
      await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
      await page.waitForTimeout(1200);
      const fit = await state(page);
      if (layout !== 'scroll') check(`${layout}: at Fit the paper is not marked zoomed`, !fit.zoomed, JSON.stringify(fit));
      for (let i = 0; i < 4; i++) { await page.evaluate(() => document.getElementById('zoomIn').click()); await page.waitForTimeout(450); }
      await page.waitForTimeout(1200);
      await page.evaluate(() => { const p = document.getElementById('documentPane'); p.scrollLeft = (p.scrollWidth - p.clientWidth) / 2; p.scrollTop = (p.scrollHeight - p.clientHeight) / 2; });
      await page.waitForTimeout(300);
      const zoomed = await state(page);
      check(`${layout}: zoomed in, the paper is marked zoomed`, zoomed.zoomed, JSON.stringify(zoomed));
      if (zoomed.scrollbar !== undefined) check(`${layout}: zoomed in Zen, thin scrollbars show`, zoomed.scrollbar === 'thin', zoomed.scrollbar);
      const { blank } = await points(page);
      check(`${layout}: found blank paper to press`, !!blank, JSON.stringify(blank));
      if (blank) {
        await drag(page, blank, -160, -120);
        const moved = await state(page);
        /* The paper follows the hand as far as it can go in each direction. */
        const wantL = Math.min(zoomed.l + 150, zoomed.maxL - 1), wantT = Math.min(zoomed.t + 110, zoomed.maxT - 1);
        check(`${layout}: dragging blank paper moves it`, moved.l >= wantL && moved.t >= wantT && (zoomed.maxL > 5 || zoomed.maxT > 5), `${zoomed.l},${zoomed.t} -> ${moved.l},${moved.t} (max ${zoomed.maxL},${zoomed.maxT})`);
        check(`${layout}: and does not select text${layout === 'scroll' ? '' : ' or turn the page'}`, moved.selected === 0 && (layout === 'scroll' || moved.label === zoomed.label), JSON.stringify(moved));
      }
      /* Bring a line of words to the middle of the view, then press its first word (a few
         candidates, since a centred word can still sit under a page edge or a mark). */
      let word = null;
      for (let k = 0; k < 6 && !word; k++) {
        await page.evaluate(k => { const list = [...document.querySelectorAll('#pdfFrame .pdf-page.book-active .text-layer span, #pdfFrame .pdf-page .text-layer span')].filter(x => !x.children.length && x.textContent.trim().length > 12); const s = list[k * 3]; if (s) s.scrollIntoView({ block: 'center', inline: 'center' }); }, k);
        await page.waitForTimeout(400);
        word = (await points(page)).word;
      }
      check(`${layout}: found a word to press`, !!word);
      if (word) {
        const before = await state(page);
        await drag(page, word, 140, 0);
        const after = await state(page);
        /* A grab would carry the paper the whole 140 px; the browser's own selection autoscroll may nudge it a little. */
        check(`${layout}: dragging across words still selects them instead of grabbing the paper`, after.selected > 0 && Math.abs(after.l - before.l) < 40 && Math.abs(after.t - before.t) < 40, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
        await page.evaluate(() => getSelection().removeAllRanges());
      }
      if (zoomed.maxL > 5) {
        await page.evaluate(() => { const p = document.getElementById('documentPane'); p.scrollLeft = 0; document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
        await page.waitForTimeout(150);
        const atLeft = await state(page);
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
        const stepped = await state(page);
        check(`${layout}: → moves a wide zoomed paper sideways instead of turning`, stepped.l >= Math.min(atLeft.l + 40, atLeft.maxL - 1) && stepped.label === atLeft.label, `${atLeft.l} -> ${stepped.l}, ${atLeft.label} -> ${stepped.label}`);
        await page.evaluate(() => { const p = document.getElementById('documentPane'); p.scrollLeft = p.scrollWidth; });
        await page.waitForTimeout(150);
        const edge = await state(page);
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1800);
        const turned = await state(page);
        check(`${layout}: at the right edge → turns the page`, turned.label !== edge.label, `${edge.label} -> ${turned.label}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ENGINE}: ${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
