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

## 24. Smoother, pressure-shaped Workspace handwriting (v174)

houfu: the strokes look thin and even and are a bit hard to control. Workspace ink
used the shared `natural` outline, whose width only ranges 0.7x-1.15x of the nib with
pressure, and it drew every jitter in the Pencil samples. Two optional, display-only
settings were added to `PhloemInk.pathData` in `reading-ink.js`, and `paintPath` in
`reading-workspace-view.js` turns them on for Workspace pen strokes (not straight
lines or the old marker nib):
- `stabilize`: a forward and a backward arc-length exponential filter on the
  centerline, averaged so there is no lag or shrinkage; the first and last points
  stay where the Pencil touched. Reach is 0.9x the nib width, clamped to 1-3 pt.
- `response`: radius = width x (0.55 + 1.0 x filtered pressure) / 2, so light
  strokes are finer and firm strokes broader.
These are standard pressure-width and smoothing techniques, not any one app's ink.
Stored points do not change, so older strokes simply redraw smoother. Paper ink is
unchanged. New `tests/reading-ink-stabilize.test.js`: stabilized ink turns at least
30% less on jittery input with the same start point, the firm/light width ratio
grows by at least 20%, and strokes without the options are byte-identical.
Not verified on a physical iPad and Pencil.

## 25. Compact Workspace notes (v175)

houfu, with a screenshot: some notes are much bigger than they need to be. A note's
minimum height was its width (capped at 300px, never under 178px), so a wide note with
one line stood as a big empty square. `setBox` in `reading-workspace-view.js` now uses
`noteFloor(widthPx)` = width x 0.75, clamped to 120-180px, and the note still grows to
hold its text and the ink anchored to it. The `.workspace-card` CSS floor drops from
178px to 120px. New notes stay squarish (a little shorter than wide); widening a note no
longer makes it taller. Tests: `reading-workspace-browser.test.js` checks the new floor,
and `reading-workspace-lasso-resize.test.js` checks a new rail note is about 3:4.
Not verified on a physical iPad.

## 26. Drag a new note to where you want it (v187)

houfu: "can we do drag and drop the note instead of click and it randomly appears".
Cause of the "random" spot: the Workspace adapter's `addNote` in `reading.js` dropped the
point the view passed, so every new note went through `workspaceDropPoint` (top-left of
the view, pushed down past other cards). The adapter now passes the point through
(`addWorkspaceExcerpt(null, point)`).

In `reading-workspace-view.js` the Note button now handles pointers itself:
- Drag (more than 10px, finger, Pencil or mouse): a dashed note outline
  (`.workspace-note-ghost`, sized like a new note at the current zoom) follows the pointer
  and fades when it leaves the Workspace. Letting go over the Workspace adds the note
  centred on the pointer and held by its top strip (22 logical px below the top);
  letting go elsewhere adds nothing. The click that follows a drag is swallowed.
- Tap: the note goes in the middle of the visible Workspace. If that spot overlaps a
  note, it takes the nearest free spot (searched on a 40px grid, slightly preferring
  sideways moves), so repeated taps never stack notes.
`#workspaceNewNote` gets `touch-action:none` so a finger drag doesn't scroll the rail.

Tests: new `tests/reading-workspace-note-drop.test.js` (centred tap, no overlap on a
second tap, CDP finger drag with outline, mouse drop off the Workspace adds nothing, mouse
drop saves). Not verified on a physical iPad.

## 27. A note being typed in stays above the keyboard (v188)

houfu: "when i put the note low, the keyboard will obstruct it, how about move the
workspace to that point of sticky note so my keyboard never hides it?"
iPadOS lays its keyboard over the page without resizing it, so the Workspace scroller
kept its full height and a low note's text box ended up under the keyboard. In
`reading-workspace-view.js`, `keepEditorAboveKeyboard()` measures the visible area as the
Workspace scroller clipped to `window.visualViewport` (which shrinks when the keyboard is
up). If the focused note's text box (plus up to 40px of the note below it) runs past that
area, it raises `scroll.scrollTop` by the overlap, but never so far that the note's
top leaves the screen, and it grows the paper first if the scroller is already at the
bottom. It runs on focus inside a note and on `visualViewport` resize (at 0, 120, 320
and 600ms while the keyboard slides in), and on every keystroke so a growing note stays
clear. A note already above the keyboard leaves the Workspace where it is.
Tests: new `tests/reading-workspace-note-keyboard.test.js` fakes the visual viewport
shrinking by 380px (it fails without the fix: text box bottom 806 vs keyboard top 440).
Not verified on a physical iPad.

## 28. Lasso moves save with a full store; easier lasso; palm-proof divider (v189)

houfu: "when i try to change something using lasso, it says nothing selected, circle a
note or handwriting, and when i move it says could not move this selection, it may have
changed elsewhere ... also the divider is open mistouched by me when writing".

**"Could not move this selection."** A lasso move or resize saves all-or-nothing through
`persist(undefined, true)` in `reading.js`. That path returned false whenever
localStorage refused the write, before trying the IndexedDB device snapshot. PR #57 had
moved ordinary saves onto the snapshot when the ~5 MB store is full (the app's merged
device + iCloud + Drive library fills it), but not this path, so every lasso move in the
app was rolled back. An atomic save now fails only when the snapshot can't take it either
(`stateRecoveryDone && stateSnapshotOk`). New `tests/reading-workspace-lasso-storage-full.test.js`
reproduces the message without the fix.

**"Nothing selected."** Couldn't be reproduced on the website (plain, zoomed and reloaded
boards all selected). `selectGroup` in `reading-workspace.js` only took a note when the loop
held the note's exact centre, so a loop around part of a note, or around the writing on
it, missed the note. Now a note is taken when the loop holds its centre or at least about
a third of its area (6x6 sample grid), and a small loop on a blank part of a note, with
nothing else caught, takes that note. Updated `tests/reading-workspace-selection-state.test.js`.

**Divider.** The 44px divider strip took any pointer, so a palm resting while writing next
to it resized the panes. Now (in `reading.js`) finger touches are ignored while Apple
Pencil is down or for 800ms after it lifts, and palm-sized contacts (over 40px) are ignored.
Pencil resizes only from the middle grip, and nothing moves until a 6px drag.
houfu then clarified the divider "just moves accidentally when i write near it": Pencil
strokes that started inside the 44px strip (22px either side of the line) grabbed it. So
while Pencil is in use (any pen pointer in the last 10 seconds, body class
`workspace-pen-active`), the strip has `pointer-events:none` and only a 44x96px
`#workspaceDividerGrip` in the middle takes pointers; strokes beside the line reach the
paper or Workspace underneath. A
deliberate finger drag and double-click reset still work. New
`tests/reading-workspace-divider-palm.test.js`. Not verified on a physical iPad.

## 29. Guide controls fold away on off; dimness 70-100 from 85; pen picks before colors (v191)

houfu: "when turning off the guide, pls i dont need the guide toggle if i already pressed
the button to close it. also can we tune the dimness of guide to be 85 in default, and
lets make it from 70 to 100 where 85 is at middle", then "similarly when i click pen, i
dont need to open pallet everytime when i switch from other tool right?"

- **Guide off folds its controls.** `#zenGuideToggle` in `reading.js` now calls
  `closeZenPopouts(true)` after it turns the guide off (focus returns to the Zen guide
  button). Turning the guide on keeps the controls open so dimness can be set.
- **Dimness 70-100%, default 85%.** Both sliders (`#guideDimRange`, `#zenGuideDimRange`)
  run 70-100 in steps of 5, so 85 is the middle. `DEFAULT_COMFORT.guideDim` is 85 and the
  CSS fallback opacity is .85. A one-time move (`guideDimScale: 2` in the saved comfort)
  changes a saved value below 70 (the old range was 20-85 from 55) to 85; saved values of
  70-85 are kept. `setGuideDim` clamps to 70-100.
- **Pen picks before opening colors.** Like the iPadOS tool picker, `#workspacePenToggle`
  only selects the pen when another Workspace tool was active; tapping it while it is
  already the tool opens or closes the colors. The handler runs before the view's toolbar
  handler, so `aria-pressed` still names the previous tool.

Tests: new `tests/reading-guide-pen-controls.test.js` (fails on v190). Updated
`reading-ai-providers` (85% default), `reading-selection-note-ai` and
`reading-ipad-touch-dock` (the toggle now closes the controls itself).
Not verified on a physical iPad.

## 30. Lasso Delete and Duplicate; one Undo order for the whole Workspace (v192)

houfu: "the lasso should come with a delete option and duplicate option right", and "check
the undo order, im worried it only undo penstrokes instead of other stuff like lasso".

What Undo covered before: pen strokes, eraser sweeps and lasso moves and resizes. Nothing
done to a single note was recorded: dragging it by its strip, arrow keys, pinch, Make
larger/smaller, adding or removing it. So after "write, then drag a note", Undo erased the
writing and the drag could never be undone. Worse, a lasso move followed by a lone drag of
one of its notes made that lasso step fail forever ("changed elsewhere") and blocked every
older step.

- **Single-note moves and resizes are Undo steps** (`placeNote` in
  `reading-workspace-view.js`). They are recorded as the existing `'move'` kind, a group of
  the note plus the writing on it, and undone through `restoreGroup`. Because they are now in
  order on the stack, undoing the lone drag first rebases the older lasso step, which then
  undoes too.
- **Lasso Duplicate and Delete.** A small bar (`.workspace-selection-actions`, a child of the
  selection box, 28px above it so it stays clear of the corner handles' 44px targets; below
  it near the top of the paper) offers Duplicate and Delete. Keyboard: Delete/Backspace and
  Command-D on the focused selection. Duplicate copies the notes (text, quote and source
  link, new ids) 30 units down and right, re-attaches the writing on each copied note to
  its copy, shifts loose handwriting, and selects the copy. Delete removes the notes and
  all their writing. New adapter functions in `reading.js`: `workspaceDeleteGroup`,
  `workspaceRestoreDeleted`, `workspaceDuplicateGroup`, saved together through
  `saveClipsAndWorkspace` (one all-or-nothing save of clips and workspace).
- **New history kinds** `'create'` (duplicate, new note) and `'delete'` (lasso Delete, note
  Remove). Undo of a delete restores under the same ids, so a note keeps its colour and
  position and the writing on it follows it. The data layer already lets a later upsert beat
  its tombstone. `rebaseHistory` and `rebindStroke` handle the new kinds.
- **Adding a note is an Undo step**; Redo brings it back with what was typed in it.
- **Remove in a note's menu** no longer asks for confirmation, because one Undo brings the
  note, its text and its writing back. It now also removes the writing on the note, which
  used to stay saved but hidden. The Clips panel still confirms, as before.
- Strokes and erases now go through `recordUndo` too, so the 50-step cap applies to them.
- The Undo/Redo button labels say "the last Workspace change".

Not recorded (unchanged): typing in a note (the text box keeps its own undo), placing a
passage from the paper, and paper growth.

Tests: new `tests/reading-workspace-lasso-actions.test.js`. Updated
`reading-workspace-browser` (Cmd-Z after the pinches now undoes the last resize),
`reading-split-undo-browser` (a new note enables Workspace Undo) and
`reading-workspace-ergonomics-qa` (two-finger taps undo the newer note before the older
stroke; three-finger taps bring both back). Not verified on a physical iPad.

Review fixes before shipping (an independent review found five real problems):
- Strokes brought back by Undo of a Delete got a new `createdAt`, so older steps on them
  failed with "changed elsewhere". `geometryKey` now ignores `createdAt` as well as
  `updatedAt` when rebasing history.
- A note brought back by Undo keeps its original `createdAt`, so it keeps its place in
  the Clips list.
- Duplicate steps right only as far as the paper allows, so it never widens the paper.
- The Duplicate/Delete bar is counter-scaled (`--selection-ui-scale`) so it stays the same
  size on screen at any Workspace zoom, and it moves below the box (then left) when the
  floating tool palette or the top of the pane would cover it.

## 31. A finger moves the divider again (v193)

houfu: "wait it looks like you disabled the hand moving the divider?" Two parts of the v189
palm guard blocked ordinary finger drags:
- Touches with a contact over 40px were treated as a palm. iPad reports normal fingertips as
  40-70px contacts, so most finger drags were ignored. The size test is gone; touches are
  still ignored while Apple Pencil is down and for 800ms after it lifts.
- After any Pencil use the strip stayed pass-through (only the middle grip took pointers)
  for 10 seconds. That window is now 2 seconds, so the whole strip takes a finger again
  shortly after writing, while strokes written in a row beside the line still reach the
  paper or Workspace.

Updated `tests/reading-workspace-divider-palm.test.js`: a 60px fingertip contact drags the
divider (fails on v192), and the whole strip is hit-testable again 2 seconds after Pencil.
Not verified on a physical iPad.

## 32. Smoother handwriting: saves and sync wait for a pause (v194)

houfu: "when doing screenrecording + workspace, it glitches like it freezes once in a while
when i try to write". Profiling the Workspace with a 4 MB library, 400 strokes and the CPU
slowed 6x (about an iPad recording its screen) found the pen-lift handler taking 290-730ms,
so the next stroke started late. The causes and the fixes:
- Every stroke, erase and paper growth saved the whole library (JSON of several MB plus a
  localStorage write). These saves now wait until the Pencil has rested for 1.2 s (15 s at
  most during unbroken writing, and never mid-stroke). Any other save writes them too, and
  hiding the page or leaving the app writes them at once. After a failed save they go
  straight through again, so storage warnings still appear on the stroke that hit them.
  PDF ink on the paper uses the same pause.
- The device snapshot copy (IndexedDB) waits for the Pencil to rest for 600ms (5 s at most).
- Background sync (iCloud, Drive, GitHub) parses and merges the whole library on the main
  thread. It used to start 4 s after any save, often just as writing resumed. It now waits
  for 6 quiet seconds with no touch, Pencil or key, runs after 90 s at most, and runs at
  once when the page is hidden.
- The Workspace rebuilt every ink path on each render. It now keeps one path per stroke and
  repaints only strokes whose shape, anchor note or board size changed.
- The Pencil-active class moved from `<body>` to the divider, so it no longer restyles the
  whole page twice per stroke.
Measured with the same setup: the pen-lift handler now takes 9-73ms and the longest task
70-140ms (was 310-810ms).

While checking that deferred saves survive the app going to the background, a page-hide bug
from v186 turned up: with localStorage full (the iPad app with a merged library), the
cursor save on page hide patched the older localStorage copy and then copied it over the
newer device snapshot, so recent notes and ink could be lost if sync had not uploaded them
yet. With the store full, page hide now writes the newest library to the device snapshot.

Tests: new `tests/reading-workspace-ink-idle-save.test.js` (five strokes 250ms apart write
the library once after a pause; earlier ink paths are reused; hiding the page saves at once;
Undo and Redo; a cancelled eraser sweep; reload keeps strokes), new
`tests/reading-sync-quiet.test.js` (timing over the real scheduler: 6 quiet seconds, Pencil
held, the 90 s cap, hide), new `tests/reading-storage-full-lifecycle.test.js` (fails on
v193). `tests/reading-workspace-lasso-storage-full.test.js` now waits for a snapshot newer
than the stale store, and `tests/reading-workspace-divider-palm.test.js` checks the
divider's class. Not verified on a physical iPad.

Review fixes (independent review of 45c5d8a3, all reproduced first, then fixed):
- Save deadline: each stroke restarted the 1.2 s wait, so steady writing never reached the
  15 s cap (120 strokes over 30 s saved nothing). The wait now never runs past the
  deadline; at the deadline a Pencil still down saves at its lift.
  `tests/reading-persist-soon-deadline.test.js`.
- PDF strokes: the PDF ink controller takes Pencil events at the window and stops them, so
  the activity tracker (on the document) never saw PDF writing and a deferred save or a
  sync could start mid-stroke. The tracker now listens at the window before the controller
  is created, and also notes stylus touches. `tests/reading-pdf-ink-quiet.test.js`.
- Cached ink: a synced stroke that wins a merge with the same clock (content tie-break) kept
  its old path on screen. The cache key now includes a cheap hash of the stroke's points,
  color, width, style and anchor.
- Stacking: new paths were appended, so overlapping strokes could stack differently after
  a reload (stored order is by id). Paths are now kept in stored order, moving nodes only
  when out of place. Both in `tests/reading-workspace-ink-cache.test.js`, which also checks
  that one new stroke on a 300-stroke board leaves every other path element and outline
  unchanged. The review's benchmark still shows one generated path per new stroke at 100,
  500 and 1,000 strokes.
- `tests/reading-workspace-pending-save-paper.test.js`: strokes written just before opening
  another paper save to their own paper, and Undo before the save wins.
