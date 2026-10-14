/* Define must explain the selected term, never a different one. Real lookup
   functions from reading.js run in a VM with canned Wikipedia responses. */
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
function harness(pages, wiktionary = {}, articles = {}) {
  const queries = [];
  const context = vm.createContext({
    lookupJson: async (base, params) => {
      if (params.titles) { queries.push('title:' + params.titles); return { query: { pages: [articles[params.titles] || { title: params.titles, missing: true }] } }; }
      queries.push(params.gsrsearch); return { query: { pages: pages(params.gsrsearch) } };
    },
    fetch: async url => {
      const word = decodeURIComponent(String(url).split('/definition/')[1] || '');
      queries.push('wiktionary:' + word);
      return wiktionary[word] ? { ok: true, status: 200, json: async () => wiktionary[word] } : { ok: false, status: 404 };
    },
    DOMParser: class { parseFromString(html) { return { querySelectorAll: () => [], body: { textContent: String(html).replace(/<[^>]+>/g, '') } }; } }
  });
  vm.runInContext(section('  /* Words of one or two letters', '  async function commonsImage('), context);
  return { context, queries };
}
const page = (title, extract, index) => ({ title, extract, index, fullurl: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title) });

test('abbreviations and symbols count as words that must match', () => {
  const { context } = harness(() => []);
  assert.deepEqual([...context.lookupTokens('Solution EC')], ['solution', 'ec']);
  assert.deepEqual([...context.lookupTokens('pH of the feed')], ['ph', 'the', 'feed']);
  assert.deepEqual([...context.lookupTokens('K uptake in roots')], ['k', 'uptake', 'roots']);
  assert.deepEqual([...context.lookupTokens('A model of N2 fixation')], ['model', 'n2', 'fixation']);
});

test('an article that ignores the abbreviation is not offered as the definition', async () => {
  const { context } = harness(() => [
    page('Ammonia solution', 'Ammonia solution is a solution of ammonia in water.', 1),
    page('Saline (medicine)', 'Saline is a mixture of sodium chloride in water.', 2)
  ]);
  assert.equal(await context.wikipediaEntry('Solution EC'), null);
});

test('the paper\'s own spelling of an abbreviation is found and used', () => {
  const { context } = harness(() => []);
  const ch = { kind: 'pdf', pageTexts: [
    'Seedlings are watered with a nutrient solution at an electrical conductivity (EC) of 1–1.5 mS/cm.',
    'Table 5. Solution EC (mS/cm) 0.0–1.0 2.5–3.0'
  ] };
  assert.equal(context.paperAbbreviation(ch, 'EC'), 'electrical conductivity');
  const expansion = context.lookupExpansion('Solution EC', ch);
  assert.equal(expansion.full, 'electrical conductivity');
  assert.equal(expansion.term, 'Solution electrical conductivity');
  assert.equal(context.paperAbbreviation({ kind: 'pdf', pageTexts: ['photosynthetic photon flux density (PPFD) was 400'] }, 'PPFD'), 'photosynthetic photon flux density');
  assert.equal(context.paperAbbreviation({ kind: 'pdf', pageTexts: ['the root system (EC) was large'] }, 'EC'), '', 'initials must spell the abbreviation');
  assert.equal(context.lookupExpansion('Solution EC', { kind: 'pdf', pageTexts: ['no definition here'] }), null);
});

test('a matching article is still found once the abbreviation is spelled out', async () => {
  const { context, queries } = harness(query => query === 'electrical conductivity'
    ? [page('Electrical resistivity and conductivity', 'Electrical conductivity is the reciprocal of electrical resistivity.', 1)]
    : [page('Ammonia solution', 'Ammonia solution is a solution of ammonia in water.', 1)]);
  assert.equal(await context.wikipediaEntry('Solution electrical conductivity'), null);
  const found = await context.wikipediaEntry('electrical conductivity');
  assert.equal(found.title, 'Electrical resistivity and conductivity');
  assert.deepEqual(queries, ['Solution electrical conductivity', 'electrical conductivity']);
});

test('Define reads a PDF-only paper before resolving an abbreviation', async () => {
  const { context, queries } = harness(query => query === 'electrical conductivity'
    ? [page('Electrical conductivity meter', 'Measures electrical conductivity in a solution.', 1)]
    : []);
  const ch = { id: 'paper', kind: 'pdf', termLookups: {}, pageTexts: ['Table 5. Solution EC'] };
  let builds = 0, shown = null;
  Object.assign(context, {
    currentId: 'paper', pdfDoc: { numPages: 2 }, lookupSerial: 1,
    lookupCache: Object.create(null),
    find: () => ch,
    pdfFindTextsReady: () => ch.pageTexts.length === 2,
    ensurePdfFindTexts: async () => {
      builds++;
      ch.pageTexts = ['Table 5. Solution EC', 'Feed at an electrical conductivity (EC) of 1.5 mS/cm.'];
      return true;
    },
    renderLookup: (_term, result) => { shown = result; },
    rememberLookup: () => {}, commonsImage: async () => null,
    hasAiRoute: () => false, showLookupProblem: () => {},
    byId: () => ({ classList: { remove() {} } })
  });
  vm.runInContext(section('  async function loadLookup(', '  function queueLookup('), context);
  await context.loadLookup('Solution EC', 1, 'Table 5');
  assert.equal(builds, 1, 'PDF text is completed before checking the paper for EC');
  assert.equal(shown?.expansion?.full, 'electrical conductivity');
  assert.equal(shown?.title, 'Electrical conductivity meter');
  assert.deepEqual(queries, ['Solution electrical conductivity', 'title:electrical conductivity', 'electrical conductivity']);
});

test('answers saved before the fix are kept unless a short word could have been dropped', () => {
  const { context } = harness(() => []);
  const old = { title: 'Alpha definition', source: 'wikipedia' };
  assert.equal(context.savedLookupTrusted('alpha', old), true, 'nothing was dropped from "alpha"');
  assert.equal(context.savedLookupTrusted('alpha', { title: 'Alpha definition', source: 'wikipedia', lookupV: 2 }), true, 'saved answers are kept (v213); "Look it up again" refreshes one');
  assert.equal(context.savedLookupTrusted('beta gamma', old), true);
  assert.equal(context.savedLookupTrusted('Solution EC', { title: 'Ammonia solution', source: 'wikipedia' }), false, '"EC" was dropped before');
  assert.equal(context.savedLookupTrusted('Solution EC', { title: 'Electrical conductivity meter', source: 'wikipedia', lookupV: 2 }), true);
  assert.equal(context.savedLookupTrusted('pH', { title: 'Acidity', source: 'ai' }), true, 'an AI explanation read the paper itself');
  assert.equal(context.savedLookupTrusted('alpha', null), false);
});

/* Houfu, Oct 2026: selecting "angiosperm" answered with the Angiosperm Phylogeny Group (a
   group of botanists). One word is a dictionary question: Wiktionary first, then the
   article the word names (following redirects), then a search ranked by Wikipedia. */
const sense = (pos, html) => ({ en: [{ partOfSpeech: pos, definitions: [{ definition: html }] }] });
test('one word gets its dictionary sense from Wiktionary', async () => {
  const { context, queries } = harness(() => [], { angiosperm: sense('Noun', 'Any <a href="/wiki/plant">plant</a> of the clade Angiospermae, having seeds enclosed in an ovary.') });
  const found = await context.definitionEntry('angiosperm');
  assert.equal(found.source, 'wiktionary');
  assert.equal(found.title, 'angiosperm');
  assert.equal(found.extract, 'noun: Any plant of the clade Angiospermae, having seeds enclosed in an ovary.');
  assert.deepEqual([...queries], ['wiktionary:angiosperm']);
});
test('a plural follows "plural of" to its word once', async () => {
  const { context, queries } = harness(() => [], {
    angiosperms: sense('Noun', 'plural of <a href="/wiki/angiosperm">angiosperm</a>'),
    angiosperm: sense('Noun', 'Any plant of the clade Angiospermae.')
  });
  const found = await context.definitionEntry('Angiosperms');
  assert.equal(found.title, 'angiosperm');
  assert.deepEqual([...queries], ['wiktionary:angiosperms', 'wiktionary:Angiosperms', 'wiktionary:angiosperm']);
});
test('without a dictionary entry the article the word names is used, through its redirect', async () => {
  const { context } = harness(() => [], {}, { angiosperm: { title: 'Flowering plant', extract: 'Flowering plants form the clade Angiospermae.', fullurl: 'https://en.wikipedia.org/wiki/Flowering_plant' } });
  assert.equal((await context.definitionEntry('angiosperm')).title, 'Flowering plant');
});
test('a disambiguation page is not a definition', async () => {
  const { context } = harness(() => [page('Flowering plant', 'Flowering plants form the clade Angiospermae.', 1)], {}, { angiosperm: { title: 'Angiosperm (disambiguation)', extract: 'Angiosperm may refer to:', pageprops: { disambiguation: '' } } });
  assert.equal((await context.definitionEntry('angiosperm')).title, 'Flowering plant');
});
test('for one word the search keeps Wikipedia\'s own order instead of a longer title that contains it', async () => {
  const { context } = harness(() => [
    page('Flowering plant', 'Flowering plants are plants that bear flowers and fruits, and form the clade Angiospermae.', 1),
    page('Basal angiosperms', 'The basal angiosperms are the flowering plants which diverged first.', 2),
    page('Angiosperm Phylogeny Group', 'The Angiosperm Phylogeny Group is an informal international group of systematic botanists.', 3)
  ]);
  assert.equal((await context.wikipediaEntry('angiosperm')).title, 'Flowering plant');
});
test('abbreviations never go to the dictionary', async () => {
  const { context, queries } = harness(() => [], {}, { EC: { title: 'EC', extract: 'EC may refer to:', pageprops: { disambiguation: '' } } });
  await context.definitionEntry('EC');
  assert.equal(queries.some(query => query.startsWith('wiktionary:')), false);
});

test('"Look it up again" replaces a saved search hit; offline the saved answer stays', async () => {
  const saved = { title: 'Angiosperm Phylogeny Group', extract: 'An informal group of botanists.', source: 'wikipedia', lookupV: 2, imageChecked: true };
  async function run(fresh, offline) {
    const { context } = harness(() => [], { angiosperm: sense('Noun', 'Any plant of the clade Angiospermae.') });
    if (offline) context.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const ch = { id: 'paper', kind: 'text', termLookups: { angiosperm: saved } };
    let shown = null, remembered = null;
    Object.assign(context, {
      currentId: 'paper', pdfDoc: null, lookupSerial: 1, lookupCache: Object.create(null), lastLookup: null,
      find: () => ch, pdfFindTextsReady: () => true, ensurePdfFindTexts: async () => true,
      renderLookup: (_term, result) => { shown = result; }, rememberLookup: (_ch, _key, result) => { remembered = result; },
      commonsImage: async () => null, hasAiRoute: () => false, showLookupProblem: () => {},
      byId: () => ({ classList: { remove() {}, add() {} } })
    });
    vm.runInContext(section('  async function loadLookup(', '  /* A saved answer that is not'), context);
    await context.loadLookup('angiosperm', 1, '', fresh);
    return { shown, remembered };
  }
  assert.equal((await run(false)).shown.title, 'Angiosperm Phylogeny Group', 'a saved answer is used without asking again');
  const again = await run(true);
  assert.equal(again.shown.source, 'wiktionary');
  assert.equal(again.remembered.source, 'wiktionary', 'the new answer replaces the saved one');
  const offline = await run(true, true);
  assert.equal(offline.shown.title, 'Angiosperm Phylogeny Group', 'offline the saved answer still shows');
  assert.equal(offline.remembered, null, 'and is not re-saved as if confirmed');
});
