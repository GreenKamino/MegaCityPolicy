import type { GameState } from "@/engine/types";
import { computePopulationDensityPressure } from "@/engine/populationDensity";

// ─────────────────────────────────────────────────────────────────────────────
// Biosphere breakdown — the single source of truth for what is pushing the
// city-wide biosphere up or down each tick, and by how much.
//
// This is a LEAF module: it imports only types. tickProcessors.ts imports the
// weight tables + constants from here (and re-exports the constants so existing
// importers keep working), and formulas.ts's stewardship math is mirrored here
// so the UI readout matches the real per-tick movement. Keeping this a leaf
// avoids the require cycle that would arise if it imported tickProcessors.
// ─────────────────────────────────────────────────────────────────────────────

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// Abandoned land naturally rewilds toward this low "survivable floor": pollution
// and neglect can degrade the biosphere down to here but no further. A *healthy*
// biosphere still requires real investment — this floor sits well below the
// crisis-suppression threshold (50) and the biosphere<20 penalty bands.
export const NATURAL_BIOSPHERE_FLOOR = 15;

// A biosphere is considered "healthy" once it clears this line: it matches the
// crisis-suppression threshold, so recovery ETAs project toward it. Reaching it
// requires real green investment — natural rewilding alone stops at the floor.
export const HEALTHY_BIOSPHERE_THRESHOLD = 50;

// Biosphere outbreak events that actively erode ecology while active. Shared so
// the tick logic and the UI trend/breakdown can't drift from this list.
export const BIOSPHERE_OUTBREAK_EVENT_IDS = [
  "biosphere_disease_outbreak",
  "biosphere_toxic_bloom",
  "biosphere_contamination_leak",
] as const;

// Green-infrastructure buildings and their per-building biosphere weight. This
// weighted sum ("bioBonus") drives the continuous recovery rate below.
export const BIO_BUILDING_WEIGHTS: Record<string, number> = {
  mutantFloraReserves: 3,
  xenofaunaContainmentPens: 2,
  biosphereReclamationDomes: 5,
  radPurificationWetlands: 3,
  atmosphericBiofilterStations: 4,
  insectBreedingWarrens: 2,
  mycologyCultivationCaves: 2,
  geneticSeedVaults: 3,
  bioRemediationPlants: 4,
  pollinatorDroneHives: 2,
  aquaponicsMegaFacilities: 3,
  decontaminationForests: 5,
  exoticFloraGardens: 1,
  wildlifeCorridorNetworks: 2,
  radWasteCompostingPlants: 3,
  bioremediationProcessingPlants: 4,
};

// Ecology-focused units and their per-unit biosphere weight ("unitBonus").
export const BIO_UNIT_WEIGHTS: Record<string, number> = {
  wildlifeRangers: 0.3,
  xenobiologistTeams: 0.4,
  bioRemediationCrews: 0.5,
  geneticConservationists: 0.3,
  ecologicalEngineers: 0.4,
  pollutionMonitorSquads: 0.3,
  botanicalResearchers: 0.2,
  aquaticBioSurveyTeams: 0.3,
};

// Wildlands stewardship (positive) and extraction (negative) buildings. This is
// a SECOND per-tick biosphere writer, applied in formulas.ts every other tick;
// mirrored here for a complete, legible readout.
const STEWARD_BUILDING_WEIGHTS: Record<string, number> = {
  wildlandsBioreserves: 3,
  wildlandsRangerStations: 2,
  hydroponicDomes: 1,
  geneVaults: 1,
};
const EXTRACT_BUILDING_WEIGHTS: Record<string, number> = {
  apexHuntersLodges: 1,
  feralLivestockPens: 1,
  bushTanneries: 1,
};

// The single highest-weight building in a weight table — the exact card a
// recovery suggestion should land the player on. Ties resolve to the first
// (insertion-order) maximum, keeping the choice deterministic.
function highestWeightKey(weights: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestWeight = -Infinity;
  for (const key in weights) {
    if (weights[key] > bestWeight) {
      bestWeight = weights[key];
      best = key;
    }
  }
  return best;
}

// Precomputed top movers for the two suggestions that name a concrete building,
// so a tapped tip lands directly on the highest-impact card in that category.
const TOP_GREEN_BUILDING = highestWeightKey(BIO_BUILDING_WEIGHTS);
const TOP_STEWARD_BUILDING = highestWeightKey(STEWARD_BUILDING_WEIGHTS);

// Biosphere-affecting policies and their per-tick delta.
const BIO_POLICY_DELTAS: Record<string, { amount: number; label: string }> = {
  biosphereProtectionAct: { amount: 1, label: "Biosphere Protection Act" },
  floraRestorationSubsidy: { amount: 1, label: "Flora Restoration Subsidy" },
  wildlifeSanctuaryFunding: { amount: 1, label: "Wildlife Sanctuary Funding" },
  ecosystemMonitoringNetwork: { amount: 1, label: "Ecosystem Monitoring Network" },
  xenofaunaHuntingPermits: { amount: -1, label: "Xenofauna Hunting Permits" },
};

function sumWeights(
  counts: Record<string, number>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const key in weights) {
    total += (counts[key] ?? 0) * weights[key];
  }
  return total;
}

// bioBonus: weighted green-infrastructure investment. Shared by processBiosphere
// and the breakdown so the sim and the readout can never disagree.
export function computeBioBonus(buildings: Record<string, number>): number {
  return sumWeights(buildings ?? {}, BIO_BUILDING_WEIGHTS);
}

// unitBonus: weighted ecology-unit investment.
export function computeUnitBonus(units: Record<string, number>): number {
  return sumWeights(units ?? {}, BIO_UNIT_WEIGHTS);
}

// The continuous per-tick recovery rate from the main biosphere block (green
// infrastructure + units + policies − penalties, or a neglect drain when there
// is no green infrastructure at all). This is what processBiosphere accumulates,
// and the key fix for the "dead zone": ANY green investment now contributes a
// strictly positive rate instead of the old integer step function that returned
// zero for a moderate (bioBonus ~5–15) investment.
export function computeRecoveryRate(
  bioBonus: number,
  unitBonus: number,
  policyRate: number,
  penalty: number,
): number {
  const unitRate = unitBonus * 0.2;
  if (bioBonus > 0) {
    // Scales with investment: bioBonus 15 → +1, 30 → +2, ≥45 → +3 (matching the
    // old tier tops), and small investments produce a small positive rate.
    const infraRate = Math.min(3, bioBonus / 15);
    return infraRate + unitRate + policyRate - penalty;
  }
  // No green infrastructure: neglect drains toward the natural floor.
  return -1 + unitRate + policyRate - penalty;
}

export type BiosphereContributor = {
  label: string;
  /** Signed approximate per-tick points. */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import)
// so this stays a leaf module; the UI maps these to concrete routes. A
// suggestion with no target renders as plain, non-tappable text.
export type BiosphereSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and briefly
  // emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "law" }
  | { screen: "inbox" };

export type BiosphereSuggestion = {
  text: string;
  target?: BiosphereSuggestionTarget;
};

export type BiosphereBreakdown = {
  biosphere: number;
  floor: number;
  bioBonus: number;
  unitBonus: number;
  /** Main-block continuous rate (the accumulator input in processBiosphere). */
  recoveryRate: number;
  /** Stewardship per-tick average (applied in formulas.ts; shown for legibility). */
  stewardRate: number;
  /** Active-outbreak erosion per-tick average (applied separately in the tick). */
  outbreakRate: number;
  /** Natural rewilding per-tick (only below the floor, and only with no outbreaks).
   *  Split out because it disappears above the floor and so must not be counted
   *  toward reaching the healthy threshold. */
  rewildingRate: number;
  /** Overall per-tick direction the sim actually applies: recovery after the
   *  natural-floor pin, plus natural rewilding, stewardship, and outbreak erosion. */
  netPerTick: number;
  positives: BiosphereContributor[];
  negatives: BiosphereContributor[];
  suggestions: BiosphereSuggestion[];
};

function countActiveOutbreaks(state: GameState): number {
  const ids = new Set<string>(BIOSPHERE_OUTBREAK_EVENT_IDS);
  const events = Array.isArray(state.activeEvents) ? state.activeEvents : [];
  return events.filter((e) => e && ids.has((e as { id?: string }).id ?? "")).length;
}

/**
 * Compute a complete, legible breakdown of what is moving the biosphere this
 * tick: the biggest positive and negative contributors, the net per-tick
 * direction, and concrete suggested recovery actions. Pure and read-only.
 */
export function computeBiosphereBreakdown(state: GameState): BiosphereBreakdown {
  const cs = state.cityStats;
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;
  const policies = Array.isArray(state.activePolicies) ? state.activePolicies : [];
  const biosphere = typeof cs?.biosphere === "number" ? cs.biosphere : 50;
  const crime = typeof cs?.crime === "number" ? cs.crime : 0;
  const infra =
    typeof cs?.infrastructureHealth === "number" ? cs.infrastructureHealth : 50;

  const positives: BiosphereContributor[] = [];
  const negatives: BiosphereContributor[] = [];

  const bioBonus = computeBioBonus(buildings);
  const unitBonus = computeUnitBonus(units);
  const densityPressure = computePopulationDensityPressure(state);
  const unitRate = unitBonus * 0.2;
  const infraRate = bioBonus > 0 ? Math.min(3, bioBonus / 15) : 0;

  if (infraRate > 0) positives.push({ label: "Green infrastructure", amount: infraRate });
  if (unitRate > 0) positives.push({ label: "Ecology units", amount: unitRate });

  // Policies.
  let policyRate = 0;
  for (const id of policies) {
    const p = BIO_POLICY_DELTAS[id];
    if (!p) continue;
    policyRate += p.amount;
    if (p.amount > 0) positives.push({ label: p.label, amount: p.amount });
    else negatives.push({ label: p.label, amount: p.amount });
  }

  // Penalties.
  let penalty = 0;
  if (crime > 70) {
    penalty += 1;
    negatives.push({ label: "High crime", amount: -1 });
  }
  if (infra < 20) {
    penalty += 1;
    negatives.push({ label: "Failing infrastructure", amount: -1 });
  }
  if (densityPressure.biosphereDrainPerTick > 0) {
    penalty += densityPressure.biosphereDrainPerTick;
    negatives.push({
      label: "City density and pollution",
      amount: -densityPressure.biosphereDrainPerTick,
    });
  }

  const recoveryRate = computeRecoveryRate(bioBonus, unitBonus, policyRate, penalty);

  // Active-outbreak erosion: -1 every other tick while any outbreak is active.
  const outbreaks = countActiveOutbreaks(state);
  const outbreakRate = outbreaks > 0 ? -0.5 : 0;

  // Mirror the sim's floor behavior so the readout never reports a drain the tick
  // does not actually apply. When the rate is negative but the biosphere is
  // already at or below the natural floor, processBiosphere pins the value (the
  // drain is absorbed), and — with no outbreaks active — a slow natural rewilding
  // (+1 every 4th tick ≈ +0.25/tick) climbs a below-floor biosphere back up. So
  // the effective per-tick change there is 0 or slightly positive, not negative.
  const drainAbsorbed = recoveryRate < 0 && biosphere <= NATURAL_BIOSPHERE_FLOOR;
  const rewildingRate =
    outbreaks === 0 && biosphere < NATURAL_BIOSPHERE_FLOOR ? 0.25 : 0;
  const recoveryContribution = drainAbsorbed ? 0 : recoveryRate;

  if (rewildingRate > 0) {
    positives.push({ label: "Natural rewilding", amount: rewildingRate });
  }
  if (!drainAbsorbed && bioBonus <= 0) {
    negatives.push({ label: "Neglect and pollution", amount: -1 });
  }

  // Wildlands stewardship (formulas.ts): clamp(round(netSteward/4), -2, 3) every
  // other tick, so the per-tick average is half the applied step.
  const stewardScore = sumWeights(buildings, STEWARD_BUILDING_WEIGHTS);
  const extractScore = sumWeights(buildings, EXTRACT_BUILDING_WEIGHTS);
  const netSteward = stewardScore - extractScore;
  const stewardApplied =
    netSteward !== 0 ? clampNum(Math.round(netSteward / 4), -2, 3) : 0;
  const stewardRate = stewardApplied / 2;
  if (stewardRate > 0) positives.push({ label: "Wildlands stewardship", amount: stewardRate });
  else if (stewardRate < 0) negatives.push({ label: "Wildlands extraction", amount: stewardRate });

  if (outbreakRate < 0) {
    negatives.push({ label: "Active outbreaks", amount: outbreakRate });
  }

  const netPerTick = recoveryContribution + rewildingRate + stewardRate + outbreakRate;

  // Concrete, prioritized recovery suggestions. Each carries an optional deep-link
  // target so the UI can turn the diagnosis into a one-tap fix.
  const suggestions: BiosphereSuggestion[] = [];
  if (outbreaks > 0) {
    suggestions.push({
      text: "Contain active biosphere outbreaks — they erode the ecology every tick.",
      target: { screen: "inbox" },
    });
  }
  if (netSteward < 0) {
    suggestions.push({
      text: "Extractive wildlands buildings are depleting the biosphere. Add wildlands bioreserves or ranger stations, or scale back hunting lodges and tanneries.",
      target: { screen: "construction", category: "wildlands", highlight: TOP_STEWARD_BUILDING },
    });
  }
  if (bioBonus < 15) {
    suggestions.push({
      text: "Build more green infrastructure — biosphere reclamation domes, remediation plants, and decontamination forests give the biggest lift.",
      target: { screen: "construction", category: "biosphere", highlight: TOP_GREEN_BUILDING },
    });
  }
  if (crime > 70) {
    suggestions.push({
      text: "Bring down crime — a lawless sector accelerates biosphere decay.",
      target: { screen: "construction", category: "security" },
    });
  }
  if (infra < 20) {
    suggestions.push({
      text: "Repair failing infrastructure — it is dragging the biosphere down.",
      target: { screen: "construction", category: "infrastructure" },
    });
  }
  if (densityPressure.active && netPerTick < 0) {
    suggestions.push({
      text: "Offset city-scale pollution with reclamation domes, remediation plants, and decontamination forests as the population grows.",
      target: {
        screen: "construction",
        category: "biosphere",
        highlight: TOP_GREEN_BUILDING,
      },
    });
  }
  const hasEcologyPolicy = policies.some(
    (id) => BIO_POLICY_DELTAS[id] && BIO_POLICY_DELTAS[id].amount > 0,
  );
  if (!hasEcologyPolicy && biosphere < 50) {
    suggestions.push({
      text: "Enact ecology policies like the Biosphere Protection Act or Flora Restoration Subsidy for a steady boost.",
      target: { screen: "law" },
    });
  }

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => a.amount - b.amount);

  return {
    biosphere,
    floor: NATURAL_BIOSPHERE_FLOOR,
    bioBonus,
    unitBonus,
    recoveryRate,
    stewardRate,
    outbreakRate,
    rewildingRate,
    netPerTick,
    positives,
    negatives,
    suggestions,
  };
}

export type BiosphereEta = {
  /** "recovering" climbs toward the healthy threshold; "degrading" sinks toward
   *  the natural floor. */
  direction: "recovering" | "degrading";
  /** The biosphere value being approached. */
  target: number;
  /** Whole ticks until the target is reached at the current net pace. */
  ticks: number;
};

/**
 * Project how many ticks until the biosphere reaches a meaningful target at its
 * current pace: the healthy threshold when recovering, the natural floor when
 * degrading. Pure and read-only. Returns null when there is nothing honest to
 * promise:
 *   - net is ~0 (HOLDING), or
 *   - the target is already met, or
 *   - a "recovering" reading is really just natural rewilding, which stops at the
 *     floor and can never climb to the healthy threshold on its own.
 *
 * The projection uses the sim's own capped rate (green infrastructure tops out at
 * +3/tick) and never counts rewilding toward the healthy climb, so it can't
 * promise a rise the sim would not actually deliver.
 */
export function computeBiosphereEta(b: BiosphereBreakdown): BiosphereEta | null {
  const net = b.netPerTick;
  // The rate the sim would actually apply ABOVE the natural floor: the raw
  // recovery rate (NOT the floor-absorbed contribution) plus stewardship and
  // outbreak erosion, with rewilding excluded because it only fires below the
  // floor. This is the honest basis for a climb to the healthy threshold.
  //
  // Why this matters: below the floor the sim absorbs a negative drain
  // (recoveryContribution -> 0) and adds +0.25 rewilding, which can make
  // netPerTick read positive even when the true above-floor rate is flat or
  // negative. Projecting the healthy climb from netPerTick there would promise a
  // recovery the sim can never deliver (the biosphere just oscillates at the
  // floor). Using recoveryRate + stewardRate + outbreakRate avoids that.
  const sustainedAboveFloor = b.recoveryRate + b.stewardRate + b.outbreakRate;
  // HOLDING / DEGRADING now, but genuinely climbing once above the floor.
  if (net > 0.05 && sustainedAboveFloor > 0.05) {
    const target = HEALTHY_BIOSPHERE_THRESHOLD;
    if (b.biosphere >= target) return null; // already healthy
    // The infra portion of recoveryRate is capped at +3/tick, so this ETA can
    // never promise a faster-than-possible climb.
    const ticks = Math.ceil((target - b.biosphere) / sustainedAboveFloor);
    if (!Number.isFinite(ticks) || ticks <= 0) return null;
    return { direction: "recovering", target, ticks };
  }
  if (net < -0.05) {
    const target = NATURAL_BIOSPHERE_FLOOR;
    if (b.biosphere <= target) return null; // already at/below the floor
    // The drain is absorbed once the value reaches the floor, so it stops there.
    const ticks = Math.ceil((b.biosphere - target) / -net);
    if (!Number.isFinite(ticks) || ticks <= 0) return null;
    return { direction: "degrading", target, ticks };
  }
  return null;
}
