/* Shelves: where a paper sits in the library, by the kind of document it is. Data only: no
   DOM, storage or network. A shelf is stored as the paper's plain `category`, so older
   versions of Phloem show a shelf as a category, and the field already syncs with its own
   clock. The rules read only what a paper says about itself (a DOI, journal lines, an
   ISBN, its title, file name and length), so they need no AI and give the same answer on
   every device. Topics belong in reading lists; a shelf says what kind of thing it is. */
(function (global) {
  'use strict';

  var PAPERS = 'Papers', BOOKS = 'Books & textbooks', COURSE = 'Course notes', NOTES = 'My notes & meetings', ADMIN = 'Personal & admin';
  var SHELVES = [PAPERS, BOOKS, COURSE, NOTES, ADMIN];
  var REVIEW = 'In review', UNSORTED = 'Unsorted';
  // When two shelves score the same, the more particular kind wins.
  var TIE_ORDER = [ADMIN, COURSE, NOTES, BOOKS, PAPERS];

  function text(value) { return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value); }
  function squash(value) { return text(value).replace(/\s+/g, ' ').trim(); }
  function lower(value) { return squash(value).toLowerCase(); }
  function fold(value) {
    var out = text(value);
    try { out = out.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (error) {}
    return out.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function count(value) { return Array.isArray(value) ? value.length : 0; }

  /* ---------- Shelf names ---------- */
  function shelfName(value) {
    var key = lower(value);
    for (var i = 0; i < SHELVES.length; i++) if (SHELVES[i].toLowerCase() === key) return SHELVES[i];
    return '';
  }
  function isReview(value) { var key = lower(value); return key === REVIEW.toLowerCase() || key === 'under review'; }
  function isUnsorted(value) { var key = lower(value); return !key || key === UNSORTED.toLowerCase(); }
  /* Categories that already named a kind of document map onto that shelf; anything else
     is a topic, which the tidy offers to keep as a reading list. */
  var KIND_CATEGORIES = [
    [PAPERS, /^(?:academic|papers?|articles?|journal articles?|research(?: papers?)?|literature|publications?|preprints?)$/],
    [BOOKS, /^(?:books?|textbooks?|text books?|e-?books?|handbooks?|manuals?|reference)$/],
    [COURSE, /^(?:courses?|course ?notes|coursework|class(?:es| notes)?|lectures?|lecture notes|teaching)$/],
    [NOTES, /^(?:notes|my notes|meetings?|meeting notes|minutes|drafts?|my drafts|writing)$/],
    [ADMIN, /^(?:non-?academic|non academic|personal|admin|administration|paperwork|forms?|documents?|docs|misc|miscellaneous|other)$/]
  ];
  function kindCategory(value) {
    var key = lower(value).replace(/_+/g, ' ');
    if (!key) return '';
    if (shelfName(key)) return shelfName(key);
    for (var i = 0; i < KIND_CATEGORIES.length; i++) if (KIND_CATEGORIES[i][1].test(key)) return KIND_CATEGORIES[i][0];
    return '';
  }
  function isTopic(value) { return !isUnsorted(value) && !isReview(value) && !kindCategory(value); }

  /* ---------- What a paper says about itself ---------- */
  function cleanDoi(value) {
    var match = text(value).match(/\b10\.\d{4,9}\/[^\s"<>]+/i);
    if (!match) return '';
    var doi = match[0].replace(/[.,;:'"\])}>]+$/, '');
    while (/\)$/.test(doi) && (doi.match(/\(/g) || []).length < (doi.match(/\)/g) || []).length) doi = doi.slice(0, -1);
    return doi.length <= 200 ? doi.toLowerCase() : '';
  }
  function isbnValid(digits) {
    var i, sum = 0;
    if (/^\d{9}[\dX]$/.test(digits)) {
      for (i = 0; i < 10; i++) sum += (digits[i] === 'X' ? 10 : +digits[i]) * (10 - i);
      return sum % 11 === 0;
    }
    if (/^97[89]\d{10}$/.test(digits)) {
      for (i = 0; i < 13; i++) sum += +digits[i] * (i % 2 ? 3 : 1);
      return sum % 10 === 0;
    }
    return false;
  }
  function isbnIn(value) {
    var pattern = /\bISBN(?:-1[03])?\s*:?\s*((?:[\dXx][\s-]?){9,16}[\dXx])/g, match;
    while ((match = pattern.exec(text(value)))) {
      var digits = match[1].replace(/[\s-]/g, '').toUpperCase();
      if (digits.length > 13) digits = digits.slice(0, 13);
      if (isbnValid(digits) || isbnValid(digits.slice(0, 10))) return digits;
    }
    return '';
  }
  function arxivIn(value) { var match = text(value).match(/\barxiv\s*:\s*(\d{4}\.\d{4,5})(?:v\d+)?\b/i); return match ? match[1] : ''; }

  var SCHOLARLY_HOSTS = /(?:^|\.)(?:doi\.org|europepmc\.org|arxiv\.org|biorxiv\.org|medrxiv\.org|ncbi\.nlm\.nih\.gov|pubmed|sciencedirect\.com|springer(?:link)?\.com|link\.springer\.com|wiley\.com|academic\.oup\.com|oup\.com|nature\.com|frontiersin\.org|mdpi\.com|plos\.org|pnas\.org|cell\.com|tandfonline\.com|sagepub\.com|acs\.org|rsc\.org|ieee\.org|jstor\.org|science\.org|elifesciences\.org|biomedcentral\.com|annualreviews\.org|cambridge\.org|iop\.org|aip\.org|plantphysiol\.org|researchgate\.net|semanticscholar\.org)$/i;
  function host(value) { var match = text(value).match(/^https?:\/\/([^/?#:]+)/i); return match ? match[1].toLowerCase() : ''; }

  var ADMIN_TITLE = /\b(?:enrol(?:l)?ment|proof of|immigration|visas?|study permit|work permit|permits?|sponsorship|passports?|invoices?|receipts?|payslips?|pay stubs?|tuition|transcripts?|certificates?|insurance|lease|tenancy|taxes|tax return|t2202|reimbursements?|expense claims?|travel claims?|itinerar(?:y|ies)|boarding pass|offer letter|letters? of (?:offer|support|recommendation|reference|invitation|employment|acceptance)|reference letters?|recommendation letters?|ircc|osap|bank statements?|curriculum vitae|cv|r[ée]sum[ée]|application forms?|consent forms?|registration forms?|scholarship applications?|funding applications?|timesheets?|admission letters?)\b/i;
  var FORM_TITLE = /(?:^|\s)forms?$|^form\s+[a-z]{0,5}[\s-]?\d/i;
  var COURSE_CODE = /\b[A-Z]{2,5}[ _-]?(?!(?:19|20)\d\d\b)\d{3,4}[A-Z]?\b/;
  var COURSE_WORDS = /\b(?:lectures?|lec\s?\d+|slides|tutorials?|assignments?|homework|hw\s?\d+|problem sets?|psets?|midterms?|final exams?|exams?|quiz(?:zes)?|syllabus|course outline|lab manual|lab reports?|class notes|course notes|week \d+|module \d+)\b/i;
  var NOTES_TITLE = /\b(?:meetings?|minutes|agenda|supervisor|supervision|committee meeting|one[- ]on[- ]one|check[- ]in|catch[- ]up|status (?:overview|update|report)|progress (?:update|report|notes?)|weekly update|to-?do|my notes|reading notes|lab notebook|brainstorm(?:ing)?|ideas|plan|planning|draft|fixes|journal entry)\b/i;
  var BOOK_TITLE = /\b(?:textbooks?|handbooks?|manual|guide|guidebook|field guide|\d+(?:st|nd|rd|th) edition|edition|encyclop(?:a)?edia|introduction to|principles of|fundamentals of|essentials of|companion to|chapters?)\b/i;
  var THESIS_TITLE = /\b(?:thesis|dissertation)\b/i;
  var JOURNAL_LINES = [/\babstract\b/i, /\bkey ?words?\b/i, /\b(?:received|accepted|published(?: online)?)\b[^.\n]{0,40}\b(?:19|20)\d\d\b/i, /\b(?:journal|proceedings|vol\.|volume \d+|pp\.\s*\d)/i, /\bcorresponding author\b|\bcorrespondence\b/i, /©\s*(?:19|20)\d\d|\bcopyright\b/i];

  function fileStem(value) { return text(value).replace(/\.(?:pdf|docx?|txt)$/i, '').replace(/[_]+/g, ' ').trim(); }

  /* Scores each shelf from what is known and returns the best, with the first reason that
     counted for it. `hints.text` is the opening pages' text when this device has it. */
  function classify(paper, hints) {
    paper = paper || {}; hints = hints || {};
    var scores = {}, reasons = {};
    SHELVES.forEach(function (shelf) { scores[shelf] = 0; reasons[shelf] = []; });
    function add(shelf, points, reason) { scores[shelf] += points; if (reason) reasons[shelf].push(reason); }
    var title = squash(paper.title), stem = fileStem(paper.sourceName), name = title + ' • ' + stem, opening = text(hints.text).slice(0, 12000);
    var pdf = paper.kind === 'pdf', docx = paper.sourceType === 'docx', pages = +hints.pages || +paper.pageCount || 0;
    var doi = cleanDoi(paper.doi) || cleanDoi(hints.doi) || cleanDoi(opening.slice(0, 5000)) || cleanDoi(paper.sourceUrl);
    var isbn = text(hints.isbn) || isbnIn(opening), arxiv = arxivIn(opening.slice(0, 5000)) || (/arxiv\.org\/(?:abs|pdf)\//i.test(text(paper.sourceUrl)) ? 'url' : '');
    var site = host(paper.sourceUrl), legacy = kindCategory(paper.category);

    var adminWord = name.match(ADMIN_TITLE);
    if (adminWord) add(ADMIN, 5, 'the title says “' + adminWord[0] + '”');
    else if (FORM_TITLE.test(title) || FORM_TITLE.test(stem)) add(ADMIN, 5, 'it is a form');
    var code = title.match(COURSE_CODE) || stem.match(COURSE_CODE), courseWord = name.match(COURSE_WORDS);
    if (code && courseWord) add(COURSE, 6, 'course ' + code[0] + ', ' + courseWord[0].toLowerCase());
    else if (courseWord) add(COURSE, 3, 'the title says “' + courseWord[0] + '”');
    else if (code) add(COURSE, 2, 'course code ' + code[0]);
    var noteWord = name.match(NOTES_TITLE);
    if (noteWord) add(NOTES, 5, 'the title says “' + noteWord[0] + '”');
    if (docx) add(NOTES, 2, 'a Word draft of your own');
    else if (!pdf && !paper.sourceUrl && !squash(paper.authors)) add(NOTES, 2, 'text you pasted in');
    if (isbn) add(BOOKS, 6, 'it has an ISBN');
    var bookWord = name.match(BOOK_TITLE);
    if (bookWord) add(BOOKS, 3, 'the title says “' + bookWord[0] + '”');
    if (pdf && pages >= 150) add(BOOKS, 4, pages + ' pages long');
    else if (pdf && pages >= 80 && !doi) add(BOOKS, 2, pages + ' pages long');
    if (doi) add(PAPERS, 5, 'it has a DOI');
    if (arxiv) add(PAPERS, 5, 'it is on arXiv');
    if (/europepmc\.org/i.test(site)) add(PAPERS, 5, 'it came from Europe PMC');
    else if (site && SCHOLARLY_HOSTS.test(site)) add(PAPERS, 4, 'it came from ' + site.replace(/^www\./, ''));
    var journal = JOURNAL_LINES.filter(function (pattern) { return pattern.test(opening.slice(0, 6000)); }).length;
    if (journal >= 2) add(PAPERS, Math.min(4, journal), 'its first page reads like a journal article');
    if (THESIS_TITLE.test(title)) add(PAPERS, 5, 'a thesis');
    if (/\bet al\b/i.test(text(paper.authors)) || squash(paper.authors).split(/\s*(?:,|;|&|\band\b)\s*/).filter(Boolean).length >= 3) add(PAPERS, 1, 'several authors');
    if (legacy === PAPERS) add(PAPERS, 2, 'it was under “' + squash(paper.category) + '”');
    else if (legacy === ADMIN) add(ADMIN, 3, 'it was under “' + squash(paper.category) + '”');
    else if (legacy) add(legacy, 4, 'it was under “' + squash(paper.category) + '”');

    var best = '', top = 0;
    TIE_ORDER.forEach(function (shelf) { if (scores[shelf] > top) { top = scores[shelf]; best = shelf; } });
    if (!best) {
      best = pdf ? PAPERS : NOTES;
      return { shelf: best, reason: pdf ? 'most PDFs here are papers' : 'notes of your own', doi: doi, isbn: isbn, scores: scores };
    }
    return { shelf: best, reason: reasons[best][0] || '', doi: doi, isbn: isbn, scores: scores };
  }

  /* ---------- Duplicates and placeholders ---------- */
  var PLACEHOLDER_TITLE = /^recovered (?:paper|word draft) \d+$/i;
  function isPlaceholder(paper) {
    if (!paper || !PLACEHOLDER_TITLE.test(squash(paper.title))) return false;
    return (paper.tags || []).some(function (tag) { return lower(tag) === 'recovered'; }) || /^recovered-/i.test(text(paper.sourceName));
  }
  // Notes, highlights, strokes and answers a reader made on this copy.
  function marks(paper) {
    var total = 0;
    function each(map) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (key) {
        var value = map[key];
        if (Array.isArray(value)) total += value.length;
        else if (typeof value === 'string' && value.trim()) total++;
        else if (value && typeof value === 'object' && Array.isArray(value.strokes)) total += value.strokes.length;
      });
    }
    paper = paper || {};
    each(paper.highlights); each(paper.notes); each(paper.pageNotes); each(paper.readerNotes); each(paper.pdfInk); each(paper.pdfStickies);
    total += count(paper.textHighlights) + count(paper.readerHighlights) + count(paper.questions) + count(paper.reviewComments) + count(paper.readingExcerpts);
    return total;
  }
  var GENERIC_TITLE = /^(?:untitled|unknown|document|paper|article|draft|notes?|scan|file|download|main|manuscript|recovered (?:paper|word draft) \d+)(?: \d+)?$/;
  function titleKey(paper) {
    var key = fold(paper && paper.title);
    if (key.length < 16 || key.split(' ').length < 3 || GENERIC_TITLE.test(key)) return '';
    return key;
  }
  function sameKind(a, b) { return (a.kind === 'pdf') === (b.kind === 'pdf') && (a.sourceType === 'docx') === (b.sourceType === 'docx'); }
  function suggestedKeep(group) {
    return group.slice().sort(function (a, b) {
      return (b.kind === 'pdf') - (a.kind === 'pdf') || marks(b) - marks(a) || (+a.addedAt || 0) - (+b.addedAt || 0) || text(a.id).localeCompare(text(b.id));
    })[0];
  }
  /* Copies that are the same paper: one DOI, one PDF fingerprint, or one normalised title.
     `hints[id]` may add a DOI read from the text or a fingerprint of the file on this
     device. Nothing here decides; the reader ticks what to merge or remove. */
  function duplicateGroups(papers, hints) {
    hints = hints || {};
    var list = (papers || []).filter(function (paper) { return paper && paper.id && !isReview(paper.category); });
    var parent = list.map(function (_, index) { return index; }), why = list.map(function () { return {}; });
    function root(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function unite(a, b, reason) { a = root(a); b = root(b); if (a !== b) parent[b] = a; why[a][reason] = true; Object.keys(why[b]).forEach(function (key) { why[a][key] = true; }); }
    var seen = { doi: {}, file: {}, title: {} };
    list.forEach(function (paper, index) {
      var hint = hints[paper.id] || {};
      var keys = { doi: cleanDoi(paper.doi) || cleanDoi(hint.doi), file: text(paper.contentHash) || text(hint.hash), title: titleKey(paper) };
      Object.keys(keys).forEach(function (kind) {
        var value = keys[kind];
        if (!value) return;
        if (seen[kind][value] !== undefined) unite(seen[kind][value], index, kind);
        else seen[kind][value] = index;
      });
    });
    var groups = {};
    list.forEach(function (paper, index) { var r = root(index); (groups[r] = groups[r] || []).push(paper); });
    return Object.keys(groups).filter(function (key) { return groups[key].length > 1; }).map(function (key) {
      var group = groups[key], reasons = why[root(+key)], files = {};
      group.forEach(function (paper) { var hash = text(paper.contentHash) || text((hints[paper.id] || {}).hash); if (hash) files[hash] = true; });
      return {
        ids: group.map(function (paper) { return paper.id; }),
        keep: suggestedKeep(group).id,
        why: ['doi', 'file', 'title'].filter(function (reason) { return reasons[reason]; }),
        sameFile: Object.keys(files).length === 1 && group.every(function (paper) { return text(paper.contentHash) || text((hints[paper.id] || {}).hash); })
      };
    });
  }

  /* ---------- Reading lists as a grouping ---------- */
  /* Groups library papers by the reading lists they are linked from, in the lists' own
     order; a paper on two lists shows under both. Papers on no list come last. */
  function byList(papers, store, resolve) {
    resolve = resolve || function (id) { return id; };
    var present = {}, onList = {}, groups = [];
    (papers || []).forEach(function (paper) { present[paper.id] = paper; });
    var lists = store && Array.isArray(store.lists) ? store.lists.slice() : [], items = store && Array.isArray(store.items) ? store.items : [];
    lists.forEach(function (list) {
      var ids = [], have = {};
      items.forEach(function (item) {
        if (!item || item.listId !== list.id || !item.paperId) return;
        var id = resolve(item.paperId);
        if (present[id] && !have[id]) { have[id] = true; ids.push(id); onList[id] = true; }
      });
      if (ids.length) groups.push({ listId: list.id, name: squash(list.name) || 'Reading list', ids: ids });
    });
    var rest = (papers || []).filter(function (paper) { return !onList[paper.id]; }).map(function (paper) { return paper.id; });
    return { lists: groups, unlisted: rest };
  }

  /* ---------- The tidy ---------- */
  function shelfOrder(order, keepAsShelves, review) {
    var out = [], seen = {};
    function push(label) { var key = lower(label); if (label && !seen[key]) { seen[key] = true; out.push(label); } }
    if (review) push(REVIEW);
    SHELVES.forEach(push);
    (order || []).forEach(function (label) { if (keepAsShelves[lower(label)]) push(squash(label)); });
    Object.keys(keepAsShelves).forEach(function (key) { push(keepAsShelves[key]); });
    return out;
  }
  /* What a tidy would do, for the preview. Nothing is decided for the reader that loses
     anything: duplicates and placeholders start unticked, and a topic becomes a reading
     list (or stays a shelf) only as chosen. */
  function plan(input) {
    input = input || {};
    var papers = (input.papers || []).filter(function (paper) { return paper && paper.id; }), hints = input.hints || {};
    var lists = input.lists || [], topics = {}, topicOrder = [], rows = [], review = false;
    papers.forEach(function (paper) {
      var current = squash(paper.category), hint = hints[paper.id] || {};
      if (isReview(current)) { review = true; rows.push({ id: paper.id, title: squash(paper.title) || 'Untitled', from: current, to: REVIEW, reason: 'manuscripts in review stay where they are', review: true, topic: '' }); return; }
      var guess = classify(paper, hint), to = shelfName(current) || guess.shelf, topic = '';
      if (isTopic(current)) {
        topic = lower(current);
        if (!topics[topic]) {
          var match = lists.find(function (list) { return lower(list.name) === topic; });
          topics[topic] = { key: topic, label: current, ids: [], name: match ? squash(match.name) : current, listId: match ? match.id : '' };
          topicOrder.push(topic);
        }
        topics[topic].ids.push(paper.id);
      }
      rows.push({ id: paper.id, title: squash(paper.title) || 'Untitled', from: isUnsorted(current) ? '' : current, to: to, reason: shelfName(current) ? 'already on this shelf' : guess.reason, review: false, topic: topic, doi: guess.doi });
    });
    var duplicates = duplicateGroups(papers, hints), inGroup = {};
    duplicates.forEach(function (group) { group.ids.forEach(function (id) { inGroup[id] = true; }); });
    var placeholders = papers.filter(function (paper) { return isPlaceholder(paper) && !inGroup[paper.id]; }).map(function (paper) {
      return { id: paper.id, title: squash(paper.title), pages: +paper.pageCount || 0, size: +paper.fileSize || 0, marks: marks(paper), kind: paper.kind === 'pdf' ? 'pdf' : 'text' };
    });
    return {
      rows: rows,
      topics: topicOrder.map(function (key) { return topics[key]; }),
      duplicates: duplicates,
      placeholders: placeholders,
      review: review,
      order: shelfOrder(input.order, {}, review)
    };
  }
  /* Whether a library would gain from a tidy: papers off a shelf, old or topic categories,
     duplicates or placeholders. */
  function needsTidy(papers, hints) {
    var list = (papers || []).filter(Boolean);
    if (list.some(function (paper) { var current = squash(paper.category); return !isReview(current) && !shelfName(current) && (isUnsorted(current) || !!kindCategory(current) || isTopic(current)); })) return true;
    if (list.some(isPlaceholder)) return true;
    return duplicateGroups(list, hints).length > 0;
  }

  global.PhloemShelves = Object.freeze({
    SHELVES: Object.freeze(SHELVES.slice()), PAPERS: PAPERS, BOOKS: BOOKS, COURSE: COURSE, NOTES: NOTES, ADMIN: ADMIN, REVIEW: REVIEW, UNSORTED: UNSORTED,
    shelfName: shelfName, kindCategory: kindCategory, isTopic: isTopic, isReview: isReview, isUnsorted: isUnsorted,
    classify: classify, cleanDoi: cleanDoi, isbnIn: isbnIn,
    isPlaceholder: isPlaceholder, marks: marks, sameKind: sameKind, duplicateGroups: duplicateGroups,
    byList: byList, shelfOrder: shelfOrder, plan: plan, needsTidy: needsTidy
  });
})(typeof window !== 'undefined' ? window : globalThis);
