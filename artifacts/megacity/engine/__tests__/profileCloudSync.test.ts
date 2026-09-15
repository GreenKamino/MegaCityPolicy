import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory AsyncStorage mock (engine tests run on node, real RN
// AsyncStorage references `window`). Mirrors the pattern used by
// offlineSimDepthProfile.test.ts.
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

// In-memory Steam Cloud mock. The real bridge short-circuits on non-Steam
// platforms; here we substitute a fake file store the helpers can drive.
const cloudStore = new Map<string, string>();
vi.mock("@/engine/steamBridge", () => ({
  writeCloudProfiles: async (data: string) => {
    cloudStore.set("megacity_profiles.json", data);
    return true;
  },
  readCloudProfiles: async () => cloudStore.get("megacity_profiles.json") ?? null,
}));

import {
  createDefaultProfile,
  loadActiveProfileId,
  loadAllProfiles,
  loadProfileIndex,
  saveActiveProfileId,
  saveProfile,
  saveProfileIndex,
} from "@/engine/profiles";
import {
  bootstrapProfilesFromCloudIfEmpty,
  pushProfilesToCloud,
  restoreProfilesFromCloud,
} from "@/engine/profileCloudSync";

beforeEach(() => {
  memoryStore.clear();
  cloudStore.clear();
});

async function seedTwoProfiles() {
  const a = createDefaultProfile("Marshal Alpha", 30, "male");
  const b = createDefaultProfile("Marshal Beta", 28, "female");
  await saveProfile(a);
  await saveProfile(b);
  await saveProfileIndex([a.id, b.id]);
  await saveActiveProfileId(a.id);
  return { a, b };
}

describe("Steam Cloud profile sync", () => {
  it("pushProfilesToCloud bundles every local profile and the active id", async () => {
    const { a, b } = await seedTwoProfiles();
    const ok = await pushProfilesToCloud();
    expect(ok).toBe(true);

    const raw = cloudStore.get("megacity_profiles.json");
    expect(raw).toBeTruthy();
    const bundle = JSON.parse(raw!);
    expect(bundle.version).toBe(1);
    expect(bundle.profiles).toHaveLength(2);
    expect(bundle.profiles.map((p: { id: string }) => p.id).sort())
      .toEqual([a.id, b.id].sort());
    expect(bundle.activeProfileId).toBe(a.id);
    expect(typeof bundle.exportedAt).toBe("number");
  });

  it("restoreProfilesFromCloud writes the bundle into a fresh local store", async () => {
    const { a, b } = await seedTwoProfiles();
    await pushProfilesToCloud();

    // Wipe local AsyncStorage to simulate a fresh-device install.
    memoryStore.clear();
    expect(await loadProfileIndex()).toEqual([]);

    const restored = await restoreProfilesFromCloud();
    expect(restored).toBe(2);

    const localProfiles = await loadAllProfiles();
    expect(localProfiles.map(p => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(await loadActiveProfileId()).toBe(a.id);
  });

  it("bootstrapProfilesFromCloudIfEmpty is a no-op when local already has profiles", async () => {
    await seedTwoProfiles();
    await pushProfilesToCloud();
    // Tamper with cloud bundle to prove we don't read it when local has data.
    cloudStore.set("megacity_profiles.json", JSON.stringify({
      version: 1,
      profiles: [{ id: "ghost", name: "Should not appear" }],
      activeProfileId: "ghost",
      exportedAt: 0,
    }));

    const restored = await bootstrapProfilesFromCloudIfEmpty();
    expect(restored).toBe(0);

    const profiles = await loadAllProfiles();
    expect(profiles.find(p => p.id === "ghost")).toBeUndefined();
    expect(profiles).toHaveLength(2);
  });

  it("bootstrapProfilesFromCloudIfEmpty restores from cloud when local is empty", async () => {
    const { a } = await seedTwoProfiles();
    await pushProfilesToCloud();
    memoryStore.clear();

    const restored = await bootstrapProfilesFromCloudIfEmpty();
    expect(restored).toBe(2);
    expect(await loadActiveProfileId()).toBe(a.id);
  });

  it("does not apply a cloud profile bundle after the startup budget expires", async () => {
    await seedTwoProfiles();
    await pushProfilesToCloud();
    memoryStore.clear();

    const restored = await bootstrapProfilesFromCloudIfEmpty(() => false);

    expect(restored).toBe(0);
    expect(await loadProfileIndex()).toEqual([]);
    expect(await loadAllProfiles()).toEqual([]);
  });

  it("returns 0 (does not throw) when cloud is empty / unavailable", async () => {
    expect(await restoreProfilesFromCloud()).toBe(0);
    expect(await bootstrapProfilesFromCloudIfEmpty()).toBe(0);
    expect(await loadProfileIndex()).toEqual([]);
  });

  it("returns 0 (does not throw) when cloud bundle is corrupted JSON", async () => {
    cloudStore.set("megacity_profiles.json", "{not-json::::");
    expect(await restoreProfilesFromCloud()).toBe(0);
    expect(await loadProfileIndex()).toEqual([]);
  });

  it("returns 0 when cloud bundle is valid JSON but the wrong shape", async () => {
    cloudStore.set("megacity_profiles.json", JSON.stringify({ hello: "world" }));
    expect(await restoreProfilesFromCloud()).toBe(0);
    expect(await loadProfileIndex()).toEqual([]);
  });

  it("skips bundle entries missing required fields without aborting the restore", async () => {
    const good = createDefaultProfile("Good Profile", 33, "other");
    cloudStore.set("megacity_profiles.json", JSON.stringify({
      version: 1,
      profiles: [
        { id: "" },                  // skipped (empty id)
        null,                        // skipped (null entry)
        good,                        // kept
        { name: "no id at all" },    // skipped (missing id)
      ],
      activeProfileId: good.id,
      exportedAt: Date.now(),
    }));

    const restored = await restoreProfilesFromCloud();
    expect(restored).toBe(1);
    const ids = await loadProfileIndex();
    expect(ids).toEqual([good.id]);
    expect(await loadActiveProfileId()).toBe(good.id);
  });

  it("does not pin activeProfileId when the referenced profile failed to restore", async () => {
    const good = createDefaultProfile("Survivor", 40, "male");
    cloudStore.set("megacity_profiles.json", JSON.stringify({
      version: 1,
      profiles: [good],
      activeProfileId: "missing-from-bundle",
      exportedAt: Date.now(),
    }));

    await restoreProfilesFromCloud();
    expect(await loadActiveProfileId()).toBeNull();
  });
});
