# @cc-lock/core

Shared types, IPC protocol definitions, and challenge generators for [cc-lock](https://github.com/alonw0/cc-lock).

This is an internal package. For usage and documentation see the main repository:
**https://github.com/alonw0/cc-lock**

## Contents

- `LockState`, `Config`, `Schedule`, `DailyStats`, `Challenge` — core data types
- Full IPC request/response type union (`Request` / `Response`) for the daemon socket protocol
- `SOCKET_PATH` and other shared constants
- `generateChallenges()` — escalating bypass challenge generator

## License

MIT
