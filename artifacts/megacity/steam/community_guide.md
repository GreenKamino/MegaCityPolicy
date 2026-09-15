[h1]MEGACITY: Sector Marshal — Beginner's Guide[/h1]

[i]The world ended. The paperwork didn't. This guide gets you through your first hour without your city collapsing. Probably.[/i]

[b]Last updated:[/b] launch build
[b]Audience:[/b] new Marshals
[b]Spoilers:[/b] mechanics yes, lore no

---

[h2]What kind of game is this?[/h2]

MEGACITY is a [b]dystopian idle/strategy management sim[/b] — somewhere between Dwarf Fortress, Reigns, and a corrupt city council meeting. You [i]inherit[/i] a megacity of ~980,000 citizens across 268 districts. You don't build it. You stop it from killing itself.

It runs on a [b]tick system[/b]. In [b]real-time mode[/b] ticks fire automatically (default: 5 min per tick) — it's offline-friendly, idle-friendly, and ticks while you're away. In [b]turn-based mode[/b] nothing moves until you end your turn, and each turn stops on any crisis so you can respond. There is no fixed win condition — survive, ascend, or burn out spectacularly.

[h2]The five things that kill new Marshals[/h2]

[olist]
[*][b]Ignoring the Inbox.[/b] Press [b]Q[/b]. Read everything. The Council does not call again unless you fail.
[*][b]Building factories before housing.[/b] Unhoused citizens breed crime. Crime breeds gangs. Gangs breed everything else.
[*][b]Hitting zero water or food.[/b] Riots within ticks. Watch the [b]delta[/b], not the total. A stockpile of 10,000 food at -200/tick is just a slower death.
[*][b]Antagonising every faction at once.[/b] Two plotting is survivable. Six isn't. Read [b]Factions[/b] (R) and balance.
[*][b]Rushing your decisions.[/b] In real-time mode [u]Space[/u] pauses — the simulation will wait, the Council will not. In turn-based mode nothing moves until you end your turn, so plan before you advance.
[/olist]

[h2]Your first hour, step by step[/h2]

[b]Tick 1–10 — Stabilise[/b]
[list]
[*]Read the welcome dispatch in your Inbox.
[*]Open [b]CITY[/b] (1) — confirm no stockpile is bleeding red.
[*]Open [b]LAW[/b] (2) — deploy a Patrol unit if crime is creeping up.
[*]Open [b]BUILD[/b] (5) — drop a Hab Block Mega-Tower if anyone is unhoused.
[*]Real-time mode: press [b]Space[/b] to pause freely, speed up with [b]+[/b] when stable. Turn-based mode: press [b]End Turn[/b] (Space) to advance when you're ready.
[/list]

[b]Tick 10–25 — Expand[/b]
[list]
[*]Build at least one revenue source — Tax Office, Trading Post, or license a corporation in [b]Commercial Licensing[/b].
[*]Queue a Tier 1 research project (W). Resource production unlocks pay back fastest.
[*]Hit [b]Recruitment[/b] (More → Recruitment) and hire essential officers. Even a mediocre Treasurer earns their salary.
[/list]

[b]Tick 25–100 — Settle in[/b]
[list]
[*]Open [b]Diplomacy[/b] (6) and broker a trade pact with an external megacity.
[*]Pick a [b]faith stance[/b] for each of the eight street faiths (Sponsor / Tolerate / Suppress). Sponsoring one costs nothing and stabilises districts.
[*]Skim the [b]Codex[/b] (More → Codex). It's a 60-entry searchable manual baked into the game.
[/list]

[h2]The 9 resources you need to know cold[/h2]

[table]
[tr][th]Resource[/th][th]What it does[/th][th]Critical level[/th][/tr]
[tr][td]Credits[/td][td]Pays for everything[/td][td]< 5,000[/td][/tr]
[tr][td]Food[/td][td]Citizens starve without it[/td][td]< 50[/td][/tr]
[tr][td]Water[/td][td]Riots within ticks if zero[/td][td]< 50[/td][/tr]
[tr][td]Power[/td][td]Negative = brownouts, factories halt[/td][td]< 0 MW[/td][/tr]
[tr][td]Steel[/td][td]Construction material[/td][td]< 20 tons[/td][/tr]
[tr][td]Goods[/td][td]Consumer happiness[/td][td]< 20[/td][/tr]
[tr][td]Fuel[/td][td]Industry & military[/td][td]< 10 barrels[/td][/tr]
[tr][td]Med Supplies[/td][td]Outbreaks, combat[/td][td]< 10[/td][/tr]
[tr][td]Ammo[/td][td]Raids, police actions[/td][td]< 50 rounds[/td][/tr]
[/table]

Hover any resource for a tooltip explaining what consumes it.

[h2]Keyboard shortcuts (desktop)[/h2]

[code]
1-7    Top nav: City, Law, Economy, Map, Build, Diplo, More
Q-U    Bottom: Inbox, Research, Military, Factions, Events, Wildlands, Dossier
Space  Pause / Resume (End Turn in turn-based mode)
+ / -  Speed up / slow down (real-time mode only)
F      Fullscreen
H      Photo mode
?      Show all shortcuts
Esc    Return to City
Ctrl+S Quick save
[/code]

Mobile players: every shortcut has an on-screen equivalent. Nothing is keyboard-only.

[h2]Faiths and the Leader Cult — the secret superpower[/h2]

Eight faiths drift through your 268 districts, including [b]Ancestor Cult[/b], [b]Machine Choir[/b], [b]Eternal Flame[/b], and [b]Catholicism[/b]. For each you can Sponsor, Tolerate, or Suppress.

When one dominates the city, you can [b]declare yourself its Leader[/b]. You get loyalty floors, a propaganda multiplier, and an extra edict slot. You also inherit corruption, schisms, heresies, and the occasional assassin.

[b]Save before you declare.[/b] You can renounce later, but the first 50 ticks of a Leader Cult are bumpy.

[h2]End states[/h2]

There's no win screen. The engine tracks four states:

[list]
[*][b]ACTIVE[/b] — running normally
[*][b]CITY FALLEN[/b] — biological pop and housing both zero
[*][b]MACHINE ASCENSION[/b] — citizens gone but droids carry on (needs Mind Upload + Consciousness Transfer + Automaton Civilization)
[*][b]BIOLOGICAL PERPETUATION[/b] — engineered lineages persist (needs Perpetual Biogenesis)
[/list]

Some Marshals last 90 ticks. Some last decades. Your call.

[h2]Idle and offline[/h2]

The simulation runs while you're away. When you re-open the game, the engine catches up the missed ticks. Configure depth in Settings:

[list]
[*][b]LITE[/b] — fast resume, less detail
[*][b]STANDARD[/b] — balanced (default)
[*][b]DEEP[/b] — slowest resume, full fidelity
[/list]

The resume time estimate next to each option is calibrated to your device's measured tick cost. No guessing.

[b]Steam Cloud[/b] syncs both saves and commander profiles across devices. Start on the desktop, finish on the Steam Deck.

[h2]Honor Mode[/h2]

Profile setting that disables manual save/load. Your decisions stick. Recommended for your second run, not your first.

[h2]Where to go for more[/h2]

[list]
[*][b]In-game Codex[/b] (More → Codex) — 60+ entries, searchable, the deep manual
[*][b]Achievements[/b] (More → Achievements) — 400+ trophies across 15 categories
[*][b]Lore[/b] (More → Lore) — 42 collectible field archives across 8 categories and 4 rarity tiers
[*][b]Atlas[/b] (More → Atlas) — wasteland terrain catalog
[/list]

[h2]Final advice[/h2]

[list]
[*]Take your time. In real-time mode pause is free — use it. In turn-based mode nothing moves until you end your turn.
[*]Watch deltas, not totals.
[*]Build housing before you grow population.
[*]Officers pay for themselves. Hire them.
[*]Auto-managers exist for a reason. Use them late game — you cannot micro 142 officers and 268 districts forever.
[*]The pigeons remember everything. They are not a bug.
[/list]

[i]The world ended. The paperwork didn't. Good luck, Marshal.[/i]

---

[i]MEGACITY: Sector Marshal is solo-developed. Free to play. No microtransactions. No pay-to-win. No loot boxes. No battle passes.[/i]
