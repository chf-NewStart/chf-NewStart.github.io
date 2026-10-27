import AppIntents

/// "Start Tend" → "What are you working on?" → the answer is the session's question. The session runs on the Lock
/// Screen without opening the app, at the notebook's focus length unless the answer says one ("read this paper for 50
/// minutes"; under 5 minutes, like "plank 90 seconds", is a quick timer). Also in Shortcuts, for the Action Button and
/// Back Tap; it hands on the end time, so a shortcut can keep Do Not Disturb on until then.
struct StartFocusIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Start a focus session"
    static var description = IntentDescription("Starts a Tend session on one question, shows it on the Lock Screen, and asks where you stopped when the time is up. Say a length to set it (\"plank 90 seconds\"). Gives the time the session ends, for example for Set Focus.")
    static var openAppWhenRun = false
    static var authenticationPolicy = IntentAuthenticationPolicy.alwaysAllowed

    @Parameter(title: "Question", description: "The one question or task for this session.",
               requestValueDialog: IntentDialog("What are you working on?"))
    var question: String

    @Parameter(title: "Minutes", description: "Leave empty to use your focus length in Tend. Under 5 minutes is a quick timer.", inclusiveRange: (1, 120))
    var minutes: Int?

    static var parameterSummary: some ParameterSummary {
        Summary("Start a focus session on \(\.$question)") { \.$minutes }
    }

    func perform() async throws -> some IntentResult & ReturnsValue<Date> & ProvidesDialog {
        var question = self.question
        // A blank answer (Siri heard nothing) gets the question again rather than an error.
        if question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            question = try await $question.requestValue("What are you working on?")
        }
        let started = try await TendSession.start(question: question, minutes: minutes)
        return .result(value: started.endAt, dialog: "\(started.line)")
    }
}

/// Siri's phrases. Apple keeps free text out of a phrase, so Siri asks for the question after "Start Tend".
struct TendShortcuts: AppShortcutsProvider {
    static var shortcutTileColor = ShortcutTileColor.red

    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: StartFocusIntent(), phrases: [
            "Start \(.applicationName)",
            "Start a session in \(.applicationName)",
            "Start a focus session in \(.applicationName)",
            "Trigger \(.applicationName)",
            "Focus with \(.applicationName)",
            "Start focusing with \(.applicationName)"
        ], shortTitle: "Start a session", systemImageName: "timer")
        AppShortcut(intent: PauseSessionIntent(), phrases: [
            "Pause \(.applicationName)",
            "Pause my session in \(.applicationName)"
        ], shortTitle: "Pause", systemImageName: "pause")
        AppShortcut(intent: ResumeSessionIntent(), phrases: [
            "Resume \(.applicationName)",
            "Continue \(.applicationName)"
        ], shortTitle: "Resume", systemImageName: "play")
        AppShortcut(intent: FinishSessionIntent(), phrases: [
            "I'm done in \(.applicationName)",
            "Finish \(.applicationName)",
            "End my session in \(.applicationName)",
            "Leave a note in \(.applicationName)"
        ], shortTitle: "Done", systemImageName: "checkmark")
    }
}
