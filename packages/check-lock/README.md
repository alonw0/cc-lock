# @cc-lock/check-lock

Minimal scripts invoked by the shell shim for [cc-lock](https://github.com/alonw0/cc-lock).

This is an internal package installed as a dependency of `@cc-lock/daemon`. It is not meant to be used directly. For documentation see:
**https://github.com/alonw0/cc-lock**

## Scripts

| Export | Purpose |
|--------|---------|
| `.` (`dist/check.js`) | Fast lock check — reads `~/.cc-lock/state.json` and exits 0 (unlocked) or 1 (locked) |
| `./bypass` (`dist/bypass.js`) | Interactive bypass flow invoked by the shim when the user tries to use `claude` while locked |

## License

MIT
