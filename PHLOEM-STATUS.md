# Phloem status and handoff

The one place to see where Phloem stands and what's next. Every session that changes
Phloem (by hand or by a scheduled task) updates this file in the same push. Newest first
under **Log**. Keep it short; link to commits and files instead of copying them.

## Now (2026-10-21)

- **Two tabs no longer overwrite each other, v241 (web; Houfu: "phloem should also work if i want to put 2 papers
  side by side idk", then "dont do this task if its gonna mess things up").** Each tab saved its whole in-memory library,
  so the tab that saved last quietly undid the other's highlights, notes, strokes or newly added papers. Now **one tab
  saves**: the writer is named by a small mark (`readingRoom.writer.v1`) and tabs talk over a BroadcastChannel
  (`phloem-tabs`). A tab opened while Phloem is in use elsewhere can still be read, but saves nothing, syncs nothing
  (its older copy could otherwise win a cloud merge) and cannot remove papers; a bar says "Phloem is open in another
  tab, so changes here are not saved" with **Use Phloem here** (the other tab saves what is waiting, steps aside, and
  this one reloads). A single tab, a reload, or a tab opened while the writer is in the background or closed takes over
  at once, with no delay or bar; a shown writer renews its mark every 5 s. Every save checks the mark first, so a tab
  waking from sleep never writes over a newer one. Reading-position and sync-merge saves are skipped quietly; edits say
  "Not saved". **Not in the iPad app** (`PHLOEM_NATIVE`: one window; nothing changes, no new build needed). Test: new
  `reading-two-tabs` (20; on v240 the first tab's newer highlight is lost). Full reader suite in Chromium and WebKit: only
  main's known failures (`reading-pdf-ink` 69/72, `reading-split-undo-browser`, `reading-workspace-paper-color`/`-edge`);
  persistence, sync and iPad suites pass in both; `apps/ipad` 22/22. A per-item merge version was also built and
  tested, then set aside as the bigger change (local branch `phloem-two-tabs-merge`, not pushed).
  **Two papers side by side: plan only, not built** (see Open questions).

- **1.2.5 (49) approved, waiting for Release (submitted 2026-10-22 16:11 EDT ; Houfu: "submit Phloem 1.2.5").** iPad + iPhone, reader v240, Waiting for
  Review (submission e7e06bc9), **manual release: press Release after approval**. Houfu edited the App Review notes
  himself (now 1.2.5 (build 49), "What's new in 1.2.5", providers line; 3,823 characters); Claude checked them by
  substring without reading the key back. If the reviewer key was not rotated before saving, rotate it after review.
  **Approved: Pending Developer Release** (checked 2026-10-23 through the API). Nothing is public until Houfu presses
  Release in App Store Connect, or tells Claude to release it.

- **Listen resumes at the right sentence, v240 (web; Houfu, testing v239: "it jumps to the next sentence after i exit and
  enter listen mode").** Two causes: a long sentence is spoken in pieces (`MAX_CHUNK` = 240), so leaving inside it
  resumed mid-sentence; and leaving a moment after the voice moved on resumed at the new sentence, skipping the one just
  heard. Each piece now records whether it begins a sentence (`first`, from `sentencePieces`), Listen resumes at the
  start of the sentence being read, and if that sentence had begun less than `VOICE_JUST_BEGAN` = 1.2 s before leaving,
  at the one before. `reading-voice-exit-resume-browser` now 8 checks (the skip-ahead case fails on v239). All Listen,
  phone and iPad suites pass in both engines. **Native build waits for Houfu's "ok"** ("after everything, just push the
  newest ver, after i say ok then make the build and make to app store connect"): 1.2.5 (48), prepared below, bundles
  v239; he said ok and build 49 with v240 is now on the 1.2.5 record (see below).

- **Phloem 1.2.5 (49) prepared for the App Store, not submitted (Houfu: "for phloem shall we publish the newest on
  iphone and mac and ipad too? the build 45 went through").** 1.2.4 (45) is Ready for Sale. **Version record iOS 1.2.5
  created** (manual release, copyright "2026 Houfu Chen"), **build 49 attached** (2026-10-22, after Houfu's "ok"):
  universal, reader **v240** (b7548124; Listen resumes at the start of the sentence it was reading), commit 1b36385d,
  VALID, with a What to Test list. Builds 47 (v238) and 48 (v239) stay in TestFlight only. What's New's Listen line now
  reads "Close Listen and open it again: it picks up at the start of the sentence it was reading." Commits 40edf019 (47) and 529c4dfd (48). Checked before upload: `apps/ipad` 22/22; `reading-zen-ipad`,
  `reading-workspace-bottom-dock`, `reading-phone-browser`, `reading-ipad-touch-dock`, `reading-workspace-move-tool`,
  `reading-night-light`, `reading-voice-exit-resume-browser` pass in Chromium and WebKit; in the simulators the iPad
  app's Zen dock has **Night** under Listen and its Workspace tools are Pen (default), Eraser, Lasso with **no Move**
  (the Move button is removed when `PHLOEM_NATIVE`), and the iPhone keeps Library · Look up · Listen · Find · More
  with Night light under More. **Listing:** the iPad 13" set (5 screenshots and the preview) carried over; the four
  **6.9-inch iPhone screenshots** are uploaded (`APP_IPHONE_67`, 1320×2868, processed). **What's New (en-CA)** drafted:
  iPhone, Night light, Listen resumes, the mirrored one-page turn, the whole-page highlight fix. **Description:** first
  line now "…research papers on iPad and iPhone." plus one iPhone sentence; the rest unchanged. Subtitle unchanged
  ("Read papers. Stay focused."). **App Review notes not changed:** the copy on 1.2.5 still says 1.2.4 (build 45) and
  still holds the reviewer Anthropic key; the API only replaces the whole text, so the edits are written out for Houfu
  (fits: 3,845 of 4,000 characters). The macOS 1.0 draft is untouched. No review submission was created.

- **Listen leaves no marks behind and resumes where it stopped; the lamp switch only where it lights paper, v239 (web;
  Houfu: "the speakers highlight wont go when i exit the speaker mode, also if i reenter the speaker mode, dont make it
  speak elsewhere"; "the night mode and night light mode in library are the same it seems").** (1) The Zen dock's
  Listen paused on a second tap, so the sentence stayed marked and the paper dimmed with the bar open; it now **opens
  and closes** Listen like the close button (play/pause stay on the bar; the phone's Listen stays play/pause).
  (2) After closing, Listen restarted at the top of the page; it now **remembers the sentence** (`voiceResume`) and
  resumes there when that sentence is still in view (a selected passage still wins; after moving to another page it
  starts where the reader is). (3) The top-bar lamp is hidden in the library (`body:not(.reading)`), where it only
  repeated the dark theme. Tests: new `reading-voice-exit-resume-browser` (4); `reading-night-light` 33. All Listen,
  phone, iPad dock and Zen iPad suites pass in both engines.

- **Workspace Move tool on laptops, v238 (web; Houfu: "same issue for workplace scroll"; then "on ipad app or browser,
  idont think we need a move button for the workplace section").** On a laptop every Workspace tool claimed the mouse
  drag (Pen, the default, drew; Lasso selected; Eraser erased), so the paper moved only with the trackpad. A **Move**
  tool (four-arrow icon, first in the toolbar) now exists **only on laptops** (`laptopPointer`: fine pointer with hover,
  no touch points, no iPhone/iPad/iPod/Android user agent, not the native app) and is their default: dragging blank
  Workspace paper moves it 1:1 and a flick glides (same feel as the PDF paper, v237); notes, grips and the selection
  keep their own drags; a stylus still writes while Move is on, as the Pencil does on the iPad. Picking Pen makes the
  mouse draw. On iPad (app or Safari) and phones the button is removed and the Pen stays the default, exactly as before.
  Also: a flick on the PDF paper now glides if released within `GLIDE_REST` = 100 ms of the last move (was 60 ms, too
  tight under load). Test: new `reading-workspace-move-tool` (7). The 45 Workspace-related suites pass in both engines
  except `reading-pdf-ink`, `reading-split-undo-browser`, `reading-workspace-paper-color`/`-paper-edge`, which fail as
  on main.

- **Natural dragging at any zoom, v237 (web; Houfu, after v236: at the normal zoom "dragging down" was "sometimes not
  respondant ... maybe you should mimic natural dragging").** At the normal zoom in Scroll layout a drag never moved the
  paper (v236 only grabbed a zoomed-in paper): from a word it selected, from blank paper it started a selection that
  the browser autoscrolled at its own pace. Now blank paper can be grabbed whenever the paper runs off the pane
  (`.paper-movable`; thin Zen scrollbars stay for zoomed-in paper only, `.paper-zoomed`), it follows the hand 1:1, and a
  flick **glides** on and slows like trackpad scrolling (`GLIDE_TAU` = 325 ms exponential decay; a drag that came to rest
  before release does not glide; any click, scroll, key or touch stops it). The grab begins only after `GRAB_SLOP` = 4 px
  of movement, so a plain click on the paper is still a click (it clears a selection, closes a card). Words still
  select (they cover only 14–20% of a typical page, so most presses land on blank paper). Page and Book at Fit have
  nothing to move. `reading-zoomed-paper-grab` now 37 checks (5 of the new ones fail on v236).

- **Zoomed-in paper moves on a laptop, and Night light is one tap, v236 (web; Houfu: "i cannot move the paper around
  once i zoom them in, on laptop, i have to zoom out and zoom back in", in Chrome, Page or Book layout, by click-and-drag
  and by scrollbars or keys; and "shall we make night light a button outside instead of inside?").** Trackpad
  two-finger scrolling was never broken (checked in Chromium and WebKit, all layouts, the guide and a 15-page paper);
  what was missing: (1) **click-and-drag** did nothing but select text, so a press on **blank paper** now grabs a
  zoomed-in paper and moves it (hand cursor; words keep the text cursor and still select; links, saved marks, stickies,
  the outer-edge page curl, Pencil, ink, eraser and sticky placing keep their presses); (2) **← →** always turned the
  page, so they now move a zoomed paper that runs off the side first and turn the page only at that edge (↑ ↓ already
  scrolled); (3) **Zen hid the scrollbars**, so a zoomed paper (`.document-pane.paper-zoomed`, kept current by a
  ResizeObserver) shows thin scrollbars on laptops. Zoomed means: Page/Book, any overflow; Scroll, wider than the pane.
  **Night light** is now a dock button ("Night", lamp icon, amber when on) under Listen and a lamp in the top bar next
  to the theme button; the More menu keeps it only on phones (`phone-only`), whose tidy bar stays as it is; the Reach
  slider stays in Reading settings. Tests: new `reading-zoomed-paper-grab` (29; 16 fail on v235), `reading-night-light`
  now 31 (dock and top-bar buttons). The dock has nine controls; at 1024×768, 768×1024 and 1024×390 all stay on screen
  (`reading-pdf-ink`'s dock check still expects seven ids, as on v235). Build 46 bundles v235, so these need build 47.

- **iPhone and Mac: universal 1.2.5 (46) in TestFlight, not submitted (Houfu: "also make sure phloem app is on
  iphone and mac too... idk").** (1) **iPhone:** `TARGETED_DEVICE_FAMILY = "1,2"`, version 1.2.5 / build 46, reader
  v235 bundled. The shared reader's phone layout (`body.phone-ui`, v224) needed no change; `isIpad()` still sees the
  iPad's desktop user agent with touch, so the iPad keeps its layout. The native shell now names the device
  (`window.PHLOEM_DEVICE`, a document-start user script in `PhloemBridgeViewController.swift`), so the adapter
  (`native/ipad.js`) and the iCloud plugin's messages say "this iPhone" / "this Mac"; iPad copy is word for word as
  before. **Checked in the iPhone 18 Pro Max simulator (iOS 27) in the real WKWebView**, driven through the simulator's
  Web Inspector socket (`output/phloem-iphone-1.2.5-2026-10-21/tools/sim-webinspector.py`, Debug builds only; the
  Simulator panel had no device access): portrait 440×956 and on its side 956×440 (bar becomes a right rail, text
  clears the Dynamic Island, landscape forced with a temporary Debug-only hook, not committed); Library; importing the
  eLife PDF; Look up (Wiktionary and Wikipedia over the network); Listen through `PhloemSpeech` (68 voices, the spoken
  sentence highlighted on the PDF page); select → Define · Highlight · Copy · More → Highlight; More menu; Night
  light. **iPad unchanged:** same build in the "Shots iPad 13" simulator: desktop UA, 5 touch points, no `phone-ui`,
  Zen side dock, "Phloem for iPad"; `reading-zen-ipad` 45/45 and `reading-workspace-bottom-dock` 2/2 (plus
  `reading-phone-browser` 5/5) in Chromium and WebKit before and after; `apps/ipad` tests 22/22 (new test pins the
  device families and the iPad orientation list). Commit 14b3f2a2; archive
  `~/Library/Developer/Xcode/Archives/2026-10-21/Phloem 1.2.5 (46).xcarchive`, uploaded with the API key: build 46 is
  **VALID**, in TestFlight for Internal Testers and friends2 with a What to Test list (iPhone, iPad, Mac); not sent to
  the external "friends" group (that needs beta review).
  **iPhone screenshots (6.9-inch, 1320×2868), ready:** `output/phloem-iphone-1.2.5-2026-10-21/UPLOAD-iphone-6.9/`
  (Listen to any paper · Look up any word · Mark what matters · Your papers, in your pocket): unedited simulator
  captures, same frame as the live iPad set, eLife CC BY credit; the Look up card is a Wiktionary text entry (credited)
  because Wikimedia photos are CC BY-SA. They go on the next version record, which App Store Connect only allows once
  1.2.4 leaves review. (2) **Mac:** already on. The public listing shows "Designed for iPad. Not verified for macOS.
  Requires macOS 12.0 or later and a Mac with Apple M1 chip or later", so the Apple-silicon availability setting is
  on (the setting itself is not in the public API, and the in-app browser has no App Store Connect sign-in). All three
  TestFlight groups have "iOS builds on Apple silicon Macs" on, so TestFlight on this Mac can install build 46: no
  device registration needed. The **macOS 1.0 draft** (created 2026-10-02, no build, no description) is untouched.
  While unreleased it does not block the iPad app on Macs; releasing a real macOS app on this record would replace it.
  (3) **Web follow-ups, not done here** (another session owns `reading.js`): the reader's own native copy still says
  "this iPad" on an iPhone (`iCloudDeviceName`, iCloud status lines, "Remove the saved … key from this iPad?"), which
  `window.PHLOEM_DEVICE` can fix; the Look up card links a Wiktionary definition as "Wikipedia article ↗"; Night light in
  a phone-sized portrait pane is barely visible.

- **Whole-page highlights on the iPad, found and fixed, v235 (web; Houfu: "i mean the entire page not the next page";
  where: iPad app and iPad Safari; how: Apple Pencil swipe and finger select + Highlight).** Reproduced in the iOS
  Simulator's Safari with a debug beacon. iPad WebKit's selection handles hit-test the empty text layer whenever they sit
  over blank paper, and the moving end snaps to the page's **first character** (or last). The end handle's knob hangs
  below the line, so the snap happens on the first move of a drag. The selection then runs from the page header
  (and, in PDFs that draw it early, the footer) to the passage; the next tap captured it and Highlight saved it as one
  highlight 0.93 of a page tall. A long-press on blank paper selects the page's first word the same way, and a Pencil
  swipe that touched down more than 12 px from the words was left to iPadOS, which makes a native selection that can
  start there. A handle drag sends the page one pointerdown and nothing else (no moves, no pointerup), and moving the
  selection mid-drag makes WebKit lose track of which end the finger holds (tried and seen in the Simulator), so the
  fix never touches a selection that may be in hand: `touchSelectionSnapGuard` (Apple touch only) keeps the last
  selection that was not a snap and hands it to `captureSelection`, and puts the visible selection back once it has
  been still for `SNAP_SETTLE` = 900 ms. A snap is an end that lands on a page's first or last character after
  skipping at least one line of text, so moving through the text onto the header line by line is kept. A fresh
  selection with an end on a page edge, far from where a press on blank paper landed, gives nothing to highlight and
  is cleared on lift. The Pencil highlighter now starts within `PENCIL_START_REACH` = 20 px of the words (was 12).
  Simulator check on the final code: the snapped drag settles back on the word, a long drag across the gap to the
  next block keeps its start, a blank long-press selects nothing. Test `reading-touch-selection-snap` (11 checks, iPad
  user agent) fails 8 on v234 and passes in Chromium and WebKit. Needs the next iPad build.

- **Night light, the page-curl underside, and selections that jumped pages, v234 (web; Houfu sent two photos of a
  paperback under a clip-on lamp: "idk if we could do a night light mode like this" / "the light doesnt have to be
  like mine, esp the orientation"; "when we flip, the filpped page is supposed to be the mirrored if look from the
  back right?"; "sometimes when trying to do highlight it will highlight the entire page").**
  (1) **Night light** (Reading settings → Night light, or ⋯ → Night light in Zen): a lamp pool over the paper in a
  dark room. One small canvas (about 430×290 px, ~30 ms to paint, repainted only when the pane's size or Reach
  changes) is stretched over `#documentPane` as a plain alpha layer (`#paneNight`, z 7, above the guide, never takes
  a touch, no blend modes or filters), so the light stays put while the paper scrolls or turns under it. The model is
  a spot lamp above the top edge: a beam plus a wider spill, cos³ fall-off, a soft knee for a broad lit plateau, and a
  seeded Neyman–Scott cluster of soft lobes (log-normal sizes) that makes the pool's edge uneven. The shade runs from
  faint amber to deep brown. **Reach** 0–100 (default 35): at 35 the far corners keep about 40% of the light and stay
  readable; at 0 about 15–20% (dramatic); at 100 it is a soft room light. The desk goes near-black with a warm spill.
  Turning it on also turns the interface dark (and back when off, unless a theme was picked by hand meanwhile) and
  moves Inverted paper to Cream. Saved in `readingRoom.comfort.v1` (`nightLight`, `nightReach`, `nightThemeAuto`) and
  applied at start-up, so a reload never flashes the light interface.
  (2) **Page-curl underside:** in the one-page (Page) layout the back of the turning leaf is the same page seen from
  behind, so its show-through must be mirrored, but the spread's extra `scaleX(-1)` on `.book-curl-back-sheet`
  un-mirrored it. One-page curls now drop that flip (the wash keeps its lighting). In Book spreads the back is the
  next page, which still reads the right way round.
  (3) **Selections that jumped pages (mouse, trackpad, Pencil):** a drag from a page's text into blank space (the
  desk beside the page, a margin) let the browser move the selection's end to the "nearest" text in document order,
  often on the next page; Highlight then refused it as spanning pages. `pageSelectionClamp` brings the end back to the
  starting page only when it escapes (below the text → its last word, above → its first, beside → the nearest words on
  that line). Finger selection keeps the native handles. **A whole-page highlight on the iPad was not reproduced**
  (on Apple touch no page-sized element can sit inside a range); if it happens again, a screen recording would show
  which path it takes. All three **need the next iPad build** (1.2.4 (45) bundles v232).

- **iCloud on the website, for use in China, v233 (web; Houfu: "make sure icloud works for everything in my web,
  including phloem and things like the journal writing" / "the goal is to allow me to use them in china").**
  Web sign-in is still the open blocker and needs Houfu's own Apple ID: Apple's sign-in page loads for this
  container (token, origin and Production schema checked read-only in CloudKit Console), so "Failed to verify
  your identity" is Apple's account check. Morning steps and leads: `apps/ipad/plans/ICLOUD-SYNC-FIX.md`,
  "Sixth round". Shipped: (1) website iCloud is an **opt-in**, `reading.html?icloud=1` (remembered,
  `?icloud=0` hides), so nobody else meets a sign-in that may fail; (2) the **token slots are empty**
  (`WEB_CLOUDKIT.apiToken` in reading.js, `ICLOUD.apiToken` in journal.html): Claude's safety check refused to
  write the CloudKit token into the site, so Houfu fills both with the "Phloem web" value or says so;
  (3) **journal.html syncs to iCloud** (same AES-GCM ciphertext as its GitHub sync, record `journal-v1` of type
  `PhloemLibrary`, no schema change; Phloem and the iPad never list that type), signs in through reading.html,
  and shares Phloem's session; (4) the journal's Google Fonts are self-hosted (`fonts/journal/`);
  (5) Drive gives up after 20 s instead of holding the sync queue in China, then rests ten minutes; (6) `reading-sw.js` and a new
  `journal-sw.js` open the cached page after 4 s of network silence (GitHub Pages is throttled in China).

- **iPad 1.2.4 (45) rebuilt with reader v232 and uploaded (2026-10-20 evening; Houfu: "do what you need to do").**
  The earlier 1.2.4 (45) archive (reader v230, the old Spotlight) was never uploaded: it waited on an Xcode sign-in.
  Re-archived from `main` a33f16f3 (iPad bundle tests 21/21; the bundle has `?v=232`, `SPOT_WASH`,
  `restoreLiveSelection`) and uploaded with the **App Store Connect API key** (no Xcode sign-in needed; key file in
  `~/.appstoreconnect/private_keys`, details in the Truco project's `asc-api-key` memory; add
  `-authenticationKeyPath … -authenticationKeyID 32QNHVX837 -authenticationKeyIssuerID …` to `-exportArchive`). Build 45
  is VALID and in TestFlight with a What to Test list (Spotlight, handwritten notes, Listen, Zen slider, dark ink).
  Version record **1.2.4 created (manual release)**, What's New set (en-CA), build 45 attached. **Submitted
  2026-10-20 ~21:00 EDT, Waiting for Review** (submission f2dce3fc; Houfu: "submit Phloem 1.2.4 for review"). Manual
  release: press Release after approval. App Review notes now say 1.2.4 (build 45) with a 1.2.4 section 2 (edited in
  place in App Store Connect so the reviewer's AI key in the notes was never retyped).

- **Four 12 Oct regressions fixed at last, v232 (web).** PR #75 (`claude/phloem-status-71ylos`, requested by Houfu on
  2026-10-13) fixed them but was closed unmerged the same night while `main` took the v207/v208 numbers, and the bugs
  stayed live. Re-landed its commit `a9991409` on v231 (the code applied cleanly; only version stamps conflicted).
  (1) **Android:** a selection extended with the handles onto more lines saved one highlight covering the whole page
  (the selection guard's page-sized block sat inside the range; geometry is now read with it out of layout).
  (2) **Android:** holding a fresh selection until it was picked up, then letting go anywhere but the Workspace, wiped
  the selection; it now comes back. (3) **Zen:** the docked, upright Highlight strength slider only followed sideways
  movement; it now follows up and down. (4) **Dark Workspace:** white ink lying on a pale sticky note vanished; a thin
  rim in the sheet's colour keeps it readable. All four checks failed on v231 and pass now on Chromium and WebKit
  (`reading-android-touch`, `reading-selection-workspace-drag`, `reading-highlight-crisp-text`,
  `reading-workspace-dark-ink`). Also: `reading.html`'s `?v=` asset stamps had stayed at 230 through v231; all are
  v232 now. **Needs the next iPad build** (1.2.4 (45) bundles v230).

- **Spotlight as a magnifying glass, v231 (web; Houfu: "for spotlight, is it gonna be dizzy for ppl to look at? if so
  change, and idk if we should make it more like the magnifiying glass").** Two things in v230 could make people
  dizzy. (1) **Scrolling:** the enlarged copy is redrawn by script each frame, but iPad Safari (and Chrome) scroll the
  page on another thread, so the copy trailed the page and caught up, and the words in the lens juddered. Now the copy
  **steps aside while the paper scrolls** (`spotScrolling`; the circle shows the real paper 1:1, like while
  annotating) and fades back in 0.12 s once the paper has been still for `SPOT_SETTLE` = 140 ms. (2) **The fog:** the
  outside had a full-pane 3.5px blur plus an 85% paper wash, so a sharp hole slid over unreadable haze. The **blur is
  gone** (also the full-pane GPU layer from v230's review point 2), and the wash is lighter: Dimness 70–100% now
  washes 42–60% (`SPOT_WASH` = .6; 85% → 51%), so the page stays readable around the glass. **Glass look:** an opaque
  5px rim in the guide colour (yellow/green/blue, light and dark) with a thin dark edge, a bright inner edge, a faint
  glare and a soft shadow. The rim sits just outside the lens edge, so it also covers the seam where 1.1x meets 1x.
  Still 1.1x (`SPOT_ZOOM`, Houfu's number). Toast and button titles say "magnifying glass … the rest dims". Test:
  `reading-spotlight-guide` 22/22 Chromium and WebKit (+3: no blur, 51% wash, steps aside mid-scroll and returns).
  Neighbours on Chromium: 14/16 pass; `reading-pdf-ink` fails the same on v230, `reading-book-guide` flaked once and
  passed on rerun. **The iPad 1.2.4 (45) archive bundles v230 (the old lens);** v231 needs a re-bundled build.
  Not checked by people or on a real iPad.

- **iPad 1.2.4 (45), reader v230 (2026-10-20; Houfu: "push to main and to App Store. And check why App Store is
  still not publishing our code").** Why the App Store lagged: the app ships a **copy of the reader bundled at build
  time** (`apps/ipad/scripts/build-web.mjs`), so a push to `main` only updates the website. 1.2.3 (44) went live on
  2026-10-16 22:27 UTC with reader v227; v228 (Listen highlight on PDF pages, pin-only), v229 (handwritten sticky
  notes) and v230 (Spotlight) were web-only until this build. Every reader change needs a new build + App Review.
  This build: PR #78 (the released 1.2.3 branch) merged into `main`, version 1.2.4 / build 45, iPad bundle tests
  21/21, `cap sync` bundles v230, Release archive signed for team DCC763A996. **Checked in the iPad 13" simulator
  (iOS 27 runtime, real WKWebView):** Spotlight from the Zen guide menu enlarges the words under the lens and
  **blurs and dims the outside** (so the v230 worry below about WebKit was Playwright's headless WebKit, which draws
  no `backdrop-filter` at all, mask or not); dragging the lens by its grip moves it and the copy follows,
  highlights included. Upload and App Store Connect state: see Log.

- **Spotlight guide, v230 (merged to `main` 2026-10-20 after review; Houfu: "for the guide make another mode …
  circular spotlight effect on a certain part, mag 1.1x … dim or blur the outside parts").** The guide's shape picker (Settings "Shape", and new Rows | Columns | Spotlight
  buttons in the Zen guide menu) gains **Spotlight**: a round lens follows the pointer (mouse) or is placed by a
  tap / dragged by its grip (touch), showing the paper under it **enlarged 1.1×** (`SPOT_ZOOM`), while the rest of the
  pane is **dimmed** (the existing Dimness slider, 70–100%) and **blurred** (3.5px backdrop blur). The Size slider
  scales the lens (150–260 px at 100%). Works on PDFs (scroll, page, book) and text/Reader view; pins with a click
  like the band; persists (`comfort.guideOrientation='spot'`, `spotX/spotY`). How: the lens holds **inert copies**
  of the page(s) under it (`paintSpotLens`): PDF pixels are copied only for the circle's patch into a small canvas
  (no full-page canvas duplicates, so iPad canvas memory stays flat); highlights, ink, sticky notes and Find marks
  come along as DOM copies, refreshed by a MutationObserver when the page changes; Listen's CSS-highlight sentence
  is redrawn as plain rectangles. Copies drop ids, `data-page`, links and the text layer, so nothing in the app can
  find them. **While the reader selects text or uses the pen/marker/eraser/sticky tools, during a pinch or a page
  turn, the copy hides and the circle shows the real paper unenlarged**, so taps and strokes land where they are
  seen. Grip drags keep the finger where it took hold (it never covers the enlarged words).
  **Review points:** (1) ~~WebKit/iPad does not blur under a CSS mask~~: resolved 2026-10-20. Playwright's headless
  WebKit draws no `backdrop-filter` at all (checked with a plain unmasked blur), so its screenshots show dim-only;
  the iPad app in the simulator blurs and dims as designed. (2) The blur sits on a
  full-pane layer; check scrolling smoothness on an older iPad. (3) Copies render with the reader's own CSS; a
  paper-level style that keys on an id would not reach them (none found). Test:
  `tests/reading-spotlight-guide.test.js` (19 checks: geometry, a red square measured at 1.08× under the centre,
  scroll alignment, pen mode steps aside, Rows restores the band, text papers, persistence), Chromium 19/19 and
  WebKit 19/19.

## Earlier (2026-10-16)

- **Handwritten sticky notes, v229 (web; Houfu: "make the note 'writable' instead of only do text … default to
  write").** A PDF sticky note now has a 4:3 writing face with **Write | Type** under it. A note placed with the
  Pencil or a finger opens in **Write** (the face is focused, so no keyboard pops up); one placed with a mouse or
  trackpad opens in Type; reopening a note picks Write unless it holds only typed words. In Write the Pencil, a
  mouse or a finger draws (PhloemInk smoothing, natural taper, dark ink); once a Pencil has touched a note, fingers
  rest: a palm neither draws nor closes the note (a Pencil tap, ✓ or Escape closes it). A Pencil on a note in Type
  goes back to Write; a key typed in Write goes to Type with that key. **Eraser** takes whole strokes; the note's
  **↶** and the paper's Undo/Redo step through strokes and erases. Handwriting alone keeps a note (only a note with
  no words and no ink is removed on close). Stored as `ink: [{color,width,style,points:[[x,y,p]]}]` on the note
  (fractions of the face; `PhloemStickies.cleanInk` validates it; merges with the note by `updatedAt`). The icon
  shows lines, its label says "Handwritten sticky note"; the Notebook shows the handwriting as a small picture;
  Markdown/NotebookLM exports say "Handwritten note"; Export annotated PDF puts a "(Handwritten note)" comment at the
  spot (the strokes themselves are not drawn into the PDF). The note is 300 px wide (was 264) and now keeps clear of
  the Zen dock. **Older Phloem copies (the iPad app 1.2.3 bundles v227) do not show the ink, and closing a
  handwriting-only note there removes it as empty** (Undo there brings it back), so write handwritten notes in the
  web reader until a build with v229 is out. Not checked with a real Pencil (Scribble, palm behaviour); tested with
  synthetic pen/touch/mouse input in Chromium and WebKit. Test: `tests/reading-sticky-handwriting.test.js` (34).

- **Listen fixes, v228 (web; Houfu's iPad Safari recording of Taiz & Zeiger ch. 4, 2026-10-15 23:06: "why still not
  highlighted where is being read", "why tapping paper would put where it reads, it's supposed to be the sole
  functionality of the pointer", "it cannot still perfectly pick up the right passages").** (1) **Highlight on PDF
  pages:** sentences are located in the page's text-layer text in reading order, but a PDF can list text in another
  order (book p. 48: the figure's labels and caption come last), and once one sentence matched there every later one
  was searched only after it, so nothing else on the page lit up. `voiceSpot` now searches the whole page when the
  next match is not after the last. The marker now covers just the spoken sentence (CSS highlight `voice-pdf`, a
  range from its first to its last word across the line spans; the old whole-line `.voice-span` class is the
  fallback without CSS highlights). `PhloemVoice.locate` joins line-end hyphens ("vol-" + "ume"), prefers the place
  where a sentence's opening words sit together (no more starting at an earlier "a"), and tolerates up to three stray
  words glued to the front. (2) **Only the pin moves the voice:** the v222 "tap a paragraph to read from there" is
  gone on every device; the toast says "drag the pin to read from elsewhere". (3) **Passages:** diagram labels glued
  to the front of a paragraph ("Across root (ΔΨw) When a soil…", one to four words and a short symbol in parentheses
  before a capital) are dropped, so a caption behind them ("Leaf air spaces (Δcwv) FIGURE 4.1 …") is recognised and
  skipped. Still imperfect on this book: a section heading merged with its first paragraph is read as one sentence,
  the left column under the figure is read after the right one, and symbol-font letters read as letters ("Ys" for
  Ψs). Tests: new `reading-voice-pdf-focus-browser` (two columns, right one first in the PDF; fails on v227),
  `reading-voice` +2, `reading-voice-browser` (a tap leaves the voice), `reading-voice-focus-browser` (speed step now
  set on the doubling slider; it had failed since v227). **The iPad app 1.2.3 (44) in review bundles v227**, so it
  still has tap-to-read and the figure-page gap until the next build.
  Suite on v228: Chromium 136/140, WebKit 135/140; every failure also fails on clean v227 (`reading-pdf-ink`,
  `reading-split-undo-browser`, `reading-workspace-paper-color`, `reading-workspace-paper-edge`; WebKit
  `reading-zen-compact-browser`, line 273: the annotation passage reads ''). Two tests stale since v225/v227 now
  match the dock: `reading-zen-default-browser` (Listen on the dock) and `reading-zen-find-clearance` (round layout
  button).
- **iPad 1.2.3 (44) in App Review, reader v227 (2026-10-15 night; Houfu, before going to sleep: "you can ship it
  once everything works ok? and put into app store as well").** 1.2.3 is the build that lets Listen use voices
  downloaded in Settings: the `PhloemSpeech` plugin (v225) plus a fix so names are not doubled ("Jamie (Premium)
  (Premium)": Apple's names already carry the quality). **Submitted 22:45 EDT, Waiting for Review, manual release:
  press Release after approval, then merge PR #78** (branch `ipad-release-1.2.3-44`, built on the merged 1.2.2
  branch). Builds 43 (v225) and 44 (v227) are in TestFlight for friends2 and Internal Testers; 44's What to Test walks
  through downloading Jamie (Premium) and Listen. **Verified:** iPad 13" simulator (iOS 26.5): the voice menu lists
  iPadOS voices through the plugin (Daniel), speech plays (AudioQueue running, utterances end at speaking pace),
  sentences advance, PDF pages turn, pause/next/back work, touch drags of the pin (also with a 2 s hold) read from the
  dropped line; Mac: `AVSpeechSynthesizer` lists Jamie (Premium) and synthesizes it by identifier, the plugin's API.
  **Not verified:** a Premium voice inside the app on a real iPad (the simulator has no Voices download; Capacitor's
  xcframeworks have no Mac Catalyst slice; running the iPad app on this Mac needs the Mac registered as a development
  device, not done). **v227** (Houfu, watching the simulator): the Listen bar's "Read from…" menu is a **play pin**
  (an arrow pointed at the speed slider and a twig looked off; Houfu picked the pin from four mock-ups). Drag it onto
  the paper: its point marks the line (lifted 44px above a finger; the nearest text on that line from the margin), the
  paper scrolls near its edges, and letting go reads from there; a tap lists sections. iOS can skip `pointerup` for a
  finger held still, so `touchend`/`touchcancel` end the drag too. **Speed** runs in doublings, 0.5×–2×, with 1× in
  the middle (notch, snaps near 1×; "put 1x as the middle, make more slower ones"), and the slider took the menu's
  space (~40 → ~200 px). The Zen **page-layout** control is a round dock button with icon + caption ("the scroll
  button is too special"). Android Chrome gets the pin and slider too (web changes); a finger drag is tested on
  Chromium through CDP touch input (no Android emulator on this Mac). Failing on main before v227 and unchanged:
  `reading-pdf-ink`, `reading-split-undo-browser`, `reading-workspace-paper-color`, `reading-workspace-paper-edge`;
  `reading-book-guide` (Chromium) and `reading-zen-compact-browser` (WebKit) flake.
- **Listen uses on-device voices only, v226 (Houfu: Listen must stay no network, no AI; their supervisor forbids AI
  for the proposal and manuscript).** `PhloemVoice.rankVoices` drops every voice with `localService === false`, and
  `naturalVoice` no longer counts a name with "Google" or "Online" as natural. Gone: desktop Chrome's "Google US
  English" / "Google UK English Female/Male" (text goes to Google) and Edge's "Microsoft … Online (Natural)" (cloud
  AI voices). Kept: Apple's voices incl. Premium/Enhanced, Windows voices on the PC (David, Zira, Mark, and a Natural
  voice if it reports `localService: true`), Android's Google engine voices (local), the iPad app's PhloemSpeech voices.
  No "online" group; with no on-device English voice the menu says "System voice". A saved network voice falls back
  to the best on-device one. The Windows guide now points to Settings > Time & language > Speech > Manage voices and
  Narrator's natural voices, not Edge. Edge case left: a browser with no on-device voice at all (Linux Chrome without
  speech-dispatcher) speaks "System voice" with whatever the browser picks. Tests: `reading-voice` 17/17 (Chrome, Edge,
  Android lists), Edge page in `reading-voice-quality-browser`.
- **Listen, v225 (Houfu, on the iPad: the voice menu "can't be clicked"; "the web ver only have those even after i
  downloaded voice, and app ver only have a greyed out system voice dropdown"; "the passage being read should be
  automatically focused"; "listen should be one of the button"; "the speed change can be made into a slide bar").**
  Cause: WebKit's Web Speech only offers the voices that ship with iPadOS (Samantha, Daniel…), never a Premium/Enhanced
  voice downloaded in Settings ([Apple forum](https://developer.apple.com/forums/thread/723503),
  [WebKit 250665](https://bugs.webkit.org/show_bug.cgi?id=250665)); in the app's WKWebView it lists none, so the menu
  was disabled. Fixes: (1) **iPad app:** new native `PhloemSpeech` plugin (`apps/ipad/ios/App/App/PhloemSpeechPlugin.swift`,
  AVSpeechSynthesizer, on-device, `.playback`/`.spokenAudio` session) lists every installed voice with "(Premium)" /
  "(Enhanced)" in the name and speaks with WebKit's rate mapping; `PhloemVoice.nativeEngine` gives it speechSynthesis's
  shape so the same player drives it. **Needs the next app build (1.2.3)**. (2) **Web:** the menu is never greyed out
  (empty list = "System voice", asked again for ~5 s); Safari on iPad says "Safari offers only the basic voices. How to
  use Jamie →" and the guide points to the app; the Mac guide notes Safari may not list downloaded voices. (3) **Focus:**
  Reader view marks the spoken sentence (CSS Custom Highlight `voice-sentence`, located in the page text with its
  citations by `PhloemVoice.locate`), dims the other paragraphs (`body.voice-focus`) and scrolls so the sentence sits a
  third of the way down; PDF view puts a highlighter on the sentence's text-layer spans (`.voice-span`) and follows
  pages. Scrolling by hand (wheel, finger, keys) pauses the following for 6 s. **With the reading guide on**, the guide
  band follows the voice instead of the pointer while Listen plays (no dimming); paused, the pointer has it again.
  (4) **Listen is a dock button** (headphones, captioned, lit while the bar is open); phones keep their bar's Listen.
  (5) **Speed is a slider**, 0.6–2×, applied when the thumb rests. Test: `tests/reading-voice-focus-browser.test.js`
  (Chromium and WebKit), `reading-voice` 13/13.
- **Phone layout (v224, Houfu: "prioritize the listening and define search, it will be hard to take notes on
  phone"; "tidy and non-burdensome"):** `body.phone-ui` = a window ≤600px wide, or a short (≤500px) touch window ≤1000px
  wide (a phone on its side), and **never an iPad** (`isIpad()`), so the iPad web reader and the iPad app keep the side
  rail. The reader's controls become one bar: **Library · Look up · Listen · Find · More** (bottom in portrait, a right
  rail on its side). Pens, marker, Undo and Workspace leave the bar; More gains Reading guide, Page layout (PDFs),
  Workspace and Undo. **Look up** opens a card with a search field; while it is open, tapping any word in the paper
  looks that word up (caret under the tap → word). The selection card shows **Define · Highlight · Copy · More**; More
  reveals Add note, colours, What does this mean?, Save to Clips, Park question. Denser text on phones (paper fills the
  width, leading ×0.9, smaller paragraph and heading gaps, no invisible "Add margin note" line); on its side the text is
  a centred column of at most 640px. Test: `tests/reading-phone-browser.test.js`; six rail tests now skip their rail
  checks at phone sizes (their iPad and desktop sizes are unchanged). Next ideas: an iPhone app (universal build) for
  Listen with the screen locked; a "cards" reading mode (one paragraph per screen) Houfu floated.
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
  Jamie (Premium) after it is downloaded in Settings → Accessibility → Read & Speak → Voices → English, and whether speech continues
  with the screen locked (iOS pauses web speech in the background).
- **Voice guide (v222, Houfu: "people won't know where to download the voice"):** apps cannot download system voices
  (and private Settings deep links get apps rejected), so Listen detects a device with only basic voices (no
  Premium/Enhanced/Natural/Google voice) and shows "Get a more natural voice →" with steps for iPad/iPhone, Mac,
  Android (incl. Samsung's General management path) and Windows (Edge's natural voices). Android names no voice
  quality, so there the link is always shown ("Voice sounds robotic?"). Coming back to Phloem (visibilitychange /
  voiceschanged) with a new natural voice switches Listen to it and says "Jamie (Premium) is ready for Listen", unless
  the reader picked a natural voice themselves. Not in iPad 1.2.2 (41); next build.
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
- **Web:** houfu72.com/reading.html serves **v222**: Listen's voice guide (below); v221 (Listen, Explain/Copy, Install, above); v220 (Define); v219: the list's "Look for" is now **My question**, blank until Houfu
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
- **App Store:** Phloem **iOS 1.2.2 (42) is live** (Ready for Distribution by the evening of 2026-10-15; PR #77 merged
  that night, so `apps/ipad` on main is 1.2.2 (42)). **1.2.3 (44) Waiting for Review**, manual release (see Now).
  Earlier: 1.2.1 (40) live 2026-10-13 14:19 EDT (PR #76). Build 42 carries reader v223 (41 had v221; both are in TestFlight for friends2 and
  Internal Testers) plus an App Store update notice (bundle-manifest.json carries the app version; Desk settings shows
  "Version 1.2.2 (42) · the newest version"; a newer store version gets a dismissible Update banner). What's New and
  review notes were rewritten for 1.2.2 in App Store Connect (notes 3,934 of 4,000 characters; the reviewer key line was
  left as it was). Houfu tested build 40 on his iPad ("works well"), and the
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

- **Two papers side by side in one window: recommended not to build now.** The reader holds one paper at a time
  (page, zoom, highlights, Listen are all single), so either it is reworked to hold two (a deep change touching
  everything, iPad included) or a second reader runs in a frame beside the first. The frame keeps each paper's own page,
  zoom, highlights and Listen, but takes the Workspace's place on the side (Workspace and layout code change), needs
  the iPad app's native bridge passed into the frame, and, to save highlights there, the per-item merge on every save
  that was set aside above (otherwise the paper beside is read-only). Mock-ups of the two layouts (A: side holds
  Workspace or a paper; B: both) were shown on 2026-10-22. Today on a laptop: two browser windows side by side work,
  one of them read-only. If wanted later, the low-risk start is a read-only paper beside, laptops only.

- **Web iCloud (China):** (1) fill the two empty CloudKit token slots with the "Phloem web" token, or tell
  Claude "put the CloudKit web token in"; (2) on the Mac, open `houfu72.com/reading.html?icloud=1` › Settings ›
  Sync with iCloud › Turn on, and sign in on Apple's page. If Apple again says "Failed to verify your
  identity", try a phone hotspot, then check the Apple ID's country/region (Settings › your name › Media &
  Purchases › View Account). Steps in `apps/ipad/plans/ICLOUD-SYNC-FIX.md`, "Sixth round".

- **Phloem 1.2.5 (49) is ready to submit (iPad, iPhone, Mac), waiting for Houfu's words.** Before saying "submit Phloem
  1.2.5": (1) edit the App Review notes in App Store Connect (three in-place edits in
  `output/phloem-iphone-1.2.5-2026-10-21/REVIEW-NOTES-EDITS-1.2.5.md`; Claude did not re-send the notes because they
  still carry the reviewer Anthropic key); (2) **rotate that key** (it has been in the notes since 1.2.1), then paste
  the new one on the key line; (3) glance at What's New and the description's new iPhone sentence; (4) optionally try
  build 49 on the iPhone from TestFlight. Shipping iPhone support cannot be withdrawn later.
- Keep Listen going with the screen locked? Needs the `audio` background mode in Info.plist (iPhone and iPad alike).
- **Mac:** the iPad app is already offered on Apple silicon Macs. Optional: install it on this Mac with
  TestFlight (build 49; replaces the old "register this Mac" question: not needed), then App Store Connect › Pricing and
  Availability › Verify Compatibility to drop "Not verified for macOS". In the Mac app the Workspace has no Move tool
  (v238 keeps it to browsers), so a mouse drag there draws; the PDF paper's mouse drag (v236/v237) works. Keep or
  delete the empty macOS 1.0 draft (harmless either way; Claude left it).

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

- **2026-10-22 v241:** one tab saves; other tabs show a bar and save nothing (see Now). Side-by-side papers: plan only.

- **2026-10-22 1.2.5 (49):** submitted for review on Houfu's word, manual release (see Now).

- **2026-10-22 1.2.5 (49):** v240 bundled after Houfu's "ok"; archived and uploaded with the API key, VALID, attached
  to iOS 1.2.5 (manual release). Not submitted: that needs "submit Phloem 1.2.5". Tests as for 48, plus the iPad and
  iPhone simulators on v240.

- **2026-10-21 v240:** Listen resumes at the start of the sentence, or the one just heard (see Now).

- **2026-10-21 1.2.5 (47, 48) and the 1.2.5 version record:** see Now. Uploaded with the API key; screenshots
  through the API (`appScreenshotSets` / `appScreenshots`, chunked upload, MD5 commit). Not submitted.

- **2026-10-21 v239:** Listen closes from the dock and resumes at its sentence; lamp switch only in the reader
  (see Now). Voice, phone, iPad dock, Zen iPad and Night light suites pass in Chromium and WebKit.

- **2026-10-21 v238:** Workspace Move tool on laptops only (see Now) and the PDF glide's 100 ms release window. v237's
  87-suite run finished at 166/174: the only new failure was `reading-zoomed-paper-grab`'s flick under parallel load,
  fixed by the window (passes four runs at once in both engines). Workspace suites 82/90, all others as on main.

- **2026-10-21 v237:** natural dragging at any zoom (grab blank paper whenever it runs off the pane, 1:1, glide after
  a flick; see Now). `reading-zoomed-paper-grab` 37 (5 fail on v236), passing twice in a row in Chromium and WebKit.
  Pushed on Houfu's word ("puhs pls") while the 87-suite regression run was still going; its result is logged next.

- **2026-10-21 v236:** zoomed paper moves on a laptop (grab blank paper, edge-aware ← →, thin scrollbars in Zen) and
  Night light on the Zen dock and the top bar (see Now). New test `reading-zoomed-paper-grab` (29; 16 fail on v235);
  `reading-night-light` 31; the dock lists in `reading-ipad-touch-dock`, `reading-zen-default-browser` and
  `reading-zen-compact-browser` now include `zenNightDock`. Regression: 87 suites x 2 engines, 162/174 in parallel; after
  those three list updates the rest fail as on main (`reading-pdf-ink` Zen-dock checks, still 69 passing;
  `reading-workspace-paper-color`/`-paper-edge` harness exits; `reading-zen-compact-browser` in WebKit, same assertion).

- **2026-10-21 1.2.5 (46), universal:** iPhone joins the iPad app (see Now). Uploaded to TestFlight with the API key,
  not submitted; 1.2.4 (45) untouched in review. Tests: `apps/ipad` 22/22; `reading-zen-ipad`,
  `reading-workspace-bottom-dock`, `reading-phone-browser` all pass in Chromium and WebKit before and after.

- **2026-10-21 v235:** iPad whole-page highlight fixed (see Now): `touchSelectionSnapGuard` keeps the last good
  selection through WebKit's handle snaps, clears selections that start snapped, and the Pencil highlighter starts
  within 20 px of the words. Found in the iOS Simulator (iPad Pro 13-inch, Safari) with a local debug beacon (not
  committed). New test `reading-touch-selection-snap` (11; 8 fail on v234). Regression: 85 suites x 2 engines (the v234
  list plus every test with an iPad/iPhone user agent or the native flag): 162/170 in parallel; the 8 others rerun
  alone fail identically on main 66588611 (`reading-pdf-ink` Zen-dock checks, `reading-workspace-paper-color` and
  `-paper-edge` harness exits, `reading-zen-compact-browser` in WebKit) or pass alone on both (`reading-book-guide`).

- **2026-10-21 v234:** Night light, the one-page curl's mirrored underside, and the cross-page selection clamp (see
  Now). New tests: `reading-night-light` (26), `reading-book-curl-showthrough` (16; 2 failed on v233),
  `reading-selection-page-clamp` (8; the desk case failed on v233 in both engines). Regression: 45 neighbouring suites
  (selection, highlight, pencil, Android, book/curl, paged, Spotlight/guide, text layer, look-up, marker, Zen, and
  every test touching the theme, comfort or paper settings) in Chromium and WebKit: 86/90 run in parallel. The rest:
  `reading-pdf-ink` (its three Zen-dock checks expect seven controls, as on v233), `reading-zen-compact-browser` in
  WebKit (fails on main too), and `reading-vertical-book-flow` (Chromium) and `reading-pencil-highlight` (WebKit),
  which failed once under parallel load and pass alone on both v234 and main.

- **2026-10-21 v233:** web iCloud opt-in, journal iCloud sync through reading.html, Drive timeouts, slow-network
  shells (see Now). New tests: `journal-icloud` (26), `offline-shell-slow-network` (5), `reading-gdrive-unreachable`
  (4); `reading-icloud-web` adds the opt-in (25, now runs in WebKit too). Full suite: Chromium 140/144, WebKit
  139/145; the failures are `reading-pdf-ink` (3 Zen-dock checks), `reading-split-undo-browser`,
  `reading-workspace-paper-color` (they expect no `zenListen`) and `reading-workspace-paper-edge` (timeout), all
  failing the same way on origin/main 32f7ba8e, as does `reading-zen-compact-browser` in WebKit (twice on main);
  and `reading-cloud-auto-sync`, whose harness needed the new `gdriveQuietUntil` (fixed, 25/25). The sync, iCloud and
  Drive tests were rerun on the final code in both engines. iPad bundle 21/21.
  CloudKit Console: read only (Claude's safety check refused a new token and a Development record type).

- **2026-10-20 iPad 1.2.4 (45):** re-archived with v232, uploaded via API key, version 1.2.4 (manual release) submitted, Waiting for Review.

- **2026-10-20 v232:** PR #75's four regression fixes re-landed (see Now); its four checks pass on Chromium and WebKit.

- **2026-10-20 v231:** Spotlight as a magnifying glass: no blur, lighter wash, copy steps aside while scrolling, glass rim (see Now).
  `reading-spotlight-guide` 22/22 on Chromium and WebKit.

- **2026-10-20 v230 + iPad 1.2.4 (45):** reviewed `phloem-spotlight-guide` and merged it to `main` with PR #78 and
  the 1.2.4 (45) bump. `reading-spotlight-guide` 19/19 on Chromium and WebKit; guide/Zen/Listen neighbours match
  `main` (`reading-guide-pen-controls` and `reading-zen-default-browser` fail on both; `reading-zen-compact-browser`
  and `reading-voice-focus-browser` flake on both, pass or fail run to run). iPad bundle 21/21. Archive 1.2.4 (45)
  verified (version, build, reader v230 inside).

- **2026-10-16 v229:** handwriting on sticky notes, Write by default (see Now). `reading-sticky-handwriting` 34/34
  and `reading-pdf-sticky-notes` 55/55 on Chromium and WebKit; iPad bundle 21/21. Suite: Chromium 137/141, WebKit
  137/141; the four failures (`reading-pdf-ink`, `reading-split-undo-browser`, `reading-workspace-paper-color`,
  `reading-workspace-paper-edge`) fail the same way on v228. Running both engines' suites at once makes tests with a
  fixed port collide (`keeps-browser`/`pdf-ink` share 8167); run them one engine at a time.

- **2026-10-16 v228:** Listen: PDF highlight survives text-order differences and marks only the sentence; the
  pin alone moves the voice; figure labels and their captions are not read. Checked on the real Taiz & Zeiger
  chapter in WebKit at iPad size (every sentence on book p. 48 marked; none before).

- **2026-10-15 1.2.3 (43, 44):** 43 = v225 + the voice-name fix, uploaded 21:47; 44 = v227 + v226, uploaded 22:36,
  attached to the new 1.2.3 version (What's New and review notes rewritten for 1.2.3, notes 3,979 of 4,000; the
  reviewer key line left as it was) and submitted 22:45 EDT (manual release). PR #77 merged (1.2.2 live); PR #78
  open for 1.2.3. `apps/ipad` tests 21/21; archive 44 carries `app: 1.2.3 (44)` and `reading.js?v=227`.

- **2026-10-15 v227:** play pin for Listen's start, 1×-centred speed slider (0.5×–2×), round page-layout button (see
  Now). `reading-voice-browser` (mouse on Chromium and WebKit, touch on Chromium), `reading-voice-focus-browser`,
  `reading-voice-quality-browser`, `reading-phone-browser` on both engines; touch drags in the iPad simulator.

- **2026-10-15 v226:** Listen offers only on-device voices (`localService !== false`): Chrome's Google voices and
  Edge's Online (Natural) voices are hidden; Windows voice guide rewritten for voices on the PC (see Now). Voice tests
  (unit + three browser suites, Chromium and WebKit) pass.

- **2026-10-15 v225:** Listen: native voices in the iPad app (PhloemSpeech, needs build 1.2.3), never-greyed voice menu,
  Safari's voice limit explained, spoken sentence focused and followed (reader + PDF), guide follows the voice, Listen
  on the dock, speed slider (see Now). Simulator build of `apps/ipad` compiles with the plugin; not yet run on a device.

- **2026-10-14 v224:** phone layout (see Now). iPad bundle tests 19/19; the submitted iPad build 42 bundles v223 and
  is untouched.

- **2026-10-14 1.2.2 (42):** archived from the release branch merged with v223, uploaded, attached to the new 1.2.2
  version and submitted for review (manual release). `apps/ipad` tests 21/21; bundle `app: 1.2.2 (42)`, `reading.js?v=223`.
- **2026-10-14 v223:** Listen hides Apple's novelty voices (Bahh, Whisper, Bad News, Zarvox…) and the robotic Eloquence
  voices (Eddy, Grandma, Rocko…) after Houfu called them creepy; each person is listed once in their best quality, under
  Natural / Basic groups. The voice guide says Read & Speak (iPadOS/macOS 26 name). Tests: `reading-voice` 10/10 with
  Houfu's Mac voice list; voice browser tests on Chromium and WebKit.
- **2026-10-14 v222:** Listen's natural-voice guide and auto-switch. Tests: `reading-voice` 10/10,
  `reading-voice-quality-browser` (iPad, back-from-Settings, Android) and `reading-voice-browser` on Chromium and WebKit.

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
