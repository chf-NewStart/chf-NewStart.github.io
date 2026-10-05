/* A local view of the workspace sheet. The original 1000-unit page sets the
   coordinate scale; growing the paper adds room without rescaling saved ink. */
(function (global) {
  'use strict';

  const MIN_ZOOM = .5, MAX_ZOOM = 3, KEY = 'phloem.workspaceZoom.v1';
  // Notes, text and ink are always laid out on a sheet this wide (per 1000 units) and
  // scaled to the pane, like a page in a note app. Moving the divider or rotating the
  // iPad scales the sheet; it never reflows notes or piles them up.
  const LAYOUT_WIDTH = 600;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function create(options) {
    options = options || {};
    const scroll = document.getElementById('workspaceScroll');
    const stage = document.getElementById('workspaceStage');
    const board = document.getElementById('workspaceBoard');
    const out = document.getElementById('workspaceZoomOut');
    const reset = document.getElementById('workspaceZoomReset');
    const increase = document.getElementById('workspaceZoomIn');
    if (![scroll, stage, board, out, reset, increase].every(Boolean)) throw new Error('Workspace viewport DOM is missing');

    let zoom = 1, logicalHeight = 2000, logicalWidth = 1000, baseWidth = 0;
    let lastNeedY = 0, lastNeedX = 0;
    let pinch = null;
    const touches = new Map();
    try {
      const stored = Number(global.localStorage.getItem(KEY));
      if (Number.isFinite(stored) && stored >= MIN_ZOOM && stored <= MAX_ZOOM) zoom = stored;
    } catch (_) { /* Private storage can be unavailable. */ }

    function isBusy() { return typeof options.isBusy === 'function' && options.isBusy(); }
    function storeZoom() {
      try { global.localStorage.setItem(KEY, String(zoom)); } catch (_) { /* Zoom remains usable in memory. */ }
    }
    function updateControls() {
      reset.textContent = `${Math.round(zoom * 100)}%`;
      reset.setAttribute('aria-label', `Reset workspace zoom, currently ${Math.round(zoom * 100)} percent`);
      out.disabled = zoom <= MIN_ZOOM + .001;
      increase.disabled = zoom >= MAX_ZOOM - .001;
    }
    function limit(name) { return global.PhloemWorkspaceState && Number(global.PhloemWorkspaceState[name]) || 1000000; }
    function needSpace(left = scroll.scrollLeft, top = scroll.scrollTop) {
      if (!baseWidth || !scroll.clientHeight || typeof options.onNeedSpace !== 'function') return;
      const scale = baseWidth * zoom / 1000;
      const visibleBottom = (top + scroll.clientHeight) / scale;
      const visibleRight = (left + scroll.clientWidth) / scale;
      const neededY = Math.min(limit('MAX_HEIGHT') - 1, Math.ceil(visibleBottom + 300));
      const neededX = Math.min(limit('MAX_WIDTH') - 1, Math.ceil(visibleRight + 300));
      const growY = neededY > logicalHeight && neededY > lastNeedY + 50;
      // A normal 100% view can remain 1000 units wide. Zooming out exposes real
      // paper to the right; panning a zoomed-in view all the way to the right
      // edge keeps a margin ahead of it. Zooming in or panning elsewhere does not
      // add width the reader never reached.
      const rightExposed = visibleRight > logicalWidth + .01 || (left > 0 && visibleRight > logicalWidth - 50);
      const growX = rightExposed && neededX > logicalWidth && neededX > lastNeedX + 50;
      if (!growY && !growX) return;
      // Set before callback: a synchronous layout from the adapter must not recurse.
      if (growY) lastNeedY = neededY;
      if (growX) lastNeedX = neededX;
      options.onNeedSpace(growY ? neededY : Math.min(neededY, logicalHeight),
        growX ? neededX : Math.min(neededX, logicalWidth));
    }
    function layoutWidth() { return LAYOUT_WIDTH; }
    function fit() { return baseWidth / layoutWidth(); }
    function sizePaper() {
      board.style.width = `${layoutWidth() * logicalWidth / 1000}px`;
      board.style.minHeight = '0';
      board.style.height = `${layoutWidth() * logicalHeight / 1000}px`;
      board.style.transform = `scale(${zoom * fit()})`;
      stage.style.width = `${Math.max(scroll.clientWidth, baseWidth * logicalWidth * zoom / 1000)}px`;
      stage.style.height = `${Math.max(scroll.clientHeight, baseWidth * logicalHeight * zoom / 1000)}px`;
    }
    function measure() {
      if (!scroll.clientWidth) return;
      const oldWidth = baseWidth;
      const oldCenterX = oldWidth ? (scroll.scrollLeft + scroll.clientWidth / 2) * 1000 / (oldWidth * zoom) : 0;
      const oldCenterY = oldWidth ? (scroll.scrollTop + scroll.clientHeight / 2) * 1000 / (oldWidth * zoom) : 0;
      baseWidth = scroll.clientWidth;
      // At 100% the sheet fits the pane. A reader who zoomed keeps the same on-screen
      // size when the pane changes width, instead of zooming out and back in.
      if (oldWidth && oldWidth !== baseWidth && Math.abs(zoom - 1) > .001) {
        zoom = clamp(zoom * oldWidth / baseWidth, MIN_ZOOM, MAX_ZOOM);
        storeZoom();
      }
      sizePaper();
      if (oldWidth && oldWidth !== baseWidth) {
        scroll.scrollLeft = oldCenterX * baseWidth * zoom / 1000 - scroll.clientWidth / 2;
        scroll.scrollTop = oldCenterY * baseWidth * zoom / 1000 - scroll.clientHeight / 2;
      }
      updateControls();
      needSpace();
    }
    function layout(height, width = 1000) {
      const nextHeight = Number(height), nextWidth = Number(width);
      if (Number.isFinite(nextHeight) && nextHeight >= 1000) logicalHeight = Math.min(limit('MAX_HEIGHT'), nextHeight);
      if (Number.isFinite(nextWidth) && nextWidth >= 1000) logicalWidth = Math.min(limit('MAX_WIDTH'), nextWidth);
      if (logicalHeight >= lastNeedY) lastNeedY = 0;
      if (logicalWidth >= lastNeedX) lastNeedX = 0;
      measure();
    }
    function setZoom(value, anchorX, anchorY, contentX, contentY) {
      if (!baseWidth || !Number.isFinite(value)) return;
      const next = clamp(value, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(next - zoom) < .0001) return;
      const rect = scroll.getBoundingClientRect();
      const x = clamp(anchorX - rect.left, 0, scroll.clientWidth);
      const y = clamp(anchorY - rect.top, 0, scroll.clientHeight);
      const heldX = contentX == null ? (scroll.scrollLeft + x) / zoom : contentX;
      const heldY = contentY == null ? (scroll.scrollTop + y) / zoom : contentY;
      zoom = next;
      sizePaper();
      const nextLeft = Math.max(0, heldX * zoom - x), nextTop = Math.max(0, heldY * zoom - y);
      // Grow before assigning scroll offsets. Otherwise a narrower stage can
      // clamp the requested anchor before its new paper has been laid out.
      needSpace(nextLeft, nextTop);
      scroll.scrollLeft = nextLeft;
      scroll.scrollTop = nextTop;
      updateControls();
      storeZoom();
      needSpace();
    }
    function centerZoom(value) {
      if (isBusy()) return;
      const rect = scroll.getBoundingClientRect();
      setZoom(value, rect.left + scroll.clientWidth / 2, rect.top + scroll.clientHeight / 2);
    }
    function point(event) { return { x: event.clientX, y: event.clientY }; }
    function pair() {
      const values = [...touches.values()];
      if (values.length !== 2) return null;
      const a = values[0], b = values[1];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    function blankTarget(target) {
      return target instanceof Element && scroll.contains(target) &&
        !target.closest('.workspace-card, textarea, input, select, button, [contenteditable="true"]');
    }
    // A live pinch only moves a composited transform, like the PDF pinch: no layout,
    // scroll writes, paper growth or storage until the fingers lift. The zoom is
    // committed once at the end, anchored to the same content point.
    function previewPinch() {
      const p = pinch; if (!p) return;
      p.frame = 0;
      const rect = scroll.getBoundingClientRect();
      const t = { x: scroll.scrollLeft + p.x - rect.left - p.contentX * p.next, y: scroll.scrollTop + p.y - rect.top - p.contentY * p.next };
      board.style.willChange = 'transform';
      board.style.transform = `translate(${t.x}px, ${t.y}px) scale(${p.next * fit()})`;
    }
    function endPinch(commit) {
      const p = pinch; pinch = null;
      if (!p) return;
      if (p.frame) global.cancelAnimationFrame(p.frame);
      board.style.willChange = '';
      board.style.transform = `scale(${zoom * fit()})`;
      if (commit && Math.abs(p.next - zoom) > .0001) setZoom(p.next, p.x, p.y, p.contentX, p.contentY);
    }
    // Ending a pinch early keeps the zoom the reader can already see.
    function cancel() { touches.clear(); endPinch(true); }

    scroll.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !blankTarget(event.target) || isBusy()) return;
      touches.set(event.pointerId, point(event));
      const current = pair();
      if (!current || current.distance < 12) return;
      const rect = scroll.getBoundingClientRect();
      endPinch(true);
      pinch = { distance: current.distance, zoom, next: zoom, x: current.x, y: current.y, frame: 0,
        contentX: (scroll.scrollLeft + current.x - rect.left) / zoom,
        contentY: (scroll.scrollTop + current.y - rect.top) / zoom };
      event.preventDefault();
    }, true);
    scroll.addEventListener('pointermove', event => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, point(event));
      if (!pinch) return; // One finger keeps native workspace scrolling.
      const current = pair();
      if (!current) { cancel(); return; }
      event.preventDefault();
      pinch.next = clamp(pinch.zoom * current.distance / pinch.distance, MIN_ZOOM, MAX_ZOOM);
      pinch.x = current.x; pinch.y = current.y;
      if (!pinch.frame) pinch.frame = global.requestAnimationFrame(previewPinch);
    }, { capture: true, passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      scroll.addEventListener(type, event => {
        if (!touches.delete(event.pointerId)) return;
        if (pinch) {
          if (event.cancelable) event.preventDefault();
          endPinch(true);
        }
      }, true);
    }
    scroll.addEventListener('wheel', event => {
      if (!event.ctrlKey || isBusy() || !scroll.contains(event.target) ||
          event.target.closest('textarea, input, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setZoom(zoom * Math.exp(-event.deltaY * .002), event.clientX, event.clientY);
    }, { passive: false });
    scroll.addEventListener('scroll', () => needSpace(), { passive: true });
    out.addEventListener('click', () => centerZoom(zoom / 1.25));
    reset.addEventListener('click', () => centerZoom(1));
    increase.addEventListener('click', () => centerZoom(zoom * 1.25));
    global.addEventListener('resize', () => { cancel(); measure(); });
    global.addEventListener('blur', cancel);
    global.addEventListener('pagehide', cancel);
    if (global.ResizeObserver) new ResizeObserver(() => measure()).observe(scroll);
    updateControls();
    return Object.freeze({ layout, cancel, getZoom: () => pinch ? pinch.next : zoom });
  }

  global.PhloemWorkspaceViewport = Object.freeze({ create });
})(window);
