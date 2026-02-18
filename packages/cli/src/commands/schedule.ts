import { sendRequest } from "../ipc-client.js";
import { formatSchedules } from "../formatters.js";
import type {
  ScheduleAddResponse,
  ScheduleListResponse,
  ScheduleRemoveResponse,
  ScheduleToggleResponse,
} from "@cc-lock/core";
import type { Schedule } from "@cc-lock/core";
import { createInterface } from "readline";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function scheduleAddCommand() {
  console.log("Add a new schedule\n");

  const name = await prompt("Name: ");
  const typeStr = await prompt("Type (daily/weekdays/weekends/custom): ");
  const type = typeStr as Schedule["type"];

  let days: number[] | undefined;
  if (type === "custom") {
    const daysStr = await prompt("Days (comma-separated, 0=Sun..6=Sat): ");
    days = daysStr.split(",").map((s) => parseInt(s.trim(), 10));
  }

  const startTime = await prompt("Start time (HH:MM): ");
  const endTime = await prompt("End time (HH:MM): ");

  const res = (await sendRequest({
    type: "schedule-add",
    schedule: { name, type, startTime, endTime, days, enabled: true },
  })) as ScheduleAddResponse;

  if (res.ok && res.schedule) {
    console.log(`\nSchedule added: ${res.schedule.id}`);
  } else {
    console.error(`Failed: ${res.error}`);
  }
}

export async function scheduleListCommand() {
  const res = (await sendRequest({
    type: "schedule-list",
  })) as ScheduleListResponse;
  console.log(formatSchedules(res.schedules));
}

export async function scheduleRemoveCommand(id: string) {
  const res = (await sendRequest({
    type: "schedule-remove",
    id,
  })) as ScheduleRemoveResponse;

  if (res.ok) {
    console.log("Schedule removed.");
  } else {
    console.error(`Failed: ${res.error}`);
  }
}

export async function scheduleToggleCommand(id: string, enabled: boolean) {
  const res = (await sendRequest({
    type: "schedule-toggle",
    id,
    enabled,
  })) as ScheduleToggleResponse;

  if (res.ok) {
    console.log(`Schedule ${enabled ? "enabled" : "disabled"}.`);
  } else {
    console.error(`Failed: ${res.error}`);
  }
}
