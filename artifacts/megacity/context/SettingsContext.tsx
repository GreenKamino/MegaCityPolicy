import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { atomicWriteSlot } from "@/engine/saveLoad";
import {
  setMuted as audioSetMuted,
  setVolume as audioSetVolume,
  setAmbienceEnabled as audioSetAmbienceEnabled,
} from "@/engine/audio";
import {
  setHapticsEnabled as hapticsSetEnabled,
  setHapticsReducedMotion as hapticsSetReducedMotion,
} from "@/engine/haptics";

export type FontScale = "xsmall" | "small" | "normal" | "large" | "xlarge" | "xxlarge" | "xxxlarge";
export type AutoSaveInterval = 1 | 5 | 0;
export type ColorblindMode = "off" | "deuteranopia" | "protanopia" | "tritanopia";
export type StartStyle = "guided" | "veteran";
export type MilitaryFilterPreferences = {
  tab: string;
  unitCategory: string;
  warOps: string;
  ordnance: string;
};
// Whole-interface scale for desktop/web (Task #532). Applied as a real window
// zoom (Electron webContents.setZoomFactor, or root CSS zoom on plain web) by
// UiScaleApplier in app/_layout.tsx, so it composes with fontScale (which only
// scales text) and wideLayoutEnabled (700 CSS px stays centered, just larger).
export type UiScale = 1 | 1.1 | 1.25 | 1.5;
export const UI_SCALE_OPTIONS: UiScale[] = [1, 1.1, 1.25, 1.5];

// Persisted JSON may hold any number (old builds, hand-edited backups):
// snap to the nearest valid option, defaulting to 100%.
export function normalizeUiScale(value: unknown): UiScale {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return 1;
  let best: UiScale = 1;
  let bestDistance = Infinity;
  for (const option of UI_SCALE_OPTIONS) {
    const distance = Math.abs(option - n);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }
  return best;
}
export {
  OFFLINE_SIM_DEPTH_BATCH_LIMIT,
  normalizeOfflineSimDepth,
  type OfflineSimDepth,
} from "@/engine/offlineSimDepth";
import type { OfflineSimDepth } from "@/engine/offlineSimDepth";

export type SettingsState = {
  crtEnabled: boolean;
  scanlineEnabled: boolean;
  fontScale: FontScale;
  autoSaveMinutes: AutoSaveInterval;
  showHotkeys: boolean;
  maxContentWidth: number;
  wideLayoutEnabled: boolean;
  soundVolume: number;
  soundMuted: boolean;
  hapticsEnabled: boolean;
  commsChatterEnabled: boolean;
  // Reactive ambient soundscape (Task #314). When true, a low looping ambience
  // bed plus rate-limited contextual one-shots react to live city mood
  // (unrest/crime/happiness/lawOrder). Respects soundMuted, soundVolume and
  // reducedMotion. Default ON.
  ambienceEnabled: boolean;
  pauseOnBlur: boolean;
  confirmOnClose: boolean;
  // Accessibility & onboarding
  tipsEnabled: boolean;
  colorblindMode: ColorblindMode;
  reducedMotion: boolean;
  // Brightens secondary/muted text in both themes for players who find the
  // default low-contrast grey-on-dark (or grey-on-light) hard to read,
  // e.g. in brightly lit rooms or with low vision.
  highContrastText: boolean;
  // How many of the missed-while-away ticks should be fully simulated before
  // the engine falls back to rate extrapolation. See
  // OFFLINE_SIM_DEPTH_BATCH_LIMIT for the numeric mapping. Default is
  // "standard" to match prior behavior (1500-tick batch cap).
  offlineSimDepth: OfflineSimDepth;
  // Reserved for an opening cinematic / launch sequence skip toggle. The
  // game currently has no opening cinematic — only the expo-splash-screen
  // asset-loader (which auto-hides as soon as fonts and state finish
  // loading and is not user-skippable). This flag persists in the settings
  // shape so a future intro/teaser sequence can opt in without a settings
  // migration. INTENTIONAL NO-OP today; see WhatsNewModal for why this
  // does NOT gate the changelog popup.
  skipIntro: boolean;
  // Developer profiler overlay (Task #200). When true, the engine records
  // per-section runTick timings and TickProfilerOverlay renders a floating
  // panel with rolling avg + p95 per section. Default OFF so normal play
  // pays zero profiling cost; toggled from the Debug screen.
  showTickProfiler: boolean;
  // Remembered Guided-vs-Veteran start choice (Task #336). The char-create
  // modal seeds its start-style toggle from this value, and persists the
  // player's pick here on LAUNCH, so experienced players who always choose
  // Veteran don't have to re-select it for every new city. Defaults to
  // "guided" so first-time players still get the full first-run experience.
  defaultStartStyle: StartStyle;
  // Remembered Military screen navigation/filter choices. These are UI
  // preferences, not gameplay state, so they persist across cities.
  militaryFilters: MilitaryFilterPreferences;
  // Whole-interface scale, desktop/web only (Task #532). 1 = 100% (default).
  // Native (iOS/Android) ignores it entirely — the OS handles display zoom.
  uiScale: UiScale;
};

const DEFAULT_SETTINGS: SettingsState = {
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

// Groups of settings keys that map to the Settings screen's visible sections.
// Used by the per-section "reset this group" affordances so a player can undo
// just their audio or accessibility tweaks without losing display/start-style
// choices. Keep these in sync with the SectionHeader groupings in
// app/(game)/more.tsx. `maxContentWidth` has no dedicated control but belongs
// to the Display group conceptually, so it rides along with a Display reset.
export const SETTINGS_GROUPS = {
  display: [
    "crtEnabled",
    "scanlineEnabled",
    "commsChatterEnabled",
    "wideLayoutEnabled",
    "showHotkeys",
    "pauseOnBlur",
    "confirmOnClose",
    "skipIntro",
    "defaultStartStyle",
    "fontScale",
    "uiScale",
    "autoSaveMinutes",
    "offlineSimDepth",
    "maxContentWidth",
  ],
  audio: ["soundMuted", "soundVolume", "hapticsEnabled", "ambienceEnabled"],
  accessibility: ["reducedMotion", "colorblindMode", "tipsEnabled", "highContrastText"],
} satisfies Record<string, (keyof SettingsState)[]>;

export type SettingsGroup = keyof typeof SETTINGS_GROUPS;

// True when any key in the named group differs from its default. Powers the
// "modified" indicator on each Settings section header and the de-emphasis of
// the per-section RESET affordance when a group already matches defaults.
// Centralized here (and unit-tested) so the comparison stays in lockstep with
// SETTINGS_GROUPS / DEFAULT_SETTINGS.
export function isGroupModified(settings: SettingsState, group: SettingsGroup): boolean {
  return SETTINGS_GROUPS[group].some((key) => settings[key] !== DEFAULT_SETTINGS[key]);
}

const FONT_SCALE_MAP: Record<FontScale, number> = {
  xsmall: 0.75,
  small: 0.85,
  normal: 1.0,
  large: 1.2,
  xlarge: 1.4,
  xxlarge: 1.7,
  xxxlarge: 2.0,
};

type SettingsContextType = SettingsState & {
  fontScaleMultiplier: number;
  scaledFont: (baseSize: number) => number;
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetSettings: () => void;
  // Restore only the given keys to their defaults, leaving every other
  // preference untouched. Powers the per-section reset affordances on the
  // Settings screen (see SETTINGS_GROUPS).
  resetSettingsKeys: (keys: (keyof SettingsState)[]) => void;
  // Re-reads settings from AsyncStorage and replaces in-memory state. Used
  // after a full-backup restore so the player sees the restored prefs apply
  // immediately without needing to reload the app.
  reloadFromStorage: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextType>({
  ...DEFAULT_SETTINGS,
  fontScaleMultiplier: 1.0,
  scaledFont: (s) => s,
  setSetting: () => {},
  resetSettings: () => {},
  resetSettingsKeys: () => {},
  reloadFromStorage: async () => {},
});

const STORAGE_KEY = "@megacity_settings";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setSettings((prev) => ({ ...prev, ...parsed }));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: SettingsState) => {
    // Route through atomicWriteSlot (Task #191) so a power-loss mid-write
    // can't leave @megacity_settings holding garbage and silently reset
    // the player's prefs to defaults on the next launch. Best-effort:
    // swallow errors to preserve the prior fire-and-forget behavior — the
    // in-memory state already reflects the new value, and the prior
    // good blob survives torn writes thanks to the tmp-key swap.
    atomicWriteSlot(AsyncStorage, STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setSetting = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  }, [persist]);

  const resetSettingsKeys = useCallback((keys: (keyof SettingsState)[]) => {
    setSettings((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        (next[key] as SettingsState[typeof key]) = DEFAULT_SETTINGS[key];
      }
      persist(next);
      return next;
    });
  }, [persist]);

  const reloadFromStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setSettings(DEFAULT_SETTINGS);
        return;
      }
      const parsed = JSON.parse(raw);
      setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...parsed }));
    } catch {
      // Leave existing in-memory settings alone if storage is corrupted.
    }
  }, []);

  useEffect(() => {
    audioSetMuted(settings.soundMuted);
    audioSetVolume(settings.soundVolume);
  }, [settings.soundMuted, settings.soundVolume]);

  useEffect(() => {
    audioSetAmbienceEnabled(settings.ambienceEnabled);
  }, [settings.ambienceEnabled]);

  useEffect(() => {
    hapticsSetEnabled(settings.hapticsEnabled);
    hapticsSetReducedMotion(settings.reducedMotion);
  }, [settings.hapticsEnabled, settings.reducedMotion]);

  const fontScaleMultiplier = FONT_SCALE_MAP[settings.fontScale];
  const scaledFont = useCallback((baseSize: number) => Math.round(baseSize * FONT_SCALE_MAP[settings.fontScale]), [settings.fontScale]);

  const value = useMemo(() => ({
    ...settings,
    fontScaleMultiplier,
    scaledFont,
    setSetting,
    resetSettings,
    resetSettingsKeys,
    reloadFromStorage,
  }), [settings, fontScaleMultiplier, scaledFont, setSetting, resetSettings, resetSettingsKeys, reloadFromStorage]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export { FONT_SCALE_MAP };
