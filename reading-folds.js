/* Pure, hash-scoped PDF fold state. No DOM, storage, network, or PDF access. */
(function (global) {
  'use strict';

  var VERSION = 1;
  var FUTURE_WINDOW = 24 * 60 * 60 * 1000;
  var FORBIDDEN = Object.create(null);
  FORBIDDEN.__proto__ = true;
  FORBIDDEN.constructor = true;
  FORBIDDEN.prototype = true;
  var RECORD_KEYS = { id: true, page: true, y0: true, y1: true, updatedAt: true };
  var EMPTY = { version: VERSION, byHash: {} };

  function owns(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function timestamp(value) { return Number.isSafeInteger(value) && value >= 0; }
  function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128 && !owns(FORBIDDEN, value); }
  function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
  function hashKey(value) { return validHash(value) ? value.toLowerCase() : ''; }
  function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function nowValue(value) {
    var now = value === undefined ? Date.now() : value;
    return timestamp(now) ? now : Date.now();
  }
  function capAt(now) { return Math.min(Number.MAX_SAFE_INTEGER, now + FUTURE_WINDOW); }
  function copy(value) {
    var text = stableStringify(value);
    return text === undefined ? null : JSON.parse(text);
  }
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      var values = value.map(stableStringify);
      if (values.some(function (part) { return part === undefined; })) return undefined;
      return '[' + values.join(',') + ']';
    }
    var keys = Object.keys(value).sort(compare), parts = [];
    keys.forEach(function (key) {
      var encoded = stableStringify(value[key]);
      if (encoded !== undefined) parts.push(JSON.stringify(key) + ':' + encoded);
    });
    return '{' + parts.join(',') + '}';
  }
  function empty() { return { version: VERSION, byHash: {} }; }
  function canonicalize(value) {
    var out = empty(), byHash = {};
    Object.keys(value.byHash).sort(compare).forEach(function (hash) {
      var source = value.byHash[hash], items = {}, deleted = {};
      Object.keys(source.items).sort(compare).forEach(function (id) { items[id] = source.items[id]; });
      Object.keys(source.deleted).sort(compare).forEach(function (id) { deleted[id] = source.deleted[id]; });
      byHash[hash] = { items: items, deleted: deleted };
    });
    out.byHash = byHash;
    return out;
  }
  function addPending(list, value) {
    var cloned = copy(value);
    if (cloned === null || cloned === undefined) return;
    var encoded = stableStringify(cloned);
    if (encoded !== undefined && !list.some(function (item) { return stableStringify(item) === encoded; })) list.push(cloned);
  }
  function sortPending(list) {
    list.sort(function (a, b) { return compare(stableStringify(a), stableStringify(b)); });
    return list;
  }
  function bucket(out, hash) {
    return out.byHash[hash] || (out.byHash[hash] = { items: {}, deleted: {} });
  }
  function singleEntry(key, value) {
    var entry = {};
    Object.defineProperty(entry, key, { configurable: true, enumerable: true, writable: true, value: value });
    return entry;
  }
  function validRecord(raw, key) {
    if (!object(raw) || !validId(key) || raw.id !== key || !validId(raw.id) ||
        !Number.isSafeInteger(raw.page) || raw.page < 1 || !finite(raw.y0) ||
        !finite(raw.y1) || raw.y0 < 0 || raw.y0 >= raw.y1 || raw.y1 > 1 ||
        !timestamp(raw.updatedAt)) return null;
    if (Object.keys(raw).some(function (field) { return !owns(RECORD_KEYS, field); })) return null;
    return { id: raw.id, page: raw.page, y0: raw.y0, y1: raw.y1, updatedAt: raw.updatedAt };
  }
  function tupleGreater(a, b) {
    return a.page !== b.page ? a.page > b.page : a.y0 !== b.y0 ? a.y0 > b.y0 : a.y1 > b.y1;
  }
  function recordWinner(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
    return tupleGreater(a, b) ? a : b;
  }
  function normalizePayload(value, pending, now) {
    var out = empty(), cap = capAt(now), future = empty();
    if (value === null || value === undefined) return out;
    if (!object(value)) { addPending(pending, value); return out; }
    if (!owns(value, 'version') || value.version !== VERSION) {
      addPending(pending, value);
      return out;
    }
    if (!object(value.byHash)) { addPending(pending, value); return out; }

    Object.keys(value.byHash).forEach(function (rawHash) {
      var hash = hashKey(rawHash), rawBucket = value.byHash[rawHash];
      if (!hash || !object(rawBucket)) {
        addPending(pending, { version: VERSION, byHash: singleEntry(rawHash, rawBucket) });
        return;
      }
      var target = bucket(out, hash), deferred = bucket(future, hash);
      if (object(rawBucket.items)) Object.keys(rawBucket.items).forEach(function (key) {
        var record = validRecord(rawBucket.items[key], key);
        if (!record) return;
        if (record.updatedAt > cap) deferred.items[key] = record;
        else target.items[key] = recordWinner(owns(target.items, key) ? target.items[key] : null, record);
      });
      if (object(rawBucket.deleted)) Object.keys(rawBucket.deleted).forEach(function (key) {
        var stamp = rawBucket.deleted[key];
        if (!validId(key) || !timestamp(stamp)) return;
        if (stamp > cap) deferred.deleted[key] = Math.max(owns(deferred.deleted, key) ? deferred.deleted[key] : 0, stamp);
        else target.deleted[key] = Math.max(owns(target.deleted, key) ? target.deleted[key] : 0, stamp);
      });
    });
    Object.keys(out.byHash).forEach(function (hash) {
      var b = out.byHash[hash];
      Object.keys(b.items).sort(compare).forEach(function (key) { b.items[key] = { id: b.items[key].id, page: b.items[key].page, y0: b.items[key].y0, y1: b.items[key].y1, updatedAt: b.items[key].updatedAt }; });
      Object.keys(b.deleted).sort(compare).forEach(function (key) { b.deleted[key] = b.deleted[key]; });
      if (!Object.keys(b.items).length && !Object.keys(b.deleted).length) delete out.byHash[hash];
    });
    Object.keys(future.byHash).forEach(function (hash) {
      var b = future.byHash[hash];
      if (Object.keys(b.items).length || Object.keys(b.deleted).length) addPending(pending, { version: VERSION, byHash: singleEntry(hash, b) });
    });
    return out;
  }
  function envelopeParts(value) {
    if (object(value) && owns(value, 'folds')) return { folds: value.folds,
      pending: Array.isArray(value.pending) ? value.pending : value.pending === undefined || value.pending === null ? [] : [value.pending] };
    return { folds: value, pending: [] };
  }
  function normalize(value, pendingValue, validationNow) {
    var now = nowValue(validationNow), supplied = Array.isArray(pendingValue) ? pendingValue
      : pendingValue === undefined || pendingValue === null ? [] : [pendingValue], pending = [], parts = envelopeParts(value);
    parts.pending.forEach(function (item) { addPending(pending, item); });
    supplied.forEach(function (item) { addPending(pending, item); });
    var folds = normalizePayload(parts.folds, pending, now);
    // Revisit quarantined v1 payloads when a later clock makes them valid.
    var remain = [];
    pending.forEach(function (item) {
      var retried = [], parsed = normalizePayload(item, retried, now);
      Object.keys(parsed.byHash).forEach(function (hash) {
        var target = bucket(folds, hash), incoming = parsed.byHash[hash];
        Object.keys(incoming.items).forEach(function (id) { target.items[id] = recordWinner(owns(target.items, id) ? target.items[id] : null, incoming.items[id]); });
        Object.keys(incoming.deleted).forEach(function (id) { target.deleted[id] = Math.max(owns(target.deleted, id) ? target.deleted[id] : 0, incoming.deleted[id]); });
      });
      retried.forEach(function (next) { addPending(remain, next); });
    });
    Object.keys(folds.byHash).forEach(function (hash) {
      var b = folds.byHash[hash];
      Object.keys(b.items).forEach(function (id) { b.items[id] = recordWinner(null, b.items[id]); });
    });
    return { folds: canonicalize(folds), pending: sortPending(remain) };
  }
  function merge(left, right, validationNow) {
    var now = nowValue(validationNow), a = normalize(left, [], now), b = normalize(right, [], now), folds = empty(), pending = [];
    [a, b].forEach(function (envelope) {
      envelope.pending.forEach(function (item) { addPending(pending, item); });
      Object.keys(envelope.folds.byHash).forEach(function (hash) {
        var target = bucket(folds, hash), source = envelope.folds.byHash[hash];
        Object.keys(source.items).forEach(function (id) { target.items[id] = recordWinner(owns(target.items, id) ? target.items[id] : null, source.items[id]); });
        Object.keys(source.deleted).forEach(function (id) { target.deleted[id] = Math.max(owns(target.deleted, id) ? target.deleted[id] : 0, source.deleted[id]); });
      });
    });
    return normalize({ folds: folds, pending: pending }, [], now);
  }
  function logicalStamp(bucketValue, id, now) {
    var live = bucketValue && owns(bucketValue.items, id) ? bucketValue.items[id] : null;
    var dead = bucketValue && owns(bucketValue.deleted, id) ? bucketValue.deleted[id] : 0;
    var known = Math.max(live ? live.updatedAt : 0, dead || 0), stamp = Math.max(now, known + 1);
    if (!timestamp(stamp) || stamp > capAt(now)) throw new RangeError('PDF fold timestamp exhausted');
    return stamp;
  }
  function mutationInput(envelope, hash, now) {
    var normalized = normalize(envelope, [], now), key = hashKey(hash);
    if (!key) throw new TypeError('A verified SHA-256 PDF hash is required');
    return { state: normalized, hash: key, bucket: bucket(normalized.folds, key), now: now };
  }
  function upsert(envelope, hash, rawRecord, validationNow) {
    var now = nowValue(validationNow), input = mutationInput(envelope, hash, now);
    var recordInput = rawRecord;
    if (object(rawRecord) && !owns(rawRecord, 'updatedAt')) {
      recordInput = { id: rawRecord.id, page: rawRecord.page, y0: rawRecord.y0, y1: rawRecord.y1, updatedAt: 0 };
      if (Object.keys(rawRecord).some(function (field) { return !owns({ id: true, page: true, y0: true, y1: true }, field); })) recordInput = null;
    }
    var record = validRecord(recordInput, recordInput && recordInput.id);
    if (!record) throw new TypeError('Invalid PDF fold record');
    var stamp = logicalStamp(input.bucket, record.id, now);
    input.bucket.items[record.id] = { id: record.id, page: record.page, y0: record.y0, y1: record.y1, updatedAt: stamp };
    return normalize(input.state, [], now);
  }
  function remove(envelope, hash, ids, validationNow) {
    var now = nowValue(validationNow), input = mutationInput(envelope, hash, now);
    if (!Array.isArray(ids) || !ids.length || ids.some(function (id) { return !validId(id); })) throw new TypeError('Invalid PDF fold IDs');
    Array.from(new Set(ids)).sort(compare).forEach(function (id) {
      input.bucket.deleted[id] = logicalStamp(input.bucket, id, now);
    });
    return normalize(input.state, [], now);
  }
  function activeBands(value, hash, page, verifiedPageCount) {
    var normalized = normalize(value), key = hashKey(hash), source = key && normalized.folds.byHash[key];
    if (!source || !Number.isSafeInteger(page) || page < 1 ||
        (Number.isSafeInteger(verifiedPageCount) && verifiedPageCount > 0 && page > verifiedPageCount)) return [];
    var items = Object.keys(source.items).map(function (id) { return source.items[id]; }).filter(function (item) {
      return item.page === page && (!owns(source.deleted, item.id) || item.updatedAt > source.deleted[item.id]);
    }).sort(function (a, b) { return a.y0 - b.y0 || a.y1 - b.y1 || compare(a.id, b.id); });
    var bands = [];
    items.forEach(function (item) {
      var last = bands[bands.length - 1];
      if (last && item.y0 <= last.y1) {
        last.y1 = Math.max(last.y1, item.y1);
        last.ids.push(item.id); last.ids.sort(compare);
      } else bands.push({ page: page, y0: item.y0, y1: item.y1, ids: [item.id] });
    });
    return bands;
  }

  global.PhloemFolds = Object.freeze({ normalize: normalize, merge: merge, upsert: upsert, remove: remove, activeBands: activeBands });
})(window);
