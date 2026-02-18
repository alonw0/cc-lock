import React from "react";
import { Text } from "ink";
import type { LockStatus } from "@cc-lock/core";

interface Props {
  status: LockStatus;
}

export function StatusBadge({ status }: Props) {
  switch (status) {
    case "unlocked":
      return <Text color="green" bold>● UNLOCKED</Text>;
    case "locked":
      return <Text color="red" bold>● LOCKED</Text>;
    case "grace":
      return <Text color="yellow" bold>● GRACE PERIOD</Text>;
  }
}
