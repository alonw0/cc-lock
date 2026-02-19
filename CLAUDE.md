# cc-lock

A productivity tool that locks you out of Claude Code CLI. Zero runtime overhead when unlocked — enforces locks by swapping the `claude` binary with a shim script.

## Architecture

```
CLI / TUI / macOS Menu Bar / Windows Tray
        │
  Unix domain socket (/tmp/cc-lock.sock)  [macOS/Linux]
  Named pipe (\\.\pipe\cc-lock)           [Windows]
  Newline-delimited JSON
        │
    Daemon (Node.js)
    ├── Lock state machine (unlocked → locked → grace; hard-lock skips grace)
    ├── Shim manager (swaps ~/.local/bin/claude symlink ↔ bash shim)
    ├── Schedule evaluator (30s polling) + 5-min warning notifications
    ├── Usage tracker (wall-clock: single session while ≥1 claude process runs)
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
| `@cc-lock/windows-tray` | `windows/CCLock` | Electron system tray app for Windows — feature-parity with macOS menu bar |

## Build & Dev

```bash
pnpm install                  # install dependencies
pnpm build                    # build all TS packages (tsup)
pnpm dev                      # watch mode, all packages in parallel
pnpm clean                    # clean dist dirs
pnpm test                     # run daemon test suite (vitest, 61 tests)

# macOS menu bar app (Swift)
pnpm run build:menubar        # swift build -c release
pnpm run bundle:menubar       # build CCLock.app bundle
pnpm run bundle:menubar:install  # build + copy to ~/Applications/
pnpm run bundle:menubar:dmg   # build unsigned DMG (bundle.sh --dmg)
pnpm run bundle:menubar:sign  # codesign + notarize + staple DMG (bundle.sh --sign)

# Windows tray app (Electron)
pnpm run build:windows-tray   # tsc compile
pnpm run package:windows-tray # electron-builder --win --x64 (cross-compiles from macOS)
```

Swift app (direct):
```bash
cd macos/CCLock
swift build                   # debug build
swift build -c release        # release build
swift run                     # run for development
```

Windows tray app (direct):
```bash
cd windows/CCLock
pnpm install
pnpm build                    # tsc + copies index.html to dist/renderer/
pnpm start                    # electron . (runs on macOS for development)
pnpm package                  # electron-builder --win --x64 → release/*.exe
pnpm generate-icons           # regenerate 32x32 PNG tray icons from code
```

## Tech Stack

- **TypeScript** (all Node packages), built with **tsup** (esbuild), ESM output
- **pnpm workspaces** for monorepo management
- **better-sqlite3** for stats persistence in daemon
- **Commander.js** for CLI
- **Ink** (React 18 for terminals) for TUI
- **SwiftUI** (Swift 5.9, macOS 13+) for macOS menu bar app
- **Electron** (v33) for Windows system tray app (CommonJS module format)
- **electron-builder** for cross-compiling Windows `.exe` from macOS
- **vitest** (v2.1) for daemon unit tests
- **Node.js 20+** required

## Key Files

- `packages/core/src/protocol.ts` — IPC request/response type definitions (source of truth)
- `packages/core/src/types.ts` — Data types: `LockState`, `Config`, `Schedule`, `DailyStats`, `Challenge`
- `packages/core/src/constants.ts` — Paths: socket path (Unix/named pipe), state/config in `~/.cc-lock/`
- `packages/daemon/src/index.ts` — Daemon entry point (socket server, signal handlers)
- `packages/daemon/src/lock-manager.ts` — Lock state machine with timers; `hardLock` flag blocks bypass
- `packages/daemon/src/shim-manager.ts` — Binary swap logic + optional chmod guard
- `packages/daemon/src/schedule-eval.ts` — Schedule evaluator; exports `checkScheduleAt` (pure, testable)
- `packages/daemon/src/usage-tracker.ts` — Wall-clock usage tracking (single session while ≥1 claude runs)
- `packages/daemon/tests/` — vitest test suite (schedule, db, lock-manager — 61 tests)
- `packages/cli/src/ipc-client.ts` — Reference IPC client (Node.js `net.createConnection`)
- `macos/CCLock/Sources/CCLock/DaemonClient.swift` — Swift IPC client (NWConnection, async/await)
- `macos/CCLock/bundle.sh` — Build script: `--install`, `--dmg` (unsigned), `--sign` (notarize)
- `windows/CCLock/src/main.ts` — Electron main: tray, popup window, polling loop, IPC handlers
- `windows/CCLock/src/preload.ts` — contextBridge API exposed to renderer
- `windows/CCLock/scripts/generate-icons.js` — Software rasterizer generating 32×32 PNG tray icons

## IPC Protocol

All clients communicate over a socket — Unix domain socket at `/tmp/cc-lock.sock` (macOS/Linux) or named pipe `\\.\pipe\cc-lock` (Windows). Protocol is newline-delimited JSON — send a request object followed by `\n`, receive a response object followed by `\n`.

Request types: `status`, `lock`, `unlock`, `bypass-start`, `bypass-complete`, `schedule-add`, `schedule-list`, `schedule-remove`, `schedule-toggle`, `stats`, `stats-reset`, `config-get`, `config-set`, `install`, `uninstall`.

When adding a new client or modifying the protocol, update `packages/core/src/protocol.ts` first, then update all clients (CLI, TUI, Swift menu bar, Windows tray).

## Data Storage

All in `~/.cc-lock/`:
- `state.json` — current lock state (read by shim for fast ~10ms checks)
- `config.json` — installation config (binary paths, chmod guard, grace minutes)
- `stats.db` — SQLite database (sessions, daily_stats, schedules tables)
- `daemon.pid` — PID file
- Daemon launchd plist: `~/Library/LaunchAgents/com.cc-lock.daemon.plist`

## Testing

### Unit tests (vitest)

```bash
pnpm test                    # run all 61 daemon tests
cd packages/daemon && pnpm test:watch   # watch mode
```

Three test files in `packages/daemon/tests/`:
- `schedule.test.ts` — `checkScheduleAt` pure function (25 tests): daily/weekdays/weekends/custom types, boundary conditions, custom weekendDays config, overnight limitation
- `db.test.ts` — SQLite functions with in-memory DB (17 tests): upsert accumulation, in-progress session counting, `resetStats(false/true)`, period queries
- `lock-manager.test.ts` — State machine with mocked shimManager/notify/db (19 tests): lock/unlock transitions, hardLock bypass blocking, `lockForSchedule` idempotency, timer expiry via fake timers

### Integration tests (manual)

Start the daemon, then verify with CLI:
```bash
node packages/daemon/dist/index.js &   # or: cc-lock install
cc-lock status                          # check connection
cc-lock lock 1m                         # test locking
cc-lock status                          # should show locked
cc-lock unlock                          # bypass challenge flow
cc-lock lock --hard 1m                  # test hard lock (no bypass)
cc-lock unlock                          # should be refused with error

# Stats reset
cc-lock stats reset                     # reset today's usage
cc-lock stats reset --all               # reset all history

# Test payment bypass
cc-lock config set paymentBypassEnabled true
cc-lock config set paymentBypassAmount 500        # $5.00
cc-lock config set paymentBypassUrl "https://venmo.com/your-username"
cc-lock lock 5m
cc-lock unlock
# Expected: "Option A: challenge  Option B: Pay $5.00"
# Option B: browser opens, 30s countdown, confirm prompt, grace granted
# Option A: existing challenge flow unchanged

# Optional: test Stripe verification
cc-lock config set paymentBypassStripeKey sk_test_xxx
cc-lock unlock
# Expected: Option B asks for pi_... ID after browser opens
```

## Conventions

- All TypeScript packages use ESM (`"type": "module"`) **except** `windows/CCLock` which uses CommonJS (`"module": "CommonJS"` in tsconfig) to avoid Electron interop issues
- Codable Swift structs in `macos/CCLock/Sources/CCLock/Models.swift` must stay in sync with `packages/core/src/types.ts` and `protocol.ts`
- The daemon is the single source of truth for lock state — clients are read-only viewers that send commands
- Lock enforcement is via binary replacement, not process killing — the shim checks `state.json` directly for speed
- Usage tracking uses **wall-clock time**: one session starts when any `claude` process appears and ends when all are gone — concurrent processes do not multiply time
- Schedule notifications fire once per day per schedule (keyed by `scheduleId → YYYY-MM-DD` in a module-level Map); 5-minute warning window
- When adding new IPC request types: update `protocol.ts` → daemon `handlers.ts` → CLI → TUI → Swift client → Windows Electron client
