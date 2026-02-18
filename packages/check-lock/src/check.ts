import { readFileSync } from "fs";
import { STATE_FILE } from "@cc-lock/core";
import type { LockState } from "@cc-lock/core";

/**
 * Quick lock check - used by the shim script.
 * Exit 0 = unlocked (can proceed), exit 1 = locked.
 */
function main() {
  try {
    const data = readFileSync(STATE_FILE, "utf-8");
    const state = JSON.parse(data) as LockState;

    if (state.status === "unlocked") {
      process.exit(0);
    }

    if (state.status === "grace") {
      if (state.graceExpiresAt) {
        const remaining = new Date(state.graceExpiresAt).getTime() - Date.now();
        if (remaining > 0) {
          process.exit(0); // Grace period active
        }
      }
    }

    // Locked
    if (state.expiresAt) {
      const remaining = new Date(state.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        process.exit(0); // Lock expired
      }
    }

    process.exit(1);
  } catch {
    // If state file doesn't exist or is unreadable, allow access
    process.exit(0);
  }
}

main();
