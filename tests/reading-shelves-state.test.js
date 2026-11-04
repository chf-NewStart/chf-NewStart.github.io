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

/* Documents a read-only check of a real library (v250) shelved wrongly, each with the shelf
   it belongs on, and ones that were right and must stay so. Each is tried as a library
   record alone (as on a device with no cached page text) and with an opening like its own
   first pages. Personal documents keep their title's shape without the owner's name. */
const nph = 'New Phytologist (2012) 193: 549–569 www.newphytologist.com\nTansley review\nComputational models of plant development and form\nReceived: 12 September 2011 Accepted: 2 December 2011\ndoi: 10.1111/j.1469-8137.2011.04009.x\nSummary The use of computational techniques…\nKey words: plant development, morphogenesis, simulation model.';
const plantPhys = 'Plant Physiology, December 2006, Vol. 142, pp. 1380–1396, www.plantphysiol.org © 2006 American Society of Plant Biologists\nIntegrated Analysis of Metabolite and Transcript Levels…\nAbstract Tomato (Solanum lycopersicum) is a model for fleshy fruit development…\ndoi: 10.1104/pp.106.088534';
const readingGuide = 'Background reading list For proposal chapter 2, sections 2.2.2–2.7 · numbers match the file names in Phloem\nHow to use it. Each section lists what to read, which part, and why.\n01 Taiz & Zeiger (2002) Plant Physiology, 3rd ed., Ch. 4 Water Balance of Plants (book pp. 47–65)\n03 Gerlin et al. (2022) Plant Physiology 189: 1–15. Published 2022. https://doi.org/10.1093/plphys/kiab548\n04 Colombié et al. (2015) The Plant Journal 81: 24–39. https://doi.org/10.1111/tpj.12685';
const bookPages = 'In this chapter we look at how water moves from the soil through the plant (see Figure 4.3), as described by Smith et al. (1998). The cohesion–tension theory…';
const cases = [
  // FORM_TITLE took any title ending in "form" for paperwork.
  ['Papers', { kind: 'pdf', title: 'Computational models of plant development and form', authors: 'Przemyslaw Prusinkiewicz, Adam Runions', pageCount: 21, sourceName: 'New Phytologist - 2012 - Prusinkiewicz - Computational models of plant development and form.pdf' }, nph],
  // "transcripts?" matched transcript levels.
  ['Papers', { kind: 'pdf', title: 'Integrated Analysis of Metabolite and Transcript Levels Reveals the Metabolic Shifts That Underlie Tomato Fruit Development and Highlight Regulatory Aspects of Metabolic Network Behavior', authors: 'Fernando Carrari, Charles Baxter, Björn Usadel, Ewa Urbanczyk-Wochniak, Maria-Ines Zanor', pageCount: 42, sourceName: '12 Carrari 2006 tomato fruit development metabolism.pdf' }, plantPhys],
  // A publication number is not a course code.
  ['Books & textbooks', { kind: 'pdf', title: 'Publication 836A: Integrated Pest Management for Greenhouse Fruits and Vegetables', pageCount: 90, sourceName: 'OMAFA_PUB-836A_EN_AODA-1.pdf' }, 'Integrated Pest Management for Fruits and Vegetables Publication Series | 836A Greenhouse. This guide is published for informational purposes only. ISBN 978-0-306-40615-7'],
  // A proposal chapter is your own writing; the reading list cites papers, it is not one.
  ['My notes & meetings', { kind: 'pdf', title: 'Background reading list (proposal chapter 2)', pageCount: 5, sourceName: '00 Reading guide - Background chapter 2.pdf' }, readingGuide],
  // Chapters cut from a textbook.
  ['Books & textbooks', { kind: 'pdf', title: 'Water Balance of Plants4', pageCount: 19, sourceName: '01 Taiz-Zeiger Ch4 Water balance of plants (book pp 47-65).pdf' }, 'Water Balance of Plants 4 Chapter ' + bookPages],
  ['Books & textbooks', { kind: 'pdf', title: 'Plant Vacuoles Are Energized by a Second Proton Pump, the H+-Pyrophosphatase', pageCount: 5, sourceName: '02 Taiz-Zeiger Ch6 Ion transport in roots (book pp 104-108).pdf' }, bookPages],
  ['Books & textbooks', { kind: 'pdf', title: 'Translocation in the Phloem10', pageCount: 29, sourceName: '05 Taiz-Zeiger Ch10 Translocation in the phloem (book pp 193-221).pdf' }, 'Translocation in the Phloem 10 Chapter ' + bookPages],
  // Right before, and must stay so.
  ['Personal & admin', { kind: 'pdf', title: 'Proof of Enrolment', pageCount: 1, sourceName: '10_Proof_of_Enrolment_Spring_2026.pdf' }, 'This letter confirms that the student named below is registered full-time for the Spring 2026 term.'],
  ['Personal & admin', { kind: 'pdf', title: 'CGC-Advertising-SponsorshipForms.indd', pageCount: 1, sourceName: 'CGC_form_ver1.pdf' }, 'Poster Session category (select one): Regular Student Competition NAME UNIVERSITY/COLLEGE AFFILIATION POSTER TITLE Application due date: September 9, 2026 POSTER APPLICATION FORM'],
  ['Personal & admin', { kind: 'text', sourceType: 'docx', title: 'Immigration Advisor Appointment Brief - A. Student', authors: 'A. Student', sourceName: 'Immigration Advisor Appointment Brief.docx' }, 'Purpose of the appointment. Documents to bring. Questions for the advisor.'],
  ['Course notes', { kind: 'pdf', title: 'CHE 620 Lecture #1 Scaling Analysis of Differential Equations', pageCount: 38, sourceName: 'CHE620_Lecture1.pdf' }, 'Scaling analysis. Order-of-magnitude estimates. Dimensionless groups.'],
  ['My notes & meetings', { kind: 'text', sourceType: 'docx', title: 'Model-choice defence — supervisor meeting, 13 August 2026', authors: 'Houfu Chen', sourceName: 'model-choice-defence.docx' }, 'Why dFBA and not a kinetic model. What the committee asked. Next steps.'],
  ['Books & textbooks', { kind: 'pdf', title: 'Modern Control Engineering', pageCount: 905, sourceName: 'Modern Control Engineering.pdf' }, 'Modern Control Engineering Fifth Edition Prentice Hall Copyright © 2010 by Pearson Education ISBN 978-0-306-40615-7']
];

test('a check of a real library: each document lands on its own shelf, with or without its text', () => {
  for (const [expected, record, opening] of cases) {
    const bare = S.classify(paper(record.title, record)), read = S.classify(paper(record.title, record), { text: opening });
    assert.equal(bare.shelf, expected, record.title + ' (no text): ' + bare.reason + ' ' + JSON.stringify(bare.scores));
    assert.equal(read.shelf, expected, record.title + ' (with text): ' + read.reason + ' ' + JSON.stringify(read.scores));
  }
  // The same records under the categories they had keep their shelves.
  assert.equal(shelf(paper('CGC-Advertising-SponsorshipForms.indd', { kind: 'pdf', category: 'non-academic', sourceName: 'CGC_form_ver1.pdf' })), 'Personal & admin');
  assert.equal(shelf(paper('Proof of Enrolment', { kind: 'pdf', category: 'academic' })), 'Personal & admin');
  assert.equal(shelf(paper('Computational models of plant development and form', { kind: 'pdf', category: 'non-academic', pageCount: 21 }), { text: nph }), 'Papers', 'a journal article’s signals win over an old category');
});

test('each corrected rule fires where it should and nowhere else', () => {
  const why = (record, hints) => S.classify(paper(record.title, record), hints);
  // Forms: only a named form or a form number, and a journal article's signals win.
  for (const title of ['Application form — field station access', 'Consent Form', 'Travel reimbursement form', 'Form IMM 5257', 'Form T2202', 'Registration-Form 2026']) assert.equal(shelf(paper(title, { kind: 'pdf' })), 'Personal & admin', title);
  assert.equal(shelf(paper('imm5257e', { kind: 'pdf', sourceName: 'imm5257e.pdf' })), 'Personal & admin', 'a form number in the file name');
  for (const title of ['Plant form and 3D architecture', 'The active form of the enzyme', 'Leaf shape and form']) assert.equal(shelf(paper(title, { kind: 'pdf' })), 'Papers', title);
  assert.equal(shelf(paper('Nitrogen application forms change tomato yield', { kind: 'pdf' }), { text: 'Journal of Plant Nutrition, Vol. 40\nAbstract We compared…\nReceived 3 March 2019; accepted 1 May 2019\nhttps://doi.org/10.1080/01904167.2019.1234567' }), 'Papers', 'a journal article that names a form is still a paper');
  // Transcripts: academic ones only.
  for (const title of ['Unofficial Transcript', 'Official transcript - Fall 2025', 'Transcript of Records', 'Academic transcript request']) assert.equal(shelf(paper(title, { kind: 'pdf' })), 'Personal & admin', title);
  assert.equal(shelf(paper('Comparative Transcriptome Profiling of Two Tomato Genotypes', { kind: 'pdf' })), 'Papers');
  // Course codes: not publication, report, form or standard numbers.
  assert.equal(why({ title: 'Integrated pest management', kind: 'pdf', sourceName: 'OMAFA_PUB-836A_EN_AODA-1.pdf', pageCount: 12 }).scores['Course notes'], 0, 'PUB-836A is a publication number');
  for (const title of ['ISO 9001 quality manual', 'Report RPT 2034 on irrigation', 'IEEE 802 wireless sensors in greenhouses']) assert.equal(why({ title, kind: 'pdf' }).scores['Course notes'], 0, title);
  assert.equal(shelf(paper('BIOL 4500 assignment 2', { kind: 'pdf' })), 'Course notes');
  assert.equal(why({ title: 'CHE 620 Lecture #1 Scaling Analysis of Differential Equations', kind: 'pdf' }).reason, 'course CHE 620, lecture');
  // Chapters: a book's are pages from a book; your own are yours; methane is not a chapter.
  assert.equal(why({ title: 'Ch4 Water balance', kind: 'pdf' }).shelf, 'Books & textbooks');
  assert.equal(why({ title: 'Chapter 10 Translocation in the phloem', kind: 'pdf', pageCount: 29 }).shelf, 'Books & textbooks');
  assert.equal(why({ title: 'Water Balance of Plants4', kind: 'pdf', sourceName: '01 Taiz-Zeiger Ch4 Water balance of plants (book pp 47-65).pdf' }).reason, 'pages cut from a book');
  assert.equal(shelf(paper('CH4 emissions from flooded rice paddies', { kind: 'pdf' })), 'Papers', 'CH4 is methane');
  assert.equal(shelf(paper('Thesis chapter 2: background', { kind: 'pdf' })), 'My notes & meetings', 'a chapter of your own thesis is not someone’s thesis');
  assert.equal(shelf(paper('Chapter 3 draft — model description', { sourceType: 'docx', authors: 'Houfu Chen' })), 'My notes & meetings');
  // CVs and résumés, not cultivars or the verb.
  for (const title of ['Academic CV 2026', 'CV - A. Student', 'Résumé', 'Resume — A. Student']) assert.equal(shelf(paper(title, { kind: 'pdf' })), 'Personal & admin', title);
  for (const title of ['Fruit growth of tomato cv. Micro-Tom under salinity', 'Sugar import into tomato cv Moneymaker fruit', 'Seeds resume germination after drought', 'Proof of concept for dynamic flux balance in tomato', 'Phloem unloading permits rapid sugar accumulation']) assert.equal(shelf(paper(title, { kind: 'pdf' })), 'Papers', title);
  for (const title of ['Study permit extension', 'Proof of registration, Fall 2026']) assert.equal(shelf(paper(title, { kind: 'pdf' })), 'Personal & admin', title);
});

test('DOIs on the opening pages: one is the document’s own, several are what it cites', () => {
  const list = S.classify(paper('Background reading list (proposal chapter 2)', { kind: 'pdf', pageCount: 5 }), { text: readingGuide });
  assert.equal(list.doi, '', 'a reading list does not take the DOI of the first paper it cites');
  const article = S.classify(paper('Computational models of plant development and form', { kind: 'pdf' }), { text: nph });
  assert.equal(article.doi, '10.1111/j.1469-8137.2011.04009.x');
  assert.equal(article.reason, 'it has a DOI');
  const book = S.classify(paper('Plant Physiology, 3rd edition', { kind: 'pdf', pageCount: 675 }), { text: 'ISBN 978-0-306-40615-7 Reviewed in Annals of Botany doi:10.1093/aob/mcg079' });
  assert.equal(book.shelf, 'Books & textbooks');
  assert.equal(book.doi, '', 'a DOI printed in a book is not kept as the book’s');
  assert.equal(S.classify(paper('Linked paper', { kind: 'pdf', doi: '10.1104/pp.106.088534' }), { text: readingGuide }).doi, '10.1104/pp.106.088534', 'a stored DOI always stands');
});

test('the PDF’s own page count wins over a stale stored one', () => {
  assert.equal(shelf(paper('Linear Systems', { kind: 'pdf', pageCount: 18 }), { pages: 544 }), 'Books & textbooks');
  assert.equal(S.classify(paper('Linear Systems', { kind: 'pdf', pageCount: 18 }), { pages: 544 }).reason, '544 pages long');
  assert.equal(shelf(paper('A review of phloem loading', { kind: 'pdf', pageCount: 4 }), { pages: 21 }), 'Papers');
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

test('the suggested keep is never a recovered placeholder or a generic title', () => {
  // Same file as Wu et al. 2019; recovered placeholders were added at time 0.
  const wu = paper('Quantifying impacts of enhancing photosynthesis on crop yield', { kind: 'pdf', contentHash: 'wu', authors: 'Alex Wu, Graeme Hammer, Al Doherty, Susanne von Caemmerer, Graham Farquhar', addedAt: 1760000000000 });
  const recovered = paper('Recovered paper 1', { kind: 'pdf', contentHash: 'wu', tags: ['recovered'], sourceName: 'recovered-p9.pdf', addedAt: 0 });
  let groups = plain(S.duplicateGroups([recovered, wu]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].keep, wu.id, 'keeping the placeholder would leave “Recovered paper 1” as the title');
  const marked = paper('Recovered paper 2', { kind: 'pdf', contentHash: 'wu2', tags: ['recovered'], addedAt: 0, notes: { 1: 'a note' } });
  const real = paper('Quantifying impacts of enhancing photosynthesis on crop yield (copy)', { kind: 'pdf', contentHash: 'wu2', addedAt: 1760000000000 });
  assert.equal(plain(S.duplicateGroups([marked, real]))[0].keep, real.id, 'even with marks the placeholder merges into the named copy');
  const untitled = paper('Untitled', { kind: 'pdf', contentHash: 'u1', addedAt: 5 }), named = paper('Sink strength and fruit growth in tomato', { kind: 'pdf', contentHash: 'u1', addedAt: 9 });
  assert.equal(plain(S.duplicateGroups([untitled, named]))[0].keep, named.id, 'a generic title goes last too');
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

test('a topic whose papers are all on reading lists already is just shelved', () => {
  // Topics main, coupling and fba, as in the library this was checked on.
  const g = paper('Gerlin 2022', { kind: 'pdf', category: 'main' }), c = paper('Colombié 2015', { kind: 'pdf', category: 'main' });
  const k = paper('Coupling precedent', { kind: 'pdf', category: 'coupling' }), f1 = paper('FBA primer', { kind: 'pdf', category: 'fba' }), f2 = paper('dFBA of E. coli', { kind: 'pdf', category: 'fba' });
  const p = paper('A new topic paper', { kind: 'pdf', category: 'proj' }), q = paper('Another one', { kind: 'pdf', category: 'proj' });
  const lists = [{ id: 'L1', name: 'Manuscript: coupling precedents' }, { id: 'L2', name: 'Source–sink feedback' }, { id: 'L3', name: 'Methods' }];
  const items = [
    { id: 'i1', listId: 'L1', paperId: k.id }, { id: 'i2', listId: 'L2', paperId: g.id }, { id: 'i3', listId: 'L2', paperId: 'old-copy-of-colombie' },
    { id: 'i4', listId: 'L3', paperId: f1.id }, { id: 'i5', listId: 'L3', paperId: f2.id }, { id: 'i6', listId: 'L3', paperId: q.id }, { id: 'i7', listId: 'gone', paperId: p.id }
  ];
  const result = plain(S.plan({ papers: [g, c, k, f1, f2, p, q], lists, items, resolve: id => id === 'old-copy-of-colombie' ? c.id : id }));
  assert.deepEqual(result.topics.map(topic => [topic.key, topic.listed, topic.suggest]), [['main', 2, 'sort'], ['coupling', 1, 'sort'], ['fba', 2, 'sort'], ['proj', 1, 'list']], 'an entry for a merged copy counts for the copy kept; an entry on a list that is gone does not');
  assert.deepEqual(plain(S.plan({ papers: [g] })).topics.map(topic => topic.suggest), ['list'], 'with no lists, a topic suggests one');
});

test('the plan reports a placeholder’s pages from its file when the file was read', () => {
  const r = paper('Recovered paper 4', { kind: 'pdf', tags: ['recovered'], pageCount: 3 });
  assert.equal(plain(S.plan({ papers: [r], hints: { [r.id]: { pages: 21 } } })).placeholders[0].pages, 21);
});

test('a tidy is offered only when the library would gain from one', () => {
  const tidy = [paper('A', { kind: 'pdf', category: 'Papers' }), paper('B', { category: 'My notes & meetings' }), paper('C', { category: 'In review' })];
  assert.equal(S.needsTidy(tidy), false);
  assert.equal(S.needsTidy(tidy.concat(paper('D'))), true, 'a paper off any shelf');
  assert.equal(S.needsTidy(tidy.concat(paper('E', { category: 'academic' }))), true, 'an old kind category');
  assert.equal(S.needsTidy(tidy.concat(paper('Recovered paper 2', { category: 'Papers', tags: ['recovered'] }))), true, 'a placeholder');
  assert.equal(S.needsTidy(tidy.concat(paper('F', { kind: 'pdf', category: 'Papers', contentHash: 'z' }), paper('G', { kind: 'pdf', category: 'Papers', contentHash: 'z' }))), true, 'two copies of one file');
});
