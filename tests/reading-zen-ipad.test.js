let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_ZEN_IPAD_TEST_PORT || 8141);
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

/* Headless browsers cannot open a software keyboard. This keeps the browser's
   real layout and input behavior while giving the reader the same visualViewport
   resize/scroll contract that iPadOS sends when its keyboard covers the lower screen. */
function installVisualViewportMock() {
  const listeners = { resize: new Set(), scroll: new Set() };
  const viewport = {
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener(type, listener) {
      if (listeners[type]) listeners[type].add(listener);
    },
    removeEventListener(type, listener) {
      if (listeners[type]) listeners[type].delete(listener);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach(listener => listener.call(viewport, event));
      return true;
    }
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  window.__setVisualViewport = function(next) {
    Object.assign(viewport, next);
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  };
}

function seedReader() {
  const paragraphs = [];
  for (let i = 0; i < 14; i++) {
    paragraphs.push('Paragraph ' + (i + 1) + ' keeps enough readable material on the page to place a selected passage near the lower edge of the iPad viewport.');
  }
  const chapter = {
    id: 'zen_ipad_note', kind: 'text', title: 'Zen and iPad test', authors: 'Tester',
    fr: paragraphs.join('\n\n'), textHighlights: [], highlights: {}, readerHighlights: [],
    notes: {}, readerNotes: {}, pageNotes: {}, questions: [], aiThreads: [],
    termLookups: {}, reviews: {}, tags: [], at: Date.now()
  };
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [chapter] }));
  localStorage.setItem('readingRoom.lastOpen.v1', chapter.id);
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    pdfLayout: 'scroll', guideOrientation: 'row', focus: false, guideDim: 70
  }));
}

function seedZenReader() {
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {} }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    pdfLayout: 'scroll', guideOrientation: 'row', focus: false, guideDim: 70
  }));
  localStorage.setItem('readingRoom.theme', 'light');
  localStorage.setItem('readingRoom.paperAppearance.v1', 'cream');
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seedZenReader);

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf'));
  await page.waitForFunction(() => document.querySelector('.pdf-page canvas')?.width > 0 && !document.getElementById('readerPage').classList.contains('hidden'));

  await page.click('#zenBtn');
  await page.waitForFunction(() => document.body.classList.contains('zen'));
  const zenDockState = await page.locator('#zenDock').evaluate(dock => {
    const button = document.getElementById('zenLayout');
    return {
      dockDisplay: getComputedStyle(dock).display,
      dockRect: dock.getBoundingClientRect().toJSON(),
      buttonDisplay: getComputedStyle(button).display,
      buttonRect: button.getBoundingClientRect().toJSON(),
      expanded: button.getAttribute('aria-expanded')
    };
  });
  const zenLayoutVisible = await page.locator('#zenLayout').isVisible();
  check('Zen exposes one compact layout switch', zenLayoutVisible && zenDockState.expanded === 'false', JSON.stringify(zenDockState));
  check('Zen keeps layout choices collapsed until requested', !(await page.locator('#zenLayoutMenu').isVisible()));
  check('Zen refresh uses the same save-safe reload path as the masthead', await page.evaluate(() => document.getElementById('zenRefresh').onclick === document.getElementById('refreshBtn').onclick));
  const zenPaperState = await page.locator('#zenPaperAppearance').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return { visible: getComputedStyle(button).display !== 'none', width: rect.width, height: rect.height, label: button.getAttribute('aria-label'), state: button.dataset.paperState };
  });
  check('Zen includes a full-size paper appearance shortcut', zenPaperState.visible && zenPaperState.width >= 44 && zenPaperState.height >= 44 && zenPaperState.state === 'cream' && /cream/i.test(zenPaperState.label), JSON.stringify(zenPaperState));
  await page.click('#zenPaperAppearance');
  const zenPaperChanged = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'light',
    body: document.body.dataset.paperAppearance,
    frame: document.getElementById('pdfFrame').dataset.paperAppearance,
    setting: document.querySelector('[data-paper-appearance="inverted"]').getAttribute('aria-pressed'),
    saved: localStorage.getItem('readingRoom.paperAppearance.v1')
  }));
  check('Zen changes paper appearance without changing the interface theme', zenPaperChanged.theme === 'light' && zenPaperChanged.body === 'inverted' && zenPaperChanged.frame === 'inverted' && zenPaperChanged.setting === 'true' && zenPaperChanged.saved === 'inverted', JSON.stringify(zenPaperChanged));
  await page.click('#zenTheme');
  check('Zen interface theme changes without resetting the paper', await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.getElementById('pdfFrame').dataset.paperAppearance === 'inverted'));

  if (zenLayoutVisible) await page.click('#zenLayout');
  else await page.locator('#zenLayout').evaluate(button => button.click());
  check('layout switch expands beside the Zen dock', await page.locator('#zenLayoutMenu').isVisible() && await page.locator('#zenLayout').getAttribute('aria-expanded') === 'true');
  check('layout switch offers exactly Scroll, Page, and Book', await page.locator('#zenLayoutMenu [data-zen-pdf-layout]').evaluateAll(buttons => buttons.map(button => button.dataset.zenPdfLayout).join(',')) === 'scroll,page,book');
  check('the saved Scroll choice is reflected inside Zen', await page.locator('[data-zen-pdf-layout="scroll"]').getAttribute('aria-pressed') === 'true');

  await page.click('[data-zen-pdf-layout="page"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).pdfLayout === 'page');
  check('choosing Page in Zen updates the regular reading setting', await page.locator('[data-pdf-layout="page"]').getAttribute('aria-pressed') === 'true');
  check('choosing Page in Zen updates its own selected state', await page.locator('[data-zen-pdf-layout="page"]').getAttribute('aria-pressed') === 'true');
  check('a Zen layout choice closes its popout', !(await page.locator('#zenLayoutMenu').isVisible()) && await page.locator('#zenLayout').getAttribute('aria-expanded') === 'false');

  await page.click('#zenLayout');
  await page.keyboard.press('Escape');
  check('Escape closes the Zen layout popout without leaving Zen', !(await page.locator('#zenLayoutMenu').isVisible()) && await page.locator('#zenLayout').getAttribute('aria-expanded') === 'false' && await page.locator('body').evaluate(body => body.classList.contains('zen')));

  check('Zen has no separate floating dimness tool', await page.locator('#zenDim, #zenDimTool').count() === 0);
  check('Guide owns the hidden dimness control', await page.locator('#zenGuideMenu #zenGuideDimRange').count() === 1 && !(await page.locator('#zenGuideDimRange').isVisible()));
  check('Zen guide dimness starts in sync with Reading settings', await page.locator('#zenGuideDimRange').inputValue() === '70' && await page.locator('#zenGuideDimValue').textContent() === '70%' && await page.locator('#guideDimRange').inputValue() === '70');
  await page.locator('#zenGuide').focus();
  await page.locator('#zenGuide').press('Enter');
  check('Guide expands its own controls beside the Zen dock', await page.locator('#zenGuideMenu').isVisible() && await page.locator('#zenGuide').getAttribute('aria-expanded') === 'true');
  await page.click('#zenGuideToggle');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).focus === true);
  check('the Guide popout contains the real on/off control', await page.locator('#zenGuideToggle').getAttribute('aria-pressed') === 'true' && /on/i.test(await page.locator('#zenGuideToggleLabel').textContent()));
  await page.locator('#zenGuideDimRange').evaluate(input => {
    input.value = '80';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.comfort.v1')).guideDim === 80);
  const dimState = await page.evaluate(() => ({
    zenValue: document.getElementById('zenGuideDimValue').textContent,
    deskValue: document.getElementById('guideDimValue').textContent,
    deskRange: document.getElementById('guideDimRange').value,
    opacity: document.getElementById('paneSpotlight').style.getPropertyValue('--guide-dim-opacity')
  }));
  check('Zen dimness stays synchronized with the desk control and guide', dimState.zenValue === '80%' && dimState.deskValue === '80%' && dimState.deskRange === '80' && dimState.opacity === '0.80', JSON.stringify(dimState));
  await page.locator('#zenGuideDimRange').focus();
  await page.keyboard.press('Escape');
  check('Escape closes Guide controls, returns focus, and stays in Zen', !(await page.locator('#zenGuideMenu').isVisible()) && await page.locator('#zenGuide').getAttribute('aria-expanded') === 'false' && await page.evaluate(() => document.activeElement === document.getElementById('zenGuide') && document.body.classList.contains('zen')));

  await page.click('#zenExit');
  await page.waitForFunction(() => !document.body.classList.contains('zen'));
  await context.close();

  const keyboardContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const keyboardPage = await keyboardContext.newPage();
  keyboardPage.setDefaultTimeout(8000);
  keyboardPage.on('pageerror', error => errors.push(error.message));
  await keyboardPage.addInitScript(installVisualViewportMock);
  await keyboardPage.addInitScript(seedReader);
  await keyboardPage.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await keyboardPage.waitForFunction(() => document.querySelector('#textDocument .original') && !document.getElementById('readerPage').classList.contains('hidden'));

  /* Put a genuine DOM selection near the bottom of the full layout viewport. Its note
     card begins below the future keyboard edge, so passing this check requires the
     visual-viewport resize path rather than a coincidentally high selection. */
  await keyboardPage.evaluate(() => {
    const pane = document.getElementById('documentPane');
    const paragraphs = Array.from(document.querySelectorAll('#textDocument .original'));
    const paragraph = paragraphs[Math.min(8, paragraphs.length - 1)];
    pane.scrollTop = Math.max(0, paragraph.offsetTop - pane.clientHeight + 120);
    paragraph.scrollIntoView({ block: 'end' });
    const node = paragraph.firstChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(34, node.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await keyboardPage.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
  await keyboardPage.click('#selectionAddNote');
  await keyboardPage.fill('#selectionNote', 'The keyboard must not cover this sentence.');
  await keyboardPage.focus('#selectionNote');

  await keyboardPage.evaluate(() => window.__setVisualViewport({ height: 400, offsetTop: 20 }));
  await keyboardPage.waitForFunction(() => document.body.classList.contains('keyboard-open') && getComputedStyle(document.documentElement).getPropertyValue('--visual-viewport-height').trim() === '400px');
  await keyboardPage.waitForTimeout(120);
  const keyboardFit = await keyboardPage.evaluate(() => {
    const viewport = window.visualViewport;
    const card = document.getElementById('selectionCard').getBoundingClientRect();
    const input = document.getElementById('selectionNote').getBoundingClientRect();
    const top = viewport.offsetTop;
    const bottom = top + viewport.height;
    return {
      viewport: { top, bottom, width: viewport.width, height: viewport.height },
      card: { top: card.top, bottom: card.bottom, height: card.height },
      input: { top: input.top, bottom: input.bottom, height: input.height, fontSize: parseFloat(getComputedStyle(document.getElementById('selectionNote')).fontSize) },
      inset: getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim(),
      active: document.activeElement && document.activeElement.id
    };
  });
  check('a >720px iPad viewport is recognized as keyboard-open', keyboardFit.inset === '348px' && keyboardFit.viewport.width > 720, JSON.stringify(keyboardFit));
  check('the selection note card is clamped to the visible iPad viewport', keyboardFit.card.top >= keyboardFit.viewport.top - 1 && keyboardFit.card.bottom <= keyboardFit.viewport.bottom + 1, JSON.stringify(keyboardFit));
  check('the focused note stays visible above the iPad keyboard', keyboardFit.active === 'selectionNote' && keyboardFit.input.top >= keyboardFit.viewport.top - 1 && keyboardFit.input.bottom <= keyboardFit.viewport.bottom + 1, JSON.stringify(keyboardFit));
  check('touch editing avoids iOS focus zoom', keyboardFit.input.fontSize >= 16, JSON.stringify(keyboardFit));

  await keyboardPage.evaluate(() => window.__setVisualViewport({ height: 768, offsetTop: 0 }));
  await keyboardPage.waitForFunction(() => !document.body.classList.contains('keyboard-open') && getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim() === '0px');
  check('keyboard dismissal restores the normal viewport state', true);

  check('Zen and iPad controls have no page errors', errors.length === 0, errors.join('; '));
  await keyboardContext.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
