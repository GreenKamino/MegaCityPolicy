// ════════════════════════════════════════════════════════════════════════
// RESEARCH-TIED EVENT CHAIN
// ════════════════════════════════════════════════════════════════════════
// Curated chain of 9 one-shot events that bind specific researched
// technologies to narrative consequences. Each event triggers because the
// player has unlocked an "anchor" tech (and has not yet unlocked the
// "successor" tech), and resolves by granting that successor tech via
// unlockTechId. Tier-gated so early-game events cannot fire mid- or
// late-game and vice versa.
//
// Pacing windows (totalTicks ≈ 4 ticks/day). Windows are enforced both
// by tick range and by unlockedTechnologies.length, with strict
// non-overlap on the tech-count axis so MID and LATE chains can never
// be simultaneously eligible:
//   EARLY  — totalTicks  30..240,  unlockedTechnologies.length  <  10  (i.e. 0..9)
//   MID    — totalTicks  80..600,  unlockedTechnologies.length 10..23  (>= 10 && < 24)
//   LATE   — totalTicks 200+,      unlockedTechnologies.length >= 24
//
// Design notes (anchor → grant):
//   re_grid_strain        | EARLY | advanced_fusion_reactors      → smart_grid_load_balancing
//   re_first_harvest      | EARLY | mega_vertical_farming         → automated_crop_monitoring
//   re_brackish_intake    | EARLY | ultra_efficient_desalination  → industrial_waste_purification
//   re_district_audit     | MID   | smart_grid_load_balancing     → district_energy_optimization
//   re_microbial_swap     | MID   | bio_filtration_plants         → advanced_sanitation_chemistry
//   re_ration_failure     | MID   | food_preservation_nanotech    → agricultural_climate_control
//   re_geothermal_breach  | LATE  | autonomous_energy_distribution → urban_geothermal_tapping
//   re_pipeline_skin      | LATE  | stormwater_harvest_systems +
//                                   advanced_sanitation_chemistry → self_repairing_pipeline_materials
//   re_blacksite_signal   | LATE  | story_lazarus_protocol        → story_calcification_cure
//
// All triggers are deterministic functions of GameState. All grants reuse
// the existing unlockTechId path in eventChains.ts (which already guards
// against re-grant at lines ~3086-3090). Cooldown 9999 keeps each chain
// one-shot per save.

import type { EventChainDef } from "@/engine/eventChains";
import type { GameState } from "@/engine/types";

const has = (s: GameState, id: string): boolean =>
  s.unlockedTechnologies.includes(id);

const ticks = (s: GameState): number => s.totalTicks;

const techCount = (s: GameState): number => s.unlockedTechnologies.length;

// True one-shot guard. The base eventChains engine only skips chains
// that are currently active + unresolved, and respects cooldowns. After
// a chain resolves, the entry remains in activeEventChains with
// resolved=true. Checking presence in activeEventChains here makes each
// research chain fire at most once per save, even if the player picks a
// non-unlock response (so the !has(grant) predicate is still true).
const notFiredYet = (s: GameState, chainId: string): boolean =>
  !(s.activeEventChains ?? []).some((a) => a.chainId === chainId);

// ──────────────────────────────────────────────────────────────────────
// EARLY GAME (3)
// ──────────────────────────────────────────────────────────────────────

const RE_GRID_STRAIN: EventChainDef = {
  id: "re_grid_strain",
  name: "First Reactor — Load Strain",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_grid_strain") &&
    ticks(s) > 30 &&
    ticks(s) < 240 &&
    techCount(s) < 10 &&
    has(s, "advanced_fusion_reactors") &&
    !has(s, "smart_grid_load_balancing"),
  stages: [
    {
      id: "rgs_stage1",
      title: "GRID STRAIN — NEW REACTOR",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "rgs_fund",
          label: "FUND THE LOAD-BALANCING PROGRAM",
          effects: { credits: -12000, infrastructureHealth: 3, happiness: 2 },
          nextStageId: null,
          unlockTechId: "smart_grid_load_balancing",
        },
        {
          id: "rgs_throttle",
          label: "THROTTLE THE REACTOR",
          effects: { power: -150, happiness: -2, unrest: 1 },
          nextStageId: null,
        },
        {
          id: "rgs_blame",
          label: "BLAME THE GRID OPERATORS",
          effects: { lawOrder: 1, happiness: -3, corruption: 2 },
          nextStageId: null,
        },
      ],
    },
  ],
};

const RE_FIRST_HARVEST: EventChainDef = {
  id: "re_first_harvest",
  name: "First Harvest — Tower Yields",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_first_harvest") &&
    ticks(s) > 30 &&
    ticks(s) < 240 &&
    techCount(s) < 10 &&
    has(s, "mega_vertical_farming") &&
    !has(s, "automated_crop_monitoring"),
  stages: [
    {
      id: "rfh_stage1",
      title: "FIRST HARVEST — UNEVEN YIELD",
      severity: "medium",
      delayTicks: 0,
      responses: [
        {
          id: "rfh_sensors",
          label: "DEPLOY MONITORING SENSORS",
          effects: { credits: -10000, food: 30, employment: 2 },
          nextStageId: null,
          unlockTechId: "automated_crop_monitoring",
        },
        {
          id: "rfh_manual",
          label: "MANUAL INSPECTIONS",
          effects: { food: 10, employment: 1, happiness: -1 },
          nextStageId: null,
        },
        {
          id: "rfh_cull",
          label: "CULL THE FAILING FLOORS",
          effects: { food: -40, credits: -3000 },
          nextStageId: null,
        },
      ],
    },
  ],
};

const RE_BRACKISH_INTAKE: EventChainDef = {
  id: "re_brackish_intake",
  name: "Brackish Intake — Desal Fouling",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_brackish_intake") &&
    ticks(s) > 30 &&
    ticks(s) < 240 &&
    techCount(s) < 10 &&
    has(s, "ultra_efficient_desalination") &&
    !has(s, "industrial_waste_purification"),
  stages: [
    {
      id: "rbi_stage1",
      title: "DESAL INTAKES FOULING",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "rbi_purify",
          label: "FUND WASTE PURIFICATION RESEARCH",
          effects: { credits: -15000, water: 30, happiness: 2 },
          nextStageId: null,
          unlockTechId: "industrial_waste_purification",
        },
        {
          id: "rbi_replace",
          label: "REPLACE MEMBRANES ON ROTATION",
          effects: { credits: -8000, water: 10 },
          nextStageId: null,
        },
        {
          id: "rbi_deny",
          label: "DENY THE READINGS",
          effects: { corruption: 3, happiness: -2 },
          nextStageId: null,
        },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────
// MID GAME (3)
// ──────────────────────────────────────────────────────────────────────

const RE_DISTRICT_AUDIT: EventChainDef = {
  id: "re_district_audit",
  name: "District Energy Audit",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_district_audit") &&
    ticks(s) > 80 &&
    ticks(s) < 600 &&
    techCount(s) >= 10 &&
    techCount(s) < 24 &&
    has(s, "smart_grid_load_balancing") &&
    !has(s, "district_energy_optimization"),
  stages: [
    {
      id: "rda_stage1",
      title: "DISTRICT ENERGY AUDIT — WASTE EXPOSED",
      severity: "medium",
      delayTicks: 0,
      responses: [
        {
          id: "rda_optimize",
          label: "OPTIMIZE PER DISTRICT",
          effects: { credits: -25000, power: 60, happiness: -2, unrest: 2 },
          nextStageId: null,
          unlockTechId: "district_energy_optimization",
        },
        {
          id: "rda_uniform",
          label: "UNIFORM RATIONING",
          effects: { power: 20, happiness: -1 },
          nextStageId: null,
        },
        {
          id: "rda_shelve",
          label: "SHELVE THE REPORT",
          effects: { corruption: 2, infrastructureHealth: -2 },
          nextStageId: null,
        },
      ],
    },
  ],
};

const RE_MICROBIAL_SWAP: EventChainDef = {
  id: "re_microbial_swap",
  name: "Bio-Filter Microbial Swap",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_microbial_swap") &&
    ticks(s) > 80 &&
    ticks(s) < 600 &&
    techCount(s) >= 10 &&
    techCount(s) < 24 &&
    has(s, "bio_filtration_plants") &&
    !has(s, "advanced_sanitation_chemistry"),
  stages: [
    {
      id: "rms_stage1",
      title: "BIO-FILTER STRAIN COLLAPSE",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "rms_pivot",
          label: "FUND THE CHEMISTRY PIVOT",
          effects: { credits: -22000, water: 25, happiness: 3 },
          nextStageId: null,
          unlockTechId: "advanced_sanitation_chemistry",
        },
        {
          id: "rms_reseed",
          label: "RESEED THE OLD STRAIN",
          effects: { credits: -8000, water: 10 },
          nextStageId: null,
        },
        {
          id: "rms_dump",
          label: "DUMP THE PLANTS, FILTER MANUALLY",
          effects: { water: -10, happiness: -3, unrest: 2 },
          nextStageId: null,
        },
      ],
    },
  ],
};

const RE_RATION_FAILURE: EventChainDef = {
  id: "re_ration_failure",
  name: "Ration Pack Spoilage",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_ration_failure") &&
    ticks(s) > 80 &&
    ticks(s) < 600 &&
    techCount(s) >= 10 &&
    techCount(s) < 24 &&
    has(s, "food_preservation_nanotech") &&
    !has(s, "agricultural_climate_control"),
  stages: [
    {
      id: "rrf_stage1",
      title: "PRESERVED RATIONS FAILING IN THE FIELD",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "rrf_climate",
          label: "BUILD CLIMATE-CONTROLLED FARM BLOCKS",
          effects: { credits: -30000, food: 40, employment: 3 },
          nextStageId: null,
          unlockTechId: "agricultural_climate_control",
        },
        {
          id: "rrf_import",
          label: "IMPORT TO COVER THE GAP",
          effects: { credits: -18000, food: 30, corruption: 1 },
          nextStageId: null,
        },
        {
          id: "rrf_thin",
          label: "THIN THE RATIONS",
          effects: { food: 15, happiness: -3, unrest: 2, corruption: 1 },
          nextStageId: null,
        },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────
// LATE GAME (3)
// ──────────────────────────────────────────────────────────────────────

const RE_GEOTHERMAL_BREACH: EventChainDef = {
  id: "re_geothermal_breach",
  name: "Geothermal Survey Breach",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_geothermal_breach") &&
    ticks(s) > 200 &&
    techCount(s) >= 24 &&
    has(s, "autonomous_energy_distribution") &&
    !has(s, "urban_geothermal_tapping"),
  stages: [
    {
      id: "rgb_stage1",
      title: "DEEP-EARTH SURVEY HITS A HOT SHAFT",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "rgb_tap",
          label: "FUND DEEP TAPPING",
          effects: { credits: -60000, power: 200, happiness: 4, infrastructureHealth: -2 },
          nextStageId: null,
          unlockTechId: "urban_geothermal_tapping",
        },
        {
          id: "rgb_seal",
          label: "SEAL THE SHAFT",
          effects: { credits: -15000, happiness: -2 },
          nextStageId: null,
        },
        {
          id: "rgb_lease",
          label: "LEASE IT TO A CONTRACTOR",
          effects: { credits: 20000, power: 60, corruption: 4 },
          nextStageId: null,
        },
      ],
    },
  ],
};

const RE_PIPELINE_SKIN: EventChainDef = {
  id: "re_pipeline_skin",
  name: "Self-Repairing Pipeline Trial",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_pipeline_skin") &&
    ticks(s) > 200 &&
    techCount(s) >= 24 &&
    has(s, "stormwater_harvest_systems") &&
    has(s, "advanced_sanitation_chemistry") &&
    !has(s, "self_repairing_pipeline_materials"),
  stages: [
    {
      id: "rps_stage1",
      title: "SMART-MATERIAL PIPELINE — FIELD TRIAL",
      severity: "medium",
      delayTicks: 0,
      responses: [
        {
          id: "rps_rollout",
          label: "FUND CITYWIDE ROLLOUT",
          effects: { credits: -75000, water: 50, infrastructureHealth: 6 },
          nextStageId: null,
          unlockTechId: "self_repairing_pipeline_materials",
        },
        {
          id: "rps_phase",
          label: "PHASE THE ROLLOUT",
          effects: { credits: -25000, water: 15, infrastructureHealth: 2 },
          nextStageId: null,
        },
        {
          id: "rps_kill",
          label: "KILL THE PROGRAM",
          effects: { credits: 5000, infrastructureHealth: -3 },
          nextStageId: null,
        },
      ],
    },
  ],
};

const RE_BLACKSITE_SIGNAL: EventChainDef = {
  id: "re_blacksite_signal",
  name: "Lazarus — Calcification Lead",
  cooldownTicks: 9999,
  triggerCheck: (s) =>
    notFiredYet(s, "re_blacksite_signal") &&
    ticks(s) > 200 &&
    techCount(s) >= 24 &&
    has(s, "story_lazarus_protocol") &&
    !has(s, "story_calcification_cure"),
  stages: [
    {
      id: "rbs_stage1",
      title: "BLACKSITE SIGNAL — LAZARUS DERIVATIVE",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "rbs_authorize",
          label: "AUTHORIZE THE TRIAL",
          effects: { credits: -45000, medSupplies: 20, happiness: 4 },
          nextStageId: null,
          unlockTechId: "story_calcification_cure",
        },
        {
          id: "rbs_quiet",
          label: "AUTHORIZE QUIETLY — NO RECORDS",
          effects: { credits: -25000, corruption: 4, happiness: 2 },
          nextStageId: null,
          unlockTechId: "story_calcification_cure",
        },
        {
          id: "rbs_shelve",
          label: "SHELVE THE PROPOSAL",
          effects: { happiness: -2, unrest: 1 },
          nextStageId: null,
        },
      ],
    },
  ],
};

export const RESEARCH_EVENT_CHAINS: EventChainDef[] = [
  RE_GRID_STRAIN,
  RE_FIRST_HARVEST,
  RE_BRACKISH_INTAKE,
  RE_DISTRICT_AUDIT,
  RE_MICROBIAL_SWAP,
  RE_RATION_FAILURE,
  RE_GEOTHERMAL_BREACH,
  RE_PIPELINE_SKIN,
  RE_BLACKSITE_SIGNAL,
];
