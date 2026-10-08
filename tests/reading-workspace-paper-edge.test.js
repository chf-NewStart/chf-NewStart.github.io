let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

/* The paper beside Workspace on an iPad: the dock must not cover the ends of lines,
   and Pencil highlights must be exact at the paper's edge, from a citation link, and
   across an accent drawn as its own glyph. Needs no pdf-lib: the fixture PDF is
   written by hand below. */
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

// One Helvetica page. Lines run to the right margin like a journal column; line 4
// opens with an internal link; line 5 sets the umlaut of "Münch" as a separate
// glyph moved back over the "u", the way eLife's PDFs do.
function fixturePdf() {
  const lines = [
    '(Long distance transport in plants occurs in sieve tubes of the phloem, and the pressure flow model of transport) Tj',
    '(explains how osmotic pressure differences between sources and sinks drive sugars along the tubes in every plant.) Tj',
    '(Measurements of sieve tube conductivity and turgor are needed to test whether the model holds in large plants.) Tj',
    '(\\(Knoblauch et al., 2016\\) measured sieve tube conductivity and turgor in morning glory vines of increasing length.) Tj',
    '[(The Mu) 444 (\\250) -111 (nch hypothesis therefore holds for long distance phloem transport in these plants.)] TJ',
    '(Sieve plates, pore radii and sap viscosity together set the hydraulic resistance along the whole transport path.) Tj'
  ];
  const stream = 'BT /F1 10 Tf 14 TL 30 750 Td\n' + lines.join(' T*\n') + '\nET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Annot /Subtype /Link /Rect [30 704 102 716] /Border [0 0 0] /Dest [3 0 R /XYZ 0 792 0] >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => { const at = pdf.length; pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n'; return at; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}

async function phrasePoint(page, phrase, which) {
  return page.evaluate(([phrase, which]) => {
    const layer = document.querySelector('.pdf-page[data-page="1"] .text-layer');
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) {
      const at = node.data.indexOf(phrase); if (at < 0) continue;
      const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + phrase.length);
      const rects = [...range.getClientRects()], box = which === 'end' ? rects[rects.length - 1] : rects[0];
      return { x: which === 'end' ? box.right - 1 : box.left + 1, y: (box.top + box.bottom) / 2 };
    }
    return null;
  }, [phrase, which]);
}
// Pencil strokes as the reader receives them: pen pointer events on whatever lies
// under the tip, including the link layer above the text.
async function pencil(page, from, to, holdMs) {
  await page.evaluate(async ([from, to, holdMs]) => {
    const fire = (type, p) => (document.elementFromPoint(p.x, p.y) || document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType: 'pen', pointerId: 9, isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, clientX: p.x, clientY: p.y, pressure: .5 }));
    fire('pointerdown', from);
    if (holdMs) await new Promise(resolve => setTimeout(resolve, holdMs));
    for (let step = 1; step <= 14; step++) { fire('pointermove', { x: from.x + (to.x - from.x) * step / 14, y: from.y + (to.y - from.y) * step / 14 }); await new Promise(resolve => setTimeout(resolve, 16)); }
    fire('pointerup', to);
  }, [from, to, holdMs || 0]);
  await page.waitForTimeout(1200);
}
async function highlights(page) {
  return page.evaluate(() => { const ch = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0]; return ((ch.highlights || {})['1'] || []).map(item => item.text); });
}

(async () => {
  await new Promise(resolve => server.listen(8139, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { if (!localStorage.getItem('readingRoom.v1')) localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [] })); });
  await page.goto('http://localhost:8139/reading.html', { waitUntil: 'load' });
  await page.locator('#pdfFile').setInputFiles({ name: 'paper-edge.pdf', mimeType: 'application/pdf', buffer: fixturePdf() });
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span') && document.querySelector('.pdf-page[data-page="1"] .pdf-link'), null, { timeout: 60000 });
  await page.locator('#zenWorkspace').tap();
  await page.locator('#workspacePanel').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.body.classList.contains('workspace-open'));
  await page.waitForTimeout(1500);

  const layout = await page.evaluate(() => {
    const shown = element => { const box = element.getBoundingClientRect(), style = getComputedStyle(element); return box.width > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const dock = [...document.querySelectorAll('#zenDock > *')].filter(shown).map(element => element.getBoundingClientRect());
    const dockLeft = Math.min(...dock.map(box => box.left)), dockTop = Math.min(...dock.map(box => box.top)), dockBottom = Math.max(...dock.map(box => box.bottom));
    const spans = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].map(span => span.getBoundingClientRect()).filter(box => box.width > 0 && box.bottom > dockTop && box.top < dockBottom);
    return { dockLeft, covered: spans.filter(box => box.right > dockLeft).length, beside: spans.length, pageRight: document.querySelector('.pdf-page[data-page="1"]').getBoundingClientRect().right, layoutWidth: document.getElementById('zenLayout').getBoundingClientRect().width };
  });
  check('fixture lines run alongside the dock', layout.beside >= 4, layout.beside);
  check('beside Workspace the page ends before the dock', layout.pageRight <= layout.dockLeft, JSON.stringify(layout));
  check('no line of text sits under the dock', layout.covered === 0, layout.covered);
  check('the layout control is one compact circle beside Workspace', Math.round(layout.layoutWidth) === 44, layout.layoutWidth);

  await pencil(page, await phrasePoint(page, 'of transport', 'start'), await phrasePoint(page, 'explains how', 'end'));
  let saved = await highlights(page);
  check('a Pencil highlight from the end of a line is exact', saved[saved.length - 1] === 'of transport explains how', saved[saved.length - 1]);

  const linkBox = await page.locator('.pdf-page[data-page="1"] .pdf-link').boundingBox();
  const onLink = { x: linkBox.x + 6, y: linkBox.y + linkBox.height / 2 };
  check('the stroke really starts on the citation link', await page.evaluate(p => !!document.elementFromPoint(p.x, p.y).closest('.pdf-link'), onLink));
  const count = saved.length;
  await pencil(page, onLink, await phrasePoint(page, 'measured sieve', 'end'));
  saved = await highlights(page);
  // Strokes snap to whole words, so the opening bracket before the name stays out.
  check('a Pencil highlight can start on a citation link', saved.length === count + 1 && saved[saved.length - 1] === 'Knoblauch et al., 2016) measured sieve', saved[saved.length - 1]);

  await pencil(page, onLink, onLink, 700);
  check('holding the Pencil on a link still opens its preview', await page.evaluate(() => !document.getElementById('pdfReferencePreview').classList.contains('hidden')));
  check('holding on a link saves no highlight', (await highlights(page)).length === count + 1);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await page.mouse.click(5, 1000);

  await pencil(page, await phrasePoint(page, 'The Mu', 'start'), await phrasePoint(page, 'nch hypothesis', 'end'));
  saved = await highlights(page);
  check('an accent drawn as its own glyph rejoins its letter', saved[saved.length - 1] === 'The Münch hypothesis', saved[saved.length - 1]);

  // Fit must leave the dock clear even at the smallest allowed paper split,
  // including the two/three-column rail used by a short landscape viewport.
  for (const size of [{ width:1024, height:768 }, { width:900, height:600 }, { width:1024, height:420 }, { width:1024, height:300 }]) {
    await page.setViewportSize(size);
    await page.locator('#workspaceDivider').focus();
    for (let step=0; step<20; step++) await page.keyboard.press('ArrowLeft');
    for (const mode of ['scroll','page','book']) {
      await page.locator('[data-pdf-layout="'+mode+'"]').evaluate(button => button.click());
      await page.waitForFunction(() => {
        const frame=document.getElementById('pdfFrame');
        const paper=document.querySelector('.pdf-page.book-active') || document.querySelector('.pdf-page');
        const dock=document.getElementById('zenDock');
        return paper && (!frame.classList.contains('paged-pdf-flow') || frame.dataset.pagedReady==='true')
          && paper.getBoundingClientRect().right <= dock.getBoundingClientRect().left + 1;
      }, null, {timeout:10000});
      check('paper clears dock in '+mode+' at '+size.width+'×'+size.height+' and minimum split', true);
    }
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All paper edge checks passed');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
