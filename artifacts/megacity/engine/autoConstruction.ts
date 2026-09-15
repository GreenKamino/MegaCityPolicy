import type { GameState, ContractInstance, TickEntry } from "@/engine/types";
import { CONTRACT_TEMPLATES } from "@/engine/contracts";

export type AutoConstructionConfig = {
  enabled: boolean;
  budgetPerTick: number;
  priorities: AutoConstructionPriority[];
  lastBuildTick: number;
};

export type AutoConstructionPriority = "power" | "water" | "housing" | "food" | "security" | "health" | "infrastructure";

export const AUTO_PRIORITY_LABELS: Record<AutoConstructionPriority, string> = {
  power: "Power Grid",
  water: "Water Supply",
  housing: "Housing",
  food: "Food Production",
  security: "Security",
  health: "Healthcare",
  infrastructure: "Infrastructure",
};

export const DEFAULT_AUTO_CONSTRUCTION: AutoConstructionConfig = {
  enabled: false,
  budgetPerTick: 50000,
  priorities: ["power", "water", "housing", "food"],
  lastBuildTick: 0,
};

type NeedScore = {
  priority: AutoConstructionPriority;
  score: number;
  contractId: string;
};

const PRIORITY_CONTRACTS: Record<AutoConstructionPriority, string[]> = {
  power: ["ct-power-substation", "ct-backup-battery", "ct-grid-maintenance"],
  water: ["ct-water-main-reinforce", "ct-recycler-upgrade", "ct-sewer-repair"],
  housing: ["ct-micro-housing-200", "ct-hab-block-expansion", "ct-modular-housing"],
  food: ["ct-food-ration-contract", "ct-ration-hub"],
  security: ["ct-sector-house-annex", "ct-surveillance-grid"],
  health: ["ct-clinic-buildout", "ct-med-supply", "ct-sanitation-campaign"],
  infrastructure: ["ct-maintenance-sweep", "ct-waste-incinerator", "ct-recycling-facility"],
};

const BUILD_INTERVAL = 8;

function assessNeed(s: GameState, priority: AutoConstructionPriority): number {
  switch (priority) {
    case "power": {
      const deficit = s.rates.powerGeneration - s.rates.powerDrain;
      if (deficit < 0) return 100;
      if (deficit < 200) return 60;
      if (deficit < 500) return 30;
      return 0;
    }
    case "water": {
      if (s.resources.water < 500) return 100;
      if (s.resources.water < 1500) return 60;
      if (s.resources.water < 3000) return 30;
      return 0;
    }
    case "housing": {
      const pressure = s.cityStats.housingPressure ?? 0;
      if (pressure > 20) return 100;
      if (pressure > 10) return 60;
      if (pressure > 5) return 30;
      const popPerHab = s.cityStats.population / Math.max(1, s.buildings.habBlockMegaTowers ?? 1);
      if (popPerHab > 10000) return 50;
      return 0;
    }
    case "food": {
      if (s.resources.food < 500) return 100;
      if (s.resources.food < 2000) return 60;
      if (s.resources.food < 4000) return 30;
      return 0;
    }
    case "security": {
      if (s.cityStats.crime > 60) return 100;
      if (s.cityStats.crime > 40) return 60;
      if (s.cityStats.lawOrder < 40) return 50;
      return 0;
    }
    case "health": {
      const health = s.cityStats.publicHealth ?? 50;
      if (health < 30) return 100;
      if (health < 50) return 60;
      return 0;
    }
    case "infrastructure": {
      if (s.cityStats.infrastructureHealth < 30) return 100;
      if (s.cityStats.infrastructureHealth < 50) return 60;
      if (s.cityStats.infrastructureHealth < 70) return 30;
      return 0;
    }
    default:
      return 0;
  }
}

function findBestContract(
  s: GameState,
  priority: AutoConstructionPriority,
  budget: number,
): string | null {
  const candidates = PRIORITY_CONTRACTS[priority] ?? [];
  const activeDefIds = new Set((s.activeContracts ?? []).map((c) => c.defId));

  for (const cId of candidates) {
    if (activeDefIds.has(cId)) continue;
    const def = CONTRACT_TEMPLATES.find((t) => t.id === cId);
    if (!def) continue;
    if (def.upfrontCost > budget) continue;
    if (def.upfrontCost > s.resources.credits) continue;

    let matOk = true;
    if (def.requiredMaterials) {
      for (const [mat, amount] of Object.entries(def.requiredMaterials)) {
        if (amount && (s.resources[mat as keyof typeof s.resources] as number) < amount) {
          matOk = false;
          break;
        }
      }
    }
    if (!matOk) continue;
    return cId;
  }
  return null;
}

export function processAutoConstruction(s: GameState, entries: TickEntry[]): void {
  const config = s.autoConstruction ?? DEFAULT_AUTO_CONSTRUCTION;
  if (!config.enabled) return;

  if (s.totalTicks - config.lastBuildTick < BUILD_INTERVAL) return;

  const maxContracts = s.contractCapacity ?? 5;
  if ((s.activeContracts ?? []).length >= maxContracts) return;

  const needs: NeedScore[] = [];
  for (const priority of config.priorities) {
    const score = assessNeed(s, priority);
    if (score > 0) {
      const contractId = findBestContract(s, priority, config.budgetPerTick);
      if (contractId) {
        needs.push({ priority, score, contractId });
      }
    }
  }

  if (needs.length === 0) return;

  needs.sort((a, b) => b.score - a.score);

  const best = needs[0];
  const def = CONTRACT_TEMPLATES.find((t) => t.id === best.contractId);
  if (!def) return;

  const newResources = { ...s.resources, credits: s.resources.credits - def.upfrontCost };
  if (def.requiredMaterials) {
    for (const [mat, amount] of Object.entries(def.requiredMaterials)) {
      if (amount && mat in newResources) {
        const key = mat as keyof typeof newResources;
        newResources[key] = Math.max(0, (newResources[key] ?? 0) - amount);
      }
    }
  }

  const instance: ContractInstance = {
    id: `auto-${def.id}-${Date.now()}`,
    defId: def.id,
    contractorId: def.contractorId,
    districtId: s.districts[0]?.id ?? "district-001",
    status: "active",
    progress: 0,
    startTick: s.totalTicks,
    ticksElapsed: 0,
    totalPaid: def.upfrontCost,
    procurementMethod: "directAward",
    delaysOccurred: 0,
    overrunCost: 0,
    events: [`Tick ${s.totalTicks}: Auto-construction — ${def.name}`],
  };

  s.resources = newResources;
  s.activeContracts = [...(s.activeContracts ?? []), instance];

  const updatedConfig = { ...config, lastBuildTick: s.totalTicks };
  s.autoConstruction = updatedConfig;

  const gameDate = s.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 };
  s.messages = [
    ...(s.messages ?? []),
    {
      id: `auto-build-${Date.now()}`,
      title: "AUTO-CONSTRUCTION: CONTRACT AWARDED",
      body: `Your administrator has automatically awarded a contract for "${def.name}" to address ${AUTO_PRIORITY_LABELS[best.priority].toLowerCase()} needs. Cost: ${def.upfrontCost.toLocaleString()} credits. Priority score: ${best.score}/100.`,
      timestamp: gameDate,
      tick: s.totalTicks,
      read: false,
      category: "update" as const,
      priority: "normal" as const,
    },
  ];

  entries.push({
    label: "Auto-Construction",
    delta: -def.upfrontCost,
    unit: "credits",
    reason: `Auto-awarded: ${def.name} (${best.priority})`,
    severity: "neutral",
  });
}
