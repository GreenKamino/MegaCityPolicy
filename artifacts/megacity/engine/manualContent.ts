// Localization-ready string table for player-facing manual / help content.
//
// Why a separate file: the in-game CODEX (app/(game)/codex.tsx) bakes copy
// directly into JSX, which makes future translation a rewrite. As we add
// new manual surfaces (the README MANUAL.md, the Steam community guide,
// tooltips, the keyboard help overlay) we keep the canonical English
// strings here so a future i18n pass can swap them out without touching
// rendering code.
//
// Convention: keys are stable, values are English. To localize later,
// wrap reads in a t() helper that picks from a per-locale override map.

export type ManualStrings = {
  resources: Record<string, { label: string; tooltip: string; criticalAt: string }>;
  hotkeys: { section: string; key: string; action: string }[];
  endStates: Record<string, { title: string; oneLine: string }>;
  factions: { count: number; hidden: number; description: string };
  faiths: Record<string, { name: string; oneLine: string }>;
  quickStart: string[];
  tipsForNewMarshals: string[];
};

export const MANUAL: ManualStrings = {
  resources: {
    credits:  { label: "Credits",      tooltip: "City treasury — funds construction, military, and trade",            criticalAt: "< 5,000" },
    food:     { label: "Food",         tooltip: "Citizen sustenance — zero food = mass unrest, then collapse",         criticalAt: "< 50" },
    water:    { label: "Water",        tooltip: "Drinking and industrial water — zero = riots within ticks",          criticalAt: "< 50" },
    power:    { label: "Power",        tooltip: "Electrical grid output minus draw — negative means brownouts",       criticalAt: "< 0 MW" },
    steel:    { label: "Steel",        tooltip: "Construction material — buildings, infrastructure, repairs",          criticalAt: "< 20 tons" },
    goods:    { label: "Goods",        tooltip: "Consumer goods — citizens consume these; shortage drops happiness",   criticalAt: "< 20" },
    fuel:     { label: "Fuel",         tooltip: "Powers industry, vehicles, and military operations",                  criticalAt: "< 10 barrels" },
    medSupp:  { label: "Med Supplies", tooltip: "Healthcare stockpile — needed during outbreaks and combat",           criticalAt: "< 10" },
    ammo:     { label: "Ammo",         tooltip: "Military ammunition — consumed during raids and police actions",     criticalAt: "< 50 rounds" },
  },

  hotkeys: [
    { section: "Top nav",    key: "1",      action: "City (Overview)" },
    { section: "Top nav",    key: "2",      action: "Law & Edicts" },
    { section: "Top nav",    key: "3",      action: "Economy" },
    { section: "Top nav",    key: "4",      action: "Map (World Map)" },
    { section: "Top nav",    key: "5",      action: "Build (Construction)" },
    { section: "Top nav",    key: "6",      action: "Diplomacy" },
    { section: "Top nav",    key: "7",      action: "More — Command Menus" },
    { section: "Bottom nav", key: "Q",      action: "Inbox" },
    { section: "Bottom nav", key: "W",      action: "Research" },
    { section: "Bottom nav", key: "E",      action: "Military" },
    { section: "Bottom nav", key: "R",      action: "Factions" },
    { section: "Bottom nav", key: "T",      action: "Events" },
    { section: "Bottom nav", key: "Y",      action: "Wildlands" },
    { section: "Bottom nav", key: "U",      action: "Dossier (Commander)" },
    { section: "Game",       key: "Space",  action: "Pause / Resume (real-time) · End Turn (turn-based)" },
    { section: "Game",       key: "+ / =",  action: "Increase Game Speed (real-time)" },
    { section: "Game",       key: "-",      action: "Decrease Game Speed (real-time)" },
    { section: "Game",       key: "F",      action: "Toggle Fullscreen" },
    { section: "Game",       key: "H",      action: "Photo Mode" },
    { section: "Game",       key: "D",      action: "Open Debug Console" },
    { section: "Game",       key: "Ctrl+D", action: "Toggle Debug Console" },
    { section: "Game",       key: "Esc",    action: "Return to City Overview" },
    { section: "System",     key: "Ctrl+S", action: "Quick Save (off in Honor Mode)" },
    { section: "System",     key: "?",      action: "Toggle keyboard help" },
  ],

  endStates: {
    active:           { title: "ACTIVE",                  oneLine: "Business as usual." },
    fallen:           { title: "CITY FALLEN",             oneLine: "Biological pop and housing both reached zero — or all survival paths exhausted." },
    ascendedMachine:  { title: "MACHINE ASCENSION",       oneLine: "Citizens gone but droids and the automaton substrate persist." },
    ascendedBio:      { title: "BIOLOGICAL PERPETUATION", oneLine: "Engineered lineages and clone populations carry the city forward." },
  },

  factions: {
    count: 10,
    hidden: 2,
    description:
      "Each faction tracks Loyalty and Threat scores. When Threat > Loyalty, expect plots. Use Edicts, sponsorships, propaganda, or the Justice arm to balance.",
  },

  faiths: {
    "ancestor-cult":   { name: "The Ancestor Cult",  oneLine: "Bloodlines, memory, and grudges that outlive their owners." },
    "machine-choir":   { name: "The Machine Choir",  oneLine: "The holy hum of the reactors and the gospel of well-oiled gears." },
    "eternal-flame":   { name: "The Eternal Flame",  oneLine: "Nuclear theologians who consider safety regulations a personal insult." },
    "the-ledger":      { name: "The Ledger",         oneLine: "Bureaucrats who believe every receipt is a sacrament and every debt eventually balances." },
    "the-tidekeepers": { name: "The Tidekeepers",    oneLine: "Hydraulic priesthood that worships the city's water cycle as a living circulatory system." },
    "helix-commune":   { name: "The Helix Commune",  oneLine: "Gene-modification mystics who read scripture in the genome — beloved in research wards and slum clinics, hated by the Eternal Flame." },
    "free-choir":      { name: "The Free Choir",     oneLine: "Merchant-cult of the Free Traders. Worships circulation itself — currency, caravans, smuggling routes. Calls the Ledger's bookkeeping heresy." },
    "catholicism":     { name: "Catholicism",        oneLine: "Parish networks preserving worship, mutual aid, and sacramental life through the collapse." },
  },

  quickStart: [
    "Read the welcome dispatch in your Inbox (Q).",
    "Open City (1) — confirm no stockpile is bleeding red.",
    "Open Law (2) — deploy a Patrol unit if crime is creeping up.",
    "Open Build (5) — drop a Hab Block Mega-Tower if anyone is unhoused.",
    "There is no rush — study each screen before you let time move forward.",
  ],

  tipsForNewMarshals: [
    "Thinking time is free — the city waits between your decisions.",
    "Watch deltas, not totals — a stockpile bleeding red is a coffin clock.",
    "Build housing before growing population.",
    "Officers earn their salary — even mediocre ones beat empty seats.",
    "Pick fights you can finish — six factions plotting at once is not survivable.",
    "Faiths are a free stabiliser — sponsoring one costs nothing.",
    "Save before declaring a Leader Cult — the first 50 ticks are spicy.",
    "Send scavenging expeditions even when you don't need to.",
    "Use Auto-managers late game — you can't micro 142 officers and 268 districts forever.",
    "The pigeons remember everything. This is intentional.",
  ],
};
