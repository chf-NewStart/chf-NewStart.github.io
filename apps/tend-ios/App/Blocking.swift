import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

/// The apps the person chose to lock while a focus session runs (Screen Time). Tend never learns which apps they
/// are: Apple's picker hands back opaque tokens. The block goes on while a focus session runs (Siri, the Lock Screen
/// or the room) and comes off when it pauses, ends, or Done is pressed. If Tend is asleep at the deadline, the
/// ActivityMonitor extension lifts it, so a block is only put on once that end is booked.
@MainActor
enum Blocking {
    private static let key = "TendBlockSelection"
    private static let store = ManagedSettingsStore(named: .tendSession)
    private static let center = DeviceActivityCenter()
    /// The session and deadline the block is on for; nil when nothing is blocked. `settled` is false until the first
    /// sync after launch, which clears anything an earlier run left behind.
    private static var applied: String?, settled = false

    static var selection: FamilyActivitySelection {
        get { UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(FamilyActivitySelection.self, from: $0) } ?? FamilyActivitySelection() }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: key); applied = nil }
    }

    private static var authorized: Bool { AuthorizationCenter.shared.authorizationStatus == .approved }

    /// What the room's settings row shows.
    static var status: [String: Any] {
        let chosen = selection
        return ["authorized": authorized, "apps": chosen.applicationTokens.count, "categories": chosen.categoryTokens.count, "sites": chosen.webDomainTokens.count]
    }

    /// Puts the block on or takes it off to match the timer.
    static func sync(_ notebook: [String: Any]?) {
        let timer = notebook?["timer"] as? [String: Any], chosen = selection
        let endMs = (timer?["endAt"] as? NSNumber)?.doubleValue ?? 0
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let nothingChosen = chosen.applicationTokens.isEmpty && chosen.categoryTokens.isEmpty && chosen.webDomainTokens.isEmpty
        guard authorized, !nothingChosen, timer?["phase"] as? String == "focus", timer?["status"] as? String == "running", end > Date() else {
            lift()
            return
        }
        let signature = "\(timer?["id"] as? String ?? "")-\(endMs)"
        guard signature != applied else { return }
        do {
            center.stopMonitoring([.tendSession])
            try center.startMonitoring(.tendSession, during: schedule(until: end))
        } catch {
            lift()
            return
        }
        store.shield.applications = chosen.applicationTokens.isEmpty ? nil : chosen.applicationTokens
        store.shield.applicationCategories = chosen.categoryTokens.isEmpty ? nil : .specific(chosen.categoryTokens)
        store.shield.webDomains = chosen.webDomainTokens.isEmpty ? nil : chosen.webDomainTokens
        applied = signature
        settled = true
    }

    private static func lift() {
        guard applied != nil || !settled else { return }
        center.stopMonitoring([.tendSession])
        store.clearAllSettings()
        applied = nil
        settled = true
    }

    /// DeviceActivity wants a window of at least 15 minutes, so a shorter session's window starts in the past.
    private static func schedule(until end: Date) -> DeviceActivitySchedule {
        let start = min(Date(), end.addingTimeInterval(-15 * 60))
        let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        return DeviceActivitySchedule(intervalStart: Calendar.current.dateComponents(parts, from: start),
                                      intervalEnd: Calendar.current.dateComponents(parts, from: end), repeats: false)
    }

    /// Asks for Screen Time permission once, then shows Apple's app picker. `done` runs when it closes.
    static func choose(from controller: UIViewController, done: @escaping () -> Void) {
        Task { @MainActor in
            if !authorized {
                do { try await AuthorizationCenter.shared.requestAuthorization(for: .individual) } catch {
                    done()
                    return
                }
            }
            let picker = UIHostingController(rootView: BlockPicker(selection: selection) { chosen in
                if let chosen { selection = chosen }
                controller.dismiss(animated: true)
                done()
            })
            controller.present(picker, animated: true)
        }
    }
}

private struct BlockPicker: View {
    @State var selection: FamilyActivitySelection
    let finish: (FamilyActivitySelection?) -> Void

    var body: some View {
        NavigationStack {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Block while you focus")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { finish(nil) } }
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { finish(selection) } }
                }
        }
        .preferredColorScheme(.dark)
    }
}
