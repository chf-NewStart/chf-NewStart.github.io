# Phloem reader tests

Headless regression tests for `reading.html` (the Phloem reader). They serve the
repo over a local HTTP port, seed `localStorage` with a small paper, and drive a
real Chromium through the highlight workflows: marker strokes, click-to-erase,
the highlight card (recolor, per-highlight notes, remove), and undo/redo.

Run with Node 18+ and Playwright's bundled Chromium:

```sh
npm install playwright
node tests/reading-highlights.test.js
```

Exit code 0 means every check passed. If your Chromium lives in a nonstandard
place, pass it via `chromium.launch({ executablePath: ... })`.
