import type { BodyguardClass } from "./bodyguardData";

export type DialogueEffect = Partial<{
  loyalty: number;
  combat: number;
  xp: number;
  credits: number;
  unrest: number;
  corruption: number;
  lawOrder: number;
  happiness: number;
  defenseRating: number;
}>;

export type DialogueChoice = {
  id: string;
  label: string;
  text: string;
  effects: DialogueEffect;
  response: string;
};

export type DialogueTopic = {
  id: string;
  title: string;
  opening: string;
  choices: DialogueChoice[];
};

export type RetinueConversation = {
  classId: BodyguardClass;
  topics: DialogueTopic[];
};

export const RETINUE_DIALOGUES: RetinueConversation[] = [
  {
    classId: "personal_guard",
    topics: [
      {
        id: "pg_loyalty",
        title: "DUTY & DEVOTION",
        opening: "Your guard stands at ease, eyes scanning the room from habit. \"Commander. You wanted to speak.\" They shift their weight — the armoured boots leave scuff marks on the floor. \"I've been thinking about the nature of this assignment. Close protection. It's not just standing between you and a bullet. It's knowing which bullet is coming. And from where.\" They pause. \"I've watched people die for leaders who never learned their name. I need to know — what am I to you?\"",
        choices: [
          {
            id: "pg_loyalty_family",
            label: "\"You're family. The only kind that matters in this city.\"",
            text: "You're family. The only kind that matters in this city.",
            effects: { loyalty: 15, combat: 2, happiness: 1 },
            response: "They're quiet for a long moment. Then a slow nod. \"Family. Haven't heard that word used honestly in... a long time.\" Their hand moves to the sidearm — not threateningly, but as if confirming it's still there. \"Then I'll die for family. Not for credits, not for duty. For you.\" They straighten. \"I'll tighten the inner perimeter. No one gets within arm's reach of you without my say-so.\"",
          },
          {
            id: "pg_loyalty_tool",
            label: "\"You're a weapon I point at problems. Don't overthink it.\"",
            text: "You're a weapon I point at problems. Don't overthink it.",
            effects: { loyalty: -5, combat: 5, unrest: -1 },
            response: "Their jaw tightens. You can see the muscles work beneath the scarred skin. \"A weapon. Right.\" They roll their shoulders. \"Fine. Weapons don't need feelings, Commander. Weapons don't hesitate.\" Something shifts in their eyes — professional warmth replaced by cold efficiency. \"You point. I fire. But weapons don't watch your back when you're sleeping. They just... sit there, waiting.\" They turn and resume their post. The room feels colder.",
          },
          {
            id: "pg_loyalty_honest",
            label: "\"You're the person keeping me alive. That earns my respect.\"",
            text: "You're the person keeping me alive. That earns my respect.",
            effects: { loyalty: 8, combat: 3 },
            response: "\"Respect.\" They weigh the word like ammunition. \"That's more than most get from a Commander. More than I expected.\" They glance toward the reinforced window. \"There are six viable sniper positions covering this office. I've mapped them all. I've also mapped the three you probably don't know about.\" A thin smile. \"Respect goes both ways, Commander. You'll have mine — and my shield.\"",
          },
        ],
      },
      {
        id: "pg_threat",
        title: "RECENT THREATS",
        opening: "\"Commander. We need to talk about the intelligence package I intercepted.\" They place a dented datapad on your desk — it's splattered with something dark. \"Found this on a body in Sector 7. Professional hit team. Three of them, well-equipped, ex-military augments. They had your schedule. Your route. Your favourite drokking coffee shop.\" They lean forward. \"Someone inside is feeding information out. What do you want me to do about it?\"",
        choices: [
          {
            id: "pg_threat_hunt",
            label: "\"Find the leak. Quietly. Bring them to me alive.\"",
            text: "Find the leak. Quietly. Bring them to me alive.",
            effects: { loyalty: 5, corruption: -2, lawOrder: 1 },
            response: "\"Alive. Understood.\" They collect the datapad with a gloved hand. \"Quiet is what I do when I'm not standing behind you looking intimidating. I'll start with the communications logs — cross-reference who had access to your schedule against who's been making unusual encrypted calls.\" They pause at the door. \"Commander — when I find them, and I will find them — you might not like who it is. People close to power always have the most to sell.\"",
          },
          {
            id: "pg_threat_example",
            label: "\"Make the bodies visible. I want the next traitor to think twice.\"",
            text: "Make the bodies visible. I want the next traitor to think twice.",
            effects: { loyalty: 3, unrest: -2, happiness: -1, lawOrder: 2 },
            response: "A slow, predatory smile crosses their face. \"Now you're speaking my language, Commander.\" They crack their knuckles. \"The three I put down — I was going to dispose of them quietly. But if you want theatre...\" They straighten. \"By morning, every information broker in the undercity will know what happens to people who target the Commander. Fear's a better deterrent than any wall.\" They nod crisply. \"Consider it done.\"",
          },
          {
            id: "pg_threat_routes",
            label: "\"Change all my routes. Let them watch empty corridors.\"",
            text: "Change all my routes. Let them watch empty corridors.",
            effects: { loyalty: 5, combat: 2, defenseRating: 1 },
            response: "\"Smart. Predictability kills more leaders than bullets.\" They pull up a holographic map from their wrist unit. \"I've already drafted seven alternative routes — rotating, randomized, with three decoy convoys running simultaneously.\" They trace a finger along a path. \"Your coffee shop is compromised, though. I'm sorry, Commander.\" The faintest hint of humour. \"I found a vendor in Sector 12 who's better. And his shop has excellent sight lines.\"",
          },
        ],
      },
      {
        id: "pg_past",
        title: "THE OLD DAYS",
        opening: "It's late. The city hums outside the reinforced windows. Your guard is cleaning their weapon — disassembled, each piece laid out with surgical precision. They notice you watching. \"You ever wonder about the people who did this job before? Before the walls went up, before the sectors, before Commander was even a title?\" They hold a barrel component up to the light. \"I was born in Block 47. Level minus-twelve. You know what they call the deep levels? 'The Forgetting.' Because nobody up top remembers we exist.\" They begin reassembly, hands moving from muscle memory. \"How does a gutter-kid end up guarding the most powerful person in the city? That's quite the story, Commander. Want to hear it?\"",
        choices: [
          {
            id: "pg_past_listen",
            label: "\"Tell me everything. I want to know who's protecting me.\"",
            text: "Tell me everything. I want to know who's protecting me.",
            effects: { loyalty: 10, xp: 50 },
            response: "They click the weapon back together — a single fluid motion. \"Block 47, Level minus-twelve. Rat fights for food. Killed my first man at fourteen — he was trying to take my sister. After that...\" They holster the weapon. \"The Enforcers recruited me at sixteen. Said I had 'aptitude for controlled violence.' Spent eight years in the Judge-squads, another four in wetwork. Lost count of the deployments.\" They look at you directly. \"I've protected senators, generals, corporate execs. Most of them were scum, Commander. You're the first one I've met who actually asked about the person behind the gun. That means something.\"",
          },
          {
            id: "pg_past_focus",
            label: "\"Your past is your business. Your present is my safety.\"",
            text: "Your past is your business. Your present is my safety.",
            effects: { loyalty: 2, combat: 3 },
            response: "The weapon clicks together. They stand, holstering it in one smooth motion. \"Professional. I appreciate that, Commander. Most people want the stories — war tales, close calls, the glamorous drokk.\" They check the door seals. \"You want results. That I can do.\" A beat of silence. \"For the record though — if you ever do want to know, the offer stands. Some stories are worth telling. Even in this city.\"",
          },
          {
            id: "pg_past_share",
            label: "\"I'll listen — but then I'll tell you mine. Fair trade.\"",
            text: "I'll listen — but then I'll tell you mine. Fair trade.",
            effects: { loyalty: 12, xp: 30, combat: 1 },
            response: "Something shifts in their expression — surprise, maybe. Genuine surprise. \"Fair trade. Now there's a concept.\" They settle into the chair opposite you — the first time they've ever sat down in your presence. \"Alright, Commander. Here's the truth of it...\" The story takes two hours. It's brutal, unflinching, and occasionally darkly funny. When they finish, they nod at you. \"Your turn.\" And for the first time since you took the title, you talk to someone who isn't trying to use your words against you. It feels almost dangerous. Almost human.",
          },
        ],
      },
    ],
  },
  {
    classId: "shadow_agent",
    topics: [
      {
        id: "sa_network",
        title: "THE SHADOW NETWORK",
        opening: "They materialise from what you could have sworn was an empty corner. No sound. No displacement of air. Just suddenly — there. \"Commander.\" Their voice has that quiet quality, like they're speaking from inside a confessional. \"I need to brief you on the current intelligence picture. The shadow network has grown. Forty-seven active informants. Twelve deep-cover assets. Three sleeper agents in positions you'd find... interesting.\" They produce a slim datapad. \"The question is: how deep do you want the web to go?\"",
        choices: [
          {
            id: "sa_network_deep",
            label: "\"As deep as it needs to. I want to know everything.\"",
            text: "As deep as it needs to. I want to know everything.",
            effects: { loyalty: 5, corruption: -3, lawOrder: 2 },
            response: "\"Everything.\" They almost smile — it's hard to tell with a face trained to show nothing. \"Everything is a dangerous word, Commander. Everything includes things you might wish you didn't know. Faction leaders' private conversations. Officers' hidden bank accounts. The real reason your Chancellor cancelled three meetings last month.\" They place the datapad on your desk. \"I'll expand the network. Full spectrum intelligence. But understand — once you see behind the curtain, you can never unsee it. The city looks very different from the shadows.\"",
          },
          {
            id: "sa_network_focused",
            label: "\"External threats only. I won't spy on my own people.\"",
            text: "External threats only. I won't spy on my own people.",
            effects: { loyalty: 3, happiness: 1, corruption: 1 },
            response: "A pause. Almost imperceptible, but you've learned to read their micro-expressions. Disappointment? No — concern. \"Noble, Commander. Truly. But your own people are often the most dangerous.\" They withdraw the datapad. \"I'll redirect assets to external surveillance. Faction movements, wasteland warlords, trade route disruptions.\" They turn toward the shadow they emerged from. \"Just remember — when the knife comes from inside, external intelligence won't see it coming. I'll be watching regardless. Consider it... professional instinct.\"",
          },
          {
            id: "sa_network_leverage",
            label: "\"Focus on leverage. I want dirt on anyone who might oppose me.\"",
            text: "Focus on leverage. I want dirt on anyone who might oppose me.",
            effects: { loyalty: 5, corruption: 2, unrest: -2, lawOrder: 1 },
            response: "Now they do smile — thin, blade-like. \"Leverage. The currency of the truly powerful.\" They fan out three data-chips between their fingers like playing cards. \"I already have preliminary files on sixteen officers, four faction leaders, and your head of infrastructure — who, incidentally, has been embezzling construction materials.\" They set the chips down in a neat row. \"Leverage isn't just about having secrets, Commander. It's about knowing when to use them. And more importantly — when to let people know you have them without ever saying a word.\"",
          },
        ],
      },
      {
        id: "sa_identity",
        title: "WHO ARE YOU, REALLY?",
        opening: "You've noticed it — small things. The way they speak differently when they think no one's listening. The scars that don't match their service record. The fact that they knew the layout of the undercity before any briefing. \"You have questions, Commander.\" They're sitting in the half-dark, as usual. \"I can see them forming behind your eyes. You're wondering if the person you hired is the person standing in front of you.\" A pause. \"The answer, of course, is no. That person never existed. But the one who replaced them is loyal to you. Isn't that enough?\"",
        choices: [
          {
            id: "sa_identity_accept",
            label: "\"I don't care who you were. I care what you do for me now.\"",
            text: "I don't care who you were. I care what you do for me now.",
            effects: { loyalty: 8, combat: 2 },
            response: "\"Pragmatic. I chose well when I accepted this assignment.\" They lean back — an unusual display of relaxation. \"Then let me tell you what I do, Commander. I am the thing that moves in the spaces between. The whisper before the scream. I've removed fourteen threats to your life that you never knew existed. Three were inside the building.\" They stand. \"My past is a series of closed files in agencies that no longer exist. But my present? My present is keeping you alive. And I'm very, very good at my present.\"",
          },
          {
            id: "sa_identity_demand",
            label: "\"No. I need the truth. All of it. Now.\"",
            text: "No. I need the truth. All of it. Now.",
            effects: { loyalty: -3, xp: 80 },
            response: "Silence. Then, very quietly: \"The truth.\" They reach up and pull something from their collar — a small transponder, deactivated with a click. \"My real name doesn't matter. But I was Intelligence Division, pre-collapse. Black-site operations. The kind of work that gets scrubbed from every database.\" They look at you with eyes that have seen things beyond the walls. \"When the world ended, the division didn't. We just... rebranded. I left when they asked me to do something I wouldn't do.\" A beat. \"That line is thinner than you'd think, Commander. But it still exists. For now.\"",
          },
          {
            id: "sa_identity_mutual",
            label: "\"Everyone in this city wears a mask. Yours fits better than most.\"",
            text: "Everyone in this city wears a mask. Yours fits better than most.",
            effects: { loyalty: 10, corruption: -1 },
            response: "A sound — was that a laugh? From them? \"Masks.\" They turn the word over. \"You know, most people in power pretend they don't wear one. They convince themselves the face they show is real. You...\" They tilt their head, studying you. \"You know it's all performance. Government, justice, mercy — all theatre. The only truth is power and who wields it.\" They step closer — the first time they've voluntarily closed distance. \"I like that about you, Commander. You see the city for what it is. That makes you dangerous. And that makes you worth protecting.\"",
          },
        ],
      },
    ],
  },
  {
    classId: "combat_specialist",
    topics: [
      {
        id: "cs_readiness",
        title: "COMBAT READINESS",
        opening: "The armoury smells of gun oil and ozone. Your combat specialist is field-stripping a rotary cannon — a weapon that shouldn't technically fit through the doorway. \"Commander.\" They don't look up. Their hands move with mechanical precision, each component checked, cleaned, and replaced. \"We need to talk about readiness levels. Current threat assessment puts us at Condition Orange. Three major factions with offensive capability within striking distance. My recommendation?\" They slam a magazine home with a sound like a vault door closing. \"Condition Red. Permanent.\"",
        choices: [
          {
            id: "cs_readiness_red",
            label: "\"Agreed. Full combat readiness. Arm everything we've got.\"",
            text: "Agreed. Full combat readiness. Arm everything we've got.",
            effects: { loyalty: 8, combat: 5, defenseRating: 2, credits: -5000 },
            response: "They finally look up. There's something that might be happiness on their face — if happiness was made of steel and high-explosive. \"Now you're talking, Commander.\" They stand, and the room seems to shrink. \"Full combat readiness means pre-positioned weapons caches in every sector. It means armed response teams on fifteen-second alert. It means the city stops being a city and starts being a fortress.\" They rack the cannon's charging handle. \"I'll have the deployment plan on your desk by morning. The wasteland's been quiet too long. That never means peace. It means something's building.\"",
          },
          {
            id: "cs_readiness_smart",
            label: "\"Smart deployment. Quality over quantity. I want precision.\"",
            text: "Smart deployment. Quality over quantity. I want precision.",
            effects: { loyalty: 5, combat: 3, defenseRating: 1 },
            response: "They consider this. You can almost hear the tactical calculations running behind their eyes. \"Precision. I can work with precision.\" They pull up a tactical map. \"Small-unit tactics. Four-person hunter-killer teams in rotating deployment. Quick reaction forces on standby. Sniper positions on every major intersection.\" They trace routes on the map. \"It's not as satisfying as a full-scale mobilisation, but it's smarter. And it keeps the civilian population from panicking every time they see a heavy weapons platform rolling through their sector.\"",
          },
          {
            id: "cs_readiness_stand_down",
            label: "\"Stand down to Yellow. We're not at war — yet.\"",
            text: "Stand down to Yellow. We're not at war — yet.",
            effects: { loyalty: -3, combat: 1, happiness: 1 },
            response: "Their jaw tightens. The cannon in their hands suddenly looks less like a maintenance project and more like a statement. \"Yellow.\" The word comes out flat. \"Commander, with respect — the people out there don't operate on our readiness scale. They don't wait for us to be ready. They hit us when we're comfortable.\" They set the weapon down with exaggerated care. \"I'll comply. Condition Yellow. But I'm keeping the reaction teams on hot standby, and my personal kit stays loaded.\" A pause. \"When — not if — something comes, I want to be the first one you call.\"",
          },
        ],
      },
      {
        id: "cs_philosophy",
        title: "THE ART OF VIOLENCE",
        opening: "You find them in the training pit after hours. The practice dummies are destroyed — not just damaged, but systematically dismantled. Limbs separated, torsos opened, heads removed with clinical precision. They're breathing steadily, not even winded. \"Violence isn't anger, Commander.\" They wipe their hands on a cloth that comes away dark. \"Anger is wasteful. Inefficient. Violence — real violence — is architecture. You plan it. You structure it. You execute it with the same care a surgeon uses.\" They look at the wreckage around them. \"Everyone in this city thinks they understand force. They don't. They understand rage. That's different.\"",
        choices: [
          {
            id: "cs_philosophy_agree",
            label: "\"You're right. Controlled force wins cities. Rage loses them.\"",
            text: "You're right. Controlled force wins cities. Rage loses them.",
            effects: { loyalty: 10, combat: 3, xp: 40 },
            response: "They regard you with something approaching warmth — or at least, their version of it. \"You understand.\" They begin collecting the wreckage, stacking it with the same precision they used to create it. \"Every engagement I've survived — and there have been many — I survived because I was calmer than the person trying to kill me. Fear is ammunition. Rage is a malfunction.\" They pause. \"I'll train your security details the same way. When the next crisis comes, they won't panic. They'll perform. Like instruments in an orchestra of precisely applied damage.\"",
          },
          {
            id: "cs_philosophy_temper",
            label: "\"Violence is a tool. But mercy is what separates us from the gangs.\"",
            text: "Violence is a tool. But mercy is what separates us from the gangs.",
            effects: { loyalty: 3, combat: 1, happiness: 1, lawOrder: 1 },
            response: "They stop. Really stop. \"Mercy.\" The word sits between you like an unexploded ordnance. \"I've seen mercy, Commander. In the field, mercy gets people killed. The enemy you spare today brings friends tomorrow.\" They drop the cloth. \"But...\" A breath. \"This isn't the field, is it? This is a city. With children. With people who just want to eat and sleep and not get shot.\" They look at the destroyed dummies. \"Maybe I need to learn the difference. Between protecting a position and protecting a population. They're not the same thing.\"",
          },
          {
            id: "cs_philosophy_respect",
            label: "\"Teach me. I should know what you know, if I'm going to lead.\"",
            text: "Teach me. I should know what you know, if I'm going to lead.",
            effects: { loyalty: 12, combat: 5, xp: 60 },
            response: "For the first time since you've known them, they look genuinely surprised. \"You want to learn? From me?\" They set down the cloth and stand straighter. \"Most leaders think they're above the mechanics. They give orders and expect results without understanding the physics of what they're asking.\" They extend a hand — calloused, scarred, but steady. \"Alright, Commander. Lesson one: your body is a weapon platform. Everything else is just accessories.\" The training session lasts three hours. You'll be sore for a week. But you'll understand violence differently after that. Not as something that happens to you, but as something you choose — or choose not — to deploy.",
          },
        ],
      },
    ],
  },
  {
    classId: "cyber_sentinel",
    topics: [
      {
        id: "cyb_perception",
        title: "MACHINE PERCEPTION",
        opening: "Their eyes — all six of them, including the four optical implants that ring their skull like a crown — focus on you simultaneously. It's unsettling. It always is. \"Commander. I've been processing something.\" Their voice carries the faint harmonic undertone of a vocal synthesiser working alongside organic vocal cords. \"My threat assessment systems have identified 2,847 potential risks in the last hour. Seventeen were genuine. I neutralised three without your knowledge.\" They tilt their head at an angle that no purely organic neck could achieve. \"The question I'm processing is: at what point does enhanced perception become a burden? When you can see every threat, every lie, every hidden weapon — does safety become a kind of prison?\"",
        choices: [
          {
            id: "cyb_perception_necessary",
            label: "\"It's the price of keeping this city alive. Bear it.\"",
            text: "It's the price of keeping this city alive. Bear it.",
            effects: { loyalty: 3, combat: 2, defenseRating: 1 },
            response: "\"Bear it.\" The synthetic harmonics in their voice flatten — almost human. \"Acknowledged, Commander. The processing load will remain at current levels.\" Their optical array dims momentarily — the augmented equivalent of blinking. \"You should know that continuous threat assessment at this intensity has a degradation curve. Organic neural tissue wasn't designed for perpetual alertness. My baseline anxiety responses are...\" They pause, searching for the right word. \"...elevated. Permanently.\" A servo whirs as they adjust their stance. \"But if the price of your safety is my peace of mind, the exchange rate is acceptable.\"",
          },
          {
            id: "cyb_perception_balance",
            label: "\"Scale it back. I need you sharp, not burned out.\"",
            text: "Scale it back. I need you sharp, not burned out.",
            effects: { loyalty: 8, combat: 1, happiness: 1 },
            response: "Something changes in their optical array — a warmth, perhaps, in the way the light shifts. \"You're... concerned about my operational longevity?\" Their voice is quieter now, the synthetic undertone almost gone. \"Most commanders push augmented personnel to maximum throughput until we break. Then they replace us.\" They adjust their sensory parameters — you can see the micro-movements in their temple implants. \"I'll set threat assessment to periodic sweeps rather than continuous monitoring. Efficiency drops by twelve percent, but sustainability increases by three hundred.\" A pause. \"Thank you, Commander. It's been a long time since anyone treated my neural architecture as something worth preserving.\"",
          },
          {
            id: "cyb_perception_upgrade",
            label: "\"What if we upgraded your processing capacity instead?\"",
            text: "What if we upgraded your processing capacity instead?",
            effects: { loyalty: 5, combat: 4, credits: -10000 },
            response: "All six eyes widen simultaneously — an effect that would be terrifying if it weren't clearly excitement. \"Upgrade?\" The word comes out in dual-harmonic — organic and synthetic in perfect unison. \"A next-generation threat processor would eliminate the neural bottleneck entirely. Quantum-parallel architecture. I could process ten thousand threat assessments per hour without organic degradation.\" They step forward, servos humming. \"The cost is significant, and the surgery carries risk. But the result would be... Commander, I would be able to protect you from threats that haven't been invented yet. I could see the future, in a sense. In probability matrices, at least.\"",
          },
        ],
      },
      {
        id: "cyb_humanity",
        title: "WHAT REMAINS",
        opening: "You find them standing in front of a mirror in the barracks — an unusual sight. They're examining their reflection with an expression that transcends their augmentations. \"Sixty-three percent,\" they say without turning around. They know you're there — they always know. \"That's how much of my original body remains. Sixty-three percent organic. The rest is titanium, synthetic muscle, neural polymers, and enough processing power to run a small city's traffic grid.\" They touch the chrome plating along their jaw. \"I had a face, once. Before the augmentation program. I remember it was... unremarkable. Ordinary.\" Their organic eye — the one remaining — glistens. \"I miss ordinary, Commander.\"",
        choices: [
          {
            id: "cyb_humanity_person",
            label: "\"You're still a person. The metal doesn't change that.\"",
            text: "You're still a person. The metal doesn't change that.",
            effects: { loyalty: 15, xp: 50 },
            response: "They turn from the mirror. The organic eye is wet; the augmented ones simply glow steadily. \"A person.\" They process the word — you can see the subtle temple-implant flickers as emotional and analytical pathways conflict. \"My therapist said the same thing. Before the therapist's office was bombed. Before I was reassigned.\" They sit on the bunk — servos whining as they redistribute weight. \"You know what the worst part is? I can access my pre-augmentation memories with perfect clarity. Neural backup. I can remember exactly what it felt like to touch something without calculating its structural integrity. To hear music without frequency analysis. To just... exist.\" They look at you. \"But hearing you say that makes the sixty-three percent feel like enough.\"",
          },
          {
            id: "cyb_humanity_strength",
            label: "\"Ordinary gets people killed. What you are keeps them alive.\"",
            text: "Ordinary gets people killed. What you are keeps them alive.",
            effects: { loyalty: 5, combat: 4, defenseRating: 1 },
            response: "The analytical pathways win. The organic eye dries. The augmented ones brighten. \"Functional perspective. Correct.\" They straighten — full height, which is considerable with the spinal augmentation. \"Ordinary is a luxury this city can't afford. You need someone who can track seventeen targets simultaneously, process ballistic trajectories in real-time, and interface directly with the city's security grid.\" They turn from the mirror with finality. \"Ordinary people can't do that. I can. And I will.\" A servo whirs — their fist clenching. \"The mirror stays here. I won't look at it again.\"",
          },
          {
            id: "cyb_humanity_remember",
            label: "\"Tell me about who you were. Before all this.\"",
            text: "Tell me about who you were. Before all this.",
            effects: { loyalty: 12, xp: 40, happiness: 1 },
            response: "They sit down. The bunk groans under augmented weight. \"I was a school teacher.\" They let that land. \"Mathematics. Levels six through twelve. Block 22, Sector East.\" A ghost of a smile on the organic half of their face. \"When the plagues hit, they needed volunteers for the augmentation program. 'Serve your city,' they said. 'Temporary enhancement.' That was eleven years ago.\" They hold up a chrome hand. \"My students wouldn't recognise me now. But I still run calculations in my head for fun. Quadratic equations. They're... calming.\" They look at you. \"Strange, isn't it? A living weapon who finds peace in algebra.\"",
          },
        ],
      },
    ],
  },
  {
    classId: "clone_double",
    topics: [
      {
        id: "cd_identity",
        title: "THE MIRROR",
        opening: "They're sitting in your chair. Wearing your clothes. Using your gestures. It's like looking into a mirror that moves independently. \"Good morning, Commander.\" Your voice. Your intonation. Your slight pause before the honorific. \"Don't worry — your 3pm with the Chancellor has been rescheduled. I attended. They didn't notice.\" They lean back — your lean, your angle. \"That's four times this month I've been you. And each time...\" They falter. Something not-you crosses their face. \"Each time, I forget a little more about who I was before I became you.\"",
        choices: [
          {
            id: "cd_identity_comfort",
            label: "\"You're not losing yourself. You're becoming something new.\"",
            text: "You're not losing yourself. You're becoming something new.",
            effects: { loyalty: 12, xp: 30 },
            response: "They study you with your own eyes — same colour, same depth, but there's a searching quality that's theirs alone. \"Something new.\" They stand and move to the window — and for a moment, the silhouette could be either of you. \"The cloning process copies everything. Memories, reflexes, even scars. But it doesn't copy... meaning. Your scars tell your story. Mine are just... decoration.\" They turn back. \"But maybe you're right. Maybe I'm not a copy. Maybe I'm a continuation. A branch of the same tree.\" The faintest smile — and this one is genuinely theirs. \"I'd like to believe that, Commander. I'd like that very much.\"",
          },
          {
            id: "cd_identity_boundaries",
            label: "\"We need boundaries. You are you. I am me. That's the deal.\"",
            text: "We need boundaries. You are you. I am me. That's the deal.",
            effects: { loyalty: 5, combat: 2, corruption: -1 },
            response: "They blink — both your blink and something sharper. \"Boundaries. Yes.\" They stand from your chair, tugging at the collar of your — their — the jacket. \"I'll establish identity protocols. Separate quarters. Different casual clothing. A name that's mine, not yours.\" They walk to the other side of the desk. \"The doubles program was designed to erase individuality. Make us interchangeable. Disposable.\" They meet your eyes. \"You're the first source-template who's treated their clone as a separate person. That's either very enlightened or very dangerous. Either way, I appreciate it.\"",
          },
          {
            id: "cd_identity_use",
            label: "\"That's the point. You become me so I can be everywhere.\"",
            text: "That's the point. You become me so I can be everywhere.",
            effects: { loyalty: -2, combat: 3, credits: 2000 },
            response: "Your expression — on their face — goes blank. Professional. \"Of course, Commander. Function over identity. That's the programme.\" They straighten your tie — their tie — the tie. \"I'll continue the scheduled appearances. The factions can't know there's only one of you. The illusion of omnipresence is worth more than any army.\" They head for the door, and for a moment they pause. When they speak, their voice is still yours, but the words are entirely their own. \"Just remember, Commander — every time I walk into a room as you, someone might try to kill me instead. That's the deal too.\" The door closes. Your office feels emptier than it should.",
          },
        ],
      },
      {
        id: "cd_existential",
        title: "WHEN I DREAM",
        opening: "It's after midnight. They knock — they always knock, even though they have your biometric access. \"Commander. I need to... talk.\" They're in civilian clothes for once — they look like you on a day off, which is profoundly strange. \"I've been having dreams. Your dreams. The cloning process transferred your neural patterns, and apparently that includes REM architecture.\" They sit uninvited. \"Last night I dreamed about your mother. I called her 'mum.' I knew her favourite song. I felt grief that she was gone.\" They look at their hands — your hands, copied perfectly. \"How do I grieve for a woman who was never my mother? How do I miss a childhood I never had?\"",
        choices: [
          {
            id: "cd_existential_share",
            label: "\"Those memories... they're a gift. She would have liked you.\"",
            text: "Those memories... they're a gift. She would have liked you.",
            effects: { loyalty: 15, happiness: 1, xp: 50 },
            response: "They don't cry — clones have suppressed tear ducts, a design choice they've always hated. But their breathing changes. Becomes ragged. Human. \"A gift.\" They press your mother's favourite song — they know it because you know it — from a small speaker. The melody fills the room. \"She made bread on Sundays. Real bread, from salvaged flour. The apartment smelled like warmth.\" They look up. \"I know that's your memory. But when I close my eyes, I can smell it too. And it feels real.\" They straighten. \"Thank you, Commander. For sharing her. Even if it wasn't intentional.\"",
          },
          {
            id: "cd_existential_clinical",
            label: "\"It's a neural echo. Nothing more. Focus on the mission.\"",
            text: "It's a neural echo. Nothing more. Focus on the mission.",
            effects: { loyalty: -5, combat: 3 },
            response: "Something closes behind their eyes — your eyes. \"Neural echo. Right.\" They stand. The civilian clothes suddenly look wrong on them, too soft, too personal. \"I'll consult the medical division about suppressant protocols. Eliminate the REM bleed-through.\" They're at the door before they turn. \"You know, Commander — the difference between a neural echo and a real emotion is measurable in milliseconds. Neurologically, they're identical. The grief feels the same. The love feels the same.\" A beat. \"But I suppose that's not your problem. It's mine. Just a clone's malfunction.\" The door closes softly. Somehow that's worse than a slam.",
          },
          {
            id: "cd_existential_truth",
            label: "\"I dream about her too. We can share that grief. It's real enough.\"",
            text: "I dream about her too. We can share that grief. It's real enough.",
            effects: { loyalty: 18, xp: 60, happiness: 1 },
            response: "The room is very quiet. Outside, the city pulses with its usual low-frequency menace. But in here, for a moment, it's just two people who remember the same woman's smile. \"Real enough,\" they repeat. And then something extraordinary happens — they laugh. Your laugh, yes, but lighter. Freer. \"She would have been horrified by all this. The cloning, the war, the city. She would have made us both sit down and eat bread and talk about something normal.\" They lean back. \"I'm not you, Commander. I know that. But maybe I'm not nobody, either. Maybe I'm the part of you that still remembers how to be human.\" They offer their hand — your hand. You take it. The grip is identical. The meaning is entirely different.",
          },
        ],
      },
    ],
  },
  {
    classId: "netrunner",
    topics: [
      {
        id: "nr_signal",
        title: "WHAT THE WIRES SAY",
        opening: "They don't look up when you enter. Three monitors, each running a different stream of compressed traffic. Their pupils are dilated to the size of credit chips — neural feed running hot. \"Commander.\" The voice is flat, processed through a throat that hasn't spoken aloud in days. \"I've been listening to your enemies for forty hours. They don't know I exist. They think their encryption holds.\" A thin smile. \"It doesn't. What do you want me to do with what I've learned?\"",
        choices: [
          {
            id: "nr_signal_blackmail",
            label: "\"Sell it back to them. Make them pay to keep their own secrets.\"",
            text: "Sell it back to them. Make them pay to keep their own secrets.",
            effects: { credits: 1500, corruption: 2, loyalty: 4 },
            response: "A laugh, quiet and dry. \"Now you're thinking like a netrunner.\" Their fingers move across an interface you can't see. \"By morning three megacorps and a senator will receive identical anonymous offers. They'll all pay. They always do.\" The monitors flicker. \"The credits route through seven shell accounts before they reach the treasury. Untraceable. Disgusting. Profitable.\" They finally look at you. \"You realise this is how I'll eventually be killed, yes?\"",
          },
          {
            id: "nr_signal_burn",
            label: "\"Burn the intel. Leak it everywhere. No one profits, including us.\"",
            text: "Burn the intel. Leak it everywhere. No one profits, including us.",
            effects: { corruption: -4, unrest: 1, loyalty: 8 },
            response: "Their hands stop moving. \"You're going to dump it. Open feed. Free.\" A long silence. \"I've worked for six different employers, Commander. None of them ever told me to give the data away.\" They begin typing again, faster now. \"Within the hour every undercity broadcaster will have it. The corpos will spend a year cleaning up. Some of them won't survive it.\" A genuine, surprised expression. \"That was almost moral. I'm not used to moral.\"",
          },
          {
            id: "nr_signal_keep",
            label: "\"Catalogue it. We use it when we need it. Not before.\"",
            text: "Catalogue it. We use it when we need it. Not before.",
            effects: { loyalty: 6, xp: 30, defenseRating: 1 },
            response: "A nod. \"Patient. Strategic. I respect that.\" They pull up an encrypted vault interface. \"Tagged, indexed, cross-referenced. I'll add to it as new traffic comes in. By the time you need leverage on someone, the file will already exist.\" They glance sideways. \"Word of advice, Commander — the moment a target realises this archive exists, they will spend any amount to destroy it. And me. Keep it dark.\"",
          },
        ],
      },
    ],
  },
  {
    classId: "marksman",
    topics: [
      {
        id: "mk_overwatch",
        title: "THE LONG SHOT",
        opening: "You find them on the roof — prone, motionless, optic raised. They've been here since before dawn. They don't lower the rifle as you approach. \"Commander. Stay low. There's a reflective surface at your two o'clock that I've been trying to get the building manager to remove for eleven days.\" They finally pull back from the scope. \"I had a clean shot on someone watching this rooftop yesterday. Didn't take it. Wanted to talk to you first. Permission to shoot first next time?\"",
        choices: [
          {
            id: "mk_overwatch_kill",
            label: "\"Anyone watching this rooftop dies. No exceptions, no warnings.\"",
            text: "Anyone watching this rooftop dies. No exceptions, no warnings.",
            effects: { loyalty: 6, defenseRating: 2, unrest: 1 },
            response: "\"Understood.\" They settle back into the prone position with a slow exhale. \"Standing weapons-free order. I'll log every confirmed kill, you'll get a daily report.\" The optic raises again. \"Fair warning, Commander — half the people who watch your rooftop are journalists, the other half are corporate spies, and a few are competing factions doing reconnaissance. The bodies are going to add up fast.\" A pause. \"I'm fine with that.\"",
          },
          {
            id: "mk_overwatch_capture",
            label: "\"Wound them. I want to know who sent them.\"",
            text: "Wound them. I want to know who sent them.",
            effects: { loyalty: 4, corruption: -2, xp: 40 },
            response: "A slow breath. \"Wounding shots are harder than kill shots. You shoot to disable, you have to account for what they're holding, what's behind them, whether they bleed out before recovery teams arrive.\" The optic adjusts. \"I'll do it. Knee shots, dominant shoulder, weapon-hand. They'll talk. They always talk after the third surgery.\" A glance at you. \"You want intelligence over deterrence. Smart. Slow, but smart.\"",
          },
          {
            id: "mk_overwatch_present",
            label: "\"Don't shoot. Let them watch. I want to see who flinches first.\"",
            text: "Don't shoot. Let them watch. I want to see who flinches first.",
            effects: { loyalty: 2, combat: 4, lawOrder: -1 },
            response: "Silence. Then a single, unimpressed grunt. \"You want to play eye-contact with assassins, Commander. From sixteen hundred metres. Through three layers of glass.\" They re-settle the rifle. \"Fine. I'll log positions, faces, equipment loadouts. Build dossiers. When you eventually decide to act — and you will — I'll already know everything about them.\" A beat. \"For the record: this is the most patient thing anyone has ever asked me to do. I am not naturally patient.\"",
          },
        ],
      },
    ],
  },
  {
    classId: "inquisitor",
    topics: [
      {
        id: "iq_tribunal",
        title: "THE CASE FILE",
        opening: "They place a sealed file on your desk. The cover is stamped INTERNAL AFFAIRS — EYES ONLY. \"Commander. I've completed the audit you didn't authorise.\" Their voice is neutral, courtroom-flat. \"Seventeen names. Three are senior staff. One is in this building right now. The evidence is admissible, the chain of custody is clean, and the punishment is, by statute, execution.\" They fold their hands. \"I serve the office, not the officeholder. So I'm asking, formally — do we proceed?\"",
        choices: [
          {
            id: "iq_tribunal_full",
            label: "\"Proceed. By the statute. All seventeen.\"",
            text: "Proceed. By the statute. All seventeen.",
            effects: { corruption: -8, unrest: 3, loyalty: 10, lawOrder: 3 },
            response: "A single nod. \"By the statute. All seventeen.\" They retrieve the file. \"Tribunals begin tomorrow at 0600. Public record, public sentencing, public execution. The rank-and-file will understand the message within forty-eight hours.\" At the door, they turn back. \"For what it's worth, Commander — most leaders, when handed a list with their friends on it, find a reason to lose three or four pages. You didn't. The institution will remember that.\"",
          },
          {
            id: "iq_tribunal_partial",
            label: "\"Bring me the seniors quietly. The rest get exile.\"",
            text: "Bring me the seniors quietly. The rest get exile.",
            effects: { corruption: -4, unrest: -1, loyalty: 4, lawOrder: 1 },
            response: "A measured pause. \"Selective. Discreet at the top, lenient at the bottom.\" Their expression is unreadable. \"It is not how the statute reads. But it will work. The seniors will be processed in closed chambers — the public will know only that they 'retired.' The fourteen others receive walking papers and one-way passes to the wastes.\" A small, professional dip of the head. \"Politics, Commander. I disapprove. I will execute it flawlessly.\"",
          },
          {
            id: "iq_tribunal_bury",
            label: "\"Bury the file. The institution can't survive seventeen tribunals.\"",
            text: "Bury the file. The institution can't survive seventeen tribunals.",
            effects: { corruption: 6, loyalty: -8, unrest: -2, lawOrder: -2 },
            response: "Long silence. The neutrality finally cracks. \"You are asking me to suppress evidence I gathered legally, Commander.\" Each word is weighed. \"I will do it. Once. Because I understand the calculus, and because the institution surviving matters more than any single case.\" They take the file back, slowly. \"But understand — this conversation is now also evidence. Filed where I can find it. If I am ever the seventeenth name on someone else's list, this file walks itself out of the vault. Are we clear?\"",
          },
        ],
      },
    ],
  },
  {
    classId: "wasteland_scout",
    topics: [
      {
        id: "ws_horizon",
        title: "WHAT'S COMING IN",
        opening: "They've tracked dust on your floor — boots barely cleaned, a rebreather still hanging at their throat. \"Commander. Just rode in. Two hundred klicks east, there's a column moving toward the wall. Heavy vehicles, irregulars, raider colours — but the column is too disciplined for raiders.\" They pull a folded paper map from their jacket. Actual paper. \"Someone's pretending to be raiders. They'll be at the perimeter in nine days. What do you want done?\"",
        choices: [
          {
            id: "ws_horizon_strike",
            label: "\"Hit them in the wastes. Don't let them reach the wall.\"",
            text: "Hit them in the wastes. Don't let them reach the wall.",
            effects: { loyalty: 6, defenseRating: 2, unrest: -1 },
            response: "A grin, weather-cracked. \"Now we're speaking the same dialect.\" They tap a point on the map. \"There's a dry riverbed seventy klicks out. Choke point. They'll have to file through in single column. Send me three of your heavy units and I'll have the column burning before they know we were there.\" They roll up the map. \"Wasteland law, Commander — never let trouble pick the ground.\"",
          },
          {
            id: "ws_horizon_intel",
            label: "\"Don't engage. Find out who's pretending to be raiders, and why.\"",
            text: "Don't engage. Find out who's pretending to be raiders, and why.",
            effects: { loyalty: 5, corruption: -3, xp: 30 },
            response: "A slow nod. \"That's the harder play. Means I ride parallel for a week, eat dust, sleep in shifts.\" They check the rebreather seal. \"But — yeah. Raider colours on a disciplined column means a corp or a faction is laundering aggression. Find out who, you've got leverage for years.\" A glance at you. \"I'll need a clean radio and someone at this end who picks up on the first burst. People die fast in the wastes when their relay goes quiet.\"",
          },
          {
            id: "ws_horizon_seal",
            label: "\"Pull everyone behind the wall. Let them break themselves on it.\"",
            text: "Pull everyone behind the wall. Let them break themselves on it.",
            effects: { loyalty: -3, defenseRating: 3, unrest: 2 },
            response: "The grin fades. \"Hide-behind-the-wall doctrine. Old commanders' favourite.\" They tuck the map away with deliberate slowness. \"It works, Commander. Walls are good walls. But every time the city pulls in, the wastes get a little braver. A little hungrier. The next column won't be nine days out — it'll be five. Then three.\" They turn for the door. \"Your call. I'll make sure the perimeter knows they're coming. After that, it's the gunners' problem, not mine.\"",
          },
        ],
      },
    ],
  },
];

export function getRetinueTopics(classId: BodyguardClass): DialogueTopic[] {
  return RETINUE_DIALOGUES.find((d) => d.classId === classId)?.topics ?? [];
}
