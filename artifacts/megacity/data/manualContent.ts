export type ManualSection = {
  title: string;
  color?: "accent" | "info";
  items: string[];
};

import { ACTION_COST_PLAYER_GUIDE } from "@/engine/actionCostTiming";

export const MANUAL_INTRO =
  "MEGACITY is a dystopian idle/strategy city management simulator. You are the City Commander — appointed to grow a fortified city-state from a dense urban core into a massive metropolis surrounded by hostile wasteland. Every decision shapes the balance between order and chaos. This is your complete field reference, covering every core system from the tick loop to the end states.";

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "GETTING STARTED",
    items: [
      "Create a Commander Profile on the main menu to track your career across saves — pick a portrait, name your commander, and switch later any time",
      "Profiles sync via Steam Cloud — start on desktop, continue on Steam Deck, your career follows",
      "Start a New Game — choose your difficulty and starting faction",
      "Your starting faction gives unique bonuses (extra credits, military units, research, etc.)",
      "At city creation you also choose a PLAY MODE — Real-Time or Turn-Based — which is permanent for that save (see PLAY MODES)",
      "The game ticks automatically every 15 minutes (configurable) — even while you are away",
      "Each tick advances 6 hours of game time (4 ticks = 1 game day)",
      "Pick your OFFLINE SIM DEPTH (LITE / STANDARD / DEEP) in MORE — the resume estimate is measured against your device's actual tick cost",
      "Use the OVERVIEW screen (CITY tab) as your primary dashboard for city health",
      "First 10 ticks — STABILIZE: confirm food, water and power are in surplus, deploy Patrol Judges, and clear any opening crises",
      "Ticks 10-25 — EXPAND: build revenue buildings, start your first Tier 1 research, and hire officers for empty departments",
      "Ticks 25-50 — CONSOLIDATE: open mining, shore up defense, award contracts, and scout the world map",
      "Golden rule: never let credits hit zero — construction, research and deployments all stall. Keep a reserve",
      ACTION_COST_PLAYER_GUIDE,
      "Six save slots are available in MORE, each with its own label; the game also auto-saves and keeps a rolling backup per slot",
    ],
  },
  {
    title: "THE TICK SYSTEM",
    items: [
      "The world advances in ticks; each tick is 6 hours of city time, and 4 ticks make one in-game day",
      "Ticks run on a configurable timer and keep running while you are away in real-time mode — missed time is simulated on your return",
      "Every tick the engine processes resource production and consumption, population change, crime, unrest and happiness, construction and research progress, officer effects, faction shifts, random events, trade, military readiness, weather, and supply chains",
      "Open EVENTS & REPORTS for a line-by-line log of what changed each tick — it is your single best tool for understanding the city",
    ],
  },
  {
    title: "CITY STATS",
    items: [
      "Ten primary stats run 0-100: Happiness, Unrest, Crime, Law & Order, Public Health, Infrastructure Health, Defense Rating, Education, Biosphere, and Corruption",
      "Happiness below 40 pushes unrest up; unrest above 60 brings riots, and above 80 risks civil war",
      "Crime climbs when Law & Order is low — keep Law & Order above 30 or crime spirals",
      "Public Health below 40 triggers outbreaks and population decline; Infrastructure below 30 causes cascading failures",
      "Corruption above 60 bleeds credits; Biosphere below 25 invites environmental disaster",
      "Stats are interconnected — one good fix, such as more housing and food, lifts several at once",
      "Employment drifts toward a target set by job slots per citizen — industry, services, and transit buildings add slots, and a transit overload quietly drains employment every tick",
      "Breakdown cards on the OVERVIEW screen diagnose Public Health, Employment, transit, crime, power, water, defense, and infrastructure — each lists every factor pushing the stat up or down, with one-tap links to the screen that fixes it",
      "Tap the PUBLIC HEALTH, EMPLOYMENT, or DISEASE RISK cell in the City Status Matrix to jump straight to the matching Breakdown card",
    ],
  },
  {
    title: "RESOURCES & ECONOMY",
    items: [
      "Credits: your primary currency — earned from taxes, trade, and contracts",
      "Bureaucratic Overhead: once population grows past 200,000, a slice of your gross tax revenue is lost to administrative friction (ramping up to 30% at 1.5M+). Plan for this in late game",
      "Food & Water: essential for population survival — shortages cause unrest and deaths",
      "Power: required to run buildings — deficits reduce all production",
      "Steel: used for construction and mega-projects",
      "Goods: consumer products that boost happiness and trade income",
      "Fuel, Med Supplies, Ammo: military and emergency resources",
      "Monitor production vs consumption rates in the ECONOMY screen",
      "Build production buildings to increase resource output",
      "Income comes from taxes (scales with population), trade routes, tourism, company licensing (100 corporations pay fees), completed contracts, and the black market",
      "Recurring costs include unit upkeep, building maintenance, officer salaries, supply procurement, and research funding — underfunding maintenance lets infrastructure decay",
      "Banking (MORE) offers interest-bearing savings, tiered loans, and diplomatic credit transfers — defaulting on a loan wrecks your credit rating and diplomacy",
      "The Trade Exchange is a dynamic market for 730+ commodities; selling in bulk drives the price down, and auto-trading can cover critical resources",
      "Six utility layers — power, waste, transit, communications, fuel, and sanitation — cascade: let one fail and the others suffer",
      "Transit has hard capacity from transit lines, corridors, and courier units; once load tops capacity, the overload silently drains happiness and employment every tick — the Transit Grid Breakdown card on the OVERVIEW screen shows load vs capacity and how to fix it",
    ],
  },
  {
    title: "POPULATION & HOUSING",
    items: [
      "Your population grows a little each tick, driven by happiness, public health, the biosphere, and your active policies and edicts",
      "Housing is the ceiling — growth slows and stalls once citizens outnumber what your residential districts and buildings can shelter, so build housing to keep growing",
      "Shortages hurt: running out of food or water, high unrest, and disease all push growth negative",
      "Growth boosts from edicts are temporary — they only apply while the edict is active and end when it expires",
      "Sealing the borders or banning immigration sharply cuts growth for as long as the order stands",
      "While you are away the game simulates the missed time on your return — population advances at the same plausible pace as live play",
      "If a save ever comes back with an impossible population count, the Bureau of Records posts a CENSUS CORRECTION report to your inbox and rebuilds the registry from verified habitation records",
      "Citizens sort into five classes — Upper, Professional, Working, Underclass, and Destitute — across 50+ demographic categories; a large destitute underclass feeds crime and unrest",
    ],
  },
  {
    title: "DISTRICTS & CONSTRUCTION",
    items: [
      "Your city is divided into 268 districts, each with a zone type and population",
      "Build structures from the CONSTRUCTION screen — organized by category",
      "Over 30 build categories, such as Energy, Water, Food, Housing, Industrial, Transit, Security, Defense, Research, Civic, Farming, Space, and Biosphere",
      "Buildings require credits, steel, and sometimes specific technologies",
      "Balance housing (population growth) with industry (resource production)",
      "Infrastructure health degrades over time — build maintenance facilities",
      "The Sector Map offers heatmap overlays for crime, wealth, unrest, loyalty, and defense so you can spot problem districts at a glance",
      "Districts can specialise in one of eight types (Manufacturing, Commerce, Research, Military, Residential, Entertainment, Agricultural, Energy), levelling up to 5 when infrastructure quality and order stay high",
      "Construction spans 440+ building types; industrial builds further split into general, chemicals, plastics, raw materials, finished goods, and advanced sub-categories",
      "Batch-build up to 10 of the same building at once for efficiency",
    ],
  },
  {
    title: "RESEARCH & TECHNOLOGY",
    items: [
      "700+ technologies across 32 categories and 5 tiers",
      "Research progresses automatically each tick based on your research capacity",
      "Technologies unlock new buildings, policies, units, and mega-projects",
      "Many techs have prerequisites — plan your research path carefully",
      "Build research facilities and labs to increase research speed",
      "Specialized trees: Military R&D, Cybernetics, Biosphere, Religion, Statecraft & Shadow Ops",
      "Five tiers gate access, from immediately-available Tier 1 up to extreme Tier 5; higher tiers demand prerequisite techs and heavier investment",
      "Research speed is base speed plus officer and building bonuses — build labs and appoint a strong Science Advisor to go faster",
    ],
  },
  {
    title: "OFFICERS & MISSIONS",
    items: [
      "Recruit officers with unique traits, competence, loyalty, and ambition stats",
      "Assign officers to missions — success chance depends on their stats",
      "Mission types: Intelligence, Resource, Military, Special Operations",
      "Successful missions earn rewards (credits, resources, stat boosts)",
      "Failed missions have consequences (loyalty loss, corruption, city damage)",
      "Appoint officers to your Inner Circle for passive bonuses and XP",
      "Watch for corruption — corrupt officers sabotage your city",
      "166 officer positions span 11 departments (Infrastructure, Economic, Law Enforcement, Defense, Civic, Research, Judicial, Executive, District, Advisory, Intelligence)",
      "Officers rank up from Cadet to Chief Director and carry competence, loyalty and corruption scores plus traits like negotiator, efficient, or corrupt",
      "A department scoring above 50 grants bonuses; below 40 applies penalties — corrupt officers quietly leak credits every tick",
      "Your Inner Circle (Chief Advisor, Spymaster, War Minister and more) earns XP and feeds you a Whisper stream of loyalty, corruption, ambition and rivalry warnings",
    ],
  },
  {
    title: "FACTIONS & DIPLOMACY",
    items: [
      "11 rival factions (plus 2 hidden) operate within and around your city",
      "18 external megacities and nations on the world map — trade, spy, destabilise, or annex",
      "Each faction has influence, loyalty, and threat levels",
      "High threat factions may launch attacks or destabilize your city",
      "Diplomacy: 50+ actions including open communications, summits, treaties, smuggling deals, false flags, regulatory capture, and proxy wars",
      "Balance faction relations — too many enemies leads to war on multiple fronts",
      "A battered rival may offer a ceasefire — accept or counter-propose and the war winds down: a CEASEFIRE HOLDS dispatch names the faction standing down, in your inbox and once on the news ticker. Rejecting or stalling keeps the conflict hot",
      "Faction strikes allow direct military action against hostile groups",
      "Factions carry Influence, Loyalty, and Threat (0-100); civil war brews when Threat passes 80 while Loyalty sits below 20",
      "Faction types — Law, Criminal, Corporate, Underclass, and Cult — each want different things; the theocratic Reliquary See is a full faction, not a drifting faith",
      "Beyond the megacities, 33+ wasteland townships can become trade partners, allies, or vassals once discovered",
      "Negotiate before threat climbs — a civil war runs 40-80 ticks, dealing steady unrest, crime, and infrastructure damage",
    ],
  },
  {
    title: "MILITARY",
    items: [
      "Your standing army is built from the units you recruit, grouped into branches: infantry, armor, artillery, air support, special ops, and support",
      "Troops are your limiting resource — the same pool of people both crews your vehicles and mans your installations. An un-crewed vehicle or an unmanned installation contributes almost nothing, so recruit enough personnel to cover what you build",
      "Set a manpower priority — Balanced, Crew First, or Man Bases — to decide how your limited troops are split between crewing the motor pool and staffing installations",
      "Build and garrison military installations. When properly manned, supply installations (ammunition factories, fuel depots, supply depots) produce ammo, fuel, rations, and vehicle parts each tick",
      "Keep the army supplied: fuel and ammo are drawn from your economy and rations from your troops. Vehicles also need fuel and maintenance to stay serviceable, and shortages pull your readiness down",
      "Readiness reflects crew coverage, garrison coverage, morale, and supply. A fully supplied force fights at full strength, while a neglected one fights worse or not at all",
      "Manned installations add to your city's defense rating, and installations and doctrine policies carry an ongoing credit upkeep",
      "Read the manpower and logistics summary to see supply throughput and how ready your forces actually are, then set doctrine (rules of engagement, budget) and research advanced weapons: railguns, drone swarms, plasma weapons",
      "Combat power is weighted by branch: infantry 1x, special ops 2x, armor 3x, artillery 4x, air support 5x, plus support",
      "Run missions only when readiness is high — success chance rises with readiness and falls with difficulty, and a failed mission costs 5-25 killed",
      "20 droid types fill civic, construction and military roles; they need no rations but draw power and maintenance",
    ],
  },
  {
    title: "LAW, ORDER & POLICIES",
    items: [
      "Set policies across Law Enforcement, Civil Rights, Health, Economy, and more",
      "Policies have trade-offs — strict law reduces crime but lowers happiness",
      "Issue edicts for temporary city-wide effects (curfews, rationing, celebrations)",
      "Monitor crime, unrest, corruption, and happiness on the Overview screen",
      "Commander reputation system tracks your ruling style across 5 axes",
      "Enforcement runs from Patrol Judges and cadets up to Senior Judges and Elite Strike Teams, backed by riot units, drones, and surveillance",
      "46+ edicts are one-time orders with a cost, duration, and cooldown; several can stack at once (curfew, martial law, tax holiday, emergency rations)",
      "50 named gangs across five types fight for territory at threat levels 1-5; unchecked, they drive up crime and unrest",
      "Prisons hold offenders — Iso-Cube blocks (1,500 each) and Mega-Prison complexes (8,000 each); overcrowding sparks riots",
      "Crime rises fastest when Law & Order is low and unrest is high, so pair enforcement with rising happiness",
    ],
  },
  {
    title: "SEASONS & WEATHER",
    items: [
      "The wasteland cycles through seasons and weather that hit each tick: dust storms, acid rain, solar flares, and radiation seasons, plus rare quiet and growth seasons",
      "Hazards cost happiness, food, health, or infrastructure; growth season boosts agriculture and biosphere recovery",
      "Plan major operations around the forecast — the tick report shows the active weather and its effects",
    ],
  },
  {
    title: "MEDICAL & HEALTHCARE",
    items: [
      "30 illnesses each have their own treatments; public health above 70 boosts growth, below 40 brings outbreaks and decline",
      "Clean water, waste processing, and good food quality prevent epidemics far better than treating them after the fact",
      "Medical supplies are tradeable — import them when local production falls short",
    ],
  },
  {
    title: "MEGA-PROJECTS",
    items: [
      "Massive city-defining construction projects with 3 phases: Planning, Construction, Operational",
      "Each project requires population, credits, steel, and specific technologies",
      "Costs scale with city size — projects in a 1.5M-population megacity cost up to 2.5x what they would in a small one (steel scales at half rate). The cost screen shows the scaled total before you commit",
      "Operational projects provide permanent city-wide bonuses",
      "Examples: Orbital Tether, Neural Collective, Quantum Computing Hub, Titan Forge",
      "Only one project can be in planning/construction at a time",
      "Each phase runs many ticks with ongoing construction-crew costs — never start one you cannot afford to finish",
    ],
  },
  {
    title: "WILDLANDS ECOLOGY",
    items: [
      "Behind the Biosphere stat sits a living food web on the WILDLANDS screen — flora, herbivores, predators, vermin, megafauna, and scavengers",
      "If flora drops below roughly 25%, or populations swing too hard in a single tick, the ecosystem collapses, firing events and dragging biosphere down",
      "A vermin overrun can spark a zoonotic outbreak that medicine alone cannot fully stop until the ecology is rebalanced",
      "Hunt apex fauna such as the Glow Boar, Acid Eel, and Split Jaw for wild meat, pelts and tusks, or send Wranglers to tame and uplift live specimens",
    ],
  },
  {
    title: "RELIGION & FAITHS",
    items: [
      "Eight faiths drift across districts by category affinity — including The Eternal Flame (energy and research), The Machine Choir (industrial and transport), The Ancestor Cult (slums and wasteland), and Catholicism (housing, medical, and government)",
      "Set each faith to SPONSOR, TOLERATE, or SUPPRESS — sponsoring lifts happiness and loyalty but adds corruption; suppressing raises law and order but stokes unrest",
      "Adopt one faith as your Leader Cult for unique events; renouncing it triggers a cooldown, and other factions notice your choice",
      "The Reliquary See is a separate theocratic faction (see FACTIONS), not one of the three drifting faiths",
    ],
  },
  {
    title: "EVENTS & ACHIEVEMENTS",
    items: [
      "Random events occur each tick — disasters, opportunities, faction incidents",
      "Events require choices with meaningful consequences",
      "Some events chain together into multi-stage arcs",
      "400+ achievements track milestones across all saves",
      "Achievement categories: Economy, Military, Atrocity, Civil Rights, and more",
      "Weekly Challenges on the Goals screen refresh each real-world week and stay fixed per week and save slot — completing one pays credits and research points",
    ],
  },
  {
    title: "WORLD MAP",
    items: [
      "Set on the post-collapse Americas — real coastlines redrawn by climate shift",
      "200+ locations across North America: megacities, townships, ruins, resource sites",
      "14 starting regions to pick from at New Game — preset spawn zones, each with its own faction terrain and bonuses",
      "Route connections show danger levels: SAFE, CONTESTED, HOSTILE, UNKNOWN",
      "World events reveal hidden locations and trigger discoveries",
      "Tap a route on the map for an OPERATIONS panel showing zones along the path, plus a FORECAST line warning of next-season hazards on that corridor",
      "Tap or hover terrain features (coasts, ranges, dunes, craters, dead rivers) to inspect them — every inspection is logged to the WASTELAND ATLAS in COMMAND MENUS",
      "Trade routes connect you to other megacities for commerce",
      "South America is drawn on the map but reserved for future content (labeled UNDER DEVELOPMENT in-world)",
      "Routes carry safety ratings that scale travel cost — Safe 1x, Contested 2x, Unknown 2.5x, Hostile 3x — and labels show distance and credit cost",
      "Environmental hazards (radiation storms, dust clouds, acid rain, EM fields, ashfall, toxic fog) blanket zones at low, medium, or high intensity",
      "Launch wasteland expeditions — salvage, recon, artifact retrieval, rescue — where success falls with danger and rises with your defense rating",
    ],
  },
  {
    title: "PRESTIGE & REBIRTH",
    items: [
      "Once your city reaches a certain level, you can Rebirth for permanent bonuses",
      "Prestige bonuses carry across all future cities",
      "Each rebirth makes your next city stronger from the start",
      "Legacy bonuses follow five paths — Industrial, Military, Economic, Scientific, and Political — each with ten levels",
      "Prestige is optional; you can keep a single city running for in-game decades instead",
    ],
  },
  {
    title: "CYBERNETICS",
    items: [
      "Open the CYBERNETICS DIVISION screen to manage the implant registry and your augmentation facilities",
      "Implants span 10 categories (limb, vision, neural, military, industrial, medical and more) across 5 rarity tiers, from Common to Prototype",
      "Install augments to boost stats and unlock tactical abilities like active camo, HUD overlays, and specialised industrial or medical labour",
      "Implant prices vary by rarity; review the live upfront cost before installation. Extreme conversion frames also carry a risk of cyberpsychosis",
      "Build the supporting facilities — Augmentation Clinics, Neural Research Labs, Nano-Fab Labs — to manufacture and fit hardware",
      "Cybernetics research on the tech tree unlocks higher tiers over time",
    ],
  },
  {
    title: "THE COMMANDER",
    items: [
      "You are a character with your own sheet in the Dossier — five attributes (Authority, Intelligence, Charisma, Combat, Endurance) shape what you are good at",
      "Spend earned skill points across twelve skills: leadership, tactics, administration, investigation, intimidation, diplomacy, engineering, medicine, logistics, surveillance, propaganda, and black ops",
      "Install personal augments across ten categories to raise attributes and open new event options — this is separate from the city cybernetics industry",
      "Five reputation axes (Mercy, Fear, Transparency, Populism, Stability) remember your rule and gate certain decrees — there is no single correct profile",
    ],
  },
  {
    title: "PROPAGANDA & INFORMATION CONTROL",
    items: [
      "The Propaganda screen frames reality for the city through five outlets: the Ministry of Truth, the City Herald, the Public Netcast, the Voice of the People, and the Guard Bulletin",
      "Pick a tone — triumphant, reassuring, warning, rallying, or somber — and the feed is authored live from your real stats",
      "Propaganda spins perception; for mechanical control of information (surveillance, banned content, enforced ideology) pair it with the Big Brother addon",
    ],
  },
  {
    title: "BLACK MARKET",
    items: [
      "Reach the underground economy from the BLACK MARKET screen, with Market, Contraband, Spy Ops, Intel and Audit tabs",
      "Trade in illegal goods — unregistered weapons, stimulants, stolen tech, biological mutations — each deal showing a risk level",
      "Stockpile high-value contraband (alien artifacts, counterfeit currency) that pays well but is punished hard if seized",
      "Special items can sharply cut crime or unrest, at a cost to law and order",
      "Every deal risks exposure — getting caught triggers investigations and raises corruption",
      "Use Spy Ops and Intel to run clandestine operations away from official oversight",
      "Fast and lucrative but corrosive — keep the black market at the bottom of your credit-generation hierarchy and use it sparingly",
    ],
  },
  {
    title: "CONTRACTS & AUTO-BUILD",
    items: [
      "Rather than build everything yourself, award Contracts to outside firms — Atlas Structural Systems, MegaBuild Corp, Shadow Works Ltd, Civic Services Division — for construction, utility, security, or industrial work",
      "Each contractor weighs an up-front cost against a recurring per-tick cost, with its own reputation, reliability, speed, and corruption risk — cheap shady firms move fast but bleed corruption",
      "Auto-Construction can spend a set budget each tick on your priority categories, scaling the city without micromanaging every building",
    ],
  },
  {
    title: "ADVISOR BRIEFINGS & AUTO-MANAGERS",
    items: [
      "The ADVISOR BRIEFINGS screen (MORE) delegates routine work across eight domains, each set to OFF, SUGGEST, or ACT",
      "Domains cover recruiting, research, intelligence, espionage, agriculture, trade, military supply, and edicts — each needs its matching Inner Circle role appointed to do anything",
      "Pause All ACT downgrades every domain to SUGGEST before a risky move; Honor Mode locks everything to SUGGEST for full manual control",
      "Start domains at SUGGEST, watch what they propose for a few ticks, then promote the trustworthy ones to ACT",
    ],
  },
  {
    title: "MINING",
    items: [
      "Manage extraction from the MINING screen — Sites, Fleet and Crew, and active policies",
      "Establish mining sites by paying setup costs, then run them for raw minerals like gas, oil, iron and rare earths",
      "Assign vehicles (excavators, bore mechs) and specialist crew (blasters, geologists) to raise output",
      "Survey a site after reviewing its live upfront cost to reveal rich veins, ancient tech caches, or hazardous faults",
      "Sites carry ongoing wages and environmental risks — toxic leaks and cave-ins can halt production",
      "Optimise yields with policies such as the Deep Bore Protocol; output feeds your supply chains",
    ],
  },
  {
    title: "SCAVENGING",
    items: [
      "Launch wasteland expeditions from the SCAVENGING & RECLAMATION screen via the Zones tab",
      "Missions run in four phases — Scout, Scavenge, Excavate, Reclaim — with different durations, danger levels and team sizes",
      "Recover randomised loot: steel, fuel, artifacts, rare items, and sometimes new troop recruits",
      "Higher-danger zones (anomalies can reach 80% danger) risk casualties for a bigger payoff",
      "Build support structures like Salvage Yards and Field Hospitals to improve loot quality and cut losses",
    ],
  },
  {
    title: "SUPPLY CHAINS",
    items: [
      "Follow production on the ECONOMY screen under the Stockpile tab",
      "Goods are made in tiers: extraction (ore), refining (ingots), manufacturing (parts), then advanced products (AI cores)",
      "Each step needs the right buildings (foundries, plants) and assigned worker teams, and converts inputs automatically each tick",
      "Production consumes raw inputs, power and wages — shortfalls in consumer goods make happiness fall fast",
      "Supply chains feed everything else: steel for construction, ammo for the military, finished goods for trade",
      "160+ production recipes flow through those tiers — for example iron ore mine to foundry to steel mill to vehicle assembly — and every building in the chain must be operational",
    ],
  },
  {
    title: "SPACE COMMAND",
    items: [
      "Late-game orbital operations unlock at Tier 4-5 research: satellite deployment, orbital strikes, a space station, fleet operations, and off-world colonies",
      "Orbital strikes are devastating but politically costly; colonies and zero-G facilities add research and off-world resources",
    ],
  },
  {
    title: "ADDONS & EXPANSION PACKS",
    items: [
      "Two large content addons are built in and always active, folded into the existing Research, Law and Construction screens",
      "BIG BROTHER — a surveillance and ideological-control pack adding control bureaus, a Simpletalk language mandate and Wrongthink laws that cut crime and unrest at the cost of happiness",
      "THE SIXTH DAY — a bio-science pack with 180+ technologies across DNA Science, Genetics and Cloning, plus cloning facilities and clone citizens",
      "Addons bring their own edicts (for example Big Brother's The Great Purge or Sixth Day's Mass Cloning Order) and, under Big Brother, new citizen psychologies",
      "Extreme social engineering brings powerful benefits but steep happiness and unrest penalties",
      "Big Brother generates Surveillance Points and tracks banned content — heavy surveillance cuts crime and unrest but builds a brittle, resentful compliance",
      "Sixth Day clones are tracked separately from natural population; cloned organs supplement medical supplies, and clone labour is cheap but carries ethical costs",
    ],
  },
  {
    title: "CONTROLS & HOTKEYS",
    items: [
      "Desktop and Steam play with mouse and keyboard; mobile is full touch, and every shortcut has an on-screen equivalent",
      "Top navigation: 1 CITY, 2 LAW, 3 ECONOMY, 4 MAP, 5 BUILD, 6 DIPLO, 7 MORE",
      "Quick bar: Q Inbox, W Research, E Military, R Factions, T Events, Y Wildlands, U Dossier",
      "Game controls: Space pauses, + and - change speed, F fullscreen, H photo mode, Ctrl+S quick save, Esc returns to City, and ? opens the shortcut overlay",
      "On the world map, scroll to zoom, drag to pan, and right-click for a context menu",
    ],
  },
  {
    title: "PLAY MODES: REAL-TIME & TURN-BASED",
    items: [
      "At city creation you pick Real-Time or Turn-Based; the choice is permanent for that save and each slot keeps its own mode",
      "Real-Time runs on its own clock — ticks advance and crises land whether or not you are watching, and the city lives on while you are away",
      "Turn-Based freezes until you press END TURN, which runs one full day (4 ticks) and hands you a recap; nothing happens without your sign-off",
      "Crises interrupt a turn so you can respond, and a brand-new turn-based city is safe from a first-turn ambush",
      "Everything else — stats, buildings, factions, formulas — is identical in both modes; only the flow of time changes",
    ],
  },
  {
    title: "WIN CONDITIONS & END STATES",
    items: [
      "There is no single victory screen — the engine tracks four end states",
      "ACTIVE: the city lives and you keep playing",
      "CITY FALLEN: biological population and housing both reach zero — game over",
      "MACHINE ASCENSION: the citizens are gone but droids and the automaton substrate persist (needs Mind Upload, Consciousness Transfer, and Automaton Civilization tech)",
      "BIOLOGICAL PERPETUATION: engineered lineages and clone populations carry the city forward (needs Perpetual Biogenesis tech)",
    ],
  },
  {
    title: "TROUBLESHOOTING",
    items: [
      "Save will not load or reads corrupted: restore a backup from MORE, Save Slots, Restore Backup — a rolling backup is kept per slot",
      "Game feels slow or the device runs hot: lower the tick speed in Options, or set Offline Sim Depth to LITE",
      "Steam achievements not unlocking: they sync at end of tick, so let one tick pass to catch up any missed unlocks",
      "Missed why an officer or faction changed: EVENTS & REPORTS logs every officer firing and faction shift",
      "An Auto-Manager does nothing: confirm its Inner Circle role is appointed and the domain is set to SUGGEST or ACT, not OFF",
    ],
  },
  {
    title: "TIPS FOR NEW COMMANDERS",
    color: "info",
    items: [
      "Prioritize food, water, and power first — everything else depends on them",
      "Don't expand too fast — population growth without housing causes pressure",
      "Keep crime below 30 and unrest below 40 to avoid spiraling instability",
      "Research is your long-term advantage — invest in labs early",
      "Monitor the Overview warnings — they tell you exactly what needs attention",
      "Save often to multiple slots — six slots are available, each with a custom label and relative timestamp on its card",
      "Check your profit-and-loss every 10 ticks and keep at least three faction loyalties above 65",
      "Readiness beats raw numbers — only send the army out above 70% readiness, and keep fuel stocked",
      "Every choice has trade-offs. There are no perfect solutions — only your solutions",
    ],
  },
];

export const MANUAL_OUTRO =
  "This manual now consolidates the full field operations reference and will keep growing alongside MEGACITY. Everything here is subject to change as the game develops. The city never sleeps, Commander. Neither should you.";
