#!/usr/bin/env bash
# Builds CCLock.app bundle from the Swift package.
#
# Usage:
#   ./bundle.sh                    # build into macos/CCLock/dist/CCLock.app
#   ./bundle.sh --install          # also copy to ~/Applications/CCLock.app
#   ./bundle.sh --dmg              # also create macos/CCLock/dist/CCLock.dmg (unsigned)
#   ./bundle.sh --sign             # sign + notarize + create DMG (for distribution)
#
# --sign requires three env vars (or prompts):
#   APPLE_ID        e.g. you@example.com
#   APPLE_TEAM_ID   e.g. CM9KMJPA22  (found at developer.apple.com/account)
#   APPLE_APP_PWD   app-specific password from appleid.apple.com → Security
#
# You also need a "Developer ID Application" certificate installed in Keychain.
# (Different from "Apple Development" — create it at developer.apple.com → Certificates)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="CCLock"
BUNDLE_DIR="$SCRIPT_DIR/dist/${APP_NAME}.app"
DMG_PATH="$SCRIPT_DIR/dist/${APP_NAME}.dmg"
INSTALL_DIR="$HOME/Applications"
MODE="${1:-}"

log()  { echo "▶ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

# ── Build ─────────────────────────────────────────────────────────────────────

log "Building $APP_NAME (release)..."
cd "$SCRIPT_DIR"
swift build -c release 2>&1

BINARY="$SCRIPT_DIR/.build/release/$APP_NAME"
[ -f "$BINARY" ] || die "Binary not found at $BINARY"

# ── Assemble .app ─────────────────────────────────────────────────────────────

log "Assembling ${APP_NAME}.app..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/Contents/MacOS"
mkdir -p "$BUNDLE_DIR/Contents/Resources"

cp "$BINARY"                "$BUNDLE_DIR/Contents/MacOS/$APP_NAME"
cp "$SCRIPT_DIR/Info.plist" "$BUNDLE_DIR/Contents/Info.plist"
chmod +x "$BUNDLE_DIR/Contents/MacOS/$APP_NAME"

log "Built: $BUNDLE_DIR"

# ── --install ────────────────────────────────────────────────────────────────

if [ "$MODE" = "--install" ]; then
    mkdir -p "$INSTALL_DIR"
    rm -rf "$INSTALL_DIR/${APP_NAME}.app"
    cp -r "$BUNDLE_DIR" "$INSTALL_DIR/"
    log "Installed: $INSTALL_DIR/${APP_NAME}.app"
    echo
    echo "  To launch:     open ~/Applications/CCLock.app"
    echo "  To auto-start: System Settings → General → Login Items → add CCLock"
fi

# ── make_dmg helper ───────────────────────────────────────────────────────────

make_dmg() {
    log "Creating ${APP_NAME}.dmg..."
    local STAGING
    STAGING=$(mktemp -d)
    trap 'rm -rf "$STAGING"' RETURN

    cp -r "$BUNDLE_DIR" "$STAGING/"
    ln -s /Applications "$STAGING/Applications"
    rm -f "$DMG_PATH"

    hdiutil create \
        -volname "$APP_NAME" \
        -srcfolder "$STAGING" \
        -ov \
        -format UDZO \
        "$DMG_PATH"

    log "Created: $DMG_PATH"
}

# ── --dmg (unsigned) ──────────────────────────────────────────────────────────

if [ "$MODE" = "--dmg" ]; then
    make_dmg
    echo
    echo "  Share this file. Recipients need to right-click → Open on first launch"
    echo "  (Gatekeeper bypass for unsigned apps)."
    echo
    echo "  To remove that friction, use --sign instead (requires Developer ID cert)."
fi

# ── --sign (sign + notarize + staple) ─────────────────────────────────────────

if [ "$MODE" = "--sign" ]; then
    # Resolve credentials
    APPLE_ID="${APPLE_ID:-}"
    APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
    APPLE_APP_PWD="${APPLE_APP_PWD:-}"

    if [ -z "$APPLE_ID" ]; then
        read -rp "Apple ID (email): " APPLE_ID
    fi
    if [ -z "$APPLE_TEAM_ID" ]; then
        read -rp "Team ID (e.g. CM9KMJPA22): " APPLE_TEAM_ID
    fi
    if [ -z "$APPLE_APP_PWD" ]; then
        read -rsp "App-specific password (appleid.apple.com → Security): " APPLE_APP_PWD
        echo
    fi

    # Locate Developer ID Application cert
    SIGN_ID=$(security find-identity -v -p codesigning \
        | grep "Developer ID Application" \
        | head -1 \
        | sed 's/.*"\(.*\)"/\1/')

    [ -n "$SIGN_ID" ] || die \
        "No 'Developer ID Application' certificate found in Keychain.
  Create one at: developer.apple.com → Certificates → (+) → Developer ID Application
  Then download and double-click it to install."

    log "Signing with: $SIGN_ID"

    # Sign app with hardened runtime (required for notarization)
    codesign \
        --deep \
        --force \
        --options runtime \
        --sign "$SIGN_ID" \
        "$BUNDLE_DIR"

    log "Signed: $BUNDLE_DIR"

    # Build the DMG from the now-signed .app
    make_dmg

    # Sign the DMG too
    codesign --sign "$SIGN_ID" "$DMG_PATH"

    # Submit for notarization and wait
    log "Submitting to Apple notary service (this takes ~1–5 minutes)..."
    xcrun notarytool submit "$DMG_PATH" \
        --apple-id    "$APPLE_ID" \
        --team-id     "$APPLE_TEAM_ID" \
        --password    "$APPLE_APP_PWD" \
        --wait

    # Staple the notarization ticket into the DMG
    log "Stapling notarization ticket..."
    xcrun stapler staple "$DMG_PATH"

    log "Done: $DMG_PATH"
    echo
    echo "  This DMG is signed and notarized — no Gatekeeper warnings on launch."
    echo "  Share it freely."
fi
