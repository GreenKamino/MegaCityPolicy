import type { GameState, TickEntry, ScavengeExpedition, Resources } from "@/engine/types";
import type { ScavengeZoneType } from "@/engine/scavengingData";
import { SCAVENGE_ZONES } from "@/engine/scavengingData";
import { ITEM_DEFS, type ItemRarity } from "@/engine/inventoryData";
import { addItemToInventory } from "@/engine/retinue";
import { createDefaultRetinueState, getClassDef, type TroopClassId } from "@/engine/retinueData";
import { recruitTroop } from "@/engine/retinue";
import { getUndiscoveredLore, rollLoreRarity, LORE_ZONE_WEIGHTS, type LoreEntry } from "@/engine/loreData";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { applyResourceDelta } from "@/engine/resourceStorage";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function entry(label: string, delta: number, unit: string, reason: string, severity: TickEntry["severity"]): TickEntry {
  return { label, delta, unit, reason, severity };
}

const LOOT_TO_RESOURCE: Record<string, keyof Resources> = {
  credits: "credits",
  food: "food",
  water: "water",
  steel: "steel",
  goods: "goods",
  fuel: "fuel",
  medSupplies: "medSupplies",
  ammo: "ammo",
  scrap: "steel",
  copper: "steel",
  power: "power",
};

const LOOT_BASE_AMOUNTS: Record<string, [number, number]> = {
  credits: [200, 800],
  food: [30, 150],
  water: [20, 100],
  steel: [40, 200],
  goods: [20, 120],
  fuel: [15, 80],
  medSupplies: [10, 60],
  ammo: [20, 100],
  scrap: [30, 150],
  copper: [20, 80],
  power: [10, 50],
};

type ZoneItemPool = {
  items: string[];
  rarityWeights: Record<ItemRarity, number>;
  dropChance: number;
  maxDrops: number;
};

const ZONE_TYPE_ITEM_POOLS: Record<ScavengeZoneType, ZoneItemPool> = {
  ruins: {
    items: ["old_world_badge", "corpo_dataslate", "flak_vest", "scrap_armor_plate", "med_kit_advanced", "combat_knife", "scrap_blade", "salvaged_pistol", "wasteland_trophy", "bandolier", "cracked_holotape", "prewar_currency_bundle", "corporate_id_lanyard", "municipal_seal_plaque", "mc_steam_data_disk", "judiciar_seal"],
    rarityWeights: { common: 50, uncommon: 33, rare: 11, epic: 3, legendary: 3 },
    dropChance: 0.45,
    maxDrops: 2,
  },
  wasteland: {
    items: ["scrap_armor_plate", "berserker_stim", "combat_knife", "flak_vest", "recon_drone", "scrap_blade", "salvaged_pistol", "combat_stims", "bandolier", "wasteland_trophy", "cracked_holotape", "prewar_currency_bundle", "intact_globe_model", "warsim_data_disk", "prowler_carbine"],
    rarityWeights: { common: 55, uncommon: 28, rare: 11, epic: 3, legendary: 3 },
    dropChance: 0.35,
    maxDrops: 2,
  },
  underhive: {
    items: ["combat_knife", "assault_rifle_mk2", "berserker_stim", "flak_vest", "tactical_visor", "synth_adrenaline_injector", "shock_baton", "scatter_carbine", "combat_stims", "signal_jammer", "mc_steam_data_disk", "warsim_data_disk", "prewar_research_journal", "synaptic_processor"],
    rarityWeights: { common: 40, uncommon: 38, rare: 13, epic: 4, legendary: 5 },
    dropChance: 0.50,
    maxDrops: 2,
  },
  industrial: {
    items: ["scrap_armor_plate", "flak_vest", "riot_armor", "tactical_visor", "recon_drone", "corpo_dataslate", "ablative_plating", "demo_charges", "sniper_scope", "auto_turret", "corporate_id_lanyard", "prewar_research_journal", "vintage_service_pistol", "command_uplink", "adaptive_carapace"],
    rarityWeights: { common: 45, uncommon: 33, rare: 13, epic: 4, legendary: 5 },
    dropChance: 0.40,
    maxDrops: 2,
  },
  military: {
    items: ["assault_rifle_mk2", "riot_armor", "nano_weave_suit", "plasma_carbine", "command_baton", "med_kit_advanced", "thunderhammer", "heavy_machine_gun", "railgun_pistol", "wardens_cloak", "executioner_blade", "emp_grenade", "demo_charges", "vintage_service_pistol", "astronauts_patch", "vault_master_key", "prowler_carbine", "adaptive_carapace", "command_uplink"],
    rarityWeights: { common: 30, uncommon: 33, rare: 22, epic: 5, legendary: 10 },
    dropChance: 0.55,
    maxDrops: 3,
  },
  anomaly: {
    items: ["neural_link", "cortical_stack", "synth_adrenaline_injector", "plasma_carbine", "juggernaut_exo", "sector_founders_ring", "nano_weave_suit", "reflex_enhancer", "targeting_optics", "pre_war_data_core", "holo_projector", "grav_boots", "titan_plate", "stealth_suit", "archive_key_terminal", "vault_master_key", "prewar_research_journal", "synaptic_processor", "judiciar_seal"],
    rarityWeights: { common: 13, uncommon: 22, rare: 28, epic: 12, legendary: 25 },
    dropChance: 0.60,
    maxDrops: 3,
  },
};

const ZONE_TYPE_TROOP_POOLS: Partial<Record<ScavengeZoneType, { chance: number; classes: TroopClassId[] }>> = {
  underhive: { chance: 0.20, classes: ["infantry", "shocktrooper", "scout", "breacher"] },
  military: { chance: 0.25, classes: ["infantry", "marksman", "heavy_gunner", "engineer", "demolisher", "war_medic"] },
  wasteland: { chance: 0.10, classes: ["scout", "infantry", "dragoon"] },
  anomaly: { chance: 0.15, classes: ["cyber_operative", "engineer", "dragoon"] },
};

const PHASE_LOOT_MULT: Record<string, number> = {
  scout: 0.5,
  scavenge: 1.0,
  excavate: 1.8,
  reclaim: 2.5,
};

function rollRarity(weights: Record<ItemRarity, number>, dangerBonus: number): ItemRarity {
  const adjusted: Record<ItemRarity, number> = {
    common: Math.max(5, weights.common - dangerBonus * 0.3),
    uncommon: weights.uncommon + dangerBonus * 0.1,
    rare: weights.rare + dangerBonus * 0.12,
    epic: weights.epic + dangerBonus * 0.07,
    legendary: weights.legendary + dangerBonus * 0.08,
  };
  const total = adjusted.common + adjusted.uncommon + adjusted.rare + adjusted.epic + adjusted.legendary;
  const roll = Math.random() * total;
  let acc = 0;
  for (const r of ["common", "uncommon", "rare", "epic", "legendary"] as ItemRarity[]) {
    acc += adjusted[r];
    if (roll < acc) return r;
  }
  return "common";
}

function getInfraBonus(s: GameState, infraId: string): boolean {
  return (s.scavengingInfrastructure ?? []).includes(infraId);
}

export interface ExpeditionRewardResult {
  resources: Partial<Record<keyof Resources, number>>;
  items: { defId: string; name: string; rarity: string }[];
  troops: { classId: string; className: string }[];
  techDiscovery: string | null;
  loreDiscovery: { id: string; title: string; rarity: string } | null;
}

export function generateScavengeRewards(
  s: GameState,
  exp: ScavengeExpedition,
): ExpeditionRewardResult {
  const zone = SCAVENGE_ZONES.find(z => z.name === exp.zoneName);
  const zoneType: ScavengeZoneType = zone?.type ?? "ruins";
  const possibleLoot = zone?.possibleLoot ?? ["credits", "steel"];
  const dangerLevel = exp.dangerLevel;
  const phaseMult = PHASE_LOOT_MULT[exp.type] ?? 1.0;

  const hasScoutOutpost = getInfraBonus(s, "scout_outpost");
  const hasSalvageYard = getInfraBonus(s, "salvage_yard");
  const qualityMult = hasSalvageYard ? 1.15 : 1.0;
  const discoveryMult = hasScoutOutpost ? 1.20 : 1.0;

  const result: ExpeditionRewardResult = {
    resources: {},
    items: [],
    troops: [],
    techDiscovery: null,
    loreDiscovery: null,
  };

  for (const lootKey of possibleLoot) {
    const resKey = LOOT_TO_RESOURCE[lootKey];
    if (resKey) {
      const [minAmt, maxAmt] = LOOT_BASE_AMOUNTS[lootKey] ?? [50, 200];
      const base = minAmt + Math.random() * (maxAmt - minAmt);
      const dangerMult = 1 + dangerLevel * 0.01;
      const amount = Math.floor(base * phaseMult * dangerMult * qualityMult);
      result.resources[resKey] = (result.resources[resKey] ?? 0) + amount;
    }
  }

  const specialLoot = possibleLoot.filter(l => !LOOT_TO_RESOURCE[l]);
  for (const sp of specialLoot) {
    if (sp === "weapons" || sp === "intel" || sp === "contraband" || sp === "tech" ||
        sp === "artifacts" || sp === "alien_tech" || sp === "biosamples" ||
        sp === "anomalous_material" || sp === "machinery" || sp === "missiles" ||
        sp === "vehicles" || sp === "uranium" || sp === "titanium" || sp === "rare-earth") {
      const creditValue = Math.floor((100 + Math.random() * 400) * phaseMult * (1 + dangerLevel * 0.015));
      result.resources.credits = (result.resources.credits ?? 0) + creditValue;

      if (sp === "tech" || sp === "alien_tech" || sp === "artifacts") {
        if (Math.random() < 0.25 * discoveryMult) {
          result.techDiscovery = sp === "alien_tech"
            ? "Alien technology fragment analyzed"
            : sp === "artifacts"
            ? "Pre-war artifact catalogued"
            : "Technical schematics recovered";
        }
      }
    }
  }

  const itemPool = ZONE_TYPE_ITEM_POOLS[zoneType];
  const adjustedDropChance = itemPool.dropChance * discoveryMult;
  if (Math.random() < adjustedDropChance) {
    const numDrops = 1 + Math.floor(Math.random() * itemPool.maxDrops);
    for (let i = 0; i < numDrops; i++) {
      const targetRarity = rollRarity(itemPool.rarityWeights, dangerLevel);
      const eligible = itemPool.items
        .map(id => ITEM_DEFS.find(d => d.id === id))
        .filter((d): d is NonNullable<typeof d> => d != null && d.rarity === targetRarity);

      if (eligible.length === 0) {
        const fallback = itemPool.items
          .map(id => ITEM_DEFS.find(d => d.id === id))
          .filter((d): d is NonNullable<typeof d> => d != null);
        if (fallback.length > 0) {
          const pick = fallback[Math.floor(Math.random() * fallback.length)];
          const addResult = addItemToInventory(s, pick.id);
          if (addResult.success) {
            result.items.push({ defId: pick.id, name: pick.name, rarity: pick.rarity });
          }
        }
      } else {
        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        const addResult = addItemToInventory(s, pick.id);
        if (addResult.success) {
          result.items.push({ defId: pick.id, name: pick.name, rarity: pick.rarity });
        }
      }
    }
  }

  const troopPool = ZONE_TYPE_TROOP_POOLS[zoneType];
  if (troopPool && Math.random() < troopPool.chance) {
    const classId = troopPool.classes[Math.floor(Math.random() * troopPool.classes.length)];
    if (!s.retinue) s.retinue = createDefaultRetinueState();
    const savedCredits = s.resources.credits;
    const result2 = recruitTroop(s, classId);
    s.resources.credits = savedCredits;
    if (result2.success && result2.troop) {
      const def = getClassDef(classId);
      result.troops.push({ classId, className: def?.name ?? classId });
    }
  }

  const loreBaseChance = LORE_ZONE_WEIGHTS[zoneType] ?? 0.10;
  const loreChance = loreBaseChance * discoveryMult * phaseMult;
  if (Math.random() < loreChance) {
    const discovered = s.discoveredLore ?? [];
    const available = getUndiscoveredLore(discovered, zoneType);
    if (available.length > 0) {
      const targetRarity = rollLoreRarity(dangerLevel);
      const rarityMatch = available.filter((e) => e.rarity === targetRarity);
      const pool = rarityMatch.length > 0 ? rarityMatch : available;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!s.discoveredLore) s.discoveredLore = [];
      s.discoveredLore.push(pick.id);
      result.loreDiscovery = { id: pick.id, title: pick.title, rarity: pick.rarity };
    }
  }

  return result;
}

export function applyRewardResources(s: GameState, rewards: ExpeditionRewardResult): void {
  for (const [key, amount] of Object.entries(rewards.resources)) {
    if (amount && key in s.resources) {
      applyResourceDelta(s, key as keyof Resources, amount);
      if (key === "credits") recordCreditsEarned(s, amount);
    }
  }
}

export function processScavengeExpeditions(s: GameState, entries: TickEntry[]): void {
  const exps = s.scavengeExpeditions;
  if (!exps || exps.length === 0) return;

  const hasFieldHospital = getInfraBonus(s, "field_hospital");

  for (const exp of exps) {
    if (exp.status !== "active") continue;
    exp.ticksRemaining--;

    if (exp.ticksRemaining <= 0) {
      const defenseMod = Math.floor((s.cityStats?.defenseRating ?? 0) * 0.15);
      const successChance = clamp(80 - exp.dangerLevel + defenseMod, 15, 95);
      const roll = Math.random() * 100;

      if (roll < successChance) {
        exp.status = "completed";
        const rewards = generateScavengeRewards(s, exp);

        for (const [key, amount] of Object.entries(rewards.resources)) {
          if (amount) {
            exp.loot[key] = (exp.loot[key] ?? 0) + amount;
          }
        }
        if (rewards.items.length > 0) {
          exp.loot["_items"] = rewards.items.length;
        }
        if (rewards.troops.length > 0) {
          exp.loot["_recruits"] = rewards.troops.length;
        }

        applyRewardResources(s, rewards);

        const lootSummary = Object.entries(rewards.resources)
          .filter(([k, v]) => v && v > 0 && !k.startsWith("_"))
          .map(([k, v]) => `+${v} ${k}`)
          .join(", ");
        const itemSummary = rewards.items.length > 0
          ? ` Items: ${rewards.items.map(i => `${i.name} [${i.rarity.toUpperCase()}]`).join(", ")}.`
          : "";
        const troopSummary = rewards.troops.length > 0
          ? ` Recruited: ${rewards.troops.map(t => t.className).join(", ")}.`
          : "";
        const techSummary = rewards.techDiscovery ? ` Discovery: ${rewards.techDiscovery}.` : "";
        const loreSummary = rewards.loreDiscovery ? ` LORE: ${rewards.loreDiscovery.title} [${rewards.loreDiscovery.rarity.toUpperCase()}]` : "";

        entries.push(entry(
          "Scavenge Success",
          rewards.resources.credits ?? 0,
          "credits",
          `${exp.name} returned. ${lootSummary}.${itemSummary}${troopSummary}${techSummary}${loreSummary}`,
          "positive",
        ));
      } else if (roll < successChance + 35) {
        exp.status = "failed";
        const casualties = hasFieldHospital
          ? Math.floor(exp.teamSize * 0.15)
          : Math.floor(exp.teamSize * 0.3);
        entries.push(entry(
          "Scavenge Failed",
          -casualties,
          "personnel",
          `${exp.name} encountered heavy resistance. ${casualties} casualties.`,
          "negative",
        ));
      } else {
        exp.status = "failed";
        entries.push(entry(
          "SCAVENGE TEAM LOST",
          -exp.teamSize,
          "personnel",
          `${exp.name} failed to return. All ${exp.teamSize} personnel presumed dead.`,
          "negative",
        ));
      }
    }
  }

  s.scavengeExpeditions = exps.filter(e => e.status === "active" || e.ticksRemaining > -40);
}
