import type { GameState, EventResponse } from "@/engine/types";
import type { TriggerCondition } from "@/engine/eventTriggers";

// ─────────────────────────────────────────────────────────────────────────────
// Task #480: prosperity event pool — late-game content for a city that is
// WINNING. Almost every other condition trigger gates on failure (crime, low
// food, unrest...), so a perfectly-run city used to go quiet except for a
// handful of celebrity stories on repeat. These triggers gate on the city
// THRIVING and tell golden-age stories: grand projects, rival-megacity
// diplomacy, cultural moments, breakthroughs, wasteland pilgrimages, and the
// problems only prosperity can buy.
//
// Contracts:
//   - Spread into CONDITION_TRIGGERS (eventTriggers.ts) so the picker and
//     eventTriggerSchema.test.ts cover them automatically.
//   - Every generate() is TOTAL: it must never throw on any state (the schema
//     test calls generate(createInitialState()) directly, and its source-scan
//     fallback only reads eventTriggers.ts, not this file).
//   - Every trigger sets flavor: true — re-fires are new stories, never
//     "STILL UNRESOLVED", and the picker's recency ramp spaces them out.
//   - Response effects only use keys the dispatcher reads (see
//     ALLOWED_RESPONSE_EFFECT_KEYS in eventTriggerSchema.test.ts).
//   - Copy rules: ALL-CAPS titles and labels, no emojis, no exclamation marks.
// ─────────────────────────────────────────────────────────────────────────────

// Task #551/#552: the housing/environment terms of the thriving gate, shared
// between cityThriving() and the one-time "what is holding the golden-age
// coverage back" hint so the two can never drift apart.
export const THRIVING_BIOSPHERE_FLOOR = 30;
export const THRIVING_HOUSING_PRESSURE_CAP = 65;

// Task #553: stable id prefix for the one-time prosperity-gate hint message
// (emitProsperityGateHint in tickProcessors.ts). Lives here — a leaf module —
// so the TV-news ticker hook (useNewsHeadlines) can key its seen-id echo on it
// without importing the heavy tickProcessors graph.
export const PROSPERITY_GATE_HINT_ID_PREFIX = "prosperity-gate-hint-";

// The five core bars: near-full employment, content citizens, calm streets,
// clean books. Split out so the Task #552 hint can detect "every core bar
// passes but housing/environment still blocks the pool".
function cityThrivingCoreBars(s: GameState): boolean {
  const c = s.cityStats;
  return (
    (c?.employment ?? 0) >= 80 &&
    (c?.happiness ?? 0) >= 60 &&
    (c?.unrest ?? 100) <= 25 &&
    (c?.crime ?? 100) <= 25 &&
    (c?.corruption ?? 100) <= 30
  );
}

// A city that is visibly working: the core bars above, plus roofs over heads
// and air you can admit to breathing. Thresholds sit low enough that a
// well-run city reaches them without perfection, high enough that a
// struggling one cannot — a housing crisis (pressure > 65) or a wrecked
// biosphere (< 30) disqualifies the "thriving" label outright. Both terms
// stay looser than the golden-age tier below (which demands biosphere >= 55).
export function cityThriving(s: GameState): boolean {
  const c = s.cityStats;
  return (
    cityThrivingCoreBars(s) &&
    (c?.housingPressure ?? 100) <= THRIVING_HOUSING_PRESSURE_CAP &&
    (c?.biosphere ?? 0) >= THRIVING_BIOSPHERE_FLOOR
  );
}

// Task #552: when the city clears every core bar but the housing/environment
// terms still hold the prosperity pool shut, report which term is blocking so
// the one-time advisor hint can name the fix. Returns null when the city is
// either fully thriving or short on a core bar (no hint in either case).
export function prosperityGateBlock(
  s: GameState,
): { biosphereBlocked: boolean; housingBlocked: boolean } | null {
  if (!cityThrivingCoreBars(s)) return null;
  const c = s.cityStats;
  const biosphereBlocked = (c?.biosphere ?? 0) < THRIVING_BIOSPHERE_FLOOR;
  const housingBlocked =
    (c?.housingPressure ?? 100) > THRIVING_HOUSING_PRESSURE_CAP;
  if (!biosphereBlocked && !housingBlocked) return null;
  return { biosphereBlocked, housingBlocked };
}

// The stricter tier: a genuine golden age. Reserved for the showpiece events.
export function cityGoldenAge(s: GameState): boolean {
  const c = s.cityStats;
  return (
    cityThriving(s) &&
    (c?.happiness ?? 0) >= 72 &&
    (c?.unrest ?? 100) <= 12 &&
    (c?.biosphere ?? 0) >= 55
  );
}

const ticksAtLeast = (s: GameState, n: number) => (s.totalTicks ?? 0) >= n;

export const PROSPERITY_RESPONSES: Record<string, EventResponse[]> = {
  pros_golden_age_declared: [
    { id: "pga_parade", label: "STAGE A TRIUMPH PARADE", effects: { credits: -12000, happiness: 5, unrest: -2 } },
    { id: "pga_address", label: "DELIVER A STATE ADDRESS", effects: { happiness: 3, lawOrder: 2 } },
    { id: "pga_humble", label: "DECLINE THE CEREMONY", effects: { lawOrder: 3, happiness: -1 } },
    { id: "pga_coin", label: "MINT A COMMEMORATIVE COIN", effects: { credits: -6000, happiness: 2 } },
  ],
  pros_monument_commission: [
    { id: "pmc_colossus", label: "APPROVE THE COLOSSUS", effects: { credits: -25000, happiness: 3, unrest: 1 } },
    { id: "pmc_workers", label: "MONUMENT TO THE WORKERS", effects: { credits: -15000, happiness: 5, unrest: -2 } },
    { id: "pmc_fountain", label: "BUILD A PUBLIC FOUNTAIN", effects: { credits: -10000, happiness: 4 } },
    { id: "pmc_decline", label: "REJECT THE PROPOSAL", effects: { credits: 0, happiness: -1, lawOrder: 1 } },
  ],
  pros_skyline_commission: [
    { id: "psc_spires", label: "FUND THE CROWN SPIRES", effects: { credits: -30000, happiness: 4, tradeIncome: 300 } },
    { id: "psc_gardens", label: "MANDATE SKY GARDENS", effects: { credits: -18000, happiness: 3 } },
    { id: "psc_practical", label: "KEEP IT PRACTICAL", effects: { credits: -5000, lawOrder: 1 } },
  ],
  pros_founders_gala: [
    { id: "pfg_attend", label: "ATTEND AND WORK THE ROOM", effects: { credits: 8000, corruption: 2, happiness: 1 } },
    { id: "pfg_public", label: "OPEN THE GALA TO THE PUBLIC", effects: { credits: -8000, happiness: 4, unrest: -2, corruption: -1 } },
    { id: "pfg_skip", label: "SEND POLITE REGRETS", effects: { lawOrder: 1 } },
    { id: "pfg_audit", label: "AUDIT THE ORGANIZERS", effects: { corruption: -3, happiness: -1, credits: 4000 } },
  ],
  pros_rival_envoy_visit: [
    { id: "pre_tour", label: "GIVE THE FULL TOUR", effects: { tradeIncome: 250, happiness: 1 } },
    { id: "pre_curated", label: "CURATE THE ITINERARY", effects: { defenseRating: 1, tradeIncome: 100 } },
    { id: "pre_mislead", label: "FEED THEM FALSE FIGURES", effects: { corruption: 2, defenseRating: 2 } },
    { id: "pre_refuse", label: "DENY THE VISA", effects: { unrest: 1, defenseRating: 1, tradeIncome: -100 } },
  ],
  pros_specialist_poaching: [
    { id: "psp_counter", label: "COUNTER-OFFER GENEROUSLY", effects: { credits: -15000, employment: 1, happiness: 1 } },
    { id: "psp_release", label: "LET THEM GO GRACEFULLY", effects: { employment: -1, happiness: 1, tradeIncome: 100 } },
    { id: "psp_contracts", label: "TIGHTEN THE CONTRACTS", effects: { unrest: 2, happiness: -2, employment: 1 } },
    { id: "psp_poach_back", label: "POACH THEIRS IN RETURN", effects: { credits: -10000, employment: 2, corruption: 1 } },
  ],
  pros_trade_summit: [
    { id: "pts_host", label: "HOST THE SUMMIT", effects: { credits: -20000, tradeIncome: 500, happiness: 2 } },
    { id: "pts_delegate", label: "SEND A DELEGATION INSTEAD", effects: { credits: -6000, tradeIncome: 250 } },
    { id: "pts_decline", label: "DECLINE THE INVITATION", effects: { tradeIncome: -150, defenseRating: 1 } },
  ],
  pros_rival_smear: [
    { id: "prs_rebut", label: "PUBLISH THE LEDGERS", effects: { happiness: 2, lawOrder: 1 } },
    { id: "prs_ignore", label: "IGNORE IT ENTIRELY", effects: { happiness: 1 } },
    { id: "prs_counter", label: "COMMISSION A COUNTER-CAMPAIGN", effects: { credits: -8000, corruption: 1, unrest: -1 } },
    { id: "prs_protest", label: "LODGE A FORMAL PROTEST", effects: { lawOrder: 1, happiness: -1 } },
  ],
  pros_sister_city_pact: [
    { id: "psi_sign", label: "SIGN THE PACT", effects: { tradeIncome: 400, happiness: 2, defenseRating: -1 } },
    { id: "psi_trade_only", label: "TRADE CLAUSES ONLY", effects: { tradeIncome: 250 } },
    { id: "psi_decline", label: "DECLINE POLITELY", effects: { defenseRating: 1, tradeIncome: -100 } },
  ],
  pros_research_renaissance: [
    { id: "prr_fund", label: "DOUBLE THE GRANTS", effects: { credits: -18000, happiness: 2 } },
    { id: "prr_direct", label: "DIRECT THE AGENDA", effects: { credits: -10000, power: 20, medSupplies: 10 } },
    { id: "prr_showcase", label: "STAGE A SCIENCE EXPO", effects: { credits: -8000, happiness: 4 } },
  ],
  pros_medical_breakthrough: [
    { id: "pmb_distribute", label: "FREE DISTRIBUTION", effects: { credits: -12000, medSupplies: 40, happiness: 4 } },
    { id: "pmb_export", label: "LICENSE IT ABROAD", effects: { credits: 20000, tradeIncome: 300, happiness: -1 } },
    { id: "pmb_stockpile", label: "STOCKPILE STRATEGICALLY", effects: { medSupplies: 60, happiness: -2 } },
  ],
  pros_record_harvest: [
    { id: "prh_feast", label: "DECLARE A HARVEST FEAST", effects: { food: -40, happiness: 6, unrest: -3 } },
    { id: "prh_export", label: "EXPORT THE SURPLUS", effects: { food: -60, credits: 18000, tradeIncome: 200 } },
    { id: "prh_reserve", label: "FILL THE GRANARIES", effects: { food: 80, happiness: -1 } },
  ],
  pros_reactor_prototype: [
    { id: "prp_deploy", label: "FUND FULL DEPLOYMENT", effects: { credits: -25000, power: 60, happiness: 2 } },
    { id: "prp_pilot", label: "RUN A PILOT DISTRICT", effects: { credits: -10000, power: 25 } },
    { id: "prp_shelve", label: "SHELVE THE PROTOTYPE", effects: { lawOrder: 1, happiness: -1 } },
  ],
  pros_recovered_archive: [
    { id: "pra_decode", label: "FUND THE DECODING", effects: { credits: -15000, power: 20, tradeIncome: 100 } },
    { id: "pra_museum", label: "DISPLAY IT PUBLICLY", effects: { credits: -5000, happiness: 3 } },
    { id: "pra_vault", label: "SEAL IT IN THE VAULT", effects: { defenseRating: 1 } },
  ],
  pros_festival_of_lights: [
    { id: "pfl_sanction", label: "SANCTION THE FESTIVAL", effects: { credits: -8000, happiness: 5, unrest: -2 } },
    { id: "pfl_sponsor", label: "SPONSOR AND BRAND IT", effects: { credits: -12000, happiness: 3, corruption: 1 } },
    { id: "pfl_permit", label: "REQUIRE PERMITS", effects: { credits: 3000, happiness: -2, lawOrder: 2 } },
  ],
  pros_opera_premiere: [
    { id: "pop_attend", label: "ATTEND OPENING NIGHT", effects: { happiness: 3, credits: -3000 } },
    { id: "pop_censor", label: "CENSOR THE THIRD ACT", effects: { happiness: -2, unrest: 1, lawOrder: 1 } },
    { id: "pop_tour", label: "FUND A SETTLEMENT TOUR", effects: { credits: -10000, tradeIncome: 200, happiness: 2 } },
  ],
  pros_street_food_boom: [
    { id: "psf_deregulate", label: "LOOSEN THE PERMITS", effects: { happiness: 4, employment: 1, credits: 2000 } },
    { id: "psf_license", label: "LICENSE AND INSPECT", effects: { credits: 5000, happiness: 1, lawOrder: 1 } },
    { id: "psf_court", label: "BUILD A VENDOR HALL", effects: { credits: -12000, happiness: 3, employment: 1 } },
  ],
  pros_mural_movement: [
    { id: "pmm_embrace", label: "COMMISSION MORE WALLS", effects: { credits: -5000, happiness: 4, unrest: -1 } },
    { id: "pmm_curate", label: "CURATE THE THEMES", effects: { happiness: 1, lawOrder: 1, unrest: 1 } },
    { id: "pmm_whitewash", label: "PAINT OVER THE LOT", effects: { happiness: -3, unrest: 2, lawOrder: 2 } },
  ],
  pros_film_festival: [
    { id: "pff_host", label: "ROLL OUT THE CARPET", effects: { credits: -8000, happiness: 3, tradeIncome: 150 } },
    { id: "pff_jury", label: "CHAIR THE JURY YOURSELF", effects: { happiness: 2, corruption: 1 } },
    { id: "pff_decline", label: "DECLINE TO HOST", effects: { happiness: -1, tradeIncome: -50 } },
  ],
  pros_wasteland_pilgrimage: [
    { id: "pwp_admit", label: "OPEN PROCESSING LANES", effects: { happiness: 2, employment: -1, food: -20, unrest: 1 } },
    { id: "pwp_tour", label: "OFFER SUPERVISED TOURS", effects: { credits: 6000, tradeIncome: 150, happiness: 1 } },
    { id: "pwp_turn_away", label: "TURN THE COLUMN BACK", effects: { unrest: 2, happiness: -2, defenseRating: 1 } },
  ],
  pros_immigration_surge: [
    { id: "pis_expand", label: "EXPAND INTAKE QUOTAS", effects: { employment: -2, happiness: 2, food: -30, unrest: 1 } },
    { id: "pis_skills", label: "SKILLS-BASED SELECTION", effects: { employment: 1, happiness: 1, unrest: 1 } },
    { id: "pis_freeze", label: "FREEZE ALL INTAKE", effects: { unrest: 2, happiness: -2, lawOrder: 2, defenseRating: 1 } },
  ],
  pros_artisan_caravan: [
    { id: "pac_settle", label: "GRANT RESIDENCY", effects: { employment: 1, happiness: 2, credits: -4000 } },
    { id: "pac_market", label: "HOST A CRAFT MARKET", effects: { credits: 8000, tradeIncome: 150, happiness: 2 } },
    { id: "pac_refuse", label: "SEND THEM ONWARD", effects: { happiness: -1, tradeIncome: -50 } },
  ],
  pros_decadence_wave: [
    { id: "pdw_tax", label: "TAX THE INDULGENCE", effects: { credits: 12000, happiness: -2 } },
    { id: "pdw_permit", label: "LET THEM CELEBRATE", effects: { happiness: 3, employment: -1 } },
    { id: "pdw_campaign", label: "LAUNCH A DISCIPLINE CAMPAIGN", effects: { credits: -5000, happiness: -3, employment: 1, lawOrder: 2 } },
  ],
  pros_elite_enclave: [
    { id: "pee_refuse", label: "REFUSE THE CHARTER", effects: { happiness: 2, unrest: -1, corruption: -2, credits: -2000 } },
    { id: "pee_approve", label: "APPROVE FOR A FEE", effects: { credits: 20000, corruption: 3, unrest: 2, happiness: -2 } },
    { id: "pee_infiltrate", label: "APPROVE AND INFILTRATE", effects: { credits: 10000, corruption: 2, defenseRating: 2 } },
  ],
  pros_overtourism_strain: [
    { id: "pot_cap", label: "CAP DAILY VISITORS", effects: { tradeIncome: -100, happiness: 2, lawOrder: 1 } },
    { id: "pot_fee", label: "CHARGE AN ENTRY FEE", effects: { credits: 10000, tradeIncome: 100, happiness: -1 } },
    { id: "pot_expand", label: "BUILD VISITOR CORRIDORS", effects: { credits: -15000, tradeIncome: 200, happiness: 1 } },
  ],
  pros_speculation_bubble: [
    { id: "psb_cool", label: "COOL THE MARKET", effects: { credits: 8000, happiness: -1, unrest: -1 } },
    { id: "psb_ride", label: "LET IT RIDE", effects: { tradeIncome: 200, corruption: 2, unrest: 1 } },
    { id: "psb_build", label: "FLOOD THE MARKET WITH HOUSING", effects: { credits: -20000, happiness: 3, unrest: -2 } },
  ],
  pros_readiness_audit: [
    { id: "prd_drill", label: "ORDER CITYWIDE DRILLS", effects: { defenseRating: 3, happiness: -2, credits: -6000 } },
    { id: "prd_invest", label: "QUIET MODERNIZATION", effects: { credits: -15000, defenseRating: 2 } },
    { id: "prd_accept", label: "ACCEPT THE SOFTENING", effects: { defenseRating: -2, happiness: 2 } },
  ],
  pros_treasury_surplus: [
    { id: "pty_dividend", label: "PAY A CITIZEN DIVIDEND", effects: { credits: -25000, happiness: 6, unrest: -3 } },
    { id: "pty_fund", label: "FOUND A SOVEREIGN RESERVE", effects: { credits: -15000, defenseRating: 1, lawOrder: 1 } },
    { id: "pty_works", label: "LAUNCH PUBLIC WORKS", effects: { credits: -20000, happiness: 4, employment: 1 } },
  ],
  pros_legacy_question: [
    { id: "plq_builder", label: "THE BUILDER", effects: { happiness: 1 } },
    { id: "plq_guardian", label: "THE GUARDIAN", effects: { lawOrder: 1, defenseRating: 1 } },
    { id: "plq_servant", label: "A PUBLIC SERVANT", effects: { happiness: 2, corruption: -1 } },
    { id: "plq_none", label: "DECLINE TO ANSWER", effects: {} },
  ],
};

export const PROSPERITY_TRIGGERS: TriggerCondition[] = [
  {
    id: "pros_golden_age_declared",
    flavor: true,
    check: (s) => cityGoldenAge(s) && ticksAtLeast(s, 200),
    weight: () => 0.45,
    cooldownTicks: 400,
    generate: (s) => ({
      id: "pros_golden_age_declared",
      title: "A GOLDEN AGE, OFFICIALLY",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: PROSPERITY_RESPONSES.pros_golden_age_declared,
    }),
  },
  {
    id: "pros_monument_commission",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 250),
    weight: () => 0.3,
    cooldownTicks: 350,
    generate: () => ({
      id: "pros_monument_commission",
      title: "MONUMENT COMMISSION CONVENES",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: PROSPERITY_RESPONSES.pros_monument_commission,
    }),
  },
  {
    id: "pros_skyline_commission",
    flavor: true,
    check: (s) => cityThriving(s) && (s.resources?.credits ?? 0) >= 40000 && ticksAtLeast(s, 180),
    weight: () => 0.3,
    cooldownTicks: 300,
    generate: () => ({
      id: "pros_skyline_commission",
      title: "ARCHITECTS PROPOSE CROWN SPIRES",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: PROSPERITY_RESPONSES.pros_skyline_commission,
    }),
  },
  {
    id: "pros_founders_gala",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 150),
    weight: () => 0.3,
    cooldownTicks: 250,
    generate: () => ({
      id: "pros_founders_gala",
      title: "FOUNDERS GALA ANNOUNCED",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_founders_gala,
    }),
  },
  {
    id: "pros_rival_envoy_visit",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 200),
    weight: () => 0.35,
    cooldownTicks: 220,
    generate: () => ({
      id: "pros_rival_envoy_visit",
      title: "RIVAL MEGACITY SENDS ENVOY",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_rival_envoy_visit,
    }),
  },
  {
    id: "pros_specialist_poaching",
    flavor: true,
    check: (s) => cityThriving(s) && (s.cityStats?.employment ?? 0) >= 85 && ticksAtLeast(s, 180),
    weight: () => 0.35,
    cooldownTicks: 200,
    generate: () => ({
      id: "pros_specialist_poaching",
      title: "RIVAL CITY POACHING SPECIALISTS",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_specialist_poaching,
    }),
  },
  {
    id: "pros_trade_summit",
    flavor: true,
    check: (s) => cityThriving(s) && (s.rates?.tradeIncome ?? 0) > 500 && ticksAtLeast(s, 220),
    weight: () => 0.3,
    cooldownTicks: 300,
    generate: () => ({
      id: "pros_trade_summit",
      title: "INTER-CITY TRADE SUMMIT PROPOSED",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_trade_summit,
    }),
  },
  {
    id: "pros_rival_smear",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 250),
    weight: () => 0.3,
    cooldownTicks: 280,
    generate: () => ({
      id: "pros_rival_smear",
      title: "RIVAL BROADCAST QUESTIONS THE BOOM",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_rival_smear,
    }),
  },
  {
    id: "pros_sister_city_pact",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 300),
    weight: () => 0.25,
    cooldownTicks: 400,
    generate: () => ({
      id: "pros_sister_city_pact",
      title: "SISTER-CITY PACT OFFERED",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_sister_city_pact,
    }),
  },
  {
    id: "pros_research_renaissance",
    flavor: true,
    check: (s) => cityThriving(s) && (s.cityStats?.education ?? 0) >= 55 && ticksAtLeast(s, 180),
    weight: () => 0.3,
    cooldownTicks: 250,
    generate: () => ({
      id: "pros_research_renaissance",
      title: "RESEARCH QUARTER FLOURISHING",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: PROSPERITY_RESPONSES.pros_research_renaissance,
    }),
  },
  {
    id: "pros_medical_breakthrough",
    flavor: true,
    check: (s) => cityThriving(s) && (s.cityStats?.publicHealth ?? 0) >= 55 && ticksAtLeast(s, 200),
    weight: () => 0.3,
    cooldownTicks: 300,
    generate: () => ({
      id: "pros_medical_breakthrough",
      title: "CLINICS REPORT TREATMENT BREAKTHROUGH",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: PROSPERITY_RESPONSES.pros_medical_breakthrough,
    }),
  },
  {
    id: "pros_record_harvest",
    flavor: true,
    check: (s) => cityThriving(s) && (s.resources?.food ?? 0) >= 200 && ticksAtLeast(s, 150),
    weight: () => 0.35,
    cooldownTicks: 200,
    generate: () => ({
      id: "pros_record_harvest",
      title: "AGRI-DOMES POST RECORD HARVEST",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: PROSPERITY_RESPONSES.pros_record_harvest,
    }),
  },
  {
    id: "pros_reactor_prototype",
    flavor: true,
    check: (s) => cityThriving(s) && (s.resources?.credits ?? 0) >= 30000 && ticksAtLeast(s, 250),
    weight: () => 0.25,
    cooldownTicks: 350,
    generate: () => ({
      id: "pros_reactor_prototype",
      title: "ENGINEERS UNVEIL CLEAN REACTOR",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_reactor_prototype,
    }),
  },
  {
    id: "pros_recovered_archive",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 280),
    weight: () => 0.25,
    cooldownTicks: 380,
    generate: () => ({
      id: "pros_recovered_archive",
      title: "PRE-COLLAPSE DATA VAULT RECOVERED",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_recovered_archive,
    }),
  },
  {
    id: "pros_festival_of_lights",
    flavor: true,
    check: (s) => cityGoldenAge(s) && ticksAtLeast(s, 150),
    weight: () => 0.4,
    cooldownTicks: 250,
    generate: () => ({
      id: "pros_festival_of_lights",
      title: "CITIZENS PLAN FESTIVAL OF LIGHTS",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: PROSPERITY_RESPONSES.pros_festival_of_lights,
    }),
  },
  {
    id: "pros_opera_premiere",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 220),
    weight: () => 0.25,
    cooldownTicks: 300,
    generate: () => ({
      id: "pros_opera_premiere",
      title: "OPERA HOUSE STAGES CITY'S STORY",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: PROSPERITY_RESPONSES.pros_opera_premiere,
    }),
  },
  {
    id: "pros_street_food_boom",
    flavor: true,
    check: (s) => cityThriving(s) && (s.resources?.food ?? 0) >= 100 && ticksAtLeast(s, 150),
    weight: () => 0.35,
    cooldownTicks: 220,
    generate: () => ({
      id: "pros_street_food_boom",
      title: "STREET FOOD RENAISSANCE UNDERWAY",
      severity: "low",
      effects: { happiness: 2 },
      responseOptions: PROSPERITY_RESPONSES.pros_street_food_boom,
    }),
  },
  {
    id: "pros_mural_movement",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 180),
    weight: () => 0.3,
    cooldownTicks: 240,
    generate: () => ({
      id: "pros_mural_movement",
      title: "MURALS SPREADING ACROSS DISTRICTS",
      severity: "low",
      effects: { happiness: 1 },
      responseOptions: PROSPERITY_RESPONSES.pros_mural_movement,
    }),
  },
  {
    id: "pros_film_festival",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 260),
    weight: () => 0.25,
    cooldownTicks: 320,
    generate: () => ({
      id: "pros_film_festival",
      title: "WASTELAND FILM FESTIVAL SEEKS HOST",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_film_festival,
    }),
  },
  {
    id: "pros_wasteland_pilgrimage",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 200),
    weight: () => 0.35,
    cooldownTicks: 250,
    generate: () => ({
      id: "pros_wasteland_pilgrimage",
      title: "PILGRIMS AT THE GATES",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_wasteland_pilgrimage,
    }),
  },
  {
    id: "pros_immigration_surge",
    flavor: true,
    check: (s) => cityThriving(s) && (s.cityStats?.housingPressure ?? 100) <= 60 && ticksAtLeast(s, 180),
    weight: () => 0.35,
    cooldownTicks: 230,
    generate: () => ({
      id: "pros_immigration_surge",
      title: "INTAKE APPLICATIONS SURGE",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_immigration_surge,
    }),
  },
  {
    id: "pros_artisan_caravan",
    flavor: true,
    check: (s) => cityThriving(s) && ticksAtLeast(s, 160),
    weight: () => 0.3,
    cooldownTicks: 210,
    generate: () => ({
      id: "pros_artisan_caravan",
      title: "MASTER ARTISANS SEEK ENTRY",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_artisan_caravan,
    }),
  },
  {
    id: "pros_decadence_wave",
    flavor: true,
    check: (s) => cityGoldenAge(s) && ticksAtLeast(s, 250),
    weight: () => 0.3,
    cooldownTicks: 300,
    generate: () => ({
      id: "pros_decadence_wave",
      title: "LUXURY SPENDING HITS RECORD",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_decadence_wave,
    }),
  },
  {
    id: "pros_elite_enclave",
    flavor: true,
    check: (s) => cityThriving(s) && (s.resources?.credits ?? 0) >= 25000 && ticksAtLeast(s, 280),
    weight: () => 0.3,
    cooldownTicks: 340,
    generate: () => ({
      id: "pros_elite_enclave",
      title: "WEALTHY DISTRICT PETITIONS FOR CHARTER",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_elite_enclave,
    }),
  },
  {
    id: "pros_overtourism_strain",
    flavor: true,
    check: (s) => cityThriving(s) && (s.rates?.tradeIncome ?? 0) > 300 && ticksAtLeast(s, 240),
    weight: () => 0.3,
    cooldownTicks: 260,
    generate: () => ({
      id: "pros_overtourism_strain",
      title: "VISITOR NUMBERS OVERWHELM DISTRICTS",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_overtourism_strain,
    }),
  },
  {
    id: "pros_speculation_bubble",
    flavor: true,
    check: (s) => cityThriving(s) && (s.rates?.taxIncome ?? 0) > 0 && ticksAtLeast(s, 300),
    weight: () => 0.3,
    cooldownTicks: 320,
    generate: () => ({
      id: "pros_speculation_bubble",
      title: "PROPERTY SPECULATION HEATING UP",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_speculation_bubble,
    }),
  },
  {
    id: "pros_readiness_audit",
    flavor: true,
    check: (s) => cityThriving(s) && (s.cityStats?.defenseRating ?? 0) >= 40 && ticksAtLeast(s, 260),
    weight: () => 0.3,
    cooldownTicks: 300,
    generate: () => ({
      id: "pros_readiness_audit",
      title: "GARRISON AUDIT FLAGS COMPLACENCY",
      severity: "medium",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_readiness_audit,
    }),
  },
  {
    id: "pros_treasury_surplus",
    flavor: true,
    check: (s) => cityThriving(s) && (s.resources?.credits ?? 0) >= 60000 && ticksAtLeast(s, 200),
    weight: () => 0.35,
    cooldownTicks: 300,
    generate: (s) => ({
      id: "pros_treasury_surplus",
      title: "TREASURY POSTS HISTORIC SURPLUS",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_treasury_surplus,
    }),
  },
  {
    id: "pros_legacy_question",
    flavor: true,
    check: (s) => cityGoldenAge(s) && ticksAtLeast(s, 400),
    weight: () => 0.25,
    cooldownTicks: 500,
    generate: () => ({
      id: "pros_legacy_question",
      title: "THE ARCHIVE ASKS A QUESTION",
      severity: "low",
      effects: {},
      responseOptions: PROSPERITY_RESPONSES.pros_legacy_question,
    }),
  },
];
