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
    state: { chapters: localChapters, deleted: {}, merged: {} }, currentId: null, pdfDoc: null,
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
