import type { GameState, Faction, ExternalMegacity, TickEntry } from "./types";
import { negativeEventsAllowed } from "./calmStart";
import {
  admitCustodyGroup,
  type PowOriginKind,
  type AggregateCustodyStatus,
} from "./custody";
import {
  pushNewsItem,
  refugeeWaveNews,
  totalWarNews,
  treatyCollapsedNews,
  treatySignedNews,
  warConcludedNews,
  warExhaustionNews,
} from "./newsFeed";

export type IncidentSeverity = "minor" | "moderate" | "major" | "crisis";
export type IncidentCategory = "border" | "espionage" | "trade" | "refugee" | "territorial" | "assassination" | "sabotage" | "ideological";

export type DiplomaticIncident = {
  id: string;
  tick: number;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  description: string;
  instigatorId: string;
  instigatorName: string;
  targetId?: string;
  targetName?: string;
  resolved: boolean;
  resolvedTick?: number;
  resolution?: string;
  responseDeadline: number;
  responses: IncidentResponse[];
  reputationAtStake: number;
  loyaltyAtStake: number;
};

export type IncidentResponse = {
  id: string;
  label: string;
  description: string;
  effects: {
    reputation?: number;
    loyaltyInstigator?: number;
    loyaltyTarget?: number;
    loyaltyAll?: number;
    threatInstigator?: number;
    credits?: number;
    unrest?: number;
    crime?: number;
    // Refugee intake: immediate citizens added to the population, plus a
    // temporary "refugee workforce" production boost (ticks + fractional
    // magnitude) applied per tick in runTick while it lasts.
    populationGain?: number;
    refugeeBoostTicks?: number;
    refugeeBoostMagnitude?: number;
  };
  style?: "default" | "aggressive" | "diplomatic" | "appeasement" | "deceptive";
};

export type FactionRelation = {
  factionA: string;
  factionB: string;
  disposition: number;
  trend: "improving" | "stable" | "deteriorating";
  lastEventTick: number;
  events: string[];
};

export type WarEscalationStage = "tensions" | "skirmishes" | "open_war" | "total_war";

export type WarTimelineStage = { stage: WarEscalationStage; tick: number };
export type WarTimelineReport = { tick: number; label: string };
export type WarCapture = {
  id: string;
  count: number;
  originKind: PowOriginKind;
  originId: string | null;
  originLabel: string;
  status: AggregateCustodyStatus;
};
export type WarHistory = {
  id: string;
  belligerents: [string, string];
  belligerentNames: [string, string];
  startTick: number;
  concludedTick: number;
  outcome: string;
  finalStage: WarEscalationStage;
  casualties: { a: number; b: number };
  infrastructureDamage: { a: number; b: number };
  stages: WarTimelineStage[];
  reports: WarTimelineReport[];
  captures?: WarCapture[];
};

export type WarState = {
  id: string;
  belligerents: [string, string];
  belligerentNames: [string, string];
  stage: WarEscalationStage;
  intensity: number;
  startTick: number;
  lastEscalationTick: number;
  playerInitiated: boolean;
  casualties: { a: number; b: number };
  infrastructureDamage: { a: number; b: number };
  warWeariness: number;
  peaceOffered: boolean;
  peaceOfferTick?: number;
  captures?: WarCapture[];
  timeline?: {
    stages: WarTimelineStage[];
    reports: WarTimelineReport[];
  };
};

// The simulation advances in six-hour ticks, but wars should be measured in
// days rather than making four escalation rolls per day. One quiet day in
// every seven gives fronts room to pause while still keeping most days active.
export const WAR_TICKS_PER_DAY = 4;
export const WAR_QUIET_DAY_INTERVAL = 7;

export function isWarActiveDay(state: Pick<GameState, "totalTicks">, war: Pick<WarState, "startTick">): boolean {
  const elapsedTicks = Math.max(0, state.totalTicks - war.startTick);
  const elapsedDay = Math.floor(elapsedTicks / WAR_TICKS_PER_DAY);
  return elapsedDay % WAR_QUIET_DAY_INTERVAL !== WAR_QUIET_DAY_INTERVAL - 1;
}

export type PeaceConference = {
  id: string;
  warId: string;
  participants: string[];
  participantNames: string[];
  startTick: number;
  demands: PeaceDemand[];
  status: "negotiating" | "accepted" | "collapsed";
  roundsRemaining: number;
  playerMediator: boolean;
};

export type PeaceDemand = {
  id: string;
  fromId: string;
  fromName: string;
  demandType: "reparations" | "territory" | "disarmament" | "trade_concession" | "non_aggression" | "tribute";
  description: string;
  amount?: number;
  accepted: boolean;
};

export type Envoy = {
  id: string;
  name: string;
  targetId: string;
  targetName: string;
  skill: number;
  assignedTick: number;
  trait: EnvoyTrait;
  bonuses: { loyalty: number; influence: number; trade: number; intel: number };
};

export type EnvoyTrait = "charming" | "intimidating" | "cunning" | "scholarly" | "ruthless" | "empathetic";

export type NegotiationChain = {
  id: string;
  title: string;
  partnerId: string;
  partnerName: string;
  steps: NegotiationStep[];
  currentStep: number;
  status: "active" | "success" | "failed" | "expired";
  startTick: number;
  deadlineTick: number;
  stakesDescription: string;
};

export type NegotiationStep = {
  id: string;
  prompt: string;
  choices: NegotiationChoice[];
  chosen?: string;
  outcome?: string;
};

export type NegotiationChoice = {
  id: string;
  label: string;
  description: string;
  style: "diplomatic" | "aggressive" | "deceptive" | "generous";
  successChance: number;
  effects: {
    reputation?: number;
    loyalty?: number;
    credits?: number;
    crime?: number;
    unrest?: number;
    nextStepModifier?: number;
    chainEnd?: "success" | "failure";
  };
};

export type DispositionFactor = {
  label: string;
  value: number;
  description: string;
};

export type DiplomacyAdvancedState = {
  incidents: DiplomaticIncident[];
  factionRelations: FactionRelation[];
  wars: WarState[];
  concludedWars: WarHistory[];
  peaceConferences: PeaceConference[];
  envoys: Envoy[];
  negotiations: NegotiationChain[];
  totalIncidents: number;
  totalWars: number;
  totalPeaceConferences: number;
};

export function getDefaultAdvancedState(): DiplomacyAdvancedState {
  return {
    incidents: [],
    factionRelations: [],
    wars: [],
    concludedWars: [],
    peaceConferences: [],
    envoys: [],
    negotiations: [],
    totalIncidents: 0,
    totalWars: 0,
    totalPeaceConferences: 0,
  };
}

const ENVOY_NAMES = [
  "Ambassador Reyes", "Consul Petrova", "Attaché Nakamura", "Legate Okonkwo",
  "Emissary Blackwood", "Envoy Thorne", "Delegate Vasquez", "Plenipotentiary Chen",
  "Mediator Osei", "Commissioner Drake", "Nuncio Volkov", "Agent Fairfax",
  "Proxy Malhotra", "Herald Castellano", "Liaison Oduya", "Chancellor Weiss",
];

const ENVOY_TRAITS: EnvoyTrait[] = ["charming", "intimidating", "cunning", "scholarly", "ruthless", "empathetic"];

const TRAIT_BONUSES: Record<EnvoyTrait, Envoy["bonuses"]> = {
  charming: { loyalty: 3, influence: 1, trade: 2, intel: 0 },
  intimidating: { loyalty: -1, influence: 3, trade: 0, intel: 1 },
  cunning: { loyalty: 0, influence: 2, trade: 1, intel: 3 },
  scholarly: { loyalty: 2, influence: 0, trade: 0, intel: 2 },
  ruthless: { loyalty: -2, influence: 4, trade: 1, intel: 2 },
  empathetic: { loyalty: 4, influence: 0, trade: 2, intel: -1 },
};

export function generateEnvoy(targetId: string, targetName: string): Envoy {
  const trait = ENVOY_TRAITS[Math.floor(Math.random() * ENVOY_TRAITS.length)];
  const name = ENVOY_NAMES[Math.floor(Math.random() * ENVOY_NAMES.length)];
  const skill = 30 + Math.floor(Math.random() * 50);
  return {
    id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    targetId,
    targetName,
    skill,
    assignedTick: 0,
    trait,
    bonuses: { ...TRAIT_BONUSES[trait] },
  };
}

export const INCIDENT_TEMPLATES: {
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  descriptionTemplate: string;
  responses: IncidentResponse[];
  reputationAtStake: number;
  loyaltyAtStake: number;
}[] = [
  {
    category: "border",
    severity: "moderate",
    title: "BORDER DISPUTE",
    descriptionTemplate: "{instigator} forces have been spotted encroaching on MegaCity outer perimeter sectors. Their patrols are getting bolder.",
    reputationAtStake: 5,
    loyaltyAtStake: 8,
    responses: [
      { id: "border-negotiate", label: "NEGOTIATE BORDERS", description: "Open diplomatic channels to resolve the dispute peacefully", style: "diplomatic", effects: { reputation: 3, loyaltyInstigator: 5, credits: -2000 } },
      { id: "border-fortify", label: "FORTIFY BORDER", description: "Reinforce the disputed sectors with military presence", style: "aggressive", effects: { reputation: -2, loyaltyInstigator: -5, threatInstigator: 10, credits: -5000 } },
      { id: "border-concede", label: "CONCEDE TERRITORY", description: "Allow them to keep the disputed sectors", style: "appeasement", effects: { reputation: -5, loyaltyInstigator: 10, loyaltyAll: -3, unrest: 5 } },
      { id: "border-ignore", label: "IGNORE", description: "Do nothing and hope it resolves itself", style: "default", effects: { reputation: -1, loyaltyInstigator: -3 } },
    ],
  },
  {
    category: "espionage",
    severity: "major",
    title: "SPY RING UNCOVERED",
    descriptionTemplate: "Counter-intelligence has discovered a {instigator} spy network operating within MegaCity's critical infrastructure. Multiple agents identified.",
    reputationAtStake: 8,
    loyaltyAtStake: 12,
    responses: [
      { id: "spy-expel", label: "EXPEL AGENTS", description: "Arrest and deport all identified operatives", style: "diplomatic", effects: { reputation: 2, loyaltyInstigator: -10, crime: -3 } },
      { id: "spy-execute", label: "PUBLIC EXECUTION", description: "Make an example of the spies", style: "aggressive", effects: { reputation: -5, loyaltyInstigator: -20, loyaltyAll: -2, crime: -5, unrest: 3 } },
      { id: "spy-double", label: "TURN DOUBLE AGENTS", description: "Recruit the spies to feed disinformation", style: "deceptive", effects: { reputation: 0, loyaltyInstigator: -5 } },
      { id: "spy-exchange", label: "PRISONER EXCHANGE", description: "Trade their spies for diplomatic concessions", style: "diplomatic", effects: { reputation: 3, loyaltyInstigator: 5, credits: 3000 } },
    ],
  },
  {
    category: "trade",
    severity: "minor",
    title: "TRADE EMBARGO THREAT",
    descriptionTemplate: "{instigator} is threatening to cut off all trade routes unless their demands are met. They want preferential pricing on fuel exports.",
    reputationAtStake: 4,
    loyaltyAtStake: 6,
    responses: [
      { id: "trade-agree", label: "ACCEPT TERMS", description: "Grant preferential pricing to maintain trade", style: "appeasement", effects: { reputation: -2, loyaltyInstigator: 8, credits: -5000 } },
      { id: "trade-counter", label: "COUNTER-OFFER", description: "Propose alternative terms that benefit both sides", style: "diplomatic", effects: { reputation: 2, loyaltyInstigator: 3, credits: -2000 } },
      { id: "trade-embargo", label: "IMPOSE OWN EMBARGO", description: "Cut them off first as a show of strength", style: "aggressive", effects: { reputation: -3, loyaltyInstigator: -15, loyaltyAll: 2 } },
      { id: "trade-ignore", label: "CALL THEIR BLUFF", description: "Ignore the threat entirely", style: "default", effects: { reputation: 0, loyaltyInstigator: -5 } },
    ],
  },
  {
    category: "refugee",
    severity: "moderate",
    title: "REFUGEE CRISIS",
    descriptionTemplate: "A massive wave of refugees from {instigator} territory is approaching MegaCity walls. Thousands are seeking shelter from conflict in their homeland.",
    reputationAtStake: 7,
    loyaltyAtStake: 10,
    responses: [
      { id: "refugee-accept", label: "OPEN THE GATES", description: "Accept all refugees and provide humanitarian aid — they join the workforce", style: "diplomatic", effects: { reputation: 8, loyaltyInstigator: 12, credits: -8000, unrest: 5, populationGain: 40000, refugeeBoostTicks: 48, refugeeBoostMagnitude: 0.1 } },
      { id: "refugee-limit", label: "CONTROLLED INTAKE", description: "Accept limited numbers with screening process", style: "diplomatic", effects: { reputation: 3, loyaltyInstigator: 5, credits: -3000, unrest: 2, populationGain: 12000, refugeeBoostTicks: 24, refugeeBoostMagnitude: 0.05 } },
      { id: "refugee-refuse", label: "SEAL THE GATES", description: "Refuse entry and fortify the perimeter", style: "aggressive", effects: { reputation: -8, loyaltyInstigator: -15, loyaltyAll: -3 } },
      { id: "refugee-redirect", label: "REDIRECT TO CAMPS", description: "Set up temporary camps outside the walls", style: "default", effects: { reputation: 1, loyaltyInstigator: 2, credits: -4000 } },
    ],
  },
  {
    category: "territorial",
    severity: "major",
    title: "TERRITORIAL CLAIM",
    descriptionTemplate: "{instigator} has formally declared ownership of the Northern Waste mining sites currently operated by MegaCity prospectors. They're backing it with armed patrols.",
    reputationAtStake: 10,
    loyaltyAtStake: 15,
    responses: [
      { id: "terr-negotiate", label: "ARBITRATION", description: "Propose neutral arbitration of the territorial claim", style: "diplomatic", effects: { reputation: 5, loyaltyInstigator: 3, credits: -3000 } },
      { id: "terr-mobilize", label: "MILITARY RESPONSE", description: "Deploy forces to defend the mining operations", style: "aggressive", effects: { reputation: -3, loyaltyInstigator: -20, threatInstigator: 15, credits: -10000 } },
      { id: "terr-share", label: "JOINT OPERATION", description: "Propose shared mining rights with revenue split", style: "diplomatic", effects: { reputation: 4, loyaltyInstigator: 8, credits: -2000 } },
      { id: "terr-abandon", label: "WITHDRAW", description: "Pull out mining operations to avoid conflict", style: "appeasement", effects: { reputation: -4, loyaltyInstigator: 10, loyaltyAll: -5 } },
    ],
  },
  {
    category: "assassination",
    severity: "crisis",
    title: "ASSASSINATION ATTEMPT",
    descriptionTemplate: "An assassin linked to {instigator} was intercepted attempting to reach the Command Center. Evidence suggests this was sanctioned by their leadership.",
    reputationAtStake: 12,
    loyaltyAtStake: 20,
    responses: [
      { id: "assn-war", label: "DECLARE WAR", description: "This is an act of war. Respond with overwhelming force", style: "aggressive", effects: { reputation: -2, loyaltyInstigator: -30, threatInstigator: 25, loyaltyAll: 3 } },
      { id: "assn-demand", label: "DEMAND ACCOUNTABILITY", description: "Issue ultimatum: hand over those responsible or face consequences", style: "diplomatic", effects: { reputation: 5, loyaltyInstigator: -10 } },
      { id: "assn-covert", label: "COVERT RETALIATION", description: "Authorize a reciprocal operation against their leadership", style: "aggressive", effects: { reputation: -5, loyaltyInstigator: -15, crime: 3 } },
      { id: "assn-forgive", label: "PUBLIC FORGIVENESS", description: "Demonstrate strength through mercy in a public address", style: "diplomatic", effects: { reputation: 10, loyaltyInstigator: 5, loyaltyAll: 5, unrest: -3 } },
    ],
  },
  {
    category: "sabotage",
    severity: "major",
    title: "INFRASTRUCTURE SABOTAGE",
    descriptionTemplate: "Critical water processing facilities have been sabotaged. Forensic analysis traces the explosives to {instigator} munitions factories.",
    reputationAtStake: 8,
    loyaltyAtStake: 15,
    responses: [
      { id: "sab-retaliate", label: "RETALIATE IN KIND", description: "Authorize covert sabotage of their infrastructure", style: "aggressive", effects: { reputation: -6, loyaltyInstigator: -20, loyaltyAll: -2, crime: 3 } },
      { id: "sab-sanctions", label: "IMPOSE SANCTIONS", description: "Severe economic sanctions and trade restrictions", style: "diplomatic", effects: { reputation: 3, loyaltyInstigator: -12, credits: -3000 } },
      { id: "sab-demand-repair", label: "DEMAND REPARATIONS", description: "Force them to pay for repairs or face consequences", style: "diplomatic", effects: { reputation: 2, loyaltyInstigator: -8, credits: 5000 } },
      { id: "sab-investigate", label: "INDEPENDENT INQUIRY", description: "Commission an independent investigation before acting", style: "default", effects: { reputation: 4, loyaltyInstigator: 2 } },
    ],
  },
  {
    category: "ideological",
    severity: "moderate",
    title: "PROPAGANDA CAMPAIGN",
    descriptionTemplate: "{instigator} has launched a massive propaganda offensive against MegaCity, broadcasting lies about the sector administration's leadership across all channels.",
    reputationAtStake: 6,
    loyaltyAtStake: 8,
    responses: [
      { id: "prop-counter", label: "COUNTER-PROPAGANDA", description: "Launch your own information campaign exposing their lies", style: "diplomatic", effects: { reputation: 2, loyaltyInstigator: -5, credits: -3000, unrest: -2 } },
      { id: "prop-jam", label: "JAM THEIR SIGNALS", description: "Deploy electronic warfare to block their broadcasts", style: "aggressive", effects: { reputation: -2, loyaltyInstigator: -8 } },
      { id: "prop-truth", label: "TRANSPARENCY INITIATIVE", description: "Open MegaCity to independent journalists to show the truth", style: "diplomatic", effects: { reputation: 6, loyaltyAll: 3, unrest: -3 } },
      { id: "prop-ignore", label: "MAINTAIN SILENCE", description: "Don't dignify their propaganda with a response", style: "default", effects: { reputation: -1, loyaltyInstigator: -2, unrest: 3 } },
    ],
  },
  {
    category: "border",
    severity: "crisis",
    title: "ARMED INCURSION",
    descriptionTemplate: "{instigator} armed forces have crossed into MegaCity territory. Multiple districts report enemy combatants engaging security patrols.",
    reputationAtStake: 15,
    loyaltyAtStake: 25,
    responses: [
      { id: "incur-war", label: "FULL MOBILIZATION", description: "Declare war and deploy all available forces", style: "aggressive", effects: { reputation: 2, loyaltyInstigator: -30, threatInstigator: 30, credits: -15000 } },
      { id: "incur-defend", label: "DEFENSIVE POSTURE", description: "Repel invaders but don't cross into their territory", style: "default", effects: { reputation: 3, loyaltyInstigator: -15, threatInstigator: 10, credits: -8000 } },
      { id: "incur-negotiate", label: "EMERGENCY CEASEFIRE", description: "Request immediate ceasefire and emergency talks", style: "diplomatic", effects: { reputation: -2, loyaltyInstigator: 5, credits: -5000 } },
      { id: "incur-surrender", label: "STRATEGIC WITHDRAWAL", description: "Withdraw from contested districts to prevent casualties", style: "appeasement", effects: { reputation: -10, loyaltyInstigator: 10, loyaltyAll: -8, unrest: 10 } },
    ],
  },
  {
    category: "espionage",
    severity: "moderate",
    title: "LEAKED INTELLIGENCE",
    descriptionTemplate: "Classified MegaCity military deployment plans have appeared on {instigator} communication channels. A mole within the administration is suspected.",
    reputationAtStake: 6,
    loyaltyAtStake: 10,
    responses: [
      { id: "leak-purge", label: "INTERNAL PURGE", description: "Sweep all departments for the mole, accept collateral", style: "aggressive", effects: { reputation: -3, loyaltyAll: -4, crime: -5 } },
      { id: "leak-disinfo", label: "FEED DISINFORMATION", description: "Use the leak to feed false intelligence", style: "deceptive", effects: { reputation: 1, loyaltyInstigator: -3 } },
      { id: "leak-reform", label: "SECURITY OVERHAUL", description: "Reform information security protocols entirely", style: "default", effects: { reputation: 2, credits: -4000 } },
      { id: "leak-confront", label: "CONFRONT FACTION", description: "Publicly accuse them of espionage", style: "diplomatic", effects: { reputation: 1, loyaltyInstigator: -10 } },
    ],
  },
  {
    category: "trade",
    severity: "major",
    title: "COUNTERFEITING RING",
    descriptionTemplate: "A massive counterfeit credits operation has been traced back to {instigator}. Millions in fake currency are flooding MegaCity markets.",
    reputationAtStake: 8,
    loyaltyAtStake: 12,
    responses: [
      { id: "fake-seize", label: "SEIZE ASSETS", description: "Freeze all {instigator} assets within MegaCity", style: "aggressive", effects: { reputation: 0, loyaltyInstigator: -15, credits: 8000, crime: -3 } },
      { id: "fake-negotiate", label: "DEMAND COMPENSATION", description: "Negotiate financial restitution for damages", style: "diplomatic", effects: { reputation: 3, loyaltyInstigator: -5, credits: 5000 } },
      { id: "fake-joint", label: "JOINT INVESTIGATION", description: "Propose joint task force to root out the ring", style: "diplomatic", effects: { reputation: 4, loyaltyInstigator: 3, crime: -5 } },
      { id: "fake-ignore", label: "ABSORB LOSSES", description: "Quietly replace the counterfeit currency", style: "appeasement", effects: { reputation: -3, credits: -10000 } },
    ],
  },
  {
    category: "assassination",
    severity: "moderate",
    title: "DIPLOMAT KIDNAPPED",
    descriptionTemplate: "A MegaCity diplomatic envoy has been kidnapped while visiting {instigator} territory. Ransom demands have been received.",
    reputationAtStake: 8,
    loyaltyAtStake: 12,
    responses: [
      { id: "kidnap-pay", label: "PAY RANSOM", description: "Pay the demanded amount to secure the envoy's release", style: "appeasement", effects: { reputation: -5, loyaltyInstigator: 3, credits: -10000 } },
      { id: "kidnap-rescue", label: "COVERT RESCUE", description: "Deploy special forces to extract the envoy", style: "aggressive", effects: { reputation: 2, loyaltyInstigator: -10, credits: -5000 } },
      { id: "kidnap-negotiate", label: "NEGOTIATE RELEASE", description: "Open formal negotiations for the envoy's safe return", style: "diplomatic", effects: { reputation: 3, loyaltyInstigator: -2, credits: -3000 } },
      { id: "kidnap-ultimatum", label: "ISSUE ULTIMATUM", description: "Demand immediate release or face total embargo", style: "aggressive", effects: { reputation: 1, loyaltyInstigator: -15, threatInstigator: 10 } },
    ],
  },
];

export const NEGOTIATION_TEMPLATES: {
  title: string;
  stakesDescription: string;
  steps: Omit<NegotiationStep, "chosen" | "outcome">[];
}[] = [
  {
    title: "ARMS LIMITATION TALKS",
    stakesDescription: "Mutual reduction of military forces along the shared border. Success could prevent years of conflict.",
    steps: [
      {
        id: "arms-1",
        prompt: "Their delegation opens with a demand for a 50% reduction of your border garrison. Your military advisors consider this excessive. How do you respond?",
        choices: [
          { id: "a1-accept", label: "ACCEPT IN PRINCIPLE", description: "Agree to the 50% reduction as a gesture of goodwill", style: "generous", successChance: 80, effects: { reputation: 3, loyalty: 5, nextStepModifier: 15 } },
          { id: "a1-counter", label: "COUNTER: 25%", description: "Propose a 25% mutual reduction instead", style: "diplomatic", successChance: 60, effects: { reputation: 1, loyalty: 2, nextStepModifier: 5 } },
          { id: "a1-refuse", label: "REFUSE OUTRIGHT", description: "MegaCity's security is non-negotiable", style: "aggressive", successChance: 30, effects: { reputation: -3, loyalty: -5, nextStepModifier: -20 } },
          { id: "a1-demand", label: "COUNTER-DEMAND", description: "Demand they disarm first before you consider anything", style: "aggressive", successChance: 20, effects: { reputation: -2, loyalty: -8, nextStepModifier: -10 } },
        ],
      },
      {
        id: "arms-2",
        prompt: "Verification is the sticking point. They want unrestricted access to inspect your installations. Your intelligence chief warns this could compromise classified operations.",
        choices: [
          { id: "a2-full", label: "FULL ACCESS", description: "Grant complete inspection rights as a trust-building measure", style: "generous", successChance: 75, effects: { reputation: 4, loyalty: 8, nextStepModifier: 10 } },
          { id: "a2-partial", label: "LIMITED ACCESS", description: "Allow inspections of border facilities only", style: "diplomatic", successChance: 55, effects: { reputation: 2, loyalty: 3 } },
          { id: "a2-mutual", label: "MUTUAL INSPECTION", description: "Only if they grant equal access to their installations", style: "diplomatic", successChance: 65, effects: { reputation: 3, loyalty: 5, nextStepModifier: 5 } },
          { id: "a2-refuse", label: "DENY ACCESS", description: "Inspections are a sovereignty violation", style: "aggressive", successChance: 25, effects: { reputation: -4, loyalty: -10, chainEnd: "failure" } },
        ],
      },
      {
        id: "arms-3",
        prompt: "Final round. They propose a 5-year treaty with automatic renewal. Your generals want a shorter term. Their ambassador is losing patience.",
        choices: [
          { id: "a3-five", label: "ACCEPT 5 YEARS", description: "Long-term stability is worth the commitment", style: "diplomatic", successChance: 85, effects: { reputation: 5, loyalty: 10, chainEnd: "success" } },
          { id: "a3-three", label: "PROPOSE 3 YEARS", description: "A compromise duration with review clauses", style: "diplomatic", successChance: 60, effects: { reputation: 3, loyalty: 5, chainEnd: "success" } },
          { id: "a3-one", label: "ONE YEAR TRIAL", description: "Start small and build from there", style: "diplomatic", successChance: 40, effects: { reputation: 1, loyalty: 2, chainEnd: "success" } },
          { id: "a3-walk", label: "WALK AWAY", description: "These terms are unacceptable. End negotiations", style: "aggressive", successChance: 0, effects: { reputation: -5, loyalty: -15, chainEnd: "failure" } },
        ],
      },
    ],
  },
  {
    title: "TRADE CORRIDOR NEGOTIATIONS",
    stakesDescription: "Establishing a protected trade route through contested territory. Could transform the regional economy.",
    steps: [
      {
        id: "trade-1",
        prompt: "They want exclusive toll collection rights on the proposed corridor. Your economists estimate this would cost MegaCity 3000 credits per tick.",
        choices: [
          { id: "t1-accept", label: "ACCEPT TOLLS", description: "Revenue sharing benefits both parties", style: "generous", successChance: 80, effects: { reputation: 2, loyalty: 6, credits: -3000, nextStepModifier: 15 } },
          { id: "t1-split", label: "PROPOSE 50/50 SPLIT", description: "Equal revenue sharing on the corridor", style: "diplomatic", successChance: 65, effects: { reputation: 3, loyalty: 4, credits: -1500, nextStepModifier: 5 } },
          { id: "t1-free", label: "DEMAND FREE PASSAGE", description: "Trade routes should be open to all", style: "aggressive", successChance: 30, effects: { reputation: -1, loyalty: -5, nextStepModifier: -15 } },
          { id: "t1-build", label: "OFFER TO BUILD", description: "Fund construction in exchange for toll exemption", style: "diplomatic", successChance: 55, effects: { reputation: 4, loyalty: 5, credits: -8000, nextStepModifier: 10 } },
        ],
      },
      {
        id: "trade-2",
        prompt: "Security along the corridor is contentious. Raiders from the wasteland regularly attack caravans. Who provides military escort?",
        choices: [
          { id: "t2-joint", label: "JOINT PATROLS", description: "Shared responsibility, shared costs", style: "diplomatic", successChance: 70, effects: { reputation: 3, loyalty: 5, nextStepModifier: 10 } },
          { id: "t2-ours", label: "WE'LL HANDLE IT", description: "MegaCity security will protect all convoys", style: "generous", successChance: 85, effects: { reputation: 5, loyalty: 8, credits: -5000, nextStepModifier: 15 } },
          { id: "t2-theirs", label: "THEIR RESPONSIBILITY", description: "It's their territory, their problem", style: "aggressive", successChance: 25, effects: { reputation: -3, loyalty: -8, nextStepModifier: -10 } },
          { id: "t2-mercs", label: "HIRE MERCENARIES", description: "Third-party security to keep both sides honest", style: "diplomatic", successChance: 55, effects: { reputation: 1, loyalty: 2, credits: -4000 } },
        ],
      },
      {
        id: "trade-3",
        prompt: "The deal is almost done. They ask for one final concession: technology access for their processing plants. Your tech lead objects strongly.",
        choices: [
          { id: "t3-share", label: "SHARE TECH", description: "Technology sharing builds lasting partnerships", style: "generous", successChance: 90, effects: { reputation: 4, loyalty: 10, chainEnd: "success" } },
          { id: "t3-license", label: "LICENSE ONLY", description: "They can use it but not reverse-engineer it", style: "diplomatic", successChance: 70, effects: { reputation: 3, loyalty: 6, credits: 5000, chainEnd: "success" } },
          { id: "t3-refuse", label: "TECH IS OFF LIMITS", description: "Our technological advantage is not for sale", style: "aggressive", successChance: 35, effects: { reputation: -2, loyalty: -5, chainEnd: "failure" } },
          { id: "t3-trade", label: "TRADE FOR RESOURCES", description: "Tech access in exchange for raw material discounts", style: "diplomatic", successChance: 75, effects: { reputation: 3, loyalty: 8, chainEnd: "success" } },
        ],
      },
    ],
  },
  {
    title: "HOSTAGE CRISIS RESOLUTION",
    stakesDescription: "A rogue faction cell is holding MegaCity citizens. Every decision could mean life or death.",
    steps: [
      {
        id: "host-1",
        prompt: "The hostage-takers demand the release of 12 prisoners held in MegaCity correctional facilities. Your security advisor warns some are dangerous extremists.",
        choices: [
          { id: "h1-release", label: "RELEASE PRISONERS", description: "Save the hostages at any cost", style: "generous", successChance: 70, effects: { reputation: -3, loyalty: 5, crime: 5, nextStepModifier: 10 } },
          { id: "h1-some", label: "PARTIAL RELEASE", description: "Release non-violent prisoners only", style: "diplomatic", successChance: 50, effects: { reputation: 1, loyalty: 2, crime: 2, nextStepModifier: 0 } },
          { id: "h1-refuse", label: "NO NEGOTIATION", description: "MegaCity does not negotiate with terrorists", style: "aggressive", successChance: 30, effects: { reputation: 3, loyalty: -10, nextStepModifier: -20 } },
          { id: "h1-stall", label: "STALL FOR TIME", description: "Buy time while special forces position", style: "deceptive", successChance: 55, effects: { reputation: 0, nextStepModifier: 5 } },
        ],
      },
      {
        id: "host-2",
        prompt: "A deadline has been set. They'll begin executing hostages at dawn. Your sniper team reports a 65% chance of a clean kill on the cell leader.",
        choices: [
          { id: "h2-snipe", label: "AUTHORIZE SHOT", description: "Take the shot and storm the building", style: "aggressive", successChance: 65, effects: { reputation: 2, loyalty: -5, crime: -2 } },
          { id: "h2-extend", label: "REQUEST EXTENSION", description: "Ask for more time, offer food and water", style: "diplomatic", successChance: 50, effects: { reputation: 1, loyalty: 2, nextStepModifier: 5 } },
          { id: "h2-meet", label: "PERSONAL MEETING", description: "You go in person to demonstrate good faith", style: "generous", successChance: 70, effects: { reputation: 5, loyalty: 8, nextStepModifier: 15 } },
          { id: "h2-gas", label: "DEPLOY GAS", description: "Incapacitate everyone inside simultaneously", style: "aggressive", successChance: 55, effects: { reputation: -2, loyalty: -8, unrest: 3 } },
        ],
      },
      {
        id: "host-3",
        prompt: "The situation is reaching critical mass. Their leader wants a live broadcast to air grievances. Your media team is standing by.",
        choices: [
          { id: "h3-broadcast", label: "ALLOW BROADCAST", description: "Let them speak. Transparency over control", style: "diplomatic", successChance: 60, effects: { reputation: 3, loyalty: 5, unrest: 5, chainEnd: "success" } },
          { id: "h3-storm", label: "STORM THE BUILDING", description: "No more talking. All units, breach", style: "aggressive", successChance: 45, effects: { reputation: -3, loyalty: -10, chainEnd: "failure" } },
          { id: "h3-deal", label: "FINAL DEAL", description: "Offer safe passage out of MegaCity in exchange for hostages", style: "diplomatic", successChance: 75, effects: { reputation: -1, loyalty: 3, chainEnd: "success" } },
          { id: "h3-fake", label: "FAKE BROADCAST", description: "Set up fake broadcast as cover for assault team", style: "deceptive", successChance: 50, effects: { reputation: -4, loyalty: -5, chainEnd: "success" } },
        ],
      },
    ],
  },
  {
    title: "NON-AGGRESSION PACT RENEWAL",
    stakesDescription: "The existing peace treaty is expiring. Failure to renew could destabilize the entire region.",
    steps: [
      {
        id: "nap-1",
        prompt: "Their ambassador arrives with a new set of conditions. They want MegaCity to recognize their sovereignty over the Eastern Wastes.",
        choices: [
          { id: "n1-recognize", label: "FULL RECOGNITION", description: "Acknowledge their territorial claims formally", style: "generous", successChance: 85, effects: { reputation: 2, loyalty: 10, nextStepModifier: 20 } },
          { id: "n1-partial", label: "CONDITIONAL RECOGNITION", description: "Recognize sovereignty conditional on human rights", style: "diplomatic", successChance: 60, effects: { reputation: 4, loyalty: 5, nextStepModifier: 5 } },
          { id: "n1-reject", label: "REJECT CLAIMS", description: "The Eastern Wastes are contested territory", style: "aggressive", successChance: 30, effects: { reputation: -2, loyalty: -8, nextStepModifier: -15 } },
          { id: "n1-defer", label: "TABLE THE ISSUE", description: "Set aside territorial questions for now", style: "diplomatic", successChance: 50, effects: { reputation: 1, loyalty: 0, nextStepModifier: 0 } },
        ],
      },
      {
        id: "nap-2",
        prompt: "They request economic integration: shared currency zone, coordinated taxation, unified market regulations. Your finance minister sees opportunity but also risk.",
        choices: [
          { id: "n2-full", label: "FULL INTEGRATION", description: "Create a unified economic zone", style: "generous", successChance: 75, effects: { reputation: 5, loyalty: 12, credits: -5000, nextStepModifier: 15 } },
          { id: "n2-trade", label: "TRADE ZONE ONLY", description: "Free trade area without currency union", style: "diplomatic", successChance: 65, effects: { reputation: 3, loyalty: 6, nextStepModifier: 5 } },
          { id: "n2-limited", label: "LIMITED COOPERATION", description: "Tariff reductions on specific goods only", style: "diplomatic", successChance: 50, effects: { reputation: 1, loyalty: 3 } },
          { id: "n2-reject", label: "ECONOMIC INDEPENDENCE", description: "MegaCity's economy is not for negotiation", style: "aggressive", successChance: 25, effects: { reputation: -3, loyalty: -10, nextStepModifier: -10 } },
        ],
      },
      {
        id: "nap-3",
        prompt: "Final terms: they want the treaty duration, mutual defense clause, and a ceremonial exchange of ambassadors.",
        choices: [
          { id: "n3-full", label: "COMPREHENSIVE TREATY", description: "Accept all terms including mutual defense", style: "generous", successChance: 90, effects: { reputation: 6, loyalty: 15, chainEnd: "success" } },
          { id: "n3-partial", label: "PACT WITHOUT DEFENSE", description: "Non-aggression only, no mutual defense obligation", style: "diplomatic", successChance: 65, effects: { reputation: 3, loyalty: 8, chainEnd: "success" } },
          { id: "n3-minimal", label: "CEASEFIRE EXTENSION", description: "Simple ceasefire extension, nothing more", style: "diplomatic", successChance: 45, effects: { reputation: 0, loyalty: 2, chainEnd: "success" } },
          { id: "n3-walk", label: "COLLAPSE TALKS", description: "Walk out and let the pact expire", style: "aggressive", successChance: 0, effects: { reputation: -8, loyalty: -20, chainEnd: "failure" } },
        ],
      },
    ],
  },
];

export function getDispositionBreakdown(state: GameState, factionId: string): DispositionFactor[] {
  const factions = state.factions ?? [];
  const megacities = state.externalMegacities ?? [];
  const townships = state.townships ?? [];

  const faction = factions.find((f) => f.id === factionId);
  const megacity = megacities.find((m) => m.id === factionId);
  const township = townships.find((t) => t.id === factionId);

  if (!faction && !megacity && !township) return [];

  const factors: DispositionFactor[] = [];
  const loyalty = faction?.loyalty ?? megacity?.loyalty ?? township?.loyalty ?? 50;
  const attitude = faction?.leader?.attitude ?? megacity?.leader?.attitude ?? township?.leader?.attitude ?? "neutral";
  const reputation = state.diplomaticReputation ?? 50;
  const completedActions = (state.completedDiplomaticActions ?? {})[factionId] ?? [];
  const history = (state.diplomaticHistory ?? []).filter((h) => h.factionId === factionId);
  const adv = state.diplomacyAdvanced ?? getDefaultAdvancedState();
  const envoy = adv.envoys.find((e) => e.targetId === factionId);
  const activeWar = adv.wars.find((w) => w.belligerents.includes(factionId) && w.stage !== "tensions");

  factors.push({ label: "BASE LOYALTY", value: loyalty - 50, description: `Current loyalty: ${loyalty}/100` });

  const attModMap: Record<string, number> = { friendly: 10, neutral: 0, suspicious: -8, hostile: -20, fearful: -5 };
  factors.push({ label: "LEADER ATTITUDE", value: attModMap[attitude] ?? 0, description: `Leader is ${attitude}` });

  const repMod = Math.round((reputation - 50) * 0.4);
  factors.push({ label: "DIPLOMATIC REPUTATION", value: repMod, description: `Reputation: ${reputation}/100` });

  const successfulActions = history.filter((h) => h.outcome === "accepted").length;
  const failedActions = history.filter((h) => h.outcome === "rejected").length;
  if (successfulActions > 0) factors.push({ label: "SUCCESSFUL DIPLOMACY", value: Math.min(15, successfulActions * 2), description: `${successfulActions} successful diplomatic actions` });
  if (failedActions > 0) factors.push({ label: "FAILED APPROACHES", value: -Math.min(10, failedActions), description: `${failedActions} rejected proposals` });

  const pacts = (state.diplomaticPacts ?? []).filter((p) => p.partnerId === factionId && p.status === "active");
  if (pacts.length > 0) factors.push({ label: "ACTIVE PACTS", value: pacts.length * 5, description: `${pacts.length} active diplomatic pact(s)` });

  const trades = (state.tradeAgreements ?? []).filter((t) => t.partnerId === factionId && t.status === "active");
  if (trades.length > 0) factors.push({ label: "TRADE RELATIONS", value: trades.length * 4, description: `${trades.length} active trade agreement(s)` });

  if (completedActions.includes("send-aid")) factors.push({ label: "HUMANITARIAN AID", value: 6, description: "You sent humanitarian assistance" });
  if (completedActions.includes("rebuild-assistance")) factors.push({ label: "RECONSTRUCTION HELP", value: 8, description: "You helped rebuild their infrastructure" });
  if (completedActions.includes("medical-mission")) factors.push({ label: "MEDICAL SUPPORT", value: 5, description: "You deployed medical teams" });
  if (completedActions.includes("declare-war")) factors.push({ label: "DECLARED WAR", value: -25, description: "You declared war on them" });
  if (completedActions.includes("issue-ultimatum")) factors.push({ label: "ISSUED ULTIMATUM", value: -10, description: "You threatened them with an ultimatum" });

  if (envoy) {
    const envoyBonus = Math.round(envoy.bonuses.loyalty * (envoy.skill / 50));
    if (envoyBonus !== 0) factors.push({ label: `ENVOY: ${envoy.name.toUpperCase()}`, value: envoyBonus, description: `${envoy.trait} envoy (skill: ${envoy.skill})` });
  }

  if (activeWar) factors.push({ label: "AT WAR", value: -30, description: `Active ${activeWar.stage.replace("_", " ")} conflict` });

  if (faction) {
    const city = state.cityStats;
    if (faction.type === "law" && city.lawOrder > 60) factors.push({ label: "HIGH LAW & ORDER", value: 5, description: "Your city has strong law enforcement" });
    if (faction.type === "law" && city.lawOrder < 30) factors.push({ label: "LAWLESSNESS", value: -8, description: "Your city lacks law and order" });
    if (faction.type === "criminal" && city.crime > 50) factors.push({ label: "CRIME TOLERATED", value: 5, description: "Crime thrives in your city" });
    if (faction.type === "criminal" && city.crime < 20) factors.push({ label: "CRIME SUPPRESSED", value: -5, description: "You've cracked down on criminal activity" });
    if (faction.type === "corporate" && state.resources.credits > 50000) factors.push({ label: "WEALTHY CITY", value: 5, description: "Your treasury impresses the corporates" });
    if (faction.type === "underclass" && city.happiness < 35) factors.push({ label: "MISERABLE POPULACE", value: -8, description: "Your people are suffering" });
    if (faction.type === "underclass" && city.happiness > 65) factors.push({ label: "HAPPY CITIZENS", value: 6, description: "Your people thrive" });
    if (faction.type === "cult" && (state.buildings?.grandCathedral ?? 0) > 0) factors.push({ label: "GRAND CATHEDRAL BUILT", value: 8, description: "You built their sacred temple" });
    if (faction.type === "institutional" && city.corruption < 30) factors.push({ label: "CLEAN ADMINISTRATION", value: 7, description: "Low corruption gives the civic institutions room to operate" });
    if (faction.type === "institutional" && city.corruption > 60) factors.push({ label: "CORRUPTED OFFICES", value: -8, description: "Corruption is undermining the administrative chain" });
  }

  return factors;
}

export function getRelationshipTimeline(state: GameState, factionId: string): { tick: number; event: string; impact: number; type: string }[] {
  const history = (state.diplomaticHistory ?? []).filter((h) => h.factionId === factionId);
  const adv = state.diplomacyAdvanced ?? getDefaultAdvancedState();
  const incidents = adv.incidents.filter((i) => i.instigatorId === factionId || i.targetId === factionId);

  const timeline: { tick: number; event: string; impact: number; type: string }[] = [];

  for (const h of history) {
    const actionLabel = h.action.replace(/-/g, " ").toUpperCase();
    timeline.push({
      tick: h.tick,
      event: `${actionLabel} — ${h.outcome.toUpperCase()}`,
      impact: h.reputationChange,
      type: h.outcome === "accepted" ? "positive" : h.outcome === "rejected" ? "negative" : "neutral",
    });
  }

  for (const inc of incidents.filter((i) => i.resolved)) {
    timeline.push({
      tick: inc.resolvedTick ?? inc.tick,
      event: `${inc.title} — ${inc.resolution ?? "RESOLVED"}`,
      impact: inc.reputationAtStake,
      type: "incident",
    });
  }

  timeline.sort((a, b) => b.tick - a.tick);
  return timeline.slice(0, 50);
}

// Annexed/occupied partners are under player administration — they cannot
// instigate new diplomatic incidents (border disputes, spying, etc.).
function isPlayerControlled(p: { controlStatus?: string }): boolean {
  return p.controlStatus === "annexed" || p.controlStatus === "occupied";
}

function pickInstigator(state: GameState): { id: string; name: string } | null {
  const candidates: { id: string; name: string }[] = [];
  for (const f of state.factions) {
    if (f.isActive) candidates.push({ id: f.id, name: f.name });
  }
  for (const m of state.externalMegacities ?? []) {
    if (m.isActive && !isPlayerControlled(m)) candidates.push({ id: m.id, name: m.name });
  }
  for (const t of state.townships ?? []) {
    if ((t.status === "neutral" || t.status === "allied") && !isPlayerControlled(t)) candidates.push({ id: t.id, name: t.name });
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function maybeGenerateIncident(state: GameState): DiplomaticIncident | null {
  const adv = state.diplomacyAdvanced ?? getDefaultAdvancedState();
  const activeIncidents = adv.incidents.filter((i) => !i.resolved);
  if (activeIncidents.length >= 3) return null;

  const baseChance = 0.03;
  const reputationMod = ((state.diplomaticReputation ?? 50) - 50) * -0.0005;
  const threatMod = state.factions.reduce((s, f) => s + Math.max(0, f.threat - 50), 0) * 0.001;
  const roll = Math.random();

  if (roll > baseChance + reputationMod + threatMod) return null;

  const instigator = pickInstigator(state);
  if (!instigator) return null;

  const recentIncidentIds = new Set(adv.incidents.slice(0, 10).map((i) => i.category));
  const available = INCIDENT_TEMPLATES.filter((t) => !recentIncidentIds.has(t.category));
  const pool = available.length > 0 ? available : INCIDENT_TEMPLATES;
  const template = pool[Math.floor(Math.random() * pool.length)];

  return {
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tick: state.totalTicks,
    category: template.category,
    severity: template.severity,
    title: template.title,
    description: template.descriptionTemplate.replace(/\{instigator\}/g, instigator.name),
    instigatorId: instigator.id,
    instigatorName: instigator.name,
    resolved: false,
    responseDeadline: state.totalTicks + (template.severity === "crisis" ? 16 : template.severity === "major" ? 24 : 32),
    responses: template.responses,
    reputationAtStake: template.reputationAtStake,
    loyaltyAtStake: template.loyaltyAtStake,
  };
}

export function forceGenerateIncident(state: GameState): DiplomaticIncident | null {
  const instigator = pickInstigator(state);
  if (!instigator) return null;

  const template = INCIDENT_TEMPLATES[Math.floor(Math.random() * INCIDENT_TEMPLATES.length)];
  return {
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tick: state.totalTicks,
    category: template.category,
    severity: template.severity,
    title: template.title,
    description: template.descriptionTemplate.replace(/\{instigator\}/g, instigator.name),
    instigatorId: instigator.id,
    instigatorName: instigator.name,
    resolved: false,
    responseDeadline: state.totalTicks + (template.severity === "crisis" ? 16 : template.severity === "major" ? 24 : 32),
    responses: template.responses,
    reputationAtStake: template.reputationAtStake,
    loyaltyAtStake: template.loyaltyAtStake,
  };
}

// Refugee intake scales with the city's stature: base numbers hold up to
// ~2M citizens, then grow linearly with population, capped at 500x so
// late-game waves stay sane. Shared by resolveIncident and the incident
// response UI so displayed and applied gains never drift apart.
export function getRefugeePopScale(population: number): number {
  return Math.min(500, Math.max(1, population / 2_000_000));
}

export function resolveIncident(
  state: GameState,
  incidentId: string,
  responseId: string
): Partial<GameState> {
  const adv = { ...(state.diplomacyAdvanced ?? getDefaultAdvancedState()) };
  const incidents = [...adv.incidents];
  const idx = incidents.findIndex((i) => i.id === incidentId);
  if (idx === -1) return {};

  const incident = { ...incidents[idx] };
  const response = incident.responses.find((r) => r.id === responseId);
  if (!response) return {};

  incident.resolved = true;
  incident.resolvedTick = state.totalTicks;
  incident.resolution = response.label;
  // Once resolved, the responses array is dead weight in the save —
  // it's only consumed above (line ~722) to look up the player's
  // choice. Clearing it here saves ~150–500 bytes per resolved
  // incident across the full 30-incident cap.
  incident.responses = [];
  incidents[idx] = incident;
  adv.incidents = incidents;

  const eff = response.effects;
  let newReputation = state.diplomaticReputation ?? 50;
  if (eff.reputation) newReputation = Math.max(0, Math.min(100, newReputation + eff.reputation));

  const newFactions = state.factions.map((f) => {
    let loyaltyDelta = 0;
    if (f.id === incident.instigatorId && eff.loyaltyInstigator) loyaltyDelta += eff.loyaltyInstigator;
    if (eff.loyaltyAll) loyaltyDelta += eff.loyaltyAll;
    let threatDelta = 0;
    if (f.id === incident.instigatorId && eff.threatInstigator) threatDelta += eff.threatInstigator;
    if (loyaltyDelta === 0 && threatDelta === 0) return f;
    return {
      ...f,
      loyalty: Math.max(0, Math.min(100, f.loyalty + loyaltyDelta)),
      threat: Math.max(0, Math.min(100, f.threat + threatDelta)),
    };
  });

  const newMegacities = (state.externalMegacities ?? []).map((m) => {
    let loyaltyDelta = 0;
    if (m.id === incident.instigatorId && eff.loyaltyInstigator) loyaltyDelta += eff.loyaltyInstigator;
    if (eff.loyaltyAll) loyaltyDelta += eff.loyaltyAll;
    let threatDelta = 0;
    if (m.id === incident.instigatorId && eff.threatInstigator) threatDelta += eff.threatInstigator;
    if (loyaltyDelta === 0 && threatDelta === 0) return m;
    return {
      ...m,
      loyalty: Math.max(0, Math.min(100, m.loyalty + loyaltyDelta)),
      threat: Math.max(0, Math.min(100, m.threat + threatDelta)),
    };
  });

  let newCredits = state.resources.credits;
  if (eff.credits) newCredits += eff.credits;

  const cityStats = { ...state.cityStats };
  if (eff.unrest) cityStats.unrest = Math.max(0, Math.min(100, cityStats.unrest + eff.unrest));
  if (eff.crime) cityStats.crime = Math.max(0, Math.min(100, cityStats.crime + eff.crime));

  // Refugee intake: newcomers join the city immediately (same 100B hard
  // ceiling as the population growth loop) and grant a temporary
  // "refugee workforce" production boost consumed per tick in runTick.
  const POP_CEILING = 100_000_000_000;
  let integratedRefugees = state.integratedRefugees ?? 0;
  let refugeeBoostTicksRemaining = state.refugeeBoostTicksRemaining ?? 0;
  let refugeeBoostMagnitude = state.refugeeBoostMagnitude ?? 0;
  if (eff.populationGain && eff.populationGain > 0) {
    // Refugee columns scale with the city's stature: rival megacities hold
    // tens of millions, so intake must stay a real growth lever at scale.
    const gain = Math.round(eff.populationGain * getRefugeePopScale(state.cityStats.population));
    cityStats.population = Math.min(POP_CEILING, cityStats.population + gain);
    integratedRefugees += gain;
  }
  if (eff.refugeeBoostTicks && eff.refugeeBoostTicks > 0) {
    refugeeBoostTicksRemaining = Math.min(200, refugeeBoostTicksRemaining + eff.refugeeBoostTicks);
    refugeeBoostMagnitude = Math.max(refugeeBoostMagnitude, Math.min(0.5, eff.refugeeBoostMagnitude ?? 0.05));
  }

  const historyEntry = {
    id: `dh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tick: state.totalTicks,
    factionId: incident.instigatorId,
    factionName: incident.instigatorName,
    action: `incident:${incident.category}`,
    outcome: "accepted" as const,
    reputationChange: eff.reputation ?? 0,
  };

  return {
    diplomacyAdvanced: adv,
    diplomaticReputation: newReputation,
    diplomaticHistory: [historyEntry, ...(state.diplomaticHistory ?? [])].slice(0, 100),
    factions: newFactions,
    externalMegacities: newMegacities,
    resources: { ...state.resources, credits: newCredits },
    cityStats,
    integratedRefugees,
    refugeeBoostTicksRemaining,
    refugeeBoostMagnitude,
  };
}

export function initFactionRelations(state: GameState): FactionRelation[] {
  const entities: { id: string }[] = [
    ...state.factions.filter((f) => f.isActive),
    ...(state.externalMegacities ?? []).filter((m) => m.isActive),
  ];

  const relations: FactionRelation[] = [];
  const typeAffinities: Record<string, Record<string, number>> = {
    law: { law: 60, corporate: 55, underclass: 30, criminal: 15, cult: 25, institutional: 70 },
    criminal: { criminal: 50, underclass: 40, cult: 35, corporate: 25, law: 15, institutional: 10 },
    corporate: { corporate: 65, law: 55, underclass: 20, cult: 20, criminal: 25, institutional: 60 },
    underclass: { underclass: 55, criminal: 40, cult: 45, law: 30, corporate: 20, institutional: 35 },
    cult: { cult: 50, underclass: 45, criminal: 35, law: 25, corporate: 20, institutional: 25 },
    institutional: { institutional: 75, law: 70, corporate: 60, underclass: 35, criminal: 10, cult: 25 },
  };

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      const fa = state.factions.find((f) => f.id === a.id);
      const fb = state.factions.find((f) => f.id === b.id);
      const typeA = fa?.type;
      const typeB = fb?.type;
      let base = 40 + Math.floor(Math.random() * 20);
      if (typeA && typeB) {
        base = (typeAffinities[typeA]?.[typeB] ?? 40) + Math.floor(Math.random() * 15) - 7;
      }
      relations.push({
        factionA: a.id,
        factionB: b.id,
        disposition: Math.max(0, Math.min(100, base)),
        trend: "stable",
        lastEventTick: 0,
        events: [],
      });
    }
  }
  return relations;
}

export function processFactionToFactionRelations(state: GameState): void {
  const adv = state.diplomacyAdvanced;
  if (!adv) return;
  if (state.totalTicks % 8 !== 0) return;

  const relations = adv.factionRelations;
  if (relations.length === 0) return;

  for (const rel of relations) {
    const drift = (Math.random() - 0.5) * 4;
    rel.disposition = Math.max(5, Math.min(95, rel.disposition + drift));

    if (rel.disposition > 60) rel.trend = "improving";
    else if (rel.disposition < 35) rel.trend = "deteriorating";
    else rel.trend = "stable";

    if (Math.random() < 0.02 && state.totalTicks - rel.lastEventTick > 20) {
      const eventTypes = rel.disposition < 30
        ? ["border clash", "trade dispute", "propaganda exchange", "proxy conflict"]
        : rel.disposition > 70
          ? ["trade agreement formed", "joint patrol established", "cultural exchange", "mutual aid pact"]
          : ["diplomatic meeting", "trade delegation visit", "border inspection", "information exchange"];
      const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      rel.events = [...rel.events.slice(-9), event];
      rel.lastEventTick = state.totalTicks;

      if (rel.disposition < 30) {
        rel.disposition = Math.max(5, rel.disposition - 3);
      } else if (rel.disposition > 70) {
        rel.disposition = Math.min(95, rel.disposition + 2);
      }
    }
  }
}

export function processWarEscalation(state: GameState, entries: TickEntry[]): void {
  const adv = state.diplomacyAdvanced;
  if (!adv) return;

  for (const war of adv.wars) {
    // War state is processed once per in-game day, not once per six-hour
    // engine tick. This is the pacing boundary that keeps a declaration from
    // racing through tensions, open war, and exhaustion in a handful of days.
    // A scheduled quiet day still leaves the war in place and lets diplomacy
    // or player actions change its course without automatic attrition.
    const elapsedTicks = Math.max(0, state.totalTicks - war.startTick);
    if (elapsedTicks % WAR_TICKS_PER_DAY !== 0 || !isWarActiveDay(state, war)) {
      continue;
    }

    if (war.stage === "tensions") {
      war.intensity += 0.5;
      if (war.intensity >= 30) {
        war.stage = "skirmishes";
        war.lastEscalationTick = state.totalTicks;
        recordWarStage(war, "skirmishes", state.totalTicks, "Tensions escalated into skirmishes.");
        entries.push({ label: "WAR ESCALATION", delta: 0, unit: "", reason: `${war.belligerentNames[0]} vs ${war.belligerentNames[1]}: Tensions escalate to skirmishes`, severity: "warning" });
      }
    } else if (war.stage === "skirmishes") {
      war.intensity += 1;
      const casualtyA = Math.floor(Math.random() * 10);
      const casualtyB = Math.floor(Math.random() * 10);
      war.casualties.a += casualtyA;
      war.casualties.b += casualtyB;
      recordBattleCaptures(state, war, casualtyA, casualtyB);
      war.warWeariness += 0.3;
      if (war.intensity >= 60) {
        war.stage = "open_war";
        war.lastEscalationTick = state.totalTicks;
        recordWarStage(war, "open_war", state.totalTicks, "Open warfare declared; major engagements began.");
        entries.push({ label: "WAR ESCALATION", delta: 0, unit: "", reason: `${war.belligerentNames[0]} vs ${war.belligerentNames[1]}: Open warfare declared`, severity: "negative" });
      }
    } else if (war.stage === "open_war") {
      war.intensity += 1.5;
      const casualtyA = Math.floor(Math.random() * 50 + 10);
      const casualtyB = Math.floor(Math.random() * 50 + 10);
      war.casualties.a += casualtyA;
      war.casualties.b += casualtyB;
      recordBattleCaptures(state, war, casualtyA, casualtyB);
      war.infrastructureDamage.a += Math.floor(Math.random() * 3);
      war.infrastructureDamage.b += Math.floor(Math.random() * 3);
      war.warWeariness += 0.8;
      if (war.intensity >= 90) {
        war.stage = "total_war";
        war.lastEscalationTick = state.totalTicks;
        recordWarStage(war, "total_war", state.totalTicks, "Total war declared; the conflict mobilized all available forces.");
        entries.push({ label: "TOTAL WAR", delta: 0, unit: "", reason: `${war.belligerentNames[0]} vs ${war.belligerentNames[1]}: Total war declared`, severity: "negative" });
        // Task #493: escalation to total war is public knowledge — broadcast it.
        state.newsFeed = pushNewsItem(
          state.newsFeed,
          totalWarNews(state, war.id, war.belligerentNames[0], war.belligerentNames[1]),
        );
      }
    } else {
      const casualtyA = Math.floor(Math.random() * 100 + 30);
      const casualtyB = Math.floor(Math.random() * 100 + 30);
      war.casualties.a += casualtyA;
      war.casualties.b += casualtyB;
      recordBattleCaptures(state, war, casualtyA, casualtyB);
      war.infrastructureDamage.a += Math.floor(Math.random() * 5 + 2);
      war.infrastructureDamage.b += Math.floor(Math.random() * 5 + 2);
      war.warWeariness += 1.5;
    }

    const peaceThreshold = war.stage === "total_war" ? 20 : war.stage === "open_war" ? 30 : 40;
    const peaceChance = war.stage === "total_war" ? 0.25 : 0.15;
    if (war.warWeariness >= peaceThreshold && !war.peaceOffered && Math.random() < peaceChance) {
      war.peaceOffered = true;
      war.peaceOfferTick = state.totalTicks;
    }

    const playerInvolved = war.belligerents.includes("player") || war.belligerents.some((b) => state.factions.find((f) => f.id === b));
    if (playerInvolved) {
      const warImpact = war.stage === "total_war" ? 5 : war.stage === "open_war" ? 3 : war.stage === "skirmishes" ? 1 : 0;
      if (warImpact > 0) {
        state.cityStats.unrest = Math.min(100, state.cityStats.unrest + warImpact * 0.2);
      }
    }
  }

  // Task #493: wars that collapse from exhaustion used to vanish silently —
  // capture them before filtering so the ticker can report the fizzle.
  const exhausted = adv.wars.filter((w) => w.warWeariness >= 100 && w.stage !== "total_war");
  adv.wars = adv.wars.filter((w) => w.warWeariness < 100 || w.stage === "total_war");
  for (const war of exhausted) {
    state.newsFeed = pushNewsItem(
      state.newsFeed,
      warExhaustionNews(state, war.id, war.belligerentNames[0], war.belligerentNames[1]),
    );
    recordWarReport(war, state.totalTicks, "Hostilities collapsed under war exhaustion.");
  }
  if (exhausted.length > 0) {
    adv.concludedWars = archiveWarHistory(adv, exhausted, state.totalTicks, "Exhaustion / ceasefire").concludedWars;
  }
}

// ─── WAR-DRIVEN MIGRANT WAVES ─────────────────────────────────────────────
// Wars displace civilians: when a war escalates into open warfare or total
// war, a refugee column heads for MegaCity and the player must decide at the
// gates. Built here rather than added to INCIDENT_TEMPLATES (that array's
// count is pinned by incidentTemplateCoverage.test.ts and is drawn randomly)
// so war waves always name the real belligerents and only fire on escalation.
export function buildWarRefugeeIncident(state: GameState, war: WarState): DiplomaticIncident {
  const isTotal = war.stage === "total_war";
  // Instigator = a non-player belligerent so loyalty effects land on a real
  // faction/megacity. NPC-vs-NPC wars: index 0 is fine (neither is player).
  const idx = war.belligerents[0] === "player" ? 1 : 0;
  const scale = isTotal ? 2 : 1;
  return {
    id: `inc-warref-${war.id}-${state.totalTicks}`,
    tick: state.totalTicks,
    category: "refugee",
    severity: isTotal ? "crisis" : "major",
    title: isTotal ? "MASS EXODUS FROM THE WAR ZONE" : "WAR REFUGEES AT THE GATES",
    description: `The war between ${war.belligerentNames[0]} and ${war.belligerentNames[1]} has ${isTotal ? "escalated to total war, emptying whole districts" : "erupted into open warfare"}. Columns of displaced civilians are moving toward MegaCity seeking shelter. The city walls await the Command's decision.`,
    instigatorId: war.belligerents[idx],
    instigatorName: war.belligerentNames[idx],
    resolved: false,
    responseDeadline: state.totalTicks + (isTotal ? 16 : 24),
    responses: [
      { id: "refugee-accept", label: "OPEN THE GATES", description: "Take them all in — new citizens, new hands for the work crews", style: "diplomatic", effects: { reputation: 8, loyaltyInstigator: 10, loyaltyAll: 2, credits: -6000 * scale, unrest: 4, populationGain: 30000 * scale, refugeeBoostTicks: isTotal ? 64 : 48, refugeeBoostMagnitude: isTotal ? 0.15 : 0.1 } },
      { id: "refugee-limit", label: "CONTROLLED INTAKE", description: "Screen and admit a portion; turn the rest away", style: "diplomatic", effects: { reputation: 2, loyaltyInstigator: 4, loyaltyAll: -1, credits: -2500 * scale, unrest: 2, populationGain: 10000 * scale, refugeeBoostTicks: 24, refugeeBoostMagnitude: 0.05 } },
      { id: "refugee-refuse", label: "SEAL THE GATES", description: "Turn the columns away — the city watches, and so do the neighbors", style: "aggressive", effects: { reputation: -10, loyaltyInstigator: -12, loyaltyAll: -4, unrest: 3 } },
      { id: "refugee-redirect", label: "REDIRECT TO CAMPS", description: "Fund temporary camps outside the walls", style: "default", effects: { reputation: 1, loyaltyInstigator: 2, credits: -4000 * scale } },
    ],
    reputationAtStake: isTotal ? 10 : 7,
    loyaltyAtStake: isTotal ? 12 : 8,
  };
}

export function maybeSpawnWarRefugeeWave(state: GameState, entries: TickEntry[]): void {
  const adv = state.diplomacyAdvanced;
  if (!adv) return;
  if (!negativeEventsAllowed(state)) return;
  // One live refugee decision at a time — covers both war waves and the
  // random REFUGEE CRISIS template.
  if (adv.incidents.some((i) => !i.resolved && i.category === "refugee")) return;
  // Fires exactly on the escalation tick (processWarEscalation sets
  // lastEscalationTick = totalTicks when a stage transition happens).
  const war = adv.wars.find(
    (w) => w.lastEscalationTick === state.totalTicks && (w.stage === "open_war" || w.stage === "total_war"),
  );
  if (!war) return;
  const incident = buildWarRefugeeIncident(state, war);
  adv.incidents = [incident, ...adv.incidents].slice(0, 30);
  adv.totalIncidents++;
  entries.push({
    label: "MIGRANT WAVE",
    delta: 0,
    unit: "",
    reason: `${incident.title} — fleeing the ${war.belligerentNames[0]}–${war.belligerentNames[1]} war`,
    severity: "warning",
  });
  state.newsFeed = pushNewsItem(
    state.newsFeed,
    refugeeWaveNews(state, war.id, war.belligerentNames[0], war.belligerentNames[1]),
  );
}

export function startWar(state: GameState, targetId: string, targetName: string): WarState {
  return {
    id: `war-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    belligerents: ["player", targetId],
    belligerentNames: ["MegaCity", targetName],
    stage: "tensions",
    intensity: 10,
    startTick: state.totalTicks,
    lastEscalationTick: state.totalTicks,
    playerInitiated: true,
    casualties: { a: 0, b: 0 },
    infrastructureDamage: { a: 0, b: 0 },
    warWeariness: 0,
    peaceOffered: false,
    captures: [],
    timeline: {
      stages: [{ stage: "tensions", tick: state.totalTicks }],
      reports: [{ tick: state.totalTicks, label: "War declared; forces entered a tense standoff." }],
    },
  };
}

function finiteCaptureCount(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

/**
 * Register a structured capture against an active war and immediately expose
 * it to the custody roster. The capture id is the replay key: retrying the
 * same battle result cannot duplicate the POW group.
 */
export function recordWarCapture(
  state: GameState,
  warId: string,
  capture: Omit<WarCapture, "status"> & { status?: WarCapture["status"] },
): boolean {
  const war = state.diplomacyAdvanced?.wars.find((entry) => entry.id === warId);
  const count = finiteCaptureCount(capture.count);
  if (!war || !capture.id || count <= 0) return false;
  war.captures ??= [];
  if (war.captures.some((entry) => entry.id === capture.id)) return false;
  const normalized: WarCapture = {
    id: capture.id,
    count,
    originKind: capture.originKind,
    originId: typeof capture.originId === "string" && capture.originId ? capture.originId : null,
    originLabel: capture.originLabel || "Unknown origin",
    status: capture.status ?? "held",
  };
  war.captures.push(normalized);
  admitCustodyGroup(state, `war-capture:${war.id}:${normalized.id}`, {
    id: `pow-war-${war.id}-${normalized.id}`,
    count: normalized.count,
    role: "pow",
    legalStatus: "military",
    status: "held",
    originKind: normalized.originKind,
    originId: normalized.originId,
    originLabel: normalized.originLabel,
    sourceKind: "war",
    sourceId: normalized.id,
  });
  return true;
}

function recordBattleCaptures(
  state: GameState,
  war: WarState,
  casualtyA: number,
  casualtyB: number,
): void {
  const playerIndex = war.belligerents.indexOf("player");
  if (playerIndex < 0) return;
  const enemyIndex = playerIndex === 0 ? 1 : 0;
  const enemyCasualties = enemyIndex === 0 ? casualtyA : casualtyB;
  const count = Math.floor(Math.max(0, enemyCasualties) / 20);
  if (count <= 0) return;
  const originId = war.belligerents[enemyIndex];
  recordWarCapture(state, war.id, {
    id: `battle-${state.totalTicks}`,
    count,
    originKind: "faction",
    originId,
    originLabel: war.belligerentNames[enemyIndex] || "Unknown hostile force",
  });
}

function ensureWarTimeline(war: WarState): NonNullable<WarState["timeline"]> {
  if (!war.timeline || !Array.isArray(war.timeline.stages) || !Array.isArray(war.timeline.reports)) {
    war.timeline = {
      stages: [{ stage: war.stage, tick: war.startTick }],
      reports: [{ tick: war.startTick, label: "War declared; the conflict entered a tense standoff." }],
    };
  }
  return war.timeline;
}

function recordWarReport(war: WarState, tick: number, label: string): void {
  const timeline = ensureWarTimeline(war);
  if (!timeline.reports.some((report) => report.tick === tick && report.label === label)) {
    timeline.reports = [...timeline.reports.slice(-7), { tick, label }];
  }
}

function recordWarStage(war: WarState, stage: WarEscalationStage, tick: number, report: string): void {
  const timeline = ensureWarTimeline(war);
  if (!timeline.stages.some((entry) => entry.stage === stage)) {
    timeline.stages = [...timeline.stages, { stage, tick }];
  }
  recordWarReport(war, tick, report);
}

function toWarHistory(war: WarState, concludedTick: number, outcome: string): WarHistory {
  const timeline = ensureWarTimeline(war);
  return {
    id: war.id,
    belligerents: [...war.belligerents] as [string, string],
    belligerentNames: [...war.belligerentNames] as [string, string],
    startTick: war.startTick,
    concludedTick,
    outcome,
    finalStage: war.stage,
    casualties: { ...war.casualties },
    infrastructureDamage: { ...war.infrastructureDamage },
    stages: timeline.stages.slice(-5),
    reports: [...timeline.reports, { tick: concludedTick, label: outcome }].slice(-8),
    captures: (war.captures ?? []).map((capture) => ({ ...capture })),
  };
}

export function archiveWarHistory(adv: DiplomacyAdvancedState, wars: WarState[], tick: number, outcome: string): DiplomacyAdvancedState {
  if (wars.length === 0) return adv;
  const histories = wars.map((war) => toWarHistory(war, tick, outcome));
  return { ...adv, concludedWars: [...histories, ...(adv.concludedWars ?? [])].slice(0, 20) };
}

// Pure war-termination helper shared by the annex/occupy action handler and
// the per-tick self-heal. Removes every war whose belligerents include
// `targetId`, along with any peace conference linked to those wars. Returns
// the ended wars so callers can report them.
export function endWarsInvolving(
  adv: DiplomacyAdvancedState,
  targetId: string,
  concludedTick?: number,
  outcome = "Territory taken",
): { adv: DiplomacyAdvancedState; endedWars: WarState[] } {
  const endedWars = adv.wars.filter((w) => w.belligerents.includes(targetId));
  if (endedWars.length === 0) return { adv, endedWars };
  const endedIds = new Set(endedWars.map((w) => w.id));
  return {
    adv: {
      ...adv,
      ...archiveWarHistory(adv, endedWars, concludedTick ?? Math.max(...endedWars.map((war) => war.lastEscalationTick)), outcome),
      wars: adv.wars.filter((w) => !endedIds.has(w.id)),
      peaceConferences: adv.peaceConferences.filter((pc) => !endedIds.has(pc.warId)),
    },
    endedWars,
  };
}

// Self-heal for saves stuck "at war" with a city the player already
// conquered: annexation/occupation should have ended the war, but older
// builds never resolved it, leaving a ghost war escalating forever. Runs
// every diplomacy tick so broken saves recover on their next tick.
export function resolveWarsAgainstControlledCities(state: GameState, entries: TickEntry[]): void {
  const adv = state.diplomacyAdvanced;
  if (!adv || adv.wars.length === 0) return;

  const controlledIds = new Set<string>();
  for (const m of state.externalMegacities ?? []) {
    if (isPlayerControlled(m)) controlledIds.add(m.id);
  }
  for (const t of state.townships ?? []) {
    if (isPlayerControlled(t)) controlledIds.add(t.id);
  }
  if (controlledIds.size === 0) return;

  const ended = adv.wars.filter((w) => w.belligerents.some((b) => controlledIds.has(b)));
  if (ended.length === 0) return;
  const endedIds = new Set(ended.map((w) => w.id));
  adv.concludedWars = archiveWarHistory(adv, ended, state.totalTicks, "Occupation / annexation").concludedWars;
  adv.wars = adv.wars.filter((w) => !endedIds.has(w.id));
  adv.peaceConferences = adv.peaceConferences.filter((pc) => !endedIds.has(pc.warId));
  for (const war of ended) {
    entries.push({
      label: "WAR CONCLUDED",
      delta: 0,
      unit: "",
      reason: `${war.belligerentNames[0]} vs ${war.belligerentNames[1]}: hostilities ended — enemy territory is under our administration`,
      severity: "positive",
    });
    // Task #493: the self-heal path ends the war outside the annex/occupy
    // action handler, so it needs its own headline.
    state.newsFeed = pushNewsItem(
      state.newsFeed,
      warConcludedNews(state, war.id, war.belligerentNames[0], war.belligerentNames[1]),
    );
  }
}

export function startPeaceConference(state: GameState, warId: string): PeaceConference | null {
  const adv = state.diplomacyAdvanced ?? getDefaultAdvancedState();
  const war = adv.wars.find((w) => w.id === warId);
  if (!war) return null;

  const demands: PeaceDemand[] = [];
  if (war.casualties.a > 100 || war.casualties.b > 100) {
    demands.push({
      id: `pd-rep-${Date.now()}`,
      fromId: war.belligerents[1],
      fromName: war.belligerentNames[1],
      demandType: "reparations",
      description: `Pay ${Math.floor(war.casualties.b * 50)} credits in war reparations`,
      amount: Math.floor(war.casualties.b * 50),
      accepted: false,
    });
  }
  demands.push({
    id: `pd-nap-${Date.now()}`,
    fromId: war.belligerents[1],
    fromName: war.belligerentNames[1],
    demandType: "non_aggression",
    description: "Sign a 100-tick non-aggression pact",
    accepted: false,
  });
  if (war.stage === "total_war" || war.stage === "open_war") {
    demands.push({
      id: `pd-dis-${Date.now()}`,
      fromId: war.belligerents[1],
      fromName: war.belligerentNames[1],
      demandType: "disarmament",
      description: "Reduce military forces by 25% along the border",
      accepted: false,
    });
  }

  return {
    id: `peace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    warId,
    participants: [...war.belligerents],
    participantNames: [...war.belligerentNames],
    startTick: state.totalTicks,
    demands,
    status: "negotiating",
    roundsRemaining: 3,
    playerMediator: true,
  };
}

export function processEnvoyBonuses(state: GameState): void {
  const adv = state.diplomacyAdvanced;
  if (!adv) return;
  if (state.totalTicks % 12 !== 0) return;

  for (const envoy of adv.envoys) {
    const skillMult = envoy.skill / 100;
    const loyaltyBonus = envoy.bonuses.loyalty * skillMult;

    const faction = state.factions.find((f) => f.id === envoy.targetId);
    if (faction) {
      faction.loyalty = Math.max(0, Math.min(100, faction.loyalty + loyaltyBonus * 0.3));
      faction.influence = Math.max(0, Math.min(100, faction.influence + envoy.bonuses.influence * skillMult * 0.2));
    }
    const megacity = (state.externalMegacities ?? []).find((m) => m.id === envoy.targetId);
    if (megacity) {
      megacity.loyalty = Math.max(0, Math.min(100, megacity.loyalty + loyaltyBonus * 0.3));
      megacity.influence = Math.max(0, Math.min(100, megacity.influence + envoy.bonuses.influence * skillMult * 0.2));
    }
  }
}

export function maybeStartNegotiation(state: GameState, partnerId: string, partnerName: string): NegotiationChain | null {
  const adv = state.diplomacyAdvanced ?? getDefaultAdvancedState();
  const activeNeg = adv.negotiations.filter((n) => n.status === "active");
  if (activeNeg.length >= 2) return null;
  if (activeNeg.some((n) => n.partnerId === partnerId)) return null;

  const template = NEGOTIATION_TEMPLATES[Math.floor(Math.random() * NEGOTIATION_TEMPLATES.length)];
  return {
    id: `neg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: template.title,
    partnerId,
    partnerName,
    steps: template.steps.map((s) => ({ ...s, choices: [...s.choices] })),
    currentStep: 0,
    status: "active",
    startTick: state.totalTicks,
    deadlineTick: state.totalTicks + 100,
    stakesDescription: template.stakesDescription,
  };
}

export function resolveNegotiationChoice(
  state: GameState,
  negotiationId: string,
  choiceId: string
): Partial<GameState> {
  const adv = { ...(state.diplomacyAdvanced ?? getDefaultAdvancedState()) };
  const negotiations = [...adv.negotiations];
  const idx = negotiations.findIndex((n) => n.id === negotiationId);
  if (idx === -1) return {};

  const neg = { ...negotiations[idx] };
  const step = { ...neg.steps[neg.currentStep] };
  const choice = step.choices.find((c) => c.id === choiceId);
  if (!choice) return {};

  const roll = Math.random() * 100;
  let adjustedChance = choice.successChance;
  for (let i = 0; i < neg.currentStep; i++) {
    const prevStep = neg.steps[i];
    const prevChoice = prevStep.choices.find((c) => c.id === prevStep.chosen);
    if (prevChoice?.effects.nextStepModifier) adjustedChance += prevChoice.effects.nextStepModifier;
  }
  adjustedChance = Math.max(5, Math.min(95, adjustedChance));

  const succeeded = roll < adjustedChance;
  step.chosen = choiceId;
  step.outcome = succeeded ? "SUCCESS" : "FAILED";
  neg.steps = [...neg.steps];
  neg.steps[neg.currentStep] = step;

  let newReputation = state.diplomaticReputation ?? 50;
  const eff = choice.effects;
  if (eff.reputation) newReputation = Math.max(0, Math.min(100, newReputation + (succeeded ? eff.reputation : Math.floor(eff.reputation / 2))));

  let newCredits = state.resources.credits;
  if (eff.credits) newCredits += eff.credits;

  const newFactions = state.factions.map((f) => {
    if (f.id !== neg.partnerId) return f;
    let loyaltyDelta = 0;
    if (succeeded && eff.loyalty) loyaltyDelta += eff.loyalty;
    if (!succeeded && eff.loyalty) loyaltyDelta += Math.floor(eff.loyalty / 3);
    return { ...f, loyalty: Math.max(0, Math.min(100, f.loyalty + loyaltyDelta)) };
  });

  const statusBefore = negotiations[idx].status;
  if (eff.chainEnd || !succeeded) {
    neg.status = (eff.chainEnd === "success" && succeeded) ? "success" : "failed";
  } else {
    neg.currentStep += 1;
    if (neg.currentStep >= neg.steps.length) neg.status = "success";
  }

  negotiations[idx] = neg;
  adv.negotiations = negotiations;

  // Task #493: a negotiation chain that just concluded — either way — is a
  // diplomatic status change worth a headline. Only fire on the transition
  // out of "active" so repeat resolutions never double-report.
  let newsFeed = state.newsFeed;
  if (statusBefore === "active" && neg.status === "success") {
    newsFeed = pushNewsItem(newsFeed, treatySignedNews(state, neg.id, neg.partnerName, neg.title));
  } else if (statusBefore === "active" && neg.status === "failed") {
    newsFeed = pushNewsItem(newsFeed, treatyCollapsedNews(state, neg.id, neg.partnerName, neg.title));
  }

  return {
    diplomacyAdvanced: adv,
    diplomaticReputation: newReputation,
    factions: newFactions,
    resources: { ...state.resources, credits: newCredits },
    ...(newsFeed !== state.newsFeed ? { newsFeed } : {}),
  };
}

export function processExpiredIncidents(state: GameState): void {
  const adv = state.diplomacyAdvanced;
  if (!adv) return;

  for (const inc of adv.incidents) {
    if (!inc.resolved && state.totalTicks > inc.responseDeadline) {
      inc.resolved = true;
      inc.resolvedTick = state.totalTicks;
      inc.resolution = "EXPIRED — NO RESPONSE";

      const faction = state.factions.find((f) => f.id === inc.instigatorId);
      if (faction) {
        faction.loyalty = Math.max(0, faction.loyalty - inc.loyaltyAtStake);
      }
      const megacity = (state.externalMegacities ?? []).find((m) => m.id === inc.instigatorId);
      if (megacity) {
        megacity.loyalty = Math.max(0, megacity.loyalty - inc.loyaltyAtStake);
      }
      if (state.diplomaticReputation != null) {
        state.diplomaticReputation = Math.max(0, state.diplomaticReputation - inc.reputationAtStake);
      }
    }
  }
}

export function processExpiredNegotiations(state: GameState): void {
  const adv = state.diplomacyAdvanced;
  if (!adv) return;

  for (const neg of adv.negotiations) {
    if (neg.status === "active" && state.totalTicks > neg.deadlineTick) {
      neg.status = "expired";
    }
  }
}

export function processReputationRipple(state: GameState, factionId: string, reputationDelta: number): void {
  if (reputationDelta === 0) return;
  const ripple = reputationDelta * 0.3;

  for (const f of state.factions) {
    if (f.id === factionId) continue;
    if (!f.isActive) continue;
    f.loyalty = Math.max(0, Math.min(100, f.loyalty + ripple));
  }
  for (const m of (state.externalMegacities ?? [])) {
    if (m.id === factionId) continue;
    if (!m.isActive) continue;
    m.loyalty = Math.max(0, Math.min(100, m.loyalty + ripple));
  }
}

export function processDiplomacyTick(state: GameState, entries: TickEntry[]): void {
  if (!state.diplomacyAdvanced) {
    state.diplomacyAdvanced = getDefaultAdvancedState();
    if (state.factions.length > 0) {
      state.diplomacyAdvanced.factionRelations = initFactionRelations(state);
    }
  }

  const adv = state.diplomacyAdvanced;

  if (state.totalTicks === 8 && adv.incidents.length === 0) {
    const incident = forceGenerateIncident(state);
    if (incident) {
      adv.incidents = [incident, ...adv.incidents].slice(0, 30);
      adv.totalIncidents++;
      entries.push({ label: "DIPLOMATIC INCIDENT", delta: 0, unit: "", reason: `${incident.title}: ${incident.instigatorName}`, severity: "warning" });
    }
  }

  if (state.totalTicks === 16 && adv.negotiations.length === 0 && state.factions.length > 0) {
    const eligible = state.factions.filter((f) => f.isActive && f.loyalty >= 10);
    if (eligible.length > 0) {
      const partner = eligible[Math.floor(Math.random() * eligible.length)];
      const neg = maybeStartNegotiation(state, partner.id, partner.name);
      if (neg) {
        adv.negotiations.push(neg);
        entries.push({ label: "NEGOTIATION OPENED", delta: 0, unit: "", reason: `${neg.title} with ${partner.name}`, severity: "positive" });
      }
    }
  }

  if (state.totalTicks % 4 === 0) {
    const incident = maybeGenerateIncident(state);
    if (incident) {
      adv.incidents = [incident, ...adv.incidents].slice(0, 30);
      adv.totalIncidents++;
      entries.push({ label: "DIPLOMATIC INCIDENT", delta: 0, unit: "", reason: `${incident.title}: ${incident.instigatorName}`, severity: "warning" });
    }
  }

  processExpiredIncidents(state);
  processExpiredNegotiations(state);
  processFactionToFactionRelations(state);
  resolveWarsAgainstControlledCities(state, entries);
  processWarEscalation(state, entries);
  maybeSpawnWarRefugeeWave(state, entries);
  processEnvoyBonuses(state);

  adv.incidents = adv.incidents.slice(0, 30);
  adv.wars = adv.wars.slice(0, 10);
  adv.negotiations = adv.negotiations.slice(0, 10);
  adv.envoys = adv.envoys.slice(0, 10);
}
