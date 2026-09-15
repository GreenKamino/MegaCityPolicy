import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory AsyncStorage mock — engine tests run on node, where the real RN
// AsyncStorage references `window`. Same pattern as profileSlots.test.ts.
const memoryStore = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: async (k: string, v: string) => { memoryStore.set(k, v); },
    removeItem: async (k: string) => { memoryStore.delete(k); },
    multiSet: async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) memoryStore.set(k, v);
    },
    multiRemove: async (keys: string[]) => { for (const k of keys) memoryStore.delete(k); },
    clear: async () => { memoryStore.clear(); },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MAX_SLOTS_PER_PROFILE,
  PROFILE_PREFIX,
  createDefaultProfile,
  deleteProfile,
  loadProfileIndex,
  profileKey,
  profileSlotKey,
  saveProfile,
  saveProfileIndex,
} from "@/engine/profiles";
import { BACKUP_SUFFIX, TMP_SUFFIX, sweepStaleTmpKeys, writeSlotSave } from "@/engine/saveLoad";
import {
  CLOUD_SYNC_BASELINE_KEY,
  clearSyncBaselines,
  loadSyncBaseline,
  recordDeletionTombstone,
  recordSyncBaseline,
} from "@/engine/cloudSaveSync";
import { createInitialState } from "@/engine/initialState";

// Deleting a commander must delete EVERY key their play produced — primaries,
// `_backup` rotations, `.tmp` staging leftovers, and the profile blob's own
// backup/tmp — or storage grows silently and a future commander colliding
// with a recycled id inherits stale data (Task: commander delete cleanup).
describe("deleteProfile storage cleanup", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  async function seedCommanderWithSaves() {
    const profile = createDefaultProfile("Cleanup Test", 40, "female");
    await saveProfile(profile);
    // Second profile write rotates the first blob into `_backup`.
    profile.name = "Cleanup Test Renamed";
    await saveProfile(profile);
    await saveProfileIndex([profile.id]);

    const state = createInitialState();
    // Save twice to slot 1 so a `_backup` key exists, once to slot 3.
    const slot1Key = profileSlotKey(profile.id, 1);
    const slot3Key = profileSlotKey(profile.id, 3);
    await writeSlotSave(AsyncStorage, slot1Key, state);
    await writeSlotSave(AsyncStorage, slot1Key, { ...state, totalTicks: (state.totalTicks ?? 0) + 1 });
    await writeSlotSave(AsyncStorage, slot3Key, state);
    // Simulate a crash between the atomic-write swap and its tmp cleanup:
    // a stale `.tmp` blob left under a profile slot key.
    memoryStore.set(slot1Key + TMP_SUFFIX, "stale tmp blob");
    return { profile, slot1Key, slot3Key };
  }

  it("seeding actually produces primary, backup, and tmp keys (guards the fixture)", async () => {
    const { profile, slot1Key, slot3Key } = await seedCommanderWithSaves();
    expect(memoryStore.has(profileKey(profile.id))).toBe(true);
    expect(memoryStore.has(profileKey(profile.id) + BACKUP_SUFFIX)).toBe(true);
    expect(memoryStore.has(slot1Key)).toBe(true);
    expect(memoryStore.has(slot1Key + BACKUP_SUFFIX)).toBe(true);
    expect(memoryStore.has(slot1Key + TMP_SUFFIX)).toBe(true);
    expect(memoryStore.has(slot3Key)).toBe(true);
  });

  it("create → save → delete leaves NO keys containing the commander's id", async () => {
    const { profile } = await seedCommanderWithSaves();

    await deleteProfile(profile.id);

    const orphans = Array.from(memoryStore.keys()).filter((k) => k.includes(profile.id));
    expect(orphans).toEqual([]);
    expect(await loadProfileIndex()).toEqual([]);
  });

  it("deleting one commander does not touch a second commander's keys", async () => {
    const { profile: doomed } = await seedCommanderWithSaves();
    const survivor = createDefaultProfile("Survivor", 33, "male");
    survivor.id = `${survivor.id}_survivor`;
    await saveProfile(survivor);
    await saveProfileIndex([doomed.id, survivor.id]);
    const survivorSlot = profileSlotKey(survivor.id, 2);
    await writeSlotSave(AsyncStorage, survivorSlot, createInitialState());

    await deleteProfile(doomed.id);

    expect(memoryStore.has(profileKey(survivor.id))).toBe(true);
    expect(memoryStore.has(survivorSlot)).toBe(true);
    expect(await loadProfileIndex()).toEqual([survivor.id]);
    expect(Array.from(memoryStore.keys()).filter((k) => k.includes(doomed.id))).toEqual([]);
  });

  it("covers every slot index the save UI can write (1..MAX_SLOTS_PER_PROFILE)", async () => {
    const profile = createDefaultProfile("All Slots", 50, "other");
    await saveProfile(profile);
    await saveProfileIndex([profile.id]);
    const state = createInitialState();
    for (let i = 1; i <= MAX_SLOTS_PER_PROFILE; i++) {
      await writeSlotSave(AsyncStorage, profileSlotKey(profile.id, i), state);
    }

    await deleteProfile(profile.id);

    expect(Array.from(memoryStore.keys()).filter((k) => k.includes(profile.id))).toEqual([]);
  });
});

describe("profile save temp-key startup cleanup", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("reaps a stale profile-slot tmp key without touching its primary or backup", async () => {
    const slotKey = profileSlotKey("prof_active", 2);
    memoryStore.set(slotKey, "live-primary");
    memoryStore.set(slotKey + BACKUP_SUFFIX, "live-backup");
    memoryStore.set(slotKey + TMP_SUFFIX, "stale-tmp");

    const removed = await sweepStaleTmpKeys(AsyncStorage, [PROFILE_PREFIX]);

    expect(removed).toEqual([slotKey + TMP_SUFFIX]);
    expect(memoryStore.has(slotKey + TMP_SUFFIX)).toBe(false);
    expect(memoryStore.get(slotKey)).toBe("live-primary");
    expect(memoryStore.get(slotKey + BACKUP_SUFFIX)).toBe("live-backup");
  });
});

// The cloud-sync baseline map is a SHARED key: deleting a commander must
// drop only that commander's slot entries (including stale tombstones on the
// non-Steam path) and leave everyone else's lineage untouched.
describe("clearSyncBaselines (profile-delete baseline cleanup)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("removes all of the deleted commander's entries in one pass, keeps others", async () => {
    const state = createInitialState();
    const doomedKeys = [profileSlotKey("prof_doomed", 1), profileSlotKey("prof_doomed", 2)];
    const survivorKey = profileSlotKey("prof_survivor", 1);

    const wrapped1 = await writeSlotSave(AsyncStorage, doomedKeys[0], state);
    const wrappedSurvivor = await writeSlotSave(AsyncStorage, survivorKey, state);
    await recordSyncBaseline(AsyncStorage, doomedKeys[0], wrapped1);
    // Slot 2 carries a stale deletion tombstone from an earlier slot delete.
    await recordDeletionTombstone(AsyncStorage, doomedKeys[1]);
    await recordSyncBaseline(AsyncStorage, survivorKey, wrappedSurvivor);

    await clearSyncBaselines(AsyncStorage, doomedKeys);

    const baseline = await loadSyncBaseline(AsyncStorage);
    expect(baseline[doomedKeys[0]]).toBeUndefined();
    expect(baseline[doomedKeys[1]]).toBeUndefined();
    expect(baseline[survivorKey]).toBeDefined();
  });

  it("is a no-op (no rewrite) when none of the keys have entries", async () => {
    memoryStore.set(CLOUD_SYNC_BASELINE_KEY, JSON.stringify({ other: { checksum: "x", syncedAt: 1 } }));
    const before = memoryStore.get(CLOUD_SYNC_BASELINE_KEY);
    await clearSyncBaselines(AsyncStorage, [profileSlotKey("prof_none", 1)]);
    expect(memoryStore.get(CLOUD_SYNC_BASELINE_KEY)).toBe(before);
  });
});

// Wiring guard: GameContext.deleteProfileFn must route its non-Steam branch
// through clearSyncBaselines under the baseline lock. Asserted against the
// source text because mounting GameProvider drags in the whole native graph
// (same pattern as other screen-config tests in this repo).
describe("GameContext deleteProfileFn wiring", () => {
  it("clears profile slot baselines on the non-Steam delete path", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../context/GameContext.tsx"),
      "utf8",
    );
    const fnStart = src.indexOf("const deleteProfileFn");
    expect(fnStart).toBeGreaterThan(-1);
    const body = src.slice(fnStart, src.indexOf("deleteProfileStorage(profileId)", fnStart));
    expect(body).toContain("clearSyncBaselines(AsyncStorage");
    expect(body).toContain("withBaselineLock");
  });
});
