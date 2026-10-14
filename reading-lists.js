/* Reading lists: named, ordered lists of papers to read. Data only: no DOM,
   network, or storage access. Lists and items carry their own clocks and merge record by
   record, so a tick on the iPad and a reorder on the Mac both survive a sync. */
(function (global) {
  'use strict';

  var VERSION = 1;
  var FUTURE_WINDOW = 366 * 24 * 60 * 60 * 1000;
  var MAX_LISTS = 200, MAX_ITEMS = 5000, MAX_TOMBSTONES = 4000, MAX_IMPORT = 500;
  var LIMIT = { name: 120, title: 500, authors: 600, venue: 300, note: 2000, takeaway: 2000, url: 2000, doi: 200 };
  var FORBIDDEN_IDS = Object.create(null);
  FORBIDDEN_IDS.__proto__ = true;
  FORBIDDEN_IDS.constructor = true;
  FORBIDDEN_IDS.prototype = true;
  var STOPWORDS = {};
  ('a an and are as at be by for from in into is it of on or the to with its their this that via using under over between'
    + ' toward towards pdf').split(' ').forEach(function (word) { STOPWORDS[word] = true; });

  function owns(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function id(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 && !owns(FORBIDDEN_IDS, value);
  }
  function ceiling() {
    var now = Date.now();
    if (!integer(now)) now = 0;
    return Math.min(Number.MAX_SAFE_INTEGER - 1, now + FUTURE_WINDOW);
  }
  function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function fail(message, code) { var error = new Error(message); error.code = code || 'INVALID'; throw error; }
  function line(value, max) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }
  function prose(value, max) {
    return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
  }

  function cleanDoi(value) {
    var text = String(value || '');
    try { text = decodeURIComponent(text); } catch (error) {}
    var match = text.match(/\b10\.\d{4,9}\/[^\s"<>]+/i);
    if (!match) return '';
    var doi = match[0].replace(/[.,;:'"\])}>]+$/, '');
    // A DOI quoted inside parentheses keeps a closing bracket only when it opened one.
    while (/\)$/.test(doi) && (doi.match(/\(/g) || []).length < (doi.match(/\)/g) || []).length) doi = doi.slice(0, -1);
    return doi.length <= LIMIT.doi ? doi.toLowerCase() : '';
  }
  function cleanUrl(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    return text.length <= LIMIT.url && /^https?:\/\/[^\s<>"]+$/i.test(text) ? text : '';
  }
  function cleanYear(value) {
    var match = String(value === undefined || value === null ? '' : value).match(/\b(1[5-9]\d\d|2[01]\d\d)\b/);
    return match ? match[1] : '';
  }

  function empty() { return { version: VERSION, lists: [], items: [], deleted: {} }; }
  function checkVersion(value) {
    if (value === undefined) return;
    if (value !== VERSION) {
      var error = new Error('Unsupported reading-list version');
      error.code = 'UNSUPPORTED_VERSION';
      error.version = value;
      throw error;
    }
  }

  function normalizeList(record, cap) {
    if (!object(record) || !id(record.id)) return null;
    var createdAt = integer(record.createdAt) && record.createdAt <= cap ? record.createdAt : 0;
    var updatedAt = integer(record.updatedAt) && record.updatedAt <= cap ? record.updatedAt : 0;
    if (!updatedAt) return null;
    return {
      id: record.id,
      name: line(record.name, LIMIT.name) || 'Reading list',
      rank: finite(record.rank) ? record.rank : 0,
      createdAt: Math.min(createdAt || updatedAt, updatedAt),
      updatedAt: updatedAt
    };
  }
  function normalizeItem(record, cap) {
    if (!object(record) || !id(record.id) || !id(record.listId)) return null;
    var updatedAt = integer(record.updatedAt) && record.updatedAt <= cap ? record.updatedAt : 0;
    if (!updatedAt) return null;
    var createdAt = integer(record.createdAt) && record.createdAt <= cap ? record.createdAt : updatedAt;
    var item = {
      id: record.id,
      listId: record.listId,
      kind: 'paper',
      title: line(record.title, LIMIT.title),
      authors: line(record.authors, LIMIT.authors),
      year: cleanYear(record.year),
      venue: line(record.venue, LIMIT.venue),
      doi: cleanDoi(record.doi),
      url: cleanUrl(record.url),
      paperId: id(record.paperId) ? record.paperId : '',
      note: prose(record.note, LIMIT.note),
      takeaway: prose(record.takeaway, LIMIT.takeaway),
      done: record.done === true,
      doneAt: record.done === true && integer(record.doneAt) && record.doneAt <= cap ? record.doneAt : 0,
      rank: finite(record.rank) ? record.rank : 0,
      createdAt: Math.min(createdAt, updatedAt),
      updatedAt: updatedAt
    };
    if (!item.title && !item.doi && !item.url) return null;
    return item;
  }
  function byRank(a, b) { return compare(a.rank, b.rank) || compare(a.createdAt, b.createdAt) || compare(a.id, b.id); }
  function tieKey(record) { return JSON.stringify(record); }
  function newer(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
    return tieKey(a) >= tieKey(b) ? a : b;
  }
  function pruneTombstones(deleted) {
    var keys = Object.keys(deleted);
    if (keys.length <= MAX_TOMBSTONES) return deleted;
    keys.sort(function (a, b) { return deleted[b] - deleted[a] || compare(a, b); });
    var kept = {};
    keys.slice(0, MAX_TOMBSTONES).forEach(function (key) { kept[key] = deleted[key]; });
    return kept;
  }
  function assemble(lists, items, deleted) {
    var listOut = [], itemOut = [];
    Object.keys(lists).forEach(function (key) {
      var list = lists[key];
      if (!(deleted[key] >= list.updatedAt)) listOut.push(list);
    });
    Object.keys(items).forEach(function (key) {
      var item = items[key];
      if (!(deleted[key] >= item.updatedAt)) itemOut.push(item);
    });
    listOut.sort(byRank);
    itemOut.sort(function (a, b) { return compare(a.listId, b.listId) || byRank(a, b); });
    return { version: VERSION, lists: listOut.slice(0, MAX_LISTS), items: itemOut.slice(0, MAX_ITEMS), deleted: pruneTombstones(deleted) };
  }
  function collect(value, cap, lists, items, deleted) {
    if (value === undefined || value === null) return;
    if (!object(value)) return;
    checkVersion(value.version);
    if (object(value.deleted)) Object.keys(value.deleted).forEach(function (key) {
      var stamp = value.deleted[key];
      if (id(key) && integer(stamp) && stamp <= cap) deleted[key] = Math.max(deleted[key] || 0, stamp);
    });
    (Array.isArray(value.lists) ? value.lists : []).forEach(function (record) {
      var list = normalizeList(record, cap);
      if (list) lists[list.id] = newer(lists[list.id], list);
    });
    (Array.isArray(value.items) ? value.items : []).forEach(function (record) {
      var item = normalizeItem(record, cap);
      if (item) items[item.id] = newer(items[item.id], item);
    });
  }

  function normalize(value) {
    var cap = ceiling(), lists = Object.create(null), items = Object.create(null), deleted = {};
    collect(value, cap, lists, items, deleted);
    return assemble(lists, items, deleted);
  }
  function merge(left, right) {
    var cap = ceiling(), lists = Object.create(null), items = Object.create(null), deleted = {};
    collect(left, cap, lists, items, deleted);
    collect(right, cap, lists, items, deleted);
    return assemble(lists, items, deleted);
  }
  function signature(value) { return JSON.stringify(normalize(value)); }

  function stampAfter(previous, now) {
    var at = integer(now) ? now : Date.now();
    return previous ? Math.max(at, previous.updatedAt + 1) : at;
  }
  function findList(store, listId) { return store.lists.find(function (list) { return list.id === listId; }) || null; }
  function findItem(store, itemId) { return store.items.find(function (item) { return item.id === itemId; }) || null; }
  function lists(value) { return normalize(value).lists.slice(); }
  function items(value, listId) {
    return normalize(value).items.filter(function (item) { return item.listId === listId; }).sort(byRank);
  }
  function endRank(records) { return records.reduce(function (max, record) { return Math.max(max, record.rank); }, 0) + 1; }

  function upsertList(value, record, now) {
    var store = normalize(value);
    if (!object(record) || !id(record.id)) fail('A reading list needs an id');
    var previous = findList(store, record.id), stamp = stampAfter(previous, now);
    var next = Object.assign({}, previous || { createdAt: stamp, rank: endRank(store.lists) }, record, { updatedAt: stamp });
    if (!previous && !integer(record.createdAt)) next.createdAt = stamp;
    var list = normalizeList(next, Math.max(ceiling(), stamp));
    if (!list) fail('That reading list could not be saved');
    if (!previous && store.lists.length >= MAX_LISTS) fail('Phloem keeps up to ' + MAX_LISTS + ' reading lists', 'FULL');
    return merge(store, { version: VERSION, lists: [list] });
  }
  function upsertItem(value, record, now) {
    var store = normalize(value);
    if (!object(record) || !id(record.id)) fail('A reading-list item needs an id');
    var previous = findItem(store, record.id), stamp = stampAfter(previous, now);
    var listId = record.listId || previous && previous.listId;
    if (!findList(store, listId)) fail('That reading list no longer exists', 'MISSING_LIST');
    var base = previous || {};
    if (!previous || record.listId && record.listId !== previous.listId && record.rank === undefined) {
      base = Object.assign({}, base, { rank: endRank(store.items.filter(function (item) { return item.listId === listId; })) });
    }
    var next = Object.assign({ createdAt: stamp }, base, record, { listId: listId, updatedAt: stamp });
    if (next.done === true && !(previous && previous.done && previous.doneAt) && !integer(record.doneAt)) next.doneAt = stamp;
    if (next.done !== true) next.doneAt = 0;
    var item = normalizeItem(next, Math.max(ceiling(), stamp));
    if (!item) fail('A reading-list item needs a title, DOI, or link');
    if (!previous && store.items.length >= MAX_ITEMS) fail('Phloem keeps up to ' + MAX_ITEMS + ' reading-list items', 'FULL');
    return merge(store, { version: VERSION, items: [item] });
  }
  function remove(value, recordId, now) {
    var store = normalize(value), stamp = integer(now) ? now : Date.now(), deleted = {};
    var list = findList(store, recordId), item = findItem(store, recordId);
    if (!list && !item) return store;
    deleted[recordId] = stampAfter(list || item, stamp);
    if (list) store.items.forEach(function (entry) { if (entry.listId === recordId) deleted[entry.id] = stampAfter(entry, stamp); });
    return merge(store, { version: VERSION, deleted: deleted });
  }
  /* Moves an item to sit before another item of the same list (or to the end when
     beforeId is empty). Only the moved item changes, so concurrent moves merge. */
  function move(value, itemId, beforeId, now) {
    var store = normalize(value), item = findItem(store, itemId);
    if (!item) return store;
    var siblings = store.items.filter(function (entry) { return entry.listId === item.listId && entry.id !== itemId; }).sort(byRank);
    var index = beforeId ? siblings.findIndex(function (entry) { return entry.id === beforeId; }) : -1;
    if (index < 0) index = siblings.length;
    var before = index > 0 ? siblings[index - 1].rank : (siblings.length ? siblings[0].rank - 2 : 0);
    var after = index < siblings.length ? siblings[index].rank : before + 2;
    var rank = (before + after) / 2;
    if (!(rank > before && rank < after) || after - before < 1e-9) {
      // Ranks ran out of room between two neighbours: renumber the whole list once.
      var ordered = siblings.slice();
      ordered.splice(index, 0, item);
      var stamp = integer(now) ? now : Date.now();
      var renumbered = ordered.map(function (entry, position) {
        return Object.assign({}, entry, { rank: position + 1, updatedAt: stampAfter(entry, stamp) });
      });
      return merge(store, { version: VERSION, items: renumbered });
    }
    return upsertItem(store, { id: itemId, rank: rank }, now);
  }

  /* ---------- Display helpers ---------- */
  function surnames(authors) {
    var text = line(authors, LIMIT.authors);
    if (!text) return [];
    var parts;
    if (text.indexOf(';') >= 0) {
      parts = text.split(';').map(function (part) { return part.split(',')[0].trim().replace(/\s+[A-Z][A-Z.\-]{0,5}$/, ''); });
    } else {
      parts = text.split(/\s*,\s*|\s+(?:and|&)\s+/i).filter(function (part) {
        // "Osorio, S., Ruan, Y.-L." alternates surnames with initials; drop the initials.
        return part && !/^(?:[A-Z]\.?\s*-?\s*){1,4}$/.test(part.trim()) && !/^et al\.?$/i.test(part.trim());
      }).map(function (part) {
        var words = part.trim().split(/\s+/);
        // "Alisdair R. Fernie" ends with the surname; "Mahadevan R" and "Mahadevan, R." start with it.
        return words.length > 1 && !/^[A-Z][A-Z.\-]{0,5}$/.test(words[words.length - 1]) ? words[words.length - 1] : words[0];
      });
    }
    return parts.map(function (part) { return part.trim(); }).filter(Boolean);
  }
  function shortAuthors(authors) {
    if (/\bet al\.?$/i.test(String(authors || '').trim()) && String(authors).length <= 60) return line(authors, 60);
    var names = surnames(authors);
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' & ' + names[1];
    if (names.length === 3) return names[0] + ', ' + names[1] + ' & ' + names[2];
    return names[0] + ' et al.';
  }

  /* ---------- Library matching ---------- */
  function words(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(function (word) { return word.length > 2 && !STOPWORDS[word] && !/^\d+$/.test(word); });
  }
  function matchScore(item, paper) {
    if (!item || !paper) return 0;
    var haystack = [paper.title, paper.authors, paper.sourceName, paper.sourceUrl].join(' ');
    if (item.doi && haystack.toLowerCase().indexOf(item.doi) >= 0) return 1;
    var wanted = words(item.title);
    if (wanted.length < 2) return 0;
    var have = {};
    words([paper.title, paper.sourceName].join(' ')).forEach(function (word) { have[word] = true; });
    var hits = wanted.filter(function (word) { return have[word]; }).length, score = hits / wanted.length;
    var lower = haystack.toLowerCase(), first = surnames(item.authors)[0];
    if (item.year && lower.indexOf(item.year) >= 0) score += 0.1;
    if (first && first.length > 2 && lower.indexOf(first.toLowerCase()) >= 0) score += 0.15;
    return Math.min(0.99, score);
  }
  function libraryMatches(item, papers, limit) {
    return (papers || []).map(function (paper) { return { id: paper.id, score: matchScore(item, paper) }; })
      .filter(function (match) { return match.score >= 0.45; })
      .sort(function (a, b) { return b.score - a.score || compare(a.id, b.id); })
      .slice(0, limit || 5);
  }
  /* Only an unambiguous match links on its own: a clear score and a clear lead. */
  function confidentMatch(item, papers) {
    var found = libraryMatches(item, papers, 2);
    // A two- or three-word title matches too much by chance; it links only by DOI.
    if (found.length && found[0].score < 1 && words(item && item.title).length < 4) return '';
    if (!found.length || found[0].score < 0.8) return '';
    if (found[1] && found[0].score - found[1].score < 0.15) return '';
    return found[0].id;
  }

  /* ---------- Crossref ---------- */
  function stripTags(text) { return String(text || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
  function fromCrossref(work) {
    if (!object(work)) return null;
    var title = line(stripTags(Array.isArray(work.title) ? work.title[0] : work.title), LIMIT.title);
    var subtitle = Array.isArray(work.subtitle) && work.subtitle[0] ? line(stripTags(work.subtitle[0]), 200) : '';
    if (title && subtitle && title.toLowerCase().indexOf(subtitle.toLowerCase()) < 0) title = (title + ': ' + subtitle).slice(0, LIMIT.title);
    var authors = (Array.isArray(work.author) ? work.author : []).map(function (person) {
      if (!object(person)) return '';
      return line([person.given, person.family].filter(Boolean).join(' ') || person.name, 120);
    }).filter(Boolean).join(', ');
    var dated = [work.issued, work['published-print'], work['published-online'], work.created].find(function (entry) {
      return object(entry) && Array.isArray(entry['date-parts']) && Array.isArray(entry['date-parts'][0]) && entry['date-parts'][0][0];
    });
    var venue = Array.isArray(work['container-title']) ? work['container-title'][0] : work['container-title'];
    if (!venue && work.type === 'dissertation' && object(work.institution)) venue = work.institution.name;
    if (!venue && Array.isArray(work.institution) && work.institution[0]) venue = work.institution[0].name;
    var result = {
      kind: 'paper', title: title, authors: line(authors, LIMIT.authors),
      year: dated ? cleanYear(dated['date-parts'][0][0]) : '', venue: line(stripTags(venue), LIMIT.venue),
      doi: cleanDoi(work.DOI), type: line(work.type, 40)
    };
    return result.title || result.doi ? result : null;
  }

  /* ---------- Import ---------- */
  var LATEX = { "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', c: 'ć', n: 'ń', s: 'ś', z: 'ź', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' },
    '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È' },
    '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
    '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' }, '~': { a: 'ã', n: 'ñ', o: 'õ', N: 'Ñ' },
    c: { c: 'ç', C: 'Ç' }, v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž' } };
  function latexText(value) {
    return String(value || '')
      .replace(/\\([`'"^~cv])\s*\{?\\?([A-Za-z])\}?/g, function (match, mark, letter) { return LATEX[mark] && LATEX[mark][letter] || letter; })
      .replace(/\\ss\b\s*/g, 'ß').replace(/\\o\b\s*/g, 'ø').replace(/\\aa\b\s*/g, 'å')
      .replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\textendash\b|--/g, '–').replace(/\\textemdash\b/g, '—')
      .replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, '').replace(/~/g, ' ');
  }
  function bibAuthors(value) {
    return latexText(value).split(/\s+and\s+/i).map(function (name) {
      name = name.trim();
      if (/^others$/i.test(name)) return 'et al.';
      var comma = name.split(/\s*,\s*/);
      return comma.length >= 2 ? (comma.slice(1).join(' ') + ' ' + comma[0]).trim() : name;
    }).filter(Boolean).join(', ');
  }
  function parseBibtex(text) {
    var out = [], at = 0, source = String(text || '');
    while (out.length < MAX_IMPORT) {
      var start = source.slice(at).search(/@[A-Za-z]+\s*[{(]/);
      if (start < 0) break;
      start += at;
      var head = source.slice(start).match(/^@([A-Za-z]+)\s*([{(])/), type = head[1].toLowerCase(), open = head[2], close = open === '{' ? '}' : ')';
      var index = start + head[0].length, depth = 1, body = '';
      while (index < source.length && depth > 0) {
        var ch = source[index];
        if (ch === open || ch === '{' && open !== '{') depth++;
        else if (ch === close || ch === '}' && open !== '{') depth--;
        if (depth > 0) body += ch;
        index++;
      }
      at = index;
      if (type === 'comment' || type === 'preamble' || type === 'string') continue;
      var fields = {}, rest = body.replace(/^[^,]*,/, ''), cursor = 0;
      while (cursor < rest.length) {
        var name = rest.slice(cursor).match(/^\s*([A-Za-z][\w-]*)\s*=\s*/);
        if (!name) { var skip = rest.indexOf(',', cursor); if (skip < 0) break; cursor = skip + 1; continue; }
        cursor += name[0].length;
        var value = '';
        if (rest[cursor] === '{') {
          var level = 0;
          do {
            if (rest[cursor] === '{') level++;
            else if (rest[cursor] === '}') level--;
            value += rest[cursor];
            cursor++;
          } while (cursor < rest.length && level > 0);
          value = value.slice(1, -1);
        } else if (rest[cursor] === '"') {
          cursor++;
          var level2 = 0;
          while (cursor < rest.length && !(rest[cursor] === '"' && level2 === 0)) {
            if (rest[cursor] === '{') level2++;
            else if (rest[cursor] === '}') level2--;
            value += rest[cursor];
            cursor++;
          }
          cursor++;
        } else {
          var bare = rest.slice(cursor).match(/^[^,]*/)[0];
          value = bare.trim();
          cursor += bare.length;
        }
        fields[name[1].toLowerCase()] = value;
        var comma = rest.indexOf(',', cursor);
        cursor = comma < 0 ? rest.length : comma + 1;
      }
      var entry = {
        kind: 'paper', title: line(latexText(fields.title), LIMIT.title), authors: line(bibAuthors(fields.author || fields.editor), LIMIT.authors),
        year: cleanYear(fields.year || fields.date), venue: line(latexText(fields.journal || fields.booktitle || fields.school || fields.publisher), LIMIT.venue),
        doi: cleanDoi(fields.doi), url: cleanUrl(latexText(fields.url).trim()), note: prose(latexText(fields.annote || fields.note || ''), LIMIT.note)
      };
      if (!entry.doi && fields.url) entry.doi = cleanDoi(fields.url);
      if (entry.title || entry.doi || entry.url) out.push(entry);
    }
    return out;
  }
  function parseRis(text) {
    var out = [], entry = null;
    function finish() {
      if (entry && (entry.title || entry.doi || entry.url) && out.length < MAX_IMPORT) {
        entry.authors = line(entry.authorList.join(', '), LIMIT.authors);
        delete entry.authorList;
        out.push(entry);
      }
      entry = null;
    }
    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      var match = raw.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
      if (!match) return;
      var tag = match[1], value = match[2].trim();
      if (tag === 'TY') { finish(); entry = { kind: 'paper', title: '', authorList: [], year: '', venue: '', doi: '', url: '', note: '' }; return; }
      if (!entry) return;
      if (tag === 'ER') { finish(); return; }
      if ((tag === 'TI' || tag === 'T1') && !entry.title) entry.title = line(value, LIMIT.title);
      else if (tag === 'AU' || tag === 'A1') {
        var parts = value.split(/\s*,\s*/);
        entry.authorList.push(parts.length >= 2 ? (parts.slice(1).join(' ') + ' ' + parts[0]).trim() : value);
      } else if ((tag === 'PY' || tag === 'Y1' || tag === 'DA') && !entry.year) entry.year = cleanYear(value);
      else if ((tag === 'JO' || tag === 'JF' || tag === 'T2' || tag === 'JA' || tag === 'BT') && !entry.venue) entry.venue = line(value, LIMIT.venue);
      else if (tag === 'DO' && !entry.doi) entry.doi = cleanDoi(value);
      else if (tag === 'UR' && !entry.url) { if (!entry.doi) entry.doi = cleanDoi(value); if (!cleanDoi(value)) entry.url = cleanUrl(value); }
      else if (tag === 'N1' && !entry.note) entry.note = prose(value, LIMIT.note);
    });
    finish();
    return out;
  }

  var GENERIC_LINK = /^(?:open\s+)?(?:full[\s-]*text|pdf|doi|pubmed|pmc|link|here|paper|article|preprint|publisher|html|source|free(?:\s+pdf)?|download)$/i;
  function plainMarkdown(text) {
    return String(text || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:])/g, '$1$2').replace(/~~([^~]+)~~/g, '$1');
  }
  /* One reference written by hand or by an assistant, e.g.
     "Osorio, Ruan & Fernie (2014) — An update on source-to-sink carbon partitioning in tomato. https://doi.org/…"
     or "**Title** — why to read it [Open full text](…)". */
  function parseReference(raw) {
    var text = String(raw || ''), entry = { kind: 'paper', title: '', authors: '', year: '', venue: '', doi: '', url: '', note: '', takeaway: '', done: false };
    var check = text.match(/^\s*\[([ xX✓✔])\]\s*/);
    if (check) { entry.done = check[1] !== ' '; text = text.slice(check[0].length); }
    if (/^\s*~~.+~~\s*$/.test(text)) entry.done = true;
    text = text.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, function (match, label, url) {
      var doi = cleanDoi(/doi\.org\//i.test(url) || /^doi\b/i.test(label) ? url : '');
      if (doi) { if (!entry.doi) entry.doi = doi; }
      else if (!entry.url || /full[\s-]*text|pdf|free/i.test(label)) entry.url = cleanUrl(url);
      return GENERIC_LINK.test(label.trim()) ? ' ' : label;
    });
    text = text.replace(/<?(https?:\/\/[^\s<>]+?)>?(?=[\s,;]|[.)](?:\s|$)|$)/g, function (match, url) {
      var doi = /doi\.org\//i.test(url) ? cleanDoi(url) : '';
      if (doi) { if (!entry.doi) entry.doi = doi; }
      else if (!entry.url) { entry.url = cleanUrl(url); if (!entry.doi) entry.doi = cleanDoi(url); }
      return ' ';
    });
    text = text.replace(/\b(?:doi:\s*)?(10\.\d{4,9}\/[^\s"<>]+)/gi, function (match) {
      if (!entry.doi) entry.doi = cleanDoi(match);
      return ' ';
    }).replace(/\bdoi\s*:?\s*(?=$|[\s·|,;])/gi, ' ');
    text = text.replace(/\s*[·|]\s*(?=[·|]|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[\s·|,;:–—-]+|[\s·|,;:–—-]+$/g, '');
    var bold = text.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
    var lead = text.match(/^(.{2,160}?)\s*\(((?:1[5-9]|20)\d\d)[a-z]?\)\s*[.,:]?\s*(?:[–—-]\s*)?/);
    if (lead && !/\*\*/.test(lead[1])) {
      entry.authors = line(plainMarkdown(lead[1]).replace(/[,;]$/, ''), LIMIT.authors);
      entry.year = lead[2];
      text = text.slice(lead[0].length);
    } else if (!/\*\*|__/.test(text)) {
      var year = text.match(/\(((?:1[5-9]|20)\d\d)[a-z]?\)/);
      if (year) { entry.year = year[1]; text = text.replace(year[0], ' ').replace(/\s+/g, ' ').trim(); }
    }
    bold = text.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
    if (bold) {
      entry.title = (bold[1] || bold[2]).trim();
      var after = text.slice(text.indexOf(bold[0]) + bold[0].length).replace(/^[\s.,:;–—-]+/, '');
      var before = text.slice(0, text.indexOf(bold[0])).replace(/[\s.,:;–—-]+$/, '');
      if (before && !entry.authors) entry.authors = line(plainMarkdown(before), LIMIT.authors);
      // "**Title** — Orth et al. (2010), read Figure 1" puts the citation after the title.
      var cited = !entry.authors && after.match(/^(.{2,120}?)\s*\(((?:1[5-9]|20)\d\d)[a-z]?\)\s*[.,;:]?\s*/);
      if (cited) { entry.authors = line(plainMarkdown(cited[1]), LIMIT.authors); entry.year = cited[2]; after = after.slice(cited[0].length).replace(/^[\s.,:;–—-]+/, ''); }
      if (after) entry.note = plainMarkdown(after);
    } else {
      var split = text.split(/\s+[–—]\s+|\s+-\s+/);
      entry.title = plainMarkdown(split[0]);
      if (split.length > 1) entry.note = plainMarkdown(split.slice(1).join(' — '));
    }
    entry.title = line(entry.title.replace(/^["“]|["”]$/g, '').replace(/[.,;:]+$/, ''), LIMIT.title);
    entry.note = prose(entry.note.replace(/^[\s.,:;–—-]+/, ''), LIMIT.note);
    return entry;
  }
  function stripListMarker(text) {
    var match = text.match(/^\s*(?:[-*+•]|\d+[.)])\s+/);
    return match ? text.slice(match[0].length) : null;
  }
  function labelled(text) {
    var match = text.match(/^\s*\**\s*(look\s*for|why|focus|read|takeaway|key\s*point|note)s?\s*\**\s*[:：]\s*\**\s*(.*)$/i);
    return match ? { label: /takeaway|key/i.test(match[1]) ? 'takeaway' : 'note', text: match[2] } : null;
  }
  function addDetail(entry, text) {
    var tagged = labelled(text), clean = plainMarkdown((tagged ? tagged.text : text).replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '$1')).trim();
    if (!clean) return;
    var field = tagged ? tagged.label : 'note';
    var previous = entry[field] || '', joiner = !previous ? '' : tagged ? '\n' : /[;,.:：]$/.test(previous) ? ' ' : '; ';
    entry[field] = prose(previous + joiner + clean, LIMIT[field]);
  }
  function referenceHeading(text, next) {
    if (/\b(?:1[5-9]|20)\d\d\b/.test(text) || cleanDoi(text)) return true;
    return /^\s*(?:\*\*[^*]+\*\*|__[^_]+__)\s*$/.test(next || '');
  }
  var HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
  /* Hard-wrapped Markdown keeps one sentence (or one bold title) across several lines.
     Those continuation lines are joined back first, so each logical line is whole. */
  function logicalLines(lines, joinWrapped) {
    var out = [];
    lines.forEach(function (raw) {
      var trimmed = raw.trim(), last = out[out.length - 1];
      if (!trimmed) { out.push(''); return; }
      var structural = HEADING.test(raw) || stripListMarker(raw) !== null || /^\s*\|/.test(raw) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw);
      if (joinWrapped && !structural && last && !HEADING.test(last) && !/^\s*\|/.test(last)) { out[out.length - 1] = last.replace(/\s+$/, '') + ' ' + trimmed; return; }
      out.push(raw);
    });
    return out;
  }
  function parseMarkdown(text) {
    var source = String(text || '').replace(/\r\n?/g, '\n').replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '');
    var raw = source.split('\n'), title = '', listItems = 0, headings = 0;
    raw.forEach(function (row) {
      var heading = row.match(HEADING);
      if (heading) headings++;
      if (heading && heading[1].length === 1 && !title) title = plainMarkdown(heading[2]).trim();
      if (stripListMarker(row) !== null && !/^\s{2,}|^\t/.test(row)) listItems++;
    });
    var lines = logicalLines(raw, !!(headings || listItems)), headingItems = 0;
    function nextText(index) {
      for (var j = index + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
      return '';
    }
    lines.forEach(function (row, index) {
      var heading = row.match(HEADING);
      if (heading && heading[1].length >= 3 && referenceHeading(heading[2], nextText(index))) headingItems++;
    });
    var out = [], current = null, mode = headingItems ? 'heading' : listItems ? 'list' : 'lines';
    var paragraphDone = false, pendingTitle = false;
    function push(entry) { if (out.length < MAX_IMPORT && (entry.title || entry.doi || entry.url)) out.push(entry); }
    function finish() { if (current) push(current); current = null; }
    lines.forEach(function (row, index) {
      var trimmed = row.trim(), heading = row.match(HEADING);
      if (/^\s*\|/.test(row) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(row)) return;
      if (mode === 'heading') {
        if (heading) {
          finish();
          if (heading[1].length >= 3 && referenceHeading(heading[2], nextText(index))) {
            current = parseReference(heading[2]);
            // "### Chiou & Bush (1998)" names the authors; the bold line below is the title.
            if (current.title && !current.authors && current.year) { current.authors = current.title; current.title = ''; }
            pendingTitle = true;
            paragraphDone = false;
          }
          return;
        }
        if (!current) return;
        if (!trimmed) { if (current.note) paragraphDone = true; return; }
        var boldLine = trimmed.match(/^(?:\*\*([^*]+)\*\*|__([^_]+)__)\s*[.:]?$/);
        if (pendingTitle && boldLine) {
          var bolded = line(plainMarkdown(boldLine[1] || boldLine[2]), LIMIT.title);
          if (current.title && !current.authors) current.authors = current.title;
          current.title = bolded;
          pendingTitle = false;
          return;
        }
        // A line of links only ("Open full text · DOI") carries the DOI and URL, not prose.
        var linkOnly = trimmed.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/[\s·|,;]/g, '') === '';
        if (linkOnly || /^(?:doi\b|https?:)/i.test(trimmed)) {
          var linked = parseReference(trimmed);
          if (!current.doi) current.doi = linked.doi;
          if (!current.url) current.url = linked.url;
          return;
        }
        pendingTitle = false;
        var bullet = stripListMarker(row);
        // Keep the first paragraph, plus the bullets it introduces with a colon.
        if (paragraphDone && !(bullet !== null && /[:：]$/.test(current.note))) return;
        if (bullet === null && paragraphDone) return;
        addDetail(current, bullet === null ? trimmed : bullet);
        if (bullet !== null) paragraphDone = false;
        return;
      }
      if (heading) { finish(); return; }
      if (!trimmed) return;
      var body = stripListMarker(row), indented = /^\s{2,}|^\t/.test(row);
      if (mode === 'list') {
        if (body !== null && !indented) { finish(); current = parseReference(body); return; }
        if (current && indented) { addDetail(current, body === null ? trimmed : body); return; }
        return;
      }
      push(parseReference(trimmed));
    });
    finish();
    return { title: title, items: out };
  }
  function parseImport(text, filename) {
    var source = String(text || ''), name = String(filename || '').toLowerCase(), result;
    if (/\.bib$/.test(name) || /@[A-Za-z]+\s*[{(][^,]*,[\s\S]*=/.test(source) && !/^\s*[-*#]/m.test(source.split('@')[0])) result = { format: 'bibtex', title: '', items: parseBibtex(source) };
    else if (/\.ris$/.test(name) || /^TY\s{1,2}-/m.test(source)) result = { format: 'ris', title: '', items: parseRis(source) };
    else { var parsed = parseMarkdown(source); result = { format: 'markdown', title: parsed.title, items: parsed.items }; }
    result.items = result.items.map(function (entry) {
      var copy = Object.assign({}, entry, { kind: 'paper' });
      copy.title = line(copy.title, LIMIT.title);
      copy.note = prose(copy.note, LIMIT.note);
      copy.takeaway = prose(copy.takeaway, LIMIT.takeaway);
      return copy;
    });
    return result;
  }

  /* ---------- Export ---------- */
  function citeLine(item) {
    var parts = [];
    var who = shortAuthors(item.authors);
    if (who || item.year) parts.push(who ? who + (item.year ? ' (' + item.year + ')' : '') : '(' + item.year + ')');
    if (item.venue) parts.push(item.venue);
    return parts.join('. ');
  }
  function toMarkdown(list, records) {
    var out = ['# ' + (list && list.name || 'Reading list'), ''];
    (records || []).forEach(function (item) {
      var head = '- [' + (item.done ? 'x' : ' ') + '] **' + (item.title || item.doi || item.url).replace(/\*/g, '') + '**';
      var cite = citeLine(item);
      if (cite) head += ' — ' + cite;
      if (item.doi) head += ' https://doi.org/' + item.doi;
      if (item.url) head += ' [Full text](' + item.url + ')';
      out.push(head);
      if (item.note) out.push('  - Look for: ' + item.note.replace(/\n+/g, ' '));
      if (item.takeaway) out.push('  - Takeaway: ' + item.takeaway.replace(/\n+/g, ' '));
    });
    return out.join('\n') + '\n';
  }
  function bibEscape(text) { return String(text || '').replace(/[{}\\]/g, '').replace(/&/g, '\\&').replace(/%/g, '\\%'); }
  function toBibtex(records) {
    var used = {};
    return (records || []).map(function (item) {
      var first = (surnames(item.authors)[0] || 'ref').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '') || 'ref';
      var word = words(item.title)[0] || '';
      var key = first + (item.year || '') + word, base = key, n = 1;
      while (used[key]) key = base + String.fromCharCode(97 + n++);
      used[key] = true;
      var authors = item.authors ? item.authors.split(/\s*[,;]\s*|\s+&\s+/).filter(Boolean).join(' and ') : '';
      var fields = [['title', '{' + bibEscape(item.title) + '}'], ['author', bibEscape(authors)], ['year', item.year],
        ['journal', bibEscape(item.venue)], ['doi', item.doi], ['url', item.url], ['note', bibEscape(item.note.replace(/\n+/g, ' '))]]
        .filter(function (field) { return field[1]; });
      return '@article{' + key + ',\n' + fields.map(function (field) { return '  ' + field[0] + ' = {' + field[1] + '}'; }).join(',\n') + '\n}';
    }).join('\n\n') + '\n';
  }

  global.PhloemLists = Object.freeze({
    VERSION: VERSION,
    LIMIT: Object.freeze(Object.assign({}, LIMIT)),
    normalize: normalize, merge: merge, signature: signature,
    lists: lists, items: items,
    upsertList: upsertList, upsertItem: upsertItem, remove: remove, move: move,
    cleanDoi: cleanDoi, cleanUrl: cleanUrl, shortAuthors: shortAuthors,
    matchScore: matchScore, libraryMatches: libraryMatches, confidentMatch: confidentMatch,
    fromCrossref: fromCrossref, parseImport: parseImport, parseReference: parseReference,
    toMarkdown: toMarkdown, toBibtex: toBibtex
  });
})(typeof window !== 'undefined' ? window : globalThis);
