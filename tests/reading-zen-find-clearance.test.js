/* Real Find geometry beside the Zen rail, including rotation and Workspace. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function pdfFixture() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Find this passage. Find this passage again.', { x: 52, y: 710, size: 13, font });
  return Buffer.from(await doc.save());
}
async function bounds(page) {
  return page.evaluate(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    return { viewport: { width: innerWidth, height: innerHeight }, bar: rect(document.getElementById('findBar')),
      dock: rect(document.getElementById('zenDock')), pane: rect(document.getElementById('documentPane')),
      input: rect(document.getElementById('findInput')),
      buttons: ['findPrev', 'findNext'].map(id => ({ id, ...rect(document.getElementById(id)) })),
      rail: [...document.querySelectorAll('#zenDock > button, #zenDock > .zen-tool > button')].filter(visible).map(node => ({ id: node.id, ...rect(node) })),
      focused: document.activeElement?.id };
  });
}
function clearOf(a, b) { return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom; }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const launch = { headless: true };
    if (ENGINE === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    if (ENGINE === 'webkit' && process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH) launch.executablePath = process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', focus: false })));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html');
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'zen-find.pdf', mimeType: 'application/pdf', buffer: await pdfFixture() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenMore').click();
    await page.locator('#zenFind').click();
    await page.locator('#findInput').fill('Find');
    await page.waitForFunction(() => /\d+\s*\/\s*\d+/.test(document.getElementById('findCount').textContent));
    const cases = [
      { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
      { width: 844, height: 390 }, { width: 844, height: 300 }, { width: 320, height: 480 },
      { width: 390, height: 390 }, { width: 320, height: 300 },
      { width: 1280, height: 900, workspace: true }, { width: 1024, height: 768, workspace: true },
      { width: 900, height: 390, workspace: true }, { width: 900, height: 300, workspace: true },
      { width: 1280, height: 900, workspace: true, splitKey: 'ArrowLeft' },
      { width: 1280, height: 900, workspace: true, splitKey: 'ArrowRight' }
    ];
    for (const size of cases) {
      await page.setViewportSize({ width: size.width, height: size.height });
      if (size.workspace && !await page.locator('body').evaluate(node => node.classList.contains('workspace-open'))) await page.locator('#zenWorkspace').click();
      if (size.splitKey) {
        await page.locator('#workspaceDivider').press('Home');
        for (let step = 0; step < 5; step++) await page.locator('#workspaceDivider').press(size.splitKey);
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await bounds(page), name = `${size.workspace ? 'workspace' : 'full'}-${size.width}x${size.height}${size.splitKey ? '-' + size.splitKey : ''}`;
      if (process.env.PHLOEM_ZEN_FIND_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_ZEN_FIND_SCREENSHOT + '-' + name + '.png' });
      const contained = geometry.bar.left >= 0 && geometry.bar.top >= 0 && geometry.bar.right <= size.width && geometry.bar.bottom <= size.height;
      const clearance = geometry.rail.every(control => clearOf(geometry.bar, control));
      const targets = geometry.input.height >= 44 && geometry.input.width >= 100 && geometry.buttons.every(button => button.width >= 44 && button.height >= 44);
      const controlsContained = [geometry.input, ...geometry.buttons].every(control => control.left >= geometry.bar.left && control.right <= geometry.bar.right && control.top >= geometry.bar.top && control.bottom <= geometry.bar.bottom);
      const paperContained = !size.workspace || geometry.bar.right <= geometry.pane.right;
      if (!size.workspace) {
        assert.equal(geometry.rail.find(control => control.id === 'zenLayout').width, 44, 'the layout control is a rail circle like the others');
        assert.match(await page.locator('#zenLayout').getAttribute('aria-label'), /Page layout: Scroll/);
      }
      console.log((contained && clearance && targets && controlsContained && paperContained ? 'PASS' : 'FAIL') + ' ' + name + ' ' + JSON.stringify(geometry));
      if (!(contained && clearance && targets && controlsContained && paperContained)) failures.push(name);
      if (contained && clearance && targets && controlsContained && paperContained) {
        const count = await page.locator('#findCount').textContent();
        await page.locator('#findNext').tap();
        assert.notEqual(await page.locator('#findCount').textContent(), count, name + ': Next remains tappable');
        await page.locator('#findPrev').tap();
        assert.equal(await page.locator('#findCount').textContent(), count, name + ': Previous remains tappable');
      }
    }
    assert.deepEqual(failures, [], 'Find remains usable, on the paper, and clear of every rail button after rotation');
    await page.setViewportSize({ width: 768, height: 1024 });
    assert.equal(await page.locator('#findBar').isVisible(), false, 'Find follows the hidden paper while Workspace fills a portrait window');
    await page.locator('#workspaceClose').click();
    await page.locator('#findBar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#findInput').inputValue(), 'Find', 'returning to the paper preserves the search');
    assert.deepEqual(errors, [], 'no page errors');
    await context.close();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
