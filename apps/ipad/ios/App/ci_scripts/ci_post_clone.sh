#!/bin/sh
set -eu

# Xcode Cloud runs this before resolving the local Swift package references.
# node_modules and the native web bundle are generated, not stored in Git.
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
app_dir="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
cd "$app_dir"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 ||
   ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  if ! command -v brew >/dev/null 2>&1; then
    echo 'Phloem needs Node.js 22+ and npm; Homebrew is required to install them.' >&2
    exit 1
  fi
  export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
  brew install node@22
  PATH="$(brew --prefix node@22)/bin:$PATH"
  export PATH
fi

node --version
npm --version
npm ci --include=dev --no-audit --no-fund
npm test
npm run ios:sync

# Fail here with an obvious path if preparation did not produce Xcode's inputs.
test -f node_modules/@capacitor/browser/Package.swift
test -f ios/App/App/public/reading.js
test -f ios/App/App/capacitor.config.json
