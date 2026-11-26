/* Reader view keeps its place across reloads and cold starts. Two generated papers are read in
   Reader view, the real page is reloaded, and the test looks at where the pane sits, what was
   saved, and what is left of each paper's stored Reader text in IndexedDB. No app code is
   replaced: the slow-PDF case holds back the real pdf.js request. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(ENGINE));
const source = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
const TEXT_FIELDS = ['pageLines', 'pageParagraphs', 'readerText', 'readerV'];
const PICKED_UP = 'Picked up where you stopped';

const failures = [];
function check(name, ok, detail) {
  if (ok) { console.log('ok   ' + name); return; }
  failures.push(name);
  console.log('FAIL ' + name + (detail === undefined ? '' : ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0] || '/');
  if (pathname === '/fixture') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><title>Storage fixture</title>'); return; }
  const filename = path.join(ROOT, pathname === '/' ? 'reading.html' : pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.js') || filename.endsWith('.mjs') ? 'text/javascript'
        : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(bytes);
  });
});

/* A plain text PDF written by hand: 24 pages, each with a heading, body lines and a folio. A page
   with a figure leaves a gap above a "Figure N." caption, which Reader view crops as a picture. */
const pdfString = value => String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
function makePdf(pages) {
  const objects = [];
  const pageObject = index => 4 + index * 2;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + pages.map((_, index) => pageObject(index) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, index) => {
    const stream = lines.map(line => 'BT /F1 ' + line[1] + ' Tf 1 0 0 1 ' + line[2] + ' ' + line[3] + ' Tm (' + pdfString(line[0]) + ') Tj ET').join('\n');
    objects[pageObject(index)] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + index * 2) + ' 0 R >>';
    objects[5 + index * 2] = '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream';
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
function book(tag, pageCount, figurePages) {
  return Array.from({ length: pageCount }, (_, page) => {
    const lines = [[tag + ' page ' + (page + 1) + ' heading', 16, 60, 740]];
    let y = 710, next = page;
    while (y > 80) {
      if (page < (figurePages || 0) && y < 620 && y > 330) { y = 330; lines.push(['Figure ' + (page + 1) + '. Export of sucrose rose with light across the whole season in tomato.', 12, 60, y]); y -= 29; continue; }
      for (let i = 0; i < 4 && y > 80; i++) { lines.push([SENTENCES[next++ % 4], 12, 60, y]); y -= 15; }
      y -= 14;
    }
    lines.push([String(page + 1), 11, 300, 40]);
    return lines;
  });
}

function extractFunction(name) {
  const asyncMarker = 'async function ' + name + '(', syncMarker = 'function ' + name + '(';
  const start = source.indexOf(asyncMarker) >= 0 ? source.indexOf(asyncMarker) : source.indexOf(syncMarker);
  if (start < 0) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

const paperRecord = (page, name) => page.evaluate(name => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.sourceName === name), name);
const derivedRecord = (page, id) => page.evaluate(id => new Promise(resolve => {
  const open = indexedDB.open('marginFiles', 2);
  open.onerror = () => resolve(null);
  open.onsuccess = () => {
    const db = open.result, read = db.transaction('derived').objectStore('derived').get(id);
    read.onerror = () => { db.close(); resolve(null); };
    read.onsuccess = () => {
      const saved = read.result; db.close();
      resolve(saved && typeof saved === 'object' ? { fields: Object.keys(saved).filter(key => saved[key] !== undefined && saved[key] !== null).sort(), readerV: saved.readerV } : null);
    };
  };
}), id);
const hasReaderText = record => !!record && TEXT_FIELDS.every(field => record.fields.includes(field));
const paneState = page => page.evaluate(() => {
  const pane = document.getElementById('documentPane'), span = pane.scrollHeight - pane.clientHeight, box = pane.getBoundingClientRect();
  return {
    fraction: span > 4 ? +(pane.scrollTop / span).toFixed(3) : null,
    top: Math.round(pane.scrollTop),
    figures: document.querySelectorAll('#textDocument img[data-fig]').length,
    readerView: !document.getElementById('textDocument').classList.contains('hidden'),
    paragraphs: document.querySelectorAll('#textDocument .para').length,
    toast: document.getElementById('readerToast').textContent || '',
    positionReady: document.getElementById('pdfFrame').dataset.positionReady,
    pagesInView: [...document.querySelectorAll('#textDocument .page-marker [data-goto-page]')]
      .filter(button => { const top = button.parentNode.getBoundingClientRect().top - box.top; return top > -40 && top < box.height; })
      .map(button => +button.dataset.gotoPage)
  };
});
/* How tall each figure of the open paper is on screen once its picture has loaded. Read from
   the stored pictures, not from the page: the pictures on the page load only near the screen,
   and loading them here would itself move the text. */
const figureHeights = page => page.evaluate(() => new Promise(resolve => {
  const figures = [...document.querySelectorAll('#textDocument img[data-fig]')].map(img => ({ key: 'fig:' + img.dataset.fig, width: img.closest('figure').clientWidth }));
  const open = indexedDB.open('marginFiles', 2);
  open.onerror = () => resolve([]);
  open.onsuccess = async () => {
    const db = open.result, heights = [];
    for (const figure of figures) {
      const bytes = await new Promise(done => { const read = db.transaction('derived').objectStore('derived').get(figure.key); read.onsuccess = () => done(read.result || null); read.onerror = () => done(null); });
      const picture = bytes ? await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })).catch(() => null) : null;
      heights.push(picture ? Math.ceil(picture.height * Math.min(1, figure.width / picture.width)) + 2 : 0);
    }
    db.close(); resolve(heights);
  };
}));
/* Figures whose pictures have loaded, all of them and those on or within a screen of the screen. */
const loadedFigures = page => page.evaluate(() => {
  const box = document.getElementById('documentPane').getBoundingClientRect();
  const loaded = [...document.querySelectorAll('#textDocument img[data-fig]')].filter(img => img.complete && img.naturalHeight > 0);
  return { all: loaded.length, nearPlace: loaded.filter(img => { const r = img.getBoundingClientRect(); return r.bottom > box.top - box.height && r.top < box.bottom + box.height; }).length };
});
const figuresNearPlaceLoaded = page => page.waitForFunction(() => {
  const box = document.getElementById('documentPane').getBoundingClientRect();
  return [...document.querySelectorAll('#textDocument img[data-fig]')].some(img => { const r = img.getBoundingClientRect(); return img.complete && img.naturalHeight > 0 && r.bottom > box.top - box.height && r.top < box.bottom + box.height; });
}, null, { timeout: 15000 }).then(() => true, () => false);
/* The paper's saved record once the saves that follow scrolling and loading figures have stopped:
   the same for three seconds. */
async function settledRecord(page, name) {
  let last = await paperRecord(page, name), same = 0;
  for (let tries = 0; tries < 30 && same < 4; tries++) {
    await page.waitForTimeout(750);
    const now = await paperRecord(page, name);
    same = now.readerScroll === last.readerScroll && JSON.stringify(now.readerPlace) === JSON.stringify(last.readerPlace) ? same + 1 : 0;
    last = now;
  }
  return last;
}
/* Each start that picks up the place is watched at the moment it does: the toast saying so goes up
   in the same frame as the pane is put at the place, and a mutation observer runs before anything
   else can load. It notes which figures had their pictures loaded and which had been given one.
   Only watched: nothing of the page is changed. */
function watchLandings() {
  window.__readerLandings = [];
  document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('readerToast');
    if (!toast) return;
    new MutationObserver(() => {
      if (toast.textContent !== 'Picked up where you stopped') return;
      const pane = document.getElementById('documentPane'), figures = [...document.querySelectorAll('#textDocument img[data-fig]')];
      window.__readerLandings.push({ top: Math.round(pane.scrollTop), loaded: figures.map(img => img.complete && img.naturalHeight > 0),
        given: figures.map(img => !!img.getAttribute('src') || !!img.closest('figure.hidden')) });
    }).observe(toast, { childList: true, characterData: true, subtree: true });
  });
}
/* While the tab's sessionStorage says so, each figure's picture takes that long to come out of
   IndexedDB, as on a slow device: the success event of a read of a figure is held back and sent
   again later. Nothing else of the page is changed. */
function slowFigureReads() {
  const delay = +(sessionStorage.getItem('test.slowFigureReads') || 0);
  if (!delay) return;
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (key) {
    const request = get.apply(this, arguments);
    if (typeof key === 'string' && key.startsWith('fig:')) request.addEventListener('success', event => {
      if (event.late) return;
      event.stopImmediatePropagation();
      setTimeout(() => { const late = new Event('success'); late.late = true; request.dispatchEvent(late); }, delay);
    });
    return request;
  };
}
const landingRecord = page => page.evaluate(() => (window.__readerLandings || [])[0] || null);
const loadedNow = page => page.evaluate(() => [...document.querySelectorAll('#textDocument img[data-fig]')].map(img => img.complete && img.naturalHeight > 0));
/* Two starts at the same saved fraction land apart only by the figures that had their picture (or
   had been given one) at one and not at the other, when the place was set or afterwards. A figure's
   picture adds its height to the text: to the part above the place by the saved fraction of it, or,
   where Chromium keeps the screen still for a picture loading above it, by all of it less that. So
   the allowance is the larger share of the heights of those figures, and 4 px. */
function landingAllowance(fraction, heights, first, now) {
  const differs = heights.filter((_, i) => first.given[i] !== now.given[i] || first.atPlace[i] !== now.atPlace[i] || first.after[i] !== now.after[i]);
  return Math.ceil(Math.max(fraction, 1 - fraction) * differs.reduce((sum, height) => sum + height, 0)) + 4;
}
const near = (value, target) => typeof value === 'number' && Math.abs(value - target) <= 0.02;
const readerTextShown = () => !document.getElementById('textDocument').classList.contains('hidden') && document.querySelectorAll('#textDocument .para').length > 20;
const waitText = page => page.waitForFunction(readerTextShown, null, { timeout: 60000 });
const waitOpened = page => page.waitForFunction(() => !document.getElementById('textDocument').classList.contains('hidden')
  && document.querySelectorAll('#textDocument .para').length > 20 && document.getElementById('pdfFrame').dataset.positionReady === 'true', null, { timeout: 60000 });
/* True once the pane has reached the fraction; false if it has not within the wait. */
const reachesFraction = (page, target, timeout) => page.waitForFunction(target => {
  const pane = document.getElementById('documentPane'), span = pane.scrollHeight - pane.clientHeight;
  return !document.getElementById('textDocument').classList.contains('hidden') && span > 4 && Math.abs(pane.scrollTop / span - target) <= 0.02;
}, target, { timeout }).then(() => true, () => false);
async function toLibrary(page) {
  await page.locator('#zenExit').click();
  await page.locator('#libraryPage').waitFor({ state: 'visible' });
}

async function addPaper(page, name, tag, fraction, figurePages) {
  await page.locator('#pdfFile').setInputFiles({ name, mimeType: 'application/pdf', buffer: makePdf(book(tag, 24, figurePages)) });
  // The new paper is open in PDF view (the paper before it was left in Reader view).
  await page.waitForFunction(() => {
    const reflow = document.getElementById('reflowBtn');
    return !document.getElementById('readerPage').classList.contains('hidden') && !reflow.classList.contains('hidden') && reflow.getAttribute('aria-pressed') === 'false'
      && document.getElementById('pdfFrame').dataset.positionReady === 'true' && !!document.querySelector('.pdf-page[data-page="1"] .text-layer span');
  }, null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('reflowBtn').click());
  await waitOpened(page);
  await page.waitForTimeout(800);
  await page.evaluate(fraction => { const pane = document.getElementById('documentPane'); pane.scrollTop = (pane.scrollHeight - pane.clientHeight) * fraction; }, fraction);
  await page.waitForFunction(({ name, fraction }) => {
    const paper = JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.sourceName === name);
    return paper && Math.abs(paper.readerScroll - fraction) <= 0.02 && paper.readerPlace && paper.readerPlace.page > 1;
  }, { name, fraction }, { timeout: 20000 });
  const paper = await paperRecord(page, name);
  // The Reader text is saved half a second after it is built.
  for (let tries = 0; tries < 40 && !hasReaderText(await derivedRecord(page, paper.id)); tries++) await page.waitForTimeout(250);
  return paper;
}

/* putDerived itself, taken from reading.js by name and run against a real IndexedDB store. */
async function checkMergingSave(page) {
  const fields = (source.match(/var DERIVED_FIELDS=\[[^\]]*\];/) || [''])[0];
  const parts = ['derivedData', 'hasDerivedContent', 'mergeStoredDerived', 'putDerived'].map(extractFunction);
  if (!fields || parts.some(part => !part)) { check('reading.js has derivedData, hasDerivedContent, mergeStoredDerived and putDerived', false); return; }
  const result = await page.evaluate(async code => {
    const api = new Function(code.fields + 'var memoryDerived={},opened=null;'
      + 'function db(){return opened||(opened=new Promise(function(res,rej){var q=indexedDB.open("phloem-reader-place-test",1);q.onupgradeneeded=function(){q.result.createObjectStore("derived");};q.onsuccess=function(){res(q.result);};q.onerror=function(){rej(q.error);};}));}'
      + code.parts.join('\n') + '\nreturn {db:db,putDerived:putDerived,hasDerivedContent:hasDerivedContent,memoryDerived:memoryDerived};')();
    const store = async (mode, run) => { const d = await api.db(); return new Promise((res, rej) => { const r = run(d.transaction('derived', mode).objectStore('derived')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
    const read = id => store('readonly', os => os.get(id)), write = (id, value) => store('readwrite', os => os.put(value, id));
    const full = { pageLines: [['a line']], pageParagraphs: [[{ t: 'a line' }]], pageTexts: ['a line'], readerText: 'a line', readerV: 7, fr: 'a line', figCount: 2, termLookups: { old: { extract: 'kept', cachedAt: 5 } } };
    const out = {};
    await write('p1', full);
    out.saved = await api.putDerived({ id: 'p1', kind: 'pdf', termLookups: {} });
    out.afterStartupShape = await read('p1');
    await api.putDerived({ id: 'p1', kind: 'pdf', readerText: 'rebuilt', readerV: 8, figCount: 0, termLookups: { fresh: { extract: 'new', cachedAt: 9 } } });
    out.afterRebuild = await read('p1');
    const many = {}; for (let i = 0; i < 119; i++) many['t' + i] = { extract: 'x', cachedAt: 100 + i };
    await api.putDerived({ id: 'p1', kind: 'pdf', termLookups: many });
    out.cappedKeys = Object.keys((await read('p1')).termLookups);
    await api.putDerived({ id: 'p2', kind: 'pdf', pageTexts: ['only text'], termLookups: {} });
    out.firstSave = await read('p2');
    out.nonPdf = await api.putDerived({ id: 'p3', kind: 'text', fr: 'words' });
    out.memoryLeft = Object.keys(api.memoryDerived);
    out.content = [api.hasDerivedContent({ termLookups: {} }), api.hasDerivedContent({ termLookups: {}, readerText: null }), api.hasDerivedContent({ termLookups: { a: {} } }),
      api.hasDerivedContent({ termLookups: {}, figCount: 0 }), api.hasDerivedContent({ pageTexts: [] }), api.hasDerivedContent(null)];
    (await api.db()).close(); indexedDB.deleteDatabase('phloem-reader-place-test');
    return { out, full };
  }, { fields, parts });
  const { out, full } = result;
  check('a save holding only empty term lookups keeps the stored Reader text', out.saved === true && JSON.stringify(out.afterStartupShape) === JSON.stringify(full), out.afterStartupShape);
  check('a rebuild replaces the fields it carries and keeps the rest',
    out.afterRebuild.readerText === 'rebuilt' && out.afterRebuild.readerV === 8 && out.afterRebuild.figCount === 0 && out.afterRebuild.pageTexts[0] === 'a line' && out.afterRebuild.fr === 'a line', out.afterRebuild);
  check('term lookups from both sides are kept', !!(out.afterRebuild.termLookups.old && out.afterRebuild.termLookups.fresh), out.afterRebuild.termLookups);
  check('term lookups stay capped at the 120 newest', out.cappedKeys.length === 120 && !out.cappedKeys.includes('old') && out.cappedKeys.includes('fresh') && out.cappedKeys.includes('t0'), out.cappedKeys.length);
  check('a first save stores the record as given', JSON.stringify(out.firstSave) === JSON.stringify({ pageTexts: ['only text'], termLookups: {} }), out.firstSave);
  check('only PDFs are saved, and nothing is left waiting in memory', out.nonPdf === false && out.memoryLeft.length === 0, out);
  check('empty term lookups alone are not Reader data worth a startup save', JSON.stringify(out.content) === JSON.stringify([false, false, true, true, true, false]), out.content);
}

/* readerHoldMarks, holdReaderPage and readerPageHeld, taken from reading.js by name, against a page
   built here, so the case does not depend on when real pictures load: paragraphs in a scrolling
   pane, a figure above the screen and one on screen above the reading line. Both get their height
   in the same frame, as pictures loading together do. In the first case the scroll position follows
   the figure above the screen, as Chromium's scroll anchoring makes it; in the second it stays, as
   in WebKit. Either way the reader has not moved and the hold must stay. Then the reader scrolls a
   few lines and the hold must let go. */
async function checkHoldMarks(page) {
  const parts = ['readerHoldMarks', 'holdReaderPage', 'readerPageHeld'].map(extractFunction);
  if (parts.some(part => !part)) { check('reading.js has readerHoldMarks, holdReaderPage and readerPageHeld', false); return; }
  const result = await page.evaluate(parts => {
    const api = new Function('var heldReaderPage=null;function byId(id){return document.getElementById(id);}' + parts.join('\n')
      + '\nreturn {hold:holdReaderPage,held:readerPageHeld};')();
    const ch = { id: 'paper' };
    const run = followAbove => {
      document.body.innerHTML = '';
      const pane = document.createElement('div');
      pane.id = 'documentPane';
      pane.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:500px;overflow:auto;overflow-anchor:none';
      const figures = [];
      for (let i = 0; i < 60; i++) {
        const para = document.createElement('section'), text = document.createElement('div');
        para.className = 'para';
        if (i === 10 || i === 22) { const figure = document.createElement('figure'); figure.style.cssText = 'margin:0;height:0'; para.appendChild(figure); figures.push(figure); }
        text.className = 'original'; text.style.height = '60px'; text.textContent = 'Paragraph ' + i;
        para.appendChild(text); pane.appendChild(para);
      }
      document.body.appendChild(pane);
      // Paragraph 20 is at the top of the pane, 22 (with a figure) on screen, 25 at the reading line.
      pane.scrollTop = 20 * 60;
      api.hold(ch, 7, pane.children[25], 0.5);
      figures[0].style.height = '300px'; figures[1].style.height = '250px';
      if (followAbove) pane.scrollTop += 300;
      const whileLoading = api.held(ch);
      pane.scrollTop += 30;
      return { whileLoading, afterScrolling: api.held(ch), againAfter: api.held(ch) };
    };
    const out = { chromium: run(true), webkit: run(false) };
    document.body.innerHTML = '';
    return out;
  }, parts);
  check('the page hold stays while a figure above the screen and one on screen get their pictures together',
    result.chromium.whileLoading === 7 && result.webkit.whileLoading === 7, result);
  check('the page hold lets go once the reader scrolls a few lines',
    result.chromium.afterScrolling === 0 && result.chromium.againAfter === 0 && result.webkit.afterScrolling === 0 && result.webkit.againAfter === 0, result);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const launch = { headless: true };
  const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
  if (executablePath) launch.executablePath = executablePath;
  let browser;
  try {
    browser = await playwright[ENGINE].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await context.addInitScript(watchLandings);
    await context.addInitScript(slowFigureReads);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/fixture');
    await page.evaluate(() => localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [], deleted: {}, merged: {}, savedAt: Date.now() })));
    await page.goto(base + '/reading.html', { waitUntil: 'load' });

    // Paper B is read to 40% and left; paper A, with figures on its first four pages, is read to
    // 60% and stays the last one open. Paper C, with a figure on every page, comes last.
    const b = await addPaper(page, 'b-paper.pdf', 'Bravo', 0.4);
    await toLibrary(page);
    const a = await addPaper(page, 'a-paper.pdf', 'Alpha', 0.6, 4);
    check('setup: both papers have a saved place and stored Reader text',
      near(a.readerScroll, 0.6) && near(b.readerScroll, 0.4) && hasReaderText(await derivedRecord(page, a.id)) && hasReaderText(await derivedRecord(page, b.id)),
      { a: a.readerScroll, b: b.readerScroll, derivedA: await derivedRecord(page, a.id), derivedB: await derivedRecord(page, b.id) });
    check('setup: the open paper shows figures in Reader view', (await paneState(page)).figures === 4, await paneState(page));
    const readerV = (await derivedRecord(page, a.id) || {}).readerV;
    /* The place is a fraction of the text's length, and the pictures at the top of the paper,
       on screen when it opens, may or may not have loaded when the place is set: each one that
       has makes the text above the place longer. So two landings are compared allowing only for
       the pictures loaded at one and not at the other (landingAllowance). */
    const heightsA = await figureHeights(page);
    check('setup: the figures of the open paper can be measured', heightsA.length === 4 && heightsA.every(height => height > 40), heightsA);

    // (i) Reload after reload, the open paper comes back at its place and no paper's Reader text is lost.
    let firstLanding = null;
    for (let round = 1; round <= 4; round++) {
      await page.reload({ waitUntil: 'load' });
      await waitOpened(page);
      await page.waitForTimeout(1500); // startup's storage work and any late restore have had their turn
      const pane = await paneState(page), saved = await paperRecord(page, 'a-paper.pdf');
      const landing = await landingRecord(page), figuresNow = { given: landing ? landing.given : [], atPlace: landing ? landing.loaded : [], after: await loadedNow(page) };
      const derivedA = await derivedRecord(page, a.id), derivedB = await derivedRecord(page, b.id);
      check('reload ' + round + ': Reader view is back at 60% and says so', pane.readerView && near(pane.fraction, 0.6) && pane.toast === PICKED_UP, pane);
      // Exactly unchanged: a place set before the figures have their pictures is saved again a
      // little off, and the paper creeps a few lines with every reload.
      check('reload ' + round + ': the saved place is unchanged', Math.abs(saved.readerScroll - a.readerScroll) <= 0.0004 && saved.readerPlace && saved.readerPlace.page === a.readerPlace.page
        && saved.readerPlace.at === a.readerPlace.at, { readerScroll: saved.readerScroll, was: a.readerScroll, readerPlace: saved.readerPlace });
      if (!firstLanding) firstLanding = { top: pane.top, placedAt: landing && landing.top, figures: figuresNow };
      else {
        const allowance = landingAllowance(a.readerScroll, heightsA, firstLanding.figures, figuresNow);
        check('reload ' + round + ': Reader view lands where the first reload did, give or take the pictures loaded at one and not the other', !!landing && Math.abs(pane.top - firstLanding.top) <= allowance,
          { top: pane.top, first: firstLanding.top, allowance, figures: figuresNow, firstFigures: firstLanding.figures });
        console.log('     landed ' + pane.top + ', first ' + firstLanding.top + ', allowance ' + allowance);
      }
      check('reload ' + round + ': both papers keep their stored Reader text', hasReaderText(derivedA) && hasReaderText(derivedB), { a: derivedA && derivedA.fields, b: derivedB && derivedB.fields });
    }

    // (iii) The PDF is slow to arrive (a big file, Drive, iCloud): the cached text is already at its place.
    let releasePdfEngine, held = 0;
    const gate = new Promise(resolve => { releasePdfEngine = resolve; });
    await page.route('**/vendor/pdfjs/pdf.min.js', async route => { held++; await gate; await route.continue().catch(() => {}); });
    // The figures' pictures are slow to come out of storage as well, so they arrive well after the
    // cached text is drawn: the place must wait for them, or it is set in a shorter text.
    await page.evaluate(() => sessionStorage.setItem('test.slowFigureReads', '400'));
    await page.reload({ waitUntil: 'load' });
    await waitText(page);
    const placedEarly = await reachesFraction(page, 0.6, 8000);
    const waiting = await paneState(page), early = await landingRecord(page);
    await page.evaluate(() => sessionStorage.removeItem('test.slowFigureReads'));
    check('slow PDF: the test really held the PDF engine back', held > 0 && waiting.positionReady === 'false', { held, positionReady: waiting.positionReady });
    check('slow PDF: Reader view is at 60% before the PDF has loaded', placedEarly && waiting.toast === PICKED_UP, waiting);
    check('slow PDF and slow pictures: the place is set only once the figures have been given their pictures, where the first reload set it',
      !!early && early.given.length === 4 && early.given.every(Boolean) && Math.abs(early.top - firstLanding.placedAt) <= landingAllowance(a.readerScroll, heightsA,
        { given: firstLanding.figures.given, atPlace: firstLanding.figures.atPlace, after: [] }, { given: early.given, atPlace: early.loaded, after: [] }),
      { early, firstPlacedAt: firstLanding.placedAt, firstFigures: firstLanding.figures });
    await toLibrary(page);
    await page.waitForTimeout(400);
    const left = await paperRecord(page, 'a-paper.pdf');
    check('slow PDF: leaving meanwhile keeps the place, the page and the library page',
      near(left.readerScroll, 0.6) && left.readerPlace && left.readerPlace.page === a.readerPlace.page && left.readPage === a.readerPlace.page,
      { readerScroll: left.readerScroll, readerPlace: left.readerPlace, readPage: left.readPage });
    releasePdfEngine();
    await page.waitForTimeout(1500);
    await page.unroute('**/vendor/pdfjs/pdf.min.js');
    const later = await paperRecord(page, 'a-paper.pdf');
    check('slow PDF: the PDF arriving afterwards changes nothing',
      near(later.readerScroll, 0.6) && later.readerPlace.page === a.readerPlace.page && await page.locator('#libraryPage').isVisible(), { readerScroll: later.readerScroll, readerPlace: later.readerPlace });

    // (ii) The paper that was not open since startup still opens at its own place.
    const card = '.book-spine[data-shelf-paper="' + b.id + '"]';
    await page.locator(card).click();
    await page.waitForTimeout(300);
    if (await page.locator('#libraryPage').isVisible()) await page.locator(card).click(); // first click picks the card, second opens it
    await waitOpened(page);
    await page.waitForTimeout(1500);
    const paneB = await paneState(page), savedB = await paperRecord(page, 'b-paper.pdf');
    check('the other paper opens from the library at 40% and says so', paneB.readerView && near(paneB.fraction, 0.4) && paneB.toast === PICKED_UP, paneB);
    check('the other paper keeps its saved place and stored Reader text', near(savedB.readerScroll, 0.4) && hasReaderText(await derivedRecord(page, b.id)), { readerScroll: savedB.readerScroll, derived: await derivedRecord(page, b.id) });

    // (iv) Reader text that has to be rebuilt (an older build of it) lands on the saved page, not the top.
    await page.evaluate(id => new Promise((resolve, reject) => {
      const open = indexedDB.open('marginFiles', 2);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, transaction = db.transaction('derived', 'readwrite'), store = transaction.objectStore('derived'), read = store.get(id);
        read.onsuccess = () => { const saved = read.result || {}; saved.readerV = 6; store.put(saved, id); };
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    }), b.id);
    await page.reload({ waitUntil: 'load' });
    await waitOpened(page);
    await page.waitForTimeout(1500);
    const rebuiltPane = await paneState(page), rebuiltSaved = await paperRecord(page, 'b-paper.pdf');
    let rebuilt = await derivedRecord(page, b.id);
    for (let tries = 0; tries < 20 && !(rebuilt && rebuilt.readerV === readerV); tries++) { await page.waitForTimeout(250); rebuilt = await derivedRecord(page, b.id); }
    check('rebuild: the Reader text was rebuilt and stored again', !!rebuilt && rebuilt.readerV === readerV && readerV > 6 && hasReaderText(rebuilt), { rebuilt, readerV });
    check('rebuild: Reader view lands on the saved page', rebuiltPane.readerView && rebuiltPane.pagesInView.includes(savedB.readerPlace.page) && rebuiltPane.fraction > 0.2, { pane: rebuiltPane, want: savedB.readerPlace.page });
    check('rebuild: the saved page is kept', !!rebuiltSaved.readerPlace && rebuiltSaved.readerPlace.page === savedB.readerPlace.page && rebuiltSaved.readPage === savedB.readerPlace.page, { readerPlace: rebuiltSaved.readerPlace, readPage: rebuiltSaved.readPage });

    // (v) Figures all through a paper, so some sit right at the place and get their pictures only
    // after it is restored. The text grows then, though the reader has not moved: the saved place
    // must not be measured again, or the paper slips back a little with every start.
    await toLibrary(page);
    await addPaper(page, 'c-paper.pdf', 'Charlie', 0.6, 24);
    await figuresNearPlaceLoaded(page);
    const heightsC = await figureHeights(page), c = await settledRecord(page, 'c-paper.pdf');
    check('figures at the place: the paper has a figure on every page and a saved place', heightsC.length === 24 && heightsC.every(height => height > 40) && near(c.readerScroll, 0.6) && !!c.readerPlace, { figures: heightsC.length, readerScroll: c.readerScroll, readerPlace: c.readerPlace });
    let firstLandingC = null;
    for (let round = 1; round <= 4; round++) {
      await page.reload({ waitUntil: 'load' });
      await waitOpened(page);
      await figuresNearPlaceLoaded(page);
      await page.waitForTimeout(1500); // the save that follows the text growing has had its turn
      const pane = await paneState(page), loaded = await loadedFigures(page), saved = await paperRecord(page, 'c-paper.pdf');
      const landing = await landingRecord(page), figuresNow = { given: landing ? landing.given : [], atPlace: landing ? landing.loaded : [], after: await loadedNow(page) };
      check('figures at the place, reload ' + round + ': pictures loaded near the place after it was restored', loaded.nearPlace > 0 && pane.toast === PICKED_UP, { loaded, toast: pane.toast });
      check('figures at the place, reload ' + round + ': the saved place is unchanged', saved.readerScroll === c.readerScroll && !!saved.readerPlace && saved.readerPlace.page === c.readerPlace.page
        && saved.readerPlace.at === c.readerPlace.at && saved.readPage === c.readPage, { readerScroll: saved.readerScroll, was: c.readerScroll, readerPlace: saved.readerPlace, wasPlace: c.readerPlace });
      if (!firstLandingC) firstLandingC = { top: pane.top, figures: figuresNow };
      else {
        const allowance = landingAllowance(c.readerScroll, heightsC, firstLandingC.figures, figuresNow);
        check('figures at the place, reload ' + round + ': Reader view lands where the first reload did, give or take the pictures loaded at one and not the other', !!landing && Math.abs(pane.top - firstLandingC.top) <= allowance,
          { top: pane.top, first: firstLandingC.top, allowance, figures: figuresNow, firstFigures: firstLandingC.figures });
        console.log('     landed ' + pane.top + ', first ' + firstLandingC.top + ', allowance ' + allowance);
      }
    }
    // Two more places in the same paper. Restored at these in Chromium, one figure is on screen above
    // the reading line and others are above the screen, and all get their pictures then: the scroll
    // position and the paragraph at the reading line both move. A hold that watched only those two
    // took that for the reader moving and measured the place again. Found by trying 21 places from
    // 40% to 64%; in WebKit, which does not adjust the scroll position, they pass either way. Whether
    // the figures load together there depends on load timing, so checkHoldMarks below checks the
    // hold on a page it builds as well.
    for (const fraction of [0.448, 0.532]) {
      await page.evaluate(fraction => { const pane = document.getElementById('documentPane'); pane.scrollTop = (pane.scrollHeight - pane.clientHeight) * fraction; }, fraction);
      await page.waitForTimeout(900);
      const before = await settledRecord(page, 'c-paper.pdf');
      await page.reload({ waitUntil: 'load' });
      await waitOpened(page);
      await figuresNearPlaceLoaded(page);
      await page.waitForTimeout(1500);
      const after = await paperRecord(page, 'c-paper.pdf');
      check('figures at the place, read to ' + (fraction * 100).toFixed(1) + '%: a reload leaves the saved place unchanged', near(before.readerScroll, fraction) && after.readerScroll === before.readerScroll
        && !!after.readerPlace && !!before.readerPlace && after.readerPlace.page === before.readerPlace.page && after.readerPlace.at === before.readerPlace.at, { readerScroll: after.readerScroll, was: before.readerScroll, readerPlace: after.readerPlace, wasPlace: before.readerPlace });
    }

    await checkMergingSave(page);
    const scratch = await context.newPage();
    await scratch.goto(base + '/fixture');
    await checkHoldMarks(scratch);
    await scratch.close();
    check('no page errors', errors.length === 0, errors);
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  if (failures.length) { console.error('FAIL ' + ENGINE + ': ' + failures.length + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS ' + ENGINE + ': Reader view keeps its place across reloads, slow PDFs and rebuilds');
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
