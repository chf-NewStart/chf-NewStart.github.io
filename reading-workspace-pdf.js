/* A temporary, local-only export surface for native WKWebView PDF capture.
   The live Phloem board, its zoom, scroll positions and selection stay intact. */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const MARGIN = 24;
  let prepared = null;

  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const frame = () => new Promise(resolve => global.requestAnimationFrame(resolve));
  const finiteRect = rect => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width >= 0 && rect.height >= 0;

  function boundsOfPoints(points, padding) {
    if (!points.length) return null;
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    const x = Math.min(...xs) - padding, y = Math.min(...ys) - padding;
    return { x, y, width:Math.max(...xs) - x + padding, height:Math.max(...ys) - y + padding };
  }

  function inkBounds(path, stroke, positions) {
    // Phloem's committed paths already contain the displayed anchor transform.
    // Selection/drag previews use a separate transform attribute, which is not
    // part of the saved drawing and is deliberately ignored here.
    if (typeof path.getBBox === "function") {
      try {
        const rect = path.getBBox();
        if (finiteRect(rect) && (rect.width || rect.height)) {
          const padding = path.getAttribute("fill") === "none" ? number(path.getAttribute("stroke-width"), 1) / 2 : 1;
          return { x:rect.x - padding, y:rect.y - padding, width:rect.width + padding * 2, height:rect.height + padding * 2 };
        }
      } catch (_) { /* An unpainted SVG still has its saved geometry below. */ }
    }
    const shown = global.PhloemWorkspaceState.displayStroke(stroke, positions);
    return boundsOfPoints(shown.points, Math.max(2, shown.width * 2));
  }

  function currentInputsToState() {
    const state = global.getNotebookWhiteboardState();
    for (const textarea of document.querySelectorAll("#workspaceCards textarea.workspace-note")) {
      const card = textarea.closest(".workspace-card[data-clip-id]");
      const item = card && state.items.find(entry => entry.id === card.dataset.clipId);
      if (item && !textarea.readOnly && textarea.value !== String(item.note || "")) {
        // Input is normally committed on every keystroke. Also cover an IME's
        // pending value or an export invoked just before the last input event.
        textarea.dispatchEvent(new Event("input", { bubbles:true }));
      }
    }
    if (global.flushNotebookWhiteboard) global.flushNotebookWhiteboard();
  }

  function copyScrollPositions(source, clone) {
    const from = [source].concat(Array.from(source.querySelectorAll("*")));
    const to = [clone].concat(Array.from(clone.querySelectorAll("*")));
    from.forEach((element, index) => {
      if (!to[index]) return;
      to[index].scrollTop = element.scrollTop;
      to[index].scrollLeft = element.scrollLeft;
      if (element instanceof HTMLTextAreaElement) {
        to[index].value = element.value;
        to[index].textContent = element.value;
      }
    });
  }

  async function settleLocalResources(root) {
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
    const images = Array.from(root.querySelectorAll("img")).map(image => {
      if (typeof image.decode === "function") return image.decode().catch(() => {});
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener("load", resolve, { once:true });
        image.addEventListener("error", resolve, { once:true });
      });
    });
    let timer;
    await Promise.race([
      Promise.all([fonts, ...images]),
      new Promise(resolve => { timer = setTimeout(resolve, 4000); })
    ]);
    clearTimeout(timer);
  }

  global.finishNotebookWhiteboardExport = function () {
    const root = document.getElementById("whiteboardExportRoot");
    if (root) root.remove();
    document.body.classList.remove("notebook-whiteboard-exporting");
    prepared = null;
    return true;
  };

  global.prepareNotebookWhiteboardExport = async function () {
    global.finishNotebookWhiteboardExport();
    if (!global.getNotebookWhiteboardState) throw new Error("Open a notebook whiteboard before exporting.");
    currentInputsToState();
    // The adapter formats note previews in a MutationObserver. Let that commit
    // before copying the DOM, without blurring or replacing the live editor.
    await Promise.resolve();
    const state = global.getNotebookWhiteboardState();
    const source = document.getElementById("workspaceBoard");
    const sourceCards = document.getElementById("workspaceCards");
    const sourceInk = document.getElementById("workspaceInk");
    if (!source || !sourceCards || !sourceInk) throw new Error("The whiteboard is not ready to export.");
    const logicalWidth = number(state.workspace && state.workspace.width, 1000);
    const logicalHeight = number(state.workspace && state.workspace.height, 2000);
    const sourceWidth = source.clientWidth || number(parseFloat(source.style.width), logicalWidth * .6);
    const sourceHeight = source.clientHeight || number(parseFloat(source.style.height), logicalHeight * .6);
    const unitX = sourceWidth / logicalWidth, unitY = sourceHeight / logicalHeight;
    const positions = state.workspace.positions || {};
    const occupied = [];

    const clone = source.cloneNode(true);
    clone.id = "whiteboardExportBoard";
    clone.className = "workspace-board whiteboard-export-board";
    clone.removeAttribute("tabindex");
    clone.style.cssText = `position:absolute;transform:none;transform-origin:0 0;width:${sourceWidth}px;height:${sourceHeight}px;min-height:0;pointer-events:none;`;
    const cloneCards = clone.querySelector(".workspace-cards");
    const cloneInk = clone.querySelector(".workspace-ink");
    if (!cloneCards || !cloneInk) throw new Error("The whiteboard snapshot is incomplete.");
    cloneCards.id = "whiteboardExportCards";
    cloneInk.id = "whiteboardExportInk";
    // Tool rails, selections, gesture previews and empty-state hints are UI,
    // rather than the document. Keep the actual card and committed ink layers.
    Array.from(clone.children).filter(element => element !== cloneCards && element !== cloneInk).forEach(element => element.remove());
    clone.querySelectorAll(".workspace-selected,.workspace-resizing,.workspace-editing").forEach(element => {
      element.classList.remove("workspace-selected", "workspace-resizing");
    });

    for (const card of sourceCards.querySelectorAll(".workspace-card[data-clip-id]")) {
      const id = card.dataset.clipId;
      const target = Array.from(cloneCards.children).find(element => element.dataset.clipId === id);
      if (!target) continue;
      const position = positions[id];
      const x = position ? position.x * unitX : card.offsetLeft;
      const y = position ? position.y * unitY : card.offsetTop;
      const width = position ? position.width * unitX : card.offsetWidth;
      const height = card.offsetHeight || card.getBoundingClientRect().height / Math.max(.001, source.getBoundingClientRect().width / sourceWidth);
      target.style.left = `${x}px`; target.style.top = `${y}px`; target.style.width = `${width}px`;
      target.style.transform = "none";
      target.style.height = `${height}px`;
      copyScrollPositions(card, target);
      if (finiteRect({ x, y, width, height })) occupied.push({ x, y, width, height, kind:"card", id });
    }

    const liveIDs = new Map((state.workspace.strokes || []).filter(stroke => !stroke.anchor || state.items.some(item => item.id === stroke.anchor.clipId)).map(stroke => [stroke.id, stroke]));
    for (const path of Array.from(cloneInk.children)) {
      const id = path.dataset && path.dataset.strokeId;
      const stroke = liveIDs.get(id);
      const original = Array.from(sourceInk.children).find(element => element.dataset && element.dataset.strokeId === id);
      if (!stroke || !original) { path.remove(); continue; }
      path.removeAttribute("transform"); path.style.opacity = ""; path.style.filter = "";
      path.classList.remove("workspace-selected");
      const bounds = inkBounds(original, stroke, positions);
      if (bounds) occupied.push({ x:bounds.x * unitX, y:bounds.y * unitY, width:bounds.width * unitX, height:bounds.height * unitY, kind:"ink", id });
    }
    cloneInk.setAttribute("viewBox", `0 0 ${logicalWidth} ${logicalHeight}`);
    cloneInk.setAttribute("preserveAspectRatio", "none");

    const empty = !occupied.length;
    const minX = empty ? 0 : Math.min(...occupied.map(rect => rect.x));
    const minY = empty ? 0 : Math.min(...occupied.map(rect => rect.y));
    const maxX = empty ? 500 - MARGIN * 2 : Math.max(...occupied.map(rect => rect.x + rect.width));
    const maxY = empty ? 700 - MARGIN * 2 : Math.max(...occupied.map(rect => rect.y + rect.height));
    const originX = minX - MARGIN, originY = minY - MARGIN;
    const width = Math.max(500, Math.ceil(maxX - minX + MARGIN * 2));
    const height = Math.max(700, Math.ceil(maxY - minY + MARGIN * 2));
    clone.style.left = `${-originX}px`; clone.style.top = `${-originY}px`;

    const root = document.createElement("div"); root.id = "whiteboardExportRoot";
    root.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("div"); canvas.id = "whiteboardExportCanvas";
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.appendChild(clone); root.appendChild(canvas); document.body.appendChild(root);
    document.body.classList.add("notebook-whiteboard-exporting");
    // Card text/plot scrollers retain the visual crop the reader arranged. The
    // complete board extent is captured independently of the live pan viewport.
    Array.from(sourceCards.children).forEach(card => {
      const target = Array.from(cloneCards.children).find(element => element.dataset.clipId === card.dataset.clipId);
      if (target) copyScrollPositions(card, target);
    });
    prepared = {
      x:0, y:0, width, height, scale:unitX, empty,
      notebookID:state.notebookID,
      occupiedRects:occupied.map(rect => ({ ...rect, x:rect.x - originX, y:rect.y - originY })),
      sourceBounds:{ x:originX, y:originY, width, height },
      logicalWidth, logicalHeight,
      cardCount:occupied.filter(rect => rect.kind === "card").length,
      strokeCount:occupied.filter(rect => rect.kind === "ink").length
    };
    if (empty) prepared.occupiedRects = [{ x:0, y:0, width, height, kind:"paper" }];
    root.style.width = `${global.innerWidth}px`; root.style.height = `${global.innerHeight}px`;
    await settleLocalResources(root);
    await frame();
    return JSON.parse(JSON.stringify(prepared));
  };

  global.setNotebookWhiteboardExportTile = async function (tile) {
    if (!prepared) throw new Error("Prepare the whiteboard export before choosing a page.");
    const root = document.getElementById("whiteboardExportRoot"), canvas = document.getElementById("whiteboardExportCanvas");
    if (!root || !canvas) throw new Error("The whiteboard export surface is missing.");
    const x = number(tile && tile.x, NaN), y = number(tile && tile.y, NaN);
    const width = number(tile && tile.width, NaN), height = number(tile && tile.height, NaN), scale = number(tile && tile.scale, NaN);
    if (![x, y, width, height, scale].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || scale <= 0 || scale > 10) throw new Error("Invalid whiteboard export page.");
    root.style.width = `${width * scale}px`; root.style.height = `${height * scale}px`;
    canvas.style.transform = `matrix(${scale},0,0,${scale},${-x * scale},${-y * scale})`;
    await frame(); await frame();
    return { x:0, y:0, width:width * scale, height:height * scale, sourceX:x, sourceY:y, sourceWidth:width, sourceHeight:height, scale };
  };
})(window);
