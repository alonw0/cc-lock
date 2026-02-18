#!/usr/bin/env bash
# cc-lock installer
# Run from the repo root after cloning:
#   bash install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SCRIPT="$SCRIPT_DIR/packages/cli/dist/index.js"
BIN_DIR="$HOME/.local/bin"
BIN_PATH="$BIN_DIR/cc-lock"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}▶${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
die()  { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

check_node() {
    command -v node &>/dev/null || die "Node.js is required (>=20). Install from https://nodejs.org"
    local major
    major=$(node -e "console.log(parseInt(process.version.slice(1)))")
    [ "$major" -ge 20 ] || die "Node.js 20+ required (found $(node --version))"
    log "Node.js $(node --version)"
}

check_pnpm() {
    if ! command -v pnpm &>/dev/null; then
        warn "pnpm not found — installing via npm..."
        npm install -g pnpm || die "Failed to install pnpm"
    fi
    log "pnpm $(pnpm --version)"
}

build_packages() {
    log "Installing dependencies..."
    pnpm install --frozen-lockfile

    log "Building TypeScript packages..."
    pnpm build
}

link_cli() {
    mkdir -p "$BIN_DIR"

    # Wrapper script — more robust than a bare symlink to a .js file
    cat > "$BIN_PATH" <<EOF
#!/usr/bin/env bash
exec node "$CLI_SCRIPT" "\$@"
EOF
    chmod +x "$BIN_PATH"
    log "Linked: $BIN_PATH"

    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo
        warn "$BIN_DIR is not in your PATH."
        warn "Add this line to your shell profile (~/.zshrc or ~/.bashrc), then restart your shell:"
        warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo
    fi
}

setup_daemon() {
    log "Setting up daemon (requires claude to be installed)..."
    "$BIN_PATH" install || die "Daemon setup failed. Is 'claude' installed and on PATH?"
}

build_menu_bar_app() {
    if ! command -v swift &>/dev/null; then
        warn "Swift not found — skipping menu bar app"
        return
    fi

    log "Building menu bar app..."
    bash "$SCRIPT_DIR/macos/CCLock/bundle.sh" --install
}

print_success() {
    echo
    log "cc-lock installed successfully."
    echo
    echo "  cc-lock status        # check daemon"
    echo "  cc-lock lock 2h       # lock for 2 hours"
    echo "  cc-lock unlock        # bypass challenge"
    echo "  cc-lock tui           # open dashboard"
    if command -v swift &>/dev/null; then
        echo
        echo "  Menu bar app:         open ~/Applications/CCLock.app"
        echo "  Auto-start on login:  System Settings → General → Login Items → add CCLock"
    fi
}

main() {
    echo "Installing cc-lock..."
    echo

    check_node
    check_pnpm
    build_packages
    link_cli
    setup_daemon
    build_menu_bar_app
    print_success
}

main
