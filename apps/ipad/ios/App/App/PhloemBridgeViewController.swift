import Capacitor
import UIKit
import WebKit

/// The device Phloem runs on, for wording only ("this iPhone"); the shared reader picks
/// its layout from the window, never from this name.
enum PhloemDevice {
    /// Read first on the main thread, by `capacitorDidLoad`.
    static let name: String = {
        if ProcessInfo.processInfo.isiOSAppOnMac { return "Mac" }
        return UIDevice.current.userInterfaceIdiom == .phone ? "iPhone" : "iPad"
    }()

    static var settingsApp: String { name == "Mac" ? "System Settings" : "\(name) Settings" }
}

/// Registers app-owned native capabilities before the bundled reader loads.
final class PhloemBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.userContentController.addUserScript(WKUserScript(
            source: "window.PHLOEM_DEVICE = \"\(PhloemDevice.name)\";",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        bridge?.registerPluginInstance(PhloemAIPlugin())
        bridge?.registerPluginInstance(PhloemCloudPlugin())
        bridge?.registerPluginInstance(PhloemGooglePlugin())
        bridge?.registerPluginInstance(PhloemSpeechPlugin())
    }
}
