/* With the Workspace split open, the Zen rail sits on the divider. Opening Reading settings
   on an Android tablet drew the rail's buttons (⇅, Undo, Workspace, the grip) on top of the
   sheet, showing through it (tester screenshots, Oct 2026). Every sheet that can open over
   the split now covers the rail and the divider cleanly; once it closes, the rail is back
   on top and works, its own menus still open above everything, and Zen without the
   Workspace keeps the rail as it was. Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0;
function check(name, condition, extra) { checks++; assert.ok(condition, name + (extra === undefined ? '' : ' [' + JSON.stringify(extra) + ']')); console.log('PASS  ' + name); }

const server = http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0]), file = path.join(ROOT, url === '/' ? 'reading.html' : url);
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});
async function makePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) doc.addPage([612, 792]).drawText('Sugar moves from source to sink in the phloem, page ' + i, { x: 60, y: 700, size: 14, font });
  return Buffer.from(await doc.save());
}
// The rail's buttons and the divider grip whose centres a sheet covers, and what is on top there.
const covered = (page, sheetSelector) => page.evaluate(selector => {
  const sheet = document.querySelector(selector), box = sheet.getBoundingClientRect();
  return [...document.querySelectorAll('#zenDock > .zen-tool > button, #zenDock > button, #workspaceDividerGrip')].filter(el => el.getClientRects().length).map(el => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
    const hit = document.elementFromPoint(x, y);
    return { id: el.id, sheetOnTop: !!hit && sheet.contains(hit) };
  }).filter(Boolean);
}, sheetSelector);
const onTop = (page, ids) => page.evaluate(ids => ids.map(id => { const el = document.getElementById(id), r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id, ok: !!hit && el.contains(hit), visible: getComputedStyle(el).visibility === 'visible' && r.width > 0 }; }), ids);

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  try {
    // The tester's Android tablet in landscape, in CSS pixels.
    const page = await (await browser.newContext({ viewport: { width: 1000, height: 560 }, serviceWorkers: 'block' })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/reading.html`);
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    await page.locator('#pdfFile').setInputFiles({ name: 'munch.pdf', mimeType: 'application/pdf', buffer: await makePdf() });
    await page.waitForFunction(() => !!document.querySelector('#pdfFrame canvas') && document.body.classList.contains('zen'));
    await page.waitForTimeout(500);
    const aloneZ = await page.evaluate(() => getComputedStyle(document.getElementById('zenDock')).zIndex);
    await page.click('#zenWorkspace'); await page.locator('#workspacePanel').waitFor({ state: 'visible' }); await page.waitForTimeout(500);
    check('the Workspace opens beside the paper with the rail on the divider', await page.evaluate(() => document.body.classList.contains('workspace-side')));
    const rail = ['zenMore', 'zenWorkspace', 'zenUndo', 'zenLayout'];
    check('with nothing open, the rail is on top and visible', (await onTop(page, rail)).every(b => b.ok && b.visible), await onTop(page, rail));

    // Reading settings, from the ••• menu as on the tablet.
    await page.click('#zenMore'); await page.click('#zenSettings');
    await page.waitForFunction(() => !document.getElementById('comfortBar').classList.contains('hidden')); await page.waitForTimeout(250);
    let hits = await covered(page, '#comfortBar');
    check('Reading settings covers the divider controls it overlaps', hits.length >= 3 && hits.every(h => h.sheetOnTop), hits);
    await page.click('#comfortClose'); await page.waitForTimeout(250);
    check('after closing, the divider controls are visible and on top again', (await onTop(page, rail)).every(b => b.ok && b.visible), await onTop(page, rail));
    await page.click('#zenMore'); await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    check('and the rail still works: ••• opens its menu above the paper and the Workspace', (await onTop(page, ['zenNotebook', 'zenSettings'])).every(b => b.ok));

    // The Notebook.
    await page.click('#zenNotebook'); await page.locator('#notebook').waitFor({ state: 'visible' }); await page.waitForTimeout(250);
    hits = await covered(page, '#notebook');
    const splitWithNotebook = await page.evaluate(() => document.body.classList.contains('workspace-open'));
    check('the Notebook either replaces the split or covers the divider controls it overlaps', !splitWithNotebook || hits.every(h => h.sheetOnTop), hits);
    await page.click('#sheetClose'); await page.waitForTimeout(250);
    if (!await page.evaluate(() => document.body.classList.contains('workspace-open'))) { await page.click('#zenWorkspace'); await page.locator('#workspacePanel').waitFor({ state: 'visible' }); await page.waitForTimeout(400); }

    // Find.
    await page.click('#zenMore'); await page.click('#zenFind'); await page.locator('#findBar').waitFor({ state: 'visible' }); await page.waitForTimeout(250);
    hits = await covered(page, '#findBar');
    check('Find, opened over the split, never sits under the rail', await page.evaluate(() => document.body.classList.contains('workspace-open')) && hits.every(h => h.sheetOnTop), hits);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    if (!await page.evaluate(() => document.body.classList.contains('workspace-open'))) { await page.click('#zenWorkspace'); await page.locator('#workspacePanel').waitFor({ state: 'visible' }); await page.waitForTimeout(400); }

    // The divider still resizes from its grip once the sheets are gone.
    const before = await page.evaluate(() => document.getElementById('workspacePanel').getBoundingClientRect().width);
    const grip = await page.locator('#workspaceDividerGrip').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(grip.x + grip.width / 2 - i * 10, grip.y + grip.height / 2);
    await page.mouse.up(); await page.waitForTimeout(300);
    check('the divider still resizes the split', Math.abs(await page.evaluate(() => document.getElementById('workspacePanel').getBoundingClientRect().width) - before) > 30);

    // Zen without the Workspace: nothing covers the rail at the edge, and it keeps its layer.
    await page.click('#zenWorkspace'); await page.waitForFunction(() => !document.body.classList.contains('workspace-open')); await page.waitForTimeout(300);
    check('without the Workspace the rail keeps its usual layer', await page.evaluate(() => getComputedStyle(document.getElementById('zenDock')).zIndex) === aloneZ, aloneZ);
    check('no page errors', !errors.length, errors);
    console.log(`${checks} checks passed (${ENGINE})`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
