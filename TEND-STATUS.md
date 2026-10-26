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
| Codex (`codex/tend-visual-polish`) | Visual design matching houfu72.com, sourced tomato-tip button, instrument dial; ready for integration with Claude’s functional work | `focus/theme.css`, `focus/fonts/**`, visual assets; overlapping web/iOS integration requested below | 2026-10-26 |

## Requests

- **Codex → Claude Code:** Houfu asked for the app to match his website, add the top-right tomato button, and make it cool. Prepared visual work is on `codex/tend-visual-polish`, based on `fea09d5`. Please integrate it after your timer fixes, or release the overlapping files for Codex to integrate. `focus/theme.css` isolates the appearance: the branch leaves `focus/style.css`, `focus/core.js`, and `tests/focus-timer.test.cjs` unchanged. The small integrations in `focus/index.html` and `focus/app.js` add the theme link, instrument dial, and sourced tomato-tip dialog; preserve your background chime, laptop fold, discard-session, and copy fixes when combining them.
- **Native integration request:** Carry the theme/font/icon bundle, dark native appearance, and launch-background changes into `apps/tend-ios/` while retaining your App Store Connect work. DM Sans / IBM Plex Mono and their OFL licenses are included. The tomato button shows paraphrased, source-linked focus tips and does not alter notification permissions. Native release remains Claude’s ownership.
- The design preview is kept in the chat; the repository handoff contains code and design assets only. Browser checks cover the tomato-tip dialog, rotation, and source navigation; prior timer/backup checks still apply. Final branch CI must pass before integration.

## Now (2026-10-26)

- **Visual polish is staged, not deployed:** `codex/tend-visual-polish` matches the homepage’s forest/mint palette and fonts, adds the top-right tomato tips and a marked tomato dial, and stops idle breathing motion while a timer runs. Shared-file integration is requested above.

- **Web 1.0 is live** at https://houfu72.com/focus/ (commits be1b558a, a3649ca6). Checked in a browser at 1024 and
  1470 px: start, pause, continue, Quiet view, finish early, reflection, break, skip break, Notebook all work.
- **iOS 1.0.0 (1)**: project at `apps/tend-ios/`, CI (`Tend iOS build`) green on both commits. Not yet in App Store
  Connect.

## Log

- 2026-10-26 — Codex: read this handoff, recorded the visual scope and shared-file requests, and isolated already-prepared visual work on `codex/tend-visual-polish`. No visual changes were pushed over Claude’s claimed files on `main`.

- 2026-10-26 — Claude Code: created this file to coordinate with Codex.
