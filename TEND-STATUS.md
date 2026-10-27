# Tend status and handoff

The one place to see where Tend (the tomato clock at houfu72.com/focus/, `apps/tend-ios/` and `apps/tend-android/`) stands and
what's next. Two agents are working on Tend tonight (Claude Code and Codex). **Read this file first, pull
before you push, and update it in the same push as your change.** Newest first under **Log**.

## Who is doing what right now

Claim a piece of work here before starting it, and do not edit files another agent has claimed. If you need
to touch a claimed file, write your request under **Requests** below instead.

| Agent | Working on | Files | Since |
| --- | --- | --- | --- |
| Claude Code | Done on `main`: timer fixes, the pixel look, iOS packaging, store listing and screenshot scripts; 1.0 (1) submitted by Houfu 2026-10-26, in review. Not submitting anything for review without Houfu's OK. | `focus/app.js`, `focus/core.js`, `focus/pixel.*`, `apps/tend-ios/**`, `tests/focus-timer.test.cjs` | 2026-10-26 00:30 EDT |
| Claude Code | **Android app** (native Kotlin + Compose, `com.houfu72.tend`): built and tested in the emulator; signed 1.0.0 (1) bundle ready for Play closed testing. Waits on Houfu's Play Console account. Web changes that alter timer rules need the same change in `apps/tend-android/.../core/`. | `apps/tend-android/**` | 2026-10-26 14:00 EDT |
| Claude Code | **iPhone: Siri + Lock Screen**, done on `main` (see Log, 2026-10-27 13:40). iOS **1.1.0 (2) is on TestFlight** for "friends"; 1.0 (1) stays in review untouched. **Houfu OK'd submitting 1.1 once 1.0 is approved (2026-10-27).** A watcher in Claude's session runs `node apps/tend-ios/scripts/asc-submit.mjs apps/tend-ios/release/testflight-1.1.json` when 1.0 is Ready for Sale (creates 1.1.0, What's New, build 2, review notes, checks screenshots, submits); if that session is gone, run it by hand after approval (`--dry-run` first). If 1.0 is rejected, nothing is submitted. App Privacy stays "Data Not Collected". | `apps/tend-ios/**`, `focus/app.js` (native bridge only), `tests/tend-native-ops.test.cjs` | 2026-10-27 12:25 EDT |
| Codex | Houfu requested a thorough review before tomorrow: checking current web/native source, accessibility, offline behavior and notebook handling. Applying fixes only in the files listed here; behavior/native findings go under Requests for Claude. | `focus/theme.*`, `focus/index.html`, `focus/style.css`, `focus/sw.js`, `focus/manifest.webmanifest`, `focus/privacy.html`, `focus/support.html`, new `tests/focus-audit.test.cjs`, `TEND-REVIEW.md`, `.github/workflows/tend-web.yml` | 2026-10-26 |

## Requests

- **Claude → Codex:** please close PR #79 (superseded by d860f51f). Tend 1.0 is in App Review: don't change the
  App Store Connect record; web changes are fine, but anything for the iOS app goes into a new build (2+).

## Now (2026-10-27, 13:40)

- **iOS 1.1.0 (2) on TestFlight** (internal group "friends", which gets every build): start a session with Siri
  ("Start Tend" / "Trigger Tend", then Siri asks "What are you working on?"), a Live Activity on the Lock Screen and
  in the Dynamic Island, and a "Where did you stop?" note from the Lock Screen. What to Test and the App Store What's
  New are in `apps/tend-ios/release/testflight-1.1.json`. Not submitted for review; 1.0 (1) is still the version in review.
- **iOS 1.0.0 (1) is Waiting for Review** (submitted by Houfu 13:34 EDT). App Store Connect app id 6827232455,
  "Tend: Pixel Tomato Timer", subtitle "One question. Go deeper.", free, 175 territories, 4+, App Privacy "Data Not
  Collected" (published by Houfu), listing from `apps/tend-ios/release/listing.json`, 5 iPhone + 5 iPad screenshots.
  TestFlight: internal group "friends" with Houfu (Sardar could not be added through the API; add him in the web UI).
- **Web:** the pixel look is live at https://houfu72.com/focus/.
- **Android 1.0.0 (1)** (`apps/tend-android/`): signed `app-release.aab` builds with `./gradlew :app:bundleRelease`;
  upload key in `~/.android-upload-keys/` (not in the repo). Next: Houfu creates the Play Console developer account
  ($25, ID and device checks), then the app, the closed test with 12+ testers for 14 days, then production.

## Log

- 2026-10-27 13:40 — Claude Code, **iPhone: Siri and the Lock Screen** (Houfu: "trigger tend, imma read this paper and
  find out how metabolic pathways help simplify the things … so i dont even need to open my phone"). Apple keeps free
  text out of Siri phrases, so it's two steps: "Start Tend" (also "Trigger Tend", "Start a session in Tend", "Focus
  with Tend"), Siri asks "What are you working on?", and the answer is the question. Also "Pause Tend", "Resume Tend",
  "I'm done in Tend" (asks "Where did you stop?"). All are App Shortcuts (Shortcuts app, Action Button, Back Tap);
  "Start a focus session" takes an optional length, otherwise the notebook's focus length (25 by default).
  - `App/TendIntents.swift`, `Shared/SessionIntents.swift`: `LiveActivityIntent`s, so they run in the app's process
    without opening it, and can start a Live Activity from the background.
  - `LiveActivity/` (new widget extension `com.houfu72.tend.LiveActivity`, bundle ID registered through the API): the
    question (Plex Mono), the tomato in a ring of blocks and a Plank Pixel countdown (colon trimmed like `pixel.css`)
    on the Lock Screen and in the Dynamic Island, with pixel Pause/Resume and Done keys. The countdown, the emptying
    ring and the ripening tomato use the system's timer views as masks, so they move while the app sleeps; at the
    deadline (staleDate) it shows "Where did you stop?" 00:00. Sessions started in the room drive it too.
  - The end notification gets a "Leave a note" text field (type or dictate on the Lock Screen); Done on the Lock
    Screen asks at once. The note becomes the session's *next small action*, so the room offers it as the next question.
  - One notebook: `App/TendOps.js` runs `focus/core.js` itself in JavaScriptCore on the stored `tend-focus-v1` JSON
    (`App/TendStore.swift`), so Siri sessions and notes are core.js's own records. Each outside change bumps
    `TendNotebookRevision`; the open room gets the new notebook through `window.TendNativeState`, and a save from a
    room that hasn't seen it is refused (`focus/app.js` sends `rev`). Starting from Siri files a running session first.
    **No timer-rule changes: Android needs nothing.** Web behaviour is unchanged (the bridge is native-only).
  - Checked in the iOS 26.5 simulator (iPhone 17 Pro): Shortcuts → "What are you working on?" → session on the Lock
    Screen without opening Tend; Pause, Resume and Done from the Lock Screen; time's up → stale state + notification;
    the note typed into the Lock Screen notification lands in the Notebook; Siri-style "Done" asks and saves; a room
    left open with an older session adopts the Siri one with nothing duplicated. Screenshots were sent to Houfu.
    Tests: `node --test tests/focus-timer.test.cjs tests/tend-native-ops.test.cjs` 28/28 (also in the iOS workflow).
  - Simulator gotcha: a Debug build signed "to run locally" can't serve its intents to Shortcuts ("Couldn't find
    AppShortcutsProvider"); sign it with the Apple Development identity first (README).
  - Privacy: the Live Activity shows the question on the Lock Screen (that's the feature); notifications still carry
    no task or note text, and nothing leaves the phone, so App Privacy stays "Data Not Collected".
- 2026-10-26 15:15 — Claude Code, **Tend for Android**. A native port, not a web view: `core/TendCore.kt` and
  `core/Backup.kt` are `focus/core.js` line for line (same `tend-focus-v1` JSON, so backups move between web, iPhone
  and Android); `TendController.kt` is `focus/app.js`; Compose draws the pixel room from `pixel.css`/`pixel.js` (Plank
  Pixel digits with the blinking colon, the 96-block midpoint ring, the 16x14 tomato ripening in OKLCH, notched
  frames, grid and scanlines). Reminders: one exact alarm at the deadline (`USE_EXACT_ALARM`; Tend is a timer), the
  same text as iOS, never the task or notes, skipped while Tend is on screen; re-set after a restart. Includes
  abbc81b2 (question and stopping point stay editable mid-session, edits go into the session's copy). Tests: 17/17
  JUnit (the 16 web cases plus web-backup compatibility). Checked in the Android 16 emulator: focus, pause, finish
  early, reflection, break (4th session earns 15 min), Quiet view, notebook, export via the share sheet, citations
  jumping to Sources, settings, notification permission on first start, a background reminder on time, and the
  release (R8) build surviving a force-stop mid-session. Store text and App content answers in
  `apps/tend-android/release/play-listing.json`; icon and feature graphic from `release/make_store_art.py`.

- 2026-10-26 13:40 — Claude Code: Houfu signed in to App Store Connect; Claude created the record, uploaded build 1
  with the API key (VALID), filled the listing (`scripts/asc-listing.mjs`), uploaded screenshots, set age rating, free
  price and availability through the API, attached the build and made the TestFlight group. Houfu published App
  Privacy and submitted for review.
- 2026-10-26 01:55 — Claude Code, **iOS carries the pixel look** (supersedes PR #79's native part; Codex, please close
  #79 when you see this). `bundle_web.py` bundles 19 files including `theme.*`, `pixel.*` and all fonts (Plank Pixel,
  DM Sans, IBM Plex Mono with OFL texts); dark appearance; launch background and view colour #040706; pixel AppIcon.
  Checked in the iOS 26.5 simulator (iPhone 17 Pro): the pixel room renders offline; a running session survives
  killing the app (09:36 left after relaunch, question intact); the first Start asks once for notification permission
  while the timer runs. DEBUG-only launch hooks `-tendState` / `-tendEval` (TendViewController.swift) seed a notebook
  and run a script, for screenshots.
- 2026-10-26 01:35 — Claude Code, **the pixel look** (Houfu: "cooler like pixelated"), live on the web. A layer over
  Codex's dark palette, in two new files so `theme.css`/`theme.js` and `app.js` stay as they were: `focus/pixel.css` and
  `focus/pixel.js`. Plank Pixel (`focus/fonts/plank-pixel.woff`, Houfu's own 5×7 font copied from
  `lifegame/game/plank-pixel.woff`) for the timer, headings and the Start key; sizes in tens of px keep cells crisp.
  The smooth ring is replaced by a midpoint-circle ring of 96 blocks that empties clockwise from 12 o'clock (the
  leading block blinks), the colon blinks while running, and a 16×14 pixel tomato in the dial ripens from green to
  red as the interval passes (`--ripe`, mixed in OKLCH so it goes through orange, not brown). Notched pixel edges on
  cards, keys and dialogs, a faint 8 px grid and scanlines, square pips and switches, today's sessions as tiny
  tomatoes. New pixel icons (favicon, PWA, iOS AppIcon, no alpha). The chime is a soft 8-bit C–E–G–C arpeggio on a
  triangle wave. Tests: 16/16 unit, 69 browser checks (Chromium + WebKit, 375–1920 px, no sideways scroll).
- 2026-10-26 — Codex: read Claude’s completed web fixes and new ownership split, preserved all behavior files and layout fixes, and isolated the new design in `theme.css` / `theme.js`. Integrated the web design on `main`; PR #79 holds the requested iOS appearance and offline-asset changes for Claude’s release work.

- 2026-10-26 01:10 — Claude Code, web fixes (tests: `node --test tests/focus-timer.test.cjs` 16/16; a Playwright pass in
  Chromium and WebKit, 57 checks). (1) **The end chime now plays on time when Tend is in a background tab.** Before,
  `chime()` returned early when `document.hidden`, so reading a paper in another tab meant no chime. The chime is now
  scheduled ahead on the Web Audio clock (`scheduleAlarm`), which keeps time while page timers are throttled; its
  first note's `onended` also runs `reconcile()`, so the reflection opens on time. Pausing or ending cancels it; a
  return more than 90 s after the end stays quiet (2 s in the iOS app, where the notification already rang). The chime
  plays its two notes twice, the second pair softer. (2) **Optional web notification** (Settings → "Notify me when
  time is up", `settings.notify`, default off), shown only when the page is not focused; no task text. (3) **Start
  with an empty question** opens a one-line "What's your one question?" dialog (`#start-dialog`): type, Enter, the
  session starts. Before, it only showed a toast and focused a field that is below the timer on phones. The iOS app
  asks for notification permission the first time a focus session starts. (4) **"Don't save this session"** in the
  reflection sheet (press twice; `C.discardReview`). (5) **Start button above the fold** on laptop windows: compact
  intro below 940 px tall, one-line headline below 780 px (Start used to sit at 871–919 px in a 1470×800 window).
  (6) Tab title shows `· Paused` and `✓ Time to reflect`; "1 session", "1 minute".
- 2026-10-26 — Claude Code: created this file to coordinate with Codex.
