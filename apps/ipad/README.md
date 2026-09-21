# Phloem for iPad — development preview

This Capacitor app packages the existing Phloem reader into an iPad app. The first milestone is testing the paper feel, page turns, reading guide, Zen mode, highlights, and notes on a real device.

The Xcode project is generated and configured for iPad. The web bundle and automated checks run on Linux; the native app has **not yet been compiled, signed, or tested on an iPad**. This is a development preview, not an App Store release.

## Run it on your Mac and iPad

Requirements: a Mac with [Xcode 26 or newer](https://capacitorjs.com/docs/ios), Node.js 22 or newer, and an Apple Account for Xcode signing. This project uses Swift Package Manager, so CocoaPods is not required. The deployment target is iPadOS 15; test the actual features on the oldest OS you intend to support before release.

Clone the current `main` branch into a new folder. The native bundle is built
from the reader files in that checkout, so this is also how the next iPad build
receives the latest reader fixes:

```sh
git clone https://github.com/chf-NewStart/chf-NewStart.github.io.git phloem-ipad
cd phloem-ipad/apps/ipad
npm ci
npm test
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Select the **App** target, then **Signing & Capabilities**. Select your Team and keep automatic signing enabled. If Xcode cannot register `com.houfu72.phloem` for your account, choose an identifier you control and update `appId` in `capacitor.config.json` to match, then sync again.
2. Connect your iPad, trust the Mac, and enable Developer Mode on the iPad if Xcode requests it.
3. Choose your iPad as the run destination and press **Run**. You can also choose an installed iPad simulator first.
4. Import a disposable test PDF. Try Book mode, move the guide across both pages, enter Zen, search, highlight, and add a note.

A [free Apple Account can run apps on your own devices](https://developer.apple.com/help/account/basics/about-your-developer-account/). App Store distribution and TestFlight require enrollment in the [Apple Developer Program](https://developer.apple.com/programs/enroll/). Signing and publishing are not configured here.

After changing the shared reader or native adapter, run `npm run ios:sync` and build again in Xcode. `ios:open` alone does not rebuild the bundle. Keep the app identifier and Capacitor origin stable after creating test data; changing either can make the existing library inaccessible to the new build.

## Included in this preview

- Shared PDF reader, Book mode, guide, Zen, search, highlights, notes, and document imports.
- Bundled PDF.js, English OCR, fonts, and Phloem field guide, with third-party notices. Reading does not require loading the website.
- Existing local library implementation inside the app's WKWebView storage.
- Explicit online Wikipedia/Wikimedia lookups and external links opened through Capacitor Browser.
- iPad-only Xcode project with portrait/landscape support and a cream launch screen.

Cloud AI, Chrome on-device AI, Drive/GitHub sync, credential setup links, website installation controls, and unsupported browser workflows are unavailable. Native-only guards also prevent saved sync settings or AI routes from activating through normal reader startup. The adapter does not erase existing storage.

## Data and migration

PDFs currently use IndexedDB; notes/settings use localStorage plus recovery snapshots. This is app-local web storage, **not yet a native filesystem/database implementation or a verified durability guarantee**.

Safari, the extension, and this app have separate storage containers. Existing website papers will not automatically appear here. The current JSON backup contains metadata and notes; **it does not contain the PDFs**. Keep original documents and test export/import with a disposable library. Avoid uninstalling the app with your only copy of a document or annotation inside it.

When you explicitly use Define, the selected term goes to Wikipedia/Wikimedia. Ordinary reading does not require cloud AI or sync. Verify the release build's network behavior before making broader privacy claims or completing App Store privacy disclosures.

## Check on a real iPad

These checks remain; the Node tests do not establish native behavior:

- Import small, large, scanned, and two-column PDFs. Check file-picker cancellation and repeated imports. Test DOCX if that format will ship.
- Drag the guide between pages, turn pages rapidly, follow internal and external PDF links, hover or focus citations, search, select text, and highlight. Recheck the reported Book-guide/header and reference-link fixes on physical hardware.
- Rotate, resize in multitasking, and show the keyboard. Check toolbar clipping, safe-area spacing, Zen controls, and touch targets.
- Force-quit/reopen, suspend/resume, reboot, and install an updated build over the old one. Confirm documents, last page, notes, and highlights survive.
- Launch and read in airplane mode, including OCR. Verify PDF workers/WASM in WKWebView. Test unusual fonts/CJK PDFs; the shared reader currently has no separate PDF.js cMap/standard-font packs.
- Export notes/review files, save them to Files, and import them again. Existing Blob downloads may require a native save/share bridge.
- Open an external link and return to the same paper.

DOCX parsing uses `DecompressionStream`, and native CSS includes `:has()`. Full reader support on iPadOS 15 is not established by the deployment target. Set the supported minimum OS or add fallbacks after testing.

## Before charging for it

1. Keep validating reading/guide/header behavior on iPad, including accessibility and large-document performance.
2. Add durable native storage, complete document-and-notes backup/restore, tested migration, and native Files export. Add an Open In/share extension if in scope.
3. Replace the generated Capacitor app icon with the final Phloem icon. Review the actual archive's dependency notices and rights for the personal font/guide.
4. Run a small TestFlight, prepare screenshots and accurate privacy/support information, and configure the paid app in App Store Connect. App Review evaluates the complete app experience.

Future sync needs native OAuth and Keychain-backed credentials. Chrome's on-device language model does not become an iPad model through Capacitor. These integrations are separate from the core reader prototype.

## Build structure

`native/` contains the iPad environment/UI adapter; `ios/` contains the Xcode project. `scripts/build-web.mjs` reads the shared reader from the repository root and writes ignored `www/` output. Website source is not modified.

The build uses an explicit asset allowlist, checks dependencies, asserts the expected source before applying native transforms, disables website service-worker registration, and records hashes in `www/bundle-manifest.json`. Portfolio pages, research-library documents, demos, and extension artifacts are excluded.

`npm test` checks dependency closure, guarded transforms, native cloud routes, and setup links. `npm run ios:sync` rebuilds and copies the bundle and plugin configuration into the native project. Generated web assets and installed dependencies stay out of git. See `licenses/PROVENANCE.md` for vendored dependency sources and remaining archive-level review.
