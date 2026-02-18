import type { Request, Response } from "@cc-lock/core";
import { lockManager } from "./lock-manager.js";
import { shimManager } from "./shim-manager.js";
import {
  loadSchedules,
  addSchedule,
  removeSchedule,
  toggleSchedule,
} from "./schedule-eval.js";
import { getStatsForPeriod, getTodayUsageSeconds } from "./db.js";

export function handleRequest(req: Request): Response {
  switch (req.type) {
    case "status": {
      const lock = lockManager.getState();
      const config = shimManager.getConfig() ?? {
        installationType: "standalone" as const,
        claudeBinaryPath: "",
        claudeShimPath: "",
        chmodGuard: false,
        graceMinutes: 15,
      };
      return {
        type: "status",
        lock,
        config,
        todayUsageSeconds: getTodayUsageSeconds(),
      };
    }

    case "lock": {
      const lock = lockManager.lock(req.durationMinutes);
      return { type: "lock", ok: true, lock };
    }

    case "unlock": {
      const currentState = lockManager.getState();
      if (currentState.status === "locked") {
        return {
          type: "unlock",
          ok: false,
          lock: currentState,
          error: "Cannot unlock directly while locked. Complete a bypass challenge first.",
        };
      }
      const { ok, state, error } = lockManager.unlock();
      return { type: "unlock", ok, lock: state, error };
    }

    case "bypass-start": {
      const { challengeId, challenges } = lockManager.startBypass();
      return { type: "bypass-start", challengeId, challenges };
    }

    case "bypass-complete": {
      const result = lockManager.completeBypass(req.challengeId, req.answer);
      return { type: "bypass-complete", ...result };
    }

    case "schedule-add": {
      const schedule = addSchedule(req.schedule);
      return { type: "schedule-add", ok: true, schedule };
    }

    case "schedule-list": {
      return { type: "schedule-list", schedules: loadSchedules() };
    }

    case "schedule-remove": {
      const ok = removeSchedule(req.id);
      return {
        type: "schedule-remove",
        ok,
        error: ok ? undefined : "Schedule not found",
      };
    }

    case "schedule-toggle": {
      const ok = toggleSchedule(req.id, req.enabled);
      return {
        type: "schedule-toggle",
        ok,
        error: ok ? undefined : "Schedule not found",
      };
    }

    case "stats": {
      const now = new Date();
      let startDate: string;
      const endDate = now.toISOString().slice(0, 10);

      switch (req.period) {
        case "day":
          startDate = endDate;
          break;
        case "week": {
          const d = new Date(now);
          d.setDate(d.getDate() - 7);
          startDate = d.toISOString().slice(0, 10);
          break;
        }
        case "month": {
          const d = new Date(now);
          d.setDate(d.getDate() - 30);
          startDate = d.toISOString().slice(0, 10);
          break;
        }
      }

      return { type: "stats", days: getStatsForPeriod(startDate, endDate) };
    }

    case "config-get": {
      const config = shimManager.getConfig() ?? {
        installationType: "standalone" as const,
        claudeBinaryPath: "",
        claudeShimPath: "",
        chmodGuard: false,
        graceMinutes: 15,
      };
      return { type: "config-get", config };
    }

    case "config-set": {
      const config = shimManager.getConfig();
      if (!config) {
        return { type: "config-set", ok: false, error: "No config found" };
      }
      (config as Record<string, unknown>)[req.key] = req.value;
      shimManager.saveConfig(config);
      return { type: "config-set", ok: true };
    }

    case "install": {
      const detected = shimManager.detectInstallation();
      if (!detected) {
        return {
          type: "install",
          ok: false,
          installationType: "",
          claudeBinaryPath: "",
          error:
            "Could not detect Claude Code installation. Is claude installed?",
        };
      }
      shimManager.saveConfig(detected);
      return {
        type: "install",
        ok: true,
        installationType: detected.installationType,
        claudeBinaryPath: detected.claudeBinaryPath,
      };
    }

    case "uninstall": {
      const currentLock = lockManager.getState();
      if (currentLock.status === "locked" || currentLock.status === "grace") {
        return {
          type: "uninstall",
          ok: false,
          error:
            currentLock.status === "locked"
              ? "Cannot uninstall while locked. Complete a bypass challenge first (cc-lock unlock)."
              : "Cannot uninstall during a grace period. Wait for the lock to re-engage and complete a bypass challenge.",
        };
      }
      shimManager.removeShim();
      return { type: "uninstall", ok: true };
    }

    default:
      return { type: "error", message: `Unknown request type: ${(req as Request).type}` };
  }
}
