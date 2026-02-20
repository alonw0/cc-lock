import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { dirname } from "path";
import https from "https";
import {
  STATE_FILE,
  DEFAULT_GRACE_MINUTES,
  generateChallenges,
} from "@cc-lock/core";
import type { LockState, Challenge } from "@cc-lock/core";
import { shimManager } from "./shim-manager.js";
import { incrementBypassCount } from "./db.js";
import { notify } from "./notify.js";
import { getClaudePids } from "./usage-tracker.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function collectAndKillSessions(): Promise<string[]> {
  const pids = getClaudePids();
  const keys: string[] = [];

  for (const pid of pids) {
    let uuid: string | null = null;

    // Try --resume <uuid> in command-line args first
    try {
      const args = execSync(`ps -p ${pid} -o args=`, {
        encoding: "utf-8",
        timeout: 3000,
      }).trim();
      const m = args.match(/--resume\s+([0-9a-f-]+)/);
      if (m && UUID_RE.test(m[1]!)) {
        uuid = m[1]!;
      }
    } catch {
      // process may have exited
    }

    // Fall back to lsof on non-Windows
    if (!uuid && process.platform !== "win32") {
      try {
        const lsofOut = execSync(`lsof -p ${pid} -Fn 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 5000,
        });
        for (const line of lsofOut.split("\n")) {
          const m = line.match(/\.claude\/debug\/([0-9a-f-]+)\.txt$/);
          if (m && UUID_RE.test(m[1]!)) {
            uuid = m[1]!;
            break;
          }
        }
      } catch {
        // lsof not available or process gone
      }
    }

    if (uuid && !keys.includes(uuid)) {
      keys.push(uuid);
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // process may have already exited
    }
  }

  return keys;
}

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

  lock(durationMinutes: number, scheduleId?: string, hardLock?: boolean): LockState {
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
      hardLock: hardLock ?? false,
    };

    this.saveState();

    // Install shim
    shimManager.installShim();

    // Kill running sessions if enabled
    const cfg = shimManager.getConfig();
    if (cfg?.killSessionsOnLock) {
      void collectAndKillSessions().then((keys) => {
        if (keys.length) {
          this.state.pendingResumeKeys = keys;
          this.saveState();
        }
      });
    }

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

    const keysToKeep = this.state.pendingResumeKeys;
    this.state = { ...DEFAULT_STATE };
    if (keysToKeep?.length) this.state.pendingResumeKeys = keysToKeep;
    this.saveState();
    shimManager.removeShim();
  }

  startBypass(): {
    ok: boolean;
    challengeId: string;
    challenges: Challenge[];
    error?: string;
    paymentOption?: {
      amount: number;
      currency: string;
      url: string;
      hasVerification: boolean;
    };
  } {
    if (this.state.hardLock) {
      return {
        ok: false,
        challengeId: "",
        challenges: [],
        error: "Hard lock is active — bypass is not allowed. Wait for the lock to expire.",
      };
    }

    const config = shimManager.getConfig();
    const challengesAllowed = config?.challengeBypassEnabled !== false;

    let paymentOption:
      | { amount: number; currency: string; url: string; hasVerification: boolean }
      | undefined;
    if (config?.paymentBypassEnabled && config.paymentBypassUrl) {
      paymentOption = {
        amount: config.paymentBypassAmount ?? 500,
        currency: "USD",
        url: config.paymentBypassUrl,
        hasVerification: Boolean(config.paymentBypassStripeKey),
      };
    }

    if (config?.paymentBypassEnabled && !config.paymentBypassUrl) {
      // Payment bypass is on but misconfigured — warn but still fall through to challenges if allowed
      if (!challengesAllowed) {
        return {
          ok: false,
          challengeId: "",
          challenges: [],
          error: "Payment bypass is enabled but no payment URL is configured (`cc-lock config set paymentBypassUrl <url>`), and challenge bypass is also disabled.",
        };
      }
    }

    if (!challengesAllowed && !paymentOption) {
      return {
        ok: false,
        challengeId: "",
        challenges: [],
        error: "No bypass options available — both challenge and payment bypass are disabled.",
      };
    }

    this.state.bypassAttempts++;
    this.saveState();

    const challenges = challengesAllowed ? generateChallenges(this.state.bypassAttempts) : [];
    const challengeId = `bypass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingChallenges.set(challengeId, {
      challenges,
      createdAt: Date.now(),
    });

    return { ok: true, challengeId, challenges, paymentOption };
  }

  async completeBypass(
    challengeId: string,
    _answer: string,
    paymentMethod?: boolean,
    stripePaymentIntentId?: string
  ): Promise<{ ok: boolean; graceExpiresAt?: string; error?: string }> {
    if (paymentMethod) {
      // Payment path: skip challenge lookup
      const config = shimManager.getConfig();

      // Optional Stripe verification
      if (config?.paymentBypassStripeKey) {
        if (!stripePaymentIntentId) {
          return { ok: false, error: "Stripe payment intent ID required for verification" };
        }
        const verifyErr = await verifyStripePayment(
          config.paymentBypassStripeKey,
          stripePaymentIntentId
        );
        if (verifyErr) {
          return { ok: false, error: verifyErr };
        }
      }
    } else {
      // Challenge path: validate challenge exists
      const pending = pendingChallenges.get(challengeId);
      if (!pending) {
        return { ok: false, error: "Invalid or expired challenge" };
      }
      pendingChallenges.delete(challengeId);
    }

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

/** Verifies a Stripe payment intent via the Stripe REST API. Returns an error string or null. */
function verifyStripePayment(secretKey: string, paymentIntentId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.stripe.com",
      path: `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body) as { status?: string; error?: { message?: string } };
          if (data.error) {
            resolve(`Stripe error: ${data.error.message ?? "unknown"}`);
          } else if (data.status !== "succeeded") {
            resolve(`Payment not completed (status: ${data.status ?? "unknown"})`);
          } else {
            resolve(null);
          }
        } catch {
          resolve("Failed to parse Stripe response");
        }
      });
    });

    req.on("error", (err) => resolve(`Stripe request failed: ${err.message}`));
    req.end();
  });
}

export const lockManager = new LockManager();
