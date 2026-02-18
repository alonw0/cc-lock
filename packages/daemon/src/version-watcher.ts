import { watch } from "chokidar";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import {
  CLAUDE_STANDALONE_VERSIONS_DIR,
  VERSION_WATCH_DEBOUNCE_MS,
} from "@cc-lock/core";
import { shimManager } from "./shim-manager.js";
import { lockManager } from "./lock-manager.js";

let watcher: ReturnType<typeof watch> | null = null;

function getLatestVersion(): string | null {
  try {
    if (!existsSync(CLAUDE_STANDALONE_VERSIONS_DIR)) return null;
    const versions = readdirSync(CLAUDE_STANDALONE_VERSIONS_DIR).filter(
      (d) => !d.startsWith(".")
    );
    if (versions.length === 0) return null;
    // Sort semver-ish
    versions.sort((a, b) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
      }
      return 0;
    });
    const latest = versions[versions.length - 1]!;
    return join(CLAUDE_STANDALONE_VERSIONS_DIR, latest, "claude");
  } catch {
    return null;
  }
}

export function startVersionWatcher() {
  const config = shimManager.getConfig();
  if (!config || config.installationType !== "standalone") return;

  if (!existsSync(CLAUDE_STANDALONE_VERSIONS_DIR)) {
    console.log(
      "[version-watcher] Versions directory not found, skipping watch"
    );
    return;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watcher = watch(CLAUDE_STANDALONE_VERSIONS_DIR, {
    depth: 1,
    ignoreInitial: true,
  });

  watcher.on("addDir", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const newPath = getLatestVersion();
      if (newPath && newPath !== config.claudeBinaryPath) {
        console.log(`[version-watcher] New version detected: ${newPath}`);
        shimManager.updateBinaryPath(newPath);

        // If locked, re-install shim with updated path
        const state = lockManager.getState();
        if (state.status === "locked") {
          shimManager.installShim();
        }
      }
    }, VERSION_WATCH_DEBOUNCE_MS);
  });

  console.log(
    `[version-watcher] Watching ${CLAUDE_STANDALONE_VERSIONS_DIR}`
  );
}

export function stopVersionWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
