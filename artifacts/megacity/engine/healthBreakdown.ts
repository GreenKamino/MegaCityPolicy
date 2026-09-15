import type { GameState } from "@/engine/types";
import { computePopulationDensityPressure } from "@/engine/populationDensity";
import {
  computePopulationCohorts,
  COHORT_HEALTH_LOAD_RATIO,
} from "@/engine/populationCohorts";

// ─────────────────────────────────────────────────────────────────────────────
// Public Health breakdown — the single source of truth for what is raising or
// lowering the sector's Public Health each tick, and by how much, plus concrete
// one-tap recovery suggestions that deep-link to the right screen. This mirrors
// the crime / defense / infrastructure "diagnose -> one-tap fix" pattern. For
// public health, HIGHER is better: `netPerTick` is the per-tick change in the
// Public Health stat, so a positive value means it is RECOVERING (good) and a
// negative value means it is DECLINING (bad).
//
// This remains a leaf readout module: it imports only types and pure engine
// helpers. The per-tick health math it mirrors lives in formulas.ts's PUBLIC
// HEALTH block. Secondary modifiers the
// sim also applies elsewhere (wildlands market/apothecary bonuses every 8/16
// ticks, civic department competence, one-off event effects) are intentionally
// omitted here — the readout names the actionable levers a Commander can pull,
// not every hidden coefficient.
// ─────────────────────────────────────────────────────────────────────────────

// Medical buildings and their per-building contribution to the "medical base"
// score. Mirrored from the healthBase sum in formulas.ts.
export const HEALTH_BASE_BUILDING_WEIGHTS: Record<string, number> = {
  publicHealthMegaClinics: 3,
  medicalResearchComplexes: 1.5,
  welfareDistributionCenters: 1,
};

// Medical units / droids and their per-unit contribution to the medical base.
// Mirrored from the healthBase sum in formulas.ts.
export const HEALTH_BASE_UNIT_WEIGHTS: Record<string, number> = {
  emergencyMedicalTeams: 0.3,
  fieldHospitalUnits: 0.5,
  medicalAssistDroid: 0.2,
};

// Thresholds the sim uses for its flat health-delta swings, mirrored from
// formulas.ts so the readout can never quietly disagree with the tick.
//
// NOTE (flagged, not fixed — out of scope to retune): the sim checks
// `healthBase > 20` and `else if healthBase > 10`, but BOTH branches add
// exactly +1, so pushing the medical base past 20 currently confers no extra
// per-tick benefit over passing 10. The card therefore reports a single +1
// "Medical network" contribution once the base clears 10.
export const HEALTH_BASE_DRIFT_THRESHOLD = 10;    // base above this: +1
export const HEALTH_BASE_COLLAPSE_THRESHOLD = 3;  // base below this: -1
export const MED_SUPPLIES_BONUS_THRESHOLD = 100;  // med supplies above this: +1
export const HEALTH_SANITATION_PENALTY_BELOW = 30; // sanitation below this: -1
export const HEALTH_DISEASE_SEVERE_THRESHOLD = 60; // disease risk above: -1/tick
export const HEALTH_DISEASE_MILD_THRESHOLD = 40;   // disease risk above: -1 every 2nd tick
export const HEALTH_BIOSPHERE_BONUS_THRESHOLD = 60; // biosphere above: +1 every 2nd tick

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

// The weighted "medical base" score: clinics, research, welfare, and medical
// personnel. Shared so the sim and the readout can never disagree.
export function computeHealthBase(
  buildings: Record<string, number>,
  units: Record<string, number>,
): number {
  return (
    sumWeights(buildings ?? {}, HEALTH_BASE_BUILDING_WEIGHTS) +
    sumWeights(units ?? {}, HEALTH_BASE_UNIT_WEIGHTS)
  );
}

export type HealthContributor = {
  label: string;
  /** Positive magnitude of this contributor's per-tick effect on Public Health.
   *  Direction is conveyed by which list it is in (positives raise it;
   *  negatives lower it). Every-2nd-tick terms are shown as 0.5 (their
   *  per-tick average) so the net stays honest. */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import)
// so this stays a leaf module; the UI maps these to concrete routes. A
// suggestion with no target renders as plain, non-tappable text.
export type HealthSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and
  // briefly emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "recruitment" }
  | { screen: "law" };

export type HealthSuggestion = {
  text: string;
  target?: HealthSuggestionTarget;
};

export type HealthBreakdown = {
  publicHealth: number;
  /** The weighted medical-network score behind the +1 / -1 base drift. */
  healthBase: number;
  /** Per-tick change in Public Health: positive = recovering (good),
   *  negative = declining (bad). Mirrors the primary health-delta levers;
   *  every-2nd-tick terms are averaged to 0.5. */
  netPerTick: number;
  /** Contributors actively raising Public Health this tick (good). */
  positives: HealthContributor[];
  /** Contributors actively lowering Public Health this tick (bad). */
  negatives: HealthContributor[];
  suggestions: HealthSuggestion[];
};

/**
 * Compute a complete, legible breakdown of what is moving Public Health this
 * tick: the medical network and supply bonuses raising it, the shortages and
 * outbreak pressure dragging it down, the net per-tick direction, and concrete
 * suggested recovery actions with deep-link targets. Pure and read-only.
 * Mirrors the actionable levers in formulas.ts's PUBLIC HEALTH block.
 */
export function computeHealthBreakdown(state: GameState): HealthBreakdown {
  const cs = state.cityStats;
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;
  const resources = state.resources ?? ({} as GameState["resources"]);

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const publicHealth = num(cs?.publicHealth, 0);
  const diseaseRisk = num(cs?.diseaseRisk, 0);
  const biosphere = num(cs?.biosphere, 0);
  const medSupplies = num(resources?.medSupplies, 0);
  const food = num(resources?.food, 0);
  const water = num(resources?.water, 0);
  // Sanitation only penalizes when the utilities block exists (mirrors the
  // sim's `s.utilities &&` guard); default high enough to never false-fire.
  const sanitation = state.utilities
    ? num(state.utilities.sanitationLevel, 100)
    : 100;

  const healthBase = computeHealthBase(buildings, units);
  const densityPressure = computePopulationDensityPressure(state);
  const cohortHealthDemand = computePopulationCohorts(state).healthServiceDemand;

  const positives: HealthContributor[] = [];
  const negatives: HealthContributor[] = [];

  // ── Levers raising public health (good) ────────────────────────────────────
  if (healthBase > HEALTH_BASE_DRIFT_THRESHOLD) {
    positives.push({ label: "Medical network", amount: 1 });
  }
  if (medSupplies > MED_SUPPLIES_BONUS_THRESHOLD) {
    positives.push({ label: "Med supply reserves", amount: 1 });
  }
  if (biosphere > HEALTH_BIOSPHERE_BONUS_THRESHOLD) {
    positives.push({ label: "Healthy biosphere (every 2nd tick)", amount: 0.5 });
  }

  // ── Levers lowering public health (bad) ────────────────────────────────────
  if (healthBase < HEALTH_BASE_COLLAPSE_THRESHOLD) {
    negatives.push({ label: "No medical network", amount: 1 });
  }
  if (medSupplies <= 0) {
    negatives.push({ label: "Med supplies exhausted", amount: 1 });
  }
  if (food <= 0) {
    negatives.push({ label: "Famine", amount: 1 });
  }
  if (water <= 0) {
    negatives.push({ label: "Water shortage", amount: 1 });
  }
  if (sanitation < HEALTH_SANITATION_PENALTY_BELOW) {
    negatives.push({ label: "Failing sanitation", amount: 1 });
  }
  if (diseaseRisk > HEALTH_DISEASE_SEVERE_THRESHOLD) {
    negatives.push({ label: "Severe disease risk", amount: 1 });
  } else if (diseaseRisk > HEALTH_DISEASE_MILD_THRESHOLD) {
    negatives.push({ label: "Elevated disease risk (every 2nd tick)", amount: 0.5 });
  }
  if (densityPressure.publicHealthDrainPerTick > 0) {
    negatives.push({
      label: "Population density",
      amount: densityPressure.publicHealthDrainPerTick,
    });
  }
  if (cohortHealthDemand > num(cs?.population, 0) * COHORT_HEALTH_LOAD_RATIO) {
    negatives.push({ label: "Cohort care load", amount: 1 });
  }

  const gain = positives.reduce((sum, c) => sum + c.amount, 0);
  const loss = negatives.reduce((sum, c) => sum + c.amount, 0);
  const netPerTick = gain - loss;

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized recovery suggestions ─────────────────────────────
  // Nag only when public health is genuinely a concern: run down, or actively
  // declining.
  const needsAttention = publicHealth < 40 || netPerTick < 0;
  const suggestions: HealthSuggestion[] = [];

  if (needsAttention) {
    if (healthBase <= HEALTH_BASE_DRIFT_THRESHOLD) {
      suggestions.push({
        text: "Build Public Health Mega Clinics — each adds 3 to the medical base; clear 10 and Public Health starts recovering every tick.",
        target: { screen: "construction", category: "civic", highlight: "publicHealthMegaClinics" },
      });
      suggestions.push({
        text: "Recruit emergency medical teams and field hospital units — medical personnel strengthen the network without new construction.",
        target: { screen: "recruitment" },
      });
    }
    if (medSupplies <= 0) {
      suggestions.push({
        text: "Restore med supply production — clinics and Medical Research Complexes produce med supplies each tick; an empty stockpile bleeds health.",
        target: { screen: "construction", category: "research", highlight: "medicalResearchComplexes" },
      });
    } else if (medSupplies <= MED_SUPPLIES_BONUS_THRESHOLD) {
      suggestions.push({
        text: "Stock med supplies above 100 — a full medical reserve adds recovery every tick.",
        target: { screen: "construction", category: "research", highlight: "medicalResearchComplexes" },
      });
    }
    if (sanitation < HEALTH_SANITATION_PENALTY_BELOW) {
      suggestions.push({
        text: "Fix sanitation — Sewer Purification Plants process waste and stop the sanitation drain on health.",
        target: { screen: "construction", category: "water", highlight: "sewerPurificationPlants" },
      });
    }
    if (diseaseRisk > HEALTH_DISEASE_MILD_THRESHOLD) {
      suggestions.push({
        text: "Bring disease risk down — decontamination policies and health edicts on the Law screen cut outbreak pressure.",
        target: { screen: "law" },
      });
    }
    if (densityPressure.active) {
      suggestions.push({
        text: "Keep medical capacity ahead of growth — clinics, sanitation, and medical teams offset the health strain of a denser city.",
        target: {
          screen: "construction",
          category: "civic",
          highlight: "publicHealthMegaClinics",
        },
      });
    }
    if (cohortHealthDemand > num(cs?.population, 0) * COHORT_HEALTH_LOAD_RATIO) {
      suggestions.push({
        text: "Expand medical capacity for vulnerable cohorts — sick, displaced, and detained residents are consuming more care than the city can absorb.",
        target: {
          screen: "construction",
          category: "civic",
          highlight: "publicHealthMegaClinics",
        },
      });
    }
    if (food <= 0) {
      suggestions.push({
        text: "End the famine — citizens with empty stomachs get sick; restore food production.",
        target: { screen: "construction", category: "food" },
      });
    }
    if (water <= 0) {
      suggestions.push({
        text: "Restore the water supply — dehydration and disease travel together.",
        target: { screen: "construction", category: "water" },
      });
    }

    // Guarantee the card always hands the Commander at least one actionable
    // lever whenever it fires, even in the rare case every specific branch is
    // satisfied.
    if (suggestions.length === 0) {
      suggestions.push({
        text: "Expand the medical network — more clinics, research complexes, and medical teams are what push Public Health back up.",
        target: { screen: "construction", category: "civic", highlight: "publicHealthMegaClinics" },
      });
    }
  }

  return {
    publicHealth,
    healthBase,
    netPerTick,
    positives,
    negatives,
    suggestions,
  };
}
