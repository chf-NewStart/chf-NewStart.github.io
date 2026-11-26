let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
const browserType = playwright[browserName];
const http = require('http');
const fs = require('fs');
const path = require('path');

/* Cmd+F (Apple) or Ctrl+F (elsewhere) opens Phloem's own Find with its field focused and
   its old text selected, as '/' does, and the browser's find is not opened under it. A
   second press in Find's field is left to the browser, so its find stays one press away.
   Cmd/Ctrl+G and Shift+Cmd/Ctrl+G step through the matches while Find is open, and are
   the browser's while it is closed. Ctrl+F on a Mac is a text-editing key and is never
   taken. A note (with the notes opened by a click) and a Workspace beside the paper open
   Phloem's Find too. The library, an open dialog and the full-screen Workspace keep the
   browser's find, and the full-screen Workspace keeps the browser's G with Find open. '/', 'f' (reader full screen) and Escape still do what they did, and
   Escape from the Workspace closes Find. Each check reads
   defaultPrevented on the keydown the key press dispatched. */

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_FIND_SHORTCUT_TEST_PORT || 8194);
const QUERY = 'degradation';
const AGENTS = [
  { name: 'Mac', mod: 'Meta', other: 'Control', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' },
  { name: 'Windows', mod: 'Control', other: 'Meta', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
  { name: 'iPad', mod: 'Meta', other: 'Control', ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', short: true }
];

function pdfBuffer() {
  function stream(text) {
    return '<< /Length ' + Buffer.byteLength(text, 'ascii') + ' >>\nstream\n' + text + '\nendstream';
  }
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    stream('BT\n/F1 14 Tf\n72 700 Td\n(Protein degradation follows synthesis.) Tj\n0 -40 Td\n(Carbon moves along the sieve tube.) Tj\n0 -40 Td\n(Synthesis and degradation occur together.) Tj\nET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    stream('BT\n/F1 14 Tf\n72 700 Td\n(REFERENCES) Tj\n0 -40 Td\n(Alpha reference on degradation rates.) Tj\nET'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'ascii');
    pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'ascii');
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css'
          : file.endsWith('.pdf') ? 'application/pdf'
            : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

async function run(browser, agent) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', userAgent: agent.ua });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('phloem.findShortcutSeeded') !== '1') {
      sessionStorage.setItem('phloem.findShortcutSeeded', '1');
      localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() }));
      localStorage.setItem('readingRoom.comfort.v1', JSON.stringify({ pdfLayout: 'scroll', guide: 'off', guideOrientation: 'row', focus: false, guideDim: 55 }));
    }
    // Every keydown, as the page's own handlers left it.
    window.__keys = [];
    addEventListener('keydown', event => window.__keys.push({ key: event.key, meta: event.metaKey, ctrl: event.ctrlKey, shift: event.shiftKey, prevented: event.defaultPrevented }));
    window.__fullscreen = 0;
    Element.prototype.requestFullscreen = function () { window.__fullscreen++; return Promise.reject(new Error('not in this test')); };
  });
  await page.goto('http://127.0.0.1:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('library-ready'));
  const tag = agent.name + ': ';
  const mod = agent.mod, sym = mod === 'Meta' ? 'Cmd' : 'Ctrl', otherSym = agent.other === 'Meta' ? 'Cmd' : 'Ctrl';

  async function press(combo) {
    const before = await page.evaluate(() => window.__keys.length);
    await page.keyboard.press(combo);
    return page.evaluate(n => {
      const key = window.__keys.slice(n).find(entry => !/^(Meta|Control|Shift|Alt)$/.test(entry.key));
      return key ? key.prevented : 'no keydown';
    }, before);
  }
  const state = () => page.evaluate(() => {
    const input = document.getElementById('findInput');
    return {
      open: !document.getElementById('findBar').classList.contains('hidden'),
      focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
      value: input.value,
      selected: document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
      count: document.getElementById('findCount').textContent,
      reader: !document.getElementById('readerPage').classList.contains('hidden'),
      notes: document.getElementById('notebook').classList.contains('sheet-open') || !!document.getElementById('pageNote').getClientRects().length
    };
  });
  const blur = () => page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  const counted = n => page.waitForFunction(n => new RegExp(' · ' + n + ' / 3').test(document.getElementById('findCount').textContent), n, { timeout: 8000 }).then(() => true, () => false);

  // The library is not a paper: its keys are the browser's.
  let prevented = await press(mod + '+f');
  let s = await state();
  check(tag + sym + '+F in the library is left to the browser', prevented === false && !s.open, JSON.stringify({ prevented, s }));

  await page.setInputFiles('#pdfFile', { name: 'find-shortcut.pdf', mimeType: 'application/pdf', buffer: pdfBuffer() });
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelector('.pdf-page[data-page="1"] .text-layer span'));
  await blur();

  prevented = await press(mod + '+f');
  s = await state();
  check(tag + sym + '+F on the paper opens Phloem\'s Find with its field focused, not the browser\'s', prevented === true && s.open && s.focus === 'findInput' && s.selected, JSON.stringify({ prevented, s }));
  await page.keyboard.type(QUERY);
  check(tag + 'Find finds the three matches', await counted(1), (await state()).count);

  prevented = await press(mod + '+f');
  s = await state();
  check(tag + 'a second ' + sym + '+F in Find\'s field is left to the browser', prevented === false && s.open && s.focus === 'findInput', JSON.stringify({ prevented, s }));

  prevented = await press(mod + '+g');
  check(tag + sym + '+G in the field steps to the next match', prevented === true && await counted(2), JSON.stringify({ prevented, count: (await state()).count }));
  prevented = await press('Shift+' + mod + '+g');
  check(tag + 'Shift+' + sym + '+G steps back to the previous match', prevented === true && await counted(1), JSON.stringify({ prevented, count: (await state()).count }));
  prevented = await press('Shift+' + mod + '+g');
  check(tag + 'Shift+' + sym + '+G from the first match goes round to the last', prevented === true && await counted(3), JSON.stringify({ prevented, count: (await state()).count }));
  await blur();
  prevented = await press(mod + '+g');
  check(tag + sym + '+G with focus on the page steps on, round to the first', prevented === true && await counted(1), JSON.stringify({ prevented, count: (await state()).count }));
  await page.click('#findNext');
  check(tag + 'the ↓ button still steps on', await counted(2), (await state()).count);
  await page.focus('#findInput');
  await page.keyboard.press('Enter');
  check(tag + 'Enter still steps on', await counted(3), (await state()).count);
  await page.keyboard.press('Shift+Enter');
  check(tag + 'Shift+Enter still steps back', await counted(2), (await state()).count);

  // Find already open, focus on the page: back to the field with the text selected, on the same match.
  await blur();
  prevented = await press(mod + '+f');
  s = await state();
  check(tag + sym + '+F with Find open and focus on the page selects the field\'s text again', prevented === true && s.open && s.focus === 'findInput' && s.selected && s.value === QUERY && / · 2 \/ 3/.test(s.count), JSON.stringify({ prevented, s }));

  await page.keyboard.press('Escape');
  s = await state();
  check(tag + 'Escape in the field still closes Find and keeps the paper open', !s.open && s.reader && s.count === '', JSON.stringify(s));

  await blur();
  prevented = await press(mod + '+g');
  s = await state();
  check(tag + sym + '+G with Find closed is left to the browser', prevented === false && !s.open, JSON.stringify({ prevented, s }));

  prevented = await press(agent.other + '+f');
  s = await state();
  check(tag + otherSym + '+F is not taken' + (agent.mod === 'Meta' ? ' (Ctrl+F is a text-editing key here, not Find)' : ''), prevented === false && !s.open, JSON.stringify({ prevented, s }));
  prevented = await press('Alt+' + mod + '+f');
  s = await state();
  check(tag + 'Alt+' + sym + '+F is not taken', prevented === false && !s.open, JSON.stringify({ prevented, s }));

  await blur();
  prevented = await press(mod + '+f');
  s = await state();
  check(tag + sym + '+F opens Find again with its old text selected', prevented === true && s.open && s.focus === 'findInput' && s.selected && s.value === QUERY, JSON.stringify({ prevented, s }));
  check(tag + 'and Find runs it again', await counted(1), (await state()).count);
  await page.keyboard.press('Escape');

  if (agent.short) {
    check(tag + 'no page errors', errors.length === 0, errors.join('; '));
    await context.close();
    return;
  }

  // '/' and 'f' keep their jobs.
  await blur();
  prevented = await press('/');
  s = await state();
  check(tag + '"/" still opens Find with its text selected', prevented === true && s.open && s.focus === 'findInput' && s.selected && s.value === QUERY, JSON.stringify({ prevented, s }));
  await page.keyboard.press('Escape');
  await blur();
  const fullscreenBefore = await page.evaluate(() => window.__fullscreen);
  prevented = await press('f');
  s = await state();
  const fullscreenAfter = await page.evaluate(() => window.__fullscreen);
  check(tag + 'plain "f" still asks for reader full screen and leaves Find closed', prevented === true && fullscreenAfter === fullscreenBefore + 1 && !s.open, JSON.stringify({ prevented, fullscreenBefore, fullscreenAfter, s }));

  // From a note in the reader, Cmd/Ctrl+F still opens Phloem's Find.
  if (!await page.evaluate(() => document.getElementById('pageNote').getClientRects().length)) {
    if (await page.evaluate(() => document.body.classList.contains('zen'))) await page.evaluate(() => document.getElementById('zenNotebook').click());
    else await page.evaluate(() => document.getElementById('notebookReopen').click());
  }
  await page.locator('#pageNote').waitFor({ state: 'visible' }).catch(() => {});
  const note = await page.evaluate(() => {
    const area = document.getElementById('pageNote');
    area.focus();
    return document.activeElement === area;
  });
  if (note) {
    prevented = await press(mod + '+f');
    s = await state();
    check(tag + sym + '+F from a note opens Phloem\'s Find', prevented === true && s.open && s.focus === 'findInput' && s.selected, JSON.stringify({ prevented, s }));
    if (process.env.PHLOEM_SHOT_DIR) await page.screenshot({ path: path.join(process.env.PHLOEM_SHOT_DIR, 'find-from-note-' + browserName + '-' + agent.name + '.png') });
    await page.keyboard.press('Escape');
    s = await state();
    /* In Zen the notes sheet closes when Find goes to a match (as it does for any page
       jump), so focus goes back to the dock, never into a hidden note. */
    check(tag + 'Escape closes Find and leaves focus on something visible', !s.open && s.reader && (s.focus === 'pageNote' ? s.notes : s.focus !== 'BODY'), JSON.stringify(s));
  } else check(tag + 'the page note can be focused for the note check', false);

  // Escape from the page still closes an open Find.
  await blur();
  await press(mod + '+f');
  await blur();
  await page.keyboard.press('Escape');
  s = await state();
  check(tag + 'Escape with focus on the page still closes Find, not the paper', !s.open && s.reader, JSON.stringify(s));

  /* Notes opened by real clicks, so the More button that opened them has focus to give back.
     Find going to its first match closes the sheet; focus stays in Find's field, and typing
     goes there, not to the reader's one-letter shortcuts. */
  await blur();
  await page.click('#zenMore');
  await page.click('#zenNotebook');
  await page.locator('#pageNote').waitFor({ state: 'visible' });
  await page.click('#pageNote');
  let fullscreenAt = await page.evaluate(() => window.__fullscreen);
  prevented = await press(mod + '+f');
  await counted(1);
  await page.waitForTimeout(300);
  await page.keyboard.type('xyzf');
  s = await state();
  check(tag + sym + '+F from notes opened by a click keeps focus in Find, and typing goes there', prevented === true && s.open && s.focus === 'findInput' && s.value === 'xyzf' && await page.evaluate(() => window.__fullscreen) === fullscreenAt, JSON.stringify({ prevented, s }));
  await page.fill('#findInput', QUERY);
  await page.keyboard.press('Escape');

  /* The Workspace beside the paper keeps its own keys, but Cmd/Ctrl+F from it opens
     Phloem's Find, Cmd/Ctrl+G steps it, and Escape closes it. */
  await blur();
  await page.click('#zenWorkspace');
  await page.locator('#workspaceBoard').waitFor({ state: 'visible' });
  const besidePaper = await page.evaluate(() => /workspace-(side|bottom)/.test(document.body.className));
  check(tag + 'the Workspace opens beside the paper', besidePaper);
  const focusBoard = () => page.evaluate(() => document.getElementById('workspaceBoard').focus());
  await focusBoard();
  prevented = await press(mod + '+f');
  s = await state();
  check(tag + sym + '+F from the Workspace opens Phloem\'s Find with its field focused', prevented === true && s.open && s.focus === 'findInput' && s.selected, JSON.stringify({ prevented, s }));
  await counted(1);
  await focusBoard();
  prevented = await press(mod + '+g');
  check(tag + sym + '+G from the Workspace steps on', prevented === true && await counted(2), JSON.stringify({ prevented, count: (await state()).count }));
  await focusBoard();
  await page.keyboard.press('Escape');
  s = await state();
  let workspaceStill = await page.evaluate(() => !document.getElementById('workspacePanel').classList.contains('hidden'));
  check(tag + 'Escape with focus in the Workspace closes Find, and keeps the Workspace and the paper', !s.open && s.reader && workspaceStill, JSON.stringify({ s, workspaceStill }));
  await focusBoard();
  await press(mod + '+f');
  // Safari does not focus a tapped control: the keys then arrive on <body> after a tap in the Workspace.
  await page.evaluate(() => {
    const tools = document.getElementById('workspaceTools');
    tools.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    tools.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    document.activeElement.blur();
  });
  await page.keyboard.press('Escape');
  s = await state();
  workspaceStill = await page.evaluate(() => !document.getElementById('workspacePanel').classList.contains('hidden'));
  check(tag + 'Escape on the page after a tap in the Workspace closes Find, and keeps the Workspace and the paper', !s.open && s.reader && workspaceStill, JSON.stringify({ s, workspaceStill }));
  await page.click('#zenWorkspace');
  await page.locator('#workspacePanel').waitFor({ state: 'hidden' });

  /* In a short window the Workspace covers the whole paper and hides an open Find bar:
     Cmd/Ctrl+F and Cmd/Ctrl+G from the board are then the browser's, and the hidden Find
     does not step. */
  await blur();
  await press(mod + '+f');
  await counted(1);
  await blur();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('zenWorkspace').click());
  await page.locator('#workspaceBoard').waitFor({ state: 'visible' });
  const full = await page.evaluate(() => ({ full: document.body.classList.contains('workspace-full'), hidden: getComputedStyle(document.getElementById('findBar')).visibility === 'hidden' }));
  check(tag + 'in an 844x390 window the Workspace covers the paper and hides the open Find bar', full.full && full.hidden && (await state()).open, JSON.stringify(full));
  await focusBoard();
  prevented = await press(mod + '+f');
  check(tag + sym + '+F from the full-screen Workspace is left to the browser', prevented === false, JSON.stringify({ prevented }));
  await focusBoard();
  prevented = await press(mod + '+g');
  await page.waitForTimeout(400);
  s = await state();
  check(tag + sym + '+G from the full-screen Workspace is left to the browser, and the hidden Find stays on its match', prevented === false && / · 1 \/ 3/.test(s.count), JSON.stringify({ prevented, count: s.count }));
  await focusBoard();
  prevented = await press('Shift+' + mod + '+g');
  await page.waitForTimeout(400);
  s = await state();
  check(tag + 'Shift+' + sym + '+G from the full-screen Workspace is left to the browser too', prevented === false && / · 1 \/ 3/.test(s.count), JSON.stringify({ prevented, count: s.count }));
  await page.evaluate(() => document.getElementById('zenWorkspace').click());
  await page.locator('#workspacePanel').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('findInput').focus());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('findBar').classList.contains('hidden'));

  // A native dialog owns its keys.
  await page.evaluate(() => document.getElementById('readerControlsDialog').showModal());
  prevented = await press(mod + '+f');
  s = await state();
  check(tag + sym + '+F with a dialog open is left to the browser', prevented === false && !s.open, JSON.stringify({ prevented, s }));
  await page.keyboard.press('Escape');

  // Back in the library, the browser's find again.
  await page.evaluate(() => document.getElementById('brandBtn').click());
  await page.waitForFunction(() => document.getElementById('readerPage').classList.contains('hidden'));
  prevented = await press(mod + '+f');
  s = await state();
  check(tag + sym + '+F after leaving the paper is the browser\'s again', prevented === false && !s.open, JSON.stringify({ prevented, s }));

  check(tag + 'no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  if (!browserType) throw new Error('Unknown Playwright browser: ' + browserName);
  const launch = { headless: true };
  if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await browserType.launch(launch);
  for (const agent of AGENTS) if (!process.env.PHLOEM_FIND_AGENTS || process.env.PHLOEM_FIND_AGENTS.split(',').includes(agent.name)) await run(browser, agent);
  await browser.close();
  server.close();
  console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); server.close(); process.exit(1); });
