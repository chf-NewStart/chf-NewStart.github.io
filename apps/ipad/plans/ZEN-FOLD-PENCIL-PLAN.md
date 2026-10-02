# Phloem Zen Pencil and PDF folding implementation plan

Design and implementation handoff · 2 October 2026

Status: **reading keeps implemented; experimental read-only Scroll folding implemented behind an opt-in gate**. Quiet Zen regrouping and native Pencil double-tap remain planned. Baseline: `070ee9b3` (1.2.0, build 26). Current work is on `codex/phloem-zen-interaction-plan`; no new native archive, upload, or App Review submission was made. Locate functions by name; baseline line numbers below will drift.

## Current delivery and next handoff

The user's design direction is a **quiet digital book**: preserve place, attention, and the useful physical techniques of paper. Book-like textures or animations are lower priority than reliable reading, annotation, and offline data safety. Do not remove non-Zen mode based on an exploratory question.

Implemented in this working tree:

- **Reading keeps**, inside the existing notebook: save a bookmark, leave a short thread to resume later, and park a personal question. Questions can use selected text and do not invoke AI. Keeps support editing, resolving/reopening, deleting, source-position jumps, reload, and independent timestamp/tombstone merges. The new `readingKeeps` field is separate from legacy AI-migrated `questions` data.
- **Experimental paper folding**, off by default in Desk settings. In PDF **Scroll** layout, Reading settings → Fold section opens a full-width band preview; Confirm closes the real vertical gap into a tappable strip. Tap the strip to unfold durably. Unfold all and one-level Undo fold are available. The original PDF, highlights, note IDs/text, and ink coordinates are unchanged.
- A **four-finger candidate recognizer** opens that same preview, using the original upper/lower finger positions. It never commits a fold without Confirm. Pure recognizer and synthetic browser tests pass; physical iPad delivery, palm rejection, and system-gesture arbitration are **not verified**. Keep the visible Fold section control and the experimental label.
- The folded display is **read-only**. Tap its page body to temporarily reveal the original page before selecting, writing, erasing, or following a link. Explicit Find/navigation and keep jumps reveal their target. Page/Book layouts show original pages while retaining folds. Guide-derived context is unavailable on folded pages rather than guessed from hidden content.

This pilot is not completion of F5/F6's future edit-through-projection work or the physical F9/G1/G2 release gates. Temporary reveals currently last for the page/session rather than separate per-reason lifetimes. Fold Undo is isolated and one-level, not integrated annotation history/redo. The preview uses labelled keyboard-accessible percentage sliders, not draggable page handles. It folds a **full-width band**, including both columns, not one arbitrary paragraph.

Actual module boundary for the next implementer:

- `reading-keeps.js`: pure normalize/merge/upsert/remove; `reading.js` owns reader integration.
- `reading-folds.js`: `normalize(value, pending, validationNow)`, `merge(leftEnvelope, rightEnvelope, validationNow)`, `upsert(envelope, hash, record, validationNow)`, `remove(envelope, hash, ids, validationNow)`, `activeBands(envelope, hash, page, pageCount)`. Envelope is `{ folds, pending }`; canonical data uses `byHash`/`items` as specified below.
- `reading-pdf-projection.js`: pure `build({ width, height, bands, seamHeight })`, with source/display mapping and clipping.
- `reading-fold-view.js`: derived display/preview/gesture controller. `reading.js` owns verified source identity, storage, rendering budget, source anchors, and existing touch arbitration. `reading-fold.css` contains scoped view styles.

Next bounded tasks: physical iPad/WebKit validation of this pilot (keep gated if unavailable); then resume A1/A2 for compact Zen or A4/A5 for native Pencil after their prerequisites. Do not silently turn on folding, build an App Store archive, or claim native gestures work from synthetic events. Pinned figures, scratch margins, and additional book-like refinements are outside this delivery.

### iPhone follow-up: staggered finger release

After the user reported the feature did not work on iPhone, the recognizer was found to abort a successfully converged gesture when fingers lifted in separate touch events. Regression tests reproduced that failure before repair. It now owns a release phase: original contacts may lift in any order, the preview opens only after the final lift, and cancellation, replacement contacts, or a continuing drag still abort. Releasing before convergence remains a cancellation; separating after the first lift also aborts, even within the small resting-finger movement allowance. Ten recognizer tests and the browser's staged 4→3→2→1→0 release path passed for release v146. These are synthetic-event checks, not proof of physical Safari gesture delivery.

Phone UI diagnosis also found Fold section positioned at x≈2510 in a 390px-wide horizontal settings strip. Fold/Undo/Unfold all are now at its start, and the opt-in is the first Desk settings section instead of below the sync/AI forms. `tests/reading-fold-phone.test.js` verifies controls are inside the viewport before any browser automation auto-scroll, then confirms folding and seam restoration at 390×844 in Chromium and WebKit. Source-authored PDF fixtures and isolated local browser storage only; no user library modified. These web fixes do not update an already-installed TestFlight binary.

### Safari follow-up: gesture assembly and stale state (v147)

The user confirmed Safari, a visible Fold button, and upper/lower paired finger movement. A baseline/current in-memory reproduction proved another recognizer bug: an ordinary one- or two-finger tap's empty `touchend` left the next gesture blocked. Completed ordinary taps now clear immediately while remaining unclaimed by folding.

Steady four-contact arrival is allowed over 800ms (previously 180ms), still rejecting more than 12px movement before all four arrive so an established scroll/zoom is not taken over. Pair grouping uses the finger positions: first/last two by initial X, with at least 40px between groups and a 40px vertical gap per pair. It no longer requires fingers on opposite halves of a PDF wider than the screen. Sixteen pure tests cover 210/450/750ms accepted placement, 900ms rejection, zoomed-page grouping, tap-then-pinch, cancellation, and existing input safety. The browser regression performs a real-time 450ms synthetic arrival after a normal tap and checks ready/armed feedback plus the preview.

Transient reader toasts identify four-finger detection, readiness to release, or rejection/cancellation. They carry only a bounded state/reason/count—not document content, coordinates, identifiers, storage, or telemetry. Ordinary one/two-finger input produces no fold toast. This makes a future physical failure diagnosable; it is not a claim that system interception or hardware delivery is solved. Cache and all asset references are v147. Keep the Fold button and opt-in gate.

Validation: 53 pure Keeps/folds/projection/gesture tests, native packaging tests 16/16, browser fold integration in Chromium and WebKit, and existing touch-selection regressions pass. WebKit's `Touch` constructor is unavailable to the harness; its DOM routing test therefore uses explicitly synthetic Event objects with touch payloads, not hardware or OS-delivered events. New four-finger status feedback is checked in that flow. Physical Safari remains unverified. [Apple's event guide](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html) and the [Touch Events standard](https://www.w3.org/TR/touch-events/) describe cancellation/default behavior; neither establishes what happened on this user's device.

## Outcome and confirmed decisions

Make Zen quieter without removing useful controls. Add configurable Apple Pencil double-tap. Let a reader fold away part of a document, actually closing the vertical gap, and tap a strip to restore it. Never delete the underlying PDF, notes, ink, or highlights.

The user confirmed:

- Folding must close up the space, not cover text with a blank rectangle. Tap the folded strip to unfold.
- Pencil double-tap defaults to **Pen ↔ Eraser**, with custom cycles allowed.
- The requested folding gesture uses four fingers, two on each side.

Recommended design: **Compact rail**. A second Reading/Annotating chrome arrangement is shown in the preview for comparison, not as an additional feature to implement. Use Compact rail unless the user selects the alternative. Do not create another independent tool state called “mode.”

### Delivery order

| Milestone | Visible result | Release condition |
| --- | --- | --- |
| A: quiet Zen + Pencil | Four primary controls, one active tool, saved double-tap cycle | Browser regressions, native compile, physical Pencil checks |
| B: fold foundation | Full-width PDF bands collapse in Scroll; tap restores | Coordinate, persistence, selection, ink, search, links, guide tests all pass |
| C: four-finger shortcut | Gesture previews the same reversible fold | Physical iPad gesture-arbitration gate passes; ordinary touch remains unchanged |
| D: layout coverage | Page/Book folds; investigate column-specific paragraphs | Separate geometry and page-turn gates; no assumption that Scroll proves Book |

For the remaining roadmap, A can proceed independently of the opt-in fold pilot. Do not make A wait for the experimental four-finger gesture. Do not advertise B as arbitrary paragraph reflow: in a two-column PDF, an initial full-width band affects both columns. A narrower paragraph-only fold is a later, explicitly unresolved layout problem.

## 1. Interaction specification

### Quiet Zen

The resting rail contains **Exit · Guide · Tools · More**. Keep the guide handle on the **left** in Zen. Reuse existing icons and styling rather than inventing a new visual system.

- **Tools** opens Pen, Highlighter, and Eraser. Selecting one closes the chooser and opens its compact bottom palette. The Tools icon reflects the effective tool and has an accessible name such as “Tools, Pen selected.”
- **More** contains Find, Layout, Paper appearance, Theme, and the existing save-safe refresh action. Add “Fold section,” “Unfold all,” and Pencil settings only when their milestones are available. Layout/appearance controls expand inside this panel, not into overlapping popovers.
- **Guide** retains its current behavior/settings. At most one of Guide settings, Tools, or More is open.
- Show **Undo** on the rail only when undoable history exists and no bottom palette is open. Keep Undo in the palette otherwise. Never display two competing Undo controls.
- Preserve the current eight pen colors, highlight colors, pen thickness options, unified eraser, hold-to-straighten, and fine-size default. Removing visual clutter must not remove existing functionality.
- Keep the current meaning of palette **Done**: stop writing/erasing and return to ordinary reading with default Pencil highlighting. A future collapse-only chevron may hide a palette while retaining its tool, but must be a distinct action.
- A hidden palette is not a disabled Pencil. The alternative “Reading” design in the preview concerns chrome visibility, not a new input mode.
- Do not add Ask AI back to the highlight bar. No changes to AI consent, China storefront gating, or sync are part of this UI milestone.

Accessibility: 44 CSS-pixel effective targets, visible focus, descriptive names, `aria-expanded` on chooser triggers, and one selected tool. Escape closes the active popup and returns focus to its visible trigger. Outside tap closes it without unexpectedly deleting a pending text selection. Find/selection cards must still fit above the software keyboard.

### Pencil double-tap

This means the supported Pencil hardware gesture, **not double-tapping the screen**.

- App default: ordered cycle `['pen', 'eraser']`.
- Settings: **Custom cycle**, **Use iPad setting**, **Off**. The initial Custom cycle is the default pair; show its meaning in the settings row without a blocking introduction.
- Custom cycle permits two or three unique tools from `pen`, `highlight`, `eraser`. Checkboxes include/exclude; labelled up/down buttons reorder. Do not require drag-and-drop.
- If the current tool is outside the chosen cycle, the next double-tap selects its first tool. With the default pair, Highlighter → Pen → Eraser → Pen.
- Selected tool changes atomically. Pen and Highlighter must never both be active. Eraser continues to remove either ink or highlights through the existing unified eraser.
- A successful hardware switch opens the destination's existing compact palette and closes Tools/More. Keep each tool's color/size preference. On non-PDF documents, omit unavailable Pen from the effective cycle; if fewer than two available tools remain, ignore the tap with a one-time explanation. Never turn an unavailable Pen request into a different tool or change the saved cycle.
- A hardware double-tap during a live stroke queues a tool change until the stroke commits. Further taps advance from the queued target. Cancellation drops the pending change. No partial stroke loss, duplicated undo entry, or switch in mid-stroke.
- Opening Settings, changing document, leaving the reader, or backgrounding clears stale pending changes. Returning must not replay a retained event.
- Honor a system-disabled interaction and system-shortcut ownership even when the app has a saved cycle. “Use iPad setting” maps supported system actions; unknown actions are ignored. Do not implement Pencil squeeze or hover changes in this work.
- On unsupported hardware, all on-screen tools still work. Do not claim a Pencil is connected merely because UIKit exposes the API.

Apple recommends respecting the preferred system interaction and making an alternative behavior understandable and configurable. The app-specific cycle is therefore explicit in Settings, with “Use iPad setting” and Off available. Verify disabled/system-shortcut behavior on a device before release. [Apple double-tap guidance](https://developer.apple.com/documentation/ApplePencil/handling-double-taps-from-apple-pencil)

### Folding

The fold is a reading-view preference, not an edit to the PDF. The source file and saved annotation coordinates remain unchanged.

1. Open **More → Fold section**. For the first PDF milestone, select a horizontal band on one page using top/bottom handles. Show the exact full-width area that will disappear, including other columns and annotations. No auto-commit while adjusting.
2. Confirm **Fold**. The selected band becomes a small strip and all content below it moves upward. The strip has a 44 CSS-pixel hit target; its decorative line can be much thinner.
3. Tap the strip to restore. Undo/redo and More → Unfold all also work. Changes survive reload and merge across supported sync/backup paths.

Allow a text selection to suggest the initial band, but show the preview before committing. Scanned PDFs use the same band selector without needing OCR. Do not infer reliable paragraph structure from line spacing alone. Folding only one column's paragraph requires a later two-dimensional layout design; a full-width fold must never silently masquerade as that behavior.

Use the four-finger gesture as an **optional shortcut to this same preview/confirmation**, not a second folding engine. Working assumption: one upper and one lower contact on each side; upper/lower pairs move toward one another. Contact identities stay stable. If this interpretation proves awkward on device, tune the gesture without changing fold data or geometry.

The gesture must not be the only way to fold. It may conflict with system multitasking or fail to deliver all contacts to WKWebView. Physical testing decides whether it can ship. Never ask users to disable accessibility or system gestures to make Phloem usable.

## 2. Existing code and risks

| Area | Baseline entry points | Consequence for this work |
| --- | --- | --- |
| Zen chrome | `reading.html` around 505; `reading.css` around 988; `reading.js`: `setZen`, `closeZenPopouts`, `syncTouchDock` | Ten controls currently compete; replace grouping without abandoning keyboard/focus behavior |
| Tool state | `setHighlightToolbarOpen`, `setHighlightEraseMode`, `setHighlightMode`, `setPdfWriteMode`, `syncPdfInkUi` (about 6075–6250) | Several booleans describe different concepts; centralize commands, not an unrelated reader rewrite |
| Pencil highlighting | `startPencilStroke`, finish/cancel near 6391–6465 | Pencil already highlights when desktop Marker is off; do not equate `highlightMode` with the Pencil tool |
| Ink | `reading-ink.js` finish, pointer conversion, `active()`; reader ink callbacks | Hardware switching must wait until commit completes; folding needs inverse point mapping |
| PDF layout | `buildPdfScroll`, `renderPdfPageAt`, `freeFarPages` (about 4178–4301) | Source height is currently display height; virtualization/re-render can undo a superficial CSS fold |
| PDF navigation | Capture/place position near 4348; page/link navigation | Store source-space anchors, not compressed scroll fractions |
| Annotation geometry | `paperSelectionFromRange` near 6191; highlight paint/hit near 6619/6720; guide near 2580 | All currently assume essentially linear page geometry; migrate as a coordinated feature |
| Touch ownership | `touchstart`/move/end near 5014–5138 | Existing two-contact pinch can remain live when more contacts arrive; explicitly cancel provisional pinch before fold ownership |
| Durable state | `localState`, `normalizeStateCandidate`, `mergeDuplicateRecord`, `mergeState` | Fold state must not be dropped by whole-chapter replacement or treated as derived OCR data |
| Native | `PhloemBridgeViewController.swift`, `native/ipad.js` | No Pencil interaction bridge in this baseline; add a narrow native adapter |
| Delivery | `reading.html`, `reading-sw.js`, `apps/ipad/scripts/build-web.mjs` | New modules need web, offline, and native bundle inclusion together |

The renderer and `reading.js` are shared integration bottlenecks. Parallel agents may build pure modules/tests; only one agent edits shared reader integration at a time.

## 3. Frozen contracts for implementation

Contracts A/B remain proposed APIs. Pure contracts C/D are implemented with the names below; interaction requirements beyond the read-only pilot remain future work. Keep contracts stable between packets. If a contract changes, update this document and dependent tests together.

### A. Reader tool boundary

Canonical tool IDs: **`pen`, `highlight`, `eraser`**. UI text may say “Highlighter.”

Expose a narrow frozen object for the native adapter:

```js
window.PHLOEM_READER_TOOLS = Object.freeze({ dispatch, snapshot });
// dispatch({ type: 'select', tool, source: 'ui' | 'pencil' })
// dispatch({ type: 'cycle', tools: ['pen', 'eraser'], source: 'pencil' })
// dispatch({ type: 'previous' | 'toggleEraser' | 'togglePalette', source: 'pencil' })
// result: { status: 'applied' | 'queued' | 'ignored', tool, reason? }
// snapshot(): { tool, previousTool, paletteOpen, strokeActive, readerActive }
```

Whitelist input values and ignore commands when the reader is unavailable or a blocking dialog owns input. No unrestricted function lookup, JavaScript evaluation, or access to documents through this API.

Derive the effective tool from existing state: unified eraser first, then PDF Write, otherwise Pencil Highlighter. Keep desktop sticky Marker behavior independent. One transition function calls existing setters in a safe order and synchronizes all toolbar/dock selected states. Selecting a tool must not erase pending text selection. Previous-tool behavior tracks the previous distinct effective tool.

For hardware events only, queue a resolved target while ink or Pencil highlighting/erasing is active. Flush after successful completion, including the eraser's early-return path; clear on cancellation. Add an optional ink-engine completion callback after its commit/preview cleanup. Do not flush merely on pointerup before the commit callback runs.

### B. Pencil preference and native event

Device-local preference key: `readingRoom.pencilInteraction.v1`.

```json
{ "version": 1, "behavior": "cycle", "cycle": ["pen", "eraser"] }
```

Valid behaviors: `cycle`, `system`, `off`. Normalize unknown/malformed data to the default; deduplicate tools; require at least two. No credentials, document content, or sync settings belong here. Keep this preference device-local so an iPad hardware preference does not surprise a web/Mac session.

New native plugin: `PhloemPencilPlugin.swift`. Methods `getStatus()` and `setEnabled({ enabled })`; non-retained event `doubleTap` with `{ sequence, preferredAction }`. Status describes OS/API availability and current preferred action, not physical Pencil connection.

Attach one `UIPencilInteraction` to the reader's web view on the main thread. Follow the existing bridge/plugin registration pattern. Register listeners before enabling delivery; remove listeners and disable delivery on teardown/background. Reattachment must not accumulate interactions. Never retain tap events for replay.

The project targets iOS 15. Use availability guards and the SDK's supported initializer/delegate pattern. Implement the legacy delegate callback and the newer callback for newer OS versions through one emitter; verify one physical tap yields one event. The installed SDK notes that only the newer callback is invoked when both are implemented on supported OS versions. Do not raise the deployment target just for this feature.

Translate `switchEraser`, `switchPrevious`, and palette actions in `system` behavior. `.ignore`, `.runSystemShortcut`, and unknown values do not trigger app cycles. Swift owns OS enum translation; JavaScript owns reader state and preferences. A sequence guard in the adapter suppresses duplicate deliveries, scoped to the active bridge session.

### C. Fold storage

New pure module: `reading-folds.js`, exported as `window.PhloemFolds`, following the project's existing plain-script module style. Pure normalization/merge tests must run without a DOM.

Each PDF chapter gets `pdfFolds` only when needed. Hash-keyed buckets preserve folds from a conflicting/missing-file sync record without applying them to the wrong source:

```json
{
  "version": 1,
  "byHash": {
    "bare-lowercase-sha256-content-hash": {
      "items": {
        "fold-uuid": { "id": "fold-uuid", "page": 1, "y0": 0.24, "y1": 0.41, "updatedAt": 123456789 }
      },
      "deleted": { "previous-fold-uuid": 123456790 }
    }
  }
}
```

Page numbers are positive one-based integers. Coordinates use the same canonical page orientation and normalized source space as existing PDF annotations, not the collapsed DOM. Define conversion through the page's PDF viewport; add rotated-page fixtures before shipping. Require finite values and `0 <= y0 < y1 <= 1`; timestamps must be nonnegative safe integers. Require a nonempty ID of at most 128 characters and an exact match between record key and `id`. Reject malformed records individually, never the whole library. A valid record whose page exceeds a verified page count remains stored but is not applied; report the mismatch. Tombstones carry no document text.

Create new folds only after source identity is verified. Merge different hash buckets without dropping either; render only the verified current hash's bucket. Unknown-version or hashless imported fold payloads are retained, unapplied, in a chapter-level `pdfFoldPending` array. Deduplicate that array using recursively key-sorted JSON serialization; merge it independently of chapter replacement. Never reinterpret a future version as v1. Malformed individual v1 records need not be preserved as valid folds. These pending fields, like `pdfFolds`, are durable user data and are not executable input.

Clock validation captures one `validationNow` per import/merge. Accept timestamps only through `validationNow + 24 hours`; preserve future outliers, including their hash/ID and live-or-deleted identity, in `pdfFoldPending` and exclude them from ordering. Use that same captured time for both merge inputs so commutativity tests are meaningful. Revalidate before a mutation if the device clock has changed substantially. This guard prevents an imported `MAX_SAFE_INTEGER` or year-3000 timestamp from making ordinary unfold/undo impossible. Report pending clock data rather than silently clamping it into a current winning edit.

Merge rules:

1. Folds apply only to a matching original PDF content hash. A missing or mismatched hash must not blindly project onto a different file. Preserve pending data until identity can be verified; do not delete it on a transient missing-file state.
2. Within each hash bucket, merge by stable record ID, choosing greater `updatedAt`; deletion wins ties. For equal live timestamps, choose the numerically lexicographically greater `(page, y0, y1)` tuple (same ID). Reject unknown record fields rather than including them in the winner calculation. This makes merges commutative; never use receive order.
3. Union overlapping/touching active bands for display, retaining contributing IDs. Tapping a combined strip tombstones all of those IDs as one undoable action. Do not replace them with an unrelated ID just to render the union.
4. Undo restores the same IDs with a timestamp strictly greater than all applicable accepted live/tombstone timestamps. Redo tombstones them with a newer timestamp. For the affected IDs only, use `max(Date.now(), knownMax + 1)` and verify the result is a safe integer; outlier pending data never contributes to `knownMax`. Do not garbage-collect tombstones without a separate sync design.
5. Merge folds independently **before** whole-chapter `updatedAt` replacement in `mergeState`. Cover duplicate-document reconciliation in `mergeDuplicateRecord` as well as state normalization, backup restore, IndexedDB recovery, and iCloud payload round trips. Verify same-content duplicates; never transfer folds across different hashes.
6. `pdfFolds` is user data: it must survive `localState()` and must not enter `DERIVED_FIELDS`. Legacy chapters without the field render exactly as today.

The existing iCloud payload carries chapter JSON, so this design does not initially require a new CloudKit record type. Verify that with native bundle/sync tests; it is not permission to alter existing cloud schemas or claim real-account sync has been tested.

### D. Page projection

New pure module: `reading-pdf-projection.js`, exported as `window.PhloemPdfProjection`.

Input: source width/height in CSS pixels at the current scale, normalized active fold bands, and seam height (44 CSS pixels). Output: sorted visible source intervals, display intervals, seam intervals, and total display height.

For each disjoint band `[a, b)` in source pixels, removed height is `b - a - seamHeight`. A visible point below the band is shifted up by that amount. X is unchanged in this first, full-width model. A band must remove more than the seam height plus 8 pixels to be created; if a saved band becomes too small at a later zoom, temporarily show its original content without deleting the saved preference.

Provide named operations:

```js
build({ width, height, bands, seamHeight })
sourceToDisplay(point) // { kind: 'visible', point } | { kind: 'hidden', foldIds }
displayToSource(point) // { kind: 'visible', point } | { kind: 'seam', foldIds }
projectRect(rect)      // zero or more visible fragments; never stretch across a seam
projectPolyline(points) // clipped visible subpaths; never join across hidden content
```

The API is a projection instance returned by `build`. Point units are CSS pixels in the source/display spaces of that instance. Conversion to/from durable normalized points happens at the caller boundary. Specify half-open interval and boundary ownership in tests; the last page edge is included. Clipping interpolates segment/band intersections, including a segment whose endpoints lie outside a band on opposite sides.

Inverse mapping at a seam deliberately has no source point. Do not clamp an eraser or pen to hidden text. Clip each new display-space segment against seams **before** inverse mapping, including a segment whose successive samples jump completely across the strip. Store new visible subpaths as separate existing-format stroke records with separate IDs, committed under one compound undo action. Do not introduce a new compound stroke schema or synthesize ink through the hidden passage. Existing source-space strokes remain stored whole and render as clipped fragments.

Eraser policy: preserve whole-annotation erasure, but protect hidden content. Fully hidden annotations cannot be hit. If a hit visible annotation also extends into a hidden band, skip that annotation for the entire current gesture and queue the relevant bands for temporary reveal. Freeze projection until gesture completion; otherwise the current ink geometry guard cancels the stroke and newly visible marks move under the pointer. After successful commit/cleanup of ordinary eligible erasures, reveal the queued bands and explain “This mark crosses a fold. Erase again to remove the whole mark.” Cancellation drops pending reveals. A new gesture may erase the now-visible whole annotation. Apply this to both ink strokes and highlights, including highlight notes/IDs. Other wholly visible marks keep their existing eraser behavior. Undo after the subsequent erase restores the entire original object. Do not silently implement partial highlight splits or change note identities.

Keep one source raster per mounted page, then draw its visible source ranges into a display canvas. Avoid a full-size canvas per strip. Source and display canvases share the existing total raster pixel/memory budget; do not give each the old independent maximum and double Safari memory use. F4 must measure the baseline render limits, budget the combined allocation, and discard derived display rasters before reusable source data when evicting. Document peak allocation in the long-document/high-zoom test. Keep source and display height separate on the page model. Rebuild projection when scale, page rotation, folds, or layout changes; retain it when page rasters are virtualized away. Do not overwrite source canvas dimensions with compressed dimensions, because thumbnails and other source consumers depend on them.

Text must remain in correct reading order and copy/selection must exclude hidden passage text. A hidden text layer is not sufficient if `Range.toString()` still includes it. Route selection serialization through visible source ranges and split text/link hit regions at band boundaries. Search continues indexing the original full document; selecting a result inside a fold temporarily reveals that band for the current session without creating a durable unfold or sync mutation.

Temporary reveals carry a reason (`find`, `navigation`, or `eraser`) and fold IDs. A Find reveal lasts until Find closes or moves to a different hit; reveal the new hit before restoring the old one. Navigating to a hidden link destination reveals its band until return-navigation or leaving the page. An eraser reveal lasts until changing tool or leaving the page. Multiple reasons may coexist; restore a band only after its last reason is cleared, and preserve the current visible source anchor. Clear all transient reasons on document close/reload. No automatic re-collapse during a live stroke or text selection; defer cleanup until it finishes.

All geometry consumers must adopt the same map: rendered PDF; text selection; new/saved highlight rectangles; new/saved ink; both erasers; internal/external PDF links; Find boxes; guide/pin positioning; scroll anchors; page navigation and return positions; region thumbnails; page-height/virtualization calculations. A hidden passage cannot receive clicks or erasure.

Guide-derived context must describe the visible guide region. Explicit full-page AI actions retain their documented full-page scope; do not silently redefine AI requests or send content automatically when folding. Exporting the original PDF must return the unmodified original. Any future flattened annotation export requires its own explicit folded/unfolded policy.

### E. Gesture arbitration

One reader gesture owner at a time: idle, provisional pinch, zoom/pan, page turn, Pencil stroke, guide drag, fold preview. Model this explicitly; do not add a fifth independent touch handler that races the others.

- Fold recognition is touch-only, exactly four valid finger contacts on the same PDF page; never treat Pencil/palm contacts as the four fingers.
- Extra contacts, OS cancellation, crossing page boundaries, or contact loss before convergence abort cleanly with no fold write. After convergence, ordinary staggered release of the original fingers is accepted; open the preview only after the last lift. Replacement contacts or renewed dragging during release abort. No accidental zoom commit from a stale two-finger gesture.
- If contacts arrive progressively, only a provisional pinch may hand over. Cancel its transient transform and pending commit first. Once zoom/page-turn owns meaningful movement, additional fingers must not steal it.
- Prototype thresholds, not promises: collect steady contacts over up to 800 ms with at most 12px movement before ownership; use finger-relative left/right groups separated by at least 40px and upper/lower gaps of at least 40px. Require consistent vertical convergence, at least 32 CSS pixels and 20% shrink. Tune on physical devices. Transient state/reason feedback is local and content-free; do not add document/touch-coordinate telemetry.
- Recognition opens the fold preview with Confirm/Cancel. Until confirmed, it changes no document state. Keep visible handle-based folding even if the gesture is rejected by the platform.
- Do not put global `touch-action: none` on the reader, suppress all system gestures, or modify unrelated browser/pinch/page-turn behavior. Choose a native recognizer only if a device spike proves the web path cannot arbitrate safely; document why before expanding native scope.

## 4. Bounded task packets

Each packet is a separate, reviewable change. Add its tests in the same packet; update the evidence log below. Do not “finish” a packet by weakening old assertions or dispatching synthetic clicks on controls that are no longer visible.

### A0 — Baseline and characterization

Inputs: this plan and current working-tree status. No production edits.

- Verify the real branch, current build settings, and any user edits. Preserve unrelated changes.
- Run the relevant existing tests in section 5 and record pre-existing failures separately.
- Add a small source-authored PDF fixture specification: two pages, two columns on one page, one rotated page, text crossing proposed fold boundaries, link destination, saved ink and highlights. Do not use the user's private paper as a committed fixture.
- Confirm page coordinates and current tool defaults before implementing assumptions.

Exit: reproducible baseline evidence and fixture geometry. A missing WebKit binary or physical Pencil is an explicit untested item, not a pass.

### A1 — One tool command boundary

Requires A0. This is the first production implementation packet, after baseline checks.

Files: `reading.js`; new `tests/reading-tool-controller.test.js`; existing annotation tests only if assertions expose a real defect. Keep native and Zen markup unchanged.

Implement contract A using existing setters. Route existing Pen/Marker/Eraser handlers through it without changing their UI. Test exclusive tool state, desktop Marker independence, selected text preservation, unknown commands, non-PDF Pen unavailability, previous-tool semantics, and palette Done. No eager rewriting of the entire reader.

Exit: all old annotation workflows pass plus controller tests. No native plugin yet.

### A2 — Compact Zen chrome

Requires A1. Every tool-changing control in Tools/More/Guide must call the A1 command boundary, not create parallel setters or booleans. Guide/layout changes that do not select an annotation tool retain their existing handlers.

Files: `reading.html`, `reading.css`, `reading.js`; targeted test updates as a separate review chunk if needed.

Replace the ten-button rail with the specified four controls and conditional Undo. Single popup owner; reuse current subcontrols inside Tools/More. Keep left guide pin and existing palette controls. Remove obsolete direct-layout popup code only after replacing all references in `applyComfort`, rendering, and outside-click handlers.

Update visible-click tests in `reading-zen-ipad`, `reading-tool-palettes`, `reading-annotation-tools`. Find focus returns to More; palette Escape returns to Tools. Add selection → Tools → Highlighter test, guide/Tools/More mutual exclusion, keyboard focus, one Undo, and responsive checks. Do not call `.click()` on hidden former rail buttons to keep tests green.

Exit: fewer resting controls, no lost feature, screenshots reviewed at the viewport matrix in section 5.

### A3 — Safe stroke completion queue

Requires A1; coordinate reader-file ownership with A2. Test injected commands at the boundary only. Native event delivery belongs to A4/A5, not this packet.

Files: `reading.js`, `reading-ink.js`, controller/ink-state tests.

Implement pending hardware tool transitions and after-commit hooks. Cover pen, Pencil highlighter, unified eraser, cancellation, multiple queued taps, document changes, and background. Preserve pressure, hold-to-straighten, undo grouping, and fine-size preference.

In the web reader, background means `visibilitychange` when `document.visibilityState === 'hidden'`, or `pagehide`. Clear pending transitions through one cancellation path on those events, explicit document replacement, reader close, or opening a blocking Settings dialog. Tests inject these lifecycle conditions; they must not invent a native bridge to satisfy A3. Resuming visibility never replays the cancelled queue.

Exit: a double-tap injected mid-stroke never truncates ink or changes tool before successful commit. Cancelled gestures apply no queued transition.

### A4 — Native Pencil bridge

Files: new `apps/ipad/ios/App/App/PhloemPencilPlugin.swift`, `PhloemBridgeViewController.swift`, Xcode project only if registration requires it; isolated native test/evidence notes.

Implement contract B's native portion. Inspect existing custom-plugin registration rather than assuming adding a file is enough. Availability guards; one emitter; non-retained event; lifecycle cleanup. No changes to AI/Cloud plugins, permissions, signing team, or deployment target.

Exit: simulator/device compilation succeeds; lifecycle behavior tested; hardware delivery evidence clearly distinguished from simulator evidence. Can run in parallel with A2 after A1's contract is frozen.

### A5 — Cycle preferences and adapter

Files: `apps/ipad/native/ipad.js`, reader settings markup/logic, new cycle test file. Split pure preference/cycle logic into a small new module if needed; do not duplicate cycle algorithms between native and web.

Connect native events to contract A, implement settings and validation, system behavior and Off, event dedupe, ignored stale events, and default pair. A web preview/test may call the command boundary but must not fake native support in normal web UI. Settings may be disabled with an explanation on a non-native browser.

Exit: default/custom cycle tests pass; hardware checklist in section 5 passes before claiming this works on an iPad. Bundle new modules in A6 before release.

### A6 — Integration and first milestone candidate

Files: asset integration points (`reading.html`, `reading-sw.js`, `build-web.mjs`), bundle tests, release evidence.

Include all new modules in native reader allowlist and offline shell. Keep cache-bust references synchronized; inspect the current version and increment it once for the integrated change, rather than hardcoding an old number. Build the web bundle, run native tests, sync Capacitor, compile, and verify built resources contain the exact new UI/plugin code.

Exit: A is a tested candidate. Do not upload, submit, publish, push to main, or change release numbers as an incidental test. Those are explicit release actions, not prerequisites for completing this plan.

### F1 — Pure fold storage and merge

Files: `reading-folds.js`, `tests/reading-folds-state.test.js`.

Implement contract C normalization, matching hash, merge, tombstones, union bands with contributing IDs. Property-style cases: merge commutativity/idempotence, malformed records, independent device additions, deletion vs stale copy, same-timestamp conflict, same-content duplicate, missing identity, restore after deletion. Include exhausted/far-future clocks (`MAX_SAFE_INTEGER`, year 3000) and accepted clock skew several hours ahead; malformed imported clocks must not prevent subsequent unfold/undo of valid folds. No reader UI.

Exit: pure tests pass. May run in parallel with F2.

### F2 — Pure projection math

Files: `reading-pdf-projection.js`, `tests/reading-pdf-projection.test.js`.

Implement contract D. Numeric tests cover identity/no folds, disjoint/overlapping bands, top/bottom boundaries, rotated viewport conversion at caller boundary, zoom/seam suppression, inverse round trips for visible points, hidden/seam tags, clipping crossings, and total height. Example: height 1000, band [200,400), seam 44 gives height 844 and source y=500 → display y=344.

Exit: exhaustive deterministic math tests without a browser. No source annotation writes.

### F3 — Persistence integration

Files: `reading.js`, persistence/fold-state tests, iCloud payload test; a separate small asset-registration change.

Wire `pdfFolds` through normalization, localState, duplicate merge, whole-state merge, backup export/restore, safety-copy recovery, and native sync payload. Identity gate before applying. Add fold undo command type to existing history without changing annotation commands. Register `reading-folds.js` in `reading.html` before `reading.js` now, and add its offline/native allowlist entries; browser integration cannot wait until F9 to load it. Keep all UI hidden behind one explicit development feature gate that defaults off in release builds.

Exit: new and legacy libraries reload losslessly; unrelated paper edits cannot discard folds; deletion is not resurrected by stale cloud JSON. No UI exposed yet.

### F4 — Scroll rendering and viewport anchors

Files: `reading.js`, `reading.css`, new `tests/reading-pdf-fold-render.test.js`; projection module only for a discovered contract defect.

Register `reading-pdf-projection.js` before its consumers and add its offline/native allowlist entries in a small integration change, then wire source/display canvas separation and visible strips into Scroll only. Correct holder height, virtualization, re-render, fit/zoom, rotation, and position restoration. Retain full source raster access for region thumbnails. Fold/unfold keeps a visible source anchor stationary as far as viewport bounds permit.

Exit: pixels actually close the gap; image dimensions and memory are bounded by mounted pages, not number of bands. All source PDF/annotation data remains identical. Feature remains gated until F5–F9 pass.

### F5 — Selection, highlights, and links

Files: `reading.js`, fold integration tests, relevant selection/link tests.

Use projection for source/display text ranges, copy serialization, highlight creation/render/hit testing, and PDF link regions. Hidden text is not accidentally copied or highlighted by a drag across a seam. Link rectangles spanning a seam split; hidden links cannot fire. Existing source highlight IDs and notes survive fold/unfold.

Exit: crossing-seam text selection and real pointer hit tests pass in Chromium and WebKit; existing highlight endpoint and hover-suppression tests pass. No synthetic hidden-element shortcuts.

### F6 — Ink and unified eraser

Files: `reading-ink.js`, reader geometry adapter, new fold-annotation tests.

Use inverse projection for new ink/eraser input and fragment projection for old ink. Split new seam-crossing strokes with one undo group. Neither eraser can touch hidden source content. Preserve smooth pressure and held straight lines. Existing ink bytes must be unchanged by view-only folding.

Exit: pen/eraser operations above/below/on a seam, folds through existing strokes, undo/redo, reload, and unfolding retain exact source alignment. Explicitly test the reveal-first policy: first gesture keeps the spanning object intact and reveals only after cleanup; second gesture removes it; Undo restores its exact ID, notes and geometry. Cancelled first gesture reveals/deletes nothing for that protected object. Test samples jumping completely across a seam, not just samples landing inside it.

### F7 — Guide, Find, navigation, and layout gate

Files: `reading.js`, fold navigation tests, guide/continuity tests.

Map guide/pin and guide-derived text, Find rectangles, internal destinations/back navigation, saved positions, and page counters. Find can temporarily reveal a folded match without changing durable fold state. Clear/reconcile temporary reveals on document change. Until D1 is complete, switching to Page/Book shows original pages and preserves saved fold preferences with a concise “Folds shown in Scroll” explanation; no silently partial projection.

Exit: every consumer listed in contract D is either mapped or explicitly disabled/expanded under the layout gate. No invisible clicks, wrong-page guide context, or scroll jumps on rebuild.

### F8 — Visible fold editor and accessible strips

Files: `reading.html`, `reading.css`, `reading.js`, new fold UI tests (split markup and behavior review if too large).

Add More → Fold section, adjustable band preview, Confirm/Cancel, tap-to-unfold strips, and Unfold all. Keyboard alternatives for boundary adjustment; labels/values identify page and range. Escape and outside dismissal make no writes. Confirm announces hidden extent. A fold action with underlying annotations preserves them and can be undone as one action.

Exit: complete UI checklist; feature remains gated until F9. Do not claim paragraph-only two-column folding or gesture support yet.

### F9 — Fold packaging and milestone B gate

Files: `reading.html`, `reading-sw.js`, `apps/ipad/scripts/build-web.mjs`, bundle tests and evidence.

Verify the script order and offline/native entries added during F3/F4, and synchronize final cache versions. A6 covers the earlier milestone only; it cannot validate modules created afterward. Run the full fold and legacy regression matrix, offline web cold-start, native bundled cold-start, and native build/resource inspection. Measure combined raster allocation on a physical iPad during long-document/high-zoom use; a desktop memory measurement is not sufficient.

Exit: all B gates pass, with device limitations recorded. Only then enable the tested Scroll fold capability in a candidate build. No upload or App Review submission implied.

### G1 — Four-finger feasibility spike

Files: one isolated development harness or gated recognizer plus device evidence. No production gesture default change.

On a physical iPad, record whether WKWebView delivers four contacts, cancellation sequences, progressive arrivals, and system interception in full-screen/Split View/Stage Manager where available. Test accessibility configurations without requiring them to be disabled. Compare web vs native only if necessary. Produce a go/no-go decision and proposed ownership thresholds.

Exit: actual device evidence. If no-go, keep handle-based folding and document the unsupported shortcut; do not mark the user's gesture request completed.

### G2 — Gesture integration

Requires F9 and a successful G1. Files: gesture owner/recognizer code, reader hook, gesture tests.

Implement contract E. Share the fold preview with visible controls. Test 1/2/3/4/5-contact transitions, fast/slow arrival, pointer/touch duplicate streams, OS cancel, Pencil with palm, existing pinch/pan/page turn, and guide drag. No state writes before Confirm.

Exit: synthetic tests plus physical regression checklist. Gate off the shortcut if any normal input regression remains.

### D1 — Page and Book coverage

Requires B. Separate design/implementation packet(s); do not rush into F4.

Define each leaf's projected height, facing-page alignment, scrolling, turn surface geometry, saved source anchors, and guide movement across the gutter. Preserve page numbering and source page identity; do not repaginate the PDF as if it were reflowed text. Decide and document how unequal folded leaf heights fit the existing Book layout before coding.

Exit: vertical Book flow, curls/turns, guide crossing, internal-link return, zoom/pan, first/final leaf, and temporary Find reveal all pass with folds. Only then remove the Scroll-only explanation.

### D2 — Paragraph-specific folding research

Not covered by a full-width vertical map. Prototype how a single-column paragraph can disappear in a two-column PDF without removing, overlapping, or unexpectedly reordering the other column. Define reading order, images/equations spanning columns, text selection, annotation hit testing, and export semantics. A trustworthy reflow/column projection needs its own contract and fixtures before implementation. Keep the full-width preview honest in the meantime.

## 5. Verification and release gates

### Commands

Run from the repository root unless stated otherwise. This repository has no root package.json; do not add one merely to run tests. Existing browser tests are Node scripts and resolve `playwright`/`playwright-core`. Use the configured runtime/dependencies when present; do not install unrelated packages or modify lockfiles for an unavailable test browser.

```sh
node tests/reading-zen-ipad.test.js
node tests/reading-tool-palettes.test.js
node tests/reading-annotation-tools.test.js
node tests/reading-book-guide.test.js
node tests/reading-pdf-ink.test.js
node tests/reading-pdf-ink-state.test.js
node tests/reading-pdf-ink-continuity.test.js
node tests/reading-pdf-ink-hold.test.js
node tests/reading-pdf-ink-palette.test.js
node tests/reading-pencil-highlight.test.js
node tests/reading-pencil-boundaries.test.js
node tests/reading-unified-eraser.test.js
node tests/reading-selection-touch.test.js
node tests/reading-find-highlight.test.js
node tests/reading-pdf-links.test.js
node tests/reading-pdf-continuity.test.js
node tests/reading-vertical-book-flow.test.js
node tests/reading-persistence.test.js
node tests/reading-app-update.test.js
node tests/reading-keeps-state.test.js
node tests/reading-keeps-browser.test.js
node tests/reading-folds-state.test.js
node tests/reading-pdf-projection.test.js
node tests/reading-fold-gesture.test.js
node tests/reading-fold-browser.test.js
node tests/reading-fold-phone.test.js
npm --prefix apps/ipad test
npm --prefix apps/ipad run build
git diff --check
```

Also run every new test named in the completed packets. For browser suites that support it, repeat with `PHLOEM_BROWSER=webkit`. Some existing suites use fixed ports; run them serially unless ports are explicitly isolated. `CHROME_PATH` is supported by many but not necessarily all scripts; inspect the launcher rather than assuming every suite reads it.

After the built bundle passes, run `npm --prefix apps/ipad run ios:sync`, inspect generated changes, and use the Xcode project's actual scheme/destination for simulator and device builds. Do not change signing identities or release numbers to hide build failures. Inspect archive contents when a release archive is later authorized: web code can be current while a native binary still bundles old assets.

### Acceptance matrix

- Viewports: 1024×768, 768×1024, 844×390, 390×844, and 320×800; safe areas, hardware/software keyboard, large text, light/dark themes.
- Inputs: mouse, keyboard, finger selection/scroll, two-finger zoom/pan, Pencil, Pencil with resting palm. Supported physical Pencil double-tap, iPad system setting Off, app Off/custom/system, and foreground/background.
- Documents: original field guide, source-authored single/two-column fixtures, scanned page, rotated page, blank page, long document, existing saved highlights and handwritten notes.
- Data: empty/legacy library, malformed one-record data, reload, offline cold start, restored backup, duplicate import, independent device additions/deletions, stale sync merge. Physical iCloud round trip is separate from payload simulation.
- Gestures: rapid repeated double-taps; event during held straight line; cancel while erasing; three/four/five-finger arrival; system cancellation. No default behavior change for unsupported gestures.
- Fold geometry: above/inside/below band, multiple/overlapping folds, drawing/selection across strip, tap hidden link, Find hidden hit, guide at seam, rotation/zoom/reload, virtualization away/back, restore all, undo/redo, and original PDF export.

Release must preserve these user priorities: left Zen guide handle, no Pencil-hover reference popup, compact pen/highlight palettes, fine pen default, smooth and pressure-aware handwriting, hold-to-straighten, precise first/last-letter highlights, unified eraser, and saved annotations. Region-gated AI and iCloud changes already on main must remain untouched and regressions checked.

### Rollback

Keep folding behind a capability gate until all geometry consumers are ready. Turning the gate off renders original pages but retains fold records/tombstones; never clear user data. A disabled/broken native Pencil bridge leaves on-screen tool selection intact. Roll back a release candidate through normal version control, not destructive resets of the user's checkout or deletion of saved state.

## 6. Prompt for a smaller implementation model

### Model routing and escalation

The user explicitly authorized delegating to smaller models and switching back to stronger ones when needed. Apply this within the existing task, without repeatedly asking for a model choice. This is task-level delegation, not authorization to change global account settings, spend limits, or the app's AI providers.

Use models actually exposed by the current runtime. The following is a task-specific routing recommendation, not a benchmark or a claim that one model can safely handle every packet:

| Routing | Initial candidates in this session | Suitable work |
| --- | --- | --- |
| Small, bounded agent | `gpt-6-luna`, high reasoning | Characterization tests, fixture checks, asset-list verification, settings validation, documentation/evidence checks |
| Bounded implementation agent | `gpt-6-sol`, high reasoning | A1–A3 and A5 after contracts/prerequisites are explicit; targeted UI and test changes |
| Stronger owner or reviewer | Primary agent or available `gpt-6-astra` | Native lifecycle ambiguity, fold projection and persistence contracts, gesture ownership, cross-layer integration, final data-safety review |

Give an agent one packet, file ownership, baseline, tests, and the relevant contracts. Do not ask a small agent to implement the entire roadmap. Pure modules may be implemented by a bounded agent after a stronger owner settles the contract, then independently reviewed. Model routing follows the available per-agent controls described in [OpenAI's subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents); exact model availability is verified from the current tool list.

Escalate immediately for possible annotation loss, coordinate ambiguity, privacy/sync/signing scope, conflicting contracts, or a required architectural change. Also escalate after two targeted repair attempts fail to fix the same test, instead of weakening it or widening the patch. A missing device is an evidence limitation, not something a stronger model can simulate away.

To switch back: send the owner a concise handoff with task ID, changed files, failing test/output, hypotheses already tried, and the exact unresolved decision; then stop overlapping edits. The owner resumes the work or assigns a stronger agent. After the issue is resolved, return a smaller, concrete follow-up to the bounded agent. No permission is needed merely for this model change; new external actions or substantive scope changes still follow the user's normal authorization boundaries.

### Reusable task prompt

Copy this and substitute one task ID; do not assign the entire document in one pass.

> Implement packet **[TASK ID]** from `apps/ipad/plans/ZEN-FOLD-PENCIL-PLAN.md` and only that packet. Read its prerequisites, frozen contracts, touched-file map, and acceptance criteria first. Inspect git status and preserve unrelated work. If prerequisites are missing, identify them instead of inventing another API. Add or update tests for observable behavior and use real visible controls in browser tests. Do not change AI/privacy/sync policy, signing, release numbers, or unrelated UI. Do not push, upload, or submit a build. You may escalate to the owner/stronger model under this plan's routing rules; do so for safety/architecture ambiguity or two unsuccessful targeted repairs, and preserve a clear handoff. Report changed files, exact commands and results, device checks not performed, remaining risks, and the next packet. A mock, compile, or synthetic event is not proof of physical Pencil behavior. Update the evidence log only with work actually completed.

Handoff rules:

- One agent owns `reading.js` at a time. Parallelize F1/F2 or native bridge work only after agreeing on contracts; merge and test before the next reader integration.
- Prefer a small new pure module to another large anonymous inline implementation, but preserve the app's plain-script architecture and packaging.
- Split a packet further if it needs unrelated edits across many subsystems. Do not conceal scope expansion under “cleanup.”
- Give the next model the commit/baseline, task ID, failing tests, and untested hardware conditions. No unexplained “all good” handoff.

## 7. Evidence log

| Item | Status | Evidence / limitation |
| --- | --- | --- |
| Source audit | Complete | Zen, ink, PDF geometry, persistence, native bridge and packaging inspected at `070ee9b3` |
| User decisions | Confirmed | Gap-closing fold with tap-to-unfold; Pen ↔ Eraser default with custom cycle |
| Interface exploration | Preview only | Compact rail and Reading/Annotating variants; simulated folds and double-taps, not PDF rendering or hardware |
| Preview interaction checks | Passed in Chrome | 320, 736, and 1024 CSS-pixel surfaces; collapse/restore, cycles and reorder, minimum tool count, exclusive selection, guide position, Escape/focus, responsive fit, saved-state restore; no page errors |
| Model routing | Authorized | Smaller agents for bounded work; explicit escalation to stronger owner; no global model/settings change |
| Smaller-model handoff check | Complete | GPT-6 Luna reviewed A1–A3; explicit command-boundary dependency and lifecycle acceptance added following its escalation |
| Reading keeps | Implemented, browser-verified | 12 pure tests; text/PDF creation, editing, resolution, deletion, resume, exact-position jump, backup merge and future-version preservation; no AI/outbound request from parking questions |
| A0–A6 | Roadmap remains | Baseline tests rerun; no compact-rail replacement or native Pencil bridge implementation |
| F1/F2 | Pure modules implemented | 13 fold-state + 12 projection tests: hash scope, clocks, merge/tombstones, opaque pending data, clipping, seams, inverse coordinates |
| F3/F4/F7/F8 | Read-only Scroll pilot | Storage/merge integration, verified source identity, source anchors, derived raster + clipped existing annotations, real gap collapse, preview/cancel, durable tap-unfold and transient editing reveal |
| F5/F6 | Deferred behind read-only policy | Folded pages consume input to reveal originals; no projected text selection, new ink or eraser writes through seams |
| F9 packaging | Web bundle verified, native/device gate open | All modules/styles in HTML, worker cache v145 and iPad allowlist; web build 59 assets / 13.3 MiB; native bridge tests 16/16. No Xcode archive or physical memory test |
| Fold browser integration | Passed in Chrome touch viewport | Four-contact synthetic preview, no pre-confirm writes, real collapsed height, source+derived canvas cap ≤9M pixels, exact annotation preservation, reload, Page/Scroll layout switching, seam unfold, Unfold all and stable-ID Undo, transient reveal, disable-with-data-retained |
| G1/G2 | Synthetic candidate only | 6 gesture tests plus browser event routing; physical contacts/system arbitration untested. Gate off by default |
| D1/D2 | Not started | Page/Book render originals; single-column paragraph folding unresolved |
| Existing regressions | Listed suites passed for integrated code | Persistence, PDF continuity, ink (71/71), Zen, touch dock, selection note/AI, selection touch, app-update, Pencil highlighting, Pencil boundaries (53/53), unified eraser (66/66), PDF links, Find/highlight and iPad tests. One initial hybrid-selection transient passed on immediate rerun; no test assertions weakened |
| Book guide regression | Open baseline-reproduced timing failure | `reading-book-guide.test.js` failed 3 integrated runs during Zen Book cross-leaf drag: asynchronous refit or guide context stays on page 2. Read-only baseline (`git show HEAD` HTML/CSS/JS served from memory) passed once and reproduced the same failure once. No assertions bypassed; investigate Zen reflow/readiness separately before a release candidate |
| Independent data-safety review | No actionable finding | Read-only review of source-identity gating, source coordinates, future-version preservation, pending clocks, storage/merge paths and guide AI scope |
| Visual checks | Reviewed | Notebook keeps panel/dialog and actual folded two-column PDF with saved ink/highlight inspected in rendered browser screenshots |
| Hardware/cloud limitations | Not tested | Physical Pencil/four-finger gestures, WebKit, long-document iPad memory, real-account iCloud round trip |
| Upload / App Review | Not performed | No push, native archive, upload or submission in this implementation pass |

## Sources and API checks

- [Apple: handling double-taps](https://developer.apple.com/documentation/ApplePencil/handling-double-taps-from-apple-pencil) — system preference and configurable alternative behavior.
- [Apple: UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction), [delegate](https://developer.apple.com/documentation/uikit/uipencilinteractiondelegate), [preferred actions](https://developer.apple.com/documentation/uikit/uipencilpreferredaction) — native integration and action handling.
- Installed SDK header inspected: `UIKit.framework/Headers/UIPencilInteraction.h` in the iPhoneOS 27.0 SDK. Confirm availability against the compiler used for the actual build; simulator delivery is not a hardware test.
- [Apple iPad advanced gestures](https://support.apple.com/guide/ipad/learn-advanced-gestures-ipadab6772b8/ipados) — system gestures are a platform concern. The proposed four-finger recognizer's reliability is an engineering hypothesis pending G1, not a documented platform guarantee.
