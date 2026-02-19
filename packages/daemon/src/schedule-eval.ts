import type { Schedule } from "@cc-lock/core";
import { getDb } from "./db.js";
import { lockManager } from "./lock-manager.js";
import { shimManager } from "./shim-manager.js";
import { notify } from "./notify.js";

const WARNING_MINUTES = 5;

// Tracks which schedules have had their "locking soon" warning fired today.
// Key: scheduleId, Value: YYYY-MM-DD date string of last warning.
// Keying by date means the warning fires once per day per schedule automatically.
const warnedToday = new Map<string, string>();

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

/** Pure function — checks if a schedule is active at a given moment. Exported for testing. */
export function checkScheduleAt(
  schedule: Schedule,
  now: Date,
  weekendDays: number[]
): { active: boolean; endTime: Date } {
  if (!schedule.enabled) return { active: false, endTime: new Date(now) };

  const dayOfWeek = now.getDay(); // 0=Sun
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}`;

  let dayMatch = false;
  switch (schedule.type) {
    case "daily":    dayMatch = true; break;
    case "weekdays": dayMatch = dayOfWeek >= 1 && dayOfWeek <= 5; break;
    case "weekends": dayMatch = weekendDays.includes(dayOfWeek); break;
    case "custom":   dayMatch = schedule.days?.includes(dayOfWeek) ?? false; break;
  }

  if (!dayMatch) return { active: false, endTime: new Date(now) };

  const active = currentTime >= schedule.startTime && currentTime < schedule.endTime;

  const [endH, endM] = schedule.endTime.split(":").map(Number);
  const endDate = new Date(now);
  endDate.setHours(endH!, endM!, 0, 0);

  return { active, endTime: endDate };
}

function isScheduleActiveNow(schedule: Schedule, weekendDays: number[]) {
  return checkScheduleAt(schedule, new Date(), weekendDays);
}

function warnUpcomingSchedule(schedule: Schedule, weekendDays: number[]): void {
  if (!schedule.enabled) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Already warned today for this schedule?
  if (warnedToday.get(schedule.id) === today) return;

  const dayOfWeek = now.getDay();
  let dayMatch = false;
  switch (schedule.type) {
    case "daily":    dayMatch = true; break;
    case "weekdays": dayMatch = dayOfWeek >= 1 && dayOfWeek <= 5; break;
    case "weekends": dayMatch = weekendDays.includes(dayOfWeek); break;
    case "custom":   dayMatch = schedule.days?.includes(dayOfWeek) ?? false; break;
  }
  if (!dayMatch) return;

  const [startH, startM] = schedule.startTime.split(":").map(Number);
  const startDate = new Date(now);
  startDate.setHours(startH!, startM!, 0, 0);

  const msUntilStart = startDate.getTime() - now.getTime();
  const inWarningWindow = msUntilStart > 0 && msUntilStart <= WARNING_MINUTES * 60_000;
  if (!inWarningWindow) return;

  const minsUntil = Math.ceil(msUntilStart / 60_000);
  const label = minsUntil === 1 ? "1 minute" : `${minsUntil} minutes`;
  notify(
    "cc-lock",
    `"${schedule.name}" will lock Claude Code in ${label}`
  );
  warnedToday.set(schedule.id, today);
}

export function evaluateSchedules() {
  const weekendDays = shimManager.getConfig()?.weekendDays ?? [0, 6];
  const schedules = loadSchedules();
  for (const schedule of schedules) {
    warnUpcomingSchedule(schedule, weekendDays);
    const { active, endTime } = isScheduleActiveNow(schedule, weekendDays);
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
