let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const pathmod = require('path');

const ROOT = require('path').resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const p = pathmod.join(ROOT, req.url.split('?')[0] === '/' ? 'reading.html' : req.url.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const type = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!cond) failures++;
}

(async () => {
  await new Promise(r => server.listen(8124, r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.addInitScript(() => {
    const ch = {
      id: 'ch_test1', kind: 'text', title: 'Test paper', authors: 'Tester',
      fr: 'Alpha beta gamma delta epsilon zeta eta theta.\n\nSecond paragraph here for testing purposes only.',
      textHighlights: [{ id: 'h_test1', para: 0, start: 6, end: 16, text: 'beta gamma', color: 'yellow', at: Date.now() }],
      highlights: {}, readerHighlights: [], notes: {}, readerNotes: {}, pageNotes: {}, questions: [], termLookups: {}, reviews: {}, tags: [], at: Date.now()
    };
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [ch] }));
    localStorage.setItem('readingRoom.lastOpen.v1', 'ch_test1');
  });

  await page.goto('http://localhost:8124/reading.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const hl = () => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].textHighlights);
  const cardHidden = () => page.evaluate(() => document.getElementById('highlightCard').classList.contains('hidden'));

  check('mark rendered', await page.locator('#textDocument mark[data-hl-id]').count() === 1);

  // 1. Click mark with marker OFF -> card opens, highlight stays
  await page.locator('#textDocument mark[data-hl-id]').first().click();
  await page.waitForTimeout(200);
  check('card opens on click (marker off)', !(await cardHidden()));
  check('highlight still present', (await hl()).length === 1);
  check('quote shown', (await page.locator('#highlightCardQuote').textContent()).includes('beta gamma'));

  // 2. Type a note -> saved on the highlight, sidebar shows it
  await page.fill('#highlightCardNote', 'key definition to remember');
  await page.waitForTimeout(200);
  check('note stored on highlight', (await hl())[0].note === 'key definition to remember');
  check('sidebar shows note', await page.evaluate(() => document.getElementById('noteIndex').textContent.includes('key definition to remember')));

  // 3. Recolor via card swatch
  await page.click('#highlightCard [data-card-color="mint"]');
  await page.waitForTimeout(200);
  check('color stored', (await hl())[0].color === 'mint');
  check('mark re-rendered with new color', await page.evaluate(() => !!document.querySelector('#textDocument mark.hl-mint')));
  check('noted mark has hl-noted class', await page.evaluate(() => !!document.querySelector('#textDocument mark.hl-noted')));
  check('card still open after recolor', !(await cardHidden()));

  // 4. Undo recolor, redo it
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  check('undo restores yellow', (await hl())[0].color === 'yellow');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(150);
  check('redo restores mint', (await hl())[0].color === 'mint');

  // 5. Remove via card, then undo restores it with note intact
  await page.locator('#textDocument mark[data-hl-id]').first().click();
  await page.waitForTimeout(150);
  await page.click('#highlightCardRemove');
  await page.waitForTimeout(200);
  check('removed via card', (await hl()).length === 0);
  check('card closed after remove', await cardHidden());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const restored = await hl();
  check('undo restores highlight', restored.length === 1);
  check('restored with note', restored[0] && restored[0].note === 'key definition to remember');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  check('Ctrl+Y redoes removal', (await hl()).length === 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check('restored again for next steps', (await hl()).length === 1);

  // 6. Escape closes the card
  await page.locator('#textDocument mark[data-hl-id]').first().click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('Escape closes card', await cardHidden());

  // 7. Marker on: click erases directly; undo restores; new stroke after undo clears redo
  await page.click('#highlightBtn');
  await page.waitForTimeout(150);
  await page.locator('#textDocument mark[data-hl-id]').first().click();
  await page.waitForTimeout(200);
  check('marker-on click erases', (await hl()).length === 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check('undo restores erased highlight', (await hl()).length === 1);

  // 8. Drag a new highlight with marker on, then undo removes only that one
  const para = page.locator('#textDocument .original').nth(1);
  const box = await para.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  check('drag adds second highlight', (await hl()).length === 2);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const after = await hl();
  check('undo removes only the new stroke', after.length === 1 && after[0].id === 'h_test1');

  console.log('JS errors:', errors.length ? errors.join('\n') : 'none');
  check('no page errors', errors.length === 0);
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
