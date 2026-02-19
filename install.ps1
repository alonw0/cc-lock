# cc-lock Windows installer
# Usage: iex (iwr -useb https://raw.githubusercontent.com/alonw0/cc-lock/main/install.ps1).Content

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "▶ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠ $msg" -ForegroundColor Yellow }

Write-Host "Installing cc-lock..." -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Step "Checking Node.js..."
try {
    $nodeVersion = (node --version 2>&1).ToString().Trim()
    $major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
    if ($major -lt 20) {
        Write-Error "Node.js 20+ required (found $nodeVersion). Install from https://nodejs.org"
        exit 1
    }
    Write-Step "Node.js $nodeVersion"
} catch {
    Write-Error "Node.js is required (>=20). Install from https://nodejs.org"
    exit 1
}

# Check npm
Write-Step "Checking npm..."
try {
    $npmVersion = (npm --version 2>&1).ToString().Trim()
    Write-Step "npm $npmVersion"
} catch {
    Write-Error "npm is required. Please install Node.js from https://nodejs.org"
    exit 1
}

# Install cc-lock globally
Write-Step "Installing cc-lock via npm..."
npm install -g cc-lock
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed"
    exit 1
}

# Setup daemon (Task Scheduler + claude detection)
Write-Step "Setting up cc-lock daemon..."
cc-lock install
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Daemon setup had issues. Is 'claude' installed and on PATH?"
    Write-Warn "You can retry with: cc-lock install"
}

Write-Host ""
Write-Host "▶ cc-lock installed successfully." -ForegroundColor Green
Write-Host ""
Write-Host "  cc-lock status        # check daemon"
Write-Host "  cc-lock lock 2h       # lock for 2 hours"
Write-Host "  cc-lock unlock        # bypass challenge"
Write-Host "  cc-lock tui           # open dashboard"
Write-Host ""
