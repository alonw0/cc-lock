import type { LockState, DailyStats, Schedule, Config } from "@cc-lock/core";

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  if (hours < 24) return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days}d ${remainHours}h`;
}

export function formatTimeRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  return formatDuration(Math.round(remaining / 1000));
}

export function formatStatus(lock: LockState, todayUsageSeconds: number): string {
  const lines: string[] = [];

  switch (lock.status) {
    case "unlocked":
      lines.push("Status: \x1b[32m● UNLOCKED\x1b[0m");
      break;
    case "locked":
      if (lock.hardLock) {
        lines.push("Status: \x1b[31m● HARD LOCKED\x1b[0m (no bypass)");
      } else {
        lines.push("Status: \x1b[31m● LOCKED\x1b[0m");
      }
      if (lock.expiresAt) {
        lines.push(`Expires in: ${formatTimeRemaining(lock.expiresAt)}`);
      }
      if (!lock.hardLock) {
        lines.push(`Bypass attempts: ${lock.bypassAttempts}`);
      }
      break;
    case "grace":
      lines.push("Status: \x1b[33m● GRACE PERIOD\x1b[0m");
      if (lock.graceExpiresAt) {
        lines.push(`Grace expires in: ${formatTimeRemaining(lock.graceExpiresAt)}`);
      }
      break;
  }

  lines.push(`Today's usage: ${formatDuration(todayUsageSeconds)}`);
  return lines.join("\n");
}

export function formatStats(days: DailyStats[]): string {
  if (days.length === 0) return "No usage data for this period.";

  const lines: string[] = ["Date       | Usage    | Sessions | Bypasses", "-".repeat(50)];

  for (const day of days) {
    const usage = formatDuration(day.totalSeconds).padEnd(8);
    lines.push(
      `${day.date} | ${usage} | ${String(day.sessionCount).padEnd(8)} | ${day.bypassCount}`
    );
  }

  const totalSeconds = days.reduce((s, d) => s + d.totalSeconds, 0);
  const totalSessions = days.reduce((s, d) => s + d.sessionCount, 0);
  const totalBypasses = days.reduce((s, d) => s + d.bypassCount, 0);
  lines.push("-".repeat(50));
  lines.push(
    `Total      | ${formatDuration(totalSeconds).padEnd(8)} | ${String(totalSessions).padEnd(8)} | ${totalBypasses}`
  );

  return lines.join("\n");
}

export function formatSchedules(schedules: Schedule[]): string {
  if (schedules.length === 0) return "No schedules configured.";

  const lines: string[] = ["ID | Name | Type | Time | Enabled", "-".repeat(60)];

  for (const s of schedules) {
    const enabled = s.enabled ? "\x1b[32mYes\x1b[0m" : "\x1b[31mNo\x1b[0m";
    const days = s.days ? ` (${s.days.join(",")})` : "";
    lines.push(
      `${s.id.slice(0, 12)} | ${s.name.padEnd(12)} | ${(s.type + days).padEnd(16)} | ${s.startTime}-${s.endTime} | ${enabled}`
    );
  }

  return lines.join("\n");
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatConfig(config: Config): string {
  const weekendDays = (config.weekendDays ?? [0, 6])
    .map((d) => DAY_NAMES[d] ?? d)
    .join("+");
  return [
    `Installation: ${config.installationType}`,
    `Binary path: ${config.claudeBinaryPath}`,
    `Shim path: ${config.claudeShimPath}`,
    `chmod guard: ${config.chmodGuard ? "enabled" : "disabled"}`,
    `Grace period: ${config.graceMinutes} minutes`,
    `Weekend days: ${weekendDays}`,
  ].join("\n");
}

export function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)\s*(m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (!match) return null;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (unit.startsWith("m")) return value;
  if (unit.startsWith("h")) return value * 60;
  if (unit.startsWith("d")) return value * 1440;
  return null;
}
