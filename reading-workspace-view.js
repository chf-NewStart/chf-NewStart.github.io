/* Document-scoped landscape workspace. Storage and reader navigation belong to the adapter. */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = { black: '#20313b', blue: '#245bc1', red: '#ba3f35', green: '#24734b', purple: '#7842a3', orange: '#c26a1c', teal: '#157d86', gray: '#687782' };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const uid = () => global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function create(adapter) {
    const panel = document.getElementById('workspacePanel');
    const tools = document.getElementById('workspaceTools');
    const scroll = document.getElementById('workspaceScroll');
    const board = document.getElementById('workspaceBoard');
    const cardsLayer = document.getElementById('workspaceCards');
    const ink = document.getElementById('workspaceInk');
    const status = document.getElementById('workspaceStatus');
    if (![panel, tools, scroll, board, cardsLayer, ink, status].every(Boolean)) throw new Error('Workspace DOM is missing');
    const buttons = Object.fromEntries(['undo', 'redo', 'moreSpace', 'newNote', 'close'].map(name => [name, document.getElementById(`workspace${name[0].toUpperCase()}${name.slice(1)}`)]));
    const sizeSelect = document.getElementById('workspaceSize');
    board.tabIndex = 0;
    let scope = null;
    let cards = new Map();
    const drafts = new Map();
    let tool = 'pen', color = 'black', width = 2.4, gesture = null, previewFrame = 0;
    let suppressClickUntil = 0;
    let suppressCardClickUntil = 0;
    const cardTouches = new Map();
    let manualCardScrollAt = 0;
    let undoStack = [], redoStack = [];
    let multiTap = null, tapStatusTimer = 0;
    let observedHeight = 2000, observedWidth = 1000;
    let growingPaper = false;
    let selection = null;
    const lassoLayer = document.createElementNS(NS, 'svg');
    lassoLayer.classList.add('workspace-lasso-layer'); lassoLayer.setAttribute('aria-hidden', 'true');
    const selectionBox = document.createElement('div');
    selectionBox.className = 'workspace-selection-box'; selectionBox.hidden = true; selectionBox.tabIndex = 0;
    selectionBox.setAttribute('role', 'group');
    // Corner handles resize a lassoed group with a finger or Pencil, about the opposite corner.
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('span');
      handle.className = 'workspace-selection-handle'; handle.dataset.corner = corner; handle.setAttribute('aria-hidden', 'true');
      selectionBox.appendChild(handle);
    }
    board.append(lassoLayer, selectionBox);
    const viewport = global.PhloemWorkspaceViewport ? global.PhloemWorkspaceViewport.create({ onNeedSpace: ensurePaperAt, isBusy: () => !!gesture }) : null;
    function resizeLayout() {
      board.dataset.logicalWidth = String(observedWidth);
      board.dataset.logicalHeight = String(observedHeight);
      if (viewport) viewport.layout(observedHeight, observedWidth);
      else {
        const baseWidth = scroll.clientWidth || board.clientWidth * 1000 / observedWidth;
        board.style.width = `${baseWidth * observedWidth / 1000}px`;
        board.style.height = `${baseWidth * observedHeight / 1000}px`;
      }
      lassoLayer.setAttribute('viewBox', `0 0 ${observedWidth} ${observedHeight}`);
    }
    function ensurePaperAt(y, x = 0) {
      if (growingPaper || !Number.isFinite(y) || !Number.isFinite(x) || !available(context()) || context().busy || !adapter.ensureSpace) return false;
      const api = global.PhloemWorkspaceState;
      y = clamp(y, 0, (api && api.MAX_HEIGHT || 1000000) - 1);
      x = clamp(x, 0, (api && api.MAX_WIDTH || 1000000) - 1);
      if (y < observedHeight && x < observedWidth) return true;
      growingPaper = true;
      try {
        if (adapter.ensureSpace(y, x) !== true) return false;
        const nextHeight = heightOf(context()), nextWidth = widthOf(context());
        if (nextHeight !== observedHeight || nextWidth !== observedWidth) {
          observedHeight = nextHeight; observedWidth = nextWidth; resizeLayout();
          for (const state of cards.values()) setBox(state, state.box, observedHeight);
          renderInk(context());
        }
        return true;
      } finally { growingPaper = false; }
    }

    function context() { return adapter.context() || {}; }
    function same(c) { return !!scope && c.id === scope.id && c.epoch === scope.epoch; }
    function currentScope() { return same(context()); }
    function setStatus(message) { status.textContent = message || ''; }
    function available(c) { return !!(c.id && c.open && !c.unavailable); }
    function heightOf(c) { const n = Number(c.workspace && c.workspace.height); return Number.isFinite(n) && n >= 1000 ? n : 2000; }
    function widthOf(c) { const n = Number(c.workspace && c.workspace.width); return Number.isFinite(n) && n >= 1000 ? n : 1000; }
    function itemsOf(c) { return Array.isArray(c.items) ? c.items : []; }
    function positionsOf(c) { return c.workspace && c.workspace.positions || {}; }
    function strokesOf(c) { return Array.isArray(c.workspace && c.workspace.strokes) ? c.workspace.strokes : []; }
    function liveItem(state) {
      const c = context();
      if (!same(c) || !available(c) || state.orphan || cards.get(state.id) !== state) return null;
      return itemsOf(c).find(item => item && String(item.id) === state.id) || null;
    }
    function draftKey(state) { return `${state.paperId}\u0000${state.id}\u0000${state.draftId}`; }
    function keepDraft(state, reason) {
      state.orphan = true;
      state.input.readOnly = true;
      state.card.classList.add('workspace-orphan', 'workspace-draft');
      state.editorLabel.hidden = false;
      state.preview.hidden = true;
      state.menu.hidden = true;
      state.card.appendChild(state.remove);
      state.message.textContent = reason || 'Unsaved draft · copy before reloading.';
      state.message.classList.remove('workspace-status-saved');
      state.source.disabled = true;
      state.source.hidden = true;
      state.remove.textContent = 'Dismiss draft';
      drafts.set(draftKey(state), state);
      if (cards.get(state.id) === state) cards.delete(state.id);
    }
    function cancel() {
      if (viewport) viewport.cancel();
      if (!gesture) { cardTouches.clear(); return; }
      const g = gesture;
      clearTimeout(g.holdTimer);
      if (status.textContent === 'Straight line · lift to keep') setStatus('');
      gesture = null;
      cardTouches.clear();
      if (g.kind === 'lasso') lassoLayer.replaceChildren();
      if (g.kind === 'group' || g.kind === 'scale') { previewGroup({ x: 0, y: 0 }); paintSelection(); }
      if (g.kind === 'stroke' && g.pointerType === 'pen') suppressClickUntil = performance.now() + 400;
      if (g.kind === 'stroke' && g.preview) g.preview.remove();
      if (g.kind === 'stroke' && g.mode === 'eraser') ink.querySelectorAll('[data-stroke-id]').forEach(path => { path.style.opacity = ''; });
      if (g.kind === 'drag' && g.state) setBox(g.state, g.startBox, observedHeight);
      if (g.kind === 'drag' && g.state && g.pointerId != null && g.state.handle.hasPointerCapture && g.state.handle.hasPointerCapture(g.pointerId)) g.state.handle.releasePointerCapture(g.pointerId);
      if (g.kind === 'pinch') {
        suppressCardClickUntil = performance.now() + 500;
        g.state.card.classList.remove('workspace-resizing');
        setBox(g.state, g.startBox, observedHeight);
        for (const id of g.ids) if (g.state.card.hasPointerCapture && g.state.card.hasPointerCapture(id)) g.state.card.releasePointerCapture(id);
      }
      if (g.pointerId != null && board.hasPointerCapture && board.hasPointerCapture(g.pointerId)) board.releasePointerCapture(g.pointerId);
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = 0;
      board.classList.remove('workspace-drawing');
    }
    function pointFromClient(x, y) {
      const rect = board.getBoundingClientRect();
      return { x: clamp((x - rect.left) * observedWidth / Math.max(rect.width, 1), 0, observedWidth), y: clamp((y - rect.top) * observedHeight / Math.max(rect.height, 1), 0, observedHeight) };
    }
    function rawPoints(points) { return points.map(p => [Math.round(clamp(p.x, 0, observedWidth) * 100) / 100, Math.round(clamp(p.y, 0, observedHeight) * 100) / 100, Math.round(clamp(p.pressure == null ? .5 : p.pressure, 0, 1) * 100) / 100]); }
    function displayStroke(stroke) {
      const positions = { ...positionsOf(context()) };
      if (stroke.anchor && cards.has(stroke.anchor.clipId)) positions[stroke.anchor.clipId] = cards.get(stroke.anchor.clipId).box;
      return global.PhloemWorkspaceState && global.PhloemWorkspaceState.displayStroke
        ? global.PhloemWorkspaceState.displayStroke(stroke, positions) : stroke;
    }
    function logicalPoints(stroke) { return displayStroke(stroke).points || []; }
    function fallbackPath(stroke) {
      const pts = logicalPoints(stroke);
      if (!pts.length) return '';
      return pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
    }
    function paintPath(path, stroke) {
      const smooth = global.PhloemInk && global.PhloemInk.pathData;
      const shown = displayStroke(stroke);
      const copy = { ...shown, points: shown.points.map(p => [p[0] / 1000, p[1] / observedHeight, p[2]]) };
      if (shown.nib === 'marker') {
        // Preserve the appearance of previously saved marker strokes.
        // A fixed chisel-nib direction gives broad downstrokes and finer crossstrokes.
        // Reuse the continuous, pressure-filtered outline; never stamp disconnected dots.
        copy.style = 'clean'; copy.width *= 1.35;
        copy.points = copy.points.map((p, i, pts) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const angle = Math.atan2((b[1] - a[1]) * observedHeight, (b[0] - a[0]) * 1000);
          return [p[0], p[1], clamp(.12 + .76 * Math.abs(Math.sin(angle - .65)) + .12 * p[2], 0, 1)];
        });
      }
      path.setAttribute('d', smooth ? smooth(copy, observedHeight / 1000) : fallbackPath(stroke));
      path.setAttribute('fill', smooth ? (COLORS[stroke.color] || COLORS.black) : 'none');
      path.setAttribute('fill-opacity', shown.nib === 'marker' ? '.94' : '1');
      if (!smooth) { path.setAttribute('stroke', COLORS[stroke.color] || COLORS.black); path.setAttribute('stroke-width', String(stroke.width * 1000 / 612)); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); }
    }
    function makePath(stroke) { const path = document.createElementNS(NS, 'path'); path.dataset.strokeId = stroke.id || ''; paintPath(path, stroke); return path; }
    function activeStroke(c, stroke) { return !!(stroke && stroke.id && Number((c.workspace && c.workspace.deleted || {})[stroke.id] || 0) < Number(stroke.updatedAt || 0)); }
    function canonicalStroke(id) { const c = context(); return strokesOf(c).find(stroke => stroke.id === id && activeStroke(c, stroke)) || null; }
    const copy = value => JSON.parse(JSON.stringify(value));
    function measuredCards() {
      const rect = board.getBoundingClientRect(), scale = observedWidth / Math.max(1, rect.width);
      return [...cards.values()].filter(state => !state.orphan).map(state => {
        const r = state.card.getBoundingClientRect();
        return { id: state.id, x: state.box.x, y: state.box.y, width: state.box.width, height: r.height * scale };
      });
    }
    function groupSnapshot(group) {
      const c = context(), positions = {}, strokes = [];
      for (const id of group.clipIds) {
        if (!positionsOf(c)[id] || !itemsOf(c).some(item => String(item.id) === id)) return null;
        positions[id] = copy(positionsOf(c)[id]);
      }
      for (const id of group.strokeIds) { const stroke = canonicalStroke(id); if (!stroke) return null; strokes.push(copy(stroke)); }
      return { positions, strokes };
    }
    function clearSelection() {
      selection = null; selectionBox.hidden = true; lassoLayer.replaceChildren();
      board.querySelectorAll('.workspace-selected').forEach(node => node.classList.remove('workspace-selected'));
    }
    function refreshSelection() {
      if (!selection) return;
      const snapshot = groupSnapshot(selection);
      if (!snapshot || (selection.snapshot && JSON.stringify(snapshot) !== JSON.stringify(selection.snapshot))) { clearSelection(); return; }
      const boxes = measuredCards().filter(card => selection.clipIds.includes(card.id));
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      let rawLeft = Infinity, rawTop = Infinity, rawRight = -Infinity, rawBottom = -Infinity;
      const include = (x, y, w = 0, h = 0) => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + w); bottom = Math.max(bottom, y + h); };
      const raw = (x, y, w = 0, h = 0) => { rawLeft = Math.min(rawLeft, x); rawTop = Math.min(rawTop, y); rawRight = Math.max(rawRight, x + w); rawBottom = Math.max(rawBottom, y + h); };
      boxes.forEach(card => { include(card.x, card.y, card.width, card.height); raw(card.x, card.y, card.width, card.height); });
      snapshot.strokes.forEach(stroke => {
        const shown = displayStroke(stroke), pad = shown.width * 1000 / 612 / 2;
        shown.points.forEach(p => { include(p[0] - pad, p[1] - pad, pad * 2, pad * 2); raw(p[0], p[1]); });
      });
      if (!Number.isFinite(left)) { clearSelection(); return; }
      selection.bounds = { x: left, y: top, width: right - left, height: bottom - top };
      selection.moveBounds = { x: rawLeft, y: rawTop, width: rawRight - rawLeft, height: rawBottom - rawTop };
      selection.snapshot = snapshot; paintSelection();
    }
    function paintSelection(delta = { x: 0, y: 0 }) {
      board.querySelectorAll('.workspace-selected').forEach(node => node.classList.remove('workspace-selected'));
      selectionBox.hidden = !selection;
      if (!selection) return;
      for (const id of selection.clipIds) if (cards.has(id)) cards.get(id).card.classList.add('workspace-selected');
      ink.querySelectorAll('[data-stroke-id]').forEach(path => path.classList.toggle('workspace-selected', selection.strokeIds.includes(path.dataset.strokeId)));
      const b = selection.bounds;
      Object.assign(selectionBox.style, { left: `${(b.x + delta.x) / observedWidth * 100}%`, top: `${(b.y + delta.y) / observedHeight * 100}%`, width: `${b.width / observedWidth * 100}%`, height: `${b.height / observedHeight * 100}%` });
      selectionBox.setAttribute('aria-label', `${selection.clipIds.length} notes and ${selection.strokeIds.length} strokes selected. Drag to move; drag a corner to resize; arrow keys to nudge; plus and minus to resize; Escape to clear.`);
    }
    function previewGroup(delta) {
      if (!selection) return;
      const scale = board.clientWidth / observedWidth;
      for (const id of selection.clipIds) if (cards.has(id)) cards.get(id).card.style.transform = delta.x || delta.y ? `translate(${delta.x * scale}px, ${delta.y * scale}px)` : '';
      ink.querySelectorAll('[data-stroke-id]').forEach(path => {
        if (selection.strokeIds.includes(path.dataset.strokeId)) {
          if (delta.x || delta.y) path.setAttribute('transform', `translate(${delta.x} ${delta.y})`); else path.removeAttribute('transform');
        }
      });
      paintSelection(delta);
    }
    function groupDelta(delta) {
      const b = selection.moveBounds, max = global.PhloemWorkspaceState.MAX_HEIGHT;
      return { x: clamp(delta.x, -b.x, global.PhloemWorkspaceState.MAX_WIDTH - b.x - b.width), y: clamp(delta.y, -b.y, max - b.y - b.height) };
    }
    function commitGroup(delta, measured, before) {
      if (!selection || !before || Math.hypot(delta.x, delta.y) < .01) return;
      if (JSON.stringify(before) !== JSON.stringify(selection.snapshot)) { clearSelection(); render(); setStatus('This selection changed. Circle it again before moving.'); return; }
      if (!adapter.moveGroup || adapter.moveGroup(selection, delta, measured, before) !== true) { setStatus('Could not move this selection. It may have changed elsewhere.'); clearSelection(); render(); return; }
      const after = groupSnapshot(selection);
      if (after) { recordUndo({ kind: 'move', before, after }, undoStack); redoStack = []; selection.snapshot = after; }
      render();
    }
    function scaleLimits(origin, measured, before) {
      // Notes keep their saved 280-900 width range; nothing may cross the paper's top or left edge.
      let low = .25, high = 4;
      const b = selection.bounds;
      for (const card of measured) if (selection.clipIds.includes(card.id)) { low = Math.max(low, 280 / card.width); high = Math.min(high, 900 / card.width); }
      if (b.x < origin.x) high = Math.min(high, origin.x / (origin.x - b.x));
      if (b.y < origin.y) high = Math.min(high, origin.y / (origin.y - b.y));
      return low <= high ? { low, high } : { low: 1, high: 1 };
    }
    function scaledSnapshot(before, origin, k) {
      const at = (v, o) => Math.max(0, o + (v - o) * k);
      const positions = {}, measuredIds = new Set(selection.clipIds);
      for (const [id, box] of Object.entries(before.positions)) positions[id] = { ...box, x: at(box.x, origin.x), y: at(box.y, origin.y), width: clamp(box.width * k, 280, 900) };
      const strokes = before.strokes.map(stroke => {
        // Writing on a selected note already follows that note's new width.
        if (stroke.anchor && measuredIds.has(stroke.anchor.clipId)) return copy(stroke);
        const shown = displayStroke(stroke), next = copy(stroke);
        delete next.anchor;
        next.points = shown.points.map(point => [at(point[0], origin.x), at(point[1], origin.y), point[2]]);
        next.width = clamp(shown.width * k, .5, 12);
        return next;
      });
      return { positions, strokes };
    }
    function previewScale(origin, k) {
      if (!selection) return;
      const scale = board.clientWidth / observedWidth, b = selection.bounds;
      for (const card of measuredCards()) {
        if (!selection.clipIds.includes(card.id) || !cards.has(card.id)) continue;
        const node = cards.get(card.id).card;
        node.style.transformOrigin = '0 0';
        node.style.transform = k === 1 ? '' : `translate(${(origin.x + (card.x - origin.x) * k - card.x) * scale}px, ${(origin.y + (card.y - origin.y) * k - card.y) * scale}px) scale(${k})`;
      }
      ink.querySelectorAll('[data-stroke-id]').forEach(path => {
        if (!selection.strokeIds.includes(path.dataset.strokeId)) return;
        if (k === 1) path.removeAttribute('transform');
        else path.setAttribute('transform', `translate(${origin.x} ${origin.y}) scale(${k}) translate(${-origin.x} ${-origin.y})`);
      });
      const x = origin.x + (b.x - origin.x) * k, y = origin.y + (b.y - origin.y) * k;
      Object.assign(selectionBox.style, { left: `${Math.min(x, x + b.width * k) / observedWidth * 100}%`, top: `${Math.min(y, y + b.height * k) / observedHeight * 100}%`, width: `${b.width * k / observedWidth * 100}%`, height: `${b.height * k / observedHeight * 100}%` });
    }
    function commitScale(origin, k, measured, before) {
      if (!selection || !before || Math.abs(k - 1) < .005) return;
      if (JSON.stringify(before) !== JSON.stringify(selection.snapshot)) { clearSelection(); render(); setStatus('This selection changed. Circle it again before resizing.'); return; }
      const target = scaledSnapshot(before, origin, k);
      if (!adapter.restoreGroup || adapter.restoreGroup(target, before) !== true) { setStatus('Could not resize this selection. It may have changed elsewhere.'); clearSelection(); render(); return; }
      const after = groupSnapshot(selection);
      if (after) { recordUndo({ kind: 'move', before, after }, undoStack); redoStack = []; selection.snapshot = after; }
      render();
    }
    function startSelection(event, pointerId) {
      if (gesture || !available(context()) || context().busy) return false;
      if (selection && JSON.stringify(groupSnapshot(selection)) !== JSON.stringify(selection.snapshot)) { clearSelection(); render(); setStatus('This selection changed. Circle it again before moving.'); return false; }
      closeOpenMenus();
      const focused = document.activeElement;
      if (focused && board.contains(focused) && focused.matches('textarea,input')) focused.blur();
      if (viewport) viewport.cancel();
      board.focus({ preventScroll: true });
      const p = pointFromClient(event.clientX, event.clientY), b = selection && selection.bounds;
      const handle = b && event.target && event.target.closest && event.target.closest('.workspace-selection-handle');
      if (handle) {
        const c = handle.dataset.corner, origin = { x: c.includes('w') ? b.x + b.width : b.x, y: c.includes('n') ? b.y + b.height : b.y };
        const measured = measuredCards(), before = groupSnapshot(selection);
        gesture = { kind: 'scale', pointerId, client: { x: event.clientX, y: event.clientY }, origin, startDistance: Math.max(1, Math.hypot(p.x - origin.x, p.y - origin.y)), k: 1, measured, before, limits: scaleLimits(origin, measured, before) };
        return true;
      }
      // A fingertip is less precise than the Pencil: accept a drag that starts just outside the box.
      const slop = event.pointerType === 'touch' ? Math.max(8, 20 * observedWidth / Math.max(1, board.clientWidth)) : 8;
      if (b && p.x >= b.x - slop && p.x <= b.x + b.width + slop && p.y >= b.y - slop && p.y <= b.y + b.height + slop) {
        gesture = { kind: 'group', pointerId, finger: event.pointerType === 'touch', client: { x: event.clientX, y: event.clientY }, start: p, delta: { x: 0, y: 0 }, measured: measuredCards(), before: groupSnapshot(selection) };
      } else {
        clearSelection();
        const path = document.createElementNS(NS, 'path'); path.classList.add('workspace-lasso-preview'); lassoLayer.appendChild(path);
        lassoLayer.setAttribute('viewBox', `0 0 ${observedWidth} ${observedHeight}`);
        gesture = { kind: 'lasso', pointerId, client: { x: event.clientX, y: event.clientY }, points: [[p.x, p.y]], path };
      }
      return true;
    }
    function moveSelection(event) {
      const g = gesture, p = pointFromClient(event.clientX, event.clientY);
      if (g.client) g.far = Math.max(g.far || 0, Math.hypot(event.clientX - g.client.x, event.clientY - g.client.y));
      if (g.kind === 'scale') {
        const k = clamp(Math.hypot(p.x - g.origin.x, p.y - g.origin.y) / g.startDistance, g.limits.low, g.limits.high);
        if (Math.abs(k - 1) < .005 && !g.moved) return;
        g.moved = true; g.k = k; previewScale(g.origin, k);
      }
      else if (g.kind === 'group') {
        const delta = { x: p.x - g.start.x, y: p.y - g.start.y };
        if (Math.hypot(delta.x, delta.y) < .25 && !g.moved) return;
        g.moved = true; g.delta = groupDelta(delta); previewGroup(g.delta);
      }
      else {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 1) return;
        if (g.points.length >= 4096) g.points = g.points.filter((_, i) => i % 2 === 0);
        g.points.push([p.x, p.y]);
        g.path.setAttribute('d', g.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z');
      }
    }
    function finishSelection(event) {
      const g = gesture; moveSelection(event); gesture = null;
      suppressClickUntil = performance.now() + 450;
      if (typeof g.pointerId === 'number' && board.hasPointerCapture(g.pointerId)) board.releasePointerCapture(g.pointerId);
      // A tap that never travelled releases the lasso instead of drawing an empty loop.
      // Fingers release from anywhere, even inside the selection; Pencil and mouse
      // keep a tap inside it so a deliberate drag can still start there.
      const tapped = !!g.client && (g.far || 0) < 8 && !g.moved;
      if (tapped && (g.kind === 'lasso' || g.finger)) {
        if (g.kind === 'group') previewGroup({ x: 0, y: 0 });
        clearSelection(); setStatus(''); render(); return;
      }
      if (g.kind === 'scale') { previewGroup({ x: 0, y: 0 }); if (g.moved) commitScale(g.origin, g.k, g.measured, g.before); else paintSelection(); }
      else if (g.kind === 'group') { previewGroup({ x: 0, y: 0 }); commitGroup(g.delta, g.measured, g.before); }
      else {
        lassoLayer.replaceChildren();
        const c = context(), visibleCards = measuredCards(), cardIds = new Set(visibleCards.map(card => card.id));
        const visibleState = { ...c.workspace, strokes: strokesOf(c).filter(stroke => !stroke.anchor || cardIds.has(stroke.anchor.clipId)) };
        const group = global.PhloemWorkspaceState.selectGroup(visibleState, g.points, visibleCards);
        if (group.bounds) { selection = group; refreshSelection(); }
        else setStatus('Nothing selected. Circle a note or handwriting.');
      }
      if (selection) { setStatus(''); selectionBox.focus({ preventScroll: true }); }
    }
    function renderInk(c) {
      const paths = strokesOf(c).filter(s => activeStroke(c, s) && (!s.anchor || itemsOf(c).some(item => item.id === s.anchor.clipId))).map(makePath);
      if (gesture && gesture.kind === 'stroke' && gesture.preview) paths.push(gesture.preview);
      ink.replaceChildren(...paths);
      ink.setAttribute('viewBox', `0 0 ${observedWidth} ${observedHeight}`);
      ink.style.pointerEvents = 'none';
    }
    function setBox(state, box, height) {
      state.box = { x: box.x, y: box.y, width: box.width };
      state.card.style.left = `${box.x / observedWidth * 100}%`;
      state.card.style.top = `${box.y / height * 100}%`;
      state.card.style.width = `${box.width / observedWidth * 100}%`;
      if (cards.has(state.id)) {
        const attached = strokesOf(context()).filter(stroke => stroke.anchor && stroke.anchor.clipId === state.id);
        const paths = attached.length ? new Map([...ink.querySelectorAll('[data-stroke-id]')].map(node => [node.dataset.strokeId, node])) : new Map();
        let inkBottom = box.y;
        for (const stroke of attached) {
          const path = paths.get(stroke.id);
          if (path) paintPath(path, stroke);
          for (const point of logicalPoints(stroke)) inkBottom = Math.max(inkBottom, point[1]);
        }
        state.card.style.minHeight = `${Math.max(178, (inkBottom - box.y) * board.clientWidth / observedWidth + 20)}px`;
      }
    }
    function boxFor(c, id) {
      const raw = positionsOf(c)[id];
      if (!raw) return null;
      const width = clamp(Number(raw.width) || 650, 280, 900);
      return { x: clamp(Number(raw.x) || 0, 0, widthOf(c) - width), y: clamp(Number(raw.y) || 0, 0, heightOf(c) - 80), width };
    }
    function moveCard(state, deltaX, deltaY) {
      const c = context();
      if (!liveItem(state) || c.busy) return;
      ensurePaperAt(state.box.y + deltaY + 500, state.box.x + deltaX + state.box.width + 300);
      const box = { ...state.box, x: clamp(state.box.x + deltaX, 0, observedWidth - state.box.width), y: clamp(state.box.y + deltaY, 0, observedHeight - 80) };
      if (adapter.place(state.id, box) === true) { setBox(state, box, observedHeight); render(); }
      else setStatus('Could not move this clip.');
    }
    function resizeCard(state, nextWidth) {
      const c = context();
      if (!liveItem(state) || c.busy) return false;
      const old = { ...state.box }, width = clamp(Math.round(nextWidth), 280, 900);
      if (width === old.width) return true;
      const center = old.x + old.width / 2;
      ensurePaperAt(old.y + 500, center + width / 2 + 300);
      const box = { ...old, x: clamp(center - width / 2, 0, observedWidth - width), width };
      if (adapter.place(state.id, box) !== true) { setStatus('Could not resize this note.'); return false; }
      setBox(state, box, observedHeight); render(); return true;
    }
    function finishPinch(commit) {
      const g = gesture;
      if (!g || g.kind !== 'pinch') return;
      gesture = null;
      cardTouches.clear();
      suppressCardClickUntil = performance.now() + 500;
      g.state.card.classList.remove('workspace-resizing');
      for (const id of g.ids) if (g.state.card.hasPointerCapture && g.state.card.hasPointerCapture(id)) g.state.card.releasePointerCapture(id);
      if (!commit || !liveItem(g.state) || context().busy) { setBox(g.state, g.startBox, observedHeight); return; }
      if (g.state.box.width === g.startBox.width && g.state.box.x === g.startBox.x) return;
      if (adapter.place(g.state.id, g.state.box) !== true) { setBox(g.state, g.startBox, observedHeight); setStatus('Could not resize this note.'); }
      render();
    }
    function openEditor(state, focusInput) {
      state.editing = true;
      state.editorLabel.hidden = false;
      state.preview.hidden = true;
      state.card.classList.add('workspace-editing');
      state.menu.open = false;
      if (focusInput) state.input.focus({ preventScroll: true });
    }
    function closeEditor(state) {
      if (state.orphan || state.dirty || state.saveFailed) return;
      state.editing = false;
      state.editorLabel.hidden = true;
      state.preview.hidden = false;
      state.card.classList.remove('workspace-editing');
    }
    function closeOpenMenus(except, restoreFocus) {
      let closed = false;
      let summaryToFocus = null;
      const focused = document.activeElement;
      for (const state of cards.values()) {
        if (state.menu.open && state.menu !== except) {
          if (restoreFocus && state.menu.contains(focused)) summaryToFocus = state.menu.querySelector('summary');
          state.menu.open = false; closed = true;
        }
      }
      if (summaryToFocus && summaryToFocus.isConnected) summaryToFocus.focus({ preventScroll: true });
      return closed;
    }
    function clampCardMenu(state) {
      if (!state.menu.open || !state.card.isConnected) return;
      const actions = state.actions, viewport = scroll.getBoundingClientRect();
      const scale = Math.max(.01, board.getBoundingClientRect().width / Math.max(1, board.clientWidth));
      actions.style.left = 'auto'; actions.style.right = '0'; actions.style.top = '100%'; actions.style.bottom = 'auto';
      actions.style.boxSizing = 'border-box';
      actions.style.maxWidth = `${Math.max(44, (viewport.width - 12) / scale)}px`;
      actions.style.maxHeight = `${Math.max(44, (viewport.height - 12) / scale)}px`;
      actions.style.overflowY = 'auto';
      const rect = actions.getBoundingClientRect(), owner = state.menu.getBoundingClientRect();
      const left = clamp(rect.left, viewport.left + 6, Math.max(viewport.left + 6, viewport.right - rect.width - 6));
      const top = clamp(rect.top, viewport.top + 6, Math.max(viewport.top + 6, viewport.bottom - rect.height - 6));
      actions.style.left = `${(left - owner.left) / scale}px`; actions.style.right = 'auto';
      actions.style.top = `${(top - owner.top) / scale}px`;
    }
    function makeCard(item, box) {
      const id = String(item.id), card = document.createElement('article');
      card.className = 'workspace-card'; card.dataset.clipId = id; card.tabIndex = -1;
      // Share the library's paper palette without changing saved card/ink geometry.
      const stickyStyle = adapter.stickyStyle ? adapter.stickyStyle(item) : null;
      if (stickyStyle) {
        card.style.setProperty('--note-paper', stickyStyle.paper);
        card.style.setProperty('--note-ink', stickyStyle.ink);
        card.style.setProperty('--tape-tilt', stickyStyle.tapeTilt);
      }
      const head = document.createElement('div'); head.className = 'workspace-card-head';
      const handle = document.createElement('button');
      handle.type = 'button'; handle.className = 'workspace-handle workspace-card-handle'; handle.textContent = ''; handle.title = 'Drag note';
      handle.setAttribute('aria-label', 'Move clip with drag or arrow keys'); handle.style.touchAction = 'none';
      const menu = document.createElement('details'); menu.className = 'workspace-note-menu';
      const summary = document.createElement('summary'); summary.textContent = '⋯'; summary.setAttribute('aria-label', 'Clip actions'); menu.appendChild(summary);
      const body = document.createElement('div'); body.className = 'workspace-card-body';
      const quote = document.createElement('blockquote'); quote.className = 'workspace-quote';
      const preview = document.createElement('div'); preview.className = 'workspace-note-preview'; preview.textContent = String(item.note || '');
      const label = document.createElement('label'); label.textContent = 'Your note'; label.hidden = true;
      const input = document.createElement('textarea'); input.className = 'workspace-note'; input.maxLength = 20000; input.placeholder = 'Add your note…'; label.appendChild(input);
      const message = document.createElement('p'); message.className = 'workspace-card-status'; message.setAttribute('role', 'status');
      const actions = document.createElement('div'); actions.className = 'workspace-card-actions';
      const source = document.createElement('button'); source.type = 'button'; source.className = 'workspace-source'; source.textContent = 'Go to source';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'workspace-note-edit'; edit.textContent = 'Edit note';
      const smaller = document.createElement('button'); smaller.type = 'button'; smaller.className = 'workspace-note-smaller'; smaller.textContent = 'Make smaller'; smaller.setAttribute('aria-label', 'Make note smaller');
      const larger = document.createElement('button'); larger.type = 'button'; larger.className = 'workspace-note-larger'; larger.textContent = 'Make larger'; larger.setAttribute('aria-label', 'Make note larger');
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'workspace-remove'; remove.textContent = 'Remove';
      actions.append(source, edit, smaller, larger, remove); menu.appendChild(actions); head.append(handle, menu); body.append(quote, preview); card.append(head, body, label, message);
      const state = { id, paperId: String(scope.id), draftId: uid(), card, handle, menu, actions, quote, preview, editorLabel: label, input, message, source, edit, smaller, larger, remove, box, note: String(item.note || ''), version: item.updatedAt, dirty: false, saveFailed: false, orphan: false, editing: false };
      input.value = state.note; setBox(state, box, observedHeight);
      menu.addEventListener('toggle', () => { if (menu.open) clampCardMenu(state); });
      edit.addEventListener('click', () => { if (liveItem(state)) openEditor(state, true); });
      smaller.addEventListener('click', () => { resizeCard(state, state.box.width - 80); clampCardMenu(state); });
      larger.addEventListener('click', () => { resizeCard(state, state.box.width + 80); clampCardMenu(state); });
      input.addEventListener('blur', () => { if (!state.orphan && !state.dirty && !state.saveFailed) closeEditor(state); });
      input.addEventListener('input', () => {
        const live = liveItem(state);
        if (!live || live.updatedAt !== state.version) { keepDraft(state, 'This note changed elsewhere. Copy your draft before dismissing it.'); return; }
        state.dirty = true;
        try {
          if (adapter.updateNote(id, input.value, state.version) !== true) {
            const fresh = liveItem(state);
            if (fresh && String(fresh.note || '') === input.value) state.version = fresh.updatedAt;
            state.saveFailed = true; message.classList.remove('workspace-status-saved'); message.textContent = 'Could not save. Your draft is still here.'; return;
          }
          const fresh = liveItem(state);
          state.note = input.value; state.version = fresh ? fresh.updatedAt : live.updatedAt; state.dirty = false; state.saveFailed = false;
          preview.textContent = input.value; message.textContent = 'Saved'; message.classList.add('workspace-status-saved');
        } catch (error) { state.saveFailed = true; message.classList.remove('workspace-status-saved'); message.textContent = 'Could not save. Your draft is still here.'; }
      });
      source.addEventListener('click', async () => {
        if (!liveItem(state)) return;
        const start = { ...scope }, prior = status.textContent;
        menu.open = false;
        card.focus({ preventScroll: true });
        source.disabled = true;
        try {
          const result = await adapter.goToSource(id);
          if (result === false && same(start) && currentScope()) {
            if (status.textContent === prior && !prior) setStatus('Could not open this source.');
            if (card.isConnected && context().open) summary.focus({ preventScroll: true });
          }
        } catch (error) {
          if (same(start) && currentScope()) {
            if (status.textContent === prior && !prior) setStatus('Could not open this source.');
            if (card.isConnected && context().open) summary.focus({ preventScroll: true });
          }
        }
        finally { source.disabled = !liveItem(state) || !!context().busy; }
      });
      remove.addEventListener('click', () => {
        if (state.orphan) {
          if (!global.confirm('Dismiss this unsaved draft? Copy its text first if you need it.')) return;
          drafts.delete(draftKey(state)); card.remove(); render(); return;
        }
        if (!liveItem(state) || !global.confirm('Remove this clip and its note?')) return;
        if (adapter.removeClip(id) === true) render();
        else { message.classList.remove('workspace-status-saved'); message.textContent = 'Could not remove this clip.'; }
      });
      handle.addEventListener('pointerdown', event => {
        if (gesture || !liveItem(state) || context().busy || (event.pointerType === 'pen' && tool !== 'move')) return;
        event.preventDefault(); event.stopPropagation();
        gesture = { kind: 'drag', pointerId: event.pointerId, state, start: pointFromClient(event.clientX, event.clientY), startBox: { ...state.box } };
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove', event => {
        const g = gesture; if (!g || g.kind !== 'drag' || g.pointerId !== event.pointerId || g.state !== state) return;
        const point = pointFromClient(event.clientX, event.clientY);
        ensurePaperAt(g.startBox.y + point.y - g.start.y + 500, g.startBox.x + point.x - g.start.x + g.startBox.width + 300);
        setBox(state, { ...g.startBox, x: clamp(g.startBox.x + point.x - g.start.x, 0, observedWidth - g.startBox.width), y: clamp(g.startBox.y + point.y - g.start.y, 0, observedHeight - 80) }, observedHeight);
      });
      const finishDrag = event => {
        const g = gesture; if (!g || g.kind !== 'drag' || g.pointerId !== event.pointerId || g.state !== state) return;
        gesture = null;
        if (event.type === 'pointercancel' || !liveItem(state)) { setBox(state, g.startBox, observedHeight); return; }
        if (state.box.x === g.startBox.x && state.box.y === g.startBox.y) return;
        if (adapter.place(id, state.box) !== true) { setBox(state, g.startBox, observedHeight); setStatus('Could not move this clip.'); }
        render();
      };
      handle.addEventListener('pointerup', finishDrag); handle.addEventListener('pointercancel', finishDrag);
      handle.addEventListener('lostpointercapture', event => { if (gesture && gesture.kind === 'drag' && gesture.pointerId === event.pointerId && gesture.state === state) cancel(); });
      handle.addEventListener('keydown', event => {
        const step = event.shiftKey ? 20 : 5;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        if (!dx && !dy) return; event.preventDefault(); moveCard(state, dx, dy);
      });
      card.addEventListener('click', event => { if (performance.now() < suppressCardClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
      card.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' || !liveItem(state) || context().busy || (gesture && gesture.kind !== 'drag')) return;
        if (event.target.closest('textarea, .workspace-note-menu')) return;
        const surface = event.target.closest('.workspace-quote, .workspace-note-preview, .workspace-card-body');
        const client = { x: event.clientX, y: event.clientY };
        cardTouches.set(event.pointerId, { state, client, startY: event.clientY, surface, scrolling: false });
        if (surface) try { card.setPointerCapture(event.pointerId); } catch (error) { /* A synthetic pointer may not be capturable. */ }
        const pair = [...cardTouches].filter(([, touch]) => touch.state === state);
        if (pair.length !== 2) return;
        const [first, second] = pair, distance = Math.hypot(first[1].client.x - second[1].client.x, first[1].client.y - second[1].client.y);
        if (distance < 12) return;
        if (gesture && gesture.kind === 'drag' && gesture.state === state) {
          cancel(); cardTouches.set(first[0], first[1]); cardTouches.set(second[0], second[1]);
        }
        if (gesture) return;
        gesture = { kind: 'pinch', state, ids: [first[0], second[0]], released: new Set(), startDistance: distance, startBox: { ...state.box } };
        card.classList.add('workspace-resizing');
        // Closing the size menu must not strand keyboard focus on a hidden button
        // and route the next Undo to the PDF instead of this workspace.
        card.focus({ preventScroll: true });
        menu.open = false;
        suppressCardClickUntil = performance.now() + 500;
        event.preventDefault(); event.stopPropagation();
        for (const pointerId of gesture.ids) try { card.setPointerCapture(pointerId); } catch (error) { /* A synthetic pointer may not be capturable. */ }
      }, true);
      card.addEventListener('pointermove', event => {
        const touch = cardTouches.get(event.pointerId);
        if (touch && touch.state === state) {
          const previousY = touch.client.y;
          touch.client = { x: event.clientX, y: event.clientY };
          if ((!gesture || gesture.kind !== 'pinch') && touch.surface) {
            if (!touch.scrolling && Math.abs(event.clientY - touch.startY) < 5) return;
            touch.scrolling = true;
            const requested = previousY - event.clientY;
            const scale = Math.max(.01, board.getBoundingClientRect().width / Math.max(1, board.clientWidth));
            const before = touch.surface.scrollTop;
            touch.surface.scrollTop += requested / scale;
            manualCardScrollAt = performance.now();
            scroll.scrollTop += requested - (touch.surface.scrollTop - before) * scale;
            suppressCardClickUntil = performance.now() + 350;
            event.preventDefault(); event.stopPropagation();
            return;
          }
        }
        const g = gesture;
        if (!g || g.kind !== 'pinch' || g.state !== state || !g.ids.includes(event.pointerId)) return;
        const a = cardTouches.get(g.ids[0]), b = cardTouches.get(g.ids[1]);
        if (!a || !b) return;
        const distance = Math.hypot(a.client.x - b.client.x, a.client.y - b.client.y);
        const nextWidth = clamp(Math.round(g.startBox.width * distance / g.startDistance), 280, 900);
        const center = g.startBox.x + g.startBox.width / 2;
        ensurePaperAt(g.startBox.y + 500, center + nextWidth / 2 + 300);
        setBox(state, { ...g.startBox, x: clamp(center - nextWidth / 2, 0, observedWidth - nextWidth), width: nextWidth }, observedHeight);
        event.preventDefault(); event.stopPropagation();
      }, true);
      card.addEventListener('pointerup', event => { if (gesture && gesture.kind === 'pinch' && gesture.state === state && gesture.ids.includes(event.pointerId)) { event.preventDefault(); event.stopPropagation(); gesture.released.add(event.pointerId); cardTouches.delete(event.pointerId); if (gesture.released.size === 2) finishPinch(true); } else cardTouches.delete(event.pointerId); }, true);
      card.addEventListener('pointercancel', event => { if (gesture && gesture.kind === 'pinch' && gesture.state === state && gesture.ids.includes(event.pointerId)) { event.stopPropagation(); finishPinch(false); } else cardTouches.delete(event.pointerId); }, true);
      card.addEventListener('lostpointercapture', event => { if (gesture && gesture.kind === 'pinch' && gesture.state === state && gesture.ids.includes(event.pointerId) && !gesture.released.has(event.pointerId)) finishPinch(false); });
      return state;
    }
    function render() {
      const c = context();
      if (gesture && (gesture.kind === 'group' || gesture.kind === 'scale') && JSON.stringify(groupSnapshot(selection)) !== JSON.stringify(gesture.before)) { cancel(); clearSelection(); }
      if (!same(c)) {
        cancel(); clearSelection();
        scroll.scrollTop = 0;
        for (const state of cards.values()) if (state.dirty || state.saveFailed) keepDraft(state, 'Unsaved draft · copy before reloading.');
        cards = new Map(); scope = { id: c.id, epoch: c.epoch }; undoStack = []; redoStack = [];
        cardsLayer.replaceChildren(); setStatus('');
      }
      if (!c.open) { cancel(); clearSelection(); return; }
      if (c.unavailable) {
        cancel(); clearSelection();
        for (const state of cards.values()) state.input.readOnly = true;
        setStatus('Workspace temporarily unavailable. Existing notes are preserved; editing is paused.');
        return;
      }
      if (status.textContent === 'Workspace temporarily unavailable. Existing notes are preserved; editing is paused.') setStatus('');
      for (const state of cards.values()) if (!state.orphan) state.input.readOnly = false;
      observedHeight = heightOf(c); observedWidth = widthOf(c);
      resizeLayout();
      const usable = available(c);
      board.classList.toggle('workspace-selecting', tool === 'select');
      tools.querySelectorAll('[data-workspace-tool]').forEach(button => { const on = button.dataset.workspaceTool === tool; button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); });
      tools.querySelectorAll('[data-workspace-color]').forEach(button => { const on = button.dataset.workspaceColor === color; button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); });
      if (sizeSelect && document.activeElement !== sizeSelect) sizeSelect.value = String(width);
      Object.values(buttons).filter(Boolean).forEach(button => { if (button !== buttons.close) button.disabled = !usable || !!c.busy; });
      if (buttons.undo) buttons.undo.disabled = !usable || !undoStack.length || !!c.busy;
      if (buttons.redo) buttons.redo.disabled = !usable || !redoStack.length || !!c.busy;
      renderInk(c);
      const visible = new Set();
      for (const item of itemsOf(c)) {
        if (!usable || !item || item.id == null) continue;
        const id = String(item.id), box = boxFor(c, id); if (!box) continue;
        visible.add(id);
        let state = cards.get(id);
        if (state && item.updatedAt !== state.version && String(item.note || '') !== state.input.value && (state.dirty || document.activeElement === state.input)) { keepDraft(state, 'This note changed elsewhere. Copy your draft before dismissing it.'); state = null; }
        if (!state) { state = makeCard(item, box); cards.set(id, state); cardsLayer.appendChild(state.card); }
        state.quote.textContent = String(item.quote || ''); state.quote.hidden = !item.quote;
        if (state.input.value === String(item.note || '') && state.version !== item.updatedAt) {
          state.version = item.updatedAt;
          if (!state.saveFailed) { state.note = state.input.value; state.dirty = false; }
        }
        if (!state.dirty && document.activeElement !== state.input && state.input.value !== String(item.note || '')) state.input.value = String(item.note || '');
        if (!state.dirty && document.activeElement !== state.input) {
          state.note = String(item.note || ''); state.version = item.updatedAt; state.preview.textContent = state.note;
        }
        if (!gesture || (gesture.kind !== 'drag' && gesture.kind !== 'pinch') || gesture.state !== state) setBox(state, box, observedHeight);
        state.source.disabled = !!c.busy;
        state.smaller.disabled = !!c.busy || state.box.width <= 280;
        state.larger.disabled = !!c.busy || state.box.width >= 900;
        if (state.menu.open) clampCardMenu(state);
      }
      for (const [id, state] of cards) {
        if (visible.has(id)) continue;
        if (state.dirty || state.saveFailed || document.activeElement === state.input) keepDraft(state, 'This clip is unavailable. Copy your draft before dismissing it.');
        else { state.card.remove(); cards.delete(id); }
      }
      for (const state of drafts.values()) if (state.paperId === String(c.id) && !state.card.isConnected) cardsLayer.appendChild(state.card);
      const boardRect = board.getBoundingClientRect();
      if (boardRect.width > 0 && cards.size) {
        let bottom = 0;
        for (const state of cards.values()) bottom = Math.max(bottom, (state.card.getBoundingClientRect().bottom - boardRect.top) * observedWidth / boardRect.width);
        ensurePaperAt(bottom + 500);
      }
      if (gesture && gesture.kind === 'group') previewGroup(gesture.delta);
      else if (gesture && gesture.kind === 'scale') previewScale(gesture.origin, gesture.k);
      else if (!gesture || gesture.kind !== 'lasso') refreshSelection();
    }
    function reset() {
      cancel(); clearSelection();
      for (const state of cards.values()) if (state.dirty || state.saveFailed) keepDraft(state, 'Unsaved draft · copy before reloading.');
      cards = new Map(); scope = null; cardsLayer.replaceChildren(); ink.replaceChildren(); undoStack = []; redoStack = [];
      setStatus('');
    }
    function focus(id, edit = false) {
      render(); const state = cards.get(String(id)); if (!state) return false;
      state.card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (edit) openEditor(state, true);
      else state.card.focus({ preventScroll: true });
      return true;
    }
    function hasDrafts() { return drafts.size > 0 || [...cards.values()].some(state => state.dirty || state.saveFailed); }
    function active() { return !!gesture; }

    function updatePreview() {
      previewFrame = 0;
      const g = gesture; if (!g || g.kind !== 'stroke' || g.mode !== 'pen') return;
      paintPath(g.preview, { color: g.color, width: g.width, style: 'natural', shape: g.straight ? 'line' : undefined, points: rawPoints(g.points) });
    }
    function armStraightLine(g, event) {
      if (g.straight || g.mode !== 'pen' || g.points.length < 2) return;
      const here = { x: event.clientX, y: event.clientY };
      if (g.holdTimer && g.holdAnchor && Math.hypot(here.x - g.holdAnchor.x, here.y - g.holdAnchor.y) <= 6) return;
      clearTimeout(g.holdTimer); g.holdTimer = 0;
      const rect = board.getBoundingClientRect(), first = g.points[0], last = g.points[g.points.length - 1];
      const span = Math.hypot(last.x - first.x, last.y - first.y) * rect.width / observedWidth;
      if (span < 24 || g.travel > span * 2) return;
      g.holdAnchor = here;
      g.holdTimer = setTimeout(() => {
        g.holdTimer = 0;
        if (gesture !== g || !currentScope() || context().busy) return;
        const pressure = g.points.reduce((sum, p) => sum + p.pressure, 0) / g.points.length;
        g.points = [{ ...g.points[0], pressure }, { ...g.points[g.points.length - 1], pressure }];
        g.straight = true; g.linePressure = pressure;
        if (!previewFrame) previewFrame = requestAnimationFrame(updatePreview);
        setStatus('Straight line · lift to keep');
      }, 600);
    }
    function addPoint(g, event) {
      // Pointer capture can deliver the next Pencil sample beyond the old sheet
      // edge. Grow from the unbounded contact first, never flatten it to that edge.
      const rect = board.getBoundingClientRect();
      const x = (event.clientX - rect.left) * observedWidth / Math.max(1, rect.width);
      const y = (event.clientY - rect.top) * observedHeight / Math.max(1, rect.height);
      ensurePaperAt(y + 500, x + 300);
      if (x < 0 || y < 0 || x > observedWidth || y > observedHeight) return;
      const p = pointFromClient(event.clientX, event.clientY), pressure = Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : .5;
      const last = g.points[g.points.length - 1];
      const resting = g.holdTimer && g.holdAnchor && Math.hypot(event.clientX - g.holdAnchor.x, event.clientY - g.holdAnchor.y) <= 6;
      if (g.lastClient && !resting) g.travel += Math.hypot(event.clientX - g.lastClient.x, event.clientY - g.lastClient.y);
      g.lastClient = { x: event.clientX, y: event.clientY };
      if (g.straight) g.points[1] = { ...p, pressure: g.linePressure };
      else if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= .25) {
        if (g.points.length >= 4096) g.points = g.points.filter((_, index) => index % 2 === 0);
        g.points.push({ ...p, pressure });
      }
      armStraightLine(g, event);
      if (g.mode === 'pen' && !previewFrame) previewFrame = requestAnimationFrame(updatePreview);
      if (g.mode === 'eraser') eraseAt(g, p, last || p);
    }
    function pointDistance(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, span = dx * dx + dy * dy;
      const t = span ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / span, 0, 1) : 0;
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    }
    function segmentsNear(a, b, c, d, radius) {
      const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
      if (abC * abD < 0 && cdA * cdB < 0) return true;
      return Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b)) < radius;
    }
    function eraseAt(g, point, previous) {
      const c = context(); if (!same(c)) return;
      for (const stroke of strokesOf(c)) {
        if (!activeStroke(c, stroke) || g.ids.has(stroke.id)) continue;
        if (stroke.anchor && !itemsOf(c).some(item => item.id === stroke.anchor.clipId)) continue;
        const pts = logicalPoints(stroke), shown = displayStroke(stroke); let close = false;
        for (let i = 0; i < pts.length; i++) {
          const a = { x: pts[i][0], y: pts[i][1] };
          const b = pts[Math.min(i + 1, pts.length - 1)];
          if (segmentsNear(previous, point, a, { x: b[0], y: b[1] }, 16 + (shown.width || 1))) { close = true; break; }
        }
        if (close) { g.ids.add(stroke.id); g.erased.push(stroke); }
      }
      ink.querySelectorAll('[data-stroke-id]').forEach(path => { if (g.ids.has(path.dataset.strokeId)) path.style.opacity = '.2'; });
    }
    function startStroke(event, pointerId, mode) {
      if (gesture || !available(context()) || context().busy) return false;
      board.focus({ preventScroll: true });
      if (viewport) viewport.cancel();
      const owner = [...cards.values()].reverse().find(state => {
        if (state.orphan) return false;
        const r = state.card.getBoundingClientRect();
        return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      });
      const g = { kind: 'stroke', mode, pointerId, pointerType: event.pointerType || 'pen', points: [], ids: new Set(), erased: [], color, width, travel: 0, holdTimer: 0, paperId: scope.id, epoch: scope.epoch,
        anchor: owner ? { clipId: owner.id, ...owner.box } : null };
      gesture = g; board.classList.add('workspace-drawing');
      // A resting palm during handwriting is never a deliberate history tap.
      if (multiTap) multiTap.valid = false;
      if (mode === 'pen') { g.preview = document.createElementNS(NS, 'path'); g.preview.classList.add('workspace-ink-preview'); ink.appendChild(g.preview); }
      addPoint(g, event); return true;
    }
    function finishStroke(commit) {
      const g = gesture; if (!g || g.kind !== 'stroke') return;
      clearTimeout(g.holdTimer);
      if (status.textContent === 'Straight line · lift to keep') setStatus('');
      gesture = null; board.classList.remove('workspace-drawing');
      if (g.pointerType === 'pen') suppressClickUntil = performance.now() + 400;
      if (previewFrame) cancelAnimationFrame(previewFrame); previewFrame = 0;
      if (g.preview) g.preview.remove();
      if (!commit || !currentScope() || g.paperId !== scope.id || g.epoch !== scope.epoch) { render(); return; }
      if (g.mode === 'pen' && g.points.length) {
        const at = Date.now(), stroke = { id: uid(), color: g.color, width: g.width, style: 'natural', points: rawPoints(g.points), createdAt: at, updatedAt: at };
        if (g.anchor) stroke.anchor = g.anchor;
        if (g.straight) stroke.shape = 'line';
        if (adapter.addStroke(stroke) === true) { undoStack.push({ kind: 'add', stroke: canonicalStroke(stroke.id) || stroke }); redoStack = []; }
        else setStatus('Could not save this stroke.');
      } else if (g.mode === 'eraser' && g.ids.size) {
        if (adapter.eraseStrokes([...g.ids]) === true) { undoStack.push({ kind: 'erase', strokes: g.erased }); redoStack = []; }
        else setStatus('Could not erase these strokes.');
      }
      render();
    }
    // The tape across a note's top edge is its grip for every tool: the Pencil there
    // moves the note instead of writing. The hit area is wider than the drawn tape.
    function tapeCardAt(clientX, clientY) {
      for (const state of [...cards.values()].reverse()) {
        if (state.orphan || !state.card.isConnected) continue;
        const r = state.card.getBoundingClientRect(), mid = r.left + r.width / 2;
        if (Math.abs(clientX - mid) <= 32 && clientY >= r.top - 16 && clientY <= r.top + 18) return state;
      }
      return null;
    }
    function startTapeDrag(event) {
      if (gesture || event.button !== 0 || !available(context()) || context().busy) return false;
      const state = tapeCardAt(event.clientX, event.clientY);
      if (!state || !liveItem(state)) return false;
      event.preventDefault(); event.stopImmediatePropagation();
      gesture = { kind: 'drag', pointerId: event.pointerId, state, start: pointFromClient(event.clientX, event.clientY), startBox: { ...state.box } };
      try { state.handle.setPointerCapture(event.pointerId); } catch (error) { /* A synthetic pointer may not be capturable. */ }
      return true;
    }
    board.addEventListener('pointerdown', event => {
      if (startTapeDrag(event)) return;
      if (tool === 'select') {
        if (event.button !== 0) return;
        if (gesture) { if (gesture.pointerId !== event.pointerId) cancel(); event.preventDefault(); event.stopImmediatePropagation(); return; }
        event.preventDefault(); event.stopImmediatePropagation();
        if (startSelection(event, event.pointerId)) {
          board.setPointerCapture(event.pointerId);
        }
        return;
      }
      if (tool !== 'pen' && tool !== 'eraser') return;
      if (event.pointerType === 'touch') return;
      if (event.pointerType !== 'pen' && event.target.closest('.workspace-card')) return;
      if (startStroke(event, event.pointerId, tool)) {
        if (event.pointerType === 'pen') suppressClickUntil = performance.now() + 600;
        event.preventDefault(); event.stopPropagation(); board.setPointerCapture(event.pointerId);
      }
    }, true);
    board.addEventListener('pointermove', event => {
      if (gesture && (gesture.kind === 'lasso' || gesture.kind === 'group' || gesture.kind === 'scale') && gesture.pointerId === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); moveSelection(event); return; }
      const g = gesture; if (!g || g.kind !== 'stroke' || g.pointerId !== event.pointerId) return;
      event.preventDefault();
      const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
      (samples.length ? samples : [event]).forEach(sample => addPoint(g, sample));
    }, true);
    board.addEventListener('pointerup', event => {
      if (gesture && (gesture.kind === 'lasso' || gesture.kind === 'group' || gesture.kind === 'scale') && gesture.pointerId === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); finishSelection(event); return; }
      if (gesture && gesture.kind === 'stroke' && gesture.pointerId === event.pointerId) { event.preventDefault(); addPoint(gesture, event); finishStroke(true); }
    }, true);
    board.addEventListener('pointercancel', event => { if (gesture && gesture.pointerId === event.pointerId) { if (gesture.kind === 'stroke') finishStroke(false); else cancel(); } }, true);
    board.addEventListener('lostpointercapture', event => { if (gesture && gesture.pointerId === event.pointerId) { if (gesture.kind === 'stroke') finishStroke(false); else cancel(); } }, true);
    board.addEventListener('click', event => { if (tool === 'select' || performance.now() <= suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    // Older iPad WebKit may report Pencil through TouchEvent without a pen PointerEvent.
    board.addEventListener('touchstart', event => {
      if (tool === 'select') {
        if (event.touches.length > 1) cancel();
        else if (!gesture && !global.PointerEvent && event.changedTouches.length) { const t = event.changedTouches[0]; startSelection(t, `touch-${t.identifier}`); }
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (gesture && gesture.kind === 'stroke') { event.preventDefault(); return; }
      const touch = [...event.changedTouches].find(t => t.touchType === 'stylus');
      if (!touch || gesture || (tool !== 'pen' && tool !== 'eraser')) return;
      if (startStroke({ clientX: touch.clientX, clientY: touch.clientY, pressure: touch.force }, `touch-${touch.identifier}`, tool)) { suppressClickUntil = performance.now() + 600; event.preventDefault(); }
    }, { capture: true, passive: false });
    board.addEventListener('touchmove', event => {
      if (tool === 'select') {
        if (gesture && typeof gesture.pointerId === 'string') { const t = [...event.changedTouches].find(t => `touch-${t.identifier}` === gesture.pointerId); if (t) moveSelection(t); }
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      const g = gesture; if (!g || g.kind !== 'stroke') return;
      if (typeof g.pointerId !== 'string') { event.preventDefault(); return; }
      const touch = [...event.changedTouches].find(t => `touch-${t.identifier}` === g.pointerId);
      if (!touch) { event.preventDefault(); return; }
      event.preventDefault(); addPoint(g, { clientX: touch.clientX, clientY: touch.clientY, pressure: touch.force });
    }, { capture: true, passive: false });
    const endTouch = (event, commit) => {
      const g = gesture; if (!g || typeof g.pointerId !== 'string') return;
      const touch = [...event.changedTouches].find(t => `touch-${t.identifier}` === g.pointerId); if (!touch) return;
      if (g.kind === 'lasso' || g.kind === 'group' || g.kind === 'scale') { event.preventDefault(); if (commit) finishSelection(touch); else cancel(); return; }
      event.preventDefault(); if (commit) addPoint(g, { clientX: touch.clientX, clientY: touch.clientY, pressure: touch.force }); finishStroke(commit);
    };
    board.addEventListener('touchend', event => endTouch(event, true), { capture: true, passive: false });
    board.addEventListener('touchcancel', event => endTouch(event, false), { capture: true, passive: false });
    document.addEventListener('pointerdown', event => {
      if (!context().open) return;
      for (const state of cards.values()) {
        if (state.menu.open && !state.menu.contains(event.target)) state.menu.open = false;
      }
    }, true);
    ['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, event => {
      if (!gesture || gesture.kind !== 'pinch') cardTouches.delete(event.pointerId);
    }));
    scroll.addEventListener('scroll', () => { if (gesture && performance.now() - manualCardScrollAt > 100) cancel(); }, { passive: true }); global.addEventListener('resize', cancel); global.addEventListener('blur', cancel); global.addEventListener('pagehide', cancel);
    document.addEventListener('keydown', event => {
      if (!context().open) return;
      if (event.key === 'Escape' && gesture && panel.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); return; }
      if (event.key === 'Escape' && selection && panel.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); clearSelection(); board.focus({ preventScroll: true }); return; }
      const focusedCard = event.target.closest && event.target.closest('.workspace-card');
      if (event.key === 'Escape' && focusedCard && [...cards.values()].some(state => state.card === focusedCard && state.menu.open) && closeOpenMenus(null, true)) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (event.key === 'Escape') closeOpenMenus();
      if (!panel.contains(event.target)) return;
      if (event.target.closest('input,textarea,[contenteditable="true"]')) return;
      if (selection && event.target === selectionBox && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const step = event.shiftKey ? 20 : 5;
        const delta = groupDelta({ x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 });
        commitGroup(delta, measuredCards(), groupSnapshot(selection)); return;
      }
      if (selection && event.target === selectionBox && ['+', '=', '-', '_'].includes(event.key) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        const b = selection.bounds, origin = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, measured = measuredCards(), before = groupSnapshot(selection);
        const limits = scaleLimits(origin, measured, before), grow = event.key === '+' || event.key === '=';
        commitScale(origin, clamp(grow ? 1.1 : 1 / 1.1, limits.low, limits.high), measured, before); return;
      }
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'y')) {
        event.preventDefault(); event.stopImmediatePropagation(); cancel(); history(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });

    tools.addEventListener('click', event => {
      const button = event.target.closest('[data-workspace-tool], [data-workspace-color]'); if (!button || !tools.contains(button)) return;
      if (button.dataset.workspaceTool) { cancel(); if (tool !== button.dataset.workspaceTool) clearSelection(); tool = button.dataset.workspaceTool; if (adapter.onTool) adapter.onTool(tool); }
      if (button.dataset.workspaceColor && COLORS[button.dataset.workspaceColor]) color = button.dataset.workspaceColor;
      render();
    });
    if (sizeSelect) sizeSelect.addEventListener('change', () => { width = clamp(Number(sizeSelect.value) || 2.4, .5, 12); });
    function recordUndo(action, target) { target.push(action); if (target.length > 50) target.shift(); }
    function geometryKey(record) {
      if (!record) return '';
      const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).filter(key => key !== 'updatedAt').sort().map(key => [key, sorted(value[key])])) : value;
      return JSON.stringify(sorted(record));
    }
    // Restoring geometry gives it a fresh sync clock. Rebase our own matching
    // history records so a move can be undone, then the stroke that preceded it.
    function rebaseHistory(rewritten) {
      const positions = positionsOf(context());
      const clipIds = new Set(rewritten.kind === 'move' ? Object.keys(rewritten.before.positions) : []);
      const strokeIds = new Set(rewritten.kind === 'move' ? rewritten.before.strokes.map(stroke => stroke.id) : rewritten.kind === 'add' ? [rewritten.stroke.id] : rewritten.strokes.map(stroke => stroke.id));
      const stroke = record => { const live = strokeIds.has(record.id) && canonicalStroke(record.id); return live && geometryKey(live) === geometryKey(record) ? copy(live) : record; };
      for (const action of [...undoStack, ...redoStack]) {
        if (action.kind === 'add') action.stroke = stroke(action.stroke);
        if (action.kind === 'erase') action.strokes = action.strokes.map(stroke);
        if (action.kind === 'move') for (const snapshot of [action.before, action.after]) {
          snapshot.strokes = snapshot.strokes.map(stroke);
          for (const id of Object.keys(snapshot.positions)) if (clipIds.has(id) && geometryKey(positions[id]) === geometryKey(snapshot.positions[id])) snapshot.positions[id] = copy(positions[id]);
        }
      }
    }
    function restoreStroke(stroke) {
      const at = Date.now(), restored = { ...stroke, id: uid(), createdAt: at, updatedAt: at, points: stroke.points.map(p => [...p]) };
      if (adapter.addStroke(restored) !== true) return null;
      return canonicalStroke(restored.id) || restored;
    }
    function rebindStroke(stroke, saved) {
      // Erase undo restores with a new identity to respect sync tombstones.
      // Earlier local group history must follow that replacement identity.
      const replace = record => record.id === stroke.id ? { ...record, id: saved.id, createdAt: saved.createdAt, updatedAt: Math.max(record.updatedAt, saved.createdAt) } : record;
      for (const action of [...undoStack, ...redoStack]) {
        if (action.kind === 'add') action.stroke = replace(action.stroke);
        if (action.kind === 'erase') action.strokes = action.strokes.map(replace);
        if (action.kind === 'move') for (const snapshot of [action.before, action.after]) snapshot.strokes = snapshot.strokes.map(replace);
      }
      if (selection) selection.strokeIds = selection.strokeIds.map(id => id === stroke.id ? saved.id : id);
    }
    function history(direction) {
      const from = direction === 'undo' ? undoStack : redoStack, to = direction === 'undo' ? redoStack : undoStack;
      if (!available(context()) || context().busy) return;
      cancel();
      const action = from.pop(); if (!action) return;
      let next = null;
      if (action.kind === 'move') {
        const target = direction === 'undo' ? action.before : action.after, expected = direction === 'undo' ? action.after : action.before;
        if (adapter.restoreGroup && adapter.restoreGroup(target, expected) === true) {
          const restored = groupSnapshot({ clipIds: Object.keys(target.positions), strokeIds: target.strokes.map(stroke => stroke.id) });
          if (restored) { next = { ...action, [direction === 'undo' ? 'before' : 'after']: restored }; if (selection) selection.snapshot = groupSnapshot(selection); }
        }
      } else if (action.kind === 'add') {
        if (direction === 'undo') {
          const saved = canonicalStroke(action.stroke.id);
          if (saved && saved.updatedAt === action.stroke.updatedAt && adapter.eraseStrokes([saved.id]) === true) next = action;
        }
        else { const restored = restoreStroke(action.stroke); if (restored) { rebindStroke(action.stroke, restored); next = { kind: 'add', stroke: restored }; } }
      } else if (direction === 'undo') {
        const c = context(), deleted = c.workspace && c.workspace.deleted || {};
        if (action.strokes.every(s => Number(deleted[s.id] || 0) >= Number(s.updatedAt || 0) && !canonicalStroke(s.id))) {
          const restored = action.strokes.map(restoreStroke);
          if (restored.every(Boolean)) { action.strokes.forEach((stroke, index) => rebindStroke(stroke, restored[index])); next = { kind: 'erase', strokes: restored }; }
          else {
            const partial = restored.filter(Boolean).map(s => s.id);
            if (partial.length) adapter.eraseStrokes(partial);
          }
        }
      } else {
        const ids = action.strokes.map(s => s.id);
        if (action.strokes.every(s => { const live = canonicalStroke(s.id); return live && live.updatedAt === s.updatedAt; }) && adapter.eraseStrokes(ids) === true) next = action;
      }
      if (next) { recordUndo(next, to); rebaseHistory(next); } else { from.push(action); setStatus('This selection or handwriting changed elsewhere. Try again after it syncs.'); }
      render();
    }
    if (buttons.undo) buttons.undo.addEventListener('click', () => history('undo'));
    if (buttons.redo) buttons.redo.addEventListener('click', () => history('redo'));
    // iPad note-app convention: a quick two-finger tap undoes and a three-finger tap
    // redoes workspace handwriting, so the Pencil hand never travels to the rail.
    // Any movement, scroll, zoom, cancellation, pen stroke or form control voids it.
    const TAP_MS = 400, TAP_SLOP = 12;
    function tapStatus(message) {
      clearTimeout(tapStatusTimer); setStatus(message);
      tapStatusTimer = setTimeout(() => { if (status.textContent === message) setStatus(''); }, 1400);
    }
    function finishMultiTap() {
      const tap = multiTap; multiTap = null;
      if (!tap || !tap.valid || (tap.max !== 2 && tap.max !== 3) || performance.now() - tap.start > TAP_MS) return;
      if (scroll.scrollTop !== tap.scrollTop || scroll.scrollLeft !== tap.scrollLeft || board.style.transform !== tap.zoom) return;
      if (gesture || !available(context()) || context().busy) return;
      const direction = tap.max === 2 ? 'undo' : 'redo';
      const stack = direction === 'undo' ? undoStack : redoStack, before = stack.length;
      if (!before) { tapStatus(direction === 'undo' ? 'Nothing to undo in Workspace' : 'Nothing to redo in Workspace'); return; }
      history(direction);
      if (stack.length < before) tapStatus(direction === 'undo' ? 'Undid last workspace change' : 'Redid workspace change');
    }
    scroll.addEventListener('pointerdown', event => {
      // Any Pencil or mouse contact (stroke, eraser, lasso) during the tap voids it.
      if (event.pointerType !== 'touch') { if (multiTap) multiTap.valid = false; return; }
      // A contact released outside this pane must not strand an old session.
      if (multiTap && performance.now() - multiTap.start > 2000) multiTap = null;
      if (!multiTap) multiTap = { start: performance.now(), down: new Map(), max: 0, valid: true,
        scrollTop: scroll.scrollTop, scrollLeft: scroll.scrollLeft, zoom: board.style.transform };
      const formControl = event.target instanceof Element && event.target.closest('textarea, input, select, button, summary, [contenteditable="true"]');
      if (formControl || (gesture && gesture.kind === 'stroke')) multiTap.valid = false;
      multiTap.down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      multiTap.max = Math.max(multiTap.max, multiTap.down.size);
    }, true);
    document.addEventListener('pointermove', event => {
      const start = multiTap && multiTap.down.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) multiTap.valid = false;
    }, { capture: true, passive: true });
    document.addEventListener('pointerup', event => {
      if (!multiTap || !multiTap.down.delete(event.pointerId)) return;
      if (!multiTap.down.size) finishMultiTap();
    }, true);
    document.addEventListener('pointercancel', event => {
      if (!multiTap || !multiTap.down.has(event.pointerId)) return;
      multiTap.valid = false; multiTap.down.delete(event.pointerId);
      if (!multiTap.down.size) multiTap = null;
    }, true);
    for (const type of ['blur', 'pagehide']) global.addEventListener(type, () => { multiTap = null; });
    if (buttons.moreSpace) buttons.moreSpace.addEventListener('click', () => { if (adapter.grow() === true) render(); else setStatus('Could not add more space.'); });
    if (buttons.newNote) buttons.newNote.addEventListener('click', () => {
      if (!available(context()) || context().busy) return;
      const point = pointFromClient(scroll.getBoundingClientRect().left + scroll.clientWidth / 2, scroll.getBoundingClientRect().top + 90);
      const id = adapter.addNote(point); if (id != null) { render(); focus(id, true); } else setStatus('Could not add a note.');
    });
    if (buttons.close) buttons.close.addEventListener('click', () => { cancel(); adapter.close(); });
    return { render, reset, cancel, focus, pointFromClient, active, hasDrafts, resizeLayout };
  }
  global.PhloemWorkspaceView = { create };
})(window);
