import { sendRequest } from "../ipc-client.js";
import { formatStats } from "../formatters.js";
import type { StatsResponse } from "@cc-lock/core";

export async function statsCommand(options: { week?: boolean; month?: boolean }) {
  const period = options.month ? "month" : options.week ? "week" : "day";
  const res = (await sendRequest({ type: "stats", period })) as StatsResponse;
  console.log(formatStats(res.days));
}
