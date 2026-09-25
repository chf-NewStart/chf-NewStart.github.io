# Phloem for iPad

This Capacitor app packages the Phloem paper reader for iPad. App Store version 1.0 build 7 remains the no-AI release currently in review. This checkout is the separate **1.1.0 build 8 development track**; do not upload it over the active 1.0 review.

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

1. Confirm the **App** target shows Version **1.1.0** and Build **8**.
2. Under **Signing & Capabilities**, select the correct Team and keep automatic signing enabled.
3. Connect a physical iPad, trust the Mac, enable Developer Mode if requested, and choose it as the run destination.
4. Use disposable documents and provider keys for the release checklist. Do not test with confidential or third-party personal data.

After changing the shared reader or native adapter, run `npm run ios:sync` before building. `ios:open` alone does not rebuild the bundled web app.

## Included in 1.1 development

- Shared PDF/Word reader, Book mode, guide, Zen mode, search, highlights, notes, review workflows, and document import.
- Bundled PDF.js, English OCR, fonts, and the Phloem field guide. Local reading does not load the website.
- Optional bring-your-own-key AI through fixed native integrations for Gemini, DeepSeek, OpenAI, and Anthropic.
- API keys entered in a native iOS secure prompt and stored with Keychain using `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; stored keys are never returned to JavaScript or included in Phloem backup files.
- Native `URLSession` requests with ephemeral storage, HTTPS-only fixed provider hosts, redirect host enforcement, payload validation, and no custom endpoints.
- A provider-specific disclosure and affirmative consent before a key is enabled. Removing a key also removes that provider's local consent receipt.
- A privacy manifest declaring optional AI user content, the provider account identifier, and no tracking.
- Wikipedia/Wikimedia lookups and external links only when the user deliberately opens those online features.

Chrome on-device AI, Drive/GitHub sync, credential setup links, AI-pass links, website installation controls, and arbitrary OpenAI-compatible endpoints remain unavailable in the iPad app.

## What AI sends

Only after the user configures a provider, accepts its disclosure, and deliberately invokes an AI action, Phloem can send:

- the selected passage, current page text, or guide context chosen for the request;
- the user's question and the prior turns in that Phloem discussion;
- for reviewer tools, extracted reviewer text and locally selected candidate excerpts.

Phloem does not upload the original PDF or Word file to the AI provider. The chosen provider receives the request, API credential, and ordinary network information and handles them under its own terms. Provider-specific risks and release disclosures are tracked in [`release/AI-PRIVACY-1.1.md`](release/AI-PRIVACY-1.1.md).

## Local data and migration

PDFs currently use IndexedDB; notes/settings use localStorage plus recovery snapshots. This is app-local web storage, not a native database or a verified durability guarantee. Safari, the browser extension, and the iPad app have separate storage containers.

The JSON backup includes notes and metadata but not PDF files or API credentials. Keep original documents. Avoid uninstalling the app with the only copy of a paper or annotation inside it. A legacy browser-stored AI key is scrubbed in the native build and must be entered again to move it into Keychain.

## Verification

Automated checks:

```sh
npm test
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

The Node suite checks dependency closure, guarded native transforms, blocked setup links, Keychain-only AI metadata, native bridge routing, and build identity. The Xcode command verifies that the native plugin and generated bundle compile together. Neither replaces physical-device or live-provider testing.

## Build structure

`native/` contains the iPad environment/UI adapter; `ios/` contains the Xcode project and native AI bridge. `scripts/build-web.mjs` reads the shared reader from the repository root and writes ignored `www/` output.

The bundler uses an explicit asset allowlist, checks dependencies, disables website service-worker registration and unsupported browser sync paths, and records hashes in `www/bundle-manifest.json`. Generated web assets and installed dependencies stay out of git. See `licenses/PROVENANCE.md` for vendored dependency sources.
