# Google Drive in the iPad app (2026-10-06)

Write-up for cross-checking. Branch `claude/app-cloud-sync-eccryu`.

## Why

houfu wants papers added on the website to show up in the iPad app. Website iCloud was tried first, but Apple's sign-in page refuses to verify the account for this container on the web; see `ICLOUD-SYNC-FIX.md`. On a decision card houfu chose "Drive in app": the app gets optional Google Drive sync, the same hidden Drive app folder the website already uses, and iCloud stays the app's sync for everyone, including users in mainland China.

## How it works

- `ios/App/App/PhloemGooglePlugin.swift` (JS name `PhloemGoogle`) signs in to Google natively. Google blocks OAuth inside embedded web views, so the website's Google Identity Services popup can't run in the app.
  - Flow: OAuth 2.0 for installed apps. It uses an authorization code with PKCE (S256) and a `state` check in `ASWebAuthenticationSession`, and redirects to the reversed iOS client ID (`com.googleusercontent.apps.…:/oauth2redirect`). There is no client secret.
  - Scope: `drive.appdata` only, the same one the website uses.
  - Tokens: the refresh token is kept in Keychain (`com.houfu72.phloem.google`, this device only, cleared on a fresh install). Access tokens go to the reader and are never stored natively.
  - Methods: `status()` returns configured, regionAllowed, countryCode and signedIn. `getToken({interactive, hint})` refreshes silently and signs in only when the call is interactive. `signOut()` deletes the refresh token and revokes it at Google.
  - The iOS client ID comes from Info.plist `PhloemGoogleClientID`, now set to houfu's iOS client "Phloem iPad" (615468645410-f9h6jit1naopniqsmhmmo5vks3m8nat2.apps.googleusercontent.com, created 2026-10-06). If it is ever emptied, Drive stays hidden.
- `native/ipad.js`: Drive still starts hidden with the other web-only settings. Once `PhloemGoogle.status()` reports a configured client and a known App Store region other than mainland China (`CHN`), it sets `window.PHLOEM_GOOGLE_DRIVE` and shows the Drive section. If Drive was already connected on this iPad, it starts a sync. The sync badge syncs both iCloud and Drive when each is on.
- `reading.js`: `gdriveGetToken()` asks the native plugin when it is ready, and the website's GIS popup otherwise. "Turn off" also signs out natively. `window.PHLOEM_GDRIVE` exposes enabled, sync and refresh to ipad.js. The website's behaviour is unchanged.
- `scripts/build-web.mjs`: the bundled `gdriveOn()` now also requires `PHLOEM_GOOGLE_DRIVE` in the app, so a Drive record left from an old prototype can't start a sync before the plugin is ready.
- iCloud and Drive can both be on. Each merges into the same local library, as on the website.

## Tests

- New `tests/google-drive.test.mjs` checks:
  - the plugin is in the Xcode project's Sources and registered in `PhloemBridgeViewController`
  - the Info.plist key exists
  - the only scope is `drive.appdata`
  - PKCE S256 and the state check are present, with no client secret
  - the refresh token sits in Keychain
  - Drive is gated on mainland China
  - the reader uses the native token
- `bundle.test.mjs` also checks that `gdriveOn()` turns on in the app once `PHLOEM_GOOGLE_DRIVE` is set.
- Results: `apps/ipad` `npm test` passes 19 of 19, and the full reader suite passes. Shell v185.
- Compile check (2026-10-06, houfu's Mac, separate worktree at 9a90cfaf): `npm ci`, `npm test` (19/19), `npm run build`, `npx cap sync ios`, then `xcodebuild -project App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' -configuration Debug CODE_SIGNING_ALLOWED=NO build` gave BUILD SUCCEEDED with no errors and no warnings in `PhloemGooglePlugin.swift`. `npm test` does not leave a `www/` folder, so `npm run build` must run before `cap sync`.

## Steps for houfu

1. In Google Cloud Console, open the project that holds the website's Drive client (`615468645410-…`). Go to APIs & Services › Credentials › Create credentials › OAuth client ID › iOS. Name it "Phloem iPad", set Bundle ID to `com.houfu72.phloem`, and send the Client ID.
2. Done 2026-10-06: the Client ID is in Info.plist `PhloemGoogleClientID`.
3. Build from Xcode onto the iPad. Go to Settings › Sync with Google Drive › Connect Google Drive and sign in. Papers from the website's Drive should appear.
4. Before submitting to the App Store, update the App Privacy answers and the privacy policy page to say that the app can optionally sync to the user's own Google Drive app folder.
   - Privacy policy: done 2026-10-06 (`phloem-ipad/privacy.html` has an "Optional Google Drive sync" section, a bullet under "When information leaves your iPad", and the deletion note). App Store Connect's App Privacy answers are still houfu's to update.
5. Google consent screen (project carrel-505515): set App name to Phloem, home page https://houfu72.com/reading.html, privacy policy https://houfu72.com/phloem-ipad/privacy.html, authorized domain houfu72.com. The new name shows after Google's brand verification; until then the sign-in sheet says "Carrel".

## Follow-up: "Could not save" when the local store is full (2026-10-06, shell v186)

- What houfu saw: in the TestFlight app (1.2.0 build 30), after connecting Google Drive, new workspace notes said "Could not save. Your draft is still here." and creating one said "Not confirmed saved". The website was fine.
- Cause: `persist()` in reading.js saves the library to localStorage, which holds about 5 MB. Once the app's library merged the device, iCloud and Drive copies, `localStorage.setItem` threw. `persist()` returned false even though the same state was also written to the IndexedDB snapshot (`state:snapshot:latest`), so every note edit reported a failure.
- Fix (reading.js):
  - When localStorage is full, the IndexedDB snapshot counts as the save: `persist()` returns true as long as the last snapshot write succeeded (`stateSnapshotOk`). The "Saved to recovery storage" dialog is gone. The "Phloem needs a little room" dialog now appears only if the IndexedDB write also fails.
  - Startup already merges a newer snapshot back in (`restoreStateSnapshot`). It now compares against the `savedAt` value read from localStorage at load (`stateLoadedAt`), not a later in-memory value. Until that merge has run, a localStorage failure does not write the snapshot (`stateRecoveryDone`), so a stale library can't overwrite a newer snapshot.
  - The "Recovered your library from this device's safety copy" status shows only when the load actually had a problem, so it doesn't appear on every launch.
- Test: `tests/reading-storage-full.test.js` makes the library key throw QuotaExceededError, writes a Clips note, and checks that the note shows "Saved", has no dialog, is in the snapshot, and survives a reload. It fails on main before the fix (the dialog blocks the reader) and passes after.
