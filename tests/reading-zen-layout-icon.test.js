let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

/* Zen's page-layout control: a rail circle whose icon shows the current layout, fading
   with the other circles, plus a hint naming it on the first Zen visit only. The
   fixture PDF is written by hand, so this needs no pdf-lib. */
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_ZEN_LAYOUT_TEST_PORT || 8149);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

function fixturePdf() {
  const stream = 'BT /F1 14 Tf 60 720 Td (A quiet page for reading in Zen.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => { const at = pdf.length; pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n'; return at; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}
const layoutState = page => page.evaluate(() => {
  const button = document.getElementById('zenLayout'), box = button.getBoundingClientRect(), style = getComputedStyle(button);
  const icon = document.querySelector('#zenLayoutIcon svg'), option = document.querySelector('[data-zen-pdf-layout][aria-pressed="true"]');
  return { width: Math.round(box.width), height: Math.round(box.height), radius: style.borderTopLeftRadius,
    labelShown: getComputedStyle(document.getElementById('zenLayoutLabel')).display !== 'none',
    iconMatches: !!icon && !!option && icon.outerHTML === option.querySelector('svg').outerHTML,
    aria: button.getAttribute('aria-label'), opacity: +style.opacity, guide: +getComputedStyle(document.getElementById('zenGuide')).opacity,
    tip: !document.getElementById('zenLayoutTip').classList.contains('hidden') };
});

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { if (!localStorage.getItem('readingRoom.v1')) localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [] })); });
  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.locator('#pdfFile').setInputFiles({ name: 'zen-layout.pdf', mimeType: 'application/pdf', buffer: fixturePdf() });
  await page.waitForFunction(() => document.body.classList.contains('zen') && document.querySelector('.pdf-page canvas')?.width > 0, null, { timeout: 60000 });
  // The hint waits for Zen to settle before it appears.
  await page.waitForFunction(() => !document.getElementById('zenLayoutTip').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});

  let state = await layoutState(page);
  check('the layout control is a 44px circle like the rest of the rail', state.width === 44 && state.height === 44 && state.radius === '50%', JSON.stringify(state));
  check('no visible "Scroll" label or chevron', !state.labelShown);
  check('its icon is the current layout\'s icon', state.iconMatches);
  check('VoiceOver still hears the current layout', /Page layout: Scroll/.test(state.aria), state.aria);
  check('the first Zen visit names the control once', state.tip);

  await page.mouse.click(600, 400);
  await page.waitForTimeout(200);
  check('the hint leaves on the next tap', !(await layoutState(page)).tip);

  await page.locator('#zenLayout').tap();
  await page.locator('[data-zen-pdf-layout="page"]').tap();
  await page.waitForFunction(() => /Page layout: Page/.test(document.getElementById('zenLayout').getAttribute('aria-label')));
  state = await layoutState(page);
  check('choosing Page shows the Page icon', state.iconMatches, state.aria);

  await page.waitForFunction(() => document.body.classList.contains('zen-idle'), null, { timeout: 10000 });
  await page.waitForTimeout(400);
  state = await layoutState(page);
  check('at rest it fades exactly like the other circles', state.opacity === state.guide && state.opacity < 0.2, JSON.stringify({ layout: state.opacity, guide: state.guide }));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('zen') && document.querySelector('.pdf-page canvas')?.width > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  check('the hint does not return on later visits', !(await layoutState(page)).tip);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All Zen layout control checks passed');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
