import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { atomicWriteSlot } from "@/engine/saveLoad";
import { useSettings, type ColorblindMode } from "@/context/SettingsContext";

export type ThemeMode = "dark" | "light";

export type ThemePalette = {
  accent: string;
  accentDim: string;
  accentDark: string;
  warning: string;
  danger: string;
  info: string;
  muted: string;
  bg: string;
  bgSecondary: string;
  bgCard: string;
  bgElevated: string;
  text: string;
  textSecondary: string;
  textAccent: string;
  textMuted: string;
  border: string;
  borderBright: string;
  borderDim: string;
  statHigh: string;
  statMid: string;
  statLow: string;
  statNeutral: string;
};

const DARK: ThemePalette = {
  accent: "#00FF41",
  accentDim: "#00CC33",
  accentDark: "#004D14",
  warning: "#FF9500",
  danger: "#FF3B30",
  info: "#00C8FF",
  muted: "#5A6B5A",
  bg: "#0A0F0A",
  bgSecondary: "#101810",
  bgCard: "#141F14",
  bgElevated: "#1A2A1A",
  text: "#E8FFE8",
  // Kept in lockstep with constants/colors.ts, which raised these from
  // near-invisible values (#8FA88F/#4A5A4A ~1.4:1) for readability.
  textSecondary: "#9CB59C",
  textAccent: "#00FF41",
  textMuted: "#7E957E",
  border: "#1E3020",
  borderBright: "#2E5030",
  borderDim: "#141A14",
  statHigh: "#00FF41",
  statMid: "#FF9500",
  statLow: "#FF3B30",
  statNeutral: "#00C8FF",
};

const LIGHT: ThemePalette = {
  accent: "#007A1F",
  accentDim: "#006618",
  accentDark: "#E0F5E0",
  warning: "#CC7700",
  danger: "#CC2200",
  info: "#0088BB",
  muted: "#8A9A8A",
  bg: "#F0F4F0",
  bgSecondary: "#E4EBE4",
  bgCard: "#FFFFFF",
  bgElevated: "#F8FAF8",
  text: "#1A2A1A",
  textSecondary: "#4A5E4A",
  textAccent: "#007A1F",
  textMuted: "#9AAA9A",
  border: "#C8D8C8",
  borderBright: "#A0B8A0",
  borderDim: "#E0E8E0",
  statHigh: "#007A1F",
  statMid: "#CC7700",
  statLow: "#CC2200",
  statNeutral: "#0088BB",
};

// Colorblind-friendly overlays. Applied on top of the chosen base palette
// (DARK or LIGHT). Status colors and danger/warning are remapped to a
// universal "blue/yellow/orange" or "magenta" set that all common color
// vision deficiencies can distinguish. The accent stays the dominant brand
// hue but shifts off green when green/red discrimination is impaired.
const COLORBLIND_OVERLAYS: Record<Exclude<ColorblindMode, "off">, Partial<ThemePalette>> = {
  // Red-green (green-deficient), most common — ~6% of men.
  deuteranopia: {
    accent: "#00B8FF",
    accentDim: "#0088CC",
    accentDark: "#003344",
    textAccent: "#00B8FF",
    warning: "#FFD400",
    danger: "#FF6E00",
    info: "#9D6BFF",
    statHigh: "#00B8FF",
    statMid: "#FFD400",
    statLow: "#FF6E00",
    statNeutral: "#9D6BFF",
  },
  // Red-green (red-deficient), nearly identical perceptually.
  protanopia: {
    accent: "#00B8FF",
    accentDim: "#0088CC",
    accentDark: "#003344",
    textAccent: "#00B8FF",
    warning: "#FFD400",
    danger: "#FF6E00",
    info: "#9D6BFF",
    statHigh: "#00B8FF",
    statMid: "#FFD400",
    statLow: "#FF6E00",
    statNeutral: "#9D6BFF",
  },
  // Blue-yellow (rare). Keep green accent but shift blue/yellow status.
  tritanopia: {
    accent: "#00FF41",
    accentDim: "#00CC33",
    accentDark: "#004D14",
    textAccent: "#00FF41",
    warning: "#FF6E00",
    danger: "#E94B7C",
    info: "#FF6E00",
    statHigh: "#00FF41",
    statMid: "#FF6E00",
    statLow: "#E94B7C",
    statNeutral: "#FF6E00",
  },
};

function applyColorblind(base: ThemePalette, mode: ColorblindMode): ThemePalette {
  if (mode === "off") return base;
  return { ...base, ...COLORBLIND_OVERLAYS[mode] };
}

// High-contrast text overlays (accessibility setting). Brightens (dark) or
// darkens (light) the secondary/muted text tiers that players in brightly
// lit rooms or with low vision report as hard to read. Backgrounds, accents
// and status colors are untouched so the game's look stays intact.
const HIGH_CONTRAST_TEXT: Record<ThemeMode, Partial<ThemePalette>> = {
  dark: {
    text: "#F4FFF4",
    textSecondary: "#C8DCC8",
    textMuted: "#A8C0A8",
    muted: "#8FA48F",
  },
  light: {
    text: "#0E1A0E",
    textSecondary: "#2E402E",
    textMuted: "#486048",
    muted: "#5E705E",
  },
};

function applyHighContrastText(base: ThemePalette, mode: ThemeMode, enabled: boolean): ThemePalette {
  if (!enabled) return base;
  return { ...base, ...HIGH_CONTRAST_TEXT[mode] };
}

export const DEFAULT_THEME_MODE: ThemeMode = "light";

type ThemeContextType = {
  mode: ThemeMode;
  colors: ThemePalette;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
};

export const ThemeContext = createContext<ThemeContextType>({
  mode: DEFAULT_THEME_MODE,
  colors: LIGHT,
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: false,
});

const STORAGE_KEY = "@megacity_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);

  React.useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark") setMode(stored);
    });
  }, []);

  // Route theme writes through atomicWriteSlot (Task #191) so a torn
  // write can't leave @megacity_theme holding garbage and force the
  // player back to the configured default after a power-loss. Best-effort
  // (.catch) preserves the prior fire-and-forget behavior.
  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    atomicWriteSlot(AsyncStorage, STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      atomicWriteSlot(AsyncStorage, STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const { colorblindMode, highContrastText } = useSettings();

  const value = useMemo(() => {
    const base = mode === "dark" ? DARK : LIGHT;
    return {
      mode,
      colors: applyHighContrastText(applyColorblind(base, colorblindMode), mode, highContrastText),
      toggleTheme,
      setTheme,
      isDark: mode === "dark",
    };
  }, [mode, colorblindMode, highContrastText, toggleTheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { DARK, LIGHT };
