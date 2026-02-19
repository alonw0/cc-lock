import { sendRequest } from "../ipc-client.js";
import { formatStats } from "../formatters.js";
import type { StatsResponse, StatsResetResponse } from "@cc-lock/core";

export async function statsCommand(options: { week?: boolean; month?: boolean }) {
  const period = options.month ? "month" : options.week ? "week" : "day";
  const res = (await sendRequest({ type: "stats", period })) as StatsResponse;
  console.log(formatStats(res.days));
}

export async function statsResetCommand(options: { all?: boolean }) {
  const all = options.all ?? false;
  const scope = all ? "all stats" : "today's stats";
  const res = (await sendRequest({ type: "stats-reset", all })) as StatsResetResponse;
  if (res.ok) {
    console.log(`✓ Reset ${scope}.`);
  } else {
    console.error(`✗ ${res.error ?? "Reset failed"}`);
    process.exit(1);
  }
}
