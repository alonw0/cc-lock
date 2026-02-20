import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { CountdownTimer } from "../components/CountdownTimer.js";
import { sendRequest } from "../hooks/useDaemon.js";
import type { LockState, LockResponse } from "@cc-lock/core";

interface Props {
  lock: LockState | null;
  todayUsage: number;
  connected: boolean | null;
  onRefresh: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const LOCK_PRESETS = [
  { key: "1", label: "30m", minutes: 30 },
  { key: "2", label: "1h", minutes: 60 },
  { key: "3", label: "2h", minutes: 120 },
  { key: "4", label: "4h", minutes: 240 },
];

export function Dashboard({ lock, todayUsage, connected, onRefresh }: Props) {
  const [mode, setMode] = useState<"normal" | "locking">("normal");
  const [message, setMessage] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      setMode("normal");
      setMessage(null);
      return;
    }

    if (mode === "locking") {
      const preset = LOCK_PRESETS.find((p) => p.key === input);
      if (preset) {
        sendRequest({ type: "lock", durationMinutes: preset.minutes }).then(
          (res) => {
            const lr = res as LockResponse;
            if (lr.ok) {
              setMessage(`Locked for ${preset.label}`);
            } else {
              setMessage(`Error: ${lr.error}`);
            }
            setMode("normal");
            onRefresh();
          }
        );
      }
      return;
    }

    // Normal mode shortcuts
    if (input === "l" && lock?.status === "unlocked") {
      setMode("locking");
      setMessage(null);
      return;
    }
    if (input === "r" && lock?.status === "unlocked") {
      sendRequest({ type: "stats-reset" })
        .then(() => onRefresh())
        .catch(() => {});
    }
  });

  if (connected === null) {
    return (
      <Box padding={1}>
        <Text dimColor>Connecting to daemon...</Text>
      </Box>
    );
  }

  if (!connected) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Daemon not connected
        </Text>
        <Text>Run `cc-lock install` to set up the daemon.</Text>
      </Box>
    );
  }

  if (!lock) {
    return (
      <Box padding={1}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Dashboard</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Status: </Text>
        <StatusBadge status={lock.status} hardLock={lock.hardLock} />
      </Box>

      {lock.status === "locked" && lock.expiresAt && (
        <Box marginBottom={1} flexDirection="column">
          <CountdownTimer expiresAt={lock.expiresAt} />
          <Text dimColor>
            Expires at{" "}
            {new Date(lock.expiresAt).toLocaleTimeString()}
          </Text>
          {!lock.hardLock && <Text>Bypass attempts: {lock.bypassAttempts}</Text>}
          {lock.hardLock && <Text dimColor>No bypass allowed</Text>}
          {!lock.hardLock && (
            <Text dimColor>Run `cc-lock unlock` to bypass</Text>
          )}
        </Box>
      )}

      {lock.status === "grace" && lock.graceExpiresAt && (
        <Box marginBottom={1} flexDirection="column">
          <CountdownTimer
            expiresAt={lock.graceExpiresAt}
            label="Grace expires in"
          />
          <Text dimColor>
            Lock re-engages at{" "}
            {new Date(lock.graceExpiresAt).toLocaleTimeString()}
          </Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text>
          Today's usage:{" "}
          <Text bold>{formatDuration(todayUsage)}</Text>
        </Text>
      </Box>

      {lock.status === "unlocked" && (lock.pendingResumeKeys?.length ?? 0) > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold>Sessions to resume:</Text>
          {lock.pendingResumeKeys!.map((key) => (
            <Text key={key} dimColor>  claude --resume {key}</Text>
          ))}
        </Box>
      )}

      {message && (
        <Box marginBottom={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {mode === "locking" ? (
        <Box borderStyle="round" paddingX={1} flexDirection="column">
          <Text bold>Lock for how long?</Text>
          <Box marginTop={1}>
            {LOCK_PRESETS.map((p) => (
              <Text key={p.key}>
                [{p.key}] {p.label}{"  "}
              </Text>
            ))}
            <Text dimColor>[Esc] Cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box borderStyle="single" paddingX={1}>
          <Text dimColor>
            {lock.status === "unlocked" ? "[L] Lock  [R] Reset today  " : ""}
            [Q] Quit
          </Text>
        </Box>
      )}
    </Box>
  );
}
