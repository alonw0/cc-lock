import { homedir } from "os";
import { join } from "path";

export const CC_LOCK_DIR = join(homedir(), ".cc-lock");
export const STATE_FILE = join(CC_LOCK_DIR, "state.json");
export const CONFIG_FILE = join(CC_LOCK_DIR, "config.json");
export const DB_FILE = join(CC_LOCK_DIR, "stats.db");
export const SOCKET_PATH =
  process.platform === "win32" ? "\\\\.\\pipe\\cc-lock" : "/tmp/cc-lock.sock";
export const PID_FILE = join(CC_LOCK_DIR, "daemon.pid");

export const CLAUDE_STANDALONE_BIN = join(homedir(), ".local", "bin", "claude");
export const CLAUDE_STANDALONE_VERSIONS_DIR = join(
  homedir(),
  ".local",
  "share",
  "claude",
  "versions"
);

export const LAUNCHD_PLIST_PATH = join(
  homedir(),
  "Library",
  "LaunchAgents",
  "com.cc-lock.daemon.plist"
);
export const LAUNCHD_LABEL = "com.cc-lock.daemon";
export const TASK_SCHEDULER_NAME = "cc-lock-daemon";

export const DEFAULT_GRACE_MINUTES = 5;
export const BYPASS_COOLDOWNS = [0, 60, 0, 120, 300]; // seconds per attempt
export const PROCESS_POLL_INTERVAL_MS = 10_000;
export const VERSION_WATCH_DEBOUNCE_MS = 2_000;
