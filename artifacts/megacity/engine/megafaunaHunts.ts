import type {
  GameState,
  TickEntry,
  WildlandsProject,
  GameMessage,
  MegafaunaId,
  TamingEntry,
} from "@/engine/types";
import type { Biome } from "@/engine/biomes";
import { BIOMES } from "@/engine/biomes";
import { ATTACK_TYPES, type AttackTypeId } from "@/engine/strikeData";
import { deductCasualties, UNIT_ROLE_MAP } from "@/engine/loadout";
import { biomeForDistrictCategory } from "@/engine/biomes";
import { getDistrictCategory } from "@/engine/districts";
import { recordCreditsEarned } from "@/engine/creditTracking";
import {
  applyResourceDelta,
  summarizeMedicalStorageGain,
  type ResourceDeltaResult,
} from "@/engine/resourceStorage";

function applyEcologyDeltaToBiome(state: GameState, biome: Biome, delta: number): void {
  state.districts = state.districts.map((d) => {
    const cat = getDistrictCategory(d.id);
    const districtBiome = biomeForDistrictCategory(cat);
    if (districtBiome !== biome) return d;
    const next = Math.max(0, Math.min(100, (d.ecology ?? 25) + delta));
    return { ...d, ecology: next };
  });
}

export type UniqueTrophy = {
  ivory?: number;
  alphaPheromones?: number;
  exoticPelts?: number;
  geneVaultSamples?: number;
};

export type MegafaunaBoss = {
  id: MegafaunaId;
  name: string;
  shortName: string;
  attackTypeId: AttackTypeId;
  durationTicks: number;
  description: string;
  hp: number;
  successFloor: number;
  loot: { credits: number; steel?: number; ammo?: number; medSupplies?: number; water?: number; food?: number };
  // Phase 5 unique loot: only drops on a clean, full-phase kill. Quantities
  // shown are awarded on a 3/3-phase success; 2/3 awards 50% (rounded down).
  uniqueLoot: UniqueTrophy;
  ecologyOnSuccess: number;
  ecologyOnFailure: number;
  casualtyMultiplier: number;
  preferredBiomes: Biome[];
};

export const MEGAFAUNA_BOSSES: Record<MegafaunaId, MegafaunaBoss> = {
  tarpit_titan: {
    id: "tarpit_titan",
    name: "TARPIT TITAN",
    shortName: "TITAN",
    attackTypeId: "tarpit_titan_hunt",
    durationTicks: 4,
    description: "Forty-ton tarpit titan, ridges of fused armor, slow but unkillable in a stand-up fight. Bring heavy guns or don't come back.",
    hp: 220,
    successFloor: 0.55,
    loot: { credits: 22000, steel: 180, medSupplies: 120 },
    uniqueLoot: { ivory: 8, exoticPelts: 4 },
    ecologyOnSuccess: -4,
    ecologyOnFailure: -12,
    casualtyMultiplier: 1.4,
    preferredBiomes: ["toxic_marsh", "fungal_caves"],
  },
  ridge_tyrant: {
    id: "ridge_tyrant",
    name: "RIDGE TYRANT",
    shortName: "TYRANT",
    attackTypeId: "ridge_tyrant_hunt",
    durationTicks: 5,
    description: "Apex ridge tyrant. Pack predator the size of a tank with hide that shrugs small arms. A trophy for the ages, if you survive.",
    hp: 260,
    successFloor: 0.50,
    loot: { credits: 26000, ammo: 400, steel: 220 },
    uniqueLoot: { alphaPheromones: 6, exoticPelts: 8 },
    ecologyOnSuccess: -5,
    ecologyOnFailure: -14,
    casualtyMultiplier: 1.6,
    preferredBiomes: ["ash_forest", "irradiated_jungle"],
  },
  glassback_whale: {
    id: "glassback_whale",
    name: "GLASSBACK WHALE",
    shortName: "WHALE",
    attackTypeId: "glassback_whale_hunt",
    durationTicks: 5,
    description: "Sky-borne glassback. Glides on thermals at altitude and razes whole sectors when it sounds. Air-heavy harpoon strike or nothing.",
    hp: 280,
    successFloor: 0.48,
    loot: { credits: 28000, medSupplies: 200, water: 120 },
    uniqueLoot: { geneVaultSamples: 5, exoticPelts: 6, ivory: 3 },
    ecologyOnSuccess: -6,
    ecologyOnFailure: -16,
    casualtyMultiplier: 1.5,
    preferredBiomes: ["dead_sea_coast", "ruined_park"],
  },
};

export type CapturableBeast = {
  unitKey: "ridgebackHoundPacks" | "glasshornOxCavalry" | "skywingFliers";
  label: string;
  biomes: Biome[];
  capturePerAttempt: { min: number; max: number };
  tameTicks: number;
  description: string;
};

export const CAPTURABLE_BEASTS: CapturableBeast[] = [
  {
    unitKey: "ridgebackHoundPacks",
    label: "RIDGEBACK HOUND PACKS",
    biomes: ["toxic_marsh", "ash_forest", "fungal_caves"],
    capturePerAttempt: { min: 1, max: 3 },
    tameTicks: 24,
    description: "Pack hunters. Fast, vicious, loyal once broken. Excels at flanking and pursuit.",
  },
  {
    unitKey: "glasshornOxCavalry",
    label: "GLASSHORN OX CAVALRY",
    biomes: ["ruined_park", "dead_sea_coast", "toxic_marsh"],
    capturePerAttempt: { min: 1, max: 2 },
    tameTicks: 32,
    description: "Plated bull-class megafauna. Slow, devastating in a charge, soaks heavy fire.",
  },
  {
    unitKey: "skywingFliers",
    label: "SKYWING FLIERS",
    biomes: ["ash_forest", "dead_sea_coast", "glass_desert"],
    capturePerAttempt: { min: 1, max: 2 },
    tameTicks: 28,
    description: "Sky predators trained as living gunships. High mobility air support, fragile if grounded.",
  },
];

const CAPTURE_BASE_COST = { credits: 4500, fuel: 60, medSupplies: 30 };
const CAPTURE_DURATION_TICKS = 6;
const WRANGLERS_PER_CAPTURE = 5;

function pushMessage(s: GameState, msg: GameMessage): void {
  s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
}

function ensureUnits(s: GameState): Record<string, number> {
  if (!s.units) s.units = {};
  return s.units;
}

function biomeShortName(biome: Biome): string {
  return BIOMES[biome]?.shortName ?? String(biome).toUpperCase();
}

// ─── MEGAFAUNA HUNT ─────────────────────────────────────────────────────────
function isCombatUnitKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(UNIT_ROLE_MAP, key);
}

export function canAffordMegafaunaHunt(
  state: GameState,
  megaId: MegafaunaId,
  loadout: Record<string, number>
): { ok: boolean; reason?: string } {
  const boss = MEGAFAUNA_BOSSES[megaId];
  const at = ATTACK_TYPES.find((a) => a.id === boss.attackTypeId);
  if (!at) return { ok: false, reason: "Hunt package unavailable." };
  const r = state.resources;
  if (r.credits < at.creditsCost) return { ok: false, reason: `Need ${at.creditsCost.toLocaleString()} credits.` };
  if (r.ammo < at.ammoCost) return { ok: false, reason: `Need ${at.ammoCost} ammo.` };
  if (r.fuel < at.fuelCost) return { ok: false, reason: `Need ${at.fuelCost} fuel.` };
  const totalUnits = Object.values(loadout).reduce((s, n) => s + (n || 0), 0);
  if (totalUnits < at.minUnits) return { ok: false, reason: `Need ${at.minUnits} combat units (have ${totalUnits}).` };
  const units = state.units ?? {};
  for (const [k, n] of Object.entries(loadout)) {
    if (n <= 0) continue;
    if (!isCombatUnitKey(k)) return { ok: false, reason: `${k} is not a combat unit.` };
    if ((units[k] ?? 0) < n) return { ok: false, reason: `Insufficient ${k} (have ${units[k] ?? 0}, need ${n}).` };
  }
  return { ok: true };
}

// Builds a default loadout that draws the strike's minUnits **only from
// combat-eligible roster** (UNIT_ROLE_MAP). Civilian/admin/support workforce
// is never deployed by the auto-loadout. Returns whatever combat units are
// available; the caller handles the case where it cannot reach minUnits.
export function buildAutoHuntLoadout(state: GameState, megaId: MegafaunaId): Record<string, number> {
  const boss = MEGAFAUNA_BOSSES[megaId];
  const at = ATTACK_TYPES.find((a) => a.id === boss.attackTypeId);
  if (!at) return {};
  const target = Math.max(at.minUnits, 30);
  const out: Record<string, number> = {};
  const units = state.units ?? {};
  const combatKeys = Object.keys(units).filter((k) => isCombatUnitKey(k) && (units[k] ?? 0) > 0);
  // Sort by count descending so the heaviest stacks contribute first.
  combatKeys.sort((a, b) => (units[b] ?? 0) - (units[a] ?? 0));
  let remaining = target;
  // First pass: take up to 1/4 of each stack, capped by per-stack ceiling so
  // the loadout doesn't gut a single unit type.
  const perStackCap = Math.max(2, Math.ceil(target / 4));
  for (const k of combatKeys) {
    if (remaining <= 0) break;
    const have = units[k] ?? 0;
    const take = Math.min(have, perStackCap, remaining);
    if (take > 0) {
      out[k] = take;
      remaining -= take;
    }
  }
  // Second pass: if we still haven't hit the target, fill from the largest
  // remaining stacks until exhausted or we hit the target.
  if (remaining > 0) {
    for (const k of combatKeys) {
      if (remaining <= 0) break;
      const have = units[k] ?? 0;
      const already = out[k] ?? 0;
      const headroom = Math.max(0, have - already);
      if (headroom <= 0) continue;
      const take = Math.min(headroom, remaining);
      out[k] = already + take;
      remaining -= take;
    }
  }
  return out;
}

export function startMegafaunaHunt(
  state: GameState,
  megaId: MegafaunaId,
  biome: Biome,
  loadout: Record<string, number>
): GameState {
  const boss = MEGAFAUNA_BOSSES[megaId];
  const at = ATTACK_TYPES.find((a) => a.id === boss.attackTypeId);
  if (!at) return state;
  const afford = canAffordMegafaunaHunt(state, megaId, loadout);
  if (!afford.ok) return state;

  const r = state.resources;
  const units = { ...(state.units ?? {}) };
  for (const [k, n] of Object.entries(loadout)) {
    units[k] = Math.max(0, (units[k] ?? 0) - n);
  }

  const proj: WildlandsProject = {
    id: `hunt-${megaId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: "beast_hunt",
    biome,
    ticksRemaining: boss.durationTicks,
    totalTicks: boss.durationTicks,
    status: "active",
    startedAtTick: state.totalTicks ?? 0,
    meta: { megafaunaId: megaId, loadoutSnapshot: { ...loadout } },
  };

  return {
    ...state,
    resources: {
      ...r,
      credits: Math.max(0, r.credits - at.creditsCost),
      ammo: Math.max(0, r.ammo - at.ammoCost),
      fuel: Math.max(0, r.fuel - at.fuelCost),
    },
    units,
    wildlandsProjects: [proj, ...(state.wildlandsProjects ?? [])],
  };
}

// ─── FACTION REACTIONS ──────────────────────────────────────────────────────
// Megafauna kills reverberate through the city's underclass and cult factions.
// Cults that revere apex predators feel emboldened by failures (their threat
// rises) and deflated by clean kills (threat falls). Underclass factions admire
// successful hunts (loyalty up) and lose faith on routs.
function applyFactionReactionToHunt(
  state: GameState,
  outcome: "full_kill" | "wounded_retreat" | "rout"
): void {
  if (!Array.isArray(state.factions)) return;
  for (const f of state.factions) {
    if (!f || typeof f !== "object") continue;
    if (f.type === "cult") {
      if (outcome === "full_kill") f.threat = Math.max(0, (f.threat ?? 0) - 3);
      else if (outcome === "rout") f.threat = Math.min(100, (f.threat ?? 0) + 4);
    } else if (f.type === "underclass") {
      if (outcome === "full_kill") f.loyalty = Math.min(100, (f.loyalty ?? 0) + 2);
      else if (outcome === "rout") f.loyalty = Math.max(0, (f.loyalty ?? 0) - 3);
    }
  }
}

// Map between the engine's trophy keys and the corresponding Phase-3 commodity
// ids. Boss kills feed both the dedicated `wildlandsTrophies` counter (used for
// quick UI summaries and lore display) AND the global `state.stockpiles` map
// that drives the commodities/trade pipeline. This means trophies are real,
// sellable, contraband-bearing inventory — not just a stat field.
const TROPHY_COMMODITY_IDS: Record<keyof UniqueTrophy, string> = {
  ivory: "ivory_tusks",
  alphaPheromones: "alpha_pheromones",
  exoticPelts: "exotic_pelts",
  geneVaultSamples: "gene_vault_samples",
};

function addTrophies(state: GameState, drop: UniqueTrophy, scale: number): UniqueTrophy {
  if (!state.wildlandsTrophies) state.wildlandsTrophies = {};
  if (!state.stockpiles || typeof state.stockpiles !== "object") state.stockpiles = {};
  const out: UniqueTrophy = {};
  const t = state.wildlandsTrophies;
  const stock = state.stockpiles;
  for (const key of ["ivory", "alphaPheromones", "exoticPelts", "geneVaultSamples"] as (keyof UniqueTrophy)[]) {
    const v = drop[key];
    if (typeof v === "number" && v > 0) {
      const awarded = Math.max(0, Math.floor(v * scale));
      if (awarded > 0) {
        t[key] = (t[key] ?? 0) + awarded;
        const commodityId = TROPHY_COMMODITY_IDS[key];
        stock[commodityId] = (stock[commodityId] ?? 0) + awarded;
        out[key] = awarded;
      }
    }
  }
  return out;
}

function summarizeTrophies(t: UniqueTrophy): string {
  const labels: Array<[keyof UniqueTrophy, string]> = [
    ["ivory", "ivory"],
    ["alphaPheromones", "alpha pheromones"],
    ["exoticPelts", "exotic pelts"],
    ["geneVaultSamples", "gene-vault samples"],
  ];
  const parts: string[] = [];
  for (const [k, l] of labels) {
    const v = t[k];
    if (typeof v === "number" && v > 0) parts.push(`+${v} ${l}`);
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}

export function resolveMegafaunaHunt(
  state: GameState,
  project: WildlandsProject,
  entries: TickEntry[]
): void {
  const megaId = project.meta?.megafaunaId;
  if (!megaId) return;
  const boss = MEGAFAUNA_BOSSES[megaId];
  if (!boss) return; // unknown id survived sanitizer — drop silently
  const at = ATTACK_TYPES.find((a) => a.id === boss.attackTypeId);
  if (!at) return;
  const loadout = project.meta?.loadoutSnapshot ?? {};
  const totalDeployed = Object.values(loadout).reduce((s, n) => s + (n || 0), 0);
  const biomeName = biomeShortName(project.biome);

  // Multi-phase boss combat. The kill is decomposed into three sequential
  // phases — Approach, Engagement, Killing Blow — each with its own roll.
  // Per-phase success probability uses the same accuracy + size-deficit
  // formula as before, but each phase is independent and contributes to the
  // overall outcome:
  //   3/3 success  → FULL KILL (regular loot + 100% unique trophies)
  //   2/3 success  → WOUNDED RETREAT (regular loot + 50% unique trophies)
  //   ≤ 1/3 success → ROUT (no loot, max casualties)
  // Casualties accumulate across attempted phases regardless of outcome.
  const sizeRatio = at.minUnits > 0 ? Math.min(1.5, totalDeployed / at.minUnits) : 1;
  const sizePenalty = sizeRatio < 1 ? 1 - sizeRatio : 0;
  const baseChance = Math.max(0.10, Math.min(0.95, at.accuracy * (1 - sizePenalty * 0.7)));
  const phaseChance = Math.max(boss.successFloor * 0.5, baseChance);

  const phaseLabels = ["APPROACH", "ENGAGEMENT", "KILLING BLOW"] as const;
  const phaseRiskMod = [0.55, 0.95, 1.35]; // killing blow burns the most
  const phaseResults: { label: string; ok: boolean; lossRate: number }[] = [];
  let cumulativeLossFraction = 0;
  for (let i = 0; i < 3; i++) {
    const ok = Math.random() < phaseChance;
    const baseRisk = at.riskToAttacker * boss.casualtyMultiplier * phaseRiskMod[i];
    const phaseLoss = ok
      ? baseRisk * (0.4 + Math.random() * 0.3)
      : baseRisk * (0.85 + Math.random() * 0.5);
    const remainingFraction = Math.max(0, 1 - cumulativeLossFraction);
    const adjustedLoss = phaseLoss * remainingFraction;
    cumulativeLossFraction = Math.min(0.95, cumulativeLossFraction + adjustedLoss);
    phaseResults.push({ label: phaseLabels[i], ok, lossRate: adjustedLoss });
    // If the killing-blow phase failed AND we've already lost more than half
    // the force, abort the remaining attempts to model a forced retreat.
    if (!ok && cumulativeLossFraction >= 0.6 && i < 2) break;
  }

  const successCount = phaseResults.filter((p) => p.ok).length;
  const success = successCount === 3;
  const partial = successCount === 2;
  const outcome: "full_kill" | "wounded_retreat" | "rout" = success
    ? "full_kill"
    : partial
      ? "wounded_retreat"
      : "rout";
  const totalCasualties = Math.round(totalDeployed * cumulativeLossFraction);

  // Survivors return to state.units; casualties are not refunded.
  const units = ensureUnits(state);
  for (const [k, n] of Object.entries(loadout)) {
    units[k] = (units[k] ?? 0) + (n || 0);
  }
  if (totalCasualties > 0) {
    const result = deductCasualties(units, loadout as Record<string, number>, totalCasualties);
    state.units = result.updated;
  } else {
    state.units = units;
  }

  const phaseLog = phaseResults
    .map((p) => `${p.label}: ${p.ok ? "WIN" : "FAIL"}`)
    .join(" / ");

  // Apply outcome.
  applyFactionReactionToHunt(state, outcome);
  if (outcome === "full_kill" || outcome === "wounded_retreat") {
    const lootScale = outcome === "full_kill" ? 1 : 0.5;
    const r = state.resources;
    const huntCredits = Math.floor((boss.loot.credits ?? 0) * lootScale);
    const medicalLoot = Math.floor((boss.loot.medSupplies ?? 0) * lootScale);
    recordCreditsEarned(state, huntCredits);
    state.resources = {
      ...r,
      credits: r.credits + huntCredits,
      steel: r.steel,
      ammo: r.ammo + Math.floor((boss.loot.ammo ?? 0) * lootScale),
      medSupplies: r.medSupplies,
      water: r.water + Math.floor((boss.loot.water ?? 0) * lootScale),
      food: r.food + Math.floor((boss.loot.food ?? 0) * lootScale),
    };
    applyResourceDelta(
      state,
      "steel",
      Math.floor((boss.loot.steel ?? 0) * lootScale),
    );
    const medicalStorage = applyResourceDelta(
      state,
      "medSupplies",
      medicalLoot,
    );
    const trophiesAwarded = addTrophies(state, boss.uniqueLoot, lootScale);
    applyEcologyDeltaToBiome(
      state,
      project.biome,
      outcome === "full_kill" ? boss.ecologyOnSuccess : Math.floor(boss.ecologyOnSuccess * 0.5),
    );
    if (outcome === "wounded_retreat") {
      // Wounded retreats still cost a little morale — clean kills don't.
      state.cityStats.happiness = Math.max(0, state.cityStats.happiness - 1);
    }
    const trophyLine = summarizeTrophies(trophiesAwarded);
    const headline = outcome === "full_kill" ? `${boss.shortName} DOWN` : `${boss.shortName} WOUNDED`;
    entries.push({
      label: `BIG GAME — ${headline}`,
      delta: -totalCasualties,
      unit: biomeName,
      reason: `${phaseLog}. ${totalCasualties} casualties. ${medicalLoot > 0 ? summarizeMedicalStorageGain(medicalStorage) : ""} Unique trophies: ${trophyLine}.`,
      severity: medicalStorage.rejected > 0 ? "warning" : outcome === "full_kill" ? "positive" : "warning",
    });
    pushMessage(state, {
      id: `hunt-${project.id}`,
      timestamp: state.gameDate,
      tick: state.totalTicks,
      category: "report",
      title: outcome === "full_kill"
        ? `HUNT SUCCESSFUL: ${boss.name} DOWN`
        : `WOUNDED RETREAT: ${boss.name} ESCAPED ALIVE`,
      body:
        `${boss.name} engagement in ${biomeName}.\n\n` +
        `Phases: ${phaseLog}.\nDeployed: ${totalDeployed}. Casualties: ${totalCasualties}.\n\n` +
       `Resource loot${outcome === "wounded_retreat" ? " (50% partial)" : ""}:\n${formatLoot(boss.loot, lootScale, medicalStorage)}\n\n` +
        `Unique trophies: ${trophyLine}.`,
      read: false,
      priority: outcome === "full_kill" ? "normal" : "high",
    });
    project.result = outcome === "full_kill"
      ? `${boss.shortName} DOWN. ${totalCasualties} lost, ${formatLootShort(boss.loot, 1, medicalStorage)} + trophies.`
      : `${boss.shortName} WOUNDED. ${totalCasualties} lost, partial loot${medicalLoot > 0 ? `; ${summarizeMedicalStorageGain(medicalStorage)}` : ""}.`;
  } else {
    applyEcologyDeltaToBiome(state, project.biome, boss.ecologyOnFailure);
    state.cityStats.happiness = Math.max(0, state.cityStats.happiness - 4);
    state.cityStats.unrest = Math.min(100, state.cityStats.unrest + 3);
    entries.push({
      label: `BIG GAME — HUNT ROUTED`,
      delta: -totalCasualties,
      unit: biomeName,
      reason: `${phaseLog}. ${boss.name} drove our force off. ${totalCasualties} casualties.`,
      severity: "negative",
    });
    pushMessage(state, {
      id: `hunt-${project.id}`,
      timestamp: state.gameDate,
      tick: state.totalTicks,
      category: "alert",
      title: `HUNT ROUTED: ${boss.name}`,
      body:
        `${boss.name} broke our line in ${biomeName}.\n\n` +
        `Phases: ${phaseLog}.\nDeployed: ${totalDeployed}. Casualties: ${totalCasualties}.\n\n` +
        `Ecology in ${biomeName} took a heavy hit. Public morale shaken. Underclass faith eroded.`,
      read: false,
      priority: "high",
    });
    project.result = `${boss.shortName} ESCAPED. ${totalCasualties} lost, ecology damaged.`;
  }

  // Wounded or routed bosses don't simply vanish. Track back the trail and
  // schedule a retaliation strike — the megafauna remembers, and it is coming
  // for the city. Routs trigger faster, more aggressive incursions; wounded
  // retreats give a longer warning window. Skip if a retaliation for the same
  // megafauna is already pending; bosses don't double-team the city through
  // back-to-back failed hunts.
  if (outcome === "wounded_retreat" || outcome === "rout") {
    const alreadyPending = (state.wildlandsProjects ?? []).some(
      (p) => p.kind === "megafauna_retaliation" && p.status === "active" && p.meta?.megafaunaId === boss.id,
    );
    if (!alreadyPending) {
      scheduleMegafaunaRetaliation(state, boss.id, project.biome, outcome, totalDeployed);
    }
  }
}

// ─── MEGAFAUNA RETALIATION ──────────────────────────────────────────────────
// A wounded boss circles back. Scheduled by resolveMegafaunaHunt and resolved
// by processWildlandsProjects when its tick counter expires.
function scheduleMegafaunaRetaliation(
  state: GameState,
  megaId: MegafaunaId,
  biome: Biome,
  huntOutcome: "wounded_retreat" | "rout",
  originalDeployed: number,
): void {
  const boss = MEGAFAUNA_BOSSES[megaId];
  if (!boss) return;
  // Routs come back fast and angry; wounded bosses limp back over a longer arc.
  const ticks = huntOutcome === "rout"
    ? 4 + Math.floor(Math.random() * 5) // 4–8 ticks
    : 8 + Math.floor(Math.random() * 7); // 8–14 ticks
  const proj: WildlandsProject = {
    id: `retal-${megaId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: "megafauna_retaliation",
    biome,
    ticksRemaining: ticks,
    totalTicks: ticks,
    status: "active",
    startedAtTick: state.totalTicks ?? 0,
    meta: { megafaunaId: megaId, huntOutcome, originalDeployed },
  };
  state.wildlandsProjects = [proj, ...(state.wildlandsProjects ?? [])];
  pushMessage(state, {
    id: `retal-warn-${proj.id}`,
    timestamp: state.gameDate,
    tick: state.totalTicks,
    category: "alert",
    title: `RETALIATION INCOMING: ${boss.name}`,
    body:
      `Trackers report the ${boss.shortName.toLowerCase()} survived our engagement and is circling back toward our perimeter.\n\n` +
      `Estimated arrival: ${ticks} ticks. ${huntOutcome === "rout" ? "It is hunting us. Speed and aggression escalating." : "Wounded but coming. Use the lead time."}\n\n` +
      `Reinforce the ${biomeShortName(biome)} approaches.`,
    read: false,
    priority: huntOutcome === "rout" ? "critical" : "high",
  });
}

export function resolveMegafaunaRetaliation(
  state: GameState,
  project: WildlandsProject,
  entries: TickEntry[],
): void {
  const megaId = project.meta?.megafaunaId;
  if (!megaId) return;
  const boss = MEGAFAUNA_BOSSES[megaId];
  if (!boss) return;
  const huntOutcome = project.meta?.huntOutcome ?? "wounded_retreat";
  const originalDeployed = Math.max(1, project.meta?.originalDeployed ?? 20);
  const biomeName = biomeShortName(project.biome);
  const isRout = huntOutcome === "rout";

  // Rout retaliations are roughly 1.6× the damage of a wounded-retreat strike.
  // All damage axes (casualties, civics, ecology, stockpiles) follow the same
  // ratio so the architect-stated multiplier holds across categories.
  const severity = isRout ? 1.6 : 1.0;

  // Garrison casualties — defenders thrown into the breach. Scaled to the
  // size of the original force so a small failed hunt produces a small
  // retaliation, while a large rout produces a major incursion.
  const defenseRating = Math.max(1, state.cityStats?.defenseRating ?? 10);
  const baseCasualties = Math.round(originalDeployed * 0.18 * severity);
  const defenseScale = Math.min(1, 40 / defenseRating); // higher defense → fewer losses
  const garrisonCasualties = Math.max(1, Math.round(baseCasualties * defenseScale));

  // Pull losses from the standing army. Distribute evenly across combat
  // units, then second-pass anything still owed onto whatever combat units
  // still have headroom so the reported casualty count matches reality.
  const units = ensureUnits(state);
  const garrisonKeys = Object.keys(units).filter((k) => isCombatUnitKey(k) && (units[k] ?? 0) > 0);
  let remaining = garrisonCasualties;
  if (garrisonKeys.length > 0) {
    for (const k of garrisonKeys) {
      if (remaining <= 0) break;
      const have = units[k] ?? 0;
      const take = Math.min(have, Math.ceil(remaining / Math.max(1, garrisonKeys.length)));
      units[k] = have - take;
      remaining -= take;
    }
    // Second pass: drain any leftover casualty count from whatever combat
    // units still have units in them.
    if (remaining > 0) {
      for (const k of garrisonKeys) {
        if (remaining <= 0) break;
        const have = units[k] ?? 0;
        if (have <= 0) continue;
        const take = Math.min(have, remaining);
        units[k] = have - take;
        remaining -= take;
      }
    }
  }
  state.units = units;
  // Whatever the garrison couldn't absorb spills onto civilians.
  const garrisonAbsorbed = garrisonCasualties - remaining;
  const civilianFromShortfall = remaining;

  // Civic damage. The boss tears through the perimeter regardless.
  // Bases chosen so wounded→rout ratio rounds cleanly to ~1.6×:
  // happiness 5→8, unrest 5→8, ecology 5→8.
  const happinessHit = Math.round(5 * severity);
  const unrestHit = Math.round(5 * severity);
  const ecologyHit = -Math.round(5 * severity);
  state.cityStats.happiness = Math.max(0, state.cityStats.happiness - happinessHit);
  state.cityStats.unrest = Math.min(100, state.cityStats.unrest + unrestHit);
  const civilianLoss = Math.round(garrisonCasualties * 0.5) + civilianFromShortfall;
  state.cityStats.population = Math.max(0, state.cityStats.population - civilianLoss);
  applyEcologyDeltaToBiome(state, project.biome, ecologyHit);

  // Resource scour — boss raids stockpiles on its way through. Severity is the
  // sole multiplier so rout = 1.6× wound, matching the casualty/civics ratio.
  const r = state.resources;
  const foodLoss = Math.round(50 * severity);
  const waterLoss = Math.round(30 * severity);
  const steelLoss = Math.round(20 * severity);
  state.resources = {
    ...r,
    food: Math.max(0, r.food - foodLoss),
    water: Math.max(0, r.water - waterLoss),
    steel: Math.max(0, r.steel - steelLoss),
  };

  // Cult factions emboldened — the boss came back, the omen is real.
  if (Array.isArray(state.factions)) {
    for (const f of state.factions) {
      if (!f || typeof f !== "object") continue;
      if (f.type === "cult") f.threat = Math.min(100, (f.threat ?? 0) + (isRout ? 5 : 3));
      else if (f.type === "underclass") f.loyalty = Math.max(0, (f.loyalty ?? 0) - (isRout ? 3 : 2));
    }
  }

  entries.push({
    label: `RETALIATION — ${boss.shortName}`,
    delta: -garrisonAbsorbed,
    unit: biomeName,
    reason: `${boss.name} struck back. ${garrisonAbsorbed} garrison casualties. Stockpiles raided.`,
    severity: "negative",
  });
  pushMessage(state, {
    id: `retal-${project.id}`,
    timestamp: state.gameDate,
    tick: state.totalTicks,
    category: "alert",
    title: isRout
      ? `RETALIATION STRIKE: ${boss.name} BREACHED THE LINE`
      : `RETALIATION STRIKE: ${boss.name} HIT THE PERIMETER`,
    body:
      `${boss.name} returned through ${biomeName} and broke against our defenses.\n\n` +
      `Garrison casualties: ${garrisonAbsorbed}.\n` +
      `Civilian losses: ${civilianLoss}.\n` +
      `Stockpile raid: -${foodLoss} food, -${waterLoss} water, -${steelLoss} steel.\n\n` +
      (isRout
        ? `It came in fast. Cult chatter spikes — they read the omen. Underclass faith bleeds.`
        : `Bloodied but determined. We held the inner ring. Cult agitators stir; the underclass is shaken.`),
    read: false,
    priority: isRout ? "critical" : "high",
  });
  project.result = isRout
    ? `${boss.shortName} BREACHED. ${garrisonAbsorbed} garrison lost.`
    : `${boss.shortName} STRUCK. ${garrisonAbsorbed} garrison lost, line held.`;
}

function formatLoot(
  loot: MegafaunaBoss["loot"],
  scale = 1,
  medicalStorage?: ResourceDeltaResult,
): string {
  const parts: string[] = [];
  const c = Math.floor((loot.credits ?? 0) * scale);
  const s = Math.floor((loot.steel ?? 0) * scale);
  const a = Math.floor((loot.ammo ?? 0) * scale);
  const m = Math.floor((loot.medSupplies ?? 0) * scale);
  const w = Math.floor((loot.water ?? 0) * scale);
  if (c) parts.push(`+${c.toLocaleString()} credits (rendered tissue)`);
  if (s) parts.push(`+${s} steel (bone & plate)`);
  if (a) parts.push(`+${a} ammo (recovered ordnance)`);
  if (m) parts.push(medicalStorage ? `${summarizeMedicalStorageGain(medicalStorage)} (gland extracts)` : `+${m} med supplies (gland extracts)`);
  if (w) parts.push(`+${w} water (cleaned drainage)`);
  return parts.join("\n");
}

function formatLootShort(
  loot: MegafaunaBoss["loot"],
  scale = 1,
  medicalStorage?: ResourceDeltaResult,
): string {
  const parts: string[] = [];
  const c = Math.floor((loot.credits ?? 0) * scale);
  const s = Math.floor((loot.steel ?? 0) * scale);
  const a = Math.floor((loot.ammo ?? 0) * scale);
  const m = Math.floor((loot.medSupplies ?? 0) * scale);
  if (c) parts.push(`${(c / 1000).toFixed(0)}k credits`);
  if (s) parts.push(`${s} steel`);
  if (a) parts.push(`${a} ammo`);
  if (m) parts.push(medicalStorage ? `${medicalStorage.applied} meds stored${medicalStorage.rejected > 0 ? `, ${medicalStorage.rejected} rejected` : ""}` : `${m} meds`);
  return parts.join(" + ");
}

// ─── BEAST CAPTURE / TAMING ─────────────────────────────────────────────────
export function getCapturableForBiome(biome: Biome): CapturableBeast[] {
  return CAPTURABLE_BEASTS.filter((b) => b.biomes.includes(biome));
}

export function canStartBeastCapture(
  state: GameState,
  biome: Biome,
  beastUnitKey: string
): { ok: boolean; reason?: string } {
  const beast = CAPTURABLE_BEASTS.find((b) => b.unitKey === beastUnitKey);
  if (!beast) return { ok: false, reason: "Unknown species." };
  if (!beast.biomes.includes(biome)) return { ok: false, reason: `${beast.label} not native to this biome.` };
  const r = state.resources;
  if (r.credits < CAPTURE_BASE_COST.credits) return { ok: false, reason: `Need ${CAPTURE_BASE_COST.credits.toLocaleString()} credits.` };
  if (r.fuel < CAPTURE_BASE_COST.fuel) return { ok: false, reason: `Need ${CAPTURE_BASE_COST.fuel} fuel.` };
  if (r.medSupplies < CAPTURE_BASE_COST.medSupplies) return { ok: false, reason: `Need ${CAPTURE_BASE_COST.medSupplies} med supplies.` };
  const wranglers = state.units?.beastWranglers ?? 0;
  if (wranglers < WRANGLERS_PER_CAPTURE) return { ok: false, reason: `Need ${WRANGLERS_PER_CAPTURE} beast wranglers.` };
  return { ok: true };
}

export function startBeastCapture(
  state: GameState,
  biome: Biome,
  beastUnitKey: string
): GameState {
  const check = canStartBeastCapture(state, biome, beastUnitKey);
  if (!check.ok) return state;
  const beast = CAPTURABLE_BEASTS.find((b) => b.unitKey === beastUnitKey)!;

  const units = { ...(state.units ?? {}) };
  units.beastWranglers = Math.max(0, (units.beastWranglers ?? 0) - WRANGLERS_PER_CAPTURE);

  const r = state.resources;
  const proj: WildlandsProject = {
    id: `cap-${beast.unitKey}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: "beast_capture",
    biome,
    ticksRemaining: CAPTURE_DURATION_TICKS,
    totalTicks: CAPTURE_DURATION_TICKS,
    status: "active",
    startedAtTick: state.totalTicks ?? 0,
    meta: { wranglerCount: WRANGLERS_PER_CAPTURE, targetSpecies: beast.unitKey },
  };

  return {
    ...state,
    resources: {
      ...r,
      credits: Math.max(0, r.credits - CAPTURE_BASE_COST.credits),
      fuel: Math.max(0, r.fuel - CAPTURE_BASE_COST.fuel),
      medSupplies: Math.max(0, r.medSupplies - CAPTURE_BASE_COST.medSupplies),
    },
    units,
    wildlandsProjects: [proj, ...(state.wildlandsProjects ?? [])],
  };
}

export function resolveBeastCapture(
  state: GameState,
  project: WildlandsProject,
  entries: TickEntry[]
): void {
  const speciesKey = project.meta?.targetSpecies;
  if (!speciesKey) return;
  const beast = CAPTURABLE_BEASTS.find((b) => b.unitKey === speciesKey);
  if (!beast) return;
  const wranglerCount = project.meta?.wranglerCount ?? WRANGLERS_PER_CAPTURE;
  const biomeName = biomeShortName(project.biome);

  const successChance = 0.72;
  const success = Math.random() < successChance;

  // Wranglers always come back, minus losses.
  const lossRate = success ? 0.10 + Math.random() * 0.10 : 0.30 + Math.random() * 0.30;
  const lost = Math.min(wranglerCount, Math.round(wranglerCount * lossRate));
  const returned = Math.max(0, wranglerCount - lost);
  const units = ensureUnits(state);
  units.beastWranglers = (units.beastWranglers ?? 0) + returned;

  if (success) {
    const span = beast.capturePerAttempt.max - beast.capturePerAttempt.min;
    const captured = beast.capturePerAttempt.min + Math.floor(Math.random() * (span + 1));
    const tame: TamingEntry = {
      id: `tame-${beast.unitKey}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      beastUnitKey: beast.unitKey,
      beastLabel: beast.label,
      count: captured,
      ticksRemaining: beast.tameTicks,
      totalTicks: beast.tameTicks,
      capturedAtTick: state.totalTicks ?? 0,
      biome: project.biome,
    };
    state.tamingQueue = [tame, ...(state.tamingQueue ?? [])].slice(0, 30);
    applyEcologyDeltaToBiome(state, project.biome, -2);
    entries.push({
      label: `CAPTURE — ${beast.label}`,
      delta: captured,
      unit: biomeName,
      reason: `${captured} live ${beast.label.toLowerCase()} captured. ${lost} wranglers lost.`,
      severity: "positive",
    });
    pushMessage(state, {
      id: `capture-${project.id}`,
      timestamp: state.gameDate,
      tick: state.totalTicks,
      category: "report",
      title: `CAPTURE SUCCESSFUL: ${beast.label}`,
      body: `${captured} ${beast.label.toLowerCase()} captured live in ${biomeName}.\n\nWranglers deployed: ${wranglerCount}. Lost: ${lost}.\n\nTaming will take approximately ${beast.tameTicks} ticks before they deploy as combat units.`,
      read: false,
      priority: "normal",
    });
    project.result = `${captured} ${beast.label} captured. Taming in progress.`;
  } else {
    applyEcologyDeltaToBiome(state, project.biome, -3);
    entries.push({
      label: `CAPTURE FAILED — ${beast.label}`,
      delta: -lost,
      unit: biomeName,
      reason: `Capture attempt collapsed. ${lost} wranglers lost.`,
      severity: "negative",
    });
    pushMessage(state, {
      id: `capture-${project.id}`,
      timestamp: state.gameDate,
      tick: state.totalTicks,
      category: "alert",
      title: `CAPTURE FAILED: ${beast.label}`,
      body: `Capture in ${biomeName} fell apart.\n\nWranglers deployed: ${wranglerCount}. Lost: ${lost}.\n\nTarget escaped. Local fauna spooked.`,
      read: false,
      priority: "high",
    });
    project.result = `Capture failed. ${lost} wranglers lost.`;
  }
}

// Per-tame failure rate. A small percentage of tamings break catastrophically
// at completion: the captured beasts go feral, savage their handlers, and
// damage the local ecology when they escape back into the wild.
const TAMING_FAILURE_CHANCE = 0.15;

export function processTamingQueue(state: GameState, entries: TickEntry[]): void {
  const queue = state.tamingQueue;
  if (!queue || queue.length === 0) return;
  const next: TamingEntry[] = [];
  for (const t of queue) {
    const remaining = t.ticksRemaining - 1;
    if (remaining > 0) {
      next.push({ ...t, ticksRemaining: remaining });
      continue;
    }
    // Tame complete — roll for catastrophic failure first.
    const units = ensureUnits(state);
    const failed = Math.random() < TAMING_FAILURE_CHANCE;
    if (failed) {
      const wranglersLost = Math.min(units.beastWranglers ?? 0, Math.max(1, Math.round(t.count * 1.2)));
      units.beastWranglers = Math.max(0, (units.beastWranglers ?? 0) - wranglersLost);
      state.units = units;
      // Released beasts hammer the source biome's ecology.
      const biome = (t.biome as Biome) || "toxic_marsh";
      applyEcologyDeltaToBiome(state, biome, -3);
      // Underclass faction loses faith when handlers die in the corral.
      if (Array.isArray(state.factions)) {
        for (const f of state.factions) {
          if (f && f.type === "underclass") f.loyalty = Math.max(0, (f.loyalty ?? 0) - 1);
        }
      }
      entries.push({
        label: `TAMING FAILED — ${t.beastLabel}`,
        delta: -wranglersLost,
        unit: "wranglers",
        reason: `${t.count} ${t.beastLabel.toLowerCase()} went feral. ${wranglersLost} handlers lost.`,
        severity: "negative",
      });
      pushMessage(state, {
        id: `tame-${t.id}`,
        timestamp: state.gameDate,
        tick: state.totalTicks,
        category: "alert",
        title: `TAMING FAILED: ${t.beastLabel}`,
        body:
          `Taming attempt collapsed at the corral.\n\n` +
          `${t.count} ${t.beastLabel.toLowerCase()} broke their restraints and savaged the handlers ` +
          `before escaping back into ${biomeShortName(biome)}.\n\n` +
          `${wranglersLost} beast wranglers killed. Local ecology took a hit. ` +
          `Underclass faith in our handlers slipped.`,
        read: false,
        priority: "high",
      });
      continue;
    }
    // Successful tame — add beasts to units.
    units[t.beastUnitKey] = (units[t.beastUnitKey] ?? 0) + t.count;
    state.units = units;
    entries.push({
      label: `TAMING COMPLETE — ${t.beastLabel}`,
      delta: t.count,
      unit: "units",
      reason: `${t.count} ${t.beastLabel.toLowerCase()} ready for deployment.`,
      severity: "positive",
    });
    pushMessage(state, {
      id: `tame-${t.id}`,
      timestamp: state.gameDate,
      tick: state.totalTicks,
      category: "report",
      title: `TAMING COMPLETE: ${t.beastLabel}`,
      body: `${t.count} ${t.beastLabel.toLowerCase()} are now combat-ready and added to your roster.`,
      read: false,
      priority: "normal",
    });
  }
  state.tamingQueue = next;
}

export const HUNT_CAPTURE_CONSTANTS = {
  WRANGLERS_PER_CAPTURE,
  CAPTURE_BASE_COST,
  CAPTURE_DURATION_TICKS,
};
