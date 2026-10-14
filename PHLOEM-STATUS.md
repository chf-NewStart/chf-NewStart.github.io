# Phloem status and handoff

The one place to see where Phloem stands and what's next. Every session that changes
Phloem (by hand or by a scheduled task) updates this file in the same push. Newest first
under **Log**. Keep it short; link to commits and files instead of copying them.

## Now (2026-10-14)

- **Reading lists (v216, Houfu asked for them for the next build):** a **Reading list** page (nav) and a **List** tab
  in the reader's notebook. Houfu's rules: it is a *reading* list, never a to-do list (no tasks, no "Email Nasser");
  reorder by **drag** (handle; arrow keys on the handle), no up/down buttons; tapping an item **opens the paper in
  Phloem** (library copy, else a free copy: arXiv PDF or Europe PMC open-access full text as a text paper, else a
  "Choose the PDF" / publisher-page fallback); a clear **＋ Add a paper** row (search Crossref, library, or as written).
  Import BibTeX/RIS/Markdown/plain lists; export Markdown/BibTeX; "＋ Reading list" on library cards; X from a paper
  opened from the list returns to the list. Lists live in the library file (`readingLists`), merge record by record,
  and sync over iCloud, Drive and GitHub. Files: `reading-lists.js` (data), `reading-lists-view.js` (UI). Next:
  iPad **1.2.2 (41)** once Houfu is happy with the design (the bundler allowlist already has both files).
- **Citation hold (v218, Jieun's Android report):** her paper is arXiv 2405.07097 (IEEE MLSP 2024), whose 91
  citations *are* links. In emulated Android Chrome a real long-press opened the card in scroll, page and book layouts,
  but the card showed the end of the previous reference (LaTeX's XYZ destination sits above the entry; v218 reads from
  the destination down). If the system selects a link's words instead (links set aside while the marker is on with a
  fine pointer, or any Android variant), the selection now opens that link's card. Not yet confirmed on her tablet.
- **Unlinked citations (v216, Jieun's Android report):** a finger/pen long-press that selects "[5]" or an author-year
  citation in a PDF without link annotations now shows the reference card from the paper's reference list instead of
  the highlight prompt. Mouse selections and marker mode still highlight. Test: `tests/reading-unlinked-citations.test.js`.
- **Listen (v221, Houfu asked for a Jamie voice-over):** ••• → **Listen** reads the paper aloud with a voice already
  on the device (Web Speech; Jamie (Premium) is chosen first when installed, then Premium/Enhanced voices; Android uses
  Google voices; nothing leaves the device). `reading-voice.js` prepares the text from the reader's labelled paragraphs:
  skips equations (layout `eq`, symbol-heavy lines, Wiley/Elsevier ¼ð þ glyphs), captions, tables and header rows,
  figure labels, citations ([12], (Smith et al., 2020), Fig. pointers), front matter (authors, affiliations, journal and
  copyright lines, arXiv stamps, e-mail/funding footnotes), back matter (acknowledgements…), and stops at References
  (resumes at a real Appendix, not "Appendix S7."). Player bar: back / play-pause / next sentence, speed 0.8–1.5×, voice
  picker (remembered), current sentence shown; PDFs turn pages, text papers mark the paragraph. Checked against arXiv
  2405.07097, Colombie 2015 and Osorio 2014 transcripts. Not yet heard on Houfu's iPad: whether WKWebView/Safari lists
  Jamie (Premium) after it is downloaded in Settings → Accessibility → Spoken Content, and whether speech continues
  with the screen locked (iOS pauses web speech in the background).
- **What does this mean? + Copy (v221):** two new selection-card buttons. "What does this mean?" explains the selected
  passage in plain words from the surrounding excerpt, on the Define card, labelled "AI explanation · verify"; Define
  on a sentence goes there automatically when AI is set up. Hidden in the iPad app where cloud AI is off (CHN).
- **Install app (v221):** on an iPad the dialog leads with "Phloem for iPad" on the App Store (iTunes lookup shows the
  store version and date); iPhone gets the Home Screen steps (the app is iPad-only); other browsers the web install plus
  a "Have an iPad?" link. Every case says whether the web version is the newest (compares `/reading-sw.js`) and offers
  "Reload to update". The App Store iPad app still has no "update available" notice: it needs its own version in the
  bundle (do this with 1.2.2).
- **Define (v220, Houfu: "angiosperm" gave something strange from Wikipedia):** a one-word selection is a dictionary
  question: Wiktionary first (part of speech + sense, "plural of" followed once), then the Wikipedia article the word
  names (redirects followed, disambiguation skipped), then the search, ranked by Wikipedia's own order for one word.
  Abbreviations/symbols skip the dictionary. Saved answers are still kept (v213); the card has **"Not this? Look it up
  again"**, which replaces a saved answer (offline, the saved one stays). Wikipedia/Wiktionary are blocked in mainland
  China, so Define there needs AI or a VPN.
- **Web:** houfu72.com/reading.html serves **v221** (Listen, Explain/Copy, Install, above); v220 (Define); v219: the list's "Look for" is now **My question**, blank until Houfu
  writes it (imports leave a list's own notes out unless a checkbox is ticked), the takeaway asks "from memory: what
  did they find, and what surprised you?", and **Peek** shows the abstract (Europe PMC, else Crossref; plain text)
  before opening. Houfu's reasoning: read first and decide yourself; his professor ruled out AI drafting, so Phloem
  never writes questions, takeaways or proposal sentences. v218: citation hold (above); v217 (v216 above; v217: two copies of one paper no longer block the
  automatic link, the most recently read copy wins); v213: saved Define answers are kept instead of refetched (from PR #72);
  v212: Escape after a tap in the Workspace no longer closes the paper (iPad keyboards); v211: DeepSeek removed, AI data note, accessibility fixes, the Workspace rail tucked under
  sheets; v210: no re-merge of the sync's own upload after a stroke. The iPad app (1.2.1, in review) bundles v211.
- **Promo kit (drafts only):** `output/phloem-school-promo-2026-10/` (local): SCHOOL-FIT, pitches, channel texts,
  social posts, flyer (HTML and PDF). Gmail drafts in houfuchen0702@gmail.com: ChemE comms, Daily Bulletin, Media
  Relations (send later). Nothing has been sent.
- **Sites and CV (2026-10-13):** houfu72.com and lifegameproject.com list Game Life first, then Qi, Plank Constant,
  Manilha (coming soon); the Phloem name story is on both. The CV has one "Shipped Software" line. Afternoon: the
  homepage hero has a "See my apps" button (app icons fan out, ring in their colours) to lifegameproject.com; the app
  tiles glow in their icons' colours; the Phloem card keeps the reading-guide loop (Houfu's call) and no longer
  mentions DeepSeek. lifegameproject.com's Phloem card plays the two new iPad recordings; Glyph Run's featured clip
  and the Grow a Tomato / Tomatoswipe / Sudoku thumbnails were re-shot from the live games.
- **App Store:** Phloem **iOS 1.2.1 (40) live since 2026-10-13 14:19 EDT** (released by Houfu); PR #76 merged,
  so `apps/ipad` on main is 1.2.1 (40). **1.2.2 (41) uploaded to TestFlight 2026-10-14 ~18:15 EDT** (not submitted)
  from branch `ipad-release-1.2.2-41`, PR #77 (merge after release): reader v221 plus an App Store update notice
  (bundle-manifest.json carries the app version; Desk settings shows "Version 1.2.2 (41) · the newest version"; a newer
  store version gets a dismissible Update banner). Houfu tests on his iPad, then decides on submitting (draft text in
  `output/phloem-ios-1.2.1-verification/STORE-TEXT-1.2.2-DRAFT.md`), no rush. Houfu tested build 40 on his iPad ("works well"), and the
  freeze is gone. New listing media cut from his iPad recordings: two **silent** captioned previews (landscape
  Ask AI / Workspace / export; portrait leaf→fruit, paper→brain) and screenshots 4–5 (Ask about any passage,
  Export one PDF). Files are in `output/phloem-app-preview-1.2.1/`. The review notes carry Houfu's Anthropic test key:
  **review is done, so rotate it now**. The macOS 1.0 draft is untouched. **EU: non-trader declared 2026-10-13**, so
  every app is in the EU storefronts. Featuring nominations went in for all five apps (Phloem: 1.2.1 App Enhancements).
- **Narrated promo films** (Jamie Premium voice, "not an app feature" credit): `output/phloem-demo-2026-10-13/`
  (61 s at 1920×1080 and 1080×1920, 33 s social cut). Never use them as App Store previews.
- **Other apps (2026-10-13):** Game Life iOS 1.0 live (since 10-12; hard to find yet: see
  `~/Developer/GameLife/store/DISCOVERY.md`, rating prompt committed for 1.0.1); Qi: Go & Gomoku iOS 1.0 live;
  **Manilha 1.0 (6) resubmitted, Waiting for Review** (2.3.6 fix: "guess", 4+, no "Apuestas"/叫牌; lifegameproject.com
  now says "guess" too). **Plank Pilot is renamed Plank Constant** (Planck's constant pun; bundle ID unchanged).
  Build 26 (new pillow-vs-frying-pan icon, new name, duel copy for the kits) is attached to 1.0 with 5 iPhone + 5 iPad
  screenshots, uploaded through Claude in Chrome. **Submitted by Houfu 10-13, Waiting for Review.** Game Life **1.0.1**
  (build 10: rating prompt; new subtitle "Conway's Life, puzzles & music", sharper keywords, 元胞自动机, a new
  Spanish (Mexico) listing for US search) was **submitted 10-13 11:01, Waiting for Review**, automatic release.
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

- **Old open PRs:** #29 (iPad prototype) and #28 (Book guide fix) are already on main in other forms, and #30
  (calm homepage) was superseded by the current homepage. Close them? #72's Define fix is now on main (v213); its other
  half, the Zen layout control as a quiet rail circle with a first-visit hint (v201), never landed and would need
  rebasing onto v213.

- The **shared review pass** (`cloud-review-pass/` worker) still calls DeepSeek on the server. Ordinary
  readers can't pick it. Switch the worker's model, or retire the pass?

- Rotate the Anthropic key used in the 1.2.1 review notes: 1.2.1 is live, so it can go now.
- Was the iPad freeze in the App Store app or the Home Screen web app? Is iCloud or Drive
  sync on there? (v210 removes the main suspect, the sync after each save; please retry
  with the big book.)
- Manilha was rejected: read App Review's message and decide on a fix.

## Log

- **2026-10-14 1.2.2 (41):** archived and uploaded (Release, automatic signing); archive verified to carry reader v221
  and `app: 1.2.2 (41)`. `apps/ipad` tests 21/21. `cap sync` through a symlinked node_modules rewrote
  `CapApp-SPM/Package.swift` with an absolute path; restored before archiving (the relative path resolves through
  the link). Waiting on Houfu's TestFlight check: Listen voices (Jamie), lock screen, reading lists, Desk settings version.

- **2026-10-14 v221:** Listen (with "start from": a selection, a tapped paragraph, or the "Read from…" section menu;
  running heads and page counters skipped), What does this mean?, Copy, the selection card's six action tiles ("Save
  excerpt" is now "Save to Clips"), Install dialog. Real-engine check in the pane (silent): Houfu's Mac lists Jamie
  (Premium) and Listen picks it, sentences advance on real end events, PDFs turn pages, a tap jumps. Suite: Chromium
  135/135, WebKit 135/136 (`reading-zen-compact-browser` passed twice on rerun: a render-timing flake), then the 76
  affected Chromium files again on the final code; iPad bundle 19/19 (the Install dialog uses the bundled 180px icon).
  New tests: `reading-voice` (8), `reading-voice-browser`, `reading-install-dialog`. Houfu asked about using REA
  (github.com/morluto/rea) on NaturalReader: advised against (terms of service; black-box comparison instead).

- **2026-10-14 v220:** Define for one word (Wiktionary → exact article → search). `reading-define-lookup` 13/13;
  `reading-marker-actions` and `reading-selection-note-ai` pass on Chromium and WebKit.
- **2026-10-14 answers for Houfu (no code):** AI keys move with Settings → "Copy device setup link" (plain, not
  encrypted; the iPad app cannot take it). China: the iPad app hides Drive and online AI in the CHN storefront and uses
  native CloudKit (should work with China Apple IDs; untested); the website has no iCloud (hidden since 10-06) and
  Drive is blocked there.

- **2026-10-14 v219:** My question / Peek / import without notes (see Web). `reading-lists-browser` passes on
  Chromium and WebKit (Peek strips markup; a script in an abstract never runs).

- **2026-10-14 v218:** citation cards start at the cited entry (XYZ destinations read downward; `cite.` names count as
  references); a touch/pen selection over a link opens its card; plain-text "[6]" skips a "6. References" heading.
  `reading-unlinked-citations` (7 checks) and the 28 link/selection/touch test files pass on Chromium and WebKit.

- **2026-10-14 v217:** first real import, Houfu's `source_sink_feedback_reading_list.md` (7 papers) into his library
  from the browser pane: 5 linked to his PDFs on their own. Chiou & Bush 1998 has two copies in his library (now links
  to the recent one); Matsuda 2011's PDF is titled "Scientia Horticulturae / paper.pdf", so it needs the ⋯ picker.

- **2026-10-14 v216:** reading lists (see Now) and unlinked-citation cards. Tests: `reading-lists-state` (19),
  `reading-lists-browser` and `reading-unlinked-citations` on Chromium and WebKit; the whole suite passes on both
  (133/133; `reading-notebooklm-export` now expects the sixth cover action, `reading-zen-lifecycle` the list return);
  iPad bundle tests 19/19. Crossref (search, DOI details),
  arXiv and Europe PMC are free, keyless, and CORS-open; OpenAlex now meters per request, so it is not used.

- **2026-10-13 afternoon:** Phloem iOS 1.2.1 (40) is live (Houfu released it); PR #76 merged. Elsewhere today: EU
  non-trader status set; featuring nominations for every app; Manilha online rooms moved from Firebase to the new
  lifegame relay (Cloudflare Worker, deployed from houfu-sam-lifegame with its own token, locked to
  lifegameproject.com and houfu72.com), tested live from the site and the iOS app; Glyph Run b66–b67 (etymology
  checked against Houfu's references, pause on focus loss, form notes for every glyph).
- **2026-10-13 midday v212:** Workspace writing check. All 49 Workspace/ink tests on WebKit and Chromium; the only
  failure was `reading-workspace-lasso-resize` on WebKit (since v200): with nothing focused after a tap (Safari),
  Escape went to the reader and Zen closed the paper. Keys on <body> now belong to the Workspace when it was touched
  last (`reading-workspace-escape-after-tap`). Pen strokes cancelled by the system (pointercancel) are still dropped,
  as on the PDF; deliberate. Both sites pass axe WCAG 2.1 A/AA (contrast fixes).

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
