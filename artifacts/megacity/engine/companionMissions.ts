export interface CompanionMissionDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  durationTicks: number;
  rewardSummary: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  riskColor: string;
  minCombat: number;
  minLevel: number;
  rewards: {
    xp: [number, number];
    credits: [number, number];
    loyalty: number;
    resources?: Partial<{ food: number; steel: number; ammo: number; medSupplies: number; fuel: number; goods: number }>;
  };
  failureChanceBase: number;
  injuryChance: number;
  category: "recon" | "combat" | "logistics" | "covert" | "social";
}

export const COMPANION_MISSION_DEFS: CompanionMissionDef[] = [
  {
    id: "patrol_sweep", name: "SECTOR PATROL", icon: "walk", category: "recon",
    description: "Sweep assigned sector for threats, gather ground-level intelligence. Routine but informative.",
    durationTicks: 2, rewardSummary: "+XP, Intel, Credits",
    riskLevel: "LOW", riskColor: "#4CAF50", minCombat: 0, minLevel: 1,
    rewards: { xp: [10, 20], credits: [50, 150], loyalty: 2 },
    failureChanceBase: 5, injuryChance: 3,
  },
  {
    id: "undercover_recon", name: "UNDERCOVER RECON", icon: "eye-off", category: "covert",
    description: "Infiltrate criminal networks. High-value intelligence at personal risk. Requires discretion.",
    durationTicks: 4, rewardSummary: "+XP, Faction Intel, Credits",
    riskLevel: "MEDIUM", riskColor: "#FF9800", minCombat: 8, minLevel: 2,
    rewards: { xp: [20, 40], credits: [200, 500], loyalty: 3 },
    failureChanceBase: 20, injuryChance: 15,
  },
  {
    id: "asset_recovery", name: "ASSET RECOVERY", icon: "briefcase", category: "combat",
    description: "Recover stolen equipment or contraband from hostile territory. Expect resistance.",
    durationTicks: 3, rewardSummary: "+XP, Resources, Equipment",
    riskLevel: "MEDIUM", riskColor: "#FF9800", minCombat: 10, minLevel: 2,
    rewards: { xp: [15, 35], credits: [100, 300], loyalty: 2, resources: { steel: 5, ammo: 10 } },
    failureChanceBase: 18, injuryChance: 20,
  },
  {
    id: "vip_escort", name: "VIP ESCORT", icon: "account-star", category: "social",
    description: "Protect a high-value target during transit through dangerous sectors. Visibility is high.",
    durationTicks: 2, rewardSummary: "+XP, Credits, Loyalty",
    riskLevel: "LOW", riskColor: "#4CAF50", minCombat: 5, minLevel: 1,
    rewards: { xp: [12, 25], credits: [150, 400], loyalty: 5 },
    failureChanceBase: 8, injuryChance: 10,
  },
  {
    id: "sabotage_op", name: "SABOTAGE OPERATION", icon: "bomb", category: "combat",
    description: "Disable enemy infrastructure deep in hostile territory. Requires combat readiness and nerve.",
    durationTicks: 6, rewardSummary: "+XP, Enemy Weakened, Intel",
    riskLevel: "HIGH", riskColor: "#F44336", minCombat: 15, minLevel: 3,
    rewards: { xp: [35, 60], credits: [300, 800], loyalty: 4, resources: { ammo: 15, fuel: 10 } },
    failureChanceBase: 30, injuryChance: 35,
  },
  {
    id: "interrogation", name: "FIELD INTERROGATION", icon: "comment-question", category: "covert",
    description: "Extract information from captured suspects in the undercity. Not for the squeamish.",
    durationTicks: 3, rewardSummary: "+XP, Critical Intel",
    riskLevel: "MEDIUM", riskColor: "#FF9800", minCombat: 6, minLevel: 2,
    rewards: { xp: [18, 35], credits: [100, 250], loyalty: 1 },
    failureChanceBase: 15, injuryChance: 8,
  },
  {
    id: "supply_run", name: "BLACK MARKET RUN", icon: "truck-fast", category: "logistics",
    description: "Source rare supplies through unofficial channels. Contacts required. Discretion essential.",
    durationTicks: 4, rewardSummary: "+XP, Rare Resources, Contacts",
    riskLevel: "HIGH", riskColor: "#F44336", minCombat: 8, minLevel: 2,
    rewards: { xp: [20, 40], credits: [50, 200], loyalty: 2, resources: { medSupplies: 10, goods: 15, fuel: 8 } },
    failureChanceBase: 25, injuryChance: 15,
  },
  {
    id: "dead_drop", name: "DEAD DROP COLLECTION", icon: "package-variant", category: "covert",
    description: "Retrieve intelligence packages from pre-arranged locations across the city. Routine spy work.",
    durationTicks: 2, rewardSummary: "+XP, Intel, Low Risk",
    riskLevel: "LOW", riskColor: "#4CAF50", minCombat: 0, minLevel: 1,
    rewards: { xp: [8, 18], credits: [75, 200], loyalty: 1 },
    failureChanceBase: 5, injuryChance: 2,
  },
  {
    id: "bounty_hunt", name: "BOUNTY HUNT", icon: "target", category: "combat",
    description: "Track and apprehend a wanted fugitive. Dangerous quarry. Dead or alive, preferably alive.",
    durationTicks: 5, rewardSummary: "+XP, Credits, Kill Count",
    riskLevel: "HIGH", riskColor: "#F44336", minCombat: 14, minLevel: 3,
    rewards: { xp: [30, 55], credits: [500, 1200], loyalty: 3 },
    failureChanceBase: 28, injuryChance: 30,
  },
  {
    id: "medical_relief", name: "MEDICAL RELIEF", icon: "medical-bag", category: "social",
    description: "Deliver medical supplies to an underserved district. Builds goodwill. Minimal combat risk.",
    durationTicks: 2, rewardSummary: "+XP, Loyalty, Reputation",
    riskLevel: "LOW", riskColor: "#4CAF50", minCombat: 0, minLevel: 1,
    rewards: { xp: [10, 20], credits: [50, 100], loyalty: 8, resources: { medSupplies: -5 } },
    failureChanceBase: 3, injuryChance: 2,
  },
  {
    id: "weapons_cache", name: "WEAPONS CACHE RAID", icon: "pistol", category: "combat",
    description: "Raid a hidden weapons cache in the industrial zone. Heavy opposition expected.",
    durationTicks: 4, rewardSummary: "+XP, Ammo, Steel, Credits",
    riskLevel: "HIGH", riskColor: "#F44336", minCombat: 12, minLevel: 3,
    rewards: { xp: [25, 50], credits: [200, 600], loyalty: 2, resources: { ammo: 20, steel: 10 } },
    failureChanceBase: 25, injuryChance: 28,
  },
  {
    id: "tunnel_mapping", name: "TUNNEL MAPPING", icon: "map-search", category: "recon",
    description: "Chart unexplored sections of the undercity tunnel network. Claustrophobic but valuable.",
    durationTicks: 3, rewardSummary: "+XP, Map Data, Intel",
    riskLevel: "MEDIUM", riskColor: "#FF9800", minCombat: 4, minLevel: 1,
    rewards: { xp: [15, 30], credits: [100, 250], loyalty: 2 },
    failureChanceBase: 12, injuryChance: 10,
  },
  {
    id: "informant_meet", name: "INFORMANT RENDEZVOUS", icon: "account-question", category: "covert",
    description: "Meet with a high-level informant at an undisclosed location. Could be a setup. Could be gold.",
    durationTicks: 3, rewardSummary: "+XP, High-Value Intel",
    riskLevel: "MEDIUM", riskColor: "#FF9800", minCombat: 6, minLevel: 2,
    rewards: { xp: [18, 35], credits: [150, 400], loyalty: 3 },
    failureChanceBase: 18, injuryChance: 12,
  },
  {
    id: "convoy_ambush", name: "CONVOY INTERDICTION", icon: "truck", category: "combat",
    description: "Ambush a hostile supply convoy. Maximum force. High reward. Higher risk. Don't get surrounded.",
    durationTicks: 5, rewardSummary: "+XP, Resources, Credits",
    riskLevel: "EXTREME", riskColor: "#D32F2F", minCombat: 18, minLevel: 4,
    rewards: { xp: [40, 70], credits: [600, 1500], loyalty: 3, resources: { steel: 15, ammo: 25, fuel: 15, goods: 20 } },
    failureChanceBase: 35, injuryChance: 40,
  },
  {
    id: "fuel_run", name: "PERIMETER FUEL RUN", icon: "fuel", category: "logistics",
    description: "Move fuel drums from a perimeter depot to internal storage. Routine. The roads are mostly safe. Mostly.",
    durationTicks: 2, rewardSummary: "+XP, Fuel, Credits",
    riskLevel: "LOW", riskColor: "#4CAF50", minCombat: 0, minLevel: 1,
    rewards: { xp: [8, 18], credits: [60, 160], loyalty: 1, resources: { fuel: 12 } },
    failureChanceBase: 6, injuryChance: 4,
  },
  {
    id: "faction_parley", name: "FACTION PARLEY", icon: "handshake", category: "social",
    description: "Sit across the table from a rival faction's negotiator. No weapons, no escort, no second chances at first impressions.",
    durationTicks: 3, rewardSummary: "+XP, Credits, Loyalty",
    riskLevel: "MEDIUM", riskColor: "#FF9800", minCombat: 4, minLevel: 2,
    rewards: { xp: [18, 35], credits: [100, 300], loyalty: 6 },
    failureChanceBase: 14, injuryChance: 8,
  },
  {
    id: "hardware_fence", name: "HARDWARE FENCE", icon: "currency-usd", category: "logistics",
    description: "Move seized military hardware through three layers of black-market intermediaries. Discretion is non-optional. Profits are obscene.",
    durationTicks: 4, rewardSummary: "+XP, Credits, Steel, Ammo, Goods",
    riskLevel: "HIGH", riskColor: "#F44336", minCombat: 10, minLevel: 3,
    rewards: { xp: [25, 45], credits: [400, 900], loyalty: 2, resources: { steel: 8, ammo: 8, goods: 10 } },
    failureChanceBase: 25, injuryChance: 18,
  },
  {
    id: "deep_burn", name: "DEEP ASSET BURN", icon: "fire", category: "covert",
    description: "Permanently retire a compromised asset network. Names, accounts, safehouses, the operatives themselves. No traces. No witnesses. No going back.",
    durationTicks: 6, rewardSummary: "+XP, Credits, Critical Intel",
    riskLevel: "EXTREME", riskColor: "#D32F2F", minCombat: 16, minLevel: 4,
    rewards: { xp: [45, 75], credits: [700, 1600], loyalty: 4 },
    failureChanceBase: 38, injuryChance: 35,
  },
];

export const COMPANION_MISSION_DEFS_MAP: Record<string, CompanionMissionDef> = {};
for (const m of COMPANION_MISSION_DEFS) COMPANION_MISSION_DEFS_MAP[m.id] = m;

export type MissionOutcome = "success" | "partial" | "failure";

export interface MissionResult {
  outcome: MissionOutcome;
  title: string;
  narrative: string;
  xpGained: number;
  creditsGained: number;
  loyaltyChange: number;
  resourcesGained: Partial<{ food: number; steel: number; ammo: number; medSupplies: number; fuel: number; goods: number }>;
  injured: boolean;
  killsGained: number;
}

const SUCCESS_NARRATIVES: Record<string, string[]> = {
  patrol_sweep: [
    "Swept three sectors clean. Identified two smuggling routes and a hidden stash house. Filed full report.",
    "Patrol complete. Detained two suspects, confiscated contraband, mapped new gang territory boundaries.",
    "Clean sweep. No major threats encountered, but several informants provided actionable intelligence.",
  ],
  undercover_recon: [
    "Deep cover operation successful. Gained access to the syndicate's inner communications network. Identity intact.",
    "Three weeks embedded and they never suspected a thing. The intel package is substantial — names, routes, schedules.",
    "Pulled out just before the cover was blown. But not before copying their entire operations database.",
  ],
  asset_recovery: [
    "Package recovered. Two hostiles neutralized. The equipment is intact and ready for redeployment.",
    "Located the cache in an abandoned warehouse. Minimal resistance. Everything accounted for, plus some extras.",
    "Recovery complete. The stolen goods were exactly where the informant said they'd be. Good intel, clean extraction.",
  ],
  vip_escort: [
    "Principal delivered safely. Three attempted intercepts, all neutralized without civilian casualties.",
    "Smooth operation. The VIP was impressed enough to make a generous donation to our operations fund.",
    "Route compromised mid-transit. Improvised an alternate path through the service tunnels. VIP unharmed.",
  ],
  sabotage_op: [
    "Target infrastructure destroyed. Their communications hub is ash. It'll take them months to rebuild.",
    "Charges placed and detonated remotely. The enemy's fuel depot is a smoking crater. Mission accomplished.",
    "Infiltrated the facility, planted devices on critical systems. By the time they noticed, it was too late.",
  ],
  interrogation: [
    "Subject cracked after the third hour. Everything — names, dates, locations. The intel is gold.",
    "Professional extraction. Subject is talking freely now. The information will reshape our strategic picture.",
    "Subject attempted to mislead but our operative saw through it. Final testimony is verified and actionable.",
  ],
  supply_run: [
    "Black market contacts came through. Premium supplies at below-market rates. New supplier relationship established.",
    "Navigated three checkpoints and a gang toll. Supplies secured. The back-channel routes are now mapped.",
    "Deal went smooth. Our contact threw in some extra goods as a gesture of good faith. They want repeat business.",
  ],
  dead_drop: [
    "All four packages recovered without incident. Intelligence quality is high — someone important is talking.",
    "Clean collection run. One location was being watched, so took the alternate route. No compromise.",
    "Packages secured. Contents include encrypted communications from within the enemy's leadership circle.",
  ],
  bounty_hunt: [
    "Target acquired after a three-sector chase. Alive, as requested, though not without some... persuasion.",
    "Found the fugitive hiding in a condemned hab-block. Apprehended with minimal property damage. Bounty collected.",
    "The target fought back hard. But not hard enough. They're in custody now, and the bounty is ours.",
  ],
  medical_relief: [
    "Supplies delivered to Sector 7 clinic. The locals were overwhelmed with gratitude. Morale is noticeably higher.",
    "Medical relief complete. Treated 47 patients, vaccinated 120 children. The district remembers our kindness.",
    "Distribution went smoothly. A local doctor asked to be put on our contact list for future operations.",
  ],
  weapons_cache: [
    "Cache secured. Twelve crates of military-grade hardware recovered. The gang that stashed it won't be needing it.",
    "Raided the warehouse at 0300. Guards were overwhelmed before they could radio for backup. Full inventory recovered.",
    "Cache was larger than expected. Took two trips to extract everything. Enemy will be hurting for supplies.",
  ],
  tunnel_mapping: [
    "Mapped 4.2km of previously uncharted tunnels. Found three access points to critical infrastructure.",
    "Exploration complete. The undercity is bigger than anyone knew. Several strategic passages identified.",
    "Charted new routes through the deep tunnels. Also found evidence of unauthorized habitation — potential contacts.",
  ],
  informant_meet: [
    "Meeting successful. Our informant provided names of three compromised officials. This changes everything.",
    "The intel was worth the risk. Our source has access to encrypted communications at the highest level.",
    "Informant delivered as promised. High-grade intelligence on upcoming operations against our interests.",
  ],
  convoy_ambush: [
    "Convoy hit hard and fast. Three vehicles captured intact, crew scattered. A significant haul.",
    "Textbook ambush. They never saw it coming. Supply trucks seized, escort neutralized. Outstanding result.",
    "Interdiction successful despite heavy resistance. Lost nothing, gained everything. The enemy is reeling.",
  ],
  fuel_run: [
    "Drums delivered, ledger signed, no incidents. The depot manager threw in two extra cans for the trouble.",
    "One ambush attempt at the second checkpoint — three rounds fired, threat dispersed, fuel intact. Routine.",
    "Quiet run. Stopped to help a stranded patrol on the way back. They owe us a favour now.",
  ],
  faction_parley: [
    "Concessions extracted on three of four points. The rival negotiator left believing they'd won. They hadn't.",
    "Talks ran six hours. Came back with a non-aggression window and the names of two of their internal dissidents.",
    "Cold meeting, colder room. But a deal is a deal — territory boundaries hold for the next two cycles.",
  ],
  hardware_fence: [
    "All three layers paid out clean. The hardware moved, the credits flowed, no one ever held the same crate twice.",
    "Second intermediary tried to renegotiate mid-transaction. They were corrected. The deal closed at the original price.",
    "Premium return on the haul. Our operative even spotted resale opportunities for the next shipment.",
  ],
  deep_burn: [
    "Network erased. Twenty-three names, eleven safehouses, four numbered accounts. Nothing left but smoke.",
    "Methodical work. Each asset removed in a manner consistent with their established lifestyle. No investigations will follow.",
    "The burn ran clean. Operative returned with intel on which other networks the compromised assets had touched. More work coming.",
  ],
};

const PARTIAL_NARRATIVES: Record<string, string[]> = {
  default: [
    "Mission partially successful. Encountered unexpected complications but salvaged what we could.",
    "Objectives met, but not cleanly. Some intel lost during extraction. Operative took a few hits.",
    "Came back with half of what we expected. Better than nothing, but the op was messier than planned.",
    "The target was harder than anticipated. Got some results but had to abort early.",
    "Partial extraction. Complications forced a premature withdrawal. Still came back with something useful.",
  ],
};

const FAILURE_NARRATIVES: Record<string, string[]> = {
  default: [
    "Mission failed. Target was gone before our operative arrived. Someone tipped them off.",
    "Compromised. The operative barely made it out. No intel recovered. Counter-intelligence is investigating the leak.",
    "Ambush. They were waiting for us. Our operative fought their way out but the mission is a wash.",
    "Total mission failure. The opposition was heavier than briefed. We need better intelligence before trying again.",
    "Abort. Security was impenetrable. Our operative withdrew to avoid capture. Zero yield.",
    "The operation went sideways from the start. Wrong location, wrong timing. Back to square one.",
  ],
};

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CLASS_FLAVOR: Record<string, { success: string; failure: string }> = {
  personal_guard: {
    success: "Their close-protection discipline shaped every angle of the engagement.",
    failure: "Their close-quarters doctrine had no answer when the threat stayed at distance.",
  },
  shadow_agent: {
    success: "Working from the dark, they untangled the network before anyone noticed.",
    failure: "The shadows weren't deep enough this time — they were spotted early.",
  },
  combat_specialist: {
    success: "When it became a firefight, they were exactly the operator the situation required.",
    failure: "Heavy arms and breach drills couldn't fix a problem that wasn't kinetic.",
  },
  cyber_sentinel: {
    success: "Implant-fed threat scans gave them a fraction of a second the opposition didn't have.",
    failure: "Encrypted countermeasures locked their threat matrix down at the worst moment.",
  },
  clone_double: {
    success: "Operating with the calm only a redundant body provides, they pressed every advantage.",
    failure: "Even a decoy can only absorb so much before the cover story unravels.",
  },
  netrunner: {
    success: "They were inside the opposition's network before the first shot was fired — every door opened on cue.",
    failure: "Hostile counter-intrusion locked them out at the worst possible moment, blind in a fight that needed eyes.",
  },
  marksman: {
    success: "From overwatch, they read the engagement two seconds ahead of everyone else and shaped it bullet by bullet.",
    failure: "No firing solution they could take cleanly — the geometry of the fight refused them a shot.",
  },
  inquisitor: {
    success: "Their reputation arrived ahead of them; half the resistance folded the moment they identified themselves.",
    failure: "A field operation isn't a courtroom, and the rulebook they live by didn't cover what happened next.",
  },
  wasteland_scout: {
    success: "Wasteland instincts read the ground before anyone stepped on it — every ambush was already mapped.",
    failure: "The terrain shifted in ways even they didn't expect, and the column walked into trouble blind.",
  },
};

export function resolveMission(
  missionId: string,
  guardCombat: number,
  guardLevel: number,
  guardLoyalty: number,
  guardClassId?: string,
): MissionResult {
  const def = COMPANION_MISSION_DEFS.find((m) => m.id === missionId);
  if (!def) {
    return {
      outcome: "failure", title: "UNKNOWN MISSION", narrative: "Mission data corrupted. Operative returned confused.",
      xpGained: 5, creditsGained: 0, loyaltyChange: 0, resourcesGained: {}, injured: false, killsGained: 0,
    };
  }

  const combatBonus = Math.max(0, (guardCombat - def.minCombat) * 2);
  const levelBonus = Math.max(0, (guardLevel - def.minLevel) * 5);
  const loyaltyBonus = Math.max(0, (guardLoyalty - 50) * 0.3);
  const successModifier = combatBonus + levelBonus + loyaltyBonus;
  const adjustedFailChance = Math.max(2, def.failureChanceBase - successModifier);

  const roll = Math.random() * 100;
  let outcome: MissionOutcome;
  if (roll < adjustedFailChance) {
    outcome = "failure";
  } else if (roll < adjustedFailChance + 15) {
    outcome = "partial";
  } else {
    outcome = "success";
  }

  const injuryRoll = Math.random() * 100;
  const adjustedInjuryChance = outcome === "failure" ? def.injuryChance * 1.5 : outcome === "partial" ? def.injuryChance : def.injuryChance * 0.3;
  const injured = injuryRoll < adjustedInjuryChance;

  let xpGained: number;
  let creditsGained: number;
  let loyaltyChange: number;
  let resourcesGained: Partial<{ food: number; steel: number; ammo: number; medSupplies: number; fuel: number; goods: number }> = {};
  let killsGained = 0;

  if (outcome === "success") {
    xpGained = randInt(def.rewards.xp[0], def.rewards.xp[1]);
    creditsGained = randInt(def.rewards.credits[0], def.rewards.credits[1]);
    loyaltyChange = def.rewards.loyalty;
    if (def.rewards.resources) {
      for (const [key, val] of Object.entries(def.rewards.resources)) {
        if (val && val > 0) {
          (resourcesGained as any)[key] = randInt(Math.floor(val * 0.7), val);
        } else if (val && val < 0) {
          (resourcesGained as any)[key] = val;
        }
      }
    }
    if (def.category === "combat") {
      killsGained = randInt(1, 4);
    }
  } else if (outcome === "partial") {
    xpGained = randInt(Math.floor(def.rewards.xp[0] * 0.5), def.rewards.xp[0]);
    creditsGained = randInt(Math.floor(def.rewards.credits[0] * 0.3), Math.floor(def.rewards.credits[1] * 0.5));
    loyaltyChange = Math.max(0, def.rewards.loyalty - 1);
    if (def.rewards.resources) {
      for (const [key, val] of Object.entries(def.rewards.resources)) {
        if (val && val > 0 && Math.random() > 0.5) {
          (resourcesGained as any)[key] = randInt(1, Math.floor(val * 0.5));
        } else if (val && val < 0) {
          (resourcesGained as any)[key] = Math.floor(val * 0.5);
        }
      }
    }
    if (def.category === "combat" && Math.random() > 0.5) {
      killsGained = randInt(0, 2);
    }
  } else {
    xpGained = randInt(3, 8);
    creditsGained = 0;
    loyaltyChange = -2;
    killsGained = 0;
    if (def.rewards.resources) {
      for (const [key, val] of Object.entries(def.rewards.resources)) {
        if (val && val < 0) {
          (resourcesGained as any)[key] = val;
        }
      }
    }
  }

  const successNarrs = SUCCESS_NARRATIVES[missionId] ?? SUCCESS_NARRATIVES["patrol_sweep"];
  const partialNarrs = PARTIAL_NARRATIVES[missionId] ?? PARTIAL_NARRATIVES["default"];
  const failureNarrs = FAILURE_NARRATIVES[missionId] ?? FAILURE_NARRATIVES["default"];

  let narrative: string;
  let title: string;

  if (outcome === "success") {
    narrative = pickRandom(successNarrs);
    title = `${def.name}: SUCCESS`;
  } else if (outcome === "partial") {
    narrative = pickRandom(partialNarrs);
    title = `${def.name}: PARTIAL SUCCESS`;
  } else {
    narrative = pickRandom(failureNarrs);
    title = `${def.name}: FAILED`;
  }

  // Class flavor — give bodyguards a recognisable narrative voice.
  if (guardClassId && CLASS_FLAVOR[guardClassId]) {
    const flavor = CLASS_FLAVOR[guardClassId];
    if (outcome === "success" || outcome === "partial") {
      narrative += `\n\n${flavor.success}`;
    } else {
      narrative += `\n\nBLAME: ${flavor.failure}`;
    }
  }

  if (injured) {
    narrative += "\n\nOPERATIVE INJURED: Sustained wounds during the operation. Recovery required before next deployment.";
  }

  return {
    outcome, title, narrative,
    xpGained, creditsGained, loyaltyChange,
    resourcesGained, injured, killsGained,
  };
}
