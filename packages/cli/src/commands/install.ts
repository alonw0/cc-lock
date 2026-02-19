import { sendRequest, isDaemonRunning } from "../ipc-client.js";
import { formatConfig } from "../formatters.js";
import {
  LAUNCHD_PLIST_PATH,
  LAUNCHD_LABEL,
  CC_LOCK_DIR,
  TASK_SCHEDULER_NAME,
} from "@cc-lock/core";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { execSync, spawn } from "child_process";
import type { InstallResponse, UninstallResponse } from "@cc-lock/core";

const _require = createRequire(import.meta.url);

function getDaemonEntryPath(): string {
  try {
    // Production: @cc-lock/daemon is installed as a dependency
    const pkg = _require.resolve("@cc-lock/daemon/package.json");
    return join(dirname(pkg), "dist", "index.js");
  } catch {
    // Development: running from the monorepo
    return resolve(dirname(new URL(import.meta.url).pathname), "../../daemon/dist/index.js");
  }
}

function generatePlist(): string {
  const daemonPath = getDaemonEntryPath();
  const nodePath = process.execPath;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${daemonPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${CC_LOCK_DIR}/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${CC_LOCK_DIR}/daemon.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${process.env.HOME}</string>
        <key>PATH</key>
        <string>${process.env.PATH}</string>
    </dict>
</dict>
</plist>`;
}

async function installDarwin() {
  const plistContent = generatePlist();
  mkdirSync(dirname(LAUNCHD_PLIST_PATH), { recursive: true });
  writeFileSync(LAUNCHD_PLIST_PATH, plistContent);
  console.log(`Wrote launchd plist: ${LAUNCHD_PLIST_PATH}`);

  try {
    execSync(`launchctl bootout gui/$(id -u) ${LAUNCHD_PLIST_PATH} 2>/dev/null`, {
      stdio: "ignore",
    });
  } catch {
    // Might not be loaded
  }

  try {
    execSync(`launchctl bootstrap gui/$(id -u) ${LAUNCHD_PLIST_PATH}`, {
      stdio: "inherit",
    });
    console.log("Daemon loaded via launchd");
  } catch {
    // Fallback: start directly
    console.log("launchctl failed, starting daemon directly...");
    const daemonPath = getDaemonEntryPath();
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log(`Daemon started (PID: ${child.pid})`);
  }
}

async function installWindows() {
  const daemonPath = getDaemonEntryPath();
  const nodePath = process.execPath;

  console.log("Setting up Windows Task Scheduler...");
  try {
    execSync(
      `schtasks /create /tn "${TASK_SCHEDULER_NAME}" /sc onlogon /tr "\\"${nodePath}\\" \\"${daemonPath}\\"" /ru "%USERNAME%" /f`,
      { stdio: "inherit" }
    );
    console.log("Task Scheduler entry created.");
  } catch {
    console.log("schtasks failed, starting daemon directly...");
  }

  // Start daemon immediately
  try {
    execSync(`schtasks /run /tn "${TASK_SCHEDULER_NAME}"`, { stdio: "ignore" });
  } catch {
    // Fallback: spawn directly
    const child = spawn(nodePath, [daemonPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log(`Daemon started (PID: ${child.pid})`);
  }
}

async function installLinux() {
  console.log("Starting daemon (Linux — no systemd integration)...");
  const daemonPath = getDaemonEntryPath();
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log(`Daemon started (PID: ${child.pid})`);
}

export async function installCommand() {
  console.log("Installing cc-lock...\n");

  if (process.platform === "win32") {
    await installWindows();
  } else if (process.platform === "darwin") {
    await installDarwin();
  } else {
    await installLinux();
  }

  // Wait for daemon
  let connected = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isDaemonRunning()) {
      connected = true;
      break;
    }
  }

  if (!connected) {
    console.error("Warning: Could not connect to daemon after starting.");
    return;
  }

  // Detect installation
  const res = (await sendRequest({ type: "install" })) as InstallResponse;
  if (res.ok) {
    console.log(`\nDetected Claude Code installation:`);
    console.log(`  Type: ${res.installationType}`);
    console.log(`  Binary: ${res.claudeBinaryPath}`);
    console.log("\ncc-lock installed successfully!");
  } else {
    console.error(`\nInstallation detection failed: ${res.error}`);
    console.error("You can manually configure later.");
  }
}

export async function uninstallCommand() {
  console.log("Uninstalling cc-lock...\n");

  // Check with daemon — it will reject if locked
  try {
    if (await isDaemonRunning()) {
      const res = (await sendRequest({ type: "uninstall" })) as UninstallResponse;
      if (!res.ok) {
        console.error(`Cannot uninstall: ${res.error}`);
        process.exit(1);
      }
      console.log("Restored original Claude binary.");
    }
  } catch {
    // Daemon not running, that's ok — proceed with cleanup
  }

  if (process.platform === "win32") {
    try {
      execSync(`schtasks /delete /tn "${TASK_SCHEDULER_NAME}" /f`, {
        stdio: "ignore",
      });
      console.log("Removed Task Scheduler entry.");
    } catch {
      // Might not exist
    }
  } else if (process.platform === "darwin") {
    try {
      execSync(`launchctl bootout gui/$(id -u) ${LAUNCHD_PLIST_PATH} 2>/dev/null`, {
        stdio: "ignore",
      });
      console.log("Daemon unloaded from launchd.");
    } catch {
      // Might not be loaded
    }

    if (existsSync(LAUNCHD_PLIST_PATH)) {
      const { unlinkSync } = await import("fs");
      unlinkSync(LAUNCHD_PLIST_PATH);
      console.log("Removed launchd plist.");
    }
  }

  console.log("\ncc-lock uninstalled.");
}
