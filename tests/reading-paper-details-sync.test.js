/* Real merge and title functions from reading.js, run in a VM with small stubs.
   Covers hand-edited paper details surviving a newer copy from another device, and
   PDF titles that are prepress IDs or repository banners rather than the paper's. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `section exists: ${start}`);
  return source.slice(from, to);
}

function mergeHarness(localChapters) {
  let clock = 1000;
  const context = vm.createContext({
    state: { chapters: structuredClone(localChapters), deleted: {}, merged: {} }, currentId: null, pdfDoc: null,
    PDF_ZOOM_PREFERENCE_VERSION: 1, LAST_OPEN_KEY: 'last', localStorage: { setItem() {} },
    now: () => clock, normalize: ch => ch, saveDerivedSoon() {}, mergePdfInk: () => false,
    reviewStateStamp: () => 0, newerPdfPosition: () => null, copyReviewState() {},
    mergeDerivedInto: () => false, derivedData: () => null, migrateReviewWorkspaceLabels: () => false,
    duplicateGroups: () => [], collapseDuplicateGroups() {}, resolvedPaperId: id => id,
    queueDuplicateStorage() {}, deletePdf() {}, byId: () => ({ classList: { contains: () => true } }), showPage() {}
  });
  context.find = id => context.state.chapters.find(ch => ch.id === id);
  vm.runInContext(section('  var STAMPED_FIELDS=', '  // Typing saves once'), context);
  vm.runInContext(section('  function mergeState(inc){', '  var syncDecryptBlocked'), context);
  return { context, at: value => { clock = value; } };
}
const paper = extra => Object.assign({ id: 'elife', kind: 'pdf', title: '14683958683096 1..16', authors: 'Michael Knoblauch', tags: [], updatedAt: 100 }, extra);

test('a rename on one device survives a later highlight on the other', () => {
  // The Mac renamed at 200; the iPad highlighted at 300 without seeing the rename.
  const mac = paper({ title: 'demoOct8', titleEditedByUser: true, fieldUpdatedAt: { title: 200 }, updatedAt: 200 });
  const ipad = paper({ updatedAt: 300, highlights: ['new mark'] });
  const onIpad = mergeHarness([ipad]);
  assert.equal(onIpad.context.mergeState({ chapters: [mac] }), true);
  const kept = onIpad.context.find('elife');
  assert.equal(kept.title, 'demoOct8', 'the older copy still contributes its newer title');
  assert.equal(kept.titleEditedByUser, true);
  assert.deepEqual(kept.highlights, ['new mark'], 'the newer copy keeps its own work');

  // The Mac pulls the iPad's newer copy back and must not lose its own rename.
  const onMac = mergeHarness([paper({ title: 'demoOct8', titleEditedByUser: true, fieldUpdatedAt: { title: 200 }, updatedAt: 200 })]);
  onMac.context.mergeState({ chapters: [ipad] });
  assert.equal(onMac.context.find('elife').title, 'demoOct8');
  assert.deepEqual(onMac.context.find('elife').highlights, ['new mark']);
});

test('the later of two renames wins, and category and tags merge the same way', () => {
  const local = paper({ title: 'Mac name', fieldUpdatedAt: { title: 400, category: 100 }, category: 'academic', updatedAt: 500 });
  const remote = paper({ title: 'iPad name', fieldUpdatedAt: { title: 300, category: 450, tags: 450 }, tags: ['phloem'], updatedAt: 450 });
  const h = mergeHarness([local]);
  h.context.mergeState({ chapters: [remote] });
  const kept = h.context.find('elife');
  assert.equal(kept.title, 'Mac name', 'newer rename stays');
  assert.equal(kept.category, undefined, 'a newer move to Unsorted removes the category');
  assert.deepEqual(kept.tags, ['phloem']);
  assert.deepEqual({ ...kept.fieldUpdatedAt }, { title: 400, category: 450, tags: 450 });
});

test('copies without field clocks keep the old whole-paper behaviour', () => {
  const h = mergeHarness([paper({ title: 'Local', updatedAt: 100 })]);
  h.context.mergeState({ chapters: [paper({ title: 'Remote', updatedAt: 200 })] });
  assert.equal(h.context.find('elife').title, 'Remote');
});

test('stampFields records only the fields named', () => {
  const h = mergeHarness([]);
  const ch = paper({ fieldUpdatedAt: { tags: 5 } });
  h.at(900); h.context.stampFields(ch, ['title']);
  assert.deepEqual({ ...ch.fieldUpdatedAt }, { tags: 5, title: 900 });
});

const plain = value => JSON.parse(JSON.stringify(value));

function dedupHarness(chapters) {
  const h = mergeHarness(chapters), ctx = h.context;
  Object.assign(ctx, { pendingDuplicateStorage: [], pdfTitleLooksGenerated: () => false, pdfTitleIsBanner: () => false });
  vm.runInContext(section('  function sourceIdentity(', '  function itemIdentity('), ctx);
  vm.runInContext(section('  function itemIdentity(', '  function emptyState('), ctx);
  return h;
}

test('automatic duplicate collapse preserves explicit details in either canonical order', () => {
  const edited = paper({ id: 'edited', title: 'demoOct8', titleEditedByUser: true, authors: '', tags: [], fieldUpdatedAt: { title: 200, authors: 200, tags: 200, category: 200 }, updatedAt: 200, contentHash: 'same-file' });
  const stale = paper({ id: 'stale', title: 'Testing the Münch hypothesis of long distance phloem transport in plants', authors: 'Old author credit', tags: ['removed'], category: 'Old category', updatedAt: 300, contentHash: 'same-file' });
  for (const canonical of ['edited', 'stale']) {
    const a = { ...edited, addedAt: canonical === 'edited' ? 10 : 20 };
    const b = { ...stale, addedAt: canonical === 'stale' ? 10 : 20 };
    for (const reverse of [false, true]) {
      const h = dedupHarness([reverse ? b : a]);
      h.context.mergeState({ chapters: [structuredClone(reverse ? a : b)] });
      const [kept] = h.context.state.chapters;
      assert.equal(h.context.state.chapters.length, 1);
      assert.equal(kept.id, canonical);
      assert.equal(kept.title, 'demoOct8');
      assert.equal(kept.titleEditedByUser, true);
      assert.equal(kept.authors, '');
      assert.deepEqual(plain(kept.tags), []);
      assert.equal(kept.category, undefined);
      assert.deepEqual(plain(kept.fieldUpdatedAt), edited.fieldUpdatedAt);
    }
  }
});

test('duplicate collapse takes each newest field clock rather than one record clock', () => {
  const older = paper({ id: 'older', addedAt: 10, title: 'Latest rename', titleEditedByUser: true, authors: 'Old authors', tags: ['old'], category: 'Research', fieldUpdatedAt: { title: 400, authors: 100, tags: 100, category: 400 }, contentHash: 'same' });
  const newer = paper({ id: 'newer', addedAt: 20, title: 'An obsolete long title from another device', authors: 'New authors', tags: ['new'], category: 'Old', fieldUpdatedAt: { title: 200, authors: 500, tags: 500, category: 100 }, contentHash: 'same' });
  const h = dedupHarness([older]); h.context.mergeState({ chapters: [newer] });
  const kept = h.context.state.chapters[0];
  assert.equal(kept.title, 'Latest rename'); assert.equal(kept.authors, 'New authors');
  assert.equal(kept.category, 'Research'); assert.deepEqual(plain(kept.tags), ['new']);
  assert.deepEqual(plain(kept.fieldUpdatedAt), { title: 400, authors: 500, tags: 500, category: 400 });
});

test('existing manual renames without a clock survive automatic titles on newer copies', () => {
  const manual = paper({ title: 'demoOct8', titleEditedByUser: true, updatedAt: 200 });
  const automatic = paper({ title: '14683958683096 1..16', updatedAt: 300 });
  for (const reverse of [false, true]) {
    const h = mergeHarness([reverse ? automatic : manual]);
    h.context.mergeState({ chapters: [structuredClone(reverse ? manual : automatic)] });
    assert.equal(h.context.find('elife').title, 'demoOct8');
    assert.equal(h.context.find('elife').titleEditedByUser, true);
    assert.equal(h.context.find('elife').fieldUpdatedAt, undefined, 'does not fabricate a rename time');
  }
  const h = mergeHarness([manual]);
  h.context.mergeState({ chapters: [paper({ title: 'Later explicit choice', titleEditedByUser: true, fieldUpdatedAt: { title: 250 }, updatedAt: 250 })] });
  assert.equal(h.context.find('elife').title, 'Later explicit choice');
});

test('simultaneous field edits converge in both directions', () => {
  const first = paper({ title: 'Alpha', tags: ['a'], fieldUpdatedAt: { title: 400, tags: 400 }, updatedAt: 500 });
  const second = paper({ title: 'Zeta', tags: ['z'], fieldUpdatedAt: { title: 400, tags: 400 }, updatedAt: 500 });
  const a = mergeHarness([first]), b = mergeHarness([second]);
  a.context.mergeState({ chapters: [structuredClone(second)] });
  b.context.mergeState({ chapters: [structuredClone(first)] });
  assert.equal(a.context.find('elife').title, b.context.find('elife').title);
  assert.deepEqual(plain(a.context.find('elife').tags), plain(b.context.find('elife').tags));
  assert.equal(a.context.mergeState({ chapters: [plain(b.context.find('elife'))] }), false, 'the settled state does not repeatedly change');
});

test('invalid field clocks cannot outrank a valid edit, and a local edit advances its clock', () => {
  for (const bad of [Infinity, -10, '900', NaN, 1e99, 12.5]) {
    const h = mergeHarness([paper({ title: 'Good', fieldUpdatedAt: { title: 200 }, updatedAt: 200 })]);
    h.context.mergeState({ chapters: [paper({ title: 'Bad clock', fieldUpdatedAt: { title: bad }, updatedAt: 300 })] });
    assert.equal(h.context.find('elife').title, 'Good');
  }
  const h = mergeHarness([]), ch = paper({ fieldUpdatedAt: { title: 2000 } });
  h.at(1000); h.context.stampFields(ch, ['title']);
  assert.equal(ch.fieldUpdatedAt.title, 2001);
});

test('text save stamps manual title and author changes but not body-only edits', () => {
  const h = mergeHarness([paper({ kind: 'text', title: 'Before', authors: 'Before author' })]);
  const controls = { textBody: { value: 'New body' }, textTitle: { value: 'Manual title' }, textAuthors: { value: 'Manual author' }, saveTextBtn: {}, textDialog: { close() {} } };
  Object.assign(h.context, { editingId: 'elife', byId: id => controls[id], persist() {}, openReader() {} });
  vm.runInContext(section("  byId('saveTextBtn').onclick=", '\n\n  /* Reader typography'), h.context);
  h.at(500); controls.saveTextBtn.onclick();
  assert.deepEqual(plain(h.context.find('elife').fieldUpdatedAt), { title: 500, authors: 500 });
  assert.equal(h.context.find('elife').titleEditedByUser, true);
  controls.textBody.value = 'Another body edit'; h.at(600); controls.saveTextBtn.onclick();
  assert.deepEqual(plain(h.context.find('elife').fieldUpdatedAt), { title: 500, authors: 500 });
});

test('local and cloud snapshots retain the field clocks and explicit clears', async () => {
  const ch = paper({ title: 'Chosen', authors: '', tags: [], fieldUpdatedAt: { title: 200, authors: 200, tags: 200, category: 200 } });
  const h = mergeHarness([ch]);
  Object.assign(h.context, { DERIVED_FIELDS: ['pageTexts'], getDerived: async () => null });
  vm.runInContext(section('  function localState(){', '  function flushStateSnapshot('), h.context);
  vm.runInContext(section('  async function chaptersForSync(){', '  function ghUrl('), h.context);
  for (const copy of [h.context.localState().chapters[0], (await h.context.chaptersForSync())[0]]) {
    const persisted = plain(copy);
    assert.deepEqual(persisted.fieldUpdatedAt, ch.fieldUpdatedAt);
    assert.equal(persisted.authors, ''); assert.deepEqual(persisted.tags, []);
    assert.equal(persisted.category, undefined);
  }
});

function importHarness(ch) {
  const h = mergeHarness([ch]), button = { textContent: 'Import' };
  Object.assign(h.context, {
    importedSourceWrites: {}, byId: () => button, pdfFingerprint: async () => 'same',
    loadPdfLib: async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) }) }),
    derivePdfDetails: async () => ({ title: 'An automatically derived long paper title', authors: 'Automatic authors' }),
    findImportedPaper: () => h.context.find(ch.id), keepImportedSource: async () => true,
    titleQuality: item => String(item.title || '').length, filenameTitle: name => name,
    persist() {}, renderShelf() {}, showReaderToast() {}, openReader: async () => true,
    showError(message) { throw new Error(message); },
    identityText: value => String(value || ''),
    parseDocx: async () => ({ title: 'An automatically derived long paper title', authors: 'Automatic authors', paragraphs: ['Body'], kinds: [], comments: [], trackedChanges: {} }),
    mergeImportedReviewState: () => [], updateReviewBadge() {}
  });
  vm.runInContext(section('  async function importPdf(', '  function mergeImportedReviewState('), h.context);
  vm.runInContext(section('  async function importDocx(', '  function importSourceFile('), h.context);
  return h;
}

test('refreshing PDF or Word originals preserves manual names and deliberately empty authors', async () => {
  for (const kind of ['pdf', 'docx']) {
    const ch = paper({ title: 'My name', titleEditedByUser: true, authors: '', fieldUpdatedAt: { title: 200, authors: 200 }, sourceType: kind, sourceName: 'paper.' + kind, contentHash: 'same' });
    const h = importHarness(ch), file = { name: ch.sourceName, arrayBuffer: async () => new Uint8Array([0x50, 0x4b, 1, 2]).buffer };
    if (kind === 'pdf') await h.context.importPdf(file, '', '', null, true);
    else await h.context.importDocx(file, null, true);
    assert.equal(h.context.find(ch.id).title, 'My name');
    assert.equal(h.context.find(ch.id).authors, '');
    assert.deepEqual(plain(h.context.find(ch.id).fieldUpdatedAt), ch.fieldUpdatedAt);
  }
});

test('background PDF metadata repair respects an author clear made while extraction runs', async () => {
  const h = mergeHarness([paper({ title: 'A normal paper title', authors: '' })]);
  let finish;
  Object.assign(h.context, { ch: h.context.find('elife'), pdfDoc: {}, pdfTitleNeedsRepair: () => false,
    derivePdfDetails: () => new Promise(resolve => { finish = resolve; }), touch() { throw new Error('manual clear must not be overwritten'); }, showReaderToast() {} });
  const start = source.indexOf("        if((!manualPaperField(ch,'title')&&pdfTitleNeedsRepair");
  const end = source.indexOf("        if(readerMode==='text'", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), h.context);
  h.at(700); h.context.stampFields(h.context.ch, ['authors']);
  finish({ title: 'Derived title', authors: 'Restored old authors' });
  await Promise.resolve();
  assert.equal(h.context.find('elife').authors, '');
});

function titleHarness() {
  const context = vm.createContext({});
  vm.runInContext(section('  function identityText(value){', '\n  }\n') + '\n  }\n', context);
  vm.runInContext(section('  function filenameTitle(name)', '\n'), context);
  vm.runInContext(section('  function hasCompactScript(text)', '  function cleanAuthorCredit('), context);
  return context;
}

test('prepress IDs are recognised as generated titles', () => {
  const t = titleHarness();
  assert.equal(t.pdfTitleLooksGenerated('14683958683096 1..16'), true, 'eLife ID with a short page range');
  assert.equal(t.pdfTitleLooksGenerated('OP-PLPH210546 1709..1723'), true, 'existing publisher job code');
  assert.equal(t.pdfTitleLooksGenerated('14683958683096'), true, 'a bare long ID');
  assert.equal(t.pdfTitleLooksGenerated('1984'), false, 'a short number can be a real title');
  assert.equal(t.pdfTitleLooksGenerated('COVID-19 in 2020'), false);
  assert.equal(t.pdfTitleLooksGenerated('Testing the Münch hypothesis of long distance phloem transport in plants'), false);
  assert.equal(t.pdfTitleNeedsRepair('14683958683096 1..16', 'elife-15341-v2.pdf'), true);
});

test('repository banners are never taken for the paper title', () => {
  const t = titleHarness();
  for (const banner of ['NIH Public Access', 'HHS Public Access', 'NIH-PA Author Manuscript', 'Author Manuscript', 'Europe PMC Funders Group', 'Accepted Manuscript.'])
    assert.equal(t.pdfTitleIsBanner(banner), true, banner);
  assert.equal(t.pdfTitleIsBanner('Public access to research data in plant science'), false);
  assert.equal(t.pdfTitleNeedsRepair('NIH Public Access', 'nihms299330.pdf'), true);
  assert.equal(t.crediblePageTitle('NIH Public Access'), false);
  // Page one of an NIH manuscript: the banner prints largest, the title below it.
  const layout = [
    { text: 'NIH Public Access', y: 760, height: 24 },
    { text: 'Author Manuscript', y: 735, height: 14 },
    { text: 'Published in final edited form as: Plant Cell. 2011;23:1–12.', y: 715, height: 9 },
    { text: 'Sieve tube geometry in relation to phloem flow', y: 680, height: 16 },
    { text: 'Jane Doe and John Roe', y: 650, height: 10 }
  ];
  assert.equal(t.guessTitleFromLayout(layout), 'Sieve tube geometry in relation to phloem flow');
});
