/* Metadata-only recovery from PDF.js runs matching the supplied eLife paper.
   Text-layer content and selection offsets must stay unchanged. */
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
function harness() {
  const context = vm.createContext({});
  vm.runInContext(section('  function contentLayout(', '  function contentToLines('), context);
  vm.runInContext(section('  function hasHanScript(', '  function findImportedPaper('), context);
  return context;
}
function fixture() {
  const item = (str, x, y, width) => ({ str, transform: [20.3238, 0, 0, 20.3238, x, y], width, height: 20.3238, fontName: 'title-font' });
  return { items: [
    item('Testing the Mu', 168.548, 668.806, 144.6540571098),
    item('¨ nch hypothesis of long', 304.781, 668.975922, 224.9249873654),
    item('distance phloem transport in plants', 168.5483, 645.3915, 339.986485062)
  ] };
}

test('page-one metadata composes an overlapping diaeresis without changing source text', async () => {
  const t = harness(), content = fixture(), original = JSON.stringify(content);
  const doc = {
    getMetadata: async () => ({ info: { Title: '14683958683096 1..16' } }),
    getPage: async () => ({ getTextContent: async () => content })
  };
  const details = await t.derivePdfDetails(doc);
  assert.equal(details.title, 'Testing the Münch hypothesis of long distance phloem transport in plants');
  assert.equal(JSON.stringify(content), original, 'PDF.js source items are unchanged');
  assert.equal(t.contentLayout(content)[0].text, 'Testing the Mu¨ nch hypothesis of long', 'shared passage extraction is unchanged');
});

test('metadata preserves standalone, differently placed, and rotated diaeresis characters', () => {
  const t = harness();
  for (const mutate of [
    c => { c.items[1].transform[4] = 320; }, // after the vowel, not on it
    c => { c.items[1].transform[5] = 690; }, // another baseline
    c => { c.items[1].transform[4] = 270; }, // not over the trailing vowel
    c => { c.items[1].transform[1] = 1; },
    c => { c.items[1].fontName = 'different-font'; },
    c => { c.items[0].str = 'A diaeresis'; }
  ]) {
    const content = fixture(); mutate(content);
    assert.equal(JSON.stringify(t.pdfMetadataLayout(content)), JSON.stringify(t.contentLayout(content)));
  }
});

test('normal title metadata keeps its spelling and composed accents', async () => {
  const t = harness();
  for (const title of ['Testing the Münch hypothesis', 'An introduction to diaeresis ¨ in print']) {
    const details = await t.derivePdfDetails({
      getMetadata: async () => ({ info: { Title: title } }),
      getPage: async () => ({ getTextContent: async () => fixture() })
    });
    assert.equal(details.title, title);
  }
});
