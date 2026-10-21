/* Night light: a lamp pool over the paper in a dark room. Checks that it turns on from Reading
   settings and from the focus-mode menu, lays its light over exactly the paper pane in every
   layout (and again after a resize), never takes a touch, stays readable at the far corners,
   follows Reach, survives a reload, switches the interface dark while on and back when off
   (unless the reader picked a theme meanwhile), and moves inverted paper to cream.
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

/* The lamp layer's alpha at a few points of the pane (0 = fully lit, 1 = black), its box against
   the pane's, and what a tap at the pane's centre would hit. */
const readLamp = () => {
  const night = document.getElementById('paneNight'), pane = document.getElementById('documentPane');
  const canvas = night.querySelector('canvas'), nr = night.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  let alpha = null;
  if (canvas && canvas.width) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const at = (fx, fy) => data[(Math.min(canvas.height - 1, Math.floor(fy * canvas.height)) * canvas.width + Math.min(canvas.width - 1, Math.floor(fx * canvas.width))) * 4 + 3] / 255;
    alpha = { topCentre: at(.5, .08), middle: at(.5, .45), bottomLeft: at(.01, .99), bottomRight: at(.99, .99), max: (() => { let m = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > m) m = data[i]; return m / 255; })() };
  }
  const hit = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
  return { on: document.body.classList.contains('night-light'), visible: getComputedStyle(night).display !== 'none', alpha,
    boxGap: Math.max(Math.abs(nr.left - pr.left), Math.abs(nr.top - pr.top), Math.abs(nr.width - pr.width), Math.abs(nr.height - pr.height)),
    hitsLamp: !!(hit && hit.closest('#paneNight')), theme: document.documentElement.dataset.theme || 'light',
    paper: document.body.dataset.paperAppearance, pressed: document.getElementById('nightLightBtn').getAttribute('aria-pressed'),
    saved: JSON.parse(localStorage.getItem('readingRoom.comfort.v1') || '{}') };
};

async function openReader(browser, port, comfort, extra) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.addInitScript(([c, x]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('readingRoom.comfort.v1', JSON.stringify(c));
    localStorage.setItem('readingRoom.theme', 'light');
    if (x && x.paper) localStorage.setItem('readingRoom.paperAppearance.v1', x.paper);
  }, [comfort, extra || null]);
  await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
  await page.waitForTimeout(700);
  return { context, page };
}
const settled = page => page.waitForTimeout(450);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    /* 1. Settings button, light interface, scroll layout. */
    {
      const { context, page } = await openReader(browser, port, { pdfLayout: 'scroll', focus: false }, { paper: 'inverted' });
      const before = await page.evaluate(readLamp);
      check('off by default: no lamp layer', !before.on && !before.visible, JSON.stringify({ on: before.on, visible: before.visible }));
      await page.evaluate(() => document.getElementById('nightLightBtn').click());
      await settled(page);
      const on = await page.evaluate(readLamp);
      check('Reading settings turns it on', on.on && on.visible && on.pressed === 'true', JSON.stringify({ on: on.on, pressed: on.pressed }));
      check('the light covers exactly the paper pane', on.boxGap < 1.5, on.boxGap.toFixed(2));
      check('the lamp never takes a touch', !on.hitsLamp);
      check('the lamp is painted', !!on.alpha, JSON.stringify(on.alpha));
      if (on.alpha) {
        check('under the lamp the paper stays bright', on.alpha.topCentre < .1, on.alpha.topCentre.toFixed(3));
        check('the light falls off toward the corners', on.alpha.bottomLeft > on.alpha.middle + .15 && on.alpha.bottomRight > on.alpha.middle + .15, JSON.stringify(on.alpha));
        check('even the far corners stay readable at the default reach', on.alpha.max < .62, on.alpha.max.toFixed(3));
      }
      check('the interface goes dark while the lamp is on', on.theme === 'dark', on.theme);
      check('inverted paper moves to cream under the lamp', on.paper === 'cream', on.paper);
      await page.waitForTimeout(700);
      check('the choice is saved', (await page.evaluate(readLamp)).saved.nightLight === true);
      /* Reach: more reach, softer fall-off. */
      await page.evaluate(() => { const r = document.getElementById('nightReachRange'); r.value = '90'; r.dispatchEvent(new Event('input', { bubbles: true })); });
      await settled(page);
      const wide = await page.evaluate(readLamp);
      check('more reach lights the corners more', wide.alpha && wide.alpha.bottomLeft < on.alpha.bottomLeft - .1, `${on.alpha && on.alpha.bottomLeft.toFixed(3)} -> ${wide.alpha && wide.alpha.bottomLeft.toFixed(3)}`);
      await page.evaluate(() => { const r = document.getElementById('nightReachRange'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); });
      await settled(page);
      const narrow = await page.evaluate(readLamp);
      check('no reach is a narrow, dramatic lamp', narrow.alpha && narrow.alpha.bottomLeft > on.alpha.bottomLeft + .1 && narrow.alpha.topCentre < .12, JSON.stringify(narrow.alpha));
      /* A resize relays the light over the new pane. */
      await page.setViewportSize({ width: 1024, height: 760 });
      await page.waitForTimeout(700);
      const resized = await page.evaluate(readLamp);
      check('after a resize the light still covers the pane', resized.boxGap < 1.5, resized.boxGap.toFixed(2));
      /* Reload keeps it, with the dark interface. */
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      const reloaded = await page.evaluate(() => ({ on: document.body.classList.contains('night-light'), theme: document.documentElement.dataset.theme || 'light' }));
      check('a reload keeps the lamp and its dark interface', reloaded.on && reloaded.theme === 'dark', JSON.stringify(reloaded));
      await page.setInputFiles('#pdfFile', PDF);
      await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
      await page.evaluate(() => document.getElementById('nightLightBtn').click());
      await settled(page);
      const off = await page.evaluate(readLamp);
      check('turning it off removes the lamp', !off.on && !off.visible && off.pressed === 'false', JSON.stringify({ on: off.on, visible: off.visible }));
      check('and brings the light interface back', off.theme === 'light', off.theme);
      await context.close();
    }
    /* 2. A theme picked by hand while the lamp is on stays when it goes off. */
    {
      const { context, page } = await openReader(browser, port, { pdfLayout: 'scroll', focus: false });
      await page.evaluate(() => document.getElementById('nightLightBtn').click());
      await settled(page);
      await page.evaluate(() => document.getElementById('themeBtn').click());   // dark -> light, by hand
      await page.evaluate(() => document.getElementById('themeBtn').click());   // light -> dark, by hand
      await page.evaluate(() => document.getElementById('nightLightBtn').click());
      await settled(page);
      const kept = await page.evaluate(readLamp);
      check('a theme chosen by hand during Night light is kept', !kept.on && kept.theme === 'dark', kept.theme);
      await context.close();
    }
    /* 2a. In the library the lamp switch is hidden: there it would only repeat the theme. */
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      const library = await page.evaluate(() => ({ reading: document.body.classList.contains('reading'), lamp: getComputedStyle(document.getElementById('nightLightTopBtn')).display, theme: getComputedStyle(document.getElementById('themeBtn')).display }));
      check('in the library the lamp switch is hidden and the theme switch stays', !library.reading && library.lamp === 'none' && library.theme !== 'none', JSON.stringify(library));
      await page.setInputFiles('#pdfFile', PDF);
      await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page canvas')?.width);
      await page.evaluate(() => { if (document.body.classList.contains('zen')) document.getElementById('zenExit') && 0; });
      const reader = await page.evaluate(() => ({ reading: document.body.classList.contains('reading'), lamp: getComputedStyle(document.getElementById('nightLightTopBtn')).display }));
      check('with a paper open the lamp switch is offered', reader.reading && reader.lamp !== 'none', JSON.stringify(reader));
      await context.close();
    }
    /* 2b. One tap from outside the menus: the Zen dock and the top bar. */
    {
      const { context, page } = await openReader(browser, port, { pdfLayout: 'scroll', focus: false });
      const shown = await page.evaluate(() => { const v = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; };
        return { dock: v('zenNightDock'), menu: getComputedStyle(document.getElementById('zenNightLight')).display, zen: document.body.classList.contains('zen') }; });
      check('in Zen the dock shows a Night light button', shown.zen && shown.dock, JSON.stringify(shown));
      check('and the More menu no longer carries it (phones keep it there)', shown.menu === 'none', shown.menu);
      await page.click('#zenNightDock');
      await settled(page);
      const fromDock = await page.evaluate(readLamp);
      check('the dock button turns it on in one tap', fromDock.on && fromDock.visible, JSON.stringify({ on: fromDock.on }));
      check('and shows it is on', await page.evaluate(() => document.getElementById('zenNightDock').getAttribute('aria-pressed')) === 'true');
      await page.evaluate(() => document.getElementById('nightLightTopBtn').click());
      await settled(page);
      check('the top-bar button turns it off', !(await page.evaluate(readLamp)).on);
      await context.close();
    }
    /* 3. Page and Book layouts, from the focus-mode menu. */
    for (const layout of ['page', 'book']) {
      const { context, page } = await openReader(browser, port, { pdfLayout: layout, focus: false });
      await page.waitForFunction(() => !!document.querySelector('#pdfFrame .pdf-page.book-active canvas')?.width);
      const viaMenu = await page.evaluate(() => { const b = document.getElementById('zenNightLight'); if (!b) return 'missing'; b.click(); return 'clicked'; });
      await settled(page);
      const lamp = await page.evaluate(readLamp);
      check(`${layout} layout: the focus-mode menu turns it on`, viaMenu === 'clicked' && lamp.on, viaMenu);
      check(`${layout} layout: the light covers the pane`, lamp.boxGap < 1.5 && !!lamp.alpha, lamp.boxGap.toFixed(2));
      check(`${layout} layout: the zen menu button shows it is on`, await page.evaluate(() => document.getElementById('zenNightLight').getAttribute('aria-pressed')) === 'true');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => !document.getElementById('pdfFrame').dataset.curlState, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
      const turned = await page.evaluate(readLamp);
      check(`${layout} layout: the light stays put through a page turn`, turned.on && turned.boxGap < 1.5);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ENGINE}: ${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
