export type InstallationType = "standalone" | "npm";

export interface Config {
  installationType: InstallationType;
  /** The real claude binary/symlink target path */
  claudeBinaryPath: string;
  /** The path we manage (replace with shim or restore) */
  claudeShimPath: string;
  /** Enable chmod guard for hard mode */
  chmodGuard: boolean;
  /** Grace period in minutes after successful bypass */
  graceMinutes: number;
}

export type LockStatus = "unlocked" | "locked" | "grace";

export interface LockState {
  status: LockStatus;
  /** ISO timestamp when current lock started */
  lockedAt: string | null;
  /** ISO timestamp when current lock expires */
  expiresAt: string | null;
  /** Number of bypass attempts in current lock period */
  bypassAttempts: number;
  /** ISO timestamp of grace period expiry (after successful bypass) */
  graceExpiresAt: string | null;
  /** ID of the schedule that triggered this lock, if any */
  scheduleId: string | null;
}

export interface Schedule {
  id: string;
  name: string;
  /** Cron-style or simple schedule definition */
  type: "daily" | "weekdays" | "weekends" | "custom";
  /** Start time in HH:MM format */
  startTime: string;
  /** End time in HH:MM format */
  endTime: string;
  /** Days of week (0=Sun, 6=Sat) for custom type */
  days?: number[];
  enabled: boolean;
}

export interface SessionRecord {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

export interface DailyStats {
  date: string;
  totalSeconds: number;
  sessionCount: number;
  bypassCount: number;
}

export type ChallengeType = "typing" | "cooldown" | "math" | "justification";

export interface Challenge {
  type: ChallengeType;
  /** For typing: the string to type. For math: the problem text. */
  prompt: string;
  /** For math: the expected answer */
  answer?: string;
  /** Cooldown in seconds to wait before challenge */
  cooldownSeconds: number;
}
