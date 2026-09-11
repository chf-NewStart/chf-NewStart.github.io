# Phloem reader tests

Headless regression tests for `reading.html` (the Phloem reader). They serve the
repo over a local HTTP port, seed `localStorage` with a small paper, and drive a
real Chromium through the highlight workflows: marker strokes, click-to-erase,
the highlight card (recolor, per-highlight notes, remove), and undo/redo.

`reading-ai-providers.test.js` covers the AI provider router: keyless on-device
Gemini, migration of an existing DeepSeek key, current model selection, saved
thread context, the provider settings UI, and AI-key transfer through a private
device setup link even when GitHub sync is not configured.

`reading-selection-note-ai.test.js` covers the compact, note-first selection
card: no immediate AI shortcut, automatic highlight support for a note, and an
AI thread that appears only after the note contains text. It also covers the
thread itself: opening one sends the note as the question with nothing to
retype, a note that already has a thread offers to open it rather than start
one, reopening a note — even an edited one — returns to that thread instead of
starting another, and the reply renders its Markdown and LaTeX as
formatted prose rather than raw stars and backslashes.

`reading-library-stack.test.js` covers the fixed category-highlighter rail and
soft reading wall: the two-column handwritten sticky grid, category
creation/renaming, searchable and scrollable move picker, overflow scrolling for
many category highlighters, drag-to-reorder categories, drag-to-file sticky
notes, persisted category order, selection, search, and mobile fit.

`reading-library-list.test.js` covers the persisted Wall/List switch, one compact
global list with category filters, row metadata, existing search and sort
controls, multi-select moves into existing or newly created categories,
one-click opening, and a non-clipping phone layout.

`reading-library-thinking-search.test.js` covers library search across ordinary
page notes, highlighted passages, reviewer work, paired highlight notes, exact
page opening, responsive results, and List-mode category and bulk-move controls.

`reading-find-highlight.test.js` covers exact, persistent in-paper Find ink,
individual-occurrence arrows, saved-marker cleanup, PDF/Reader switching, Page
rebuilds, and phrases split between PDF.js text-layer spans.

`reading-ipad-touch-dock.test.js` covers the coarse-touch iPad dock, 52px Guide,
Highlight, Notes, and More targets, persisted left/right placement, temporary
notes that preserve PDF size and position, the explicit wide-landscape pinned
panel, portrait fallback, keyboard-safe page-note editing, adaptive settings,
dialog focus/return, and 44px touch targets. Set `PHLOEM_BROWSER=webkit` to run
the same workflow against Playwright WebKit.

`reading-pdf-continuity.test.js` covers exact PDF-point cursor persistence across
reload and rotation-like resizing, explicit Left/Right/Full column states,
vertical passage preservation while changing column widths, the keyboard page
jump, and independent interface and paper appearance. It runs in Chromium by
default and in WebKit with `PHLOEM_BROWSER=webkit`.

`reading-library-return-offline.test.js` covers the three-item Continue reading
row, `lastOpenedAt` ordering, durable IndexedDB-backed Offline filtering, and
separate local-reading and Drive-backup states.

`reading-pdf-zoom.test.js` covers the one-time migration from the legacy 50%
initial PDF scale to Fit while preserving deliberate per-paper zoom choices.

`reading-vertical-book-flow.test.js` covers the uncropped Page and Book layouts,
old-setting migration, phone fallback, conventional cover/spread parity, final
blank leaves, the center seam, automatic midpoint curls from arrows and keys,
physical single-page stacks, direct mouse page curls with a real backside and
under-page, spine-bound diagonal folds, and iPad-style Page/Book touch curls that
follow the finger without an artificial fingertip halo, bottom-corner tap turns,
touch intent/pinch/pan preservation, OS touch-cancel cleanup and zoom-edge curl
handoff, curl cancel/commit thresholds, mid-drag cleanup,
left-to-right arrows and swipes, rapid-turn queuing and cancellation, internal-
link return, independent PDF/Guide choices, reduced motion, and switching back
to Scroll.

`reading-pdf-authors.test.js` covers full page-one author extraction, repair of
older blank credits, and preservation of manually edited author fields.

`reading-pdf-title.test.js` covers publisher job codes masquerading as PDF
titles, page-one title recovery for new imports and older saved papers, and
preservation of a normal curated title.

`reading-pdf-toc.test.js` covers navigation inferred from a printed contents
page when the PDF has no embedded bookmark tree, including printed-to-PDF page
offsets and numbered section hierarchy.

`reading-typography.test.js` covers the Reflow-only Book/Clean typeface control,
its immediate effect on long-form text, and persistence across reloads.

`reading-gdrive-large-pdf.test.js` covers automatic Google Drive roaming for
large books: the 200 MB ceiling, resumable chunk uploads, saved checkpoints,
resume probing, and honest per-paper transfer states.

`reading-docx-review.test.js` covers the unified PDF/Word Add flow, its explicit
one-file and paper-plus-comments reviewer paths, DOCX archive extraction, Word
comment-range highlights, lossless numbered-concern segmentation, automatic
Under review filing, scope/topic classification, persistent clickable PDF review
marks, multi-passage grounding, legacy-import refresh notices, strict AI passage
validation, the reviewer sidebar, response and resolved state, and original
Word-file roaming.

`reading-extension-local-pdf.test.js` covers extension imports for local
`file://` PDFs, Chrome's permission-denied path, HTTP errors, APS browser-check
recovery, acknowledged app handoff, stale receiver upgrades, and the direct file
picker fallback.

`reading-app-update.test.js` keeps the reader bundle and offline worker on one
version, bypasses the browser's worker-script cache, and upgrades already-open
older copies without making first-time visitors reload twice.

`reading-persistence.test.js` covers reload-safe library metadata, isolation of
malformed saved records, IndexedDB safety-copy restoration, and recovery of an
original PDF whose metadata disappeared.

`reading-review-fail-closed.test.js` covers the passage-quality boundary: weak
AI matches remain unhighlighted, rejected matches become manual-only, corrected
passages override AI, and unsafe locations are omitted from shared layers.

Run with Node 18+ and Playwright's bundled Chromium:

```sh
npm install playwright
node tests/reading-highlights.test.js
node tests/reading-ai-providers.test.js
node tests/reading-selection-note-ai.test.js
node tests/reading-library-stack.test.js
node tests/reading-library-list.test.js
node tests/reading-library-thinking-search.test.js
node tests/reading-find-highlight.test.js
node tests/reading-ipad-touch-dock.test.js
PHLOEM_BROWSER=webkit node tests/reading-ipad-touch-dock.test.js
node tests/reading-pdf-continuity.test.js
PHLOEM_BROWSER=webkit node tests/reading-pdf-continuity.test.js
node tests/reading-library-return-offline.test.js
node tests/reading-pdf-zoom.test.js
node tests/reading-vertical-book-flow.test.js
node tests/reading-pdf-authors.test.js
node tests/reading-pdf-title.test.js
node tests/reading-pdf-toc.test.js
node tests/reading-typography.test.js
node tests/reading-gdrive-large-pdf.test.js
node tests/reading-docx-review.test.js
node tests/reading-extension-local-pdf.test.js
node tests/reading-app-update.test.js
node tests/reading-persistence.test.js
node tests/reading-review-fail-closed.test.js
```

Exit code 0 means every check passed. If your Chromium lives in a nonstandard
place, set `CHROME_PATH` when running the AI provider test or pass it via
`chromium.launch({ executablePath: ... })` in the highlight test.
