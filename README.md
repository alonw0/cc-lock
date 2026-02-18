# cc-lock

Lock yourself out of the `claude` CLI. Think Cold Turkey / Screen Time, but for Claude Code.

```
        ___________
       / _________ \
      | |         | |
      | |         | |
  ____|_|_________|_|___
 |                      |
 |  ██████╗ ██████╗     |
 |  ██╔═══╝ ██╔═══╝     |
 |  ██║     ██║         |
 |  ██║     ██║         |
 |  ██████╗ ██████╗     |
 |  ╚═════╝ ╚═════╝     |
 |   L  O  C  K         |
 |______________________|
     |  O  O  O  O  |
     |______________|
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

Successful bypass grants a **15-minute grace window**, then the lock re-engages.

## Install

```bash
git clone <repo-url> && cd cc-lock
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

### Menu bar app

The menu bar app is built as a proper `.app` bundle with `LSUIElement` set (no Dock icon):

```bash
# Build CCLock.app into macos/CCLock/dist/
pnpm run bundle:menubar

# Build and install to ~/Applications/
pnpm run bundle:menubar:install
```

To launch at login: **System Settings → General → Login Items → add CCLock**.

## Usage

```bash
# Lock claude for a duration
cc-lock lock 2h
cc-lock lock 30m
cc-lock lock 1d

# Check status
cc-lock status

# Unlock (must complete bypass challenge)
cc-lock unlock

# Usage statistics
cc-lock stats
cc-lock stats --week
cc-lock stats --month

# Recurring schedules
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
| `graceMinutes` | integer (1–120) | `15` | How long the grace period lasts after a successful bypass before the lock re-engages |
| `chmodGuard` | boolean | `false` | Hard mode — removes write permission from the shim so it can't be trivially replaced |

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

Lock expires at: 18:43:24
Bypass attempts this period: 0

To bypass, run: cc-lock unlock
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
| `@cc-lock/cli` | Commander.js CLI with all commands |
| `@cc-lock/tui` | Ink/React interactive terminal dashboard |
| `@cc-lock/check-lock` | Minimal scripts invoked by the shim for lock checking and bypass |

## Supported installations

- **Standalone** (native binary): `~/.local/share/claude/versions/X.Y.Z`, symlinked from `~/.local/bin/claude`
- **npm global**: via `which claude`

macOS (arm64) only. Daemon managed via `launchd` (`KeepAlive` + `RunAtLoad`).

## Tech stack

| Component | Technology |
|-----------|-----------|
| Core/Daemon/CLI | TypeScript, Node.js 20+ |
| TUI | Ink (React for CLI) |
| Database | better-sqlite3 |
| IPC | Unix domain sockets |
| Build | tsup (esbuild) |
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
