import SwiftUI
import UserNotifications

@main
struct TendApp: App {
    @UIApplicationDelegateAdaptor(TendAppDelegate.self) private var appDelegate

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

/// Ready at launch, before any room is on screen: a note typed into the Lock Screen notification starts Tend in the
/// background with no scene at all.
final class TendAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Reminder.registerCategory()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        // With the room on screen it chimes and opens its own reflection. Behind the Lock Screen the app can still
        // count as in front, so the notice shows as usual there.
        await MainActor.run {
            guard UIApplication.shared.applicationState == .active else { return [.banner, .list, .sound] }
            NotificationCenter.default.post(name: TendViewController.catchUp, object: nil)
            return []
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard response.actionIdentifier == Reminder.noteAction, let answer = response as? UNTextInputNotificationResponse else { return }
        let session = response.notification.request.content.userInfo["session"] as? String
        _ = try? await TendSession.saveNote(answer.userText, session: session)
    }
}
