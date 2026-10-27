import AppIntents

/// "Start Tend" → "What are you working on?" → the answer is the session's question. The session runs on the Lock
/// Screen without opening the app, at the notebook's focus length. Also in Shortcuts, for the Action Button and
/// Back Tap.
struct StartFocusIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Start a focus session"
    static var description = IntentDescription("Starts a Tend session on one question, shows it on the Lock Screen, and asks where you stopped when the time is up.")
    static var openAppWhenRun = false
    static var authenticationPolicy = IntentAuthenticationPolicy.alwaysAllowed

    @Parameter(title: "Question", description: "The one question or task for this session.",
               requestValueDialog: IntentDialog("What are you working on?"))
    var question: String

    @Parameter(title: "Minutes", description: "Leave empty to use your focus length in Tend.", inclusiveRange: (1, 120))
    var minutes: Int?

    static var parameterSummary: some ParameterSummary {
        Summary("Start a focus session on \(\.$question)") { \.$minutes }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var question = self.question
        // A blank answer (Siri heard nothing) gets the question again rather than an error.
        if question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            question = try await $question.requestValue("What are you working on?")
        }
        return .result(dialog: "\(try await TendSession.start(question: question, minutes: minutes))")
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
