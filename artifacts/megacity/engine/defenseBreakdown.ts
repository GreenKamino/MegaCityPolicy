import type { GameState } from "@/engine/types";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { EDICTS } from "@/engine/edicts";

// ─────────────────────────────────────────────────────────────────────────────
// Defense breakdown — the single source of truth for what is holding the
// sector's Defense Rating up, and what a Commander can build or recruit to raise
// it, plus concrete one-tap recovery suggestions that deep-link to the right
// screen. This mirrors the power / water / crime "diagnose -> one-tap fix"
// pattern, but Defense Rating is a computed 0..100 stat (HIGHER is better), not
// an accumulating stockpile — so there is no per-tick "net". Instead the readout
// lists the contributors making up the rating and, crucially, the defense that
// is being LEFT ON THE TABLE because military installations are under-manned.
//
// This is a LEAF module: it imports only types and the MILITARY_BUILDINGS data
// table (itself a pure, import-free data module and the single source of truth
// the sim already uses for installation defense). The defenseRating math it
// mirrors lives in formulas.ts's DEFENSE RATING block. Minor hidden contributors
// the sim also folds in (command skills/attributes, active war-ops bonus, tech
// modifiers, augmentations) are intentionally omitted here — the readout names
// the actionable levers a Commander can pull, not every coefficient.
//
// MANNING is the headline lesson: installations only contribute defense in
// proportion to their garrison coverage (installationDefenseBonus =
// round(installDefense * garrisonCoverage) in militaryLogistics.ts). An
// installation nobody staffs is worth almost nothing, so the card always surfaces
// the manning shortfall and pushes the Commander to recruit personnel.
// ─────────────────────────────────────────────────────────────────────────────

// Defensive city buildings and their per-building contribution to the raw
// defenseBonus. Mirrored from the defenseBonus sum in formulas.ts. The sim adds
// this sum straight into defenseRating (before the 0..100 clamp).
export const DEFENSE_BUILDING_WEIGHTS: Record<string, number> = {
  cityShieldGenerator: 8,
  missileDefenseSilos: 4,
  perimeterMegaWalls: 3,
  strategicDefenseCommand: 3,
  doomsdayBunkerShrine: 3,
  defenseTurretTowers: 2,
  automatedDroneDefenseGrid: 2,
  zealotBarracks: 2,
  rapidResponseBarracks: 1,
  borderSecurityCheckpoints: 1,
  martyrsMemorial: 1,
};

// City-defense units and their per-unit "military strength" weight. The sim adds
// floor(militaryStrength * 0.1) into defenseRating. Mirrored from the
// militaryStrength sum in formulas.ts.
export const DEFENSE_UNIT_WEIGHTS: Record<string, number> = {
  judgeGunships: 0.5,
  combatAssaultDroid: 0.5,
  heavyWeaponsSquads: 0.4,
  shieldBearerDroid: 0.4,
  armoredResponseUnits: 0.3,
  tacticalDropShips: 0.3,
  perimeterSentryDroid: 0.3,
  wallDefenseCrews: 0.2,
  cityDefenseInfantry: 0.1,
};

// Nuclear-program technologies and the flat deterrent each adds to defenseRating.
// Mirrored from the nuclearDeterrent sum in formulas.ts.
export const NUCLEAR_DETERRENT_TECHS: Record<string, number> = {
  mil_nuclear_weapons_program: 5,
  mil_antimatter_warheads: 8,
  tactical_nuclear_warheads: 3,
};

// The sim converts the unit strength total into defense via this factor.
export const MILITARY_STRENGTH_TO_DEFENSE = 0.1;

// The two defense edicts named in the card's recommendation copy — clear,
// on-theme examples the Commander can enact. Each adds to defenseRating in the
// tick's active-edict loop (edicts.ts), so recommending them is honest.
export const DEFENSE_EDICT_IDS = [
  "perimeter_hardening_drive",
  "exo_armor_mobilization",
] as const;

// Every edict whose effect actually raises the Defense Rating, derived from the
// edict table. The "no defense edict active" check uses this full set so the card
// never nags to enact one when any defense-boosting edict (not just the two named
// above) is already in force.
const DEFENSE_BOOSTING_EDICT_IDS: ReadonlySet<string> = new Set(
  EDICTS.filter((e) => (e.effects.defenseRating ?? 0) > 0).map((e) => e.id),
);

// Force readiness below this saps combat strength: readinessToCombatMod in
// militaryLogistics.ts starts penalising below 50 (down to -40% at 0), so low
// readiness weakens raid defense even when the Defense Rating looks adequate.
export const LOW_READINESS_THRESHOLD = 50;

// A player-held (friendly) zone at or above this threat level counts as a rising
// raid threat. The permanent hostile wasteland zones (underhive, toxic flats) are
// NOT a rising threat — they are the baseline map — so only friendly-zone threat
// and the incoming-raid queue drive the warning, never the static frontier.
export const HIGH_ZONE_THREAT = 60;

// Installation defense per building id, mirrored from the shared MILITARY_BUILDINGS
// table the sim itself reads (militaryLogistics.ts builds the identical map). This
// is the fully-manned potential; the realised bonus is scaled by garrison
// coverage.
const INSTALLATION_DEFENSE: Record<string, number> = {};
for (const b of MILITARY_BUILDINGS) INSTALLATION_DEFENSE[b.id] = b.defenseBonus;

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

// Precomputed top defensive structure, so a tapped tip lands directly on the
// highest-impact card in the defense construction category.
const TOP_DEFENSE_BUILDING = highestWeightKey(DEFENSE_BUILDING_WEIGHTS);

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

// defenseBonus: weighted defensive-building investment. Shared so the sim and the
// readout can never disagree.
export function computeDefenseBonus(buildings: Record<string, number>): number {
  return sumWeights(buildings ?? {}, DEFENSE_BUILDING_WEIGHTS);
}

// militaryStrength: weighted city-defense-unit investment.
export function computeMilitaryStrength(units: Record<string, number>): number {
  return sumWeights(units ?? {}, DEFENSE_UNIT_WEIGHTS);
}

export type DefenseContributor = {
  label: string;
  /** Positive magnitude of this contributor's effect on the Defense Rating.
   *  Whether it raises or lowers the rating is conveyed by which list it is in
   *  (positives build defense; negatives are defense forfeited to neglect). */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type DefenseSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and briefly
  // emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "military" }
  | { screen: "recruitment" }
  | { screen: "law" };

export type DefenseSuggestion = {
  text: string;
  target?: DefenseSuggestionTarget;
};

export type DefenseBreakdown = {
  defenseRating: number;
  /** Total personnel available to crew vehicles and man installations. */
  personnelTotal: number;
  /** Personnel required to fully man every installation. */
  garrisonDemand: number;
  /** 0..1 fraction of the garrison demand actually met. */
  garrisonCoverage: number;
  /** 0..1 fraction of the motor-pool crew demand actually met. */
  crewCoverage: number;
  /** Fully-manned installation defense (what the bases would give at 100% staff). */
  installationDefensePotential: number;
  /** Installation defense actually realised at the current garrison coverage. */
  installationDefenseRealised: number;
  /** Overall force readiness 0..100 (supply- and crew-driven). Below
   *  LOW_READINESS_THRESHOLD it saps combat strength and raid defense. */
  readiness: number;
  /** Highest threat level across the player's own (friendly) zones, 0..100.
   *  Threat on the permanent hostile frontier is excluded — that is the map. */
  maxFriendlyThreat: number;
  /** Raids currently queued as incoming or already breaking. */
  incomingRaids: number;
  /** True when a raid threat is rising: an incoming/active raid, or a player-held
   *  zone whose threat has climbed to HIGH_ZONE_THREAT. */
  raidThreatRising: boolean;
  /** Contributors currently building the Defense Rating (good). */
  positives: DefenseContributor[];
  /** Defense being forfeited — chiefly bases left under-manned (bad). */
  negatives: DefenseContributor[];
  suggestions: DefenseSuggestion[];
};

/**
 * Compute a complete, legible breakdown of what is making up the Defense Rating:
 * the biggest contributors, the defense forfeited to under-manned bases, and
 * concrete suggested actions with deep-link targets. Pure and read-only. Mirrors
 * the actionable levers in formulas.ts's DEFENSE RATING block.
 */
export function computeDefenseBreakdown(state: GameState): DefenseBreakdown {
  const cs = state.cityStats;
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;
  const techs = Array.isArray(state.unlockedTechnologies)
    ? state.unlockedTechnologies
    : [];
  const doctrine = state.doctrine;
  const nuke = state.nuclearStockpile;
  const log = state.militaryOverhaul?.logistics;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const defenseRating = num(cs?.defenseRating, 0);

  // ── Manning state (derived each tick by the logistics processor and persisted
  //    on the state precisely so the UI can read it) ─────────────────────────
  const personnelTotal = num(log?.personnelTotal, 0);
  const garrisonDemand = num(log?.garrisonDemand, 0);
  const garrisonCoverage = Math.max(0, Math.min(1, num(log?.garrisonCoverage, 1)));
  const crewCoverage = Math.max(0, Math.min(1, num(log?.crewCoverage, 1)));
  const installationsBuilt = (log?.installationsBuilt ?? {}) as Record<string, number>;

  // ── Force readiness (supply/crew driven). Below the penalty band the sim docks
  //    combat strength, so a low reading means the sector fights weak. ─────────
  const readiness = Math.max(0, Math.min(100, num(state.militaryOverhaul?.readiness, 50)));

  // ── Raid / zone threat (read-only). The permanent hostile wasteland is the
  //    baseline map, not a rising threat, so only the player's OWN zones and the
  //    raid queue count. An incoming raid, or threat climbing on a friendly zone,
  //    means the sector is under real pressure even if the rating looks fine. ──
  const combat = state.combat;
  const zones = combat && Array.isArray(combat.zones) ? combat.zones : [];
  let maxFriendlyThreat = 0;
  for (const z of zones) {
    if (z?.status === "friendly") {
      const t = num(z?.threat, 0);
      if (t > maxFriendlyThreat) maxFriendlyThreat = t;
    }
  }
  const raidQueue = combat && Array.isArray(combat.raidEventQueue) ? combat.raidEventQueue : [];
  let incomingRaids = 0;
  for (const r of raidQueue) {
    if (r?.status === "incoming" || r?.status === "active") incomingRaids += 1;
  }
  const raidThreatRising = incomingRaids > 0 || maxFriendlyThreat >= HIGH_ZONE_THREAT;

  // Which defense-boosting edicts are already in force — so the card recommends
  // enacting one only when none is active.
  const activeEdictIds = new Set(
    (Array.isArray(state.activeEdicts) ? state.activeEdicts : [])
      .map((e) => e?.edictId)
      .filter((id): id is string => typeof id === "string"),
  );
  const hasDefenseEdict = [...activeEdictIds].some((id) =>
    DEFENSE_BOOSTING_EDICT_IDS.has(id),
  );

  let installationDefensePotential = 0;
  for (const id in installationsBuilt) {
    const n = installationsBuilt[id];
    if (typeof n === "number" && n > 0) {
      installationDefensePotential += n * (INSTALLATION_DEFENSE[id] ?? 0);
    }
  }
  // The sim's realised bonus is round(potential * coverage); prefer the persisted
  // value (identical inputs -> identical result) and fall back to the mirror.
  const installationDefenseRealised = num(
    log?.installationDefenseBonus,
    Math.round(installationDefensePotential * garrisonCoverage),
  );
  const forfeitedInstallationDefense = Math.max(
    0,
    installationDefensePotential - installationDefenseRealised,
  );

  const positives: DefenseContributor[] = [];
  const negatives: DefenseContributor[] = [];

  // ── Contributors that build the rating ──────────────────────────────────────
  const defenseBonus = computeDefenseBonus(buildings);
  if (defenseBonus > 0) {
    positives.push({ label: "Defensive structures", amount: defenseBonus });
  }

  const militaryStrength = computeMilitaryStrength(units);
  const unitDefense = Math.floor(militaryStrength * MILITARY_STRENGTH_TO_DEFENSE);
  if (unitDefense > 0) {
    positives.push({ label: "City-defense units", amount: unitDefense });
  }

  if (installationDefenseRealised > 0) {
    positives.push({ label: "Manned installations", amount: installationDefenseRealised });
  }

  let nuclearDeterrent = 0;
  for (const tech in NUCLEAR_DETERRENT_TECHS) {
    if (techs.includes(tech)) nuclearDeterrent += NUCLEAR_DETERRENT_TECHS[tech];
  }
  if (nuclearDeterrent > 0) {
    positives.push({ label: "Nuclear deterrent", amount: nuclearDeterrent });
  }

  // The sim only folds stockpile deterrence in when the nuclear weapons program
  // is unlocked (it is what creates the stockpile in the first place), so mirror
  // that gate exactly rather than count stray warheads.
  const hasNuclear = techs.includes("mil_nuclear_weapons_program");
  const warheads = num(nuke?.warheads, 0);
  const stockpileDeterrence = hasNuclear ? Math.min(15, Math.floor(warheads * 0.8)) : 0;
  if (stockpileDeterrence > 0) {
    positives.push({ label: "Nuclear stockpile", amount: stockpileDeterrence });
  }

  const docOrder = (num(doctrine?.orderVsProsperity, 50) - 50) / 50;
  const doctrineDef = Math.round(docOrder * 2);
  if (doctrineDef > 0) {
    positives.push({ label: "Order doctrine", amount: doctrineDef });
  }

  // ── Defense forfeited to neglect ────────────────────────────────────────────
  const underManned = garrisonDemand > 0 && garrisonCoverage < 0.999;
  if (underManned && forfeitedInstallationDefense > 0) {
    negatives.push({ label: "Under-manned bases", amount: forfeitedInstallationDefense });
  }

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized suggestions ───────────────────────────────────────
  // Nag only when defense is genuinely a concern: a weak rating, investment being
  // wasted on unstaffed installations, a raid bearing down, or forces too
  // under-supplied to fight when it lands.
  const noInstallations = garrisonDemand <= 0 && installationDefensePotential <= 0;
  const lowReadiness = readiness < LOW_READINESS_THRESHOLD;
  const underCrewed = crewCoverage < 0.999;
  const needsAttention =
    defenseRating < 50 || underManned || raidThreatRising || lowReadiness;
  const suggestions: DefenseSuggestion[] = [];

  if (needsAttention) {
    // A rising raid threat is the most urgent signal — surface it first and send
    // the Commander to the Military screen's defense view to assess it.
    if (raidThreatRising) {
      const parts: string[] = [];
      if (incomingRaids > 0) {
        parts.push(`${incomingRaids} raid${incomingRaids === 1 ? "" : "s"} inbound`);
      }
      if (maxFriendlyThreat >= HIGH_ZONE_THREAT) {
        parts.push("threat is climbing inside your own sectors");
      }
      suggestions.push({
        text: `A raid threat is rising — ${parts.join(" and ")}. Harden your defenses and man them before it hits.`,
        target: { screen: "military" },
      });
    }

    // Manning is the headline fix — an unstaffed base is dead weight.
    if (underManned) {
      const pct = Math.round(garrisonCoverage * 100);
      suggestions.push({
        text: `Your military bases are only ${pct}% manned — recruit more personnel so they deliver their full defense bonus. Unmanned installations count for almost nothing.`,
        target: { screen: "recruitment" },
      });
    }

    // Low readiness or under-crewed vehicles sap combat strength regardless of the
    // rating: keep ammunition, fuel, and rations flowing on the Military screen.
    if (lowReadiness || underCrewed) {
      suggestions.push({
        text: `Your forces are under-strength — readiness is ${Math.round(readiness)}%. Keep ammunition, fuel, and rations stocked and crew your vehicles, or your defense buckles under a raid.`,
        target: { screen: "military" },
      });
    }

    if (defenseBonus < 20) {
      suggestions.push({
        text: "Build defensive structures — city shield generators, missile-defense silos, and perimeter mega-walls raise the Defense Rating the most.",
        target: { screen: "construction", category: "defense", highlight: TOP_DEFENSE_BUILDING },
      });
    }
    if (unitDefense < 3) {
      suggestions.push({
        text: "Recruit city-defense units — judge gunships, combat droids, and heavy weapons squads bolster the standing defense.",
        target: { screen: "recruitment" },
      });
    }

    // Edicts give an immediate rating boost while you build up — recommend one
    // only when no defense edict is already in force.
    if (!hasDefenseEdict) {
      suggestions.push({
        text: "Enact a defense edict — Perimeter Hardening Drive or Exo-Armor Mobilization gives an immediate Defense Rating boost while you build up.",
        target: { screen: "law" },
      });
    }

    if (noInstallations) {
      suggestions.push({
        text: "Build military installations in the BASES tab — once you staff them with personnel they add defense and supply your army.",
        target: { screen: "military" },
      });
    }

    // Guarantee the card always hands the Commander at least one actionable lever
    // whenever it fires, even in the rare case every specific branch is satisfied.
    if (suggestions.length === 0) {
      suggestions.push({
        text: "Keep expanding your defenses — more defensive structures, manned installations, and standing units raise the Defense Rating.",
        target: { screen: "construction", category: "defense", highlight: TOP_DEFENSE_BUILDING },
      });
    }
  }

  return {
    defenseRating,
    personnelTotal,
    garrisonDemand,
    garrisonCoverage,
    crewCoverage,
    installationDefensePotential,
    installationDefenseRealised,
    readiness,
    maxFriendlyThreat,
    incomingRaids,
    raidThreatRising,
    positives,
    negatives,
    suggestions,
  };
}
