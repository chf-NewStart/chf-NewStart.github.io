import DeviceActivity
import ManagedSettings

/// Lifts Tend's block when a focus session's time is up while Tend itself is asleep.
final class TendActivityMonitor: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard activity == .tendSession else { return }
        ManagedSettingsStore(named: .tendSession).clearAllSettings()
    }
}
