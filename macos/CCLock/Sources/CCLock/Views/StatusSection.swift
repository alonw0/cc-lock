import SwiftUI

struct StatusSection: View {
    let lock: LockState
    let connected: Bool
    @State private var now = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !connected {
                Label("Daemon not connected", systemImage: "wifi.slash")
                    .foregroundColor(.secondary)
            } else {
                switch lock.status {
                case .unlocked:
                    Label("Claude Code is unlocked", systemImage: "lock.open")
                        .foregroundColor(.green)

                case .locked:
                    Label("Claude Code is locked", systemImage: "lock.fill")
                        .foregroundColor(.red)
                    if let expiresAt = lock.expiresAt, let expiry = parseISO(expiresAt) {
                        let remaining = expiry.timeIntervalSince(now)
                        if remaining > 0 {
                            Text("Unlocks in \(formatDuration(remaining))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("Expires: \(expiry.formatted(date: .omitted, time: .shortened))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text("Lock expired, pending update...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    if lock.bypassAttempts > 0 {
                        Text("Bypass attempts: \(lock.bypassAttempts)")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }

                case .grace:
                    Label("Grace period active", systemImage: "lock.shield")
                        .foregroundColor(.yellow)
                    if let graceExpiresAt = lock.graceExpiresAt, let expiry = parseISO(graceExpiresAt) {
                        let remaining = expiry.timeIntervalSince(now)
                        if remaining > 0 {
                            Text("Re-locks in \(formatDuration(remaining))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .onReceive(timer) { _ in
            now = Date()
        }
    }

    private func parseISO(_ str: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = formatter.date(from: str) { return d }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: str)
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%dh %02dm %02ds", h, m, s)
        } else if m > 0 {
            return String(format: "%dm %02ds", m, s)
        } else {
            return "\(s)s"
        }
    }
}
