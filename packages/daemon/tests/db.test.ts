import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock @cc-lock/core before any module that imports it.
// Using ':memory:' gives an in-memory SQLite DB for the entire test file.
vi.mock("@cc-lock/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cc-lock/core")>();
  return { ...actual, DB_FILE: ":memory:" };
});

// Static imports are resolved AFTER vi.mock calls (vitest hoisting).
import {
  getDb,
  recordSessionStart,
  recordSessionEnd,
  updateDailyStats,
  getTodayUsageSeconds,
  resetStats,
  getStatsForPeriod,
} from "../src/db.js";

// Helpers
const today = () => new Date().toISOString().slice(0, 10);

function clearDb() {
  getDb().exec("DELETE FROM daily_stats; DELETE FROM sessions;");
}

beforeEach(() => {
  clearDb();
});

// ── updateDailyStats ──────────────────────────────────────────────────────────

describe("updateDailyStats", () => {
  it("inserts a new row when no row exists for that date", () => {
    updateDailyStats("2024-01-15", 300);
    const row = getDb()
      .prepare("SELECT total_seconds, session_count FROM daily_stats WHERE date = ?")
      .get("2024-01-15") as { total_seconds: number; session_count: number } | undefined;
    expect(row?.total_seconds).toBe(300);
    expect(row?.session_count).toBe(1);
  });

  it("accumulates total_seconds and session_count on upsert", () => {
    updateDailyStats("2024-01-15", 300);
    updateDailyStats("2024-01-15", 600);
    const row = getDb()
      .prepare("SELECT total_seconds, session_count FROM daily_stats WHERE date = ?")
      .get("2024-01-15") as { total_seconds: number; session_count: number };
    expect(row.total_seconds).toBe(900);
    expect(row.session_count).toBe(2);
  });

  it("keeps separate rows for different dates", () => {
    updateDailyStats("2024-01-14", 100);
    updateDailyStats("2024-01-15", 200);
    const count = (
      getDb().prepare("SELECT COUNT(*) as n FROM daily_stats").get() as { n: number }
    ).n;
    expect(count).toBe(2);
  });
});

// ── recordSessionStart / recordSessionEnd ─────────────────────────────────────

describe("recordSessionStart / recordSessionEnd", () => {
  it("recordSessionStart inserts a session with ended_at = null", () => {
    const id = recordSessionStart();
    expect(typeof id).toBe("number");
    const row = getDb()
      .prepare("SELECT ended_at FROM sessions WHERE id = ?")
      .get(id) as { ended_at: string | null } | undefined;
    expect(row?.ended_at).toBeNull();
  });

  it("recordSessionEnd sets ended_at and duration_seconds", () => {
    const id = recordSessionStart();
    // Small delay to ensure duration > 0 is unreliable in tests, so just check structure
    recordSessionEnd(id);
    const row = getDb()
      .prepare("SELECT ended_at, duration_seconds FROM sessions WHERE id = ?")
      .get(id) as { ended_at: string | null; duration_seconds: number } | undefined;
    expect(row?.ended_at).not.toBeNull();
    expect(typeof row?.duration_seconds).toBe("number");
  });
});

// ── getTodayUsageSeconds ───────────────────────────────────────────────────────

describe("getTodayUsageSeconds", () => {
  it("returns 0 when no sessions exist", () => {
    expect(getTodayUsageSeconds()).toBe(0);
  });

  it("returns total from daily_stats for today", () => {
    updateDailyStats(today(), 3600);
    expect(getTodayUsageSeconds()).toBe(3600);
  });

  it("does not include yesterday's stats", () => {
    updateDailyStats("2020-01-01", 9999);
    expect(getTodayUsageSeconds()).toBe(0);
  });

  it("includes in-progress sessions (ended_at IS NULL) started today", () => {
    // Insert a session that started a known number of seconds ago
    const startedAt = new Date(Date.now() - 120_000).toISOString(); // 2 min ago
    getDb()
      .prepare("INSERT INTO sessions (started_at) VALUES (?)")
      .run(startedAt);
    const usage = getTodayUsageSeconds();
    // Should be approximately 120s; allow ±5s for test runtime
    expect(usage).toBeGreaterThanOrEqual(115);
    expect(usage).toBeLessThan(130);
  });

  it("does not count in-progress sessions that started yesterday", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    getDb()
      .prepare("INSERT INTO sessions (started_at) VALUES (?)")
      .run(yesterday);
    // date(started_at) = yesterday, so it should not be counted as today
    expect(getTodayUsageSeconds()).toBe(0);
  });

  it("sums both daily_stats and in-progress", () => {
    updateDailyStats(today(), 1000);
    const startedAt = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    getDb()
      .prepare("INSERT INTO sessions (started_at) VALUES (?)")
      .run(startedAt);
    const usage = getTodayUsageSeconds();
    // Should be ~1060s; allow ±5s
    expect(usage).toBeGreaterThanOrEqual(1055);
    expect(usage).toBeLessThan(1070);
  });
});

// ── resetStats ────────────────────────────────────────────────────────────────

describe("resetStats", () => {
  it("resetStats(false) clears only today's data", () => {
    updateDailyStats(today(), 500);
    updateDailyStats("2020-06-01", 500); // old data
    resetStats(false);

    const todayRow = getDb()
      .prepare("SELECT * FROM daily_stats WHERE date = ?")
      .get(today());
    expect(todayRow).toBeUndefined();

    const oldRow = getDb()
      .prepare("SELECT * FROM daily_stats WHERE date = ?")
      .get("2020-06-01");
    expect(oldRow).toBeDefined();
  });

  it("resetStats(false) clears today's sessions", () => {
    recordSessionStart();
    recordSessionStart();
    resetStats(false);

    const count = (
      getDb()
        .prepare("SELECT COUNT(*) as n FROM sessions WHERE date(started_at) = ?")
        .get(today()) as { n: number }
    ).n;
    expect(count).toBe(0);
  });

  it("resetStats(true) clears all data across all dates", () => {
    updateDailyStats(today(), 300);
    updateDailyStats("2020-01-01", 600);
    recordSessionStart();
    resetStats(true);

    const statsCount = (
      getDb().prepare("SELECT COUNT(*) as n FROM daily_stats").get() as { n: number }
    ).n;
    const sessionsCount = (
      getDb().prepare("SELECT COUNT(*) as n FROM sessions").get() as { n: number }
    ).n;
    expect(statsCount).toBe(0);
    expect(sessionsCount).toBe(0);
  });
});

// ── getStatsForPeriod ──────────────────────────────────────────────────────────

describe("getStatsForPeriod", () => {
  it("returns empty array when no data", () => {
    expect(getStatsForPeriod("2024-01-01", "2024-01-07")).toEqual([]);
  });

  it("returns rows ordered by date within the range", () => {
    updateDailyStats("2024-01-03", 100);
    updateDailyStats("2024-01-01", 200);
    updateDailyStats("2024-01-05", 300);

    const rows = getStatsForPeriod("2024-01-01", "2024-01-07");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.date).toBe("2024-01-01");
    expect(rows[1]?.date).toBe("2024-01-03");
    expect(rows[2]?.date).toBe("2024-01-05");
  });

  it("excludes rows outside the date range", () => {
    updateDailyStats("2023-12-31", 999); // before range
    updateDailyStats("2024-01-03", 100); // in range
    updateDailyStats("2024-01-08", 999); // after range

    const rows = getStatsForPeriod("2024-01-01", "2024-01-07");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe("2024-01-03");
  });
});
