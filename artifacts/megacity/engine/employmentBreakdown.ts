import { COMPANIES_MAP, isCompanyOperational } from "@/engine/companies";
import { getEdictById } from "@/engine/edicts";
import { POLICY_MAP } from "@/engine/policies";
import {
  computeTransitCapacity,
  computeTransitLoad,
  TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY,
} from "@/engine/transitBreakdown";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Employment breakdown — the single source of truth for what is raising or
// lowering the sector's Employment each tick, and by how much, plus concrete
// one-tap fix suggestions that deep-link to the right screen. This mirrors the
// crime / defense / infrastructure "diagnose -> one-tap fix" pattern. For
// employment, HIGHER is better: `netPerTick` is the per-tick change in the
// Employment stat, so a positive value means it is RISING (good) and a
// negative value means it is FALLING (bad).
//
// Employment is a drift-toward-target stat: job slots from industry set a
// target rate, and the stat moves 1 point per tick toward it. Recurring
// modifiers (active edicts and policies, licensed companies, the transit
// overload drain) then push on top of that drift.
//
// This is a LEAF module: it imports only types plus static data tables
// (edicts, policies, companies — same convention as the infrastructure
// breakdown importing EDICTS) and the transit leaf module. The per-tick
// employment math it mirrors lives in formulas.ts's EMPLOYMENT block.
// Secondary modifiers the sim also applies (the tech employment modifier,
// one-off event and research-completion bumps, content-toggle gating of
// disabled BB/SD edicts) are intentionally omitted here — the readout names
// the actionable levers a Commander can pull, not every hidden coefficient.
// ─────────────────────────────────────────────────────────────────────────────

// Job-creating buildings and the job slots each provides. Mirrored from the
// jobSlots sum in formulas.ts's EMPLOYMENT block.
export const JOB_SLOT_WEIGHTS: Record<string, number> = {
  megaManufacturingPlants: 500,
  automatedAssemblyLines: 400,
  metalFoundryComplexes: 300,
  roboticsFabricationFacilities: 200,
  syntheticFoodPlants: 150,
  publicHealthMegaClinics: 120,
  prophetsAcademy: 120,
  advancedResearchLabs: 100,
  bureaucraticAdminCenters: 80,
  undergroundMaglevSystem: 80,
  monasteryComplex: 80,
  skyrailTransitLines: 60,
  grandCathedral: 60,
  districtTemple: 30,
};

// The employment target gets a flat +30 on top of the job-slot coverage, and
// is capped at 100. Mirrored from formulas.ts.
export const EMPLOYMENT_TARGET_BASE_BONUS = 30;
// The stat drifts 1 point per tick toward the target. Mirrored from formulas.ts.
export const EMPLOYMENT_DRIFT_PER_TICK = 1;
// Company employment boost: min(workforce% * 0.2, 5) per tick. Mirrored from
// formulas.ts's company-effects block.
export const COMPANY_EMPLOYMENT_FACTOR = 0.2;
export const COMPANY_EMPLOYMENT_CAP = 5;

// Every edict whose effect actually adds employment, derived from the edict
// table via the same lookup the sim uses. The "no jobs edict active" check
// uses this so the card never nags to enact one when any employment-boosting
// edict is already in force.
function edictEmploymentEffect(edictId: string): number {
  return getEdictById(edictId)?.effects.employment ?? 0;
}

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

// Total job slots from industry and services. Shared so the sim and the
// readout can never disagree.
export function computeJobSlots(buildings: Record<string, number>): number {
  return sumWeights(buildings ?? {}, JOB_SLOT_WEIGHTS);
}

// The employment target the stat drifts toward:
// min(100, floor(jobSlots / population * 100) + 30). Mirrored from formulas.ts.
export function computeEmploymentTarget(
  jobSlots: number,
  population: number,
): number {
  if (!(population > 0)) return Math.min(100, EMPLOYMENT_TARGET_BASE_BONUS);
  return Math.min(
    100,
    Math.floor((jobSlots / population) * 100) + EMPLOYMENT_TARGET_BASE_BONUS,
  );
}

export type EmploymentContributor = {
  label: string;
  /** Positive magnitude of this contributor's per-tick effect on Employment.
   *  Direction is conveyed by which list it is in (positives raise it;
   *  negatives lower it). */
  amount: number;
};

// Where a fix suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type EmploymentSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and
  // briefly emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "law" }
  | { screen: "companies" };

export type EmploymentSuggestion = {
  text: string;
  target?: EmploymentSuggestionTarget;
};

export type EmploymentBreakdown = {
  employment: number;
  /** Total job slots provided by industry and services. */
  jobSlots: number;
  /** The rate the stat is drifting toward (job coverage + base bonus, capped at 100). */
  targetEmployment: number;
  /** True while the transit overload drain (-0.5/tick) is active. */
  transitOverloaded: boolean;
  /** Per-tick change in Employment: positive = rising (good), negative =
   *  falling (bad). Mirrors the primary employment levers. */
  netPerTick: number;
  /** Contributors actively raising Employment this tick (good). */
  positives: EmploymentContributor[];
  /** Contributors actively lowering Employment this tick (bad). */
  negatives: EmploymentContributor[];
  suggestions: EmploymentSuggestion[];
};

/**
 * Compute a complete, legible breakdown of what is moving Employment this
 * tick: the job market driving the drift, the recurring edict / policy /
 * company modifiers, the transit overload drain, the net per-tick direction,
 * and concrete suggested fixes with deep-link targets. Pure and read-only.
 * Mirrors the actionable levers in formulas.ts's EMPLOYMENT block.
 */
export function computeEmploymentBreakdown(state: GameState): EmploymentBreakdown {
  const cs = state.cityStats;
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const employment = num(cs?.employment, 0);
  const population = num(cs?.population, 0);

  const jobSlots = computeJobSlots(buildings);
  const targetEmployment = computeEmploymentTarget(jobSlots, population);

  const positives: EmploymentContributor[] = [];
  const negatives: EmploymentContributor[] = [];

  // ── Job-market drift toward the target ──────────────────────────────────────
  if (targetEmployment > employment) {
    positives.push({ label: "Job market pull (toward target)", amount: EMPLOYMENT_DRIFT_PER_TICK });
  } else {
    negatives.push({ label: "Job shortage (drifting to target)", amount: EMPLOYMENT_DRIFT_PER_TICK });
  }

  // ── Licensed companies ──────────────────────────────────────────────────────
  const companies = Array.isArray(state.companies) ? state.companies : [];
  let companyBoost = 0;
  if (companies.length > 0 && population > 0) {
    let companyEmployment = 0;
    for (const instance of companies) {
      if (instance && isCompanyOperational(instance)) {
        companyEmployment += COMPANIES_MAP[instance.companyId]?.employment ?? 0;
      }
    }
    const companyEmploymentPct = (companyEmployment / population) * 100;
    companyBoost = Math.min(
      companyEmploymentPct * COMPANY_EMPLOYMENT_FACTOR,
      COMPANY_EMPLOYMENT_CAP,
    );
    if (companyBoost > 0) {
      positives.push({ label: "Licensed companies", amount: companyBoost });
    }
  }

  // ── Active edicts with an employment effect ─────────────────────────────────
  const activeEdictIds = (Array.isArray(state.activeEdicts) ? state.activeEdicts : [])
    .map((e) => e?.edictId)
    .filter((id): id is string => typeof id === "string");
  let edictBoost = 0;
  let edictDrain = 0;
  for (const id of activeEdictIds) {
    const fx = edictEmploymentEffect(id);
    if (fx > 0) edictBoost += fx;
    else if (fx < 0) edictDrain += -fx;
  }
  if (edictBoost > 0) positives.push({ label: "Employment edicts", amount: edictBoost });
  if (edictDrain > 0) negatives.push({ label: "Restrictive edicts", amount: edictDrain });
  const hasJobsEdict = activeEdictIds.some((id) => edictEmploymentEffect(id) > 0);

  // ── Active policies with an employment effect ───────────────────────────────
  const activePolicies = Array.isArray(state.activePolicies) ? state.activePolicies : [];
  let policyBoost = 0;
  let policyDrain = 0;
  for (const pid of activePolicies) {
    const fx = POLICY_MAP[pid]?.effects.employment ?? 0;
    if (fx > 0) policyBoost += fx;
    else if (fx < 0) policyDrain += -fx;
  }
  if (policyBoost > 0) positives.push({ label: "Jobs policies", amount: policyBoost });
  if (policyDrain > 0) negatives.push({ label: "Austerity policies", amount: policyDrain });

  // ── Transit overload drain ──────────────────────────────────────────────────
  const transitOverloaded =
    computeTransitLoad(population, buildings) >
    computeTransitCapacity(buildings, units);
  if (transitOverloaded) {
    negatives.push({
      label: "Transit overload",
      amount: TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY,
    });
  }

  const gain = positives.reduce((sum, c) => sum + c.amount, 0);
  const loss = negatives.reduce((sum, c) => sum + c.amount, 0);
  const netPerTick = gain - loss;

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized fixes ─────────────────────────────────────────────
  // Nag only when employment is genuinely a concern: run down, or actively
  // falling.
  const needsAttention = employment < 50 || netPerTick < 0;
  const suggestions: EmploymentSuggestion[] = [];

  if (needsAttention) {
    if (targetEmployment <= employment) {
      suggestions.push({
        text: "Build job-creating industry — each Mega Manufacturing Plant adds 500 job slots and raises the employment rate the sector settles at.",
        target: { screen: "construction", category: "industrial", highlight: "megaManufacturingPlants" },
      });
    }
    if (transitOverloaded) {
      suggestions.push({
        text: "Fix the transit overload — workers who cannot reach their jobs bleed employment every tick.",
        target: { screen: "construction", category: "transit", highlight: "undergroundMaglevSystem" },
      });
    }
    if (!hasJobsEdict) {
      suggestions.push({
        text: "Enact a jobs edict — a Mass Hiring Initiative or Forced Labor Mobilization pushes employment up while it runs.",
        target: { screen: "law" },
      });
    }
    if (companies.length === 0) {
      suggestions.push({
        text: "License corporations — every operating company employs citizens and lifts the employment rate.",
        target: { screen: "companies" },
      });
    }

    // Guarantee the card always hands the Commander at least one actionable
    // lever whenever it fires, even in the rare case every specific branch is
    // satisfied.
    if (suggestions.length === 0) {
      suggestions.push({
        text: "Keep building industry — more job slots raise the employment target, and the rate follows it up.",
        target: { screen: "construction", category: "industrial", highlight: "megaManufacturingPlants" },
      });
    }
  }

  return {
    employment,
    jobSlots,
    targetEmployment,
    transitOverloaded,
    netPerTick,
    positives,
    negatives,
    suggestions,
  };
}
