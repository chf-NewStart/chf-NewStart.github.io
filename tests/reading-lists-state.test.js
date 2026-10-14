const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = 2_000_000_000_000;
class Clock extends Date { static now() { return NOW; } }
const context = vm.createContext({ window: {}, Date: Clock });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-lists.js'), 'utf8'), context, { filename: 'reading-lists.js' });
const L = context.window.PhloemLists;
const plain = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
const titles = (store, listId) => L.items(store, listId).map(item => item.title);

function seeded() {
  let store = L.upsertList(undefined, { id: 'list', name: 'Proposal background' }, 1000);
  ['First', 'Second', 'Third'].forEach((title, index) => {
    store = L.upsertItem(store, { id: 'i' + index, listId: 'list', title }, 1100 + index);
  });
  return store;
}

test('plain-script API is frozen and needs no document, storage, or network', () => {
  assert.equal(Object.isFrozen(L), true);
  same(plain(L.normalize()), { version: 1, lists: [], items: [], deleted: {} });
  assert.equal(typeof context.window.document, 'undefined');
});

test('normalization keeps valid neighbours when single records are damaged', () => {
  const input = {
    version: 1,
    lists: [{ id: 'a', name: 'Kept', updatedAt: 10 }, { id: '', name: 'No id', updatedAt: 10 }, { id: 'b', name: 'No clock' }, null],
    items: [
      { id: 'x', listId: 'a', title: 'Kept item', updatedAt: 11 },
      { id: 'y', listId: 'a', title: '', updatedAt: 11 },
      { id: '__proto__', listId: 'a', title: 'Hostile id', updatedAt: 11 },
      { id: 'z', listId: 'a', title: 'Future', updatedAt: NOW * 2 },
      { id: 'w', listId: 'a', title: 'Bad link', url: 'javascript:alert(1)', doi: 'not a doi', year: 'soon', updatedAt: 12 }
    ],
    deleted: { gone: 5, bad: -1 }
  };
  const before = JSON.stringify(input);
  const store = L.normalize(input);
  same(store.lists.map(list => list.id), ['a']);
  same(store.items.map(item => item.id).sort(), ['w', 'x']);
  const bad = store.items.find(item => item.id === 'w');
  assert.equal(bad.url, '');
  assert.equal(bad.doi, '');
  assert.equal(bad.year, '');
  same(plain(store.deleted), { gone: 5 });
  assert.equal(JSON.stringify(input), before, 'input is not mutated');
});

test('a list from a newer version fails closed with a distinct code', () => {
  assert.throws(() => L.normalize({ version: 2, lists: [] }), error => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => L.merge(L.normalize(), { version: 3 }), error => error.code === 'UNSUPPORTED_VERSION');
});

test('items are added at the end, edited in place, and keep their creation time', () => {
  let store = seeded();
  same(titles(store, 'list'), ['First', 'Second', 'Third']);
  store = L.upsertItem(store, { id: 'i1', note: 'Look at Figure 2' }, 5000);
  const second = store.items.find(item => item.id === 'i1');
  assert.equal(second.note, 'Look at Figure 2');
  assert.equal(second.title, 'Second');
  assert.equal(second.createdAt, 1101);
  assert.equal(second.updatedAt, 5000);
  assert.throws(() => L.upsertItem(store, { id: 'orphan', listId: 'missing', title: 'Nowhere' }, 6000), error => error.code === 'MISSING_LIST');
  assert.throws(() => L.upsertItem(store, { id: 'blank', listId: 'list', title: '  ' }, 6000), /title, DOI, or link/);
});

test('ticking an item stamps when it was done, and unticking clears it', () => {
  let store = L.upsertItem(seeded(), { id: 'i0', done: true }, 7000);
  assert.equal(store.items.find(item => item.id === 'i0').doneAt, 7000);
  store = L.upsertItem(store, { id: 'i0', takeaway: 'Sinks pull' }, 8000);
  assert.equal(store.items.find(item => item.id === 'i0').doneAt, 7000, 'later edits keep the done time');
  store = L.upsertItem(store, { id: 'i0', done: false }, 9000);
  assert.equal(store.items.find(item => item.id === 'i0').doneAt, 0);
});

test('moving changes only the moved item, and concurrent moves both survive a merge', () => {
  const base = seeded();
  const moved = L.move(base, 'i2', 'i0', 3000);
  same(titles(moved, 'list'), ['Third', 'First', 'Second']);
  const changed = moved.items.filter(item => item.updatedAt === 3000).map(item => item.id);
  same(changed, ['i2']);
  const toEnd = L.move(base, 'i0', '', 3100);
  same(titles(toEnd, 'list'), ['Second', 'Third', 'First']);
  const ipad = L.upsertItem(base, { id: 'i1', done: true }, 3200);
  const merged = L.merge(moved, ipad);
  same(titles(merged, 'list'), ['Third', 'First', 'Second']);
  assert.equal(merged.items.find(item => item.id === 'i1').done, true);
});

test('moves keep working after ranks run out of room', () => {
  let store = seeded();
  for (let step = 0; step < 80; step++) store = L.move(store, step % 2 ? 'i1' : 'i2', 'i0', 4000 + step);
  const order = titles(store, 'list');
  assert.equal(order.length, 3);
  assert.equal(new Set(L.items(store, 'list').map(item => item.rank)).size, 3, 'ranks stay distinct');
});

test('merging keeps the newest copy of each record and tombstones win over older edits', () => {
  const mac = L.upsertItem(seeded(), { id: 'i0', title: 'First (renamed on Mac)' }, 5000);
  const ipad = L.upsertItem(seeded(), { id: 'i0', note: 'iPad note' }, 4000);
  const merged = L.merge(ipad, mac);
  assert.equal(merged.items.find(item => item.id === 'i0').title, 'First (renamed on Mac)');
  same(plain(L.merge(mac, ipad)), plain(merged), 'merge is order independent');
  const removed = L.remove(seeded(), 'i1', 6000);
  same(titles(L.merge(removed, mac), 'list'), ['First (renamed on Mac)', 'Third']);
  const editedAfter = L.upsertItem(seeded(), { id: 'i1', note: 'later' }, 7000);
  assert.ok(L.items(L.merge(removed, editedAfter), 'list').some(item => item.id === 'i1'), 'an edit made after the removal brings it back');
});

test('deleting a list removes its items everywhere', () => {
  const store = L.remove(seeded(), 'list', 9000);
  same(store.lists, []);
  same(store.items, []);
  assert.equal(L.merge(seeded(), store).items.length, 0);
});

test('identical clocks resolve the same way on every device', () => {
  const left = L.upsertItem(seeded(), { id: 'i0', note: 'left' }, 5000);
  const right = L.upsertItem(seeded(), { id: 'i0', note: 'right' }, 5000);
  same(plain(L.merge(left, right)), plain(L.merge(right, left)));
});

test('a Markdown reading guide with reference headings imports title, authors, DOI, link and what to look for', () => {
  const text = [
    '# Source–sink feedback reading list', '', 'Intro prose that is not a paper.', '',
    '## Read first: equations', '', '### Stanfield & Bartlett (2022)', '',
    '**Coordination Between Phloem Loading and Structure Maintains Carbon Transport Under',
    'Drought**', '',
    '[Open full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC8891486/) · [DOI](https://doi.org/10.3389/fpls.2022.787837)', '',
    'Read Figure 2 and Methods equations 7–10. This paper explicitly',
    'models:', '', '- a source-leaf sucrose mass balance;', '- Michaelis–Menten loading;', '',
    'A later paragraph that should not be included.', '',
    '### Chiou & Bush (1998)', '', '**Sucrose Is a Signal Molecule in Assimilate Partitioning**', '',
    '[DOI](https://doi.org/10.1073/pnas.95.8.4784)', '', 'Read the abstract and Table 2.'
  ].join('\n');
  const result = L.parseImport(text, 'reading_list.md');
  assert.equal(result.format, 'markdown');
  assert.equal(result.title, 'Source–sink feedback reading list');
  assert.equal(result.items.length, 2);
  const [first, second] = result.items;
  assert.equal(first.title, 'Coordination Between Phloem Loading and Structure Maintains Carbon Transport Under Drought');
  assert.equal(first.authors, 'Stanfield & Bartlett');
  assert.equal(first.year, '2022');
  assert.equal(first.doi, '10.3389/fpls.2022.787837');
  assert.equal(first.url, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8891486/');
  assert.equal(first.note, 'Read Figure 2 and Methods equations 7–10. This paper explicitly models: a source-leaf sucrose mass balance; Michaelis–Menten loading;');
  assert.equal(second.title, 'Sucrose Is a Signal Molecule in Assimilate Partitioning');
  assert.equal(second.note, 'Read the abstract and Table 2.');
});

test('a Markdown checklist keeps ticks and sub-bullet notes; every line is something to read', () => {
  const text = [
    '- [ ] Osorio, Ruan & Fernie (2014) — An update on source-to-sink carbon partitioning in tomato. https://doi.org/10.3389/fpls.2014.00516',
    '  - Look for: the levels at which regulation happens',
    '- [x] **Flux balance analysis primer** — Orth et al. (2010), read the Figure 1 example',
    '- [ ] Konuntakiet 2020 DPhil thesis, chapter 3'
  ].join('\n');
  const items = L.parseImport(text, '').items;
  assert.equal(items.length, 3);
  assert.equal(items[0].authors, 'Osorio, Ruan & Fernie');
  assert.equal(items[0].title, 'An update on source-to-sink carbon partitioning in tomato');
  assert.equal(items[0].doi, '10.3389/fpls.2014.00516');
  assert.equal(items[0].note, 'the levels at which regulation happens');
  assert.equal(items[1].done, true);
  assert.equal(items[1].authors, 'Orth et al.');
  assert.equal(items[1].year, '2010');
  assert.equal(items[1].note, 'read the Figure 1 example');
  assert.equal(items[2].kind, 'paper');
  assert.equal(items[2].title, 'Konuntakiet 2020 DPhil thesis, chapter 3');
});

test('a plain pasted list makes one item per line', () => {
  const items = L.parseImport('10.1093/aob/mcm258\nhttps://doi.org/10.1073/PNAS.95.8.4784.\nSucrose is a signal molecule\nRead chapter 4 of Taiz and Zeiger\n', '').items;
  same(items.map(item => [item.kind, item.doi, item.title]), [
    ['paper', '10.1093/aob/mcm258', ''],
    ['paper', '10.1073/pnas.95.8.4784', ''],
    ['paper', '', 'Sucrose is a signal molecule'],
    ['paper', '', 'Read chapter 4 of Taiz and Zeiger']
  ]);
});

test('BibTeX exports from reference managers import with accents, braces and names in order', () => {
  const bib = `@comment{jabref-meta: x}
@article{osorio2014,
  title = {An update on {source-to-sink} carbon partitioning in tomato},
  author = {Osorio, Sonia and Ruan, Yong-Ling and Fernie, Alisdair R.},
  journal = {Frontiers in Plant Science}, year = 2014,
  doi = {10.3389/fpls.2014.00516}
}
@phdthesis{k2020, title = "Whole-plant model of {G}{\\"o}ttingen tomato", author = {Konuntakiet, Tanapon and others},
  school = {University of Oxford}, year = {2020}, url = {https://ora.ox.ac.uk/objects/uuid:abc}}`;
  const result = L.parseImport(bib, 'library.bib');
  assert.equal(result.format, 'bibtex');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].title, 'An update on source-to-sink carbon partitioning in tomato');
  assert.equal(result.items[0].authors, 'Sonia Osorio, Yong-Ling Ruan, Alisdair R. Fernie');
  assert.equal(result.items[0].year, '2014');
  assert.equal(result.items[0].venue, 'Frontiers in Plant Science');
  assert.equal(result.items[1].title, 'Whole-plant model of Göttingen tomato');
  assert.equal(result.items[1].authors, 'Tanapon Konuntakiet, et al.');
  assert.equal(result.items[1].url, 'https://ora.ox.ac.uk/objects/uuid:abc');
});

test('RIS exports import', () => {
  const ris = 'TY  - JOUR\nTI  - Dynamic flux balance analysis of diauxic growth\nAU  - Mahadevan, R.\nAU  - Doyle, F. J.\nPY  - 2002/01/01\nJO  - Biophysical Journal\nDO  - 10.1016/S0006-3495(02)73903-9\nER  - \n';
  const result = L.parseImport(ris, 'export.ris');
  assert.equal(result.format, 'ris');
  same(plain(result.items.map(item => [item.title, item.authors, item.year, item.venue, item.doi])), [
    ['Dynamic flux balance analysis of diauxic growth', 'R. Mahadevan, F. J. Doyle', '2002', 'Biophysical Journal', '10.1016/s0006-3495(02)73903-9']
  ]);
});

test('Markdown export reads back in with ticks, notes and takeaways', () => {
  let store = seeded();
  store = L.upsertItem(store, { id: 'i0', authors: 'Sonia Osorio, Yong-Ling Ruan, Alisdair R. Fernie', year: '2014', doi: '10.3389/fpls.2014.00516', note: 'regulation levels', takeaway: 'Sinks set the pace', done: true }, 5000);
  store = L.upsertItem(store, { id: 'thesis', listId: 'list', kind: 'task', title: 'Konuntakiet thesis chapter 3' }, 5100);
  assert.equal(store.items.find(item => item.id === 'thesis').kind, 'paper', 'everything on a reading list is something to read');
  const markdown = L.toMarkdown(store.lists[0], L.items(store, 'list'));
  assert.match(markdown, /^# Proposal background/);
  assert.match(markdown, /- \[x\] \*\*First\*\* — Osorio, Ruan & Fernie \(2014\) https:\/\/doi\.org\/10\.3389\/fpls\.2014\.00516/);
  const back = L.parseImport(markdown, '').items;
  assert.equal(back.length, 4);
  assert.equal(back[0].title, 'First');
  assert.equal(back[0].done, true);
  assert.equal(back[0].note, 'regulation levels');
  assert.equal(back[0].takeaway, 'Sinks set the pace');
  assert.equal(back[3].title, 'Konuntakiet thesis chapter 3');
  const bib = L.toBibtex(L.items(store, 'list'));
  assert.match(bib, /@article\{osorio2014first,/);
  assert.match(bib, /doi = \{10\.3389\/fpls\.2014\.00516\}/);
  assert.match(bib, /Konuntakiet thesis chapter 3/);
});

test('short author lines read naturally in every common format', () => {
  assert.equal(L.shortAuthors('Sonia Osorio, Yong-Ling Ruan, Alisdair R. Fernie'), 'Osorio, Ruan & Fernie');
  assert.equal(L.shortAuthors('Osorio, S., Ruan, Y.-L., Fernie, A. R.'), 'Osorio, Ruan & Fernie');
  assert.equal(L.shortAuthors('Mahadevan R; Edwards JS; Doyle FJ'), 'Mahadevan, Edwards & Doyle');
  assert.equal(L.shortAuthors('Stanfield & Bartlett'), 'Stanfield & Bartlett');
  assert.equal(L.shortAuthors('Ann Bee, Cal Dee, Eve Fay, Gus Hay'), 'Bee et al.');
  assert.equal(L.shortAuthors(''), '');
});

test('library matching links only clear matches', () => {
  const papers = [
    { id: 'osorio', title: 'osorio2014_tomato-source-sink-carbon-partitioning', sourceName: 'osorio2014_tomato-source-sink-carbon-partitioning.pdf' },
    { id: 'other', title: 'Tomato fruit metabolic fluxes', sourceName: 'colombie2015.pdf' }
  ];
  const item = { title: 'An update on source-to-sink carbon partitioning in tomato', authors: 'Osorio, Ruan & Fernie', year: '2014' };
  assert.equal(L.confidentMatch(item, papers), 'osorio');
  assert.equal(L.confidentMatch({ title: 'Tomato fluxes' }, papers), '');
  assert.equal(L.confidentMatch({ title: 'x', doi: '10.1/abc' }, [{ id: 'd', sourceUrl: 'https://doi.org/10.1/abc' }]), 'd');
  const copies = [{ id: 'recent', title: 'Sucrose is a signal molecule in assimilate partitioning', sourceName: 'pq004784.pdf' },
    { id: 'older', title: 'Sucrose is a signal molecule in assimilate partitioning', sourceName: 'chiou-bush-1998.pdf' }];
  assert.equal(L.confidentMatch({ title: 'Sucrose Is a Signal Molecule in Assimilate Partitioning', authors: 'Chiou & Bush', year: '1998' }, copies), 'recent',
    'two copies of one paper link to the first (most recently read) copy');
  assert.equal(L.confidentMatch({ title: 'Sucrose signalling in assimilate partitioning of beet' }, [{ id: 'a', title: 'Sucrose signalling in assimilate partitioning of beet leaves' }, { id: 'b', title: 'Sucrose signalling in assimilate partitioning of beet roots' }]), '',
    'two different papers with the same score stay ambiguous');
});

test('Crossref works become list items, without markup', () => {
  const item = L.fromCrossref({
    DOI: '10.1111/J.1365-3040.1994.TB00318.X', type: 'journal-article',
    title: ['Scaling acclimation of<i>Alocasia</i>to whole-plant performance'],
    author: [{ given: 'D. A.', family: 'Sims' }, { family: 'Pearcy' }],
    issued: { 'date-parts': [[1994, 3]] }, 'container-title': ['Plant, Cell &amp; Environment']
  });
  same(plain(item), {
    kind: 'paper', title: 'Scaling acclimation ofAlocasiato whole-plant performance', authors: 'D. A. Sims, Pearcy',
    year: '1994', venue: 'Plant, Cell & Environment', doi: '10.1111/j.1365-3040.1994.tb00318.x', type: 'journal-article'
  });
  assert.equal(L.fromCrossref(null), null);
});
