/* Handwriting on sticky notes (Houfu: "make the note writable instead of only text,
   default to write"). A note placed with a Pencil or finger opens in Write; the Pencil, a
   mouse or a finger draws on it; once a Pencil has touched it a resting finger or palm
   neither draws nor closes it; an eraser takes whole strokes; each stroke and erase is one
   Undo step; a key typed in Write goes to Type; a Pencil on a note in Type writes again.
   Handwriting is saved with the note, survives reload and sync merges, keeps a note that
   has no words, shows in the Notebook, and a handwritten note still becomes a comment in
   Export annotated PDF. Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), vm = require('node:vm');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0;
function check(name, condition, extra) { checks++; assert.ok(condition, name + (extra === undefined ? '' : ' [' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) + ']')); console.log('PASS  ' + name); }

/* ---- Part 1: the stored handwriting ---- */
function dataTests() {
  const ctx = vm.createContext({}); ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'reading-stickies.js'), 'utf8'), ctx);
  const sm = ctx.PhloemStickies;
  const note = (id, at, extra) => ({ id, x: .5, y: .5, text: '', color: 'yellow', at, updatedAt: at, ...extra });
  const odd = sm.normalize({ 1: [note('a', 5, { ink: [{ color: 'black', width: 4.5, style: 'natural', points: [[.1, .2, .5], [1.4, -.2, 2], ['x', 1], [.3, .4]] }, { points: [] }, 'bad', { color: '<b>', width: 99, points: [[.5, .5, .5]] }] })] }, {});
  const ink = odd.pages[1][0].ink;
  check('handwriting is cleaned stroke by stroke: points clamped, bad points and empty strokes dropped', ink.length === 2 && JSON.stringify(ink[0].points) === '[[0.1,0.2,0.5],[1,0,1],[0.3,0.4,0.5]]' && ink[0].style === 'natural' && ink[1].color === 'black' && ink[1].width === 24, ink);
  check('a note whose handwriting is all unusable carries no ink field', !('ink' in sm.normalize({ 1: [note('b', 5, { ink: [{ points: [] }] })] }, {}).pages[1][0]));
  check('a note with handwriting and no words has content; an empty one does not', sm.hasContent(odd.pages[1][0]) && !sm.hasContent(note('c', 1)) && sm.hasContent(note('d', 1, { text: ' words ' })));
  const merged = sm.merge({ 1: [note('a', 10, { ink: [{ points: [[.1, .1, .5]] }] })] }, {}, { 1: [note('a', 20, { ink: [{ points: [[.1, .1, .5]] }, { points: [[.9, .9, .5]] }] })] }, {});
  check('sync keeps the newer handwriting of a note', merged.pages[1][0].ink.length === 2);
}

/* ---- Part 2: the reader ---- */
async function makePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const one = doc.addPage([612, 792]);
  for (let line = 0; line < 12; line++) one.drawText('Line ' + (line + 1) + ' of the handwritten note fixture with ordinary words', { x: 72, y: 720 - line * 26, size: 14, font });
  return Buffer.from(await doc.save());
}
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
async function stored(page) {
  await page.waitForTimeout(1200);
  return page.evaluate(() => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.id === id); });
}
const allNotes = ch => Object.entries(ch.pdfStickies || {}).flatMap(([page, list]) => list.map(item => ({ page: +page, ...item })));
async function sheetPoint(page, u, v) {
  return page.locator('.pdf-page[data-page="1"] .pdf-sheet').evaluate((el, at) => {
    const pane = document.getElementById('documentPane'), p = pane.getBoundingClientRect(); let r = el.getBoundingClientRect();
    const y = r.top + r.height * at.v; if (y < p.top + 60 || y > p.bottom - 120) { pane.scrollTop += y - (p.top + p.height / 2); r = el.getBoundingClientRect(); }
    return { x: r.left + r.width * at.u, y: r.top + r.height * at.v };
  }, { u, v });
}
async function arm(page) {
  if (!await page.locator('#zenAnnotateMenu').isVisible()) await page.click('#zenAnnotate');
  await page.click('#zenSticky');
  await page.waitForFunction(() => document.body.classList.contains('pdf-sticky-placing'));
}
// A Pencil or finger tap in WebKit's order: pointer, touch, click.
async function tap(page, at, pointerType) {
  await page.evaluate(({ at, pointerType }) => {
    const target = document.elementFromPoint(at.x, at.y), id = pointerType === 'pen' ? 71 : 72;
    const pointer = type => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType, pointerId: id, isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: at.x, clientY: at.y, pressure: type === 'pointerup' ? 0 : .5 }));
    const touch = type => { const t = { identifier: 9, target, touchType: pointerType === 'pen' ? 'stylus' : 'direct', clientX: at.x, clientY: at.y, pageX: at.x, pageY: at.y, force: .5 }; const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(e, { changedTouches: { value: [t] }, touches: { value: type === 'touchstart' ? [t] : [] }, targetTouches: { value: type === 'touchstart' ? [t] : [] } }); target.dispatchEvent(e); return e.defaultPrevented; };
    pointer('pointerdown'); const owned = touch('touchstart'); pointer('pointerup'); touch('touchend');
    if (!owned) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, detail: 1, button: 0 }));
  }, { at, pointerType });
}
// A stroke on the open note, from (u0,v0) to (u1,v1) as fractions of its writing face.
async function stroke(page, pointerType, u0, v0, u1, v1, options = {}) {
  return page.evaluate(({ pointerType, u0, v0, u1, v1, options }) => {
    const pad = document.getElementById('stickyPad'), r = pad.getBoundingClientRect(), id = options.id || (pointerType === 'pen' ? 81 : pointerType === 'touch' ? 82 : 83);
    const at = k => ({ x: r.left + r.width * (u0 + (u1 - u0) * k), y: r.top + r.height * (v0 + (v1 - v0) * k) });
    const send = (target, type, p, pressure) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType, pointerId: id, isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, clientX: p.x, clientY: p.y, pressure }));
    const start = at(0), first = document.elementFromPoint(start.x, start.y);
    send(first, 'pointerdown', start, .4);
    for (let i = 1; i <= 12; i++) send(pad, 'pointermove', at(i / 12), .3 + i * .05);
    send(pad, 'pointerup', at(1), 0);
    return first.id || first.className.baseVal || first.className;
  }, { pointerType, u0, v0, u1, v1, options });
}
const editorState = page => page.evaluate(() => ({
  open: !document.getElementById('stickyEditor').classList.contains('hidden'), mode: document.getElementById('stickyEditor').dataset.mode,
  focus: document.activeElement && document.activeElement.id, paths: document.querySelectorAll('#stickyInk > path').length,
  hint: !document.getElementById('stickyPadHint').hidden, write: document.querySelector('[data-sticky-mode="write"]').getAttribute('aria-pressed'),
  undo: document.getElementById('stickyInkUndo').disabled, eraser: document.getElementById('stickyEraser').disabled
}));
const toast = page => page.locator('#readerToast').textContent();

(async () => {
  dataTests();
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } }), page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    const pdfBytes = await makePdf();
    await page.locator('#pdfFile').setInputFiles({ name: 'handwritten-notes.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="1"] canvas')?.width && document.body.classList.contains('zen'));
    await page.waitForTimeout(400);

    // Placed with a Pencil: Write, ready for ink, no keyboard.
    await arm(page);
    await tap(page, await sheetPoint(page, .3, .3), 'pen');
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    let st = await editorState(page);
    check('a note placed with a Pencil opens in Write, the writing face focused (no keyboard)', st.mode === 'write' && st.write === 'true' && st.focus === 'stickyPad' && st.hint && st.paths === 0 && st.eraser && st.undo, st);
    const face = await page.locator('#stickySurface').boundingBox();
    check('the note has a 4:3 writing face', Math.abs(face.width / face.height - 4 / 3) < .02, face);

    const target = await stroke(page, 'pen', .1, .2, .6, .3);
    let ch = await stored(page), hand = allNotes(ch)[0];
    st = await editorState(page);
    check('a Pencil stroke draws on the note and is saved with it', target === 'stickyPad' && hand.ink && hand.ink.length === 1 && hand.text === '' && st.paths === 1 && !st.hint && !st.undo && !st.eraser, { target, hand, st });
    const pts = hand.ink[0].points;
    check('its points are fractions of the writing face, with the Pencil pressure', Math.abs(pts[0][0] - .1) < .01 && Math.abs(pts[0][1] - .2) < .01 && Math.abs(pts[pts.length - 1][0] - .6) < .01 && Math.abs(pts[pts.length - 1][1] - .3) < .01 && pts[0][2] === .4 && pts.some(p => p[2] > .7), pts);
    check('the note icon shows it holds something', (await page.locator('#pdfFrame .pdf-sticky').getAttribute('class')).includes('has-text') && await page.locator('#pdfFrame .pdf-sticky').getAttribute('aria-label') === 'Handwritten sticky note');

    // A mouse draws too.
    const box = await page.locator('#stickyPad').boundingBox();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .6); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (.2 + i * .05), box.y + box.height * (.6 + i * .02));
    await page.mouse.up(); await page.waitForTimeout(100);
    check('a mouse draws on the note', allNotes(await stored(page))[0].ink.length === 2 && (await editorState(page)).paths === 2);

    // After a Pencil, a finger or palm on the glass neither draws nor closes the note.
    await stroke(page, 'touch', .5, .5, .9, .9);
    check('a finger on the note after a Pencil does not draw (palm rest)', allNotes(await stored(page))[0].ink.length === 2);
    // A spot on the visible page away from the open note.
    const outside = await page.evaluate(() => { const s = document.querySelector('.pdf-page[data-page="1"] .pdf-sheet').getBoundingClientRect(), e = document.getElementById('stickyEditor').getBoundingClientRect();
      return { x: Math.max(s.left + 20, Math.min(s.right - 20, e.right + 60)), y: Math.min(innerHeight - 120, e.bottom - 20) }; });
    await page.evaluate(at => { const t = document.elementFromPoint(at.x, at.y); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 90, clientX: at.x, clientY: at.y, buttons: 1 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 90, clientX: at.x, clientY: at.y })); }, outside);
    check('a palm touching the page beside the note does not close it', (await editorState(page)).open);

    // Undo in the note and on the dock.
    await page.click('#stickyInkUndo'); await page.waitForTimeout(100);
    st = await editorState(page);
    check('the note\'s Undo takes the last stroke away and keeps the note open', allNotes(await stored(page))[0].ink.length === 1 && st.paths === 1 && st.open && await toast(page) === 'Handwriting on the note undone', st);
    await page.evaluate(() => document.getElementById('zenRedo').click()); await page.waitForTimeout(100);
    check('the paper\'s Redo brings it back', allNotes(await stored(page))[0].ink.length === 2 && (await editorState(page)).paths === 2);

    // Eraser: a sweep removes the strokes it touches, as one Undo step.
    await page.click('#stickyEraser');
    check('the eraser is on', await page.getAttribute('#stickyEraser', 'aria-pressed') === 'true');
    await stroke(page, 'pen', .35, .05, .35, .45);
    ch = await stored(page);
    check('an eraser sweep removes the stroke it crosses and leaves the other', allNotes(ch)[0].ink.length === 1 && Math.abs(allNotes(ch)[0].ink[0].points[0][1] - .6) < .02, allNotes(ch)[0].ink);
    await page.click('#stickyInkUndo'); await page.waitForTimeout(100);
    check('Undo restores the erased stroke', allNotes(await stored(page))[0].ink.length === 2);
    await page.click('#stickyEraser');

    // Handwriting alone keeps the note.
    await page.click('#stickyClose');
    ch = await stored(page);
    check('closing a note that holds only handwriting keeps it', allNotes(ch).length === 1 && allNotes(ch)[0].ink.length === 2 && await page.locator('#stickyEditor').isHidden());
    await page.locator('#pdfFrame .pdf-sticky').click();
    st = await editorState(page);
    check('reopening it shows the handwriting, in Write', st.open && st.mode === 'write' && st.paths === 2 && !st.hint, st);

    // Typing a key in Write goes to Type with that key.
    await page.focus('#stickyPad');
    await page.keyboard.type('Check Fig. 3');
    st = await editorState(page);
    check('a key typed in Write switches to Type and keeps typing', st.mode === 'type' && st.focus === 'stickyText' && await page.inputValue('#stickyText') === 'Check Fig. 3', st);
    check('the handwriting stays on the note while typing', st.paths === 2 && allNotes(await stored(page))[0].text === 'Check Fig. 3');
    // A Pencil on a note in Type writes again.
    await stroke(page, 'pen', .6, .7, .9, .75);
    st = await editorState(page);
    check('a Pencil on the note in Type goes back to Write and draws', st.mode === 'write' && st.focus === 'stickyPad' && st.paths === 3 && allNotes(await stored(page))[0].ink.length === 3, st);
    await page.click('[data-sticky-mode="type"]');
    check('the Type button opens the keyboard on the note', (await editorState(page)).focus === 'stickyText' && (await editorState(page)).mode === 'type');
    await page.click('[data-sticky-mode="write"]');
    check('the Write button goes back to the writing face', (await editorState(page)).focus === 'stickyPad' && (await editorState(page)).mode === 'write');
    await page.keyboard.press('Escape');

    // A mouse placement opens in Type, ready for the keyboard.
    await arm(page);
    await page.mouse.click(...Object.values(await sheetPoint(page, .7, .6)));
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    st = await editorState(page);
    check('a note placed with a mouse opens in Type', st.mode === 'type' && st.focus === 'stickyText', st);
    const clear = await page.evaluate(() => { const e = document.getElementById('stickyEditor').getBoundingClientRect(), d = document.getElementById('zenDock').getBoundingClientRect(); return e.right <= d.left || e.left >= d.right || e.bottom <= d.top || e.top >= d.bottom; });
    check('an open note near the dock keeps clear of it', clear);
    await page.keyboard.type('Typed only');
    await page.click('#stickyClose');
    const typedId = allNotes(await stored(page)).find(n => n.text === 'Typed only').id;
    await page.locator(`#pdfFrame .pdf-sticky[data-sticky-id="${typedId}"]`).click();
    check('a note with only words reopens in Type', (await editorState(page)).mode === 'type');
    await page.keyboard.press('Escape');

    // A new note written and then erased to nothing leaves nothing behind.
    await arm(page);
    await tap(page, await sheetPoint(page, .5, .85), 'touch');
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    check('a note placed with a finger opens in Write', (await editorState(page)).mode === 'write');
    await stroke(page, 'mouse', .2, .5, .8, .5);
    await page.click('#stickyEraser'); await stroke(page, 'mouse', .5, .1, .5, .9);
    await page.click('#stickyClose');
    ch = await stored(page);
    check('a new note erased back to nothing is removed when it closes', allNotes(ch).length === 2 && await toast(page) === 'Empty note removed');

    // Reload, Notebook, export.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="1"] canvas')?.width && document.body.classList.contains('zen'));
    await page.waitForTimeout(500);
    hand = allNotes(await stored(page)).find(n => n.ink);
    await page.locator(`#pdfFrame .pdf-sticky[data-sticky-id="${hand.id}"]`).click();
    check('after reload the handwriting is back on the note', (await editorState(page)).paths === 3);
    await page.keyboard.press('Escape');
    // Clear the typed words so this note is handwriting only, for the Notebook and export.
    await page.locator(`#pdfFrame .pdf-sticky[data-sticky-id="${hand.id}"]`).click();
    await page.click('[data-sticky-mode="type"]'); await page.fill('#stickyText', ''); await page.click('#stickyClose');
    ch = await stored(page);
    check('clearing the words of a handwritten note keeps it', allNotes(ch).some(n => n.id === hand.id && n.text === '' && n.ink.length === 3));
    await page.click('#zenMore'); await page.click('#zenNotebook'); await page.waitForTimeout(250);
    const entry = page.locator(`#noteIndex [data-jump-sticky="${hand.id}"]`);
    check('the Notebook shows a handwritten note with its handwriting', (await entry.textContent()).includes('Handwritten note') && await entry.locator('svg.sticky-mini-ink path').count() === 3);
    const exported = await page.evaluate(async ({ base64, ch }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer, built = await window.__phloemBuildAnnotatedPdf(ch, bytes);
      const pdfjs = await import('/vendor/pdfjs/pdf.min.js'); pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.compat.js';
      const doc = await pdfjs.getDocument({ data: built.bytes.slice(0) }).promise, p = await doc.getPage(1);
      return (await p.getAnnotations()).filter(a => a.subtype === 'Text').map(a => a.contentsObj ? a.contentsObj.str : a.contents);
    }, { base64: pdfBytes.toString('base64'), ch });
    check('Export annotated PDF still marks a handwritten note with a comment at its spot', exported.includes('(Handwritten note)') && exported.includes('Typed only'), exported);

    check('no page errors', errors.length === 0, errors);
    console.log(`${checks} checks passed in ${ENGINE}`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
