/* Compact Zen controls and direct Workspace across reader-sized viewports. */
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
const PORT = +(process.env.PHLOEM_ZEN_COMPACT_TEST_PORT || 8329);
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
  page.drawText('Compact Zen annotation passage.', { x: 52, y: 710, size: 13, font });
  return Buffer.from(await doc.save());
}
async function menuBounds(page, selector) {
  const result = await page.locator(selector).evaluate(node => {
    const rect = node.getBoundingClientRect();
    const buttons = [...node.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return { rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      buttons: buttons.map(button => ({ id: button.id, width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height })) };
  });
  assert(result.rect.x >= -1 && result.rect.y >= -1 && result.rect.right <= result.viewport.width + 1
    && result.rect.bottom <= result.viewport.height + 1,
  selector + ' stays on-screen: ' + JSON.stringify(result));
  assert(result.buttons.every(button => button.width >= 43.5 && button.height >= 43.5),
    selector + ' rows have 44px touch targets: ' + JSON.stringify(result));
}
async function railAt(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(() => document.body.classList.contains('zen') && !!document.querySelector('.pdf-page.book-active canvas')?.width);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const controls = await page.evaluate(() => [...document.querySelectorAll('#zenDock > button, #zenDock > .zen-tool > button')]
    .filter(node => node.getClientRects().length).map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.id, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height };
    }));
  assert.deepEqual(controls.map(item => item.id),
    ['zenExit', 'zenGuide', 'zenLayout', 'zenAnnotate', 'zenUndo', 'zenWorkspace', 'zenMore'],
    'Zen has seven top-level controls, including layout and paper Undo, at ' + JSON.stringify(viewport));
  assert(controls.every(item => item.width >= 43.5 && item.height >= 43.5 && item.x >= -1 && item.y >= -1
    && item.right <= viewport.width + 1 && item.bottom <= viewport.height + 1),
  'all seven Zen controls remain on-screen and touch-sized: ' + JSON.stringify({ viewport, controls }));
}
async function stroke(page) {
  await page.locator('#workspaceInk').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    const board = document.getElementById('workspaceBoard');
    const capture = board.setPointerCapture;
    board.setPointerCapture = () => {};
    try {
      [[.20, .22], [.25, .25], [.31, .27]].forEach(([x, y], index, points) => {
        const type = index === 0 ? 'pointerdown' : index === points.length - 1 ? 'pointerup' : 'pointermove';
        canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen',
          pointerId: 77, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
          pressure: type === 'pointerup' ? 0 : .6,
          clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y }));
      });
    } finally { board.setPointerCapture = capture; }
  });
}

(async () => {
  await new Promise((resolve, reject) => {
    const onError = error => {
      if (error.code !== 'EADDRINUSE') { reject(error); return; }
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    };
    server.once('error', onError);
    server.listen(PORT, '127.0.0.1', () => { server.removeListener('error', onError); resolve(); });
  });
  let browser;
  try {
    const launch = { headless: true };
    const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
    if (executablePath) launch.executablePath = executablePath;
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phloem.compactZenFixture')) return;
      sessionStorage.setItem('phloem.compactZenFixture', '1');
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'page', focus: false }));
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/reading.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'compact-zen.pdf', mimeType: 'application/pdf', buffer: await generatedPdf() });
    try {
      await page.waitForFunction(() => document.body.classList.contains('zen')
        && !!document.querySelector('.pdf-page.book-active canvas')?.width
        && document.getElementById('pdfFrame').dataset.pagedReady === 'true');
    } catch (error) {
      const state = await page.evaluate(() => ({ zen: document.body.classList.contains('zen'),
        reader: !document.getElementById('readerPage').classList.contains('hidden'),
        activeCanvas: document.querySelector('.pdf-page.book-active canvas')?.width,
        ready: document.getElementById('pdfFrame').dataset.pagedReady,
        lastOpen: localStorage.getItem('readingRoom.lastOpen.v1'),
        importStatus: document.getElementById('importStatus')?.textContent }));
      throw new Error('PDF did not become ready: ' + JSON.stringify({ state, errors }), { cause: error });
    }
    const paperId = await page.evaluate(() => localStorage.getItem('readingRoom.lastOpen.v1'));

    const sizes = [
      { width: 1280, height: 900 }, { width: 1024, height: 768 },
      { width: 844, height: 390 }, { width: 844, height: 300 }, { width: 390, height: 844 }
    ];
    for (const viewport of sizes) {
      await railAt(page, viewport);
      if (viewport.width === 1280) await page.screenshot({ path: '/tmp/phloem-zen-compact-' + ENGINE + '.png' });
      await page.locator('#zenAnnotate').click();
      await page.locator('#zenAnnotateMenu').waitFor({ state: 'visible' });
      await menuBounds(page, '#zenAnnotateMenu');
      await page.locator('#zenMore').click();
      await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#zenAnnotateMenu').isVisible(), false,
        'More and Annotate popups are exclusive');
      await menuBounds(page, '#zenMoreMenu');
      if (viewport.width === 1280) await page.screenshot({ path: '/tmp/phloem-zen-compact-more-' + ENGINE + '.png' });
      await page.locator('#zenLayout').click();
      await page.locator('#zenLayoutMenu').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#zenMoreMenu').isVisible(), false,
        'the direct Layout selector closes More');
      assert.equal(await page.locator('#zenDock > #zenLayoutTool #zenLayoutMenu').count(), 1,
        'layout choices open directly from the dock');
      await menuBounds(page, '#zenLayoutMenu');
      if (viewport.width === 390) await page.screenshot({ path: '/tmp/phloem-zen-layout-compact-' + ENGINE + '.png' });
      await page.locator('[data-zen-pdf-layout="page"]').focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#zenLayoutMenu').isVisible(), false,
        'Escape closes layout choices');
      assert.equal(await page.locator('#zenLayout').evaluate(node => document.activeElement === node), true,
        'Escape returns focus to the direct Layout trigger');
      await page.locator('#zenGuide').click();
      await page.locator('#zenGuideMenu').waitFor({ state: 'visible' });
      await page.locator('#zenAnnotate').click();
      await page.locator('#zenAnnotateMenu').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#zenGuideMenu').isVisible(), false,
        'Annotate dismisses Guide controls');
      await page.locator('#zenAnnotate').focus();
      await page.keyboard.press('Escape');
      await page.locator('#zenAnnotateMenu').waitFor({ state: 'hidden' });
    }

    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#zenDock').evaluate(node => {
      node.style.setProperty('--zen-safe-top', '30px');
      node.style.setProperty('--zen-safe-bottom', '24px');
    });
    await page.locator('#zenLayout').tap();
    await page.locator('#zenLayoutMenu').waitFor({ state: 'visible' });
    const safeMenu = await page.locator('#zenLayoutMenu').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight };
    });
    assert(safeMenu.top >= 40 && safeMenu.bottom <= safeMenu.viewportHeight - 34,
      'short landscape Layout respects simulated top and bottom safe areas: ' + JSON.stringify(safeMenu));
    await page.locator('#zenLayout').focus();
    await page.keyboard.press('Escape');
    await page.locator('#zenLayoutMenu').waitFor({ state: 'hidden' });
    await page.locator('#zenDock').evaluate(node => {
      node.style.removeProperty('--zen-safe-top');
      node.style.removeProperty('--zen-safe-bottom');
    });

    // Resting controls stay discoverable; an open choice or keyboard focus is active use.
    await page.mouse.move(220, 210);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForFunction(() => document.body.classList.contains('zen-idle'));
    await page.waitForTimeout(300);
    const restingOpacity = await page.locator('#zenLayout').evaluate(node => +getComputedStyle(node).opacity);
    assert(restingOpacity >= .45 && restingOpacity <= .6, 'the resting layout label remains subtly visible: ' + restingOpacity);
    await page.locator('#zenLayout').tap();
    await page.locator('#zenLayoutMenu').waitFor({ state: 'visible' });
    await page.waitForTimeout(3500);
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen-idle')), false,
      'touch-open layout choices hold the dock awake');
    await menuBounds(page, '#zenLayoutMenu');
    await page.screenshot({ path: '/tmp/phloem-zen-layout-open-' + ENGINE + '.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3500);
    assert.equal(await page.locator('#zenLayout').evaluate(node => document.activeElement === node
      && +getComputedStyle(node).opacity >= .85), true, 'keyboard focus remains readable after the idle delay');
    await page.locator('#zenLayout').press('Enter');
    await page.locator('[data-zen-pdf-layout="book"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#zenLayoutLabel').textContent(), 'Book');
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await railAt(page, viewport);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).pdfLayout), 'book',
        'rotation preserves the chosen Book layout');
      assert.equal(await page.locator('#zenLayoutLabel').textContent(), 'Book');
      assert.equal(await page.locator('[data-zen-pdf-layout="book"]').getAttribute('aria-pressed'), 'true');
    }
    await page.locator('#zenLayout').tap();
    await page.locator('[data-zen-pdf-layout="scroll"]').tap();
    assert.equal(await page.locator('#zenLayoutLabel').textContent(), 'Scroll');
    assert.equal(await page.locator('#zenLayoutMenu').isVisible(), false);
    await page.locator('#zenLayout').tap();
    await page.locator('[data-zen-pdf-layout="page"]').tap();
    assert.equal(await page.locator('#zenLayoutLabel').textContent(), 'Page');

    await page.setViewportSize({ width: 1280, height: 900 });
    await railAt(page, { width: 1280, height: 900 });
    await page.locator('#zenMore').click();
    await page.locator('#zenFind').click();
    await page.locator('#findBar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#zenMoreMenu').isVisible(), false,
      'Find closes the More popup');
    await page.locator('#findInput').focus();
    await page.keyboard.press('Escape');
    await page.locator('#findBar').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zenMore').evaluate(node => document.activeElement === node), true,
      'closing Find returns focus to the visible More control');

    await page.locator('#zenAnnotate').click();
    await page.locator('#zenMarker').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#zenAnnotateMenu').isVisible(), false,
      'Marker leaves the Annotate popup for the existing bottom palette');
    await page.locator('#highlightDone').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zenAnnotate').evaluate(node => document.activeElement === node), true,
      'closing Marker palette returns focus to Annotate');
    await page.locator('#zenAnnotate').click();
    await page.locator('#zenWrite').click();
    await page.locator('#pdfInkToolbar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#zenAnnotateMenu').isVisible(), false,
      'Write leaves the Annotate popup for the existing bottom palette');
    await page.locator('#pdfInkDone').click();
    await page.locator('#pdfInkToolbar').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zenAnnotate').evaluate(node => document.activeElement === node), true,
      'closing Write palette returns focus to Annotate');

    const selected = await page.evaluate(() => {
      const phrase = 'Compact Zen annotation passage';
      const span = [...document.querySelectorAll('.pdf-page.book-active .text-layer span')]
        .find(node => node.textContent.includes(phrase) && node.firstChild);
      if (!span) return '';
      const start = span.firstChild.textContent.indexOf(phrase);
      const range = document.createRange();
      range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + phrase.length);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 92 }));
      return selection.toString();
    });
    assert.equal(selected, 'Compact Zen annotation passage');
    await page.locator('#zenAnnotate').click();
    await page.locator('#zenAnnotateMenu').waitFor({ state: 'visible' });
    await page.locator('#zenAnnotate').focus();
    await page.keyboard.press('Escape');
    await page.locator('#zenAnnotateMenu').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('zen')), true,
      'Escape closes Annotate without leaving Zen or consuming the pending selection');
    await page.locator('#zenAnnotate').click();
    await page.locator('#zenMarker').click();
    await page.waitForFunction(id => Object.values(JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === id)?.highlights || {}).flat().length > 0, paperId);
    await page.locator('#highlightDone').click();
    await page.locator('#highlightToolbar').waitFor({ state: 'hidden' });

    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#zenWorkspace').getAttribute('aria-pressed'), 'true');
    await page.locator('#workspaceNewNote').click();
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === id)?.readingExcerpts?.items?.some(item => item.quote === ''), paperId);
    const noteId = await page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === id).readingExcerpts.items.find(item => item.quote === '').id, paperId);
    const card = page.locator('.workspace-card[data-clip-id="' + noteId + '"]');
    await card.locator('textarea.workspace-note').fill('Compact rail sticky thought');
    await page.waitForFunction(({ id, noteId }) => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === id)?.readingExcerpts?.items?.some(item => item.id === noteId && item.note === 'Compact rail sticky thought'), { id: paperId, noteId });
    await card.locator('.workspace-handle').focus();
    await stroke(page);
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters
      .find(ch => ch.id === id)?.readingWorkspace?.strokes?.length === 1, paperId);
    await page.screenshot({ path: '/tmp/phloem-zen-compact-workspace-' + ENGINE + '.png' });
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zenWorkspace').getAttribute('aria-pressed'), 'false');
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspacePanel').waitFor({ state: 'visible' });
    assert.equal(await card.locator('.workspace-note-preview').textContent(), 'Compact rail sticky thought');
    assert.equal(await page.locator('#workspaceInk path[data-stroke-id]').count(), 1,
      'direct Workspace toggle retains saved ink');
    assert.deepEqual(errors, [], 'compact Zen interactions have no page errors');
    console.log('PASS  Compact Zen layout selector, idle/focus, rotation, popups and Workspace');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
