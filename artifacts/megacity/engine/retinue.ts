import type { GameState, TickEntry, GameMessage } from "@/engine/types";
import {
  type Troop, type Captain, type Squad, type TroopClassId, type TroopTier, type SquadRole, type CaptainTrait,
  type SquadDoctrine, type SquadSynergyDef, type SquadDeploymentSpec, type SquadOperationId, type SquadDeploymentPreview,
  type SquadDeploymentResolution, TIER_DEFS, CLASS_DEFS, CAPTAIN_TRAITS, SQUAD_SYNERGIES, SQUAD_OPERATIONS, XP_SHARE_RULES,
  xpForTroopLevel, xpForCaptainLevel, getTierDef, getClassDef,
  createDefaultRetinueState, genTroopId, genCaptainId, genSquadId, getSquadDoctrineDef, getSquadSynergies, DEFAULT_SQUAD_DOCTRINE,
  LEADERLESS_SQUAD_POWER_MULTIPLIER,
} from "@/engine/retinueData";
import { type InventoryItem, getItemDef, createDefaultInventoryState, genItemId } from "@/engine/inventoryData";
import { recordCreditsEarned } from "@/engine/creditTracking";
import {
  normalizeActionCostTiming,
  type ActionCostTiming,
} from "@/engine/actionCostTiming";

export type { SquadDeploymentResolution } from "@/engine/retinueData";

export type RetinueActionPreview = {
  canAct: boolean;
  reason?: string;
  timing: ActionCostTiming;
};

function ensureRetinue(s: GameState) {
  if (!s.retinue) s.retinue = createDefaultRetinueState();
  return s.retinue;
}

function ensureInventory(s: GameState) {
  if (!s.inventory) s.inventory = createDefaultInventoryState();
  return s.inventory;
}

export function recruitTroop(s: GameState, classId: TroopClassId): { success: boolean; error?: string; troop?: Troop } {
  const ret = ensureRetinue(s);
  const classDef = getClassDef(classId);
  if (!classDef) return { success: false, error: "Unknown troop class" };

  if (classId === "cyber_operative" && !(s.unlockedTechnologies ?? []).includes("basic_cybernetics")) {
    return { success: false, error: "Requires BASIC CYBERNETICS research" };
  }

  if (s.resources.credits < classDef.recruitCost) {
    return { success: false, error: `Need ${classDef.recruitCost} credits` };
  }

  s.resources.credits -= classDef.recruitCost;

  const troop: Troop = {
    id: genTroopId(),
    classId,
    tier: "recruit",
    level: 1,
    xp: 0,
    xpToNext: xpForTroopLevel(1),
    hp: classDef.baseHP,
    maxHp: classDef.baseHP,
    combat: classDef.baseCombat,
    morale: 50,
    kills: 0,
    missionsCompleted: 0,
    status: "ready",
    squadId: null,
    hiredTick: s.totalTicks,
  };

  ret.troops.push(troop);
  ret.totalRecruits++;
  return { success: true, troop };
}

export function hireCaptain(s: GameState, name: string, trait: CaptainTrait): { success: boolean; error?: string; captain?: Captain } {
  const ret = ensureRetinue(s);
  const cost = 2000;
  if (s.resources.credits < cost) return { success: false, error: `Need ${cost} credits` };

  if (ret.captains.filter(c => c.status !== "kia").length >= ret.maxSquads) {
    return { success: false, error: "Max captains reached" };
  }

  s.resources.credits -= cost;

  const captain: Captain = {
    id: genCaptainId(),
    name,
    title: "Captain",
    level: 1,
    xp: 0,
    xpToNext: xpForCaptainLevel(1),
    leadership: 10 + Math.floor(Math.random() * 10),
    combat: 8 + Math.floor(Math.random() * 8),
    tactics: 5 + Math.floor(Math.random() * 10),
    loyalty: 40 + Math.floor(Math.random() * 30),
    squadId: "",
    kills: 0,
    battlesWon: 0,
    battlesLost: 0,
    trait,
    status: "active",
    equippedItemIds: [],
    hiredTick: s.totalTicks,
  };

  ret.captains.push(captain);
  return { success: true, captain };
}

export function createSquad(s: GameState, name: string, role: SquadRole, captainId: string): { success: boolean; error?: string; squad?: Squad } {
  const ret = ensureRetinue(s);
  if (ret.squads.length >= ret.maxSquads) return { success: false, error: "Max squads reached" };

  const captain = ret.captains.find(c => c.id === captainId && c.status === "active");
  if (!captain) return { success: false, error: "Captain not found or inactive" };
  if (ret.squads.some(sq => sq.captainId === captainId || sq.deputyCaptainId === captainId)) {
    return { success: false, error: "Captain is already assigned to a squad" };
  }

  const traitDef = CAPTAIN_TRAITS.find(t => t.id === captain.trait);
  const sizeBonus = traitDef?.effects.squadSizeBonus ?? 0;

  const squad: Squad = {
    id: genSquadId(),
    name,
    role,
    doctrine: DEFAULT_SQUAD_DOCTRINE,
    captainId,
    deputyCaptainId: null,
    troopIds: [],
    maxSize: ret.maxTroopsPerSquad + sizeBonus,
    formationBonus: 0,
    totalKills: 0,
    deploymentsCompleted: 0,
    created: s.totalTicks,
  };

  captain.squadId = squad.id;
  ret.squads.push(squad);
  return { success: true, squad };
}

function captainAssignedToAnotherSquad(ret: ReturnType<typeof createDefaultRetinueState>, captainId: string, squadId: string): boolean {
  return ret.squads.some(sq =>
    sq.id !== squadId && (sq.captainId === captainId || sq.deputyCaptainId === captainId),
  );
}

/**
 * Put an active, unassigned captain in the succession seat for a squad.
 * Deputies do not receive captain power until they take over, so assigning
 * one in advance does not change the squad's current combat calculation.
 */
export function assignSquadDeputy(
  s: GameState,
  squadId: string,
  captainId: string | null,
): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const squad = ret.squads.find(sq => sq.id === squadId);
  if (!squad) return { success: false, error: "Squad not found" };

  if (captainId === null) {
    squad.deputyCaptainId = null;
    return { success: true };
  }

  if (squad.captainId === captainId) {
    return { success: false, error: "The captain cannot also be the deputy" };
  }
  const deputy = ret.captains.find(c => c.id === captainId && c.status === "active");
  if (!deputy) return { success: false, error: "Captain not found or inactive" };
  if (captainAssignedToAnotherSquad(ret, captainId, squadId)) {
    return { success: false, error: "Captain is already assigned to another squad" };
  }

  squad.deputyCaptainId = captainId;
  return { success: true };
}

/** Restore a leaderless squad, or replace its current captain. */
export function appointSquadCaptain(
  s: GameState,
  squadId: string,
  captainId: string,
): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const squad = ret.squads.find(sq => sq.id === squadId);
  if (!squad) return { success: false, error: "Squad not found" };

  const captain = ret.captains.find(c => c.id === captainId && c.status === "active");
  if (!captain) return { success: false, error: "Captain not found or inactive" };
  if (captainAssignedToAnotherSquad(ret, captainId, squadId)) {
    return { success: false, error: "Captain is already assigned to another squad" };
  }

  const previousCaptain = squad.captainId
    ? ret.captains.find(c => c.id === squad.captainId)
    : null;
  if (previousCaptain && previousCaptain.id !== captainId) previousCaptain.squadId = "";
  squad.captainId = captainId;
  squad.deputyCaptainId = squad.deputyCaptainId === captainId ? null : squad.deputyCaptainId ?? null;
  captain.squadId = squadId;
  return { success: true };
}

export function assignTroopToSquad(s: GameState, troopId: string, squadId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const troop = ret.troops.find(t => t.id === troopId);
  if (!troop) return { success: false, error: "Troop not found" };
  if (troop.status === "kia") return { success: false, error: "Troop is KIA" };

  const squad = ret.squads.find(sq => sq.id === squadId);
  if (!squad) return { success: false, error: "Squad not found" };
  if (ret.activeOperation?.squadId === squadId || troop.status === "deployed") {
    return { success: false, error: "Cannot change a deployed troop or squad" };
  }
  if (squad.troopIds.length >= squad.maxSize) return { success: false, error: "Squad is full" };

  if (troop.squadId) {
    const oldSquad = ret.squads.find(sq => sq.id === troop.squadId);
    if (oldSquad) {
      oldSquad.troopIds = oldSquad.troopIds.filter(id => id !== troopId);
    }
  }

  troop.squadId = squadId;
  if (!squad.troopIds.includes(troopId)) squad.troopIds.push(troopId);
  return { success: true };
}

export function setSquadDoctrine(s: GameState, squadId: string, doctrine: SquadDoctrine): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const squad = ret.squads.find(sq => sq.id === squadId);
  if (!squad) return { success: false, error: "Squad not found" };
  if (ret.activeOperation?.squadId === squadId) return { success: false, error: "Cannot change doctrine while this squad is deployed" };
  const doctrineDef = getSquadDoctrineDef(doctrine);
  if (doctrineDef.id !== doctrine) return { success: false, error: "Unknown squad doctrine" };
  squad.doctrine = doctrine;
  return { success: true };
}

export function removeTroopFromSquad(s: GameState, troopId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const troop = ret.troops.find(t => t.id === troopId);
  if (!troop || !troop.squadId) return { success: false, error: "Not in a squad" };

  const squad = ret.squads.find(sq => sq.id === troop.squadId);
  if (squad && ret.activeOperation?.squadId === squad.id) return { success: false, error: "Cannot change a deployed squad" };
  if (squad) squad.troopIds = squad.troopIds.filter(id => id !== troopId);
  troop.squadId = null;
  return { success: true };
}

export function getTroopPromotionPreview(s: GameState, troopId: string): RetinueActionPreview & { nextTier?: TroopTier } {
  const ret = s.retinue ?? createDefaultRetinueState();
  const troop = ret.troops.find(t => t.id === troopId);
  if (!troop) {
    return {
      canAct: false,
      reason: "Troop not found",
      timing: normalizeActionCostTiming({ kind: "instant", cancellation: "unavailable" }),
    };
  }

  const currentTierDef = getTierDef(troop.tier);
  const nextTier = currentTierDef.nextTier;
  if (!nextTier) {
    return {
      canAct: false,
      reason: "Already max tier",
      timing: normalizeActionCostTiming({ kind: "instant", cancellation: "unavailable" }),
    };
  }
  const nextTierDef = getTierDef(nextTier);
  const timing = normalizeActionCostTiming({
    kind: "instant",
    upfrontCostCredits: nextTierDef.promoteCost,
    resourceCosts: nextTierDef.promoteResources,
    availableCredits: s.resources?.credits,
    availableResources: s.stockpiles,
    cancellation: "unavailable",
  });
  const reason =
    troop.xp < nextTierDef.xpRequired
      ? `Need ${nextTierDef.xpRequired} XP (have ${troop.xp})`
      : timing.activationAffordable === false
        ? "Promotion resources are insufficient."
        : undefined;
  return { canAct: !reason, reason, timing, nextTier };
}

export function getTroopTrainingPreview(
  s: GameState,
  troopId: string,
): RetinueActionPreview {
  const ret = s.retinue ?? createDefaultRetinueState();
  const troop = ret.troops.find(t => t.id === troopId);
  const queued = ret.trainingQueue.find(q => q.troopId === troopId);
  const timing = normalizeActionCostTiming({
    kind: "timed",
    upfrontCostCredits: 50,
    durationTicks: 8,
    activeTicksRemaining: queued?.ticksRemaining,
    phase: queued ? "active" : undefined,
    availableCredits: s.resources?.credits,
    cancellation: "unavailable",
  });
  if (!troop) return { canAct: false, reason: "Troop not found", timing };
  if (queued) return { canAct: false, reason: "Already training", timing };
  if (troop.status !== "ready") return { canAct: false, reason: "Troop not ready", timing };
  if (timing.activationAffordable === false) return { canAct: false, reason: "Training credits are insufficient.", timing };
  return { canAct: true, timing };
}

export function promoteTroop(s: GameState, troopId: string): { success: boolean; error?: string; newTier?: TroopTier } {
  const ret = ensureRetinue(s);
  const troop = ret.troops.find(t => t.id === troopId);
  if (!troop) return { success: false, error: "Troop not found" };

  const preview = getTroopPromotionPreview(s, troopId);
  const nextTier = preview.nextTier;
  if (!preview.canAct || !nextTier) return { success: false, error: preview.reason };
  const currentTierDef = getTierDef(troop.tier);
  const nextTierDef = getTierDef(nextTier);

  if (nextTierDef.promoteResources) {
    for (const [res, amount] of Object.entries(nextTierDef.promoteResources)) {
      const have = (s.stockpiles[res] ?? 0);
      if (have < amount) return { success: false, error: `Need ${amount} ${res} (have ${have})` };
    }
    for (const [res, amount] of Object.entries(nextTierDef.promoteResources)) {
      s.stockpiles[res] = (s.stockpiles[res] ?? 0) - amount;
    }
  }

  s.resources.credits -= nextTierDef.promoteCost;
  troop.tier = nextTier;
  troop.combat = Math.floor(getClassDef(troop.classId).baseCombat * nextTierDef.combatMult);
  troop.maxHp = Math.floor(getClassDef(troop.classId).baseHP * (1 + nextTierDef.rank * 0.15));
  troop.hp = troop.maxHp;
  ret.totalPromotions++;
  return { success: true, newTier: nextTier };
}

export function startTraining(s: GameState, troopId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const troop = ret.troops.find(t => t.id === troopId);
  if (!troop) return { success: false, error: "Troop not found" };
  const preview = getTroopTrainingPreview(s, troopId);
  if (!preview.canAct) return { success: false, error: preview.reason };

  const trainingCost = 50;
  if (s.resources.credits < trainingCost) return { success: false, error: `Need ${trainingCost} credits` };
  s.resources.credits -= trainingCost;

  troop.status = "training";
  ret.trainingQueue.push({ troopId, ticksRemaining: 8 });
  return { success: true };
}

export function dismissTroop(s: GameState, troopId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const idx = ret.troops.findIndex(t => t.id === troopId);
  if (idx < 0) return { success: false, error: "Troop not found" };

  const troop = ret.troops[idx];
  if (troop.status === "deployed") return { success: false, error: "Cannot dismiss a deployed troop" };
  if (troop.squadId) {
    const squad = ret.squads.find(sq => sq.id === troop.squadId);
    if (squad) squad.troopIds = squad.troopIds.filter(id => id !== troopId);
  }
  ret.trainingQueue = ret.trainingQueue.filter(q => q.troopId !== troopId);
  ret.troops.splice(idx, 1);
  return { success: true };
}

export function dismissCaptain(s: GameState, captainId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const idx = ret.captains.findIndex(c => c.id === captainId);
  if (idx < 0) return { success: false, error: "Captain not found" };

  const captain = ret.captains[idx];
  const squad = ret.squads.find(sq => sq.captainId === captainId);
  if (squad) {
    const deputy = squad.deputyCaptainId
      ? ret.captains.find(c => c.id === squad.deputyCaptainId && c.status === "active" && c.id !== captainId)
      : null;
    if (deputy) {
      squad.captainId = deputy.id;
      squad.deputyCaptainId = null;
      deputy.squadId = squad.id;
    } else {
      squad.captainId = null;
      squad.deputyCaptainId = null;
    }
    captain.squadId = "";
  } else {
    const deputySquad = ret.squads.find(sq => sq.deputyCaptainId === captainId);
    if (deputySquad) deputySquad.deputyCaptainId = null;
  }
  // Repair any impossible duplicate deputy references from a hand-edited or
  // older save while the captain record is being removed.
  for (const otherSquad of ret.squads) {
    if (otherSquad.deputyCaptainId === captainId) otherSquad.deputyCaptainId = null;
  }

  const inv = ensureInventory(s);
  for (const itemId of captain.equippedItemIds) {
    const item = inv.items.find(i => i.id === itemId);
    if (item) item.equippedTo = null;
  }

  ret.captains.splice(idx, 1);
  return { success: true };
}

export function disbandSquad(s: GameState, squadId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const idx = ret.squads.findIndex(sq => sq.id === squadId);
  if (idx < 0) return { success: false, error: "Squad not found" };
  if (ret.activeOperation?.squadId === squadId) return { success: false, error: "Cannot disband a deployed squad" };

  const squad = ret.squads[idx];
  for (const tid of squad.troopIds) {
    const t = ret.troops.find(tr => tr.id === tid);
    if (t) t.squadId = null;
  }
  if (squad.captainId) {
    const cap = ret.captains.find(c => c.id === squad.captainId);
    if (cap) cap.squadId = "";
  }
  ret.squads.splice(idx, 1);
  return { success: true };
}

export function distributeXP(s: GameState, squadId: string, totalXP: number): void {
  const ret = ensureRetinue(s);
  const squad = ret.squads.find(sq => sq.id === squadId);
  if (!squad) return;

  const captain = squad.captainId ? ret.captains.find(c => c.id === squad.captainId) : null;
  const troops = squad.troopIds.map(id => ret.troops.find(t => t.id === id)).filter(Boolean) as Troop[];

  let captainShare = Math.floor(totalXP * XP_SHARE_RULES.captainSharePct);
  let troopPool = totalXP - captainShare;

  if (captain) {
    const traitDef = CAPTAIN_TRAITS.find(t => t.id === captain.trait);
    const shareBonus = traitDef?.effects.xpShareBonus ?? 0;
    const bonusFromTroop = Math.floor(troopPool * shareBonus);
    captainShare += bonusFromTroop;
    troopPool -= bonusFromTroop;
    captain.xp += captainShare;

    while (captain.xp >= captain.xpToNext) {
      captain.xp -= captain.xpToNext;
      captain.level++;
      captain.xpToNext = xpForCaptainLevel(captain.level);
      captain.leadership += 2;
      captain.combat += 1;
      captain.tactics += 1;
    }
  } else {
    troopPool = totalXP;
  }

  if (troops.length > 0) {
    const perTroop = Math.floor(troopPool / troops.length);
    for (const troop of troops) {
      if (troop.status === "kia") continue;
      troop.xp += perTroop;
      while (troop.xp >= troop.xpToNext) {
        troop.xp -= troop.xpToNext;
        troop.level++;
        troop.xpToNext = xpForTroopLevel(troop.level);
        troop.combat += 1;
        troop.morale = Math.min(100, troop.morale + 3);
      }
    }
  }
}

export function equipItemToCaptain(s: GameState, itemId: string, captainId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const inv = ensureInventory(s);
  const item = inv.items.find(i => i.id === itemId);
  if (!item) return { success: false, error: "Item not found" };
  const def = getItemDef(item.defId);
  if (!def || !def.equipSlot) return { success: false, error: "Item cannot be equipped" };

  const captain = ret.captains.find(c => c.id === captainId);
  if (!captain) return { success: false, error: "Captain not found" };

  const currentInSlot = captain.equippedItemIds.find(eid => {
    const ei = inv.items.find(i => i.id === eid);
    if (!ei) return false;
    const ed = getItemDef(ei.defId);
    return ed?.equipSlot === def.equipSlot;
  });
  if (currentInSlot) {
    const ci = inv.items.find(i => i.id === currentInSlot);
    if (ci) ci.equippedTo = null;
    captain.equippedItemIds = captain.equippedItemIds.filter(id => id !== currentInSlot);
  }

  if (item.equippedTo) {
    const prevCap = ret.captains.find(c => c.id === item.equippedTo);
    if (prevCap) prevCap.equippedItemIds = prevCap.equippedItemIds.filter(id => id !== itemId);
  }

  item.equippedTo = captainId;
  captain.equippedItemIds.push(itemId);
  return { success: true };
}

export function unequipItem(s: GameState, itemId: string): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const inv = ensureInventory(s);
  const item = inv.items.find(i => i.id === itemId);
  if (!item || !item.equippedTo) return { success: false, error: "Item not equipped" };

  const captain = ret.captains.find(c => c.id === item.equippedTo);
  if (captain) captain.equippedItemIds = captain.equippedItemIds.filter(id => id !== itemId);
  item.equippedTo = null;
  return { success: true };
}

export function addItemToInventory(s: GameState, defId: string, quantity: number = 1): { success: boolean; error?: string } {
  const inv = ensureInventory(s);
  const def = getItemDef(defId);
  if (!def) return { success: false, error: "Unknown item" };

  if (def.stackable) {
    let remaining = quantity;
    const existing = inv.items.find(i => i.defId === defId && !i.equippedTo && i.quantity < def.maxStack);
    if (existing) {
      const canAdd = def.maxStack - existing.quantity;
      const toAdd = Math.min(canAdd, remaining);
      existing.quantity += toAdd;
      remaining -= toAdd;
    }
    while (remaining > 0 && inv.items.length < inv.maxSlots) {
      const stackQty = Math.min(def.maxStack, remaining);
      inv.items.push({ id: genItemId(), defId, quantity: stackQty, equippedTo: null });
      remaining -= stackQty;
    }
    if (remaining > 0) return { success: false, error: "Inventory full — some items lost" };
    inv.totalItemsFound += quantity;
    return { success: true };
  }

  if (inv.items.length >= inv.maxSlots) return { success: false, error: "Inventory full" };

  inv.items.push({ id: genItemId(), defId, quantity: 1, equippedTo: null });
  inv.totalItemsFound += quantity;
  return { success: true };
}

export function sellItem(s: GameState, itemId: string, quantity: number = 1): { success: boolean; error?: string } {
  const inv = ensureInventory(s);
  const item = inv.items.find(i => i.id === itemId);
  if (!item) return { success: false, error: "Item not found" };
  if (item.equippedTo) return { success: false, error: "Unequip first" };

  const def = getItemDef(item.defId);
  if (!def) return { success: false, error: "Unknown item" };

  const sellQty = Math.min(quantity, item.quantity);
  const sellValue = Math.floor(def.value * 0.4) * sellQty;
  s.resources.credits += sellValue;
  recordCreditsEarned(s, sellValue);
  item.quantity -= sellQty;
  if (item.quantity <= 0) {
    inv.items = inv.items.filter(i => i.id !== itemId);
  }
  inv.totalItemsSold += sellQty;
  return { success: true };
}

export function processRetinueTick(s: GameState, entries: TickEntry[]): void {
  const ret = s.retinue;
  if (!ret) return;

  completeSquadOperation(s, entries);

  let recovered = 0;
  for (const troop of ret.troops) {
    if (troop.status === "injured" && (troop.injuredUntilTick ?? Number.POSITIVE_INFINITY) <= s.totalTicks) {
      troop.status = "ready";
      troop.hp = troop.maxHp;
      troop.injuredUntilTick = undefined;
      recovered += 1;
    }
  }
  if (recovered > 0) {
    entries.push({ label: "Retinue Recovered", delta: recovered, unit: "troops", reason: "Treatment completed; personnel returned to duty", severity: "positive" });
  }

  let totalUpkeep = 0;
  for (const troop of ret.troops) {
    if (troop.status === "kia") continue;
    const classDef = getClassDef(troop.classId);
    let upkeep = classDef.upkeepPerTick;
    if (troop.squadId) {
      const squad = ret.squads.find(sq => sq.id === troop.squadId);
      if (squad?.captainId) {
        const cap = ret.captains.find(c => c.id === squad.captainId);
        if (cap) {
          const td = CAPTAIN_TRAITS.find(t => t.id === cap.trait);
          if (td?.effects.upkeepReduction) upkeep = Math.floor(upkeep * (1 - td.effects.upkeepReduction));
        }
      }
    }
    totalUpkeep += upkeep;
  }
  for (const captain of ret.captains) {
    if (captain.status === "kia") continue;
    totalUpkeep += 5;
  }

  if (totalUpkeep > 0) {
    s.resources.credits -= totalUpkeep;
    if (s.totalTicks % 4 === 0) {
      entries.push({ label: "Retinue Upkeep", delta: -totalUpkeep * 4, unit: "credits", reason: `${ret.troops.filter(t => t.status !== "kia").length} troops, ${ret.captains.filter(c => c.status !== "kia").length} captains`, severity: "neutral" });
    }
  }

  // Pay-low / bickering flavor — emit inbox messages when retinue welfare slips.
  if (s.totalTicks > 0 && s.totalTicks % 16 === 0 && s.gameDate) {
    const liveTroops = ret.troops.filter(t => t.status !== "kia");
    if (liveTroops.length > 0) {
      const lowMorale = liveTroops.filter(t => t.morale < 30).length;
      const moraleRatio = lowMorale / liveTroops.length;
      const credits = s.resources.credits;
      const insolvent = credits < totalUpkeep * 4;

      if (insolvent && totalUpkeep > 0) {
        const msg: GameMessage = {
          id: `retinue-paylow-${s.totalTicks}`,
          timestamp: { ...s.gameDate },
          tick: s.totalTicks,
          category: "report",
          title: "Retinue Pay Shortfall",
          body: `Treasury cannot reliably cover retinue upkeep (${totalUpkeep.toLocaleString()} credits/tick). Troops are noticing late stipends and grumbling in the barracks.`,
          read: false,
          priority: "high",
        };
        s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
      } else if (moraleRatio >= 0.4) {
        const msg: GameMessage = {
          id: `retinue-bickering-${s.totalTicks}`,
          timestamp: { ...s.gameDate },
          tick: s.totalTicks,
          category: "report",
          title: "Retinue Bickering",
          body: `${lowMorale} of ${liveTroops.length} troops are reporting low morale. Quartermasters note rising arguments, missed drills, and a general sourness in the ranks.`,
          read: false,
          priority: "normal",
        };
        s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
      }
    }
  }

  const completedTraining: string[] = [];
  for (const q of ret.trainingQueue) {
    q.ticksRemaining--;
    if (q.ticksRemaining <= 0) {
      completedTraining.push(q.troopId);
      const troop = ret.troops.find(t => t.id === q.troopId);
      if (troop) {
        troop.status = "ready";

        let trainingXP = XP_SHARE_RULES.trainingBaseXpPerTick * 8;
        if (troop.squadId) {
          const squad = ret.squads.find(sq => sq.id === troop.squadId);
          if (squad?.captainId) {
            const captain = ret.captains.find(c => c.id === squad.captainId);
            if (captain) {
              const traitDef = CAPTAIN_TRAITS.find(t => t.id === captain.trait);
              const speedBonus = traitDef?.effects.trainingSpeed ?? 0;
              trainingXP = Math.floor(trainingXP * (1 + speedBonus) * (1 + captain.leadership * 0.01));
            }
          }
        }

        troop.xp += trainingXP;
        while (troop.xp >= troop.xpToNext) {
          troop.xp -= troop.xpToNext;
          troop.level++;
          troop.xpToNext = xpForTroopLevel(troop.level);
          troop.combat += 1;
          troop.morale = Math.min(100, troop.morale + 2);
        }
      }
    }
  }
  ret.trainingQueue = ret.trainingQueue.filter(q => !completedTraining.includes(q.troopId));

  if (completedTraining.length > 0) {
    entries.push({ label: "Training Complete", delta: completedTraining.length, unit: "troops", reason: "Retinue training cycle finished", severity: "positive" });
  }

  for (const squad of ret.squads) {
    if (!squad.captainId) continue;
    const captain = ret.captains.find(c => c.id === squad.captainId);
    if (!captain || captain.status !== "active") continue;
    const traitDef = CAPTAIN_TRAITS.find(t => t.id === captain.trait);
    const moraleBonus = traitDef?.effects.moraleBonus ?? 0;

    for (const tid of squad.troopIds) {
      const troop = ret.troops.find(t => t.id === tid);
      if (!troop || troop.status === "kia") continue;
      const targetMorale = Math.min(100, 50 + captain.leadership * 0.5 + moraleBonus);
      if (troop.morale < targetMorale) {
        troop.morale = Math.min(100, troop.morale + 1);
      } else if (troop.morale > targetMorale + 10) {
        troop.morale = Math.max(0, troop.morale - 1);
      }
    }
  }

  if (s.totalTicks % 4 === 0) {
    for (const squad of ret.squads) {
      if (!squad.captainId) continue;
      const readyTroops = squad.troopIds.filter(tid => {
        const t = ret.troops.find(tr => tr.id === tid);
        return t && t.status === "ready";
      }).length;
      if (readyTroops > 0) {
        const passiveXP = Math.floor(readyTroops * XP_SHARE_RULES.trainingBaseXpPerTick * 0.5);
        distributeXP(s, squad.id, passiveXP);
      }
    }
  }
}

export interface SquadSynergyRequirement {
  classId: TroopClassId | null;
  required: number;
  assigned: number;
  label: string;
}

export interface SquadSynergyStatus {
  synergy: SquadSynergyDef;
  missingRequirements: SquadSynergyRequirement[];
}

export type SquadSynergyBonusKey = keyof NonNullable<SquadSynergyDef["bonuses"]>;

export interface SquadSynergyEffect {
  synergyId: string;
  synergyName: string;
  key: SquadSynergyBonusKey;
  label: string;
  value: number;
}

const SQUAD_SYNERGY_EFFECT_LABELS: Record<SquadSynergyBonusKey, string> = {
  combatBonus: "combat power",
  defenseBonus: "defense",
  moraleBonus: "morale",
  reconBonus: "recon",
  healingBonus: "healing",
  xpBonus: "XP",
};

/**
 * Converts the data-driven synergy bonuses into ordered, player-facing
 * effects. Keeping this in the engine prevents the squad and character
 * dossiers from silently disagreeing about what a combination provides.
 */
export function getSquadSynergyEffects(synergy: SquadSynergyDef): SquadSynergyEffect[] {
  return (Object.keys(SQUAD_SYNERGY_EFFECT_LABELS) as SquadSynergyBonusKey[])
    .map(key => {
      const value = synergy.bonuses[key];
      if (typeof value !== "number" || value === 0) return null;
      return {
        synergyId: synergy.id,
        synergyName: synergy.name,
        key,
        label: SQUAD_SYNERGY_EFFECT_LABELS[key],
        value,
      };
    })
    .filter((effect): effect is SquadSynergyEffect => effect !== null);
}

export function formatSquadSynergyEffect(effect: SquadSynergyEffect): string {
  return `${effect.value > 0 ? "+" : ""}${effect.value} ${effect.label}`;
}

export interface SquadCompositionBreakdown {
  squadId: string;
  troopCount: number;
  capacity: number;
  readyTroopCount: number;
  injuredTroopCount: number;
  kiaTroopCount: number;
  unavailableTroopCount: number;
  overCapacityBy: number;
  classCounts: Record<string, number>;
  activeSynergies: SquadSynergyDef[];
  synergyEffects: SquadSynergyEffect[];
  missingSynergies: SquadSynergyStatus[];
  captainPower: number;
  troopPower: number;
  synergyPower: number;
  formationBonusPct: number;
  formationPower: number;
  preDoctrinePower: number;
  doctrineMultiplier: number;
  leaderless: boolean;
  leadershipMultiplier: number;
  combatPower: number;
  statusMessages: string[];
}

function getSynergyRequirementLabel(classId: string): string {
  return getClassDef(classId as TroopClassId).name;
}

/**
 * Returns the complete, player-facing accounting for a squad composition.
 *
 * `troopIds` is optional so assignment screens can inspect a proposed
 * composition without mutating the save. The live squad and all previews
 * therefore use exactly the same power and synergy rules.
 */
export function getSquadCompositionBreakdown(
  s: GameState,
  squadId: string,
  troopIds?: string[],
): SquadCompositionBreakdown {
  const ret = s.retinue;
  const squad = ret?.squads.find(sq => sq.id === squadId);
  const ids = troopIds ?? squad?.troopIds ?? [];
  const troops = ids.map(id => ret?.troops.find(t => t.id === id)).filter(Boolean) as Troop[];
  const capacity = squad?.maxSize ?? 0;
  const classCounts: Record<string, number> = {};
  for (const troop of troops) classCounts[troop.classId] = (classCounts[troop.classId] ?? 0) + 1;

  const readyTroops = troops.filter(t => t.status === "ready");
  const injuredTroopCount = troops.filter(t => t.status === "injured").length;
  const kiaTroopCount = troops.filter(t => t.status === "kia").length;
  const unavailableTroopCount = troops.filter(t => t.status !== "ready" && t.status !== "injured" && t.status !== "kia").length;
  const activeSynergies = getSquadSynergies(troops.map(t => t.classId));
  const synergyEffects = activeSynergies.flatMap(getSquadSynergyEffects);
  const activeSynergyIds = new Set(activeSynergies.map(syn => syn.id));
  const uniqueClassCount = new Set(troops.map(t => t.classId)).size;
  const missingSynergies: SquadSynergyStatus[] = SQUAD_SYNERGIES
    .filter(syn => !activeSynergyIds.has(syn.id))
    .map(syn => {
      const missingRequirements: SquadSynergyRequirement[] = syn.id === "balanced_force"
        ? [{
            classId: null,
            required: 4,
            assigned: uniqueClassCount,
            label: `${Math.max(0, 4 - uniqueClassCount)} more class${uniqueClassCount === 3 ? "" : "es"}`,
          }]
        : Object.entries(syn.minCount)
          .filter(([classId, required]) => (classCounts[classId] ?? 0) < required)
          .map(([classId, required]) => ({
            classId: classId as TroopClassId,
            required,
            assigned: classCounts[classId] ?? 0,
            label: `${getSynergyRequirementLabel(classId)} ${classCounts[classId] ?? 0}/${required}`,
          }));
      return { synergy: syn, missingRequirements };
    })
    .filter(status => status.missingRequirements.length > 0);

  let captainPower = 0;
  const captain = squad?.captainId ? ret?.captains.find(c => c.id === squad.captainId) : null;
  if (captain && captain.status === "active") {
    captainPower += captain.combat + captain.tactics;
    const traitDef = CAPTAIN_TRAITS.find(t => t.id === captain.trait);
    captainPower += traitDef?.effects.combatBonus ?? 0;
    const inv = s.inventory;
    if (inv) {
      for (const eid of captain.equippedItemIds) {
        const item = inv.items.find(i => i.id === eid);
        if (item) {
          const def = getItemDef(item.defId);
          if (def?.effects.combat) captainPower += def.effects.combat;
          if (def?.effects.leadership) captainPower += Math.floor(def.effects.leadership * 0.5);
        }
      }
    }
  }

  const troopPower = readyTroops.reduce((power, troop) => {
    const tierDef = getTierDef(troop.tier);
    return power + Math.floor(troop.combat * tierDef.combatMult * (troop.morale / 100));
  }, 0);
  const synergyPower = activeSynergies.reduce((power, synergy) => power + (synergy.bonuses.combatBonus ?? 0), 0);
  const formationBonusPct = squad?.formationBonus ?? 0;
  const formationPower = Math.round((captainPower + troopPower + synergyPower) * formationBonusPct / 100);
  const preDoctrinePower = captainPower + troopPower + synergyPower + formationPower;
  const doctrineMultiplier = getSquadDoctrineDef(squad?.doctrine).powerMultiplier;
  const leaderless = !captain || captain.status !== "active";
  const leadershipMultiplier = leaderless ? LEADERLESS_SQUAD_POWER_MULTIPLIER : 1;
  const combatPower = Math.round(preDoctrinePower * doctrineMultiplier * leadershipMultiplier);
  const statusMessages: string[] = [];

  if (leaderless) {
    statusMessages.push(`LEADERLESS — squad power reduced by ${Math.round((1 - LEADERLESS_SQUAD_POWER_MULTIPLIER) * 100)}% until a captain is appointed.`);
  }
  if (troops.length === 0) statusMessages.push("No troops assigned — the captain is on standby.");
  if (troops.length > capacity) statusMessages.push(`${troops.length - capacity} troop${troops.length - capacity === 1 ? "" : "s"} over capacity — remove an assignment.`);
  if (injuredTroopCount > 0) statusMessages.push(`${injuredTroopCount} injured troop${injuredTroopCount === 1 ? "" : "s"} contribute${injuredTroopCount === 1 ? "s" : ""} no combat power until recovered.`);
  if (kiaTroopCount > 0) statusMessages.push(`${kiaTroopCount} KIA troop record${kiaTroopCount === 1 ? "" : "s"} contribute${kiaTroopCount === 1 ? "s" : ""} no combat power and should be removed.`);
  if (unavailableTroopCount > 0) statusMessages.push(`${unavailableTroopCount} unavailable troop${unavailableTroopCount === 1 ? "" : "s"} contribute${unavailableTroopCount === 1 ? "s" : ""} no combat power while training or deployed.`);

  return {
    squadId,
    troopCount: troops.length,
    capacity,
    readyTroopCount: readyTroops.length,
    injuredTroopCount,
    kiaTroopCount,
    unavailableTroopCount,
    overCapacityBy: Math.max(0, troops.length - capacity),
    classCounts,
    activeSynergies,
    synergyEffects,
    missingSynergies,
    captainPower,
    troopPower,
    synergyPower,
    formationBonusPct,
    formationPower,
    preDoctrinePower,
    doctrineMultiplier,
    leaderless,
    leadershipMultiplier,
    combatPower,
    statusMessages,
  };
}

export interface SquadAssignmentPreview {
  current: SquadCompositionBreakdown;
  preview: SquadCompositionBreakdown;
  delta: number;
  gainedSynergyEffects: SquadSynergyEffect[];
  canAssign: boolean;
  reason?: string;
}

export function getSquadAssignmentPreview(
  s: GameState,
  squadId: string,
  troopId: string,
): SquadAssignmentPreview {
  const current = getSquadCompositionBreakdown(s, squadId);
  const troop = s.retinue?.troops.find(t => t.id === troopId);
  const squad = s.retinue?.squads.find(sq => sq.id === squadId);
  const previewIds = squad && !squad.troopIds.includes(troopId)
    ? [...squad.troopIds, troopId]
    : squad?.troopIds ?? [];
  const preview = getSquadCompositionBreakdown(s, squadId, previewIds);
  const currentSynergyIds = new Set(current.activeSynergies.map(synergy => synergy.id));
  const gainedSynergyEffects = preview.activeSynergies
    .filter(synergy => !currentSynergyIds.has(synergy.id))
    .flatMap(getSquadSynergyEffects);
  let reason: string | undefined;
  if (!troop) reason = "Troop not found.";
  else if (troop.status === "kia") reason = "KIA troops cannot be assigned.";
  else if (troop.squadId === squadId) reason = "This troop is already assigned here.";
  else if (!squad) reason = "Squad not found.";
  else if (preview.troopCount > preview.capacity) reason = "Squad is at capacity.";
  return {
    current,
    preview,
    delta: preview.combatPower - current.combatPower,
    gainedSynergyEffects,
    canAssign: !reason,
    reason,
  };
}

export function getSquadCombatPower(s: GameState, squadId: string): number {
  return getSquadCompositionBreakdown(s, squadId).combatPower;
}

/**
 * Shared doctrine modifiers for squad-backed operations. Combat power is
 * consumed above; casualty and speed modifiers are exposed here so mission
 * resolvers can apply the same player choice without duplicating doctrine
 * constants.
 */
export function getSquadDoctrineModifiers(s: GameState, squadId: string): {
  powerMultiplier: number;
  casualtyRiskMultiplier: number;
  operationSpeedMultiplier: number;
} {
  const squad = s.retinue?.squads.find(sq => sq.id === squadId);
  const doctrine = getSquadDoctrineDef(squad?.doctrine);
  return {
    powerMultiplier: doctrine.powerMultiplier,
    casualtyRiskMultiplier: doctrine.casualtyRiskMultiplier,
    operationSpeedMultiplier: doctrine.operationSpeedMultiplier,
  };
}

export function applySquadDeploymentResolution(
  s: GameState,
  result: SquadDeploymentResolution,
): { wounded: number; killed: number } {
  const ret = ensureRetinue(s);
  const squad = ret.squads.find(sq => sq.id === result.squadId);
  if (!squad || result.casualties <= 0) {
    if (squad) squad.deploymentsCompleted += 1;
    return { wounded: 0, killed: 0 };
  }
  const available = squad.troopIds
    .map(id => ret.troops.find(t => t.id === id))
    .filter((troop): troop is Troop => Boolean(troop && (troop.status === "ready" || troop.status === "deployed")));
  const medics = available.filter(t => t.classId === "medic" || t.classId === "war_medic").length;
  const medicalProtection = Math.min(0.35, medics * 0.08 + (s.cityStats.publicHealth ?? 0) / 500);
  const killed = Math.min(available.length, Math.floor(result.casualties * Math.max(0.15, 0.45 - medicalProtection)));
  const wounded = Math.min(available.length - killed, result.casualties - killed);

  for (let i = 0; i < killed; i++) {
    available[i].status = "kia";
    available[i].hp = 0;
  }
  const recoveryTicks = Math.max(2, Math.round(8 - (s.cityStats.publicHealth ?? 0) / 20 - medics));
  for (let i = killed; i < killed + wounded; i++) {
    available[i].status = "injured";
    available[i].hp = Math.max(1, Math.round(available[i].maxHp * 0.35));
    available[i].injuredUntilTick = s.totalTicks + recoveryTicks;
  }
  ret.totalCasualties += killed + wounded;
  squad.deploymentsCompleted += 1;
  return { wounded, killed };
}

export function getSquadOperationDef(operationId: unknown) {
  return SQUAD_OPERATIONS.find(operation => operation.id === operationId);
}

/**
 * Returns the launch card's numbers without mutating the save. Both casualty
 * projections go through the resolver so the preview cannot drift from the
 * eventual operation math.
 */
export function getSquadDeploymentPreview(
  s: GameState,
  squadId: string,
  operationId: SquadOperationId,
): SquadDeploymentPreview | null {
  const operation = getSquadOperationDef(operationId);
  const squad = s.retinue?.squads.find(sq => sq.id === squadId);
  if (!operation || !squad) return null;

  const successfulResolution = resolveSquadDeployment(s, squadId, operation.spec, () => 0);
  const failedResolution = resolveSquadDeployment(s, squadId, operation.spec, () => 1);
  if (!successfulResolution || !failedResolution) return null;

  const readyTroopCount = successfulResolution.readyTroopCount;
  const activeForThisOperation =
    s.retinue?.activeOperation?.operationId === operationId
      ? s.retinue.activeOperation
      : null;
  const timing = normalizeActionCostTiming({
    kind: "timed",
    upfrontCostCredits: 0,
    durationTicks: successfulResolution.duration,
    activeTicksRemaining: activeForThisOperation?.ticksRemaining,
    phase: activeForThisOperation ? "active" : undefined,
    availableCredits: s.resources?.credits,
    cancellation: "unavailable",
  });
  let reason: string | undefined;
  const captain = squad.captainId ? s.retinue?.captains.find(c => c.id === squad.captainId) : null;
  if (s.retinue?.activeOperation) reason = "Another squad operation is already in progress.";
  else if (!captain || captain.status !== "active") reason = "An active captain is required.";
  else if (readyTroopCount < operation.minReadyTroops) {
    reason = `Need ${operation.minReadyTroops} ready troop${operation.minReadyTroops === 1 ? "" : "s"}.`;
  }

  return {
    squadId,
    operationId,
    operationName: operation.name,
    canLaunch: !reason,
    reason,
    duration: successfulResolution.duration,
    successChance: successfulResolution.successChance,
    combatPower: successfulResolution.combatPower,
    readyTroopCount,
    casualtyRate: operation.spec.casualtyRate,
    projectedCasualtiesOnSuccess: successfulResolution.casualties,
    projectedCasualtiesOnFailure: failedResolution.casualties,
    doctrineModifiers: successfulResolution.doctrineModifiers,
    timing,
  };
}

export function launchSquadOperation(
  s: GameState,
  squadId: string,
  operationId: SquadOperationId,
  random: () => number = Math.random,
): { success: boolean; error?: string } {
  const ret = ensureRetinue(s);
  const preview = getSquadDeploymentPreview(s, squadId, operationId);
  if (!preview) return { success: false, error: "Squad or operation not found" };
  if (!preview.canLaunch) return { success: false, error: preview.reason };

  const squad = ret.squads.find(sq => sq.id === squadId)!;
  const operation = getSquadOperationDef(operationId)!;
  const resolution = resolveSquadDeployment(s, squadId, operation.spec, random);
  if (!resolution) return { success: false, error: "Unable to resolve operation" };

  for (const troop of ret.troops) {
    if (squad.troopIds.includes(troop.id) && troop.status === "ready") troop.status = "deployed";
  }
  ret.activeOperation = {
    id: `squad-op-${s.totalTicks}-${ret.operationHistory?.length ?? 0}`,
    operationId,
    squadId,
    squadName: squad.name,
    startedTick: s.totalTicks,
    ticksRemaining: resolution.duration,
    resolution,
  };
  return { success: true };
}

function completeSquadOperation(s: GameState, entries: TickEntry[]): void {
  const ret = s.retinue;
  const active = ret?.activeOperation;
  if (!ret || !active) return;

  active.ticksRemaining -= 1;
  if (active.ticksRemaining > 0) return;

  const operation = getSquadOperationDef(active.operationId);
  const squad = ret.squads.find(sq => sq.id === active.squadId);
  const commitment = applySquadDeploymentResolution(s, active.resolution);
  const deployedIds = new Set(squad?.troopIds ?? []);
  for (const troop of ret.troops) {
    if (deployedIds.has(troop.id) && troop.status === "deployed") {
      troop.status = "ready";
      troop.missionsCompleted += 1;
    }
  }
  if (squad) {
    distributeXP(s, squad.id, active.resolution.success ? XP_SHARE_RULES.missionXpBase : Math.floor(XP_SHARE_RULES.missionXpBase / 2));
  }

  const record = {
    id: active.id,
    operationId: active.operationId,
    operationName: operation?.name ?? active.operationId,
    squadId: active.squadId,
    squadName: active.squadName,
    startedTick: active.startedTick,
    completedTick: s.totalTicks,
    success: active.resolution.success,
    duration: active.resolution.duration,
    successChance: active.resolution.successChance,
    combatPower: active.resolution.combatPower,
    casualties: commitment.wounded + commitment.killed,
    wounded: commitment.wounded,
    killed: commitment.killed,
    doctrine: squad?.doctrine ?? DEFAULT_SQUAD_DOCTRINE,
  };
  ret.operationHistory = [record, ...(ret.operationHistory ?? [])].slice(0, 30);
  ret.activeOperation = null;

  const outcome = active.resolution.success ? "SUCCESS" : "FAILURE";
  entries.push({
    label: `Squad Operation ${outcome}`,
    delta: active.resolution.success ? 1 : 0,
    unit: "operations",
    reason: `${record.operationName} — ${active.squadName}; ${commitment.wounded} wounded, ${commitment.killed} KIA`,
    severity: active.resolution.success ? "positive" : "negative",
  });
  if (s.gameDate) {
    const message: GameMessage = {
      id: `${active.id}-complete`,
      timestamp: { ...s.gameDate },
      tick: s.totalTicks,
      category: "mission",
      title: `${record.operationName}: ${outcome}`,
      body: `${active.squadName} returned from ${record.operationName}. ${commitment.wounded} wounded, ${commitment.killed} KIA. ${active.resolution.success ? "The objective was secured." : "The objective was not secured."}`,
      read: false,
      priority: active.resolution.success ? "normal" : "high",
    };
    s.messages = [message, ...(s.messages ?? [])].slice(0, 200);
  }
}

/**
 * Resolve a squad-backed operation using the same doctrine values shown in
 * the squad dossier.
 *
 * This is intentionally pure: callers can use it for a launch preview or
 * apply the returned result when their deployment flow resolves. `random`
 * returns a value in [0, 1), which keeps deterministic engine tests
 * independent of the global RNG.
 */
export function resolveSquadDeployment(
  s: GameState,
  squadId: string,
  spec: SquadDeploymentSpec,
  random: () => number = Math.random,
): SquadDeploymentResolution | null {
  const squad = s.retinue?.squads.find(sq => sq.id === squadId);
  if (!squad) return null;

  const ret = s.retinue;
  const readyTroopCount = squad.troopIds.filter(troopId => (
    ret?.troops.some(troop => troop.id === troopId && troop.status === "ready")
  )).length;
  const combatPower = getSquadCombatPower(s, squadId);
  const doctrineModifiers = getSquadDoctrineModifiers(s, squadId);
  const duration = Math.max(1, Math.ceil(Math.max(1, spec.duration) / doctrineModifiers.operationSpeedMultiplier));
  const difficulty = Math.max(0, Math.min(100, spec.difficulty));
  const successChance = Math.max(5, Math.min(95, Math.round(50 + (combatPower - difficulty) * 0.5)));
  const success = random() * 100 < successChance;
  const casualtyRate = Math.max(0, Math.min(1, spec.casualtyRate));
  // A successful operation still costs people, but a failed operation
  // exposes the full projected casualty rate. Doctrine risk remains the
  // mission-facing multiplier in both cases.
  const casualtyExposure = success ? 0.5 : 1;
  const casualties = Math.min(
    readyTroopCount,
    Math.max(0, Math.round(
      readyTroopCount * casualtyRate * doctrineModifiers.casualtyRiskMultiplier * casualtyExposure,
    )),
  );

  return {
    squadId,
    success,
    duration,
    casualties,
    successChance,
    combatPower,
    readyTroopCount,
    doctrineModifiers,
  };
}

export function getRetinueSummary(s: GameState) {
  const ret = s.retinue ?? createDefaultRetinueState();
  const activeTroops = ret.troops.filter(t => t.status !== "kia").length;
  const activeSquads = ret.squads.length;
  const activeCaptains = ret.captains.filter(c => c.status !== "kia").length;
  const training = ret.trainingQueue.length;
  let totalPower = 0;
  for (const sq of ret.squads) totalPower += getSquadCombatPower(s, sq.id);
  return { activeTroops, activeSquads, activeCaptains, training, totalPower, totalKills: ret.totalKills, totalCasualties: ret.totalCasualties };
}
