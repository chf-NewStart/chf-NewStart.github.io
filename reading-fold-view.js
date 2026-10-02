/* Read-only, Scroll-layout projection for reversible PDF folds. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'readingRoom.pdfFolding.v1';
  var SEAM_HEIGHT = 44;
  var MIN_DISPLAY_PIXELS = 48000;
  var NS = 'http://www.w3.org/2000/svg';
  var styleSequence = 0;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function touchList(value) { return Array.from(value || []); }
  function eventTime(event) { return finite(event && event.timeStamp) ? event.timeStamp : Date.now(); }
  function makeId() {
    try { if (global.crypto && global.crypto.randomUUID) return 'fold-' + global.crypto.randomUUID(); } catch (error) {}
    return 'fold-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function element(name, className, text) {
    var node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createProjection(width, height, bands, seamHeight) {
    if (!global.PhloemPdfProjection) throw new Error('PDF fold projection module is unavailable');
    return global.PhloemPdfProjection.build({ width: width, height: height, bands: bands, seamHeight: seamHeight });
  }

  function createGestureRecognizer(options) {
    options = options || {};
    var candidate = null, owner = null, blocked = false;
    function clear() { candidate = null; owner = null; blocked = false; }
    function abandonCandidate() { candidate = null; blocked = true; }
    function pageForTouch(touch) {
      var target = touch && touch.target, holder = target && target.closest && target.closest('.pdf-page');
      return holder && +holder.dataset.page ? { holder: holder, page: +holder.dataset.page } : null;
    }
    function validTouches(touches, holder) {
      if (!touches.length || touches.some(function (touch) { return touch.touchType === 'stylus' || touch.pointerType === 'pen'; })) return false;
      var rect = holder.getBoundingClientRect();
      return touches.every(function (touch) {
        return touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
      });
    }
    function sameIds(touches, points, allowNew) {
      var seen = Object.create(null), ids = Object.keys(points);
      for (var i = 0; i < touches.length; i++) {
        var key = String(touches[i].identifier);
        if (seen[key] || !allowNew && !points[key]) return false;
        seen[key] = true;
      }
      return ids.every(function (id) { return !!seen[id]; });
    }
    function startCandidate(touches, at) {
      if (!touches.length || touches.length > 4) return null;
      var found = pageForTouch(touches[0]);
      if (!found || touches.some(function (touch) { var item = pageForTouch(touch); return !item || item.holder !== found.holder; })) return null;
      if (!validTouches(touches, found.holder)) return null;
      var points = Object.create(null);
      touches.forEach(function (touch) { points[String(touch.identifier)] = { x: touch.clientX, y: touch.clientY }; });
      return { holder: found.holder, page: found.page, firstAt: at, points: points, maxTravel: 0 };
    }
    function recordCandidateTouches(touches, allowNew) {
      if (!candidate || !validTouches(touches, candidate.holder)) return false;
      if (touches.length > 4 || !sameIds(touches, candidate.points, allowNew)) return false;
      if (touches.some(function (touch) { var found = pageForTouch(touch); return !found || found.holder !== candidate.holder; })) return false;
      touches.forEach(function (touch) {
        var key = String(touch.identifier), start = candidate.points[key];
        if (!start) { candidate.points[key] = { x: touch.clientX, y: touch.clientY }; return; }
        var travel = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
        candidate.maxTravel = Math.max(candidate.maxTravel, travel);
      });
      return true;
    }
    function makePairs(candidateState, touches) {
      var pageRect = candidateState.holder.getBoundingClientRect(), centerX = pageRect.left + pageRect.width / 2;
      var sides = { left: [], right: [] };
      for (var i = 0; i < touches.length; i++) {
        var initial = candidateState.points[String(touches[i].identifier)];
        if (!initial) return null;
        sides[initial.x < centerX ? 'left' : 'right'].push(touches[i]);
      }
      if (sides.left.length !== 2 || sides.right.length !== 2) return null;
      var result = {}, topYs = [], bottomYs = [];
      ['left', 'right'].forEach(function (side) {
        var pair = sides[side].slice().sort(function (a, b) { return candidateState.points[String(a.identifier)].y - candidateState.points[String(b.identifier)].y; });
        var top = candidateState.points[String(pair[0].identifier)], bottom = candidateState.points[String(pair[1].identifier)];
        if (!top || !bottom || bottom.y - top.y < 40) { result.invalid = true; return; }
        result[side] = { topId: pair[0].identifier, bottomId: pair[1].identifier, startGap: bottom.y - top.y };
        topYs.push(top.y); bottomYs.push(bottom.y);
      });
      if (result.invalid) return null;
      result.band = {
        y0: clamp((topYs[0] + topYs[1]) / 2 - pageRect.top, 0, pageRect.height) / pageRect.height,
        y1: clamp((bottomYs[0] + bottomYs[1]) / 2 - pageRect.top, 0, pageRect.height) / pageRect.height
      };
      if (!(result.band.y1 > result.band.y0)) return null;
      return result;
    }
    function pairState(active, pairs, holder) {
      var pageRect = holder.getBoundingClientRect(), centerX = pageRect.left + pageRect.width / 2;
      var isConverged = ['left', 'right'].every(function (side) {
        var pair = pairs[side], top = active.find(function (touch) { return touch.identifier === pair.topId; }), bottom = active.find(function (touch) { return touch.identifier === pair.bottomId; });
        if (!top || !bottom || top.clientY >= bottom.clientY || side === 'left' && (top.clientX >= centerX || bottom.clientX >= centerX) || side === 'right' && (top.clientX <= centerX || bottom.clientX <= centerX)) return false;
        var gap = bottom.clientY - top.clientY;
        return pair.startGap - gap >= 32 && gap <= pair.startGap * .8;
      });
      var crossed = ['left', 'right'].some(function (side) {
        var pair = pairs[side], top = active.find(function (touch) { return touch.identifier === pair.topId; }), bottom = active.find(function (touch) { return touch.identifier === pair.bottomId; });
        return !top || !bottom || top.clientY >= bottom.clientY || (side === 'left' ? top.clientX >= centerX || bottom.clientX >= centerX : top.clientX <= centerX || bottom.clientX <= centerX);
      });
      return { converged: isConverged, crossed: crossed };
    }
    function handle(type, event) {
      type = ({ start: 'touchstart', move: 'touchmove', end: 'touchend', cancel: 'touchcancel' })[type] || type;
      var active = touchList(event && event.touches), at = eventTime(event);
      if (type === 'touchcancel') { var wasOwned = !!owner; clear(); return wasOwned; }
      if (blocked) { if (type === 'touchend' && active.length === 0) blocked = false; return false; }
      if (owner) {
        if (active.length > 4 || active.length && (active.length !== 4 || !sameIds(active, owner.ids, false) || !validTouches(active, owner.holder) || active.some(function (touch) { var found = pageForTouch(touch); return !found || found.holder !== owner.holder; }))) owner.aborted = true;
        if (type === 'touchstart' && active.length !== 4) owner.aborted = true;
        if (type === 'touchmove' && !owner.aborted) {
          var state = pairState(active, owner.pairs, owner.holder);
          if (state.crossed) owner.aborted = true;
          owner.armed = !owner.aborted && state.converged;
        }
        if (type === 'touchend' && active.length === 0) {
          var completed = owner, valid = !completed.aborted && completed.armed;
          clear();
          if (valid && typeof options.open === 'function') options.open(completed.page, completed.band);
        } else if (type === 'touchend' && active.length !== 4) {
          owner.aborted = true; owner.armed = false;
        }
        return true;
      }
      if (type === 'touchstart') {
        if (!candidate) candidate = startCandidate(active, at);
        else if (at - candidate.firstAt > 180 || !recordCandidateTouches(active, true)) { abandonCandidate(); return false; }
        if (!candidate) return false;
        var count = active.length;
        if (count === 1 || count === 2 || count === 3) return false;
        if (count !== 4 || at - candidate.firstAt > 180 || candidate.maxTravel > 12) { abandonCandidate(); return false; }
        var pairs = makePairs(candidate, active);
        if (!pairs) { abandonCandidate(); return false; }
        var layout = pairState(active, pairs, candidate.holder);
        if (layout.crossed) { abandonCandidate(); return false; }
        var ids = Object.create(null);
        active.forEach(function (touch) { ids[String(touch.identifier)] = true; });
        owner = { holder: candidate.holder, page: candidate.page, ids: ids, pairs: pairs, band: pairs.band, armed: false, aborted: false };
        candidate = null;
        if (options.onOwn) options.onOwn(owner.page);
        return true;
      }
      if (!candidate) return false;
      if (at - candidate.firstAt > 180 || !recordCandidateTouches(active, false) || candidate.maxTravel > 12) { abandonCandidate(); return false; }
      if (type === 'touchmove') return false;
      if (type === 'touchend' && active.length !== Object.keys(candidate.points).length) abandonCandidate();
      return false;
    }
    return { handleTouch: handle, reset: clear };
  }

  function create(adapter) {
    adapter = adapter || {};
    var projected = new Map(), revealed = new Set(), lastAction = null, preview = null, lastDocumentId = null, recognizer = null, gestureOwned = false;
    var enabledInput, foldButton, undoButton, unfoldAllButton, dialog, dialogTop, dialogBottom, dialogStatus, previewBand;
    var canvasSequence = 0;

    function context() {
      var value;
      try { value = typeof adapter.context === 'function' ? adapter.context() : null; } catch (error) { value = null; }
      if (!value || value.id !== lastDocumentId) {
        lastDocumentId = value && value.id || null;
        reset();
      }
      return value;
    }
    function enabled() {
      try { return !!(enabledInput ? enabledInput.checked : localStorage.getItem(STORAGE_KEY) === '1'); } catch (error) { return !!(enabledInput && enabledInput.checked); }
    }
    function contextReady(ctx, requireScroll) {
      return !!(ctx && ctx.visible !== false && ctx.id && ctx.chapter && ctx.chapter.kind === 'pdf' && ctx.verified && ctx.hash && ctx.mode === 'pdf' && (!requireScroll || ctx.layout === 'scroll'));
    }
    function viewFor(ctx, page) {
      if (!ctx || !ctx.views) return null;
      return Array.isArray(ctx.views) ? ctx.views[page - 1] : ctx.views[page] || ctx.views[String(page)];
    }
    function currentBands(ctx, page) {
      if (!contextReady(ctx, true) || !global.PhloemFolds || !enabled()) return [];
      return global.PhloemFolds.activeBands({ folds: ctx.chapter.pdfFolds, pending: ctx.chapter.pdfFoldPending }, ctx.hash, +page, ctx.pdfDoc && ctx.pdfDoc.numPages);
    }
    function putChapterState(ctx, state) {
      pruneDeleted(state.folds);
      ctx.chapter.pdfFolds = state.folds;
      ctx.chapter.pdfFoldPending = state.pending;
      if (typeof adapter.commit === 'function') adapter.commit(ctx.chapter);
    }
    function invalidate(page) {
      if (typeof adapter.invalidate === 'function') return adapter.invalidate(+page);
      else {
        var ctx = context(), view = viewFor(ctx, +page);
        if (view) return refresh(view, +page);
      }
      return null;
    }
    function capturePosition() {
      try { return typeof adapter.capture === 'function' ? adapter.capture() : null; } catch (error) { return null; }
    }
    function restoreAfter(position, pages) {
      var jobs = Array.from(new Set(pages || [])).map(function (page) { try { return invalidate(page); } catch (error) { return null; } });
      if (!position || typeof adapter.restore !== 'function') return;
      Promise.all(jobs.map(function (job) { return Promise.resolve(job).catch(function () {}); })).then(function () {
        global.requestAnimationFrame(function () { try { adapter.restore(position); } catch (error) {} });
      });
    }
    function pruneDeleted(folds) {
      Object.keys(folds && folds.byHash || {}).forEach(function (hash) {
        var bucket = folds.byHash[hash];
        Object.keys(bucket.items || {}).forEach(function (id) {
          if (bucket.deleted && bucket.deleted[id] >= bucket.items[id].updatedAt) delete bucket.items[id];
        });
      });
    }
    function removeProjected(view) {
      if (!view) return;
      var canvas = view.foldDisplayCanvas;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (view.foldDisplay && view.foldDisplay.remove) view.foldDisplay.remove();
      view.foldDisplay = null; view.foldDisplayCanvas = null; view.foldProjection = null;
      if (view.holder) view.holder.classList.remove('pdf-folded-view');
      if (view.pageHeight && view.holder) view.holder.style.height = view.pageHeight + 'px';
      projected.delete(+(view.holder && view.holder.dataset.page));
    }
    function clear(view) { removeProjected(view); }
    function clearAllViews() {
      var ctx = context();
      (ctx && Array.isArray(ctx.views) ? ctx.views : []).forEach(removeProjected);
      projected.clear();
    }
    function activeItemMap(ctx, page) {
      var normalized = global.PhloemFolds.normalize(ctx.chapter.pdfFolds, ctx.chapter.pdfFoldPending), byHash = normalized.folds.byHash[ctx.hash.toLowerCase()];
      var map = Object.create(null);
      if (!byHash) return map;
      currentBands(ctx, page).forEach(function (band) {
        band.ids.forEach(function (id) { if (byHash.items[id]) map[id] = byHash.items[id]; });
      });
      return map;
    }
    function applyPaperStyle(canvas, ctx) {
      var frame = document.getElementById('pdfFrame');
      canvas.classList.add('pdf-fold-display-canvas');
      if (frame && frame.classList.contains('dark-paper')) canvas.classList.add('pdf-fold-dark-paper');
      if (frame && frame.classList.contains('cream')) canvas.classList.add('pdf-fold-cream-paper');
      if (frame && frame.dataset.paperAppearance) canvas.dataset.paperAppearance = frame.dataset.paperAppearance;
    }
    function makeOverlays(view, state) {
      var host = element('div', 'pdf-fold-overlays'); host.setAttribute('aria-hidden', 'true');
      var originals = view.highlights ? Array.from(view.highlights.children) : [], base = view.holder.getBoundingClientRect();
      originals.forEach(function (node) {
        var rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height || !base.width || !base.height) return;
        var scaleX = base.width / state.sourceWidth, scaleY = base.height / state.sourceHeight;
        var sourceRect = { x: (rect.left - base.left) / scaleX, y: (rect.top - base.top) / scaleY, width: rect.width / scaleX, height: rect.height / scaleY };
        state.projection.projectRect(sourceRect).forEach(function (piece) {
          var clone = node.cloneNode(false); clone.removeAttribute('id'); clone.style.left = piece.x + 'px'; clone.style.top = piece.y + 'px'; clone.style.width = piece.width + 'px'; clone.style.height = piece.height + 'px'; clone.style.pointerEvents = 'none'; host.appendChild(clone);
        });
      });
      var sourceInk = view.sheet && view.sheet.querySelector('.pdf-ink-layer');
      if (sourceInk) {
        var sourceBox = sourceInk.viewBox && sourceInk.viewBox.baseVal, sourceWidth = sourceBox && sourceBox.width || 1000, sourceHeight = sourceBox && sourceBox.height || sourceWidth * state.sourceHeight / state.sourceWidth;
        var ratio = sourceHeight / state.sourceHeight, displayHeight = state.projection.displayHeight * ratio;
        var svg = document.createElementNS(NS, 'svg'); svg.classList.add('pdf-fold-ink'); svg.setAttribute('viewBox', '0 0 ' + sourceWidth + ' ' + displayHeight); svg.setAttribute('preserveAspectRatio', 'none');
        sourceInk.querySelectorAll('.pdf-ink-stroke').forEach(function (path) {
          state.projection.visibleIntervals.forEach(function (interval, index) {
            var group = document.createElementNS(NS, 'g'), clip = document.createElementNS(NS, 'clipPath'), rect = document.createElementNS(NS, 'rect');
            var clipId = 'pdf-fold-clip-' + (++styleSequence), sourceY0 = interval.start * ratio, sourceY1 = interval.end * ratio;
            var shift = state.projection.displayIntervals[index].start * ratio - sourceY0;
            clip.setAttribute('id', clipId); rect.setAttribute('x', '0'); rect.setAttribute('y', String(sourceY0)); rect.setAttribute('width', String(sourceWidth)); rect.setAttribute('height', String(Math.max(0, sourceY1 - sourceY0))); clip.appendChild(rect); svg.appendChild(clip);
            group.setAttribute('clip-path', 'url(#' + clipId + ')'); group.setAttribute('transform', 'translate(0 ' + shift + ')'); var clone = path.cloneNode(true); clone.removeAttribute('id'); group.appendChild(clone); svg.appendChild(group);
          });
        });
        host.appendChild(svg);
      }
      return host;
    }
    function makeDisplay(view, page, projection, bands, ctx, pixelBudget) {
      var source = view.canvas, cssWidth = +view.pageWidth || source.clientWidth, cssHeight = +view.pageHeight || source.clientHeight;
      if (!source || !source.width || !source.height || !cssWidth || !cssHeight) return null;
      var remaining = Math.floor(pixelBudget - source.width * source.height), ratioX = source.width / cssWidth, wantedHeight = projection.displayHeight;
      if (!finite(pixelBudget) || remaining < MIN_DISPLAY_PIXELS || wantedHeight <= 0) return null;
      var ratio = Math.min(ratioX, Math.sqrt(remaining / Math.max(1, cssWidth * wantedHeight)));
      var outputWidth = Math.max(1, Math.floor(cssWidth * ratio)), outputHeight = Math.max(1, Math.floor(wantedHeight * ratio));
      if (outputWidth * outputHeight > remaining || outputWidth * outputHeight < MIN_DISPLAY_PIXELS) return null;
      var canvas = document.createElement('canvas'); canvas.width = outputWidth; canvas.height = outputHeight;
      canvas.style.width = cssWidth + 'px'; canvas.style.height = wantedHeight + 'px'; applyPaperStyle(canvas, ctx);
      var target = canvas.getContext('2d'); if (!target) { canvas.width = 0; canvas.height = 0; return null; }
      var sourceScaleY = source.height / cssHeight;
      projection.visibleIntervals.forEach(function (interval, index) {
        var sy = Math.floor(interval.start * sourceScaleY), sh = Math.max(1, Math.ceil((interval.end - interval.start) * sourceScaleY));
        var dy = Math.round(projection.displayIntervals[index].start * ratio), dh = Math.max(1, Math.round((interval.end - interval.start) * ratio));
        target.drawImage(source, 0, sy, source.width, sh, 0, dy, outputWidth, dh);
      });
      var display = element('div', 'pdf-fold-display'); display.style.width = cssWidth + 'px'; display.style.height = wantedHeight + 'px'; display.dataset.page = String(page);
      display.appendChild(canvas); display.appendChild(makeOverlays(view, { projection: projection, sourceHeight: cssHeight, sourceWidth: cssWidth }));
      var reveal = element('button', 'pdf-fold-reveal', 'Unfold page to select text or annotate'); reveal.type = 'button'; reveal.setAttribute('aria-label', 'Unfold page to select text or annotate');
      reveal.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); revealPage(page); });
      display.appendChild(reveal);
      display.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('.pdf-fold-seam')) return;
        event.preventDefault(); event.stopPropagation(); revealPage(page);
      });
      display.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'pen') return;
        event.preventDefault(); event.stopPropagation(); revealPage(page);
      }, true);
      projection.seamIntervals.forEach(function (seam) {
        var button = element('button', 'pdf-fold-seam'); button.type = 'button'; button.style.top = seam.start + 'px'; button.style.height = (seam.end - seam.start) + 'px';
        button.dataset.foldIds = seam.foldIds.join(' '); button.setAttribute('aria-label', 'Unfold hidden passage on page ' + page); button.title = 'Tap to restore this passage';
        button.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); unfoldIds(page, seam.foldIds); }); display.appendChild(button);
      });
      return { display: display, canvas: canvas, projection: projection };
    }
    function refresh(view, page) {
      page = +page || +(view && view.holder && view.holder.dataset.page) || 0;
      var ctx = context();
      syncControls();
      if (!view || !page || !view.holder || !view.sheet) return false;
      if (!contextReady(ctx, true) || !enabled() || revealed.has(page) || view.rendered === false || !view.canvas || !view.canvas.width) { clear(view); return false; }
      var bands = currentBands(ctx, page);
      if (!bands.length) { clear(view); return false; }
      var cssWidth = +view.pageWidth || view.canvas.clientWidth, cssHeight = +view.pageHeight || view.canvas.clientHeight;
      if (!cssWidth || !cssHeight) { clear(view); return false; }
      var projection = createProjection(cssWidth, cssHeight, bands, SEAM_HEIGHT), cap = typeof adapter.budget === 'function' ? +adapter.budget() : NaN;
      if (!projection.seamIntervals.length) { clear(view); return false; }
      // Release the previous raster before allocating its replacement, and expose
      // the canonical source DOM synchronously while measuring annotation rects.
      clear(view);
      var display = makeDisplay(view, page, projection, bands, ctx, cap);
      if (!display) { clear(view); adapterToast('This fold is saved, but this page needs more room in the display memory budget.'); return false; }
      view.foldDisplay = display.display; view.foldDisplayCanvas = display.canvas; view.foldProjection = projection;
      view.holder.classList.add('pdf-folded-view'); view.holder.style.height = projection.displayHeight + 'px';
      view.holder.appendChild(display.display);
      projected.set(page, view);
      return true;
    }
    function adapterToast(message) { if (typeof adapter.toast === 'function') adapter.toast(message); }
    function revealPage(page, preservePosition) {
      var ctx = context();
      if (!currentBands(ctx, +page).length) return false;
      var position = preservePosition === false ? null : capturePosition();
      revealed.add(+page); var view = viewFor(ctx, +page); if (view) clear(view);
      adapterToast('Page unfolded for this visit. Tap again to select text or annotate; its fold is still saved.');
      if (position && typeof adapter.restore === 'function') {
        global.requestAnimationFrame(function () { try { adapter.restore(position); } catch (error) {} });
      }
      return true;
    }
    function createPreview() {
      if (dialog) return;
      dialog = element('dialog', 'pdf-fold-dialog'); dialog.id = 'pdfFoldDialog'; dialog.setAttribute('aria-labelledby', 'pdfFoldHeading');
      var form = element('form', 'pdf-fold-form'); form.method = 'dialog';
      var head = element('div', 'pdf-fold-dialog-head'); var title = element('h2', '', 'Fold a full-width passage'); title.id = 'pdfFoldHeading';
      var copy = element('p', '', 'The shaded band folds across both columns. The PDF and its saved marks stay intact. Tap a seam to restore it, or unfold the page before selecting text or annotating.');
      head.appendChild(title); head.appendChild(copy); form.appendChild(head);
      var topLabel = element('label', '', 'Top boundary'); topLabel.htmlFor = 'pdfFoldTop'; dialogTop = element('input', 'pdf-fold-range'); dialogTop.id = 'pdfFoldTop'; dialogTop.type = 'range'; dialogTop.min = '0'; dialogTop.max = '98'; dialogTop.step = '1'; dialogTop.setAttribute('aria-label', 'Top boundary of folded passage');
      var bottomLabel = element('label', '', 'Bottom boundary'); bottomLabel.htmlFor = 'pdfFoldBottom'; dialogBottom = element('input', 'pdf-fold-range'); dialogBottom.id = 'pdfFoldBottom'; dialogBottom.type = 'range'; dialogBottom.min = '2'; dialogBottom.max = '100'; dialogBottom.step = '1'; dialogBottom.setAttribute('aria-label', 'Bottom boundary of folded passage');
      var ranges = element('div', 'pdf-fold-ranges'); ranges.appendChild(topLabel); ranges.appendChild(dialogTop); ranges.appendChild(bottomLabel); ranges.appendChild(dialogBottom); form.appendChild(ranges);
      dialogStatus = element('p', 'pdf-fold-status'); dialogStatus.setAttribute('role', 'status'); dialogStatus.setAttribute('aria-live', 'polite'); form.appendChild(dialogStatus);
      var actions = element('div', 'pdf-fold-dialog-actions'); var cancel = element('button', 'soft-button', 'Cancel'); cancel.type = 'button'; cancel.id = 'cancelPdfFold'; var confirm = element('button', 'button', 'Fold'); confirm.type = 'button'; confirm.id = 'confirmPdfFold';
      actions.appendChild(cancel); actions.appendChild(confirm); form.appendChild(actions); dialog.appendChild(form); document.body.appendChild(dialog);
      previewBand = null;
      cancel.addEventListener('click', closePreview);
      dialog.addEventListener('close', closePreview);
      form.addEventListener('submit', function(event){event.preventDefault();confirmFold();});
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); closePreview(); });
      dialogTop.addEventListener('input', updatePreviewBand); dialogBottom.addEventListener('input', updatePreviewBand);
      confirm.addEventListener('click', confirmFold);
    }
    function mountControls() {
      var settings = document.querySelector('#settingsDialog .settings-body');
      if (settings && !document.getElementById('pdfFoldEnabled')) {
        var section = element('section', 'pdf-fold-settings'); section.innerHTML = '<h3>Experimental reading fold</h3><p>Folds full-width PDF passages in Scroll view. The first page tap unfolds it for text selection or annotation. This preview feature is opt-in.</p>';
        var label = element('label', 'pdf-fold-enable-label'); enabledInput = element('input'); enabledInput.type = 'checkbox'; enabledInput.id = 'pdfFoldEnabled'; enabledInput.checked = readEnabled(); label.appendChild(enabledInput); label.appendChild(document.createTextNode(' Enable experimental paper folding (Scroll)')); section.appendChild(label); settings.appendChild(section);
      } else enabledInput = document.getElementById('pdfFoldEnabled');
      if (enabledInput) { enabledInput.addEventListener('change', function () {
        var position=capturePosition();try { localStorage.setItem(STORAGE_KEY, enabledInput.checked ? '1' : '0'); } catch (error) {}
        if (!enabledInput.checked) { reset();restoreAfter(position,[]); }
        else { var ctx=context(),pages=[];revealed.clear();(ctx&&ctx.views||[]).forEach(function(view,index){if(view.rendered&&currentBands(ctx,index+1).length)pages.push(index+1);});restoreAfter(position,pages); }
        syncControls();
      }); }
      var comfort = document.getElementById('comfortBar'), menu = document.getElementById('zenLayoutMenu');
      if (comfort && !document.getElementById('openPdfFold')) {
        foldButton = element('button', 'toggle pdf-fold-open', 'Fold section'); foldButton.id = 'openPdfFold'; foldButton.type = 'button'; foldButton.dataset.openPdfFold = '';
        foldButton.addEventListener('click', function () { open(); }); comfort.appendChild(foldButton);
      } else foldButton = document.getElementById('openPdfFold');
      if (menu && !menu.querySelector('[data-open-pdf-fold]')) {
        var zenOpen = element('button', 'zen-popout-option pdf-fold-zen-open', 'Fold section'); zenOpen.type = 'button'; zenOpen.dataset.openPdfFold = ''; zenOpen.addEventListener('click', function () { open(); }); menu.appendChild(zenOpen);
      }
      if (comfort && !document.getElementById('unfoldAllPdf')) {
        unfoldAllButton = element('button', 'toggle pdf-fold-unfold-all', 'Unfold all'); unfoldAllButton.id = 'unfoldAllPdf'; unfoldAllButton.type = 'button'; comfort.appendChild(unfoldAllButton); unfoldAllButton.addEventListener('click', unfoldAll);
      } else unfoldAllButton = document.getElementById('unfoldAllPdf');
      if (comfort && !document.getElementById('undoPdfFold')) {
        undoButton = element('button', 'toggle pdf-fold-undo', 'Undo fold'); undoButton.id = 'undoPdfFold'; undoButton.type = 'button'; comfort.appendChild(undoButton); undoButton.addEventListener('click', undoFold);
      } else undoButton = document.getElementById('undoPdfFold');
      createPreview(); syncControls();
    }
    function readEnabled() { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (error) { return false; } }
    function syncControls() {
      var ctx = context(), active = enabled() && contextReady(ctx, true), any = false;
      if (active && ctx.pdfDoc) {
        var saved = global.PhloemFolds.normalize(ctx.chapter.pdfFolds, ctx.chapter.pdfFoldPending), bucket = saved.folds.byHash[ctx.hash];
        any = !!(bucket && Object.keys(bucket.items).some(function (id) { var item=bucket.items[id];return item.page<=ctx.pdfDoc.numPages&&(!bucket.deleted[id]||item.updatedAt>bucket.deleted[id]); }));
      }
      [foldButton, document.querySelector('#zenLayoutMenu [data-open-pdf-fold]')].forEach(function (button) { if (button) button.classList.toggle('hidden', !active); });
      if (unfoldAllButton) unfoldAllButton.classList.toggle('hidden', !active || !any);
      if (undoButton) undoButton.classList.toggle('hidden', !active || !lastAction);
    }
    function previewBandRect(top, bottom) {
      if (!preview || !preview.view || !preview.view.holder) return null;
      var height = +preview.view.pageHeight || preview.view.holder.clientHeight, width = +preview.view.pageWidth || preview.view.holder.clientWidth;
      return { left: 0, top: top * height, width: width, height: (bottom - top) * height };
    }
    function updatePreviewBand() {
      if (!preview) return;
      var top = clamp((+dialogTop.value || 0) / 100, 0, 1), bottom = clamp((+dialogBottom.value || 100) / 100, 0, 1);
      if (bottom - top < .01) { bottom = Math.min(1, top + .01); dialogBottom.value = String(Math.round(bottom * 100)); }
      var rect = previewBandRect(top, bottom);
      if (previewBand && rect) { previewBand.style.top = rect.top + 'px'; previewBand.style.width = rect.width + 'px'; previewBand.style.height = rect.height + 'px'; }
      var px = preview.view && +preview.view.pageHeight || 0, valid = (bottom - top) * px > SEAM_HEIGHT + 8;
      dialogStatus.textContent = 'Page ' + preview.page + ' · ' + Math.round(top * 100) + '%–' + Math.round(bottom * 100) + '% of this page' + (valid ? '' : ' · choose a taller passage');
      document.getElementById('confirmPdfFold').disabled = !valid;
    }
    function open(page, band) {
      var ctx = context(); page = +page || +(ctx && ctx.currentPage) || 1;
      if (!enabled() || !contextReady(ctx, true) || !viewFor(ctx, page) || typeof adapter.activeStroke === 'function' && adapter.activeStroke()) return false;
      var requestedDocumentId = ctx.id;
      if (typeof adapter.cancelGestures === 'function') adapter.cancelGestures();
      if (typeof adapter.preparePreview === 'function') {
        var prepared;
        try { prepared = adapter.preparePreview(page); } catch (error) { prepared = null; }
        if (prepared && typeof prepared.then === 'function') return prepared.then(function (ready) { var latest = context(); return latest && latest.id === requestedDocumentId ? showPreview(page, band, ready) : false; });
        if (prepared === false) return false;
      }
      return showPreview(page, band, null);
    }
    function showPreview(page, band, readyView) {
      var ctx = context(), view = readyView && readyView.holder ? readyView : viewFor(ctx, page);
      if (!contextReady(ctx, true) || !view || !view.holder || !view.canvas || !view.canvas.width) return false;
      closePreview();
      var y0 = band && finite(+band.y0) ? +band.y0 : .25, y1 = band && finite(+band.y1) ? +band.y1 : .55;
      if (y1 - y0 < .02) { y0 = .34; y1 = .66; }
      preview = { id: ctx.id, page: page, view: view, band: band || null };
      dialogTop.value = String(Math.round(clamp(y0, 0, .98) * 100)); dialogBottom.value = String(Math.round(clamp(y1, .02, 1) * 100));
      previewBand = element('div', 'pdf-fold-preview-band'); previewBand.setAttribute('aria-hidden', 'true'); view.holder.appendChild(previewBand);
      var pane = document.getElementById('documentPane'); if (pane && view.holder.scrollIntoView) view.holder.scrollIntoView({ block: 'center', behavior: 'smooth' });
      updatePreviewBand();
      try { dialog.showModal(); } catch (error) { dialog.setAttribute('open', ''); }
      return true;
    }
    function closePreview() {
      if (previewBand && previewBand.remove) previewBand.remove(); previewBand = null; preview = null;
      if (dialog && (dialog.open || dialog.hasAttribute('open'))) { try { dialog.close(); } catch (error) { dialog.removeAttribute('open'); } }
    }
    function saveMutation(ctx, state) {
      putChapterState(ctx, state);
      return true;
    }
    function confirmFold() {
      if (!preview) return;
      var current = context(), page = preview.page, top = clamp((+dialogTop.value || 0) / 100, 0, .98), bottom = clamp((+dialogBottom.value || 100) / 100, .02, 1), height = +preview.view.pageHeight || 0;
      if (current.id !== preview.id || !contextReady(current, true) || bottom <= top || (bottom - top) * height <= SEAM_HEIGHT + 8) return;
      var position = capturePosition();
      var fold = { id: makeId(), page: page, y0: top, y1: bottom, updatedAt: Date.now() }, before = activeItemMap(current, page);
      var next = global.PhloemFolds.upsert({ folds: current.chapter.pdfFolds, pending: current.chapter.pdfFoldPending }, current.hash, fold);
      saveMutation(current, next); revealed.delete(page); lastAction = { type: 'add', page: page, ids: [fold.id], before: before };
      closePreview(); restoreAfter(position, [page]); syncControls(); adapterToast('Passage folded. Tap the seam to restore it; tap the page to unfold for editing.');
    }
    function unfoldIds(page, ids) {
      var ctx = context(); if (!contextReady(ctx, true) || !ids || !ids.length) return false;
      var position = capturePosition();
      var before = activeItemMap(ctx, page), found = ids.map(function (id) { return before[id]; }).filter(Boolean);
      if (!found.length) return false;
      var next = global.PhloemFolds.remove({ folds: ctx.chapter.pdfFolds, pending: ctx.chapter.pdfFoldPending }, ctx.hash, found.map(function (record) { return record.id; }));
      saveMutation(ctx, next); revealed.delete(+page); lastAction = { type: 'remove', page: +page, records: found };
      restoreAfter(position, [+page]); syncControls(); adapterToast('Passage restored. Undo fold can fold it again.'); return true;
    }
    function unfoldAll() {
      var ctx = context(); if (!contextReady(ctx, true)) return false;
      var position = capturePosition();
      var normalized = global.PhloemFolds.normalize(ctx.chapter.pdfFolds, ctx.chapter.pdfFoldPending), bucket = normalized.folds.byHash[ctx.hash.toLowerCase()];
      if (!bucket) return false;
      var ids = Object.keys(bucket.items).filter(function (id) { return !bucket.deleted[id] || bucket.items[id].updatedAt > bucket.deleted[id]; });
      if (!ids.length) return false;
      var records = ids.map(function (id) { return bucket.items[id]; });
      var next = global.PhloemFolds.remove({ folds: ctx.chapter.pdfFolds, pending: ctx.chapter.pdfFoldPending }, ctx.hash, ids);
      saveMutation(ctx, next); lastAction = { type: 'removeAll', records: records };
      records.forEach(function (record) { revealed.delete(record.page); }); restoreAfter(position, records.map(function (record) { return record.page; })); syncControls(); adapterToast('All folded passages restored.'); return true;
    }
    function undoFold() {
      var action = lastAction, ctx = context(); if (!action || !contextReady(ctx, true)) return false;
      var position = capturePosition();
      var next;
      if (action.type === 'add') next = global.PhloemFolds.remove({ folds: ctx.chapter.pdfFolds, pending: ctx.chapter.pdfFoldPending }, ctx.hash, action.ids);
      else {
        next = { folds: ctx.chapter.pdfFolds, pending: ctx.chapter.pdfFoldPending };
        action.records.forEach(function (record) { next = global.PhloemFolds.upsert(next, ctx.hash, record); });
      }
      saveMutation(ctx, next); lastAction = null;
      var pages = action.type === 'removeAll' ? action.records.map(function (record) { return record.page; }) : [action.page];
      restoreAfter(position, pages); syncControls(); adapterToast('Last fold action undone.'); return true;
    }
    function reset() {
      closePreview(); revealed.clear(); lastAction = null; clearAllViews(); if (recognizer) recognizer.reset(); gestureOwned = false; syncControls();
    }
    function refreshAll() {
      var ctx = context(); if (!ctx || !Array.isArray(ctx.views)) return;
      ctx.views.forEach(function (view, index) { refresh(view, index + 1); }); syncControls();
    }
    function mapping(page) {
      var ctx = context(), view = viewFor(ctx, +page);
      if (view && view.foldProjection && projected.get(+page) === view) return view.foldProjection;
      return null;
    }
    function isFolded(page) { return !!(projected.get(+page) && projected.get(+page).foldProjection && !revealed.has(+page)); }
    function reveal(page, preservePosition) { return revealPage(+page, preservePosition); }

    mountControls();
    recognizer = createGestureRecognizer({
      open: function (page, band) { if (!isFolded(page)) open(page, band); },
      onOwn: function () { if (typeof adapter.cancelGestures === 'function') adapter.cancelGestures(); }
    });
    function handleTouch(type, event) {
      var ctx = context(), ready = enabled() && contextReady(ctx, true) && !(typeof adapter.activeStroke === 'function' && adapter.activeStroke());
      if (!ready) {
        if (gestureOwned) { recognizer.handleTouch('cancel', event); gestureOwned = false; return true; }
        recognizer.reset(); return false;
      }
      var consumed = recognizer.handleTouch(type, event);
      if (type === 'cancel' || type === 'touchcancel') gestureOwned = false;
      else if ((type === 'end' || type === 'touchend') && !(event && event.touches && event.touches.length)) gestureOwned = false;
      else if (consumed) gestureOwned = true;
      return consumed;
    }
    return Object.freeze({
      refresh: refresh, clear: clear, open: open, reset: reset, reveal: reveal,
      isFolded: isFolded, mapping: mapping, handleTouch: handleTouch,
      unfoldAll: unfoldAll, undo: undoFold
    });
  }

  global.PhloemFoldView = Object.freeze({ create: create, createGestureRecognizer: createGestureRecognizer, createProjection: createProjection });
})(window);
