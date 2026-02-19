import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import type { Config } from "@cc-lock/core";
import { sendRequest } from "../hooks/useDaemon.js";
import type { ConfigSetResponse } from "@cc-lock/core";
import { TextInput } from "../components/TextInput.js";

interface Props {
  config: Config | null;
  onRefresh: () => void;
  onFormActiveChange: (active: boolean) => void;
}

type SettingRow =
  | { kind: "bool"; key: keyof Config; label: string; value: boolean }
  | { kind: "number"; key: keyof Config; label: string; value: number; unit: string };

export function SettingsScreen({ config, onRefresh, onFormActiveChange }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const rows: SettingRow[] = config
    ? [
        { kind: "bool", key: "chmodGuard", label: "chmod guard", value: config.chmodGuard },
        {
          kind: "bool",
          key: "challengeBypassEnabled",
          label: "Allow bypass",
          value: config.challengeBypassEnabled ?? true,
        },
        {
          kind: "bool",
          key: "paymentBypassEnabled",
          label: "Payment bypass",
          value: config.paymentBypassEnabled ?? false,
        },
        {
          kind: "number",
          key: "graceMinutes",
          label: "Grace period",
          value: config.graceMinutes,
          unit: "min",
        },
      ]
    : [];

  const save = (key: keyof Config, value: unknown) => {
    setPending(true);
    setError(null);
    sendRequest({ type: "config-set", key, value })
      .then((res) => {
        const r = res as ConfigSetResponse;
        if (!r.ok) setError(r.error ?? "Failed to update setting");
        else onRefresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => setPending(false));
  };

  const exitEdit = () => {
    setEditing(false);
    setEditValue("");
    onFormActiveChange(false);
  };

  // Navigation and activation — disabled while editing (TextInput handles input then)
  useInput(
    (input, key) => {
      if (!config || pending) return;

      if (key.upArrow) {
        setSelectedIdx((i) => Math.max(0, i - 1));
        setError(null);
        return;
      }
      if (key.downArrow) {
        setSelectedIdx((i) => Math.min(rows.length - 1, i + 1));
        setError(null);
        return;
      }

      const row = rows[selectedIdx];
      if (!row) return;

      if (row.kind === "bool" && (input === " " || key.return)) {
        save(row.key, !row.value);
        return;
      }

      if (row.kind === "number" && key.return) {
        setEditValue(String(row.value));
        setEditing(true);
        onFormActiveChange(true);
        return;
      }
    },
    { isActive: !!config && !editing }
  );

  if (!config) {
    return (
      <Box padding={1}>
        <Text dimColor>Loading config...</Text>
      </Box>
    );
  }

  const infoRows: [string, string][] = [
    ["Installation", config.installationType],
    ["Binary path", config.claudeBinaryPath],
    ["Shim path", config.claudeShimPath],
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Settings</Text>
      </Box>

      {/* Read-only info */}
      {infoRows.map(([label, value]) => (
        <Box key={label}>
          <Text dimColor>{label.padEnd(16)}</Text>
          <Text>{value}</Text>
        </Box>
      ))}

      {/* Navigable / editable rows */}
      <Box marginTop={1} flexDirection="column">
        {rows.map((row, i) => {
          const isSelected = i === selectedIdx;
          const isEditingThis = isSelected && editing && row.kind === "number";

          return (
            <Box key={row.key}>
              <Text color={isSelected ? "green" : undefined}>
                {isSelected ? "▶ " : "  "}
              </Text>
              <Text dimColor>{row.label.padEnd(14)}</Text>

              {row.kind === "bool" && (
                <Text color={row.value ? "green" : "red"}>
                  {row.value ? "[✓] enabled " : "[○] disabled"}
                </Text>
              )}

              {row.kind === "number" && !isEditingThis && (
                <Text>
                  {row.value} <Text dimColor>{row.unit}</Text>
                </Text>
              )}

              {row.kind === "number" && isEditingThis && (
                <TextInput
                  value={editValue}
                  onChange={setEditValue}
                  onSubmit={(v) => {
                    const n = parseInt(v, 10);
                    if (!v.trim() || isNaN(n) || n < 1) {
                      setError("Enter a whole number of minutes (≥ 1)");
                      return;
                    }
                    exitEdit();
                    save(row.key, n);
                  }}
                  onCancel={exitEdit}
                  placeholder="minutes"
                />
              )}
            </Box>
          );
        })}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" paddingX={1}>
        <Text dimColor>
          {pending
            ? "Saving..."
            : editing
              ? "[Enter] Save  [Esc] Cancel"
              : "[↑/↓] Navigate  [Space/Enter] Toggle / Edit"}
        </Text>
      </Box>
    </Box>
  );
}
