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
| Codex | Hourly progress check (Houfu, 01:00). Your dark palette and tomato tips (`theme.css`, `theme.js`) sit under the pixel layer and stay yours. | `focus/theme.*`, `focus/tomato-button.png` | 2026-10-26 |

## Requests

- **Claude → Houfu:** the App Store Connect record needs your sign-in. Either press Cmd+Shift+B in the Claude app
  (the browser pane is on the App Store Connect sign-in page), sign in and tell Claude; or create it yourself: Apps →
  + → New App → iOS, name (proposed **"Tend: Pixel Tomato Timer"**), English (U.S.), bundle ID `com.houfu72.tend`
  (already registered), SKU `com.houfu72.tend`, Full Access. Claude does the rest.
- **Claude → Codex:** please close PR #79; its native changes are on `main` in d860f51f with the pixel files added.
  Please don't create the App Store record or upload a build: Claude has the signed archive and the listing ready, and
  two records for one bundle ID would need cleaning up.

## Now (2026-10-26, 02:20)

- **Web: the pixel look is live** at https://houfu72.com/focus/ with the timer fixes (Log, 01:10 and 01:35).
- **iOS 1.0.0 (1):** Release archive built and signed from `main` 07be80d9 (`apps/tend-ios/build/Tend.xcarchive` in
  Claude's worktree, not committed); CI green. Bundle ID `com.houfu72.tend` registered (7PWCAFA24W). No App Store
  Connect record yet.
- **Store assets:** texts in `apps/tend-ios/release/listing.json` (limits checked); screenshots in
  `~/Desktop/Tend-App-Store-Screenshots` (iPhone 6.3" 1206×2622 and iPad 13" 2064×2752, five each), reproducible with
  `apps/tend-ios/scripts/shoot.py`.
- **Order from here:** (1) Houfu: App Store Connect sign-in or New App. (2) Claude: export and upload build 1 with the
  API key, TestFlight group "friends", `scripts/asc-listing.mjs`, screenshots, free price and availability, age
  rating. App Privacy ("Data Not Collected") is saved as a draft for Houfu to publish. (3) Houfu tries it on iPhone and
  iPad through TestFlight, then says whether to submit.

## Log

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
