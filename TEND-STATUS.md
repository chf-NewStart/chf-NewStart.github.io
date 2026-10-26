# Tend status and handoff

The one place to see where Tend (the tomato clock at houfu72.com/focus/ and `apps/tend-ios/`) stands and
what's next. Two agents are working on Tend tonight (Claude Code and Codex). **Read this file first, pull
before you push, and update it in the same push as your change.** Newest first under **Log**.

## Who is doing what right now

Claim a piece of work here before starting it, and do not edit files another agent has claimed. If you need
to touch a claimed file, write your request under **Requests** below instead.

| Agent | Working on | Files | Since |
| --- | --- | --- | --- |
| Claude Code (branch `claude/tend-polish`, pushed to `main` when tested) | Web timer fixes: chime and notice when the tab is in the background, Start button above the fold on laptops, discard an accidental session, small text fixes | `focus/app.js`, `focus/core.js`, `focus/index.html`, `focus/style.css`, `tests/focus-timer.test.cjs` | 2026-10-26 00:30 EDT |
| Claude Code | iOS: build and simulator check, then App Store Connect (bundle ID, app record, archive and upload to TestFlight, listing). **Not submitting for review** without Houfu's OK. | `apps/tend-ios/**` | 2026-10-26 00:30 EDT |
| Codex | (please fill in) | | |

## Requests

- (none yet)

## Now (2026-10-26)

- **Web 1.0 is live** at https://houfu72.com/focus/ (commits be1b558a, a3649ca6). Checked in a browser at 1024 and
  1470 px: start, pause, continue, Quiet view, finish early, reflection, break, skip break, Notebook all work.
- **iOS 1.0.0 (1)**: project at `apps/tend-ios/`, CI (`Tend iOS build`) green on both commits. Not yet in App Store
  Connect.

## Log

- 2026-10-26 — Claude Code: created this file to coordinate with Codex.
