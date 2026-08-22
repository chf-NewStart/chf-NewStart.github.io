#!/usr/bin/env python3
"""Build the first-run Phloem field guide as a polished, screen-friendly PDF."""

from pathlib import Path
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "phloem-field-guide.pdf"
ASSET = ROOT / "assets" / "phloem-guide" / "phloem-field-guide.pdf"
PHLOEM_ICON = ROOT / "favicon_io" / "phloem-book-vine-clean-512.png"
ARTIST_URL = "https://www.linkedin.com/in/itpromma/"

PAGE_W = 7.2 * inch
PAGE_H = 9.2 * inch
M = 0.62 * inch

# Match the approved icon's own paper tone so the artwork sits directly on the
# guide page instead of looking pasted into a pale square.
CREAM = HexColor("#FCF6ED")
PAPER = HexColor("#FFFDF7")
INK = HexColor("#253039")
MUTED = HexColor("#6E7779")
GREEN = HexColor("#2E6C61")
GREEN_SOFT = HexColor("#DDEAE2")
CORAL = HexColor("#EF5B3F")
YELLOW = HexColor("#F0D968")
BLUE = HexColor("#BFD9EE")
RED = HexColor("#E9A79E")
LINE = HexColor("#D7D0BF")


def register_fonts():
    font_dir = Path("/System/Library/Fonts/Supplemental")
    pdfmetrics.registerFont(TTFont("GuideSerif", str(font_dir / "Georgia.ttf")))
    pdfmetrics.registerFont(TTFont("GuideSerifBold", str(font_dir / "Georgia Bold.ttf")))
    pdfmetrics.registerFont(TTFont("GuideSerifItalic", str(font_dir / "Georgia Italic.ttf")))
    pdfmetrics.registerFont(TTFont("GuideSans", str(font_dir / "Arial.ttf")))
    pdfmetrics.registerFont(TTFont("GuideSansBold", str(font_dir / "Arial Bold.ttf")))
    pdfmetrics.registerFont(TTFont("GuideHand", str(font_dir / "Bradley Hand Bold.ttf")))


register_fonts()

BODY = ParagraphStyle(
    "Body", fontName="GuideSans", fontSize=10.2, leading=15.2,
    textColor=INK, spaceAfter=8,
)
SMALL = ParagraphStyle(
    "Small", fontName="GuideSans", fontSize=8.2, leading=12,
    textColor=MUTED,
)
CALLOUT = ParagraphStyle(
    "Callout", fontName="GuideSerifItalic", fontSize=11.5, leading=17,
    textColor=INK,
)
CARD_TITLE = ParagraphStyle(
    "CardTitle", fontName="GuideSerifBold", fontSize=13, leading=16,
    textColor=INK,
)


def para(c, text, x, y_top, width, style=BODY):
    p = Paragraph(text, style)
    _, height = p.wrap(width, PAGE_H)
    p.drawOn(c, x, y_top - height)
    return height


def rounded_box(c, x, y, w, h, fill=PAPER, stroke=LINE, radius=10, shadow=False):
    if shadow:
        c.setFillColor(Color(0.16, 0.17, 0.15, alpha=0.10))
        c.roundRect(x + 4, y - 5, w, h, radius, fill=1, stroke=0)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def sprig(c, x, y, scale=1.0, angle=0, color=GREEN):
    c.saveState()
    c.translate(x, y)
    c.rotate(angle)
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.4 * scale)
    c.line(0, 0, 3 * scale, 45 * scale)
    leaves = [
        (-8, 10, -28), (9, 16, 31), (-9, 24, -27),
        (10, 31, 30), (-7, 38, -24),
    ]
    for lx, ly, rot in leaves:
        c.saveState()
        c.translate(lx * scale, ly * scale)
        c.rotate(rot)
        c.ellipse(-8 * scale, -3.2 * scale, 8 * scale, 3.2 * scale, fill=1, stroke=0)
        c.restoreState()
    c.restoreState()


def page_base(c, page_num, section):
    c.setFillColor(CREAM)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColor(Color(0.15, 0.19, 0.20, alpha=0.035))
    c.setLineWidth(0.5)
    for x in range(16, int(PAGE_W), 34):
        c.line(x, 0, x + 22, PAGE_H)
    c.setFillColor(GREEN)
    c.setFont("GuideSerifItalic", 18)
    c.drawString(M, PAGE_H - 34, "Phloem")
    c.setFont("GuideSansBold", 6.8)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - M, PAGE_H - 29, section.upper())
    c.setStrokeColor(LINE)
    c.line(M, PAGE_H - 45, PAGE_W - M, PAGE_H - 45)
    c.setFont("GuideSans", 7.4)
    c.setFillColor(MUTED)
    c.drawString(M, 23, "BREATHE  /  FOCUS  /  READ")
    c.drawRightString(PAGE_W - M, 23, f"{page_num} / 6")


def heading(c, kicker, title, subtitle=None):
    top = PAGE_H - 78
    c.setFillColor(CORAL)
    c.setFont("GuideSansBold", 7.2)
    c.drawString(M, top, kicker.upper())
    c.setFillColor(INK)
    c.setFont("GuideSerifBold", 26)
    lines = title.split("\n")
    for i, line in enumerate(lines):
        c.drawString(M, top - 36 - i * 31, line)
    y = top - 45 - len(lines) * 31
    if subtitle:
        para(c, subtitle, M, y, PAGE_W - 2 * M, CALLOUT)


def number_badge(c, number, x, y, fill=GREEN):
    c.setFillColor(fill)
    c.circle(x, y, 12, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont("GuideSansBold", 8.5)
    c.drawCentredString(x, y - 3, str(number))


def checklist_row(c, number, title, text, x, y, width):
    number_badge(c, number, x + 13, y - 13)
    c.setFillColor(INK)
    c.setFont("GuideSansBold", 10.2)
    c.drawString(x + 36, y - 8, title)
    para(c, text, x + 36, y - 17, width - 36, SMALL)


def draw_phloem_icon(c, x, y, size):
    """Use the approved app artwork, never a hand-reconstructed substitute."""
    c.drawImage(
        ImageReader(str(PHLOEM_ICON)), x, y, width=size, height=size,
        preserveAspectRatio=True, anchor="c", mask="auto",
    )


def page_one(c):
    page_base(c, 1, "Field guide")
    c.setFillColor(CORAL)
    c.setFont("GuideSansBold", 7.5)
    c.drawString(M, PAGE_H - 91, "YOUR FIRST PAPER")
    c.setFillColor(INK)
    c.setFont("GuideSerifBold", 34)
    c.drawString(M, PAGE_H - 139, "A Field Guide")
    c.drawString(M, PAGE_H - 181, "to Phloem")
    para(c, "A calm, local-first desk for reading papers, leaving useful traces, and finding your way back.", M, PAGE_H - 207, 3.35 * inch, CALLOUT)
    icon_size = 1.84 * inch
    draw_phloem_icon(c, PAGE_W - M - icon_size, PAGE_H - 3.0 * inch, icon_size)
    rounded_box(c, M, 1.08 * inch, PAGE_W - 2 * M, 2.1 * inch, PAPER, LINE, 14, True)
    c.setFillColor(GREEN)
    c.setFont("GuideSerifBold", 17)
    c.drawString(M + 24, 2.73 * inch, "Start here")
    checklist_row(c, 1, "Choose this note", "On the wall, one click selects a paper and shows its field notebook.", M + 20, 2.48 * inch, PAGE_W - 2 * M - 40)
    checklist_row(c, 2, "Open the notebook", "Click the selected note again, or choose Continue reading.", M + 20, 1.98 * inch, PAGE_W - 2 * M - 40)
    checklist_row(c, 3, "Make one trace", "Move the guide, mark a sentence, or write a short margin note.", M + 20, 1.48 * inch, PAGE_W - 2 * M - 40)


def page_two(c):
    page_base(c, 2, "The library")
    heading(c, "01 - Gather", "Build a reading wall", "The wall is a working surface, not an inbox to conquer. Keep what helps you think.")
    left = M
    top = PAGE_H - 220
    for i, (title, text) in enumerate([
        ("Add a paper", "Drop a PDF or folder, paste a direct PDF link, or pick from your connected GitHub folder."),
        ("Select with one click", "The note straightens and its notebook appears beside the wall. Click again to start reading."),
        ("Find it later", "Search titles, authors, and tags. Sort by last touched, date added, title, author, or progress."),
    ], 1):
        checklist_row(c, i, title, text, left, top - (i - 1) * 86, 3.35 * inch)
    # Mini wall
    wall_x = 4.15 * inch
    wall_y = 1.12 * inch
    rounded_box(c, wall_x, wall_y, 2.42 * inch, 4.9 * inch, HexColor("#F1EEE5"), LINE, 14, True)
    c.setFillColor(MUTED)
    c.setFont("GuideSansBold", 6.5)
    c.drawString(wall_x + 18, wall_y + 4.56 * inch, "READING WALL")
    notes = [(BLUE, -2, "phloem transport", "Chiou"), (YELLOW, 2, "whole plant model", "Gomes"), (RED, -1, "nitrate in tomato", "Beevers")]
    for i, (fill, rot, title, author) in enumerate(notes):
        nx, ny, nw, nh = wall_x + 22 + (i % 2) * 60, wall_y + 2.95 * inch - i * 70, 112, 92
        c.saveState(); c.translate(nx + nw / 2, ny + nh / 2); c.rotate(rot)
        rounded_box(c, -nw / 2, -nh / 2, nw, nh, fill, Color(0.1, 0.3, 0.5, alpha=.22), 3, True)
        c.setFillColor(Color(1, .96, .78, alpha=.65)); c.rect(-16, nh / 2 - 7, 32, 13, fill=1, stroke=0)
        c.setFillColor(HexColor("#234F91")); c.setFont("GuideHand", 10.2)
        c.drawString(-nw / 2 + 12, nh / 2 - 28, title)
        c.setFont("GuideHand", 6.8); c.drawString(-nw / 2 + 12, -nh / 2 + 11, author)
        c.restoreState()
    sprig(c, wall_x + 1.9 * inch, wall_y + 3.85 * inch, .75, 15, Color(.32, .42, .31, alpha=.58))
    para(c, "Tip: tags create useful connections between papers without forcing a folder system.", M, 1.15 * inch, 3.25 * inch, SMALL)


def page_three(c):
    page_base(c, 3, "The reading desk")
    heading(c, "02 - Focus", "Read with less friction", "The page stays central. Tools appear around it only when they help.")
    desk_x, desk_y, desk_w, desk_h = M, 1.12 * inch, PAGE_W - 2 * M, 5.23 * inch
    rounded_box(c, desk_x, desk_y, desk_w, desk_h, HexColor("#ECE8DD"), LINE, 14, True)
    # PDF page
    px, py, pw, ph = desk_x + 32, desk_y + 35, 3.32 * inch, 4.35 * inch
    rounded_box(c, px, py, pw, ph, PAPER, HexColor("#C7C0B0"), 4, True)
    c.setFillColor(INK); c.setFont("GuideSerifBold", 14)
    c.drawString(px + 25, py + ph - 34, "Pressure flow in the phloem")
    c.setFillColor(MUTED); c.setFont("GuideSans", 7.5)
    c.drawString(px + 25, py + ph - 53, "A small sample page")
    for i, width in enumerate([190, 210, 180, 204, 160, 215, 188, 201, 142]):
        yy = py + ph - 82 - i * 24
        c.setStrokeColor(HexColor("#D8D4CA")); c.setLineWidth(4)
        c.line(px + 25, yy, px + 25 + width, yy)
    c.setStrokeColor(CORAL); c.setLineWidth(6)
    c.line(px + 58, py + ph - 154, px + 197, py + ph - 154)
    # Reading guide
    c.setFillColor(Color(0.94, .79, .27, alpha=.34)); c.setStrokeColor(Color(.65, .53, .13, alpha=.55))
    c.roundRect(px - 5, py + 1.45 * inch, pw + 10, 24, 5, fill=1, stroke=1)
    c.setFillColor(HexColor("#786520")); c.setFont("GuideSansBold", 6)
    c.drawRightString(px + pw - 8, py + 1.45 * inch + 8, "MOVE ME")
    # Tool cards
    tx = px + pw + 24
    cards = [
        ("Guide", "Drag the yellow bar to hold your place."),
        ("Fit / zoom", "Make dense figures and small labels comfortable."),
        ("Reflow", "Switch to rebuilt text when the original page is cramped."),
        ("Recall", "Hide the page briefly and explain the idea in your own words."),
    ]
    for i, (title, text) in enumerate(cards):
        cy = py + ph - 72 - i * 74
        rounded_box(c, tx, cy, 2.05 * inch, 58, PAPER, LINE, 8, False)
        c.setFillColor(GREEN); c.setFont("GuideSansBold", 8.2); c.drawString(tx + 12, cy + 38, title)
        para(c, text, tx + 12, cy + 31, 1.72 * inch, SMALL)


def page_four(c):
    page_base(c, 4, "Your traces")
    heading(c, "03 - Notice", "Leave evidence for future you", "A mark should shorten the next visit, not recreate the whole paper.")
    cards = [
        ("MARK", CORAL, "Highlight a sentence that changes the model in your head."),
        ("MARGIN", GREEN, "Write the smallest note that will restore the context later."),
        ("LOOK UP", HexColor("#315FA5"), "Select a short term for a definition and a source-linked image."),
        ("ASK", HexColor("#B88928"), "Save a question when a passage deserves a second pass."),
    ]
    x_positions = [M, PAGE_W / 2 + 6]
    y_positions = [3.77 * inch, 1.65 * inch]
    for i, (label, color, text) in enumerate(cards):
        x, y = x_positions[i % 2], y_positions[i // 2]
        rounded_box(c, x, y, 2.94 * inch, 1.65 * inch, PAPER, LINE, 12, True)
        c.setFillColor(color); c.setFont("GuideSansBold", 7); c.drawString(x + 18, y + 1.34 * inch, label)
        c.setFillColor(INK); c.setFont("GuideSerifBold", 14)
        c.drawString(x + 18, y + 1.04 * inch, ["Keep one line", "Write for return", "Resolve a term", "Save the gap"][i])
        para(c, text, x + 18, y + .83 * inch, 2.42 * inch, BODY)
    rounded_box(c, M, .72 * inch, PAGE_W - 2 * M, .61 * inch, GREEN_SOFT, Color(0.18, .42, .38, alpha=.32), 8, False)
    c.setFillColor(GREEN); c.setFont("GuideHand", 11)
    c.drawCentredString(PAGE_W / 2, .98 * inch, "If a note cannot help you re-enter the thought, make it smaller.")


def page_five(c):
    page_base(c, 5, "Return and recall")
    heading(c, "04 - Remember", "Return without a streak", "Phloem keeps questions near the paper. Review is a shelf you can visit, not a score that chases you.")
    cx, cy = PAGE_W / 2, 3.85 * inch
    labels = [
        (cx, cy + 1.55 * inch, "READ", "understand one idea", GREEN),
        (cx + 2.0 * inch, cy + .25 * inch, "MARK", "leave a useful trace", CORAL),
        (cx + 1.2 * inch, cy - 1.45 * inch, "QUESTION", "name what is missing", HexColor("#315FA5")),
        (cx - 1.2 * inch, cy - 1.45 * inch, "RECALL", "answer from memory", HexColor("#B88928")),
        (cx - 2.0 * inch, cy + .25 * inch, "RETURN", "open where you left", GREEN),
    ]
    for x, y, label, text, color in labels:
        c.setFillColor(PAPER); c.setStrokeColor(color); c.setLineWidth(1.4)
        c.circle(x, y, 42, fill=1, stroke=1)
        c.setFillColor(color); c.setFont("GuideSansBold", 6.8); c.drawCentredString(x, y + 5, label)
        c.setFillColor(MUTED); c.setFont("GuideSans", 5.9); c.drawCentredString(x, y - 9, text)
    c.setStrokeColor(LINE); c.setLineWidth(1.1)
    for i in range(len(labels)):
        x1, y1 = labels[i][0], labels[i][1]
        x2, y2 = labels[(i + 1) % len(labels)][0], labels[(i + 1) % len(labels)][1]
        c.line(x1 + (10 if x2 > x1 else -10), y1 - 40, x2 + (10 if x2 > x1 else -10), y2 + 40)
    sprig(c, cx - 3, cy - 16, .7, -6, Color(.18, .42, .38, alpha=.72))
    rounded_box(c, M, .73 * inch, PAGE_W - 2 * M, .9 * inch, PAPER, LINE, 9, False)
    c.setFillColor(INK); c.setFont("GuideSerifBold", 13)
    c.drawString(M + 18, 1.31 * inch, "A good saved question")
    c.setFillColor(CORAL); c.setFont("GuideHand", 10.5)
    c.drawString(M + 18, 1.02 * inch, "What evidence would make this mechanism fail?")


def page_six(c):
    page_base(c, 6, "Keep it yours")
    heading(c, "05 - Keep", "A desk that travels carefully", "Papers and notes begin on this device. Add sync only when it makes your own workflow safer.")
    items = [
        ("LOCAL FIRST", "Your library works without an account. PDFs live in this browser's local storage."),
        ("OPTIONAL SYNC", "Use Google Drive app data, or encrypted GitHub sync, when you need the same library on several devices."),
        ("BACKUP", "Export a portable JSON backup for notes and metadata. Keep original PDFs separately too."),
        ("BROWSER EXTENSION", "Right-click a PDF link or use the toolbar button to send it directly into Phloem."),
    ]
    for i, (title, text) in enumerate(items):
        y = 5.0 * inch - i * .82 * inch
        c.setFillColor([GREEN, CORAL, HexColor("#315FA5"), HexColor("#B88928")][i])
        c.circle(M + 11, y + 8, 5.5, fill=1, stroke=0)
        c.setFillColor(INK); c.setFont("GuideSansBold", 8.5); c.drawString(M + 28, y + 13, title)
        para(c, text, M + 28, y + 5, PAGE_W - 2 * M - 32, BODY)
    rounded_box(c, M, .76 * inch, PAGE_W - 2 * M, 1.1 * inch, GREEN_SOFT, Color(.18, .42, .38, alpha=.34), 10, False)
    c.setFillColor(GREEN); c.setFont("GuideSerifBold", 15)
    c.drawString(M + 20, 1.48 * inch, "Your first five minutes")
    c.setFillColor(INK); c.setFont("GuideSans", 8.6)
    c.drawString(M + 20, 1.19 * inch, "1. Open this guide   2. Move the reading bar   3. Mark one line")
    c.drawString(M + 20, .97 * inch, "4. Write one margin note   5. Return to the wall")
    sprig(c, PAGE_W - M - 22, .88 * inch, .65, -14, Color(.18, .42, .38, alpha=.7))
    credit = "Phloem icon artwork by Promma  ·  linkedin.com/in/itpromma"
    c.setFillColor(MUTED); c.setFont("GuideSans", 6.4)
    c.drawString(M, 39, credit)
    credit_width = pdfmetrics.stringWidth(credit, "GuideSans", 6.4)
    c.linkURL(ARTIST_URL, (M, 35, M + credit_width, 46), relative=0, thickness=0)


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ASSET.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("A Field Guide to Phloem")
    c.setAuthor("Phloem")
    c.setSubject("First-run guide for the Phloem paper reading desk")
    for draw_page in (page_one, page_two, page_three, page_four, page_five, page_six):
        draw_page(c)
        c.showPage()
    c.save()
    ASSET.write_bytes(OUT.read_bytes())
    print(OUT)
    print(ASSET)


if __name__ == "__main__":
    build()
