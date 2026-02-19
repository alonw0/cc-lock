import React, { useEffect, useState } from "react";
import { Text, Box, useInput } from "ink";
import { useSchedules, sendRequest } from "../hooks/useDaemon.js";
import { TextInput } from "../components/TextInput.js";
import { SelectInput } from "../components/SelectInput.js";
import { MultiSelect } from "../components/MultiSelect.js";
import type { Schedule } from "@cc-lock/core";
import type { ScheduleAddResponse, ScheduleToggleResponse, ScheduleRemoveResponse } from "@cc-lock/core";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_OPTIONS = [
  { label: "Daily (every day)", value: "daily" },
  { label: "Weekdays (Mon–Fri)", value: "weekdays" },
  { label: "Weekends (Sat–Sun)", value: "weekends" },
  { label: "Custom days", value: "custom" },
];

const DAY_OPTIONS = DAY_NAMES.map((name, i) => ({ label: name, value: String(i) }));

function isValidTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

type Mode = "list" | "confirm-delete" | "add";

interface Props {
  onFormActiveChange: (active: boolean) => void;
}

export function SchedulesScreen({ onFormActiveChange }: Props) {
  const { schedules, refresh } = useSchedules();
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Wizard state
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [typeIdx, setTypeIdx] = useState(0);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Clamp cursor when list shrinks
  useEffect(() => {
    if (selectedIdx >= schedules.length && schedules.length > 0) {
      setSelectedIdx(schedules.length - 1);
    }
  }, [schedules.length, selectedIdx]);

  const enterList = () => {
    setMode("list");
    onFormActiveChange(false);
  };

  const cancelWizard = () => {
    setMode("list");
    onFormActiveChange(false);
    setStep(0);
    setName("");
    setTypeIdx(0);
    setStartTime("");
    setEndTime("");
    setWizardError(null);
  };

  const submitWizard = (days: number[]) => {
    const scheduleType = TYPE_OPTIONS[typeIdx].value as Schedule["type"];
    const schedule: Omit<Schedule, "id"> = {
      name: name.trim(),
      type: scheduleType,
      startTime,
      endTime,
      enabled: true,
      ...(scheduleType === "custom" ? { days } : {}),
    };
    sendRequest({ type: "schedule-add", schedule })
      .then((res) => {
        const r = res as ScheduleAddResponse;
        if (!r.ok) {
          setWizardError(r.error ?? "Failed to add schedule");
          return;
        }
        refresh();
        cancelWizard();
      })
      .catch((err: unknown) => {
        setWizardError(err instanceof Error ? err.message : "Unknown error");
      });
  };

  // List / confirm-delete input handler
  useInput(
    (input, key) => {
      if (mode === "confirm-delete") {
        if (input.toLowerCase() === "y") {
          const s = schedules[selectedIdx];
          if (!s) { enterList(); return; }
          sendRequest({ type: "schedule-remove", id: s.id })
            .then((res) => {
              const r = res as ScheduleRemoveResponse;
              if (!r.ok) {
                // nothing to do, just go back
              }
              refresh();
            })
            .catch(() => {})
            .finally(() => enterList());
        } else if (input.toLowerCase() === "n" || key.escape) {
          enterList();
        }
        return;
      }

      // mode === "list"
      if (key.upArrow) {
        setSelectedIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIdx((i) => Math.min(schedules.length - 1, i + 1));
        return;
      }
      // Space or Shift+T to toggle
      if ((input === " " || input === "T") && schedules.length > 0) {
        const s = schedules[selectedIdx];
        if (!s) return;
        sendRequest({ type: "schedule-toggle", id: s.id, enabled: !s.enabled })
          .then((res) => {
            const r = res as ScheduleToggleResponse;
            if (r.ok) refresh();
          })
          .catch(() => {});
        return;
      }
      // Shift+D to delete
      if (input === "D" && schedules.length > 0) {
        setMode("confirm-delete");
        onFormActiveChange(true);
        return;
      }
      // a to add
      if (input === "a") {
        setStep(0);
        setName("");
        setTypeIdx(0);
        setStartTime("");
        setEndTime("");
        setWizardError(null);
        setMode("add");
        onFormActiveChange(true);
        return;
      }
    },
    { isActive: mode !== "add" }
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Schedules</Text>
      </Box>

      {/* ── LIST ── */}
      {mode !== "add" && (
        <>
          {schedules.length === 0 ? (
            <Text dimColor>No schedules configured.</Text>
          ) : (
            <Box flexDirection="column">
              {schedules.map((s, i) => (
                <Box key={s.id} marginBottom={1} flexDirection="column">
                  <Box>
                    <Text color={i === selectedIdx ? "green" : undefined}>
                      {i === selectedIdx ? "▶ " : "  "}
                    </Text>
                    <Text color={s.enabled ? "green" : "red"}>
                      {s.enabled ? "●" : "○"}{" "}
                    </Text>
                    <Text bold={i === selectedIdx}>{s.name}</Text>
                    <Text dimColor>  {s.id.slice(0, 10)}</Text>
                  </Box>
                  <Box paddingLeft={4}>
                    <Text>
                      {s.startTime} – {s.endTime}
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

          {/* Confirm-delete prompt */}
          {mode === "confirm-delete" && schedules[selectedIdx] && (
            <Box marginTop={1} borderStyle="round" paddingX={1} flexDirection="column">
              <Text color="yellow">
                Delete "{schedules[selectedIdx]!.name}"?
              </Text>
              <Text>[Y] Delete  [N/Esc] Cancel</Text>
            </Box>
          )}

          {/* Footer */}
          {mode === "list" && (
            <Box marginTop={1} borderStyle="single" paddingX={1}>
              <Text dimColor>
                [↑/↓] Navigate{"  "}
                [Space/T] Toggle{"  "}
                [D] Delete{"  "}
                [A] Add
              </Text>
            </Box>
          )}
        </>
      )}

      {/* ── ADD WIZARD ── */}
      {mode === "add" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>New Schedule</Text>
            <Text dimColor>  [Esc] Cancel</Text>
          </Box>

          {wizardError && (
            <Box marginBottom={1}>
              <Text color="red">{wizardError}</Text>
            </Box>
          )}

          {/* Step 0: Name */}
          {step === 0 && (
            <Box flexDirection="column">
              <Text dimColor>Step 1/4 – Name</Text>
              <TextInput
                label="Name:"
                value={name}
                onChange={(v) => { setName(v); setWizardError(null); }}
                onSubmit={(v) => {
                  if (!v.trim()) { setWizardError("Name is required"); return; }
                  setWizardError(null);
                  setStep(1);
                }}
                onCancel={cancelWizard}
                placeholder="e.g. Morning focus"
              />
            </Box>
          )}

          {/* Step 1: Type */}
          {step === 1 && (
            <Box flexDirection="column">
              <Text dimColor>Step 2/4 – Type</Text>
              <SelectInput
                options={TYPE_OPTIONS}
                selectedIndex={typeIdx}
                onSelect={(idx) => {
                  setTypeIdx(idx);
                  setWizardError(null);
                  setStep(2);
                }}
                onCancel={cancelWizard}
              />
            </Box>
          )}

          {/* Step 2: Start time */}
          {step === 2 && (
            <Box flexDirection="column">
              <Text dimColor>Step 3/4 – Start time (HH:MM)</Text>
              <TextInput
                label="Start:"
                value={startTime}
                onChange={(v) => { setStartTime(v); setWizardError(null); }}
                onSubmit={(v) => {
                  if (!isValidTime(v)) { setWizardError("Enter time as HH:MM (e.g. 09:00)"); return; }
                  setWizardError(null);
                  setStep(3);
                }}
                onCancel={cancelWizard}
                placeholder="09:00"
              />
            </Box>
          )}

          {/* Step 3: End time */}
          {step === 3 && (
            <Box flexDirection="column">
              <Text dimColor>Step 4/4 – End time (HH:MM)</Text>
              <TextInput
                label="End:"
                value={endTime}
                onChange={(v) => { setEndTime(v); setWizardError(null); }}
                onSubmit={(v) => {
                  if (!isValidTime(v)) { setWizardError("Enter time as HH:MM (e.g. 17:00)"); return; }
                  if (v <= startTime) { setWizardError("End time must be after start time"); return; }
                  setWizardError(null);
                  const scheduleType = TYPE_OPTIONS[typeIdx].value;
                  if (scheduleType === "custom") {
                    setStep(4);
                  } else {
                    submitWizard([]);
                  }
                }}
                onCancel={cancelWizard}
                placeholder="17:00"
              />
            </Box>
          )}

          {/* Step 4: Days (custom only) */}
          {step === 4 && (
            <Box flexDirection="column">
              <Text dimColor>Select days</Text>
              <MultiSelect
                options={DAY_OPTIONS}
                selected={[]}
                onConfirm={(vals) => submitWizard(vals.map(Number))}
                onCancel={cancelWizard}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
