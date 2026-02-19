import { useState, useEffect, useCallback } from "react";
import { createConnection } from "net";
import { SOCKET_PATH } from "@cc-lock/core";
import type { Request, Response, StatusResponse, StatsResponse, ScheduleListResponse } from "@cc-lock/core";
import type { LockState, Config, DailyStats, Schedule } from "@cc-lock/core";

function sendRequest(req: Request): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCKET_PATH);
    let buffer = "";
    socket.on("connect", () => socket.write(JSON.stringify(req) + "\n"));
    socket.on("data", (data) => {
      buffer += data.toString();
      const idx = buffer.indexOf("\n");
      if (idx !== -1) {
        resolve(JSON.parse(buffer.slice(0, idx)) as Response);
        socket.end();
      }
    });
    socket.on("error", reject);
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Timeout")); });
  });
}

export function useDaemonStatus(pollMs = 2000) {
  const [lock, setLock] = useState<LockState | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [todayUsage, setTodayUsage] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null); // null = not yet attempted

  const refresh = useCallback(async () => {
    try {
      const res = (await sendRequest({ type: "status" })) as StatusResponse;
      setLock(res.lock);
      setConfig(res.config);
      setTodayUsage(res.todayUsageSeconds);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollMs);
    return () => clearInterval(interval);
  }, [refresh, pollMs]);

  return { lock, config, todayUsage, connected, refresh };
}

export function useStats(period: "day" | "week" | "month" = "week") {
  const [days, setDays] = useState<DailyStats[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    sendRequest({ type: "stats", period })
      .then((res) => setDays((res as StatsResponse).days))
      .catch(() => {});
  }, [period, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { days, refresh };
}

export function useSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = (await sendRequest({ type: "schedule-list" })) as ScheduleListResponse;
      setSchedules(res.schedules);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { schedules, refresh };
}

export { sendRequest };
