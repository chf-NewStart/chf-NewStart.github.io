import Foundation
import UIKit
import WebKit
import PDFKit

/// Captures the arranged board as vector PDF tiles, retaining WebKit's text and
/// embedded fonts. Each capture stays within the web view's visible bounds.
@MainActor
enum PhloemWorkspacePDF {
    static let pageSize = CGSize(width: 842, height: 595)
    private static let contentRect = CGRect(x: 28, y: 58, width: 786, height: 509)
    private static let sourceTileWidth: CGFloat = 600
    private static let maximumPages = 200

    enum ExportError: LocalizedError {
        case unavailable, invalidGeometry, tooLarge, invalidPDF

        var errorDescription: String? {
            switch self {
            case .unavailable: return "Open the whiteboard before exporting it."
            case .invalidGeometry: return "The whiteboard could not be prepared for PDF export. Your notes were kept."
            case .tooLarge: return "This whiteboard needs more than 200 PDF pages. Move its content closer together and try again."
            case .invalidPDF: return "The PDF could not be created. Your whiteboard was kept."
            }
        }
    }

    private struct Tile {
        let rect: CGRect
    }

    static func export(from webView: WKWebView, title: String,
                       world suppliedWorld: WKContentWorld? = nil) async throws -> URL {
        let world = suppliedWorld ?? WKContentWorld.world(name: "NotebookWhiteboard")
        guard webView.bounds.width > 1, webView.bounds.height > 1 else { throw ExportError.unavailable }
        do {
            guard let geometry = try await javaScript("return await window.prepareNotebookWhiteboardExport();", in: webView, world: world) as? [String: Any] else {
                throw ExportError.invalidGeometry
            }
            let tiles = try makeTiles(geometry)
            var captured: [PDFDocument] = []
            for tile in tiles {
                try Task.checkCancellation()
                let captureScale = min(1, webView.bounds.width / tile.rect.width, webView.bounds.height / tile.rect.height)
                guard captureScale.isFinite, captureScale > 0 else { throw ExportError.invalidGeometry }
                _ = try await javaScript("return await window.setNotebookWhiteboardExportTile(tile);", arguments: [
                    "tile": ["x": tile.rect.minX, "y": tile.rect.minY,
                             "width": tile.rect.width, "height": tile.rect.height, "scale": captureScale]
                ], in: webView, world: world)
                let configuration = WKPDFConfiguration()
                configuration.rect = CGRect(origin: .zero, size: CGSize(width: tile.rect.width * captureScale,
                                                                         height: tile.rect.height * captureScale))
                let data = try await capture(webView, configuration: configuration)
                guard let document = PDFDocument(data: data), document.pageCount > 0 else { throw ExportError.invalidPDF }
                captured.append(document)
            }
            _ = try await javaScript("window.finishNotebookWhiteboardExport(); return true;", in: webView, world: world)
            let data = try assemble(captured, tiles: tiles, title: title)
            let exportID = UUID().uuidString
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("Phloem-Exports", isDirectory: true)
                .appendingPathComponent(exportID, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let timestamp = DateFormatter()
            timestamp.locale = Locale(identifier: "en_US_POSIX")
            timestamp.timeZone = .current
            timestamp.dateFormat = "yyyy-MM-dd-HHmmss"
            let filename = safeFilename(title) + "-whiteboard-" + timestamp.string(from: Date()) + "-" + exportID.prefix(8).lowercased() + ".pdf"
            let url = directory.appendingPathComponent(filename)
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            _ = try? await javaScript("window.finishNotebookWhiteboardExport(); return true;", in: webView, world: world)
            throw error
        }
    }

    /// The planner is exposed internally so grouping can be tested without a web view.
    static func plannedPageRects(for geometry: [String: Any]) throws -> [CGRect] {
        try makeTiles(geometry).map(\.rect)
    }

    private static func makeTiles(_ geometry: [String: Any]) throws -> [Tile] {
        guard let width = number(geometry["width"]), let height = number(geometry["height"]),
              width > 0, height > 0, width <= 1_000_000, height <= 1_000_000 else { throw ExportError.invalidGeometry }
        let tileHeight = sourceTileWidth * contentRect.height / contentRect.width
        let standard = CGRect(x: 0, y: 0, width: sourceTileWidth, height: tileHeight)
        if geometry["empty"] as? Bool == true { return [Tile(rect: standard)] }
        let board = CGRect(x: 0, y: 0, width: width, height: height)
        let padding: CGFloat = 24
        let maximumObjectWidth = sourceTileWidth * 1.5 - padding * 2
        let maximumObjectHeight = tileHeight * 1.5 - padding * 2
        let raw = geometry["occupiedRects"] as? [[String: Any]] ?? [["x": 0, "y": 0, "width": width, "height": height]]
        var objects: [CGRect] = []
        for value in raw {
            guard let x = number(value["x"]), let y = number(value["y"]),
                  let w = number(value["width"]), let h = number(value["height"]), w >= 0, h >= 0 else {
                throw ExportError.invalidGeometry
            }
            let rect = CGRect(x: x, y: y, width: max(1, w), height: max(1, h)).intersection(board)
            if !rect.isNull, !rect.isEmpty { objects.append(rect) }
        }
        objects.sort { $0.minY == $1.minY ? $0.minX < $1.minX : $0.minY < $1.minY }

        // Keep a whole note or handwriting stroke on one page whenever possible.
        // Nearby objects retain their relative positions instead of being sliced
        // by an arbitrary infinite-paper grid.
        var groups: [CGRect] = []
        var oversized: [CGRect] = []
        for rect in objects {
            guard rect.width <= maximumObjectWidth, rect.height <= maximumObjectHeight else {
                oversized.append(rect)
                continue
            }
            var best: Int?
            var bestCost = CGFloat.greatestFiniteMagnitude
            for (index, group) in groups.enumerated() {
                let union = group.union(rect)
                guard union.width <= maximumObjectWidth, union.height <= maximumObjectHeight else { continue }
                let cost = union.width * union.height - group.width * group.height
                if cost < bestCost { best = index; bestCost = cost }
            }
            if let best { groups[best] = groups[best].union(rect) }
            else { groups.append(rect) }
            guard groups.count <= maximumPages else { throw ExportError.tooLarge }
        }
        var tiles = groups.map { bounds -> Tile in
            let pageWidth = max(sourceTileWidth, bounds.width + padding * 2)
            let pageHeight = max(tileHeight, bounds.height + padding * 2)
            return Tile(rect: CGRect(x: max(0, bounds.midX - pageWidth / 2),
                                     y: max(0, bounds.midY - pageHeight / 2),
                                     width: pageWidth, height: pageHeight))
        }

        // Truly oversized drawings still need canvas tiles. Only occupied areas
        // generate pages; unmarked infinite paper is never exported by itself.
        var gridPositions = Set<String>()
        for rect in oversized {
            let firstColumn = max(0, Int(floor(rect.minX / sourceTileWidth)))
            let lastColumn = max(firstColumn, Int(floor(max(rect.minX, rect.maxX - 0.01) / sourceTileWidth)))
            let firstRow = max(0, Int(floor(rect.minY / tileHeight)))
            let lastRow = max(firstRow, Int(floor(max(rect.minY, rect.maxY - 0.01) / tileHeight)))
            guard (lastColumn - firstColumn + 1) * (lastRow - firstRow + 1) <= maximumPages else { throw ExportError.tooLarge }
            for row in firstRow...lastRow {
                for column in firstColumn...lastColumn where gridPositions.insert("\(row):\(column)").inserted {
                    tiles.append(Tile(rect: CGRect(x: CGFloat(column) * sourceTileWidth,
                                                   y: CGFloat(row) * tileHeight,
                                                   width: sourceTileWidth, height: tileHeight)))
                    guard tiles.count <= maximumPages else { throw ExportError.tooLarge }
                }
            }
        }
        if tiles.isEmpty { tiles = [Tile(rect: standard)] }
        return tiles.sorted { $0.rect.minY == $1.rect.minY ? $0.rect.minX < $1.rect.minX : $0.rect.minY < $1.rect.minY }
    }

    private static func assemble(_ documents: [PDFDocument], tiles: [Tile], title: String) throws -> Data {
        guard documents.count == tiles.count else { throw ExportError.invalidPDF }
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: title + " - Whiteboard",
                               kCGPDFContextCreator as String: "Phloem"]
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: pageSize), format: format)
        return renderer.pdfData { context in
            for (index, document) in documents.enumerated() {
                guard let page = document.page(at: 0) else { continue }
                context.beginPage()
                UIColor.white.setFill()
                context.fill(CGRect(origin: .zero, size: pageSize))
                let heading = title.trimmingCharacters(in: .whitespacesAndNewlines)
                let paragraph = NSMutableParagraphStyle()
                paragraph.lineBreakMode = .byTruncatingTail
                ((heading.isEmpty ? "Whiteboard" : heading) as NSString).draw(in: CGRect(x: 28, y: 22, width: 650, height: 22),
                    withAttributes: [.font: UIFont.systemFont(ofSize: 13, weight: .semibold),
                                     .foregroundColor: UIColor(red: 0.09, green: 0.21, blue: 0.17, alpha: 1),
                                     .paragraphStyle: paragraph])
                let bounds = page.bounds(for: .mediaBox)
                let fit = min(contentRect.width / bounds.width, contentRect.height / bounds.height)
                let drawing = CGRect(x: contentRect.midX - bounds.width * fit / 2,
                                     y: contentRect.midY - bounds.height * fit / 2,
                                     width: bounds.width * fit, height: bounds.height * fit)
                let cg = context.cgContext
                cg.saveGState()
                cg.clip(to: contentRect)
                cg.translateBy(x: drawing.minX, y: drawing.maxY)
                cg.scaleBy(x: fit, y: -fit)
                cg.translateBy(x: -bounds.minX, y: -bounds.minY)
                page.draw(with: .mediaBox, to: cg)
                cg.restoreGState()
                let footer = "Page \(index + 1) of \(documents.count)"
                (footer as NSString).draw(in: CGRect(x: 28, y: 576, width: 786, height: 13),
                    withAttributes: [.font: UIFont.systemFont(ofSize: 9), .foregroundColor: UIColor.darkGray])
            }
        }
    }

    private static func number(_ value: Any?) -> CGFloat? {
        guard let number = value as? NSNumber, number.doubleValue.isFinite else { return nil }
        return CGFloat(number.doubleValue)
    }

    private static func safeFilename(_ title: String) -> String {
        let cleaned = title.replacingOccurrences(of: #"[^\p{L}\p{N} ._-]"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "Phloem" : String(cleaned.prefix(90))
    }

    private static func javaScript(_ script: String, arguments: [String: Any] = [:],
                                   in view: WKWebView, world: WKContentWorld) async throws -> Any {
        try await withCheckedThrowingContinuation { continuation in
            view.callAsyncJavaScript(script, arguments: arguments, in: nil, in: world) { continuation.resume(with: $0) }
        }
    }

    private static func capture(_ view: WKWebView, configuration: WKPDFConfiguration) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            view.createPDF(configuration: configuration) { continuation.resume(with: $0) }
        }
    }
}
