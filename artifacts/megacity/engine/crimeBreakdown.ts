import type { GameState } from "@/engine/types";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";

// ─────────────────────────────────────────────────────────────────────────────
// Crime breakdown — the single source of truth for what is pushing the sector's
// Crime Index up or down each tick, and by how much, plus concrete one-tap
// recovery suggestions that deep-link to the right screen. This mirrors the
// biosphere breakdown pattern (see biosphereBreakdown.ts) but for crime, where
// LOWER is better: `netPerTick` is the per-tick change in the Crime Index, so a
// negative value means crime is FALLING (good) and a positive value means crime
// is RISING (bad).
//
// This is a LEAF module: it imports only types. The per-tick crime math it
// mirrors lives in formulas.ts's runTick (the CRIME block). Secondary modifiers
// the sim also applies (difficulty multiplier, tech modifier, augmentation
// effects) are intentionally omitted here — the readout names the actionable
// levers a player can pull, not every hidden coefficient.
// ─────────────────────────────────────────────────────────────────────────────

// Enforcement buildings and their per-building "security bonus" weight. The sim
// subtracts floor(securityBonus * 0.15) from the crime delta each tick. Mirrored
// from the securityBonus sum in formulas.ts.
export const SECURITY_BUILDING_WEIGHTS: Record<string, number> = {
  sectorHouseHQ: 2,
  citywideSurveillanceGrid: 2,
  aiCrimePredictionCenters: 2,
  megaPrisonComplexes: 2,
  inquisitionHQ: 2,
  antiGangEnforcementCenters: 1.5,
  confessionalBureau: 1.5,
  solitaryDetentionBlocks: 1,
};

// Law-enforcement units and their per-unit "law strength" weight. The sim
// applies a flat -1 to the crime delta once total law strength clears 80.
// Mirrored from the lawStrength sum in formulas.ts.
export const LAW_UNIT_WEIGHTS: Record<string, number> = {
  eliteJudgeStrikeTeams: 2.0,
  seniorJudges: 1.5,
  antiGangTaskForces: 0.8,
  combatAssaultDroid: 0.8,
  undercoverInvestigators: 0.7,
  detectiveUnits: 0.6,
  patrolJudges: 0.5,
  drugEnforcementUnits: 0.5,
  intelligenceOfficers: 0.5,
  streetPatrolUnits: 0.4,
  sectorLawSquads: 0.4,
  internalAffairsAgents: 0.4,
  perimeterSentryDroid: 0.4,
  investigativeDrones: 0.3,
  reconScoutDroid: 0.3,
  surveillanceDrones: 0.2,
  patrolDrones: 0.2,
};

// The law-strength threshold above which the sim grants its unit suppression.
export const LAW_STRENGTH_THRESHOLD = 80;

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

// Precomputed top enforcement building, so a tapped tip lands directly on the
// highest-impact card in the security category.
const TOP_SECURITY_BUILDING = highestWeightKey(SECURITY_BUILDING_WEIGHTS);

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

// securityBonus: weighted enforcement-building investment. Shared so the sim and
// the readout can never disagree.
export function computeSecurityBonus(buildings: Record<string, number>): number {
  return sumWeights(buildings ?? {}, SECURITY_BUILDING_WEIGHTS);
}

// lawStrength: weighted enforcement-unit investment.
export function computeLawStrength(units: Record<string, number>): number {
  return sumWeights(units ?? {}, LAW_UNIT_WEIGHTS);
}

export type CrimeContributor = {
  label: string;
  /** Positive magnitude of this contributor's per-tick effect on the Crime
   *  Index. Whether it raises or lowers crime is conveyed by which list it is
   *  in (positives suppress crime; negatives drive it up). */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type CrimeSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and briefly
  // emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "military" }
  | { screen: "law" }
  | { screen: "mining" };

export type CrimeSuggestion = {
  text: string;
  target?: CrimeSuggestionTarget;
};

export type CrimeBreakdown = {
  crime: number;
  securityBonus: number;
  lawStrength: number;
  /** Per-tick change in the Crime Index: negative = falling (good), positive =
   *  rising (bad). Mirrors the primary crime-delta levers in the sim. */
  netPerTick: number;
  /** Contributors actively suppressing crime this tick (good). */
  positives: CrimeContributor[];
  /** Contributors actively driving crime up this tick (bad). */
  negatives: CrimeContributor[];
  suggestions: CrimeSuggestion[];
};

/**
 * Compute a complete, legible breakdown of what is moving the Crime Index this
 * tick: the biggest suppressors and drivers, the net per-tick direction, and
 * concrete suggested recovery actions with deep-link targets. Pure and
 * read-only. Mirrors the actionable levers in formulas.ts's CRIME block.
 */
export function computeCrimeBreakdown(state: GameState): CrimeBreakdown {
  const cs = state.cityStats;
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;
  const policies = state.policies ?? ({} as GameState["policies"]);
  const doctrine = state.doctrine;
  const miningPolicies = new Set(
    Array.isArray(state.activeMiningPolicies) ? state.activeMiningPolicies : [],
  );
  const skills = state.player?.skills;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const crime = num(cs?.crime, 0);
  const unrest = num(cs?.unrest, 0);
  const happiness = num(cs?.happiness, 50);
  const diseaseRisk = num(cs?.diseaseRisk, 0);
  const biosphere = num(cs?.biosphere, 50);
  const food = num(state.resources?.food, 0);

  const positives: CrimeContributor[] = [];
  const negatives: CrimeContributor[] = [];

  // ── Suppressors (lower crime) ──────────────────────────────────────────────
  const securityBonus = computeSecurityBonus(buildings);
  const lawStrength = computeLawStrength(units);

  const securityReduction = Math.floor(securityBonus * 0.15);
  if (securityReduction > 0) {
    positives.push({ label: "Security infrastructure", amount: securityReduction });
  }
  if (lawStrength > LAW_STRENGTH_THRESHOLD) {
    positives.push({ label: "Law enforcement units", amount: 1 });
  }
  if (policies?.martialLaw) positives.push({ label: "Martial law", amount: 1 });
  if (policies?.curfewEnabled) positives.push({ label: "Curfew", amount: 1 });
  if (policies?.surveillanceActive) positives.push({ label: "Surveillance", amount: 1 });

  if (skills) {
    const expertise = Math.floor(
      num(skills.investigation, 0) * 0.3 + num(skills.intimidation, 0) * 0.2,
    );
    if (expertise > 0) positives.push({ label: "Command expertise", amount: expertise });
  }

  if (doctrine) {
    const docLaw = (num(doctrine.lawVsMercy, 50) - 50) / 50;
    const docBrute = (num(doctrine.brutalityVsLegit, 50) - 50) / 50;
    const lawDoc = Math.round(docLaw * 1.5);
    const bruteDoc = Math.round(docBrute * 0.5);
    if (lawDoc > 0) positives.push({ label: "Law-first doctrine", amount: lawDoc });
    if (bruteDoc > 0) positives.push({ label: "Hardline doctrine", amount: bruteDoc });
  }

  // ── Drivers (raise crime) ──────────────────────────────────────────────────
  if (unrest > 60) negatives.push({ label: "High unrest", amount: 1 });
  if (happiness < 30) negatives.push({ label: "Low happiness", amount: 1 });
  if (food <= 0) negatives.push({ label: "Starvation", amount: 2 });
  if (diseaseRisk > 60) negatives.push({ label: "Disease outbreak", amount: 1 });
  if (biosphere < 20) negatives.push({ label: "Ecological collapse", amount: 1 });
  if (miningPolicies.has("black_market_ore")) {
    negatives.push({ label: "Black-market ore trade", amount: 2 });
  }

  const suppression = positives.reduce((sum, c) => sum + c.amount, 0);
  const pressure = negatives.reduce((sum, c) => sum + c.amount, 0);
  const netPerTick = pressure - suppression;

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized recovery suggestions ─────────────────────────────
  // Only nag when crime is genuinely a concern: elevated, or actively rising.
  const needsAttention = crime >= CRISIS_THRESHOLDS.crime.trigger || netPerTick > 0;
  const suggestions: CrimeSuggestion[] = [];

  if (needsAttention) {
    if (securityBonus < 40) {
      suggestions.push({
        text: "Build enforcement infrastructure — Sector House HQs, surveillance grids, and AI crime-prediction centers suppress crime the most.",
        target: { screen: "construction", category: "security", highlight: TOP_SECURITY_BUILDING },
      });
    }
    if (lawStrength <= LAW_STRENGTH_THRESHOLD) {
      suggestions.push({
        text: "Deploy more enforcers — patrol and senior judges plus anti-gang task forces put boots on the street.",
        target: { screen: "military" },
      });
    }
    const hasOrderPolicy =
      !!policies?.martialLaw || !!policies?.curfewEnabled || !!policies?.surveillanceActive;
    if (!hasOrderPolicy) {
      suggestions.push({
        text: "Enable a public-order policy — curfew, surveillance, or martial law clamps crime immediately.",
        target: { screen: "law" },
      });
    }
    if (miningPolicies.has("black_market_ore")) {
      suggestions.push({
        text: "Repeal the black-market ore mining policy — it directly fuels organized crime.",
        target: { screen: "mining" },
      });
    }
    if (happiness < 30) {
      suggestions.push({
        text: "Lift happiness — parks and amenities pull desperate citizens away from crime.",
        target: { screen: "construction", category: "beautification" },
      });
    }
    if (food <= 0) {
      suggestions.push({
        text: "End the food shortage — starving citizens turn to crime.",
        target: { screen: "construction", category: "food" },
      });
    }
    if (diseaseRisk > 60) {
      suggestions.push({
        text: "Cut disease risk — outbreaks breed lawlessness in the affected blocks.",
        target: { screen: "construction", category: "civic" },
      });
    }
    if (biosphere < 20) {
      suggestions.push({
        text: "Restore the biosphere — ecological collapse spikes crime.",
        target: { screen: "construction", category: "biosphere" },
      });
    }
  }

  return {
    crime,
    securityBonus,
    lawStrength,
    netPerTick,
    positives,
    negatives,
    suggestions,
  };
}
