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

/* Build a real browser Range inside the rendered PDF text layer and send the same
   touch pointer lifecycle used when an iPad selection handle is released. */
async function selectPdfPassage(page) {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span'));
    const span = spans.find(candidate => candidate.firstChild
      && candidate.firstChild.nodeType === Node.TEXT_NODE
      && candidate.firstChild.nodeValue.trim().length >= 8);
    if (!span) return null;
    const node = span.firstChild;
    const leadingWhitespace = node.nodeValue.search(/\S/);
    const start = Math.max(0, leadingWhitespace);
    const end = Math.min(node.nodeValue.length, start + 8);
    const box = span.getBoundingClientRect();
    span.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 71,
      isPrimary: true, button: 0, buttons: 1,
      clientX: box.left + 2, clientY: (box.top + box.bottom) / 2
    }));
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 71,
      isPrimary: true, button: 0, buttons: 0,
      clientX: box.left + Math.min(box.width - 2, 30), clientY: (box.top + box.bottom) / 2
    }));
    return selection.toString().replace(/\s+/g, ' ').trim();
  });
}

async function storedPdfHighlights(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('readingRoom.lastOpen.v1');
    const state = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const chapter = state.chapters.find(item => item.id === id);
    return chapter && chapter.highlights && chapter.highlights['1'] || [];
  });
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
  const zenFindTarget = await page.locator('#zenFind').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label'), controls: button.getAttribute('aria-controls') };
  });
  check('Zen exposes a full-size Find control', zenFindTarget.width >= 44 && zenFindTarget.height >= 44 && /find/i.test(zenFindTarget.label) && zenFindTarget.controls === 'findBar', JSON.stringify(zenFindTarget));
  await page.click('#zenFind');
  await page.waitForFunction(() => !document.getElementById('findBar').classList.contains('hidden') && document.activeElement === document.getElementById('findInput'));
  const zenFindPanel = await page.locator('#findBar').evaluate(bar => {
    const rect = bar.getBoundingClientRect();
    return { position: getComputedStyle(bar).position, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight, zen: document.body.classList.contains('zen'), expanded: document.getElementById('zenFind').getAttribute('aria-expanded') };
  });
  check('Zen Find opens a viewport-contained floating search panel without leaving Zen', zenFindPanel.position === 'fixed' && zenFindPanel.left >= -0.5 && zenFindPanel.top >= -0.5 && zenFindPanel.right <= zenFindPanel.width + 0.5 && zenFindPanel.bottom <= zenFindPanel.height + 0.5 && zenFindPanel.zen && zenFindPanel.expanded === 'true', JSON.stringify(zenFindPanel));
  await page.fill('#findInput', 'Phloem');
  await page.waitForFunction(() => /\d+\s*\/\s*\d+/.test(document.getElementById('findCount').textContent) && !!document.querySelector('.find-target,.find-span'));
  check('Find searches and paints results while Zen remains active', await page.evaluate(() => document.body.classList.contains('zen') && /\d+\s*\/\s*\d+/.test(document.getElementById('findCount').textContent) && !!document.querySelector('.find-target,.find-span')));
  await page.keyboard.press('Escape');
  check('Escape closes Find, returns focus, and leaves Zen active', await page.evaluate(() => document.getElementById('findBar').classList.contains('hidden') && document.activeElement === document.getElementById('zenFind') && document.body.classList.contains('zen') && document.getElementById('zenFind').getAttribute('aria-expanded') === 'false'));
  await page.locator('#highlightBtn').evaluate(button => button.click());
  await page.keyboard.press('/');
  await page.waitForFunction(() => !document.getElementById('findBar').classList.contains('hidden') && document.activeElement === document.getElementById('findInput'));
  await page.locator('#findNext').focus();
  await page.keyboard.press('Escape');
  check('Escape from a Zen Find step control closes only Find', await page.evaluate(() => document.getElementById('findBar').classList.contains('hidden') && document.activeElement === document.getElementById('zenFind') && document.body.classList.contains('zen') && document.getElementById('highlightBtn').getAttribute('aria-pressed') === 'true'));
  await page.locator('#highlightBtn').evaluate(button => button.click());

  const zenMarker = page.locator('#zenMarker');
  const zenMarkerMenu = page.locator('#zenMarkerMenu');
  const zenMarkerState = await zenMarker.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return {
      visible: getComputedStyle(button).display !== 'none' && getComputedStyle(button).visibility !== 'hidden',
      width: rect.width,
      height: rect.height,
      expanded: button.getAttribute('aria-expanded'),
      controls: button.getAttribute('aria-controls'),
      hasPopup: button.getAttribute('aria-haspopup'),
      toggleVisible: !document.getElementById('zenMarkerToggle').classList.contains('hidden')
    };
  });
  check('coarse-touch Zen exposes a full-size selection-first Marker', zenMarkerState.visible
    && zenMarkerState.width >= 44 && zenMarkerState.height >= 44
    && zenMarkerState.expanded === 'false' && zenMarkerState.controls === 'zenMarkerMenu'
    && zenMarkerState.hasPopup === null && !zenMarkerState.toggleVisible,
  JSON.stringify(zenMarkerState));

  await zenMarker.focus();
  await zenMarker.press('Enter');
  const zenColorTargets = await zenMarkerMenu.locator('[data-highlight-color]').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { color: button.dataset.highlightColor, width: rect.width, height: rect.height };
  }));
  check('coarse-touch Zen opens color controls with 44px targets', await zenMarkerMenu.isVisible()
    && await zenMarker.getAttribute('aria-expanded') === 'true'
    && zenColorTargets.length === 4
    && zenColorTargets.every(target => target.width >= 44 && target.height >= 44), JSON.stringify(zenColorTargets));

  const zenMint = zenMarkerMenu.locator('[data-highlight-color="mint"]');
  await zenMint.focus();
  await zenMint.press('Enter');
  const zenColorState = await page.evaluate(() => ({
    saved: localStorage.getItem('readingRoom.highlightColor.v1'),
    trigger: document.getElementById('zenMarker').dataset.highlightColor,
    desktop: document.getElementById('highlightColorBtn').dataset.highlightColor,
    touch: document.getElementById('touchHighlight').dataset.highlightColor,
    zenPressed: document.querySelector('#zenMarkerMenu [data-highlight-color="mint"]').getAttribute('aria-pressed'),
    desktopPressed: document.querySelector('#highlightPalette [data-highlight-color="mint"]').getAttribute('aria-pressed'),
    markerMode: document.getElementById('highlightBtn').getAttribute('aria-pressed'),
    active: document.activeElement && document.activeElement.id
  }));
  check('Zen color choice closes, restores focus, and synchronizes without arming Marker',
    !(await zenMarkerMenu.isVisible()) && await zenMarker.getAttribute('aria-expanded') === 'false'
    && zenColorState.saved === 'mint' && zenColorState.trigger === 'mint'
    && zenColorState.desktop === 'mint' && zenColorState.touch === 'mint'
    && zenColorState.zenPressed === 'true' && zenColorState.desktopPressed === 'true'
    && zenColorState.markerMode === 'false' && zenColorState.active === 'zenMarker',
  JSON.stringify(zenColorState));

  const zenSelectedText = await selectPdfPassage(page);
  await page.waitForFunction(() => document.getElementById('zenMarker').classList.contains('ready'));
  const zenPendingState = await zenMarker.evaluate(button => ({
    label: button.getAttribute('aria-label'),
    expanded: button.getAttribute('aria-expanded'),
    controls: button.getAttribute('aria-controls')
  }));
  check('a pending Zen selection becomes one clear Mark action', !!zenSelectedText
    && /Highlight selected passage in Mint/.test(zenPendingState.label || '')
    && zenPendingState.expanded === null && zenPendingState.controls === null,
  JSON.stringify({ text: zenSelectedText, state: zenPendingState }));
  const zenCardClearance = await page.evaluate(() => {
    const card = document.getElementById('selectionCard').getBoundingClientRect();
    const dock = document.getElementById('zenDock').getBoundingClientRect();
    return { cardRight: card.right, dockLeft: dock.left, gap: dock.left - card.right };
  });
  check('the selection card stays clear of the Zen control rail', zenCardClearance.gap >= 10, JSON.stringify(zenCardClearance));
  await zenMarker.click();
  await page.waitForTimeout(120);
  const zenSavedHighlights = await storedPdfHighlights(page);
  check('one Zen Marker tap saves the existing selection in the chosen color', zenSavedHighlights.length === 1
    && zenSavedHighlights[0].text === zenSelectedText && zenSavedHighlights[0].color === 'mint',
  JSON.stringify(zenSavedHighlights));
  check('after saving, Zen Marker restores its accessible color-popup state',
    await zenMarker.getAttribute('aria-expanded') === 'false'
    && await zenMarker.getAttribute('aria-controls') === 'zenMarkerMenu'
    && (await zenMarker.getAttribute('aria-label') || '').includes('Open colors'));

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

  const fineContext = await browser.newContext({ viewport: { width: 1180, height: 780 }, hasTouch: false, isMobile: false, serviceWorkers: 'block' });
  const finePage = await fineContext.newPage();
  finePage.setDefaultTimeout(8000);
  finePage.on('pageerror', error => errors.push(error.message));
  /* Keep Escape in the document under test. WebKit otherwise consumes the first
     key at browser-fullscreen level before the reader can close its open popout. */
  await finePage.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
  });
  await finePage.addInitScript(seedReader);
  await finePage.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await finePage.waitForFunction(() => document.querySelector('#textDocument .original') && !document.getElementById('readerPage').classList.contains('hidden'));
  await finePage.click('#zenBtn');
  await finePage.waitForFunction(() => document.body.classList.contains('zen'));

  const fineZenMarker = finePage.locator('#zenMarker');
  const fineZenMarkerMenu = finePage.locator('#zenMarkerMenu');
  await fineZenMarker.focus();
  await fineZenMarker.press('Enter');
  const fineToggleState = await finePage.locator('#zenMarkerToggle').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return { visible: getComputedStyle(button).display !== 'none', width: rect.width, height: rect.height };
  });
  check('fine-pointer Zen exposes the persistent Marker toggle', fineToggleState.visible
    && fineToggleState.width >= 44 && fineToggleState.height >= 44, JSON.stringify(fineToggleState));
  await finePage.locator('#zenMarkerToggle').focus();
  await finePage.locator('#zenMarkerToggle').press('Enter');
  check('the fine-pointer Zen toggle synchronizes persistent Marker mode',
    await finePage.locator('#zenMarkerToggle').getAttribute('aria-pressed') === 'true'
    && await finePage.locator('#highlightBtn').getAttribute('aria-pressed') === 'true'
    && await finePage.locator('body').evaluate(body => body.classList.contains('marker-on')));

  await finePage.keyboard.press('Escape');
  const fineEscapeOnce = await finePage.evaluate(() => ({
    menuHidden: document.getElementById('zenMarkerMenu').classList.contains('hidden'),
    expanded: document.getElementById('zenMarker').getAttribute('aria-expanded'),
    markerPressed: document.getElementById('highlightBtn').getAttribute('aria-pressed'),
    active: document.activeElement && document.activeElement.id,
    zen: document.body.classList.contains('zen')
  }));
  check('Escape closes the open Zen Marker popup before disabling Marker', fineEscapeOnce.menuHidden
    && fineEscapeOnce.expanded === 'false' && fineEscapeOnce.markerPressed === 'true'
    && fineEscapeOnce.active === 'zenMarker' && fineEscapeOnce.zen, JSON.stringify(fineEscapeOnce));
  await finePage.keyboard.press('Escape');
  const fineEscapeTwice = await finePage.evaluate(() => ({
    markerPressed: document.getElementById('highlightBtn').getAttribute('aria-pressed'),
    markerClass: document.body.classList.contains('marker-on'),
    zen: document.body.classList.contains('zen')
  }));
  check('a second Escape disables persistent Marker while keeping Zen open', fineEscapeTwice.markerPressed === 'false'
    && !fineEscapeTwice.markerClass && fineEscapeTwice.zen, JSON.stringify(fineEscapeTwice));
  await fineContext.close();

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
  await keyboardContext.close();

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, serviceWorkers: 'block' });
  const phonePage = await phoneContext.newPage();
  phonePage.setDefaultTimeout(8000);
  phonePage.on('pageerror', error => errors.push(error.message));
  await phonePage.addInitScript(seedReader);
  await phonePage.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await phonePage.waitForFunction(() => document.querySelector('#textDocument .original') && !document.getElementById('readerPage').classList.contains('hidden'));
  await phonePage.evaluate(() => document.getElementById('zenBtn').click());
  await phonePage.click('#zenFind');
  const phoneFind = await phonePage.locator('#findBar').evaluate(bar => {
    const panel = bar.getBoundingClientRect(), input = document.getElementById('findInput'), previous = document.getElementById('findPrev').getBoundingClientRect(), next = document.getElementById('findNext').getBoundingClientRect();
    return { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: innerWidth, height: innerHeight, inputFont: parseFloat(getComputedStyle(input).fontSize), previous: { width: previous.width, height: previous.height }, next: { width: next.width, height: next.height } };
  });
  check('phone Zen Find stays onscreen with keyboard-safe text and touch targets', phoneFind.left >= -0.5 && phoneFind.top >= -0.5 && phoneFind.right <= phoneFind.width + 0.5 && phoneFind.bottom <= phoneFind.height + 0.5 && phoneFind.inputFont >= 16 && phoneFind.previous.width >= 44 && phoneFind.previous.height >= 44 && phoneFind.next.width >= 44 && phoneFind.next.height >= 44, JSON.stringify(phoneFind));
  await phonePage.fill('#findInput', 'Paragraph');
  await phonePage.waitForFunction(() => /\d+\s*\/\s*\d+/.test(document.getElementById('findCount').textContent) && !!document.querySelector('.find-target'));
  check('phone Find searches without leaving Zen', await phonePage.evaluate(() => document.body.classList.contains('zen')));
  await phoneContext.close();

  check('Zen and iPad controls have no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
