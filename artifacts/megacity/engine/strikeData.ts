export type AttackTypeId =
  | "troop_assault"
  | "missile_strike"
  | "full_assault"
  | "special_ops"
  | "air_strike"
  | "artillery_barrage"
  | "siege_bombardment"
  | "tarpit_titan_hunt"
  | "ridge_tyrant_hunt"
  | "glassback_whale_hunt";

export type TargetCategoryId =
  | "military"
  | "walls"
  | "fuel_infra"
  | "civilian_infra"
  | "indiscriminate";

export type AttackTypeDef = {
  id: AttackTypeId;
  name: string;
  description: string;
  icon: string;
  creditsCost: number;
  ammoCost: number;
  fuelCost: number;
  minUnits: number;
  baseDamage: number;
  accuracy: number;
  interceptChance: number;
  collateralMod: number;
  durationTicks: number;
  riskToAttacker: number;
};

export type TargetCategoryDef = {
  id: TargetCategoryId;
  name: string;
  description: string;
  icon: string;
  collateralRisk: number;
  civilianCasualties: number;
  diplomaticPenalty: number;
};

export const ATTACK_TYPES: AttackTypeDef[] = [
  {
    id: "troop_assault",
    name: "TROOP ASSAULT",
    description: "Boots on the ground. Bodies in the dirt. Precision measured in coffins.",
    icon: "account-group",
    creditsCost: 5000,
    ammoCost: 150,
    fuelCost: 60,
    minUnits: 20,
    baseDamage: 15,
    accuracy: 0.8,
    interceptChance: 0.1,
    collateralMod: 0.3,
    durationTicks: 2,
    riskToAttacker: 0.15,
  },
  {
    id: "missile_strike",
    name: "MISSILE STRIKE",
    description: "Push the button. Wait two minutes. Hope nothing intercepts.",
    icon: "rocket-launch",
    creditsCost: 12000,
    ammoCost: 300,
    fuelCost: 100,
    minUnits: 0,
    baseDamage: 30,
    accuracy: 0.65,
    interceptChance: 0.35,
    collateralMod: 0.7,
    durationTicks: 1,
    riskToAttacker: 0.02,
  },
  {
    id: "full_assault",
    name: "FULL ASSAULT",
    description: "Everything at once. Won wars. Emptied villages. Both, usually.",
    icon: "sword-cross",
    creditsCost: 25000,
    ammoCost: 500,
    fuelCost: 200,
    minUnits: 50,
    baseDamage: 40,
    accuracy: 0.75,
    interceptChance: 0.05,
    collateralMod: 0.8,
    durationTicks: 3,
    riskToAttacker: 0.25,
  },
  {
    id: "special_ops",
    name: "SPECIAL OPS RAID",
    description: "Six operators in. Maybe six out. Nobody hears either way.",
    icon: "ninja",
    creditsCost: 8000,
    ammoCost: 30,
    fuelCost: 20,
    minUnits: 5,
    baseDamage: 12,
    accuracy: 0.9,
    interceptChance: 0.2,
    collateralMod: 0.1,
    durationTicks: 1,
    riskToAttacker: 0.1,
  },
  {
    id: "air_strike",
    name: "AIR STRIKE",
    description: "Gunships in. Bombs out. Pilots back for breakfast.",
    icon: "helicopter",
    creditsCost: 10000,
    ammoCost: 200,
    fuelCost: 150,
    minUnits: 5,
    baseDamage: 25,
    accuracy: 0.7,
    interceptChance: 0.25,
    collateralMod: 0.5,
    durationTicks: 1,
    riskToAttacker: 0.08,
  },
  {
    id: "artillery_barrage",
    name: "ARTILLERY BARRAGE",
    description: "Thirty minutes of thunder. The sector stops asking what hit it.",
    icon: "cannon",
    creditsCost: 7000,
    ammoCost: 400,
    fuelCost: 40,
    minUnits: 10,
    baseDamage: 20,
    accuracy: 0.5,
    interceptChance: 0.05,
    collateralMod: 0.6,
    durationTicks: 2,
    riskToAttacker: 0.05,
  },
  {
    id: "tarpit_titan_hunt",
    name: "TARPIT TITAN HUNT",
    description: "Track and bring down a forty-ton tarpit titan. Heavy armor and artillery flatten the brute; light infantry get crushed.",
    icon: "diamond-stone",
    creditsCost: 18000,
    ammoCost: 450,
    fuelCost: 220,
    minUnits: 30,
    baseDamage: 18,
    accuracy: 0.78,
    interceptChance: 0.10,
    collateralMod: 0.20,
    durationTicks: 4,
    riskToAttacker: 0.28,
  },
  {
    id: "ridge_tyrant_hunt",
    name: "RIDGE TYRANT HUNT",
    description: "Run the alpha ridge tyrant out of its lair. Combined arms with armor and artillery; expect heavy casualties even in success.",
    icon: "skull",
    creditsCost: 22000,
    ammoCost: 550,
    fuelCost: 250,
    minUnits: 40,
    baseDamage: 22,
    accuracy: 0.74,
    interceptChance: 0.12,
    collateralMod: 0.25,
    durationTicks: 5,
    riskToAttacker: 0.32,
  },
  {
    id: "glassback_whale_hunt",
    name: "GLASSBACK WHALE HUNT",
    description: "Bring down a sky-borne glassback whale before it scours a sector. Air-heavy strike package with spotters and harpoon teams.",
    icon: "whale",
    creditsCost: 26000,
    ammoCost: 600,
    fuelCost: 320,
    minUnits: 25,
    baseDamage: 24,
    accuracy: 0.72,
    interceptChance: 0.18,
    collateralMod: 0.30,
    durationTicks: 5,
    riskToAttacker: 0.30,
  },
  {
    id: "siege_bombardment",
    name: "SIEGE",
    description: "Encircle. Cut supplies. Wait. Win in months. Sleep in shifts.",
    icon: "castle",
    creditsCost: 15000,
    ammoCost: 250,
    fuelCost: 120,
    minUnits: 40,
    baseDamage: 8,
    accuracy: 1.0,
    interceptChance: 0.0,
    collateralMod: 0.4,
    durationTicks: 6,
    riskToAttacker: 0.12,
  },
];

export const TARGET_CATEGORIES: TargetCategoryDef[] = [
  {
    id: "military",
    name: "MILITARY INSTALLATIONS",
    description: "Barracks, armories, command posts. Hits the trigger fingers.",
    icon: "tank",
    collateralRisk: 0.1,
    civilianCasualties: 0.05,
    diplomaticPenalty: 5,
  },
  {
    id: "walls",
    name: "OUTER WALL / DEFENSES",
    description: "Walls, gates, emplacements. Opens the can.",
    icon: "wall",
    collateralRisk: 0.15,
    civilianCasualties: 0.02,
    diplomaticPenalty: 8,
  },
  {
    id: "fuel_infra",
    name: "FUEL INFRASTRUCTURE",
    description: "Power, fuel, grid. Lights die. Engines die. Logistics rots.",
    icon: "gas-station",
    collateralRisk: 0.3,
    civilianCasualties: 0.1,
    diplomaticPenalty: 12,
  },
  {
    id: "civilian_infra",
    name: "CIVILIAN INFRASTRUCTURE",
    description: "Housing, hospitals, water. The Hague keeps a file on whoever orders this.",
    icon: "home-city",
    collateralRisk: 0.8,
    civilianCasualties: 0.5,
    diplomaticPenalty: 25,
  },
  {
    id: "indiscriminate",
    name: "INDISCRIMINATE",
    description: "No target. No mercy. No coming back from the paperwork.",
    icon: "explosion-outline",
    collateralRisk: 1.0,
    civilianCasualties: 0.7,
    diplomaticPenalty: 40,
  },
];

export const ATTACK_TYPES_MAP: Record<string, AttackTypeDef> = {};
for (const a of ATTACK_TYPES) ATTACK_TYPES_MAP[a.id] = a;

export const TARGET_CATEGORIES_MAP: Record<string, TargetCategoryDef> = {};
for (const t of TARGET_CATEGORIES) TARGET_CATEGORIES_MAP[t.id] = t;

export type StrikeResult = {
  success: boolean;
  intercepted: boolean;
  damageDealt: Record<string, number>;
  attackerCasualties: number;
  civilianCasualties: number;
  infrastructureDestroyed: number;
  diplomaticFallout: number;
  targetRubble: boolean;
  narrative: string;
  dominantRole?: string | null;
};

// Optional composition input: role share fractions (0..1) of the deployed
// loadout, used to bias damage distribution, intercept odds, and casualty
// rates beyond just total strength. When omitted, the resolver behaves
// exactly as it did before — single-number strength comparison.
export type StrikeComposition = {
  infantry?: number;
  armor?: number;
  artillery?: number;
  airSupport?: number;
  specialOps?: number;
  support?: number;
};

const COMPOSITION_NARRATIVE: Record<string, string[]> = {
  infantry: [
    "Infantry detachments held the line and overran enemy positions room by room.",
    "Boots on the ground carried the fight. Hard-won, meter by meter.",
  ],
  armor: [
    "Armored columns punched through the perimeter walls and rolled into the target zone.",
    "Tracked vehicles pulverized hardpoints the rest of the force couldn't reach.",
  ],
  artillery: [
    "Forward observers walked artillery onto target. Sustained fire flattened the objective.",
    "Battery commanders kept the tubes hot for hours. The crater field is testimony.",
  ],
  airSupport: [
    "Gunships established air dominance and dictated the entire engagement from above.",
    "Air wings made repeated low passes — anything left standing didn't stay that way.",
  ],
  specialOps: [
    "Special operations operators slipped past the perimeter, marked targets, and exfiltrated clean.",
    "An elite team handled the surgical work — minimal noise, maximum disruption.",
  ],
  support: [
    "Combat medics and engineers kept the front-line units in the fight long past their breaking point.",
    "Logistics and field repair teams turned what should have been a withdrawal into a sustained push.",
  ],
};

function dominantRoleFromComposition(c: StrikeComposition | undefined): string | null {
  if (!c) return null;
  const entries: [string, number][] = [
    ["infantry", c.infantry ?? 0],
    ["armor", c.armor ?? 0],
    ["artillery", c.artillery ?? 0],
    ["airSupport", c.airSupport ?? 0],
    ["specialOps", c.specialOps ?? 0],
    ["support", c.support ?? 0],
  ];
  let best: string | null = null;
  let bestShare = 0.0001;
  for (const [k, v] of entries) {
    if (v > bestShare) { bestShare = v; best = k; }
  }
  return best;
}

const STRIKE_NARRATIVES = {
  intercepted: [
    "Enemy air defense systems intercepted the strike. Missiles destroyed before reaching target.",
    "Anti-missile batteries activated. The strike was neutralized mid-flight.",
    "Electronic countermeasures deflected the attack. No damage to target.",
    "Defense grid engaged — incoming ordnance destroyed. Strike failed.",
  ],
  troop_success: [
    "Ground forces breached the perimeter and engaged hostiles. Objectives secured.",
    "Assault teams advanced under covering fire. Target facilities destroyed.",
    "Infantry pushed through enemy lines after fierce resistance. Mission accomplished.",
  ],
  missile_success: [
    "Missiles struck the target zone. Secondary explosions reported across the impact area.",
    "Direct hit confirmed. Target infrastructure severely damaged.",
    "Warheads detonated on target. Fires burning across the strike zone.",
  ],
  full_assault_success: [
    "Combined arms offensive overwhelmed enemy defenses. Massive destruction across the target area.",
    "All units engaged simultaneously. The target zone is devastated — fires visible for kilometers.",
    "Total assault successful. Enemy command structure has collapsed in the target sector.",
  ],
  special_ops_success: [
    "Operatives infiltrated undetected. Charges placed and detonated. Exfiltrated successfully.",
    "Elite team completed surgical strike. Minimal collateral. Target neutralized.",
    "Covert operation successful. The enemy won't know what hit them until morning.",
  ],
  air_strike_success: [
    "Gunships made multiple passes over the target. Heavy damage confirmed by aerial recon.",
    "Bombers delivered payload on target. Anti-air fire was suppressed.",
    "Air superiority established. Target zone pulverized from above.",
  ],
  artillery_success: [
    "Artillery batteries fired sustained volleys. The target area is cratered.",
    "Shells rained down for hours. Structures in the target zone have collapsed.",
    "Barrage complete. Forward observers confirm extensive damage.",
  ],
  siege_success: [
    "Siege operations continue to grind down enemy infrastructure. Slow but relentless progress.",
    "Blockade tightening. Supply lines to the target are severed. Infrastructure degrading.",
    "Another day of siege. Walls crumbling, morale breaking. They can't hold forever.",
  ],
  rubble: [
    "The target has been reduced to rubble. Nothing remains but smoking ruins and ash.",
    "Total destruction achieved. The target zone is uninhabitable wasteland now.",
    "Infrastructure at zero. What was once a functioning zone is now a crater field.",
  ],
  civilian_horror: [
    "Civilian casualties are catastrophic. International condemnation is immediate and severe.",
    "Reports of mass civilian deaths flooding in. This will not be forgotten.",
    "Hospitals and schools hit. The death toll is staggering. Your reputation is in ruins.",
  ],
};

function pickNarrative(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function resolveStrike(
  attackType: AttackTypeDef,
  targetCategory: TargetCategoryDef,
  playerMilitaryStrength: number,
  targetDefenseRating: number,
  targetInfra: { military: number; walls: number; fuel: number; civilian: number },
  composition?: StrikeComposition,
  deployedUnitCount?: number
): StrikeResult {
  // Composition shares (default to attack-type-typical mix when none supplied).
  const c = composition ?? {};
  const sInf = c.infantry ?? 0;
  const sArm = c.armor ?? 0;
  const sArt = c.artillery ?? 0;
  const sAir = c.airSupport ?? 0;
  const sSpc = c.specialOps ?? 0;
  const sSup = c.support ?? 0;

  // Air-heavy forces are the most exposed to air defense; ground-only
  // forces avoid most intercept fire entirely.
  const interceptModifier = composition
    ? 0.6 + sAir * 1.0 + sArt * 0.3 - sSpc * 0.2 - sSup * 0.1
    : 1.0;
  const interceptRoll = Math.random();
  const intercepted = interceptRoll < attackType.interceptChance * (targetDefenseRating / 100) * interceptModifier;

  if (intercepted) {
    // Even on intercept, casualties depend on what was actually flying / on
    // the ground. Air-heavy strikes lose more aircrews; ground strikes barely
    // suffer at all because most of the force never closed with the target.
    const interceptCasualtyMix = composition
      ? 0.4 + sAir * 0.8 + sSpc * 0.3
      : 1.0;
    const baseCount = deployedUnitCount && deployedUnitCount > 0 ? deployedUnitCount : Math.max(attackType.minUnits, 1);
    return {
      success: false,
      intercepted: true,
      damageDealt: {},
      attackerCasualties: Math.floor(baseCount * attackType.riskToAttacker * 0.3 * interceptCasualtyMix),
      civilianCasualties: 0,
      infrastructureDestroyed: 0,
      diplomaticFallout: 2,
      targetRubble: false,
      narrative: pickNarrative(STRIKE_NARRATIVES.intercepted),
      dominantRole: dominantRoleFromComposition(composition),
    };
  }

  const strengthRatio = Math.min(2.0, Math.max(0.3, playerMilitaryStrength / Math.max(10, targetDefenseRating)));
  const accuracyRoll = Math.random();
  // Special ops sharpen accuracy; pure-air or pure-armor without spotters
  // doesn't get that boost.
  const accuracyBonus = composition ? 1.0 + sSpc * 0.25 + sSup * 0.05 : 1.0;
  const effectiveAccuracy = Math.min(0.98, attackType.accuracy * accuracyBonus);
  const hitQuality = accuracyRoll < effectiveAccuracy ? 1.0 : 0.3;
  const rawDamage = Math.round(attackType.baseDamage * hitQuality * strengthRatio * (0.8 + Math.random() * 0.4));

  // Per-target-category multipliers driven by force composition.
  // - military: infantry & armor are the most effective ground sweep.
  // - walls: armor + artillery break fortifications; air bypasses them.
  // - fuel: artillery + air strike depots best.
  // - civilian: artillery & air collateralize the most; specialOps the least.
  const compMul = (target: "military" | "walls" | "fuel" | "civilian"): number => {
    if (!composition) return 1.0;
    switch (target) {
      case "military": return 0.7 + sInf * 0.6 + sArm * 0.7 + sSpc * 0.5 + sAir * 0.4 + sArt * 0.3;
      case "walls":    return 0.5 + sArm * 0.9 + sArt * 0.9 + sInf * 0.2 + sAir * 0.4;
      case "fuel":     return 0.6 + sArt * 0.8 + sAir * 0.7 + sSpc * 0.5 + sInf * 0.2;
      case "civilian": return 0.6 + sArt * 0.7 + sAir * 0.6 + sInf * 0.3 - sSpc * 0.2;
    }
  };

  const damageDealt: Record<string, number> = {};
  const collateral = attackType.collateralMod * targetCategory.collateralRisk;

  if (targetCategory.id === "indiscriminate") {
    const split = rawDamage / 4;
    damageDealt.military = Math.round(split * compMul("military") * (0.8 + Math.random() * 0.4));
    damageDealt.walls = Math.round(split * compMul("walls") * (0.8 + Math.random() * 0.4));
    damageDealt.fuel = Math.round(split * compMul("fuel") * (0.8 + Math.random() * 0.4));
    damageDealt.civilian = Math.round(split * compMul("civilian") * (0.8 + Math.random() * 0.4));
  } else {
    const primaryKey = targetCategory.id === "fuel_infra" ? "fuel" : targetCategory.id === "civilian_infra" ? "civilian" : targetCategory.id;
    damageDealt[primaryKey] = Math.round(rawDamage * compMul(primaryKey as "military" | "walls" | "fuel" | "civilian"));
    if (collateral > 0.2) {
      const spillKeys = ["military", "walls", "fuel", "civilian"].filter((k) => k !== primaryKey) as Array<"military" | "walls" | "fuel" | "civilian">;
      spillKeys.forEach((k) => {
        damageDealt[k] = Math.round(rawDamage * collateral * compMul(k) * (0.1 + Math.random() * 0.2));
      });
    }
  }

  // Force composition shapes attacker losses too:
  // - armor & special ops shrug off return fire,
  // - air takes light losses,
  // - infantry pays the price up close.
  const casualtyMix = composition
    ? Math.max(0.3, 1.0 + sInf * 0.4 + sArt * 0.1 - sArm * 0.4 - sSpc * 0.5 - sAir * 0.2 - sSup * 0.1)
    : 1.0;
  const baseUnitCount = deployedUnitCount && deployedUnitCount > 0 ? deployedUnitCount : Math.max(attackType.minUnits, 1);
  const totalDamage = Object.values(damageDealt).reduce((a, b) => a + b, 0);
  const attackerCasualties = Math.floor(baseUnitCount * attackType.riskToAttacker * casualtyMix * (0.5 + Math.random() * 1.0));

  // Civilian fallout: precision (special ops) reduces, area weapons (artillery,
  // air) increase.
  const civilianMix = composition
    ? Math.max(0.2, 1.0 + sArt * 0.4 + sAir * 0.3 - sSpc * 0.5 - sInf * 0.1)
    : 1.0;
  const civCasualties = Math.round(
    rawDamage * targetCategory.civilianCasualties * civilianMix * (100 + Math.random() * 400)
  );
  const dipFallout = Math.round(targetCategory.diplomaticPenalty * (0.7 + Math.random() * 0.6));

  const newMilitary = Math.max(0, targetInfra.military - (damageDealt.military ?? 0));
  const newWalls = Math.max(0, targetInfra.walls - (damageDealt.walls ?? 0));
  const newFuel = Math.max(0, targetInfra.fuel - (damageDealt.fuel ?? 0));
  const newCivilian = Math.max(0, targetInfra.civilian - (damageDealt.civilian ?? 0));
  const avgInfra = (newMilitary + newWalls + newFuel + newCivilian) / 4;
  const targetRubble = avgInfra <= 5;

  let narrative = "";
  const successKey = `${attackType.id}_success` as keyof typeof STRIKE_NARRATIVES;
  const pool = STRIKE_NARRATIVES[successKey] ?? STRIKE_NARRATIVES.troop_success;
  narrative = pickNarrative(pool);

  // Add a force-composition flavor line whenever a meaningful dominant role
  // exists (>= 35% of the deployed strength).
  const dominant = dominantRoleFromComposition(composition);
  if (dominant) {
    const shareLookup: Record<string, number> = { infantry: sInf, armor: sArm, artillery: sArt, airSupport: sAir, specialOps: sSpc, support: sSup };
    if ((shareLookup[dominant] ?? 0) >= 0.35) {
      const flavor = COMPOSITION_NARRATIVE[dominant];
      if (flavor) narrative += "\n\n" + pickNarrative(flavor);
    }
  }

  if (targetRubble) {
    narrative += "\n\n" + pickNarrative(STRIKE_NARRATIVES.rubble);
  }
  if (civCasualties > 500) {
    narrative += "\n\n" + pickNarrative(STRIKE_NARRATIVES.civilian_horror);
  }

  return {
    success: true,
    intercepted: false,
    damageDealt,
    attackerCasualties,
    civilianCasualties: civCasualties,
    infrastructureDestroyed: totalDamage,
    diplomaticFallout: dipFallout,
    targetRubble,
    narrative,
    dominantRole: dominant,
  };
}
