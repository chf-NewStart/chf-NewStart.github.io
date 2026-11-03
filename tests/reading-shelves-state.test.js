const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-shelves.js'), 'utf8'), context, { filename: 'reading-shelves.js' });
const S = context.window.PhloemShelves;
const plain = value => JSON.parse(JSON.stringify(value));
let n = 0;
const paper = (title, extra) => Object.assign({ id: 'p' + (++n), kind: 'text', title, authors: '', tags: [], addedAt: 1000 + n }, extra || {});
const shelf = (record, hints) => S.classify(record, hints).shelf;

test('plain-script API is frozen and needs no document, storage, or network', () => {
  assert.equal(Object.isFrozen(S), true);
  assert.deepEqual(plain(S.SHELVES), ['Papers', 'Books & textbooks', 'Course notes', 'My notes & meetings', 'Personal & admin']);
  assert.equal(typeof context.window.document, 'undefined');
});

test('old categories map onto shelves; anything else is a topic', () => {
  assert.equal(S.kindCategory('academic'), 'Papers');
  assert.equal(S.kindCategory('non-academic'), 'Personal & admin');
  assert.equal(S.kindCategory('Non academic'), 'Personal & admin');
  assert.equal(S.kindCategory('papers'), 'Papers');
  assert.equal(S.kindCategory('Books'), 'Books & textbooks');
  assert.equal(S.kindCategory('main'), '');
  for (const topic of ['main', 'coupling', 'fba', 'proj']) assert.equal(S.isTopic(topic), true, topic);
  for (const kind of ['academic', 'non-academic', 'Unsorted', '', 'In review', 'Under review', 'Papers']) assert.equal(S.isTopic(kind), false, kind);
  assert.equal(S.shelfName('my notes & MEETINGS'), 'My notes & meetings');
  assert.equal(S.shelfName('academic'), '');
});

test('the rules shelve a library like the one this was built for', () => {
  assert.equal(shelf(paper('Source–sink interactions in tomato fruit', { kind: 'pdf', category: 'academic', doi: '10.3389/fpls.2014.00516' })), 'Papers');
  assert.equal(shelf(paper('Proof of Enrolment', { kind: 'pdf', category: 'academic' })), 'Personal & admin');
  assert.equal(shelf(paper('Supervisor meeting notes 2026-10-20', { category: 'academic' })), 'My notes & meetings');
  assert.equal(shelf(paper('Meeting fixes: status overview', { category: 'academic' })), 'My notes & meetings');
  assert.equal(shelf(paper('Immigration brief', { category: 'non-academic' })), 'Personal & admin');
  assert.equal(shelf(paper('Sponsorship form', { kind: 'pdf', category: 'non-academic' })), 'Personal & admin');
  assert.equal(shelf(paper('Feedback Systems', { kind: 'pdf', category: 'non-academic', pageCount: 400 })), 'Books & textbooks');
  assert.equal(shelf(paper('CHE 620 Lecture 3: transport phenomena', { kind: 'pdf', pageCount: 40 })), 'Course notes');
  assert.equal(shelf(paper('Colombié 2015', { kind: 'pdf', category: 'main', pageCount: 14 })), 'Papers', 'a topic category says nothing about the kind; a PDF defaults to Papers');
});

test('each signal is read the same way on every device', () => {
  const opening = 'Plant Physiology, Vol. 160, pp. 1–14\nAbstract\nReceived 12 March 2021; accepted 3 May 2021\nKeywords: phloem';
  assert.equal(S.classify(paper('Untitled scan', { kind: 'pdf' }), { text: opening }).reason, 'its first page reads like a journal article');
  assert.equal(shelf(paper('Some file', { kind: 'pdf' }), { text: 'ISBN 978-0-306-40615-7' }), 'Books & textbooks');
  assert.equal(shelf(paper('Some file', { kind: 'pdf' }), { text: 'ISBN 978-0-306-40615-8' }), 'Papers', 'an ISBN with a wrong check digit does not count');
  assert.equal(shelf(paper('Full text', { sourceUrl: 'https://europepmc.org/article/PMC/PMC1234567', authors: 'A, B' })), 'Papers');
  assert.equal(shelf(paper('Draft chapter', { sourceType: 'docx', authors: 'Houfu Chen' })), 'My notes & meetings');
  assert.equal(shelf(paper('A thought about allocation')), 'My notes & meetings', 'pasted text of your own');
  assert.equal(shelf(paper('Anything at all', { kind: 'pdf' })), 'Papers', 'most PDFs are papers');
  assert.equal(shelf(paper('Annual report 2022', { kind: 'pdf', pageCount: 10 })), 'Papers', 'a year is not a course code');
  const guess = S.classify(paper('A study', { kind: 'pdf' }), { text: 'https://doi.org/10.1093/insilicoplants/diab012.' });
  assert.equal(guess.shelf, 'Papers');
  assert.equal(guess.doi, '10.1093/insilicoplants/diab012');
});

test('duplicates match on DOI, file fingerprint, or a specific title, never on generic titles', () => {
  const a = paper('A dynamic flux balance model of tomato fruit growth', { kind: 'pdf', doi: '10.1093/insilicoplants/diab012' });
  const b = paper('Gerlin 2022', { kind: 'pdf' });
  const c = paper('Metabolic network modelling of tomato fruit', { kind: 'pdf', contentHash: 'h1' });
  const d = paper('Colombie2015.pdf', { kind: 'pdf', contentHash: 'h1', notes: { 2: 'carbon' } });
  const e = paper('GreenLab: a plant growth model with organ detail', { kind: 'pdf', contentHash: 'g1' });
  const f = paper('GreenLab — a plant growth model with organ detail', { kind: 'text' });
  const g = paper('Untitled', { kind: 'pdf' }), h = paper('Untitled', { kind: 'pdf' });
  const r1 = paper('Recovered paper 1', { kind: 'pdf', tags: ['recovered'] }), r2 = paper('Recovered paper 1', { kind: 'pdf', tags: ['recovered'] });
  const review = paper('A dynamic flux balance model of tomato fruit growth', { kind: 'pdf', category: 'In review' });
  const groups = plain(S.duplicateGroups([a, b, c, d, e, f, g, h, r1, r2, review], { [b.id]: { doi: '10.1093/INSILICOPLANTS/DIAB012' } }));
  assert.equal(groups.length, 3, JSON.stringify(groups));
  const byDoi = groups.find(group => group.ids.includes(a.id));
  assert.deepEqual(byDoi.ids.sort(), [a.id, b.id].sort());
  assert.deepEqual(byDoi.why, ['doi']);
  const byFile = groups.find(group => group.ids.includes(c.id));
  assert.deepEqual(byFile.why, ['file']);
  assert.equal(byFile.sameFile, true);
  assert.equal(byFile.keep, d.id, 'the copy with marks is the suggested keep');
  const byTitle = groups.find(group => group.ids.includes(e.id));
  assert.deepEqual(byTitle.ids.sort(), [e.id, f.id].sort());
  assert.equal(byTitle.keep, e.id, 'a PDF is kept over a text copy');
  assert.equal(S.sameKind(e, f), false);
  assert.equal(groups.some(group => group.ids.includes(review.id)), false, 'manuscripts in review are never offered as duplicates');
  const split = plain(S.duplicateGroups([paper('Same long title of a paper here', { kind: 'pdf', contentHash: 'x' }), paper('Same long title of a paper here', { kind: 'pdf', contentHash: 'y' })]));
  assert.equal(split.length, 1);
  assert.equal(split[0].sameFile, false, 'two different files are reported as such');
});

test('recovered placeholders are recognised by title and their tag', () => {
  assert.equal(S.isPlaceholder(paper('Recovered paper 3', { tags: ['recovered'] })), true);
  assert.equal(S.isPlaceholder(paper('Recovered Word draft 1', { sourceName: 'recovered-w1.docx' })), true);
  assert.equal(S.isPlaceholder(paper('Recovered paper 3')), false, 'a paper someone named so is not a placeholder');
  assert.equal(S.marks(paper('x', { notes: { 1: 'a', 2: ' ' }, highlights: { 1: [{}, {}] }, questions: [{}], pdfInk: { 1: { strokes: [{}, {}, {}] } } })), 7);
});

test('grouping by reading list follows the lists, resolves merged copies, and keeps the rest', () => {
  const p1 = paper('One'), p2 = paper('Two'), p3 = paper('Three');
  const store = { lists: [{ id: 'L1', name: 'First list' }, { id: 'L2', name: ' Second ' }, { id: 'L3', name: 'Empty here' }], items: [
    { id: 'i1', listId: 'L1', paperId: p2.id }, { id: 'i2', listId: 'L1', paperId: 'old-copy' }, { id: 'i3', listId: 'L2', paperId: p2.id },
    { id: 'i4', listId: 'L3', paperId: 'gone' }, { id: 'i5', listId: 'L1', title: 'Not in the library' }
  ] };
  const grouped = plain(S.byList([p1, p2, p3], store, id => id === 'old-copy' ? p3.id : id));
  assert.deepEqual(grouped.lists, [{ listId: 'L1', name: 'First list', ids: [p2.id, p3.id] }, { listId: 'L2', name: 'Second', ids: [p2.id] }]);
  assert.deepEqual(grouped.unlisted, [p1.id]);
  assert.deepEqual(plain(S.byList([p1], undefined)), { lists: [], unlisted: [p1.id] });
});

test('the tidy plan shelves every paper, keeps review work, and offers topics as lists', () => {
  const papers = [
    paper('Proof of Enrolment', { category: 'academic' }),
    paper('Gerlin 2022', { kind: 'pdf', category: 'main' }),
    paper('Colombié 2015', { kind: 'pdf', category: 'Main' }),
    paper('Coupling precedent', { kind: 'pdf', category: 'coupling' }),
    paper('Already shelved', { kind: 'pdf', category: 'Papers' }),
    paper('Lowercase shelf', { kind: 'pdf', category: 'papers' }),
    paper('My manuscript', { sourceType: 'docx', category: 'In review' }),
    paper('Recovered paper 1', { kind: 'pdf', tags: ['recovered'] })
  ];
  const plan = plain(S.plan({ papers, lists: [{ id: 'L9', name: 'COUPLING' }], order: ['In review', 'main', 'academic'] }));
  const row = title => plan.rows.find(item => item.title === title);
  assert.equal(row('Proof of Enrolment').to, 'Personal & admin');
  assert.equal(row('Proof of Enrolment').from, 'academic');
  assert.equal(row('Gerlin 2022').topic, 'main');
  assert.equal(row('Already shelved').reason, 'already on this shelf');
  assert.equal(row('Lowercase shelf').to, 'Papers');
  assert.equal(row('My manuscript').review, true);
  assert.equal(row('My manuscript').to, 'In review');
  assert.deepEqual(plan.topics.map(topic => [topic.key, topic.ids.length, topic.listId, topic.name]), [['main', 2, '', 'main'], ['coupling', 1, 'L9', 'COUPLING']]);
  assert.deepEqual(plan.placeholders.map(item => item.title), ['Recovered paper 1']);
  assert.deepEqual(plan.order, ['In review', 'Papers', 'Books & textbooks', 'Course notes', 'My notes & meetings', 'Personal & admin']);
  assert.deepEqual(plain(S.shelfOrder(['coupling', 'Papers'], { coupling: 'coupling', zeta: 'Zeta' }, false)), ['Papers', 'Books & textbooks', 'Course notes', 'My notes & meetings', 'Personal & admin', 'coupling', 'Zeta']);
});

test('a tidy is offered only when the library would gain from one', () => {
  const tidy = [paper('A', { kind: 'pdf', category: 'Papers' }), paper('B', { category: 'My notes & meetings' }), paper('C', { category: 'In review' })];
  assert.equal(S.needsTidy(tidy), false);
  assert.equal(S.needsTidy(tidy.concat(paper('D'))), true, 'a paper off any shelf');
  assert.equal(S.needsTidy(tidy.concat(paper('E', { category: 'academic' }))), true, 'an old kind category');
  assert.equal(S.needsTidy(tidy.concat(paper('Recovered paper 2', { category: 'Papers', tags: ['recovered'] }))), true, 'a placeholder');
  assert.equal(S.needsTidy(tidy.concat(paper('F', { kind: 'pdf', category: 'Papers', contentHash: 'z' }), paper('G', { kind: 'pdf', category: 'Papers', contentHash: 'z' }))), true, 'two copies of one file');
});
