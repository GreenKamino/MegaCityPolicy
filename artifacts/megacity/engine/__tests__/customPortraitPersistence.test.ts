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
  createDefaultProfile,
  deleteProfile,
  loadProfile,
  saveProfile,
  saveProfileIndex,
} from "@/engine/profiles";
import { customPortraitIdFor } from "@/utils/customPortraits";

// A commander's uploaded photo is stored INLINE on the profile blob as a
// small base64 data URI (Task #530). That design only works if the field
// survives the full save -> load round trip untouched, and disappears with
// the profile on delete (no separate image file to orphan).

const DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=";

describe("custom portrait profile persistence", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("round-trips customPortraitUri and the sentinel portraitId through save/load", async () => {
    const profile = createDefaultProfile("Photo Cmdr", 35, "female");
    profile.customPortraitUri = DATA_URI;
    profile.portraitId = customPortraitIdFor(profile.id);
    await saveProfile(profile);

    const loaded = await loadProfile(profile.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.customPortraitUri).toBe(DATA_URI);
    expect(loaded!.portraitId).toBe(`custom_${profile.id}`);
  });

  it("leaves profiles without an upload untouched (field stays absent)", async () => {
    const profile = createDefaultProfile("Stock Cmdr", 40, "male", "draven_korr");
    await saveProfile(profile);

    const loaded = await loadProfile(profile.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.customPortraitUri).toBeUndefined();
    expect(loaded!.portraitId).toBe("draven_korr");
  });

  it("deleting the profile removes the inline image with it", async () => {
    const profile = createDefaultProfile("Doomed Cmdr", 50, "other");
    profile.customPortraitUri = DATA_URI;
    profile.portraitId = customPortraitIdFor(profile.id);
    await saveProfile(profile);
    await saveProfileIndex([profile.id]);

    await deleteProfile(profile.id);

    expect(await loadProfile(profile.id)).toBeNull();
    // No storage key anywhere should still carry the image bytes — the
    // data URI lived only inside the deleted profile blob.
    for (const [, value] of memoryStore) {
      expect(value.includes(DATA_URI)).toBe(false);
    }
  });
});
