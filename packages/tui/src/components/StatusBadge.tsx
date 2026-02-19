import React from "react";
import { Text } from "ink";
import type { LockStatus } from "@cc-lock/core";

interface Props {
  status: LockStatus;
  hardLock?: boolean;
}

export function StatusBadge({ status, hardLock }: Props) {
  switch (status) {
    case "unlocked":
      return <Text color="green" bold>● UNLOCKED</Text>;
    case "locked":
      return hardLock
        ? <Text color="red" bold>● HARD LOCKED</Text>
        : <Text color="red" bold>● LOCKED</Text>;
    case "grace":
      return <Text color="yellow" bold>● GRACE PERIOD</Text>;
  }
}
