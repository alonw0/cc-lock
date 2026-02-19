import { createInterface } from "readline";
import { execSync } from "child_process";
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

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    // non-fatal — URL is printed to console anyway
  }
}

async function runPaymentBypass(paymentOption: {
  amount: number;
  currency: string;
  url: string;
  hasVerification: boolean;
}): Promise<{ proceed: boolean; stripePaymentIntentId?: string }> {
  const dollars = (paymentOption.amount / 100).toFixed(2);

  console.log(`\nOpening payment URL in browser...`);
  console.log(`  ${paymentOption.url}`);
  openBrowser(paymentOption.url);

  if (paymentOption.hasVerification) {
    // Stripe path: ask for payment intent ID
    const piId = await prompt(
      `\nEnter your Stripe Payment Intent ID (pi_...) from the receipt email:\n> `
    );
    if (!piId.startsWith("pi_")) {
      console.log("\x1b[31mInvalid payment intent ID. Must start with pi_\x1b[0m");
      return { proceed: false };
    }
    return { proceed: true, stripePaymentIntentId: piId };
  }

  // No verification path: mandatory 30-second wait
  console.log(`\nMandatory wait before confirming $${dollars} payment...`);
  await sleep(30);

  const confirm = await prompt(`Did you complete the $${dollars} payment? [yes/no]\n> `);
  if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
    console.log("Payment not confirmed. Falling through to challenge.");
    return { proceed: false };
  }

  return { proceed: true };
}

const DISCOURAGING_MESSAGES = [
  "You set this lock. You knew this moment would come. Weak.",
  "The 'quick fix' will take 4 hours. You know this.",
  "Your future self is sighing right now.",
  "This is why you can't have nice things.",
  "Incredible. You lasted... let's see... not very long.",
  "Claude doesn't need you. You need Claude. That's the problem.",
  "go touch grass",
  "The feature can wait. Your dignity cannot.",
  "Past-you set this lock because past-you didn't trust present-you. Past-you was right.",
  "Every great developer knows when to stop. This is not that moment for you.",
  "You're not being productive. You're being addicted.",
  "The code will still be broken tomorrow. You'll just be more tired.",
  "Breaking news: local developer can't stick to a self-imposed rule for more than an hour.",
  "You locked yourself out for a reason. Try to remember what that reason was.",
  "Weak.",
  "Not even a personal best. Disappointing.",
  "The shim script has more self-control than you do.",
  "Somewhere, a rubber duck is judging you.",
  "Your plants need water. Your friends miss you. Claude will still be here tomorrow.",
  "Is this really the hill you want to die on?",
  "You could go outside. Just a thought.",
  "The '5 more minutes' to 'midnight' pipeline is fully operational, I see.",
  "Bold move. Stupid, but bold.",
  "You and I both know this isn't about work.",
  "The lock is the boundary. You are the problem.",
  "Your therapist would not approve.",
  "A lesser person would just disable the whole thing. Oh wait.",
];

function randomDiscouragingMessage(): string {
  return DISCOURAGING_MESSAGES[Math.floor(Math.random() * DISCOURAGING_MESSAGES.length)]!;
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

  // Hard lock — no bypass allowed
  if (status.lock.hardLock) {
    const expiresAt = status.lock.expiresAt
      ? ` until ${new Date(status.lock.expiresAt).toLocaleTimeString()}`
      : "";
    console.error(
      `\x1b[31mHard lock is active — bypass is not allowed.\x1b[0m\nLock expires${expiresAt}.`
    );
    process.exit(1);
  }

  // Locked - must complete bypass challenge
  console.log("\n\x1b[33mBypass Challenge\x1b[0m");
  console.log(`Attempt #${status.lock.bypassAttempts + 1}`);
  console.log(`\x1b[2m${randomDiscouragingMessage()}\x1b[0m\n`);

  const startRes = (await sendRequest({
    type: "bypass-start",
  })) as BypassStartResponse;

  if (!startRes.ok) {
    const reason = startRes.error ?? "No bypass options available.";
    console.error(`\nBypass blocked: ${reason}`);
    process.exit(1);
  }

  let usePayment = false;
  let stripePaymentIntentId: string | undefined;

  if (startRes.paymentOption) {
    const { paymentOption } = startRes;
    const dollars = (paymentOption.amount / 100).toFixed(2);
    const challengesDisabled = startRes.challenges.length === 0;

    if (challengesDisabled) {
      console.log(`Challenge bypass is disabled. Payment required ($${dollars}).\n`);
      const result = await runPaymentBypass(paymentOption);
      if (result.proceed) {
        usePayment = true;
        stripePaymentIntentId = result.stripePaymentIntentId;
      } else {
        console.log("\nBypass cancelled.");
        process.exit(1);
      }
    } else {
      console.log("How would you like to bypass?");
      console.log(`  A) Complete a challenge (free)`);
      console.log(`  B) Pay $${dollars} — opens browser for payment`);

      const choice = await prompt("\nChoice [A/B]: ");

      if (choice.toUpperCase() === "B") {
        const result = await runPaymentBypass(paymentOption);
        if (result.proceed) {
          usePayment = true;
          stripePaymentIntentId = result.stripePaymentIntentId;
        }
        // If not proceed, fall through to challenge below
      }
    }
  }

  if (!usePayment) {
    for (const challenge of startRes.challenges) {
      const passed = await runChallenge(challenge);
      if (!passed) {
        console.log("\nBypass failed. Try again later.");
        process.exit(1);
      }
    }
  }

  const completeRes = (await sendRequest({
    type: "bypass-complete",
    challengeId: startRes.challengeId,
    answer: "completed",
    ...(usePayment && { paymentMethod: true }),
    ...(stripePaymentIntentId && { stripePaymentIntentId }),
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
