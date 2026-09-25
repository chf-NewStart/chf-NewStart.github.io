import Capacitor
import Foundation
import Security
import UIKit

@objc(PhloemAIPlugin)
final class PhloemAIPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PhloemAIPlugin"
    let jsName = "PhloemAI"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeCredential", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    private static let keychainService = "com.houfu72.phloem.ai"
    private static let consentVersion = 1
    private static let supportedProviders = Set(["gemini", "deepseek", "openai", "anthropic"])

    private struct ConfigureInput: Decodable {
        let provider: String
        let consentVersion: Int
        let consentGranted: Bool
    }

    private struct Message: Codable {
        let role: String
        let content: String
    }

    private struct RequestInput: Decodable {
        let provider: String
        let model: String
        let messages: [Message]
        let maxTokens: Int
        let consentVersion: Int
    }

    private struct ConsentReceipt: Codable {
        let provider: String
        let destination: String
        let version: Int
        let grantedAt: String
    }

    private enum PluginError: LocalizedError {
        case invalidProvider
        case invalidModel
        case invalidMessages
        case missingCredential
        case missingConsent
        case invalidResponse
        case provider(String)

        var errorDescription: String? {
            switch self {
            case .invalidProvider: return "Choose a supported AI provider."
            case .invalidModel: return "Choose a valid model name."
            case .invalidMessages: return "The AI request is empty or too large."
            case .missingCredential: return "Add an API key for this provider in Phloem settings."
            case .missingConsent: return "Review and accept the AI data-sharing disclosure in Phloem settings."
            case .invalidResponse: return "The AI provider returned an unreadable response."
            case .provider(let message): return message
            }
        }
    }

    private final class ApprovedRedirectDelegate: NSObject, URLSessionTaskDelegate {
        private let expectedHost: String

        init(expectedHost: String) {
            self.expectedHost = expectedHost
        }

        func urlSession(_ session: URLSession,
                        task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest,
                        completionHandler: @escaping (URLRequest?) -> Void) {
            guard request.url?.scheme == "https", request.url?.host == expectedHost else {
                completionHandler(nil)
                return
            }
            completionHandler(request)
        }
    }

    @objc func configure(_ call: CAPPluginCall) {
        do {
            let input = try call.decode(ConfigureInput.self)
            let provider = try validatedProvider(input.provider)
            guard input.consentVersion == Self.consentVersion, input.consentGranted else {
                throw PluginError.missingConsent
            }
            if try credential(provider: provider) == nil {
                presentCredentialPrompt(call, provider: provider)
                return
            }
            try storeConsent(for: provider)
            call.resolve(["hasCredential": true, "provider": provider])
        } catch {
            call.reject(error.localizedDescription, "AI_CONFIGURATION_FAILED", error)
        }
    }

    @objc func removeCredential(_ call: CAPPluginCall) {
        do {
            let provider = try validatedProvider(call.getString("provider") ?? "")
            try deleteCredential(provider: provider)
            UserDefaults.standard.removeObject(forKey: consentKey(provider))
            call.resolve(["hasCredential": false, "provider": provider])
        } catch {
            call.reject(error.localizedDescription, "AI_CREDENTIAL_REMOVAL_FAILED", error)
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        do {
            var providers: [String] = []
            for provider in Self.supportedProviders.sorted() where try credential(provider: provider) != nil {
                providers.append(provider)
            }
            call.resolve(["providers": providers])
        } catch {
            call.reject(error.localizedDescription, "AI_STATUS_FAILED", error)
        }
    }

    @objc func request(_ call: CAPPluginCall) {
        do {
            let input = try call.decode(RequestInput.self)
            let provider = try validatedProvider(input.provider)
            guard input.consentVersion == Self.consentVersion, validConsent(for: provider) else {
                throw PluginError.missingConsent
            }
            guard !input.model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  input.model.count <= 160 else { throw PluginError.invalidModel }
            let messages = try validatedMessages(input.messages)
            guard let key = try credential(provider: provider), !key.isEmpty else {
                throw PluginError.missingCredential
            }
            let request = try providerRequest(
                provider: provider,
                key: key,
                model: input.model,
                messages: messages,
                maxTokens: min(8_192, max(64, input.maxTokens))
            )
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 75
            configuration.timeoutIntervalForResource = 90
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            let redirectDelegate = ApprovedRedirectDelegate(expectedHost: providerDestination(provider))
            let session = URLSession(configuration: configuration, delegate: redirectDelegate, delegateQueue: nil)
            session.dataTask(with: request) { [weak self] data, response, error in
                defer { session.finishTasksAndInvalidate() }
                if let error {
                    call.reject("The AI provider could not be reached.", "AI_NETWORK_FAILED", error)
                    return
                }
                guard let http = response as? HTTPURLResponse, let data else {
                    call.reject(PluginError.invalidResponse.localizedDescription, "AI_INVALID_RESPONSE")
                    return
                }
                guard (200...299).contains(http.statusCode) else {
                    let detail = self?.providerErrorMessage(data) ?? ""
                    let message = detail.isEmpty
                        ? "The AI provider returned HTTP \(http.statusCode)."
                        : "The AI provider returned HTTP \(http.statusCode): \(detail)"
                    call.reject(message, "AI_PROVIDER_FAILED")
                    return
                }
                do {
                    let text = try self?.responseText(provider: provider, data: data) ?? ""
                    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                        throw PluginError.invalidResponse
                    }
                    call.resolve(["text": text.trimmingCharacters(in: .whitespacesAndNewlines),
                                  "provider": self?.providerLabel(provider) ?? "AI"])
                } catch {
                    call.reject(error.localizedDescription, "AI_INVALID_RESPONSE", error)
                }
            }.resume()
        } catch {
            call.reject(error.localizedDescription, "AI_REQUEST_REJECTED", error)
        }
    }

    private func validatedProvider(_ value: String) throws -> String {
        let provider = value.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.supportedProviders.contains(provider) else { throw PluginError.invalidProvider }
        return provider
    }

    private func presentCredentialPrompt(_ call: CAPPluginCall, provider: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let viewController = self.bridge?.viewController else {
                call.reject("Phloem could not show the secure API key prompt.", "AI_PROMPT_FAILED")
                return
            }
            let alert = UIAlertController(
                title: "Add (self.providerLabel(provider)) API key",
                message: "The key goes straight into iOS Keychain. Phloem’s web interface cannot read it back.",
                preferredStyle: .alert
            )
            alert.addTextField { field in
                field.placeholder = "API key"
                field.isSecureTextEntry = true
                field.autocapitalizationType = .none
                field.autocorrectionType = .no
                field.spellCheckingType = .no
                field.smartDashesType = .no
                field.smartQuotesType = .no
            }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
                call.reject("API key entry was cancelled.", "AI_CONFIGURATION_CANCELLED")
            })
            let save = UIAlertAction(title: "Save in Keychain", style: .default) { [weak self, weak alert] _ in
                guard let self else {
                    call.reject("Phloem could not save the API key.", "AI_CONFIGURATION_FAILED")
                    return
                }
                let key = alert?.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !key.isEmpty else {
                    call.reject("Enter an API key to enable this provider.", "AI_CREDENTIAL_REQUIRED")
                    return
                }
                do {
                    try self.storeCredential(key, provider: provider)
                    try self.storeConsent(for: provider)
                    call.resolve(["hasCredential": true, "provider": provider])
                } catch {
                    call.reject(error.localizedDescription, "AI_CONFIGURATION_FAILED", error)
                }
            }
            alert.addAction(save)
            alert.preferredAction = save
            viewController.present(alert, animated: true)
        }
    }

    private func validatedMessages(_ messages: [Message]) throws -> [Message] {
        guard !messages.isEmpty, messages.count <= 200 else { throw PluginError.invalidMessages }
        var total = 0
        let result = try messages.map { message -> Message in
            let role = message.role.lowercased()
            guard ["system", "user", "assistant"].contains(role) else { throw PluginError.invalidMessages }
            let content = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
            total += content.count
            guard !content.isEmpty, total <= 300_000 else { throw PluginError.invalidMessages }
            return Message(role: role, content: content)
        }
        return result
    }

    private func providerLabel(_ provider: String) -> String {
        switch provider {
        case "gemini": return "Gemini API"
        case "deepseek": return "DeepSeek"
        case "openai": return "OpenAI"
        case "anthropic": return "Anthropic"
        default: return "AI"
        }
    }

    private func providerDestination(_ provider: String) -> String {
        switch provider {
        case "gemini": return "generativelanguage.googleapis.com"
        case "deepseek": return "api.deepseek.com"
        case "openai": return "api.openai.com"
        case "anthropic": return "api.anthropic.com"
        default: return ""
        }
    }

    private func providerRequest(provider: String, key: String, model: String, messages: [Message], maxTokens: Int) throws -> URLRequest {
        let system = messages.first(where: { $0.role == "system" })?.content ?? "You are a helpful reading assistant."
        let turns = messages.filter { $0.role != "system" }
        let url: URL
        var headers = ["Content-Type": "application/json"]
        let body: Any

        switch provider {
        case "gemini":
            let modelCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._"))
            guard let encodedModel = model.addingPercentEncoding(withAllowedCharacters: modelCharacters),
                  let endpoint = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(encodedModel):generateContent") else {
                throw PluginError.invalidModel
            }
            url = endpoint
            headers["x-goog-api-key"] = key
            body = [
                "system_instruction": ["parts": [["text": system]]],
                "contents": turns.map { ["role": $0.role == "assistant" ? "model" : "user", "parts": [["text": $0.content]]] },
                "generationConfig": ["maxOutputTokens": maxTokens]
            ]
        case "deepseek":
            url = URL(string: "https://api.deepseek.com/chat/completions")!
            headers["Authorization"] = "Bearer \(key)"
            var payload: [String: Any] = [
                "model": model,
                "max_tokens": maxTokens,
                "thinking": ["type": "disabled"],
                "messages": messages.map { ["role": $0.role, "content": $0.content] }
            ]
            if system.lowercased().contains("return only json") {
                payload["response_format"] = ["type": "json_object"]
            }
            body = payload
        case "openai":
            url = URL(string: "https://api.openai.com/v1/responses")!
            headers["Authorization"] = "Bearer \(key)"
            body = [
                "model": model,
                "max_output_tokens": maxTokens,
                "instructions": system,
                "input": turns.map { ["role": $0.role, "content": $0.content] }
            ]
        case "anthropic":
            url = URL(string: "https://api.anthropic.com/v1/messages")!
            headers["x-api-key"] = key
            headers["anthropic-version"] = "2023-06-01"
            body = [
                "model": model,
                "max_tokens": maxTokens,
                "system": system,
                "messages": turns.map { ["role": $0.role, "content": $0.content] }
            ]
        default:
            throw PluginError.invalidProvider
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    private func responseText(provider: String, data: Data) throws -> String {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw PluginError.invalidResponse
        }
        if provider == "gemini" {
            let candidates = json["candidates"] as? [[String: Any]]
            let content = candidates?.first?["content"] as? [String: Any]
            let parts = content?["parts"] as? [[String: Any]]
            return parts?.compactMap { $0["text"] as? String }.joined() ?? ""
        }
        if provider == "openai" {
            if let text = json["output_text"] as? String, !text.isEmpty { return text }
            let output = json["output"] as? [[String: Any]] ?? []
            return output.flatMap { $0["content"] as? [[String: Any]] ?? [] }
                .filter { ($0["type"] as? String) == "output_text" }
                .compactMap { $0["text"] as? String }.joined()
        }
        if provider == "anthropic" {
            let content = json["content"] as? [[String: Any]] ?? []
            return content.filter { ($0["type"] as? String) == "text" }
                .compactMap { $0["text"] as? String }.joined()
        }
        let choices = json["choices"] as? [[String: Any]]
        let message = choices?.first?["message"] as? [String: Any]
        return message?["content"] as? String ?? ""
    }

    private func providerErrorMessage(_ data: Data) -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "" }
        let error = json["error"] as? [String: Any]
        let text = (error?["message"] as? String) ?? (json["message"] as? String) ?? ""
        return String(text.prefix(240))
    }

    private func consentKey(_ provider: String) -> String {
        "phloem.ai.consent.\(provider).v1"
    }

    private func storeConsent(for provider: String) throws {
        let receipt = ConsentReceipt(provider: provider,
                                     destination: providerDestination(provider),
                                     version: Self.consentVersion,
                                     grantedAt: ISO8601DateFormatter().string(from: Date()))
        UserDefaults.standard.set(try JSONEncoder().encode(receipt), forKey: consentKey(provider))
    }

    private func validConsent(for provider: String) -> Bool {
        guard let data = UserDefaults.standard.data(forKey: consentKey(provider)),
              let receipt = try? JSONDecoder().decode(ConsentReceipt.self, from: data) else { return false }
        return receipt.provider == provider
            && receipt.destination == providerDestination(provider)
            && receipt.version == Self.consentVersion
    }

    private func keychainQuery(provider: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: provider
        ]
    }

    private func storeCredential(_ credential: String, provider: String) throws {
        let data = Data(credential.utf8)
        var query = keychainQuery(provider: provider)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            query.merge(update) { _, new in new }
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw PluginError.provider("The API key could not be saved securely.") }
        } else if status != errSecSuccess {
            throw PluginError.provider("The API key could not be saved securely.")
        }
    }

    private func credential(provider: String) throws -> String? {
        var query = keychainQuery(provider: provider)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw PluginError.provider("The saved API key could not be read from Keychain.")
        }
        return String(data: data, encoding: .utf8)
    }

    private func deleteCredential(provider: String) throws {
        let status = SecItemDelete(keychainQuery(provider: provider) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw PluginError.provider("The API key could not be removed from Keychain.")
        }
    }
}
