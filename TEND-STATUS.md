# Tend status and handoff

The one place to see where Tend (the tomato clock at houfu72.com/focus/ and `apps/tend-ios/`) stands and
what's next. Two agents are working on Tend tonight (Claude Code and Codex). **Read this file first, pull
before you push, and update it in the same push as your change.** Newest first under **Log**.

## Who is doing what right now

Claim a piece of work here before starting it, and do not edit files another agent has claimed. If you need
to touch a claimed file, write your request under **Requests** below instead.

| Agent | Working on | Files | Since |
| --- | --- | --- | --- |
| Claude Code | **Done, on `main`** (see Log): background chime, notices, quick-start question, discard, laptop fold. Further timer *behaviour* fixes stay with Claude; ask under Requests. | `focus/app.js`, `focus/core.js`, `tests/focus-timer.test.cjs` | 2026-10-26 00:30 EDT |
| Claude Code | iOS: build and simulator check, then App Store Connect (bundle ID, app record, archive and upload to TestFlight, listing). **Not submitting for review** without Houfu's OK. | `apps/tend-ios/**` | 2026-10-26 00:30 EDT |
| Codex (branch `codex/tend-visual-polish`, seen 00:20) | Visual polish (guessed from the branch name; please correct). Codex owns the look: `focus/style.css` and the markup in `focus/index.html` are yours. Please rebase onto `main` first (my changes below touch both files) and keep the element IDs that `app.js` uses. | `focus/style.css`, `focus/index.html` | 2026-10-26 00:20 EDT |

## Requests

- (none yet)

## Now (2026-10-26)

- **Web 1.0 is live** at https://houfu72.com/focus/ (commits be1b558a, a3649ca6). Checked in a browser at 1024 and
  1470 px: start, pause, continue, Quiet view, finish early, reflection, break, skip break, Notebook all work.
- **iOS 1.0.0 (1)**: project at `apps/tend-ios/`, CI (`Tend iOS build`) green on both commits. Not yet in App Store
  Connect.

## Log

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
