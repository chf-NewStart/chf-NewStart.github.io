# Phloem for iPad

This Capacitor app packages the Phloem paper reader for iPad. App Store version 1.0 build 7 is the live no-AI release. This checkout is the **1.1.0 build 16 release-candidate track** for the next update. App Store Connect has already received builds 8, 9, 10, and 11. Build 12 added DeepSeek and the corrected icon; build 13 fixed the consent panel remaining open after successful setup. Build 14 added freehand PDF handwriting. Build 15 addresses the reported beaded appearance with rendering-only centerline and pressure smoothing; recorded stroke points and existing gestures remain unchanged. Build 16 retains that repair and adds a dedicated Undo button to the Zen dock for the shared handwriting/highlight history. An older archive does not gain these changes when the project build number changes.

The 1.1 target compiles for the iPad simulator and its automated bundle/security checks pass. It is not release-ready until the physical-iPad, provider, privacy, TestFlight, and media gates in [`release/RELEASE-CHECKLIST-1.1.md`](release/RELEASE-CHECKLIST-1.1.md) pass.

## Build it

Requirements: Xcode 26 or newer, Node.js 22 or newer, and an Apple Account for device signing. The deployment target is iPadOS 15.

```sh
git clone https://github.com/chf-NewStart/chf-NewStart.github.io.git phloem-ipad
cd phloem-ipad/apps/ipad
npm ci
npm test
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Confirm the **App** target shows Version **1.1.0** and Build **16**.
2. Under **Signing & Capabilities**, select the correct Team and keep automatic signing enabled.
3. Connect a physical iPad, trust the Mac, enable Developer Mode if requested, and choose it as the run destination.
4. Use disposable documents and provider keys for the release checklist. Do not test with confidential or third-party personal data.

After changing the shared reader or native adapter, run `npm run ios:sync` before building. `ios:open` alone does not rebuild the bundled web app.

The historical signed Release archive **1.1.0 (14)** was created and code-signature verified; it does not contain build 15's ink-smoothing fix. The historical signed **1.1.0 (15)** archive was built and verified at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (15).xcarchive`. Archive metadata confirms version 1.1.0/build 15, strict code-signature verification passes, and its HTML, reader JavaScript, CSS, and final handwriting renderer exactly matched the synced build 15 source. That archive does not contain the Zen Undo button. A fresh signed **1.1.0 (16)** archive has been built and verified at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (16).xcarchive`. Its metadata confirms build 16, strict code-signature verification passes, and archived HTML, reader JavaScript, CSS, and `reading-ink.js` exactly match the synced source. Upload and physical-device verification remain pending. Confirm Organizer shows **1.1.0 (16)** before distributing it. If that build number has since been uploaded, use the next unused number and create a fresh archive; changing the project number does not update an older archive.

## Included in 1.1

- Shared PDF/Word reader, Book mode, guide, Zen mode, search, highlights, notes, review workflows, and document import.
- Freehand handwriting on PDF pages with Apple Pencil: explicitly turn on **Write**, choose Pen, one of three colors (black, blue, red), and a fine, medium, or broad width. Pressure-sensitive vector strokes stay anchored to each page through zoom and layout changes. Margins, figures, blank pages, and scanned PDFs can be written on without OCR or selectable text. Write is off by default; fingers remain available for scrolling and zooming.
- Build 15 smooths the displayed stroke centerline and pressure transitions for continuous-looking handwriting. This is a rendering change, not a rewrite of saved points, pressure samples, stroke IDs, erase history, or backup data; previously saved handwriting also uses the corrected renderer.
- Long strokes use bounded 64-segment centerline-simplification windows and linear pressure filtering, keeping rendering preparation linear in recorded-point count rather than comparing every point with every other point. This bounds algorithmic work; it is not a measured Apple Pencil latency guarantee.
- **Write → Eraser** removes whole handwriting strokes, separately from **Mark → Erase**, which removes text highlights. Handwriting and highlighting share the chronological Undo/Redo controls. This is focused PDF inking, not a claim of full Notability feature parity or handwriting recognition.
- Build 16 adds **Undo** directly to the Zen dock, so the latest handwriting or highlight edit can be reversed without leaving Zen, including when Write is off. It uses the shared chronological history and is disabled when that history is empty.
- Direct Apple Pencil text highlighting: drag across a passage and lift to save in the selected Mark color. Drawing over saved ink reopens it without stacking another highlight. Choose **Mark → Erase**, then tap or sweep the Pencil to remove whole highlights (including overlapping layers); one Undo restores the stroke's highlights and notes. Choose a color to highlight again, or tap saved ink and use **Remove highlight**. Finger selection, scrolling, and page gestures remain available. PDFs need a selectable text layer; scanned pages need OCR first.
- Bundled PDF.js, English OCR, fonts, and the Phloem field guide. Local reading does not load the website.
- Optional bring-your-own-key AI through fixed native integrations for OpenAI, Anthropic, and DeepSeek. Each provider uses its own consent and saved credential; adding DeepSeek does not send requests to it automatically.
- API keys entered in a native iOS secure prompt and stored with Keychain using `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; stored keys are never returned to JavaScript or included in Phloem backup files.
- Native `URLSession` requests with ephemeral storage, HTTPS-only fixed provider hosts, redirect host enforcement, payload validation, and no custom endpoints.
- A provider-specific disclosure and affirmative consent before a key is enabled. Removing a key also removes that provider's local consent receipt.
- A privacy manifest declaring optional AI user content, the provider account identifier, and no tracking.
- Wikipedia/Wikimedia lookups and external links only when the user deliberately opens those online features.

Gemini API, Chrome on-device AI, Drive/GitHub sync, credential setup links, AI-pass links, website installation controls, and arbitrary OpenAI-compatible endpoints remain unavailable in the iPad app.

## What AI sends

Only after the user configures a provider, accepts its disclosure, and deliberately invokes an AI action, Phloem can send:

- the selected passage, current page text, or guide context chosen for the request;
- the user's question and the prior turns in that Phloem discussion;
- for reviewer tools, extracted reviewer text and locally selected candidate excerpts.

Phloem does not upload the original PDF or Word file to the AI provider. The chosen provider receives the request, API credential, and ordinary network information and handles them under its own terms. Provider-specific risks and release disclosures are tracked in [`release/AI-PRIVACY-1.1.md`](release/AI-PRIVACY-1.1.md).

## Local data and migration

PDFs currently use IndexedDB; notes/settings and page-anchored handwriting vectors use localStorage plus recovery snapshots. This is app-local web storage, not a native database or a verified durability guarantee. Safari, the browser extension, and the iPad app have separate storage containers.

The JSON backup includes typed notes, highlights, handwriting vectors, handwriting erase history, and metadata, but not PDF files or API credentials. Ink merge uses stroke IDs, revision timestamps, and erase tombstones so stale backup imports cannot restore erased strokes. The shared browser sync path uses the same merge; Drive/GitHub sync remains unavailable in the native iPad app.

**Export original PDF still exports the unannotated original file.** It does not embed handwriting or Phloem highlights. The NotebookLM package likewise contains the original PDF, not a handwritten-PDF export. Keep a Phloem JSON backup for your editable handwriting and retain the original document separately. Avoid uninstalling the app with the only copy of a paper or annotation inside it. A legacy browser-stored AI key is scrubbed in the native build and must be entered again to move it into Keychain.

## Verification

Automated checks:

```sh
npm test
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

The Node suite checks dependency closure, guarded native transforms, blocked setup links, Keychain-only AI metadata, native bridge routing, and build identity. The Xcode command verifies that the native plugin and generated bundle compile together. Neither replaces physical-device or live-provider testing.

From the repository root, `node --test tests/reading-pdf-ink-state.test.js` checks vector normalization, concurrent ink merge, erase/Undo revisions, backup round-trips, and actual library/duplicate-paper merge paths. Physical Pencil validation must cover pressure, palm contact, blank/scanned and mixed-size pages, dark paper, Scroll/Page/Book, zoom, relaunch, and interruptions before release.

Build 14 automated results: handwriting 51/51 in both Chromium and WebKit, ink state/merge 27/27, existing Pencil/highlight eraser 67/67 in both engines, native AI consent/providers 44/44 in both engines, bundle/security 13/13, zoom migration 3/3, and iPad dock 47/47. These are simulated input/mock-provider checks, not a substitute for a real Pencil or live AI-provider test.

To verify the retained build 15 repair in the current candidate, run `node tests/reading-pdf-ink-continuity.test.js` and `PHLOEM_BROWSER=webkit node tests/reading-pdf-ink-continuity.test.js` with the browser-test dependencies installed for rendering continuity and saved-point preservation, and rerun handwriting, ink-state, and Pencil/highlight eraser regressions. On a physical iPad, compare slow and fast strokes, tight curves, light/heavy pressure, and existing saved ink at different zoom levels. The reported beading is not considered device-verified until that exact new build is tested with a real Pencil.

Build 15 automated results: continuity 39/39 in both Chromium and WebKit, handwriting 51/51 in both engines, ink state/merge 27/27, Pencil/highlight eraser 67/67 in both engines, bundle/security 13/13, and cache-update coverage 19 checks. Its final signed archive is verified; actual Pencil behavior and upload remain unchecked release gates.

Build 16 automated results: handwriting and Zen Undo pass 67/67 in both Chromium and WebKit, comprising the prior 51 handwriting checks and 16 new Zen Undo checks. Coverage includes shared chronological history, Write off, empty-history state, Redo synchronization, saved-ink persistence, and short-viewport dock/Find layout. Existing Zen regressions pass 44/44 in both engines, ink state/merge passes 27/27, iPad dock passes 47/47, bundle/security checks pass 13/13, and cache-update coverage passes 19 checks. Enabled, disabled, and short-viewport Find screenshots were visually checked; the signed archive is verified. On the exact build 16 binary on a physical iPad, confirm the button stays reachable in Zen at each supported layout and orientation, reverses handwriting, highlights, and erasures in order, becomes disabled when history is exhausted, and leaves the build 15 continuity repair intact. Upload and physical-device validation remain pending.

## Build structure

`native/` contains the iPad environment/UI adapter; `ios/` contains the Xcode project and native AI bridge. `scripts/build-web.mjs` reads the shared reader from the repository root and writes ignored `www/` output.

The bundler uses an explicit asset allowlist, checks dependencies, disables website service-worker registration and unsupported browser sync paths, and records hashes in `www/bundle-manifest.json`. Generated web assets and installed dependencies stay out of git. See `licenses/PROVENANCE.md` for vendored dependency sources.
