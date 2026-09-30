# Phloem for iPad

This checkout targets **1.1.0 build 24**, reader cache **v143**. Build 24 moves the reading-guide grip to the band's left edge so it stays clear of the zen dock in zen mode; nothing else about the guide changes. Both bottom annotation toolbars are compact: Highlight retains colors, Eraser, Define, Undo, and Done; Pen retains all eight colors, icon-only Pen/Eraser, three widths, Undo/Redo, and Done. The first size, Fine (1.5), is now the default; existing saved strokes are unchanged. Pen fits one 60px-high row in iPad landscape and wraps on narrower screens without shrinking 44px touch targets. Instructions remain available to screen readers. Discuss/AI remains unchanged; Natural ink and jitter-tolerant straightening are described below. Native assets must be synced before building. Build 24 was archived on September 30, 2026 and passed strict code-signature, version/build, 54 bundled-asset hashes, exact source comparisons after native transforms, and left-grip tests in Chromium and WebKit. Distribution validation/upload and physical-iPad testing remain pending.

Current archive: `/Users/chf/Library/Developer/Xcode/Archives/2026-09-30/Phloem 1.1.0 (24).xcarchive`. Select **1.1.0 (24)** in Xcode Organizer to validate and distribute to App Store Connect. The archive is locally signed; this does not mean Apple has accepted the upload or approved the app.

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

1. Confirm the **App** target shows Version **1.1.0** and Build **24**.
2. Under **Signing & Capabilities**, select the correct Team and keep automatic signing enabled.
3. Connect a physical iPad, trust the Mac, enable Developer Mode if requested, and choose it as the run destination.
4. Use disposable documents and provider keys for the release checklist. Do not test with confidential or third-party personal data.

After changing the shared reader or native adapter, run `npm run ios:sync` before building. `ios:open` alone does not rebuild the bundled web app.

Historical signed archives **1.1.0 (14)**, **(15)**, and **(16)** were built and verified locally. Build 15 added the ink-smoothing fix; build 16 added Zen Undo. They do not contain build 17's new features. The historical **1.1.0 (17)** archive at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (17).xcarchive` has verified version/build metadata, a strict code signature, and exact HTML/JavaScript/CSS/ink-source matches after the native bundle transforms, including the older-iPadOS palette layout fallback. It lacks build 18's Pen/Highlighter switching fix. The historical **1.1.0 (18)** archive at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (18).xcarchive` also passed version/build, strict code-signature, and exact bundled-source verification against the build 18 source after native transforms. The current **1.1.0 (19)** archive at `/Users/chf/Library/Developer/Xcode/Archives/2026-09-29/Phloem 1.1.0 (19).xcarchive` passes the same checks against build 19 source. Check App Store Connect for an already used build number before uploading; if 19 is used, increment to the next unused number and archive again.

## Included in 1.1

- Pencil hover no longer opens PDF reference or external-link previews. It dismisses an existing preview and cancels pending preview results. Mouse hover, keyboard focus, and deliberate link navigation remain available.
- Natural ink is the default for new strokes: gentler pressure variation and subtle endpoint tapering, with no texture or random jitter. Settings → PDF → New ink switches between Natural and Clean without expanding the Pen bar. The preference stays on this device; each Natural stroke stores its style in the library and JSON backups. Older strokes retain their Clean appearance. Held straight lines keep a steady width. The 600ms hold now tolerates dense stationary Pencil jitter and shows a confirmation when a line snaps; physical-iPad validation remains required.
- Rename a paper by tapping its open reader title, choosing Rename on its library wall cover, or using List → Actions → Rename. Custom names persist without changing the original filename or annotations, and are not replaced by automatic PDF-title repair. Continue reading offers up to six recent papers in a horizontally scrollable row.
- Shared PDF/Word reader, Book mode, guide, Zen mode, search, highlights, notes, review workflows, and document import.
- Freehand handwriting on PDF pages with Apple Pencil: explicitly turn on **Write**, choose Pen, one of eight colors (black, blue, red, green, purple, orange, teal, gray), and a fine, medium, or broad width. Pressure-sensitive vector strokes stay anchored to each page through zoom and layout changes. Margins, figures, blank pages, and scanned PDFs can be written on without OCR or selectable text. Write is off by default; fingers remain available for scrolling and zooming.
- Build 18 makes Pen and Highlighter mutually exclusive through normal, touch, and Zen controls, synchronizes visible selected/pressed states, and cancels an unfinished stroke when switching tools. Default Pencil highlighting and native finger text selection remain available.
- Build 19 opens highlight colors when Marker is selected and keeps them available through color changes and paper interactions in normal, touch, and Zen views. Write still exposes all eight Pen colors immediately. Other controls, dismissal, or switching tools close the relevant palette.
- The bottom Highlight toolbar includes **Define** for the selected passage or the latest selected highlight still on the current page. It reuses existing lookup and consent-checked AI fallback. Ask AI is available separately through Discuss, not this toolbar.
- For a long open stroke, pause with Pencil held down for 600 ms to straighten it. Keep Pencil down to adjust the endpoint, then lift to save. Short strokes, dots, and closed loops are not intended to snap.
- Build 15 smooths the displayed stroke centerline and pressure transitions for continuous-looking handwriting. This is a rendering change, not a rewrite of saved points, pressure samples, stroke IDs, erase history, or backup data; previously saved handwriting also uses the corrected renderer.
- Long strokes use bounded 64-segment centerline-simplification windows and linear pressure filtering, keeping rendering preparation linear in recorded-point count rather than comparing every point with every other point. This bounds algorithmic work; it is not a measured Apple Pencil latency guarantee.
- On PDFs, both **Write → Eraser** and **Mark → Erase** remove touched handwriting strokes and text highlights; one Undo reverses the whole sweep, including highlight notes. The text Reader's highlight eraser is unchanged. Handwriting and highlighting share chronological Undo/Redo. This is focused PDF inking, not a claim of full Notability feature parity or handwriting recognition.
- Build 16 adds **Undo** directly to the Zen dock, so the latest handwriting or highlight edit can be reversed without leaving Zen, including when Write is off. It uses the shared chronological history and is disabled when that history is empty.
- Direct Apple Pencil text highlighting: drag across a passage and lift to save in the selected Mark color. Build 19 includes the whole words at the Pencil stroke's endpoints; native finger/mouse selection remains exact. Drawing over a saved highlight reopens it without stacking another. On a PDF, **Mark → Erase** removes both whole highlights (including overlapping layers) and touched handwriting; one Undo restores the sweep's strokes, highlights, and notes. Choose a color to highlight again, or tap a saved highlight and use **Remove highlight**. Finger selection, scrolling, and page gestures remain available. PDFs need a selectable text layer; scanned pages need OCR first.
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

Historical build 16 automated results: handwriting and Zen Undo 67/67 in both Chromium and WebKit, existing Zen regressions 44/44 in both engines, ink state/merge 27/27, iPad dock 47/47, bundle/security 13/13, and cache-update coverage 19 checks. Enabled, disabled, and short-viewport Find screenshots were visually checked; its signed archive is verified. This is not physical-Pencil validation.

### Build 17 local verification

Confirmed local regressions in both Chromium and WebKit: hold-to-straighten 48/48, unified PDF eraser/real-app hold integration 66/66, handwriting/Zen Undo 67/67, Pencil/highlight eraser 67/67, continuity 39/39, expanded palette 32/32, existing Zen 44/44, and native AI consent/provider checks 44/44. Ink state/merge passes 27/27, iPad dock 47/47 in Chromium, bundle/security 13/13, and cache-update coverage 19 checks. Palette checks cover eight one-tap choices, 44px targets, selection state, dark-paper equivalents, and normal/Zen layouts at five viewport sizes; screenshots were visually checked. The signed build 17 archive is verified. Upload, real Pencil validation, and live-provider testing remain unchecked release gates.

### Build 18 tool switching

Scope: all Pen/Highlighter entry paths in normal, touch, and Zen controls; selected/pressed state synchronization; and cancellation when switching during a stroke. Dedicated switching checks passed 113/113 in Chromium and WebKit. Build 18 regressions also passed: handwriting/Zen Undo 67/67 and existing Zen 44/44 in both engines; unified eraser 66/66, palette 32/32, and iPad dock 47/47 in WebKit; native bundle/security 13/13 and cache-update coverage 19 checks. The signed build 18 archive is verified against that build's source. These results remain historical evidence for retained features; physical Pencil validation and live-provider gates remain open.

### Build 19 highlighting and passage shortcuts

Whole-word Pencil endpoint checks pass **53/53**, persistent palette checks pass **70/70**, and existing Zen checks pass **44/44** in both Chromium and WebKit. Palette coverage includes automatic opening, successive color changes, paper interactions, tool exclusivity, outside dismissal, desktop sticky Marker, and explicit touch Mark. Tablet header, dock, and Zen screenshots were visually checked. Reader cache identity is **v135**; the native app uses its synced bundle rather than a website service worker.

Define/Ask AI reuse existing passage actions and destinations; opening Ask AI alone sends no request. Dedicated shortcut checks pass **43/43** in both engines; native bundle/security passes 13/13 and cache-update coverage passes 19 checks. The signed build 19 archive has verified 1.1.0/build 19 metadata, a strict code signature, and exact HTML/JavaScript/CSS/ink-source matches after native transforms. Upload, exact-binary physical-iPad/Pencil testing, and live-provider validation remain unchecked release gates.

### Build 20 bottom Highlight toolbar

Normal, touch, and Zen Marker controls now open the same bottom toolbar, with colors, Eraser, Define, Ask AI, shared Undo, and Done. Pen keeps its existing toolbar; only one tool bar is visible at a time. The bar stays available while marking and switching colors. All controls are at least 44px; tablet and narrow layouts were visually checked. Bottom-toolbar checks pass 113/113, passage actions 43/43, and Zen 44/44 in Chromium and WebKit. The existing Pencil, tool-switching, eraser, native-selection, and touch-dock regressions also pass both engines.

Signed archive: `/Users/chf/Library/Developer/Xcode/Archives/2026-09-30/Phloem 1.1.0 (20).xcarchive`. Xcode succeeded; version/build metadata, strict code signature, and bundled HTML/JavaScript/CSS/ink matches after native transforms are verified. Native bundle/security passes 13/13. This build has not been uploaded or physically tested on iPad.

Handwriting/Zen Undo also passes 67/67 in both engines. One WebKit preview-visibility check failed on its first run and passed on a standalone rerun without a code change; real-device Pencil responsiveness still requires verification.

## Build structure

`native/` contains the iPad environment/UI adapter; `ios/` contains the Xcode project and native AI bridge. `scripts/build-web.mjs` reads the shared reader from the repository root and writes ignored `www/` output.

The bundler uses an explicit asset allowlist, checks dependencies, disables website service-worker registration and unsupported browser sync paths, and records hashes in `www/bundle-manifest.json`. Generated web assets and installed dependencies stay out of git. See `licenses/PROVENANCE.md` for vendored dependency sources.
