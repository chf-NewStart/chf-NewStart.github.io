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
function harness(pages) {
  const queries = [];
  const context = vm.createContext({
    lookupJson: async (base, params) => { queries.push(params.gsrsearch); return { query: { pages: pages(params.gsrsearch) } }; }
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
