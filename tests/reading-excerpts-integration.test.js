const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readerSource = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'reading-excerpts.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function section(start, end) {
  const from = readerSource.indexOf(start);
  const to = readerSource.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `reader section exists: ${start}`);
  return readerSource.slice(from, to);
}
function harness(chapters) {
  const state = { chapters: plain(chapters), deleted: {}, merged: {} };
  const context = vm.createContext({
    window: {}, state, currentId: null, now: () => 1000,
    find: id => state.chapters.find(ch => ch.id === id),
    mergePdfInk: () => false, reviewStateStamp: () => 0,
    newerPdfPosition: () => null, saveDerivedSoon() {}, derivedData: () => null,
    mergeDerivedInto: () => false, migrateReviewWorkspaceLabels: () => false,
    duplicateGroups: () => [], titleQuality: () => 0,
    mergeTags: (a, b) => [...(a || []), ...(b || [])],
    mergeItemArrays: (a, b) => [...(a || []), ...(b || [])],
    mergeNoteMap: (a, b) => ({ ...a, ...b }),
    mergeHighlightMap: (a, b) => ({ ...a, ...b }),
    mergeReviews: (a, b) => ({ ...a, ...b }),
    mergeLookups: (a, b) => ({ ...a, ...b }),
    normalize(ch) { context.normalizeReadingExcerpts(ch); return ch; }
  });
  vm.runInContext(stateSource, context, { filename: 'reading-excerpts.js' });
  vm.runInContext([
    section('  function normalizeReadingExcerpts(ch){', '  function mergePdfFolds('),
    section('  function mergeDuplicateRecord(', '  function canonicalPaper('),
    section('  function mergeState(inc){', '  var syncDecryptBlocked')
  ].join('\n'), context, { filename: 'reading.js excerpts integration' });
  return context;
}
const record = (id, note, updatedAt = 100) => ({
  id, quote: '', note, anchor: { kind: 'text', para: 1, offset: .5 },
  createdAt: 50, updatedAt
});
const envelope = (...items) => ({ version: 1, items, deleted: {} });
const chapter = (updatedAt, excerpts, id = 'paper') => ({
  id, kind: 'text', title: 'Paper', addedAt: 1, updatedAt, readingExcerpts: excerpts
});
const ids = ch => Array.from(ch.readingExcerpts.items, item => item.id);

for (const [label, localStamp, remoteStamp] of [
  ['older incoming chapter', 300, 200],
  ['newer incoming chapter', 200, 300]
]) test(`mergeState retains both independent excerpt additions with ${label}`, () => {
  const context = harness([chapter(localStamp, envelope(record('local', 'From this device')))]);
  assert.equal(context.mergeState({ chapters: [chapter(remoteStamp,
    envelope(record('remote', 'From another device')))] }), true);
  assert.deepEqual(ids(context.state.chapters[0]), ['local', 'remote']);
});

test('future active format and known copy both survive mergeState without interpretation', () => {
  const future = { version: 2, items: [{ id: 'future', newField: 'opaque' }], deleted: {} };
  const context = harness([chapter(200, envelope(record('local', 'Known copy')))]);
  const remote = chapter(300, future);
  assert.equal(context.mergeState({ chapters: [remote] }), true);
  const merged = context.state.chapters[0];
  assert.deepEqual(plain(merged.readingExcerpts), future);
  assert.ok(merged.readingExcerptsPending.some(value =>
    value.version === 1 && value.items.some(item => item.id === 'local')));
  assert.equal(context.readingExcerptsUnavailable(merged), true);
});

test('older future format remains active while newer known copy is held pending', () => {
  const future = { version: 2, items: [{ id: 'future' }], deleted: {} };
  const context = harness([chapter(300, future)]);
  context.mergeState({ chapters: [chapter(200, envelope(record('remote', 'Known copy')))] });
  const merged = context.state.chapters[0];
  assert.deepEqual(plain(merged.readingExcerpts), future);
  assert.ok(merged.readingExcerptsPending.some(value =>
    value.version === 1 && value.items.some(item => item.id === 'remote')));
});

test('duplicate-paper merge retains excerpts from both records and max chapter time', () => {
  const context = harness([]);
  const keep = chapter(200, envelope(record('keep', 'First')), 'canonical');
  const extra = chapter(300, envelope(record('extra', 'Second')), 'duplicate');
  context.mergeDuplicateRecord(keep, extra);
  assert.deepEqual(ids(keep), ['extra', 'keep']);
  assert.equal(keep.updatedAt, 300);
});

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const pdfRecord = (id, page, sourceHash = HASH) => ({
  id, quote: `Page ${page}`, note: '', anchor: { kind: 'pdf', page },
  sourceHash, createdAt: 50, updatedAt: 100
});
function navigationHarness(items = [pdfRecord('first', 2), pdfRecord('second', 4)]) {
  const context = harness([{ ...chapter(200, envelope(...items)), kind: 'pdf' }]);
  const chip = {
    hidden: true, disabled: false,
    classList: {
      toggle(name, hidden) { if (name === 'hidden') chip.hidden = hidden; },
      add(name) { if (name === 'hidden') chip.hidden = true; }
    }
  };
  const status = { textContent: '' };
  const jumps = [], cues = [], toasts = [];
  let jump = async () => true;
  let cue = async () => true;
  let clears = 0;
  let origins = 0;
  context.currentId = 'paper';
  context.pdfOpenEpoch = 1;
  context.pdfDoc = { numPages: 10 };
  context.foldSourceHash = HASH;
  context.readerMode = 'pdf';
  context.excerptView = null;
  context.workspaceView = null;
  context.workspaceDragSelection = null;
  context.cancelSavedHighlightDrag = () => {};
  context.temporaryNotebookMode = () => false;
  context.currentKeepAnchor = () => { origins++; return { kind: 'pdf', page: 1 }; };
  context.byId = id => id === 'excerptReturnChip' ? chip : id === 'excerptStatus' ? status : null;
  context.clearPendingSelection = () => {};
  context.showReaderToast = message => toasts.push(message);
  context.jumpToReadingKeep = entry => { jumps.push(plain(entry.anchor)); return jump(entry); };
  context.clearExcerptSourceCue = () => { clears++; };
  context.flashExcerptSource = (entry, token) => { cues.push({ entry: plain(entry), token }); return cue(entry, token); };
  vm.runInContext([
    'var excerptReturnSpot=null,excerptNavigationSerial=0,excerptNavigationBusy=false;',
    section('  function closeWorkspacePanels(){', '  function workspaceContext(){'),
    section('  function excerptStatus(message){', '  function saveExcerptState('),
    section('  function excerptReadingAnchor(){', '  if(window.PhloemExcerptView)')
  ].join('\n'), context, { filename: 'reading.js excerpt navigation' });
  return { context, chip, status, jumps, cues, toasts, clears: () => clears, origins: () => origins,
    setJump: callback => { jump = callback; }, setCue: callback => { cue = callback; } };
}

test('source hash mismatch and out-of-range PDF page never call the jump function', async () => {
  const mismatch = navigationHarness([pdfRecord('wrong', 2, OTHER_HASH)]);
  assert.equal(await mismatch.context.goToExcerptSource('wrong'), false);
  assert.deepEqual(mismatch.jumps, []);
  assert.deepEqual(mismatch.cues, []);
  assert.equal(mismatch.context.excerptReturnSpot, null);
  const missingPage = navigationHarness([pdfRecord('missing-page', 11)]);
  assert.equal(await missingPage.context.goToExcerptSource('missing-page'), false);
  assert.deepEqual(missingPage.jumps, []);
  assert.deepEqual(missingPage.cues, []);
  assert.equal(missingPage.context.excerptReturnSpot, null);
});

test('source visits capture one origin and return clears it', async () => {
  const nav = navigationHarness();
  assert.equal(await nav.context.goToExcerptSource('first'), true);
  assert.equal(nav.context.excerptContext().canReturn, true);
  assert.equal(nav.chip.hidden, false);
  assert.equal(await nav.context.goToExcerptSource('second'), true);
  assert.equal(nav.origins(), 1);
  assert.deepEqual(nav.jumps.map(anchor => anchor.page), [2, 4]);
  assert.deepEqual(nav.cues.map(cue => cue.entry.quote), ['Page 2', 'Page 4']);
  assert.equal(await nav.context.returnFromExcerpt(), true);
  assert.deepEqual(nav.jumps.map(anchor => anchor.page), [2, 4, 1]);
  assert.equal(nav.context.excerptReturnSpot, null);
  assert.equal(nav.context.excerptContext().canReturn, false);
  assert.equal(nav.chip.hidden, true);
  assert.equal(nav.cues.length, 2, 'return clears the cue without painting a saved-quote cue');
  assert.deepEqual(nav.toasts, [], 'matched passages and Return need no warning toast');
  assert(nav.clears() >= 3, 'each navigation clears an older transient cue');
});

test('no exact quote match keeps location navigation without claiming a passage highlight', async () => {
  const nav = navigationHarness();
  nav.setCue(async () => false);
  assert.equal(await nav.context.goToExcerptSource('first'), true);
  assert.equal(nav.cues[0].entry.quote, 'Page 2');
  assert.match(nav.status.textContent, /could not be matched/i);
  assert.equal(nav.toasts.length, 1, 'unmatched source is explained even when the Clips panel is hidden');
  assert.match(nav.toasts[0], /could not be highlighted/i);
  assert.equal(nav.context.excerptContext().canReturn, true);
});

test('an older asynchronous source cue cannot finish after document reset', async () => {
  const nav = navigationHarness();
  let resolve;
  nav.setCue(() => new Promise(done => { resolve = done; }));
  const pending = nav.context.goToExcerptSource('first');
  await new Promise(done => setImmediate(done));
  assert.equal(nav.cues.length, 1);
  nav.context.currentId = 'another-paper';
  nav.context.pdfOpenEpoch = 2;
  nav.context.resetExcerptNavigation();
  const statusAfterReset = nav.status.textContent;
  resolve(true);
  assert.equal(await pending, false);
  assert.equal(nav.context.excerptReturnSpot, null);
  assert.equal(nav.chip.hidden, true);
  assert.equal(nav.status.textContent, statusAfterReset);
});

test('busy navigation rejects reentry and never starts another jump', async () => {
  const nav = navigationHarness();
  let resolve;
  nav.setJump(() => new Promise(done => { resolve = done; }));
  const pending = nav.context.goToExcerptSource('first');
  assert.equal(nav.context.excerptContext().busy, true);
  assert.equal(await nav.context.goToExcerptSource('second'), false);
  assert.deepEqual(nav.jumps.map(anchor => anchor.page), [2]);
  resolve(true);
  assert.equal(await pending, true);
  assert.equal(nav.context.excerptContext().busy, false);
});

test('old-document async completion cannot restore return state or chip', async () => {
  const nav = navigationHarness();
  let resolve;
  nav.setJump(() => new Promise(done => { resolve = done; }));
  const pending = nav.context.goToExcerptSource('first');
  assert.equal(nav.chip.hidden, false);
  nav.context.currentId = 'another-paper';
  nav.context.pdfOpenEpoch = 2;
  nav.context.resetExcerptNavigation();
  const statusAfterReset = nav.status.textContent;
  resolve(true);
  assert.equal(await pending, false);
  assert.equal(nav.context.excerptReturnSpot, null);
  assert.equal(nav.context.excerptContext().canReturn, false);
  assert.equal(nav.chip.hidden, true);
  assert.equal(nav.status.textContent, statusAfterReset);
});

test('a stale removed excerpt ID cannot navigate', async () => {
  const nav = navigationHarness();
  nav.context.state.chapters[0].readingExcerpts = envelope(pdfRecord('second', 4));
  assert.equal(await nav.context.goToExcerptSource('first'), false);
  assert.deepEqual(nav.jumps, []);
  assert.deepEqual(nav.cues, []);
});
