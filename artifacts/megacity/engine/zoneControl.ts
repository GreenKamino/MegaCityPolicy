import type { GameState } from "./types";
import { WORLD_LOCATIONS, type WorldLocation } from "./worldMap";
import { createDefaultResourceNodeState } from "./resourceNodes";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { applyResourceDelta, summarizeMedicalStorageGain } from "@/engine/resourceStorage";

export type ZoneBonus = {
  id: string;
  locationName: string;
  type: "credits" | "food" | "fuel" | "steel" | "ammo" | "medSupplies" | "happiness" | "publicHealth" | "lawOrder" | "defense";
  amount: number;
  reason: string;
};

const TERRAIN_BONUSES: Record<string, { type: ZoneBonus["type"]; amount: number; reason: string }> = {
  urban: { type: "credits", amount: 200, reason: "Urban trade network" },
  coastal: { type: "food", amount: 15, reason: "Coastal fishing access" },
  riverine: { type: "food", amount: 10, reason: "River irrigation" },
  forest: { type: "fuel", amount: 8, reason: "Lumber operations" },
  mountain: { type: "steel", amount: 5, reason: "Mountain ore deposits" },
  plains: { type: "food", amount: 12, reason: "Agricultural flatlands" },
  desert: { type: "fuel", amount: 6, reason: "Desert oil seeps" },
  volcanic: { type: "steel", amount: 8, reason: "Volcanic mineral deposits" },
  canyon: { type: "defense", amount: 5, reason: "Canyon fortifications" },
  swamp: { type: "medSupplies", amount: 3, reason: "Medicinal flora harvesting" },
  subterranean: { type: "ammo", amount: 4, reason: "Underground munitions cache" },
  elevated: { type: "defense", amount: 3, reason: "High ground advantage" },
};

const TYPE_BONUSES: Record<string, { type: ZoneBonus["type"]; amount: number; reason: string }> = {
  township: { type: "happiness", amount: 1, reason: "Allied township cooperation" },
  megacity: { type: "credits", amount: 500, reason: "Megacity trade partnership" },
  nation: { type: "defense", amount: 3, reason: "National alliance" },
};

export function calculateZoneBonuses(state: GameState): ZoneBonus[] {
  const bonuses: ZoneBonus[] = [];
  const rels = state.locationRelations ?? {};
  const discoveredIds = state.discoveredLocationIds ?? [];
  const rnState = state.resourceNodes ?? createDefaultResourceNodeState();

  for (const loc of WORLD_LOCATIONS) {
    if (loc.type === "player_city") continue;
    if (!loc.discovered && !discoveredIds.includes(loc.id)) continue;

    const rel = rels[loc.id] ?? null;
    const isAllied = rel ? rel.disposition > 50 : false;
    const isExploiting = loc.resourceNodeId && !!rnState.exploiting[loc.resourceNodeId];

    if (!isAllied && !isExploiting) continue;

    if (isAllied && loc.terrain && TERRAIN_BONUSES[loc.terrain]) {
      const tb = TERRAIN_BONUSES[loc.terrain];
      bonuses.push({
        id: `zone-terrain-${loc.id}`,
        locationName: loc.name,
        type: tb.type,
        amount: tb.amount,
        reason: tb.reason,
      });
    }

    if (isAllied && TYPE_BONUSES[loc.type]) {
      const typB = TYPE_BONUSES[loc.type];
      bonuses.push({
        id: `zone-type-${loc.id}`,
        locationName: loc.name,
        type: typB.type,
        amount: typB.amount,
        reason: typB.reason,
      });
    }

    if (isExploiting && isAllied) {
      bonuses.push({
        id: `zone-extract-${loc.id}`,
        locationName: loc.name,
        type: "credits",
        amount: 100,
        reason: "Allied extraction efficiency bonus",
      });
    }
  }

  return bonuses;
}

export function applyZoneBonuses(s: GameState, entries: { label: string; delta: number; unit: string; reason: string; severity: "positive" | "negative" | "neutral" | "warning" }[]): void {
  const bonuses = calculateZoneBonuses(s);
  if (bonuses.length === 0) return;

  let totalCredits = 0;
  let totalFood = 0;
  let totalFuel = 0;
  let totalSteel = 0;
  let totalAmmo = 0;
  let totalMed = 0;
  let happinessDelta = 0;
  let healthDelta = 0;
  let lawDelta = 0;
  let defenseDelta = 0;

  for (const b of bonuses) {
    switch (b.type) {
      case "credits": totalCredits += b.amount; break;
      case "food": totalFood += b.amount; break;
      case "fuel": totalFuel += b.amount; break;
      case "steel": totalSteel += b.amount; break;
      case "ammo": totalAmmo += b.amount; break;
      case "medSupplies": totalMed += b.amount; break;
      case "happiness": happinessDelta += b.amount; break;
      case "publicHealth": healthDelta += b.amount; break;
      case "lawOrder": lawDelta += b.amount; break;
      case "defense": defenseDelta += b.amount; break;
    }
  }

  if (totalCredits > 0) { s.resources.credits += totalCredits; recordCreditsEarned(s, totalCredits); entries.push({ label: "Zone Control", delta: totalCredits, unit: "credits", reason: `${bonuses.filter(b => b.type === "credits").length} allied zones`, severity: "positive" }); }
  if (totalFood > 0) { applyResourceDelta(s, "food", totalFood); }
  if (totalFuel > 0) { s.stockpiles.fuel = (s.stockpiles.fuel ?? 0) + totalFuel; }
  if (totalSteel > 0) { s.stockpiles.steel = (s.stockpiles.steel ?? 0) + totalSteel; }
  if (totalAmmo > 0) { s.stockpiles.ammo = (s.stockpiles.ammo ?? 0) + totalAmmo; }
  if (totalMed > 0) {
    const medicalReward = applyResourceDelta(s, "medSupplies", totalMed);
    entries.push({
      label: "Zone Control",
      delta: medicalReward.applied,
      unit: "medical supplies",
      reason: summarizeMedicalStorageGain(medicalReward),
      severity: medicalReward.rejected > 0 ? "warning" : "positive",
    });
  }
  if (happinessDelta > 0) { s.cityStats.happiness = Math.min(100, s.cityStats.happiness + happinessDelta); }
  if (healthDelta > 0) { s.cityStats.publicHealth = Math.min(100, s.cityStats.publicHealth + healthDelta); }
  if (lawDelta > 0) { s.cityStats.lawOrder = Math.min(100, s.cityStats.lawOrder + lawDelta); }
  if (defenseDelta > 0) { s.cityStats.defenseRating = Math.min(100, (s.cityStats.defenseRating ?? 0) + defenseDelta); entries.push({ label: "Zone Control", delta: defenseDelta, unit: "defense", reason: `${bonuses.filter(b => b.type === "defense").length} allied zones`, severity: "positive" }); }
}

export function getControlledZoneCount(state: GameState): number {
  const rels = state.locationRelations ?? {};
  const discoveredIds = state.discoveredLocationIds ?? [];
  const rnState = state.resourceNodes ?? createDefaultResourceNodeState();
  let count = 0;
  for (const loc of WORLD_LOCATIONS) {
    if (loc.type === "player_city") continue;
    if (!loc.discovered && !discoveredIds.includes(loc.id)) continue;
    const rel = rels[loc.id] ?? null;
    const isAllied = rel ? rel.disposition > 50 : false;
    const isExploiting = loc.resourceNodeId && !!rnState.exploiting[loc.resourceNodeId];
    if (isAllied || isExploiting) count++;
  }
  return count;
}
