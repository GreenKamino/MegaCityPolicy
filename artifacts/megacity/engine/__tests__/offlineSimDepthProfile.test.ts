import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock AsyncStorage with an in-memory map. The real RN AsyncStorage
// commonjs build references `window`, which doesn't exist in the
// node-environment vitest config used by the engine test suite.
const memoryStore = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: async (k: string, v: string) => { memoryStore.set(k, v); },
    removeItem: async (k: string) => { memoryStore.delete(k); },
    clear: async () => { memoryStore.clear(); },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

import { createDefaultProfile, loadProfile, saveProfile } from "@/engine/profiles";
import { OFFLINE_SIM_DEPTH_BATCH_LIMIT, normalizeOfflineSimDepth } from "@/engine/offlineSimDepth";
import type { PlayerProfile } from "@/engine/types";

beforeEach(() => {
  memoryStore.clear();
});

describe("PlayerProfile.offlineSimDepth roundtrip", () => {
  it("survives save -> load via AsyncStorage", async () => {
    const prof = createDefaultProfile("Marshal Test", 32, "other");
    const updated: PlayerProfile = { ...prof, offlineSimDepth: "deep" };
    await saveProfile(updated);
    const reloaded = await loadProfile(prof.id);
    expect(reloaded?.offlineSimDepth).toBe("deep");
  });

  it("survives a JSON export/import cycle (mirrors save backup/restore path)", () => {
    const prof = createDefaultProfile("Marshal Export", 40, "female");
    const withDepth: PlayerProfile = { ...prof, offlineSimDepth: "lite" };
    const exported = JSON.stringify(withDepth);
    const reimported = JSON.parse(exported) as PlayerProfile;
    expect(reimported.offlineSimDepth).toBe("lite");
  });

  it("defaults to undefined for legacy profiles created before the setting existed", () => {
    const prof = createDefaultProfile("Legacy", 28, "male");
    expect(prof.offlineSimDepth).toBeUndefined();
  });

  it("normalizes invalid/corrupted offlineSimDepth to 'standard' so offline math stays numeric", () => {
    for (const bogus of [undefined, null, "", "extreme", "LITE", 42, {}]) {
      const normalized = normalizeOfflineSimDepth(bogus);
      expect(normalized).toBe("standard");
      const limit = OFFLINE_SIM_DEPTH_BATCH_LIMIT[normalized];
      expect(Number.isFinite(limit)).toBe(true);
      expect(Number.isFinite(Math.min(10_000, limit))).toBe(true);
    }
  });

  it("accepts each of the three valid depth presets", async () => {
    for (const depth of ["lite", "standard", "deep"] as const) {
      const prof = createDefaultProfile(`Profile ${depth}`, 30, "other");
      const updated: PlayerProfile = { ...prof, offlineSimDepth: depth };
      await saveProfile(updated);
      const reloaded = await loadProfile(prof.id);
      expect(reloaded?.offlineSimDepth).toBe(depth);
    }
  });
});
