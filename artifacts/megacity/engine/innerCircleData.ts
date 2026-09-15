export type InnerCircleRole = "chief_advisor" | "spymaster" | "war_marshal" | "chancellor" | "enforcer" | "diplomat" | "propagandist" | "science_advisor";

export type InnerCirclePerk = {
  id: string;
  name: string;
  description: string;
  role: InnerCircleRole;
  levelRequired: number;
  effects: {
    credits?: number;
    research?: number;
    defenseRating?: number;
    unrest?: number;
    happiness?: number;
    corruption?: number;
    lawOrder?: number;
    tradeMod?: number;
    xpBonus?: number;
  };
};

export const ROLE_LABELS: Record<InnerCircleRole, string> = {
  chief_advisor: "CHIEF ADVISOR",
  spymaster: "SPYMASTER",
  war_marshal: "WAR MARSHAL",
  chancellor: "CHANCELLOR",
  enforcer: "ENFORCER",
  diplomat: "DIPLOMAT",
  propagandist: "PROPAGANDA MINISTER",
  science_advisor: "SCIENCE ADVISOR",
};

export const ROLE_DESCRIPTIONS: Record<InnerCircleRole, string> = {
  chief_advisor: "Your right hand. Sees everything. Knows everyone. The person who tells you what you don't want to hear.",
  spymaster: "Runs the shadow network. Informants, wiretaps, and things that never officially happened.",
  war_marshal: "Commands your military operations. Turns your army from a crowd with guns into a fighting force.",
  chancellor: "Controls the treasury and economic policy. Counts every credit. Spends them reluctantly.",
  enforcer: "Your iron fist. When persuasion fails, the Enforcer doesn't.",
  diplomat: "Talks to the people you'd rather shoot. Keeps the peace. Usually.",
  propagandist: "Controls the narrative. Shapes public opinion. The truth is whatever they broadcast.",
  science_advisor: "Directs all research programs. Turns funding into breakthroughs. Occasionally into explosions.",
};

export const INNER_CIRCLE_PERKS: InnerCirclePerk[] = [
  { id: "advisor_insight", name: "STRATEGIC INSIGHT", description: "+5% research speed from advisor briefings", role: "chief_advisor", levelRequired: 1, effects: { research: 2 } },
  { id: "advisor_efficiency", name: "ADMINISTRATIVE EFFICIENCY", description: "Reduces corruption through oversight", role: "chief_advisor", levelRequired: 3, effects: { corruption: -3 } },
  { id: "advisor_foresight", name: "POLITICAL FORESIGHT", description: "Early warning on officer schemes and faction moves", role: "chief_advisor", levelRequired: 5, effects: { corruption: -2 } },
  { id: "advisor_mastery", name: "COUNCIL MASTERY", description: "+500 credits/tick from optimized governance", role: "chief_advisor", levelRequired: 8, effects: { credits: 500 } },

  { id: "spy_network", name: "INFORMANT NETWORK", description: "Passive intelligence gathering on all factions", role: "spymaster", levelRequired: 1, effects: { corruption: -2 } },
  { id: "spy_counterintel", name: "COUNTER-INTELLIGENCE", description: "Reduces enemy espionage effectiveness", role: "spymaster", levelRequired: 3, effects: { defenseRating: 1 } },
  { id: "spy_sabotage", name: "COVERT OPERATIONS", description: "Destabilize hostile factions passively", role: "spymaster", levelRequired: 5, effects: { unrest: -2 } },
  { id: "spy_omniscience", name: "TOTAL AWARENESS", description: "Nothing happens in your city without you knowing", role: "spymaster", levelRequired: 8, effects: { lawOrder: 3, corruption: -3 } },

  { id: "marshal_drill", name: "COMBAT DRILLS", description: "+1 defense from improved unit training", role: "war_marshal", levelRequired: 1, effects: { defenseRating: 1 } },
  { id: "marshal_logistics", name: "WAR LOGISTICS", description: "Reduced ammo and fuel consumption", role: "war_marshal", levelRequired: 3, effects: { defenseRating: 1 } },
  { id: "marshal_tactics", name: "TACTICAL DOCTRINE", description: "+2 defense from advanced tactical planning", role: "war_marshal", levelRequired: 5, effects: { defenseRating: 2 } },
  { id: "marshal_supremacy", name: "MILITARY SUPREMACY", description: "Your army becomes the most feared force in the wasteland", role: "war_marshal", levelRequired: 8, effects: { defenseRating: 3 } },

  { id: "chancellor_audit", name: "FISCAL AUDIT", description: "+300 credits/tick from waste reduction", role: "chancellor", levelRequired: 1, effects: { credits: 300 } },
  { id: "chancellor_trade", name: "TRADE OPTIMIZATION", description: "Better trade deals with external entities", role: "chancellor", levelRequired: 3, effects: { tradeMod: 0.1 } },
  { id: "chancellor_austerity", name: "AUSTERITY MEASURES", description: "+800 credits/tick, -1 happiness", role: "chancellor", levelRequired: 5, effects: { credits: 800, happiness: -1 } },
  { id: "chancellor_prosperity", name: "ECONOMIC PROSPERITY", description: "Your treasury grows. Your people prosper. Mostly.", role: "chancellor", levelRequired: 8, effects: { credits: 1500, happiness: 1 } },

  { id: "enforcer_presence", name: "IRON PRESENCE", description: "-2 unrest from visible enforcement", role: "enforcer", levelRequired: 1, effects: { unrest: -2 } },
  { id: "enforcer_fear", name: "FEAR DOCTRINE", description: "-3 crime rate through intimidation", role: "enforcer", levelRequired: 3, effects: { lawOrder: 2 } },
  { id: "enforcer_crackdown", name: "TARGETED CRACKDOWNS", description: "Surgical strikes on criminal networks", role: "enforcer", levelRequired: 5, effects: { unrest: -3, lawOrder: 3 } },
  { id: "enforcer_iron_fist", name: "THE IRON FIST", description: "Crime fears your name. So does everyone else.", role: "enforcer", levelRequired: 8, effects: { unrest: -4, lawOrder: 4, happiness: -2 } },

  { id: "diplomat_channels", name: "BACK CHANNELS", description: "Improved faction relations through informal contact", role: "diplomat", levelRequired: 1, effects: { happiness: 1 } },
  { id: "diplomat_treaties", name: "TREATY EXPERTISE", description: "Better terms on trade agreements and pacts", role: "diplomat", levelRequired: 3, effects: { tradeMod: 0.05, happiness: 1 } },
  { id: "diplomat_influence", name: "SPHERE OF INFLUENCE", description: "Extend your diplomatic reach to distant megacities", role: "diplomat", levelRequired: 5, effects: { happiness: 2 } },
  { id: "diplomat_hegemony", name: "DIPLOMATIC HEGEMONY", description: "Your word carries weight across the wasteland. Factions listen.", role: "diplomat", levelRequired: 8, effects: { happiness: 3, unrest: -2 } },

  { id: "prop_broadcast", name: "STATE BROADCASTS", description: "-2 unrest from controlled media messaging", role: "propagandist", levelRequired: 1, effects: { unrest: -2 } },
  { id: "prop_narrative", name: "NARRATIVE CONTROL", description: "+1 happiness through curated news and entertainment", role: "propagandist", levelRequired: 3, effects: { happiness: 1, unrest: -1 } },
  { id: "prop_censorship", name: "INFORMATION BLACKOUT", description: "Suppress dissent. Crush independent media.", role: "propagandist", levelRequired: 5, effects: { unrest: -3, corruption: 2 } },
  { id: "prop_reality", name: "MANUFACTURED REALITY", description: "The citizens believe what you tell them. All of it.", role: "propagandist", levelRequired: 8, effects: { happiness: 3, unrest: -4, corruption: 3 } },

  { id: "sci_methodology", name: "RESEARCH METHODOLOGY", description: "+10% research speed from streamlined processes", role: "science_advisor", levelRequired: 1, effects: { research: 5 } },
  { id: "sci_grants", name: "SCIENCE GRANTS", description: "Attract top researchers. Costs credits, accelerates breakthroughs.", role: "science_advisor", levelRequired: 3, effects: { research: 8, credits: -200 } },
  { id: "sci_eureka", name: "EUREKA PROTOCOLS", description: "Cross-disciplinary research programs yield unexpected results", role: "science_advisor", levelRequired: 5, effects: { research: 12 } },
  { id: "sci_singularity", name: "APPROACHING SINGULARITY", description: "Research output reaches critical mass. Progress accelerates exponentially.", role: "science_advisor", levelRequired: 8, effects: { research: 20 } },
];

export type InnerCircleMember = {
  officerId: string;
  role: InnerCircleRole;
  level: number;
  xp: number;
  xpToNext: number;
  perksUnlocked: string[];
  appointed: number;
};

export const XP_TABLE = [0, 100, 250, 500, 850, 1300, 1900, 2700, 3800, 5200];

export function xpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level >= XP_TABLE.length) return XP_TABLE[XP_TABLE.length - 1] + (level - XP_TABLE.length + 1) * 2000;
  return XP_TABLE[level];
}

export type WhisperEntry = {
  id: string;
  text: string;
  source: string;
  severity: "info" | "warning" | "danger";
  tick: number;
};

const WHISPER_POOLS: Record<string, string[]> = {
  loyalty_low: [
    "§NAME§ has been seen meeting with faction representatives after hours.",
    "§NAME§'s loyalty is wavering. They've been asking questions about your succession plan.",
    "Sources report §NAME§ has been critical of your leadership in private conversations.",
    "§NAME§ declined to attend the last three security briefings. That's not like them.",
    "Informants say §NAME§ is shopping for allies. They're building something.",
    "§NAME§ was overheard calling your last policy decision 'catastrophically misguided.'",
    "§NAME§ has been quietly transferring personal assets to accounts outside the city.",
    "§NAME§'s security clearance access logs show unusual late-night queries about exit protocols.",
    "§NAME§ refused a direct order last week. Cited 'procedural concerns.' That's a first.",
    "A coded message was intercepted from §NAME§'s office. Destination: unknown.",
  ],
  loyalty_high: [
    "§NAME§ publicly defended your policies at a sector assembly. Loudly.",
    "§NAME§ reported a bribery attempt and had the courier arrested. Loyalty confirmed.",
    "§NAME§ volunteered for the night shift. Again. Dedication or insomnia.",
    "§NAME§ turned down a lucrative private sector offer. They're staying.",
    "§NAME§ personally shut down a rumor campaign against your administration. Effective.",
    "§NAME§ donated their bonus to the city relief fund. Unprompted.",
    "§NAME§ organized a morale event for staff on their own time. Attendance was high.",
    "§NAME§ caught a security breach and handled it before it reached the press. Discretion noted.",
  ],
  corruption_high: [
    "§NAME§'s lifestyle exceeds their salary by a factor of three. Accounting has questions.",
    "An anonymous tip links §NAME§ to offshore accounts in the frontier zones.",
    "§NAME§ approved a suspicious contract last week. The winning bidder is their cousin.",
    "Evidence suggests §NAME§ has been skimming from departmental budgets.",
    "§NAME§ was spotted at an exclusive restaurant that doesn't accept government credits.",
    "§NAME§ reclassified a financial audit as 'confidential' before anyone could read it.",
    "Three whistleblowers in §NAME§'s department have been reassigned in the past month.",
    "§NAME§ has been meeting with black-market intermediaries. They claim it's 'intelligence gathering.'",
    "Cargo manifests signed by §NAME§ don't match what actually arrived. Discrepancy: 40%.",
  ],
  ambition_high: [
    "§NAME§ has been positioning themselves as an alternative leader. Subtle, but noticeable.",
    "§NAME§ is cultivating relationships across every department. Building a power base.",
    "§NAME§ requested access to classified personnel files. Purpose unclear.",
    "§NAME§ gave an unauthorized press conference. They're building a public profile.",
    "§NAME§ hired a personal speechwriter. Government officers don't usually need speechwriters.",
    "§NAME§ has been taking credit for initiatives they didn't start. Boldly.",
    "§NAME§ proposed a reorganization that would put three more departments under their control.",
    "§NAME§ has been polling their popularity among the officer corps. The results were encouraging.",
    "§NAME§ commissioned a portrait of themselves for their office. It's... large.",
  ],
  rivalry: [
    "§NAME§ and §RIVAL§ had a heated argument in the council chambers. Staff were evacuated.",
    "§NAME§ is actively undermining §RIVAL§'s department. Budget requests blocked, staff reassigned.",
    "§NAME§ leaked embarrassing documents about §RIVAL§ to the press. War has been declared.",
    "§NAME§ changed the locks on a shared conference room specifically to exclude §RIVAL§.",
    "§NAME§ and §RIVAL§ submitted contradictory policy proposals on the same day. Both cited your approval.",
    "§RIVAL§'s staff are refusing to cooperate with §NAME§'s department. Productivity is cratering.",
    "§NAME§ referred to §RIVAL§ as 'that person' in an official memo. Twice. Underlined.",
    "§NAME§ moved their office to the opposite end of the building from §RIVAL§. Without authorization.",
  ],
  general: [
    "Quiet day in the corridors of power. Which means someone is planning something.",
    "The officers are unusually cooperative today. That's either progress or conspiracy.",
    "Morale in the inner circle is holding. For now.",
    "Your command staff is functioning within acceptable parameters. That's the best we can say.",
    "No significant threats detected in the inner circle. Enjoy it while it lasts.",
    "The coffee machine on the executive floor broke again. Morale impact: significant.",
    "Someone left an anonymous suggestion in the command box: 'more snacks in briefings.'",
    "The overnight shift reports nothing unusual. Which is, in itself, unusual.",
    "Internal memo traffic is down 12% this week. Either efficiency is up or everyone's given up.",
    "Your approval rating among the inner circle is... let's call it 'room for growth.'",
    "Today's agenda was completed on time. First time this quarter. Mark the calendar.",
    "The officers are trading rumors about the next reorganization. As always.",
  ],
};

export function generateWhispers(
  members: InnerCircleMember[],
  officers: { id: string; name: string; loyalty: number; corruption: number; ambition: number; rivals: string[] }[],
  totalTicks: number
): WhisperEntry[] {
  const whispers: WhisperEntry[] = [];
  const rng = () => Math.random();

  for (const m of members) {
    const officer = officers.find((o) => o.id === m.officerId);
    if (!officer) continue;

    if (officer.loyalty < 35 && rng() < 0.6) {
      const pool = WHISPER_POOLS.loyalty_low;
      const text = pool[Math.floor(rng() * pool.length)].replace(/§NAME§/g, officer.name);
      whispers.push({ id: `w-${officer.id}-loyalty`, text, source: "Intelligence", severity: "warning", tick: totalTicks });
    } else if (officer.loyalty > 75 && rng() < 0.3) {
      const pool = WHISPER_POOLS.loyalty_high;
      const text = pool[Math.floor(rng() * pool.length)].replace(/§NAME§/g, officer.name);
      whispers.push({ id: `w-${officer.id}-loyal`, text, source: "Intelligence", severity: "info", tick: totalTicks });
    }

    if (officer.corruption > 55 && rng() < 0.5) {
      const pool = WHISPER_POOLS.corruption_high;
      const text = pool[Math.floor(rng() * pool.length)].replace(/§NAME§/g, officer.name);
      whispers.push({ id: `w-${officer.id}-corrupt`, text, source: "Internal Affairs", severity: "danger", tick: totalTicks });
    }

    if (officer.ambition > 65 && rng() < 0.4) {
      const pool = WHISPER_POOLS.ambition_high;
      const text = pool[Math.floor(rng() * pool.length)].replace(/§NAME§/g, officer.name);
      whispers.push({ id: `w-${officer.id}-ambition`, text, source: "Security", severity: "warning", tick: totalTicks });
    }

    if (officer.rivals.length > 0 && rng() < 0.3) {
      const rivalId = officer.rivals[0];
      const rival = officers.find((o) => o.id === rivalId);
      if (rival) {
        const pool = WHISPER_POOLS.rivalry;
        const text = pool[Math.floor(rng() * pool.length)]
          .replace(/§NAME§/g, officer.name)
          .replace(/§RIVAL§/g, rival.name);
        whispers.push({ id: `w-${officer.id}-rival`, text, source: "Staff", severity: "warning", tick: totalTicks });
      }
    }
  }

  if (whispers.length === 0) {
    const pool = WHISPER_POOLS.general;
    const text = pool[Math.floor(rng() * pool.length)];
    whispers.push({ id: "w-general", text, source: "Daily Briefing", severity: "info", tick: totalTicks });
  }

  return whispers.slice(0, 5);
}

export type InnerCircleState = {
  members: InnerCircleMember[];
  whispers: WhisperEntry[];
  lastWhisperTick: number;
};

export function createDefaultInnerCircleState(): InnerCircleState {
  return {
    members: [],
    whispers: [],
    lastWhisperTick: 0,
  };
}
