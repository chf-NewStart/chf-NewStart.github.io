import Capacitor
import CloudKit
import CryptoKit
import Foundation

/// A narrow CloudKit bridge for Phloem's existing conflict-aware web library.
///
/// The private database is only transport: the JavaScript reader remains local-first
/// and performs the semantic merge. Large originals move through temporary files in
/// small base64 chunks so the Capacitor bridge never receives a whole textbook at once.
@objc(PhloemCloudPlugin)
final class PhloemCloudPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PhloemCloudPlugin"
    let jsName = "PhloemCloud"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchLibrary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveLibrary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchDocuments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteDocuments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteCloudData", returnType: CAPPluginReturnPromise)
    ]

    private static let containerIdentifier = "iCloud.com.houfu72.phloem"
    private static let libraryRecordType = "PhloemLibrary"
    private static let documentRecordType = "PhloemDocument"
    private static let libraryRecordName = "library-v1"
    private static let maximumDocumentBytes: Int64 = 200 * 1_024 * 1_024

    private struct UploadTransfer {
        let url: URL
        let documentID: String
        let filename: String
        let mimeType: String
        let expectedBytes: Int64
        let contentHash: String
        var receivedBytes: Int64
    }

    private struct DownloadTransfer {
        let url: URL
        let byteCount: Int64
    }

    private let transferQueue = DispatchQueue(label: "com.houfu72.phloem.cloud-transfers")
    private var uploads: [String: UploadTransfer] = [:]
    private var downloads: [String: DownloadTransfer] = [:]

    private var container: CKContainer {
        CKContainer(identifier: Self.containerIdentifier)
    }

    private var database: CKDatabase {
        container.privateCloudDatabase
    }

    deinit {
        transferQueue.sync {
            for transfer in uploads.values { try? FileManager.default.removeItem(at: transfer.url) }
            for transfer in downloads.values { try? FileManager.default.removeItem(at: transfer.url) }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        container.accountStatus { status, error in
            if let error {
                call.reject(self.explain("Phloem could not check this iPad's iCloud account.", error), "ICLOUD_STATUS_FAILED", error)
                return
            }
            let label: String
            switch status {
            case .available: label = "available"
            case .noAccount: label = "noAccount"
            case .restricted: label = "restricted"
            case .couldNotDetermine: label = "unknown"
            case .temporarilyUnavailable: label = "temporarilyUnavailable"
            @unknown default: label = "unknown"
            }
            call.resolve(["accountStatus": label, "available": status == .available])
        }
    }

    @objc func fetchLibrary(_ call: CAPPluginCall) {
        database.fetch(withRecordID: libraryRecordID()) { record, error in
            if self.isUnknownItem(error) {
                call.resolve(["found": false])
                return
            }
            if let error {
                call.reject(self.explain("Phloem could not download the iCloud library.", error), "ICLOUD_LIBRARY_FETCH_FAILED", error)
                return
            }
            guard let record else {
                call.resolve(["found": false])
                return
            }
            do {
                let payload = try self.libraryPayload(from: record)
                call.resolve([
                    "found": true,
                    "payload": payload,
                    "changeTag": record.recordChangeTag ?? "",
                    "modifiedAt": record.modificationDate?.timeIntervalSince1970 ?? 0
                ])
            } catch {
                call.reject(self.explain("The iCloud library record could not be read safely.", error), "ICLOUD_LIBRARY_INVALID", error)
            }
        }
    }

    @objc func saveLibrary(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), !payload.isEmpty else {
            call.reject("The library snapshot is empty.", "ICLOUD_LIBRARY_EMPTY")
            return
        }
        let expectedChangeTag = call.getString("changeTag") ?? ""
        database.fetch(withRecordID: libraryRecordID()) { existing, fetchError in
            if let fetchError, !self.isUnknownItem(fetchError) {
                call.reject(self.explain("Phloem could not prepare the iCloud library update.", fetchError), "ICLOUD_LIBRARY_FETCH_FAILED", fetchError)
                return
            }
            if let existing, existing.recordChangeTag != expectedChangeTag {
                call.reject("The iCloud library changed on another device. Phloem will merge it and try again.", "ICLOUD_CONFLICT")
                return
            }
            if existing == nil && !expectedChangeTag.isEmpty {
                call.reject("The iCloud library changed on another device. Phloem will merge it and try again.", "ICLOUD_CONFLICT")
                return
            }
            do {
                let assetURL = try self.temporaryFile(prefix: "library", contents: Data(payload.utf8))
                let record = existing ?? CKRecord(recordType: Self.libraryRecordType, recordID: self.libraryRecordID())
                record["payload"] = CKAsset(fileURL: assetURL)
                record["formatVersion"] = 1 as CKRecordValue
                record["updatedAt"] = Date() as CKRecordValue
                self.save(record: record, assetURL: assetURL, conflictCode: "ICLOUD_CONFLICT") { saved, error in
                    if let error {
                        call.reject(error.message, error.code, error.underlying)
                    } else {
                        call.resolve(["changeTag": saved?.recordChangeTag ?? ""])
                    }
                }
            } catch {
                call.reject(self.explain("Phloem could not stage the iCloud library update.", error), "ICLOUD_LIBRARY_STAGE_FAILED", error)
            }
        }
    }

    @objc func fetchDocuments(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self) ?? []).filter { !$0.isEmpty }
        if ids.isEmpty {
            call.resolve(["documents": []])
            return
        }
        let recordIDs = ids.map(documentRecordID)
        let operation = CKFetchRecordsOperation(recordIDs: recordIDs)
        operation.desiredKeys = ["documentID", "filename", "mimeType", "byteCount", "contentHash", "updatedAt"]
        var documents: [[String: Any]] = []
        let lock = NSLock()
        operation.perRecordResultBlock = { _, result in
            guard case .success(let record) = result else { return }
            let item: [String: Any] = [
                "id": record["documentID"] as? String ?? "",
                "filename": record["filename"] as? String ?? "",
                "mimeType": record["mimeType"] as? String ?? "application/octet-stream",
                "byteCount": record["byteCount"] as? Int64 ?? 0,
                "contentHash": record["contentHash"] as? String ?? "",
                "modifiedAt": record.modificationDate?.timeIntervalSince1970 ?? 0
            ]
            lock.lock(); documents.append(item); lock.unlock()
        }
        operation.fetchRecordsResultBlock = { result in
            if case .failure(let error) = result, !self.isPartialFailure(error) {
                call.reject(self.explain("Phloem could not check the iCloud document list.", error), "ICLOUD_DOCUMENT_STATUS_FAILED", error)
            } else {
                call.resolve(["documents": documents])
            }
        }
        database.add(operation)
    }

    @objc func beginUpload(_ call: CAPPluginCall) {
        guard let documentID = call.getString("id"), !documentID.isEmpty,
              let filename = call.getString("filename"), !filename.isEmpty,
              let mimeType = call.getString("mimeType"), !mimeType.isEmpty else {
            call.reject("The document upload metadata is incomplete.", "ICLOUD_UPLOAD_INVALID")
            return
        }
        let byteCount = call.getInt("byteCount").map(Int64.init) ?? 0
        guard byteCount > 0, byteCount <= Self.maximumDocumentBytes else {
            call.reject("iCloud sync supports original files up to 200 MB.", "ICLOUD_UPLOAD_SIZE")
            return
        }
        do {
            let url = try temporaryFile(prefix: "upload", contents: Data())
            let transferID = UUID().uuidString
            let transfer = UploadTransfer(
                url: url,
                documentID: documentID,
                filename: filename,
                mimeType: mimeType,
                expectedBytes: byteCount,
                contentHash: call.getString("contentHash") ?? "",
                receivedBytes: 0
            )
            transferQueue.sync { uploads[transferID] = transfer }
            call.resolve(["uploadID": transferID])
        } catch {
            call.reject(self.explain("Phloem could not prepare the original file for iCloud.", error), "ICLOUD_UPLOAD_STAGE_FAILED", error)
        }
    }

    @objc func appendUpload(_ call: CAPPluginCall) {
        guard let transferID = call.getString("uploadID"),
              let encoded = call.getString("data"),
              let data = Data(base64Encoded: encoded) else {
            call.reject("An iCloud upload chunk is invalid.", "ICLOUD_UPLOAD_CHUNK_INVALID")
            return
        }
        do {
            let received = try transferQueue.sync { () throws -> Int64 in
                guard var transfer = uploads[transferID] else { throw TransferError.missing }
                guard transfer.receivedBytes + Int64(data.count) <= transfer.expectedBytes else { throw TransferError.tooLarge }
                let handle = try FileHandle(forWritingTo: transfer.url)
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
                transfer.receivedBytes += Int64(data.count)
                uploads[transferID] = transfer
                return transfer.receivedBytes
            }
            call.resolve(["receivedBytes": received])
        } catch {
            call.reject(self.explain("Phloem could not stage an iCloud upload chunk.", error), "ICLOUD_UPLOAD_CHUNK_FAILED", error)
        }
    }

    @objc func finishUpload(_ call: CAPPluginCall) {
        guard let transferID = call.getString("uploadID") else {
            call.reject("The iCloud upload is missing its transfer identifier.", "ICLOUD_UPLOAD_INVALID")
            return
        }
        guard let transfer = transferQueue.sync(execute: { uploads.removeValue(forKey: transferID) }) else {
            call.reject("That iCloud upload is no longer available.", "ICLOUD_UPLOAD_MISSING")
            return
        }
        guard transfer.receivedBytes == transfer.expectedBytes else {
            try? FileManager.default.removeItem(at: transfer.url)
            call.reject("The original file was incomplete, so Phloem did not upload it.", "ICLOUD_UPLOAD_INCOMPLETE")
            return
        }
        let recordID = documentRecordID(transfer.documentID)
        database.fetch(withRecordID: recordID) { existing, fetchError in
            if let fetchError, !self.isUnknownItem(fetchError) {
                try? FileManager.default.removeItem(at: transfer.url)
                call.reject(self.explain("Phloem could not prepare the iCloud document update.", fetchError), "ICLOUD_DOCUMENT_FETCH_FAILED", fetchError)
                return
            }
            if let existing,
               existing["byteCount"] as? Int64 == transfer.expectedBytes,
               !transfer.contentHash.isEmpty,
               existing["contentHash"] as? String == transfer.contentHash {
                try? FileManager.default.removeItem(at: transfer.url)
                call.resolve(["uploaded": false, "skipped": true])
                return
            }
            let record = existing ?? CKRecord(recordType: Self.documentRecordType, recordID: recordID)
            record["documentID"] = transfer.documentID as CKRecordValue
            record["filename"] = transfer.filename as CKRecordValue
            record["mimeType"] = transfer.mimeType as CKRecordValue
            record["byteCount"] = transfer.expectedBytes as CKRecordValue
            record["contentHash"] = transfer.contentHash as CKRecordValue
            record["updatedAt"] = Date() as CKRecordValue
            record["file"] = CKAsset(fileURL: transfer.url)
            self.save(record: record, assetURL: transfer.url, conflictCode: "ICLOUD_DOCUMENT_CONFLICT") { _, error in
                if let error {
                    call.reject(error.message, error.code, error.underlying)
                } else {
                    call.resolve(["uploaded": true, "skipped": false])
                }
            }
        }
    }

    @objc func cancelUpload(_ call: CAPPluginCall) {
        guard let transferID = call.getString("uploadID") else { call.resolve(); return }
        if let transfer = transferQueue.sync(execute: { uploads.removeValue(forKey: transferID) }) {
            try? FileManager.default.removeItem(at: transfer.url)
        }
        call.resolve()
    }

    @objc func beginDownload(_ call: CAPPluginCall) {
        guard let documentID = call.getString("id"), !documentID.isEmpty else {
            call.reject("The document identifier is missing.", "ICLOUD_DOWNLOAD_INVALID")
            return
        }
        database.fetch(withRecordID: documentRecordID(documentID)) { record, error in
            if self.isUnknownItem(error) {
                call.resolve(["found": false])
                return
            }
            if let error {
                call.reject(self.explain("Phloem could not download this original from iCloud.", error), "ICLOUD_DOWNLOAD_FAILED", error)
                return
            }
            guard let record,
                  let asset = record["file"] as? CKAsset,
                  let sourceURL = asset.fileURL else {
                call.reject("The iCloud document record has no readable original file.", "ICLOUD_DOCUMENT_INVALID")
                return
            }
            do {
                let targetURL = try self.temporaryFile(prefix: "download", contents: Data())
                try FileManager.default.removeItem(at: targetURL)
                try FileManager.default.copyItem(at: sourceURL, to: targetURL)
                let values = try targetURL.resourceValues(forKeys: [.fileSizeKey])
                let byteCount = Int64(values.fileSize ?? 0)
                let transferID = UUID().uuidString
                self.transferQueue.sync { self.downloads[transferID] = DownloadTransfer(url: targetURL, byteCount: byteCount) }
                call.resolve([
                    "found": true,
                    "downloadID": transferID,
                    "byteCount": byteCount,
                    "filename": record["filename"] as? String ?? "document",
                    "mimeType": record["mimeType"] as? String ?? "application/octet-stream",
                    "contentHash": record["contentHash"] as? String ?? ""
                ])
            } catch {
                call.reject(self.explain("Phloem could not stage this iCloud download.", error), "ICLOUD_DOWNLOAD_STAGE_FAILED", error)
            }
        }
    }

    @objc func readDownload(_ call: CAPPluginCall) {
        guard let transferID = call.getString("downloadID") else {
            call.reject("The iCloud download is missing its transfer identifier.", "ICLOUD_DOWNLOAD_INVALID")
            return
        }
        let offset = Int64(call.getInt("offset") ?? 0)
        let requested = min(max(call.getInt("length") ?? 524_288, 1), 1_048_576)
        do {
            let result = try transferQueue.sync { () throws -> (Data, Int64, Bool) in
                guard let transfer = downloads[transferID] else { throw TransferError.missing }
                guard offset >= 0, offset <= transfer.byteCount else { throw TransferError.invalidOffset }
                let handle = try FileHandle(forReadingFrom: transfer.url)
                defer { try? handle.close() }
                try handle.seek(toOffset: UInt64(offset))
                let data = try handle.read(upToCount: requested) ?? Data()
                let next = offset + Int64(data.count)
                return (data, next, next >= transfer.byteCount)
            }
            call.resolve(["data": result.0.base64EncodedString(), "nextOffset": result.1, "done": result.2])
        } catch {
            call.reject(self.explain("Phloem could not read an iCloud download chunk.", error), "ICLOUD_DOWNLOAD_CHUNK_FAILED", error)
        }
    }

    @objc func endDownload(_ call: CAPPluginCall) {
        guard let transferID = call.getString("downloadID") else { call.resolve(); return }
        if let transfer = transferQueue.sync(execute: { downloads.removeValue(forKey: transferID) }) {
            try? FileManager.default.removeItem(at: transfer.url)
        }
        call.resolve()
    }

    @objc func deleteDocuments(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self) ?? []).filter { !$0.isEmpty }
        if ids.isEmpty { call.resolve(["deleted": 0]); return }
        let operation = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: ids.map(documentRecordID))
        operation.isAtomic = false
        let lock = NSLock()
        var deletedCount = 0
        operation.perRecordDeleteBlock = { _, result in
            if case .success = result { lock.lock(); deletedCount += 1; lock.unlock() }
        }
        operation.modifyRecordsResultBlock = { result in
            if case .failure(let error) = result, !self.isPartialFailureContainingOnlyUnknownItems(error) {
                call.reject(self.explain("Phloem could not finish removing deleted iCloud originals.", error), "ICLOUD_DELETE_FAILED", error)
            } else {
                call.resolve(["deleted": deletedCount])
            }
        }
        database.add(operation)
    }

    @objc func deleteCloudData(_ call: CAPPluginCall) {
        fetchAllDocumentRecordIDs { documentRecordIDs, queryError in
            if let queryError {
                call.reject(self.explain("Phloem could not inspect every private iCloud document before deleting it.", queryError), "ICLOUD_DELETE_FAILED", queryError)
                return
            }
            let recordIDs = [self.libraryRecordID()] + documentRecordIDs
            let operation = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: recordIDs)
            operation.isAtomic = false
            let lock = NSLock()
            var deletedCount = 0
            operation.perRecordDeleteBlock = { _, result in
                if case .success = result { lock.lock(); deletedCount += 1; lock.unlock() }
            }
            operation.modifyRecordsResultBlock = { result in
                if case .failure(let deleteError) = result, !self.isPartialFailureContainingOnlyUnknownItems(deleteError) {
                    call.reject(self.explain("Phloem could not finish deleting the private iCloud copy.", deleteError), "ICLOUD_DELETE_FAILED", deleteError)
                } else {
                    call.resolve(["deleted": deletedCount])
                }
            }
            self.database.add(operation)
        }
    }

    /// Querying the record type makes deletion complete even when an upload was
    /// interrupted after its asset saved but before the library snapshot followed.
    private func fetchAllDocumentRecordIDs(
        cursor: CKQueryOperation.Cursor? = nil,
        accumulated: [CKRecord.ID] = [],
        completion: @escaping ([CKRecord.ID], Error?) -> Void
    ) {
        let operation: CKQueryOperation
        if let cursor {
            operation = CKQueryOperation(cursor: cursor)
        } else {
            operation = CKQueryOperation(query: CKQuery(
                recordType: Self.documentRecordType,
                predicate: NSPredicate(value: true)
            ))
        }
        operation.desiredKeys = []
        var recordIDs = accumulated
        let lock = NSLock()
        operation.recordMatchedBlock = { recordID, result in
            guard case .success = result else { return }
            lock.lock(); recordIDs.append(recordID); lock.unlock()
        }
        operation.queryResultBlock = { result in
            switch result {
            case .success(let nextCursor):
                lock.lock(); let found = recordIDs; lock.unlock()
                if let nextCursor {
                    self.fetchAllDocumentRecordIDs(cursor: nextCursor, accumulated: found, completion: completion)
                } else {
                    completion(found, nil)
                }
            case .failure(let error):
                if self.isUnknownItem(error) {
                    completion(accumulated, nil)
                } else {
                    completion([], error)
                }
            }
        }
        database.add(operation)
    }

    private struct SaveFailure {
        let message: String
        let code: String
        let underlying: Error?
    }

    private func save(record: CKRecord,
                      assetURL: URL,
                      conflictCode: String,
                      completion: @escaping (CKRecord?, SaveFailure?) -> Void) {
        let operation = CKModifyRecordsOperation(recordsToSave: [record], recordIDsToDelete: nil)
        operation.savePolicy = .ifServerRecordUnchanged
        operation.isAtomic = true
        let lock = NSLock()
        var savedRecord: CKRecord?
        var recordError: Error?
        operation.perRecordSaveBlock = { _, result in
            lock.lock(); defer { lock.unlock() }
            switch result {
            case .success(let record): savedRecord = record
            case .failure(let error): recordError = error
            }
        }
        operation.modifyRecordsResultBlock = { result in
            defer { try? FileManager.default.removeItem(at: assetURL) }
            lock.lock()
            let saved = savedRecord
            var error = recordError
            lock.unlock()
            if error == nil, case .failure(let operationError) = result { error = operationError }
            if self.isServerRecordChanged(error) {
                completion(nil, SaveFailure(
                    message: "iCloud changed on another device. Phloem will merge it and try again.",
                    code: conflictCode,
                    underlying: error
                ))
                return
            }
            if let error {
                completion(nil, SaveFailure(message: self.explain("iCloud could not save this update.", error), code: "ICLOUD_SAVE_FAILED", underlying: error))
                return
            }
            completion(saved, nil)
        }
        database.add(operation)
    }

    private func libraryRecordID() -> CKRecord.ID {
        CKRecord.ID(recordName: Self.libraryRecordName)
    }

    private func documentRecordID(_ documentID: String) -> CKRecord.ID {
        let digest = SHA256.hash(data: Data(documentID.utf8))
        let hex = digest.map { String(format: "%02x", $0) }.joined()
        return CKRecord.ID(recordName: "document-\(hex)")
    }

    private func libraryPayload(from record: CKRecord) throws -> String {
        guard let asset = record["payload"] as? CKAsset,
              let url = asset.fileURL else { throw TransferError.missingAsset }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func temporaryFile(prefix: String, contents: Data) throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("PhloemCloud", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent("\(prefix)-\(UUID().uuidString)")
        try contents.write(to: url, options: .atomic)
        return url
    }

    /// Appends the CloudKit reason, so Settings shows why sync failed instead of a
    /// generic sentence. The code number lets support match it to CKError.Code.
    private func explain(_ message: String, _ error: Error?) -> String {
        guard let error else { return message }
        guard var cloudError = error as? CKError else {
            return "\(message) \(error.localizedDescription)"
        }
        if cloudError.code == .partialFailure,
           let first = cloudError.partialErrorsByItemID?.values.compactMap({ $0 as? CKError }).first {
            cloudError = first
        }
        let hint: String
        switch cloudError.code {
        case .notAuthenticated:
            hint = "Sign in to iCloud in iPad Settings and make sure iCloud Drive is on."
        case .networkUnavailable, .networkFailure:
            hint = "This iPad is offline. Your local library is safe; try again when you are online."
        case .quotaExceeded:
            hint = "Your iCloud storage is full."
        case .serviceUnavailable, .requestRateLimited, .zoneBusy:
            hint = "iCloud is busy right now. Try again in a few minutes."
        case .badContainer, .missingEntitlement:
            hint = "This build of Phloem is not signed for its iCloud container."
        case .permissionFailure, .serverRejectedRequest, .invalidArguments:
            hint = "iCloud refused the request. Phloem's iCloud storage may not be set up on Apple's servers yet."
        default:
            hint = ""
        }
        // NSError's description carries the server's sub-code and message, such as
        // "Server Rejected Request" (15/2000); server message = "...", which
        // localizedDescription drops.
        let detail = "(CloudKit \(cloudError.code.rawValue): \(String((cloudError as NSError).description.prefix(500))))"
        NSLog("PhloemCloud: %@", (cloudError as NSError).description)
        return [message, hint, detail].filter { !$0.isEmpty }.joined(separator: " ")
    }

    private func isUnknownItem(_ error: Error?) -> Bool {
        (error as? CKError)?.code == .unknownItem
    }

    private func isPartialFailure(_ error: Error) -> Bool {
        (error as? CKError)?.code == .partialFailure
    }

    private func isPartialFailureContainingOnlyUnknownItems(_ error: Error) -> Bool {
        guard let cloudError = error as? CKError, cloudError.code == .partialFailure,
              let failures = cloudError.partialErrorsByItemID, !failures.isEmpty else { return false }
        return failures.values.allSatisfy { ($0 as? CKError)?.code == .unknownItem }
    }

    private func isServerRecordChanged(_ error: Error?) -> Bool {
        guard let cloudError = error as? CKError else { return false }
        if cloudError.code == .serverRecordChanged { return true }
        guard cloudError.code == .partialFailure, let failures = cloudError.partialErrorsByItemID else { return false }
        return failures.values.contains { ($0 as? CKError)?.code == .serverRecordChanged }
    }

    private enum TransferError: LocalizedError {
        case missing
        case tooLarge
        case invalidOffset
        case missingAsset

        var errorDescription: String? {
            switch self {
            case .missing: return "The transfer is no longer available."
            case .tooLarge: return "The transfer exceeded its expected size."
            case .invalidOffset: return "The transfer offset is invalid."
            case .missingAsset: return "The CloudKit record has no readable asset."
            }
        }
    }
}
