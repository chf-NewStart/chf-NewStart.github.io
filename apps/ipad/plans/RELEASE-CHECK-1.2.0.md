# Phloem 1.2.0 release check (2026-10-06)

Checked against main at 6e17320c (shell v188), the source of build 33.

## What was run

- Reader suite: all 88 files in `tests/` with Playwright Chromium (pdf-lib and
  playwright installed outside the repo, `NODE_PATH` pointing at them). All pass;
  `reading-pdf-links` and `reading-pdf-title` failed once when run in parallel and
  passed on a serial rerun (both are on the known-flaky list). WebKit is not
  installed in the cloud container, so nothing ran in WebKit.
- iPad suite: `npm test` in `apps/ipad`, 19 of 19 pass; `npm run build` bundles 65 assets.
- Browser walk-through at 1180x820 with touch: first run library, adding a PDF,
  reading in Zen, opening Workspace, adding and typing a note, reload, Settings.
  No page errors or console errors.
- The bundled app (`apps/ipad/www`) with a stand-in Capacitor bridge that exposes
  only the methods the Swift plugins declare (as Capacitor's `JSExport.exportJS`
  does), for storefronts CHN and USA:
  - CHN: Google Drive section stays hidden and disabled; iCloud turns on and syncs
    (status, fetchLibrary, saveLibrary, fetchDocuments, chunked upload).
  - USA: Google Drive section is shown; iCloud the same as above.
  - The website-only iCloud adapter methods (`signIn`, `uploadDocument`,
    `downloadDocument`) are never called on the native plugin, because the
    injected plugin object has no such properties.
- Read the non-Workspace diff since v163 (`reading.js` storage and sync,
  `ipad.js`, `PhloemCloudPlugin.swift`, `PhloemGooglePlugin.swift`,
  `build-web.mjs`, service worker). Workspace code is owned by the ergonomics
  thread and was covered by its tests only.

## Changes in this round (v189)

1. `reading.html`: the iCloud section no longer says "The iPad app and this
   website share it when both use the same Apple ID." Website iCloud was hidden
   in v184, so in the app this promised something that does not exist.
2. `apps/ipad/native/ipad.js`: the "Saved on this iPad" section is inserted after
   the dialog's lede line instead of before it. Before, the lede ("Your reading
   space on this iPad.") sat alone under the first card with an empty cell
   beside it. This has been the case since 1.1.
3. Shell bumped to v189 (`reading-sw.js` cache name and the `?v=` query strings in
   `reading.html`).

## Build 33

Neither problem affects data, sync or Workspace behaviour. Build 33 does not need
to be replaced for them; both ride the next build.

## Notes for later, not changed

- `persist()` only queues the IndexedDB snapshot after startup recovery has run;
  if localStorage is full, an edit made in the first moments after launch is not
  saved anywhere until recovery finishes. Owned by the sync thread.
- `PhloemGoogle.status` treats an unknown App Store storefront as not allowed, so
  Drive stays hidden for an iPad with no App Store account. That fails safe.
