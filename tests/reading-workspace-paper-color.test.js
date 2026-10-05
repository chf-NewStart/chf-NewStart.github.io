/* Direct paper highlighter color beside an open Workspace (landscape split).
   Browser evidence only; physical iPad touch and VoiceOver remain device checks. */
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
  page.drawText('A colored passage for the paper side.', { x: 52, y: 710, size: 13, font });
  return Buffer.from(await doc.save());
}
const visibleDock = page => page.locator('#zenDock > button, #zenDock > .zen-tool > button').evaluateAll(nodes =>
  nodes.filter(node => node.getClientRects().length).map(node => node.id));

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    // iPad Air landscape CSS size.
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'paper-color.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);

    assert.equal(await page.locator('#zenWorkspaceMarker').isVisible(), false, 'reading alone keeps the quiet Zen dock');
    assert.deepEqual(await visibleDock(page), ['zenExit', 'zenGuide', 'zenAnnotate', 'zenUndo', 'zenWorkspace', 'zenMore']);

    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    assert.deepEqual(await visibleDock(page), ['zenExit', 'zenGuide', 'zenAnnotate', 'zenWorkspaceMarker', 'zenUndo', 'zenWorkspace', 'zenMore'],
      'Workspace adds one direct paper color button beside Annotate');
    const geometry = await page.evaluate(() => {
      const box = id => document.getElementById(id).getBoundingClientRect().toJSON();
      return { button: box('zenWorkspaceMarker'), paper: box('documentPane') };
    });
    assert(geometry.button.width >= 43.5 && geometry.button.height >= 43.5 && geometry.button.right <= geometry.paper.right,
      'the color button is a 44px target on the paper side: ' + JSON.stringify(geometry));

    // One tap opens the paper's color shelf on the paper half.
    await page.locator('#zenWorkspaceMarker').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#zenWorkspaceMarker').getAttribute('aria-expanded'), 'true');
    const shelf = await page.evaluate(() => ({ toolbar: document.getElementById('highlightToolbar').getBoundingClientRect().toJSON(),
      paper: document.getElementById('documentPane').getBoundingClientRect().toJSON() }));
    assert(shelf.toolbar.left >= shelf.paper.left - 1 && shelf.toolbar.right <= shelf.paper.right + 1,
      'the paper color shelf never covers workspace paper: ' + JSON.stringify(shelf));
    await page.locator('#highlightToolbar [data-highlight-color="mint"]').click();
    await page.waitForFunction(() => document.getElementById('zenWorkspaceMarker').dataset.highlightColor === 'mint');
    assert.equal(await page.locator('#zenMarker').getAttribute('data-highlight-color'), 'mint', 'both paper color entries share one color');
    assert.match(await page.locator('#zenWorkspaceMarker').getAttribute('aria-label'), /Mint/);
    const workspaceInkColor = await page.locator('[data-workspace-color][aria-pressed="true"]').getAttribute('data-workspace-color');
    assert.equal(workspaceInkColor, 'black', 'the paper highlighter does not change workspace pen color');
    await page.locator('#highlightDone').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'zenWorkspaceMarker', 'Done returns focus to the button that opened it');

    // Escape also closes it back to the same button.
    await page.locator('#zenWorkspaceMarker').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#highlightToolbar').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'zenWorkspaceMarker');

    // The original Annotate path still works and still returns to Annotate.
    await page.locator('#zenAnnotate').click();
    await page.locator('#zenMarker').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'visible' });
    await page.locator('#highlightDone').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'zenAnnotate');

    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zenWorkspaceMarker').isVisible(), false, 'closing Workspace restores the quiet dock');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS  Direct paper highlighter color beside Workspace (' + ENGINE + ')');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
