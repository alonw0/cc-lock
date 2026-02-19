import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { DB_FILE } from "@cc-lock/core";
import type { DailyStats, SessionRecord } from "@cc-lock/core";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(DB_FILE), { recursive: true });
    db = new Database(DB_FILE);
    db.pragma("journal_mode = WAL");
    initSchema();
  }
  return db;
}

function initSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      total_seconds INTEGER DEFAULT 0,
      session_count INTEGER DEFAULT 0,
      bypass_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      days TEXT,
      enabled INTEGER DEFAULT 1
    );
  `);
}

export function recordSessionStart(): number {
  const stmt = getDb().prepare(
    "INSERT INTO sessions (started_at) VALUES (?)"
  );
  const result = stmt.run(new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function recordSessionEnd(id: number) {
  const stmt = getDb().prepare(`
    UPDATE sessions
    SET ended_at = ?, duration_seconds = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER)
    WHERE id = ?
  `);
  const now = new Date().toISOString();
  stmt.run(now, now, id);
}

export function updateDailyStats(date: string, durationSeconds: number) {
  const stmt = getDb().prepare(`
    INSERT INTO daily_stats (date, total_seconds, session_count)
    VALUES (?, ?, 1)
    ON CONFLICT(date) DO UPDATE SET
      total_seconds = total_seconds + ?,
      session_count = session_count + 1
  `);
  stmt.run(date, durationSeconds, durationSeconds);
}

export function incrementBypassCount(date: string) {
  const stmt = getDb().prepare(`
    INSERT INTO daily_stats (date, total_seconds, session_count, bypass_count)
    VALUES (?, 0, 0, 1)
    ON CONFLICT(date) DO UPDATE SET
      bypass_count = bypass_count + 1
  `);
  stmt.run(date);
}

export function getStatsForPeriod(
  startDate: string,
  endDate: string
): DailyStats[] {
  const stmt = getDb().prepare(`
    SELECT date, total_seconds as totalSeconds, session_count as sessionCount, bypass_count as bypassCount
    FROM daily_stats
    WHERE date >= ? AND date <= ?
    ORDER BY date
  `);
  return stmt.all(startDate, endDate) as DailyStats[];
}

export function getTodayUsageSeconds(): number {
  const today = new Date().toISOString().slice(0, 10);

  // Completed sessions stored in daily_stats
  const completed = getDb()
    .prepare("SELECT COALESCE(total_seconds, 0) as s FROM daily_stats WHERE date = ?")
    .get(today) as { s: number } | undefined;

  // In-progress sessions that started today (not yet ended, so not in daily_stats)
  const inProgress = getDb()
    .prepare(`
      SELECT COALESCE(
        SUM(CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)),
        0
      ) as s
      FROM sessions
      WHERE ended_at IS NULL
        AND date(started_at) = ?
    `)
    .get(today) as { s: number } | undefined;

  return (completed?.s ?? 0) + (inProgress?.s ?? 0);
}

export function resetStats(all: boolean): void {
  if (all) {
    getDb().exec("DELETE FROM daily_stats; DELETE FROM sessions;");
  } else {
    const today = new Date().toISOString().slice(0, 10);
    getDb().prepare("DELETE FROM daily_stats WHERE date = ?").run(today);
    getDb().prepare("DELETE FROM sessions WHERE date(started_at) = ?").run(today);
  }
}

export function getActiveSessions(): SessionRecord[] {
  const stmt = getDb().prepare(
    "SELECT id, started_at as startedAt, ended_at as endedAt, duration_seconds as durationSeconds FROM sessions WHERE ended_at IS NULL"
  );
  return stmt.all() as SessionRecord[];
}
