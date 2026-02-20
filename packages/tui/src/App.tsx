import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useDaemonStatus } from "./hooks/useDaemon.js";
import { Dashboard } from "./screens/Dashboard.js";
import { StatsScreen } from "./screens/Stats.js";
import { SchedulesScreen } from "./screens/Schedules.js";
import { SettingsScreen } from "./screens/Settings.js";

type Tab = "dashboard" | "stats" | "schedules" | "settings";

const TABS: { key: string; id: Tab; label: string }[] = [
  { key: "d", id: "dashboard", label: "Dashboard" },
  { key: "s", id: "stats", label: "Stats" },
  { key: "c", id: "schedules", label: "Schedules" },
  { key: "t", id: "settings", label: "Settings" },
];

export const ADDICT_BANNER = [
  " ██╗   ██╗  ██████╗  ██╗   ██╗      █████╗  ██████╗  ███████╗",
  " ╚██╗ ██╔╝ ██╔═══██╗ ██║   ██║     ██╔══██╗ ██╔══██╗ ██╔════╝",
  "  ╚████╔╝  ██║   ██║ ██║   ██║     ███████║ ██████╔╝ █████╗  ",
  "   ╚██╔╝   ██║   ██║ ██║   ██║     ██╔══██║ ██╔══██╗ ██╔══╝  ",
  "    ██║    ╚██████╔╝ ╚██████╔╝     ██║  ██║ ██║  ██║ ███████╗",
  "    ╚═╝     ╚═════╝   ╚═════╝      ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚══════╝",
  "",
  "  █████╗  ███╗   ██╗      █████╗  ██████╗  ██████╗  ██╗  ██████╗ ████████╗",
  " ██╔══██╗ ████╗  ██║     ██╔══██╗ ██╔══██╗ ██╔══██╗ ██║ ██╔════╝ ╚══██╔══╝",
  " ███████║ ██╔██╗ ██║     ███████║ ██║  ██║ ██║  ██║ ██║ ██║         ██║   ",
  " ██╔══██║ ██║╚██╗██║     ██╔══██║ ██║  ██║ ██║  ██║ ██║ ██║         ██║   ",
  " ██║  ██║ ██║ ╚████║     ██║  ██║ ██████╔╝ ██████╔╝ ██║ ╚██████╗    ██║   ",
  " ╚═╝  ╚═╝ ╚═╝  ╚═══╝     ╚═╝  ╚═╝ ╚═════╝  ╚═════╝  ╚═╝  ╚═════╝    ╚═╝  ",
];

const LOGO_BODY = [
  "      ╭──────╮",
  "      │      │",
  "  ╔═══╧══════╧═══╗",
  "  ║              ║",
  "  ║  cc · lock   ║",
  "  ║              ║",
  "  ║  ○  ○  ○  ○  ║",
  "  ╚══════════════╝",
];

const LOGO_LOCKED_BODY = [
  "      ╭──────╮",
  "      ╰──────╯",
  "  ╔═══╧══════╧═══╗",
  "  ║              ║",
  "  ║  cc · lock   ║",
  "  ║              ║",
  "  ║  ○  ○  ○  ○  ║",
  "  ╚══════════════╝",
];

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [formActive, setFormActive] = useState(false);
  const { lock, config, todayUsage, connected, refresh } = useDaemonStatus();
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    // Tab switching (only when not in a sub-mode)
    for (const t of TABS) {
      if (input === t.key && tab !== t.id) {
        setTab(t.id);
        return;
      }
    }
  }, { isActive: !formActive });

  const lockColor = !connected
    ? "gray"
    : lock?.status === "locked"
      ? "red"
      : lock?.status === "grace"
        ? "yellow"
        : "green";

  const tagline = !connected
    ? "  connecting..."
    : lock?.status === "locked"
      ? "  you locked yourself. good."
      : lock?.status === "grace"
        ? "  enjoy your grace period."
        : "  I can stop whenever I want.";

  return (
    <Box flexDirection="column">
      {/* Logo */}
      <Box flexDirection="column" paddingX={1}>
        {(lock?.status === "locked" ? LOGO_LOCKED_BODY : LOGO_BODY).map((line, i) => (
          <Text key={i} color={lockColor}>{line}</Text>
        ))}
        <Text color={lockColor} dimColor>{tagline}</Text>
      </Box>

      {/* Tab bar */}
      <Box borderStyle="single" paddingX={1}>
        {TABS.map((t, i) => (
          <React.Fragment key={t.id}>
            {i > 0 && <Text> | </Text>}
            <Text
              bold={tab === t.id}
              color={tab === t.id ? "green" : undefined}
              dimColor={tab !== t.id}
            >
              [{t.key.toUpperCase()}] {t.label}
            </Text>
          </React.Fragment>
        ))}
        <Text> | </Text>
        <Text dimColor>[Q] Quit</Text>
      </Box>

      {/* Content */}
      {tab === "dashboard" && (
        <Dashboard
          lock={lock}
          todayUsage={todayUsage}
          connected={connected}
          onRefresh={refresh}
        />
      )}
      {tab === "stats" && <StatsScreen />}
      {tab === "schedules" && <SchedulesScreen onFormActiveChange={setFormActive} />}
      {tab === "settings" && <SettingsScreen config={config} lock={lock} onRefresh={refresh} onFormActiveChange={setFormActive} />}
    </Box>
  );
}
