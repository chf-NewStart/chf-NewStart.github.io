/* Local reading keeps. Data only: no DOM, network, or storage access. */
(function (global) {
  'use strict';

  var VERSION = 1;
  var FUTURE_WINDOW = 366 * 24 * 60 * 60 * 1000;
  var FORBIDDEN_IDS = Object.create(null);
  FORBIDDEN_IDS.__proto__ = true;
  FORBIDDEN_IDS.constructor = true;
  FORBIDDEN_IDS.prototype = true;
  var KINDS = { bookmark: true, thread: true, question: true };
  var ANCHOR_KINDS = { pdf: true, text: true, reader: true };
  var LAYOUTS = { scroll: true, page: true, book: true };
  var ZOOM_MODES = { full: true, left: true, right: true, text: true, custom: true, fit: true };

  function owns(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
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
    // A one-year allowance tolerates clock skew and offline devices without
    // letting a corrupt far-future record permanently defeat later edits.
    var now = Date.now();
    if (!integer(now)) now = 0;
    return Math.min(Number.MAX_SAFE_INTEGER - 1, now + FUTURE_WINDOW);
  }
  function timestamp(value, cap) { return integer(value) && value <= cap; }
  function unsupported(version) {
    var error = new Error('Unsupported reading-keeps version');
    error.code = 'UNSUPPORTED_VERSION';
    error.version = version;
    throw error;
  }
  function checkVersion(value) {
    if (!object(value)) return;
    // An absent version is accepted for a first write or a partial old record.
    if (owns(value, 'version') && value.version !== VERSION) unsupported(value.version);
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
    if (!object(raw) || typeof raw.kind !== 'string' || !owns(ANCHOR_KINDS, raw.kind)) return null;
    var out = { kind: raw.kind };
    if (raw.kind === 'pdf') {
      if (!Number.isSafeInteger(raw.page) || raw.page < 1) return null;
      out.page = raw.page;
      if (owns(raw, 'position')) {
        var saved = position(raw.position, raw.page, cap);
        if (saved) out.position = saved;
      }
    } else {
      if (!integer(raw.para) || !unit(raw.offset)) return null;
      out.para = raw.para;
      out.offset = raw.offset;
    }
    if (typeof raw.quote === 'string') out.quote = raw.quote.slice(0, 400);
    return out;
  }
  function item(raw, cap) {
    if (!object(raw) || !id(raw.id) || typeof raw.kind !== 'string' ||
        !owns(KINDS, raw.kind) || typeof raw.text !== 'string' ||
        !timestamp(raw.createdAt, cap) || !timestamp(raw.updatedAt, cap) ||
        raw.updatedAt < raw.createdAt) return null;
    var place = anchor(raw.anchor, cap);
    if (!place) return null;
    return { id: raw.id, kind: raw.kind, text: raw.text.slice(0, 2000),
      anchor: place, resolved: raw.resolved === true,
      createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  }
  function pick(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
    // A fixed field order makes equal-clock conflicts independent of input order.
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
  function merge(a, b) {
    // Check both inputs before collecting either, including when one is empty.
    checkVersion(a);
    checkVersion(b);
    var records = new Map(), deleted = new Map(), cap = ceiling();
    collect(a, records, deleted, cap);
    collect(b, records, deleted, cap);
    return finish(records, deleted);
  }
  function nextStamp(requested, previous, cap) {
    if (!timestamp(requested, cap)) throw new RangeError('Invalid reading-keeps timestamp');
    var stamp = Math.max(requested, previous + 1, 1);
    if (stamp > cap) throw new RangeError('Reading-keeps timestamp exhausted');
    return stamp;
  }
  function upsert(value, raw, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!object(raw) || !id(raw.id)) throw new TypeError('Invalid reading-keeps item');
    var old = state.items.find(function (entry) { return entry.id === raw.id; });
    var deletedAt = owns(state.deleted, raw.id) ? state.deleted[raw.id] : 0;
    var at = nextStamp(stamp, Math.max(old ? old.updatedAt : 0, deletedAt), cap);
    var candidate = {
      id: raw.id, kind: raw.kind, text: raw.text, anchor: raw.anchor,
      resolved: raw.resolved === true,
      createdAt: old ? old.createdAt : at, updatedAt: at
    };
    var entry = item(candidate, cap);
    if (!entry) throw new TypeError('Invalid reading-keeps item');
    state.items = state.items.filter(function (existing) { return existing.id !== entry.id; });
    state.items.push(entry);
    return normalize(state);
  }
  function remove(value, key, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!id(key)) throw new TypeError('Invalid reading-keeps id');
    var old = state.items.find(function (entry) { return entry.id === key; });
    var deletedAt = owns(state.deleted, key) ? state.deleted[key] : 0;
    state.deleted[key] = nextStamp(stamp, Math.max(old ? old.updatedAt : 0, deletedAt), cap);
    state.items = state.items.filter(function (entry) { return entry.id !== key; });
    return normalize(state);
  }

  global.PhloemKeeps = Object.freeze({ normalize: normalize, merge: merge,
    upsert: upsert, remove: remove });
})(window);
