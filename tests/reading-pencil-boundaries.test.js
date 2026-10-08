/* Real browser caret/glyph rectangles exercise the production Pencil endpoint
   helpers. The full reading-pencil-highlight suite separately covers storage,
   native finger selection, cancellation, duplicate prevention, and Undo. */
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
const start = source.indexOf('  var pencilGlyphCache='), end = source.indexOf('  function pencilStrokeValid(', start);
if (start < 0 || end < 0) throw new Error('Missing production Pencil endpoint helpers');
const helpers = source.slice(start, end);
const browserName = process.env.PHLOEM_BROWSER || 'chromium';
let checks = 0, failures = 0;
function check(name, condition, detail) {
  checks++; if (!condition) failures++;
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)));
}
(async () => {
  let browser;
  try {
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.setContent('<style>body{margin:40px} .fixture{position:relative;font:24px/1.6 monospace;white-space:pre-wrap;margin:20px 0;min-height:40px}.text-layer span{white-space:pre}.fixture b{font-weight:normal}</style><main></main>');
    await page.addScriptTag({ content: helpers });
    await page.evaluate(() => {
      window.makeFixture = function (runs, pdf = true, options = {}) {
        document.querySelector('main').replaceChildren();
        const host = document.createElement('div'); host.className = 'fixture' + (pdf ? ' text-layer' : ' original');
        if (options.width) host.style.width = options.width + 'px';
        if (options.font) host.style.fontFamily = options.font;
        document.querySelector('main').appendChild(host);
        runs.forEach((run, index) => {
          const span = document.createElement('span'); span.dataset.run = index; span.textContent = run.text;
          if (run.gap) span.style.marginLeft = run.gap + 'px';
          if (run.line) span.style.display = 'block';
          if (run.scale) { span.style.display = 'inline-block'; span.style.transformOrigin = 'left top'; span.style.transform = 'scaleX(' + run.scale + ')'; }
          host.appendChild(span);
        });
        return host;
      };
      window.glyphPoint = function (run, index, fraction = .5) {
        const node = document.querySelector('[data-run="' + run + '"]').firstChild;
        const glyph = pencilGlyphs(node).find(g => g.start <= index && g.end > index);
        const range = document.createRange(); range.setStart(node, glyph.start); range.setEnd(node, glyph.end);
        const rect = range.getBoundingClientRect(); return { x: rect.left + rect.width * fraction, y: (rect.top + rect.bottom) / 2 };
      };
      window.pencilPassage = function (from, to) {
        const host = document.querySelector('.fixture'), g = { host };
        const a = pencilTextPoint(host, from.x, from.y), b = pencilTextPoint(host, to.x, to.y);
        if (!a || !b) return { missing: true };
        const first = document.createRange(), last = document.createRange(); first.setStart(a.node, a.offset); first.collapse(true); last.setStart(b.node, b.offset); last.collapse(true);
        const backwards = first.compareBoundaryPoints(Range.START_TO_START, last) > 0;
        const left = pencilWordBounds(g, backwards ? b : a).start, right = pencilWordBounds(g, backwards ? a : b).end;
        const range = document.createRange(); range.setStart(left.node, left.offset); range.setEnd(right.node, right.offset);
        return { text: range.toString(), start: left.offset, end: right.offset, first: a.node.textContent.slice(a.offset, a.endOffset), last: b.node.textContent.slice(b.offset, b.endOffset),
          rects: Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })) };
      };
    });
    async function fixture(runs, pdf = true, options = {}) { await page.evaluate(({ runs, pdf, options }) => makeFixture(runs, pdf, options), { runs, pdf, options }); }
    async function passage(a, b) { return page.evaluate(({ a, b }) => pencilPassage(glyphPoint(...a), glyphPoint(...b)), { a, b }); }
    for (const fallback of [false, true]) {
      if (fallback) await page.evaluate(() => {
        Object.defineProperty(document, 'caretPositionFromPoint', { value: undefined, configurable: true });
        Object.defineProperty(document, 'caretRangeFromPoint', { value: undefined, configurable: true });
      });
      const label = fallback ? 'geometry fallback: ' : 'native caret: ';
      for (const pdf of [true, false]) {
        const mode = pdf ? 'PDF ' : 'Reader ';
        await fixture([{ text: 'Alpha beta gamma delta.' }], pdf);
        let result = await passage([0, 0, .85], [0, 15, .15]);
        check(label + mode + 'includes the first and last glyph when their nearest caret would exclude them', result.text === 'Alpha beta gamma' && result.first === 'A' && result.last === 'a', result);
        result = await passage([0, 15, .15], [0, 0, .85]);
        check(label + mode + 'reverse highlighting has identical inclusive word endpoints', result.text === 'Alpha beta gamma');
        result = await passage([0, 2, .8], [0, 13, .2]);
        check(label + mode + 'starting and ending inside words selects the complete endpoint words', result.text === 'Alpha beta gamma');
        result = await passage([0, 6, .8], [0, 9, .2]);
        check(label + mode + 'a single word never loses its first or last letter', result.text === 'beta');
        result = await passage([0, 17, .8], [0, 20, .2]);
        check(label + mode + 'untouched punctuation is not added to a word', result.text === 'delta');
        result = await passage([0, 18, .8], [0, 22, .2]);
        check(label + mode + 'explicitly touched punctuation remains included', result.text === 'delta.');
      }
      await fixture([{ text: 'micro' }, { text: 'scope' }, { text: 'next', gap: 8 }]);
      let result = await passage([0, 3, .8], [1, 2, .2]);
      check(label + 'PDF styling spans within one word are joined', result.text === 'microscope', result);
      result = await passage([1, 1, .8], [1, 4, .2]);
      check(label + 'PDF word snapping crosses a split-word span but stops at a visual gap', result.text === 'microscope');
      result = await passage([2, 0, .8], [2, 3, .2]);
      check(label + 'PDF words without DOM spaces remain separate across a visible gap', result.text === 'next');
      await fixture([{ text: 'Alpha' }, { text: 'beta', gap: 12 }]);
      const whitespace = await page.evaluate(() => {
        const first = document.querySelector('[data-run="0"]').getBoundingClientRect(), last = document.querySelector('[data-run="1"]').getBoundingClientRect(), y = (first.top + first.bottom) / 2;
        return { afterFirst: pencilPassage(glyphPoint(0, 0, .85), { x: first.right + 2, y }).text,
          beforeLast: pencilPassage({ x: last.left - 2, y }, glyphPoint(1, 3, .15)).text,
          reverseAfterFirst: pencilPassage({ x: first.right + 2, y }, glyphPoint(0, 0, .85)).text };
      });
      check(label + 'ending just after a word does not absorb the next word across a PDF gap', whitespace.afterFirst === 'Alpha', whitespace);
      check(label + 'starting just before a word does not absorb the previous word', whitespace.beforeLast === 'beta');
      check(label + 'reverse strokes near whitespace choose the genuinely nearest word', whitespace.reverseAfterFirst === 'Alpha');
      await fixture([{ text: 'Alpha' }, { text: 'beta', line: true }, { text: 'gamma', gap: 160 }]);
      result = await passage([1, 0, .8], [1, 3, .2]);
      check(label + 'PDF line and column boundaries cannot merge endpoint words', result.text === 'beta');
      result = await passage([1, 3, .2], [0, 0, .8]);
      check(label + 'reverse multiline selection keeps complete words on both lines', result.text === 'Alphabeta' && new Set(result.rects.map(r => r.top)).size > 1);
      await fixture([{ text: 'Alpha' }, { text: 'beta', gap: 50, scale: .7 }]);
      result = await passage([1, 0, .85], [1, 3, .15]);
      check(label + 'transformed PDF glyphs get inclusive endpoints', result.text === 'beta');
      await fixture([{ text: 'cafe\u0301 naïve 𐐀𐐁𐐂 word' }], false);
      result = await passage([0, 0, .8], [0, 3, .2]);
      check(label + 'combining accents are preserved as complete graphemes', result.text === 'cafe\u0301');
      result = await passage([0, 13, .8], [0, 16, .2]);
      check(label + 'supplementary-plane letters are not split into surrogate halves', result.text === '𐐀𐐁𐐂', result);
      await fixture([{ text: 'inter' }, { text: 'national ' }, { text: 'reader' }], false, { width: 180 });
      result = await passage([0, 2, .8], [1, 4, .2]);
      check(label + 'Reader inline styling and line wraps do not split a word', result.text === 'international');
      await fixture([{ text: 'office affinity' }], false, { font: 'serif' });
      result = await passage([0, 1, .8], [0, 4, .2]);
      check(label + 'common font ligatures do not drop endpoint letters', result.text === 'office');
      const outside = await page.evaluate(() => pencilTextPoint(document.querySelector('.fixture'), 1190, 990));
      check(label + 'blank page space does not invent a text endpoint', outside === null);
    }
    for (const fallback of [false, true]) {
      await page.evaluate(fallback => {
        pencilWordSegmenter = fallback ? null : new Intl.Segmenter(undefined, { granularity: 'word' });
      }, fallback);
      const label = fallback ? 'word fallback: ' : 'word segmenter: ';
      await fixture([{ text: '6,689 reactions and 12.75 units' }]);
      let result = await passage([0, 2, .8], [0, 4, .2]);
      check(label + 'a stroke over the trailing digits includes the complete grouped number', result.text === '6,689', result);
      result = await passage([0, 22, .8], [0, 23, .2]);
      check(label + 'decimal number endpoints remain complete', result.text === '12.75', result);
      await fixture([{ text: '6,' }, { text: '689' }, { text: ' reactions' }]);
      result = await passage([1, 0, .8], [1, 2, .2]);
      check(label + 'grouped numbers span touching PDF style runs', result.text === '6,689', result);
      await fixture([{ text: '6,' }, { text: '689', gap: 12 }]);
      result = await passage([1, 0, .8], [1, 2, .2]);
      check(label + 'a visible word gap is not swallowed into a grouped number', result.text === '689', result);
    }
    const ordinary = await page.evaluate(() => {
      const host = makeFixture([{ text: 'Alpha beta gamma' }], false), node = host.firstChild.firstChild;
      const range = document.createRange(); range.setStart(node, 1); range.setEnd(node, 15);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      pencilPassage(glyphPoint(0, 0, .85), glyphPoint(0, 15, .15));
      return getSelection().toString();
    });
    check('Pencil endpoint helpers never mutate an exact native finger/mouse selection', ordinary === 'lpha beta gamm');
    console.log('\n' + (checks - failures) + '/' + checks + ' checks passed (' + browserName + ').');
  } finally { if (browser) await browser.close(); }
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
