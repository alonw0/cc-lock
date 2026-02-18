import { sendRequest } from "../ipc-client.js";
import type { ConfigGetResponse, ConfigSetResponse } from "@cc-lock/core";

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
      throw new Error('chmodGuard must be true or false');
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
