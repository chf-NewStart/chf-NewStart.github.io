/* Reading lists: the Reading list screen and the reader's List tab. Presentation and
   Crossref lookups only; the reader supplies storage, papers and navigation. */
(function () {
  'use strict';

  const ACTIVE_KEY = 'readingRoom.activeList.v1';
  const CROSSREF = 'https://api.crossref.org/works';
  const CROSSREF_FIELDS = 'DOI,title,subtitle,author,issued,published-print,published-online,container-title,type,publisher';
  const EUROPE_PMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function byId(id) { return document.getElementById(id); }
  function normalTitle(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function readActive() { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (error) { return ''; } }
  function writeActive(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (error) {} }
  function plural(count, word) { return count + ' ' + word + (count === 1 ? '' : 's'); }

  function create(adapter) {
    const L = window.PhloemLists;
    if (!L) throw new Error('Reading lists need reading-lists.js');
    const page = byId('listsPage');
    const panel = byId('listPanelBody');
    if (!page || !panel) throw new Error('Reading list markup is missing');
    const el = {
      empty: byId('listsEmpty'), workspace: byId('listsWorkspace'), tabs: byId('listTabs'),
      name: byId('listName'), progress: byId('listProgress'), bar: byId('listProgressBar'),
      input: byId('listAddInput'), results: byId('listAddResults'), status: byId('listStatus'),
      items: byId('listItems'), doneWrap: byId('listDoneWrap'), doneItems: byId('listDoneItems'), doneCount: byId('listDoneCount'),
      newForm: byId('listNewForm'), newName: byId('listNewName'), firstForm: byId('listFirstForm'), firstName: byId('listFirstName'),
      renameForm: byId('listRenameForm'), renameInput: byId('listRenameInput'), manage: byId('listManage'),
      dialog: byId('listImportDialog'), importText: byId('listImportText'), importFile: byId('listImportFile'),
      importSummary: byId('listImportSummary'), importTarget: byId('listImportTarget'), importGo: byId('listImportGo'),
      importNotes: byId('listImportNotes'), importNotesRow: byId('listImportNotesRow'),
      locked: byId('listsLocked')
    };
    let activeId = readActive();
    let editingId = '';
    let searchSerial = 0, searchTimer = 0, searchAbort = null, searchSettled = null;
    const notices = new Map(), fetching = new Set(), peeks = new Map(), abstracts = new Map();
    let lastQuery = '', searchResults = { library: [], online: [], state: 'idle', query: '' };
    let importPreview = null;
    let pendingRefresh = false;
    let drag = null;
    let panelSaving = false;
    const lookedUp = new Set();

    /* ---------- data ---------- */
    function store() { try { return L.normalize(adapter.store()); } catch (error) { return L.normalize(); } }
    function locked() { return !!adapter.locked(); }
    function save(next, quiet) {
      if (locked()) { status('This list was saved by a newer Phloem. Reload to edit it.'); return false; }
      const saved = adapter.save(next);
      if (!saved) status('Phloem could not save that change on this device.');
      if (!quiet) refresh();
      return saved;
    }
    function apply(change, quiet) {
      try { return save(change(store()), quiet); }
      catch (error) { status(error && error.message || 'That change could not be saved.'); return false; }
    }
    function currentList(s) {
      s = s || store();
      let list = s.lists.find(entry => entry.id === activeId);
      if (!list && s.lists.length) { list = s.lists[0]; activeId = list.id; writeActive(activeId); }
      return list || null;
    }
    function listItems(s, listId) { return L.items(s, listId); }
    function paperFor(item) { return item && item.paperId ? adapter.paper(item.paperId) : null; }
    function papers() { return adapter.papers(); }
    function status(message) { if (el.status) el.status.textContent = message || ''; }
    function sameItem(a, b) {
      if (a.doi && b.doi) return a.doi === b.doi;
      if (a.paperId && b.paperId) return adapter.resolve(a.paperId) === adapter.resolve(b.paperId);
      return !!a.title && normalTitle(a.title) === normalTitle(b.title);
    }
    function onList(s, listId, candidate) { return listItems(s, listId).find(item => sameItem(item, candidate)) || null; }

    function addEntries(entries, listId, options) {
      options = options || {};
      let s = store(), added = 0, skipped = 0;
      const known = papers(), lookups = [];
      entries.forEach(entry => {
        const candidate = Object.assign({ kind: 'paper', title: '', authors: '', year: '', venue: '', doi: '', url: '', note: '', takeaway: '', done: false }, entry);
        if (onList(s, listId, candidate)) { skipped++; return; }
        if (!candidate.paperId && candidate.kind === 'paper') candidate.paperId = L.confidentMatch(candidate, known);
        const record = Object.assign({}, candidate, { id: adapter.uid('ri-'), listId: listId });
        delete record.type;
        s = L.upsertItem(s, record, adapter.now());
        if (record.doi && (!record.title || !record.authors || !record.year)) lookups.push(record.id);
        added++;
      });
      if (added && save(s)) { if (lookups.length) fillDetails(lookups); }
      else if (!added) refresh();
      if (!options.quiet) status(added ? (added === 1 && !skipped ? 'Added.' : 'Added ' + plural(added, 'item') + (skipped ? ', ' + skipped + ' already on the list' : '') + '.') : skipped ? 'Already on this list.' : 'Nothing to add.');
      return added;
    }

    /* ---------- Crossref ---------- */
    async function crossref(url, signal) {
      const response = await fetch(url, { signal: signal, headers: { Accept: 'application/json' } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Crossref answered ' + response.status);
      return (await response.json()).message;
    }
    async function lookupDoi(doi, signal) {
      const work = await crossref(CROSSREF + '/' + encodeURIComponent(doi), signal);
      return work ? L.fromCrossref(work) : null;
    }
    async function searchCrossref(query, signal) {
      const doi = L.cleanDoi(query);
      if (doi) { const found = await lookupDoi(doi, signal); return found ? [found] : []; }
      const message = await crossref(CROSSREF + '?rows=6&select=' + CROSSREF_FIELDS + '&query.bibliographic=' + encodeURIComponent(query), signal);
      return (message && Array.isArray(message.items) ? message.items : []).map(L.fromCrossref).filter(Boolean);
    }
    /* Imported DOIs fill in their missing title, authors and year one at a time. */
    async function fillDetails(ids) {
      const pending = ids.filter(id => !lookedUp.has(id));
      if (!pending.length) return;
      pending.forEach(id => lookedUp.add(id));
      status('Looking up details for ' + plural(pending.length, 'DOI') + '…');
      let filled = 0, failed = 0;
      for (const id of pending) {
        const item = store().items.find(entry => entry.id === id);
        if (!item || !item.doi) continue;
        try {
          const found = await lookupDoi(item.doi);
          if (!found) { failed++; continue; }
          const latest = store().items.find(entry => entry.id === id);
          if (!latest) continue;
          const changes = { id: id };
          ['title', 'authors', 'year', 'venue'].forEach(field => { if (!latest[field] && found[field]) changes[field] = found[field]; });
          if (Object.keys(changes).length > 1) {
            const merged = Object.assign({}, latest, changes);
            if (!latest.paperId) { const match = L.confidentMatch(merged, papers()); if (match) changes.paperId = match; }
            apply(s => L.upsertItem(s, changes, adapter.now()), true);
            filled++;
          }
        } catch (error) { failed++; }
      }
      refresh();
      status(filled ? 'Filled in ' + plural(filled, 'paper') + ' from Crossref.' + (failed ? ' ' + failed + ' could not be looked up (offline?).' : '') : failed ? 'Could not look up ' + plural(failed, 'DOI') + '. They stay on the list; try again online.' : '');
    }

    /* ---------- search & add ---------- */
    function librarySearch(query, listId, s) {
      const words = normalTitle(query).split(' ').filter(word => word.length > 1);
      if (!words.length) return [];
      return papers().filter(paper => {
        const hay = normalTitle([paper.title, paper.authors, paper.sourceName].join(' '));
        return words.every(word => hay.indexOf(word) >= 0);
      }).slice(0, 4).map(paper => ({ kind: 'paper', paperId: paper.id, title: paper.title, authors: paper.authors, onList: !!onList(s, listId, { paperId: paper.id, title: paper.title }) }));
    }
    function asWritten(query) {
      const parsed = L.parseImport(query, 'line.txt').items[0];
      return parsed || { kind: 'paper', title: query.trim() };
    }
    function runSearch(immediate) {
      const query = el.input.value.trim(), list = currentList();
      clearTimeout(searchTimer);
      if (searchAbort) { searchAbort.abort(); searchAbort = null; }
      if (searchSettled) { searchSettled(); searchSettled = null; }
      if (!query || !list) { searchResults = { library: [], online: [], state: 'idle', query: '' }; renderResults(); return Promise.resolve(); }
      const s = store();
      searchResults = { library: librarySearch(query, list.id, s), online: [], state: query.length >= 3 ? 'loading' : 'short', query: query };
      renderResults();
      if (query.length < 3) return Promise.resolve();
      const serial = ++searchSerial;
      const settled = new Promise(resolve => { searchSettled = resolve; });
      searchTimer = setTimeout(async () => {
        const finish = () => { if (serial === searchSerial && searchSettled) { searchSettled(); searchSettled = null; } };
        if (!navigator.onLine) { searchResults.state = 'offline'; renderResults(); finish(); return; }
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        searchAbort = controller;
        const timer = setTimeout(() => { if (controller) controller.abort(); }, 12000);
        try {
          const found = await searchCrossref(query, controller && controller.signal);
          if (serial !== searchSerial) return;
          const latest = store();
          searchResults.online = found.map(entry => Object.assign(entry, { onList: !!onList(latest, list.id, entry) }));
          searchResults.state = 'done';
        } catch (error) {
          if (serial !== searchSerial) return;
          searchResults.state = 'failed';
        } finally { clearTimeout(timer); if (searchAbort === controller) searchAbort = null; }
        renderResults();
        finish();
      }, immediate ? 0 : 450);
      return settled;
    }
    function closeTitle(query, title) {
      const a = normalTitle(query), b = normalTitle(title);
      return a.length >= 12 && (a === b || b.indexOf(a) === 0 && a.length / b.length > 0.7);
    }
    /* Add (or Enter) takes the paper you clearly meant: the DOI's paper, an exact
       title in your library or on Crossref, and otherwise the words as written. */
    async function addTyped() {
      const query = el.input.value.trim(), list = currentList();
      if (!query || !list) { el.input.focus(); return; }
      if (searchResults.query !== query || searchResults.state === 'loading' || searchResults.state === 'idle') await runSearch(true);
      if (el.input.value.trim() !== query) return;
      const doi = L.cleanDoi(query);
      const library = searchResults.library.find(entry => !entry.onList && closeTitle(query, entry.title));
      const online = searchResults.online.find(entry => !entry.onList && (doi ? entry.doi === doi : closeTitle(query, entry.title)));
      const entry = library ? { kind: 'paper', paperId: library.paperId, title: library.title, authors: library.authors } : online ? Object.assign({}, online) : asWritten(query);
      if (addEntries([entry], list.id)) { clearSearch(); el.input.focus(); }
    }
    function resultMeta(entry) {
      return [L.shortAuthors(entry.authors), entry.year, entry.venue].filter(Boolean).join(' · ');
    }
    function renderResults() {
      const r = searchResults, query = r.query;
      if (!query) { el.results.innerHTML = ''; el.results.classList.add('hidden'); return; }
      const written = asWritten(query);
      let html = '<button class="rl-result rl-result-written" type="button" data-rl-written><span class="rl-result-plus" aria-hidden="true">＋</span><span><b>' +
        esc(written.title || query) + '</b><small>Add as written' + (written.doi ? ' · DOI ' + esc(written.doi) : '') + '</small></span></button>';
      if (r.library.length) {
        html += '<div class="rl-result-group">In your library</div>' + r.library.map((entry, index) =>
          '<button class="rl-result" type="button" data-rl-library="' + index + '"' + (entry.onList ? ' disabled' : '') + '><span class="rl-result-plus" aria-hidden="true">' + (entry.onList ? '✓' : '＋') + '</span><span><b>' + esc(entry.title || 'Untitled') + '</b><small>' + esc(entry.onList ? 'Already on this list' : L.shortAuthors(entry.authors) || 'Library paper') + '</small></span></button>').join('');
      }
      html += '<div class="rl-result-group">Papers on Crossref</div>';
      if (r.state === 'loading') html += '<p class="rl-result-note">Searching…</p>';
      else if (r.state === 'short') html += '<p class="rl-result-note">Type a few more letters to search.</p>';
      else if (r.state === 'offline') html += '<p class="rl-result-note">You are offline. Add it as written now and look it up later.</p>';
      else if (r.state === 'failed') html += '<p class="rl-result-note">Crossref did not answer. Add it as written, or try again.</p>';
      else if (!r.online.length) html += '<p class="rl-result-note">No match on Crossref. Theses and preprints are often missing; add it as written.</p>';
      else html += r.online.map((entry, index) =>
        '<button class="rl-result" type="button" data-rl-online="' + index + '"' + (entry.onList ? ' disabled' : '') + '><span class="rl-result-plus" aria-hidden="true">' + (entry.onList ? '✓' : '＋') + '</span><span><b>' + esc(entry.title || entry.doi) + '</b><small>' + esc(entry.onList ? 'Already on this list' : resultMeta(entry) || entry.doi) + '</small></span></button>').join('');
      el.results.innerHTML = html;
      el.results.classList.remove('hidden');
    }
    function clearSearch() {
      el.input.value = '';
      searchResults = { library: [], online: [], state: 'idle', query: '' };
      renderResults();
    }
    function addFromResult(button) {
      const list = currentList();
      if (!list) return;
      let entry = null;
      if (button.hasAttribute('data-rl-written')) entry = asWritten(searchResults.query);
      else if (button.dataset.rlLibrary) {
        const hit = searchResults.library[+button.dataset.rlLibrary];
        if (hit) entry = { kind: 'paper', paperId: hit.paperId, title: hit.title, authors: hit.authors };
      } else if (button.dataset.rlOnline) {
        const hit = searchResults.online[+button.dataset.rlOnline];
        if (hit) entry = Object.assign({}, hit);
      }
      if (!entry) return;
      if (addEntries([entry], list.id)) { clearSearch(); el.input.focus(); }
    }

    /* ---------- opening a paper from the list ---------- */
    async function fetchPdf(url) {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error('PDF request answered ' + response.status);
      const bytes = await response.arrayBuffer(), head = new Uint8Array(bytes.slice(0, 1024));
      let text = '';
      for (let i = 0; i < head.length; i++) text += String.fromCharCode(head[i]);
      if (text.indexOf('%PDF-') < 0) throw new Error('Not a PDF');
      return bytes;
    }
    function arxivId(item) {
      const fromDoi = (item.doi || '').match(/^10\.48550\/arxiv\.(.+)$/i);
      if (fromDoi) return fromDoi[1];
      const fromUrl = (item.url || '').match(/arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:\.pdf)?(?:[?#]|$)/i);
      return fromUrl ? fromUrl[1] : '';
    }
    function pdfName(item) {
      const who = (L.shortAuthors(item.authors).split(/[ ,&]/)[0] || 'paper').toLowerCase().replace(/[^a-z0-9-]/g, '');
      const words = normalTitle(item.title).split(' ').slice(0, 5).join('-');
      return (who + (item.year || '') + (words ? '_' + words : '')).slice(0, 80) + '.pdf';
    }
    /* Open-access articles in PubMed Central come back as their full text (JATS XML):
       title, authors, abstract, sections, figure captions and references. Only text
       is read from the XML; none of it is ever inserted as markup. */
    function jatsText(xml) {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) return { title: '', authors: '', paragraphs: [] };
      const text = node => node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
      const heading = value => {
        const clean = value.toUpperCase().replace(/[^A-Z0-9\s:.,&()/-]+/g, ' ').replace(/\s+/g, ' ').trim();
        return clean.length >= 5 && clean.length < 90 ? clean : '';
      };
      const meta = doc.querySelector('article-meta');
      const title = text(meta && meta.querySelector('title-group > article-title'));
      const authors = Array.from(meta ? meta.querySelectorAll('contrib-group > contrib') : []).filter(contrib => (contrib.getAttribute('contrib-type') || 'author') === 'author').map(contrib => {
        const name = contrib.querySelector('name');
        return name ? [text(name.querySelector('given-names')), text(name.querySelector('surname'))].filter(Boolean).join(' ') : text(contrib.querySelector('collab'));
      }).filter(Boolean).join(', ');
      const out = [];
      const abstract = meta && (meta.querySelector('abstract:not([abstract-type])') || meta.querySelector('abstract'));
      if (abstract) {
        out.push('ABSTRACT');
        const paras = abstract.querySelectorAll('p');
        if (paras.length) paras.forEach(p => out.push(text(p))); else out.push(text(abstract));
      }
      const caption = (node, word) => {
        const label = text(node.querySelector(':scope > label'));
        const body = text(node.querySelector(':scope > caption'));
        return body ? (label || word) + '. ' + body : '';
      };
      function walk(node) {
        Array.from(node.children).forEach(child => {
          const tag = child.tagName.toLowerCase();
          if (tag === 'sec' || tag === 'app' || tag === 'boxed-text') {
            const h = heading(text(child.querySelector(':scope > title')));
            if (h) out.push(h);
            walk(child);
          } else if (tag === 'p') {
            Array.from(child.querySelectorAll('fig, table-wrap')).forEach(inner => inner.remove());
            out.push(text(child));
          } else if (tag === 'fig') out.push(caption(child, 'Figure'));
          else if (tag === 'table-wrap') out.push(caption(child, 'Table'));
          else if (tag === 'list') child.querySelectorAll(':scope > list-item').forEach(entry => out.push('• ' + text(entry)));
          else if (tag === 'disp-quote' || tag === 'disp-formula') out.push(text(child));
          else if (tag !== 'title' && tag !== 'label') walk(child);
        });
      }
      const body = doc.querySelector('article > body');
      if (body) walk(body);
      const refs = Array.from(doc.querySelectorAll('back ref-list ref'));
      if (refs.length) {
        out.push('REFERENCES');
        refs.forEach(ref => {
          const citation = text(ref.querySelector('mixed-citation, element-citation, citation'));
          if (citation) out.push(citation);
        });
      }
      return { title: title, authors: authors, paragraphs: out.filter(Boolean) };
    }
    async function europePmc(item) {
      let query = '';
      if (item.doi) query = 'DOI:"' + item.doi + '"';
      else if (item.title && item.title.length >= 20) query = 'TITLE:"' + item.title.replace(/["\\]/g, ' ') + '"';
      else return null;
      const response = await fetch(EUROPE_PMC + '/search?format=json&resultType=lite&pageSize=5&query=' + encodeURIComponent(query + ' AND OPEN_ACCESS:Y'));
      if (!response.ok) return null;
      const found = await response.json();
      const hit = (found && found.resultList && found.resultList.result || []).find(result => result.pmcid && result.isOpenAccess === 'Y' &&
        (item.doi ? String(result.doi || '').toLowerCase() === item.doi : normalTitle(result.title) === normalTitle(item.title)));
      if (!hit) return null;
      const article = await fetch(EUROPE_PMC + '/' + encodeURIComponent(hit.pmcid) + '/fullTextXML');
      if (!article.ok) return null;
      const parsed = jatsText(await article.text());
      if (parsed.paragraphs.length < 3) return null;
      const page = 'https://europepmc.org/article/PMC/' + hit.pmcid;
      return {
        kind: 'text', title: parsed.title || item.title, authors: parsed.authors || item.authors,
        paragraphs: ['Open-access full text from Europe PMC (' + hit.pmcid + '). Figures are not shown here; see them at ' + page + ' or add the PDF.'].concat(parsed.paragraphs),
        sourceName: 'Europe PMC ' + hit.pmcid, sourceUrl: page
      };
    }
    async function freeCopy(item) {
      const id = arxivId(item);
      if (id) { try { return { kind: 'pdf', bytes: await fetchPdf('https://arxiv.org/pdf/' + id), name: pdfName(item), url: 'https://arxiv.org/abs/' + id }; } catch (error) {} }
      if (item.url && /\.pdf(?:$|[?#])|\/pdf(?:\/|$|[?#])/i.test(item.url)) { try { return { kind: 'pdf', bytes: await fetchPdf(item.url), name: pdfName(item), url: item.url }; } catch (error) {} }
      try { return await europePmc(item); } catch (error) { return null; }
    }
    /* Reading from the list opens the paper itself: the library copy when there is one,
       otherwise a free copy Phloem can fetch, otherwise a way to add it. */
    async function readItem(item) {
      const paper = paperFor(item);
      if (paper) { adapter.open(paper.id); return; }
      if (fetching.has(item.id)) return;
      fetching.add(item.id);
      notices.set(item.id, 'busy');
      refresh();
      try {
        const copy = navigator.onLine === false ? null : await freeCopy(item);
        if (!copy) throw new Error('No free copy');
        const paperId = copy.kind === 'pdf' ? await adapter.addPdfBytes(copy.bytes, copy.name, copy.url) : adapter.addTextPaper(copy);
        if (!paperId) throw new Error('Import failed');
        notices.delete(item.id);
        fetching.delete(item.id);
        apply(s => L.upsertItem(s, { id: item.id, paperId: paperId }, adapter.now()), true);
        adapter.open(paperId);
      } catch (error) {
        notices.set(item.id, 'failed');
        fetching.delete(item.id);
        refresh();
      }
    }
    function addPdfFor(item) {
      adapter.addPdf(paperId => {
        if (!paperId) return;
        notices.delete(item.id);
        apply(s => L.upsertItem(s, { id: item.id, paperId: paperId }, adapter.now()));
        status('Added to your library and linked.');
      });
    }

    /* ---------- the Reading list screen ---------- */
    function scholarUrl(item) {
      return 'https://scholar.google.com/scholar?q=' + encodeURIComponent(item.title || item.doi);
    }
    function suggestion(item) {
      if (item.paperId) return null;
      const match = L.libraryMatches(item, papers(), 1)[0];
      return match && match.score >= 0.6 ? adapter.paper(match.id) : null;
    }
    /* Authors · year · journal, then the one link that helps find the paper. */
    function metaHtml(item, paper) {
      const text = [L.shortAuthors(item.authors), item.year, item.venue].filter(Boolean).map(esc).join(' · ');
      let link = '';
      if (!paper) {
        if (item.url) link = '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">Full text ↗</a>';
        else if (item.doi) link = '<a href="https://doi.org/' + esc(item.doi) + '" target="_blank" rel="noopener">DOI ↗</a>';
        else link = '<a href="' + esc(scholarUrl(item)) + '" target="_blank" rel="noopener">Find it ↗</a>';
      }
      const peek = item.done ? '' : '<button class="rl-peek-toggle" type="button" data-rl-peek aria-expanded="' + peeks.has(item.id) + '" aria-controls="rl-peek-' + esc(item.id) + '">' + (peeks.has(item.id) ? 'Hide abstract' : 'Peek') + '</button>';
      const parts = [text, link, peek].filter(Boolean);
      return parts.length ? '<div class="rl-meta">' + parts.join('<span aria-hidden="true"> · </span>') + '</div>' : '';
    }
    /* Peek: the abstract, before you open the paper, so you know what to expect. It comes
       from Europe PMC (most biology) or Crossref, as plain text; nothing is generated. */
    function peekHtml(item) {
      const peek = peeks.get(item.id);
      if (!peek) return '';
      const body = peek.state === 'loading' ? '<p class="rl-peek-note">Finding the abstract…</p>' :
        peek.paragraphs && peek.paragraphs.length ? peek.paragraphs.map(text => '<p>' + esc(text) + '</p>').join('') + '<p class="rl-peek-note">Abstract from ' + esc(peek.source) + '. Then flip through the figures and the conclusion.</p>' :
        '<p class="rl-peek-note">No abstract found online. Skim the figures and the conclusion instead.</p>';
      return '<div class="rl-peek" id="rl-peek-' + esc(item.id) + '" role="region" aria-label="Abstract">' + body + '</div>';
    }
    // Structured abstracts keep their headings as a lead-in: "Background: …".
    function abstractParagraphs(markup) {
      const marked = String(markup || '').replace(/<\/(?:jats:)?(?:title|h\d)>/gi, ': ').replace(/<\/?(?:jats:)?(?:p|sec|title|h\d|br)\b[^>]*>/gi, '\n\n');
      const doc = new DOMParser().parseFromString('<div>' + marked + '</div>', 'text/html');
      doc.querySelectorAll('script, style').forEach(node => node.remove());
      return (doc.body.textContent || '').split(/\n\s*\n/).map(text => text.replace(/\s+/g, ' ').replace(/^abstract[.:]?\s*/i, '').trim()).filter(text => text.length > 1 && !/:$/.test(text));
    }
    async function abstractFor(item) {
      let query = item.doi ? 'DOI:"' + item.doi + '"' : item.title && item.title.length >= 20 ? 'TITLE:"' + item.title.replace(/["\\]/g, ' ') + '"' : '';
      if (query) {
        try {
          const response = await fetch(EUROPE_PMC + '/search?format=json&resultType=core&pageSize=3&query=' + encodeURIComponent(query));
          const found = response.ok ? await response.json() : null;
          const hit = (found && found.resultList && found.resultList.result || []).find(result => result.abstractText &&
            (item.doi ? String(result.doi || '').toLowerCase() === item.doi : normalTitle(result.title) === normalTitle(item.title)));
          if (hit) return { paragraphs: abstractParagraphs(hit.abstractText), source: 'Europe PMC' };
        } catch (error) {}
      }
      if (item.doi) {
        try {
          const work = await crossref(CROSSREF + '/' + encodeURIComponent(item.doi));
          if (work && work.abstract) return { paragraphs: abstractParagraphs(work.abstract), source: 'Crossref' };
        } catch (error) {}
      }
      return { paragraphs: [], source: '' };
    }
    async function togglePeek(item) {
      if (peeks.has(item.id)) { peeks.delete(item.id); refresh(); return; }
      const cached = abstracts.get(item.id);
      peeks.set(item.id, cached || { state: 'loading' });
      refresh();
      if (cached) return;
      const found = await abstractFor(item);
      const entry = { state: 'done', paragraphs: found.paragraphs, source: found.source };
      if (found.paragraphs.length) abstracts.set(item.id, entry);
      if (peeks.has(item.id)) { peeks.set(item.id, entry); refresh(); }
    }
    function sourceUrl(item) { return item.url || (item.doi ? 'https://doi.org/' + item.doi : scholarUrl(item)); }
    function trailHtml(item, paper) {
      let html = '';
      if (paper) html += '<button class="rl-pill' + (item.done ? ' is-quiet' : ' is-open') + '" type="button" data-rl-read aria-label="' + (paper.progress > 0 && !item.done ? 'Continue' : 'Open') + ' ' + esc(item.title) + '">' +
        (paper.progress > 0 && !item.done ? 'Continue<small>' + paper.progress + '%</small>' : 'Open') + '</button>';
      else if (!item.done) html += '<button class="rl-pill" type="button" data-rl-read aria-label="Read ' + esc(item.title) + '"' + (fetching.has(item.id) ? ' disabled' : '') + '>Read</button>';
      html += '<button class="rl-more" type="button" data-rl-edit aria-expanded="' + (editingId === item.id) + '" aria-label="' + (editingId === item.id ? 'Close editing' : 'Edit') + ' ' + esc(item.title || 'item') + '" title="Edit">' +
        (editingId === item.id ? '×' : '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15.5" cy="10" r="1.6"/></svg>') + '</button>';
      return html;
    }
    function noticeHtml(item) {
      const notice = notices.get(item.id);
      if (!notice) return '';
      if (notice === 'busy') return '<p class="rl-notice" role="status">Looking for a free copy…</p>';
      return '<p class="rl-notice is-failed" role="status">Phloem could not find a free copy to open here. <a href="' + esc(sourceUrl(item)) + '" target="_blank" rel="noopener">Open the publisher page ↗</a> <button type="button" data-rl-addpdf>Choose the PDF on this device</button></p>';
    }
    function editor(item, s) {
      const others = s.lists.filter(list => list.id !== item.listId);
      const paper = paperFor(item);
      const known = papers();
      const ranked = L.libraryMatches(item, known, 5).map(match => match.id);
      const options = ranked.concat(known.map(entry => entry.id).filter(id => ranked.indexOf(id) < 0));
      const byIdMap = new Map(known.map(entry => [entry.id, entry]));
      return '<form class="rl-editor" data-rl-editor>' +
        '<label><span>Title</span><input class="field" name="title" value="' + esc(item.title) + '" maxlength="500"></label>' +
        ('<div class="rl-editor-row"><label><span>Authors</span><input class="field" name="authors" value="' + esc(item.authors) + '" maxlength="600"></label><label class="rl-editor-year"><span>Year</span><input class="field" name="year" value="' + esc(item.year) + '" inputmode="numeric" maxlength="4"></label></div>' +
          '<label><span>DOI or link</span><input class="field" name="ref" value="' + esc(item.doi || item.url) + '" spellcheck="false"></label>') +
        '<label><span>My question</span><textarea class="field" name="note" rows="2" placeholder="After a quick look (Peek, figures): what do you want to find out, or what do you predict?">' + esc(item.note) + '</textarea></label>' +
        '<label><span>Takeaway</span><textarea class="field" name="takeaway" rows="2" placeholder="From memory: what did they find, and what surprised you?">' + esc(item.takeaway) + '</textarea></label>' +
        ('<label><span>Library paper</span><select class="field" name="paperId"><option value="">Not in my library yet</option>' +
          options.map(id => { const entry = byIdMap.get(id); return entry ? '<option value="' + esc(id) + '"' + (paper && paper.id === id ? ' selected' : '') + '>' + esc((entry.title || 'Untitled').slice(0, 90)) + '</option>' : ''; }).join('') + '</select></label>') +
        (others.length ? '<label><span>List</span><select class="field" name="listId"><option value="">' + esc(currentList(s).name) + '</option>' + others.map(list => '<option value="' + esc(list.id) + '">Move to ' + esc(list.name) + '</option>').join('') + '</select></label>' : '') +
        '<div class="rl-editor-actions"><button class="button" type="submit">Save</button><button class="soft-button" type="button" data-rl-cancel>Cancel</button>' + (paper ? '' : '<button class="soft-button" type="button" data-rl-addpdf>Choose PDF…</button>') + '<button class="text-button danger-text" type="button" data-rl-remove>Remove from list</button></div></form>';
    }
    const GRIP = '<svg viewBox="0 0 12 20" aria-hidden="true"><circle cx="3" cy="4" r="1.5"/><circle cx="9" cy="4" r="1.5"/><circle cx="3" cy="10" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="3" cy="16" r="1.5"/><circle cx="9" cy="16" r="1.5"/></svg>';
    function itemHtml(item, s, upNextId) {
      const paper = paperFor(item), guess = !item.done && suggestion(item), editing = editingId === item.id;
      const classes = ['rl-item', paper ? 'is-in-library' : '', item.done ? 'is-done' : '', item.id === upNextId ? 'is-next' : '', editing ? 'is-editing' : ''].filter(Boolean).join(' ');
      const label = item.title || (item.doi ? 'DOI ' + item.doi : item.url);
      return '<li class="' + classes + '" data-rl-item="' + esc(item.id) + '">' +
        (item.done ? '<span class="rl-grip-space" aria-hidden="true"></span>' : '<button class="rl-grip" type="button" data-rl-grip aria-label="Reorder ' + esc(label) + '. Drag it, or press the up and down arrow keys." title="Drag to reorder">' + GRIP + '</button>') +
        '<label class="rl-check"><input type="checkbox" data-rl-done' + (item.done ? ' checked' : '') + '><span class="sr-only">' + (item.done ? 'Mark not done: ' : 'Mark done: ') + esc(label) + '</span></label>' +
        '<div class="rl-body">' +
        (item.id === upNextId ? '<span class="rl-next-tag">Up next</span>' : '') +
        '<button class="rl-title" type="button" data-rl-read>' + esc(label) + '</button>' +
        metaHtml(item, paper) + peekHtml(item) + noticeHtml(item) +
        (item.note && !editing ? '<p class="rl-note"><span>My question</span>' + esc(item.note) + '</p>' : '') +
        (item.takeaway && !editing ? '<p class="rl-takeaway"><span>Takeaway</span>' + esc(item.takeaway) + '</p>' : '') +
        (item.done && !item.takeaway && !editing ? '<button class="rl-add-takeaway" type="button" data-rl-edit>＋ Add a takeaway</button>' : '') +
        (guess ? '<button class="rl-suggest" type="button" data-rl-link="' + esc(guess.id) + '">In your library as “' + esc(guess.title.slice(0, 56)) + (guess.title.length > 56 ? '…' : '') + '” · Link it</button>' : '') +
        (editing ? editor(item, s) : '') +
        '</div>' +
        '<div class="rl-trail">' + trailHtml(item, paper) + '</div>' +
        '</li>';
    }
    function render() {
      if (!page || page.classList.contains('hidden')) return;
      if (drag) { pendingRefresh = true; return; }
      const active = document.activeElement;
      if (active && el.items.parentNode && (el.items.contains(active) || el.doneItems.contains(active)) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && active.type !== 'checkbox') { pendingRefresh = true; return; }
      pendingRefresh = false;
      const s = store(), list = currentList(s), isLocked = locked();
      el.locked.classList.toggle('hidden', !isLocked);
      el.empty.classList.toggle('hidden', !!list);
      el.workspace.classList.toggle('hidden', !list);
      if (!list) return;
      const all = listItems(s, list.id), undone = all.filter(item => !item.done), done = all.filter(item => item.done).sort((a, b) => b.doneAt - a.doneAt);
      el.tabs.innerHTML = s.lists.map(entry => {
        const entries = listItems(s, entry.id), count = entries.filter(item => item.done).length;
        return '<button class="rl-tab" type="button" data-rl-list="' + esc(entry.id) + '" aria-pressed="' + (entry.id === list.id) + '"><span>' + esc(entry.name) + '</span><small>' + count + '/' + entries.length + '</small></button>';
      }).join('') + '<button class="rl-tab rl-new" id="listNewBtn" type="button" aria-expanded="' + !el.newForm.classList.contains('hidden') + '">＋ New list</button>';
      el.name.textContent = list.name;
      el.progress.textContent = all.length ? done.length + ' of ' + all.length + ' done' : 'Empty so far';
      el.bar.style.setProperty('--rl-progress', (all.length ? Math.round(done.length / all.length * 100) : 0) + '%');
      const upNextId = undone.length ? undone[0].id : '';
      el.items.innerHTML = undone.length ? undone.map(item => itemHtml(item, s, upNextId)).join('') :
        '<li class="rl-empty">' + (all.length ? 'Everything on this list is done. Nice reading.' : 'Add a paper above: type its title, authors or DOI. Or bring in a list you already have with <b>Import</b>.') + '</li>';
      el.doneWrap.classList.toggle('hidden', !done.length);
      el.doneCount.textContent = done.length ? '(' + done.length + ')' : '';
      el.doneItems.innerHTML = done.map(item => itemHtml(item, s, '')).join('');
      if (editingId) {
        const field = page.querySelector('[data-rl-item="' + CSS.escape(editingId) + '"] .rl-editor ' + (store().items.find(item => item.id === editingId && item.done && !item.takeaway) ? '[name="takeaway"]' : '[name="note"]'));
        if (field && !field.dataset.focused) { field.dataset.focused = '1'; field.focus(); }
      }
    }

    function itemFromEvent(target) {
      const row = target.closest('[data-rl-item]');
      return row ? store().items.find(item => item.id === row.dataset.rlItem) || null : null;
    }
    function moveItem(item, direction) {
      const s = store(), undone = listItems(s, item.listId).filter(entry => !entry.done), index = undone.findIndex(entry => entry.id === item.id);
      if (index < 0 || direction < 0 && index === 0 || direction > 0 && index >= undone.length - 1) return;
      const target = direction < 0 ? index - 1 : index + 2;
      apply(next => L.move(next, item.id, target < undone.length ? undone[target].id : '', adapter.now()));
      status('Moved to ' + (index + direction + 1) + ' of ' + undone.length + '.');
      const grip = page.querySelector('[data-rl-item="' + CSS.escape(item.id) + '"] [data-rl-grip]');
      if (grip) grip.focus();
    }

    /* Drag to reorder: the handle follows a finger, mouse or Pencil, rows trade places
       as it passes their middle, and the page scrolls near the edges. Only the moved
       item's rank changes, so a reorder on one device merges with edits on another. */
    function rows() { return Array.from(el.items.children).filter(node => node.classList.contains('rl-item')); }
    function dragOffset() { return drag.y - drag.startY + (window.scrollY - drag.startScroll); }
    function dragUpdate() {
      const row = drag.row;
      let prev = row.previousElementSibling, next = row.nextElementSibling;
      while (prev && prev.classList.contains('rl-item')) {
        const box = prev.getBoundingClientRect();
        if (drag.y >= box.top + box.height / 2) break;
        // Neighbours move around the dragged row: moving the row itself would
        // detach its handle and the browser would drop the pointer capture.
        el.items.insertBefore(prev, row.nextElementSibling);
        drag.startY -= box.height;
        prev = row.previousElementSibling;
      }
      while (next && next.classList.contains('rl-item')) {
        const box = next.getBoundingClientRect();
        if (drag.y <= box.top + box.height / 2) break;
        el.items.insertBefore(next, row);
        drag.startY += box.height;
        next = row.nextElementSibling;
      }
      const offset = dragOffset();
      if (Math.abs(offset) > 3) drag.moved = true;
      row.style.transform = 'translateY(' + offset + 'px)';
    }
    function dragTick() {
      if (!drag) return;
      const edge = 80, top = drag.y, bottom = window.innerHeight - drag.y;
      const step = top < edge ? -Math.ceil((edge - top) / 6) : bottom < edge ? Math.ceil((edge - bottom) / 6) : 0;
      if (step) { window.scrollBy(0, step); dragUpdate(); }
      drag.frame = requestAnimationFrame(dragTick);
    }
    function dragEnd(cancelled) {
      if (!drag) return;
      const current = drag;
      drag = null;
      cancelAnimationFrame(current.frame);
      current.row.style.transform = '';
      current.row.classList.remove('is-dragging');
      el.items.classList.remove('is-sorting');
      document.documentElement.classList.remove('rl-dragging');
      const after = current.row.nextElementSibling, beforeId = after && after.classList.contains('rl-item') ? after.dataset.rlItem : '';
      if (cancelled || !current.moved || beforeId === current.beforeId) { refresh(); return; }
      apply(s => L.move(s, current.id, beforeId, adapter.now()));
      const order = rows().map(node => node.dataset.rlItem);
      status('Moved to ' + (order.indexOf(current.id) + 1) + ' of ' + order.length + '.');
    }
    el.items.addEventListener('pointerdown', event => {
      const grip = event.target.closest('[data-rl-grip]');
      if (!grip || drag || event.button > 0 || locked()) return;
      const row = grip.closest('.rl-item');
      if (!row || rows().length < 2) return;
      event.preventDefault();
      try { grip.setPointerCapture(event.pointerId); } catch (error) {}
      const after = row.nextElementSibling;
      drag = { id: row.dataset.rlItem, row: row, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, startScroll: window.scrollY, moved: false, frame: 0,
        beforeId: after && after.classList.contains('rl-item') ? after.dataset.rlItem : '' };
      row.classList.add('is-dragging');
      el.items.classList.add('is-sorting');
      document.documentElement.classList.add('rl-dragging');
      drag.frame = requestAnimationFrame(dragTick);
    });
    el.items.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      drag.y = event.clientY;
      dragUpdate();
    });
    el.items.addEventListener('pointerup', event => { if (drag && event.pointerId === drag.pointerId) dragEnd(false); });
    el.items.addEventListener('pointercancel', event => { if (drag && event.pointerId === drag.pointerId) dragEnd(true); });
    el.items.addEventListener('lostpointercapture', event => { if (drag && event.pointerId === drag.pointerId) dragEnd(false); });
    el.items.addEventListener('keydown', event => {
      const grip = event.target.closest('[data-rl-grip]');
      if (!grip || event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const item = itemFromEvent(grip);
      if (item) moveItem(item, event.key === 'ArrowUp' ? -1 : 1);
    });
    function setDone(item, done) {
      apply(s => L.upsertItem(s, { id: item.id, done: done }, adapter.now()));
      status(done ? 'Ticked off: ' + (item.title || 'item') + '.' : 'Back on the list.');
    }
    function removeItem(item) {
      apply(s => L.remove(s, item.id, adapter.now()));
      editingId = '';
      status('Removed “' + (item.title || 'item') + '”.');
    }
    function saveEditor(form, item) {
      const data = new FormData(form), changes = { id: item.id };
      ['title', 'authors', 'year', 'note', 'takeaway'].forEach(field => { if (data.has(field)) changes[field] = String(data.get(field) || ''); });
      if (data.has('ref')) {
        const ref = String(data.get('ref') || '').trim();
        changes.doi = L.cleanDoi(ref);
        changes.url = changes.doi ? item.url && ref.indexOf(item.url) >= 0 ? item.url : '' : L.cleanUrl(ref);
        if (changes.doi && item.url && item.doi !== changes.doi) changes.url = item.url;
      }
      if (data.has('paperId')) changes.paperId = String(data.get('paperId') || '');
      const moveTo = data.has('listId') ? String(data.get('listId') || '') : '';
      if (moveTo) changes.listId = moveTo;
      if (!changes.title && !(changes.doi || item.doi) && !(changes.url || item.url)) { status('Give it a title first.'); return; }
      editingId = '';
      if (apply(s => L.upsertItem(s, changes, adapter.now()))) status(moveTo ? 'Moved to another list.' : 'Saved.');
    }
    function exportList(kind) {
      const s = store(), list = currentList(s);
      if (!list) return;
      const items = listItems(s, list.id), text = kind === 'bib' ? L.toBibtex(items) : L.toMarkdown(list, items);
      const name = (list.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'reading-list') + (kind === 'bib' ? '.bib' : '.md');
      if (kind === 'copy') {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => status('Copied the list as Markdown.'), () => status('Copy was blocked. Use Export instead.'));
        return;
      }
      const type = kind === 'bib' ? 'application/x-bibtex' : 'text/markdown';
      const file = typeof File === 'function' ? new File([text], name, { type: type }) : null;
      if (adapter.native() && file && navigator.share) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
      const url = URL.createObjectURL(new Blob([text], { type: type })), link = document.createElement('a');
      link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    function createList(name, then) {
      name = String(name || '').trim();
      if (!name) return '';
      const id = adapter.uid('rl-');
      if (!apply(s => L.upsertList(s, { id: id, name: name }, adapter.now()), true)) return '';
      activeId = id; writeActive(id);
      if (then) then(id);
      refresh();
      return id;
    }

    page.addEventListener('click', event => {
      const target = event.target.closest('button, a');
      if (!target || !page.contains(target)) return;
      const item = itemFromEvent(target);
      if (target.dataset.rlList) { activeId = target.dataset.rlList; writeActive(activeId); editingId = ''; clearSearch(); status(''); refresh(); return; }
      if (target.matches('.rl-result')) { addFromResult(target); return; }
      if (target.dataset.rlOpen) { adapter.open(target.dataset.rlOpen); return; }
      if (target.id === 'listNewBtn') { const open = el.newForm.classList.toggle('hidden') === false; target.setAttribute('aria-expanded', String(open)); if (open) el.newName.focus(); return; }
      if (target.id === 'listImportBtn' || target.id === 'listFirstImport') { openImport(); return; }
      if (target.id === 'listAddBtn') { addTyped(); return; }
      if (target.id === 'listAddMore') { el.input.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.input.focus({ preventScroll: true }); return; }
      if (target.dataset.rlManage) {
        el.manage.open = false;
        const action = target.dataset.rlManage;
        if (action === 'rename') { el.renameForm.classList.remove('hidden'); el.renameInput.value = currentList().name; el.renameInput.focus(); el.renameInput.select(); }
        else if (action === 'delete') {
          const list = currentList(), count = listItems(store(), list.id).length;
          if (!confirm('Delete “' + list.name + '”' + (count ? ' and its ' + plural(count, 'item') : '') + '? Papers in your library stay.')) return;
          apply(s => L.remove(s, list.id, adapter.now()));
          activeId = ''; status('Deleted “' + list.name + '”.');
          refresh();
        } else exportList(action);
        return;
      }
      if (!item) return;
      if (target.hasAttribute('data-rl-grip')) return;
      if (target.hasAttribute('data-rl-edit')) { editingId = editingId === item.id ? '' : item.id; refresh(); }
      else if (target.hasAttribute('data-rl-cancel')) { editingId = ''; refresh(); }
      else if (target.hasAttribute('data-rl-remove')) removeItem(item);
      else if (target.dataset.rlLink) { apply(s => L.upsertItem(s, { id: item.id, paperId: target.dataset.rlLink }, adapter.now())); status('Linked to your library copy.'); }
      else if (target.hasAttribute('data-rl-read')) readItem(item);
      else if (target.hasAttribute('data-rl-peek')) togglePeek(item);
      else if (target.hasAttribute('data-rl-addpdf')) addPdfFor(item);
    });
    page.addEventListener('change', event => {
      if (!event.target.matches('[data-rl-done]')) return;
      const item = itemFromEvent(event.target);
      if (item) setDone(item, event.target.checked);
    });
    page.addEventListener('submit', event => {
      const form = event.target;
      event.preventDefault();
      if (form === el.newForm || form === el.firstForm) {
        const input = form === el.newForm ? el.newName : el.firstName;
        if (createList(input.value)) { input.value = ''; el.newForm.classList.add('hidden'); el.input.focus(); }
        return;
      }
      if (form === el.renameForm) {
        const name = el.renameInput.value.trim(), list = currentList();
        if (name && list) apply(s => L.upsertList(s, { id: list.id, name: name }, adapter.now()));
        el.renameForm.classList.add('hidden');
        return;
      }
      if (form.matches('[data-rl-editor]')) { const item = itemFromEvent(form); if (item) saveEditor(form, item); }
    });
    page.addEventListener('focusout', () => {
      if (!pendingRefresh) return;
      setTimeout(() => { if (pendingRefresh) render(); }, 0);
    });
    page.addEventListener('keydown', event => {
      if (event.key === 'Escape' && event.target.closest('[data-rl-editor]')) { editingId = ''; pendingRefresh = false; refresh(); }
      if (event.key === 'Escape' && event.target === el.renameInput) el.renameForm.classList.add('hidden');
    });
    el.input.addEventListener('input', () => { status(''); runSearch(false); });
    el.input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTyped();
      } else if (event.key === 'ArrowDown') {
        const first = el.results.querySelector('.rl-result:not([disabled])');
        if (first) { event.preventDefault(); first.focus(); }
      } else if (event.key === 'Escape') clearSearch();
    });
    el.results.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return;
      event.preventDefault();
      if (event.key === 'Escape') { el.input.focus(); return; }
      const buttons = Array.from(el.results.querySelectorAll('.rl-result:not([disabled])')), index = buttons.indexOf(document.activeElement);
      const next = buttons[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus(); else if (event.key === 'ArrowUp') el.input.focus();
    });

    /* ---------- import ---------- */
    function openImport() {
      importPreview = null;
      el.importText.value = '';
      el.importNotes.checked = false;
      el.importNotesRow.classList.add('hidden');
      el.importSummary.textContent = 'Paste a list or choose a file to see what Phloem finds.';
      el.importGo.disabled = true;
      renderImportTarget('');
      if (!el.dialog.open) el.dialog.showModal();
      setTimeout(() => el.importText.focus(), 0);
    }
    function renderImportTarget(title) {
      const s = store(), list = currentList(s);
      el.importTarget.innerHTML = (list ? '<option value="' + esc(list.id) + '">Add to “' + esc(list.name) + '”</option>' : '') +
        '<option value="__new">' + esc('New list' + (title ? ': ' + title : '')) + '</option>' +
        s.lists.filter(entry => !list || entry.id !== list.id).map(entry => '<option value="' + esc(entry.id) + '">Add to “' + esc(entry.name) + '”</option>').join('');
      // A titled document becomes its own list, unless the open list is still empty.
      const named = title && !s.lists.some(entry => entry.name === title);
      el.importTarget.value = !list || named && listItems(s, list.id).length ? '__new' : list.id;
    }
    function preview(text, filename) {
      const parsed = L.parseImport(text, filename);
      importPreview = parsed;
      const papersFound = parsed.items.length;
      const dois = parsed.items.filter(item => item.doi).length, done = parsed.items.filter(item => item.done).length, notes = parsed.items.filter(item => item.note).length;
      el.importNotesRow.classList.toggle('hidden', !notes);
      el.importSummary.textContent = parsed.items.length ? 'Found ' + plural(papersFound, 'paper') +
        (dois ? ' · ' + dois + ' with a DOI' : '') + (done ? ' · ' + done + ' already ticked' : '') + ' (' + ({ bibtex: 'BibTeX', ris: 'RIS', markdown: 'text' })[parsed.format] + ').' :
        text.trim() ? 'Phloem could not find any papers in that. Try one per line.' : 'Paste a list or choose a file to see what Phloem finds.';
      el.importGo.disabled = !parsed.items.length;
      renderImportTarget(parsed.title);
    }
    el.importText.addEventListener('input', () => preview(el.importText.value, ''));
    byId('listImportChoose').addEventListener('click', () => el.importFile.click());
    el.importFile.addEventListener('change', async () => {
      const file = el.importFile.files && el.importFile.files[0];
      el.importFile.value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { el.importSummary.textContent = 'That file is larger than 2 MB. Export just the list you need.'; return; }
      const text = await file.text();
      el.importText.value = text;
      preview(text, file.name);
    });
    el.importGo.addEventListener('click', () => {
      if (!importPreview || !importPreview.items.length) return;
      let target = el.importTarget.value;
      if (target === '__new') target = createList(importPreview.title || 'Imported list');
      if (!target) return;
      activeId = target; writeActive(target);
      // A list's own notes would tell you what to find before you have read a word; they stay out unless asked for.
      const keepNotes = el.importNotes.checked;
      const added = addEntries(importPreview.items.map(item => keepNotes ? item : Object.assign({}, item, { note: '' })), target);
      el.dialog.close();
      if (adapter.showPage) adapter.showPage('listsPage');
      if (!added) status('Everything in that list is already here.');
    });

    /* ---------- the reader's List tab ---------- */
    function panelList(s, paperId) {
      const linked = s.items.filter(item => item.paperId && adapter.resolve(item.paperId) === paperId);
      const pick = linked.find(item => item.listId === activeId) || linked.find(item => !item.done) || linked[0];
      const list = pick ? s.lists.find(entry => entry.id === pick.listId) : currentList(s);
      return { list: list || null, item: pick && list && pick.listId === list.id ? pick : null };
    }
    function renderPanel() {
      if (panelSaving) return;
      const tabPanel = byId('listPanel');
      if (!tabPanel || tabPanel.classList.contains('hidden')) return;
      const active = document.activeElement;
      if (active && panel.contains(active) && active.tagName === 'TEXTAREA') return;
      const s = store(), paperId = adapter.currentPaperId(), found = panelList(s, paperId), list = found.list;
      if (!list) {
        panel.innerHTML = '<div class="rl-panel-empty"><span class="panel-eyebrow">Reading list</span><h3>Read in order</h3><p class="hint">Line up papers in the order you want to read them, then tick them off here while you read.</p><button class="button" type="button" data-rl-panel-go>Start a reading list</button></div>';
        return;
      }
      const all = listItems(s, list.id), undone = all.filter(item => !item.done), done = all.length - undone.length;
      const hereIndex = found.item ? all.findIndex(item => item.id === found.item.id) : -1;
      const here = hereIndex >= 0 ? all[hereIndex] : null, position = hereIndex + 1;
      const next = undone.find(item => here && item.id !== here.id && all.indexOf(item) > hereIndex) || undone.find(item => !here || item.id !== here.id);
      const paper = adapter.paper(paperId);
      const guess = !here && paper ? all.find(item => !item.paperId && L.confidentMatch(item, [{ id: paper.id, title: paper.title, authors: paper.authors, sourceName: paper.sourceName, sourceUrl: paper.sourceUrl }])) : null;
      let html = '<div class="rl-panel-head"><span class="panel-eyebrow">Reading list</span>' +
        (s.lists.length > 1 ? '<select class="field rl-panel-select" data-rl-panel-list aria-label="Reading list">' + s.lists.map(entry => '<option value="' + esc(entry.id) + '"' + (entry.id === list.id ? ' selected' : '') + '>' + esc(entry.name) + '</option>').join('') + '</select>' : '<h3>' + esc(list.name) + '</h3>') +
        '<p class="hint">' + (all.length ? done + ' of ' + all.length + ' done' : 'Nothing on this list yet') + '</p></div>';
      if (here) {
        html += '<section class="rl-panel-card" data-rl-item="' + esc(here.id) + '"><div class="rl-panel-card-head"><span>This paper · ' + position + ' of ' + all.length + '</span>' +
          '<label class="rl-panel-done"><input type="checkbox" data-rl-done' + (here.done ? ' checked' : '') + '> Done</label></div>' +
          '<label class="rl-panel-field"><span>My question</span><textarea class="field" rows="3" data-rl-field="note" placeholder="What do you want to find out, or what do you predict?">' + esc(here.note) + '</textarea></label>' +
          '<label class="rl-panel-field"><span>Takeaway</span><textarea class="field" rows="2" data-rl-field="takeaway" placeholder="From memory: what did they find, and what surprised you?">' + esc(here.takeaway) + '</textarea></label></section>';
      } else if (paperId && paper) {
        html += '<section class="rl-panel-card rl-panel-add"><p>This paper is not on “' + esc(list.name) + '”.</p>' +
          (guess ? '<button class="soft-button" type="button" data-rl-panel-link="' + esc(guess.id) + '">It is “' + esc(guess.title.slice(0, 60)) + '”: link it</button>' : '') +
          '<button class="soft-button" type="button" data-rl-panel-add>＋ Add this paper</button></section>';
      }
      if (next) {
        const nextPaper = paperFor(next);
        html += '<section class="rl-panel-next" data-rl-item="' + esc(next.id) + '"><span class="panel-eyebrow">Up next</span><b>' + esc(next.title || next.doi) + '</b>' +
          (next.note ? '<p>' + esc(next.note) + '</p>' : '') + noticeHtml(next) +
          '<button class="soft-button" type="button" data-rl-read' + (fetching.has(next.id) ? ' disabled' : '') + '>' + (nextPaper ? 'Open next →' : 'Read next →') + '</button></section>';
      }
      html += '<ol class="rl-panel-list">' + all.map(item => {
        const current = here && item.id === here.id;
        return '<li class="' + [item.done ? 'is-done' : '', current ? 'is-current' : ''].filter(Boolean).join(' ') + '" data-rl-item="' + esc(item.id) + '"><label class="rl-check"><input type="checkbox" data-rl-done' + (item.done ? ' checked' : '') + '><span class="sr-only">Done: ' + esc(item.title) + '</span></label>' +
          (!current ? '<button class="rl-panel-open" type="button" data-rl-read>' + esc(item.title || item.doi || 'Untitled') + '</button>' : '<span>' + esc(item.title || item.doi) + ' <em>· reading</em></span>') + '</li>';
      }).join('') + '</ol><button class="text-button rl-panel-all" type="button" data-rl-panel-go>Open the full list →</button>';
      panel.innerHTML = html;
    }
    let panelTimer = 0;
    panel.addEventListener('input', event => {
      const field = event.target.dataset.rlField, item = itemFromEvent(event.target);
      if (!field || !item) return;
      clearTimeout(panelTimer);
      const value = event.target.value;
      panelTimer = setTimeout(() => {
        panelSaving = true;
        try { apply(s => L.upsertItem(s, { id: item.id, [field]: value }, adapter.now()), true); } finally { panelSaving = false; }
      }, 400);
    });
    panel.addEventListener('focusout', event => {
      if (!event.target.dataset.rlField) return;
      clearTimeout(panelTimer);
      const item = itemFromEvent(event.target), field = event.target.dataset.rlField;
      if (item && item[field] !== event.target.value) {
        panelSaving = true;
        try { apply(s => L.upsertItem(s, { id: item.id, [field]: event.target.value }, adapter.now()), true); } finally { panelSaving = false; }
      }
    });
    panel.addEventListener('change', event => {
      if (event.target.matches('[data-rl-panel-list]')) { activeId = event.target.value; writeActive(activeId); renderPanel(); return; }
      if (!event.target.matches('[data-rl-done]')) return;
      const item = itemFromEvent(event.target);
      if (item) apply(s => L.upsertItem(s, { id: item.id, done: event.target.checked }, adapter.now()));
    });
    panel.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target) return;
      if (target.hasAttribute('data-rl-panel-go')) { adapter.showPage('listsPage'); return; }
      if (target.hasAttribute('data-rl-read')) { const item = itemFromEvent(target); if (item) readItem(item); return; }
      if (target.hasAttribute('data-rl-addpdf')) { const item = itemFromEvent(target); if (item) addPdfFor(item); return; }
      if (target.dataset.rlOpen) { adapter.open(target.dataset.rlOpen); return; }
      const paperId = adapter.currentPaperId(), paper = adapter.paper(paperId), list = panelList(store(), paperId).list;
      if (target.dataset.rlPanelLink) { apply(s => L.upsertItem(s, { id: target.dataset.rlPanelLink, paperId: paperId }, adapter.now())); return; }
      if (target.hasAttribute('data-rl-panel-add') && paper && list) addEntries([{ kind: 'paper', paperId: paperId, title: paper.title, authors: paper.authors }], list.id, { quiet: true });
    });

    /* ---------- "＋ Reading list" on a library paper's card ---------- */
    function paperControl(paperId) {
      const wrap = document.createElement('details');
      wrap.className = 'cover-list-add';
      function draw(message) {
        const s = store(), paper = adapter.paper(paperId);
        if (!paper) return;
        const onLists = s.lists.filter(list => onList(s, list.id, { paperId: paper.id, title: paper.title }));
        wrap.innerHTML = '<summary class="soft-button" aria-label="Add ' + esc(paper.title) + ' to a reading list">' +
          (message ? esc(message) : onLists.length ? '✓ On ' + (onLists.length === 1 ? '“' + esc(onLists[0].name) + '”' : onLists.length + ' lists') : '＋ Reading list') + '</summary>' +
          '<div class="cover-list-menu" role="menu">' + s.lists.map(list => {
            const there = onLists.indexOf(list) >= 0;
            return '<button type="button" role="menuitem" data-rl-card-list="' + esc(list.id) + '"' + (there ? ' disabled' : '') + '>' + (there ? '✓ ' : '＋ ') + esc(list.name) + '</button>';
          }).join('') + (s.lists.length ? '<span class="rl-manage-rule" aria-hidden="true"></span>' : '') +
          '<form class="cover-list-new" data-rl-card-new><input class="field" maxlength="120" placeholder="New list name" aria-label="New list name" autocomplete="off"><button class="soft-button" type="submit">Add</button></form></div>';
      }
      function addTo(listId) {
        const paper = adapter.paper(paperId);
        if (!paper || !listId) return;
        const list = store().lists.find(entry => entry.id === listId);
        addEntries([{ kind: 'paper', paperId: paper.id, title: paper.title, authors: paper.authors }], listId, { quiet: true });
        wrap.open = false;
        draw('✓ Added to “' + (list ? list.name : 'list') + '”');
      }
      wrap.addEventListener('click', event => {
        const button = event.target.closest('[data-rl-card-list]');
        if (button) addTo(button.dataset.rlCardList);
      });
      wrap.addEventListener('submit', event => {
        event.preventDefault();
        const input = event.target.querySelector('input');
        const id = createList(input && input.value);
        if (id) addTo(id);
      });
      wrap.addEventListener('toggle', () => { if (wrap.open) { const input = wrap.querySelector('.cover-list-new input'); if (input && !store().lists.length) input.focus(); } });
      draw('');
      return wrap;
    }

    function refresh() { render(); renderPanel(); }
    return Object.freeze({ refresh: refresh, render: render, renderPanel: renderPanel, openImport: openImport, paperControl: paperControl });
  }

  window.PhloemListsView = Object.freeze({ create: create });
})();
