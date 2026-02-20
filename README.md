# cc-lock

Lock yourself out of the `claude` CLI. Think Cold Turkey / Screen Time, but for Claude Code.

> Claude Code is addictive. You start a quick session, then suddenly it's midnight and you cancelled dinner with friends because you just had to ship one more feature. cc-lock gives you a hard stop — set a limit before you open it, and let it hold the line when you won't.

```
      ╭──────╮
      │      │
  ╔═══╧══════╧═══╗
  ║              ║
  ║  cc · lock   ║
  ║              ║
  ║  ○  ○  ○  ○  ║
  ╚══════════════╝
```

## How it works

cc-lock creates a "vault" that blocks the `claude` CLI for set durations or on recurring schedules. When a lock is active, it swaps the `claude` symlink with a shim script that blocks execution. When unlocked, the original symlink is restored — **zero overhead** during normal usage.

Unlocking requires completing escalating bypass challenges (typing strings backwards, solving math problems, waiting through cooldowns) to add friction against impulsive overrides.

### Lock mechanism

```
Lock engages   → daemon replaces ~/.local/bin/claude with a shim script
Lock expires   → daemon restores the original symlink
Daemon offline → original symlink stays, claude works normally
```

### Escalating bypass

Each unlock attempt during a lock period gets progressively harder:

| Attempt | Challenge |
|---------|-----------|
| 1 | Type a 30-char random string backwards |
| 2 | 60s cooldown, then type a 50-char string backwards |
| 3 | Solve 3 arithmetic problems |
| 4 | 120s cooldown, then write a 50-word justification |
| 5+ | 300s cooldown + 5 math problems + 80-char string backwards |

Successful bypass grants a **10-minute grace window** (configurable), then the lock re-engages.

### Payment bypass

Instead of solving a challenge, you can pay real money — to yourself (savings jar), a charity, or a friend — to get the grace period. The psychological cost of spending $5 makes you genuinely reconsider whether you really need to open Claude right now.

**No payment verification server needed.** You configure any payment URL (Stripe link, Venmo, PayPal, Ko-fi, etc.) and cc-lock opens it in your browser, enforces a mandatory 30-second wait, then asks for confirmation.

```bash
cc-lock config set paymentBypassEnabled true
cc-lock config set paymentBypassAmount 500       # $5.00 (cents)
cc-lock config set paymentBypassUrl "https://venmo.com/your-username"
```

When you run `cc-lock unlock`, you'll see:

```
Bypass Challenge
Attempt #1

How would you like to bypass?
  A) Complete a challenge (free)
  B) Pay $5.00 — opens browser for payment

Choice [A/B]:
```

Choosing **B** opens the payment URL, waits 30 seconds, then asks you to confirm. On confirmation, grace is granted — same as a successful challenge.

**Optional Stripe verification:** if you provide a Stripe secret key, cc-lock verifies the payment intent ID before granting access:

```bash
cc-lock config set paymentBypassStripeKey sk_live_xxx
```

With Stripe configured, Option B asks for the `pi_...` Payment Intent ID from your receipt email instead of the 30-second wait.

### Hard lock

Add `--hard` to disable all bypass options for the lock duration — no challenge, no grace period, no early exit:

```bash
cc-lock lock --hard 4h
```

When hard-locked, `cc-lock unlock` will refuse and the shim shows "Hard lock is active — bypass is not allowed." The only way out is waiting for the lock to expire.

## Install

### npm (recommended)

```bash
npm install -g cc-lock
cc-lock install
```

### curl (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/alonw0/cc-lock/main/install.sh | bash
```

### PowerShell (Windows)

```powershell
iex (iwr -useb https://raw.githubusercontent.com/alonw0/cc-lock/main/install.ps1).Content
```

### Build from source

```bash
git clone https://github.com/alonw0/cc-lock.git && cd cc-lock
bash install.sh
```

`install.sh` will:
1. Check Node.js 20+ and pnpm (installs pnpm if missing)
2. Build all TypeScript packages
3. Link `cc-lock` into `~/.local/bin/`
4. Auto-detect your Claude Code installation and start the daemon (persisted via launchd)
5. Build and install `CCLock.app` to `~/Applications/` if Swift is available

**Prerequisites:** Node.js 20+, `claude` CLI installed. Swift 5.9+ optional (for menu bar app).

**PATH:** If `~/.local/bin` isn't on your PATH, the script will tell you what to add to your shell profile.

### macOS menu bar app

The menu bar app is built as a proper `.app` bundle with `LSUIElement` set (no Dock icon):

```bash
# Build CCLock.app into macos/CCLock/dist/
pnpm run bundle:menubar

# Build and install to ~/Applications/
pnpm run bundle:menubar:install

# Create a distributable unsigned DMG
pnpm run bundle:menubar:dmg

# Codesign + notarize + staple for public distribution (requires Developer ID cert)
pnpm run bundle:menubar:sign
```

To launch at login: **System Settings → General → Login Items → add CCLock**.

### Windows system tray app

An Electron-based system tray app with feature parity to the macOS menu bar:
- Tray icon changes with lock state (green/red/yellow/gray padlock)
- Click the tray icon to open a popup with live status and countdown
- Quick-lock presets (30m / 1h / 2h / 4h), schedule toggles, usage stats
- "Start on login" checkbox (uses `app.setLoginItemSettings`)
- "Start Daemon" button when daemon is not running

```bash
# Cross-compile for Windows from macOS (no Wine needed for NSIS/portable targets)
pnpm run package:windows-tray
# → windows/CCLock/release/CCLock Setup 1.0.0.exe  (NSIS installer)
# → windows/CCLock/release/CCLock 1.0.0.exe        (portable .exe)
```

## Usage

```bash
# Lock claude for a duration
cc-lock lock 2h
cc-lock lock 30m
cc-lock lock 1d

# Hard lock — no bypass allowed until it expires
cc-lock lock --hard 2h

# Check status
cc-lock status

# Unlock (must complete bypass challenge)
cc-lock unlock

# Usage statistics
cc-lock stats
cc-lock stats --week
cc-lock stats --month

# Reset usage stats
cc-lock stats reset          # reset today's usage only
cc-lock stats reset --all    # reset all historical data

# Recurring schedules (5-minute system notification fires before each lock)
cc-lock schedule add        # interactive
cc-lock schedule list
cc-lock schedule remove <id>

# Configuration
cc-lock config get
cc-lock config set graceMinutes 10
cc-lock config set chmodGuard true

# Interactive TUI dashboard
cc-lock tui

# Uninstall (blocked while locked)
cc-lock uninstall
```

### Configuration options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `graceMinutes` | integer (1–120) | `10` | How long the grace period lasts after a successful bypass before the lock re-engages |
| `chmodGuard` | boolean | `false` | Removes write permission from the shim so it can't be trivially replaced |
| `weekendDays` | `sat-sun` \| `fri-sat` \| `0,6` | `sat-sun` | Which days count as "weekend" for weekend-type schedules |
| `challengeBypassEnabled` | boolean | `true` | Allow free challenge-based bypass. Set to `false` to require payment (or block bypass entirely if no payment method is configured) |
| `paymentBypassEnabled` | boolean | `false` | Enable pay-to-bypass mode as an alternative to challenges |
| `paymentBypassAmount` | integer (cents) | `500` | Amount to pay in cents ($5.00 = 500) |
| `paymentBypassUrl` | string | — | Payment URL to open (Stripe link, Venmo, PayPal, Ko-fi…) |
| `paymentBypassStripeKey` | string | — | Stripe secret key (`sk_...`) for payment intent verification |

Read-only fields (set by `cc-lock install`, not editable directly):

| Key | Description |
|-----|-------------|
| `installationType` | `standalone` or `npm` |
| `claudeBinaryPath` | Path to the real `claude` binary |
| `claudeShimPath` | Path being managed (replaced with shim when locked) |

### What it looks like when locked

```
$ claude

🔒 Claude Code is locked by cc-lock

  The shim script has more self-control than you do.

Lock expires at: 18:43:24
Bypass attempts this period: 0

To bypass, run: cc-lock unlock
```

With `--hard`:

```
$ claude

🔒 Claude Code is locked by cc-lock

  Your future self is sighing right now.

Lock expires at: 18:43:24
Hard lock is active — bypass is not allowed.
Wait for the lock to expire.
```

### TUI Dashboard

Launch with `cc-lock tui` for an interactive terminal dashboard with:
- Real-time lock status with countdown timer
- Quick-lock presets (30m / 1h / 2h / 4h)
- Usage bar charts by day/week/month
- Schedule viewer
- Settings overview

The padlock logo changes color with state: **green** = unlocked, **red** = locked, **yellow** = grace period.

## Architecture

```
┌─────────────┐  ┌─────────────┐
│  cc-lock CLI │  │ cc-lock TUI │
│  (Commander) │  │ (Ink/React) │
└──────┬───────┘  └──────┬──────┘
       │                 │
       └── Unix Domain Socket ──┐
            /tmp/cc-lock.sock   │
                    │           │
         ┌──────────▼──────────┐
         │   cc-lock daemon    │
         │   (Node.js)         │
         │                     │
         │ - Lock state machine│
         │ - Schedule evaluator│
         │ - Usage tracker     │
         │ - Version watcher   │
         │ - Shim manager      │
         └───┬───────────┬─────┘
             │           │
        ┌────▼───┐  ┌───▼──────────┐
        │ SQLite │  │ Shim script  │
        │ (stats)│  │ (enforcement)│
        └────────┘  └──────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| `@cc-lock/core` | Shared types, IPC protocol, constants, challenge generators |
| `@cc-lock/daemon` | Background service — socket server, lock state machine, shim manager, schedule evaluator, usage tracker, version watcher |
| `cc-lock` | Commander.js CLI with all commands |
| `@cc-lock/tui` | Ink/React interactive terminal dashboard |
| `@cc-lock/check-lock` | Minimal scripts invoked by the shim for lock checking and bypass |
| `@cc-lock/windows-tray` | Electron system tray app for Windows |

## Supported installations

- **Standalone** (native binary): `~/.local/share/claude/versions/X.Y.Z`, symlinked from `~/.local/bin/claude`
- **npm global**: via `which claude` (Unix) or `where claude` (Windows)

| Platform | Daemon persistence | Shim format |
|----------|--------------------|-------------|
| macOS | launchd (`KeepAlive` + `RunAtLoad`) | bash script |
| Linux | detached process | bash script |
| Windows | Task Scheduler (`/sc onlogon`) | `.cmd` file |

## Tech stack

| Component | Technology |
|-----------|-----------|
| Core/Daemon/CLI | TypeScript, Node.js 20+ |
| TUI | Ink (React for CLI) |
| macOS menu bar | Swift 5.9 + SwiftUI |
| Windows tray | Electron 33 |
| Database | better-sqlite3 |
| IPC | Unix domain sockets (macOS/Linux), named pipes (Windows) |
| Build | tsup (esbuild) + electron-builder |
| Tests | vitest |
| Monorepo | pnpm workspaces |
| File watching | chokidar |
| CLI framework | Commander.js |

## Data

All data lives in `~/.cc-lock/`:

| File | Purpose |
|------|---------|
| `config.json` | Installation type, binary paths, settings |
| `state.json` | Current lock state (read by shim) |
| `stats.db` | SQLite database with session and daily usage stats |
| `daemon.pid` | Daemon process ID |
| `daemon.log` | Daemon stdout log |

## License

MIT
