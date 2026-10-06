/* Typing in a note never hides behind the on-screen keyboard. With a keyboard covering
   the lower part of the screen (simulated by shrinking window.visualViewport), focusing a
   note near the bottom scrolls the Workspace so the note's text box sits above the
   keyboard; a note already clear of it does not move the Workspace. Chromium; not a
   substitute for a physical iPad check. */
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
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // A fake visual viewport that a test can shrink like the iPad keyboard does.
    await page.addInitScript(() => {
      const real = window.visualViewport;
      const fake = new EventTarget();
      fake.keyboard = 0;
      Object.defineProperty(fake, 'height', { get: () => (real ? real.height : innerHeight) - fake.keyboard });
      Object.defineProperty(fake, 'width', { get: () => (real ? real.width : innerWidth) });
      Object.defineProperty(fake, 'offsetTop', { get: () => 0 });
      Object.defineProperty(fake, 'offsetLeft', { get: () => 0 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
      window.__showKeyboard = height => { fake.keyboard = height; fake.dispatchEvent(new Event('resize')); };
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'note-keyboard.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page canvas')?.width);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const view = await page.locator('#workspaceScroll').boundingBox();
    const note = await page.locator('#workspaceNewNote').boundingBox();
    const KEYBOARD = 380, keyboardTop = 820 - KEYBOARD;

    // 1. A note dropped low, then typed in with the keyboard up, is scrolled above it.
    await page.mouse.move(note.x + note.width / 2, note.y + note.height / 2); await page.mouse.down();
    await page.mouse.move(view.x + view.width * .4, view.y + view.height - 120, { steps: 10 });
    await page.mouse.up();
    const card = page.locator('.workspace-card').first();
    await card.waitFor({ state: 'visible' });
    await page.waitForTimeout(700);
    const lowBefore = await card.locator('textarea').evaluate(el => el.getBoundingClientRect().bottom);
    assert(lowBefore > keyboardTop, 'test setup: the note sits where the keyboard will cover it: ' + lowBefore);
    const scrollBefore = await page.locator('#workspaceScroll').evaluate(el => el.scrollTop);
    await page.evaluate(h => window.__showKeyboard(h), KEYBOARD);
    await page.waitForTimeout(800);
    const after = await card.locator('textarea').evaluate(el => el.getBoundingClientRect().toJSON());
    assert(after.bottom <= keyboardTop, `the note's text box clears the keyboard: bottom ${after.bottom}, keyboard top ${keyboardTop}`);
    assert(after.top >= view.y, 'the text box is still on screen: ' + JSON.stringify(after));
    assert(await page.locator('#workspaceScroll').evaluate(el => el.scrollTop) > scrollBefore, 'the Workspace scrolled up');

    // 2. Typing more lines keeps the growing text box above the keyboard.
    await page.keyboard.type('one\ntwo\nthree\nfour\nfive');
    await page.waitForTimeout(200);
    const typed = await card.locator('textarea').evaluate(el => el.getBoundingClientRect().bottom);
    assert(typed <= keyboardTop + 2, `the text box stays above the keyboard while typing: ${typed} vs ${keyboardTop}`);

    // 3. A note already clear of the keyboard does not move the Workspace.
    await page.evaluate(() => window.__showKeyboard(0));
    await page.waitForTimeout(300);
    await page.locator('#workspaceScroll').evaluate((el, y) => {
      const card = document.querySelector('.workspace-card');
      el.scrollTop += card.getBoundingClientRect().top - y;
    }, view.y + 30);
    await page.waitForTimeout(200);
    const clear = await card.locator('textarea').evaluate(el => el.getBoundingClientRect().bottom);
    assert(clear < keyboardTop - 20, 'test setup: the note now sits above the keyboard line: ' + clear);
    const resting = await page.locator('#workspaceScroll').evaluate(el => el.scrollTop);
    await page.evaluate(h => window.__showKeyboard(h), KEYBOARD);
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#workspaceScroll').evaluate(el => el.scrollTop), resting, 'a note clear of the keyboard leaves the Workspace where it was');
    assert.deepEqual(errors, []);
    console.log('PASS a note being typed in stays above the on-screen keyboard');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error('FAIL', error); process.exit(1); });
