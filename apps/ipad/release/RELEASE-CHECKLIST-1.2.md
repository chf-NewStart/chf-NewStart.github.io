# Phloem 1.2 release checklist

Target: **1.2.0 (26)**, reader cache **v144**. This build adds optional private iCloud/CloudKit sync and a native StoreKit storefront gate for cloud generative-assistant features. It is a development candidate, not ready for App Store submission until every unchecked CloudKit and device gate below passes.

## Completed locally

- [x] iCloud sync is opt-in and local reading remains the source of truth.
- [x] Library payloads use the existing conflict-aware merge, including ink erase and paper-deletion tombstones.
- [x] Rebuildable OCR/extracted PDF text is excluded from the CloudKit library snapshot.
- [x] PDF and Word originals use separate private-database CKAssets with a 200 MB per-file limit.
- [x] Capacitor transfers originals in 512 KB chunks instead of placing a complete textbook in one bridge message.
- [x] Remote originals download only when opened and are then stored for offline reading.
- [x] Turn off preserves local/cloud copies; Delete iCloud copy requires destructive confirmation and preserves local data.
- [x] Xcode simulator compilation succeeds with the CloudKit bridge and entitlements.
- [x] Development-signed 1.2.0 (25) archive succeeded before the regional-gate change; it is historical and must not be uploaded as build 26.
- [x] Development-signed 1.2.0 (26) candidate archive succeeds; version/build, strict signature, CloudKit entitlements, and all 54 bundled-file hashes verify locally. It is not distribution-signed.
- [x] Native StoreKit policy is fail-closed: `CHN` and unknown storefronts block setup and provider requests, and a storefront change cancels active provider sessions.
- [x] China-restricted and storefront-pending UI hides assistant settings, discussion, reviewer matching, and selection/setup shortcuts.
- [x] Native bundle and iCloud structure/round-trip tests pass.
- [x] Public privacy and support drafts disclose iCloud, GCBD operation in China mainland, retention choices, and cloud deletion.

## Apple/CloudKit setup — required before TestFlight

- [ ] In the Apple Developer account, confirm the existing `com.houfu72.phloem` App ID has iCloud/CloudKit enabled and is assigned to the permanent container `iCloud.com.houfu72.phloem`.
- [ ] Let automatic signing regenerate development and distribution provisioning profiles with the CloudKit entitlement.
- [ ] Install a development-signed build on an iCloud-signed-in physical iPad and turn on sync once. Confirm CloudKit creates the development schema for `PhloemLibrary` and `PhloemDocument`.
- [ ] In CloudKit Console, inspect record fields and indexes, then deploy the complete development schema to **Production**. App Store/TestFlight builds cannot rely on a development-only schema.
- [ ] Create a fresh signed **1.2.0 (26)** archive after production-schema deployment; validate its entitlements, privacy report, version/build, signature, and bundled-source hashes.

## Exact TestFlight binary — required before submission

- [ ] Upgrade from the public 1.0/1.1 build without losing papers, notes, highlights, handwriting, AI settings, or reading position.
- [ ] On iPad A, turn on iCloud; verify metadata and several small/large PDF and Word originals upload while local reading remains usable.
- [ ] On iPad B with the same iCloud account, turn on iCloud; verify the merged library appears, a remote original downloads when opened, and it opens later in airplane mode.
- [ ] Make concurrent edits on both iPads, including ink, highlight erase, rename, notes, category, and progress; sync both ways and verify neither branch is silently overwritten.
- [ ] Delete a paper on one iPad; verify it does not resurrect from stale state on the other and its remote original is removed.
- [ ] Test iCloud signed out, iCloud Drive disabled, storage full, airplane mode, background/foreground, force quit during upload/download, and retry after network restoration.
- [ ] Turn sync off and verify both local and cloud copies remain. Re-enable and verify clean merge.
- [ ] Use Delete iCloud copy, confirm local data remains, and verify a second device no longer restores the deleted cloud library.
- [ ] Test a China-mainland Apple Account/network. Confirm no assistant/provider UI or provider name is visible, configuration and requests are rejected natively, an active request is cancelled after a storefront change, and local reading remains usable.
- [ ] With a verified non-China storefront, confirm the regional UI gate clears and the ordinary provider disclosure/consent flow still works.
- [ ] Confirm real CloudKit availability and performance through GCBD; do not infer this from non-mainland testing.
- [ ] Re-run all Pencil, highlighting, eraser, hold-to-straighten, Zen, AI-provider, import/export, and offline-reading regressions against the exact binary.

## App Store Connect

- [ ] Publish the updated privacy/support pages before external TestFlight or review.
- [ ] Reconcile App Privacy answers with the archive privacy report and optional CloudKit user-content transfer.
- [ ] Add the iCloud test path and no-login explanation to App Review Notes.
- [ ] Scrub ChatGPT and OpenAI from every App Store Connect localization field and submitted screenshot while China mainland remains selected.
- [ ] Paste the China-mainland enforcement explanation from `APP-STORE-METADATA-1.2.md` into App Review Notes and the Resolution Center reply.
- [ ] Upload build 26 only after the production CloudKit schema is deployed.
- [ ] Prefer manual release or phased release; monitor CloudKit errors and support reports before advertising broadly.
