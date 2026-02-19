import { createServer, type Socket } from "net";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { SOCKET_PATH, PID_FILE, CC_LOCK_DIR } from "@cc-lock/core";
import type { Request } from "@cc-lock/core";
import { getDb } from "./db.js";
import { handleRequest } from "./handlers.js";
import { startScheduleEvaluator, stopScheduleEvaluator } from "./schedule-eval.js";
import { startUsageTracker, stopUsageTracker } from "./usage-tracker.js";
import { startVersionWatcher, stopVersionWatcher } from "./version-watcher.js";
import { shimManager } from "./shim-manager.js";

function writePidFile() {
  mkdirSync(CC_LOCK_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
}

function cleanup() {
  console.log("[daemon] Shutting down...");
  stopScheduleEvaluator();
  stopUsageTracker();
  stopVersionWatcher();

  try {
    unlinkSync(SOCKET_PATH);
  } catch {}
  try {
    unlinkSync(PID_FILE);
  } catch {}

  process.exit(0);
}

function handleConnection(socket: Socket) {
  let buffer = "";

  socket.on("data", (data) => {
    buffer += data.toString();

    // Messages are newline-delimited JSON
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      try {
        const req = JSON.parse(line) as Request;
        handleRequest(req).then((res) => {
          socket.write(JSON.stringify(res) + "\n");
        }).catch((err) => {
          socket.write(
            JSON.stringify({
              type: "error",
              message: `Handler error: ${err instanceof Error ? err.message : String(err)}`,
            }) + "\n"
          );
        });
      } catch (err) {
        socket.write(
          JSON.stringify({
            type: "error",
            message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
          }) + "\n"
        );
      }
    }
  });

  socket.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
      console.error("[daemon] Socket error:", err.message);
    }
  });
}

async function main() {
  console.log("[daemon] Starting cc-lock daemon...");

  // Initialize
  mkdirSync(CC_LOCK_DIR, { recursive: true });
  getDb(); // init schema
  shimManager.loadConfig();
  writePidFile();

  // Clean up stale socket
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {}
  }

  // Start subsystems
  startScheduleEvaluator();
  startUsageTracker();
  startVersionWatcher();

  // Start socket server
  const server = createServer(handleConnection);

  server.listen(SOCKET_PATH, () => {
    console.log(`[daemon] Listening on ${SOCKET_PATH}`);
  });

  server.on("error", (err) => {
    console.error("[daemon] Server error:", err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("uncaughtException", (err) => {
    console.error("[daemon] Uncaught exception:", err);
  });
}

main();
