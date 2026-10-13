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
