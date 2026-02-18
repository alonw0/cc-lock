import { createConnection } from "net";
import { SOCKET_PATH } from "@cc-lock/core";
import type { Request, Response } from "@cc-lock/core";

export function sendRequest(req: Request): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCKET_PATH);
    let buffer = "";

    socket.on("connect", () => {
      socket.write(JSON.stringify(req) + "\n");
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        try {
          const res = JSON.parse(line) as Response;
          socket.end();
          resolve(res);
        } catch (err) {
          socket.end();
          reject(new Error(`Invalid response: ${err}`));
        }
      }
    });

    socket.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
          (err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "cc-lock daemon is not running. Start it with: cc-lock install"
          )
        );
      } else {
        reject(err);
      }
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("Connection to daemon timed out"));
    });
  });
}

export async function isDaemonRunning(): Promise<boolean> {
  try {
    await sendRequest({ type: "status" });
    return true;
  } catch {
    return false;
  }
}
