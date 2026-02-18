import { execFile } from "child_process";

/** Fire a macOS notification. Best-effort — errors are silently ignored. */
export function notify(title: string, message: string): void {
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  execFile("osascript", ["-e", script], { timeout: 5000 }, () => {});
}
