import type { Schedule } from "@cc-lock/core";
import { getDb } from "./db.js";
import { lockManager } from "./lock-manager.js";

export function loadSchedules(): Schedule[] {
  const stmt = getDb().prepare(
    "SELECT id, name, type, start_time as startTime, end_time as endTime, days, enabled FROM schedules"
  );
  const rows = stmt.all() as Array<{
    id: string;
    name: string;
    type: string;
    startTime: string;
    endTime: string;
    days: string | null;
    enabled: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as Schedule["type"],
    startTime: r.startTime,
    endTime: r.endTime,
    days: r.days ? JSON.parse(r.days) : undefined,
    enabled: r.enabled === 1,
  }));
}

export function addSchedule(schedule: Omit<Schedule, "id">): Schedule {
  const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stmt = getDb().prepare(
    "INSERT INTO schedules (id, name, type, start_time, end_time, days, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run(
    id,
    schedule.name,
    schedule.type,
    schedule.startTime,
    schedule.endTime,
    schedule.days ? JSON.stringify(schedule.days) : null,
    schedule.enabled ? 1 : 0
  );
  return { id, ...schedule };
}

export function removeSchedule(id: string): boolean {
  const stmt = getDb().prepare("DELETE FROM schedules WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function toggleSchedule(id: string, enabled: boolean): boolean {
  const stmt = getDb().prepare(
    "UPDATE schedules SET enabled = ? WHERE id = ?"
  );
  const result = stmt.run(enabled ? 1 : 0, id);
  return result.changes > 0;
}

function isScheduleActiveNow(schedule: Schedule): { active: boolean; endTime: Date } {
  if (!schedule.enabled) return { active: false, endTime: new Date() };

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Check day match
  let dayMatch = false;
  switch (schedule.type) {
    case "daily":
      dayMatch = true;
      break;
    case "weekdays":
      dayMatch = dayOfWeek >= 1 && dayOfWeek <= 5;
      break;
    case "weekends":
      dayMatch = dayOfWeek === 0 || dayOfWeek === 6;
      break;
    case "custom":
      dayMatch = schedule.days?.includes(dayOfWeek) ?? false;
      break;
  }

  if (!dayMatch) return { active: false, endTime: new Date() };

  // Check time range
  const active = currentTime >= schedule.startTime && currentTime < schedule.endTime;

  // Compute end time as Date today
  const [endH, endM] = schedule.endTime.split(":").map(Number);
  const endDate = new Date(now);
  endDate.setHours(endH!, endM!, 0, 0);

  return { active, endTime: endDate };
}

export function evaluateSchedules() {
  const schedules = loadSchedules();
  for (const schedule of schedules) {
    const { active, endTime } = isScheduleActiveNow(schedule);
    if (active) {
      lockManager.lockForSchedule(schedule.id, endTime, schedule.name);
    }
  }
}

let evalInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduleEvaluator() {
  // Check immediately
  evaluateSchedules();
  // Then every 30 seconds
  evalInterval = setInterval(evaluateSchedules, 30_000);
}

export function stopScheduleEvaluator() {
  if (evalInterval) {
    clearInterval(evalInterval);
    evalInterval = null;
  }
}
