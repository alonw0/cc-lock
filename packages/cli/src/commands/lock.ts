import { sendRequest, isDaemonRunning } from "../ipc-client.js";
import { parseDuration } from "../formatters.js";
import { installCommand } from "./install.js";
import type { LockResponse } from "@cc-lock/core";

export async function lockCommand(duration: string, options: { hard?: boolean } = {}) {
  const minutes = parseDuration(duration);
  if (minutes === null || minutes <= 0) {
    console.error(`Invalid duration: "${duration}". Examples: 30m, 2h, 1d`);
    process.exit(1);
  }

  if (!(await isDaemonRunning())) {
    console.log("Daemon not running — running first-time install...\n");
    await installCommand();
    console.log();
  }

  const res = (await sendRequest({
    type: "lock",
    durationMinutes: minutes,
    hardLock: options.hard ?? false,
  })) as LockResponse;

  if (res.ok) {
    if (options.hard) {
      console.log(`\x1b[31mHard locked!\x1b[0m Claude Code is locked for ${duration} with no bypass allowed.`);
    } else {
      console.log(`\x1b[31mLocked!\x1b[0m Claude Code is now locked for ${duration}.`);
    }
    if (res.lock.expiresAt) {
      const localTime = new Date(res.lock.expiresAt).toLocaleTimeString();
      console.log(`Expires at: ${localTime}`);
    }
  } else {
    console.error(`Failed to lock: ${res.error}`);
  }
}
