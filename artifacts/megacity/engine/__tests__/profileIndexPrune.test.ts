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

import {
  MAX_PROFILES,
  createDefaultProfile,
  loadAllProfilesStrict,
  loadProfileIndex,
  profileKey,
  pruneProfileIndex,
  saveProfile,
  saveProfileIndex,
} from "@/engine/profiles";

// The ghost-index bug: the profile index claimed ids whose profile records
// were gone or unreadable. The roster UI (loadAllProfiles) silently skipped
// them, but the commander-cap check counted them — so creation threw at the
// cap while the screen showed free space. pruneProfileIndex is the repair.
describe("pruneProfileIndex", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  async function seedProfiles(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const p = createDefaultProfile(name, 35, "male");
      // createDefaultProfile ids are Date.now()-based; make them unique.
      p.id = `${p.id}_${name}`;
      await saveProfile(p);
      ids.push(p.id);
    }
    await saveProfileIndex(ids);
    return ids;
  }

  it("keeps a healthy index untouched", async () => {
    const ids = await seedProfiles(["Alpha", "Beta"]);
    const kept = await pruneProfileIndex();
    expect(kept).toEqual(ids);
    expect(await loadProfileIndex()).toEqual(ids);
  });

  it("drops ghost ids whose profile record is missing", async () => {
    const ids = await seedProfiles(["Alpha"]);
    await saveProfileIndex([...ids, "ghost_1", "ghost_2"]);
    const kept = await pruneProfileIndex();
    expect(kept).toEqual(ids);
    expect(await loadProfileIndex()).toEqual(ids);
  });

  it("drops ids whose profile blob is corrupt (unparseable)", async () => {
    const ids = await seedProfiles(["Alpha", "Beta"]);
    memoryStore.set(profileKey(ids[1]), "{not valid json!!");
    const kept = await pruneProfileIndex();
    expect(kept).toEqual([ids[0]]);
  });

  it("dedupes repeated ids", async () => {
    const ids = await seedProfiles(["Alpha"]);
    await saveProfileIndex([ids[0], ids[0], ids[0]]);
    const kept = await pruneProfileIndex();
    expect(kept).toEqual([ids[0]]);
  });

  it("drops non-string and empty entries from a mangled index", async () => {
    const ids = await seedProfiles(["Alpha"]);
    memoryStore.set(
      "@megacity_profiles_index",
      JSON.stringify([ids[0], "", null, 42, "ghost"]),
    );
    const kept = await pruneProfileIndex();
    expect(kept).toEqual([ids[0]]);
  });

  it("a ghost-inflated index at the cap frees room for creation after pruning", async () => {
    // Two real commanders + six ghosts = a full-looking index of 8.
    const ids = await seedProfiles(["Alpha", "Beta"]);
    const ghosts = Array.from({ length: MAX_PROFILES - ids.length }, (_, i) => `ghost_${i}`);
    await saveProfileIndex([...ids, ...ghosts]);
    expect((await loadProfileIndex()).length).toBe(MAX_PROFILES);

    // After pruning, the authoritative count matches the real roster, so the
    // cap check (kept.length >= MAX_PROFILES) no longer blocks creation.
    const kept = await pruneProfileIndex();
    expect(kept.length).toBe(ids.length);
    expect(kept.length).toBeLessThan(MAX_PROFILES);
  });

  it("empties the index entirely when every entry is a ghost", async () => {
    await saveProfileIndex(["g1", "g2", "g3"]);
    const kept = await pruneProfileIndex();
    expect(kept).toEqual([]);
    expect(await loadProfileIndex()).toEqual([]);
  });
});

describe("loadAllProfilesStrict", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("returns the complete healthy roster without writing storage", async () => {
    const profile = createDefaultProfile("Alpha", 35, "male");
    await saveProfile(profile);
    await saveProfileIndex([profile.id]);
    const before = new Map(memoryStore);

    const profiles = await loadAllProfilesStrict();

    expect(profiles.map((entry) => entry.id)).toEqual([profile.id]);
    expect(memoryStore).toEqual(before);
  });

  it("rejects a malformed index instead of treating it as an empty roster", async () => {
    memoryStore.set("@megacity_profiles_index", "{not valid json");

    await expect(loadAllProfilesStrict()).rejects.toThrow();
    expect(memoryStore.get("@megacity_profiles_index")).toBe("{not valid json");
  });

  it("rejects a malformed profile without pruning or overwriting it", async () => {
    await saveProfileIndex(["corrupt_profile"]);
    memoryStore.set(profileKey("corrupt_profile"), "{not valid json");

    await expect(loadAllProfilesStrict()).rejects.toThrow();
    expect(await loadProfileIndex()).toEqual(["corrupt_profile"]);
    expect(memoryStore.get(profileKey("corrupt_profile"))).toBe("{not valid json");
  });
});
