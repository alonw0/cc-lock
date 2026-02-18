import SwiftUI

struct ScheduleSection: View {
    let schedules: [Schedule]
    let onToggle: (String, Bool) -> Void

    var body: some View {
        if !schedules.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Schedules")
                    .font(.caption)
                    .foregroundColor(.secondary)
                ForEach(schedules) { schedule in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(schedule.name)
                                .font(.caption)
                            Text("\(schedule.startTime)–\(schedule.endTime) (\(schedule.type))")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { schedule.enabled },
                            set: { newValue in
                                onToggle(schedule.id, newValue)
                            }
                        ))
                        .toggleStyle(.switch)
                        .controlSize(.mini)
                    }
                }
            }
            .padding(.horizontal, 8)
        }
    }
}
