import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// In-memory AsyncStorage mock shared by SettingsContext (and the real
// atomicWriteSlot it routes persistence through). Seeded with save-slot
// blobs so we can prove resetSettings() never touches them.
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

// Realistic save-slot fixtures. Keys mirror the real save namespaces:
// the per-slot prefix (@megacity_slot_<n>) and the legacy single-save key
// (@megacity_save). None of these start with @megacity_settings, so they
// are entirely separate from the preferences storage key.
const SAVE_SLOTS: Record<string, string> = {
  "@megacity_slot_0": JSON.stringify({ city: "Aurora", credits: 12345, ticks: 880 }),
  "@megacity_slot_1": JSON.stringify({ city: "Bastion", credits: 6789, ticks: 240 }),
  "@megacity_save": JSON.stringify({ city: "Legacy", credits: 100, ticks: 5 }),
};

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

// Snapshot every stored entry that does NOT belong to the settings
// namespace (the settings key plus its atomicWriteSlot tmp/backup
// siblings). This is the set that must be byte-for-byte identical before
// and after a preferences reset.
function nonSettingsSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of memoryStore.entries()) {
    if (!k.startsWith(SETTINGS_KEY)) out[k] = v;
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

describe("resetSettings() restores defaults without wiping save slots (Task #341)", () => {
  beforeEach(() => {
    memoryStore.clear();
    ctx = undefined;
  });

  it("returns the settings key to DEFAULT_SETTINGS and leaves save-slot keys untouched", async () => {
    // Seed save slots BEFORE the provider mounts — these represent the
    // player's progress and must survive a preferences reset.
    for (const [k, v] of Object.entries(SAVE_SLOTS)) memoryStore.set(k, v);

    await mount();

    // No persisted settings yet, so the live context reflects defaults.
    const defaults = pickSettings(ctx);

    // Mutate several preferences across groups so the persisted blob
    // genuinely diverges from defaults.
    act(() => ctx.setSetting("fontScale", "xlarge"));
    act(() => ctx.setSetting("soundMuted", true));
    act(() => ctx.setSetting("crtEnabled", false));
    act(() => ctx.setSetting("defaultStartStyle", "veteran"));
    await flush();

    // Sanity: the settings key now holds a non-default blob.
    expect(memoryStore.has(SETTINGS_KEY)).toBe(true);
    expect(JSON.parse(memoryStore.get(SETTINGS_KEY)!)).not.toEqual(defaults);

    // Snapshot everything outside the settings namespace right before the
    // reset so we can prove the reset touched nothing but settings.
    const beforeReset = nonSettingsSnapshot();

    act(() => ctx.resetSettings());
    await flush();

    // The settings key is back to DEFAULT_SETTINGS, in storage and memory.
    expect(JSON.parse(memoryStore.get(SETTINGS_KEY)!)).toEqual(defaults);
    expect(pickSettings(ctx)).toEqual(defaults);

    // The save-slot keys are byte-for-byte unchanged.
    for (const [k, v] of Object.entries(SAVE_SLOTS)) {
      expect(memoryStore.get(k)).toBe(v);
    }

    // Stronger invariant: NOTHING outside the settings namespace changed —
    // no save key was added, removed, or rewritten by the reset.
    expect(nonSettingsSnapshot()).toEqual(beforeReset);
  });

  it("resetSettings() only writes the settings storage key", async () => {
    for (const [k, v] of Object.entries(SAVE_SLOTS)) memoryStore.set(k, v);

    await mount();
    await flush();

    const beforeReset = nonSettingsSnapshot();

    act(() => ctx.resetSettings());
    await flush();

    // Even with no prior non-default writes, the reset must not introduce,
    // delete, or alter any non-settings storage entry.
    expect(nonSettingsSnapshot()).toEqual(beforeReset);
    // And the save slots specifically are intact.
    expect(Object.keys(beforeReset).sort()).toEqual(
      Object.keys(SAVE_SLOTS).sort()
    );
  });
});
