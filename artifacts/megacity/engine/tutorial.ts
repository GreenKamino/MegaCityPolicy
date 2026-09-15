import type { GameState } from "./types";

// Tutorial tip catalog. Tips are one-shot inbox dispatches fired from the
// game tick (see context/GameContext.tsx). Each fires once per save when
// triggerTick is reached and (optional) condition passes; the id is then
// pushed onto state.dismissedTutorialTips so it never repeats.
//
// Voice rules (Steam-release polish): terse dystopian, council-as-distant-
// authority, every tip ends on a CONCRETE ACTION the player can take in the
// next 30 seconds. No emojis, no marketing fluff, no exclamation marks.

export type TutorialTipId =
  | "welcome"
  | "build_housing"
  | "check_resources"
  | "manage_factions"
  | "research_tech"
  | "handle_events"
  | "trade_routes"
  | "hire_units"
  | "expand_region"
  | "balance_factions"
  | "graduation";

export type TutorialTip = {
  id: TutorialTipId;
  title: string;
  body: string;
  triggerTick: number;
  condition?: (state: GameState) => boolean;
};

export const TUTORIAL_TIPS: TutorialTip[] = [
  {
    id: "welcome",
    title: "INCOMING TRANSMISSION",
    body: "Commander, the Council has cut your sector loose. Power, food, water, order — all yours to manage. They will not call again unless you fail. Open the Inbox tab to read every dispatch in this feed.",
    triggerTick: 1,
  },
  {
    id: "check_resources",
    title: "RESOURCE ADVISORY",
    body: "Watch credits, food, water, power. Bottom out any one of them and the citizens will let you know — violently. The top bar shows live levels. Open Economy for the full ledger.",
    triggerTick: 2,
  },
  {
    id: "build_housing",
    title: "CONSTRUCTION MEMO",
    body: "Citizens need shelter or they sleep in the gutter. Open Construction and place a Hab Block Mega-Tower or Worker Housing Stack. Overcrowding breeds crime.",
    triggerTick: 4,
  },
  {
    id: "manage_factions",
    title: "FACTION INTELLIGENCE",
    body: "Nine factions run this sector — judges, corps, syndicates, cults, the underclass. Each carries demands. Open Social to read their loyalty and threat scores. Balancing them is your real job.",
    triggerTick: 6,
  },
  {
    id: "research_tech",
    title: "R&D DIVISION REPORT",
    body: "Open Research and queue a tech. Early on, prioritize resource production and infrastructure — the rest unlocks if you survive long enough. Active research advances every tick.",
    triggerTick: 8,
  },
  {
    id: "handle_events",
    title: "CRISIS MANAGEMENT",
    body: "Incidents land in your Overview and Inbox. Each carries response options with hard trade-offs. Ignore an event and the consequences play out anyway. Pick the cost you can absorb.",
    triggerTick: 12,
  },
  {
    id: "trade_routes",
    title: "TRADE NETWORK ADVISORY",
    body: "Two hundred and three settlements scrape by across the post-collapse Americas. Open Diplomacy to broker trade pacts — they supplement your stockpiles when production stalls. Some partners need ports, ferries, or air freight to reach.",
    triggerTick: 16,
  },
  {
    id: "hire_units",
    title: "PERSONNEL DIVISION",
    body: "Order does not enforce itself. Open Military and recruit Judges, Patrol Units, or Defense Forces. More boots means more law — and more upkeep. Cut too deep and the gangs notice.",
    triggerTick: 20,
  },
  {
    id: "expand_region",
    title: "TERRITORIAL DIRECTIVE",
    body: "Your sector is one tile on a continent in ruin. Open the World Map and scout adjacent regions, then claim them through Expansion to add resources and population. Staying small means staying poor.",
    triggerTick: 40,
  },
  {
    id: "balance_factions",
    title: "LOYALTY AUDIT",
    body: "By now your factions have drifted. Open Social — anyone with Threat above Loyalty is plotting. Issue an Edict, fund a project, or lean on the Justice arm. Doing nothing picks a side anyway.",
    triggerTick: 80,
  },
  {
    id: "graduation",
    title: "FIELD COMMENDATION",
    body: "You have run this sector long enough that the Council is no longer counting days — they are counting decades. The training wheels stop here. Everything ahead is yours to build, lose, or burn.",
    triggerTick: 150,
  },
];

export const EARLY_GAME_TICK_THRESHOLD = 8;

export function isEarlyGame(state: GameState): boolean {
  return state.totalTicks <= EARLY_GAME_TICK_THRESHOLD;
}

export function getPendingTutorialTips(state: GameState): TutorialTip[] {
  const dismissed = state.dismissedTutorialTips ?? [];
  return TUTORIAL_TIPS.filter((tip) => {
    if (dismissed.includes(tip.id)) return false;
    if (state.totalTicks < tip.triggerTick) return false;
    if (tip.condition && !tip.condition(state)) return false;
    return true;
  });
}

export function getNextTutorialTip(state: GameState): TutorialTip | null {
  const pending = getPendingTutorialTips(state);
  return pending.length > 0 ? pending[0] : null;
}
