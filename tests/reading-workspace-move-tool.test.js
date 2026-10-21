/* Workspace Move tool. On a laptop (mouse or trackpad, no touch screen) the Workspace starts with
   Move: dragging blank paper moves it 1:1 and a flick glides on; Pen draws with the mouse once
   picked, and a stylus still writes while Move is on. iPad (app or Safari) and phones have no
   Move button and keep the Pen, since fingers already move the paper there. Houfu: "same issue
   for workplace scroll"; "on ipad app or browser, idont think we need a move button".
   PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PDF = path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
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
  const s = document.getElementById('workspaceScroll'), move = document.querySelector('[data-workspace-tool="move"]');
  return { t: Math.round(s.scrollTop), move: !!move && !move.hidden && move.getBoundingClientRect().width > 0,
    tool: [...document.querySelectorAll('[data-workspace-tool]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.workspaceTool).join(','),
    strokes: document.querySelectorAll('#workspaceBoard path, #workspaceBoard polyline').length, rect: s.getBoundingClientRect().toJSON() };
});
async function openWorkspace(browser, port, options) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, serviceWorkers: 'block', ...options.context });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  if (options.touchPoints) await page.addInitScript(n => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => n }), options.touchPoints);
  await page.addInitScript(() => localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false })));
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById(document.body.classList.contains('phone-ui') ? 'zenPhoneWorkspace' : 'zenWorkspace').click());
  await page.locator('#workspacePanel').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  return { context, page };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    {
      const { context, page } = await openWorkspace(browser, port, { context: {} });
      const a = await state(page);
      check('laptop: the Workspace shows Move and starts with it', a.move && a.tool === 'move', JSON.stringify({ move: a.move, tool: a.tool }));
      const x = a.rect.x + a.rect.width / 2, y = a.rect.y + a.rect.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 10; i++) { await page.mouse.move(x, y - 20 * i); await page.waitForTimeout(25); }
      await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(300);
      const b = await state(page);
      check('laptop: dragging blank paper up 200 px moves it 200 px and draws nothing', Math.abs(b.t - a.t - 200) <= 3 && b.strokes === a.strokes, `${a.t} -> ${b.t}, strokes ${a.strokes} -> ${b.strokes}`);
      await page.mouse.move(x, y + 100); await page.mouse.down(); await page.mouse.move(x, y - 140, { steps: 8 }); await page.mouse.up();
      const c = await state(page); await page.waitForTimeout(400); const d = await state(page);
      check('laptop: a flick keeps the paper gliding', d.t > c.t + 40, `${c.t} -> ${d.t}`);
      await page.waitForTimeout(2600);
      /* A stylus on a laptop still writes while Move is on. */
      const before = (await state(page)).strokes;
      await page.evaluate(() => {
        const board = document.getElementById('workspaceBoard'), r = board.getBoundingClientRect(), s = document.getElementById('workspaceScroll').getBoundingClientRect();
        const at = i => ({ x: r.left + 120 + i * 12, y: s.top + s.height / 2 + i * 3 });
        const fire = (type, p) => board.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: .5, clientX: p.x, clientY: p.y }));
        board.setPointerCapture = () => {};
        fire('pointerdown', at(0)); for (let i = 1; i <= 8; i++) fire('pointermove', at(i)); fire('pointerup', at(8));
      });
      await page.waitForTimeout(400);
      check('laptop: a stylus still writes while Move is on', (await state(page)).strokes > before);
      await page.click('[data-workspace-tool="pen"]'); await page.waitForTimeout(250);
      const e = await state(page);
      await page.mouse.move(x - 100, y); await page.mouse.down(); await page.mouse.move(x + 20, y + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(400);
      const f = await state(page);
      check('laptop: with Pen picked the mouse draws and the paper stays put', e.tool === 'pen' && f.strokes > e.strokes && f.t === e.t, JSON.stringify({ tool: e.tool, strokes: [e.strokes, f.strokes], t: [e.t, f.t] }));
      await context.close();
    }
    for (const [name, options] of [['iPad', { context: { userAgent: IPAD, hasTouch: true }, touchPoints: 5 }], ['iPhone', { context: { userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE !== 'webkit' || undefined } }]]) {
      if (options.context.isMobile === undefined) delete options.context.isMobile;
      const { context, page } = await openWorkspace(browser, port, options);
      const s = await state(page);
      check(`${name}: no Move button, the Pen stays the tool`, !s.move && s.tool === 'pen' && !(await page.evaluate(() => !!document.querySelector('[data-workspace-tool="move"]'))), JSON.stringify({ move: s.move, tool: s.tool }));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ENGINE}: ${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
