import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStore = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: async (k: string, v: string) => { memoryStore.set(k, v); },
    removeItem: async (k: string) => { memoryStore.delete(k); },
    multiSet: async (pairs: [string, string][]) => { for (const [k, v] of pairs) memoryStore.set(k, v); },
    multiRemove: async (keys: string[]) => { for (const k of keys) memoryStore.delete(k); },
    clear: async () => { memoryStore.clear(); },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

import {
  clearCrashReports,
  getCrashReports,
  hydrateCrashReports,
  recordCrashReport,
  type CrashReport,
} from "@/engine/crashReports";

const STORAGE_KEY = "@megacity_crash_reports_v1";

function makeReport(overrides: Partial<CrashReport> = {}): CrashReport {
  return {
    timestamp: 1_700_000_000_000,
    screenName: "TestScreen",
    message: "boom",
    componentStack: "at TestScreen\n  at App",
    appVersion: "1.0.0",
    ...overrides,
  };
}

// Drains the AsyncStorage microtask queue inside recordCrashReport's
// fire-and-forget setItem so the test can observe the written bytes.
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("crashReports persistence", () => {
  beforeEach(() => {
    memoryStore.clear();
    clearCrashReports();
  });

  it("writes new crash reports to AsyncStorage under a stable key", async () => {
    recordCrashReport(makeReport({ message: "first" }));
    await flush();
    const raw = memoryStore.get(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as CrashReport[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toBe("first");
  });

  it("caps the persisted list at 10 (newest-first) just like the in-memory buffer", async () => {
    for (let i = 0; i < 15; i++) {
      recordCrashReport(makeReport({ message: `crash-${i}`, timestamp: 1_700_000_000_000 + i }));
    }
    await flush();
    const parsed = JSON.parse(memoryStore.get(STORAGE_KEY)!) as CrashReport[];
    expect(parsed).toHaveLength(10);
    // Newest first — the loop's last record (index 14) should be at position 0.
    expect(parsed[0].message).toBe("crash-14");
    expect(parsed[9].message).toBe("crash-5");
  });

  it("hydrates the in-memory buffer from storage on next session", async () => {
    const stored: CrashReport[] = [
      makeReport({ message: "older", timestamp: 1_700_000_000_001 }),
      makeReport({ message: "oldest", timestamp: 1_700_000_000_000 }),
    ];
    memoryStore.set(STORAGE_KEY, JSON.stringify(stored));
    expect(getCrashReports()).toEqual([]);

    const hydrated = await hydrateCrashReports();

    expect(hydrated).toBe(2);
    const buf = getCrashReports();
    expect(buf).toHaveLength(2);
    expect(buf[0].message).toBe("older");
    expect(buf[1].message).toBe("oldest");
  });

  it("clearCrashReports wipes both memory and storage", async () => {
    recordCrashReport(makeReport({ message: "to be cleared" }));
    await flush();
    expect(memoryStore.has(STORAGE_KEY)).toBe(true);

    clearCrashReports();
    await flush();

    expect(getCrashReports()).toEqual([]);
    expect(memoryStore.has(STORAGE_KEY)).toBe(false);
  });

  it("hydrate is a no-op when the buffer already has entries (fresh crash wins)", async () => {
    memoryStore.set(STORAGE_KEY, JSON.stringify([makeReport({ message: "stale" })]));
    recordCrashReport(makeReport({ message: "fresh" }));
    await flush();

    const hydrated = await hydrateCrashReports();

    expect(hydrated).toBe(0);
    const buf = getCrashReports();
    expect(buf).toHaveLength(1);
    expect(buf[0].message).toBe("fresh");
  });

  it("hydrate tolerates malformed storage payloads without throwing", async () => {
    memoryStore.set(STORAGE_KEY, "{not json");
    await expect(hydrateCrashReports()).resolves.toBe(0);
    expect(getCrashReports()).toEqual([]);

    memoryStore.set(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    await expect(hydrateCrashReports()).resolves.toBe(0);
    expect(getCrashReports()).toEqual([]);

    memoryStore.set(STORAGE_KEY, JSON.stringify([{ partial: true }, makeReport({ message: "valid" })]));
    await expect(hydrateCrashReports()).resolves.toBe(1);
    expect(getCrashReports()).toHaveLength(1);
    expect(getCrashReports()[0].message).toBe("valid");
  });
});
