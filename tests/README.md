# Phloem reader tests

Headless regression tests for `reading.html` (the Phloem reader). They serve the
repo over a local HTTP port, seed `localStorage` with a small paper, and drive a
real Chromium through the highlight workflows: marker strokes, click-to-erase,
the highlight card (recolor, per-highlight notes, remove), and undo/redo.

`reading-ai-providers.test.js` covers the AI provider router: keyless on-device
Gemini, migration of an existing DeepSeek key, current model selection, saved
thread context, the provider settings UI, and AI-key transfer through a private
device setup link even when GitHub sync is not configured.

Run with Node 18+ and Playwright's bundled Chromium:

```sh
npm install playwright
node tests/reading-highlights.test.js
node tests/reading-ai-providers.test.js
```

Exit code 0 means every check passed. If your Chromium lives in a nonstandard
place, set `CHROME_PATH` when running the AI provider test or pass it via
`chromium.launch({ executablePath: ... })` in the highlight test.
