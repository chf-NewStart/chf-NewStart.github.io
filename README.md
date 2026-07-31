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
- `bio-bg.js` / `cell-bg.js` — the two backdrop engines (see below).
- `journal.html`, `reading.html`, `moneymanage/`, `msg/`, `personality/`, `game/` —
  standalone tools and games, each self-contained.
- `sprites/` — pixel art for the tomato rain (goose, raccoon, glider, block, blinker).
- `vendor/` — vendored libraries for the reading room (pdf.js, Tesseract language data).
- `resumes/`, `fonts/`, `favicon_io/` — assets. The remaining image folders
  (`emo/`, `food/`, `matrix/`, `money/`, `robo1/`, `swim/`, …) hold photos used by the
  page; `rl/` is the Python training code behind the Train RL Hunter game.
- `robots.txt` / `sitemap.xml` — indexing; resumes and the personality PDFs are
  excluded from crawling.

## The two backdrop engines

The animated background behind `index.html` has two implementations, and a visitor
picks one with the microscope button in the nav:

- **`bio-bg.js` ("flow")** — a WebGL2 single-pass fragment shader on `#bioBg`:
  procedural leaf tissue (Voronoi cells, chloroplast granules) advected by
  curl-noise flow. Scrolling stirs it: an energy envelope derived from scroll
  velocity speeds up the streaming and lifts the exposure.
- **`cell-bg.js` ("tissue")** — a Canvas2D dark-field micrograph on `#tissueBg`:
  a precomputed Voronoi cell field with sprite-stamped chloroplasts creeping along
  the cell walls, redrawn at a capped frame rate, with a cross-fade when the field
  reseeds.

They own **separate canvases** because one canvas element cannot hand out both a
`webgl2` and a `2d` context. A manager in `site.js` chooses the engine, persists the
choice in `localStorage` (`backdropMode`), and lazy-loads `cell-bg.js` only if it is
ever selected. Both engines respect `prefers-reduced-motion` (they render one static
frame) and pause when the tab is hidden.

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

Labels that depend on state (the backdrop/rain buttons) are rebuilt in JS instead of
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
- `reading.html` — bilingual reading room: paste text or a screenshot; OCR runs
  locally in the browser (Tesseract), nothing is uploaded.
- `moneymanage/` — local-first personal finance tracker (OFX/QFX import, learned
  categorisation rules, optional AI key — all stored locally).
- `msg/` — terminal-style message box; the one page that sends data out (Formspree,
  with a mailto fallback).
- `personality/` — attachment-style quiz with scored results.
- `game/` — the greenhouse digital-twin demo (two coupled genome-scale metabolic
  models solved live in the browser via GLPK/WASM) and its SBML models. The
  browser games (Conway's Life, gomoku, escape-grid, the RL hunter) now live at
  lifegameproject.com; the pages left here are thin redirects to that arcade so
  old links don't 404.

## Local development

No tooling needed — from the repo root:

```bash
python3 -m http.server
```

then open `http://localhost:8000/`. Quick sanity checks before pushing:
`node --check` on each of `site.js`, `bio-bg.js` and `cell-bg.js`, equal counts of
`data-en="` and `data-zh="` in `index.html`, and the EN → 中文 → EN round-trip above.
