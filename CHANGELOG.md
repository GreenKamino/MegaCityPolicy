# Changelog

All notable changes to **MEGACITY** are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This file is the canonical source. The in-game CHANGELOG screen reads
`artifacts/megacity/data/changelog.ts`, which is auto-generated from this file
by `node scripts/generate-changelog.mjs`. Edit this file, then rerun the script.

## [Unreleased]

### Added
- **Conquered megacities can rise against neglectful rule** — an occupied or annexed rival that endures twelve straight days of both severe attrition and hostile loyalty will overthrow your administration, end its tribute, declare independence, and return to the pool of hostile powers. Improving either condition resets the uprising clock.
- **Procurement deliveries are announced** — when a contract finishes, a CONTRACT DELIVERED dispatch lands in your inbox listing exactly what arrived (goods, buildings, civic effects), the contractor signs off in character, and the news ticker runs the delivery line. No more orders that quietly vanish into the archive.
- **Stalled awards warn you instead of bleeding you dry** — a contract that stops for lack of materials now posts a PROCUREMENT STALLED alert naming exactly what it needs, and the award card shows a red STALLED box with the same detail and an auto-scrap countdown.
- **Dead awards clean themselves up** — a contract stuck past 3× its quoted schedule is scrapped with a CONTRACT SCRAPPED notice instead of sitting in the queue charging retainer fees forever. Scrapped awards show as EXPIRED in the procurement archive.
- **The tower mysteries now leave a mark** — six new achievements for the interior storylines: one for solving THE QUIET FLOORS, one for THE RED DOOR, plus ending-specific variants (memorial or open housing vs. sealing the levels forever; registering the wall community vs. the riot-gas clearance). Earned the moment the epilogue choice is made, on any playthrough.

### Changed
- **Desktop players can open their screenshot folder from Display Settings** — the new button opens the same `MEGACITY Screenshots` folder used by F9 captures.
- **The main menu gets straight to the controls** — the long promotional game description has been removed from the launch screen, leaving the detailed game information in About.
- **New players now start with the white interface** — when no appearance preference has been saved, MEGACITY opens in light mode instead of the green dark theme. Existing players keep whichever theme they selected.
- **The real-time clock now explains itself** — the City screen’s speed controls now spell out that each automatic tick advances six in-game hours and show how long a full game day takes at every setting. Desktop titles use literal labels such as `5M/TICK` and `1H/TICK` instead of the unexplained `x3` and `SLOW` scale, and the same timing guide is available in the Codex.
- **The Contracts screen opens on your active awards** when you have work in motion, instead of the catalog.

### Fixed
- **Crowded world-map megacities can be selected reliably** — map labels, nearby locations, and active terrain tooltips no longer steal clicks from the megacity marker beneath them. Megacity selection now uses a consistent priority on desktop and touch devices while preserving map pan and zoom controls.
- **The main menu no longer stalls halfway through loading** — startup previously ran the full offline city simulation before it could open the menu, so older or complex saves could leave the loading bar apparently frozen at 50%. Startup now identifies the latest save quickly and waits to apply offline progress until you choose CONTINUE. Steam's asynchronous availability checks are also handled correctly and time out safely when Steam or Cloud is unavailable.
- **Commercial licenses now show their payout** — licensed companies always paid their stated tax into the treasury, but the income was folded invisibly into the Tax Revenue line while their maintenance showed as its own cost, so a fresh license looked like it charged you and paid back nothing. The Economy ledger now carries a dedicated COMMERCIAL LICENSING line showing exactly what your licensed companies pay per tick, every active license card shows PAYING +N/tick, and issuing a license files a receipt in your inbox recording the fee and the projected return.

### Notes
- Existing saves are fully compatible — awards already stuck in an old save will warn, then scrap themselves on schedule after loading.

## [2.11.3] — 2026-09-06 — Maintenance Release

### Fixed
- **Restored medical reports now survive the first background save** — cloud-restored result summaries remain visible after autosave instead of being dropped from the next persisted state.

### Notes
- Existing saves are fully compatible.

## [2.11.2] — 2026-07-18 — Room to Build

### Changed
- **The Construction screen wastes far less space on big screens** — the long strip of category chips used to wrap into several rows and push the building list down. On wide layouts it now sits in a single scrollable row with a SHOW ALL button when you want the full spread, and the screen remembers your choice for the session.

## [2.11.1] — 2026-07-13 — Peace Means Peace

### Added
- **Ceasefires now show the war winding down** — accepting or counter-proposing a ceasefire posts a CEASEFIRE HOLDS dispatch to your inbox naming the faction that stood down, and the same line scrolls once across the news ticker. Rejecting or stalling posts nothing — the conflict stays hot on purpose.

### Fixed
- **Identical ceasefire offers no longer pile up** — the same proposal could stack up several times in Active Incidents during one war. Each war event now appears once at a time and respects its retrigger cooldown.
- **The repeat-ACCEPT exploit is closed** — accepting the same stale ceasefire card again no longer farms its rewards. Resolving or dismissing an event that is no longer active now does nothing at all.
- **Accepting a ceasefire now truly cools the aggressor** — the instigating faction's threat drops below the hostile threshold, so the war actually stands down and stops generating fresh ceasefire offers.
- **Old saves clean themselves up** — saves carrying piled-up duplicate offers shed the extras automatically on load.
- **Inbox dates repaired** — dispatch notes tied to the news ticker (dismissed-warning reminders, trade caravan results, ceasefire confirmations) showed a garbled date. They now show the correct in-game date.

### Notes
- Existing saves are fully compatible.

## [2.11.0] — 2026-07-13 — The Golden Age Has Standards

### Added
- **The Quiet Floors and The Red Door** — two once-per-playthrough branching storylines set inside the residential towers. Eight chapters each, and the endings depend on the choices you make along the way.
- **Wartime events pack** — twelve new events that can only fire while the sector is at war: false air-raid alarms, a field hospital past capacity, a broadcast hijack, a missing conscript column, and other emergencies of a city on a war footing. Each comes with three ways to respond.
- **Your advisor explains a stalled golden age** — when prosperity is close but housing or the environment is holding the gate shut, a one-time advisory names the blocker instead of leaving you to guess.
- **The news ticker will not let it slide either** — the same golden-age hint flashes across the TV news crawl, so it cannot be missed.

### Changed
- **A thriving city must now be livable, not just rich** — golden-age stories require decent housing and a healthy environment on top of wealth and morale. Squalor with a strong balance sheet no longer qualifies.
- **The Active Incidents list on the CITY tab folds away** — tap the header to collapse the pile of events and get straight to your law, food, corruption, and stability stats. While collapsed, a badge on the header shows how many incidents still need a response.
- **Officer actions now confirm they worked** — pressing INVESTIGATE or any other action in an officer's MORE ACTIONS menu gives instant pressed-button feedback and a confirmation banner spelling out what happened, the stat changes, and the credits spent. A brief guard after each success also stops an accidental double-tap from spending twice.

### Notes
- Existing saves are fully compatible.

## [2.10.1] — 2026-07-13 — Upgrades, As Advertised

### Fixed
- **Software upgrades now actually work** — upgrades purchased on the ADMINISTRATION → SYSTEMS screen were displaying their benefits without applying any of them. Tax income, trade efficiency, power and water savings, crime and unrest reduction, public health, and research speed now take effect every tick, exactly as the tier descriptions promise.
- **Story-chain trade income now pays out** — trade income granted by story decisions (including the orbital elevator agreements) was acknowledged in the report and then silently dropped from the budget. It is now credited every tick. Research-speed rewards from story chains now grant real research progress as well.

### Notes
- If an event grants +100 trade income and your budget shows +97, that is not a lost payment — port congestion takes its cut as its own line in the budget breakdown. The full +100 is booked first.

## [2.10.0] — 2026-07-12 — Nothing Is Instant Anymore

### Added
- **Buildings take time to construct** — order a building and a construction site opens; the structure comes online when the work is done. Bigger projects take longer. The skyline is now earned, not conjured.
- **Troops take time to train** — recruitment orders enter a training pipeline and units arrive when they finish the program, not the instant you sign the requisition.
- **Training facilities speed things up** — build them and every training program in the sector runs faster.
- **New edict: Accelerated Training Doctrine** — a temporary decree that pushes recruits through even faster, for a price. The news ticker announces when it kicks in, your inbox warns you when it is winding down, and the news reports when the barracks stand down.
- **Your training bonus is always visible** — unit cards show the reduced training times, and the recruitment, military, and law screens all display an active-boost banner naming exactly what is speeding things up. No more guessing whether the paperwork is actually helping.
- **Search the whole building catalog at once** — the building browser's search now looks across every category and subcategory in one pass, and each result shows where it lives so you learn the catalog as you use it. On wide screens, categories wrap into visible rows instead of one long scrolling strip.
- **Three more problem cards that name the fix** — Health, Transit, and Jobs join the diagnose-and-one-tap-fix card family. See what is dragging the number down, tap the fix.
- **A fuller top bar** — CODEX and five more screens are promoted into the top tab bar when your display has the room for them.
- **A smoother first day in office** — NEW GAME gets you into the city faster, commander portraits now use photographic faces, you can pick your banner colors, and the sector greets its new Marshal by name.
- **Banner sigils for all twelve megacities** — every rival city now flies its own mark.
- **Desktop: quit buttons and a UI scale setting** — leave the office from inside the game with your save intact, and make the fine print of municipal collapse exactly as large as you need it.

### Changed
- **Edict groups on the Law tab now collapse** — the five categories from 2.9.1 can be folded away so you only see the bureaucracy you came for.
- **Messages no longer type themselves out letter by letter** — reports appear at once. The typewriter has been retired with full honors.

### Fixed
- **Event trade income now sticks** — trade income granted by events was quietly falling out of the per-tick budget. It is now booked properly.
- **Onboarding tip buttons that did nothing now do something** — the something they were always supposed to do.
- **Desktop: the window closes when you close it** — no more phantom process lingering after exit.

### Notes
- Existing saves are fully compatible. Buildings and units you already own are unaffected — only new orders go through construction sites and training pipelines.

## [2.9.1] — 2026-07-09 — The Census Bureau Regrets the Error

### Fixed
- **The overnight population explosion is fixed** — temporary growth edicts were quietly stacking their bonus onto your city's permanent growth rate every single tick, and never giving it back when they expired. Step away overnight and the offline simulation compounded that runaway rate into numbers no housing block was ever zoned for. Growth edicts now boost growth only while they are active, exactly as the paperwork always claimed.
- **Population growth is held to sane limits across the board** — edicts, technologies, policies, and events included. No single decree will ever again outbreed the laws of arithmetic.
- **Census Correction for affected saves** — if your city already exploded, you do not need to start over. The next load runs an automatic audit: the phantom billions are struck from the register and your population is restored to what your housing can actually support, with a report in your inbox confirming the correction. The Bureau thanks the affected citizens for their cooperation, insofar as they existed.

### Changed
- **The Law tab is reorganized** — sector edicts are now grouped into five categories (Security, Economic, Social, Infrastructure, Political), each under its own header with a count, instead of one hundred decrees in a single unsorted pile. Bureaucracy remains, but it is now alphabetized bureaucracy.
- **Income rebalance: tourism, housing, and industry** — tourism was quietly out-earning everything else in developed cities, making housing and factory investment feel pointless. Small tourism sectors earn exactly what they did before, but sprawling resort empires now see diminishing returns past a point. To balance the books, residential and industrial buildings pay noticeably more tax per tick — hab-blocks, housing stacks, residential platforms, and the core factory line all got a raise. New cities come out slightly ahead; the three income pillars are now all worth building.

### Added
- **Population and Housing chapter in the manual** — how growth works, how housing caps it, what temporary edict boosts actually do, and what a Census Correction means if you ever see one.

### Notes
- Existing saves are fully compatible. Healthy cities load unchanged; damaged ones are repaired on load as described above.

## [2.9.0] — 2026-07-07 — Two Ways to Run the City

### Added
- **Choose your pace when you found a new city** — real-time or turn-based is now your call. Let the clock run on its own, or take it one turn at a time and advance only when you press End Turn. Consider it a rare bit of democracy, and the choice is genuinely yours. Enjoy it while it lasts, because inside MEGACITY democracy is mostly for show and never a given.
- **Turn-based mode plays fair** — a crisis that erupts mid-turn pauses the day and resumes it exactly where it left off once handled, a brand-new city cannot be ambushed on its very first turn, and dismissing a crisis buys real breathing room instead of the same alarm storming back next turn. Dismissing a critical warning now tells you it will return if the underlying problem is still there.
- **Pick your standing start style** — Settings now lets you choose Guided or Veteran as your default for new cities, and starting one city differently no longer silently overwrites that preference. A one-off pick stays a one-off unless you tick "make this my new default".
- **More problem cards that name the fix** — defense and infrastructure join the diagnose-and-one-tap-fix card family from 2.8.0.
- **Light mode, larger text, high contrast** — every screen now follows your chosen theme, and new readability options make the fine print of bureaucratic collapse easier on the eyes.
- **Copy responses** — you can now copy response text straight out of the game.

### Changed
- **Returning crises admit they are returning** — a crisis you already cleared that flares up again is now badged STILL UNRESOLVED, and the news ticker and daily log announce it as a known crisis resurfacing instead of pretending it is a brand-new emergency.
- **No more loyalty farming** — personal actions now have a per-person cooldown, so you cannot repeat the same interaction on the same officer over and over to grind their loyalty. Charm responsibly.

### Fixed
- **Desktop polish** — fixed side-scrolling, long-session flicker, and ammo visibility on the desktop build.
- **Nothing fails silently** — simulation errors that occur during a turn are now surfaced instead of swallowed.

### Notes
- Your game mode is chosen per city at creation. Existing saves are fully compatible and continue in real-time exactly as before — found a new city to try turn-based.
- Save export and import now carry data integrity checks, and the desktop build has been further locked down.

## [2.8.0] — 2026-07-06 — See the Problem, Tap the Fix

### Added
- **Problem cards that name the fix, right on the Overview** — new breakdown cards for your power grid, water supply, crime, and biosphere lay out exactly what is dragging each one down, and every card comes with a one-tap fix that takes you straight to the building or edict that solves it.
- **One-tap fixes land you in the right place** — tapping a recovery tip now sends you to the exact building or action that addresses the problem, and it always lands somewhere valid instead of a dead end.
- **Know how long you have** — the power grid now tells you how many turns until it goes dark at the current rate, and the biosphere card shows how fast it is recovering or decaying.
- **Early brownout warning, and an all-clear when you fix it** — you now get an inbox alert and an on-screen news ticker heads-up the moment the grid is heading for a brownout, even when you are not on the power screen, and a POWER GRID STABILIZED confirmation once the grid is back in surplus. The warning clears on recovery and can warn you again if things slip.
- **See what each building takes in and puts out** — production buildings now show their inputs and outputs at a glance, so it is clear what feeds what.

### Changed
- **An honest power readout** — the power number now accounts for seasons and storms, so what you see is what your grid will actually deliver instead of an optimistic estimate.
- **Ecological collapse can be turned around** — a collapsed biosphere is no longer a dead end; with the right buildings and edicts you can pull it back to a survivable level.

### Fixed
- **Missions stay put** — missions no longer disappear from your active missions list.

### Notes
- Existing saves load as-is — nothing needs resetting.
- The downloadable game manual was also refreshed, including a new Army section.

## [2.7.1] — 2026-07-03 — Quality of Life: Safer Actions & Cleaner Numbers

### Added
- **A confirmation step before costly one-tap mistakes** — dismissing a troop, dismissing a captain, and disbanding a squad on the Retinue screen, and renouncing your Leader Cult, now ask you to confirm first. A stray tap can no longer wipe out a unit, a squad, or your cult in a single press. The renounce prompt also spells out the cost up front — the credits and happiness it takes, the faction it angers, and the cooldown before you can declare a new cult.

### Changed
- **Cleaner numbers on the Retinue screen** — Combat Power and Total Kills now use the same thousands separators and shorthand as the rest of the game, so a large retinue reads at a glance instead of as one long run of digits.

### Notes
- Existing saves load as-is — nothing needs resetting.

## [2.7.0] — 2026-06-30 — A Survivable Biosphere & a Pause That Truly Pauses

### Added
- **Clearer ecology warnings that name the fix** — before disaster strikes you now get readable alerts for a failing or collapsing biosphere, rising disease risk, and toxic bloom risk. Each one spells out what to build or enact, such as Atmospheric Biofilter Stations, Bioremediation Plants, Reclamation Domes, or a Mass Vaccination Drive edict.
- **Your Chancellor can handle health emergencies** — with your Chancellor set to act or suggest, they now step in during a health crisis and enact vaccination or public health edicts before things tip over, so disease management can be delegated.
- **Quick access from the top bar** — the screens you use most now sit right on the top navigation bar instead of only in the More menu: Inbox, Stats, Research, Missions, Finance, Officers, Sectors and Trade are one tap away, with everything else still under MORE. Keyboard players can jump straight to them with Shift and 1 through 8, and controller and Steam Deck players can reach them too.

### Changed
- **The ecology system is now fair and recoverable** — disease outbreaks and toxic blooms burn out and are contained after a set number of turns instead of stacking endlessly, and the damage they deal each turn is capped, so a single bad moment can no longer snowball into an unstoppable spiral. With no active outbreak and some investment in ecological buildings, the biosphere now climbs back to a survivable level instead of staying pinned at the bottom.

### Fixed
- **Pausing now truly pauses everything** — a paused game no longer grants resources or messages for the time you were paused, including when you switch away and come back or reload, and un-pausing can never quietly hand that paused time back later.
- **A clearer World Map** — labels stay crisp, the zoom behaves, spacing is tidier, and the map now centers on your territory instead of drifting toward the edges.

### Notes
- The ecology changes remove the unfair doom spiral, not the difficulty — at genuinely bad stats the situation is still dangerous. Existing saves load as-is; nothing needs resetting.

## [2.6.0] — 2026-06-30 — An Easier First Hour & Settings You Can Trust

### Added
- **A guided first run for new commanders** — brand-new cities are now walked through their first build, edict, and dispatch one step at a time instead of being dropped into everything at once. A "do this next" objective marker on the Overview keeps your next move in view, and short coach tips explain each screen the first time it unlocks.
- **A calmer opening** — disasters and crises are held back for the first little while so new commanders can find their footing before the pressure begins.
- **Start style choice** — when you create a city you can now choose **GUIDED** (all of the new-player help above) or **VETERAN** (skip the hand-holding and drop straight into command). The game remembers your choice and uses it as the default next time.
- **Reset to Defaults in Settings** — restore every preference at once with a single action. Your save slots are never touched.
- **Per-section settings reset** — reset just **Display**, **Audio**, or **Accessibility** on its own, leaving the rest of your preferences alone.
- **"Modified" markers in Settings** — each settings section now shows at a glance when you have changed it from the defaults, and a section's reset is dimmed when there is nothing to undo.

### Changed
- More reliable in-game screenshots across every screen, with **F12** as a fallback capture key for when the Steam overlay can't grab one (desktop / Steam build).

### Fixed
- World map labels that could look faded or overlap each other now stay crisp and legible.

### Notes
- Existing saves and profiles load as-is — nothing needs resetting, and games already in progress won't be pushed through the new tutorial. The guided first run applies to brand-new cities, where you choose GUIDED or VETERAN.

## [2.5.0] — 2026-06-29 — Controller Support, a Living Soundscape & World Map Zoom

### Added
- **Full controller, keyboard & Steam Deck support** — play from start to finish with a gamepad or keyboard. On-screen focus highlighting moves you between buttons, menus and the district grid without a mouse, and a built-in controls help panel lists every binding. The Steam Deck's controls work out of the box.
- **A city that sounds alive** — a new mood-reactive ambient soundscape shifts with the state of your city: calmer tones when things are stable, tenser layers as unrest, crime and disorder climb. On by default, and it respects your mute, volume and reduced-motion settings — turn it off any time from Settings.
- **World map zoom** — pinch to zoom the world map and read crowded sectors with ease. Location markers and their labels stay crisp and legible as you zoom in instead of overlapping, and the filter and legend bars now sit tight under the header for more map space.
- **Steam Cloud save conflict handling** — if the same save is changed on two machines, the game now detects the clash and protects your progress instead of silently overwriting it (Steam / desktop build).

### Changed
- **Performance pass** — two rounds of optimization plus an internal cleanup of how the engine loads its code make for a quicker, smoother startup and steadier late-game ticks.
- Map overlays now respond to taps and clicks more reliably, so selecting things on the map feels cleaner.

### Notes
- Existing saves load as-is — nothing needs resetting. The new ambient audio is on by default and can be turned off from Settings at any time.

## [2.4.2] — 2026-06-25 — Dev Update: Road to Steam

### Changed
- Cleaner loading/boot screen with a clearer waiting experience.
- Friendlier messaging when the game is slow to start, so a long boot no longer looks like a freeze.
- Player title updated from "Sector Marshal" to "Commander" throughout the game.

### Notes
- A note from the developer: I'm not going to hit the Steam release date I set for myself, and I'm sorry to everyone who was looking forward to it. I'm still working through the final stretch, and I'd rather get it right than ship it broken. This is my first game and I've underestimated parts of the journey — thank you for your patience and for playing while I keep building. More soon. — MEGACITY STUDIOS

## [2.4.1] — 2026-06-24 — Desktop Screenshot Hotkey

### Added
- **F9 screenshot hotkey (desktop / Steam build)** — press **F9** to capture the current screen as a **1920×1080** PNG, saved with a timestamped filename to a **MEGACITY Screenshots** folder inside your system Pictures folder, with an on-screen confirmation. Steam's own screenshot key is F12, so F9 is used to avoid any overlap. In the in-browser web build F9 does nothing (browsers can't write files to a folder).

## [2.4.0] — 2026-05-08 — Religion Mechanics and the Reliquary See

### Added
- **Faith system foundation** — three faiths now drift across your districts based on category affinity: **The Eternal Flame** (reactor-priesthood, energy/research districts), **The Machine Choir** (industrial congregation, foundries and factories), and **The Ancestor Cult** (undercity sect, slums and the wasteland frontier).
- **Three faith stances per faith** — SPONSOR, TOLERATE, or SUPPRESS each cult independently. Sponsorship trades happiness gains for corruption; suppression buys law and order at the cost of happiness and district loyalty.
- **Leader Cult declaration** — formally adopt one faith as the Marshal's personal creed. Granting amplifies that faith's affinity drift and unlocks devotional events; renouncing has a cooldown.
- **The Reliquary See** — a new tenth faction. A theocratic monarchy that worships prosthetics, ruled by the **Iron Pontifex Caelum-Vox VII**, whose body is rebuilt from the canonised augments of every predecessor. Full lore entry and leader dossier included; the See appears alongside the existing factions in the Factions terminal.
- **"Surgical" and "clinical" leader trait keywords** — new descriptive flavour available across leader dossiers. The Iron Pontifex carries the *surgical* trait.

### Changed
- The Factions terminal now lists **10 active factions** (the See joins the existing nine). Cross-faction dynamics text updated to reflect the See's standing tensions with the Gene Wrights and the Authority.

### Notes
- Existing saves are migrated automatically. Faith district shares default to an even 1/3 split per district on first load; all stances default to TOLERATE. Shares then drift toward category affinity from the next tick onward.

## [2.3.0] — 2026-05-04 — Auto-Managers and Auto-Hire Recruitment

### Added
- **Auto-Manager framework** — eight domains (Recruit, Research, Intel, Espionage, Agriculture, Trade, Military, Edicts) can each be set independently to **OFF**, **SUGGEST**, or **ACT** from the new ADVISOR BRIEFINGS screen. SUGGEST queues proposals for one-tap approval; ACT executes within the rules you set.
- **Inner Circle gating** — every domain requires the matching Inner Circle role to be filled (Enforcer for recruit, Spymaster for intel and espionage, Science Advisor for research, Diplomat for trade, War Marshal for military, Chancellor for edicts, Agriculture Minister for agriculture). Without the appointment the panel tells you who to install.
- **Auto-Hire Recruitment panel** — per-tick credit budget, target strength percent, and class priority list, with fill-empty-slots-first behaviour. Mode shared with the central briefings panel.
- **Always-Allow and Snooze controls** — auto-approve trusted proposal kinds, or snooze a kind for the day if it's noisy.
- **Pause All ACT** — one-button kill switch across every auto-manager. Honor Mode also force-downgrades ACT to SUGGEST globally.

### Changed
- The MORE menu now surfaces an alert dot on ADVISOR BRIEFINGS whenever an auto-manager has a proposal waiting for you.

### Notes
- All domains start at OFF on existing saves. Nothing is taken out of your hands until you opt in.

## [2.2.0] — 2026-04-30 — Quality of Life: Backups, Patch Notes, and Streak Achievements

### Added
- **Backup all slots** in one click — exports every populated save slot plus your in-app settings as a single JSON file. A matching **Restore from backup** button writes everything back; existing slots are preserved under their backup suffix before being overwritten.
- **What's New** modal automatically appears once after each version bump, summarising the latest patch notes. Dismiss to mark as read; the in-game CHANGELOG screen remains accessible from the More menu.
- **Copy JSON** button on the export-save modal — uses the system clipboard so you no longer have to long-press and select-all on mobile.
- **Six new achievements**: ROUTINE PATROL (3-day streak), ONE WEEK ON DUTY (7-day streak), MARSHAL'S DEDICATION (30-day streak), FIRST WEEKLY CLEARED, ANNUAL CONSISTENCY (10 weeklies), READING THE FINE PRINT.

### Changed
- The MORE screen rebuilds its navigation graph less often — every state tick used to re-instantiate every icon. You may notice slightly snappier menu interactions on large saves.

### Notes
- Returning players will see the What's New popup once on first launch after updating. Brand-new players are not shown patch notes for changes they never experienced.
- Lifetime weekly-challenge clears are now tracked on save state. Players with old saves will start the count at zero — clears made in previous versions are not retroactively credited.

## [2.1.0] — 2026-04-29 — Daily Bonuses, Weekly Challenges, and Save Portability

### Added
- Daily login streak with a small command-credit and research bonus that scales over the first two weeks.
- Weekly procedural challenges, generated from the existing event/mission counters and rotated every ISO week.
- New CHALLENGES screen under Meta & Progression — claim your daily bonus and the week's challenge from one place.
- Save slot export and import as plain JSON. On web you get a one-click download; on native you can copy the payload from a modal.
- In-game CHANGELOG screen, sourced from the same data file as this repository's CHANGELOG.md.

### Changed
- More menu now surfaces an alert dot on the new CHALLENGES entry whenever a daily bonus is unclaimed.

### Notes
- Old saves are migrated automatically — first launch backfills empty streak and challenge fields.
- Imported saves run through the same migration pipeline as a normal load, so cross-version exports stay readable.

## [2.0.0] — 2026-04-28 — Crash Recovery, Press Kit, and Performance Pass

### Added
- Top-level error boundary with panic-save recovery — a crash now surfaces a recovery screen instead of a blank app.
- Press kit folder with portrait and landscape hero screenshots, pitch copy, and fact sheet.

### Changed
- Save-to-slot now uses a concurrency lock so rapid taps cannot interleave writes.
- Inbox, district map, and event resolution paths optimized with memoization and Map lookups.

### Fixed
- Recovery snapshot fields moved to state to prevent stale UI after a crash.
- Several unused exports and dead modules removed; type-check and tests still green.
