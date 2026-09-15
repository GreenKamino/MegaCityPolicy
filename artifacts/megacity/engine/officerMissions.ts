import type { GameState, Officer, GameMessage, GameDate } from "./types";
import { applyResourceDelta } from "./resourceStorage";
import { ARRAY_CAPS } from "./sanitizer";

export type MissionCategory = "intelligence" | "diplomatic" | "resource" | "military" | "special";

export type MissionId =
  | "surveillance_op"
  | "deep_cover"
  | "diplomatic_envoy"
  | "trade_negotiation"
  | "scavenging_expedition"
  | "mining_survey"
  | "sabotage_operation"
  | "tactical_recon"
  | "propaganda_campaign"
  | "tech_acquisition"
  | "cyber_warfare"
  | "mineral_extraction"
  | "guerrilla_ops"
  | "black_site_ops";

export type MissionDef = {
  id: MissionId;
  name: string;
  description: string;
  category: MissionCategory;
  icon: string;
  duration: number;
  minCompetence: number;
  creditsCost: number;
  successRewards: {
    label: string;
    description: string;
  }[];
  failureConsequences: string;
  primaryStat: "competence" | "loyalty" | "ambition";
  secondaryStat?: "competence" | "loyalty" | "ambition" | "corruption";
};

export type ActiveMissionInstance = {
  missionId: MissionId;
  officerId: string;
  officerName: string;
  startTick: number;
  duration: number;
  ticksRemaining: number;
  resolved: boolean;
  outcome?: "success" | "failure";
};

export type MissionResult = {
  missionId: MissionId;
  officerName: string;
  success: boolean;
  message: string;
  rewards: string[];
  officerTraits?: string[];
};

export type SuccessChanceFactor = {
  label: string;
  delta: number;
};

export function missionMessageId(
  missionId: MissionId,
  success: boolean,
  totalTicks: number,
  officerName: string,
): string {
  return `mission-${success ? "success" : "fail"}-${missionId}-${totalTicks}-${officerName}`;
}

export const OFFICER_MISSIONS: MissionDef[] = [
  {
    id: "surveillance_op",
    name: "Surveillance Operation",
    description: "Deploy an officer to conduct covert surveillance on a rival faction, gathering intel on their operations and plans.",
    category: "intelligence",
    icon: "eye-outline",
    duration: 15,
    minCompetence: 30,
    creditsCost: 5000,
    successRewards: [
      { label: "+5 faction intel", description: "Detailed faction dossiers" },
      { label: "-5 crime", description: "Criminal networks exposed" },
    ],
    failureConsequences: "Officer loyalty -10, faction approval -5",
    primaryStat: "competence",
    secondaryStat: "loyalty",
  },
  {
    id: "deep_cover",
    name: "Deep Cover Infiltration",
    description: "Insert an officer deep into enemy territory for long-term intelligence gathering. High risk, high reward.",
    category: "intelligence",
    icon: "incognito",
    duration: 40,
    minCompetence: 60,
    creditsCost: 15000,
    successRewards: [
      { label: "+15 faction intel", description: "Comprehensive intelligence package" },
      { label: "-10 crime", description: "Major criminal syndicate disrupted" },
      { label: "+3 officer XP levels", description: "Field experience" },
    ],
    failureConsequences: "Officer may be captured or killed. Loyalty -20, corruption +10",
    primaryStat: "competence",
    secondaryStat: "ambition",
  },
  {
    id: "diplomatic_envoy",
    name: "Diplomatic Envoy",
    description: "Send an officer as a diplomatic representative to improve relations with a rival faction.",
    category: "diplomatic",
    icon: "handshake-outline",
    duration: 20,
    minCompetence: 25,
    creditsCost: 8000,
    successRewards: [
      { label: "+10 faction approval (all)", description: "Improved diplomatic standing" },
      { label: "+5 happiness", description: "Citizens appreciate diplomacy" },
    ],
    failureConsequences: "Faction approval -5, officer loyalty -5",
    primaryStat: "loyalty",
    secondaryStat: "competence",
  },
  {
    id: "trade_negotiation",
    name: "Trade Negotiation",
    description: "Dispatch an officer to negotiate favorable trade terms with neighboring settlements.",
    category: "diplomatic",
    icon: "cash-register",
    duration: 15,
    minCompetence: 30,
    creditsCost: 8000,
    successRewards: [
      { label: "+60,000 credits", description: "Favorable trade deal secured" },
      { label: "+25 trade income/tick", description: "New trade routes established" },
    ],
    failureConsequences: "Credits lost, officer corruption +5",
    primaryStat: "competence",
    secondaryStat: "corruption",
  },
  {
    id: "scavenging_expedition",
    name: "Scavenging Expedition",
    description: "Lead a team into the wasteland to recover pre-war technology and resources from abandoned facilities.",
    category: "resource",
    icon: "treasure-chest",
    duration: 10,
    minCompetence: 20,
    creditsCost: 3000,
    successRewards: [
      { label: "+500 steel", description: "Salvaged construction materials" },
      { label: "+200 goods", description: "Recovered consumer goods" },
      { label: "+2 discovered locations", description: "New areas mapped" },
    ],
    failureConsequences: "Officer loyalty -5, minor resource loss",
    primaryStat: "competence",
  },
  {
    id: "mining_survey",
    name: "Mining Survey",
    description: "Send an officer to survey potential mining sites in the surrounding wasteland for untapped resource deposits.",
    category: "resource",
    icon: "pickaxe",
    duration: 12,
    minCompetence: 25,
    creditsCost: 5000,
    successRewards: [
      { label: "+100 steel/tick for 50 ticks", description: "New mining operation" },
      { label: "+3 discovered locations", description: "Geological survey data" },
    ],
    failureConsequences: "Credits wasted, officer competence -5",
    primaryStat: "competence",
    secondaryStat: "ambition",
  },
  {
    id: "sabotage_operation",
    name: "Sabotage Operation",
    description: "Deploy an officer to sabotage rival faction infrastructure, weakening their position and influence.",
    category: "military",
    icon: "bomb",
    duration: 25,
    minCompetence: 50,
    creditsCost: 15000,
    successRewards: [
      { label: "-15 rival faction threat", description: "Enemy infrastructure damaged" },
      { label: "+10 defense rating", description: "Strategic advantage gained" },
    ],
    failureConsequences: "Faction approval -15, officer may be captured, unrest +10",
    primaryStat: "ambition",
    secondaryStat: "competence",
  },
  {
    id: "tactical_recon",
    name: "Tactical Strike Recon",
    description: "Officer conducts reconnaissance for a precision military operation against hostile forces in the wasteland.",
    category: "military",
    icon: "crosshairs-gps",
    duration: 18,
    minCompetence: 40,
    creditsCost: 12000,
    successRewards: [
      { label: "+20 defense rating", description: "Threat neutralized" },
      { label: "+5 officer XP levels", description: "Combat experience" },
      { label: "-10 crime", description: "Criminal stronghold destroyed" },
    ],
    failureConsequences: "Officer injured (unavailable 20 ticks), unrest +5",
    primaryStat: "competence",
    secondaryStat: "loyalty",
  },
  {
    id: "propaganda_campaign",
    name: "Propaganda Campaign",
    description: "Assign an officer to conduct a city-wide propaganda campaign, shaping public opinion and bolstering loyalty.",
    category: "special",
    icon: "bullhorn",
    duration: 20,
    minCompetence: 20,
    creditsCost: 8000,
    successRewards: [
      { label: "+15 happiness", description: "Public morale boosted" },
      { label: "-10 unrest", description: "Dissent suppressed" },
      { label: "+5 faction approval (all)", description: "Improved public image" },
    ],
    failureConsequences: "Happiness -5 (propaganda backfires), officer popularity -10",
    primaryStat: "loyalty",
  },
  {
    id: "tech_acquisition",
    name: "Tech Acquisition",
    description: "Dispatch an officer to acquire cutting-edge technology from black market contacts or rogue scientists.",
    category: "special",
    icon: "chip",
    duration: 30,
    minCompetence: 45,
    creditsCost: 20000,
    successRewards: [
      { label: "Complete current research", description: "Breakthrough technology acquired" },
      { label: "+20 research progress", description: "Knowledge injection" },
    ],
    failureConsequences: "Credits lost, corruption +10, officer loyalty -10",
    primaryStat: "competence",
    secondaryStat: "corruption",
  },
  {
    id: "cyber_warfare",
    name: "Cyber Warfare Strike",
    description: "Deploy an officer to lead a coordinated cyber attack against hostile faction networks, disrupting their communications and financial systems.",
    category: "intelligence",
    icon: "desktop-classic",
    duration: 22,
    minCompetence: 55,
    creditsCost: 18000,
    successRewards: [
      { label: "-20 faction threat (all)", description: "Enemy networks crippled" },
      { label: "+8 defense rating", description: "Exposed vulnerabilities patched" },
      { label: "+10,000 credits", description: "Seized digital assets" },
    ],
    failureConsequences: "Counter-hacked: -10 defense rating, officer corruption +8",
    primaryStat: "competence",
    secondaryStat: "ambition",
  },
  {
    id: "mineral_extraction",
    name: "Deep Mineral Extraction",
    description: "Send an officer to oversee a dangerous deep-earth mining operation in irradiated tunnels, extracting rare metals critical for advanced manufacturing.",
    category: "resource",
    icon: "hammer-wrench",
    duration: 16,
    minCompetence: 35,
    creditsCost: 10000,
    successRewards: [
      { label: "+800 steel", description: "Deep-earth rare metals" },
      { label: "+300 goods", description: "Refined alloy components" },
    ],
    failureConsequences: "Tunnel collapse: officer unavailable 15 ticks, -200 steel lost",
    primaryStat: "competence",
    secondaryStat: "loyalty",
  },
  {
    id: "guerrilla_ops",
    name: "Guerrilla Operations",
    description: "Embed an officer with resistance cells to conduct hit-and-run attacks against entrenched criminal organizations in the outer districts.",
    category: "military",
    icon: "kabaddi",
    duration: 28,
    minCompetence: 50,
    creditsCost: 14000,
    successRewards: [
      { label: "-20 crime", description: "Criminal networks dismantled" },
      { label: "-10 unrest", description: "Citizens feel safer" },
      { label: "+5 officer XP levels", description: "Hardened in the field" },
    ],
    failureConsequences: "Ambushed: officer loyalty -15, unrest +10, crime +5",
    primaryStat: "ambition",
    secondaryStat: "competence",
  },
  {
    id: "black_site_ops",
    name: "Black Site Operation",
    description: "Authorize an officer to run an off-the-books detention and interrogation facility, extracting critical intelligence from captured enemies.",
    category: "special",
    icon: "skull-outline",
    duration: 35,
    minCompetence: 60,
    creditsCost: 25000,
    successRewards: [
      { label: "Expose 1 traitor", description: "Mole identified and neutralized" },
      { label: "-15 crime", description: "Criminal leadership disrupted" },
      { label: "+15 faction intel", description: "Comprehensive interrogation data" },
    ],
    failureConsequences: "Scandal: happiness -10, corruption +15, officer loyalty -20",
    primaryStat: "ambition",
    secondaryStat: "corruption",
  },
];

export function canLaunchMission(
  state: GameState,
  missionId: MissionId,
  officerId: string
): { eligible: boolean; reasons: string[] } {
  const def = OFFICER_MISSIONS.find(m => m.id === missionId);
  if (!def) return { eligible: false, reasons: ["Unknown mission"] };

  const officer = state.officers.find(o => o.id === officerId);
  if (!officer) return { eligible: false, reasons: ["Officer not found"] };

  const reasons: string[] = [];

  if (!officer.appointed) {
    reasons.push("Officer must be appointed");
  }

  if (officer.competence < def.minCompetence) {
    reasons.push(`Competence too low: ${officer.competence} / ${def.minCompetence}`);
  }

  if (state.resources.credits < def.creditsCost) {
    reasons.push(`Insufficient credits: ${state.resources.credits.toLocaleString()} / ${def.creditsCost.toLocaleString()}`);
  }

  const activeMissions = state.activeMissions ?? [];
  if (activeMissions.some(m => m.officerId === officerId && !m.resolved)) {
    reasons.push("Officer already on a mission");
  }

  if (activeMissions.filter(m => !m.resolved).length >= 3) {
    reasons.push("Maximum 3 concurrent missions");
  }

  return { eligible: reasons.length === 0, reasons };
}

export function launchMission(
  state: GameState,
  missionId: MissionId,
  officerId: string
): GameState | null {
  const { eligible } = canLaunchMission(state, missionId, officerId);
  if (!eligible) return null;

  const def = OFFICER_MISSIONS.find(m => m.id === missionId)!;
  const officer = state.officers.find(o => o.id === officerId)!;

  const instance: ActiveMissionInstance = {
    missionId,
    officerId,
    officerName: officer.name,
    startTick: state.totalTicks,
    duration: def.duration,
    ticksRemaining: def.duration,
    resolved: false,
  };

  return {
    ...state,
    resources: {
      ...state.resources,
      credits: state.resources.credits - def.creditsCost,
    },
    activeMissions: [...(state.activeMissions ?? []), instance],
  };
}

export function calculateSuccessChance(officer: Officer, def: MissionDef): number {
  const competenceRatio = Math.min(2, officer.competence / Math.max(1, def.minCompetence));
  let chance = 35 + competenceRatio * 30;

  const loyalty = officer.loyalty ?? 50;
  chance += loyalty > 50 ? Math.min(15, (loyalty - 50) * 0.3) : 0;

  const ambition = officer.ambition ?? 50;
  if (ambition > 70) chance -= (ambition - 70) * 0.33;

  if (def.secondaryStat && def.secondaryStat !== "corruption") {
    const secondary = officer[def.secondaryStat] ?? 50;
    chance += (secondary - 40) * 0.2;
  }

  if (def.secondaryStat === "corruption") {
    chance -= (officer.corruption ?? 0) * 0.4;
  }

  if (officer.level > 3) chance += (officer.level - 3) * 1.5;

  const traits = officer.traits ?? [];
  if (traits.includes("efficient")) chance += 10;
  if (traits.includes("visionary")) chance += 10;
  if (traits.includes("corrupt")) chance -= 12;
  if (traits.includes("loyal")) chance += 10;
  if (traits.includes("aggressive")) chance += 5;
  if (traits.includes("cautious")) chance += 5;

  return Math.max(5, Math.min(95, Math.round(chance)));
}

/**
 * Returns a list of named modifiers that contributed to the success chance,
 * useful for surfacing the breakdown in the UI. Mirrors the math in
 * calculateSuccessChance — keep these in sync.
 */
export function getSuccessChanceBreakdown(officer: Officer, def: MissionDef): SuccessChanceFactor[] {
  const out: SuccessChanceFactor[] = [];
  const competenceRatio = Math.min(2, officer.competence / Math.max(1, def.minCompetence));
  out.push({ label: `Base + Competence (${officer.competence})`, delta: Math.round(35 + competenceRatio * 30) });

  const loyalty = officer.loyalty ?? 50;
  if (loyalty > 50) {
    const d = Math.round(Math.min(15, (loyalty - 50) * 0.3));
    if (d !== 0) out.push({ label: `Loyalty (${loyalty})`, delta: d });
  }

  const ambition = officer.ambition ?? 50;
  if (ambition > 70) {
    const d = -Math.round((ambition - 70) * 0.33);
    if (d !== 0) out.push({ label: `Ambition risk (${ambition})`, delta: d });
  }

  if (def.secondaryStat && def.secondaryStat !== "corruption") {
    const secondary = officer[def.secondaryStat] ?? 50;
    const d = Math.round((secondary - 40) * 0.2);
    if (d !== 0) out.push({ label: `${def.secondaryStat} (${secondary})`, delta: d });
  }

  if (def.secondaryStat === "corruption") {
    const d = -Math.round((officer.corruption ?? 0) * 0.4);
    if (d !== 0) out.push({ label: `Corruption (${officer.corruption ?? 0})`, delta: d });
  }

  if (officer.level > 3) {
    const d = Math.round((officer.level - 3) * 1.5);
    if (d !== 0) out.push({ label: `Veteran (Lv ${officer.level})`, delta: d });
  }

  const traits = officer.traits ?? [];
  const TRAIT_DELTAS: Record<string, number> = {
    efficient: 10, visionary: 10, corrupt: -12, loyal: 10, aggressive: 5, cautious: 5,
  };
  for (const t of traits) {
    const d = TRAIT_DELTAS[t];
    if (d) out.push({ label: `Trait: ${t}`, delta: d });
  }

  return out;
}

export function processOfficerMissionTick(state: GameState): {
  state: GameState;
  results: MissionResult[];
} {
  const missions = [...(state.activeMissions ?? [])];
  const results: MissionResult[] = [];
  let s = { ...state };

  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (m.resolved) continue;

    missions[i] = { ...m, ticksRemaining: m.ticksRemaining - 1 };

    if (missions[i].ticksRemaining <= 0) {
      missions[i] = { ...missions[i], resolved: true };

      const def = OFFICER_MISSIONS.find(d => d.id === m.missionId);
      const officer = s.officers.find(o => o.id === m.officerId);
      if (!def || !officer) continue;

      const chance = calculateSuccessChance(officer, def);
      const roll = Math.random() * 100;
      const success = roll < chance;

      const officerTraits = [...(officer.traits ?? [])];
      if (success) {
        missions[i] = { ...missions[i], outcome: "success" };
        const result = applyMissionSuccess(s, def, officer);
        s = result.state;
        s = { ...s, totalMissionsSucceeded: (s.totalMissionsSucceeded ?? 0) + 1 };
        results.push({
          missionId: m.missionId,
          officerName: m.officerName,
          success: true,
          message: `${m.officerName} completed ${def.name} successfully!`,
          rewards: result.rewards,
          officerTraits,
        });
      } else {
        missions[i] = { ...missions[i], outcome: "failure" };
        const result = applyMissionFailure(s, def, officer);
        s = result.state;
        s = { ...s, totalMissionsFailed: (s.totalMissionsFailed ?? 0) + 1 };
        results.push({
          missionId: m.missionId,
          officerName: m.officerName,
          success: false,
          message: `${m.officerName} failed ${def.name}. ${def.failureConsequences}`,
          rewards: result.consequences,
          officerTraits,
        });
      }
    }
  }

  s = { ...s, activeMissions: missions };
  return { state: s, results };
}

function applyMissionSuccess(
  state: GameState,
  def: MissionDef,
  officer: Officer
): { state: GameState; rewards: string[] } {
  let s = { ...state };
  const cs = { ...s.cityStats };
  const r = { ...s.resources };
  const rewards: string[] = [];
  // Gross credit rewards granted by this mission, folded into the lifetime
  // totalCreditsEarned tally at the final state spread below.
  let earnedCredits = 0;

  const officers = s.officers.map(o =>
    o.id === officer.id ? { ...o, xp: o.xp + def.duration * 5, loyalty: Math.min(100, o.loyalty + 3) } : o
  );
  s = { ...s, officers };

  switch (def.id) {
    case "surveillance_op":
      cs.crime = Math.max(0, cs.crime - 5);
      rewards.push("-5 crime");
      break;
    case "deep_cover":
      cs.crime = Math.max(0, cs.crime - 10);
      s = {
        ...s,
        officers: s.officers.map(o =>
          o.id === officer.id ? { ...o, xp: o.xp + 500 } : o
        ),
      };
      rewards.push("-10 crime", "+3 officer levels worth of XP");
      break;
    case "diplomatic_envoy":
      s = {
        ...s,
        factions: s.factions.map(f => ({ ...f, loyalty: Math.min(100, f.loyalty + 10) })),
      };
      cs.happiness = Math.min(100, cs.happiness + 5);
      rewards.push("+10 faction loyalty (all)", "+5 happiness");
      break;
    case "trade_negotiation":
      r.credits += 60000;
      earnedCredits += 60000;
      rewards.push("+60,000 credits");
      break;
    case "scavenging_expedition":
      applyResourceDelta(s, "steel", 500);
      applyResourceDelta(s, "goods", 200);
      rewards.push("+500 steel", "+200 goods");
      break;
    case "mining_survey":
      applyResourceDelta(s, "steel", 300);
      rewards.push("+300 steel (mineral deposits found)");
      break;
    case "sabotage_operation":
      s = {
        ...s,
        factions: s.factions.map(f => ({
          ...f,
          threat: Math.max(0, f.threat - 15),
        })),
      };
      rewards.push("-15 faction threat (all)");
      break;
    case "tactical_recon":
      cs.crime = Math.max(0, cs.crime - 10);
      s = {
        ...s,
        officers: s.officers.map(o =>
          o.id === officer.id ? { ...o, xp: o.xp + 800 } : o
        ),
      };
      rewards.push("-10 crime", "+5 officer levels worth of XP");
      break;
    case "propaganda_campaign":
      cs.happiness = Math.min(100, cs.happiness + 15);
      cs.unrest = Math.max(0, cs.unrest - 10);
      s = {
        ...s,
        factions: s.factions.map(f => ({ ...f, loyalty: Math.min(100, f.loyalty + 5) })),
      };
      rewards.push("+15 happiness", "-10 unrest", "+5 faction loyalty");
      break;
    case "tech_acquisition":
      if (s.activeResearch) {
        s = {
          ...s,
          activeResearch: {
            ...s.activeResearch,
            progress: s.activeResearch.progress + Math.floor(s.activeResearch.cost * 0.5),
          },
        };
        rewards.push("+50% current research progress");
      } else {
        rewards.push("+20 research progress");
      }
      break;
    case "cyber_warfare":
      s = {
        ...s,
        factions: s.factions.map(f => ({
          ...f,
          threat: Math.max(0, f.threat - 20),
        })),
      };
      cs.defenseRating = Math.min(100, cs.defenseRating + 8);
      r.credits += 10000;
      earnedCredits += 10000;
      rewards.push("-20 faction threat (all)", "+8 defense rating", "+10,000 credits");
      break;
    case "mineral_extraction":
      applyResourceDelta(s, "steel", 800);
      applyResourceDelta(s, "goods", 300);
      rewards.push("+800 steel", "+300 goods");
      break;
    case "guerrilla_ops":
      cs.crime = Math.max(0, cs.crime - 20);
      cs.unrest = Math.max(0, cs.unrest - 10);
      s = {
        ...s,
        officers: s.officers.map(o =>
          o.id === officer.id ? { ...o, xp: o.xp + 800 } : o
        ),
      };
      rewards.push("-20 crime", "-10 unrest", "+5 officer levels worth of XP");
      break;
    case "black_site_ops":
      cs.crime = Math.max(0, cs.crime - 15);
      rewards.push("-15 crime", "Traitor exposed in officer corps");
      break;
  }

  s = {
    ...s,
    cityStats: cs,
    resources: r,
    totalCreditsEarned: (s.totalCreditsEarned ?? 0) + earnedCredits,
  };
  return { state: s, rewards };
}

function applyMissionFailure(
  state: GameState,
  def: MissionDef,
  officer: Officer
): { state: GameState; consequences: string[] } {
  let s = { ...state };
  const consequences: string[] = [];

  s = {
    ...s,
    officers: s.officers.map(o => {
      if (o.id !== officer.id) return o;
      const updated = { ...o };
      updated.loyalty = Math.max(0, updated.loyalty - 10);
      if (def.id === "deep_cover") {
        updated.loyalty = Math.max(0, updated.loyalty - 10);
        updated.corruption = Math.min(100, (updated.corruption ?? 0) + 10);
      }
      if (def.id === "sabotage_operation") {
        updated.corruption = Math.min(100, (updated.corruption ?? 0) + 5);
      }
      if (def.id === "tech_acquisition") {
        updated.corruption = Math.min(100, (updated.corruption ?? 0) + 10);
      }
      return updated;
    }),
  };
  consequences.push("Officer loyalty reduced");

  if (def.id === "diplomatic_envoy") {
    s = {
      ...s,
      factions: s.factions.map(f => ({ ...f, loyalty: Math.max(0, f.loyalty - 5) })),
    };
    consequences.push("-5 faction loyalty");
  }

  if (def.id === "sabotage_operation") {
    s = {
      ...s,
      cityStats: { ...s.cityStats, unrest: Math.min(100, s.cityStats.unrest + 10) },
    };
    consequences.push("+10 unrest");
  }

  if (def.id === "propaganda_campaign") {
    s = {
      ...s,
      cityStats: { ...s.cityStats, happiness: Math.max(0, s.cityStats.happiness - 5) },
    };
    consequences.push("-5 happiness");
  }

  if (def.id === "cyber_warfare") {
    s = {
      ...s,
      cityStats: { ...s.cityStats, defenseRating: Math.max(0, s.cityStats.defenseRating - 10) },
      officers: s.officers.map(o => {
        if (o.id !== officer.id) return o;
        return { ...o, corruption: Math.min(100, (o.corruption ?? 0) + 8) };
      }),
    };
    consequences.push("Counter-hacked: -10 defense rating, corruption +8");
  }

  if (def.id === "mineral_extraction") {
    s = {
      ...s,
      resources: { ...s.resources, steel: Math.max(0, s.resources.steel - 200) },
    };
    consequences.push("-200 steel lost in collapse");
  }

  if (def.id === "guerrilla_ops") {
    s = {
      ...s,
      cityStats: {
        ...s.cityStats,
        unrest: Math.min(100, s.cityStats.unrest + 10),
        crime: Math.min(100, s.cityStats.crime + 5),
      },
      officers: s.officers.map(o => {
        if (o.id !== officer.id) return o;
        return { ...o, loyalty: Math.max(0, o.loyalty - 5) };
      }),
    };
    consequences.push("+10 unrest, +5 crime, officer loyalty -15");
  }

  if (def.id === "black_site_ops") {
    s = {
      ...s,
      cityStats: {
        ...s.cityStats,
        happiness: Math.max(0, s.cityStats.happiness - 10),
        corruption: Math.min(100, (s.cityStats.corruption ?? 0) + 15),
      },
      officers: s.officers.map(o => {
        if (o.id !== officer.id) return o;
        return { ...o, loyalty: Math.max(0, o.loyalty - 10) };
      }),
    };
    consequences.push("-10 happiness, +15 corruption (scandal exposed)");
  }

  return { state: s, consequences };
}

const MISSION_SUCCESS_FLAVOR = [
  "Mission accomplished. The officer has returned with results that exceed expectations.",
  "Field report received. Objectives achieved. The Commander will be pleased.",
  "Operation concluded successfully. All primary objectives met.",
  "The officer has returned from the field. The mission was a success.",
];

const MISSION_FAILURE_FLAVOR = [
  "Mission failure reported. The officer has returned, but not with good news.",
  "Operational setback. The mission did not go as planned.",
  "Field report: objectives not met. Consequences are being assessed.",
  "The officer limped back from the field. Things went sideways.",
];

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TRAIT_SUCCESS_FLAVOR: Record<string, string> = {
  efficient: "Their reputation for efficiency paid off — the operation ran like clockwork.",
  visionary: "A creative approach turned a routine op into a textbook win.",
  loyal: "Loyalty kept the team focused when things grew tense.",
  cautious: "Methodical preparation neutralized the riskiest moments before they mattered.",
  aggressive: "Aggressive tempo overwhelmed the opposition before they could react.",
  strategist: "A precise plan gave them the edge throughout.",
  perfectionist: "Obsessive attention to detail eliminated every loose end.",
};

const TRAIT_FAILURE_FLAVOR: Record<string, string> = {
  corrupt: "Reports suggest funds went missing during the op — corruption may have compromised the plan.",
  incompetent: "Basic mistakes piled up. Their incompetence was clearly a factor.",
  ambitious: "Their personal ambitions appear to have skewed the operational priorities.",
  bureaucratic: "Procedural delays gave the targets time to react.",
  embittered: "Bitterness over recent slights bled into the op. Morale never recovered.",
  aggressive: "An overly aggressive approach burned bridges they needed to keep open.",
  idealistic: "An idealistic refusal to bend the rules cost them the window.",
};

export function generateMissionMessage(
  result: MissionResult,
  gameDate: GameDate,
  totalTicks: number,
): GameMessage {
  const def = OFFICER_MISSIONS.find(m => m.id === result.missionId);
  const missionName = def?.name ?? result.missionId;
  const traits = result.officerTraits ?? [];

  if (result.success) {
    const rewardLines = result.rewards.map(r => `• ${r}`).join("\n");
    const flavorTrait = traits.find(t => TRAIT_SUCCESS_FLAVOR[t]);
    const traitLine = flavorTrait ? `\n\n${TRAIT_SUCCESS_FLAVOR[flavorTrait]}` : "";
    return {
      id: missionMessageId(result.missionId, true, totalTicks, result.officerName),
      timestamp: { ...gameDate },
      tick: totalTicks,
      category: "mission",
      title: `MISSION SUCCESS: ${missionName.toUpperCase()}`,
      body: `${pickOne(MISSION_SUCCESS_FLAVOR)}\n\nOfficer: ${result.officerName}\nMission: ${missionName}${traitLine}\n\n─── REWARDS ───\n${rewardLines}`,
      read: false,
      priority: "normal",
    };
  }

  const consequenceLines = result.rewards.map(r => `• ${r}`).join("\n");
  const blameTrait = traits.find(t => TRAIT_FAILURE_FLAVOR[t]);
  const blameLine = blameTrait
    ? `\n\nBLAME: ${TRAIT_FAILURE_FLAVOR[blameTrait]} (trait: ${blameTrait})`
    : "";
  return {
    id: missionMessageId(result.missionId, false, totalTicks, result.officerName),
    timestamp: { ...gameDate },
    tick: totalTicks,
    category: "mission",
    title: `MISSION FAILED: ${missionName.toUpperCase()}`,
    body: `${pickOne(MISSION_FAILURE_FLAVOR)}\n\nOfficer: ${result.officerName}\nMission: ${missionName}${blameLine}\n\n─── CONSEQUENCES ───\n${consequenceLines}`,
    read: false,
    priority: "high",
  };
}

/**
 * Add one completion mail exactly once. A completion can be replayed by a
 * retry/catch-up path, and a player-deleted message must stay deleted across
 * that replay and subsequent save loads.
 */
export function appendMissionResultMessage(
  state: GameState,
  result: MissionResult,
  gameDate: GameDate,
  totalTicks: number,
): GameState {
  const message = generateMissionMessage(result, gameDate, totalTicks);
  if (
    state.dismissedMessageIds?.includes(message.id) ||
    (state.messages ?? []).some((existing) => existing.id === message.id)
  ) {
    return state;
  }
  return {
    ...state,
    messages: [message, ...(state.messages ?? [])].slice(0, ARRAY_CAPS.messages),
  };
}

export function getAvailableOfficersForMission(state: GameState): Officer[] {
  const onMission = new Set(
    (state.activeMissions ?? []).filter(m => !m.resolved).map(m => m.officerId)
  );
  return state.officers.filter(o => o.appointed && !onMission.has(o.id));
}

export const MISSION_CATEGORY_LABELS: Record<MissionCategory, string> = {
  intelligence: "Intelligence",
  diplomatic: "Diplomatic",
  resource: "Resource",
  military: "Military",
  special: "Special Ops",
};

  export const OFFICER_MISSIONS_MAP: Record<string, MissionDef> = {};
  for (const m of OFFICER_MISSIONS) {
    OFFICER_MISSIONS_MAP[m.id] = m;
  }
  