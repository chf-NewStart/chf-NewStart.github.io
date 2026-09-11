let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_IPAD_DOCK_TEST_PORT || 8147);
const PDF = path.join(ROOT, 'assets', 'phloem-guide', 'phloem-field-guide.pdf');
const ACTION_SELECTORS = {
  guide: '#touchGuide, [data-touch-action="guide"]',
  highlight: '#touchHighlight, [data-touch-action="highlight"]',
  notes: '#touchNotes, [data-touch-action="notes"]',
  more: '#touchMore, [data-touch-action="more"]'
};

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

function seedReader() {
  if (sessionStorage.getItem('phloem.ipadDockFixtureSeeded') === '1') return;
  sessionStorage.setItem('phloem.ipadDockFixtureSeeded', '1');
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
  localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({
    pdfLayout: 'scroll', guideOrientation: 'row', focus: false, guideDim: 60
  }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '1');
  localStorage.removeItem('readingRoom.lastOpen.v1');
  localStorage.removeItem('readingRoom.touchNotesPinned.v1');
}

/* Headless Chromium has no software keyboard. Mirror iPadOS's visualViewport
   contract so the real note panel and focus code still have to move the editor
   above the covered part of the screen. */
function installVisualViewportMock() {
  const listeners = { resize: new Set(), scroll: new Set() };
  const viewport = {
    width: innerWidth,
    height: innerHeight,
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

async function openFixture(page) {
  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.setInputFiles('#pdfFile', PDF);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    return canvas && canvas.width > 0 && document.getElementById('pdfFrame').dataset.positionReady === 'true'
      && !document.getElementById('readerPage').classList.contains('hidden');
  });
}

async function isVisible(page, selector) {
  const locator = page.locator(selector).first();
  return await locator.count() > 0 && await locator.isVisible();
}

async function readingPlace(page) {
  return page.evaluate(() => {
    const pane = document.getElementById('documentPane');
    const paneRect = pane.getBoundingClientRect();
    const label = document.getElementById('pageNumber').textContent.trim();
    const pageNumber = +(label.match(/^\d+/) || [1])[0];
    const holder = document.querySelector('.pdf-page[data-page="' + pageNumber + '"]') || document.querySelector('.pdf-page');
    const canvas = holder && holder.querySelector('canvas');
    const holderRect = holder && holder.getBoundingClientRect();
    const canvasRect = canvas && canvas.getBoundingClientRect();
    return {
      label,
      paneWidth: pane.clientWidth,
      paneScrollTop: pane.scrollTop,
      paneScrollLeft: pane.scrollLeft,
      page: pageNumber,
      pageWidth: holderRect ? holderRect.width : 0,
      canvasWidth: canvasRect ? canvasRect.width : 0,
      bitmapWidth: canvas ? canvas.width : 0,
      /* Compare the passage under Phloem's visual reading anchor, not the fraction of
         paper hidden above the viewport. The latter necessarily changes when pinning
         notes narrows and rescales a page even though the same words stay in place. */
      withinPage: holderRect && holderRect.height ? (paneRect.top + pane.clientHeight * .4 - holderRect.top) / holderRect.height : 0
    };
  });
}

function sameReadingPlace(before, after) {
  return before.label === after.label
    && before.page === after.page
    && Math.abs(before.paneScrollTop - after.paneScrollTop) <= 2
    && Math.abs(before.paneScrollLeft - after.paneScrollLeft) <= 2
    && Math.abs(before.withinPage - after.withinPage) <= .01;
}

function samePaperSize(before, after) {
  return Math.abs(before.paneWidth - after.paneWidth) <= 1
    && Math.abs(before.pageWidth - after.pageWidth) <= 1
    && Math.abs(before.canvasWidth - after.canvasWidth) <= 1
    && before.bitmapWidth === after.bitmapWidth;
}

async function placeOnSecondPage(page) {
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"]'));
  await page.evaluate(() => {
    const pane = document.getElementById('documentPane');
    const holder = document.querySelector('.pdf-page[data-page="2"]');
    pane.scrollTop = holder.offsetTop + holder.offsetHeight * .18;
    pane.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => /^2\s*\//.test(document.getElementById('pageNumber').textContent.trim()));
  await page.waitForTimeout(180);
}

async function noteOverlayState(page) {
  return page.evaluate(() => {
    const notebook = document.getElementById('notebook');
    const pane = document.getElementById('documentPane');
    const layout = document.getElementById('readerLayout');
    const style = getComputedStyle(notebook);
    const noteRect = notebook.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(noteRect.right, paneRect.right) - Math.max(noteRect.left, paneRect.left));
    const overlapHeight = Math.max(0, Math.min(noteRect.bottom, paneRect.bottom) - Math.max(noteRect.top, paneRect.top));
    return {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && noteRect.width > 0 && noteRect.height > 0,
      position: style.position,
      overlap: overlapWidth * overlapHeight,
      layoutWidth: layout.getBoundingClientRect().width,
      paneWidth: paneRect.width,
      noteRect: { left: noteRect.left, right: noteRect.right, top: noteRect.top, bottom: noteRect.bottom }
    };
  });
}

async function pinnedPanelState(page) {
  return page.evaluate(() => {
    const notebook = document.getElementById('notebook');
    const pane = document.getElementById('documentPane');
    const layout = document.getElementById('readerLayout');
    const style = getComputedStyle(notebook);
    const noteRect = notebook.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && noteRect.width > 0 && noteRect.height > 0,
      position: style.position,
      beside: noteRect.left >= paneRect.right - 2 || noteRect.right <= paneRect.left + 2,
      layoutWidth: layout.getBoundingClientRect().width,
      paneWidth: paneRect.width,
      noteWidth: noteRect.width,
      bodyOverlay: document.body.classList.contains('tablet-notes-overlay'),
      bodyPinned: document.body.classList.contains('tablet-notes-pinned'),
      sheetOpen: notebook.classList.contains('sheet-open')
    };
  });
}

async function dockPhysicalSide(page) {
  return page.locator('#touchDock').evaluate(dock => {
    const rect = dock.getBoundingClientRect();
    return {
      side: rect.left + rect.width / 2 < innerWidth / 2 ? 'left' : 'right',
      edgeGap: Math.min(rect.left, innerWidth - rect.right),
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    };
  });
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  const errors = [];

  const tabletContext = await browser.newContext({
    viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 2, serviceWorkers: 'block'
  });
  const tablet = await tabletContext.newPage();
  tablet.setDefaultTimeout(12000);
  tablet.on('pageerror', error => errors.push('tablet: ' + error.message));
  await tablet.addInitScript(installVisualViewportMock);
  await tablet.addInitScript(seedReader);
  await openFixture(tablet);

  const capabilities = await tablet.evaluate(() => ({
    width: innerWidth,
    coarse: matchMedia('(pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints
  }));
  /* Playwright WebKit exposes coarse touch media but reports maxTouchPoints as zero;
     either signal is sufficient for the production tablet path. */
  check('the tablet fixture is a >720px coarse-pointer reader', capabilities.width > 720 && capabilities.coarse, JSON.stringify(capabilities));

  const dockVisible = await isVisible(tablet, '#touchDock');
  check('a coarse-pointer iPad gets the compact reading dock even above the phone breakpoint', dockVisible);
  check('the old phone paging bar stays hidden on a tablet', !(await tablet.locator('#mobileBar').isVisible()));

  const actionState = {};
  for (const [name, selector] of Object.entries(ACTION_SELECTORS)) {
    actionState[name] = await isVisible(tablet, selector);
  }
  check('the dock exposes Guide, Highlight, Notes, and More without opening another tray', Object.values(actionState).every(Boolean), JSON.stringify(actionState));

  if (dockVisible && Object.values(actionState).every(Boolean)) {
    const dockMetrics = await tablet.locator('#touchDock').evaluate((dock, selectors) => {
      const actions = {};
      for (const [name, selector] of Object.entries(selectors)) {
        const button = dock.querySelector(selector);
        const rect = button && button.getBoundingClientRect();
        actions[name] = button && rect ? {
          width: rect.width, height: rect.height,
          name: (button.getAttribute('aria-label') || button.textContent || '').trim()
        } : null;
      }
      const rect = dock.getBoundingClientRect();
      return { actions, dock: { width: rect.width, height: rect.height } };
    }, ACTION_SELECTORS);
    check('every primary dock action has a 44–48px-class touch target', Object.values(dockMetrics.actions).every(item => item && item.width >= 44 && item.height >= 44 && item.width <= 56 && item.height <= 56), JSON.stringify(dockMetrics.actions));
    check('all four dock actions retain readable accessible names', Object.entries(dockMetrics.actions).every(([name, item]) => item && item.name.toLowerCase().includes(name)), JSON.stringify(dockMetrics.actions));

    await tablet.locator(ACTION_SELECTORS.guide).first().click();
    check('the dock Guide action controls the existing reading guide state', await tablet.locator('#focusBtn').getAttribute('aria-pressed') === 'true' && await tablet.locator(ACTION_SELECTORS.guide).first().getAttribute('aria-pressed') === 'true');
    await tablet.locator(ACTION_SELECTORS.guide).first().click();

    await tablet.locator(ACTION_SELECTORS.highlight).first().click();
    check('the dock Highlight action controls the existing marker state', await tablet.locator('#highlightBtn').getAttribute('aria-pressed') === 'true' && await tablet.locator(ACTION_SELECTORS.highlight).first().getAttribute('aria-pressed') === 'true');
    await tablet.locator(ACTION_SELECTORS.highlight).first().click();

    const initialSide = await dockPhysicalSide(tablet);
    check('the dock rests against one reachable side instead of floating over the paper', initialSide.edgeGap <= 20, JSON.stringify(initialSide));
    await tablet.locator(ACTION_SELECTORS.more).first().click();
    const sideControl = tablet.locator('#touchDockMove, #touchDockSide, [data-touch-dock-move], [data-touch-dock-side]').first();
    const sideControlVisible = await sideControl.count() > 0 && await sideControl.isVisible();
    check('More offers an explicit control for moving the dock to the other hand', sideControlVisible && await tablet.locator(ACTION_SELECTORS.more).first().getAttribute('aria-expanded') === 'true');
    check('opening More moves keyboard focus into its dialog', await tablet.locator('#touchDockMenu').evaluate(menu => menu.contains(document.activeElement)));
    await tablet.keyboard.press('Escape');
    check('Escape closes More and returns focus to its trigger', !await tablet.locator('#touchDockMenu').isVisible() && await tablet.locator('#touchMore').evaluate(button => document.activeElement === button));

    await tablet.locator(ACTION_SELECTORS.more).first().click();
    const beforeSettings = await readingPlace(tablet);
    await tablet.locator('#touchSettings').click();
    await tablet.waitForTimeout(120);
    const settingsState = await tablet.locator('#comfortBar').evaluate(bar => {
      const style = getComputedStyle(bar);
      const rect = bar.getBoundingClientRect();
      const targets = Array.from(bar.querySelectorAll('button:not([disabled]), input:not([disabled])')).filter(element => element.offsetParent !== null).map(element => {
        const target = element.getBoundingClientRect();
        return { id: element.id, width: target.width, height: target.height };
      });
      return { visible: style.display !== 'none' && rect.width > 0 && rect.height > 0, position: style.position, role: bar.getAttribute('role'), focused: bar.contains(document.activeElement), targets };
    });
    const openSettings = await readingPlace(tablet);
    check('Reading settings open as an adaptive overlay without moving or resizing the PDF', settingsState.visible && ['fixed', 'absolute'].includes(settingsState.position) && samePaperSize(beforeSettings, openSettings) && sameReadingPlace(beforeSettings, openSettings), JSON.stringify({ settingsState, beforeSettings, openSettings }));
    check('tablet settings expose dialog semantics and move focus inside', settingsState.role === 'dialog' && settingsState.focused, JSON.stringify(settingsState));
    check('visible tablet settings controls meet the 44px touch target', settingsState.targets.length > 0 && settingsState.targets.every(target => target.width >= 44 && target.height >= 44), JSON.stringify(settingsState.targets));
    await tablet.keyboard.press('Escape');
    check('Escape closes settings and returns focus to the dock trigger', !await tablet.locator('#comfortBar').isVisible() && await tablet.locator('#touchMore').evaluate(button => document.activeElement === button));

    await tablet.locator(ACTION_SELECTORS.more).first().click();
    if (sideControlVisible) {
      await sideControl.click();
      await tablet.waitForTimeout(120);
      const movedSide = await dockPhysicalSide(tablet);
      check('the side control visibly moves the dock to the opposite edge', movedSide.side !== initialSide.side && movedSide.edgeGap <= 20, JSON.stringify({ initialSide, movedSide }));

      await tablet.reload({ waitUntil: 'load' });
      await tablet.waitForFunction(() => document.querySelector('.pdf-page canvas')?.width > 0
        && document.getElementById('pdfFrame').dataset.positionReady === 'true'
        && !document.getElementById('readerPage').classList.contains('hidden'));
      const restoredSide = await dockPhysicalSide(tablet);
      check('the preferred dock side survives a reload', restoredSide.side === movedSide.side && restoredSide.edgeGap <= 20, JSON.stringify({ movedSide, restoredSide }));
    }

    await placeOnSecondPage(tablet);
    const beforeNotes = await readingPlace(tablet);
    await tablet.locator(ACTION_SELECTORS.notes).first().click();
    await tablet.waitForTimeout(340);
    const landscapeOverlay = await noteOverlayState(tablet);
    const openNotes = await readingPlace(tablet);
    check('Notes opens as a temporary overlay above the tablet paper', landscapeOverlay.visible && (landscapeOverlay.position === 'fixed' || landscapeOverlay.position === 'absolute') && landscapeOverlay.overlap > 0, JSON.stringify(landscapeOverlay));
    check('opening Notes does not resize or rerender the PDF', samePaperSize(beforeNotes, openNotes), JSON.stringify({ beforeNotes, openNotes }));
    check('opening Notes keeps the exact page and reading position', sameReadingPlace(beforeNotes, openNotes), JSON.stringify({ beforeNotes, openNotes }));
    check('the dock reports that Notes is open', await tablet.locator(ACTION_SELECTORS.notes).first().getAttribute('aria-expanded') === 'true');
    check('temporary Notes use dialog semantics and move focus inside', await tablet.locator('#notebook').getAttribute('role') === 'dialog' && await tablet.locator('#notebook').getAttribute('aria-modal') === 'true' && await tablet.locator('#notebook').evaluate(notebook => notebook.contains(document.activeElement)));
    await tablet.keyboard.press('Escape');
    await tablet.waitForTimeout(340);
    check('Escape closes temporary Notes and returns focus to Notes', !await tablet.locator('#notebook').isVisible() && await tablet.locator(ACTION_SELECTORS.notes).first().evaluate(button => document.activeElement === button));
    await tablet.locator(ACTION_SELECTORS.notes).first().click();
    await tablet.waitForTimeout(340);

    await tablet.fill('#pageNote', 'Keep this quick note and its source passage visible above the iPad keyboard.');
    await tablet.focus('#pageNote');
    await tablet.evaluate(() => window.__setVisualViewport({ width: 1024, height: 420, offsetTop: 18 }));
    await tablet.waitForFunction(() => document.body.classList.contains('keyboard-open'));
    await tablet.waitForTimeout(140);
    const keyboardFit = await tablet.evaluate(() => {
      const viewport = window.visualViewport;
      const editor = document.getElementById('pageNote');
      const notebook = document.getElementById('notebook');
      const editorRect = editor.getBoundingClientRect();
      const notebookRect = notebook.getBoundingClientRect();
      return {
        viewport: { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height, height: viewport.height },
        editor: { top: editorRect.top, bottom: editorRect.bottom, fontSize: parseFloat(getComputedStyle(editor).fontSize) },
        notebook: { top: notebookRect.top, bottom: notebookRect.bottom },
        active: document.activeElement && document.activeElement.id,
        inset: getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim()
      };
    });
    check('the focused page-note editor remains inside the visible iPad viewport above the keyboard', keyboardFit.active === 'pageNote' && keyboardFit.editor.top >= keyboardFit.viewport.top - 1 && keyboardFit.editor.bottom <= keyboardFit.viewport.bottom + 1, JSON.stringify(keyboardFit));
    check('the temporary notebook rises above the keyboard without triggering iOS focus zoom', keyboardFit.notebook.bottom <= keyboardFit.viewport.bottom + 1 && keyboardFit.editor.fontSize >= 16 && keyboardFit.inset !== '0px', JSON.stringify(keyboardFit));
    await tablet.locator('#pageNote').evaluate(editor => editor.blur());
    await tablet.evaluate(() => window.__setVisualViewport({ width: 1024, height: 768, offsetTop: 0 }));
    await tablet.waitForFunction(() => !document.body.classList.contains('keyboard-open'));

    await tablet.locator(ACTION_SELECTORS.notes).first().click();
    await tablet.waitForTimeout(340);
    const closedNotes = await readingPlace(tablet);
    const closedOverlay = await noteOverlayState(tablet);
    check('a second Notes tap closes the temporary panel', !closedOverlay.visible && await tablet.locator(ACTION_SELECTORS.notes).first().getAttribute('aria-expanded') === 'false', JSON.stringify(closedOverlay));
    check('closing Notes returns to the unchanged reading place and scale', samePaperSize(beforeNotes, closedNotes) && sameReadingPlace(beforeNotes, closedNotes), JSON.stringify({ beforeNotes, closedNotes }));

    const defaultTabletMode = await tablet.locator('body').evaluate(body => ({ overlay: body.classList.contains('tablet-notes-overlay'), pinned: body.classList.contains('tablet-notes-pinned') }));
    check('wide landscape still defaults to temporary Notes until the reader explicitly pins it', defaultTabletMode.overlay && !defaultTabletMode.pinned, JSON.stringify(defaultTabletMode));
    await tablet.locator(ACTION_SELECTORS.more).first().click();
    const pinControl = tablet.locator('#touchPinNotes, [data-touch-pin-notes]').first();
    const pinAvailable = await pinControl.count() > 0 && await pinControl.isVisible();
    check('wide-landscape More offers an explicit Keep notes beside page action', pinAvailable && await pinControl.getAttribute('aria-pressed') === 'false');

    if (pinAvailable) {
      const beforePin = await readingPlace(tablet);
      await pinControl.click();
      await tablet.waitForFunction(() => document.body.classList.contains('tablet-notes-pinned') && document.getElementById('documentPane').clientWidth < innerWidth - 200);
      await tablet.waitForTimeout(520);
      const pinnedPanel = await pinnedPanelState(tablet);
      const pinnedPlace = await readingPlace(tablet);
      check('pinning creates a genuine notes column beside the PDF only after that action', pinnedPanel.visible && pinnedPanel.bodyPinned && !pinnedPanel.bodyOverlay && pinnedPanel.beside && pinnedPanel.paneWidth < pinnedPanel.layoutWidth - 200, JSON.stringify(pinnedPanel));
      check('the pin action clearly reports its selected state', await pinControl.getAttribute('aria-pressed') === 'true');
      check('pinning keeps the current page and relative reading place while deliberately narrowing it', pinnedPlace.page === beforePin.page && Math.abs(pinnedPlace.withinPage - beforePin.withinPage) <= .03 && pinnedPlace.pageWidth < beforePin.pageWidth - 100, JSON.stringify({ beforePin, pinnedPlace }));

      await tablet.setViewportSize({ width: 768, height: 1024 });
      await tablet.evaluate(() => window.__setVisualViewport({ width: 768, height: 1024, offsetTop: 0 }));
      await tablet.waitForFunction(() => innerWidth === 768 && document.body.classList.contains('tablet-notes-overlay') && !document.body.classList.contains('tablet-notes-pinned') && document.querySelector('.pdf-page canvas')?.width > 0);
      await tablet.waitForTimeout(520);
      check('portrait iPad keeps the touch dock instead of falling back to desktop controls', await tablet.locator('#touchDock').isVisible());
      const portraitOverlay = await noteOverlayState(tablet);
      const portraitOpen = await readingPlace(tablet);
      check('a pinned landscape notebook automatically falls back to a temporary portrait overlay', portraitOverlay.visible && (portraitOverlay.position === 'fixed' || portraitOverlay.position === 'absolute') && portraitOverlay.overlap > 0 && portraitOverlay.paneWidth >= portraitOverlay.layoutWidth - 2, JSON.stringify(portraitOverlay));
      check('portrait fallback restores full PDF width without losing the current page', portraitOpen.page === pinnedPlace.page && portraitOpen.paneWidth >= 766 && portraitOpen.pageWidth > pinnedPlace.pageWidth + 100, JSON.stringify({ pinnedPlace, portraitOpen }));
      check('the unavailable side-by-side choice is hidden in portrait', await pinControl.evaluate(button => button.classList.contains('hidden')));

      await tablet.setViewportSize({ width: 1024, height: 768 });
      await tablet.evaluate(() => window.__setVisualViewport({ width: 1024, height: 768, offsetTop: 0 }));
      await tablet.waitForFunction(() => innerWidth === 1024 && document.body.classList.contains('tablet-notes-pinned') && document.getElementById('documentPane').clientWidth < innerWidth - 200);
      await tablet.waitForTimeout(520);
      const restoredPin = await pinnedPanelState(tablet);
      check('returning to wide landscape restores the reader’s explicit pinned preference', restoredPin.visible && restoredPin.bodyPinned && restoredPin.beside, JSON.stringify(restoredPin));

      await tablet.locator(ACTION_SELECTORS.more).first().click();
      check('wide landscape offers Use temporary notes while pinned', await pinControl.isVisible() && await pinControl.getAttribute('aria-pressed') === 'true');
      const beforeUnpin = await readingPlace(tablet);
      await pinControl.click();
      await tablet.waitForFunction(() => document.body.classList.contains('tablet-notes-overlay') && document.getElementById('notebook').classList.contains('sheet-open') && document.getElementById('documentPane').clientWidth === innerWidth);
      await tablet.waitForTimeout(520);
      const unpinnedOverlay = await noteOverlayState(tablet);
      const unpinnedPlace = await readingPlace(tablet);
      check('unpinning restores the open temporary overlay instead of closing Notes', unpinnedOverlay.visible && (unpinnedOverlay.position === 'fixed' || unpinnedOverlay.position === 'absolute') && unpinnedOverlay.overlap > 0 && await pinControl.getAttribute('aria-pressed') === 'false', JSON.stringify(unpinnedOverlay));
      check('unpinning returns the PDF to full landscape width and keeps the page', samePaperSize(beforePin, unpinnedPlace) && unpinnedPlace.page === beforeUnpin.page, JSON.stringify({ beforePin, beforeUnpin, unpinnedPlace }));
      await tablet.locator(ACTION_SELECTORS.notes).first().click();
    }
  }
  await tabletContext.close();

  const desktopContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: false, isMobile: false, serviceWorkers: 'block' });
  const desktop = await desktopContext.newPage();
  desktop.setDefaultTimeout(12000);
  desktop.on('pageerror', error => errors.push('desktop: ' + error.message));
  await desktop.addInitScript(seedReader);
  await openFixture(desktop);
  const desktopState = await desktop.evaluate(() => ({
    fine: matchMedia('(pointer: fine)').matches,
    touchDockVisible: !!document.getElementById('touchDock') && getComputedStyle(document.getElementById('touchDock')).display !== 'none',
    mobileBarVisible: getComputedStyle(document.getElementById('mobileBar')).display !== 'none',
    guideVisible: getComputedStyle(document.getElementById('focusBtn')).display !== 'none',
    markerVisible: getComputedStyle(document.getElementById('highlightBtn')).display !== 'none'
  }));
  check('the desktop fixture uses a fine pointer', desktopState.fine, JSON.stringify(desktopState));
  check('fine-pointer desktop keeps its existing toolbar without the touch dock or phone bar', !desktopState.touchDockVisible && !desktopState.mobileBarVisible && desktopState.guideVisible && desktopState.markerVisible, JSON.stringify(desktopState));

  check('the touch dock workflow has no page errors', errors.length === 0, errors.join('; '));
  await desktopContext.close();
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
