import SwiftUI

// The pixel pieces of focus/pixel.css and pixel.js, for the Live Activity: the palette, Plank Pixel, the 16×14
// tomato, a stepped ring of blocks and the notched keys. Everything is a Shape, which WidgetKit can draw.

enum Px {
    static let paper = Color(hex: 0x040706), ink = Color(hex: 0xF4EFDC), muted = Color(hex: 0x8F9A92)
    static let tomato = Color(hex: 0xFF5A43), tomatoDeep = Color(hex: 0xB8321F), tomatoEdge = Color(hex: 0xFF8B76)
    static let green = Color(hex: 0x76F7A5), greenDeep = Color(hex: 0x2A9D5A), greenEdge = Color(hex: 0xB6FFD0)
    static let ringOff = Color(hex: 0x17211C), key = Color(hex: 0x0C1410), keyEdge = Color(hex: 0x3B5146)
    static let keyInk = Color(hex: 0x1D0703), breakInk = Color(hex: 0x03140A)
    /// Plank Pixel, Houfu's 5×7 arcade font: a cell is a tenth of the size, so sizes in tens stay crisp.
    static func pixel(_ size: CGFloat) -> Font { .custom("PlankPixel-Regular", fixedSize: size) }
    /// IBM Plex Mono, as the room writes the question.
    static func mono(_ size: CGFloat) -> Font { .custom("IBMPlexMono-Medium", fixedSize: size) }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double(hex >> 16 & 0xFF) / 255, green: Double(hex >> 8 & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// The cells of a sprite drawn in one colour (`key`), centred and scaled to whole cells of the frame.
struct Sprite: Shape {
    let rows: [String]
    var key: Character = "#"

    func path(in rect: CGRect) -> Path {
        let columns = CGFloat(rows.map(\.count).max() ?? 1), lines = CGFloat(rows.count)
        let cell = min(rect.width / columns, rect.height / lines)
        let left = rect.minX + (rect.width - cell * columns) / 2, top = rect.minY + (rect.height - cell * lines) / 2
        var path = Path()
        for (y, row) in rows.enumerated() {
            let characters = Array(row)
            var x = 0
            while x < characters.count {
                var run = 1
                while x + run < characters.count && characters[x + run] == characters[x] { run += 1 }
                // A hair of overlap hides seams between cells at fractional scales.
                if characters[x] == key {
                    path.addRect(CGRect(x: left + CGFloat(x) * cell, y: top + CGFloat(y) * cell, width: CGFloat(run) * cell + 0.25, height: cell + 0.25))
                }
                x += run
            }
        }
        return path
    }
}

/// k outline, r body, s shade, h highlight, G leaf, g leaf light. The same sprite as focus/pixel.js.
private let tomatoRows = [
    ".......GG.......",
    "....GG.GG.GG....",
    ".....GGGGGG.....",
    "...kkGGggGGkk...",
    "..krrrGggGrrrk..",
    ".krhhrrGGrrrrrk.",
    ".krhrrrrrrrrrrk.",
    "krhrrrrrrrrrrrsk",
    "krrrrrrrrrrrrrsk",
    "krrrrrrrrrrrrssk",
    ".krrrrrrrrrrssk.",
    ".krsrrrrrrrsssk.",
    "..kssssssssssk..",
    "...kkkkkkkkkk..."
]

/// The pixel tomato. `ripe` runs from 0 (green) to 1 (red), mixed in OKLCH like the room, through orange.
struct PixelTomato: View {
    var ripe: Double = 1

    var body: some View {
        ZStack {
            Sprite(rows: tomatoRows, key: "k").fill(Color(hex: 0x2B0E09))
            Sprite(rows: tomatoRows, key: "r").fill(Oklch.mix(0xFF5A43, 0x7FD35E, ripe))
            Sprite(rows: tomatoRows, key: "s").fill(Oklch.mix(0xB8321F, 0x4B913A, ripe))
            Sprite(rows: tomatoRows, key: "h").fill(Color(hex: 0xFFD3C7))
            Sprite(rows: tomatoRows, key: "G").fill(Color(hex: 0x2F9E57))
            Sprite(rows: tomatoRows, key: "g").fill(Color(hex: 0x76F7A5))
        }
        .aspectRatio(16 / 14, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// A midpoint circle of blocks, as focus/pixel.js draws the dial (there with radius 17; smaller here, so the
/// blocks stay big enough to read as pixels), ordered clockwise from 12 o'clock.
struct Ring {
    let radius: Int
    let cells: [(Int, Int)]

    init(radius: Int) {
        self.radius = radius
        var points: [(Int, Int)] = [], seen = Set<[Int]>()
        var x = radius, y = 0, error = 1 - radius
        while x >= y {
            for (dx, dy) in [(x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)] where seen.insert([dx, dy]).inserted {
                points.append((dx, dy))
            }
            y += 1
            if error < 0 { error += 2 * y + 1 } else { x -= 1; error += 2 * (y - x) + 1 }
        }
        func turn(_ p: (Int, Int)) -> Double { (atan2(Double(p.0), Double(-p.1)) + 2 * .pi).truncatingRemainder(dividingBy: 2 * .pi) }
        cells = points.sorted { turn($0) < turn($1) }
    }

    /// The dial in grid units: 8 per cell, a 6-unit block in each, and a cell of margin.
    var units: CGFloat { CGFloat(2 * radius + 3) * 8 }

    /// Blocks `range` of the ring, for a dial filling the shape's frame.
    struct Blocks: Shape {
        let ring: Ring
        var range: Range<Int>? = nil

        func path(in rect: CGRect) -> Path {
            let unit = min(rect.width, rect.height) / ring.units
            var path = Path()
            for (dx, dy) in ring.cells[range ?? ring.cells.indices] {
                path.addRect(CGRect(x: rect.midX + (CGFloat(dx * 8) - 3) * unit, y: rect.midY + (CGFloat(dy * 8) - 3) * unit, width: 6 * unit, height: 6 * unit))
            }
            return path
        }
    }

    /// The blocks still lit with `left` of the interval to go: the ring empties clockwise from 12 o'clock.
    func lit(_ left: Double) -> Blocks {
        let count = Int((left * Double(cells.count) - 1e-6).rounded(.up))
        return Blocks(ring: self, range: (cells.count - max(0, min(cells.count, count)))..<cells.count)
    }
}

/// A rectangle with its corner cells cut away: the room's notched pixel edge (four flat shadows, open corners).
struct Notched: Shape {
    var notch: CGFloat = 3

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRect(rect.insetBy(dx: notch, dy: 0))
        path.addRect(rect.insetBy(dx: 0, dy: notch))
        return path
    }
}

/// Faint scanlines over the whole activity, like the room's screen.
struct Scanlines: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        var y = rect.minY
        while y < rect.maxY { path.addRect(CGRect(x: rect.minX, y: y, width: rect.width, height: 1)); y += 3 }
        return path
    }
}

/// Small pixel icons for the keys.
enum Glyph {
    static let pause = ["##.##", "##.##", "##.##", "##.##", "##.##", "##.##", "##.##"]
    static let play = ["#...", "##..", "###.", "####", "###.", "##..", "#..."]
    static let check = ["......#", ".....##", "#...##.", "##.##..", ".###...", "..#...."]
}

/// color-mix(in oklch, a p%, b), as pixel.css ripens the tomato (hue the short way round).
enum Oklch {
    static func mix(_ a: UInt32, _ b: UInt32, _ p: Double) -> Color {
        let (l1, c1, h1) = lch(a), (l2, c2, h2) = lch(b)
        var dh = h1 - h2
        if dh > 180 { dh -= 360 }
        if dh < -180 { dh += 360 }
        let q = min(1, max(0, p))
        return color(l2 + (l1 - l2) * q, c2 + (c1 - c2) * q, h2 + dh * q)
    }

    private static func linear(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    private static func gamma(_ c: Double) -> Double { min(1, max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055)) }

    private static func lch(_ hex: UInt32) -> (Double, Double, Double) {
        let r = linear(Double(hex >> 16 & 0xFF) / 255), g = linear(Double(hex >> 8 & 0xFF) / 255), b = linear(Double(hex & 0xFF) / 255)
        let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        let L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        let A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        let B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        return (L, sqrt(A * A + B * B), (atan2(B, A) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360))
    }

    private static func color(_ L: Double, _ C: Double, _ h: Double) -> Color {
        let A = C * cos(h * .pi / 180), B = C * sin(h * .pi / 180)
        let l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
        let m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
        let s = pow(L - 0.0894841775 * A - 1.2914855480 * B, 3)
        return Color(red: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
                     green: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
                     blue: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s))
    }
}
