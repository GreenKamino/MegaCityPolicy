import { useState } from "react";

const SHORT_DESCRIPTION = `Govern a post-collapse megacity of 980,000 citizens. 271 districts. 10 factions. 520+ technologies. 838 commodities. 1,150+ events. Everything is on fire, the budget is imaginary, and a vending machine just filed for union representation. Real-time or turn-based. No microtransactions.`;

const ABOUT_THIS_GAME = `[h2]The world ended. The paperwork didn't.[/h2]

You are the Sector Marshal of a megacity housing nearly one million people in 271 districts of crumbling concrete, humming reactors, and questionable plumbing. You didn't build this city. You inherited it. Half the infrastructure predates the collapse, two factions want you dead, one wants to worship you, and someone in Sector 7 has declared their hab-block an independent nation.

You are part mayor, part warlord, part bureaucrat. The only thing standing between civilisation and total urban meltdown. You are not paid enough for this.

This is not a city builder. The city already exists. Your job is to stop it from killing itself.

[h2]WHAT YOU'RE GETTING INTO[/h2]

MEGACITY is a dystopian idle/strategy management simulation with the depth of a spreadsheet and the soul of a 2000AD comic. You govern through edicts, policies, espionage, diplomacy, military force, and the occasional act of bureaucratic desperation. Resources, crime, factions, weather, morale, trade, corruption — all simulated. Plus the persistent rumour that the rats have organised.

Deeply systemic, darkly funny, and will ruin your evening in the best possible way.

[h2]THE CITY[/h2]

[list]
[*] [b]271 districts[/b] — administrative sectors, industrial zones, slums, reactors, water treatment, and hab-blocks described as "affordable, functional, and only slightly depressing"
[*] [b]~980,000 citizens[/b] — workers, elites, criminals, mutants, clones, and a statistical minority who are genuinely happy
[*] [b]9 resources[/b] — Credits, Food, Water, Power, Steel, Goods, Fuel, Medical Supplies, Ammunition. If any hit zero, something terrible happens. If several hit zero simultaneously, something cinematic happens
[/list]

[h2]FACTIONS[/h2]

[b]10 rival factions[/b] (plus 2 hidden), each with leaders, intelligence dossiers, and opinions about how you're doing (badly, mostly):

[list]
[*] [b]The Authority[/b] — order through overwhelming force and reduced sentencing
[*] [b]MegaCorp Syndicate[/b] — corporate oligarchs who view your budget as a suggestion
[*] [b]The Eternal Flame[/b] — nuclear-worshippers who consider safety protocols blasphemy
[*] [b]Mutant Collective[/b] — the irradiated underclass demanding equal rights
[*] Plus underground geneticists, wasteland warlords, tech-zealots, and more
[/list]

And [b]13 external megacities and nations[/b] — from the gleaming fortress of Nova Pacifica to the Iron Khanate's nomad empire to Mega-Habana's neon-soaked Caribbean coast. Trade. Spy. Destabilise. Pretend you didn't.

[h2]CRIME & ENFORCEMENT[/h2]

[b]135 crime types[/b] across 18 categories — violent, financial, narcotics, cybernetic, genetic, biosphere, and crimes so new the legal system hasn't named them yet.

[b]54 named gangs[/b] with full intelligence dossiers — history, ideology, territory, rumours. The Neon Reapers are bruisers. The Church of the Machine believes flesh is sin. The Memory Merchants will sell you someone else's childhood.

Deploy judges, soldiers, enforcers, and riot mechs. Or don't. See what happens.

[h2]RESEARCH & INDUSTRY[/h2]

[list]
[*] [b]524 technologies[/b] across 32 categories and 5 tiers — from power grid maintenance to orbital weapons platforms, plus a dedicated Statecraft & Shadow Ops tree
[*] [b]838 tradeable commodities[/b] on a dynamic supply-and-demand market with regional scarcity
[*] [b]90 contracts[/b] with 250+ supply chain recipes
[*] [b]100 licensed corporations[/b] across 10 sectors — MegaBuild Corp: "Fastest builds in the sector. Don't ask how. The cracks are cosmetic. Mostly."
[*] [b]303 weapons & ordnance[/b] — sidearms to nuclear warheads, with deterrence vs. maintenance trade-offs
[/list]

[h2]YOUR COMMANDER[/h2]

You aren't just a cursor. You're a character with stats, skills, and a growing list of regrets.

[list]
[*] [b]5 attributes[/b] — Authority, Intelligence, Charisma, Combat, Endurance
[*] [b]12 skills[/b] — Leadership, Tactics, Diplomacy, Black Ops, and more
[*] [b]Perks every 5 levels[/b] across Command, Warfare, Economics, Administration, Espionage
[*] [b]Dynamic titles[/b] — City Commander → District Warden → War Sovereign → Apex Commander → Eternal Marshal
[*] [b]112 cybernetic implants[/b] across 6 body regions, up to the experimental Transcendence Core
[*] [b]Reputation[/b] tracked across 5 axes — Mercy, Fear, Transparency, Populism, Stability. The city remembers
[/list]

[h2]YOUR PEOPLE[/h2]

[b]Bodyguard Retinue[/b] — recruit up to 8 elite operatives across 5 classes. They level up, hold opinions, and run 19 companion missions with stat-based outcomes. Injuries happen. Loyalty shifts. The occasional spectacular failure is educational.

[b]Inner Circle[/b] — 8 advisory roles with unique perk trees and a whisper feed that alerts you to threats, opportunities, and personal grievances. Listen. Or don't.

[b]Officers[/b] — 105 positions across 11 departments, with traits like Efficient, Corrupt, Strategist, Populist. Competence matters. Loyalty matters more. Corruption festers quietly until it doesn't.

[h2]MILITARY[/h2]

Form squads from [b]12 troop classes[/b], promote through 6 tiers (Recruit → Champion), hire captains with 8 traits (Disciplinarian, Tactician, Berserker, Inspiring, Cunning, Ironwall, Ruthless, Mentor), and unlock squad synergies like Combined Arms and Medic Corps. 4 specialisation paths. Lifetime kill tracking for every squad.

[h2]FAITH & THE LEADER CULT[/h2]

Seven street faiths drift through the city's [b]271 districts[/b], each pulling at loyalty, crime, corruption, and unrest in different ways:

[list]
[*] [b]The Ancestor Cult[/b] — bloodlines, memory, and grudges that outlive their owners
[*] [b]The Machine Choir[/b] — the holy hum of the reactors and the gospel of well-oiled gears
[*] [b]The Eternal Flame[/b] — nuclear theologians who consider safety regulations a personal insult
[*] Plus the Ledger, the Tidekeepers, the Helix Commune, and the Free Choir — seven faiths in all
[/list]

For each faith you can [b]Sponsor[/b], [b]Tolerate[/b], or [b]Suppress[/b] — every choice carries a passive trade-off. Watch the composition bar shift, tick by tick, as propaganda, suppression, and the occasional miracle drag districts toward one belief or another.

When a faith dominates the city, you can declare yourself its [b]Leader[/b]. Gain loyalty floors, propaganda multipliers, and an extra edict slot — but inherit corruption, unrest, faction blowback, schisms, heresies, and the occasional assassin. Renounce the cult later if it costs you more than it pays. Or stay secular forever. Faith is opt-in. The consequences are not.

[h2]THE WASTELAND[/h2]

Beyond the walls: irradiated wastes, toxic rivers, overgrown ruins, and people who chose to live out there on purpose.

[list]
[*] 30 exploitable resource nodes — scrap, fuel, minerals, water, bio-specimens, tech salvage
[*] 15+ townships with unique trade specialisations
[*] Raider gangs with lore, ideology, and questionable life choices
[*] Wasteland expeditions with risk-reward mechanics
[/list]

[h2]EVENTS[/h2]

[b]1,150+ events[/b] and [b]100+ multi-stage event chains[/b] with branching consequences:

[list]
[*] Wasteland caravans at the gates — trade or turn them away?
[*] Rogue AI loose in the data networks — hunt it, contain it, or recruit it?
[*] A conspiracy theorist who was right about everything — hire him or silence him?
[*] Actual coffee discovered in the wasteland — strict rationing or public auction?
[*] A vending machine has achieved sentience and is demanding workers' rights
[*] The pigeons have returned. They remember everything
[*] An accidental utopia formed in Sector 9. It's making the other sectors look bad
[/list]

Most consequences are bad. Some are funny. A few are both.

[h2]THE NEWS NEVER STOPS[/h2]

A relentless ticker of [b]350+ satirical headlines[/b]:

[i]"SECTOR 12 INTRODUCES DEMOCRACY — FIRST VOTE: ABOLISH DEMOCRACY — MOTION CARRIED UNANIMOUSLY"[/i]

[i]"THERAPY BOT ACHIEVES SENTIENCE — IMMEDIATELY REQUESTS THERAPY"[/i]

[i]"MANDATORY FUN DAY CANCELLED DUE TO INSUFFICIENT ENTHUSIASM — PARTICIPANTS FINED"[/i]

[i]"WEATHER SATELLITE REPORTS SUNNY SKIES — SATELLITE LAST CALIBRATED 40 YEARS AGO"[/i]

[h2]MANAGEMENT IN DEPTH[/h2]

[list]
[*] [b]100 spy operations[/b] across 17 categories — recon, sabotage, assassination, propaganda, cyber ops, ultra black ops
[*] [b]77 edicts[/b] and [b]260 policies[/b] — from sensible governance to authoritarian overreach your advisors will politely suggest you reconsider
[*] [b]80 software upgrades[/b] for city systems — even dystopian infrastructure needs patches
[*] [b]40+ weather types[/b] across seasons, affecting economy, morale, crime, and disease
[*] [b]16+ mega-projects[/b] that take months and reshape the skyline
[*] [b]Space Command[/b] — orbital operations and satellite infrastructure
[*] [b]Prestige & Legacy[/b] — rebirth system with 7 legacy bonuses
[*] [b]400+ achievements[/b] across 15 categories — rewards for competence, catastrophe, and creative negligence
[*] [b]42 collectible lore entries[/b] across 8 categories and 4 rarity tiers
[/list]

[h2]TWO WAYS TO RUN THE CITY[/h2]

Every new city asks one question before the trouble starts: real-time or turn-based?

[list]
[*] [b]Real-time[/b] — the city lives on its own clock. Ticks pass, crises erupt, and the simulation keeps going whether you're watching or not. The classic idle experience.
[*] [b]Turn-based[/b] — nothing moves until you press End Turn. Read every report, weigh every decree, take all the time you need. A crisis that erupts mid-turn pauses the day until you've dealt with it.
[/list]

Inside the walls, democracy is mostly for show. This choice, however, is genuinely yours.

[h2]IDLE-FRIENDLY[/h2]

In real-time mode the simulation ticks while you're away — default 5 minutes per tick, configurable from 1 to 60 — with full offline catch-up. Auto-save, six labelled save slots with one-tap backup/restore, no internet required.

[list]
[*] [b]Offline simulation depth[/b] — pick LITE, STANDARD, or DEEP per profile. The resume estimate next to each option uses your device's measured tick cost so you know exactly what you're trading.
[*] [b]Steam Cloud[/b] — saves and commander profiles both sync across devices. Start on the desktop, finish on the Steam Deck.
[*] [b]Player portraits[/b] — 8 sex-filtered commander portraits, swappable any time from the profile menu.
[/list]

Your city will be fine. Your city will not be fine. But it will have progressed.

[h2]CRAFTED, NOT GENERATED[/h2]

Every event, headline, gang dossier, and faction leader's neuroses — handwritten by one developer inspired by Warsim: The Realm of Aslona, the dark absurdity of 2000AD comics, and the firm belief that management games should make you laugh while everything you've built catches fire.

No microtransactions. No pay-to-win. No loot boxes. No battle passes. Just a city that needs running and a Marshal who signed up for this.

[i]The world ended. The paperwork didn't.[/i]`;

const KEY_FEATURES = `- Dystopian idle/strategy city management
- Real-time or turn-based — choose your pace per city
- 271 districts, ~980K citizens
- 10 factions (+2 hidden) and 13 external megacities/nations
- 524 technologies, 838 commodities, 303 weapons
- 1,150+ events and 100+ event chains
- 54 named gangs, 135 crime types
- 90 contracts, 100 corporations
- 350+ dark humor news headlines
- 12 troop classes with squad synergies
- 7 street faiths with optional Leader Cult path (or stay secular)
- 5-class bodyguard retinue with 19 missions
- 8 inner circle advisors, 105 officer positions
- Commander progression: 5 attributes, 12 skills, perks, traits
- 112 cybernetic implants across 6 body regions
- 100 spy ops, 77 edicts, 260 policies
- Seasons, weather, space command, mega-projects
- 400+ achievements, 42 collectible lore entries
- Prestige/legacy rebirth system
- Idle-friendly with configurable offline simulation depth (Lite/Standard/Deep)
- Steam Cloud syncs both saves and commander profiles across devices
- No microtransactions, no pay-to-win
- Solo-developed`;

type SectionKey = "short" | "about" | "features";

interface Section {
  key: SectionKey;
  title: string;
  hint: string;
  text: string;
}

const SECTIONS: Section[] = [
  {
    key: "short",
    title: "Short Description",
    hint: "Steam limit 300 characters",
    text: SHORT_DESCRIPTION,
  },
  {
    key: "about",
    title: "About This Game",
    hint: "The long store description (paste into the main body)",
    text: ABOUT_THIS_GAME,
  },
  {
    key: "features",
    title: "Key Features",
    hint: "The bulleted sidebar list",
    text: KEY_FEATURES,
  },
];

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function CopyCard({ section }: { section: Section }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const charCount = section.text.length;

  const handleCopy = async () => {
    const ok = await copyToClipboard(section.text);
    setStatus(ok ? "copied" : "error");
    window.setTimeout(() => setStatus("idle"), 2500);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-cyan-500/25 bg-slate-900/70 shadow-lg shadow-black/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-cyan-300">
            {section.title}
          </h2>
          <p className="text-xs text-slate-400">
            {section.hint} · {charCount.toLocaleString()} characters
          </p>
        </div>
        <button
          onClick={handleCopy}
          className={`min-w-[132px] rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
            status === "copied"
              ? "bg-emerald-500 text-white"
              : status === "error"
                ? "bg-amber-500 text-black"
                : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          }`}
        >
          {status === "copied"
            ? "Copied"
            : status === "error"
              ? "Press Ctrl+C"
              : "Copy"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-relaxed text-slate-300">
        {section.text}
      </pre>
    </div>
  );
}

export function StoreCopy() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-white">
            MEGACITY — Steam Store Copy
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Click a Copy button, then paste straight into Steamworks. Each
            button copies that whole section to your clipboard.
          </p>
        </header>
        <div className="flex flex-col gap-5">
          {SECTIONS.map((section) => (
            <CopyCard key={section.key} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}
