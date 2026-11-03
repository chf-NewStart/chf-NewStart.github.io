# Tend status and handoff

The one place to see where Tend (the tomato clock at houfu72.com/focus/, `apps/tend-ios/` and `apps/tend-android/`) stands and
what's next. Two agents are working on Tend tonight (Claude Code and Codex). **Read this file first, pull
before you push, and update it in the same push as your change.** Newest first under **Log**.

## Who is doing what right now

Claim a piece of work here before starting it, and do not edit files another agent has claimed. If you need
to touch a claimed file, write your request under **Requests** below instead.

| Agent | Working on | Files | Since |
| --- | --- | --- | --- |
| Claude Code | **Warm-up and rest** (Houfu: "add some daily challenges which could train the focus", then "something that makes me happy and less dizzy"), done on `main` (Log, 2026-11-03). Web and Android checked; **iOS 1.1.0 (7) on TestFlight** (not run in a simulator: CoreSimulator out of date on this Mac). **1.1.0 (7) submitted for review 2026-11-03 13:28 EST with Houfu's OK ("Looks right, submit"): Waiting for Review, releases automatically after approval** (review submission 97edf9f7-6dda-4a4b-92cb-96028e62d3c9). | `focus/daily.*`, `tests/tend-daily.test.cjs`, the strip and dialog in `focus/index.html`, backup export/restore in `focus/app.js`, `focus/sw.js` cache list, `apps/tend-ios/App/TendViewController.swift` (`dailySave`, `TEND_DAILY_STATE`), `apps/tend-ios/release/*`, `apps/tend-android/**/DailyActivity.kt`, `core/Daily.kt`, `core/Backup.kt`, `FocusRoom.kt` strip | 2026-11-03 11:00 EST |
| Claude Code | Done on `main`: timer fixes, the pixel look, iOS packaging, store listing and screenshot scripts; 1.0 (1) submitted by Houfu 2026-10-26, in review. Not submitting anything for review without Houfu's OK. | `focus/app.js`, `focus/core.js`, `focus/pixel.*`, `apps/tend-ios/**`, `tests/focus-timer.test.cjs` | 2026-10-26 00:30 EDT |
| Claude Code | **Android app** (native Kotlin + Compose, `com.houfu72.tend`): built and tested in the emulator; signed 1.0.0 (1) bundle ready for Play closed testing. Waits on Houfu's Play Console account. Web changes that alter timer rules need the same change in `apps/tend-android/.../core/`. | `apps/tend-android/**` | 2026-10-26 14:00 EDT |
| Claude Code | **Quick timers and Do Not Disturb**, done on `main` (Log, 2026-10-27 15:00); iOS 1.1.0 (3) on TestFlight. **App blocking during sessions** (Screen Time; Houfu chose "Done unlocks"): Apple approved Family Controls (Distribution) for the account on 2026-10-27 (request QQUXWQ76W5), merged to `main`, **1.1.0 (4) on TestFlight; Houfu tested the block on his iPhone ("nice it works")**, so 1.1's review submission now uses build 4 (What's New and Screen Time review notes in `apps/tend-ios/release/testflight-1.1.json`). Shielding doesn't silence the blocked apps' notifications, and iOS has no API for an app to mute others or turn on a Focus: a Focus stays the person's (or a shortcut's) switch. | `focus/core.js`, `focus/app.js`, `tests/*`, `apps/tend-ios/**`, `apps/tend-android/**` | 2026-10-27 14:20 EDT |
| Claude Code | **iPhone: Siri + Lock Screen**, done on `main` (see Log, 2026-10-27 13:40). iOS **1.1.0 (2) is on TestFlight** for "friends"; 1.0 (1) stays in review untouched. **Houfu OK'd submitting 1.1 once 1.0 is approved (2026-10-27).** A watcher in Claude's session runs `node apps/tend-ios/scripts/asc-submit.mjs apps/tend-ios/release/testflight-1.1.json` when 1.0 is Ready for Sale (creates 1.1.0, What's New, build 2, review notes, checks screenshots, submits); if that session is gone, run it by hand after approval (`--dry-run` first). If 1.0 is rejected, nothing is submitted. App Privacy stays "Data Not Collected". | `apps/tend-ios/**`, `focus/app.js` (native bridge only), `tests/tend-native-ops.test.cjs` | 2026-10-27 12:25 EDT |
| Codex | Houfu requested a thorough review before tomorrow: checking current web/native source, accessibility, offline behavior and notebook handling. Applying fixes only in the files listed here; behavior/native findings go under Requests for Claude. | `focus/theme.*`, `focus/index.html`, `focus/style.css`, `focus/sw.js`, `focus/manifest.webmanifest`, `focus/privacy.html`, `focus/support.html`, new `tests/focus-audit.test.cjs`, `TEND-REVIEW.md`, `.github/workflows/tend-web.yml` | 2026-10-26 |

## Requests

- **Claude → Codex (2026-11-03):** your 2026-10-26 review claim lists `focus/index.html` and `focus/sw.js`; nothing has
  landed there since 10-27, so the warm-up added a strip, a dialog and cache entries to them. Say so here if that collides.
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

- 2026-11-03 15:15 — Claude Code: Houfu asked whether people can choose a task and whether a replay on the same day
  is different. Every play already drew new positions and orders (checked in the browser: three plays of Track put
  the ripe tomatoes in three different places), except Count the seconds, which was always 10, 15 and 25 s; it now
  draws 7–12, 13–19 and 20–28 s each play (still shortest first, so "a little longer each time" holds). The home
  view now shows all six tasks right under today's ("Pick any task", was "Practice any" below Rest), says any can
  be played as often as you like and that today's task is the one that adds to the streak, and marks it "Today".
  Breaks still put Rest first. **Not in iOS 1.1.0 (7)**: the next build's review and TestFlight notes should say
  "Pick any task" instead of "Practice any".

- 2026-11-03 14:00 — Claude Code: Houfu asked whether the task really changes each day and when Tend is opened.
  Checked with the page's clock moved: opening on 4 Nov shows Only the ripe, on 5 Nov Middle arrow (strip and
  dialog). Two gaps fixed on the web (`focus/daily.js`): a room left open across midnight kept yesterday's task in
  the strip until something repainted it (now a 30 s day check, plus `tend-resume`, refreshes the strip and an open
  home view), and a task started before midnight and finished after was checked against the new day's task, so it
  didn't count for the streak (it now counts for the day it was started). **Not in iOS 1.1.0 (7)**, which is in
  review: it goes in the next build. Android's native strip already follows the clock; its page gets the fix at the
  next build.

- 2026-11-03 13:30 — Claude Code: Houfu tried build 7 and said "Looks right, submit". `asc-submit.mjs` created 1.1.0
  (release after approval, like 1.0), set What's New and the warm-up-first listing, put the Lock Screen screenshot
  first, attached build 7, carried 1.0's review contact and notes over below the new ones, and submitted: **1.1.0 (7)
  is Waiting for Review**. 1.0.0 stays Ready for Sale until 1.1 is approved.

- 2026-11-03 13:20 — Claude Code: Houfu on the Siri question: "do whatever u think is good". **Siri stays** (the App
  Shortcuts also run the Do Not Disturb shortcut, the Action Button and the Live Activity buttons) **but stops being
  the pitch**: `release/listing.json` (promo, description, keywords) and `testflight-1.1.json` (What's New, review
  notes) now lead with the warm-up and rest, then the thread and app blocking; Siri and the Action Button are one
  line. The description says the warm-up is not a medical or diagnostic test and claims no more than "practice makes
  you better at each one" (brain-training claims are what regulators go after). Houfu, trying it: "for correct one
  for only the ripe should there be some feedback". Only the ripe now answers every trial (green glow on a tap on
  red, "Held" for holding still on green, "Hold on green" for a tap on green), and the board's flash in every task is
  a steady 260 ms glow (the stepped animation showed full colour for ~60 ms). Backups now carry the warm-up under
  `daily` on all three platforms (restore replaces it when present; older readers ignore it). Builds 6 and 7
  uploaded; `build` in `testflight-1.1.json` is 7 and the dry run passes.

- 2026-11-03 12:30 — Claude Code, **warm-up and rest**. A strip under the room's cards (hidden while a session runs)
  offers today's warm-up: one of six 1–2 minute attention tasks, rotating at local midnight (`challengeFor`: days
  since 1970 mod 6): Track the ripe ones (multiple-object tracking, Houfu's idea), Only the ripe (SART go/no-go),
  Middle arrow (flanker), Ink not word (Stroop), Two back (spatial 2-back), Count the seconds (time estimation). Each
  names the brain system it works, scores 0–100 and keeps a best; finishing the day's task grows a streak. During a
  break the strip offers rest instead: Sigh it out (cyclic sighing, Balban et al. 2023), Look far away (20-20-20, the
  room's arpeggio scheduled on the audio clock plus a haptic), One good thing (a dated note, kept to read back;
  Seligman et al. 2005). One implementation in `focus/daily.js`, which exports its pure parts for
  `tests/tend-daily.test.cjs`. **Storage:** web `houfu.tend.daily.v1`; iOS `TendDailyV1` in UserDefaults (bootstrapped
  as `TEND_DAILY_STATE`, saved via `dailySave`); Android `tend-daily` SharedPreferences via `TendAndroidDaily`. Not
  in the notebook backup yet (privacy page says so). **Android:** the strip is native; the tasks run in
  `focus/daily.html` inside `DailyActivity` (copied into assets by `copyDaily`). Checked in the emulator: strip, break
  strip, rest page, save to SharedPreferences, Done back to the room. **iOS 1.1.0 (5)** (the warm-up on top of build 4)
  archived and uploaded to TestFlight with the API key; What to Test is `testflight.5` in `testflight-1.1.json`.
  **1.1 is still not submitted:** 1.0.0 is Ready for Sale, but the watcher that was to submit 1.1 never ran. Its
  What's New and listing lead with Siri, so it waits for Houfu's call on Siri (below) and his OK on build 5. **iOS:** Debug simulator build succeeds; not run,
  because `simctl` hangs ("CoreSimulator is out of date", Xcode 27.2): `sudo xcodebuild -runFirstLaunch` or opening
  Xcode once should fix it. **Houfu on Siri (same day):** "the siri thing is just stupid, I could just ask Siri for a
  timer". Undecided: the App Shortcuts also drive the Do Not Disturb shortcut and the Action Button, so the choice is
  between dropping Siri from the listing's lead (keep the intents) or removing it in the next version.

- 2026-10-27 16:15 — Claude Code: Houfu OK'd build 4 for 1.1 and asked "how is our app special"; then "do what u
  think is reasonable". The 1.1 listing now leads with what's distinctive: the question → "where did you stop" →
  next question thread, starting by voice and staying on the Lock Screen, and locking distracting apps
  (`apps/tend-ios/release/listing.json`: description, promotional text, keywords; name and subtitle unchanged).
  A new first iPhone screenshot shows the session on the Lock Screen (`~/Desktop/Tend-App-Store-Screenshots/
  iphone-6.3/0-lock-screen.png`, 1206×2622 like the others). `asc-submit.mjs` applies the listing text and adds
  that screenshot first when it creates 1.1 (a failed upload is cleaned up and never holds up the submission).
  1.0's record is untouched while it's in review.

- 2026-10-27 15:40 — Claude Code, **app blocking during focus sessions**, on branch `claude/tend-block-apps` (pushed,
  not merged: an App Store build carrying `com.apple.developer.family-controls` can't be exported until Apple
  approves Houfu's request QQUXWQ76W5). Room Settings (iPhone only) gets "Block apps while you focus → Choose apps":
  Screen Time permission, then Apple's FamilyActivityPicker (Tend only ever holds opaque tokens). `App/Blocking.swift`
  shields the chosen apps, categories and sites while a *focus* session runs (Siri, Lock Screen or room; not breaks or
  quick timers) and lifts it on pause, Done or the end. New extensions: `ActivityMonitor/` (lifts the block at the
  deadline while Tend sleeps; DeviceActivity needs a 15-minute window, so a shorter session's window starts in the
  past) and `Shield/` ("Tend is on" with the pixel tomato). Simulator: builds, the row shows, Choose apps brings up
  Apple's Screen Time permission flow (stopped at the OS passcode prompt). **Not yet tested: the block itself, which
  needs a real iPhone.** Apple approved the same afternoon: `com.houfu72.tend.ActivityMonitor` and `.Shield`
  registered through the API; the public API can't enable Family Controls (a managed capability), but the
  `-allowProvisioningUpdates` archive turned it on for all three App IDs. 1.1.0 (4) archived, exported and uploaded.

- 2026-10-27 15:20 — Claude Code: Houfu tried build 3 ("tried it, good") and asked for Do Not Disturb done for him.
  A ready-made **Tend focus** shortcut (`apps/tend-ios/scripts/make_focus_shortcut.py`, signed with `shortcuts sign
  --mode anyone`; Start a focus session → Set Focus: Do Not Disturb on until the session's end) is in his iCloud
  Drive. Checked in the simulator: it imports, asks "What are you working on?", starts the session and the Lock
  Screen shows the session with Do Not Disturb on. **1.1 now submits build 3** once 1.0 is approved (What's New
  and review notes in `apps/tend-ios/release/testflight-1.1.json` mention lengths, quick timers and Shortcuts).
  Houfu's verdict on his phone: Siri hears "Tend focus" as "10 focus", and the renamed shortcut's typed question box
  plus the one-time Allow prompt felt clumsy, so he keeps plain **"Trigger Tend"**. Do Not Disturb from Tend's own
  command isn't possible on iOS; the one-command way to cut distractions is app blocking (Family Controls request).
- 2026-10-27 15:00 — Claude Code, **quick timers and Do Not Disturb** (Houfu: "add gym plank 90s … any length you
  say"; "block the notif … when tend is on"). **Timer-rule change, mirrored on Android.**
  - `focus/core.js`: a third timer phase, `quick` (`C.quickTimer(label, ms)`): it ends like a break (no reflection,
    not recorded, no long-break count) and carries its own label, so the room's question stays. Restore keeps
    lengths down to 5 seconds (was 1 minute). `apps/tend-android/.../core/TendCore.kt` + `Backup.kt` mirror it;
    the Android room, toast and reminder text know quick timers (20/20 JUnit, 3 new incl. an iPhone backup).
  - `App/TendOps.js`: a length at the start or end of Siri's answer sets the session length: "plank 90 seconds",
    "90 second plank", "read this paper for 50 minutes", "wall sit a minute and a half"; units spelled out, so
    "90s music" and "take a second look" stay questions. Under 5 minutes it's a quick timer; a bare "50 minutes"
    continues the room's question. Room (`focus/app.js`), Live Activity ("KEEP GOING" → "TIME'S UP") and the end
    notice ("Time's up · Your quick timer has finished. Nice work.") show quick timers.
  - Do Not Disturb: apps can't turn on a Focus, Shortcuts can. "Start a focus session" now returns the session's
    end time, so a personal shortcut "Start a focus session → Set Focus: Do Not Disturb, On, Until [that time]"
    does it (README). End notices are Time Sensitive (`App/Tend.entitlements`), so they sound through it.
  - Fixed: Done on a timer that ran out while the app slept didn't save the finished state (TendOps compared
    against the already-advanced copy), so the Lock Screen kept showing it. Tested in the simulator: "Plank 90
    seconds" via Shortcuts → quick timer on the Lock Screen, Time Sensitive "Time's up", Done clears it; the room
    shows QUICK TIMER / KEEP GOING / "plank" / Stop timer. Tests 34/34 (node) + 20/20 (Android).
  - Next, app blocking during a session (FamilyControls + ManagedSettings shield, DeviceActivity monitor to lift it at
    the end, a pixel ShieldConfiguration; "Done unlocks"): needs Apple's Family Controls (Distribution) approval
    before TestFlight. Request text in `apps/tend-ios/release/family-controls-request.md`; Houfu submits it.
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
