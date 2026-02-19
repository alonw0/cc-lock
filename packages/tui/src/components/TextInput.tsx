import React from "react";
import { Text, Box, useInput } from "ink";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
  label?: string;
}

export function TextInput({ value, onChange, onSubmit, onCancel, placeholder, label }: Props) {
  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  const displayValue = value !== "" ? value : (placeholder ?? "");
  const displayColor = value !== "" ? undefined : "gray";

  return (
    <Box>
      {label && <Text>{label} </Text>}
      <Text color={displayColor}>{displayValue}█</Text>
    </Box>
  );
}
