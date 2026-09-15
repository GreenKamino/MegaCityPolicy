import type { GameEvent, GameState } from "@/engine/types";

/**
 * Event content which is no longer part of the operational event surface.
 *
 * These ids are intentionally kept as data rather than deleting every old
 * definition immediately. Saves can outlive a content release, and an old
 * active card must not be allowed to strand a response or render unresolved
 * flavor tokens. New simulation incidents must not be added here.
 */
export const RETIRED_EVENT_IDS: ReadonlySet<string> = new Set([
  "shadow_cabal_blackmail",
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
  "pros_golden_age_declared",
  "pros_monument_commission",
  "pros_skyline_commission",
  "pros_founders_gala",
  "pros_rival_envoy_visit",
  "pros_specialist_poaching",
  "pros_trade_summit",
  "pros_rival_smear",
  "pros_sister_city_pact",
  "pros_research_renaissance",
  "pros_medical_breakthrough",
  "pros_record_harvest",
  "pros_reactor_prototype",
  "pros_recovered_archive",
  "pros_festival_of_lights",
  "pros_opera_premiere",
  "pros_street_food_boom",
  "pros_mural_movement",
  "pros_film_festival",
  "pros_wasteland_pilgrimage",
  "pros_immigration_surge",
  "pros_artisan_caravan",
  "pros_decadence_wave",
  "pros_elite_enclave",
  "pros_overtourism_strain",
  "pros_speculation_bubble",
  "pros_readiness_audit",
  "pros_treasury_surplus",
  "pros_legacy_question",
]);

/** Story-only chains retired from the active event scheduler. */
export const RETIRED_EVENT_CHAIN_IDS: ReadonlySet<string> = new Set([
  "shadow_cabal_web",
  "quiet_floors",
  "red_door",
]);

export function isRetiredEventId(id: unknown): boolean {
  return typeof id === "string" && RETIRED_EVENT_IDS.has(id);
}

export function isRetiredEventChainId(id: unknown): boolean {
  return typeof id === "string" && RETIRED_EVENT_CHAIN_IDS.has(id);
}

/**
 * Chain stage ids are generated as chain_<chain id>_<stage id>. Prefer the
 * persisted chainId, but recognize generated ids too for old saves written
 * before chainId was persisted on every card.
 */
export function isRetiredEvent(event: Pick<GameEvent, "id" | "chainId">): boolean {
  if (!event || typeof event !== "object") return false;
  if (isRetiredEventId(event.id) || isRetiredEventChainId(event.chainId)) return true;
  if (typeof event.id !== "string" || !event.id.startsWith("chain_")) return false;
  return [...RETIRED_EVENT_CHAIN_IDS].some((chainId) =>
    event.id.startsWith(`chain_${chainId}_`),
  );
}

/**
 * Remove retired cards and chain tombstones at the persistence boundary.
 * Dropping the chain tombstone is important: retaining an unresolved entry
 * for a chain that no longer exists can block future chain scheduling forever.
 */
export function sanitizeRetiredEvents(state: GameState): GameState {
  return {
    ...state,
    activeEvents: Array.isArray(state.activeEvents)
      ? state.activeEvents.filter((event) => !isRetiredEvent(event))
      : [],
    eventHistory: Array.isArray(state.eventHistory)
      ? state.eventHistory.filter((event) => !isRetiredEvent(event))
      : [],
    activeEventChains: Array.isArray(state.activeEventChains)
      ? state.activeEventChains.filter(
          (chain) => !!chain && !isRetiredEventChainId(chain.chainId),
        )
      : [],
  };
}