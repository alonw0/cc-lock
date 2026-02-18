import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { useStats } from "../hooks/useDaemon.js";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const PERIODS = [
  { key: "1", id: "day" as const, label: "Today" },
  { key: "2", id: "week" as const, label: "Week" },
  { key: "3", id: "month" as const, label: "Month" },
];

export function StatsScreen() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const days = useStats(period);

  useInput((input) => {
    const p = PERIODS.find((p) => p.key === input);
    if (p) setPeriod(p.id);
  });

  const totalSeconds = days.reduce((s, d) => s + d.totalSeconds, 0);
  const totalSessions = days.reduce((s, d) => s + d.sessionCount, 0);
  const totalBypasses = days.reduce((s, d) => s + d.bypassCount, 0);
  const maxSeconds = Math.max(...days.map((d) => d.totalSeconds), 1);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Usage Statistics  </Text>
        {PERIODS.map((p) => (
          <Text key={p.key} color={period === p.id ? "green" : undefined} bold={period === p.id}>
            [{p.key}] {p.label}{"  "}
          </Text>
        ))}
      </Box>

      {days.length === 0 ? (
        <Text dimColor>No usage data for this period.</Text>
      ) : (
        <Box flexDirection="column">
          {/* Bar chart */}
          {days.map((day) => {
            const barWidth = Math.max(
              1,
              Math.round((day.totalSeconds / maxSeconds) * 40)
            );
            const bar = "█".repeat(barWidth);
            const dayLabel = day.date.slice(5); // MM-DD
            return (
              <Box key={day.date}>
                <Text dimColor>{dayLabel} </Text>
                <Text color="green">{bar}</Text>
                <Text> {formatDuration(day.totalSeconds)}</Text>
              </Box>
            );
          })}

          {/* Summary */}
          <Box marginTop={1} flexDirection="column">
            <Text bold>
              Total: {formatDuration(totalSeconds)} across {totalSessions}{" "}
              session{totalSessions !== 1 ? "s" : ""}
            </Text>
            {totalBypasses > 0 && (
              <Text color="yellow">Bypasses: {totalBypasses}</Text>
            )}
            {days.length > 1 && (
              <Text dimColor>
                Avg: {formatDuration(Math.round(totalSeconds / days.length))}/day
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
