export type ReputationAxis = "mercy" | "fear" | "transparency" | "populism" | "stability";

export type CommanderReputation = {
  mercy: number;
  fear: number;
  transparency: number;
  populism: number;
  stability: number;
  title: string;
};

export type ApprovalRatings = {
  citizens: number;
  officers: number;
  factions: number;
  military: number;
};

export type PoliticalThreat = {
  id: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  tickCreated: number;
};

export type PoliticalDecreeDef = {
  id: string;
  name: string;
  description: string;
  category: "control" | "reform" | "military" | "economic" | "social";
  cost: number;
  cooldownTicks: number;
  effects: {
    unrest?: number;
    happiness?: number;
    loyalty?: number;
    corruption?: number;
    credits?: number;
    defenseRating?: number;
    lawOrder?: number;
    fear?: number;
    mercy?: number;
    transparency?: number;
    populism?: number;
    stability?: number;
  };
};

export const POLITICAL_DECREES: PoliticalDecreeDef[] = [
  {
    id: "purge_department",
    name: "DEPARTMENTAL PURGE",
    description: "Fire everyone in a department and start fresh. Brutal but effective. Survivors will be very motivated.",
    category: "control", cost: 15000, cooldownTicks: 40,
    effects: { corruption: -8, happiness: -3, fear: 5, unrest: 3, loyalty: -5 },
  },
  {
    id: "declare_martial_sector",
    name: "SECTOR MARTIAL LAW",
    description: "Lock down an entire sector. Curfews, checkpoints, and armed patrols. Unrest drops. So does tourism.",
    category: "military", cost: 10000, cooldownTicks: 20,
    effects: { unrest: -8, happiness: -4, fear: 3, defenseRating: 2, lawOrder: 5 },
  },
  {
    id: "grant_amnesty",
    name: "GENERAL AMNESTY",
    description: "Pardon minor offenders. Empty the overcrowded prisons. Citizens see mercy. Officers see weakness.",
    category: "reform", cost: 5000, cooldownTicks: 30,
    effects: { happiness: 4, unrest: -3, mercy: 5, fear: -3, loyalty: 2 },
  },
  {
    id: "promote_loyalist",
    name: "PROMOTE A LOYALIST",
    description: "Elevate a trusted officer to a position of power. Sends a message about what kind of behavior gets rewarded.",
    category: "control", cost: 8000, cooldownTicks: 15,
    effects: { loyalty: 3, corruption: -2, stability: 3 },
  },
  {
    id: "demand_faction_tribute",
    name: "DEMAND FACTION TRIBUTE",
    description: "Remind the factions who runs this city. Demand a contribution. They'll pay or face consequences.",
    category: "economic", cost: 0, cooldownTicks: 25,
    effects: { credits: 12000, fear: 3, populism: -2, unrest: 2 },
  },
  {
    id: "public_trial",
    name: "STAGE A PUBLIC TRIAL",
    description: "Drag a corrupt official into the spotlight. The crowd loves a spectacle. The accused less so.",
    category: "reform", cost: 3000, cooldownTicks: 20,
    effects: { corruption: -5, happiness: 3, transparency: 5, fear: 2, unrest: -2 },
  },
  {
    id: "economic_stimulus",
    name: "ECONOMIC STIMULUS PACKAGE",
    description: "Flood the economy with credits. Businesses boom. Inflation follows. But that's tomorrow's problem.",
    category: "economic", cost: 25000, cooldownTicks: 30,
    effects: { happiness: 5, populism: 4, unrest: -3 },
  },
  {
    id: "propaganda_blitz",
    name: "PROPAGANDA BLITZ",
    description: "Every screen, every speaker, every billboard. Your face. Your message. Your city.",
    category: "social", cost: 8000, cooldownTicks: 15,
    effects: { happiness: 2, unrest: -3, fear: 1, populism: 3, transparency: -2 },
  },
  {
    id: "emergency_powers",
    name: "INVOKE EMERGENCY POWERS",
    description: "Suspend normal governance. Concentrate all authority. Effective. Dangerous. Addictive.",
    category: "control", cost: 5000, cooldownTicks: 40,
    effects: { unrest: -5, happiness: -5, fear: 6, stability: 4, transparency: -4, defenseRating: 3, lawOrder: 4 },
  },
  {
    id: "citizens_forum",
    name: "OPEN CITIZENS' FORUM",
    description: "Let the people speak. Pretend to listen. Occasionally act on something. Democracy theater at its finest.",
    category: "social", cost: 2000, cooldownTicks: 12,
    effects: { happiness: 3, unrest: -2, populism: 4, transparency: 3, mercy: 2 },
  },
];

export const POLITICAL_DECREES_MAP: Record<string, PoliticalDecreeDef> = {};
for (const d of POLITICAL_DECREES) POLITICAL_DECREES_MAP[d.id] = d;

export function calculateRepTitle(rep: CommanderReputation): string {
  const dominant = (Object.keys(rep) as ReputationAxis[])
    .filter((k): k is ReputationAxis => k !== ("title" as string))
    .reduce((a, b) => (rep[a] > rep[b] ? a : b));
  const val = rep[dominant];

  if (rep.fear > 70 && rep.mercy < 30) return "THE TYRANT";
  if (rep.mercy > 70 && rep.fear < 30) return "THE BENEVOLENT";
  if (rep.stability > 70) return "THE IRON HAND";
  if (rep.populism > 70) return "THE PEOPLE'S CHAMPION";
  if (rep.transparency > 70) return "THE REFORMER";
  if (rep.fear > 50 && rep.stability > 50) return "THE ENFORCER";
  if (rep.mercy > 50 && rep.populism > 50) return "THE BELOVED";
  if (rep.fear > 50 && rep.transparency < 30) return "THE SHADOW";
  if (val < 30) return "THE UNKNOWN";
  return "THE PRAGMATIST";
}

export function calculateApproval(state: {
  happiness: number;
  unrest: number;
  corruption: number;
  lawOrder: number;
  defenseRating: number;
  avgOfficerLoyalty: number;
  factionAvgRelation: number;
}): ApprovalRatings {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return {
    citizens: clamp(state.happiness * 1.2 - state.unrest * 0.8 + 20),
    officers: clamp(state.avgOfficerLoyalty * 0.8 + state.lawOrder * 0.3 - state.corruption * 0.3),
    factions: clamp(state.factionAvgRelation * 0.6 + 30),
    military: clamp(state.defenseRating * 0.5 + state.lawOrder * 0.3 + 20),
  };
}

export function generatePoliticalThreats(state: {
  officers: { name: string; loyalty: number; ambition: number; corruption: number; position: string }[];
  unrest: number;
  corruption: number;
  happiness: number;
  factions: { name: string; influence: number; threat: number }[];
  totalTicks: number;
}): PoliticalThreat[] {
  const threats: PoliticalThreat[] = [];

  const disloyal = state.officers.filter((o) => o.loyalty < 30 && o.ambition > 60);
  for (const o of disloyal.slice(0, 2)) {
    threats.push({
      id: `disloyal-${o.name}`,
      source: o.name,
      severity: o.loyalty < 15 ? "critical" : "high",
      description: `${o.position} ${o.name} — loyalty critically low. Ambition unchecked. Watch closely.`,
      tickCreated: state.totalTicks,
    });
  }

  const corrupt = state.officers.filter((o) => o.corruption > 60);
  for (const c of corrupt.slice(0, 2)) {
    threats.push({
      id: `corrupt-${c.name}`,
      source: c.name,
      severity: c.corruption > 80 ? "high" : "medium",
      description: `${c.position} ${c.name} — corruption levels alarming. Internal affairs recommends investigation.`,
      tickCreated: state.totalTicks,
    });
  }

  if (state.unrest > 60) {
    threats.push({
      id: "civil-unrest",
      source: "Population",
      severity: state.unrest > 80 ? "critical" : "high",
      description: "Civil unrest approaching dangerous levels. Riots possible within days.",
      tickCreated: state.totalTicks,
    });
  }

  if (state.corruption > 50) {
    threats.push({
      id: "systemic-corruption",
      source: "Government",
      severity: state.corruption > 70 ? "high" : "medium",
      description: "Systemic corruption undermining government effectiveness. Public trust eroding.",
      tickCreated: state.totalTicks,
    });
  }

  const hostileFactions = state.factions.filter((f) => f.threat > 60);
  for (const f of hostileFactions.slice(0, 2)) {
    threats.push({
      id: `faction-${f.name}`,
      source: f.name,
      severity: f.threat > 80 ? "critical" : "high",
      description: `${f.name} — threat level elevated. Hostile actions anticipated.`,
      tickCreated: state.totalTicks,
    });
  }

  return threats.sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return sev[a.severity] - sev[b.severity];
  });
}

export function createDefaultReputation(): CommanderReputation {
  return { mercy: 50, fear: 50, transparency: 50, populism: 50, stability: 50, title: "THE PRAGMATIST" };
}

export type PoliticsState = {
  reputation: CommanderReputation;
  approval: ApprovalRatings;
  decreeCooldowns: Record<string, number>;
  totalDecrees: number;
  lastDecreeTick: number;
};

export function createDefaultPoliticsState(): PoliticsState {
  return {
    reputation: createDefaultReputation(),
    approval: { citizens: 50, officers: 50, factions: 50, military: 50 },
    decreeCooldowns: {},
    totalDecrees: 0,
    lastDecreeTick: 0,
  };
}
