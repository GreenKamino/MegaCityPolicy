import type { GameState, District, TickEntry, FaithId } from "@/engine/types";
import { getDistrictCategory } from "@/engine/districts";

// Re-export so existing imports of FaithId from "@/engine/faiths" keep working.
// The canonical definition lives in engine/types.ts to avoid an import cycle
// (entity types reference FaithId; faiths.ts already imports GameState).
export type { FaithId };
export type FaithStance = "sponsor" | "tolerate" | "suppress";

export type DistrictFaithShares = Record<FaithId, number>;

export type LeaderCultState = {
  faithId: FaithId;
  declaredAtTick: number;
};

export type FaithState = {
  stances: Record<FaithId, FaithStance>;
  districtShares: Record<string, DistrictFaithShares>;
  leaderCult: LeaderCultState | null;
  lastRenouncedAtTick?: number;
};

export const FAITH_IDS: readonly FaithId[] = [
  "eternal-flame",
  "machine-choir",
  "ancestor-cult",
  "the-ledger",
  "the-tidekeepers",
  "helix-commune",
  "free-choir",
  "catholicism",
] as const;

export type FaithDef = {
  id: FaithId;
  name: string;
  shortName: string;
  description: string;
  factionId?: string;
  // District categories where this faith naturally accelerates drift toward the player's stance.
  affinityCategories: readonly string[];
  // UI bar color. Lives on the def so adding a new faith never requires editing UI files.
  color: string;
};

export const FAITH_DEFS: Record<FaithId, FaithDef> = {
  "eternal-flame": {
    id: "eternal-flame",
    name: "The Eternal Flame",
    shortName: "Eternal Flame",
    description:
      "Reactor-priesthood that worships the fusion cores as sleeping gods. Strongest in energy districts.",
    factionId: "eternal-flame",
    affinityCategories: ["energy", "research"],
    color: "#e94f37",
  },
  "machine-choir": {
    id: "machine-choir",
    name: "The Machine Choir",
    shortName: "Machine Choir",
    description:
      "Industrial congregation that hears divinity in lathe-song and assembly hum. Strongest in foundries and factories.",
    affinityCategories: ["industrial", "transport"],
    color: "#5b9bd5",
  },
  "ancestor-cult": {
    id: "ancestor-cult",
    name: "The Ancestor Cult",
    shortName: "Ancestor Cult",
    description:
      "Undercity sect that venerates the pre-Collapse dead. Thrives in slums where the old names are still spoken.",
    affinityCategories: ["slums", "wasteland", "frontier", "housing"],
    color: "#8d6e63",
  },
  "the-ledger": {
    id: "the-ledger",
    name: "The Ledger",
    shortName: "The Ledger",
    description:
      "Bureaucratic faith that holds every receipt is sacred and every debt eventually balances. Strongest in commercial halls and admin spires.",
    affinityCategories: ["commercial", "admin"],
    color: "#c9a227",
  },
  "the-tidekeepers": {
    id: "the-tidekeepers",
    name: "The Tidekeepers",
    shortName: "Tidekeepers",
    description:
      "Hydraulic priesthood that worships the city's water cycle as a living circulatory system. Strongest in waterworks, biosphere zones, sewer-tending wards, and around wasteland reservoirs.",
    affinityCategories: ["water", "biosphere", "sewer", "wasteland"],
    color: "#3aa3a3",
  },
  "helix-commune": {
    id: "helix-commune",
    name: "The Helix Commune",
    shortName: "Helix Commune",
    description:
      "Gene-modification mystics who treat the genome as scripture and the splice-rig as altar. Strongest in research labs, medical campuses, and the slum clinics that take patients no licensed hospital will. Diaspora of the off-world Helix Commune megacity; antagonistic to the Eternal Flame's flesh-is-sacred doctrine.",
    affinityCategories: ["research", "medical", "slums"],
    color: "#a259c4",
  },
  "free-choir": {
    id: "free-choir",
    name: "The Free Choir",
    shortName: "Free Choir",
    description:
      "Merchant-cult that worships circulation itself — currency, caravans, smuggling routes. The Free Trader faction's religious arm. Strongest in commercial halls and transit hubs. Treats the Ledger's bookkeeping as heresy: only flow is sacred.",
    affinityCategories: ["commercial", "transport"],
    color: "#ff8a3d",
  },
  "catholicism": {
    id: "catholicism",
    name: "Catholicism",
    shortName: "Catholicism",
    description:
      "Parish networks that preserve Catholic worship, mutual aid, and sacramental life through the collapse. Strongest in housing, medical, and civic districts.",
    affinityCategories: ["housing", "medical", "government"],
    color: "#8b6f47",
  },
};

export const FAITH_STANCES: readonly FaithStance[] = ["sponsor", "tolerate", "suppress"] as const;

// Per-tick passive trade-offs applied to cityStats per stance. Tolerate is the neutral baseline.
type StanceFx = Partial<{ happiness: number; unrest: number; lawOrder: number; corruption: number; tradeIncome: number }>;
export const STANCE_EFFECTS: Record<FaithStance, StanceFx> = {
  sponsor: { happiness: 0.05, unrest: -0.03, corruption: 0.04 },
  tolerate: {},
  suppress: { lawOrder: 0.06, unrest: 0.05, happiness: -0.04 },
};

// Per-faith bonus overlay applied on top of the generic Sponsor stance.
// Only Sponsor activates these — Tolerate/Suppress remain generic.
// Each faith's overlay is its signature passive trade-off:
//  - Ledger: trade culture lifts happiness more, but contracts-above-all
//    erodes lawOrder slowly and feeds corruption (its documented drawback).
//  - Tidekeepers: water-cycle stewardship calms the city (lower unrest,
//    a small happiness lift) — its industrial drag is on the dominant
//    district (industrialOutput-0.02), not on cityStats.
// Future faiths drop in by adding a key here; absence means "no overlay".
export const FAITH_SPONSOR_BONUS: Partial<Record<FaithId, StanceFx>> = {
  // Ledger: the priesthood greases trade — small per-tick tradeIncome lift
  // applied directly to the rate, plus the documented happiness/lawOrder/corruption
  // tradeoffs (its "every debt eventually balances" clause).
  "the-ledger": { happiness: 0.02, lawOrder: -0.03, corruption: 0.03, tradeIncome: 8 },
  "the-tidekeepers": { happiness: 0.02, unrest: -0.03 },
  // Helix Commune: gene-mod clinics quietly improve quality of life
  // (small happiness lift). The drawback is on the dominant district —
  // unlicensed splice work raises crime there, see DOMINANT_DISTRICT_EFFECTS.
  "helix-commune": { happiness: 0.03 },
  // Free Choir: rival commercial faith to the Ledger. Stacks tradeIncome with
  // Ledger when both sponsored (additive via the per-faith bonus loop above)
  // for the highest possible commercial output, while feeding corruption from
  // the smuggling-friendly doctrine. Slight lawOrder drag — paperwork is heresy.
  "free-choir": { tradeIncome: 6, corruption: 0.04, lawOrder: -0.02 },
  "catholicism": { happiness: 0.03, unrest: -0.02, corruption: 0.02 },
};

// Tidekeepers signature passive #2: while sponsored, biosphere/sewer/weather
// event impact is dampened (water-cycle stewardship absorbs the shock).
// Listed as id-prefixes against the live trigger catalog so adding a new
// weather/sewer event doesn't require touching this file.
export const TIDEKEEPERS_EVENT_MITIGATION = {
  scale: 0.7, // multiply the generated event's effects by this factor
  prefixes: ["wx_", "sewer_", "biosphere_"] as readonly string[],
};
export function tidekeepersMitigatesEvent(eventId: string): boolean {
  return TIDEKEEPERS_EVENT_MITIGATION.prefixes.some((p) => eventId.startsWith(p));
}
export function isTidekeepersSponsored(s: GameState): boolean {
  return s.faiths?.stances?.["the-tidekeepers"] === "sponsor";
}

// Task #211 — Free Choir convoy/transit success modifier.
// While the Free Choir is sponsored, caravan/convoy/transit-themed events
// resolve more profitably for the player (their cantors ride every convoy and
// keep the routes warm). While suppressed, the routes wither and outcomes
// shrink. Tolerated returns the neutral 1.0 baseline.
//
// Consumed by caravan/transit event triggers in eventTriggers.ts to scale
// credit/tradeIncome outcomes on both the base event and its responseOptions.
export const FREE_CHOIR_TRANSIT_MULT = {
  sponsor: 1.25,
  tolerate: 1.0,
  suppress: 0.8,
} as const;
export function getFreeChoirTransitMultiplier(s: GameState): number {
  const stance = s.faiths?.stances?.["free-choir"];
  if (stance === "sponsor") return FREE_CHOIR_TRANSIT_MULT.sponsor;
  if (stance === "suppress") return FREE_CHOIR_TRANSIT_MULT.suppress;
  return FREE_CHOIR_TRANSIT_MULT.tolerate;
}

// Apply the Free Choir transit multiplier to an effects bag, scaling the keys
// that represent caravan/convoy income (credits, tradeIncome, food). Other keys
// pass through untouched. Multiplier of 1.0 short-circuits to identity so the
// common no-faith / tolerated case allocates no garbage.
//
// Sign-aware: the modifier represents convoy/transit *success rate*, so it
// should consistently make the player's situation better while sponsoring the
// Choir and worse while suppressing — regardless of whether a given line is
// labelled as income (positive) or loss (negative). For positive values we
// multiply by `mult` directly. For negative values we multiply by the
// reciprocal (`2 - mult`) so a Sponsor lift (1.25) shrinks the magnitude of a
// loss to 0.75x, and a Suppress drag (0.8) inflates losses to 1.2x. Net result:
// Sponsor is *always* favorable on a transit-flavored response, Suppress is
// always punitive, regardless of which sign the original delta carried.
const TRANSIT_INCOME_KEYS: readonly string[] = ["credits", "tradeIncome", "food"];
export function applyFreeChoirTransitScale<T extends Record<string, number | undefined>>(
  effects: T,
  s: GameState,
): T {
  const mult = getFreeChoirTransitMultiplier(s);
  if (mult === 1) return effects;
  const negMult = 2 - mult; // mirror around 1: 1.25 ↔ 0.75, 0.8 ↔ 1.2
  const out: Record<string, number | undefined> = { ...effects };
  for (const k of TRANSIT_INCOME_KEYS) {
    const v = out[k];
    if (typeof v !== "number") continue;
    const m = v >= 0 ? mult : negMult;
    out[k] = Math.round(v * m);
  }
  return out as T;
}

// District-level stance trade-offs applied per tick to the dominant district of each faith.
// Sponsor lifts loyalty but tolerates more street crime; Suppress wins order but bleeds loyalty.
export const STANCE_DISTRICT_EFFECTS: Record<FaithStance, { loyalty: number; crime: number }> = {
  sponsor: { loyalty: 0.05, crime: 0.03 },
  tolerate: { loyalty: 0, crime: 0 },
  suppress: { loyalty: -0.06, crime: -0.02 },
};

// Eternal Flame faction loyalty drift per applied step (every 4 ticks) when NOT EF Leader Cult.
export const ETERNAL_FLAME_LOYALTY_DRIFT: Record<FaithStance, number> = {
  sponsor: 0.5,
  tolerate: 0,
  suppress: -0.5,
};

// Leader Cult tunables — opt-in personal religion. Bonuses + drawbacks per applied step.
export const LEADER_CULT_FX = {
  happinessPerTick: 0.08,
  corruptionPerTick: 0.06,
  unrestForOtherFaithsPerTick: 0.04,
  loyaltyFloorInDominantDistricts: 60, // bonus: districts where leader-cult faith dominates can't sink below this
  propagandaMultiplier: 1.25, // bonus: propaganda effects reading this multiplier
  edictSlotBonus: 1, // bonus: extra edict slot the player gets while leader cult head
};

// Base maximum concurrent active edicts. Generous (so existing achievements like
// "10 active edicts" remain reachable). Leader Cult adds edictSlotBonus on top.
export const BASE_MAX_ACTIVE_EDICTS = 12;
export function getMaxActiveEdicts(s: GameState): number {
  return BASE_MAX_ACTIVE_EDICTS + getLeaderCultEdictSlotBonus(s);
}

// Leader Cult declaration eligibility + reversal contract.
export const DOMINANCE_THRESHOLD = 0.45; // city share required to declare
export const RENUNCIATION_COOLDOWN_TICKS = 30;
export const RENUNCIATION_COST_CREDITS = 25000;
export const RENUNCIATION_HAPPINESS_HIT = -8;
export const RENUNCIATION_LOYALTY_HIT = 12; // hit applied to faction loyalty for the renounced faith

// "Faith weakening" drawback: when the player is Leader Cult head and that faith's
// city share drops under this threshold, every tick punishes hubris with an amplified
// happiness hit + unrest spike (the population sees the leader's mandate slipping).
export const LEADER_CULT_COLLAPSE_THRESHOLD = 0.25;
export const LEADER_CULT_COLLAPSE_HAPPINESS_PER_TICK = -0.18;
export const LEADER_CULT_COLLAPSE_UNREST_PER_TICK = 0.18;

const DRIFT_PER_TICK = 0.01;
const DRIFT_CATEGORY_AFFINITY_BONUS = 0.5; // +50% drift in faith's affinity districts
const PROPAGANDA_DRIFT_MULTIPLIER = 1.25;

// Per-faith passive effects applied each tick to districts where the faith dominates (>0.5 share).
type DominantFx = Partial<{
  loyalty: number;
  infraQuality: number;
  industrialOutput: number;
  ecology: number;
  gangInfluence: number;
  crime: number;
}>;
export const DOMINANT_DISTRICT_EFFECTS: Record<FaithId, DominantFx> = {
  "eternal-flame": { infraQuality: 0.04, gangInfluence: -0.03 },
  "machine-choir": { industrialOutput: 0.05, ecology: -0.03 },
  "ancestor-cult": { loyalty: 0.04, crime: 0.02 },
  "the-ledger": { loyalty: 0.03, crime: -0.03 },
  "the-tidekeepers": { ecology: 0.05, industrialOutput: -0.02 },
  // Helix Commune: dominant-district loyalty lift from grateful clinic
  // patients, balanced by a crime drawback as black-market splice rings
  // operate alongside the legitimate practice.
  "helix-commune": { loyalty: 0.04, crime: 0.03 },
  // Free Choir: dominant-district loyalty bump from grateful traders + caravan
  // crews, with a crime drawback as smuggling routes flourish under the
  // "stillness is silence" doctrine.
  "free-choir": { loyalty: 0.03, crime: 0.04 },
  "catholicism": { loyalty: 0.04, crime: -0.01 },
};

// Build a district seed from per-faith affinity. Faiths whose affinity list
// includes the category get a bump above the uniform 1/N baseline; everyone
// else stays at baseline. The result is always normalized.
//
// This replaces the old switch-based seed table — adding a new faith now
// only requires editing FAITH_DEFS, never this function.
const SEED_AFFINITY_BUMP = 0.4;
function categorySeed(category: string): DistrictFaithShares {
  const base = 1 / FAITH_IDS.length;
  const raw = FAITH_IDS.reduce((acc, id) => {
    const def = FAITH_DEFS[id];
    acc[id] = (def.affinityCategories as readonly string[]).includes(category)
      ? base + SEED_AFFINITY_BUMP
      : base;
    return acc;
  }, {} as DistrictFaithShares);
  return normalizeShares(raw);
}

export function evenShares(): DistrictFaithShares {
  const v = 1 / FAITH_IDS.length;
  return FAITH_IDS.reduce((acc, id) => {
    acc[id] = v;
    return acc;
  }, {} as DistrictFaithShares);
}

export function normalizeShares(shares: Partial<DistrictFaithShares>): DistrictFaithShares {
  // Defensively reject NaN/Infinity from corrupted saves before clamping.
  // `Math.max(0, NaN)` is NaN — a silent poison pill that would propagate
  // through every subsequent drift calculation. Force such values to 0.
  const sanitize = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  const safe = FAITH_IDS.reduce((acc, id) => {
    acc[id] = sanitize(shares[id]);
    return acc;
  }, {} as DistrictFaithShares);
  let sum = 0;
  for (const id of FAITH_IDS) sum += safe[id];
  if (sum <= 0 || !Number.isFinite(sum)) return evenShares();
  return FAITH_IDS.reduce((acc, id) => {
    acc[id] = safe[id] / sum;
    return acc;
  }, {} as DistrictFaithShares);
}

export function createDefaultFaithState(districts: District[]): FaithState {
  const districtShares: Record<string, DistrictFaithShares> = {};
  for (const d of districts) {
    districtShares[d.id] = normalizeShares(categorySeed(getDistrictCategory(d.id)));
  }
  const stances = FAITH_IDS.reduce((acc, id) => {
    acc[id] = "tolerate";
    return acc;
  }, {} as Record<FaithId, FaithStance>);
  return {
    stances,
    districtShares,
    leaderCult: null,
  };
}

export function isFaithId(value: unknown): value is FaithId {
  return typeof value === "string" && (FAITH_IDS as readonly string[]).includes(value);
}

export function isFaithStance(value: unknown): value is FaithStance {
  return typeof value === "string" && (FAITH_STANCES as readonly string[]).includes(value);
}

export function ensureFaithState(s: GameState): FaithState {
  if (!s.faiths) {
    s.faiths = createDefaultFaithState(s.districts ?? []);
  }
  return s.faiths;
}

export function setFaithStance(s: GameState, faithId: FaithId, stance: FaithStance): boolean {
  if (!isFaithId(faithId) || !isFaithStance(stance)) return false;
  const fs = ensureFaithState(s);
  fs.stances = { ...fs.stances, [faithId]: stance };
  return true;
}

// Compute total population-weighted share of each faith across the city.
export function computeCityFaithShares(s: GameState): DistrictFaithShares {
  const fs = ensureFaithState(s);
  const totals = FAITH_IDS.reduce((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {} as DistrictFaithShares);
  let totalPop = 0;
  for (const d of s.districts ?? []) {
    const shares = fs.districtShares[d.id];
    if (!shares) continue;
    const pop = Math.max(0, d.population ?? 0);
    totalPop += pop;
    for (const id of FAITH_IDS) {
      totals[id] += (shares[id] ?? 0) * pop;
    }
  }
  if (totalPop <= 0) return evenShares();
  return FAITH_IDS.reduce((acc, id) => {
    acc[id] = totals[id] / totalPop;
    return acc;
  }, {} as DistrictFaithShares);
}

export type LeaderCultEligibility =
  | { eligible: true }
  | { eligible: false; reason: "invalid-faith" | "already-active" | "not-sponsored" | "not-dominant" | "cooldown" };

// Eligibility gate: Sponsor stance + city dominance ≥ DOMINANCE_THRESHOLD + cooldown elapsed.
export function checkLeaderCultEligibility(s: GameState, faithId: FaithId): LeaderCultEligibility {
  if (!isFaithId(faithId)) return { eligible: false, reason: "invalid-faith" };
  const fs = ensureFaithState(s);
  if (fs.leaderCult) return { eligible: false, reason: "already-active" };
  if (fs.stances[faithId] !== "sponsor") return { eligible: false, reason: "not-sponsored" };
  const cityShares = computeCityFaithShares(s);
  if ((cityShares[faithId] ?? 0) < DOMINANCE_THRESHOLD) {
    return { eligible: false, reason: "not-dominant" };
  }
  if (typeof fs.lastRenouncedAtTick === "number") {
    const elapsed = (s.totalTicks ?? 0) - fs.lastRenouncedAtTick;
    if (elapsed < RENUNCIATION_COOLDOWN_TICKS) return { eligible: false, reason: "cooldown" };
  }
  return { eligible: true };
}

export function declareLeaderCult(s: GameState, faithId: FaithId): boolean {
  const elig = checkLeaderCultEligibility(s, faithId);
  if (!elig.eligible) return false;
  const fs = ensureFaithState(s);
  fs.leaderCult = { faithId, declaredAtTick: s.totalTicks ?? 0 };
  return true;
}

// Renunciation: significant cost (credits drained, happiness hit, faction loyalty hit on the renounced faith)
// and a cooldown before declaring again.
export function renounceLeaderCult(s: GameState): boolean {
  const fs = ensureFaithState(s);
  const cult = fs.leaderCult;
  if (!cult) return false;

  // Cost: credits
  if (s.resources) {
    s.resources.credits = Math.max(0, (s.resources.credits ?? 0) - RENUNCIATION_COST_CREDITS);
  }
  // Cost: happiness
  if (s.cityStats) {
    s.cityStats.happiness = clamp100((s.cityStats.happiness ?? 50) + RENUNCIATION_HAPPINESS_HIT);
  }
  // Cost: faction loyalty hit on the renounced faith's faction (if it has one)
  const def = FAITH_DEFS[cult.faithId];
  if (def.factionId && Array.isArray(s.factions)) {
    const fac = s.factions.find((f) => f.id === def.factionId);
    if (fac) {
      fac.loyalty = Math.max(0, Math.min(100, (fac.loyalty ?? 50) - RENUNCIATION_LOYALTY_HIT));
    }
  }

  fs.leaderCult = null;
  fs.lastRenouncedAtTick = s.totalTicks ?? 0;
  return true;
}

// Bonus accessor: while Leader Cult head, propaganda effects use this multiplier.
export function getLeaderCultPropagandaMultiplier(s: GameState): number {
  const fs = s.faiths;
  return fs?.leaderCult ? LEADER_CULT_FX.propagandaMultiplier : 1;
}

// Bonus accessor: extra edict slot count while Leader Cult head.
export function getLeaderCultEdictSlotBonus(s: GameState): number {
  const fs = s.faiths;
  return fs?.leaderCult ? LEADER_CULT_FX.edictSlotBonus : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function dominantFaithId(shares: DistrictFaithShares): FaithId | null {
  let topId: FaithId | null = null;
  let topShare = 0.5; // strictly greater than 0.5 = dominant
  for (const id of FAITH_IDS) {
    const v = shares[id] ?? 0;
    if (v > topShare) {
      topId = id;
      topShare = v;
    }
  }
  return topId;
}

// Drift each district's faith shares toward player stance, modulated by district class
// composition (faith affinity) and propaganda. Apply per-faith dominant-district passive
// effects, citywide stance trade-offs, Leader Cult bonuses (loyalty floor, propaganda
// multiplier exposed via getter), and the Eternal Flame faction loyalty hook.
//
// Crucially: this processor never locks an edict, policy, or player action. It only
// mutates faith shares, district stats, city stats, and faction loyalty.
export function processFaithDrift(s: GameState, entries: TickEntry[]): void {
  const fs = ensureFaithState(s);
  const stances = fs.stances;
  const cult = fs.leaderCult;
  const propagandaActive = !!s.policies?.propaganda;

  // 1) Per-district share drift, modulated by category affinity + propaganda.
  //    Leader Cult amplifies the propaganda multiplier on its own faith — a
  //    real consumption of getLeaderCultPropagandaMultiplier in the runtime.
  const lcPropMult = getLeaderCultPropagandaMultiplier(s);
  // Task #217: precompute which faiths actually drift this tick. With the
  // default all-"tolerate" stance set and no leader cult (the common case
  // for early/mid-game and most fast-forward sessions), no faith drifts —
  // so the per-district inner loop and the per-district {...cur} +
  // normalizeShares allocation are pure waste. Hoisting this check out of
  // the district loop turns the dominant cost from N_districts allocations
  // per tick into zero.
  let anyDrift = !!cult;
  if (!anyDrift) {
    for (const id of FAITH_IDS) {
      if (stances[id] !== "tolerate") { anyDrift = true; break; }
    }
  }
  for (const d of s.districts ?? []) {
    const category = getDistrictCategory(d.id);
    let cur = fs.districtShares[d.id];
    if (!cur) {
      cur = normalizeShares(categorySeed(category));
      fs.districtShares[d.id] = cur;
    }
    if (anyDrift) {
      const next: DistrictFaithShares = { ...cur };
      for (const id of FAITH_IDS) {
        const stance = stances[id];
        if (stance === "tolerate") continue;
        let mag = DRIFT_PER_TICK;
        if ((FAITH_DEFS[id].affinityCategories as readonly string[]).includes(category)) {
          mag *= 1 + DRIFT_CATEGORY_AFFINITY_BONUS;
        }
        if (propagandaActive) {
          mag *= PROPAGANDA_DRIFT_MULTIPLIER;
          if (cult?.faithId === id) mag *= lcPropMult; // unique LC propaganda multiplier
        }
        if (stance === "sponsor") next[id] = clamp01(next[id] + mag);
        else next[id] = clamp01(next[id] - mag);
      }
      if (cult) {
        next[cult.faithId] = clamp01(next[cult.faithId] + DRIFT_PER_TICK * 0.5);
      }
      fs.districtShares[d.id] = normalizeShares(next);
    }

    // 2) Per-faith dominant-district passive effects + per-stance loyalty/crime trade-off
    const dom = dominantFaithId(fs.districtShares[d.id]);
    if (dom) {
      const fx = DOMINANT_DISTRICT_EFFECTS[dom];
      if (fx.loyalty) d.loyalty = clamp100(d.loyalty + fx.loyalty);
      if (fx.infraQuality) d.infraQuality = clamp100(d.infraQuality + fx.infraQuality);
      if (fx.industrialOutput) d.industrialOutput = clamp100(d.industrialOutput + fx.industrialOutput);
      if (fx.ecology) d.ecology = clamp100(d.ecology + fx.ecology);
      if (fx.gangInfluence) d.gangInfluence = clamp100(d.gangInfluence + fx.gangInfluence);
      if (fx.crime) d.crime = clamp100(d.crime + fx.crime);
      const stanceDistrict = STANCE_DISTRICT_EFFECTS[stances[dom]];
      if (stanceDistrict.loyalty) d.loyalty = clamp100(d.loyalty + stanceDistrict.loyalty);
      if (stanceDistrict.crime) d.crime = clamp100(d.crime + stanceDistrict.crime);
    }

    // 3) Leader Cult loyalty floor: districts where the leader-cult faith dominates
    //    enjoy a loyalty floor — they will not sink below LEADER_CULT_FX.loyaltyFloorInDominantDistricts.
    if (cult && dom === cult.faithId && d.loyalty < LEADER_CULT_FX.loyaltyFloorInDominantDistricts) {
      d.loyalty = LEADER_CULT_FX.loyaltyFloorInDominantDistricts;
    }
  }

  // 4) Citywide stance passive trade-offs (sum across faiths)
  let dHappy = 0;
  let dUnrest = 0;
  let dLaw = 0;
  let dCorr = 0;
  for (const id of FAITH_IDS) {
    const fx = STANCE_EFFECTS[stances[id]];
    dHappy += fx.happiness ?? 0;
    dUnrest += fx.unrest ?? 0;
    dLaw += fx.lawOrder ?? 0;
    dCorr += fx.corruption ?? 0;
    // Per-faith Sponsor overlay (signature passive trade-off).
    if (stances[id] === "sponsor") {
      const bonus = FAITH_SPONSOR_BONUS[id];
      if (bonus) {
        dHappy += bonus.happiness ?? 0;
        dUnrest += bonus.unrest ?? 0;
        dLaw += bonus.lawOrder ?? 0;
        dCorr += bonus.corruption ?? 0;
        // Rate-side overlay: trade-income lift is applied to s.rates.tradeIncome
        // directly so it shows up alongside policies/edicts in the income breakdown.
        // NOTE non-cumulative: runTick (formulas.ts:425) reassigns
        // rates.tradeIncome from a fresh formula at the START of every tick,
        // BEFORE runNewSystemTicks → processFaithDrift fires. So this `+=` is a
        // per-tick "while sponsored" modifier, not a permanent compounding bonus.
        if (bonus.tradeIncome && s.rates) {
          s.rates.tradeIncome = (s.rates.tradeIncome ?? 0) + bonus.tradeIncome;
          if (entries) {
            entries.push({
              label: FAITH_DEFS[id].shortName,
              delta: bonus.tradeIncome,
              unit: "tradeIncome",
              reason: `${FAITH_DEFS[id].shortName} sponsor passive`,
              severity: "positive",
            });
          }
        }
      }
    }
  }

  // 5) Leader Cult passive city-level effects + faith-weakening collapse drawback
  if (cult) {
    dHappy += LEADER_CULT_FX.happinessPerTick;
    dCorr += LEADER_CULT_FX.corruptionPerTick;
    for (const id of FAITH_IDS) {
      if (id === cult.faithId) continue;
      if (stances[id] !== "sponsor") {
        dUnrest += LEADER_CULT_FX.unrestForOtherFaithsPerTick;
      }
    }
    // Faith-weakening collapse: if the cult faith's citywide share has fallen
    // below the collapse threshold, the player's mandate visibly cracks.
    const cityShares = computeCityFaithShares(s);
    if ((cityShares[cult.faithId] ?? 0) < LEADER_CULT_COLLAPSE_THRESHOLD) {
      dHappy += LEADER_CULT_COLLAPSE_HAPPINESS_PER_TICK;
      dUnrest += LEADER_CULT_COLLAPSE_UNREST_PER_TICK;
      if (entries) {
        entries.push({
          label: "Leader Cult collapsing",
          delta: LEADER_CULT_COLLAPSE_HAPPINESS_PER_TICK,
          unit: "happiness",
          reason: `${FAITH_DEFS[cult.faithId].shortName} share has fallen below ${Math.round(LEADER_CULT_COLLAPSE_THRESHOLD * 100)}%`,
          severity: "negative",
        });
      }
    }
  }

  if (dHappy !== 0) s.cityStats.happiness = clamp100(s.cityStats.happiness + dHappy);
  if (dUnrest !== 0) s.cityStats.unrest = clamp100(s.cityStats.unrest + dUnrest);
  if (dLaw !== 0) s.cityStats.lawOrder = clamp100(s.cityStats.lawOrder + dLaw);
  if (dCorr !== 0) s.cityStats.corruption = clamp100(s.cityStats.corruption + dCorr);

  // 6) Eternal Flame faction loyalty hook.
  //    If the player IS Leader Cult head of Eternal Flame, the faction relationship swings
  //    to maximum permanently (until renunciation) — applied every tick as a hard override.
  //    Otherwise, stance-driven drift applies every 4 ticks.
  const efFaction = (s.factions ?? []).find((f) => f.id === "eternal-flame");
  if (efFaction) {
    if (cult?.faithId === "eternal-flame") {
      if (efFaction.loyalty < 100) {
        const delta = 100 - efFaction.loyalty;
        efFaction.loyalty = 100;
        if (entries) {
          entries.push({
            label: "Eternal Flame",
            delta,
            unit: "loyalty",
            reason: "Leader Cult of Eternal Flame: maximum loyalty enforced",
            severity: "positive",
          });
        }
      }
    } else if ((s.totalTicks ?? 0) % 4 === 0) {
      const drift = ETERNAL_FLAME_LOYALTY_DRIFT[stances["eternal-flame"]];
      if (drift !== 0) {
        efFaction.loyalty = Math.max(0, Math.min(100, (efFaction.loyalty ?? 50) + drift));
        if (entries) {
          entries.push({
            label: "Eternal Flame",
            delta: drift,
            unit: "loyalty",
            reason: `Religion stance: ${stances["eternal-flame"]}`,
            severity: drift > 0 ? "positive" : "negative",
          });
        }
      }
    }
  }
}
