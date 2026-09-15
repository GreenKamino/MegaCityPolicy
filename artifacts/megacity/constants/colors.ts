// MEGACITY - Dystopian Color Palette
// Terminal green on near-black. Inspired by dystopian sci-fi/cyberpunk HUDs.

const ACCENT = "#00FF41";      // Matrix green - primary accent
const ACCENT_DIM = "#00CC33";  // Dimmer green
const ACCENT_DARK = "#004D14"; // Deep green for backgrounds
const WARNING = "#FF9500";     // Orange - warnings
const DANGER = "#FF3B30";      // Red - danger/high unrest
const INFO = "#00C8FF";        // Cyan - info / tech
const MUTED = "#5A6B5A";       // Muted green-gray

const BG_PRIMARY = "#0A0F0A";   // Near-black with green tint
const BG_SECONDARY = "#101810"; // Slightly lighter
const BG_CARD = "#141F14";      // Card background
const BG_ELEVATED = "#1A2A1A";  // Elevated elements

const TEXT_PRIMARY = "#E8FFE8";   // Slightly green-tinted white
const TEXT_SECONDARY = "#9CB59C"; // Muted text (readable ~8:1 on bg)
const TEXT_ACCENT = "#00FF41";    // Green text
const TEXT_MUTED = "#7E957E";    // Muted but readable (~5.6:1 on bg, was #4A5A4A ~1.4:1)

const BORDER = "#1E3020";         // Subtle green border
const BORDER_BRIGHT = "#2E5030"; // Brighter border
const BORDER_DIM = "#141A14";    // Very dim border

export default {
  // Core palette
  accent: ACCENT,
  accentDim: ACCENT_DIM,
  accentDark: ACCENT_DARK,
  warning: WARNING,
  danger: DANGER,
  info: INFO,
  muted: MUTED,

  // Backgrounds
  bg: BG_PRIMARY,
  bgSecondary: BG_SECONDARY,
  bgCard: BG_CARD,
  bgElevated: BG_ELEVATED,

  // Text
  text: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textAccent: TEXT_ACCENT,
  textMuted: TEXT_MUTED,

  // Borders
  border: BORDER,
  borderBright: BORDER_BRIGHT,
  borderDim: BORDER_DIM,

  // Status colors
  statHigh: ACCENT,       // Good stats
  statMid: WARNING,       // Mid-level warning
  statLow: DANGER,        // Danger
  statNeutral: INFO,      // Info/tech

  // Legacy compat
  light: {
    text: TEXT_PRIMARY,
    background: BG_PRIMARY,
    tint: ACCENT,
    tabIconDefault: MUTED,
    tabIconSelected: ACCENT,
  },
};
