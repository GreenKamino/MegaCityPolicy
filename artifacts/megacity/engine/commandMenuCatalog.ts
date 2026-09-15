import type { GameState } from "@/engine/types";
import {
  getUnlockedHudFeatures,
  isIntroLockActive,
  isRouteUnlocked,
  type HudFeatureId,
} from "@/engine/hudUnlocks";

export type CommandMenuGroup =
  | "command"
  | "operations"
  | "governance"
  | "world"
  | "commander";

export type CommandMenuIcon = {
  set: "feather" | "mci";
  name: string;
};

export type CommandDestination = {
  id: string;
  route: string;
  label: string;
  subtitle: string;
  aliases: readonly string[];
  group: CommandMenuGroup;
  icon: CommandMenuIcon;
  hotkey?: string;
  hudFeature?: HudFeatureId;
  statusRoute?: string;
};

export const COMMAND_MENU_GROUPS: readonly {
  id: CommandMenuGroup;
  label: string;
  icon: CommandMenuIcon;
}[] = [
  { id: "command", label: "Command & Intelligence", icon: { set: "mci", name: "monitor-dashboard" } },
  { id: "operations", label: "Operations", icon: { set: "feather", name: "tool" } },
  { id: "governance", label: "Governance", icon: { set: "mci", name: "handshake" } },
  { id: "world", label: "World", icon: { set: "mci", name: "earth" } },
  { id: "commander", label: "Commander Tools", icon: { set: "mci", name: "star-shooting" } },
];

const destination = (
  id: string,
  route: string,
  label: string,
  subtitle: string,
  group: CommandMenuGroup,
  icon: CommandMenuIcon,
  aliases: readonly string[] = [],
  extra: Pick<CommandDestination, "hotkey" | "hudFeature" | "statusRoute"> = {},
): CommandDestination => ({
  id,
  route,
  label,
  subtitle,
  group,
  icon,
  aliases,
  ...extra,
});

/**
 * The canonical destination graph for More and the command palette.
 * Keep this module free of React and navigation imports so aliases, grouping,
 * and unlock filtering can be tested without rendering the app.
 */
export const COMMAND_DESTINATIONS: readonly CommandDestination[] = [
  destination("city", "/(game)/overview", "CITY", "City status, warnings, and live operations", "command", { set: "mci", name: "city" }, ["home", "overview", "dashboard"], { hotkey: "1", hudFeature: "overview" }),
  destination("law", "/(game)/law", "LAW", "Crime, unrest, justice, and public order", "governance", { set: "mci", name: "gavel" }, ["law order", "police", "crime", "justice"], { hotkey: "2", hudFeature: "law" }),
  destination("economy", "/(game)/economy", "ECONOMY", "Production, resources, and economic health", "governance", { set: "feather", name: "trending-up" }, ["money", "credits", "cash", "economics"], { hotkey: "3", hudFeature: "economy" }),
  destination("worldmap", "/(game)/worldmap", "MAP", "World map, locations, and discovered regions", "world", { set: "mci", name: "earth" }, ["world map", "map", "globe"], { hotkey: "4", hudFeature: "worldmap" }),
  destination("construction", "/(game)/construction", "BUILD", "Build and expand city infrastructure", "operations", { set: "mci", name: "hammer-wrench" }, ["build", "construction", "buildings"], { hotkey: "5", hudFeature: "construction" }),
  destination("diplomacy", "/(game)/diplomacy", "DIPLO", "Faction relations and diplomatic agreements", "governance", { set: "mci", name: "handshake" }, ["diplomacy", "foreign affairs"], { hotkey: "6", hudFeature: "diplomacy" }),
  destination("more", "/(game)/more", "MORE", "All command systems and player tools", "commander", { set: "feather", name: "grid" }, ["menu", "commands", "command menu"], { hotkey: "7", hudFeature: "more" }),

  destination("inbox", "/(game)/inbox", "INBOX", "Messages, reports, and alerts", "command", { set: "feather", name: "mail" }, ["dispatch", "messages", "reports", "notifications"], { hotkey: "⇧1", hudFeature: "inbox", statusRoute: "/(game)/inbox" }),
  destination("events", "/(game)/events", "EVENTS & REPORTS", "Incidents, ticker log, and history", "command", { set: "feather", name: "alert-triangle" }, ["crises", "crisis", "incidents", "news", "ticker"], { hotkey: "E", hudFeature: "events", statusRoute: "/(game)/events" }),
  destination("administration", "/(game)/administration", "ADMINISTRATION", "Officers, diplomacy, city systems, and software upgrades", "command", { set: "mci", name: "shield-crown" }, ["admin", "systems"]),
  destination("advisor-briefings", "/(game)/advisor-briefings", "AUTO-MANAGER CONTROL CENTER", "Advisor briefings, all manager modes, approvals, and pause-all safety control", "command", { set: "mci", name: "account-tie-voice" }, ["advisors", "advisor briefings", "approval queue", "auto managers"], { statusRoute: "/(game)/advisor-briefings" }),
  destination("character", "/(game)/character", "DOSSIER", "Commander profile, politics, and inner circle", "commander", { set: "feather", name: "user" }, ["commander", "profile", "character"], { hotkey: "U", hudFeature: "character" }),
  destination("stats", "/(game)/stats", "CITY STATISTICS", "Historical trends, sparklines, and city metrics", "command", { set: "feather", name: "bar-chart-2" }, ["stats", "statistics", "metrics", "trends"], { hotkey: "⇧2" }),

  destination("districts", "/(game)/districts", "SECTOR MAP", "District heatmaps, zone stats, and population overview", "operations", { set: "mci", name: "map-marker-multiple" }, ["sectors", "districts", "sector map", "zones"], { hotkey: "⇧7", statusRoute: "/(game)/districts" }),
  destination("production-chains", "/(game)/production-chains", "PRODUCTION CHAINS", "Trace inputs, outputs, producers, and consumers", "operations", { set: "mci", name: "sitemap-outline" }, ["production", "supply chains", "inputs", "outputs"]),
  destination("contracts", "/(game)/contracts", "CONTRACTS / PROCUREMENT", "Award contracts, projects, and procurement policies", "operations", { set: "feather", name: "file-text" }, ["contracts", "procurement", "projects"], { statusRoute: "/(game)/contracts" }),
  destination("megaprojects", "/(game)/megaprojects", "MEGA-PROJECTS", "City-scale construction and strategic infrastructure", "operations", { set: "mci", name: "city-variant-outline" }, ["mega projects", "arcology", "fusion nexus"]),
  destination("wildlands", "/(game)/wildlands", "WILDLANDS", "Biomes, species, ecology, and restoration projects", "world", { set: "mci", name: "leaf-maple" }, ["biomes", "ecology", "nature", "wasteland atlas"], { hotkey: "Y", hudFeature: "wildlands" }),
  destination("social", "/(game)/social", "SOCIAL & CIVIC", "Welfare, propaganda, and population control", "governance", { set: "mci", name: "account-group" }, ["social", "civic", "welfare", "propaganda"]),

  destination("finances", "/(game)/finances", "FINANCES & BANKING", "Loans, savings, deposits, and transfers", "governance", { set: "mci", name: "bank" }, ["finance", "money", "banking", "credits"], { hotkey: "⇧5" }),
  destination("trade", "/(game)/trade", "TRADE EXCHANGE", "Buy and sell commodities and manage trade routes", "governance", { set: "mci", name: "swap-horizontal-bold" }, ["trade", "commerce", "market", "commodities"], { hotkey: "⇧8" }),
  destination("companies", "/(game)/companies", "COMMERCIAL LICENSING", "License companies across ten economic sectors", "governance", { set: "feather", name: "briefcase" }, ["companies", "business", "corporations"]),
  destination("blackmarket", "/(game)/blackmarket", "BLACK MARKET", "Illegal goods and high-risk transactions", "governance", { set: "mci", name: "skull-crossbones" }, ["black market", "illegal", "contraband"]),
  destination("local-economy", "/(game)/local-economy", "LOCAL ECONOMY", "Independent businesses and local commerce", "governance", { set: "mci", name: "storefront-outline" }, ["local business", "shops"]),

  destination("military", "/(game)/military", "MILITARY & ARMORY", "Units, vehicles, and readiness", "operations", { set: "mci", name: "tank" }, ["military", "army", "defense", "armory"], { hotkey: "E", hudFeature: "military", statusRoute: "/(game)/military" }),
  destination("bestiary", "/(game)/bestiary", "BESTIARY — SIGNATURE UNITS", "Faction rosters and enemy units in raids", "world", { set: "mci", name: "book-open-page-variant" }, ["bestiary", "enemy units", "creatures"]),
  destination("recruitment", "/(game)/recruitment", "RECRUITMENT & PERSONNEL", "Hire and dismiss units, vehicles, droids, and staff", "operations", { set: "feather", name: "users" }, ["recruitment", "hire", "personnel"]),
  destination("officers", "/(game)/officers", "OFFICER LOBBY", "Government officials and appointments", "operations", { set: "mci", name: "account-tie" }, ["officers", "officials", "appointments"], { hotkey: "⇧6", statusRoute: "/(game)/officers" }),
  destination("criminals", "/(game)/criminals", "CRIMINAL REGISTRY", "Wanted, fugitive, and detained-person records", "governance", { set: "mci", name: "account-alert" }, ["criminals", "wanted", "fugitives", "rap sheet"]),
  destination("missions", "/(game)/missions", "OFFICER MISSIONS", "Deploy officers on intel, diplomatic, and combat operations", "operations", { set: "mci", name: "compass-outline" }, ["missions", "operations", "officer ops"], { hotkey: "⇧4", statusRoute: "/(game)/missions" }),
  destination("retinue", "/(game)/retinue", "RETINUE COMMAND", "Squads, captains, troops, and training", "operations", { set: "mci", name: "sword-cross" }, ["retinue", "squads", "captains", "troops"]),
  destination("upgrades", "/(game)/upgrades", "ASSET UPGRADES", "Permanent upgrades for units, captains, and followers", "operations", { set: "mci", name: "arrow-up-bold-circle" }, ["upgrades", "improvements"]),
  destination("inventory", "/(game)/inventory", "INVENTORY", "Weapons, armor, gear, and relics", "operations", { set: "mci", name: "treasure-chest" }, ["inventory", "equipment", "gear", "weapons"]),

  destination("factions", "/(game)/factions", "FACTIONS", "Manage relationships, threats, and demands", "governance", { set: "mci", name: "sword-cross" }, ["factions", "threats", "alliances"], { hotkey: "R", hudFeature: "factions", statusRoute: "/(game)/factions" }),
  destination("mining", "/(game)/mining", "MINING & EXTRACTION", "Resource extraction and active sites", "world", { set: "mci", name: "pickaxe" }, ["mining", "extraction", "ore"], { statusRoute: "/(game)/mining" }),
  destination("scavenging", "/(game)/scavenging", "SCAVENGING & RECLAMATION", "Wasteland operations and expeditions", "world", { set: "mci", name: "compass-outline" }, ["scavenging", "reclamation", "expeditions"], { statusRoute: "/(game)/scavenging" }),
  destination("expansion", "/(game)/expansion", "DISTRICT EXPANSION", "Reclaim wasteland and expand the city", "world", { set: "mci", name: "hammer-wrench" }, ["expansion", "reclaim", "new sectors"], { statusRoute: "/(game)/expansion" }),

  destination("research", "/(game)/research", "RESEARCH & TECH", "Unlock advanced capabilities", "world", { set: "feather", name: "cpu" }, ["research", "technology", "tech", "science"], { hotkey: "⇧3", hudFeature: "research", statusRoute: "/(game)/research" }),
  destination("cybernetics", "/(game)/cybernetics", "CYBERNETICS", "Augments, implants, and body modification programs", "world", { set: "mci", name: "robot-industrial" }, ["cybernetics", "implants", "augmentations"]),
  destination("space", "/(game)/space", "SPACE COMMAND", "Launch operations, orbital assets, and colonies", "world", { set: "mci", name: "rocket-launch-outline" }, ["space", "orbital", "colonies", "fleet"]),

  destination("challenges", "/(game)/challenges", "CHALLENGES", "Daily login streak and weekly procedural challenges", "commander", { set: "mci", name: "trophy-award" }, ["daily", "weekly", "rewards"], { statusRoute: "/(game)/challenges" }),
  destination("changelog", "/(game)/changelog", "CHANGELOG", "Patch notes and version history", "commander", { set: "mci", name: "script-text-outline" }, ["updates", "release notes"]),
  destination("prestige", "/(game)/prestige", "PRESTIGE / REBIRTH", "Earn permanent bonuses across rebirths", "commander", { set: "mci", name: "star-shooting" }, ["prestige", "rebirth", "legacy"]),
  destination("achievements", "/(game)/achievements", "ACHIEVEMENTS", "Milestones, feats, and accomplishments", "commander", { set: "mci", name: "trophy-outline" }, ["achievements", "milestones", "feats"]),
  destination("codex", "/(game)/codex", "CODEX — GAME MANUAL", "Searchable guide to all game systems and mechanics", "commander", { set: "mci", name: "book-open-variant" }, ["codex", "manual", "guide", "encyclopedia"], { hotkey: "⇧9" }),
  destination("lore", "/(game)/lore", "LORE — FIELD ARCHIVES", "Collected data disks, journals, and transmissions", "commander", { set: "mci", name: "script-text-outline" }, ["lore", "archives", "journals"]),
  destination("atlas", "/(game)/atlas", "ATLAS — WASTELAND TERRAIN", "Catalogued landforms and discovered terrain", "world", { set: "mci", name: "map-outline" }, ["atlas", "terrain", "landforms"]),
  destination("debug", "/(game)/debug", "DEBUG / CHEATS", "Force events, inject resources, and toggle cheats", "commander", { set: "feather", name: "terminal" }, ["debug", "cheats", "developer"]),
];

export function isDestinationUnlocked(
  item: CommandDestination,
  state: Pick<GameState, "hasCompletedOnboarding" | "didBuild" | "didEdict" | "didRead" | "onboardingStep">,
): boolean {
  if (isIntroLockActive(state)) {
    if (!item.hudFeature) return false;
    return getUnlockedHudFeatures(state).has(item.hudFeature);
  }
  return isRouteUnlocked(item.route, state);
}

export function getUnlockedCommandDestinations(
  state: Pick<GameState, "hasCompletedOnboarding" | "didBuild" | "didEdict" | "didRead" | "onboardingStep">,
): CommandDestination[] {
  return COMMAND_DESTINATIONS.filter((item) => isDestinationUnlocked(item, state));
}

export function searchCommandDestinations(
  query: string,
  destinations: readonly CommandDestination[] = COMMAND_DESTINATIONS,
): CommandDestination[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...destinations];
  return destinations
    .map((item, index) => {
      const haystack = [item.label, item.subtitle, ...item.aliases].join(" ").toLowerCase();
      const exactLabel = item.label.toLowerCase() === query.trim().toLowerCase();
      const score = exactLabel ? 0 : terms.every((term) => haystack.includes(term)) ? index + 1 : Number.POSITIVE_INFINITY;
      return { item, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score)
    .map(({ item }) => item);
}