# Phloem 1.1 release checklist

Version target: **1.1.0 (10)**. Version 1.0 build 7 is Ready for Distribution. App Store Connect has already received builds 8 and 9 and rejects another upload using those build numbers. Sync the current reader and create a fresh build 10 Release archive; retrying or selecting an old build 8 or 9 archive cannot include this build-number change. If build 10 has also been uploaded, increment to the next unused build number before creating another archive.

## Implemented and locally verified

- [x] Native Capacitor AI plugin registered in the iPad view controller.
- [x] OpenAI and Anthropic use fixed HTTPS destinations through native `URLSession`.
- [x] Cross-host redirects are rejected; arbitrary custom endpoints are not available.
- [x] API keys are stored in iOS Keychain with this-device-only, unlocked-device accessibility.
- [x] A native iOS secure prompt collects new credentials; after saving, JavaScript receives only credential-presence metadata and never the stored credential.
- [x] Native startup scrubs legacy browser-stored AI keys instead of silently migrating them.
- [x] Provider-specific data disclosure, privacy link, and affirmative consent are required before enabling a credential.
- [x] Removing a credential also removes its local consent receipt.
- [x] Privacy/support links are available inside Settings.
- [x] Privacy manifest declares AI user content, App Functionality, and no tracking.
- [x] Privacy manifest declares the app-only UserDefaults required-reason API with reason `CA92.1`.
- [x] Fresh-install handling removes orphaned AI credentials that survived an uninstall; normal upgrades retain supported credentials.
- [x] Public 1.1 privacy/support copy and App Store metadata drafts are prepared locally.
- [x] Public 1.1 provider scope is OpenAI and Anthropic; Gemini and DeepSeek are blocked in both the native UI and bridge.
- [x] Automated bundle/security tests pass.
- [x] Xcode Debug simulator build succeeds without code signing.
- [x] Apple Pencil direct text highlighting uses existing highlight storage, colors, notes, and Undo/redo; automated Pointer/Touch stylus workflows pass in Chromium and WebKit.
- [x] Explicit Erase removes whole touched highlights (including stacked layers) with one reversible action per stroke. Partial Pencil overlaps reopen existing ink; 67 Pencil/eraser checks pass in each of Chromium and WebKit, including cancellation, grouped Undo/redo, and note persistence. Signed Debug device build succeeds; physical eraser testing remains required below.
- [x] Existing highlight, native touch selection, note/AI, PDF link, reading guide, iPad dock, and Zen regressions pass. The Book/Page suite has one Scroll-layout timing assertion that fails identically on the unchanged baseline; other page-turn and pinch checks pass.
- [x] Updated bundled reader builds in Xcode Release for the iPad simulator. Physical Apple Pencil behavior remains an unchecked device gate below.

## Physical iPad and live-provider gate

- [ ] Test Apple Pencil on a physical iPad: direct highlighting in PDF/Reader, all Mark colors, reverse and multiline strokes, partial-overlap reopening, jittered taps, fast Remove taps, Erase taps/sweeps over overlapping layers, grouped Undo/redo with notes intact, relaunch, palm contact, and interruption/background cancellation. Confirm finger text selection, scrolling, pinch zoom, page turns, guide, and Zen still work. Scanned PDFs require a selectable OCR text layer.
- [ ] Install as an update over build 7 on a physical iPad; confirm the library, last page, highlights, notes, and review work survive.
- [ ] On a clean install, confirm no AI provider is ready and no credential is present.
- [ ] For OpenAI and Anthropic, use a disposable API key and non-sensitive sample PDF: reject consent, accept consent, send a passage question, use current-page and guide contexts, run reviewer classification/matching, handle an invalid key, handle rate limiting, then remove the key.
- [ ] Confirm the key is absent from localStorage, IndexedDB exports, JSON backups, logs, crash output, screenshots, and review-share files.
- [ ] Confirm the provider host shown in the disclosure matches App Privacy Report/network activity.
- [ ] Test airplane mode, slow network, request timeout, background/foreground during a request, rotation, Split View, keyboard display, and relaunch.
- [ ] Re-run the core reader regression list: small/large/scanned/two-column PDF, DOCX, Book mode, guide, Zen, search, highlights, notes, imports/exports, external links, OCR, force quit, reboot, and offline reading.
- [ ] Test the oldest supported iPadOS version or raise the deployment target.

## Privacy and App Store gate

- [x] Re-read current provider terms and restrict 1.1 to OpenAI and Anthropic. Gemini and DeepSeek remain held pending a compatible architecture and release decision.
- [ ] Publish the prepared `phloem-ipad/privacy.html` and `support.html` updates before the first external TestFlight or App Review submission.
- [ ] Update App Store Connect privacy answers: Other User Content and User ID, linked to the user, App Functionality only, no tracking.
- [ ] Confirm the archive privacy report matches the App Store Connect answers.
- [ ] Paste the prepared AI behavior and setup steps into App Review Notes; provide a dedicated working reviewer key or a fully featured demo path, then revoke the key after review.
- [ ] Re-answer the age-rating questionnaire and confirm the 18+ AI gate and shipping-provider region restrictions.
- [x] App declares that it does not use non-exempt encryption; recheck this if a non-Apple networking or cryptography SDK is added.

## TestFlight, media, and submission gate

- [ ] Run `npm run ios:sync`, archive a signed Release build, confirm Organizer shows **1.1.0 (10)**, and upload that new archive to internal TestFlight. Do not retry a build 8 or 9 archive.
- [ ] Test the exact TestFlight binary on a physical iPad, including a fresh install and update from 1.0.
- [ ] Capture new screenshots from the exact 1.1 UI. Do not add marketing frames that make screenshots look like app previews.
- [ ] If adding an app preview, use only full-screen app footage at Apple's accepted dimensions; narration/text overlays are optional, external device frames are not.
- [ ] Confirm description, What's New, support URL, privacy URL, screenshots, and optional preview all describe the submitted build accurately.
- [ ] Re-answer the current age-rating questionnaire and make the 18+ AI eligibility clear in the listing and review notes.
- [ ] Submit 1.1 only when every required box above is complete.
