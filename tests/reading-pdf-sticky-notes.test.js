/* Sticky notes on PDF pages (reader feedback: "we cannot add the notes in the original pdf
   like the sticky notes"). Pick Sticky note in the ✎ menu, tap a spot with a mouse, Pencil
   or finger, type; the folded note stays at that spot in every layout and zoom, on rotated
   and cropped pages, after reload, in the Notebook, and in Export annotated PDF as a PDF
   comment centred on the same spot. Synced libraries are also merged by older installed
   copies of Phloem: the first part runs the frozen v206 merge code (tests/fixtures) as such
   a copy and checks a full sync round trip never loses or resurrects a note.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), vm = require('node:vm');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const { PDFDocument, StandardFonts, degrees } = require('pdf-lib');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0;
function check(name, condition, extra) { checks++; assert.ok(condition, name + (extra === undefined ? '' : ' [' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) + ']')); console.log('PASS  ' + name); }
const plain = value => JSON.parse(JSON.stringify(value));

/* ---- Part 1: sync merges, including an older installed version ---- */
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readerSource = read('reading.js');
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'reader section exists: ' + start);
  return source.slice(from, to);
}
const NEW_MERGE = [
  section(readerSource, '  function normalize(ch,options){', '\n  var pendingDuplicateStorage'),
  section(readerSource, '  function mergePdfInk(', '\n  function pdfInkStamp('),
  section(readerSource, '  function mergeDuplicateRecord(', '\n  function canonicalPaper('),
  section(readerSource, '  var STAMPED_FIELDS=', '\n  // Typing saves once'),
  section(readerSource, '  function mergeState(inc){', '\n  var syncDecryptBlocked')
].join('\n');
const OLD_MERGE = read('tests/fixtures/reading-merge-v206.js');
let clock = 1000;
// One device: its library, the real merge code of its version, and stubs for unrelated parts.
function device(code, chapters, stickyModule) {
  const ctx = vm.createContext({ window: {}, console, state: { chapters: plain(chapters), deleted: {}, merged: {} }, currentId: null,
    now: () => clock, normalizedPdfPosition: () => null, newerPdfPosition: () => null, reviewStateStamp: () => 0, copyReviewState: target => target,
    saveDerivedSoon() {}, derivedData: () => null, mergeDerivedInto: () => false, migrateReviewWorkspaceLabels: () => false,
    duplicateGroups: () => [], titleQuality: () => 0, mergeTags: (a, b) => [...(a || []), ...(b || [])], mergeItemArrays: (a, b) => [...(a || []), ...(b || [])],
    mergeNoteMap: (a, b) => ({ ...a, ...b }), mergeHighlightMap: (a, b) => ({ ...a, ...b }), mergeReviews: (a, b) => ({ ...a, ...b }), mergeLookups: (a, b) => ({ ...a, ...b }) });
  vm.runInContext(read('reading-ink.js'), ctx, { filename: 'reading-ink.js' });
  if (stickyModule) vm.runInContext(read('reading-stickies.js'), ctx, { filename: 'reading-stickies.js' });
  vm.runInContext('function find(id){return state.chapters.find(function(c){return c.id===id;});}\n' + code, ctx);
  ctx.state.chapters = ctx.state.chapters.map(ch => ctx.normalize(ch));
  return ctx;
}
const newDevice = chapters => device(NEW_MERGE, chapters, true);
const oldDevice = chapters => device(OLD_MERGE, chapters, false);
// What a provider (iCloud, Drive or GitHub) carries: the library as JSON.
const upload = dev => plain({ chapters: dev.state.chapters, deleted: dev.state.deleted, merged: dev.state.merged });
// Quit and reopen: the saved JSON is read back through that version's normalize.
function reopen(dev) { dev.state.chapters = plain(dev.state.chapters).map(ch => dev.normalize(ch)); }
const paper = dev => dev.state.chapters.find(ch => ch.id === 'paper');
const notes = ch => Object.values(ch.pdfStickies || {}).flat().map(n => n.id + ':' + n.text).sort();
const note = (id, text, at, extra = {}) => ({ id, x: .4, y: .3, text, color: 'yellow', at, updatedAt: at, ...extra });

function syncTests() {
  const sm = device('', [], true).window.PhloemStickies;
  const merged = sm.merge({ 1: [note('a', 'one', 10)] }, { gone: 30 }, { 1: [note('a', 'one, edited', 20)], 2: [note('gone', 'old', 12), note('b', 'two', 15)] }, {});
  check('notes merge one by one: the newer edit wins, a tombstone removes its note', JSON.stringify(notes({ pdfStickies: merged.pages })) === JSON.stringify(['a:one, edited', 'b:two']) && merged.deleted.gone === 30);
  check('merge order does not matter (two devices converge on the same notes)', sm.signature(merged.pages, merged.deleted) === sm.signature(sm.merge({ 1: [note('a', 'one, edited', 20)], 2: [note('gone', 'old', 12), note('b', 'two', 15)] }, {}, { 1: [note('a', 'one', 10)] }, { gone: 30 }).pages, { gone: 30 }));
  const restored = sm.merge({ 1: [note('a', 'back', 40)] }, { a: 30 }, {}, {});
  check('a note restored by Undo after its deletion outlives the older tombstone', notes({ pdfStickies: restored.pages })[0] === 'a:back');
  const odd = sm.normalize({ 1: [{ ...note('k', 'kept', 5), futureField: { pin: true } }, { id: '__proto__', x: .1, y: .1 }, { id: 'bad', x: 'left', y: .2 }, { ...note('far', 'x', 6), x: 4, y: -1, color: '<b>' }], zero: [note('z', 'z', 1)] }, {});
  check('normalize keeps fields a later version adds and rejects malformed or unsafe notes', Object.keys(odd.pages).join() === '1' && odd.pages[1].length === 2 && odd.pages[1][0].futureField.pin === true
    && odd.pages[1][1].x === 1 && odd.pages[1][1].y === 0 && odd.pages[1][1].color === 'yellow', odd);

  // A note made on this version; an older copy elsewhere edited the same paper afterwards.
  clock = 5000;
  const fresh = newDevice([{ id: 'paper', kind: 'pdf', addedAt: 1, updatedAt: 100, title: 'Paper', pdfStickies: { 2: [note('n1', 'Check Fig. 2', 90)] }, pdfStickiesDeleted: {} }]);
  const older = oldDevice([{ id: 'paper', kind: 'pdf', addedAt: 1, updatedAt: 200, title: 'Paper', pageNotes: { 1: 'written on the old version' } }]);
  older.mergeState(upload(fresh)); reopen(older);
  check('(the hazard) an older copy whose paper is newer drops the unknown notes field when it merges', paper(older).pdfStickies === undefined);
  fresh.mergeState(upload(older));
  check('this version keeps its notes when that older copy comes back without them', JSON.stringify(notes(paper(fresh))) === '["n1:Check Fig. 2"]' && paper(fresh).pageNotes[1] === 'written on the old version');
  check('and stamps the merged paper newer than the older copy, so that copy takes it next', paper(fresh).updatedAt === 201, paper(fresh).updatedAt);
  older.mergeState(upload(fresh)); reopen(older);
  check('the older copy now takes the whole paper and keeps the notes through save and reopen', JSON.stringify(notes(paper(older))) === '["n1:Check Fig. 2"]');
  paper(older).pageNotes = { 1: 'edited again on the old version' }; paper(older).updatedAt = 300; reopen(older);
  fresh.mergeState(upload(older));
  check('its next edit carries the notes along untouched, so no further restamp is needed', JSON.stringify(notes(paper(fresh))) === '["n1:Check Fig. 2"]' && paper(fresh).updatedAt === 300 && paper(fresh).pageNotes[1] === 'edited again on the old version');

  // Edit and delete on this version while the older copy still holds the earlier text.
  const n1 = paper(fresh).pdfStickies[2][0]; n1.text = 'Check Fig. 2 and Table 1'; n1.updatedAt = 400; paper(fresh).updatedAt = 400;
  paper(older).title = 'Paper (renamed on old)'; paper(older).updatedAt = 450;
  fresh.mergeState(upload(older));
  check('a newer note edit survives an older copy that is newer overall but holds stale text', JSON.stringify(notes(paper(fresh))) === '["n1:Check Fig. 2 and Table 1"]' && paper(fresh).updatedAt === 451);
  older.mergeState(upload(fresh)); reopen(older);
  const target = paper(fresh); target.pdfStickiesDeleted = { n1: 500 }; target.pdfStickies = {}; target.updatedAt = 500;
  older.mergeState(upload(fresh)); reopen(older);
  check('a deletion reaches the older copy as a tombstone', notes(paper(older)).length === 0 && paper(older).pdfStickiesDeleted.n1 === 500);
  const stale = plain(paper(older)); stale.pdfStickies = { 2: [note('n1', 'Check Fig. 2', 90)] }; stale.pdfStickiesDeleted = {}; stale.updatedAt = 600;
  fresh.mergeState({ chapters: [stale], deleted: {}, merged: {} });
  check('a stale copy that still has the deleted note cannot bring it back', notes(paper(fresh)).length === 0 && paper(fresh).pdfStickiesDeleted.n1 === 500);

  // Two current devices settle without stamping each other forever.
  const left = newDevice([{ id: 'paper', kind: 'pdf', addedAt: 1, updatedAt: 700, pdfStickies: { 1: [note('l', 'left', 650)] }, pdfStickiesDeleted: { x: 1 } }]);
  const right = newDevice([{ id: 'paper', kind: 'pdf', addedAt: 1, updatedAt: 700, pdfStickies: { 3: [note('r', 'right', 660)] }, pdfStickiesDeleted: { y: 2 } }]);
  left.mergeState(upload(right)); right.mergeState(upload(left)); const settled = paper(right).updatedAt;
  left.mergeState(upload(right)); right.mergeState(upload(left));
  check('two current devices end with the same notes and stop restamping', JSON.stringify(notes(paper(left))) === JSON.stringify(notes(paper(right))) && notes(paper(left)).length === 2 && paper(right).updatedAt === settled && paper(left).updatedAt === settled);
  const keep = { id: 'paper', kind: 'pdf', addedAt: 1, updatedAt: 10, pdfStickies: { 1: [note('k1', 'keep', 5)] } }, extra = { id: 'copy', kind: 'pdf', addedAt: 2, updatedAt: 20, pdfStickies: { 1: [note('e1', 'extra', 6)] }, pdfStickiesDeleted: { k0: 3 } };
  const dup = newDevice([]); dup.mergeDuplicateRecord(keep, extra);
  check('merging a duplicate import keeps the notes of both copies', JSON.stringify(notes(keep)) === '["e1:extra","k1:keep"]' && keep.pdfStickiesDeleted.k0 === 3);
  const untouched = newDevice([{ id: 'plain', kind: 'pdf', addedAt: 1, updatedAt: 10 }]);
  untouched.mergeState({ chapters: [{ id: 'plain', kind: 'pdf', addedAt: 1, updatedAt: 20 }] });
  check('papers without notes gain no sticky fields', !('pdfStickies' in untouched.state.chapters[0]) && untouched.state.chapters[0].updatedAt === 20);
}

/* ---- Part 2: the reader ---- */
async function makePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const one = doc.addPage([612, 792]);
  for (let line = 0; line < 12; line++) one.drawText('Line ' + (line + 1) + ' of the sticky note fixture with ordinary words', { x: 72, y: 720 - line * 26, size: 14, font });
  const two = doc.addPage([612, 792]); two.setRotation(degrees(90)); two.drawText('ROTATED PAGE', { x: 200, y: 300, size: 18, font });
  const three = doc.addPage([612, 792]); three.setCropBox(50, 50, 512, 692); three.drawText('CROPPED PAGE', { x: 120, y: 500, size: 18, font });
  return Buffer.from(await doc.save());
}
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'reading.html' : p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(b); }); });
// Typing saves after a short pause (and at once when the note closes), like other notes.
async function stored(page) {
  await page.waitForTimeout(1500);
  return page.evaluate(() => { const id = localStorage.getItem('readingRoom.lastOpen.v1'); return JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(c => c.id === id); });
}
const allNotes = ch => Object.entries(ch.pdfStickies || {}).flatMap(([page, list]) => list.map(item => ({ page: +page, ...item })));
// A point on a page as a fraction of its sheet, scrolled into view first.
async function sheetPoint(page, number, u, v) {
  return page.locator('.pdf-page[data-page="' + number + '"] .pdf-sheet').evaluate((el, at) => {
    const pane = document.getElementById('documentPane'), p = pane.getBoundingClientRect(); let r = el.getBoundingClientRect();
    const y = r.top + r.height * at.v; if (y < p.top + 60 || y > p.bottom - 60) { pane.scrollTop += y - (p.top + p.height / 2); r = el.getBoundingClientRect(); }
    return { x: r.left + r.width * at.u, y: r.top + r.height * at.v };
  }, { u, v });
}
// Where a note's icon sits, as a fraction of its page sheet, plus its size in pixels.
async function iconSpot(page, id) {
  return page.evaluate(id => {
    const b = Array.from(document.querySelectorAll('#pdfFrame .pdf-sticky')).find(x => x.dataset.stickyId === id); if (!b) return null;
    const s = b.closest('.pdf-sheet').getBoundingClientRect(), r = b.getBoundingClientRect();
    return { u: (r.left + r.width / 2 - s.left) / s.width, v: (r.top + r.height / 2 - s.top) / s.height, size: b.offsetWidth, page: +b.dataset.stickyPage };
  }, id);
}
const near = (a, b, tol = .006) => Math.abs(a - b) <= tol;
async function scrollToPage(page, number) {
  await page.locator('.pdf-page[data-page="' + number + '"]').evaluate(el => { const pane = document.getElementById('documentPane'); pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 20; });
  await page.waitForFunction(n => { const v = document.querySelector('.pdf-page[data-page="' + n + '"] canvas'); return v && v.width > 0; }, number);
  await page.waitForTimeout(150);
}
async function arm(page) {
  if (!await page.locator('#zenAnnotateMenu').isVisible()) await page.click('#zenAnnotate');
  await page.click('#zenSticky');
  await page.waitForFunction(() => document.body.classList.contains('pdf-sticky-placing'));
}
// A synthetic Pencil or finger tap in the order WebKit delivers it: pointer, touch, click.
async function tap(page, at, pointerType) {
  return page.evaluate(({ at, pointerType }) => {
    const target = document.elementFromPoint(at.x, at.y), id = pointerType === 'pen' ? 71 : 72, out = [];
    const pointer = type => { const e = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType, pointerId: id, isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: at.x, clientY: at.y, pressure: type === 'pointerdown' ? .5 : 0 }); target.dispatchEvent(e); out.push(type + (e.defaultPrevented ? '!' : '')); };
    const touch = type => { const t = { identifier: 9, target, touchType: pointerType === 'pen' ? 'stylus' : 'direct', clientX: at.x, clientY: at.y, pageX: at.x, pageY: at.y, force: .5 }; const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(e, { changedTouches: { value: [t] }, touches: { value: type === 'touchstart' ? [t] : [] }, targetTouches: { value: type === 'touchstart' ? [t] : [] } }); target.dispatchEvent(e); out.push(type + (e.defaultPrevented ? '!' : '')); return e.defaultPrevented; };
    pointer('pointerdown'); const owned = touch('touchstart'); pointer('pointerup'); touch('touchend');
    if (!owned) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, detail: 1, button: 0 }));
    return out.join(' ');
  }, { at, pointerType });
}
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
  await page.mouse.up(); await page.waitForTimeout(120);
}
async function undo(page) { await page.click('#zenUndo'); await page.waitForTimeout(120); }
async function redo(page) { if (!await page.locator('#zenAnnotateMenu').isVisible()) await page.click('#zenAnnotate'); await page.click('#zenRedo'); await page.waitForTimeout(120); }
const toast = page => page.locator('#readerToast').textContent();

(async () => {
  syncTests();
  await new Promise(res => server.listen(0, '127.0.0.1', res)); const port = server.address().port;
  const browser = await playwright[ENGINE].launch();
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } }), page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${port}/reading.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('library-ready'));
    const pdfBytes = await makePdf();
    await page.locator('#pdfFile').setInputFiles({ name: 'sticky-notes.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="1"] canvas')?.width && document.body.classList.contains('zen'));
    await page.waitForTimeout(400);

    check('a PDF shows Sticky note in the ✎ menu, the toolbar and the touch dock', await page.evaluate(() => ['zenSticky', 'pdfStickyBtn', 'touchSticky'].every(id => !document.getElementById(id).classList.contains('hidden'))));
    await arm(page);
    check('choosing Sticky note arms placing and marks the tool on', await page.getAttribute('#zenSticky', 'aria-pressed') === 'true' && (await page.getAttribute('#zenAnnotate', 'aria-label')).includes('Sticky note active') && await toast(page) === 'Tap the page to place a note');
    await page.click('#zenAnnotate');
    check('tapping ✎ while placing ends it (second tap closes)', !await page.evaluate(() => document.body.classList.contains('pdf-sticky-placing')) && await page.getAttribute('#zenSticky', 'aria-pressed') === 'false' && !await page.locator('#zenAnnotateMenu').isVisible());

    // Mouse: tap the spot, the note opens for typing.
    await arm(page);
    await page.mouse.click(...Object.values(await sheetPoint(page, 1, .3, .25)));
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    check('a mouse tap places a note there and opens it for typing', await page.evaluate(() => document.activeElement.id) === 'stickyText' && !await page.evaluate(() => document.body.classList.contains('pdf-sticky-placing')));
    await page.keyboard.type('Mouse note');
    let ch = await stored(page), mouseNote = allNotes(ch)[0];
    check('its text and spot are saved with the paper', allNotes(ch).length === 1 && mouseNote.text === 'Mouse note' && mouseNote.page === 1 && near(mouseNote.x, .3) && near(mouseNote.y, .25), mouseNote);
    let spot = await iconSpot(page, mouseNote.id);
    check('the folded-note icon is centred on the tapped spot', spot && near(spot.u, .3, .004) && near(spot.v, .25, .004), spot);
    await page.mouse.click(...Object.values(await sheetPoint(page, 1, .8, .9)));
    check('a press elsewhere on the page closes the note without placing another', await page.locator('#stickyEditor').isHidden() && allNotes(await stored(page)).length === 1);

    // Pencil: the highlighter must not take the tap.
    await arm(page);
    const penTrace = await tap(page, await sheetPoint(page, 1, .7, .6), 'pen');
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    await page.keyboard.type('Pencil note');
    ch = await stored(page);
    const penNote = allNotes(ch).find(n => n.text === 'Pencil note');
    check('a Pencil tap places a note without starting a highlight', penNote && near(penNote.x, .7) && near(penNote.y, .6) && !Object.values(ch.highlights || {}).flat().length, penTrace);
    await page.keyboard.press('Escape');
    check('Escape closes the note and stays on the paper', await page.locator('#stickyEditor').isHidden() && await page.locator('#readerPage').isVisible());

    // Finger.
    await arm(page);
    await tap(page, await sheetPoint(page, 1, .5, .82), 'touch');
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    await page.keyboard.type('Finger');
    await page.click('[data-sticky-color="coral"]');
    await page.keyboard.type(' note');
    check('choosing a color keeps typing in the note', await page.evaluate(() => document.activeElement.id) === 'stickyText' && await page.inputValue('#stickyText') === 'Finger note');
    await page.click('#stickyClose');
    ch = await stored(page);
    check('a finger tap places a note too', allNotes(ch).some(n => n.text === 'Finger note' && n.color === 'coral' && near(n.x, .5) && near(n.y, .82)));

    // A stray placement with no words leaves nothing behind.
    const undoBefore = await page.locator('#zenUndo').isDisabled();
    await arm(page);
    await page.mouse.click(...Object.values(await sheetPoint(page, 1, .15, .7)));
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    await page.keyboard.press('Escape');
    check('closing a new note with no words removes it', allNotes(await stored(page)).length === 3 && await toast(page) === 'Empty note removed' && await page.locator('#zenUndo').isDisabled() === undoBefore);

    // Open, edit, second tap closes.
    let icon = () => page.locator(`#pdfFrame .pdf-sticky[data-sticky-id="${mouseNote.id}"]`);
    await icon().click();
    check('tapping a note opens it with its text', await page.locator('#stickyEditor').isVisible() && await page.inputValue('#stickyText') === 'Mouse note' && await icon().getAttribute('aria-expanded') === 'true');
    await icon().click();
    check('tapping the open note again closes it', await page.locator('#stickyEditor').isHidden() && await icon().getAttribute('aria-expanded') === 'false');
    await icon().click(); await page.click('#stickyText'); await page.keyboard.press('End'); await page.keyboard.type(' + more');
    await page.click('#stickyClose');
    check('editing saves the new text', allNotes(await stored(page)).find(n => n.id === mouseNote.id).text === 'Mouse note + more' && (await icon().getAttribute('aria-label')).includes('Mouse note + more'));

    // Color, with Undo/Redo.
    await icon().click(); await page.click('[data-sticky-color="mint"]');
    check('a note takes a highlight-palette color', allNotes(await stored(page)).find(n => n.id === mouseNote.id).color === 'mint' && (await icon().getAttribute('class')).includes('st-mint') && await page.getAttribute('#stickyEditor', 'data-color') === 'mint');
    await undo(page);
    check('Undo restores its color', allNotes(await stored(page)).find(n => n.id === mouseNote.id).color === 'yellow');
    await redo(page);
    check('Redo reapplies it', allNotes(await stored(page)).find(n => n.id === mouseNote.id).color === 'mint');
    // Opening ✎ for Redo was a press outside the note, so it closed.
    await page.waitForFunction(() => document.getElementById('stickyEditor').classList.contains('hidden'));

    // Drag to move, with Undo/Redo.
    const box = await icon().boundingBox();
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await sheetPoint(page, 1, .5, .45));
    ch = await stored(page); let moved = allNotes(ch).find(n => n.id === mouseNote.id);
    check('dragging a note moves it and does not open it', near(moved.x, .5) && near(moved.y, .45) && await page.locator('#stickyEditor').isHidden(), moved);
    await undo(page);
    moved = allNotes(await stored(page)).find(n => n.id === mouseNote.id); spot = await iconSpot(page, mouseNote.id);
    check('Undo moves it back', near(moved.x, .3) && near(moved.y, .25) && near(spot.u, .3, .004) && near(spot.v, .25, .004), { moved, spot });
    await redo(page);
    moved = allNotes(await stored(page)).find(n => n.id === mouseNote.id);
    check('Redo moves it again', near(moved.x, .5) && near(moved.y, .45));

    // Delete from the open note, with Undo.
    await icon().click(); await page.click('#stickyDelete');
    ch = await stored(page);
    check('Delete in the open note removes it and records a tombstone', !allNotes(ch).some(n => n.id === mouseNote.id) && ch.pdfStickiesDeleted[mouseNote.id] > 0 && await icon().count() === 0 && await page.locator('#stickyEditor').isHidden());
    await undo(page);
    ch = await stored(page); const back = allNotes(ch).find(n => n.id === mouseNote.id);
    check('Undo brings the deleted note back, newer than its tombstone', back && back.text === 'Mouse note + more' && back.updatedAt > ch.pdfStickiesDeleted[mouseNote.id] && await icon().count() === 1);

    // Rotated page 2 and cropped page 3.
    await scrollToPage(page, 2); await arm(page);
    await page.mouse.click(...Object.values(await sheetPoint(page, 2, .25, .7)));
    await page.waitForSelector('#stickyEditor:not(.hidden)'); await page.keyboard.type('Rotated note'); await page.click('#stickyClose');
    await scrollToPage(page, 3); await arm(page);
    await page.mouse.click(...Object.values(await sheetPoint(page, 3, .62, .4)));
    await page.waitForSelector('#stickyEditor:not(.hidden)'); await page.keyboard.type('Cropped note'); await page.click('#stickyClose');
    ch = await stored(page);
    const rotated = allNotes(ch).find(n => n.text === 'Rotated note'), cropped = allNotes(ch).find(n => n.text === 'Cropped note');
    const pageBoxes = await page.evaluate(() => [2, 3].map(n => { const r = document.querySelector('.pdf-page[data-page="' + n + '"] .pdf-sheet').getBoundingClientRect(); return r.width > r.height; }));
    check('notes land on a rotated (landscape) page and a cropped page at the tapped spots', rotated.page === 2 && near(rotated.x, .25) && near(rotated.y, .7) && cropped.page === 3 && near(cropped.x, .62) && near(cropped.y, .4) && pageBoxes[0] && !pageBoxes[1], { rotated, cropped, pageBoxes });

    // Every layout and zoom keeps each note on its spot.
    const expected = allNotes(ch).map(n => ({ id: n.id, page: n.page, x: n.x, y: n.y }));
    // Scroll brings a page into view; Page and Book turn to it.
    async function bringPage(n) {
      for (let i = 0; i < 8; i++) {
        const shown = await page.evaluate(n => {
          const el = document.querySelector('.pdf-page[data-page="' + n + '"]');
          if (!document.getElementById('pdfFrame').classList.contains('paged-pdf-flow')) { el.scrollIntoView({ block: 'center' }); return true; }
          if (el.getClientRects().length) return true;
          const visible = Array.from(document.querySelectorAll('#pdfFrame .pdf-page')).filter(p => p.getClientRects().length).map(p => +p.dataset.page);
          document.getElementById(visible.length && Math.min(...visible) > n ? 'prevPage' : 'nextPage').click(); return false;
        }, n);
        if (shown) return; await page.waitForTimeout(800);
      }
    }
    async function allOnSpot(label) {
      const misses = [];
      for (const n of expected) {
        await bringPage(n.page);
        await page.waitForFunction(id => !!Array.from(document.querySelectorAll('#pdfFrame .pdf-sticky')).find(x => x.dataset.stickyId === id && x.getClientRects().length), n.id, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(100);
        const at = await iconSpot(page, n.id);
        if (!at || !near(at.u, n.x, .005) || !near(at.v, n.y, .005)) misses.push({ id: n.id, at, want: [n.x, n.y] });
      }
      check(label, !misses.length, misses);
    }
    await allOnSpot('in Scroll layout every note sits on its spot');
    const sizeAtFit = (await iconSpot(page, rotated.id)).size;
    await page.evaluate(() => { document.getElementById('zoomIn').click(); document.getElementById('zoomIn').click(); });
    await page.waitForTimeout(900);
    await allOnSpot('zoomed in, every note stays on its spot');
    const sizeZoomed = (await iconSpot(page, rotated.id)).size;
    check('the note icon grows with the page when zoomed', sizeZoomed > sizeAtFit, { sizeAtFit, sizeZoomed });
    await page.evaluate(() => { document.getElementById('zoomOut').click(); document.getElementById('zoomOut').click(); }); await page.waitForTimeout(600);
    for (const layout of ['page', 'book']) {
      await page.evaluate(l => document.querySelector('[data-zen-pdf-layout="' + l + '"]').click(), layout); await page.waitForTimeout(900);
      await allOnSpot(`in ${layout[0].toUpperCase() + layout.slice(1)} layout every note sits on its spot`);
    }
    // Placing works on a Book leaf too, by mouse and by finger, near the page-turn edge;
    // Undo takes each placement back.
    await bringPage(1);
    for (const [how, u] of [['mouse', .93], ['touch', .5]]) {
      await arm(page);
      const at = await sheetPoint(page, 1, u, .55), turned = await page.evaluate(() => document.getElementById('pageNumber').textContent);
      if (how === 'mouse') await page.mouse.click(at.x, at.y); else await tap(page, at, 'touch');
      await page.waitForSelector('#stickyEditor:not(.hidden)'); await page.keyboard.type('Book ' + how);
      const leaf = allNotes(await stored(page)).find(n => n.text === 'Book ' + how);
      check(`in Book layout a ${how} tap places a note on the leaf without turning it`, leaf && leaf.page === 1 && near(leaf.x, u, .03) && near(leaf.y, .55) && await page.evaluate(() => document.getElementById('pageNumber').textContent) === turned, leaf);
      await page.click('#stickyClose'); await undo(page);
      check(`Undo takes that ${how} placement back`, !allNotes(await stored(page)).some(n => n.text === 'Book ' + how) && await toast(page) === 'Sticky note removed');
    }
    await page.evaluate(() => document.querySelector('[data-zen-pdf-layout="scroll"]').click()); await page.waitForTimeout(800);

    // Notebook lists the notes and jumps to them.
    await page.click('#zenMore'); await page.click('#zenNotebook'); await page.waitForTimeout(250);
    const entries = await page.locator('#noteIndex [data-jump-sticky]').allTextContents();
    check('the Notebook lists every sticky note with its page', entries.length === 5 && entries.some(t => t.includes('Rotated note') && t.includes('page 2')) && entries.some(t => t.includes('Mouse note + more') && t.includes('page 1')), entries);
    await scrollToPage(page, 1);
    await page.locator('#noteIndex [data-jump-sticky]', { hasText: 'Cropped note' }).click();
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    const jumped = await page.evaluate(id => { const b = Array.from(document.querySelectorAll('#pdfFrame .pdf-sticky')).find(x => x.dataset.stickyId === id), r = b.getBoundingClientRect(), p = document.getElementById('documentPane').getBoundingClientRect(); return { inView: r.top >= p.top && r.bottom <= p.bottom, top: r.top, pane: [p.top, p.bottom], sheet: document.getElementById('notebook').classList.contains('sheet-open') }; }, cropped.id);
    const jumpText = await page.inputValue('#stickyText');
    check('choosing one jumps to its spot and opens it', jumped.inView && jumpText === 'Cropped note' && !jumped.sheet, { jumped, jumpText });
    await page.keyboard.press('Escape');

    // Beside an open Workspace the note opens on the paper's side.
    await page.click('#zenWorkspace');
    await page.waitForFunction(() => document.body.classList.contains('workspace-open')); await page.waitForTimeout(900);
    await bringPage(1);
    const besideId = allNotes(await stored(page)).find(n => n.text === 'Pencil note').id;
    await page.locator(`#pdfFrame .pdf-sticky[data-sticky-id="${besideId}"]`).click();
    await page.waitForSelector('#stickyEditor:not(.hidden)');
    const beside = await page.evaluate(() => { const e = document.getElementById('stickyEditor').getBoundingClientRect(), p = document.getElementById('documentPane').getBoundingClientRect(); return { inside: e.left >= p.left - .5 && e.right <= p.right + .5 && e.top >= p.top - .5 && e.bottom <= p.bottom + .5, e: [e.left, e.right], p: [p.left, p.right] }; });
    check('with the Workspace open, an open note stays on the paper', beside.inside, beside);
    await page.keyboard.press('Escape');
    await page.click('#zenWorkspace'); await page.waitForFunction(() => !document.body.classList.contains('workspace-open')); await page.waitForTimeout(600);

    // Reload: everything comes back where it was.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.pdf-page[data-page="1"] canvas')?.width && document.body.classList.contains('zen'));
    await page.waitForTimeout(500);
    await allOnSpot('after reload every note is back on its spot');

    // Export: each note is a PDF comment centred on its spot, whatever the page box.
    ch = await stored(page);
    const exported = await page.evaluate(async ({ base64, ch }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer, built = await window.__phloemBuildAnnotatedPdf(ch, bytes);
      const pdfjs = await import('/vendor/pdfjs/pdf.min.js'); pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.compat.js';
      const doc = await pdfjs.getDocument({ data: built.bytes.slice(0) }).promise, out = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const p = await doc.getPage(n), view = p.getViewport({ scale: 1 });
        (await p.getAnnotations()).filter(a => a.subtype === 'Text').forEach(a => {
          const r = view.convertToViewportRectangle(a.rect), cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
          out.push({ page: n, text: a.contentsObj ? a.contentsObj.str : a.contents, u: cx / view.width, v: cy / view.height, color: Array.from(a.color || []) });
        });
      }
      return { counts: built.counts, out };
    }, { base64: pdfBytes.toString('base64'), ch });
    const misplaced = allNotes(ch).filter(n => !exported.out.some(a => a.page === n.page && a.text === n.text && near(a.u, n.x, .004) && near(a.v, n.y, .004)));
    check('Export annotated PDF writes every note as a PDF comment at its exact spot (rotated and cropped pages too)', exported.out.length === 5 && !misplaced.length && exported.counts.notes === 5, { exported, misplaced });
    check('exported comments keep the note color', exported.out.find(a => a.text === 'Mouse note + more').color.join() === '92,213,145');

    check('no page errors', errors.length === 0, errors);
    console.log(`${checks} checks passed in ${ENGINE}`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
