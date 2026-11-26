/* Whole-board PDF capture keeps quotes, Unicode notes and ink beyond the viewport.
   Run with PHLOEM_BROWSER=webkit for the iPad engine. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const root = path.resolve(__dirname, '..');
const engine = process.env.PHLOEM_BROWSER || 'chromium';
const server = http.createServer((request, response) => {
  const file = path.join(root, decodeURIComponent(request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0]));
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright[engine].launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/reading.html`);
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([612, 792]).drawText('Workspace PDF fixture', { x: 40, y: 700, font, size: 18 });
    await page.locator('#pdfFile').setInputFiles({ name: 'workspace-pdf-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await page.waitForFunction(() => document.body.classList.contains('zen') && document.querySelector('.pdf-page canvas')?.width > 0);
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('readingRoom.v1'));
      const id = localStorage.getItem('readingRoom.lastOpen.v1');
      const chapter = saved.chapters.find(item => item.id === id), t = Date.now() - 60000;
      chapter.title = 'Phloem transport PDF';
      const note = (id, quote, text) => ({ id, quote, note: text, anchor: { kind: 'pdf', page: 1 }, createdAt: t, updatedAt: t });
      chapter.readingExcerpts = { version: 1, deleted: {}, items: [
        note('near-note', 'Quote on the board', 'Retained mineral demand'),
        note('far-note', '', '番茄的矿物质需求 - Δt × rate'),
      ] };
      chapter.readingWorkspace = { version: 3, width: 3000, height: 4000, deleted: {},
        positions: { 'near-note': { x: 40, y: 50, width: 420, updatedAt: t }, 'far-note': { x: 1800, y: 1900, width: 420, updatedAt: t } },
        strokes: [{ id: 'far-ink', color: 'black', width: 2.4, points: [[2100, 2800, .5], [2500, 2850, .7]], style: 'natural', createdAt: t, updatedAt: t }] };
      localStorage.setItem('readingRoom.v1', JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForFunction(() => document.body.classList.contains('zen') && document.querySelector('.pdf-page canvas')?.width > 0);
    await page.locator('#zenWorkspace').click();
    await page.locator('#workspaceBoard').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#workspaceCards .workspace-card').length === 2);
    const before = await page.evaluate(() => ({ saved: localStorage.getItem('readingRoom.v1'), width: document.getElementById('workspaceBoard').clientWidth }));
    const geometry = await page.evaluate(() => window.prepareNotebookWhiteboardExport());
    assert.equal(geometry.cardCount, 2, 'all cards, including a card outside the live viewport');
    assert.equal(geometry.strokeCount, 1, 'handwriting is included');
    assert(geometry.width > 1000 && geometry.height > 1000, 'export covers the expanded board');
    assert(await page.locator('#whiteboardExportRoot').innerText().then(text => text.includes('番茄的矿物质需求')), 'Unicode notes remain text');
    await page.evaluate(() => window.setNotebookWhiteboardExportTile({ x: 0, y: 0, width: 600, height: 388, scale: 1 }));
    assert.equal(await page.locator('#whiteboardExportRoot').evaluate(node => Math.round(node.getBoundingClientRect().width)), 600);
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    assert.equal(await page.locator('#whiteboardExportInk path[data-ink-color="black"]').evaluate(node => getComputedStyle(node).fill), 'rgb(32, 49, 59)', 'dark-theme black ink remains visible on exported white paper');
    await page.evaluate(() => window.finishNotebookWhiteboardExport());
    assert.equal(await page.locator('#whiteboardExportRoot').count(), 0);
    assert.equal(await page.locator('#workspaceBoard').evaluate(node => node.clientWidth), before.width, 'export does not resize or grow the live board');
    assert.equal(await page.evaluate(() => localStorage.getItem('readingRoom.v1')), before.saved, 'export does not change stored notes or ink');

    /* The website's path: a print window with Save as PDF. It prints the occupied part of
       the board on as many pages as it needs, not only the first page of the reader's
       fixed body. print() is stubbed; Chromium prints the window to a PDF for the text. */
    await page.evaluate(() => {
      window.__printed = 0; const open = window.open;
      window.open = function () { const popup = open.apply(this, arguments); window.__printWindow = popup; if (popup) popup.print = () => { window.__printed++; }; return popup; };
    });
    const popupPromise = context.waitForEvent('page');
    await page.locator('#workspaceMore > summary').click();
    await page.locator('#workspaceExportPDF').click();
    const popup = await popupPromise;
    await page.waitForFunction(() => window.__printed > 0);
    assert.match(await page.locator('#workspaceStatus').textContent(), /Save as PDF/);
    const printed = await popup.evaluate(() => {
      const area = document.querySelector('.workspace-print-area').getBoundingClientRect();
      const inside = Array.from(document.querySelectorAll('.workspace-card, .workspace-ink path')).map(node => node.getBoundingClientRect())
        .every(rect => rect.left >= area.left - 1 && rect.top >= area.top - 1 && rect.right <= area.right + 1 && rect.bottom <= area.bottom + 1);
      return { body: getComputedStyle(document.body).position, bodyClass: document.body.className, inside, cards: document.querySelectorAll('.workspace-card').length,
        ink: document.querySelectorAll('.workspace-ink path').length, area: [area.width, area.height], board: [document.querySelector('.workspace-board').offsetWidth, document.querySelector('.workspace-board').offsetHeight] };
    });
    assert.equal(printed.body, 'static', 'the print window body is not fixed to the window');
    assert.equal(printed.bodyClass, '', 'the reader body classes stay in the reader');
    assert.equal(printed.cards, 2); assert.equal(printed.ink, 1);
    assert(printed.inside, 'every card and stroke is inside the printed area: ' + JSON.stringify(printed));
    assert(printed.area[0] < printed.board[0] && printed.area[1] < printed.board[1], 'the print is cropped to the occupied board: ' + JSON.stringify(printed));
    if (engine === 'chromium') {
      const bytes = await popup.pdf({ format: 'A4', landscape: true });
      const pages = await page.evaluate(async base64 => {
        const lib = await import('/vendor/pdfjs/pdf.min.js'); lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.compat.js';
        const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), pdf = await lib.getDocument({ data }).promise, text = [];
        for (let n = 1; n <= pdf.numPages; n++) text.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join(' '));
        return text;
      }, bytes.toString('base64'));
      const all = pages.join(' ').replace(/\s+/g, '');
      assert(/Retainedmineraldemand/.test(all) && /番茄的矿物质需求/.test(all), 'the printed PDF holds the near and the far note: ' + JSON.stringify(pages).slice(0, 400));
    }
    await popup.close();
    assert.equal(await page.evaluate(() => localStorage.getItem('readingRoom.v1')), before.saved, 'printing does not change stored notes or ink');

    // Exercise the real menu handler with the native plugin boundary mocked.
    await page.evaluate(() => {
      window.PHLOEM_NATIVE = true;
      window.Capacitor = { Plugins: { PhloemWorkspaceExport: { exportPDF: async options => { window.pdfExportCall = options; return { shared: true }; } } } };
    });
    await page.locator('#workspaceMore > summary').click();
    await page.locator('#workspaceExportPDF').click();
    await page.waitForFunction(() => window.pdfExportCall?.title === 'Workspace - Phloem transport PDF');
    assert.match(await page.locator('#workspaceStatus').textContent(), /PDF shared/);
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.waitForFunction(() => document.body.classList.contains('workspace-bottom'));
    const paperBox = await page.locator('#documentPane').boundingBox();
    const boardBox = await page.locator('#workspacePanel').boundingBox();
    assert(boardBox.y >= paperBox.y + paperBox.height - 2, 'portrait keeps the whiteboard docked below the visible paper');
    assert(paperBox.height > 100 && boardBox.height > 100, 'both reading and whiteboard remain visible');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine}: full board, Unicode notes, ink, dark theme, browser print window, native export action, saved-state preservation, portrait bottom dock`);
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
