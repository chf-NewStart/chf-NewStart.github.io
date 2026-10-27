import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct TendWidgets: WidgetBundle {
    var body: some Widget { TendLiveActivity() }
}

/// Tend on the Lock Screen and in the Dynamic Island: the question, the tomato in its ring of blocks, and a countdown
/// the system keeps ticking while the app sleeps. Pause/Resume and Done run in the app (Shared/SessionIntents.swift).
struct TendLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TendActivityAttributes.self) { context in
            LockScreen(session: Session(context))
                .activityBackgroundTint(Px.paper)
                .activitySystemActionForegroundColor(Px.ink)
        } dynamicIsland: { context in
            let session = Session(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Dial(session: session, radius: 6).frame(width: 58, height: 58).padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 6) {
                        Text(session.label).font(Px.pixel(10)).foregroundStyle(session.labelColor)
                        Clock(session: session).font(Px.pixel(30)).foregroundStyle(session.clockColor)
                    }
                    .padding(.trailing, 6).padding(.top, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .bottom, spacing: 12) {
                        Text(session.line).font(Px.mono(13)).foregroundStyle(Px.ink.opacity(0.88)).lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Keys(session: session, labelled: true)
                    }
                    .padding(.horizontal, 6).padding(.bottom, 4)
                }
            } compactLeading: {
                RipeningTomato(session: session).frame(width: 20, height: 18).padding(.leading, 2)
            } compactTrailing: {
                Clock(session: session).font(Px.pixel(40 / 3)).foregroundStyle(session.clockColor)
                    .multilineTextAlignment(.trailing).frame(width: 42, alignment: .trailing)
            } minimal: {
                Dial(session: session, radius: 3).frame(width: 24, height: 24)
            }
            .keylineTint(session.accent)
        }
    }
}

/// One moment of the activity, as the views need it.
struct Session {
    let state: TendActivityAttributes.ContentState
    /// The interval ran out (the system marks the activity stale at the deadline), or the session ended early.
    let finished: Bool

    init(_ context: ActivityViewContext<TendActivityAttributes>) {
        self.init(state: context.state, stale: context.isStale)
    }

    init(state: TendActivityAttributes.ContentState, stale: Bool) {
        self.state = state
        finished = state.status == .review || (state.status == .running && (stale || state.endAt <= Date()))
    }

    var running: Bool { state.status == .running && !finished }
    var accent: Color { state.isBreak ? Px.green : Px.tomato }
    /// The share left: live while running is the system's job; this is for the tomato and a paused ring.
    var left: Double {
        if finished { return state.status == .review ? state.left : 0 }
        if running { return state.duration > 0 ? min(1, max(0, state.endAt.timeIntervalSinceNow / state.duration)) : 0 }
        return state.left
    }
    /// The tomato ripens as the interval passes; during a break it stays ripe, as in the room.
    var ripe: Double { state.isBreak ? 1 : 1 - left }

    var label: String {
        if finished { return state.isBreak ? "BREAK'S OVER" : state.isQuick ? "TIME'S UP" : "WHERE DID YOU STOP?" }
        if state.status == .paused { return "PAUSED" }
        return state.isBreak ? "TAKE A BREATH" : state.isQuick ? "KEEP GOING" : "STAY WITH THIS"
    }
    var labelColor: Color { finished ? accent : state.status == .paused ? Px.muted : Px.green }
    var clockColor: Color { finished ? accent : state.status == .paused ? Px.ink.opacity(0.6) : Px.ink }
    var line: String {
        if state.isBreak { return finished ? "Return when you're ready." : "Look away, stretch, get some water." }
        return state.question.isEmpty ? "One question at a time." : state.question
    }
}

/// The countdown: ticked by the system while running, still while paused, 00:00 once the time is up.
struct Clock: View {
    let session: Session

    var body: some View {
        if session.running {
            Text(timerInterval: session.state.startAt...session.state.endAt, countsDown: true)
        } else {
            let seconds = session.finished && session.state.status != .review ? 0 : Int(session.state.remaining.rounded(.up))
            Text(String(format: "%02d:%02d", seconds / 60, seconds % 60))
        }
    }
}

/// The tomato in its ring of blocks. While running, the system's own timer progress shows through the blocks, so the
/// ring keeps emptying (clockwise from 12 o'clock, like the room's) and the tomato ripens with the app asleep.
struct Dial: View {
    let session: Session
    let radius: Int

    var body: some View {
        let ring = Ring(radius: radius)
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height), unit = size / ring.units
            let tomato = CGSize(width: CGFloat(ring.radius * 8) * unit, height: CGFloat(ring.radius * 7) * unit)
            ZStack {
                Ring.Blocks(ring: ring).fill(Px.ringOff)
                if session.running {
                    Rectangle().fill(session.accent)
                        .mask(arc(ring: ring, unit: unit))
                        .mask(Ring.Blocks(ring: ring))
                } else {
                    ring.lit(session.left).fill(session.accent)
                }
                RipeningTomato(session: session).frame(width: tomato.width, height: tomato.height)
            }
            .frame(width: size, height: size)
            .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        }
        .accessibilityElement()
        .accessibilityLabel(session.running ? "Running" : session.state.status == .paused ? "Paused" : "Time is up")
    }

    /// The share left, as rings of the system's circular progress a little apart, so the band covers the blocks
    /// whatever stroke the system draws. Each is made a mask on its own (overlapping tracks would add up to a lit
    /// ring). Mirrored so it empties clockwise from 12 o'clock, like the room's ring.
    private func arc(ring: Ring, unit: CGFloat) -> some View {
        ZStack {
            ForEach(-4...8, id: \.self) { step in
                let side = (CGFloat(ring.radius * 16) + CGFloat(step) * 3) * unit
                LiveMask {
                    ProgressView(timerInterval: session.state.startAt...session.state.endAt, countsDown: true,
                                 label: { EmptyView() }, currentValueLabel: { EmptyView() })
                        .progressViewStyle(.circular)
                        .frame(width: side, height: side)
                }
            }
        }
        .scaleEffect(x: -1, y: 1)
    }
}

/// The pixel tomato, ripening from the bottom up as tomatoes do: orange climbs ahead of the red. During a break it
/// stays ripe, as in the room.
struct RipeningTomato: View {
    let session: Session

    var body: some View {
        GeometryReader { geometry in
            if session.state.isBreak {
                PixelTomato()
            } else {
                ZStack {
                    PixelTomato(ripe: 0)
                    PixelTomato(ripe: 0.55).mask(ripening(from: 0, to: 0.8, size: geometry.size))
                    PixelTomato(ripe: 1).mask(ripening(from: 0.2, to: 1, size: geometry.size))
                }
            }
        }
        .aspectRatio(16 / 14, contentMode: .fit)
    }

    /// What shows of a riper layer over the part `from...to` of the interval: filling from the bottom, live while
    /// running (a bar of the system's linear progress, turned upright and widened to the tomato), still otherwise.
    @ViewBuilder
    private func ripening(from: Double, to: Double, size: CGSize) -> some View {
        if session.running {
            let start = session.state.startAt.addingTimeInterval(session.state.duration * from)
            let end = session.state.startAt.addingTimeInterval(session.state.duration * to)
            LiveMask {
                ProgressView(timerInterval: start...end, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.linear)
                    .frame(width: size.height * 1.2)
                    .scaleEffect(x: 1, y: size.width * 0.4)
                    .rotationEffect(.degrees(-90))
                    .frame(width: size.width, height: size.height)
            }
        } else {
            let share = min(1, max(0, (session.ripe - from) / (to - from)))
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                Rectangle().frame(height: max(0, size.height * (1.2 * share - 0.1)))
            }
        }
    }
}

/// The system's timer progress drawn white on black and turned into a crisp mask: the filled part shows, the track
/// and the background don't.
struct LiveMask<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            Color.black
            content.tint(.white)
        }
        .compositingGroup()
        .brightness(-0.3)
        .contrast(6)
        .luminanceToAlpha()
    }
}

/// Pause or Resume, and Done: the room's arcade keys.
struct Keys: View {
    let session: Session
    var labelled = false
    var vertical = false

    var body: some View {
        let layout = vertical ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        layout {
            if session.running {
                Button(intent: PauseSessionIntent()) { Key(primary: true, isBreak: session.state.isBreak, glyph: Glyph.pause, title: labelled ? "PAUSE" : nil) }
                    .accessibilityLabel("Pause")
            } else if session.state.status == .paused {
                Button(intent: ResumeSessionIntent()) { Key(primary: true, isBreak: session.state.isBreak, glyph: Glyph.play, title: labelled ? "RESUME" : nil) }
                    .accessibilityLabel("Resume")
            }
            Button(intent: FinishSessionIntent(fromLockScreen: true)) { Key(primary: session.finished, isBreak: session.state.isBreak, glyph: Glyph.check, title: labelled ? "DONE" : nil) }
                .accessibilityLabel("Done")
        }
        .buttonStyle(.plain)
    }
}

struct Key: View {
    let primary: Bool
    let isBreak: Bool
    let glyph: [String]
    let title: String?

    var body: some View {
        let fill = primary ? (isBreak ? Px.green : Px.tomato) : Px.key
        let edge = primary ? (isBreak ? Px.greenEdge : Px.tomatoEdge) : Px.keyEdge
        let lip = isBreak ? Px.greenDeep : Px.tomatoDeep
        let ink = primary ? (isBreak ? Px.breakInk : Px.keyInk) : Px.ink
        HStack(spacing: 8) {
            Sprite(rows: glyph).fill(ink).frame(width: CGFloat(glyph[0].count * 2), height: CGFloat(glyph.count * 2))
            if let title { Text(title).font(Px.pixel(10)).foregroundStyle(ink) }
        }
        .padding(.horizontal, title == nil ? 0 : 12)
        .padding(.bottom, primary ? 2 : 0)
        .frame(minWidth: 46, minHeight: 40)
        .background {
            ZStack(alignment: .bottom) {
                Notched().fill(edge)
                Rectangle().fill(fill).padding(3)
                if primary { Rectangle().fill(lip).frame(height: 4).padding([.horizontal, .bottom], 3) }
            }
        }
    }
}

struct LockScreen: View {
    let session: Session

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Dial(session: session, radius: 7).frame(width: 80, height: 80)
            VStack(alignment: .leading, spacing: 6) {
                Text(session.label).font(Px.pixel(10)).foregroundStyle(session.labelColor)
                Clock(session: session).font(Px.pixel(40)).foregroundStyle(session.clockColor)
                    .shadow(color: session.accent.opacity(0.4), radius: 11)
                Text(session.line).font(Px.mono(12)).foregroundStyle(Px.ink.opacity(0.88)).lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Keys(session: session, vertical: true)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .overlay(Scanlines().fill(Color.black.opacity(0.13)).allowsHitTesting(false))
    }
}

#if DEBUG
struct TendLiveActivity_Previews: PreviewProvider {
    static let attributes = TendActivityAttributes(sessionID: "preview")
    static let state = TendActivityAttributes.ContentState(status: .running, isBreak: false,
        question: "imma read this paper and find out how metabolic pathways help simplify the things",
        endAt: Date().addingTimeInterval(18 * 60), duration: 25 * 60, remaining: 0)
    static var previews: some View {
        attributes.previewContext(state, viewKind: .content)
        attributes.previewContext(state, viewKind: .dynamicIsland(.expanded))
    }
}
#endif
