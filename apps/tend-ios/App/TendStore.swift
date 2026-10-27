import Foundation
import JavaScriptCore

/// The notebook as the room saves it: `tend-focus-v1` JSON under `TendNotebookV1` in the app's UserDefaults.
/// The room, Siri, the Live Activity's buttons and the note notification all change this one copy. Changes from
/// outside the room run core.js's own rules (TendOps.js in JavaScriptCore) and bump a revision; the room is handed
/// the new notebook, and a save from a room that hasn't seen the latest revision is refused, so neither side
/// overwrites the other.
@MainActor
final class TendStore {
    static let shared = TendStore()
    /// Posted after a change made outside the room.
    static let didChange = Notification.Name("TendNotebookDidChange")
    private let notebookKey = "TendNotebookV1", revisionKey = "TendNotebookRevision"
    private let defaults = UserDefaults.standard
    private var context: JSContext?, operations: JSValue?

    var revision: Int { defaults.integer(forKey: revisionKey) }
    var data: Data? { defaults.data(forKey: notebookKey) }
    var notebook: [String: Any]? { data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] } }

    /// A save from the room. False when the room is behind a change made outside it; it is sent the notebook instead.
    func save(fromRoom data: Data, seen: Int?) -> Bool {
        if let seen, seen != revision { return false }
        defaults.set(data, forKey: notebookKey)
        return true
    }

    struct Outcome {
        let state: [String: Any]
        let info: [String: Any]
        var timer: [String: Any] { state["timer"] as? [String: Any] ?? [:] }
    }

    /// Runs one of TendOps.js's operations on the saved notebook and keeps the result.
    func run(_ name: String, _ arguments: [String: Any] = [:]) throws -> Outcome {
        let operations = try engine()
        var arguments = arguments
        arguments["now"] = (Date().timeIntervalSince1970 * 1000).rounded()
        let stored: Any = data.flatMap { String(data: $0, encoding: .utf8) } ?? NSNull()
        let result = operations.invokeMethod("run", withArguments: [name, stored, arguments])
        if let exception = context?.exception {
            context?.exception = nil
            throw TendStoreError.refused(exception.objectForKeyedSubscript("message")?.toString() ?? "Tend couldn’t do that.")
        }
        guard let text = result?.toString(), let output = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
              let state = output["state"] as? [String: Any] else { throw TendStoreError.engine }
        if output["changed"] as? Bool != false {
            defaults.set(try JSONSerialization.data(withJSONObject: state), forKey: notebookKey)
            defaults.set(revision + 1, forKey: revisionKey)
            NotificationCenter.default.post(name: Self.didChange, object: nil)
        }
        return Outcome(state: state, info: output)
    }

    private func engine() throws -> JSValue {
        if let operations { return operations }
        guard let context = JSContext() else { throw TendStoreError.engine }
        for (name, folder) in [("core", "Web"), ("TendOps", nil)] as [(String, String?)] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "js", subdirectory: folder),
                  let source = try? String(contentsOf: url, encoding: .utf8) else { throw TendStoreError.engine }
            context.evaluateScript(source, withSourceURL: url)
        }
        guard context.exception == nil, let operations = context.objectForKeyedSubscript("TendOps"), operations.isObject else { throw TendStoreError.engine }
        self.context = context
        self.operations = operations
        return operations
    }
}

enum TendStoreError: LocalizedError {
    case engine, refused(String)
    var errorDescription: String? {
        switch self {
        case .engine: return "Tend couldn’t open its timer. Open Tend once, then try again."
        case .refused(let message): return message
        }
    }
}
