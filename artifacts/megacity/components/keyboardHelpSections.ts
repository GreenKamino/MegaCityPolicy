// Keyboard-help content, kept as node-safe pure data (no react-native imports)
// so the mode-aware wiring can be unit tested directly. KeyboardHelp.tsx renders
// whatever buildKeyboardSections returns.
//
// Why mode-aware: in turn-based mode the real-time tick loop is off, so Space /
// controller X / Start drive End Turn instead of Pause, and the speed controls
// (+ / - / game speed) do nothing. The overlay must never tell a turn-based
// player to pause or change speed — see engine/turnMode.ts.

export type KeyBinding = { key: string; action: string };
export type KeyboardSection = { title: string; keys: KeyBinding[] };

export function buildKeyboardSections(isTurnBased: boolean): KeyboardSection[] {
  // Space / X / Start pause in real-time, end the turn in turn-based.
  const advanceAction = isTurnBased ? "End Turn" : "Pause / Resume";

  const gameControls: KeyBinding[] = [
    { key: "Space", action: advanceAction },
    // Simulation speed only exists while the real-time clock is running.
    ...(isTurnBased
      ? []
      : [
          { key: "+  /  =", action: "Increase Game Speed" },
          { key: "−", action: "Decrease Game Speed" },
        ]),
    { key: "F", action: "Toggle Fullscreen" },
    { key: "H", action: "Photo Mode (clean screenshot)" },
    { key: "F9", action: "Steam screenshot (1920×1080) — desktop build" },
    { key: "D", action: "Open Debug Console" },
    { key: "Ctrl+D", action: "Toggle Debug Console" },
    { key: "Esc", action: "Return to City Overview" },
  ];

  const controller: KeyBinding[] = [
    { key: "D-Pad / Stick", action: "Move selection" },
    { key: "A", action: "Activate selected control" },
    { key: "B", action: "Back / cancel" },
    { key: "X", action: advanceAction },
    { key: "Y", action: "Show this help overlay" },
    { key: "LB / RB", action: "Previous / Next top tab (incl. promoted tabs on screen)" },
    { key: "LT / RT", action: "Previous / Next sub-tab" },
    { key: "Start", action: advanceAction },
    { key: "Select", action: "Open command palette / quick navigation" },
  ];

  return [
    {
      title: "NAVIGATION — TOP BAR",
      keys: [
        { key: "1", action: "City (Overview)" },
        { key: "2", action: "Law & Edicts" },
        { key: "3", action: "Economy" },
        { key: "4", action: "Map (World Map)" },
        { key: "5", action: "Build (Construction)" },
        { key: "6", action: "Diplomacy" },
        { key: "7", action: "More — Command Menus" },
      ],
    },
    {
      title: "NAVIGATION — PROMOTED TABS (WHEN SHOWN)",
      keys: [
        { key: "⇧1", action: "Inbox" },
        { key: "⇧2", action: "Stats" },
        { key: "⇧3", action: "Research" },
        { key: "⇧4", action: "Missions" },
        { key: "⇧5", action: "Finance" },
        { key: "⇧6", action: "Officers" },
        { key: "⇧7", action: "Sectors" },
        { key: "⇧8", action: "Trade" },
        { key: "⇧9", action: "Codex" },
      ],
    },
    {
      title: "NAVIGATION — BOTTOM BAR",
      keys: [
        { key: "Q", action: "Inbox" },
        { key: "W", action: "Research" },
        { key: "E", action: "Military" },
        { key: "R", action: "Factions" },
        { key: "T", action: "Events" },
        { key: "Y", action: "Wildlands" },
        { key: "U", action: "Dossier (Commander)" },
      ],
    },
    {
      title: "SAVE & SYSTEM",
      keys: [
        { key: "Ctrl+S", action: "Quick save (disabled in Honor Mode)" },
        { key: "Ctrl / Cmd+K", action: "Open command palette / quick navigation" },
        { key: "?", action: "Toggle this overlay" },
      ],
    },
    {
      title: "GAME CONTROLS",
      keys: gameControls,
    },
    {
      title: "FOCUS & SELECTION",
      keys: [
        { key: "↑ ↓ ← →", action: "Move selection between on-screen controls" },
        { key: "Tab", action: "Cycle focus forward / Shift+Tab back" },
        { key: "Enter", action: "Activate the selected control" },
        { key: "← →", action: "Switch sub-tabs at the edge of a row" },
      ],
    },
    {
      title: "CONTROLLER / STEAM DECK",
      keys: controller,
    },
    {
      title: "WORLD MAP",
      keys: [
        { key: "Scroll Wheel", action: "Zoom In / Out" },
        { key: "Click + Drag", action: "Pan Map" },
        { key: "Right-Click", action: "Context Menu" },
      ],
    },
  ];
}
