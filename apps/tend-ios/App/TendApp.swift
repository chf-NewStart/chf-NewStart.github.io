import SwiftUI

@main
struct TendApp: App {
    var body: some Scene {
        WindowGroup {
            TendRoom()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}

private struct TendRoom: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> TendViewController { TendViewController() }
    func updateUIViewController(_ uiViewController: TendViewController, context: Context) {}
}
