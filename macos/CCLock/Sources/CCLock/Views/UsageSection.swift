import SwiftUI

struct UsageSection: View {
    let todaySeconds: Int
    let weekStats: [DailyStats]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Usage")
                .font(.caption)
                .foregroundColor(.secondary)
            HStack {
                Text("Today:")
                    .font(.caption)
                Spacer()
                Text(formatTime(todaySeconds))
                    .font(.caption.monospacedDigit())
            }
            if !weekStats.isEmpty {
                let weekTotal = weekStats.reduce(0) { $0 + $1.totalSeconds }
                HStack {
                    Text("This week:")
                        .font(.caption)
                    Spacer()
                    Text(formatTime(weekTotal))
                        .font(.caption.monospacedDigit())
                }
            }
        }
        .padding(.horizontal, 8)
    }

    private func formatTime(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        if h > 0 {
            return "\(h)h \(m)m"
        } else {
            return "\(m)m"
        }
    }
}
