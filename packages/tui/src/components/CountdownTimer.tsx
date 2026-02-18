import React, { useState, useEffect } from "react";
import { Text } from "ink";

interface Props {
  expiresAt: string;
  label?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function CountdownTimer({ expiresAt, label = "Expires in" }: Props) {
  const [remaining, setRemaining] = useState(
    new Date(expiresAt).getTime() - Date.now()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const color = remaining < 60000 ? "red" : remaining < 300000 ? "yellow" : "white";

  return (
    <Text>
      {label}: <Text color={color} bold>{formatRemaining(remaining)}</Text>
    </Text>
  );
}
