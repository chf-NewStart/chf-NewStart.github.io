# Phloem status and handoff

The one place to see where Phloem stands and what's next. Every session that changes
Phloem (by hand or by a scheduled task) updates this file in the same push. Newest first
under **Log**. Keep it short; link to commits and files instead of copying them.

## Now (2026-10-13)

- **Web:** houfu72.com/reading.html serves **v211**: DeepSeek removed, AI data note, accessibility fixes, the
  Workspace rail tucked under sheets, and (v210) no re-merge of the sync's own upload after a stroke.
- **Promo kit (drafts only):** `output/phloem-school-promo-2026-10/` (local): SCHOOL-FIT, pitches, channel texts,
  social posts, flyer (HTML and PDF). Gmail drafts in houfuchen0702@gmail.com: ChemE comms, Daily Bulletin, Media
  Relations (send later). Nothing has been sent.
- **Sites and CV (2026-10-13):** houfu72.com and lifegameproject.com list Game Life first, then Qi, Plank Constant,
  Manilha (coming soon); the Phloem name story is on both. The CV has one "Shipped Software" line. Afternoon: the
  homepage hero has a "See my apps" button (app icons fan out, ring in their colours) to lifegameproject.com; the app
  tiles glow in their icons' colours; the Phloem card keeps the reading-guide loop (Houfu's call) and no longer
  mentions DeepSeek. lifegameproject.com's Phloem card plays the two new iPad recordings; Glyph Run's featured clip
  and the Grow a Tomato / Tomatoswipe / Sudoku thumbnails were re-shot from the live games.
- **App Store:** Phloem **iOS 1.2.0 (39) live**. **iOS 1.2.1 (40) submitted 2026-10-13 07:25, Waiting for
  Review**, manual release (Houfu presses Release). Houfu tested build 40 on his iPad ("works well"), and the
  freeze is gone. New listing media cut from his iPad recordings: two **silent** captioned previews (landscape
  Ask AI / Workspace / export; portrait leaf→fruit, paper→brain) and screenshots 4–5 (Ask about any passage,
  Export one PDF). Files are in `output/phloem-app-preview-1.2.1/`. The review notes carry Houfu's Anthropic test key,
  which **he should rotate after review**. The macOS 1.0 draft is untouched. EU trader status is still unset.
- **Narrated promo films** (Jamie Premium voice, "not an app feature" credit): `output/phloem-demo-2026-10-13/`
  (61 s at 1920×1080 and 1080×1920, 33 s social cut). Never use them as App Store previews.
- **Other apps (2026-10-13):** Game Life iOS 1.0 live (since 10-12; hard to find yet: see
  `~/Developer/GameLife/store/DISCOVERY.md`, rating prompt committed for 1.0.1); Qi: Go & Gomoku iOS 1.0 live;
  **Manilha 1.0 (6) resubmitted, Waiting for Review** (2.3.6 fix: "guess", 4+, no "Apuestas"/叫牌; lifegameproject.com
  now says "guess" too). **Plank Pilot is renamed Plank Constant** (Planck's constant pun; bundle ID unchanged).
  Build 26 (new pillow-vs-frying-pan icon, new name, duel copy for the kits) is attached to 1.0 with 5 iPhone + 5 iPad
  screenshots, uploaded through Claude in Chrome. **Not submitted:** Houfu must make the Regulated Medical Device
  declaration (App Information; "not a medical device") and press Add for Review → Submit.
- **Local checkout warning:** `~/Desktop/houfu0702.github.io` `main` has diverged from
  `origin/main` (rewritten history) and holds Houfu's uncommitted work. Work in a worktree
  from `origin/main`; do not reset or stash his checkout.

## Scheduled

Nothing scheduled. **`phloem-appstore-update-school-promo-demo`** ran on 2026-10-13 (00:55–03:00) and
finished every part. iOS 1.2.1 submission was deliberately left for Houfu (see Now and Open questions).
Its prompt and attachments stay in `~/.claude/scheduled-tasks/phloem-appstore-update-school-promo-demo/`.
Outputs (local, untracked, in the main checkout's `output/`):
- `phloem-school-promo-2026-10/`: SCHOOL-FIT, pitches, channels, social, flyer
- `phloem-ios-1.2.1-verification/`
- `phloem-demo-2026-10-13/`: 43 s demo at 1920×1080 and 1080×1920, posters, description
- `site-update-2026-10-13/`: before/after screenshots

## How to work on it

- **Where things live:** the reader is `reading.html`, `reading.js` (app, storage, sync,
  adapters), `reading-ink.js` (PDF ink and the `PhloemInk.pathData` smoothing),
  `reading-workspace*.js/.css` (Workspace state, viewport, view), `reading-stickies.js`,
  `reading-sw.js` (offline shell). iPad app: `apps/ipad` (Capacitor). Its bundler
  `apps/ipad/scripts/build-web.mjs` has an **explicit file allowlist (`readerFiles`)**, so
  any new reader file must be added there, along with `apps/ipad/tests/bundle.test.mjs`.
- **Ship the web reader:** bump `phloem-shell-vNNN` in `reading-sw.js` and every `?v=NNN` in
  `reading.html` together, push to `main` (GitHub Pages deploys in about 1 minute), and check
  with `curl -s https://houfu72.com/reading-sw.js | grep phloem-shell`. Fetch and rebase
  first, because other sessions push to `main` too.
- **Tests:** `node tests/<name>.test.js`, one file at a time (Playwright from the main
  checkout's `node_modules`; symlink it into a worktree). Most relevant to Phloem:
  `tests/*workspace*`, `tests/*ink*`, `tests/*ai*`, `tests/reading-app-update.test.js`; set
  `PHLOEM_BROWSER=webkit` for iPad's engine. Some files extract functions from `reading.js`
  by name, so state a function needs must live inside it. iPad: `cd apps/ipad && npm ci &&
  npm test && npm run ios:sync`; the user skill `ship-ios-app` covers archive, upload and
  App Store Connect (sign-in happens in the built-in browser pane).
- **Performance lessons (2026-10-12):** the Workspace adapter's `context()` used to re-validate
  the whole saved Workspace (`readingWorkspaceUnavailable` → `PhloemWorkspaceState.normalize`)
  on every call; it is now cached per saved object. Keep per-pen-sample code free of
  `context()` and whole-library work. Measure with a seeded large library (thousands of
  strokes) and count calls, not just wall time on a fast Mac.
- **App Store IDs:** Phloem `id6813510395`, Game Life `id6821541367`, Qi `id6821608519`.
- **Other places to update:** lifegameproject.com is `~/Desktop/untitled folder 3/lifegame`.
  The CV source is `~/Desktop/Career/Houfu_Chen_CV_2026/Source/Houfu_Chen_Resume_2026.md`
  (rebuild with `build_resume_ooxml.py`, copy the PDF to `resumes/` here). Homepage rules:
  bilingual `data-en`/`data-zh` on every visible string, each project appears once, no
  build step.
- **Testers:** Jieun (Android tablet, Chrome, web reader) and Houfu's iPad (App Store app or
  Home Screen web app). Jieun is credited on lifegameproject.com ("Made with friends",
  `ffd3580`); credit her too wherever Phloem lists testers or thanks people. Their videos and screenshots are in the scheduled task's folder.

## Decisions to keep

- **Name story (Houfu's words):** in his project, phloem carries sugar from carbon sources
  (leaves, roots) to sinks (fruits). "Phloem" also reads as "flow them". A paper reader
  carries knowledge from paper to brain, the way phloem carries sugar from leaf to fruit,
  and it should help readers into a flow state. Keep his original reason too: his professor
  told him to stop letting AI summarize papers and actually read them.
- **DeepSeek leaves Phloem only** (not the journal, tomato facts, or workers).
  Source: [Waterloo IST AI tools](https://uwaterloo.ca/information-systems-technology/about/policies-standards-and-guidelines/artificial-intelligence-ai/responsible-use-ai-tools-university-data/ai-tools),
  [DeepSeek advisory](https://uwaterloo.ca/information-systems-technology/news/deepseek-app-security-and-privacy-weaknesses).
- **Releases:** App Store updates are submitted with manual release. Promo messages are
  drafts that Houfu sends himself.
- **Demo document:** Knoblauch et al., eLife 2016;5:e15341, CC BY. Never use the
  "Feedback Systems" book in demos (copyrighted; it's a local test fixture only).
- **Cost:** free tools only; flag any cost first.

## Open questions for Houfu

- The **shared review pass** (`cloud-review-pass/` worker) still calls DeepSeek on the server. Ordinary
  readers can't pick it. Switch the worker's model, or retire the pass?

- Rotate the Anthropic key used in the 1.2.1 review notes once 1.2.1 is reviewed.
- Was the iPad freeze in the App Store app or the Home Screen web app? Is iCloud or Drive
  sync on there? (v210 removes the main suspect, the sync after each save; please retry
  with the big book.)
- EU trader status in App Store Connect.
- Manilha was rejected: read App Review's message and decide on a fix.
- The FAW-Volkswagen dates conflict between the site and the CV.

## Log

- **2026-10-13 late morning:** promo drafts say "PhD student" (not candidate) and warn that the Gmail connector wraps
  links in google.com redirects. LinkedIn kit (headline, About, three posts, banner) and the UofT featured-alum capture
  are in `~/Desktop/Career/Houfu_Chen_CV_2026/`. Sites and other apps: see Now.

- **2026-10-13 morning:** Houfu confirmed build 40 on his iPad and submitted 1.2.1. App Store media were cut from
  his screen recordings; narration was kept off the store, so it can't be mistaken for read-aloud. Manilha's
  listing was cleaned in four languages, then resubmitted with a reply to App Review.

- **2026-10-13 demo:** 43 s name-story demo (leaf→fruit, then paper→brain) of the web reader with the eLife
  Münch paper (CC BY, credited), landscape and vertical, in `output/phloem-demo-2026-10-13/`.
- **2026-10-13 iOS 1.2.1 (40)** uploaded (not submitted). Reader suite: Chromium 84/84, WebKit 83/84; the one
  failure, `reading-workspace-lasso-resize` (WebKit), also fails on v200 and v210, so it predates this release.
  The simulator tool can't tap in scheduled sessions, so feature checks ran in Playwright WebKit (see VERIFICATION.md).
- **2026-10-13 sites/CV:** homepage strip and badges, Phloem card (new features, name story), "BASc
  Nanotechnology Engineering". lifegameproject.com reorder (`site-order-1013`). CV line on shipped apps.

- **2026-10-13 v211:** school fit (Waterloo). DeepSeek is no longer an AI provider: keys are deleted (web storage;
  iPad Keychain natively, via the known-minus-supported purge), a reader who had chosen it falls back
  to the private mode, and a one-time notice says so (`readingRoom.deepseekRemoved.v1`). An AI data note
  went into settings and the iPad consent. axe-core (WCAG 2.1 A/AA) now reports 0 violations on the
  library, settings, reader and Workspace (light and dark); the fixes were selectors that put
  `aria-pressed` on `<html>`/`<body>`/`#pdfFrame`/`#paneSpotlight` (now `button[...]`), a region role
  on the Workspace scroller, and the `--muted`/`--accent-button` contrast tokens. In the split, the Zen
  rail tucks under sheets (`reading-workspace.css`; test
  `tests/reading-workspace-divider-under-sheets.test.js`). v210 follow-up: the sync's between-step
  yields were dropped (they reordered snapshots against imports; `reading-cloud-auto-sync` caught it).

- **2026-10-13 v210:** iPad "freeze after a stroke" with the 573-page book. Each stroke's save
  started a quiet sync that downloaded, parsed and merged back the library this device had
  just uploaded, and read every original PDF's bytes (33 MB for the book) from IndexedDB.
  Seeded WebKit repro (3 MB library, 2000 Workspace strokes, book with ink, fake iPad
  iCloud): longest main-thread block after a lift 165 ms in v200 (the build inside 1.2.0),
  189 ms in v209, 83 ms after the fix. A sync now skips its own last upload (iCloud change tag,
  Drive file version), uploads only on change, and checks originals without reading them. Test: `tests/reading-sync-own-copy.test.js` (iCloud + Drive).
  Not new in v203–v209; the 1.2.0 app has it too.

- **2026-10-12 v209** (`ccbab5e6`): the Workspace ink kept falling behind the pen on Android.
  Every pen sample re-validated the whole saved Workspace twice, and paper growth re-smoothed
  every stroke. The fix: a bounds check before `context()`, a per-object validation cache,
  and outlines in sheet units. Regression test in `tests/reading-workspace-ink-cache.test.js`.
- **2026-10-12 v203–v208** (other sessions): fast Workspace ink on full sheets, white ink in
  the dark theme, export annotated PDF, the WebKit link-tap fix, the portrait Workspace dock,
  sticky notes on PDF pages.
