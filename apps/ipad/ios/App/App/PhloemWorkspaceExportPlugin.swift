import Capacitor
import UIKit
import WebKit

/// Exports the existing Workspace, including notes and ink, through the native
/// PDF renderer. The app's library and Workspace state are never rewritten.
@objc(PhloemWorkspaceExportPlugin)
final class PhloemWorkspaceExportPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PhloemWorkspaceExportPlugin"
    let jsName = "PhloemWorkspaceExport"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportPDF", returnType: CAPPluginReturnPromise)
    ]
    private var exporting = false

    @objc func exportPDF(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self, let webView = self.bridge?.webView,
                  let presenter = self.bridge?.viewController else {
                call.reject("The Workspace is not ready to export.")
                return
            }
            guard !self.exporting else {
                call.reject("A Workspace export is already open.")
                return
            }
            self.exporting = true
            do {
                let title = call.getString("title") ?? "Phloem Workspace"
                let url = try await PhloemWorkspacePDF.export(from: webView, title: title, world: .page)
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                if let popover = share.popoverPresentationController {
                    popover.sourceView = webView
                    popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
                    popover.permittedArrowDirections = []
                }
                share.completionWithItemsHandler = { [weak self] _, completed, _, error in
                    self?.exporting = false
                    try? FileManager.default.removeItem(at: url)
                    if let error { call.reject(error.localizedDescription) }
                    else { call.resolve(["shared": completed]) }
                }
                presenter.present(share, animated: true)
            } catch {
                self.exporting = false
                call.reject(error.localizedDescription)
            }
        }
    }
}
