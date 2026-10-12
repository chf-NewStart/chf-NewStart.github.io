/* Readers' feedback: in Zen, tapping the button that shows something open closes it,
   and only that: no menu opens on top. Covers the dock popouts, the Workspace, the
   highlighter (via ✎ and the Highlight button beside the Workspace), the pen (✎), and
   Find, Reading settings and the Notebook (via •••). Run with PHLOEM_BROWSER=chromium or
   webkit; the iPad user agent keeps WebKit's own touch paths. */
const fs = require('fs'), http = require('http'), path = require('path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..'), ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const server = http.createServer((q, r) => { const p = q.url.split('?')[0]; const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica); for (let i = 0; i < 3; i++) doc.addPage([612, 792]).drawText('Page ' + (i + 1) + ' words to read here', { x: 72, y: 700, size: 16, font });
  const pdf = Buffer.from(await doc.save()), browser = await playwright[ENGINE].launch();
  const errors = [], opts = { viewport: { width: 1180, height: 820 }, hasTouch: true, userAgent: IPAD };
  async function fresh() { const page = await browser.newPage(opts); page.on('pageerror', e => errors.push(String(e))); await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
    await page.locator('#pdfFile').setInputFiles({ name: 'z.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.waitForFunction(() => document.body.classList.contains('zen') && document.querySelector('.pdf-page canvas')?.width); await page.waitForTimeout(700); return page; }
  const state = page => page.evaluate(() => { const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
    const out = []; ['zenGuideMenu', 'zenLayoutMenu', 'zenAnnotateMenu', 'zenMoreMenu', 'highlightToolbar', 'comfortBar', 'findBar'].forEach(id => { if (vis(id)) out.push(id.replace(/^zen|Menu$/g, '')); });
    if (document.getElementById('zenWrite')?.classList.contains('active')) out.push('pen');
    if (document.body.classList.contains('workspace-open')) out.push('workspace');
    const sheet = document.querySelector('.notebook'); if (document.getElementById('notebook')?.classList.contains('sheet-open')) out.push('notebook');
    return out.join(',') || '-'; });
  const rows = [];
  async function scenario(name, opens, again) { const page = await fresh(); try { for (const id of opens) { await page.locator('#' + id).click({ timeout: 3000 }); await page.waitForTimeout(300); }
      const open = await state(page); for (const id of again) { await page.locator('#' + id).click({ timeout: 3000 }); await page.waitForTimeout(300); } rows.push([name, open, await state(page)]); }
    catch (e) { rows.push([name, 'ERR', e.message.split('\n')[0]]); } await page.close(); }
  await scenario('Guide, Guide', ['zenGuide'], ['zenGuide']);
  await scenario('Layout, Layout', ['zenLayout'], ['zenLayout']);
  await scenario('Annotate, Annotate', ['zenAnnotate'], ['zenAnnotate']);
  await scenario('More, More', ['zenMore'], ['zenMore']);
  await scenario('✎ > Highlight, then ✎', ['zenAnnotate', 'zenMarker'], ['zenAnnotate']);
  await scenario('✎ > Write, then ✎', ['zenAnnotate', 'zenWrite'], ['zenAnnotate']);
  await scenario('••• > Notebook, then •••', ['zenMore', 'zenNotebook'], ['zenMore']);
  await scenario('••• > Settings, then •••', ['zenMore', 'zenSettings'], ['zenMore']);
  await scenario('••• > Find, then •••', ['zenMore', 'zenFind'], ['zenMore']);
  await scenario('Workspace, Workspace', ['zenWorkspace'], ['zenWorkspace']);
  await scenario('Workspace > marker, marker', ['zenWorkspace', 'zenWorkspaceMarker'], ['zenWorkspaceMarker']);
  const expectOpen = { 'Guide, Guide': 'Guide', 'Layout, Layout': 'Layout', 'Annotate, Annotate': 'Annotate', 'More, More': 'More', '✎ > Highlight, then ✎': 'highlightToolbar', '✎ > Write, then ✎': 'pen',
    '••• > Notebook, then •••': 'notebook', '••• > Settings, then •••': 'comfortBar', '••• > Find, then •••': 'findBar', 'Workspace, Workspace': 'workspace', 'Workspace > marker, marker': 'highlightToolbar,workspace' };
  const expectAfter = { 'Workspace > marker, marker': 'workspace' };
  rows.forEach(([name, open, after]) => {
    assert.equal(open, expectOpen[name], name + ' opens what it should');
    assert.equal(after, expectAfter[name] || '-', name + ': the second tap closes it and opens nothing else');
  });
  assert.deepEqual(errors, []);
  console.log('PASS ' + rows.length + ' Zen buttons close what they opened on a second tap (' + ENGINE + ')');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
