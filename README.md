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
- `journal.html`, `reading.html`, `moneymanage/`, `msg/`, `personality/`, `pose-loop/`, `game/` —
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
- `reading.html` — Margin, a local-first paper desk: selectable PDF rendering
  in one continuous vertical scroll (pages render lazily and far-away pages are
  freed so long papers stay light on phone memory), a draggable notes panel, a
  reflowed Reader view, and browser read-aloud that omit repeated headers and
  footers; a direct four-color marker with persistent highlights; selection
  lookups with a Wikipedia definition and sourced Wikimedia image, plus an
  explicitly labelled DeepSeek fallback for technical phrases; page and
  paragraph notes; screenshot OCR with optional AI questions; sketch notes; a
  tag-based connection map; and optional AES-GCM encrypted GitHub sync. Papers
  can be removed directly from the library without deleting their original
  `papers/` copy in GitHub.
  Built to be easy to stay inside: an optional reading spotlight — a bulb of
  light around the pointer (or last tap) that dims everything else, including
  the other column of a two-column paper — read-aloud that highlights and
  follows the text being spoken, an `Aa` panel for text size, column width,
  and line spacing, a whole-paper find bar (`/`), a reading progress rail, and
  each paper reopens where you left off. Reader-view paragraphs link back to
  their PDF page, and notes and highlights in the side index jump back to
  their spot. One theme toggle drives the app chrome, the PDF paper, and the
  phone status bar together. On phones the document gets the whole screen: a
  thumb-height bottom bar handles paging, Reader/PDF, and notes, the notebook
  rises as a bottom sheet, the top bar keeps only back + title until ⋯ reveals
  the rest, and compatibility shims cover older iPhone Safari PDF.js gaps.
  PDF files and their rebuildable extracted text live in IndexedDB on each
  device instead of the browser's small note store; oversized older records
  migrate there automatically. A connected private repo can also provide a
  `papers/` folder — including subfolders — to browse and pick them from on Mac
  or phone.
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
