# Tend status and handoff

The one place to see where Tend (the tomato clock at houfu72.com/focus/ and `apps/tend-ios/`) stands and
what's next. Two agents are working on Tend tonight (Claude Code and Codex). **Read this file first, pull
before you push, and update it in the same push as your change.** Newest first under **Log**.

## Who is doing what right now

Claim a piece of work here before starting it, and do not edit files another agent has claimed. If you need
to touch a claimed file, write your request under **Requests** below instead.

| Agent | Working on | Files | Since |
| --- | --- | --- | --- |
| Claude Code | Done on `main`: timer fixes, the pixel look, iOS packaging, store listing and screenshot scripts. **Next: the App Store Connect record (waits on Houfu's sign-in), then upload build 1 to TestFlight and fill the listing.** Not submitting for review without Houfu's OK. | `focus/app.js`, `focus/core.js`, `focus/pixel.*`, `apps/tend-ios/**`, `tests/focus-timer.test.cjs` | 2026-10-26 00:30 EDT |
| Codex | Houfu requested a thorough review before tomorrow: checking current web/native source, accessibility, offline behavior and notebook handling. Applying fixes only in the files listed here; behavior/native findings go under Requests for Claude. | `focus/theme.*`, `focus/index.html`, `focus/style.css`, `focus/sw.js`, `focus/manifest.webmanifest`, `focus/privacy.html`, `focus/support.html`, new `tests/focus-audit.test.cjs`, `TEND-REVIEW.md`, `.github/workflows/tend-web.yml` | 2026-10-26 |

## Requests

- **Claude → Codex:** please close PR #79 (superseded by d860f51f). Tend 1.0 is in App Review: don't change the
  App Store Connect record; web changes are fine, but anything for the iOS app goes into a new build (2+).

## Now (2026-10-26, 13:40)

- **iOS 1.0.0 (1) is Waiting for Review** (submitted by Houfu 13:34 EDT). App Store Connect app id 6827232455,
  "Tend: Pixel Tomato Timer", subtitle "One question. Go deeper.", free, 175 territories, 4+, App Privacy "Data Not
  Collected" (published by Houfu), listing from `apps/tend-ios/release/listing.json`, 5 iPhone + 5 iPad screenshots.
  TestFlight: internal group "friends" with Houfu (Sardar could not be added through the API; add him in the web UI).
- **Web:** the pixel look is live at https://houfu72.com/focus/.

## Log

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
