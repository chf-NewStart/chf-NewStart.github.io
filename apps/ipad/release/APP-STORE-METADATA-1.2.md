# Phloem 1.2 App Store draft

Target: **1.2.0 (26)**. Draft only; do not submit until `RELEASE-CHECKLIST-1.2.md` is complete.

## Promotional text

Read papers deeply with Apple Pencil notes, focused layouts, and private iCloud sync across your Apple devices.

## What's New in This Version

Phloem 1.2 adds optional iCloud sync for your reading library.

- Sync notes, highlights, handwriting, reading progress, review work, PDFs, and Word drafts through your private iCloud database.
- Keep reading offline: your local library remains available when iCloud is off or temporarily unreachable.
- Merge changes made on different devices instead of replacing an existing library.
- Download an original document when you first open it on another device, then keep it available locally.
- Turn sync off without deleting either copy, or remove Phloem’s private iCloud copy while keeping this iPad’s local library.
- Reliability and interface refinements throughout the reader.

iCloud availability, storage, and regional terms apply. In China mainland, iCloud is operated by GCBD. Original files up to 200 MB can sync through Phloem.

## Keywords

`paper reader,pdf,academic,research,notes,highlight,annotation,iCloud,iPad,study`

## Description

Phloem is a calm, local-first reading desk for research papers on iPad.

Import PDF and Word documents, read without distractions, and keep your thinking beside the source. Search a paper, highlight passages, write notes, track your place, use the movable reading guide, and switch between focused reading layouts.

Write directly on PDF pages with Apple Pencil. Add ideas in the margins, circle figures, or sketch on scanned and blank pages. Choose from eight ink colors and three pen widths. Hold at the end of a long open stroke to straighten it, then adjust the endpoint before lifting. Handwriting stays anchored to its PDF page as you zoom and change layouts, while fingers remain available for navigation.

Mark selectable text with Apple Pencil, choose highlight colors from a compact toolbar, add notes to highlights, and use Define when you want an online lookup. Both PDF erasers can remove touched handwriting and text highlights, and Undo restores the latest edit.

Optional private iCloud sync in version 1.2 keeps your library metadata, notes, highlights, handwriting, progress, PDFs, and Word originals in your private iCloud database. Phloem remains offline-first: local reading keeps working when sync is off or temporarily unavailable.

Private by design:

- No Phloem account
- No advertising or Phloem analytics
- Local reading works offline after import
- Sync is optional and can be turned off
- Portable backups keep editable reading work separate from original documents

Online definitions, PDF URL imports, external links, iCloud, and cloud file providers require a connection. Keep original document files separately.

## App Review Notes addition

Version 1.2 adds optional iCloud sync. Phloem has no app account or login. The reviewer can use all local reading and annotation features without iCloud.

To test sync:

1. Sign the test iPad into iCloud and ensure iCloud Drive is enabled.
2. Open Phloem Settings → Sync with iCloud → Turn on iCloud sync.
3. Import a non-sensitive PDF, add a highlight and Pencil note, then tap the cloud at the top to sync immediately.
4. On another compatible Apple device using the same iCloud account, install Phloem and turn on iCloud sync. The library metadata merges; opening the paper downloads its original for local/offline reading.
5. Turning sync off preserves both copies. “Delete iCloud copy…” removes Phloem’s private CloudKit records after confirmation while preserving the library stored on that iPad.

CloudKit container: `iCloud.com.houfu72.phloem`. Database: private. Phloem remains local-first and handles signed-out/offline conditions without blocking ordinary reading.

### China mainland storefront behavior

Version 1.2.0 build 26 reads the current App Store storefront through StoreKit. When the storefront country code is `CHN`, every cloud generative-assistant setup and action is hidden, the native bridge rejects credential configuration and provider requests, and an in-progress provider request is cancelled if the storefront changes to China mainland. The same fail-closed behavior applies while StoreKit cannot verify a storefront. Local reading, Apple Pencil writing and highlighting, notes, OCR, imports/exports, and private iCloud sync remain available.

For other storefronts, the optional bring-your-own-key integrations remain off until the user completes their provider-specific disclosure and consent. This regional restriction is enforced natively before any credential save or provider network request; it does not rely only on hiding interface controls.

All App Store Connect metadata and submitted screenshots for this version must omit ChatGPT and OpenAI references while China mainland remains selected.

### Reply to App Review

Hello App Review Team,

Thank you for the guidance. In Phloem 1.2.0 build 26, the app reads the current App Store storefront using StoreKit. When the storefront country code is CHN, all cloud generative-assistant setup and actions are hidden, and the native bridge rejects both credential configuration and provider network requests. The app also observes storefront changes and cancels active provider requests if the storefront changes to China mainland. If the storefront cannot be verified, these features remain unavailable by default.

Local PDF/Word reading, Apple Pencil handwriting and highlighting, notes, OCR, imports/exports, and optional private iCloud sync remain available in China mainland. We have removed ChatGPT and OpenAI references from the App Store metadata and submitted screenshots for this version.

No sign-in is required. Thank you for reviewing the updated build.
