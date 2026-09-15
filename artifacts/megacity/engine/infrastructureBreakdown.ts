import type {
  GameState,
  InfrastructureCategory,
  InfrastructureIncident,
  InfrastructureLedger,
} from "@/engine/types";
import { EDICTS } from "@/engine/edicts";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
import { buildTechEffectsCache } from "@/engine/perfCache";
import { getTotalEffects as getSoftwareUpgradeEffects } from "@/engine/softwareUpgrades";
import { COMPANIES_MAP, isCompanyOperational } from "@/engine/companies";
import { isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure breakdown — the single source of truth for what is raising or
// lowering the sector's Infrastructure Health each tick, and by how much, plus
// concrete one-tap recovery suggestions that deep-link to the right screen. This
// mirrors the power / water / crime "diagnose -> one-tap fix" pattern. For
// infrastructure, HIGHER is better: `netPerTick` is the per-tick change in the
// Infrastructure Health stat, so a positive value means it is RISING (good) and a
// negative value means it is DEGRADING (bad).
//
// This is a read-only leaf module. The per-tick infrastructure math it mirrors
// lives in formulas.ts's INFRASTRUCTURE HEALTH block. Recurring edicts and
// licensed-company stability are included so the diagnosis matches the live
// next-tick projection; one-off event and contract effects remain outside the
// recurring trend because they are not active every tick.
// ─────────────────────────────────────────────────────────────────────────────

// Repair / maintenance units and their per-unit "repair strength" weight. The
// sim adds min(floor(repairStrength * 0.1), 5) to the infra delta each tick.
// Mirrored from the repairStrength sum in formulas.ts.
export const REPAIR_UNIT_WEIGHTS: Record<string, number> = {
  emergencyRepairUnits: 0.3,
  heavyLifterDroid: 0.3,
  utilityRepairDroid: 0.25,
  weldingFabricatorDroid: 0.25,
  infrastructureRepairTeams: 0.2,
  excavatorDroid: 0.2,
  pipeLayerDroid: 0.2,
  utilityMaintenanceSquads: 0.15,
  structuralScannerDroid: 0.15,
  surveyScannerDroid: 0.1,
};

// Thresholds the sim uses for its flat infra-delta swings, mirrored from
// formulas.ts so the readout can never quietly disagree with the tick.
export const INFRA_CREDITS_BONUS_THRESHOLD = 10000; // credits above this: +1
export const INFRA_STEEL_BONUS_THRESHOLD = 100;     // steel above this: +1
export const INFRA_UNREST_PENALTY_THRESHOLD = 70;   // unrest above this: -2
export const INFRA_REPAIR_CONTRIBUTION_CAP = 5;     // max delta from repair crews
export const INFRA_STRENGTH_TO_DELTA = 0.1;         // repairStrength -> delta factor
export const INFRA_TECH_STAT_DIVISOR = 4;          // mirrored from formulas.ts
export const INFRASTRUCTURE_HEALTH_CAP = 100;     // hard clamp used by the sim

// A few infrastructure-repair edicts named in the card's recommendation copy —
// clear, on-theme examples the Commander can enact. Each adds infrastructureRepair
// in the tick's active-edict loop (edicts.ts), so recommending them is honest.
export const INFRA_EDICT_IDS = [
  "transit_system_overhaul",
  "infrastructure_blitz",
  "water_main_emergency",
  "forced_labor_decree",
  "sewage_overhaul_blitz",
] as const;

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

// repairStrength: weighted repair / maintenance investment. Shared so the sim and
// the readout can never disagree.
export function computeRepairStrength(units: Record<string, number>): number {
  return sumWeights(units ?? {}, REPAIR_UNIT_WEIGHTS);
}

// The per-tick infra delta a repair force contributes, capped exactly like the
// sim: min(floor(repairStrength * 0.1), 5).
export function computeRepairContribution(units: Record<string, number>): number {
  return Math.min(
    Math.floor(computeRepairStrength(units) * INFRA_STRENGTH_TO_DELTA),
    INFRA_REPAIR_CONTRIBUTION_CAP,
  );
}

export type InfraContributor = {
  label: string;
  /** Positive magnitude of this contributor's per-tick effect on Infrastructure
   *  Health. Direction is conveyed by which list it is in (positives raise it;
   *  negatives degrade it). */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type InfraSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and briefly
  // emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "recruitment" }
  | { screen: "law" };

export type InfraSuggestion = {
  text: string;
  target?: InfraSuggestionTarget;
};

export type InfrastructureBreakdownChange = {
  kind: "damage" | "repair";
  amount: number;
  tick: number;
  reason?: string;
  source?: "city" | "military" | "rail";
  category?: InfrastructureCategory;
};

export type InfrastructureBreakdown = {
  infrastructureHealth: number;
  /** Open-ended physical capacity supplied by completed infrastructure. */
  totalPoints: number;
  /** Capacity points currently intact after ledger damage and repairs. */
  intactPoints: number;
  /** Intact capacity as a percentage of total capacity (not a points cap). */
  integrityPercent: number;
  /** Most recent incident of each player-facing integrity kind, when present. */
  recentDamage?: InfrastructureBreakdownChange;
  recentRepair?: InfrastructureBreakdownChange;
  /** Recent damage/repair incidents, newest first, for richer player readouts. */
  recentChanges: InfrastructureBreakdownChange[];
  /** Projected value after recurring next-tick changes and the stat clamp. */
  projectedInfrastructureHealth: number;
  /** Per-tick change in Infrastructure Health: positive = rising (good),
   *  negative = degrading (bad). Mirrors the primary infra-delta levers. */
  netPerTick: number;
  /** Applied direction after the 0..100 cap/floor are taken into account. */
  trend: "rising" | "degrading" | "holding";
  /** True when Infrastructure Health is already at the valid 100-point target. */
  atCap: boolean;
  /** Contributors actively raising Infrastructure Health this tick (good). */
  positives: InfraContributor[];
  /** Contributors actively degrading Infrastructure Health this tick (bad). */
  negatives: InfraContributor[];
  suggestions: InfraSuggestion[];
};

const INFRASTRUCTURE_SOURCES = new Set(["city", "military", "rail"]);
const INFRASTRUCTURE_CATEGORIES = new Set<InfrastructureCategory>([
  "construction", "energy", "water", "food", "housing", "transit",
  "industrial", "security", "defense", "research", "civic", "farming",
  "cybernetics", "tourism", "weaponSystems", "expansion", "space",
  "commercial", "infrastructure", "wasteland", "military",
]);

function getLedgerCapacity(ledger: InfrastructureLedger | undefined, fallbackHealth: number) {
  const totalPoints =
    typeof ledger?.totalPoints === "number" && Number.isFinite(ledger.totalPoints)
      ? Math.max(0, ledger.totalPoints)
      : 0;
  const intactPoints =
    typeof ledger?.intactPoints === "number" && Number.isFinite(ledger.intactPoints)
      ? Math.max(0, Math.min(totalPoints, ledger.intactPoints))
      : 0;
  const integrityPercent = totalPoints > 0
    ? intactPoints / totalPoints * 100
    : fallbackHealth;
  return {
    totalPoints,
    intactPoints,
    integrityPercent: Math.max(0, Math.min(100, integrityPercent)),
  };
}

function getRecentLedgerChanges(ledger: InfrastructureLedger | undefined): {
  recentChanges: InfrastructureBreakdownChange[];
  recentDamage?: InfrastructureBreakdownChange;
  recentRepair?: InfrastructureBreakdownChange;
} {
  const recentChanges: InfrastructureBreakdownChange[] = [];
  for (const rawIncident of [...(ledger?.incidents ?? [])].reverse()) {
    if (rawIncident.kind !== "damage" && rawIncident.kind !== "repair") continue;
    if (!Number.isFinite(rawIncident.amount) || rawIncident.amount <= 0) continue;

    const assetId = typeof rawIncident.assetId === "string" ? rawIncident.assetId : undefined;
    const asset = assetId ? ledger?.assets?.[assetId] : undefined;
    const sourceFromAssetId = assetId?.split(":")[0];
    const source = INFRASTRUCTURE_SOURCES.has(String(rawIncident.source))
      ? rawIncident.source as InfrastructureBreakdownChange["source"]
      : asset?.source ?? (INFRASTRUCTURE_SOURCES.has(String(sourceFromAssetId))
        ? sourceFromAssetId as InfrastructureBreakdownChange["source"]
        : undefined);
    const category = INFRASTRUCTURE_CATEGORIES.has(rawIncident.category as InfrastructureCategory)
      ? rawIncident.category as InfrastructureCategory
      : asset?.category;
    const change: InfrastructureBreakdownChange = {
      kind: rawIncident.kind,
      amount: rawIncident.amount,
      tick: rawIncident.tick,
      ...(typeof rawIncident.reason === "string" && rawIncident.reason ? { reason: rawIncident.reason } : {}),
      ...(source ? { source } : {}),
      ...(category ? { category } : {}),
    };
    recentChanges.push(change);
  }
  return {
    recentChanges,
    recentDamage: recentChanges.find((change) => change.kind === "damage"),
    recentRepair: recentChanges.find((change) => change.kind === "repair"),
  };
}

/**
 * Compute a complete, legible breakdown of what is moving Infrastructure Health
 * this tick: the repair force and stockpile bonuses raising it, the neglect and
 * disorder dragging it down, the net per-tick direction, and concrete suggested
 * recovery actions with deep-link targets. Pure and read-only. Mirrors the
 * actionable levers in formulas.ts's INFRASTRUCTURE HEALTH block.
 */
export function computeInfrastructureBreakdown(state: GameState): InfrastructureBreakdown {
  const cs = state.cityStats;
  const units = (state.units ?? {}) as Record<string, number>;
  const resources = state.resources ?? ({} as GameState["resources"]);

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const infrastructureHealth = num(cs?.infrastructureHealth, 0);
  const capacity = getLedgerCapacity(state.infrastructureLedger, infrastructureHealth);
  const ledgerChanges = getRecentLedgerChanges(state.infrastructureLedger);
  const unrest = num(cs?.unrest, 0);
  const credits = num(resources?.credits, 0);
  const steel = num(resources?.steel, 0);
  const power = num(resources?.power, 0);
  const techEffects = buildTechEffectsCache(state.unlockedTechnologies ?? [], state.buildings ?? {});
  const softwareEffects = state.softwareUpgrades
    ? getSoftwareUpgradeEffects(state.softwareUpgrades)
    : {};
  const techInfraMod =
    ((techEffects.infrastructureHealth ?? 0) + (softwareEffects.infrastructureHealth ?? 0)) /
    INFRA_TECH_STAT_DIVISOR;

  const positives: InfraContributor[] = [];
  const negatives: InfraContributor[] = [];
  const signedSteps: number[] = [];

  const addContributor = (label: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    signedSteps.push(amount);
    (amount > 0 ? positives : negatives).push({
      label,
      amount: Math.abs(amount),
    });
  };

  // The tick applies active edicts before the company and base infrastructure
  // blocks. Mirror the add-on gates from formulas.ts so disabled expansion
  // content cannot make the diagnosis claim a bonus that the sim skips.
  const bbOn = isBigBrotherActive(state.addons);
  const sdOn = isSixthDayActive(state.addons);
  let hasInfraEdict = false;
  for (const activeEdict of Array.isArray(state.activeEdicts) ? state.activeEdicts : []) {
    if (
      (!bbOn && isBBContentId(activeEdict.edictId)) ||
      (!sdOn && isSDContentId(activeEdict.edictId))
    ) {
      continue;
    }
    const edict = EDICTS.find((candidate) => candidate.id === activeEdict.edictId);
    const infrastructureRepair = edict?.effects.infrastructureRepair ?? 0;
    if (infrastructureRepair !== 0) {
      hasInfraEdict = true;
      addContributor(`${edict!.name} edict`, infrastructureRepair);
    }
  }

  // Licensed companies apply a small recurring stability bonus before the
  // regular infra delta. Include it so the readout names every recurring
  // contributor that can move the stat.
  let companyStabilityBonus = 0;
  for (const instance of state.companies ?? []) {
    if (!isCompanyOperational(instance)) continue;
    const company = COMPANIES_MAP[instance.companyId];
    if (company) companyStabilityBonus += company.effects.stability ?? 0;
  }
  addContributor(
    "Licensed company stability",
    Math.min(companyStabilityBonus * 0.1, 2),
  );

  // ── Levers raising infrastructure (good) ────────────────────────────────────
  const repairContribution = computeRepairContribution(units);
  addContributor("Repair & maintenance crews", repairContribution);
  if (credits > INFRA_CREDITS_BONUS_THRESHOLD) addContributor("Funded treasury", 1);
  if (steel > INFRA_STEEL_BONUS_THRESHOLD) addContributor("Steel stockpile", 1);

  // ── Levers degrading infrastructure (bad) ───────────────────────────────────
  if (unrest > INFRA_UNREST_PENALTY_THRESHOLD) addContributor("Civil unrest", -2);
  if (power < 0) addContributor("Power deficit", -1);
  addContributor("Infrastructure research", techInfraMod);

  // This is intentionally a sequential projection, not just a sum. The
  // engine clamps each direct edict/company mutation before applying the
  // regular delta, so a positive and negative contributor can still move a
  // stat down from 100 in the same tick.
  let projectedInfrastructureHealth = infrastructureHealth;
  for (const step of signedSteps) {
    projectedInfrastructureHealth = Math.max(
      0,
      Math.min(INFRASTRUCTURE_HEALTH_CAP, projectedInfrastructureHealth + step),
    );
  }
  const netPerTick = projectedInfrastructureHealth - infrastructureHealth;
  const trend =
    netPerTick > 0 ? "rising" : netPerTick < 0 ? "degrading" : "holding";

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized recovery suggestions ─────────────────────────────
  // Nag only when infrastructure is genuinely a concern: run down, or actively
  // degrading.
  const needsAttention =
    infrastructureHealth <= CRISIS_THRESHOLDS.infrastructureHealth.trigger ||
    netPerTick < 0;
  const suggestions: InfraSuggestion[] = [];

  if (needsAttention) {
    if (repairContribution < INFRA_REPAIR_CONTRIBUTION_CAP) {
      suggestions.push({
        text: "Deploy repair and maintenance crews — infrastructure repair teams and utility droids rebuild structural health every tick.",
        target: { screen: "recruitment" },
      });
    }
    if (power < 0) {
      suggestions.push({
        text: "Clear the power deficit — a starved grid lets infrastructure decay.",
        target: { screen: "construction", category: "energy", highlight: "fusionReactors" },
      });
    }
    if (unrest > INFRA_UNREST_PENALTY_THRESHOLD) {
      suggestions.push({
        text: "Bring unrest down — riots and disorder damage infrastructure faster than crews can repair it.",
        target: { screen: "law" },
      });
    }
    if (!hasInfraEdict) {
      suggestions.push({
        text: "Enact an infrastructure edict — Transit Emergency Overhaul or Infrastructure Repair Blitz triggers an immediate repair surge.",
        target: { screen: "law" },
      });
    }
    if (steel <= INFRA_STEEL_BONUS_THRESHOLD) {
      suggestions.push({
        text: "Stock steel — repairs and upgrades stall without construction material.",
        target: { screen: "construction", category: "industrial" },
      });
    }
    if (credits <= INFRA_CREDITS_BONUS_THRESHOLD) {
      // No single screen "fixes" the budget, so this stays a plain, non-tappable
      // note rather than a misleading deep-link.
      suggestions.push({
        text: "Rebuild the treasury — infrastructure upkeep needs a funded budget to keep pace.",
      });
    }

    // Guarantee the card always hands the Commander at least one actionable lever
    // whenever it fires, even in the rare case every specific branch is satisfied.
    if (suggestions.length === 0) {
      suggestions.push({
        text: "Deploy repair crews and keep steel stocked — a funded, well-supplied repair effort is what rebuilds Infrastructure Health.",
        target: { screen: "recruitment" },
      });
    }
  }

  return {
    infrastructureHealth,
    ...capacity,
    ...ledgerChanges,
    projectedInfrastructureHealth,
    netPerTick,
    trend,
    atCap: infrastructureHealth >= INFRASTRUCTURE_HEALTH_CAP,
    positives,
    negatives,
    suggestions,
  };
}
