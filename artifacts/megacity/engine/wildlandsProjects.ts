import type { GameState, TickEntry, WildlandsProject, WildlandsProjectKind } from "@/engine/types";
import { recordCreditsEarned } from "@/engine/creditTracking";
import type { Biome } from "@/engine/biomes";
import { BIOMES, biomeForDistrictCategory } from "@/engine/biomes";
import { getDistrictCategory } from "@/engine/districts";
import { applyInterventionToEcology } from "@/engine/wildlandsEcology";
import { resolveMegafaunaHunt, resolveBeastCapture, resolveMegafaunaRetaliation } from "@/engine/megafaunaHunts";
import { applyResourceDelta, summarizeMedicalStorageGain } from "@/engine/resourceStorage";

export type WildlandsProjectDef = {
  kind: WildlandsProjectKind;
  name: string;
  short: string;
  description: string;
  duration: number;
  cost: { credits: number; fuel?: number; water?: number; medSupplies?: number };
  ecologyDelta: number;
  resourceReward?: { food?: number; water?: number; medSupplies?: number; credits?: number };
  resultText: string;
};

export const WILDLANDS_PROJECTS: Record<WildlandsProjectKind, WildlandsProjectDef> = {
  ranger_patrol: {
    kind: "ranger_patrol",
    name: "DISPATCH RANGER PATROL",
    short: "RANGER PATROL",
    description: "Send a sweep team into the biome. Suppresses vermin pressure and stabilizes the local food chain.",
    duration: 4,
    cost: { credits: 500, fuel: 50 },
    ecologyDelta: 4,
    resourceReward: { food: 60 },
    resultText: "Patrol returns. Vermin pressure eased; rangers brought back trail meat.",
  },
  cultivation: {
    kind: "cultivation",
    name: "START CULTIVATION PROJECT",
    short: "CULTIVATION",
    description: "Seed and tend hardy producer species across the biome. Slow but lasting boost to ecology and food yield.",
    duration: 8,
    cost: { credits: 800, water: 120 },
    ecologyDelta: 8,
    resourceReward: { food: 180 },
    resultText: "Cultivation cycle complete. Producer cover expanded; food yield bumped.",
  },
  restoration: {
    kind: "restoration",
    name: "RUN RESTORATION PROGRAM",
    short: "RESTORATION",
    description: "Long-form ecology restoration: scrub contamination, replant keystone flora, reintroduce balancing fauna.",
    duration: 12,
    cost: { credits: 1500, medSupplies: 60, water: 80 },
    ecologyDelta: 14,
    resourceReward: { medSupplies: 25, water: 60 },
    resultText: "Restoration program closes out. Biome health visibly improved.",
  },
  cull: {
    kind: "cull",
    name: "AUTHORIZE CULL OPERATION",
    short: "CULL",
    description: "Hunt down vermin swarms and trim apex predator numbers. Slashes pest populations but bruises the food chain.",
    duration: 3,
    cost: { credits: 600, fuel: 80 },
    ecologyDelta: -2,
    resourceReward: { food: 40 },
    resultText: "Cull complete. Vermin pressure broken; predator numbers trimmed back.",
  },
  vaccinate: {
    kind: "vaccinate",
    name: "DEPLOY VACCINATION TEAMS",
    short: "VACCINATE",
    description: "Inoculate fauna against zoonotic pathogens. Suppresses disease events and stabilizes herbivore numbers.",
    duration: 5,
    cost: { credits: 900, medSupplies: 80, water: 40 },
    ecologyDelta: 3,
    resultText: "Vaccination cycle complete. Disease vectors quiet across the biome.",
  },
  fence: {
    kind: "fence",
    name: "ERECT PERIMETER FENCING",
    short: "FENCING",
    description: "Run wildlife corridor fencing to keep predators and vermin off cultivated zones. Protects herbivores and flora.",
    duration: 6,
    cost: { credits: 1100, fuel: 60 },
    ecologyDelta: 4,
    resultText: "Fencing in place. Predator pressure on grazers eased.",
  },
  // Big-game hunts and live captures use their own launchers (see megafaunaHunts.ts).
  // These stub entries exist so generic UI loops keying off WILDLANDS_PROJECTS work.
  beast_hunt: {
    kind: "beast_hunt",
    name: "BIG GAME HUNT",
    short: "BIG GAME",
    description: "Bring down a megafauna boss in this biome. High risk, high reward.",
    duration: 4,
    cost: { credits: 0 },
    ecologyDelta: 0,
    resultText: "Hunt resolved.",
  },
  beast_capture: {
    kind: "beast_capture",
    name: "LIVE CAPTURE",
    short: "CAPTURE",
    description: "Wranglers attempt to capture live fauna for taming and combat deployment.",
    duration: 6,
    cost: { credits: 0 },
    ecologyDelta: 0,
    resultText: "Capture resolved.",
  },
  // Scheduled by resolveMegafaunaHunt on wounded_retreat or rout. Counts down
  // silently in the background, then strikes when the megafauna comes back.
  megafauna_retaliation: {
    kind: "megafauna_retaliation",
    name: "MEGAFAUNA RETALIATION INCOMING",
    short: "RETALIATION",
    description: "A wounded boss is tracking back toward our perimeter. Brace for incursion.",
    duration: 8,
    cost: { credits: 0 },
    ecologyDelta: 0,
    resultText: "Retaliation resolved.",
  },
};

export function canAffordWildlandsProject(state: GameState, kind: WildlandsProjectKind): { ok: boolean; reason?: string } {
  const def = WILDLANDS_PROJECTS[kind];
  const r = state.resources;
  if (r.credits < def.cost.credits) return { ok: false, reason: `Need ${def.cost.credits.toLocaleString()} credits.` };
  if (def.cost.fuel && r.fuel < def.cost.fuel) return { ok: false, reason: `Need ${def.cost.fuel} fuel.` };
  if (def.cost.water && r.water < def.cost.water) return { ok: false, reason: `Need ${def.cost.water} water.` };
  if (def.cost.medSupplies && r.medSupplies < def.cost.medSupplies) return { ok: false, reason: `Need ${def.cost.medSupplies} med supplies.` };
  return { ok: true };
}

export function startWildlandsProject(state: GameState, kind: WildlandsProjectKind, biome: Biome): GameState {
  const def = WILDLANDS_PROJECTS[kind];
  // Re-check affordability at mutation time so callers cannot bypass the gate
  // (e.g. resources changed between modal open and confirm). On failure, return
  // state unchanged.
  const afford = canAffordWildlandsProject(state, kind);
  if (!afford.ok) return state;
  const proj: WildlandsProject = {
    id: `wl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind,
    biome,
    ticksRemaining: def.duration,
    totalTicks: def.duration,
    status: "active",
    startedAtTick: state.totalTicks ?? 0,
  };
  const r = state.resources;
  return {
    ...state,
    resources: {
      ...r,
      credits: r.credits - def.cost.credits,
      fuel: Math.max(0, r.fuel - (def.cost.fuel ?? 0)),
      water: Math.max(0, r.water - (def.cost.water ?? 0)),
      medSupplies: Math.max(0, r.medSupplies - (def.cost.medSupplies ?? 0)),
    },
    wildlandsProjects: [proj, ...(state.wildlandsProjects ?? [])],
  };
}

function entry(label: string, delta: number, unit: string, reason: string, severity: TickEntry["severity"]): TickEntry {
  return { label, delta, unit, reason, severity };
}

function applyEcologyToBiome(state: GameState, biome: Biome, delta: number): number {
  let touched = 0;
  state.districts = state.districts.map((d) => {
    const cat = getDistrictCategory(d.id);
    const districtBiome = biomeForDistrictCategory(cat);
    if (districtBiome !== biome) return d;
    touched++;
    const next = Math.max(0, Math.min(100, (d.ecology ?? 25) + delta));
    return { ...d, ecology: next };
  });
  return touched;
}

export function processWildlandsProjects(state: GameState, entries: TickEntry[]): void {
  const projects = state.wildlandsProjects;
  if (!projects || projects.length === 0) return;

  // Track ids present at the start of this tick. Resolvers (e.g. the hunt
  // resolver scheduling a retaliation) may push new projects directly onto
  // state.wildlandsProjects; we need to preserve those when we rewrite the
  // array at the end of this function.
  const originalIds = new Set(projects.map((p) => p.id));
  const nextProjects: WildlandsProject[] = [];
  for (const p of projects) {
    if (p.status !== "active") {
      // Keep recently completed for a window so the player can see results
      nextProjects.push(p);
      continue;
    }
    const remaining = p.ticksRemaining - 1;
    if (remaining > 0) {
      nextProjects.push({ ...p, ticksRemaining: remaining });
      continue;
    }
    // Project complete — dispatch on kind
    if (p.kind === "beast_hunt") {
      const completed: WildlandsProject = { ...p, ticksRemaining: 0, status: "completed" };
      resolveMegafaunaHunt(state, completed, entries);
      nextProjects.push(completed);
      continue;
    }
    if (p.kind === "beast_capture") {
      const completed: WildlandsProject = { ...p, ticksRemaining: 0, status: "completed" };
      resolveBeastCapture(state, completed, entries);
      nextProjects.push(completed);
      continue;
    }
    if (p.kind === "megafauna_retaliation") {
      const completed: WildlandsProject = { ...p, ticksRemaining: 0, status: "completed" };
      resolveMegafaunaRetaliation(state, completed, entries);
      nextProjects.push(completed);
      continue;
    }
    const def = WILDLANDS_PROJECTS[p.kind];
    if (!def) {
      // Unknown project kind survived sanitizer (defensive). Drop silently.
      nextProjects.push({ ...p, ticksRemaining: 0, status: "completed", result: "Unknown project kind discarded." });
      continue;
    }
    const biomeDef = BIOMES[p.biome];
    const biomeName = biomeDef ? biomeDef.shortName : String(p.biome).toUpperCase();
    const touched = applyEcologyToBiome(state, p.biome, def.ecologyDelta);
    if (p.kind === "cull" || p.kind === "vaccinate" || p.kind === "fence") {
      applyInterventionToEcology(state, p.biome, p.kind);
    }
    let resultText = def.resultText;
    let rewardSeverity: TickEntry["severity"] = "positive";
    if (def.resourceReward) {
      const r = state.resources;
      state.resources = {
        ...r,
        water: r.water + (def.resourceReward.water ?? 0),
        medSupplies: r.medSupplies,
        credits: r.credits + (def.resourceReward.credits ?? 0),
      };
      applyResourceDelta(state, "food", def.resourceReward.food ?? 0);
      const medicalReward = applyResourceDelta(state, "medSupplies", def.resourceReward.medSupplies ?? 0);
      if ((def.resourceReward.medSupplies ?? 0) > 0) {
        resultText = `${resultText} ${summarizeMedicalStorageGain(medicalReward)}`;
        if (medicalReward.rejected > 0) rewardSeverity = "warning";
      }
      recordCreditsEarned(state, def.resourceReward.credits ?? 0);
    }
    entries.push(entry(
      `WILDLANDS — ${def.short}`,
      def.ecologyDelta,
      `eco ${biomeName} ×${touched}`,
      resultText,
      rewardSeverity,
    ));
    nextProjects.push({ ...p, ticksRemaining: 0, status: "completed", result: resultText });
  }

  // Pick up any projects that resolvers spawned mid-tick (e.g. retaliations
  // scheduled by the hunt resolver). They're identified by being present on
  // state.wildlandsProjects but absent from the original snapshot and from
  // nextProjects.
  const seenIds = new Set(nextProjects.map((p) => p.id));
  const spawned: WildlandsProject[] = [];
  for (const p of state.wildlandsProjects ?? []) {
    if (!originalIds.has(p.id) && !seenIds.has(p.id)) {
      spawned.push(p);
    }
  }

  // Trim completed projects so the list stays manageable: keep last 6 completed.
  // Spawned-this-tick projects are listed first so a same-tick-completed spawn
  // is never starved out of the retention window by older completed entries.
  const merged = [...spawned, ...nextProjects];
  const active = merged.filter((p) => p.status === "active");
  const completed = merged.filter((p) => p.status === "completed").slice(0, 6);
  state.wildlandsProjects = [...active, ...completed];
}
