import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// In-memory AsyncStorage mock shared by SettingsContext (and the real
// atomicWriteSlot it routes persistence through). We seed/overwrite
// @megacity_settings directly on this store to simulate a full-backup
// restore having dropped a fresh settings blob into place.
const memoryStore = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) =>
      memoryStore.has(k) ? memoryStore.get(k)! : null,
    setItem: async (k: string, v: string) => {
      memoryStore.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStore.delete(k);
    },
    multiSet: async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) memoryStore.set(k, v);
    },
    multiRemove: async (keys: string[]) => {
      for (const k of keys) memoryStore.delete(k);
    },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

// SettingsContext fires audio/haptics side-effect setters from useEffect;
// those pull in expo-audio / expo-haptics which don't load under node.
vi.mock("@/engine/audio", () => ({
  setMuted: () => {},
  setVolume: () => {},
  setAmbienceEnabled: () => {},
}));
vi.mock("@/engine/haptics", () => ({
  setHapticsEnabled: () => {},
  setHapticsReducedMotion: () => {},
}));

import { SettingsProvider, useSettings } from "@/context/SettingsContext";

const SETTINGS_KEY = "@megacity_settings";

// The non-data fields the context layers on top of SettingsState. Stripped
// so we compare only the persisted preference shape.
const NON_SETTINGS_KEYS = new Set([
  "fontScaleMultiplier",
  "scaledFont",
  "setSetting",
  "resetSettings",
  "resetSettingsKeys",
  "reloadFromStorage",
]);

function pickSettings(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (!NON_SETTINGS_KEYS.has(k)) out[k] = v;
  }
  return out;
}

let ctx: any;

function Capture() {
  ctx = useSettings();
  return null;
}

async function mount() {
  await act(async () => {
    TestRenderer.create(
      React.createElement(SettingsProvider, null, React.createElement(Capture))
    );
  });
  // Flush the provider's async getItem(STORAGE_KEY) load.
  await act(async () => {
    await Promise.resolve();
  });
}

// Let fire-and-forget atomicWriteSlot persistence settle.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Run the async reloadFromStorage() and let its setState settle.
async function reload() {
  await act(async () => {
    await ctx.reloadFromStorage();
  });
}

describe("reloadFromStorage() applies restored preferences live (Task #344)", () => {
  beforeEach(() => {
    memoryStore.clear();
    ctx = undefined;
  });

  it("re-reads @megacity_settings and reflects the restored values in the live context", async () => {
    await mount();

    // No persisted settings yet, so the live context reflects defaults.
    const defaults = pickSettings(ctx);

    // Simulate a full-backup restore writing a fresh settings blob straight
    // into storage (cross-group + intentionally-ungrouped keys), AFTER mount.
    const restored = {
      crtEnabled: !defaults.crtEnabled,
      fontScale: "large",
      soundMuted: !defaults.soundMuted,
      reducedMotion: !defaults.reducedMotion,
      defaultStartStyle: "veteran",
    };
    memoryStore.set(SETTINGS_KEY, JSON.stringify(restored));

    await reload();

    // The live context now reflects the restored blob overlaid on defaults,
    // with no app restart required.
    expect(pickSettings(ctx)).toEqual({ ...defaults, ...restored });
  });

  it("falls back to DEFAULT_SETTINGS when the settings key is empty", async () => {
    await mount();
    const defaults = pickSettings(ctx);

    // Diverge the in-memory state so a no-op reload would be detectable.
    act(() => ctx.setSetting("fontScale", "xlarge"));
    act(() => ctx.setSetting("soundMuted", true));
    act(() => ctx.setSetting("crtEnabled", !defaults.crtEnabled));
    await flush();
    expect(pickSettings(ctx)).not.toEqual(defaults);

    // A restore that cleared the settings key (or a fresh device) leaves
    // storage empty — reload must snap back to defaults.
    for (const k of Array.from(memoryStore.keys())) {
      if (k.startsWith(SETTINGS_KEY)) memoryStore.delete(k);
    }

    await reload();

    expect(pickSettings(ctx)).toEqual(defaults);
  });

  it("leaves in-memory state untouched when the stored settings JSON is corrupt", async () => {
    await mount();
    const defaults = pickSettings(ctx);

    // Establish a known, non-default in-memory state.
    act(() => ctx.setSetting("fontScale", "xlarge"));
    act(() => ctx.setSetting("commsChatterEnabled", false));
    act(() => ctx.setSetting("defaultStartStyle", "veteran"));
    await flush();
    const mutated = pickSettings(ctx);
    expect(mutated).not.toEqual(defaults);

    // Corrupt the persisted blob (e.g. a torn restore write).
    memoryStore.set(SETTINGS_KEY, "{ this is : not valid json ");

    await reload();

    // JSON.parse throws -> the catch leaves the live state exactly as it was,
    // rather than wiping the player's current prefs to defaults or garbage.
    expect(pickSettings(ctx)).toEqual(mutated);
  });

  it("merges a partial stored blob over current state, keeping unlisted keys", async () => {
    await mount();
    const defaults = pickSettings(ctx);

    // Give the live context some non-default values BEFORE the reload, so a
    // partial blob that omits these keys can prove they are preserved.
    act(() => ctx.setSetting("fontScale", "xlarge"));
    act(() => ctx.setSetting("hapticsEnabled", !defaults.hapticsEnabled));
    await flush();
    const prevState = pickSettings(ctx);

    // A partial blob that only mentions OTHER keys (here both default-valued
    // in prevState, so we can see them flip).
    const partial = {
      crtEnabled: !defaults.crtEnabled,
      soundMuted: !defaults.soundMuted,
    };
    memoryStore.set(SETTINGS_KEY, JSON.stringify(partial));

    await reload();

    // The merge is { ...DEFAULT_SETTINGS, ...prev, ...parsed }: the blob's keys
    // win, but keys it omits keep the current in-memory value (fontScale,
    // hapticsEnabled) rather than snapping back to defaults.
    expect(pickSettings(ctx)).toEqual({ ...prevState, ...partial });
    expect(ctx.fontScale).toBe("xlarge");
    expect(ctx.hapticsEnabled).toBe(!defaults.hapticsEnabled);
  });
});
