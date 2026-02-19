"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const net_1 = require("net");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
// ── Constants (mirrors packages/core/src/constants.ts) ──────────────────────
const SOCKET_PATH = process.platform === "win32" ? "\\\\.\\pipe\\cc-lock" : "/tmp/cc-lock.sock";
// ── IPC client (adapted from packages/cli/src/ipc-client.ts) ────────────────
function sendRequest(req) {
    return new Promise((resolve, reject) => {
        const socket = (0, net_1.createConnection)(SOCKET_PATH);
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
                }
                catch (err) {
                    socket.end();
                    reject(new Error(`Invalid response: ${err}`));
                }
            }
        });
        socket.on("error", (err) => {
            const code = err.code;
            if (code === "ECONNREFUSED" || code === "ENOENT" || code === "ENOTSUP") {
                reject(new Error("Daemon not running"));
            }
            else {
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
function getAssetPath(filename) {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, "assets", filename);
    }
    // During development: dist/main.js → ../assets/
    return path_1.default.join(__dirname, "..", "assets", filename);
}
function iconFor(status) {
    const names = {
        unlocked: "icon-unlocked.png",
        locked: "icon-locked.png",
        grace: "icon-grace.png",
        disconnected: "icon-disconnected.png",
    };
    const imgPath = getAssetPath(names[status] ?? "icon-disconnected.png");
    return electron_1.nativeImage.createFromPath(imgPath);
}
// ── Global state ─────────────────────────────────────────────────────────────
let tray = null;
let win = null;
let pollInterval = null;
const state = {
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
async function poll() {
    try {
        const statusRes = (await sendRequest({ type: "status" }));
        state.lock = statusRes.lock;
        state.todayUsageSeconds = statusRes.todayUsageSeconds;
        state.connected = true;
    }
    catch {
        state.connected = false;
    }
    if (state.connected) {
        try {
            const schedRes = (await sendRequest({ type: "schedule-list" }));
            state.schedules = schedRes.schedules;
        }
        catch {
            // keep previous
        }
        try {
            const statsRes = (await sendRequest({
                type: "stats",
                period: "week",
            }));
            state.weekStats = statsRes.days;
        }
        catch {
            // keep previous
        }
    }
    // Sync login-item state (cheap synchronous call)
    state.loginItemEnabled = electron_1.app.getLoginItemSettings().openAtLogin;
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
function startPolling() {
    poll();
    pollInterval = setInterval(poll, 3000);
}
// ── Window management ────────────────────────────────────────────────────────
function createWindow() {
    const w = new electron_1.BrowserWindow({
        width: 260,
        height: 420,
        show: false,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const rendererPath = path_1.default.join(__dirname, "renderer", "index.html");
    w.loadFile(rendererPath);
    w.on("blur", () => {
        w.hide();
    });
    return w;
}
function positionAndToggleWindow(trayBounds) {
    if (!win)
        return;
    const winBounds = win.getBounds();
    const display = electron_1.screen.getDisplayNearestPoint({
        x: Math.round(trayBounds.x),
        y: Math.round(trayBounds.y),
    });
    const workArea = display.workArea;
    // On Windows the taskbar is at the bottom; position window above tray icon.
    // On macOS (dev) the menu bar is at the top; position window below icon.
    const isBottomTaskbar = process.platform === "win32" ||
        trayBounds.y > workArea.y + workArea.height / 2;
    const windowX = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
    const windowY = isBottomTaskbar
        ? Math.round(trayBounds.y - winBounds.height - 4)
        : Math.round(trayBounds.y + trayBounds.height + 4);
    // Clamp to work area
    const clampedX = Math.max(workArea.x, Math.min(windowX, workArea.x + workArea.width - winBounds.width));
    const clampedY = Math.max(workArea.y, Math.min(windowY, workArea.y + workArea.height - winBounds.height));
    win.setPosition(clampedX, clampedY);
    if (win.isVisible()) {
        win.hide();
    }
    else {
        // Send latest state before showing
        win.webContents.send("state-update", state);
        win.show();
        win.focus();
    }
}
// ── ipcMain handlers ─────────────────────────────────────────────────────────
function registerIpcHandlers() {
    electron_1.ipcMain.handle("lock", async (_event, minutes) => {
        try {
            const res = (await sendRequest({
                type: "lock",
                durationMinutes: minutes,
            }));
            // Immediately poll to update state
            poll();
            return res;
        }
        catch (err) {
            return { ok: false, error: String(err) };
        }
    });
    electron_1.ipcMain.handle("toggle-schedule", async (_event, id, enabled) => {
        try {
            const res = (await sendRequest({
                type: "schedule-toggle",
                id,
                enabled,
            }));
            poll();
            return res;
        }
        catch (err) {
            return { ok: false, error: String(err) };
        }
    });
    electron_1.ipcMain.handle("start-daemon", async () => {
        return new Promise((resolve) => {
            if (process.platform === "win32") {
                (0, child_process_1.exec)(`schtasks /run /tn cc-lock-daemon`, { timeout: 10000 }, (err) => {
                    if (err) {
                        resolve({
                            ok: false,
                            error: "Run 'cc-lock install' in a terminal first.",
                        });
                    }
                    else {
                        // Give daemon time to start
                        setTimeout(() => {
                            poll();
                            resolve({ ok: true });
                        }, 2000);
                    }
                });
            }
            else {
                // macOS / dev: try launchctl
                (0, child_process_1.exec)(`launchctl kickstart -k gui/$(id -u)/com.cc-lock.daemon`, { timeout: 10000 }, (err) => {
                    if (err) {
                        resolve({
                            ok: false,
                            error: "Run 'cc-lock install' in a terminal first.",
                        });
                    }
                    else {
                        setTimeout(() => {
                            poll();
                            resolve({ ok: true });
                        }, 2000);
                    }
                });
            }
        });
    });
    electron_1.ipcMain.handle("set-login-item", (_event, enabled) => {
        electron_1.app.setLoginItemSettings({ openAtLogin: enabled });
        state.loginItemEnabled = electron_1.app.getLoginItemSettings().openAtLogin;
        if (win && !win.isDestroyed()) {
            win.webContents.send("state-update", state);
        }
        return { ok: true };
    });
    electron_1.ipcMain.handle("open-external", async (_event, url) => {
        await electron_1.shell.openExternal(url);
    });
    electron_1.ipcMain.handle("quit", () => {
        electron_1.app.quit();
    });
}
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    // Prevent app from showing in dock/taskbar — tray only
    if (electron_1.app.dock) {
        electron_1.app.dock.hide();
    }
    // Create tray
    tray = new electron_1.Tray(iconFor("disconnected"));
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
electron_1.app.on("window-all-closed", () => {
    // Override default quit — keep running as tray app
});
electron_1.app.on("before-quit", () => {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
});
