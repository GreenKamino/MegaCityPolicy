import type { GameState, TickEntry, ExternalMegacity, Township, GameMessage } from "./types";

export const ASCENSION_TECHS = {
  mindUpload: "mind_upload_facility",
  consciousnessTransfer: "consciousness_transfer_protocol",
  automatonCiv: "automaton_civilization",
  perpetualBiogenesis: "perpetual_biogenesis",
} as const;

const HOUSING_BUILDING_KEYS_PER_UNITS: ReadonlyArray<readonly [string, number]> = [
  ["habBlockMegaTowers", 8000],
  ["workerHousingStacks", 4000],
  ["highDensityResidentialPlatforms", 12000],
  ["transitIntegratedHousingNodes", 5000],
  ["emergencyShelterBunkers", 2000],
  ["undergroundShelterNetworks", 3000],
  ["modularHousingFactories", 6000],
];

export function getLivingUnits(state: GameState): number {
  const b = state.buildings ?? {};
  let total = 0;
  for (const [key, units] of HOUSING_BUILDING_KEYS_PER_UNITS) {
    const count = (b as Record<string, number>)[key];
    if (typeof count === "number" && count > 0) total += count * units;
  }
  return total;
}

export function getDroidCount(state: GameState): number {
  const u = (state.units ?? {}) as Record<string, number>;
  const b = (state.buildings ?? {}) as Record<string, number>;
  let total = 0;
  for (const k of Object.keys(u)) {
    if (k.toLowerCase().endsWith("droid") || k.toLowerCase().endsWith("droids")) {
      total += u[k] || 0;
    }
  }
  // Each robotics fabrication facility represents ~50 standing automatons.
  total += (b.roboticsFabricationFacilities ?? 0) * 50;
  return total;
}

export function getSyntheticPopulation(state: GameState): number {
  const d = state.demographics;
  if (!d) return 0;
  return (d.clonePopulation ?? 0) + (d.cloneWorkers ?? 0) + (d.cloneSoldiers ?? 0) + (d.geneticModifiedCitizens ?? 0);
}

export function hasMachineAscension(state: GameState): boolean {
  const techs = new Set(state.unlockedTechnologies ?? []);
  return (
    techs.has(ASCENSION_TECHS.mindUpload) &&
    techs.has(ASCENSION_TECHS.consciousnessTransfer) &&
    techs.has(ASCENSION_TECHS.automatonCiv)
  );
}

export function hasBioPerpetuation(state: GameState): boolean {
  const techs = new Set(state.unlockedTechnologies ?? []);
  return techs.has(ASCENSION_TECHS.perpetualBiogenesis);
}

export function deriveSurvivalMode(state: GameState): "biological" | "machine" | "hybrid" {
  const machine = hasMachineAscension(state);
  const bio = hasBioPerpetuation(state);
  if (machine && bio) return "hybrid";
  if (machine) return "machine";
  // Biogenesis alone is its own standalone exception — biological pop
  // is self-regenerating, so the city cannot fall to zero-pop. We model
  // this as "hybrid" without machine survival (synthetic pop carries it).
  if (bio) return "hybrid";
  return "biological";
}

export type EndStateCheckResult = {
  status: "active" | "fallen" | "ascended-machine" | "ascended-bio";
  survivalMode: "biological" | "machine" | "hybrid";
  cause?: string;
};

export function evaluateEndState(state: GameState): EndStateCheckResult {
  const survivalMode = deriveSurvivalMode(state);
  const citizens = state.cityStats?.population ?? 0;
  const livingUnits = getLivingUnits(state);
  const droids = getDroidCount(state);
  const synthetic = getSyntheticPopulation(state);

  // Biological default: city falls iff citizens AND living units both 0.
  if (survivalMode === "biological") {
    if (citizens <= 0 && livingUnits <= 0) {
      return { status: "fallen", survivalMode, cause: "Zero citizens and zero living units." };
    }
    return { status: "active", survivalMode };
  }

  // Machine survival: once biological pop hits zero, the survival
  // metric switches entirely to droid count. Empty housing alone
  // doesn't keep the city alive — droids must still exist.
  if (survivalMode === "machine") {
    if (citizens <= 0 && droids <= 0) {
      return { status: "fallen", survivalMode, cause: "Automaton civilization collapsed — no droids remain." };
    }
    if (citizens <= 0) {
      return { status: "ascended-machine", survivalMode };
    }
    return { status: "active", survivalMode };
  }

  // Hybrid: biogenesis (bio-only or with machine) and/or droids carry
  // the city. Falls only when ALL survival paths are exhausted.
  const hasMachine = hasMachineAscension(state);
  if (citizens <= 0) {
    if (synthetic > 0) return { status: "ascended-bio", survivalMode: "hybrid" };
    if (hasMachine && droids > 0) return { status: "ascended-machine", survivalMode: "hybrid" };
    // Pure biogenesis with zero biological + zero synthetic: the
    // engineered lineages collapsed. Falls iff housing also gone (no
    // vat infrastructure left). When biogenesis-only and at least
    // some housing remains, treat as ascended-bio (vats can rebuild).
    if (!hasMachine) {
      if (livingUnits > 0) return { status: "ascended-bio", survivalMode: "hybrid" };
      return { status: "fallen", survivalMode: "hybrid", cause: "Biogenesis vats exhausted — no infrastructure remains." };
    }
    return { status: "fallen", survivalMode: "hybrid", cause: "All survival paths exhausted." };
  }
  return { status: "active", survivalMode: "hybrid" };
}

/** Tick processor: stamp endState on the player city, append a one-shot
 *  alert when the status transitions, and surface a tick-log entry. */
export function processEndStateCheck(s: GameState, entries: TickEntry[]): void {
  const prev = s.endState ?? { status: "active" as const, survivalMode: "biological" as const };
  const next = evaluateEndState(s);

  // Always refresh survivalMode (techs may unlock mid-run).
  if (next.status === prev.status && next.survivalMode === prev.survivalMode) {
    if (!s.endState) s.endState = { status: next.status, survivalMode: next.survivalMode };
    return;
  }

  const prevEndedAtTick = s.endState?.endedAtTick;
  const statusChanged = next.status !== prev.status;
  s.endState = {
    status: next.status,
    survivalMode: next.survivalMode,
    endedAtTick: next.status === "fallen" ? s.totalTicks : prevEndedAtTick,
    cause: next.cause,
    // Preserve the player's acknowledgement across survivalMode-only changes
    // (e.g. a late-game tech flips biological→machine while the city is still
    // "active"); reset it on a real status transition so a fresh end-state
    // modal fires for the new terminal/ascended status.
    acknowledged: statusChanged ? undefined : s.endState?.acknowledged,
  };

  // Emit an alert + tick entry on transition into a terminal/ascended status.
  if (next.status !== prev.status && next.status !== "active") {
    const title =
      next.status === "fallen" ? "CITY FALLEN" :
      next.status === "ascended-machine" ? "MACHINE ASCENSION" :
      "BIOLOGICAL PERPETUATION";
    const body =
      next.status === "fallen"
        ? `${next.cause ?? "City has collapsed."} Your reign as Commander ends here.`
        : next.status === "ascended-machine"
        ? "Citizens are gone — but the automaton substrate persists. The city runs on droids now. Survival metric switched to droid count."
        : "Biological pop has zeroed — but engineered lineages and clone populations carry the population forward.";
    const alert: GameMessage = {
      id: `endstate-${next.status}-${s.totalTicks}`,
      timestamp: s.gameDate, tick: s.totalTicks, category: "alert",
      title, body, read: false, priority: "critical",
    };
    s.messages = [alert, ...(s.messages ?? [])];
    entries.push({
      label: "City End-State",
      delta: 0,
      unit: "status",
      reason: `${prev.status} → ${next.status}${next.cause ? ` (${next.cause})` : ""}`,
      severity: next.status === "fallen" ? "negative" : "positive",
    });
  }
}

/** NPC equivalent. A non-occupied/non-annexed partner city whose
 *  population reaches 0 is marked "fallen". Symmetrical with the player
 *  rule: NPCs do NOT have ascension techs in this pass, so zero pop is
 *  always terminal for them. Returns the (possibly updated) entity and
 *  any alert to surface in the tick. */
export function applyNpcEndStateCheck<T extends ExternalMegacity | Township>(
  entity: T,
  totalTicks: number,
  gameDate: GameState["gameDate"],
): { entity: T; alert: GameMessage | null } {
  if (entity.endState === "fallen") return { entity, alert: null };
  const ctrl = entity.controlStatus ?? "independent";
  if (ctrl === "occupied" || ctrl === "annexed") return { entity, alert: null };
  const pop = entity.population ?? 0;
  if (pop > 0) return { entity, alert: null };
  const updated = {
    ...entity,
    endState: "fallen" as const,
    endedAtTick: totalTicks,
    endCause: "Population reached zero — civic authority dissolved.",
  } as T;
  const alert: GameMessage = {
    id: `npc-fallen-${entity.id}-${totalTicks}`,
    timestamp: gameDate,
    tick: totalTicks,
    category: "alert",
    title: `${entity.name}: CITY FALLEN`,
    body: `${entity.name} has gone dark. Final reports indicate zero living citizens. The settlement is now a ruin on the map.`,
    read: false,
    priority: "high",
  };
  return { entity: updated, alert };
}
