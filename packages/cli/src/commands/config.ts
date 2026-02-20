import { sendRequest } from "../ipc-client.js";
import type { ConfigGetResponse, ConfigSetResponse } from "@cc-lock/core";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WEEKEND_PRESETS: Record<string, number[]> = {
  "sat-sun": [0, 6],
  "sun-sat": [0, 6],
  "fri-sat": [5, 6],
  "sat-fri": [5, 6],
};

function parseWeekendDays(raw: string): number[] {
  const lower = raw.toLowerCase().replace(/\s+/g, "");
  if (WEEKEND_PRESETS[lower]) return WEEKEND_PRESETS[lower]!;
  const nums = lower.split(",").map((s) => parseInt(s, 10));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 6)) {
    throw new Error(
      "weekendDays must be sat-sun, fri-sat, or comma-separated day numbers (0=Sun … 6=Sat)"
    );
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function formatWeekendDays(days: number[]): string {
  return days.map((d) => DAY_NAMES[d] ?? d).join("+");
}

const SETTABLE_KEYS = {
  graceMinutes: {
    description: "Grace period in minutes after a successful bypass (1–120)",
    parse(raw: string): number {
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 1 || n > 120) {
        throw new Error("graceMinutes must be an integer between 1 and 120");
      }
      return n;
    },
  },
  chmodGuard: {
    description: "Hard mode — removes write permission from the shim (true/false)",
    parse(raw: string): boolean {
      if (raw === "true" || raw === "1" || raw === "yes") return true;
      if (raw === "false" || raw === "0" || raw === "no") return false;
      throw new Error("chmodGuard must be true or false");
    },
  },
  weekendDays: {
    description: 'Days counted as "weekend" for schedules: sat-sun (default), fri-sat, or 0,6',
    parse: parseWeekendDays,
  },
  challengeBypassEnabled: {
    description: "Allow free challenge-based bypass (true/false). Set false to require payment.",
    parse(raw: string): boolean {
      if (raw === "true" || raw === "1" || raw === "yes") return true;
      if (raw === "false" || raw === "0" || raw === "no") return false;
      throw new Error("challengeBypassEnabled must be true or false");
    },
  },
  paymentBypassEnabled: {
    description: "Enable payment bypass mode — pay instead of solving a challenge (true/false)",
    parse(raw: string): boolean {
      if (raw === "true" || raw === "1" || raw === "yes") return true;
      if (raw === "false" || raw === "0" || raw === "no") return false;
      throw new Error("paymentBypassEnabled must be true or false");
    },
  },
  paymentBypassAmount: {
    description: "Payment amount in cents, e.g. 500 = $5.00 (min 1)",
    parse(raw: string): number {
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 1) {
        throw new Error("paymentBypassAmount must be a positive integer (cents)");
      }
      return n;
    },
  },
  paymentBypassUrl: {
    description: "Payment URL to open in browser (Stripe link, Venmo, PayPal, Ko-fi, etc.)",
    parse(raw: string): string {
      return raw;
    },
  },
  paymentBypassStripeKey: {
    description: "Optional Stripe secret key (sk_...) for payment intent verification",
    parse(raw: string): string {
      return raw;
    },
  },
  killSessionsOnLock: {
    description: "Kill running claude sessions when a lock is engaged (true/false)",
    parse(raw: string): boolean {
      if (raw === "true" || raw === "1" || raw === "yes") return true;
      if (raw === "false" || raw === "0" || raw === "no") return false;
      throw new Error("killSessionsOnLock must be true or false");
    },
  },
} as const;

type SettableKey = keyof typeof SETTABLE_KEYS;

export async function configGetCommand() {
  const res = (await sendRequest({ type: "config-get" })) as ConfigGetResponse;
  const { config } = res;
  console.log("Current configuration:");
  console.log(`  installationType : ${config.installationType}`);
  console.log(`  claudeBinaryPath : ${config.claudeBinaryPath}`);
  console.log(`  claudeShimPath   : ${config.claudeShimPath}`);
  console.log(`  graceMinutes     : ${config.graceMinutes}`);
  console.log(`  chmodGuard       : ${config.chmodGuard}`);
  console.log(`  weekendDays      : ${formatWeekendDays(config.weekendDays ?? [0, 6])}`);
  console.log(`  challengeBypassEnabled : ${config.challengeBypassEnabled ?? true}`);
  console.log(`  killSessionsOnLock : ${config.killSessionsOnLock ?? false}`);
  console.log(`  paymentBypassEnabled : ${config.paymentBypassEnabled ?? false}`);
  if (config.paymentBypassEnabled) {
    const cents = config.paymentBypassAmount ?? 500;
    console.log(`  paymentBypassAmount  : ${cents} cents ($${(cents / 100).toFixed(2)})`);
    console.log(`  paymentBypassUrl     : ${config.paymentBypassUrl ?? "(not set)"}`);
    console.log(
      `  paymentBypassStripeKey : ${config.paymentBypassStripeKey ? "(configured)" : "(not set)"}`
    );
  }
  console.log();
  console.log("Settable keys:");
  for (const [key, meta] of Object.entries(SETTABLE_KEYS)) {
    console.log(`  ${key.padEnd(16)} ${meta.description}`);
  }
}

export async function configSetCommand(key: string, rawValue: string) {
  if (!(key in SETTABLE_KEYS)) {
    const valid = Object.keys(SETTABLE_KEYS).join(", ");
    throw new Error(`Unknown config key "${key}". Settable keys: ${valid}`);
  }

  const meta = SETTABLE_KEYS[key as SettableKey];
  const value = meta.parse(rawValue);

  const res = (await sendRequest({ type: "config-set", key, value })) as ConfigSetResponse;
  if (!res.ok) {
    throw new Error(res.error ?? "config-set failed");
  }

  console.log(`✓ ${key} = ${value}`);
}
