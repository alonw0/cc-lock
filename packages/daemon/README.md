# @cc-lock/daemon

Background daemon for [cc-lock](https://github.com/alonw0/cc-lock) — manages lock state, scheduling, usage tracking, and shim management.

This package is started automatically by `cc-lock install` and should not be used directly. For documentation see:
**https://github.com/alonw0/cc-lock**

## What it does

- Listens on a Unix domain socket (`/tmp/cc-lock.sock`) for IPC commands
- Manages the lock state machine (unlocked → locked → grace period)
- Evaluates recurring schedules (30-second polling)
- Tracks wall-clock Claude Code usage via process watching
- Swaps the `claude` binary with a shim when locked; restores it when unlocked
- Persists sessions and daily stats to SQLite (`~/.cc-lock/stats.db`)

## License

MIT
