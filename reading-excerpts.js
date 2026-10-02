/* Local reading excerpts and notes. Data only: no DOM, network, or storage access. */
(function (global) {
  'use strict';

  var VERSION = 1;
  var FUTURE_WINDOW = 366 * 24 * 60 * 60 * 1000;
  var MAX_QUOTE = 12000;
  var MAX_NOTE = 20000;
  var FORBIDDEN_IDS = Object.create(null);
  FORBIDDEN_IDS.__proto__ = true;
  FORBIDDEN_IDS.constructor = true;
  FORBIDDEN_IDS.prototype = true;
  var ANCHOR_KINDS = { pdf: true, text: true, reader: true };
  var LAYOUTS = { scroll: true, page: true, book: true };
  var ZOOM_MODES = { full: true, left: true, right: true, text: true, custom: true, fit: true };

  function owns(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function unit(value) { return finite(value) && value >= 0 && value <= 1; }
  function id(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      !owns(FORBIDDEN_IDS, value);
  }
  function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function ceiling() {
    var now = Date.now();
    if (!integer(now)) now = 0;
    return Math.min(Number.MAX_SAFE_INTEGER - 1, now + FUTURE_WINDOW);
  }
  function timestamp(value, cap) { return integer(value) && value <= cap; }
  function unsupported(version) {
    var error = new Error('Unsupported reading-excerpts version');
    error.code = 'UNSUPPORTED_VERSION';
    error.version = version;
    throw error;
  }
  function checkVersion(value) {
    if (object(value) && owns(value, 'version') && value.version !== VERSION) unsupported(value.version);
  }

  function position(raw, page, cap) {
    if (!object(raw) || (owns(raw, 'v') && raw.v !== 1) ||
        (owns(raw, 'page') && raw.page !== page)) return null;
    var x = owns(raw, 'x') ? raw.x : .5;
    var y = owns(raw, 'y') ? raw.y : 0;
    var screenX = owns(raw, 'screenX') ? raw.screenX : .5;
    var screenY = owns(raw, 'screenY') ? raw.screenY : .4;
    var updatedAt = owns(raw, 'updatedAt') ? raw.updatedAt : 0;
    if (!unit(x) || !unit(y) || !unit(screenX) || !unit(screenY) ||
        !timestamp(updatedAt, cap)) return null;
    var out = { v: 1, page: page, x: x, y: y, screenX: screenX,
      screenY: screenY, updatedAt: updatedAt };
    if (finite(raw.pdfX) && finite(raw.pdfY)) {
      out.pdfX = raw.pdfX;
      out.pdfY = raw.pdfY;
    }
    if (finite(raw.zoom) && raw.zoom >= 0 && raw.zoom <= 4) out.zoom = raw.zoom;
    if (typeof raw.layout === 'string' && owns(LAYOUTS, raw.layout)) out.layout = raw.layout;
    if (typeof raw.zoomMode === 'string' && owns(ZOOM_MODES, raw.zoomMode)) out.zoomMode = raw.zoomMode;
    return out;
  }
  function anchor(raw, cap) {
    if (!object(raw) || typeof raw.kind !== 'string' || !owns(ANCHOR_KINDS, raw.kind)) return undefined;
    var out = { kind: raw.kind };
    if (raw.kind === 'pdf') {
      if (!Number.isSafeInteger(raw.page) || raw.page < 1) return undefined;
      out.page = raw.page;
      if (owns(raw, 'position')) {
        var saved = position(raw.position, raw.page, cap);
        if (saved) out.position = saved;
      }
    } else {
      if (!integer(raw.para) || !unit(raw.offset)) return undefined;
      out.para = raw.para;
      out.offset = raw.offset;
    }
    return out;
  }
  function item(raw, cap) {
    if (!object(raw) || !id(raw.id) || typeof raw.quote !== 'string' ||
        typeof raw.note !== 'string' || raw.quote.length > MAX_QUOTE ||
        raw.note.length > MAX_NOTE || !timestamp(raw.createdAt, cap) ||
        !timestamp(raw.updatedAt, cap) || raw.updatedAt < raw.createdAt) return null;
    var place = anchor(raw.anchor, cap);
    if (place === undefined) return null;
    var out = { id: raw.id, quote: raw.quote, note: raw.note, anchor: place,
      createdAt: raw.createdAt, updatedAt: raw.updatedAt };
    if (owns(raw, 'sourceHash')) {
      if (place.kind !== 'pdf' ||
          typeof raw.sourceHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(raw.sourceHash)) return null;
      out.sourceHash = raw.sourceHash.toLowerCase();
    }
    return out;
  }
  function pick(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }
  function collect(value, records, deleted, cap) {
    checkVersion(value);
    if (!object(value)) return;
    if (Array.isArray(value.items)) value.items.forEach(function (raw) {
      try {
        var entry = item(raw, cap);
        if (entry) records.set(entry.id, pick(records.get(entry.id), entry));
      } catch (error) { /* A damaged record cannot discard its neighbors. */ }
    });
    if (object(value.deleted)) Object.keys(value.deleted).forEach(function (key) {
      try {
        var stamp = value.deleted[key];
        if (id(key) && timestamp(stamp, cap) &&
            (!deleted.has(key) || stamp > deleted.get(key))) deleted.set(key, stamp);
      } catch (error) { /* Ignore one damaged tombstone. */ }
    });
  }
  function finish(records, tombstones) {
    var deleted = Object.create(null);
    Array.from(tombstones.keys()).sort(compare).forEach(function (key) {
      deleted[key] = tombstones.get(key);
    });
    var items = Array.from(records.values()).filter(function (entry) {
      return !tombstones.has(entry.id) || entry.updatedAt > tombstones.get(entry.id);
    });
    items.sort(function (a, b) { return compare(a.id, b.id); });
    return { version: VERSION, items: items, deleted: deleted };
  }
  function normalize(value) {
    var records = new Map(), deleted = new Map(), cap = ceiling();
    collect(value, records, deleted, cap);
    return finish(records, deleted);
  }
  function merge(left, right) {
    checkVersion(left);
    checkVersion(right);
    var records = new Map(), deleted = new Map(), cap = ceiling();
    collect(left, records, deleted, cap);
    collect(right, records, deleted, cap);
    return finish(records, deleted);
  }
  function nextStamp(requested, previous, cap) {
    if (!timestamp(requested, cap)) throw new RangeError('Invalid reading-excerpts timestamp');
    var stamp = Math.max(requested, previous + 1, 1);
    if (stamp > cap) throw new RangeError('Reading-excerpts timestamp exhausted');
    return stamp;
  }
  function upsert(value, raw, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!object(raw) || !id(raw.id)) throw new TypeError('Invalid reading-excerpts item');
    if (typeof raw.quote === 'string' && raw.quote.length > MAX_QUOTE ||
        typeof raw.note === 'string' && raw.note.length > MAX_NOTE)
      throw new RangeError('Reading-excerpts text exceeds maximum length');
    var old = state.items.find(function (entry) { return entry.id === raw.id; });
    var deletedAt = owns(state.deleted, raw.id) ? state.deleted[raw.id] : 0;
    var at = nextStamp(stamp, Math.max(old ? old.updatedAt : 0, deletedAt), cap);
    var candidate = { id: raw.id, quote: raw.quote, note: raw.note,
      anchor: raw.anchor,
      createdAt: old ? old.createdAt : at, updatedAt: at };
    if (owns(raw, 'sourceHash')) candidate.sourceHash = raw.sourceHash;
    var entry = item(candidate, cap);
    if (!entry) throw new TypeError('Invalid reading-excerpts item');
    state.items = state.items.filter(function (existing) { return existing.id !== entry.id; });
    state.items.push(entry);
    return normalize(state);
  }
  function remove(value, key, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!id(key)) throw new TypeError('Invalid reading-excerpts id');
    var old = state.items.find(function (entry) { return entry.id === key; });
    var deletedAt = owns(state.deleted, key) ? state.deleted[key] : 0;
    state.deleted[key] = nextStamp(stamp, Math.max(old ? old.updatedAt : 0, deletedAt), cap);
    state.items = state.items.filter(function (entry) { return entry.id !== key; });
    return normalize(state);
  }

  global.PhloemExcerpts = Object.freeze({ normalize: normalize, merge: merge,
    upsert: upsert, remove: remove });
})(window);
