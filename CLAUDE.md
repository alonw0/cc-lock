# cc-lock

A productivity tool that locks you out of Claude Code CLI. Zero runtime overhead when unlocked — enforces locks by swapping the `claude` binary with a shim script.

## Architecture

```
CLI / TUI / macOS Menu Bar
        │
  Unix domain socket (/tmp/cc-lock.sock)
  Newline-delimited JSON
        │
    Daemon (Node.js)
    ├── Lock state machine (unlocked → locked → grace)
    ├── Shim manager (swaps ~/.local/bin/claude symlink ↔ bash shim)
    ├── Schedule evaluator (30s polling)
    ├── Usage tracker (pgrep claude, 10s polling)
    └── SQLite stats (sessions, daily aggregates)
```

## Monorepo Layout

| Package | Path | Description |
|---------|------|-------------|
| `@cc-lock/core` | `packages/core` | Shared types, IPC protocol, constants, challenge generators |
| `@cc-lock/daemon` | `packages/daemon` | Background daemon — socket server, lock state, shim management, scheduling, usage tracking |
| `@cc-lock/cli` | `packages/cli` | Commander.js CLI (`cc-lock lock`, `unlock`, `status`, `stats`, `schedule`, `install`) |
| `@cc-lock/tui` | `packages/tui` | Ink/React terminal dashboard with tabs: Dashboard, Stats, Schedules, Settings |
| `@cc-lock/check-lock` | `packages/check-lock` | Minimal scripts invoked by the shim for lock checking and bypass |
| CCLock (Swift) | `macos/CCLock` | SwiftUI menu bar app (macOS 13+), polls daemon for status |

## Build & Dev

```bash
pnpm install                  # install dependencies
pnpm build                    # build all TS packages (tsup)
pnpm dev                      # watch mode, all packages in parallel
pnpm clean                    # clean dist dirs
pnpm run build:menubar        # build macOS menu bar app (swift build -c release)
```

Swift app:
```bash
cd macos/CCLock
swift build                   # debug build
swift build -c release        # release build
swift run                     # run for development
```

## Tech Stack

- **TypeScript** (all Node packages), built with **tsup** (esbuild), ESM output
- **pnpm workspaces** for monorepo management
- **better-sqlite3** for stats persistence in daemon
- **Commander.js** for CLI
- **Ink** (React 18 for terminals) for TUI
- **SwiftUI** (Swift 5.9, macOS 13+) for menu bar app
- **Node.js 20+** required

## Key Files

- `packages/core/src/protocol.ts` — IPC request/response type definitions (source of truth)
- `packages/core/src/types.ts` — Data types: `LockState`, `Config`, `Schedule`, `DailyStats`, `Challenge`
- `packages/core/src/constants.ts` — Paths: socket at `/tmp/cc-lock.sock`, state/config in `~/.cc-lock/`
- `packages/daemon/src/index.ts` — Daemon entry point (socket server, signal handlers)
- `packages/daemon/src/lock-manager.ts` — Lock state machine with timers
- `packages/daemon/src/shim-manager.ts` — Binary swap logic + optional chmod guard
- `packages/cli/src/ipc-client.ts` — Reference IPC client (Node.js `net.createConnection`)
- `macos/CCLock/Sources/CCLock/DaemonClient.swift` — Swift IPC client (NWConnection, async/await)

## IPC Protocol

All clients communicate over Unix domain socket at `/tmp/cc-lock.sock`. Protocol is newline-delimited JSON — send a request object followed by `\n`, receive a response object followed by `\n`.

Request types: `status`, `lock`, `unlock`, `bypass-start`, `bypass-complete`, `schedule-add`, `schedule-list`, `schedule-remove`, `schedule-toggle`, `stats`, `config-get`, `config-set`, `install`, `uninstall`.

When adding a new client or modifying the protocol, update `packages/core/src/protocol.ts` first, then update all clients (CLI, TUI, Swift menu bar).

## Data Storage

All in `~/.cc-lock/`:
- `state.json` — current lock state (read by shim for fast ~10ms checks)
- `config.json` — installation config (binary paths, chmod guard, grace minutes)
- `stats.db` — SQLite database (sessions, daily_stats, schedules tables)
- `daemon.pid` — PID file
- Daemon launchd plist: `~/Library/LaunchAgents/com.cc-lock.daemon.plist`

## Testing

Start the daemon, then verify with CLI:
```bash
node packages/daemon/dist/index.js &   # or: cc-lock install
cc-lock status                          # check connection
cc-lock lock 1m                         # test locking
cc-lock status                          # should show locked
cc-lock unlock                          # bypass challenge flow
```

No unit test framework is set up yet.

## Conventions

- All TypeScript packages use ESM (`"type": "module"`)
- Codable Swift structs in `macos/CCLock/Sources/CCLock/Models.swift` must stay in sync with `packages/core/src/types.ts` and `protocol.ts`
- The daemon is the single source of truth for lock state — clients are read-only viewers that send commands
- Lock enforcement is via binary replacement, not process killing — the shim checks `state.json` directly for speed
