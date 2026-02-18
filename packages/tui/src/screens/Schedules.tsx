import React from "react";
import { Text, Box } from "ink";
import { useSchedules } from "../hooks/useDaemon.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SchedulesScreen() {
  const { schedules } = useSchedules();

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Schedules</Text>
      </Box>

      {schedules.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No schedules configured.</Text>
          <Text dimColor>
            Use `cc-lock schedule add` from the terminal to create one.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {schedules.map((s) => (
            <Box key={s.id} marginBottom={1} flexDirection="column">
              <Box>
                <Text color={s.enabled ? "green" : "red"}>
                  {s.enabled ? "●" : "○"}{" "}
                </Text>
                <Text bold>{s.name}</Text>
                <Text dimColor>  {s.id.slice(0, 10)}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text>
                  {s.startTime} - {s.endTime}
                  {"  "}
                  <Text dimColor>
                    {s.type === "custom" && s.days
                      ? s.days.map((d) => DAY_NAMES[d]).join(", ")
                      : s.type}
                  </Text>
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
