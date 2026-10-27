import ManagedSettings
import ManagedSettingsUI
import UIKit

/// What a blocked app shows during a focus session: Tend's pixel tomato on the room's dark paper.
final class TendShield: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration { shield }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { shield }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { shield }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { shield }

    private var shield: ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor(red: 4 / 255, green: 7 / 255, blue: 6 / 255, alpha: 1),
            icon: UIImage(named: "ShieldTomato"),
            title: ShieldConfiguration.Label(text: "Tend is on", color: UIColor(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xDC / 255, alpha: 1)),
            subtitle: ShieldConfiguration.Label(text: "Stay with your question. This opens again when the session ends, or when you tap Done.",
                                                color: UIColor(red: 0x8F / 255, green: 0x9A / 255, blue: 0x92 / 255, alpha: 1)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Back to it", color: UIColor(red: 0x1D / 255, green: 0x07 / 255, blue: 0x03 / 255, alpha: 1)),
            primaryButtonBackgroundColor: UIColor(red: 1, green: 0x5A / 255, blue: 0x43 / 255, alpha: 1)
        )
    }
}
