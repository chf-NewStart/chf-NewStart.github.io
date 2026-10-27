import ActivityKit
import Foundation

/// The Live Activity for one Tend session: its question, the tomato and a countdown, on the Lock Screen and in the
/// Dynamic Island. The app starts and updates it from the notebook; the widget extension draws it.
struct TendActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Status: String, Codable { case running, paused, review }
        var status: Status
        var isBreak: Bool
        var question: String
        /// While running, the deadline. The system counts down to it and marks the activity stale when it passes.
        var endAt: Date
        /// The whole interval and, while paused or waiting for its note, the part of it that was left (seconds).
        var duration: TimeInterval
        var remaining: TimeInterval
    }
    var sessionID: String
}

extension TendActivityAttributes.ContentState {
    /// When the interval began, moved on by any pauses, so a ring over `startAt...endAt` shows the share left.
    var startAt: Date { endAt.addingTimeInterval(-duration) }
    /// The share of the interval still to go, for drawing a paused or finished session.
    var left: Double { duration > 0 ? min(1, max(0, remaining / duration)) : 0 }
}
