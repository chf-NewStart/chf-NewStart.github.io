#!/usr/bin/env python3
"""Make the Live Activity's copy of Plank Pixel: the colon's advance trimmed from 6 cells to 3, as pixel.css trims
it (`.px-colon{margin-right:-.3em}`), so "24:59" has one blank cell each side of the colon. Digits keep their
6-cell advance, so a ticking countdown never shifts. Needs fontTools (pip install fonttools)."""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[2]
font = TTFont(root / "tend-android/app/src/main/res/font/plank_pixel.ttf")
colon = font.getBestCmap()[ord(":")]
font["hmtx"][colon] = (300, font["hmtx"][colon][1])
font.save(root / "tend-ios/LiveActivity/Fonts/PlankPixel.ttf")
print("Wrote LiveActivity/Fonts/PlankPixel.ttf with a 3-cell colon")
