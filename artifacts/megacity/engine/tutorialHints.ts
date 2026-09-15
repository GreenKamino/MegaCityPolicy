// Static catalog of every TutorialHint in the game, keyed by the same id
// that the inline <TutorialHint id="..."> components pass to TutorialContext.
//
// Why this lives in /engine/: the catalog is data, not UI. The "Tips
// Reviewed" screen reads it to render a master list (so players can scroll
// through every tip even after dismissing them), and we want it importable
// from anywhere without dragging React in.
//
// Each entry should mirror EXACTLY the message string passed to the
// matching <TutorialHint /> component. Keep the two in sync when adding
// new hints — the catalog is the single source of truth for the
// tips-reviewed UI; the inline render is what the player sees in context.

export type TutorialHintEntry = {
  id: string;
  // Where in the game the hint appears, used as the row title.
  location: string;
  // Verbatim copy of the inline TutorialHint message prop.
  message: string;
};

export const TUTORIAL_HINTS: TutorialHintEntry[] = [
  {
    id: "overview_welcome",
    location: "Overview · City tab",
    message:
      "Sector Command interface online. This is the situation room: monitor resources, manage policies, and respond to events from here. Use the bottom bar to navigate between screens.",
  },
  {
    id: "construction_intro",
    location: "Construction screen",
    message:
      "Build infrastructure to grow your city. Each building costs credits (and sometimes steel). Use the batch selector to build multiple at once.",
  },
  {
    id: "research_intro",
    location: "Research screen",
    message:
      "Research unlocks permanent bonuses. Build Research Labs and assign scientists to increase your research rate. Queue technologies to auto-progress.",
  },
  {
    id: "worldmap_intro",
    location: "World Map screen",
    message:
      "This is the post-collapse Americas. 203 locations across North America — megacities, townships, ruins, resource sites. Pan and zoom to explore, then send expeditions to discover what's hidden in the fog. South America is drawn on the map but reserved for future content (UNDER DEVELOPMENT).",
  },
  {
    id: "inbox_intro",
    location: "Inbox screen",
    message:
      "Dispatches, intel, and crises land here. Filter by category or priority. Tap a message to read it; swipe the X to archive. Critical entries demand a response within ticks.",
  },
  {
    id: "law_intro",
    location: "Law screen",
    message:
      "Edicts cost credits and run for a fixed number of ticks. Each one carries a risk profile — security clamps unrest but collapses happiness, social spends credits to keep the streets calm. Cooldowns prevent spam.",
  },
  {
    id: "economy_intro",
    location: "Economy screen",
    message:
      "Tax bands, procurement, and tariffs feed every credit you spend. Raise tax to fill the treasury at the cost of happiness; cut it to appease the populace and watch the deficit grow.",
  },
  {
    id: "districts_intro",
    location: "Districts screen",
    message:
      "Each district carries its own demographics, crime, and unrest. Zone for industry, residence, or commerce. Neglect a district and it festers; over-invest and the rest of the city resents it.",
  },
  {
    id: "diplomacy_intro",
    location: "Diplomacy screen",
    message:
      "Other megacities watch your every move. Trade agreements bring resources; pacts stack defensive bonuses; betrayals are remembered for a long time.",
  },
  {
    id: "officers_intro",
    location: "Officers screen",
    message:
      "Officers run missions, lead garrisons, and absorb risks you cannot. Recruit, promote, and assign them. They have loyalty, ambition, and a memory — treat them poorly and they will remember.",
  },
  {
    id: "finances_intro",
    location: "Finances screen",
    message:
      "Tax revenue, expenses, trade flows, and reserves are tracked here. A red line means you bleed credits every tick. Fix it before the treasury hits zero — bankruptcy ends regimes.",
  },
  {
    id: "character_intro",
    location: "Character screen",
    message:
      "Your attributes — Authority, Cunning, Charisma, Resolve — gate which edicts you can issue and how factions perceive you. Spend skill points carefully. There is no second draft.",
  },
  {
    id: "prestige_intro",
    location: "Prestige screen",
    message:
      "When your city falls, your legacy persists. Earn Legacy Points from your run and spend them on permanent bonuses for every future regime.",
  },
  {
    id: "megaprojects_intro",
    location: "Mega Projects screen",
    message:
      "Mega projects take many ticks to plan and many more to build. They reshape the city in ways no normal building can. Queue them carefully — once committed, the credits are gone.",
  },
  {
    id: "contracts_intro",
    location: "Contracts screen",
    message:
      "Accept contracts for credits, resources, or political favor. Each carries a deadline. Failing one damages your reputation with the issuing party.",
  },
  {
    id: "military_intro",
    location: "Military screen",
    message:
      "Garrison strength, drone fleets, and special forces are managed here. Wars are expensive, but defenseless cities get annexed. Maintain a credible deterrent.",
  },
  {
    id: "summary_intro",
    location: "Run Summary screen",
    message:
      "This is the regime ledger: faction standings, builds erected, edicts signed, and the population you leave behind. Read it before you rebirth — the patterns here are the only honest mirror you have.",
  },
  {
    id: "atlas_intro",
    location: "Atlas screen",
    message:
      "The Wasteland Atlas catalogues every range, water, coast, canyon, plateau, dead river, dune field, scatter field, cliff, and zone you have inspected on the world map. Tap a terrain feature there to chart it. Completing a category awards XP and a Trophy Wall first; charting every category unlocks a unique commander title.",
  },
  {
    id: "events_intro",
    location: "Events screen",
    message:
      "Review the operational impact, then commit a response. Every option changes city resources or stability.",
  },
];
