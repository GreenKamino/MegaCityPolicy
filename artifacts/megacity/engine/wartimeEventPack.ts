// Task #540: Wartime Events Master pack — twelve war-only events adapted from
// the attached "MEGACITY Wartime Events Master" design document (v1.0.0).
//
// The source document uses a foreign schema (city.atWar flag, stats like
// medical.bedOccupancy, chanceResults, delayedEffects, maxOccurrencesPerWar).
// Each event is translated onto the existing war event system:
//   - Entries are WarEventTemplates spread into WAR_EVENT_POOL, so they can
//     only fire through generateWarEvent while hostile factions exist (the
//     game's operative "at war" gate for this pool).
//   - Every PDF effect is mapped onto the real engine stat keys the event
//     dispatchers understand (credits, unrest, crime, happiness, lawOrder,
//     corruption, defenseRating, medSupplies, tradeIncome, employment, and the
//     food/water/power/fuel resources). PDF-only stats (bedOccupancy,
//     propaganda.control, morale, legitimacy…) map to the nearest real key.
//   - chanceResults and delayedEffects are folded deterministically into the
//     chosen response; effects apply the probability-blended outcome (the same
//     convention the existing war pool uses for risky choices).
//   - maxOccurrencesPerWar is enforced per instigating faction by
//     state.warEventOccurrences. The long per-event retrigger cooldowns remain
//     a secondary pacing layer. The document's cooldownDays convert at ~96
//     ticks/day (the anniversary calendar's 34,560 ticks/year).
//   - Each event's linked ON_EVENT_START news story becomes a news-feed
//     headline pushed when the event fires (wartimeEventNewsItem, called from
//     applyEventEffects), following the house ticker voice.
//
// Kept in its own file so the pack merges cleanly alongside the other event
// pack tasks; events.ts spreads it into WAR_EVENT_POOL with a one-line edit.

import type { WarEventTemplate } from "@/engine/events";
import type { GameEvent, GameState } from "@/engine/types";
import type { NewsFeedItem } from "@/engine/newsFeed";

// ~96 ticks per in-game day (34,560 ticks/year ÷ 360).
const TICKS_PER_DAY = 96;

export const WARTIME_MASTER_EVENTS: WarEventTemplate[] = [
  {
    id: "war_evt_air_raid_false_alarm",
    title: "FALSE AIR-RAID ALARM",
    severity: "medium",
    maxOccurrencesPerWar: 2,
    effects: { unrest: 3, happiness: -2, tradeIncome: -100 },
    responseOptions: [
      {
        id: "war_alarm_full_investigation",
        label: "LAUNCH FULL INVESTIGATION",
        effects: { credits: -7000, lawOrder: 3, unrest: -2, defenseRating: 1 },
      },
      {
        id: "war_alarm_dismiss_as_drill",
        label: "DECLARE IT A DRILL",
        effects: { lawOrder: 2, happiness: -1, unrest: 1, defenseRating: 1 },
      },
      {
        id: "war_alarm_disable_alerts",
        label: "DISABLE AUTOMATIC ALERTS",
        effects: { unrest: -1, defenseRating: -2 },
      },
    ],
  },
  {
    id: "war_evt_field_hospital_overflow",
    title: "FIELD HOSPITAL OVERFLOW",
    severity: "high",
    maxOccurrencesPerWar: 4,
    effects: { happiness: -4, unrest: 2, medSupplies: -20 },
    responseOptions: [
      {
        id: "war_hosp_requisition_civilian",
        label: "REQUISITION CIVILIAN HALLS",
        effects: { credits: -12000, medSupplies: 20, unrest: 2, happiness: 1, defenseRating: 1 },
      },
      {
        id: "war_hosp_military_priority",
        label: "MILITARY CASUALTIES FIRST",
        effects: { defenseRating: 3, happiness: -7, unrest: 5, medSupplies: -10 },
      },
      {
        id: "war_hosp_allied_mission",
        label: "REQUEST ALLIED MEDICS",
        effects: { medSupplies: 30, happiness: 2, tradeIncome: -100 },
      },
    ],
  },
  {
    id: "war_evt_munitions_factory_explosion",
    title: "MUNITIONS FACTORY EXPLOSION",
    severity: "critical",
    maxOccurrencesPerWar: 2,
    effects: { credits: -8000, happiness: -6, unrest: 4, defenseRating: -4 },
    responseOptions: [
      {
        id: "war_muni_flood_magazines",
        label: "FLOOD THE MAGAZINES",
        effects: { water: -60, defenseRating: -2, happiness: 1, unrest: -1 },
      },
      {
        id: "war_muni_fire_crews_inside",
        label: "SEND CREWS INSIDE",
        effects: { credits: -2000, defenseRating: 2, happiness: -1, unrest: 1 },
      },
      {
        id: "war_muni_seal_and_investigate",
        label: "SEAL DISTRICT — SABOTAGE INQUIRY",
        effects: { lawOrder: 3, unrest: 3, crime: -2, tradeIncome: -150 },
      },
    ],
  },
  {
    id: "war_evt_enemy_broadcast_hijack",
    title: "ENEMY BROADCAST HIJACK",
    severity: "medium",
    maxOccurrencesPerWar: 3,
    effects: { unrest: 5, happiness: -2, defenseRating: -1, tradeIncome: -100 },
    responseOptions: [
      {
        id: "war_hijack_shutdown_networks",
        label: "SHUT DOWN THE NETWORKS",
        effects: { unrest: -2, happiness: -2, lawOrder: 2, tradeIncome: -150 },
      },
      {
        id: "war_hijack_counter_broadcast",
        label: "COUNTER-BROADCAST LIVE",
        effects: { credits: -3500, unrest: -4, happiness: 2, defenseRating: 1 },
      },
      {
        id: "war_hijack_feed_false_data",
        label: "FEED THEM FALSE DATA",
        effects: { unrest: 1, defenseRating: 3, corruption: 1, lawOrder: 1 },
      },
    ],
  },
  {
    id: "war_evt_conscript_train_missing",
    title: "CONSCRIPT COLUMN MISSING",
    severity: "high",
    maxOccurrencesPerWar: 2,
    effects: { defenseRating: -3, unrest: 3, happiness: -1 },
    responseOptions: [
      {
        id: "war_conscript_district_sweep",
        label: "DISTRICT-BY-DISTRICT SWEEP",
        effects: { credits: -5000, unrest: 3, defenseRating: 3, crime: -3, lawOrder: 2 },
      },
      {
        id: "war_conscript_amnesty_window",
        label: "48-HOUR AMNESTY",
        effects: { defenseRating: 2, unrest: -2, lawOrder: -2, happiness: 1 },
      },
      {
        id: "war_conscript_write_off",
        label: "WRITE OFF, SUPPRESS THE REPORT",
        effects: { corruption: 2, defenseRating: -1, unrest: -1, lawOrder: -1 },
      },
    ],
  },
  {
    id: "war_evt_power_grid_targeted",
    title: "POWER GRID UNDER ATTACK",
    severity: "critical",
    maxOccurrencesPerWar: 5,
    effects: { power: -80, happiness: -4, medSupplies: -10, tradeIncome: -150 },
    responseOptions: [
      {
        id: "war_grid_hospitals_first",
        label: "HOSPITALS AND WATER FIRST",
        effects: { credits: -4000, power: 30, medSupplies: 10, water: 20, happiness: 2 },
      },
      {
        id: "war_grid_war_industry_first",
        label: "WAR INDUSTRY FIRST",
        effects: { credits: -4000, power: 30, defenseRating: 3, unrest: 3, medSupplies: -5, tradeIncome: 100 },
      },
      {
        id: "war_grid_island_districts",
        label: "ISLAND THE GRID",
        effects: { credits: -9000, power: 50, defenseRating: 2, lawOrder: 1 },
      },
    ],
  },
  {
    id: "war_evt_refugee_gate_crush",
    title: "PANIC AT THE REFUGEE GATE",
    severity: "high",
    maxOccurrencesPerWar: 4,
    effects: { unrest: 4, lawOrder: -2, happiness: -1 },
    responseOptions: [
      {
        id: "war_gate_emergency_intake",
        label: "OPEN EMERGENCY INTAKE",
        effects: { food: -60, water: -60, happiness: 2, employment: 2, unrest: 1 },
      },
      {
        id: "war_gate_unarmed_teams",
        label: "UNARMED CROWD TEAMS",
        effects: { credits: -3000, unrest: -2, happiness: 1, lawOrder: 1, medSupplies: -5 },
      },
      {
        id: "war_gate_seal_with_force",
        label: "SEAL THE GATE — AUTHORIZE FORCE",
        effects: { lawOrder: 3, unrest: 8, happiness: -6, crime: 2 },
      },
    ],
  },
  {
    id: "war_evt_fuel_ration_black_market",
    title: "MILITARY FUEL ON THE BLACK MARKET",
    severity: "medium",
    maxOccurrencesPerWar: 4,
    effects: { fuel: -35, corruption: 2, crime: 3, defenseRating: -1 },
    responseOptions: [
      {
        id: "war_fuel_raid_network",
        label: "RAID THE NETWORK",
        effects: { credits: -4500, crime: -4, corruption: -1, unrest: 2, lawOrder: 3, defenseRating: 1 },
      },
      {
        id: "war_fuel_audit_logistics",
        label: "AUDIT LOGISTICS COMMAND",
        effects: { corruption: -4, lawOrder: 2, defenseRating: -1, tradeIncome: 100 },
      },
      {
        id: "war_fuel_buy_back",
        label: "BUY IT BACK QUIETLY",
        effects: { credits: -11000, corruption: 3, crime: 1, defenseRating: 2 },
      },
    ],
  },
  {
    id: "war_evt_unexploded_ordnance_school",
    title: "UNEXPLODED WARHEAD BENEATH A SCHOOL",
    severity: "high",
    maxOccurrencesPerWar: 3,
    effects: { unrest: 2, happiness: -2 },
    responseOptions: [
      {
        id: "war_uxo_evacuate_disarm",
        label: "EVACUATE AND DISARM",
        effects: { credits: -6000, happiness: 1, lawOrder: 1, unrest: 1 },
      },
      {
        id: "war_uxo_encase_concrete",
        label: "ENCASE IT IN CONCRETE",
        effects: { credits: -3000, happiness: -1, unrest: -1 },
      },
      {
        id: "war_uxo_conceal_danger",
        label: "CONCEAL THE DANGER",
        effects: { corruption: 2, unrest: -1, lawOrder: -2, happiness: 1 },
      },
    ],
  },
  {
    id: "war_evt_allied_unit_brawl",
    title: "ALLIED TROOPS RIOT IN ENTERTAINMENT DISTRICT",
    severity: "medium",
    maxOccurrencesPerWar: 2,
    effects: { unrest: 4, crime: 2, happiness: -2, tradeIncome: -100 },
    responseOptions: [
      {
        id: "war_brawl_joint_inquiry",
        label: "JOINT INQUIRY, COMPENSATE CIVILIANS",
        effects: { credits: -9000, unrest: -3, happiness: 1, lawOrder: 1, tradeIncome: 100 },
      },
      {
        id: "war_brawl_arrest_allies",
        label: "ARREST THEM UNDER CITY LAW",
        effects: { lawOrder: 3, unrest: -1, defenseRating: -2, tradeIncome: -100 },
      },
      {
        id: "war_brawl_blame_gangs",
        label: "BLAME LOCAL GANGS",
        effects: { crime: 4, corruption: 2, happiness: -1, defenseRating: 1 },
      },
    ],
  },
  {
    id: "war_evt_frontline_factory_mutiny",
    title: "WAR FACTORY WALKOUT",
    severity: "high",
    maxOccurrencesPerWar: 3,
    effects: { defenseRating: -2, unrest: 4, tradeIncome: -150 },
    responseOptions: [
      {
        id: "war_walkout_hazard_pay",
        label: "GRANT HAZARD PAY",
        effects: { credits: -16000, happiness: 3, unrest: -4, defenseRating: 2, employment: 1 },
      },
      {
        id: "war_walkout_militarize",
        label: "MILITARIZE THE PLANTS",
        effects: { defenseRating: 3, unrest: 7, happiness: -2, lawOrder: 2, corruption: 1 },
      },
      {
        id: "war_walkout_refugee_labor",
        label: "RECRUIT REFUGEE CREWS",
        effects: { credits: -6000, employment: 2, defenseRating: 1, unrest: 2, happiness: 1 },
      },
    ],
  },
  {
    id: "war_evt_enemy_prisoners_food_crisis",
    title: "PRISONER COMPOUND FOOD CRISIS",
    severity: "medium",
    maxOccurrencesPerWar: 2,
    effects: { unrest: 2, food: -20 },
    responseOptions: [
      {
        id: "war_pow_full_rations",
        label: "MAINTAIN FULL RATIONS",
        effects: { food: -60, credits: -3000, lawOrder: 2, happiness: -1, unrest: -1 },
      },
      {
        id: "war_pow_equal_reduction",
        label: "REDUCE RATIONS EQUALLY",
        effects: { food: 20, happiness: -3, unrest: 2, lawOrder: 1 },
      },
      {
        id: "war_pow_cut_prisoners_first",
        label: "CUT PRISONER RATIONS FIRST",
        effects: { happiness: 1, lawOrder: -2, corruption: 1, unrest: 1, crime: 2 },
      },
    ],
  },
];

export type WartimeCustodySource = {
  id: string;
  count: number;
  originKind: "faction";
  originId: string | null;
  originLabel: string;
};

/**
 * The prisoner-compound crisis is an aggregate POW source, not a named
 * detainee. Keep its subject ID tied to the persisted event instance so
 * replaying a response cannot create another copy of the same group.
 */
export function wartimeEventCustodySource(state: GameState, event: Pick<GameEvent, "id" | "timestamp" | "factionId">): WartimeCustodySource | null {
  if (event.id !== "war_evt_enemy_prisoners_food_crisis") return null;
  const faction = event.factionId ? state.factions.find((entry) => entry.id === event.factionId) : undefined;
  return {
    id: `wartime-prisoners-${event.id}-${event.factionId ?? "unknown"}-${event.timestamp}`,
    count: 24,
    originKind: "faction",
    originId: event.factionId ?? null,
    originLabel: faction?.name ?? "Unknown hostile force",
  };
}

// Long per-event retrigger cooldowns from the PDF's cooldownDays, converted at
// TICKS_PER_DAY. They remain a pacing layer on top of maxOccurrencesPerWar:
// generateWarEvent stamps state.eventTriggerCooldowns[id] at spawn time and
// skips any pack event whose stamp is younger than its cooldown.
export const WARTIME_MASTER_COOLDOWN_TICKS: Record<string, number> = {
  war_evt_air_raid_false_alarm: 30 * TICKS_PER_DAY,
  war_evt_field_hospital_overflow: 18 * TICKS_PER_DAY,
  war_evt_munitions_factory_explosion: 45 * TICKS_PER_DAY,
  war_evt_enemy_broadcast_hijack: 24 * TICKS_PER_DAY,
  war_evt_conscript_train_missing: 35 * TICKS_PER_DAY,
  war_evt_power_grid_targeted: 20 * TICKS_PER_DAY,
  war_evt_refugee_gate_crush: 16 * TICKS_PER_DAY,
  war_evt_fuel_ration_black_market: 21 * TICKS_PER_DAY,
  war_evt_unexploded_ordnance_school: 28 * TICKS_PER_DAY,
  war_evt_allied_unit_brawl: 32 * TICKS_PER_DAY,
  war_evt_frontline_factory_mutiny: 26 * TICKS_PER_DAY,
  war_evt_enemy_prisoners_food_crisis: 30 * TICKS_PER_DAY,
};

// ON_EVENT_START linked-news stories from the document, rewritten in the
// house ticker voice (WAR DESK tag, dry broadcast copy, no exclamation
// marks). Keyed by event id; wartimeEventNewsItem returns null for ids
// outside the pack so applyEventEffects can call it unconditionally.
const WARTIME_MASTER_HEADLINES: Record<string, string> = {
  war_evt_air_raid_false_alarm:
    "WAR DESK: SIRENS SEND EASTERN DISTRICTS INTO SHELTERS — NO HOSTILE AIRCRAFT CROSSED THE PERIMETER — EXPLANATION PENDING",
  war_evt_field_hospital_overflow:
    "WAR DESK: TRAUMA WARDS EXCEED EMERGENCY CAPACITY — BLOOD CENTERS OPEN AROUND THE CLOCK — CASUALTIES STILL ARRIVING",
  war_evt_munitions_factory_explosion:
    "WAR DESK: NIGHT SKY BURNS ABOVE THE ARMAMENTS DISTRICT — RESIDENTS ORDERED INDOORS — FALLING DEBRIS ADVISORY IN EFFECT",
  war_evt_enemy_broadcast_hijack:
    "WAR DESK: HOSTILE SIGNAL SEIZES PUBLIC CHANNELS — AUTHORITIES URGE CITIZENS NOT TO REPEAT UNVERIFIED CLAIMS",
  war_evt_conscript_train_missing:
    "WAR DESK: MOBILIZATION CONVOY FAILS TO REPORT — CIVILIANS ASKED TO REPORT ABANDONED MILITARY VEHICLES",
  war_evt_power_grid_targeted:
    "WAR DESK: BLACKOUTS FOLLOW COORDINATED GRID STRIKES — REPAIR CREWS WAIT ON ORDNANCE TEAMS BEFORE ENTERING SUBSTATIONS",
  war_evt_refugee_gate_crush:
    "WAR DESK: CROWD SURGES AT OUTER INTAKE GATE — BARRIERS FAIL UNDER PRESSURE — FAMILIES DIRECTED TO ASSEMBLY AREAS",
  war_evt_fuel_ration_black_market:
    "WAR DESK: DIVERTED MILITARY FUEL FOUND IN CIVILIAN MARKET — LOGISTICS COMMAND PROMISES FULL INVENTORY REVIEW",
  war_evt_unexploded_ordnance_school:
    "WAR DESK: SCHOOL SHELTER CLOSED AFTER WARHEAD DISCOVERY — RESIDENTS MOVED WHILE SPECIALISTS ASSESS THE DEVICE",
  war_evt_allied_unit_brawl:
    "WAR DESK: ALLIED TROOPS CLASH WITH LOCAL SECURITY — BOTH COMMANDS DISPUTE RESPONSIBILITY — DAMAGE EXTENSIVE",
  war_evt_frontline_factory_mutiny:
    "WAR DESK: DEFENSE WORKERS HALT PRODUCTION — SUPPLY OFFICIALS WARN OF FRONTLINE DELIVERY DELAYS",
  war_evt_enemy_prisoners_food_crisis:
    "WAR DESK: FOOD SHORTAGE REACHES MILITARY DETENTION CAMPS — HUMANITARIAN MONITORS REQUEST CAMP ACCESS",
};

export function wartimeEventNewsItem(state: GameState, eventId: string): NewsFeedItem | null {
  const headline = WARTIME_MASTER_HEADLINES[eventId];
  if (!headline) return null;
  return {
    id: `news-${eventId}-${state.totalTicks}`,
    headline,
    tick: state.totalTicks,
  };
}
