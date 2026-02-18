@preconcurrency import Foundation
import Network

actor DaemonClient {
    static let shared = DaemonClient()
    static let socketPath = "/tmp/cc-lock.sock"

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func send<Req: Encodable, Res: Decodable>(
        _ request: Req,
        as responseType: Res.Type
    ) async throws -> Res {
        let requestData = try encoder.encode(request)

        return try await withCheckedThrowingContinuation { continuation in
            let endpoint = NWEndpoint.unix(path: Self.socketPath)
            let connection = NWConnection(to: endpoint, using: .tcp)
            var buffer = Data()
            nonisolated(unsafe) var resumed = false

            let timeout = DispatchWorkItem {
                if !resumed {
                    resumed = true
                    connection.cancel()
                    continuation.resume(throwing: DaemonError.timeout)
                }
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 5, execute: timeout)

            func receive() {
                connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, _, _, error in
                    if let error = error {
                        if !resumed {
                            resumed = true
                            timeout.cancel()
                            connection.cancel()
                            continuation.resume(throwing: error)
                        }
                        return
                    }

                    if let data = content {
                        buffer.append(data)
                    }

                    if let newlineIndex = buffer.firstIndex(of: UInt8(ascii: "\n")) {
                        let lineData = buffer[buffer.startIndex..<newlineIndex]
                        if !resumed {
                            resumed = true
                            timeout.cancel()
                            connection.cancel()
                            do {
                                // Check for error response first
                                if let jsonObj = try JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                                   let type = jsonObj["type"] as? String, type == "error",
                                   let message = jsonObj["message"] as? String {
                                    continuation.resume(throwing: DaemonError.serverError(message))
                                } else {
                                    let response = try self.decoder.decode(Res.self, from: lineData)
                                    continuation.resume(returning: response)
                                }
                            } catch {
                                continuation.resume(throwing: error)
                            }
                        }
                    } else {
                        receive()
                    }
                }
            }

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    var payload = requestData
                    payload.append(UInt8(ascii: "\n"))
                    connection.send(content: payload, completion: .contentProcessed { error in
                        if let error = error, !resumed {
                            resumed = true
                            timeout.cancel()
                            connection.cancel()
                            continuation.resume(throwing: error)
                        }
                    })
                    receive()
                case .failed(let error):
                    if !resumed {
                        resumed = true
                        timeout.cancel()
                        connection.cancel()
                        continuation.resume(throwing: error)
                    }
                case .waiting(let error):
                    if !resumed {
                        resumed = true
                        timeout.cancel()
                        connection.cancel()
                        continuation.resume(throwing: error)
                    }
                default:
                    break
                }
            }

            connection.start(queue: .global())
        }
    }

    func fetchStatus() async throws -> StatusResponse {
        try await send(StatusRequest(), as: StatusResponse.self)
    }

    func lock(minutes: Int) async throws -> LockResponse {
        try await send(LockRequest(durationMinutes: minutes), as: LockResponse.self)
    }

    func fetchSchedules() async throws -> ScheduleListResponse {
        try await send(ScheduleListRequest(), as: ScheduleListResponse.self)
    }

    func toggleSchedule(id: String, enabled: Bool) async throws -> ScheduleToggleResponse {
        try await send(ScheduleToggleRequest(id: id, enabled: enabled), as: ScheduleToggleResponse.self)
    }

    func fetchStats(period: String) async throws -> StatsResponse {
        try await send(StatsRequest(period: period), as: StatsResponse.self)
    }
}

enum DaemonError: LocalizedError {
    case timeout
    case serverError(String)
    case notConnected

    var errorDescription: String? {
        switch self {
        case .timeout: return "Connection to daemon timed out"
        case .serverError(let msg): return msg
        case .notConnected: return "Daemon is not running"
        }
    }
}
