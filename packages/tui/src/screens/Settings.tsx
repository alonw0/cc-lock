import React from "react";
import { Text, Box } from "ink";
import type { Config } from "@cc-lock/core";

interface Props {
  config: Config | null;
}

export function SettingsScreen({ config }: Props) {
  if (!config) {
    return (
      <Box padding={1}>
        <Text dimColor>Loading config...</Text>
      </Box>
    );
  }

  const rows: [string, string][] = [
    ["Installation", config.installationType],
    ["Binary path", config.claudeBinaryPath],
    ["Shim path", config.claudeShimPath],
    ["chmod guard", config.chmodGuard ? "enabled" : "disabled"],
    ["Grace period", `${config.graceMinutes} minutes`],
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Settings</Text>
      </Box>

      {rows.map(([label, value]) => (
        <Box key={label}>
          <Text dimColor>{label.padEnd(16)}</Text>
          <Text>{value}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>
          Edit settings with `cc-lock config` from the terminal.
        </Text>
      </Box>
    </Box>
  );
}
