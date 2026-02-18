import SwiftUI

@MainActor
final class MenuBarViewModel: ObservableObject {
    @Published var lock = LockState(
        status: .unlocked, lockedAt: nil, expiresAt: nil,
        bypassAttempts: 0, graceExpiresAt: nil, scheduleId: nil
    )
    @Published var todayUsageSeconds = 0
    @Published var weekStats: [DailyStats] = []
    @Published var schedules: [Schedule] = []
    @Published var connected = false
    @Published var lastError: String?

    private var pollTimer: Timer?
    private let client = DaemonClient.shared

    func startPolling() {
        guard pollTimer == nil else { return }
        poll()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.poll()
            }
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func poll() {
        Task {
            do {
                let status = try await client.fetchStatus()
                self.lock = status.lock
                self.todayUsageSeconds = status.todayUsageSeconds
                self.connected = true
                self.lastError = nil
            } catch {
                self.connected = false
            }

            if self.connected {
                do {
                    let scheduleRes = try await client.fetchSchedules()
                    self.schedules = scheduleRes.schedules
                } catch {}

                do {
                    let statsRes = try await client.fetchStats(period: "week")
                    self.weekStats = statsRes.days
                } catch {}
            }
        }
    }

    func lock(minutes: Int) {
        Task {
            do {
                let response = try await client.lock(minutes: minutes)
                if response.ok {
                    self.lock = response.lock
                    self.lastError = nil
                } else {
                    self.lastError = response.error ?? "Lock failed"
                }
            } catch {
                self.lastError = error.localizedDescription
            }
        }
    }

    func toggleSchedule(id: String, enabled: Bool) {
        Task {
            do {
                let response = try await client.toggleSchedule(id: id, enabled: enabled)
                if !response.ok {
                    self.lastError = response.error ?? "Toggle failed"
                }
                // Re-fetch schedules
                let scheduleRes = try await client.fetchSchedules()
                self.schedules = scheduleRes.schedules
            } catch {
                self.lastError = error.localizedDescription
            }
        }
    }
}

struct MenuBarView: View {
    @ObservedObject var viewModel: MenuBarViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StatusSection(lock: viewModel.lock, connected: viewModel.connected)
                .padding(.vertical, 8)

            Divider()

            QuickLockSection(
                isUnlocked: viewModel.connected && viewModel.lock.status == .unlocked
            ) { minutes in
                viewModel.lock(minutes: minutes)
            }
            .padding(.vertical, 6)

            if viewModel.connected {
                Divider()

                UsageSection(
                    todaySeconds: viewModel.todayUsageSeconds,
                    weekStats: viewModel.weekStats
                )
                .padding(.vertical, 6)

                Divider()

                ScheduleSection(schedules: viewModel.schedules) { id, enabled in
                    viewModel.toggleSchedule(id: id, enabled: enabled)
                }
                .padding(.vertical, 6)
            }

            if let error = viewModel.lastError {
                Divider()
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
            }

            Divider()

            HStack {
                Text("Open terminal: cc-lock unlock")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)

            Divider()

            Button("Quit CCLock") {
                NSApplication.shared.terminate(nil)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .frame(width: 260)
    }
}
