# Tend for iPhone and iPad

A separate app, version **1.0.0 (1)**, bundle ID **com.houfu72.tend**. This does not change Phloem’s app identity, signing, or release. The same hand-written UI is available at https://houfu72.com/focus/ and bundled offline in the iOS app.

The iOS target adds app-scoped notebook persistence, opt-in local session notifications, native share-sheet exports, and screen-awake control. No external service, account, package manager, CocoaPods, or third-party SDK is required. Source links open externally; remote pages cannot use the privileged app bridge.

## Open and run

1. Pull the repository’s `main` branch on your Mac.
2. Open `apps/tend-ios/Tend.xcodeproj` in Xcode. Choose the **Tend** scheme.
3. Signing uses the same development team recorded in the existing Phloem project. Confirm your own team is selected and automatic signing is enabled. The new bundle identifier must be available in that account.
4. Select your iPhone/iPad or a simulator and Run. The first build copies the shared `focus/` assets into `Web/` automatically. Generated `Web/` files are ignored by Git.

The minimum deployment target is iOS/iPadOS 17. Build with a currently App Store-supported Xcode/SDK. No signing credentials are stored here.

The room shares houfu72.com’s forest/mint palette and self-hosted DM Sans / IBM Plex Mono fonts. The fonts and their SIL Open Font License texts are bundled offline. The top-right tomato button uses the same icon as the homepage and opens paraphrased focus reminders with links to the in-app sources.

## Checks

From the repository root:

```bash
node --test tests/focus-timer.test.cjs
python3 apps/tend-ios/scripts/bundle_web.py
xcodebuild -project apps/tend-ios/Tend.xcodeproj -scheme Tend \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

The `Tend iOS build` GitHub Actions workflow runs the shared timer tests, compiles an unsigned simulator app, launches it, and retains a simulator screenshot and build log. Simulator output cannot be uploaded to App Store Connect.

## App Store path

Use [release/APP-STORE.md](release/APP-STORE.md) for the prepared listing, privacy answers, and reviewer instructions. [release/RELEASE-CHECKLIST.md](release/RELEASE-CHECKLIST.md) records remaining device and submission checks.

On your Mac, choose **Any iOS Device (arm64) → Product → Archive → Distribute App → App Store Connect**. Create a new app record with `com.houfu72.tend`, not Phloem’s record. This requires your signed-in Apple developer account and a distribution-signed archive. No build has been submitted merely by committing this project.

## Local data

The native app stores its JSON notebook under `TendNotebookV1` in its own UserDefaults container. The web version uses `houfu.tend.v1` in localStorage. They do not sync automatically. Device backups may include app data; exports are user-directed. The privacy manifest declares app-scoped UserDefaults access (`CA92.1`) and no collected data or tracking.

Notifications are ordinary local notifications. Permission, Focus modes, and OS delivery rules apply. Task text is not included in notification content. The app catches up from its saved deadline and never automatically starts another work interval while suspended.
