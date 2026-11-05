# Offline downloads and listening controls

Draft change for reader v252. It has not been deployed or released in an app build.

- Download all saves available PDF and Word originals on the device, serially, with
  progress, retries, cancellation between files and duplicate-job prevention. The
  existing Offline button continues to filter documents readable on this device.
- Find now returns to the spoken sentence or PDF page after manual scrolling,
  without seeking or restarting speech.
- Library buttons and selects use touch-action: manipulation to prevent double-tap
  page zoom. On phones, the Lists/Shelves label scrolls with its filter chips so it
  cannot cover a list name.
- A capability-detected native speech queue supports an opt-in preference to keep
  listening when switching apps or locking the screen. The native side refills the
  utterance queue without JavaScript completion callbacks. Foreground status restores
  the actual spoken location. Interruptions and disconnected headphones pause the
  queue. Existing app builds without this capability keep the legacy bridge.

Validation: 23 voice/native-queue unit checks, 22 iPad packaging checks, JavaScript
syntax and plist parsing pass. Browser regressions for download durability, repeated
taps, missing originals, Find now and scrolling-label overlap are included. Browser
execution is blocked in this test environment before page load. Native compilation,
real-device background playback and mobile browser layout still require verification.

This change does not modify the app release identity or submit an App Store build.
The main status file is unchanged; this document is the technical handoff for this
draft and excludes account, personal and operational history.
