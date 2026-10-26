#!/usr/bin/env python3
"""Copy the shared, dependency-free room into the native app's offline bundle."""
from pathlib import Path
import shutil

native = Path(__file__).resolve().parents[1]
source = native.parents[1] / "focus"
destination = native / "Web"
destination.mkdir(parents=True, exist_ok=True)
files = ["index.html", "core.js", "app.js", "style.css", "icon.svg", "icon-192.png", "icon-512.png", "manifest.webmanifest"]
for filename in files:
    path = source / filename
    if not path.is_file():
        raise SystemExit(f"Missing required web asset: {path}")
for filename in files:
    shutil.copy2(source / filename, destination / filename)
print(f"Bundled {len(files)} offline assets for Tend")
