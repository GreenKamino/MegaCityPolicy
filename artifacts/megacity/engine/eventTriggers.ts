import type { GameEvent, GameState, EventResponse } from "@/engine/types";
import { applyFreeChoirTransitScale, FAITH_DEFS, isTidekeepersSponsored, tidekeepersMitigatesEvent, TIDEKEEPERS_EVENT_MITIGATION } from "@/engine/faiths";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
// Task #480: late-game prosperity pool lives in its own module (this file is
// already 3k+ lines). prosperityTriggers.ts imports only TYPES from here, so
// the value import below cannot form a runtime require cycle.
import { PROSPERITY_TRIGGERS } from "@/engine/prosperityTriggers";
import { isRetiredEventId } from "@/engine/eventRetirement";
import { getIncarcerationSummary } from "@/engine/custody";

// Resolve a faith's display name from its id. Tolerates unknown ids by
// returning the raw id so a corrupt save never crashes the event pump.
function faithDisplayName(id: string): string {
  return (FAITH_DEFS as Record<string, { shortName: string } | undefined>)[id]?.shortName ?? id;
}

export type TriggerCondition = {
  id: string;
  check: (s: GameState) => boolean;
  weight: (s: GameState) => number;
  cooldownTicks: number;
  generate: (s: GameState) => Omit<GameEvent, "timestamp" | "resolved">;
  // Persistent condition crises can re-fire after dismissal while their
  // underlying condition remains bad. They must have a matching entry in
  // recurringEvents.ts so dismissal can explain that return to the player.
  // Unmarked triggers are one-shot opportunities/incidents by default.
  persistent?: true;
  // Task #480: one-off storyline events whose check() describes opportunity or
  // backdrop (readiness, tick count, HEALTHY stats) rather than a failure the
  // player is expected to fix. A re-fire of one of these is a new story, not
  // the same unresolved incident, so flavor triggers:
  //   1. never get the repeat:true "STILL UNRESOLVED" badge, and
  //   2. get a recency-ramped weight after their cooldown so long-unseen
  //      stories are strongly preferred over ones the player just saw.
  // Genuine stat-gated crises (crime waves, overloads, outbreaks...) must NOT
  // set this — their repeats really are the same unresolved condition.
  flavor?: true;
};

export const OFFICER_RESPONSES: Record<string, EventResponse[]> = {
  officer_defection_warning: [
    { id: "bribe_officer", label: "OFFER INCENTIVES", effects: { credits: -8000, corruption: 2 } },
    { id: "reassign_officer", label: "REASSIGN TO DESK DUTY", effects: { happiness: -1, lawOrder: -1 } },
    { id: "dismiss_officer", label: "IMMEDIATE DISMISSAL", effects: { lawOrder: -2, happiness: -1 } },
    { id: "watch_officer", label: "COVERT SURVEILLANCE", effects: { credits: -3000, corruption: 1 } },
  ],
  officer_corruption_exposed: [
    { id: "arrest_officer", label: "ARREST AND PROSECUTE", effects: { corruption: -6, lawOrder: 4, happiness: 3, credits: -2000 } },
    { id: "quiet_removal", label: "QUIET REMOVAL", effects: { corruption: -3, credits: -1000 } },
    { id: "use_as_asset", label: "TURN THEM", effects: { corruption: 2, crime: -4, lawOrder: 2 } },
  ],
  officer_power_play: [
    { id: "confront_officer", label: "CONFRONT DIRECTLY", effects: { lawOrder: 2, happiness: -1 } },
    { id: "promote_rival", label: "PROMOTE THEIR RIVAL", effects: { corruption: 1, credits: -3000 } },
    { id: "accelerate_ambition", label: "GIVE THEM A MISSION", effects: { credits: -5000, defenseRating: 2 } },
    { id: "demote_officer", label: "DEMOTION", effects: { happiness: -2, lawOrder: 3, unrest: 1 } },
  ],
  faction_ultimatum: [
    { id: "comply_faction", label: "COMPLY WITH DEMANDS", effects: { credits: -15000, happiness: 2, unrest: -4 } },
    { id: "negotiate_faction", label: "COUNTER-OFFER", effects: { credits: -7000, happiness: 1, unrest: -2, corruption: 2 } },
    { id: "reject_faction", label: "REJECT OUTRIGHT", effects: { unrest: 5, happiness: -3, lawOrder: 3 } },
    { id: "suppress_faction", label: "CRACK DOWN ON THEM", effects: { credits: -10000, unrest: 3, crime: -4, lawOrder: 5, happiness: -4 } },
  ],
  faction_territory_dispute: [
    { id: "mediate_dispute", label: "MEDIATE", effects: { credits: -5000, unrest: -3, happiness: 2, corruption: 1 } },
    { id: "police_both", label: "POLICE BOTH SIDES", effects: { credits: -8000, crime: -4, lawOrder: 4, unrest: -2 } },
    { id: "let_fight", label: "LET THEM SETTLE IT", effects: { crime: 5, unrest: 4, happiness: -3 } },
    { id: "seize_territory", label: "SEIZE THE ZONE", effects: { credits: -12000, unrest: 3, lawOrder: 5, happiness: -2 } },
  ],
  crime_wave_surge: [
    { id: "cw_crackdown", label: "MASS ARRESTS", effects: { crime: -8, lawOrder: 5, happiness: -4, credits: -6000 } },
    { id: "cw_curfew", label: "IMPOSE CURFEW", effects: { crime: -5, happiness: -6, unrest: 3, lawOrder: 4 } },
    { id: "cw_community", label: "COMMUNITY PROGRAMS", effects: { credits: -10000, crime: -4, happiness: 4, unrest: -2 } },
    { id: "cw_bounties", label: "BOUNTY SYSTEM", effects: { credits: -8000, crime: -6, corruption: 3, happiness: -2 } },
  ],
  food_crisis: [
    { id: "fc_rations", label: "STRICT RATIONING", effects: { food: 40, happiness: -5, unrest: 3, lawOrder: 2 } },
    { id: "fc_import", label: "EMERGENCY IMPORTS", effects: { food: 120, credits: -20000, happiness: 2 } },
    { id: "fc_synth", label: "SYNTH-PROTEIN SURGE", effects: { food: 80, credits: -8000, happiness: -2 } },
    { id: "fc_gardens", label: "MANDATE URBAN GARDENS", effects: { credits: -5000, food: 30, happiness: 3, unrest: -2 } },
  ],
  power_crisis: [
    { id: "pc_blackout", label: "ROLLING BLACKOUTS", effects: { power: 30, happiness: -4, unrest: 3 } },
    { id: "pc_emergency", label: "EMERGENCY GENERATORS", effects: { power: 80, credits: -8000 } },
    { id: "pc_prioritize", label: "PRIORITIZE CRITICAL", effects: { power: 50, happiness: -6, credits: -3000 } },
  ],
  unrest_boiling: [
    { id: "ub_address", label: "PUBLIC ADDRESS", effects: { unrest: -6, happiness: 4, credits: -2000 } },
    { id: "ub_concessions", label: "EMERGENCY CONCESSIONS", effects: { credits: -15000, unrest: -8, happiness: 5, corruption: 2 } },
    { id: "ub_force", label: "SHOW OF FORCE", effects: { unrest: -4, happiness: -5, lawOrder: 5, crime: -3 } },
    { id: "ub_scapegoat", label: "FIND SOMEONE TO BLAME", effects: { unrest: -5, corruption: 4, happiness: -1 } },
  ],
  health_emergency: [
    { id: "he_quarantine", label: "FULL QUARANTINE", effects: { happiness: -5, unrest: 3, crime: -2, medSupplies: -20, credits: -6000 } },
    { id: "he_clinics", label: "MOBILE CLINICS", effects: { credits: -12000, happiness: 4, unrest: -3, medSupplies: -30 } },
    { id: "he_info", label: "PUBLIC HEALTH CAMPAIGN", effects: { credits: -5000, happiness: 2, unrest: -1 } },
  ],
  infrastructure_decay: [
    { id: "id_emergency", label: "EMERGENCY REPAIRS", effects: { credits: -20000, happiness: 3, unrest: -3 } },
    { id: "id_triage", label: "TRIAGE REPAIRS", effects: { credits: -10000, happiness: -2, unrest: 1 } },
    { id: "id_tax", label: "EMERGENCY INFRASTRUCTURE TAX", effects: { credits: 8000, happiness: -5, unrest: 4 } },
  ],
  population_boom: [
    { id: "pb_expand", label: "RAPID EXPANSION", effects: { credits: -25000, happiness: 4, unrest: -2 } },
    { id: "pb_restrict", label: "BIRTH RESTRICTIONS", effects: { happiness: -6, unrest: 5, credits: -3000 } },
    { id: "pb_incentivize", label: "EMIGRATION INCENTIVES", effects: { credits: -12000, happiness: -2, unrest: -3 } },
  ],
  corruption_endemic: [
    { id: "ce_purge", label: "SWEEPING PURGE", effects: { corruption: -12, happiness: 3, lawOrder: 5, credits: -10000, unrest: 2 } },
    { id: "ce_oversight", label: "INDEPENDENT OVERSIGHT BOARD", effects: { corruption: -8, credits: -8000, happiness: 4 } },
    { id: "ce_accept", label: "MANAGED CORRUPTION", effects: { corruption: -3, happiness: -2, credits: 5000 } },
  ],
  officer_loyalty_crisis: [
    { id: "olc_rally", label: "LOYALTY RALLY", effects: { credits: -5000, happiness: 2, corruption: 1 } },
    { id: "olc_pay_raise", label: "EMERGENCY PAY RAISE", effects: { credits: -15000, happiness: 1 } },
    { id: "olc_replace", label: "MASS REPLACEMENT", effects: { credits: -8000, lawOrder: -3, happiness: -2 } },
  ],
  mega_project_construction_accident: [
    { id: "mca_shutdown", label: "FULL SHUTDOWN", effects: { credits: -10000, happiness: 2, unrest: -3 } },
    { id: "mca_partial", label: "PARTIAL SHUTDOWN", effects: { credits: -5000, happiness: -1, unrest: -1 } },
    { id: "mca_push_through", label: "PUSH THROUGH", effects: { credits: -3000, happiness: -3, unrest: 2 } },
  ],
  multiple_missions_overload: [
    { id: "mmo_hire_staff", label: "EMERGENCY STAFF HIRE", effects: { credits: -12000, happiness: 1 } },
    { id: "mmo_prioritize", label: "TRIAGE OPERATIONS", effects: { credits: -3000, happiness: -1 } },
    { id: "mmo_automate", label: "DEPLOY AI COORDINATION", effects: { credits: -15000, corruption: 1, happiness: 2 } },
  ],
  mega_project_milestone: [
    { id: "mpm_celebrate", label: "PUBLIC CELEBRATION", effects: { credits: -8000, happiness: 6, unrest: -4 } },
    { id: "mpm_reinvest", label: "REINVEST IN WORKERS", effects: { credits: -12000, happiness: 4, unrest: -2 } },
    { id: "mpm_press_forward", label: "PRESS FORWARD", effects: { credits: -5000, happiness: -1 } },
  ],
  mission_officer_exhaustion: [
    { id: "moe_mandatory_leave", label: "MANDATORY LEAVE", effects: { credits: -3000, happiness: 2, unrest: -1 } },
    { id: "moe_stimulants", label: "COMBAT STIMULANTS", effects: { credits: -5000, happiness: -2, corruption: 2 } },
    { id: "moe_reassign", label: "REASSIGN TO TRAINING", effects: { credits: -2000, happiness: 1 } },
    { id: "moe_ignore", label: "LET THEM DECIDE", effects: { happiness: -1, unrest: 1 } },
  ],
  trade_caravan_arrives: [
    { id: "tc_welcome", label: "WELCOME WITH OPEN ARMS", effects: { credits: 8000, happiness: 3, crime: 2 } },
    { id: "tc_tax_heavy", label: "HEAVY TARIFFS", effects: { credits: 15000, happiness: -1, corruption: 2 } },
    { id: "tc_selective", label: "INSPECT AND SELECT", effects: { credits: 5000, happiness: 1, crime: -1, lawOrder: 1 } },
    { id: "tc_seize", label: "SEIZE THE CARAVAN", effects: { credits: 20000, food: 60, happiness: -3, corruption: 5 } },
  ],
  wx_acid_rain_corrosion: [
    { id: "wx_acid_emergency_seal", label: "EMERGENCY SEALANT CREWS", effects: { credits: -10000, happiness: 2, unrest: -2 } },
    { id: "wx_acid_shelter_in_place", label: "SHELTER IN PLACE ORDER", effects: { happiness: -3, unrest: 1, crime: -2 } },
    { id: "wx_acid_distribute_masks", label: "DISTRIBUTE PROTECTIVE GEAR", effects: { credits: -6000, medSupplies: -15, happiness: 3 } },
    { id: "wx_acid_ride_out", label: "RIDE IT OUT", effects: { happiness: -5, unrest: 4, lawOrder: -1 } },
  ],
  wx_smog_respiratory: [
    { id: "wx_smog_clinics", label: "MOBILE RESPIRATORY CLINICS", effects: { credits: -8000, medSupplies: -25, happiness: 4 } },
    { id: "wx_smog_industry_shutdown", label: "FORCE INDUSTRY SHUTDOWN", effects: { credits: -12000, happiness: 5, unrest: -3 } },
    { id: "wx_smog_air_filters", label: "EMERGENCY AIR FILTRATION", effects: { credits: -7000, power: -20, happiness: 3 } },
    { id: "wx_smog_blame_outsiders", label: "BLAME THE WASTELAND", effects: { happiness: -2, corruption: 3, unrest: 1 } },
  ],
  wx_grid_surge: [
    { id: "wx_grid_emergency_isolate", label: "ISOLATE CRITICAL SYSTEMS", effects: { credits: -8000, power: 30, happiness: -2 } },
    { id: "wx_grid_full_blackout", label: "PREEMPTIVE BLACKOUT", effects: { power: 50, happiness: -6, unrest: 4, crime: 3 } },
    { id: "wx_grid_overhaul", label: "RUSH HARDENING UPGRADE", effects: { credits: -20000, power: 20, happiness: 1 } },
    { id: "wx_grid_pray", label: "HOPE THE GRID HOLDS", effects: { power: -40, happiness: -4, unrest: 3 } },
  ],
  wx_drone_failure: [
    { id: "wx_drone_ground_fleet", label: "GROUND THE FLEET", effects: { credits: -3000, lawOrder: -3, crime: 2 } },
    { id: "wx_drone_manual_override", label: "MANUAL OVERRIDE PROTOCOL", effects: { credits: -8000, lawOrder: 1, happiness: -1 } },
    { id: "wx_drone_emp_shielding", label: "EMERGENCY EMP SHIELDING", effects: { credits: -15000, defenseRating: 2 } },
  ],
  wx_evacuation: [
    { id: "wx_evac_full", label: "FULL DISTRICT EVACUATION", effects: { credits: -25000, happiness: 4, unrest: -3, medSupplies: -20 } },
    { id: "wx_evac_voluntary", label: "VOLUNTARY EVACUATION", effects: { credits: -10000, happiness: 1, unrest: 2 } },
    { id: "wx_evac_seal", label: "SEAL THE DISTRICT", effects: { credits: -5000, happiness: -6, unrest: 5, lawOrder: 4, crime: -3 } },
    { id: "wx_evac_abandon", label: "WRITE IT OFF", effects: { happiness: -8, unrest: 7, lawOrder: -2, crime: 4 } },
  ],
  wx_crop_loss: [
    { id: "wx_crop_emergency_imports", label: "EMERGENCY FOOD IMPORTS", effects: { credits: -18000, food: 80, happiness: 2 } },
    { id: "wx_crop_synth_surge", label: "SYNTH-PROTEIN SURGE", effects: { credits: -8000, food: 50, happiness: -2, power: -15 } },
    { id: "wx_crop_ration", label: "MANDATE RATIONING", effects: { food: 20, happiness: -4, unrest: 3, lawOrder: 2 } },
    { id: "wx_crop_replant", label: "RAPID-CYCLE REPLANT", effects: { credits: -12000, food: 30 } },
  ],
  wx_construction_halt: [
    { id: "wx_const_halt_all", label: "HALT ALL CONSTRUCTION", effects: { credits: -8000, happiness: 2, unrest: -2 } },
    { id: "wx_const_indoor_only", label: "INDOOR WORK ONLY", effects: { credits: -3000, happiness: 1 } },
    { id: "wx_const_hazard_pay", label: "DOUBLE HAZARD PAY", effects: { credits: -15000, happiness: -3, unrest: 2 } },
    { id: "wx_const_force_continue", label: "PROJECTS CONTINUE", effects: { credits: -2000, happiness: -5, unrest: 4, crime: 1 } },
  ],
  wx_factory_fire: [
    { id: "wx_fire_emergency_response", label: "FULL EMERGENCY RESPONSE", effects: { credits: -15000, happiness: 3, unrest: -2 } },
    { id: "wx_fire_let_burn", label: "CONTROLLED BURN-OUT", effects: { credits: -5000, happiness: -3, unrest: 2 } },
    { id: "wx_fire_seize_industry", label: "NATIONALIZE THE SITE", effects: { credits: -8000, corruption: 3, happiness: 2, unrest: 1 } },
    { id: "wx_fire_blame_owner", label: "PROSECUTE THE OWNERS", effects: { credits: 4000, happiness: 4, lawOrder: 3, corruption: -2 } },
  ],
  wx_fungal_outbreak: [
    { id: "wx_fungal_quarantine", label: "QUARANTINE AFFECTED ZONES", effects: { credits: -8000, happiness: -4, unrest: 3, crime: -2, medSupplies: -15 } },
    { id: "wx_fungal_bio_spray", label: "ANTIFUNGAL SATURATION", effects: { credits: -12000, happiness: -2, medSupplies: -10 } },
    { id: "wx_fungal_burn_it", label: "CONTROLLED BURN", effects: { credits: -5000, happiness: -3, unrest: 2, food: -20 } },
    { id: "wx_fungal_harvest", label: "HARVEST THE SPORES", effects: { credits: -3000, medSupplies: 30, happiness: 1 } },
  ],
  wx_comms_blackout: [
    { id: "wx_comms_emergency_relay", label: "DEPLOY MOBILE RELAYS", effects: { credits: -10000, lawOrder: 2, happiness: 2 } },
    { id: "wx_comms_runners", label: "ACTIVATE COURIER NETWORK", effects: { credits: -2000, happiness: 1, employment: 1 } },
    { id: "wx_comms_martial_law", label: "PREEMPTIVE LOCKDOWN", effects: { happiness: -5, unrest: 3, lawOrder: 4, crime: -3 } },
    { id: "wx_comms_propaganda", label: "FLOOD ANALOG CHANNELS", effects: { credits: -4000, happiness: 1, corruption: 2, unrest: -1 } },
  ],
  wx_cult_surge: [
    { id: "wx_cult_suppress", label: "SUPPRESS THE GATHERINGS", effects: { credits: -6000, happiness: -4, unrest: 4, lawOrder: 3, crime: -2 } },
    { id: "wx_cult_observe", label: "INFILTRATE AND OBSERVE", effects: { credits: -4000, corruption: 1, lawOrder: 2 } },
    { id: "wx_cult_alternative", label: "STATE-SPONSORED VIGIL", effects: { credits: -5000, happiness: 3, unrest: -3 } },
    { id: "wx_cult_ignore", label: "IGNORE IT", effects: { happiness: -2, unrest: 2, crime: 2, corruption: 1 } },
  ],
  wx_thermal_crisis: [
    { id: "wx_therm_cooling_centers", label: "OPEN COOLING CENTERS", effects: { credits: -7000, power: -25, happiness: 4, unrest: -2 } },
    { id: "wx_therm_heating_centers", label: "OPEN WARMING CENTERS", effects: { credits: -7000, power: -25, happiness: 4, unrest: -2 } },
    { id: "wx_therm_water_distribution", label: "EMERGENCY WATER/RATIONS", effects: { credits: -6000, water: -30, food: -20, happiness: 3 } },
    { id: "wx_therm_industry_pause", label: "PAUSE NON-ESSENTIAL INDUSTRY", effects: { credits: -10000, power: 30, happiness: 2 } },
  ],
  wx_geological: [
    { id: "wx_geo_inspect_all", label: "FULL STRUCTURAL INSPECTION", effects: { credits: -12000, happiness: 3, unrest: -2 } },
    { id: "wx_geo_evacuate_towers", label: "EVACUATE HIGH-RISES", effects: { credits: -8000, happiness: -2, unrest: 1 } },
    { id: "wx_geo_emergency_repairs", label: "RAPID-RESPONSE REPAIRS", effects: { credits: -10000, happiness: 1 } },
    { id: "wx_geo_business_as_usual", label: "BUSINESS AS USUAL", effects: { happiness: -4, unrest: 3, crime: 1 } },
  ],
  faith_intro_ledger: [
    { id: "fil_charter", label: "CHARTER A TRADE TEMPLE", effects: { credits: -4000, happiness: 2, tradeIncome: 1, corruption: 1 } },
    { id: "fil_audit", label: "AUDIT THEM FIRST", effects: { credits: 2000, happiness: -1, lawOrder: 2, corruption: -1 } },
    { id: "fil_ignore", label: "TREAT THEM AS A GUILD", effects: { happiness: -1, lawOrder: 1 } },
  ],
  faith_intro_tidekeepers: [
    { id: "fit_endorse", label: "ENDORSE THEIR WATER WORK", effects: { happiness: 3, unrest: -2, water: 5 } },
    { id: "fit_grant", label: "FUND THE PRIESTHOOD", effects: { credits: -6000, happiness: 2, water: 10 } },
    { id: "fit_dismiss", label: "DISMISS AS SUPERSTITION", effects: { happiness: -2, unrest: 2 } },
  ],
  faith_intro_helix: [
    { id: "fih_charter", label: "CHARTER A SPLICE-RIG TEMPLE", effects: { credits: -3000, happiness: 3 } },
    { id: "fih_clinic_grant", label: "FUND SLUM CLINICS", effects: { credits: -7000, happiness: 2, medSupplies: 5 } },
    { id: "fih_quarantine", label: "QUARANTINE THE GENE-WORK", effects: { happiness: -1, lawOrder: 2 } },
    { id: "fih_outlaw", label: "OUTLAW SPLICE-WORSHIP", effects: { unrest: 3, happiness: -3, lawOrder: 4 } },
  ],
  faith_intro_choir: [
    { id: "fic_charter", label: "CHARTER A FREE CHOIR HALL", effects: { credits: -3000, happiness: 2, tradeIncome: 1, corruption: 1 } },
    { id: "fic_route_grant", label: "GRANT TRANSIT-PRIESTHOOD STATUS", effects: { credits: -5000, happiness: 1, tradeIncome: 2, corruption: 1 } },
    { id: "fic_tax", label: "TREAT THEM AS A SMUGGLING RING", effects: { credits: 3000, happiness: -2, lawOrder: 2, corruption: -1 } },
    { id: "fic_outlaw", label: "OUTLAW THE CHOIR", effects: { unrest: 3, happiness: -3, lawOrder: 3, tradeIncome: -2 } },
  ],
  faith_intro_catholicism: [
    { id: "ficat_charter", label: "CHARTER PARISH RELIEF", effects: { credits: -4000, happiness: 3, unrest: -2, medSupplies: 5 } },
    { id: "ficat_fund_aid", label: "FUND MUTUAL AID", effects: { credits: -8000, food: 20, medSupplies: 10, happiness: 2 } },
    { id: "ficat_audit", label: "AUDIT THE PARISH NETWORK", effects: { lawOrder: 2, corruption: -1, happiness: -1 } },
    { id: "ficat_restrict", label: "LIMIT PUBLIC ORGANIZING", effects: { lawOrder: 2, happiness: -2, unrest: 2 } },
  ],
  faith_choir_ledger_feud: [
    { id: "fclf_back_ledger", label: "BACK THE LEDGER", effects: { credits: -3000, lawOrder: 3, corruption: -2, tradeIncome: -1 } },
    { id: "fclf_back_choir", label: "BACK THE FREE CHOIR", effects: { credits: -3000, tradeIncome: 2, corruption: 2, lawOrder: -2 } },
    { id: "fclf_force_concord", label: "FORCE A COMMERCE CONCORD", effects: { credits: -8000, happiness: 2, unrest: -2 } },
    { id: "fclf_secularize", label: "EMERGENCY SECULAR DECREE", effects: { happiness: -3, unrest: 2, lawOrder: 3, tradeIncome: -2 } },
  ],
  faith_helix_flame_clash: [
    { id: "fhfc_back_flame", label: "BACK THE ETERNAL FLAME", effects: { credits: -4000, happiness: -3, unrest: 3, lawOrder: 3 } },
    { id: "fhfc_back_helix", label: "BACK THE HELIX COMMUNE", effects: { credits: -4000, happiness: 2, unrest: 3 } },
    { id: "fhfc_force_summit", label: "FORCE A FLESH-AND-FUEL SUMMIT", effects: { credits: -10000, happiness: 3, unrest: -3 } },
    { id: "fhfc_secularize", label: "EMERGENCY SECULAR DECREE", effects: { happiness: -4, unrest: 2, lawOrder: 4 } },
  ],
  faith_pilgrimage: [
    { id: "fp_welcome", label: "OPEN THE GATES", effects: { credits: -3000, happiness: 4, unrest: -2, tradeIncome: 1 } },
    { id: "fp_tax", label: "LEVY A PILGRIM TAX", effects: { credits: 8000, happiness: 1, corruption: 2 } },
    { id: "fp_screen", label: "SCREEN ARRIVALS", effects: { credits: -5000, happiness: 1, crime: -2, lawOrder: 2 } },
    { id: "fp_block", label: "CLOSE THE BORDERS", effects: { happiness: -4, unrest: 3, lawOrder: 1 } },
  ],
  faith_revival: [
    { id: "fr_attend", label: "MARSHAL ATTENDS PERSONALLY", effects: { happiness: 4, unrest: -2, corruption: 2 } },
    { id: "fr_sponsor", label: "STATE SPONSORSHIP", effects: { credits: -6000, happiness: 3, unrest: -2 } },
    { id: "fr_observe", label: "QUIETLY OBSERVE", effects: { credits: -2000, lawOrder: 1 } },
    { id: "fr_disperse", label: "DISPERSE THE GATHERING", effects: { happiness: -5, unrest: 4, lawOrder: 2, crime: -1 } },
  ],
  faith_inquisition: [
    { id: "fi_back_demand", label: "BACK THE INQUISITION", effects: { unrest: 4, lawOrder: 3, happiness: -3, crime: -2 } },
    { id: "fi_neutral", label: "REFUSE — STATE NEUTRALITY", effects: { happiness: 1, unrest: 2, corruption: -1 } },
    { id: "fi_offer_concession", label: "OFFER A SMALLER CONCESSION", effects: { credits: -8000, happiness: 1, unrest: -1, corruption: 1 } },
    { id: "fi_audit_temple", label: "AUDIT THE TEMPLE", effects: { credits: 4000, unrest: 2, lawOrder: 2, corruption: -2 } },
  ],
  faith_choir_strike: [
    { id: "fcs_relax_stance", label: "DOWNGRADE TO TOLERATE", effects: { unrest: -4, happiness: 3, employment: 2 } },
    { id: "fcs_replace_workers", label: "BREAK THE STRIKE", effects: { credits: -12000, happiness: -3, unrest: 3, crime: 2 } },
    { id: "fcs_arrest_leaders", label: "ARREST THE PRIESTHOOD", effects: { happiness: -5, unrest: 5, lawOrder: 4, employment: -1 } },
    { id: "fcs_negotiate", label: "BACK-CHANNEL DEAL", effects: { credits: -6000, happiness: 2, unrest: -2, corruption: 3 } },
  ],
  faith_ancestor_uprising: [
    { id: "fau_lift_suppression", label: "LIFT THE SUPPRESSION", effects: { unrest: -5, happiness: 3, crime: -2 } },
    { id: "fau_militarize_slums", label: "MILITARIZE THE SLUMS", effects: { credits: -10000, unrest: -2, happiness: -5, lawOrder: 5, crime: -4 } },
    { id: "fau_aid_program", label: "EMERGENCY AID PROGRAM", effects: { credits: -15000, food: -30, water: -30, happiness: 5, unrest: -4 } },
    { id: "fau_blame_outsiders", label: "BLAME EXTERNAL AGITATORS", effects: { unrest: 1, happiness: -1, corruption: 3 } },
  ],
  faith_holy_war: [
    { id: "fhw_back_one", label: "BACK THE STRONGER FAITH", effects: { credits: -5000, happiness: -2, unrest: 4, lawOrder: 3 } },
    { id: "fhw_force_summit", label: "FORCE A PEACE SUMMIT", effects: { credits: -10000, happiness: 3, unrest: -3 } },
    { id: "fhw_secularize", label: "EMERGENCY SECULAR DECREE", effects: { happiness: -4, unrest: 3, lawOrder: 4, corruption: -1 } },
    { id: "fhw_let_burn", label: "LET THEM FIGHT IT OUT", effects: { unrest: 6, crime: 4, happiness: -5, lawOrder: -2 } },
  ],
  faith_apostate: [
    { id: "fa_sponsor_one", label: "SPONSOR ANY FAITH", effects: { credits: -3000, happiness: 3, unrest: -3 } },
    { id: "fa_promote_secular", label: "PROMOTE SECULAR CIVIC RELIGION", effects: { credits: -8000, happiness: 2, lawOrder: 2, corruption: 2 } },
    { id: "fa_suppress_apostates", label: "SUPPRESS THE APOSTATES", effects: { credits: -5000, unrest: 2, lawOrder: 3, happiness: -2, corruption: 3 } },
    { id: "fa_ignore", label: "LET THE VACUUM GROW", effects: { happiness: -2, unrest: 2, crime: 2 } },
  ],
  faith_relic: [
    { id: "frl_state_museum", label: "STATE MUSEUM ACQUISITION", effects: { credits: -10000, happiness: 4, tradeIncome: 1 } },
    { id: "frl_grant_temple", label: "GRANT IT TO THE TEMPLE", effects: { credits: -2000, happiness: 5, unrest: -3, corruption: 1 } },
    { id: "frl_research", label: "SECRET RESEARCH SEIZURE", effects: { credits: -5000, happiness: -1, corruption: 3 } },
    { id: "frl_auction", label: "OFF-WORLD AUCTION", effects: { credits: 25000, happiness: -6, unrest: 4, corruption: 4 } },
  ],
  faith_tithe: [
    { id: "ft_grant_exemption", label: "GRANT TAX EXEMPTION", effects: { credits: -8000, happiness: 3, unrest: -2, corruption: 1 } },
    { id: "ft_partial", label: "PARTIAL EXEMPTION", effects: { credits: -3000, happiness: 1, unrest: -1 } },
    { id: "ft_full_tax", label: "TAX TITHES IN FULL", effects: { credits: 12000, happiness: -4, unrest: 3 } },
    { id: "ft_seize", label: "SEIZE THE TEMPLE TREASURY", effects: { credits: 30000, happiness: -7, unrest: 6, lawOrder: 2, corruption: -2 } },
  ],
  faith_doomsday: [
    { id: "fd_arrest", label: "ARREST THE PROPHET", effects: { credits: -2000, happiness: -2, unrest: 2, lawOrder: 3, crime: -1 } },
    { id: "fd_debunk", label: "OFFICIAL DEBUNK CAMPAIGN", effects: { credits: -6000, happiness: 1, unrest: -2 } },
    { id: "fd_co_opt", label: "CO-OPT THE MOVEMENT", effects: { credits: -4000, happiness: -1, unrest: -3, corruption: 4 } },
    { id: "fd_ignore", label: "IGNORE — IT WILL PASS", effects: { happiness: -1, unrest: 2, crime: 1 } },
  ],
  faith_temple_request: [
    { id: "ftr_approve_full", label: "APPROVE — STATE FUNDS THE BUILD", effects: { credits: -20000, happiness: 5, unrest: -3, corruption: 1 } },
    { id: "ftr_approve_self_fund", label: "APPROVE — TEMPLE PAYS", effects: { credits: -2000, happiness: 3, unrest: -1 } },
    { id: "ftr_delay", label: "BUREAUCRATIC DELAY", effects: { happiness: -2, unrest: 1, corruption: 2 } },
    { id: "ftr_deny", label: "DENY THE PERMIT", effects: { happiness: -4, unrest: 3, lawOrder: 1 } },
  ],
  faith_corruption_scandal: [
    { id: "fcs_public_trial", label: "PUBLIC TRIAL — FULL TRANSPARENCY", effects: { credits: -3000, corruption: -5, lawOrder: 4, happiness: 3, unrest: -2 } },
    { id: "fcs_quiet_removal", label: "QUIET REMOVAL", effects: { credits: -2000, corruption: -2, happiness: 1 } },
    { id: "fcs_protect_priest", label: "PROTECT THE PRIEST", effects: { credits: -5000, corruption: 5, happiness: -3, unrest: 2 } },
    { id: "fcs_seize_temple", label: "SEIZE TEMPLE ASSETS", effects: { credits: 25000, happiness: -6, unrest: 5, corruption: -3 } },
  ],
  edu_literacy_milestone: [
    { id: "elm_celebrate", label: "PUBLIC CELEBRATION", effects: { credits: -3000, happiness: 5, unrest: -2 } },
    { id: "elm_invest_more", label: "DOUBLE DOWN — EXPAND PROGRAMS", effects: { credits: -10000, happiness: 4, employment: 1 } },
    { id: "elm_quiet_pride", label: "QUIET ACKNOWLEDGEMENT", effects: { happiness: 2 } },
  ],
  edu_literacy_collapse: [
    { id: "elc_emergency_program", label: "EMERGENCY LITERACY DRIVE", effects: { credits: -15000, happiness: 3, unrest: -3, employment: 1 } },
    { id: "elc_propaganda_boost", label: "STATE LITERATURE — MANDATORY READING", effects: { credits: -4000, happiness: -1, corruption: 2, lawOrder: 1 } },
    { id: "elc_blame_predecessors", label: "BLAME PRIOR ADMINISTRATION", effects: { happiness: -2, unrest: 1, corruption: 2 } },
    { id: "elc_ignore", label: "IGNORE — FOCUS ON OUTPUT", effects: { happiness: -4, unrest: 3, crime: 2 } },
  ],
  edu_teacher_strike: [
    { id: "ets_meet_demands", label: "MEET THEIR DEMANDS", effects: { credits: -12000, happiness: 4, unrest: -4, employment: 2 } },
    { id: "ets_partial_offer", label: "PARTIAL CONCESSIONS", effects: { credits: -5000, happiness: 1, unrest: -1 } },
    { id: "ets_break_strike", label: "BREAK THE STRIKE", effects: { credits: -4000, happiness: -4, unrest: 3, lawOrder: 2, employment: -1 } },
    { id: "ets_close_schools", label: "INDEFINITE CLOSURE", effects: { happiness: -5, unrest: 4, crime: 2 } },
  ],
  edu_student_protest: [
    { id: "esp_dialogue", label: "OPEN DIALOGUE", effects: { credits: -2000, happiness: 3, unrest: -3 } },
    { id: "esp_concede_reform", label: "ANNOUNCE REFORMS", effects: { credits: -6000, happiness: 4, unrest: -4, corruption: 1 } },
    { id: "esp_disperse", label: "DISPERSE THE CROWDS", effects: { happiness: -5, unrest: 4, lawOrder: 3, crime: -1 } },
    { id: "esp_infiltrate", label: "INFILTRATE THE MOVEMENT", effects: { credits: -4000, corruption: 3, unrest: -2, lawOrder: 2 } },
  ],
  edu_brain_drain: [
    { id: "ebd_retention_bonus", label: "RETENTION BONUSES", effects: { credits: -15000, happiness: 2, employment: 2, tradeIncome: 1 } },
    { id: "ebd_exit_tax", label: "EXIT TAX ON EMIGRATION", effects: { credits: 8000, happiness: -4, unrest: 3, lawOrder: 1 } },
    { id: "ebd_recruit_back", label: "REPATRIATION CAMPAIGN", effects: { credits: -10000, happiness: 1, employment: 1 } },
    { id: "ebd_accept_loss", label: "LET THEM GO", effects: { happiness: -2, employment: -2, tradeIncome: -2 } },
  ],
  edu_breakthrough_paper: [
    { id: "ebp_publish_state", label: "STATE-BRANDED PUBLICATION", effects: { credits: 5000, happiness: 3, tradeIncome: 1 } },
    { id: "ebp_classify", label: "CLASSIFY THE FINDINGS", effects: { credits: -2000, defenseRating: 2, happiness: -1, corruption: 1 } },
    { id: "ebp_commercialize", label: "LICENSE TO INDUSTRY", effects: { credits: 12000, tradeIncome: 2, happiness: -1, corruption: 2 } },
  ],
  edu_exam_scandal: [
    { id: "ees_full_audit", label: "FULL EXAM AUDIT", effects: { credits: -8000, corruption: -5, lawOrder: 3, happiness: 2, unrest: -1 } },
    { id: "ees_quiet_voids", label: "QUIETLY VOID THE WORST", effects: { credits: -3000, corruption: -2, happiness: -1 } },
    { id: "ees_blame_students", label: "BLAME THE STUDENTS", effects: { happiness: -3, unrest: 2, corruption: 3, lawOrder: 1 } },
    { id: "ees_cover_up", label: "BURY THE STORY", effects: { credits: -5000, corruption: 5, happiness: -2 } },
  ],
  edu_curriculum_dispute: [
    { id: "ecd_secular", label: "SECULAR CURRICULUM ENFORCED", effects: { happiness: -2, unrest: 2, lawOrder: 2, corruption: -1 } },
    { id: "ecd_faith_inclusive", label: "FAITH-INCLUSIVE TRACKS", effects: { credits: -4000, happiness: 3, unrest: -2, corruption: 2 } },
    { id: "ecd_let_temples_run", label: "DEVOLVE TO TEMPLES", effects: { credits: -6000, happiness: 4, unrest: -3, lawOrder: -2, corruption: 3 } },
    { id: "ecd_close_debate", label: "REFUSE TO RULE", effects: { happiness: -2, unrest: 2 } },
  ],
  edu_field_school_expedition: [
    { id: "efs_fund_expedition", label: "FUND THE EXPEDITION", effects: { credits: -8000, happiness: 3, defenseRating: 2 } },
    { id: "efs_classified_mission", label: "ATTACH AN INTEL OBJECTIVE", effects: { credits: -5000, defenseRating: 3, corruption: 2 } },
    { id: "efs_decline", label: "DECLINE THE REQUEST", effects: { happiness: -2 } },
  ],
  edu_marine_school_incident: [
    { id: "emi_full_inquiry", label: "FULL INQUIRY", effects: { credits: -6000, happiness: 3, unrest: -2, lawOrder: 2 } },
    { id: "emi_quiet_settlement", label: "QUIET SETTLEMENT", effects: { credits: -10000, corruption: 3, happiness: -1 } },
    { id: "emi_blame_cadets", label: "BLAME THE CADETS", effects: { happiness: -3, unrest: 2, corruption: 3, lawOrder: 1 } },
    { id: "emi_close_school", label: "SHUTTER THE SCHOOL", effects: { credits: -4000, happiness: -2, defenseRating: -2, employment: -1 } },
  ],
  edu_mass_dropout: [
    { id: "emd_outreach", label: "DOOR-TO-DOOR OUTREACH", effects: { credits: -14000, happiness: 4, unrest: -3, employment: 2, crime: -2 } },
    { id: "emd_compulsory", label: "COMPULSORY ATTENDANCE LAW", effects: { credits: -3000, happiness: -4, unrest: 2, lawOrder: 3, crime: -3 } },
    { id: "emd_apprentice_track", label: "DIVERT TO APPRENTICESHIPS", effects: { credits: -7000, happiness: 2, employment: 3, unrest: -2 } },
    { id: "emd_ignore", label: "ACCEPT THE NEW NORMAL", effects: { happiness: -3, unrest: 3, crime: 3 } },
  ],
  edu_prodigy_discovered: [
    { id: "epd_state_patronage", label: "STATE PATRONAGE", effects: { credits: -5000, happiness: 4, tradeIncome: 1 } },
    { id: "epd_research_track", label: "FAST-TRACK TO RESEARCH", effects: { credits: -3000, happiness: 2, defenseRating: 1, corruption: 1 } },
    { id: "epd_celebrity_tour", label: "PUBLIC CELEBRITY TOUR", effects: { credits: 6000, happiness: 5 } },
    { id: "epd_ignore", label: "LEAVE THEM BE", effects: { happiness: 1 } },
  ],
  spo_championship_won: [
    { id: "spo_cw_parade", label: "CITY-WIDE VICTORY PARADE", effects: { credits: -6000, happiness: 7, unrest: -3 } },
    { id: "spo_cw_state_bonus", label: "STATE BONUS TO ROSTER", effects: { credits: -10000, happiness: 4 } },
    { id: "spo_cw_acknowledge", label: "ACKNOWLEDGE BRIEFLY", effects: { happiness: 2 } },
  ],
  spo_championship_lost: [
    { id: "spo_cl_morale_program", label: "MORALE RECOVERY PROGRAM", effects: { credits: -5000, happiness: 2, unrest: -2 } },
    { id: "spo_cl_blame_coach", label: "BLAME THE COACH", effects: { credits: -2000, happiness: -1, corruption: 1 } },
    { id: "spo_cl_ignore", label: "MOVE ON", effects: { happiness: -2, unrest: 1 } },
  ],
  spo_match_riot: [
    { id: "spo_mr_riot_squads", label: "DEPLOY RIOT SQUADS", effects: { credits: -6000, unrest: -3, lawOrder: 3, happiness: -2, crime: -2 } },
    { id: "spo_mr_alcohol_ban", label: "MATCH-DAY ALCOHOL BAN", effects: { credits: -1000, unrest: -2, happiness: -3, lawOrder: 1 } },
    { id: "spo_mr_close_terraces", label: "CLOSE THE TERRACES", effects: { credits: -8000, unrest: -3, happiness: -4, tradeIncome: -1 } },
    { id: "spo_mr_ignore", label: "LET THEM VENT", effects: { unrest: 2, crime: 3, happiness: -1 } },
  ],
  spo_doping_scandal: [
    { id: "spo_ds_lifetime_bans", label: "LIFETIME BANS, FULL DISCLOSURE", effects: { credits: -3000, corruption: -3, lawOrder: 2, happiness: -2 } },
    { id: "spo_ds_quiet_suspensions", label: "QUIET SUSPENSIONS", effects: { credits: -2000, corruption: -1, happiness: -1 } },
    { id: "spo_ds_legalize", label: "LEGALIZE PERFORMANCE PROGRAMS", effects: { credits: 5000, happiness: -1, corruption: 3, tradeIncome: 1 } },
    { id: "spo_ds_cover_up", label: "BURY THE STORY", effects: { credits: -4000, corruption: 5, happiness: -1 } },
  ],
  spo_star_athlete_emerges: [
    { id: "spo_sa_state_contract", label: "STATE-EXCLUSIVE CONTRACT", effects: { credits: -12000, happiness: 4, tradeIncome: 1 } },
    { id: "spo_sa_propaganda_face", label: "PROPAGANDA POSTER CHILD", effects: { credits: -4000, happiness: 5, corruption: 1 } },
    { id: "spo_sa_let_them_play", label: "LET THE MARKET DECIDE", effects: { happiness: 1, tradeIncome: -1 } },
  ],
  spo_athlete_defection: [
    { id: "spo_ad_match_offer", label: "MATCH THE FOREIGN OFFER", effects: { credits: -15000, happiness: 3, employment: 1 } },
    { id: "spo_ad_exit_block", label: "BLOCK THE TRANSFER", effects: { happiness: -2, unrest: 2, lawOrder: 2, corruption: 2 } },
    { id: "spo_ad_let_them_go", label: "WAVE THEM OFF", effects: { happiness: -2 } },
  ],
  spo_underground_fight_ring: [
    { id: "spo_uf_raid", label: "RAID THE RINGS", effects: { credits: -5000, crime: -3, lawOrder: 3, unrest: 1 } },
    { id: "spo_uf_legalize", label: "LICENSE AND TAX", effects: { credits: 8000, crime: -1, corruption: 2, happiness: 1, tradeIncome: 1 } },
    { id: "spo_uf_protect_for_cut", label: "TAKE A CUT, LOOK AWAY", effects: { credits: 6000, corruption: 5, crime: 1 } },
    { id: "spo_uf_ignore", label: "IGNORE", effects: { crime: 2, happiness: 1 } },
  ],
  spo_stadium_collapse: [
    { id: "spo_sc_full_inquiry", label: "INDEPENDENT INQUIRY", effects: { credits: -10000, corruption: -3, lawOrder: 2, happiness: 2, unrest: -1 } },
    { id: "spo_sc_quiet_settlement", label: "QUIET SETTLEMENT", effects: { credits: -15000, corruption: 3, happiness: -1 } },
    { id: "spo_sc_blame_contractor", label: "BLAME THE CONTRACTOR", effects: { credits: -5000, corruption: 3, happiness: -3, unrest: 2 } },
    { id: "spo_sc_state_funeral", label: "STATE FUNERAL, REBUILD BIGGER", effects: { credits: -20000, happiness: 4, unrest: -3, employment: 1 } },
  ],
  spo_olympic_bid: [
    { id: "spo_ob_full_bid", label: "FULL OLYMPIC BID", effects: { credits: -25000, happiness: 5, tradeIncome: 2, employment: 2 } },
    { id: "spo_ob_partner_bid", label: "JOINT BID WITH NEIGHBORING CITY", effects: { credits: -10000, happiness: 3, tradeIncome: 1 } },
    { id: "spo_ob_decline", label: "DECLINE THE BID", effects: { happiness: -2 } },
  ],
  spo_match_fixing: [
    { id: "spo_mf_full_purge", label: "PURGE THE LEAGUE", effects: { credits: -8000, corruption: -5, lawOrder: 3, happiness: -3, unrest: 1 } },
    { id: "spo_mf_targeted_arrests", label: "ARREST THE FIXERS", effects: { credits: -5000, corruption: -2, crime: -2, lawOrder: 2 } },
    { id: "spo_mf_state_cartel", label: "STATE TAKES OVER THE BOOK", effects: { credits: 12000, corruption: 4, crime: -1, happiness: -1 } },
    { id: "spo_mf_ignore", label: "IGNORE", effects: { corruption: 3, crime: 2, happiness: -1 } },
  ],
  spo_grassroots_league: [
    { id: "spo_gl_fund", label: "FUND THE LEAGUE", effects: { credits: -6000, happiness: 4, unrest: -2, crime: -1 } },
    { id: "spo_gl_corporate_sponsor", label: "OUTSOURCE TO CORPORATE SPONSORS", effects: { credits: 3000, happiness: 2, corruption: 1, tradeIncome: 1 } },
    { id: "spo_gl_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
  spo_youth_riot: [
    { id: "spo_yr_youth_program", label: "EMERGENCY YOUTH PROGRAM", effects: { credits: -10000, crime: -3, unrest: -3, happiness: 3, employment: 1 } },
    { id: "spo_yr_curfew", label: "STRICT YOUTH CURFEW", effects: { credits: -3000, crime: -3, unrest: 2, happiness: -3, lawOrder: 3 } },
    { id: "spo_yr_mass_arrests", label: "MASS ARRESTS", effects: { credits: -5000, crime: -4, unrest: 4, happiness: -4, lawOrder: 4 } },
    { id: "spo_yr_ignore", label: "RIDE IT OUT", effects: { crime: 3, unrest: 3, happiness: -2 } },
  ],
  cb_endorsement_offer: [
    { id: "cb_eo_accept", label: "ACCEPT THE ENDORSEMENT", effects: { credits: -8000, happiness: 4, corruption: 1 } },
    { id: "cb_eo_state_contract", label: "EXCLUSIVE STATE CONTRACT", effects: { credits: -18000, happiness: 5, tradeIncome: 1, corruption: 2 } },
    { id: "cb_eo_decline", label: "POLITELY DECLINE", effects: { happiness: -1 } },
  ],
  cb_celebrity_overdose: [
    { id: "cb_co_state_funeral", label: "STATE FUNERAL", effects: { credits: -6000, happiness: 3, unrest: -2 } },
    { id: "cb_co_drug_crackdown", label: "USE IT FOR A CRACKDOWN", effects: { credits: -8000, crime: -3, lawOrder: 3, happiness: -2, unrest: 1 } },
    { id: "cb_co_quiet_burial", label: "QUIET PRIVATE BURIAL", effects: { happiness: -1 } },
  ],
  cb_celebrity_political_run: [
    { id: "cb_cpr_endorse", label: "ENDORSE THE CANDIDACY", effects: { credits: -3000, happiness: 5, lawOrder: -2, corruption: 2 } },
    { id: "cb_cpr_block", label: "BLOCK THE CANDIDACY", effects: { credits: -2000, happiness: -3, unrest: 3, lawOrder: 2, corruption: 2 } },
    { id: "cb_cpr_co_opt", label: "OFFER A QUIET POSITION", effects: { credits: -8000, happiness: 2, corruption: 3 } },
    { id: "cb_cpr_ignore", label: "IGNORE", effects: { happiness: -1, unrest: 1 } },
  ],
  cb_paparazzi_scandal: [
    { id: "cb_ps_press_law", label: "PASS A PRIVACY LAW", effects: { credits: 2000, happiness: 2, lawOrder: 2, corruption: 1 } },
    { id: "cb_ps_arrest_paparazzi", label: "ARREST THE PAPARAZZI", effects: { credits: -1000, happiness: 1, lawOrder: 1, unrest: 1, corruption: 2 } },
    { id: "cb_ps_let_market_run", label: "FREE PRESS, FREE MARKET", effects: { happiness: -1 } },
  ],
  cb_charity_initiative: [
    { id: "cb_ci_state_partnership", label: "STATE PARTNERSHIP", effects: { credits: -10000, happiness: 5, unrest: -2, employment: 1 } },
    { id: "cb_ci_audit_first", label: "AUDIT BEFORE PARTNERING", effects: { credits: -2000, corruption: -1, happiness: 1 } },
    { id: "cb_ci_decline", label: "DECLINE PARTNERSHIP", effects: { happiness: 1 } },
  ],
  cb_propaganda_collaboration: [
    { id: "cb_pc_full_collab", label: "FULL STATE BROADCAST DEAL", effects: { credits: -8000, happiness: 4, lawOrder: 2, corruption: 2 } },
    { id: "cb_pc_quiet_funding", label: "FUND QUIETLY", effects: { credits: -6000, happiness: 3, corruption: 4 } },
    { id: "cb_pc_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
  cb_celebrity_assassination_attempt: [
    { id: "cb_caa_state_protection", label: "ASSIGN STATE PROTECTION", effects: { credits: -8000, happiness: 4, lawOrder: 2, unrest: -2 } },
    { id: "cb_caa_full_investigation", label: "FULL INVESTIGATION", effects: { credits: -5000, crime: -2, lawOrder: 3, defenseRating: 1 } },
    { id: "cb_caa_use_for_crackdown", label: "WEAPONIZE THE INCIDENT", effects: { credits: -3000, lawOrder: 3, unrest: 3, happiness: -3, corruption: 3 } },
    { id: "cb_caa_quiet_response", label: "QUIET RESPONSE", effects: { credits: -2000, happiness: -1, corruption: 1 } },
  ],
  cb_reality_show_proposal: [
    { id: "cb_rs_approve_state", label: "STATE-PRODUCED REALITY SHOW", effects: { credits: 8000, happiness: 4, corruption: 2, tradeIncome: 1 } },
    { id: "cb_rs_license_private", label: "LICENSE TO PRIVATE STUDIO", effects: { credits: 4000, happiness: 3, corruption: 1 } },
    { id: "cb_rs_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
  cb_celebrity_tax_evasion: [
    { id: "cb_te_full_prosecution", label: "FULL PROSECUTION", effects: { credits: 12000, corruption: -3, lawOrder: 3, happiness: -2, unrest: 2 } },
    { id: "cb_te_settle_quietly", label: "SETTLE FOR THE BACK TAXES", effects: { credits: 8000, corruption: 2, happiness: 1 } },
    { id: "cb_te_pardon", label: "STATE PARDON", effects: { credits: 5000, corruption: 5, happiness: 2, lawOrder: -2 } },
  ],
  cb_pop_idol_emerges: [
    { id: "cb_pi_state_label", label: "STATE-OWNED LABEL", effects: { credits: 10000, happiness: 4, corruption: 2, tradeIncome: 1 } },
    { id: "cb_pi_let_market", label: "FREE MARKET", effects: { happiness: 2, tradeIncome: 1 } },
    { id: "cb_pi_civic_mascot", label: "DECLARE A CIVIC MASCOT", effects: { credits: -2000, happiness: 5 } },
  ],
  cb_celebrity_marriage_event: [
    { id: "cb_cm_civic_holiday", label: "DECLARE A CIVIC HOLIDAY", effects: { credits: -8000, happiness: 6, unrest: -2 } },
    { id: "cb_cm_state_gift", label: "STATE WEDDING GIFT", effects: { credits: -3000, happiness: 3 } },
    { id: "cb_cm_ignore", label: "NO STATE RESPONSE", effects: { happiness: -1 } },
  ],
  cb_anti_state_song: [
    { id: "cb_as_ban_and_arrest", label: "BAN THE SONG, ARREST THE ARTIST", effects: { credits: -2000, unrest: 4, happiness: -4, lawOrder: 3, corruption: 2, crime: 1 } },
    { id: "cb_as_counter_propaganda", label: "STATE-FUNDED COUNTER-SONG", effects: { credits: -6000, unrest: -2, happiness: 1, corruption: 2 } },
    { id: "cb_as_co_opt_artist", label: "BUY THE ARTIST", effects: { credits: -10000, unrest: -3, happiness: 1, corruption: 4 } },
    { id: "cb_as_ignore", label: "IGNORE", effects: { unrest: 2, happiness: -1 } },
  ],
  pri_overcrowding: [
    { id: "pri_oc_build_complex", label: "COMMISSION CAPACITY EXPANSION", effects: { credits: -25000, lawOrder: 2, employment: 1, unrest: -2 } },
    { id: "pri_oc_mass_release", label: "REVIEW SENTENCING POLICY", effects: { credits: -3000, crime: 3, happiness: 2, lawOrder: -2 } },
    { id: "pri_oc_double_up", label: "DOUBLE-BUNK EVERY CELL", effects: { credits: -1000, unrest: 3, happiness: -2, lawOrder: 1 } },
    { id: "pri_oc_offshore", label: "NEGOTIATE REGIONAL CAPACITY", effects: { credits: -10000, unrest: -1, corruption: 2, tradeIncome: -1 } },
  ],
  pri_riot: [
    { id: "pri_r_storm_block", label: "STORM THE BLOCK", effects: { credits: -8000, lawOrder: 4, unrest: -3, happiness: -3, crime: -2 } },
    { id: "pri_r_negotiate", label: "NEGOTIATE WITH RINGLEADERS", effects: { credits: -4000, unrest: -2, happiness: 1, lawOrder: -1 } },
    { id: "pri_r_starve_out", label: "STARVE THEM OUT", effects: { credits: -2000, lawOrder: 2, happiness: -3, unrest: 1, medSupplies: -10 } },
    { id: "pri_r_full_lockdown", label: "CITYWIDE PRISON LOCKDOWN", effects: { credits: -3000, lawOrder: 3, unrest: 2, happiness: -2 } },
  ],
  pri_escape: [
    { id: "pri_e_full_manhunt", label: "FULL MANHUNT", effects: { credits: -10000, crime: -3, lawOrder: 3, happiness: -1 } },
    { id: "pri_e_bounty", label: "PUBLIC BOUNTY", effects: { credits: -4000, crime: -2, corruption: 2, lawOrder: 1 } },
    { id: "pri_e_warden_purge", label: "PURGE THE WARDEN STAFF", effects: { credits: -3000, corruption: -3, lawOrder: 1, employment: -1 } },
    { id: "pri_e_cover_up", label: "BURY THE STORY", effects: { credits: -2000, corruption: 5, happiness: 1, crime: 2 } },
  ],
  pri_corrupt_warden: [
    { id: "pri_cw_full_prosecution", label: "FULL PROSECUTION", effects: { credits: 4000, corruption: -4, lawOrder: 3, happiness: 2 } },
    { id: "pri_cw_quiet_dismissal", label: "QUIET DISMISSAL", effects: { credits: -1000, corruption: -1, happiness: -1 } },
    { id: "pri_cw_take_a_cut", label: "TAKE A CUT, KEEP THEM", effects: { credits: 6000, corruption: 5, crime: 2, happiness: -2 } },
  ],
  pri_hunger_strike: [
    { id: "pri_hs_concede", label: "CONCEDE TO DEMANDS", effects: { credits: -6000, happiness: 3, unrest: -2, lawOrder: -1 } },
    { id: "pri_hs_force_feed", label: "AUTHORIZE FORCE-FEEDING", effects: { credits: -3000, unrest: 3, happiness: -3, lawOrder: 2, corruption: 2 } },
    { id: "pri_hs_isolate_leaders", label: "ISOLATE THE LEADERS", effects: { credits: -1000, lawOrder: 2, happiness: -2, unrest: 1 } },
    { id: "pri_hs_ignore", label: "LET THEM STARVE", effects: { unrest: 3, happiness: -3, crime: 1 } },
  ],
  pri_celebrity_inmate: [
    { id: "pri_ci_special_block", label: "SEGREGATED VIP BLOCK", effects: { credits: -5000, corruption: 3, happiness: 1 } },
    { id: "pri_ci_general_pop", label: "GENERAL POPULATION", effects: { happiness: 3, lawOrder: 2, crime: 1, unrest: 1 } },
    { id: "pri_ci_quiet_pardon", label: "QUIET STATE PARDON", effects: { credits: 8000, corruption: 5, lawOrder: -2, happiness: -1 } },
  ],
  pri_forced_labor_proposal: [
    { id: "pri_fl_full_program", label: "AUTHORIZE FORCED LABOR", effects: { credits: 12000, employment: -2, corruption: 3, happiness: -2, unrest: 2 } },
    { id: "pri_fl_voluntary", label: "VOLUNTARY WORK PROGRAM", effects: { credits: -3000, happiness: 3, employment: 1, crime: -1 } },
    { id: "pri_fl_decline", label: "DECLINE THE PROPOSAL", effects: { credits: -1000 } },
  ],
  pri_radicalization_ring: [
    { id: "pri_rr_break_up", label: "BREAK UP THE NETWORK", effects: { credits: -6000, crime: -2, lawOrder: 2, happiness: -1 } },
    { id: "pri_rr_full_purge", label: "MASS TRANSFER AND ISOLATION", effects: { credits: -10000, crime: -3, unrest: 3, lawOrder: 3, happiness: -2 } },
    { id: "pri_rr_infiltrate", label: "RUN INFORMANTS INSIDE", effects: { credits: -3000, crime: 1, corruption: 2, defenseRating: 1 } },
    { id: "pri_rr_ignore", label: "IGNORE", effects: { crime: 3, unrest: 2 } },
  ],
  pri_wrongful_conviction: [
    { id: "pri_wc_full_review", label: "INDEPENDENT REVIEW BOARD", effects: { credits: -12000, corruption: -3, lawOrder: -1, happiness: 4, unrest: -2 } },
    { id: "pri_wc_quiet_release", label: "QUIET RELEASE, SEALED FILE", effects: { credits: -3000, happiness: 1, corruption: 2 } },
    { id: "pri_wc_deny", label: "DENY THE EVIDENCE", effects: { credits: -2000, corruption: 4, happiness: -3, unrest: 2 } },
  ],
  pri_juvenile_pipeline: [
    { id: "pri_jp_diversion", label: "JUVENILE DIVERSION PROGRAM", effects: { credits: -12000, crime: -3, happiness: 3, employment: 2, unrest: -1 } },
    { id: "pri_jp_dedicated_facility", label: "DEDICATED JUVENILE FACILITY", effects: { credits: -18000, crime: -2, happiness: 2, lawOrder: 1 } },
    { id: "pri_jp_charge_as_adults", label: "CHARGE AS ADULTS", effects: { credits: 2000, crime: -2, happiness: -3, unrest: 2, lawOrder: 2 } },
    { id: "pri_jp_ignore", label: "IGNORE", effects: { crime: 3, happiness: -2 } },
  ],
  pri_amnesty_petition: [
    { id: "pri_ap_grant_broad", label: "GRANT BROAD AMNESTY", effects: { credits: -4000, happiness: 5, crime: 4, unrest: -3, lawOrder: -3 } },
    { id: "pri_ap_grant_narrow", label: "NARROW AMNESTY", effects: { credits: -2000, happiness: 3, unrest: -1, crime: 1 } },
    { id: "pri_ap_decline", label: "DECLINE", effects: { happiness: -2, unrest: 2 } },
  ],
  pri_private_contract_offer: [
    { id: "pri_pc_accept", label: "PRIVATIZE OPERATIONS", effects: { credits: 15000, corruption: 4, happiness: -2, lawOrder: -2, employment: -1 } },
    { id: "pri_pc_partial", label: "PARTIAL CONTRACT", effects: { credits: 4000, corruption: 1 } },
    { id: "pri_pc_decline", label: "DECLINE", effects: { lawOrder: 1 } },
  ],
  swr_main_collapse: [
    { id: "swr_mc_emergency_rebuild", label: "EMERGENCY REBUILD", effects: { credits: -25000, happiness: 3, employment: 2, unrest: -2 } },
    { id: "swr_mc_patch_only", label: "PATCH AND PRAY", effects: { credits: -6000, happiness: -2, unrest: 1 } },
    { id: "swr_mc_evacuate_district", label: "EVACUATE THE AFFECTED DISTRICT", effects: { credits: -12000, happiness: -3, unrest: 2 } },
    { id: "swr_mc_corporate_contract", label: "EMERGENCY CORPORATE CONTRACT", effects: { credits: -35000, happiness: 4, corruption: 3, employment: 1 } },
  ],
  swr_disease_outbreak: [
    { id: "swr_do_quarantine", label: "QUARANTINE THE LOWER DISTRICTS", effects: { credits: -12000, happiness: -3, unrest: 2, medSupplies: -20, lawOrder: 2 } },
    { id: "swr_do_mass_treatment", label: "MASS TREATMENT CAMPAIGN", effects: { credits: -18000, happiness: 4, medSupplies: -40, unrest: -2 } },
    { id: "swr_do_blame_residents", label: "BLAME RESIDENT BEHAVIOR", effects: { credits: -2000, happiness: -3, unrest: 2, corruption: 2 } },
    { id: "swr_do_ignore", label: "RIDE IT OUT", effects: { happiness: -4, unrest: 3, crime: 1 } },
  ],
  swr_flood_backup: [
    { id: "swr_fb_storm_drains", label: "BUILD STORM DRAIN SYSTEMS", effects: { credits: -22000, happiness: 3, employment: 2 } },
    { id: "swr_fb_pumping_crews", label: "EMERGENCY PUMPING CREWS", effects: { credits: -8000, happiness: 1, water: -10 } },
    { id: "swr_fb_relocate_lowlands", label: "RELOCATE LOWLAND HOUSING", effects: { credits: -15000, happiness: -2, unrest: 1 } },
    { id: "swr_fb_ignore", label: "LET IT DRAIN ON ITS OWN", effects: { happiness: -3, unrest: 2 } },
  ],
  swr_undercity_methane: [
    { id: "swr_um_ventilation", label: "VENTILATION RETROFIT", effects: { credits: -16000, happiness: 3, unrest: -2 } },
    { id: "swr_um_controlled_burn", label: "CONTROLLED BURN-OFF", effects: { credits: -4000, happiness: 1, unrest: 1, defenseRating: -1 } },
    { id: "swr_um_evacuate", label: "EVACUATE THE TUNNELS", effects: { credits: -10000, happiness: -2, unrest: 2 } },
    { id: "swr_um_ignore", label: "ISSUE A WARNING NOTICE", effects: { happiness: -1 } },
  ],
  swr_pipe_strike: [
    { id: "swr_ps_meet_demands", label: "MEET THE WAGE DEMANDS", effects: { credits: -10000, happiness: 3, employment: 1, unrest: -3 } },
    { id: "swr_ps_partial_concession", label: "PARTIAL CONCESSION", effects: { credits: -5000, happiness: 1, unrest: -1 } },
    { id: "swr_ps_break_strike", label: "BREAK THE STRIKE", effects: { credits: -6000, unrest: 4, happiness: -3, lawOrder: 3, employment: -1 } },
    { id: "swr_ps_wait", label: "WAIT THEM OUT", effects: { happiness: -3, unrest: 3 } },
  ],
  swr_toxic_spill: [
    { id: "swr_ts_full_remediation", label: "FULL REMEDIATION", effects: { credits: -20000, happiness: 4, water: -10, unrest: -2, medSupplies: -10 } },
    { id: "swr_ts_dilute_and_release", label: "DILUTE AND RELEASE", effects: { credits: -3000, happiness: 1, water: -20, corruption: 3, tradeIncome: -1 } },
    { id: "swr_ts_blame_runoff", label: "BLAME UPSTREAM RUNOFF", effects: { credits: -1000, happiness: -2, corruption: 4 } },
    { id: "swr_ts_full_evacuation", label: "EVACUATE THE EXPOSURE ZONE", effects: { credits: -15000, happiness: -1, unrest: 1, employment: -1 } },
  ],
  swr_undercity_dwellers: [
    { id: "swr_ud_legalize", label: "LEGALIZE UNDERCITY HOUSING", effects: { credits: -12000, happiness: 5, unrest: -3, lawOrder: -1, employment: 1 } },
    { id: "swr_ud_relocate_above", label: "RELOCATE TO HAB BLOCKS", effects: { credits: -18000, happiness: 3, unrest: -1, employment: 1 } },
    { id: "swr_ud_full_clearance", label: "FORCED CLEARANCE", effects: { credits: -8000, unrest: 4, happiness: -4, lawOrder: 3, crime: 2 } },
    { id: "swr_ud_ignore", label: "LEAVE THEM BE", effects: { crime: 2, happiness: -1 } },
  ],
  swr_water_contamination: [
    { id: "swr_wc_full_purge", label: "FULL SYSTEM FLUSH", effects: { credits: -15000, water: -30, happiness: -1, medSupplies: -10, unrest: 1 } },
    { id: "swr_wc_emergency_distribution", label: "BOTTLED WATER DISTRIBUTION", effects: { credits: -10000, happiness: 3, water: 10, employment: 1 } },
    { id: "swr_wc_advisory_only", label: "BOIL-WATER ADVISORY", effects: { credits: -1000, happiness: -3, unrest: 2, corruption: 2 } },
  ],
  swr_rat_swarm: [
    { id: "swr_rs_extermination", label: "CITYWIDE EXTERMINATION", effects: { credits: -8000, happiness: 2, food: 5, medSupplies: -5 } },
    { id: "swr_rs_sanitation_drive", label: "SANITATION INFRASTRUCTURE DRIVE", effects: { credits: -14000, happiness: 4, food: 10, employment: 1 } },
    { id: "swr_rs_ignore", label: "IGNORE", effects: { happiness: -3, food: -10, crime: 1 } },
  ],
  swr_corrupt_inspector: [
    { id: "swr_ci_full_prosecution", label: "FULL PROSECUTION", effects: { credits: 3000, corruption: -4, lawOrder: 3, happiness: 2, employment: -1 } },
    { id: "swr_ci_quiet_dismissal", label: "QUIET DISMISSAL", effects: { credits: -1000, corruption: -1, happiness: -1 } },
    { id: "swr_ci_take_a_cut", label: "TAKE A CUT, KEEP THEM", effects: { credits: 8000, corruption: 5, happiness: -2, lawOrder: -2 } },
  ],
  swr_treatment_breakthrough: [
    { id: "swr_tb_fund_rollout", label: "FUND CITYWIDE ROLLOUT", effects: { credits: -16000, happiness: 4, water: 10, tradeIncome: 2 } },
    { id: "swr_tb_pilot_program", label: "PILOT PROGRAM IN ONE DISTRICT", effects: { credits: -5000, happiness: 2, water: 3 } },
    { id: "swr_tb_license_export", label: "LICENSE THE TECHNOLOGY", effects: { credits: 8000, happiness: 1, tradeIncome: 3 } },
    { id: "swr_tb_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
  swr_drainage_referendum: [
    { id: "swr_dr_full_program", label: "APPROVE THE FULL PROGRAM", effects: { credits: -28000, happiness: 5, employment: 3, unrest: -2 } },
    { id: "swr_dr_priority_districts", label: "PRIORITY DISTRICTS ONLY", effects: { credits: -10000, happiness: 3, employment: 1 } },
    { id: "swr_dr_reject", label: "REJECT THE REFERENDUM", effects: { happiness: -4, unrest: 3, lawOrder: -1, corruption: 2 } },
  ],
  tour_attraction_proposal: [
    { id: "tour_ap_fund_landmark", label: "FUND THE LANDMARK", effects: { credits: -22000, happiness: 4, tradeIncome: 3, employment: 2 } },
    { id: "tour_ap_private_partnership", label: "PUBLIC-PRIVATE PARTNERSHIP", effects: { credits: -10000, happiness: 2, tradeIncome: 2, corruption: 2 } },
    { id: "tour_ap_decline", label: "DECLINE THE PROPOSAL", effects: { happiness: -1 } },
  ],
  tour_overcrowding: [
    { id: "tour_oc_expand_capacity", label: "EXPAND TOURISM CAPACITY", effects: { credits: -16000, happiness: 2, tradeIncome: 3, employment: 2 } },
    { id: "tour_oc_visitor_cap", label: "DAILY VISITOR CAP", effects: { credits: -2000, happiness: 3, tradeIncome: -2, unrest: -1 } },
    { id: "tour_oc_premium_pricing", label: "PREMIUM PRICING ONLY", effects: { credits: 5000, happiness: -1, tradeIncome: 1, corruption: 1 } },
    { id: "tour_oc_ignore", label: "LET THE MARKET SORT IT", effects: { happiness: -3, unrest: 2, tradeIncome: 1 } },
  ],
  tour_review_scandal: [
    { id: "tour_rs_quality_overhaul", label: "QUALITY OVERHAUL", effects: { credits: -10000, happiness: 3, tradeIncome: 2, lawOrder: 1 } },
    { id: "tour_rs_pr_campaign", label: "AGGRESSIVE PR CAMPAIGN", effects: { credits: -8000, happiness: 1, tradeIncome: 1, corruption: 2 } },
    { id: "tour_rs_suppress_reviews", label: "SUPPRESS THE REVIEWS", effects: { credits: -3000, happiness: -2, corruption: 4, tradeIncome: -1 } },
    { id: "tour_rs_ignore", label: "RIDE IT OUT", effects: { tradeIncome: -2, happiness: -1 } },
  ],
  tour_tourist_robbery: [
    { id: "tour_tr_tourist_police", label: "DEDICATED TOURIST POLICE UNIT", effects: { credits: -12000, happiness: 2, crime: -3, lawOrder: 2, tradeIncome: 2 } },
    { id: "tour_tr_compensation_fund", label: "VICTIM COMPENSATION FUND", effects: { credits: -8000, happiness: 1, tradeIncome: 1 } },
    { id: "tour_tr_publicity_blackout", label: "PRESS BLACKOUT", effects: { credits: -2000, corruption: 3, crime: 2, happiness: -1 } },
    { id: "tour_tr_ignore", label: "TOURISTS ACCEPT THE RISK", effects: { crime: 1, tradeIncome: -2 } },
  ],
  tour_celebrity_endorsement: [
    { id: "tour_ce_pay_for_promotion", label: "PAY FOR THE PROMOTION", effects: { credits: -15000, happiness: 4, tradeIncome: 4 } },
    { id: "tour_ce_organic_partnership", label: "ORGANIC PARTNERSHIP", effects: { credits: -3000, happiness: 2, tradeIncome: 2 } },
    { id: "tour_ce_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
  tour_xeno_diplomatic_visit: [
    { id: "tour_xv_full_state_visit", label: "FULL STATE VISIT", effects: { credits: -18000, happiness: 4, tradeIncome: 4, defenseRating: 1, lawOrder: 1 } },
    { id: "tour_xv_low_key_tour", label: "LOW-KEY CULTURAL TOUR", effects: { credits: -6000, happiness: 2, tradeIncome: 2 } },
    { id: "tour_xv_decline", label: "DECLINE THE VISIT", effects: { happiness: -2, tradeIncome: -2, defenseRating: 1 } },
  ],
  tour_seasonal_collapse: [
    { id: "tour_sc_off_season_festival", label: "LAUNCH AN OFF-SEASON FESTIVAL", effects: { credits: -10000, happiness: 3, tradeIncome: 3, employment: 1 } },
    { id: "tour_sc_seasonal_layoffs", label: "SEASONAL LAYOFFS", effects: { credits: 4000, happiness: -3, unrest: 2, employment: -2 } },
    { id: "tour_sc_subsidize_workers", label: "SUBSIDIZE TOURISM WORKERS", effects: { credits: -8000, happiness: 2, employment: 1, unrest: -1 } },
  ],
  tour_undercity_tour_disaster: [
    { id: "tour_ud_safety_overhaul", label: "MANDATORY SAFETY OVERHAUL", effects: { credits: -8000, happiness: 2, tradeIncome: -2, lawOrder: 2 } },
    { id: "tour_ud_compensate_families", label: "COMPENSATE THE FAMILIES", effects: { credits: -12000, happiness: 1, corruption: 2 } },
    { id: "tour_ud_blame_operator", label: "PROSECUTE THE TOUR OPERATOR", effects: { credits: -2000, happiness: 1, lawOrder: 1, employment: -1 } },
    { id: "tour_ud_ignore", label: "BURY THE INCIDENT", effects: { happiness: -3, corruption: 4, crime: 1 } },
  ],
  tour_hotel_strike: [
    { id: "tour_hs_meet_demands", label: "BROKER A FULL DEAL", effects: { credits: -6000, happiness: 3, employment: 2, unrest: -2, tradeIncome: 1 } },
    { id: "tour_hs_replacement_workers", label: "PERMIT REPLACEMENT WORKERS", effects: { credits: -2000, unrest: 3, happiness: -3, lawOrder: 1, employment: -1 } },
    { id: "tour_hs_state_neutrality", label: "STATE NEUTRALITY", effects: { tradeIncome: -2, happiness: -1 } },
  ],
  tour_film_location: [
    { id: "tour_fl_full_cooperation", label: "FULL CITY COOPERATION", effects: { credits: -4000, happiness: 3, tradeIncome: 4, employment: 2 } },
    { id: "tour_fl_charge_full_rate", label: "CHARGE FULL LOCATION FEES", effects: { credits: 8000, happiness: 1, tradeIncome: 1 } },
    { id: "tour_fl_decline", label: "DECLINE THE PERMIT", effects: { happiness: 1, tradeIncome: -2 } },
  ],
  tour_smuggling_via_tourism: [
    { id: "tour_st_full_crackdown", label: "FULL CUSTOMS CRACKDOWN", effects: { credits: -6000, crime: -4, lawOrder: 3, tradeIncome: -3, happiness: -1 } },
    { id: "tour_st_targeted_intel", label: "TARGETED INTELLIGENCE OPERATION", effects: { credits: -10000, crime: -2, lawOrder: 2 } },
    { id: "tour_st_take_a_cut", label: "TAKE A CUT, LOOK AWAY", effects: { credits: 12000, corruption: 5, crime: 2, lawOrder: -2 } },
    { id: "tour_st_ignore", label: "IGNORE", effects: { crime: 2, corruption: 1 } },
  ],
  tour_heritage_protest: [
    { id: "tour_hp_protect_landmark", label: "PROTECT THE LANDMARK", effects: { credits: -8000, happiness: 4, tradeIncome: 2, employment: -1 } },
    { id: "tour_hp_compromise_design", label: "COMPROMISE DESIGN", effects: { credits: -4000, happiness: 2, tradeIncome: 1 } },
    { id: "tour_hp_demolish_anyway", label: "DEMOLISH ANYWAY", effects: { credits: 6000, happiness: -4, unrest: 3, corruption: 2, tradeIncome: -2 } },
  ],
  tns_skyrail_collapse: [
    { id: "tns_sc_emergency_rebuild", label: "EMERGENCY REBUILD", effects: { credits: -28000, happiness: 4, employment: 3, unrest: -2 } },
    { id: "tns_sc_redirect_traffic", label: "REDIRECT VIA REMAINING LINES", effects: { credits: -3000, happiness: -3, unrest: 2 } },
    { id: "tns_sc_decommission", label: "DECOMMISSION THE LINE", effects: { credits: -8000, happiness: -4, unrest: 2, employment: -1, tradeIncome: -2 } },
    { id: "tns_sc_corporate_contract", label: "CORPORATE EMERGENCY CONTRACT", effects: { credits: -40000, happiness: 5, corruption: 3, employment: 1 } },
  ],
  tns_overload_crisis: [
    { id: "tns_oc_expand_capacity", label: "EXPAND TRANSIT CAPACITY", effects: { credits: -22000, happiness: 4, employment: 2, tradeIncome: 2, unrest: -2 } },
    { id: "tns_oc_stagger_hours", label: "MANDATE STAGGERED WORK HOURS", effects: { credits: -2000, happiness: 1, employment: -1 } },
    { id: "tns_oc_premium_pricing", label: "PEAK-HOUR PRICING", effects: { credits: 8000, happiness: -3, unrest: 2 } },
    { id: "tns_oc_ignore", label: "OVERCAPACITY IS A GROWTH SIGN", effects: { happiness: -3, unrest: 2 } },
  ],
  tns_fare_hike_protest: [
    { id: "tns_fh_rescind_hike", label: "RESCIND THE FARE HIKE", effects: { credits: -10000, happiness: 4, unrest: -3 } },
    { id: "tns_fh_tiered_subsidy", label: "TIERED SUBSIDY", effects: { credits: -5000, happiness: 3, unrest: -2, employment: 1 } },
    { id: "tns_fh_hold_firm", label: "HOLD THE LINE", effects: { credits: 8000, happiness: -4, unrest: 4, lawOrder: 2 } },
  ],
  tns_maglev_proposal: [
    { id: "tns_mp_full_buildout", label: "FULL UNDERGROUND MAGLEV BUILDOUT", effects: { credits: -45000, happiness: 5, employment: 4, tradeIncome: 4 } },
    { id: "tns_mp_pilot_corridor", label: "PILOT CORRIDOR", effects: { credits: -15000, happiness: 3, employment: 2, tradeIncome: 1 } },
    { id: "tns_mp_corporate_concession", label: "CORPORATE CONCESSION", effects: { credits: -8000, happiness: 3, corruption: 4, tradeIncome: 2, employment: 1 } },
    { id: "tns_mp_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
  tns_vandalism_wave: [
    { id: "tns_vw_dedicated_patrols", label: "DEDICATED TRANSIT PATROLS", effects: { credits: -10000, crime: -3, happiness: 2, lawOrder: 2 } },
    { id: "tns_vw_youth_program", label: "YOUTH ENGAGEMENT PROGRAM", effects: { credits: -8000, crime: -2, happiness: 3, employment: 1, unrest: -1 } },
    { id: "tns_vw_harsh_penalties", label: "HARSH PENALTIES", effects: { credits: -3000, crime: -1, lawOrder: 2, happiness: -1, unrest: 1 } },
    { id: "tns_vw_ignore", label: "GRAFFITI BUDGET ONLY", effects: { credits: -2000, crime: 1, happiness: -2 } },
  ],
  tns_terminal_attack: [
    { id: "tns_ta_fortify_terminals", label: "FORTIFY EVERY TERMINAL", effects: { credits: -18000, defenseRating: 2, lawOrder: 3, happiness: -1, unrest: -2 } },
    { id: "tns_ta_intel_operation", label: "INTELLIGENCE OPERATION", effects: { credits: -12000, defenseRating: 1, lawOrder: 2, crime: -2 } },
    { id: "tns_ta_blame_outsiders", label: "BLAME OUTSIDE AGITATORS", effects: { credits: -2000, happiness: 1, tradeIncome: -2, defenseRating: 1, corruption: 2 } },
  ],
  tns_driver_strike: [
    { id: "tns_ds_meet_demands", label: "MEET THEIR DEMANDS", effects: { credits: -12000, happiness: 4, employment: 2, unrest: -3 } },
    { id: "tns_ds_partial_deal", label: "PARTIAL CONCESSION", effects: { credits: -6000, happiness: 1, unrest: -1 } },
    { id: "tns_ds_break_strike", label: "BREAK THE STRIKE", effects: { credits: -8000, unrest: 4, happiness: -3, lawOrder: 3, employment: -2 } },
    { id: "tns_ds_wait", label: "WAIT THEM OUT", effects: { happiness: -4, unrest: 3, tradeIncome: -2 } },
  ],
  tns_signal_failure: [
    { id: "tns_sf_full_replacement", label: "REPLACE THE SIGNAL SYSTEM", effects: { credits: -20000, happiness: 3, employment: 2, tradeIncome: 1 } },
    { id: "tns_sf_patch_software", label: "EMERGENCY SOFTWARE PATCH", effects: { credits: -5000, happiness: 1 } },
    { id: "tns_sf_manual_dispatch", label: "MANUAL DISPATCH", effects: { credits: -8000, happiness: -1, employment: 2 } },
  ],
  tns_pirate_freight_diversion: [
    { id: "tns_pf_armed_escorts", label: "ARMED FREIGHT ESCORTS", effects: { credits: -10000, crime: -2, defenseRating: 1, tradeIncome: 2 } },
    { id: "tns_pf_route_diversification", label: "ROUTE DIVERSIFICATION", effects: { credits: -3000, crime: -1, tradeIncome: 1 } },
    { id: "tns_pf_pay_protection", label: "PAY THE PROTECTION FEE", effects: { credits: -8000, corruption: 5, crime: 2, lawOrder: -3, tradeIncome: 2 } },
  ],
  tns_route_cancellation: [
    { id: "tns_rc_keep_route", label: "KEEP THE ROUTE OPEN", effects: { credits: -8000, happiness: 4, unrest: -2, employment: 1 } },
    { id: "tns_rc_replacement_service", label: "REPLACEMENT SHUTTLE SERVICE", effects: { credits: -2000, happiness: 1, unrest: 1 } },
    { id: "tns_rc_full_cancellation", label: "FULL CANCELLATION", effects: { credits: 6000, happiness: -4, unrest: 3, employment: -2 } },
  ],
  tns_corporate_acquisition: [
    { id: "tns_ca_accept_offer", label: "ACCEPT THE OFFER", effects: { credits: 35000, happiness: -3, corruption: 4, tradeIncome: -2, employment: -2 } },
    { id: "tns_ca_partial_concession", label: "PARTIAL CONCESSION", effects: { credits: 12000, corruption: 2, tradeIncome: 1, happiness: -1 } },
    { id: "tns_ca_decline", label: "DECLINE", effects: { happiness: 2, lawOrder: 1 } },
  ],
  tns_emergency_transit_breakthrough: [
    { id: "tns_eb_fund_rollout", label: "FUND CITYWIDE ROLLOUT", effects: { credits: -22000, happiness: 4, defenseRating: 2, employment: 2 } },
    { id: "tns_eb_priority_districts", label: "PRIORITY DISTRICTS ONLY", effects: { credits: -8000, happiness: 2, defenseRating: 1, employment: 1 } },
    { id: "tns_eb_decline", label: "DECLINE", effects: { happiness: -1 } },
  ],
};

function pickOfficer(s: GameState, filter: (o: typeof s.officers[0]) => boolean): typeof s.officers[0] | null {
  const candidates = (s.officers ?? []).filter(filter);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickFaction(s: GameState, filter: (f: typeof s.factions[0]) => boolean): typeof s.factions[0] | null {
  const candidates = s.factions.filter(filter);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function faithsReady(s: GameState): boolean {
  return Boolean(s.faiths?.stances) && (s.totalTicks ?? 0) >= 12;
}

function sponsoredFaiths(s: GameState): string[] {
  const stances = s.faiths?.stances;
  if (!stances) return [];
  return Object.entries(stances).filter(([, v]) => v === "sponsor").map(([k]) => k);
}

function suppressedFaiths(s: GameState): string[] {
  const stances = s.faiths?.stances;
  if (!stances) return [];
  return Object.entries(stances).filter(([, v]) => v === "suppress").map(([k]) => k);
}

function educationReady(s: GameState): boolean {
  return Boolean(s.cityStats) && (s.totalTicks ?? 0) >= 12;
}

function schoolsPresent(s: GameState): boolean {
  const b = s.buildings as Record<string, number> | undefined;
  if (!b) return false;
  return (b.civicEducationInstitutes ?? 0) >= 1
    || (b.planetaryFieldSchool ?? 0) >= 1
    || (b.marineTrainingSchool ?? 0) >= 1;
}

function buildingCount(s: GameState, key: string): number {
  const b = s.buildings as Record<string, number> | undefined;
  return b ? (b[key] ?? 0) : 0;
}

function entertainmentReady(s: GameState): boolean {
  return Boolean(s.cityStats) && (s.totalTicks ?? 0) >= 12;
}

function entertainmentPresent(s: GameState): boolean {
  return buildingCount(s, "publicEntertainmentComplexes") >= 1
    || buildingCount(s, "entertainmentMegaPlexes") >= 1
    || buildingCount(s, "entertainmentDistrictExpansion") >= 1
    || buildingCount(s, "propagandaBroadcastingTowers") >= 1;
}

function mediaInfluence(s: GameState): number {
  const demo = s.demographics as { mediaInfluenceLevel?: number } | undefined;
  return demo?.mediaInfluenceLevel ?? 0;
}

function prisonReady(s: GameState): boolean {
  return Boolean(s.cityStats) && (s.totalTicks ?? 0) >= 12;
}

function prisonPop(s: GameState): number {
  return getIncarcerationSummary(s).total;
}

function sewerReady(s: GameState): boolean {
  return Boolean(s.cityStats) && (s.totalTicks ?? 0) >= 12;
}

function sanitationLevel(s: GameState): number {
  const u = s.utilities as { sanitationLevel?: number } | undefined;
  return u?.sanitationLevel ?? 50;
}

function sewerInfra(s: GameState): number {
  return buildingCount(s, "sewerPurificationPlants")
    + buildingCount(s, "sewageTreatmentWorks")
    + buildingCount(s, "stormDrainMegaSystems");
}

function tourismReady(s: GameState): boolean {
  return Boolean(s.cityStats) && (s.totalTicks ?? 0) >= 15;
}

function touristCount(s: GameState): number {
  const t = s.tourism as { touristCount?: number } | undefined;
  return t?.touristCount ?? 0;
}

function tourismCapacity(s: GameState): number {
  const t = s.tourism as { tourismCapacity?: number } | undefined;
  return t?.tourismCapacity ?? 0;
}

function tourismSatisfaction(s: GameState): number {
  const t = s.tourism as { tourismSatisfaction?: number } | undefined;
  return t?.tourismSatisfaction ?? 50;
}

function tourismInfra(s: GameState): number {
  return buildingCount(s, "megaCityObservationDecks")
    + buildingCount(s, "historicalSectorMuseums")
    + buildingCount(s, "luxurySkyHotels")
    + buildingCount(s, "entertainmentMegaPlexes")
    + buildingCount(s, "xenoCulturalExhibitionHalls")
    + buildingCount(s, "guidedUndercityTours");
}

function transitReady(s: GameState): boolean {
  return Boolean(s.cityStats) && (s.totalTicks ?? 0) >= 12;
}

function transitLoad(s: GameState): number {
  const u = s.utilities as { transitLoad?: number } | undefined;
  return u?.transitLoad ?? 0;
}

function transitCapacity(s: GameState): number {
  const u = s.utilities as { transitCapacity?: number } | undefined;
  return u?.transitCapacity ?? 0;
}

function transitInfra(s: GameState): number {
  return buildingCount(s, "skyrailTransitLines")
    + buildingCount(s, "undergroundMaglevSystem")
    + buildingCount(s, "rapidEmergencyTransitLines")
    + buildingCount(s, "megaTransitCorridor")
    + buildingCount(s, "undergroundTransitNetwork")
    + buildingCount(s, "publicTransitTerminals");
}

function transitVandalism(s: GameState): number {
  const cs = s.crimeStats as { transitVandalism?: number } | undefined;
  return cs?.transitVandalism ?? 0;
}

function popScale(s: GameState): number {
  const pop = s.cityStats.population;
  if (pop > 500000) return 2.0;
  if (pop > 200000) return 1.5;
  if (pop > 50000) return 1.2;
  return 1.0;
}

function scaleEffects(
  base: Partial<GameEvent["effects"]>,
  scale: number
): Partial<GameEvent["effects"]> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === "number") {
      result[k] = Math.round(v * scale);
    }
  }
  return result as Partial<GameEvent["effects"]>;
}

export const CONDITION_TRIGGERS: TriggerCondition[] = [
  {
    id: "crime_wave_surge",
    persistent: true,
    check: (s) => s.cityStats.crime >= CRISIS_THRESHOLDS.crime.trigger,
    weight: (s) => (s.cityStats.crime - 50) / 50,
    cooldownTicks: 20,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "crime_wave_surge",
        title: "CRIME WAVE SURGING",
        severity: s.cityStats.crime >= CRISIS_THRESHOLDS.crime.critical ? "critical" : "high",
        effects: scaleEffects({ crime: 4, unrest: 3, happiness: -3 }, scale),
        responseOptions: OFFICER_RESPONSES.crime_wave_surge,
      };
    },
  },
  {
    id: "food_crisis",
    persistent: true,
    check: (s) => s.resources.food <= CRISIS_THRESHOLDS.food.trigger,
    weight: (s) => (40 - s.resources.food) / 40,
    cooldownTicks: 16,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "food_crisis",
        title: "FOOD SUPPLIES CRITICAL",
        severity: s.resources.food <= CRISIS_THRESHOLDS.food.critical ? "critical" : "high",
        effects: scaleEffects({ happiness: -4, unrest: 4 }, scale),
        responseOptions: OFFICER_RESPONSES.food_crisis,
      };
    },
  },
  {
    id: "power_crisis",
    persistent: true,
    check: (s) => s.resources.power <= CRISIS_THRESHOLDS.power.trigger,
    weight: (s) => (30 - s.resources.power) / 30,
    cooldownTicks: 12,
    generate: (s) => ({
      id: "power_crisis",
      title: "POWER GRID FAILING",
      severity: s.resources.power <= CRISIS_THRESHOLDS.power.critical ? "critical" : "high",
      effects: { happiness: -3, unrest: 3 },
      responseOptions: OFFICER_RESPONSES.power_crisis,
    }),
  },
  {
    id: "unrest_boiling",
    persistent: true,
    check: (s) => s.cityStats.unrest >= CRISIS_THRESHOLDS.unrest.trigger,
    weight: (s) => (s.cityStats.unrest - 60) / 40,
    cooldownTicks: 16,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "unrest_boiling",
        title: s.cityStats.unrest >= CRISIS_THRESHOLDS.unrest.critical ? "CITY ON THE BRINK" : "UNREST REACHING BOILING POINT",
        severity: s.cityStats.unrest >= CRISIS_THRESHOLDS.unrest.critical ? "critical" : "high",
        effects: scaleEffects({ crime: 3, happiness: -4 }, scale),
        responseOptions: OFFICER_RESPONSES.unrest_boiling,
      };
    },
  },
  {
    id: "health_emergency",
    persistent: true,
    check: (s) => s.cityStats.diseaseRisk >= CRISIS_THRESHOLDS.diseaseRisk.trigger,
    weight: (s) => (s.cityStats.diseaseRisk - 50) / 50,
    cooldownTicks: 20,
    generate: (s) => ({
      id: "health_emergency",
      title: "PUBLIC HEALTH EMERGENCY",
      severity: s.cityStats.diseaseRisk >= CRISIS_THRESHOLDS.diseaseRisk.critical ? "critical" : "high",
      effects: { happiness: -3, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.health_emergency,
    }),
  },
  {
    id: "corruption_endemic",
    persistent: true,
    check: (s) => s.cityStats.corruption >= CRISIS_THRESHOLDS.corruption.trigger,
    weight: (s) => (s.cityStats.corruption - 55) / 45,
    cooldownTicks: 24,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "corruption_endemic",
        title: "CORRUPTION ENDEMIC",
        severity: s.cityStats.corruption >= CRISIS_THRESHOLDS.corruption.critical ? "critical" : "high",
        effects: scaleEffects({ happiness: -3, lawOrder: -3, crime: 2 }, scale),
        responseOptions: OFFICER_RESPONSES.corruption_endemic,
      };
    },
  },
  {
    id: "infrastructure_decay",
    persistent: true,
    check: (s) => s.cityStats.infrastructureHealth <= CRISIS_THRESHOLDS.infrastructureHealth.trigger,
    weight: (s) => (40 - s.cityStats.infrastructureHealth) / 40,
    cooldownTicks: 20,
    generate: (s) => ({
      id: "infrastructure_decay",
      title: "INFRASTRUCTURE COLLAPSING",
      severity: s.cityStats.infrastructureHealth <= CRISIS_THRESHOLDS.infrastructureHealth.critical ? "critical" : "high",
      effects: { happiness: -3, unrest: 3 },
      responseOptions: OFFICER_RESPONSES.infrastructure_decay,
    }),
  },
  {
    id: "population_boom",
    check: (s) => s.cityStats.populationGrowthRate >= 3 && s.cityStats.population >= 100000,
    weight: (s) => Math.min(1, s.cityStats.populationGrowthRate / 5),
    cooldownTicks: 30,
    generate: (s) => ({
      id: "population_boom",
      title: "POPULATION BOOM",
      severity: "medium",
      effects: { unrest: 2, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.population_boom,
    }),
  },
  {
    id: "officer_defection_warning",
    check: (s) => {
      const off = pickOfficer(s, o => o.loyalty <= 25 && o.ambition >= 60);
      return off !== null;
    },
    weight: (s) => {
      const off = pickOfficer(s, o => o.loyalty <= 25 && o.ambition >= 60);
      return off ? (100 - off.loyalty) / 100 : 0;
    },
    cooldownTicks: 24,
    generate: (s) => {
      const off = pickOfficer(s, o => o.loyalty <= 25 && o.ambition >= 60)!;
      return {
        id: "officer_defection_warning",
        title: "DEFECTION WARNING",
        severity: off.loyalty <= 10 ? "critical" : "high",
        effects: { unrest: 2, lawOrder: -2 },
        responseOptions: OFFICER_RESPONSES.officer_defection_warning,
      };
    },
  },
  {
    id: "officer_corruption_exposed",
    check: (s) => {
      const off = pickOfficer(s, o => o.corruption >= 60);
      return off !== null;
    },
    weight: (s) => {
      const off = pickOfficer(s, o => o.corruption >= 60);
      return off ? off.corruption / 100 : 0;
    },
    cooldownTicks: 20,
    generate: (s) => {
      const off = pickOfficer(s, o => o.corruption >= 60)!;
      return {
        id: "officer_corruption_exposed",
        title: "OFFICER CORRUPTION EXPOSED",
        severity: off.corruption >= 85 ? "critical" : "high",
        effects: { corruption: 3, happiness: -2 },
        responseOptions: OFFICER_RESPONSES.officer_corruption_exposed,
      };
    },
  },
  {
    id: "officer_power_play",
    check: (s) => {
      const off = pickOfficer(s, o => o.ambition >= 75 && o.competence >= 50);
      return off !== null;
    },
    weight: (s) => {
      const off = pickOfficer(s, o => o.ambition >= 75 && o.competence >= 50);
      return off ? off.ambition / 100 * 0.6 : 0;
    },
    cooldownTicks: 30,
    generate: (s) => {
      const off = pickOfficer(s, o => o.ambition >= 75 && o.competence >= 50)!;
      return {
        id: "officer_power_play",
        title: "AMBITIOUS OFFICER MAKING MOVES",
        severity: off.ambition >= 90 ? "high" : "medium",
        effects: { unrest: 1, corruption: 1 },
        responseOptions: OFFICER_RESPONSES.officer_power_play,
      };
    },
  },
  {
    id: "faction_ultimatum",
    check: (s) => {
      const fac = pickFaction(s, f => f.isActive && f.loyalty <= 20 && f.influence >= 30);
      return fac !== null;
    },
    weight: (s) => {
      const fac = pickFaction(s, f => f.isActive && f.loyalty <= 20 && f.influence >= 30);
      return fac ? (100 - fac.loyalty) / 100 * fac.influence / 100 : 0;
    },
    cooldownTicks: 24,
    generate: (s) => {
      const fac = pickFaction(s, f => f.isActive && f.loyalty <= 20 && f.influence >= 30)!;
      const demands = [
        `exclusive control of ${fac.type === "corporate" ? "trade policy" : fac.type === "criminal" ? "the lower sectors" : fac.type === "law" ? "enforcement operations" : "resource allocation"}`,
        `removal of all officers affiliated with rival factions`,
        `a seat at the governing council with veto power`,
        `amnesty for all faction members currently detained`,
      ];
      const demand = demands[Math.floor(Math.random() * demands.length)];
      return {
        id: "faction_ultimatum",
        title: `${fac.name.toUpperCase()} ISSUES ULTIMATUM`,
        severity: fac.influence >= 60 ? "critical" : "high",
        effects: { unrest: 3, happiness: -2 },
        responseOptions: OFFICER_RESPONSES.faction_ultimatum,
      };
    },
  },
  {
    id: "faction_territory_dispute",
    check: (s) => {
      const activeFactions = s.factions.filter(f => f.isActive && f.influence >= 20);
      return activeFactions.length >= 2 && activeFactions.some(f => f.threat >= 40);
    },
    weight: (s) => {
      const maxThreat = Math.max(...s.factions.filter(f => f.isActive).map(f => f.threat), 0);
      return maxThreat / 100 * 0.5;
    },
    cooldownTicks: 28,
    generate: (s) => {
      const facs = s.factions.filter(f => f.isActive && f.influence >= 20);
      const f1 = facs[Math.floor(Math.random() * facs.length)];
      const f2 = facs.filter(f => f.id !== f1.id)[Math.floor(Math.random() * Math.max(1, facs.length - 1))] ?? f1;
      return {
        id: "faction_territory_dispute",
        title: "FACTION TERRITORY DISPUTE",
        severity: "high",
        effects: { crime: 4, unrest: 3, happiness: -3 },
        responseOptions: OFFICER_RESPONSES.faction_territory_dispute,
      };
    },
  },
  {
    id: "officer_loyalty_crisis",
    check: (s) => {
      const officers = s.officers ?? [];
      if (officers.length < 3) return false;
      const disloyal = officers.filter(o => o.loyalty <= 35).length;
      return disloyal >= Math.ceil(officers.length * 0.4);
    },
    weight: (s) => {
      const officers = s.officers ?? [];
      if (officers.length === 0) return 0;
      const avgLoyalty = officers.reduce((sum, o) => sum + o.loyalty, 0) / officers.length;
      return Math.max(0, (50 - avgLoyalty) / 50);
    },
    cooldownTicks: 30,
    generate: (s) => {
      const officers = s.officers ?? [];
      const disloyal = officers.filter(o => o.loyalty <= 35).length;
      return {
        id: "officer_loyalty_crisis",
        title: "OFFICER CORPS LOYALTY CRISIS",
        severity: disloyal >= officers.length * 0.6 ? "critical" : "high",
        effects: { lawOrder: -4, unrest: 3, corruption: 2 },
        responseOptions: OFFICER_RESPONSES.officer_loyalty_crisis,
      };
    },
  },
  {
    id: "trade_caravan_arrives",
    check: (s) => s.totalTicks > 10 && s.cityStats.population >= 20000,
    weight: () => 0.15,
    cooldownTicks: 20,
    generate: (s) => {
      const caravanSize = s.cityStats.population >= 200000 ? "massive" : s.cityStats.population >= 50000 ? "large" : "modest";
      // Task #211: Free Choir transit modifier — sponsoring the Choir
      // measurably increases the credits/tradeIncome/food yield of a caravan
      // and its response options; suppressing them shrinks the haul. The
      // helper short-circuits when no Choir stance is active.
      const baseOptions = OFFICER_RESPONSES.trade_caravan_arrives;
      const responseOptions = baseOptions.map((opt) => ({
        ...opt,
        effects: applyFreeChoirTransitScale(opt.effects, s),
      }));
      const choirNote = s.faiths?.stances?.["free-choir"] === "sponsor"
        ? " Free Choir cantors are riding shotgun — the convoy made it through richer than usual."
        : s.faiths?.stances?.["free-choir"] === "suppress"
          ? " Without the Free Choir's route-blessings, the convoy lost cargo to wastelander tolls."
          : "";
      return {
        id: "trade_caravan_arrives",
        title: "TRADE CARAVAN SPOTTED",
        severity: "low",
        effects: { happiness: 2 },
        responseOptions,
      };
    },
  },
  {
    id: "mega_project_construction_accident",
    check: (s) => (s.megaProjects ?? []).some(p => p.phase === "construction"),
    weight: (s) => {
      const constructing = (s.megaProjects ?? []).filter(p => p.phase === "construction").length;
      return 0.1 + constructing * 0.08;
    },
    cooldownTicks: 50,
    generate: (s) => {
      const active = (s.megaProjects ?? []).find(p => p.phase === "construction");
      const name = active ? active.projectId.replace(/_/g, " ").toUpperCase() : "MEGA-PROJECT";
      return {
        id: "mega_project_construction_accident",
        title: "CONSTRUCTION SITE ACCIDENT",
        severity: "high",
        effects: { happiness: -4, unrest: 5, credits: -8000 },
        responseOptions: OFFICER_RESPONSES.mega_project_construction_accident,
      };
    },
  },
  {
    id: "multiple_missions_overload",
    check: (s) => (s.activeMissions ?? []).filter(m => !m.resolved).length >= 3,
    weight: () => 0.2,
    cooldownTicks: 40,
    generate: (s) => {
      const active = (s.activeMissions ?? []).filter(m => !m.resolved).length;
      return {
        id: "multiple_missions_overload",
        title: "OPERATIONS CENTRE OVERLOADED",
        severity: "medium",
        effects: { unrest: 3, happiness: -2, corruption: 2 },
        responseOptions: OFFICER_RESPONSES.multiple_missions_overload,
      };
    },
  },
  {
    id: "mega_project_milestone",
    check: (s) => (s.megaProjects ?? []).some(p => p.phase === "construction" && p.progress > 0 && p.progress >= Math.floor(p.totalRequired * 0.5) && p.progress < Math.floor(p.totalRequired * 0.5) + 3),
    weight: () => 0.35,
    cooldownTicks: 60,
    generate: (s) => {
      const milestone = (s.megaProjects ?? []).find(p => p.phase === "construction" && p.progress >= Math.floor(p.totalRequired * 0.5));
      const name = milestone ? milestone.projectId.replace(/_/g, " ").toUpperCase() : "MEGA-PROJECT";
      return {
        id: "mega_project_milestone",
        title: "MEGA-PROJECT HITS 50% MILESTONE",
        severity: "low",
        effects: { happiness: 6, unrest: -3 },
        responseOptions: OFFICER_RESPONSES.mega_project_milestone,
      };
    },
  },
  {
    id: "mission_officer_exhaustion",
    check: (s) => {
      const resolved = (s.activeMissions ?? []).filter(m => m.resolved);
      const officerMissionCounts: Record<string, number> = {};
      for (const m of resolved) {
        officerMissionCounts[m.officerId] = (officerMissionCounts[m.officerId] ?? 0) + 1;
      }
      return Object.values(officerMissionCounts).some(c => c >= 3);
    },
    weight: () => 0.18,
    cooldownTicks: 60,
    generate: (s) => {
      const resolved = (s.activeMissions ?? []).filter(m => m.resolved);
      const officerMissionCounts: Record<string, number> = {};
      for (const m of resolved) {
        officerMissionCounts[m.officerId] = (officerMissionCounts[m.officerId] ?? 0) + 1;
      }
      const exhaustedId = Object.entries(officerMissionCounts).find(([_, c]) => c >= 3)?.[0];
      const officer = s.officers.find(o => o.id === exhaustedId);
      const name = officer?.name ?? "An officer";
      return {
        id: "mission_officer_exhaustion",
        title: "FIELD OFFICER BURNOUT",
        severity: "medium",
        effects: { happiness: -2, unrest: 2 },
        responseOptions: OFFICER_RESPONSES.mission_officer_exhaustion,
      };
    },
  },

  // ── FACTION RELATION TRIGGERS ──────────────────────────────────────────
  {
    id: "faction_worship",
    check: (s) => s.factions.some((f) => f.isActive && f.loyalty >= 90 && f.influence >= 50),
    weight: (s) => {
      const best = Math.max(...s.factions.filter(f => f.isActive).map(f => f.loyalty));
      return (best - 85) / 15;
    },
    cooldownTicks: 60,
    generate: (s) => {
      const faction = s.factions.filter(f => f.isActive).sort((a, b) => b.loyalty - a.loyalty)[0];
      return {
        id: "faction_worship",
        title: `${faction.name.toUpperCase()} DECLARES TOTAL LOYALTY`,
        severity: "medium",
        effects: { happiness: 3, corruption: 2 },
        responseOptions: [
          { id: "fw_embrace", label: "EMBRACE THEIR LOYALTY", effects: { happiness: 6, corruption: 5, lawOrder: 3, unrest: -4 } },
          { id: "fw_formalize", label: "FORMALIZE THE ALLIANCE", effects: { happiness: 4, credits: -5000, corruption: 3 } },
          { id: "fw_distance", label: "MAINTAIN PROFESSIONAL DISTANCE", effects: { happiness: -1, corruption: -3, lawOrder: 2 } },
          { id: "fw_test", label: "TEST THEIR LOYALTY", effects: { credits: -8000, corruption: -2, happiness: 2 } },
        ],
      };
    },
  },
  {
    id: "faction_betrayal",
    check: (s) => s.factions.some((f) => f.isActive && f.loyalty <= 10 && f.threat >= 60 && f.influence >= 30),
    weight: (s) => {
      const worst = s.factions.filter(f => f.isActive && f.loyalty <= 10 && f.threat >= 60);
      if (worst.length === 0) return 0;
      return Math.max(...worst.map(f => (f.threat - 50) / 50));
    },
    cooldownTicks: 40,
    generate: (s) => {
      const faction = s.factions.filter(f => f.isActive && f.loyalty <= 10 && f.threat >= 60).sort((a, b) => b.threat - a.threat)[0];
      return {
        id: "faction_betrayal",
        title: `${faction.name.toUpperCase()} — SIGNS OF ACTIVE REBELLION`,
        severity: "critical",
        effects: { unrest: 5, crime: 3 },
        responseOptions: [
          { id: "fb_preempt", label: "PREEMPTIVE STRIKE", effects: { crime: -8, lawOrder: 6, unrest: 8, happiness: -5, credits: -15000 } },
          { id: "fb_infiltrate", label: "INFILTRATE AND SUBVERT", effects: { credits: -10000, corruption: 5, crime: -3 } },
          { id: "fb_negotiate", label: "DIRECT CONFRONTATION — NEGOTIATE", effects: { credits: -5000, unrest: -2 } },
          { id: "fb_concessions", label: "ADDRESS THEIR GRIEVANCES", effects: { credits: -20000, happiness: 5, unrest: -5, corruption: -3 } },
        ],
      };
    },
  },
  {
    id: "cross_faction_alliance_proposal",
    check: (s) => {
      const active = s.factions.filter(f => f.isActive && f.loyalty >= 50);
      return active.length >= 3;
    },
    weight: (s) => {
      const active = s.factions.filter(f => f.isActive && f.loyalty >= 50);
      return Math.min(0.5, (active.length - 2) * 0.15);
    },
    cooldownTicks: 80,
    generate: (s) => {
      const allies = s.factions.filter(f => f.isActive && f.loyalty >= 50).sort((a, b) => b.loyalty - a.loyalty).slice(0, 3);
      const names = allies.map(f => f.name).join(", ");
      return {
        id: "cross_faction_alliance_proposal",
        title: "MULTI-FACTION COALITION PROPOSAL",
        severity: "medium",
        effects: {},
        responseOptions: [
          { id: "cfa_accept", label: "ACCEPT THE COALITION", effects: { happiness: 8, unrest: -6, corruption: 4, credits: -15000 } },
          { id: "cfa_modify", label: "COUNTER-PROPOSE — 8% BUDGET, NO VETO", effects: { happiness: 5, unrest: -3, credits: -8000 } },
          { id: "cfa_reject", label: "REJECT — INDEPENDENCE MATTERS", effects: { happiness: -3, lawOrder: 3, corruption: -3 } },
          { id: "cfa_exploit", label: "DIVIDE AND CONQUER", effects: { corruption: 8, happiness: 2, unrest: -2 } },
        ],
      };
    },
  },
  {
    id: "external_trade_dispute",
    check: (s) => (s.rates?.tradeIncome ?? 0) > 1000 && s.totalTicks > 8000,
    weight: () => 0.12,
    cooldownTicks: 100,
    generate: (s) => {
      const cities = ["Megacity Pacifica", "Aureus Dominion", "the Verdant Enclave"];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const goods = ["pharmaceutical compounds", "fusion reactor components", "military-grade alloys", "genetic seed stock"];
      const good = goods[Math.floor(Math.random() * goods.length)];
      return {
        id: "external_trade_dispute",
        title: `TRADE DISPUTE WITH ${city.toUpperCase()}`,
        severity: "medium",
        effects: { tradeIncome: -200 },
        responseOptions: [
          { id: "etd_comply", label: "RAISE EXPORT PRICES", effects: { tradeIncome: -400, happiness: -2 } },
          { id: "etd_negotiate", label: "NEGOTIATE A COMPROMISE", effects: { credits: -10000, tradeIncome: 100 } },
          { id: "etd_reject", label: "REJECT THE COMPLAINT", effects: { tradeIncome: -100, happiness: 2, unrest: -1 } },
          { id: "etd_counter", label: "FILE A COUNTER-COMPLAINT", effects: { credits: -5000, tradeIncome: 50 } },
        ],
      };
    },
  },
  {
    id: "faction_underground_merger",
    check: (s) => {
      const criminals = s.factions.filter(f => f.isActive && f.type === "criminal");
      return criminals.length >= 2 && criminals.some(f => f.threat >= 50) && criminals.some(f => f.influence >= 30);
    },
    weight: () => 0.15,
    cooldownTicks: 120,
    generate: (s) => {
      const criminals = s.factions.filter(f => f.isActive && f.type === "criminal").sort((a, b) => b.influence - a.influence);
      const primary = criminals[0];
      const secondary = criminals[1];
      return {
        id: "faction_underground_merger",
        title: "CRIMINAL FACTIONS MERGING",
        severity: "critical",
        effects: { crime: 4, unrest: 3 },
        responseOptions: [
          { id: "fum_disrupt", label: "DISRUPT THE MERGER", effects: { credits: -15000, crime: -3, corruption: 3 } },
          { id: "fum_raid", label: "RAID THE MEETING", effects: { credits: -20000, crime: -10, lawOrder: 8, unrest: 6, happiness: -4 } },
          { id: "fum_deal_primary", label: `CUT A DEAL WITH ${primary.name.toUpperCase()}`, effects: { crime: -4, corruption: 8, credits: -10000 } },
          { id: "fum_monitor", label: "LET IT HAPPEN — MONITOR CLOSELY", effects: { crime: 6, corruption: 2, lawOrder: -3 } },
        ],
      };
    },
  },
  {
    id: "wx_acid_rain_corrosion",
    check: (s) => s.weather === "Acid Rain" || s.weather === "Black Rain",
    weight: () => 0.6,
    cooldownTicks: 40,
    generate: (s) => {
      const scale = popScale(s);
      const isBlack = s.weather === "Black Rain";
      return {
        id: "wx_acid_rain_corrosion",
        title: isBlack ? "BLACK RAIN — INFRASTRUCTURE CORRODING" : "ACID RAIN EATING THE CITY",
        severity: "medium",
        effects: scaleEffects({ happiness: -2, unrest: 1 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_acid_rain_corrosion,
      };
    },
  },
  {
    id: "wx_smog_respiratory",
    check: (s) => s.weather === "Smog Alert" || s.weather === "Chemical Haze" || s.weather === "Thermal Inversion",
    weight: () => 0.5,
    cooldownTicks: 35,
    generate: (s) => {
      const scale = popScale(s);
      const wx = s.weather ?? "Smog";
      return {
        id: "wx_smog_respiratory",
        title: "RESPIRATORY EMERGENCY",
        severity: "medium",
        effects: scaleEffects({ happiness: -3, unrest: 2, medSupplies: -10 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_smog_respiratory,
      };
    },
  },
  {
    id: "wx_solar_flare_surge",
    check: (s) => s.weather === "Solar Flare",
    weight: () => 0.7,
    cooldownTicks: 45,
    generate: (s) => ({
      id: "wx_solar_flare_surge",
      title: "SOLAR FLARE — GRID OVERLOAD WARNING",
      severity: "high",
      effects: { power: -20, happiness: -2, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.wx_grid_surge,
    }),
  },
  {
    id: "wx_static_comms_blackout",
    check: (s) => s.weather === "Static Storm",
    weight: () => 0.7,
    cooldownTicks: 40,
    generate: () => ({
      id: "wx_static_comms_blackout",
      title: "STATIC STORM — COMMS DOWN",
      severity: "high",
      effects: { lawOrder: -3, crime: 3, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.wx_comms_blackout,
    }),
  },
  {
    id: "wx_emp_drone_failure",
    check: (s) => s.weather === "Electromagnetic Storm" || s.weather === "Ion Storm",
    weight: () => 0.6,
    cooldownTicks: 35,
    generate: (s) => ({
      id: "wx_emp_drone_failure",
      title: "DRONE FLEET DROPPING FROM SKY",
      severity: "high",
      effects: { lawOrder: -2, crime: 2, happiness: -2, defenseRating: -2 },
      responseOptions: OFFICER_RESPONSES.wx_drone_failure,
    }),
  },
  {
    id: "wx_toxic_fog_evac",
    check: (s) => s.weather === "Toxic Fog",
    weight: () => 0.7,
    cooldownTicks: 50,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_toxic_fog_evac",
        title: "TOXIC FOG — EVACUATION DECISION",
        severity: "critical",
        effects: scaleEffects({ happiness: -4, unrest: 3, medSupplies: -15 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_evacuation,
      };
    },
  },
  {
    id: "wx_radiation_zone",
    check: (s) => s.weather === "Radiation Spike",
    weight: () => 0.7,
    cooldownTicks: 50,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_radiation_zone",
        title: "RADIATION SPIKE — CONTAMINATION ZONES FORMING",
        severity: "critical",
        effects: scaleEffects({ happiness: -4, unrest: 3, medSupplies: -20 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_evacuation,
      };
    },
  },
  {
    id: "wx_ash_crop_collapse",
    check: (s) => s.weather === "Ash Fall",
    weight: () => 0.6,
    cooldownTicks: 45,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_ash_crop_collapse",
        title: "ASH FALL SMOTHERING THE FARMS",
        severity: "high",
        effects: scaleEffects({ food: -40, happiness: -2 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_crop_loss,
      };
    },
  },
  {
    id: "wx_dust_construction_halt",
    check: (s) => s.weather === "Dust Storm" || s.weather === "Sleet",
    weight: () => 0.4,
    cooldownTicks: 40,
    generate: (s) => ({
      id: "wx_dust_construction_halt",
      title: s.weather === "Sleet" ? "SLEET HALTING CONSTRUCTION" : "DUST STORM HALTING CONSTRUCTION",
      severity: "medium",
      effects: { happiness: -1, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.wx_construction_halt,
    }),
  },
  {
    id: "wx_plasma_factory_fire",
    check: (s) => s.weather === "Plasma Rain",
    weight: () => 0.7,
    cooldownTicks: 50,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_plasma_factory_fire",
        title: "PLASMA RAIN — FACTORY DISTRICT BURNING",
        severity: "critical",
        effects: scaleEffects({ happiness: -3, unrest: 3, employment: -2 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_factory_fire,
      };
    },
  },
  {
    id: "wx_sewer_gas_explosion",
    check: (s) => s.weather === "Sewer Gas Surge",
    weight: () => 0.6,
    cooldownTicks: 45,
    generate: () => ({
      id: "wx_sewer_gas_explosion",
      title: "SEWER GAS SURGE — UNDERGROUND EXPLOSIONS",
      severity: "high",
      effects: { happiness: -3, unrest: 2, lawOrder: -1 },
      responseOptions: OFFICER_RESPONSES.wx_factory_fire,
    }),
  },
  {
    id: "wx_spore_outbreak",
    check: (s) => s.weather === "Spore Bloom",
    weight: () => 0.6,
    cooldownTicks: 50,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_spore_outbreak",
        title: "SPORE BLOOM — FUNGAL OUTBREAK",
        severity: "high",
        effects: scaleEffects({ happiness: -3, medSupplies: -15, unrest: 2 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_fungal_outbreak,
      };
    },
  },
  {
    id: "wx_blood_mist_cult",
    check: (s) => s.weather === "Blood Mist",
    weight: () => 0.6,
    cooldownTicks: 50,
    generate: () => ({
      id: "wx_blood_mist_cult",
      title: "BLOOD MIST — CULTS GATHERING",
      severity: "medium",
      effects: { unrest: 3, crime: 2, happiness: -2, corruption: 1 },
      responseOptions: OFFICER_RESPONSES.wx_cult_surge,
    }),
  },
  {
    id: "wx_heatwave_crisis",
    check: (s) => s.weather === "Heatwave" || s.weather === "Scorching",
    weight: () => 0.5,
    cooldownTicks: 40,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_heatwave_crisis",
        title: s.weather === "Scorching" ? "SCORCHING HEAT — CASUALTIES MOUNTING" : "HEATWAVE — VULNERABLE POPULATIONS AT RISK",
        severity: s.weather === "Scorching" ? "high" : "medium",
        effects: scaleEffects({ happiness: -3, unrest: 2, power: -15 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_thermal_crisis,
      };
    },
  },
  {
    id: "wx_freezing_crisis",
    check: (s) => s.weather === "Freezing" || s.weather === "Cold Winds",
    weight: () => 0.5,
    cooldownTicks: 40,
    generate: (s) => {
      const scale = popScale(s);
      return {
        id: "wx_freezing_crisis",
        title: s.weather === "Freezing" ? "FREEZING CONDITIONS — EXPOSURE CASUALTIES" : "COLD WINDS — HOMELESS AT RISK",
        severity: s.weather === "Freezing" ? "high" : "medium",
        effects: scaleEffects({ happiness: -3, unrest: 2, power: -15 }, scale),
        responseOptions: OFFICER_RESPONSES.wx_thermal_crisis,
      };
    },
  },
  {
    id: "wx_seismic_inspection",
    check: (s) => s.weather === "Seismic Tremor" || s.weather === "Gravitational Anomaly",
    weight: () => 0.6,
    cooldownTicks: 50,
    generate: (s) => ({
      id: "wx_seismic_inspection",
      title: s.weather === "Gravitational Anomaly" ? "GRAVITATIONAL ANOMALY — STRUCTURES STRESSED" : "SEISMIC TREMOR — STRUCTURAL INSPECTION NEEDED",
      severity: "high",
      effects: { happiness: -3, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.wx_geological,
    }),
  },
  {
    id: "wx_nanite_swarm_drone",
    check: (s) => s.weather === "Nanite Swarm",
    weight: () => 0.7,
    cooldownTicks: 50,
    generate: () => ({
      id: "wx_nanite_swarm_drone",
      title: "NANITE SWARM — TECH DEGRADING",
      severity: "critical",
      effects: { lawOrder: -3, crime: 2, happiness: -3, defenseRating: -3 },
      responseOptions: OFFICER_RESPONSES.wx_drone_failure,
    }),
  },
  {
    // First-introduction event for The Ledger. cooldownTicks set very high
    // so it fires once per game (the engine cooldown bookkeeping prevents
    // re-fire). Gated on faithsReady so it appears only after the faith
    // system has warmed up.
    id: "faith_intro_ledger",
    check: (s) => faithsReady(s) && (s.totalTicks ?? 0) >= 20,
    weight: () => 0.5,
    cooldownTicks: 999999,
    generate: () => ({
      id: "faith_intro_ledger",
      title: `${faithDisplayName("the-ledger").toUpperCase()} EMERGES IN THE COMMERCE QUARTER`,
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.faith_intro_ledger,
    }),
  },
  {
    // Task #209: First-introduction event for The Helix Commune. Same one-shot
    // pattern as Ledger / Tidekeepers — fires once after the faith system
    // warms up. Schedule sits between Ledger (20) and Tidekeepers (28) so the
    // three new faiths surface in a paced cadence rather than all at once.
    id: "faith_intro_helix",
    check: (s) => faithsReady(s) && (s.totalTicks ?? 0) >= 24,
    weight: () => 0.5,
    cooldownTicks: 999999,
    generate: () => ({
      id: "faith_intro_helix",
      title: `${faithDisplayName("helix-commune").toUpperCase()} OPENS A CLINIC IN THE UNDERCITY`,
      severity: "medium",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.faith_intro_helix,
    }),
  },
  {
    // Task #209: dedicated sectarian-conflict variant when both Eternal Flame
    // AND Helix Commune are sponsored. Their doctrines (flesh-is-sacred vs
    // genome-is-scripture) make this antagonism inherent, so we surface a
    // specific event with bespoke text instead of letting it fall under the
    // generic faith_holy_war flavor.
    id: "faith_helix_flame_clash",
    check: (s) =>
      faithsReady(s)
      && s.faiths?.stances?.["eternal-flame"] === "sponsor"
      && s.faiths?.stances?.["helix-commune"] === "sponsor",
    weight: () => 0.7,
    cooldownTicks: 80,
    generate: (s) => ({
      id: "faith_helix_flame_clash",
      title: `${faithDisplayName("eternal-flame").toUpperCase()} vs ${faithDisplayName("helix-commune").toUpperCase()} — DOCTRINAL WAR`,
      severity: "critical",
      effects: scaleEffects({ unrest: 5, happiness: -4, crime: 3 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.faith_helix_flame_clash,
    }),
  },
  {
    // Task #211: First-introduction event for The Free Choir. One-shot pattern,
    // gated past the Helix intro (24) and Tidekeepers intro (28) so the
    // later faith introductions arrive in a paced cadence.
    id: "faith_intro_choir",
    check: (s) => faithsReady(s) && (s.totalTicks ?? 0) >= 32,
    weight: () => 0.5,
    cooldownTicks: 999999,
    generate: () => ({
      id: "faith_intro_choir",
      title: `${faithDisplayName("free-choir").toUpperCase()} OPENS A ROUTE-SHRINE AT THE GATES`,
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.faith_intro_choir,
    }),
  },
  {
    // First-introduction event for Catholicism. It arrives after the existing
    // faith introductions so a fresh city is not flooded with recognition
    // requests in its first few weeks.
    id: "faith_intro_catholicism",
    check: (s) => faithsReady(s) && (s.totalTicks ?? 0) >= 36,
    weight: () => 0.5,
    cooldownTicks: 999999,
    generate: () => ({
      id: "faith_intro_catholicism",
      title: "CATHOLIC PARISH NETWORKS REQUEST RECOGNITION",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.faith_intro_catholicism,
    }),
  },
  {
    // Task #211: Doctrinal-feud variant — fires when the player has taken
    // opposite stances on the Ledger and the Free Choir (one sponsored, the
    // other suppressed). Their commercial doctrines are mutually exclusive,
    // so a divergent stance forces a public showdown.
    id: "faith_choir_ledger_feud",
    check: (s) => {
      if (!faithsReady(s)) return false;
      const stances = s.faiths?.stances;
      if (!stances) return false;
      const ledger = stances["the-ledger"];
      const choir = stances["free-choir"];
      return (
        (ledger === "sponsor" && choir === "suppress")
        || (ledger === "suppress" && choir === "sponsor")
      );
    },
    weight: () => 0.7,
    cooldownTicks: 80,
    generate: (s) => ({
      id: "faith_choir_ledger_feud",
      title: `${faithDisplayName("the-ledger").toUpperCase()} vs ${faithDisplayName("free-choir").toUpperCase()} — DOCTRINAL FEUD`,
      severity: "critical",
      effects: scaleEffects({ unrest: 4, happiness: -3, tradeIncome: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.faith_choir_ledger_feud,
    }),
  },
  {
    // First-introduction event for The Tidekeepers. Same one-shot pattern.
    id: "faith_intro_tidekeepers",
    check: (s) => faithsReady(s) && (s.totalTicks ?? 0) >= 28,
    weight: () => 0.5,
    cooldownTicks: 999999,
    generate: () => ({
      id: "faith_intro_tidekeepers",
      title: `${faithDisplayName("the-tidekeepers").toUpperCase()} SURFACE FROM THE WATERWORKS`,
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.faith_intro_tidekeepers,
    }),
  },
  {
    id: "faith_pilgrimage_arrives",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length > 0,
    weight: () => 0.4,
    cooldownTicks: 60,
    generate: (s) => {
      const sponsors = sponsoredFaiths(s);
      const which = sponsors[Math.floor(Math.random() * sponsors.length)];
      const name = faithDisplayName(which);
      return {
        id: "faith_pilgrimage_arrives",
        title: `PILGRIMAGE — ${name.toUpperCase()} CONVERGING ON THE CITY`,
        severity: "medium",
        effects: scaleEffects({ happiness: 1, food: -20 }, popScale(s)),
        responseOptions: OFFICER_RESPONSES.faith_pilgrimage,
      };
    },
  },
  {
    id: "faith_revival_meeting",
    check: (s) => faithsReady(s),
    weight: () => 0.3,
    cooldownTicks: 50,
    generate: () => ({
      id: "faith_revival_meeting",
      title: "MASS REVIVAL — CENTRAL PLAZA",
      severity: "low",
      effects: { happiness: 2, unrest: -1 },
      responseOptions: OFFICER_RESPONSES.faith_revival,
    }),
  },
  {
    id: "faith_inquisition_demand",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length === 1 && (s.cityStats?.lawOrder ?? 0) >= 30,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: (s) => {
      const which = sponsoredFaiths(s)[0];
      const name = faithDisplayName(which);
      return {
        id: "faith_inquisition_demand",
        title: `${name.toUpperCase()} DEMANDS PURGE OF RIVALS`,
        severity: "high",
        effects: { unrest: 2, happiness: -1, corruption: 1 },
        responseOptions: OFFICER_RESPONSES.faith_inquisition,
      };
    },
  },
  {
    id: "faith_choir_strike",
    check: (s) => faithsReady(s) && s.faiths?.stances["machine-choir"] === "suppress",
    weight: () => 0.5,
    cooldownTicks: 60,
    generate: (s) => ({
      id: "faith_choir_strike",
      title: "MACHINE CHOIR — INDUSTRIAL WALKOUT",
      severity: "high",
      effects: scaleEffects({ unrest: 3, happiness: -2, employment: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.faith_choir_strike,
    }),
  },
  {
    id: "faith_ancestor_uprising",
    check: (s) => faithsReady(s) && s.faiths?.stances["ancestor-cult"] === "suppress",
    weight: () => 0.5,
    cooldownTicks: 60,
    generate: (s) => ({
      id: "faith_ancestor_uprising",
      title: "ANCESTOR CULT — SLUMS RISING",
      severity: "critical",
      effects: scaleEffects({ unrest: 5, happiness: -4, crime: 3, lawOrder: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.faith_ancestor_uprising,
    }),
  },
  {
    id: "faith_holy_war",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length >= 2,
    weight: () => 0.5,
    cooldownTicks: 80,
    generate: (s) => {
      const sponsors = sponsoredFaiths(s);
      const a = faithDisplayName(sponsors[0]);
      const b = faithDisplayName(sponsors[1]);
      return {
        id: "faith_holy_war",
        title: `HOLY WAR BREWING — ${a.toUpperCase()} vs ${b.toUpperCase()}`,
        severity: "critical",
        effects: scaleEffects({ unrest: 4, happiness: -3, crime: 2 }, popScale(s)),
        responseOptions: OFFICER_RESPONSES.faith_holy_war,
      };
    },
  },
  {
    id: "faith_apostate_movement",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length === 0 && (s.totalTicks ?? 0) >= 80,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "faith_apostate_movement",
      title: "APOSTATE MOVEMENT GROWING",
      severity: "medium",
      effects: { unrest: 2, happiness: -2, crime: 1 },
      responseOptions: OFFICER_RESPONSES.faith_apostate,
    }),
  },
  {
    id: "faith_relic_discovery",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length > 0,
    weight: () => 0.25,
    cooldownTicks: 90,
    generate: (s) => {
      const sponsors = sponsoredFaiths(s);
      const which = sponsors[Math.floor(Math.random() * sponsors.length)];
      const name = faithDisplayName(which);
      return {
        id: "faith_relic_discovery",
        title: `PRE-COLLAPSE RELIC — ${name.toUpperCase()} CLAIMS IT`,
        severity: "low",
        effects: { happiness: 2 },
        responseOptions: OFFICER_RESPONSES.faith_relic,
      };
    },
  },
  {
    id: "faith_tithe_dispute",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length > 0 && s.resources.credits < 20000,
    weight: () => 0.4,
    cooldownTicks: 65,
    generate: () => ({
      id: "faith_tithe_dispute",
      title: "TITHE TAX DISPUTE",
      severity: "medium",
      effects: { happiness: -1, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.faith_tithe,
    }),
  },
  {
    id: "faith_doomsday_prophet",
    check: (s) => faithsReady(s),
    weight: () => 0.3,
    cooldownTicks: 70,
    generate: () => ({
      id: "faith_doomsday_prophet",
      title: "DOOMSDAY PROPHET DRAWING CROWDS",
      severity: "low",
      effects: { unrest: 2, happiness: -1 },
      responseOptions: OFFICER_RESPONSES.faith_doomsday,
    }),
  },
  {
    id: "faith_temple_request",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length > 0,
    weight: () => 0.3,
    cooldownTicks: 75,
    generate: (s) => {
      const sponsors = sponsoredFaiths(s);
      const which = sponsors[Math.floor(Math.random() * sponsors.length)];
      const name = faithDisplayName(which);
      return {
        id: "faith_temple_request",
        title: `${name.toUpperCase()} REQUESTS GRAND TEMPLE`,
        severity: "low",
        effects: { happiness: 1 },
        responseOptions: OFFICER_RESPONSES.faith_temple_request,
      };
    },
  },
  {
    id: "faith_corruption_scandal",
    check: (s) => faithsReady(s) && sponsoredFaiths(s).length > 0 && (s.cityStats?.corruption ?? 0) >= 25,
    weight: () => 0.35,
    cooldownTicks: 80,
    generate: (s) => {
      const sponsors = sponsoredFaiths(s);
      const which = sponsors[Math.floor(Math.random() * sponsors.length)];
      const name = faithDisplayName(which);
      return {
        id: "faith_corruption_scandal",
        title: `${name.toUpperCase()} — TITHE EMBEZZLEMENT EXPOSED`,
        severity: "high",
        effects: { corruption: 4, happiness: -3, unrest: 2 },
        responseOptions: OFFICER_RESPONSES.faith_corruption_scandal,
      };
    },
  },
  {
    id: "edu_literacy_milestone",
    check: (s) => educationReady(s) && (s.demographics?.literacyRate ?? 0) >= 85,
    weight: () => 0.25,
    cooldownTicks: 80,
    generate: (s) => ({
      id: "edu_literacy_milestone",
      title: "LITERACY MILESTONE — 85% REACHED",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: OFFICER_RESPONSES.edu_literacy_milestone,
    }),
  },
  {
    id: "edu_literacy_collapse",
    check: (s) => educationReady(s) && (s.demographics?.literacyRate ?? 100) < 40,
    weight: () => 0.55,
    cooldownTicks: 60,
    generate: (s) => ({
      id: "edu_literacy_collapse",
      title: "LITERACY COLLAPSE — UNDER 40%",
      severity: "high",
      effects: scaleEffects({ unrest: 3, happiness: -3, crime: 2, employment: -1 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.edu_literacy_collapse,
    }),
  },
  {
    id: "edu_teacher_strike",
    check: (s) => educationReady(s) && schoolsPresent(s) && (s.cityStats?.happiness ?? 100) < 40,
    weight: () => 0.5,
    cooldownTicks: 65,
    generate: (s) => ({
      id: "edu_teacher_strike",
      title: "TEACHER STRIKE — CLASSROOMS DARK",
      severity: "high",
      effects: scaleEffects({ unrest: 3, happiness: -3, employment: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.edu_teacher_strike,
    }),
  },
  {
    id: "edu_student_protest",
    check: (s) => educationReady(s) && (s.cityStats?.education ?? 0) >= 60 && (s.cityStats?.unrest ?? 0) >= 30,
    weight: () => 0.45,
    cooldownTicks: 55,
    generate: () => ({
      id: "edu_student_protest",
      title: "STUDENT PROTESTS — CAMPUSES OCCUPIED",
      severity: "medium",
      effects: { unrest: 2, happiness: -1 },
      responseOptions: OFFICER_RESPONSES.edu_student_protest,
    }),
  },
  {
    id: "edu_brain_drain",
    check: (s) => educationReady(s) && (s.cityStats?.education ?? 0) >= 65 && (s.resources?.credits ?? 0) < 15000,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: () => ({
      id: "edu_brain_drain",
      title: "BRAIN DRAIN — TOP GRADUATES LEAVING",
      severity: "medium",
      effects: { happiness: -2, employment: -1, tradeIncome: -1 },
      responseOptions: OFFICER_RESPONSES.edu_brain_drain,
    }),
  },
  {
    id: "edu_breakthrough_paper",
    check: (s) => educationReady(s) && buildingCount(s, "civicEducationInstitutes") >= 1,
    weight: () => 0.3,
    cooldownTicks: 75,
    generate: () => ({
      id: "edu_breakthrough_paper",
      title: "RESEARCH BREAKTHROUGH — INSTITUTE FILES PAPER",
      severity: "low",
      effects: { happiness: 2, tradeIncome: 1 },
      responseOptions: OFFICER_RESPONSES.edu_breakthrough_paper,
    }),
  },
  {
    id: "edu_exam_scandal",
    check: (s) => educationReady(s) && schoolsPresent(s) && (s.cityStats?.corruption ?? 0) >= 30,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: () => ({
      id: "edu_exam_scandal",
      title: "EXAM SCANDAL — RESULTS FABRICATED",
      severity: "medium",
      effects: { corruption: 3, happiness: -2, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.edu_exam_scandal,
    }),
  },
  {
    id: "edu_curriculum_dispute",
    check: (s) => educationReady(s) && schoolsPresent(s) && sponsoredFaiths(s).length > 0,
    weight: () => 0.35,
    cooldownTicks: 70,
    generate: () => ({
      id: "edu_curriculum_dispute",
      title: "CURRICULUM DISPUTE — DOCTRINE IN THE CLASSROOM",
      severity: "medium",
      effects: { happiness: -1, unrest: 1, corruption: 1 },
      responseOptions: OFFICER_RESPONSES.edu_curriculum_dispute,
    }),
  },
  {
    id: "edu_field_school_expedition",
    check: (s) => educationReady(s) && buildingCount(s, "planetaryFieldSchool") >= 1,
    weight: () => 0.3,
    cooldownTicks: 75,
    generate: () => ({
      id: "edu_field_school_expedition",
      title: "FIELD SCHOOL — EXPEDITION REQUEST",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.edu_field_school_expedition,
    }),
  },
  {
    id: "edu_marine_school_incident",
    check: (s) => educationReady(s) && buildingCount(s, "marineTrainingSchool") >= 1,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "edu_marine_school_incident",
      title: "MARINE SCHOOL — TRAINING ACCIDENT",
      severity: "medium",
      effects: { happiness: -3, unrest: 2, defenseRating: -1 },
      responseOptions: OFFICER_RESPONSES.edu_marine_school_incident,
    }),
  },
  {
    id: "edu_mass_dropout",
    check: (s) => educationReady(s) && (s.demographics?.literacyRate ?? 100) < 55 && (s.cityStats?.unrest ?? 0) >= 25,
    weight: () => 0.5,
    cooldownTicks: 65,
    generate: (s) => ({
      id: "edu_mass_dropout",
      title: "MASS DROPOUT — STUDENTS WALKING AWAY",
      severity: "high",
      effects: scaleEffects({ unrest: 3, happiness: -3, crime: 3, employment: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.edu_mass_dropout,
    }),
  },
  {
    id: "edu_prodigy_discovered",
    check: (s) => educationReady(s) && (s.totalTicks ?? 0) >= 60 && (s.cityStats?.education ?? 0) >= 70,
    weight: () => 0.25,
    cooldownTicks: 80,
    generate: () => ({
      id: "edu_prodigy_discovered",
      title: "PRODIGY DISCOVERED — UNDERCITY CHILD, REMARKABLE TEST",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: OFFICER_RESPONSES.edu_prodigy_discovered,
    }),
  },
  {
    id: "spo_championship_won",
    check: (s) => entertainmentReady(s) && (s.cityStats?.happiness ?? 0) >= 55,
    weight: () => 0.25,
    cooldownTicks: 80,
    generate: () => ({
      id: "spo_championship_won",
      title: "CHAMPIONSHIP WON — CITY TEAM TAKES THE TITLE",
      severity: "low",
      effects: { happiness: 3, unrest: -1 },
      responseOptions: OFFICER_RESPONSES.spo_championship_won,
    }),
  },
  {
    id: "spo_championship_lost",
    check: (s) => entertainmentReady(s) && (s.cityStats?.happiness ?? 100) < 50,
    weight: () => 0.3,
    cooldownTicks: 70,
    generate: (s) => ({
      id: "spo_championship_lost",
      title: "CHAMPIONSHIP LOST — CITY TEAM CRUSHED",
      severity: "medium",
      effects: scaleEffects({ happiness: -3, unrest: 2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.spo_championship_lost,
    }),
  },
  {
    id: "spo_match_riot",
    check: (s) => entertainmentReady(s) && entertainmentPresent(s) && (s.cityStats?.unrest ?? 0) >= 40,
    weight: () => 0.5,
    cooldownTicks: 65,
    generate: (s) => ({
      id: "spo_match_riot",
      title: "MATCH-DAY RIOT — TERRACES ON FIRE",
      severity: "high",
      effects: scaleEffects({ unrest: 4, crime: 3, happiness: -3, lawOrder: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.spo_match_riot,
    }),
  },
  {
    id: "spo_doping_scandal",
    check: (s) => entertainmentReady(s) && (s.cityStats?.corruption ?? 0) >= 30,
    weight: () => 0.4,
    cooldownTicks: 75,
    generate: () => ({
      id: "spo_doping_scandal",
      title: "DOPING SCANDAL — CITY ATHLETES TEST POSITIVE",
      severity: "medium",
      effects: { corruption: 3, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.spo_doping_scandal,
    }),
  },
  {
    id: "spo_star_athlete_emerges",
    check: (s) => entertainmentReady(s) && (s.cityStats?.population ?? 0) >= 20000 && (s.cityStats?.happiness ?? 0) >= 50,
    weight: () => 0.25,
    cooldownTicks: 80,
    generate: () => ({
      id: "spo_star_athlete_emerges",
      title: "STAR ATHLETE EMERGES — RECORDS FALLING",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: OFFICER_RESPONSES.spo_star_athlete_emerges,
    }),
  },
  {
    id: "spo_athlete_defection",
    check: (s) => entertainmentReady(s) && (s.cityStats?.happiness ?? 100) < 45 && (s.totalTicks ?? 0) >= 60,
    weight: () => 0.35,
    cooldownTicks: 70,
    generate: () => ({
      id: "spo_athlete_defection",
      title: "ATHLETE DEFECTION — FRANCHISE CAPTAIN LEAVING",
      severity: "medium",
      effects: { happiness: -2, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.spo_athlete_defection,
    }),
  },
  {
    id: "spo_underground_fight_ring",
    check: (s) => entertainmentReady(s) && (s.cityStats?.crime ?? 0) >= 50,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: (s) => ({
      id: "spo_underground_fight_ring",
      title: "UNDERGROUND FIGHT RINGS — RECORD CROWDS",
      severity: "medium",
      effects: scaleEffects({ crime: 3, corruption: 2, happiness: 1 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.spo_underground_fight_ring,
    }),
  },
  {
    id: "spo_stadium_collapse",
    check: (s) => entertainmentReady(s) && entertainmentPresent(s) && (s.cityStats?.corruption ?? 0) >= 35,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: (s) => ({
      id: "spo_stadium_collapse",
      title: "STADIUM COLLAPSE — CASUALTIES IN THE STANDS",
      severity: "high",
      effects: scaleEffects({ happiness: -5, unrest: 3, lawOrder: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.spo_stadium_collapse,
    }),
  },
  {
    id: "spo_olympic_bid",
    check: (s) => entertainmentReady(s) && (s.cityStats?.happiness ?? 0) >= 60 && (s.resources?.credits ?? 0) >= 30000 && (s.totalTicks ?? 0) >= 80,
    weight: () => 0.2,
    cooldownTicks: 90,
    generate: () => ({
      id: "spo_olympic_bid",
      title: "OLYMPIC BID — INTER-MEGACITY GAMES OPEN FOR HOSTING",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.spo_olympic_bid,
    }),
  },
  {
    id: "spo_match_fixing",
    check: (s) => entertainmentReady(s) && (s.cityStats?.corruption ?? 0) >= 40 && (s.cityStats?.crime ?? 0) >= 35,
    weight: () => 0.4,
    cooldownTicks: 75,
    generate: () => ({
      id: "spo_match_fixing",
      title: "MATCH-FIXING SYNDICATE — LEAGUE COMPROMISED",
      severity: "medium",
      effects: { corruption: 3, crime: 2, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.spo_match_fixing,
    }),
  },
  {
    id: "spo_grassroots_league",
    check: (s) => entertainmentReady(s) && (s.cityStats?.happiness ?? 100) >= 40 && (s.cityStats?.happiness ?? 100) <= 70,
    weight: () => 0.25,
    cooldownTicks: 75,
    generate: () => ({
      id: "spo_grassroots_league",
      title: "GRASSROOTS LEAGUE PROPOSAL — DISTRICT PITCHES",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.spo_grassroots_league,
    }),
  },
  {
    id: "spo_youth_riot",
    check: (s) => entertainmentReady(s) && (s.cityStats?.crime ?? 0) >= 45 && (s.cityStats?.happiness ?? 100) < 40,
    weight: () => 0.45,
    cooldownTicks: 65,
    generate: (s) => ({
      id: "spo_youth_riot",
      title: "YOUTH RIOTS — FANBASE SPILLS INTO THE STREETS",
      severity: "high",
      effects: scaleEffects({ crime: 4, unrest: 4, happiness: -3 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.spo_youth_riot,
    }),
  },
  {
    id: "cb_endorsement_offer",
    check: (s) => entertainmentReady(s) && mediaInfluence(s) >= 50,
    weight: () => 0.25,
    cooldownTicks: 75,
    generate: () => ({
      id: "cb_endorsement_offer",
      title: "ENDORSEMENT OFFER — TOP-FIVE CELEBRITY APPROACHES",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.cb_endorsement_offer,
    }),
  },
  {
    id: "cb_celebrity_overdose",
    check: (s) => entertainmentReady(s) && (s.cityStats?.crime ?? 0) >= 30 && (s.totalTicks ?? 0) >= 50,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "cb_celebrity_overdose",
      title: "CELEBRITY OVERDOSE — A-LIST DEATH",
      severity: "medium",
      effects: { happiness: -3, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.cb_celebrity_overdose,
    }),
  },
  {
    id: "cb_celebrity_political_run",
    check: (s) => entertainmentReady(s) && mediaInfluence(s) >= 60 && (s.cityStats?.happiness ?? 0) >= 55,
    weight: () => 0.3,
    cooldownTicks: 90,
    generate: () => ({
      id: "cb_celebrity_political_run",
      title: "CELEBRITY POLITICAL RUN — CHALLENGER ANNOUNCES",
      severity: "medium",
      effects: { happiness: 1, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.cb_celebrity_political_run,
    }),
  },
  {
    id: "cb_paparazzi_scandal",
    check: (s) => entertainmentReady(s) && mediaInfluence(s) >= 40,
    weight: () => 0.25,
    cooldownTicks: 70,
    generate: () => ({
      id: "cb_paparazzi_scandal",
      title: "PAPARAZZI SCANDAL — INVASIVE COVERAGE",
      severity: "low",
      effects: { happiness: -1 },
      responseOptions: OFFICER_RESPONSES.cb_paparazzi_scandal,
    }),
  },
  {
    id: "cb_charity_initiative",
    check: (s) => entertainmentReady(s) && mediaInfluence(s) >= 45 && (s.cityStats?.happiness ?? 100) <= 60,
    weight: () => 0.3,
    cooldownTicks: 75,
    generate: () => ({
      id: "cb_charity_initiative",
      title: "CHARITY INITIATIVE — CELEBRITY-BACKED RELIEF",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: OFFICER_RESPONSES.cb_charity_initiative,
    }),
  },
  {
    id: "cb_propaganda_collaboration",
    check: (s) => entertainmentReady(s) && (sponsoredFaiths(s).length > 0 || buildingCount(s, "propagandaBroadcastingTowers") >= 1),
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "cb_propaganda_collaboration",
      title: "PROPAGANDA COLLABORATION — CELEBRITY OFFERS VOICE",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.cb_propaganda_collaboration,
    }),
  },
  {
    id: "cb_celebrity_assassination_attempt",
    check: (s) => entertainmentReady(s) && (s.cityStats?.crime ?? 0) >= 50 && mediaInfluence(s) >= 50,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "cb_celebrity_assassination_attempt",
      title: "ASSASSINATION ATTEMPT — CELEBRITY TARGETED",
      severity: "high",
      effects: { unrest: 2, happiness: -2, crime: 2 },
      responseOptions: OFFICER_RESPONSES.cb_celebrity_assassination_attempt,
    }),
  },
  {
    id: "cb_reality_show_proposal",
    check: (s) => entertainmentReady(s) && entertainmentPresent(s) && mediaInfluence(s) >= 40,
    weight: () => 0.25,
    cooldownTicks: 75,
    generate: () => ({
      id: "cb_reality_show_proposal",
      title: "REALITY SHOW PROPOSAL — CITY-WIDE CASTING",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.cb_reality_show_proposal,
    }),
  },
  {
    id: "cb_celebrity_tax_evasion",
    check: (s) => entertainmentReady(s) && mediaInfluence(s) >= 45 && (s.cityStats?.corruption ?? 0) >= 30,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "cb_celebrity_tax_evasion",
      title: "CELEBRITY TAX EVASION — AUDITORS HAVE EVIDENCE",
      severity: "medium",
      effects: { corruption: 2, happiness: -1 },
      responseOptions: OFFICER_RESPONSES.cb_celebrity_tax_evasion,
    }),
  },
  {
    id: "cb_pop_idol_emerges",
    check: (s) => entertainmentReady(s) && (s.cityStats?.happiness ?? 0) >= 45 && (s.totalTicks ?? 0) >= 40,
    weight: () => 0.25,
    cooldownTicks: 80,
    generate: () => ({
      id: "cb_pop_idol_emerges",
      title: "POP IDOL EMERGES — VIRAL TRACK FROM THE LOWER DISTRICTS",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: OFFICER_RESPONSES.cb_pop_idol_emerges,
    }),
  },
  {
    id: "cb_celebrity_marriage_event",
    check: (s) => entertainmentReady(s) && mediaInfluence(s) >= 50 && (s.cityStats?.happiness ?? 0) >= 55,
    weight: () => 0.2,
    cooldownTicks: 90,
    generate: () => ({
      id: "cb_celebrity_marriage_event",
      title: "CELEBRITY MARRIAGE — CIVIC EVENT OF THE SEASON",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: OFFICER_RESPONSES.cb_celebrity_marriage_event,
    }),
  },
  {
    id: "cb_anti_state_song",
    check: (s) => entertainmentReady(s) && (s.cityStats?.unrest ?? 0) >= 40 && mediaInfluence(s) >= 40,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: (s) => ({
      id: "cb_anti_state_song",
      title: "ANTI-STATE SONG — VIRAL PROTEST ANTHEM",
      severity: "medium",
      effects: scaleEffects({ unrest: 3, happiness: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.cb_anti_state_song,
    }),
  },
  {
    id: "pri_overcrowding",
    check: (s) => prisonReady(s) && getIncarcerationSummary(s).overcrowding > 0,
    weight: () => 0.45,
    cooldownTicks: 75,
    generate: () => ({
      id: "pri_overcrowding",
      title: "PRISON OVERCROWDING — CAPACITY EXCEEDED",
      severity: "medium",
      effects: { unrest: 2, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.pri_overcrowding,
    }),
  },
  {
    id: "pri_riot",
    check: (s) => prisonReady(s) && prisonPop(s) >= 1500 && (s.cityStats?.unrest ?? 0) >= 40,
    weight: () => 0.5,
    cooldownTicks: 65,
    generate: () => ({
      id: "pri_riot",
      title: "PRISON RIOT — D-BLOCK SEIZED",
      severity: "high",
      effects: { unrest: 4, crime: 2, lawOrder: -3, happiness: -3 },
      responseOptions: OFFICER_RESPONSES.pri_riot,
    }),
  },
  {
    id: "pri_escape",
    check: (s) => prisonReady(s) && prisonPop(s) >= 1500 && ((s.cityStats?.corruption ?? 0) >= 30 || (s.cityStats?.crime ?? 0) >= 45),
    weight: () => 0.35,
    cooldownTicks: 70,
    generate: () => ({
      id: "pri_escape",
      title: "PRISON ESCAPE — INMATES AT LARGE",
      severity: "high",
      effects: { crime: 3, unrest: 2, lawOrder: -2, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.pri_escape,
    }),
  },
  {
    id: "pri_corrupt_warden",
    check: (s) => prisonReady(s) && prisonPop(s) >= 1000 && (s.cityStats?.corruption ?? 0) >= 40,
    weight: () => 0.4,
    cooldownTicks: 75,
    generate: () => ({
      id: "pri_corrupt_warden",
      title: "CORRUPT WARDEN — SMUGGLING NETWORK INSIDE",
      severity: "medium",
      effects: { corruption: 3, happiness: -1 },
      responseOptions: OFFICER_RESPONSES.pri_corrupt_warden,
    }),
  },
  {
    id: "pri_hunger_strike",
    check: (s) => prisonReady(s) && prisonPop(s) >= 1500 && (s.cityStats?.happiness ?? 100) < 50,
    weight: () => 0.35,
    cooldownTicks: 70,
    generate: () => ({
      id: "pri_hunger_strike",
      title: "PRISON HUNGER STRIKE — THIRD WEEK",
      severity: "medium",
      effects: { happiness: -2, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.pri_hunger_strike,
    }),
  },
  {
    id: "pri_celebrity_inmate",
    check: (s) => prisonReady(s) && mediaInfluence(s) >= 45 && prisonPop(s) >= 1000,
    weight: () => 0.25,
    cooldownTicks: 90,
    generate: () => ({
      id: "pri_celebrity_inmate",
      title: "CELEBRITY INMATE — PROCESSING TONIGHT",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.pri_celebrity_inmate,
    }),
  },
  {
    id: "pri_forced_labor_proposal",
    check: (s) => prisonReady(s) && prisonPop(s) >= 2000 && (s.resources?.credits ?? 0) < 30000,
    weight: () => 0.3,
    cooldownTicks: 85,
    generate: () => ({
      id: "pri_forced_labor_proposal",
      title: "FORCED LABOR PROPOSAL — TREASURY OFFICE",
      severity: "low",
      effects: { happiness: -1 },
      responseOptions: OFFICER_RESPONSES.pri_forced_labor_proposal,
    }),
  },
  {
    id: "pri_radicalization_ring",
    check: (s) => prisonReady(s) && prisonPop(s) >= 1500 && (s.cityStats?.unrest ?? 0) >= 35,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "pri_radicalization_ring",
      title: "RADICALIZATION RING — INSIDE THE BLOCKS",
      severity: "medium",
      effects: { crime: 2, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.pri_radicalization_ring,
    }),
  },
  {
    id: "pri_wrongful_conviction",
    check: (s) => prisonReady(s) && prisonPop(s) >= 1500 && (s.cityStats?.corruption ?? 0) >= 35,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "pri_wrongful_conviction",
      title: "WRONGFUL CONVICTION — DNA EVIDENCE EMERGES",
      severity: "medium",
      effects: { happiness: -2, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.pri_wrongful_conviction,
    }),
  },
  {
    id: "pri_juvenile_pipeline",
    check: (s) => prisonReady(s) && (s.cityStats?.crime ?? 0) >= 50 && prisonPop(s) >= 1500,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "pri_juvenile_pipeline",
      title: "JUVENILE PIPELINE — RECORD ARRESTS",
      severity: "medium",
      effects: { crime: 2, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.pri_juvenile_pipeline,
    }),
  },
  {
    id: "pri_amnesty_petition",
    check: (s) => prisonReady(s) && prisonPop(s) >= 2000 && (s.cityStats?.happiness ?? 0) >= 45 && (s.cityStats?.happiness ?? 100) <= 70,
    weight: () => 0.25,
    cooldownTicks: 85,
    generate: () => ({
      id: "pri_amnesty_petition",
      title: "AMNESTY PETITION — CIVIC GROUPS DELIVER SIGNATURES",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.pri_amnesty_petition,
    }),
  },
  {
    id: "pri_private_contract_offer",
    check: (s) => prisonReady(s) && prisonPop(s) >= 2000 && (s.resources?.credits ?? 0) < 25000,
    weight: () => 0.25,
    cooldownTicks: 90,
    generate: () => ({
      id: "pri_private_contract_offer",
      title: "PRIVATE CONTRACT OFFER — CARCERAL CORP BIDS",
      severity: "low",
      effects: { happiness: -1 },
      responseOptions: OFFICER_RESPONSES.pri_private_contract_offer,
    }),
  },
  {
    id: "swr_main_collapse",
    check: (s) => sewerReady(s) && sewerInfra(s) <= 2 && (s.cityStats?.population ?? 0) >= 30000,
    weight: () => 0.4,
    cooldownTicks: 90,
    generate: (s) => ({
      id: "swr_main_collapse",
      title: "SEWER MAIN COLLAPSE — DOWNTOWN OUTAGE",
      severity: "high",
      effects: scaleEffects({ happiness: -4, unrest: 2, water: -10 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.swr_main_collapse,
    }),
  },
  {
    id: "swr_disease_outbreak",
    check: (s) => sewerReady(s) && sanitationLevel(s) < 50 && (s.cityStats?.happiness ?? 100) < 55,
    weight: () => 0.45,
    cooldownTicks: 70,
    generate: (s) => ({
      id: "swr_disease_outbreak",
      title: "SEWER-BORNE DISEASE OUTBREAK",
      severity: "high",
      effects: scaleEffects({ happiness: -3, unrest: 2, medSupplies: -15 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.swr_disease_outbreak,
    }),
  },
  {
    id: "swr_flood_backup",
    check: (s) => sewerReady(s) && buildingCount(s, "stormDrainMegaSystems") === 0 && (s.cityStats?.population ?? 0) >= 20000,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "swr_flood_backup",
      title: "FLOOD BACKUP — DRAINAGE OVERWHELMED",
      severity: "medium",
      effects: { happiness: -2, water: -5 },
      responseOptions: OFFICER_RESPONSES.swr_flood_backup,
    }),
  },
  {
    id: "swr_undercity_methane",
    check: (s) => sewerReady(s) && sewerInfra(s) <= 3 && (s.totalTicks ?? 0) >= 40,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "swr_undercity_methane",
      title: "UNDERCITY METHANE BUILDUP — IGNITION RISK",
      severity: "medium",
      effects: { happiness: -1, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.swr_undercity_methane,
    }),
  },
  {
    id: "swr_pipe_strike",
    check: (s) => sewerReady(s) && (s.cityStats?.happiness ?? 100) < 55 && (s.cityStats?.unrest ?? 0) >= 30,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: () => ({
      id: "swr_pipe_strike",
      title: "SANITATION WORKERS' STRIKE — PIPES SILENT",
      severity: "medium",
      effects: { happiness: -2, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.swr_pipe_strike,
    }),
  },
  {
    id: "swr_toxic_spill",
    check: (s) => sewerReady(s) && sanitationLevel(s) < 60 && (s.cityStats?.corruption ?? 0) >= 25,
    weight: () => 0.3,
    cooldownTicks: 75,
    generate: () => ({
      id: "swr_toxic_spill",
      title: "TOXIC SPILL IN THE SEWER NETWORK",
      severity: "high",
      effects: { happiness: -3, water: -10, medSupplies: -10, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.swr_toxic_spill,
    }),
  },
  {
    id: "swr_undercity_dwellers",
    check: (s) => sewerReady(s) && (s.cityStats?.happiness ?? 100) < 50 && (s.totalTicks ?? 0) >= 50,
    weight: () => 0.3,
    cooldownTicks: 85,
    generate: () => ({
      id: "swr_undercity_dwellers",
      title: "UNDERCITY DWELLERS — THOUSANDS LIVING IN THE TUNNELS",
      severity: "low",
      effects: { happiness: -1, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.swr_undercity_dwellers,
    }),
  },
  {
    id: "swr_water_contamination",
    check: (s) => sewerReady(s) && sanitationLevel(s) < 45,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: (s) => ({
      id: "swr_water_contamination",
      title: "WATER CONTAMINATION — CROSS-CONNECTION DETECTED",
      severity: "high",
      effects: scaleEffects({ happiness: -3, water: -15, medSupplies: -10 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.swr_water_contamination,
    }),
  },
  {
    id: "swr_rat_swarm",
    check: (s) => sewerReady(s) && sanitationLevel(s) < 55,
    weight: () => 0.3,
    cooldownTicks: 70,
    generate: () => ({
      id: "swr_rat_swarm",
      title: "RAT SWARM — MARKET DISTRICT OVERRUN",
      severity: "medium",
      effects: { happiness: -2, food: -5 },
      responseOptions: OFFICER_RESPONSES.swr_rat_swarm,
    }),
  },
  {
    id: "swr_corrupt_inspector",
    check: (s) => sewerReady(s) && (s.cityStats?.corruption ?? 0) >= 35 && sewerInfra(s) >= 1,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "swr_corrupt_inspector",
      title: "CORRUPT SEWER INSPECTORS — BRIBERY RING EXPOSED",
      severity: "medium",
      effects: { corruption: 3, happiness: -1 },
      responseOptions: OFFICER_RESPONSES.swr_corrupt_inspector,
    }),
  },
  {
    id: "swr_treatment_breakthrough",
    check: (s) => sewerReady(s) && sewerInfra(s) >= 2 && (s.cityStats?.happiness ?? 0) >= 50 && (s.totalTicks ?? 0) >= 60,
    weight: () => 0.2,
    cooldownTicks: 90,
    generate: () => ({
      id: "swr_treatment_breakthrough",
      title: "TREATMENT BREAKTHROUGH — NEW PROCESS PROVEN",
      severity: "low",
      effects: { happiness: 2, water: 5 },
      responseOptions: OFFICER_RESPONSES.swr_treatment_breakthrough,
    }),
  },
  {
    id: "swr_drainage_referendum",
    check: (s) => sewerReady(s) && (s.cityStats?.happiness ?? 0) >= 45 && (s.cityStats?.happiness ?? 100) <= 75 && (s.totalTicks ?? 0) >= 80,
    weight: () => 0.25,
    cooldownTicks: 95,
    generate: () => ({
      id: "swr_drainage_referendum",
      title: "DRAINAGE REFERENDUM — VOTERS DEMAND ACTION",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.swr_drainage_referendum,
    }),
  },
  {
    id: "tour_attraction_proposal",
    check: (s) => tourismReady(s) && tourismInfra(s) <= 2 && (s.cityStats?.population ?? 0) >= 25000,
    weight: () => 0.25,
    cooldownTicks: 95,
    generate: () => ({
      id: "tour_attraction_proposal",
      title: "ATTRACTION PROPOSAL — OBSERVATION TOWER PITCHED",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.tour_attraction_proposal,
    }),
  },
  {
    id: "tour_overcrowding",
    check: (s) => tourismReady(s) && tourismCapacity(s) > 0 && touristCount(s) > tourismCapacity(s),
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: () => ({
      id: "tour_overcrowding",
      title: "TOURIST OVERCROWDING — RESIDENTS REVOLT",
      severity: "medium",
      effects: { happiness: -2, unrest: 1, tradeIncome: 1 },
      responseOptions: OFFICER_RESPONSES.tour_overcrowding,
    }),
  },
  {
    id: "tour_review_scandal",
    check: (s) => tourismReady(s) && tourismSatisfaction(s) < 40 && tourismInfra(s) >= 1,
    weight: () => 0.4,
    cooldownTicks: 75,
    generate: () => ({
      id: "tour_review_scandal",
      title: "REVIEW SCANDAL — CITY DESTROYED ON THE NETS",
      severity: "medium",
      effects: { happiness: -1, tradeIncome: -2 },
      responseOptions: OFFICER_RESPONSES.tour_review_scandal,
    }),
  },
  {
    id: "tour_tourist_robbery",
    check: (s) => tourismReady(s) && (s.cityStats?.crime ?? 0) >= 35 && touristCount(s) >= 100,
    weight: () => 0.4,
    cooldownTicks: 70,
    generate: () => ({
      id: "tour_tourist_robbery",
      title: "TOURIST ROBBERY EPIDEMIC",
      severity: "medium",
      effects: { happiness: -1, crime: 1, tradeIncome: -1 },
      responseOptions: OFFICER_RESPONSES.tour_tourist_robbery,
    }),
  },
  {
    id: "tour_celebrity_endorsement",
    check: (s) => tourismReady(s) && tourismInfra(s) >= 2 && (s.cityStats?.happiness ?? 0) >= 50,
    weight: () => 0.2,
    cooldownTicks: 100,
    generate: () => ({
      id: "tour_celebrity_endorsement",
      title: "CELEBRITY ENDORSEMENT OFFER",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.tour_celebrity_endorsement,
    }),
  },
  {
    id: "tour_xeno_diplomatic_visit",
    check: (s) => tourismReady(s) && (s.totalTicks ?? 0) >= 60 && tourismInfra(s) >= 3,
    weight: () => 0.15,
    cooldownTicks: 110,
    generate: () => ({
      id: "tour_xeno_diplomatic_visit",
      title: "XENO DIPLOMATIC TOURISM VISIT",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.tour_xeno_diplomatic_visit,
    }),
  },
  {
    id: "tour_seasonal_collapse",
    check: (s) => tourismReady(s) && tourismInfra(s) >= 3 && (s.totalTicks ?? 0) >= 70,
    weight: () => 0.25,
    cooldownTicks: 90,
    generate: () => ({
      id: "tour_seasonal_collapse",
      title: "SEASONAL COLLAPSE — OFF-SEASON SLUMP",
      severity: "low",
      effects: { tradeIncome: -2, happiness: -1, employment: -1 },
      responseOptions: OFFICER_RESPONSES.tour_seasonal_collapse,
    }),
  },
  {
    id: "tour_undercity_tour_disaster",
    check: (s) => tourismReady(s) && buildingCount(s, "guidedUndercityTours") >= 1,
    weight: () => 0.25,
    cooldownTicks: 95,
    generate: () => ({
      id: "tour_undercity_tour_disaster",
      title: "UNDERCITY TOUR DISASTER — VISITORS LOST",
      severity: "high",
      effects: { happiness: -3, unrest: 1, tradeIncome: -2, crime: 1 },
      responseOptions: OFFICER_RESPONSES.tour_undercity_tour_disaster,
    }),
  },
  {
    id: "tour_hotel_strike",
    check: (s) => tourismReady(s) && buildingCount(s, "luxurySkyHotels") >= 1 && (s.cityStats?.unrest ?? 0) >= 30,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "tour_hotel_strike",
      title: "LUXURY HOTEL STRIKE — SERVICE STAFF WALK OUT",
      severity: "medium",
      effects: { happiness: -1, unrest: 1, tradeIncome: -2 },
      responseOptions: OFFICER_RESPONSES.tour_hotel_strike,
    }),
  },
  {
    id: "tour_film_location",
    check: (s) => tourismReady(s) && tourismInfra(s) >= 2 && (s.totalTicks ?? 0) >= 50,
    weight: () => 0.2,
    cooldownTicks: 105,
    generate: () => ({
      id: "tour_film_location",
      title: "FILM LOCATION REQUEST — MAJOR PRODUCTION SCOUTING",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.tour_film_location,
    }),
  },
  {
    id: "tour_smuggling_via_tourism",
    check: (s) => tourismReady(s) && touristCount(s) >= 200 && (s.cityStats?.corruption ?? 0) >= 30,
    weight: () => 0.3,
    cooldownTicks: 85,
    generate: () => ({
      id: "tour_smuggling_via_tourism",
      title: "SMUGGLING RING USING TOURISM AS COVER",
      severity: "medium",
      effects: { crime: 2, corruption: 2, tradeIncome: 1 },
      responseOptions: OFFICER_RESPONSES.tour_smuggling_via_tourism,
    }),
  },
  {
    id: "tour_heritage_protest",
    check: (s) => tourismReady(s) && (s.cityStats?.happiness ?? 0) >= 45 && (s.totalTicks ?? 0) >= 65,
    weight: () => 0.25,
    cooldownTicks: 95,
    generate: () => ({
      id: "tour_heritage_protest",
      title: "HERITAGE PROTEST — DEVELOPMENT BLOCKS LANDMARK",
      severity: "low",
      effects: { happiness: -1, unrest: 1 },
      responseOptions: OFFICER_RESPONSES.tour_heritage_protest,
    }),
  },
  {
    id: "tns_skyrail_collapse",
    check: (s) => transitReady(s) && buildingCount(s, "skyrailTransitLines") >= 1 && (s.cityStats?.population ?? 0) >= 30000,
    weight: () => 0.35,
    cooldownTicks: 100,
    generate: (s) => ({
      id: "tns_skyrail_collapse",
      title: "SKYRAIL COLLAPSE — MAJOR LINE DOWN",
      severity: "high",
      effects: scaleEffects({ happiness: -4, unrest: 2, employment: -1 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.tns_skyrail_collapse,
    }),
  },
  {
    id: "tns_overload_crisis",
    check: (s) => transitReady(s) && transitCapacity(s) > 0 && transitLoad(s) > transitCapacity(s),
    weight: () => 0.45,
    cooldownTicks: 70,
    generate: (s) => ({
      id: "tns_overload_crisis",
      title: "TRANSIT OVERLOAD — SYSTEM AT BREAKING POINT",
      severity: "high",
      effects: scaleEffects({ happiness: -3, unrest: 2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.tns_overload_crisis,
    }),
  },
  {
    id: "tns_fare_hike_protest",
    check: (s) => transitReady(s) && (s.cityStats?.unrest ?? 0) >= 35 && transitInfra(s) >= 2,
    weight: () => 0.35,
    cooldownTicks: 80,
    generate: () => ({
      id: "tns_fare_hike_protest",
      title: "FARE HIKE PROTEST — RIDERS BLOCK THE TERMINALS",
      severity: "medium",
      effects: { happiness: -2, unrest: 2 },
      responseOptions: OFFICER_RESPONSES.tns_fare_hike_protest,
    }),
  },
  {
    id: "tns_maglev_proposal",
    check: (s) => transitReady(s) && buildingCount(s, "undergroundMaglevSystem") === 0 && (s.cityStats?.population ?? 0) >= 50000 && (s.totalTicks ?? 0) >= 60,
    weight: () => 0.2,
    cooldownTicks: 110,
    generate: () => ({
      id: "tns_maglev_proposal",
      title: "MAGLEV PROPOSAL — UNDERGROUND NETWORK PITCHED",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.tns_maglev_proposal,
    }),
  },
  {
    id: "tns_vandalism_wave",
    check: (s) => transitReady(s) && (transitVandalism(s) >= 30 || (s.cityStats?.crime ?? 0) >= 40) && transitInfra(s) >= 2,
    weight: () => 0.35,
    cooldownTicks: 75,
    generate: () => ({
      id: "tns_vandalism_wave",
      title: "TRANSIT VANDALISM WAVE",
      severity: "medium",
      effects: { crime: 1, happiness: -2 },
      responseOptions: OFFICER_RESPONSES.tns_vandalism_wave,
    }),
  },
  {
    id: "tns_terminal_attack",
    check: (s) => transitReady(s) && transitInfra(s) >= 3 && (s.cityStats?.defenseRating ?? 100) < 50,
    weight: () => 0.25,
    cooldownTicks: 95,
    generate: (s) => ({
      id: "tns_terminal_attack",
      title: "TRANSIT TERMINAL ATTACK",
      severity: "critical",
      effects: scaleEffects({ happiness: -5, unrest: 3, defenseRating: -2, lawOrder: -2 }, popScale(s)),
      responseOptions: OFFICER_RESPONSES.tns_terminal_attack,
    }),
  },
  {
    id: "tns_driver_strike",
    check: (s) => transitReady(s) && (s.cityStats?.happiness ?? 100) < 55 && (s.cityStats?.unrest ?? 0) >= 30 && transitInfra(s) >= 2,
    weight: () => 0.35,
    cooldownTicks: 80,
    generate: () => ({
      id: "tns_driver_strike",
      title: "TRANSIT OPERATORS' STRIKE — TRAINS HALTED",
      severity: "high",
      effects: { happiness: -3, unrest: 2, tradeIncome: -2, employment: -1 },
      responseOptions: OFFICER_RESPONSES.tns_driver_strike,
    }),
  },
  {
    id: "tns_signal_failure",
    check: (s) => transitReady(s) && transitInfra(s) >= 3 && (s.totalTicks ?? 0) >= 50,
    weight: () => 0.3,
    cooldownTicks: 75,
    generate: () => ({
      id: "tns_signal_failure",
      title: "SIGNAL SYSTEM FAILURE — CITYWIDE OUTAGE",
      severity: "high",
      effects: { happiness: -3, unrest: 1, tradeIncome: -1 },
      responseOptions: OFFICER_RESPONSES.tns_signal_failure,
    }),
  },
  {
    id: "tns_pirate_freight_diversion",
    check: (s) => transitReady(s) && (s.cityStats?.crime ?? 0) >= 35 && transitInfra(s) >= 2,
    weight: () => 0.3,
    cooldownTicks: 80,
    generate: () => ({
      id: "tns_pirate_freight_diversion",
      title: "PIRATE FREIGHT DIVERSION — CARGO LINES HIT",
      severity: "medium",
      effects: { crime: 2, tradeIncome: -2, lawOrder: -1 },
      responseOptions: OFFICER_RESPONSES.tns_pirate_freight_diversion,
    }),
  },
  {
    id: "tns_route_cancellation",
    check: (s) => transitReady(s) && transitInfra(s) >= 2 && (s.resources?.credits ?? 0) < 20000,
    weight: () => 0.25,
    cooldownTicks: 85,
    generate: () => ({
      id: "tns_route_cancellation",
      title: "ROUTE CANCELLATION REVIEW — UNPROFITABLE LINES",
      severity: "low",
      effects: { happiness: -1 },
      responseOptions: OFFICER_RESPONSES.tns_route_cancellation,
    }),
  },
  {
    id: "tns_corporate_acquisition",
    check: (s) => transitReady(s) && transitInfra(s) >= 4 && (s.resources?.credits ?? 0) < 25000,
    weight: () => 0.2,
    cooldownTicks: 110,
    generate: () => ({
      id: "tns_corporate_acquisition",
      title: "CORPORATE ACQUISITION OFFER — TRANSIT AUTHORITY",
      severity: "low",
      effects: { happiness: -1 },
      responseOptions: OFFICER_RESPONSES.tns_corporate_acquisition,
    }),
  },
  {
    id: "tns_emergency_transit_breakthrough",
    check: (s) => transitReady(s) && buildingCount(s, "rapidEmergencyTransitLines") === 0 && transitInfra(s) >= 3 && (s.totalTicks ?? 0) >= 70,
    weight: () => 0.2,
    cooldownTicks: 100,
    generate: () => ({
      id: "tns_emergency_transit_breakthrough",
      title: "EMERGENCY TRANSIT BREAKTHROUGH — RAPID-LINE DESIGN PROVEN",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: OFFICER_RESPONSES.tns_emergency_transit_breakthrough,
    }),
  },
  // Task #480: late-game prosperity pool — golden-age stories for a thriving
  // city. Defined in prosperityTriggers.ts; every entry sets flavor: true.
  ...PROSPERITY_TRIGGERS,
];

function getEventCooldowns(state: GameState): Record<string, number> {
  return state.eventTriggerCooldowns ?? {};
}

// Task #480: ids of existing triggers that are flavor stories (see the
// TriggerCondition.flavor doc above). Kept as a set so ~40 long-shipped
// trigger literals don't each need editing; NEW triggers should set
// `flavor: true` on the definition instead. flavorTriggerIds.test.ts pins
// every entry here to a real CONDITION_TRIGGERS id so typos fail loudly.
export const FLAVOR_TRIGGER_IDS: ReadonlySet<string> = new Set([
  "trade_caravan_arrives",
  "mega_project_milestone",
  "external_trade_dispute",
  "faction_worship",
  "faith_intro_ledger",
  "faith_intro_helix",
  "faith_intro_choir",
  "faith_intro_tidekeepers",
  "faith_intro_catholicism",
  "faith_pilgrimage_arrives",
  "faith_revival_meeting",
  "faith_inquisition_demand",
  "faith_holy_war",
  "faith_apostate_movement",
  "faith_relic_discovery",
  "faith_doomsday_prophet",
  "faith_temple_request",
  "edu_literacy_milestone",
  "edu_breakthrough_paper",
  "edu_curriculum_dispute",
  "edu_field_school_expedition",
  "edu_marine_school_incident",
  "edu_prodigy_discovered",
  "spo_championship_won",
  "spo_championship_lost",
  "spo_star_athlete_emerges",
  "spo_athlete_defection",
  "spo_grassroots_league",
  "spo_doping_scandal",
  "cb_endorsement_offer",
  "cb_celebrity_overdose",
  "cb_celebrity_political_run",
  "cb_paparazzi_scandal",
  "cb_charity_initiative",
  "cb_propaganda_collaboration",
  "cb_celebrity_assassination_attempt",
  "cb_reality_show_proposal",
  "cb_celebrity_tax_evasion",
  "cb_pop_idol_emerges",
  "cb_celebrity_marriage_event",
  "cb_anti_state_song",
  "tour_attraction_proposal",
  "tour_celebrity_endorsement",
  "tour_xeno_diplomatic_visit",
  "tour_seasonal_collapse",
  "tour_film_location",
  "tour_heritage_protest",
  "swr_treatment_breakthrough",
  "swr_drainage_referendum",
  "tns_maglev_proposal",
  "tns_signal_failure",
  "tns_emergency_transit_breakthrough",
  "pri_celebrity_inmate",
  "pri_amnesty_petition",
]);

export function isFlavorTrigger(trigger: TriggerCondition): boolean {
  return trigger.flavor === true || FLAVOR_TRIGGER_IDS.has(trigger.id);
}

// Task #480: recency ramp for flavor triggers. A story that already fired is
// HARD-blocked until twice its base cooldown has passed (weight 0 → cannot
// re-fire even when nothing else is eligible), then its weight climbs back
// linearly, reaching full strength at four cooldowns of age. Effect: repeats
// of any one flavor story are spaced at least 2x its cooldown apart, and even
// past that the picker prefers long-unseen material — the celebrity scandal
// that fired 160 ticks ago no longer ties with the pilgrimage nobody has seen
// for 600 ticks. Never-fired triggers (no stamp) always get full weight.
export function flavorRecencyScale(
  totalTicks: number,
  lastFired: number | undefined,
  cooldownTicks: number,
): number {
  if (lastFired === undefined) return 1;
  const cd = Math.max(1, cooldownTicks);
  const age = totalTicks - lastFired;
  if (age < 2 * cd) return 0;
  return Math.min(1, (age - 2 * cd) / (2 * cd));
}

export function generateConditionEvent(state: GameState): {
  event: GameEvent;
  cooldowns: Record<string, number>;
  eventRecurrenceCounts?: Record<string, number>;
} | null {
  const cooldowns = getEventCooldowns(state);
  const eligible: { trigger: TriggerCondition; weight: number }[] = [];

  for (const trigger of CONDITION_TRIGGERS) {
    // Story-only triggers were retired from the operational event surface.
    // Keep their definitions for old save/news compatibility, but never
    // generate a new card from them.
    if (isRetiredEventId(trigger.id)) continue;
    const lastFired = cooldowns[trigger.id];
    if (lastFired !== undefined && state.totalTicks - lastFired < trigger.cooldownTicks) continue;

    const activeIds = new Set(state.activeEvents.map(e => e.id));
    if (activeIds.has(trigger.id)) continue;

    const recentIds = new Set(state.eventHistory.slice(-8).map(e => e.id));
    if (recentIds.has(trigger.id)) continue;

    if (!trigger.check(state)) continue;

    let w = trigger.weight(state);
    // Task #480: flavor stories the player saw recently are down-weighted so
    // the picker prefers long-unseen material (see flavorRecencyScale).
    if (isFlavorTrigger(trigger)) {
      w *= flavorRecencyScale(state.totalTicks, lastFired, trigger.cooldownTicks);
    }
    if (w > 0) {
      eligible.push({ trigger, weight: w });
    }
  }

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => b.weight - a.weight);

  const roll = Math.random();
  const topWeight = eligible[0].weight;
  if (roll > Math.min(0.7, topWeight + 0.15)) return null;

  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let pick = Math.random() * totalWeight;
  let chosen = eligible[0].trigger;
  for (const e of eligible) {
    pick -= e.weight;
    if (pick <= 0) {
      chosen = e.trigger;
      break;
    }
  }

  const updatedCooldowns = { ...cooldowns, [chosen.id]: state.totalTicks };

  const rawEvent = chosen.generate(state);
  // Tidekeepers Sponsor passive #2: dampen biosphere/sewer/weather event impact.
  // Applied as a single post-trigger scaling so future wx_/sewer_/biosphere_ events
  // inherit the mitigation without per-event code.
  const event =
    isTidekeepersSponsored(state) && tidekeepersMitigatesEvent(rawEvent.id)
      ? { ...rawEvent, effects: scaleEffects(rawEvent.effects, TIDEKEEPERS_EVENT_MITIGATION.scale) }
      : rawEvent;
  // Task #458: a pre-existing cooldown stamp for the chosen id means this
  // exact trigger fired before (stamps are written at fire time and never
  // deleted), so this spawn is the same known condition resurfacing after its
  // cooldown — mark it so the UI can badge it "STILL UNRESOLVED".
  // Task #480: flavor stories are exempt — their re-fires are new stories,
  // not an unresolved condition, so the badge would be a lie.
  const isRepeat = !isFlavorTrigger(chosen) && cooldowns[chosen.id] !== undefined;
  const eventRecurrenceCounts = isRepeat
    ? {
        ...(state.eventRecurrenceCounts ?? {}),
        [chosen.id]: (state.eventRecurrenceCounts?.[chosen.id] ?? 0) + 1,
      }
    : state.eventRecurrenceCounts;
  const returnCount = isRepeat ? eventRecurrenceCounts![chosen.id] : undefined;

  return {
    event: {
      ...event,
      timestamp: Date.now(),
      resolved: false,
      ...(isRepeat ? { repeat: true } : {}),
      ...(returnCount !== undefined ? { returnCount } : {}),
    },
    cooldowns: updatedCooldowns,
    ...(eventRecurrenceCounts ? { eventRecurrenceCounts } : {}),
  };
}
