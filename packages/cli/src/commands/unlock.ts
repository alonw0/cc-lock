import { createInterface } from "readline";
import { sendRequest } from "../ipc-client.js";
import type {
  StatusResponse,
  BypassStartResponse,
  BypassCompleteResponse,
  Challenge,
} from "@cc-lock/core";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = seconds;
    const interval = setInterval(() => {
      process.stdout.write(`\rWait: ${remaining}s remaining...  `);
      remaining--;
      if (remaining < 0) {
        clearInterval(interval);
        process.stdout.write("\r" + " ".repeat(30) + "\r");
        resolve();
      }
    }, 1000);
  });
}

async function runChallenge(challenge: Challenge): Promise<boolean> {
  if (challenge.cooldownSeconds > 0) {
    console.log(`\nCooldown: ${challenge.cooldownSeconds}s`);
    await sleep(challenge.cooldownSeconds);
  }

  switch (challenge.type) {
    case "cooldown":
      return true;

    case "typing": {
      const reversed = challenge.prompt.split("").reverse().join("");
      console.log("\nType the following string \x1b[1mBACKWARDS\x1b[0m (right to left):");
      console.log(`\n  ${challenge.prompt}\n`);
      const answer = await prompt("> ");
      if (answer !== reversed) {
        console.log("\x1b[31mMismatch! Bypass failed.\x1b[0m");
        return false;
      }
      return true;
    }

    case "math": {
      console.log(`\nSolve: ${challenge.prompt} = ?`);
      const answer = await prompt("> ");
      if (answer !== challenge.answer) {
        console.log(`\x1b[31mWrong! Expected ${challenge.answer}\x1b[0m`);
        return false;
      }
      return true;
    }

    case "justification": {
      console.log(`\n${challenge.prompt}`);
      const answer = await prompt("> ");
      const wordCount = answer.split(/\s+/).filter(Boolean).length;
      if (wordCount < 50) {
        console.log(`\x1b[31mToo short! (${wordCount}/50 words)\x1b[0m`);
        return false;
      }
      return true;
    }
  }
}

export async function unlockCommand() {
  // Check if actually locked first
  const status = (await sendRequest({ type: "status" })) as StatusResponse;

  if (status.lock.status === "unlocked") {
    console.log("Already unlocked.");
    return;
  }

  if (status.lock.status === "grace") {
    console.log("Already in grace period - Claude Code is available.");
    return;
  }

  // Locked - must complete bypass challenge
  console.log("\n\x1b[33mBypass Challenge\x1b[0m");
  console.log(`Attempt #${status.lock.bypassAttempts + 1}\n`);

  const startRes = (await sendRequest({
    type: "bypass-start",
  })) as BypassStartResponse;

  for (const challenge of startRes.challenges) {
    const passed = await runChallenge(challenge);
    if (!passed) {
      console.log("\nBypass failed. Try again later.");
      process.exit(1);
    }
  }

  const completeRes = (await sendRequest({
    type: "bypass-complete",
    challengeId: startRes.challengeId,
    answer: "completed",
  })) as BypassCompleteResponse;

  if (completeRes.ok) {
    const graceTime = new Date(completeRes.graceExpiresAt!).toLocaleTimeString();
    const graceMinutes = Math.round(
      (new Date(completeRes.graceExpiresAt!).getTime() - Date.now()) / 60_000
    );
    console.log(
      `\n\x1b[32mBypass successful!\x1b[0m You have ${graceMinutes} minutes of access (until ${graceTime}).`
    );
    if (status.lock.expiresAt) {
      console.log(
        `Lock re-engages after grace. Full lock expires at ${new Date(status.lock.expiresAt).toLocaleTimeString()}.`
      );
    }
  } else {
    console.error(`\nBypass failed: ${completeRes.error}`);
    process.exit(1);
  }
}
