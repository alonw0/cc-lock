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
  /** Days counted as "weekend" for weekends schedules (0=Sun…6=Sat). Defaults to [0,6]. */
  weekendDays?: number[];
  /** Allow free challenge-based bypass (default: true). Set to false to require payment bypass. */
  challengeBypassEnabled?: boolean;
  /** Enable payment bypass mode */
  paymentBypassEnabled?: boolean;
  /** Payment amount in cents (default: 500 = $5.00) */
  paymentBypassAmount?: number;
  /** URL to open for payment (Stripe link, Venmo, PayPal, etc.) */
  paymentBypassUrl?: string;
  /** Optional Stripe secret key (sk_...) for payment verification */
  paymentBypassStripeKey?: string;
  /** Kill running claude sessions when a lock is engaged (default: false) */
  killSessionsOnLock?: boolean;
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
  /** When true, bypass challenges are disabled — lock cannot be bypassed early */
  hardLock?: boolean;
  /** Resume keys of sessions killed at lock time; shown after unlock */
  pendingResumeKeys?: string[];
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
