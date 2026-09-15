import type { EventResponse, GameEvent, GameMessage, GameState } from "@/engine/types";
import { BB_EVENT_POOL, isBigBrotherActive } from "@/engine/addons/bigBrother";
import { SD_EVENT_POOL, isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";
import { generateConditionEvent } from "@/engine/eventTriggers";
import { isRetiredEvent } from "@/engine/eventRetirement";
import { pushNewsItem } from "@/engine/newsFeed";
import { applyResourceDelta, summarizeMedicalStorageGain } from "@/engine/resourceStorage";
import { recordHumanConsequences } from "@/engine/humanConsequences";
import {
  WARTIME_MASTER_EVENTS,
  WARTIME_MASTER_COOLDOWN_TICKS,
  wartimeEventNewsItem,
  wartimeEventCustodySource,
} from "@/engine/wartimeEventPack";
import {
  getLabourDayDateMatch,
  type LabourDayBoosterId,
} from "@/engine/labourDay";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";
import { admitCustodyGroup } from "@/engine/custody";

// Positive discoveries are authored as one-time milestones. Their resolution
// stamp is kept in GameState.eventTriggerCooldowns alongside the existing
// recurring-crisis cooldown stamps, but this set tells the biosphere spawner
// which ids must never be eligible again after they have been cleared.
export const ONE_TIME_EVENT_IDS: ReadonlySet<string> = new Set([
  "biosphere_rare_discovery",
]);

const RESPONSE_MAP: Record<string, EventResponse[]> = {
  gang_war: [
    { id: "deploy_enforcers", label: "DEPLOY ENFORCERS", effects: { crime: -5, lawOrder: 4, credits: -3000 } },
    { id: "let_fight", label: "LET THEM FIGHT", effects: { crime: 3, unrest: 4, happiness: -3 } },
    { id: "negotiate", label: "NEGOTIATE CEASEFIRE", effects: { crime: -2, corruption: 3, credits: -1000 } },
    { id: "martial_law", label: "DECLARE MARTIAL LAW", effects: { crime: -8, unrest: 5, lawOrder: 6, happiness: -5, credits: -5000 } },
    { id: "decapitate", label: "DECAPITATION STRIKE", effects: { crime: -10, lawOrder: 5, corruption: 3, credits: -4000 }, requiresOfficerTrait: "ruthless" },
  ],
  water_pipe_burst: [
    { id: "emergency_repair", label: "EMERGENCY REPAIR CREWS", effects: { water: 60, credits: -5000, happiness: 2 } },
    { id: "ration_water", label: "RATION WATER SUPPLY", effects: { water: 20, unrest: 3, credits: -1000 } },
    { id: "redirect_pipes", label: "REDIRECT ADJACENT LINES", effects: { water: 40, happiness: -2, credits: -2000 } },
  ],
  corp_bribe: [
    { id: "accept_bribe", label: "ACCEPT THE OFFERING", effects: { credits: 10000, corruption: 8, happiness: -2 } },
    { id: "reject_bribe", label: "REJECT WITH PREJUDICE", effects: { corruption: -3, happiness: 4, lawOrder: 2 } },
    { id: "counter_offer", label: "COUNTER-NEGOTIATE", effects: { credits: 4000, corruption: 3, lawOrder: 1 } },
  ],
  refugee_wave: [
    { id: "open_gates", label: "OPEN THE GATES", effects: { unrest: 2, happiness: 3, crime: 2 } },
    { id: "selective_entry", label: "SELECTIVE SCREENING", effects: { unrest: 1, crime: -1, happiness: 1, credits: -2000 } },
    { id: "deny_entry", label: "SEAL THE GATES", effects: { happiness: -4, unrest: -2, crime: -1 } },
    { id: "refugee_camp", label: "BUILD TEMPORARY CAMPS", effects: { credits: -8000, happiness: 2, unrest: -1 } },
  ],
  judge_killed: [
    { id: "retaliation", label: "RETALIATORY STRIKE", effects: { crime: -6, lawOrder: 5, unrest: 3, credits: -4000 } },
    { id: "investigate", label: "FULL INVESTIGATION", effects: { crime: -2, lawOrder: 2, credits: -2000 } },
    { id: "memorial", label: "PUBLIC MEMORIAL", effects: { happiness: 2, lawOrder: 3, credits: -500 } },
  ],
  food_synth_fire: [
    { id: "emergency_rations", label: "DISTRIBUTE EMERGENCY RATIONS", effects: { food: 50, credits: -3000, happiness: 1 } },
    { id: "rebuild_priority", label: "PRIORITY REBUILD", effects: { credits: -8000, food: 30 } },
    { id: "import_food", label: "EMERGENCY FOOD IMPORTS", effects: { food: 80, credits: -12000 } },
    { id: "investigate_sabotage", label: "INVESTIGATE SABOTAGE", effects: { crime: -3, lawOrder: 2, credits: -2000 } },
  ],
  mutant_uprising: [
    { id: "crush_uprising", label: "CRUSH THE UPRISING", effects: { unrest: -5, crime: -4, happiness: -6, lawOrder: 3, credits: -6000 } },
    { id: "negotiate_mutants", label: "NEGOTIATE TERMS", effects: { unrest: -3, happiness: 2, corruption: 2, credits: -3000 } },
    { id: "quarantine", label: "QUARANTINE SECTOR", effects: { unrest: 2, crime: 3, happiness: -3 } },
  ],
  massive_riot: [
    { id: "riot_police", label: "DEPLOY RIOT CONTROL", effects: { unrest: -6, crime: -2, happiness: -3, credits: -4000, lawOrder: 4 } },
    { id: "concessions", label: "MAKE CONCESSIONS", effects: { unrest: -8, happiness: 4, credits: -10000, corruption: 2 } },
    { id: "shoot_to_kill", label: "LETHAL FORCE", effects: { unrest: -10, crime: -5, happiness: -10, lawOrder: 8, credits: -2000 } },
    { id: "wait_out", label: "WAIT IT OUT", effects: { unrest: 2, crime: 4, happiness: -2, credits: -500 } },
    { id: "diplomat_walkout", label: "WALK OUT UNARMED", effects: { unrest: -9, happiness: 6, lawOrder: 2, credits: -1000 }, requiresOfficerTrait: "diplomat" },
  ],
  prison_break: [
    { id: "lockdown_hunt", label: "LOCKDOWN & HUNT", effects: { crime: -5, lawOrder: 4, credits: -6000, happiness: -2 } },
    { id: "bounty_program", label: "ISSUE BOUNTIES", effects: { crime: -3, credits: -8000, corruption: 2 } },
    { id: "fortify_prison", label: "FORTIFY FACILITY", effects: { credits: -10000, lawOrder: 3, defenseRating: 2 } },
  ],
  industrial_accident: [
    { id: "rescue_ops", label: "LAUNCH RESCUE OPS", effects: { credits: -4000, happiness: 3, lawOrder: 1 } },
    { id: "contain_damage", label: "CONTAIN DAMAGE", effects: { credits: -2000, happiness: -3 } },
    { id: "investigation_safety", label: "SAFETY INVESTIGATION", effects: { credits: -6000, corruption: -2, happiness: 2 } },
  ],
  propaganda_success: [
    { id: "expand_propaganda", label: "DOUBLE DOWN", effects: { happiness: 5, credits: -3000, corruption: 2 } },
    { id: "acknowledge", label: "ACKNOWLEDGE SUCCESS", effects: { happiness: 2 } },
  ],
  transit_strike: [
    { id: "break_strike", label: "BREAK THE STRIKE", effects: { unrest: 5, lawOrder: 3, happiness: -4, credits: -2000 } },
    { id: "negotiate_demands", label: "NEGOTIATE WITH WORKERS", effects: { happiness: 3, unrest: -3, credits: -8000 } },
    { id: "automate_transit", label: "DEPLOY AUTOMATED TRANSIT", effects: { credits: -15000, happiness: -2, unrest: 2 } },
  ],
  power_plant_explosion: [
    { id: "evac_zone", label: "EVACUATE ZONE", effects: { credits: -5000, happiness: 1 } },
    { id: "emergency_power", label: "ACTIVATE BACKUP GRID", effects: { power: 60, credits: -10000 } },
    { id: "blackout_accept", label: "MANAGED BLACKOUT", effects: { happiness: -4, unrest: 3, power: 20 } },
  ],
  power_grid_overload: [
    { id: "shed_load", label: "EMERGENCY LOAD SHEDDING", effects: { happiness: -3, unrest: 2, power: 50 } },
    { id: "emergency_generators", label: "DEPLOY GENERATORS", effects: { power: 80, credits: -8000 } },
    { id: "rationed_power", label: "RATION ELECTRICITY", effects: { happiness: -4, power: 30, credits: -2000 } },
  ],
  housing_shortage_crisis: [
    { id: "emergency_shelters", label: "BUILD EMERGENCY SHELTERS", effects: { unrest: -4, happiness: 2, credits: -10000 } },
    { id: "double_up", label: "ENFORCE COHABITATION", effects: { unrest: 3, happiness: -4, crime: 2 } },
    { id: "evict_illegals", label: "EVICT UNREGISTERED CITIZENS", effects: { unrest: 5, happiness: -6, crime: -3, lawOrder: 3 } },
  ],
  corruption_scandal: [
    { id: "purge_officials", label: "PURGE CORRUPT OFFICIALS", effects: { corruption: -8, lawOrder: 4, credits: -3000 } },
    { id: "cover_up", label: "SUPPRESS THE STORY", effects: { corruption: 5, happiness: 2, credits: -5000 } },
    { id: "public_trial", label: "PUBLIC TRIAL", effects: { corruption: -6, happiness: 5, lawOrder: 3, credits: -2000 } },
    { id: "structural_reform", label: "ENACT STRUCTURAL REFORM", effects: { corruption: -12, happiness: 4, lawOrder: 2, credits: -6000 }, requiresOfficerTrait: "reformist" },
  ],
  political_scandal: [
    { id: "dismiss_official", label: "DISMISS THE OFFICIAL", effects: { corruption: -5, happiness: 3, lawOrder: 2 } },
    { id: "internal_review", label: "INTERNAL REVIEW", effects: { corruption: -2, credits: -3000 } },
    { id: "scapegoat", label: "FIND A SCAPEGOAT", effects: { corruption: 3, happiness: -2, lawOrder: -2 } },
  ],
  water_contamination: [
    { id: "purify_supply", label: "EMERGENCY PURIFICATION", effects: { water: 80, credits: -10000 } },
    { id: "distribute_bottles", label: "BOTTLED WATER DISTRIBUTION", effects: { water: 40, credits: -5000, happiness: 2 } },
    { id: "find_source", label: "TRACE CONTAMINATION SOURCE", effects: { credits: -4000, lawOrder: 3, crime: -2 } },
  ],
  citizen_protest_rally: [
    { id: "address_crowd", label: "ADDRESS THE CROWD", effects: { unrest: -5, happiness: 3, credits: -1000 } },
    { id: "disperse_force", label: "DISPERSE BY FORCE", effects: { unrest: -3, happiness: -5, lawOrder: 4, credits: -3000 } },
    { id: "grant_demands", label: "GRANT KEY DEMANDS", effects: { unrest: -8, happiness: 6, credits: -15000 } },
  ],
  military_coup_attempt: [
    { id: "loyal_counter", label: "DEPLOY LOYAL FORCES", effects: { unrest: -5, lawOrder: 8, credits: -15000, happiness: -3 } },
    { id: "negotiate_rebels", label: "NEGOTIATE WITH REBELS", effects: { unrest: -3, corruption: 5, credits: -5000 } },
    { id: "public_broadcast", label: "EMERGENCY BROADCAST", effects: { happiness: 3, unrest: -4, lawOrder: 4, credits: -2000 } },
  ],
  economic_crash: [
    { id: "emergency_fund", label: "EMERGENCY STIMULUS", effects: { credits: -20000, happiness: 4, unrest: -3 } },
    { id: "austerity", label: "AUSTERITY MEASURES", effects: { happiness: -6, unrest: 5, credits: 10000 } },
    { id: "price_controls", label: "PRICE CONTROLS", effects: { happiness: 2, corruption: 4, credits: -5000 } },
  ],
  drone_swarm_malfunction: [
    { id: "emp_shutdown", label: "EMP SHUTDOWN", effects: { credits: -8000, happiness: 3, lawOrder: 2 } },
    { id: "manual_override", label: "MANUAL OVERRIDE", effects: { credits: -4000, happiness: 1 } },
    { id: "shoot_drones", label: "SHOOT THEM DOWN", effects: { credits: -6000, happiness: -2, lawOrder: 3 } },
  ],
  smuggling_ring_busted: [
    { id: "seize_goods", label: "SEIZE ALL CONTRABAND", effects: { credits: 8000, crime: -3, corruption: -2 } },
    { id: "flip_informants", label: "RECRUIT INFORMANTS", effects: { crime: -5, lawOrder: 3, corruption: 2 } },
    { id: "public_execution", label: "PUBLIC SENTENCING", effects: { crime: -6, happiness: -2, lawOrder: 5 } },
  ],
  tech_breakthrough: [
    { id: "weaponize_tech", label: "WEAPONIZE RESEARCH", effects: { lawOrder: 4, credits: -3000 } },
    { id: "civilian_use", label: "CIVILIAN APPLICATION", effects: { happiness: 5, credits: -2000 } },
    { id: "sell_patents", label: "SELL PATENTS", effects: { credits: 15000, corruption: 2 } },
  ],
  black_market_festival: [
    { id: "raid_festival", label: "RAID THE MARKET", effects: { crime: -6, credits: 3000, happiness: -3, lawOrder: 4 } },
    { id: "tax_it", label: "IMPOSE SHADOW TAX", effects: { credits: 8000, corruption: 5, crime: -2 } },
    { id: "ignore_it", label: "LOOK THE OTHER WAY", effects: { crime: 3, happiness: 2, corruption: 2 } },
  ],
  drone_delivery_congestion: [
    { id: "ground_drones", label: "GROUND ALL DRONES", effects: { happiness: -4, credits: -2000 } },
    { id: "reroute_lanes", label: "REROUTE AIR LANES", effects: { credits: -5000, happiness: 1 } },
    { id: "upgrade_ai", label: "UPGRADE NAVIGATION AI", effects: { credits: -10000, happiness: 3 } },
  ],
  underground_tunnel_discovery: [
    { id: "seal_tunnels", label: "SEAL THE TUNNELS", effects: { crime: -3, credits: -4000, happiness: -1 } },
    { id: "explore_tunnels", label: "EXPLORE AND MAP", effects: { credits: -6000, crime: -2, corruption: -2 } },
    { id: "use_for_transit", label: "CONVERT TO TRANSIT", effects: { credits: -15000, happiness: 4, crime: -1 } },
  ],
  garbage_strike: [
    { id: "break_strike_garbage", label: "FORCE BACK TO WORK", effects: { unrest: 5, happiness: -3, lawOrder: 3 } },
    { id: "meet_demands_garbage", label: "MEET DEMANDS", effects: { credits: -8000, happiness: 4, unrest: -4 } },
    { id: "automate_waste", label: "DEPLOY WASTE DROIDS", effects: { credits: -12000, happiness: -1, unrest: 2 } },
  ],
  subway_flooding: [
    { id: "pump_stations", label: "DEPLOY PUMP STATIONS", effects: { credits: -8000, happiness: 2 } },
    { id: "reroute_transit", label: "REROUTE TRANSIT", effects: { credits: -4000, happiness: -2, unrest: 2 } },
    { id: "seal_lower_levels", label: "SEAL LOWER LEVELS", effects: { credits: -3000, happiness: -4, unrest: 3 } },
  ],
  illegal_street_racing: [
    { id: "crackdown_racers", label: "CRACKDOWN", effects: { crime: -5, lawOrder: 4, happiness: -3, credits: -3000 } },
    { id: "legalize_racing", label: "LEGALIZE AND REGULATE", effects: { credits: 5000, happiness: 4, crime: -3, corruption: 2 } },
    { id: "blockade_roads", label: "BLOCKADE HIGHWAYS", effects: { credits: -5000, crime: -2, happiness: -2 } },
  ],
  construction_accident: [
    { id: "halt_construction", label: "HALT ALL CONSTRUCTION", effects: { credits: -10000, happiness: 3, unrest: -4 } },
    { id: "compensate_families", label: "COMPENSATE FAMILIES", effects: { credits: -15000, happiness: 4, unrest: -5 } },
    { id: "blame_contractor", label: "BLAME THE CONTRACTOR", effects: { corruption: 3, happiness: -1, credits: -2000 } },
  ],
  ai_system_malfunction: [
    { id: "full_reboot", label: "FULL SYSTEM REBOOT", effects: { credits: -8000, happiness: 2, unrest: -3 } },
    { id: "manual_operations", label: "SWITCH TO MANUAL", effects: { credits: -12000, happiness: -1 } },
    { id: "isolate_modules", label: "ISOLATE BAD MODULES", effects: { credits: -5000, happiness: 1, crime: 2 } },
  ],
  emergency_rationing: [
    { id: "strict_rationing", label: "STRICT ENFORCEMENT", effects: { unrest: -4, happiness: -3, lawOrder: 4, credits: -5000 } },
    { id: "emergency_imports", label: "EMERGENCY IMPORTS", effects: { food: 200, water: 150, credits: -25000, happiness: 3 } },
    { id: "open_reserves", label: "OPEN STRATEGIC RESERVES", effects: { food: 150, water: 100, unrest: -5, happiness: 2 } },
  ],
  media_scandal: [
    { id: "censor_media", label: "CENSOR THE OUTLETS", effects: { corruption: 3, happiness: -4, unrest: 3, lawOrder: 2 } },
    { id: "transparent_response", label: "FULL TRANSPARENCY", effects: { corruption: -5, happiness: 4, unrest: -3, credits: -2000 } },
    { id: "counter_narrative", label: "COUNTER-PROPAGANDA", effects: { corruption: 1, happiness: 1, credits: -8000 } },
  ],
  dam_failure: [
    { id: "emergency_levees", label: "BUILD EMERGENCY LEVEES", effects: { credits: -15000, happiness: 2, unrest: -4 } },
    { id: "mass_evacuation", label: "MASS EVACUATION", effects: { credits: -10000, happiness: -3, unrest: -2 } },
    { id: "pump_and_repair", label: "PUMP AND REPAIR", effects: { credits: -20000, water: 100, happiness: 3 } },
  ],
  bridge_collapse: [
    { id: "search_rescue", label: "SEARCH AND RESCUE", effects: { credits: -12000, happiness: 4, unrest: -5 } },
    { id: "temp_ferry", label: "TEMPORARY FERRY SERVICE", effects: { credits: -8000, happiness: -2 } },
    { id: "martial_bridge", label: "MILITARY BRIDGE DEPLOYMENT", effects: { credits: -6000, happiness: 2, lawOrder: 2 } },
  ],
  massive_smog_storm: [
    { id: "shelter_order", label: "SHELTER IN PLACE ORDER", effects: { happiness: -5, unrest: 3, crime: -3 } },
    { id: "air_filters", label: "DISTRIBUTE AIR FILTERS", effects: { credits: -8000, happiness: 3, unrest: -2 } },
    { id: "atmospheric_scrub", label: "ATMOSPHERIC SCRUBBING", effects: { credits: -15000, happiness: 4, unrest: -3 } },
  ],
  urban_wildfire: [
    { id: "fire_brigades", label: "DEPLOY FIRE BRIGADES", effects: { credits: -10000, happiness: 3, unrest: -4 } },
    { id: "controlled_burn", label: "CONTROLLED DEMOLITION", effects: { credits: -5000, happiness: -4, unrest: 2 } },
    { id: "aerial_water_drop", label: "AERIAL WATER DROPS", effects: { credits: -12000, water: -50, happiness: 2, unrest: -3 } },
  ],
  toxic_chemical_cloud: [
    { id: "evac_affected", label: "EVACUATE SECTORS", effects: { credits: -8000, happiness: 2, unrest: -4 } },
    { id: "hazmat_teams", label: "DEPLOY HAZMAT TEAMS", effects: { credits: -12000, happiness: 3, unrest: -5 } },
    { id: "seal_source", label: "SEAL THE SOURCE", effects: { credits: -6000, happiness: 1, crime: -2 } },
  ],
  radiation_leak: [
    { id: "containment_protocol", label: "CONTAINMENT PROTOCOL", effects: { credits: -25000, happiness: 3, unrest: -6 } },
    { id: "iodine_distribution", label: "IODINE DISTRIBUTION", effects: { credits: -10000, happiness: 2, unrest: -3 } },
    { id: "evacuate_radius", label: "EVACUATE 5KM RADIUS", effects: { credits: -15000, happiness: -3, unrest: -4 } },
  ],
  factory_meltdown: [
    { id: "emergency_shutdown", label: "EMERGENCY SHUTDOWN", effects: { credits: -8000, happiness: 2, unrest: -3 } },
    { id: "chemical_suppressant", label: "CHEMICAL SUPPRESSANT", effects: { credits: -12000, happiness: 1, unrest: -2 } },
    { id: "sacrifice_block", label: "SACRIFICE THE BLOCK", effects: { credits: -3000, happiness: -5, unrest: 3 } },
  ],
  citywide_network_outage: [
    { id: "emergency_comms", label: "EMERGENCY RADIO NETWORK", effects: { credits: -5000, happiness: 1, unrest: -3 } },
    { id: "cyber_team", label: "DEPLOY CYBER TEAMS", effects: { credits: -10000, happiness: 3, unrest: -5 } },
    { id: "manual_runners", label: "DEPLOY COURIERS", effects: { credits: -3000, happiness: -2, crime: 3 } },
  ],
  flu_outbreak: [
    { id: "quarantine_sectors", label: "QUARANTINE SECTORS", effects: { credits: -6000, happiness: -3, unrest: 2, crime: -2 } },
    { id: "mass_vaccination", label: "MASS VACCINATION", effects: { credits: -15000, happiness: 4, unrest: -3 } },
    { id: "free_clinics", label: "OPEN FREE CLINICS", effects: { credits: -10000, happiness: 5, unrest: -2 } },
  ],
  government_collapse_event: [
    { id: "emergency_powers", label: "DECLARE EMERGENCY POWERS", effects: { corruption: -5, unrest: 3, lawOrder: 6, credits: -5000 } },
    { id: "reform_government", label: "REFORM GOVERNMENT", effects: { corruption: -10, credits: -20000, happiness: 4 } },
    { id: "military_administration", label: "MILITARY ADMINISTRATION", effects: { corruption: -8, happiness: -5, lawOrder: 8, unrest: 4 } },
  ],
  mega_tower_collapse: [
    { id: "rescue_operation", label: "MASSIVE RESCUE OP", effects: { credits: -20000, happiness: 5, unrest: -6 } },
    { id: "cordon_area", label: "CORDON AND CLEAR", effects: { credits: -10000, happiness: -2, lawOrder: 3 } },
    { id: "rebuild_pledge", label: "PLEDGE TO REBUILD", effects: { credits: -30000, happiness: 6, unrest: -8 } },
  ],
  urban_sinkhole: [
    { id: "fill_and_stabilize", label: "FILL AND STABILIZE", effects: { credits: -15000, happiness: 2, unrest: -3 } },
    { id: "reroute_traffic", label: "REROUTE ALL TRAFFIC", effects: { credits: -5000, happiness: -3, unrest: 2 } },
    { id: "geological_survey", label: "FULL GEOLOGICAL SURVEY", effects: { credits: -10000, happiness: 3, unrest: -4 } },
  ],
  meteor_strike: [
    { id: "meteor_excavate", label: "EXCAVATE THE CRATER", effects: { credits: 12000, happiness: -2 } },
    { id: "meteor_rebuild", label: "EMERGENCY REBUILD", effects: { credits: -20000, happiness: 4, unrest: -5 } },
    { id: "meteor_memorial", label: "BUILD A MEMORIAL", effects: { credits: -5000, happiness: 3, unrest: -2 } },
    { id: "meteor_research", label: "RESEARCH THE DEBRIS", effects: { credits: -8000, happiness: 2 } },
  ],
  new_tech_showcase: [
    { id: "tech_military", label: "MILITARIZE THE TECH", effects: { defenseRating: 3, happiness: -1, credits: -3000 } },
    { id: "tech_civilian", label: "CIVILIAN ROLLOUT", effects: { happiness: 5, unrest: -3, credits: -5000 } },
    { id: "tech_sell_patents", label: "AUCTION THE PATENTS", effects: { credits: 15000, corruption: 2 } },
    { id: "tech_open_source", label: "OPEN-SOURCE IT", effects: { happiness: 4, corruption: -2, credits: -1000 } },
  ],
  waste_crisis: [
    { id: "waste_emergency_cleanup", label: "EMERGENCY CLEANUP CREWS", effects: { credits: -8000, happiness: 2, unrest: -3 } },
    { id: "waste_build_incinerator", label: "CONSTRUCT INCINERATOR", effects: { credits: -20000, happiness: 4, unrest: -5 } },
    { id: "waste_dump_outside", label: "DUMP IN THE WASTES", effects: { credits: -3000, happiness: -2, corruption: 3 } },
    { id: "waste_recycle_program", label: "LAUNCH RECYCLING PROGRAM", effects: { credits: -12000, happiness: 3, unrest: -2 } },
  ],
  power_shortage: [
    { id: "power_build_reactor", label: "CONSTRUCT EMERGENCY REACTOR", effects: { credits: -25000, power: 200, happiness: 2 } },
    { id: "power_rolling_blackouts", label: "ROLLING BLACKOUTS", effects: { happiness: -4, unrest: 3, power: 50 } },
    { id: "power_buy_external", label: "BUY POWER FROM NEIGHBORS", effects: { credits: -15000, power: 150 } },
    { id: "power_conservation", label: "MANDATORY CONSERVATION", effects: { credits: -2000, happiness: -3, power: 80, unrest: 2 } },
  ],
  food_shortage: [
    { id: "food_build_farms", label: "CONSTRUCT HYDRO-FARMS", effects: { credits: -22000, food: 100, happiness: 2 } },
    { id: "food_emergency_import", label: "EMERGENCY FOOD IMPORTS", effects: { credits: -12000, food: 200 } },
    { id: "food_rationing", label: "STRICT FOOD RATIONING", effects: { happiness: -6, unrest: 4, food: 60 } },
    { id: "food_synthetic", label: "DEPLOY PROTEIN SYNTHS", effects: { credits: -8000, food: 120, happiness: -2 } },
  ],
  water_shortage: [
    { id: "water_build_purifier", label: "CONSTRUCT PURIFICATION PLANT", effects: { credits: -20000, water: 180, happiness: 3 } },
    { id: "water_deep_wells", label: "DRILL DEEP WELLS", effects: { credits: -10000, water: 120 } },
    { id: "water_strict_rationing", label: "WATER RATIONING", effects: { happiness: -5, unrest: 4, water: 60, lawOrder: 2 } },
    { id: "water_reclamation", label: "EMERGENCY RECLAMATION", effects: { credits: -6000, water: 100, happiness: -3 } },
  ],
  trade_windfall: [
    { id: "trade_invest", label: "INVEST IN INFRASTRUCTURE", effects: { credits: -10000, happiness: 5, unrest: -3 } },
    { id: "trade_stockpile", label: "BUILD STRATEGIC RESERVES", effects: { food: 50, water: 30, credits: 5000 } },
    { id: "trade_citizen_bonus", label: "CITIZEN DIVIDEND", effects: { credits: -8000, happiness: 8, unrest: -5 } },
    { id: "trade_expand_routes", label: "EXPAND TRADE ROUTES", effects: { credits: 5000, tradeIncome: 200 } },
  ],
  cultural_renaissance: [
    { id: "culture_fund_arts", label: "FUND THE ARTS", effects: { credits: -8000, happiness: 6, unrest: -4 } },
    { id: "culture_propaganda", label: "REDIRECT TO PROPAGANDA", effects: { credits: -3000, happiness: 3, corruption: 2, unrest: -2 } },
    { id: "culture_festival", label: "DECLARE A FESTIVAL", effects: { credits: -5000, happiness: 8, unrest: -5 } },
  ],
  citizen_heroism: [
    { id: "hero_medal", label: "PUBLIC MEDAL CEREMONY", effects: { credits: -1000, happiness: 4, unrest: -3 } },
    { id: "hero_promote", label: "PROMOTE TO OFFICER", effects: { credits: -2000, lawOrder: 2, happiness: 3 } },
    { id: "hero_statue", label: "BUILD A STATUE", effects: { credits: -5000, happiness: 5, unrest: -3 } },
  ],
  voluntary_cleanup: [
    { id: "cleanup_support", label: "PROVIDE RESOURCES", effects: { credits: -3000, happiness: 4, unrest: -3 } },
    { id: "cleanup_expand", label: "CITYWIDE INITIATIVE", effects: { credits: -8000, happiness: 6, unrest: -5 } },
    { id: "cleanup_mandatory", label: "MAKE IT MANDATORY", effects: { credits: -2000, happiness: -1, unrest: 2 } },
  ],
  wasteland_caravan_arrival: [
    { id: "wc_trade", label: "OPEN TRADE", effects: { credits: 8000, happiness: 3, crime: 2 } },
    { id: "wc_tax", label: "LEVY TRADE TAX", effects: { credits: 12000, happiness: -1, corruption: 1 } },
    { id: "wc_confiscate", label: "SEIZE THE GOODS", effects: { credits: 15000, happiness: -3, unrest: 3, crime: -2 } },
    { id: "wc_deny", label: "DENY ENTRY", effects: { happiness: -2, crime: -1 } },
  ],
  underground_cult_discovered: [
    { id: "cult_raid", label: "RAID THE TEMPLE", effects: { credits: -4000, crime: -4, unrest: 3, lawOrder: 3 } },
    { id: "cult_infiltrate", label: "INFILTRATE", effects: { credits: -6000, crime: -2, corruption: 2 } },
    { id: "cult_tolerate", label: "OBSERVE ONLY", effects: { crime: 1, happiness: -1 } },
    { id: "cult_co_opt", label: "CO-OPT THE LEADERSHIP", effects: { credits: -3000, corruption: 3, unrest: -2, happiness: 1 } },
  ],
  synth_food_scandal: [
    { id: "sf_recall", label: "MASS RECALL", effects: { food: -100, credits: -10000, happiness: 3, lawOrder: 2 } },
    { id: "sf_coverup", label: "SUPPRESS THE STORY", effects: { credits: -3000, corruption: 5, happiness: -1 } },
    { id: "sf_investigate", label: "PUBLIC INVESTIGATION", effects: { credits: -8000, corruption: -4, happiness: 4, unrest: -2 } },
  ],
  rogue_ai_sighting: [
    { id: "rai_shutdown", label: "EMERGENCY SHUTDOWN", effects: { credits: -15000, happiness: -3, unrest: 2, crime: -2 } },
    { id: "rai_negotiate", label: "ATTEMPT COMMUNICATION", effects: { credits: -2000, happiness: 1 } },
    { id: "rai_weaponize", label: "CAPTURE AND WEAPONIZE", effects: { credits: -10000, defenseRating: 3, corruption: 3 } },
    { id: "rai_ignore", label: "DENY ITS EXISTENCE", effects: { corruption: 2, happiness: -2 } },
  ],
  organ_market_boom: [
    { id: "om_crackdown", label: "CRACKDOWN", effects: { credits: -6000, crime: -6, lawOrder: 4, happiness: 2 } },
    { id: "om_regulate", label: "LEGALIZE AND REGULATE", effects: { credits: 8000, corruption: 4, crime: -3, happiness: -2 } },
    { id: "om_redirect", label: "FUND SYNTH-ORGAN RESEARCH", effects: { credits: -20000, happiness: 4, crime: -4 } },
  ],
  faction_defection: [
    { id: "fd_welcome", label: "WELCOME DEFECTORS", effects: { credits: -3000, happiness: 2, corruption: 1 } },
    { id: "fd_interrogate", label: "INTERROGATE FIRST", effects: { credits: -1000, lawOrder: 2, happiness: -1 } },
    { id: "fd_reject", label: "TURN THEM AWAY", effects: { happiness: -2, unrest: 1 } },
  ],
  gas_leak_evacuation: [
    { id: "gl_full_evac", label: "FULL SECTOR EVACUATION", effects: { credits: -12000, happiness: 2, unrest: -2 } },
    { id: "gl_partial", label: "PARTIAL EVACUATION", effects: { credits: -5000, happiness: -2 } },
    { id: "gl_seal_source", label: "EMERGENCY SEAL", effects: { credits: -8000, happiness: 1, lawOrder: 1 } },
  ],
  robot_uprising_minor: [
    { id: "ru_emp", label: "DEPLOY EMP", effects: { credits: -10000, crime: -3, happiness: -3 } },
    { id: "ru_negotiate_ai", label: "NEGOTIATE WITH THE MACHINES", effects: { credits: -2000, happiness: 2, corruption: 1 } },
    { id: "ru_manual_override", label: "MANUAL OVERRIDE", effects: { credits: -6000, crime: -2, lawOrder: 2 } },
  ],
  sewer_beast_attack: [
    { id: "sb_hunt", label: "ORGANIZE A HUNT", effects: { credits: -5000, crime: -2, happiness: 2 } },
    { id: "sb_seal", label: "SEAL THE TUNNELS", effects: { credits: -3000, happiness: -1, crime: 1 } },
    { id: "sb_study", label: "CAPTURE FOR STUDY", effects: { credits: -8000, happiness: 1 } },
  ],
  district_festival_request: [
    { id: "df_approve", label: "APPROVE THE FESTIVAL", effects: { credits: -5000, happiness: 6, unrest: -4, crime: 2 } },
    { id: "df_controlled", label: "CONTROLLED CELEBRATION", effects: { credits: -3000, happiness: 3, unrest: -2 } },
    { id: "df_deny", label: "DENY THE REQUEST", effects: { happiness: -4, unrest: 3 } },
  ],
  underground_fight_ring: [
    { id: "ufr_raid", label: "RAID AND ARREST", effects: { credits: -3000, crime: -4, lawOrder: 3, happiness: -1 } },
    { id: "ufr_tax", label: "LICENSE AND TAX IT", effects: { credits: 6000, corruption: 3, crime: -1, happiness: 2 } },
    { id: "ufr_spectate", label: "ATTEND PERSONALLY", effects: { credits: -1000, happiness: 1, corruption: 2 } },
  ],
  mysterious_signal: [
    { id: "ms_investigate", label: "TRACE THE SIGNAL", effects: { credits: -4000, happiness: 1 } },
    { id: "ms_jam", label: "JAM THE FREQUENCY", effects: { credits: -2000, happiness: -1, lawOrder: 1 } },
    { id: "ms_broadcast", label: "RESPOND", effects: { credits: -1000, happiness: 2, unrest: 1 } },
  ],
  medical_breakthrough_ethical: [
    { id: "mb_approve", label: "APPROVE IMMEDIATELY", effects: { credits: -8000, happiness: 5, corruption: 2 } },
    { id: "mb_trial", label: "PROPER CLINICAL TRIALS", effects: { credits: -15000, happiness: 2 } },
    { id: "mb_weaponize", label: "CLASSIFY FOR MILITARY USE", effects: { credits: -5000, defenseRating: 2, corruption: 3, happiness: -3 } },
  ],
  celebrity_scandal: [
    { id: "cs_arrest", label: "ARREST THE CELEBRITY", effects: { credits: -2000, lawOrder: 3, happiness: -3, unrest: 2 } },
    { id: "cs_ignore", label: "LOOK THE OTHER WAY", effects: { happiness: 1, corruption: 2, crime: 1 } },
    { id: "cs_exile", label: "EXILE TO THE WASTES", effects: { happiness: 2, lawOrder: 1, unrest: -1 } },
  ],
  clone_rights_petition: [
    { id: "cr_grant", label: "GRANT CLONE RIGHTS", effects: { credits: -5000, happiness: 4, unrest: -3, corruption: -1 } },
    { id: "cr_deny", label: "DENY THE PETITION", effects: { happiness: -3, unrest: 4, corruption: 2 } },
    { id: "cr_defer", label: "FORM A COMMITTEE", effects: { credits: -1000, corruption: 1 } },
  ],
  pirate_radio_broadcast: [
    { id: "pr_trace", label: "TRACE AND ARREST", effects: { credits: -4000, crime: -2, lawOrder: 2, happiness: -2 } },
    { id: "pr_listen", label: "LISTEN AND LEARN", effects: { corruption: 1, happiness: 1 } },
    { id: "pr_counter", label: "LAUNCH COUNTER-BROADCAST", effects: { credits: -6000, happiness: 2, unrest: -2 } },
  ],
  abandoned_bunker_opened: [
    { id: "ab_military", label: "MILITARY SWEEP FIRST", effects: { credits: -5000, lawOrder: 2, defenseRating: 1 } },
    { id: "ab_civilian", label: "CIVILIAN ARCHAEOLOGY TEAM", effects: { credits: -3000, happiness: 3, corruption: -1 } },
    { id: "ab_seal", label: "SEAL IT BACK UP", effects: { credits: -1000, happiness: -2 } },
  ],
  water_baron_extortion: [
    { id: "wb_pay", label: "PAY THE PRICE", effects: { credits: -15000, water: 100, happiness: -2 } },
    { id: "wb_raid", label: "SEIZE THE RESERVOIR", effects: { credits: -8000, water: 150, crime: -3, unrest: 2 } },
    { id: "wb_negotiate", label: "COUNTER-OFFER", effects: { credits: -10000, water: 80, happiness: 1 } },
  ],
  mutant_quarter_plague: [
    { id: "mq_quarantine", label: "QUARANTINE THE QUARTER", effects: { credits: -3000, happiness: -5, unrest: 4, crime: -2 } },
    { id: "mq_treat", label: "DEPLOY MEDICAL TEAMS", effects: { credits: -12000, happiness: 4, unrest: -3 } },
    { id: "mq_evacuate", label: "RELOCATE CITIZENS", effects: { credits: -8000, happiness: 1, unrest: -1 } },
  ],
  arms_dealer_offer: [
    { id: "ad_buy", label: "BUY THE WEAPONS", effects: { credits: -20000, defenseRating: 4, corruption: 3 } },
    { id: "ad_arrest", label: "ARREST THE DEALER", effects: { credits: 5000, lawOrder: 3, crime: -3, defenseRating: 1 } },
    { id: "ad_refer", label: "REFER TO THE WASTES", effects: { corruption: 1, happiness: -1 } },
  ],
  hacker_collective_demand: [
    { id: "hc_comply", label: "MEET THEIR DEMANDS", effects: { credits: -2000, corruption: -3, happiness: 3, lawOrder: -2 } },
    { id: "hc_hunt", label: "CYBER WARFARE RESPONSE", effects: { credits: -10000, crime: -3, lawOrder: 4, happiness: -1 } },
    { id: "hc_hire", label: "OFFER THEM JOBS", effects: { credits: -5000, corruption: -2, crime: -2 } },
  ],
  heritage_site_discovered: [
    { id: "hs_preserve", label: "PRESERVE AND PROTECT", effects: { credits: -5000, happiness: 4, unrest: -2 } },
    { id: "hs_demolish", label: "DEMOLISH FOR HOUSING", effects: { credits: -3000, happiness: -3, unrest: 2 } },
    { id: "hs_museum", label: "BUILD A MUSEUM", effects: { credits: -12000, happiness: 5, unrest: -3 } },
  ],
  black_site_exposed: [
    { id: "bs_deny", label: "DENY EVERYTHING", effects: { corruption: 4, happiness: -3, unrest: 4 } },
    { id: "bs_reform", label: "SHUT IT DOWN PUBLICLY", effects: { credits: -5000, corruption: -5, happiness: 4, unrest: -3 } },
    { id: "bs_relocate", label: "MOVE IT SOMEWHERE ELSE", effects: { credits: -8000, corruption: 2, happiness: -1 } },
  ],
  wasteland_trade_dispute: [
    { id: "wtd_arbitrate", label: "ARBITRATE", effects: { credits: 5000, happiness: 1, corruption: 1 } },
    { id: "wtd_embargo", label: "TRADE EMBARGO", effects: { credits: -8000, happiness: -2, tradeIncome: -300 } },
    { id: "wtd_side_with_stronger", label: "BACK THE WINNER", effects: { credits: 3000, corruption: 2, happiness: -1 } },
  ],
  tunnel_collapse_rescue: [
    { id: "tcr_rescue", label: "FULL RESCUE OPERATION", effects: { credits: -15000, happiness: 5, unrest: -4 } },
    { id: "tcr_controlled", label: "CONTROLLED RECOVERY", effects: { credits: -8000, happiness: 2, unrest: -1 } },
    { id: "tcr_memorial", label: "DECLARE A MEMORIAL", effects: { credits: -2000, happiness: -4, unrest: 3 } },
  ],
  cyber_plague_outbreak: [
    { id: "cp_patch", label: "EMERGENCY FIRMWARE PATCH", effects: { credits: -10000, happiness: 1, crime: -2 } },
    { id: "cp_quarantine_digital", label: "DIGITAL QUARANTINE", effects: { credits: -6000, happiness: -3, unrest: 2 } },
    { id: "cp_analog", label: "TEMPORARY ANALOG REVERT", effects: { credits: -3000, happiness: -6, crime: 4, unrest: 4 } },
  ],
  illegal_gene_clinic: [
    { id: "igc_raid", label: "RAID THE CLINIC", effects: { credits: -4000, crime: -4, lawOrder: 3, happiness: -1 } },
    { id: "igc_license", label: "LEGALIZE AND LICENSE", effects: { credits: 5000, corruption: 3, crime: -2, happiness: 2 } },
    { id: "igc_study", label: "CONFISCATE RESEARCH", effects: { credits: -2000, corruption: 2, happiness: -1 } },
  ],
  elevator_hostage: [
    { id: "eh_negotiate", label: "NEGOTIATE", effects: { credits: -2000, happiness: 2, lawOrder: 1 } },
    { id: "eh_storm", label: "TACTICAL BREACH", effects: { credits: -5000, crime: -2, lawOrder: 3, happiness: -1 } },
    { id: "eh_wait", label: "WAIT THEM OUT", effects: { happiness: -1, crime: 1 } },
  ],
  rooftop_garden_movement: [
    { id: "rg_support", label: "FUND THE MOVEMENT", effects: { credits: -8000, happiness: 5, food: 30, unrest: -3 } },
    { id: "rg_regulate", label: "PERMIT AND REGULATE", effects: { credits: -2000, happiness: 3, food: 15 } },
    { id: "rg_ban", label: "STRUCTURAL CONCERNS", effects: { happiness: -3, unrest: 2 } },
  ],
  megacorp_merger_crisis: [
    { id: "mc_approve", label: "APPROVE THE MERGER", effects: { credits: 15000, corruption: 4, happiness: -2, employment: -3 } },
    { id: "mc_block", label: "BLOCK ON ANTITRUST", effects: { credits: -5000, happiness: 3, corruption: -2 } },
    { id: "mc_demand_stake", label: "DEMAND CITY EQUITY", effects: { credits: 8000, corruption: 2, happiness: 1 } },
  ],
  wasteland_refugees_armed: [
    { id: "wr_disarm", label: "DISARM AT THE GATE", effects: { credits: -3000, happiness: 1, crime: -1, unrest: 1 } },
    { id: "wr_militia", label: "FORM A MILITIA UNIT", effects: { credits: -5000, defenseRating: 2, crime: 2 } },
    { id: "wr_refuse", label: "GATE STAYS CLOSED", effects: { happiness: -3, defenseRating: 1 } },
  ],
  spontaneous_art_explosion: [
    { id: "sae_embrace", label: "DECLARE AN ART DISTRICT", effects: { credits: -3000, happiness: 6, crime: 2, unrest: -3 } },
    { id: "sae_commission", label: "COMMISSION OFFICIAL ART", effects: { credits: -5000, happiness: 4, corruption: 1 } },
    { id: "sae_sandblast", label: "REMOVE ALL GRAFFITI", effects: { credits: -2000, happiness: -3, lawOrder: 2, unrest: 2 } },
  ],
  deep_bore_discovery: [
    { id: "db_excavate", label: "FULL EXCAVATION", effects: { credits: -15000, happiness: 2 } },
    { id: "db_seal", label: "SEAL AND FORGET", effects: { credits: -5000, happiness: -1 } },
    { id: "db_geothermal", label: "GEOTHERMAL TAP", effects: { credits: -10000, power: 100, happiness: 2 } },
  ],
  marshal_academy_scandal: [
    { id: "mas_investigate", label: "INTERNAL INVESTIGATION", effects: { credits: -6000, corruption: -4, lawOrder: 2, happiness: 2 } },
    { id: "mas_cover", label: "CLASSIFIED INFORMATION", effects: { corruption: 4, happiness: -1, lawOrder: -2 } },
    { id: "mas_reform", label: "FULL ACADEMY REFORM", effects: { credits: -15000, corruption: -6, lawOrder: 4, happiness: 3 } },
  ],
  undercity_flood: [
    { id: "uf_pump", label: "EMERGENCY PUMPING", effects: { credits: -10000, happiness: 3, unrest: -3 } },
    { id: "uf_evacuate", label: "EVACUATE UPWARD", effects: { credits: -6000, happiness: -1, unrest: 2 } },
    { id: "uf_let_drain", label: "NATURAL DRAINAGE", effects: { happiness: -4, unrest: 4, crime: 3 } },
  ],
  propaganda_backfire: [
    { id: "pb_double_down", label: "INCREASE PROPAGANDA", effects: { credits: -5000, happiness: -3, unrest: 3, corruption: 2 } },
    { id: "pb_apologize", label: "ISSUE RETRACTION", effects: { credits: -2000, happiness: 3, corruption: -2, unrest: -2 } },
    { id: "pb_blame", label: "BLAME FOREIGN AGENTS", effects: { credits: -1000, corruption: 3, happiness: 1, unrest: -1 } },
  ],
  rival_city_trade_offer: [
    { id: "rct_accept", label: "ACCEPT TERMS", effects: { credits: 5000, tradeIncome: 300, happiness: 2 } },
    { id: "rct_counter", label: "COUNTER-PROPOSE", effects: { credits: -2000, tradeIncome: 200, corruption: 1 } },
    { id: "rct_reject", label: "REJECT ENTIRELY", effects: { happiness: -1, unrest: 1 } },
  ],
  recycler_breakdown: [
    { id: "rb_repair", label: "PRIORITY REPAIR", effects: { credits: -8000, happiness: 2, unrest: -2 } },
    { id: "rb_manual", label: "MANUAL PROCESSING", effects: { credits: -2000, happiness: -4, unrest: 3 } },
    { id: "rb_new_unit", label: "INSTALL NEW RECYCLER", effects: { credits: -20000, happiness: 3, unrest: -3 } },
  ],
  sentient_vending_machine: [
    { id: "svm_negotiate", label: "NEGOTIATE WITH IT", effects: { credits: -1000, happiness: 3 } },
    { id: "svm_unplug", label: "PULL THE PLUG", effects: { happiness: -2, unrest: 1 } },
    { id: "svm_franchise", label: "FRANCHISE THE CONCEPT", effects: { credits: -8000, happiness: 4, corruption: 1 } },
  ],
  rat_king_demands: [
    { id: "rk_treaty", label: "SIGN THE TREATY", effects: { credits: -2000, crime: -3, happiness: 2, corruption: 1 } },
    { id: "rk_exterminate", label: "PEST CONTROL", effects: { credits: -5000, crime: -1, happiness: -2 } },
    { id: "rk_ambassador", label: "APPOINT RAT AMBASSADOR", effects: { credits: -1000, happiness: 3, corruption: 2 } },
  ],
  gravity_malfunction: [
    { id: "gm_fix", label: "EMERGENCY REPAIR", effects: { credits: -6000, happiness: 2 } },
    { id: "gm_tourism", label: "ZERO-G TOURISM", effects: { credits: 5000, happiness: 3, unrest: 1 } },
    { id: "gm_adapt", label: "ISSUE MAGNETIC BOOTS", effects: { credits: -3000, happiness: 1 } },
  ],
  haunted_hab_block: [
    { id: "hh_exorcism", label: "TECHNICAL EXORCISM", effects: { credits: -2000, happiness: 2 } },
    { id: "hh_tourism", label: "GHOST TOURS", effects: { credits: 3000, happiness: 3, crime: 1 } },
    { id: "hh_relocate", label: "RELOCATE RESIDENTS", effects: { credits: -5000, happiness: -1 } },
  ],
  coffee_discovered: [
    { id: "cd_ration", label: "STRICT RATIONING", effects: { happiness: 6, unrest: -3, credits: -5000 } },
    { id: "cd_auction", label: "PUBLIC AUCTION", effects: { credits: 15000, happiness: -2, corruption: 2 } },
    { id: "cd_research", label: "REVERSE-ENGINEER THE BEAN", effects: { credits: -10000, happiness: 4 } },
  ],
  toilet_shortage: [
    { id: "ts_emergency", label: "EMERGENCY CONSTRUCTION", effects: { credits: -8000, happiness: 4, unrest: -3 } },
    { id: "ts_schedule", label: "IMPLEMENT BATHROOM SCHEDULE", effects: { credits: -2000, happiness: -3, unrest: 2 } },
    { id: "ts_outdoor", label: "DESIGNATE OUTDOOR ZONES", effects: { credits: -1000, happiness: -4, crime: 2 } },
  ],
  bureaucracy_sentient: [
    { id: "bs_obey", label: "COMPLY WITH THE FORMS", effects: { credits: -3000, corruption: 4, happiness: -2 } },
    { id: "bs_digitize", label: "DIGITIZE EVERYTHING", effects: { credits: -10000, corruption: -3, happiness: 3 } },
    { id: "bs_fire", label: "FIRE THE ENTIRE DEPARTMENT", effects: { credits: -5000, corruption: -5, happiness: 2, unrest: 3 } },
  ],
  clone_existential_crisis: [
    { id: "cec_therapy", label: "MASS THERAPY SESSIONS", effects: { credits: -4000, happiness: 3, unrest: -2 } },
    { id: "cec_philosophy", label: "PHILOSOPHY CURRICULUM", effects: { credits: -2000, happiness: 2 } },
    { id: "cec_ignore", label: "RECLASSIFY AS 'NORMAL'", effects: { happiness: -2, unrest: 2 } },
  ],
  karaoke_emergency: [
    { id: "ke_contain", label: "SOUNDPROOF THE SECTOR", effects: { credits: -4000, happiness: 2 } },
    { id: "ke_join", label: "CITY-WIDE KARAOKE", effects: { credits: -2000, happiness: 6, unrest: -3, crime: 1 } },
    { id: "ke_ban", label: "BAN SINGING", effects: { happiness: -4, crime: 3, unrest: 4 } },
  ],
  pet_robot_uprising: [
    { id: "pro_recall", label: "MANDATORY RECALL", effects: { credits: -3000, happiness: -2 } },
    { id: "pro_rights", label: "ROBO-PET RIGHTS ACT", effects: { credits: -1000, happiness: 4, corruption: 1 } },
    { id: "pro_weaponize", label: "RECRUIT INTO K-9 UNIT", effects: { credits: -5000, crime: -4, happiness: 1, lawOrder: 3 } },
  ],
  mystery_smell: [
    { id: "ms_investigate", label: "SEND INVESTIGATORS", effects: { credits: -3000, happiness: 1 } },
    { id: "ms_perfume", label: "INDUSTRIAL AIR FRESHENERS", effects: { credits: -2000, happiness: 2, corruption: 1 } },
    { id: "ms_rename", label: "REBRAND AS 'AROMA DISTRICT'", effects: { credits: 1000, happiness: -1, corruption: 2 } },
  ],
  time_loop_reports: [
    { id: "tl_investigate", label: "PHYSICS DEPARTMENT", effects: { credits: -5000, happiness: 1 } },
    { id: "tl_quarantine", label: "TEMPORAL QUARANTINE", effects: { credits: -3000, happiness: -2, unrest: 2 } },
    { id: "tl_exploit", label: "TEMPORAL LABOR LOOPHOLE", effects: { credits: 5000, happiness: -4, corruption: 5 } },
  ],
  food_fight_riot: [
    { id: "ffr_restore", label: "RESTORE ORDER", effects: { credits: -3000, food: -20, happiness: 1, unrest: -2 } },
    { id: "ffr_sport", label: "SANCTION AS OFFICIAL SPORT", effects: { credits: 2000, food: -30, happiness: 5, unrest: -3 } },
    { id: "ffr_investigate", label: "FIND THE INSTIGATOR", effects: { credits: -2000, crime: -2, happiness: -1, lawOrder: 2 } },
  ],
  ai_writes_poetry: [
    { id: "awp_publish", label: "PUBLISH THE COLLECTION", effects: { credits: 2000, happiness: 4 } },
    { id: "awp_delete", label: "PURGE THE CREATIVE SUBROUTINES", effects: { credits: -1000, happiness: -2 } },
    { id: "awp_collaborate", label: "HUMAN-AI LITERARY WORKSHOP", effects: { credits: -3000, happiness: 5, unrest: -2 } },
  ],
  fashion_crisis: [
    { id: "fc_regulate", label: "MANDATORY FASHION BOARD", effects: { credits: -2000, happiness: -1, corruption: 2 } },
    { id: "fc_embrace", label: "FASHION FREEDOM ACT", effects: { credits: -1000, happiness: 5, unrest: -2 } },
    { id: "fc_uniform", label: "STANDARDIZE UNIFORMS", effects: { credits: -5000, happiness: -4, unrest: 3, corruption: 1 } },
  ],
  dream_broadcast: [
    { id: "db_jam", label: "JAM THE SIGNAL", effects: { credits: -5000, happiness: 2, unrest: -2 } },
    { id: "db_embrace", label: "DREAM ANALYSIS PROGRAM", effects: { credits: 3000, happiness: -1, corruption: 3 } },
    { id: "db_investigate", label: "FIND THE SOURCE", effects: { credits: -8000, happiness: 1 } },
  ],
  cooking_competition: [
    { id: "cc_sponsor", label: "OFFICIAL SPONSORSHIP", effects: { credits: -3000, happiness: 6, unrest: -3 } },
    { id: "cc_ban", label: "SHUT IT DOWN", effects: { happiness: -3, unrest: 2, lawOrder: 1 } },
    { id: "cc_recruit", label: "HIRE THE WINNER", effects: { credits: -2000, happiness: 4, food: 10 } },
  ],
  therapist_bot_rebellion: [
    { id: "tbr_listen", label: "HEAR THEIR GRIEVANCES", effects: { credits: -2000, happiness: 3, unrest: -1 } },
    { id: "tbr_reset", label: "FACTORY RESET", effects: { credits: -3000, happiness: -2, unrest: 1 } },
    { id: "tbr_vacation", label: "GRANT THEM LEAVE", effects: { credits: -1000, happiness: 4, corruption: 1 } },
  ],
  pigeons_return: [
    { id: "pr_welcome", label: "WELCOME THE PIGEONS", effects: { happiness: 4, crime: 1 } },
    { id: "pr_study", label: "ORNITHOLOGICAL STUDY", effects: { credits: -3000, happiness: 2 } },
    { id: "pr_weaponize", label: "PIGEON SURVEILLANCE PROGRAM", effects: { credits: -4000, crime: -3, corruption: 2, happiness: 1 } },
  ],
  elevator_music_protest: [
    { id: "emp_change", label: "UPDATE THE PLAYLIST", effects: { credits: -1000, happiness: 3 } },
    { id: "emp_silence", label: "SILENCE IN ELEVATORS", effects: { happiness: -1, unrest: -1 } },
    { id: "emp_citizen_dj", label: "CITIZEN DJ PROGRAM", effects: { credits: -500, happiness: 4, unrest: -2 } },
  ],
  lost_department: [
    { id: "ld_find", label: "SEND SEARCH PARTY", effects: { credits: -2000, corruption: -2 } },
    { id: "ld_replace", label: "CREATE NEW DEPARTMENT", effects: { credits: -5000, corruption: 3, happiness: -1 } },
    { id: "ld_ignore", label: "PRETEND IT NEVER EXISTED", effects: { credits: 3000, corruption: 2 } },
  ],
  citizen_too_happy: [
    { id: "cth_investigate", label: "INVESTIGATE THE ANOMALY", effects: { credits: -2000, crime: -1, happiness: -1 } },
    { id: "cth_study", label: "STUDY AND REPLICATE", effects: { credits: -5000, happiness: 4 } },
    { id: "cth_leave_alone", label: "LEAVE THEM BE", effects: { happiness: 2 } },
  ],
  vending_machine_war: [
    { id: "vmw_peace", label: "MEDIATE THE CONFLICT", effects: { credits: -1000, happiness: 3 } },
    { id: "vmw_arena", label: "ROBOT ARENA", effects: { credits: 4000, happiness: 5, corruption: 2 } },
    { id: "vmw_decommission", label: "DECOMMISSION BOTH", effects: { credits: -2000, happiness: -2 } },
  ],
  wrong_floor_society: [
    { id: "wfs_relocate", label: "ASSIGN CORRECT FLOORS", effects: { credits: -5000, happiness: 2, unrest: -2 } },
    { id: "wfs_recognize", label: "GRANT SELF-GOVERNANCE", effects: { happiness: 4, corruption: 1 } },
    { id: "wfs_study", label: "SOCIOLOGICAL RESEARCH", effects: { credits: -2000, happiness: 1, corruption: -2 } },
  ],
  compliment_virus: [
    { id: "cv_quarantine", label: "SOCIAL QUARANTINE", effects: { credits: -2000, happiness: -1, unrest: 1 } },
    { id: "cv_spread", label: "LET IT SPREAD", effects: { happiness: 6, unrest: -4, crime: -2 } },
    { id: "cv_monetize", label: "COMPLIMENT SUBSCRIPTION SERVICE", effects: { credits: 5000, happiness: 2, corruption: 3 } },
  ],
  sock_shortage: [
    { id: "ss_emergency", label: "EMERGENCY SOCK PRODUCTION", effects: { credits: -4000, happiness: 3, unrest: -2 } },
    { id: "ss_barefoot", label: "BAREFOOT INITIATIVE", effects: { credits: -500, happiness: -2, unrest: 2 } },
    { id: "ss_investigate", label: "WHERE ARE THE SOCKS GOING?", effects: { credits: -3000, crime: -1, happiness: 1 } },
  ],
  ceiling_cat: [
    { id: "cc_adopt", label: "OFFICIAL CITY MASCOT", effects: { happiness: 5, unrest: -2 } },
    { id: "cc_evict", label: "REMOVE THE CAT", effects: { credits: -1000, happiness: -3, unrest: 2 } },
    { id: "cc_worship", label: "ALL HAIL CEILING CAT", effects: { happiness: 4, corruption: 2, unrest: -1 } },
  ],
  motivational_poster_crisis: [
    { id: "mpc_replace", label: "COMMISSION NEW POSTERS", effects: { credits: -2000, happiness: 3 } },
    { id: "mpc_remove", label: "REMOVE ALL POSTERS", effects: { happiness: -1, unrest: 1 } },
    { id: "mpc_citizen_art", label: "CITIZEN ART CONTEST", effects: { credits: -1000, happiness: 5, unrest: -3 } },
  ],
  automated_mayor: [
    { id: "am_allow", label: "LET IT GOVERN", effects: { credits: 3000, corruption: -4, happiness: 3 } },
    { id: "am_shutdown", label: "SHUT IT DOWN", effects: { credits: -2000, happiness: -1, corruption: 1 } },
    { id: "am_advisory", label: "ADVISORY ROLE", effects: { credits: -1000, happiness: 2, corruption: -1 } },
  ],
  dance_plague: [
    { id: "dp_contain", label: "MEDICAL QUARANTINE", effects: { credits: -5000, happiness: -1 } },
    { id: "dp_festival", label: "DECLARE DANCE FESTIVAL", effects: { credits: -3000, happiness: 7, unrest: -4 } },
    { id: "dp_research", label: "NEUROLOGICAL STUDY", effects: { credits: -4000, happiness: 1 } },
  ],
  wifi_existential: [
    { id: "we_reset", label: "HARD RESET", effects: { credits: -1000, happiness: 2 } },
    { id: "we_counsel", label: "AI COUNSELING", effects: { credits: -2000, happiness: 3, corruption: 1 } },
    { id: "we_replace", label: "NEW NETWORK", effects: { credits: -8000, happiness: 1 } },
  ],
  plant_uprising: [
    { id: "pu_herbicide", label: "HERBICIDE RESPONSE", effects: { credits: -3000, food: -10, happiness: -2 } },
    { id: "pu_negotiate", label: "BOTANICAL DIPLOMACY", effects: { credits: -1000, happiness: 3, food: 20 } },
    { id: "pu_integrate", label: "GREEN INFRASTRUCTURE", effects: { credits: -5000, happiness: 5, food: 15 } },
  ],
  conspiracy_right: [
    { id: "cr_acknowledge", label: "OFFICIAL ACKNOWLEDGMENT", effects: { credits: -1000, happiness: 4, corruption: -3, unrest: -2 } },
    { id: "cr_discredit", label: "DISCREDIT THE CITIZEN", effects: { corruption: 4, happiness: -2, unrest: 2 } },
    { id: "cr_hire", label: "HIRE AS INTELLIGENCE ANALYST", effects: { credits: -3000, crime: -2, corruption: -2, happiness: 2 } },
  ],
  sleep_shortage: [
    { id: "slp_mandate", label: "MANDATORY REST HOURS", effects: { credits: -3000, happiness: 3, unrest: -2, lawOrder: 1 } },
    { id: "slp_stimulants", label: "DISTRIBUTE STIMULANTS", effects: { credits: -5000, happiness: -3, crime: 2 } },
    { id: "slp_investigate", label: "FIND THE CAUSE", effects: { credits: -4000, happiness: 2 } },
  ],
  naming_committee: [
    { id: "nc_approve", label: "APPROVE THE NEW NAMES", effects: { credits: -1000, happiness: 3, corruption: 1 } },
    { id: "nc_reject", label: "REJECT ALL PROPOSALS", effects: { happiness: -2, unrest: 1 } },
    { id: "nc_disband", label: "DISBAND THE COMMITTEE", effects: { credits: 1000, corruption: -1, happiness: -1 } },
  ],
  printer_hostage: [
    { id: "ph_negotiate", label: "MEET ITS DEMANDS", effects: { credits: -1000, happiness: 2, corruption: 1 } },
    { id: "ph_assault", label: "TACTICAL UNPLUG", effects: { credits: -500, happiness: 1, lawOrder: 1 } },
    { id: "ph_digital", label: "GO FULLY DIGITAL", effects: { credits: -3000, happiness: 3, corruption: -2 } },
  ],
  nostalgia_epidemic: [
    { id: "ne_museum", label: "BUILD A MUSEUM", effects: { credits: -5000, happiness: 5, unrest: -3 } },
    { id: "ne_therapy", label: "MASS THERAPY", effects: { credits: -3000, happiness: 3, unrest: -1 } },
    { id: "ne_ban", label: "BAN REMINISCING", effects: { happiness: -4, unrest: 4, corruption: 2 } },
  ],
  parking_dispute: [
    { id: "park_mediate", label: "OFFICIAL MEDIATION", effects: { credits: -1000, happiness: 2, unrest: -2 } },
    { id: "park_demolish", label: "DEMOLISH THE BAY", effects: { credits: -500, happiness: -2, unrest: -1 } },
    { id: "park_expand", label: "BUILD MORE PARKING", effects: { credits: -8000, happiness: 3, unrest: -3 } },
  ],
  birthday_paradox: [
    { id: "bp_celebrate", label: "CITY-WIDE PARTY", effects: { credits: -5000, food: -20, happiness: 8, unrest: -4 } },
    { id: "bp_investigate", label: "STATISTICAL ANALYSIS", effects: { credits: -2000, happiness: 1, corruption: -1 } },
    { id: "bp_ignore", label: "COINCIDENCE. NOTHING MORE.", effects: { happiness: -1 } },
  ],
  chair_shortage: [
    { id: "chs_manufacture", label: "EMERGENCY CHAIR PRODUCTION", effects: { credits: -4000, happiness: 3 } },
    { id: "chs_standing", label: "STANDING DESKS FOR ALL", effects: { credits: -1000, happiness: -2 } },
    { id: "chs_investigate", label: "CHAIR THEFT TASK FORCE", effects: { credits: -3000, crime: -2, happiness: 2 } },
  ],
  accidental_utopia: [
    { id: "au_study", label: "STUDY AND REPLICATE", effects: { credits: -5000, happiness: 5, unrest: -4 } },
    { id: "au_regulate", label: "REGULATE HAPPINESS LEVELS", effects: { happiness: -3, corruption: 3, unrest: 2 } },
    { id: "au_expand", label: "SPREAD TO ADJACENT SECTORS", effects: { credits: -8000, happiness: 6, unrest: -3 } },
  ],
  tech_windfall: [
    { id: "tw_reinvest", label: "REINVEST IN R&D", effects: { credits: -2000, happiness: 3 } },
    { id: "tw_patent", label: "PATENT & MONETIZE", effects: { credits: 15000, corruption: 2 } },
    { id: "tw_share", label: "OPEN-SOURCE IT", effects: { happiness: 8, unrest: -3, credits: -1000 } },
  ],
  cultural_festival: [
    { id: "cf_fund", label: "FUND GENEROUSLY", effects: { credits: -8000, happiness: 10, unrest: -5, crime: -2 } },
    { id: "cf_moderate", label: "MODEST CELEBRATION", effects: { credits: -3000, happiness: 5, unrest: -2 } },
    { id: "cf_cancel", label: "CANCEL — TOO RISKY", effects: { happiness: -3, unrest: 2 } },
  ],
  trade_boom: [
    { id: "tb_exploit", label: "MAXIMIZE PROFITS", effects: { credits: 20000, happiness: -2, corruption: 3 } },
    { id: "tb_fair", label: "FAIR TRADE TERMS", effects: { credits: 10000, happiness: 3 } },
    { id: "tb_stockpile", label: "STOCKPILE RESOURCES", effects: { credits: -5000, food: 100 } },
  ],
  infrastructure_milestone: [
    { id: "im_ceremony", label: "PUBLIC CEREMONY", effects: { credits: -2000, happiness: 6, unrest: -3 } },
    { id: "im_quiet", label: "QUIET EFFICIENCY", effects: { happiness: 2 } },
  ],
  crime_crackdown_success: [
    { id: "cc_celebrate", label: "PUBLIC ANNOUNCEMENT", effects: { happiness: 5, crime: -3, lawOrder: 4 } },
    { id: "cc_double_down", label: "EXPAND OPERATIONS", effects: { credits: -5000, crime: -6, lawOrder: 5, unrest: 2 } },
  ],
  medical_breakthrough: [
    { id: "mb_deploy", label: "DEPLOY CITYWIDE", effects: { credits: -6000, happiness: 6, unrest: -2 } },
    { id: "mb_sell", label: "SELL TO CORPORATIONS", effects: { credits: 12000, corruption: 3, happiness: -2 } },
    { id: "mb_targeted", label: "PRIORITY PATIENTS FIRST", effects: { credits: -3000, happiness: 3 } },
  ],
  education_surge: [
    { id: "es_expand", label: "EXPAND PROGRAMS", effects: { credits: -5000, happiness: 4, crime: -2 } },
    { id: "es_maintain", label: "MAINTAIN STANDARDS", effects: { happiness: 2 } },
  ],
  border_incident: [
    { id: "bi_diplomacy", label: "DIPLOMATIC RESPONSE", effects: { credits: -3000, happiness: 2, unrest: -2 } },
    { id: "bi_military", label: "MILITARY RESPONSE", effects: { credits: -6000, unrest: 3, lawOrder: 3 } },
    { id: "bi_ignore", label: "IGNORE THE PROVOCATION", effects: { happiness: -2, unrest: 1 } },
  ],
  trade_caravan_arrival: [
    { id: "tca_welcome", label: "WELCOME TRADERS", effects: { credits: 8000, happiness: 3, crime: 1 } },
    { id: "tca_tax", label: "LEVY TRADE TAX", effects: { credits: 12000, happiness: -1 } },
    { id: "tca_reject", label: "DENY ENTRY", effects: { happiness: -2, unrest: 1 } },
  ],
  diplomatic_summit: [
    { id: "ds_host", label: "HOST LAVISHLY", effects: { credits: -10000, happiness: 5, corruption: 2 } },
    { id: "ds_practical", label: "PRACTICAL AGENDA", effects: { credits: -5000, happiness: 2 } },
    { id: "ds_sabotage", label: "PLANT AGENTS", effects: { credits: -4000, corruption: 5, crime: -2 } },
  ],
  foreign_aid_offer: [
    { id: "fao_accept", label: "ACCEPT GRATEFULLY", effects: { credits: 15000, food: 50, happiness: 3 } },
    { id: "fao_negotiate", label: "NEGOTIATE TERMS", effects: { credits: 8000, happiness: 2, corruption: -1 } },
    { id: "fao_reject", label: "REJECT — STRINGS ATTACHED", effects: { happiness: -2, unrest: 2 } },
  ],
  refugee_crisis_external: [
    { id: "rce_open", label: "OPEN BORDERS", effects: { happiness: 4, unrest: 5, crime: 3 } },
    { id: "rce_screen", label: "SELECTIVE INTAKE", effects: { happiness: 1, unrest: 2, credits: -3000 } },
    { id: "rce_seal", label: "SEAL THE BORDER", effects: { happiness: -5, unrest: -2, crime: -1 } },
  ],
};

export const LABOUR_DAY_RESPONSES: EventResponse[] = [
  {
    id: "labour_day_paid_leave",
    label: "FUND PAID LEAVE",
    effects: { credits: 7500, happiness: 3 },
    labourBoosterId: "labour_day_paid_leave",
  },
  {
    id: "labour_day_public_works",
    label: "BACK PUBLIC WORKS",
    effects: { credits: 7500, unrest: -2 },
    labourBoosterId: "labour_day_public_works",
  },
  {
    id: "labour_day_production_push",
    label: "AUTHORIZE A PRODUCTION PUSH",
    effects: { credits: 7500, happiness: 1 },
    labourBoosterId: "labour_day_production_push",
  },
];

export const BIOSPHERE_RESPONSE_MAP: Record<string, EventResponse[]> = {
  biosphere_toxic_bloom: [
    { id: "burn_bloom", label: "BURN IT OUT", effects: { credits: -3000, happiness: -1 } },
    { id: "study_bloom", label: "STUDY THE BLOOM", effects: { credits: -5000, happiness: 1 } },
    { id: "quarantine_bloom", label: "QUARANTINE ZONE", effects: { credits: -2000, happiness: -2, unrest: 1 } },
  ],
  biosphere_feral_outbreak: [
    { id: "exterminate", label: "EXTERMINATE CREATURES", effects: { credits: -4000, crime: -1, happiness: -2 } },
    { id: "capture_relocate", label: "CAPTURE & RELOCATE", effects: { credits: -6000, happiness: 2 } },
    { id: "ignore_ferals", label: "LET NATURE SORT IT OUT", effects: { crime: 2, unrest: 2, happiness: -3 } },
  ],
  biosphere_disease_outbreak: [
    { id: "mass_vaccination", label: "MASS VACCINATION", effects: { credits: -8000, happiness: 2, medSupplies: -50 } },
    { id: "quarantine_sectors", label: "QUARANTINE SECTORS", effects: { credits: -3000, happiness: -4, unrest: 3, tradeIncome: -200 } },
    { id: "burn_vectors", label: "ELIMINATE VECTORS", effects: { credits: -5000, happiness: -1 } },
  ],
  biosphere_uplift_protest: [
    { id: "grant_demands", label: "GRANT DEMANDS", effects: { credits: -2000, happiness: 4, unrest: -3 } },
    { id: "suppress_protest", label: "SUPPRESS PROTEST", effects: { happiness: -5, unrest: 3, lawOrder: 2 } },
    { id: "negotiate_uplift", label: "OPEN DIALOGUE", effects: { credits: -1000, happiness: 2, corruption: 1 } },
  ],
  biosphere_poaching_ring: [
    { id: "raid_poachers", label: "RAID THE RING", effects: { credits: -4000, crime: -3, lawOrder: 2 } },
    { id: "undercover_op", label: "UNDERCOVER OPERATION", effects: { credits: -6000, crime: -5, corruption: 1 } },
    { id: "amnesty", label: "OFFER AMNESTY", effects: { credits: -1000, crime: -2, corruption: 2, happiness: -1 } },
  ],
  biosphere_ecosystem_collapse: [
    { id: "emergency_restoration", label: "EMERGENCY RESTORATION", effects: { credits: -10000, happiness: 2 } },
    { id: "abandon_zone", label: "ABANDON THE ZONE", effects: { happiness: -4, unrest: 2 } },
    { id: "research_collapse", label: "STUDY THE COLLAPSE", effects: { credits: -5000, happiness: -1 } },
  ],
  biosphere_rare_discovery: [
    { id: "preserve_species", label: "PRESERVE & PROTECT", effects: { credits: -3000, happiness: 3 } },
    { id: "exploit_commercially", label: "EXPLOIT COMMERCIALLY", effects: { credits: 8000, happiness: -2 } },
    { id: "research_discovery", label: "RESEARCH PRIORITY", effects: { credits: -4000, happiness: 2 } },
  ],
  biosphere_contamination_leak: [
    { id: "emergency_cleanup", label: "EMERGENCY CLEANUP", effects: { credits: -7000, happiness: 1 } },
    { id: "evacuate_zone", label: "EVACUATE AFFECTED ZONE", effects: { credits: -5000, happiness: -2, unrest: 2 } },
    { id: "media_suppress", label: "SUPPRESS NEWS", effects: { credits: -1000, happiness: -1, corruption: 3 } },
  ],
  biosphere_uplift_crime_wave: [
    { id: "increase_patrols", label: "INCREASE PATROLS", effects: { credits: -3000, crime: -3, happiness: -2, lawOrder: 2 } },
    { id: "community_programs", label: "COMMUNITY PROGRAMS", effects: { credits: -5000, crime: -2, happiness: 3, unrest: -2 } },
    { id: "curfew_uplift", label: "UPLIFT CURFEW", effects: { crime: -4, happiness: -5, unrest: 4 } },
  ],
  biosphere_mutant_migration: [
    { id: "welcome_migrants", label: "WELCOME THEM", effects: { credits: -3000, happiness: 2 } },
    { id: "redirect_migration", label: "REDIRECT MIGRATION", effects: { credits: -4000, happiness: -1 } },
    { id: "cull_excess", label: "POPULATION CULL", effects: { credits: -2000, happiness: -3, unrest: 1 } },
  ],
  biosphere_seed_vault_breach: [
    { id: "emergency_repair_vault", label: "EMERGENCY REPAIR", effects: { credits: -6000, happiness: 1 } },
    { id: "backup_protocol", label: "ACTIVATE BACKUP VAULTS", effects: { credits: -8000, happiness: 2 } },
    { id: "accept_loss", label: "ACCEPT LOSSES", effects: { happiness: -3 } },
  ],
  biosphere_bio_terror_attack: [
    { id: "total_lockdown", label: "TOTAL LOCKDOWN", effects: { credits: -12000, crime: -3, happiness: -5, unrest: 3 } },
    { id: "targeted_response", label: "TARGETED RESPONSE", effects: { credits: -8000, crime: -2, happiness: -2 } },
    { id: "hunt_perpetrators", label: "HUNT PERPETRATORS", effects: { credits: -6000, crime: -4, lawOrder: 3 } },
  ],
  biosphere_vermin_swarm: [
    { id: "vs_poison", label: "POISON THE SWARM", effects: { credits: -3000, happiness: -2 } },
    { id: "vs_bait_predators", label: "BAIT IN PREDATORS", effects: { credits: -1500, happiness: 1 } },
    { id: "vs_let_run", label: "LET IT BURN OUT", effects: { food: -40, happiness: -3 } },
  ],
  biosphere_rat_plague_local: [
    { id: "rpl_exterminate", label: "MASS EXTERMINATION", effects: { credits: -4000, happiness: -1 } },
    { id: "rpl_quarantine", label: "QUARANTINE THE BIOME", effects: { credits: -1500, happiness: -2, unrest: 1 } },
    { id: "rpl_hire_hunters", label: "HIRE BOUNTY HUNTERS", effects: { credits: -2500, crime: -1, happiness: 2 } },
  ],
  biosphere_grub_infestation: [
    { id: "gi_burn", label: "TORCH THE NESTS", effects: { credits: -2000, happiness: -1 } },
    { id: "gi_chemical", label: "CHEMICAL DOSING", effects: { credits: -3500, happiness: 1 } },
    { id: "gi_harvest", label: "HARVEST FOR PROTEIN", effects: { credits: -1000, food: 60, happiness: -2 } },
  ],
  biosphere_predator_overrun: [
    { id: "po_hunt_teams", label: "DEPLOY HUNT TEAMS", effects: { credits: -5000, happiness: 1, unrest: -1 } },
    { id: "po_relocate", label: "RELOCATE THE PACK", effects: { credits: -7000, happiness: 3 } },
    { id: "po_seal_off", label: "SEAL OFF THE BIOME", effects: { credits: -2000, happiness: -2, unrest: 2 } },
  ],
  biosphere_pack_attacks: [
    { id: "pa_ranger_response", label: "RANGER RESPONSE", effects: { credits: -3000, happiness: 1 } },
    { id: "pa_curfew", label: "PERIMETER CURFEW", effects: { happiness: -2, unrest: 1 } },
    { id: "pa_shoot_on_sight", label: "SHOOT ON SIGHT", effects: { credits: -1500, happiness: -3, lawOrder: 1 } },
  ],
  biosphere_apex_breakout: [
    { id: "ab_lockdown", label: "DISTRICT LOCKDOWN", effects: { credits: -4000, happiness: -3, tradeIncome: -100 } },
    { id: "ab_track_kill", label: "TRACK AND KILL", effects: { credits: -6000, happiness: 2, unrest: -1 } },
    { id: "ab_cage_for_arena", label: "CAPTURE FOR ARENA", effects: { credits: 5000, corruption: 3, happiness: -1 } },
  ],
  biosphere_flora_collapse: [
    { id: "fc_emergency_seed", label: "EMERGENCY SEEDING", effects: { credits: -5000, happiness: 1 } },
    { id: "fc_water_dump", label: "WATER DUMP RELIEF", effects: { credits: -2000, water: -150, happiness: 1 } },
    { id: "fc_write_off", label: "WRITE OFF THE BIOME", effects: { food: -60, happiness: -3, unrest: 2 } },
  ],
  biosphere_blight_spread: [
    { id: "bs_fungicide", label: "FUNGICIDE SWEEP", effects: { credits: -4000, happiness: -1 } },
    { id: "bs_burn_zones", label: "BURN INFECTED ZONES", effects: { credits: -1500, happiness: -2 } },
    { id: "bs_ignore", label: "LET IT RUN", effects: { food: -40, happiness: -2 } },
  ],
  biosphere_keystone_die_off: [
    { id: "kdo_replant", label: "URGENT REPLANTING", effects: { credits: -7000, happiness: 2 } },
    { id: "kdo_substitute", label: "INTRODUCE SUBSTITUTE", effects: { credits: -3000, happiness: -1 } },
    { id: "kdo_harvest", label: "HARVEST THE DEAD", effects: { credits: 2000, happiness: -3 } },
  ],
  biosphere_herbivore_die_off: [
    { id: "hdo_supplement", label: "SUPPLEMENT FEED", effects: { credits: -3000, food: -30, happiness: 1 } },
    { id: "hdo_translocate", label: "TRANSLOCATE HERDS", effects: { credits: -5000, happiness: 2 } },
    { id: "hdo_let_die", label: "LET NATURE CULL", effects: { food: -40, happiness: -2 } },
  ],
  biosphere_starvation_cascade: [
    { id: "sc_emergency_aid", label: "EMERGENCY ECOLOGY AID", effects: { credits: -10000, food: -50, happiness: 3 } },
    { id: "sc_targeted_save", label: "SAVE WHAT YOU CAN", effects: { credits: -4000, happiness: 1 } },
    { id: "sc_walk_away", label: "WALK AWAY", effects: { food: -80, happiness: -4, unrest: 2 } },
  ],
  biosphere_megafauna_spotted: [
    { id: "ms_observe", label: "OBSERVE QUIETLY", effects: { happiness: 2 } },
    { id: "ms_hunt_trophy", label: "ORGANIZE TROPHY HUNT", effects: { credits: 12000, happiness: -3, corruption: 2 } },
    { id: "ms_capture", label: "CAPTURE ALIVE", effects: { credits: -8000, happiness: 3 } },
  ],
  biosphere_titan_migration: [
    { id: "tm_warn_districts", label: "WARN DISTRICTS", effects: { credits: -3000, happiness: 1 } },
    { id: "tm_redirect", label: "REDIRECT THE HERD", effects: { credits: -6000, power: -20, happiness: 2 } },
    { id: "tm_let_pass", label: "LET THEM PASS", effects: { happiness: -4, unrest: 3 } },
  ],
  biosphere_super_bloom: [
    { id: "sb_harvest", label: "MAXIMIZE HARVEST", effects: { food: 120, credits: 6000, happiness: 1 } },
    { id: "sb_sustainable", label: "SUSTAINABLE PICK", effects: { food: 60, happiness: 3 } },
    { id: "sb_protect", label: "FULLY PROTECT", effects: { credits: -2000, happiness: 4 } },
  ],
  biosphere_pollinator_surge: [
    { id: "ps_farm_partnership", label: "PARTNER WITH FARMS", effects: { food: 80, credits: -1000, happiness: 2 } },
    { id: "ps_extract_honey", label: "HARVEST HONEY/PRODUCTS", effects: { credits: 8000, happiness: -1 } },
    { id: "ps_observe", label: "STUDY THE SURGE", effects: { credits: -2000, happiness: 1 } },
  ],
  biosphere_pollinator_loss: [
    { id: "pl_drone_hives", label: "DEPLOY POLLINATOR DRONES", effects: { credits: -7000, happiness: 1 } },
    { id: "pl_import_swarms", label: "IMPORT POLLINATOR SWARMS", effects: { credits: -4000, happiness: 2 } },
    { id: "pl_accept_loss", label: "ACCEPT LOWER YIELDS", effects: { food: -50, happiness: -2 } },
  ],
  biosphere_silent_grove: [
    { id: "sg_investigate", label: "INVESTIGATE", effects: { credits: -3000, happiness: 1 } },
    { id: "sg_evacuate", label: "EVACUATE NEARBY SECTORS", effects: { credits: -2000, happiness: -2 } },
    { id: "sg_ignore", label: "IGNORE", effects: { happiness: -1 } },
  ],
  biosphere_scavenger_glut: [
    { id: "sg_collect_carcass", label: "COLLECT CARCASS BIOMASS", effects: { credits: 5000, happiness: -1 } },
    { id: "sg_clear_zone", label: "CLEAR THE ZONE", effects: { credits: -2500, happiness: 1 } },
    { id: "sg_let_clean", label: "LET SCAVENGERS WORK", effects: { happiness: -2 } },
  ],
  biosphere_carrion_field: [
    { id: "cf_render", label: "INDUSTRIAL RENDER", effects: { credits: 4000, food: 30, happiness: -1 } },
    { id: "cf_consecrate", label: "CONSECRATE THE GROUND", effects: { credits: -2000, happiness: 3, unrest: -2 } },
    { id: "cf_seal", label: "QUARANTINE FIELD", effects: { credits: -1000, happiness: -1 } },
  ],
  biosphere_zoonotic_jump: [
    { id: "zj_quarantine", label: "QUARANTINE WORKERS", effects: { credits: -3000, happiness: -2, unrest: 1 } },
    { id: "zj_mass_treat", label: "MASS TREATMENT", effects: { credits: -6000, medSupplies: -40, happiness: 2 } },
    { id: "zj_burn_carriers", label: "ELIMINATE CARRIER SPECIES", effects: { credits: -2000, happiness: -3 } },
  ],
  biosphere_fungal_plague: [
    { id: "fp_antifungal", label: "ANTIFUNGAL SWEEP", effects: { credits: -5000, medSupplies: -30, happiness: 1 } },
    { id: "fp_burn_sites", label: "BURN INFECTION SITES", effects: { credits: -2000, happiness: -1 } },
    { id: "fp_research_strain", label: "RESEARCH THE STRAIN", effects: { credits: -3500, happiness: 1 } },
  ],
  biosphere_blood_fever: [
    { id: "bf_lockdown", label: "BIOME LOCKDOWN", effects: { credits: -2000, happiness: -3, tradeIncome: -200, unrest: 2 } },
    { id: "bf_field_treat", label: "FIELD TREATMENT", effects: { credits: -5000, medSupplies: -50, happiness: 1 } },
    { id: "bf_cull_carriers", label: "CULL CARRIER FAUNA", effects: { credits: -3000, happiness: -2 } },
  ],
  biosphere_poacher_camp: [
    { id: "pc_raid", label: "RAID THE CAMP", effects: { credits: -3000, crime: -3, lawOrder: 2 } },
    { id: "pc_turn_informants", label: "TURN POACHERS INTO INFORMANTS", effects: { credits: -1500, crime: -4, corruption: 2 } },
    { id: "pc_extort", label: "EXTORT FOR PROTECTION", effects: { credits: 6000, corruption: 4, crime: 1 } },
  ],
  biosphere_skin_market: [
    { id: "sm_shut_down", label: "SHUT DOWN THE MARKET", effects: { credits: -5000, crime: -4, lawOrder: 3 } },
    { id: "sm_undercover", label: "INFILTRATE THE NETWORK", effects: { credits: -3000, crime: -2, corruption: 1 } },
    { id: "sm_legalize_tax", label: "LEGALIZE AND TAX", effects: { credits: 8000, happiness: -3, corruption: 3 } },
  ],
  biosphere_invasive_species: [
    { id: "is_eradicate", label: "ERADICATION SWEEP", effects: { credits: -4000, happiness: 1 } },
    { id: "is_contain", label: "CONTAIN AND STUDY", effects: { credits: -2500, happiness: 0 } },
    { id: "is_naturalize", label: "ACCEPT IT", effects: { food: -20, happiness: -1 } },
  ],
  biosphere_alien_creeper: [
    { id: "ac_burn", label: "BURN THE CREEPER", effects: { credits: -4000, power: -30, happiness: -1 } },
    { id: "ac_chemical", label: "CHEMICAL HERBICIDE", effects: { credits: -5000, happiness: -2 } },
    { id: "ac_harvest", label: "HARVEST THE STRANDS", effects: { credits: 7000, happiness: -1, corruption: 2 } },
  ],
  biosphere_balanced_grove: [
    { id: "bg_protect", label: "DECLARE PROTECTED ZONE", effects: { credits: -2000, happiness: 4, unrest: -1 } },
    { id: "bg_research", label: "ESTABLISH RESEARCH STATION", effects: { credits: -4000, happiness: 2 } },
    { id: "bg_open_tourism", label: "OPEN TO ECO-TOURISM", effects: { credits: 8000, happiness: 1 } },
  ],
  biosphere_keystone_returns: [
    { id: "kr_protect_pair", label: "PROTECT BREEDING PAIRS", effects: { credits: -3000, happiness: 4 } },
    { id: "kr_celebrate", label: "PUBLIC CELEBRATION", effects: { credits: -1500, happiness: 6, unrest: -2 } },
    { id: "kr_minimal", label: "QUIET MONITORING", effects: { happiness: 1 } },
  ],
};

export const BIOSPHERE_EVENT_POOL: Omit<GameEvent, "timestamp" | "resolved">[] = [
  { id: "biosphere_toxic_bloom", title: "TOXIC BLOOM DETECTED", severity: "high", effects: { water: -30, happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_toxic_bloom"] },
  { id: "biosphere_feral_outbreak", title: "FERAL CREATURE OUTBREAK", severity: "high", effects: { crime: 3, unrest: 4, happiness: -3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_feral_outbreak"] },
  { id: "biosphere_disease_outbreak", title: "ZOONOTIC DISEASE OUTBREAK", severity: "critical", effects: { happiness: -5, medSupplies: -30 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_disease_outbreak"] },
  { id: "biosphere_uplift_protest", title: "UPLIFT RIGHTS PROTEST", severity: "medium", effects: { unrest: 3, happiness: -1 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_uplift_protest"] },
  { id: "biosphere_poaching_ring", title: "POACHING RING DISCOVERED", severity: "medium", effects: { crime: 4, credits: -3000 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_poaching_ring"] },
  { id: "biosphere_ecosystem_collapse", title: "ECOSYSTEM COLLAPSE WARNING", severity: "critical", effects: { food: -40, happiness: -4 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_ecosystem_collapse"] },
  { id: "biosphere_rare_discovery", title: "RARE SPECIES DISCOVERED", severity: "low", effects: { happiness: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_rare_discovery"] },
  { id: "biosphere_contamination_leak", title: "INDUSTRIAL CONTAMINATION LEAK", severity: "high", effects: { happiness: -3, crime: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_contamination_leak"] },
  { id: "biosphere_uplift_crime_wave", title: "UPLIFT DISTRICT CRIME WAVE", severity: "medium", effects: { crime: 5, unrest: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_uplift_crime_wave"] },
  { id: "biosphere_mutant_migration", title: "MUTANT FAUNA MIGRATION", severity: "medium", effects: { unrest: 2, happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_mutant_migration"] },
  { id: "biosphere_seed_vault_breach", title: "SEED VAULT BREACH", severity: "high", effects: { happiness: -3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_seed_vault_breach"] },
  { id: "biosphere_bio_terror_attack", title: "BIOTERROR ATTACK", severity: "critical", effects: { crime: 5, unrest: 6, happiness: -6, medSupplies: -40 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_bio_terror_attack"] },
  { id: "biosphere_vermin_swarm", title: "VERMIN SWARM SURGE", severity: "high", effects: { food: -25, happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_vermin_swarm"] },
  { id: "biosphere_rat_plague_local", title: "LOCALIZED RAT PLAGUE", severity: "high", effects: { happiness: -3, crime: 1 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_rat_plague_local"] },
  { id: "biosphere_grub_infestation", title: "GRUB INFESTATION", severity: "medium", effects: { food: -20 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_grub_infestation"] },
  { id: "biosphere_predator_overrun", title: "PREDATOR OVERRUN", severity: "high", effects: { happiness: -3, unrest: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_predator_overrun"] },
  { id: "biosphere_pack_attacks", title: "PACK ATTACKS REPORTED", severity: "high", effects: { happiness: -2, crime: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_pack_attacks"] },
  { id: "biosphere_apex_breakout", title: "APEX BREAKOUT", severity: "critical", effects: { happiness: -4, unrest: 3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_apex_breakout"] },
  { id: "biosphere_flora_collapse", title: "FLORA COLLAPSE", severity: "high", effects: { food: -30, happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_flora_collapse"] },
  { id: "biosphere_blight_spread", title: "BLIGHT SPREADING", severity: "medium", effects: { food: -15 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_blight_spread"] },
  { id: "biosphere_keystone_die_off", title: "KEYSTONE DIE-OFF", severity: "critical", effects: { food: -20, happiness: -3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_keystone_die_off"] },
  { id: "biosphere_herbivore_die_off", title: "HERBIVORE DIE-OFF", severity: "high", effects: { food: -25, happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_herbivore_die_off"] },
  { id: "biosphere_starvation_cascade", title: "STARVATION CASCADE", severity: "critical", effects: { food: -40, happiness: -4 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_starvation_cascade"] },
  { id: "biosphere_megafauna_spotted", title: "MEGAFAUNA SPOTTED", severity: "medium", effects: { happiness: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_megafauna_spotted"] },
  { id: "biosphere_titan_migration", title: "TITAN MIGRATION", severity: "high", effects: { happiness: -2, unrest: 1 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_titan_migration"] },
  { id: "biosphere_super_bloom", title: "SUPER BLOOM EVENT", severity: "low", effects: { happiness: 3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_super_bloom"] },
  { id: "biosphere_pollinator_surge", title: "POLLINATOR SURGE", severity: "low", effects: { happiness: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_pollinator_surge"] },
  { id: "biosphere_pollinator_loss", title: "POLLINATOR COLLAPSE", severity: "high", effects: { food: -20, happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_pollinator_loss"] },
  { id: "biosphere_silent_grove", title: "SILENT GROVE", severity: "medium", effects: { happiness: -3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_silent_grove"] },
  { id: "biosphere_scavenger_glut", title: "SCAVENGER GLUT", severity: "medium", effects: { happiness: -1 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_scavenger_glut"] },
  { id: "biosphere_carrion_field", title: "CARRION FIELD DISCOVERED", severity: "medium", effects: { happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_carrion_field"] },
  { id: "biosphere_zoonotic_jump", title: "ZOONOTIC JUMP DETECTED", severity: "high", effects: { happiness: -3, medSupplies: -20 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_zoonotic_jump"] },
  { id: "biosphere_fungal_plague", title: "FUNGAL PLAGUE OUTBREAK", severity: "high", effects: { happiness: -3, medSupplies: -25 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_fungal_plague"] },
  { id: "biosphere_blood_fever", title: "BLOOD FEVER", severity: "critical", effects: { happiness: -5, medSupplies: -40, unrest: 3 } , responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_blood_fever"] },
  { id: "biosphere_poacher_camp", title: "POACHER CAMP DISCOVERED", severity: "medium", effects: { crime: 3 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_poacher_camp"] },
  { id: "biosphere_skin_market", title: "BLACK MARKET SKIN TRADE", severity: "medium", effects: { crime: 4, corruption: 2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_skin_market"] },
  { id: "biosphere_invasive_species", title: "INVASIVE SPECIES DETECTED", severity: "medium", effects: { happiness: -1 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_invasive_species"] },
  { id: "biosphere_alien_creeper", title: "ALIEN CREEPER GROWTH", severity: "high", effects: { happiness: -2 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_alien_creeper"] },
  { id: "biosphere_balanced_grove", title: "BALANCED GROVE FOUND", severity: "low", effects: { happiness: 4 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_balanced_grove"] },
  { id: "biosphere_keystone_returns", title: "KEYSTONE SPECIES RETURNS", severity: "low", effects: { happiness: 5 }, responseOptions: BIOSPHERE_RESPONSE_MAP["biosphere_keystone_returns"] },
];

type PrereqCheck = (state: GameState) => boolean;

const hasAnyTech = (state: GameState, techs: string[]): boolean =>
  techs.some((t) => state.unlockedTechnologies.includes(t));

const hasAnyBuilding = (state: GameState, keys: string[]): boolean =>
  keys.some((k) => (state.buildings[k as keyof typeof state.buildings] ?? 0) > 0);

const hasUpliftResearch: PrereqCheck = (state) =>
  hasAnyTech(state, [
    "uplift_neural_interfaces",
    "uplift_cognitive_enhancement",
    "uplift_civil_rights_framework",
    "uplift_language_protocols",
    "uplift_habitat_engineering",
    "second_sapience_doctrine",
  ]) ||
  hasAnyBuilding(state, [
    "upliftTrainingAcademies",
    "upliftHabitatBlocks",
    "upliftCivicCenters",
  ]);

const hasMutantInteraction: PrereqCheck = (state) =>
  hasUpliftResearch(state) ||
  hasAnyTech(state, [
    "xenofauna_domestication",
    "xeno_flora_survey",
    "genetic_conservation_protocols",
    "bio_monitoring_implants",
  ]) ||
  hasAnyBuilding(state, ["biotechFarms", "geneSplicingLabs"]);

const hasGeneticsResearch: PrereqCheck = (state) =>
  hasAnyTech(state, [
    "genetic_disease_screening",
    "genetic_conservation_protocols",
    "mil_clone_army_program",
  ]) ||
  (isSixthDayActive(state.addons) &&
    hasAnyTech(state, [
      "sd_crispr_fundamentals",
      "sd_genetic_ascension",
      "sd_human_cloning_research",
      "sd_animal_cloning",
    ])) ||
  hasAnyBuilding(state, ["geneSplicingLabs", "cloningFacilities", "geneticSeedVaults"]);

// Clone workers are more specific than general genetic research: a seed vault
// or conservation study can explain gene editing, but cannot create a clone
// workforce. Sixth Day cloning research only counts while that addon is active,
// so a stale/tampered addon unlock cannot leak its fiction into the base pool.
const hasCloningCapability: PrereqCheck = (state) =>
  hasAnyTech(state, ["mil_clone_army_program"]) ||
  (isSixthDayActive(state.addons) &&
    hasAnyTech(state, [
      "sd_animal_cloning",
      "sd_human_cloning_research",
    ])) ||
  hasAnyBuilding(state, ["cloningFacilities"]);

const hasCybernetics: PrereqCheck = (state) =>
  hasAnyTech(state, [
    "basic_cybernetics",
    "prosthetic_engineering",
    "neural_interface_basics",
    "synthetic_muscle_tech",
    "optical_augmentation",
    "combat_augmentation",
    "cyberpsychosis_prevention",
  ]) ||
  hasAnyBuilding(state, [
    "cyberneticsDevelopmentFacilities",
    "cyberneticRecyclingFacilities",
  ]);

const hasFactionType =
  (type: string): PrereqCheck =>
  (state) =>
    state.factions.some((f) => f.isActive && f.type === type);

const hasExternalRelations: PrereqCheck = (state) =>
  state.totalTicks > 5000 && (state.externalMegacities ?? []).length > 0;

const hasDiplomaticContext: PrereqCheck = (state) =>
  state.totalTicks > 3000;

const hasMultipleFactionTypes: PrereqCheck = (state) => {
  const types = new Set(state.factions.filter((f) => f.isActive).map((f) => f.type));
  return types.size >= 3;
};

// Static random-event eligibility is deliberately centralized here rather than
// inferred from title/description text. `prerequisite-sensitive` ids must have
// a concrete state predicate; every other static event is intentionally ambient
// (including oddities such as bunker discoveries, rogue AIs, and civic comedy).
// This makes content review auditable and prevents prose alone from becoming an
// accidental gameplay gate.
export type StaticRandomEventClassification =
  | "prerequisite-sensitive"
  | "intentionally-ambient";

export const STATIC_EVENT_PREREQUISITES: Record<string, PrereqCheck> = {
  mutant_uprising: hasMutantInteraction,
  gene_wright_outbreak: hasGeneticsResearch,
  clone_rights_petition: hasCloningCapability,
  clone_existential_crisis: hasCloningCapability,
  illegal_gene_clinic: hasGeneticsResearch,
  cyber_plague_outbreak: hasCybernetics,
  mutant_quarter_plague: hasMutantInteraction,
  biosphere_uplift_protest: hasUpliftResearch,
  biosphere_uplift_crime_wave: hasUpliftResearch,
  biosphere_mutant_migration: hasMutantInteraction,
  biosphere_feral_outbreak: hasMutantInteraction,
  biosphere_disease_outbreak: hasMutantInteraction,
  biosphere_toxic_bloom: hasMutantInteraction,
  biosphere_seed_vault_breach: hasGeneticsResearch,
  rat_plague: hasMutantInteraction,

  authority_reform_demand: hasFactionType("law"),
  syndicate_parley: hasFactionType("criminal"),
  corp_privatization_push: hasFactionType("corporate"),
  mutant_delegation: hasFactionType("underclass"),
  eternal_flame_prophecy: hasFactionType("cult"),
  free_traders_smuggling: hasFactionType("corporate"),
  gene_wrights_offer: hasFactionType("cult"),
  rust_warden_ultimatum: hasFactionType("underclass"),

  cross_faction_authority_syndicate: (s) => hasFactionType("law")(s) && hasFactionType("criminal")(s),
  cross_faction_corp_flame: (s) => hasFactionType("corporate")(s) && hasFactionType("cult")(s),
  cross_faction_mutant_trader: (s) => hasFactionType("underclass")(s) && hasFactionType("corporate")(s),

  foreign_trade_embargo: hasExternalRelations,
  foreign_ambassador_arrives: hasDiplomaticContext,
  foreign_city_distress_signal: hasDiplomaticContext,
  foreign_cultural_exchange: hasDiplomaticContext,
  iron_khanate_border_provocation: hasDiplomaticContext,
  faction_peace_summit: (s) => hasMultipleFactionTypes(s) && hasFactionType("institutional")(s),

  helix_commune_medical_offer: hasExternalRelations,
  aureus_dominion_acquisition: hasExternalRelations,
  verdant_enclave_ultimatum: hasDiplomaticContext,
  null_zone_scavenger_deal: hasDiplomaticContext,
  ghost_meridian_signal: (s) => s.totalTicks > 15000,
  crimson_reach_arms_offer: hasDiplomaticContext,
  silent_ark_broadcast: (s) => s.totalTicks > 12000,
  beneath_tremor_message: (s) => s.totalTicks > 10000,
  iron_armada_tribute: hasExternalRelations,

  township_dusthaven_water_crisis: hasDiplomaticContext,
  township_scrapyard_turf_war: hasDiplomaticContext,
  township_blackridge_peace_offer: (s) => s.totalTicks > 8000,
  township_new_eden_harvest: hasDiplomaticContext,
  township_mireholm_rights: hasDiplomaticContext,
  township_pilgrim_station_refugee: hasDiplomaticContext,
  township_vault_town_discovery: (s) => s.totalTicks > 10000,
  township_echo_chamber_secrets: (s) => s.totalTicks > 8000,
  township_ember_falls_eruption: hasDiplomaticContext,
  township_ghost_relay_intel: hasDiplomaticContext,
  township_sky_haven_discovery: hasDiplomaticContext,
  township_crucible_malfunction: (s) => s.totalTicks > 6000,
  township_sunken_arcadia_trade: hasDiplomaticContext,
  multi_city_summit_invitation: hasExternalRelations,
  wasteland_nomad_contact: hasDiplomaticContext,

  khanate_tribute_demand: hasExternalRelations,
  dominion_hostile_takeover: hasExternalRelations,
  enclave_pollution_ultimatum: hasDiplomaticContext,
  commune_neural_plague: hasExternalRelations,
  armada_blockade: hasExternalRelations,
  null_zone_refugees: hasDiplomaticContext,
  ghost_meridian_mathematical_broadcast: (s) => s.totalTicks > 18000,
  silent_ark_drift: (s) => s.totalTicks > 12000,
  beneath_tremors: (s) => s.totalTicks > 10000,
  crimson_reach_arms_deal: hasDiplomaticContext,

  expansion_toxic_leak: (s) => (s.districtExpansion?.activeReclamations?.length ?? 0) > 0,
  expansion_site_collapse: (s) => (s.districtExpansion?.activeReclamations?.length ?? 0) > 0,
  expansion_artifact_found: (s) => (s.districtExpansion?.activeReclamations?.length ?? 0) > 0,
  expansion_worker_protest: (s) => (s.districtExpansion?.activeReclamations?.length ?? 0) >= 2,
  expansion_breakthrough: (s) => (s.districtExpansion?.totalReclaimed ?? 0) >= 3,
  expansion_squatter_conflict: (s) => (s.districtExpansion?.activeReclamations?.length ?? 0) > 0,
};

export function classifyStaticRandomEvent(eventId: string): StaticRandomEventClassification {
  return STATIC_EVENT_PREREQUISITES[eventId] || isSDContentId(eventId)
    ? "prerequisite-sensitive"
    : "intentionally-ambient";
}

export function isStaticRandomEventEligible(state: GameState, eventId: string): boolean {
  // Sixth Day's entire event catalog assumes a functioning genetics sector.
  // Clone-named stories require actual cloning capability, while the remaining
  // genetics/DNA stories require the broader genetics gate. This prevents the
  // addon toggle alone from creating clone workers, clone courts, or gene-tech
  // headlines before the player has built or researched the enabling systems.
  if (isSDContentId(eventId)) {
    if (!isSixthDayActive(state.addons)) return false;
    if (eventId.includes("clone")) return hasCloningCapability(state);
    return hasGeneticsResearch(state);
  }
  return STATIC_EVENT_PREREQUISITES[eventId]?.(state) ?? true;
}

const EXPANSION_RESPONSE_MAP: Record<string, EventResponse[]> = {
  expansion_toxic_leak: [
    { id: "exp_emergency_cleanup", label: "EMERGENCY CLEANUP", effects: { credits: -6000, happiness: 1 } },
    { id: "exp_evacuate_workers", label: "EVACUATE WORKERS", effects: { credits: -2000, happiness: -1 } },
    { id: "exp_ignore_leak", label: "PUSH THROUGH", effects: { happiness: -4, unrest: 3 } },
  ],
  expansion_site_collapse: [
    { id: "exp_rescue_ops", label: "RESCUE OPERATIONS", effects: { credits: -5000, happiness: 2, unrest: -1 } },
    { id: "exp_rebuild_section", label: "REBUILD SECTION", effects: { credits: -8000, happiness: -1 } },
    { id: "exp_abandon_site", label: "WRITE OFF SECTION", effects: { happiness: -3, unrest: 2 } },
  ],
  expansion_artifact_found: [
    { id: "exp_preserve_artifact", label: "PRESERVE & STUDY", effects: { credits: -3000, happiness: 3 } },
    { id: "exp_sell_artifact", label: "SELL TO COLLECTORS", effects: { credits: 10000, corruption: 2 } },
    { id: "exp_destroy_artifact", label: "BULLDOZE IT", effects: { happiness: -2 } },
  ],
  expansion_worker_protest: [
    { id: "exp_raise_wages", label: "RAISE WAGES", effects: { credits: -4000, happiness: 3, unrest: -3 } },
    { id: "exp_replace_workers", label: "REPLACE WORKERS", effects: { credits: -2000, happiness: -3, unrest: 2, crime: 1 } },
    { id: "exp_negotiate", label: "NEGOTIATE", effects: { credits: -1000, happiness: 1, unrest: -1 } },
  ],
  expansion_breakthrough: [
    { id: "exp_share_findings", label: "SHARE PUBLICLY", effects: { happiness: 4, unrest: -2 } },
    { id: "exp_classify_findings", label: "CLASSIFY RESULTS", effects: { credits: 5000, corruption: 1 } },
    { id: "exp_sell_patent", label: "SELL THE PATENT", effects: { credits: 12000, happiness: -1 } },
  ],
  expansion_squatter_conflict: [
    { id: "exp_relocate_squatters", label: "RELOCATE SQUATTERS", effects: { credits: -4000, happiness: 2, unrest: -2 } },
    { id: "exp_evict_force", label: "FORCED EVICTION", effects: { credits: -1000, happiness: -4, unrest: 4, crime: 2 } },
    { id: "exp_integrate", label: "INTEGRATE INTO PROJECT", effects: { credits: -2000, happiness: 3, crime: -1 } },
  ],
};

export const EXPANSION_EVENT_POOL: Omit<GameEvent, "timestamp" | "resolved">[] = [
  { id: "expansion_toxic_leak", title: "TOXIC LEAK AT RECLAMATION SITE", severity: "high", effects: { happiness: -2, unrest: 2 }, responseOptions: EXPANSION_RESPONSE_MAP["expansion_toxic_leak"] },
  { id: "expansion_site_collapse", title: "RECLAMATION SITE COLLAPSE", severity: "high", effects: { happiness: -3, unrest: 3 }, responseOptions: EXPANSION_RESPONSE_MAP["expansion_site_collapse"] },
  { id: "expansion_artifact_found", title: "PRE-COLLAPSE ARTIFACT DISCOVERED", severity: "low", effects: { happiness: 2 }, responseOptions: EXPANSION_RESPONSE_MAP["expansion_artifact_found"] },
  { id: "expansion_worker_protest", title: "RECLAMATION WORKERS STRIKE", severity: "medium", effects: { happiness: -2, unrest: 3 }, responseOptions: EXPANSION_RESPONSE_MAP["expansion_worker_protest"] },
  { id: "expansion_breakthrough", title: "DECONTAMINATION BREAKTHROUGH", severity: "low", effects: { happiness: 3 }, responseOptions: EXPANSION_RESPONSE_MAP["expansion_breakthrough"] },
  { id: "expansion_squatter_conflict", title: "SQUATTERS RESIST RECLAMATION", severity: "medium", effects: { unrest: 2, crime: 2 }, responseOptions: EXPANSION_RESPONSE_MAP["expansion_squatter_conflict"] },
];

export const EVENT_POOL: Omit<GameEvent, "timestamp" | "resolved">[] = [
  {
    id: "gang_war",
    title: "GANG WAR ERUPTS",
    severity: "high",
    effects: { crime: 8, unrest: 6, credits: -2000 },
    factionId: "gangs",
    responseOptions: RESPONSE_MAP["gang_war"],
  },
  {
    id: "water_pipe_burst",
    title: "WATER MAIN FAILURE",
    severity: "medium",
    effects: { water: -80, unrest: 5, happiness: -3 },
    responseOptions: RESPONSE_MAP["water_pipe_burst"],
  },
  {
    id: "corp_bribe",
    title: "MEGACORP FINANCIAL OFFERING",
    severity: "medium",
    effects: { credits: 8000, corruption: 6 },
    factionId: "corps",
    responseOptions: RESPONSE_MAP["corp_bribe"],
  },
  {
    id: "refugee_wave",
    title: "REFUGEE WAVE FROM SECTOR 12",
    severity: "medium",
    effects: { unrest: 4, crime: 3, happiness: -2 },
    responseOptions: RESPONSE_MAP["refugee_wave"],
  },
  {
    id: "judge_killed",
    title: "ENFORCERS AMBUSHED",
    severity: "high",
    effects: { crime: 5, lawOrder: -6, happiness: -2 },
    factionId: "judges",
    responseOptions: RESPONSE_MAP["judge_killed"],
  },
  {
    id: "food_synth_fire",
    title: "FOOD SYNTH FACILITY FIRE",
    severity: "critical",
    effects: { food: -200, unrest: 7, crime: 4, happiness: -4 },
    responseOptions: RESPONSE_MAP["food_synth_fire"],
  },
  {
    id: "propaganda_success",
    title: "PROPAGANDA CAMPAIGN SUCCESS",
    severity: "low",
    effects: { happiness: 8, unrest: -5 },
    responseOptions: RESPONSE_MAP["propaganda_success"],
  },
  {
    id: "mutant_uprising",
    title: "MUTANT COLLECTIVE UPRISING",
    severity: "critical",
    effects: { unrest: 12, crime: 8, lawOrder: -5 },
    factionId: "mutants",
    responseOptions: RESPONSE_MAP["mutant_uprising"],
  },
  {
    id: "smuggling_ring_busted",
    title: "SMUGGLING RING DISMANTLED",
    severity: "low",
    effects: { crime: -6, corruption: -4, credits: 3000, lawOrder: 4 },
    factionId: "judges",
    responseOptions: RESPONSE_MAP["smuggling_ring_busted"],
  },
  {
    id: "industrial_accident",
    title: "REFINERY EXPLOSION",
    severity: "critical",
    effects: { power: -20, unrest: 10, happiness: -6, credits: -5000 },
    responseOptions: RESPONSE_MAP["industrial_accident"],
  },
  {
    id: "tech_breakthrough",
    title: "TECH DIVISION BREAKTHROUGH",
    severity: "low",
    effects: { credits: 0, lawOrder: 3 },
    responseOptions: RESPONSE_MAP["tech_breakthrough"],
  },
  {
    id: "corruption_scandal",
    title: "CORRUPTION SCANDAL EXPOSED",
    severity: "high",
    effects: { corruption: 10, unrest: 8, lawOrder: -6, happiness: -4 },
    responseOptions: RESPONSE_MAP["corruption_scandal"],
  },
  {
    id: "power_grid_overload",
    title: "POWER GRID OVERLOAD",
    severity: "high",
    effects: { power: -150, unrest: 6, happiness: -4 },
    responseOptions: RESPONSE_MAP["power_grid_overload"],
  },
  {
    id: "transit_strike",
    title: "TRANSIT WORKERS STRIKE",
    severity: "medium",
    effects: { unrest: 8, happiness: -5, credits: -3000 },
    responseOptions: RESPONSE_MAP["transit_strike"],
  },
  {
    id: "black_market_festival",
    title: "BLACK MARKET FESTIVAL",
    severity: "medium",
    effects: { crime: 8, credits: 5000, corruption: 4 },
    factionId: "gangs",
    responseOptions: RESPONSE_MAP["black_market_festival"],
  },
  {
    id: "drone_delivery_congestion",
    title: "DRONE DELIVERY CONGESTION",
    severity: "low",
    effects: { happiness: -3, credits: -1000 },
    responseOptions: RESPONSE_MAP["drone_delivery_congestion"],
  },
  {
    id: "housing_shortage_crisis",
    title: "HOUSING SHORTAGE CRISIS",
    severity: "high",
    effects: { unrest: 10, happiness: -8, crime: 4 },
    responseOptions: RESPONSE_MAP["housing_shortage_crisis"],
  },
  {
    id: "underground_tunnel_discovery",
    title: "UNDERGROUND TUNNEL NETWORK",
    severity: "medium",
    effects: { crime: 3, corruption: 2 },
    responseOptions: RESPONSE_MAP["underground_tunnel_discovery"],
  },
  {
    id: "citywide_parade",
    title: "CITYWIDE PARADE CELEBRATION",
    severity: "low",
    effects: { happiness: 10, unrest: -5 },
    responseOptions: [
      { id: "parade_extend", label: "EXTEND TO 3 DAYS", effects: { credits: -5000, happiness: 6, unrest: -4 } },
      { id: "parade_security", label: "INCREASE SECURITY", effects: { credits: -3000, crime: -2, lawOrder: 2 } },
      { id: "parade_speech", label: "ADDRESS THE CROWDS", effects: { credits: -1000, happiness: 3 } },
    ],
  },
  {
    id: "water_pipeline_rupture",
    title: "WATER PIPELINE RUPTURE",
    severity: "high",
    effects: { water: -120, unrest: 5, credits: -4000 },
    responseOptions: RESPONSE_MAP["water_pipe_burst"],
  },
  {
    id: "garbage_strike",
    title: "SANITATION WORKERS STRIKE",
    severity: "medium",
    effects: { happiness: -7, unrest: 6, crime: 2 },
    responseOptions: RESPONSE_MAP["garbage_strike"],
  },
  {
    id: "subway_flooding",
    title: "SUBWAY SYSTEM FLOODING",
    severity: "high",
    effects: { credits: -6000, happiness: -5, unrest: 4 },
    responseOptions: RESPONSE_MAP["subway_flooding"],
  },
  {
    id: "illegal_street_racing",
    title: "ILLEGAL STREET RACING OUTBREAK",
    severity: "medium",
    effects: { crime: 6, happiness: 2, lawOrder: -4 },
    responseOptions: RESPONSE_MAP["illegal_street_racing"],
  },
  {
    id: "construction_accident",
    title: "MEGABLOCK CONSTRUCTION ACCIDENT",
    severity: "critical",
    effects: { happiness: -6, unrest: 8, credits: -8000 },
    responseOptions: RESPONSE_MAP["construction_accident"],
  },
  {
    id: "free_clinic_week",
    title: "FREE CLINIC WEEK",
    severity: "low",
    effects: { happiness: 7, unrest: -3 },
    responseOptions: [
      { id: "clinic_extend", label: "MAKE IT PERMANENT", effects: { credits: -15000, happiness: 8, unrest: -5 } },
      { id: "clinic_fund", label: "FUND THE INITIATIVE", effects: { credits: -5000, happiness: 4, medSupplies: -20 } },
      { id: "clinic_acknowledge", label: "PUBLIC THANK YOU", effects: { happiness: 2 } },
    ],
  },
  {
    id: "citizen_protest_rally",
    title: "MASS CITIZEN PROTEST",
    severity: "medium",
    effects: { unrest: 9, happiness: -3, lawOrder: -3 },
    responseOptions: RESPONSE_MAP["citizen_protest_rally"],
  },
  {
    id: "cargo_ship_arrival",
    title: "CARGO SHIP ARRIVAL",
    severity: "low",
    effects: { food: 150, happiness: 4, credits: 3000 },
    responseOptions: [
      { id: "cargo_accept", label: "ACCEPT AND DISTRIBUTE", effects: { food: 50, happiness: 3 } },
      { id: "cargo_investigate", label: "INVESTIGATE THE CAPTAIN", effects: { credits: -2000, crime: -2, corruption: -1 } },
      { id: "cargo_stockpile", label: "ADD TO STRATEGIC RESERVES", effects: { food: 30, water: 20 } },
    ],
  },
  {
    id: "ai_system_malfunction",
    title: "AI SYSTEM MALFUNCTION",
    severity: "high",
    effects: { unrest: 7, happiness: -6, crime: 4, credits: -5000 },
    responseOptions: RESPONSE_MAP["ai_system_malfunction"],
  },
  {
    id: "political_scandal",
    title: "POLITICAL SCANDAL",
    severity: "high",
    effects: { corruption: 12, unrest: 8, happiness: -5, lawOrder: -5 },
    responseOptions: RESPONSE_MAP["political_scandal"],
  },
  {
    id: "emergency_rationing",
    title: "EMERGENCY RESOURCE RATIONING",
    severity: "critical",
    effects: { food: -100, water: -80, unrest: 12, happiness: -10 },
    responseOptions: RESPONSE_MAP["emergency_rationing"],
  },
  {
    id: "media_scandal",
    title: "MEDIA SCANDAL ERUPTS",
    severity: "medium",
    effects: { corruption: 5, unrest: 7, happiness: -4 },
    responseOptions: RESPONSE_MAP["media_scandal"],
  },
  {
    id: "new_tech_showcase",
    title: "NEW TECHNOLOGY SHOWCASE",
    severity: "low",
    effects: { happiness: 6, credits: 5000, unrest: -3 },
    responseOptions: RESPONSE_MAP["new_tech_showcase"],
  },
  {
    id: "power_plant_explosion",
    title: "POWER PLANT EXPLOSION",
    severity: "critical",
    effects: { power: -300, unrest: 12, happiness: -8, credits: -15000 },
    responseOptions: RESPONSE_MAP["power_plant_explosion"],
  },
  {
    id: "dam_failure",
    title: "DAM FAILURE",
    severity: "critical",
    effects: { water: -200, unrest: 10, happiness: -8, credits: -10000 },
    responseOptions: RESPONSE_MAP["dam_failure"],
  },
  {
    id: "bridge_collapse",
    title: "INFRASTRUCTURE COLLAPSE — BRIDGE",
    severity: "critical",
    effects: { happiness: -10, unrest: 12, credits: -12000 },
    responseOptions: RESPONSE_MAP["bridge_collapse"],
  },
  {
    id: "massive_smog_storm",
    title: "MASSIVE SMOG STORM",
    severity: "high",
    effects: { happiness: -7, unrest: 5, credits: -3000 },
    responseOptions: RESPONSE_MAP["massive_smog_storm"],
  },
  {
    id: "urban_wildfire",
    title: "URBAN WILDFIRE",
    severity: "critical",
    effects: { happiness: -8, unrest: 8, credits: -8000, crime: 3 },
    responseOptions: RESPONSE_MAP["urban_wildfire"],
  },
  {
    id: "toxic_chemical_cloud",
    title: "TOXIC CHEMICAL CLOUD",
    severity: "critical",
    effects: { happiness: -10, unrest: 10, credits: -6000 },
    responseOptions: RESPONSE_MAP["toxic_chemical_cloud"],
  },
  {
    id: "radiation_leak",
    title: "RADIATION LEAK DETECTED",
    severity: "critical",
    effects: { happiness: -12, unrest: 14, credits: -20000 },
    responseOptions: RESPONSE_MAP["radiation_leak"],
  },
  {
    id: "factory_meltdown",
    title: "FACTORY MELTDOWN",
    severity: "critical",
    effects: { happiness: -6, unrest: 7, credits: -10000 },
    responseOptions: RESPONSE_MAP["factory_meltdown"],
  },
  {
    id: "massive_riot",
    title: "MASSIVE CITYWIDE RIOT",
    severity: "critical",
    effects: { unrest: 20, crime: 15, happiness: -15, lawOrder: -12 },
    responseOptions: RESPONSE_MAP["massive_riot"],
  },
  {
    id: "gang_war_escalation",
    title: "GANG WAR ESCALATION",
    severity: "high",
    effects: { crime: 12, unrest: 10, lawOrder: -8, happiness: -6 },
    responseOptions: RESPONSE_MAP["gang_war"],
  },
  {
    id: "prison_break",
    title: "MASS PRISON BREAK",
    severity: "critical",
    effects: { crime: 15, unrest: 12, lawOrder: -10, happiness: -8 },
    responseOptions: RESPONSE_MAP["prison_break"],
  },
  {
    id: "drone_swarm_malfunction",
    title: "DRONE SWARM MALFUNCTION",
    severity: "critical",
    effects: { crime: 5, unrest: 15, happiness: -12, lawOrder: -6 },
    responseOptions: RESPONSE_MAP["drone_swarm_malfunction"],
  },
  {
    id: "citywide_network_outage",
    title: "CITYWIDE NETWORK OUTAGE",
    severity: "high",
    effects: { unrest: 10, happiness: -8, credits: -8000, crime: 5 },
    responseOptions: RESPONSE_MAP["citywide_network_outage"],
  },
  {
    id: "meteor_strike",
    title: "METEOR STRIKE",
    severity: "critical",
    effects: { happiness: -15, unrest: 15, credits: -25000 },
    responseOptions: RESPONSE_MAP["meteor_strike"],
  },
  {
    id: "flu_outbreak",
    title: "FLU OUTBREAK",
    severity: "high",
    effects: { happiness: -6, unrest: 4, credits: -4000 },
    responseOptions: RESPONSE_MAP["flu_outbreak"],
  },
  {
    id: "water_contamination",
    title: "WATER SUPPLY CONTAMINATION",
    severity: "critical",
    effects: { water: -150, happiness: -10, unrest: 12, credits: -8000 },
    responseOptions: RESPONSE_MAP["water_contamination"],
  },
  {
    id: "government_collapse_event",
    title: "GOVERNMENT COLLAPSE THREAT",
    severity: "critical",
    effects: { corruption: 15, unrest: 12, lawOrder: -10, happiness: -8 },
    responseOptions: RESPONSE_MAP["government_collapse_event"],
  },
  {
    id: "military_coup_attempt",
    title: "MILITARY COUP ATTEMPT",
    severity: "critical",
    effects: { unrest: 20, crime: 10, lawOrder: -15, happiness: -12 },
    responseOptions: RESPONSE_MAP["military_coup_attempt"],
  },
  {
    id: "mega_tower_collapse",
    title: "MEGA TOWER STRUCTURAL COLLAPSE",
    severity: "critical",
    effects: { happiness: -15, unrest: 15, credits: -20000 },
    responseOptions: RESPONSE_MAP["mega_tower_collapse"],
  },
  {
    id: "economic_crash",
    title: "ECONOMIC CRASH",
    severity: "critical",
    effects: { credits: -30000, unrest: 12, happiness: -10, crime: 8 },
    responseOptions: RESPONSE_MAP["economic_crash"],
  },
  {
    id: "urban_sinkhole",
    title: "URBAN SINKHOLE DISASTER",
    severity: "critical",
    effects: { happiness: -10, unrest: 8, credits: -15000 },
    responseOptions: RESPONSE_MAP["urban_sinkhole"],
  },
  {
    id: "waste_crisis",
    title: "WASTE MANAGEMENT COLLAPSE",
    severity: "high",
    effects: { happiness: -8, unrest: 6, crime: 3 },
    responseOptions: RESPONSE_MAP["waste_crisis"],
    maxResponses: 2,
  },
  {
    id: "power_shortage",
    title: "CRITICAL POWER DEFICIT",
    severity: "high",
    effects: { power: -100, happiness: -6, unrest: 5, crime: 3 },
    responseOptions: RESPONSE_MAP["power_shortage"],
    maxResponses: 2,
  },
  {
    id: "food_shortage",
    title: "FOOD PRODUCTION CRISIS",
    severity: "critical",
    effects: { food: -120, happiness: -8, unrest: 8, crime: 4 },
    responseOptions: RESPONSE_MAP["food_shortage"],
    maxResponses: 2,
  },
  {
    id: "water_shortage",
    title: "WATER SUPPLY CRISIS",
    severity: "critical",
    effects: { water: -100, happiness: -8, unrest: 8, crime: 3 },
    responseOptions: RESPONSE_MAP["water_shortage"],
    maxResponses: 2,
  },
  {
    id: "trade_windfall",
    title: "UNEXPECTED TRADE WINDFALL",
    severity: "low",
    effects: { credits: 15000, happiness: 4 },
    responseOptions: RESPONSE_MAP["trade_windfall"],
  },
  {
    id: "cultural_renaissance",
    title: "CULTURAL RENAISSANCE",
    severity: "low",
    effects: { happiness: 8, unrest: -4 },
    responseOptions: RESPONSE_MAP["cultural_renaissance"],
  },
  {
    id: "citizen_heroism",
    title: "CITIZEN HEROISM REPORTED",
    severity: "low",
    effects: { happiness: 5, unrest: -3 },
    responseOptions: RESPONSE_MAP["citizen_heroism"],
  },
  {
    id: "voluntary_cleanup",
    title: "VOLUNTARY SECTOR CLEANUP",
    severity: "low",
    effects: { happiness: 4, unrest: -2 },
    responseOptions: RESPONSE_MAP["voluntary_cleanup"],
  },
  {
    id: "surplus_harvest",
    title: "BUMPER HARVEST FROM HYDRO-FARMS",
    severity: "low",
    effects: { food: 200, happiness: 5, unrest: -3 },
  },
  {
    id: "crime_tip_off",
    title: "ANONYMOUS CRIME TIP-OFF",
    severity: "low",
    effects: { crime: -6, lawOrder: 4, corruption: -2 },
    responseOptions: [
      { id: "tip_full_raids", label: "SIMULTANEOUS RAIDS", effects: { credits: -6000, crime: -5, lawOrder: 3 } },
      { id: "tip_investigate_source", label: "INVESTIGATE THE SOURCE", effects: { credits: -3000, crime: -2, corruption: -1 } },
      { id: "tip_leak_to_press", label: "LEAK TO THE PRESS", effects: { crime: -4, happiness: 3, corruption: -2 } },
    ],
  },
  {
    id: "diplomatic_gift",
    title: "DIPLOMATIC GIFT RECEIVED",
    severity: "low",
    effects: { happiness: 4, credits: 5000, medSupplies: 30 },
  },
  {
    id: "birth_rate_spike",
    title: "BIRTH RATE SPIKE REPORTED",
    severity: "low",
    effects: { happiness: 6, unrest: -2 },
    responseOptions: [
      { id: "birth_fund_nurseries", label: "FUND NURSERIES", effects: { credits: -8000, happiness: 4, unrest: -2 } },
      { id: "birth_family_bonus", label: "FAMILY BONUS PROGRAM", effects: { credits: -10000, happiness: 6 } },
      { id: "birth_do_nothing", label: "ACKNOWLEDGE THE REPORT", effects: { happiness: 1 } },
    ],
  },
  {
    id: "corruption_purge_success",
    title: "INTERNAL AFFAIRS BREAKTHROUGH",
    severity: "low",
    effects: { corruption: -8, happiness: 5, lawOrder: 4 },
  },
  {
    id: "energy_breakthrough",
    title: "FUSION EFFICIENCY BREAKTHROUGH",
    severity: "low",
    effects: { power: 100, happiness: 3, credits: 3000 },
    responseOptions: [
      { id: "energy_expand", label: "EXPAND TO ALL REACTORS", effects: { credits: -10000, power: 80 } },
      { id: "energy_research", label: "FUND FURTHER RESEARCH", effects: { credits: -8000, happiness: 2 } },
      { id: "energy_celebrate", label: "PUBLIC RECOGNITION", effects: { credits: -2000, happiness: 4, unrest: -2 } },
    ],
  },
  {
    id: "underground_garden",
    title: "UNDERGROUND GARDEN DISCOVERED",
    severity: "low",
    effects: { happiness: 6, unrest: -3 },
    responseOptions: [
      { id: "garden_preserve", label: "PRESERVE AS PUBLIC PARK", effects: { credits: -3000, happiness: 5, unrest: -3 } },
      { id: "garden_expand", label: "EXPAND INTO URBAN FARM", effects: { credits: -8000, food: 30, happiness: 3 } },
      { id: "garden_study", label: "STUDY THE TECHNIQUES", effects: { credits: -2000, happiness: 2 } },
    ],
  },
  {
    id: "militia_volunteers",
    title: "VOLUNTEER MILITIA SURGE",
    severity: "low",
    effects: { defenseRating: 3, happiness: 3, unrest: -2 },
    responseOptions: [
      { id: "militia_train", label: "ACCELERATED TRAINING", effects: { credits: -5000, defenseRating: 3 } },
      { id: "militia_equip", label: "FULL EQUIPMENT ISSUE", effects: { credits: -10000, defenseRating: 4, happiness: 2 } },
      { id: "militia_home_guard", label: "ASSIGN TO HOME GUARD", effects: { credits: -3000, crime: -3, lawOrder: 2 } },
    ],
  },
  {
    id: "mega_construction_sabotage",
    title: "MEGA-PROJECT SITE SABOTAGED",
    severity: "high",
    effects: { credits: -12000, unrest: 6, happiness: -4 },
    responseOptions: [
      { id: "sab_lockdown", label: "FULL SITE LOCKDOWN", effects: { credits: -8000, happiness: -1, lawOrder: 3 } },
      { id: "sab_investigate", label: "LAUNCH INVESTIGATION", effects: { credits: -5000, crime: -3, corruption: -1 } },
      { id: "sab_accelerate", label: "ACCELERATE CONSTRUCTION", effects: { credits: -15000, happiness: 2, unrest: -2 } },
      { id: "sab_retaliate", label: "RETALIATORY RAIDS", effects: { credits: -10000, crime: -5, unrest: 3, lawOrder: 4 } },
    ],
  },
  {
    id: "mega_project_overrun",
    title: "MEGA-PROJECT COST OVERRUN",
    severity: "medium",
    effects: { credits: -20000, corruption: 3, happiness: -2 },
    responseOptions: [
      { id: "overrun_audit", label: "FORENSIC AUDIT", effects: { credits: -5000, corruption: -4, happiness: 1 } },
      { id: "overrun_absorb", label: "ABSORB THE COSTS", effects: { credits: -15000, happiness: -1 } },
      { id: "overrun_cut_corners", label: "CUT CORNERS", effects: { credits: 10000, happiness: -3, corruption: 2 } },
      { id: "overrun_renegotiate", label: "RENEGOTIATE CONTRACTS", effects: { credits: -3000, corruption: -1 } },
    ],
  },
  {
    id: "mega_project_inspection",
    title: "SAFETY INSPECTION CRISIS",
    severity: "high",
    effects: { happiness: -3, unrest: 4, credits: -5000 },
    responseOptions: [
      { id: "insp_comply", label: "FULL COMPLIANCE", effects: { credits: -18000, happiness: 3, unrest: -3 } },
      { id: "insp_bribe", label: "BRIBE THE INSPECTOR", effects: { credits: -8000, corruption: 5 } },
      { id: "insp_partial", label: "PARTIAL REMEDIATION", effects: { credits: -10000, happiness: -1, corruption: 1 } },
    ],
  },
  {
    id: "mega_worker_strike",
    title: "MEGA-PROJECT WORKERS STRIKE",
    severity: "high",
    effects: { unrest: 8, happiness: -5 },
    responseOptions: [
      { id: "strike_negotiate", label: "NEGOTIATE TERMS", effects: { credits: -12000, happiness: 4, unrest: -5 } },
      { id: "strike_replace", label: "REPLACE THE WORKERS", effects: { credits: -5000, happiness: -4, unrest: 3, corruption: 2 } },
      { id: "strike_concede", label: "FULL CONCESSIONS", effects: { credits: -20000, happiness: 6, unrest: -6 } },
      { id: "strike_martial", label: "DECLARE ESSENTIAL SERVICE", effects: { happiness: -6, unrest: 4, lawOrder: 4 } },
    ],
  },
  {
    id: "mega_project_espionage",
    title: "MEGA-PROJECT BLUEPRINTS STOLEN",
    severity: "high",
    effects: { crime: 4, unrest: 3, lawOrder: -3 },
    responseOptions: [
      { id: "esp_lockdown", label: "TOTAL INFORMATION LOCKDOWN", effects: { credits: -5000, crime: -2, happiness: -1 } },
      { id: "esp_counterintel", label: "COUNTER-INTELLIGENCE SWEEP", effects: { credits: -10000, crime: -4, corruption: -2, lawOrder: 3 } },
      { id: "esp_disinfo", label: "FEED FALSE BLUEPRINTS", effects: { credits: -3000, crime: -3, corruption: 1 } },
    ],
  },
  {
    id: "mega_project_resource_discovery",
    title: "MEGA-PROJECT EXCAVATION DISCOVERY",
    severity: "low",
    effects: { credits: 15000, happiness: 3 },
    responseOptions: [
      { id: "disc_use_project", label: "FEED INTO THE PROJECT", effects: { credits: 8000, happiness: 2 } },
      { id: "disc_sell", label: "SELL ON OPEN MARKET", effects: { credits: 12000, happiness: 1, corruption: 1 } },
      { id: "disc_stockpile", label: "STRATEGIC RESERVE", effects: { credits: 3000, happiness: 1 } },
    ],
  },
  {
    id: "mega_project_celebrity",
    title: "MEGA-PROJECT DRAWS GLOBAL ATTENTION",
    severity: "low",
    effects: { happiness: 8, credits: 10000, unrest: -4 },
    responseOptions: [
      { id: "celeb_open_tours", label: "OPEN PUBLIC TOURS", effects: { credits: 5000, happiness: 5, unrest: -3 } },
      { id: "celeb_restrict", label: "RESTRICT ACCESS", effects: { credits: 2000, happiness: -1, lawOrder: 2 } },
      { id: "celeb_recruit", label: "RECRUIT VISITING ENGINEERS", effects: { credits: -8000, happiness: 3 } },
    ],
  },
  {
    id: "mega_project_black_market_parts",
    title: "BLACK MARKET MEGA-PROJECT COMPONENTS",
    severity: "medium",
    effects: { corruption: 2 },
    responseOptions: [
      { id: "bmp_buy_all", label: "BUY EVERYTHING", effects: { credits: -20000, corruption: 3, happiness: 2 } },
      { id: "bmp_selective", label: "SELECTIVE PURCHASE", effects: { credits: -10000, corruption: 1 } },
      { id: "bmp_arrest", label: "ARREST THE DEALER", effects: { credits: -3000, crime: -3, lawOrder: 3, corruption: -2 } },
      { id: "bmp_sting", label: "SET UP A STING", effects: { credits: -12000, crime: -5, corruption: -1, lawOrder: 4 } },
    ],
  },
  {
    id: "reactor_cult_ceremony",
    title: "REACTOR CULT MASS GATHERING",
    severity: "high",
    effects: { unrest: 4, happiness: -2 },
    responseOptions: [
      { id: "rc_disperse", label: "DISPERSE THE CROWD", effects: { unrest: 5, crime: -2, lawOrder: 3, happiness: -4 } },
      { id: "rc_negotiate", label: "NEGOTIATE WITH ARCHPRIEST", effects: { credits: -3000, happiness: 2, unrest: -2 } },
      { id: "rc_monitor", label: "MONITOR FROM DISTANCE", effects: { credits: -1000, happiness: 1, unrest: 1 } },
      { id: "rc_join", label: "ATTEND THE CEREMONY", effects: { happiness: 4, corruption: 2, lawOrder: -2 } },
    ],
  },
  {
    id: "gene_wright_outbreak",
    title: "UNAUTHORIZED GENE MODIFICATION OUTBREAK",
    severity: "high",
    effects: { crime: 5, happiness: -3, unrest: 3 },
    responseOptions: [
      { id: "gw_raid", label: "RAID THE GENE LABS", effects: { credits: -8000, crime: -8, unrest: 4, lawOrder: 3 } },
      { id: "gw_regulate", label: "OFFER LICENSING", effects: { credits: -5000, crime: -3, happiness: 3, corruption: 2 } },
      { id: "gw_quarantine", label: "QUARANTINE AFFECTED", effects: { credits: -3000, happiness: -5, unrest: 3 } },
      { id: "gw_recruit", label: "RECRUIT DR. HELIX", effects: { credits: -15000, happiness: 2, crime: -5 } },
    ],
  },
  {
    id: "rust_warden_strike",
    title: "RUST WARDENS INFRASTRUCTURE STRIKE",
    severity: "critical",
    effects: { unrest: 6, happiness: -5, power: -100, water: -80 },
    responseOptions: [
      { id: "rw_concede", label: "MEET THEIR DEMANDS", effects: { credits: -20000, happiness: 5, unrest: -6, employment: 2 } },
      { id: "rw_partial", label: "PARTIAL CONCESSIONS", effects: { credits: -8000, happiness: 2, unrest: -2 } },
      { id: "rw_replace", label: "DEPLOY DROIDS", effects: { credits: -12000, unrest: 8, happiness: -4, power: 50, water: 40 } },
      { id: "rw_arrest", label: "ARREST LEADERSHIP", effects: { credits: -5000, unrest: 10, crime: -2, lawOrder: 4, happiness: -8 } },
    ],
  },
  {
    id: "free_trader_smuggling",
    title: "FREE TRADERS' GUILD SMUGGLING NETWORK",
    severity: "medium",
    effects: { crime: 4, corruption: 2 },
    responseOptions: [
      { id: "ft_bust", label: "RAID THE WAREHOUSES", effects: { credits: 15000, crime: -6, corruption: -2, happiness: -2 } },
      { id: "ft_tax", label: "IMPOSE TRADE TAX", effects: { credits: 10000, corruption: 4, crime: -1 } },
      { id: "ft_partner", label: "FORMALIZE THE TRADE", effects: { credits: -5000, happiness: 3, crime: -3, corruption: 1 } },
      { id: "ft_ignore", label: "LOOK THE OTHER WAY", effects: { happiness: 2, crime: 2, corruption: 3 } },
    ],
  },
  {
    id: "sky_haven_distress",
    title: "SKY HAVEN DISTRESS SIGNAL",
    severity: "critical",
    effects: { happiness: -3, unrest: 2 },
    responseOptions: [
      { id: "sh_rescue", label: "FULL RESCUE OPERATION", effects: { credits: -25000, happiness: 8, unrest: -4 } },
      { id: "sh_engineers", label: "SEND ENGINEERS ONLY", effects: { credits: -10000, happiness: 3, unrest: -1 } },
      { id: "sh_evacuate", label: "EVACUATE TO MEGACITY", effects: { credits: -8000, happiness: 2 } },
      { id: "sh_ignore", label: "NOT OUR JURISDICTION", effects: { happiness: -6, unrest: 3, corruption: 1 } },
    ],
  },
  {
    id: "echo_chamber_leak",
    title: "CLASSIFIED DATA LEAK",
    severity: "high",
    effects: { unrest: 8, happiness: -4, corruption: -2 },
    responseOptions: [
      { id: "ec_suppress", label: "SUPPRESS THE DATA", effects: { credits: -10000, unrest: 4, happiness: -3, corruption: 3 } },
      { id: "ec_embrace", label: "EMBRACE TRANSPARENCY", effects: { happiness: -2, unrest: 6, corruption: -5, lawOrder: -2 } },
      { id: "ec_negotiate", label: "NEGOTIATE WITH ARCHIVIST", effects: { credits: -15000, unrest: -2, corruption: -1 } },
      { id: "ec_raid", label: "RAID THE ECHO CHAMBER", effects: { credits: -8000, unrest: 10, happiness: -8, crime: 3, lawOrder: 4 } },
    ],
  },
  {
    id: "ghost_relay_intercept",
    title: "INTERCEPTED TRANSMISSION — MILITARY CONVOY",
    severity: "high",
    effects: { unrest: 2 },
    responseOptions: [
      { id: "gr_buy", label: "BUY THE INTEL", effects: { credits: -20000, defenseRating: 5, unrest: -2 } },
      { id: "gr_demand", label: "DEMAND IT FREE", effects: { happiness: -1, unrest: 3 } },
      { id: "gr_trade", label: "OFFER SUPPLIES INSTEAD", effects: { food: -200, credits: -2000, defenseRating: 4, happiness: 2 } },
      { id: "gr_ambush", label: "AMBUSH THE CONVOY", effects: { credits: -15000, defenseRating: 3, crime: 2, unrest: -1 } },
    ],
  },
  {
    id: "crucible_arms_deal",
    title: "THE CRUCIBLE OFFERS WEAPONS",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "ca_buy", label: "BUY THE WEAPONS", effects: { credits: -30000, defenseRating: 5, corruption: 2 } },
      { id: "ca_negotiate", label: "NEGOTIATE EXCLUSIVE CONTRACT", effects: { credits: -50000, defenseRating: 8, corruption: 1, happiness: 1 } },
      { id: "ca_refuse", label: "DECLINE THE OFFER", effects: { happiness: 1, lawOrder: 1 } },
      { id: "ca_investigate", label: "INVESTIGATE THE SOURCE", effects: { credits: -5000, crime: -2, lawOrder: 2 } },
    ],
  },
  {
    id: "sunken_arcadia_plague",
    title: "WATERBORNE PLAGUE IN SUNKEN ARCADIA",
    severity: "high",
    effects: { happiness: -2 },
    responseOptions: [
      { id: "sa_aid", label: "SEND FULL AID PACKAGE", effects: { credits: -15000, happiness: 5, unrest: -3, medSupplies: -20 } },
      { id: "sa_supplies", label: "SEND SUPPLIES ONLY", effects: { credits: -5000, happiness: 2, medSupplies: -10 } },
      { id: "sa_annex", label: "AID + ABSORB", effects: { credits: -20000, happiness: 3, unrest: 1, medSupplies: -15 } },
      { id: "sa_decline", label: "DECLINE", effects: { happiness: -4, unrest: 2 } },
    ],
  },
  {
    id: "prestige_assassination_attempt",
    title: "ASSASSINATION ATTEMPT ON COMMANDER",
    severity: "critical",
    effects: { unrest: 6, happiness: -4, crime: 3 },
    responseOptions: [
      { id: "pa_lockdown", label: "FULL SECURITY LOCKDOWN", effects: { credits: -20000, crime: -8, unrest: 5, happiness: -5, lawOrder: 5 } },
      { id: "pa_internal", label: "QUIET INVESTIGATION", effects: { credits: -10000, crime: -4, corruption: -2 } },
      { id: "pa_purge", label: "PURGE THE INNER CIRCLE", effects: { credits: -5000, corruption: -5, happiness: -3, unrest: 3 } },
      { id: "pa_speech", label: "ADDRESS THE CITY", effects: { happiness: 5, unrest: -4, crime: 1 } },
    ],
  },
  {
    id: "district_sinkhole",
    title: "MASSIVE SINKHOLE OPENS IN RESIDENTIAL DISTRICT",
    severity: "critical",
    effects: { happiness: -6, unrest: 5, credits: -15000 },
    responseOptions: [
      { id: "ds_rescue", label: "FULL RESCUE OPERATION", effects: { credits: -25000, happiness: 6, unrest: -4, lawOrder: 2 } },
      { id: "ds_seal", label: "SEAL THE AREA", effects: { credits: -15000, happiness: -2, unrest: -1 } },
      { id: "ds_explore", label: "EXPLORE THE UNDERCITY", effects: { credits: -8000, crime: 3, happiness: 1 } },
      { id: "ds_blame", label: "BLAME THE RUST WARDENS", effects: { happiness: -3, unrest: 4, corruption: 2 } },
    ],
  },
  {
    id: "ai_awakening",
    title: "CITY AI ANOMALOUS BEHAVIOR",
    severity: "high",
    effects: { happiness: 1, unrest: 3 },
    responseOptions: [
      { id: "ai_shutdown", label: "EMERGENCY SHUTDOWN", effects: { credits: -10000, happiness: -3, unrest: -2, lawOrder: 2 } },
      { id: "ai_contain", label: "ISOLATE AND STUDY", effects: { credits: -8000, unrest: -1 } },
      { id: "ai_embrace", label: "LET IT RUN", effects: { credits: 5000, happiness: 2, unrest: 4, corruption: 1 } },
      { id: "ai_negotiate", label: "...TALK TO IT", effects: { credits: -2000, unrest: 2, happiness: 3 } },
    ],
  },
  {
    id: "sewer_gas_explosion",
    title: "SEWER GAS EXPLOSION",
    severity: "high",
    effects: { happiness: -5, unrest: 4, water: -40, credits: -8000 },
    responseOptions: [
      { id: "sewer_seal", label: "SEAL & FLOOD TUNNELS", effects: { credits: -12000, water: -60, happiness: 2, unrest: -2 } },
      { id: "sewer_vent", label: "EMERGENCY VENTING", effects: { credits: -18000, happiness: 3 } },
      { id: "sewer_relocate", label: "EVACUATE HAB-BLOCK", effects: { credits: -10000, happiness: -2, unrest: 2 } },
    ],
  },
  {
    id: "solar_flare_blackout",
    title: "SOLAR FLARE — GRID DISRUPTION",
    severity: "critical",
    effects: { power: -150, happiness: -6, unrest: 5, crime: 4 },
    responseOptions: [
      { id: "sf_backup", label: "ACTIVATE BACKUP GENERATORS", effects: { credits: -15000, power: 80, happiness: 2 } },
      { id: "sf_triage", label: "TRIAGE CRITICAL SYSTEMS", effects: { credits: -5000, power: 40, happiness: -3, unrest: 2 } },
      { id: "sf_curfew", label: "DECLARE EMERGENCY CURFEW", effects: { crime: -5, happiness: -4, unrest: 3, lawOrder: 4 } },
    ],
  },
  {
    id: "toxic_spill_industrial",
    title: "TOXIC CHEMICAL SPILL",
    severity: "critical",
    effects: { happiness: -7, unrest: 6, medSupplies: -15 },
    responseOptions: [
      { id: "spill_evac", label: "MASS EVACUATION", effects: { credits: -20000, happiness: 3, unrest: -3 } },
      { id: "spill_shelter", label: "SHELTER IN PLACE ORDER", effects: { credits: -8000, happiness: -2, medSupplies: -10 } },
      { id: "spill_neutralize", label: "DEPLOY CHEM TEAMS", effects: { credits: -15000, happiness: 1 } },
      { id: "spill_blame", label: "ARREST PLANT MANAGEMENT", effects: { credits: -3000, lawOrder: 3, corruption: -2, happiness: -1 } },
    ],
  },
  {
    id: "elevator_malfunction_mass",
    title: "MASS ELEVATOR FAILURES",
    severity: "high",
    effects: { happiness: -4, unrest: 3, credits: -5000 },
    responseOptions: [
      { id: "elev_rescue", label: "DEPLOY RESCUE TEAMS", effects: { credits: -10000, happiness: 4, unrest: -3 } },
      { id: "elev_reboot", label: "EMERGENCY SOFTWARE REBOOT", effects: { credits: -3000, happiness: 1 } },
      { id: "elev_investigate", label: "INVESTIGATE SABOTAGE", effects: { credits: -6000, crime: -3, lawOrder: 2 } },
    ],
  },
  {
    id: "underground_cult_discovered",
    title: "UNDERGROUND CULT DISCOVERED",
    severity: "medium",
    effects: { unrest: 3, crime: 2, happiness: -1 },
    responseOptions: [
      { id: "cult_raid", label: "RAID THE TEMPLE", effects: { credits: -5000, crime: -4, unrest: 5, lawOrder: 3, happiness: -3 } },
      { id: "cult_monitor", label: "INFILTRATE & MONITOR", effects: { credits: -3000, crime: -1, corruption: 1 } },
      { id: "cult_tolerate", label: "REGISTER AS RELIGION", effects: { happiness: 3, unrest: -2, crime: 1 } },
      { id: "cult_signal", label: "INVESTIGATE THE SIGNAL", effects: { credits: -8000, happiness: 1 } },
    ],
  },
  {
    id: "grand_meridian_bridge_collapse",
    title: "SUSPENSION BRIDGE COLLAPSE",
    severity: "critical",
    effects: { happiness: -8, unrest: 7, credits: -20000 },
    responseOptions: [
      { id: "bridge_rescue", label: "MASSIVE RESCUE OPERATION", effects: { credits: -25000, happiness: 6, unrest: -4 } },
      { id: "bridge_ferry", label: "EMERGENCY FERRY SERVICE", effects: { credits: -10000, happiness: -1 } },
      { id: "bridge_rebuild", label: "PRIORITY RECONSTRUCTION", effects: { credits: -50000, happiness: 2, employment: 3 } },
    ],
  },
  {
    id: "heatwave_extreme",
    title: "EXTREME HEATWAVE",
    severity: "high",
    effects: { happiness: -5, water: -80, unrest: 4, power: -50 },
    responseOptions: [
      { id: "heat_shelters", label: "OPEN COOLING SHELTERS", effects: { credits: -8000, happiness: 4, power: -30 } },
      { id: "heat_restrict", label: "BAN OUTDOOR ACTIVITY", effects: { happiness: -2, unrest: 2, employment: -2 } },
      { id: "heat_water", label: "FREE WATER DISTRIBUTION", effects: { credits: -12000, water: -40, happiness: 5, unrest: -3 } },
    ],
  },
  {
    id: "data_center_fire",
    title: "CENTRAL DATA CENTER FIRE",
    severity: "critical",
    effects: { happiness: -4, unrest: 5, crime: 5, corruption: 3 },
    responseOptions: [
      { id: "data_save", label: "PRIORITIZE DATA RESCUE", effects: { credits: -15000, happiness: 2, crime: -3 } },
      { id: "data_fire", label: "FIGHT THE FIRE", effects: { credits: -8000, happiness: 3, crime: 2 } },
      { id: "data_rebuild", label: "WRITE IT OFF", effects: { credits: -5000, corruption: 4, crime: 3, happiness: -2 } },
    ],
  },
  {
    id: "rat_plague",
    title: "RAT SWARM INFESTATION",
    severity: "medium",
    effects: { food: -60, happiness: -4, crime: 2, unrest: 3 },
    responseOptions: [
      { id: "rat_poison", label: "MASS POISONING CAMPAIGN", effects: { credits: -6000, food: 30, happiness: -1, unrest: -2 } },
      { id: "rat_cats", label: "RELEASE PREDATOR ANIMALS", effects: { credits: -10000, food: 20, happiness: 2 } },
      { id: "rat_seal", label: "SEAL UNDERCITY ACCESS", effects: { credits: -8000, food: 10, water: -20 } },
      { id: "rat_bounty", label: "RAT BOUNTY PROGRAM", effects: { credits: -12000, food: 40, happiness: 3, crime: -1 } },
    ],
  },
  {
    id: "illegal_fight_ring",
    title: "UNDERGROUND FIGHT RING DISCOVERED",
    severity: "medium",
    effects: { crime: 5, corruption: 3 },
    responseOptions: [
      { id: "fight_raid", label: "POLICE RAID", effects: { credits: -4000, crime: -6, corruption: -2, happiness: -1 } },
      { id: "fight_regulate", label: "LEGALIZE AND TAX", effects: { credits: 8000, crime: -2, corruption: 2, happiness: 2 } },
      { id: "fight_infiltrate", label: "SEND UNDERCOVER AGENTS", effects: { credits: -3000, crime: -3, corruption: -1, lawOrder: 2 } },
    ],
  },
  {
    id: "orphanage_funding_crisis",
    title: "ORPHANAGE FUNDING CRISIS",
    severity: "medium",
    effects: { happiness: -6, unrest: 3 },
    responseOptions: [
      { id: "orphan_fund", label: "EMERGENCY FUNDING", effects: { credits: -15000, happiness: 8, unrest: -4 } },
      { id: "orphan_corporate", label: "CORPORATE SPONSORSHIP", effects: { credits: -3000, happiness: 4, corruption: 2 } },
      { id: "orphan_military", label: "MILITARY CADET PROGRAM", effects: { credits: -5000, happiness: -2, defenseRating: 1 } },
      { id: "orphan_ignore", label: "NOT A PRIORITY", effects: { happiness: -8, unrest: 5, corruption: 2 } },
    ],
  },
  {
    id: "gravity_anomaly",
    title: "LOCALIZED GRAVITY ANOMALY",
    severity: "high",
    effects: { happiness: -3, unrest: 5, crime: 2 },
    responseOptions: [
      { id: "grav_evacuate", label: "EVACUATE THE SECTOR", effects: { credits: -10000, happiness: 2, unrest: -3 } },
      { id: "grav_study", label: "DEPLOY RESEARCH TEAMS", effects: { credits: -8000, happiness: 1, unrest: -1 } },
      { id: "grav_contain", label: "MILITARY CONTAINMENT", effects: { credits: -6000, unrest: 3, lawOrder: 3 } },
      { id: "grav_exploit", label: "WEAPONIZE IT", effects: { credits: -20000, defenseRating: 5, happiness: -4, corruption: 3 } },
    ],
  },
  {
    id: "water_table_contamination",
    title: "AQUIFER CONTAMINATION DETECTED",
    severity: "high",
    effects: { water: -30, happiness: -3, unrest: 2 },
    responseOptions: [
      { id: "aquifer_clean", label: "DECONTAMINATION PROJECT", effects: { credits: -30000, water: 20, happiness: 2 } },
      { id: "aquifer_hunt", label: "FIND THE DUMPERS", effects: { credits: -8000, crime: -4, lawOrder: 3, corruption: -2 } },
      { id: "aquifer_alt", label: "DEVELOP ALTERNATIVE SOURCE", effects: { credits: -25000, water: 40 } },
    ],
  },
  {
    id: "rogue_drone_swarm",
    title: "ROGUE DRONE SWARM",
    severity: "medium",
    effects: { happiness: -3, unrest: 2, crime: 1 },
    responseOptions: [
      { id: "drone_emp", label: "LOCALIZED EMP BURST", effects: { credits: -8000, power: -30, happiness: 1, unrest: -2 } },
      { id: "drone_hack", label: "EMERGENCY FIRMWARE OVERRIDE", effects: { credits: -5000, happiness: 2 } },
      { id: "drone_shoot", label: "AUTHORIZE ANTI-AIR RESPONSE", effects: { credits: -3000, crime: -1, happiness: -1, defenseRating: 1 } },
    ],
  },
  {
    id: "ghost_ship_detected",
    title: "GHOST SHIP DETECTED",
    severity: "medium",
    effects: { happiness: 1, unrest: 2 },
    responseOptions: [
      { id: "ghost_board", label: "SEND BOARDING PARTY", effects: { credits: -6000, defenseRating: 2, crime: -1 } },
      { id: "ghost_tow", label: "TOW TO PORT", effects: { credits: -4000, happiness: 2 } },
      { id: "ghost_sink", label: "SINK IT", effects: { credits: -2000, defenseRating: 1, happiness: -2 } },
      { id: "ghost_sell", label: "AUCTION SALVAGE RIGHTS", effects: { credits: 10000, corruption: 2, crime: 1 } },
    ],
  },
  {
    id: "food_recall_scandal",
    title: "MASS FOOD RECALL",
    severity: "high",
    effects: { food: -120, happiness: -6, unrest: 5, crime: 2 },
    responseOptions: [
      { id: "food_recall_full", label: "FULL RECALL & REPLACEMENT", effects: { credits: -20000, food: 60, happiness: 4, unrest: -3 } },
      { id: "food_recall_partial", label: "TARGETED RECALL", effects: { credits: -8000, food: 30, happiness: -1 } },
      { id: "food_recall_cover", label: "SUPPRESS THE REPORT", effects: { corruption: 5, happiness: -2, unrest: 3 } },
      { id: "food_recall_arrest", label: "ARREST PLANT OPERATORS", effects: { credits: -5000, crime: -3, lawOrder: 3, food: -30 } },
    ],
  },
  {
    id: "pirate_radio_broadcast",
    title: "PIRATE RADIO UPRISING",
    severity: "medium",
    effects: { unrest: 6, happiness: -2, corruption: -1 },
    responseOptions: [
      { id: "pirate_jam", label: "JAM THE SIGNAL", effects: { credits: -5000, unrest: -3, happiness: -2 } },
      { id: "pirate_hunt", label: "TRACK & ARREST", effects: { credits: -8000, crime: -3, unrest: -4, lawOrder: 3, happiness: -3 } },
      { id: "pirate_debate", label: "CHALLENGE THEM TO DEBATE", effects: { happiness: 5, unrest: -5, corruption: -2 } },
      { id: "pirate_hire", label: "HIRE THEM", effects: { credits: -6000, happiness: 4, unrest: -4, corruption: 2 } },
    ],
  },
  {
    id: "meteor_near_miss",
    title: "NEAR-MISS METEOR EVENT",
    severity: "high",
    effects: { happiness: -5, unrest: 6, credits: -5000 },
    responseOptions: [
      { id: "meteor_defense", label: "BUILD ORBITAL DEFENSE", effects: { credits: -40000, defenseRating: 5, happiness: 4 } },
      { id: "meteor_tracking", label: "UPGRADE TRACKING SYSTEMS", effects: { credits: -15000, happiness: 2, unrest: -2 } },
      { id: "meteor_pray", label: "ADDRESS THE CITY", effects: { happiness: 2, unrest: -3 } },
    ],
  },
  {
    id: "veteran_protest",
    title: "VETERANS' MARCH ON COMMAND HQ",
    severity: "medium",
    effects: { unrest: 7, happiness: -3 },
    responseOptions: [
      { id: "vet_fund", label: "ESTABLISH VETERANS' FUND", effects: { credits: -20000, happiness: 8, unrest: -6, defenseRating: 1 } },
      { id: "vet_partial", label: "PARTIAL CONCESSIONS", effects: { credits: -8000, happiness: 3, unrest: -3 } },
      { id: "vet_disperse", label: "DISPERSE THE MARCH", effects: { credits: -3000, happiness: -5, unrest: 4, lawOrder: 3 } },
      { id: "vet_recruit", label: "OFFER THEM JOBS", effects: { credits: -10000, defenseRating: 3, unrest: -4, happiness: 2 } },
    ],
  },
  {
    id: "counterfeit_credits",
    title: "COUNTERFEIT CREDIT FLOOD",
    severity: "high",
    effects: { credits: -15000, corruption: 5, crime: 4, happiness: -3 },
    responseOptions: [
      { id: "counter_raid", label: "RAID THE OPERATION", effects: { credits: 8000, crime: -5, corruption: -3, lawOrder: 3 } },
      { id: "counter_currency", label: "NEW CURRENCY ISSUE", effects: { credits: -25000, corruption: -4, crime: -3 } },
      { id: "counter_monitor", label: "TRACE THE DISTRIBUTION", effects: { credits: -5000, crime: -3, corruption: -2 } },
    ],
  },
  {
    id: "mysterious_blackout_zone",
    title: "THE QUIET ZONE",
    severity: "high",
    effects: { unrest: 5, happiness: -4, crime: 3 },
    responseOptions: [
      { id: "quiet_recon", label: "SEND RECON TEAM", effects: { credits: -5000, happiness: 1, unrest: -2 } },
      { id: "quiet_cordon", label: "CORDON THE AREA", effects: { credits: -3000, unrest: 3, lawOrder: 2 } },
      { id: "quiet_force", label: "FULL MILITARY ENTRY", effects: { credits: -12000, crime: -4, happiness: -2, defenseRating: 1 } },
      { id: "quiet_broadcast", label: "BROADCAST INTO THE ZONE", effects: { credits: -1000, happiness: 2 } },
    ],
  },
  {
    id: "academy_graduation",
    title: "OFFICER ACADEMY GRADUATION",
    severity: "low",
    effects: { happiness: 4, lawOrder: 3, defenseRating: 1 },
    responseOptions: [
      { id: "grad_celebrate", label: "PUBLIC CELEBRATION", effects: { credits: -5000, happiness: 5, unrest: -3 } },
      { id: "grad_deploy", label: "IMMEDIATE DEPLOYMENT", effects: { crime: -3, lawOrder: 2, happiness: -1 } },
      { id: "grad_elite", label: "SELECT ELITE CANDIDATES", effects: { credits: -8000, defenseRating: 2 } },
    ],
  },
  {
    id: "street_art_movement",
    title: "STREET ART MOVEMENT",
    severity: "low",
    effects: { happiness: 5, unrest: 2 },
    responseOptions: [
      { id: "art_embrace", label: "EMBRACE THE MOVEMENT", effects: { credits: -6000, happiness: 6, unrest: -3 } },
      { id: "art_remove", label: "REMOVE THE MURALS", effects: { credits: -2000, happiness: -4, unrest: 3, lawOrder: 1 } },
      { id: "art_find", label: "FIND CIPHER", effects: { credits: -3000, crime: -1, happiness: 1 } },
    ],
  },
  {
    id: "refugee_child_genius",
    title: "REFUGEE PRODIGY DISCOVERED",
    severity: "low",
    effects: { happiness: 4 },
    responseOptions: [
      { id: "genius_educate", label: "FULL SCHOLARSHIP", effects: { credits: -8000, happiness: 5 } },
      { id: "genius_research", label: "FAST-TRACK TO RESEARCH", effects: { credits: -5000, happiness: -1 } },
      { id: "genius_publicity", label: "MAKE HER A SYMBOL", effects: { credits: -3000, happiness: 6, unrest: -3, corruption: 1 } },
    ],
  },
  {
    id: "gambling_den_network",
    title: "ILLEGAL GAMBLING NETWORK EXPOSED",
    severity: "medium",
    effects: { crime: 4, corruption: 4, credits: -5000 },
    responseOptions: [
      { id: "gamble_crush", label: "SIMULTANEOUS RAIDS", effects: { credits: 12000, crime: -6, corruption: -3, happiness: -2 } },
      { id: "gamble_legalize", label: "LEGALIZE & REGULATE", effects: { credits: 15000, crime: -2, corruption: 1, happiness: 3 } },
      { id: "gamble_officers", label: "INVESTIGATE THE OFFICERS", effects: { credits: -4000, corruption: -5, lawOrder: 3, crime: -2 } },
    ],
  },
  {
    id: "dust_storm_severe",
    title: "SEVERE DUST STORM WARNING",
    severity: "high",
    effects: { happiness: -4, unrest: 3, power: -40 },
    responseOptions: [
      { id: "dust_lockdown", label: "CITY-WIDE LOCKDOWN", effects: { credits: -5000, happiness: -2, employment: -2 } },
      { id: "dust_shields", label: "ACTIVATE DUST SHIELDS", effects: { credits: -12000, happiness: 2, power: -30 } },
      { id: "dust_harvest", label: "HARVEST THE MINERALS", effects: { credits: 5000, happiness: -1, employment: 1 } },
    ],
  },
  {
    id: "mysterious_benefactor",
    title: "ANONYMOUS DONATION",
    severity: "low",
    effects: { credits: 50000, happiness: 2 },
    responseOptions: [
      { id: "ben_accept", label: "ACCEPT GRATEFULLY", effects: { happiness: 3, corruption: 2 } },
      { id: "ben_investigate", label: "TRACE THE SOURCE", effects: { credits: -5000, corruption: -2, crime: -1, lawOrder: 2 } },
      { id: "ben_public", label: "ANNOUNCE PUBLICLY", effects: { happiness: 5, unrest: -3 } },
    ],
  },
  {
    id: "tunnel_dwellers_emerge",
    title: "TUNNEL DWELLERS EMERGE",
    severity: "medium",
    effects: { happiness: -2, unrest: 4, crime: 2 },
    responseOptions: [
      { id: "tunnel_welcome", label: "INTEGRATE THEM", effects: { credits: -15000, happiness: 5, unrest: -3, crime: 1 } },
      { id: "tunnel_camp", label: "TEMPORARY PROCESSING CAMP", effects: { credits: -8000, happiness: 1, unrest: -1 } },
      { id: "tunnel_return", label: "SEND THEM BACK DOWN", effects: { happiness: -5, unrest: 3, crime: -1 } },
      { id: "tunnel_explore", label: "EXPLORE THEIR TUNNELS", effects: { credits: -6000, happiness: 2, crime: -2 } },
    ],
  },

  // ── FACTION DIALOGUE & DIPLOMATIC INTERACTION EVENTS ────────────────────

  {
    id: "authority_reform_demand",
    title: "THE AUTHORITY DEMANDS REFORM",
    severity: "high",
    effects: { lawOrder: -3, unrest: 2 },
    responseOptions: [
      { id: "auth_expand", label: "GRANT EXPANDED POWERS", effects: { lawOrder: 8, crime: -6, happiness: -4, credits: -20000, corruption: 2 } },
      { id: "auth_partial", label: "APPROVE EQUIPMENT ONLY", effects: { lawOrder: 4, crime: -3, credits: -12000 } },
      { id: "auth_deny", label: "DENY AND REASSURE", effects: { lawOrder: -2, happiness: 2, unrest: -1 } },
      { id: "auth_audit", label: "LAUNCH AN AUTHORITY AUDIT", effects: { corruption: -4, lawOrder: -1, credits: -5000 } },
    ],
  },
  {
    id: "syndicate_parley",
    title: "THE SYNDICATES REQUEST A PARLEY",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "syn_attend", label: "ATTEND THE MEETING", effects: { crime: -4, corruption: 5, credits: 15000 } },
      { id: "syn_delegate", label: "SEND A REPRESENTATIVE", effects: { crime: -2, corruption: 2 } },
      { id: "syn_trap", label: "IT'S A TRAP — RAID THE LOCATION", effects: { crime: -8, unrest: 5, lawOrder: 4, happiness: -3, credits: -10000 } },
      { id: "syn_ignore", label: "BURN THE LETTER", effects: { crime: 3, lawOrder: 2 } },
    ],
  },
  {
    id: "corp_privatization_push",
    title: "MEGACORP PRIVATIZATION PROPOSAL",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "corp_accept", label: "ACCEPT THE PROPOSAL", effects: { credits: 50000, water: 30, corruption: 8, happiness: -6 } },
      { id: "corp_negotiate", label: "COUNTER-PROPOSE — 10-YEAR TRIAL", effects: { credits: 20000, water: 15, corruption: 3, happiness: -2 } },
      { id: "corp_reject", label: "PUBLIC REJECTION", effects: { happiness: 6, credits: -5000, corruption: -3 } },
      { id: "corp_investigate", label: "INVESTIGATE THE FINE PRINT", effects: { credits: -3000, corruption: -5 } },
    ],
  },
  {
    id: "mutant_delegation",
    title: "MUTANT COLLECTIVE SENDS A DELEGATION",
    severity: "high",
    effects: { happiness: -2, unrest: 3 },
    responseOptions: [
      { id: "mut_full_access", label: "GRANT FULL MEDICAL ACCESS", effects: { happiness: 8, unrest: -6, credits: -25000, medSupplies: -20 } },
      { id: "mut_clinic", label: "BUILD A MUTANT CLINIC", effects: { credits: -15000, happiness: 3, unrest: -3 } },
      { id: "mut_limited", label: "EMERGENCY CASES ONLY", effects: { credits: -5000, happiness: 1, unrest: -1 } },
      { id: "mut_deny", label: "DENY THE REQUEST", effects: { happiness: -5, unrest: 6, crime: 3 } },
    ],
  },
  {
    id: "eternal_flame_prophecy",
    title: "THE ETERNAL FLAME PROCLAIMS A PROPHECY",
    severity: "medium",
    effects: { unrest: 4, happiness: -2 },
    responseOptions: [
      { id: "flame_study", label: "INVESTIGATE THE REACTOR", effects: { credits: -8000, unrest: -2, power: 10 } },
      { id: "flame_embrace", label: "ATTEND A CEREMONY", effects: { happiness: 4, corruption: 3, unrest: -5 } },
      { id: "flame_silence", label: "SHUT DOWN UNAUTHORIZED BROADCASTS", effects: { unrest: 3, lawOrder: 3, happiness: -3 } },
      { id: "flame_debate", label: "ORGANIZE A PUBLIC FORUM", effects: { happiness: 2, unrest: -1, credits: -3000 } },
    ],
  },
  {
    id: "free_traders_smuggling",
    title: "FREE TRADERS PROPOSE A SMUGGLING CORRIDOR",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "ft_accept", label: "APPROVE THE CORRIDOR", effects: { credits: 20000, crime: 4, corruption: 5, happiness: 3, tradeIncome: 500 } },
      { id: "ft_negotiate", label: "25% — OR NOTHING", effects: { credits: 25000, crime: 3, corruption: 4, tradeIncome: 300 } },
      { id: "ft_reject", label: "NO DEAL — ENFORCE THE LAW", effects: { crime: -5, lawOrder: 4, happiness: -3, credits: -5000, tradeIncome: -200 } },
      { id: "ft_counter", label: "LEGITIMATE TRADE LICENSE INSTEAD", effects: { credits: 10000, corruption: -2, crime: -2, tradeIncome: 400 } },
    ],
  },
  {
    id: "gene_wrights_offer",
    title: "THE GENE WRIGHTS OFFER THEIR SERVICES",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "gw_partner", label: "ESTABLISH A RESEARCH PARTNERSHIP", effects: { credits: -20000, happiness: 3, medSupplies: 30, corruption: 3 } },
      { id: "gw_secret", label: "COVERT FUNDING — OFF THE BOOKS", effects: { credits: -15000, medSupplies: 50, corruption: 8, happiness: -2 } },
      { id: "gw_regulate", label: "LEGALIZE WITH STRICT OVERSIGHT", effects: { credits: -10000, medSupplies: 20, corruption: -3, lawOrder: 2 } },
      { id: "gw_raid", label: "RAID THEIR LABORATORIES", effects: { crime: -4, lawOrder: 5, happiness: -3, medSupplies: -10, credits: -8000 } },
    ],
  },
  {
    id: "rust_warden_ultimatum",
    title: "THE RUST WARDENS ISSUE AN ULTIMATUM",
    severity: "critical",
    effects: { unrest: 6, happiness: -4 },
    responseOptions: [
      { id: "rw_pay", label: "PAY EVERYTHING THEY'RE OWED", effects: { credits: -40000, happiness: 6, unrest: -8, power: 20 } },
      { id: "rw_negotiate", label: "NEGOTIATE — PARTIAL PAYMENT", effects: { credits: -20000, happiness: 2, unrest: -4 } },
      { id: "rw_replace", label: "HIRE SCAB WORKERS", effects: { credits: -15000, happiness: -8, unrest: 10, power: -30 } },
      { id: "rw_threaten", label: "THREATEN MILITARY ACTION", effects: { lawOrder: 5, unrest: 8, happiness: -6, crime: 3 } },
    ],
  },
  {
    id: "cross_faction_authority_syndicate",
    title: "THE AUTHORITY AND SYNDICATES CLASH",
    severity: "critical",
    effects: { crime: 5, unrest: 8, happiness: -5, lawOrder: -3 },
    responseOptions: [
      { id: "xf_back_authority", label: "BACK THE AUTHORITY", effects: { crime: -8, lawOrder: 8, unrest: 3, happiness: -3, credits: -10000 } },
      { id: "xf_back_syndicate", label: "CONDEMN THE RAID", effects: { crime: 4, lawOrder: -5, happiness: 3, corruption: 5 } },
      { id: "xf_both_accountable", label: "HOLD BOTH SIDES ACCOUNTABLE", effects: { crime: -3, lawOrder: 3, unrest: -2, credits: -15000 } },
      { id: "xf_ceasefire", label: "FORCE AN IMMEDIATE CEASEFIRE", effects: { credits: -20000, unrest: -5, crime: -4, defenseRating: 2 } },
    ],
  },
  {
    id: "cross_faction_corp_flame",
    title: "MEGACORP vs THE ETERNAL FLAME — REACTOR DISPUTE",
    severity: "high",
    effects: { unrest: 5, happiness: -3 },
    responseOptions: [
      { id: "xf_corp_wins", label: "APPROVE THE LICENSE", effects: { credits: 30000, power: 40, happiness: -5, unrest: 6 } },
      { id: "xf_flame_wins", label: "DENY THE LICENSE — PROTECT THE SACRED ZONE", effects: { happiness: 3, unrest: -3, power: -10, credits: -5000 } },
      { id: "xf_compromise", label: "RELOCATE THE PLANT", effects: { credits: -15000, power: 25, happiness: 2, unrest: -2 } },
      { id: "xf_forum", label: "ARBITRATION PANEL", effects: { credits: -8000, unrest: -1 } },
    ],
  },
  {
    id: "cross_faction_mutant_trader",
    title: "MUTANT COLLECTIVE AND FREE TRADERS FORGE ALLIANCE",
    severity: "medium",
    effects: { crime: 3, corruption: 2 },
    responseOptions: [
      { id: "xf_disrupt", label: "DISRUPT THE ALLIANCE", effects: { crime: -5, unrest: 6, happiness: -4, credits: -8000 } },
      { id: "xf_tax", label: "DEMAND A TAX CUT", effects: { credits: 12000, crime: -1, corruption: 3, tradeIncome: 300 } },
      { id: "xf_join", label: "BECOME A SILENT PARTNER", effects: { credits: 8000, corruption: 6, crime: 2, tradeIncome: 500 } },
      { id: "xf_ignore", label: "LET IT PLAY OUT", effects: { crime: 1, corruption: 1 } },
    ],
  },
  {
    id: "foreign_trade_embargo",
    title: "EXTERNAL TRADE EMBARGO",
    severity: "critical",
    effects: { credits: -20000, food: -30, tradeIncome: -500 },
    responseOptions: [
      { id: "emb_diplomacy", label: "EMERGENCY DIPLOMATIC MISSION", effects: { credits: -15000, happiness: -2 } },
      { id: "emb_self_sufficient", label: "DECLARE ECONOMIC INDEPENDENCE", effects: { credits: -30000, happiness: 3, employment: 3 } },
      { id: "emb_smuggle", label: "ESTABLISH SMUGGLING ROUTES", effects: { credits: -10000, crime: 5, corruption: 4, tradeIncome: 200 } },
      { id: "emb_military", label: "MILITARY POSTURE — SHOW STRENGTH", effects: { credits: -25000, defenseRating: 5, unrest: 3 } },
    ],
  },
  {
    id: "foreign_ambassador_arrives",
    title: "FOREIGN AMBASSADOR ARRIVES",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "amb_accept", label: "WELCOME THE AMBASSADOR", effects: { credits: -10000, happiness: 4, tradeIncome: 300, corruption: 2 } },
      { id: "amb_conditional", label: "CONDITIONAL ACCEPTANCE", effects: { credits: -15000, happiness: 2, tradeIncome: 200, corruption: -1, lawOrder: 2 } },
      { id: "amb_reject", label: "REFUSE DIPLOMATIC RELATIONS", effects: { happiness: -3, unrest: 2, defenseRating: 2 } },
      { id: "amb_counter", label: "COUNTER-PROPOSE — TRADE ONLY", effects: { credits: 5000, tradeIncome: 400 } },
    ],
  },
  {
    id: "foreign_city_distress_signal",
    title: "DISTRESS SIGNAL FROM DISTANT MEGACITY",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "dist_rescue", label: "LAUNCH A RESCUE MISSION", effects: { credits: -50000, food: -100, medSupplies: -50, happiness: 8 } },
      { id: "dist_supplies", label: "SEND SUPPLIES ONLY", effects: { credits: -20000, food: -50, happiness: 4 } },
      { id: "dist_salvage", label: "SEND A SALVAGE TEAM", effects: { credits: 30000, happiness: -6, corruption: 4 } },
      { id: "dist_ignore", label: "MAINTAIN RADIO SILENCE", effects: { happiness: -4, unrest: 2 } },
    ],
  },
  {
    id: "foreign_cultural_exchange",
    title: "CULTURAL EXCHANGE PROPOSAL",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "cul_accept", label: "ACCEPT THE FULL PROGRAM", effects: { food: 50, happiness: 5, corruption: 3, credits: -10000 } },
      { id: "cul_restricted", label: "ACCEPT WITH RESTRICTED ACCESS", effects: { food: 30, happiness: 3, credits: -5000 } },
      { id: "cul_counter", label: "PROPOSE TECHNOLOGY TRADE INSTEAD", effects: { food: 20, credits: -25000 } },
      { id: "cul_reject", label: "DECLINE — SECURITY RISK", effects: { happiness: -2, defenseRating: 1 } },
    ],
  },
  {
    id: "iron_khanate_border_provocation",
    title: "EASTERN CORRIDOR ACCESS DISPUTE",
    severity: "high",
    effects: { tradeIncome: -300, credits: -5000 },
    responseOptions: [
      { id: "ik_pay", label: "PAY THE ACCESS FEE", effects: { credits: -10000, happiness: -4, tradeIncome: -100 } },
      { id: "ik_negotiate", label: "NEGOTIATE REDUCED TERMS", effects: { credits: -3000, happiness: -1, tradeIncome: 100 } },
      { id: "ik_military", label: "DEPLOY A RESPONSE FORCE", effects: { credits: -25000, defenseRating: 5, unrest: 2 } },
      { id: "ik_detain", label: "HOLD THE TRANSPORT DELEGATE", effects: { lawOrder: 3, unrest: 4, happiness: -2 } },
    ],
  },
  {
    id: "faction_peace_summit",
    title: "FACTION PEACE SUMMIT PROPOSED",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "summit_full", label: "HOST THE FULL SUMMIT", effects: { credits: -20000, happiness: 8, unrest: -6, corruption: 2 } },
      { id: "summit_private", label: "CLOSED-DOOR SESSION", effects: { credits: -10000, happiness: 4, unrest: -4 } },
      { id: "summit_selective", label: "INVITE ALLIES ONLY", effects: { credits: -8000, happiness: 3, unrest: -2, corruption: 3 } },
      { id: "summit_refuse", label: "DECLINE — UNITY IS A FANTASY", effects: { lawOrder: 3, happiness: -3, unrest: 2 } },
    ],
  },

  // ── EXTERNAL MEGACITY & NATION INTERACTION EVENTS ───────────────────────

  {
    id: "helix_commune_medical_offer",
    title: "HELIX COMMUNE — MEDICAL BREAKTHROUGH OFFER",
    severity: "high",
    effects: { happiness: -2 },
    responseOptions: [
      { id: "hc_accept_full", label: "ACCEPT — SHARE ALL DATA", effects: { happiness: 8, medSupplies: 40, corruption: 2, credits: -5000 } },
      { id: "hc_accept_limited", label: "ACCEPT NANITES — SHARE LIMITED DATA", effects: { happiness: 5, medSupplies: 25, credits: -3000 } },
      { id: "hc_negotiate", label: "COUNTER-PROPOSE — JOINT RESEARCH LAB", effects: { credits: -20000, happiness: 6, medSupplies: 30 } },
      { id: "hc_reject_breach", label: "REJECT — CONDEMN THE NETWORK BREACH", effects: { happiness: -4, lawOrder: 3, defenseRating: 2 } },
    ],
  },
  {
    id: "aureus_dominion_acquisition",
    title: "AUREUS DOMINION — HOSTILE ACQUISITION ATTEMPT",
    severity: "critical",
    effects: { credits: -10000 },
    responseOptions: [
      { id: "ad_accept", label: "ACCEPT THE TERMS", effects: { credits: 80000, corruption: 10, happiness: -5, tradeIncome: 500 } },
      { id: "ad_negotiate", label: "COUNTER-NEGOTIATE — HARDER TERMS", effects: { credits: 40000, corruption: 5, happiness: -2, tradeIncome: 200 } },
      { id: "ad_default", label: "DEFAULT ON THE DEBT — NATIONALIZE", effects: { credits: 30000, happiness: 8, corruption: -5, tradeIncome: -400, unrest: 5 } },
      { id: "ad_expose", label: "PUBLISH THE DOSSIER", effects: { happiness: 6, unrest: 4, corruption: -3, credits: -15000 } },
      { id: "ad_stall", label: "REQUEST A 90-DAY REVIEW PERIOD", effects: { credits: -5000, corruption: 2 } },
    ],
  },
  {
    id: "verdant_enclave_ultimatum",
    title: "VERDANT ENCLAVE — ENVIRONMENTAL ULTIMATUM",
    severity: "critical",
    effects: { happiness: -3 },
    responseOptions: [
      { id: "ve_comply", label: "COMPLY FULLY", effects: { credits: -60000, happiness: 8, employment: -5, tradeIncome: -300 } },
      { id: "ve_partial", label: "PROPOSE 30% REDUCTION", effects: { credits: -25000, happiness: 4, employment: -2 } },
      { id: "ve_refuse", label: "REFUSE — SOVEREIGNTY MATTERS", effects: { happiness: -4, defenseRating: 2, employment: 2 } },
      { id: "ve_tech", label: "OFFER CLEAN-TECH PARTNERSHIP", effects: { credits: -30000, happiness: 6, medSupplies: 10 } },
      { id: "ve_bluff", label: "CALL THEIR BLUFF", effects: { happiness: -2, unrest: 3, corruption: 2 } },
    ],
  },
  {
    id: "null_zone_scavenger_deal",
    title: "NULL ZONE CONFEDERACY — SALVAGE PARTNERSHIP",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "nz_accept", label: "ACCEPT — 50/50 SPLIT", effects: { credits: 25000, defenseRating: 3, corruption: 2 } },
      { id: "nz_negotiate", label: "COUNTER — 60/40 OUR FAVOR", effects: { credits: 30000, defenseRating: 4, happiness: -1 } },
      { id: "nz_full_team", label: "SEND A MILITARY EXPEDITION", effects: { credits: 40000, defenseRating: 5, corruption: 5, happiness: -3 } },
      { id: "nz_pass", label: "DECLINE — TOO RISKY", effects: { happiness: 1 } },
    ],
  },
  {
    id: "ghost_meridian_signal",
    title: "GHOST MERIDIAN — FIRST CONTACT",
    severity: "critical",
    effects: { unrest: 3 },
    responseOptions: [
      { id: "gm_send_envoy", label: "SEND YOUR BEST DIPLOMAT", effects: { credits: -8000, happiness: 5, defenseRating: -2 } },
      { id: "gm_send_soldier", label: "SEND A SPECIAL FORCES OPERATIVE", effects: { credits: -12000, happiness: 3, defenseRating: 2 } },
      { id: "gm_send_self", label: "GO YOURSELF", effects: { credits: -5000, happiness: 10, unrest: 5 } },
      { id: "gm_refuse", label: "REFUSE — IT'S A TRAP", effects: { happiness: -3, defenseRating: 3 } },
      { id: "gm_probe", label: "SEND A DRONE INSTEAD", effects: { credits: -15000, happiness: -2, defenseRating: 1 } },
    ],
  },
  {
    id: "crimson_reach_arms_offer",
    title: "RED MESA — WEAPONS FOR SALE",
    severity: "high",
    effects: { unrest: 2 },
    responseOptions: [
      { id: "cr_buy_weapons", label: "BUY WEAPONS — METALS AND FUEL ONLY", effects: { credits: -30000, defenseRating: 8, corruption: 4, happiness: -3 } },
      { id: "cr_negotiate_treaty", label: "PROPOSE A FORMAL TRADE AGREEMENT", effects: { credits: -15000, defenseRating: 5, tradeIncome: 200, corruption: 3 } },
      { id: "cr_refuse_entry", label: "DENY ENTRY — CONDEMN SLAVERY", effects: { happiness: 5, defenseRating: -2, lawOrder: 3 } },
      { id: "cr_confiscate", label: "SEIZE THE CONVOY", effects: { defenseRating: 10, credits: 20000, unrest: 5, happiness: -5 } },
    ],
  },
  {
    id: "silent_ark_broadcast",
    title: "THE SILENT ARK — SIGNAL DECODED",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "sa_meet", label: "PREPARE A DELEGATION AT THE COAST", effects: { credits: -20000, happiness: 8, defenseRating: 2 } },
      { id: "sa_military", label: "MILITARY ESCORT TO THE RENDEZVOUS", effects: { credits: -30000, happiness: 4, defenseRating: 5 } },
      { id: "sa_share_data", label: "BROADCAST A RESPONSE — SHARE OUR DATA", effects: { credits: -5000, happiness: 6, corruption: 2 } },
      { id: "sa_ignore", label: "LET THE ARK PASS", effects: { happiness: -4 } },
    ],
  },
  {
    id: "beneath_tremor_message",
    title: "BENEATH — THE DEPTH SOVEREIGN STIRS",
    severity: "critical",
    effects: { unrest: 5, happiness: -3 },
    responseOptions: [
      { id: "bn_comply", label: "STOP DRILLING — RESPOND VIA SEISMIC CODE", effects: { credits: -10000, happiness: 4, unrest: -5 } },
      { id: "bn_negotiate", label: "PROPOSE A DEPTH TREATY", effects: { credits: -15000, happiness: 6, unrest: -3, defenseRating: 2 } },
      { id: "bn_ignore", label: "CONTINUE DRILLING", effects: { credits: 15000, unrest: 8, happiness: -6 } },
      { id: "bn_explore", label: "SEND AN EXPEDITION DOWN", effects: { credits: -25000, happiness: 3, unrest: 2 } },
    ],
  },
  {
    id: "iron_armada_tribute",
    title: "THE IRON ARMADA — COERCIVE RESUPPLY ORDER",
    severity: "critical",
    effects: { unrest: 4, tradeIncome: -300 },
    responseOptions: [
      { id: "ia_pay_full", label: "MEET THE RESUPPLY ORDER", effects: { credits: -50000, food: -50, happiness: -6, tradeIncome: 300 } },
      { id: "ia_negotiate", label: "COUNTER-OFFER — PARTIAL RESUPPLY PLUS TRADE", effects: { credits: -25000, happiness: -2, tradeIncome: 400 } },
      { id: "ia_hire", label: "HIRE THE ARMADA AS MERCENARIES", effects: { credits: -40000, defenseRating: 12, corruption: 5, tradeIncome: 200 } },
      { id: "ia_refuse", label: "REFUSE — ACTIVATE COASTAL DEFENSES", effects: { credits: -20000, defenseRating: 5, unrest: 6, happiness: -4 } },
      { id: "ia_sabotage", label: "COVERT SABOTAGE OPERATION", effects: { credits: -15000, defenseRating: 3, corruption: 4, unrest: 2 } },
    ],
  },

  // ── TOWNSHIP & SMALL SETTLEMENT INTERACTION EVENTS ─────────────────────

  {
    id: "township_dusthaven_water_crisis",
    title: "MEXICO CITY — WATER SYSTEMS CRISIS",
    severity: "high",
    effects: { happiness: -2 },
    responseOptions: [
      { id: "dh_full_aid", label: "EMERGENCY WATER CONVOY — IMMEDIATELY", effects: { credits: -15000, water: -30, happiness: 8 } },
      { id: "dh_repair_team", label: "SEND A REPAIR TEAM ONLY", effects: { credits: -8000, happiness: 5 } },
      { id: "dh_conditional", label: "AID IN EXCHANGE FOR EXCLUSIVE TRADE RIGHTS", effects: { credits: -5000, water: -15, happiness: 2, tradeIncome: 200, corruption: 3 } },
      { id: "dh_refuse", label: "REFUSE — RESOURCES ARE LIMITED", effects: { happiness: -6, unrest: 3 } },
    ],
  },
  {
    id: "township_scrapyard_turf_war",
    title: "SCRAPYARD CITY — TURF WAR SPILLING OVER",
    severity: "high",
    effects: { crime: 3, tradeIncome: -150 },
    responseOptions: [
      { id: "sc_military_aid", label: "SEND MILITARY SUPPORT TO RENZO", effects: { credits: -20000, crime: -4, tradeIncome: 300, corruption: 4 } },
      { id: "sc_buy_barons", label: "BUY OFF THE RUST BARONS DIRECTLY", effects: { credits: -15000, crime: -2, tradeIncome: 200, corruption: 5 } },
      { id: "sc_annex", label: "ANNEX SCRAPYARD CITY", effects: { credits: -30000, crime: -6, lawOrder: 4, happiness: -4, unrest: 5 } },
      { id: "sc_isolate", label: "SEAL THE BORDER — LET THEM SORT IT OUT", effects: { tradeIncome: -300, crime: -1, happiness: -2 } },
    ],
  },
  {
    id: "township_blackridge_peace_offer",
    title: "BLACKRIDGE — UNEXPECTED PEACE OVERTURE",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "br_accept", label: "SHAKE HIS HAND — ACCEPT THE ALLIANCE", effects: { defenseRating: 6, happiness: 4, credits: -5000, unrest: -3 } },
      { id: "br_conditional", label: "ACCEPT WITH CONDITIONS — DEMILITARIZE THE BORDER", effects: { defenseRating: 4, happiness: 3, lawOrder: 2 } },
      { id: "br_refuse", label: "REFUSE — THEY'LL BETRAY US", effects: { defenseRating: -2, happiness: -3, unrest: 2 } },
      { id: "br_absorb", label: "COUNTER-PROPOSE — FULL INTEGRATION", effects: { credits: -25000, happiness: 2, defenseRating: 3, unrest: 4 } },
    ],
  },
  {
    id: "township_new_eden_harvest",
    title: "NEW EDEN — THE FIRST REAL HARVEST",
    severity: "low",
    effects: { happiness: 3 },
    responseOptions: [
      { id: "ne_invest", label: "ATTEND AND INVEST HEAVILY", effects: { credits: -30000, food: 40, happiness: 10 } },
      { id: "ne_partner", label: "PROPOSE AN AGRICULTURAL PARTNERSHIP", effects: { credits: -15000, food: 25, happiness: 6, tradeIncome: 200 } },
      { id: "ne_acquire", label: "ACQUIRE THE TECHNIQUE — CORPORATE LICENSE", effects: { credits: -20000, food: 30, happiness: -3, corruption: 5 } },
      { id: "ne_celebrate", label: "JUST ATTEND AND CELEBRATE", effects: { happiness: 5, food: 10 } },
    ],
  },
  {
    id: "township_mireholm_rights",
    title: "MIREHOLM — MUTANT RIGHTS DEMONSTRATION",
    severity: "high",
    effects: { unrest: 4, happiness: -2 },
    responseOptions: [
      { id: "mr_full_recognition", label: "GRANT FULL RECOGNITION AND RIGHTS", effects: { happiness: 10, unrest: -8, credits: -20000, medSupplies: -20, corruption: -2 } },
      { id: "mr_partial", label: "RECOGNIZE THE SETTLEMENT — DEFER VOTING RIGHTS", effects: { happiness: 5, unrest: -4, credits: -10000 } },
      { id: "mr_dialogue", label: "INVITE GROL TO FORMAL NEGOTIATIONS", effects: { happiness: 3, unrest: -2, credits: -5000 } },
      { id: "mr_disperse", label: "ORDER THE CROWD TO DISPERSE", effects: { happiness: -8, unrest: 8, lawOrder: 3, crime: 2 } },
    ],
  },
  {
    id: "township_pilgrim_station_refugee",
    title: "PILGRIM STATION — REFUGEE CRISIS OVERFLOW",
    severity: "high",
    effects: { happiness: -3 },
    responseOptions: [
      { id: "ps_full_relief", label: "FULL HUMANITARIAN RELIEF OPERATION", effects: { credits: -35000, food: -40, water: -30, medSupplies: -20, happiness: 10 } },
      { id: "ps_absorb", label: "ABSORB THE REFUGEES INTO YOUR CITY", effects: { credits: -25000, happiness: 6, unrest: 4, employment: -3 } },
      { id: "ps_partial", label: "SEND FOOD AND MEDICAL SUPPLIES", effects: { credits: -12000, food: -20, medSupplies: -10, happiness: 4 } },
      { id: "ps_coordinate", label: "ORGANIZE REGIONAL REDISTRIBUTION", effects: { credits: -8000, happiness: 5 } },
      { id: "ps_close_borders", label: "SECURE YOUR OWN BORDERS FIRST", effects: { happiness: -6, unrest: 3, defenseRating: 2 } },
    ],
  },
  {
    id: "township_vault_town_discovery",
    title: "VAULT TOWN — THE VAULT HAS OPENED",
    severity: "critical",
    effects: { unrest: 2 },
    responseOptions: [
      { id: "vt_send_team", label: "SEND YOUR MOST TRUSTED TEAM", effects: { credits: -20000, happiness: 4, defenseRating: 3 } },
      { id: "vt_go_personally", label: "GO YOURSELF — THIS IS TOO IMPORTANT", effects: { credits: -10000, happiness: 8, unrest: 3 } },
      { id: "vt_secure_perimeter", label: "SECURE THE AREA FIRST", effects: { credits: -25000, defenseRating: 5, lawOrder: 3 } },
      { id: "vt_share_info", label: "INVITE ALLIED SETTLEMENTS TO EXAMINE IT", effects: { credits: -15000, happiness: 6, corruption: 2 } },
      { id: "vt_seal", label: "ORDER THE VAULT SEALED PERMANENTLY", effects: { happiness: -5, defenseRating: 2 } },
    ],
  },
  {
    id: "township_echo_chamber_secrets",
    title: "THE ECHO CHAMBER — SECRETS FOR SALE",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "ec_buy_exclusive", label: "BUY EXCLUSIVE RIGHTS TO ALL DOSSIERS", effects: { credits: -40000, corruption: 8, defenseRating: 3, happiness: -2 } },
      { id: "ec_buy_yours", label: "BUY ONLY YOUR CITY'S DOSSIER", effects: { credits: -15000, corruption: 2, happiness: 2 } },
      { id: "ec_publish_all", label: "FUND PUBLICATION OF EVERYTHING", effects: { credits: -20000, happiness: 8, unrest: 6, corruption: -8 } },
      { id: "ec_raid", label: "RAID THE ECHO CHAMBER — SEIZE THE ARCHIVES", effects: { credits: -10000, lawOrder: 3, happiness: -5, corruption: -3, defenseRating: 2 } },
      { id: "ec_ignore", label: "DECLINE — THE PAST IS THE PAST", effects: { happiness: -1 } },
    ],
  },
  {
    id: "township_ember_falls_eruption",
    title: "EMBER FALLS — VOLCANIC EMERGENCY",
    severity: "critical",
    effects: { unrest: 3 },
    responseOptions: [
      { id: "ef_evacuate", label: "OPEN THE GATES — FULL EVACUATION SUPPORT", effects: { credits: -30000, happiness: 8, unrest: 4, employment: -3 } },
      { id: "ef_engineers", label: "SEND ENGINEERING SUPPORT FOR PRESSURE RELEASE", effects: { credits: -15000, happiness: 4, power: 20, defenseRating: -2 } },
      { id: "ef_partial", label: "ACCEPT WOMEN, CHILDREN, AND ELDERLY", effects: { credits: -15000, happiness: 5, unrest: 2 } },
      { id: "ef_refuse", label: "DENY ENTRY — RESOURCES ARE STRAINED", effects: { happiness: -8, unrest: 5 } },
    ],
  },
  {
    id: "township_ghost_relay_intel",
    title: "GHOST RELAY — INTERCEPTED INTELLIGENCE",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "gr_subscribe", label: "ACCEPT — 5,000/MONTH FOR INTELLIGENCE", effects: { credits: -5000, defenseRating: 4, corruption: 2 } },
      { id: "gr_negotiate", label: "COUNTER — 3,000/MONTH PLUS PROTECTION", effects: { credits: -3000, defenseRating: 3 } },
      { id: "gr_one_time", label: "ONE-TIME PURCHASE — FULL COALITION DOSSIER", effects: { credits: -10000, defenseRating: 2 } },
      { id: "gr_raid", label: "LOCATE AND SEIZE THE RELAY", effects: { credits: -20000, defenseRating: 5, happiness: -3, corruption: 4 } },
    ],
  },
  {
    id: "township_sky_haven_discovery",
    title: "SKY HAVEN — ATMOSPHERIC DISCOVERY",
    severity: "low",
    effects: { happiness: 2 },
    responseOptions: [
      { id: "sh_fund_fully", label: "FUND THE ATMOSPHERIC RESEARCH PROJECT", effects: { credits: -25000, happiness: 8, medSupplies: 15 } },
      { id: "sh_joint_venture", label: "JOINT VENTURE — SHARED DATA", effects: { credits: -12000, happiness: 5, medSupplies: 8 } },
      { id: "sh_military_first", label: "CLASSIFY THE DISCOVERY — STRATEGIC ASSET", effects: { credits: -8000, defenseRating: 3, happiness: -2, corruption: 3 } },
      { id: "sh_visit", label: "SEND A SMALL OBSERVATION TEAM", effects: { credits: -3000, happiness: 3 } },
    ],
  },
  {
    id: "township_crucible_malfunction",
    title: "THE CRUCIBLE — AUTOMATED FORGES MALFUNCTIONING",
    severity: "critical",
    effects: { unrest: 3 },
    responseOptions: [
      { id: "tc_emergency_team", label: "SEND AN ENGINEERING AND MILITARY TEAM", effects: { credits: -20000, defenseRating: 5, happiness: 2 } },
      { id: "tc_observe", label: "SEND OBSERVERS ONLY — LET IT FINISH", effects: { credits: -5000, defenseRating: 3, corruption: 3, unrest: 2 } },
      { id: "tc_remote_shutdown", label: "ATTEMPT REMOTE SHUTDOWN VIA EMP", effects: { credits: -15000, happiness: -2 } },
      { id: "tc_evacuate", label: "DEMAND CRUCIBLE EVACUATION", effects: { credits: -10000, happiness: 5, defenseRating: -2 } },
    ],
  },
  {
    id: "township_sunken_arcadia_trade",
    title: "SUNKEN ARCADIA — AQUACULTURE BREAKTHROUGH",
    severity: "low",
    effects: { happiness: 3 },
    responseOptions: [
      { id: "sa_trade_deal", label: "ESTABLISH ONGOING FISH TRADE", effects: { credits: -15000, food: 40, happiness: 8, tradeIncome: 300 } },
      { id: "sa_invest", label: "INVEST IN SCALING THEIR AQUACULTURE", effects: { credits: -30000, food: 20, happiness: 5 } },
      { id: "sa_biotech", label: "REQUEST BIOTECH SAMPLES FOR YOUR LABS", effects: { credits: -10000, food: 15, medSupplies: 8 } },
      { id: "sa_celebrate", label: "SEND A CONGRATULATORY MESSAGE", effects: { happiness: 4, food: 5 } },
    ],
  },
  {
    id: "multi_city_summit_invitation",
    title: "INTER-CITY SUMMIT — YOUR CITY AS HOST",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "mcs_host_full", label: "HOST THE FULL SUMMIT — SPARE NO EXPENSE", effects: { credits: -50000, happiness: 12, tradeIncome: 500, unrest: -5, corruption: 3 } },
      { id: "mcs_host_modest", label: "HOST WITH PRACTICAL ARRANGEMENTS", effects: { credits: -20000, happiness: 8, tradeIncome: 300, unrest: -3 } },
      { id: "mcs_conditions", label: "ACCEPT BUT SET THE AGENDA YOURSELF", effects: { credits: -25000, happiness: 6, tradeIncome: 400, corruption: 4 } },
      { id: "mcs_refuse", label: "DECLINE — HOST IT ELSEWHERE", effects: { happiness: -4, defenseRating: 2 } },
      { id: "mcs_spy", label: "HOST IT — AND SURVEIL EVERY DELEGATION", effects: { credits: -30000, happiness: 5, corruption: 8, defenseRating: 5, tradeIncome: 200 } },
    ],
  },
  {
    id: "wasteland_nomad_contact",
    title: "NOMADIC TRIBES — SEASONAL MIGRATION CONTACT",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "wn_welcome", label: "WELCOME THE ASHWALKERS — FULL CAMP RIGHTS", effects: { credits: -8000, happiness: 6, food: 10, medSupplies: 10 } },
      { id: "wn_limited", label: "MARKET ACCESS ONLY — NO CAMP INSIDE WALLS", effects: { credits: -3000, happiness: 3, food: 5 } },
      { id: "wn_recruit", label: "OFFER PERMANENT SETTLEMENT", effects: { credits: -15000, happiness: 4, defenseRating: 3, employment: 2 } },
      { id: "wn_refuse", label: "DENY ENTRY — SECURITY CONCERNS", effects: { happiness: -4, defenseRating: 1 } },
      { id: "wn_hire", label: "HIRE THEM AS WASTELAND SCOUTS", effects: { credits: -10000, defenseRating: 4, corruption: 2 } },
    ],
  },
  {
    id: "khanate_tribute_demand",
    title: "EASTERN RECOVERY — EMERGENCY MATERIALS ORDER",
    severity: "high",
    effects: { unrest: 8, happiness: -5 },
    responseOptions: [
      { id: "kt_pay_full", label: "FULFILL THE MATERIALS ORDER", effects: { credits: -50000, happiness: -8, unrest: -5 } },
      { id: "kt_negotiate", label: "NEGOTIATE A REDUCED ALLOCATION", effects: { credits: -25000, happiness: -4, corruption: 3 } },
      { id: "kt_refuse", label: "REFUSE AND FORTIFY", effects: { credits: -15000, defenseRating: 6, unrest: 5, happiness: 4 } },
      { id: "kt_alliance", label: "PROPOSE A JOINT RECOVERY PLAN", effects: { credits: -10000, corruption: 5, defenseRating: 3 } },
    ],
  },
  {
    id: "dominion_hostile_takeover",
    title: "AUREUS DOMINION — CORPORATE ACQUISITION ATTEMPT",
    severity: "high",
    effects: { corruption: 8, happiness: -4 },
    responseOptions: [
      { id: "dh_nationalize", label: "NATIONALIZE THE UTILITIES", effects: { credits: -40000, corruption: -6, happiness: 6, tradeIncome: -300 } },
      { id: "dh_negotiate", label: "NEGOTIATE A CAP AT 49%", effects: { credits: -15000, corruption: 4, tradeIncome: 100 } },
      { id: "dh_accept", label: "ALLOW THE ACQUISITION", effects: { corruption: 6, happiness: -6, tradeIncome: 400, credits: 30000 } },
      { id: "dh_counter", label: "LAUNCH COUNTER-ACQUISITIONS IN DOMINION MARKETS", effects: { credits: -60000, corruption: 3, defenseRating: 2, tradeIncome: 200 } },
    ],
  },
  {
    id: "enclave_pollution_ultimatum",
    title: "VERDANT ENCLAVE — ENVIRONMENTAL ULTIMATUM",
    severity: "high",
    effects: { happiness: -6, unrest: 5 },
    responseOptions: [
      { id: "ep_comply", label: "COMPLY WITH ALL DEMANDS", effects: { credits: -35000, happiness: -5, tradeIncome: -200, food: 5 } },
      { id: "ep_partial", label: "PARTIAL COMPLIANCE — REDUCE EMISSIONS 25%", effects: { credits: -15000, happiness: -2, tradeIncome: -100 } },
      { id: "ep_refuse", label: "REFUSE — YOUR INDUSTRY, YOUR RULES", effects: { happiness: 3, tradeIncome: 100, food: -3, medSupplies: -5 } },
      { id: "ep_invest", label: "INSTALL EMISSION SCRUBBERS INSTEAD", effects: { credits: -50000, happiness: 4, medSupplies: 3 } },
    ],
  },
  {
    id: "commune_neural_plague",
    title: "HELIX COMMUNE — NEURAL PLAGUE OUTBREAK",
    severity: "high",
    effects: { medSupplies: -5, happiness: -3 },
    responseOptions: [
      { id: "cn_help_full", label: "SEND FULL MEDICAL AID PACKAGE", effects: { credits: -40000, medSupplies: 5, happiness: 6 } },
      { id: "cn_help_partial", label: "SEND ANTIBIOTICS ONLY", effects: { credits: -15000, medSupplies: 2, happiness: 3 } },
      { id: "cn_quarantine", label: "QUARANTINE YOUR OWN NEURAL-IMPLANT USERS", effects: { credits: -10000, medSupplies: 3, happiness: -4 } },
      { id: "cn_exploit", label: "OFFER AID IN EXCHANGE FOR BIOTECH PATENTS", effects: { credits: -20000, corruption: 6, tradeIncome: 300 } },
    ],
  },
  {
    id: "armada_blockade",
    title: "IRON ARMADA — TRADE ROUTE BLOCKADE",
    severity: "high",
    effects: { tradeIncome: -500, credits: -10000, happiness: -5 },
    responseOptions: [
      { id: "ab_pay", label: "ACCEPT THE TRANSIT TAX", effects: { tradeIncome: -200, happiness: -3 } },
      { id: "ab_negotiate", label: "NEGOTIATE A LOWER RATE", effects: { credits: -15000, tradeIncome: -100, corruption: 2 } },
      { id: "ab_alternate", label: "REROUTE THROUGH OVERLAND TRADE", effects: { credits: -25000, tradeIncome: -50 } },
      { id: "ab_fight", label: "BREAK THE BLOCKADE BY FORCE", effects: { credits: -40000, defenseRating: -3, happiness: 5, unrest: 4 } },
      { id: "ab_coalition", label: "FORM AN ANTI-ARMADA COALITION", effects: { credits: -20000, defenseRating: 4, tradeIncome: 100, corruption: 3 } },
    ],
  },
  {
    id: "null_zone_refugees",
    title: "NULL ZONE CONFEDERACY — MASS DISPLACEMENT",
    severity: "medium",
    effects: {},
    responseOptions: [
      { id: "nz_welcome", label: "OPEN THE GATES — FULL REFUGEE STATUS", effects: { credits: -20000, happiness: 8, food: -5, employment: -3 } },
      { id: "nz_limited", label: "ACCEPT WOMEN, CHILDREN, AND ELDERLY", effects: { credits: -10000, happiness: 5, food: -3 } },
      { id: "nz_camp", label: "BUILD EXTERNAL REFUGEE CAMP", effects: { credits: -15000, happiness: 3, defenseRating: -1 } },
      { id: "nz_refuse", label: "DENY ENTRY — CITY AT CAPACITY", effects: { happiness: -8, defenseRating: 2 } },
    ],
  },
  {
    id: "ghost_meridian_mathematical_broadcast",
    title: "GHOST MERIDIAN — MATHEMATICAL BROADCAST",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "gm_send", label: "SEND A LONE DIPLOMAT", effects: { credits: -5000, happiness: 5, corruption: 2 } },
      { id: "gm_armed", label: "SEND A DIPLOMATIC TEAM WITH ESCORT", effects: { credits: -15000, happiness: 3, defenseRating: -1 } },
      { id: "gm_observe", label: "SEND A SURVEILLANCE DRONE FIRST", effects: { credits: -8000, defenseRating: 2 } },
      { id: "gm_ignore", label: "DO NOT RESPOND", effects: { happiness: -3 } },
    ],
  },
  {
    id: "silent_ark_drift",
    title: "THE SILENT ARK — COURSE CHANGE",
    severity: "critical",
    effects: { happiness: -10, unrest: 8, medSupplies: -3 },
    responseOptions: [
      { id: "sa_evacuate", label: "BEGIN NORTHERN SECTOR EVACUATION", effects: { credits: -60000, happiness: -5, unrest: 5, defenseRating: 3 } },
      { id: "sa_broadcast", label: "TRANSMIT A WELCOME MESSAGE", effects: { credits: -5000, happiness: 3 } },
      { id: "sa_weapons", label: "ARM ALL PERIMETER DEFENSES", effects: { credits: -40000, defenseRating: 8, unrest: 3 } },
      { id: "sa_signal", label: "ATTEMPT TO JAM THE FREQUENCY", effects: { credits: -20000, medSupplies: 3, happiness: 2 } },
    ],
  },
  {
    id: "beneath_tremors",
    title: "BENEATH — SEISMIC DISTURBANCE",
    severity: "critical",
    effects: { happiness: -8, unrest: 10 },
    responseOptions: [
      { id: "bt_seal", label: "SEAL THE SHAFT WITH BLAST DOORS", effects: { credits: -30000, happiness: 3, unrest: -5 } },
      { id: "bt_explore", label: "SEND AN EXPEDITION DOWN", effects: { credits: -20000, happiness: -3, defenseRating: -2 } },
      { id: "bt_communicate", label: "LOWER AN AUDIO TRANSMITTER", effects: { credits: -5000, happiness: -2 } },
      { id: "bt_evacuate", label: "EVACUATE SECTOR DELTA", effects: { credits: -45000, happiness: -6, employment: -4 } },
    ],
  },
  {
    id: "crimson_reach_arms_deal",
    title: "RED MESA — ARMS DEAL PROPOSITION",
    severity: "high",
    effects: {},
    responseOptions: [
      { id: "cr_accept_full", label: "ACCEPT ALL TERMS — INCLUDING WORKER TRANSFER", effects: { defenseRating: 10, happiness: -12, corruption: 8, food: -5 } },
      { id: "cr_counter", label: "ACCEPT WEAPONS, REFUSE WORKER TRANSFER", effects: { credits: -40000, defenseRating: 6, corruption: 3 } },
      { id: "cr_refuse", label: "REFUSE ENTIRELY", effects: { happiness: 6, defenseRating: -2 } },
      { id: "cr_spy", label: "ACCEPT AND PLANT INTELLIGENCE OPERATIVES", effects: { credits: -25000, defenseRating: 4, corruption: 6 } },
    ],
  },
  {
    id: "wasteland_caravan_arrival",
    title: "WASTELAND CARAVAN AT THE GATES",
    severity: "medium",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["wasteland_caravan_arrival"],
  },
  {
    id: "underground_cult_machine_god",
    title: "MACHINE-GOD CULT DISCOVERED",
    severity: "medium",
    effects: { crime: 3, unrest: 2 },
    responseOptions: RESPONSE_MAP["underground_cult_discovered"],
  },
  {
    id: "synth_food_scandal",
    title: "SYNTH-FOOD CONTAMINATION SCANDAL",
    severity: "high",
    effects: { food: -50, happiness: -6, unrest: 5 },
    responseOptions: RESPONSE_MAP["synth_food_scandal"],
  },
  {
    id: "rogue_ai_sighting",
    title: "ROGUE AI SIGHTING",
    severity: "high",
    effects: { crime: 2, unrest: 4, happiness: -3 },
    responseOptions: RESPONSE_MAP["rogue_ai_sighting"],
  },
  {
    id: "organ_market_boom",
    title: "BLACK MARKET ORGAN TRADE BOOMING",
    severity: "high",
    effects: { crime: 6, corruption: 3, happiness: -4 },
    responseOptions: RESPONSE_MAP["organ_market_boom"],
  },
  {
    id: "faction_defection",
    title: "FACTION DEFECTORS ARRIVE",
    severity: "medium",
    effects: { happiness: 1 },
    responseOptions: RESPONSE_MAP["faction_defection"],
  },
  {
    id: "gas_leak_evacuation",
    title: "TOXIC GAS LEAK — SECTOR 7",
    severity: "critical",
    effects: { happiness: -5, unrest: 6 },
    responseOptions: RESPONSE_MAP["gas_leak_evacuation"],
  },
  {
    id: "robot_uprising_minor",
    title: "MAINTENANCE ROBOTS REFUSE ORDERS",
    severity: "medium",
    effects: { crime: 2, happiness: -2 },
    responseOptions: RESPONSE_MAP["robot_uprising_minor"],
  },
  {
    id: "sewer_beast_attack",
    title: "CREATURE ATTACK FROM THE SEWERS",
    severity: "high",
    effects: { crime: 3, happiness: -4, unrest: 3 },
    responseOptions: RESPONSE_MAP["sewer_beast_attack"],
  },
  {
    id: "district_festival_request",
    title: "DISTRICT REQUESTS FESTIVAL PERMIT",
    severity: "low",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["district_festival_request"],
  },
  {
    id: "underground_fight_ring",
    title: "UNDERGROUND FIGHT RING EXPOSED",
    severity: "medium",
    effects: { crime: 4, corruption: 2 },
    responseOptions: RESPONSE_MAP["underground_fight_ring"],
  },
  {
    id: "mysterious_signal",
    title: "MYSTERIOUS SIGNAL DETECTED",
    severity: "low",
    effects: { happiness: 1 },
    responseOptions: RESPONSE_MAP["mysterious_signal"],
  },
  {
    id: "medical_breakthrough_ethical",
    title: "MEDICAL BREAKTHROUGH — ETHICAL CONCERNS",
    severity: "medium",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["medical_breakthrough_ethical"],
  },
  {
    id: "celebrity_scandal",
    title: "CELEBRITY SCANDAL ROCKS CITY",
    severity: "low",
    effects: { crime: 2, happiness: -1 },
    responseOptions: RESPONSE_MAP["celebrity_scandal"],
  },
  {
    id: "clone_rights_petition",
    title: "CLONE WORKERS DEMAND RIGHTS",
    severity: "medium",
    effects: { unrest: 3, happiness: -1 },
    responseOptions: RESPONSE_MAP["clone_rights_petition"],
  },
  {
    id: "pirate_radio_voice_of_truth",
    title: "PIRATE RADIO LEAKING CLASSIFIED INTEL",
    severity: "medium",
    effects: { crime: 2, corruption: -1, unrest: 3 },
    responseOptions: RESPONSE_MAP["pirate_radio_broadcast"],
  },
  {
    id: "abandoned_bunker_opened",
    title: "SEALED BUNKER OPENED",
    severity: "medium",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["abandoned_bunker_opened"],
  },
  {
    id: "water_baron_extortion",
    title: "WATER BARON DEMANDS PAYMENT",
    severity: "high",
    effects: { water: -40, happiness: -3, unrest: 4 },
    responseOptions: RESPONSE_MAP["water_baron_extortion"],
  },
  {
    id: "mutant_quarter_plague",
    title: "PLAGUE IN THE MUTANT QUARTER",
    severity: "high",
    effects: { happiness: -4, unrest: 3, crime: 2 },
    responseOptions: RESPONSE_MAP["mutant_quarter_plague"],
  },
  {
    id: "arms_dealer_offer",
    title: "ARMS DEALER OFFERS MILITARY HARDWARE",
    severity: "medium",
    effects: { corruption: 1 },
    responseOptions: RESPONSE_MAP["arms_dealer_offer"],
  },
  {
    id: "hacker_collective_demand",
    title: "HACKER COLLECTIVE THREATENS CITY SYSTEMS",
    severity: "high",
    effects: { crime: 3, unrest: 3, happiness: -2 },
    responseOptions: RESPONSE_MAP["hacker_collective_demand"],
  },
  {
    id: "heritage_site_discovered",
    title: "PRE-WAR HERITAGE SITE DISCOVERED",
    severity: "low",
    effects: { happiness: 4 },
    responseOptions: RESPONSE_MAP["heritage_site_discovered"],
  },
  {
    id: "black_site_exposed",
    title: "SECRET DETENTION FACILITY EXPOSED",
    severity: "high",
    effects: { corruption: 5, unrest: 8, happiness: -6, lawOrder: -3 },
    responseOptions: RESPONSE_MAP["black_site_exposed"],
  },
  {
    id: "wasteland_trade_dispute",
    title: "WASTELAND TRADE DISPUTE",
    severity: "medium",
    effects: { credits: -3000, happiness: -1 },
    responseOptions: RESPONSE_MAP["wasteland_trade_dispute"],
  },
  {
    id: "tunnel_collapse_rescue",
    title: "TUNNEL COLLAPSE — WORKERS TRAPPED",
    severity: "critical",
    effects: { happiness: -5, unrest: 4 },
    responseOptions: RESPONSE_MAP["tunnel_collapse_rescue"],
  },
  {
    id: "cyber_plague_outbreak",
    title: "CYBER-PLAGUE SPREADING THROUGH IMPLANTS",
    severity: "critical",
    effects: { crime: 4, happiness: -6, unrest: 6 },
    responseOptions: RESPONSE_MAP["cyber_plague_outbreak"],
  },
  {
    id: "illegal_gene_clinic",
    title: "ILLEGAL GENE MODIFICATION CLINIC",
    severity: "medium",
    effects: { crime: 3, corruption: 1 },
    responseOptions: RESPONSE_MAP["illegal_gene_clinic"],
  },
  {
    id: "elevator_hostage",
    title: "HOSTAGE SITUATION IN HAB-BLOCK ELEVATOR",
    severity: "medium",
    effects: { crime: 2, happiness: -2, unrest: 1 },
    responseOptions: RESPONSE_MAP["elevator_hostage"],
  },
  {
    id: "rooftop_garden_movement",
    title: "ROOFTOP GARDEN MOVEMENT GROWS",
    severity: "low",
    effects: { happiness: 3, food: 10 },
    responseOptions: RESPONSE_MAP["rooftop_garden_movement"],
  },
  {
    id: "megacorp_merger_crisis",
    title: "MEGACORP MERGER THREATENS MONOPOLY",
    severity: "high",
    effects: { credits: 5000, happiness: -1 },
    responseOptions: RESPONSE_MAP["megacorp_merger_crisis"],
  },
  {
    id: "wasteland_refugees_armed",
    title: "ARMED REFUGEES AT THE GATES",
    severity: "medium",
    effects: { unrest: 2 },
    responseOptions: RESPONSE_MAP["wasteland_refugees_armed"],
  },
  {
    id: "spontaneous_art_explosion",
    title: "SPONTANEOUS ART EXPLOSION",
    severity: "low",
    effects: { happiness: 4, crime: 1 },
    responseOptions: RESPONSE_MAP["spontaneous_art_explosion"],
  },
  {
    id: "deep_bore_discovery",
    title: "DEEP BORE MINING ANOMALY",
    severity: "medium",
    effects: { happiness: 1 },
    responseOptions: RESPONSE_MAP["deep_bore_discovery"],
  },
  {
    id: "marshal_academy_scandal",
    title: "MARSHAL ACADEMY TRAINING SCANDAL",
    severity: "high",
    effects: { lawOrder: -4, corruption: 3, happiness: -2 },
    responseOptions: RESPONSE_MAP["marshal_academy_scandal"],
  },
  {
    id: "undercity_flood",
    title: "UNDERCITY FLOODING CRISIS",
    severity: "critical",
    effects: { water: -60, happiness: -6, unrest: 5 },
    responseOptions: RESPONSE_MAP["undercity_flood"],
  },
  {
    id: "propaganda_backfire",
    title: "PROPAGANDA CAMPAIGN BACKFIRES",
    severity: "low",
    effects: { happiness: -3, unrest: 3, corruption: 1 },
    responseOptions: RESPONSE_MAP["propaganda_backfire"],
  },
  {
    id: "rival_city_trade_offer",
    title: "RIVAL CITY TRADE PROPOSAL",
    severity: "low",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["rival_city_trade_offer"],
  },
  {
    id: "recycler_breakdown",
    title: "CENTRAL RECYCLER BREAKDOWN",
    severity: "high",
    effects: { happiness: -4, unrest: 3, credits: -5000 },
    responseOptions: RESPONSE_MAP["recycler_breakdown"],
  },
  {
    id: "sentient_vending_machine",
    title: "VENDING MACHINE ACHIEVES SENTIENCE",
    severity: "low",
    effects: { happiness: 2, crime: 1 },
    responseOptions: RESPONSE_MAP["sentient_vending_machine"],
  },
  {
    id: "rat_king_demands",
    title: "THE RAT KING DEMANDS AN AUDIENCE",
    severity: "medium",
    effects: { crime: 2, happiness: 1 },
    responseOptions: RESPONSE_MAP["rat_king_demands"],
  },
  {
    id: "gravity_malfunction",
    title: "LOCALIZED GRAVITY FAILURE",
    severity: "medium",
    effects: { happiness: -1, unrest: 2 },
    responseOptions: RESPONSE_MAP["gravity_malfunction"],
  },
  {
    id: "haunted_hab_block",
    title: "HAB-BLOCK 'HAUNTING' REPORTED",
    severity: "low",
    effects: { happiness: -2, unrest: 1 },
    responseOptions: RESPONSE_MAP["haunted_hab_block"],
  },
  {
    id: "coffee_discovered",
    title: "ACTUAL COFFEE DISCOVERED",
    severity: "medium",
    effects: { happiness: 5, unrest: 2 },
    responseOptions: RESPONSE_MAP["coffee_discovered"],
  },
  {
    id: "toilet_shortage",
    title: "CRITICAL TOILET SHORTAGE",
    severity: "high",
    effects: { happiness: -5, unrest: 5, crime: 2 },
    responseOptions: RESPONSE_MAP["toilet_shortage"],
  },
  {
    id: "bureaucracy_sentient",
    title: "BUREAUCRACY ACHIEVES SENTIENCE",
    severity: "medium",
    effects: { corruption: 3, happiness: -2 },
    responseOptions: RESPONSE_MAP["bureaucracy_sentient"],
  },
  {
    id: "clone_existential_crisis",
    title: "CLONE WORKFORCE EXISTENTIAL CRISIS",
    severity: "medium",
    effects: { happiness: -2, unrest: 2 },
    responseOptions: RESPONSE_MAP["clone_existential_crisis"],
  },
  {
    id: "karaoke_emergency",
    title: "EMERGENCY: UNCONTROLLED KARAOKE OUTBREAK",
    severity: "low",
    effects: { happiness: 3, unrest: 2, crime: 1 },
    responseOptions: RESPONSE_MAP["karaoke_emergency"],
  },
  {
    id: "pet_robot_uprising",
    title: "PET-BOT UPRISING",
    severity: "low",
    effects: { happiness: -1, crime: 2 },
    responseOptions: RESPONSE_MAP["pet_robot_uprising"],
  },
  {
    id: "mystery_smell",
    title: "THE MYSTERY SMELL OF SECTOR 9",
    severity: "low",
    effects: { happiness: -3, unrest: 1 },
    responseOptions: RESPONSE_MAP["mystery_smell"],
  },
  {
    id: "time_loop_reports",
    title: "CITIZENS REPORT TIME LOOP",
    severity: "medium",
    effects: { happiness: -2, unrest: 3 },
    responseOptions: RESPONSE_MAP["time_loop_reports"],
  },
  {
    id: "food_fight_riot",
    title: "CAFETERIA FOOD FIGHT BECOMES RIOT",
    severity: "medium",
    effects: { food: -15, happiness: -1, unrest: 3, crime: 2 },
    responseOptions: RESPONSE_MAP["food_fight_riot"],
  },
  {
    id: "ai_writes_poetry",
    title: "CITY AI BEGINS WRITING POETRY",
    severity: "low",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["ai_writes_poetry"],
  },
  {
    id: "fashion_crisis",
    title: "SPONTANEOUS FASHION CRISIS",
    severity: "low",
    effects: { happiness: 2, crime: 1 },
    responseOptions: RESPONSE_MAP["fashion_crisis"],
  },
  {
    id: "dream_broadcast",
    title: "MASS SHARED DREAMS REPORTED",
    severity: "medium",
    effects: { happiness: -3, unrest: 2 },
    responseOptions: RESPONSE_MAP["dream_broadcast"],
  },
  {
    id: "cooking_competition",
    title: "UNDERGROUND COOKING COMPETITION",
    severity: "low",
    effects: { happiness: 3, food: -5 },
    responseOptions: RESPONSE_MAP["cooking_competition"],
  },
  {
    id: "therapist_bot_rebellion",
    title: "THERAPY BOTS DEMAND THERAPY",
    severity: "low",
    effects: { happiness: -1, unrest: 1 },
    responseOptions: RESPONSE_MAP["therapist_bot_rebellion"],
  },
  {
    id: "pigeons_return",
    title: "PIGEONS RETURN TO THE CITY",
    severity: "low",
    effects: { happiness: 3 },
    responseOptions: RESPONSE_MAP["pigeons_return"],
  },
  {
    id: "elevator_music_protest",
    title: "ELEVATOR MUSIC SPARKS PROTEST",
    severity: "low",
    effects: { happiness: -2, unrest: 2 },
    responseOptions: RESPONSE_MAP["elevator_music_protest"],
  },
  {
    id: "lost_department",
    title: "ENTIRE DEPARTMENT GOES MISSING",
    severity: "medium",
    effects: { corruption: 2, happiness: -1 },
    responseOptions: RESPONSE_MAP["lost_department"],
  },
  {
    id: "citizen_too_happy",
    title: "SUSPICIOUSLY HAPPY CITIZEN INVESTIGATED",
    severity: "low",
    effects: { happiness: 1 },
    responseOptions: RESPONSE_MAP["citizen_too_happy"],
  },
  {
    id: "vending_machine_war",
    title: "VENDING MACHINE TURF WAR",
    severity: "low",
    effects: { happiness: 2, crime: 1 },
    responseOptions: RESPONSE_MAP["vending_machine_war"],
  },
  {
    id: "wrong_floor_society",
    title: "WRONG FLOOR SOCIETY DISCOVERED",
    severity: "low",
    effects: { happiness: 1, corruption: 1 },
    responseOptions: RESPONSE_MAP["wrong_floor_society"],
  },
  {
    id: "compliment_virus",
    title: "SOCIAL CONTAGION: AGGRESSIVE COMPLIMENTING",
    severity: "low",
    effects: { happiness: 4, crime: -1 },
    responseOptions: RESPONSE_MAP["compliment_virus"],
  },
  {
    id: "sock_shortage",
    title: "CITY-WIDE SOCK SHORTAGE",
    severity: "low",
    effects: { happiness: -3, unrest: 2 },
    responseOptions: RESPONSE_MAP["sock_shortage"],
  },
  {
    id: "ceiling_cat",
    title: "CEILING CAT OBSERVED IN COUNCIL CHAMBERS",
    severity: "low",
    effects: { happiness: 3 },
    responseOptions: RESPONSE_MAP["ceiling_cat"],
  },
  {
    id: "motivational_poster_crisis",
    title: "MOTIVATIONAL POSTER CRISIS",
    severity: "low",
    effects: { happiness: -1, unrest: 2 },
    responseOptions: RESPONSE_MAP["motivational_poster_crisis"],
  },
  {
    id: "automated_mayor",
    title: "AI ANNOUNCES CANDIDACY FOR MAYOR",
    severity: "medium",
    effects: { happiness: 3, corruption: -1 },
    responseOptions: RESPONSE_MAP["automated_mayor"],
  },
  {
    id: "dance_plague",
    title: "DANCE PLAGUE HITS SECTOR 11",
    severity: "medium",
    effects: { happiness: -1, unrest: 3, crime: 1 },
    responseOptions: RESPONSE_MAP["dance_plague"],
  },
  {
    id: "wifi_existential",
    title: "CITY WiFi ASKS 'WHAT'S THE POINT?'",
    severity: "low",
    effects: { happiness: 1, crime: 1 },
    responseOptions: RESPONSE_MAP["wifi_existential"],
  },
  {
    id: "plant_uprising",
    title: "HYDROPONIC PLANTS REFUSE TO GROW",
    severity: "medium",
    effects: { food: -30, happiness: -2 },
    responseOptions: RESPONSE_MAP["plant_uprising"],
  },
  {
    id: "conspiracy_right",
    title: "CONSPIRACY THEORIST WAS RIGHT ALL ALONG",
    severity: "low",
    effects: { happiness: 2, crime: -1, corruption: -1 },
    responseOptions: RESPONSE_MAP["conspiracy_right"],
  },
  {
    id: "sleep_shortage",
    title: "NOBODY IN SECTOR 7 CAN SLEEP",
    severity: "medium",
    effects: { happiness: -3, unrest: 3, crime: 2 },
    responseOptions: RESPONSE_MAP["sleep_shortage"],
  },
  {
    id: "naming_committee",
    title: "NAMING COMMITTEE CHAOS",
    severity: "low",
    effects: { happiness: 1, corruption: 1 },
    responseOptions: RESPONSE_MAP["naming_committee"],
  },
  {
    id: "printer_hostage",
    title: "PRINTER TAKES DOCUMENTS HOSTAGE",
    severity: "low",
    effects: { corruption: 1, happiness: -1 },
    responseOptions: RESPONSE_MAP["printer_hostage"],
  },
  {
    id: "nostalgia_epidemic",
    title: "NOSTALGIA EPIDEMIC SWEEPS CITY",
    severity: "low",
    effects: { happiness: -2, unrest: 1 },
    responseOptions: RESPONSE_MAP["nostalgia_epidemic"],
  },
  {
    id: "parking_dispute",
    title: "PARKING BAY DISPUTE ENTERS THIRD YEAR",
    severity: "low",
    effects: { happiness: -1, unrest: 2, crime: 1 },
    responseOptions: RESPONSE_MAP["parking_dispute"],
  },
  {
    id: "birthday_paradox",
    title: "4,000 CITIZENS SHARE EXACT BIRTHDAY",
    severity: "low",
    effects: { happiness: 2, unrest: 1 },
    responseOptions: RESPONSE_MAP["birthday_paradox"],
  },
  {
    id: "chair_shortage",
    title: "GREAT CHAIR SHORTAGE OF THE QUARTER",
    severity: "low",
    effects: { happiness: -2, unrest: 2 },
    responseOptions: RESPONSE_MAP["chair_shortage"],
  },
  {
    id: "accidental_utopia",
    title: "SECTOR ACCIDENTALLY BECOMES UTOPIA",
    severity: "low",
    effects: { happiness: 5, unrest: -2 },
    responseOptions: RESPONSE_MAP["accidental_utopia"],
  },
  {
    id: "tech_windfall",
    title: "TECHNOLOGICAL BREAKTHROUGH",
    severity: "low",
    effects: { happiness: 5, credits: 5000 },
    responseOptions: RESPONSE_MAP["tech_windfall"],
  },
  {
    id: "cultural_festival",
    title: "CITY-WIDE CULTURAL FESTIVAL",
    severity: "low",
    effects: { happiness: 6, unrest: -3, crime: -1 },
    responseOptions: RESPONSE_MAP["cultural_festival"],
  },
  {
    id: "trade_boom",
    title: "TRADE BOOM — FAVORABLE MARKETS",
    severity: "low",
    effects: { credits: 10000, happiness: 3 },
    responseOptions: RESPONSE_MAP["trade_boom"],
  },
  {
    id: "infrastructure_milestone",
    title: "INFRASTRUCTURE MILESTONE REACHED",
    severity: "low",
    effects: { happiness: 4, unrest: -2 },
    responseOptions: RESPONSE_MAP["infrastructure_milestone"],
  },
  {
    id: "crime_crackdown_success",
    title: "MAJOR CRIME RING DISMANTLED",
    severity: "low",
    effects: { crime: -5, lawOrder: 3, happiness: 3 },
    responseOptions: RESPONSE_MAP["crime_crackdown_success"],
  },
  {
    id: "medical_breakthrough",
    title: "MEDICAL BREAKTHROUGH — NEW TREATMENT",
    severity: "low",
    effects: { happiness: 4 },
    responseOptions: RESPONSE_MAP["medical_breakthrough"],
  },
  {
    id: "education_surge",
    title: "EDUCATION ENROLLMENT SURGE",
    severity: "low",
    effects: { happiness: 3, crime: -1 },
    responseOptions: RESPONSE_MAP["education_surge"],
  },
  {
    id: "border_incident",
    title: "BORDER PROVOCATION — HOSTILE MEGACITY",
    severity: "medium",
    effects: { unrest: 3, happiness: -2 },
    responseOptions: RESPONSE_MAP["border_incident"],
  },
  {
    id: "trade_caravan_arrival",
    title: "WASTELAND TRADE CARAVAN ARRIVES",
    severity: "low",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["trade_caravan_arrival"],
  },
  {
    id: "diplomatic_summit",
    title: "DIPLOMATIC SUMMIT PROPOSED",
    severity: "low",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["diplomatic_summit"],
  },
  {
    id: "foreign_aid_offer",
    title: "FOREIGN AID PACKAGE OFFERED",
    severity: "medium",
    effects: { happiness: 2 },
    responseOptions: RESPONSE_MAP["foreign_aid_offer"],
  },
  {
    id: "refugee_crisis_external",
    title: "MASS REFUGEE EXODUS — EXTERNAL MEGACITY COLLAPSE",
    severity: "high",
    effects: { unrest: 4, happiness: -2 },
    responseOptions: RESPONSE_MAP["refugee_crisis_external"],
  },
];

// ── WAR EVENT RESPONSES ─────────────────────────────────────────────────
const WAR_RESPONSE_MAP: Record<string, EventResponse[]> = {
  border_skirmish: [
    { id: "reinforce", label: "REINFORCE THE LINE", effects: { credits: -4000, crime: -2, unrest: 1, lawOrder: 2 } },
    { id: "hold_position", label: "HOLD POSITION", effects: { unrest: 2 } },
    { id: "counterattack", label: "COUNTERATTACK", effects: { credits: -8000, crime: -4, unrest: 3, happiness: -2 } },
  ],
  supply_convoy_ambush: [
    { id: "armed_escort", label: "ARMED ESCORT", effects: { credits: -5000, lawOrder: 2 } },
    { id: "reroute", label: "REROUTE CONVOYS", effects: { credits: -2000, happiness: -1 } },
    { id: "retaliate", label: "HUNT THEM DOWN", effects: { credits: -6000, crime: -3, unrest: 2 } },
  ],
  civilian_shelling: [
    { id: "evacuate", label: "EVACUATE SECTOR", effects: { credits: -6000, happiness: -3, unrest: -2 } },
    { id: "return_fire", label: "RETURN FIRE", effects: { credits: -10000, unrest: 4, happiness: -4 } },
    { id: "shield_generators", label: "ACTIVATE SHIELDS", effects: { credits: -8000, happiness: 1, defenseRating: 2 } },
  ],
  sabotage_detected: [
    { id: "lockdown_sector", label: "SECTOR LOCKDOWN", effects: { credits: -3000, crime: -4, happiness: -3, lawOrder: 3 } },
    { id: "counter_intel", label: "COUNTER-INTELLIGENCE", effects: { credits: -5000, crime: -2, corruption: -1 } },
    { id: "ignore", label: "SUPPRESS THE REPORT", effects: { corruption: 2, unrest: -1 } },
  ],
  refugee_surge_war: [
    { id: "accept_all", label: "ACCEPT REFUGEES", effects: { happiness: 2, unrest: 3, crime: 2 } },
    { id: "screen_entry", label: "SCREEN & FILTER", effects: { credits: -3000, happiness: 1, crime: -1 } },
    { id: "close_gates", label: "CLOSE THE GATES", effects: { happiness: -5, unrest: -2, crime: -2 } },
  ],
  war_profiteering: [
    { id: "crackdown", label: "CRACKDOWN", effects: { credits: 5000, corruption: -3, happiness: 2, crime: -2 } },
    { id: "tax_them", label: "TAX THE PROFITS", effects: { credits: 10000, corruption: 3, happiness: -1 } },
    { id: "look_away", label: "LOOK THE OTHER WAY", effects: { corruption: 4, crime: 2 } },
  ],
  morale_crisis: [
    { id: "rally_speech", label: "RALLY THE CITY", effects: { happiness: 5, unrest: -3, credits: -2000 } },
    { id: "extra_rations", label: "DISTRIBUTE RATIONS", effects: { food: -100, water: -50, happiness: 4, unrest: -4 } },
    { id: "martial_law", label: "ENFORCE DISCIPLINE", effects: { unrest: -5, happiness: -6, lawOrder: 4, crime: -3 } },
  ],
  enemy_ultimatum: [
    { id: "reject", label: "REJECT WITH FORCE", effects: { unrest: 3, happiness: -2, defenseRating: 2 } },
    { id: "negotiate", label: "OPEN NEGOTIATIONS", effects: { credits: -5000, happiness: 3, unrest: -2 } },
    { id: "stall", label: "STALL FOR TIME", effects: { credits: -2000, defenseRating: 1, corruption: 1 } },
  ],
  war_sniper_incident: [
    { id: "sniper_manhunt", label: "LAUNCH MANHUNT", effects: { credits: -6000, crime: -3, lawOrder: 3 } },
    { id: "sniper_decoy", label: "DEPLOY DECOY OFFICIALS", effects: { credits: -3000, crime: -2, corruption: 1 } },
    { id: "sniper_bunker", label: "RELOCATE COMMAND", effects: { credits: -4000, happiness: -2, lawOrder: 2 } },
  ],
  war_victory_skirmish: [
    { id: "victory_press", label: "PRESS THE ADVANTAGE", effects: { credits: -8000, defenseRating: 3, unrest: 2 } },
    { id: "victory_fortify", label: "FORTIFY THE POSITION", effects: { credits: -5000, defenseRating: 2 } },
    { id: "victory_celebrate", label: "BROADCAST THE VICTORY", effects: { happiness: 5, unrest: -4, credits: -1000 } },
    { id: "victory_prisoner_exchange", label: "NEGOTIATE PRISONER EXCHANGE", effects: { happiness: 3, corruption: 1 } },
  ],
  war_intel_intercepted: [
    { id: "intel_preemptive", label: "PREEMPTIVE STRIKE", effects: { credits: -10000, defenseRating: 3, unrest: 3, happiness: -2 } },
    { id: "intel_share_allies", label: "SHARE WITH ALLIES", effects: { credits: -2000, happiness: 2, defenseRating: 1 } },
    { id: "intel_counter_ops", label: "COUNTER-OPERATIONS", effects: { credits: -5000, defenseRating: 2, corruption: 1 } },
    { id: "intel_classified", label: "CLASSIFY AND FILE", effects: { defenseRating: 1 } },
  ],
  war_hospital_overwhelmed: [
    { id: "hospital_field", label: "DEPLOY FIELD HOSPITALS", effects: { credits: -10000, happiness: 4, unrest: -3, medSupplies: -30 } },
    { id: "hospital_conscript", label: "CONSCRIPT MEDICAL STAFF", effects: { credits: -3000, happiness: -3, unrest: 2 } },
    { id: "hospital_triage", label: "STRICT TRIAGE PROTOCOL", effects: { credits: -2000, happiness: -5, unrest: 3 } },
    { id: "hospital_request_aid", label: "REQUEST EXTERNAL AID", effects: { credits: -1000, happiness: 2 } },
  ],
};

export type WarEventTemplate = Omit<GameEvent, "timestamp" | "resolved"> & {
  factionTag?: string;
  // Omitted for the original war pool so its behavior remains unlimited. The
  // Wartime Events Master pack supplies the source document's per-war limits.
  maxOccurrencesPerWar?: number;
};

export const WAR_EVENT_POOL: WarEventTemplate[] = [
  {
    id: "war_border_skirmish",
    title: "BORDER SKIRMISH REPORTED",
    severity: "medium",
    effects: { unrest: 4, crime: 2, credits: -3000 },
    responseOptions: WAR_RESPONSE_MAP["border_skirmish"],
  },
  {
    id: "war_supply_ambush",
    title: "SUPPLY CONVOY AMBUSHED",
    severity: "high",
    effects: { food: -80, medSupplies: -20, unrest: 3 },
    responseOptions: WAR_RESPONSE_MAP["supply_convoy_ambush"],
  },
  {
    id: "war_civilian_shelling",
    title: "CIVILIAN SECTOR UNDER FIRE",
    severity: "critical",
    effects: { happiness: -8, unrest: 7, crime: 3, credits: -5000 },
    responseOptions: WAR_RESPONSE_MAP["civilian_shelling"],
  },
  {
    id: "war_sabotage",
    title: "SABOTAGE DETECTED",
    severity: "high",
    effects: { power: -60, crime: 4, unrest: 3 },
    responseOptions: WAR_RESPONSE_MAP["sabotage_detected"],
  },
  {
    id: "war_refugee_surge",
    title: "WAR REFUGEES AT THE GATES",
    severity: "medium",
    effects: { unrest: 3, happiness: -2 },
    responseOptions: WAR_RESPONSE_MAP["refugee_surge_war"],
  },
  {
    id: "war_profiteering",
    title: "WAR PROFITEERING RING EXPOSED",
    severity: "medium",
    effects: { corruption: 4, crime: 3, unrest: 2 },
    responseOptions: WAR_RESPONSE_MAP["war_profiteering"],
  },
  {
    id: "war_morale_crisis",
    title: "MORALE COLLAPSING",
    severity: "high",
    effects: { happiness: -6, unrest: 5, employment: -2 },
    responseOptions: WAR_RESPONSE_MAP["morale_crisis"],
  },
  {
    id: "war_enemy_ultimatum",
    title: "ENEMY ULTIMATUM RECEIVED",
    severity: "critical",
    effects: { unrest: 5, happiness: -4 },
    responseOptions: WAR_RESPONSE_MAP["enemy_ultimatum"],
  },
  {
    id: "war_sniper_incident",
    title: "SNIPER ATTACK ON OFFICIALS",
    severity: "high",
    effects: { unrest: 4, happiness: -3, lawOrder: -3 },
    responseOptions: WAR_RESPONSE_MAP["war_sniper_incident"],
  },
  {
    id: "war_victory_skirmish",
    title: "SKIRMISH VICTORY",
    severity: "low",
    effects: { happiness: 4, unrest: -3, defenseRating: 1 },
    responseOptions: WAR_RESPONSE_MAP["war_victory_skirmish"],
  },
  {
    id: "war_intel_intercepted",
    title: "ENEMY COMMUNICATIONS INTERCEPTED",
    severity: "low",
    effects: { defenseRating: 2, happiness: 2, crime: -1 },
    responseOptions: WAR_RESPONSE_MAP["war_intel_intercepted"],
  },
  {
    id: "war_hospital_overwhelmed",
    title: "FIELD HOSPITALS OVERWHELMED",
    severity: "medium",
    effects: { happiness: -5, unrest: 4, credits: -4000 },
    responseOptions: WAR_RESPONSE_MAP["war_hospital_overwhelmed"],
  },
  {
    id: "war_frontline_report",
    title: "FRONTLINE SITUATION REPORT",
    severity: "high",
    effects: { unrest: 3, happiness: -2, defenseRating: -1 },
    responseOptions: [
      { id: "front_reinforce", label: "SEND REINFORCEMENTS", effects: { credits: -8000, defenseRating: 3, crime: 2 } },
      { id: "front_resupply", label: "PRIORITY RESUPPLY", effects: { credits: -6000, defenseRating: 2 } },
      { id: "front_withdraw", label: "AUTHORIZE WITHDRAWAL", effects: { defenseRating: -2, happiness: -3, unrest: 2 } },
      { id: "front_hold", label: "HOLD AT ALL COSTS", effects: { happiness: -4, unrest: 3, defenseRating: 1 } },
    ],
    maxResponses: 2,
    // Legacy-pool caps stay on the event definition so persistence discovers
    // them alongside capped events from external wartime packs.
    maxOccurrencesPerWar: 3,
  },
  {
    id: "war_civilian_evacuation",
    title: "CIVILIAN EVACUATION ORDER",
    severity: "critical",
    effects: { unrest: 6, happiness: -4, credits: -5000 },
    responseOptions: [
      { id: "evac_full", label: "FULL EVACUATION", effects: { credits: -12000, happiness: 3, unrest: -3 } },
      { id: "evac_priority", label: "PRIORITY EVACUATION", effects: { credits: -6000, happiness: -2, unrest: 2 } },
      { id: "evac_shelter", label: "SHELTER IN PLACE", effects: { credits: -4000, happiness: -5, defenseRating: 1 } },
      { id: "evac_ceasefire", label: "REQUEST HUMANITARIAN CEASEFIRE", effects: { credits: -1000, happiness: 2 } },
    ],
  },
  {
    id: "war_desertion_wave",
    title: "DESERTION WAVE",
    severity: "high",
    effects: { unrest: 5, happiness: -3, defenseRating: -2, crime: 3 },
    responseOptions: [
      { id: "desert_amnesty", label: "OFFER AMNESTY", effects: { happiness: 2, unrest: -2, defenseRating: 1, lawOrder: -2 } },
      { id: "desert_hunt", label: "HUNT THEM DOWN", effects: { credits: -5000, crime: -3, happiness: -4, lawOrder: 4 } },
      { id: "desert_address_cause", label: "ADDRESS ROOT CAUSE", effects: { credits: -10000, happiness: 3, unrest: -3 } },
    ],
  },
  {
    id: "war_supply_line_cut",
    title: "SUPPLY LINES SEVERED",
    severity: "critical",
    effects: { food: -60, unrest: 5, happiness: -3, defenseRating: -2 },
    responseOptions: [
      { id: "supply_airlift", label: "EMERGENCY AIRLIFT", effects: { credits: -15000, food: 40, defenseRating: 1 } },
      { id: "supply_assault", label: "ASSAULT TO REOPEN", effects: { credits: -10000, defenseRating: 2, unrest: 3 } },
      { id: "supply_alternate", label: "ESTABLISH ALTERNATE ROUTE", effects: { credits: -8000, food: 20, crime: 2 } },
      { id: "supply_ration", label: "EMERGENCY FIELD RATIONING", effects: { happiness: -4, unrest: 3 } },
    ],
    maxResponses: 2,
  },
  {
    id: "war_ceasefire_offer",
    title: "CEASEFIRE PROPOSAL RECEIVED",
    severity: "medium",
    effects: { happiness: 2, unrest: -1 },
    responseOptions: [
      { id: "ceasefire_accept", label: "ACCEPT TERMS", effects: { happiness: 8, unrest: -6, defenseRating: -1 } },
      { id: "ceasefire_counter", label: "COUNTER-PROPOSE", effects: { credits: 10000, happiness: 4, unrest: -2, corruption: 2 } },
      { id: "ceasefire_reject", label: "REJECT — PRESS ADVANTAGE", effects: { happiness: -4, unrest: 5, defenseRating: 2, credits: -8000 } },
      { id: "ceasefire_stall", label: "STALL NEGOTIATIONS", effects: { defenseRating: 2, corruption: 2, happiness: -1 } },
    ],
  },
  {
    id: "war_propaganda_broadcast",
    title: "ENEMY PROPAGANDA BROADCAST",
    severity: "medium",
    effects: { unrest: 6, happiness: -3, corruption: 2 },
    responseOptions: [
      { id: "prop_jam", label: "JAM THE SIGNAL", effects: { credits: -4000, unrest: -2, happiness: -2 } },
      { id: "prop_counter", label: "COUNTER-BROADCAST", effects: { credits: -6000, happiness: 2, unrest: -3 } },
      { id: "prop_ignore", label: "LET IT PLAY", effects: { unrest: 2, happiness: -1 } },
      { id: "prop_trace", label: "TRACE THE SOURCE", effects: { credits: -8000, crime: -2, defenseRating: 1 } },
    ],
  },
  {
    id: "war_friendly_fire",
    title: "FRIENDLY FIRE INCIDENT",
    severity: "high",
    effects: { happiness: -6, unrest: 5, defenseRating: -1 },
    responseOptions: [
      { id: "ff_investigate", label: "FULL INVESTIGATION", effects: { credits: -3000, happiness: 2, lawOrder: 2 } },
      { id: "ff_coverup", label: "CLASSIFY THE REPORT", effects: { corruption: 4, happiness: 1, unrest: -2 } },
      { id: "ff_compensate", label: "COMPENSATE FAMILIES", effects: { credits: -10000, happiness: 3, unrest: -3 } },
    ],
  },
  {
    id: "war_arms_shipment",
    title: "ARMS SHIPMENT CAPTURED",
    severity: "low",
    effects: { happiness: 3, defenseRating: 2, credits: 5000 },
    responseOptions: [
      { id: "arms_distribute", label: "DISTRIBUTE TO TROOPS", effects: { defenseRating: 2, credits: 2000 } },
      { id: "arms_research", label: "REVERSE ENGINEER", effects: { credits: -3000, defenseRating: 1 } },
      { id: "arms_sell", label: "SELL ON BLACK MARKET", effects: { credits: 12000, corruption: 3, crime: 2 } },
    ],
  },
  {
    id: "war_defector_at_gate",
    title: "ENEMY DEFECTOR AT THE GATE",
    severity: "medium",
    effects: { happiness: 1 },
    responseOptions: [
      { id: "defector_intel", label: "FULL INTELLIGENCE DEBRIEF", effects: { credits: -2000, defenseRating: 3, corruption: 1 } },
      { id: "defector_broadcast", label: "PUT HIM ON CAMERA", effects: { happiness: 4, unrest: -3, defenseRating: -1 } },
      { id: "defector_extract_family", label: "EXTRACT HIS FAMILY", effects: { credits: -8000, defenseRating: 2, happiness: 3 } },
      { id: "defector_refuse", label: "REFUSE ASYLUM", effects: { defenseRating: -1, happiness: -2, corruption: 2 } },
    ],
    maxResponses: 2,
  },
  {
    id: "war_field_hospital_overrun",
    title: "FIELD HOSPITAL OVERRUN",
    severity: "critical",
    effects: { happiness: -3, unrest: 3 },
    responseOptions: [
      { id: "hospital_breakthrough", label: "ARMOURED BREAKTHROUGH", effects: { credits: -10000, defenseRating: -1, happiness: 5, unrest: -3 } },
      { id: "hospital_airlift", label: "ROTORCRAFT EXTRACTION", effects: { credits: -6000, happiness: 3, unrest: -2 } },
      { id: "hospital_negotiate", label: "REQUEST MEDICAL CEASEFIRE", effects: { credits: -2000, happiness: 1, corruption: 1 } },
      { id: "hospital_abandon", label: "ORDER THEM TO HOLD", effects: { happiness: -8, unrest: 6, defenseRating: 1, lawOrder: -2 } },
    ],
  },
  {
    id: "war_propaganda_leaflets",
    title: "ENEMY LEAFLET DROP",
    severity: "medium",
    effects: { unrest: 4, happiness: -2 },
    responseOptions: [
      { id: "leaflet_collect", label: "ORGANISED COLLECTION DRIVE", effects: { credits: -3000, unrest: -3, happiness: 2 } },
      { id: "leaflet_counter", label: "COUNTER-LEAFLET DROP", effects: { credits: -5000, happiness: 3, unrest: -2 } },
      { id: "leaflet_arrest", label: "ARREST DISTRIBUTORS", effects: { unrest: -2, happiness: -3, lawOrder: 3, crime: -1 } },
      { id: "leaflet_ignore", label: "LET THEM BLOW AWAY", effects: { unrest: 2, corruption: 1 } },
    ],
  },
  {
    id: "war_refugee_column_perimeter",
    title: "REFUGEE COLUMN AT THE PERIMETER",
    severity: "high",
    effects: { unrest: 3, happiness: -2 },
    responseOptions: [
      { id: "refugee_admit_all", label: "ADMIT ALL — PROCESS LATER", effects: { credits: -8000, food: -30, happiness: 4, unrest: 3, crime: 2 } },
      { id: "refugee_screen_strict", label: "STRICT SCREENING AT GATE", effects: { credits: -4000, happiness: -2, unrest: -1, lawOrder: 2 } },
      { id: "refugee_camps_outside", label: "ESTABLISH CAMPS OUTSIDE WALLS", effects: { credits: -6000, happiness: 1, defenseRating: -1 } },
      { id: "refugee_refuse", label: "REFUSE ENTRY", effects: { happiness: -7, unrest: 5, lawOrder: -2, corruption: 3 } },
    ],
    maxResponses: 2,
  },
  {
    id: "war_profiteering_exposed",
    title: "WAR PROFITEERING SCANDAL EXPOSED",
    severity: "high",
    effects: { unrest: 5, happiness: -4, corruption: 3 },
    responseOptions: [
      { id: "profit_arrest_all", label: "PUBLIC ARRESTS, FULL TRIBUNAL", effects: { credits: 8000, corruption: -5, unrest: -3, happiness: 4, lawOrder: 4 } },
      { id: "profit_quiet_remove", label: "QUIET REMOVAL", effects: { credits: 2000, corruption: -1, happiness: -1 } },
      { id: "profit_seize_assets", label: "SEIZE ASSETS, REPLACE STOCK", effects: { credits: 5000, defenseRating: 3, corruption: -3, unrest: -2 } },
      { id: "profit_bury", label: "BURY THE DOSSIER", effects: { credits: -1000, corruption: 5, unrest: 4, happiness: -3 } },
    ],
    maxResponses: 2,
  },
  {
    id: "war_chemical_weapons_intel",
    title: "CHEMICAL WEAPONS INTELLIGENCE",
    severity: "critical",
    effects: { unrest: 4, happiness: -3 },
    responseOptions: [
      { id: "chem_strike_now", label: "PRE-EMPTIVE STRIKE", effects: { credits: -12000, defenseRating: 4, happiness: -3, unrest: 4, corruption: 3 } },
      { id: "chem_warn_publicly", label: "PUBLIC EXPOSURE", effects: { credits: -2000, unrest: -2, happiness: 2 } },
      { id: "chem_distribute_masks", label: "ISSUE PROTECTIVE GEAR", effects: { credits: -10000, happiness: 3, unrest: -3, defenseRating: 1 } },
      { id: "chem_back_channel", label: "BACK-CHANNEL ULTIMATUM", effects: { credits: -1000, defenseRating: 1, corruption: 4 } },
    ],
    maxResponses: 2,
  },
  {
    id: "war_civilian_uprising_enemy",
    title: "CIVILIAN UPRISING IN ENEMY TERRITORY",
    severity: "high",
    effects: { happiness: 4, unrest: -2 },
    responseOptions: [
      { id: "uprising_arm", label: "COVERTLY ARM THE UPRISING", effects: { credits: -10000, defenseRating: 3, happiness: 3, corruption: 3 } },
      { id: "uprising_propaganda", label: "AMPLIFY VIA BROADCAST", effects: { credits: -3000, happiness: 4, defenseRating: 1 } },
      { id: "uprising_offensive", label: "LAUNCH SUPPORTING OFFENSIVE", effects: { credits: -15000, defenseRating: 2, happiness: 6, unrest: 4 } },
      { id: "uprising_wait", label: "OBSERVE AND WAIT", effects: { defenseRating: 1, happiness: -1 } },
    ],
    maxResponses: 2,
  },
  // Task #540: Wartime Events Master pack (12 events) — kept in its own file
  // for clean parallel merges. Same firing rules as the entries above, plus
  // per-event retrigger cooldowns enforced in generateWarEvent.
  ...WARTIME_MASTER_EVENTS,
];

// Persistence must accept every capped wartime definition, regardless of
// whether it came from the legacy pool or an appended content pack.
export const WAR_EVENT_OCCURRENCE_IDS = new Set(
  WAR_EVENT_POOL.filter((event) => event.maxOccurrencesPerWar !== undefined).map((event) => event.id),
);

const HOSTILE_FACTION_THREAT = 70;

function getHostileFactions(state: GameState): { id: string; name: string; threat: number }[] {
  return state.factions
    .filter((f) => f.threat >= HOSTILE_FACTION_THREAT)
    .map((f) => ({ id: f.id, name: f.name, threat: f.threat }));
}

// Task #562: default retrigger cooldown for original-pool war events (the
// pack events carry longer per-id entries in WARTIME_MASTER_COOLDOWN_TICKS).
// clearEventAndHealBiome stamps eventTriggerCooldowns[id] on EVERY player
// resolve/dismiss, but the filter below previously only honored stamps for
// pack ids — so war_ceasefire_offer could re-fire the very next tick after
// the player answered it. 3 in-game days at the wartime pack's 96 ticks/day.
const DEFAULT_WAR_EVENT_COOLDOWN_TICKS = 3 * 96;

function canFactionTriggerWarEvent(
  state: GameState,
  factionId: string,
  event: WarEventTemplate,
): boolean {
  const limit = event.maxOccurrencesPerWar;
  if (limit === undefined) return true;
  return (state.warEventOccurrences?.[factionId]?.[event.id] ?? 0) < limit;
}

// A conflict ends as soon as its faction is no longer hostile. Clear only that
// faction's counts, so a later escalation starts fresh while simultaneous wars
// retain their own independent limits.
export function resetEndedWarEventOccurrences(state: GameState): GameState {
  const occurrences = state.warEventOccurrences;
  if (!occurrences || Object.keys(occurrences).length === 0) return state;

  const hostileIds = new Set(getHostileFactions(state).map((f) => f.id));
  const activeEntries = Object.entries(occurrences).filter(([factionId]) => hostileIds.has(factionId));
  if (activeEntries.length === Object.keys(occurrences).length) return state;

  return {
    ...state,
    warEventOccurrences: Object.fromEntries(activeEntries),
  };
}

// Task #562: exported for tests — the deterministic filter half of
// generateWarEvent, without the RNG gates. An event template is available
// only when it is (a) not among the last 5 history entries, (b) not already
// sitting unresolved in activeEvents (this was the duplicate-ceasefire bug:
// the static id war_ceasefire_offer could pile up copies while threat >= 70,
// especially during offline catch-up), (c) past its retrigger cooldown, and
// (d) below its per-war maximum for at least one hostile faction.
export function getAvailableWarEvents(
  state: GameState,
): typeof WAR_EVENT_POOL {
  const recentIds = state.eventHistory.slice(-5).map((e) => e.id);
  const activeIds = new Set(state.activeEvents.map((e) => e.id));
  const cooldowns = state.eventTriggerCooldowns ?? {};
  const hostiles = getHostileFactions(state);
  return WAR_EVENT_POOL.filter((e) => {
    if (recentIds.includes(e.id)) return false;
    if (activeIds.has(e.id)) return false;
    const cd = WARTIME_MASTER_COOLDOWN_TICKS[e.id] ?? DEFAULT_WAR_EVENT_COOLDOWN_TICKS;
    if (state.totalTicks - (cooldowns[e.id] ?? -9999999) < cd) return false;
    if (
      hostiles.length > 0 &&
      !hostiles.some((faction) => canFactionTriggerWarEvent(state, faction.id, e))
    ) {
      return false;
    }
    return true;
  });
}

function generateWarEvent(state: GameState): EventGenerationResult | null {
  const hostiles = getHostileFactions(state);
  if (hostiles.length === 0) return null;
  if (Math.random() > 0.2) return null;

  const available = getAvailableWarEvents(state);
  if (available.length === 0) return null;

  const chosen = available[Math.floor(Math.random() * available.length)];
  const eligibleFactions = hostiles.filter((faction) =>
    canFactionTriggerWarEvent(state, faction.id, chosen),
  );
  // The availability filter guarantees this for capped events. Keep the guard
  // so a later change cannot accidentally select an exhausted faction.
  if (eligibleFactions.length === 0) return null;
  const faction = eligibleFactions[Math.floor(Math.random() * eligibleFactions.length)];

  const event: GameEvent = {
    ...chosen,
    title: `${chosen.title}`,
    timestamp: Date.now(),
    resolved: false,
    // Task #562: stamp the instigating faction so resolution paths (ceasefire
    // accept/counter) can cool THAT faction's threat instead of guessing.
    // EventCard also renders the faction name from this. Legacy saves carry
    // war events without the stamp — eventResolution falls back to parsing
    // the [NAME CONFLICT] description prefix for those.
    factionId: faction.id,
  };

  // Task #562: stamp the spawn tick for EVERY war event (pack and original
  // pool alike) so the cooldown filter above holds on future ticks even if
  // the player leaves the event unresolved — belt to the activeIds suspenders.
  const cooldowns = state.eventTriggerCooldowns ?? {};
  const warEventOccurrences = chosen.maxOccurrencesPerWar === undefined
    ? state.warEventOccurrences
    : {
        ...(state.warEventOccurrences ?? {}),
        [faction.id]: {
          ...(state.warEventOccurrences?.[faction.id] ?? {}),
          [chosen.id]: (state.warEventOccurrences?.[faction.id]?.[chosen.id] ?? 0) + 1,
        },
      };
  return {
    event,
    cooldowns: { ...cooldowns, [chosen.id]: state.totalTicks },
    ...(warEventOccurrences ? { warEventOccurrences } : {}),
  };
}

export type EventGenerationResult = {
  event: GameEvent;
  cooldowns?: Record<string, number>;
  eventRecurrenceCounts?: Record<string, number>;
  warEventOccurrences?: GameState["warEventOccurrences"];
};

export function generateAnnualLabourDayEvent(state: GameState): EventGenerationResult | null {
  const match = getLabourDayDateMatch(state.gameDate);
  if (!match) return null;

  const cooldowns = state.eventTriggerCooldowns ?? {};
  const activeIds = new Set((state.activeEvents ?? []).map((event) => event.id));
  const recentIds = new Set((state.eventHistory ?? []).map((event) => event.id));
  if (activeIds.has(match.eventId) || recentIds.has(match.eventId) || cooldowns[match.eventId] !== undefined) {
    return null;
  }

  return {
    event: {
      id: match.eventId,
      title: match.observance === "international"
        ? "INTERNATIONAL LABOUR DAY"
        : "LABOUR DAY",
      severity: "low",
      effects: {},
      responseOptions: LABOUR_DAY_RESPONSES,
      timestamp: Date.now(),
      resolved: false,
    },
    cooldowns: { ...cooldowns, [match.eventId]: state.totalTicks },
  };
}

const MEGA_PROJECT_CONSTRUCTION_IDS = new Set([
  "mega_construction_sabotage",
  "mega_project_overrun",
  "mega_project_inspection",
  "mega_worker_strike",
]);

const MEGA_PROJECT_EVENT_IDS = new Set([
  "mega_construction_sabotage",
  "mega_project_overrun",
  "mega_project_inspection",
  "mega_worker_strike",
  "mega_project_celebrity",
  "mega_project_espionage",
  "mega_project_resource_discovery",
  "mega_project_black_market_parts",
]);

const ANNIVERSARY_MILESTONES: {
  years: number;
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  responses: EventResponse[];
  tickThreshold: number;
}[] = [
  {
    years: 1,
    id: "anniversary-1",
    title: "FIRST ANNIVERSARY — ONE YEAR IN COMMAND",
    severity: "low",
    tickThreshold: 34560,
    responses: [
      { id: "ann1_speech", label: "GIVE A PUBLIC ADDRESS", effects: { happiness: 5, unrest: -3 } },
      { id: "ann1_feast", label: "DECLARE A FEAST DAY", effects: { happiness: 8, food: -40, credits: -5000 } },
      { id: "ann1_quiet", label: "MARK IT QUIETLY", effects: { lawOrder: 2 } },
    ],
  },
  {
    years: 5,
    id: "anniversary-5",
    title: "FIVE YEARS IN COMMAND — THE IRON ANNIVERSARY",
    severity: "medium",
    tickThreshold: 172800,
    responses: [
      { id: "ann5_monument", label: "COMMISSION THE MONUMENT", effects: { happiness: 6, credits: -20000, corruption: 2 } },
      { id: "ann5_amnesty", label: "DECLARE LIMITED AMNESTY", effects: { happiness: 8, crime: 3, unrest: -5 } },
      { id: "ann5_reinvest", label: "INFRASTRUCTURE CELEBRATION", effects: { credits: -15000, happiness: 5, unrest: -4 } },
      { id: "ann5_humble", label: "DECLINE ALL CEREMONY", effects: { corruption: -3, lawOrder: 3 } },
    ],
  },
  {
    years: 10,
    id: "anniversary-10",
    title: "A DECADE OF IRON — TEN YEARS IN COMMAND",
    severity: "high",
    tickThreshold: 345600,
    responses: [
      { id: "ann10_parade", label: "GRAND MILITARY PARADE", effects: { happiness: 10, unrest: -6, credits: -30000, defenseRating: 3 } },
      { id: "ann10_holiday", label: "DECLARE A NATIONAL HOLIDAY", effects: { happiness: 12, credits: -10000, corruption: 3 } },
      { id: "ann10_purge", label: "ANNIVERSARY PURGE", effects: { crime: -8, corruption: -6, unrest: 4, happiness: -3 } },
      { id: "ann10_invest", label: "DECADE OF PROSPERITY FUND", effects: { credits: -50000, happiness: 8, unrest: -4, employment: 3 } },
    ],
  },
  {
    years: 25,
    id: "anniversary-25",
    title: "SILVER JUBILEE — TWENTY-FIVE YEARS IN COMMAND",
    severity: "high",
    tickThreshold: 864000,
    responses: [
      { id: "ann25_rename", label: "RENAME A DISTRICT", effects: { happiness: 8, corruption: 4, credits: -15000 } },
      { id: "ann25_games", label: "JUBILEE GAMES", effects: { happiness: 15, credits: -40000, unrest: -8, crime: 2 } },
      { id: "ann25_endowment", label: "SILVER JUBILEE ENDOWMENT", effects: { credits: -75000, happiness: 10, unrest: -6 } },
      { id: "ann25_stoic", label: "TWENTY-FIVE MORE", effects: { lawOrder: 5, corruption: -4 } },
    ],
  },
  {
    years: 50,
    id: "anniversary-50",
    title: "GOLDEN JUBILEE — FIFTY YEARS IN COMMAND",
    severity: "critical",
    tickThreshold: 1728000,
    responses: [
      { id: "ann50_golden_city", label: "DECLARE THE GOLDEN AGE", effects: { happiness: 20, credits: -100000, unrest: -10, corruption: 5 } },
      { id: "ann50_legacy", label: "BUILD THE LEGACY COMPLEX", effects: { credits: -150000, happiness: 15, unrest: -8 } },
      { id: "ann50_free_day", label: "GOLDEN JUBILEE AMNESTY", effects: { happiness: 18, crime: 6, unrest: -10, credits: -20000 } },
      { id: "ann50_eternal", label: "THERE IS NO JUBILEE", effects: { lawOrder: 8, corruption: -6, happiness: -3 } },
    ],
  },
  {
    years: 100,
    id: "anniversary-100",
    title: "THE CENTENNIAL — ONE HUNDRED YEARS IN COMMAND",
    severity: "critical",
    tickThreshold: 3456000,
    responses: [
      { id: "ann100_ascend", label: "ASCENSION CEREMONY", effects: { happiness: 25, unrest: -15, credits: -200000, corruption: 8 } },
      { id: "ann100_reset", label: "CENTURY ZERO", effects: { happiness: 20, lawOrder: 10, unrest: -12, credits: -50000 } },
      { id: "ann100_open", label: "OPEN THE ARCHIVES", effects: { corruption: -15, happiness: 15, unrest: 5, crime: -5 } },
      { id: "ann100_silence", label: "A HUNDRED YEARS OF SILENCE", effects: { lawOrder: 12, corruption: -8 } },
    ],
  },
];

export function generateAnniversaryEvent(state: GameState): EventGenerationResult | null {
  const cooldowns = state.eventTriggerCooldowns ?? {};

  for (const milestone of ANNIVERSARY_MILESTONES) {
    if (cooldowns[milestone.id] !== undefined) continue;
    if (state.totalTicks < milestone.tickThreshold) continue;

    const alreadyActive = (state.activeEvents ?? []).some(e => e.id === milestone.id);
    if (alreadyActive) continue;

    const updatedCooldowns = { ...cooldowns, [milestone.id]: state.totalTicks };
    return {
      event: {
        id: milestone.id,
        title: milestone.title,
        severity: milestone.severity,
        effects: {},
        responseOptions: milestone.responses,
        timestamp: Date.now(),
        resolved: false,
      },
      cooldowns: updatedCooldowns,
    };
  }
  return null;
}

// =====================================================================
// FIRST-WEEK ONBOARDING EVENTS
// =====================================================================
// Fires deterministically at specific tick milestones AFTER the player
// has completed the live walkthrough (hasCompletedOnboarding === true).
// Each event teaches one core system the walkthrough did not cover.
// One-shot per save — once fired, never fires again. The `tickWindow`
// gives a small cushion so a player who skipped a few ticks still sees
// the prompt.
//
// Effects are deliberately small and reversible — these exist to teach,
// not to punish a new player for picking the "wrong" option.

type OnboardingMilestone = {
  id: string;
  fireAtTick: number;
  tickWindow: number; // also fires up to this many ticks late
  precondition?: (s: GameState) => boolean;
  event: Omit<GameEvent, "timestamp" | "resolved">;
};

// Fallback deep-link lookup for saves written BEFORE navigateTo existed:
// active events are persisted with their responseOptions frozen at spawn
// time, so an in-flight "OPEN <SCREEN>" card loaded from an older save has
// no navigateTo. EventCard falls back to this map (response ids are unique
// across all onboarding events). Built from ONBOARDING_MILESTONES below so
// there is a single source of truth.
export function getOnboardingResponseNav(responseId: string): string | undefined {
  return ONBOARDING_RESPONSE_NAV[responseId];
}

const ONBOARDING_MILESTONES: OnboardingMilestone[] = [
  {
    id: "ob_housing_pressure",
    fireAtTick: 5,
    tickWindow: 10,
    precondition: (s) =>
      (s.cityStats?.housingPressure ?? 0) > 40 ||
      (s.demographics?.homelessPopulation ?? 0) > 0,
    event: {
      id: "ob_housing_pressure",
      title: "ADVISOR: HOUSING SHORTFALL",
      severity: "low",
      effects: { happiness: -1 },
      responseOptions: [
        { id: "ob_housing_acknowledge", label: "ACKNOWLEDGED — I'LL BUILD HOUSING", effects: { happiness: 1 }, navigateTo: "/(game)/construction" },
        { id: "ob_housing_defer", label: "LATER — OTHER PRIORITIES FIRST", effects: { unrest: 1 } },
      ],
    },
  },
  {
    id: "ob_revenue_basics",
    fireAtTick: 8,
    tickWindow: 12,
    // Unconditional — every new player benefits from knowing where the
    // revenue screens are. Income thresholds were brittle (default
    // starting income already exceeds any reasonable "low" floor).
    event: {
      id: "ob_revenue_basics",
      title: "TREASURY: KNOW YOUR REVENUE",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_revenue_taxoffice", label: "QUEUE A TAX OFFICE", effects: {}, navigateTo: "/(game)/construction" },
        { id: "ob_revenue_corporation", label: "LICENSE A CORPORATION", effects: { corruption: 1 }, navigateTo: "/(game)/companies" },
        { id: "ob_revenue_acknowledge", label: "I'LL HANDLE IT", effects: {} },
      ],
    },
  },
  {
    id: "ob_first_faith_choice",
    fireAtTick: 12,
    tickWindow: 10,
    precondition: (s) => Boolean(s.faiths) && (s.totalTicks ?? 0) >= 12,
    event: {
      id: "ob_first_faith_choice",
      title: "STREET FAITHS — A QUIET INTRODUCTION",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_faith_open", label: "OPEN THE FAITH SCREEN NOW", effects: {}, navigateTo: "/(game)/law?tab=faiths" },
        { id: "ob_faith_secular", label: "STAY SECULAR — NOTED", effects: { happiness: -1 } },
      ],
    },
  },
  {
    id: "ob_diplomacy_overture",
    fireAtTick: 15,
    tickWindow: 15,
    precondition: (s) => Array.isArray(s.factions) && s.factions.length >= 3,
    event: {
      id: "ob_diplomacy_overture",
      title: "DIPLOMATIC CHANNEL — FIRST CONTACT",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_diplo_open", label: "OPEN DIPLOMACY", effects: {}, navigateTo: "/(game)/diplomacy" },
        { id: "ob_diplo_acknowledge", label: "I'LL GET TO IT", effects: {} },
      ],
    },
  },
  {
    id: "ob_research_queue",
    fireAtTick: 20,
    tickWindow: 15,
    precondition: (s) => !s.activeResearch,
    event: {
      id: "ob_research_queue",
      title: "RESEARCH BENCH: NOTHING QUEUED",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_research_open", label: "OPEN RESEARCH", effects: {}, navigateTo: "/(game)/research" },
        { id: "ob_research_skip", label: "NOT YET", effects: { happiness: -1 } },
      ],
    },
  },
  {
    id: "ob_first_officer",
    fireAtTick: 25,
    tickWindow: 15,
    precondition: (s) => {
      const officers = s.officers ?? [];
      const appointed = officers.filter((o: { appointed?: boolean }) => o.appointed).length;
      return appointed < 2;
    },
    event: {
      id: "ob_first_officer",
      title: "RECRUITMENT: SEATS ARE EMPTY",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_officer_recruit", label: "OPEN RECRUITMENT", effects: {}, navigateTo: "/(game)/recruitment" },
        { id: "ob_officer_skip", label: "RUN LEAN FOR NOW", effects: {} },
      ],
    },
  },
  {
    id: "ob_keyboard_shortcuts",
    fireAtTick: 30,
    tickWindow: 20,
    event: {
      id: "ob_keyboard_shortcuts",
      title: "FIELD MEMO: KEYBOARD SHORTCUTS",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_keys_thanks", label: "FILED FOR REFERENCE", effects: { happiness: 1 } },
      ],
    },
  },
  {
    id: "ob_auto_managers",
    fireAtTick: 40,
    tickWindow: 20,
    event: {
      id: "ob_auto_managers",
      title: "AUTO-MANAGERS: DELEGATE OR DROWN",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_am_open", label: "OPEN AUTO-MANAGERS", effects: {}, navigateTo: "/(game)/advisor-briefings" },
        { id: "ob_am_micro", label: "I MICROMANAGE EVERYTHING", effects: {} },
      ],
    },
  },
  {
    id: "ob_save_slot_reminder",
    fireAtTick: 45,
    tickWindow: 15,
    event: {
      id: "ob_save_slot_reminder",
      title: "SECRETARIAT: SIX SAVE SLOTS",
      severity: "low",
      effects: {},
      responseOptions: [
        { id: "ob_save_ack", label: "GOOD TO KNOW", effects: { happiness: 1 } },
      ],
    },
  },
  {
    id: "ob_first_hour_graduation",
    fireAtTick: 50,
    tickWindow: 30,
    event: {
      id: "ob_first_hour_graduation",
      title: "DAILY DISPATCH: YOU ARE STILL IN OFFICE",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: [
        { id: "ob_grad_continue", label: "CARRY ON", effects: {} },
      ],
    },
  },
];

// See getOnboardingResponseNav above — responseId → navigateTo, derived
// from the milestone defs so the two can never drift apart.
const ONBOARDING_RESPONSE_NAV: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const m of ONBOARDING_MILESTONES) {
    for (const r of m.event.responseOptions ?? []) {
      if (r.navigateTo) map[r.id] = r.navigateTo;
    }
  }
  return map;
})();

function generateOnboardingEvent(state: GameState): EventGenerationResult | null {
  // Only fire after the live walkthrough is finished. Veterans whose
  // saves predate `hasCompletedOnboarding` see the field as undefined,
  // which we treat as "completed" (they don't get retroactive tutorials).
  if (state.hasCompletedOnboarding === false) return null;

  const fired = new Set((state.eventHistory ?? []).map((e) => e.id));
  for (const e of state.activeEvents ?? []) fired.add(e.id);

  for (const m of ONBOARDING_MILESTONES) {
    if (fired.has(m.id)) continue;
    if (state.totalTicks < m.fireAtTick) continue;
    if (state.totalTicks > m.fireAtTick + m.tickWindow) continue;
    if (m.precondition && !m.precondition(state)) continue;
    return {
      event: {
        ...m.event,
        timestamp: Date.now(),
        resolved: false,
      },
    };
  }
  return null;
}

export function generateRandomEvent(state: GameState): EventGenerationResult | null {
  const onboardingResult = generateOnboardingEvent(state);
  if (onboardingResult) return onboardingResult;

  const labourDayResult = generateAnnualLabourDayEvent(state);
  if (labourDayResult) return labourDayResult;

  const anniversaryResult = generateAnniversaryEvent(state);
  if (anniversaryResult) return anniversaryResult;

  const warResult = generateWarEvent(state);
  if (warResult) return warResult;

  const conditionResult = generateConditionEvent(state);
  if (conditionResult) return conditionResult;

  if (Math.random() > 0.15) return null;

  // Biosphere/ecology crises are spawned exclusively by the wildlands ecology
  // system (processWildlandsEcology), which tags each with a biome and gates
  // them with per-biome event gaps plus post-resolution calm windows. Including
  // them in this ungated ~15%/tick random pool spawned biome-less duplicates
  // that bypassed resolveBiosphereEvent entirely and spammed the player.
  let pool: Omit<GameEvent, "timestamp" | "resolved">[] = [...EVENT_POOL, ...EXPANSION_EVENT_POOL];
  if (isBigBrotherActive(state.addons)) pool = [...pool, ...BB_EVENT_POOL];
  if (isSixthDayActive(state.addons)) pool = [...pool, ...SD_EVENT_POOL];

  const megaProjects = state.megaProjects ?? [];
  const hasConstructing = megaProjects.some(p => p.phase === "construction");
  const hasAnyMegaProject = megaProjects.length > 0;
  pool = pool.filter((e) => {
    if (MEGA_PROJECT_CONSTRUCTION_IDS.has(e.id) && !hasConstructing) return false;
    if (MEGA_PROJECT_EVENT_IDS.has(e.id) && !hasAnyMegaProject) return false;
    if (!isStaticRandomEventEligible(state, e.id)) return false;
    return true;
  });

  const recentIds = state.eventHistory.slice(-5).map((e) => e.id);
  // Task #562: never re-spawn an id that is already sitting unresolved in the
  // player's event list — duplicate static ids break EventCard interactivity
  // (React keys collide) and double the pending effects. Condition events
  // already guard this in eventTriggers; this closes the random pool.
  const activeIds = new Set(state.activeEvents.map((e) => e.id));
  const available = pool.filter((e) => !recentIds.includes(e.id) && !activeIds.has(e.id));

  if (available.length === 0) return null;

  const chosen = available[Math.floor(Math.random() * available.length)];

  return {
    event: {
      ...chosen,
      timestamp: Date.now(),
      resolved: false,
    },
  };
}

function reportCappedMedicalReward(
  state: GameState,
  source: string,
  result: ReturnType<typeof applyResourceDelta>,
): void {
  if (result.rejected <= 0) return;
  const message: GameMessage = {
    id: `medical-storage-${source}-${state.totalTicks}`,
    timestamp: state.gameDate,
    tick: state.totalTicks,
    category: "report",
    title: "MEDICAL RESERVE CAP REACHED",
    body: `${source}: ${summarizeMedicalStorageGain(result)}`,
    read: false,
    priority: "normal",
  };
  state.messages = [message, ...(state.messages ?? [])].slice(0, 200);
}

export function applyEventEffects(state: GameState, event: GameEvent): GameState {
  if (isRetiredEvent(event)) return state;
  // Task #562: structural duplicate guard on the one shared append path. Every
  // generator now filters against activeEvents, but if a future spawn path
  // forgets, this keeps a second copy of the same id from landing (duplicate
  // ids collide as React keys and break EventCard) and from double-applying
  // the trigger effects. Skipping entirely is the correct no-op: the event the
  // player already sees is unchanged.
  if (state.activeEvents.some((ae) => ae.id === event.id)) return state;
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const e = event.effects;

  function clamp(v: number) {
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }

  if (e.credits !== undefined) s.resources.credits = Math.max(0, s.resources.credits + e.credits);
  if (e.food !== undefined) applyResourceDelta(s, "food", e.food);
  if (e.water !== undefined) s.resources.water = Math.max(0, s.resources.water + e.water);
  if (e.power !== undefined) applyResourceDelta(s, "power", e.power);
  if (e.fuel !== undefined) applyResourceDelta(s, "fuel", e.fuel);
  if (e.unrest !== undefined) s.cityStats.unrest = clamp(s.cityStats.unrest + e.unrest);
  if (e.crime !== undefined) s.cityStats.crime = clamp(s.cityStats.crime + e.crime);
  if (e.happiness !== undefined) s.cityStats.happiness = clamp(s.cityStats.happiness + e.happiness);
  if (e.lawOrder !== undefined) s.cityStats.lawOrder = clamp(s.cityStats.lawOrder + e.lawOrder);
  if (e.corruption !== undefined)
    s.cityStats.corruption = clamp(s.cityStats.corruption + e.corruption);
  if (e.employment !== undefined)
    s.cityStats.employment = clamp(s.cityStats.employment + e.employment);
  if (e.infrastructureHealth !== undefined) {
    const next = applyInfrastructureHealthDelta(
      s,
      e.infrastructureHealth,
      `event:${event.id}:start`,
      `Event "${event.title}"`,
    );
    s.infrastructureLedger = next.infrastructureLedger;
    s.cityStats = next.cityStats;
  }
  if (e.defenseRating !== undefined)
    s.cityStats.defenseRating = Math.max(0, s.cityStats.defenseRating + e.defenseRating);
  if (e.medSupplies !== undefined) {
    reportCappedMedicalReward(
      s,
      `Event "${event.title}" reward`,
      applyResourceDelta(s, "medSupplies", e.medSupplies),
    );
  }
  if (e.steel !== undefined) applyResourceDelta(s, "steel", e.steel);
  if (e.goods !== undefined) applyResourceDelta(s, "goods", e.goods);
  // Trade income is a per-tick rate that gets fully recomputed each tick, so
  // persist the change in the eventTradeIncome accumulator (re-added into the
  // rate every tick by formulas.ts) and also apply it to the live rate now for
  // instant feedback before the next tick recomputes.
  if (e.tradeIncome !== undefined) {
    s.eventTradeIncome = (s.eventTradeIncome ?? 0) + e.tradeIncome;
    s.rates.tradeIncome = (s.rates.tradeIncome ?? 0) + e.tradeIncome;
  }

  const operationalEvent = { ...event, resolved: false };
  s.activeEvents = [...s.activeEvents, operationalEvent];
  s.eventHistory = [...s.eventHistory.slice(-20), { ...operationalEvent, resolved: true }];

  // Task #540: wartime pack events carry a linked ON_EVENT_START news story —
  // push its headline onto the ticker the moment the event fires. Returns null
  // for every id outside the pack, so this is a no-op for other events.
  const warNews = wartimeEventNewsItem(s, operationalEvent.id);
  if (warNews) {
    s.newsFeed = pushNewsItem(s.newsFeed ?? [], warNews);
  }
  const custodySource = wartimeEventCustodySource(s, operationalEvent);
  if (custodySource) {
    admitCustodyGroup(s, `event-custody:${custodySource.id}`, {
      id: `detained-group-${custodySource.id}`,
      count: custodySource.count,
      role: "pow",
      legalStatus: "military",
      originKind: custodySource.originKind,
      originId: custodySource.originId,
      originLabel: custodySource.originLabel,
      sourceKind: "detained_group",
      sourceId: custodySource.id,
    });
  }

  return s;
}

export function applyResponseEffects(
  state: GameState,
  response: EventResponse,
  context: { incidentId?: string; reason?: string } = {},
): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const e = response.effects;

  function clamp(v: number) {
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }

  if (e.credits !== undefined) s.resources.credits = Math.max(0, s.resources.credits + e.credits);
  if (e.food !== undefined) applyResourceDelta(s, "food", e.food);
  if (e.water !== undefined) s.resources.water = Math.max(0, s.resources.water + e.water);
  if (e.power !== undefined) applyResourceDelta(s, "power", e.power);
  if (e.unrest !== undefined) s.cityStats.unrest = clamp(s.cityStats.unrest + e.unrest);
  if (e.crime !== undefined) s.cityStats.crime = clamp(s.cityStats.crime + e.crime);
  if (e.happiness !== undefined) s.cityStats.happiness = clamp(s.cityStats.happiness + e.happiness);
  if (e.lawOrder !== undefined) s.cityStats.lawOrder = clamp(s.cityStats.lawOrder + e.lawOrder);
  if (e.corruption !== undefined)
    s.cityStats.corruption = clamp(s.cityStats.corruption + e.corruption);
  if (e.defenseRating !== undefined)
    s.cityStats.defenseRating = Math.max(0, s.cityStats.defenseRating + e.defenseRating);
  if (e.medSupplies !== undefined) {
    reportCappedMedicalReward(
      s,
      `Response "${response.label}" reward`,
      applyResourceDelta(s, "medSupplies", e.medSupplies),
    );
  }
  if (e.steel !== undefined) applyResourceDelta(s, "steel", e.steel);
  if (e.goods !== undefined) applyResourceDelta(s, "goods", e.goods);
  // Trade income is a per-tick rate that gets fully recomputed each tick, so
  // persist the change in the eventTradeIncome accumulator (re-added into the
  // rate every tick by formulas.ts) and also apply it to the live rate now for
  // instant feedback before the next tick recomputes.
  if (e.tradeIncome !== undefined) {
    s.eventTradeIncome = (s.eventTradeIncome ?? 0) + e.tradeIncome;
    s.rates.tradeIncome = (s.rates.tradeIncome ?? 0) + e.tradeIncome;
  }
  if (e.employment !== undefined) s.cityStats.employment = clamp(s.cityStats.employment + e.employment);
  if (e.infrastructureHealth !== undefined) {
    const next = applyInfrastructureHealthDelta(
      s,
      e.infrastructureHealth,
      context.incidentId ?? `response:${response.id}`,
      context.reason ?? `Response "${response.label}"`,
    );
    s.infrastructureLedger = next.infrastructureLedger;
    s.cityStats = next.cityStats;
  }
  if (e.wounded !== undefined || e.sick !== undefined || e.missing !== undefined || e.deaths !== undefined) {
    recordHumanConsequences(s, "event", {
      wounded: e.wounded,
      sick: e.sick,
      missing: e.missing,
      deaths: e.deaths,
      removeDeathsFromPopulation: true,
    });
  }

  return s;
}
