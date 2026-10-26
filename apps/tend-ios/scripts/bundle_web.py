#!/usr/bin/env python3
"""Copy the shared, dependency-free room into the native app's offline bundle."""
from pathlib import Path
import shutil

native = Path(__file__).resolve().parents[1]
source = native.parents[1] / "focus"
destination = native / "Web"
destination.mkdir(parents=True, exist_ok=True)
files = ["index.html", "core.js", "app.js", "theme.js", "pixel.js", "style.css", "theme.css", "pixel.css",
         "icon.svg", "icon-192.png", "icon-512.png", "tomato-button.png", "manifest.webmanifest",
         "fonts/plank-pixel.woff", "fonts/dm-sans-var-latin.woff2", "fonts/ibm-plex-mono-400-latin.woff2",
         "fonts/ibm-plex-mono-500-latin.woff2", "fonts/OFL-DM-Sans.txt", "fonts/OFL-IBM-Plex-Mono.txt"]
for filename in files:
    path = source / filename
    if not path.is_file():
        raise SystemExit(f"Missing required web asset: {path}")
for filename in files:
    (destination / filename).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / filename, destination / filename)
print(f"Bundled {len(files)} offline assets for Tend")
