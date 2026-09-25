import Capacitor

/// Registers app-owned native capabilities before the bundled reader loads.
final class PhloemBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PhloemAIPlugin())
    }
}
