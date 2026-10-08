/* Browser geometry for separate PDF accent glyphs. Quote normalization must keep
   genuine word spaces and map every retained character to its original DOM offset. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');

(async () => {
  const engine = process.env.PHLOEM_BROWSER || 'chromium';
  const launch = { headless: true };
  if (engine === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  if (engine === 'webkit' && process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH) launch.executablePath = process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH;
  const browser = await playwright[engine].launch(launch);
  try {
    const page = await browser.newPage();
    await page.setContent('<style>.text-layer { position:relative; height:50px } .text-layer > span { position:absolute; font:20px Arial; white-space:pre; top:0 }</style>');
    await page.addScriptTag({ content: source.slice(source.indexOf('  function findOccurrenceRanges('), source.indexOf('  function wrapFindGroups(')) });
    const actual = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '20px Arial';
      const width = text => ctx.measureText(text).width;
      function fixture(parts, query, partial) {
        const root = document.createElement('div'); root.className = 'text-layer'; document.body.append(root);
        parts.forEach(([text, left, top = 0]) => {
          const span = document.createElement('span'); span.textContent = text;
          span.style.left = left + 'px'; span.style.top = top + 'px'; root.append(span);
        });
        const raw = root.textContent;
        let range;
        if (partial) {
          range = document.createRange();
          range.setStart(root.children[partial[0]].firstChild, partial[1]);
          range.setEnd(root.children[partial[2]].firstChild, partial[3]);
        }
        const map = pdfPassageTextMap(root, range);
        const groups = mappedTextGroups(map, query).map(group => group.map(piece => {
          const selected = document.createRange(); selected.setStart(piece.node, piece.start); selected.setEnd(piece.node, piece.end);
          return { span: [...root.children].indexOf(piece.span), start: piece.start, end: piece.end, text: selected.toString() };
        }));
        return { text: map.text, groups, unchanged: raw === root.textContent, native: range && range.toString() };
      }
      return {
        realSpace: fixture([['cafe', 0], ['´ and tea', width('cafe') - width('´')]], 'café and'),
        standalone: fixture([['Mu', 0], ['¨', width('Mu') - width('¨')], ['nch', width('Mu')]], 'Münch'),
        undersized: fixture([['Mu', 0], ['¨ nch', width('Mu') - width('¨') - width(' ') * .45]], 'Münch'),
        ambiguous: fixture([['Mu', 0], ['¨ nch', width('Mu') - width('¨')]], 'Mü nch'),
        known: fixture([['Mu', 0], ['¨ nch', width('Mu') - width('¨')], ['Münch', 0, 28]], 'Münch'),
        knownWideSpace: fixture([['Mu', 0], ['¨ nch', width('Mu') - width('¨') + width(' ') * .3], ['Münch', 0, 28]], 'Mü nch'),
        partial: fixture([['Mu', 0], ['¨ nch', width('Mu') - width('¨')], ['Münch', 0, 28]], 'Mün', [0, 0, 1, 3]),
        wrongLetter: fixture([['cafe', 0], ['´ and', 0]], 'cafe')
      };
    });
    assert.equal(actual.realSpace.text, 'café and tea', 'ordinary font spaces after an accented word survive');
    assert.deepEqual(actual.realSpace.groups, [[{ span: 0, start: 0, end: 4, text: 'cafe' }, { span: 1, start: 1, end: 5, text: ' and' }]]);
    assert.equal(actual.standalone.text, 'Münch', 'an accent-only span contributes no separator to the next span');
    assert.deepEqual(actual.standalone.groups, [[{ span: 0, start: 0, end: 2, text: 'Mu' }, { span: 2, start: 0, end: 3, text: 'nch' }]]);
    assert.equal(actual.undersized.text, 'Münch', 'a clearly undersized artificial gap closes');
    assert.equal(actual.ambiguous.text, 'Mü nch', 'an unknown word with a full space is not guessed');
    assert.equal(actual.known.text, 'Münch Münch', 'an intact spelling on the same page resolves an ambiguous gap');
    assert.equal(actual.knownWideSpace.text, 'Mü nch Münch', 'even an intact spelling cannot remove a clearly larger word gap');
    assert.equal(actual.partial.text, 'Mün', 'whole-word spelling evidence also handles a partial native selection');
    assert.equal(actual.partial.native, 'Mu¨ n', 'the native selection is not expanded or rewritten');
    assert.deepEqual(actual.partial.groups, [[{ span: 0, start: 0, end: 2, text: 'Mu' }, { span: 1, start: 2, end: 3, text: 'n' }]]);
    assert.equal(actual.wrongLetter.text, 'cafe´ and', 'an accent positioned earlier in the span is not moved onto its last letter');
    assert(Object.values(actual).every(item => item.unchanged), 'all source text nodes retain their original strings and offsets');
    console.log('PASS PDF accent spaces, standalone glyphs, conservative spelling, partial selection and source mapping (' + engine + ')');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
