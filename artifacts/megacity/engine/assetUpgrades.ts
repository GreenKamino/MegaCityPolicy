import { itemDisplayName, techDisplayName } from "@/engine/displayNames";
import type { GameState } from "@/engine/types";

export type AssetUpgradeTarget = "unit" | "captain" | "follower";

export interface AssetUpgradeItemReq {
  itemDefId: string;
  count: number;
}

export interface AssetUpgradeReqs {
  techIds: string[];
  items: AssetUpgradeItemReq[];
  credits: number;
}

export interface AssetUpgradeDef {
  id: string;
  name: string;
  description: string;
  target: AssetUpgradeTarget;
  unitClassId?: string;
  followerRoles?: string[];
  reqs: AssetUpgradeReqs;
  effectSummary: string;
  unitMultiplier?: number;
  captainBonus?: { leadership?: number; combat?: number; tactics?: number };
  notorietyBonus?: number;
  oncePerTarget: boolean;
  maxTier?: number;
}

export const ASSET_UPGRADES: AssetUpgradeDef[] = [
  {
    id: "infantry_ballistic_refit",
    name: "Ballistic Plating Refit",
    description: "Hardened armor plating retrofitted onto every standing infantry rifle. Boosts effective unit count by absorbing wash-out casualties.",
    target: "unit",
    unitClassId: "cityDefenseInfantry",
    reqs: {
      techIds: ["tactical_exoskeleton_armor"],
      items: [{ itemDefId: "flak_vest", count: 2 }],
      credits: 5000,
    },
    effectSummary: "+20% City Defense Infantry count and +20% per-soldier strength per tier (max 3 tiers)",
    unitMultiplier: 1.2,
    oncePerTarget: false,
    maxTier: 3,
  },
  {
    id: "rapid_response_optics",
    name: "Rapid Response Optic Suite",
    description: "Tactical visors and IFF tagging slashed friendly-fire and triage delays. Effective fielded units climb.",
    target: "unit",
    unitClassId: "rapidResponseUnits",
    reqs: {
      techIds: ["optical_augmentation"],
      items: [{ itemDefId: "tactical_visor", count: 1 }],
      credits: 6000,
    },
    effectSummary: "+20% Rapid Response Unit count and +20% per-soldier strength per tier (max 3 tiers)",
    unitMultiplier: 1.2,
    oncePerTarget: false,
    maxTier: 3,
  },
  {
    id: "mech_frame_overhaul",
    name: "Mech Frame Overhaul",
    description: "Field-stripped exo frames rebuilt with reinforced servos. More mechs return from the line each cycle.",
    target: "unit",
    unitClassId: "heavyRiotMechUnits",
    reqs: {
      techIds: ["combat_augmentation"],
      items: [{ itemDefId: "juggernaut_exo", count: 1 }],
      credits: 15000,
    },
    effectSummary: "+30% Heavy Riot Mech count and +30% per-soldier strength per tier (max 2 tiers)",
    unitMultiplier: 1.3,
    oncePerTarget: false,
    maxTier: 2,
  },
  {
    id: "armored_response_reactive_plating",
    name: "Reactive Plating Refit",
    description: "Adaptive ceramic-composite skirts bolted onto every patrol APC. Shaped charges spend themselves on the outer layer; the crew walks out.",
    target: "unit",
    unitClassId: "armoredResponseUnits",
    reqs: {
      techIds: ["mil_advanced_body_armor"],
      items: [
        { itemDefId: "ablative_plating", count: 2 },
        { itemDefId: "adaptive_carapace", count: 1 },
      ],
      credits: 9000,
    },
    effectSummary: "+25% Armored Response count and +25% per-soldier strength per tier (max 3 tiers)",
    unitMultiplier: 1.25,
    oncePerTarget: false,
    maxTier: 3,
  },
  {
    id: "heavy_weapons_targeting_net",
    name: "Networked Targeting Suite",
    description: "Squad-shared optical fusion. Every spotter feeds every gunner. The first shot lands.",
    target: "unit",
    unitClassId: "heavyWeaponsSquads",
    reqs: {
      techIds: ["sniper_systems"],
      items: [
        { itemDefId: "sniper_scope", count: 1 },
        { itemDefId: "tactical_visor", count: 1 },
      ],
      credits: 11000,
    },
    effectSummary: "+25% Heavy Weapons count and +25% per-soldier strength per tier (max 3 tiers)",
    unitMultiplier: 1.25,
    oncePerTarget: false,
    maxTier: 3,
  },
  {
    id: "tactical_drones_swarm_link",
    name: "Swarm Coordination Mesh",
    description: "Hive-mind firmware update. The drones stop voting and start acting. Effective combat output climbs sharply.",
    target: "unit",
    unitClassId: "tacticalCombatDrones",
    reqs: {
      techIds: ["drone_combat_networks", "tactical_drone_swarms"],
      items: [{ itemDefId: "recon_drone", count: 2 }],
      credits: 12000,
    },
    effectSummary: "+25% Tactical Combat Drone count and +25% per-soldier strength per tier (max 3 tiers)",
    unitMultiplier: 1.25,
    oncePerTarget: false,
    maxTier: 3,
  },
  {
    id: "blackops_silent_insertion",
    name: "Silent Insertion Doctrine",
    description: "Light-bending suits and decoy projectors push the kill team in before anyone files a report. They leave the same way.",
    target: "unit",
    unitClassId: "blackOpsUnits",
    reqs: {
      techIds: ["combat_augmentation", "advanced_neural_links"],
      items: [
        { itemDefId: "stealth_suit", count: 1 },
        { itemDefId: "holo_projector", count: 1 },
      ],
      credits: 18000,
    },
    effectSummary: "+30% Black Ops count and +30% per-soldier strength per tier (max 2 tiers)",
    unitMultiplier: 1.3,
    oncePerTarget: false,
    maxTier: 2,
  },
  {
    id: "patrol_judges_bodycam_net",
    name: "Body Camera Evidence Net",
    description: "Every patrol judge wired into a centralised evidence locker. Convictions stick. So do the patrols.",
    target: "unit",
    unitClassId: "patrolJudges",
    reqs: {
      techIds: ["evidence_analysis_ai"],
      items: [{ itemDefId: "tactical_visor", count: 1 }],
      credits: 4000,
    },
    effectSummary: "+20% Patrol Judge count and +20% per-soldier strength per tier (max 2 tiers)",
    unitMultiplier: 1.2,
    oncePerTarget: false,
    maxTier: 2,
  },
  {
    id: "captain_field_command",
    name: "Field Command Doctrine",
    description: "Selective doctrine drilling. Officer learns to read a contested street the way a surgeon reads a chart.",
    target: "captain",
    reqs: {
      techIds: ["tactical_response_coord_ai"],
      items: [],
      credits: 5000,
    },
    effectSummary: "+5 Leadership",
    captainBonus: { leadership: 5 },
    oncePerTarget: true,
  },
  {
    id: "captain_combat_augment",
    name: "Cybernetic Combat Augment",
    description: "Subdermal weave and cortical reflex stack. The augmentee comes back from surgery sharper, faster, harder to kill.",
    target: "captain",
    reqs: {
      techIds: ["combat_augmentation"],
      items: [
        { itemDefId: "synth_adrenaline_injector", count: 1 },
        { itemDefId: "cortical_stack", count: 1 },
      ],
      credits: 8000,
    },
    effectSummary: "+8 Combat",
    captainBonus: { combat: 8 },
    oncePerTarget: true,
  },
  {
    id: "captain_tactical_simulation",
    name: "Tactical Simulation Suite",
    description: "Neural-link sand table running thousands of urban warfare scenarios. The officer drills until reflex replaces hesitation.",
    target: "captain",
    reqs: {
      techIds: ["advanced_neural_links"],
      items: [{ itemDefId: "neural_link", count: 1 }],
      credits: 7000,
    },
    effectSummary: "+5 Tactics",
    captainBonus: { tactics: 5 },
    oncePerTarget: true,
  },
  {
    id: "captain_logistics_doctrine",
    name: "Field Logistics Mastery",
    description: "Sleepless weeks at the supply depot. The captain comes back knowing where every round, ration, and fuel cell is stored — and how to move them under fire.",
    target: "captain",
    reqs: {
      techIds: ["mil_military_logistics_network"],
      items: [{ itemDefId: "command_baton", count: 1 }],
      credits: 4500,
    },
    effectSummary: "+4 Leadership, +2 Tactics",
    captainBonus: { leadership: 4, tactics: 2 },
    oncePerTarget: true,
  },
  {
    id: "captain_intimidation_doctrine",
    name: "Intimidation Doctrine",
    description: "Authority taught with batons and ledger entries. Subjects yield faster. Witnesses recant. Combat starts with the other side already half-broken.",
    target: "captain",
    reqs: {
      techIds: ["riot_suppression_tech"],
      items: [{ itemDefId: "judiciar_seal", count: 1 }],
      credits: 6000,
    },
    effectSummary: "+6 Combat, +2 Leadership",
    captainBonus: { combat: 6, leadership: 2 },
    oncePerTarget: true,
  },
  {
    id: "captain_urban_warfare",
    name: "Urban Warfare Specialist",
    description: "Drilled in stairwells, alley turns, and rooftop angles until the city itself feels like a weapon. The captain reads a hostile block the way a sniper reads wind.",
    target: "captain",
    reqs: {
      techIds: ["mil_urban_warfare_doctrine"],
      items: [
        { itemDefId: "tactical_visor", count: 1 },
        { itemDefId: "combat_stims", count: 1 },
      ],
      credits: 7500,
    },
    effectSummary: "+5 Combat, +5 Tactics",
    captainBonus: { combat: 5, tactics: 5 },
    oncePerTarget: true,
  },
  {
    id: "captain_command_uplink",
    name: "Battlefield Command Uplink",
    description: "Hardened comms harness wired to every squad in the operating area. Orders move at the speed of thought. So do mistakes.",
    target: "captain",
    reqs: {
      techIds: ["rapid_response_command_ai"],
      items: [
        { itemDefId: "command_uplink", count: 1 },
        { itemDefId: "synaptic_processor", count: 1 },
      ],
      credits: 9000,
    },
    effectSummary: "+6 Leadership, +4 Tactics",
    captainBonus: { leadership: 6, tactics: 4 },
    oncePerTarget: true,
  },
  {
    id: "follower_propaganda_network",
    name: "Propaganda Broadcast Cell",
    description: "Black-channel broadcast cell amplifies the follower's reach across sector airwaves. Notoriety surges.",
    target: "follower",
    followerRoles: ["preacher", "journalist", "celebrity", "agitator"],
    reqs: {
      techIds: ["smart_weapon_ai"],
      items: [],
      credits: 3000,
    },
    effectSummary: "+20 Notoriety",
    notorietyBonus: 20,
    oncePerTarget: true,
  },
  {
    id: "follower_influence_suite",
    name: "Influence Suite",
    description: "Leaked dossiers, ghost-written op-eds, dark-money lobbying. The follower's name surfaces in every backroom conversation.",
    target: "follower",
    followerRoles: ["tycoon", "union_boss"],
    reqs: {
      techIds: [],
      items: [{ itemDefId: "corpo_dataslate", count: 1 }],
      credits: 5000,
    },
    effectSummary: "+20 Notoriety",
    notorietyBonus: 20,
    oncePerTarget: true,
  },
  {
    id: "follower_street_legend",
    name: "Street Legend Status",
    description: "A wasteland trophy paraded through the lower districts. The follower becomes folklore overnight.",
    target: "follower",
    followerRoles: ["gang_lieutenant", "agitator", "fugitive"],
    reqs: {
      techIds: [],
      items: [{ itemDefId: "wasteland_trophy", count: 1 }],
      credits: 4000,
    },
    effectSummary: "+25 Notoriety",
    notorietyBonus: 25,
    oncePerTarget: true,
  },
  {
    id: "follower_intel_network",
    name: "Whisper Network",
    description: "A spider-web of bartenders, dispatchers, and morgue clerks paid in small bills. The follower hears every sector confession before the priest does.",
    target: "follower",
    followerRoles: ["informant"],
    reqs: {
      techIds: ["mil_military_intelligence_ops"],
      items: [{ itemDefId: "corpo_dataslate", count: 1 }],
      credits: 4000,
    },
    effectSummary: "+25 Notoriety",
    notorietyBonus: 25,
    oncePerTarget: true,
  },
  {
    id: "follower_corporate_blackmail",
    name: "Corporate Blackmail Dossier",
    description: "Receipts from off-book quarterly meetings. Forty-seven board members on three subsidiaries now answer the follower's calls personally.",
    target: "follower",
    followerRoles: ["tycoon", "journalist"],
    reqs: {
      techIds: [],
      items: [{ itemDefId: "corpo_dataslate", count: 2 }],
      credits: 6000,
    },
    effectSummary: "+25 Notoriety",
    notorietyBonus: 25,
    oncePerTarget: true,
  },
  {
    id: "follower_underground_pulpit",
    name: "Underground Pulpit",
    description: "Sermons broadcast from a sealed sub-basement chapel that the patrols somehow never find. Converts arrive faster than the heretics can be processed.",
    target: "follower",
    followerRoles: ["preacher", "fugitive"],
    reqs: {
      techIds: [],
      items: [{ itemDefId: "old_world_badge", count: 1 }],
      credits: 3500,
    },
    effectSummary: "+20 Notoriety",
    notorietyBonus: 20,
    oncePerTarget: true,
  },
  {
    id: "follower_strike_apparatus",
    name: "Strike Coordination Apparatus",
    description: "Encrypted handsets, safe-house list, three lawyers on retainer. When the follower calls a walk-out, an entire shift drops tools inside an hour.",
    target: "follower",
    followerRoles: ["union_boss", "agitator"],
    reqs: {
      techIds: ["smart_weapon_ai"],
      items: [{ itemDefId: "command_baton", count: 1 }],
      credits: 5500,
    },
    effectSummary: "+25 Notoriety",
    notorietyBonus: 25,
    oncePerTarget: true,
  },
];

export function getAssetUpgrade(id: string): AssetUpgradeDef | undefined {
  return ASSET_UPGRADES.find((u) => u.id === id);
}

export function getUnitTier(state: GameState, unitClassId: string): number {
  return state.unitUpgradeTiers?.[unitClassId] ?? 0;
}

// Returns the per-soldier combat strength multiplier for a given unit class,
// based on accumulated upgrade tiers. Tier 0 → 1.0 (no bonus). Each tier adds
// (unitMultiplier - 1) additively, sourced from the upgrade definition that
// targets this class. When no matching upgrade definition is found, defaults
// to +20% per tier so future unit upgrades work without a code change here.
export function getUnitClassStrengthMultiplier(state: GameState, unitClassId: string): number {
  const tier = getUnitTier(state, unitClassId);
  if (tier <= 0) return 1;
  const upgrade = ASSET_UPGRADES.find(
    (u) => u.target === "unit" && u.unitClassId === unitClassId && typeof u.unitMultiplier === "number",
  );
  const perTier = upgrade ? (upgrade.unitMultiplier ?? 1) - 1 : 0.2;
  const cappedTier = upgrade?.maxTier ? Math.min(tier, upgrade.maxTier) : tier;
  return 1 + perTier * cappedTier;
}

// Builds a complete map of per-class strength multipliers for every class that
// currently has a non-zero tier. Used by combat strength computations.
export function buildUnitTierMultiplierMap(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  const tiers = state.unitUpgradeTiers;
  if (!tiers) return out;
  for (const classId of Object.keys(tiers)) {
    const m = getUnitClassStrengthMultiplier(state, classId);
    if (m !== 1) out[classId] = m;
  }
  return out;
}

export function captainHasUpgrade(state: GameState, captainId: string, upgradeId: string): boolean {
  const list = state.captainUpgrades?.[captainId];
  return Array.isArray(list) && list.includes(upgradeId);
}

export function followerHasUpgrade(state: GameState, followerId: string, upgradeId: string): boolean {
  const list = state.followerUpgrades?.[followerId];
  return Array.isArray(list) && list.includes(upgradeId);
}

function countItem(state: GameState, defId: string): number {
  const items = state.inventory?.items ?? [];
  let total = 0;
  for (const it of items) {
    if (it.defId === defId) total += it.quantity;
  }
  return total;
}

function consumeItem(state: GameState, defId: string, count: number): void {
  const inv = state.inventory;
  if (!inv || !Array.isArray(inv.items)) return;
  let remaining = count;
  for (let i = 0; i < inv.items.length && remaining > 0; i++) {
    const it = inv.items[i];
    if (it.defId !== defId) continue;
    const take = Math.min(it.quantity, remaining);
    it.quantity -= take;
    remaining -= take;
  }
  inv.items = inv.items.filter((it) => it.quantity > 0);
}

export type ApplyResult = { ok: true } | { ok: false; reason: string };

export function canApplyAssetUpgrade(
  state: GameState,
  upgrade: AssetUpgradeDef,
  targetId: string,
): ApplyResult {
  for (const techId of upgrade.reqs.techIds) {
    if (!(state.unlockedTechnologies ?? []).includes(techId)) {
      return { ok: false, reason: `Requires research: ${techDisplayName(techId)}` };
    }
  }
  for (const req of upgrade.reqs.items) {
    if (countItem(state, req.itemDefId) < req.count) {
      return { ok: false, reason: `Need ${req.count}× ${itemDisplayName(req.itemDefId)}` };
    }
  }
  if ((state.resources?.credits ?? 0) < upgrade.reqs.credits) {
    return { ok: false, reason: `Need ${upgrade.reqs.credits.toLocaleString()} CR` };
  }
  if (upgrade.target === "unit") {
    const classId = upgrade.unitClassId ?? "";
    const tier = getUnitTier(state, classId);
    const max = upgrade.maxTier ?? 1;
    if (tier >= max) return { ok: false, reason: `Max tier (${max}) already applied` };
    if (((state.units ?? {})[classId] ?? 0) <= 0) {
      return { ok: false, reason: "No units of this class deployed" };
    }
  } else if (upgrade.target === "captain") {
    if (upgrade.oncePerTarget && captainHasUpgrade(state, targetId, upgrade.id)) {
      return { ok: false, reason: "Already applied to this captain" };
    }
    const captain = state.retinue?.captains.find((c) => c.id === targetId);
    if (!captain) return { ok: false, reason: "Captain not found" };
    if (captain.status !== "active") return { ok: false, reason: "Captain unavailable" };
  } else if (upgrade.target === "follower") {
    if (upgrade.oncePerTarget && followerHasUpgrade(state, targetId, upgrade.id)) {
      return { ok: false, reason: "Already applied to this follower" };
    }
    const character = (state.namedCharacters ?? []).find((c) => c.id === targetId);
    if (!character) return { ok: false, reason: "Follower not found" };
    if (character.status !== "active") return { ok: false, reason: "Follower unavailable" };
    if (upgrade.followerRoles && !upgrade.followerRoles.includes(character.role)) {
      return { ok: false, reason: "Follower role not eligible" };
    }
  }
  return { ok: true };
}

export function applyAssetUpgrade(
  state: GameState,
  upgrade: AssetUpgradeDef,
  targetId: string,
): ApplyResult {
  const check = canApplyAssetUpgrade(state, upgrade, targetId);
  if (!check.ok) return check;

  if (!state.resources) return { ok: false, reason: "Missing resources state" };
  state.resources.credits = (state.resources.credits ?? 0) - upgrade.reqs.credits;
  for (const req of upgrade.reqs.items) consumeItem(state, req.itemDefId, req.count);

  if (upgrade.target === "unit") {
    const classId = upgrade.unitClassId ?? "";
    if (!state.unitUpgradeTiers) state.unitUpgradeTiers = {};
    state.unitUpgradeTiers[classId] = (state.unitUpgradeTiers[classId] ?? 0) + 1;
    if (!state.units) state.units = {};
    const current = state.units[classId] ?? 0;
    const mult = upgrade.unitMultiplier ?? 1;
    state.units[classId] = Math.max(current, Math.floor(current * mult));
    return { ok: true };
  }

  if (upgrade.target === "captain") {
    const captain = state.retinue?.captains.find((c) => c.id === targetId);
    if (!captain) return { ok: false, reason: "Captain not found" };
    const bonus = upgrade.captainBonus ?? {};
    if (bonus.leadership) captain.leadership += bonus.leadership;
    if (bonus.combat) captain.combat += bonus.combat;
    if (bonus.tactics) captain.tactics += bonus.tactics;
    if (!state.captainUpgrades) state.captainUpgrades = {};
    const list = state.captainUpgrades[targetId] ?? [];
    if (!list.includes(upgrade.id)) list.push(upgrade.id);
    state.captainUpgrades[targetId] = list;
    return { ok: true };
  }

  if (upgrade.target === "follower") {
    const character = (state.namedCharacters ?? []).find((c) => c.id === targetId);
    if (!character) return { ok: false, reason: "Follower not found" };
    character.notoriety = Math.min(100, character.notoriety + (upgrade.notorietyBonus ?? 0));
    if (!state.followerUpgrades) state.followerUpgrades = {};
    const list = state.followerUpgrades[targetId] ?? [];
    if (!list.includes(upgrade.id)) list.push(upgrade.id);
    state.followerUpgrades[targetId] = list;
    return { ok: true };
  }

  return { ok: false, reason: "Unknown upgrade target" };
}
