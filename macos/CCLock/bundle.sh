#!/usr/bin/env bash
# Builds CCLock.app bundle from the Swift package.
# Usage:
#   ./bundle.sh              # build into macos/CCLock/dist/CCLock.app
#   ./bundle.sh --install    # also copy to ~/Applications/CCLock.app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="CCLock"
BUNDLE_DIR="$SCRIPT_DIR/dist/${APP_NAME}.app"
INSTALL_DIR="$HOME/Applications"

log()  { echo "▶ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

# Build release binary
log "Building $APP_NAME (release)..."
cd "$SCRIPT_DIR"
swift build -c release 2>&1

BINARY="$SCRIPT_DIR/.build/release/$APP_NAME"
[ -f "$BINARY" ] || die "Binary not found at $BINARY"

# Assemble .app bundle
log "Assembling ${APP_NAME}.app..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/Contents/MacOS"
mkdir -p "$BUNDLE_DIR/Contents/Resources"

cp "$BINARY"                     "$BUNDLE_DIR/Contents/MacOS/$APP_NAME"
cp "$SCRIPT_DIR/Info.plist"      "$BUNDLE_DIR/Contents/Info.plist"

chmod +x "$BUNDLE_DIR/Contents/MacOS/$APP_NAME"

log "Built: $BUNDLE_DIR"

# Optionally install to ~/Applications
if [ "${1:-}" = "--install" ]; then
    mkdir -p "$INSTALL_DIR"
    rm -rf "$INSTALL_DIR/${APP_NAME}.app"
    cp -r "$BUNDLE_DIR" "$INSTALL_DIR/"
    log "Installed: $INSTALL_DIR/${APP_NAME}.app"
    echo
    echo "  To launch:        open ~/Applications/CCLock.app"
    echo "  To auto-start:    System Settings → General → Login Items → add CCLock"
fi
