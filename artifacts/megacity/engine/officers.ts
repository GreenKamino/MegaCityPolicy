import type { Officer, OfficerDepartment, OfficerRank, OfficerTrait, AppointmentMethod } from "@/engine/types";
import { generateOfficerBio } from "@/engine/characterBios";

export type OfficerPositionDef = {
  id: string;
  position: string;
  department: OfficerDepartment;
  defaultRank: OfficerRank;
};

const FIRST_NAMES = [
  "Kovac", "Stern", "Voss", "Drake", "Holt", "Quinn", "Rask", "Jade", "Knox",
  "Venn", "Greer", "Ashby", "Thane", "Kade", "Orla", "Nyx", "Cael", "Zara",
  "Pike", "Wren", "Brix", "Lyra", "Dax", "Reva", "Slade", "Frost", "Kael",
  "Mira", "Thorn", "Vex", "Orin", "Rhea", "Jett", "Moss", "Kira", "Draven",
  "Vale", "Ash", "Rook", "Sol", "Blaise", "Gage", "Lark", "Onyx", "Reeve",
  "Storm", "Cass", "Flint", "Ember", "Cruz", "Shade", "Alder", "Bryn", "Cyrus",
  "Dune", "Echo", "Fenix", "Gale", "Haze", "Ivor", "Jasper", "Kael", "Lynx",
  "Mars", "Nolan", "Opal", "Pax", "Rune", "Sage", "Talon", "Uma", "Vex",
  "Wolf", "Xander", "York", "Zephyr", "Atlas", "Blitz", "Colt", "Dex",
  "Edge", "Forge", "Graf", "Hex", "Iron", "Jax", "Kai", "Lux", "Max",
  "Neo", "Ozark", "Prism", "Quill", "Rift", "Sparx", "Trix", "Umber", "Volt",
  "Aric", "Brann", "Cinder", "Doryn", "Esker", "Fenn", "Gild", "Halix",
  "Indra", "Joss", "Kreel", "Lash", "Marek", "Nadira", "Osric", "Petra",
  "Quaal", "Rho", "Sten", "Theron", "Uri", "Vorn", "Wess", "Yara",
  "Zane", "Arden", "Beck", "Caine", "Doss", "Eira", "Finch", "Garrick",
  "Hewn", "Iska", "Jorvik", "Kael", "Loris", "Maeve", "Nim", "Ostra",
];

const LAST_NAMES = [
  "Rennick", "Blackwood", "Steele", "Hargrove", "Creed", "Ashford", "Vance",
  "Kellar", "Graves", "Thornton", "Wolfe", "Marchetti", "DeVaux", "Cortez",
  "Volkov", "Nykvist", "Brandt", "Malik", "Chen", "Okafor", "Petrov",
  "Vasquez", "Tanaka", "Erikson", "Kowalski", "Maduro", "Fischer", "Shah",
  "Kaine", "Barker", "Cross", "Locke", "Stone", "Voss", "Hart", "Kane",
  "Monroe", "Grant", "Shaw", "Cole", "Burke", "Ward", "Blake", "Ford",
  "Chase", "Rivers", "Storm", "Marsh", "Vale", "Crane", "Frost", "Hawk",
  "Reed", "Wolff", "Steel", "Grey", "Price", "West", "North", "Dark",
  "Prime", "Stark", "Bell", "Clay", "Dale", "Finn", "Gold", "Hill",
  "Lane", "Mack", "Nash", "Oak", "Penn", "Ray", "Sage", "Troy",
  "Wade", "York", "Zane", "Arch", "Beck", "Cork", "Drum", "Edge",
  "Fox", "Grim", "Hall", "Ink", "Jade", "Knox", "Loom", "Moss",
  "Aldridge", "Bramble", "Calderwood", "Dunmore", "Estridge", "Fairfax",
  "Gildersleeve", "Hatherton", "Ingleton", "Jardine", "Kingsley", "Lansdale",
  "Mulgrew", "Norfleet", "Ostrander", "Pendragon", "Quintrell", "Rothwell",
  "Sutcliffe", "Trembath", "Underwood", "Vetterli", "Walgrave", "Yardley",
];

export const OFFICER_POSITIONS: OfficerPositionDef[] = [
  // Supreme Leadership (10)
  { id: "city-executive", position: "City Executive", department: "supreme_leadership", defaultRank: "chief_director" },
  { id: "high-governance-chancellor", position: "High Governance Chancellor", department: "supreme_leadership", defaultRank: "chief_director" },
  { id: "grand-admin-director", position: "Grand Administrative Director", department: "supreme_leadership", defaultRank: "chief_director" },
  { id: "supreme-judicial-arbiter", position: "Supreme Judicial Arbiter", department: "supreme_leadership", defaultRank: "chief_director" },
  { id: "defense-high-commander", position: "Defense High Commander", department: "supreme_leadership", defaultRank: "chief_director" },
  { id: "strategic-intel-director", position: "Strategic Intelligence Director", department: "supreme_leadership", defaultRank: "commissioner" },
  { id: "civic-stability-commissioner", position: "Civic Stability Commissioner", department: "supreme_leadership", defaultRank: "commissioner" },
  { id: "econ-dev-chancellor", position: "Economic Development Chancellor", department: "supreme_leadership", defaultRank: "chief_director" },
  { id: "infra-master-planner", position: "Infrastructure Master Planner", department: "supreme_leadership", defaultRank: "commissioner" },
  { id: "emergency-authority-director", position: "Emergency Authority Director", department: "supreme_leadership", defaultRank: "commissioner" },

  // Executive Council (10)
  { id: "deputy-city-exec", position: "Deputy City Executive", department: "executive_council", defaultRank: "commissioner" },
  { id: "chief-admin-secretary", position: "Chief Administrative Secretary", department: "executive_council", defaultRank: "commissioner" },
  { id: "chief-strategy-officer", position: "Chief Strategy Officer", department: "executive_council", defaultRank: "commissioner" },
  { id: "civic-policy-director", position: "Civic Policy Director", department: "executive_council", defaultRank: "director" },
  { id: "urban-dev-director", position: "Urban Development Director", department: "executive_council", defaultRank: "director" },
  { id: "public-safety-director", position: "Public Safety Director", department: "executive_council", defaultRank: "director" },
  { id: "resource-alloc-director", position: "Resource Allocation Director", department: "executive_council", defaultRank: "director" },
  { id: "pop-mgmt-director", position: "Population Management Director", department: "executive_council", defaultRank: "director" },
  { id: "inter-district-director", position: "Inter-District Affairs Director", department: "executive_council", defaultRank: "director" },
  { id: "comms-authority-director", position: "Communications Authority Director", department: "executive_council", defaultRank: "director" },

  // Judicial Administration (10)
  { id: "high-tribunal-chair", position: "High Tribunal Chair", department: "judicial", defaultRank: "chief_director" },
  { id: "metro-justice-overseer", position: "Metropolitan Justice Overseer", department: "judicial", defaultRank: "commissioner" },
  { id: "sector-justice-director", position: "Sector Justice Director", department: "judicial", defaultRank: "director" },
  { id: "regional-magistrate", position: "Regional Tribunal Magistrate", department: "judicial", defaultRank: "director" },
  { id: "district-court-arbiter", position: "District Court Arbiter", department: "judicial", defaultRank: "senior_officer" },
  { id: "enforce-cmd-director", position: "Enforcement Command Director", department: "judicial", defaultRank: "director" },
  { id: "legal-compliance-comm", position: "Legal Compliance Commissioner", department: "judicial", defaultRank: "commissioner" },
  { id: "evidence-bureau-director", position: "Evidence Bureau Director", department: "judicial", defaultRank: "director" },
  { id: "invest-div-commander", position: "Investigative Division Commander", department: "judicial", defaultRank: "senior_officer" },
  { id: "tribunal-logistics", position: "Tribunal Logistics Officer", department: "judicial", defaultRank: "officer" },

  // Law Enforcement Command (10)
  { id: "city-enforce-commander", position: "City Enforcement Commander", department: "law_enforcement", defaultRank: "chief_director" },
  { id: "sector-security-marshal", position: "Sector Security Marshal", department: "law_enforcement", defaultRank: "commissioner" },
  { id: "tactical-response-cmd", position: "Tactical Response Commander", department: "law_enforcement", defaultRank: "director" },
  { id: "riot-control-director", position: "Riot Control Director", department: "law_enforcement", defaultRank: "director" },
  { id: "surveillance-cmd-director", position: "Surveillance Command Director", department: "law_enforcement", defaultRank: "director" },
  { id: "criminal-invest-director", position: "Criminal Investigation Director", department: "law_enforcement", defaultRank: "director" },
  { id: "internal-oversight-comm", position: "Internal Oversight Commissioner", department: "law_enforcement", defaultRank: "commissioner" },
  { id: "intel-liaison-officer", position: "Intelligence Liaison Officer", department: "law_enforcement", defaultRank: "senior_officer" },
  { id: "detention-ops-commander", position: "Detention Operations Commander", department: "law_enforcement", defaultRank: "senior_officer" },
  { id: "district-patrol-captain", position: "District Patrol Captain", department: "law_enforcement", defaultRank: "officer" },

  // Civic Administration (10)
  { id: "urban-services-director", position: "Urban Services Director", department: "civic", defaultRank: "director" },
  { id: "pop-registry-chief", position: "Population Registry Chief", department: "civic", defaultRank: "director" },
  { id: "public-housing-director", position: "Public Housing Director", department: "civic", defaultRank: "director" },
  { id: "sanitation-authority-head", position: "Sanitation Authority Head", department: "civic", defaultRank: "senior_officer" },
  { id: "civic-health-director", position: "Civic Health Director", department: "civic", defaultRank: "director" },
  { id: "education-systems-director", position: "Education Systems Director", department: "civic", defaultRank: "director" },
  { id: "cultural-affairs-director", position: "Cultural Affairs Director", department: "civic", defaultRank: "senior_officer" },
  { id: "welfare-programs-director", position: "Welfare Programs Director", department: "civic", defaultRank: "director" },
  { id: "citizen-engagement-dir", position: "Citizen Engagement Director", department: "civic", defaultRank: "senior_officer" },
  { id: "district-services-coord", position: "District Services Coordinator", department: "civic", defaultRank: "officer" },

  // Infrastructure Authority (10)
  { id: "power-grid-commissioner", position: "Power Grid Commissioner", department: "infrastructure", defaultRank: "commissioner" },
  { id: "water-systems-director", position: "Water Systems Director", department: "infrastructure", defaultRank: "director" },
  { id: "transit-authority-cmd", position: "Transit Authority Commander", department: "infrastructure", defaultRank: "director" },
  { id: "structural-eng-director", position: "Structural Engineering Director", department: "infrastructure", defaultRank: "director" },
  { id: "waste-mgmt-commissioner", position: "Waste Management Commissioner", department: "infrastructure", defaultRank: "commissioner" },
  { id: "construction-oversight", position: "Construction Oversight Chief", department: "infrastructure", defaultRank: "senior_officer" },
  { id: "urban-logistics-director", position: "Urban Logistics Director", department: "infrastructure", defaultRank: "director" },
  { id: "env-stability-director", position: "Environmental Stability Director", department: "infrastructure", defaultRank: "director" },
  { id: "resource-processing-dir", position: "Resource Processing Director", department: "infrastructure", defaultRank: "senior_officer" },
  { id: "infra-inspection-dir", position: "Infrastructure Inspection Director", department: "infrastructure", defaultRank: "senior_officer" },

  // Economic and Trade Authority (10)
  { id: "treasury-commissioner", position: "Treasury Commissioner", department: "economic", defaultRank: "commissioner" },
  { id: "market-regulation-dir", position: "Market Regulation Director", department: "economic", defaultRank: "director" },
  { id: "industrial-dev-chief", position: "Industrial Development Chief", department: "economic", defaultRank: "director" },
  { id: "corporate-relations-dir", position: "Corporate Relations Director", department: "economic", defaultRank: "director" },
  { id: "trade-route-coord", position: "Trade Route Coordinator", department: "economic", defaultRank: "senior_officer" },
  { id: "resource-commerce-dir", position: "Resource Commerce Director", department: "economic", defaultRank: "director" },
  { id: "taxation-authority-chief", position: "Taxation Authority Chief", department: "economic", defaultRank: "commissioner" },
  { id: "econ-forecasting-dir", position: "Economic Forecasting Director", department: "economic", defaultRank: "director" },
  { id: "financial-stability-comm", position: "Financial Stability Commissioner", department: "economic", defaultRank: "commissioner" },
  { id: "labor-relations-director", position: "Labor Relations Director", department: "economic", defaultRank: "senior_officer" },

  // Research and Technology Authority (10)
  { id: "scientific-dev-director", position: "Scientific Development Director", department: "research", defaultRank: "director" },
  { id: "tech-advancement-comm", position: "Technology Advancement Commissioner", department: "research", defaultRank: "commissioner" },
  { id: "data-systems-director", position: "Data Systems Director", department: "research", defaultRank: "director" },
  { id: "research-facility-cmd", position: "Research Facility Commander", department: "research", defaultRank: "senior_officer" },
  { id: "innovation-policy-dir", position: "Innovation Policy Director", department: "research", defaultRank: "director" },
  { id: "experimental-tech-sup", position: "Experimental Technology Supervisor", department: "research", defaultRank: "senior_officer" },
  { id: "info-security-chief", position: "Information Security Chief", department: "research", defaultRank: "director" },
  { id: "ai-systems-director", position: "AI Systems Director", department: "research", defaultRank: "director" },
  { id: "archive-recovery-dir", position: "Archive Recovery Director", department: "research", defaultRank: "senior_officer" },
  { id: "research-logistics", position: "Research Logistics Officer", department: "research", defaultRank: "officer" },

  // Defense Forces Command (10)
  { id: "defense-sector-cmd", position: "Defense Sector Commander", department: "defense", defaultRank: "chief_director" },
  { id: "strategic-fleet-admiral", position: "Strategic Fleet Admiral", department: "defense", defaultRank: "commissioner" },
  { id: "expeditionary-general", position: "Expeditionary Taskforce General", department: "defense", defaultRank: "commissioner" },
  { id: "naval-ops-captain", position: "Naval Operations Captain", department: "defense", defaultRank: "director" },
  { id: "border-security-cmd", position: "Border Security Commander", department: "defense", defaultRank: "director" },
  { id: "rapid-response-colonel", position: "Rapid Response Colonel", department: "defense", defaultRank: "senior_officer" },
  { id: "armored-division-major", position: "Armored Division Major", department: "defense", defaultRank: "senior_officer" },
  { id: "marine-strike-leader", position: "Marine Strike Leader", department: "defense", defaultRank: "officer" },
  { id: "defense-logistics", position: "Defense Logistics Officer", department: "defense", defaultRank: "officer" },
  { id: "tactical-ops-lt", position: "Tactical Operations Lieutenant", department: "defense", defaultRank: "officer" },

  // District Leadership (10)
  { id: "district-governor", position: "District Governor", department: "district", defaultRank: "commissioner" },
  { id: "sector-administrator", position: "Sector Administrator", department: "district", defaultRank: "director" },
  { id: "civic-district-mgr", position: "Civic District Manager", department: "district", defaultRank: "senior_officer" },
  { id: "district-security-chief", position: "District Security Chief", department: "district", defaultRank: "director" },
  { id: "district-econ-coord", position: "District Economic Coordinator", department: "district", defaultRank: "senior_officer" },
  { id: "district-infra-director", position: "District Infrastructure Director", department: "district", defaultRank: "director" },
  { id: "district-welfare-super", position: "District Welfare Supervisor", department: "district", defaultRank: "senior_officer" },
  { id: "district-transit-coord", position: "District Transit Coordinator", department: "district", defaultRank: "officer" },
  { id: "district-emergency", position: "District Emergency Officer", department: "district", defaultRank: "officer" },
  { id: "district-intel-liaison", position: "District Intelligence Liaison", department: "district", defaultRank: "officer" },

  // Special Advisory Roles (5)
  { id: "strategic-policy-adv", position: "Strategic Policy Advisor", department: "advisory", defaultRank: "director" },
  { id: "econ-advisory-consult", position: "Economic Advisory Consultant", department: "advisory", defaultRank: "director" },
  { id: "security-doctrine-adv", position: "Security Doctrine Advisor", department: "advisory", defaultRank: "senior_officer" },
  { id: "tech-advisory-scientist", position: "Technology Advisory Scientist", department: "advisory", defaultRank: "senior_officer" },
  { id: "civic-affairs-advisor", position: "Civic Affairs Advisor", department: "advisory", defaultRank: "senior_officer" },
];

export const DEPARTMENT_LABELS: Record<OfficerDepartment, string> = {
  supreme_leadership: "SUPREME LEADERSHIP",
  executive_council: "EXECUTIVE COUNCIL",
  judicial: "JUDICIAL ADMINISTRATION",
  law_enforcement: "LAW ENFORCEMENT",
  civic: "CIVIC ADMINISTRATION",
  infrastructure: "INFRASTRUCTURE",
  economic: "ECONOMIC & TRADE",
  research: "RESEARCH & TECHNOLOGY",
  defense: "DEFENSE FORCES",
  district: "DISTRICT LEADERSHIP",
  advisory: "SPECIAL ADVISORY",
};

export const DEPARTMENT_ORDER: OfficerDepartment[] = [
  "supreme_leadership", "executive_council", "judicial", "law_enforcement",
  "civic", "infrastructure", "economic", "research",
  "defense", "district", "advisory",
];

export const RANK_LABELS: Record<OfficerRank, string> = {
  cadet: "CADET",
  officer: "OFFICER",
  senior_officer: "SENIOR OFFICER",
  director: "DIRECTOR",
  commissioner: "COMMISSIONER",
  chief_director: "CHIEF DIRECTOR",
};

export const RANK_ORDER: OfficerRank[] = [
  "cadet", "officer", "senior_officer", "director", "commissioner", "chief_director",
];

export type TraitDef = {
  id: OfficerTrait;
  name: string;
  category: "administrative" | "political" | "security" | "economic";
  description: string;
  effects: string;
};

export const TRAIT_DEFS: TraitDef[] = [
  { id: "efficient", name: "Efficient", category: "administrative", description: "Streamlines operations and reduces waste", effects: "+Policy effectiveness, +Construction speed" },
  { id: "bureaucratic", name: "Bureaucratic", category: "administrative", description: "Thorough but slow decision-making", effects: "Slower decisions, Fewer mistakes" },
  { id: "visionary", name: "Visionary", category: "administrative", description: "Forward-thinking and innovative", effects: "+Research bonus, +Innovation" },
  { id: "incompetent", name: "Incompetent", category: "administrative", description: "Causes delays and poor outcomes", effects: "Increases delays, -Effectiveness" },
  { id: "ambitious", name: "Ambitious", category: "political", description: "Seeks promotion aggressively", effects: "Seeks promotion, +Rivalry risk" },
  { id: "loyal", name: "Loyal", category: "political", description: "Dedicated to leadership", effects: "+Stability, -Corruption risk" },
  { id: "corrupt", name: "Corrupt", category: "political", description: "Diverts resources for personal gain", effects: "Treasury leaks, +Faction influence" },
  { id: "idealistic", name: "Idealistic", category: "political", description: "Pursues civic happiness above all", effects: "+Happiness, Weaker enforcement" },
  { id: "strict", name: "Strict", category: "security", description: "Harsh but effective law enforcer", effects: "-Crime, -Happiness" },
  { id: "strategist", name: "Strategist", category: "security", description: "Excels at military planning", effects: "+Military effectiveness" },
  { id: "aggressive", name: "Aggressive", category: "security", description: "Uses force first", effects: "+Riot suppression, +Unrest" },
  { id: "cautious", name: "Cautious", category: "security", description: "Careful and risk-averse", effects: "-Disaster risk, Slower responses" },
  { id: "investor_friendly", name: "Investor Friendly", category: "economic", description: "Attracts corporate investment", effects: "+Trade growth" },
  { id: "worker_advocate", name: "Worker Advocate", category: "economic", description: "Champions labor rights", effects: "-Unrest" },
  { id: "corporate_loyalist", name: "Corporate Loyalist", category: "economic", description: "Favors corporate interests", effects: "+Corporate power" },
  { id: "budget_hawk", name: "Budget Hawk", category: "economic", description: "Cuts spending aggressively", effects: "-Spending, Slower development" },
  { id: "perfectionist", name: "Perfectionist", category: "administrative", description: "Demands flawless execution at any cost", effects: "+Quality, Slower output" },
  { id: "delegator", name: "Delegator", category: "administrative", description: "Empowers subordinates and distributes authority", effects: "+Department efficiency, -Direct control" },
  { id: "micromanager", name: "Micromanager", category: "administrative", description: "Controls every detail personally", effects: "+Error prevention, -Staff morale" },
  { id: "reformist", name: "Reformist", category: "administrative", description: "Constantly pushes for systemic change", effects: "+Innovation, +Instability risk" },
  { id: "populist", name: "Populist", category: "political", description: "Tells the people exactly what they want to hear", effects: "+Happiness, -Long-term stability" },
  { id: "paranoid", name: "Paranoid", category: "political", description: "Trusts nobody and suspects everyone", effects: "+Threat detection, -Cooperation" },
  { id: "diplomat", name: "Diplomat", category: "political", description: "Builds bridges where others build walls", effects: "+Faction relations, +Trade" },
  { id: "ruthless", name: "Ruthless", category: "political", description: "Achieves results through fear and intimidation", effects: "+Compliance, -Happiness, +Fear" },
  { id: "veteran", name: "Veteran", category: "security", description: "Survived three tours in the wasteland", effects: "+Combat effectiveness, +Resilience" },
  { id: "intelligence_officer", name: "Intelligence Officer", category: "security", description: "Specializes in information warfare and espionage", effects: "+Intel gathering, +Counter-espionage" },
  { id: "peacekeeper", name: "Peacekeeper", category: "security", description: "Believes in de-escalation over firepower", effects: "-Unrest, -Military strength" },
  { id: "enforcer", name: "Enforcer", category: "security", description: "The law is a hammer and everything looks like a nail", effects: "+Crime reduction, +Civilian fear" },
  { id: "seasoned", name: "Seasoned", category: "administrative", description: "Five years in office and still standing", effects: "+Department steadiness, -Rookie mistakes" },
  { id: "tenured", name: "Tenured", category: "political", description: "Fifteen years deep in the machine — irreplaceable, untouchable", effects: "+Political weight, -Reform tolerance" },
  { id: "loyal_lifer", name: "Loyal Lifer", category: "political", description: "Has stayed loyal through every storm — the kind of officer leaders build dynasties around", effects: "+Loyalty floor, +Stability bonus" },
  { id: "embittered", name: "Embittered", category: "political", description: "Years of neglect and broken promises have soured them", effects: "-Loyalty drift, +Faction defection risk" },
];

export const TRAIT_MAP: Record<string, TraitDef> = {};
for (const t of TRAIT_DEFS) TRAIT_MAP[t.id] = t;

export const RECRUITMENT_LINES: Record<string, string[]> = {
  chief_director: [
    "You wanted the best. You're looking at them. The question is whether you can afford what comes with that.",
    "I've run departments bigger than your entire administration. Let's see if you're worth my time.",
    "They told me you needed someone with experience. They didn't mention you needed a miracle.",
    "I don't do small talk and I don't do incompetence. We'll get along fine if you remember both.",
    "Twenty years in the system. I've buried three predecessors and outlasted two reforms. Still standing.",
    "The last Chief Director retired to a bunker in Sector 12. Voluntarily, they say. I have doubts.",
    "I didn't climb to the top of this ladder to admire the view. I'm here to rebuild the ladder.",
    "My reputation precedes me. If it didn't, I'd fire my publicist. Which I already did. Twice.",
    "I've forgotten more about governance than most people learn. That's not a boast — it's a medical concern.",
    "The board sent me here to 'consult.' We both know what that means. I'm in charge now.",
    "Three cities. Three collapses. I survived all of them. Draw your own conclusions.",
    "I keep a list of every person who underestimated me. It's quite long. Most of them are unemployed.",
    "My office hours are whenever I'm awake. I'm always awake. Sleep is for people without deadlines.",
  ],
  commissioner: [
    "Commissioner reporting. I've read your file. Let's just say I have... managed expectations.",
    "I know every corridor of power in this city. Some of them aren't on any official map.",
    "You need someone who can make problems disappear quietly. That's my specialty.",
    "I've served under four different administrations. None of them listened to me either. But they should have.",
    "The last commander who ignored my advice is currently running a recycling plant in Sector 9.",
    "My network runs deeper than the sewage system. And it's considerably more useful.",
    "Commissioner. I've been doing this since before you had a title. Let's skip the pleasantries.",
    "They said you were different from the last one. They say that every time.",
    "I've already identified twelve security vulnerabilities in your command structure. Shall I continue?",
    "My previous assignment ended when the city did. I don't plan on repeating the experience.",
    "I have contacts in places that don't officially exist. That's not a metaphor.",
    "The first thing I did was audit your communications. You should be more careful.",
    "People call me paranoid. I call it 'still alive.' The distinction matters.",
  ],
  director: [
    "Director, ready for assignment. I brought my own filing system. You'll thank me later.",
    "I've managed worse departments in worse cities. This should be... educational.",
    "Point me at a problem and step back. I work best without someone looking over my shoulder.",
    "My record speaks for itself. Three commendations, one reprimand, and zero apologies.",
    "I heard you were looking for competence. I also heard that's been in short supply around here.",
    "The department was a mess before I got here. It'll be slightly less of a mess after.",
    "Director. I don't need a corner office. I need resources and fewer meetings.",
    "I've read the budget. I've read the staffing reports. I've stopped crying about both.",
    "I reorganized two collapsing departments before breakfast last Tuesday. What's on the agenda?",
    "My last department ran at 94% efficiency. The 6% was lunch breaks. I'm working on those too.",
    "I have a five-year plan. It involves this department not being a punchline by year two.",
    "The filing system I inherited was held together with duct tape and optimism. Both have expired.",
  ],
  senior_officer: [
    "Senior Officer, reporting as ordered. Where do you need me?",
    "I've done my time in the field. Promoted the hard way — by surviving.",
    "They tell me this is a step up. From where I was standing, most directions are up.",
    "Ready for duty. Fair warning: I have opinions, and I'm not great at keeping them to myself.",
    "I know the streets. I know the people. I know which corners to never turn your back on.",
    "Fifteen years on the ground, Commander. I've got scars older than some of your cadets.",
    "Senior Officer. I don't polish boots and I don't sugarcoat reports. You'll get the truth.",
    "The streets taught me more than the academy ever did. And the streets don't grade on a curve.",
    "I transferred here voluntarily. My therapist said I have 'poor self-preservation instincts.'",
    "I've trained half the officers in this city. The other half are my mistakes.",
    "Last week I talked down a riot with nothing but a megaphone and creative profanity. Promotion-worthy, I'd say.",
    "I don't read personnel files. I read faces. Faces don't lie. Files do.",
    "They gave me a desk. I gave it to someone who needed firewood. I work on my feet.",
  ],
  officer: [
    "Officer present. Fresh from training, ready for whatever you've got.",
    "Reporting for duty. I may be new to the rank, but I'm not new to the work.",
    "They said the Commander wanted to see me personally. Should I be nervous?",
    "I'm here, I'm sharp, and I brought my own coffee. What's the assignment?",
    "First day in the new role. Let's make it count.",
    "Officer reporting. I transferred from Sector 14. Don't ask why. Let's just say... creative differences.",
    "Ready for whatever you need, Commander. I've been trained for everything except boredom.",
    "I volunteered for this posting. Everyone told me I was crazy. Jury's still out on that.",
    "I spent six months undercover in the undercity. I can still taste the recycled air.",
    "My previous CO said I had 'initiative problems.' I took initiative. He had problems with it.",
    "I fixed the patrol schedule on the way in. Hope nobody minds.",
    "They assigned me here after the Sector 7 incident. No, I can't talk about it.",
    "I keep a notebook. Everything goes in the notebook. The notebook doesn't forget.",
  ],
  cadet: [
    "Cadet reporting! I graduated top of my class. Well, top ten. Top... quarter, technically.",
    "I'm new, but I learn fast. Mostly by watching what everyone else does wrong.",
    "Fresh out of the academy, Commander. Ready to serve. And slightly terrified, if I'm honest.",
    "Cadet present. I've read every manual cover to cover. Reality is... different.",
    "They told me the city eats cadets alive. I intend to give it indigestion.",
    "Cadet here. My instructors said I showed 'unusual initiative.' I think it was a compliment.",
    "I may be green, Commander, but I'm green with potential. Or nausea. Hard to tell in this city.",
    "Youngest in my graduating class. Also the most eager. You'll see.",
    "I memorized the entire city map on the transport here. I'm ready. Probably.",
    "My parents wanted me to be a moisture farmer. I chose this instead. Still not sure who was right.",
    "I've never seen a real crisis before. Only simulated ones. How different can it be? ...Very?",
    "Cadet, first posting. I brought extra socks because the manual said 'always be prepared.' Was that wrong?",
    "I've been practicing my salute for three days. Is it okay if I practice on you?",
  ],
};

export const TRAIT_INTRO_MODIFIERS: Record<string, string> = {
  efficient: "I've already reorganized your schedule. You're welcome.",
  bureaucratic: "I'll need the appropriate forms before we proceed. In triplicate.",
  visionary: "I have ideas. Big ones. The kind that make accountants nervous.",
  incompetent: "I'm sure everything will work out fine. It usually does. Mostly. Sometimes.",
  ambitious: "This position is just the beginning. I plan to be running this city someday.",
  loyal: "You give the orders, I follow them. That's how this works. That's how it should work.",
  corrupt: "I'm a pragmatist. Every system has... flexibility, if you know where to look.",
  idealistic: "The people deserve better than what they've been getting. I intend to deliver.",
  strict: "Discipline isn't optional. Not in my department. Not on my watch.",
  strategist: "I see the board, Commander. All the pieces. Including the ones nobody else notices.",
  aggressive: "Talk is cheap. Action gets results. I prefer results.",
  cautious: "Let's not rush into anything. The graveyard is full of people who moved too fast.",
  investor_friendly: "Money talks. I speak fluent money.",
  worker_advocate: "The workers are the backbone of this city. It's time someone remembered that.",
  corporate_loyalist: "The corporations built this city. We'd be wise to keep them happy.",
  budget_hawk: "Every credit matters. I've already found three line items we can cut.",
  perfectionist: "If it's not perfect, it's not done. I don't care how long it takes.",
  delegator: "I don't need to do everything myself. I need the right people doing the right things.",
  micromanager: "Show me the reports. All of them. And the reports on the reports.",
  reformist: "The old way got us here. 'Here' is a dystopian hellscape. Time for a new way.",
  populist: "The people love me. That's not vanity — it's my entire political strategy.",
  paranoid: "Three locks on my office. Two on the inside. The third one you can't see.",
  diplomat: "Violence is the language of the unimaginative. I prefer... leverage.",
  ruthless: "Compassion is a luxury. Results are a necessity. I deal in necessities.",
  veteran: "I've seen things out in the wastes you wouldn't believe. I stopped trying to explain.",
  intelligence_officer: "I know your name, your history, and what you had for breakfast. Standard procedure.",
  peacekeeper: "Every bullet fired is a failure of policy. I intend to have very few failures.",
  enforcer: "The law is clear. The punishment is clear. Everything else is paperwork.",
  tech_savvy: "I've already patched three vulnerabilities in your network. You're welcome. You're also terrifying.",
  negotiator: "Every conflict is a conversation waiting to happen. Some conversations just take longer.",
  survivalist: "I've lived off recycled water and ration bars for six months. Luxury is overrated.",
  connected: "I know people. They know people. Information flows like water if you know the pipes.",
  charismatic: "People listen when I talk. Not because of rank — because I'm worth listening to.",
  reckless: "Fortune favors the bold. And I'm extremely bold. Some say dangerously so.",
  methodical: "Step one, step two, step three. No shortcuts. Shortcuts are how buildings collapse.",
  compassionate: "These people aren't numbers on a spreadsheet. They're lives. I don't forget that.",
  cynic: "Hope is a luxury. I deal in probabilities. And the probabilities are... concerning.",
};

function getRecruitmentLine(officer: Officer): string {
  const rankLines = RECRUITMENT_LINES[officer.rank] ?? RECRUITMENT_LINES.officer;
  const seed = officer.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const baseLine = rankLines[seed % rankLines.length];

  if ((officer.traits ?? []).length > 0) {
    const traitMod = TRAIT_INTRO_MODIFIERS[(officer.traits ?? [])[0]];
    if (traitMod) return `${baseLine} ${traitMod}`;
  }
  return baseLine;
}

export const APPOINTMENT_METHODS: { id: AppointmentMethod; name: string; description: string; effects: string }[] = [
  { id: "direct", name: "Direct Appointment", description: "You personally assign the officer", effects: "Fast · +Corruption risk" },
  { id: "council_vote", name: "Council Vote", description: "Executive council votes on appointment", effects: "Slower · +Stability" },
  { id: "merit", name: "Merit Selection", description: "Best competence candidate selected", effects: "Best competence · May anger factions" },
  { id: "faction_nomination", name: "Faction Nomination", description: "A faction nominates their candidate", effects: "+Diplomacy · +Faction influence" },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickTraits(rng: () => number, count: number): OfficerTrait[] {
  const all: OfficerTrait[] = TRAIT_DEFS.map((t) => t.id);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

export function generateOfficer(posDef: OfficerPositionDef, seed: number): Officer {
  const rng = seededRandom(seed);
  const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  const traitCount = posDef.defaultRank === "chief_director" || posDef.defaultRank === "commissioner" ? 3 : 2;

  const draft: Officer = {
    id: posDef.id,
    name: `${firstName} ${lastName}`,
    position: posDef.position,
    department: posDef.department,
    rank: posDef.defaultRank,
    competence: 35 + Math.floor(rng() * 50),
    loyalty: 30 + Math.floor(rng() * 55),
    ambition: 20 + Math.floor(rng() * 60),
    corruption: Math.floor(rng() * 40),
    popularity: 20 + Math.floor(rng() * 50),
    fearFactor: Math.floor(rng() * 35),
    traits: pickTraits(rng, traitCount),
    factionAffiliation: null,
    rivals: [],
    appointed: false,
    appointmentMethod: null,
    level: 1,
    xp: 0,
    age: 32 + Math.floor(rng() * 31),
    appointedYear: null,
    yearsServed: 0,
    careerLog: [],
    backstory: "",
  };
  draft.backstory = generateOfficerBio(draft);
  return draft;
}

export function createOfficerRoster(): Officer[] {
  return OFFICER_POSITIONS.map((pos, i) => generateOfficer(pos, (i + 1) * 7919));
}
