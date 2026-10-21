/* iPad and iPhone: WebKit's selection handles snap the moving end to the page's first (or last)
   character whenever they sit over blank paper, and the end handle's knob hangs below the line, so
   a drag could end with the selection running from the page header to the passage. Highlight then
   saved one highlight over the whole page. Reproduced in the iOS Simulator (2026-10-21); here the
   snaps WebKit makes are replayed with setBaseAndExtent under an iPad user agent, so Phloem's
   Apple-touch path (no desktop selection guard) is the one under test.
   PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PDF = path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
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

async function openGuide(browser, port) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1100 }, userAgent: IPAD, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', guideOrientation: 'row', focus: false })));
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => document.querySelectorAll('#pdfFrame .pdf-page[data-page="1"] .text-layer span').length > 5);
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const layer = document.querySelector('#pdfFrame .pdf-page[data-page="1"] .text-layer');
    const texts = []; const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) if (node.textContent.trim()) texts.push(node);
    const find = word => texts.find(t => t.textContent.includes(word));
    const box = node => node.parentElement.getBoundingClientRect();
    /* Names for the places the scenarios use: the page's first word, the subtitle's "first",
       the kicker above the title, and blank paper well away from any text. */
    window.__snap = {
      layer, head: texts[0], sub: find('local-first'), kicker: find('YOUR FIRST PAPER'),
      firstAt: find('local-first').textContent.indexOf('first'),
      point(node, dy) { const r = box(node); return { x: r.left + 12, y: (dy === 'below' ? r.bottom + 14 : (r.top + r.bottom) / 2) }; },
      blank() { const r = layer.getBoundingClientRect(); return { x: r.left + r.width * .62, y: box(find('local-first')).bottom + 120 }; },
      fire(type, point, pointerType) {
        const target = document.elementFromPoint(point.x, point.y) || layer;
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: pointerType || 'touch', pointerId: 31, isPrimary: true,
          button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y }));
        return target;
      },
      select(a, ao, f, fo) { getSelection().setBaseAndExtent(a, ao, f, fo); },
      selected() { return getSelection().toString().replace(/\s+/g, ' ').trim(); },
      saved() {
        const st = JSON.parse(localStorage.getItem('readingRoom.v1') || '{}'), ch = (st.chapters || []).find(c => c.id && c.kind === 'pdf') || {}, out = [];
        Object.entries(ch.highlights || {}).forEach(([p, list]) => list.forEach(h => {
          const ys = (h.rects || []).map(r => [r.y, r.y + r.h]).flat(); out.push({ page: p, text: h.text, span: ys.length ? Math.max(...ys) - Math.min(...ys) : 0 });
        }));
        return out;
      }
    };
  });
  return { context, page };
}
const wait = (page, ms) => page.waitForTimeout(ms);
/* A long-press on the subtitle's "first": the press, WebKit's word selection, the lift. */
async function longPressFirst(page) {
  await page.evaluate(() => { const s = window.__snap, p = s.point(s.sub); s.fire('pointerdown', p); s.select(s.sub, s.firstAt, s.sub, s.firstAt + 5); s.fire('pointerup', p); });
  await wait(page, 120);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    /* 1. The end handle is picked up (a pointerdown on the blank paper under the line, then no
          pointerup), WebKit snaps the moving end to the page's first character, and the next tap
          (the one that opens Highlight) captures the selection. */
    {
      const { context, page } = await openGuide(browser, port);
      await longPressFirst(page);
      check('a long-press selects the word', await page.evaluate(() => window.__snap.selected()) === 'first');
      const shown = await page.evaluate(() => { const s = window.__snap; s.fire('pointerdown', s.point(s.sub, 'below')); s.select(s.head, 0, s.sub, s.firstAt); return s.selected(); });
      await wait(page, 60);
      check('while the handle may still be held, the snapped selection is left as WebKit made it', shown.startsWith('Phloem') && (await page.evaluate(() => window.__snap.selected())).startsWith('Phloem'), shown.slice(0, 30));
      await page.evaluate(() => { const s = window.__snap; s.fire('pointerup', s.blank()); });
      await wait(page, 120);
      await page.evaluate(() => document.getElementById('highlightBtn').click());
      await wait(page, 400);
      const saved = await page.evaluate(() => window.__snap.saved());
      check('Highlight saves the passage the handle last touched, not the page from its header', saved.length === 1 && saved[0].text === 'first', JSON.stringify(saved));
      check('that highlight is one line tall', saved.length === 1 && saved[0].span < .04, saved[0] && saved[0].span.toFixed(3));
      await context.close();
    }
    /* 2. Left alone, a snap settles back to the last selection that was not one. */
    {
      const { context, page } = await openGuide(browser, port);
      await longPressFirst(page);
      await page.evaluate(() => { const s = window.__snap; s.fire('pointerdown', s.point(s.sub, 'below')); s.select(s.head, 0, s.sub, s.firstAt); });
      await wait(page, 1300);
      check('a snap that has settled is put back on the passage', await page.evaluate(() => window.__snap.selected()) === 'first', await page.evaluate(() => window.__snap.selected().slice(0, 30)));
      /* The same snap towards the page's last character. */
      await page.evaluate(() => { const s = window.__snap, texts = []; const w = document.createTreeWalker(s.layer, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim()) texts.push(n); const last = texts[texts.length - 1]; s.select(s.sub, s.firstAt, last, last.length); });
      await wait(page, 1300);
      check('a snap to the page\'s last character is put back too', await page.evaluate(() => window.__snap.selected()) === 'first', await page.evaluate(() => window.__snap.selected().slice(-30)));
      await context.close();
    }
    /* 3. Moving through the text onto the header, line by line, is a real selection. */
    {
      const { context, page } = await openGuide(browser, port);
      await page.evaluate(() => { const s = window.__snap, p = s.point(s.kicker); s.fire('pointerdown', p); s.select(s.kicker, 0, s.kicker, 4); s.fire('pointerup', p); });
      await wait(page, 120);
      await page.evaluate(() => { const s = window.__snap; s.fire('pointerdown', s.point(s.kicker, 'below')); s.select(s.kicker, 4, s.head, 0); });
      await wait(page, 1300);
      const kept = await page.evaluate(() => window.__snap.selected());
      check('dragging from the line under the header onto it is kept', kept.startsWith('Phloem') && kept.endsWith('YOUR'), kept);
      await context.close();
    }
    /* 4. A long-press on blank paper: WebKit selects the page's first word, far from the finger. */
    {
      const { context, page } = await openGuide(browser, port);
      await page.evaluate(() => { const s = window.__snap, p = s.blank(); s.fire('pointerdown', p); s.select(s.head, 0, s.head, s.head.length); });
      await wait(page, 60);
      await page.evaluate(() => { const s = window.__snap; s.fire('pointerup', s.blank()); });
      await wait(page, 200);
      check('a long-press on blank paper leaves nothing selected', await page.evaluate(() => window.__snap.selected()) === '');
      const ready = await page.evaluate(() => document.getElementById('highlightBtn').classList.contains('ready'));
      check('and nothing waits to be highlighted', !ready);
      await context.close();
    }
    /* 4b. The same long-press while another passage is still selected. */
    {
      const { context, page } = await openGuide(browser, port);
      await longPressFirst(page);
      await page.evaluate(() => { const s = window.__snap, p = s.blank(); s.fire('pointerdown', p); s.select(s.head, 0, s.head, s.head.length); });
      await wait(page, 60);
      await page.evaluate(() => { const s = window.__snap; s.fire('pointerup', s.blank()); });
      await wait(page, 200);
      check('with a passage already selected, a long-press on blank paper still selects nothing', await page.evaluate(() => window.__snap.selected()) === '', await page.evaluate(() => window.__snap.selected()));
      await context.close();
    }
    /* 5. A Pencil swipe that touches down just above the line still highlights it. */
    {
      const { context, page } = await openGuide(browser, port);
      const points = await page.evaluate(() => {
        const s = window.__snap, r = document.createRange(), at = s.sub.textContent.indexOf('calm');
        r.setStart(s.sub, at); r.setEnd(s.sub, at + 4); const a = r.getBoundingClientRect();
        r.setStart(s.sub, s.firstAt); r.setEnd(s.sub, s.firstAt + 5); const b = r.getBoundingClientRect();
        return { from: { x: a.left + 3, y: a.top - 15 }, to: { x: b.right - 3, y: (b.top + b.bottom) / 2 } };
      });
      await page.evaluate(({ from, to }) => {
        const s = window.__snap; s.fire('pointerdown', from, 'pen');
        for (let i = 1; i <= 8; i++) s.fire('pointermove', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }, 'pen');
        s.fire('pointerup', to, 'pen');
      }, points);
      await wait(page, 500);
      const saved = await page.evaluate(() => window.__snap.saved());
      check('a Pencil swipe from 15 px above the words highlights them', saved.length === 1 && /calm/.test(saved[0].text) && /first/.test(saved[0].text), JSON.stringify(saved));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ENGINE}: ${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
