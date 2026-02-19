#!/usr/bin/env bash
# cc-lock installer
# Fast path (npm):   curl -fsSL https://raw.githubusercontent.com/alonw0/cc-lock/main/install.sh | bash
# Build from source: clone repo, then bash install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

install_via_npm() {
    log "Installing cc-lock via npm..."
    npm install -g cc-lock
    log "Running cc-lock install..."
    cc-lock install || die "Daemon setup failed. Is 'claude' installed and on PATH?"
    print_success
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
    local bin_dir="$HOME/.local/bin"
    local bin_path="$bin_dir/cc-lock"
    local cli_script="$SCRIPT_DIR/packages/cli/dist/index.js"

    mkdir -p "$bin_dir"

    # Wrapper script — more robust than a bare symlink to a .js file
    cat > "$bin_path" <<EOF
#!/usr/bin/env bash
exec node "$cli_script" "\$@"
EOF
    chmod +x "$bin_path"
    log "Linked: $bin_path"

    if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
        echo
        warn "$bin_dir is not in your PATH."
        warn "Add this line to your shell profile (~/.zshrc or ~/.bashrc), then restart your shell:"
        warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo
    fi
}

setup_daemon() {
    log "Setting up daemon (requires claude to be installed)..."
    "$HOME/.local/bin/cc-lock" install || die "Daemon setup failed. Is 'claude' installed and on PATH?"
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

    # Fast path: if npm is available and cc-lock is published, use npm install
    if command -v npm &>/dev/null; then
        local npm_version
        npm_version=$(npm view cc-lock version 2>/dev/null || true)
        if [ -n "$npm_version" ]; then
            log "cc-lock $npm_version found on npm registry"
            install_via_npm
            return
        fi
    fi

    # Build from source (development / pre-release)
    log "Building from source..."
    check_pnpm
    build_packages
    link_cli
    setup_daemon
    build_menu_bar_app
    print_success
}

main
