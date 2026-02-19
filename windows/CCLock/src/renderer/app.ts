// Renderer process — plain DOM, no framework.
// Receives state via cclock.onStateUpdate (set up by preload via contextBridge).

// ── Types ─────────────────────────────────────────────────────────────────────

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
  type: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface DailyStats {
  date: string;
  totalSeconds: number;
}

interface AppData {
  connected: boolean;
  lock: LockState;
  todayUsageSeconds: number;
  weekStats: DailyStats[];
  schedules: Schedule[];
  loginItemEnabled: boolean;
}

// ── Window API (provided by preload.ts via contextBridge) ────────────────────

interface CCLockAPI {
  onStateUpdate: (cb: (data: AppData) => void) => void;
  lock: (minutes: number) => Promise<{ ok: boolean; error?: string }>;
  toggleSchedule: (
    id: string,
    enabled: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  startDaemon: () => Promise<{ ok: boolean; error?: string }>;
  setLoginItem: (enabled: boolean) => Promise<{ ok: boolean }>;
  openExternal: (url: string) => Promise<void>;
  quit: () => Promise<void>;
}

// Typed accessor for the context-bridge API injected by preload.ts
const cclock = (window as unknown as { cclock: CCLockAPI }).cclock;

// ── State ────────────────────────────────────────────────────────────────────

let currentState: AppData | null = null;
// Countdown timer — recalculates from ISO timestamps every second
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  }
  if (m > 0) {
    return `${m}m ${String(sec).padStart(2, "0")}s`;
  }
  return `${sec}s`;
}

function formatUsage(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parseISO(str: string): Date | null {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ── Countdown ────────────────────────────────────────────────────────────────

function startCountdown(): void {
  if (countdownInterval) return;
  countdownInterval = setInterval(updateCountdown, 1000);
}

function stopCountdown(): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function updateCountdown(): void {
  if (!currentState?.connected) return;
  const lock = currentState.lock;
  const meta = document.getElementById("status-meta");
  if (!meta) return;
  meta.innerHTML = buildStatusMeta(lock);
}

function buildStatusMeta(lock: LockState): string {
  const now = Date.now();
  const parts: string[] = [];

  if (lock.status === "locked") {
    if (lock.hardLock) {
      parts.push('<span style="color:#dc2626">Hard lock — no bypass</span>');
    }
    if (lock.expiresAt) {
      const expiry = parseISO(lock.expiresAt);
      if (expiry) {
        const remaining = (expiry.getTime() - now) / 1000;
        if (remaining > 0) {
          parts.push(
            `<span class="countdown">Unlocks in ${formatDuration(remaining)}</span>`
          );
          const timeStr = expiry.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          parts.push(`<span>Expires: ${timeStr}</span>`);
        } else {
          parts.push("<span>Lock expired, pending update…</span>");
        }
      }
    }
    if (!lock.hardLock && lock.bypassAttempts > 0) {
      parts.push(
        `<span class="bypass-warn">Bypass attempts: ${lock.bypassAttempts}</span>`
      );
    }
  } else if (lock.status === "grace") {
    if (lock.graceExpiresAt) {
      const expiry = parseISO(lock.graceExpiresAt);
      if (expiry) {
        const remaining = (expiry.getTime() - now) / 1000;
        if (remaining > 0) {
          parts.push(
            `<span class="countdown">Re-locks in ${formatDuration(remaining)}</span>`
          );
        }
      }
    }
  }

  return parts.join("<br>");
}

// ── Render ───────────────────────────────────────────────────────────────────

function render(data: AppData): void {
  currentState = data;

  renderStatus(data);
  renderDaemonSection(data);
  renderQuickLock(data);
  renderUsage(data);
  renderSchedules(data);
  renderSettings(data);
}

function renderSettings(data: AppData): void {
  const toggle = document.getElementById(
    "login-item-toggle"
  ) as HTMLInputElement | null;
  if (!toggle) return;
  // Update checkbox without triggering its own change event
  if (toggle.checked !== data.loginItemEnabled) {
    toggle.checked = data.loginItemEnabled;
  }
}

function renderStatus(data: AppData): void {
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  const meta = document.getElementById("status-meta");
  if (!dot || !label || !meta) return;

  // Remove all color classes
  dot.className = "status-dot";
  label.className = "status-label";

  if (!data.connected) {
    dot.classList.add("gray");
    label.classList.add("gray");
    label.textContent = "Daemon not connected";
    meta.innerHTML = "";
    stopCountdown();
    return;
  }

  const lock = data.lock;
  const colorMap: Record<LockStatus, string> = {
    unlocked: "green",
    locked: "red",
    grace: "yellow",
  };
  const labelMap: Record<LockStatus, string> = {
    unlocked: "Claude Code is unlocked",
    locked:
      lock.hardLock ? "Hard locked — no bypass" : "Claude Code is locked",
    grace: "Grace period active",
  };

  const color = colorMap[lock.status];
  dot.classList.add(color);
  label.classList.add(color);
  label.textContent = labelMap[lock.status];
  meta.innerHTML = buildStatusMeta(lock);

  if (lock.status === "locked" || lock.status === "grace") {
    startCountdown();
  } else {
    stopCountdown();
  }
}

function renderDaemonSection(data: AppData): void {
  const section = document.getElementById("daemon-section");
  if (!section) return;
  section.style.display = data.connected ? "none" : "block";
}

function renderQuickLock(data: AppData): void {
  const section = document.getElementById("quick-lock-section");
  const divider = document.getElementById("divider-usage");
  if (!section || !divider) return;

  const show = data.connected && data.lock.status === "unlocked";
  section.style.display = show ? "block" : "none";
  divider.style.display = data.connected ? "block" : "none";
}

function renderUsage(data: AppData): void {
  const section = document.getElementById("usage-section");
  const todayEl = document.getElementById("today-usage");
  const weekEl = document.getElementById("week-usage");
  if (!section || !todayEl || !weekEl) return;

  if (!data.connected) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  todayEl.textContent = formatUsage(data.todayUsageSeconds);

  const weekTotal = data.weekStats.reduce((sum, d) => sum + d.totalSeconds, 0);
  weekEl.textContent = formatUsage(weekTotal);
}

function renderSchedules(data: AppData): void {
  const section = document.getElementById("schedules-section");
  const list = document.getElementById("schedules-list");
  const divider = document.getElementById("divider-schedules");
  if (!section || !list || !divider) return;

  if (!data.connected || data.schedules.length === 0) {
    section.style.display = "none";
    divider.style.display = "none";
    return;
  }

  section.style.display = "block";
  divider.style.display = "block";

  // Rebuild schedule list
  list.innerHTML = "";
  for (const schedule of data.schedules) {
    const item = document.createElement("div");
    item.className = "schedule-item";

    const info = document.createElement("div");
    info.className = "schedule-info";

    const name = document.createElement("div");
    name.className = "schedule-name";
    name.textContent = schedule.name;

    const time = document.createElement("div");
    time.className = "schedule-time";
    time.textContent = `${schedule.startTime}–${schedule.endTime} (${schedule.type})`;

    info.appendChild(name);
    info.appendChild(time);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "schedule-toggle";
    toggle.checked = schedule.enabled;
    toggle.dataset["id"] = schedule.id;

    toggle.addEventListener("change", () => {
      cclock.toggleSchedule(schedule.id, toggle.checked).then((res) => {
        if (!res.ok) {
          // Revert on failure
          toggle.checked = !toggle.checked;
        }
      });
    });

    item.appendChild(info);
    item.appendChild(toggle);
    list.appendChild(item);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>(".lock-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const minutes = parseInt(btn.dataset["minutes"] ?? "60", 10);
    btn.disabled = true;
    cclock.lock(minutes).finally(() => {
      btn.disabled = false;
    });
  });
});

document.getElementById("start-daemon-btn")?.addEventListener("click", () => {
  const btn = document.getElementById(
    "start-daemon-btn"
  ) as HTMLButtonElement | null;
  const errEl = document.getElementById("daemon-error");
  if (!btn || !errEl) return;

  btn.disabled = true;
  btn.textContent = "Starting…";
  errEl.style.display = "none";

  cclock.startDaemon().then((res) => {
    btn.disabled = false;
    btn.textContent = "Start Daemon";
    if (!res.ok) {
      errEl.textContent = res.error ?? "Failed to start daemon.";
      errEl.style.display = "block";
    }
  });
});

document
  .getElementById("login-item-toggle")
  ?.addEventListener("change", (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    cclock.setLoginItem(enabled);
  });

document.getElementById("quit-btn")?.addEventListener("click", () => {
  cclock.quit();
});

// ── Init ──────────────────────────────────────────────────────────────────────

cclock.onStateUpdate((data) => {
  render(data);
});
