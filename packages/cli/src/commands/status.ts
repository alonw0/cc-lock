import { sendRequest } from "../ipc-client.js";
import { formatStatus } from "../formatters.js";
import type { StatusResponse } from "@cc-lock/core";

export async function statusCommand() {
  const res = (await sendRequest({ type: "status" })) as StatusResponse;
  console.log(formatStatus(res.lock, res.todayUsageSeconds));
}
