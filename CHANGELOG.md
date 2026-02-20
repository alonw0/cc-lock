# Changelog

## 0.2.0

### New features

- **TUI redesign** — Cleaner padlock logo with box-drawing characters; open shackle (unlocked) vs closed shackle (locked) is now visually distinct. "YOU ARE AN ADDICT" ASCII banner in the Claude Code block-letter style displays on TUI launch.
- **Dynamic taglines** — Per-state tagline below the padlock: "I can stop whenever I want." (unlocked), "you locked yourself. good." (locked), "enjoy your grace period." (grace).
- **Discouraging messages in shim** — When you try to run `claude` while locked, the shim now shows a random discouraging message (from a pool of 27) alongside the lock notice.
- **Paste-blocked bypass challenges** — The typing, math, and justification challenges now use raw-mode input that detects and rejects terminal paste events, forcing you to physically type every character.

### Changes

- **Default grace period increased** — New installs default to 10 minutes (was 5). Existing configs are not affected.

### Fixes

- **TUI re-render fix** — Eliminated unnecessary re-renders caused by polling: state updates now use ref-based comparison so `setState` is only called when daemon data actually changes. `CountdownTimer` no longer runs its own 1-second interval.

## 0.1.0

Initial public release.
