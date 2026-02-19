import { execSync } from "child_process";
import { PROCESS_POLL_INTERVAL_MS } from "@cc-lock/core";
import {
  recordSessionStart,
  recordSessionEnd,
  updateDailyStats,
  getActiveSessions,
} from "./db.js";

// Wall-clock tracking: one session covers any period where ≥1 claude process
// is running. Multiple simultaneous claude instances (servers, projects) don't
// each add their own time — only wall-clock elapsed time is recorded.
let currentSessionId: number | null = null;
let currentSessionStart: Date | null = null;

let pollInterval: ReturnType<typeof setInterval> | null = null;

function getClaudePids(): number[] {
  if (process.platform === "win32") {
    try {
      const output = execSync(
        'tasklist /fi "IMAGENAME eq claude.exe" /nh /fo csv 2>nul',
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (!output) return [];
      return output
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => parseInt(line.split(",")[1]?.replace(/"/g, "") ?? "", 10))
        .filter((n) => !isNaN(n));
    } catch {
      return [];
    }
  }

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
  const hasActive = getClaudePids().length > 0;
  const now = new Date();

  if (hasActive && currentSessionId === null) {
    // First claude process appeared — start a wall-clock session
    currentSessionId = recordSessionStart();
    currentSessionStart = now;
  } else if (!hasActive && currentSessionId !== null) {
    // Last claude process gone — end the session
    const durationSeconds = Math.min(
      Math.round((now.getTime() - currentSessionStart!.getTime()) / 1000),
      24 * 3600
    );
    const startDate = currentSessionStart!.toISOString().slice(0, 10);
    recordSessionEnd(currentSessionId);
    if (durationSeconds > 0) {
      updateDailyStats(startDate, durationSeconds);
    }
    currentSessionId = null;
    currentSessionStart = null;
  }
}

export function startUsageTracker() {
  // Clean up any stale active sessions from before, crediting their elapsed time
  const stale = getActiveSessions();
  const now = new Date();
  for (const session of stale) {
    const startedAt = new Date(session.startedAt);
    const durationSeconds = Math.min(
      Math.round((now.getTime() - startedAt.getTime()) / 1000),
      24 * 3600 // cap at 24h to guard against phantom stale sessions
    );
    recordSessionEnd(session.id);
    if (durationSeconds > 0) {
      updateDailyStats(startedAt.toISOString().slice(0, 10), durationSeconds);
    }
  }

  pollSessions();
  pollInterval = setInterval(pollSessions, PROCESS_POLL_INTERVAL_MS);
}

export function stopUsageTracker() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // End the current wall-clock session on daemon shutdown
  if (currentSessionId !== null) {
    const now = new Date();
    const durationSeconds = Math.min(
      Math.round((now.getTime() - currentSessionStart!.getTime()) / 1000),
      24 * 3600
    );
    const startDate = currentSessionStart!.toISOString().slice(0, 10);
    recordSessionEnd(currentSessionId);
    if (durationSeconds > 0) {
      updateDailyStats(startDate, durationSeconds);
    }
    currentSessionId = null;
    currentSessionStart = null;
  }
}
