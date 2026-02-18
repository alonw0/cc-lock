import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  STATE_FILE,
  DEFAULT_GRACE_MINUTES,
  generateChallenges,
} from "@cc-lock/core";
import type { LockState, Challenge } from "@cc-lock/core";
import { shimManager } from "./shim-manager.js";
import { incrementBypassCount } from "./db.js";
import { notify } from "./notify.js";

const DEFAULT_STATE: LockState = {
  status: "unlocked",
  lockedAt: null,
  expiresAt: null,
  bypassAttempts: 0,
  graceExpiresAt: null,
  scheduleId: null,
};

// In-memory challenge store
const pendingChallenges = new Map<
  string,
  { challenges: Challenge[]; createdAt: number }
>();

class LockManager {
  private state: LockState;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = this.loadState();
    this.restoreTimers();
  }

  private loadState(): LockState {
    try {
      const data = readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data) as LockState;
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private saveState() {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  private restoreTimers() {
    const now = Date.now();

    if (this.state.status === "locked" && this.state.expiresAt) {
      const remaining = new Date(this.state.expiresAt).getTime() - now;
      if (remaining <= 0) {
        this.doUnlock();
      } else {
        // Re-install shim on daemon restart while locked
        shimManager.installShim();
        this.expiryTimer = setTimeout(() => this.doUnlock(), remaining);
      }
    }

    if (this.state.status === "grace" && this.state.graceExpiresAt) {
      const remaining = new Date(this.state.graceExpiresAt).getTime() - now;
      if (remaining <= 0) {
        this.endGrace();
      } else {
        this.graceTimer = setTimeout(() => this.endGrace(), remaining);
      }
    }
  }

  getState(): LockState {
    // Check for expiry inline
    const now = Date.now();
    if (this.state.status === "locked" && this.state.expiresAt) {
      if (new Date(this.state.expiresAt).getTime() <= now) {
        this.doUnlock();
      }
    }
    if (this.state.status === "grace" && this.state.graceExpiresAt) {
      if (new Date(this.state.graceExpiresAt).getTime() <= now) {
        this.endGrace();
      }
    }
    return { ...this.state };
  }

  lock(durationMinutes: number, scheduleId?: string): LockState {
    // Clear any existing timers (fresh lock always resets)
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (this.graceTimer) clearTimeout(this.graceTimer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);

    this.state = {
      status: "locked",
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      bypassAttempts: 0,
      graceExpiresAt: null,
      scheduleId: scheduleId ?? null,
    };

    this.saveState();

    // Install shim
    shimManager.installShim();

    // Set expiry timer
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(
      () => this.doUnlock(),
      durationMinutes * 60_000
    );

    return { ...this.state };
  }

  unlock(): { ok: boolean; state: LockState; error?: string } {
    if (this.state.status === "unlocked") {
      return { ok: true, state: this.state };
    }

    this.doUnlock();
    return { ok: true, state: { ...this.state } };
  }

  private doUnlock() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }

    this.state = { ...DEFAULT_STATE };
    this.saveState();
    shimManager.removeShim();
  }

  startBypass(): {
    challengeId: string;
    challenges: Challenge[];
  } {
    this.state.bypassAttempts++;
    this.saveState();

    const challenges = generateChallenges(this.state.bypassAttempts);
    const challengeId = `bypass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingChallenges.set(challengeId, {
      challenges,
      createdAt: Date.now(),
    });

    return { challengeId, challenges };
  }

  completeBypass(
    challengeId: string,
    _answer: string
  ): { ok: boolean; graceExpiresAt?: string; error?: string } {
    const pending = pendingChallenges.get(challengeId);
    if (!pending) {
      return { ok: false, error: "Invalid or expired challenge" };
    }
    pendingChallenges.delete(challengeId);

    // Record bypass
    const today = new Date().toISOString().slice(0, 10);
    incrementBypassCount(today);

    // Grant grace period
    const graceMs = DEFAULT_GRACE_MINUTES * 60_000;
    const graceExpiresAt = new Date(Date.now() + graceMs).toISOString();

    this.state.status = "grace";
    this.state.graceExpiresAt = graceExpiresAt;
    this.saveState();

    // Remove shim during grace
    shimManager.removeShim();

    // Set grace timer
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => this.endGrace(), graceMs);

    return { ok: true, graceExpiresAt };
  }

  private endGrace() {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }

    // If original lock hasn't expired, re-engage
    if (this.state.expiresAt) {
      const remaining = new Date(this.state.expiresAt).getTime() - Date.now();
      if (remaining > 0) {
        this.state.status = "locked";
        this.state.graceExpiresAt = null;
        this.saveState();
        shimManager.installShim();

        this.expiryTimer = setTimeout(() => this.doUnlock(), remaining);

        notify("cc-lock", "Grace period ended — Claude Code is locked again");
        return;
      }
    }

    // Lock has expired during grace, just unlock
    this.doUnlock();
  }

  /** For schedule evaluation: lock without resetting if already locked */
  lockForSchedule(scheduleId: string, endTime: Date, scheduleName?: string) {
    if (this.state.status !== "unlocked") return;

    const now = new Date();
    const durationMinutes = (endTime.getTime() - now.getTime()) / 60_000;
    if (durationMinutes <= 0) return;

    this.lock(durationMinutes, scheduleId);

    const timeStr = endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    notify(
      "cc-lock",
      scheduleName
        ? `Locked by "${scheduleName}" until ${timeStr}`
        : `Claude Code locked until ${timeStr}`
    );
  }
}

export const lockManager = new LockManager();
