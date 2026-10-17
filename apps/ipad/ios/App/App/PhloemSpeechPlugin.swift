import AVFoundation
import Capacitor
import Foundation

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
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private let synthesizer = AVSpeechSynthesizer()
    // Each speak() call is answered when its utterance finishes or is cancelled.
    private var calls: [ObjectIdentifier: CAPPluginCall] = [:]
    private var sessionReady = false

    override func load() {
        super.load()
        synthesizer.delegate = self
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
            self.synthesizer.stopSpeaking(at: .immediate)
            // Queued utterances may never report a cancel; answer them all here.
            let waiting = self.calls
            self.calls.removeAll()
            waiting.values.forEach { $0.resolve(["finished": false]) }
            call.resolve()
        }
    }

    /// Plays through the silent switch, as spoken audio, like a podcast app.
    private func prepareSession() {
        guard !sessionReady else { return }
        sessionReady = true
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
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
        finish(utterance, finished: true)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finish(utterance, finished: false)
    }
}
