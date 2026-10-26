import UIKit
import WebKit
import UserNotifications

/// Bundled offline UI with native storage, reminders, sharing and screen-awake control.
/// No remote content is loaded into the privileged web view.
final class TendViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, UNUserNotificationCenterDelegate {
    private let notebookKey = "TendNotebookV1"
    private let reminderID = "tend.current-session"
    private let center = UNUserNotificationCenter.current()
    private var webView: WKWebView!
    private var notebook: [String: Any]?
    private var notificationAllowed = false
    private var scheduledSignature: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 245/255, green: 243/255, blue: 235/255, alpha: 1)
        if let data = UserDefaults.standard.data(forKey: notebookKey) {
            notebook = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "tend")
        let initial = notebook.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
            .flatMap { String(data: $0, encoding: .utf8) } ?? "null"
        let bootstrap = "window.TEND_NATIVE = true; window.TEND_INITIAL_STATE = \(initial);"
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
        center.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(resume), name: UIApplication.didBecomeActiveNotification, object: nil)
        if let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        } else {
            let label = UILabel(); label.text = "Tend’s bundled room is missing. Rebuild the app."; label.numberOfLines = 0
            label.textAlignment = .center; label.frame = view.bounds.insetBy(dx: 30, dy: 100); view.addSubview(label)
        }
    }

    @objc private func resume() {
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('tend-resume'))", completionHandler: nil)
        reportNotificationStatus()
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
            UserDefaults.standard.set(data, forKey: notebookKey)
            notebook = state
            let timer = state["timer"] as? [String: Any]
            let settings = state["settings"] as? [String: Any]
            UIApplication.shared.isIdleTimerDisabled = (settings?["keepAwake"] as? Bool == true) && timer?["status"] as? String == "running"
            syncReminder()
        case "ready":
            reportNotificationStatus()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--tend-smoke") { NSLog("TEND_WEB_READY") }
            #endif
        case "notificationStatus": reportNotificationStatus()
        case "enableNotifications":
            center.requestAuthorization(options: [.alert, .sound]) { [weak self] _, _ in
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
        center.getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { return }
                let status: String
                switch settings.authorizationStatus {
                case .authorized: status = "authorized"
                case .provisional, .ephemeral: status = "provisional"
                case .denied: status = "denied"
                default: status = "notDetermined"
                }
                self.notificationAllowed = status == "authorized" || status == "provisional"
                self.callback("TendNativeStatus", ["notifications": status])
                self.syncReminder()
            }
        }
    }

    private func syncReminder() {
        guard notificationAllowed, let timer = notebook?["timer"] as? [String: Any], timer["status"] as? String == "running",
              let endAt = timer["endAt"] as? Double, endAt / 1000 > Date().timeIntervalSince1970 else {
            center.removePendingNotificationRequests(withIdentifiers: [reminderID])
            scheduledSignature = nil
            return
        }
        let settings = notebook?["settings"] as? [String: Any]
        let sound = settings?["sound"] as? Bool != false
        let isBreak = timer["phase"] as? String == "break"
        let signature = "\(endAt)-\(isBreak)-\(sound)"
        guard signature != scheduledSignature else { return }
        center.removePendingNotificationRequests(withIdentifiers: [reminderID])
        let content = UNMutableNotificationContent()
        content.title = isBreak ? "A little room to begin again" : "A moment to gather"
        // Task and note text are intentionally omitted from lock-screen reminders.
        content.body = isBreak ? "Your break has finished. Return when you’re ready." : "Your focus interval has finished. Leave yourself a thread for next time."
        if sound { content.sound = .default }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, endAt / 1000 - Date().timeIntervalSince1970), repeats: false)
        let request = UNNotificationRequest(identifier: reminderID, content: content, trigger: trigger)
        scheduledSignature = signature
        center.add(request) { [weak self] error in
            guard error != nil else { return }
            DispatchQueue.main.async {
                self?.scheduledSignature = nil
                self?.callback("TendNativeToast", "The reminder could not be scheduled. The timer will catch up when you reopen Tend.")
            }
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

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Foreground completion is handled by the room's own chime and reflection.
        completionHandler([])
        DispatchQueue.main.async { [weak self] in self?.resume() }
    }
}
