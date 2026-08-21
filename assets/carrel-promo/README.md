# Phloem promotional assets

Made from the installed-app screen recording captured on 2026-08-14.

- `carrel-app-screen-recording-original.mov` — untouched 85.5-second installed-app capture, stored with Git LFS.
- `carrel-app-demo.mp4` — 91.4-second demo covering cream paper, the pointer guide, column snap-zoom, and phone reflow; H.264/AAC, 1280×800, web-optimized fast start.
- `carrel-app-demo-poster.jpg` — poster frame for the demo, the guide spotlight mid-sweep.
- `carrel-app-overview.jpg` — installed app, paper, notes, and AI together.
- `carrel-guide-ai.jpg` — reading guide feeding a focused AI question.
- `carrel-focus-dark.jpg` — distraction-reduced dark reading view.

The interface stays unobstructed between the opening and closing cards. The score was composed and rendered specifically for this demo with `scripts/build-carrel-promo-music.py`, so it does not depend on third-party music licensing.

The demo plays in the `reading.html` first-visit hero, which hides itself once a library has papers in it. Keep it out of Git LFS whatever its size: GitHub Pages serves LFS-tracked paths as their pointer text rather than the file, so an LFS video would reach visitors as a few lines of ASCII. Re-encodes should keep `-movflags +faststart`, or the browser has to fetch the whole file before the first frame.
