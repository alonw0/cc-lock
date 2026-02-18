import Foundation

// MARK: - Core Types (matching packages/core/src/types.ts)

enum LockStatus: String, Codable {
    case unlocked
    case locked
    case grace
}

struct LockState: Codable {
    let status: LockStatus
    let lockedAt: String?
    let expiresAt: String?
    let bypassAttempts: Int
    let graceExpiresAt: String?
    let scheduleId: String?
}

struct Config: Codable {
    let installationType: String
    let claudeBinaryPath: String
    let claudeShimPath: String
    let chmodGuard: Bool
    let graceMinutes: Int
}

struct Schedule: Codable, Identifiable {
    let id: String
    let name: String
    let type: String
    let startTime: String
    let endTime: String
    let days: [Int]?
    let enabled: Bool
}

struct DailyStats: Codable {
    let date: String
    let totalSeconds: Int
    let sessionCount: Int
    let bypassCount: Int
}

// MARK: - Request Types (matching packages/core/src/protocol.ts)

struct StatusRequest: Encodable {
    let type = "status"
}

struct LockRequest: Encodable {
    let type = "lock"
    let durationMinutes: Int
}

struct ScheduleListRequest: Encodable {
    let type = "schedule-list"
}

struct ScheduleToggleRequest: Encodable {
    let type = "schedule-toggle"
    let id: String
    let enabled: Bool
}

struct StatsRequest: Encodable {
    let type = "stats"
    let period: String
}

// MARK: - Response Types

struct StatusResponse: Decodable {
    let type: String
    let lock: LockState
    let config: Config
    let todayUsageSeconds: Int
}

struct LockResponse: Decodable {
    let type: String
    let ok: Bool
    let lock: LockState
    let error: String?
}

struct ScheduleListResponse: Decodable {
    let type: String
    let schedules: [Schedule]
}

struct ScheduleToggleResponse: Decodable {
    let type: String
    let ok: Bool
    let error: String?
}

struct StatsResponse: Decodable {
    let type: String
    let days: [DailyStats]
}

struct ErrorResponse: Decodable {
    let type: String
    let message: String
}
