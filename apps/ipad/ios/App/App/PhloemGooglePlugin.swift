import AuthenticationServices
import Capacitor
import CryptoKit
import Foundation
import Security
import StoreKit
import UIKit

/// Google Drive sign-in for the iPad app. Google refuses OAuth inside embedded web
/// views, so the shared reader's Drive sync asks this plugin for an access token
/// instead of loading Google's web sign-in. The flow is OAuth 2.0 for installed apps:
/// authorization code with PKCE in ASWebAuthenticationSession, an iOS client ID (no
/// secret), and the drive.appdata scope only. The refresh token stays in Keychain on
/// this device; access tokens are handed to the web reader and never stored.
@objc(PhloemGooglePlugin)
final class PhloemGooglePlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    let identifier = "PhloemGooglePlugin"
    let jsName = "PhloemGoogle"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    private static let scope = "https://www.googleapis.com/auth/drive.appdata"
    private static let keychainService = "com.houfu72.phloem.google"
    private static let keychainAccount = "drive-refresh-token"
    private static let installMarkerKey = "phloem.google.install-marker.v1"
    private static let mainlandChinaStorefront = "CHN"

    private var authSession: ASWebAuthenticationSession?

    override func load() {
        super.load()
        // Keychain items survive an uninstall; a fresh install starts signed out.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: Self.installMarkerKey) {
            deleteRefreshToken()
            defaults.set(true, forKey: Self.installMarkerKey)
        }
    }

    /// The iOS OAuth client ID from Info.plist (PhloemGoogleClientID). Empty means
    /// Drive is not set up for this build, and the reader keeps Drive hidden.
    private var clientID: String {
        (Bundle.main.object(forInfoDictionaryKey: "PhloemGoogleClientID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    /// Google's redirect for iOS clients is the reversed client ID as a URL scheme.
    private var redirectScheme: String {
        clientID.components(separatedBy: ".").reversed().joined(separator: ".")
    }

    private var redirectURI: String { redirectScheme + ":/oauth2redirect" }

    @objc func status(_ call: CAPPluginCall) {
        Task {
            let storefront = await Storefront.current
            let country = storefront?.countryCode.uppercased() ?? ""
            call.resolve([
                "configured": !clientID.isEmpty,
                "regionAllowed": !country.isEmpty && country != Self.mainlandChinaStorefront,
                "countryCode": country,
                "signedIn": refreshToken() != nil
            ])
        }
    }

    @objc func getToken(_ call: CAPPluginCall) {
        guard !clientID.isEmpty else {
            call.reject("Google Drive is not set up in this build of Phloem.", "GDRIVE_NOT_CONFIGURED")
            return
        }
        let interactive = call.getBool("interactive") ?? false
        let hint = call.getString("hint") ?? ""
        Task { [weak self] in
            guard let self else { return }
            if let refresh = self.refreshToken() {
                do {
                    let token = try await self.refresh(refresh)
                    call.resolve(token)
                    return
                } catch TokenError.revoked {
                    self.deleteRefreshToken()
                } catch {
                    if !interactive {
                        call.reject(error.localizedDescription, "GDRIVE_REFRESH_FAILED")
                        return
                    }
                }
            }
            guard interactive else {
                call.reject("Sign in to Google Drive in Settings.", "GDRIVE_SIGN_IN_REQUIRED")
                return
            }
            do {
                let token = try await self.signIn(hint: hint)
                call.resolve(token)
            } catch TokenError.cancelled {
                call.reject("Google sign-in was cancelled.", "GDRIVE_CANCELLED")
            } catch {
                call.reject(error.localizedDescription, "GDRIVE_SIGN_IN_FAILED")
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        let token = refreshToken()
        deleteRefreshToken()
        guard let token, var components = URLComponents(string: "https://oauth2.googleapis.com/revoke") else {
            call.resolve()
            return
        }
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        URLSession.shared.dataTask(with: request) { _, _, _ in call.resolve() }.resume()
    }

    // MARK: - OAuth

    private enum TokenError: LocalizedError {
        case cancelled
        case revoked
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Google sign-in was cancelled."
            case .revoked: return "Google Drive access was removed. Sign in again in Settings."
            case .failed(let message): return message
            }
        }
    }

    private func signIn(hint: String) async throws -> [String: Any] {
        let verifier = Self.randomURLSafe(bytes: 32)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafe(bytes: 16)
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        var items = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: Self.scope),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state)
        ]
        if !hint.isEmpty { items.append(URLQueryItem(name: "login_hint", value: hint)) }
        components.queryItems = items
        guard let authURL = components.url else { throw TokenError.failed("Google sign-in could not start.") }

        let callback = try await presentAuthSession(url: authURL)
        let returned = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { returned.first { $0.name == name }?.value }
        if let error = value("error") {
            throw error == "access_denied" ? TokenError.cancelled : TokenError.failed("Google sign-in: \(error)")
        }
        guard value("state") == state, let code = value("code") else {
            throw TokenError.failed("Google sign-in returned an unexpected answer. Try again.")
        }
        return try await exchange([
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "client_id": clientID,
            "redirect_uri": redirectURI
        ])
    }

    @MainActor
    private func presentAuthSession(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: redirectScheme) { [weak self] callback, error in
                self?.authSession = nil
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: TokenError.cancelled)
                } else {
                    continuation.resume(throwing: TokenError.failed(error?.localizedDescription ?? "Google sign-in failed."))
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            if !session.start() {
                authSession = nil
                continuation.resume(throwing: TokenError.failed("Google sign-in could not open."))
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    private func refresh(_ refreshToken: String) async throws -> [String: Any] {
        try await exchange([
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": clientID
        ])
    }

    /// Posts to Google's token endpoint, keeps any new refresh token in Keychain, and
    /// returns only what the reader needs.
    private func exchange(_ form: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        request.httpBody = form.map { key, value in
            "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value)"
        }.joined(separator: "&").data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200, let accessToken = body["access_token"] as? String else {
            let code = body["error"] as? String ?? "HTTP \(status)"
            if code == "invalid_grant" { throw TokenError.revoked }
            let detail = body["error_description"] as? String
            NSLog("PhloemGoogle: token request failed: %@ %@", code, detail ?? "")
            throw TokenError.failed("Google refused the sign-in (\(code)\(detail.map { ": " + $0 } ?? "")).")
        }
        if let newRefresh = body["refresh_token"] as? String { storeRefreshToken(newRefresh) }
        return [
            "accessToken": accessToken,
            "expiresIn": body["expires_in"] as? Int ?? 3600
        ]
    }

    // MARK: - Keychain

    private func keychainQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount
        ]
    }

    private func storeRefreshToken(_ token: String) {
        var query = keychainQuery()
        let update: [String: Any] = [
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        if SecItemUpdate(query as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            query.merge(update) { _, new in new }
            SecItemAdd(query as CFDictionary, nil)
        }
    }

    private func refreshToken() -> String? {
        var query = keychainQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteRefreshToken() {
        SecItemDelete(keychainQuery() as CFDictionary)
    }

    // MARK: - Helpers

    private static func randomURLSafe(bytes count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
