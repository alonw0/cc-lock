"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("cclock", {
    onStateUpdate: (cb) => {
        electron_1.ipcRenderer.on("state-update", (_event, data) => cb(data));
    },
    lock: (minutes) => electron_1.ipcRenderer.invoke("lock", minutes),
    toggleSchedule: (id, enabled) => electron_1.ipcRenderer.invoke("toggle-schedule", id, enabled),
    startDaemon: () => electron_1.ipcRenderer.invoke("start-daemon"),
    setLoginItem: (enabled) => electron_1.ipcRenderer.invoke("set-login-item", enabled),
    openExternal: (url) => electron_1.ipcRenderer.invoke("open-external", url),
    quit: () => electron_1.ipcRenderer.invoke("quit"),
});
