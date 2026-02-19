import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

interface Option {
  label: string;
  value: string;
}

interface Props {
  options: Option[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCancel: () => void;
}

export function SelectInput({ options, selectedIndex: initialIndex, onSelect, onCancel }: Props) {
  const [idx, setIdx] = useState(initialIndex);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSelect(idx);
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
  });

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => (
        <Text key={opt.value} color={i === idx ? "green" : undefined}>
          {i === idx ? "▶ " : "  "}
          {opt.label}
        </Text>
      ))}
    </Box>
  );
}
