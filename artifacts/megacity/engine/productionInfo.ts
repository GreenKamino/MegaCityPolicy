// ─────────────────────────────────────────────────────────────────────────────
// productionInfo — read-only, UI-facing view of "what makes what".
//
// This module is a pure DATA facade over the two LIVE production systems so the
// UI (construction screen, military installations, production-chain view) can
// show accurate Required Inputs / Outputs and trace resource chains. It NEVER
// mutates GameState and contains NO tick logic.
//
//   System C (supply chain)  — civilian buildings, keyed by camelCase
//     buildingKey === state.buildings key. Consume/produce COMMODITY items in
//     s.stockpiles. Source: SUPPLY_CHAIN_RECIPES.  economy: "stockpile"
//   System A (military logistics) — military installations, keyed by snake_case
//     MILITARY_BUILDINGS id. Produce s.resources ammo/fuel/food(rations)/steel
//     and s.stockpiles.vehicleParts, GATED BY GARRISON MANNING (personnel).
//     Source: PRODUCTION_BY_BUILDING.  economy: "military"
//
// The old militaryOverhaul PRODUCTION_CHAINS ("phantom") is deliberately NOT a
// source here — it has no processor and produces nothing at runtime.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SUPPLY_CHAIN_RECIPES,
  getWorkerOutputMultiplier,
} from "@/engine/supplyChain";
import { PRODUCTION_BY_BUILDING } from "@/engine/militaryLogistics";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { ALL_COMMODITIES } from "@/engine/commodities";
import { humanizeId } from "@/engine/displayNames";

export type ProductionEconomy = "stockpile" | "military";

export type IOEntry = { id: string; name: string; qty: number };

/** A single civilian recipe a building runs (a building may run several). */
export type CivilianRecipeInfo = {
  id: string;
  name: string;
  inputs: IOEntry[];
  outputs: IOEntry[];
  ticksPerCycle: number;
  workersKey?: string;
  workersName?: string;
};

/** A military installation's supply output (System A). */
export type InstallationProduction = {
  id: string;
  name: string;
  personnel: number; // manning required to fully staff ONE of these
  outputs: IOEntry[]; // output per tick at FULL garrison manning
  gatedByManning: true;
};

/** A building that produces a given resource (upstream of that resource). */
export type ProducerRef = {
  economy: ProductionEconomy;
  buildingKey: string;
  buildingName: string;
  recipeName?: string;
  qty: number;
  ticksPerCycle: number; // 1 for military
  personnel?: number; // manning req, military only
  workersKey?: string; // civilian worker pool that scales output
  workersName?: string;
  inputs: IOEntry[]; // what this producer consumes to make it (stockpile only)
};

export type ProducerStaffing = {
  workerCount: number;
  multiplier: number;
  outputQty: number; // approximate output for this resource per cycle
  buildingCount: number;
  totalOutputQty: number; // approximate output across all constructed buildings per cycle
  workersName: string;
};

/**
 * Resolve a building count from live state.
 *
 * Missing keys are normal in older saves and mean that the city owns none of
 * that building. Keep the definition-preview case explicit below rather than
 * letting a shared live-state read silently invent one building.
 */
export function getLiveBuildingCount(
  buildings: Record<string, number> | undefined,
  buildingKey: string,
): number {
  const count = buildings?.[buildingKey];
  return typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
}

/** Read the live worker assignment for a civilian producer, if it has one. */
export function getProducerStaffing(
  producer: Pick<ProducerRef, "buildingKey" | "qty" | "workersKey" | "workersName">,
  units: Record<string, number> | undefined,
  buildings?: Record<string, number>,
): ProducerStaffing | undefined {
  if (!producer.workersKey || !producer.workersName) return undefined;
  const workerCount = units?.[producer.workersKey] ?? 0;
  const multiplier = getWorkerOutputMultiplier(workerCount);
  const outputQty = Math.round(producer.qty * multiplier * 100) / 100;
  // Keep the existing per-building value intact while also exposing the
  // combined throughput from every constructed copy of this building.
  const buildingCount = getLiveBuildingCount(buildings, producer.buildingKey);
  const totalOutputQty = Math.round(outputQty * buildingCount * 100) / 100;
  return {
    workerCount,
    multiplier,
    outputQty,
    buildingCount,
    totalOutputQty,
    workersName: producer.workersName,
  };
}

/** Explicit one-building estimate for definition-only previews. */
export function getDefinitionPreviewStaffing(
  producer: Pick<ProducerRef, "buildingKey" | "qty" | "workersKey" | "workersName">,
  units: Record<string, number> | undefined,
): ProducerStaffing | undefined {
  return getProducerStaffing(producer, units, { [producer.buildingKey]: 1 });
}

/** A building that consumes a given resource (downstream use of that resource). */
export type ConsumerRef = {
  economy: ProductionEconomy;
  buildingKey: string;
  buildingName: string;
  recipeName?: string;
  qty: number;
  ticksPerCycle: number;
  outputs: IOEntry[]; // what consuming it yields
};

export type ConsumerDemand = {
  buildingCount: number;
  demandQty: number; // demand across all constructed copies per cycle
};

/** Read the civilian stockpile demand for a consumer recipe. */
export function getConsumerDemand(
  consumer: Pick<ConsumerRef, "buildingKey" | "qty">,
  buildings: Record<string, number> | undefined,
): ConsumerDemand {
  const buildingCount = getLiveBuildingCount(buildings, consumer.buildingKey);
  return {
    buildingCount,
    demandQty: Math.round(consumer.qty * buildingCount * 100) / 100,
  };
}

// ── Display names ────────────────────────────────────────────────────────────

// Top-level (non-commodity) resources referenced by military production and the
// wider economy. Kept explicit so ids like "ammo" read as army ammunition, not
// the "ammunition_crate" trade commodity.
const RESOURCE_LABELS: Record<string, string> = {
  ammo: "Ammunition (Army)",
  fuel: "Fuel",
  // Military installations deposit rations into resources.food; keep the
  // military-facing term while making the shared pool explicit in every UI
  // surface that uses this facade.
  rations: "Rations (Food pool)",
  steel: "Steel",
  vehicleParts: "Vehicle Parts",
  power: "Power",
  credits: "Credits",
  food: "Food",
  water: "Water",
};

let _nameMap: Map<string, string> | null = null;
function nameMap(): Map<string, string> {
  if (!_nameMap) {
    _nameMap = new Map();
    for (const c of ALL_COMMODITIES) _nameMap.set(c.id, c.name);
  }
  return _nameMap;
}

/** Human-readable label for a commodity/resource id. */
export function resourceDisplayName(id: string): string {
  return RESOURCE_LABELS[id] ?? nameMap().get(id) ?? humanizeId(id);
}

/** Title-case a camelCase / snake_case / kebab-case building key. */
export function humanizeBuildingKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toEntries(rec: Record<string, number>): IOEntry[] {
  return Object.entries(rec).map(([id, qty]) => ({
    id,
    name: resourceDisplayName(id),
    qty,
  }));
}

// ── Civilian (System C) index ────────────────────────────────────────────────

let _byBuilding: Map<string, CivilianRecipeInfo[]> | null = null;
function byBuilding(): Map<string, CivilianRecipeInfo[]> {
  if (_byBuilding) return _byBuilding;
  _byBuilding = new Map();
  for (const r of SUPPLY_CHAIN_RECIPES) {
    const info: CivilianRecipeInfo = {
      id: r.id,
      name: r.name,
      inputs: toEntries(r.inputs),
      outputs: toEntries(r.outputs),
      ticksPerCycle: r.ticksPerCycle,
      workersKey: r.workersKey,
      workersName: r.workersKey ? humanizeBuildingKey(r.workersKey) : undefined,
    };
    const arr = _byBuilding.get(r.buildingKey);
    if (arr) arr.push(info);
    else _byBuilding.set(r.buildingKey, [info]);
  }
  return _byBuilding;
}

/** All civilian recipes a construction building runs. Empty if it makes nothing. */
export function getBuildingRecipes(buildingKey: string): CivilianRecipeInfo[] {
  return byBuilding().get(buildingKey) ?? [];
}

/** True if the construction building has any supply-chain production. */
export function hasProduction(buildingKey: string): boolean {
  return byBuilding().has(buildingKey);
}

// ── Military (System A) index ─────────────────────────────────────────────────

let _milMap: Map<string, InstallationProduction> | null = null;
function milMap(): Map<string, InstallationProduction> {
  if (_milMap) return _milMap;
  _milMap = new Map();
  const defById = new Map(MILITARY_BUILDINGS.map((b) => [b.id, b]));
  for (const [id, out] of Object.entries(PRODUCTION_BY_BUILDING)) {
    const def = defById.get(id);
    _milMap.set(id, {
      id,
      name: def?.name ?? humanizeBuildingKey(id),
      personnel: def?.personnel ?? 0,
      outputs: toEntries(out as Record<string, number>),
      gatedByManning: true,
    });
  }
  return _milMap;
}

/** Supply production for a military installation, or undefined if it makes none. */
export function getInstallationProduction(
  id: string,
): InstallationProduction | undefined {
  return milMap().get(id);
}

/** All military installations that produce supply (System A). */
export function listInstallationProduction(): InstallationProduction[] {
  return Array.from(milMap().values());
}

// ── Resource chain graph (producers / consumers) ─────────────────────────────

let _producers: Map<string, ProducerRef[]> | null = null;
let _consumers: Map<string, ConsumerRef[]> | null = null;

function buildGraph(): void {
  if (_producers && _consumers) return;
  _producers = new Map();
  _consumers = new Map();

  const addProducer = (resId: string, ref: ProducerRef) => {
    const arr = _producers!.get(resId);
    if (arr) arr.push(ref);
    else _producers!.set(resId, [ref]);
  };
  const addConsumer = (resId: string, ref: ConsumerRef) => {
    const arr = _consumers!.get(resId);
    if (arr) arr.push(ref);
    else _consumers!.set(resId, [ref]);
  };

  // System C — civilian recipes.
  for (const r of SUPPLY_CHAIN_RECIPES) {
    const buildingName = humanizeBuildingKey(r.buildingKey);
    const inputs = toEntries(r.inputs);
    const outputs = toEntries(r.outputs);
    for (const [outId, qty] of Object.entries(r.outputs)) {
      addProducer(outId, {
        economy: "stockpile",
        buildingKey: r.buildingKey,
        buildingName,
        recipeName: r.name,
        qty,
        ticksPerCycle: r.ticksPerCycle,
        workersKey: r.workersKey,
        workersName: r.workersKey ? humanizeBuildingKey(r.workersKey) : undefined,
        inputs,
      });
    }
    for (const [inId, qty] of Object.entries(r.inputs)) {
      addConsumer(inId, {
        economy: "stockpile",
        buildingKey: r.buildingKey,
        buildingName,
        recipeName: r.name,
        qty,
        ticksPerCycle: r.ticksPerCycle,
        outputs,
      });
    }
  }

  // System A — military installations (outputs only, gated by manning).
  const defById = new Map(MILITARY_BUILDINGS.map((b) => [b.id, b]));
  for (const [id, out] of Object.entries(PRODUCTION_BY_BUILDING)) {
    const def = defById.get(id);
    for (const [outId, qty] of Object.entries(out as Record<string, number>)) {
      addProducer(outId, {
        economy: "military",
        buildingKey: id,
        buildingName: def?.name ?? humanizeBuildingKey(id),
        qty: qty as number,
        ticksPerCycle: 1,
        personnel: def?.personnel ?? 0,
        inputs: [],
      });
    }
  }
}

/** Buildings that PRODUCE this resource (its upstream sources). */
export function getProducers(resourceId: string): ProducerRef[] {
  buildGraph();
  return _producers!.get(resourceId) ?? [];
}

/** Buildings that CONSUME this resource (its downstream uses). */
export function getConsumers(resourceId: string): ConsumerRef[] {
  buildGraph();
  return _consumers!.get(resourceId) ?? [];
}

/** Every resource that appears as an input or output, sorted by display name. */
export function listChainResources(): { id: string; name: string }[] {
  buildGraph();
  const ids = new Set<string>([..._producers!.keys(), ..._consumers!.keys()]);
  return Array.from(ids)
    .map((id) => ({ id, name: resourceDisplayName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
