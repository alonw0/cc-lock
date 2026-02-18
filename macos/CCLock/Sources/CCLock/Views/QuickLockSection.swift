import SwiftUI

struct QuickLockSection: View {
    let isUnlocked: Bool
    let onLock: (Int) -> Void

    private let presets: [(String, Int)] = [
        ("30m", 30),
        ("1h", 60),
        ("2h", 120),
        ("4h", 240),
    ]

    var body: some View {
        if isUnlocked {
            VStack(alignment: .leading, spacing: 6) {
                Text("Quick Lock")
                    .font(.caption)
                    .foregroundColor(.secondary)
                HStack(spacing: 8) {
                    ForEach(presets, id: \.1) { label, minutes in
                        Button(label) {
                            onLock(minutes)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
            }
            .padding(.horizontal, 8)
        }
    }
}
