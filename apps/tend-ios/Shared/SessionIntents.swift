import AppIntents

// The Live Activity's buttons, also offered to Siri and Shortcuts ("Pause Tend", "I'm done in Tend"). A
// LiveActivityIntent runs in the app's process, which the system starts in the background when it needs to;
// TendSession changes the notebook there. The widget extension only links these types for its buttons.

struct PauseSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause the session"
    static var description = IntentDescription("Pauses the Tend session that's running.")
    static var authenticationPolicy = IntentAuthenticationPolicy.alwaysAllowed

    func perform() async throws -> some IntentResult & ProvidesDialog {
        #if TEND_APP
        return .result(dialog: "\(try await TendSession.pause())")
        #else
        return .result(dialog: "")
        #endif
    }
}

struct ResumeSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Resume the session"
    static var description = IntentDescription("Carries on with the paused Tend session.")
    static var authenticationPolicy = IntentAuthenticationPolicy.alwaysAllowed

    func perform() async throws -> some IntentResult & ProvidesDialog {
        #if TEND_APP
        return .result(dialog: "\(try await TendSession.resume())")
        #else
        return .result(dialog: "")
        #endif
    }
}

struct FinishSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Finish the session"
    static var description = IntentDescription("Ends the Tend session now and keeps a note on where you stopped.")
    static var authenticationPolicy = IntentAuthenticationPolicy.alwaysAllowed

    @Parameter(title: "Where I stopped", description: "Saved as the session's next small action.")
    var note: String?

    @Parameter(title: "Ask where I stopped", default: true)
    var asks: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("Finish the session") { \.$note; \.$asks }
    }

    init() {}

    /// The Lock Screen's Done button. Nobody can be asked there, so the note comes from a notification instead.
    init(fromLockScreen: Bool) { asks = !fromLockScreen }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        #if TEND_APP
        return .result(dialog: "\(try await TendSession.finish(note: note, ask: asks ? { try await $note.requestValue("Where did you stop?") } : nil))")
        #else
        return .result(dialog: "")
        #endif
    }
}
