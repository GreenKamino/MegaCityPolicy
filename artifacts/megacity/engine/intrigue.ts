import type { Faction, GameEvent, EventResponse } from "@/engine/types";
import type { CommanderReputation } from "@/engine/politicsData";

// ============================================================================
// INNER POLITICS, INTRIGUE & COUPS (Task #379)
//
// This module is the connective tissue between the regime's ideological stance
// (the commander's reputation axes) and the factions that live under it. It is
// deliberately PURE — it imports only types. All state mutation, message
// pushing and event-chain firing happens in the caller (processIntrigueTick in
// tickProcessors.ts) and in the event-resolution hook (eventResolution.ts).
//
// Core loop the caller runs:
//   1. computeAlignment(faction, reputation)  -> how well the regime matches
//      what this faction wants (0-100).
//   2. computeLoyaltyDrift(alignment)         -> the SINGLE passive loyalty
//      drift source (moved here out of processReputationEffects so factions
//      whose ideology the regime satisfies grow loyal, and misaligned ones
//      sour). Policies (decrees) move reputation axes, so they push factions
//      toward/away from the regime for free.
//   3. computeRadicalizationDelta(...)        -> misaligned + disloyal + high
//      unrest/threat factions radicalize; aligned + loyal + calm ones cool.
//   4. plot lifecycle                         -> once a faction crosses the
//      radicalization threshold it hatches a plot (coup / terror_cell /
//      assassination) that escalates over time with warning signs, then
//      matures into a player-facing crisis.
// ============================================================================

export type PlotType = "coup" | "terror_cell" | "assassination";

export type IntriguePlot = {
  id: string;
  type: PlotType;
  instigatorFactionId: string;
  instigatorName: string;
  // 0-100. Grows from radicalization + unrest each intrigue tick.
  progress: number;
  startTick: number;
  // Progress thresholds at which we have already emitted a warning, so we don't
  // spam. e.g. [33, 66].
  warnedStages: number[];
  // Set true once progress hits 100 and the crisis has fired. Matured plots
  // stop progressing; terror/assassination plots linger until their event is
  // resolved (the resolution hook clears them), coups are removed immediately
  // because the event chain becomes the consequence.
  matured: boolean;
};

export type IntrigueState = {
  // factionId -> radicalization 0-100
  radicalization: Record<string, number>;
  plots: IntriguePlot[];
};

export function createDefaultIntrigueState(): IntrigueState {
  return { radicalization: {}, plots: [] };
}

// The five reputation axes, reused verbatim as the ideology space.
export const IDEOLOGY_AXES = ["mercy", "fear", "transparency", "populism", "stability"] as const;
export type IdeologyAxis = (typeof IDEOLOGY_AXES)[number];

export type IdeologyProfile = {
  label: string;
  // The regime stance this faction WANTS (each axis 0-100).
  target: Record<IdeologyAxis, number>;
  // How much this faction cares about each axis (0-1). Weights need not sum to 1.
  weight: Record<IdeologyAxis, number>;
};

// Defaults keyed by faction.type. Interpretation of axes:
//   fear high         = harsh, authoritarian rule
//   mercy high        = compassionate governance
//   transparency high = open government (low = secretive)
//   populism high     = pro-common-people (low = elitist)
//   stability high    = order / status quo (low = volatile)
const TYPE_PROFILES: Record<Faction["type"], IdeologyProfile> = {
  law: {
    label: "Authoritarian Order",
    target: { mercy: 30, fear: 75, transparency: 40, populism: 30, stability: 85 },
    weight: { mercy: 0.4, fear: 1.0, transparency: 0.3, populism: 0.5, stability: 1.0 },
  },
  criminal: {
    label: "Criminal Underworld",
    target: { mercy: 50, fear: 25, transparency: 20, populism: 40, stability: 20 },
    weight: { mercy: 0.3, fear: 0.9, transparency: 0.7, populism: 0.3, stability: 0.9 },
  },
  corporate: {
    label: "Corporate Technocracy",
    target: { mercy: 45, fear: 55, transparency: 30, populism: 15, stability: 70 },
    weight: { mercy: 0.3, fear: 0.4, transparency: 0.5, populism: 1.0, stability: 0.7 },
  },
  underclass: {
    label: "Populist Reform",
    target: { mercy: 80, fear: 25, transparency: 75, populism: 90, stability: 45 },
    weight: { mercy: 0.8, fear: 0.7, transparency: 0.6, populism: 1.0, stability: 0.3 },
  },
  cult: {
    label: "Zealous Purity",
    target: { mercy: 30, fear: 70, transparency: 25, populism: 35, stability: 60 },
    weight: { mercy: 0.5, fear: 0.8, transparency: 0.6, populism: 0.5, stability: 0.6 },
  },
  institutional: {
    label: "Procedural Legitimacy",
    target: { mercy: 45, fear: 35, transparency: 85, populism: 35, stability: 90 },
    weight: { mercy: 0.4, fear: 0.4, transparency: 1.0, populism: 0.5, stability: 1.0 },
  },
};

// Per-id overrides for seeded factions whose flavor diverges from their type.
const ID_PROFILES: Record<string, IdeologyProfile> = {
  // The Free Traders' Guild is typed "corporate" but is a libertarian merchant
  // coalition that despises a strong, crackdown-happy state — the opposite of
  // MegaCorp Syndicate's elitist technocracy.
  "free-traders": {
    label: "Free-Market Libertarian",
    target: { mercy: 55, fear: 20, transparency: 45, populism: 55, stability: 40 },
    weight: { mercy: 0.3, fear: 0.9, transparency: 0.4, populism: 0.4, stability: 0.5 },
  },
};

export function getIdeologyProfile(faction: Pick<Faction, "id" | "type">): IdeologyProfile {
  return ID_PROFILES[faction.id] ?? TYPE_PROFILES[faction.type] ?? TYPE_PROFILES.law;
}

function clamp100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/**
 * How well the current regime (reputation) matches what this faction wants.
 * Returns 0-100 where 100 = perfect ideological alignment. Computed as
 * 100 minus the weighted average of per-axis absolute distances.
 */
export function computeAlignment(
  faction: Pick<Faction, "id" | "type">,
  rep: Pick<CommanderReputation, IdeologyAxis>,
): number {
  const profile = getIdeologyProfile(faction);
  let wsum = 0;
  let dsum = 0;
  for (const axis of IDEOLOGY_AXES) {
    const w = profile.weight[axis];
    const target = profile.target[axis];
    const actual = clamp100(rep[axis] ?? 50);
    wsum += w;
    dsum += w * Math.abs(target - actual);
  }
  const avgDist = wsum > 0 ? dsum / wsum : 0; // 0-100
  return Math.round(clamp100(100 - avgDist));
}

/**
 * The single passive faction-loyalty drift source. Alignment above 50 nudges
 * loyalty up, below 50 nudges it down. Gentle so it takes many ticks to matter.
 */
export function computeLoyaltyDrift(alignment: number): number {
  return Math.round(((alignment - 50) * 0.04) * 100) / 100; // +/-2 at the extremes
}

/**
 * Per-tick radicalization change for a faction. Misalignment, low loyalty, high
 * unrest and high threat all push it up; a baseline decay pulls it down so a
 * well-aligned, loyal, calm faction de-radicalizes over time.
 */
export function computeRadicalizationDelta(
  faction: Pick<Faction, "loyalty" | "threat">,
  alignment: number,
  unrest: number,
): number {
  const loyalty = clamp100(faction.loyalty ?? 50);
  const threat = clamp100(faction.threat ?? 0);
  let d = 0;
  d += (50 - alignment) * 0.06; // ideological grievance, +/-3
  d += (40 - loyalty) * 0.05; // disloyalty, +2 at loyalty 0
  d += Math.max(0, unrest - 50) * 0.04; // city unrest amplifies, up to +2
  d += Math.max(0, threat - 50) * 0.02; // hostile factions plot harder, up to +1
  d -= 0.3; // baseline cool-down
  return Math.round(d * 100) / 100;
}

// A faction becomes a plotter once radicalization crosses this line.
export const PLOT_THRESHOLD = 60;
// Warning stages (progress %) at which we surface warning signs.
export const PLOT_WARN_STAGES = [33, 66] as const;

export function pickPlotType(faction: Pick<Faction, "type">): PlotType {
  switch (faction.type) {
    case "law":
    case "corporate":
    case "institutional":
      return "coup";
    case "cult":
    case "criminal":
      return "terror_cell";
    case "underclass":
    default:
      return "assassination";
  }
}

/**
 * How fast a plot escalates this tick. Driven by the instigator's radicalization
 * and city unrest so a deeply radicalized faction in a restless city moves fast.
 */
export function computePlotProgressDelta(radicalization: number, unrest: number): number {
  const d = Math.max(0, radicalization - 40) * 0.15 + Math.max(0, unrest - 40) * 0.05;
  return Math.round(d * 100) / 100;
}

export function makePlot(
  faction: Pick<Faction, "id" | "name" | "type">,
  tick: number,
): IntriguePlot {
  return {
    id: `plot-${faction.id}-${tick}`,
    type: pickPlotType(faction),
    instigatorFactionId: faction.id,
    instigatorName: faction.name,
    progress: 0,
    startTick: tick,
    warnedStages: [],
    matured: false,
  };
}

export const PLOT_TYPE_LABEL: Record<PlotType, string> = {
  coup: "COUP D'ÉTAT",
  terror_cell: "TERROR CELL",
  assassination: "ASSASSINATION PLOT",
};

// ---------------------------------------------------------------------------
// Player-facing event builders. These return plain GameEvent data (no state
// mutation). The caller stamps timestamp/resolved via applyEventFlavor.
// ---------------------------------------------------------------------------

const WARNING_RESPONSES: EventResponse[] = [
  {
    id: "intrigue_raid",
    label: "ORDER A RAID",
    effects: { credits: -6000, unrest: 4, lawOrder: 2 },
  },
  {
    id: "intrigue_infiltrate",
    label: "INFILTRATE QUIETLY",
    effects: { credits: -3000, corruption: 1 },
  },
  {
    id: "intrigue_address",
    label: "ADDRESS GRIEVANCES",
    effects: { credits: -4000, happiness: 3, unrest: -3 },
  },
  {
    id: "intrigue_ignore",
    label: "IGNORE IT",
    effects: {},
  },
];

export function buildIntrigueWarningEvent(plot: IntriguePlot): Omit<GameEvent, "timestamp" | "resolved"> {
  const kind = PLOT_TYPE_LABEL[plot.type];
  return {
    id: `intrigue_warn_${plot.id}`,
    title: `WARNING SIGN: ${kind} BREWING`,
    severity: "high",
    effects: {},
    plotId: plot.id,
    factionId: plot.instigatorFactionId,
    responseOptions: WARNING_RESPONSES,
  };
}

const TERROR_RESPONSES: EventResponse[] = [
  {
    id: "intrigue_terror_crackdown",
    label: "CITYWIDE CRACKDOWN",
    effects: { credits: -8000, unrest: 3, crime: -4, lawOrder: 4, happiness: -3 },
  },
  {
    id: "intrigue_terror_relief",
    label: "RELIEF & REASSURANCE",
    effects: { credits: -6000, happiness: 4, unrest: -4 },
  },
  {
    id: "intrigue_terror_martial",
    label: "DECLARE MARTIAL LAW",
    effects: { unrest: -5, happiness: -5, lawOrder: 5, corruption: 2 },
  },
];

export function buildTerrorEvent(plot: IntriguePlot): Omit<GameEvent, "timestamp" | "resolved"> {
  return {
    id: `intrigue_terror_${plot.id}`,
    title: `TERROR ATTACK: ${plot.instigatorName}`,
    severity: "critical",
    effects: { unrest: 6, happiness: -6, crime: 3, lawOrder: -3 },
    plotId: plot.id,
    factionId: plot.instigatorFactionId,
    responseOptions: TERROR_RESPONSES,
  };
}

const ASSASSINATION_RESPONSES: EventResponse[] = [
  {
    id: "intrigue_assass_bodyguards",
    label: "TRUST YOUR GUARD",
    effects: { unrest: 2, defenseRating: 2 },
  },
  {
    id: "intrigue_assass_bunker",
    label: "RETREAT TO THE BUNKER",
    effects: { credits: -5000, happiness: -2, unrest: 1 },
  },
  {
    id: "intrigue_assass_purge",
    label: "PURGE THE CONSPIRATORS",
    effects: { unrest: 4, happiness: -4, lawOrder: 3, corruption: 3 },
  },
];

export function buildAssassinationEvent(plot: IntriguePlot): Omit<GameEvent, "timestamp" | "resolved"> {
  return {
    id: `intrigue_assass_${plot.id}`,
    title: `ASSASSINATION ATTEMPT: ${plot.instigatorName}`,
    severity: "critical",
    effects: { unrest: 4, happiness: -3 },
    plotId: plot.id,
    factionId: plot.instigatorFactionId,
    responseOptions: ASSASSINATION_RESPONSES,
  };
}

// ---------------------------------------------------------------------------
// Resolution outcomes. applyResponseEffects only understands the 13 stat keys,
// so the intrigue-specific consequences (reduce plot progress, cool the
// faction, remove the plot) are applied by the eventResolution hook via this
// table. Values are pure data; resolveIntriguePlotResponse below applies them.
// ---------------------------------------------------------------------------

export type IntrigueOutcome = {
  progressDelta?: number;
  radicalizationDelta?: number;
  threatDelta?: number;
  removePlot?: boolean;
};

export const INTRIGUE_RESPONSE_OUTCOMES: Record<string, IntrigueOutcome> = {
  // Warning-event responses
  intrigue_raid: { progressDelta: -60, radicalizationDelta: -20, threatDelta: 8, removePlot: true },
  intrigue_infiltrate: { progressDelta: -35, radicalizationDelta: -12 },
  intrigue_address: { progressDelta: -25, radicalizationDelta: -28 },
  intrigue_ignore: { progressDelta: 12, radicalizationDelta: 4 },
  // Terror-event responses (plot already fired; these clean up + cool)
  intrigue_terror_crackdown: { radicalizationDelta: -18, threatDelta: 6, removePlot: true },
  intrigue_terror_relief: { radicalizationDelta: -22, removePlot: true },
  intrigue_terror_martial: { radicalizationDelta: -10, threatDelta: 4, removePlot: true },
  // Assassination-event responses
  intrigue_assass_bodyguards: { radicalizationDelta: -12, removePlot: true },
  intrigue_assass_bunker: { radicalizationDelta: -16, removePlot: true },
  intrigue_assass_purge: { radicalizationDelta: -30, threatDelta: 10, removePlot: true },
};

/**
 * Pure reducer: apply a response's intrigue outcome to an IntrigueState. Looks
 * up the plot by id, adjusts its progress / removes it, and cools (or heats)
 * the instigator faction's radicalization. Returns a NEW IntrigueState (and the
 * threatDelta for the caller to apply to the faction, since factions live
 * outside IntrigueState). No-ops safely if the plot or outcome is unknown.
 */
export function resolveIntriguePlotResponse(
  intrigue: IntrigueState,
  plotId: string,
  responseId: string,
): { intrigue: IntrigueState; instigatorFactionId: string | null; threatDelta: number } {
  const outcome = INTRIGUE_RESPONSE_OUTCOMES[responseId];
  const plot = intrigue.plots.find((p) => p.id === plotId);
  if (!outcome || !plot) {
    return { intrigue, instigatorFactionId: null, threatDelta: 0 };
  }

  const fid = plot.instigatorFactionId;
  const radicalization = { ...intrigue.radicalization };
  if (outcome.radicalizationDelta) {
    radicalization[fid] = clamp100((radicalization[fid] ?? 0) + outcome.radicalizationDelta);
  }

  let plots = intrigue.plots;
  const newProgress = clamp100(plot.progress + (outcome.progressDelta ?? 0));
  const shouldRemove = outcome.removePlot || newProgress <= 0;
  if (shouldRemove) {
    plots = intrigue.plots.filter((p) => p.id !== plotId);
  } else if (outcome.progressDelta) {
    plots = intrigue.plots.map((p) => (p.id === plotId ? { ...p, progress: newProgress } : p));
  }

  return {
    intrigue: { radicalization, plots },
    instigatorFactionId: fid,
    threatDelta: outcome.threatDelta ?? 0,
  };
}
