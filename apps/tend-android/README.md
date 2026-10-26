# Tend for Android

A native Kotlin + Jetpack Compose port of Tend, the pixel tomato clock at <https://houfu72.com/focus/>. Unlike the
iOS app (a bundled web view), nothing here is web: the timer engine is a line-by-line port of `focus/core.js`, and the
room is drawn in Compose to match `focus/pixel.css`.

- **Engine:** `app/src/main/java/com/houfu72/tend/core/` (`TendCore.kt`, `Backup.kt`). Pure functions over immutable
  state, the same rules as the web room. The saved notebook is the web room's `tend-focus-v1` JSON, so a backup moves
  between web, iPhone and Android.
- **Tests:** `app/src/test/.../TendCoreTest.kt` is `tests/focus-timer.test.cjs` case for case, plus a check that a web
  backup opens here and that what Android writes has the web shape.
- **App:** `TendController.kt` is `focus/app.js`; `ui/` holds the rooms (Focus, Notebook, Sources), the sheets, and
  the pixel pieces (`Pixel.kt`: the 16x14 tomato ripening in OKLCH, the midpoint ring of 96 blocks).
- **Reminders:** one exact alarm at the deadline (`Reminders.kt`, `USE_EXACT_ALARM`, since Tend is a timer). The notice
  never contains task or note text. It is skipped while Tend is on screen, where the room chimes itself.
- **Resources:** fonts, launcher icon, notification icon and the 8-bit chime are generated from the web room's files.
  Plank Pixel is Houfu's own font; DM Sans and IBM Plex Mono are OFL (licences in `focus/fonts/`).

## Build

Needs JDK 21 and the Android SDK (`brew install openjdk@21 --cask android-commandlinetools`, then `sdkmanager`).
`local.properties` points at the SDK (`sdk.dir=…`). Compiles against SDK 37, targets 36 (Play's requirement since
31 Aug 2026), runs on Android 8.0+ (minSdk 26).

```bash
./gradlew :app:testDebugUnitTest      # engine tests
./gradlew :app:assembleDebug           # app-debug.apk for the emulator or a phone
./gradlew :app:bundleRelease           # signed app-release.aab for Play
```

The release bundle is signed with the **upload key** in `~/.android-upload-keys/tend-upload.jks`; its passwords are
in `~/.gradle/gradle.properties` (`TEND_UPLOAD_*`) and copied to `~/.android-upload-keys/tend-upload.properties`.
Neither is in the repo. Back both up. Play App Signing holds the real app-signing key, so a lost upload key can be
reset through Play support, but it takes days.

## Release

`release/play-listing.json` has the store text, App content answers and review notes. `release/make_store_art.py`
renders the 512 px icon and the 1024x500 feature graphic into `release/store/`.
