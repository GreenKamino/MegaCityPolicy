// Top navigation tab definitions and the pure "how many tabs fit" helper.
//
// Kept free of react-native / expo imports so the fit logic can be unit-tested
// in plain Node (vitest) without rendering. TopNavBar.tsx imports these and
// handles the actual rendering + width measurement.

export type TabDef = {
  route: string;
  label: string;
  description: string;
  hotkey: string;
  /** Optional shortcut shown in the bottom quick bar. */
  bottomHotkey?: string;
  iconName: string;
  iconSet: "feather" | "mci";
};

export const MORE_ROUTE = "/(game)/more";

// The six always-present primary tabs. Order is intentional and fixed.
export const CORE_TAB_DEFS: TabDef[] = [
  { route: "/(game)/overview", label: "CITY", description: "Open city status and priorities.", hotkey: "1", iconName: "city", iconSet: "mci" },
  { route: "/(game)/law", label: "LAW", description: "Open edicts, policy, and enforcement.", hotkey: "2", iconName: "gavel", iconSet: "mci" },
  { route: "/(game)/economy", label: "ECONOMY", description: "Open production, rates, and stockpiles.", hotkey: "3", iconName: "trending-up", iconSet: "feather" },
  { route: "/(game)/worldmap", label: "MAP", description: "Open the full-width world map.", hotkey: "4", iconName: "earth", iconSet: "mci" },
  { route: "/(game)/construction", label: "BUILD", description: "Open construction and infrastructure.", hotkey: "5", iconName: "hammer-wrench", iconSet: "mci" },
  { route: "/(game)/diplomacy", label: "DIPLO", description: "Open foreign relations and treaties.", hotkey: "6", iconName: "handshake", iconSet: "mci" },
];

// The MORE tab. Always pinned to the far end of the bar. Gated to reveal after
// onboarding completes (same as today) via the unlock filter in TopNavBar.
export const MORE_TAB_DEF: TabDef = {
  route: MORE_ROUTE, label: "MORE", description: "Open every command window.", hotkey: "7", iconName: "grid", iconSet: "feather",
};

// High-value screens promoted out of the MORE menu, shown in priority order
// when the bar has room. Keyboard/controller players reach the first nine with
// Shift+1..9 (the "shifted" siblings of the 1-7 core-tab keys), matching this
// order — Shift+9 is the last free shifted-digit slot, so the tabs after CODEX
// instead carry the letter keys they already own on the bottom quick bar
// (E/R/T/Y/U here; see BOTTOM_ROUTES in HotkeyContext). A Shift+N shortcut only
// fires when its tab is actually visible at the current width — see
// HotkeyContext. The hotkey string here is the on-screen badge; the actual key
// handling lives in HotkeyContext's keyMap.
export const EXTENDED_TAB_DEFS: TabDef[] = [
  { route: "/(game)/inbox", label: "INBOX", description: "Open dispatches and required responses.", hotkey: "⇧1", iconName: "mail", iconSet: "feather" },
  { route: "/(game)/stats", label: "STATS", description: "Open city metrics and history.", hotkey: "⇧2", iconName: "bar-chart-2", iconSet: "feather" },
  { route: "/(game)/research", label: "RESEARCH", description: "Open technology projects.", hotkey: "⇧3", iconName: "cpu", iconSet: "feather" },
  { route: "/(game)/missions", label: "MISSIONS", description: "Open officer missions and assignments.", hotkey: "⇧4", iconName: "compass-outline", iconSet: "mci" },
  { route: "/(game)/finances", label: "FINANCE", description: "Open banking, loans, and treasury tools.", hotkey: "⇧5", iconName: "bank", iconSet: "mci" },
  { route: "/(game)/officers", label: "OFFICERS", description: "Open the command staff roster.", hotkey: "⇧6", iconName: "account-tie", iconSet: "mci" },
  { route: "/(game)/districts", label: "SECTORS", description: "Open district operations and status.", hotkey: "⇧7", iconName: "map-marker-multiple", iconSet: "mci" },
  { route: "/(game)/trade", label: "TRADE", description: "Open markets and trade routes.", hotkey: "⇧8", iconName: "swap-horizontal-bold", iconSet: "mci" },
  { route: "/(game)/codex", label: "CODEX", description: "Open the field reference.", hotkey: "⇧9", iconName: "book-open-variant", iconSet: "mci" },
  // Beyond the shifted-digit slots: badges mirror the bottom quick bar's
  // letter keys (already bound globally), NOT new Shift+N bindings.
  { route: "/(game)/military", label: "MILITARY", description: "Open armed forces and operations.", hotkey: "E", iconName: "tank", iconSet: "mci" },
  { route: "/(game)/factions", label: "FACTIONS", description: "Open internal faction intelligence.", hotkey: "R", iconName: "sword-cross", iconSet: "mci" },
  { route: "/(game)/events", label: "EVENTS", description: "Open active crises and reports.", hotkey: "T", iconName: "alert-triangle", iconSet: "feather" },
  { route: "/(game)/wildlands", label: "WILDLANDS", description: "Open ecology and wasteland control.", hotkey: "Y", iconName: "leaf-maple", iconSet: "mci" },
  { route: "/(game)/character", label: "DOSSIER", description: "Open the commander dossier.", hotkey: "U", iconName: "user", iconSet: "feather" },
];

// The bottom row is intentionally a longer, scrollable quick-access list than
// the width-constrained top row. Keep its order here so More, top navigation,
// bottom navigation, and keyboard routing can share the same route metadata.
// The first seven retain their established Q-U shortcuts; promoted entries
// remain mouse/controller accessible without inventing conflicting bindings.
const BOTTOM_ROUTE_ORDER = [
  "/(game)/inbox",
  "/(game)/research",
  "/(game)/military",
  "/(game)/factions",
  "/(game)/events",
  "/(game)/wildlands",
  "/(game)/character",
  "/(game)/missions",
  "/(game)/finances",
  "/(game)/officers",
  "/(game)/districts",
  "/(game)/trade",
  "/(game)/stats",
  "/(game)/codex",
] as const;

const BOTTOM_HOTKEYS: Record<string, string> = {
  "/(game)/inbox": "Q",
  "/(game)/research": "W",
  "/(game)/military": "E",
  "/(game)/factions": "R",
  "/(game)/events": "T",
  "/(game)/wildlands": "Y",
  "/(game)/character": "U",
};

export const BOTTOM_TAB_DEFS: TabDef[] = BOTTOM_ROUTE_ORDER.map((route) => {
  const def = EXTENDED_TAB_DEFS.find((candidate) => candidate.route === route);
  if (!def) throw new Error(`Missing extended tab definition for ${route}`);
  return { ...def, bottomHotkey: BOTTOM_HOTKEYS[route] };
});

export const BOTTOM_TAB_ROUTES = BOTTOM_TAB_DEFS.map((def) => def.route);

// Shared dimensions keep both navigation rows visually aligned. TAB_WIDTH is
// the approximate fit width used by the top-bar promotion calculation.
export const NAV_TAB_PADDING_VERTICAL = 8;
export const NAV_TAB_PADDING_VERTICAL_COMPACT = 5;
export const NAV_TAB_PADDING_HORIZONTAL = 12;
export const NAV_TAB_MIN_WIDTH = 52;
export const NAV_TAB_LABEL_SIZE = 9;

// Approximate on-screen width of a single tab and of the web help button. Used
// only to decide how many extended tabs to reveal — the bar itself falls back
// to horizontal scrolling, so a slightly-off estimate never hides anything
// permanently (overflow stays reachable under MORE).
export const TAB_WIDTH = 64;
export const HELP_WIDTH = 38;

export type ComputeVisibleTabsOpts = {
  containerWidth: number;
  // The unlock-filtered base tabs (core tabs plus MORE when revealed), in the
  // same order they should render. MORE is expected to be last when present.
  baseDefs: TabDef[];
  // The extended tabs eligible to be shown. Pass [] to show none (e.g. while
  // the first-run intro lock is active).
  extendedDefs: TabDef[];
  showHelp: boolean;
  tabWidth?: number;
  helpWidth?: number;
};

// Decide the ordered list of tabs to render. Core tabs and MORE are always kept;
// as many extended tabs as fit the available width are inserted just before the
// MORE tab so MORE stays pinned at the end.
export function computeVisibleTabs(opts: ComputeVisibleTabsOpts): TabDef[] {
  const { containerWidth, baseDefs, extendedDefs, showHelp } = opts;
  const tabW = opts.tabWidth ?? TAB_WIDTH;
  const helpW = showHelp ? (opts.helpWidth ?? HELP_WIDTH) : 0;

  if (extendedDefs.length === 0 || containerWidth <= 0) return baseDefs;

  const reserved = baseDefs.length * tabW + helpW;
  const available = containerWidth - reserved;
  const fit = Math.max(0, Math.floor(available / tabW));
  if (fit <= 0) return baseDefs;

  const shown = extendedDefs.slice(0, fit);
  const moreIdx = baseDefs.findIndex((d) => d.route === MORE_ROUTE);
  if (moreIdx === -1) return [...baseDefs, ...shown];
  return [...baseDefs.slice(0, moreIdx), ...shown, ...baseDefs.slice(moreIdx)];
}
