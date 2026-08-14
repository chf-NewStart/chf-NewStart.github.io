# houfu72.com

Personal site of Houfu Chen — PhD researcher at the University of Waterloo working on
digital twins of greenhouse tomato metabolism. A bilingual (English / 中文) portfolio
page plus a collection of standalone browser tools and games that live on the same
domain.

## Stack

Hand-written HTML, CSS and JavaScript. No framework, no bundler, no build step.
GitHub Pages serves the `main` branch directly (`CNAME` points `houfu72.com` here,
`.nojekyll` disables Jekyll), so **pushing to `main` is deploying**. There is no CI
gate — check your change locally before you push.

## Layout

- `index.html` — the portfolio page itself; `styles.css` and `site.js` belong to it.
- `bio-bg.js` — the animated backdrop (see below).
- `journal.html`, `reading.html` (+ `reading-sw.js`, its offline service worker),
  `moneymanage/`, `msg/`, `personality/`, `pose-loop/`, `game/` —
  standalone tools and games, each self-contained.
- `sprites/` — pixel art for the tomato rain (goose, raccoon, glider, block, blinker).
- `vendor/` — vendored libraries for the reading room (pdf.js, Tesseract language data).
- `resumes/`, `fonts/`, `favicon_io/` — assets. The remaining image folders
  (`emo/`, `food/`, `matrix/`, `money/`, `robo1/`, `swim/`, …) hold photos used by the
  page; `rl/` is the Python training code behind the Train RL Hunter game.
- `robots.txt` / `sitemap.xml` — indexing; resumes and the personality PDFs are
  excluded from crawling.

## The backdrop engine

The animated background behind `index.html` is `bio-bg.js`, a WebGL2 single-pass
fragment shader on `#bioBg`: procedural leaf tissue (Voronoi cells, chloroplast
granules) advected by curl-noise flow. Scrolling stirs it — an energy envelope
derived from scroll velocity speeds up the streaming and lifts the exposure.

It respects `prefers-reduced-motion` (rendering one static frame) and pauses when
the tab is hidden, so a backgrounded tab costs nothing.

## The bilingual system — read this before editing `index.html`

Page copy is translated by `site.js` swapping `data-en` / `data-zh` attribute pairs
on the same element. The rules that keep it working:

- Every element with `data-en` needs a matching `data-zh` (and vice versa). Keep the
  counts equal.
- An element carrying the pair must have **no child elements**: the toggle writes
  `textContent`, so any markup inside is destroyed on the first switch. Split the
  markup out or move the pair inward.
- The element's visible text must be **byte-identical** to its `data-en` value,
  otherwise switching back to English stops round-tripping cleanly.
- A good check after editing: toggle EN → 中文 → EN and confirm
  `document.body.textContent` is unchanged.

Labels that depend on state (the tomato-rain button) are rebuilt in JS instead of
using attribute pairs.

## The tomato rain

The tomato button in the nav toggles a DOM physics toy scoped to the hero section:
Braille-art tomatoes and pixel sprites fall, collide, pile up and go to sleep, with
an ambient drizzle while it is on. The sprite cast in `sprites/` is deliberate: a
goose for Waterloo, a raccoon for Toronto, and a Game of Life glider, block and
blinker for the arcade. It runs its own `requestAnimationFrame` loop alongside the
backdrop's, so keep per-frame work here cheap.

## Standalone tools

Each page is self-contained and keeps its data in the visitor's own browser
(`localStorage`) unless noted:

- `journal.html` — one page per day. Optional sync pushes an **AES-GCM encrypted
  blob** to a private GitHub repo the visitor owns (fine-grained token; the repo
  only ever sees ciphertext).
- `reading.html` — **Carrel** ("Breathe, Focus, Read"), a local-first paper desk
  (named for a library study carrel) for slow, focused reading.
  Single hand-written file, no framework; PDFs render with vendored pdf.js in one
  continuous scroll (lazy rendering, canvas memory capped, far pages freed so a
  675-page textbook stays light on a phone).

  **Reading.** Pinch to zoom with a live preview re-rendered crisply under your
  fingers; double-tap between Fit and 160%; one-finger panning locks to its
  dominant axis so zoomed scrolling never drifts sideways (with its own momentum
  fling); tap the page counter to jump anywhere; ☰ Contents opens the PDF's own
  chapter outline; zoom, page, scroll position and the open paper itself all
  survive a refresh.

  **Focus.** A reading guide band (yellow/green/blue, full-page or column width,
  S/M/L height) that tints or — in Line focus — masks everything except the lines
  under it, draggable by its ≡ handle and anchored to the pane so layout changes
  never move it off your line; ⛶ Zen mode strips every bar and panel (F to
  toggle); auto-scroll drifts the page at a tunable 0.5–10 px/s crawl that pauses
  when you touch the paper; cream paper warms the page in light mode and removes
  the blue cast in dark mode.

  **Marks.** A four-color marker with persistent highlights, page and paragraph
  notes, a whole-paper find bar (`/`), selection lookups (Wikipedia
  definition + image, cached per paper), and a recall check that hides the paper
  while you explain it from memory.

  **Ask AI.** Three one-tap contexts — current page, your selection, or whatever
  sits under the guide band — send exact text-layer text (never OCR of what the
  PDF already knows) plus a cropped snapshot of the spot for the record; question
  chips (What is… / Why… / How…) and keyboard-free Summarize / Explain simply;
  answers come back as short bullets. Screenshot OCR runs on-device via vendored
  Tesseract; only text is ever sent, and the DeepSeek key never leaves the device
  except inside the hand-carried device link.

  **Review.** Highlights, notes and saved questions ripen into spaced self-test
  cards (1 → 3 → 7 → 14 → 30 → 60 days, honest self-grading), each able to jump
  back to its spot in the paper.

  **Storage & sync.** Papers and their extracted text live in IndexedDB on each
  device; a small service worker (`reading-sw.js`) caches the reader shell so
  already-imported papers open fully offline. Carrel is an installable PWA
  (`carrel.webmanifest`, its own icon): browsers that fire an install prompt get
  a ⭳ button in the masthead and in settings, iOS gets Add-to-Home-Screen
  instructions, and the installed window opens portfolio links in a real
  browser tab. Optional AES-GCM encrypted sync to
  a private GitHub repo (fine-grained token, ciphertext only, files over the
  contents-API 1 MB limit fetched raw), a `papers/` folder picker, and a device
  link that hand-carries token, passphrase and AI key to a new device.

  On phones the paper gets the whole screen: a thumb-height bottom bar, the
  notebook as a bottom sheet, ⋯ revealing the full toolbar, and the layout
  tracking the visual viewport so the on-screen keyboard never covers the input.
- `moneymanage/` — local-first personal finance tracker (OFX/QFX import, learned
  categorisation rules, optional AI key — all stored locally).
- `msg/` — terminal-style message box; the one page that sends data out (Formspree,
  with a mailto fallback).
- `personality/` — attachment-style quiz with scored results.
- `pose-loop/` — Unclench, a local camera-guided neck-and-shoulder target game.
  MediaPipe extracts body landmarks in the browser so live shoulder and head dots
  can complete two glowing rounds and a final release with hold progress and burst feedback. The earlier desk and
  full-body temporal Echo Puzzle remains available as a secondary experiment;
  camera frames are not uploaded or stored.
- `game/` — thin redirect stubs. The browser games (Conway's Life, gomoku,
  escape-grid, the RL hunter) now live at lifegameproject.com; the pages left here
  point at that arcade so old links don't 404, and each carries a `canonical` to
  its replacement there. The life/gomoku card art stays here because the arcade
  section of `index.html` loads it — don't clear the folder out.

## Local development

No tooling needed — from the repo root:

```bash
python3 -m http.server
```

then open `http://localhost:8000/`. Quick sanity checks before pushing:
`node --check` on each of `site.js` and `bio-bg.js`, equal counts of `data-en="`
and `data-zh="` in `index.html`, and the EN → 中文 → EN round-trip above.

## License

The code in this repository is released under the [MIT License](LICENSE) — take
Carrel or any of the tools apart, reuse them, learn from them. Personal content
is **not** covered by that license and remains all rights reserved: photos and
images (`emo/`, `food/`, `matrix/`, `money/`, `monet/`, `robo1/`, `swim/`, the
sprite and card art), resume files (`resumes/`), and the handwriting font
(`fonts/houfu-hand.woff2`). The other vendored fonts and libraries (`fonts/`,
`vendor/`) keep their own upstream licenses.
