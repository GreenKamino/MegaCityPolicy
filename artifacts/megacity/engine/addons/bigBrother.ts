import type { PolicyDef } from "@/engine/policies";
import type { EdictDef } from "@/engine/edicts";
import type { GameEvent, Faction } from "@/engine/types";

export const BIG_BROTHER_ADDON_ID = "big-brother";

export function isBigBrotherActive(addons?: Record<string, boolean>): boolean {
  return addons?.[BIG_BROTHER_ADDON_ID] === true;
}

export function isBBContentId(id: string): boolean {
  return id.startsWith("bb_");
}

export type IdeologyType =
  | "totalitarian"
  | "collectivist"
  | "technocratic"
  | "theocratic"
  | "anarcho-syndicalist"
  | "corporatist"
  | "militarist"
  | "neo-feudalist";

export type Ideology = {
  id: IdeologyType;
  name: string;
  description: string;
  effects: {
    happiness?: number;
    unrest?: number;
    crime?: number;
    lawOrder?: number;
    corruption?: number;
    employment?: number;
    taxIncome?: number;
    researchSpeed?: number;
    defenseRating?: number;
    populationGrowthRate?: number;
  };
};

export const IDEOLOGIES: Ideology[] = [
  {
    id: "totalitarian",
    name: "Totalitarian Statism",
    description: "The Party controls all. Every thought, every word, every action monitored. Wrongthink is death. Order is absolute.",
    effects: { lawOrder: 15, crime: -10, happiness: -20, unrest: -5, corruption: 10, employment: 5, researchSpeed: -2 },
  },
  {
    id: "collectivist",
    name: "Collectivist Utopianism",
    description: "Individual desires dissolved into the collective will. All property shared. All labor communal. Dissenters re-educated.",
    effects: { happiness: -5, unrest: -8, employment: 10, taxIncome: 300, corruption: 5, crime: -3 },
  },
  {
    id: "technocratic",
    name: "Technocratic Rationalism",
    description: "Governance by algorithm. Emotion eliminated from policy. Citizens are data points. Efficiency is the only morality.",
    effects: { researchSpeed: 5, employment: 3, happiness: -10, corruption: -5, lawOrder: 5 },
  },
  {
    id: "theocratic",
    name: "Theocratic Absolutism",
    description: "The Machine-God speaks through the High Priest of Circuits. Heresy is punished. Faith is mandatory. Questioning is sin.",
    effects: { unrest: -10, happiness: -8, crime: -5, corruption: 8, researchSpeed: -3, lawOrder: 8 },
  },
  {
    id: "anarcho-syndicalist",
    name: "Anarcho-Syndicalism",
    description: "Abolish all hierarchy. Workers own the means. Councils replace commanders. Freedom above safety. Chaos above order.",
    effects: { happiness: 10, unrest: 10, crime: 5, lawOrder: -15, employment: 5, corruption: -5 },
  },
  {
    id: "corporatist",
    name: "Corporate Neo-Feudalism",
    description: "Corporations are the new lords. Citizens are employees. Loyalty is measured in productivity. Termination is literal.",
    effects: { taxIncome: 500, employment: 8, happiness: -12, corruption: 12, crime: -2, lawOrder: 3 },
  },
  {
    id: "militarist",
    name: "Militant Supremacism",
    description: "Conflict is harmony. Strength is the only right. Every citizen a soldier. Every day a battle. Weakness is treason.",
    effects: { defenseRating: 10, lawOrder: 10, happiness: -15, unrest: -5, employment: 5, crime: -8, populationGrowthRate: -0.002 },
  },
  {
    id: "neo-feudalist",
    name: "Neo-Feudal Aristocracy",
    description: "The strong rule. The weak serve. Natural hierarchy restored. Titles inherited. Justice is privilege. Poverty is destiny.",
    effects: { corruption: 15, taxIncome: 400, happiness: -10, unrest: 5, crime: 3, employment: -3 },
  },
];

export type PsychProfile =
  | "compliant"
  | "dissident"
  | "zealot"
  | "broken"
  | "defiant"
  | "indoctrinated"
  | "paranoid"
  | "numb";

export type CitizenPsychology = {
  id: PsychProfile;
  name: string;
  description: string;
  percentOfPop: number;
};

export const CITIZEN_PSYCHOLOGIES: CitizenPsychology[] = [
  { id: "compliant", name: "Compliant", description: "Obeys without question. Reports neighbors. Attends mandatory rallies. Model citizen.", percentOfPop: 0.35 },
  { id: "indoctrinated", name: "Indoctrinated", description: "Genuinely believes Party doctrine. Volunteers for surveillance duty. Reports wrongthinkers enthusiastically.", percentOfPop: 0.15 },
  { id: "numb", name: "Emotionally Numb", description: "Has surrendered inner life. Goes through motions. Neither resists nor supports. Simply exists.", percentOfPop: 0.20 },
  { id: "paranoid", name: "Paranoid", description: "Trusts no one. Suspects everyone of being an informant. Speaks in code. Sleeps with one eye open.", percentOfPop: 0.10 },
  { id: "dissident", name: "Dissident", description: "Secretly opposes the regime. Passes forbidden literature. Whispers of revolution. Risks everything.", percentOfPop: 0.08 },
  { id: "defiant", name: "Openly Defiant", description: "Refuses to comply. Speaks against the Party publicly. Will not break. Marked for re-education.", percentOfPop: 0.02 },
  { id: "zealot", name: "True Believer Zealot", description: "Fanatically devoted. Would kill for the ideology. Sees enemies everywhere. The Party's weapon.", percentOfPop: 0.05 },
  { id: "broken", name: "Psychologically Broken", description: "Re-education was too thorough. Barely functional. Mutters slogans. The system's collateral damage.", percentOfPop: 0.05 },
];

export type CensorshipLevel = "none" | "selective" | "heavy" | "total";

export type PropagandaChannel =
  | "state-media"
  | "public-screens"
  | "neural-broadcast"
  | "education-system"
  | "workplace-indoctrination"
  | "informant-network";

export type BannedContent = {
  id: string;
  name: string;
  description: string;
  unrestEffect: number;
  happinessEffect: number;
  crimeEffect: number;
};

export const BANNED_CONTENT_LIST: BannedContent[] = [
  { id: "pre-war-history", name: "Pre-War Historical Records", description: "All records of the world before the catastrophe. The past is what the Party says it is.", unrestEffect: -2, happinessEffect: -3, crimeEffect: -1 },
  { id: "foreign-media", name: "Foreign Media & Broadcasts", description: "Any media originating outside city borders. Outside influence is contamination.", unrestEffect: -3, happinessEffect: -2, crimeEffect: -1 },
  { id: "philosophy-texts", name: "Philosophy & Critical Thought", description: "Works encouraging independent thinking. Socrates, Kant, Huxley — all purged.", unrestEffect: -2, happinessEffect: -4, crimeEffect: 0 },
  { id: "religious-texts", name: "Unapproved Religious Texts", description: "Only state-sanctioned faith permitted. All other scripture is wrongthink.", unrestEffect: -1, happinessEffect: -3, crimeEffect: -1 },
  { id: "art-subversive", name: "Subversive Art & Music", description: "Creative works that question authority. Beauty is a weapon against the state.", unrestEffect: -2, happinessEffect: -5, crimeEffect: 0 },
  { id: "science-journals", name: "Independent Science Publications", description: "Only Party-approved research published. Inconvenient truths are eliminated.", unrestEffect: -1, happinessEffect: -2, crimeEffect: 0 },
  { id: "personal-diaries", name: "Personal Journals & Diaries", description: "Private thought is dangerous thought. Writing is evidence. Burn it all.", unrestEffect: -1, happinessEffect: -6, crimeEffect: -1 },
  { id: "encrypted-comms", name: "Encrypted Communications", description: "If you need privacy, you have something to hide. All encryption is treason.", unrestEffect: -2, happinessEffect: -3, crimeEffect: -2 },
  { id: "humor-satire", name: "Political Humor & Satire", description: "Jokes about the Party are acts of war. Laughter is resistance. Silence it.", unrestEffect: -1, happinessEffect: -4, crimeEffect: 0 },
  { id: "resistance-pamphlets", name: "Resistance Pamphlets", description: "Underground literature calling for rebellion. Possession is a capital offense.", unrestEffect: -3, happinessEffect: -2, crimeEffect: -2 },
  { id: "pre-war-fiction", name: "Pre-Catastrophe Fiction", description: "Novels depicting freedom, love, and hope. Dangerous fantasies that weaken resolve.", unrestEffect: -1, happinessEffect: -5, crimeEffect: 0 },
  { id: "genetic-research", name: "Unauthorized Genetic Research", description: "Unregulated gene studies threaten the purity of the population model.", unrestEffect: 0, happinessEffect: -1, crimeEffect: -1 },
];

export const BB_BUILDINGS: { id: string; name: string; category: string; description: string; baseCost: number; perTickCost: number }[] = [
  { id: "bb_ministry_of_truth", name: "Bureau of Convenient Facts", category: "propaganda", description: "Central information control facility. All news, history, and records are rewritten here. Reality is what we say it is.", baseCost: 25000, perTickCost: 800 },
  { id: "bb_ministry_of_love", name: "Bureau of Aggressive Hugs", category: "re-education", description: "Re-education and interrogation complex. Citizens enter as dissidents. They leave as believers. Or they don't leave.", baseCost: 30000, perTickCost: 1200 },
  { id: "bb_ministry_of_peace", name: "Bureau of Friendly Explosions", category: "military", description: "War coordination center disguised as a peace institution. Manages external conflicts and internal purges.", baseCost: 35000, perTickCost: 1000 },
  { id: "bb_ministry_of_plenty", name: "Bureau of Imaginary Surplus", category: "economic", description: "Resource allocation bureau that announces abundance while managing scarcity. The chocolate ration has been increased.", baseCost: 20000, perTickCost: 600 },
  { id: "bb_telescreen_factory", name: "Snitchscreen Manufacturing Plant", category: "surveillance", description: "Mass produces two-way snitchscreens for mandatory installation in every dwelling, workplace, and public space.", baseCost: 15000, perTickCost: 400 },
  { id: "bb_thought_police_hq", name: "Vibe Inspectors Headquarters", category: "enforcement", description: "Central command for the Vibe Squad. Monitors neural patterns, facial expressions, and sleep-talking for wrongthink.", baseCost: 40000, perTickCost: 1500 },
  { id: "bb_memory_hole_facility", name: "Forget Chute Facility", category: "propaganda", description: "Industrial document destruction complex. Inconvenient facts fed into furnaces. History continuously corrected.", baseCost: 12000, perTickCost: 300 },
  { id: "bb_newspeak_institute", name: "Simpletalk Institute", category: "propaganda", description: "Linguistic research center developing simplified language. Fewer words = fewer thoughts = fewer crimes.", baseCost: 18000, perTickCost: 500 },
  { id: "bb_children_spy_academy", name: "Snitch Cub Academy", category: "enforcement", description: "Training facility for child informants. Children report parents for wrongthink. Family loyalty is disloyalty to the state.", baseCost: 10000, perTickCost: 350 },
  { id: "bb_public_execution_plaza", name: "Public Execution Plaza", category: "enforcement", description: "Open-air venue for public punishments and executions. Attendance is mandatory. Fear is the foundation of order.", baseCost: 8000, perTickCost: 200 },
  { id: "bb_two_minutes_hate_arena", name: "Two Minutes Rage Arena", category: "propaganda", description: "Mass gathering venue where citizens scream hatred at designated enemies. Catharsis through directed fury.", baseCost: 12000, perTickCost: 300 },
  { id: "bb_room_101_complex", name: "Suite Nope Complex", category: "re-education", description: "Personalized fear facility. Every citizen's worst nightmare made real. Nobody resists Suite Nope. Nobody.", baseCost: 50000, perTickCost: 2000 },
  { id: "bb_propaganda_broadcast_tower", name: "Propaganda Broadcast Tower", category: "propaganda", description: "High-powered transmitter broadcasting Party messages 24/7. Cannot be turned off. Cannot be ignored.", baseCost: 14000, perTickCost: 350 },
  { id: "bb_book_burning_furnace", name: "Book Burning Furnace", category: "censorship", description: "Industrial-scale furnace for destroying banned literature, art, and any unapproved media. The past is erased.", baseCost: 6000, perTickCost: 150 },
  { id: "bb_informant_coordination_center", name: "Informant Coordination Center", category: "surveillance", description: "Hub for managing the citizen informant network. 1 in 5 citizens reports on the others. Trust no one.", baseCost: 15000, perTickCost: 500 },
  { id: "bb_neural_compliance_lab", name: "Neural Compliance Lab", category: "re-education", description: "Implant facility for loyalty chips and behavior modification neural devices. Voluntary compliance replaced by hardware.", baseCost: 45000, perTickCost: 1800 },
  { id: "bb_state_orphanage", name: "State Orphanage Complex", category: "social", description: "Children of dissidents raised as loyal Party members. Family bonds severed. The state is the only parent.", baseCost: 10000, perTickCost: 400 },
  { id: "bb_victory_square", name: "Obedience Square Monument", category: "propaganda", description: "Massive monument to Party greatness. Eternal flame burns for the Leader. Pilgrimages mandatory on Obedience Day.", baseCost: 20000, perTickCost: 250 },
  { id: "bb_surveillance_drone_nest", name: "Surveillance Drone Nest", category: "surveillance", description: "Automated drone launch facility. Thousands of micro-drones patrol every corridor, alley, and rooftop.", baseCost: 22000, perTickCost: 700 },
  { id: "bb_censorship_bureau", name: "Censorship Bureau", category: "censorship", description: "Central office reviewing all publications, broadcasts, art, and communications. Nothing reaches the public without approval.", baseCost: 16000, perTickCost: 450 },
  { id: "bb_loyalty_testing_center", name: "Loyalty Testing Center", category: "enforcement", description: "Random citizens summoned for loyalty assessment. Failure means re-education. Refusal means disappearance.", baseCost: 12000, perTickCost: 400 },
  { id: "bb_doublethink_training_center", name: "Brainpretzel Training Center", category: "re-education", description: "Citizens learn to hold two contradictory beliefs simultaneously. Conflict is Harmony. Liberty is Burden. Cluelessness is Power.", baseCost: 18000, perTickCost: 550 },
  { id: "bb_inner_party_quarters", name: "Supreme Circle Quarters", category: "social", description: "Luxurious housing for Party elites. Real food, real books, real freedom — hidden behind concrete walls.", baseCost: 30000, perTickCost: 900 },
  { id: "bb_unperson_processing", name: "Nobody'd Processing Center", category: "enforcement", description: "Facility where erased citizens are processed. All records deleted. All photos altered. They never existed.", baseCost: 25000, perTickCost: 800 },
  { id: "bb_victory_gin_distillery", name: "Compliance Juice Distillery", category: "economic", description: "Mass production of cheap, harsh spirits for the underfolk. Keep them drunk. Keep them docile. Keep them grateful.", baseCost: 8000, perTickCost: 200 },
];

export const BB_UNIT_TYPES: { id: string; name: string; description: string }[] = [
  { id: "bb_thought_police_agents", name: "Vibe Inspector Agents", description: "Elite plainclothes operatives who infiltrate every level of society. They hear your whispers. They read your face." },
  { id: "bb_junior_spies", name: "Snitch Cub Cadets", description: "Indoctrinated children trained to inform on family, friends, and teachers. The Party's youngest weapons." },
  { id: "bb_memory_hole_operators", name: "Forget Chute Operators", description: "Skilled revisers who rewrite history in real-time. Today's ally is tomorrow's enemy, and always was." },
  { id: "bb_telescreen_monitors", name: "Snitchscreen Monitors", description: "Watchers who observe citizens through mandatory snitchscreens. Every room. Every moment. Every whisper." },
  { id: "bb_propaganda_officers", name: "Propaganda Officers", description: "Specialists in mass manipulation and truth construction. They don't lie — they create alternative realities." },
  { id: "bb_re_education_wardens", name: "Re-Education Wardens", description: "Interrogators and behavioral adjustment specialists. Patient, methodical, and absolutely certain of their righteousness." },
  { id: "bb_censorship_reviewers", name: "Censorship Reviewers", description: "Analysts who screen all media for thought-contamination. A single unapproved word can destroy a career." },
  { id: "bb_informant_handlers", name: "Informant Handlers", description: "Officers who manage networks of civilian informants. They know who talks, who listens, who suspects." },
  { id: "bb_loyalty_enforcement_squads", name: "Loyalty Enforcement Squads", description: "Uniformed squads conducting random loyalty checks, document inspections, and compliance audits." },
  { id: "bb_newspeak_linguists", name: "Simpletalk Linguists", description: "Language specialists steadily eliminating words from the dictionary. Fewer words, fewer thoughts, fewer problems." },
  { id: "bb_inner_party_commissars", name: "Supreme Circle Commissars", description: "Elite political officers embedded in every institution. Their word is law. Their disapproval is doom." },
  { id: "bb_neural_compliance_techs", name: "Neural Compliance Technicians", description: "Surgeons and engineers who install loyalty hardware directly into the brain. Compliance guaranteed." },
];

export const BB_POLICIES: PolicyDef[] = [
  { id: "bb_mandatory_telescreens", name: "Mandatory Snitchscreen Installation", category: "lawEnforcement", description: "Every dwelling, workplace, and public space must have an active two-way snitchscreen. Disconnection is treason.", costPerTick: 1500, effects: { crime: -5, happiness: -8, lawOrder: 5, corruption: 2 } },
  { id: "bb_thoughtcrime_law", name: "Wrongthink Legislation", category: "lawEnforcement", description: "Thinking against the Party is a criminal offense. Facial expression analysis and sleep-monitors detect violations.", costPerTick: 800, effects: { crime: -4, happiness: -10, lawOrder: 4, unrest: -2 } },
  { id: "bb_mandatory_hate_sessions", name: "Mandatory Two Minutes Rage", category: "cultural", description: "All citizens must participate in daily Two Minutes Rage sessions directed at designated enemies of the state.", costPerTick: 300, effects: { unrest: -3, happiness: -4, lawOrder: 2 } },
  { id: "bb_newspeak_mandate", name: "Simpletalk Language Mandate", category: "cultural", description: "Replace standard language with simplified Simpletalk. Eliminate words for rebellion, freedom, and dissent.", costPerTick: 600, effects: { crime: -2, happiness: -6, researchSpeed: -2, unrest: -3 } },
  { id: "bb_children_informant_program", name: "Youth Purity League & Snitch Cub Program", category: "lawEnforcement", description: "Children trained and rewarded for reporting parents and neighbors. Family loyalty is abolished.", costPerTick: 500, effects: { crime: -3, happiness: -8, lawOrder: 3, corruption: 1 } },
  { id: "bb_controlled_reproduction", name: "State-Controlled Reproduction", category: "healthSocial", description: "All reproduction regulated by the Party. State-Sponsored Stork Delivery replaces natural birth. Love is wrongthink.", costPerTick: 700, effects: { populationGrowthRate: -0.001, happiness: -6, lawOrder: 2 } },
  { id: "bb_history_revision", name: "Continuous History Revision", category: "cultural", description: "All historical records continuously updated to match current Party doctrine. The past is whatever we need it to be.", costPerTick: 400, effects: { corruption: 3, unrest: -2, happiness: -3 } },
  { id: "bb_forced_confessions", name: "Forced Public Confessions", category: "lawEnforcement", description: "Accused citizens must publicly confess crimes real or imagined. Refusal leads to Suite Nope.", costPerTick: 200, effects: { crime: -3, unrest: -2, happiness: -7, corruption: 2 } },
  { id: "bb_prole_containment", name: "Underfolk Containment Zones", category: "emergency", description: "Restrict the underfolk to designated zones. They are animals. They do not matter. Let them rot.", costPerTick: 100, effects: { crime: -2, happiness: -5, unrest: 2, employment: -3 } },
  { id: "bb_party_membership_mandatory", name: "Mandatory Party Membership", category: "civilRights", description: "All citizens must join the Party or be classified as nobody'd. No membership = no rations, no housing, no existence.", costPerTick: 300, effects: { unrest: -3, happiness: -5, employment: 2, corruption: 3 } },
  { id: "bb_victory_rations", name: "Obedience Rations Protocol", category: "economic", description: "Reduce food quality but announce ration increases. Citizens celebrate the increase that is actually a decrease.", costPerTick: -500, effects: { happiness: -4, foodProduction: -10, unrest: -1, corruption: 2 } },
  { id: "bb_unperson_protocol", name: "Nobody'd Protocol", category: "lawEnforcement", description: "Dissidents can be declared nobody'd — erased from all records. They never existed. Their families forget them.", costPerTick: 400, effects: { crime: -4, unrest: -4, happiness: -10, corruption: 5 } },
  { id: "bb_total_media_control", name: "Total State Media Control", category: "cultural", description: "All media owned and operated by the Party. No independent journalism. No alternative narratives. One truth.", costPerTick: 500, effects: { unrest: -5, happiness: -3, corruption: 4, lawOrder: 2 } },
  { id: "bb_sleep_monitoring", name: "Sleep-Talk Monitoring Program", category: "lawEnforcement", description: "Bedside microphones record citizens during sleep. Unconscious dissent is still dissent.", costPerTick: 600, effects: { crime: -2, happiness: -8, lawOrder: 2 } },
  { id: "bb_loyalty_oaths", name: "Daily Loyalty Oath Requirement", category: "cultural", description: "Every citizen must recite loyalty oaths at designated times. Failure to display sufficient enthusiasm is noted.", costPerTick: 100, effects: { unrest: -2, happiness: -3, lawOrder: 1 } },
  { id: "bb_emotion_suppression", name: "Emotional Expression Ban", category: "civilRights", description: "Public displays of joy, grief, anger, or love are prohibited. The only permitted emotion is devotion to the Party.", costPerTick: 200, effects: { crime: -1, happiness: -12, unrest: -3, lawOrder: 2 } },
  { id: "bb_neighbor_watch_mandate", name: "Mandatory Neighbor Surveillance", category: "lawEnforcement", description: "Every citizen assigned to monitor and report on designated neighbors. Trust is abolished. Suspicion is duty.", costPerTick: 300, effects: { crime: -4, happiness: -6, corruption: 2, lawOrder: 3 } },
  { id: "bb_book_ban", name: "Universal Book Ban", category: "cultural", description: "All unapproved printed material illegal. Possession of banned books is a capital offense. Burn them all.", costPerTick: 200, effects: { researchSpeed: -3, happiness: -8, crime: -1, unrest: -2 } },
  { id: "bb_genetic_loyalty_screening", name: "Genetic Loyalty Screening", category: "cyberTech", description: "DNA screening at birth to predict dissidence potential. High-risk genetics flagged for enhanced surveillance.", costPerTick: 900, effects: { crime: -3, happiness: -5, lawOrder: 3, populationGrowthRate: -0.001 } },
  { id: "bb_work_worship_doctrine", name: "Work-Worship Doctrine", category: "economic", description: "Labor is sacred. Leisure is sin. 16-hour mandatory work shifts. Exhaustion prevents rebellion.", costPerTick: -800, effects: { employment: 8, happiness: -15, unrest: 2, crime: -2 } },
];

export const BB_EDICTS: EdictDef[] = [
  {
    id: "bb_great_purge",
    name: "The Great Purge",
    description: "Mass arrest and re-education of suspected dissidents across all sectors for 8 ticks. Thousands disappear overnight.",
    category: "security",
    cost: 150000,
    durationTicks: 8,
    cooldownTicks: 40,
    effects: { crime: -20, happiness: -15, unrest: -8, corruption: 5, employment: -5 },
    requiresAuthority: 5,
  },
  {
    id: "bb_book_burning_campaign",
    name: "City-Wide Book Burning",
    description: "Organized destruction of all unapproved literature for 4 ticks. Bonfires in every district. History erased.",
    category: "political",
    cost: 30000,
    durationTicks: 4,
    cooldownTicks: 24,
    effects: { unrest: -4, happiness: -8, crime: -2, corruption: 3 },
  },
  {
    id: "bb_hate_week",
    name: "Rage Week Declaration",
    description: "Seven-day festival of rage against the city's enemies for 7 ticks. Mandatory participation. Directed fury.",
    category: "political",
    cost: 50000,
    durationTicks: 7,
    cooldownTicks: 30,
    effects: { unrest: -10, happiness: -5, crime: 3, lawEnforcement: 3 },
  },
  {
    id: "bb_unperson_wave",
    name: "Mass Nobody'ing",
    description: "Erase hundreds of citizens from all records over 3 ticks. They never existed. Their families will forget.",
    category: "political",
    cost: 40000,
    durationTicks: 3,
    cooldownTicks: 28,
    effects: { crime: -8, happiness: -12, unrest: -5, corruption: 6 },
    requiresAuthority: 4,
  },
  {
    id: "bb_mandatory_confession_broadcast",
    name: "Mass Confession Broadcast",
    description: "Force captured dissidents to confess on live snitchscreen for 2 ticks. The population watches in terror.",
    category: "political",
    cost: 20000,
    durationTicks: 2,
    cooldownTicks: 18,
    effects: { unrest: -6, happiness: -8, crime: -4, corruption: 2, lawEnforcement: 2 },
    requiresAuthority: 3,
  },
  {
    id: "bb_telescreen_surge",
    name: "Snitchscreen Surveillance Surge",
    description: "Activate all snitchscreens to maximum sensitivity for 5 ticks. Every whisper recorded. Every glance analyzed.",
    category: "security",
    cost: 60000,
    durationTicks: 5,
    cooldownTicks: 20,
    effects: { crime: -12, happiness: -6, unrest: -4, lawEnforcement: 5 },
  },
  {
    id: "bb_room_101_wave",
    name: "Suite Nope Processing Wave",
    description: "Send the most defiant dissidents through Suite Nope for 4 ticks. They will emerge loving the Party. Or not at all.",
    category: "security",
    cost: 80000,
    durationTicks: 4,
    cooldownTicks: 30,
    effects: { crime: -6, unrest: -10, happiness: -10, corruption: 4 },
    requiresAuthority: 5,
  },
  {
    id: "bb_doublethink_campaign",
    name: "Brainpretzel Awareness Campaign",
    description: "Intensive 6-tick propaganda campaign teaching citizens to hold contradictory beliefs simultaneously.",
    category: "social",
    cost: 35000,
    durationTicks: 6,
    cooldownTicks: 24,
    effects: { unrest: -8, happiness: -4, corruption: 3, crime: -2, creditsPerTick: -3000 },
  },
  {
    id: "bb_informant_recruitment_drive",
    name: "Mass Informant Recruitment",
    description: "Recruit 20% more civilian informants over 5 ticks. Everyone watches everyone. Trust is extinct.",
    category: "security",
    cost: 25000,
    durationTicks: 5,
    cooldownTicks: 22,
    effects: { crime: -6, happiness: -4, corruption: 2, lawEnforcement: 3, creditsPerTick: -2000 },
  },
  {
    id: "bb_language_purge",
    name: "Simpletalk Language Purge",
    description: "Eliminate another 500 words from the approved dictionary over 3 ticks. Thought becomes simpler. Resistance impossible.",
    category: "social",
    cost: 15000,
    durationTicks: 3,
    cooldownTicks: 30,
    effects: { unrest: -4, happiness: -6, crime: -1, corruption: 2 },
  },
];

export const BB_EVENT_POOL: Omit<GameEvent, "timestamp" | "resolved">[] = [
  { id: "bb_thoughtcrime_wave", title: "WRONGTHINK WAVE DETECTED", severity: "high", effects: { crime: 5, unrest: 4, happiness: -3 } },
  { id: "bb_telescreen_malfunction", title: "SNITCHSCREEN NETWORK FAILURE", severity: "critical", effects: { crime: 12, unrest: 8, happiness: 5 } },
  { id: "bb_underground_newspaper", title: "UNDERGROUND NEWSPAPER DISCOVERED", severity: "medium", effects: { unrest: 5, crime: 2, happiness: 2 } },
  { id: "bb_junior_spy_hero", title: "SNITCH CUB REPORTS OWN PARENTS", severity: "low", effects: { crime: -2, happiness: -4, unrest: -1 } },
  { id: "bb_doublethink_failure", title: "BRAINPRETZEL FAILURE IN BUREAU", severity: "medium", effects: { corruption: 3, unrest: 2 } },
  { id: "bb_memory_hole_overflow", title: "FORGET CHUTE CAPACITY EXCEEDED", severity: "medium", effects: { corruption: 4, unrest: 2, happiness: -1 } },
  { id: "bb_prole_uprising_attempt", title: "UNDERFOLK UPRISING CRUSHED", severity: "high", effects: { crime: -3, unrest: -2, happiness: -5, credits: -5000 } },
  { id: "bb_room_101_escape", title: "PRISONER ESCAPES SUITE NOPE", severity: "high", effects: { crime: 6, unrest: 5, happiness: -2 } },
  { id: "bb_newspeak_milestone", title: "SIMPLETALK DICTIONARY REDUCED", severity: "low", effects: { unrest: -2, happiness: -3 } },
  { id: "bb_big_brother_hologram", title: "SUPREME LEADER HOLOGRAM UNVEILED", severity: "low", effects: { unrest: -3, happiness: -1, lawOrder: 2 } },
  { id: "bb_resistance_cell_found", title: "RESISTANCE CELL DISCOVERED", severity: "critical", effects: { crime: -5, corruption: -3, unrest: 4, happiness: -3, credits: -10000 } },
  { id: "bb_victory_gin_shortage", title: "COMPLIANCE JUICE SHORTAGE", severity: "medium", effects: { unrest: 6, happiness: -4, crime: 3 } },
  { id: "bb_public_execution_spectacle", title: "PUBLIC EXECUTION BROADCAST", severity: "medium", effects: { crime: -4, unrest: -3, happiness: -6 } },
  { id: "bb_informant_betrayal", title: "INFORMANT NETWORK COMPROMISED", severity: "high", effects: { crime: 8, corruption: 5, unrest: 3 } },
  { id: "bb_hate_week_success", title: "RAGE WEEK ENORMOUS SUCCESS", severity: "low", effects: { unrest: -4, happiness: -2, lawOrder: 3 } },
  { id: "bb_forbidden_love_scandal", title: "FORBIDDEN LOVE AFFAIR EXPOSED", severity: "low", effects: { happiness: -3, crime: -1, unrest: 1 } },
  { id: "bb_propaganda_backfire", title: "PROPAGANDA CAMPAIGN BACKFIRES", severity: "medium", effects: { unrest: 5, corruption: 2, happiness: 1 } },
  { id: "bb_neural_chip_rejection", title: "MASS LOYALTY CHIP REJECTION", severity: "high", effects: { happiness: -8, unrest: 5, crime: 2, credits: -8000 } },
  { id: "bb_ministry_power_struggle", title: "SUPREME CIRCLE POWER STRUGGLE", severity: "high", effects: { corruption: 8, unrest: 3, credits: -12000 } },
  { id: "bb_thought_criminal_martyr", title: "WRONGTHINKER BECOMES MARTYR", severity: "critical", effects: { unrest: 10, happiness: 3, crime: 5 } },
  { id: "bb_surveillance_drone_hijack", title: "SURVEILLANCE DRONES HIJACKED", severity: "high", effects: { crime: 4, unrest: 6, happiness: 2 } },
  { id: "bb_rat_plague_room101", title: "RATS ESCAPE SUITE NOPE", severity: "medium", effects: { happiness: -6, unrest: 4, crime: 2 } },
  { id: "bb_doublethink_perfection", title: "PERFECT BRAINPRETZEL ACHIEVED", severity: "low", effects: { unrest: -3, corruption: 2, happiness: -2 } },
  { id: "bb_inner_party_defection", title: "SUPREME CIRCLE MEMBER DEFECTS", severity: "critical", effects: { corruption: -4, unrest: 8, crime: 3, credits: -20000 } },
  { id: "bb_truth_revision_error", title: "HISTORY REVISION ERROR EXPOSED", severity: "high", effects: { unrest: 7, corruption: 3, happiness: 2 } },
  { id: "bb_mass_re_education_success", title: "RE-EDUCATION BATCH COMPLETE", severity: "low", effects: { crime: -3, unrest: -2, happiness: -4 } },
  { id: "bb_poetry_underground", title: "UNDERGROUND POETRY MOVEMENT", severity: "medium", effects: { unrest: 4, happiness: 3, crime: 1 } },
  { id: "bb_loyalty_test_riots", title: "LOYALTY TEST RIOTS", severity: "high", effects: { unrest: 8, happiness: -6, crime: 4, credits: -5000 } },
  { id: "bb_telescreen_hack_anthem", title: "NATIONAL ANTHEM REPLACED", severity: "medium", effects: { happiness: 5, unrest: 4, crime: 2 } },
  { id: "bb_victory_day_parade", title: "OBEDIENCE DAY CELEBRATION", severity: "low", effects: { unrest: -4, happiness: -1, lawOrder: 2, defenseRating: 1 } },
];

export const BB_TECHNOLOGIES: { id: string; name: string; category: string; description: string; cost: number; researchTicks: number }[] = [
  { id: "bb_facial_microexpression_ai", name: "Facial Microexpression AI", category: "security", description: "AI that reads guilt, doubt, and dissent from involuntary facial movements. The face cannot lie to the machine.", cost: 15000, researchTicks: 20 },
  { id: "bb_dream_monitoring_implants", name: "Dream Monitoring Implants", category: "cybernetics", description: "Neural implants that record and analyze dreams for subversive content. Even your unconscious must be loyal.", cost: 25000, researchTicks: 30 },
  { id: "bb_memory_erasure_tech", name: "Selective Memory Erasure", category: "cybernetics", description: "Technology to precisely erase specific memories. Witnesses forget. Victims forget. Only the Party remembers.", cost: 35000, researchTicks: 35 },
  { id: "bb_predictive_dissidence_engine", name: "Predictive Dissidence Engine", category: "security", description: "AI system predicting which citizens will become dissidents before they even think about it.", cost: 20000, researchTicks: 25 },
  { id: "bb_emotion_dampening_aerosol", name: "Emotion Dampening Aerosol", category: "medical", description: "Chemical compound dispersed through ventilation systems that suppresses strong emotions. Calm, docile, obedient.", cost: 18000, researchTicks: 22 },
  { id: "bb_loyalty_gene_editing", name: "Loyalty Gene Editing", category: "cybernetics", description: "CRISPR-based modification targeting genes associated with rebellious personality traits. Compliance by design.", cost: 40000, researchTicks: 40 },
  { id: "bb_mass_surveillance_network_v2", name: "Omniscient Surveillance Grid", category: "security", description: "Second-generation surveillance covering every square meter of the city. No blind spots. No shadows. Nowhere to hide.", cost: 30000, researchTicks: 28 },
  { id: "bb_newspeak_neural_translator", name: "Simpletalk Neural Translator", category: "research", description: "Implant that automatically translates Forbidden Verbose thoughts into Simpletalk before they reach consciousness.", cost: 22000, researchTicks: 26 },
  { id: "bb_obedience_conditioning", name: "Pavlovian Obedience Conditioning", category: "medical", description: "Automated conditioning chambers using pain/pleasure cycles to instill permanent obedience reflexes.", cost: 16000, researchTicks: 20 },
  { id: "bb_total_information_awareness", name: "Total Information Awareness", category: "research", description: "System that correlates every data point about every citizen into a single threat profile. The panopticon perfected.", cost: 28000, researchTicks: 32 },
];

export const BB_FACTION: Faction = {
  id: "inner-party",
  name: "The Supreme Circle",
  description: "The true ruling elite of the city. They live in luxury while preaching austerity. They know the truth while manufacturing lies. Power is not a means; it is an end. The object of power is power.",
  influence: 30,
  loyalty: 60,
  threat: 20,
  type: "law",
  isActive: true,
};

export const BB_LAWS: PolicyDef[] = [
  { id: "bb_law_thoughtcrime", name: "Wrongthink Act", category: "lawEnforcement", description: "Thinking against the Party is punishable by re-education or death. Neural scans used as evidence.", costPerTick: 0, effects: { happiness: -8, crime: -5, unrest: -3, lawOrder: 3 } },
  { id: "bb_law_facecrime", name: "Wrongface Prohibition", category: "lawEnforcement", description: "Displaying improper facial expressions (doubt, displeasure, joy at wrong times) is a punishable offense.", costPerTick: 500, effects: { happiness: -6, crime: -2, lawOrder: 2 } },
  { id: "bb_law_ownlife", name: "Unapproved Me-Time Prohibition", category: "civilRights", description: "Individualism is illegal. Having hobbies, preferences, or private activities outside Party-approved recreation is criminal.", costPerTick: 1000, effects: { happiness: -10, crime: -3, employment: 3 } },
  { id: "bb_law_sexcrime", name: "Unauthorized Feelings Act", category: "civilRights", description: "All sexual activity outside Party-approved reproduction is illegal. Love is a thought-virus.", costPerTick: 2000, effects: { happiness: -12, crime: -2, populationGrowthRate: -0.002 } },
  { id: "bb_law_oldspeak", name: "Forbidden Verbose Usage Ban", category: "cultural", description: "Using deprecated words eliminated from the Simpletalk dictionary is a misdemeanor. Repeat offenses become felonies.", costPerTick: 200, effects: { happiness: -4, crime: -1, researchSpeed: -1 } },
  { id: "bb_law_unapproved_assembly", name: "Unauthorized Gathering Ban", category: "civilRights", description: "Three or more citizens meeting without Party oversight is conspiracy. All gatherings must be pre-approved.", costPerTick: 3000, effects: { happiness: -5, crime: -4, unrest: -2, corruption: 1 } },
  { id: "bb_law_information_hoarding", name: "Information Hoarding Act", category: "cultural", description: "Possessing, concealing, or memorizing unapproved information is a capital offense. Knowledge is the Party's property.", costPerTick: 5000, effects: { happiness: -6, crime: -3, researchSpeed: -2, corruption: 2 } },
  { id: "bb_law_mandatory_denouncement", name: "Mandatory Denouncement Law", category: "lawEnforcement", description: "Citizens who witness wrongthink and fail to report it are equally guilty. Silence is complicity.", costPerTick: 1500, effects: { happiness: -7, crime: -4, corruption: 3 } },
  { id: "bb_law_emotional_display", name: "Emotional Display Restriction", category: "civilRights", description: "Crying, laughing loudly, or showing anger in public without Party-designated cause is illegal.", costPerTick: 300, effects: { happiness: -8, crime: -1, unrest: -2 } },
  { id: "bb_law_unperson_acknowledgement", name: "Nobody'd Acknowledgement Crime", category: "lawEnforcement", description: "Acknowledging the existence of someone who's been nobody'd — speaking their name, displaying their photo — is treason.", costPerTick: 10000, effects: { happiness: -5, crime: -2, unrest: -3, corruption: 4 } },
];
