/* Reading lists end to end: make a list, add papers typed, found on Crossref and from the
   library, drag and keyboard reorder, tick, import a pasted list, read a paper that is not
   in the library (Europe PMC full text), follow along in the reader's List tab, add from a
   library card, and merge another device's lists. Crossref and Europe PMC are answered
   locally; nothing else leaves.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_LISTS_TEST_PORT || 8173);
const BASE = 'http://127.0.0.1:' + PORT;
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0] === '/' ? '/reading.html' : request.url.split('?')[0];
  const filename = path.join(ROOT, pathname);
  fs.readFile(filename, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const type = filename.endsWith('.html') ? 'text/html' : filename.endsWith('.js') ? 'text/javascript'
      : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(bytes);
  });
});

const OSORIO = {
  DOI: '10.3389/fpls.2014.00516', type: 'journal-article',
  title: ['An update on source-to-sink carbon partitioning in tomato'],
  author: [{ given: 'Sonia', family: 'Osorio' }, { given: 'Yong-Ling', family: 'Ruan' }, { given: 'Alisdair R.', family: 'Fernie' }],
  issued: { 'date-parts': [[2014, 10, 6]] }, 'container-title': ['Frontiers in Plant Science']
};
const SUGARCANE = {
  DOI: '10.1093/aob/mcm258', type: 'journal-article',
  title: ['Changes in Photosynthetic Rates and Gene Expression of Leaves during a Source–Sink Perturbation in Sugarcane'],
  author: [{ given: 'A. J.', family: 'McCormick' }, { given: 'M. D.', family: 'Cramer' }, { given: 'D. A.', family: 'Watt' }],
  issued: { 'date-parts': [[2007, 11, 2]] }, 'container-title': ['Annals of Botany']
};

const JATS = '<?xml version="1.0"?><article><front><article-meta><title-group><article-title>Changes in Photosynthetic Rates during a Source–Sink Perturbation in Sugarcane</article-title></title-group>'
  + '<contrib-group><contrib contrib-type="author"><name><surname>McCormick</surname><given-names>A. J.</given-names></name></contrib></contrib-group>'
  + '<abstract><p>Sink demand <script>alert(1)</script>regulates photosynthesis.</p></abstract></article-meta></front>'
  + '<body><sec><title>Introduction</title><p>Leaves respond to sinks.</p><fig><label>Figure 1</label><caption><p>Leaf sucrose over time.</p></caption></fig></sec>'
  + '<sec><title>Results</title><p>Photosynthesis fell when sinks were removed.</p></sec></body>'
  + '<back><ref-list><ref><mixed-citation>Chiou TJ, Bush DR (1998) Sucrose is a signal molecule.</mixed-citation></ref></ref-list></back></article>';

function seed() {
  if (localStorage.getItem('readingRoom.v1')) return;
  const stamp = Date.now();
  const paper = (id, title, authors) => ({ id, kind: 'text', title, authors, fr: 'First paragraph about sinks.\n\nSecond paragraph about sources.',
    notes: {}, pageNotes: {}, tags: [], questions: [], addedAt: stamp, updatedAt: stamp });
  localStorage.setItem('readingRoom.v1', JSON.stringify({
    chapters: [paper('chiou', 'Sucrose is a signal molecule in assimilate partitioning', 'Chiou, Bush'),
      paper('stanfield', 'Coordination between phloem loading and structure maintains carbon transport under drought', 'Stanfield, Bartlett')],
    deleted: {}, merged: {}, savedAt: stamp
  }));
  localStorage.setItem('readingRoom.notebookCollapsed.v1', '0');
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).readingLists);
const titles = page => page.locator('#listItems .rl-title').allTextContents();

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  let browser;
  try {
    const name = process.env.PHLOEM_BROWSER || 'chromium';
    const launch = { headless: true };
    if (name === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[name].launch(launch);
    const context = await browser.newContext({ viewport: { width: 1180, height: 860 }, serviceWorkers: 'block' });
    const outside = [], crossrefQueries = [];
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
      const url = new URL(route.request().url());
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.hostname === 'www.ebi.ac.uk') {
        if (/\/search$/.test(url.pathname)) return json({ resultList: { result: /10\.1093\/aob\/mcm258/.test(url.searchParams.get('query')) ? [{ pmcid: 'PMC2701831', isOpenAccess: 'Y', doi: '10.1093/aob/mcm258', title: SUGARCANE.title[0] + '.' }] : [] } });
        if (/PMC2701831\/fullTextXML$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' }, body: JATS });
        return route.fulfill({ status: 404, body: '' });
      }
      if (url.hostname !== 'api.crossref.org') { outside.push(url.href); return route.abort(); }
      crossrefQueries.push(url.pathname + url.search);
      if (url.pathname === '/works') return json({ status: 'ok', message: { items: /tomato/i.test(url.searchParams.get('query.bibliographic')) ? [OSORIO] : [] } });
      if (/aob\/mcm258/i.test(decodeURIComponent(url.pathname))) return json({ status: 'ok', message: SUGARCANE });
      return route.fulfill({ status: 404, body: 'Resource not found.' });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(seed);
    await page.goto(BASE + '/reading.html');
    await page.locator('.nav-btn[data-view="listsPage"]').click();
    await page.locator('#listsEmpty').waitFor({ state: 'visible' });

    // A first list, a paper typed as written (not on Crossref), and a paper found by search.
    await page.locator('#listFirstName').fill('Proposal background');
    await page.locator('#listFirstName').press('Enter');
    await page.locator('#listsWorkspace').waitFor({ state: 'visible' });
    await page.locator('#listAddInput').fill('Konuntakiet 2020 DPhil thesis');
    await page.locator('#listAddBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#listItems .rl-item').length === 1);
    await page.locator('#listAddInput').fill('source-to-sink tomato');
    await page.locator('[data-rl-online="0"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#listItems .rl-item').length === 2);
    assert.deepEqual(await titles(page), ['Konuntakiet 2020 DPhil thesis', 'An update on source-to-sink carbon partitioning in tomato']);
    assert.equal(await page.evaluate(() => /to-do/i.test(document.getElementById('listsPage').textContent)), false, 'a reading list, not a to-do list');
    assert.match(await page.locator('#listItems .rl-item').nth(1).locator('.rl-meta').textContent(), /Osorio, Ruan & Fernie · 2014 · Frontiers in Plant Science/);

    // A library paper found by its words, then the same paper again is refused.
    await page.locator('#listAddInput').fill('sucrose signal');
    await page.locator('[data-rl-library="0"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#listItems .rl-item').length === 3);
    await page.locator('#listAddInput').fill('sucrose signal');
    assert.equal(await page.locator('[data-rl-library="0"]').isDisabled(), true, 'a paper already on the list cannot be added twice');
    await page.locator('#listAddInput').press('Escape');

    // Drag the third row to the top by its handle, nudge with the keyboard, tick one off,
    // then reload: everything stays.
    const grip = index => page.locator('#listItems .rl-item').nth(index).locator('[data-rl-grip]');
    await page.locator('#listItems .rl-item').nth(2).hover();
    const from = await grip(2).boundingBox(), to = await grip(0).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => /Moved to 1 of 3/.test(document.getElementById('listStatus').textContent));
    assert.deepEqual(await titles(page), ['Sucrose is a signal molecule in assimilate partitioning', 'Konuntakiet 2020 DPhil thesis', 'An update on source-to-sink carbon partitioning in tomato']);
    await grip(1).focus();
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await titles(page), ['Sucrose is a signal molecule in assimilate partitioning', 'An update on source-to-sink carbon partitioning in tomato', 'Konuntakiet 2020 DPhil thesis']);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.rl-item').querySelector('.rl-title').textContent), 'Konuntakiet 2020 DPhil thesis', 'keyboard focus stays on the moved row');
    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await titles(page), ['Sucrose is a signal molecule in assimilate partitioning', 'Konuntakiet 2020 DPhil thesis', 'An update on source-to-sink carbon partitioning in tomato']);
    assert.equal(await page.locator('#listItems .rl-item').first().evaluate(node => node.classList.contains('is-next')), true, 'the first open item is Up next');
    await page.locator('#listItems .rl-item').nth(1).locator('[data-rl-done]').click();
    await page.waitForFunction(() => document.querySelectorAll('#listDoneItems .rl-item').length === 1);
    assert.equal(await page.locator('#listProgress').textContent(), '1 of 3 done');
    await page.reload();
    await page.locator('.nav-btn[data-view="listsPage"]').click();
    assert.deepEqual(await titles(page), ['Sucrose is a signal molecule in assimilate partitioning', 'An update on source-to-sink carbon partitioning in tomato']);
    assert.equal(await page.locator('#listDoneItems .rl-title').textContent(), 'Konuntakiet 2020 DPhil thesis');

    // Edit what to look for.
    await page.locator('#listItems .rl-item').first().locator('[data-rl-edit]').click();
    await page.locator('#listItems .rl-editor [name="note"]').fill('Table 2: Vmax falls, Km barely moves');
    await page.locator('#listItems .rl-editor button[type="submit"]').click();
    await page.waitForFunction(() => /Vmax falls/.test(document.querySelector('#listItems .rl-note')?.textContent || ''));

    // Import a pasted Markdown list: it becomes its own list, DOIs are looked up,
    // and a clear title match links the library copy without asking.
    await page.locator('#listImportBtn').click();
    await page.locator('#listImportText').fill([
      '# Night 1', '',
      '- [ ] Stanfield & Bartlett (2022) — Coordination between phloem loading and structure maintains carbon transport under drought',
      '  - Look for: equations 7–10',
      '- [ ] 10.1093/aob/mcm258',
      '- [x] Konuntakiet (2020) Whole-plant flux balance model of tomato'
    ].join('\n'));
    assert.match(await page.locator('#listImportSummary').textContent(), /Found 3 papers · 1 with a DOI · 1 already ticked/);
    assert.equal(await page.locator('#listImportTarget').inputValue(), '__new');
    await page.locator('#listImportGo').click();
    await page.waitForFunction(() => /Changes in Photosynthetic Rates/.test(document.getElementById('listItems').textContent));
    assert.equal(await page.locator('#listName').textContent(), 'Night 1');
    const stanfield = (await saved(page)).items.find(item => /Coordination/.test(item.title));
    assert.equal(stanfield.paperId, 'stanfield', 'a clear title match links the library paper');
    assert.equal(stanfield.note, 'equations 7–10');
    const sugar = (await saved(page)).items.find(item => item.doi === '10.1093/aob/mcm258');
    assert.equal(sugar.authors, 'A. J. McCormick, M. D. Cramer, D. A. Watt');
    const nightList = (await saved(page)).lists.find(list => list.name === 'Night 1');
    assert.equal((await saved(page)).items.filter(item => item.listId === nightList.id).length, 3);

    // Read a paper that is not in the library: its open-access full text comes from
    // Europe PMC as a text paper, opens, and is linked to the item. Its markup never runs.
    await page.locator('#listItems .rl-item', { hasText: 'Changes in Photosynthetic' }).locator('.rl-title').click();
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && /Photosynthesis fell/.test(document.getElementById('textDocument').textContent));
    const fetched = await page.evaluate(() => { const doc = document.getElementById('textDocument').textContent; return { intro: /INTRODUCTION/.test(doc), figure: /Figure 1\. Leaf sucrose/.test(doc), refs: /REFERENCES/.test(doc), script: !!document.querySelector('#textDocument script') }; });
    assert.deepEqual(fetched, { intro: true, figure: true, refs: true, script: false });
    const sugarItem = (await saved(page)).items.find(item => item.doi === '10.1093/aob/mcm258');
    const sugarPaper = await page.evaluate(id => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === id), sugarItem.paperId);
    assert.equal(sugarPaper.sourceUrl, 'https://europepmc.org/article/PMC/PMC2701831');
    await page.locator('#zenExit').click();
    await page.locator('.nav-btn[data-view="listsPage"]').click();
    console.log('  ok  Read fetched the open-access full text and opened it');

    // Follow along in the reader: this paper's place, what to look for, and what's next.
    await page.locator('#listItems .rl-item').first().locator('[data-rl-read]').first().click();
    await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
    if (!await page.locator('#notebook').evaluate(node => node.classList.contains('sheet-open'))) {
      await page.locator('#zenMore').click();
      await page.locator('#zenMoreMenu').waitFor({ state: 'visible' });
      await page.locator('#zenNotebook').click();
      await page.waitForFunction(() => document.getElementById('notebook').classList.contains('sheet-open'));
    }
    await page.locator('#listTab').click();
    await page.locator('#listPanel .rl-panel-card').waitFor({ state: 'visible' });
    assert.match(await page.locator('#listPanel .rl-panel-card-head').textContent(), /This paper · 1 of 3/);
    assert.equal(await page.locator('#listPanel [data-rl-field="note"]').inputValue(), 'equations 7–10');
    assert.match(await page.locator('#listPanel .rl-panel-next').textContent(), /Changes in Photosynthetic Rates/);
    assert.match(await page.locator('#listPanel .rl-panel-next button').textContent(), /Open next/, 'the fetched paper is now in the library');
    await page.locator('#listPanel [data-rl-field="takeaway"]').fill('Loading and structure scale together');
    await page.locator('#listPanel [data-rl-done]').first().click();
    await page.waitForFunction(() => {
      const item = JSON.parse(localStorage.getItem('readingRoom.v1')).readingLists.items.find(entry => entry.paperId === 'stanfield');
      return item && item.done && item.takeaway === 'Loading and structure scale together';
    });

    // The other library paper can be added to an existing list from its library card.
    await page.locator('#sheetClose').click();
    await page.locator('#zenExit').click();
    await page.waitForFunction(() => document.getElementById('readerPage').classList.contains('hidden'));
    assert.equal(await page.locator('#listsPage').isVisible(), true, 'leaving the reader returns to the reading list');
    await page.locator('.nav-btn[data-view="libraryPage"]').click();
    await page.locator('#libraryPage').waitFor({ state: 'visible' });
    // The paper read last is already the selected one on the wall; a second click would open it.
    if (!/Coordination/.test(await page.locator('.closed-book-title:visible').first().textContent())) await page.locator('[data-shelf-paper="stanfield"]:visible').first().click();
    const control = page.locator('.cover-list-add:visible').first();
    await control.waitFor({ state: 'visible' });
    assert.match(await control.locator('summary').textContent(), /On “Night 1”/);
    await control.locator('summary').click();
    await control.locator('[data-rl-card-list]', { hasText: 'Proposal background' }).click();
    await page.waitForFunction(() => {
      const lists = JSON.parse(localStorage.getItem('readingRoom.v1')).readingLists;
      const proposal = lists.lists.find(list => list.name === 'Proposal background');
      return lists.items.some(item => item.listId === proposal.id && item.paperId === 'stanfield');
    });

    // Another device's copy merges in record by record (the backup restore uses the sync merge).
    const theirs = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem('readingRoom.v1')).readingLists;
      const proposal = lists.lists.find(list => list.name === 'Proposal background');
      const later = Date.now() + 5000;
      return { chapters: [], deleted: {}, merged: {}, readingLists: { version: 1,
        lists: [{ id: 'ipad-list', name: 'Manuscript intro', rank: 9, createdAt: later, updatedAt: later }],
        items: [{ id: 'ipad-item', listId: proposal.id, kind: 'paper', title: 'Chiou & Bush 1998, Table 2', rank: 99, createdAt: later, updatedAt: later }],
        deleted: {} } };
    });
    await page.locator('#restoreFile').setInputFiles({ name: 'other-device.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(theirs)) });
    await page.waitForFunction(() => {
      const lists = JSON.parse(localStorage.getItem('readingRoom.v1')).readingLists;
      return lists.lists.some(list => list.name === 'Manuscript intro') && lists.items.some(item => item.title === 'Chiou & Bush 1998, Table 2')
        && lists.items.some(item => item.paperId === 'stanfield' && item.done);
    });
    await page.locator('.nav-btn[data-view="listsPage"]').click();
    await page.locator('[data-rl-list]', { hasText: 'Proposal background' }).click();
    assert.ok((await titles(page)).includes('Chiou & Bush 1998, Table 2'), 'the merged item shows without a reload');

    // Exports: Markdown carries ticks and notes.
    const markdown = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem('readingRoom.v1')).readingLists;
      const night = lists.lists.find(list => list.name === 'Night 1');
      return window.PhloemLists.toMarkdown(night, window.PhloemLists.items(lists, night.id));
    });
    assert.match(markdown, /- \[x\] \*\*Coordination between phloem loading/);
    assert.match(markdown, /Takeaway: Loading and structure scale together/);

    assert.deepEqual(errors, [], 'no page errors');
    assert.deepEqual(outside.filter(url => !/fonts\.|googleapis\.com\/css/.test(url)), [], 'only Crossref is contacted');
    assert.ok(crossrefQueries.every(query => !/mailto|houfu/i.test(query)), 'searches carry only the typed words');
    console.log('PASS  reading lists (' + name + '): build, search, drag, tick, import, read from Europe PMC, reader tab, library card, merge, export');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
