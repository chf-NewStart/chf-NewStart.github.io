# iCloud sync in the iPad app: diagnosis and fix (2026-10-05)

Write-up for cross-checking. Branch `claude/app-cloud-sync-eccryu`.

## What houfu reported

Cloud sync does not work in the iPad app. The website offers Google Drive and the app offers iCloud.

## How sync is built

- Website (`reading.html`): Google Drive sync (and an older GitHub sync).
- iPad app: `apps/ipad/scripts/build-web.mjs` patches `gdriveOn()` to return false when `window.PHLOEM_NATIVE` is set, so Drive is off in the app. The app syncs through `PhloemCloudPlugin.swift`, a CloudKit bridge to the private database of `iCloud.com.houfu72.phloem`. `reading.js` (`iCloudSync`, around line 8219) merges the library with the same conflict-aware merge as Drive.
- The two clouds never meet. A paper added on the website through Drive does not appear in the app, and the reverse. That is by design today, not a bug.

## Why iCloud fails

Main suspect: the CloudKit schema was never deployed to Production (item 3).

The code paths are complete and the bundle tests pass. What was never finished is the Apple-side setup. Every box under "Apple/CloudKit setup — required before TestFlight" in `release/RELEASE-CHECKLIST-1.2.md` is still unticked:

1. The App ID `com.houfu72.phloem` must have iCloud (CloudKit) enabled with the container `iCloud.com.houfu72.phloem` assigned. Checked on the Mac 2026-10-05: this is done. Both profiles Apple generated (development, 2026-09-30, and the App Store profile created at 17:12 Toronto during the build 27 upload) carry the container for Production and Development. Before 17:12 the store profile on disk lacked iCloud, so builds exported earlier may have shipped without working CloudKit. Archives 26 and 27 both sign the container and CloudKit entitlements.
2. A development build must sync once on a real iPad so CloudKit creates the `PhloemLibrary` and `PhloemDocument` record types in the Development schema.
3. That schema must be deployed to Production in CloudKit Console. TestFlight and App Store builds talk to Production, where CloudKit refuses to create new record types. Without this step, the first save fails.
4. `deleteCloudData` runs a `CKQuery` over `PhloemDocument`, which needs a QUERYABLE index on `recordName`. CloudKit does not add that index automatically, so "Delete iCloud copy" fails until it is added in CloudKit Console before deploying.

Until now the app only showed generic text such as "iCloud could not save this update.", which hides which of these is the cause.

## Code changes

1. `PhloemCloudPlugin.swift`: new `explain(_:_:)` helper. Every rejection that carries an error now appends a plain hint for the common CloudKit codes (not signed in, offline, storage full, busy, missing entitlement, request refused because the server schema is not set up) plus `(CloudKit <code>: <Apple's description>)`. Settings › iCloud shows that full text, so a screenshot names the cause.
2. `Base.lproj/Main.storyboard`: the initial controller's class was the plain `CAPBridgeViewController`, which never registers Phloem's iCloud and AI plugins. `SceneDelegate` replaces the window with `PhloemBridgeViewController`, but the storyboard is still loaded first because `Info.plist` names it. The storyboard now names `PhloemBridgeViewController` (module `App`), the way Capacitor documents custom bridge controllers, so whichever path UIKit takes, the plugins are registered.
3. `tests/icloud-sync.test.mjs`: asserts both changes.

Not compiled in this cloud session (no Swift toolchain on Linux). The next Xcode build on houfu's Mac compiles it. `npm test` in `apps/ipad`: 16 of 16 pass. No web files changed, so the reader shell version is not bumped.

## Apple-side steps only houfu can do

Steps 1 and 2 of the checklist (App ID capability, profiles) are already done.

1. Run the app from Xcode on the iPad, turn on iCloud sync, add a paper, and sync once.
2. icloud.developer.apple.com › CloudKit Console › `iCloud.com.houfu72.phloem` › Development: check both record types exist, then add a QUERYABLE index on `recordName` for `PhloemDocument`.
3. Deploy Schema Changes to Production.
4. Archive build 28 or higher and send it to TestFlight.

## Recommendation on Google Drive in the app

Keep iCloud as the app's only sync for now, and do not add Google Drive to the app.

- Google services are blocked in mainland China, so Drive would never work for those users. iCloud works there through the GCBD-operated iCloud service.
- Google blocks sign-in inside embedded web views, so Drive in the app would need a native sign-in flow and another privacy and review disclosure.
- Two clouds syncing one library doubles the ways a merge can go wrong.

If houfu wants the website and the iPad to share one library, the better route is the other direction: add iCloud to the website with Apple's CloudKit JS, using the same container, and keep Drive on the website as an option. Whether CloudKit JS sign-in works for China-mainland Apple accounts is unverified. Until then, the JSON backup (Settings) moves notes, highlights and ink between the website and the app; PDFs must be added on each side.

## Part 2: iCloud on the website (houfu chose "iCloud on web", 2026-10-05)

houfu wants papers added on the website to show up in the app. houfu picked iCloud on the website over Google Drive in the app on a decision card.

### How it works

- `reading.js` gains `webCloudPlugin()`, an adapter over Apple's CloudKit JS (`https://cdn.apple-cloudkit.com/ck/2/cloudkit.js`, loaded only when iCloud is used). It exposes the same methods as the native `PhloemCloud` plugin, so `iCloudSync()`, the merge and the paper status labels run unchanged in the browser.
- It uses the same container (`iCloud.com.houfu72.phloem`), private database, record names (`library-v1`, `document-<sha256 of paper id>`) and fields (`payload`, `formatVersion` INT64, `documentID`, `filename`, `mimeType`, `byteCount` INT64, `contentHash`, `updatedAt` TIMESTAMP, `file`) as `PhloemCloudPlugin.swift`. The app and the website therefore read each other's records.
- Conflicts work the same way. A save carries the record's change tag, and CloudKit's `CONFLICT` maps to `ICLOUD_CONFLICT`, which makes `iCloudSync()` re-fetch, merge and retry.
- Originals skip the native base64 chunk path. They are added as `uploadDocument` / `downloadDocument` (whole Blob in, `downloadURL` fetch out), and `iCloudUploadSource` / `iCloudDownloadSource` use them when the plugin has them.
- `iCloudPlugin()` returns the native plugin in the app and the web adapter in a browser. `iCloudOn()` no longer requires the native app.
- Sign-in: "Turn on iCloud sync" shows Apple's "Sign in with Apple ID" button (`#icloudAppleSignIn`) and waits for `whenUserSignsIn()`. `persist: true` keeps the session across reloads.
- `WEB_CLOUDKIT.apiToken` is empty, so the website still hides the section (`native-only`) until houfu supplies a CloudKit API token. CloudKit API tokens are designed to be embedded in public web pages.
- The CSP in `reading.html` allows `cdn.apple-cloudkit.com` for scripts, styles and images. `connect-src https:` already covers the API and asset downloads.
- Google Drive stays on the website. Both can be on at once, and both merge into the same local library.

### Tests

- New `tests/reading-icloud-web.test.js` uses a fake CloudKit JS that stores records in memory and seeds a library and original "written by the iPad". 12 checks: the section is hidden without a token and shown with one; Apple's sign-in button appears; the configuration names the app's container in production; the iPad's paper merges into the website; the cloud library ends up holding both papers; the website's original is saved under the native record name with INT64 `byteCount`; opening the iPad-only paper downloads its original into IndexedDB; and no page errors.
- Full suite: everything passes except `reading-fold-phone`, which also fails on unchanged main (known flaky). `apps/ipad` `npm test`: 16 of 16. The browser tests need `pdf-lib` on `NODE_PATH`.
- Not yet verified against Apple's real servers. Two points need checking once the token is in: that CloudKit asset `downloadURL`s can be fetched from houfu72.com (CORS), and that the explicit `type` on fields is accepted.

### Steps for houfu

1. In Xcode, run Phloem on the iPad. Turn on iCloud sync, add a paper, and tap Sync now. This creates the Development schema.
2. Open CloudKit Console at icloud.developer.apple.com and choose `iCloud.com.houfu72.phloem`. Under Development › Indexes, add `recordName` as QUERYABLE on `PhloemDocument`.
3. Deploy Schema Changes to Production.
4. In the same console, open API Access (Tokens & Keys), create an API token named "Phloem web", set Sign In Callback to postMessage and Allowed Origins to houfu72.com, and send the token to the thread.
5. Claude sets `WEB_CLOUDKIT.apiToken`, ships, and the website shows Sync with iCloud.
6. Archive app build 28 or higher for TestFlight.

### Fix: the sign-in return was ignored (shell v179)

houfu's first test of the redirect flow (v178) came back to Phloem but Settings still said "Sign in with your Apple ID". Reading CloudKit JS's source (the copy bundled in the `tsl-apple-cloudkit` npm package) shows the auth constructor reads `ckWebAuthToken` from the `apiTokenAuth` object, next to `apiToken` and `persist`. Phloem had put it on the container config, where CloudKit JS ignores it, so the returned token was dropped and the session stayed signed out. The fake CloudKit in `tests/reading-icloud-web.test.js` accepted the wrong place, which is why the test passed; it now reads the token from `apiTokenAuth` like the real library. The return token is also accepted from the URL fragment as well as the query string, in case Apple's redirect uses `#`.

### Second fix: the sign-in still dropped after a second (shell v180)

On v179 houfu saw "Signed in. Checking your private iCloud library…" and then "Sign in with your Apple ID" again, so the token now reached CloudKit JS but the first request still went out signed out or was refused. The cause can't be seen from here, because this container can't reach Apple. Two changes cover the likely causes and make the next screenshot say which one it was:

1. CloudKit JS stores the session in a cookie and reads it back before every request. If Safari drops that cookie, every request goes out signed out. Phloem now passes `services.authTokenStore`, a store backed by localStorage (`phloem.icloudWebSession.v1`), so the session no longer depends on the cookie.
2. If CloudKit still reports signed out right after the return, `webCloudRetryReturn()` calls Apple's `users/caller` endpoint directly with each plausible spelling of the returned token: decoded, exactly as sent, and with spaces read back as "+". The first spelling Apple accepts (or the fresh token Apple returns in `X-Apple-CloudKit-Web-Auth-Token`) becomes the session. If Apple refuses all of them, Settings shows "Apple sent you back, but did not accept the sign-in" with Apple's error code and reason, plus the token's length and which special characters it contains (never the token itself).

Tests: `reading-icloud-web` now also covers a refused return (Apple's reason is shown and both spellings are tried) and a rescued return (the spelling Apple accepts becomes the session and sync carries on). In the full suite only `reading-fold-phone` failed; it is known to be flaky and also fails on main.

### Third round (shell v181)

v180 showed: "Apple sent you back, but did not accept the sign-in (AUTHENTICATION_REQUIRED for both spellings; token 1007 chars with + % / =)". Advanced Data Protection is off and iCloud.com web access is on, so neither is the cause. Apple's docs say each web auth token is good for one round trip, and every response carries a renewed one.

- CloudKit JS makes up a new `clientId` on every page load and sends it with every request, including the one that produces the sign-in URL. The page after Apple's redirect is a new load with a different clientId. Phloem now keeps one clientId per browser (`phloem.icloudWebClient.v1`) and passes it as `clientID`, so the request after the return matches the one before it. This is a hypothesis, not confirmed.
- Codex's cross-check (relayed by houfu): the status line said "Signed in" before anything was verified. It now says "Back from Apple. Checking the sign-in…". The direct check also reads both renewal headers (`X-Apple-CloudKit-Web-Auth-Token` and `X-Apple-CloudKit-Session`), as CloudKit JS does.
- `services.fetch` wraps fetch to note Apple's answer to the first `users/caller` request: its status, its error code, whether a renewed token came back, and whether the token was sent. A failed sign-in now shows that line, which is the decisive evidence Codex asked for.

### Fourth round (shell v182)

The v181 error line showed what Apple's redirect actually contains: both `ckWebAuthToken` (1007 chars, 4 `__` parts) and `ckSession`. Apple's first `users/caller` answer was 421 AUTHENTICATION_REQUIRED. Phloem had been taking `ckWebAuthToken`, the first one it matched. CloudKit JS's own popup flow uses the message's `ckSession` as the session, so Phloem now prefers `ckSession` and keeps `ckWebAuthToken` only as a fallback for the direct check. Removing the tokens from the address bar now drops both parameters; the old regex left the second one behind. The test's fake redirect returns both parameters and checks that `ckSession` is the one used. Full suite: all pass.

### Fifth round (shell v183)

v182's result was identical: 1007 characters, so `ckSession` and `ckWebAuthToken` are most likely the same value. The v181 line also showed that Apple's first 421 answer carries a renewed token, and each token is good for one round trip. Phloem then retried only with the original, already-spent token, which Codex had flagged. Now:

- After a refused first check, Phloem asks CloudKit JS once more. CloudKit JS has already stored the renewed token, so this check uses it.
- The direct check tries the renewed token first. Any token a refused answer hands back is added to the list, up to 10 attempts.
- The error starts with "v183" so a screenshot names the version. It also says whether the two returned values match and whether a renewed token was tried.

New test: a refused check that hands back a renewed token, which Apple then accepts, ends with the website synced. Full suite: only `reading-fold-phone` fails, which is the known flaky test.

### Where it stands after v183 (2026-10-06, about 10 pm Toronto)

v183 tried every form of the returned token: decoded, raw, the renewed one from Apple's first 421, and both the `ckWebAuthToken` and `ckSession` parameters (they hold the same 1007-character value). Apple answered `AUTHENTICATION_REQUIRED` to every one.

What's established:

- The live `cdn.apple-cloudkit.com/ck/2/cloudkit.js` (read on the Mac, 173,391 bytes) is the same size as the `tsl-apple-cloudkit` npm copy read here.
- It has no redirect-callback handling. A token reaches it only through `apiTokenAuth.ckWebAuthToken`, its cookie store, or the popup's `postMessage` (`e.data.ckSession`).
- Requests send `?ckAPIToken=<raw>&ckWebAuthToken=<encodeURIComponent(token)>&clientId=…`, encoded once. Phloem's direct check sends the same.

So Phloem sends the token the way Apple's own library would, and Apple's server still refuses it.

Open question: does a token from the popup flow (Apple's supported path) work for this container at all? The next test is on a desktop browser with an API token set to Post Message. That needs either a second "Phloem web (popup)" token or the current token switched back to Post Message. If the popup token works on desktop, the redirect token is the problem, and the fix is a sign-in flow that keeps a window opener on iPad. If it also fails, the problem is on the account or container side.

### Outcome (2026-10-06, about 10 am Toronto)

The pop-up test page (`icloud-test.html`) runs CloudKit JS's own Post Message flow. Apple's sign-in page answered "Failed to verify your identity. Try again." for houfu's Apple ID on both iPhone and Mac. It did the same with the test token's Allowed Origins set to Any domain. Apple's sign-in itself fails for this container on the web, before Phloem's code is involved. The v178–v183 redirect tokens were most likely issued for a sign-in Apple never completed.

Shell v184 hides "Sync with iCloud" on the website again by emptying `WEB_CLOUDKIT.apiToken` (a comment in reading.js keeps the Production token). The web adapter, the tests and the native app are unchanged. houfu then chose "Drive in app" on a decision card: the iPad app gets optional Google Drive sync, and iCloud stays for users in China.
