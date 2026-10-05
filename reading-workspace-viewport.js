/* A local view of the workspace sheet. Saved card and ink coordinates stay in
   the board's 1000-unit coordinate system regardless of its visual zoom. */
(function (global) {
  'use strict';

  const MIN_ZOOM = .5, MAX_ZOOM = 3, KEY = 'phloem.workspaceZoom.v1';
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

    let zoom = 1, logicalHeight = 2000, boardWidth = 0, lastNeed = 0;
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
    function needSpace() {
      if (!boardWidth || !scroll.clientHeight || typeof options.onNeedSpace !== 'function') return;
      const visibleBottom = (scroll.scrollTop + scroll.clientHeight) * 1000 / (boardWidth * zoom);
      const maxHeight = global.PhloemWorkspaceState && Number(global.PhloemWorkspaceState.MAX_HEIGHT) || 1000000;
      const needed = Math.min(maxHeight - 1, Math.ceil(visibleBottom + 300));
      if (needed > logicalHeight && needed > lastNeed + 50) {
        lastNeed = needed; // Set before callback: a synchronous render must not recurse.
        options.onNeedSpace(needed);
      }
    }
    function measure() {
      if (!scroll.clientWidth) return;
      const oldWidth = boardWidth;
      const oldCenterX = oldWidth ? (scroll.scrollLeft + scroll.clientWidth / 2) * 1000 / (oldWidth * zoom) : 0;
      const oldCenterY = oldWidth ? (scroll.scrollTop + scroll.clientHeight / 2) * 1000 / (oldWidth * zoom) : 0;
      boardWidth = scroll.clientWidth;
      board.style.width = `${boardWidth}px`;
      board.style.minHeight = '0';
      board.style.height = `${boardWidth * logicalHeight / 1000}px`;
      board.style.transform = `scale(${zoom})`;
      stage.style.width = `${Math.max(boardWidth, boardWidth * zoom)}px`;
      stage.style.height = `${Math.max(scroll.clientHeight, boardWidth * logicalHeight * zoom / 1000)}px`;
      if (oldWidth && oldWidth !== boardWidth) {
        scroll.scrollLeft = oldCenterX * boardWidth * zoom / 1000 - scroll.clientWidth / 2;
        scroll.scrollTop = oldCenterY * boardWidth * zoom / 1000 - scroll.clientHeight / 2;
      }
      updateControls();
      needSpace();
    }
    function layout(height) {
      const next = Number(height);
      if (Number.isFinite(next) && next >= 1000) logicalHeight = next;
      if (logicalHeight >= lastNeed) lastNeed = 0;
      measure();
    }
    function setZoom(value, anchorX, anchorY, contentX, contentY) {
      if (!boardWidth || !Number.isFinite(value)) return;
      const next = clamp(value, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(next - zoom) < .0001) return;
      const rect = scroll.getBoundingClientRect();
      const x = clamp(anchorX - rect.left, 0, scroll.clientWidth);
      const y = clamp(anchorY - rect.top, 0, scroll.clientHeight);
      const heldX = contentX == null ? (scroll.scrollLeft + x) / zoom : contentX;
      const heldY = contentY == null ? (scroll.scrollTop + y) / zoom : contentY;
      zoom = next;
      board.style.transform = `scale(${zoom})`;
      stage.style.width = `${Math.max(boardWidth, boardWidth * zoom)}px`;
      stage.style.height = `${Math.max(scroll.clientHeight, boardWidth * logicalHeight * zoom / 1000)}px`;
      scroll.scrollLeft = heldX * zoom - x;
      scroll.scrollTop = heldY * zoom - y;
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
    function cancel() { touches.clear(); pinch = null; }

    scroll.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !blankTarget(event.target) || isBusy()) return;
      touches.set(event.pointerId, point(event));
      const current = pair();
      if (!current || current.distance < 12) return;
      const rect = scroll.getBoundingClientRect();
      pinch = { distance: current.distance, zoom,
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
      setZoom(pinch.zoom * current.distance / pinch.distance,
        current.x, current.y, pinch.contentX, pinch.contentY);
    }, { capture: true, passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      scroll.addEventListener(type, event => {
        if (!touches.delete(event.pointerId)) return;
        if (pinch) {
          if (event.cancelable) event.preventDefault();
          pinch = null;
        }
      }, true);
    }
    scroll.addEventListener('wheel', event => {
      if (!event.ctrlKey || isBusy() || !scroll.contains(event.target) ||
          event.target.closest('textarea, input, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setZoom(zoom * Math.exp(-event.deltaY * .002), event.clientX, event.clientY);
    }, { passive: false });
    scroll.addEventListener('scroll', needSpace, { passive: true });
    out.addEventListener('click', () => centerZoom(zoom / 1.25));
    reset.addEventListener('click', () => centerZoom(1));
    increase.addEventListener('click', () => centerZoom(zoom * 1.25));
    global.addEventListener('resize', () => { cancel(); measure(); });
    global.addEventListener('blur', cancel);
    global.addEventListener('pagehide', cancel);
    if (global.ResizeObserver) new ResizeObserver(() => measure()).observe(scroll);
    updateControls();
    return Object.freeze({ layout, cancel, getZoom: () => zoom });
  }

  global.PhloemWorkspaceViewport = Object.freeze({ create });
})(window);
