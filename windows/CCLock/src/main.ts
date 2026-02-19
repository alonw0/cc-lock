import {
  app,
  Tray,
  BrowserWindow,
  ipcMain,
  screen,
  nativeImage,
  shell,
} from "electron";
import { createConnection } from "net";
import { exec } from "child_process";
import path from "path";

// ── Constants (mirrors packages/core/src/constants.ts) ──────────────────────

const SOCKET_PATH =
  process.platform === "win32" ? "\\\\.\\pipe\\cc-lock" : "/tmp/cc-lock.sock";

// ── Types (mirrors packages/core/src/types.ts) ───────────────────────────────

type LockStatus = "unlocked" | "locked" | "grace";

interface LockState {
  status: LockStatus;
  lockedAt: string | null;
  expiresAt: string | null;
  bypassAttempts: number;
  graceExpiresAt: string | null;
  scheduleId: string | null;
  hardLock?: boolean;
}

interface Schedule {
  id: string;
  name: string;
  type: "daily" | "weekdays" | "weekends" | "custom";
  startTime: string;
  endTime: string;
  days?: number[];
  enabled: boolean;
}

interface DailyStats {
  date: string;
  totalSeconds: number;
  sessionCount: number;
  bypassCount: number;
}

interface AppState {
  connected: boolean;
  lock: LockState;
  todayUsageSeconds: number;
  weekStats: DailyStats[];
  schedules: Schedule[];
  loginItemEnabled: boolean;
}

// ── IPC client (adapted from packages/cli/src/ipc-client.ts) ────────────────

function sendRequest(req: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCKET_PATH);
    let buffer = "";

    socket.on("connect", () => {
      socket.write(JSON.stringify(req) + "\n");
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      const idx = buffer.indexOf("\n");
      if (idx !== -1) {
        try {
          const res = JSON.parse(buffer.slice(0, idx));
          socket.end();
          resolve(res);
        } catch (err) {
          socket.end();
          reject(new Error(`Invalid response: ${err}`));
        }
      }
    });

    socket.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED" || code === "ENOENT" || code === "ENOTSUP") {
        reject(new Error("Daemon not running"));
      } else {
        reject(err);
      }
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("Connection timed out"));
    });
  });
}

// ── Asset helpers ────────────────────────────────────────────────────────────

function getAssetPath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", filename);
  }
  // During development: dist/main.js → ../assets/
  return path.join(__dirname, "..", "assets", filename);
}

function iconFor(status: LockStatus | "disconnected"): Electron.NativeImage {
  const names: Record<string, string> = {
    unlocked: "icon-unlocked.png",
    locked: "icon-locked.png",
    grace: "icon-grace.png",
    disconnected: "icon-disconnected.png",
  };
  const imgPath = getAssetPath(names[status] ?? "icon-disconnected.png");
  return nativeImage.createFromPath(imgPath);
}

// ── Global state ─────────────────────────────────────────────────────────────

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const state: AppState = {
  connected: false,
  lock: {
    status: "unlocked",
    lockedAt: null,
    expiresAt: null,
    bypassAttempts: 0,
    graceExpiresAt: null,
    scheduleId: null,
  },
  todayUsageSeconds: 0,
  weekStats: [],
  schedules: [],
  loginItemEnabled: false,
};

// ── Polling ──────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  try {
    const statusRes = (await sendRequest({ type: "status" })) as {
      lock: LockState;
      todayUsageSeconds: number;
    };
    state.lock = statusRes.lock;
    state.todayUsageSeconds = statusRes.todayUsageSeconds;
    state.connected = true;
  } catch {
    state.connected = false;
  }

  if (state.connected) {
    try {
      const schedRes = (await sendRequest({ type: "schedule-list" })) as {
        schedules: Schedule[];
      };
      state.schedules = schedRes.schedules;
    } catch {
      // keep previous
    }

    try {
      const statsRes = (await sendRequest({
        type: "stats",
        period: "week",
      })) as { days: DailyStats[] };
      state.weekStats = statsRes.days;
    } catch {
      // keep previous
    }
  }

  // Sync login-item state (cheap synchronous call)
  state.loginItemEnabled = app.getLoginItemSettings().openAtLogin;

  // Update tray icon
  if (tray) {
    const iconState = state.connected ? state.lock.status : "disconnected";
    tray.setImage(iconFor(iconState));
    const tooltip = state.connected
      ? `CCLock — ${state.lock.status}`
      : "CCLock — daemon not connected";
    tray.setToolTip(tooltip);
  }

  // Push state update to renderer if window is open
  if (win && !win.isDestroyed()) {
    win.webContents.send("state-update", state);
  }
}

function startPolling(): void {
  poll();
  pollInterval = setInterval(poll, 3000);
}

// ── Window management ────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 260,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererPath = path.join(__dirname, "renderer", "index.html");
  w.loadFile(rendererPath);

  w.on("blur", () => {
    w.hide();
  });

  return w;
}

function positionAndToggleWindow(trayBounds: Electron.Rectangle): void {
  if (!win) return;

  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x),
    y: Math.round(trayBounds.y),
  });
  const workArea = display.workArea;

  // On Windows the taskbar is at the bottom; position window above tray icon.
  // On macOS (dev) the menu bar is at the top; position window below icon.
  const isBottomTaskbar =
    process.platform === "win32" ||
    trayBounds.y > workArea.y + workArea.height / 2;

  const windowX = Math.round(
    trayBounds.x + trayBounds.width / 2 - winBounds.width / 2
  );
  const windowY = isBottomTaskbar
    ? Math.round(trayBounds.y - winBounds.height - 4)
    : Math.round(trayBounds.y + trayBounds.height + 4);

  // Clamp to work area
  const clampedX = Math.max(
    workArea.x,
    Math.min(windowX, workArea.x + workArea.width - winBounds.width)
  );
  const clampedY = Math.max(
    workArea.y,
    Math.min(windowY, workArea.y + workArea.height - winBounds.height)
  );

  win.setPosition(clampedX, clampedY);

  if (win.isVisible()) {
    win.hide();
  } else {
    // Send latest state before showing
    win.webContents.send("state-update", state);
    win.show();
    win.focus();
  }
}

// ── ipcMain handlers ─────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle("lock", async (_event, minutes: number) => {
    try {
      const res = (await sendRequest({
        type: "lock",
        durationMinutes: minutes,
      })) as { ok: boolean; error?: string };
      // Immediately poll to update state
      poll();
      return res;
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(
    "toggle-schedule",
    async (_event, id: string, enabled: boolean) => {
      try {
        const res = (await sendRequest({
          type: "schedule-toggle",
          id,
          enabled,
        })) as { ok: boolean; error?: string };
        poll();
        return res;
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  );

  ipcMain.handle("start-daemon", async () => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      if (process.platform === "win32") {
        exec(
          `schtasks /run /tn cc-lock-daemon`,
          { timeout: 10000 },
          (err) => {
            if (err) {
              resolve({
                ok: false,
                error: "Run 'cc-lock install' in a terminal first.",
              });
            } else {
              // Give daemon time to start
              setTimeout(() => {
                poll();
                resolve({ ok: true });
              }, 2000);
            }
          }
        );
      } else {
        // macOS / dev: try launchctl
        exec(
          `launchctl kickstart -k gui/$(id -u)/com.cc-lock.daemon`,
          { timeout: 10000 },
          (err) => {
            if (err) {
              resolve({
                ok: false,
                error: "Run 'cc-lock install' in a terminal first.",
              });
            } else {
              setTimeout(() => {
                poll();
                resolve({ ok: true });
              }, 2000);
            }
          }
        );
      }
    });
  });

  ipcMain.handle("set-login-item", (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    state.loginItemEnabled = app.getLoginItemSettings().openAtLogin;
    if (win && !win.isDestroyed()) {
      win.webContents.send("state-update", state);
    }
    return { ok: true };
  });

  ipcMain.handle("open-external", async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("quit", () => {
    app.quit();
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Prevent app from showing in dock/taskbar — tray only
  if (app.dock) {
    app.dock.hide();
  }

  // Create tray
  tray = new Tray(iconFor("disconnected"));
  tray.setToolTip("CCLock");

  // Create popup window
  win = createWindow();

  tray.on("click", (_event, bounds) => {
    positionAndToggleWindow(bounds);
  });

  // On macOS, right-click also shows the popup (no native context menu)
  tray.on("right-click", (_event, bounds) => {
    positionAndToggleWindow(bounds);
  });

  registerIpcHandlers();
  startPolling();
});

app.on("window-all-closed", () => {
  // Override default quit — keep running as tray app
});

app.on("before-quit", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});
