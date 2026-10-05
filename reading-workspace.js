/* Local split-reader workspace geometry and ink. No DOM, storage, or network. */
(function (global) {
  'use strict';

  var VERSION = 2;
  var BOARD_WIDTH = 1000;
  var DEFAULT_HEIGHT = 2000;
  var MAX_HEIGHT = 1000000;
  var FUTURE_WINDOW = 366 * 24 * 60 * 60 * 1000;
  var COLORS = { black: true, blue: true, red: true, green: true,
    purple: true, orange: true, teal: true, gray: true };
  var FORBIDDEN_IDS = Object.create(null);
  FORBIDDEN_IDS.__proto__ = true;
  FORBIDDEN_IDS.constructor = true;
  FORBIDDEN_IDS.prototype = true;

  function owns(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function id(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      !owns(FORBIDDEN_IDS, value);
  }
  function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function ceiling() {
    var now = Date.now();
    if (!integer(now)) now = 0;
    return Math.min(Number.MAX_SAFE_INTEGER - 1, now + FUTURE_WINDOW);
  }
  function timestamp(value, cap) { return integer(value) && value <= cap; }
  function unsupported(version) {
    var error = new Error('Unsupported reading-workspace version');
    error.code = 'UNSUPPORTED_VERSION';
    error.version = version;
    throw error;
  }
  function checkVersion(value) {
    // V1 uses the same logical coordinates. A V2 writer migrates it without
    // geometry changes; V1 writers fail closed on V2 instead of dropping taller ink.
    if (object(value) && owns(value, 'version') && value.version !== 1 &&
        value.version !== VERSION) unsupported(value.version);
  }
  function height(value) {
    return Number.isSafeInteger(value) && value >= DEFAULT_HEIGHT &&
      value <= MAX_HEIGHT && value % 1000 === 0;
  }
  function position(raw, boardHeight, cap) {
    if (!object(raw) || !finite(raw.x) || !finite(raw.y) ||
        owns(raw, 'width') && !finite(raw.width) || !timestamp(raw.updatedAt, cap)) return null;
    var width = clamp(owns(raw, 'width') ? raw.width : 420, 280, 900);
    return { x: clamp(raw.x, 0, BOARD_WIDTH - width),
      y: clamp(raw.y, 0, boardHeight), width: width, updatedAt: raw.updatedAt };
  }
  function anchor(raw) {
    if (!object(raw) || !id(raw.clipId) || !finite(raw.x) || !finite(raw.y) ||
        !finite(raw.width) || raw.width < 280 || raw.width > 900 ||
        raw.x < 0 || raw.x > BOARD_WIDTH - raw.width ||
        raw.y < 0 || raw.y > MAX_HEIGHT) return null;
    return { clipId: raw.clipId, x: raw.x, y: raw.y, width: raw.width };
  }
  function stroke(raw, cap) {
    if (!object(raw) || !id(raw.id) || !owns(COLORS, raw.color) ||
        !finite(raw.width) || raw.width < .5 || raw.width > 12 ||
        !Array.isArray(raw.points) || raw.points.length < 1 || raw.points.length > 8192 ||
        raw.style !== 'natural' || !timestamp(raw.createdAt, cap) ||
        !timestamp(raw.updatedAt, cap) || raw.updatedAt < raw.createdAt) return null;
    var points = [];
    for (var i = 0; i < raw.points.length; i++) {
      var point = raw.points[i];
      if (!Array.isArray(point) || point.length !== 3 || !finite(point[0]) ||
          !finite(point[1]) || !finite(point[2]) || point[0] < 0 ||
          point[0] > BOARD_WIDTH || point[1] < 0 || point[1] > MAX_HEIGHT ||
          point[2] < 0 || point[2] > 1) return null;
      points.push([point[0], point[1], point[2]]);
    }
    var entry = { id: raw.id, color: raw.color, width: raw.width, points: points,
      style: 'natural', createdAt: raw.createdAt, updatedAt: raw.updatedAt };
    // Optional V2 fields leave the original global points available for fallback display.
    try {
      if (raw.nib === 'marker') entry.nib = 'marker';
      if (raw.shape === 'line') entry.shape = 'line';
      var base = anchor(raw.anchor);
      if (base) entry.anchor = base;
    } catch (error) { /* Damaged optional metadata must not discard otherwise valid ink. */ }
    return entry;
  }
  function displayStroke(raw, positions) {
    if (!object(raw) || !Array.isArray(raw.points) || !finite(raw.width))
      throw new TypeError('Invalid reading-workspace stroke');
    var result = Object.assign({}, raw);
    result.points = raw.points.map(function (point) { return point.slice(); });
    var base = anchor(raw.anchor);
    if (base) result.anchor = base;
    if (!base || !object(positions) || !owns(positions, base.clipId)) return result;
    var current = positions[base.clipId];
    if (!object(current) || !finite(current.x) || !finite(current.y) ||
        !finite(current.width) || current.width <= 0) return result;
    var scale = current.width / base.width;
    result.points = raw.points.map(function (point) {
      return [current.x + (point[0] - base.x) * scale,
        current.y + (point[1] - base.y) * scale, point[2]];
    });
    result.width = raw.width * scale;
    return result;
  }
  function pick(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }
  function collect(value, positions, strokes, deleted, cap) {
    checkVersion(value);
    if (!object(value)) return DEFAULT_HEIGHT;
    var boardHeight = height(value.height) ? value.height : DEFAULT_HEIGHT;
    if (object(value.positions)) Object.keys(value.positions).forEach(function (key) {
      try {
        if (!id(key)) return;
        var entry = position(value.positions[key], boardHeight, cap);
        if (entry) positions.set(key, pick(positions.get(key), entry));
      } catch (error) { /* An invalid card cannot discard its neighbors. */ }
    });
    if (Array.isArray(value.strokes)) value.strokes.forEach(function (raw) {
      try {
        var entry = stroke(raw, cap);
        if (entry) strokes.set(entry.id, pick(strokes.get(entry.id), entry));
      } catch (error) { /* An invalid stroke cannot discard its neighbors. */ }
    });
    if (object(value.deleted)) Object.keys(value.deleted).forEach(function (key) {
      try {
        var stamp = value.deleted[key];
        if (id(key) && timestamp(stamp, cap) &&
            (!deleted.has(key) || stamp > deleted.get(key))) deleted.set(key, stamp);
      } catch (error) { /* Ignore one damaged tombstone. */ }
    });
    return boardHeight;
  }
  function finish(boardHeight, positions, strokes, tombstones) {
    var outPositions = Object.create(null), deleted = Object.create(null);
    Array.from(positions.keys()).sort(compare).forEach(function (key) {
      var entry = positions.get(key);
      outPositions[key] = { x: clamp(entry.x, 0, BOARD_WIDTH - entry.width),
        y: clamp(entry.y, 0, boardHeight), width: entry.width, updatedAt: entry.updatedAt };
    });
    Array.from(tombstones.keys()).sort(compare).forEach(function (key) {
      deleted[key] = tombstones.get(key);
    });
    var outStrokes = Array.from(strokes.values()).filter(function (entry) {
      return !tombstones.has(entry.id) || entry.updatedAt > tombstones.get(entry.id);
    });
    outStrokes.sort(function (a, b) { return compare(a.id, b.id); });
    return { version: VERSION, height: boardHeight, positions: outPositions,
      strokes: outStrokes, deleted: deleted };
  }
  function normalize(value) {
    var positions = new Map(), strokes = new Map(), deleted = new Map(), cap = ceiling();
    var boardHeight = collect(value, positions, strokes, deleted, cap);
    return finish(boardHeight, positions, strokes, deleted);
  }
  function merge(left, right) {
    checkVersion(left);
    checkVersion(right);
    var positions = new Map(), strokes = new Map(), deleted = new Map(), cap = ceiling();
    var leftHeight = collect(left, positions, strokes, deleted, cap);
    var rightHeight = collect(right, positions, strokes, deleted, cap);
    return finish(Math.max(leftHeight, rightHeight), positions, strokes, deleted);
  }
  function nextStamp(requested, previous, cap) {
    if (!timestamp(requested, cap)) throw new RangeError('Invalid reading-workspace timestamp');
    var stamp = Math.max(requested, previous + 1, 1);
    if (stamp > cap) throw new RangeError('Reading-workspace timestamp exhausted');
    return stamp;
  }
  function place(value, clipId, raw, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!id(clipId) || !object(raw) || !finite(raw.x) || !finite(raw.y) ||
        owns(raw, 'width') && !finite(raw.width)) throw new TypeError('Invalid reading-workspace position');
    var old = state.positions[clipId];
    var at = nextStamp(stamp, old ? old.updatedAt : 0, cap);
    state.positions[clipId] = position({ x: raw.x, y: raw.y,
      width: owns(raw, 'width') ? raw.width : 420, updatedAt: at }, state.height, cap);
    return normalize(state);
  }
  function addStroke(value, raw, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!object(raw) || !id(raw.id)) throw new TypeError('Invalid reading-workspace stroke');
    if (owns(raw, 'anchor') && !anchor(raw.anchor) ||
        owns(raw, 'nib') && raw.nib !== 'marker' ||
        owns(raw, 'shape') && raw.shape !== 'line')
      throw new TypeError('Invalid reading-workspace stroke metadata');
    var old = state.strokes.find(function (entry) { return entry.id === raw.id; });
    var deletedAt = owns(state.deleted, raw.id) ? state.deleted[raw.id] : 0;
    var at = nextStamp(stamp, Math.max(old ? old.updatedAt : 0, deletedAt), cap);
    var candidate = { id: raw.id, color: raw.color, width: raw.width,
      points: raw.points, style: 'natural', createdAt: old ? old.createdAt : at,
      updatedAt: at };
    if (owns(raw, 'anchor')) candidate.anchor = raw.anchor;
    else if (old && old.anchor) candidate.anchor = old.anchor;
    if (owns(raw, 'nib')) candidate.nib = raw.nib;
    else if (old && old.nib) candidate.nib = old.nib;
    if (owns(raw, 'shape')) candidate.shape = raw.shape;
    else if (old && old.shape) candidate.shape = old.shape;
    var entry = stroke(candidate, cap);
    if (!entry) throw new TypeError('Invalid reading-workspace stroke');
    state.strokes = state.strokes.filter(function (existing) { return existing.id !== entry.id; });
    state.strokes.push(entry);
    return normalize(state);
  }
  function removeStrokes(value, ids, stamp) {
    var state = normalize(value), cap = ceiling();
    if (!Array.isArray(ids)) throw new TypeError('Invalid reading-workspace stroke ids');
    for (var i = 0; i < ids.length; i++) {
      if (!owns(ids, i) || !id(ids[i])) throw new TypeError('Invalid reading-workspace stroke ids');
    }
    if (!timestamp(stamp, cap)) throw new RangeError('Invalid reading-workspace timestamp');
    var unique = Array.from(new Set(ids));
    unique.forEach(function (key) {
      var old = state.strokes.find(function (entry) { return entry.id === key; });
      var deletedAt = owns(state.deleted, key) ? state.deleted[key] : 0;
      state.deleted[key] = nextStamp(stamp, Math.max(old ? old.updatedAt : 0, deletedAt), cap);
    });
    state.strokes = state.strokes.filter(function (entry) { return unique.indexOf(entry.id) < 0; });
    return normalize(state);
  }
  function setHeight(value, requested) {
    var state = normalize(value);
    if (!height(requested) || requested !== state.height + 1000)
      throw new RangeError('Reading-workspace height must grow by 1000');
    state.height = requested;
    return normalize(state);
  }

  global.PhloemWorkspaceState = Object.freeze({ VERSION: VERSION,
    BOARD_WIDTH: BOARD_WIDTH, MAX_HEIGHT: MAX_HEIGHT, normalize: normalize, merge: merge, place: place,
    addStroke: addStroke, removeStrokes: removeStrokes, setHeight: setHeight,
    displayStroke: displayStroke });
})(window);
