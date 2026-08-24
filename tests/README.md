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
AI thread that appears only after the note contains text.

`reading-pdf-zoom.test.js` covers the one-time migration from the legacy 50%
initial PDF scale to Fit while preserving deliberate per-paper zoom choices.

Run with Node 18+ and Playwright's bundled Chromium:

```sh
npm install playwright
node tests/reading-highlights.test.js
node tests/reading-ai-providers.test.js
node tests/reading-selection-note-ai.test.js
node tests/reading-pdf-zoom.test.js
```

Exit code 0 means every check passed. If your Chromium lives in a nonstandard
place, set `CHROME_PATH` when running the AI provider test or pass it via
`chromium.launch({ executablePath: ... })` in the highlight test.
