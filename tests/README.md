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
retype, reopening a note — even an edited one — returns to its own thread
instead of starting another, and the reply renders its Markdown and LaTeX as
formatted prose rather than raw stars and backslashes.

`reading-library-stack.test.js` covers the fixed category-highlighter rail and
soft reading wall: the two-column handwritten sticky grid, category
creation/renaming, searchable and scrollable move picker, overflow scrolling for
many category highlighters, drag-to-reorder categories, drag-to-file sticky
notes, persisted category order, selection, search, and mobile fit.

`reading-pdf-zoom.test.js` covers the one-time migration from the legacy 50%
initial PDF scale to Fit while preserving deliberate per-paper zoom choices.

`reading-vertical-book-flow.test.js` covers the single-leaf phone and cropped
two-page desktop right-to-left PDF flows, book-direction controls and swipe
gesture, scanned-text fitting, guide placement, the independent PDF/guide
direction choices, and switching back to the continuous scroller. Set
`PHLOEM_VERTICAL_BOOK_TEST_PDF` to exercise it against a particular scanned book.

`reading-pdf-authors.test.js` covers full page-one author extraction, repair of
older blank credits, and preservation of manually edited author fields.

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
`file://` PDFs, Chrome's permission-denied path, HTTP errors, and the direct file
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
node tests/reading-pdf-zoom.test.js
node tests/reading-vertical-book-flow.test.js
node tests/reading-pdf-authors.test.js
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
