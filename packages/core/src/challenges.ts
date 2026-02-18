import { randomBytes } from "crypto";
import type { Challenge } from "./types.js";
import { BYPASS_COOLDOWNS } from "./constants.js";

function randomString(length: number): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b: number) => chars[b % chars.length])
    .join("");
}

function randomMathProblem(): { prompt: string; answer: string } {
  const ops = [
    { sym: "*", fn: (a: number, b: number) => a * b },
    { sym: "+", fn: (a: number, b: number) => a + b },
    { sym: "-", fn: (a: number, b: number) => a - b },
  ];
  const op = ops[Math.floor(Math.random() * ops.length)]!;
  const a = Math.floor(Math.random() * 900) + 100;
  const b = Math.floor(Math.random() * 90) + 10;
  return {
    prompt: `${a} ${op.sym} ${b}`,
    answer: String(op.fn(a, b)),
  };
}

export function generateChallenges(attemptNumber: number): Challenge[] {
  const cooldown =
    BYPASS_COOLDOWNS[Math.min(attemptNumber - 1, BYPASS_COOLDOWNS.length - 1)]!;

  if (attemptNumber === 1) {
    return [
      {
        type: "typing",
        prompt: randomString(30),
        cooldownSeconds: cooldown,
      },
    ];
  }

  if (attemptNumber === 2) {
    return [
      {
        type: "typing",
        prompt: randomString(50),
        cooldownSeconds: cooldown,
      },
    ];
  }

  if (attemptNumber === 3) {
    const problems = Array.from({ length: 3 }, () => {
      const { prompt, answer } = randomMathProblem();
      return { type: "math" as const, prompt, answer, cooldownSeconds: 0 };
    });
    return [{ type: "cooldown", prompt: "", cooldownSeconds: cooldown }, ...problems];
  }

  if (attemptNumber === 4) {
    return [
      {
        type: "justification",
        prompt:
          "Write a 50+ word justification for why you need to use Claude right now:",
        cooldownSeconds: cooldown,
      },
    ];
  }

  // 5+: everything
  const problems = Array.from({ length: 5 }, () => {
    const { prompt, answer } = randomMathProblem();
    return { type: "math" as const, prompt, answer, cooldownSeconds: 0 };
  });
  return [
    { type: "cooldown", prompt: "", cooldownSeconds: cooldown },
    ...problems,
    {
      type: "typing",
      prompt: randomString(80),
      cooldownSeconds: 0,
    },
  ];
}
