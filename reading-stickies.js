/* Sticky notes pinned to a spot on a PDF page. State only: no DOM, network or PDF access.
   Stored on the paper as pdfStickies {page: [{id,x,y,text,color,at,updatedAt}]} with x,y
   the note's centre as fractions of the page as shown (rotation and crop applied), and
   pdfStickiesDeleted {id: time} tombstones. Each note merges on its own by id and
   updatedAt; a tombstone at or after a note's last change removes it everywhere. */
(function (global) {
  'use strict';
  var COLORS = ['yellow', 'mint', 'coral', 'blue'], MAX_TEXT = 20000;
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function safeKey(key) { return typeof key === 'string' && !!key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'; }
  function stamp(item) { return +item.updatedAt || +item.at || 0; }
  function copy(raw) {
    // Fields a later version adds to a note ride along untouched.
    var out = {};
    Object.keys(raw).forEach(function (key) { if (safeKey(key)) out[key] = raw[key]; });
    return out;
  }
  function normalize(pages, deleted) {
    var tombstones = {}, records = new Map(), out = {};
    if (deleted && typeof deleted === 'object') Object.keys(deleted).forEach(function (id) {
      if (safeKey(id) && Number.isFinite(deleted[id]) && deleted[id] > 0) tombstones[id] = deleted[id];
    });
    if (pages && typeof pages === 'object' && !Array.isArray(pages)) Object.keys(pages).forEach(function (page) {
      if (!/^[1-9]\d*$/.test(page) || !Array.isArray(pages[page])) return;
      pages[page].forEach(function (raw) {
        if (!raw || typeof raw !== 'object' || !safeKey(raw.id) || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return;
        var at = Number.isFinite(raw.at) && raw.at > 0 ? raw.at : 0, item = copy(raw);
        item.x = clamp(raw.x, 0, 1); item.y = clamp(raw.y, 0, 1);
        item.text = String(raw.text === undefined || raw.text === null ? '' : raw.text).slice(0, MAX_TEXT);
        item.color = COLORS.indexOf(raw.color) >= 0 ? raw.color : 'yellow';
        item.at = at; item.updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : at;
        if (tombstones[item.id] && tombstones[item.id] >= stamp(item)) return;
        var old = records.get(item.id);
        if (!old || stamp(item) > stamp(old.item) || (stamp(item) === stamp(old.item) && canonical([page, item]) > canonical([old.page, old.item]))) records.set(item.id, { page: page, item: item });
      });
    });
    records.forEach(function (record) { (out[record.page] || (out[record.page] = [])).push(record.item); });
    Object.keys(out).forEach(function (page) { out[page].sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }); });
    return { pages: out, deleted: tombstones };
  }
  function merge(a, ad, b, bd) {
    var pages = {}, deleted = {};
    [ad, bd].forEach(function (source) {
      if (source && typeof source === 'object') Object.keys(source).forEach(function (id) { if (safeKey(id) && Number.isFinite(source[id])) deleted[id] = Math.max(deleted[id] || 0, source[id]); });
    });
    [a, b].forEach(function (source) {
      if (source && typeof source === 'object' && !Array.isArray(source)) Object.keys(source).forEach(function (page) { if (/^[1-9]\d*$/.test(page) && Array.isArray(source[page])) pages[page] = (pages[page] || []).concat(source[page]); });
    });
    return normalize(pages, deleted);
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key]); }).join(',') + '}';
    return JSON.stringify(value === undefined ? null : value);
  }
  /* Same notes and tombstones give the same string whatever the key or list order, so a
     sync can tell whether an incoming copy lacked anything this device holds. */
  function signature(pages, deleted) {
    var state = normalize(pages, deleted);
    Object.keys(state.pages).forEach(function (page) { state.pages[page].sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; }); });
    return canonical(state);
  }
  // Every note in page order, then top to bottom, for lists and export.
  function list(pages) {
    var out = [];
    Object.keys(pages || {}).forEach(function (page) { if (/^[1-9]\d*$/.test(page) && Array.isArray(pages[page])) pages[page].forEach(function (item) { if (item && item.id) out.push({ page: +page, item: item }); }); });
    return out.sort(function (a, b) { return a.page - b.page || a.item.y - b.item.y || a.item.x - b.item.x; });
  }
  global.PhloemStickies = { COLORS: COLORS.slice(), MAX_TEXT: MAX_TEXT, normalize: normalize, merge: merge, signature: signature, list: list };
})(typeof window !== 'undefined' ? window : globalThis);
