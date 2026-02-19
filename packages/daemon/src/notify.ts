import { execFile } from "child_process";

/** Fire a system notification. Best-effort — errors are silently ignored. */
export function notify(title: string, message: string): void {
  if (process.platform === "darwin") {
    // terminal-notifier (brew install terminal-notifier) registers under its own
    // bundle ID so it appears as a manageable entry in System Settings → Notifications.
    // Fall back to osascript if not installed (appears under "Script Editor").
    execFile(
      "terminal-notifier",
      ["-title", title, "-message", message, "-sender", "com.apple.Terminal"],
      { timeout: 5000 },
      (err) => {
        if (err) {
          const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
          execFile("osascript", ["-e", script], { timeout: 5000 }, () => {});
        }
      }
    );
  } else if (process.platform === "win32") {
    const psScript = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      "$n = New-Object System.Windows.Forms.NotifyIcon;",
      "$n.Icon = [System.Drawing.SystemIcons]::Information;",
      "$n.Visible = $true;",
      `$n.ShowBalloonTip(5000, ${JSON.stringify(title)}, ${JSON.stringify(message)}, 'Info');`,
      "Start-Sleep 1; $n.Dispose()",
    ].join(" ");
    execFile("powershell", ["-Command", psScript], { timeout: 10000 }, () => {});
  }
  // Linux: no-op
}
