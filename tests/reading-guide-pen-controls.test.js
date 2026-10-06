/* Guide and pen controls stay out of the way. Turning the guide off from its Zen controls
   folds them away. Guide dimness runs 70-100% with 85% as the default and the middle; a
   saved value below 70 moves once to 85, values in range are kept. In the Workspace,
   switching to the pen from another tool only picks it; tapping the pen again opens its
   colors. Chromium; not a substitute for a physical iPad check. */
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
  page.drawText('Paper highlight stays independent of workspace taps.', { x: 52, y: 710, size: 13, font });
  return Buffer.from(await doc.save());
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
  .find(item => item.id === localStorage.getItem('readingRoom.lastOpen.v1')));
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    if (ENGINE !== 'chromium') { console.log('SKIP needs Chromium'); return; }

    const port = server.address().port;
    async function open(saved) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      page.on('pageerror', e => errors.push(e.message));
      if (saved) await page.addInitScript(value => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('readingRoom.comfort.v1', JSON.stringify(value)); sessionStorage.setItem('seeded', '1'); } }, saved);
      await page.goto('http://127.0.0.1:' + port + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      return { context, page };
    }
    const errors = [];
    const dim = page => page.evaluate(() => ({ range: document.getElementById('zenGuideDimRange').value, min: document.getElementById('zenGuideDimRange').min,
      max: document.getElementById('zenGuideDimRange').max, desk: document.getElementById('guideDimRange').value, label: document.getElementById('zenGuideDimValue').textContent }));

    // 1. Fresh reader: 85% default, 70-100 range, 85 in the middle.
    let { context, page } = await open(null);
    await page.locator('#pdfFile').setInputFiles({ name: 'guide-pen.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    let d = await dim(page);
    assert.deepEqual(d, { range: '85', min: '70', max: '100', desk: '85', label: '85%' }, 'fresh dimness is 85% on a 70-100 slider');
    assert.equal((+d.min + +d.max) / 2, 85, '85% sits in the middle of the slider');

    // 2. Turning the guide on keeps its controls; turning it off folds them away.
    await page.click('#zenGuide');
    await page.locator('#zenGuideMenu').waitFor({ state: 'visible' });
    await page.click('#zenGuideToggle');
    assert.equal(await page.locator('#focusBtn').getAttribute('aria-pressed'), 'true');
    assert(await page.locator('#zenGuideMenu').isVisible(), 'turning the guide on keeps its controls open for dimness');
    await page.locator('#zenGuideDimRange').evaluate(input => { input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#paneSpotlight').evaluate(el => el.style.getPropertyValue('--guide-dim-opacity')), '1.00', 'dimness reaches 100%');
    await page.click('#zenGuideToggle');
    assert.equal(await page.locator('#focusBtn').getAttribute('aria-pressed'), 'false');
    await page.locator('#zenGuideMenu').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zenGuide').getAttribute('aria-expanded'), 'false', 'the guide button reports its controls closed');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'zenGuide', 'focus returns to the guide button');

    // 3. Workspace pen: from another tool, a tap only picks the pen; a second tap opens colors.
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    const pen = page.locator('#workspacePenToggle'), options = page.locator('#workspacePenOptions');
    assert.equal(await pen.getAttribute('aria-pressed'), 'true', 'the pen starts as the Workspace tool');
    await page.locator('[data-workspace-tool="select"]').click();
    assert.equal(await pen.getAttribute('aria-pressed'), 'false');
    await pen.click();
    assert.equal(await pen.getAttribute('aria-pressed'), 'true', 'tapping the pen from the lasso picks the pen');
    assert.equal(await options.isVisible(), false, 'switching to the pen does not open its colors');
    assert.equal(await pen.getAttribute('aria-expanded'), 'false');
    await pen.click();
    assert(await options.isVisible(), 'tapping the pen again opens its colors');
    assert.equal(await pen.getAttribute('aria-expanded'), 'true');
    await pen.click();
    assert.equal(await options.isVisible(), false, 'a third tap closes the colors');
    await pen.click();
    assert(await options.isVisible());
    await page.locator('[data-workspace-tool="eraser"]').click();
    assert.equal(await options.isVisible(), false, 'choosing another tool closes the colors');
    await pen.click();
    assert.equal(await options.isVisible(), false, 'coming back from the eraser picks the pen without the colors');
    await context.close();

    // 4. A saved dimness below the new range moves once to 85%; in-range values stay.
    const openPaper = async page => {
      await page.locator('#pdfFile').setInputFiles({ name: 'guide-dim.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
      await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    };
    for (const [saved, expected] of [[55, '85'], [20, '85'], [75, '75'], [100, '100']]) {
      ({ context, page } = await open({ guideDim: saved, focus: false }));
      await openPaper(page);
      assert.equal((await dim(page)).range, expected, `saved ${saved}% opens as ${expected}%`);
      // The move is one-time: after it, a chosen 70% stays 70% across a reload.
      await page.locator('#zenGuideDimRange').evaluate(input => { input.value = '70'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).guideDim === 70);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
      await page.waitForTimeout(300);
      assert.equal((await dim(page)).range, '70', 'a chosen 70% survives reload');
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS guide controls fold on off, dimness 70-100 from 85, pen picks before opening colors');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
