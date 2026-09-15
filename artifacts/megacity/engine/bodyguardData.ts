export type BodyguardOrigin = "promoted" | "recruited" | "cloned";

export type BodyguardClass =
  | "personal_guard"
  | "shadow_agent"
  | "combat_specialist"
  | "cyber_sentinel"
  | "clone_double"
  | "netrunner"
  | "marksman"
  | "inquisitor"
  | "wasteland_scout";

export type BodyguardAbility = {
  id: string;
  name: string;
  description: string;
  effects: Partial<{
    defenseRating: number;
    assassination_protection: number;
    intel_bonus: number;
    unrest: number;
    corruption: number;
    xpBonus: number;
    credits: number;
    combat: number;
  }>;
};

export type BodyguardDef = {
  classId: BodyguardClass;
  name: string;
  title: string;
  description: string;
  origin: BodyguardOrigin;
  baseCombat: number;
  baseLoyalty: number;
  recruitCost: number;
  unitKey?: string;
  unitCost?: number;
  requiredTech?: string;
  requiredLevel?: number;
  abilities: BodyguardAbility[];
};

export type Bodyguard = {
  id: string;
  classId: BodyguardClass;
  customName: string;
  origin: BodyguardOrigin;
  combat: number;
  loyalty: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  missionsCompleted: number;
  assignedTick: number;
  status: "active" | "injured" | "kia" | "deployed";
  unlockedAbilities: string[];
  injuredAtTick?: number;
  // Topic ids the player has already been rewarded for in retinue dialogue with
  // THIS guard. Re-opening a used topic still shows the dialogue text but grants
  // no effects, so dialogue can't be farmed for infinite XP/loyalty/credits.
  usedDialogueTopics?: string[];
};

export type BodyguardState = {
  roster: Bodyguard[];
  maxSlots: number;
  totalKills: number;
  bodyguardsLost: number;
};

export const MAX_BODYGUARD_SLOTS = 6;

export const CLASS_LABELS: Record<BodyguardClass, string> = {
  personal_guard: "PERSONAL GUARD",
  shadow_agent: "SHADOW AGENT",
  combat_specialist: "COMBAT SPECIALIST",
  cyber_sentinel: "CYBER-SENTINEL",
  clone_double: "CLONE DOUBLE",
  netrunner: "NETRUNNER",
  marksman: "MARKSMAN",
  inquisitor: "INQUISITOR",
  wasteland_scout: "WASTELAND SCOUT",
};

export const CLASS_ICONS: Record<BodyguardClass, string> = {
  personal_guard: "shield-account",
  shadow_agent: "ninja",
  combat_specialist: "pistol",
  cyber_sentinel: "robot",
  clone_double: "content-copy",
  netrunner: "lan-connect",
  marksman: "crosshairs",
  inquisitor: "gavel",
  wasteland_scout: "compass",
};

export const BODYGUARD_DEFS: BodyguardDef[] = [
  {
    classId: "personal_guard",
    name: "PERSONAL GUARD",
    title: "Close Protection Operative",
    description: "Promoted from the patrol judges or riot squads. They know the streets, they know the threats, and they'll take a bullet for you. Literally. That's in the contract.",
    origin: "promoted",
    baseCombat: 55,
    baseLoyalty: 70,
    recruitCost: 25000,
    unitKey: "patrolJudges",
    unitCost: 5,
    abilities: [
      { id: "pg_shield_wall", name: "SHIELD WALL", description: "Close protection reduces assassination risk by 15%", effects: { assassination_protection: 15 } },
      { id: "pg_crowd_read", name: "CROWD READING", description: "Spots threats in public. -2 unrest from commander appearances", effects: { unrest: -2 } },
      { id: "pg_loyalty_core", name: "LOYALTY UNTO DEATH", description: "Fanatical dedication. +1 defense from visible security presence", effects: { defenseRating: 1 } },
    ],
  },
  {
    classId: "shadow_agent",
    name: "SHADOW AGENT",
    title: "Covert Operative",
    description: "Nobody knows their real name. Nobody knows where they came from. They move through the city like smoke, gathering intelligence and removing threats before you even know they existed.",
    origin: "recruited",
    baseCombat: 65,
    baseLoyalty: 50,
    recruitCost: 75000,
    requiredLevel: 5,
    abilities: [
      { id: "sa_intel_net", name: "SHADOW NETWORK", description: "Passive intelligence feed. +5 intel bonus per tick", effects: { intel_bonus: 5 } },
      { id: "sa_counter_assassin", name: "COUNTER-ASSASSINATION", description: "Preemptive threat neutralization. +25% assassination protection", effects: { assassination_protection: 25 } },
      { id: "sa_whisper_campaign", name: "WHISPER CAMPAIGN", description: "Undermines your enemies. -3 corruption from exposed schemes", effects: { corruption: -3 } },
    ],
  },
  {
    classId: "combat_specialist",
    name: "COMBAT SPECIALIST",
    title: "Heavy Weapons Operative",
    description: "When the Personal Guard is not enough. When the Shadow Agent can't stay hidden. When you need someone who solves problems with extreme prejudice and a rotary cannon.",
    origin: "promoted",
    baseCombat: 85,
    baseLoyalty: 60,
    recruitCost: 50000,
    unitKey: "heavyAssaultSquads",
    unitCost: 3,
    requiredLevel: 3,
    abilities: [
      { id: "cs_heavy_arms", name: "HEAVY ARMAMENT", description: "Carries weapons that discourage conversation. +2 defense", effects: { defenseRating: 2 } },
      { id: "cs_breach_clear", name: "BREACH & CLEAR", description: "Room-clearing specialist. +10 combat effectiveness", effects: { combat: 10 } },
      { id: "cs_deterrence", name: "WALKING DETERRENT", description: "Nobody starts trouble when this one's around. -3 unrest", effects: { unrest: -3 } },
    ],
  },
  {
    classId: "cyber_sentinel",
    name: "CYBER-SENTINEL",
    title: "Augmented Security Unit",
    description: "More machine than human. Neural implants for threat detection, reinforced skeleton, synthetic muscle fibre, and reflexes that operate at the speed of electricity. The last thing most assassins see.",
    origin: "recruited",
    baseCombat: 90,
    baseLoyalty: 75,
    recruitCost: 150000,
    requiredTech: "basic_cybernetics",
    requiredLevel: 7,
    abilities: [
      { id: "cy_threat_matrix", name: "THREAT MATRIX", description: "Neural implants scan 360 degrees. +30% assassination protection", effects: { assassination_protection: 30 } },
      { id: "cy_reflex_override", name: "REFLEX OVERRIDE", description: "Synthetic reflexes engage faster than thought. +3 defense", effects: { defenseRating: 3 } },
      { id: "cy_data_harvest", name: "DATA HARVEST", description: "Passive surveillance. +10 intel, -2 corruption", effects: { intel_bonus: 10, corruption: -2 } },
    ],
  },
  {
    classId: "clone_double",
    name: "CLONE DOUBLE",
    title: "Genetic Replica",
    description: "Your face. Your voice. Your DNA. A perfect copy grown in a vat and accelerated to maturity in six weeks. It thinks it's you. It isn't. But the assassins don't know that. The decoy that bleeds so you don't have to.",
    origin: "cloned",
    baseCombat: 40,
    baseLoyalty: 95,
    recruitCost: 500000,
    requiredTech: "commander_cloning_protocol",
    requiredLevel: 10,
    abilities: [
      { id: "cd_decoy", name: "DECOY PROTOCOL", description: "Public appearances without risk. +40% assassination protection", effects: { assassination_protection: 40 } },
      { id: "cd_double_duty", name: "DOUBLE DUTY", description: "Attends meetings you can't. +500 credits/tick from delegation", effects: { credits: 500 } },
      { id: "cd_existential", name: "EXISTENTIAL DETERRENT", description: "Kill you once, another walks out. -5 unrest from fear of immortality", effects: { unrest: -5 } },
    ],
  },
  {
    classId: "netrunner",
    name: "NETRUNNER",
    title: "Signal Operative",
    description: "Lives in the wires. Sleeps in datacenters. Their body is a delivery system for a brain that hasn't seen daylight in two years. Hostile networks unfold in front of them like origami. So do hostile bank accounts.",
    origin: "recruited",
    baseCombat: 35,
    baseLoyalty: 50,
    recruitCost: 90000,
    requiredTech: "neural_interface_basics",
    requiredLevel: 6,
    abilities: [
      { id: "nr_signal_sweep", name: "SIGNAL SWEEP", description: "Live spectrum monitoring. +10 intel bonus per tick", effects: { intel_bonus: 10 } },
      { id: "nr_firewall", name: "FIREWALL PROTOCOL", description: "Intercepts digital threats before they reach you. +8% assassination protection", effects: { assassination_protection: 8 } },
      { id: "nr_data_extortion", name: "DATA EXTORTION", description: "Sells what powerful people don't want public. +150 credits/tick", effects: { credits: 150 } },
    ],
  },
  {
    classId: "marksman",
    name: "MARKSMAN",
    title: "Overwatch Specialist",
    description: "Sees the threat eight hundred metres before the threat sees them. Doesn't blink. Doesn't breathe at the wrong moment. The bullet is already in flight before the target finishes the wrong sentence.",
    origin: "promoted",
    baseCombat: 75,
    baseLoyalty: 65,
    recruitCost: 60000,
    requiredLevel: 4,
    abilities: [
      { id: "mk_range_zero", name: "RANGE ZERO", description: "Long-range engagement specialist. +12 combat effectiveness", effects: { combat: 12 } },
      { id: "mk_kill_box", name: "KILL BOX", description: "Pre-cleared firing solutions cover every approach. +20% assassination protection", effects: { assassination_protection: 20 } },
      { id: "mk_ghost_shot", name: "GHOST SHOT", description: "Quiet removal of compromising assets. -2 corruption", effects: { corruption: -2 } },
    ],
  },
  {
    classId: "inquisitor",
    name: "INQUISITOR",
    title: "Internal Affairs Operative",
    description: "Promoted from the disciplinary courts. Thinks treason is a personal insult. Their interrogation rooms have a return rate of zero. Their loyalty is to the office, not the officeholder. Useful — until you become the case file.",
    origin: "promoted",
    baseCombat: 60,
    baseLoyalty: 80,
    recruitCost: 40000,
    requiredLevel: 5,
    abilities: [
      { id: "iq_tribunal", name: "TRIBUNAL", description: "Drags corrupt officials into the light. -6 corruption", effects: { corruption: -6 } },
      { id: "iq_fear_the_chair", name: "FEAR THE CHAIR", description: "The threat of investigation keeps the rank-and-file quiet. -2 unrest", effects: { unrest: -2 } },
      { id: "iq_loyal_cadre", name: "LOYAL CADRE", description: "Clean staff close ranks around the principal. +1 defense", effects: { defenseRating: 1 } },
    ],
  },
  {
    classId: "wasteland_scout",
    name: "WASTELAND SCOUT",
    title: "Forward Reconnaissance",
    description: "Born outside the wall. Knows which dust clouds are weather and which are inbound. Sleeps with one eye on the horizon and a pistol on the other. Brings back intel, brings back salvage, brings back warnings the city would rather not hear.",
    origin: "recruited",
    baseCombat: 50,
    baseLoyalty: 55,
    recruitCost: 30000,
    requiredTech: "wasteland_cartography",
    requiredLevel: 2,
    abilities: [
      { id: "ws_forward_intel", name: "FORWARD INTEL", description: "Eyes outside the perimeter. +8 intel bonus per tick", effects: { intel_bonus: 8 } },
      { id: "ws_hard_target", name: "HARD TARGET", description: "Reads ambushes before they spring. +1 defense", effects: { defenseRating: 1 } },
      { id: "ws_cache_finder", name: "CACHE FINDER", description: "Pre-war stash recovery. +200 credits/tick", effects: { credits: 200 } },
    ],
  },
];

export const BODYGUARD_DEFS_MAP: Record<string, BodyguardDef> = {};
for (const d of BODYGUARD_DEFS) BODYGUARD_DEFS_MAP[d.classId] = d;

export const BODYGUARD_XP_TABLE = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];

export function xpForBodyguardLevel(level: number): number {
  if (level < 1) return 0;
  if (level >= BODYGUARD_XP_TABLE.length) return BODYGUARD_XP_TABLE[BODYGUARD_XP_TABLE.length - 1] + (level - BODYGUARD_XP_TABLE.length + 1) * 1500;
  return BODYGUARD_XP_TABLE[level];
}

export function createDefaultBodyguardState(): BodyguardState {
  return {
    roster: [],
    maxSlots: MAX_BODYGUARD_SLOTS,
    totalKills: 0,
    bodyguardsLost: 0,
  };
}

export function getBodyguardEffects(roster: Bodyguard[]): Record<string, number> {
  const effects: Record<string, number> = {};
  for (const bg of roster) {
    if (bg.status !== "active") continue;
    const def = BODYGUARD_DEFS.find((d) => d.classId === bg.classId);
    if (!def) continue;
    for (const ability of def.abilities) {
      if (!bg.unlockedAbilities.includes(ability.id)) continue;
      for (const [key, val] of Object.entries(ability.effects)) {
        effects[key] = (effects[key] ?? 0) + (val as number);
      }
    }
  }
  return effects;
}

const GUARD_NAMES_MALE = [
  "Kade Voss", "Renn Ashford", "Dax Korrin", "Talon Mercer", "Brutus Kane",
  "Corvus Hale", "Grimm Aldric", "Silas Cross", "Viktor Raze", "Kellan Dyre",
  "Orin Slade", "Magnus Thorne", "Cassius Wren", "Lucius Bane", "Dorian Flint",
];

const GUARD_NAMES_FEMALE = [
  "Sera Vane", "Kira Ashcroft", "Nova Sterling", "Raven Holt", "Mira Dorn",
  "Thessa Korr", "Lyra Steele", "Vex Halloway", "Zara Grimm", "Petra Cade",
  "Sable Cross", "Freya Volt", "Ember Kael", "Nyx Aldren", "Juno Vex",
];

export function generateBodyguardName(): string {
  const pool = Math.random() < 0.5 ? GUARD_NAMES_MALE : GUARD_NAMES_FEMALE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function createBodyguard(
  classId: BodyguardClass,
  totalTicks: number,
  customName?: string
): Bodyguard {
  const def = BODYGUARD_DEFS.find((d) => d.classId === classId)!;
  const name = customName ?? generateBodyguardName();
  return {
    id: `bg_${classId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    classId,
    customName: classId === "clone_double" ? "CLONE — " + name : name,
    origin: def.origin,
    combat: def.baseCombat + Math.floor(Math.random() * 10) - 5,
    loyalty: def.baseLoyalty + Math.floor(Math.random() * 10) - 5,
    level: 1,
    xp: 0,
    xpToNext: xpForBodyguardLevel(1),
    kills: 0,
    missionsCompleted: 0,
    assignedTick: totalTicks,
    status: "active",
    unlockedAbilities: [def.abilities[0].id],
  };
}
