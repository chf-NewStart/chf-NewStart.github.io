# Tend for iPhone and iPad

A separate app, version **1.1.0 (2)**, bundle ID **com.houfu72.tend** (Live Activity extension **com.houfu72.tend.LiveActivity**). This does not change Phloem’s app identity, signing, or release. The same hand-written UI is available at https://houfu72.com/focus/ and bundled offline in the iOS app.

The iOS target adds app-scoped notebook persistence, opt-in local session notifications, native share-sheet exports, and screen-awake control. No external service, account, package manager, CocoaPods, or third-party SDK is required. Source links open externally; remote pages cannot use the privileged app bridge.

## Open and run

1. Pull the repository’s `main` branch on your Mac.
2. Open `apps/tend-ios/Tend.xcodeproj` in Xcode. Choose the **Tend** scheme.
3. Signing uses the same development team recorded in the existing Phloem project. Confirm your own team is selected and automatic signing is enabled. The new bundle identifier must be available in that account.
4. Select your iPhone/iPad or a simulator and Run. The first build copies the shared `focus/` assets into `Web/` automatically. Generated `Web/` files are ignored by Git.

The minimum deployment target is iOS/iPadOS 17. Build with a currently App Store-supported Xcode/SDK. No signing credentials are stored here.

The room has a pixel look: Plank Pixel (Houfu's own 5×7 arcade font) for the timer and headings, a ring of blocks that empties as the interval passes, and a tomato that ripens while you focus, over houfu72.com's dark palette with DM Sans and IBM Plex Mono (SIL Open Font License texts bundled). Every font is bundled, so the app works offline. In DEBUG builds, `-tendState <json or file>` seeds the notebook for one launch and `-tendEval <js>` runs once the room is ready (for screenshots and simulator checks).

## Siri and the Lock Screen (1.1)

Say **"Start Tend"** (or "Trigger Tend", "Start a session in Tend", "Focus with Tend"). Siri asks *"What are you working on?"*; the answer becomes the session's question, and the session starts at the notebook's focus length without opening the app. Apple keeps free text out of the phrase itself, so the question is always the follow-up. "Pause Tend", "Resume Tend" and "I'm done in Tend" (Siri then asks "Where did you stop?") work the same way. All four are App Shortcuts, so they also appear in Shortcuts and can go on the Action Button or Back Tap; "Start a focus session" takes an optional length in minutes there.

- **Live Activity** (`LiveActivity/`, a widget extension): the question, the tomato in its ring of blocks and a Plank Pixel countdown, on the Lock Screen and in the Dynamic Island. The countdown, the ring and the ripening tomato are drawn from the system's own timer views (`Text(timerInterval:)` and `ProgressView(timerInterval:)` used as masks), so they keep moving while the app sleeps. At the deadline the activity goes stale and shows "Where did you stop?" with 00:00. Pause/Resume and Done are `LiveActivityIntent`s (`Shared/SessionIntents.swift`) that run in the app's process.
- **"Where did you stop?"**: the end-of-session notification carries a "Leave a note" text field, so the note can be typed or dictated from the Lock Screen. Done on the Lock Screen posts the same question at once. The answer is saved as the session's *next small action*, which the room offers as the next question.
- **One notebook**: Siri, the buttons and the note change the same `tend-focus-v1` JSON the room saves, by running `focus/core.js` itself in JavaScriptCore (`App/TendOps.js`, tested in `tests/tend-native-ops.test.cjs`). Each such change bumps a revision (`TendNotebookRevision`); the open room is handed the new notebook (`window.TendNativeState`) and the app refuses a save from a room that hasn't seen it, so neither side writes over the other and sessions are never duplicated. A session started in the room starts the Live Activity too.
- Starting from Siri while a session is under way files that one first (ended early, with any notes it had), so nothing is lost.
- **A length in the answer** sets the session's length: "read this paper for 50 minutes", "plank 90 seconds", "wall sit a minute and a half" (`TendOps.length`, at the start or end of the answer, units spelled out). Under 5 minutes it is a **quick timer**: the `quick` phase in `focus/core.js` (mirrored on Android), which ends without a reflection, isn't recorded, and leaves the room's question alone. A bare length ("50 minutes") continues the room's current question.
- **Do Not Disturb**: iOS doesn't let an app turn on a Focus, but Shortcuts can. "Start a focus session" hands on the time the session ends, so a personal shortcut can be: *Start a focus session* → *Set Focus: Do Not Disturb, On, Until [Time: the session's end]*. Name it "Tend focus" and Siri runs it by name; it fits the Action Button too. The end notice is Time Sensitive (`App/Tend.entitlements`), so it still sounds through Do Not Disturb.

The Live Activity shows the session's question on the Lock Screen; notifications still never include task or note text. Swipe the activity away, or turn off Live Activities for Tend in Settings, to keep the question off the Lock Screen.

For simulator checks, a Debug build has to be signed with the team's development certificate (not "Sign to Run Locally") or Shortcuts can't reach its intents ("Couldn't find AppShortcutsProvider"): `codesign --force --sign "Apple Development" --timestamp=none` the `.appex`, then the `.app`, before `simctl install`. `scripts/plank_clock_font.py` makes the Live Activity's copy of Plank Pixel with the colon trimmed to three cells, as `pixel.css` trims it.

## Checks

From the repository root:

```bash
node --test tests/focus-timer.test.cjs tests/tend-native-ops.test.cjs
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
