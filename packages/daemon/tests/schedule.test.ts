import { describe, it, expect } from "vitest";
import { checkScheduleAt } from "../src/schedule-eval.js";
import type { Schedule } from "@cc-lock/core";

// Jan 1, 2024 = Monday  (getDay() = 1)
// Jan 5, 2024 = Friday  (getDay() = 5)
// Jan 6, 2024 = Saturday (getDay() = 6)
// Jan 7, 2024 = Sunday  (getDay() = 0)
function at(year: number, month: number, day: number, h: number, m: number): Date {
  return new Date(year, month - 1, day, h, m, 0, 0);
}

const MON_9AM  = at(2024, 1, 1,  9,  0); // startTime boundary
const MON_10AM = at(2024, 1, 1, 10,  0); // within window
const MON_8AM  = at(2024, 1, 1,  8, 59); // before window
const MON_17PM = at(2024, 1, 1, 17,  0); // endTime boundary (exclusive)
const MON_5PM1 = at(2024, 1, 1, 16, 59); // 1 min before end
const FRI_10AM = at(2024, 1, 5, 10,  0); // Friday
const SAT_10AM = at(2024, 1, 6, 10,  0); // Saturday
const SUN_10AM = at(2024, 1, 7, 10,  0); // Sunday

const WEEKENDS = [0, 6]; // default: Sun + Sat

function sched(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "s1",
    name: "Test",
    type: "daily",
    startTime: "09:00",
    endTime: "17:00",
    enabled: true,
    ...overrides,
  };
}

describe("checkScheduleAt — disabled schedule", () => {
  it("always inactive when enabled=false, regardless of time", () => {
    const { active } = checkScheduleAt(sched({ enabled: false }), MON_10AM, WEEKENDS);
    expect(active).toBe(false);
  });

  it("returns endTime = copy of now when disabled", () => {
    const { endTime } = checkScheduleAt(sched({ enabled: false }), MON_10AM, WEEKENDS);
    expect(endTime.getTime()).toBe(MON_10AM.getTime());
  });
});

describe("checkScheduleAt — daily schedule", () => {
  it("is active during the time window", () => {
    expect(checkScheduleAt(sched(), MON_10AM, WEEKENDS).active).toBe(true);
  });

  it("is active at startTime boundary (inclusive)", () => {
    expect(checkScheduleAt(sched(), MON_9AM, WEEKENDS).active).toBe(true);
  });

  it("is inactive at endTime boundary (exclusive)", () => {
    expect(checkScheduleAt(sched(), MON_17PM, WEEKENDS).active).toBe(false);
  });

  it("is inactive one minute before endTime — false (should be active)", () => {
    expect(checkScheduleAt(sched(), MON_5PM1, WEEKENDS).active).toBe(true);
  });

  it("is inactive before window", () => {
    expect(checkScheduleAt(sched(), MON_8AM, WEEKENDS).active).toBe(false);
  });

  it("is active on Saturday for daily type", () => {
    expect(checkScheduleAt(sched({ type: "daily" }), SAT_10AM, WEEKENDS).active).toBe(true);
  });

  it("is active on Sunday for daily type", () => {
    expect(checkScheduleAt(sched({ type: "daily" }), SUN_10AM, WEEKENDS).active).toBe(true);
  });
});

describe("checkScheduleAt — weekdays schedule", () => {
  it("is active on Monday", () => {
    expect(checkScheduleAt(sched({ type: "weekdays" }), MON_10AM, WEEKENDS).active).toBe(true);
  });

  it("is active on Friday", () => {
    expect(checkScheduleAt(sched({ type: "weekdays" }), FRI_10AM, WEEKENDS).active).toBe(true);
  });

  it("is inactive on Saturday", () => {
    expect(checkScheduleAt(sched({ type: "weekdays" }), SAT_10AM, WEEKENDS).active).toBe(false);
  });

  it("is inactive on Sunday", () => {
    expect(checkScheduleAt(sched({ type: "weekdays" }), SUN_10AM, WEEKENDS).active).toBe(false);
  });
});

describe("checkScheduleAt — weekends schedule", () => {
  it("is active on Saturday", () => {
    expect(checkScheduleAt(sched({ type: "weekends" }), SAT_10AM, WEEKENDS).active).toBe(true);
  });

  it("is active on Sunday", () => {
    expect(checkScheduleAt(sched({ type: "weekends" }), SUN_10AM, WEEKENDS).active).toBe(true);
  });

  it("is inactive on Monday", () => {
    expect(checkScheduleAt(sched({ type: "weekends" }), MON_10AM, WEEKENDS).active).toBe(false);
  });

  it("respects custom weekendDays config — Friday only", () => {
    const fridayOnly = [5];
    expect(checkScheduleAt(sched({ type: "weekends" }), FRI_10AM, fridayOnly).active).toBe(true);
    expect(checkScheduleAt(sched({ type: "weekends" }), SAT_10AM, fridayOnly).active).toBe(false);
    expect(checkScheduleAt(sched({ type: "weekends" }), SUN_10AM, fridayOnly).active).toBe(false);
  });
});

describe("checkScheduleAt — custom schedule", () => {
  it("is active on a matching day", () => {
    // Mon (1) + Wed (3)
    expect(checkScheduleAt(sched({ type: "custom", days: [1, 3] }), MON_10AM, WEEKENDS).active).toBe(true);
  });

  it("is inactive on a non-matching day", () => {
    expect(checkScheduleAt(sched({ type: "custom", days: [1, 3] }), SAT_10AM, WEEKENDS).active).toBe(false);
  });

  it("is inactive when days is undefined", () => {
    expect(checkScheduleAt(sched({ type: "custom", days: undefined }), MON_10AM, WEEKENDS).active).toBe(false);
  });

  it("is inactive when days array is empty", () => {
    expect(checkScheduleAt(sched({ type: "custom", days: [] }), MON_10AM, WEEKENDS).active).toBe(false);
  });
});

describe("checkScheduleAt — endTime calculation", () => {
  it("endTime has the correct hour and minute", () => {
    const { endTime } = checkScheduleAt(sched({ endTime: "17:30" }), MON_10AM, WEEKENDS);
    expect(endTime.getHours()).toBe(17);
    expect(endTime.getMinutes()).toBe(30);
    expect(endTime.getSeconds()).toBe(0);
  });

  it("endTime shares the same date as `now`", () => {
    const { endTime } = checkScheduleAt(sched(), MON_10AM, WEEKENDS);
    expect(endTime.getFullYear()).toBe(MON_10AM.getFullYear());
    expect(endTime.getMonth()).toBe(MON_10AM.getMonth());
    expect(endTime.getDate()).toBe(MON_10AM.getDate());
  });

  it("endTime is a copy of now when day does not match (weekdays on Saturday)", () => {
    const { endTime } = checkScheduleAt(sched({ type: "weekdays" }), SAT_10AM, WEEKENDS);
    expect(endTime.getTime()).toBe(SAT_10AM.getTime());
  });
});

describe("checkScheduleAt — overnight schedule (known limitation)", () => {
  it("does NOT handle schedules that cross midnight", () => {
    // 22:00–02:00 at 23:00 on Monday: string comparison "23:00" < "02:00" is false
    const night = at(2024, 1, 1, 23, 0);
    const { active } = checkScheduleAt(
      sched({ startTime: "22:00", endTime: "02:00" }),
      night,
      WEEKENDS
    );
    // Documents the known limitation: overnight spans are not supported
    expect(active).toBe(false);
  });
});
