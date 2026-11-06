/* Contents in Reader view (Houfu: "where ... did contents go after changing to reader view").
   Contents used to vanish on the switch to Reader view, since an entry could only jump to a PDF
   page. Now the same list stays in the dock, under a phone's More, in Pages & zoom and on T, and
   an entry moves within Reader view to its heading (or to its page when the heading is not found
   in the text) without leaving Reader view. PDF view keeps its page jumps; a paper without
   contents, and a text paper opened after a PDF, show no button. The landing has to hold on hard
   papers and in awkward moments too: see the second half. PHLOEM_BROWSER=chromium|webkit */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.PHLOEM_CONTENTS_READER_TEST_PORT || 8199);
// In memory only: window.__rebuildDelay stretches the Reader view build, as a big book on a phone does.
const BUILD_START = "var oldText=ch.readerText||'',layouts=[],pageDims=[];";
const stretchBuild = text => {
  if (!text.includes(BUILD_START)) throw new Error('the Reader view build changed: update BUILD_START');
  return text.replace(BUILD_START, 'if(window.__rebuildDelay)await new Promise(function(r){setTimeout(r,window.__rebuildDelay);});' + BUILD_START);
};
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(pathname === '/reading.js' ? stretchBuild(data.toString('utf8')) : data);
  });
});
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
}

const pdfEscape = value => String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
/* Helvetica pages from [text, size, x, y] lines. `outline` is [title, page, children?] bookmarks. */
function makePdf(pages, outline) {
  const objects = [];
  const pageObject = i => 4 + i * 2;
  const firstFree = pageObject(pages.length);
  let outlineRef = '';
  if (outline && outline.length) {
    let next = firstFree + 1;
    const number = items => items.map(([title, page, children]) => { const node = { title, page, id: next++ }; node.kids = children ? number(children) : []; return node; });
    const roots = number(outline);
    const write = (items, parent) => items.forEach((node, i) => {
      let body = '<< /Title (' + pdfEscape(node.title) + ') /Parent ' + parent + ' 0 R /Dest [' + pageObject(node.page - 1) + ' 0 R /Fit]';
      if (items[i - 1]) body += ' /Prev ' + items[i - 1].id + ' 0 R';
      if (items[i + 1]) body += ' /Next ' + items[i + 1].id + ' 0 R';
      if (node.kids.length) body += ' /First ' + node.kids[0].id + ' 0 R /Last ' + node.kids[node.kids.length - 1].id + ' 0 R /Count ' + node.kids.length;
      objects[node.id] = body + ' >>';
      write(node.kids, node.id);
    });
    write(roots, firstFree);
    objects[firstFree] = '<< /Type /Outlines /First ' + roots[0].id + ' 0 R /Last ' + roots[roots.length - 1].id + ' 0 R /Count ' + roots.length + ' >>';
    outlineRef = ' /Outlines ' + firstFree + ' 0 R';
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R' + outlineRef + ' >>';
  objects[2] = '<< /Type /Pages /Kids [' + pages.map((_, i) => pageObject(i) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, i) => {
    const stream = lines.map(line => 'BT /F1 ' + line[1] + ' Tf 1 0 0 1 ' + line[2] + ' ' + line[3] + ' Tm (' + pdfEscape(line[0]) + ') Tj ET').join('\n');
    objects[pageObject(i)] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
    objects[5 + i * 2] = '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream';
  });
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) { offsets[id] = Buffer.byteLength(out, 'binary'); out += id + ' 0 obj\n' + objects[id] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'binary');
  out += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'binary');
}

const SENTENCES = ['Sucrose moves from the mesophyll into the sieve tubes of the minor veins of a leaf.',
  'Loading raises the pressure that drives the flow toward the sinks further along the stem.',
  'Roots, fruits and young leaves draw on that stream as they grow through the season.',
  'Export rose with light until the loading capacity of the phloem limited it in the end.'];
// Body text from y down to `to`: four 12 pt lines, then a wider gap that starts a new paragraph.
function body(page, y, to) {
  const lines = [];
  let n = page;
  while (y >= to) {
    for (let i = 0; i < 4 && y >= to; i++) { lines.push([SENTENCES[n++ % 4], 12, 60, y]); y -= 15; }
    y -= 14;
  }
  return lines;
}
const pageOf = (page, ...parts) => parts.flat().concat([[String(page), 11, 300, 40]]);
// Sections start mid-page on purpose: Reader view has to find the heading, not just the page.
const bookPages = () => [
  [['A small book about phloem', 24, 72, 700]],
  pageOf(2, body(2, 730, 90)),
  pageOf(3, [['1 Introduction', 22, 60, 730]], body(3, 690, 90)),
  pageOf(4, body(4, 730, 90)),
  pageOf(5, body(5, 730, 470), [['1.1 Foundations', 18, 60, 430]], body(50, 395, 90)),
  pageOf(6, body(6, 730, 90)),
  pageOf(7, body(7, 730, 90)),
  pageOf(8, body(8, 730, 470), [['2 Methods', 22, 60, 430]], body(80, 395, 90)),
  pageOf(9, body(9, 730, 90)),
  pageOf(10, [['3 Results', 22, 60, 730]], body(10, 690, 90)),
  pageOf(11, body(11, 730, 90)),
  pageOf(12, body(12, 730, 470), [['Appendix: Raw Data Tables', 18, 60, 430]], body(120, 395, 90)),
  pageOf(13, body(13, 730, 90)),
  pageOf(14, body(14, 730, 90))
];
const BOOKMARKS = [
  ['1 Introduction', 3, [['1.1 Foundations', 5]]],
  ['2 Methods', 8],
  ['Results', 10], // printed "3 Results": the bookmark drops the number
  ['APPENDIX: RAW DATA TABLES', 12], // printed in mixed case
  ['Figures', 14] // no such heading in the text: go to the page
];
const withBookmarks = () => makePdf(bookPages(), BOOKMARKS);
// A printed contents page with no bookmarks; printed page 1 is PDF page 5.
const withPrintedContents = () => makePdf([
  [['A small textbook', 24, 72, 700]],
  [['Copyright', 14, 72, 700]],
  [['Contents', 24, 72, 730], ['1 Introduction 1', 14, 90, 650], ['1.1 Foundations 2', 14, 110, 620], ['2 Methods 4', 14, 90, 590]],
  [['Preface', 22, 72, 700], ['iv', 11, 300, 40]],
  [['1 Introduction', 24, 60, 730]].concat(body(1, 690, 90), [['1', 11, 300, 40]]),
  [['1.1 Foundations', 20, 60, 730]].concat(body(2, 690, 90), [['2', 11, 300, 40]]),
  body(3, 730, 90).concat([['3', 11, 300, 40]]),
  [['2 Methods', 24, 60, 730]].concat(body(4, 690, 90), [['4', 11, 300, 40]]),
  body(5, 730, 90).concat([['5', 11, 300, 40]])
]);
const withoutContents = () => makePdf([
  [['Leaf phloem loading', 22, 60, 730]].concat(body(1, 690, 90)),
  [['Results', 20, 60, 730]].concat(body(2, 690, 90))
]);

/* Papers as they really come. Each entry says what it tests; every heading sits mid-page or at a
   page edge on purpose. */
const HARD_ENTRIES = [
  ['Color Plates', 3], // a page with no text at all: the text after it, not the chapter before
  ['Growth curves', 4], // printed "III-B2. Growth curves": two numbering parts
  ['End of page heading', 5], // the last line of its page
  ['Next page heading', 7], // the bookmark is a page early, as when it points at the end of a page
  ['Growth conditions', 9], // run into its own text
  ['Yield', 10], // a sentence opening with the word comes before the real heading
  ['Glossary', 11], // printed with its letters spaced out
  ['Chapter 3', 12], // only the opening of "Chapter 3: Methods", after a sentence that opens the same
  ['Back cover', 14] // the last page, with no text
];
const hardBook = () => makePdf([
  [['A book of hard cases', 24, 72, 700]],
  pageOf(2, body(2, 730, 90)),
  [],
  pageOf(4, body(4, 730, 470), [['III-B2. Growth curves', 18, 60, 430]], body(40, 395, 90)),
  pageOf(5, body(5, 730, 130), [['End of page heading', 18, 60, 80]]),
  pageOf(6, body(6, 730, 90)),
  pageOf(7, body(7, 730, 90)),
  pageOf(8, [['Next page heading', 22, 60, 730]], body(8, 690, 90)),
  pageOf(9, body(9, 730, 470), [['Growth conditions The plants were grown in a chamber under a fixed day length.', 12, 60, 420]], body(90, 390, 90)),
  pageOf(10, [['Yield was measured by hand at the end of the season for every plant.', 12, 60, 730]], body(10, 690, 470), [['Yield and quality', 20, 60, 430]], body(100, 395, 90)),
  pageOf(11, body(11, 730, 470), [['G L O S S A RY', 20, 60, 430]], body(110, 395, 90)),
  pageOf(12, [['Chapter 3 shows how the samples were taken in the field that year.', 12, 60, 730]], body(12, 690, 470), [['Chapter 3: Methods', 20, 60, 430]], body(120, 395, 90)),
  pageOf(13, body(13, 730, 90)),
  []
], HARD_ENTRIES);

/* Harder still: what real books and a read of the code turned up. */
const HARDER_ENTRIES = [
  ['Some Words of Advice', 3], // the page's running head "Some Words of Advice 143" comes before "6.4 Some Words of Advice"
  ['References', 4], // not in the text of its page, and the next page's "67 References" is only a running head
  ['Additional techniques', 6], // opens the next page, fused with its first subheading
  ['Water', 8], // "Water, nutrients and sugars" comes before "3 Water"
  ['Methods', 9], // "Statistical methods" comes before "Methods and materials"
  ['C4 photosynthesis', 10], // "3.1 C3 photosynthesis" comes before "3.2 C4 photosynthesis"
  ['Discussion', 11], // a sentence opens with the word on its page; the heading tops the next page
  ['Materials and Methods', 13] // printed "Materials & Methods"
];
const harderBook = () => makePdf([
  [['A book of harder cases', 24, 72, 700]],
  pageOf(2, body(2, 730, 90)),
  pageOf(3, [['Some Words of Advice 143', 12, 60, 750]], body(3, 715, 470), [['6.4 Some Words of Advice', 18, 60, 430]], body(30, 395, 90)),
  pageOf(4, body(4, 730, 90)),
  pageOf(5, [['67 References', 18, 60, 750]], body(5, 710, 90)),
  pageOf(6, body(6, 730, 90)),
  pageOf(7, [['Additional techniques Index compression', 22, 60, 730]], body(7, 690, 90)),
  pageOf(8, body(8, 730, 520), [['Water, nutrients and sugars move together in the stream of the phloem.', 12, 60, 490]], body(80, 460, 300), [['3 Water', 20, 60, 260]], body(81, 225, 90)),
  pageOf(9, body(9, 730, 560), [['Statistical methods', 18, 60, 520]], body(90, 490, 340), [['Methods and materials', 18, 60, 300]], body(91, 270, 90)),
  pageOf(10, [['3.1 C3 photosynthesis', 18, 60, 730]], body(10, 695, 440), [['3.2 C4 photosynthesis', 18, 60, 400]], body(100, 365, 90)),
  pageOf(11, body(11, 730, 470), [['Discussion of these points is postponed until the end of the next chapter.', 12, 60, 430]], body(110, 400, 90)),
  pageOf(12, [['Discussion', 22, 60, 730]], body(12, 690, 90)),
  pageOf(13, body(13, 730, 470), [['Materials & Methods', 18, 60, 430]], body(130, 395, 90)),
  pageOf(14, body(14, 730, 90))
], HARDER_ENTRIES);
/* And what the last check found: running heads in the other order, headings that run into their text. */
const EDGE_ENTRIES = [
  ['Methods', 2], // runs into its text, with "Statistical methods" a proper heading further down
  ['Data analysis', 3], // the same with a stop, above "Supplementary data analysis"
  ['References', 4], // not in the text of its page; the next page's first row is the running head "References 68"
  ['Results', 7], // the bookmark has no number, and "3 Results" opens the next page
  ['Sources & Sinks', 9], // printed "Sources + Sinks"
  ['I', 10], // a part with no heading in the text, and a sentence opening "I think" in the middle of its page
  ['Conclusions', 11], // not in the text; the page ends with a running foot "Conclusions 143"
  ['Civil works', 12], // not in the text, and "civil" is no roman numeral: the heading "Works" is another section
  ['Stra\u00dfe', 13], // printed "STRASSE"
  ['A short page', 14], // one line: the reading line of the view below it is on the next page
  ['Appendix', 16], // printed "Appendix 1": a number that small is no printed page number
  ['Summary', 17] // a caption "Summary Statistics by group" above the heading "1.2 Summary and outlook"
];
const edgeBook = () => makePdf([
  [['A book of edge cases', 24, 72, 700]],
  pageOf(2, body(2, 730, 560), [['Methods', 12, 60, 530], ['The plants were grown in pots for ten days under the lights and watered daily.', 12, 60, 515], ['Every stem was measured each week until the end of the second harvest period.', 12, 60, 500]], body(3, 470, 330), [['Statistical methods', 18, 60, 300]], body(4, 265, 90)),
  pageOf(3, [['Data analysis. All the tests were two sided and were run with default settings.', 12, 60, 730], ['The plants were grown in pots for ten days under the lights and watered daily.', 12, 60, 715]], body(6, 685, 420), [['Supplementary data analysis', 18, 60, 390]], body(7, 355, 90)),
  pageOf(4, body(8, 730, 90)),
  [['References 68', 14, 60, 750]].concat(body(9, 720, 90)),
  pageOf(6, body(10, 730, 90)),
  pageOf(7, body(11, 730, 90)),
  pageOf(8, [['3 Results', 20, 60, 730]], body(12, 690, 90)),
  pageOf(9, body(13, 730, 470), [['Sources + Sinks', 18, 60, 430]], body(14, 395, 90)),
  pageOf(10, body(15, 730, 470), [['I think that the flow of sugar through the stem is driven by pressure alone.', 12, 60, 430]], body(16, 400, 90)),
  pageOf(11, body(17, 730, 200), [['Conclusions 143', 12, 60, 100]]),
  pageOf(12, body(18, 730, 520), [['Works', 18, 60, 490]], body(19, 455, 90)),
  pageOf(13, body(21, 730, 470), [['STRASSE', 18, 60, 430]], body(22, 395, 90)),
  pageOf(14, [['One line alone on this page.', 12, 60, 730]]),
  pageOf(15, body(23, 730, 90)),
  pageOf(16, body(24, 730, 470), [['Appendix 1', 18, 60, 430]], body(25, 395, 90)),
  pageOf(17, body(26, 730, 560), [['Summary Statistics by group', 12, 60, 530]], body(27, 500, 350), [['1.2 Summary and outlook', 18, 60, 320]], body(28, 285, 90))
], EDGE_ENTRIES);
// A long book: its first pages are under 1% of the way through.
const LONG_ENTRIES = [['Preface', 2], ['Chapter One', 90]];
const longBook = () => makePdf(Array.from({ length: 170 }, (_, i) => {
  if (i === 1) return pageOf(2, [['Preface', 20, 60, 730]], body(2, 690, 90));
  if (i === 89) return pageOf(90, [['Chapter One', 20, 60, 730]], body(90, 690, 90));
  return pageOf(i + 1, body(i, 730, 90));
}), LONG_ENTRIES);
// The same title on several pages, for a paper with no page marks.
const repeatedTitles = () => makePdf([
  [['Notes on phloem', 24, 72, 700]],
  pageOf(2, body(2, 730, 90)),
  pageOf(3, body(3, 730, 470), [['Summary', 18, 60, 430]], body(30, 395, 90)),
  pageOf(4, body(4, 730, 90)),
  pageOf(5, body(5, 730, 470), [['Summary', 18, 60, 430]], body(50, 395, 90)),
  pageOf(6, body(6, 730, 90)),
  pageOf(7, body(7, 730, 470), [['Discussion', 18, 60, 430]], body(70, 395, 90))
], [['Summary', 3], ['Summary', 5], ['Discussion', 7]]);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const mobile = ENGINE !== 'webkit' ? true : undefined;
const LAPTOP = { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: mobile, userAgent: IPHONE, serviceWorkers: 'block' };
const TABLET = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: mobile, userAgent: IPAD, serviceWorkers: 'block' };

const shown = (page, sel) => page.locator(sel).evaluate(node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
const isReader = page => page.evaluate(() => !document.getElementById('textDocument').classList.contains('hidden') && document.getElementById('pdfFrame').classList.contains('hidden'));
const dialogOpen = (page, id) => page.locator('#' + id).evaluate(node => node.open);
const pageLabel = page => page.evaluate(() => document.getElementById('pageNumber').textContent.trim());
// The label follows a smooth scroll: the page it shows once it has stayed the same for a second.
const settledLabel = async page => {
  let last = await pageLabel(page), since = Date.now();
  for (const end = Date.now() + 20000; Date.now() < end && Date.now() - since < 1000;) {
    await page.waitForTimeout(100);
    const now = await pageLabel(page);
    if (now !== last) { last = now; since = Date.now(); }
  }
  return last;
};
async function openPdf(page, name, buffer, expectContents) {
  await page.locator('#pdfFile').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="1"] .text-layer span'), null, { timeout: 60000 });
  if (expectContents) await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden'), null, { timeout: 30000 }).catch(() => {});
  else await page.waitForTimeout(1200);
}
const toReader = async page => {
  await page.evaluate(() => document.getElementById('reflowBtn').click());
  await page.waitForFunction(() => document.querySelectorAll('#textDocument .page-marker').length >= 1 && !document.getElementById('textDocument').classList.contains('hidden') && !document.getElementById('reflowBtn').disabled, null, { timeout: 60000 });
  await page.waitForTimeout(400);
};
const toPdf = async page => {
  await page.evaluate(() => document.getElementById('reflowBtn').click());
  await page.waitForFunction(() => !document.getElementById('pdfFrame').classList.contains('hidden') && document.querySelector('#pdfFrame .pdf-page'), null, { timeout: 60000 });
  await page.waitForTimeout(900);
};
// Where a Reader view heading sits: px below the top of the pane, and whether anything covers it.
const spot = (page, text) => page.evaluate(text => {
  const pane = document.getElementById('documentPane').getBoundingClientRect();
  const section = [...document.querySelectorAll('#textDocument .para')].find(s => s.querySelector('.original').textContent.trim() === text);
  if (!section) return { missing: true };
  const r = section.querySelector('.original').getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + Math.min(24, r.width / 2), r.top + r.height / 2);
  return { offset: Math.round(r.top - pane.top), covered: !(hit && section.contains(hit)), current: section.classList.contains('current') };
}, text);
const atTop = at => !!at && !at.missing && at.offset >= 0 && at.offset <= 120 && !at.covered;
// The same for a paragraph known by how it opens, whatever spaces its PDF put between the letters.
const spotOpening = (page, text) => page.evaluate(text => {
  const flat = value => value.replace(/\s+/g, '').toLowerCase();
  const pane = document.getElementById('documentPane').getBoundingClientRect();
  const section = [...document.querySelectorAll('#textDocument .para')].find(s => flat(s.querySelector('.original').textContent).startsWith(flat(text)));
  if (!section) return { missing: true };
  const r = section.querySelector('.original').getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + Math.min(24, r.width / 2), r.top + r.height / 2);
  return { offset: Math.round(r.top - pane.top), covered: !(hit && section.contains(hit)), current: section.classList.contains('current') };
}, text);
const currentCount = page => page.evaluate(() => document.querySelectorAll('#textDocument .para.current').length);
const markerSeen = (page, wanted) => page.evaluate(wanted => {
  const pane = document.getElementById('documentPane').getBoundingClientRect();
  const marker = [...document.querySelectorAll('#textDocument .page-marker')].find(m => +m.querySelector('[data-goto-page]').dataset.gotoPage === wanted);
  if (!marker) return false;
  const r = marker.getBoundingClientRect();
  return r.bottom > pane.top && r.top < pane.bottom;
}, wanted);
const idbMutate = (page, store, key, fnSource) => page.evaluate(([store, key, fnSource]) => new Promise((res, rej) => { const fn = eval(fnSource); const q = indexedDB.open('marginFiles', 2); q.onsuccess = () => { const tx = q.result.transaction(store, 'readwrite'), os = tx.objectStore(store), r = os.get(key); r.onsuccess = () => { const next = fn(r.result); if (next === undefined) os.delete(key); else os.put(next, key); }; tx.oncomplete = () => { res(true); q.result.close(); }; tx.onerror = () => rej(tx.error); }; q.onerror = () => rej(q.error); }), [store, key, fnSource]);
const storedPaper = (page, name) => page.evaluate(name => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.sourceName === name || ch.title === name), name);
const remembersReader = (page, id) => page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.readerView.v1') || '{}')[id] === 1, id);
// Headless browsers have no voices: sentences that last a fixed time, for Listen.
const fakeSpeech = () => {
  class Utterance { constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.lang = 'en-US'; this.volume = 1; } }
  const voice = { name: 'Samantha', voiceURI: 'com.apple.voice.compact.en-US.Samantha', lang: 'en-US', localService: true, default: true };
  const synth = { speaking: false, pending: false, paused: false, current: null, timer: 0,
    getVoices() { return [voice]; },
    speak(u) { this.speaking = true; this.current = u; (window.__spoken = window.__spoken || []).push(u.text); clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (this.current !== u) return; this.speaking = false; this.current = null; if (u.onend) u.onend({}); }, u.text.trim() ? (window.__speechMs || 700) : 5); if (u.onstart) u.onstart({}); },
    cancel() { clearTimeout(this.timer); const u = this.current; this.current = null; this.speaking = false; if (u && u.onerror) u.onerror({ error: 'canceled' }); },
    pause() { this.paused = true; }, resume() { this.paused = false; }, addEventListener() {}, removeEventListener() {}, onvoiceschanged: null };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
};
const describe = at => JSON.stringify(at);
// The page mark at the top of the pane, for an entry whose heading is not in the text.
const topMarker = page => page.evaluate(() => {
  const pane = document.getElementById('documentPane').getBoundingClientRect();
  const hit = [...document.querySelectorAll('#textDocument .page-marker')].find(m => { const r = m.getBoundingClientRect(); return r.bottom > pane.top && r.top < pane.top + 120; });
  return hit ? +hit.querySelector('[data-goto-page]').dataset.gotoPage : 0;
});
const dockOff = page => page.evaluate(() => Array.from(document.getElementById('zenDock').children)
  .filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none')
  .filter(node => { const r = node.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight + .5 || r.left < 0 || r.right > innerWidth + .5; })
  .map(node => node.id));

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const errors = [];
  const fresh = async (options, chapters, beforeLoad) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (beforeLoad) await page.addInitScript(beforeLoad);
    await page.addInitScript(list => { if (!localStorage.getItem('readingRoom.v1')) localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: list, deleted: {}, merged: {}, savedAt: Date.now() })); }, chapters || []);
    await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
    return { context, page };
  };
  const contentsEntry = (page, title) => page.locator('#tocList .toc-item', { hasText: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') });
  const pick = async (page, opener, title) => {
    await page.locator(opener).click();
    await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
    await contentsEntry(page, title).click();
    await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);
  };

  /* Laptop: bookmarks. The list stays through the switch, and every kind of entry lands. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    check('PDF view shows Contents, as before', await shown(page, '#zenContents'));
    await toReader(page);
    check('Reader view keeps Contents in the dock', await shown(page, '#zenContents'));
    let entries = [];
    if (await shown(page, '#zenContents')) {
      await page.locator('#zenContents').click();
      await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
      entries = await page.locator('#tocList .toc-item').allTextContents();
      await page.locator('[data-close="tocDialog"]').click();
    }
    check('Reader view lists the same entries', entries.join('|') === '1 Introduction|1.1 Foundations|2 Methods|Results|APPENDIX: RAW DATA TABLES|Figures', entries.join('|'));

    const land = async (title, heading, label) => {
      await pick(page, '#zenContents', title).catch(error => check(label + ': could open the entry', false, error.message.split('\n')[0]));
      check(label + ': stays in Reader view', await isReader(page));
      const at = await spot(page, heading);
      check(label + ': lands on its heading, at the top', atTop(at), describe(at));
      check(label + ': that heading is now the current paragraph', !!at.current, describe(at));
    };
    await land('2 Methods', '2 Methods', 'a heading in the middle of a page');
    check('the list closes after the jump', !await dialogOpen(page, 'tocDialog'));
    await land('1.1 Foundations', '1.1 Foundations', 'a nested entry, going back up');
    await land('Results', '3 Results', 'a bookmark that drops the printed number');
    await land('APPENDIX: RAW DATA TABLES', 'Appendix: Raw Data Tables', 'a bookmark in another case');

    await pick(page, '#zenContents', 'Figures').catch(error => check('no heading: could open the entry', false, error.message.split('\n')[0]));
    check('a title not in the text still stays in Reader view', await isReader(page));
    check('and goes to the start of its page', await topMarker(page) === 14, await topMarker(page));

    // One place across views: the PDF opens on the page the entry led to.
    await pick(page, '#zenContents', '2 Methods').catch(() => {});
    await page.waitForTimeout(800);
    await toPdf(page);
    check('back on the PDF, it opens on the entry\'s page', (await pageLabel(page)).startsWith('8 / 14'), await pageLabel(page));
    check('PDF view still shows Contents', await shown(page, '#zenContents'));
    await pick(page, '#zenContents', 'Results').catch(() => {});
    await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('10 / 14'), null, { timeout: 10000 }).catch(() => {});
    check('in PDF view an entry still goes to its page', (await pageLabel(page)).startsWith('10 / 14'), await pageLabel(page));
    check('and stays in PDF view', !await isReader(page));

    // T and Pages & zoom, in Reader view.
    await toReader(page);
    await page.locator('#documentPane').focus().catch(() => {});
    await page.keyboard.press('t');
    await page.waitForFunction(() => document.getElementById('tocDialog').open, null, { timeout: 3000 }).catch(() => {});
    check('T opens Contents in Reader view', await dialogOpen(page, 'tocDialog'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 3000 }).catch(() => {});
    check('Escape closes it and stays in Reader view', !await dialogOpen(page, 'tocDialog') && await isReader(page));
    await page.locator('#zenMore').click();
    await page.locator('#zenReadingControls').click();
    await page.locator('#readerControlsDialog').waitFor({ state: 'visible' });
    check('Pages & zoom has Contents too', await shown(page, '#readerControlsDialog #tocBtn'));
    if (await shown(page, '#readerControlsDialog #tocBtn')) {
      await page.locator('#readerControlsDialog #tocBtn').click();
      await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
      check('and it opens the list', (await page.locator('#tocList .toc-item').count()) === 6);
      await contentsEntry(page, '1 Introduction').click();
      await page.waitForTimeout(350);
      check('its entries move within Reader view as well', await isReader(page) && atTop(await spot(page, '1 Introduction')), describe(await spot(page, '1 Introduction')));
    } else {
      await page.locator('[data-close="readerControlsDialog"]').click();
    }

    // The dock keeps every button on screen in Reader view.
    for (const [width, height] of [[1280, 800], [1024, 768], [768, 1024], [1180, 820], [1280, 520], [1024, 390]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const off = await dockOff(page);
      check('at ' + width + '×' + height + ' every dock button stays on screen', !off.length, off.join(','));
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    // A paper reopened in Reader view has Contents as soon as its PDF is read.
    await page.waitForTimeout(800);
    await page.locator('#zenExit').click();
    await page.waitForFunction(() => document.querySelector('[data-continue-paper]'));
    await page.evaluate(() => [...document.querySelectorAll('[data-continue-paper]')].find(c => /small.book/i.test(c.textContent)).click());
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .page-marker').length > 0, null, { timeout: 60000 });
    check('the paper reopens in Reader view', await isReader(page));
    await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden'), null, { timeout: 30000 }).catch(() => {});
    check('and shows Contents', await shown(page, '#zenContents'));
    if (await shown(page, '#zenContents')) {
      await pick(page, '#zenContents', '2 Methods');
      check('its entries work after a reopen', await isReader(page) && atTop(await spot(page, '2 Methods')), describe(await spot(page, '2 Methods')));
    }

    // A paper without contents: no button in Reader view, and T does nothing.
    await page.locator('#zenExit').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    await openPdf(page, 'no-contents.pdf', withoutContents(), false);
    await toReader(page);
    check('a paper without contents shows no button in Reader view', !await shown(page, '#zenContents'));
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    check('and T does nothing', !await dialogOpen(page, 'tocDialog'));
    await context.close();
  }

  /* A printed contents page: entries carry a page read from the print, not a bookmark. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'printed.pdf', withPrintedContents(), true);
    await toReader(page);
    check('a printed contents page stays too', await shown(page, '#zenContents'));
    if (await shown(page, '#zenContents')) {
      await pick(page, '#zenContents', '2 Methods');
      check('its entries land on the heading in Reader view', await isReader(page) && atTop(await spot(page, '2 Methods')), describe(await spot(page, '2 Methods')));
    }
    await context.close();
  }

  /* A text paper opened after a PDF never shows the PDF's Contents. */
  {
    const plain = { id: 'plain-text', kind: 'text', title: 'Plain text notes', authors: 'Tester', fr: 'First paragraph of plain text.\n\nSecond paragraph of plain text.', en: '', notes: {}, addedAt: 1, updatedAt: 1, lastOpenedAt: 1 };
    const { context, page } = await fresh(LAPTOP, [plain]);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.locator('#zenExit').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-library-paper="plain-text"], [data-continue-paper="plain-text"], [data-open="plain-text"]'), null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => {
      const row = document.querySelector('[data-continue-paper="plain-text"], [data-open="plain-text"], [data-library-paper="plain-text"]');
      const open = row && (row.matches('button,a') ? row : row.querySelector('button,a') || row);
      if (open) open.click();
    });
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && /plain text/i.test(document.getElementById('textDocument').textContent), null, { timeout: 15000 }).catch(() => {});
    check('the text paper opened', await page.evaluate(() => /Second paragraph of plain text/.test(document.getElementById('textDocument').textContent)));
    await page.waitForTimeout(400);
    check('and shows no Contents button', !await shown(page, '#zenContents'));
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    check('and T does nothing there', !await dialogOpen(page, 'tocDialog'));
    await context.close();
  }

  /* Phone: first under More; the jump clears the bar and any top inset. */
  {
    const { context, page } = await fresh(PHONE);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    check('the phone bar has no Contents button of its own', !await shown(page, '#zenContents'));
    await page.locator('#zenMore').tap();
    await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
    const firstId = await page.evaluate(() => (Array.from(document.getElementById('zenMoreMenu').children).find(node => node.getClientRects().length) || {}).id);
    check('Contents is the first item under More in Reader view', firstId === 'zenPhoneContents', firstId);
    if (firstId === 'zenPhoneContents') {
      await page.locator('#zenPhoneContents').tap();
      await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
      check('one tap from More opens the list', (await page.locator('#tocList .toc-item').count()) === 6);
      await contentsEntry(page, '2 Methods').tap();
      await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
      const at = await spot(page, '2 Methods');
      check('a tap on an entry stays in Reader view', await isReader(page));
      check('the heading lands in sight, not under the bar', atTop(at), describe(at));
    }
    await context.close();
  }

  /* iPad: in the dock, at both orientations. */
  {
    const { context, page } = await fresh(TABLET);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    check('an iPad keeps Contents in the dock in Reader view', await shown(page, '#zenContents'));
    for (const [width, height] of [[820, 1180], [1180, 820]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const off = await dockOff(page);
      check('iPad ' + width + '×' + height + ': every dock button stays on screen', !off.length, off.join(','));
    }
    if (await shown(page, '#zenContents')) {
      await page.locator('#zenContents').tap();
      await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
      await contentsEntry(page, 'APPENDIX: RAW DATA TABLES').tap();
      await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
      const at = await spot(page, 'Appendix: Raw Data Tables');
      check('a tap on an iPad lands on the heading', await isReader(page) && atTop(at), describe(at));
    }
    await context.close();
  }

  /* Hard papers: each entry lands on its heading, on its page. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'hard-book.pdf', hardBook(), true);
    await toReader(page);
    const land = async (title, opening, label) => {
      await pick(page, '#zenContents', title).catch(error => check(label + ': could open the entry', false, error.message.split('\n')[0]));
      check(label + ': stays in Reader view', await isReader(page));
      const at = await spotOpening(page, opening);
      check(label + ': lands on it, at the top', atTop(at), describe(at));
      check(label + ': it is the one current paragraph', !!at.current && await currentCount(page) === 1, describe(at));
    };
    await pick(page, '#zenContents', 'Color Plates');
    check('an entry on a page with no text stays in Reader view', await isReader(page));
    check('and goes to the text after that page, not the chapter before', await topMarker(page) === 4, await topMarker(page));
    await land('Growth curves', 'III-B2. Growth curves', 'a heading with two numbering parts');
    await land('Next page heading', 'Next page heading', 'a bookmark a page before its heading');
    await page.waitForTimeout(800);
    await toPdf(page);
    check('the place saved after it is the heading\'s page', (await pageLabel(page)).startsWith('8 / 14'), await pageLabel(page));
    await toReader(page);
    await land('End of page heading', 'End of page heading', 'a heading that ends its page');
    await page.waitForTimeout(800);
    await toPdf(page);
    check('back on the PDF, it opens on that page, not the next', (await pageLabel(page)).startsWith('5 / 14'), await pageLabel(page));
    await toReader(page);
    await land('Growth conditions', 'Growth conditions The plants', 'a heading run into its text');
    await land('Yield', 'Yield and quality', 'a real heading after a sentence opening with the same word');
    await land('Glossary', 'GLOSSARY', 'a heading with its letters spaced out');
    await land('Chapter 3', 'Chapter 3: Methods', 'a title that only opens the heading, after a sentence opening the same');
    await pick(page, '#zenContents', 'Back cover');
    check('an entry on a last page with no text stays in Reader view', await isReader(page));
    check('and shows the last page that has text', await markerSeen(page, 13));
    await context.close();
  }

  /* An entry tapped while Reader view is still being built waits for the text. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await page.evaluate(() => { window.__rebuildDelay = 3000; document.getElementById('reflowBtn').click(); });
    await page.waitForFunction(() => document.getElementById('reflowBtn').disabled, null, { timeout: 3000 }).catch(() => {});
    check('the switch started a build', await page.evaluate(() => document.getElementById('reflowBtn').disabled));
    await pick(page, '#zenContents', 'Results');
    const toast = await page.locator('#readerToast').textContent();
    check('it says Reader view is still being built', /still being built/.test(toast), toast);
    check('it does not leave Reader view', await isReader(page));
    check('the second tap comes during the build too', await page.evaluate(() => document.getElementById('reflowBtn').disabled));
    await pick(page, '#zenContents', '2 Methods');
    await page.waitForFunction(() => !document.getElementById('reflowBtn').disabled && document.querySelectorAll('#textDocument .page-marker').length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const at = await spot(page, '2 Methods');
    check('when the text is there it lands on the last entry tapped', await isReader(page) && atTop(at), describe(at));
    check('and the paper still remembers Reader view', await remembersReader(page, (await storedPaper(page, 'small-book.pdf')).id));
    await context.close();
  }
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await page.evaluate(() => { window.__rebuildDelay = 1000; document.getElementById('reflowBtn').click(); });
    await page.waitForFunction(() => document.getElementById('reflowBtn').disabled, null, { timeout: 3000 }).catch(() => {});
    await pick(page, '#zenContents', '2 Methods');
    await page.locator('#zenExit').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    await page.waitForTimeout(1600);
    const left = await storedPaper(page, 'small-book.pdf');
    check('leaving the paper during the build drops the jump', await page.locator('#libraryPage').isVisible() && !left.readerPlace && !left.focusPara && left.readPage === 1 && await currentCount(page) === 0, JSON.stringify([left.readerPlace, left.focusPara, left.readPage]));
    await context.close();
  }

  /* A rebuild on open changes the paragraphs: the page map has to follow them. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.waitForTimeout(1200);
    const id = (await storedPaper(page, 'small-book.pdf')).id;
    await idbMutate(page, 'derived', id, `(r)=>{r.readerV=6;
      r.pageParagraphs=r.pageParagraphs.map(ps=>{const t=ps.map(p=>typeof p==='string'?p:p.t).filter(t=>t&&!/^\\d+$/.test(t)).join(' ');return t?[{t,k:'',r:[]}]:[];});
      r.readerText=r.pageParagraphs.map(ps=>ps.length?ps[0].t:'').filter(Boolean).join('\\n\\n');return r;}`);
    await page.addInitScript(() => { window.__rebuildDelay = 800; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden') && [...document.querySelectorAll('#textDocument .para .original')].some(n => n.textContent.trim() === '2 Methods'), null, { timeout: 60000 });
    await page.waitForTimeout(600);
    await pick(page, '#zenContents', '2 Methods');
    const at = await spot(page, '2 Methods');
    check('after a rebuild on open, an entry still lands on its heading', await isReader(page) && atTop(at), describe(at));
    // And tapped while that rebuild is still running.
    await idbMutate(page, 'derived', id, `(r)=>{r.readerV=6;return r;}`);
    await page.addInitScript(() => { window.__rebuildDelay = 5000; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden'), null, { timeout: 60000 });
    await pick(page, '#zenContents', 'Results');
    const waiting = await page.locator('#readerToast').textContent();
    check('tapped during a rebuild on open, it says so', /still being built/.test(waiting), waiting);
    await page.waitForFunction(() => { const list = [...document.querySelectorAll('#textDocument .para')], s = list.find(n => n.querySelector('.original').textContent.trim() === '3 Results'); if (!s) return false; const top = s.getBoundingClientRect().top - document.getElementById('documentPane').getBoundingClientRect().top; return top >= 0 && top <= 120; }, null, { timeout: 60000 }).catch(() => {});
    const during = await spot(page, '3 Results');
    check('and it lands on the heading once the text is there', await isReader(page) && atTop(during), describe(during));
    await context.close();
  }

  /* With no page marks: a heading is still found, and the paper keeps its view when one is not. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.waitForTimeout(1200);
    const id = (await storedPaper(page, 'small-book.pdf')).id;
    await idbMutate(page, 'derived', id, '(r)=>{r.readerText=r.readerText+"\\n\\nOne more paragraph that no page holds.";return r;}');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    await pick(page, '#zenContents', '2 Methods');
    const at = await spot(page, '2 Methods');
    check('no page marks: a heading in the text is still found, in Reader view', await isReader(page) && atTop(at), describe(at));
    const noMarks = await storedPaper(page, 'small-book.pdf');
    check('and the saved page follows it', noMarks.readPage === 8 && noMarks.readerPlace && noMarks.readerPlace.page === 8, JSON.stringify([noMarks.readPage, noMarks.readerPlace]));
    await pick(page, '#zenContents', 'Figures');
    await page.waitForFunction(() => document.getElementById('pageNumber').textContent.startsWith('14 / 14'), null, { timeout: 10000 }).catch(() => {});
    check('no page marks and no heading: it shows the page', !await isReader(page) && (await pageLabel(page)).startsWith('14 / 14'), await pageLabel(page));
    const toast = await page.locator('#readerToast').textContent();
    check('and says why', /could not find that section/.test(toast), toast);
    check('and the paper still opens in Reader view next time', await remembersReader(page, id));
    await context.close();
  }

  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'repeated.pdf', repeatedTitles(), true);
    await toReader(page);
    await page.waitForTimeout(1200);
    const id = (await storedPaper(page, 'repeated.pdf')).id;
    await idbMutate(page, 'derived', id, '(r)=>{r.readerText=r.readerText+"\\n\\nOne more paragraph that no page holds.";return r;}');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    await pick(page, '#zenContents', 'Discussion');
    const once = await spot(page, 'Discussion');
    check('no page marks: a title found once lands in Reader view, heading or not', await isReader(page) && atTop(once), describe(once));
    await page.locator('#zenContents').click();
    await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#tocList .toc-item', { hasText: /^Summary$/ }).nth(1).click();
    const repeated = await settledLabel(page);
    check('no page marks: a title that repeats shows its page, not the first of them', !await isReader(page) && repeated.startsWith('5 / '), repeated);
    await context.close();
  }

  /* Harder papers: from real books and from reading the code. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'harder-book.pdf', harderBook(), true);
    await toReader(page);
    const land = async (title, heading, label) => {
      await pick(page, '#zenContents', title).catch(error => check(label + ': could open the entry', false, error.message.split('\n')[0]));
      check(label + ': stays in Reader view', await isReader(page));
      const at = await spot(page, heading);
      check(label + ': lands on it, at the top', atTop(at), describe(at));
      check(label + ': it is the one current paragraph', !!at.current && await currentCount(page) === 1, describe(at));
    };
    check('the running head is in the text of this paper', !(await spot(page, 'Some Words of Advice 143')).missing);
    await land('Some Words of Advice', '6.4 Some Words of Advice', 'a running head before the real heading');
    await land('Additional techniques', 'Additional techniques Index compression', 'a next page opening with the heading fused to its subheading');
    await land('Water', '3 Water', 'a sentence "Water, nutrients..." before the heading');
    await land('Methods', 'Methods and materials', 'a heading that opens with the title after one that only contains it');
    await land('C4 photosynthesis', '3.2 C4 photosynthesis', 'C4 after C3');
    await land('Discussion', 'Discussion', 'a sentence on the bookmark\'s page, the heading on the next');
    await land('Materials and Methods', 'Materials & Methods', '"and" for "&"');
    await pick(page, '#zenContents', 'References');
    check('a next page\'s running head does not stand in for a heading: it stays in Reader view', await isReader(page));
    check('and goes to the start of the entry\'s own page', await topMarker(page) === 4, await topMarker(page));
    await page.waitForTimeout(800);
    await toPdf(page);
    check('and the PDF opens on that page', (await pageLabel(page)).startsWith('4 / 14'), await pageLabel(page));
    await context.close();
  }

  /* The edge book. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'edge-book.pdf', edgeBook(), true);
    await toReader(page);
    const landOn = async (title, opening, label) => {
      await pick(page, '#zenContents', title).catch(error => check(label + ': could open the entry', false, error.message.split('\n')[0]));
      const at = await spotOpening(page, opening);
      check(label, await isReader(page) && atTop(at), describe(at));
    };
    const landAtPage = async (title, wanted, label) => {
      await pick(page, '#zenContents', title).catch(error => check(label + ': could open the entry', false, error.message.split('\n')[0]));
      check(label, await isReader(page) && await topMarker(page) === wanted, await topMarker(page));
    };
    await landOn('Methods', 'Methods The plants', 'a section running into its text beats a heading that only holds its title');
    await landOn('Data analysis', 'Data analysis. All the tests', 'and with a stop after the title');
    await landAtPage('References', 4, 'a next page opening "References 68" is a running head: the start of the entry\'s own page');
    await landOn('Results', '3 Results', 'a small number on the next page is the section\'s: "3 Results" for a bookmark with no number');
    await landOn('Sources & Sinks', 'Sources + Sinks', '"+" for "&"');
    await landAtPage('I', 10, 'a sentence opening "I think" is not the part "I": the start of its page');
    await landAtPage('Conclusions', 11, 'a running foot "Conclusions 143" is not the heading: the start of its page');
    await landAtPage('Civil works', 12, '"civil" is no roman numeral: the heading "Works" does not stand in, the start of its page');
    await landOn('Stra\u00dfe', 'STRASSE', '"ss" for the German sharp s');
    await landOn('Appendix', 'Appendix 1', 'the title and a small number is that heading, not a running head');
    await landOn('Summary', '1.2 Summary and outlook', 'a numbered heading opening with the title beats a caption opening with it');
    // Picking up from the PDF on a page that ends right below its one line.
    await toPdf(page);
    await pick(page, '#zenContents', 'A short page');
    const shortPage = await settledLabel(page);
    check('in PDF view the entry goes to the short page', shortPage.startsWith('14 / 17'), shortPage);
    await toReader(page);
    await page.waitForTimeout(800);
    const pickedUp = await storedPaper(page, 'edge-book.pdf');
    check('Reader view picks up there and saves that page, not the next', pickedUp.readPage === 14 && pickedUp.readerPlace && pickedUp.readerPlace.page === 14, JSON.stringify([pickedUp.readPage, pickedUp.readerPlace]));
    await toPdf(page);
    const backOnPage = await settledLabel(page);
    check('and the PDF stays on it', backOnPage.startsWith('14 / 17'), backOnPage);
    await context.close();
  }

  /* The first pages of a long book are under 1% of the way through, and still a place to keep. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'long-book.pdf', longBook(), true);
    await toReader(page);
    await pick(page, '#zenContents', 'Preface');
    await page.waitForTimeout(800);
    const landed = await spot(page, 'Preface');
    check('an entry early in a long book lands on its heading', atTop(landed), describe(landed));
    const stored = await storedPaper(page, 'long-book.pdf');
    check('under 1% of the way through', stored.readerScroll > 0 && stored.readerScroll < .01, stored.readerScroll);
    await toPdf(page);
    const onPdf = await settledLabel(page);
    check('the PDF opens on its page', onPdf.startsWith('2 / 170'), onPdf);
    await toReader(page);
    const flipped = await spot(page, 'Preface');
    check('back in Reader view the heading is where it was', atTop(flipped) && Math.abs(flipped.offset - landed.offset) <= 4, describe(flipped));
    await toPdf(page);
    const onPdfAgain = await settledLabel(page);
    check('and the PDF has not moved', onPdfAgain.startsWith('2 / 170'), onPdfAgain);
    await toReader(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length > 0 && document.getElementById('pdfFrame').dataset.positionReady === 'true', null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const reloaded = await spot(page, 'Preface');
    check('a reload keeps it too', atTop(reloaded) && Math.abs(reloaded.offset - landed.offset) <= 12, describe(reloaded));
    await context.close();
  }

  /* The saved page stays with a heading that ends its page: the reading line below it is on the next page. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'hard-book.pdf', hardBook(), true);
    await toReader(page);
    const toEnd = async () => { await pick(page, '#zenContents', 'End of page heading'); await page.waitForTimeout(800); };
    await toEnd();
    // A figure loading above moves the scroll position where the engine anchors scrolling, the text where it does not.
    await page.evaluate(() => { document.querySelectorAll('#textDocument .para')[2].style.paddingTop = '900px'; });
    await page.waitForTimeout(800);
    await toPdf(page);
    check('a figure loading above does not move the saved page', (await pageLabel(page)).startsWith('5 / 14'), await pageLabel(page));
    await toReader(page);
    await page.evaluate(() => { document.querySelectorAll('#textDocument .para')[2].style.paddingTop = ''; });
    await toEnd();
    // With no scroll anchoring, as on an older system, and a figure tall enough to bring another page under the line.
    const noAnchor = await page.addStyleTag({ content: '#documentPane,#documentPane *{overflow-anchor:none !important}' });
    await page.evaluate(() => { document.querySelectorAll('#textDocument .para')[2].style.paddingTop = '2500px'; });
    await page.waitForTimeout(800);
    await toPdf(page);
    check('without scroll anchoring, a tall figure above does not move the saved page', (await pageLabel(page)).startsWith('5 / 14'), await pageLabel(page));
    await toReader(page);
    await page.evaluate(() => { document.querySelectorAll('#textDocument .para')[2].style.paddingTop = ''; });
    await noAnchor.evaluate(style => style.remove());
    await toEnd();
    await page.evaluate(() => document.getElementById('zenTextBigger').click());
    await page.waitForTimeout(800);
    await toPdf(page);
    check('a text size step does not move the saved page', (await pageLabel(page)).startsWith('5 / 14'), await pageLabel(page));
    await toReader(page);
    await page.evaluate(() => document.getElementById('zenTextSmaller').click());
    await toEnd();
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length > 0 && !document.getElementById('zenContents').classList.contains('hidden'), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const reloaded = await storedPaper(page, 'hard-book.pdf');
    check('a reload does not move the saved page', reloaded.readPage === 5 && reloaded.readerPlace && reloaded.readerPlace.page === 5, JSON.stringify([reloaded.readPage, reloaded.readerPlace]));
    await toPdf(page);
    check('and the PDF still opens there', (await pageLabel(page)).startsWith('5 / 14'), await pageLabel(page));
    await context.close();
  }

  /* An open Find bar: a heading right after its page mark lands below it, not behind it. */
  {
    const { context, page } = await fresh(TABLET);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.evaluate(() => document.getElementById('zenFind').click());
    await page.locator('#findInput').fill('sucrose');
    await page.waitForFunction(() => /match/.test(document.getElementById('findCount').textContent), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('#zenContents').tap();
    await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
    await contentsEntry(page, 'Results').tap();
    await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const under = await page.evaluate(() => {
      const bar = document.getElementById('findBar'), section = [...document.querySelectorAll('#textDocument .para')].find(s => s.querySelector('.original').textContent.trim() === '3 Results');
      return { open: !bar.classList.contains('hidden'), gap: Math.round(section.querySelector('.original').getBoundingClientRect().top - bar.getBoundingClientRect().bottom) };
    });
    check('with Find open, a heading after its page mark lands below the bar', under.open && under.gap >= 0 && under.gap <= 120, JSON.stringify(under));
    await page.evaluate(() => document.getElementById('zenFind').click());
    await page.waitForTimeout(300);
    await page.locator('#zenContents').tap();
    await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
    await contentsEntry(page, '2 Methods').tap();
    await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const clear = await spot(page, '2 Methods');
    check('with Find closed the landing is back at the top', atTop(clear), describe(clear));
    await context.close();
  }

  /* Leaving right after a scroll: the timer still running must not wipe the place just saved. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.evaluate(() => new Promise(resolve => {
      const pane = document.getElementById('documentPane');
      pane.addEventListener('scroll', () => requestAnimationFrame(() => { document.getElementById('zenExit').click(); resolve(); }), { once: true });
      pane.scrollTop = pane.scrollHeight * .5;
    }));
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    const after = await storedPaper(page, 'small-book.pdf');
    check('leaving within 600 ms of a scroll keeps the Reader view place', after.readerScroll > .3, after.readerScroll);
    // Refreshing from the library has no place to save either.
    await page.evaluate(() => document.getElementById('refreshBtn').click());
    await page.waitForFunction(() => document.getElementById('libraryPage') && !document.getElementById('libraryPage').classList.contains('hidden') && JSON.parse(localStorage.getItem('readingRoom.v1') || '{}').chapters, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const refreshed = await storedPaper(page, 'small-book.pdf');
    check('the library\'s refresh button keeps the Reader view place', refreshed.readerScroll > .3, refreshed.readerScroll);
    await context.close();
  }

  /* A search hit opening a paper on a page: the saved place, however near the top, does not undo it. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await page.evaluate(() => document.querySelector('.pdf-page[data-page="11"]').scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => document.getElementById('pageNumber').textContent.trim().startsWith('11 /'), null, { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const box = document.getElementById('pageNote'); box.value = 'zebrafinchmark'; box.dispatchEvent(new Event('input', { bubbles: true })); });
    await toReader(page);
    await page.waitForTimeout(800);
    const opened = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => { document.getElementById('documentPane').scrollTop = 300; });
      await page.waitForTimeout(800);
      await page.evaluate(() => { document.getElementById('documentPane').scrollTop = 0; });
      await page.waitForTimeout(800);
      await page.locator('#zenExit').click();
      await page.locator('#libraryPage').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
      await page.locator('#librarySearch').fill('');
      await page.locator('#librarySearch').fill('zebrafinchmark');
      await page.locator('.library-thinking-open').first().waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('.library-thinking-open').first().click();
      await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.getElementById('pdfFrame').dataset.positionReady === 'true', null, { timeout: 30000 });
      opened.push(await settledLabel(page));
      await toReader(page);
      await page.waitForTimeout(500);
    }
    check('a search hit opens on its page every time, whatever the saved place', opened.every(label => label.startsWith('11 / 14')), opened.join(', '));
    await context.close();
  }

  /* A paper whose PDF is not on this device still keeps its place in Reader view. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.waitForTimeout(800);
    const id = (await storedPaper(page, 'small-book.pdf')).id;
    await page.evaluate(id => new Promise((resolve, reject) => {
      const open = indexedDB.open('marginFiles', 2);
      open.onerror = reject;
      open.onsuccess = () => { const tx = open.result.transaction('pdfs', 'readwrite'); tx.objectStore('pdfs').delete(id); tx.oncomplete = resolve; tx.onerror = reject; };
    }), id);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#pdfFrame .missing-file'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('#textDocument .para').length > 1 && !document.getElementById('textDocument').classList.contains('hidden'), null, { timeout: 10000 }).catch(() => {});
    check('the PDF is gone and the text is on screen', await page.evaluate(() => !!document.querySelector('#pdfFrame .missing-file') && document.querySelectorAll('#textDocument .para').length > 1 && !document.getElementById('textDocument').classList.contains('hidden')));
    // One frame after opening, Reader view still puts the paper on its place: scroll once that is done.
    await page.waitForTimeout(400);
    await page.evaluate(() => { const pane = document.getElementById('documentPane'); pane.scrollTop = pane.scrollHeight * .5; });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.sourceName === 'small-book.pdf').readerScroll > .3, null, { timeout: 8000 }).catch(() => {});
    const kept = await storedPaper(page, 'small-book.pdf');
    check('and scrolling there is saved', kept.readerScroll > .3, kept.readerScroll);
    await context.close();
  }

  /* Listen in Page view: a nudge that moves nothing does not delay the next page turn. */
  {
    const quick = makePdf(Array.from({ length: 12 }, (_, i) => pageOf(i + 1, body(i, 730, 640))));
    const { context, page } = await fresh(LAPTOP, [], fakeSpeech);
    await openPdf(page, 'quick.pdf', quick, false);
    await page.evaluate(() => document.querySelector('[data-pdf-layout="page"]').click());
    await page.waitForTimeout(1000);
    await page.evaluate(() => { window.__speechMs = 150; window.__spoken = []; document.getElementById('zenListen').click(); });
    await page.waitForFunction(() => parseInt(document.getElementById('pageNumber').textContent, 10) >= 2, null, { timeout: 30000 }).catch(() => {});
    const before = await pageLabel(page);
    const box = await page.evaluate(() => { const r = document.getElementById('documentPane').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel(0, 30);
    const nudged = Date.now();
    await page.waitForFunction(label => document.getElementById('pageNumber').textContent.trim() !== label, before, { timeout: 15000 }).catch(() => {});
    const waited = Date.now() - nudged;
    check('after a nudge the next page turn comes on time, not 6 s later', waited < 5000, waited + ' ms');
    await page.evaluate(() => document.getElementById('voiceClose').click());
    await context.close();
  }

  /* Listen keeps reading, but a jump is not undone at its next sentence. */
  {
    const { context, page } = await fresh(LAPTOP, [], fakeSpeech);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    const listen = async () => {
      await page.evaluate(() => document.getElementById('zenListen').click());
      await page.waitForFunction(count => (window.__spoken || []).length >= count + 2, (await page.evaluate(() => (window.__spoken || []).length)), { timeout: 15000 });
    };
    await listen();
    await pick(page, '#zenContents', 'Results');
    await page.waitForTimeout(2300);
    check('PDF view: Listen leaves the page an entry went to', (await pageLabel(page)).startsWith('10 / 14'), await pageLabel(page));
    await page.evaluate(() => document.getElementById('zenListen').click());
    await page.waitForTimeout(300);
    await toReader(page);
    await listen();
    const spoken = await page.evaluate(() => window.__spoken.length);
    await pick(page, '#zenContents', '2 Methods');
    await page.waitForTimeout(2300);
    check('Listen is still reading', await page.evaluate(() => window.__spoken.length) > spoken);
    const at = await spot(page, '2 Methods');
    check('Reader view: Listen leaves the heading in place', atTop(at), describe(at));
    await page.evaluate(() => document.getElementById('zenListen').click());
    await context.close();
  }

  /* A second tab comes up read-only under the "Use Phloem here" bar: a heading lands below it. */
  {
    const { context, page } = await fresh(LAPTOP);
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    await page.waitForTimeout(1200);
    const tab = await context.newPage();
    tab.on('pageerror', error => errors.push(error.message));
    await tab.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
    await tab.waitForFunction(() => document.body.classList.contains('other-tab-open'), null, { timeout: 15000 }).catch(() => {});
    await tab.waitForFunction(() => !document.getElementById('zenContents').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length > 0, null, { timeout: 30000 }).catch(() => {});
    const barUp = await tab.evaluate(() => document.body.classList.contains('other-tab-open'));
    check('the second tab is read-only', barUp);
    if (barUp) {
      await pick(tab, '#zenContents', '2 Methods');
      const gap = await tab.evaluate(() => {
        const bar = document.getElementById('otherTabBar').getBoundingClientRect();
        const section = [...document.querySelectorAll('#textDocument .para')].find(s => s.querySelector('.original').textContent.trim() === '2 Methods');
        return Math.round(section.querySelector('.original').getBoundingClientRect().top - bar.bottom);
      });
      check('the heading lands below the bar', gap >= 0 && gap <= 120, gap);
    }
    await context.close();
  }

  /* A phone with a notch: Chromium can fake the safe area, and the status bar covers the top 59 px. */
  if (ENGINE === 'chromium') {
    const { context, page } = await fresh(PHONE);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    const inset = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('zenDock')).getPropertyValue('--zen-safe-top')));
    check('the fake notch reaches the reader', inset === 59, inset);
    const tapEntry = async title => {
      await page.locator('#zenMore').tap();
      await page.locator('#zenPhoneContents').tap();
      await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
      await contentsEntry(page, title).tap();
      await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
    };
    await tapEntry('2 Methods');
    let at = await spot(page, '2 Methods');
    check('a mid-page heading lands below the status bar', await isReader(page) && !at.missing && at.offset >= 59 && at.offset <= 180, describe(at));
    await tapEntry('Results');
    at = await spot(page, '3 Results');
    check('so does a heading right after its page mark', !at.missing && at.offset >= 59 && at.offset <= 180, describe(at));
    // The switch back from the PDF uses the same landing line.
    await page.waitForTimeout(800);
    await toPdf(page);
    await page.evaluate(() => { const pane = document.getElementById('documentPane'); pane.scrollTop = pane.scrollHeight * .55; });
    await page.waitForTimeout(1600);
    const pdfPage = parseInt(await pageLabel(page), 10);
    await toReader(page);
    await page.waitForTimeout(400);
    const mark = await page.evaluate(wanted => {
      const marker = [...document.querySelectorAll('#textDocument .page-marker')].filter(m => +m.querySelector('[data-goto-page]').dataset.gotoPage <= wanted).pop();
      return marker ? Math.round(marker.getBoundingClientRect().top) : -1;
    }, pdfPage);
    check('picking up from a PDF page lands below the status bar too', mark >= 59 && mark <= 120, mark + ' on page ' + pdfPage);
    await context.close();
  }
  /* The same notch: Listen started after a jump begins at the heading, not the paragraph hidden above it. */
  if (ENGINE === 'chromium') {
    const { context, page } = await fresh(PHONE, [], fakeSpeech);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, topMax: 62, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
    await openPdf(page, 'small-book.pdf', withBookmarks(), true);
    await toReader(page);
    // Listen says a heading without its number.
    for (const [title, heading] of [['2 Methods', 'Methods'], ['Results', 'Results'], ['APPENDIX: RAW DATA TABLES', 'Appendix: Raw Data Tables']]) {
      await page.locator('#zenMore').tap();
      await page.locator('#zenPhoneContents').tap();
      await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
      await contentsEntry(page, title).tap();
      await page.waitForFunction(() => !document.getElementById('tocDialog').open, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
      await page.evaluate(() => { window.__spoken = []; document.getElementById('zenListen').click(); });
      await page.waitForFunction(() => (window.__spoken || []).some(text => text.trim()), null, { timeout: 15000 }).catch(() => {});
      const said = await page.evaluate(() => (window.__spoken || []).find(text => text.trim()) || '');
      check('Listen after a jump to "' + title + '" starts at the heading', said.startsWith(heading), said.slice(0, 50));
      await page.evaluate(() => document.getElementById('voiceClose').click());
      await page.waitForTimeout(400);
    }
    await context.close();
  }
  /* And a long list stays clear of the status bar and the home bar. */
  if (ENGINE === 'chromium') {
    const long = makePdf([[['A long list', 24, 72, 700]], pageOf(2, body(2, 730, 90))], Array.from({ length: 60 }, (_, i) => ['Section ' + (i + 1), 2]));
    const { context, page } = await fresh(PHONE);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
    await openPdf(page, 'long-list.pdf', long, true);
    await toReader(page);
    await page.locator('#zenMore').tap();
    await page.locator('#zenPhoneContents').tap();
    await page.locator('#tocDialog').waitFor({ state: 'visible', timeout: 5000 });
    const list = await page.evaluate(() => { const d = document.getElementById('tocDialog').getBoundingClientRect(), x = document.querySelector('[data-close="tocDialog"]').getBoundingClientRect(); return { top: Math.round(d.top), bottom: Math.round(d.bottom), close: Math.round(x.top) }; });
    check('a long Contents list stays below the status bar and above the home bar', list.top >= 59 && list.close >= 59 && list.bottom <= 844 - 34, JSON.stringify(list));
    await context.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  if (failures) { console.log(failures + ' check(s) failed'); process.exit(1); }
  console.log('All Contents in Reader view checks passed (' + ENGINE + ')');
})().catch(error => { console.error(error); server.close(); process.exit(1); });
