#!/bin/bash
# Play Store phone screenshots from the debug build, with the sample notebook, on Thursday 29 Oct 2026 10:30.
# Each is cropped from 1080x2400 to 1080x2160 (Play allows at most 2:1).
# Needs a running emulator (Google APIs image, so adb root works) with the debug build installed, and Pillow
# for ${PYTHON:-python3}.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
S=$(mktemp -d)
PY=${PYTHON:-python3}
OUT=$HERE/store/phone
ADB=$HOME/Library/Android/sdk/platform-tools/adb
PKG=com.houfu72.tend
mkdir -p $OUT
$ADB root >/dev/null; sleep 3
$ADB shell settings put global auto_time 0
$ADB shell "date 102910302026.00" >/dev/null
$ADB shell cmd notification set_dnd on >/dev/null 2>&1 || true

seed() {  # seed <mode>, then open Tend fresh
  $PY $HERE/seed_notebook.py "2026-10-29T10:30" -4 "$1" > $S/seed.json
  $ADB shell am force-stop $PKG
  $ADB shell "run-as $PKG sh -c 'mkdir -p files && cat > files/notebook.json'" < $S/seed.json
  $ADB shell am start -W -n $PKG/.MainActivity >/dev/null
  sleep 3
}
shoot() {  # shoot <name>
  $ADB exec-out screencap -p > $S/raw-$1.png
  $PY -c "from PIL import Image; Image.open('$S/raw-$1.png').convert('RGB').crop((0, 120, 1080, 2280)).save('$OUT/$1.png')"
  echo "shot $1"
}

seed running; shoot 1-focus
$ADB shell input tap 875 948; sleep 2.5; shoot 2-quiet        # Quiet view (Pixel 8 coordinates)
seed review; sleep 1; shoot 3-reflect
seed idle
$ADB shell input tap 463 390; sleep 2; shoot 4-notebook       # Notebook tab
$ADB shell input swipe 540 1900 540 700 400; sleep 1.5; shoot 5-sessions
$ADB shell input tap 800 390; sleep 2; shoot 6-sources        # Sources tab
$ADB shell settings put global auto_time 1
ls -la $OUT
