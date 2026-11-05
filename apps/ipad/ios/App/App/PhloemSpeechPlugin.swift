import AVFoundation
import Capacitor
import Foundation
import UIKit

/// Listen with the voices installed on this iPad. WKWebView's Web Speech lists only the
/// voices that ship with iPadOS, so a Premium or Enhanced voice downloaded in Settings
/// (Jamie, Ava…) never reached the reader. AVSpeechSynthesizer sees every installed voice.
/// Speech is synthesized on the device: no network and no AI.
@objc(PhloemSpeechPlugin)
final class PhloemSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    let identifier = "PhloemSpeechPlugin"
    let jsName = "PhloemSpeech"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "voices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackground", returnType: CAPPluginReturnPromise)
    ]

    private let synthesizer = AVSpeechSynthesizer()
    // Each speak() call is answered when its utterance finishes or is cancelled.
    private var calls: [ObjectIdentifier: CAPPluginCall] = [:]
    private var sessionReady = false
    private var texts: [String] = []
    private var queueSession = ""
    private var queueState = "stopped"
    private var queueIndex = 0
    private var queueCursor = 0
    private var queueRate: Float = 1
    private var queueVoice = ""
    private var queueRevision = 0
    private var continueInBackground = false
    private var resumeAfterInterruption = false
    private var queued: [ObjectIdentifier: Int] = [:]

    override func load() {
        super.load()
        synthesizer.delegate = self
        synthesizer.usesApplicationAudioSession = true
        NotificationCenter.default.addObserver(self, selector: #selector(enteredBackground),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)),
                                               name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
        if #available(iOS 17.0, *) {
            NotificationCenter.default.addObserver(self, selector: #selector(voicesDidChange),
                                                   name: AVSpeechSynthesizer.availableVoicesDidChangeNotification, object: nil)
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func voicesDidChange() {
        notifyListeners("voicesChanged", data: [:])
    }

    /// Names carry the quality the way macOS shows it ("Jamie (Premium)"), which is what the
    /// reader ranks and labels voices by. Apple's names often say it already; never twice.
    @objc func voices(_ call: CAPPluginCall) {
        let list: [[String: Any]] = AVSpeechSynthesisVoice.speechVoices().map { voice in
            let quality = voice.quality.rawValue
            let tagged = voice.name.contains("(Premium)") || voice.name.contains("(Enhanced)")
            let suffix = tagged ? "" : quality >= 3 ? " (Premium)" : quality == 2 ? " (Enhanced)" : ""
            return ["voiceURI": voice.identifier, "name": voice.name + suffix, "lang": voice.language,
                    "quality": quality, "localService": true, "default": false]
        }
        call.resolve(["voices": list])
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let voiceURI = call.getString("voiceURI") ?? ""
        let rate = Float(call.getDouble("rate") ?? 1)
        DispatchQueue.main.async {
            self.prepareSession()
            let utterance = AVSpeechUtterance(string: text)
            if !voiceURI.isEmpty, let voice = AVSpeechSynthesisVoice(identifier: voiceURI) { utterance.voice = voice }
            utterance.rate = Self.platformRate(rate)
            self.calls[ObjectIdentifier(utterance)] = call
            self.synthesizer.speak(utterance)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.resetQueue()
            self.synthesizer.stopSpeaking(at: .immediate)
            // Queued utterances may never report a cancel; answer them all here.
            let waiting = self.calls
            self.calls.removeAll()
            waiting.values.forEach { $0.resolve(["finished": false]) }
            self.publish()
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        }
    }

    @objc func capabilities(_ call: CAPPluginCall) { call.resolve(["backgroundQueue": true]) }

    private func snapshot() -> [String: Any] {
        ["sessionId": queueSession, "state": queueState, "index": queueIndex,
         "revision": queueRevision, "continueInBackground": continueInBackground]
    }

    private func publish() {
        queueRevision += 1
        notifyListeners("speechProgress", data: snapshot())
    }

    private func resetQueue() {
        queued.removeAll()
        synthesizer.stopSpeaking(at: .immediate)
        texts.removeAll()
        queueState = "stopped"
        queueCursor = 0
        resumeAfterInterruption = false
    }

    // Queue/refill on the native side, not from JavaScript completion callbacks.
    // A bounded queue avoids constructing thousands of utterances for a long book.
    private func fillQueue() {
        guard queueState == "playing" else { return }
        while queued.count < 8 && queueCursor < texts.count {
            let utterance = AVSpeechUtterance(string: texts[queueCursor])
            if !queueVoice.isEmpty, let voice = AVSpeechSynthesisVoice(identifier: queueVoice) { utterance.voice = voice }
            utterance.rate = Self.platformRate(queueRate)
            queued[ObjectIdentifier(utterance)] = queueCursor
            queueCursor += 1
            synthesizer.speak(utterance)
        }
    }

    @objc func playQueue(_ call: CAPPluginCall) {
        let list = call.getArray("texts", String.self) ?? []
        guard !list.isEmpty, let session = call.getString("sessionId"), !session.isEmpty else {
            call.reject("No readable text was supplied."); return
        }
        let start = max(0, min(call.getInt("index") ?? 0, list.count - 1))
        DispatchQueue.main.async {
            self.resetQueue()
            self.queueSession = session
            self.texts = list
            self.queueIndex = start
            self.queueCursor = start
            self.queueRate = Float(call.getDouble("rate") ?? 1)
            self.queueVoice = call.getString("voiceURI") ?? ""
            self.continueInBackground = call.getBool("continueInBackground") ?? false
            self.prepareSession()
            self.queueState = "playing"
            self.fillQueue()
            self.publish()
            call.resolve(self.snapshot())
        }
    }

    private func pauseQueue() {
        guard queueState == "playing" else { return }
        // Resume from the current chunk, matching the web player's sentence behavior.
        // Clearing first makes callbacks from cancelled queued utterances harmless.
        queued.removeAll()
        synthesizer.stopSpeaking(at: .immediate)
        queueCursor = queueIndex
        queueState = "paused"
        publish()
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.resumeAfterInterruption = false
            self.pauseQueue()
            call.resolve(self.snapshot())
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if !self.texts.isEmpty {
                self.prepareSession()
                self.queueState = "playing"
                self.fillQueue()
                self.publish()
            }
            call.resolve(self.snapshot())
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.texts.isEmpty else { call.resolve(self.snapshot()); return }
            self.queued.removeAll()
            self.synthesizer.stopSpeaking(at: .immediate)
            self.queueIndex = max(0, min(call.getInt("index") ?? 0, self.texts.count - 1))
            self.queueCursor = self.queueIndex
            self.queueState = (call.getBool("playing") ?? false) ? "playing" : "paused"
            if self.queueState == "playing" { self.prepareSession(); self.fillQueue() }
            self.publish()
            call.resolve(self.snapshot())
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.snapshot()) }
    }

    @objc func setBackground(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.continueInBackground = call.getBool("enabled") ?? false
            if !self.continueInBackground && UIApplication.shared.applicationState == .background { self.pauseQueue() }
            self.publish()
            call.resolve(self.snapshot())
        }
    }

    @objc private func enteredBackground() {
        if !continueInBackground { pauseQueue() }
    }

    @objc private func interrupted(_ notification: Notification) {
        DispatchQueue.main.async { self.handleInterruption(notification) }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began {
            resumeAfterInterruption = queueState == "playing"
            pauseQueue()
        } else {
            let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
            if resumeAfterInterruption && shouldResume && (continueInBackground || UIApplication.shared.applicationState == .active) {
                prepareSession(); queueState = "playing"; fillQueue(); publish()
            }
            resumeAfterInterruption = false
        }
    }

    @objc private func routeChanged(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
            DispatchQueue.main.async {
                self.resumeAfterInterruption = false
                self.pauseQueue()
            }
        }
    }

    /// Plays through the silent switch, as spoken audio, like a podcast app.
    private func prepareSession() {
        if !sessionReady {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
            sessionReady = true
        }
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    /// Web Speech rates (1 = normal) mapped the way WebKit maps them for Safari.
    private static func platformRate(_ rate: Float) -> Float {
        let base = AVSpeechUtteranceDefaultSpeechRate
        let mapped = rate < 1 ? rate * base : base + (rate - 1) * (AVSpeechUtteranceMaximumSpeechRate - base)
        return min(max(mapped, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
    }

    private func finish(_ utterance: AVSpeechUtterance, finished: Bool) {
        guard let call = calls.removeValue(forKey: ObjectIdentifier(utterance)) else { return }
        call.resolve(["finished": finished])
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        if let index = queued.removeValue(forKey: ObjectIdentifier(utterance)) {
            if index == texts.count - 1 {
                queueIndex = index
                queueState = "finished"
                publish()
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } else { fillQueue() }
            return
        }
        finish(utterance, finished: true)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        if let index = queued[ObjectIdentifier(utterance)] {
            queueIndex = index
            publish()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finish(utterance, finished: false)
    }
}
