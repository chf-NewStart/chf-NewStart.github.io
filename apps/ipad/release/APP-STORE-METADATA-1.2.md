# Phloem 1.2 App Store draft

Target: **1.2.0 (25)**. Draft only; do not submit until `RELEASE-CHECKLIST-1.2.md` is complete.

## Promotional text

Read papers deeply with Apple Pencil notes, focused layouts, optional AI, and private iCloud sync across your Apple devices.

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

`paper reader,pdf,academic,research,notes,highlight,annotation,iCloud,AI,iPad`

## App Review Notes addition

Version 1.2 adds optional iCloud sync. Phloem has no app account or login. The reviewer can use all local reading and annotation features without iCloud.

To test sync:

1. Sign the test iPad into iCloud and ensure iCloud Drive is enabled.
2. Open Phloem Settings → Sync with iCloud → Turn on iCloud sync.
3. Import a non-sensitive PDF, add a highlight and Pencil note, then tap the cloud at the top to sync immediately.
4. On another compatible Apple device using the same iCloud account, install Phloem and turn on iCloud sync. The library metadata merges; opening the paper downloads its original for local/offline reading.
5. Turning sync off preserves both copies. “Delete iCloud copy…” removes Phloem’s private CloudKit records after confirmation while preserving the library stored on that iPad.

CloudKit container: `iCloud.com.houfu72.phloem`. Database: private. Phloem remains local-first and handles signed-out/offline conditions without blocking ordinary reading.
