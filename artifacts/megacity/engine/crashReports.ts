import AsyncStorage from "@react-native-async-storage/async-storage";

export type CrashReport = {
  timestamp: number;
  screenName: string;
  message: string;
  componentStack: string;
  appVersion: string;
};

const MAX_REPORTS = 10;
const STORAGE_KEY = "@megacity_crash_reports_v1";
const buffer: CrashReport[] = [];
const listeners = new Set<() => void>();

function isCrashReport(x: unknown): x is CrashReport {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.timestamp === "number" &&
    typeof r.screenName === "string" &&
    typeof r.message === "string" &&
    typeof r.componentStack === "string" &&
    typeof r.appVersion === "string"
  );
}

function notifyListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

// Fire-and-forget persistence. Crash recording must never throw or block,
// so storage errors are swallowed (the in-memory buffer is still updated).
function persist(): void {
  const snapshot = buffer.slice();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {
    // ignore — best-effort persistence
  });
}

export function recordCrashReport(report: CrashReport): void {
  buffer.unshift(report);
  if (buffer.length > MAX_REPORTS) {
    buffer.length = MAX_REPORTS;
  }
  persist();
  notifyListeners();
}

export function getCrashReports(): CrashReport[] {
  return buffer.slice();
}

export function clearCrashReports(): void {
  buffer.length = 0;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {
    // ignore — best-effort
  });
  notifyListeners();
}

// Loads previously persisted crash reports into the in-memory buffer.
// Safe to call multiple times; later calls are no-ops if the buffer is
// already populated (e.g. a fresh crash recorded before hydration ran).
// Resolves to the number of reports hydrated.
export async function hydrateCrashReports(): Promise<number> {
  if (buffer.length > 0) return 0;
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  const valid = parsed.filter(isCrashReport).slice(0, MAX_REPORTS);
  if (valid.length === 0) return 0;
  // Re-check guard: a crash that fired between getItem and now should
  // win over the stored snapshot, since it's strictly newer info.
  if (buffer.length > 0) return 0;
  buffer.push(...valid);
  notifyListeners();
  return valid.length;
}

export function subscribeCrashReports(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function formatCrashReport(report: CrashReport): string {
  const stack = report.componentStack.trim();
  return [
    "MEGACITY CRASH REPORT",
    `Time: ${new Date(report.timestamp).toISOString()}`,
    `Screen: ${report.screenName}`,
    `App Version: ${report.appVersion}`,
    `Error: ${report.message}`,
    "Component Stack:",
    stack.length > 0 ? stack : "(empty)",
  ].join("\n");
}
