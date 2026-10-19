# Phloem status and handoff

The one place to see where Phloem stands and what's next. Every session that changes
Phloem (by hand or by a scheduled task) updates this file in the same push. Newest first
under **Log**. Keep it short; link to commits and files instead of copying them.

## Now (2026-10-19)

- **Spotlight guide, v230 (branch `phloem-spotlight-guide`, NOT merged; Houfu: "for the guide make another mode …
  circular spotlight effect on a certain part, mag 1.1x … dim or blur the outside parts"). Waiting for another agent's
  review before it goes to `main`.** The guide's shape picker (Settings "Shape", and new Rows | Columns | Spotlight
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
  **Review points:** (1) WebKit/iPad: Playwright WebKit (and so maybe iPad Safari) does **not** apply
  `backdrop-filter` under a CSS mask, so there the outside is dimmed but **not blurred** (Chromium blurs). Options:
  accept dim-only on iPad, or blur via a filtered copy instead. Needs a look on a real iPad. (2) The blur sits on a
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

- Register this Mac as a development device so the iPad app runs on it ("Designed for iPad") with the Mac's Premium
  voices? Free; it adds the Mac ("pls_dont_change") to the developer account's device list. Until then a Premium
  voice in the app is checked only on the iPad through TestFlight.

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
