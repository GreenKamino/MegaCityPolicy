import { describe, expect, it, vi } from "vitest";

// SettingsContext pulls in AsyncStorage and the audio/haptics engines at
// module load; those reach into react-native, whose Flow `import typeof`
// syntax the test bundler can't parse. Mock them so we can import the pure
// isGroupModified helper without dragging in native modules.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
vi.mock("@/engine/audio", () => ({
  setMuted: () => {},
  setVolume: () => {},
  setAmbienceEnabled: () => {},
}));
vi.mock("@/engine/haptics", () => ({
  setHapticsEnabled: () => {},
  setHapticsReducedMotion: () => {},
}));

import { isGroupModified, SETTINGS_GROUPS, type SettingsState } from "@/context/SettingsContext";

// DEFAULT_SETTINGS is intentionally not exported from the context (it's an
// implementation detail). We reconstruct a "defaults" baseline by asserting
// that a freshly-mounted settings shape reports every group as unmodified,
// then probe single-key divergences. To get the default values without
// importing the private const, we lean on the invariant the function itself
// guarantees: with defaults in, no group is modified. So we build the baseline
// from a hand-authored mirror and verify it against the function.

// A defaults mirror. Kept here deliberately so a drift between this and the
// real DEFAULT_SETTINGS surfaces as a failing "baseline is all-unmodified"
// assertion below, prompting an update.
const DEFAULTS_MIRROR: SettingsState = {
  crtEnabled: true,
  scanlineEnabled: true,
  fontScale: "normal",
  autoSaveMinutes: 5,
  showHotkeys: true,
  maxContentWidth: 700,
  wideLayoutEnabled: true,
  soundVolume: 0.6,
  soundMuted: false,
  hapticsEnabled: true,
  commsChatterEnabled: true,
  ambienceEnabled: true,
  pauseOnBlur: true,
  confirmOnClose: true,
  tipsEnabled: true,
  colorblindMode: "off",
  reducedMotion: false,
  highContrastText: false,
  offlineSimDepth: "standard",
  skipIntro: false,
  showTickProfiler: false,
  defaultStartStyle: "guided",
  militaryFilters: {
    tab: "units",
    unitCategory: "law",
    warOps: "all",
    ordnance: "all",
  },
  uiScale: 1,
};

const GROUPS = Object.keys(SETTINGS_GROUPS) as (keyof typeof SETTINGS_GROUPS)[];

describe("isGroupModified (Task #342)", () => {
  it("reports no group as modified when settings match defaults", () => {
    for (const group of GROUPS) {
      expect(isGroupModified(DEFAULTS_MIRROR, group)).toBe(false);
    }
  });

  it("flags exactly the group that owns a changed key", () => {
    const cases: { key: keyof SettingsState; value: SettingsState[keyof SettingsState]; group: keyof typeof SETTINGS_GROUPS }[] = [
      { key: "crtEnabled", value: false, group: "display" },
      { key: "fontScale", value: "xlarge", group: "display" },
      { key: "soundMuted", value: true, group: "audio" },
      { key: "soundVolume", value: 0.3, group: "audio" },
      { key: "reducedMotion", value: true, group: "accessibility" },
      { key: "colorblindMode", value: "deuteranopia", group: "accessibility" },
    ];

    for (const { key, value, group } of cases) {
      const next = { ...DEFAULTS_MIRROR, [key]: value };
      expect(isGroupModified(next, group)).toBe(true);
      for (const other of GROUPS) {
        if (other !== group) {
          expect(isGroupModified(next, other)).toBe(false);
        }
      }
    }
  });

  it("returns true when multiple keys in a group diverge", () => {
    const next = { ...DEFAULTS_MIRROR, soundMuted: true, ambienceEnabled: false };
    expect(isGroupModified(next, "audio")).toBe(true);
  });
});
