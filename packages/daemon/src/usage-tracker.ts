import { execSync } from "child_process";
import { PROCESS_POLL_INTERVAL_MS } from "@cc-lock/core";
import {
  recordSessionStart,
  recordSessionEnd,
  updateDailyStats,
  getActiveSessions,
} from "./db.js";

// Track PIDs we're monitoring
const trackedPids = new Map<number, { sessionId: number; startedAt: Date }>();

let pollInterval: ReturnType<typeof setInterval> | null = null;

function getClaudePids(): number[] {
  try {
    // Match only the actual claude binary process, not daemons/scripts/editors
    // pgrep -x matches the exact process name "claude"
    const output = execSync("pgrep -x claude 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));
  } catch {
    return [];
  }
}

function pollSessions() {
  const currentPids = new Set(getClaudePids());
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Detect new sessions
  for (const pid of currentPids) {
    if (!trackedPids.has(pid)) {
      const sessionId = recordSessionStart();
      trackedPids.set(pid, { sessionId, startedAt: now });
    }
  }

  // Detect ended sessions
  for (const [pid, info] of trackedPids) {
    if (!currentPids.has(pid)) {
      const durationSeconds = Math.round(
        (now.getTime() - info.startedAt.getTime()) / 1000
      );
      recordSessionEnd(info.sessionId);
      if (durationSeconds > 0) {
        updateDailyStats(today, durationSeconds);
      }
      trackedPids.delete(pid);
    }
  }
}

export function startUsageTracker() {
  // Clean up any stale active sessions from before
  const stale = getActiveSessions();
  for (const session of stale) {
    recordSessionEnd(session.id);
  }

  pollSessions();
  pollInterval = setInterval(pollSessions, PROCESS_POLL_INTERVAL_MS);
}

export function stopUsageTracker() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // End all tracked sessions
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (const [pid, info] of trackedPids) {
    const durationSeconds = Math.round(
      (now.getTime() - info.startedAt.getTime()) / 1000
    );
    recordSessionEnd(info.sessionId);
    if (durationSeconds > 0) {
      updateDailyStats(today, durationSeconds);
    }
    trackedPids.delete(pid);
  }
}
