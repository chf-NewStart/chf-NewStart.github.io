# Phloem 1.1 release checklist

Version target: **1.1.0 (8)**. Start this release only after version 1.0 build 7 is accepted/released or otherwise no longer in review.

## Implemented and locally verified

- [x] Native Capacitor AI plugin registered in the iPad view controller.
- [x] Gemini, DeepSeek, OpenAI, and Anthropic use fixed HTTPS destinations through native `URLSession`.
- [x] Cross-host redirects are rejected; arbitrary custom endpoints are not available.
- [x] API keys are stored in iOS Keychain with this-device-only, unlocked-device accessibility.
- [x] A native iOS secure prompt collects new credentials; after saving, JavaScript receives only credential-presence metadata and never the stored credential.
- [x] Native startup scrubs legacy browser-stored AI keys instead of silently migrating them.
- [x] Provider-specific data disclosure, privacy link, and affirmative consent are required before enabling a credential.
- [x] Removing a credential also removes its local consent receipt.
- [x] Privacy/support links are available inside Settings.
- [x] Privacy manifest declares AI user content, App Functionality, and no tracking.
- [x] Automated bundle/security tests pass.
- [x] Xcode Debug simulator build succeeds without code signing.

## Physical iPad and live-provider gate

- [ ] Install as an update over build 7 on a physical iPad; confirm the library, last page, highlights, notes, and review work survive.
- [ ] On a clean install, confirm no AI provider is ready and no credential is present.
- [ ] For each provider, use a disposable API key and non-sensitive sample PDF: reject consent, accept consent, send a passage question, use current-page and guide contexts, run reviewer classification/matching, handle an invalid key, handle rate limiting, then remove the key.
- [ ] Confirm the key is absent from localStorage, IndexedDB exports, JSON backups, logs, crash output, screenshots, and review-share files.
- [ ] Confirm the provider host shown in the disclosure matches App Privacy Report/network activity.
- [ ] Test airplane mode, slow network, request timeout, background/foreground during a request, rotation, Split View, keyboard display, and relaunch.
- [ ] Re-run the core reader regression list: small/large/scanned/two-column PDF, DOCX, Book mode, guide, Zen, search, highlights, notes, imports/exports, external links, OCR, force quit, reboot, and offline reading.
- [ ] Test the oldest supported iPadOS version or raise the deployment target.

## Privacy and App Store gate

- [ ] Re-read current provider terms and decide whether all four providers should ship in every sales region.
- [ ] Update and publish `phloem-ipad/privacy.html` for 1.1 only after the live 1.0 review is complete.
- [ ] Update App Store Connect privacy answers: Other User Content and User ID, linked to the user, App Functionality only, no tracking.
- [ ] Confirm the archive privacy report matches the App Store Connect answers.
- [ ] Put the AI behavior and setup steps in App Review Notes; provide a working reviewer test path/key if Apple needs one, then revoke it after review.
- [ ] Re-answer the age-rating questionnaire and check provider age/region restrictions, especially Gemini plan restrictions.
- [ ] Confirm export-compliance answers for the final archive.

## TestFlight, media, and submission gate

- [ ] Archive a signed Release build and upload it to internal TestFlight.
- [ ] Test the exact TestFlight binary on a physical iPad, including a fresh install and update from 1.0.
- [ ] Capture new screenshots from the exact 1.1 UI. Do not add marketing frames that make screenshots look like app previews.
- [ ] If adding an app preview, use only full-screen app footage at Apple's accepted dimensions; narration/text overlays are optional, external device frames are not.
- [ ] Confirm description, What's New, support URL, privacy URL, screenshots, and optional preview all describe the submitted build accurately.
- [ ] Submit 1.1 only when every required box above is complete.
