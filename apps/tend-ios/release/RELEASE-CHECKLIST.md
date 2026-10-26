# Tend 1.0.0 (1) release checks

## Implemented

- [x] Separate iPhone/iPad target and app identity; Phloem is untouched.
- [x] Offline bundled UI, local notebook, custom timers and Quiet view.
- [x] Deadline-based timing, pause/resume, pending reflections and early finishes.
- [x] Native storage, opt-in local reminders, share-sheet exports, and screen-awake control.
- [x] Source citations with book/method/research distinctions and evidence limits.
- [x] Public privacy/support pages and prepared listing/reviewer notes.
- [x] Shared state/timer tests pass locally (13 cases at initial implementation).

## Before submission

- [ ] Confirm the macOS CI simulator build and smoke launch pass for the final commit.
- [ ] Open the project in Xcode and confirm the app name, team, bundle ID, version and build.
- [ ] Run on a real iPhone and iPad; verify first launch, VoiceOver, keyboard handling, portrait/landscape, and readable text.
- [ ] Start, pause, background, lock, reopen and force-quit/relaunch; verify elapsed time and notes are correct.
- [ ] Enable notifications, then test permission denied, app backgrounded, Focus mode, silent mode, pause cancellation, and end-early cancellation.
- [ ] Verify optional screen-awake behavior and native share-sheet exports on iPhone and iPad.
- [ ] Export and restore a backup; verify the replacement confirmation and that a malformed backup leaves data unchanged.
- [ ] Verify a completed interval and an early finish create exactly one log entry; the fourth full interval offers the longer break.
- [ ] Verify offline launch and externally opened citations/privacy/support links.
- [ ] Confirm privacy/support URLs are live and final archive privacy disclosures match the binary.
- [ ] Register the new App ID / App Store Connect record, create a distribution-signed archive, and validate it.
- [ ] Capture final app screenshots, choose price/regions, complete current age-rating/privacy questions, and upload to TestFlight.
- [ ] Complete TestFlight device checks on the uploaded binary and submit for App Review.

No claim of App Store submission or approval is made by this checklist.
