# iPad Workspace ergonomics pass — change log for cross-checking

Branch `claude/phloem-ipad-ergonomics-4rko4x`, based on Codex's checkpoint
`d9df0ddd` (`codex/phloem-zen-interaction-plan`, expanded workspace paper WIP).
Each entry below is one commit, so a reviewer can check them one at a time with
`git show <commit>`. Nothing here touches the saved annotation format, AI,
privacy, sync, signing, release numbers or the native build.

This branch also finishes Codex's expanded-paper checkpoint (entry 6), and its
last commit bumps the reader assets and offline shell from v162 to v163, as the
handoff's step 6 asks, because the combined work is going to main.

## 1. Two-finger tap Undo, three-finger tap Redo on workspace paper

**Commit:** "Undo workspace handwriting with a two-finger tap"

**What changed.** A quick tap with two fingers anywhere on workspace paper undoes
the last workspace change (a stroke, an erase, or a lasso move). Three fingers
redo it. A short status line says what happened, or "Nothing to undo in
Workspace". It uses the same history as the rail Undo/Redo buttons, so those stay
in sync.

**Why it helps on iPad.** The Pencil hand stays on the page; you no longer reach
to the top-right rail after every mistake.

**Safety rules (all tested).** The tap is void if any finger moves more than
12 px, the tap lasts longer than 400 ms, the paper scrolls or zooms during it, the
system cancels a contact, any Pencil or mouse contact happens during it (a resting
palm while writing), or a finger lands on a note control, text box, button or menu.
One-finger taps never count. With the lasso tool active, the second finger already
cancels a half-drawn lasso; the tap then undoes and leaves no outline behind. Paper
(PDF) history and two-finger PDF zoom are untouched; the gesture is listened for
only on the workspace scroll area.

**Files.** `reading-workspace-view.js` (listener block next to the Undo/Redo
buttons; one line in `startStroke`), new `tests/reading-workspace-multitap.test.js`.

**How to verify.**
- `node tests/reading-workspace-multitap.test.js` (4 tests; the native CDP touch
  case is Chromium-only). It fails on the parent commit and passes here.
- On iPad: write two strokes in Workspace, tap with two fingers (one stroke goes),
  three fingers (it comes back). Rest your palm while writing and confirm nothing
  is undone. Two-finger pan and pinch on blank paper must still scroll and zoom.

## 2. Sticky note button on the Workspace rail

**Commit:** "Put Sticky note directly on the workspace rail"

**What changed.** `＋ Sticky note` moved out of the ⋯ More menu onto the rail as a
labelled 44 px "Note" button between Lasso and Undo (same icon-plus-caption style
as Undo). The element id `workspaceNewNote` is unchanged. Tapping it closes any
open pen or More popover. More now holds More paper, zoom, Redo and Return.

**Why it helps on iPad.** Adding a note is the main workspace action; it was two
taps deep. It is now one tap, in the same column as the other tools.

**Files.** `reading.html`, `reading-workspace.css` (`.workspace-labelled` shares the
Undo button style), `reading.js` (popover close), and three tests that used to
open More first now tap the rail: `reading-zen-default-browser`,
`reading-zen-compact-browser`, `reading-split-undo-browser`. The default Zen test
asserts the button is visible with More closed.

**How to verify.** Those three tests. On iPad: open Workspace, the rail shows
Pen, Eraser, Lasso, Note, Undo, ⋯; tap Note and type straight away.

## 3. Paper highlighter color button on the paper dock while Workspace is open

**Commit:** "Put the paper highlighter color on the paper dock in Workspace"

**What changed.** With Workspace open in landscape, the paper's own Zen dock (left
half) gains one button between Annotate and Undo. It shows the current highlighter
color as a dot and opens the paper's color shelf in one tap (before: Annotate, then
Highlight). It mirrors the existing Marker button's color, label, pending-selection
and eraser states, and Done or Escape return focus to it. It is hidden whenever
Workspace is closed, so the reading-only Zen dock is unchanged. The Workspace rail
is not touched, and the workspace pen color stays independent.

Found while doing this: in split view, the paper's highlight shelf (and the paper
handwriting shelf) centered on the whole window and covered part of the workspace.
They now center on the paper half and are capped to its width.

**Files.** `reading.html` (`#zenWorkspaceMarker`), `reading.css` (color tokens and
eraser look include the new id), `reading-workspace.css` (show only when
`body.workspace-open.zen`; shelf position in wide landscape), `reading.js`
(`zenMarkerAction`, label/color mirroring in `syncZenMarkerUi`,
`zenHighlightReturn` for focus), new `tests/reading-workspace-paper-color.test.js`.

**How to verify.** `node tests/reading-workspace-paper-color.test.js` (iPad Air
landscape size 1180×820). On iPad: open a PDF, open Workspace, tap the dot button
on the paper side, pick a color, and check the shelf sits over the paper only.

## 4. Cross-feature QA

**Commit:** "Add cross-feature QA for the Workspace ergonomics pass"

`tests/reading-workspace-ergonomics-qa.test.js` runs one full-app session at iPad
landscape size: paper highlight, workspace stroke, rail Note with text, lasso and
keyboard nudge, two-finger tap undoes the nudge then the stroke, three-finger tap
redoes, paper color button, paper Undo, then reload. It asserts workspace taps
never touch paper highlights or notes, and paper Undo never touches workspace ink.

## 5. A tap releases the lasso

**Commit:** "Release the workspace lasso with a tap"

**What changed.** With Lasso active, a finger tap anywhere (inside or outside the
dashed selection) releases it. A Pencil or mouse tap outside releases it too; a
Pencil tap inside keeps it so a drag can start there. Releasing no longer shows
"Nothing selected. Circle a note or handwriting." and adds no Undo step or saved
change. A tap is judged by the farthest travel from touch-down (under 8 px), so a
closed lasso loop that ends where it began is never mistaken for a tap.

**Files.** `reading-workspace-view.js` (`startSelection`, `moveSelection`,
`finishSelection`), new `tests/reading-workspace-lasso-release.test.js`.

**How to verify.** The new test fails on the parent commit and passes here. On
iPad: circle something with the Pencil, then tap the paper with a finger.

## 6. Writable paper after zooming out (finishes Codex checkpoint d9df0ddd)

**Commit:** "Finish writable zoomed-out workspace paper"

**The bug.** After zooming out, blank space showed to the right, but the paper was
still 1000 units wide, so Pencil strokes flattened against an invisible edge.
Codex's checkpoint makes that space real paper (saved `width`, workspace v3). This
commit fixes what was left of the handoff:

- `reading-workspace-viewport.js`: any horizontal scroll offset added 1000 units of
  width, so simply zooming in grew the paper. Now width grows only when zooming out
  exposes paper, or when a zoomed-in view is panned to within 50 units of the right
  edge.
- `reading.js` `showWorkspaceClip`: a highlight or new note dropped near the right
  edge widened the paper and scrolled the view away. It now shifts left onto the
  visible paper. Programmatic placement beyond the edge still grows the paper
  (Codex's adapter test keeps passing).
- `tests/reading-workspace-lasso-browser.test.js`: converts with the saved logical
  width, not 1000 (handoff item 3).
- `tests/reading-workspace-extended-paper.test.js`: adds one continuous 50%-zoom
  Pencil stroke from x=800 to x=1800 and checks that no samples pile up at x=1000
  and the paper is at least 2000 wide. Run against live main, this file fails
  (reproducing the bug); here it passes.

**Still open from the handoff.** WebKit runs (item 1), and native/older-client v3
compatibility review (item 5): older open copies pause Workspace editing on a v3
paper until they reload, by Codex's fail-closed design. Existing native builds have
not received this change.

## 7. Version bump

**Commit:** "Bump Phloem reader shell to v163". All `?v=` asset queries in
`reading.html` and the service-worker cache name in `reading-sw.js` move from 162
to 163. `tests/reading-app-update.test.js` and the iPad bundle tests
(`apps/ipad/tests`, 16/16) pass.

## Full-suite comparison (Chromium, every file in `tests/`)

Baseline is Codex's checkpoint `d9df0ddd`; "this branch" is before the version bump.

| | Baseline | This branch |
| --- | --- | --- |
| Passing files | 37 of 71 | 45 of 75 (4 new) |
| Failing files | 34 | 30 |

Every file that fails on this branch also fails on the baseline. Most fail because
the old fixtures still open the non-Zen toolbar that "One quiet reader" removed
(timeouts on `#workspaceOpen`, `#touchHighlight`, header buttons), as Codex's plan
notes. Fixed by this branch: `reading-workspace-viewport`,
`reading-workspace-lasso-browser`, `reading-highlight-workspace-drag`.
`reading-pdf-links` passed here and failed on the baseline run; it was not changed,
so treat that as timing, not a fix.

Still failing on both: ai-providers, annotation-tools, book-guide, excerpts-browser,
fold-browser, fold-phone, highlights, ipad-header, ipad-touch-dock, keeps-browser,
library-list, library-thinking-search, marker-actions, native-ai, notebooklm-export,
pdf-authors, pdf-continuity, pdf-ink-palette, pdf-ink, pdf-title, pdf-toc,
pencil-highlight, rename-recent, selection-note-ai, selection-touch, tool-palettes,
typography, vertical-book-flow, workspace-browser, zen-ipad.

## Patent and design note

These are generic interaction patterns, not a copy of any one app's design:
a labelled toolbar button, a color-dot button, and a multi-finger tap for
undo/redo. The two-finger-undo / three-finger-redo tap is widely used across iPad
drawing and note apps, which is why it was chosen, but that does not establish
freedom to operate. Nothing here has been checked by a patent attorney. If that
matters for the App Store build, the gesture is contained in one listener block
in `reading-workspace-view.js` and can be removed or put behind a setting without
touching anything else.

## Not verified

- WebKit: not installed in the environment used for this pass. Run
  `PHLOEM_BROWSER=webkit` for the three new browser tests.
- Physical iPad, Apple Pencil, palm rejection and VoiceOver: not tested. Synthetic
  and CDP touches are browser evidence only.

# Round 2 (shell v164)

Built on main after PR #31. Each entry is one or more commits on
`claude/phloem-ipad-ergonomics-4rko4x`; "WIP" commits only hold test repairs.

## 8. Lasso: resize from the corners, easier finger move

**What changed.** A lassoed selection has four corner handles. Dragging one (finger
or Pencil) scales the whole group about the opposite corner; notes stay within their
280-900 saved width, line weight scales with ink (0.5-12), and nothing crosses the
paper's top or left edge. `+`/`-` on the focused selection resize by 10% from the
keyboard. A finger anywhere in a handle's 44 px target grabs it; a Pencil or mouse
must land on the 14 px dot, so a new lasso can still start just outside a corner.
A finger drag that starts up to ~20 px outside the dashed box still moves it.
Resizes use the existing grouped-move Undo/Redo (snapshot in, snapshot out through
`adapter.restoreGroup`), so no saved-format or adapter change.

**Files.** `reading-workspace-view.js` (`scaleLimits`, `scaledSnapshot`,
`previewScale`, `commitScale`, handle hit test in `startSelection`),
`reading-workspace.css` (`.workspace-selection-handle`).

## 9. Plain sticky notes; the top strip is the grip

**What changed.** houfu asked for plain notes: the tape is gone. The note's 44 px top
row is faintly tinted and carries a short grabber bar (the standard iPadOS sheet
cue). With the pen or eraser active, the Pencil on that strip drags the note instead
of writing; the ⋯ menu still opens; writing below the strip still writes. Lasso mode
keeps its own gestures. The library wall's cards are unchanged.

**Files.** `reading-workspace-view.js` (`gripCardAt`, `startGripDrag`),
`reading-workspace.css` (`.workspace-card::before/::after`).

**Verify (8 and 9).** `node tests/reading-workspace-lasso-resize.test.js` (full app,
1180x820, native CDP touch): fails on main before this round, passes here. On iPad:
lasso some ink, drag a corner dot out and in, drag inside with a finger, Undo twice;
add a note and drag its top strip with the Pencil while the pen is selected.

## 10. Library header no longer widens the page on portrait iPad

At 721-1100 px the library's sort, Offline, Wall/List and Clean/Handwritten
controls plus search did not fit one line and the header never wrapped, so the page
grew to ~960 px and mobile Safari zoomed out. The header now wraps; below 1100 px
search takes its own row. `reading.css`; new `tests/reading-library-ipad-width.test.js`
(fails before, passes after).

## 11. PDF stays on the returned page when the iPad rotates right after

After Clips' Return to reading, the stable PDF position was only refreshed after two
settling frames; a rotation in that window rebuilt from the clip's page. The placed
target is now remembered immediately (the target itself, not a mid-resize sample),
and paged layouts ignore a remembered point that is not on the current spread.
`reading.js` (`placePdfReadingPosition`, `stablePdfPositionForRebuild`).
`tests/reading-excerpts-browser.test.js` failed 3 of 6 runs before, 0 of 10 after;
`reading-pdf-continuity` passes 6 of 6 under CPU load.

## 12. Older reader tests repaired for the Zen-only reader

About 30 files clicked classic-reader controls that `73f8b633` hid and `1a215db5`
removed. They now reach each feature the way a user does (Zen dock, More menu,
This paper, library masthead). Assertions changed only where a commit deliberately
changed behaviour, each citing it in the test. Test files only.

## Full suite, round 2 (Chromium, 77 files)

| | Live main before round 2 | This round |
| --- | --- | --- |
| Failing files | 30 | 3 in the full run, then 1 |

The full run (three shards in parallel) failed `pdf-continuity` (a rotation check
under load, fixed by entry 11's final commit), `vertical-book-flow` (repair still in
progress, passes after it finished) and `keeps-browser`. Those were re-run on their
own afterwards rather than re-running the whole suite. Only `reading-keeps-browser` still fails ("explicit jump returns to saved PDF
page"), and it fails the same way with live main's `reading.js`, so it is not caused
by this round. Not verified: WebKit, a physical iPad and Pencil.

## 13. Workspace pinch zoom as smooth as the PDF (`e209a4a9`, v165)

Each pinch frame used to re-lay out the whole board. The pinch now previews with a
single CSS transform on the board inside `requestAnimationFrame` (anchored under the
fingers) and commits the real zoom once, when the fingers lift or the gesture is
cancelled. `reading-workspace-viewport.js` (`previewPinch`, `endPinch`; `getZoom`
reports the live pinch value). `tests/reading-workspace-viewport.test.js` now checks
the layout does not change mid-pinch.

## 14. Keeps "Go to place" saves the page (`f9674709`, v165)

`jumpToReadingKeep` placed the PDF but did not save the position, so a later rebuild
could return to the old page. It now calls `savePdfReadingPosition(false)` after the
jump settles. Fixes the `reading-keeps-browser` failure noted in round 2.

## 15. A squeezed Workspace scales instead of reflowing (`766c5c8c`, v166)

Notes, text and ink are always laid out on a sheet 600 px wide per 1000 units and
the sheet is scaled to the pane (`LAYOUT_WIDTH`, `fit()` in
`reading-workspace-viewport.js`). Dragging the divider shrinks everything together
instead of wrapping note text and shifting it against the ink. New
`tests/reading-workspace-squeeze.test.js` (no reflow at 480 and 330 px panes).

## 16. Moving the divider keeps the zoom (`d0c0d11b`, v167)

When zoomed in, a divider move used to snap back toward fit and re-zoom. The
Workspace now rescales its zoom by old/new pane width (`measure()` in the viewport
module), and a zoomed or paged-manual PDF keeps its zoom the same way
(`fitWorkspacePdfAfterResize` / `setWorkspaceWidth` in `reading.js`). Covered in the
squeeze test.

## 17. New sticky notes start square (`0f0acd1a`, v168)

New notes default to 400 units wide (was 650), and the note's minimum height
matches its width up to 300 px, so a new note is roughly square.
`reading.js` (drop point, clip placement), `reading-workspace-view.js` (`setBox`).
Tests updated in lasso-resize, workspace-browser and group-adapter.

## 18. Highlighter colors fold out beside the Zen dock (`20d242dd`, v168)

In Zen, opening the highlighter from the dock no longer raises the bottom palette.
The same toolbar is docked next to the button (left of the dock when the dock is on
the right of the paper, otherwise right), in two short columns, clamped on screen.
`placeDockedHighlightToolbar` in `reading.js`, `.highlight-toolbar.docked` in
`reading.css`. The Pen shelf is unchanged. `tests/reading-tool-palettes.test.js`
checks the fold-out position and column layout.

## 19. Safari's native pan no longer cuts a Workspace pinch short (v169)

Entry 13 made each pinch frame cheap, but the pinch was still driven only by
pointer events on a `touch-action: pan-x pan-y` scroller. When two fingers travel
together, Safari may start a native pan and cancel both pointers, ending the pinch
part-way through and leaving the rest to scrolling. The PDF pinch avoids this by
cancelling `touchstart`/`touchmove`. The Workspace now does the same for a
two-finger touch on blank paper, and if the first finger had already started a
scroll (so its pointer was cancelled), the touch stream starts and carries the
pinch itself. `reading-workspace-viewport.js`; new test "native pinch still zooms
after the first finger already started a scroll" in
`tests/reading-workspace-viewport.test.js` (zoom stayed at 100% before, 2.25x after).
Not verified on WebKit or a physical iPad.

## 20. Smoother eraser on the Workspace and the paper (v170)

houfu reported the eraser "gives glitches" while erasing. Both erasers did all their
work on every Pencil sample. The Workspace eraser recomputed each stroke's display
points (with note anchors) twice per stroke and walked the whole ink layer; with 80
strokes that was a median 15 ms per sample in desktop Chromium (iPad Pencil samples
arrive every 4-8 ms). It now measures the strokes once per sweep, rejects strokes by
bounding box before the segment test, and fades only newly hit strokes; median
0.4 ms per sample, same strokes erased. If the paper grows mid-sweep and the ink is
redrawn, it re-measures and re-fades. `reading-workspace-view.js`
(`eraserTargets`, `eraseAt`).
The paper eraser had the same pattern: `reading-ink.js` now measures the page's
strokes once per sweep, and `collectEraserHits` in `reading.js` restyles highlights
only when a sample erased something new.
New `tests/reading-workspace-eraser-sweep.test.js`: 40 lines, one sweep erases
exactly the 20 it crosses, Undo restores them, and the sweep walks the ink layer at
most 3 times (120 times before the change). Not verified on a physical iPad.

## 21. A pinch that starts on a note's top strip resizes it (v171)

houfu: with one finger on the top of a note, pinching moved it instead of resizing.
Two causes in `reading-workspace-view.js`. `startGripDrag` (the Pencil grip from
entry 9) also took finger touches and stopped them before the note's own pointerdown,
so the note never counted that finger toward a pinch; it now ignores touch, and
fingers use the note handle as before. Then, when the second finger turned the drag
into a pinch, the handle lost pointer capture, and that `lostpointercapture` bubbled
to the card and ended the pinch; the card now reacts only to its own lost capture.
New `tests/reading-workspace-note-pinch-grip.test.js` (native CDP touch: first finger
on the strip, second on the note body, spread) fails before (the note moves) and
passes after (it grows). Not verified on a physical iPad.

## 22. Fingers scroll the Workspace in lasso mode (v172)

houfu: in lasso mode fingers should move the Workspace, as in pen mode. Every finger
touch in lasso mode started a lasso, and `.workspace-selecting *` set
`touch-action: none`, so the paper could not scroll. Now, as with the pen, the Pencil
(or mouse) draws the lasso and fingers scroll and pinch natively.
`reading-workspace-view.js`: the board's select-mode `pointerdown` lets a finger that
is not on the selection (`fingerOnSelection`, same slop as before) pass through,
tracking it only as a possible tap (`fingerTap`) that releases the selection if it
lifts within 8 px and 600 ms. Select-mode `touchstart`/`touchmove` cancel only for a
stylus or a live selection gesture. `reading-workspace.css`: the selecting rule no
longer sets `touch-action`; the selection box and corner handles keep `none`.
Tests: new `tests/reading-workspace-lasso-finger-scroll.test.js` (native CDP touch:
finger drag scrolls and draws no lasso, Pencil lassos, finger tap releases) fails
before and passes after. `reading-workspace-lasso-browser` now draws its lassos with
the Pencil and checks that a finger loop selects nothing; a finger still drags the
selection. Not verified on a physical iPad.

## 23. Writing that lies mostly on a note moves with it (v173)

houfu: "whats been written on the note should move with the note". Writing that
started inside a note already moved and scaled with it (checked with a finger drag,
a Pencil top-strip drag and a pinch). houfu's screenshot shows the gap: a line
written across the note's edge ("uptake / contribution to") whose first strokes
began just outside it. A stroke was anchored only if the Pencil touched down inside a
note. `finishStroke` now falls back to `noteUnderStroke`, which anchors the stroke to
the topmost note holding at least 60% of its points. Strokes saved before this
change keep their old ownership; lasso them with the note to move them together.
New `tests/reading-workspace-note-ink-follows.test.js` (one stroke inside the note,
one starting 12 px below it; a finger drags the note; both strokes follow) fails
before (the edge stroke had no anchor) and passes after.
