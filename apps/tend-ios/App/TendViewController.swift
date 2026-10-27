import UIKit
import WebKit
import UserNotifications

/// Bundled offline UI with native storage, reminders, sharing and screen-awake control.
/// No remote content is loaded into the privileged web view.
final class TendViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    /// Posted when a reminder arrives while Tend is open: the room catches up by itself.
    static let catchUp = Notification.Name("TendRoomCatchUp")
    private let store = TendStore.shared
    private var webView: WKWebView!
    private var notebook: [String: Any]?
    /// The notebook revision the room has seen. Siri and the Lock Screen change the notebook outside the room.
    private var roomRevision = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 4/255, green: 7/255, blue: 6/255, alpha: 1)
        notebook = store.notebook
        roomRevision = store.revision
        #if DEBUG
        // Screenshot and smoke-test hooks: `-tendState <json or file>` replaces the notebook for this launch.
        if let seed = debugArgument("-tendState") {
            let data = seed.hasPrefix("{") ? Data(seed.utf8) : FileManager.default.contents(atPath: seed)
            notebook = data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
        }
        #endif
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "tend")
        let initial = notebook.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
            .flatMap { String(data: $0, encoding: .utf8) } ?? "null"
        var bootstrap = "window.TEND_NATIVE = true; window.TEND_INITIAL_STATE = \(initial); window.TEND_INITIAL_REVISION = \(roomRevision);"
        #if DEBUG
        // `-tendNow <ms since 1970>` moves the room's clock, so screenshots can show a whole week of sessions.
        if let now = debugArgument("-tendNow").flatMap(Double.init) {
            bootstrap = "(() => { const D = Date, offset = \(now) - D.now(); class TendDate extends D { constructor(...a) { super(...(a.length ? a : [D.now() + offset])); } static now() { return D.now() + offset; } } window.Date = TendDate; })(); " + bootstrap
        }
        #endif
        configuration.userContentController.addUserScript(WKUserScript(source: bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor), webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(resume), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resume), name: Self.catchUp, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(sendNotebook), name: TendStore.didChange, object: nil)
        Reminder.failed = { [weak self] in
            self?.callback("TendNativeToast", "The reminder could not be scheduled. The timer will catch up when you reopen Tend.")
        }
        if let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        } else {
            let label = UILabel(); label.text = "Tend’s bundled room is missing. Rebuild the app."; label.numberOfLines = 0
            label.textAlignment = .center; label.frame = view.bounds.insetBy(dx: 30, dy: 100); view.addSubview(label)
        }
    }

    #if DEBUG
    private func debugArgument(_ name: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
        return arguments[index + 1]
    }
    #endif

    @objc private func resume() {
        if roomRevision != store.revision { sendNotebook() }
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('tend-resume'))", completionHandler: nil)
        reportNotificationStatus()
    }

    /// Hands the room the saved notebook after a change made outside it, or when it tried to save over one.
    @objc private func sendNotebook() {
        guard let data = store.data, let json = String(data: data, encoding: .utf8) else { return }
        notebook = store.notebook
        roomRevision = store.revision
        keepAwake()
        webView?.evaluateJavaScript("window.TendNativeState && window.TendNativeState(\(json), \(roomRevision))", completionHandler: nil)
    }

    private func keepAwake() {
        let timer = notebook?["timer"] as? [String: Any], settings = notebook?["settings"] as? [String: Any]
        UIApplication.shared.isIdleTimerDisabled = (settings?["keepAwake"] as? Bool == true) && timer?["status"] as? String == "running"
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "save":
            guard let state = body["state"] as? [String: Any], state["schema"] as? String == "tend-focus-v1",
                  let data = try? JSONSerialization.data(withJSONObject: state), data.count <= 20 * 1024 * 1024 else {
                callback("TendNativeError", "The notebook could not be saved. Export a backup before closing the app.")
                return
            }
            guard store.save(fromRoom: data, seen: body["rev"] as? Int) else { sendNotebook(); return }
            notebook = state
            keepAwake()
            Task { await TendEffects.sync() }
        case "ready":
            reportNotificationStatus()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--tend-smoke") { NSLog("TEND_WEB_READY") }
            // `-tendEval <js>` runs once the room is ready, e.g. to open Quiet view for a screenshot.
            if let script = debugArgument("-tendEval") {
                webView.evaluateJavaScript(script) { result, error in NSLog("TEND_EVAL \(String(describing: result)) \(String(describing: error))") }
            }
            #endif
        case "notificationStatus": reportNotificationStatus()
        case "enableNotifications":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] _, _ in
                DispatchQueue.main.async { self?.reportNotificationStatus() }
            }
        case "openSettings":
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        case "share": share(body)
        case "feedback": UINotificationFeedbackGenerator().notificationOccurred(.success)
        default: break
        }
    }

    private func callback(_ function: String, _ object: Any) {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.\(function) && window.\(function)(\(json))", completionHandler: nil)
    }

    private func reportNotificationStatus() {
        Task { [weak self] in
            let status = await Reminder.permission()
            self?.callback("TendNativeStatus", ["notifications": status])
            await TendEffects.sync()
        }
    }

    private func share(_ body: [String: Any]) {
        guard let contents = body["contents"] as? String, contents.utf8.count <= 20 * 1024 * 1024,
              let filename = body["filename"] as? String,
              filename.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil else { return }
        do {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("TendExports", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent(filename)
            try contents.write(to: file, atomically: true, encoding: .utf8)
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = view; popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            present(sheet, animated: true)
        } catch {
            callback("TendNativeToast", "The export could not be prepared. Your notebook is still here.")
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL {
            let bundle = Bundle.main.bundleURL.appendingPathComponent("Web").standardizedFileURL.path + "/"
            decisionHandler(url.standardizedFileURL.path.hasPrefix(bundle) ? .allow : .cancel)
        } else if ["https", "mailto"].contains(url.scheme?.lowercased() ?? "") {
            if navigationAction.navigationType == .linkActivated { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        } else { decisionHandler(.cancel) }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["https", "mailto"].contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url) }
        return nil
    }
}
