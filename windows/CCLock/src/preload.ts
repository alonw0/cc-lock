import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cclock", {
  onStateUpdate: (cb: (data: unknown) => void) => {
    ipcRenderer.on("state-update", (_event, data) => cb(data));
  },
  lock: (minutes: number) => ipcRenderer.invoke("lock", minutes),
  toggleSchedule: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("toggle-schedule", id, enabled),
  startDaemon: () => ipcRenderer.invoke("start-daemon"),
  setLoginItem: (enabled: boolean) => ipcRenderer.invoke("set-login-item", enabled),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  quit: () => ipcRenderer.invoke("quit"),
});
