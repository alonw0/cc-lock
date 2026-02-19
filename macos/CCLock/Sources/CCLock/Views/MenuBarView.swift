import SwiftUI
import UserNotifications

@MainActor
final class MenuBarViewModel: ObservableObject {
    @Published var lock = LockState(
        status: .unlocked, lockedAt: nil, expiresAt: nil,
        bypassAttempts: 0, graceExpiresAt: nil, scheduleId: nil, hardLock: nil
    )
    @Published var todayUsageSeconds = 0
    @Published var weekStats: [DailyStats] = []
    @Published var schedules: [Schedule] = []
    @Published var connected = false
    @Published var lastError: String?
    @Published var isStartingDaemon = false

    var daemonInstalled: Bool {
        FileManager.default.fileExists(
            atPath: NSHomeDirectory() + "/Library/LaunchAgents/com.cc-lock.daemon.plist"
        )
    }

    private var pollTimer: Timer?
    private let client = DaemonClient.shared
    // nil means "first poll — don't fire notifications yet"
    private var previousLockStatus: LockStatus? = nil

    func startPolling() {
        guard pollTimer == nil else { return }
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                try? await center.requestAuthorization(options: [.alert, .sound])
            }
        }
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

    private func postNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: UUID().uuidString, content: content, trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    func poll() {
        Task {
            do {
                let status = try await client.fetchStatus()
                let newStatus = status.lock.status
                // Fire "lock ended" notification when transitioning from locked/grace → unlocked
                if let prev = previousLockStatus,
                   (prev == .locked || prev == .grace),
                   newStatus == .unlocked {
                    postNotification(title: "Lock ended", body: "Claude Code is now available.")
                }
                previousLockStatus = newStatus
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

    func startDaemon() {
        guard !isStartingDaemon else { return }
        isStartingDaemon = true
        lastError = nil

        Task {
            let plistPath = NSHomeDirectory() + "/Library/LaunchAgents/com.cc-lock.daemon.plist"

            if FileManager.default.fileExists(atPath: plistPath) {
                // Plist already exists — just start/kickstart the daemon
                let uid = String(getuid())
                _ = await runProcess("/bin/launchctl", ["bootstrap", "gui/\(uid)", plistPath])
                _ = await runProcess("/bin/launchctl", ["kickstart", "-k", "gui/\(uid)/com.cc-lock.daemon"])
            } else {
                // Plist missing — run full cc-lock install via login shell so PATH is set
                let (status, output) = await runShell("cc-lock install")
                if status != 0 {
                    let lines = output.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
                    self.lastError = lines.last ?? "Install failed — is cc-lock on your PATH?"
                    self.isStartingDaemon = false
                    return
                }
            }

            // Give the daemon a moment to open its socket then poll
            try? await Task.sleep(for: .seconds(2))
            self.poll()
            try? await Task.sleep(for: .seconds(1))
            self.isStartingDaemon = false
        }
    }

    // Run a process without blocking the main actor
    private func runProcess(_ path: String, _ args: [String]) async -> Int32 {
        await withCheckedContinuation { continuation in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: path)
            p.arguments = args
            p.terminationHandler = { continuation.resume(returning: $0.terminationStatus) }
            try? p.run()
        }
    }

    // Run a shell command via bash login shell; returns (exitCode, combinedOutput)
    private func runShell(_ command: String) async -> (Int32, String) {
        await withCheckedContinuation { continuation in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/bash")
            p.arguments = ["-l", "-c", command]
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = pipe
            p.terminationHandler = { proc in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                continuation.resume(returning: (proc.terminationStatus, output))
            }
            try? p.run()
        }
    }

    func applyLock(minutes: Int) {
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

            if !viewModel.connected {
                Button(action: { viewModel.startDaemon() }) {
                    if viewModel.isStartingDaemon {
                        Label("Starting…", systemImage: "arrow.clockwise")
                    } else if viewModel.daemonInstalled {
                        Label("Start Daemon", systemImage: "play.circle")
                    } else {
                        Label("Install & Start Daemon", systemImage: "arrow.down.circle")
                    }
                }
                .disabled(viewModel.isStartingDaemon)
                .padding(.horizontal, 8)
                .padding(.bottom, 6)
            }

            Divider()

            QuickLockSection(
                isUnlocked: viewModel.connected && viewModel.lock.status == .unlocked
            ) { minutes in
                viewModel.applyLock(minutes: minutes)
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
