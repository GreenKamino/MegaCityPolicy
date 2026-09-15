export type ContractorPersonality = {
  attitude: string;
  greeting: string;
  onHire: string;
  onDelay: string;
  onComplete: string;
};

export const CONTRACTOR_PERSONALITIES: Record<string, ContractorPersonality> = {
  "atlas-structural": {
    attitude: "Professional, methodical, slightly condescending about other firms' work",
    greeting: "Atlas Structural. We build things that stay built. Unlike some.",
    onHire: "We'll get it done right. Not fast, not cheap — right. You'll appreciate the difference in twenty years.",
    onDelay: "Quality takes time. The foundation work required additional reinforcement. You're welcome.",
    onComplete: "Delivered to spec, as always. The structural engineers signed off without a single complaint. That's our standard.",
  },
  "megabuild-corp": {
    attitude: "Aggressive, fast-talking, always upselling, slightly shady",
    greeting: "MegaBuild! Fastest builds in the sector. Don't ask how. Just enjoy the results.",
    onHire: "You won't find anyone faster. Or cheaper. We'll have your project up before the permits are even filed.",
    onDelay: "Minor hiccup. Some load-bearing walls needed... recalibration. We'll make up the time. Probably.",
    onComplete: "Done! Ahead of schedule, under budget. The cracks are cosmetic. Mostly.",
  },
  "ironworks-heavy": {
    attitude: "Gruff, no-nonsense, takes pride in heavy industrial work",
    greeting: "Ironworks. We bend steel. We pour concrete. We don't do polite conversation.",
    onHire: "Good contract. We'll need clear access and nobody asking questions about the noise levels.",
    onDelay: "Material shipment held up at the border. Foundry work doesn't run on wishful thinking.",
    onComplete: "Job's done. Solid as the day it was poured. The machinery's calibrated and the floor can hold a tank. Don't test that.",
  },
  "rapid-response-eng": {
    attitude: "Hyperactive, proud of speed, dismissive of safety concerns",
    greeting: "RRE here! If you needed it yesterday, we're your people. Coffee? No time. Let's GO.",
    onHire: "Crew's already en route. We'll have boots on site before you finish reading this contract.",
    onDelay: "Slight setback — nothing we can't power through. Sleep is for people without deadlines.",
    onComplete: "DONE! Record time. Don't look too closely at the welds. They'll settle. Trust us.",
  },
  "shadow-works": {
    attitude: "Cryptic, evasive, speaks in euphemisms about everything",
    greeting: "Shadow Works. We handle... situations. Discreetly. Your call never happened.",
    onHire: "The project will proceed through appropriate channels. Which channels? The appropriate ones.",
    onDelay: "There have been... complications of a sensitive nature. Best not discussed in writing.",
    onComplete: "The matter has been resolved. No further documentation will be provided. You're welcome.",
  },
  "civic-services-div": {
    attitude: "Bureaucratic, earnest, genuinely cares about public welfare",
    greeting: "Civic Services Division. We serve the citizens. All paperwork properly filed.",
    onHire: "We're honored to support the city's initiative. Our team has been briefed and Form 27-B has been submitted.",
    onDelay: "The oversight committee requested additional environmental impact reviews. Compliance takes time, as the regulations require.",
    onComplete: "Project complete and fully documented. Public satisfaction surveys show a 3% improvement. We consider that a triumph.",
  },
  "titan-utilities": {
    attitude: "Steady, reliable, obsessed with grid stability metrics",
    greeting: "Titan Utilities. Keeping the lights on since the reconstruction. Literally.",
    onHire: "We'll integrate with the existing grid architecture. Minimal disruption. That's the Titan promise.",
    onDelay: "Grid harmonics required additional balancing. You can't rush electricity. It has opinions.",
    onComplete: "Systems online and stable. Power factor corrected. Grid efficiency up 2.3%. The numbers don't lie.",
  },
  "sector-defense-sys": {
    attitude: "Military-formal, precise, slightly paranoid about security",
    greeting: "Sector Defense Systems. Perimeter security is not optional. It's survival.",
    onHire: "Contract acknowledged. Security protocols active. All personnel cleared at Sigma level.",
    onDelay: "Threat assessment required recalibration of defensive parameters. Better safe than breached.",
    onComplete: "Installation secure. All systems armed. Response time within acceptable parameters. Stay vigilant.",
  },
  "genesis-build": {
    attitude: "Artistic, perfectionist, slightly pretentious about architecture",
    greeting: "Genesis Build Group. We don't just construct buildings. We create statements.",
    onHire: "Our design team is already envisioning something... extraordinary. Function AND form. Always both.",
    onDelay: "The acoustics of the atrium required redesign. You'll thank us when you hear the silence.",
    onComplete: "A masterwork. The structural poetry speaks for itself. Award submissions are already in progress.",
  },
  "freighthub-logistics": {
    attitude: "Practical, numbers-focused, always talking about supply chains",
    greeting: "FreightHub. Point A to Point B, no drama, no delays. Well, minimal delays.",
    onHire: "Routing optimized. Manifests prepared. Our trucks are fueled and our drivers are caffeinated.",
    onDelay: "Route 7 is backed up. We're rerouting through Sector 4. ETA revised. Slightly.",
    onComplete: "All deliveries confirmed. Shrinkage within acceptable parameters. The supply chain holds.",
  },
  "medicore-health": {
    attitude: "Calm, clinical, deeply serious about health standards",
    greeting: "MediCore Health Systems. Lives depend on what we build. We never forget that.",
    onHire: "Sterilization protocols initiated. Our medical engineers are the best in the sector. This will be flawless.",
    onDelay: "Contamination protocol triggered during installation. We don't cut corners with medical infrastructure.",
    onComplete: "Facility operational. All systems calibrated to WHO-M standards. First patients can be admitted immediately.",
  },
  "darksite-ops": {
    attitude: "Cold, menacing, treats everything as classified",
    greeting: "You don't know our name. We don't have a name. What do you need?",
    onHire: "Personnel deployed. Location secured. This conversation is already being forgotten.",
    onDelay: "Operational complications. The kind you don't ask about. The kind we handle.",
    onComplete: "Objective complete. Evidence sanitized. Your involvement in this matter is officially non-existent.",
  },
  "municipal-works": {
    attitude: "Slow, dependable, talks about budgets constantly",
    greeting: "Municipal Works Bureau. Government rates, government speed. But we get it done right.",
    onHire: "Budget allocated. Crew assigned. We'll begin as soon as the paperwork clears. Which is a process.",
    onDelay: "The union requires scheduled rest periods. And the permits office is backed up. As always.",
    onComplete: "Project delivered under budget. That's taxpayer credits saved. We take pride in that.",
  },
  "steelcrown-mfg": {
    attitude: "Blue-collar proud, talks about output metrics",
    greeting: "SteelCrown. We make things. Real things. Things you can hit with a hammer and they don't break.",
    onHire: "Assembly lines reconfigured. Raw materials inbound. We'll have product rolling out in no time.",
    onDelay: "Supplier quality issue. We don't ship substandard product. Our name is on every unit.",
    onComplete: "Production run complete. Quality verified. Every unit stamped with the SteelCrown mark. That means something.",
  },
  "aqua-systems": {
    attitude: "Passionate about water, evangelistic about conservation",
    greeting: "Aqua Systems. Water is civilization. Without us, this city is dust in a week.",
    onHire: "Hydrological survey complete. Flow rates calculated. We'll have clean water moving through those pipes on schedule.",
    onDelay: "Aquifer pressure readings were off. We don't gamble with water supply. Recalibrating.",
    onComplete: "Water flows. Clean, pressurized, and properly treated. Every drop accounted for. That's the Aqua Systems guarantee.",
  },
  "voltex-energy": {
    attitude: "Enthusiastic about energy tech, always talking about watts",
    greeting: "Voltex Energy. We make electrons move in the right direction. It's more complicated than it sounds.",
    onHire: "Power infrastructure analysis complete. We've identified optimal placement for maximum grid benefit.",
    onDelay: "Harmonic interference from adjacent sectors. Resolving. You can't argue with physics.",
    onComplete: "Online and generating. Grid capacity increased. The lights stay on tonight. And every night after.",
  },
  "hab-solutions": {
    attitude: "Efficient, slightly cynical about housing quality, pragmatic",
    greeting: "Hab Solutions. Housing for the masses. Affordable, functional, and only slightly depressing.",
    onHire: "Prefab modules ordered. Foundation work begins tomorrow. These won't win design awards, but people will have roofs.",
    onDelay: "Ventilation specs needed revision. Turns out people need to breathe. Who knew.",
    onComplete: "Units complete. Keys distributed. The tenants are moving in. It's not luxury, but it's home. That matters.",
  },
  "reclamation-eng": {
    attitude: "Practical, sees beauty in demolition, environmentally conscious",
    greeting: "Reclamation Engineering. We tear down what's broken and build something better from the rubble.",
    onHire: "Demo crew is ready. Salvage teams on standby. We'll recover 60% of the materials. Nothing wasted.",
    onDelay: "Found structural contamination in the sub-levels. Remediation required before we can proceed safely.",
    onComplete: "Site cleared, rehabilitated, and rebuilt. The neighborhood doesn't recognize itself. That's the point.",
  },
  "nexus-tech": {
    attitude: "Tech-obsessed, speaks in acronyms, always ahead of the curve",
    greeting: "Nexus Tech. If it processes data, we built it. If it doesn't yet, we're working on it.",
    onHire: "Architecture mapped. Neural pathways optimized. Our AI systems will integrate seamlessly with your existing grid.",
    onDelay: "Machine learning models required additional training data. The AI needs to understand your city before it can protect it.",
    onComplete: "Systems live. Processing capacity exceeded projections by 18%. The data flows. The city watches. Knowledge is power.",
  },
  "penal-labor-corps": {
    attitude: "Uncomfortable, defensive, technically legal about everything",
    greeting: "Penal Labor Corps. Rehabilitation through productive work. That's the official position.",
    onHire: "Labor crews assigned. Supervision protocols activated. All workers are... voluntary participants. Technically.",
    onDelay: "Work stoppage due to... morale issues. Additional supervisory personnel deployed.",
    onComplete: "Project complete. Workers returned to correctional facilities. Rehabilitation metrics show... improvement. On paper.",
  },
  "overwatch-sec": {
    attitude: "Taciturn, professional, speaks like a military briefing",
    greeting: "Overwatch Security. We see everything. We secure everything. That's not a slogan. That's a warning.",
    onHire: "Site survey complete. Threat vectors identified. Installation teams deploying at 0600.",
    onDelay: "Counter-surveillance measures detected hostile monitoring. Securing the perimeter before proceeding.",
    onComplete: "All systems operational. Coverage: 100%. Blind spots: zero. The asset is secure.",
  },
  "greenzone-env": {
    attitude: "Earnest, environmentally passionate, slightly preachy",
    greeting: "GreenZone Environmental. Someone has to care about what we're breathing. That's us.",
    onHire: "Environmental impact assessment complete. We'll restore this site to livable standards. The city deserves clean air.",
    onDelay: "Soil remediation taking longer than projected. Toxin levels were... higher than anyone admitted.",
    onComplete: "Site restored. Air quality up, toxin levels down, and the local ecosystem is showing signs of recovery. Good work matters.",
  },
  "fortis-defense": {
    attitude: "Hard-line military, thinks everything should be fortified",
    greeting: "Fortis Defense. If it can't stop a direct hit, it's not a building. It's a suggestion.",
    onHire: "Engineering team mobilized. Blast-rated materials secured. We build walls that laugh at artillery.",
    onDelay: "Ballistic testing revealed vulnerabilities in the northern face. Reinforcing. We don't build anything that breaks.",
    onComplete: "Fortification complete. Rated for sustained bombardment. The enemy will need to think of something else. Good luck to them.",
  },
  "nutrisynth": {
    attitude: "Cheerfully corporate, avoids questions about ingredients",
    greeting: "NutriSynth! Feeding the future, one protein unit at a time. Don't ask what's in it. Just enjoy!",
    onHire: "Production vats are heating up! Our bio-engineers are calibrating flavor profiles. Well, 'flavor' profiles.",
    onDelay: "Batch contamination required a full vat purge. Food safety first! Even if the food is... loosely defined.",
    onComplete: "Production online! Thousands of nutrition-complete meal units rolling off the line daily. Taste tests were... inconclusive. But nutritious!",
  },
  "crisis-logistics": {
    attitude: "Frantic, adrenaline-fueled, lives for the emergency",
    greeting: "Crisis Logistics! Is it on fire? Flooded? Collapsing? PERFECT. That's where we do our best work.",
    onHire: "CREWS DEPLOYED! Equipment rolling! We don't wait for the situation to stabilize — we ARE the stabilization!",
    onDelay: "Secondary crisis at a neighboring site pulled resources. We're back. We're ALWAYS back.",
    onComplete: "Crisis contained! Situation stabilized! We're already packing up for the next disaster. There's always a next one.",
  },
};

export function getContractorPersonality(contractorId: string): ContractorPersonality | undefined {
  return CONTRACTOR_PERSONALITIES[contractorId];
}

export const CONTRACT_COMPLETION_FLAVOR: Record<string, string[]> = {
  construction: [
    "The scaffolding is down, the dust has settled, and it only went 12% over budget. Call that a win.",
    "Final inspection passed. The structural engineers signed off with only minor complaints about load-bearing corners being cut.",
    "Construction complete. The workers have moved on to the next site. The building remains. Probably for decades.",
    "Ribbon-cutting ceremony scheduled. The foreman says it's the best work they've done this quarter. The foreman says that every quarter.",
    "Project delivered. The architect called it 'functional brutalism.' The residents call it 'home.' Close enough.",
    "Built on time, within acceptable tolerances. The contractors are already bidding on the next one.",
    "Another block rises from the concrete. The skyline shifts again. The city grows whether anyone asked it to or not.",
  ],
  utility: [
    "Systems online. Green lights across the board. The engineers are cautiously optimistic, which is their version of ecstatic.",
    "Infrastructure upgrade complete. Capacity increased. The maintenance team has already found three things to worry about.",
    "New systems integrated into the grid. The old ones were decommissioned with a ceremony nobody attended.",
    "Operational and within spec. The utility workers celebrated with overtime. Someone has to monitor the monitors.",
    "Pipes connected. Valves tested. Pressure holding. The city's plumbing grows more complex and more critical by the day.",
    "Grid expansion complete. The power doesn't know it's new. It flows the same as always. That's the whole point.",
  ],
  supply: [
    "Shipment received and inventoried. The warehouse crew says everything's accounted for. The warehouse crew always says that.",
    "Supply chain established. Deliveries on schedule. The logistics team finally looks relaxed. It won't last.",
    "Contract fulfilled. Goods received, stored, and distributed. The paperwork alone weighs more than some of the shipments.",
    "All deliveries confirmed. The supplier wants to discuss renewal terms. They smell repeat business.",
    "Stockpiles replenished. The quartermasters are satisfied for now. Give it a week.",
    "Materials secured and catalogued. The supply clerk filed it under 'adequately procured.' High praise.",
  ],
  industrial: [
    "The machines are running. Output metrics climbing. The factory floor smells like progress and burning lubricant.",
    "Production lines operational. The quality inspectors have given their grudging approval.",
    "Industrial capacity expanded. The city's manufacturing output just ticked up. The workers' smoke breaks did not.",
    "Facility online. First batch already rolling off the line. It's not pretty, but it works.",
    "Construction complete. The factory hums with purpose. The neighboring districts hum with vibrations they're learning to ignore.",
    "Industrial project delivered. Employment up, pollution up, complaints up. The trifecta of progress.",
  ],
  civic: [
    "Doors open to the public. The citizens seem... cautiously appreciative. That's basically a standing ovation around here.",
    "Civic project complete. Public satisfaction surveys show improvement. The margin of error is larger than the improvement, but still.",
    "Another public service facility operational. The bureaucrats are already arguing about who manages it.",
    "Grand opening went smoothly. Only two complaints filed before noon. That's a record.",
    "Service delivery begins. The queues are long but orderly. The staff are trained. The coffee machine works. Civilization endures.",
    "Civic infrastructure expanded. The city gets marginally more livable. Citizens adjust their expectations marginally upward.",
  ],
  security: [
    "Facility operational. Security personnel deployed. Crime in the immediate area has dropped. Crime elsewhere has opinions about that.",
    "Defense systems online. Test protocols complete. The things that should beep are beeping. The things that shouldn't aren't.",
    "Security infrastructure hardened. The bad actors will adapt. But for now, the city sleeps slightly easier.",
    "Installation complete. The surveillance coverage has improved by 15%. Privacy coverage has decreased by roughly the same.",
    "Fortifications in place. The perimeter is stronger. The question of what we're keeping out — or in — remains unasked.",
    "Security upgrade complete. The officers are satisfied. The criminals are recalculating. The citizens are somewhere in between.",
  ],
  emergency: [
    "Crisis averted. Or at least postponed. The emergency crews are standing down but keeping their boots on.",
    "Emergency response complete. The situation is stabilized. The paperwork for the after-action report has just begun.",
    "Damage contained. Recovery underway. The responders did good work under terrible conditions. Buy them a drink.",
    "Emergency resolved. The city breathes again. Until next time. There's always a next time.",
    "Rapid deployment successful. The crisis teams earned their hazard pay today. Every credit of it.",
  ],
  blackBudget: [
    "Project complete. The records have been... appropriately filed. No further questions are anticipated or welcome.",
    "Objective achieved through channels that will not be discussed in this report. Or any report.",
    "The operation concluded successfully. The participants have been reassigned. The evidence has been managed.",
    "Black budget project delivered. The official line is that nothing happened. The results suggest otherwise.",
    "Classified project complete. Cost overruns have been absorbed into the general infrastructure budget. Nobody will notice.",
    "Done. What was done? Nothing, officially. But the city's problems just got slightly more manageable through means best left unexamined.",
  ],
};

export function getCompletionFlavor(category: string): string {
  const lines = CONTRACT_COMPLETION_FLAVOR[category] ?? CONTRACT_COMPLETION_FLAVOR.construction;
  return lines[Math.floor(Math.random() * lines.length)];
}
