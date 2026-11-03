/* Shelves and Tidy library end to end. New papers land on a shelf from each import path;
   the library groups by shelf, by reading list or not at all; the wall's shelf pills wrap,
   and only the open shelf carries rename and reorder controls. A tidy previews without
   writing anything, applies only what is ticked, keeps a backup in IndexedDB and undoes
   as new changes, also once localStorage is full. Shelves stay plain categories, so an
   older Phloem reads them as it always has.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_SHELVES_TEST_PORT || 8197);
const BASE = 'http://127.0.0.1:' + PORT;
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

// One Helvetica page with the given lines.
function onePagePdf(lines) {
  const escape = line => line.replace(/[\\()]/g, '\\$&');
  const stream = 'BT /F1 13 Tf 17 TL 60 720 Td\n' + lines.map(line => '(' + escape(line) + ') Tj').join(' T*\n') + '\nET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => { const at = pdf.length; pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n'; return at; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}
// A Word draft: a stored (uncompressed) ZIP holding word/document.xml.
function wordDraft(paragraphs) {
  const u16 = value => [value & 255, (value >>> 8) & 255], u32 = value => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  const xml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + paragraphs.map(text => '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>';
  const name = Buffer.from('word/document.xml'), data = Buffer.from(xml);
  const local = Buffer.from([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name, ...data]);
  const central = Buffer.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name]);
  const end = Buffer.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(local.length), ...u16(0)]);
  return Buffer.concat([local, central, end]);
}

function seed() {
  // A library shaped like the one shelves were built for. When the flag is set, this
  // device's localStorage is full: the library still saves to the IndexedDB snapshot.
  if (sessionStorage.getItem('shelvesFull')) {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && key === 'readingRoom.v1') { const error = new Error('The quota has been exceeded.'); error.name = 'QuotaExceededError'; throw error; }
      return setItem.call(this, key, value);
    };
  }
  if (localStorage.getItem('readingRoom.v1')) return;
  const stamp = Date.now();
  const paper = (id, title, extra) => Object.assign({ id, kind: 'text', title, authors: '', fr: 'First paragraph.\n\nSecond paragraph.', notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp - 1000, updatedAt: stamp - 1000, readPage: 1 }, extra);
  const pdf = (id, title, extra) => paper(id, title, Object.assign({ kind: 'pdf', fr: undefined, pageCount: 12, sourceName: id + '.pdf' }, extra));
  const chapters = [
    pdf('p_source', 'Source–sink interactions in tomato fruit', { category: 'academic', doi: '10.3389/fpls.2014.00516', authors: 'Osorio, Ruan & Fernie' }),
    paper('p_enrol', 'Proof of Enrolment', { category: 'academic' }),
    paper('p_meet', 'Supervisor meeting notes', { category: 'academic' }),
    pdf('p_book', 'Feedback Systems', { category: 'non-academic', pageCount: 400, authors: 'Åström & Murray' }),
    pdf('p_gerlin', 'A dynamic flux balance model of tomato fruit growth', { category: 'main', doi: '10.1093/insilicoplants/diab012', notes: { 0: 'kept copy note' } }),
    pdf('p_gerlin_copy', 'A dynamic flux balance model of tomato fruit growth', { doi: '10.1093/insilicoplants/diab012', notes: { 1: 'second copy note' }, addedAt: stamp - 900000 }),
    pdf('p_colombie', 'Colombié 2015', { category: 'main' }),
    pdf('p_coupling', 'Coupling precedent', { category: 'coupling' }),
    paper('p_review', 'My manuscript under revision', { category: 'In review', reviewWorkspace: true }),
    pdf('p_rec1', 'Recovered paper 1', { tags: ['recovered'], pageCount: 3 }),
    pdf('p_rec2', 'Recovered paper 2', { tags: ['recovered'], pageCount: 9 })
  ];
  const lists = { version: 1, deleted: {}, lists: [
    { id: 'L1', name: 'Manuscript: coupling precedents', rank: 1, createdAt: stamp - 5000, updatedAt: stamp - 5000 },
    { id: 'L2', name: 'Source–sink feedback', rank: 2, createdAt: stamp - 5000, updatedAt: stamp - 5000 }
  ], items: [
    { id: 'I1', listId: 'L1', kind: 'paper', title: 'Coupling precedent', paperId: 'p_coupling', rank: 1, createdAt: stamp - 4000, updatedAt: stamp - 4000 },
    { id: 'I2', listId: 'L2', kind: 'paper', title: 'Gerlin 2022', paperId: 'p_gerlin_copy', rank: 1, createdAt: stamp - 4000, updatedAt: stamp - 4000 },
    { id: 'I3', listId: 'L2', kind: 'paper', title: 'Source–sink interactions', paperId: 'p_source', rank: 2, createdAt: stamp - 4000, updatedAt: stamp - 4000 }
  ] };
  localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters, deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, readingLists: lists, savedAt: stamp - 1000 }));
  localStorage.setItem('readingRoom.theme', 'light');
}

const local = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')));
const snapshotKeys = page => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('marginFiles', 2);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, request = db.transaction('derived').objectStore('derived').getAllKeys(); request.onsuccess = () => { resolve(request.result.map(String).filter(key => key.startsWith('state:snapshot:')).sort()); db.close(); }; request.onerror = () => reject(request.error); };
}));
const snapshot = (page, key) => page.evaluate(key => new Promise((resolve, reject) => {
  const open = indexedDB.open('marginFiles', 2);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, request = db.transaction('derived').objectStore('derived').get('state:snapshot:' + key); request.onsuccess = () => { resolve(request.result ? JSON.parse(request.result) : null); db.close(); }; request.onerror = () => reject(request.error); };
}), key);
const paperIn = (state, id) => state.chapters.find(ch => ch.id === id);
const pills = page => page.locator('.paper-category-tab .paper-category-mark').allTextContents();

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const name = process.env.PHLOEM_BROWSER || 'chromium';
  const launch = { headless: true };
  if (name === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await playwright[name].launch(launch);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(seed);
  await page.goto(BASE + '/reading.html');
  await page.waitForSelector('.paper-category-tab.is-selected');

  // The wall's shelves are compact pills that wrap; only the open one has controls.
  const rail = await page.locator('.paper-category-rail').evaluate(element => {
    const tabs = Array.from(element.querySelectorAll('.paper-category-tab')), rows = new Set(tabs.map(tab => Math.round(tab.getBoundingClientRect().top)));
    const mark = element.querySelector('.paper-category-mark'), style = getComputedStyle(mark);
    return { wrap: getComputedStyle(element).flexWrap, rows: rows.size, tabs: tabs.length, sideways: element.scrollWidth > element.clientWidth + 1, font: style.fontFamily, weight: style.fontWeight, upper: style.textTransform, stroke: getComputedStyle(mark, '::before').content,
      controls: tabs.filter(tab => tab.querySelector('.paper-category-edit')).map(tab => tab.classList.contains('is-selected')), widest: Math.max(...tabs.map(tab => tab.getBoundingClientRect().width)) };
  });
  check('shelf pills wrap onto rows instead of scrolling sideways', rail.wrap === 'wrap' && rail.rows >= 2 && !rail.sideways, JSON.stringify(rail));
  check('pill labels are plain DM Sans, sentence case, with no highlighter stroke', rail.font.includes('DM Sans') && rail.weight === '600' && rail.upper === 'none' && (rail.stroke === 'none' || rail.stroke === 'normal'), JSON.stringify(rail));
  check('only the open shelf carries rename and reorder controls', rail.controls.length === 1 && rail.controls[0] === true, JSON.stringify(rail.controls));
  check('a pill is as wide as its name, not a fixed 224px tab', rail.widest < 224, rail.widest);
  check('the wall heading reads Reading wall in the serif face', await page.locator('.pile-head strong').evaluate(element => element.textContent === 'Reading wall' && getComputedStyle(element).textTransform === 'none' && /Charter|Georgia|serif/.test(getComputedStyle(element).fontFamily)));
  check('older categories still show as they are until the tidy', (await pills(page)).includes('academic') && (await pills(page)).includes('main'), JSON.stringify(await pills(page)));
  check('the one-time tidy offer is shown', await page.locator('#tidyOffer').isVisible());

  // The preview writes nothing.
  const before = await page.evaluate(() => localStorage.getItem('readingRoom.v1'));
  const keysBefore = await snapshotKeys(page);
  await page.click('#tidyOfferOpen');
  await page.waitForSelector('#tidyBody .tidy-section');
  const target = id => page.locator('[data-tidy-target="' + id + '"]');
  check('the preview suggests a shelf for each paper', await target('p_enrol').inputValue() === 'Personal & admin' && await target('p_meet').inputValue() === 'My notes & meetings' && await target('p_book').inputValue() === 'Books & textbooks' && await target('p_source').inputValue() === 'Papers' && await target('p_colombie').inputValue() === 'Papers',
    JSON.stringify(await page.locator('[data-tidy-target]').evaluateAll(list => list.map(element => element.dataset.tidyTarget + '=' + element.value))));
  check('manuscripts in review and recovered placeholders are not reshelved', await target('p_review').count() === 0 && await target('p_rec1').count() === 0);
  check('topic categories are offered as reading lists', await page.locator('[data-tidy-topic]').evaluateAll(list => list.map(element => element.dataset.tidyTopic + ':' + element.value).join(',')) === 'main:list,coupling:list');
  check('duplicates and placeholders start unticked', await page.locator('[data-tidy-merge]:checked, [data-tidy-remove]:checked').count() === 0 && await page.locator('[data-tidy-merge="p_gerlin_copy"], [data-tidy-merge="p_gerlin"]').count() === 1 && await page.locator('[data-tidy-remove="p_rec1"], [data-tidy-remove="p_rec2"]').count() === 2);
  // The library's own copy in IndexedDB may land late from the startup save; the preview adds nothing.
  const tidyKeys = keys => keys.filter(key => key !== 'state:snapshot:latest');
  const latestDuringPreview = await snapshot(page, 'latest');
  check('opening the preview changed nothing on this device', await page.evaluate(() => localStorage.getItem('readingRoom.v1')) === before && JSON.stringify(tidyKeys(await snapshotKeys(page))) === JSON.stringify(tidyKeys(keysBefore))
    && (!latestDuringPreview || paperIn(latestDuringPreview, 'p_enrol').category === 'academic'), JSON.stringify(await snapshotKeys(page)));

  // Choose: one shelf changed by hand, one topic kept as a shelf, one renamed list, keep the
  // first Gerlin copy and merge the second into it, remove one placeholder.
  await target('p_meet').selectOption('Course notes');
  await page.locator('[data-tidy-topic="coupling"]').selectOption('shelf');
  check('a topic kept as a shelf keeps its papers there', await target('p_coupling').inputValue() === 'coupling');
  await page.locator('[data-tidy-topic-name="main"]').fill('Tomato models');
  await page.locator('[data-tidy-keep][value="p_gerlin"]').check();
  await page.locator('[data-tidy-merge="p_gerlin_copy"]').check();
  await page.locator('[data-tidy-remove="p_rec1"]').check();
  check('the summary says what will happen before anything does', /merges 1 copy/.test(await page.locator('#tidySummary').textContent()) && /removes 1 copy/.test(await page.locator('#tidySummary').textContent()), await page.locator('#tidySummary').textContent());
  await page.click('#tidyApply');
  await page.waitForFunction(() => !document.getElementById('tidyDialog').open && document.getElementById('tidyOffer').classList.contains('done'));
  let saved = await local(page);
  const shelfOf = id => (paperIn(saved, id) || {}).category;
  check('papers moved to the shelves chosen', shelfOf('p_enrol') === 'Personal & admin' && shelfOf('p_meet') === 'Course notes' && shelfOf('p_book') === 'Books & textbooks' && shelfOf('p_source') === 'Papers' && shelfOf('p_colombie') === 'Papers' && shelfOf('p_gerlin') === 'Papers' && shelfOf('p_coupling') === 'coupling',
    JSON.stringify(saved.chapters.map(ch => ch.id + '=' + ch.category)));
  check('review work and the unticked placeholder stay where they were', shelfOf('p_review') === 'In review' && !!paperIn(saved, 'p_rec2') && shelfOf('p_rec2') === undefined);
  const kept = paperIn(saved, 'p_gerlin');
  check('the ticked copy merged into the kept one with its notes', !paperIn(saved, 'p_gerlin_copy') && saved.merged.p_gerlin_copy === 'p_gerlin' && saved.deleted.p_gerlin_copy > 0 && kept.notes[0] === 'kept copy note' && kept.notes[1] === 'second copy note');
  check('the ticked placeholder was removed and the other kept', !paperIn(saved, 'p_rec1') && saved.deleted.p_rec1 > 0);
  const madeList = saved.readingLists.lists.find(list => list.name === 'Tomato models');
  check('a topic became a reading list of its papers', !!madeList && saved.readingLists.items.filter(item => item.listId === (madeList && madeList.id)).map(item => item.paperId).sort().join(',') === 'p_colombie,p_gerlin');
  check('the five shelves lead the order, after the pinned review shelf', saved.categoryOrder.slice(0, 6).join('|') === 'In review|Papers|Books & textbooks|Course notes|My notes & meetings|Personal & admin' && saved.categoryOrder.includes('coupling'), JSON.stringify(saved.categoryOrder));
  check('shelves are plain categories an older Phloem reads', saved.chapters.every(ch => ch.category === undefined || typeof ch.category === 'string') && saved.readingLists.version === 1
    && JSON.stringify(Object.keys(saved).sort()) === JSON.stringify(Object.keys(JSON.parse(before)).sort()), JSON.stringify(Object.keys(saved)));
  check('the backup and undo record are in IndexedDB', JSON.stringify(await snapshotKeys(page)).includes('state:snapshot:tidy-backup') && JSON.stringify(await snapshotKeys(page)).includes('state:snapshot:tidy-undo'));
  const backup = await snapshot(page, 'tidy-backup');
  check('the backup is the library from before the tidy', paperIn(backup, 'p_enrol').category === 'academic' && !!paperIn(backup, 'p_gerlin_copy') && !!paperIn(backup, 'p_rec1'));
  check('the wall now shows the shelves', JSON.stringify(await pills(page)) === JSON.stringify(['In review', 'Papers', 'Books & textbooks', 'Course notes', 'Personal & admin', 'coupling', 'Unsorted']), JSON.stringify(await pills(page)));

  // A wrong shelf is one tap to fix from the selected paper's card.
  await page.locator('.paper-category-tab[data-category-name="Personal & admin"] .paper-category-open').click();
  await page.locator('#selectedPaper .cover-shelf select').selectOption('My notes & meetings');
  saved = await local(page);
  check('the card picker moves the paper and keeps it selected', shelfOf('p_enrol') === 'My notes & meetings' && await page.locator('.paper-category-tab.is-selected').getAttribute('data-category-name') === 'My notes & meetings');
  await page.locator('#selectedPaper .cover-shelf select').selectOption('Personal & admin');

  // Undo: new changes, so a device that synced the tidy follows it.
  await page.click('#tidyOfferUndo');
  await page.waitForFunction(() => /Tidy undone/.test(document.getElementById('tidyOfferCopy').textContent));
  saved = await local(page);
  check('undo puts every paper back where it was', shelfOf('p_enrol') === 'academic' && shelfOf('p_meet') === 'academic' && shelfOf('p_book') === 'non-academic' && shelfOf('p_source') === 'academic' && shelfOf('p_colombie') === 'main' && shelfOf('p_gerlin') === 'main' && shelfOf('p_coupling') === 'coupling',
    JSON.stringify(saved.chapters.map(ch => ch.id + '=' + ch.category)));
  check('undo is stamped as a new change', paperIn(saved, 'p_enrol').fieldUpdatedAt.category > paperIn(backup, 'p_enrol').addedAt);
  const copies = saved.chapters.filter(ch => ch.title === 'A dynamic flux balance model of tomato fruit growth');
  const back = copies.find(ch => ch.id !== 'p_gerlin');
  check('the merged copy comes back under a new id with its own notes', copies.length === 2 && !!back && back.notes[1] === 'second copy note' && !back.notes[0] && paperIn(saved, 'p_gerlin').notes[1] === undefined, JSON.stringify(copies.map(ch => [ch.id, ch.notes])));
  check('the removed placeholder comes back too', saved.chapters.some(ch => ch.title === 'Recovered paper 1' && ch.id !== 'p_rec1'));
  check('the reading list the tidy made is gone', !saved.readingLists.lists.some(list => list.name === 'Tomato models'));
  check('list entries for a copy that came back point at it again', saved.readingLists.items.find(item => item.id === 'I2').paperId === (back && back.id));
  check('undo clears the backup', !JSON.stringify(await snapshotKeys(page)).includes('tidy-backup'));

  // Group by reading list, or not at all; the choice is remembered on this device.
  await page.locator('#tidyOfferDismiss').click();
  await page.selectOption('#libraryGroup', 'list');
  check('grouping by reading list shows the lists, then papers on none', JSON.stringify(await pills(page)) === JSON.stringify(['Manuscript: coupling precedents', 'Source–sink feedback', 'Not on a list']), JSON.stringify(await pills(page)));
  check('reading-list pills carry no shelf controls', await page.locator('.paper-category-tab .paper-category-edit, .paper-category-tab[draggable="true"]').count() === 0);
  await page.locator('.paper-category-tab[data-category-name="Source–sink feedback"] .paper-category-open').click();
  check('a list pill opens the papers on that list', await page.locator('.category-note-grid .paper-sticky-note').count() === 2);
  await page.reload();
  await page.waitForSelector('.paper-category-tab.is-selected');
  check('the grouping survives a reload', await page.locator('#libraryGroup').inputValue() === 'list' && (await pills(page)).includes('Not on a list'));
  await page.selectOption('#libraryGroup', 'none');
  const everyone = (await local(page)).chapters.length;
  check('all together shows every paper without a rail', await page.locator('.paper-category-rail').count() === 0 && await page.locator('.category-note-grid .paper-sticky-note').count() === everyone, everyone);
  await page.locator('[data-library-view="list"]').click();
  check('the List view drops its filter chips when nothing is grouped', await page.locator('nav.library-list-categories').count() === 0 && await page.locator('.library-list-row').count() === everyone);
  await page.selectOption('#libraryGroup', 'list');
  check('the List view filters by reading list too', await page.locator('nav.library-list-categories [data-library-category="list:L2"]').count() === 1);
  await page.locator('[data-library-view="wall"]').click();
  await page.selectOption('#libraryGroup', 'shelf');

  // Every import path puts a new paper on a shelf.
  await page.locator('#pdfFile').setInputFiles({ name: 'jxb-2019.pdf', mimeType: 'application/pdf', buffer: onePagePdf(['Journal of Experimental Botany, Vol. 70, pp. 1-12', 'Carbon allocation in tomato', 'Abstract', 'Received 3 March 2019; accepted 1 May 2019', 'https://doi.org/10.1093/jxb/erz123']) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.some(ch => ch.sourceName === 'jxb-2019.pdf'), null, { timeout: 60000 });
  saved = await local(page);
  const article = saved.chapters.find(ch => ch.sourceName === 'jxb-2019.pdf');
  check('a PDF article lands on Papers and keeps its DOI', article.category === 'Papers' && article.doi === '10.1093/jxb/erz123' && article.fieldUpdatedAt && article.fieldUpdatedAt.category > 0, JSON.stringify({ category: article.category, doi: article.doi }));
  await page.evaluate(() => { const exit = document.getElementById('zenExit'); if (exit && !document.getElementById('readerPage').classList.contains('hidden')) exit.click(); });
  await page.locator('#pdfFile').setInputFiles({ name: 'Proof-of-Enrolment-Fall-2026.pdf', mimeType: 'application/pdf', buffer: onePagePdf(['University of Guelph', 'Proof of Enrolment', 'This letter confirms full-time registration for the Fall 2026 term.']) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.some(ch => ch.sourceName === 'Proof-of-Enrolment-Fall-2026.pdf'), null, { timeout: 60000 });
  check('an enrolment letter lands on Personal & admin', (await local(page)).chapters.find(ch => ch.sourceName === 'Proof-of-Enrolment-Fall-2026.pdf').category === 'Personal & admin');
  await page.evaluate(() => { const exit = document.getElementById('zenExit'); if (exit && !document.getElementById('readerPage').classList.contains('hidden')) exit.click(); });
  await page.locator('#pdfFile').setInputFiles({ name: 'meeting-draft.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: wordDraft(['Notes on the model rewrite', 'We agreed to rerun the turnover case before Friday.']) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.some(ch => ch.sourceName === 'meeting-draft.docx'), null, { timeout: 60000 });
  check('a Word draft lands on My notes & meetings', (await local(page)).chapters.find(ch => ch.sourceName === 'meeting-draft.docx').category === 'My notes & meetings');
  await page.evaluate(() => { const exit = document.getElementById('zenExit'); if (exit && !document.getElementById('readerPage').classList.contains('hidden')) exit.click(); });
  await page.evaluate(() => document.getElementById('newTextBtn').click());
  await page.locator('#textTitle').fill('CHE 620 Lecture 4 notes');
  await page.locator('#textBody').fill('Mass transfer across the boundary layer.');
  await page.locator('#saveTextBtn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.some(ch => ch.title === 'CHE 620 Lecture 4 notes'));
  check('pasted lecture notes land on Course notes', (await local(page)).chapters.find(ch => ch.title === 'CHE 620 Lecture 4 notes').category === 'Course notes');
  await page.evaluate(() => { const exit = document.getElementById('zenExit'); if (exit && !document.getElementById('readerPage').classList.contains('hidden')) exit.click(); });

  // With localStorage full, the tidy, its backup and its undo still work from IndexedDB.
  await page.evaluate(() => sessionStorage.setItem('shelvesFull', '1'));
  await page.reload();
  await page.waitForSelector('.paper-category-tab.is-selected');
  const frozen = await page.evaluate(() => localStorage.getItem('readingRoom.v1'));
  await page.click('#settingsBtn');
  await page.click('#tidyLibraryBtn');
  await page.waitForSelector('#tidyBody .tidy-section');
  await page.click('#tidyApply');
  await page.waitForFunction(() => !document.getElementById('tidyDialog').open && document.getElementById('tidyOffer').classList.contains('done'));
  let latest = await snapshot(page, 'latest');
  check('a full localStorage is left alone', await page.evaluate(() => localStorage.getItem('readingRoom.v1')) === frozen);
  check('the tidy saved to the device snapshot instead', paperIn(latest, 'p_enrol').category === 'Personal & admin' && paperIn(latest, 'p_book').category === 'Books & textbooks', JSON.stringify(latest.chapters.map(ch => ch.id + '=' + ch.category)));
  check('the backup saved even with localStorage full', JSON.stringify(await snapshotKeys(page)).includes('state:snapshot:tidy-backup'));
  await page.reload();
  await page.waitForSelector('.paper-category-tab.is-selected');
  check('after a reload the tidied shelves come back from the snapshot', (await pills(page)).includes('Personal & admin') && !(await pills(page)).includes('academic'), JSON.stringify(await pills(page)));
  await page.click('#settingsBtn');
  await page.locator('#tidyUndoBtn').waitFor({ state: 'visible' });
  await page.click('#tidyUndoBtn');
  await page.waitForFunction(() => /Tidy undone/.test(document.getElementById('tidyOfferCopy').textContent));
  latest = await snapshot(page, 'latest');
  check('undo works with localStorage full too', paperIn(latest, 'p_enrol').category === 'academic' && paperIn(latest, 'p_book').category === 'non-academic');
  check('no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
