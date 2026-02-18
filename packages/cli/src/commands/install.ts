import { sendRequest, isDaemonRunning } from "../ipc-client.js";
import { formatConfig } from "../formatters.js";
import { LAUNCHD_PLIST_PATH, LAUNCHD_LABEL, CC_LOCK_DIR } from "@cc-lock/core";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { execSync, spawn } from "child_process";
import type { InstallResponse, UninstallResponse } from "@cc-lock/core";

function getDaemonEntryPath(): string {
  // Resolve from this package to the daemon package
  return resolve(
    dirname(new URL(import.meta.url).pathname),
    "../../daemon/dist/index.js"
  );
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

export async function installCommand() {
  console.log("Installing cc-lock...\n");

  // 1. Write launchd plist
  const plistContent = generatePlist();
  mkdirSync(dirname(LAUNCHD_PLIST_PATH), { recursive: true });
  writeFileSync(LAUNCHD_PLIST_PATH, plistContent);
  console.log(`Wrote launchd plist: ${LAUNCHD_PLIST_PATH}`);

  // 2. Unload existing if present, then load
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

  // 3. Wait for daemon
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

  // 4. Detect installation
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
      console.log("Restored original Claude symlink.");
    }
  } catch {
    // Daemon not running, that's ok — proceed with cleanup
  }

  // Unload launchd
  try {
    execSync(`launchctl bootout gui/$(id -u) ${LAUNCHD_PLIST_PATH} 2>/dev/null`, {
      stdio: "ignore",
    });
    console.log("Daemon unloaded from launchd.");
  } catch {
    // Might not be loaded
  }

  // Remove plist
  if (existsSync(LAUNCHD_PLIST_PATH)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(LAUNCHD_PLIST_PATH);
    console.log("Removed launchd plist.");
  }

  console.log("\ncc-lock uninstalled.");
}
