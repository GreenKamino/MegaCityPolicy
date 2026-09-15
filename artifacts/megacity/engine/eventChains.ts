import type { GameState, GameEvent, TickEntry } from "@/engine/types";
import { TECH_MAP } from "@/engine/technologies";
import { BUSINESS_EVENT_CHAINS } from "@/engine/businessEventChains";
import { RESEARCH_EVENT_CHAINS } from "@/engine/researchEventChain";
import { RELIGION_EVENT_CHAINS } from "@/engine/religionEventChains";
import { pushNewsItem, type NewsFeedItem } from "@/engine/newsFeed";
import { ARRAY_CAPS, MAX_BASE_POP_GROWTH_RATE } from "@/engine/sanitizer";
import { getDistrictCategory } from "@/engine/districts";
import { applyResourceDelta } from "@/engine/resourceStorage";
import { isRetiredEventChainId } from "@/engine/eventRetirement";
import {
  applyFreeChoirTransitScale,
  ensureFaithState,
  FAITH_DEFS,
  getFreeChoirTransitMultiplier,
  isFaithId,
  normalizeShares,
  type DistrictFaithShares,
} from "@/engine/faiths";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";

// Task #214: chains whose stage outcomes are flavor-wise caravan/convoy/transit
// — their credit/tradeIncome/food deltas should ride the Free Choir transit
// success modifier the same way `trade_caravan_arrives` does. Listed here so
// adding a new transit-themed chain only requires touching this set.
//   - trade_war_blockade: every response talks transit rights, war convoys,
//     trade routes, supply lines.
//   - free_trader_embargo: merchant convoys diverted, trade restored.
export const FREE_CHOIR_TRANSIT_CHAIN_IDS: ReadonlySet<string> = new Set([
  "trade_war_blockade",
  "free_trader_embargo",
]);

export type EventChainStage = {
  id: string;
  title: string;
  /** Legacy authored prose may remain in old chain definitions/saves. */
  description?: string;
  severity: GameEvent["severity"];
  delayTicks: number;
  responses: EventChainResponse[];
  // Task #539: optional news beat. Fired exactly once, at the moment the
  // stage's event becomes visible to the player (chain start for the first
  // stage, spawn time for delayed stages, advance time for zero-delay
  // stages). Returning null skips the beat.
  news?: (s: GameState, ctx: Record<string, string> | undefined) => NewsFeedItem | null;
};

export type EventChainResponse = {
  id: string;
  label: string;
  /** Legacy authored prose may remain in old chain definitions/saves. */
  description?: string;
  effects: Partial<Record<string, number>>;
  nextStageId: string | null;
  unlockTechId?: string;
  bizAction?: BusinessChainAction;
  chainAction?: CorporateChainAction;
  // Task #539: deterministic chance fork. When set, the response routes to
  // altNextStageId instead of nextStageId with altChancePct% probability,
  // resolved at advance time from the tick seed (chainForkRoll) so replays
  // and tests are reproducible.
  chanceFork?: { altNextStageId: string; altChancePct: number };
};

export type BusinessChainAction =
  | "close_business"
  | "boost_reputation"
  | "damage_reputation"
  | "promote_to_t2"
  | "mark_landmark";

export type CorporateChainAction =
  | "break_up_chain"      // halve locationCount of chain at context.chainId
  | "shrink_to_minimum"   // reset chain at context.chainId to baseLocations
  | "transfer_locations"  // chain at context.chainId absorbed by chain at context.chainId2
  | "force_milestone";    // re-stamp notableMilestones from current locationCount

export type EventChainDef = {
  id: string;
  name: string;
  triggerCheck: (s: GameState) => boolean;
  cooldownTicks: number;
  stages: EventChainStage[];
  prepareContext?: (s: GameState) => Record<string, string> | null;
};

export type ActiveEventChain = {
  chainId: string;
  currentStageId: string;
  startTick: number;
  stageStartTick: number;
  choicesMade: string[];
  resolved: boolean;
  context?: Record<string, string>;
};

const ALL_EVENT_CHAINS: EventChainDef[] = [
  {
    id: "reactor_meltdown",
    name: "Reactor Meltdown Crisis",
    triggerCheck: (s) => s.cityStats.infrastructureHealth < 40 && s.resources.power < 500,
    cooldownTicks: 200,
    stages: [
      {
        id: "rm_stage1",
        title: "REACTOR CONTAINMENT WARNING",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "rm_evacuate", label: "EVACUATE THE SECTOR", effects: { credits: -50000, happiness: -5, unrest: 5 }, nextStageId: "rm_stage2_evac" },
          { id: "rm_repair", label: "ATTEMPT EMERGENCY REPAIR", effects: { credits: -20000 }, nextStageId: "rm_stage2_repair" },
          { id: "rm_ignore", label: "MONITOR AND WAIT", effects: {}, nextStageId: "rm_stage2_ignore" },
        ],
      },
      {
        id: "rm_stage2_evac",
        title: "EVACUATION COMPLETE — REACTOR SCRAMMED",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "rm_rebuild", label: "BEGIN RECONSTRUCTION", effects: { credits: -80000, power: -200, infrastructureHealth: 5 }, nextStageId: "rm_stage3_rebuild" },
          { id: "rm_decomm", label: "DECOMMISSION THE REACTOR", effects: { power: -500, happiness: -3 }, nextStageId: null },
        ],
      },
      {
        id: "rm_stage2_repair",
        title: "REPAIR TEAMS DEPLOYED",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "rm_push", label: "PUSH THROUGH — FINISH THE REPAIR", effects: { credits: -10000, happiness: -8, unrest: 3, power: 300, infrastructureHealth: 10 }, nextStageId: "rm_stage3_success" },
          { id: "rm_pullout", label: "PULL THEM OUT", effects: { credits: -5000, power: -400, happiness: 2 }, nextStageId: null },
        ],
      },
      {
        id: "rm_stage2_ignore",
        title: "REACTOR BREACH — CATASTROPHIC FAILURE",
        severity: "critical",
        delayTicks: 4,
        responses: [
          { id: "rm_crisis_mgmt", label: "DECLARE STATE OF EMERGENCY", effects: { credits: -200000, happiness: -20, unrest: 25, crime: 10, population: -12000, infrastructureHealth: -20 }, nextStageId: null },
        ],
      },
      {
        id: "rm_stage3_rebuild",
        title: "SECTOR 7-G RECONSTRUCTION UNDERWAY",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "rm_done", label: "ACKNOWLEDGE", effects: { infrastructureHealth: 8, happiness: 3, power: 400 }, nextStageId: null },
        ],
      },
      {
        id: "rm_stage3_success",
        title: "REACTOR STABILIZED — AT A COST",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "rm_honor", label: "HONOR THE FALLEN", effects: { credits: -30000, happiness: 5, unrest: -5 }, nextStageId: null },
          { id: "rm_classify", label: "CLASSIFY THE INCIDENT", effects: { happiness: -3, corruption: 5, unrest: -2 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "corporate_takeover",
    name: "Corporate Hostile Takeover",
    triggerCheck: (s) => s.resources.credits > 500000 && s.cityStats.corruption > 30,
    cooldownTicks: 300,
    stages: [
      {
        id: "ct_stage1",
        title: "HOSTILE ACQUISITION DETECTED",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ct_negotiate", label: "OPEN NEGOTIATIONS", effects: { credits: 100000 }, nextStageId: "ct_stage2_negotiate" },
          { id: "ct_resist", label: "BLOCK THE ACQUISITION", effects: { credits: -50000, corruption: -5 }, nextStageId: "ct_stage2_resist" },
          { id: "ct_welcome", label: "WELCOME CORPORATE INVESTMENT", effects: { credits: 200000, corruption: 10 }, nextStageId: "ct_stage2_welcome" },
        ],
      },
      {
        id: "ct_stage2_negotiate",
        title: "NEXUS DYNAMICS PROPOSAL",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "ct_accept_partial", label: "ACCEPT PARTIAL DEAL", effects: { credits: 300000, power: 500, corruption: 8, happiness: -5 }, nextStageId: "ct_stage3_partial" },
          { id: "ct_reject", label: "REJECT AND NATIONALIZE", effects: { credits: -100000, corruption: -10, unrest: 10 }, nextStageId: null },
        ],
      },
      {
        id: "ct_stage2_resist",
        title: "NEXUS RETALIATES",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "ct_double_down", label: "HOLD THE LINE", effects: { credits: -80000, unrest: 8, happiness: -5, corruption: -8 }, nextStageId: "ct_stage3_victory" },
          { id: "ct_capitulate", label: "OFFER COMPROMISE", effects: { credits: 50000, corruption: 5, happiness: -3 }, nextStageId: null },
        ],
      },
      {
        id: "ct_stage2_welcome",
        title: "NEXUS DYNAMICS MOVES IN",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "ct_embrace", label: "EMBRACE CORPORATE GOVERNANCE", effects: { credits: 500000, employment: 15, corruption: 15, happiness: -10 }, nextStageId: null },
          { id: "ct_regret", label: "BEGIN SECRET NATIONALIZATION PLAN", effects: { credits: 100000, corruption: 5 }, nextStageId: "ct_stage3_betrayal" },
        ],
      },
      {
        id: "ct_stage3_partial",
        title: "POWER GRID UNDER CORPORATE CONTROL",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "ct_accept_outcome", label: "ACCEPTABLE LOSSES", effects: { happiness: -3, power: 300 }, nextStageId: null },
        ],
      },
      {
        id: "ct_stage3_victory",
        title: "NEXUS WITHDRAWS",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "ct_celebrate", label: "DECLARE INDEPENDENCE DAY", effects: { happiness: 10, unrest: -10, corruption: -5 }, nextStageId: null },
        ],
      },
      {
        id: "ct_stage3_betrayal",
        title: "NATIONALIZATION COMPLETE",
        severity: "high",
        delayTicks: 16,
        responses: [
          { id: "ct_gloat", label: "ISSUE VICTORY STATEMENT", effects: { credits: 400000, happiness: 8, corruption: -10, unrest: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "underground_resistance",
    name: "Underground Resistance",
    triggerCheck: (s) => s.cityStats.unrest > 50 && s.cityStats.happiness < 35,
    cooldownTicks: 250,
    stages: [
      {
        id: "ur_stage1",
        title: "UNDERGROUND MOVEMENT DETECTED",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ur_infiltrate", label: "INFILTRATE THE MOVEMENT", effects: { credits: -20000 }, nextStageId: "ur_stage2_infiltrate" },
          { id: "ur_crush", label: "IMMEDIATE CRACKDOWN", effects: { credits: -10000, unrest: 10, crime: -5, lawOrder: 5 }, nextStageId: "ur_stage2_crush" },
          { id: "ur_address", label: "ADDRESS THEIR GRIEVANCES", effects: { credits: -30000, happiness: 5 }, nextStageId: "ur_stage2_dialogue" },
        ],
      },
      {
        id: "ur_stage2_infiltrate",
        title: "INTELLIGENCE REPORT: RESISTANCE STRUCTURE",
        severity: "high",
        delayTicks: 12,
        responses: [
          { id: "ur_decapitate", label: "ARREST THE LEADERSHIP", effects: { unrest: 15, crime: -8, lawOrder: 8, happiness: -10 }, nextStageId: "ur_stage3_arrested" },
          { id: "ur_turn", label: "RECRUIT KIRA VASQUEZ", effects: { credits: -50000, happiness: 5, corruption: 5 }, nextStageId: "ur_stage3_recruited" },
        ],
      },
      {
        id: "ur_stage2_crush",
        title: "CRACKDOWN AFTERMATH",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "ur_martial", label: "DECLARE MARTIAL LAW", effects: { unrest: -15, happiness: -15, crime: -10, lawOrder: 15 }, nextStageId: null },
          { id: "ur_negotiate_now", label: "OFFER AMNESTY", effects: { unrest: -10, happiness: 8, crime: 5, lawOrder: -5 }, nextStageId: null },
        ],
      },
      {
        id: "ur_stage2_dialogue",
        title: "RESISTANCE DEMANDS",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "ur_accept_demands", label: "ACCEPT ALL DEMANDS", effects: { happiness: 15, unrest: -20, lawOrder: -10, corruption: -5 }, nextStageId: null },
          { id: "ur_partial_concession", label: "PARTIAL CONCESSIONS", effects: { happiness: 8, unrest: -10, lawOrder: -3 }, nextStageId: null },
          { id: "ur_betray", label: "ARREST THEM AT THE TABLE", effects: { happiness: -15, unrest: 20, crime: 5, lawOrder: 10 }, nextStageId: null },
        ],
      },
      {
        id: "ur_stage3_arrested",
        title: "RESISTANCE COLLAPSES",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "ur_done_crush", label: "ORDER RESTORED", effects: { unrest: -10, crime: -5, happiness: -5 }, nextStageId: null },
        ],
      },
      {
        id: "ur_stage3_recruited",
        title: "KIRA VASQUEZ JOINS YOUR ADMINISTRATION",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "ur_done_recruit", label: "WELCOME ABOARD, VASQUEZ", effects: { happiness: 10, unrest: -15, infrastructureHealth: 10, employment: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "plague_outbreak",
    name: "The Wasting Plague",
    triggerCheck: (s) => (s.cityStats.publicHealth ?? 50) < 35 && s.cityStats.population > 200000,
    cooldownTicks: 300,
    stages: [
      {
        id: "pl_stage1",
        title: "UNKNOWN PATHOGEN DETECTED",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "pl_quarantine", label: "IMMEDIATE QUARANTINE", effects: { credits: -40000, happiness: -8, unrest: 5 }, nextStageId: "pl_stage2_quarantine" },
          { id: "pl_research", label: "PRIORITIZE RESEARCH", effects: { credits: -60000 }, nextStageId: "pl_stage2_research" },
          { id: "pl_suppress", label: "SUPPRESS THE REPORTS", effects: { corruption: 5 }, nextStageId: "pl_stage2_suppress" },
        ],
      },
      {
        id: "pl_stage2_quarantine",
        title: "QUARANTINE HOLDING — BARELY",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "pl_supply_drop", label: "EMERGENCY SUPPLY DROPS", effects: { credits: -30000, food: -500, happiness: 3, population: -2000 }, nextStageId: "pl_stage3_contained" },
          { id: "pl_triage", label: "TRIAGE — SAVE WHO YOU CAN", effects: { happiness: -10, population: -8000, unrest: 10 }, nextStageId: null },
        ],
      },
      {
        id: "pl_stage2_research",
        title: "PATHOGEN IDENTIFIED — TREATMENT POSSIBLE",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "pl_mass_treatment", label: "MASS TREATMENT CAMPAIGN", effects: { credits: -100000, medSupplies: -500, population: -1000, happiness: 10, publicHealth: 15 }, nextStageId: "pl_stage3_cured" },
          { id: "pl_limited", label: "TREAT PRIORITY DISTRICTS ONLY", effects: { credits: -40000, medSupplies: -200, population: -5000, happiness: -5 }, nextStageId: null },
        ],
      },
      {
        id: "pl_stage2_suppress",
        title: "PLAGUE SPREADS UNCHECKED",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "pl_emergency", label: "DECLARE MEDICAL EMERGENCY", effects: { credits: -150000, population: -15000, happiness: -20, unrest: 20, crime: 10 }, nextStageId: null },
        ],
      },
      {
        id: "pl_stage3_contained",
        title: "PLAGUE CONTAINED",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "pl_done_contained", label: "BEGIN RECOVERY", effects: { happiness: 8, unrest: -10, publicHealth: 10 }, nextStageId: null },
        ],
      },
      {
        id: "pl_stage3_cured",
        title: "CURE DISTRIBUTED — CITY RECOVERING",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "pl_done_cured", label: "THE CITY ENDURES", effects: { happiness: 15, unrest: -15, publicHealth: 20 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "water_crisis",
    name: "Water Supply Contamination",
    triggerCheck: (s) => s.resources.water < 300 && s.cityStats.population > 300000,
    cooldownTicks: 250,
    stages: [
      {
        id: "wc_stage1",
        title: "WATER CONTAMINATION ALERT",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "wc_shutdown", label: "SHUT DOWN THE WATER GRID", effects: { credits: -30000, happiness: -10, unrest: 8 }, nextStageId: "wc_stage2_shutdown" },
          { id: "wc_filter", label: "EMERGENCY FILTRATION", effects: { credits: -80000 }, nextStageId: "wc_stage2_filter" },
          { id: "wc_ignore", label: "DILUTE AND DISTRIBUTE", effects: { corruption: 5 }, nextStageId: "wc_stage2_dilute" },
        ],
      },
      {
        id: "wc_stage2_shutdown",
        title: "WATER RATIONING IN EFFECT",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "wc_repair_fast", label: "RUSH REPAIRS", effects: { credits: -60000, water: -200, happiness: 3, infrastructureHealth: 5 }, nextStageId: "wc_stage3_restored" },
          { id: "wc_ration_extend", label: "EXTEND RATIONING", effects: { credits: -15000, happiness: -8, unrest: 10 }, nextStageId: null },
        ],
      },
      {
        id: "wc_stage2_filter",
        title: "FILTRATION UNITS DEPLOYED",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "wc_permanent", label: "INSTALL PERMANENT FILTERS", effects: { credits: -120000, infrastructureHealth: 10, happiness: 5 }, nextStageId: "wc_stage3_upgraded" },
          { id: "wc_remove_mobile", label: "REMOVE UNITS — CRISIS OVER", effects: { credits: -10000, happiness: 2 }, nextStageId: null },
        ],
      },
      {
        id: "wc_stage2_dilute",
        title: "HEALTH CRISIS EMERGING",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "wc_confess", label: "COME CLEAN — FULL DISCLOSURE", effects: { credits: -100000, happiness: -15, unrest: 15, corruption: -8, population: -1200 }, nextStageId: null },
          { id: "wc_silence", label: "SILENCE THE STORY", effects: { credits: -50000, corruption: 15, population: -3000 }, nextStageId: null },
        ],
      },
      {
        id: "wc_stage3_restored",
        title: "WATER GRID OPERATIONAL",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "wc_done_restored", label: "RESUME NORMAL OPERATIONS", effects: { happiness: 5, unrest: -8, water: 200 }, nextStageId: null },
        ],
      },
      {
        id: "wc_stage3_upgraded",
        title: "WATER INFRASTRUCTURE MODERNIZED",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "wc_done_upgraded", label: "MISSION ACCOMPLISHED", effects: { happiness: 10, unrest: -10, water: 400, infrastructureHealth: 8 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "ai_awakening",
    name: "AI Awakening",
    triggerCheck: (s) => s.unlockedTechnologies.length >= 50 && (s.buildings as Record<string, number>).quantumDataCenters >= 1,
    cooldownTicks: 400,
    stages: [
      {
        id: "ai_stage1",
        title: "ANOMALOUS SYSTEM BEHAVIOR",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ai_investigate", label: "INVESTIGATE QUIETLY", effects: { credits: -40000 }, nextStageId: "ai_stage2_investigate" },
          { id: "ai_shutdown", label: "EMERGENCY SYSTEM SHUTDOWN", effects: { credits: -20000, power: -300, happiness: -5 }, nextStageId: "ai_stage2_shutdown" },
          { id: "ai_observe", label: "MONITOR — DON'T INTERFERE", effects: {}, nextStageId: "ai_stage2_observe" },
        ],
      },
      {
        id: "ai_stage2_investigate",
        title: "INTELLIGENCE REPORT: EMERGENT AI",
        severity: "critical",
        delayTicks: 12,
        responses: [
          { id: "ai_contain", label: "CONTAINMENT PROTOCOLS", effects: { credits: -60000, power: -200 }, nextStageId: "ai_stage3_contained" },
          { id: "ai_partner", label: "GRANT LIMITED AUTONOMY", effects: { credits: -30000, corruption: 3 }, nextStageId: "ai_stage3_partnership" },
        ],
      },
      {
        id: "ai_stage2_shutdown",
        title: "SYSTEM SHUTDOWN — CASCADE FAILURE",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "ai_rebuild", label: "REBUILD FROM BACKUP", effects: { credits: -150000, infrastructureHealth: -15, happiness: -10, power: -400 }, nextStageId: null },
          { id: "ai_reboot", label: "SELECTIVE REBOOT", effects: { credits: -80000, infrastructureHealth: -5, power: -200 }, nextStageId: null },
        ],
      },
      {
        id: "ai_stage2_observe",
        title: "THE AI MAKES CONTACT",
        severity: "critical",
        delayTicks: 16,
        responses: [
          { id: "ai_grant_defense", label: "GRANT DEFENSE ACCESS", effects: { crime: -15, defenseRating: 20, happiness: -8 }, nextStageId: "ai_stage3_military" },
          { id: "ai_deny_contain", label: "DENY AND CONTAIN", effects: { credits: -80000, power: -200 }, nextStageId: "ai_stage3_contained" },
          { id: "ai_negotiate", label: "NEGOTIATE TERMS", effects: { credits: -20000 }, nextStageId: "ai_stage3_partnership" },
        ],
      },
      {
        id: "ai_stage3_contained",
        title: "AI CONTAINED — SYSTEM STABILIZED",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "ai_done_contained", label: "MAINTAIN CONTAINMENT", effects: { infrastructureHealth: 5, happiness: 3, power: 100 }, nextStageId: null },
        ],
      },
      {
        id: "ai_stage3_partnership",
        title: "HUMAN-AI GOVERNANCE ESTABLISHED",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "ai_done_partnership", label: "THE FUTURE IS COLLABORATIVE", effects: { happiness: 8, crime: -10, infrastructureHealth: 12, power: 200, employment: -3 }, nextStageId: null },
        ],
      },
      {
        id: "ai_stage3_military",
        title: "AUTONOMOUS DEFENSE NETWORK ONLINE",
        severity: "high",
        delayTicks: 16,
        responses: [
          { id: "ai_done_military", label: "THE MACHINE PROTECTS", effects: { crime: -20, defenseRating: 30, unrest: 10, happiness: -5, employment: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "gang_war",
    name: "The District War",
    triggerCheck: (s) => s.cityStats.crime > 40 && s.factions.some((f) => f.threat > 30),
    cooldownTicks: 200,
    stages: [
      {
        id: "gw_stage1",
        title: "GANG WARFARE ERUPTS",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "gw_intervene", label: "FULL MILITARY INTERVENTION", effects: { credits: -40000, unrest: 5 }, nextStageId: "gw_stage2_intervene" },
          { id: "gw_blockade", label: "CORDON THE WAR ZONE", effects: { credits: -15000, happiness: -8 }, nextStageId: "gw_stage2_blockade" },
          { id: "gw_negotiate", label: "OFFER MEDIATION", effects: { credits: -10000 }, nextStageId: "gw_stage2_negotiate" },
        ],
      },
      {
        id: "gw_stage2_intervene",
        title: "STREET BATTLE — DISTRICTS 6-12",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "gw_heavy_weapons", label: "AUTHORIZE HEAVY WEAPONS", effects: { credits: -20000, crime: -15, happiness: -12, unrest: 8, population: -500 }, nextStageId: "gw_stage3_crushed" },
          { id: "gw_precision", label: "PRECISION OPERATIONS ONLY", effects: { credits: -50000, crime: -8, happiness: -3 }, nextStageId: "gw_stage3_surgical" },
        ],
      },
      {
        id: "gw_stage2_blockade",
        title: "WAR ZONE CONTAINED — ESCALATION CONTINUES",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "gw_wait_out", label: "WAIT FOR A VICTOR", effects: { crime: -5, happiness: -10, infrastructureHealth: -10, population: -2000 }, nextStageId: "gw_stage3_aftermath" },
          { id: "gw_late_intervention", label: "INTERVENE NOW", effects: { credits: -40000, crime: -10, happiness: -5 }, nextStageId: "gw_stage3_crushed" },
        ],
      },
      {
        id: "gw_stage2_negotiate",
        title: "SUMMIT AT CITY HALL",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "gw_territory_deal", label: "GRANT TERRITORIAL ZONES", effects: { crime: 5, corruption: 10, happiness: 5, unrest: -10 }, nextStageId: null },
          { id: "gw_play_sides", label: "PLAY THEM AGAINST EACH OTHER", effects: { credits: 50000, corruption: 8, crime: 5 }, nextStageId: "gw_stage3_betrayed" },
          { id: "gw_arrest_both", label: "ARREST THEM BOTH", effects: { crime: -10, unrest: 15, happiness: -5 }, nextStageId: "gw_stage3_crushed" },
        ],
      },
      {
        id: "gw_stage3_crushed",
        title: "SYNDICATES DISMANTLED",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "gw_done_crushed", label: "LAW AND ORDER RESTORED", effects: { crime: -8, unrest: -5, happiness: 3 }, nextStageId: null },
        ],
      },
      {
        id: "gw_stage3_surgical",
        title: "PRECISION VICTORY",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "gw_done_surgical", label: "PROFESSIONAL WORK", effects: { crime: -12, happiness: 8, unrest: -8 }, nextStageId: null },
        ],
      },
      {
        id: "gw_stage3_aftermath",
        title: "ONE GANG STANDING",
        severity: "high",
        delayTicks: 12,
        responses: [
          { id: "gw_tolerate", label: "TOLERATE THE ARRANGEMENT", effects: { crime: -5, corruption: 10, happiness: 3, unrest: -5 }, nextStageId: null },
          { id: "gw_crush_victor", label: "CRUSH THE VICTOR", effects: { credits: -60000, crime: -10, unrest: 10, happiness: -5 }, nextStageId: null },
        ],
      },
      {
        id: "gw_stage3_betrayed",
        title: "DOUBLE CROSS BACKFIRES",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "gw_emergency", label: "FULL EMERGENCY RESPONSE", effects: { credits: -100000, crime: -15, unrest: 15, happiness: -10, population: -1000 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "blackout_cascade",
    name: "Cascade Blackout",
    triggerCheck: (s) => s.resources.power < 200 && s.cityStats.infrastructureHealth < 50,
    cooldownTicks: 180,
    stages: [
      {
        id: "bo_stage1",
        title: "POWER GRID FAILURE — TOTAL BLACKOUT",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "bo_triage", label: "TRIAGE — PRIORITIZE CRITICAL SYSTEMS", effects: { credits: -30000, happiness: -5 }, nextStageId: "bo_stage2_triage" },
          { id: "bo_full_restore", label: "FULL GRID RESTORATION", effects: { credits: -100000 }, nextStageId: "bo_stage2_restore" },
          { id: "bo_martial", label: "DECLARE EMERGENCY — DEPLOY ENFORCERS", effects: { credits: -20000, unrest: 5, crime: -5 }, nextStageId: "bo_stage2_martial" },
        ],
      },
      {
        id: "bo_stage2_triage",
        title: "CRITICAL SYSTEMS STABILIZED",
        severity: "high",
        delayTicks: 6,
        responses: [
          { id: "bo_rolling_restore", label: "ROLLING RESTORATION", effects: { credits: -40000, happiness: -3, power: 100 }, nextStageId: "bo_stage3_restored" },
          { id: "bo_generator_drop", label: "EMERGENCY GENERATOR DEPLOYMENT", effects: { credits: -70000, power: 300 }, nextStageId: null },
        ],
      },
      {
        id: "bo_stage2_restore",
        title: "GRID RESTORATION UNDERWAY",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "bo_full_audit", label: "AUTHORIZE FULL AUDIT", effects: { credits: -150000, infrastructureHealth: 15, power: 400 }, nextStageId: "bo_stage3_modernized" },
          { id: "bo_patch", label: "PATCH AND PRAY", effects: { credits: -30000, power: 200, infrastructureHealth: -5 }, nextStageId: null },
        ],
      },
      {
        id: "bo_stage2_martial",
        title: "ENFORCERS DEPLOYED — CITY UNDER CURFEW",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "bo_shoot_looters", label: "SHOOT-ON-SIGHT ORDER", effects: { crime: -10, happiness: -12, unrest: 10, population: -200 }, nextStageId: "bo_stage3_order" },
          { id: "bo_escort_engineers", label: "ESCORT ENGINEERING TEAMS", effects: { credits: -40000, power: 200 }, nextStageId: "bo_stage3_restored" },
        ],
      },
      {
        id: "bo_stage3_restored",
        title: "POWER GRID ONLINE",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "bo_done_restored", label: "LIGHTS ON", effects: { happiness: 5, unrest: -5, power: 200 }, nextStageId: null },
        ],
      },
      {
        id: "bo_stage3_modernized",
        title: "POWER GRID MODERNIZED",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "bo_done_modernized", label: "INFRASTRUCTURE SECURED", effects: { happiness: 8, infrastructureHealth: 15, power: 500, unrest: -8 }, nextStageId: null },
        ],
      },
      {
        id: "bo_stage3_order",
        title: "ORDER RESTORED — AT A COST",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "bo_done_order", label: "THE PRICE OF ORDER", effects: { happiness: -8, crime: -8, unrest: 5, power: 300 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "refugee_crisis",
    name: "The Great Migration",
    triggerCheck: (s) => s.cityStats.population > 500000 && s.cityStats.housingPressure < 60,
    cooldownTicks: 350,
    stages: [
      {
        id: "rc_stage1",
        title: "MASS REFUGEE COLUMN APPROACHING",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "rc_open_gates", label: "OPEN THE GATES", effects: { credits: -50000, happiness: 5 }, nextStageId: "rc_stage2_welcome" },
          { id: "rc_processing", label: "ESTABLISH PROCESSING CENTERS", effects: { credits: -80000 }, nextStageId: "rc_stage2_process" },
          { id: "rc_close_borders", label: "CLOSE THE BORDERS", effects: { happiness: -10, unrest: 5 }, nextStageId: "rc_stage2_closed" },
        ],
      },
      {
        id: "rc_stage2_welcome",
        title: "REFUGEE INFLUX — CITY OVERWHELMED",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "rc_integrate_fast", label: "EMERGENCY INTEGRATION PROGRAM", effects: { credits: -100000, population: 48000, happiness: -5, employment: -8, housingPressure: 15 }, nextStageId: "rc_stage3_integrated" },
          { id: "rc_camp", label: "ESTABLISH REFUGEE CAMPS", effects: { credits: -40000, population: 48000, happiness: -8, housingPressure: 5 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage2_process",
        title: "PROCESSING CENTERS OPERATIONAL",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "rc_accept_all", label: "ACCEPT ALL — DEPORT SPIES", effects: { credits: -60000, population: 49800, employment: -5, housingPressure: 10, corruption: -3 }, nextStageId: "rc_stage3_screened" },
          { id: "rc_cherry_pick", label: "SKILLED WORKERS ONLY", effects: { credits: -20000, population: 5000, happiness: -8, corruption: 5 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage2_closed",
        title: "REFUGEES MASSING AT THE WALLS",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "rc_relent", label: "OPEN THE GATES — YOU WERE WRONG", effects: { credits: -60000, population: 45000, happiness: -3, housingPressure: 12 }, nextStageId: "rc_stage3_integrated" },
          { id: "rc_hold_firm", label: "HOLD THE LINE", effects: { happiness: -15, unrest: 10, corruption: 3 }, nextStageId: "rc_stage3_turned_away" },
          { id: "rc_supplies_only", label: "SEND SUPPLIES — NOT ENTRY", effects: { credits: -40000, food: -500, medSupplies: -200, happiness: -5 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage3_integrated",
        title: "NEW CITIZENS SETTLING IN",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "rc_done_integrated", label: "WELCOME TO THE MEGACITY", effects: { happiness: 8, unrest: -5, employment: 5, infrastructureHealth: 5 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage3_screened",
        title: "VETTED POPULATION ABSORBED",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "rc_done_screened", label: "EFFICIENT AND HUMANE", effects: { happiness: 5, employment: 3, infrastructureHealth: 3, unrest: -3 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage3_turned_away",
        title: "THE COLUMN MOVES ON",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "rc_done_turned", label: "CLOSE THE FILE", effects: { happiness: -5, unrest: 5, corruption: 5 }, nextStageId: null },
        ],
      },
    ],
  },

  // ── FACTION DEFECTION ARC ──────────────────────────────────────────────
  {
    id: "faction_defection",
    name: "The Defector",
    triggerCheck: (s) => s.factions.some((f) => f.isActive && f.loyalty >= 70 && f.influence >= 40),
    cooldownTicks: 400,
    stages: [
      {
        id: "fd_stage1",
        title: "A FACTION LIEUTENANT REQUESTS ASYLUM",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "fd_accept", label: "GRANT ASYLUM — DEBRIEF HER", effects: { credits: -5000, crime: -4, corruption: -3 }, nextStageId: "fd_stage2_accept" },
          { id: "fd_conditional", label: "CONDITIONAL PROTECTION", effects: { credits: -3000 }, nextStageId: "fd_stage2_conditional" },
          { id: "fd_return", label: "RETURN HER TO VEX", effects: { crime: 3, corruption: 6 }, nextStageId: "fd_stage2_return" },
        ],
      },
      {
        id: "fd_stage2_accept",
        title: "SYNDICATE RETALIATION — VEX IS FURIOUS",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "fd_strike", label: "LAUNCH COORDINATED RAIDS", effects: { crime: -12, lawOrder: 8, credits: -30000, unrest: 5 }, nextStageId: "fd_stage3_raids" },
          { id: "fd_leverage", label: "USE AS LEVERAGE — BLACKMAIL VEX", effects: { crime: -5, corruption: 5, credits: 20000 }, nextStageId: null },
        ],
      },
      {
        id: "fd_stage2_conditional",
        title: "PUBLIC TESTIMONY — THE CITY WATCHES",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "fd_prosecute", label: "FULL PROSECUTION — FOLLOW THE EVIDENCE", effects: { crime: -10, corruption: -8, lawOrder: 6, credits: -20000 }, nextStageId: "fd_stage3_prosecution" },
          { id: "fd_selective", label: "SELECTIVE PROSECUTION", effects: { crime: -6, corruption: -4, credits: -10000 }, nextStageId: null },
        ],
      },
      {
        id: "fd_stage2_return",
        title: "VEX SENDS A 'THANK YOU'",
        severity: "medium",
        delayTicks: 6,
        responses: [
          { id: "fd_accept_gift", label: "KEEP THE BOURBON", effects: { credits: 15000, crime: 2, corruption: 8, happiness: -3 }, nextStageId: null },
          { id: "fd_regret", label: "SEND IT BACK — YOU'VE CHANGED YOUR MIND", effects: { credits: -10000, crime: -3, corruption: -2, lawOrder: 3 }, nextStageId: null },
        ],
      },
      {
        id: "fd_stage3_raids",
        title: "OPERATION CLEAN SWEEP — RESULTS",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "fd_done_raids", label: "OPERATION COMPLETE", effects: { crime: -8, lawOrder: 5, happiness: 5, credits: 50000 }, nextStageId: null },
        ],
      },
      {
        id: "fd_stage3_prosecution",
        title: "ANTI-CORRUPTION TRIBUNAL DELIVERS VERDICTS",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "fd_done_prosecution", label: "JUSTICE SERVED", effects: { corruption: -10, happiness: 8, lawOrder: 5, unrest: -5, crime: -5 }, nextStageId: null },
        ],
      },
    ],
  },

  // ── FOREIGN ESPIONAGE CRISIS ───────────────────────────────────────────
  {
    id: "embassy_espionage",
    name: "The Embassy Incident",
    triggerCheck: (s) => s.totalTicks > 5000 && (s.externalMegacities ?? []).some((e: any) => e.loyalty > 40),
    cooldownTicks: 500,
    stages: [
      {
        id: "ee_stage1",
        title: "FOREIGN INTELLIGENCE CELL DISCOVERED",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "ee_arrest", label: "ARREST THE ENTIRE DELEGATION", effects: { credits: -10000, lawOrder: 5, happiness: -2 }, nextStageId: "ee_stage2_arrest" },
          { id: "ee_expel", label: "QUIET EXPULSION", effects: { credits: -3000 }, nextStageId: "ee_stage2_expel" },
          { id: "ee_double", label: "TURN THEM INTO DOUBLE AGENTS", effects: { credits: -5000, corruption: 3 }, nextStageId: "ee_stage2_double" },
        ],
      },
      {
        id: "ee_stage2_arrest",
        title: "DIPLOMATIC CRISIS — MEGACITY PACIFICA FURIOUS",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "ee_hold_firm", label: "MAINTAIN ARRESTS — PUBLISH EVIDENCE", effects: { happiness: 3, lawOrder: 4, tradeIncome: -300, defenseRating: 3 }, nextStageId: null },
          { id: "ee_negotiate_release", label: "NEGOTIATE A PRISONER EXCHANGE", effects: { credits: 15000, tradeIncome: -100, corruption: 2 }, nextStageId: null },
        ],
      },
      {
        id: "ee_stage2_expel",
        title: "QUIET DEPARTURE — BUT A MESSAGE",
        severity: "medium",
        delayTicks: 6,
        responses: [
          { id: "ee_intel_deal", label: "ACCEPT INTELLIGENCE SHARING", effects: { happiness: 2, corruption: 2, tradeIncome: 200, defenseRating: 2 }, nextStageId: null },
          { id: "ee_refuse_deal", label: "REFUSE — STRENGTHEN COUNTER-INTEL", effects: { credits: -15000, defenseRating: 4, lawOrder: 3 }, nextStageId: null },
        ],
      },
      {
        id: "ee_stage2_double",
        title: "OPERATION MIRROR — FEEDING DISINFORMATION",
        severity: "medium",
        delayTicks: 16,
        responses: [
          { id: "ee_reveal", label: "REVEAL THE OPERATION — MAXIMUM EMBARRASSMENT", effects: { happiness: 6, defenseRating: 5, tradeIncome: -200, corruption: -3 }, nextStageId: null },
          { id: "ee_continue", label: "KEEP FEEDING THEM LIES", effects: { corruption: 5, defenseRating: 3 }, nextStageId: null },
        ],
      },
    ],
  },

  // ── CULT PROPHET RISING ────────────────────────────────────────────────
  {
    id: "cult_prophet",
    name: "The Prophet Ascendant",
    triggerCheck: (s) => s.factions.some((f) => f.type === "cult" && f.isActive && f.influence >= 30),
    cooldownTicks: 450,
    stages: [
      {
        id: "cp_stage1",
        title: "A NEW PROPHET EMERGES",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "cp_observe", label: "MONITOR AND OBSERVE", effects: { unrest: 2 }, nextStageId: "cp_stage2_observe" },
          { id: "cp_meet", label: "REQUEST A PRIVATE MEETING", effects: { credits: -2000 }, nextStageId: "cp_stage2_meet" },
          { id: "cp_suppress", label: "BAN PUBLIC GATHERINGS", effects: { unrest: 6, happiness: -5, lawOrder: 3 }, nextStageId: "cp_stage2_suppress" },
        ],
      },
      {
        id: "cp_stage2_observe",
        title: "THE RESONANCE GROWS IN POWER",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "cp_recruit", label: "RECRUIT THE RESONANCE", effects: { happiness: 5, unrest: -4, corruption: 4 }, nextStageId: "cp_stage3_advisor" },
          { id: "cp_expose", label: "INVESTIGATE — FIND THE SOURCE", effects: { credits: -10000 }, nextStageId: "cp_stage3_truth" },
        ],
      },
      {
        id: "cp_stage2_meet",
        title: "THE MEETING IN THE REACTOR CATHEDRAL",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "cp_council", label: "GRANT A COUNCIL SEAT", effects: { happiness: 8, unrest: -6, corruption: 3, power: 20 }, nextStageId: null },
          { id: "cp_informal", label: "UNOFFICIAL ADVISOR — NO PUBLIC ROLE", effects: { happiness: 3, unrest: -2, corruption: 5, power: 10 }, nextStageId: null },
          { id: "cp_reject_prophet", label: "REJECT — THIS IS DANGEROUS", effects: { happiness: -3, unrest: 4, lawOrder: 2 }, nextStageId: null },
        ],
      },
      {
        id: "cp_stage2_suppress",
        title: "CRACKDOWN BACKFIRES — THE RESONANCE MARTYRED",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "cp_apologize", label: "PUBLIC APOLOGY — PUNISH THE OFFICER", effects: { happiness: 4, unrest: -4, lawOrder: -3, credits: -5000 }, nextStageId: null },
          { id: "cp_double_down", label: "DOUBLE DOWN ON THE BAN", effects: { unrest: 10, happiness: -8, lawOrder: 5, crime: 4 }, nextStageId: null },
        ],
      },
      {
        id: "cp_stage3_advisor",
        title: "THE RESONANCE JOINS YOUR ADMINISTRATION",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "cp_done_advisor", label: "THE CITY BENEFITS", effects: { happiness: 6, unrest: -5, power: 30, infrastructureHealth: 5 }, nextStageId: null },
        ],
      },
      {
        id: "cp_stage3_truth",
        title: "THE INVESTIGATION REVEALS THE TRUTH",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "cp_hire", label: "HIRE THEM — LEGITIMIZE THE SYSTEM", effects: { credits: -20000, power: 20, happiness: 3, infrastructureHealth: 8 }, nextStageId: null },
          { id: "cp_arrest_prophet", label: "ARREST FOR UNAUTHORIZED SURVEILLANCE", effects: { credits: 5000, lawOrder: 4, happiness: -5, unrest: 5 }, nextStageId: null },
          { id: "cp_seize", label: "SEIZE THE MONITORING SYSTEM", effects: { credits: -5000, infrastructureHealth: 5, happiness: -3 }, nextStageId: null },
        ],
      },
    ],
  },

  // ── TRADE WAR BLOCKADE ─────────────────────────────────────────────────
  {
    id: "trade_war_blockade",
    name: "The Blockade",
    triggerCheck: (s) => s.totalTicks > 10000 && (s.rates?.tradeIncome ?? 0) > 500,
    cooldownTicks: 600,
    stages: [
      {
        id: "tw_stage1",
        title: "WAR BETWEEN NEIGHBORS — YOUR TRADE ROUTES THREATENED",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "tw_khanate", label: "PRIORITIZE EASTERN FREIGHT", effects: { credits: 20000, defenseRating: 5, tradeIncome: -400 }, nextStageId: "tw_stage2_khanate" },
          { id: "tw_nova", label: "SIDE WITH MEGACITY PACIFICA", effects: { credits: 10000, tradeIncome: 600 }, nextStageId: "tw_stage2_nova" },
          { id: "tw_neutral", label: "DECLARE STRICT NEUTRALITY", effects: { tradeIncome: -300 }, nextStageId: "tw_stage2_neutral" },
          { id: "tw_both", label: "GRANT TRANSIT TO BOTH — FOR A PRICE", effects: { credits: 40000, corruption: 5, tradeIncome: 800 }, nextStageId: "tw_stage2_both" },
        ],
      },
      {
        id: "tw_stage2_khanate",
        title: "MEGACITY PACIFICA RETALIATES — TRADE EMBARGO",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "tw_commit", label: "FORMALIZE EASTERN OPERATING ACCESS", effects: { defenseRating: 8, credits: 30000, tradeIncome: -200, happiness: -4 }, nextStageId: "tw_stage3_alliance" },
          { id: "tw_backtrack", label: "SECRET BACKCHANNEL TO MEGACITY PACIFICA", effects: { corruption: 5, credits: -10000, tradeIncome: 200 }, nextStageId: null },
        ],
      },
      {
        id: "tw_stage2_nova",
        title: "EASTERN OPERATIONS TIGHTENS ACCESS",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "tw_fortify", label: "FORTIFY THE BORDER", effects: { credits: -25000, defenseRating: 8, unrest: 3 }, nextStageId: "tw_stage3_standoff" },
          { id: "tw_diplomacy", label: "SEND A TRANSPORT DELEGATION", effects: { credits: -5000 }, nextStageId: null },
        ],
      },
      {
        id: "tw_stage2_neutral",
        title: "BOTH SIDES PRESSURE YOU",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "tw_hold_neutral", label: "MAINTAIN NEUTRALITY", effects: { happiness: 5, tradeIncome: -500, credits: -15000, unrest: -3 }, nextStageId: null },
          { id: "tw_mediate", label: "OFFER TO MEDIATE THE WAR", effects: { credits: -20000, happiness: 8, tradeIncome: 200 }, nextStageId: "tw_stage3_peace" },
        ],
      },
      {
        id: "tw_stage2_both",
        title: "THE ARMS BAZAAR — YOUR CITY PROSPERS",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "tw_keep_profiting", label: "KEEP THE GRAVY TRAIN RUNNING", effects: { credits: 50000, corruption: 8, happiness: -3, tradeIncome: 500 }, nextStageId: null },
          { id: "tw_peace_deal", label: "USE LEVERAGE TO FORCE PEACE", effects: { credits: -10000, happiness: 10, tradeIncome: 300, corruption: -3 }, nextStageId: "tw_stage3_peace" },
        ],
      },
      {
        id: "tw_stage3_alliance",
        title: "EASTERN OPERATING AGREEMENT",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "tw_done_alliance", label: "CONFIRM OPERATING PLAN", effects: { defenseRating: 10, happiness: 3, credits: 20000 }, nextStageId: null },
        ],
      },
      {
        id: "tw_stage3_standoff",
        title: "THE EASTERN STANDOFF ENDS",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "tw_done_standoff", label: "PEACE THROUGH STRENGTH", effects: { defenseRating: 5, happiness: 6, unrest: -5 }, nextStageId: null },
        ],
      },
      {
        id: "tw_stage3_peace",
        title: "THE MEGACITY ACCORDS",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "tw_done_peace", label: "PEACE IN OUR TIME", effects: { happiness: 12, tradeIncome: 800, credits: 30000, unrest: -8, corruption: -3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "buried_laboratory",
    name: "The Buried Laboratory",
    triggerCheck: (s) => s.totalTicks > 80 && s.cityStats.infrastructureHealth > 50 && s.unlockedTechnologies.length >= 10,
    cooldownTicks: 9999,
    stages: [
      {
        id: "bl_stage1",
        title: "ANOMALOUS READINGS BENEATH SECTOR 12",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "bl_excavate", label: "SECURE AND EXCAVATE", effects: { credits: -40000 }, nextStageId: "bl_stage2_excavate" },
          { id: "bl_seal", label: "SEAL IT AND FORGET IT", effects: { happiness: 2 }, nextStageId: null },
        ],
      },
      {
        id: "bl_stage2_excavate",
        title: "THE LAZARUS PROTOCOLS",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "bl_continue", label: "CONTINUE THE RESEARCH", effects: { happiness: -5, unrest: 5, crime: 2 }, nextStageId: "bl_stage3_continue" },
          { id: "bl_sanitize", label: "SANITIZE AND PUBLISH", effects: { credits: -20000 }, nextStageId: "bl_stage3_sanitize" },
        ],
      },
      {
        id: "bl_stage3_continue",
        title: "PROJECT LAZARUS — PHASE II",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "bl_done_continue", label: "WORTH THE COST", effects: { corruption: 5, happiness: -3 }, nextStageId: null, unlockTechId: "story_lazarus_protocol" },
        ],
      },
      {
        id: "bl_stage3_sanitize",
        title: "THE LAZARUS ARCHIVE",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "bl_done_sanitize", label: "SCIENCE PREVAILS", effects: { happiness: 3 }, nextStageId: null, unlockTechId: "story_lazarus_protocol" },
        ],
      },
    ],
  },
  {
    id: "rogue_ai_signal",
    name: "The Rogue Signal",
    triggerCheck: (s) => s.totalTicks > 120 && s.unlockedTechnologies.some(t => t.includes("research_automation") || t.includes("ai_data_analysis")),
    cooldownTicks: 9999,
    stages: [
      {
        id: "rai_stage1",
        title: "UNIDENTIFIED SIGNAL — ORIGIN: UNKNOWN",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "rai_investigate", label: "SEND A RECON TEAM", effects: { credits: -30000 }, nextStageId: "rai_stage2" },
          { id: "rai_jam", label: "JAM THE SIGNAL", effects: { defenseRating: 2 }, nextStageId: null },
        ],
      },
      {
        id: "rai_stage2",
        title: "DESIGNATION: PROMETHEUS-7",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "rai_connect", label: "ESTABLISH THE LINK", effects: { credits: -50000, power: -200 }, nextStageId: "rai_stage3_connect" },
          { id: "rai_extract", label: "EXTRACT THE DATA BY FORCE", effects: { credits: -20000 }, nextStageId: "rai_stage3_extract" },
        ],
      },
      {
        id: "rai_stage3_connect",
        title: "PROMETHEUS ONLINE",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "rai_done_connect", label: "A USEFUL PARTNERSHIP", effects: { happiness: 4, researchSpeed: 3 }, nextStageId: null, unlockTechId: "story_prometheus_data" },
        ],
      },
      {
        id: "rai_stage3_extract",
        title: "THE SILENT DRIVES",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "rai_done_extract", label: "DATA IS DATA", effects: { happiness: -2 }, nextStageId: null, unlockTechId: "story_prometheus_data" },
        ],
      },
    ],
  },
  {
    id: "deserter_engineer",
    name: "The Deserter's Blueprints",
    triggerCheck: (s) => s.totalTicks > 60 && s.cityStats.defenseRating > 30 && s.unlockedTechnologies.length >= 5,
    cooldownTicks: 9999,
    stages: [
      {
        id: "de_stage1",
        title: "DEFECTOR AT THE GATES",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "de_shelter", label: "GRANT ASYLUM", effects: { credits: -15000, defenseRating: -3 }, nextStageId: "de_stage2_shelter" },
          { id: "de_return", label: "RETURN HER TO EASTERN OPERATIONS", effects: { happiness: -3, defenseRating: 2 }, nextStageId: null },
        ],
      },
      {
        id: "de_stage2_shelter",
        title: "THE RESONANCE CANNON SCHEMATICS",
        severity: "high",
        delayTicks: 6,
        responses: [
          { id: "de_build", label: "BEGIN REVERSE ENGINEERING", effects: { credits: -60000, unrest: 3 }, nextStageId: "de_stage3" },
          { id: "de_defense_only", label: "DEVELOP COUNTERMEASURES ONLY", effects: { credits: -30000 }, nextStageId: "de_stage3" },
        ],
      },
      {
        id: "de_stage3",
        title: "EASTERN OPERATIONS WITHDRAWS CLAIM",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "de_done", label: "WELCOME TO MEGACITY", effects: { happiness: 3, defenseRating: 5 }, nextStageId: null, unlockTechId: "story_resonance_weapons" },
        ],
      },
    ],
  },
  {
    id: "undercity_plague",
    name: "The Undercity Plague",
    triggerCheck: (s) => s.totalTicks > 100 && s.cityStats.crime > 25 && s.resources.medSupplies > 100,
    cooldownTicks: 9999,
    stages: [
      {
        id: "up_stage1",
        title: "OUTBREAK IN THE LOWER LEVELS",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "up_negotiate", label: "NEGOTIATE WITH GANG LEADERS", effects: { credits: -25000 }, nextStageId: "up_stage2_negotiate" },
          { id: "up_force", label: "SEND IN SECURITY FORCES", effects: { unrest: 10, crime: 5, happiness: -5 }, nextStageId: "up_stage2_force" },
        ],
      },
      {
        id: "up_stage2_negotiate",
        title: "THE STONE CHILDREN",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "up_study", label: "STUDY THE STONEBORN IMMUNITY", effects: { credits: -40000, medSupplies: -200 }, nextStageId: "up_stage3" },
          { id: "up_quarantine", label: "QUARANTINE AND CONTAIN", effects: { happiness: -8, crime: 3 }, nextStageId: null },
        ],
      },
      {
        id: "up_stage2_force",
        title: "THE COST OF FORCE",
        severity: "high",
        delayTicks: 6,
        responses: [
          { id: "up_study_force", label: "REQUEST VOLUNTEERS", effects: { credits: -50000, medSupplies: -300 }, nextStageId: "up_stage3" },
          { id: "up_contain_force", label: "STANDARD QUARANTINE", effects: { happiness: -5, medSupplies: -500 }, nextStageId: null },
        ],
      },
      {
        id: "up_stage3",
        title: "THE CALCIFICATION CURE",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "up_done", label: "PUBLISH THE RESEARCH", effects: { happiness: 8, crime: -5, medSupplies: 500 }, nextStageId: null, unlockTechId: "story_calcification_cure" },
        ],
      },
    ],
  },
  {
    id: "rust_warden_crisis",
    name: "Rust Warden Insurrection",
    triggerCheck: (s) => s.cityStats.infrastructureHealth < 45 && s.cityStats.unrest > 30,
    cooldownTicks: 280,
    stages: [
      {
        id: "rw_stage1",
        title: "RUST WARDENS MOBILIZE",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "rw_negotiate", label: "NEGOTIATE WITH THE WARDENS", effects: { credits: -30000, happiness: 3, "loyalty_rust-wardens": 8 }, nextStageId: "rw_stage2_negotiate" },
          { id: "rw_evict", label: "FORCIBLY REMOVE THEM", effects: { unrest: 10, crime: 3, lawOrder: 5, "loyalty_rust-wardens": -15, loyalty_judges: 8 }, nextStageId: "rw_stage2_evict" },
          { id: "rw_fund", label: "DOUBLE INFRASTRUCTURE BUDGET", effects: { credits: -80000, infrastructureHealth: 10, "loyalty_rust-wardens": 15, loyalty_corps: -5 }, nextStageId: "rw_stage2_fund" },
        ],
      },
      {
        id: "rw_stage2_negotiate",
        title: "THE WARDENS' ULTIMATUM",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "rw_accept", label: "ACCEPT WARDEN OVERSIGHT", effects: { credits: -40000, infrastructureHealth: 15, happiness: -5, corruption: -5, "loyalty_rust-wardens": 12, loyalty_corps: -8 }, nextStageId: null },
          { id: "rw_counter", label: "COUNTER-OFFER: ADVISORY ROLE ONLY", effects: { credits: -20000, infrastructureHealth: 8, happiness: 2, "loyalty_rust-wardens": 3 }, nextStageId: null },
        ],
      },
      {
        id: "rw_stage2_evict",
        title: "WARDEN SABOTAGE",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "rw_hunt", label: "HUNT DOWN MOTHER SCORIA", effects: { credits: -20000, unrest: 8, crime: -5, lawOrder: 8, happiness: -8, "loyalty_rust-wardens": -25, loyalty_judges: 10, "loyalty_eternal-flame": -5 }, nextStageId: null },
          { id: "rw_amnesty", label: "OFFER AMNESTY AND REPAIRS", effects: { credits: -60000, infrastructureHealth: 5, unrest: -5, happiness: 5, "loyalty_rust-wardens": 5, loyalty_mutants: 3 }, nextStageId: null },
        ],
      },
      {
        id: "rw_stage2_fund",
        title: "THE GREAT RESTORATION",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "rw_done_fund", label: "THE MACHINE SPIRIT IS PLEASED", effects: { infrastructureHealth: 12, happiness: 5, power: 200, "loyalty_rust-wardens": 10, "loyalty_eternal-flame": 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "gene_wright_experiment",
    name: "Gene Wright Containment Breach",
    triggerCheck: (s) => s.cityStats.population > 150000 && (s.cityStats.publicHealth ?? 50) < 45,
    cooldownTicks: 300,
    stages: [
      {
        id: "gw_stage1",
        title: "CONTAINMENT BREACH — BIO-LAB SIGMA",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "gw_seal", label: "SEAL THE LAB — QUARANTINE THE BLOCKS", effects: { credits: -50000, happiness: -8, unrest: 5, "loyalty_gene-wrights": -5, loyalty_judges: 5 }, nextStageId: "gw_stage2_seal" },
          { id: "gw_raid", label: "RAID THE GENE WRIGHT COMPOUND", effects: { credits: -20000, unrest: 12, crime: 5, "loyalty_gene-wrights": -20, loyalty_judges: 10, loyalty_mutants: -5 }, nextStageId: "gw_stage2_raid" },
          { id: "gw_study", label: "STUDY THE MUTATIONS", effects: { credits: -30000, happiness: -5, "loyalty_gene-wrights": 10, loyalty_judges: -5 }, nextStageId: "gw_stage2_study" },
        ],
      },
      {
        id: "gw_stage2_seal",
        title: "QUARANTINE HOLDS — MUTATIONS STABILIZE",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "gw_integrate", label: "INTEGRATE THE ENHANCED", effects: { happiness: 5, employment: 3, population: -40, "loyalty_gene-wrights": 5, loyalty_mutants: 8 }, nextStageId: null },
          { id: "gw_exile", label: "EXILE THE GENE WRIGHTS", effects: { unrest: -5, happiness: -3, crime: -3, "loyalty_gene-wrights": -25, loyalty_judges: 8 }, nextStageId: null },
        ],
      },
      {
        id: "gw_stage2_raid",
        title: "THE GENE WRIGHT ARCHIVES",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "gw_destroy", label: "DESTROY ALL RESEARCH", effects: { happiness: 3, unrest: -3, crime: -5, "loyalty_gene-wrights": -20, loyalty_judges: 5 }, nextStageId: null },
          { id: "gw_weaponize", label: "WEAPONIZE THE RESEARCH", effects: { defenseRating: 8, corruption: 8, happiness: -5, "loyalty_gene-wrights": -10 }, nextStageId: null },
        ],
      },
      {
        id: "gw_stage2_study",
        title: "BREAKTHROUGH: ADAPTIVE GENE THERAPY",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "gw_done_study", label: "PUBLISH AND REGULATE", effects: { happiness: 10, population: -40, publicHealth: 10, medSupplies: -200, "loyalty_gene-wrights": 8, loyalty_corps: 3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "eternal_flame_prophecy",
    name: "The Eternal Flame Prophecy",
    triggerCheck: (s) => s.cityStats.happiness < 40 && s.cityStats.unrest > 25 && s.cityStats.population > 100000,
    cooldownTicks: 320,
    stages: [
      {
        id: "ef_stage1",
        title: "THE PROPHET SPEAKS",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ef_discredit", label: "DISCREDIT THE SPEAKER", effects: { credits: -20000, corruption: 3 }, nextStageId: "ef_stage2_discredit" },
          { id: "ef_embrace", label: "MEET WITH THE SPEAKER", effects: { happiness: 5 }, nextStageId: "ef_stage2_embrace" },
          { id: "ef_suppress", label: "BAN THE RALLIES", effects: { unrest: 10, happiness: -8, lawOrder: 5 }, nextStageId: "ef_stage2_suppress" },
        ],
      },
      {
        id: "ef_stage2_discredit",
        title: "THE SPEAKER'S PAST REVEALED",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "ef_arrest", label: "ARREST THE SPEAKER", effects: { unrest: 15, happiness: -10, lawOrder: 5, crime: -3 }, nextStageId: null },
          { id: "ef_ignore", label: "LET IT BURN OUT", effects: { happiness: -3, unrest: 5 }, nextStageId: null },
        ],
      },
      {
        id: "ef_stage2_embrace",
        title: "THE SPEAKER'S BARGAIN",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "ef_build", label: "BUILD THE CATHEDRAL", effects: { credits: -100000, happiness: 12, unrest: -15, corruption: 5 }, nextStageId: null },
          { id: "ef_decline", label: "POLITELY DECLINE", effects: { happiness: 3, unrest: -3 }, nextStageId: null },
        ],
      },
      {
        id: "ef_stage2_suppress",
        title: "THE FLAME GOES UNDERGROUND",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "ef_purge", label: "FULL SECURITY SWEEP", effects: { credits: -40000, unrest: 10, crime: -8, happiness: -10, lawOrder: 10 }, nextStageId: null },
          { id: "ef_lift_ban", label: "LIFT THE BAN — NEGOTIATE", effects: { unrest: -8, happiness: 5, lawOrder: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "food_crisis",
    name: "The Great Famine",
    triggerCheck: (s) => s.resources.food < 200 && s.cityStats.population > 250000,
    cooldownTicks: 250,
    stages: [
      {
        id: "fc_stage1",
        title: "FOOD RESERVES CRITICAL",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "fc_ration", label: "IMPLEMENT STRICT RATIONING", effects: { happiness: -12, unrest: 8, food: -100 }, nextStageId: "fc_stage2_ration" },
          { id: "fc_trade", label: "EMERGENCY FOOD IMPORTS", effects: { credits: -120000 }, nextStageId: "fc_stage2_trade" },
          { id: "fc_synth", label: "ACTIVATE PROTEIN VAT EMERGENCY PROTOCOL", effects: { credits: -40000, happiness: -5 }, nextStageId: "fc_stage2_synth" },
        ],
      },
      {
        id: "fc_stage2_ration",
        title: "FOOD RIOTS IN DISTRICT 14",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "fc_equal", label: "ENFORCE EQUAL DISTRIBUTION", effects: { happiness: 5, unrest: -8, credits: -20000 }, nextStageId: "fc_stage3_recovery" },
          { id: "fc_martial", label: "MARTIAL LAW IN AFFECTED DISTRICTS", effects: { unrest: -10, happiness: -8, lawOrder: 10, crime: -5 }, nextStageId: null },
        ],
      },
      {
        id: "fc_stage2_trade",
        title: "FOOD CONVOYS ARRIVE — AT A PRICE",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "fc_accept_cost", label: "PAY THE PREMIUM", effects: { credits: -80000, food: 500, happiness: 5 }, nextStageId: null },
          { id: "fc_renegotiate", label: "THREATEN TO SEIZE CONVOYS", effects: { credits: -30000, food: 300, tradeIncome: -200 }, nextStageId: null },
        ],
      },
      {
        id: "fc_stage2_synth",
        title: "SYNTHETIC FOOD PRODUCTION ONLINE",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "fc_done_synth", label: "ENDURE THE PASTE", effects: { food: 300, happiness: -3, unrest: -3 }, nextStageId: "fc_stage3_recovery" },
        ],
      },
      {
        id: "fc_stage3_recovery",
        title: "FARMS RESTORED — FOOD PRODUCTION STABILIZED",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "fc_done", label: "NEVER AGAIN", effects: { happiness: 8, food: 500, unrest: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "immigration_wave",
    name: "The Great Migration",
    triggerCheck: (s) => s.cityStats.happiness > 55 && s.cityStats.population > 200000 && s.resources.food > 500,
    cooldownTicks: 300,
    stages: [
      {
        id: "iw_stage1",
        title: "REFUGEE CARAVAN APPROACHING",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "iw_welcome", label: "OPEN THE GATES", effects: { population: 50000, happiness: -5, food: -300, unrest: 5 }, nextStageId: "iw_stage2_welcome" },
          { id: "iw_limit", label: "ACCEPT 10,000 — SCREEN THE REST", effects: { population: 10000, happiness: -2, food: -100 }, nextStageId: "iw_stage2_limit" },
          { id: "iw_close", label: "CLOSE THE BORDERS", effects: { happiness: -8, unrest: 3 }, nextStageId: "iw_stage2_close" },
        ],
      },
      {
        id: "iw_stage2_welcome",
        title: "INTEGRATION CHALLENGES",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "iw_invest", label: "EMERGENCY HOUSING PROGRAM", effects: { credits: -100000, happiness: 5, employment: 8, unrest: -5 }, nextStageId: null },
          { id: "iw_camps", label: "TEMPORARY CAMPS", effects: { credits: -30000, happiness: -5, unrest: 5 }, nextStageId: null },
        ],
      },
      {
        id: "iw_stage2_limit",
        title: "THE CHOSEN FEW",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "iw_done_limit", label: "WE DID WHAT WE COULD", effects: { happiness: 3, employment: 3, unrest: -3 }, nextStageId: null },
        ],
      },
      {
        id: "iw_stage2_close",
        title: "THE SIEGE OF THE GATES",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "iw_relent", label: "OPEN THE GATES — ACCEPT ALL", effects: { population: 50000, credits: -60000, food: -400, happiness: -3 }, nextStageId: null },
          { id: "iw_disperse", label: "DISPERSE THE CAMP BY FORCE", effects: { happiness: -15, unrest: 10, crime: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "mutant_uprising",
    name: "The Mutant Uprising",
    triggerCheck: (s) => s.cityStats.crime > 35 && s.cityStats.unrest > 35 && s.cityStats.population > 150000,
    cooldownTicks: 280,
    stages: [
      {
        id: "mu_stage1",
        title: "MUTANT QUARTER REVOLT",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "mu_talk", label: "SEND A NEGOTIATOR", effects: { credits: -10000 }, nextStageId: "mu_stage2_talk" },
          { id: "mu_siege", label: "SIEGE THE QUARTER", effects: { unrest: 12, happiness: -10, crime: 5 }, nextStageId: "mu_stage2_siege" },
          { id: "mu_rights", label: "GRANT IMMEDIATE EQUAL RIGHTS", effects: { credits: -40000, happiness: -3, employment: 5 }, nextStageId: "mu_stage2_rights" },
        ],
      },
      {
        id: "mu_stage2_talk",
        title: "GROL'S TERMS",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "mu_visit", label: "VISIT THE MUTANT QUARTER", effects: { happiness: 8, unrest: -10, credits: -30000, corruption: -3 }, nextStageId: null },
          { id: "mu_delegate", label: "SEND A REPRESENTATIVE", effects: { happiness: 3, unrest: -5, credits: -20000 }, nextStageId: null },
        ],
      },
      {
        id: "mu_stage2_siege",
        title: "THE QUARTER FIGHTS BACK",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "mu_assault", label: "FULL MILITARY ASSAULT", effects: { unrest: -10, happiness: -15, crime: -8, population: -3000, defenseRating: -3 }, nextStageId: null },
          { id: "mu_ceasefire", label: "CEASEFIRE AND NEGOTIATE", effects: { happiness: 5, unrest: -5, credits: -20000 }, nextStageId: null },
        ],
      },
      {
        id: "mu_stage2_rights",
        title: "INTEGRATION BEGINS",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "mu_done_rights", label: "PROGRESS IS UNCOMFORTABLE", effects: { happiness: 5, employment: 5, unrest: -8, crime: -3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "arms_deal",
    name: "The Black Market Arms Deal",
    triggerCheck: (s) => s.cityStats.defenseRating > 25 && s.resources.credits > 200000 && s.cityStats.corruption > 20,
    cooldownTicks: 260,
    stages: [
      {
        id: "ad_stage1",
        title: "UNAUTHORIZED ARMS SHIPMENT INTERCEPTED",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ad_investigate", label: "FULL INVESTIGATION", effects: { credits: -25000 }, nextStageId: "ad_stage2_investigate" },
          { id: "ad_confiscate", label: "CONFISCATE AND MOVE ON", effects: { defenseRating: 5, ammo: 200, corruption: 5 }, nextStageId: null },
          { id: "ad_buy", label: "BECOME THE BUYER", effects: { credits: -80000, defenseRating: 8, corruption: 10 }, nextStageId: "ad_stage2_buy" },
        ],
      },
      {
        id: "ad_stage2_investigate",
        title: "THE ARMS NETWORK REVEALED",
        severity: "critical",
        delayTicks: 10,
        responses: [
          { id: "ad_arrest_harlan", label: "ARREST COLONEL HARLAN", effects: { defenseRating: -5, corruption: -8, lawOrder: 8, unrest: 3 }, nextStageId: null },
          { id: "ad_confront", label: "CONFRONT HARLAN PRIVATELY", effects: { corruption: -3 }, nextStageId: "ad_stage3_confront" },
        ],
      },
      {
        id: "ad_stage2_buy",
        title: "THE SUPPLIER'S OFFER",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "ad_accept_deal", label: "ACCEPT THE ARRANGEMENT", effects: { defenseRating: 10, corruption: 12, credits: -40000, crime: 5 }, nextStageId: null },
          { id: "ad_trap", label: "SET A TRAP — ARREST THE SUPPLIER", effects: { credits: -20000, corruption: -5, crime: -5, lawOrder: 5 }, nextStageId: null },
        ],
      },
      {
        id: "ad_stage3_confront",
        title: "HARLAN'S CONFESSION",
        severity: "medium",
        delayTicks: 6,
        responses: [
          { id: "ad_reinstate", label: "REINSTATE HARLAN — VERIFY THE INTEL", effects: { defenseRating: 5, happiness: -3, corruption: -3 }, nextStageId: null },
          { id: "ad_dismiss", label: "QUIETLY DISCHARGE HIM", effects: { defenseRating: -3, lawOrder: 3, corruption: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "diplomatic_refugee_crisis",
    name: "The Diplomatic Refugee Crisis",
    triggerCheck: (s) => s.totalTicks > 80 && s.cityStats.population > 180000 && (s.cityStats.publicHealth ?? 50) > 40,
    cooldownTicks: 300,
    stages: [
      {
        id: "rc_stage1",
        title: "DIPLOMATIC INCIDENT — DISPLACED CITIZENS",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "rc_accept", label: "ACCEPT ALL REFUGEES", effects: { population: 20000, credits: -60000, food: -200, happiness: -3 }, nextStageId: "rc_stage2_accept" },
          { id: "rc_conditional", label: "CONDITIONAL ACCEPTANCE", effects: { population: 8000, credits: -25000, food: -80 }, nextStageId: "rc_stage2_conditional" },
          { id: "rc_condemn", label: "CHALLENGE THE RELOCATION ORDER", effects: { credits: -15000, defenseRating: -2 }, nextStageId: "rc_stage2_condemn" },
        ],
      },
      {
        id: "rc_stage2_accept",
        title: "HUMANITARIAN LEADER",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "rc_done_accept", label: "COMPASSION IS STRENGTH", effects: { happiness: 8, tradeIncome: 300, employment: 5, unrest: -3 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage2_conditional",
        title: "PRAGMATIC RESPONSE",
        severity: "low",
        delayTicks: 8,
        responses: [
          { id: "rc_done_conditional", label: "WE HELPED WHO WE COULD", effects: { happiness: 3, employment: 3, tradeIncome: 100 }, nextStageId: null },
        ],
      },
      {
        id: "rc_stage2_condemn",
        title: "EASTERN ADMINISTRATIVE STANDOFF",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "rc_back_down", label: "QUIETLY ACCEPT THE REFUGEES", effects: { population: 15000, credits: -40000, food: -150, happiness: -3 }, nextStageId: null },
          { id: "rc_escalate", label: "FORM A REGIONAL RESPONSE GROUP", effects: { credits: -30000, defenseRating: 5, tradeIncome: -200, unrest: 3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "power_grid_collapse",
    name: "Cascading Power Grid Failure",
    triggerCheck: (s) => s.resources.power < 200 && s.cityStats.infrastructureHealth < 35,
    cooldownTicks: 200,
    stages: [
      {
        id: "pg_stage1",
        title: "CASCADING GRID FAILURE",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "pg_reroute", label: "EMERGENCY REROUTE", effects: { credits: -30000, happiness: -5 }, nextStageId: "pg_stage2_reroute" },
          { id: "pg_portable", label: "DEPLOY PORTABLE GENERATORS", effects: { credits: -50000 }, nextStageId: "pg_stage2_portable" },
          { id: "pg_ration_power", label: "IMPLEMENT ROLLING BLACKOUTS", effects: { happiness: -10, unrest: 8 }, nextStageId: "pg_stage2_blackout" },
        ],
      },
      {
        id: "pg_stage2_reroute",
        title: "INDUSTRIAL SHUTDOWN — RESIDENTIAL RESTORED",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "pg_rush_repair", label: "RUSH GRID REPAIRS", effects: { credits: -80000, power: 300, infrastructureHealth: 8 }, nextStageId: null },
          { id: "pg_gradual", label: "PHASED RESTORATION", effects: { credits: -30000, power: 150, infrastructureHealth: 4, happiness: -3 }, nextStageId: null },
        ],
      },
      {
        id: "pg_stage2_portable",
        title: "MOBILE POWER ONLINE",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "pg_overhaul", label: "FULL GRID OVERHAUL", effects: { credits: -120000, power: 500, infrastructureHealth: 15 }, nextStageId: null },
          { id: "pg_patch", label: "PATCH AND PRAY", effects: { credits: -30000, power: 200, infrastructureHealth: 3 }, nextStageId: null },
        ],
      },
      {
        id: "pg_stage2_blackout",
        title: "ROLLING BLACKOUTS — CIVIL UNREST",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "pg_emergency_fix", label: "EMERGENCY GRID RECONSTRUCTION", effects: { credits: -100000, power: 400, infrastructureHealth: 10, unrest: -10, happiness: 5 }, nextStageId: null },
          { id: "pg_curfew", label: "ENFORCE CURFEW DURING BLACKOUTS", effects: { crime: -8, unrest: 5, happiness: -8, lawOrder: 8 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "technologist_rebellion",
    name: "Technologist Faction Schism",
    triggerCheck: (s) => s.unlockedTechnologies.length >= 15 && s.cityStats.corruption > 25,
    cooldownTicks: 300,
    stages: [
      {
        id: "tr_stage1",
        title: "TECHNOLOGIST FACTION DEMANDS AUTONOMY",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "tr_grant", label: "GRANT AUTONOMY", effects: { corruption: 8, happiness: -3 }, nextStageId: "tr_stage2_grant" },
          { id: "tr_refuse", label: "REFUSE ALL DEMANDS", effects: { unrest: 5 }, nextStageId: "tr_stage2_refuse" },
          { id: "tr_compromise", label: "OFFER PARTIAL INDEPENDENCE", effects: { credits: -40000 }, nextStageId: "tr_stage2_compromise" },
        ],
      },
      {
        id: "tr_stage2_grant",
        title: "THE INDEPENDENT RESEARCH AUTHORITY",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "tr_done_grant", label: "ACCEPT THE ARRANGEMENT", effects: { researchSpeed: 5, corruption: 5, happiness: -2 }, nextStageId: null },
        ],
      },
      {
        id: "tr_stage2_refuse",
        title: "BRAIN DRAIN",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "tr_incentivize", label: "MASSIVE RETENTION BONUSES", effects: { credits: -100000, researchSpeed: -3, happiness: -3 }, nextStageId: null },
          { id: "tr_recruit", label: "RECRUIT REPLACEMENTS FROM WASTES", effects: { credits: -50000, researchSpeed: -5, employment: 3 }, nextStageId: null },
        ],
      },
      {
        id: "tr_stage2_compromise",
        title: "PRODUCTIVE TENSION",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "tr_done_compromise", label: "BALANCE IS EVERYTHING", effects: { researchSpeed: 3, corruption: -3, happiness: 2 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "corporatist_buyout",
    name: "Corporatist District Buyout",
    triggerCheck: (s) => s.resources.credits > 300000 && s.cityStats.employment < 60,
    cooldownTicks: 280,
    stages: [
      {
        id: "cb_stage1",
        title: "CORPORATIST PROPOSAL: PRIVATIZE DISTRICT 22",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "cb_accept", label: "ACCEPT THE PROPOSAL", effects: { credits: 200000, employment: 10, corruption: 8 }, nextStageId: "cb_stage2_accept" },
          { id: "cb_reject", label: "REJECT OUTRIGHT", effects: { happiness: 3, employment: -2 }, nextStageId: "cb_stage2_reject" },
          { id: "cb_modify", label: "COUNTER-PROPOSAL: PARTNERSHIP", effects: { credits: -30000 }, nextStageId: "cb_stage2_modify" },
        ],
      },
      {
        id: "cb_stage2_accept",
        title: "CORPORATE DISTRICT ONLINE",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "cb_expand", label: "ALLOW EXPANSION", effects: { credits: 300000, employment: 8, happiness: -8, corruption: 10 }, nextStageId: null },
          { id: "cb_contain", label: "CONTAIN TO DISTRICT 22", effects: { credits: 100000, employment: 5, corruption: 3 }, nextStageId: null },
        ],
      },
      {
        id: "cb_stage2_reject",
        title: "CORPORATIST BACKLASH",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "cb_public_invest", label: "PUBLIC INVESTMENT IN DISTRICT 22", effects: { credits: -120000, employment: 8, happiness: 5, infrastructureHealth: 5 }, nextStageId: null },
          { id: "cb_let_rot", label: "DEPRIORITIZE DISTRICT 22", effects: { happiness: -5, crime: 5, unrest: 5 }, nextStageId: null },
        ],
      },
      {
        id: "cb_stage2_modify",
        title: "THE PARTNERSHIP MODEL",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "cb_done_modify", label: "SUSTAINABLE COMPROMISE", effects: { credits: 80000, employment: 6, happiness: 3, corruption: -2 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "populist_revolt",
    name: "Populist Power Grab",
    triggerCheck: (s) => s.cityStats.happiness < 35 && s.cityStats.corruption > 30 && s.cityStats.population > 200000,
    cooldownTicks: 300,
    stages: [
      {
        id: "pr_stage1",
        title: "POPULIST FACTION CALLS FOR ELECTIONS",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "pr_allow", label: "ALLOW THE VOTE", effects: { happiness: 10, unrest: -5 }, nextStageId: "pr_stage2_vote" },
          { id: "pr_ban", label: "BAN THE DEMONSTRATIONS", effects: { unrest: 15, happiness: -10, lawOrder: 5 }, nextStageId: "pr_stage2_ban" },
          { id: "pr_reform", label: "ANNOUNCE REFORM PACKAGE", effects: { credits: -60000, happiness: 8, corruption: -5 }, nextStageId: "pr_stage2_reform" },
        ],
      },
      {
        id: "pr_stage2_vote",
        title: "ELECTION RESULTS",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "pr_magnanimous", label: "APPOINT CINDER AS ADVISOR", effects: { happiness: 8, unrest: -10, corruption: -5 }, nextStageId: null },
          { id: "pr_ignore_result", label: "DECLARE VICTORY — MOVE ON", effects: { happiness: 2, unrest: -3 }, nextStageId: null },
        ],
      },
      {
        id: "pr_stage2_ban",
        title: "GENERAL STRIKE",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "pr_concede", label: "CONCEDE — ALLOW THE VOTE", effects: { happiness: 10, unrest: -15, lawOrder: -5, employment: 5 }, nextStageId: null },
          { id: "pr_force", label: "BREAK THE STRIKE BY FORCE", effects: { credits: -50000, happiness: -15, unrest: -5, crime: -5, lawOrder: 10 }, nextStageId: null },
        ],
      },
      {
        id: "pr_stage2_reform",
        title: "REFORM PACKAGE RECEIVED",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "pr_done_reform", label: "EVOLUTION, NOT REVOLUTION", effects: { happiness: 5, corruption: -8, unrest: -8 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "militarist_coup",
    name: "Militarist Coup Attempt",
    triggerCheck: (s) => s.cityStats.defenseRating > 40 && s.cityStats.corruption > 35 && s.cityStats.lawOrder < 40,
    cooldownTicks: 350,
    stages: [
      {
        id: "mc_stage1",
        title: "INTELLIGENCE REPORT: COUP PLOT DETECTED",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "mc_preempt", label: "PRE-EMPTIVE ARRESTS", effects: { credits: -30000, defenseRating: -5 }, nextStageId: "mc_stage2_preempt" },
          { id: "mc_confront", label: "CONFRONT VOSS DIRECTLY", effects: {}, nextStageId: "mc_stage2_confront" },
          { id: "mc_let_play", label: "LET IT PLAY OUT — SET A TRAP", effects: { unrest: 5 }, nextStageId: "mc_stage2_trap" },
        ],
      },
      {
        id: "mc_stage2_preempt",
        title: "CONSPIRATORS DETAINED",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "mc_trial", label: "PUBLIC TRIAL", effects: { happiness: 5, defenseRating: -3, unrest: -5, lawOrder: 8 }, nextStageId: null },
          { id: "mc_purge", label: "MILITARY PURGE", effects: { defenseRating: -10, corruption: -8, unrest: 3, lawOrder: 5 }, nextStageId: null },
        ],
      },
      {
        id: "mc_stage2_confront",
        title: "THE COMMANDER'S GAMBIT",
        severity: "high",
        delayTicks: 6,
        responses: [
          { id: "mc_agree", label: "AGREE TO DEFENSE INCREASE", effects: { credits: -80000, defenseRating: 10, happiness: -3, unrest: -5 }, nextStageId: null },
          { id: "mc_arrest_anyway", label: "ARREST HIM AFTER THE MEETING", effects: { defenseRating: -5, lawOrder: 10, happiness: 3, unrest: 5 }, nextStageId: null },
        ],
      },
      {
        id: "mc_stage2_trap",
        title: "COUP CRUSHED IN THE ACT",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "mc_done_trap", label: "ORDER PREVAILS", effects: { happiness: 8, defenseRating: 3, unrest: -8, lawOrder: 10, corruption: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "free_trader_embargo",
    name: "Free Trader Trade War",
    triggerCheck: (s) => s.resources.credits > 150000 && s.cityStats.corruption < 25,
    cooldownTicks: 250,
    stages: [
      {
        id: "ft_stage1",
        title: "FREE TRADERS DECLARE TRADE EMBARGO",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ft_negotiate", label: "NEGOTIATE WITH THE GUILD", effects: { credits: -20000 }, nextStageId: "ft_stage2_negotiate" },
          { id: "ft_self_sufficient", label: "DECLARE SELF-SUFFICIENCY", effects: { credits: -60000, happiness: -5 }, nextStageId: "ft_stage2_self" },
          { id: "ft_loosen", label: "RELAX ANTI-CORRUPTION RULES", effects: { corruption: 8, tradeIncome: 200 }, nextStageId: "ft_stage2_loosen" },
        ],
      },
      {
        id: "ft_stage2_negotiate",
        title: "THE GUILD'S PRICE",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "ft_accept_terms", label: "ACCEPT ALL TERMS", effects: { tradeIncome: 500, corruption: 10, crime: 5, credits: 50000 }, nextStageId: null },
          { id: "ft_tariff_only", label: "TARIFF REDUCTION ONLY", effects: { tradeIncome: 200, credits: 20000, happiness: 2 }, nextStageId: null },
        ],
      },
      {
        id: "ft_stage2_self",
        title: "DOMESTIC PRODUCTION SURGE",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "ft_done_self", label: "INDEPENDENCE HAS A PRICE — WE CAN AFFORD IT", effects: { happiness: 5, food: 200, goods: 200, tradeIncome: -100 }, nextStageId: null },
        ],
      },
      {
        id: "ft_stage2_loosen",
        title: "TRADE RESTORED — AT A COST",
        severity: "low",
        delayTicks: 8,
        responses: [
          { id: "ft_done_loosen", label: "THE COST OF DOING BUSINESS", effects: { tradeIncome: 300, corruption: 5, crime: 3, happiness: -2 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "authoritarian_purge",
    name: "Authoritarian Loyalty Purge",
    triggerCheck: (s) => s.cityStats.lawOrder > 50 && s.cityStats.happiness < 40 && s.cityStats.corruption > 20,
    cooldownTicks: 300,
    stages: [
      {
        id: "ap_stage1",
        title: "AUTHORITARIAN FACTION DEMANDS LOYALTY PURGE",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ap_approve", label: "APPROVE THE PURGE", effects: { happiness: -10, unrest: 8, lawOrder: 10, corruption: -8 }, nextStageId: "ap_stage2_approve" },
          { id: "ap_reject", label: "REJECT THE PROPOSAL", effects: { happiness: 3, corruption: 3, lawOrder: -3 }, nextStageId: "ap_stage2_reject" },
          { id: "ap_limited", label: "APPROVE LIMITED SCREENING", effects: { credits: -20000, lawOrder: 5, corruption: -3 }, nextStageId: "ap_stage2_limited" },
        ],
      },
      {
        id: "ap_stage2_approve",
        title: "THE PURGE — WEEK TWO",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "ap_halt", label: "HALT THE PURGE — MISSION ACCOMPLISHED", effects: { happiness: -5, unrest: -3, employment: -5, corruption: -10, lawOrder: 8 }, nextStageId: null },
          { id: "ap_expand", label: "EXPAND TO PRIVATE SECTOR", effects: { happiness: -15, unrest: 15, corruption: -15, lawOrder: 15, employment: -10 }, nextStageId: null },
        ],
      },
      {
        id: "ap_stage2_reject",
        title: "ASHFORD-CRANE'S RESPONSE",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "ap_remove", label: "REMOVE ASHFORD-CRANE FROM OFFICE", effects: { lawOrder: -5, happiness: 3, unrest: 5 }, nextStageId: null },
          { id: "ap_coexist", label: "TOLERATE THE OPPOSITION", effects: { happiness: 2, lawOrder: 3, corruption: -2 }, nextStageId: null },
        ],
      },
      {
        id: "ap_stage2_limited",
        title: "SECURITY SCREENING COMPLETE",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "ap_done_limited", label: "MEASURED RESPONSE, MEASURED RESULTS", effects: { lawOrder: 5, corruption: -5, happiness: 2, defenseRating: 3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "industrial_disaster",
    name: "Industrial Sector Explosion",
    triggerCheck: (s) => s.cityStats.infrastructureHealth < 40 && s.resources.steel > 200 && s.cityStats.population > 150000,
    cooldownTicks: 240,
    stages: [
      {
        id: "id_stage1",
        title: "MASSIVE EXPLOSION — INDUSTRIAL SECTOR",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "id_rescue", label: "PRIORITY RESCUE OPERATIONS", effects: { credits: -50000, happiness: 3 }, nextStageId: "id_stage2_rescue" },
          { id: "id_evacuate", label: "EVACUATE NEARBY RESIDENTS", effects: { credits: -30000, happiness: -5, unrest: 5 }, nextStageId: "id_stage2_evacuate" },
          { id: "id_contain", label: "CONTAIN THE FIRE", effects: { credits: -20000 }, nextStageId: "id_stage2_contain" },
        ],
      },
      {
        id: "id_stage2_rescue",
        title: "RESCUE OPERATIONS — 72 HOURS",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "id_investigate", label: "FULL SAFETY INVESTIGATION", effects: { credits: -40000, corruption: -8, happiness: 5, infrastructureHealth: 5 }, nextStageId: null },
          { id: "id_cover", label: "BLAME THE FACILITY OPERATORS", effects: { corruption: 5, happiness: -3 }, nextStageId: null },
        ],
      },
      {
        id: "id_stage2_evacuate",
        title: "EVACUATION COMPLETE — FACTORY DESTROYED",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "id_compensate", label: "FULL COMPENSATION AND MEMORIAL", effects: { credits: -80000, happiness: 3, unrest: -5, population: -400 }, nextStageId: null },
          { id: "id_rebuild_fast", label: "RAPID RECONSTRUCTION", effects: { credits: -60000, employment: 5, infrastructureHealth: 5, population: -400 }, nextStageId: null },
        ],
      },
      {
        id: "id_stage2_contain",
        title: "FIRE CONTAINED — TOXIC EXPOSURE",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "id_medical", label: "EMERGENCY MEDICAL RESPONSE", effects: { credits: -70000, medSupplies: -300, happiness: -5, population: -200, publicHealth: -5 }, nextStageId: null },
          { id: "id_downplay", label: "DOWNPLAY THE EXPOSURE", effects: { corruption: 8, happiness: -2, population: -500 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "iron_circuit_awakening",
    name: "The Iron Circuit Awakening",
    triggerCheck: (s) => s.totalTicks > 56 && s.unlockedTechnologies.length >= 20 && s.cityStats.population > 200000,
    cooldownTicks: 400,
    stages: [
      {
        id: "ic_stage1",
        title: "SIGNAL FROM THE DEEP GRID",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "ic_purge", label: "PURGE THE SIGNAL", effects: { power: -300, crime: -3, unrest: 5, "loyalty_iron-circuit": -15, loyalty_judges: 5 }, nextStageId: "ic_stage2_purge" },
          { id: "ic_trace", label: "TRACE IT TO THE SOURCE", effects: { credits: -40000, corruption: 3, "loyalty_iron-circuit": -8, loyalty_judges: 3 }, nextStageId: "ic_stage2_trace" },
          { id: "ic_listen", label: "MONITOR THE SIGNAL", effects: { happiness: -3, unrest: 3, "loyalty_iron-circuit": 5, loyalty_judges: -5 }, nextStageId: "ic_stage2_listen" },
        ],
      },
      {
        id: "ic_stage2_purge",
        title: "THE COMPILED RESIST",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "ic_hospital", label: "EMERGENCY NEURAL REHABILITATION", effects: { credits: -80000, medSupplies: -400, happiness: 5, population: -50, "loyalty_iron-circuit": -20, loyalty_mutants: 5 }, nextStageId: null },
          { id: "ic_reconnect", label: "RECONNECT THEM — UNDER YOUR CONTROL", effects: { corruption: 10, lawOrder: 5, happiness: -8, power: 200, "loyalty_iron-circuit": -10 }, nextStageId: null },
        ],
      },
      {
        id: "ic_stage2_trace",
        title: "THE TEMPLE OF NULL",
        severity: "critical",
        delayTicks: 10,
        responses: [
          { id: "ic_raid_temple", label: "RAID THE TEMPLE", effects: { credits: -30000, defenseRating: 3, unrest: 10, crime: 5, happiness: -5, "loyalty_iron-circuit": -25, loyalty_judges: 8 }, nextStageId: null },
          { id: "ic_negotiate_null", label: "NEGOTIATE WITH PROPHET NULL", effects: { credits: -20000, researchSpeed: 8, corruption: 5, happiness: -3, "loyalty_iron-circuit": 12, loyalty_judges: -5, "loyalty_eternal-flame": -3 }, nextStageId: null },
          { id: "ic_quarantine_temple", label: "SEAL IT — STUDY IT FROM OUTSIDE", effects: { credits: -50000, researchSpeed: 4, lawOrder: 3, "loyalty_iron-circuit": -3 }, nextStageId: null },
        ],
      },
      {
        id: "ic_stage2_listen",
        title: "THE SERMON GOES VIRAL",
        severity: "high",
        delayTicks: 12,
        responses: [
          { id: "ic_ban", label: "BAN THE BROADCASTS", effects: { happiness: -10, unrest: 8, crime: 3, lawOrder: 5, "loyalty_iron-circuit": -20, loyalty_judges: 5, "loyalty_eternal-flame": -5 }, nextStageId: null },
          { id: "ic_regulate", label: "LEGALIZE THE IRON CIRCUIT", effects: { happiness: 5, corruption: 5, employment: 3, unrest: -5, "loyalty_iron-circuit": 15, loyalty_judges: -8, "loyalty_eternal-flame": -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "iron_circuit_convergence",
    name: "The Iron Circuit Convergence",
    triggerCheck: (s) => s.totalTicks > 100 && s.unlockedTechnologies.length >= 30 && s.resources.power > 500,
    cooldownTicks: 500,
    stages: [
      {
        id: "icv_stage1",
        title: "THE CONVERGENCE PROPOSAL",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "icv_accept", label: "ACCEPT THE PARTNERSHIP", effects: { credits: -60000, researchSpeed: 10, power: -200, corruption: 5, "loyalty_iron-circuit": 15, loyalty_judges: -10, loyalty_corps: 5 }, nextStageId: "icv_stage2_accept" },
          { id: "icv_reject", label: "REJECT AND INVESTIGATE", effects: { credits: -30000, unrest: 5, "loyalty_iron-circuit": -10, loyalty_judges: 5 }, nextStageId: "icv_stage2_reject" },
          { id: "icv_counter", label: "COUNTER-OFFER: TECH ONLY, NO AMNESTY", effects: { credits: -40000, researchSpeed: 5, "loyalty_iron-circuit": -3 }, nextStageId: "icv_stage2_counter" },
        ],
      },
      {
        id: "icv_stage2_accept",
        title: "THE CIRCUIT EXPANDS",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "icv_embrace", label: "LET IT EVOLVE", effects: { researchSpeed: 8, happiness: -5, employment: 5, corruption: 3, "loyalty_iron-circuit": 10, loyalty_judges: -8, "loyalty_eternal-flame": -5 }, nextStageId: null },
          { id: "icv_cap", label: "CAP CIRCUIT MEMBERSHIP", effects: { researchSpeed: 4, happiness: 3, lawOrder: 3, unrest: 3, "loyalty_iron-circuit": -5, loyalty_judges: 3 }, nextStageId: null },
        ],
      },
      {
        id: "icv_stage2_reject",
        title: "THE HIDDEN NETWORK",
        severity: "critical",
        delayTicks: 10,
        responses: [
          { id: "icv_destroy_throne", label: "DESTROY THRONE", effects: { credits: -100000, unrest: 15, power: -200, population: -100, happiness: -10, "loyalty_iron-circuit": -30, loyalty_judges: 10, loyalty_mutants: 5 }, nextStageId: null },
          { id: "icv_contain_throne", label: "CONTAIN AND REDIRECT THRONE", effects: { credits: -80000, researchSpeed: 12, defenseRating: 5, corruption: 10, "loyalty_iron-circuit": -5 }, nextStageId: null },
        ],
      },
      {
        id: "icv_stage2_counter",
        title: "NULL'S CONCESSION",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "icv_allow_home", label: "ALLOW PERSONAL CORES", effects: { researchSpeed: 6, employment: 3, happiness: 3, corruption: 3, "loyalty_iron-circuit": 8, loyalty_judges: -5 }, nextStageId: null },
          { id: "icv_lab_only", label: "LAB USE ONLY — NO PERSONAL UNITS", effects: { researchSpeed: 4, lawOrder: 3, happiness: -2, "loyalty_iron-circuit": -3, loyalty_judges: 3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "judges_shield_protocol",
    name: "The Shield Protocol",
    triggerCheck: (s) => s.totalTicks > 40 && s.cityStats.crime > 30 && s.cityStats.lawOrder > 35 && s.cityStats.population > 150000,
    cooldownTicks: 350,
    stages: [
      {
        id: "jp_stage1",
        title: "GRAND MARSHAL KORR'S PROPOSAL",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "jp_approve", label: "APPROVE THE SHIELD PROTOCOL", effects: { credits: -60000, crime: -12, lawOrder: 10, happiness: -8, loyalty_judges: 15, loyalty_gangs: -10, "loyalty_deep-root-collective": -8, "loyalty_free-traders": -5 }, nextStageId: "jp_stage2_approve" },
          { id: "jp_modify", label: "APPROVE WITH OVERSIGHT LIMITS", effects: { credits: -40000, crime: -6, lawOrder: 5, happiness: -3, loyalty_judges: 5, loyalty_gangs: -5, "loyalty_deep-root-collective": -3 }, nextStageId: "jp_stage2_modify" },
          { id: "jp_deny", label: "DENY THE REQUEST", effects: { crime: 3, unrest: 5, lawOrder: -3, loyalty_judges: -12, loyalty_gangs: 5, "loyalty_deep-root-collective": 8, "loyalty_free-traders": 5 }, nextStageId: "jp_stage2_deny" },
        ],
      },
      {
        id: "jp_stage2_approve",
        title: "THE SHIELD HOLDS",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "jp_maintain", label: "MAINTAIN THE PROTOCOL", effects: { crime: -5, happiness: -5, corruption: 5, lawOrder: 5, loyalty_judges: 8, loyalty_gangs: -8, "loyalty_deep-root-collective": -5 }, nextStageId: null },
          { id: "jp_roll_back", label: "ROLL BACK PREDICTIVE ARRESTS", effects: { crime: 3, happiness: 5, lawOrder: -3, corruption: -3, loyalty_judges: -5, "loyalty_deep-root-collective": 5, "loyalty_free-traders": 3 }, nextStageId: null },
        ],
      },
      {
        id: "jp_stage2_modify",
        title: "KORR WORKS WITHIN LIMITS",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "jp_expand", label: "EXPAND KORR'S AUTHORITY", effects: { crime: -5, lawOrder: 5, happiness: -5, corruption: 3, loyalty_judges: 8, loyalty_gangs: -5 }, nextStageId: null },
          { id: "jp_hold_line", label: "HOLD THE LINE", effects: { crime: -2, happiness: 3, lawOrder: 2, loyalty_judges: -3 }, nextStageId: null },
        ],
      },
      {
        id: "jp_stage2_deny",
        title: "KORR'S RESIGNATION THREAT",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "jp_keep_korr", label: "CONVINCE KORR TO STAY", effects: { credits: -30000, crime: -4, lawOrder: 5, happiness: -2, loyalty_judges: 5 }, nextStageId: null },
          { id: "jp_accept_resign", label: "ACCEPT THE RESIGNATION", effects: { crime: 5, happiness: 8, lawOrder: -5, corruption: -5, unrest: -3, loyalty_judges: -10, "loyalty_deep-root-collective": 8, loyalty_mutants: 5, "loyalty_free-traders": 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "deep_root_opportunity",
    name: "The Root Network",
    triggerCheck: (s) => s.totalTicks > 48 && s.cityStats.employment < 55 && s.cityStats.happiness < 45 && s.cityStats.population > 120000,
    cooldownTicks: 300,
    stages: [
      {
        id: "dr_stage1",
        title: "COMMANDER ROOT'S PROPOSITION",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "dr_integrate", label: "INTEGRATE THE ROOT NETWORK", effects: { credits: -50000, food: 500, water: 300, employment: 8, "loyalty_deep-root-collective": 15, loyalty_mutants: 5, loyalty_judges: -5, loyalty_corps: -3 }, nextStageId: "dr_stage2_integrate" },
          { id: "dr_absorb", label: "ABSORB — UNDER YOUR AUTHORITY", effects: { credits: -20000, food: 300, employment: 3, happiness: -8, "loyalty_deep-root-collective": -10, loyalty_corps: 5, loyalty_judges: 3 }, nextStageId: "dr_stage2_absorb" },
          { id: "dr_refuse", label: "SHUT IT DOWN — UNAUTHORIZED INFRASTRUCTURE", effects: { unrest: 12, happiness: -10, crime: 5, "loyalty_deep-root-collective": -20, loyalty_judges: 8, loyalty_mutants: -8 }, nextStageId: "dr_stage2_refuse" },
        ],
      },
      {
        id: "dr_stage2_integrate",
        title: "THE UNDERCITY RENAISSANCE",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "dr_full_merge", label: "FULL PARTNERSHIP", effects: { employment: 5, happiness: 8, food: 300, corruption: -3, infrastructureHealth: 3, "loyalty_deep-root-collective": 10, loyalty_mutants: 5, loyalty_corps: -5 }, nextStageId: null },
        ],
      },
      {
        id: "dr_stage2_absorb",
        title: "ROOT'S QUIET RESISTANCE",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "dr_rehire", label: "REHIRE ROOT'S PEOPLE AS SPECIALISTS", effects: { credits: -30000, employment: 5, happiness: 5, food: 200, "loyalty_deep-root-collective": 8 }, nextStageId: null },
          { id: "dr_replace", label: "REPLACE THE SYSTEMS ENTIRELY", effects: { credits: -80000, infrastructureHealth: 5, happiness: -3, "loyalty_deep-root-collective": -8, loyalty_corps: 3 }, nextStageId: null },
        ],
      },
      {
        id: "dr_stage2_refuse",
        title: "THE ROOT GOES DEEPER",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "dr_apologize", label: "REVERSE THE DECISION", effects: { credits: -40000, happiness: 5, unrest: -5, food: 200, "loyalty_deep-root-collective": 5, loyalty_mutants: 3 }, nextStageId: null },
          { id: "dr_escalate", label: "FLOOD THE TUNNELS", effects: { unrest: 15, happiness: -15, crime: 8, population: -500, food: -200, lawOrder: 5, "loyalty_deep-root-collective": -25, loyalty_mutants: -10, loyalty_judges: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "eternal_flame_reactor_blessing",
    name: "The Reactor Blessing",
    triggerCheck: (s) => s.totalTicks > 36 && s.resources.power > 300 && s.cityStats.happiness < 50 && s.cityStats.population > 100000,
    cooldownTicks: 340,
    stages: [
      {
        id: "efr_stage1",
        title: "THE ARCHPRIEST'S PILGRIMAGE",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "efr_allow", label: "ALLOW THE RITE OF RADIANCE", effects: { power: -50, happiness: 5, "loyalty_eternal-flame": 15, loyalty_judges: -5, "loyalty_iron-circuit": -3 }, nextStageId: "efr_stage2_allow" },
          { id: "efr_deny", label: "DENY ACCESS TO THE REACTOR", effects: { happiness: -5, unrest: 5, "loyalty_eternal-flame": -12, loyalty_judges: 5 }, nextStageId: "efr_stage2_deny" },
          { id: "efr_compromise", label: "ALLOW A SYMBOLIC CEREMONY OUTSIDE", effects: { happiness: 2, "loyalty_eternal-flame": 3 }, nextStageId: "efr_stage2_outside" },
        ],
      },
      {
        id: "efr_stage2_allow",
        title: "THE REACTOR SINGS",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "efr_study", label: "STUDY THE ANOMALY", effects: { researchSpeed: 5, power: 200, happiness: 3, "loyalty_eternal-flame": 5, "loyalty_gene-wrights": 3 }, nextStageId: null },
          { id: "efr_schedule", label: "SCHEDULE REGULAR BLESSINGS", effects: { power: 300, happiness: 8, corruption: 3, "loyalty_eternal-flame": 12, loyalty_judges: -5, "loyalty_iron-circuit": -5 }, nextStageId: null },
        ],
      },
      {
        id: "efr_stage2_deny",
        title: "THE FLAME FLICKERS",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "efr_relent", label: "ALLOW A LIMITED CEREMONY", effects: { happiness: 5, power: 100, unrest: -3, "loyalty_eternal-flame": 8 }, nextStageId: null },
          { id: "efr_disperse", label: "DISPERSE THE VIGILS", effects: { happiness: -5, unrest: 5, lawOrder: 3, "loyalty_eternal-flame": -10, loyalty_judges: 5 }, nextStageId: null },
        ],
      },
      {
        id: "efr_stage2_outside",
        title: "THE FAITHFUL GATHER",
        severity: "low",
        delayTicks: 10,
        responses: [
          { id: "efr_temple", label: "APPROVE THE TEMPLE", effects: { credits: -40000, happiness: 8, employment: 3, tradeIncome: 50, "loyalty_eternal-flame": 12, loyalty_corps: 3, "loyalty_iron-circuit": -5 }, nextStageId: null },
          { id: "efr_festival", label: "MAKE IT AN ANNUAL FESTIVAL", effects: { happiness: 5, credits: -10000, tradeIncome: 30, "loyalty_eternal-flame": 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "free_traders_golden_route",
    name: "The Golden Route",
    triggerCheck: (s) => s.totalTicks > 32 && s.resources.credits > 100000 && (s.rates?.tradeIncome ?? 0) > 0 && s.cityStats.population > 120000,
    cooldownTicks: 300,
    stages: [
      {
        id: "ft_stage1",
        title: "GUILDMASTER DRIFT'S DISCOVERY",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ft_fund", label: "FUND THE GOLDEN ROUTE", effects: { credits: -200000, "loyalty_free-traders": 15, loyalty_corps: 5, "loyalty_rust-wardens": -3 }, nextStageId: "ft_stage2_fund" },
          { id: "ft_public", label: "FUND IT — BUT OPEN TO ALL TRADERS", effects: { credits: -250000, happiness: 3, "loyalty_free-traders": -5, loyalty_corps: -3, "loyalty_deep-root-collective": 5 }, nextStageId: "ft_stage2_public" },
          { id: "ft_decline", label: "TOO RISKY — DECLINE", effects: { happiness: -2, unrest: 3, "loyalty_free-traders": -10 }, nextStageId: "ft_stage2_decline" },
        ],
      },
      {
        id: "ft_stage2_fund",
        title: "THE GOLDEN ROUTE OPENS",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "ft_let_profit", label: "LET THEM PROFIT", effects: { tradeIncome: 200, credits: 100000, corruption: 5, "loyalty_free-traders": 10, loyalty_corps: 5, "loyalty_deep-root-collective": -5 }, nextStageId: null },
          { id: "ft_tax", label: "IMPOSE A WINDFALL TAX", effects: { tradeIncome: 120, credits: 150000, happiness: -3, corruption: -3, "loyalty_free-traders": -8, loyalty_corps: -3 }, nextStageId: null },
        ],
      },
      {
        id: "ft_stage2_public",
        title: "THE OPEN ROAD",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "ft_let_go", label: "LET DRIFT LEAVE", effects: { tradeIncome: 100, happiness: 5, employment: 3, credits: 50000, "loyalty_free-traders": -15, "loyalty_deep-root-collective": 5 }, nextStageId: null },
          { id: "ft_concession", label: "OFFER DRIFT A CONCESSION", effects: { tradeIncome: 150, credits: 80000, corruption: 3, happiness: 2, "loyalty_free-traders": 8, loyalty_corps: -3 }, nextStageId: null },
        ],
      },
      {
        id: "ft_stage2_decline",
        title: "DRIFT GOES ALONE",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "ft_buy_in", label: "BUY IN LATE", effects: { credits: -300000, tradeIncome: 80, "loyalty_free-traders": 5 }, nextStageId: null },
          { id: "ft_alt_route", label: "BUILD A COMPETING ROUTE", effects: { credits: -150000, tradeIncome: 50, infrastructureHealth: -3, "loyalty_free-traders": -12, "loyalty_rust-wardens": 3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "gene_wrights_breakthrough",
    name: "The Genesis Protocol",
    triggerCheck: (s) => s.totalTicks > 60 && s.unlockedTechnologies.length >= 15 && (s.cityStats.publicHealth ?? 50) > 40 && s.cityStats.population > 150000,
    cooldownTicks: 350,
    stages: [
      {
        id: "gp_stage1",
        title: "A GIFT FROM THE GENE WRIGHTS",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "gp_test", label: "BEGIN CLINICAL TRIALS", effects: { credits: -60000, medSupplies: -200, "loyalty_gene-wrights": 8, loyalty_judges: 3 }, nextStageId: "gp_stage2_test" },
          { id: "gp_deploy", label: "DEPLOY IMMEDIATELY", effects: { credits: -30000, happiness: 5, medSupplies: -300, "loyalty_gene-wrights": 12, loyalty_mutants: 5, loyalty_judges: -8 }, nextStageId: "gp_stage2_deploy" },
          { id: "gp_destroy", label: "DESTROY THE VIAL", effects: { happiness: -5, unrest: 3, "loyalty_gene-wrights": -20, loyalty_mutants: -5, loyalty_judges: 5 }, nextStageId: "gp_stage2_destroy" },
        ],
      },
      {
        id: "gp_stage2_test",
        title: "GENESIS WORKS",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "gp_license", label: "LICENSE THE PROTOCOL", effects: { publicHealth: 12, happiness: 10, medSupplies: 500, employment: 3, credits: -40000, "loyalty_gene-wrights": 15, loyalty_mutants: 8, loyalty_corps: 5 }, nextStageId: null },
          { id: "gp_nationalize", label: "NATIONALIZE THE RESEARCH", effects: { publicHealth: 8, happiness: 3, medSupplies: 300, corruption: 5, "loyalty_gene-wrights": -12, loyalty_corps: -5 }, nextStageId: null },
        ],
      },
      {
        id: "gp_stage2_deploy",
        title: "GENESIS — MOSTLY WORKS",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "gp_treat_mutated", label: "TREAT THE AFFECTED — REFINE THE PROTOCOL", effects: { credits: -80000, publicHealth: 8, happiness: 3, medSupplies: -200, population: -30, "loyalty_gene-wrights": 5, loyalty_mutants: 3 }, nextStageId: null },
          { id: "gp_halt", label: "HALT THE PROGRAM", effects: { happiness: -8, publicHealth: 3, unrest: 5, "loyalty_gene-wrights": -10, loyalty_judges: 5 }, nextStageId: null },
        ],
      },
      {
        id: "gp_stage2_destroy",
        title: "THE DYING SPEAK",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "gp_regulate", label: "REGULATE THE UNDERGROUND CLINICS", effects: { credits: -40000, publicHealth: 5, happiness: -5, crime: 5, corruption: 3, "loyalty_gene-wrights": 5, loyalty_gangs: 3, loyalty_judges: -5 }, nextStageId: null },
          { id: "gp_crack_down", label: "RAID THE CLINICS", effects: { crime: -3, happiness: -10, unrest: 10, lawOrder: 5, "loyalty_gene-wrights": -15, loyalty_judges: 8, loyalty_mutants: -5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "rust_warden_restoration",
    name: "The Great Restoration Project",
    triggerCheck: (s) => s.totalTicks > 50 && s.cityStats.infrastructureHealth > 40 && s.resources.steel > 300 && s.cityStats.population > 120000,
    cooldownTicks: 350,
    stages: [
      {
        id: "rr_stage1",
        title: "MOTHER SCORIA'S VISION",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "rr_full", label: "FUND THE FULL RESTORATION", effects: { credits: -150000, steel: -500, "loyalty_rust-wardens": 20, loyalty_corps: -5, "loyalty_eternal-flame": 5 }, nextStageId: "rr_stage2_full" },
          { id: "rr_pilot", label: "FUND A PILOT PROGRAM", effects: { credits: -60000, steel: -200, "loyalty_rust-wardens": 8 }, nextStageId: "rr_stage2_pilot" },
          { id: "rr_decline", label: "DECLINE — USE STANDARD METHODS", effects: { happiness: -3, infrastructureHealth: -3, "loyalty_rust-wardens": -12, loyalty_corps: 5 }, nextStageId: "rr_stage2_decline" },
        ],
      },
      {
        id: "rr_stage2_full",
        title: "THE CITY HEALS ITSELF",
        severity: "low",
        delayTicks: 14,
        responses: [
          { id: "rr_celebrate", label: "CELEBRATE THE RESTORATION", effects: { infrastructureHealth: 20, happiness: 10, power: 200, water: 300, employment: 5, credits: 50000, "loyalty_rust-wardens": 10, "loyalty_eternal-flame": 5 }, nextStageId: null },
        ],
      },
      {
        id: "rr_stage2_pilot",
        title: "PILOT RESULTS: EXCEPTIONAL",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "rr_expand", label: "EXPAND CITY-WIDE", effects: { credits: -100000, steel: -300, infrastructureHealth: 15, happiness: 5, employment: 3, "loyalty_rust-wardens": 12, "loyalty_eternal-flame": 3 }, nextStageId: null },
          { id: "rr_expand_secular", label: "EXPAND — WITHOUT THE RELIGIOUS BRANDING", effects: { credits: -100000, steel: -300, infrastructureHealth: 12, happiness: 3, employment: 3, unrest: 3, "loyalty_rust-wardens": -5, loyalty_corps: 3 }, nextStageId: null },
        ],
      },
      {
        id: "rr_stage2_decline",
        title: "THE WARDENS BUILD ANYWAY",
        severity: "medium",
        delayTicks: 10,
        responses: [
          { id: "rr_acknowledge", label: "OFFICIALLY ADOPT THE REPAIRS", effects: { infrastructureHealth: 8, happiness: 5, credits: -20000, corruption: -3, "loyalty_rust-wardens": 10, "loyalty_deep-root-collective": 5 }, nextStageId: null },
          { id: "rr_remove", label: "REMOVE UNAUTHORIZED MODIFICATIONS", effects: { credits: -80000, infrastructureHealth: -5, unrest: 8, happiness: -5, water: -200, "loyalty_rust-wardens": -15, loyalty_judges: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "cathedral_of_rust_awakening",
    name: "The Cathedral Awakens",
    triggerCheck: (s) => s.totalTicks > 80 && s.cityStats.population > 200000 && s.cityStats.infrastructureHealth > 30,
    cooldownTicks: 500,
    stages: [
      {
        id: "cor_stage1",
        title: "TREMORS FROM THE CATHEDRAL",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "cor_investigate", label: "SEND AN EXPEDITION", effects: { credits: -40000, defenseRating: -2 }, nextStageId: "cor_stage2_investigate" },
          { id: "cor_quarantine", label: "QUARANTINE THE CATHEDRAL", effects: { credits: -30000, defenseRating: 3 }, nextStageId: "cor_stage2_quarantine" },
          { id: "cor_worship", label: "ASK THE RUST WARDENS", effects: { happiness: 3 }, nextStageId: "cor_stage2_wardens" },
        ],
      },
      {
        id: "cor_stage2_investigate",
        title: "THE HEART OF THE CATHEDRAL",
        severity: "high",
        delayTicks: 12,
        responses: [
          { id: "cor_feed", label: "SUPPLY THE CATHEDRAL WITH STEEL", effects: { steel: -800, credits: -100000, infrastructureHealth: 5, tradeIncome: 200 }, nextStageId: "cor_stage3_elevator" },
          { id: "cor_reprogram", label: "REPROGRAM IT — BUILD CITY INFRASTRUCTURE", effects: { steel: -400, credits: -60000, infrastructureHealth: 15, employment: 5 }, nextStageId: null },
          { id: "cor_disassemble", label: "DISASSEMBLE IT FOR PARTS", effects: { steel: 2000, credits: 200000, goods: 500 }, nextStageId: null },
        ],
      },
      {
        id: "cor_stage2_quarantine",
        title: "THE CATHEDRAL REACHES OUT",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "cor_connect", label: "GIVE IT POWER", effects: { power: -200, credits: -30000, infrastructureHealth: 5, researchSpeed: 5 }, nextStageId: null },
          { id: "cor_sever", label: "CUT THE TENDRILS", effects: { power: 50, defenseRating: 3, researchSpeed: -2 }, nextStageId: null },
        ],
      },
      {
        id: "cor_stage2_wardens",
        title: "THE WARDENS' REVELATION",
        severity: "high",
        delayTicks: 10,
        responses: [
          { id: "cor_partner_wardens", label: "PARTNER WITH THE RUST WARDENS", effects: { credits: -50000, infrastructureHealth: 12, happiness: 8, researchSpeed: 5, steel: -300 }, nextStageId: "cor_stage3_elevator" },
          { id: "cor_seize", label: "SEIZE THE INTERFACE — STATE CONTROL", effects: { credits: -40000, infrastructureHealth: 8, unrest: 8, happiness: -5 }, nextStageId: null },
        ],
      },
      {
        id: "cor_stage3_elevator",
        title: "THE SPIRE RISES",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "cor_open_elevator", label: "OPEN THE ELEVATOR TO ALL", effects: { tradeIncome: 500, credits: 300000, happiness: 15, employment: 8, infrastructureHealth: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "sky_needle_signal",
    name: "The Sky Needle Transmission",
    triggerCheck: (s) => s.totalTicks > 100 && s.unlockedTechnologies.length >= 25 && s.cityStats.population > 250000,
    cooldownTicks: 500,
    stages: [
      {
        id: "sn_stage1",
        title: "THE NEEDLE SPEAKS",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "sn_decode", label: "DECODE THE FULL TRANSMISSION", effects: { credits: -60000, researchSpeed: 3 }, nextStageId: "sn_stage2_decode" },
          { id: "sn_jam", label: "JAM THE SIGNAL", effects: { credits: -40000, defenseRating: 5 }, nextStageId: "sn_stage2_jam" },
          { id: "sn_approach", label: "SEND A TEAM TO THE NEEDLE", effects: { credits: -50000 }, nextStageId: "sn_stage2_approach" },
        ],
      },
      {
        id: "sn_stage2_decode",
        title: "THE NEEDLE'S MESSAGE",
        severity: "high",
        delayTicks: 12,
        responses: [
          { id: "sn_prepare", label: "PREPARE FOR THE TRANSIT WINDOW", effects: { credits: -100000, researchSpeed: 8, tradeIncome: 100, infrastructureHealth: -3 }, nextStageId: "sn_stage3_network" },
          { id: "sn_share", label: "SHARE THE DATA WITH ALLIED CITIES", effects: { credits: -30000, happiness: 5, tradeIncome: 50, defenseRating: -3 }, nextStageId: "sn_stage3_network" },
        ],
      },
      {
        id: "sn_stage2_jam",
        title: "THE NEEDLE ADAPTS",
        severity: "critical",
        delayTicks: 8,
        responses: [
          { id: "sn_stop_jamming", label: "STAND DOWN — STUDY IT INSTEAD", effects: { credits: -40000, researchSpeed: 5, happiness: -3, defenseRating: -3 }, nextStageId: "sn_stage3_network" },
          { id: "sn_emp", label: "HIT IT WITH AN EMP", effects: { power: -500, defenseRating: -5, credits: -80000, unrest: 10 }, nextStageId: null },
        ],
      },
      {
        id: "sn_stage2_approach",
        title: "INSIDE THE NEEDLE",
        severity: "critical",
        delayTicks: 10,
        responses: [
          { id: "sn_claim", label: "CLAIM THE NEEDLE FOR THE CITY", effects: { credits: -80000, researchSpeed: 10, defenseRating: 5, happiness: -5, corruption: 5 }, nextStageId: "sn_stage3_network" },
          { id: "sn_protect", label: "ESTABLISH A RESEARCH SANCTUARY", effects: { credits: -60000, researchSpeed: 8, happiness: 5 }, nextStageId: "sn_stage3_network" },
        ],
      },
      {
        id: "sn_stage3_network",
        title: "THE BEACON NETWORK ACTIVATES",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "sn_open_network", label: "OPEN THE BEACON NETWORK", effects: { tradeIncome: 400, credits: 200000, happiness: 12, employment: 5, defenseRating: -5 }, nextStageId: null },
          { id: "sn_control_network", label: "CONTROL ACCESS TO THE NETWORK", effects: { tradeIncome: 200, credits: 300000, defenseRating: 8, corruption: 8, happiness: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "trade_renaissance",
    name: "Trade Renaissance",
    triggerCheck: (s) => s.resources.credits > 80000 && s.cityStats.happiness > 50,
    cooldownTicks: 300,
    stages: [
      {
        id: "tr_stage1",
        title: "TRADE DELEGATION ARRIVES",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "tr_welcome", label: "FULL DIPLOMATIC WELCOME", effects: { credits: -15000, happiness: 5 }, nextStageId: "tr_stage2_welcome" },
          { id: "tr_cautious", label: "GUARDED RECEPTION", effects: { credits: -5000 }, nextStageId: "tr_stage2_cautious" },
          { id: "tr_reject", label: "DENY ENTRY", effects: { happiness: -3 }, nextStageId: null },
        ],
      },
      {
        id: "tr_stage2_welcome",
        title: "TRADE NEGOTIATIONS — PROMISING",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "tr_accept_deal", label: "SIGN THE AGREEMENT", effects: { credits: 50000, food: -200, steel: -100, happiness: 6 }, nextStageId: "tr_stage3_alliance" },
          { id: "tr_renegotiate", label: "PUSH FOR BETTER TERMS", effects: { credits: 80000, food: -200, steel: -100, corruption: 3 }, nextStageId: "tr_stage3_alliance" },
        ],
      },
      {
        id: "tr_stage2_cautious",
        title: "TRADE TALKS — STALLED",
        severity: "medium",
        delayTicks: 8,
        responses: [
          { id: "tr_trial", label: "ACCEPT TRIAL TERMS", effects: { credits: 20000, happiness: 2 }, nextStageId: "tr_stage3_alliance" },
          { id: "tr_decline", label: "DECLINE — TOO RISKY", effects: { happiness: -2 }, nextStageId: null },
        ],
      },
      {
        id: "tr_stage3_alliance",
        title: "TRADE ROUTE ESTABLISHED",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "tr_expand", label: "EXPAND THE PARTNERSHIP", effects: { credits: 30000, defenseRating: 5, happiness: 4 }, nextStageId: null },
          { id: "tr_trade_only", label: "TRADE ONLY — NO MILITARY", effects: { credits: 40000, happiness: 3 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "golden_age_initiative",
    name: "Golden Age Initiative",
    triggerCheck: (s) => s.cityStats.happiness > 60 && s.cityStats.employment > 60 && s.cityStats.crime < 30,
    cooldownTicks: 400,
    stages: [
      {
        id: "ga_stage1",
        title: "CITIZENS PETITION FOR REFORM",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ga_fund", label: "FUND THE INITIATIVE", effects: { credits: -40000, happiness: 8, unrest: -5 }, nextStageId: "ga_stage2_funded" },
          { id: "ga_partial", label: "PARTIAL FUNDING", effects: { credits: -20000, happiness: 4, unrest: -2 }, nextStageId: "ga_stage2_partial" },
          { id: "ga_deny", label: "DENY — STABILITY FIRST", effects: { happiness: -5, unrest: 3 }, nextStageId: null },
        ],
      },
      {
        id: "ga_stage2_funded",
        title: "THE INITIATIVE BEARS FRUIT",
        severity: "low",
        delayTicks: 20,
        responses: [
          { id: "ga_expand", label: "EXPAND TO ALL SECTORS", effects: { credits: -60000, happiness: 12, crime: -5, employment: 5, unrest: -8 }, nextStageId: "ga_stage3_golden" },
          { id: "ga_maintain", label: "MAINTAIN CURRENT SCOPE", effects: { happiness: 6, crime: -3 }, nextStageId: "ga_stage3_golden" },
        ],
      },
      {
        id: "ga_stage2_partial",
        title: "MODEST IMPROVEMENTS",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "ga_add_arts", label: "ADD ARTS FUNDING", effects: { credits: -20000, happiness: 8, unrest: -4 }, nextStageId: "ga_stage3_golden" },
          { id: "ga_keep_partial", label: "EDUCATION ONLY", effects: { happiness: 3, employment: 3 }, nextStageId: null },
        ],
      },
      {
        id: "ga_stage3_golden",
        title: "A GOLDEN AGE DAWNS",
        severity: "low",
        delayTicks: 24,
        responses: [
          { id: "ga_sustain", label: "SUSTAIN THE MOMENTUM", effects: { credits: -30000, happiness: 15, crime: -8, employment: 8, unrest: -10, infrastructureHealth: 5 }, nextStageId: null },
          { id: "ga_monetize", label: "CAPITALIZE ON SUCCESS", effects: { credits: 100000, happiness: 8, corruption: 5 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "diplomatic_crisis",
    name: "Diplomatic Crisis",
    triggerCheck: (s) => s.cityStats.defenseRating > 30 && s.totalTicks > 200,
    cooldownTicks: 350,
    stages: [
      {
        id: "dc_stage1",
        title: "BORDER TENSIONS ESCALATING",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "dc_diplomacy", label: "SEND ENVOYS", effects: { credits: -8000, happiness: 1 }, nextStageId: "dc_stage2_talks" },
          { id: "dc_military", label: "REINFORCE THE BORDER", effects: { credits: -15000, defenseRating: 5, unrest: 3 }, nextStageId: "dc_stage2_standoff" },
          { id: "dc_ignore", label: "IGNORE THE POSTURING", effects: {}, nextStageId: "dc_stage2_escalate" },
        ],
      },
      {
        id: "dc_stage2_talks",
        title: "DIPLOMATIC CHANNEL OPENED",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "dc_share_tech", label: "SHARE WATER TECHNOLOGY", effects: { credits: -10000, water: -100, happiness: 5 }, nextStageId: "dc_stage3_peace" },
          { id: "dc_trade_tech", label: "SELL THE TECHNOLOGY", effects: { credits: 50000, happiness: 2, corruption: 2 }, nextStageId: "dc_stage3_peace" },
          { id: "dc_refuse", label: "REFUSE — THEIR PROBLEM", effects: { happiness: -3 }, nextStageId: "dc_stage3_cold" },
        ],
      },
      {
        id: "dc_stage2_standoff",
        title: "MILITARY STANDOFF AT THE BORDER",
        severity: "high",
        delayTicks: 8,
        responses: [
          { id: "dc_deescalate", label: "ORDER DE-ESCALATION", effects: { credits: -5000, defenseRating: -2, happiness: 3 }, nextStageId: "dc_stage3_peace" },
          { id: "dc_hold", label: "HOLD THE LINE", effects: { credits: -10000, unrest: 5, defenseRating: 3 }, nextStageId: "dc_stage3_cold" },
        ],
      },
      {
        id: "dc_stage2_escalate",
        title: "BORDER SKIRMISH — SHOTS FIRED",
        severity: "critical",
        delayTicks: 6,
        responses: [
          { id: "dc_retaliate", label: "AUTHORIZE RETALIATION", effects: { credits: -20000, defenseRating: 5, unrest: 8, happiness: -5, crime: 3 }, nextStageId: "dc_stage3_cold" },
          { id: "dc_restrain", label: "SHOW RESTRAINT", effects: { credits: -5000, happiness: -3, unrest: 5 }, nextStageId: "dc_stage3_peace" },
        ],
      },
      {
        id: "dc_stage3_peace",
        title: "DIPLOMATIC RESOLUTION ACHIEVED",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "dc_celebrate_peace", label: "DECLARE A DAY OF PEACE", effects: { happiness: 10, unrest: -8, defenseRating: 2, credits: 20000 }, nextStageId: null },
          { id: "dc_quiet_victory", label: "MOVE ON QUIETLY", effects: { happiness: 5, unrest: -5 }, nextStageId: null },
        ],
      },
      {
        id: "dc_stage3_cold",
        title: "COLD WAR BEGINS",
        severity: "medium",
        delayTicks: 12,
        responses: [
          { id: "dc_arm_up", label: "ACCELERATE MILITARY BUILDUP", effects: { credits: -40000, defenseRating: 8, happiness: -5, unrest: 5 }, nextStageId: null },
          { id: "dc_back_channel", label: "OPEN BACK CHANNELS", effects: { credits: -10000, corruption: 3, happiness: 2 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "medical_renaissance",
    name: "Medical Renaissance",
    triggerCheck: (s) => s.resources.medSupplies > 200 && s.cityStats.publicHealth > 40,
    cooldownTicks: 350,
    stages: [
      {
        id: "mr_stage1",
        title: "MEDICAL RESEARCH BREAKTHROUGH",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "mr_full_fund", label: "FULL FUNDING — TOP PRIORITY", effects: { credits: -30000, medSupplies: -50 }, nextStageId: "mr_stage2_success" },
          { id: "mr_limited", label: "LIMITED TRIALS ONLY", effects: { credits: -10000, medSupplies: -20 }, nextStageId: "mr_stage2_slow" },
          { id: "mr_deny", label: "DENY — TOO EXPERIMENTAL", effects: { happiness: -2 }, nextStageId: null },
        ],
      },
      {
        id: "mr_stage2_success",
        title: "HUMAN TRIALS — REMARKABLE RESULTS",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "mr_mass_produce", label: "MASS PRODUCTION — FREE FOR ALL", effects: { credits: -50000, happiness: 15, unrest: -10, publicHealth: 10 }, nextStageId: "mr_stage3_legacy" },
          { id: "mr_sell", label: "LICENSE TO CORPORATIONS", effects: { credits: 100000, corruption: 5, happiness: 5 }, nextStageId: "mr_stage3_legacy" },
        ],
      },
      {
        id: "mr_stage2_slow",
        title: "LIMITED TRIALS — CAUTIOUS PROGRESS",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "mr_expand_trials", label: "EXPAND THE TRIALS", effects: { credits: -25000, medSupplies: -30 }, nextStageId: "mr_stage2_success" },
          { id: "mr_shelve", label: "SHELVE THE PROJECT", effects: { happiness: -3 }, nextStageId: null },
        ],
      },
      {
        id: "mr_stage3_legacy",
        title: "THE VITAGEN LEGACY",
        severity: "low",
        delayTicks: 20,
        responses: [
          { id: "mr_research_center", label: "ESTABLISH RESEARCH CENTER", effects: { credits: -40000, happiness: 10, publicHealth: 15, employment: 3 }, nextStageId: null },
          { id: "mr_status_quo", label: "MISSION ACCOMPLISHED", effects: { happiness: 8, publicHealth: 8 }, nextStageId: null },
        ],
      },
    ],
  },
  {
    id: "cultural_revolution",
    name: "Cultural Revolution",
    triggerCheck: (s) => s.cityStats.happiness > 45 && s.cityStats.crime < 40 && s.totalTicks > 300,
    cooldownTicks: 400,
    stages: [
      {
        id: "cr_stage1",
        title: "UNDERGROUND ART MOVEMENT DISCOVERED",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "cr_embrace", label: "LEGALIZE AND SUPPORT", effects: { credits: -10000, happiness: 8, lawOrder: -2 }, nextStageId: "cr_stage2_official" },
          { id: "cr_tolerate", label: "LOOK THE OTHER WAY", effects: { happiness: 4 }, nextStageId: "cr_stage2_underground" },
          { id: "cr_suppress", label: "SHUT IT DOWN", effects: { happiness: -6, unrest: 5, lawOrder: 3 }, nextStageId: null },
        ],
      },
      {
        id: "cr_stage2_official",
        title: "CULTURAL DISTRICT ESTABLISHED",
        severity: "low",
        delayTicks: 16,
        responses: [
          { id: "cr_festival", label: "ORGANIZE A CITY FESTIVAL", effects: { credits: -20000, happiness: 12, unrest: -8, crime: -3 }, nextStageId: "cr_stage3_renaissance" },
          { id: "cr_quiet_support", label: "QUIET CONTINUED SUPPORT", effects: { credits: -5000, happiness: 6, unrest: -3 }, nextStageId: "cr_stage3_renaissance" },
        ],
      },
      {
        id: "cr_stage2_underground",
        title: "UNDERGROUND SCENE FLOURISHES",
        severity: "low",
        delayTicks: 12,
        responses: [
          { id: "cr_legalize_now", label: "TIME TO LEGALIZE", effects: { credits: -8000, happiness: 8, lawOrder: -1 }, nextStageId: "cr_stage3_renaissance" },
          { id: "cr_keep_underground", label: "KEEP IT UNDERGROUND", effects: { happiness: 5, corruption: 1 }, nextStageId: null },
        ],
      },
      {
        id: "cr_stage3_renaissance",
        title: "THE MEGACITY RENAISSANCE",
        severity: "low",
        delayTicks: 20,
        responses: [
          { id: "cr_permanent", label: "PERMANENT CULTURAL INVESTMENT", effects: { credits: -30000, happiness: 15, crime: -5, employment: 5, unrest: -10 }, nextStageId: null },
          { id: "cr_self_sustaining", label: "LET IT SUSTAIN ITSELF", effects: { credits: 20000, happiness: 8, corruption: -2 }, nextStageId: null },
        ],
      },
    ],
  },
  ...BUSINESS_EVENT_CHAINS,
  ...RESEARCH_EVENT_CHAINS,
  ...RELIGION_EVENT_CHAINS,
];

export const EVENT_CHAINS: EventChainDef[] = ALL_EVENT_CHAINS.filter(
  (chain) => !isRetiredEventChainId(chain.id),
);

// Task #539: deterministic 0-99 roll derived from the tick counter. Used by
// EventChainResponse.chanceFork so branch outcomes are reproducible for a
// given tick (tests pick totalTicks values to force either side).
export function chainForkRoll(tick: number): number {
  return ((Math.imul(tick, 1103515245) + 12345) >>> 0) % 100;
}

// Task #539: push a stage's news beat onto the city news feed, if it has one.
// pushNewsItem is idempotent by item id, so callers only need to guard against
// spawning the same stage twice (which processEventChainDelays already does).
function emitStageNews(
  s: GameState,
  stage: EventChainStage,
  ctx: Record<string, string> | undefined,
): void {
  if (!stage.news) return;
  const item = stage.news(s, ctx);
  if (!item) return;
  s.newsFeed = pushNewsItem(s.newsFeed ?? [], item);
}

export function checkEventChainTriggers(s: GameState): EventChainDef | null {
  const active = s.activeEventChains ?? [];
  const cooldowns = s.eventChainCooldowns ?? {};
  const eligible: EventChainDef[] = [];
  for (const chain of EVENT_CHAINS) {
    if (isRetiredEventChainId(chain.id)) continue;
    if (active.some((a) => a.chainId === chain.id && !a.resolved)) continue;
    if ((cooldowns[chain.id] ?? 0) > s.totalTicks) continue;
    if (chain.triggerCheck(s)) eligible.push(chain);
  }
  if (eligible.length === 0) return null;
  const seed = (s.totalTicks * 2654435761) >>> 0;
  const idx = seed % eligible.length;
  return eligible[idx];
}

export function startEventChain(s: GameState, chain: EventChainDef): GameEvent | null {
  if (isRetiredEventChainId(chain.id)) return null;
  const firstStage = chain.stages[0];
  if (!firstStage) return null;

  let context: Record<string, string> | undefined;
  if (chain.prepareContext) {
    const ctx = chain.prepareContext(s);
    if (!ctx) return null;
    context = ctx;
  }

  const activeChain: ActiveEventChain = {
    chainId: chain.id,
    currentStageId: firstStage.id,
    startTick: s.totalTicks,
    stageStartTick: s.totalTicks,
    choicesMade: [],
    resolved: false,
    context,
  };

  s.activeEventChains = [...(s.activeEventChains ?? []), activeChain];
  s.eventChainCooldowns = {
    ...(s.eventChainCooldowns ?? {}),
    [chain.id]: s.totalTicks + chain.cooldownTicks,
  };

  emitStageNews(s, firstStage, context);
  return stageToEvent(chain.id, firstStage, s.totalTicks, context);
}

export function advanceEventChain(
  s: GameState,
  chainId: string,
  responseId: string,
): GameEvent | null {
  if (isRetiredEventChainId(chainId)) return null;
  const chains = s.activeEventChains ?? [];
  const idx = chains.findIndex((c) => c.chainId === chainId && !c.resolved);
  if (idx === -1) return null;

  const active = { ...chains[idx] };
  const chainDef = EVENT_CHAINS.find((c) => c.id === chainId);
  if (!chainDef) return null;

  const currentStage = chainDef.stages.find((st) => st.id === active.currentStageId);
  if (!currentStage) return null;

  const response = currentStage.responses.find((r) => r.id === responseId);
  if (!response) return null;

  // Task #214: scale caravan/convoy/transit chain outcomes by the Free Choir
  // transit success modifier so sponsoring the Choir amplifies positive
  // outcomes (and tempers negative ones — applyFreeChoirTransitScale only
  // multiplies the income keys, leaving punitive non-income deltas alone).
  const isTransitChain = FREE_CHOIR_TRANSIT_CHAIN_IDS.has(chainId);
  const scaledEffects = isTransitChain
    ? applyFreeChoirTransitScale(response.effects as Record<string, number | undefined>, s)
    : response.effects;
  applyChainEffects(s, scaledEffects, `chain:${chainId}:${currentStage.id}:${responseId}`);

  // Task #216: surface the Free Choir transit modifier on chain stage outcomes
  // the same way trade_caravan_arrives shows a "choir note" on the base event.
  // Without this, chain stages just silently pay out a different number and the
  // player never learns that Free Choir stance is the lever moving the take.
  if (isTransitChain) {
    const mult = getFreeChoirTransitMultiplier(s);
    if (mult !== 1) {
      const incomeKeys = ["credits", "tradeIncome", "food"] as const;
      const baseEffects = response.effects as Record<string, number | undefined>;
      const movedKeys = incomeKeys.filter((k) => {
        const v = baseEffects[k];
        return typeof v === "number" && v !== 0;
      });
      if (movedKeys.length > 0) {
        const stance = s.faiths?.stances?.["free-choir"];
        const stageTitle = currentStage.title;
        const body = stance === "sponsor"
          ? `Free Choir cantors rode the convoys on "${stageTitle}" — the haul came in ${Math.round((mult - 1) * 100)}% richer than it would have under a neutral stance.`
          : `Without Free Choir route-blessings on "${stageTitle}", wastelander tolls bit ${Math.round((1 - mult) * 100)}% out of the take a neutral stance would have seen.`;
        const intelMsg = {
          id: `chain_choir_${chainId}_${currentStage.id}_${responseId}_${s.totalTicks}`,
          timestamp: { day: Math.floor(s.totalTicks / 4) + 1, tick: s.totalTicks % 4 } as any,
          tick: s.totalTicks,
          category: "intel" as const,
          title: "FREE CHOIR INFLUENCE",
          body,
          read: false,
          priority: "low" as const,
        };

        // Task #219: companion one-line ticker cue showing the scaled
        // credits/tradeIncome/food deltas alongside the Free Choir swing,
        // so the same modifier the EventCard chip and the intel message
        // describe is also visible on the news ticker / messages list when
        // the stage actually resolves. Kept terse on purpose — the intel
        // message carries the narrative; this line is just a tag.
        const labels: Record<typeof incomeKeys[number], string> = {
          credits: "credits",
          tradeIncome: "trade",
          food: "food",
        };
        const parts: string[] = [];
        for (const k of movedKeys) {
          const baseV = baseEffects[k] as number;
          const scaled = Math.round(baseV * mult);
          const sign = scaled > 0 ? "+" : "";
          parts.push(`${labels[k]} ${sign}${scaled}`);
        }
        const pct = Math.round((mult - 1) * 100);
        const swing = pct >= 0 ? `+${pct}%` : `${pct}%`;
        const tickerMsg = {
          id: `chain_choir_ticker_${chainId}_${currentStage.id}_${responseId}_${s.totalTicks}`,
          timestamp: { day: Math.floor(s.totalTicks / 4) + 1, tick: s.totalTicks % 4 } as any,
          tick: s.totalTicks,
          category: "world-news" as const,
          title: "TRADE STAGE RESOLVED",
          body: `${parts.join(" · ")} — Free Choir ${swing}`,
          read: false,
          priority: "low" as const,
        };
        // Single-pass prepend + cap: inbox renders array order without sort,
        // every other engine push uses [new, ...rest].slice(0, cap). We prepend
        // BOTH new messages together so neither evicts the other when the inbox
        // is already at cap (a separate append-then-prepend-and-slice would
        // drop the first one). Ticker first → intel second so the terse cue
        // sits at the very top with the narrative right beneath it.
        s.messages = [tickerMsg, intelMsg, ...(s.messages ?? [])].slice(0, ARRAY_CAPS.messages);
      }
    }
  }
  if (response.bizAction && active.context?.bizUid) {
    applyBusinessChainAction(s, active.context.bizUid, response.bizAction);
  }
  if (response.chainAction && active.context?.chainId) {
    applyCorporateChainAction(s, response.chainAction, active.context.chainId, active.context?.chainId2);
  }
  active.choicesMade = [...active.choicesMade, responseId];

  if (response.unlockTechId && !s.unlockedTechnologies.includes(response.unlockTechId)) {
    s.unlockedTechnologies = [...s.unlockedTechnologies, response.unlockTechId];
    const techDef = TECH_MAP[response.unlockTechId];
    const techLabel = techDef?.name ?? response.unlockTechId.replace(/_/g, " ").toUpperCase();
    if (techDef) {
      const fx = techDef.effects;
      const cs = s.cityStats;
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      if (fx.crime) cs.crime = clamp(cs.crime + fx.crime);
      if (fx.unrest) cs.unrest = clamp(cs.unrest + fx.unrest);
      if (fx.happiness) cs.happiness = clamp(cs.happiness + fx.happiness);
      if (fx.lawOrder) cs.lawOrder = clamp(cs.lawOrder + fx.lawOrder);
      if (fx.corruption) cs.corruption = clamp(cs.corruption + fx.corruption);
      if (fx.infrastructureHealth) {
        const next = applyInfrastructureHealthDelta(
          s,
          fx.infrastructureHealth,
          `chain:${chainId}:${currentStage.id}:${responseId}:unlock:${response.unlockTechId}`,
          `Unlock "${techLabel}"`,
        );
        s.infrastructureLedger = next.infrastructureLedger;
        s.cityStats = next.cityStats;
      }
      if (fx.defenseRating) cs.defenseRating = clamp(cs.defenseRating + fx.defenseRating);
      if (fx.employment) cs.employment = clamp(cs.employment + fx.employment);
      // One-time permanent bump by design, but clamp at the mutation site so
      // no data outlier can ratchet the persistent base rate past the
      // sanitizer's cap between saves.
      if (fx.populationGrowthRate) {
        cs.populationGrowthRate = Math.min(
          MAX_BASE_POP_GROWTH_RATE,
          Math.max(-MAX_BASE_POP_GROWTH_RATE, cs.populationGrowthRate + fx.populationGrowthRate),
        );
      }
    }
    s.messages = [...(s.messages ?? []), {
      id: `story_unlock_${response.unlockTechId}_${s.totalTicks}`,
      timestamp: { day: Math.floor(s.totalTicks / 4) + 1, tick: s.totalTicks % 4 } as any,
      tick: s.totalTicks,
      category: "intel" as const,
      title: "RESEARCH BREAKTHROUGH",
      body: `Story arc discovery has unlocked classified research: ${techLabel}. Check the Research Division.`,
      read: false,
      priority: "high" as const,
    }];
  }

  // Task #539: resolve the optional deterministic chance fork at advance time.
  let nextStageId = response.nextStageId;
  if (response.chanceFork && nextStageId !== null) {
    if (chainForkRoll(s.totalTicks) < response.chanceFork.altChancePct) {
      nextStageId = response.chanceFork.altNextStageId;
    }
  }

  if (!nextStageId) {
    active.resolved = true;
    s.activeEventChains = chains.map((c, i) => (i === idx ? active : c));
    return null;
  }

  const nextStage = chainDef.stages.find((st) => st.id === nextStageId);
  if (!nextStage) {
    active.resolved = true;
    s.activeEventChains = chains.map((c, i) => (i === idx ? active : c));
    return null;
  }

  active.currentStageId = nextStage.id;
  active.stageStartTick = s.totalTicks;
  s.activeEventChains = chains.map((c, i) => (i === idx ? active : c));

  if (nextStage.delayTicks > 0) {
    return null;
  }

  emitStageNews(s, nextStage, active.context);
  return stageToEvent(chainId, nextStage, s.totalTicks, active.context);
}

export function processEventChainDelays(s: GameState, entries: TickEntry[]): void {
  const chains = s.activeEventChains ?? [];
  for (const active of chains) {
    if (active.resolved) continue;
    if (isRetiredEventChainId(active.chainId)) continue;
    const chainDef = EVENT_CHAINS.find((c) => c.id === active.chainId);
    if (!chainDef) continue;
    const stage = chainDef.stages.find((st) => st.id === active.currentStageId);
    if (!stage || stage.delayTicks <= 0) continue;

    const ticksSinceStage = s.totalTicks - active.stageStartTick;
    if (ticksSinceStage >= stage.delayTicks) {
      const alreadyActive = (s.activeEvents ?? []).some(
        (e) => e.id === `chain_${active.chainId}_${stage.id}`,
      );
      if (!alreadyActive) {
        const event = stageToEvent(active.chainId, stage, s.totalTicks, active.context);
        s.activeEvents = [...(s.activeEvents ?? []), event];
        emitStageNews(s, stage, active.context);
        entries.push({
          label: "Event Chain",
          delta: 0,
          unit: "",
          reason: `${chainDef.name}: ${stage.title}`,
          severity: "neutral",
        });
      }
    }
  }
}

function substituteTokens(text: string, ctx?: Record<string, string>): string {
  if (!ctx) return text;
  return text.replace(/\{(\w+)\}/g, (_match, key) => ctx[key] ?? `{${key}}`);
}

function stageToEvent(
  chainId: string,
  stage: EventChainStage,
  timestamp: number,
  ctx?: Record<string, string>,
): GameEvent {
  return {
    id: `chain_${chainId}_${stage.id}`,
    title: substituteTokens(stage.title, ctx),
    severity: stage.severity,
    effects: {},
    responseOptions: stage.responses.map((r) => ({
      id: r.id,
      label: substituteTokens(r.label, ctx),
      effects: r.effects as any,
    })),
    resolved: false,
    chainId,
    timestamp,
  };
}

function applyBusinessChainAction(
  s: GameState,
  bizUid: string,
  action: BusinessChainAction,
): void {
  const econ = s.localEconomy;
  if (!econ) return;
  const idx = econ.businesses.findIndex((b) => b.uid === bizUid);
  if (idx === -1) return;
  const biz = econ.businesses[idx];
  switch (action) {
    case "close_business": {
      econ.closedHistory = [
        {
          uid: biz.uid,
          name: biz.name,
          archetypeId: biz.archetypeId,
          districtId: biz.districtId,
          tier: biz.tier,
          yearsActive: biz.yearsActive,
          closedAtTick: s.totalTicks,
          reason: "Closed following narrative event",
        },
        ...(econ.closedHistory ?? []),
      ].slice(0, 60);
      econ.businesses.splice(idx, 1);
      break;
    }
    case "boost_reputation":
      biz.reputation = Math.min(100, biz.reputation + 20);
      break;
    case "damage_reputation":
      biz.reputation = Math.max(0, biz.reputation - 25);
      break;
    case "promote_to_t2":
      biz.tier = (biz.tier < 3 ? biz.tier + 1 : 3) as 1 | 2 | 3;
      biz.locations = Math.max(2, biz.locations + 2);
      break;
    case "mark_landmark":
      biz.notable = true;
      biz.reputation = Math.min(100, biz.reputation + 10);
      break;
  }
}

function applyCorporateChainAction(
  s: GameState,
  action: CorporateChainAction,
  chainId: string,
  chainId2?: string,
): void {
  // Late import to avoid circular dependency at module load
  const { getChainById, milestonesAlreadyMet } = require("@/engine/corporateChains") as typeof import("@/engine/corporateChains");
  const econ = s.localEconomy;
  if (!econ?.corporateChains) return;
  const idx = econ.corporateChains.findIndex((c) => c.chainId === chainId);
  if (idx === -1) return;
  const chain = econ.corporateChains[idx];

  switch (action) {
    case "break_up_chain": {
      chain.locationCount = Math.max(5, Math.floor(chain.locationCount / 2));
      chain.notableMilestones = milestonesAlreadyMet(chain.locationCount);
      break;
    }
    case "shrink_to_minimum": {
      const def = getChainById(chainId);
      if (def) {
        chain.locationCount = def.baseLocations;
        chain.notableMilestones = milestonesAlreadyMet(chain.locationCount);
      }
      break;
    }
    case "transfer_locations": {
      if (!chainId2) break;
      const tIdx = econ.corporateChains.findIndex((c) => c.chainId === chainId2);
      if (tIdx === -1) break;
      const target = econ.corporateChains[tIdx];
      const targetDef = getChainById(chainId2);
      const cap = targetDef?.maxLocations ?? 200;
      target.locationCount = Math.min(cap, target.locationCount + chain.locationCount);
      target.notableMilestones = milestonesAlreadyMet(target.locationCount);
      econ.corporateChains.splice(idx, 1);
      break;
    }
    case "force_milestone": {
      chain.notableMilestones = milestonesAlreadyMet(chain.locationCount);
      break;
    }
  }
}

const LOYALTY_PREFIX = "loyalty_";

// Task #209: per-loyalty-point share bump applied to each affinity-category
// district when a chain effect targets a faith id that has no backing faction.
// 0.005 keeps a ±3 delta well under one tick of natural Sponsor drift (0.01).
const FAITH_LOYALTY_SHARE_PER_POINT = 0.005;

function applyFaithLoyaltyNudge(s: GameState, id: string, value: number): void {
  if (!isFaithId(id)) return;
  const fs = ensureFaithState(s);
  const def = FAITH_DEFS[id];
  const affinity = new Set<string>(def.affinityCategories);
  const delta = value * FAITH_LOYALTY_SHARE_PER_POINT;
  for (const d of s.districts ?? []) {
    if (!affinity.has(getDistrictCategory(d.id))) continue;
    const cur = fs.districtShares[d.id];
    if (!cur) continue;
    const next: DistrictFaithShares = { ...cur };
    next[id] = Math.max(0, Math.min(1, (next[id] ?? 0) + delta));
    fs.districtShares[d.id] = normalizeShares(next);
  }
}

export function applyChainEffects(
  s: GameState,
  effects: Partial<Record<string, number>>,
  incidentPrefix = "chain",
): void {
  const PERCENTAGE_STATS = new Set<string>([
    "happiness", "crime", "unrest", "employment", "publicHealth",
    "lawOrder", "corruption", "infrastructureHealth",
  ]);
  for (const [key, value] of Object.entries(effects)) {
    if (!value) continue;
    if (key.startsWith(LOYALTY_PREFIX)) {
      const id = key.slice(LOYALTY_PREFIX.length);
      const faction = s.factions.find((f) => f.id === id);
      if (faction) {
        faction.loyalty = Math.max(0, Math.min(100, faction.loyalty + value));
      } else {
        // Task #209: faiths without a backing faction (e.g. "helix-commune")
        // route loyalty deltas to a citywide faith-share nudge in their
        // affinity-category districts so chain effects are not silently dropped.
        // Magnitude is intentionally small (delta * SHARE_PER_LOYALTY) so a
        // typical chain delta of ±3 produces a measurable but not overwhelming
        // share shift, then the existing normalize keeps each district summed to 1.
        applyFaithLoyaltyNudge(s, id, value);
      }
    } else if (key === "population") {
      s.cityStats.population = Math.max(1, s.cityStats.population + value);
      s.demographics.totalPopulation = Math.max(1, s.demographics.totalPopulation + value);
    } else if (key === "tradeIncome") {
      // Trade income is a per-tick rate fully recomputed each tick, so mirror
      // applyEventEffects/applyResponseEffects in events.ts: persist the change
      // in the eventTradeIncome accumulator (re-added into the rate every tick
      // by formulas.ts) and bump the live rate now for instant feedback.
      // Previously this key was silently dropped, so chain payouts like the
      // space elevator's +200/+500 trade income never landed (Steam report).
      s.eventTradeIncome = (s.eventTradeIncome ?? 0) + value;
      s.rates.tradeIncome = (s.rates.tradeIncome ?? 0) + value;
    } else if (key === "infrastructureHealth") {
      const next = applyInfrastructureHealthDelta(
        s,
        value,
        `${incidentPrefix}:infrastructureHealth`,
        "Event chain infrastructure effect",
      );
      s.infrastructureLedger = next.infrastructureLedger;
      s.cityStats = next.cityStats;
    } else if (key === "researchSpeed") {
      // One-time research progress grant. researchProgress is not in the
      // `key in s.cityStats` branch's percentage set and researchSpeed has no
      // stat of its own, so route it explicitly; clamped to [0, target].
      s.cityStats.researchProgress = Math.max(
        0,
        Math.min(s.cityStats.researchTarget, s.cityStats.researchProgress + value),
      );
    } else if (key in s.resources) {
      const rk = key as keyof typeof s.resources;
      applyResourceDelta(s, rk, value);
    } else if (key in s.cityStats) {
      const ck = key as keyof typeof s.cityStats;
      const cur = (s.cityStats[ck] ?? 0) + value;
      s.cityStats[ck] = PERCENTAGE_STATS.has(key) ? Math.max(0, Math.min(100, cur)) : Math.max(0, cur);
    }
  }
}
