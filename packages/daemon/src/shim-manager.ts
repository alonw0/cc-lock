import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
  lstatSync,
  chmodSync,
  realpathSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "fs";
import { dirname, resolve, join } from "path";
import { CONFIG_FILE, CC_LOCK_DIR } from "@cc-lock/core";
import type { Config } from "@cc-lock/core";

class ShimManager {
  private config: Config | null = null;

  loadConfig(): Config | null {
    try {
      const data = readFileSync(CONFIG_FILE, "utf-8");
      this.config = JSON.parse(data) as Config;
      return this.config;
    } catch {
      return null;
    }
  }

  saveConfig(config: Config) {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    this.config = config;
  }

  getConfig(): Config | null {
    return this.config ?? this.loadConfig();
  }

  installShim() {
    const config = this.getConfig();
    if (!config) {
      console.error("[shim-manager] No config found, cannot install shim");
      return;
    }

    const shimPath = config.claudeShimPath;
    const shimContent = this.generateShimScript(config.claudeBinaryPath);

    try {
      // Remove existing symlink/file
      try {
        unlinkSync(shimPath);
      } catch {
        // May not exist
      }

      // Write shim script
      writeFileSync(shimPath, shimContent, { mode: 0o755 });
      console.log(`[shim-manager] Shim installed at ${shimPath}`);

      // chmod guard if enabled
      if (config.chmodGuard) {
        this.applyChmodGuard(config);
      }
    } catch (err) {
      console.error("[shim-manager] Failed to install shim:", err);
    }
  }

  removeShim() {
    const config = this.getConfig();
    if (!config) {
      console.error("[shim-manager] No config found, cannot remove shim");
      return;
    }

    const shimPath = config.claudeShimPath;
    const realBinary = config.claudeBinaryPath;

    try {
      // Remove shim
      try {
        unlinkSync(shimPath);
      } catch {
        // May not exist
      }

      // Restore original symlink
      symlinkSync(realBinary, shimPath);
      console.log(
        `[shim-manager] Restored symlink ${shimPath} -> ${realBinary}`
      );

      // Restore chmod if needed
      if (config.chmodGuard) {
        this.removeChmodGuard(config);
      }
    } catch (err) {
      console.error("[shim-manager] Failed to remove shim:", err);
    }
  }

  private applyChmodGuard(config: Config) {
    try {
      chmodSync(config.claudeBinaryPath, 0o000);
      console.log(
        `[shim-manager] chmod 000 applied to ${config.claudeBinaryPath}`
      );
    } catch (err) {
      console.error("[shim-manager] chmod guard failed:", err);
    }
  }

  private removeChmodGuard(config: Config) {
    try {
      chmodSync(config.claudeBinaryPath, 0o755);
      console.log(
        `[shim-manager] chmod 755 restored on ${config.claudeBinaryPath}`
      );
    } catch (err) {
      console.error("[shim-manager] chmod restore failed:", err);
    }
  }

  updateBinaryPath(newPath: string) {
    const config = this.getConfig();
    if (!config) return;

    config.claudeBinaryPath = newPath;
    this.saveConfig(config);
    console.log(`[shim-manager] Updated binary path to ${newPath}`);
  }

  private generateShimScript(realBinaryPath: string): string {
    // Resolve the check-lock package location relative to the project
    const checkLockDir = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../check-lock/dist"
    );

    return `#!/bin/bash
# cc-lock shim - replaces claude symlink when locked
# DO NOT EDIT - managed by cc-lock daemon

STATE_FILE="$HOME/.cc-lock/state.json"
REAL_BINARY="${realBinaryPath}"
CHECK_LOCK="${checkLockDir}/check.js"

# Quick check: if state file doesn't exist or status is unlocked, just exec
if [ ! -f "$STATE_FILE" ]; then
  exec "$REAL_BINARY" "$@"
fi

STATUS=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ "$STATUS" = "unlocked" ] || [ "$STATUS" = "grace" ]; then
  exec "$REAL_BINARY" "$@"
fi

# Locked - show message and offer bypass
echo ""
echo "🔒 Claude Code is locked by cc-lock"
echo ""

# Check if state has expiry info
EXPIRES=$(grep -o '"expiresAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -n "$EXPIRES" ]; then
  # Convert ISO/UTC timestamp to local time via epoch
  EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "\${EXPIRES%%.*}" "+%s" 2>/dev/null)
  LOCAL_TIME=$(date -r "$EPOCH" "+%H:%M:%S" 2>/dev/null || echo "$EXPIRES")
  echo "Lock expires at: $LOCAL_TIME"
fi

ATTEMPTS=$(grep -o '"bypassAttempts"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE_FILE" | head -1 | grep -o '[0-9]*$')
echo "Bypass attempts this period: \${ATTEMPTS:-0}"
echo ""
echo "To bypass, run: cc-lock unlock"
echo ""
exit 1
`;
  }

  /** Detect claude installation and return config */
  detectInstallation(): Config | null {
    // If we already have a valid config, return it (re-install scenario)
    const existing = this.loadConfig();
    if (existing && existing.claudeBinaryPath && existsSync(existing.claudeBinaryPath)) {
      return existing;
    }

    const standalonePath = `${process.env.HOME}/.local/bin/claude`;

    // Try standalone: check if it's a symlink pointing to the real binary
    try {
      const stat = lstatSync(standalonePath);
      if (stat.isSymbolicLink()) {
        const realPath = realpathSync(standalonePath);
        return {
          installationType: "standalone",
          claudeBinaryPath: realPath,
          claudeShimPath: standalonePath,
          chmodGuard: false,
          graceMinutes: 15,
        };
      }

      // It exists but isn't a symlink - could be our shim script.
      // Try to extract REAL_BINARY from it.
      if (stat.isFile()) {
        const content = readFileSync(standalonePath, "utf-8");
        const match = content.match(/^REAL_BINARY="(.+)"$/m);
        if (match && match[1] && existsSync(match[1])) {
          return {
            installationType: "standalone",
            claudeBinaryPath: match[1],
            claudeShimPath: standalonePath,
            chmodGuard: false,
            graceMinutes: 15,
          };
        }
      }
    } catch {
      // Not found at all
    }

    // Try standalone: scan versions directory directly
    const versionsDir = `${process.env.HOME}/.local/share/claude/versions`;
    try {
      if (existsSync(versionsDir)) {
        const versions = readdirSync(versionsDir).filter((d) => !d.startsWith("."));
        versions.sort((a, b) => {
          const pa = a.split(".").map(Number);
          const pb = b.split(".").map(Number);
          for (let i = 0; i < 3; i++) {
            if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
          }
          return 0;
        });
        if (versions.length > 0) {
          const latest = versions[versions.length - 1]!;
          const binaryPath = join(versionsDir, latest, "claude");
          if (existsSync(binaryPath)) {
            return {
              installationType: "standalone",
              claudeBinaryPath: binaryPath,
              claudeShimPath: standalonePath,
              chmodGuard: false,
              graceMinutes: 15,
            };
          }
        }
      }
    } catch {
      // No versions directory
    }

    // Try npm global
    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      const npmPath = execSync("which claude 2>/dev/null", {
        encoding: "utf-8",
      }).trim();
      if (npmPath && existsSync(npmPath)) {
        let realPath = npmPath;
        try {
          const stat = lstatSync(npmPath);
          if (stat.isSymbolicLink()) {
            realPath = realpathSync(npmPath);
          }
        } catch {
          // use npmPath as-is
        }
        return {
          installationType: "npm",
          claudeBinaryPath: realPath,
          claudeShimPath: npmPath,
          chmodGuard: false,
          graceMinutes: 15,
        };
      }
    } catch {
      // No npm installation found
    }

    return null;
  }
}

export const shimManager = new ShimManager();
