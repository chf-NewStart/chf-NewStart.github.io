import ActivityKit
import Foundation
import OSLog
import UserNotifications

/// Session changes from outside the room: Siri, Shortcuts, the Live Activity's buttons and the note notification.
/// Each runs a TendOps operation on the saved notebook, then brings the reminder and the Live Activity up to date.
/// The returned line is what Siri says.
@MainActor
enum TendSession {
    /// Starts a session (or a quick timer, when Siri heard a length under 5 minutes). Returns what Siri says and when
    /// it ends, which Shortcuts can hand on, for example to keep Do Not Disturb on until then.
    static func start(question: String, minutes: Int?) async throws -> (line: String, endAt: Date) {
        var arguments: [String: Any] = ["question": question, "id": UUID().uuidString.lowercased()]
        if let minutes { arguments["minutes"] = minutes }
        let outcome = try TendStore.shared.run("start", arguments)
        await TendEffects.sync()
        let endAt = Date(timeIntervalSince1970: milliseconds(outcome.timer["endAt"]) / 1000)
        let length = spoken(milliseconds(outcome.timer["durationMs"]))
        let filed = outcome.info["filed"] is [String: Any] ? "Your last session is saved. " : ""
        if outcome.info["quick"] as? Bool == true {
            let label = (outcome.timer["task"] as? [String: Any])?["question"] as? String ?? "Quick timer"
            return (filed + "\(label), \(length), starting now.", endAt)
        }
        return (filed + "\(length), starting now." + (Reminder.canAsk ? " I’ll ask where you stopped." : ""), endAt)
    }

    static func pause() async throws -> String {
        let outcome = try TendStore.shared.run("pause")
        await TendEffects.sync()
        guard outcome.timer["status"] as? String == "paused" else { return "There’s no session running." }
        return "Paused with \(minutesLeft(outcome.timer)) left."
    }

    static func resume() async throws -> String {
        let outcome = try TendStore.shared.run("resume")
        await TendEffects.sync()
        guard outcome.timer["status"] as? String == "running" else { return "There’s no paused session." }
        return "Back to it: \(minutesLeft(outcome.timer)) left."
    }

    /// "Done": ends the session and keeps a note on where it stopped: the one given, Siri's answer to `ask`, or,
    /// from the Lock Screen's button, a "Where did you stop?" notification with a text field.
    static func finish(note: String?, ask: (() async throws -> String)?) async throws -> String {
        let before = TendStore.shared.notebook?["timer"] as? [String: Any]
        let outcome = try TendStore.shared.run("finish")
        await TendEffects.sync()
        guard let pending = outcome.state["pending"] as? [String: Any], let id = pending["id"] as? String else {
            switch before?["phase"] as? String {
            case "break": return "Break’s over. Say “Start Tend” when you’re ready."
            case "quick" where before?["status"] as? String != "idle": return "Timer stopped."
            default: return "There’s no session to finish. Say “Start Tend” to begin one."
            }
        }
        let recorded = plural(Int((milliseconds(pending["durationMs"]) / 60_000).rounded()), "minute")
        // A session whose time ran out already had its notification.
        let notify = pending["completed"] as? Bool != true
        var text = note
        if text == nil, let ask {
            do { text = try await ask() } catch {
                await LiveSession.end(id)
                if notify { await Reminder.askForNote(session: id, recorded: recorded) }
                throw error
            }
        }
        if let text, try await saveNote(text, session: id) { return "Saved \(recorded). That’s your thread for next time." }
        await LiveSession.end(id)
        if notify { await Reminder.askForNote(session: id, recorded: recorded) }
        return "\(recorded) recorded. Leave a note on where you stopped when you’re ready."
    }

    /// The answer to "Where did you stop?", from the notification or from Siri.
    @discardableResult
    static func saveNote(_ text: String, session id: String?) async throws -> Bool {
        var arguments: [String: Any] = ["text": text]
        if let id { arguments["id"] = id }
        let outcome = try TendStore.shared.run("note", arguments)
        await TendEffects.sync()
        return outcome.info["saved"] as? Bool == true
    }

    private static func milliseconds(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }

    private static func minutesLeft(_ timer: [String: Any]) -> String {
        let ms = timer["status"] as? String == "running" ? milliseconds(timer["endAt"]) - Date().timeIntervalSince1970 * 1000 : milliseconds(timer["remainingMs"])
        return plural(max(1, Int((ms / 60_000).rounded(.up))), "minute")
    }

    private static func plural(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }

    /// "25 minutes", "90 seconds", "2 minutes 30 seconds", as people say a length.
    private static func spoken(_ ms: Double) -> String {
        let seconds = Int((ms / 1000).rounded())
        if seconds % 60 == 0 { return plural(seconds / 60, "minute") }
        if seconds < 120 { return plural(seconds, "second") }
        return plural(seconds / 60, "minute") + " " + plural(seconds % 60, "second")
    }
}

/// Keeps the end-of-session notification and the Live Activity in line with the saved notebook, one pass at a time
/// and always from the latest notebook.
@MainActor
enum TendEffects {
    private static var last: Task<Void, Never>?

    static func sync() async {
        let previous = last
        let pass = Task { @MainActor in
            await previous?.value
            let notebook = TendStore.shared.notebook
            await Reminder.sync(notebook)
            await LiveSession.sync(notebook)
        }
        last = pass
        await pass.value
    }
}

/// The local notification at the end of a session. Its "Leave a note" field takes the answer to "Where did you
/// stop?" straight from the Lock Screen. Task and note text stay out of notifications; the Live Activity shows the
/// question.
enum Reminder {
    static let id = "tend.current-session", category = "tend.session-end", noteAction = "tend.note"
    /// Called when a reminder can't be scheduled, so the room can say so.
    @MainActor static var failed: (() -> Void)?
    @MainActor private static var allowed: Bool?, scheduled: String?
    /// Whether notifications may be shown, as last checked.
    @MainActor static var canAsk: Bool { allowed == true }

    static func registerCategory() {
        let note = UNTextInputNotificationAction(identifier: noteAction, title: "Leave a note", options: [],
                                                 textInputButtonTitle: "Save", textInputPlaceholder: "Where did you stop?")
        UNUserNotificationCenter.current().setNotificationCategories([UNNotificationCategory(identifier: category, actions: [note], intentIdentifiers: [])])
    }

    /// The permission, as the room's settings name it.
    @MainActor static func permission() async -> String {
        let status: String
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .authorized: status = "authorized"
        case .provisional, .ephemeral: status = "provisional"
        case .denied: status = "denied"
        default: status = "notDetermined"
        }
        allowed = status == "authorized" || status == "provisional"
        return status
    }

    /// Schedules, moves or clears the reminder to match the timer.
    @MainActor static func sync(_ notebook: [String: Any]?) async {
        let center = UNUserNotificationCenter.current()
        if allowed == nil { _ = await permission() }
        let timer = notebook?["timer"] as? [String: Any]
        guard allowed == true, timer?["status"] as? String == "running", let endAt = (timer?["endAt"] as? NSNumber)?.doubleValue,
              endAt / 1000 > Date().timeIntervalSince1970 else {
            center.removePendingNotificationRequests(withIdentifiers: [id])
            scheduled = nil
            // Once the session is saved, its "Where did you stop?" is answered.
            if timer?["status"] as? String == "idle" { center.removeDeliveredNotifications(withIdentifiers: [id]) }
            return
        }
        let settings = notebook?["settings"] as? [String: Any]
        let sound = settings?["sound"] as? Bool != false, phase = timer?["phase"] as? String ?? "focus"
        let session = timer?["id"] as? String ?? ""
        let signature = "\(session)-\(endAt)-\(phase)-\(sound)"
        guard signature != scheduled else { return }
        center.removePendingNotificationRequests(withIdentifiers: [id])
        let content = UNMutableNotificationContent()
        switch phase {
        case "break":
            content.title = "A little room to begin again"
            content.body = "Your break has finished. Return when you’re ready."
        case "quick":
            content.title = "Time’s up"
            content.body = "Your quick timer has finished. Nice work."
        default:
            content.title = "A moment to gather"
            content.body = "Your focus interval has finished. Where did you stop? Press and hold to leave a note."
            content.categoryIdentifier = category
            content.userInfo = ["session": session]
        }
        // Through Do Not Disturb and other Focus modes, like a timer, when the person allows it in Settings.
        content.interruptionLevel = .timeSensitive
        if sound { content.sound = .default }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, endAt / 1000 - Date().timeIntervalSince1970), repeats: false)
        scheduled = signature
        do { try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) } catch {
            scheduled = nil
            failed?()
        }
    }

    /// "Where did you stop?" now, for a session ended with the Lock Screen's Done button.
    @MainActor static func askForNote(session: String, recorded: String) async {
        if allowed == nil { _ = await permission() }
        guard allowed == true else { return }
        let content = UNMutableNotificationContent()
        content.title = "A moment to gather"
        content.body = "\(recorded) recorded. Where did you stop? Press and hold to leave a note."
        content.categoryIdentifier = category
        content.userInfo = ["session": session]
        scheduled = nil
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
}

/// The Live Activity for the room's timer: started once for each session, updated as it pauses, resumes or is
/// reworded, and ended once the session is saved (or Done is pressed on the Lock Screen).
@MainActor
enum LiveSession {
    private static let startedKey = "TendLiveActivitySession"
    private static let log = Logger(subsystem: "com.houfu72.tend", category: "LiveActivity")

    static func sync(_ notebook: [String: Any]?) async {
        let wanted = TendActivityAttributes.ContentState.current(in: notebook)
        for activity in Activity<TendActivityAttributes>.activities where activity.attributes.sessionID != wanted?.id {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard let (id, state) = wanted else { return }
        let content = ActivityContent(state: state, staleDate: state.status == .running ? state.endAt : nil)
        if let activity = Activity<TendActivityAttributes>.activities.first(where: { $0.attributes.sessionID == id }) {
            if activity.content.state != state { await activity.update(content) }
        } else if state.status != .review, UserDefaults.standard.string(forKey: startedKey) != id, ActivityAuthorizationInfo().areActivitiesEnabled {
            // Once per session, so one swiped off the Lock Screen stays off. A request that fails (Live Activities
            // off, or Tend already in the background) is tried again at the next change.
            do {
                _ = try Activity.request(attributes: TendActivityAttributes(sessionID: id), content: content, pushType: nil)
                UserDefaults.standard.set(id, forKey: startedKey)
            } catch {
                log.error("Live Activity not started: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    static func end(_ id: String) async {
        for activity in Activity<TendActivityAttributes>.activities where activity.attributes.sessionID == id {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}

extension TendActivityAttributes.ContentState {
    /// The session on the room's timer, as the Live Activity shows it; nil when none is under way.
    static func current(in notebook: [String: Any]?) -> (id: String, state: Self)? {
        guard let timer = notebook?["timer"] as? [String: Any], let id = timer["id"] as? String,
              let status = Status(rawValue: timer["status"] as? String ?? "") else { return nil }
        let seconds = { (key: String) in ((timer[key] as? NSNumber)?.doubleValue ?? 0) / 1000 }
        let question = (timer["task"] as? [String: Any])?["question"] as? String ?? ""
        return (id, Self(status: status, isBreak: timer["phase"] as? String == "break", isQuick: timer["phase"] as? String == "quick", question: question,
                         endAt: status == .running ? Date(timeIntervalSince1970: seconds("endAt")) : .distantPast,
                         duration: seconds("durationMs"), remaining: status == .running ? 0 : seconds("remainingMs")))
    }
}
