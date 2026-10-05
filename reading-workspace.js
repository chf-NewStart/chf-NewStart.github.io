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

  function cardMap(cards) {
    var result = new Map();
    if (!Array.isArray(cards)) return result;
    cards.forEach(function (raw) {
      try {
        if (!object(raw) || !id(raw.id) || !finite(raw.x) || !finite(raw.y) ||
            !finite(raw.width) || !finite(raw.height) || raw.width <= 0 ||
            raw.height < 0 || raw.width > BOARD_WIDTH || raw.height > MAX_HEIGHT) return;
        var box = { id: raw.id, x: raw.x, y: raw.y, width: raw.width, height: raw.height };
        // Duplicate DOM measurements must not make selection depend on input order.
        if (!result.has(box.id) || JSON.stringify(box) > JSON.stringify(result.get(box.id)))
          result.set(box.id, box);
      } catch (error) { /* One unavailable card cannot hide the rest of the board. */ }
    });
    return result;
  }
  function groupPositions(cards) {
    var result = Object.create(null);
    cards.forEach(function (box, key) {
      // The controller can constrain a saved card to the currently visible paper.
      // Selection and movement must use that displayed placement consistently.
      result[key] = box;
    });
    return result;
  }
  function validPolygon(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 8192) return false;
    for (var i = 0; i < polygon.length; i++) {
      var point = polygon[i];
      if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) ||
          !finite(point[1]) || point[0] < 0 || point[0] > BOARD_WIDTH ||
          point[1] < 0 || point[1] > MAX_HEIGHT) return false;
    }
    // A repeated closing point is fine, but a line or a single point is not a lasso.
    var first = polygon[0], second = null;
    for (i = 1; i < polygon.length; i++) {
      if (!second && (polygon[i][0] !== first[0] || polygon[i][1] !== first[1])) second = polygon[i];
      else if (second && cross(first, second, polygon[i]) !== 0) return true;
    }
    return false;
  }
  function cross(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  function onSegment(point, a, b) {
    return Math.abs(cross(a, b, point)) < 1e-7 &&
      point[0] >= Math.min(a[0], b[0]) - 1e-9 && point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-9 && point[1] <= Math.max(a[1], b[1]) + 1e-9;
  }
  function insidePolygon(point, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var a = polygon[j], b = polygon[i];
      if (onSegment(point, a, b)) return true;
      if ((a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function segmentsIntersect(a, b, c, d) {
    var abC = cross(a, b, c), abD = cross(a, b, d);
    var cdA = cross(c, d, a), cdB = cross(c, d, b);
    return (abC > 0 && abD < 0 || abC < 0 && abD > 0) &&
      (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0) ||
      onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
  }
  function distanceSquared(point, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var t = dx || dy ? clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
      (dx * dx + dy * dy), 0, 1) : 0;
    var x = point[0] - a[0] - t * dx, y = point[1] - a[1] - t * dy;
    return x * x + y * y;
  }
  function strokeIntersects(stroke, polygon) {
    // Ink widths use the renderer's 612-unit page scale. Use the largest visible
    // pressure radius so a lasso touching an outer edge still selects the stroke.
    var radius = stroke.width * 1000 / 612 * (stroke.nib === 'marker' ? 1.35 * 1.45 : 1.15) / 2;
    var points = stroke.points, radiusSquared = radius * radius;
    for (var i = 0; i < points.length; i++) {
      var a = points[i], b = points[Math.max(0, i - 1)];
      if (insidePolygon(a, polygon)) return true;
      for (var j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
        var c = polygon[k], d = polygon[j];
        if (segmentsIntersect(a, b, c, d) ||
            Math.min(distanceSquared(a, c, d), distanceSquared(b, c, d),
              distanceSquared(c, a, b), distanceSquared(d, a, b)) <= radiusSquared) return true;
      }
    }
    return false;
  }
  function closeGroup(state, cards, clipIds, strokeIds) {
    state.strokes.forEach(function (entry) {
      if (strokeIds.has(entry.id) && entry.anchor && cards.has(entry.anchor.clipId))
        clipIds.add(entry.anchor.clipId);
    });
    state.strokes.forEach(function (entry) {
      if (entry.anchor && clipIds.has(entry.anchor.clipId)) strokeIds.add(entry.id);
    });
  }
  function groupBounds(state, cards, clipIds, strokeIds) {
    var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    function include(x, y) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    clipIds.forEach(function (key) {
      var box = cards.get(key);
      include(box.x, box.y); include(box.x + box.width, box.y + box.height);
    });
    var positions = groupPositions(cards);
    state.strokes.forEach(function (entry) {
      if (strokeIds.has(entry.id)) displayStroke(entry, positions).points.forEach(function (point) {
        include(point[0], point[1]);
      });
    });
    return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
  }
  function selectGroup(value, polygon, cards) {
    var state = normalize(value), available = cardMap(cards);
    var clipIds = new Set(), strokeIds = new Set();
    if (!validPolygon(polygon)) return { clipIds: [], strokeIds: [], bounds: null };
    available.forEach(function (box, key) {
      if (insidePolygon([box.x + box.width / 2, box.y + box.height / 2], polygon)) clipIds.add(key);
    });
    var positions = groupPositions(available);
    state.strokes.forEach(function (entry) {
      if (strokeIntersects(displayStroke(entry, positions), polygon)) strokeIds.add(entry.id);
    });
    closeGroup(state, available, clipIds, strokeIds);
    return { clipIds: Array.from(clipIds).sort(compare), strokeIds: Array.from(strokeIds).sort(compare),
      bounds: groupBounds(state, available, clipIds, strokeIds) };
  }
  function selectedIds(values, available) {
    if (!Array.isArray(values)) throw new TypeError('Invalid reading-workspace selection');
    var result = new Set();
    for (var i = 0; i < values.length; i++) {
      if (!owns(values, i) || !id(values[i]) || !available.has(values[i]))
        throw new TypeError('Invalid reading-workspace selection');
      result.add(values[i]);
    }
    return result;
  }
  function moveGroup(value, selection, delta, cards, stamp) {
    var state = normalize(value), cap = ceiling(), available = cardMap(cards);
    if (!object(selection) || !object(delta) || !finite(delta.x) || !finite(delta.y))
      throw new TypeError('Invalid reading-workspace group move');
    if (!timestamp(stamp, cap)) throw new RangeError('Invalid reading-workspace timestamp');
    var liveStrokes = new Map(state.strokes.map(function (entry) { return [entry.id, entry]; }));
    var clipIds = selectedIds(selection.clipIds, available);
    var strokeIds = selectedIds(selection.strokeIds, liveStrokes);
    closeGroup(state, available, clipIds, strokeIds);
    var bounds = groupBounds(state, available, clipIds, strokeIds);
    if (!bounds) return state;
    if (!finite(bounds.x) || !finite(bounds.y) || !finite(bounds.width) || !finite(bounds.height) ||
        bounds.width > BOARD_WIDTH || bounds.height > MAX_HEIGHT)
      throw new RangeError('Reading-workspace group does not fit on paper');
    var dx = clamp(delta.x, -bounds.x, BOARD_WIDTH - bounds.x - bounds.width);
    var dy = clamp(delta.y, -bounds.y, MAX_HEIGHT - bounds.y - bounds.height);
    if (!dx && !dy) return state;
    var bottom = bounds.y + bounds.height + dy;
    // Match ensureSpace's 1000-unit growth, including ink reaching the current edge.
    state.height = Math.min(MAX_HEIGHT, Math.max(state.height, (Math.floor(bottom / 1000) + 1) * 1000));
    Array.from(clipIds).sort(compare).forEach(function (key) {
      var base = available.get(key), tolerance = 1e-7;
      if (base.width < 280 || base.width > 900 || base.x + dx < -tolerance ||
          base.x + dx > BOARD_WIDTH - base.width + tolerance ||
          base.y + dy < -tolerance || base.y + dy > MAX_HEIGHT + tolerance)
        throw new RangeError('Invalid reading-workspace card geometry');
      state = place(state, key, { x: base.x + dx, y: base.y + dy, width: base.width }, stamp);
    });
    Array.from(strokeIds).sort(compare).forEach(function (key) {
      var entry = liveStrokes.get(key);
      // Moving an owner already moves all of its writing through displayStroke.
      if (entry.anchor && clipIds.has(entry.anchor.clipId)) return;
      var moved = Object.assign({}, entry, { points: entry.points.map(function (point) {
        return [clamp(point[0] + dx, 0, BOARD_WIDTH), clamp(point[1] + dy, 0, MAX_HEIGHT), point[2]];
      }) });
      if (entry.anchor) {
        // An unavailable owner displays raw fallback points. Detach on movement so
        // later restoring that owner cannot apply a second, unrelated transform.
        delete moved.anchor;
        var old = state.strokes.find(function (item) { return item.id === key; });
        delete old.anchor;
      }
      state = addStroke(state, moved, stamp);
    });
    return normalize(state);
  }

  global.PhloemWorkspaceState = Object.freeze({ VERSION: VERSION,
    BOARD_WIDTH: BOARD_WIDTH, MAX_HEIGHT: MAX_HEIGHT, normalize: normalize, merge: merge, place: place,
    addStroke: addStroke, removeStrokes: removeStrokes, setHeight: setHeight,
    displayStroke: displayStroke, selectGroup: selectGroup, moveGroup: moveGroup });
})(window);
