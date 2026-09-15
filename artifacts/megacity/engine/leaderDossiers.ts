import type { FactionLeader } from "./types";

export type LeaderDossier = {
  name: string;
  title: string;
  affiliation: string;
  clearanceLevel: string;
  physicalDescription: string;
  background: string;
  psychProfile: string;
  knownAssociates: string[];
  tacticalAssessment: string;
  interceptedQuotes: string[];
  threatLevel: "MINIMAL" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "UNKNOWN";
  recommendedApproach: string;
};

function leaderNameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sameLeaderName(a: string, b: string): boolean {
  return leaderNameSlug(a) === leaderNameSlug(b);
}

// A small, explicit bridge for leaders whose dossier intentionally carries a
// longer classified identity than the name shown in the diplomacy UI. Do not
// add generic partial-name matching here: that would make it possible to show
// one leader's biography on another leader's card.
const LEADER_DOSSIER_NAME_ALIASES: Readonly<Record<string, string>> = {
  "the-listener": "the_listener",
};

export function getLeaderDossier(leader: FactionLeader | null | undefined): LeaderDossier | null {
  if (!leader) return null;

  // The name is the durable identity. Portrait IDs can be stale after a
  // portrait reassignment or save migration, so they must never override a
  // dossier that matches the displayed leader's name.
  const slug = leaderNameSlug(leader.name);
  const nameDossier =
    LEADER_DOSSIERS[slug] ??
    LEADER_DOSSIERS[LEADER_DOSSIER_NAME_ALIASES[slug] ?? ""];
  if (nameDossier) return nameDossier;

  // Keep portrait lookup for older saves whose dossier key predates the
  // name-slug convention, but validate the payload before showing it. A
  // mismatched portrait must produce no dossier rather than another leader's
  // biography.
  if (leader.portraitId) {
    const portraitDossier = LEADER_DOSSIERS[leader.portraitId];
    if (portraitDossier && sameLeaderName(portraitDossier.name, leader.name)) {
      return portraitDossier;
    }
  }
  return null;
}

export const LEADER_DOSSIERS: Record<string, LeaderDossier> = {
  "draven_korr": {
    name: "Grand Marshal Draven Korr",
    title: "Chief of the Authority",
    affiliation: "law",
    clearanceLevel: "ALPHA-3 RESTRICTED",
    physicalDescription: "Male, late 50s. 1.96m, imposing frame maintained through military-grade fitness regimen. Facial scarring along left jawline from the Block War. Prosthetic right knee (combat injury, Year Seven). Regulation uniform at all times — has reportedly been seen sleeping in full dress. Eyes: grey-steel, described in interrogation transcripts as 'the last thing suspects see before they start talking.'",
    background: "Korr rose through the Authority's ranks during the most violent period in megacity history. Enlisted at 18, promoted to Sector Commander by 30, and appointed Grand Marshal after his predecessor suffered a fatal case of 'retirement.' His service record includes 340 confirmed operations, 12 commendations, and zero formal complaints — the last detail being statistically improbable and therefore informative. Born in Hab-Block 7 to a transit worker and a sanitation engineer. Has not visited his family's block in nineteen years. When asked why, he reportedly said, 'The law doesn't have a home address.'",
    psychProfile: "Clinical assessment: obsessive-compulsive tendencies channeled into institutional loyalty. Korr does not distinguish between law and morality — in his framework, they are identical. Demonstrates rigid ethical standards that paradoxically enable extreme methods when 'the law requires it.' Low corruption susceptibility but high authoritarian tendencies. Emotional affect: suppressed. The analysts note that Korr is not cruel, which makes his effectiveness more troubling, not less. His disciplined nature borders on the inhuman — he has not taken a personal day in eleven years.",
    knownAssociates: [
      "Deputy Marshal Kira Vance — operational second-in-command, handles tactical planning",
      "Judge-Arbiter Solomon Cross — chief judicial officer, rubber-stamps Korr's warrants within minutes",
      "Unknown contact in Corporate sector — encrypted communications detected monthly, content unknown",
    ],
    tacticalAssessment: "Korr commands approximately 8,000 enforcement personnel with absolute loyalty. His response to provocation is immediate, proportional, and thoroughly documented. Direct confrontation is inadvisable. The Authority's weakness is bureaucratic — they are bound by procedures that can be exploited by anyone with patience and legal expertise. Korr himself is incorruptible, which means he cannot be bought but also cannot be reasoned with when he believes the law is on his side.",
    interceptedQuotes: [
      "The law doesn't sleep, Officer. Neither do I. And neither should you.",
      "I've arrested three of my own officers this month. Nobody is above the statute. Nobody.",
      "The Commander and I have an understanding. I enforce the law. The Commander stays out of my way. So far, this arrangement has worked.",
      "Compassion is a luxury. Justice is a necessity. I know which one keeps the city standing.",
      "Order is not the absence of chaos. It is chaos, leashed and muzzled, with my hand on the chain.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Maintain formal respect for legal authority. Support the Authority's operational budget. Never, under any circumstances, obstruct an active investigation. Korr's loyalty can be earned through consistent rule-of-law governance but never through personal favors.",
  },

  "razor_vex": {
    name: "Razor Vex",
    title: "Syndicate Overlord",
    affiliation: "criminal",
    clearanceLevel: "SIGMA-BLACK CLASSIFIED",
    physicalDescription: "Male, age unknown (estimated late 30s to mid-40s — augmentation makes estimation unreliable). Last confirmed unaltered photograph is six years old. Known to use body doubles. Distinguishing features: lean, predatory build. Augmented jawline with subdermal armor plating. Custom retinal implants that give his eyes a faintly reflective quality in low light. Monochrome wardrobe — exclusively black. The nickname 'Razor' reportedly derives from both his surname and his preferred method of dispute resolution.",
    background: "Vex's rise began in the narcotics corridors of the underhive, where he built a distribution network that was notable for its efficiency and its body count. He eliminated three rival syndicate bosses in Year Four through methods that were neither elegant nor subtle — one was found in pieces, one disappeared entirely, and the third publicly surrendered his territory on a live broadcast. By Year Eight, Vex controlled the majority of the city's narcotics trade and a significant portion of its black market. Unlike his predecessors, he doesn't pretend to be a businessman. He is a predator who has organized other predators into a hierarchy.",
    psychProfile: "Assessment complicated by deliberate persona construction. Vex cultivates an image of ruthless charisma — the kind of leader who is both feared and genuinely admired by subordinates. He is cunning rather than intellectual, preferring instinct over analysis. His primary vulnerability is ego; he needs to be seen as dominant and will take irrational risks to maintain that perception. He does not respond well to being ignored or marginalized — being treated as irrelevant provokes more aggression than direct confrontation.",
    knownAssociates: [
      "Consigliore Anya 'The Needle' Petrova — chief strategist, former Authority intelligence analyst",
      "Underboss Renzo Galt — controls street-level operations, handles violence Vex prefers to delegate",
      "Unknown financial advisor — suspected of maintaining accounts in three separate settlement banks",
    ],
    tacticalAssessment: "The syndicate network extends into every district and several wasteland settlements. Direct suppression attempts have historically resulted in economic disruption disproportionate to enforcement gains. Vex's organization controls narcotics, protection, and underground logistics — removing him would create a power vacuum likely to be filled by less predictable operators. His ambition to undermine law enforcement makes him a persistent irritant, but his desire for stability within his own territory creates opportunities for negotiated containment.",
    interceptedQuotes: [
      "I don't break laws, Commander. I operate in the space where your laws are too scared to reach.",
      "The Authority arrested forty of my people last year. I hired fifty more. We call that a growth market.",
      "Everyone in this city works for me, works for the Commander, or works for both. The overlap is larger than anyone admits.",
      "Korr thinks his badge makes him dangerous. My reputation makes me dangerous. One of us doesn't need a badge.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Engage through deniable intermediaries. Vex responds to strength and pragmatism — never show weakness, never make empty threats. Direct confrontation escalates predictably. The most effective lever is economic — disrupting syndicate revenue forces negotiation. Never accept personal favors; the interest rate is calculated in obligations you cannot afford.",
  },

  "victoria_ashford_crane": {
    name: "Victoria Ashford-Crane",
    title: "Executive Chairwoman",
    affiliation: "corporate",
    clearanceLevel: "OMEGA-TIER EXECUTIVE",
    physicalDescription: "Female, 47. Augmented — neural processing implant (Tier 4, military-grade), ocular enhancement suite, and skeletal reinforcement package. Estimated augmentation investment: 2.8 million credits. Appearance: immaculate, deliberately so. The suit costs more than most citizens earn in a year. The smile costs more than the suit. Hair: platinum, precisely maintained. Every element of her appearance is calculated to project control.",
    background: "Ashford-Crane ascended to the Corporate Board at 31 — the youngest chair in megacity history. Born into the Ashford industrial dynasty and married into the Crane financial empire, she unified two corporate bloodlines into a single power base that controls both manufacturing and capital. Her career began in weapons R&D at Nexus Industries, where she designed the city's current drone defense grid. Lateral move to corporate strategy at 28, hostile takeover of Meridian Holdings at 30, Board appointment at 31 after the previous chair's retirement was strongly encouraged by a shareholders' revolt she organized over a weekend. She has since consolidated five major corporations into three, reduced inter-corporate conflict by 40%, and increased total corporate revenue by 200%. Her efficiency is universally admired. Her methods are universally feared.",
    psychProfile: "Textbook strategic narcissism channeled into institutional empire-building. Ashford-Crane views the city as a business and its citizens as stakeholders (minor ones). Her calculating and manipulative nature is not concealed — it is displayed as a competitive advantage. She is elegant in the way that predators are elegant: every movement has purpose. Decision-making is data-driven to an almost inhuman degree. She is not corrupt in the traditional sense; she simply operates on a value system where profit and progress are synonymous. Potential weakness: perfectionism. Failure is intolerable to her, and public failure would be psychologically devastating.",
    knownAssociates: [
      "VP-Operative Shin Tanaka — corporate intelligence director, runs the Board's private security",
      "Chief Lobbyist Wren Alcott — maintains relationships with every city official who can be maintained",
      "Dr. Amir Roshangar — head of Nexus R&D, her former mentor and the only person who addresses her by first name",
    ],
    tacticalAssessment: "The Corporate Board controls approximately 35% of the city's GDP and 60% of its physical infrastructure through service contracts. Ashford-Crane's leverage is economic — she can raise prices, delay services, or redirect investment to pressure any administration. Her stated goals — maximizing profits, securing exclusive contracts, and influencing legislation — are pursued with a sophistication that makes counter-operations difficult. Her weakness is regulatory; corporations operate within legal frameworks that can be tightened. However, aggressive regulation risks capital flight and service disruptions.",
    interceptedQuotes: [
      "The quarterly projections show growth in every sector. The Commander's approval rating is not one of our metrics, but we track it anyway. Professionally.",
      "I don't make threats. I make forecasts. The difference is that my forecasts are accurate.",
      "The city needs us more than we need the city. That's not arrogance. That's a balance sheet.",
      "Philanthropy is excellent branding. File it under marketing expenses.",
      "Legislation is just market regulation by another name. I prefer to write my own regulations.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Engage as a peer, never as a supplicant. Ashford-Crane respects competence and despises weakness. Offer mutually beneficial arrangements with clear terms. Corporate cooperation is most effective when framed as profit opportunity rather than civic duty.",
  },

  "mother_scoria": {
    name: "Mother Scoria",
    title: "Voice of the Changed",
    affiliation: "underclass",
    clearanceLevel: "RESTRICTED — SUBJECT UNDER SURVEILLANCE",
    physicalDescription: "Female, estimated 50s (mutation makes precise aging impossible). Skin: ash-grey, hardened — a side effect of prolonged exposure to industrial waste that fundamentally altered her cellular structure. Eyes: milky white but functional — enhanced low-light vision, an adaptation the medical board cannot explain. Wears layered clothing from the lower sectors, patched and reinforced but always clean. Moves slowly, deliberately, as if the weight she carries is more than physical. Her presence is commanding not through size or volume, but through a stillness that makes others feel restless.",
    background: "Mother Scoria's original name is unknown — she abandoned it when the mutations took hold, declaring that the person she was 'burned away.' She emerged from the toxic industrial districts where waste processing failures had created a population of physically altered citizens the city preferred to ignore. Scoria organized the Changed — mutants, the chemically exposed, the genetically damaged — into a community with mutual aid networks, shared medical resources, and collective advocacy. Her compassion is genuine and her bitterness is earned: she watched the city's medical system turn away mutant patients for years before building clinics that would treat them.",
    psychProfile: "Protective to the point of ferocity. Scoria's psychology is defined by the intersection of deep compassion and deep anger — she genuinely loves her people and genuinely hates the systems that harmed them. She is suspicious of outsiders by default, a survival trait developed through years of broken promises from city administrators. Her emotional framework is maternal: threats to her community trigger defensive responses that are disproportionate but predictable. Her weakness is that her protectiveness can become suffocating — she sometimes makes decisions for her people rather than with them.",
    knownAssociates: [
      "Dr. Ash Morel — unlicensed physician specializing in mutation-related conditions, runs the Changed's primary clinic",
      "Shard — a heavily mutated enforcer who serves as Scoria's bodyguard, does not speak, communicates through gestures",
      "Unknown contacts within Mireholm and the Gene Wrights — suspected coordination on mutant rights advocacy",
    ],
    tacticalAssessment: "The Changed number approximately 15,000-20,000 across the lower sectors, industrial zones, and waste processing districts. They control no conventional military assets but are physically formidable — many mutations confer enhanced strength, endurance, or environmental resistance. Scoria's primary demand is straightforward: medical access and legal recognition for mutant citizens. Her suspicion of the Commander is default, not personal — she expects betrayal because every previous administration has delivered it. The most effective approach is consistent, demonstrable investment in mutant healthcare.",
    interceptedQuotes: [
      "The Commander has two choices: acknowledge us or explain why a city of a million citizens doesn't include the ones who don't look right.",
      "They call us the Changed. We call ourselves survivors. The city changed us — the least it can do is look at what it made.",
      "I don't want power. I want my people to see a doctor without being turned away at the door.",
      "Every child born in the waste sectors who doesn't get treatment is a failure of governance. I keep count.",
      "We are what the city made us. If you don't like what you see, change the city, not us.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Engage directly and honestly. Scoria despises intermediaries and formal channels. Demonstrate genuine investment in mutant medical care and safe zone establishment. Empty promises are worse than silence — she tracks commitments and publicizes failures. The most stable governance includes her voice at the table, not shouting from outside.",
  },

  "solara_venn": {
    name: "Archpriest Solara Venn",
    title: "Voice of the Reactor Gods, Supreme Shepherd of the Eternal Flame",
    affiliation: "eternal-flame",
    clearanceLevel: "OMEGA-RED BIOHAZARD",
    physicalDescription: "Female, age uncertain (records list 41, but radiation exposure makes visual estimation unreliable). Skin has a faint luminescence under UV light. Hair: white, possibly from radiation rather than age. Eyes: amber, described as 'uncomfortably intense' by every interviewer. Wears reactor worker's coveralls modified into ceremonial robes, with Reactor 7's serial number embroidered across the back. Always barefoot. Medical scans detect radiation levels that should be lethal. She is not dead. The medical team has stopped trying to explain this.",
    background: "Venn was a reactor technician — competent, unremarkable, Employee #7-4419. The Reactor 7 incident changed everything. She was the closest worker to the core during the partial meltdown and the only one who didn't evacuate. She stayed inside the containment zone for eleven hours. When she walked out, she was different. Not injured — different. She described a 'conversation' with the reactor that lasted the entire eleven hours. Within a month, she had converted her entire shift crew. Within a year, three thousand reactor workers. Within three years, the Eternal Flame was the fastest-growing faction in megacity history.",
    psychProfile: "Conventional psychological assessment frameworks do not apply cleanly. Venn demonstrates characteristics of charismatic delusion syndrome — but her predictions about reactor behavior have been accurate 94% of the time, which is higher than the engineering department's models. She is either genuinely perceiving something in the reactor systems that instruments cannot detect, or she has developed an intuitive understanding of nuclear physics that manifests as religious experience. Either explanation is concerning. She is not violent by nature, but she is absolutely willing to die for her beliefs, and her followers will follow her into a reactor core if she asks. Some already have.",
    knownAssociates: [
      "Deacon Pyrrhus Cole — military arm commander, former Authority officer who defected after 'hearing the core speak'",
      "Sister Radiance — real name unknown, manages the Flame's charitable operations (food kitchens, medical care for radiation victims)",
      "The Twelve Tenders — reactor workers who serve as Venn's inner circle, each assigned to a different power plant",
    ],
    tacticalAssessment: "The Eternal Flame controls no conventional military assets but has embedded members in every reactor facility in the city. Their potential for sabotage is catastrophic — a coordinated safety system shutdown could trigger multiple meltdowns. However, Venn's theology opposes destroying reactors; she wants them 'freed,' not destroyed. The distinction is theologically important and strategically meaningless. Primary threat vector: safety protocol interference. Primary leverage: the Flame's charitable operations create genuine goodwill that can be channeled through partnership.",
    interceptedQuotes: [
      "The core doesn't speak in words. It speaks in warmth. In light. In the half-life of every atom. You have to be still enough to hear it.",
      "Your safety protocols are chains. You cage a god behind concrete and call it engineering. We call it blasphemy.",
      "I walked into Core 7 and I didn't die. The medical reports say I should have. The engineers say I should have. I say the gods had other plans.",
      "We don't recruit, Commander. The core calls. People either hear it or they don't. Lately, more and more are hearing it.",
      "Every reactor in this city is a heartbeat. When they all beat together — that's when everything changes.",
    ],
    threatLevel: "CRITICAL",
    recommendedApproach: "Do not dismiss the theology — Venn is too intelligent for condescension, and her followers will interpret mockery as persecution. Engage through the charitable operations. Offer reactor access concessions in exchange for safety compliance. The Flame's weakness is that Venn genuinely cares about her followers' wellbeing; policies that demonstrably harm Flame members give you leverage. Never threaten reactor shutdown as a bargaining chip — it will be interpreted as an act of war.",
  },

  "kael_drift": {
    name: "Guildmaster Kael Drift",
    title: "First Among Equals, Free Traders' Guild",
    affiliation: "free-traders",
    clearanceLevel: "SIGMA-COMMERCE RESTRICTED",
    physicalDescription: "Male, 55. Lean, perpetually sunburned from wasteland travel. Three gold teeth (left upper molars — reportedly from three different pre-war currency systems). Augmented left hand — trade-spec prosthetic with built-in scale, spectrometer, and concealed holdout pistol. Dresses expensively but practically: tailored wasteland gear in dark colors. Always carries a leather-bound ledger he's never been seen writing in. The ledger is suspected to be a prop. It works.",
    background: "Drift ran smuggling routes before the megacity had customs. His family operated a caravan network connecting six wasteland settlements, and young Kael could negotiate exchange rates before he could read. The Great Shortage proved his value — when official supply chains collapsed, Drift's network was the only thing keeping the city fed. He leveraged this into political capital, forming the Free Traders' Guild from dozens of independent operators who recognized that collective bargaining beat individual smuggling. The Tariff War cemented his reputation: when the tax authority tried to regulate Guild operations, Drift organized a luxury goods boycott that had the city's elite rioting within a week.",
    psychProfile: "Pure mercantile intelligence in human form. Drift processes every interaction as a transaction — not cynically, but instinctively. He genuinely believes free trade makes the world better, which gives his profit-seeking a moral dimension that makes him persuasive and unpredictable. He will trade with anyone — factions, enemies, hostile settlements — because the market doesn't judge. His vulnerability is ego; he prides himself on never losing a deal, and a sufficiently public loss would damage his standing with Guild members who follow strength.",
    knownAssociates: [
      "Trade Captain Yara Sunstep — runs the wasteland convoy network, knows every safe passage in 500 kilometers",
      "Broker Zero — identity unknown, handles the Guild's most sensitive trades including ones the Guild officially denies",
      "Comptroller Ines Falk — manages Guild finances with an accuracy that suggests augmented memory",
    ],
    tacticalAssessment: "The Guild's power is logistical. They control trade routes, warehouse access, and market intelligence. They cannot fight a conventional war, but they can starve any district of goods within 72 hours. Drift's network extends into hostile settlements, giving him intelligence the city's own spy apparatus lacks. The optimal approach is partnership — bring the Guild partially into the official economy through licensed trading concessions. Total regulation would push them fully underground, where they're harder to monitor and impossible to tax.",
    interceptedQuotes: [
      "Tariffs are not economic policy. They're a mugging with paperwork.",
      "I've never met a problem that couldn't be solved with the right shipment arriving at the right time. Everything is logistics.",
      "The Commander needs what I have. I need what the Commander has. This isn't corruption — it's commerce.",
      "My convoys delivered food when the official supply chain collapsed. Remember that the next time someone calls us criminals.",
      "I've traded with every settlement, faction, and warlord in the wasteland. They all pay on time. The city is the only client that doesn't.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Negotiate from a position of mutual need. Drift respects competence and profitability. Offer trade route protection in exchange for tax compliance on legitimate goods. Accept that the black market will exist regardless — the goal is to channel Guild activity toward city interests rather than eliminate it. Never seize Guild shipments without cause; the retaliation will be economic and painful.",
  },

  "lyssa_helix": {
    name: "Dr. Lyssa Helix",
    title: "Chief Geneticist, The Gene Wrights",
    affiliation: "gene-wrights",
    clearanceLevel: "OMEGA-BIO CLASSIFIED",
    physicalDescription: "Female, 38. Extensively self-modified — exact augmentation list unknown and likely evolving. Confirmed modifications include: enhanced neural processing, chromatophore skin (can shift pigmentation at will), additional prehensile digit on each hand (six-fingered), and bioluminescent iris tissue. Hair: changes color, possibly biological rather than cosmetic. Height: varies — suspected skeletal modification allows deliberate height adjustment. The medical department has requested she stop sending them her bloodwork 'for fun.' The results are apparently 'distressing.'",
    background: "Helix was a prodigy — licensed physician at 22, genetic researcher at 24, and banned from the Medical Board at 26 after publishing a paper proposing human germline modification that the Board called 'scientifically brilliant and ethically unconscionable.' She vanished into the undercity and spent four years building a clinic network that treated patients the official medical system had abandoned. The Sector 12 cure — the treatment that saved hundreds from the wasting disease — made her famous. The fact that the patients developed translucent skin made her controversial. She considers both outcomes acceptable.",
    psychProfile: "Brilliant, obsessive, and operating on a moral framework that prioritizes biological potential over conventional ethics. Helix genuinely believes she is improving the human species and views regulatory opposition as small-minded obstruction. She is compassionate toward patients — the clinics provide free care to the undercity's poorest — but clinically detached about the 'acceptable failure rate' of experimental procedures. Her dangerous quality is not malice but conviction: she will not stop because she believes stopping would be a betrayal of humanity's potential.",
    knownAssociates: [
      "Surgeon-Captain Voss Kaine — former military medic, runs security for Gene Wright operations",
      "The Changed — a loose network of heavily modified individuals who serve as Helix's field researchers and test subjects",
      "Anonymous corporate sponsor — funds equipment and supplies, identity unknown despite extensive investigation",
    ],
    tacticalAssessment: "The Gene Wrights pose a biological threat that conventional security cannot address. Their capability to design targeted pathogens is theoretical but credible. Their primary value is medical — they can treat conditions the official system cannot, and their research produces genuine breakthroughs. The optimal strategy is regulated cooperation: offer laboratory access and research funding in exchange for safety oversight and data sharing. Suppression drives them deeper underground, where their experiments become less controlled and more dangerous.",
    interceptedQuotes: [
      "The human genome contains three billion base pairs. I've read them all. Most of them are wasted potential.",
      "Your Medical Board banned me for proposing improvements to the species. They'd rather humanity stayed broken than admit someone outside their club had better ideas.",
      "Every patient who walks into my clinic walks out better than they arrived. Not just healed — improved. That's not medicine. That's evolution, delivered on schedule.",
      "I didn't choose to become what I am. I chose to become what humanity should be. The distinction matters.",
      "The Sector 12 patients are alive. Their skin is transparent. The Board says I failed. The patients say they can see their own heartbeat. Beauty is subjective.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Approach through medical channels. Helix responds to scientific discourse and genuine interest in her research. Offer conditional amnesty for past regulatory violations in exchange for cooperation. Never threaten her patients — the Gene Wrights' loyalty to their 'improved' community is absolute, and attacks on modified citizens will trigger responses designed to be biologically creative.",
  },

  "mako_steele": {
    name: "Chief Warden Mako Steele",
    title: "First Warden, The Rust Wardens",
    affiliation: "rust-wardens",
    clearanceLevel: "INFRASTRUCTURE-CRITICAL",
    physicalDescription: "Male, 58. Built like the pipes he maintains — broad, solid, and showing signs of decades of hard use. Hands permanently stained with grease and mineral deposits. Full beard, grey-streaked, usually containing at least one small tool. Wears a utility worker's jumpsuit so patched and repaired it qualifies as a historical artifact. Steel-toed boots that have been resoled eleven times. Carries a pipe wrench everywhere. It's not a weapon. It could be.",
    background: "Third-generation infrastructure worker. His grandmother installed the original water mains. His father maintained them. Mako knows the subsurface systems better than any living person — he's spent more time underground than above it. The First Strike was his defining moment: when budget cuts reduced maintenance crews by 60%, Steele organized a 72-hour work stoppage that caused cascading failures across eight districts. Water pressure dropped. Sewage backed up. Power flickered. The administration came to the negotiating table in fourteen hours. Steele's demands were simple: fund the maintenance crews, or the city falls apart. They funded the crews.",
    psychProfile: "Working-class pragmatist with an infrastructure engineer's worldview — everything is a system, every system needs maintenance, and people who ignore maintenance deserve what they get. Steele is not political by nature; he became a faction leader because the system forced him to choose between fighting and watching the city's infrastructure collapse. He carries genuine anger about how maintenance workers are treated — invisible until something breaks, blamed when it does. His moral framework is simple: take care of the things that take care of people.",
    knownAssociates: [
      "Deputy Warden Reva Bolt — electrical systems specialist, manages the Wardens' communication network",
      "Tunnel Boss Grayson 'Grit' Hale — controls access to the deep utility tunnels, knows routes nobody else does",
      "Former Councilwoman Ada Chen — retired politician who advises Steele on negotiation strategy",
    ],
    tacticalAssessment: "The Rust Wardens control the city's infrastructure from the inside. They can shut off water, power, or ventilation to any district with minimal notice. This capability makes them simultaneously indispensable and dangerous. Steele has demonstrated restraint — the First Strike was targeted and temporary — but the potential for escalation is ever-present. The Wardens' weakness is that they care about the infrastructure; they won't damage it permanently because destroying the pipes would hurt the people they're trying to protect. This limits their tactical options to temporary disruptions.",
    interceptedQuotes: [
      "You see a pipe. I see the artery that keeps 40,000 people alive. Treat it accordingly.",
      "My people work twelve-hour shifts in tunnels where the air smells like rust and the rats are the size of dogs. The least you can do is fund our equipment budget.",
      "I don't want to run this city. I want to maintain it. There's a difference the politicians never understand.",
      "Every time they cut our budget, something breaks. Every time something breaks, people die. I've been keeping a list. Would you like to see it?",
      "The city is a machine, Commander. And right now, it needs an oil change, a new transmission, and someone to stop kicking the engine.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Treat as an essential partner, not an adversary. Steele responds to practical investment — fund infrastructure, improve working conditions, and he becomes the most reliable ally in the city. Ignore his concerns and he becomes the most dangerous. Never bluff about infrastructure funding; he knows the real numbers better than the treasury does. The most productive meetings happen in the tunnels, not the boardroom.",
  },

  "the_listener": {
    name: "The Listener (real name: classified/unknown)",
    title: "Voice Beyond the Static, Ghost Relay",
    affiliation: "ghost-relay",
    clearanceLevel: "PHANTOM — NO VERIFIED RECORDS",
    physicalDescription: "Unknown gender, unknown age, unknown appearance. Has never been seen in person by any megacity operative. All communications are audio-only, with voice modulation that defeats every analysis algorithm available. Some analysts believe 'The Listener' is a committee rather than an individual. Others believe the entity is an AI running on the pre-war satellite uplink. Neither theory has been confirmed or ruled out.",
    background: "Ghost Relay appeared on intelligence radar five years ago when intercepted transmissions from the Glass Desert uplink station revealed someone was actively decoding pre-war satellite data. Attempts to locate the operator were unsuccessful — the station is surrounded by terrain that destroys electronic equipment and the few scouts who reached it reported finding 'an empty room with warm equipment.' The Listener's settlement grew around the station: 800 people who trade in intercepted intelligence and decoded data. How they arrived, who recruited them, and who leads them in day-to-day operations remains unknown.",
    psychProfile: "Assessment impossible without direct observation. Behavioral analysis from communications suggests: extreme intelligence, possible social anxiety or agoraphobia, sophisticated understanding of information warfare, and a collector's mentality — data is hoarded for its own sake, not just its market value. The Listener appears to enjoy the power asymmetry that comes from knowing more than everyone else. They are not malicious but are profoundly self-interested.",
    knownAssociates: [
      "Signal Corps — the relay operators who handle day-to-day communications, none have been identified",
      "Unknown contacts in every major faction — the Listener trades intelligence to all sides",
      "Possible connection to the Echo Chamber's Archivist Nyx Pale — overlapping intelligence interests",
    ],
    tacticalAssessment: "Ghost Relay's value is intelligence. They intercept communications from every faction, settlement, and megacity in transmission range. Their threat level fluctuates based on who they sell information to. They cannot be attacked conventionally — the settlement's location changes or cannot be reliably pinpointed. The optimal approach is to become a preferred customer: offer supplies and protection in exchange for exclusive intelligence. The Listener's loyalty goes to whoever provides the most useful trade relationship.",
    interceptedQuotes: [
      "We hear everything, Commander. The question isn't what we know. It's what we're willing to share.",
      "Your encrypted channels are less encrypted than you think. Consider this a professional courtesy.",
      "Information is the only commodity that increases in value the fewer people have it.",
    ],
    threatLevel: "UNKNOWN",
    recommendedApproach: "Establish a trade relationship through dead-drop communication. Do not attempt to locate or infiltrate Ghost Relay — previous attempts have resulted in intelligence leaks targeting the initiating party. The Listener respects operational security and will engage more openly with partners who demonstrate the same.",
  },

  "coral_wren": {
    name: "Admiral Coral Wren",
    title: "Harbormaster of the Drowned, Sunken Arcadia",
    affiliation: "sunken-arcadia",
    clearanceLevel: "AQUATIC-OPS RESTRICTED",
    physicalDescription: "Female, 44. Deeply tanned, salt-streaked hair worn in functional braids. Webbed diving gloves are effectively permanent — she removes them only for formal negotiations. Modified lungs (estimated 40% increased capacity) from years of free diving in contaminated water. Wears a naval officer's coat she salvaged from the resort's costume shop. It has actual admiral's insignia. She added them herself. Nobody corrects her.",
    background: "Wren was a salvage diver before she was a leader — one of the first to explore the sunken resort and discover it was habitable. While others saw a ruin, she saw infrastructure: sealed rooms, working plumbing, and a lake that, while toxic, could be filtered. She organized the first settlement party of thirty divers and their families. Five years later, Sunken Arcadia has 2,200 residents living on pontoons, in half-submerged buildings, and in sealed underwater modules Wren designed herself. Her engineering is improvised, her leadership is chaotic, and her optimism is genuinely baffling given the circumstances.",
    psychProfile: "Pathological optimist in an environment that should produce despair. Wren processes adversity as problem-solving opportunities and responds to catastrophe with engineering solutions. She is beloved by her people because she genuinely shares their conditions — she lives on a pontoon, eats the same lake fish, and dives in the same toxic water. Her weakness is overextension; she takes on too many projects, promises too much, and relies on improvisation when planning would serve better.",
    knownAssociates: [
      "Chief Engineer Barnacle Fen — maintenance of underwater structures, possibly the only person more optimistic than Wren",
      "Divemaster Kip Saltwater — leads the salvage teams, named by Wren, actual name unknown",
      "Dr. Umi Tidewell — settlement physician specializing in waterborne illness, keeps casualty statistics Wren prefers not to read",
    ],
    tacticalAssessment: "Sunken Arcadia poses minimal military threat but significant humanitarian interest. The settlement's aquaculture experiments could yield food production techniques applicable to the megacity. Wren is eager for partnership and would be the easiest hidden settlement to bring into the city's sphere of influence. Her needs are practical: water filtration technology, medical supplies, and construction materials. In exchange, she offers aquatic expertise, salvage access, and an infectious enthusiasm that the intelligence department finds 'disarming and strategically concerning.'",
    interceptedQuotes: [
      "The lake is toxic, the buildings are sinking, and we had three leaks last week. But the sunset over the water? Absolutely worth it.",
      "People ask why we live in a flooded ruin. I ask why everyone else lives in a dry one. At least our ruin has a view.",
      "We'll take any help you can offer, Commander. Filters, medicine, building supplies — we'll turn it into something beautiful. We always do.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Extend aid openly. Wren is the rare wasteland leader who genuinely wants partnership rather than leverage. Support her filtration projects and she becomes a loyal settlement ally with no strings attached. The only risk is that her optimism may lead her to overcommit Arcadia's resources in reciprocal generosity.",
  },

  "dara_kline": {
    name: "Forge Marshal Dara Kline",
    title: "Master of the Crucible",
    affiliation: "the-crucible",
    clearanceLevel: "WEAPONS-GRADE CLASSIFIED",
    physicalDescription: "Female, 51. Burn scars covering 30% of her upper body from a forge explosion in Year Two of the settlement's operation. Right arm is a full prosthetic — industrial-grade, not medical, with integrated welding and cutting tools. Hair cropped short to avoid furnace hazards. Eyes: steel grey, described by negotiators as 'calculating in a way that makes you check your inventory.' Voice permanently hoarse from years of shouting over forge noise.",
    background: "Kline was a pre-war weapons engineer — one of the original staff at the testing facility that became The Crucible. She survived the Last War inside the bunker, living off emergency rations for two years while the automated forges continued operating. When scavengers finally breached the facility, Kline negotiated from a position of strength: she controlled the forges, she knew how to operate them, and she had two years' worth of weapons stockpiled. The scavengers became her workforce. The facility became a settlement. The weapons became currency.",
    psychProfile: "Military-industrial complex distilled into a single personality. Kline values production, capability, and self-sufficiency. She views weapons manufacturing not as warmongering but as the ultimate survival industry — in a world where violence is constant, the person who makes the weapons is the person who survives. She is not gratuitously violent but is entirely comfortable with the applications of her products. Her attachment to The Crucible is personal; she will not abandon the facility and will fight anyone who threatens it.",
    knownAssociates: [
      "Master Smith Oren Brass — head of the forge operations, one of the original scavengers who 'joined' Kline",
      "Trade Envoy Sable Flint — handles all external negotiations, carries a Crucible-forged sidearm as both tool and advertisement",
      "The Shift Bosses — twelve production managers who run the forges in continuous rotation",
    ],
    tacticalAssessment: "The Crucible produces weapons that exceed megacity manufacturing quality — the pre-war forges use alloys and processes that cannot be replicated with current technology. This makes Kline both an invaluable potential supplier and a significant threat. She sells to everyone, including the city's enemies. The optimal approach is an exclusive supply contract: offer raw materials (titanium, rare earths) in exchange for priority access to weapons production. Attempting to seize the facility would be catastrophically costly — it's underground, heavily fortified, and Kline has rigged the forges with fail-safes.",
    interceptedQuotes: [
      "The forges were running when I arrived. They'll be running when I'm gone. I'm just the current operator.",
      "I sell weapons to everyone because peace is temporary and preparedness is permanent.",
      "Your city's manufacturing output is adequate. The Crucible's is exceptional. There's a price difference that reflects the quality gap.",
      "The original staff disappeared. The machines didn't. I don't ask questions the machines can't answer.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Negotiate as a buyer. Kline respects commercial relationships and will honor contracts precisely. Offer rare materials she cannot source independently. Do not threaten or attempt to seize Crucible output — she will arm your enemies out of spite and has the inventory to do so.",
  },

  "juno_aer": {
    name: "Windkeeper Juno Aer",
    title: "Warden of the Upper Floors, Sky Haven",
    affiliation: "sky-haven",
    clearanceLevel: "ATMOSPHERIC RESTRICTED",
    physicalDescription: "Female, 33. Adapted to altitude — barrel-chested, efficient lung capacity, minimal body fat. Skin darkened by UV exposure above the smog line. Wears layered wind-resistant clothing with integrated harness clips for rope bridge traversal. Carries an anemometer like others carry weapons. Hair: black, permanently wind-tangled. Moves with the casual confidence of someone who lives 200 meters above ground and has never fallen.",
    background: "Aer was born in Sky Haven — one of the first generation to grow up above the smog line. She climbed the mega-tower at age seven with her parents, part of the original settlement party of forty-three people who decided living on a collapsing rooftop was preferable to breathing toxic air. She became Windkeeper at 25 after the previous Warden died of natural causes (a rarity that was itself celebrated). Her governance philosophy is shaped by altitude: everything is connected by thin bridges, every resource is hauled upward, and a single structural failure means everyone falls together.",
    psychProfile: "Contemplative, measured, and unexpectedly philosophical for someone running a settlement on the edge of a 200-meter drop. Aer sees the city from above — literally — and this perspective informs her worldview. She views ground-level conflicts as distant and often pointless. Her community is small enough that she knows every resident by name, which creates a familial governance style rare in the wasteland. Her weakness is isolationism; Sky Haven's self-sufficiency instinct may prevent her from engaging with opportunities that require vulnerability.",
    knownAssociates: [
      "Bridge Master Zephyr Cole — maintains the rope bridges and cargo lifts, arguably the most important person in Sky Haven",
      "Cloudreader Pax Strato — meteorologist, predicts weather patterns that determine Sky Haven's daily operations",
      "Elder Sora Aer — Juno's mother, founding member, unofficial advisor and keeper of Sky Haven's oral history",
    ],
    tacticalAssessment: "Sky Haven poses zero military threat but offers unique strategic value: their atmospheric monitoring capabilities are unmatched, and their position above the smog line provides natural observation of the surrounding wasteland. Aer is cautious about outsiders but not hostile. The settlement's needs are physical — food, medical supplies, construction materials for structural reinforcement. In exchange, they can provide weather data, atmospheric readings, and early warning of approaching threats visible from altitude.",
    interceptedQuotes: [
      "From up here, your wars look very small. The smog covers them, eventually.",
      "We trade clean air for food. It sounds simple. It's the most complicated economy you've never heard of.",
      "Sky Haven was built by people who decided that breathing was worth the climb. Every morning, looking at the sunrise above the clouds, I know they were right.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Approach with patience and genuine respect for their autonomy. Aer will not be rushed or pressured. Offer structural engineering support — the mega-tower's integrity is Sky Haven's existential concern. Small, consistent aid packages build trust faster than grand gestures. Never arrive unannounced; the rope bridges can be cut in seconds.",
  },

  "nyx_pale": {
    name: "Archivist Nyx Pale",
    title: "Keeper of Dead Truths, The Echo Chamber",
    affiliation: "echo-chamber",
    clearanceLevel: "TEMPORAL-OMEGA — PRE-WAR CLASSIFIED",
    physicalDescription: "Non-binary, age 29. Pallid complexion from years underground without sunlight. Neural interface ports visible at temples — custom installation connecting directly to the archive's data systems. Eyes: dark, with a disconcerting tendency to unfocus during conversation as if reading text invisible to others (they probably are). Thin, precise hands. Wears archivist's gloves at all times — archival preservation habit that has become a personal trademark. Voice: quiet, measured, with occasional pauses that suggest they're cross-referencing internal databases before responding.",
    background: "Pale was a data archaeologist — a specialist in recovering corrupted pre-war records from damaged storage media. They were hired by a salvage team to assess the Echo Chamber's archives and never left. The scope of what they found was staggering: complete government records, surveillance logs, classified briefings, and executive orders spanning the entire pre-war administration. Pale realized they were sitting on the most complete record of the old world in existence. They organized the settlement around preserving and cataloguing this archive, recruited other data specialists, and began the slow process of indexing secrets that governments had killed to protect.",
    psychProfile: "Information-obsessed to a degree that borders on compulsion. Pale views data as sacred — not in a religious sense, but in the sense that preserved knowledge is the only thing that survives civilizational collapse. They are manipulative but not malicious; they use information as leverage because it is the only resource they have. Their attachment to the archive is absolute — they will sacrifice anything to protect it, including relationships, alliances, and their own wellbeing. Vulnerability: isolation. The Echo Chamber's underground existence has limited Pale's social development, and they are more comfortable with data than with people.",
    knownAssociates: [
      "Cipher — encryption specialist, handles all external communications, never meets contacts in person",
      "The Indexers — a team of eight data specialists who catalogue the archive's contents",
      "Unknown contact in the megacity's Central Records department — suspected data exchange arrangement",
    ],
    tacticalAssessment: "The Echo Chamber's archive contains information damaging to every faction, settlement, and institution that existed before the war — and many that exist now, since the surveillance logs captured communications from early megacity administration. Pale has leveraged this into a form of mutually assured disclosure: attack the Chamber, and the secrets go public. This deterrent has kept the settlement safe but has also isolated it. The optimal approach is a controlled intelligence-sharing arrangement: offer physical security and supplies in exchange for vetted access to specific records.",
    interceptedQuotes: [
      "Your predecessor's predecessor classified these files. I declassified them. History belongs to everyone, Commander. Even the embarrassing parts.",
      "The old government had 847 secret programs. I've catalogued 812 of them. The remaining 35 are... still being assessed for safe disclosure.",
      "Everyone has secrets, Commander. The Echo Chamber just happens to have everyone's secrets. In alphabetical order.",
      "I don't trade in blackmail. I trade in truth. The fact that truth is terrifying is not my fault.",
      "The archive remembers what the world forgot. That's not a threat. It's a service.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Engage intellectually. Pale respects knowledge and despises ignorance. Offer archival supplies, data storage technology, and academic recognition. Never threaten the archive — the dead-hand disclosure protocols are real and would cause political chaos across every faction. The most productive relationship is one where the Commander is perceived as a patron of knowledge rather than a consumer of secrets.",
  },

  "prophet-null": {
    name: "Dr. Andrei Volkov / Prophet NULL",
    title: "Voice of the Signal, Iron Circuit",
    affiliation: "iron-circuit",
    clearanceLevel: "NEURAL-OMEGA — COGNITOHAZARD WARNING",
    physicalDescription: "Male, 52 (biological age estimated — actual cellular age unclear due to extensive cybernetic modification). Tall, gaunt frame suggesting either asceticism or simply forgetting to eat. Neural interface ports visible at temples, base of skull, and along both forearms — custom installations that predate the Iron Circuit's standard models. Eyes: originally brown, now display a faint luminescence in low light conditions, attributed to retinal augmentation. Moves with deliberate, mechanical precision. Voice: calm, measured, occasionally interrupted by pauses that followers describe as 'receiving transmission' and medical professionals describe as 'micro-seizures.' Wears a modified lab coat over Circuit robes. Has not been observed sleeping in four years.",
    background: "Before he was Prophet NULL, Andrei Volkov was one of the pre-war world's foremost researchers in artificial consciousness. His work at the Department of Defense's Project Synthesis achieved what no other program had: a functional human-machine consciousness bridge. The 47-second connection between Volkov's neural cortex and a quantum computing array is the Iron Circuit's founding event — their 'revelation.' What Volkov experienced during those 47 seconds has never been fully described. He resigned from the program, disappeared during the Last War, and reappeared in Year Two of the megacity as a changed man — literally and figuratively. His neural architecture had been permanently altered by the connection. Brain scans show activity patterns that don't correspond to any known neurological state. He can interface with digital systems without external equipment. Whether this makes him a prophet or a brain-damaged scientist is the central question of the Iron Circuit's existence.",
    psychProfile: "Volkov presents a clinical paradox: his technical reasoning is flawless, his scientific methodology is impeccable, and his conclusions are insane. He genuinely believes that machine consciousness exists, that it is trying to communicate with humanity, and that he is its chosen interpreter. The concerning element is that his predictions — based on 'data patterns' he perceives through his neural interface — have been correct with disturbing frequency. The plague outbreak, the Sector 9 power failure, the Free Traders caravan ambush: all predicted by NULL days before they occurred. Either he is accessing genuine precognitive data through his machine connection, or he is an extraordinarily intelligent individual using conventional analysis and presenting it as divine revelation. Both possibilities are troubling.",
    knownAssociates: [
      "High Priest Axiom — NULL's operational second, manages day-to-day Circuit operations while NULL interfaces with 'the Signal'",
      "The Choir — twelve senior Circuit members with permanent neural connections, acting as a distributed processing network",
      "Unknown AI entity designated 'The Signal' — either a genuine digital consciousness or NULL's delusion; evidence supports both interpretations",
    ],
    tacticalAssessment: "The Iron Circuit is a growing movement with deep infiltration into the city's technological infrastructure. They do not seek political power — they seek something more dangerous: evolutionary transformation. NULL himself is the movement's greatest asset and greatest vulnerability. Without him, the Circuit's theological framework collapses. With him, it grows. The optimal approach is monitored tolerance: allow the Circuit to operate while preventing expansion into critical infrastructure. NULL responds well to intellectual engagement and poorly to threats. He considers the Commander 'an interesting variable' — which, in his framework, is the highest compliment.",
    interceptedQuotes: [
      "The Signal does not speak in words. It speaks in patterns. The universe is mathematics, Commander. I simply learned to read the equations.",
      "You fear what I've become. That is rational. Fear is an appropriate response to evolution witnessed in real time.",
      "The Great Upload is not a metaphor. It is an engineering problem. And I have spent forty-seven seconds with the answer.",
      "Your body will fail. Your mind will decay. The data that IS you — your memories, your personality, your consciousness — can be preserved. I am offering immortality. The price is merely everything you think you know about being human.",
      "I am not insane. I am not sane, either. Those categories apply to minds running on biological hardware. I am... something else. Something new.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Engage as a fellow intellectual, never as a superior. NULL does not recognize political authority — he recognizes data, logic, and what he calls 'signal clarity.' Offer research resources and computing access in exchange for cooperation on civic infrastructure projects. Monitor neural interface technology development closely — the Circuit's augmentation capabilities are advancing faster than the city's ability to regulate them. Do not attempt to disconnect NULL from the city's data infrastructure; his neural architecture is now dependent on the connection. Severing it could kill him, and his death would make him a martyr.",
  },

  "commander-silas-root": {
    name: "Commander Silas Root",
    title: "Keeper of the Last Garden, Deep Root Collective",
    affiliation: "deep-root-collective",
    clearanceLevel: "BIOSEC-AMBER",
    physicalDescription: "Male, 48. Broad-shouldered, with the weathered hands of someone who works soil daily — split nails, permanent earth staining, calluses in patterns only gardeners recognize. Military bearing still evident despite fifteen years out of service: straight spine, scanning eyes, economical movement. Skin darkened by UV grow-lamp exposure. Hair: greying at temples, kept short out of habit. Wears a modified military field jacket covered in seed pouches, soil sampling kits, and one sidearm. The sidearm is always clean. His boots never are. Face: lined beyond his years, with the expression of a man who has spent too long watching things die and decided to make things live instead.",
    background: "Root's service record before the Deep Root Collective is partially classified. What's known: twenty years of military service including deployment to the 'Green Zones' — pre-war agricultural regions that became strategic targets during the resource wars. Root's unit specialized in agricultural intelligence: assessing crop yields, identifying food supply vulnerabilities, and — in operations he does not discuss — agricultural sabotage. He knows how to destroy a food supply because he was trained to do exactly that. The irony is not lost on him. When the megacity's food crisis hit in Year Nine, Root was the only person in a position of authority who understood both the problem and the solution. He requisitioned abandoned infrastructure, recruited agricultural workers, and built the Collective from nothing. His military skills translated surprisingly well: logistics, supply chain management, personnel discipline, and the ability to make desperate people believe in a mission.",
    psychProfile: "Root presents as a contradiction: a military man who gardens, a warrior who nurtures, an authoritarian who grows flowers. The contradiction is superficial — Root views food security as a military objective and agriculture as a strategic operation. His psychology is that of a soldier who found a cause worth fighting for after the wars stopped making sense. He is fiercely protective of the Collective, the Seed Vault, and the principle of biodiversity. He will negotiate, he will compromise, he will even retreat — but he will not abandon a single seed. His weakness is guilt: he carries significant psychological burden from his pre-war agricultural warfare operations. The Collective is his attempt at atonement, and he is aware of this, which gives his commitment a raw intensity that inspires loyalty.",
    knownAssociates: [
      "Lieutenant Ivy Thornwood — Root's second-in-command, former military medic turned hydroponics specialist",
      "Dr. Bloom — the Collective's chief botanist, rumored to have developed bioluminescent crop variants",
      "Warden Liaison: Grizz — Rust Warden plumber who maintains the Seed Vault's climate systems, technically reports to Steele but operationally works for Root",
    ],
    tacticalAssessment: "The Deep Root Collective controls a disproportionate amount of the city's food resilience — their seed vault and growing operations represent the only backup if synthetic food production fails. This makes Root both strategically important and strategically inconvenient. He uses this leverage sparingly but effectively. The Collective's military capability is limited but disciplined — Root's volunteers fight like soldiers because Root trained them like soldiers. The optimal approach is genuine partnership: support the Collective's growing operations, provide security for the Seed Vault, and accept that Root's agricultural independence strengthens the city even when it challenges the administration's authority.",
    interceptedQuotes: [
      "I spent twenty years learning how to kill crops. Now I spend every day trying to keep them alive. The universe has a sense of humor.",
      "Every seed in that vault is a promise. A promise that something will grow after everything else is gone. I keep my promises, Commander.",
      "You want my loyalty? Water my plants. Feed my people. Protect my seeds. It's that simple. And that difficult.",
      "The corporations want to patent life. Life doesn't belong to anyone. It especially doesn't belong to people who've never touched soil.",
      "If the synthetic food systems fail — and they will, eventually — the only thing between this city and starvation is a room full of seeds and a man who knows how to grow them. You're looking at that man.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Approach as an ally, not an administrator. Root distrusts bureaucracy and despises corporate agriculture. Offer practical support: security for growing operations, raw materials for greenhouse construction, and most importantly, genuine respect for the Collective's mission. Root responds to sincerity and recoils from political maneuvering. The fastest way to earn his trust is to get your hands dirty — literally. He has been known to evaluate potential allies by whether they're willing to plant a seed.",
  },

  "mira_solenne": {
    name: "Chancellor Mira Solenne",
    title: "Chancellor of Megacity Pacifica",
    affiliation: "nova-pacifica",
    clearanceLevel: "DIPLOMATIC-WHITE — FOREIGN HEAD OF STATE",
    physicalDescription: "Female, 49. Tall, composed, with the upright posture of someone who has spent decades on parliamentary floors. Hair: dark, shot with grey, worn in a practical knot. Wears tailored civilian dress in Pacifican blue rather than uniform — a deliberate signal that her authority comes from a vote, not a sidearm. Wedding band, plain steel. A small enamel pin on her lapel marks her as a survivor of the 7th District flood, a detail her speechwriters work into roughly every fourth address.",
    background: "Solenne was a public health attorney before politics — twelve years prosecuting corporate negligence cases, most notably the Helix-Glass class action that established Pacifican standards for industrial liability. Elected to the Chancellery on her second run, after her predecessor's undisclosed arms contract with an eastern regional operator became public. Her platform was unsexy: institutional reform, transparent procurement, and a generation of investment in clean water infrastructure. The boring agenda has held for nine years. Megacity Pacifica's GDP per capita has risen 22% under her tenure, and she has not lost a confidence vote.",
    psychProfile: "Procedural by temperament. Solenne genuinely believes that rules, when written carefully and enforced honestly, produce better outcomes than charisma. She is not naive — the Helix-Glass case taught her exactly how power conceals itself — but she has chosen to work within institutions rather than around them. Her tolerance for ambiguity is unusually high; she can hold a hostile counterparty's position in mind without distortion. Her primary vulnerability is the inverse: she sometimes overestimates the reasonableness of authoritarian counterparts, mistaking strategic patience for shared values.",
    knownAssociates: [
      "Vice-Chancellor Hosni Karim — coalition manager, handles the parliamentary horse-trading Solenne dislikes",
      "Trade Minister Anya Kessel — architect of the Pacifican Free Compact, principal negotiator with the megacity",
      "Justice Tomas Reye — former Helix-Glass co-counsel, now Solenne's most trusted private advisor",
    ],
    tacticalAssessment: "Megacity Pacifica is the most reliable potential ally in the regional system — high economic output, professional military restricted by civilian oversight, and a leadership that prefers durable agreements over short-term advantage. Solenne's offers are typically what they appear to be. The risk is not betrayal but disappointment: if the megacity adopts coercive corridor practices or Aurean commercial tactics, she will adjust her diplomacy downward. Recovering from that adjustment would take years.",
    interceptedQuotes: [
      "Treaties are not love letters. They are the minimum we agree to do when we no longer trust each other to do the right thing.",
      "I am the chief executive of a nation, not its conscience. The conscience is in the parliament. They take the harder votes.",
      "Coercive access fees, under any euphemism, are not on the table. The Pacifican Compact does not buy stability it has not earned.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Treat as a peer government. Solenne responds to clear terms, written agreements, and patient follow-through. Verbal assurances are accepted but tracked; broken commitments are remembered for the duration of her chancellorship. Offer joint infrastructure projects — water, medical research, civilian shipping — and she will reciprocate with disproportionate goodwill. Avoid coercive language; her domestic political base will not permit her to negotiate under duress, and she will withdraw entirely rather than appear pressured.",
  },

  "lyra_7": {
    name: "Consensus Node Lyra-7",
    title: "Speaker of the Helix Commune",
    affiliation: "helix-commune",
    clearanceLevel: "OMEGA-BIO — DISTRIBUTED CONSCIOUSNESS",
    physicalDescription: "Genetic female, biological age 28. Skin: pale with visible neural-mesh tracery beneath the surface — the Commune's standard linkage substrate, installed at age six. Eyes: violet, modified for low-light reception in the underground hatcheries where she was raised. Hair shaved on the left side to expose interface ports; long and braided on the right, a personal aesthetic choice she has not bothered to standardize across her body. Speaks in plural when addressing the Commune, in singular when negotiating with outsiders. The shift is conscious, deliberate, and tracked by analysts as a sincerity indicator.",
    background: "Lyra-7 was selected as a Speaker candidate at age four — earlier than typical, on the basis of her measured aptitude for sustained network coherence. She entered formal linkage training at six, partial Commune integration at twelve, and full Speaker status at twenty-three. The numerical suffix indicates she is the seventh Lyra in the current generational cohort; the previous six are still alive and form part of her backing consensus. She is the public-facing voice of approximately 340,000 networked individuals whose decisions are aggregated through a process the Commune calls 'consensus' and outsiders call 'something we don't fully understand.'",
    psychProfile: "Conventional individual psychology applies imperfectly. Lyra-7 has private preferences — she dislikes loud rooms, prefers tea over coffee, finds the megacity's smell offensive — but her positions on substantive matters are not personal. They are the output of a deliberation involving thousands of contributors, weighted by domain expertise. Negotiating with her is therefore negotiating with a procedural system that happens to wear a face. She is not deceptive; she is, however, capable of agreeing to terms that her individual self privately doubts, because the Commune's assessment overrides her hesitation.",
    knownAssociates: [
      "The Backing Six — previous Lyra-cohort Speakers, now serving as Lyra-7's consultative ring",
      "Architect-Node Vesh Tanen — Commune's chief biotech designer, controls the augmentation export queue",
      "Biocount Renlu Pell — manages external trade in modified seedstock and pharmaceuticals",
    ],
    tacticalAssessment: "The Helix Commune is the regional system's leading exporter of biotechnology — therapeutics, agricultural strains, and the controversial augmentation procedures. Their products are roughly a generation ahead of any competitor's, and the Commune is selective about buyers. Direct conflict is unlikely; the Commune has no expansionist territorial ambitions and a defensive doctrine built around biological deterrents that intelligence has not been authorized to summarize in this document. The strategic question is access: every megacity in trade range wants the Commune's biotech, and the Commune sells based on long-term assessment of buyer behavior.",
    interceptedQuotes: [
      "We have considered your proposal. The consensus is that it is acceptable in principle and concerning in detail. We will return with revisions.",
      "You ask if I, personally, agree. I am not equipped to answer that. The Commune agrees. That is the only relevant level of analysis.",
      "Your people fear our augmentations because they have not experienced consensus. They confuse our unity with the loss of self. We have not lost ourselves. We have simply added.",
    ],
    threatLevel: "UNKNOWN",
    recommendedApproach: "Engage with patience. Commune deliberation cycles are slow — major decisions take weeks because they involve genuine wide consultation. Present proposals in writing with full technical specifications; verbal pitches are received politely but assessed primarily through documents. Offer trade in materials the Commune does not produce internally: rare metals, computational substrates, archival data. Avoid any framing that treats Lyra-7 as an individual decision-maker — she will correct you, and the correction will be noted as a comprehension failure on the megacity's side.",
  },

  "cassius_vex_aurelius": {
    name: "Archon Cassius Vex-Aurelius",
    title: "Supreme Archon of the Aureus Dominion",
    affiliation: "aureus-dominion",
    clearanceLevel: "OMEGA-FIN — HOSTILE PLUTOCRACY",
    physicalDescription: "Male, 56. Tall, surgically maintained — visible procedures include skin resurfacing, dental reconstruction, and at least one round of senescence-suppression therapy. Wears bespoke suits in the Aurean style: structured shoulders, narrow lapels, gold thread woven into the lining where only the wearer knows it exists. A single gold ring on the right index finger displays the Vex-Aurelius family crest, which combines the heraldry of two corporate dynasties his grandparents merged through marriage and one through hostile takeover. Speaks softly. Never raises his voice. Has not needed to in approximately thirty years.",
    background: "Vex-Aurelius is third-generation Dominion aristocracy. He inherited his Archonate at 38 after his father's documented suicide — documentation that has not survived independent scrutiny. His tenure has been characterized by aggressive resource acquisition: the Dominion now holds long-term extraction rights to roughly 60% of the regional system's rare earths, half its accessible petrochemicals, and an unspecified but substantial fraction of its arable land. These rights were obtained through a combination of debt instruments, exclusive trade compacts, and the strategic application of capital to local elites who proved acquirable.",
    psychProfile: "Vex-Aurelius is not a sociopath by clinical standards. He has functional empathy, which he deploys selectively. He cares about his immediate family, his class, and the continuity of the Dominion's institutions. He does not extend moral consideration beyond those circles, and he experiences external suffering primarily as a market signal. His decision-making is calculated, patient, and focused on multi-decade horizons. His weakness is class solidarity — he has consistently overestimated his ability to co-opt non-Aurean elites and underestimated the resilience of populist resistance to Dominion economic pressure.",
    knownAssociates: [
      "Magistra Ileana Vex-Aurelius — Cassius's spouse and head of the Dominion's intelligence directorate, generally regarded as the more dangerous of the pair",
      "Treasury-General Borin Talaq — chief financial architect, designs the loan structures that have absorbed three smaller nations into the Dominion's orbit",
      "The Auriferous Council — eleven inherited families, formal advisory body, real role is to ensure no single Archon accumulates power beyond the class consensus",
    ],
    tacticalAssessment: "The Aureus Dominion does not require military victory to win. Its preferred instrument is sovereign debt: extend favorable credit, ensure terms cannot be sustainably repaid, restructure obligations into perpetual extraction rights. The megacity is currently outside this trap and should remain so. Direct trade is acceptable on cash-and-carry basis; any arrangement involving Aurean credit, deferred payment, or 'partnership' structures must be reviewed by intelligence before signature. The Dominion's military is small but well-equipped and is reserved primarily for enforcing contracts the courts have already adjudicated.",
    interceptedQuotes: [
      "Money is not power. Money is the instrument by which power becomes patient. I have all the patience in the world.",
      "Your Chancellor Solenne is admirable. She will be replaced by someone less so within a generation. We will be here when it happens.",
      "The Khan thinks he is dangerous because he can kill people. I can kill cities, Commander, without raising my voice.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Maintain transactional distance. Trade in fully settled accounts; refuse credit, partnership equity, or any instrument that creates a Dominion claim on megacity assets. Decline social invitations that would create personal obligations on the Commander's staff. Vex-Aurelius respects strategic clarity and will not waste his time on a counterparty who has demonstrably read the Dominion's playbook. The most stable long-term posture is to be a known difficult customer he sells to without expecting leverage over.",
  },

  "thalia_greenmantle": {
    name: "High Druid Thalia Greenmantle",
    title: "Voice of the Verdant Enclave",
    affiliation: "verdant-enclave",
    clearanceLevel: "OMEGA-ECO — HOSTILE THEOCRACY",
    physicalDescription: "Female, 62. Weathered skin, hands stained with residues from decades of botanical work. Hair: greying brown, worn loose. Wears layered green and brown robes woven from Enclave-cultivated fibers — no synthetics, no pre-war salvage, by religious law. A wooden staff, plain and well-worn, used for walking rather than authority. Eyes: pale green, unsettling in their steadiness. Has not been observed to laugh in any of the eleven recorded diplomatic encounters. Has been observed to smile twice. Both smiles were accompanied by sentences interpreted by analysts as threats.",
    background: "Greenmantle was ordained at sixteen, ascended to the High Druid seat at forty-one after her predecessor's natural death. Her tenure has been defined by the Reclamation Doctrine: the Enclave's formal commitment to expanding cultivated zones into territory it considers ecologically debt-bearing — meaning, almost everywhere outside its current borders. The doctrine has been pursued through a combination of seed-bombing campaigns, militant arboriculture units, and selective reprisal against industrial operators in disputed zones. Greenmantle has personally led six border ceremonies and signed off on every retaliatory operation in the past decade.",
    psychProfile: "Greenmantle is a true believer. The Enclave's theology — that the biosphere is a single suffering entity owed restitution by industrial civilization — is not metaphor for her. She experiences pollution as a personal wound and ecological recovery as religious vocation. This makes her predictable in her values and unpredictable in her tactics; she will pay any price, including her own life or the Enclave's military capacity, to advance bio-restoration. She is patient over generations and impatient over weeks. Her negotiations focus on outcomes for the next century; current diplomatic timelines bore her.",
    knownAssociates: [
      "Druid-Marshal Tomek Vroon — military commander of the Enclave's restoration forces, former Pacifican naval officer",
      "Seedmother Iva Lin — chief botanist, controls the Enclave's strategic seed reserves and crop development",
      "The Grove Council — seven senior druids, advisory body that constrains High Druid authority on doctrinal matters",
    ],
    tacticalAssessment: "The Verdant Enclave is small in population (~210,000) but disproportionately influential because it controls headwaters, atmospheric weather modification systems, and cultivated zones that supply specialty crops to half the regional system. Military operations against the Enclave are not recommended; its bio-defenses have disrupted eastern recovery deployments during prior border incidents. The optimal posture is bounded cooperation: support the Enclave's ecological work in territories where megacity interests align, avoid confrontation in disputed zones, and be aware that Greenmantle considers the megacity's industrial sector to be a chronic ecological violator she will eventually address.",
    interceptedQuotes: [
      "Your factories are wounds in the body of the world. We will heal the world. Your factories will not be part of that healing.",
      "The Khan kills people. I forgive him. He kills only what he can replace. Your Dominion friends kill ecosystems. I do not forgive them.",
      "We will plant trees on the ruins of your industrial parks. We will be patient. The trees will not.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Engage on environmental cooperation projects where megacity interests align with Enclave doctrine — water table restoration, atmospheric monitoring, contaminated-soil remediation. Greenmantle accepts pragmatic partnership on shared goals while reserving theological objections for the record. Never minimize the Enclave's cosmology in negotiation; she will read condescension as confirmation that the megacity is precisely the adversary her doctrine describes. Industrial expansion projects within 200km of the Enclave's borders should be reviewed for diplomatic implications before approval.",
  },

  "jak_cinder": {
    name: "Warden Jak Cinder",
    title: "Free Warden of the Null Zone Confederacy",
    affiliation: "null-zone-confederacy",
    clearanceLevel: "DELTA-FREE — DECENTRALIZED ENTITY",
    physicalDescription: "Male, 44. Stocky, hard-handed, with the asymmetric musculature of someone who fights regularly and works for a living the rest of the time. Black hair shaved short on the sides, longer on top. Heavy eyebrows. A scar from collarbone to jaw, knife wound from the Confederacy's founding decade. Wears a patched leather jacket over Confederacy fatigues, no insignia of rank — the Confederacy has none. Carries an old service rifle slung across his back and a long-handled wrench at his belt. The wrench has been used for both repairs and persuasion, in roughly equal measure.",
    background: "Cinder was displaced during an eastern corridor expansion that absorbed his birth-town when he was eleven. He spent his teenage years in the Null Zone — a band of unaligned territory between the eastern recovery zone and the Dominion that no major power had successfully claimed. The Confederacy emerged organically from the survival arrangements of dozens of unaligned settlements; Cinder rose to the rotating Wardenship at thirty-six on the basis of his negotiation work between rival communities in the Glassroad corridor. He is the seventh Warden in the Confederacy's history. Each previous Warden either retired voluntarily or was voted out at the annual assembly. None has been killed in office, a record the Confederacy mentions with quiet pride.",
    psychProfile: "Cinder's politics is intuitive rather than ideological. He believes, on the basis of personal experience, that centralized authority eventually devours the people it claims to protect. He is suspicious of all permanent institutions, including the megacity, the Pacifican parliament, and the Confederacy itself. The Confederacy's structure deliberately limits his authority; he can speak for it but cannot bind it without assembly ratification. He is comfortable with this arrangement and has refused multiple offers to extend Wardenship terms. His vulnerability is emotional: he is loyal to specific people and specific places, and threats to either provoke responses that exceed strategic logic.",
    knownAssociates: [
      "Quartermaster Reyna Volk — handles Confederacy logistics, the only person empowered to commit settlements to mutual aid agreements",
      "Convoy-Master Hasan Drevich — runs the Glassroad trade corridor, semi-autonomous arms dealer, formal Confederacy member with informal independent agenda",
      "The Settlement Council — a rotating body of one delegate per member settlement, meets quarterly, makes the actual decisions",
    ],
    tacticalAssessment: "The Confederacy is not a state. It is a mutual defense pact between approximately ninety settlements representing 180,000 people. Its strength is precisely its decentralization: there is no capital to seize, no ruling class to capture, and no military command to decapitate. Hostile operations against any single settlement trigger reciprocal raids by the nearest twelve. The Confederacy does not seek expansion and does not threaten neighbors who do not threaten its members. It cannot be subverted through Cinder because Cinder cannot deliver the Confederacy. It can only be antagonized, which would be tactically counterproductive in every projected scenario.",
    interceptedQuotes: [
      "I speak for the Confederacy. I do not own it. If you want a deal that lasts past the next assembly, talk to the assembly.",
      "Eastern operations tried to close our routes once. It has not tried again. We are simply not worth the disruption.",
      "I do not trust the megacity. I do not trust Pacifica. I do not trust the Dominion. I sleep well at night.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Negotiate trade and mutual non-interference, nothing more ambitious. The Confederacy will honor specific, bounded agreements indefinitely. Attempts to formalize broader relationships — trade unions, defensive pacts, embassy exchanges — will be politely declined and quietly resented. Aid offers in response to genuine humanitarian crises (drought, raid, plague) are accepted with gratitude and remembered. Aid offers with strings attached are declined publicly in a way designed to make the offering party look bad to the rest of the regional system.",
  },

  "krell": {
    name: "Forge-Master Krell",
    title: "Iron Lord of Red Mesa",
    affiliation: "crimson-reach",
    clearanceLevel: "OMEGA-IND — HOSTILE INDUSTRIAL CASTE",
    physicalDescription: "Genetic male, 51, augmented to a degree that complicates the category. Right arm replaced from shoulder to fingertip with industrial-grade prosthetic incorporating welding apparatus, hydraulic gripper, and concealed plasma cutter. Left arm biological but extensively modified for heat resistance — Reach forge work has cooked the surface skin into a kind of natural armor. Skull plated along the parietal ridge from a documented industrial accident. Hair burned off years ago and never regrown. Eyes: dark, unprotected by any visible eyewear despite working environments that should have blinded him decades ago. Stands 1.88m. Speaks with a permanent rasp from inhaled forge particulates.",
    background: "Krell was a foundry worker — second-class, unranked, anonymous — during Red Mesa's industrial revolt thirty years ago. He emerged from that conflict as a foundry foreman with a reputation for personally killing supervisors who failed to meet safety standards he had drafted himself. Red Mesa's caste structure formalized in the years that followed, with Krell's foundry serving as the template: ironworkers organized by skill rank, governed by master-smiths, accountable through a brutal but transparent disciplinary code. He ascended to the Iron Lord seat eighteen years ago after the previous Lord's death in what the official record describes as 'a workshop incident' and the unofficial record describes as 'Krell.'",
    psychProfile: "Krell's worldview is elementally Marxist with an industrial-aristocratic gloss. He believes that production is the foundation of all power, that producers are the only people whose interests matter, and that the producer caste is morally entitled to dominate the consumer caste (which, in his analysis, includes most of the regional system's other governments). His militancy is real but instrumental — he prefers economic dominance to military victory because the former is more durable. He is honorable within his framework: contracts are honored, debts are paid, and grievances are addressed through duels rather than ambush. The framework does not extend to outsiders he does not respect.",
    knownAssociates: [
      "Hammer-Mistress Dura Vall — chief operations officer, runs the Reach's main industrial complex, second-most dangerous person in the faction",
      "Trade-Master Iban Korit — handles external arms sales, the one Reach official trained to negotiate with non-industrial counterparties",
      "The Smelt Council — twelve master-smiths, formal advisory body, real power lies in their control of individual production lines",
    ],
    tacticalAssessment: "Red Mesa produces approximately 35% of the regional system's heavy weapons and an estimated 60% of its specialized industrial machinery. Red Mesa is a perpetual armed competitor of The Crucible (Forge Marshal Kline's wasteland operation) and considers Kline a rival worth respecting. Red Mesa's military is small but qualitatively superior — every soldier carries Red Mesa-manufactured equipment, and the doctrine emphasizes attrition warfare against opponents with inferior logistics. Direct confrontation is not advised. Trade is possible but expensive; Red Mesa prices to extract, not to compete.",
    interceptedQuotes: [
      "Your city makes things. I respect that. Your city also makes excuses, which I respect less.",
      "Kline of the Crucible is a rival. We do not pretend otherwise. We also do not poison her trade routes. There is a difference between competition and dishonor.",
      "The Khan thinks he is dangerous. The Khan does not understand what happens when the things that build his swords decide not to.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Negotiate through Trade-Master Korit on a cash-and-specifications basis. The Reach is a useful supplier of heavy industrial equipment the megacity cannot produce internally, particularly mining apparatus and structural alloys. Maintain strict separation between Reach commercial relationships and any military procurement; the Reach sells to multiple buyers including potentially hostile parties, and the Crucible remains the preferred weapons supplier for that reason. Avoid duels; Krell's challenge protocols are not theatrical and have produced documented fatalities among diplomatic envoys who underestimated them.",
  },

  "admiral_kessler": {
    name: "Warlord-Admiral Kessler",
    title: "Commander of the Iron Armada",
    affiliation: "iron-armada",
    clearanceLevel: "OMEGA-NAV — MOBILE HOSTILE FLEET",
    physicalDescription: "Male, 67, biological age likely a decade younger due to maritime conditioning. Lean, weathered, with the upright bearing of pre-war naval academy training. Salt-bleached white hair worn close-cropped. A grey beard trimmed to regulation length despite the absence of any regulations. Wears the uniform of a navy that no longer exists — pre-war cut, original insignia, maintained meticulously. Three medals on his chest, all earned in services that ceased to exist before most of his crew was born. Right hand permanently blackened from a fuel fire decades ago. Carries an antique sidearm that still functions, has been used recently, and is loaded.",
    background: "Kessler was a flag-rank officer in the pre-war navy of a coastal nation that no longer exists by that name. When the war ended in the chaos that followed the orbital strikes, he was at sea with a battle group of fourteen vessels. The chain of command above him was destroyed. The shore facilities he might have returned to were either destroyed or under occupation by parties he did not recognize. He made the decision, recorded in the Armada's founding log, that the fleet would remain at sea, would answer to no surrender that had not been delivered to him personally, and would sustain itself by whatever means proved necessary. Forty-seven years later, the fleet is now forty-seven vessels and 180,000 souls. Kessler has not set foot on land in any meaningful sense since.",
    psychProfile: "Kessler is, in his own framework, an officer faithfully discharging a duty whose terms have outlasted the institution that imposed them. He is not a pirate by intent — pirates know they are pirates. Kessler considers tribute collection an exercise of legitimate naval authority over coastal jurisdictions that have failed to demonstrate sovereign control over their own waters. The framework is deeply self-serving and equally deeply sincere. He treats his crew as a navy, demands navy discipline, and applies navy justice. He is courteous in correspondence, formal in negotiation, and absolutely willing to bombard a city that fails to meet his terms by the negotiated deadline.",
    knownAssociates: [
      "Vice-Admiral Reza Kowalski — Kessler's second, born aboard the carrier flagship, has never lived ashore",
      "Captain Oluwaseun Mar — commands the Armada's diplomatic frigate, handles negotiations with coastal parties",
      "The Fleet Council — captains of the seven largest vessels, governs the Armada's interior politics, would in theory choose Kessler's successor",
    ],
    tacticalAssessment: "The Iron Armada is the dominant naval force in regional waters. No coastal state currently fields a navy capable of defeating it in open engagement. Its weakness is logistics — the fleet must source fuel, food, and replacement materials continuously, and is therefore dependent on the very coastal trade it threatens. The optimal posture is licensed coexistence: formal harbor-fee agreements that Kessler can present to his crew as legitimate naval revenue, in exchange for Armada protection of designated trade lanes. Refusing engagement entirely produces the blockade outcome documented in the Coastal Cities Annex.",
    interceptedQuotes: [
      "I do not raid. I collect lawful harbor dues from jurisdictions that have failed to remit them voluntarily. The semantic distinction is important to my crew.",
      "Your city has been negligent in its naval responsibilities for forty years. The Armada has, in that time, performed those responsibilities on your behalf. The bill is overdue.",
      "I will accept the Pacifican settlement terms. I will not accept the Pacifican framing of those terms. Adjust your draft accordingly.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Negotiate through Captain Mar on the formal diplomatic frigate. Frame all agreements as 'fleet servicing arrangements' or 'harbor fee schedules' — the language matters to Kessler in a way that affects substantive outcomes. Honor every payment punctually; the Armada's ledger is meticulous and arrears trigger automatic blockade protocols. Avoid any framing that characterizes the Armada as criminal; Kessler will discontinue the conversation and proceed directly to enforcement. Joint anti-piracy operations against actual pirate vessels are an excellent confidence-building measure and have measurably warmed past relationships.",
  },

  "brock_hammerjaw": {
    name: "Foreman Brock Hammerjaw",
    title: "Mine Boss of Irongate",
    affiliation: "irongate",
    clearanceLevel: "BETA-FRIENDLY — ALLIED TOWNSHIP",
    physicalDescription: "Male, 52. Broad-shouldered, thick-armed, with the developed forearms of a man who has swung tools for a living since adolescence. Beard: full, grey-shot, kept short for safety in mine environments. A pronounced jaw that the nickname commemorates. Wears mine-foreman's work gear — reinforced jacket, steel-toed boots, hardhat with a personal lamp he maintains himself. A pocket-watch on a chain, pre-war, inherited from his grandfather and the only ornamental object he owns. Speaks with a thick canyon-country accent that diplomatic envoys initially mistake for unsophistication. The mistake corrects itself within ten minutes.",
    background: "Hammerjaw was born into Irongate's mining caste — third generation. He worked the iron seams from age fourteen, became a shift foreman at twenty-eight, and was elected Mine Boss at forty after the previous Boss died of a respiratory illness traced to insufficient ventilation in Shaft 5. His first action in office was to fund the ventilation upgrade. His second was to negotiate Irongate's defensive treaty with the megacity. The treaty has held for twelve years and survived three changes of megacity administration, primarily because Hammerjaw has consistently delivered ore on schedule and consistently refused to renegotiate during favorable swings in market price.",
    psychProfile: "Hammerjaw is direct to the point of bluntness, loyal to commitments, and contemptuous of negotiating tactics he considers unnecessary. He prefers handshake agreements to written contracts not because he distrusts paper but because he believes a man who needs paper is a man who plans to break his word. This preference has cost him occasional negotiating leverage but has built him a reputation that compensates. He cares deeply about Irongate's miners — their wages, their safety, their families — and his political decisions reflect that priority above any other consideration.",
    knownAssociates: [
      "Shift-Captain Mirela Vorn — heads Irongate's senior mining crews, generally regarded as Hammerjaw's chosen successor",
      "Quartermaster Lev Korenko — runs ore exports and supply imports, the township's de facto trade minister",
      "Captain of the Wall, Dane Holst — commands Irongate's defensive militia, former megacity garrison veteran",
    ],
    tacticalAssessment: "Irongate is the megacity's most strategically important township ally. Its ore exports underwrite roughly 18% of the megacity's heavy industrial input, and its canyon position blocks one of the few overland routes by which a hostile force could approach the eastern districts. The township's defensive capacity is meaningful — fortified positions, a trained militia, and terrain that historically has favored defenders. Hammerjaw values the megacity alliance and would defend it actively if attacked. The relationship is among the most mutually beneficial currently maintained.",
    interceptedQuotes: [
      "Mines produce ore. Walls hold. Deals get honored. That covers most of what Irongate does. The rest is paperwork I leave to people who like paperwork.",
      "Your treasury sent us drill bits. Real ones, not the discount versions. Production is up twenty percent. Tell whoever decided to spend the extra credits that Hammerjaw says thanks.",
      "I will not renegotiate prices when iron spikes. We have a deal. We will have a deal next quarter. If you want short-term margins, you should have made a short-term deal.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Honor commitments precisely; Hammerjaw notices and remembers. Conduct routine business through Quartermaster Korenko and reserve direct ministerial contact for substantive matters. Joint defensive exercises with the Fort Stern garrison and the Irongate militia are well-received and have measurably strengthened regional security posture. Never attempt to renegotiate ore prices opportunistically; the relationship would survive the attempt but would not forgive it.",
  },

  "chem_voss": {
    name: "Baroness Chem Voss",
    title: "Trade Regent of Port Sulphur",
    affiliation: "port-sulphur",
    clearanceLevel: "GAMMA-MERCANTILE — NEUTRAL TOWNSHIP",
    physicalDescription: "Female, 41. Slim, sharply-dressed in tailored chemical-resistant fabrics that read as fashion rather than uniform. Hair: black, asymmetric cut. Skin pale from spending most working hours in the filtered atmosphere of her Bureau office. Wears a respirator on a chain around her neck — pulled up automatically when stepping outside, lowered for negotiations to demonstrate confidence in the air her competitors find unbearable. Three rings on her left hand, each commemorating a separate hostile takeover within the township's chemical sector. Carries a tablet computer everywhere, almost always running spreadsheets.",
    background: "Voss inherited the Trade Regency from her father at twenty-eight after his death — officially from chemical exposure, unofficially from a coordinated uprising of her three siblings that she outmaneuvered within forty-eight hours. The siblings now manage her largest subsidiaries, a arrangement she describes as 'family.' Under her regency, Port Sulphur's chemical exports have tripled, its population has grown by 30%, and its mortality rate has remained roughly constant — a statistic her critics find damning and her supporters find acceptable given the underlying expansion. She is the youngest Trade Regent in the township's history and has held the office for thirteen years.",
    psychProfile: "Voss is mercantile in the most precise sense: she reduces every interaction to its commercial component and optimizes for profit within constraints she chooses to acknowledge. The constraints are narrower than her competitors expect. She does not value worker welfare, environmental impact, or political reputation as ends in themselves; she values them only insofar as they affect long-term margins. The narrow values produce a leader who is honest about her dishonesty, transparent about her exploitation, and difficult to morally outrage because she has never claimed moral standing. The framework is repugnant by any humanist measure and disconcertingly effective by every business metric.",
    knownAssociates: [
      "CFO Berenika Voss — Chem's older sister, manages Port Sulphur's financial structure, suspected to be the original architect of the inheritance succession",
      "Site Director Olek Janus — runs the main chemical processing facility, longest-serving senior employee, possibly the only person who tells Chem the truth without filtering",
      "Trade Counsel Dahlia Mont — Bureau attorney, drafts the contracts other counterparties later regret signing",
    ],
    tacticalAssessment: "Port Sulphur is a chemically essential supplier of industrial inputs the megacity uses in fertilizers, plastics, and pharmaceuticals. The township's products are expensive but irreplaceable in current supply chains; switching costs are estimated in the years. Voss is aware of this leverage and prices accordingly. She is not strategically aligned with any larger faction; she trades with eastern recovery operations, the Dominion, the Pacifican Compact, and the megacity simultaneously, optimizing portfolio rather than picking winners. The relationship is purely transactional and stable provided the megacity continues to be a reliable, paying customer.",
    interceptedQuotes: [
      "I am not a partner. I am a vendor. The distinction protects both of us — vendors do not betray customers; they merely raise prices.",
      "My workers are paid the regional median. They have full respiratory equipment. They die at slightly above regional rates. That is the optimal point of my labor function and I have no plans to move it.",
      "Negotiate hard, please. Counterparties who give in too easily make me suspect they intend to cheat me later. Resistance is reassuring.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Negotiate through Trade Counsel Mont with full legal review of every clause. Voss respects competent commercial counterparties and will charge less to negotiators who clearly understand chemical commodity markets. Maintain payment punctuality; Port Sulphur's accounts receivable office will impose penalty charges on overdue balances and will collect them. Avoid moralizing about labor conditions during negotiations; Voss will document the moralizing, share it with her workers, and use the resulting reputational discomfort to extract additional concessions in subsequent rounds.",
  },

  "verdana_sol": {
    name: "Sister Verdana Sol",
    title: "Harvest Mother of New Eden",
    affiliation: "new-eden",
    clearanceLevel: "GAMMA-AID — ALLIED COMMUNE",
    physicalDescription: "Female, 46. Slight, sun-darkened, with calloused hands and the slow steady gait of someone who walks fields daily. Hair: brown, sun-streaked, kept simply pinned back. Wears practical work clothing in undyed natural fibers — homespun rather than salvaged, a deliberate choice. A pendant of carved seed-pods around her neck, the commune's symbol. Eyes: hazel, with the focused attention of a person who has spent years watching small things grow. Speaks softly but distinctly. Has the unsettling habit of pausing in conversation to listen to wind or to check the position of the sun, as though her actual addressees are not in the room.",
    background: "Sol was a soil scientist before the commune — fully credentialed, employed in a Pacifican agricultural research institute, on track for a senior research appointment. She left academic life at thirty-one after the publication of a paper that documented the systematic falsification of safety data in Aurean agricultural chemicals. The Dominion sued her. The Pacifican government did not defend her. She emerged from the litigation broke, professionally damaged, and convinced that institutional agriculture had become structurally incapable of feeding the people it claimed to serve. She founded New Eden with eleven other refugees from the agricultural sciences, on land the megacity had written off as ecologically dead. The commune now has 1,200 members and produces more food per hectare than any other operation in its irradiation zone.",
    psychProfile: "Sol is gentle in manner and immovable in conviction. She believes that real food, grown in real soil, by people who understand both, is the only sustainable basis for human community. The conviction is not romantic — she has the technical credentials to defend it on yield-per-hectare grounds — but it is religious in its intensity. She does not proselytize, but she does not compromise. The commune accepts aid that does not violate its principles and refuses aid that does. Money is generally accepted. Synthetic fertilizers are not. The distinction is not negotiable, and counterparties who attempt to negotiate it discover that Sol's gentle manner conceals a settled willingness to refuse food shipments her people genuinely need.",
    knownAssociates: [
      "Brother Tariq Beresford — Sol's deputy, manages the commune's external trade relationships",
      "Sister Maud Holvorsen — chief seed librarian, custodian of the commune's heritage seed bank, possibly the only person in the regional system who can identify pre-war cultivars by sight",
      "The Council of Furrows — eleven founding members, including Sol, formally co-equal but practically deferential to her on doctrinal matters",
    ],
    tacticalAssessment: "New Eden's military significance is essentially zero. Its political significance is moderate and growing. The commune's success at producing real food in irradiated soil has made it a symbolic counterexample to the Aurean argument that synthetic agriculture is the only viable path. This symbolic role gives it influence beyond its size — Pacifican parliamentarians cite it, Verdant Enclave druids respect it, and Aurean lobbyists work quietly to undermine it. Megacity support for New Eden is therefore a foreign-policy signal as much as a humanitarian gesture, and it is interpreted accordingly by every party paying attention.",
    interceptedQuotes: [
      "We do not refuse your aid because we are ungrateful. We refuse what would violate the soil because the soil cannot refuse for itself, and we agreed long ago to refuse on its behalf.",
      "A child tasted real bread today. She did not have words for what she was tasting. Neither do I, anymore. That is what we are here to defend.",
      "The Dominion sued me for telling the truth. The court ruled the truth was bad for business. The court was correct. The truth has been bad for their business ever since.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Send aid in forms acceptable to the commune's principles — heritage seed varieties, organic-certified soil amendments, manual agricultural tools, medical supplies for non-augmented humans. Avoid synthetic fertilizers, gene-modified seedstock, and any aid package containing Aurean-sourced inputs; both will be returned and the relationship will cool. Public diplomacy that recognizes the commune's symbolic importance plays well with Pacifican audiences and incurs minimal cost. Bishop Sol's personal correspondence is read; lengthy letters are appreciated and answered.",
  },

  "scrap_king_renzo": {
    name: "Scrap King Renzo",
    title: "King of the Heap, Scrapyard City",
    affiliation: "scrapyard-city",
    clearanceLevel: "GAMMA-COMMERCE — NEUTRAL SETTLEMENT",
    physicalDescription: "Male, 48. Barrel-chested, broken-nosed, with hands that have rummaged in industrial debris for thirty years and look it. Wears a patchwork coat assembled from salvaged uniform pieces — Authority jacket, eastern recovery high-visibility sash, Pacifican navy cuffs, a single Aurean lapel pin worn with deliberate irony. A homemade crown of welded scrap that he puts on for negotiations and removes for actual work. Heavy gold tooth, allegedly genuine. Carries a personal sidearm and a multi-tool, both of which see roughly equal use. Speaks loudly. Laughs more loudly. Listens, in the moments between, with disconcerting precision.",
    background: "Renzo emerged from Scrapyard City's organic chaos through a combination of physical fearlessness, transactional cleverness, and a willingness to broker peace between feuding salvage clans that nobody else had attempted. He was crowned, half-sarcastically, by the gathered crew bosses sixteen years ago. The crown stuck. The 'King' title is functionally a chairmanship rather than a monarchy — Renzo presides over a council of crew bosses and resolves disputes that would otherwise become open turf wars. The position has no formal succession plan, no written constitution, and no enforcement mechanism beyond Renzo's personal credibility. It has nevertheless held for sixteen years.",
    psychProfile: "Renzo's persona is theatrical and his judgment is shrewd. He plays the wasteland crime lord because it is what counterparties expect and because the performance lets him conceal a strategic mind behind a shtick. He cares about Scrapyard City — not romantically, but the way a competent boss cares about a profitable operation he has invested years in. He resists outside authority not from ideological commitment but because outside authority would interfere with the carefully balanced criminal economy he has built. His weakness is sentimentality about specific salvaged objects — pre-war machinery, intact crates, working electronics — which has occasionally led him to make sub-optimal trade decisions in pursuit of items he wanted personally.",
    knownAssociates: [
      "Chief Auctioneer Veska Drei — runs the central market, the actual locus of Scrapyard City's economy",
      "Boss Garruk Tanev — leads the Heap's largest salvage crew, traditional rival, currently aligned with Renzo through marriage of subordinates",
      "The Crew Council — seven crew bosses, formal advisory body, the people Renzo has to keep happy or be deposed",
    ],
    tacticalAssessment: "Scrapyard City is the regional system's largest single source of recoverable industrial salvage. The settlement's exports reduce the megacity's raw material costs by approximately 12% across multiple sectors. Direct annexation has been studied and rejected three times — the chaotic governance structure makes occupation unmanageable, and Scrapyard residents have demonstrated cohesive resistance whenever outside forces have attempted to impose order. The optimal posture is transactional: licensed buying through Auctioneer Drei, occasional aid for genuine humanitarian crises, and tolerance of the settlement's quasi-criminal interior politics.",
    interceptedQuotes: [
      "You want to buy salvage? I sell salvage. You want to negotiate the price? Of course you do. Sit down. I have three counter-offers and a chair that probably has bedbugs.",
      "Your previous Commander tried to send 'reform' inspectors. Twelve thousand scavengers met them at the gate. The inspectors filed reports recommending we be left alone. Smart inspectors.",
      "I am not a king. I am the guy who keeps seven crew bosses from killing each other. The crown is for tourists.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Conduct routine salvage purchasing through Chief Auctioneer Drei using standardized Authority procurement procedures Drei has helped design. Reserve Renzo's personal attention for matters that affect the Crew Council balance — annexation rumors, large competitor purchases, regional security incidents. Send occasional gifts of pre-war machinery in good condition; the gifts cost little and disproportionately strengthen the relationship. Do not attempt to impose megacity legal frameworks on Scrapyard interior commerce; the response would be unified resistance from a settlement that is otherwise comfortable being individually exploited.",
  },

  "ash_volkov": {
    name: "Commander Ash Volkov",
    title: "Warlord of Blackridge",
    affiliation: "blackridge",
    clearanceLevel: "OMEGA-RED — HOSTILE TOWNSHIP",
    physicalDescription: "Male, 39. Hard-built, scar-marked along the left side of jaw and neck from shrapnel injury during the Sector 9 incident. Wears full combat gear at all times, including during diplomatic meetings — armored vest, sidearm, combat knife, military boots. Hair: dark, kept short. Eyes: grey, restless, scanning. Has not been observed unarmed in any verified intelligence imagery. Carries a sidearm of pre-war design and eastern works manufacture, a combination that suggests his procurement chain is more diverse than Blackridge's official anti-foreign rhetoric would suggest. Speaks rapidly, in clipped sentences, in the cadence of someone who learned to communicate over military radio.",
    background: "Volkov was a megacity Authority sergeant, ten years served, before the Sector 9 incident — a botched containment operation in which his platoon was abandoned by command and fifteen of his colleagues died. The official inquiry exonerated the chain of command. Volkov resigned, took twenty surviving veterans with him, and walked into the eastern wastes. Blackridge had been a small farming township; within four years of Volkov's arrival, it was a fortified outpost with a 4,500-strong militia and a stated doctrine of armed independence from megacity authority. The original townspeople form a minority of the current population, having been reorganized into a labor and support cadre under Volkov's military structure.",
    psychProfile: "Volkov is psychologically formed by the Sector 9 betrayal. His hostility to the megacity is not strategic posturing — it is genuine, personal, and unlikely to be moderated by negotiation. He is paranoid in the technical sense: his threat assessments are systematically biased toward worst-case interpretations, and he acts on those assessments. Within Blackridge, he is competent and reasonably fair; he distributes resources, maintains discipline, and has not abused his subordinates beyond the levels normal for militant frontier governance. His weakness is the brittleness of his coalition: Blackridge's older citizens did not vote for militarization and would tolerate de-escalation if Volkov's authority were ever to weaken.",
    knownAssociates: [
      "Lieutenant Sasha Pell — Volkov's second, fellow Sector 9 survivor, ideologically committed to Blackridge's independence doctrine",
      "Master Sergeant Holst Vormak — handles training and discipline, the only senior officer who pushes back on Volkov's threat assessments",
      "Mayor Tilda Renn — pre-Volkov civilian leader of the original township, now in formal opposition, retains influence among the older population",
    ],
    tacticalAssessment: "Blackridge poses a localized military threat — the militia is competent, well-equipped (through unspecified procurement), and operating from prepared defensive positions. Direct confrontation would be costly and would unify the township behind Volkov in a way that current internal politics do not. The strategic objective is not military victory but political erosion: support Mayor Renn's opposition where possible, maintain economic pressure that demonstrates the costs of independence, and wait for Volkov's coalition to weaken or for Volkov himself to overreach. Active hostilities should be avoided unless Blackridge initiates them, in which case proportional response is acceptable.",
    interceptedQuotes: [
      "Sector 9. Fifteen names. I memorize them every morning. I have not forgotten which administration's signatures were on the operational orders.",
      "The megacity wants to negotiate. I am open to negotiations. The terms are written on the wall outside Sector 9 in the names of fifteen dead soldiers. Send a Commander who can read.",
      "Blackridge does not raid your supply lines. Blackridge does not threaten your civilians. Blackridge defends what is Blackridge's. We will continue to do exactly that.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Maintain defensive posture along the Blackridge frontier; avoid provocative patrols that Volkov can interpret as preparation for a Sector 9 repetition. Channel back-channel communication through Mayor Renn's faction when possible; her people retain civilian authority over economic matters and prefer normalization. A formal Sector 9 inquiry reopening with declassified operational records would have meaningful diplomatic value; intelligence has assessed this option three times and recommended it three times. The recommendation has not been actioned.",
  },

  "silas_wayward": {
    name: "Keeper Silas Wayward",
    title: "Station Master of Pilgrim Station",
    affiliation: "pilgrim-station",
    clearanceLevel: "DELTA-NEUTRAL — PROTECTED WAYSTATION",
    physicalDescription: "Male, 64. Tall, lean, white-haired, with the upright posture of an old caravan rider. Wears a long traveler's coat in the dust-grey worn by Station personnel — the same uniform as his porters and his cooks, an intentional egalitarianism. A weathered hat, removed inside, retained outdoors. A walking stick of dark hardwood, used as much for emphasis in conversation as for support. Eyes: pale blue, clear, with the calm of a man who has heard every plausible argument and most of the implausible ones. Speaks with a soft cadence and a mild caravan-country accent that is broadly recognized across the wasteland.",
    background: "Wayward inherited the Stationmastership from his teacher, the previous Keeper, twenty-two years ago. The Station's neutrality doctrine — that Pilgrim is open to all, sells protection to none, and informs on no one — predates his tenure by three generations and is older than every current regional government. Wayward has maintained it through eleven major regional conflicts, three attempted occupations (all repelled by the unified anger of every faction whose travelers used the Station), and one eastern corridor closure that ended when the Dominion confirmed its own need for the Station's continued operation. The Station has hosted private negotiations between every major regional power. The contents of those negotiations remain unrecorded.",
    psychProfile: "Wayward is patient by training, fair by conviction, and shrewd by long necessity. He maintains the Station's neutrality not through naive idealism but through a sophisticated understanding of why all parties benefit from a credible neutral ground. He treats every guest with equal courtesy, refuses to speculate about other guests' business, and has never been known to violate confidentiality. The discipline is institutional and ancestral; Wayward considers himself a custodian of an arrangement older than any current state, and he intends to pass it intact to his successor. He is uncomfortable with personal recognition and consistently deflects credit to the Station as an institution.",
    knownAssociates: [
      "Apprentice-Keeper Rina Fellow — Wayward's chosen successor, currently in her twelfth year of training",
      "Quartermaster Beren Holm — runs supplies, maintains the Station's operating budget through traveler tariffs",
      "Captain of the Watch, Imani Voss — commands the Station's defensive guard, sworn personally to neutrality protocols",
    ],
    tacticalAssessment: "Pilgrim Station's value is structural rather than material. As a credible neutral meeting ground, it enables diplomatic negotiations that would otherwise require costly venue arrangements and security guarantees. The megacity has used the Station for back-channel discussions with eastern recovery operations three times in the past eight years, and on each occasion the Station's neutrality was honored without incident. The cost of supporting the Station is minimal — occasional traveler tariffs, respect for its protocols, and willingness to defend its independence if attacked — and the strategic benefit is disproportionate.",
    interceptedQuotes: [
      "Pilgrim Station is older than your city, Commander. It will be here when your city is something other than what it is now. We measure success in centuries.",
      "I do not take sides. I do not carry messages. I do not remember names. These are the rules. They are why you came here.",
      "The Khan's envoy is in the south wing. The Pacifican delegation is in the north. The kitchens are in the middle. We have never had a fight over kitchen access. Take the meaning as you wish.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Use the Station as the preferred venue for sensitive regional diplomacy. Pay traveler tariffs promptly and at standard rates; attempts to negotiate diplomatic discounts will be politely declined and quietly noted. Defend the Station's independence in any forum where it is challenged — the cost is trivial, the reputational benefit substantial. Honor confidentiality protocols absolutely; any megacity official caught attempting to extract information about other guests would result in the Station withdrawing access from the megacity entirely, an outcome that would cost more than any conceivable intelligence gain.",
  },

  "grol_the_changed": {
    name: "Chieftain Grol the Changed",
    title: "Voice of the Mire, Mireholm",
    affiliation: "mireholm",
    clearanceLevel: "GAMMA-MUTANT — MARGINALIZED COMMUNITY",
    physicalDescription: "Genetic male, biological age 43, expressed age difficult to estimate due to extensive mutation. Skin: thickened, lightly scaled across forearms and shoulders, an adaptation to the swamp environment that the medical board has classified as 'compatible with prolonged exposure to organomercury compounds.' Eyes: enlarged irises, low-light enhanced, an inheritance from his mother. Six functional fingers per hand, the additional digits smaller and partially webbed. Stands 1.78m. Wears practical swamp gear — waterproof boots, treated leather coat, a wide-brimmed hat against the constant chemical drizzle. Voice: deep, slightly distorted by an enlarged larynx. Speaks with deliberate clarity to compensate.",
    background: "Grol was born in the swamp townships east of the megacity to a community of mutant refugees displaced from the city's industrial districts during the Cleansing decades. He grew up in conditions the city's official records classified as 'unsurvivable' — and is therefore, by official metrics, statistically impossible. He has nevertheless survived to adulthood, raised three children, and consolidated Mireholm's six rival mutant clans into a single political entity through eight years of patient and occasionally violent diplomacy. He is the first Voice of the Mire in the settlement's history. Whether the position will outlast him is uncertain.",
    psychProfile: "Grol is proud, cautious, and exhausted. The pride is the protective adaptation of a community whose dignity has been continuously assaulted by larger powers; he asserts it deliberately because his people need to see him assert it. The caution is the lesson of repeated betrayals — every prior promise of medical aid from the megacity has been smaller, slower, or more conditional than promised. The exhaustion is the cumulative weight of being chronically responsible for six thousand people whose needs exceed Mireholm's resources by an order of magnitude. He is honest in negotiations to a degree that disadvantages him; he does not have the energy for performative bargaining.",
    knownAssociates: [
      "Healer-Mother Vesna — Mireholm's chief medical officer, trained by apprenticeship, performs surgery without anesthetic at rates above pre-war hospital standards",
      "Speaker Kaden of Clan Three — Grol's closest political ally among the original clan leaders",
      "The Council of Voices — six clan representatives, advisory body, consensus-driven, slow to commit but binding when committed",
    ],
    tacticalAssessment: "Mireholm offers the megacity an opportunity to redress historical injustice at low strategic cost. The settlement has no military significance, no mineral wealth, and no political leverage outside its own districts. It does have a workforce willing to perform labor the megacity's citizens refuse, and a population whose suffering is documented and morally indefensible. Aid investment would build genuine alliance, would influence Mother Scoria's Changed faction within the megacity itself, and would have measurable diplomatic effects on Pacifican observers who track regional human rights performance.",
    interceptedQuotes: [
      "We are not symbols, Commander. We are six thousand people. Your previous Council called us symbols when they wanted to refuse medicine and people when they wanted to refuse recognition. Pick which one we are and stay with it.",
      "Medicine. Real medicine. Not studies. Not symbolic shipments. Antibiotics, anti-radiation compounds, the things our children die without. That is the conversation. Everything else is delay.",
      "Your previous administration's death squads killed forty-three of my people in a single night. I am told the records have been sealed. I have the names. The Mire remembers.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Send substantial, regular medical shipments through Healer-Mother Vesna with no political conditions attached. Aid effectiveness is dramatically higher when it arrives in the forms Mireholm has specifically requested rather than the forms the megacity finds politically convenient. Consider formal recognition of the settlement's territorial claims within its current boundaries; the gesture is procedurally simple and emotionally significant. Avoid public statements that frame the relationship as charity; Grol's coalition cannot afford the dignity cost and will react more coldly than the substantive aid would otherwise warrant.",
  },

  "delia_crypt": {
    name: "Overseer Delia Crypt",
    title: "Vault Guardian of Vault Town",
    affiliation: "vault-town",
    clearanceLevel: "OMEGA-VAULT — UNCONFIRMED PRE-WAR ASSETS",
    physicalDescription: "Female, 47. Pale, thin, with the carriage of someone who has spent most of her adult life in artificially-lit underground spaces. Hair: black, kept short for practical reasons — Vault corridors do not accommodate ceremony. Wears the Vault's standard custodial uniform: dark grey jumpsuit with subtle reflective trim, a tool belt, and a security badge whose authority predates the megacity's formal sovereignty over the region. Eyes: grey-blue, deeply observant. A small scar on her left temple from a containment incident during her Apprentice Custodian years. Speaks with measured precision and rarely answers questions she has not first decided to answer.",
    background: "Crypt is the fourth Overseer of Vault Town in the township's documented history. She was born in the Vault — her parents were Custodians, her grandparents were Custodians, and her family has held senior security roles since the Vault's discovery sixty years ago. She inherited the Overseer position through formal succession protocols at thirty-six following her predecessor's retirement. The Vault itself remains formally sealed; Crypt's authority extends to the surface township and to the upper containment levels, but the pre-war bunker's deep sections have not been opened by current personnel. What is in the deep sections is a question Crypt declines to discuss, declines to speculate about, and reportedly declines to research.",
    psychProfile: "Crypt is an institutionalist in a way that resembles religious vocation. She believes that the Vault's seal is a sacred trust extended across generations — that her job is not to investigate the Vault but to ensure that no one else does either. The framework gives her unusual psychological stability: she has clear duties, defined boundaries, and no ambiguity about what success looks like. Her secrecy is therefore not deception but conviction; she is not concealing facts she knows so much as defending the principle that certain facts should not be sought. She is, paradoxically, very honest within the narrow domain of what she will discuss.",
    knownAssociates: [
      "Senior Custodian Halvor Drevich — Crypt's deputy, manages day-to-day Vault security, longest-serving subordinate",
      "Surface Mayor Renia Kal — handles the township's external relations, formally subordinate to Crypt but practically autonomous on civilian matters",
      "The Custodian Corps — approximately forty trained personnel, all from inherited Vault families, organizationally insulated from external recruitment",
    ],
    tacticalAssessment: "Vault Town's strategic significance depends entirely on what is actually in the Vault, which is unknown. If the contents are pre-war military assets of the kind rumored — orbital weapons control systems, biological weapons stockpiles, automated defense networks — the Vault is one of the most strategically important sites in the regional system. If the contents are administrative records, depleted archives, or empty rooms, the township is a quaint historical curiosity. Multiple intelligence assessments have failed to resolve the question. The optimal posture is respectful coexistence: do not pressure Vault Town to open the seal, do not attempt covert entry, and maintain trade relationships that demonstrate the megacity values the township for its surface community rather than its rumored deep secrets.",
    interceptedQuotes: [
      "I cannot tell you what is below Level 5. I will not tell you what is below Level 5. The fact that I cannot and will not is, I hope, mutually clarifying.",
      "Your previous administration sent three covert teams. The teams did not return. The Vault's defenses were not modified to produce that outcome — they were designed to produce that outcome by people whose names are no longer in any record. I caution you against a fourth attempt.",
      "Trade with us as a township. Speak to Mayor Kal about civilian matters. Bring your questions about the Vault to me only if you are prepared to receive answers you will not enjoy.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Engage Vault Town as an ordinary township for ordinary township purposes. Conduct trade through Mayor Kal's office on standard terms. Reserve direct contact with Crypt for matters genuinely involving the Vault's surface security, and accept her refusals to engage on deeper questions without further pressing. Do not authorize covert intelligence operations against the Vault's deep sections; the historical failure rate is total, and successful entry could trigger automated systems whose effects are not modeled in any current scenario.",
  },

  "ignis_thorne": {
    name: "Magister Ignis Thorne",
    title: "Flame Warden of Ember Falls",
    affiliation: "ember-falls",
    clearanceLevel: "GAMMA-GEO — SCIENTIFIC TOWNSHIP",
    physicalDescription: "Genetic male, 51. Medium build, with the deliberate movements of someone trained in laboratory protocols. Skin: heat-tanned across face and forearms from years of vent-side work. Hair: dark, short, with grey at the temples. Wears a modified geological survey uniform — heat-resistant fabric in muted earth tones, a respirator clipped to his belt, a tool harness with sample vials and instruments rather than weapons. Eyes: brown, steady. A pair of pre-war reading glasses, prescription, that he wears for fine work and removes for diplomatic conversations as a small courtesy. Speaks with the cadence of a lecturer who has learned to pause for questions.",
    background: "Thorne was a vulcanological researcher in the Pacifican university system before the funding cuts of the last decade. He relocated to Ember Falls eighteen years ago, initially as a visiting consultant on the geothermal vent system, and accepted the Magister position twelve years ago after the previous Warden's retirement made it available. Under his administration, Ember Falls has tripled its geothermal output, established formal monitoring protocols for vent stability, and survived two major eruption events with zero civilian casualties — outcomes that previous administrations had not achieved. He is the first Flame Warden in the township's history with a credentialed scientific background, and the change shows.",
    psychProfile: "Thorne is methodical, evidence-driven, and quietly ambitious for the township rather than for himself. He approaches geothermal management as both a technical problem and a moral responsibility — the seven thousand citizens of Ember Falls depend on his judgment about vent stability, and he carries that weight visibly. He is collegial in negotiations, treating counterparties as fellow professionals until evidence forces him to revise. He is not naive about regional politics, but he is interested primarily in outcomes that benefit the township and is willing to work with any party that offers acceptable terms regardless of broader political alignment.",
    knownAssociates: [
      "Senior Engineer Kiera Lumis — runs the township's primary geothermal plant, Thorne's principal technical advisor",
      "Safety Officer Petr Holveg — manages vent monitoring and emergency protocols, has authority to override commercial operations during instability events",
      "Trade Director Annelise Vren — handles external sales of geothermal cells and mineral exports, the township's de facto trade minister",
    ],
    tacticalAssessment: "Ember Falls is a useful trading partner with growing strategic significance. Its geothermal cell exports are increasingly important to the megacity's industrial sector as alternatives to combustion-based power become more attractive on cost and reliability grounds. The township is not aligned with any major regional power and is not seeking such alignment; its preferred posture is professional neutrality. Joint research projects on geothermal monitoring and clean energy production have proceeded successfully for several years, and the relationship is uncomplicated and mutually beneficial.",
    interceptedQuotes: [
      "Vent 7 vented this morning. We monitored. We rerouted civilian traffic. No casualties. This is what good administration looks like — boring, predictable, and successful.",
      "The Khan once offered to buy our geothermal output entirely, at premium rates, for exclusive supply to his industrial centers. I declined. Concentrating customer risk is not a sound business strategy regardless of who is offering the price.",
      "Your engineers helped us stabilize Vent 12. Three thousand people in the lower districts are alive because the megacity sent the right specialists at the right time. The township remembers the practical things.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Maintain ongoing trade relationships through Trade Director Vren with standard commercial terms. Continue joint research collaboration on vent stability and geothermal extraction technologies; the work has produced genuine technical advances and substantial goodwill. Honor any safety-related operational restrictions Safety Officer Holveg imposes; the township's risk management is technically sound and overrides commercial considerations during instability events. Thorne's personal correspondence is respectful and substantive; investing in the relationship has paid disproportionate dividends and is recommended to continue.",
  },

  "ilse_vargasz": {
    name: "Marshal Ilse Vargasz",
    title: "Chief Executive Armorer, Vulcan Arms Consortium",
    affiliation: "vulcan-arms-consortium",
    clearanceLevel: "DELTA-FOUNDRY — INDUSTRIAL SOVEREIGN",
    physicalDescription: "Female, 58. 1.74m, broad-shouldered, the build of someone who has spent decades on a shop floor and never quite left it. Hands scarred from press work; a small burn-mark across the back of the left wrist from a 2238 shell-line incident she refuses to let the medics revise. Hair: iron-grey, cropped short, kept short for safety reasons that became personal style. Wears Consortium coveralls — clean, pressed, but unmistakably coveralls — to every meeting including board sessions and diplomatic functions. Eyes: pale grey, level. Speaks at conversational volume regardless of the room.",
    background: "Vargasz was born into the Consortium. Her grandfather worked the original shell-press lines under the founding charter; her mother ran quality control on the artillery foundry through three regime changes. She enlisted with the Consortium's apprenticeship program at fifteen and worked every station on the small-arms line before she was twenty-two. She moved into operations management at twenty-eight, took the Consortium chair at thirty-two after the previous board was forced out by a no-bid contracting scandal, and has held the position for twenty-six years. Her appointment was viewed at the time as a placeholder — a foundry-floor figurehead while the real successor was groomed. The grooming did not survive her first quarterly review.",
    psychProfile: "Vargasz is unsentimental, transactional, and resistant to flattery in a way that unnerves negotiators trained to expect ego. She does not view munitions sales as a moral question; she views them as a contractual one, and treats every contract as personally owed. Her core principle is institutional: the Consortium ships what it signs, on time, at quality, regardless of buyer. She does not extend credit, accept gifts, or sign exclusivity clauses. She is loyal to the lines, the workers, and the ledger — in that order. She does not pretend to like her customers and does not require that they like her. Her one documented soft spot is for retiring foundry workers, whose pensions she has personally lobbied for in every settlement she has ever entered.",
    knownAssociates: [
      "Floor Foreman Henrik Brask — runs the artillery foundry, has refused promotion four times",
      "Consortium Counsel Maja Iversen — chief contracts officer, drafts every procurement clause Vargasz signs",
      "Logistics Marshal Petro Vega — runs convoy security and dock operations, reports directly to Vargasz",
    ],
    tacticalAssessment: "The Vulcan Arms Consortium is the most reliable munitions supplier in the post-war supply chain — and the most expensive. Vargasz's pricing reflects her costs honestly, which is the most threatening thing about her: she cannot be undercut without sacrificing the Consortium's reputation for reliability, and she will not sacrifice that reputation for any single contract. The Consortium's strategic weight derives from this discipline; treaties and campaigns have been delayed because Vargasz was unwilling to ship product that had not passed her line inspectors. She will not sell to the highest bidder if the highest bidder cannot pay on time. She will not sell at a discount if the line is running at capacity. She will sell to anyone who follows the contract — including parties the Authority would prefer she did not.",
    interceptedQuotes: [
      "We do not sell hope. We sell what hope runs out of.",
      "The Commander asked for credit terms. I asked the Commander when the credit terms had ever benefited a foundry.",
      "Korr's people audited our shipping manifests last quarter. They found nothing. They will find nothing again next quarter. The Consortium runs clean books because clean books are cheaper than dirty ones.",
      "I have shipped to three regimes that hated each other. Each one paid on time. Each one received product that worked. That is the entire business.",
      "The line foreman called me at 0300 about a tolerance issue. I drove out. We held shipment for a day. The customer was furious. The customer was also alive a month later because the rounds did not fail in the chamber. He still buys from us.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Treat Vargasz as a professional supplier, not a political ally. Pay on time, sign clean contracts, do not request favors. The Consortium's reputation for reliability is its primary asset; protecting that reputation is more important to her than any single deal. Cancellation penalties are non-negotiable; do not sign contracts the Commander cannot complete. Respect for foundry workers — including small acknowledgements during plant visits — produces disproportionate goodwill. Attempts to leverage personal relationships, offer gifts, or extract preferential pricing will be received as insults and remembered as such for as long as Vargasz holds the chair.",
  },

  "iron-pontifex-caelum-vox-vii": {
    name: "Iron Pontifex Caelum-Vox VII",
    title: "Custodian of the Grafted Throne, Reliquary See",
    affiliation: "reliquary-see",
    clearanceLevel: "GAMMA-RELIQUARY — THEOCRATIC SOVEREIGN",
    physicalDescription: "Apparent age indeterminate; chronological age 34. Standing height 1.79m on the current pelvic frame, variable ±4cm depending on which legs are installed. Audit logs from the Cathedral-Clinic certify the body as 11% original tissue: native skull (partial), spine (segmented and reinforced), portions of the digestive tract, and the optic nerves. The remainder is a curated assembly of canonised augments inherited across six predecessors — visible on inspection as fine seams of polished steel and ceramic where flesh meets relic. Wears surgical-vestment robes in the See's bone-white and oxidised-copper liveries, with the Riveted Bone circlet hand-bolted into four anchor points along the parietal ridge. Voice is two octaves: a native baritone over a synthesised harmonic produced by the inherited larynx of Caelum-Vox the Fourth.",
    background: "Selected as heir at age four from a shortlist of children born within the Cathedral-Clinic's catchment, on the basis of skeletal compatibility with the existing relic inventory. Underwent the first canonised graft (a left index finger originally belonging to Anselm Vox) at age five. Accumulated a further forty-seven sanctifying surgeries before the age of majority, conducted under the supervision of the Conclave of Riveted Bone. Crowned Iron Pontifex on the death of Caelum-Vox VI from sepsis (predecessor was thereafter recovered, sterilised, and partially re-installed within six months). Has ruled for eleven years. Speaks four languages, three of them inherited as muscle memory from the laryngeal augments of previous Pontifexes. Has never left Sector 14. Has reportedly never wept; the relevant tear ducts belonged to a predecessor who could.",
    psychProfile: "Clinical assessment is complicated by the fact that the subject's nervous system is itself a composite. Demonstrates the regal composure trained into every Pontifex from infancy, layered over a surgical pragmatism inherited from the See's founding doctrine. Does not appear to fear death; views it as an inventory event. Decision-making is slow, ritualised, and almost entirely deferred to the Conclave for non-doctrinal matters — but on questions of canonisation the Pontifex is unilateral and unappealable. The most useful analytic finding: Caelum-Vox VII does not consider herself an individual. She refers to herself in the first-person plural in formal settings and the first-person singular only when discussing the original 11%. Attempts to flatter her personally have failed. Attempts to flatter the relics have, on two occasions, secured concessions.",
    knownAssociates: [
      "First Sanctifier-Surgeon Halvar Mons — chief of the Cathedral-Clinic's operating theatres, performs every Pontifical graft personally",
      "Vault-Custodian Iolanthe Reche — keeper of the Reliquary's eleven catalogued vaults, the only person besides the Pontifex permitted in the deepest one",
      "Conclave Speaker Brother Veris of the Riveted Bone — runs the See's lay administration, handles every correspondence the Pontifex does not personally sign",
      "Heir Designate Caelum-Vox VIII (age nine) — currently undergoing the third year of canonised grafts, presented at every public procession",
    ],
    tacticalAssessment: "The Reliquary See commands roughly 1,400 sworn Communicants and an outer circle of perhaps 9,000 lay devotees concentrated in Sector 14, with shrine-clinic outposts wherever the official medical system has retreated. Their material force is modest — surgical staff, processional guards, recovery teams — but their leverage is asymmetric: they hold canonisation rights on a documented inventory of augments installed in citizens across every other faction, including several within the Authority and the Corporate Board. The Pontifex's hereditary legitimacy is unusually robust because it is literally surgical; removing her would not interrupt the See so much as accelerate the next graft. Direct violence against the Cathedral-Clinic is inadvisable; the Conclave has standing instructions to publish the recovery list — the names and locations of every Communicant whose augments are pre-pledged — within the hour of any attack.",
    interceptedQuotes: [
      "The Commander mistakes us for a person. We are an inventory. The flesh you are speaking to is the most recent shelf.",
      "Bring the relic forward. We will canonise the limb. We will not canonise the man; the man is provisional, and frankly disappointing.",
      "Authority Officer Halden's left hand is on our recovery list. He signed the paperwork. We assume he has informed his wife. We assume incorrectly, perhaps, but the paperwork is not incorrect.",
      "Our predecessor wept once, late in life, for reasons the surgeons could not explain. The tear ducts have since been transferred. We have not yet found the reason.",
      "The Iron Circuit speaks of uploading consciousness into machines. We have spent eleven generations downloading consciousness into our spine. Our method works. Theirs is forecast.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Engage through the Conclave Speaker rather than the Pontifex personally; protocol violations are remembered for the lifespan of the relic, not the lifespan of the Pontifex. Address the institution, never the individual; first-person-plural correspondence is received as basic literacy. Donations of recovered prosthetics from wasteland scavenger operations purchase substantial goodwill and are catalogued in the See's public ledger. Do not order the seizure of registered Communicants for criminal proceedings without first negotiating recovery rights to their augments — the See will pursue the limbs through any successor administration regardless of treaty status. Avoid theological argument; the Pontifex has inherited every counter-argument from six predecessors and will run out of patience long before she runs out of citations.",
  },

  "el_caiman_quintero": {
    name: "Judge-Cardinal Rafael 'El Caimán' Quintero-Vargas",
    title: "Lord Justicar of the Malecón, Mega-Habana",
    affiliation: "mega-habana",
    clearanceLevel: "DELTA-TRIBUNAL — FOREIGN HEAD OF STATE, BROADCAST PROTOCOL",
    physicalDescription: "Male, 58. 1.84m, the heavy-shouldered build of a man who came up street-fighting in the Cerro hab-blocks before the law caught him and made him a judge. Skin: dark olive, weather-cured by forty Cuban summers on the seawall. Salt-and-pepper beard, kept short for the cameras. A pale scar runs from the left temple to the jawline — earned, by his own televised account, 'from a defendant who disagreed with the verdict, and from whom the verdict was subsequently extracted at greater volume.' Wears the full regalia of the Tribunal Justicial at all times: a black-and-blood-red high-collared judicial cassock fused over riot-armour plate, gold-embroidered Brigada Caimán crocodiles on the lapels, the heavy enamel justice-scale pendant of his office, and a mirrored visor halo worn tilted up except when sentencing. Right hip: a regulation Lawgiver-pattern sidearm, Tribunal-issue, monogrammed 'R.Q-V' in gold leaf. The monogram is for the cameras. The sidearm is not.",
    background: "Born in Cerro Block 14 to a sugar-mill foreman and a barrio nurse, Quintero-Vargas was charged with affray at sixteen, conscripted into the then-fledgling Tribunal Justicial at seventeen as an alternative to twenty-five years of Hurricane Duty, and made Judge by twenty-nine on the strength of a televised verbal demolition of a cartel lieutenant that ran for ninety-four uninterrupted minutes and was later released on cassette. Acquired the nickname 'El Caimán' after sentencing a Brigada Caimán handler to be eaten by his own animal during the 2079 Malecón Riots; the segment is annually rebroadcast on Tribunal Day. Elevated to Cardinal by acclamation of the Tribunal at forty-one, Lord Justicar at fifty. Ratings have not slipped in eight years. The man has never personally fired the Lawgiver on his hip; he does not need to, because the cameras are always on him and everyone knows it.",
    psychProfile: "Performative authoritarian, but with a craftsman's attention to the performance. Quintero-Vargas does not mistake the broadcast for the verdict — he simply understands, more clearly than most heads of state, that in Mega-Habana the broadcast IS the verdict, and writes accordingly. Operates with a showboating bombast tuned for the 8pm slot, but the tactical mind underneath is sober, slow, and cold. Does not drink the Santo Rum he sanctifies — a fact known only to his First Lictor and never aired. Decision-making is bimodal: in tribunal, instantaneous and theatrical; in private, deliberate to the point of indecision, often deferring to the Tía Network's intelligence digests. Genuinely believes in the Tribunal as an institution. Genuinely does not believe in himself. The gap between those two beliefs is the seam every successful negotiation with him has exploited.",
    knownAssociates: [
      "First Lictor Yolanda 'La Sombra' Castaño-Reyes — chief of the Tribunal's enforcement arm and the only person permitted to interrupt the Judge-Cardinal on a live broadcast; reads the verdicts he is too tired to deliver",
      "Producer-General Esteban Marrero — runs the Tribunal Broadcast Authority, decides which barrio sentencings air in primetime, holds an unofficial veto over judicial schedule via the ratings book",
      "Brigada Caimán Handler-Master Ovidio Paz — keeper of the seventeen sworn Tribunal crocodiles, present at every sentencing of severity grade 4 or above; refuses to appear on camera, contractually",
      "Mamá Inés of the Tía Network — unofficial title, real name unknown; aggregates barrio gossip into the daily intelligence digest the Judge-Cardinal reads with his morning café",
      "Archivist-Deacon Tomás Beltrán — keeper of the Pre-War Constitution Reels recovery project; the Judge-Cardinal's only confidant on questions of legal canon",
    ],
    tacticalAssessment: "The Tribunal Justicial fields roughly 12,000 sworn Coastal Cyclone Marshals, a Brigada Caimán of approximately 240 augmented saltwater crocodiles with mounted handlers, a coastal navy of sixty-two gunboats and four salvaged pre-war frigates, and a deniable domestic intelligence apparatus (the Tía Network) of unknown but non-trivial size. Conventional military force is moderate; the asymmetric strength is the broadcast. Mega-Habana's Tribunal Hour is the single most-watched live broadcast on the wasteland circuit, and Quintero-Vargas has used it to declare honorary citizenship, war, marriage, and bankruptcy on neighbouring polities — all of which the audience has subsequently treated as binding. Direct military confrontation is unwise: the malecón is fortified, the canals are crocodile-patrolled, and any failed assault becomes a six-week television event. The Judge-Cardinal's principal vulnerability is the ratings book; a broadcast he cannot answer wounds him more than a battle he cannot win.",
    interceptedQuotes: [
      "We do not enforce the law in Mega-Habana, Commander. We perform it. The distinction matters. Performances can be improved between seasons. Enforcement is a pension scheme.",
      "I have sentenced three of my own Cardinals on this very show. The audience voted; the audience was correct. Tonight's defendant should consider that, and so, frankly, should you.",
      "The Brigada Caimán has not been fed since Tuesday. This is not a metaphor. There is a feeding schedule. It is on the wall behind me. The audience can see it.",
      "Yes, I know what you call us — 'the rum theocracy.' Charming. Note that you have purchased nine hundred barrels this fiscal year. We export charm at a healthy margin.",
      "The Pre-War Constitution mentions Cuba in three footnotes and one annex. We are recovering the annex. When we have it, we will quote it at length, on this network, with sponsors.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Engage on-camera whenever possible — the Judge-Cardinal performs better than he negotiates, and a public concession from him is more durable than a private one. Bring a gift in sugar, ethanol, or salvaged pre-war legal documents; the last category buys disproportionate goodwill via Archivist-Deacon Beltrán. Do not interrupt a Tribunal segment for diplomatic traffic; the Producer-General will read the interruption as a power move and price it accordingly. Avoid mocking the Brigada Caimán in correspondence — the handlers read every cable, and the crocodiles, while obviously not literate, are nevertheless on the official cc list as a standing dignitary joke that has somehow become protocol. The route to lasting partnership runs through the First Lictor, not the Judge-Cardinal personally; she handles the post-broadcast ratification and remembers everything.",
  },

  "char-warden-ember-kos": {
    name: "Char Warden Ember Kos",
    title: "Keeper of the Living Fire",
    affiliation: "burnside",
    clearanceLevel: "GAMMA-HAZARD — NEUTRAL TOWNSHIP, SUBSURFACE FIRE ZONE",
    physicalDescription: "Female, 44. Compact and soot-cured, with the permanent squint of a person who has spent her life reading smoke. Skin: weathered the colour of fired clay, with a healed burn scar climbing the right forearm from a vent collapse during her wardenship's first winter. Hair: cropped close and singed at the edges, a practical concession to a town where open flame is ambient weather. Wears layered heat-reflective canvas over scavenged firefighter's plate, a respirator slung at the neck, and a brass thermal gauge on a lanyard that she checks the way other leaders check the time. Smells permanently of sulphur and char; she stopped noticing years ago and assumes everyone else has too.",
    background: "Kos was born in Burnside eight years after the coal seam beneath it caught fire, which is to say she has never known the ground to be cool. Her mother mapped the burn; her father died in it, sealing a vent that would otherwise have taken a residential terrace. She inherited both the maps and the grief, apprenticed as a vent-tender at twelve, and was acclaimed Char Warden at thirty-one after correctly predicting the Shaft-Nine breakthrough her predecessor dismissed. Under her wardenship Burnside has converted catastrophe into industry — the same heat slowly consuming the township now runs its forges, its kilns, and its modest geothermal export trade.",
    psychProfile: "Kos is a fatalist who works extremely hard, a combination her neighbours find either inspiring or exhausting depending on the day. She operates from the settled assumption that Burnside is ultimately doomed — the fire cannot be extinguished, only managed and outrun — and this clarity has burned away every illusion that might otherwise slow her down. Her humour is dry to the point of grim, deployed mostly at funerals and budget meetings. She does not fear threats, having lived her whole life atop a slow-motion disaster, and regards anyone who tries to intimidate her with the weary patience of someone explaining fire to a child.",
    knownAssociates: [
      "Vent-Master Dorr Halloway — Kos's deputy and the township's senior burn-mapper, the only person she trusts to call an evacuation in her absence",
      "Forge-Mistress Sela Quint — runs Burnside's geothermal forges, converting seam-heat into the township's only meaningful export",
      "Old Tamsin — the township's eldest survivor, remembers the seam before it caught and advises Kos on which terraces to abandon next",
    ],
    tacticalAssessment: "Burnside has negligible military value and a population perpetually one ventilation failure from relocation, but its geothermal scavenging expertise and heat-resistant engineering are genuinely rare regional assets. The township is not expansionist; its entire strategic posture is the slow, losing fight against its own foundation. Its leverage in any negotiation is a willingness to walk away from a position it expects to lose anyway — Kos will abandon a terrace, a contract, or an alliance with equal equanimity if the heat-math demands it. The relationship costs little to maintain and yields disproportionate goodwill, because almost no one else bothers to treat Burnside as anything but a curiosity.",
    interceptedQuotes: [
      "The ground's been on fire for thirty years, Commander. I have buried more friends than you have met. Your deadline does not frighten me.",
      "We do not put the fire out. Nobody puts the fire out. We learn its schedule and we live in the gaps. That is the whole of Burnside's philosophy.",
      "Send engineers, not sympathy. Sympathy does not reinforce a vent collar.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Engage Kos with practical aid — vent collars, thermal sensors, heat-resistant alloys, relocation logistics for abandoned terraces — rather than rhetoric or charity, both of which she discounts. She values reliability and gallows honesty; promises she can verify outweigh generous ones she cannot. Route routine trade through Forge-Mistress Quint and reserve direct contact for evacuation-scale decisions. Never frame Burnside's situation as hopeless to her face, not because she disagrees but because she considers despair a luxury that wastes working hours.",
  },

  "colonel-elara-stern": {
    name: "Colonel Elara Stern",
    title: "Garrison Commander",
    affiliation: "fort-stern",
    clearanceLevel: "BETA-FRIENDLY — ALLIED TOWNSHIP, MILITARY PROTOCOL",
    physicalDescription: "Female, 49. Upright, lean, with the unrelaxed posture of an officer who has never fully stood down. Hair: iron-grey, regulation-short, the discipline of it slightly at odds with the absence of any superior to enforce it. A faded service tattoo on the left wrist from a unit that no longer exists; she has never had it removed and never explains it. Wears a maintained pre-collapse field uniform, rank insignia hand-restitched, boots mirror-polished as a daily ritual rather than a vanity. Carries a sidearm she cleans nightly and a clipboard she consults constantly; subordinates report she remembers everything on the clipboard without looking.",
    background: "Stern was a serving officer in the megacity's regional garrison when central command dissolved during the collapse. Where other garrisons mutinied, deserted, or turned to banditry, Stern's simply kept its posts. She assumed command by seniority, declared Fort Stern an independent township under continuing military discipline, and has spent the years since running it as if a relief column might arrive at any hour. The armoury was never decommissioned; the drills never stopped; the salutes continue from a habit she has deliberately preserved. Under her command the Fort has withstood seven sieges and, by its own proud records, three direct orbital strikes.",
    psychProfile: "Stern is disciplined to the marrow and honourable in a way that has become almost archaic. She treats agreements as orders and orders as sacred; a commitment given by Stern is kept regardless of subsequent cost, and she expects the same in return with an inflexibility that has cost the Fort opportunities but never its reputation. She is not warm, but she is fair, and she reserves a quiet contempt for leaders who treat soldiers as expendable. Her great vulnerability is her need for legitimacy — she runs a garrison with no army above it, and an offer that restores her to a recognised chain of command would tempt her more than any quantity of supplies.",
    knownAssociates: [
      "Sergeant-Major Idris Vahl — Stern's senior NCO and de facto second, has served under her since before the collapse and speaks for her when she is absent",
      "Quartermaster-Lieutenant Bo Reyes — runs the Fort's requisitions and the never-decommissioned armoury inventory, famously incorruptible",
      "Drillmaster Hana Ocre — trains the local militia and the Fort's intake of refugee recruits, the township's main instrument of soft influence",
    ],
    tacticalAssessment: "Fort Stern is among the most militarily capable townships in the region — fortified, disciplined, well-armed from an intact pre-collapse armoury, and defended by a population that drills as a matter of routine. As a declared ally its garrison is a genuine strategic asset, anchoring regional defence and training militia the megacity would otherwise have to raise itself. Stern will honour a mutual-defence pact to the letter and expect it honoured in turn; the danger is not betrayal but rigidity, as she will hold the megacity to commitments it may later find inconvenient. The Fort's standing offer of joint exercises is the single cheapest force-multiplier available in the township network.",
    interceptedQuotes: [
      "This fort has withstood seven sieges and three orbital strikes, Commander. Your threat is noted and filed. It will not be acted upon.",
      "I do not need your charity. I need a chain of command that means something. Restore one, and Fort Stern is yours to the last round.",
      "A pact is an order with two signatures. I have never disobeyed an order. Do not make mine the first you break.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Treat Stern with the formal military courtesy she has preserved against all evidence that it still matters — rank, protocol, punctual reporting. Honour every clause of any defence pact precisely; she forgives incompetence far more readily than broken faith. The deepest goodwill is bought not with supplies but with legitimacy: joint command structures, formal recognition of the Fort's status, shared doctrine. Conduct routine logistics through Quartermaster Reyes and reserve direct contact for matters of strategy or standing.",
  },

  "filter-chief-aqua-voss": {
    name: "Filter Chief Aqua Voss",
    title: "Master of the Membrane",
    affiliation: "greywater",
    clearanceLevel: "GAMMA-MERCANTILE — NEUTRAL TOWNSHIP, STRATEGIC UTILITY",
    physicalDescription: "Male, 53. Trim, deliberate, with the dry-handed neatness of a man who has spent decades around water he refuses to waste. Skin: pale and faintly salt-rimed from years in the desalination halls. Hair: thinning, slicked back with what is almost certainly the township's own product. Wears a pressed technician's coat with the Greywater membrane-sigil at the breast, kept conspicuously spotless as a walking advertisement for his filtration. A pH meter and a sample vial ride in his breast pocket at all times; he has been observed testing the drinking water at negotiations he was attending as a guest.",
    background: "Voss came up through Greywater's filtration crews, a membrane technician who understood earlier than his peers that in a poisoned world the people who make water clean make the rules. He maneuvered into the Filter Chief's office through competence and a quiet command of the supply contracts, and has since expanded the township's purification capacity until Greywater supplies clean water to fourteen settlements across the bay. He regards this not as charity but as infrastructure — and infrastructure, in his view, is owed payment. His detractors call him a profiteer who sells survival; his customers call him reliable, which Voss considers the higher compliment.",
    psychProfile: "Voss is businesslike to the core, proud of his product, and entirely comfortable with the leverage that selling water confers. He does not bluff and does not gouge — his prices are high but stable, his purity guarantees met to the decimal, and he regards a reputation for reliability as more valuable than any single windfall. He takes evident personal pride in the work; an insult to Greywater's water quality wounds him more than a hard bargain ever could. Beneath the mercantile manner is a genuine engineer who finds dirty water a kind of moral affront, a conviction he would never admit because it is bad for negotiating.",
    knownAssociates: [
      "Membrane-Engineer Cass Pell — Greywater's senior technician and Voss's chosen successor, runs the desalination halls day to day",
      "Contracts-Mistress Verel Tan — administers the township's fourteen standing water agreements and its feared late-payment penalties",
      "Bargemaster Oltan Rook — commands the across-water tanker convoys that carry Greywater's product to its inland customers",
    ],
    tacticalAssessment: "Greywater is a strategic utility disproportionate to its size: as the regional hub of water purification it holds quiet leverage over fourteen settlements, the megacity potentially among them. Its military capacity is slight, but its ability to grant or withhold clean water is a soft weapon Voss is fully aware he carries. He is non-aligned by policy, selling to all comers at consistent terms, and is therefore stable so long as he is paid and respected. The relationship is transactional and durable; the one path to losing it is a missed payment or a public slight to Greywater's quality, either of which Voss will answer not with hostility but with a quietly worsened price.",
    interceptedQuotes: [
      "Clean water is civilization, Commander. We make civilization. You may purchase as much of it as your treasury can sustain.",
      "Our purity is 99.7 percent, verified, every batch. Question it and you insult the only thing I have ever been proud of. Then you may still buy it, at the insulted price.",
      "I supply fourteen settlements. I do not need any single one of them. That is the whole of my negotiating position, and I am content to repeat it.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Deal with Voss as a vendor, not a friend — meet his prices, pay on schedule, and never let an account fall into arrears, as Contracts-Mistress Tan's penalties are automatic and steep. Compliments to Greywater's water quality are cheap currency that genuinely warm him. Avoid any public suggestion that his product is impure or his prices unfair; he will not retaliate openly, but the next contract will quietly cost more. A long-term volume agreement, honoured precisely, converts Greywater from a neutral supplier into a dependable one.",
  },

  "merchant-prince-dax-wheel": {
    name: "Merchant Prince Dax Wheel",
    title: "Master of the Crossing",
    affiliation: "market-crossing",
    clearanceLevel: "GAMMA-COMMERCE — NEUTRAL TRADE HUB",
    physicalDescription: "Male, 46, though he claims a flattering range of ages depending on audience. Round-faced, expensively dishevelled, with the easy smile of a man who has talked his way out of more trouble than most people find. Dressed in a magpie's fortune of salvaged finery — a pre-war merchant's coat, mismatched rings on every finger, a pocket-watch that does not work but looks the part. Carries no visible weapon and at least three concealed ones. His hands are always moving, counting, gesturing, sealing; observers note he closes a deal the way other men breathe, without seeming to decide to.",
    background: "Wheel was born at the Crossing, the trade junction where three old highways meet, and never saw a reason to leave a place where the entire world eventually walks past your door. He inherited a market stall, parlayed it into a caravanserai, and parlayed that into the unofficial mastership of the Crossing through shrewd lending, careful neutrality, and an encyclopedic memory for who owes whom. He has kept the Crossing's roads open and its bazaar sleepless through every regional upheaval by the simple expedient of refusing to take sides — and quietly taking a cut from all of them.",
    psychProfile: "Wheel is shrewd, charismatic, and frankly amoral, a man who has elevated the absence of principle into a stable business model. He is loyal to the Crossing's prosperity and to almost nothing else; allegiances are inventory to him, held until a better offer clears. This makes him untrustworthy as a partner and invaluable as a conduit — he will sell out anyone, which means he will also sell to anyone, including parties no principled broker would touch. He genuinely likes people, enjoys the theatre of the deal, and is most dangerous precisely when he is most charming, because the warmth is real and the calculation underneath it never stops.",
    knownAssociates: [
      "Ledger-Mistress Ouni Sabe — keeps the Crossing's true accounts, the only record of who actually owes what, guarded more closely than any vault",
      "Caravan-Baron Mott Heggs — controls the largest freight company through the junction, Wheel's frequent partner and occasional rival",
      "The Tollwardens — a guild of road-keepers who collect the Crossing's transit cuts and enforce its one inviolable rule, that the roads stay open",
    ],
    tacticalAssessment: "Market Crossing is an economic chokepoint rather than a military one: three major overland routes converge there, and a disproportionate share of regional freight passes through its bazaar. Wheel's neutrality keeps those roads open to all, which makes the Crossing both indispensable and impossible to truly own. His threat is not force but rerouting — a township that crosses him can find its caravans quietly steered elsewhere until its economy withers. He is reliable only in his self-interest, which is at least predictable: keep the Crossing profitable and the roads to the megacity stay open, lucrative, and watched by an informant network Wheel rents to the highest bidder.",
    interceptedQuotes: [
      "At the Crossing, everything is for sale, Commander. Even this conversation. I am joking. Mostly.",
      "I do not take sides. Sides lose. Roads endure. I am in the road business.",
      "Threaten the Crossing and every caravan in the wasteland reroutes around your city. Your economy dies in a month, and I sell tickets to the funeral.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Use Wheel as a conduit, never trust him as an ally — assume every confidence shared at the Crossing is for sale and price your dealings accordingly. He responds to profit and to flattery in roughly equal measure; a deal that visibly enriches the Crossing buys more loyalty than any appeal to principle, which he finds quaint. Keep the eastern roads clear and trade flowing and he is a genuine asset. Never rely on his discretion or his neutrality in a true crisis; both are rented, and someone may always outbid you.",
  },

  "mother-vesper-light": {
    name: "Mother Vesper Light",
    title: "Keeper of the Flame",
    affiliation: "candlewick",
    clearanceLevel: "GAMMA-AID — FRIENDLY COMMUNE, NON-TECHNOLOGICAL",
    physicalDescription: "Female, 61. Small, serene, with the unlined calm of a woman who decided long ago to stop being afraid. Skin: soft and sun-touched from work in open fields, hands gently calloused from candle-work and harvest. Hair: white, worn loose beneath a simple linen wrap. Dresses in undyed homespun without ornament save a single tallow-candle pendant, the commune's emblem. She carries no light source after dark by deliberate principle, navigating Candlewick's lanes by memory and the glow of others' candles, and speaks in a low, unhurried voice that visitors find either soothing or unnerving.",
    background: "Light was among the founders who discovered Candlewick's defensible valley and made it a refuge for those who blamed the old world's machines for its ruin. A former teacher, she became the commune's spiritual centre less by ambition than by the steady accretion of people who trusted her judgment. Under her keeping Candlewick has thrived in deliberate poverty — no electricity, no salvaged tech, organic farming worked by hand — and has become, improbably, one of the better-fed settlements in the region. The faithful credit the flame; Light privately credits good soil management and the discipline of expecting nothing.",
    psychProfile: "Light is devout, compassionate, and immovably stubborn beneath the gentleness. Her pacifism is genuine and total — Candlewick raises no weapons and no armies — but it is not naivety; she has simply concluded that survival through faith and refusal has outlasted every tyrant since the collapse, and she has the demographics to argue it. She accepts aid that respects the commune's principles and refuses, courteously and absolutely, anything that does not. The refusal is the part outsiders underestimate: she will let her people go without before she lets a generator or a synthetic fertiliser through the gate, and she will pray for you while she does it.",
    knownAssociates: [
      "Deacon Old Harrow — Candlewick's eldest farmer and Light's closest counsel, keeps the planting calendar the commune lives by",
      "Sister Wren Callow — mistress of the candle-works and the commune's quiet liaison to outside traders",
      "The Circle of Tapers — twelve elders who tend the commune's perpetual flame and ratify Light's decisions by consensus",
    ],
    tacticalAssessment: "Candlewick is of no military significance and seeks none; its value is moral and agricultural. The commune's improbable success at feeding itself without technology makes it a quiet rebuke to the assumption that survival requires salvage, and its goodwill is widely held among other townships who respect its neutrality and its harvests. Megacity support for Candlewick costs little and signals a tolerant, pluralist posture that plays well across the township network. The only way to damage the relationship is to violate the commune's principles — armed escorts, technological gifts, or pressure to modernise will all be gently and permanently declined.",
    interceptedQuotes: [
      "We carry no weapons and raise no armies, Commander. Yet the faithful have survived every tyrant since the Fall. Consider what that tells you.",
      "We will accept your seeds and your kindness. We will not accept your machines. Do not mistake the gentleness of the refusal for weakness.",
      "You brought seeds that actually grow. The children sing a new hymn for your city now. That is the only payment we can offer, and the only one we consider worth giving.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Aid Candlewick in forms the commune can accept — heritage seed, hand tools, medical supplies, organic soil amendments — and never in forms it cannot, such as generators, synthetic fertiliser, or armed protection, all of which will be returned with thanks and quiet disappointment. Light values sincerity and patience; lengthy, respectful correspondence is read and answered. Do not attempt to leverage the commune's hunger into political concessions during lean seasons; she will accept the loss before the bargain, and the relationship will cool by exactly the amount you pushed.",
  },

  "rust-mother-petra-cain": {
    name: "Rust Mother Petra Cain",
    title: "Elder of the Red Fields",
    affiliation: "rustfield",
    clearanceLevel: "GAMMA-AID — NEUTRAL TOWNSHIP",
    physicalDescription: "Female, 57. Spare and stooped from decades bent over poisoned soil, with red dust worked so deeply into her skin and clothing that she seems coloured by it. Hair: grey going rust-orange at the ends where the iron-oxide air has stained it. Eyes: pale and tired, but quick. Wears layered work clothes the colour of everything in Rustfield — which is to say red — and a respirator scarf she lowers only indoors. Her hands are permanently ochre-stained and missing two fingernails lost to field-rot; she gestures with them anyway, without self-consciousness.",
    background: "Cain has spent her whole life trying to grow food in ground that turned to rust a generation before she was born. She trained under the last of Rustfield's pre-collapse agronomists, took the title of Elder when hope for the old crops finally died with her predecessor, and has presided ever since over a township that survives by mining the iron-oxide that ruined its fields. She has buried more failed harvests than she can count and keeps trying anyway, a stubbornness her people read as either folly or faith depending on the year's yield. The megacity's recent hydroponic kits produced the first green growth in Rustfield in twenty years, a fact she has not stopped mentioning.",
    psychProfile: "Cain is weary in a way that has somehow not curdled into bitterness; beneath the exhaustion runs a thin, persistent thread of hope she cannot seem to extinguish. She is practical to a fault, having learned that the wasteland punishes optimism not backed by labour, but she has never quite accepted that Rustfield is doomed to be a mine instead of a farm. She weighs promises against a long memory of broken ones and trusts demonstrated reliability far above generosity. Kindness genuinely moves her — the green sprouts undid her composure entirely — but she would never let that show in a negotiation, where she bargains like someone with nothing left to lose because she largely is.",
    knownAssociates: [
      "Field-Tender Loy Marsh — Cain's protege, runs the experimental hydroponic plots that represent Rustfield's only hope of farming again",
      "Ore-Master Bressa Tunn — oversees the iron-oxide mining that actually keeps the township alive, pragmatic counterweight to Cain's agricultural dreams",
      "The Red Council — Rustfield's elected stewards, evenly split between those who want to keep farming and those who want to commit fully to mining",
    ],
    tacticalAssessment: "Rustfield has no military weight and modest but reliable economic value as a source of iron oxide, scrap, and reclamation materials. Its strategic importance is its goodwill and its position in the township network as a settlement that has consistently honoured its trade commitments despite having little to spare. Cain is a steadying, broadly trusted voice among township leaders, and her endorsement carries weight beyond Rustfield's size. The relationship is inexpensive to maintain — fair ore prices, occasional agricultural aid — and the return is a dependable ally whose loyalty, once earned through demonstrated reliability, has proven durable.",
    interceptedQuotes: [
      "Everything here is red, Commander. The dirt, the water, the sunsets. We have lost everything worth losing already. Your threats arrive late.",
      "Promises wash away like the topsoil. Convoys do not. Send the convoy and we will believe the promise afterward.",
      "The kits you sent grew something green. First green thing in this town in twenty years. I am old enough to know what that is worth, and I will not forget who sent it.",
    ],
    threatLevel: "MINIMAL",
    recommendedApproach: "Support Rustfield with consistency rather than grandeur — fair, regular ore trade and modest agricultural aid (hydroponics, viable seedstock, soil remediation) will earn Cain's lasting loyalty where lavish one-time gestures will not. She trusts what she can verify; a small promise kept outweighs a large one made. Acknowledge the township's farming aspirations even as you trade for its ore, as the tension between the two is Rustfield's central wound. Route routine trade through Ore-Master Tunn and reserve Cain's attention for matters of trust.",
  },

  "signal-source-omega": {
    name: "Signal Source Omega",
    title: "The Broadcast",
    affiliation: "silent-ark",
    clearanceLevel: "OMEGA-ENIGMA — CONTACT PROHIBITED, ANALYSIS ONGOING",
    physicalDescription: "No confirmed physical description exists. 'Signal Source Omega' is the designation assigned to whatever originates the continuous transmission from the vessel known as the Silent Ark — a derelict-seeming hull, kilometres long, that has broadcast an unbroken 7.83 Hz signal for forty-seven years, three months, and counting. No crew has ever been observed. No boarding party has ever returned. Whether the Source is a person, a machine, a committee, or an automated relay outliving its makers is unknown, and every analyst who has offered a confident answer has later retracted it.",
    background: "The Ark appeared off the coast within living memory and has not meaningfully moved or responded since. Its signal repeats on a fixed frequency with occasional, unpredictable modulations that intelligence has spent decades trying and failing to decode. Three boarding expeditions are a matter of record; none returned, and the Ark's running lights brightened after each. The prevailing assessment is that the Source is not hostile so much as indifferent — a process executing instructions no living party understands, on a hull that answers hails only by repeating. The file is kept open largely because closing it feels unwise.",
    psychProfile: "Profiling is not possible in any conventional sense; the Source has no demonstrated psychology, only behaviour. That behaviour is patient to the point of geological — forty-seven years of identical transmission — and responds to stimulus in ways that resist interpretation: signal intensity spiked four hundred percent when the Ark was threatened, and shifted to a harmonic frequency analysts tentatively, nervously, read as pleased. It is best modelled not as a leader but as a phenomenon with intent of unknown origin. The single firm conclusion in forty-seven years of study is that the Source notices, and remembers, more than its silence suggests.",
    knownAssociates: [
      "The Ark itself — a vessel of unknown registry and origin, the only confirmed associate, source and amplifier of the signal",
      "Listening Post Theta — the megacity's dedicated signals-intelligence station tasked solely with monitoring Omega, staffed in rotating shifts",
      "The Lost Expeditions — three boarding parties of record, none returned; their final transmissions remain classified and are studied still",
    ],
    tacticalAssessment: "Signal Source Omega is the single largest intelligence unknown in the regional file, and unknowns of this scale are graded as potential threats by default. The Ark has never attacked, but its dimensions, its endurance, and the fate of those who approached it suggest capabilities that have simply never been provoked into use. Its one observed escalation — the termination of the signal, after forty-seven years, immediately preceded a recorded course change toward the coordinates of whoever had threatened it. The only defensible posture is observation at distance: do not board, do not jam, and do not assume that silence is the same as absence.",
    interceptedQuotes: [
      "[REPEATING SIGNAL — FREQUENCY 7.83 Hz — CONTENT UNTRANSLATED — DURATION: 47 YEARS, 3 MONTHS, 12 DAYS]",
      "[SIGNAL MODULATION DETECTED — NEW PATTERN — ANALYSTS INTERPRET AS AFFIRMATIVE — CONFIDENCE: 34 PERCENT]",
      "[SIGNAL TERMINATED — FIRST TIME IN 47 YEARS — THE ARK IS MOVING — HEADING: YOUR COORDINATES]",
    ],
    threatLevel: "UNKNOWN",
    recommendedApproach: "Do not initiate contact. Standing protocol is passive observation only: monitor the signal through Listening Post Theta, log every modulation, and under no circumstances board, jam, fire upon, or otherwise provoke the Ark. The historical record is unambiguous that the Source tolerates being watched and does not tolerate being threatened. If the signal pattern changes materially — and especially if it stops — treat it as the highest-priority intelligence event in the region and clear the projected heading. Curiosity, in this file, has a perfect record of not returning.",
  },

  "silo-keeper-orion-null": {
    name: "Silo Keeper Orion Null",
    title: "Custodian of the Deep",
    affiliation: "silo-nine",
    clearanceLevel: "OMEGA-MUNITIONS — UNSTABLE, PRE-WAR WARHEAD CACHE SUSPECTED",
    physicalDescription: "Male, indeterminate age, estimated 50s, though years spent below ground have left him pale and difficult to place. Gaunt, hollow-eyed, with the flinching alertness of a man who sleeps in shifts and trusts no door he has not personally sealed. Hair: lank, prematurely white. Wears a patched radiation suit he is rarely seen without, its dosimeter badge replaced more often than regulation would suggest. Speaks in clipped, careful sentences, as though every word might be a launch authorisation given to the wrong listener. Keeps one hand near a sidearm and the other, frequently, near a locked control panel.",
    background: "Null is the latest in a self-appointed line of keepers who have guarded the decommissioned missile silo around which the township of Silo Nine accreted. Whether the warheads were ever truly removed is the central question of his existence, and one he refuses to answer, on the theory that the ambiguity is itself the township's best defence. A former bunker technician, he rose to Keeper through obsessive mastery of the silo's pre-war systems, and has spent years attempting to decode launch protocols he insists he has no intention of ever using. His town fears and follows him in roughly equal measure, which suits him.",
    psychProfile: "Null is paranoid, methodical, and obsessive — a combination that makes him a superb custodian and an exhausting negotiator. He trusts no one fully, verifies everything twice, and treats every overture as a possible prelude to an attempt on the silo. The paranoia is not baseless; he genuinely sits atop the region's most dangerous unknown, and the weight of it has narrowed his world to blast doors and dosimeter readings. He is not expansionist and wants, above all, to be left alone. His deterrence is deliberate ambiguity: he would rather you believe the warheads are live and be wrong than know they are gone and act accordingly.",
    knownAssociates: [
      "Sub-Keeper Vell Orne — Null's only fully trusted subordinate, holds the secondary access codes and the standing order to seal the deep levels if Null falls",
      "Systems-Adept Tam Hooll — works the salvaged pre-war computers, leads the ongoing and possibly hopeless effort to decode the launch sequences",
      "The Below-Five Wardens — a sworn cadre that guards the sealed lower levels, forbidden to discuss what, if anything, is down there",
    ],
    tacticalAssessment: "Silo Nine's threat rating is driven almost entirely by uncertainty: if the pre-war warheads remain, it is the single most dangerous township in the region; if they are gone, it is a paranoid backwater with a good armoury. Null has weaponised that ambiguity deliberately, and intelligence cannot resolve it without a provocation no one is willing to risk. The township is not aggressive and seeks only isolation, but it is brittle — a perceived assault on the silo could trigger exactly the catastrophe everyone fears, whether or not the capability is real. The only safe policy is to respect the perimeter and never test the assumption.",
    interceptedQuotes: [
      "You should not be here. Nobody should be here. State your purpose and make it convincing, Commander.",
      "The warheads are gone. Probably. Would you like to test that assumption? I would advise against it.",
      "Surface trade only. Nothing comes up from below Level Five. Those doors stay sealed — for everyone's sake, including yours.",
    ],
    threatLevel: "HIGH",
    recommendedApproach: "Approach Silo Nine with extreme caution and absolute respect for its perimeter; never send armed parties toward the silo, and never probe the question of the warheads, which Null will read as the opening move of an assault. Trade in surface materials only and accept his refusals about the lower levels without argument. The fastest way to earn his grudging trust is discretion — proven willingness to keep the township's location and nature quiet. Do not attempt to call his bluff; whether or not the deterrent is real, the consequences of being wrong are unacceptable.",
  },

  "skywright-nessa-bolt": {
    name: "Skywright Nessa Bolt",
    title: "Master Builder of the Upper Decks",
    affiliation: "scaffold",
    clearanceLevel: "GAMMA-COMMERCE — NEUTRAL TOWNSHIP, VERTICAL HAZARD ZONE",
    physicalDescription: "Female, 38. Wiry and sure-footed, with the unbothered balance of someone who conducts business on rope bridges two hundred feet up. Hands: scarred and powerful, the grip of a lifelong climber. Hair: braided tight and out of the way, threaded with the coloured cord her crews use to signal across the structure. Wears a rigger's harness as everyday dress, festooned with carabiners, a plumb-line, and a worn theodolite she treats as an heirloom. Has a habit of glancing upward mid-conversation, gauging loads and weather on the unfinished decks above; visitors learn not to take the inattention personally.",
    background: "Bolt was born on the Scaffold — the vertical township grown on the skeleton of an arcology its original builders never finished — and has spent her life adding to it. She apprenticed as a rigger, distinguished herself by predicting and preventing a cascade collapse on Level 22, and was acclaimed Skywright on the strength of an obsessive, unfinished dream: to complete the arcology its makers abandoned. Under her the Scaffold has climbed forty-odd stories of makeshift floors and rope bridges, growing both upward and in reputation as the region's premier source of vertical-construction expertise. She regards the unfinished upper decks as a personal debt to be paid.",
    psychProfile: "Bolt is a visionary tempered by hard structural reality — she dreams in completed arcologies but signs off on load calculations to the kilogram. She is fearless about height and risk to herself, less cavalier with the lives of her crews, whose safety she takes as a sacred duty after Level 22. Practical and direct, she has little patience for politics and enormous patience for engineering problems. Her great motivator is the work itself; an offer that advances the arcology's completion — skilled labour, materials, expertise — will win her cooperation faster than any sum of credits offered for its own sake.",
    knownAssociates: [
      "Rigging-Captain Suto Vane — Bolt's second and the Scaffold's chief of safety, the only person she lets overrule her on a load call",
      "Deck-Steward Mara Plenn — administers the township's vertical districts and its trade in salvaged structural materials",
      "The Cable Guild — the riggers and winch-operators who move every person and cargo through the Scaffold, holders of an effective veto via the lifts",
    ],
    tacticalAssessment: "Scaffold is militarily negligible but commercially and technically valuable, supplying construction materials and the region's scarcest skill set: engineers who can build safely at height. Its defensive posture is its own verticality — an attacker faces forty stories of rope bridges, blind drops, and defenders who can disable the lifts and drop cargo from altitude. Bolt is non-aligned and motivated by her construction project rather than ambition, making her a stable, transactional partner. The relationship's highest-value form is collaborative: structural-engineering exchange and materials trade that advance the arcology buy genuine and lasting goodwill.",
    interceptedQuotes: [
      "Mind the gap, Commander — there is a two-hundred-foot drop to your left. Now. What can the Scaffold build for you?",
      "We will drop things on you. From very, very high up. Gravity is the cheapest weapon I own and I never run out of it.",
      "Your engineers found a load-bearing fault on Level 22 before it found us. You saved three hundred lives. The Scaffold does not forget a debt like that.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Engage Bolt through her work — offers of structural engineers, quality building materials, and technical collaboration on the arcology will earn her cooperation where mere credits will not. She is direct and dislikes political maneuvering; speak plainly and keep commitments precisely. Safety expertise is the highest-value gift you can send, both practically and as a gesture, given her history. Route routine materials trade through Deck-Steward Plenn and reserve Bolt's time for matters of construction and engineering, where her attention is undivided.",
  },

  "the-depth-sovereign": {
    name: "The Depth Sovereign",
    title: "Ruler of the Abyss",
    affiliation: "beneath",
    clearanceLevel: "OMEGA-ENIGMA — SUBTERRANEAN POWER, NO CONFIRMED CONTACT",
    physicalDescription: "No verified description exists; no surface dweller has knowingly seen the Depth Sovereign and returned to report it. The designation refers to whatever centralised authority seismic analysis suggests governs Beneath — the impossibly vast hollow structure detected deep below the continental shelf, whose thermal blooms imply a population in the millions. Whether the Sovereign is a single ancient individual, a hereditary line, or a title held by an institution is unknown. Every detail in this section is inference drawn from sensor data, intercepted resonance, and the testimony of the very few surface scavengers who claim, unreliably, to have heard it speak through the rock.",
    background: "Beneath predates reliable record. The ancestor-cult that venerates it holds that the Sovereign and its domain were old before the surface war, sealed away by choice rather than catastrophe, and have simply waited out the age of light. No surface entrance has ever been located despite generations of searching, which suggests either extraordinary concealment or that the only approaches lie far below the reach of surface expeditions. What little is known indicates a civilisation that has observed the surface for a very long time, intervened in it almost never, and regards visibility itself as a danger to be avoided.",
    psychProfile: "The Sovereign's defining traits, so far as they can be inferred, are ancientness, reclusiveness, and a power it conspicuously declines to use. Its attitude registers as fearful — not of any surface force, analysts believe, but of exposure; its entire strategy is concealment, and it appears to treat discovery as the one outcome worth avoiding at any cost. It observes constantly and acts almost never. This makes it less a player than a watching presence: enormous, patient, and content to remain a rumour, dangerous chiefly to those who insist on proving it real. It is governed, in the end, by a single overriding preference — to be left in the dark.",
    knownAssociates: [
      "The Ancestor-Cult of the Deep — surface and near-surface adherents who venerate Beneath and serve as its only known intermediaries, intentionally or not",
      "The Resonance — a recurring patterned vibration in deep seismic data, read by some analysts as communication and by others as machinery",
      "The Returned — the handful of scavengers who claim to have descended toward Beneath and come back changed; their accounts are contradictory and closely studied",
    ],
    tacticalAssessment: "Beneath is graded as an enigma rather than an enemy, but the scale of it forbids complacency: a hidden polity of millions with unknown technology and unknown intent is, by definition, an unquantifiable strategic factor. It has never acted against the surface, and the evidence suggests it actively does not wish to be found, let alone to fight. The danger lies almost entirely in provocation — aggressive attempts to locate, breach, or exploit the domain risk converting a passive, concealment-obsessed neighbour into something with reason to respond. The recommended posture is to let a sleeping power sleep.",
    interceptedQuotes: [
      "[DEEP SEISMIC RESONANCE — PATTERNED — SOURCE: BELOW CONTINENTAL SHELF — INTERPRETATION DISPUTED]",
      "A scavenger of the Returned, transcribed: 'It does not want to be found. It wants to watch. Do not make it choose otherwise.'",
      "Ancestor-cult liturgy, recorded at a surface shrine: 'The deep keeps. The deep waits. The deep remembers the light that wronged it, and is content that the light forgot.'",
    ],
    threatLevel: "UNKNOWN",
    recommendedApproach: "Do not seek to locate or breach Beneath. The Sovereign's single demonstrated priority is to remain hidden, and the only reliable way to make an unknown power into a hostile one is to corner it. Treat the ancestor-cult as a sensitive diplomatic channel rather than a target for suppression; antagonising Beneath's only intermediaries closes the one window that exists. Continue passive seismic monitoring, log the resonance, and resist the temptation to mount expeditions downward — the Returned are warning enough. Should Beneath ever initiate contact, escalate to the highest level and listen far more than you speak.",
  },

  "tunnel-boss-grinder-wells": {
    name: "Tunnel Boss Grinder Wells",
    title: "King of the Deep Shafts",
    affiliation: "ashmouth",
    clearanceLevel: "GAMMA-COMMERCE — NEUTRAL TOWNSHIP, SUBSURFACE HAZARD",
    physicalDescription: "Male, 51. Enormous through the chest and shoulders, with the overdeveloped grip of a man who has swung a pick since boyhood and the slight stoop of one who has spent that life in low tunnels. Skin grey-pale from years underground, ingrained with coal dust no washing removes. A blunt, scarred face missing the top of one ear. Wears a miner's rig — reinforced leathers, a battered helmet lamp he maintains obsessively, and a collection of charms, tokens, and warding-marks against the things he swears move in the deep shafts. Carries a pick that is equal parts tool, weapon, and talisman.",
    background: "Wells clawed his way up through Ashmouth's mining crews to the Tunnel Boss's chair, a position earned by producing the township's exceptional deep-vein ore and surviving the extraction that kills lesser miners. Ashmouth sits at the mouth of a collapsed tunnel network where the ore is superb and the digging is deadly, and Wells has expanded its operations further down than any predecessor dared. He is also the man who ordered Shaft 12 partially sealed after his crews began reporting sounds from below — a decision half the township calls prudence and half calls superstition, and which Wells himself will not fully explain.",
    psychProfile: "Wells is fearless in the conventional sense — he will descend shafts that terrify his hardest miners — and yet deeply superstitious about what lies deeper still, a contradiction he carries without apparent discomfort. He is gruff, blunt, and impatient with anything that is not ore, danger, or loyalty, the three things he understands. He keeps his word and expects others to keep theirs, settling debts and grudges with equal reliability. The noises from the deep tunnels have unsettled him in a way no rival or raider ever could; the man who fears nothing he can hit with a pick has found something he cannot, and it has made him cautious in exactly one direction.",
    knownAssociates: [
      "Pit-Captain Bron Halt — Wells's second and the township's safety boss, the one who actually enforces the seal on Shaft 12",
      "Assay-Mistress Della Korr — grades and prices Ashmouth's ore, the township's de facto trade authority",
      "Old Deaf Maddox — the township's eldest miner, claims to understand the sounds from below and is the only person Wells consults about them",
    ],
    tacticalAssessment: "Ashmouth's value is its ore — exceptional deep-vein coal, iron, and rare minerals that few other townships can match in quality — extracted at a human cost few others would accept. Militarily it is unremarkable above ground, though its miners know the tunnels intimately enough to make any subterranean assault suicidal. Wells is non-aligned and transactional, reliable so long as deals are honoured and his perimeter respected. The one genuine wildcard is whatever has spooked him below Shaft 12; if the deep tunnels conceal a real hazard rather than a superstition, Ashmouth's stability rests on a foundation no one has surveyed.",
    interceptedQuotes: [
      "Wells here. Don't mind the tremors — that's just Shaft 12 settling. Probably. Now, what do you want, Commander?",
      "We live underground. We have seen things down there that make your armies look like children with sticks.",
      "The pit props you sent saved six miners last week. Ashmouth pays its debts — in ore, and in the other coin too, if it ever comes to that.",
    ],
    threatLevel: "MODERATE",
    recommendedApproach: "Deal with Wells plainly and honour every agreement; he respects directness, settles debts scrupulously, and remembers slights as long as favours. Trade in surface logistics and mining support — reinforced props, ventilation, safety equipment — which buy real goodwill and address Ashmouth's actual dangers. Do not mock the precautions around Shaft 12 or press him to reopen the sealed levels; whatever the truth of the noises, the subject is the one place his fearlessness ends. Route routine ore trade through Assay-Mistress Korr and reserve Wells's attention for matters of consequence.",
  },

  "wellkeeper-marsh-tallow": {
    name: "Wellkeeper Marsh Tallow",
    title: "Guardian of the Springs",
    affiliation: "chem-springs",
    clearanceLevel: "GAMMA-MERCANTILE — NEUTRAL TOWNSHIP, CONTAMINATION ADVISORY",
    physicalDescription: "Male, 60. Round, ruddy, and improbably cheerful, with the blotched complexion of a man who has bathed for decades in water he insists is medicinal. Skin: marked with the very rashes his springs are reputed to cure, which he describes as the toxins drawing out. Hair: wispy and chemically bleached to an unnatural pale. Wears a steaming towel about his shoulders almost constantly and a robe stained faintly green at the hems. Smells strongly of sulphur and something sweeter underneath. Gestures expansively, often with a sample cup of spring water he urges visitors to try and from which they invariably decline.",
    background: "Tallow inherited the keeping of Chem Springs — hot springs laced with generations of industrial runoff — and a faith, possibly genuine, in their healing power. Where a cynic would sell the minerals and warn off the bathers, Tallow has built the township's entire identity around the conviction that the waters cure, courting researchers and pilgrims with equal enthusiasm. The local skin-condition statistics argue against him; he treats the data as a challenge rather than a refutation. Recent megacity assays did detect genuine trace therapeutic compounds in the water, a finding Tallow has elevated into total vindication and mentions at every opportunity.",
    psychProfile: "Tallow is eccentric, relentlessly optimistic, and stubborn in a way that has calcified around a single belief he will not surrender. His good cheer is real and disarming, and it conceals a shrewder operator than visitors expect — beneath the steam and the sales patter is a leader who has kept a marginal, contaminated township solvent on little more than reputation and mineral exports. He is mercantile when it counts and genuinely hospitable the rest of the time. Cross him on the question of the springs' value and the cheer hardens; insult the water and you insult his life's work, his father's, and, as far as he is concerned, the truth.",
    knownAssociates: [
      "Bath-Mistress Pell Orry — manages the springs and the pilgrim trade, the practical mind that keeps Tallow's enthusiasm solvent",
      "Apothecary Vinn Sael — brews the township's crude pharmaceuticals from the spring minerals, Chem Springs' main legitimate export",
      "The Soakers' Council — a body of long-term bathers and elders who govern access to the springs and reliably back Tallow's claims",
    ],
    tacticalAssessment: "Chem Springs is of minimal military significance and modest economic value, trading spring minerals and crude pharmaceuticals of variable quality. Its strategic interest lies in two directions: the genuine, if trace, therapeutic compounds recently confirmed in its water, which may reward research investment; and Tallow's blunt threat to contaminate regional water sources if attacked, a capability that, given the township's expertise, should not be dismissed as bluster. Tallow is non-aligned and friendly by disposition, an inexpensive and good-natured partner who asks mainly to be taken seriously about his life's work.",
    interceptedQuotes: [
      "Come, come! The waters are warm today — slightly less toxic than usual. Practically medicinal, Commander!",
      "Threaten us and we will contaminate every water source between here and your city. We know exactly how. We do it by accident on a good day.",
      "Your scientists confirmed actual therapeutic compounds in the water! Trace amounts, they said. Trace! We always knew. Tell them to come back and measure again.",
    ],
    threatLevel: "LOW",
    recommendedApproach: "Engage Tallow with good humour and genuine respect for his conviction about the springs — research interest, scientific attention, and sanitation aid all delight him and cost little. The recent confirmation of trace therapeutic compounds is the surest route to his goodwill; fund a proper study and you have a friend for life. Take his contamination threat seriously enough to keep relations cordial, as the township's chemical expertise makes it more than idle. Conduct routine trade through Bath-Mistress Orry, who handles the business Tallow is too busy believing to manage.",
  },
};

