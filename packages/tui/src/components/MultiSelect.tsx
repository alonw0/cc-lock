import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

interface Option {
  label: string;
  value: string;
}

interface Props {
  options: Option[];
  selected: string[];
  onConfirm: (selected: string[]) => void;
  onCancel: () => void;
}

export function MultiSelect({ options, selected: initialSelected, onConfirm, onCancel }: Props) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onConfirm([...selected]);
      return;
    }
    if (key.upArrow) {
      setIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setIdx((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (input === " ") {
      const val = options[idx].value;
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(val)) next.delete(val);
        else next.add(val);
        return next;
      });
    }
  });

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => (
        <Text key={opt.value} color={i === idx ? "green" : undefined}>
          {i === idx ? "▶ " : "  "}
          {selected.has(opt.value) ? "[✓] " : "[ ] "}
          {opt.label}
        </Text>
      ))}
      <Text dimColor>  [Space] Toggle  [Enter] Confirm  [Esc] Cancel</Text>
    </Box>
  );
}
