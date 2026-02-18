import type {
  LockState,
  Config,
  Schedule,
  DailyStats,
  Challenge,
} from "./types.js";

// ── Request types ──

export interface StatusRequest {
  type: "status";
}

export interface LockRequest {
  type: "lock";
  durationMinutes: number;
}

export interface UnlockRequest {
  type: "unlock";
}

export interface BypassStartRequest {
  type: "bypass-start";
}

export interface BypassCompleteRequest {
  type: "bypass-complete";
  challengeId: string;
  answer: string;
}

export interface ScheduleAddRequest {
  type: "schedule-add";
  schedule: Omit<Schedule, "id">;
}

export interface ScheduleListRequest {
  type: "schedule-list";
}

export interface ScheduleRemoveRequest {
  type: "schedule-remove";
  id: string;
}

export interface ScheduleToggleRequest {
  type: "schedule-toggle";
  id: string;
  enabled: boolean;
}

export interface StatsRequest {
  type: "stats";
  period: "day" | "week" | "month";
}

export interface ConfigGetRequest {
  type: "config-get";
}

export interface ConfigSetRequest {
  type: "config-set";
  key: string;
  value: unknown;
}

export interface InstallRequest {
  type: "install";
}

export interface UninstallRequest {
  type: "uninstall";
}

export type Request =
  | StatusRequest
  | LockRequest
  | UnlockRequest
  | BypassStartRequest
  | BypassCompleteRequest
  | ScheduleAddRequest
  | ScheduleListRequest
  | ScheduleRemoveRequest
  | ScheduleToggleRequest
  | StatsRequest
  | ConfigGetRequest
  | ConfigSetRequest
  | InstallRequest
  | UninstallRequest;

// ── Response types ──

export interface StatusResponse {
  type: "status";
  lock: LockState;
  config: Config;
  todayUsageSeconds: number;
}

export interface LockResponse {
  type: "lock";
  ok: boolean;
  lock: LockState;
  error?: string;
}

export interface UnlockResponse {
  type: "unlock";
  ok: boolean;
  lock: LockState;
  error?: string;
}

export interface BypassStartResponse {
  type: "bypass-start";
  challengeId: string;
  challenges: Challenge[];
}

export interface BypassCompleteResponse {
  type: "bypass-complete";
  ok: boolean;
  graceExpiresAt?: string;
  error?: string;
}

export interface ScheduleAddResponse {
  type: "schedule-add";
  ok: boolean;
  schedule?: Schedule;
  error?: string;
}

export interface ScheduleListResponse {
  type: "schedule-list";
  schedules: Schedule[];
}

export interface ScheduleRemoveResponse {
  type: "schedule-remove";
  ok: boolean;
  error?: string;
}

export interface ScheduleToggleResponse {
  type: "schedule-toggle";
  ok: boolean;
  error?: string;
}

export interface StatsResponse {
  type: "stats";
  days: DailyStats[];
}

export interface ConfigGetResponse {
  type: "config-get";
  config: Config;
}

export interface ConfigSetResponse {
  type: "config-set";
  ok: boolean;
  error?: string;
}

export interface InstallResponse {
  type: "install";
  ok: boolean;
  installationType: string;
  claudeBinaryPath: string;
  error?: string;
}

export interface UninstallResponse {
  type: "uninstall";
  ok: boolean;
  error?: string;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}

export type Response =
  | StatusResponse
  | LockResponse
  | UnlockResponse
  | BypassStartResponse
  | BypassCompleteResponse
  | ScheduleAddResponse
  | ScheduleListResponse
  | ScheduleRemoveResponse
  | ScheduleToggleResponse
  | StatsResponse
  | ConfigGetResponse
  | ConfigSetResponse
  | InstallResponse
  | UninstallResponse
  | ErrorResponse;
