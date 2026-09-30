# Phloem 1.1 release checklist

Version target: **1.1.0 (23)**, reader cache **v142**. Pen now matches the compact Highlight toolbar: icon-only Pen/Eraser and screen-reader-only instructions, retaining all eight colors, three widths, Undo/Redo, and Done. Fine is the default size. Natural ink and jitter-tolerant straightening are local drawing changes; AI behavior is unchanged. Build 23 was archived and locally verified on September 30, 2026, including the Pencil-hover fix and Fine default. Distribution validation, upload, and physical-iPad testing remain pending. Check App Store Connect for an already-used build number before uploading; source changes do not update the installed app.

## Implemented and locally verified

- [ ] On a real iPad, compare Natural/Clean responsiveness, fine writing, tap dots, and curls at several zoom levels. Confirm held lines snap after 600ms with a small amount of hand tremor, adjust until lift, and remain straight after erase/Undo, reload, and backup restore. Older notes must retain their appearance. Browser tests do not establish Apple Pencil latency.
- [x] Fine is initially selected and used for saved strokes. Updated palette checks pass 45/45 in WebKit and handwriting checks pass 71/71 in Chromium.
- [ ] On the exact build 23 binary, confirm Fine is the initial pen size, rename a paper from the reader title, wall cover, and List actions; verify the name survives restart without changing the file, reading position, or annotations. Swipe Continue reading to reach all six recent papers.
- [x] Native Capacitor AI plugin registered in the iPad view controller.
- [x] OpenAI and Anthropic use fixed HTTPS destinations through native `URLSession`.
- [x] DeepSeek fixed-host request/response behavior passes 25 extracted Swift checks across all three providers. Native UI/bridge tests pass 26 checks in both Chromium and WebKit, including consent, credential metadata, request failure, key removal, and preserving paper data. The signed Release archive compiles and passes code-signature verification. Mocked calls and compilation are not live-provider or physical secure-prompt verification.
- [x] Restored the original opaque 1024×1024 Phloem App Store icon. The asset regression checks its dimensions, format, and reviewed hash; the compiled iPad icon was visually checked in build 12.
- [x] Cross-host redirects are rejected; arbitrary custom endpoints are not available.
- [x] API keys are stored in iOS Keychain with this-device-only, unlocked-device accessibility.
- [x] A native iOS secure prompt collects new credentials; after saving, JavaScript receives only credential-presence metadata and never the stored credential.
- [x] Native startup scrubs legacy browser-stored AI keys instead of silently migrating them.
- [x] Provider-specific data disclosure, privacy link, and affirmative consent are required before enabling a credential.
- [x] Build 13 collapses the disclosure after successful setup into a provider-specific enabled summary, preserves native consent on reopen/relaunch, and keeps a Review data sharing control. Native status reports receipt validity without exposing credentials. All 44 consent/provider checks pass in Chromium and WebKit, including cancelled/failed setup and delayed-status races; all 67 Pencil/eraser checks still pass in both engines.
- [x] Removing a credential also removes its local consent receipt.
- [x] Privacy/support links are available inside Settings.
- [x] Privacy manifest declares AI user content, App Functionality, and no tracking.
- [x] Privacy manifest declares the app-only UserDefaults required-reason API with reason `CA92.1`.
- [x] Fresh-install handling removes orphaned AI credentials that survived an uninstall; normal upgrades retain supported credentials.
- [x] Public 1.1 privacy/support copy and App Store metadata drafts are prepared locally.
- [x] Public 1.1 provider scope is OpenAI, Anthropic, and DeepSeek. Gemini and arbitrary custom endpoints remain outside this release scope.
- [x] Automated bundle/security tests pass.
- [x] Xcode Debug simulator build succeeds without code signing.
- [x] Apple Pencil direct text highlighting uses existing highlight storage, colors, notes, and Undo/redo; automated Pointer/Touch stylus workflows pass in Chromium and WebKit.
- [x] Explicit Erase removes whole touched highlights (including stacked layers) with one reversible action per stroke. Partial Pencil overlaps reopen existing ink; 67 Pencil/eraser checks pass in each of Chromium and WebKit, including cancellation, grouped Undo/redo, and note persistence. Signed Debug device build succeeds; physical eraser testing remains required below.
- [x] Existing highlight, native touch selection, note/AI, PDF link, reading guide, iPad dock, and Zen regressions pass. The Book/Page suite has one Scroll-layout timing assertion that fails identically on the unchanged baseline; other page-turn and pinch checks pass.
- [x] Updated bundled reader builds in Xcode Release for the iPad simulator. Physical Apple Pencil behavior remains an unchecked device gate below.

## Build 14 handwriting scope and verification

- [x] Build 14 introduced default-off **Write** with pressure-sensitive, page-normalized vector strokes, black/blue/red colors, and three widths. It works on blank/scanned pages and margins without OCR; build 17 expands the palette below.
- [x] Build 14 used separate handwriting and highlight erasers with shared chronological Undo/Redo and no edits to the original PDF. Build 17 unifies the two PDF erasers as described below.
- [x] Ink lives in the chapter/library state and JSON backup. Concurrent additions merge by stroke ID; erase tombstones prevent stale restores from resurrecting deleted handwriting. Undo restores with a newer revision. The shared sync merge supports these fields; native iPad Drive/GitHub sync remains disabled.
- [x] All 27 ink state/merge tests pass, covering valid/malformed vectors, bounds, backup round-trips, concurrent merge, tombstones, Undo/Redo revisions, chapter timestamp conflicts, older records without ink fields, and duplicate-paper merges.
- [x] Build 14 handwriting checks pass 51/51 in both Chromium and WebKit, including Page/Book behavior. Existing Pencil/highlight eraser checks pass 67/67 and native AI consent/provider checks pass 44/44 in both engines. Bundle/security checks pass 13/13, zoom migration 3/3, and iPad dock 47/47. Simulated input and mock-provider success do not verify physical Pencil or live-provider behavior.
- [x] Build 14 signed Release archive succeeds and its code signature is verified. Archived reader HTML, JavaScript, CSS, and `reading-ink.js` exactly match the synced source.
- [ ] Confirm UI/export copy clearly states that **Export original PDF** and the NotebookLM PDF remain unannotated; editable handwriting travels in Phloem library/JSON backups, not those original-file exports.

## Build 15 continuous-ink repair

- [x] Rendering-only centerline/pressure smoothing passes synthetic continuity checks for slow/fast paths, tight curves, uneven sample spacing, and pressure changes without mutating stored points or pressure samples. Physical Pencil confirmation remains below.
- [x] The final renderer passes 39/39 continuity checks in `tests/reading-pdf-ink-continuity.test.js` in both Chromium and WebKit. Centerline simplification uses bounded 64-segment windows and pressure filtering is linear, keeping long-stroke preparation linear in recorded-point count; this is not a physical-device latency guarantee.
- [x] Build 15 regressions: handwriting 51/51 in Chromium and WebKit, ink state/merge 27/27, Pencil/highlight eraser 67/67 in both engines, bundle/security 13/13, and cache-update coverage 19 checks. Saved stroke IDs, erasing, chronological Undo/Redo, backup/merge behavior, and cancellation remain covered. Both Pencil suites report no page errors.
- [x] Fresh signed **1.1.0 (15)** archive built with the final bounded-window renderer. Version/build metadata, strict code signature, and exact bundled-source matches are verified; do not distribute the older build 14 archive for this repair.
- [ ] With a real Pencil on the current build 23 candidate, confirm the build 15 repair resolves the reported beaded appearance for new and previously saved strokes at several zoom levels. Automated rendering checks do not establish physical-device success.

## Build 16 Zen Undo scope and verification

The Zen dock gains a dedicated **Undo** button backed by the shared chronological handwriting/highlight history, including when Write is off. It is disabled when that history is empty; build 15's ink renderer and saved-vector format remain in scope for regression checks.

- [x] Handwriting and Zen Undo pass 67/67 checks in both Chromium and WebKit: the prior 51 handwriting checks plus 16 new Zen Undo checks. The new coverage verifies chronological handwriting/highlight Undo, operation with Write off, empty-history disabled state, Redo synchronization, saved-ink persistence with session history reset, and short-viewport dock/Find layout. No uncaught page errors occur in the Zen Undo workflows.
- [x] Existing Zen regressions pass 44/44 in both Chromium and WebKit; build 16 ink state/merge passes 27/27, iPad dock passes 47/47, bundle/security checks pass 13/13, and cache-update coverage passes 19 checks.
- [x] Visually checked screenshots of Zen Undo enabled, disabled, and beside Find in a short viewport; controls remain visible and do not overlap Find.
- [x] Fresh signed **1.1.0 (16)** archive built successfully. Version/build metadata and strict code signature are verified; archived reader HTML, JavaScript, CSS, and `reading-ink.js` exactly match the synced build 16 source.
- [ ] On a physical iPad running the exact build 19 binary, confirm the retained Zen Undo is reachable in Scroll/Page/Book, portrait/landscape, and Split View; it reverses handwriting/highlight edits in order without leaving Zen and visibly disables when no edits remain.

## Build 17 drawing and eraser update

Scope: eight always-accessible ink colors and three widths; hold Pencil still for 600 ms after a long open stroke to straighten it, adjust the endpoint before lifting; both PDF erasers remove whole handwriting strokes and text highlights, with one Undo per sweep. The text Reader's eraser is unchanged. These are local editing changes, not new AI transfers or data destinations.

- [x] Expanded palette passes 32/32 checks in both Chromium and WebKit: named choices, selected state, 44px targets, dark-paper equivalents, and five viewport sizes in Reader/Zen without scrolling or dock overlap. Screenshots visually checked.
- [x] Handwriting/Zen Undo and Pencil/highlight eraser regressions each pass 67/67 in both engines; continuity passes 39/39, existing Zen 44/44, and native AI consent/provider checks 44/44 in both engines. Ink state/merge passes 27/27, iPad dock 47/47 in Chromium, bundle/security 13/13, and cache-update coverage 19 checks.
- [x] Dedicated hold-to-straighten tests pass 48/48 and unified mixed-eraser/real-app hold integration tests pass 66/66 in both Chromium and WebKit, including cancellation, one-sweep Undo/Redo, and existing highlight notes.
- [x] Fresh signed build 17 archive succeeds; version/build metadata, strict signature, and HTML/JavaScript/CSS/ink matches after native bundle transforms are verified. The older-iPadOS palette layout fallback is included.

## Build 18 Pen/Highlighter switching

Scope: mutually exclusive Pen and Highlighter through every normal, touch, and Zen entry path, synchronized visible selected/pressed states, and cancellation when switching during a stroke. Default Pencil highlighting and native finger text selection remain available. This local editing fix adds no AI transfer or data destination; build 17's verified feature history remains above.

- [x] Build 18 regressions passed: handwriting/Zen Undo 67/67 and existing Zen 44/44 in Chromium and WebKit; unified eraser 66/66, palette 32/32, and iPad dock 47/47 in WebKit; native bundle/security 13/13 and cache-update coverage 19 checks.
- [x] Dedicated switching, selected-state, and mid-stroke cancellation checks pass 113/113 in Chromium and WebKit.
- [x] Historical signed **1.1.0 (18)** archive succeeded; version/build metadata, strict code signature, and HTML/JavaScript/CSS/ink matches against build 18 source after native transforms are verified. The verified build 17 archive does not contain this fix.
- [ ] On the exact build 19 binary with a physical iPad and Pencil, exercise every normal/touch/Zen tool entry path and switch during an unfinished stroke; verify only the active tool is selected, cancelled strokes are not saved, and native finger text selection still works.

## Build 19 highlighting and passage shortcuts

- [x] Whole-word Pencil endpoint accuracy passes 53/53 checks in Chromium and WebKit, including reversed strokes and complete endpoint words while preserving exact native finger/mouse selections.
- [x] Persistent palette behavior passes 70/70 checks in both engines: selecting Marker opens colors; color changes and paper interactions leave them available; outside chrome and tool switches dismiss them. Pen colors remain immediately available. Existing Zen checks pass 44/44 in both engines; tablet header, dock, and Zen screenshots were visually checked.
- [x] Build 21 removes Ask AI from the Highlight toolbar while retaining Define and the separate Discuss/AI workspace. Historical builds 19–20 had both toolbar shortcuts. Define uses the selected passage or latest selected highlight still on the current page and retains existing lookup, provider setup, and consent behavior.
- [x] Dedicated shortcut checks pass 43/43 in Chromium and WebKit, including stale/deleted/off-page context and no automatic AI send. Native bundle/security passes 13/13; cache-update coverage passes 19 checks.
- [ ] On the exact build 19 binary, verify Pencil endpoint accuracy, repeated color changes between marks, and shortcut context in normal/touch/Zen views with a real iPad and Pencil.

## Physical iPad and live-provider gate

- [ ] Test **Write** with a real Apple Pencil: default-off behavior, handwriting/diagrams in margins and over figures, dots and fast strokes, pressure changes, all eight colors and three widths, palm contact, and switching back to Mark. For a long open stroke, hold still for 600 ms, adjust the straightened endpoint, then lift; confirm dots and closed loops do not unexpectedly snap.
- [ ] Test both PDF erasers over handwriting, highlights, and mixed/overlapping content. One Undo must restore the whole sweep with highlight notes intact; Redo, cancellations, relaunch, and backup restore must remain correct. Confirm the text Reader's highlight eraser is unchanged.
- [ ] In Zen on build 19, use the dedicated Undo button after handwriting, text highlighting, and erasing, including with Write off; check chronological behavior, empty-history disabled state, touch/Pencil reachability, and normal reading/navigation after undoing.
- [ ] Write on blank/scanned PDFs without OCR, mixed-size/orientation pages, and different pages in a book spread. Confirm stroke placement survives Scroll/Page/Book changes, zoom/pinch, rotation, Split View, dark-paper appearance, page changes, and returning to the document.
- [ ] Verify handwriting survives offline relaunch, force quit/reboot, update from an older build, JSON backup/restore, and duplicate-paper merge. Check interrupted/background/cancelled strokes do not become stray ink or corrupt saved strokes. Confirm original-PDF exports remain original and explain where the editable ink backup lives.
- [ ] Test Apple Pencil text highlighting in PDF/Reader: all Mark colors, reverse and multiline strokes, partial-overlap reopening, jittered taps, fast Remove taps, Erase taps/sweeps over overlapping layers, grouped Undo/Redo with notes intact, relaunch, palm contact, and interruption/background cancellation. Confirm finger text selection, scrolling, pinch zoom, page turns, guide, and Zen still work. Unlike freehand Write, text highlighting requires a selectable text layer; scanned pages need OCR first.
- [ ] Install as an update over build 7 on a physical iPad; confirm the library, last page, highlights, notes, and review work survive.
- [ ] On a clean install, confirm no AI provider is ready and no credential is present.
- [ ] For OpenAI, Anthropic, and DeepSeek separately, use a disposable API key and non-sensitive sample PDF: reject consent, accept consent, send a passage question, use current-page and guide contexts, run reviewer classification/matching, handle an invalid key, handle rate limiting, then remove the key. DeepSeek has not been verified with a live key by the automated test suite.
- [ ] Upgrade from build 10 or 11: existing OpenAI/Anthropic credentials still work; DeepSeek requires its own explicit consent and key. Confirm model availability with the tester's own DeepSeek API account.
- [ ] Confirm the key is absent from localStorage, IndexedDB exports, JSON backups, logs, crash output, screenshots, and review-share files.
- [ ] Confirm the provider host shown in the disclosure matches App Privacy Report/network activity.
- [ ] Test airplane mode, slow network, request timeout, background/foreground during a request, rotation, Split View, keyboard display, and relaunch.
- [ ] Re-run the core reader regression list: small/large/scanned/two-column PDF, DOCX, Book mode, guide, Zen, search, highlights, notes, imports/exports, external links, OCR, force quit, reboot, and offline reading.
- [ ] Test the oldest supported iPadOS version or raise the deployment target.

## Privacy and App Store gate

- [x] Re-read DeepSeek's current official platform terms and privacy policy for this integration; document the native key safeguards, China processing disclosure, and absence of an API-specific no-training/fixed-retention promise. Gemini and custom endpoints remain held.
- [ ] Reconfirm all shipping providers' current account terms, region availability, permitted provider identification, and privacy disclosures on the submission date.
- [x] Public `phloem-ipad/privacy.html` and `support.html` updates were verified live. Recheck reachability before submission; build 19's shortcuts reuse existing destinations and consent, and opening Ask AI alone sends nothing.
- [ ] Update App Store Connect privacy answers: Other User Content and User ID, linked to the user, App Functionality, no tracking; evaluate additional purposes for provider-controlled secondary use (including DeepSeek) before finalizing. Do not assume App Functionality only without that review.
- [ ] Confirm the archive privacy report matches the App Store Connect answers.
- [ ] Paste the prepared AI behavior and setup steps into App Review Notes; provide a dedicated working reviewer key or a fully featured demo path, then revoke the key after review.
- [ ] Re-answer the age-rating questionnaire and confirm the 18+ AI gate and shipping-provider region restrictions.
- [x] App declares that it does not use non-exempt encryption; recheck this if a non-Apple networking or cryptography SDK is added.

## TestFlight, media, and submission gate

- [x] Prior build **1.1.0 (13)** was archived and verified, including code signature and bundled reader HTML/JavaScript/CSS. That archive contains the consent fix, not the new handwriting feature.
- [x] Historical build **1.1.0 (14)** was synced, archived, and verified. Archive metadata/code signature and bundled reader HTML/JavaScript/CSS plus `reading-ink.js` matched that build's synced source. Local archive: `~/Library/Developer/Xcode/Archives/2026-09-28/Phloem 1.1.0 (14).xcarchive`. It does not contain the build 15 rendering repair.
- [x] Historical **1.1.0 (15)** was synced and archived with the final renderer at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (15).xcarchive`. Xcode archive succeeded; metadata confirms 1.1.0/build 15; strict code-signature verification passes; archived HTML, reader JavaScript, CSS, and `reading-ink.js` exactly matched the synced build 15 source. It does not contain Zen Undo.
- [x] Historical **1.1.0 (16)** was synced and archived at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (16).xcarchive`. Xcode archive succeeded; metadata, strict signature, and bundled-source matches were verified against build 16 source. It lacks build 17's drawing and unified-eraser update.
- [x] Historical **1.1.0 (17)** was archived at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (17).xcarchive`. Xcode succeeded; version/build metadata, strict signature, and bundled-source matches after native transforms are verified. It lacks build 18's Pen/Highlighter switching fix.
- [x] Historical **1.1.0 (18)** was archived at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (18).xcarchive`. Xcode succeeded; version/build metadata, strict signature, and bundled-source matches against build 18 source after native transforms are verified. It lacks build 19's changes.
- [x] Signed **1.1.0 (19)** archive succeeded at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (19).xcarchive`. Version/build metadata, strict code signature, and exact HTML/JavaScript/CSS/ink-source matches against the synced build 19 source after native transforms are verified.
- [x] Signed **1.1.0 (20)** archive verified at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-30/Phloem 1.1.0 (20).xcarchive`: Xcode success, version/build, strict code signature, and bundled-source matches after native transforms. Bottom toolbar 113/113, passage actions 43/43, Zen 44/44, and the core annotation regressions pass both Chromium and WebKit; native bundle/security passes 13/13.
- [x] Created **1.1.0 (22)** at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-30/Phloem 1.1.0 (22).xcarchive` with Xcode 27.0. Release archive succeeded; native bundle/security tests pass 13/13. Version/build, strict code signature, all 54 asset hashes, the index/reader entrypoints, and HTML/JavaScript/CSS/ink-source matches after native transforms were verified.
- [x] Created **1.1.0 (23)** at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-30/Phloem 1.1.0 (23).xcarchive` with Xcode 27.0. Release archive succeeded; native bundle/security tests pass 13/13. Version/build, strict code signature, all 54 asset hashes, the index/reader entrypoints, and HTML/JavaScript/CSS/ink-source matches after native transforms were verified. This supersedes build 22 with Fine as the default pen size.
- [ ] Validate and upload build 23 through Xcode Organizer; do not retry an already uploaded build number. Local verification is not App Store Connect acceptance.
- [ ] Test the exact TestFlight binary on a physical iPad, including a fresh install and update from 1.0.
- [ ] Capture new screenshots from the exact 1.1 UI. Do not add marketing frames that make screenshots look like app previews.
- [ ] If adding an app preview, use only full-screen app footage at Apple's accepted dimensions; narration/text overlays are optional, external device frames are not.
- [ ] Confirm description, What's New, support URL, privacy URL, screenshots, and optional preview all describe the submitted build accurately.
- [ ] Re-answer the current age-rating questionnaire and make the 18+ AI eligibility clear in the listing and review notes.
- [ ] Submit 1.1 only when every required box above is complete.
