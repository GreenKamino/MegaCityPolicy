import type { InnerCircleRole } from "./innerCircleData";

export type CommandEffect = Partial<{
  loyalty: number;
  competence: number;
  corruption: number;
  credits: number;
  unrest: number;
  happiness: number;
  lawOrder: number;
  defenseRating: number;
  research: number;
}>;

export type CommandChoice = {
  id: string;
  label: string;
  text: string;
  effects: CommandEffect;
  response: string;
};

export type CommandTopic = {
  id: string;
  title: string;
  opening: string;
  choices: CommandChoice[];
};

export type CommandConversation = {
  roleId: InnerCircleRole;
  topics: CommandTopic[];
};

export const COMMAND_DIALOGUES: CommandConversation[] = [
  {
    roleId: "chief_advisor",
    topics: [
      {
        id: "ca_counsel",
        title: "COUNSEL OF THE ADVISOR",
        opening: "Your Chief Advisor closes the heavy door and engages the scrambler. The faint buzz of white noise fills the room. \"Commander, we have a window — perhaps forty-eight hours — before the situation in the outer sectors becomes unrecoverable.\" They spread data-sheets across the desk with practised hands. \"Three factions are circling. The treasury is bleeding. And your approval ratings in the industrial blocks have dropped below the threshold where people start building barricades.\" They look up. \"I can give you three options. None of them are good. But one of them is survivable.\"",
        choices: [
          {
            id: "ca_counsel_listen",
            label: "\"Give me all three. I want to choose with open eyes.\"",
            text: "Give me all three. I want to choose with open eyes.",
            effects: { loyalty: 5, competence: 2, corruption: -1 },
            response: "\"Open eyes. Good.\" They tap the first data-sheet. \"Option one: negotiate. We concede the outer perimeter trade routes to the strongest faction. Buys time, costs revenue. Option two: crackdown. Martial enforcement in the industrial blocks. Stops the bleeding but risks open revolt. Option three...\" They pause. \"We leak information that two of the factions are conspiring against the third. Turn them on each other while we consolidate.\" They fold their hands. \"Option three is the most effective. It's also the most morally questionable. But I didn't take this job to make you feel comfortable, Commander. I took it to keep you in power.\"",
          },
          {
            id: "ca_counsel_trust",
            label: "\"You know this city better than anyone. What would you do?\"",
            text: "You know this city better than anyone. What would you do?",
            effects: { loyalty: 8, competence: 3, credits: -2000 },
            response: "Something flickers across their face — surprise, perhaps, or the memory of a time when someone last asked their opinion instead of demanding results. \"What would I do?\" They sit back. \"I'd do something you won't like. I'd give ground. Voluntarily. Cede the three most contested blocks to civilian governance — elected councils, community policing, local trade authority.\" They raise a hand before you can object. \"It looks like weakness. It feels like weakness. But it removes the pressure valve. The factions lose their recruitment pitch when people have a voice.\" They lean forward. \"Commander — the strongest leaders aren't the ones who hold everything. They're the ones who know what to release.\"",
          },
          {
            id: "ca_counsel_decisive",
            label: "\"I don't need options. I need you to fix it. Whatever it takes.\"",
            text: "I don't need options. I need you to fix it. Whatever it takes.",
            effects: { loyalty: 2, corruption: 2, unrest: -3, lawOrder: 2 },
            response: "Their expression doesn't change. That's how you know they expected this answer. \"Whatever it takes. Understood.\" They collect the data-sheets — all three options becoming one. \"You won't want to know the details, Commander. Plausible deniability is a gift I give freely.\" They stand, smoothing their coat. \"By this time tomorrow, the outer sector situation will be resolved. The cost will appear as 'infrastructure maintenance' in the budget.\" At the door, they turn. \"One day, Commander, you'll ask me how I fixed something, and the answer will be something you can't unhear. I hope today isn't that day.\" The door closes. The scrambler cuts out. The silence is deafening.",
          },
        ],
      },
    ],
  },
  {
    roleId: "spymaster",
    topics: [
      {
        id: "spy_briefing",
        title: "INTELLIGENCE BRIEFING",
        opening: "The Spymaster doesn't sit. They never sit — something about maintaining exit readiness. \"Commander. I have something delicate.\" They produce a wafer-thin data chip, holding it between two fingers like a poisonous insect. \"One of your officers — I won't name them yet — has been meeting with a faction intermediary. Twice this month. The meetings happen in Block 19, a blind-spot in our surveillance grid. Which tells me they know exactly where our cameras are.\" They set the chip on your desk. \"The question isn't whether this person is betraying you. The question is whether they're doing it for money, for ideology, or because someone has leverage on them. Each possibility demands a very different response.\"",
        choices: [
          {
            id: "spy_briefing_name",
            label: "\"Name them. Now. I don't tolerate traitors in my command.\"",
            text: "Name them. Now. I don't tolerate traitors in my command.",
            effects: { loyalty: 3, lawOrder: 2, corruption: -2 },
            response: "\"Direct. I respect that.\" They don't flinch. \"It's your Deputy Infrastructure Commissioner. Seventeen years of service. Two commendations. Clean record — until six weeks ago.\" They lean against the wall. \"Before you order the arrest, consider: they have access to every utility grid in the city. Power, water, waste processing. If they know we know, they could shut down three sectors before we reach them.\" A thin smile. \"I suggest a softer approach. Let me feed them false information. We use the betrayal as a channel — control what they report, shape the faction's understanding of our capabilities. Turn a traitor into an unwitting double agent.\"",
          },
          {
            id: "spy_briefing_why",
            label: "\"Find out why first. People don't betray without reason.\"",
            text: "Find out why first. People don't betray without reason.",
            effects: { loyalty: 8, corruption: -1, happiness: 1 },
            response: "The Spymaster tilts their head — an almost imperceptible gesture of approval. \"You want the motive before the sentence. Unusual for a Commander.\" They retrieve the chip and tuck it away. \"I'll place a surveillance detail. Discreet — my best people. If this is coercion, we might be able to recover the officer and neutralise the leverage simultaneously.\" They pause at the corner of the room. \"Commander — in my experience, the most dangerous betrayals aren't born from greed or fear. They're born from disappointment. People who believed in something, and stopped believing.\" Their voice drops. \"Make sure your people have something to believe in. It's cheaper than surveillance.\"",
          },
          {
            id: "spy_briefing_bait",
            label: "\"Leave them in place. Feed them false intel. Let's go fishing.\"",
            text: "Leave them in place. Feed them false intel. Let's go fishing.",
            effects: { loyalty: 10, corruption: -2, defenseRating: 1 },
            response: "Now they smile — genuinely. It's unsettling. \"Commander, you have a gift for this work. That's either a compliment or a warning.\" They begin pacing — a habit that means they're planning. \"I'll construct three separate intelligence packages. Each one plausible. Each one containing a unique detail that can only trace back to one source. When the faction acts on the information, we'll know exactly what was passed and when.\" They stop pacing. \"Better yet — we can use the false intelligence to manipulate the faction's decisions. Make them commit resources to defending against a threat that doesn't exist, weakening their position for when we do move.\" A pause. \"You're going to be very good at this, Commander. That should probably worry both of us.\"",
          },
        ],
      },
    ],
  },
  {
    roleId: "war_marshal",
    topics: [
      {
        id: "wm_strategy",
        title: "WAR COUNCIL",
        opening: "The War Marshal has converted the briefing room into a tactical command centre. Holographic terrain maps hover over the table, casting blue light across their scarred face. \"Commander. I've run the simulations. Forty-seven scenarios, accounting for every known faction disposition, seasonal weather patterns, and supply line vulnerabilities.\" They sweep a hand through the hologram, zooming into the eastern perimeter. \"Every simulation converges on the same conclusion: we can hold the city for eighteen months. After that, attrition wins. Our ammunition reserves deplete, our personnel fatigue, and the factions — who have been fighting each other for generations — simply outlast us.\" They look at you steadily. \"Eighteen months. Unless we change the equation.\"",
        choices: [
          {
            id: "wm_strategy_offensive",
            label: "\"Then we don't play defence. Show me offensive options.\"",
            text: "Then we don't play defence. Show me offensive options.",
            effects: { loyalty: 8, defenseRating: 3, unrest: 1, credits: -8000 },
            response: "Their eyes light up — literally, the augmented one has a targeting laser that activates with excitement. \"Now you're talking my language.\" They manipulate the hologram with both hands. \"Strike option Alpha: a coordinated push into the disputed territories between two factions. We don't need to conquer — we need to disrupt. Destroy supply caches, interdict communication lines, force them to consolidate rather than expand.\" They zoom in on a mountain pass. \"Strike option Beta: seize the Crimson Pass. Control the pass, control sixty percent of overland trade. Every faction that wants to eat pays tribute to us.\" A wolfish grin. \"Defence wins battles, Commander. Offence wins wars.\"",
          },
          {
            id: "wm_strategy_allies",
            label: "\"We need allies. Which faction can we turn?\"",
            text: "We need allies. Which faction can we turn?",
            effects: { loyalty: 5, happiness: 1, defenseRating: 1 },
            response: "They grunt — not dismissively, but thoughtfully. \"Allies. The dirtiest word in military strategy.\" They highlight three faction territories on the hologram. \"The smaller factions are approachable. They're squeezed between the larger powers and running low on options.\" They tap one territory. \"This one — the border settlements — they have something we need: geographic depth. Let them fold into our defensive perimeter, and suddenly eighteen months becomes indefinite.\" They cross their arms. \"The cost? We share resources. We compromise on territorial ambitions. We treat them as equals rather than subjects.\" A pause. \"Can you do that, Commander? Can you share power to preserve it?\"",
          },
          {
            id: "wm_strategy_tech",
            label: "\"What about force multipliers? Technology that changes the math.\"",
            text: "What about force multipliers? Technology that changes the math.",
            effects: { loyalty: 5, research: 3, defenseRating: 2, credits: -5000 },
            response: "\"Technology.\" They nod slowly. \"The great equaliser.\" They pull up a secondary display — research prototypes, weapons systems, defensive platforms. \"Three projects in the pipeline could change everything. First: automated perimeter guns. Remove the human element from border defence. Second: drone swarm capability. A hundred autonomous units that can overwhelm any assault formation.\" They hesitate on the third. \"And... there's a theoretical project. Directed energy. A weapon that could neutralise an entire formation in seconds.\" Their voice drops. \"The problem with force multipliers, Commander, is that they work both ways. Whatever we build, eventually someone steals, copies, or surpasses it. Technology buys time. It doesn't buy victory.\"",
          },
        ],
      },
    ],
  },
  {
    roleId: "chancellor",
    topics: [
      {
        id: "chan_treasury",
        title: "STATE OF THE TREASURY",
        opening: "The Chancellor arrives with a stack of ledgers — actual paper ledgers, because they trust digital records about as much as they trust the factions. \"Commander. Sit down. This won't be pleasant.\" They spread the books open with the reverence of a priest handling scripture. \"Revenue is stable. That's the good news. The bad news is that expenditure has outpaced income for the third consecutive quarter. Your military spending alone accounts for forty percent of the budget.\" They peer over their spectacles. \"We are, to use a technical economic term, haemorrhaging credits. I have proposals. You will like none of them.\"",
        choices: [
          {
            id: "chan_treasury_cut",
            label: "\"Where do we cut? Give me the honest list.\"",
            text: "Where do we cut? Give me the honest list.",
            effects: { loyalty: 8, credits: 5000, happiness: -1 },
            response: "\"The honest list.\" They produce a separate sheet — handwritten, because even their staff shouldn't see this. \"Public entertainment: cut by sixty percent. Saves four thousand per tick. Infrastructure maintenance: defer non-critical repairs. Saves three thousand. Research funding: reduce to essential programs only.\" They look up. \"And the one you won't want to hear: reduce the officer corps by fifteen percent. Consolidate departments.\" They fold their hands. \"Every credit we save is a day we survive, Commander. The city doesn't need to be comfortable. It needs to be solvent. Comfort is a luxury that comes after the books balance.\"",
          },
          {
            id: "chan_treasury_revenue",
            label: "\"I don't want to cut. I want to grow revenue. How?\"",
            text: "I don't want to cut. I want to grow revenue. How?",
            effects: { loyalty: 5, credits: 3000, corruption: 1 },
            response: "A sigh — long-suffering, professional. \"Growth. Everyone wants growth. Nobody wants to pay for it.\" They flip to a different page. \"Three options. First: open new trade routes to the eastern settlements. High risk, high reward. Second: auction mineral rights in the outer zones. Quick cash, long-term loss. Third...\" They lower their voice. \"Legalise and tax the black market. The underground economy is vast, Commander. Bringing it into the light doesn't make it moral, but it makes it taxable.\" They close the ledger. \"Every option has consequences. Trade routes need military escorts — more spending. Mineral rights anger the environmentalists. And the black market... well. That's a Pandora's box with a tax stamp on it.\"",
          },
          {
            id: "chan_treasury_trust",
            label: "\"You manage the money. I manage the city. I trust your judgement.\"",
            text: "You manage the money. I manage the city. I trust your judgement.",
            effects: { loyalty: 12, credits: 4000, corruption: -1 },
            response: "They freeze mid-page-turn. \"You... trust my judgement.\" The spectacles come off — something you've never seen before. Without them, they look younger. Uncertain. \"In thirty years of public service, no leader has ever said those words to me. They've said 'fix it,' 'find money,' 'make it work.' Never 'I trust you.'\" They clean the spectacles slowly. \"Very well, Commander. I will implement a balanced approach. Modest cuts to non-essential programmes. Revenue diversification through controlled trade expansion. And a reserve fund — because crises don't wait for convenient budget cycles.\" They replace the spectacles. \"I won't betray that trust. The numbers will speak for themselves.\"",
          },
        ],
      },
    ],
  },
  {
    roleId: "enforcer",
    topics: [
      {
        id: "enf_methods",
        title: "THE ENFORCER'S METHODS",
        opening: "The Enforcer is cleaning blood off their knuckles when you walk in. They don't apologise. They never apologise. \"Commander. The interrogation yielded results.\" They flex their hands — each finger augmented with reinforced ceramic bone. \"The smuggling ring extends further than we thought. Three of your district governors are involved. Two knowingly, one through... creative ignorance.\" They crack their neck with a sound like grinding gears. \"I can shut it down tonight. Permanently. But my methods and the legal code don't always occupy the same space. How much latitude are you giving me?\"",
        choices: [
          {
            id: "enf_methods_leash",
            label: "\"By the book. Arrests, evidence, tribunals. No shortcuts.\"",
            text: "By the book. Arrests, evidence, tribunals. No shortcuts.",
            effects: { loyalty: -3, lawOrder: 3, corruption: -2, happiness: 1 },
            response: "Their expression doesn't change, but something shifts behind the eyes. Disappointment, perhaps. Or recalibration. \"The book. Right.\" They wipe the remaining blood with deliberate slowness. \"I'll compile evidence packages. Warrants. Proper chains of custody. The whole legal theatre.\" They stand. \"It'll take two weeks instead of two hours. In that time, the governors will destroy evidence, intimidate witnesses, and move their operations underground.\" At the door, they stop. \"I respect the law, Commander. I do. But the law was written for a city that doesn't exist anymore. Sometimes the only justice that works is the kind that arrives at 3am and doesn't knock.\"",
          },
          {
            id: "enf_methods_free",
            label: "\"Whatever it takes. I want this network gone by dawn.\"",
            text: "Whatever it takes. I want this network gone by dawn.",
            effects: { loyalty: 8, lawOrder: 2, corruption: -3, happiness: -2, unrest: -2 },
            response: "\"Dawn.\" The word rolls off their tongue like a countdown. \"Done.\" They don't explain what 'done' means. They don't describe the methods. They simply nod and leave. By morning, three district governors have been removed from their positions. The official reports cite 'voluntary resignation due to health concerns.' The smuggling network collapses within hours. Nobody asks questions — because nobody wants the answers. The Enforcer returns, hands clean, uniform pressed. \"The situation is resolved, Commander. The network's infrastructure has been... decommissioned.\" A beat. \"You should know — this kind of work creates fear. Fear is useful. But fear has a half-life. You'll need me again before long.\"",
          },
          {
            id: "enf_methods_smart",
            label: "\"Take the operation, not the people. I want the network, not martyrs.\"",
            text: "Take the operation, not the people. I want the network, not martyrs.",
            effects: { loyalty: 5, lawOrder: 2, corruption: -2, credits: 3000 },
            response: "They tilt their head. \"Sophisticated.\" It sounds like a compliment from someone who usually communicates through blunt force. \"Seize the infrastructure. The warehouses, the vehicles, the communication equipment. Let the governors keep their titles and their freedom — but remove every tool they need to operate.\" They nod slowly. \"They'll be toothless within days. And because we didn't arrest them, they can't play the persecution card. No rallies. No protests. Just... impotence.\" A rare, cold smile. \"You know, Commander, there's a special cruelty in letting your enemies live while watching everything they built disappear. I appreciate the artistry.\"",
          },
        ],
      },
    ],
  },
  {
    roleId: "diplomat",
    topics: [
      {
        id: "dip_crisis",
        title: "DIPLOMATIC CRISIS",
        opening: "The Diplomat sweeps into your office trailing the scent of imported tea and political anxiety. \"Commander, we have a situation. The northern faction's ambassador — you remember, the one with the mechanical arm and the unsettling smile — has issued what they're calling a 'friendship ultimatum.'\" They set a formal document on your desk, sealed with wax and what appears to be blood. \"Either we agree to a mutual defence pact within thirty days, or they consider all existing trade agreements void. It's elegantly aggressive.\" They pour themselves tea uninvited. \"The pact itself is reasonable on the surface. But buried in clause seven, sub-paragraph three, is a provision that effectively gives them veto power over our diplomatic relations with every other faction.\"",
        choices: [
          {
            id: "dip_crisis_counter",
            label: "\"Counter-offer. Accept the pact, but rewrite clause seven.\"",
            text: "Counter-offer. Accept the pact, but rewrite clause seven.",
            effects: { loyalty: 8, happiness: 1, credits: -1000 },
            response: "\"Counter-offer. Yes.\" They set down the tea with a smile that could charm a weapons dealer. \"I was hoping you'd say that. I've already drafted alternative language — removes their veto power, replaces it with a 'consultation requirement.' They get a voice. They don't get a stranglehold.\" They produce a second document. \"The trick is presentation. We frame our counter as an improvement — 'enhancing mutual respect and sovereign dignity.' Nobody can argue against dignity without looking like a tyrant.\" They stand. \"I'll arrange a meeting. Neutral territory. And I'll bring the good tea. Negotiations always go better when the tea is good, Commander. That's the one thing they don't teach in diplomatic school.\"",
          },
          {
            id: "dip_crisis_reject",
            label: "\"Reject it outright. We don't negotiate under threats.\"",
            text: "Reject it outright. We don't negotiate under threats.",
            effects: { loyalty: 3, defenseRating: 1, unrest: 1, happiness: -1 },
            response: "The tea pauses halfway to their lips. \"Outright rejection.\" They set the cup down carefully. \"Bold. Principled. And potentially catastrophic.\" They fold the document with precise creases. \"I'll deliver the rejection personally. In person, with full diplomatic courtesy. We reject the terms, not the relationship.\" They pause. \"The trade disruption will hurt. The northern routes carry thirty percent of our food imports. I'll need to activate emergency trade agreements with two other factions to compensate — at unfavourable rates.\" They straighten their collar. \"But you're right about one thing, Commander. The moment we cave to an ultimatum, every faction will try it. Strength is its own diplomacy.\"",
          },
          {
            id: "dip_crisis_delay",
            label: "\"Stall them. I need time to strengthen our position first.\"",
            text: "Stall them. I need time to strengthen our position first.",
            effects: { loyalty: 5, corruption: 1, credits: 2000 },
            response: "\"Stall. Now that is my speciality.\" They take a long, satisfied sip of tea. \"I'll request a 'cultural review period.' Entirely invented tradition, but it sounds important. Then I'll raise seventeen procedural objections to the document formatting — font inconsistencies, seal authentication, translator qualifications. That buys us two weeks.\" They stand, energised. \"In parallel, I'll begin back-channel conversations with their opposition party. Everyone has an opposition party, Commander, even dictatorships. You just have to know where to pour the tea.\" A wink. \"Give me thirty days and their ambassador will be begging us to sign a much simpler agreement. Patience is the diplomat's sharpest blade.\"",
          },
        ],
      },
    ],
  },
  {
    roleId: "propagandist",
    topics: [
      {
        id: "prop_narrative",
        title: "CONTROLLING THE NARRATIVE",
        opening: "The Propaganda Minister's office is a wall of screens — sixty-four feeds from across the city, all monitored, all analysable, all manipulable. They spin in their chair as you enter. \"Commander! Timing. I was just about to call.\" They gesture at the screens. \"Public sentiment index dropped three points overnight. The industrial districts are grumbling about water rations. The intellectuals in Sector 5 are publishing underground pamphlets again. And someone — someone very clever — has been spray-painting your approval rating on public walls. The accurate one.\" They lean forward. \"We need a story, Commander. Something bigger than water. Bigger than pamphlets. Something that makes people look up instead of down. What's our narrative?\"",
        choices: [
          {
            id: "prop_narrative_hero",
            label: "\"Give them a victory. Make the last operation look heroic.\"",
            text: "Give them a victory. Make the last operation look heroic.",
            effects: { loyalty: 5, happiness: 3, unrest: -2, corruption: 1 },
            response: "\"A victory. Perfect.\" They're already typing, fingers flying across three keyboards simultaneously. \"The border skirmish last week — minor, three casualties, strategically irrelevant. But with the right footage, the right music, the right survivor testimony...\" They pull up editing software. \"By tonight, it's a tale of heroism against impossible odds. Your troops defending orphanages. The enemy as faceless, inhuman threats. A commander — nameless, but unmistakably you-shaped — leading from the front.\" They grin. \"Nobody questions a good war story, Commander. They're too busy feeling proud. And proud people don't spray-paint walls. They salute at them.\"",
          },
          {
            id: "prop_narrative_truth",
            label: "\"Tell the truth. All of it. Then show them the plan to fix it.\"",
            text: "Tell the truth. All of it. Then show them the plan to fix it.",
            effects: { loyalty: 3, happiness: 1, corruption: -3, unrest: 1 },
            response: "Every screen freezes. The Minister stares at you. \"The truth.\" They say the word like it's a foreign language. \"The... actual truth.\" They lean back. \"Commander, in twenty years of communications management, no one has ever asked me to tell the truth.\" A long pause. \"It could work. Paradoxically. People are so used to propaganda that honesty would be shocking. Disarming.\" They begin restructuring the broadcast schedule. \"We air a special address. You, on camera, acknowledging the water shortage. Then — crucially — you present the three-month plan to solve it. With numbers. Real numbers.\" They shake their head in wonder. \"If this works, it'll be the most subversive thing I've ever broadcast. The truth as propaganda. Drokk me, Commander. That's genius.\"",
          },
          {
            id: "prop_narrative_distract",
            label: "\"Distraction. Give them entertainment. Bread and circuses.\"",
            text: "Distraction. Give them entertainment. Bread and circuses.",
            effects: { loyalty: 5, happiness: 2, unrest: -3, credits: -3000 },
            response: "\"Now you're thinking like a proper autocrat.\" They crack their knuckles. \"I've had a proposal sitting on my desk for weeks — 'MegaCity Games.' City-wide competition. Districts against districts. Physical contests, technical challenges, cooking — people love cooking competitions, Commander, even in dystopias.\" They pull up concept art. \"The broadcasts alone will dominate every screen for a month. The gambling revenue will offset costs. And the civic pride — people defending their district's honour — redirects all that frustration into something productive.\" They zoom in on a stadium design. \"While they're cheering, we fix the water supply quietly. When they look up from the games, the taps are running again. Magic.\"",
          },
        ],
      },
    ],
  },
  {
    roleId: "science_advisor",
    topics: [
      {
        id: "sci_breakthrough",
        title: "THE BREAKTHROUGH",
        opening: "The Science Advisor bursts in without knocking — lab coat singed, goggles pushed up on their forehead, holding a containment cylinder that's emitting a faint blue glow. \"MARSHAL!\" They set the cylinder on your desk with hands that are trembling — from excitement, not fear. \"Do you know what this is?\" They don't wait for an answer. \"This is a stable quantum lattice. Self-sustaining. We've been trying to create one for seven years and this morning, at 4:47am, Lab 6 achieved coherence.\" They're practically vibrating. \"This changes everything. Power generation. Computing. Weapons. Medicine. Everything. But we need to decide — right now — what we build first. Because the lattice is stable, but our funding is not.\"",
        choices: [
          {
            id: "sci_breakthrough_power",
            label: "\"Power. The city needs energy more than anything.\"",
            text: "Power. The city needs energy more than anything.",
            effects: { loyalty: 5, research: 3, happiness: 2, credits: -8000 },
            response: "\"Power! Yes!\" They grab a stylus and start sketching on your desk — literally on the desk surface. \"A quantum lattice reactor. Clean, unlimited, stable. No fuel rods, no waste, no meltdown risk.\" The sketch takes shape — an elegant spiral of interconnected nodes. \"Six months to prototype. Twelve to full deployment. Your energy problems vanish permanently.\" They look up, eyes wild with possibility. \"Commander, do you understand what this means? No more rationing. No more blackouts. Every sector fully powered, twenty-four hours. The factories run at capacity. The hospitals run at capacity. The city comes alive.\" They clutch the containment cylinder. \"We just need funding. And for Lab 6 to stop being on fire. That's a separate issue.\"",
          },
          {
            id: "sci_breakthrough_weapons",
            label: "\"Weapons application. I need deterrence, not lightbulbs.\"",
            text: "Weapons application. I need deterrence, not lightbulbs.",
            effects: { loyalty: -2, defenseRating: 4, research: 2, credits: -10000 },
            response: "The excitement drains from their face like coolant from a breached reactor. \"Weapons.\" They set the cylinder down carefully. \"Yes. Of course. A quantum lattice weapon would be... devastating. Directed energy, capable of disabling entire formations. Possibly entire settlements.\" They pull the goggles down over their eyes — a tell that means they're uncomfortable. \"I can build it, Commander. The physics allows it. But I want it on record that this technology could light every home in the city, cure three known diseases, and triple our computing power.\" They begin a new sketch — harder lines, angular, aggressive. \"Instead, I'll build you something that kills. Because that's what the world requires. But one day, Commander — one day I hope you'll let me build something that doesn't.\"",
          },
          {
            id: "sci_breakthrough_medicine",
            label: "\"Medicine. Save lives. That's what matters.\"",
            text: "Medicine. Save lives. That's what matters.",
            effects: { loyalty: 12, research: 2, happiness: 3, credits: -6000 },
            response: "They go very still. Then, very quietly: \"Commander.\" Their voice is different now — no longer manic, no longer performatively brilliant. Just... sincere. \"I became a scientist to help people. Not to build bombs or reactors or surveillance systems. To help people.\" They cradle the cylinder. \"A quantum-lattice medical scanner could diagnose any disease in seconds. Treatment protocols generated by quantum processing in minutes. We could eliminate three plagues that have been killing this city's children for a decade.\" Their eyes are bright. \"Thank you, Commander. For letting me be the scientist I wanted to be. Not the one the world demanded.\" They head for the door. \"I'll have a prototype in ninety days. And this time, nobody dies. That's the whole point.\"",
          },
        ],
      },
    ],
  },
];

export function getCommandTopics(roleId: InnerCircleRole): CommandTopic[] {
  return COMMAND_DIALOGUES.find((d) => d.roleId === roleId)?.topics ?? [];
}

export type OfficerDepartment =
  | "supreme_leadership"
  | "executive_council"
  | "judicial"
  | "law_enforcement"
  | "civic"
  | "infrastructure"
  | "economic"
  | "research"
  | "defense"
  | "district"
  | "advisory";

export type OfficerBriefing = {
  department: OfficerDepartment;
  title: string;
  opening: string;
  choices: CommandChoice[];
};

export const OFFICER_BRIEFINGS: OfficerBriefing[] = [
  {
    department: "supreme_leadership",
    title: "SUPREME COMMAND BRIEFING",
    opening: "The City Executive stands at the panoramic window, hands clasped behind their back. The city stretches below — a million lives humming in concrete and steel. \"Commander. I didn't ask for this meeting to discuss policy. I asked because I need to understand your vision.\" They turn. \"Every leader before you had one. Expansion. Isolation. Purity. Control. Each vision shaped the city for decades.\" They sit, precisely, deliberately. \"What is yours? Because the machinery of government will align itself to that vision — for good or ill. The city becomes what its Commander dreams. So tell me: what do you dream?\"",
    choices: [
      {
        id: "sl_vision_prosper",
        label: "\"Prosperity. Every citizen fed, housed, and productive.\"",
        text: "Prosperity. Every citizen fed, housed, and productive.",
        effects: { loyalty: 8, happiness: 2, credits: -2000 },
        response: "They study you for a long moment. \"Prosperity.\" The word seems to surprise them. \"Not power? Not control? Not expansion?\" They lean back. \"Do you know how rare that answer is, Commander? In my career, I've served nine leaders. Eight dreamed of dominance. You dream of dinner tables.\" A faint smile. \"I'll restructure the administrative priorities. Housing first, food security second, employment third. It will take years. It will cost everything in the treasury. And it might actually work.\" They stand. \"You may be the first Commander who deserves the title. I'll make sure the bureaucracy knows it.\"",
      },
      {
        id: "sl_vision_strength",
        label: "\"Strength. No one threatens this city and lives.\"",
        text: "Strength. No one threatens this city and lives.",
        effects: { loyalty: 5, defenseRating: 2, unrest: -1 },
        response: "\"Strength.\" They nod — not enthusiastic, but understanding. \"A defensive vision. The iron wall doctrine.\" They pull up force disposition maps. \"I can align the administrative apparatus behind military readiness. Shift industrial production toward armaments. Accelerate the conscription timeline.\" A pause. \"But strength without purpose is just muscle, Commander. Muscles tire. What comes after the wall is built? What do the people inside it live for?\" They return to the window. \"I'll execute your vision. But consider this: the strongest cities in history weren't the ones with the biggest walls. They were the ones nobody wanted to attack — because destroying them would have made the world poorer.\"",
      },
      {
        id: "sl_vision_freedom",
        label: "\"Freedom. Real freedom. Even if it's messy.\"",
        text: "Freedom. Real freedom. Even if it's messy.",
        effects: { loyalty: 5, happiness: 3, unrest: 2, corruption: -2 },
        response: "They go very still. \"Freedom.\" The word hangs in the air like smoke. \"Commander... do you know what happened to the last leader who tried freedom in a mega-city?\" They don't wait for an answer. \"Sector riots. Economic collapse. Three factions seized territory before the constitution was even ratified.\" They walk to the desk and sit — heavily, for once. \"But you know what? The citizens of that city, for eighteen months, were the happiest people on the continent. Before it all fell apart.\" They look at you with something approaching respect. \"If you want to try freedom — real freedom — I'll help. But we do it carefully. Gradually. Like defusing a bomb. Because that's exactly what it is.\"",
      },
    ],
  },
  {
    department: "law_enforcement",
    title: "ENFORCEMENT STATUS REPORT",
    opening: "The City Enforcement Commander drops a thick folder on your desk. \"Sector crime stats. District violation reports. Incident logs.\" Each word is clipped, precise, military. \"Bottom line: we're holding. Barely. The gang networks are adapting faster than we can respond. They've started using AI-scrambled communications, dead-drop logistics, and — this is new — they're recruiting from our own junior enforcement cadets.\" They lean forward. \"I need either more resources or more authority. Preferably both. But I'll settle for a clear mandate on how far I can go.\"",
    choices: [
      {
        id: "le_resources",
        label: "\"More resources. I'll find the budget. You find the criminals.\"",
        text: "More resources. I'll find the budget. You find the criminals.",
        effects: { loyalty: 8, lawOrder: 2, credits: -5000 },
        response: "\"Resources. Good.\" They relax fractionally. \"I need three hundred additional enforcement personnel. Updated surveillance equipment — the current gear is two generations behind the criminals'. And a dedicated cybercrime unit with actual hackers, not bureaucrats who took a weekend course.\" They straighten the folder. \"Give me these things, Commander, and I'll give you a thirty percent reduction in serious crime within six months. That's not a promise. That's a guarantee.\"",
      },
      {
        id: "le_authority",
        label: "\"You have expanded authority. Use it wisely.\"",
        text: "You have expanded authority. Use it wisely.",
        effects: { loyalty: 5, lawOrder: 3, happiness: -2, corruption: 1 },
        response: "Their eyes narrow — not with suspicion, but with calculation. \"Expanded authority. That means warrantless searches? Extended detention? Enhanced interrogation?\" They stand. \"I'll use it wisely, Commander. But 'wisely' and 'gently' aren't the same thing. The gangs understand force. They respect it. They don't respect warrants and due process.\" They collect the folder. \"Within ninety days, every major gang leader will be in custody or in exile. The streets will be safe. The methods will be... efficient.\" A pause at the door. \"Just don't ask me for details. Plausible deniability is a gift I give my superiors freely.\"",
      },
      {
        id: "le_community",
        label: "\"Change approach. Community engagement, not crackdowns.\"",
        text: "Change approach. Community engagement, not crackdowns.",
        effects: { loyalty: -2, happiness: 2, corruption: -2, lawOrder: 1 },
        response: "Their jaw works silently for a moment. \"Community engagement.\" The phrase comes out like they're tasting something unfamiliar. \"Commander, with respect, the communities are the ones harboring the criminals.\" But something shifts. \"However... there are districts where the citizens cooperate. Where they report suspicious activity voluntarily. And crime in those districts is half the city average.\" They sit back down. \"I'll pilot a programme. Embedded officers, not in armour but in plain clothes. Building relationships. Gathering intelligence through trust instead of intimidation.\" A begrudging nod. \"It goes against every instinct I have. But the data doesn't lie. Maybe there's more than one way to enforce the law.\"",
      },
    ],
  },
  {
    department: "infrastructure",
    title: "INFRASTRUCTURE CRITICAL REPORT",
    opening: "The Power Grid Commissioner looks exhausted — dark circles under their eyes, collar unbuttoned, three empty coffee cups on the desk. \"Commander, I'll be brief because I have six emergencies to get back to.\" They pull up a schematic. \"The eastern water main is at sixty percent capacity. The power grid in Sectors 4 through 7 is running on redundant systems because the primary failed two days ago. And the waste processing plant in the industrial zone is...\" They search for the word. \"...expressing its displeasure. Loudly. And toxically.\" They sit back. \"I can fix two of these three problems with current resources. You choose which two. The third waits until the budget allows, or until it becomes catastrophic. Whichever comes first.\"",
    choices: [
      {
        id: "infra_power_water",
        label: "\"Power and water. People can tolerate smell, not thirst.\"",
        text: "Power and water. People can tolerate smell, not thirst.",
        effects: { loyalty: 5, happiness: 1, credits: -4000 },
        response: "\"Agreed. Power and water are existential. Waste is merely revolting.\" They start issuing orders via their comm unit immediately. \"I'll redirect maintenance crews to the eastern main tonight. The power grid gets the redundant transformers from storage — they're old, but functional.\" They pause. \"The waste situation... I'll contain it. Literally. Temporary barriers, chemical treatment, and a very strong advisory for Sector 12 residents to keep their windows closed.\" A weary smile. \"It's not elegant, Commander. But elegance is a peacetime luxury. Right now, I'll settle for functional.\"",
      },
      {
        id: "infra_all_three",
        label: "\"All three. Find the resources. I'll authorise emergency spending.\"",
        text: "All three. Find the resources. I'll authorise emergency spending.",
        effects: { loyalty: 10, credits: -8000, happiness: 2 },
        response: "They blink. Then blink again. \"All three?\" The coffee cups rattle as they lean forward. \"Commander, that's... that's twenty thousand credits in emergency repairs. Overtime for six hundred workers. Materials we'll have to requisition from reserve stockpiles.\" They're already calculating. \"But if you're authorising it — yes. Yes, we can do all three. Simultaneously.\" They stand with a burst of energy that contradicts the dark circles. \"I'll have teams deployed within the hour. Power, water, and waste. The city's infrastructure will be stable by week's end.\" Their voice softens. \"Thank you, Commander. It's been years since a leader treated infrastructure as a priority instead of an afterthought.\"",
      },
      {
        id: "infra_prioritise",
        label: "\"Which failure risks the most lives? Start there.\"",
        text: "Which failure risks the most lives? Start there.",
        effects: { loyalty: 8, happiness: 1, credits: -3000 },
        response: "\"Lives.\" They nod approvingly. \"The water main. A catastrophic failure would leave 340,000 citizens without potable water. Disease follows within days. Unrest within hours.\" They prioritise instantly — the competence beneath the exhaustion is evident. \"Water main first. Power grid second — the redundant systems will hold for another week if we're careful. Waste processing third.\" They stand. \"I appreciate the framework, Commander. 'Which failure risks the most lives' — that should be printed on every infrastructure manual in the city. It usually says 'which failure costs the most credits.' Different question. Different answer.\"",
      },
    ],
  },
];

export function getOfficerBriefing(department: OfficerDepartment): OfficerBriefing | undefined {
  return OFFICER_BRIEFINGS.find((b) => b.department === department);
}
