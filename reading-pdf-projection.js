/* Pure source/display coordinate projection for reversible full-width PDF folds. */
(function (global) {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function uniqueIds(values) {
    var seen = Object.create(null), result = [];
    (Array.isArray(values) ? values : []).forEach(function (id) {
      if (typeof id === 'string' && id && !seen[id]) { seen[id] = true; result.push(id); }
    });
    return result.sort();
  }
  function build(options) {
    options = options || {};
    var width = +options.width, height = +options.height;
    var seamHeight = options.seamHeight === undefined ? 44 : +options.seamHeight;
    if (!finite(width) || width <= 0 || !finite(height) || height <= 0 || !finite(seamHeight) || seamHeight < 0) {
      throw new TypeError('PDF projection needs positive finite dimensions and a nonnegative seam height');
    }
    var bands = (Array.isArray(options.bands) ? options.bands : []).map(function (band) {
      if (!band || !finite(band.y0) || !finite(band.y1) || band.y0 < 0 || band.y0 >= band.y1 || band.y1 > 1) return null;
      var start = band.y0 * height, end = band.y1 * height;
      return { start: start, end: end, ids: uniqueIds(band.ids || (band.id ? [band.id] : [])) };
    }).filter(Boolean).sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var merged = [];
    bands.forEach(function (band) {
      var last = merged[merged.length - 1];
      if (last && band.start <= last.end) {
        last.end = Math.max(last.end, band.end);
        last.ids = uniqueIds(last.ids.concat(band.ids));
      } else merged.push({ start: band.start, end: band.end, ids: band.ids.slice() });
    });

    // Merging can make two individually-small removals large enough, or vice versa.
    // Recheck the union while keeping the source untouched when it is zoom-suppressed.
    merged = merged.filter(function (band) { return band.end - band.start > seamHeight + 8; });
    var visibleIntervals = [], displayIntervals = [], seamIntervals = [], sourceCursor = 0, displayCursor = 0;
    merged.forEach(function (band) {
      var displayStart = band.start - (sourceCursor - displayCursor);
      visibleIntervals.push({ start: sourceCursor, end: band.start });
      displayIntervals.push({ start: displayCursor, end: displayStart });
      var seam = { start: displayStart, end: displayStart + seamHeight, foldIds: band.ids.slice() };
      seamIntervals.push(seam);
      displayCursor = seam.end;
      sourceCursor = band.end;
    });
    visibleIntervals.push({ start: sourceCursor, end: height });
    displayIntervals.push({ start: displayCursor, end: displayCursor + (height - sourceCursor) });
    var displayHeight = displayCursor + (height - sourceCursor);

    function outside() { return { kind: 'outside' }; }
    function sourceToDisplay(point) {
      if (!point || !finite(point.x) || !finite(point.y) || point.x < 0 || point.x > width || point.y < 0 || point.y > height) return outside();
      var removed = 0;
      for (var i = 0; i < merged.length; i++) {
        var band = merged[i];
        if (point.y >= band.start && point.y < band.end) return { kind: 'hidden', foldIds: band.ids.slice() };
        if (point.y >= band.end) removed += band.end - band.start - seamHeight;
        else if (point.y < band.start) break;
      }
      return { kind: 'visible', point: { x: point.x, y: point.y - removed } };
    }
    function displayToSource(point) {
      if (!point || !finite(point.x) || !finite(point.y) || point.x < 0 || point.x > width || point.y < 0 || point.y > displayHeight) return outside();
      var removed = 0;
      for (var i = 0; i < merged.length; i++) {
        var band = merged[i], start = band.start - removed, end = start + seamHeight;
        if (point.y >= start && point.y < end) return { kind: 'seam', foldIds: band.ids.slice() };
        if (point.y >= end) removed += band.end - band.start - seamHeight;
        else break;
      }
      return { kind: 'visible', point: { x: point.x, y: point.y + removed } };
    }
    function projectRect(rect) {
      if (!rect || !finite(rect.x) || !finite(rect.y) || !finite(rect.width) || !finite(rect.height) || rect.width <= 0 || rect.height <= 0) return [];
      var left = clamp(rect.x, 0, width), right = clamp(rect.x + rect.width, 0, width);
      var top = clamp(rect.y, 0, height), bottom = clamp(rect.y + rect.height, 0, height);
      if (right <= left || bottom <= top) return [];
      var fragments = [];
      visibleIntervals.forEach(function (interval, index) {
        var sourceTop = Math.max(top, interval.start), sourceBottom = Math.min(bottom, interval.end);
        if (sourceBottom <= sourceTop) return;
        var displayInterval = displayIntervals[index];
        fragments.push({
          x: left,
          y: displayInterval.start + (sourceTop - interval.start),
          width: right - left,
          height: sourceBottom - sourceTop,
          sourceY: sourceTop,
          sourceHeight: sourceBottom - sourceTop
        });
      });
      return fragments;
    }
    function projectPolyline(points) {
      if (!Array.isArray(points) || points.length < 2) return [];
      var paths = [];
      function pushPart(intervalIndex, part) {
        if (part.length < 2) return;
        var previous = paths[paths.length - 1];
        if (previous && previous.intervalIndex === intervalIndex && previous.points[previous.points.length - 1].x === part[0].x && previous.points[previous.points.length - 1].y === part[0].y) {
          previous.points.push.apply(previous.points, part.slice(1));
        } else paths.push({ intervalIndex: intervalIndex, points: part });
      }
      for (var s = 1; s < points.length; s++) {
        var a = points[s - 1], b = points[s];
        if (!a || !b || !finite(a.x) || !finite(a.y) || !finite(b.x) || !finite(b.y)) continue;
        for (var i = 0; i < visibleIntervals.length; i++) {
          var interval = visibleIntervals[i], low = interval.start, high = interval.end;
          var dy = b.y - a.y, t0 = 0, t1 = 1;
          if (dy === 0) {
            if (a.y < low || a.y > high || (a.y === high && high < height)) continue;
          } else {
            var ta = (low - a.y) / dy, tb = (high - a.y) / dy;
            t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb));
            if (t1 < t0 || (t1 === t0 && !(low === 0 || high === height))) continue;
          }
          var p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + dy * t0 };
          var p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + dy * t1 };
          if (p0.x < 0 || p0.x > width || p1.x < 0 || p1.x > width) continue;
          var offset = displayIntervals[i].start - interval.start;
          pushPart(i, [{ x: p0.x, y: p0.y + offset }, { x: p1.x, y: p1.y + offset }]);
        }
      }
      return paths.map(function (path) { return path.points; });
    }

    return {
      width: width,
      height: height,
      seamHeight: seamHeight,
      visibleIntervals: visibleIntervals,
      displayIntervals: displayIntervals,
      seamIntervals: seamIntervals,
      displayHeight: displayHeight,
      sourceToDisplay: sourceToDisplay,
      displayToSource: displayToSource,
      projectRect: projectRect,
      projectPolyline: projectPolyline
    };
  }

  global.PhloemPdfProjection = Object.freeze({ build: build });
})(window);
