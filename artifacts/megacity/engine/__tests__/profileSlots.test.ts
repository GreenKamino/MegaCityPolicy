import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_SLOTS_PER_PROFILE } from "@/engine/profiles";

describe("MAX_SLOTS_PER_PROFILE", () => {
  it("is exactly 6", () => {
    expect(MAX_SLOTS_PER_PROFILE).toBe(6);
  });

  it("is a positive integer", () => {
    expect(Number.isInteger(MAX_SLOTS_PER_PROFILE)).toBe(true);
    expect(MAX_SLOTS_PER_PROFILE).toBeGreaterThan(0);
  });

  it("supports the slot index range used at slot listing time", () => {
    const indices: number[] = [];
    for (let i = 1; i <= MAX_SLOTS_PER_PROFILE; i++) indices.push(i);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// In-memory AsyncStorage mock with crash injection. Engine tests run on
// node, where the real RN AsyncStorage references `window`. We expose a
// mutable `failOnSetItemKey` so individual tests can simulate a power
// loss between bytes by throwing on a specific key's setItem.
type FailHook = ((key: string) => boolean) | null;
const memoryStore = new Map<string, string>();
let failOnSetItem: FailHook = null;
let failOnMultiSet: ((pairs: [string, string][]) => boolean) | null = null;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: async (k: string, v: string) => {
      if (failOnSetItem && failOnSetItem(k)) {
        throw new Error(`simulated crash on setItem(${k})`);
      }
      memoryStore.set(k, v);
    },
    removeItem: async (k: string) => { memoryStore.delete(k); },
    multiSet: async (pairs: [string, string][]) => {
      if (failOnMultiSet && failOnMultiSet(pairs)) {
        throw new Error("simulated crash on multiSet");
      }
      for (const [k, v] of pairs) memoryStore.set(k, v);
    },
    multiRemove: async (keys: string[]) => { for (const k of keys) memoryStore.delete(k); },
    clear: async () => { memoryStore.clear(); },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

import {
  createDefaultProfile,
  loadActiveProfileId,
  loadProfile,
  loadProfileIndex,
  profileKey,
  saveActiveProfileId,
  saveProfile,
  saveProfileIndex,
} from "@/engine/profiles";
import { TMP_SUFFIX } from "@/engine/saveLoad";

describe("profile writes survive a torn write (Task #173)", () => {
  beforeEach(() => {
    memoryStore.clear();
    failOnSetItem = null;
    failOnMultiSet = null;
  });

  it("saveProfile: a crash mid-commit leaves the prior profile blob intact", async () => {
    // Establish a known-good prior profile.
    const profile = createDefaultProfile("Original", 35, "male");
    await saveProfile(profile);
    const priorRaw = memoryStore.get(profileKey(profile.id));
    expect(priorRaw).toBeTruthy();
    const priorParsed = JSON.parse(priorRaw!);
    expect(priorParsed.name).toBe("Original");

    // Simulate a power loss between phase 1 (tmp write) and phase 2
    // (swap commit). atomicWriteSlot uses multiSet when there's an
    // existing primary, so we fail both multiSet and any direct
    // setItem to the live profile key — the swap can't complete by
    // either code path.
    const liveKey = profileKey(profile.id);
    failOnMultiSet = () => true;
    failOnSetItem = (k) => k === liveKey;

    const advanced = { ...profile, name: "Renamed", commanderLevel: 99 };
    let threw = false;
    try {
      await saveProfile(advanced);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Critical invariant: the live profile key still holds the prior
    // good blob — no garbage, no half-written name field.
    const afterRaw = memoryStore.get(liveKey);
    expect(afterRaw).toBe(priorRaw);
    const reloaded = await loadProfile(profile.id);
    expect(reloaded?.name).toBe("Original");
    expect(reloaded?.commanderLevel).toBe(1);
  });

  it("saveProfileIndex: a crash mid-commit leaves the prior index intact", async () => {
    // Seed an index of two ids.
    await saveProfileIndex(["prof_a", "prof_b"]);
    const priorIndex = await loadProfileIndex();
    expect(priorIndex).toEqual(["prof_a", "prof_b"]);

    // Inject a crash on the swap commit for the index key.
    const indexKey = "@megacity_profiles_index";
    failOnMultiSet = () => true;
    failOnSetItem = (k) => k === indexKey;

    let threw = false;
    try {
      await saveProfileIndex(["prof_a", "prof_b", "prof_c"]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // The index must still be the prior list — losing it would
    // orphan every profile and every slot under it.
    const after = await loadProfileIndex();
    expect(after).toEqual(["prof_a", "prof_b"]);
  });

  it("saveActiveProfileId: a crash mid-commit leaves the prior pointer intact", async () => {
    await saveActiveProfileId("prof_first");
    expect(await loadActiveProfileId()).toBe("prof_first");

    const activeKey = "@megacity_active_profile";
    failOnMultiSet = () => true;
    failOnSetItem = (k) => k === activeKey;

    let threw = false;
    try {
      await saveActiveProfileId("prof_second");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Pointer must still resolve to the previous active profile, not
    // a garbled half-write or null.
    expect(await loadActiveProfileId()).toBe("prof_first");
  });

  it("saveProfile: a successful write cleans up the tmp key", async () => {
    const profile = createDefaultProfile("Cleanup", 30, "female");
    await saveProfile(profile);
    expect(memoryStore.has(profileKey(profile.id))).toBe(true);
    // Tmp must not accumulate across thousands of writes.
    expect(memoryStore.has(profileKey(profile.id) + TMP_SUFFIX)).toBe(false);
  });
});
