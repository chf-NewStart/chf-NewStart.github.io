# Family Controls (Distribution) request for Tend

Blocking apps during a session uses Apple's Screen Time API (FamilyControls, ManagedSettings, DeviceActivity).
Development builds can use it now; TestFlight and the App Store need Apple's approval of the **Family Controls
(Distribution)** entitlement. The Account Holder (Houfu) submits the request, signed in at:

https://developer.apple.com/contact/request/family-controls-distribution

## Answers

- **App name:** Tend: Pixel Tomato Timer
- **App Store Connect Apple ID:** 6827232455
- **Bundle IDs that need the entitlement:**
  - `com.houfu72.tend` (the app: asks for permission, lets the person pick apps, applies the block)
  - `com.houfu72.tend.ActivityMonitor` (DeviceActivityMonitor extension: lifts the block when a session ends)
  - `com.houfu72.tend.Shield` (ShieldConfiguration extension: the "Tend is on" screen on a blocked app)
- **How the app uses Family Controls:**

  Tend is a focus timer for research and study: the person starts a session on one question, often by Siri,
  and it runs on the Lock Screen. With the person's own permission (FamilyControls individual authorization),
  they choose the apps that distract them in Apple's FamilyActivityPicker. While a session they started is
  running, Tend shields those apps with ManagedSettings, so opening one shows a "Tend is on, stay with this"
  screen instead. The shield is removed when the session ends (a DeviceActivity schedule ending at the session's
  end time) or as soon as the person taps Done. Tend only holds the opaque tokens the picker returns; it never
  learns which apps were chosen, and nothing leaves the device. It is a self-control tool for the device's own
  user, not a parental-control app, and it never manages anyone else's device.
