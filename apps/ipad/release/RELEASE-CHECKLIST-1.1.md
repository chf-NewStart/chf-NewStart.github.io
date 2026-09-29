# Phloem 1.1 release checklist

Version target: **1.1.0 (16)**. Version 1.0 build 7 is Ready for Distribution. App Store Connect has already received builds 8, 9, 10, and 11 and rejects another upload using those build numbers. Build 12 added DeepSeek and the corrected icon; build 13 fixed the consent panel remaining open after successful setup. Build 14 added explicit Write mode for freehand PDF handwriting. Build 15 addresses reported beading with rendering-only centerline and pressure smoothing while preserving saved points and gestures. Its historical signed Release archive is verified locally. Build 16 retains that repair and adds a dedicated Zen Undo button using the shared handwriting/highlight history; its signed archive and automated checks are verified locally. Upload and physical-device verification remain pending. Build 14 lacks the continuity repair, and build 15 lacks Zen Undo. If build 16 has already been uploaded, increment to the next unused build number before creating another archive.

## Implemented and locally verified

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

- [x] Separate, default-off **Write** mode stores pressure-sensitive, page-normalized vector strokes. Pen has black/blue/red colors and three widths; it works on blank/scanned pages and margins without OCR.
- [x] Write's stroke eraser is separate from Mark's text-highlight eraser. Both use the shared chronological Undo/Redo trail without editing the original PDF.
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
- [ ] With a real Pencil on the current build 16 candidate, confirm the build 15 repair resolves the reported beaded appearance for new and previously saved strokes at several zoom levels. Automated rendering checks do not establish physical-device success.

## Build 16 Zen Undo scope and verification

The Zen dock gains a dedicated **Undo** button backed by the shared chronological handwriting/highlight history, including when Write is off. It is disabled when that history is empty; build 15's ink renderer and saved-vector format remain in scope for regression checks.

- [x] Handwriting and Zen Undo pass 67/67 checks in both Chromium and WebKit: the prior 51 handwriting checks plus 16 new Zen Undo checks. The new coverage verifies chronological handwriting/highlight Undo, operation with Write off, empty-history disabled state, Redo synchronization, saved-ink persistence with session history reset, and short-viewport dock/Find layout. No uncaught page errors occur in the Zen Undo workflows.
- [x] Existing Zen regressions pass 44/44 in both Chromium and WebKit; build 16 ink state/merge passes 27/27, iPad dock passes 47/47, bundle/security checks pass 13/13, and cache-update coverage passes 19 checks.
- [x] Visually checked screenshots of Zen Undo enabled, disabled, and beside Find in a short viewport; controls remain visible and do not overlap Find.
- [x] Fresh signed **1.1.0 (16)** archive built successfully. Version/build metadata and strict code signature are verified; archived reader HTML, JavaScript, CSS, and `reading-ink.js` exactly match the synced build 16 source.
- [ ] On a physical iPad running the exact build 16 binary, confirm Zen Undo is reachable in Scroll/Page/Book, portrait/landscape, and Split View; it reverses handwriting/highlight edits in order without leaving Zen and visibly disables when no edits remain.

## Physical iPad and live-provider gate

- [ ] Test **Write** with a real Apple Pencil: default-off behavior, handwriting/diagrams in margins and over figures, dots and fast strokes, pressure changes, all three colors/widths, whole-stroke Eraser, shared Undo/Redo alternating handwriting and text highlights, palm contact, and deliberate switching back to Mark.
- [ ] In Zen on build 16, use the dedicated Undo button after handwriting, text highlighting, and erasing, including with Write off; check chronological behavior, empty-history disabled state, touch/Pencil reachability, and normal reading/navigation after undoing.
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
- [ ] Publish the prepared `phloem-ipad/privacy.html` and `support.html` updates before the first external TestFlight or App Review submission.
- [ ] Update App Store Connect privacy answers: Other User Content and User ID, linked to the user, App Functionality, no tracking; evaluate additional purposes for provider-controlled secondary use (including DeepSeek) before finalizing. Do not assume App Functionality only without that review.
- [ ] Confirm the archive privacy report matches the App Store Connect answers.
- [ ] Paste the prepared AI behavior and setup steps into App Review Notes; provide a dedicated working reviewer key or a fully featured demo path, then revoke the key after review.
- [ ] Re-answer the age-rating questionnaire and confirm the 18+ AI gate and shipping-provider region restrictions.
- [x] App declares that it does not use non-exempt encryption; recheck this if a non-Apple networking or cryptography SDK is added.

## TestFlight, media, and submission gate

- [x] Prior build **1.1.0 (13)** was archived and verified, including code signature and bundled reader HTML/JavaScript/CSS. That archive contains the consent fix, not the new handwriting feature.
- [x] Historical build **1.1.0 (14)** was synced, archived, and verified. Archive metadata/code signature and bundled reader HTML/JavaScript/CSS plus `reading-ink.js` matched that build's synced source. Local archive: `~/Library/Developer/Xcode/Archives/2026-09-28/Phloem 1.1.0 (14).xcarchive`. It does not contain the build 15 rendering repair.
- [x] Historical **1.1.0 (15)** was synced and archived with the final renderer at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (15).xcarchive`. Xcode archive succeeded; metadata confirms 1.1.0/build 15; strict code-signature verification passes; archived HTML, reader JavaScript, CSS, and `reading-ink.js` exactly matched the synced build 15 source. It does not contain Zen Undo.
- [x] Synced and archived **1.1.0 (16)** at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (16).xcarchive`. Xcode archive succeeded; metadata confirms 1.1.0/build 16; strict code-signature verification passes; archived HTML, reader JavaScript, CSS, and `reading-ink.js` exactly match the synced source.
- [ ] Upload the new **1.1.0 (16)** archive to internal TestFlight. Do not retry an already uploaded build number.
- [ ] Test the exact TestFlight binary on a physical iPad, including a fresh install and update from 1.0.
- [ ] Capture new screenshots from the exact 1.1 UI. Do not add marketing frames that make screenshots look like app previews.
- [ ] If adding an app preview, use only full-screen app footage at Apple's accepted dimensions; narration/text overlays are optional, external device frames are not.
- [ ] Confirm description, What's New, support URL, privacy URL, screenshots, and optional preview all describe the submitted build accurately.
- [ ] Re-answer the current age-rating questionnaire and make the 18+ AI eligibility clear in the listing and review notes.
- [ ] Submit 1.1 only when every required box above is complete.
