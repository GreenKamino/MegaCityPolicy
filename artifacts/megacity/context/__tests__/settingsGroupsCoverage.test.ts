import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// In-memory AsyncStorage mock shared by SettingsContext (and the real
// atomicWriteSlot it routes persistence through). The per-section reset
// guard below doesn't care about save slots, but importing SettingsContext
// pulls in AsyncStorage + atomicWriteSlot, so a working store is required.
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

import {
  SettingsProvider,
  useSettings,
  SETTINGS_GROUPS,
} from "@/context/SettingsContext";

// The non-data fields the context layers on top of SettingsState. Stripped
// so we are left with exactly the persisted SettingsState keys.
const NON_SETTINGS_KEYS = new Set([
  "fontScaleMultiplier",
  "scaledFont",
  "setSetting",
  "resetSettings",
  "resetSettingsKeys",
  "reloadFromStorage",
]);

function pickSettingsKeys(ctx: Record<string, unknown>): string[] {
  return Object.keys(ctx).filter((k) => !NON_SETTINGS_KEYS.has(k));
}

// Keys that deliberately do NOT belong to any Settings-screen section, so
// they are correctly absent from every per-section reset group:
//   showTickProfiler  — dev profiler overlay, toggled from the Debug screen.
//   militaryFilters   — remembered in-screen navigation, not exposed as a
//                       Settings-screen control or a per-section reset.
// If this ever gains a real Settings-screen control, move it into the
// appropriate group and drop it from this set. (defaultStartStyle used to
// live here; it now has a DEFAULT START STYLE control in the display
// section, so it belongs to SETTINGS_GROUPS.display.)
const INTENTIONALLY_UNGROUPED = new Set(["showTickProfiler", "militaryFilters"]);

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

describe("SETTINGS_GROUPS never drift out of sync with SettingsState (Task #343)", () => {
  beforeEach(() => {
    memoryStore.clear();
    ctx = undefined;
  });

  it("assigns every settings key to exactly one group or marks it intentionally ungrouped", async () => {
    await mount();
    const allKeys = pickSettingsKeys(ctx);

    const grouped = Object.values(SETTINGS_GROUPS).flat();
    const groupedSet = new Set<string>(grouped);

    // Each key lives in at most one group (no key appears in two sections).
    expect(grouped.length).toBe(groupedSet.size);

    // No intentionally-ungrouped key sneaked into a section group.
    for (const k of INTENTIONALLY_UNGROUPED) {
      expect(groupedSet.has(k)).toBe(false);
    }

    // Every grouped key is a real, current settings key (catches a key that
    // was renamed/removed from SettingsState but left behind in a group).
    for (const k of grouped) {
      expect(allKeys).toContain(k);
    }

    // Drift guard: every settings key is either grouped or explicitly
    // excluded. A new SettingsState key added without a group (and not
    // listed as intentionally ungrouped) shows up here and fails the test,
    // so it can never be silently unreachable from a per-section reset.
    const covered = new Set<string>([...groupedSet, ...INTENTIONALLY_UNGROUPED]);
    const uncovered = allKeys.filter((k) => !covered.has(k));
    expect(uncovered).toEqual([]);

    // Stale-exclusion guard: each intentionally-ungrouped key must still
    // exist on SettingsState (otherwise the exclusion is dead and hides a
    // typo for a key that should be grouped).
    for (const k of INTENTIONALLY_UNGROUPED) {
      expect(allKeys).toContain(k);
    }
  });

  it("resetSettingsKeys restores only the named keys and leaves the rest untouched", async () => {
    await mount();

    // Capture fresh defaults (no persisted settings were seeded).
    const defaults: Record<string, unknown> = {};
    for (const k of pickSettingsKeys(ctx)) defaults[k] = ctx[k];

    // Mutate EVERY audio key to a non-default value so the reset loop proves
    // each named key is individually restored — not just the ones that happen
    // to differ from defaults.
    act(() => ctx.setSetting("soundMuted", !defaults.soundMuted));
    act(() =>
      ctx.setSetting("soundVolume", (defaults.soundVolume as number) < 0.5 ? 0.9 : 0.1)
    );
    act(() => ctx.setSetting("hapticsEnabled", !defaults.hapticsEnabled));
    act(() => ctx.setSetting("ambienceEnabled", !defaults.ambienceEnabled));

    // Also mutate keys in the other groups plus the intentionally-ungrouped
    // key, so we can prove a single-group reset touches nothing outside it.
    act(() => ctx.setSetting("crtEnabled", !defaults.crtEnabled)); // display
    act(() => ctx.setSetting("fontScale", "xlarge")); // display
    act(() => ctx.setSetting("defaultStartStyle", "veteran")); // display
    act(() => ctx.setSetting("reducedMotion", !defaults.reducedMotion)); // accessibility
    act(() => ctx.setSetting("colorblindMode", "deuteranopia")); // accessibility
    act(() => ctx.setSetting("showTickProfiler", !defaults.showTickProfiler)); // ungrouped
    await flush();

    // Snapshot the full mutated state right before the reset so we can assert
    // every non-audio key is byte-for-byte unchanged afterward.
    const beforeReset: Record<string, unknown> = {};
    for (const k of pickSettingsKeys(ctx)) beforeReset[k] = ctx[k];

    const audioKeys = new Set<string>(SETTINGS_GROUPS.audio);

    // Reset ONLY the audio group.
    act(() => ctx.resetSettingsKeys(SETTINGS_GROUPS.audio));
    await flush();

    // Every audio key is back to its default...
    for (const k of SETTINGS_GROUPS.audio) {
      expect(ctx[k]).toEqual(defaults[k]);
    }

    // ...and every key NOT in the audio group keeps the exact value it had
    // before the reset — the reset did not bleed across sections, and the
    // intentionally-ungrouped keys are untouched too.
    for (const k of pickSettingsKeys(ctx)) {
      if (audioKeys.has(k)) continue;
      expect(ctx[k]).toEqual(beforeReset[k]);
    }
  });
});
