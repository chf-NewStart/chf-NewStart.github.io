# Phloem status and handoff

The one place to see where Phloem stands and what's next. Every session that changes
Phloem (by hand or by a scheduled task) updates this file in the same push. Newest first
under **Log**. Keep it short; link to commits and files instead of copying them.

## Now (2026-10-12, late)

- **Web:** houfu72.com/reading.html serves **v209**.
- **App Store:** Phloem: Paper Reader **iOS 1.2.0 live**. 1.2.1 is being prepared by the
  scheduled task below. A macOS 1.0 draft exists; leave it alone.
  The EU trader status (Digital Services Act) is missing in App Store Connect, and only
  Houfu, as Account Holder, can fill it in.
- **Other apps (App Store Connect, 2026-10-12):** Game Life iOS 1.0 live; Qi: Go & Gomoku iOS
  1.0 live; Plank Pilot 1.0 not submitted; Manilha 1.0 **Rejected**.
- **Local checkout warning:** `~/Desktop/houfu0702.github.io` `main` has diverged from
  `origin/main` (rewritten history) and holds Houfu's uncommitted work. Work in a worktree
  from `origin/main`; do not reset or stash his checkout.

## Scheduled

**`phloem-appstore-update-school-promo-demo`**, one-time, **2026-10-13 00:55** (needs the
Claude desktop app open). Prompt and attachments live in
`~/.claude/scheduled-tasks/phloem-appstore-update-school-promo-demo/` (`SKILL.md`, the
large-book PDF, the eLife demo paper, the iPad freeze video, the tester screenshots). In
order:

1. **iPad freeze after a stroke** (gates the App Store submission). It freezes with a 573-page,
   33 MB book open but not with a 16-page paper. Suspects: the idle save about 1.2 s after
   the pen lifts, which serializes the whole library; a sync started after the save; per-page
   work on pen lift.
2. **Waterloo school-fit:** remove DeepSeek (Waterloo IST lists it as "Problematic"), add an
   AI data note, quick accessibility fixes, and tuck the Workspace divider under the Reading
   settings sheet (Android tester: a visual bug only).
3. **iOS 1.2.1:** test every fix since 1.2.0 in light and dark mode on the simulator,
   then submit with **manual release** (Houfu presses Release).
4. **UWaterloo promo kit:** drafts only, in `output/phloem-school-promo-2026-10/`.
5. **Websites and CV:** houfu72.com and lifegameproject.com list **Game Life first, then Qi**,
   then Plank Pilot and Manilha, with true statuses. Add the Phloem name story. CV gets one
   line on shipped apps.
6. **Demo video:** uses the eLife Münch paper (CC BY, credited), built around the name story.

If it runs out of time, it schedules its own follow-up and records it here.

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

- Was the iPad freeze in the App Store app or the Home Screen web app? Does it go away with
  iCloud sync off?
- EU trader status in App Store Connect.
- Manilha was rejected: read App Review's message and decide on a fix.
- The FAW-Volkswagen dates conflict between the site and the CV.

## Log

- **2026-10-12 v209** (`ccbab5e6`): the Workspace ink kept falling behind the pen on Android.
  Every pen sample re-validated the whole saved Workspace twice, and paper growth re-smoothed
  every stroke. The fix: a bounds check before `context()`, a per-object validation cache,
  and outlines in sheet units. Regression test in `tests/reading-workspace-ink-cache.test.js`.
- **2026-10-12 v203–v208** (other sessions): fast Workspace ink on full sheets, white ink in
  the dark theme, export annotated PDF, the WebKit link-tap fix, the portrait Workspace dock,
  sticky notes on PDF pages.
