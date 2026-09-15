import type { GameState, GameMessage, ExternalMegacity, HostileRaidEvent } from "@/engine/types";
import { WORLD_LOCATIONS, type WorldLocation } from "@/engine/worldMap";
import { formatHostilesSpotted } from "@/engine/combatData";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtPop(n: number): string {
  return n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

export function getHostileEntities(s: GameState): { megacities: ExternalMegacity[]; locations: WorldLocation[] } {
  // Annexed/occupied megacities are under player control — they cannot be
  // hostile belligerents while that control status remains in force,
  // regardless of their loyalty/threat numbers
  // (annexation does not reset those, so gating on them alone leaks
  // wartime dispatches against cities the player already conquered).
  const megacities = (s.externalMegacities ?? []).filter(m =>
    m.isActive && m.loyalty < 15 && m.threat > 50
    && m.controlStatus !== "annexed" && m.controlStatus !== "occupied");
  const discoveredIds = new Set(s.discoveredLocationIds ?? []);
  const relations = s.locationRelations ?? {};
  const locations = WORLD_LOCATIONS.filter(loc => {
    if (!discoveredIds.has(loc.id)) return false;
    const rel = relations[loc.id];
    return loc.status === "hostile" || (rel && rel.disposition < -50);
  });
  return { megacities, locations };
}

// Narrow predicate aligned with getWarContext().atWar. Every wartime
// dispatcher gates on hostile megacities/locations only — raids and hostile
// zones alone do not constitute "war" for messaging purposes. Keeping the two
// definitions in lockstep avoids the periodic-tick path firing the wartime
// generator on raids-only states only to have it bail internally.
export function isAtWar(s: GameState): boolean {
  const { megacities, locations } = getHostileEntities(s);
  return megacities.length > 0 || locations.length > 0;
}

// Helper used by every wartime-dispatch generator. Returns the war context
// only when the city is actually at war (per the narrow definition); returns
// null otherwise so the caller can early-return cleanly. Centralises the
// `if (!ctx.atWar) return null` gate that previously appeared at every site.
function activeWarContext(s: GameState): ReturnType<typeof getWarContext> | null {
  const ctx = getWarContext(s);
  return ctx.atWar ? ctx : null;
}

export function getWarContext(s: GameState): {
  atWar: boolean;
  hostileMegacities: ExternalMegacity[];
  hostileLocations: WorldLocation[];
  underSiege: boolean;
  blockaded: boolean;
  activeRaids: HostileRaidEvent[];
  contestedZones: number;
  hostileZones: number;
  warMorale: number;
  totalBattles: number;
  totalVictories: number;
  totalDefeats: number;
  casualties: number;
} {
  const { megacities, locations } = getHostileEntities(s);
  const combat = s.combat;
  const activeRaids = combat?.raidEventQueue?.filter(r => r.status === "active" || r.status === "incoming") ?? [];
  const contestedZones = combat?.zones?.filter(z => z.status === "contested").length ?? 0;
  const hostileZones = combat?.zones?.filter(z => z.status === "hostile").length ?? 0;
  const underSiege = activeRaids.some(r => r.status === "active") && hostileZones > 3;
  const blockaded = (s.bordersClosed ?? false) || (megacities.length >= 2 && hostileZones > 4);

  return {
    atWar: megacities.length > 0 || locations.length > 0,
    hostileMegacities: megacities,
    hostileLocations: locations,
    underSiege,
    blockaded,
    activeRaids,
    contestedZones,
    hostileZones,
    warMorale: combat?.warMorale ?? 70,
    totalBattles: combat?.totalBattlesFought ?? 0,
    totalVictories: combat?.totalVictories ?? 0,
    totalDefeats: combat?.totalDefeats ?? 0,
    casualties: combat?.totalCasualties ?? 0,
  };
}

export const WAR_DISPATCH_INTROS = [
  "WARTIME COMMUNIQUÉ — CLASSIFICATION: RESTRICTED",
  "COMMAND PRIORITY TRANSMISSION — ALL SECTOR MARSHALS",
  "MILITARY INTELLIGENCE BRIEF — EYES ONLY",
  "WAR ROOM DISPATCH — OPERATIONAL UPDATE",
  "STRATEGIC COMMAND UPDATE — DISTRIBUTION: LIMITED",
  "THEATER OPERATIONS SUMMARY — COMMANDER'S BRIEFING",
  "CONFLICT STATUS REPORT — SECTOR COMMAND PRIORITY",
  "BATTLEFIELD INTELLIGENCE DIGEST — CLASSIFIED",
  "FRONT-WIDE SITUATION READOUT — COMMAND DISTRIBUTION",
  "WAR CABINET BRIEFING — ENCRYPTED CHANNEL ALPHA",
  "OPERATIONS CENTRE BULLETIN — FLAG OFFICERS ONLY",
  "SECTOR THEATRE SUMMARY — RESTRICTED HANDLING",
  "JOINT COMMAND DIGEST — DISTRIBUTION CONTROLLED",
  "WAR ROOM MORNING READ — NO COPIES, NO NOTES",
  "FRONT-LINE OPERATIONS BRIEF — COMMANDER'S EYES",
  "GENERAL STAFF SITREP — CHANNEL ALPHA-NINE",
  "FORWARD COMMAND TRANSMISSION — HARD-CHANNEL",
  "SECTOR DEFENSE BULLETIN — RESTRICTED ACCESS",
  "THEATRE INTELLIGENCE PACKET — TIER-1 CLEARANCE",
  "OPERATIONAL SUMMARY — COMMAND DISCRETION ONLY",
];

export const FRONTLINE_DISPATCHES = [
  "Artillery exchanges continued through the night. Our positions held, but the crews are exhausted.",
  "Enemy probing attacks on the eastern perimeter. Testing our response times. They're getting faster.",
  "Forward observation posts report troop movements along the northern approach. Estimated battalion strength.",
  "Supply convoy ambushed on Route 7. Escort fought clear but lost two vehicles and fifteen crates of ammunition.",
  "Sniper activity increasing in no-man's-land. Our counter-sniper teams are deployed but visibility is poor.",
  "Enemy sappers attempted to breach the outer wall. Detected and neutralized, but they're learning our patrol patterns.",
  "Drone reconnaissance shows enemy fortifying positions 8 kilometers out. They're digging in, not pulling back.",
  "Radio intercepts suggest enemy command is debating a full-scale assault. Timeline uncertain. Hours or days.",
  "A patrol platoon was cut off behind enemy lines for six hours. They fought their way back. All present. Barely.",
  "Mortar fire struck the refugee processing center. Casualties are being tallied. The medics haven't stopped running.",
  "An enemy armored column was spotted moving under fog cover. Air assets scrambled. Engagement inconclusive.",
  "Night vision patrols reported movement in the ruins south of Sector 4. Could be raiders. Could be worse.",
  "Our mech walkers engaged enemy heavy armor at grid reference Echo-7. One mech sustained critical damage. Two enemy tanks destroyed.",
  "Enemy tunneling detected beneath the southeastern wall segment. Counter-mining operations have begun.",
  "A ceasefire request was received via neutral channels. Command suspects it's a ruse to reposition forces.",
  "Forward outpost Bravo-Three went dark at 0340. Recovery patrol found the bunkers swept clean. No bodies. No shell casings. No answers.",
  "Enemy artillery shifted firing patterns overnight. Targeting now favours civilian infrastructure. The shift is deliberate.",
  "Our snipers logged 14 confirmed kills in the past 24 hours. Enemy snipers logged 11. The arithmetic of patience.",
  "An armoured probe hit the southern checkpoint at first light. Repulsed at the cost of two pillboxes and a section of wall. They learned what they came to learn.",
  "Comm-7 to Command. Comm-7 to Command. We have movement, grid Foxtrot-Niner, repeat, Foxtrot-Niner. Stand by — wait, scratch that, those are our boys coming back. Cancel the fire mission. Cancel it now.",
  "An enemy push at the western salient was blunted by an unknown machine-gun crew firing from a roof we did not assign. Investigation suggests the crew was civilian. The crew is being decorated. The roof is being reinforced.",
  "Forward listening posts report enemy radio silence for the past four hours. The silence itself is a signal. The veterans recognise it. The veterans are quietly checking ammunition.",
  "An entire enemy company surrendered at the second perimeter at 0445. They were unfed, unpaid, and out of stimulants. Our processing centres are at capacity. Our morale is not.",
  "A reconnaissance flight over the eastern frontier brought back imagery of mass graves. Not ours. Not theirs. Civilian. The analyst section has gone very quiet.",
  "Heavy fog rolled in across the northern approach an hour before dawn. Both sides stopped firing. Both sides started moving. Both sides know the other knows. Nobody is talking about it yet.",
  "A patrol returned escorting a wounded enemy lieutenant who walked across no-man's-land carrying a flag of truce and a sealed envelope. Both are now in Command. Neither has been opened in front of subordinates.",
  "Forward observers report enemy artillery teams running drill on a new gun pattern. The shells are not landing where they were aimed. We do not know if this is incompetence or a ranging exercise. Either possibility is unwelcome.",
  "Sniper Team Three reported a confirmed kill on a high-value target at extreme range. Identification pending. The team has gone dark and will not return until nightfall.",
  "An enemy infantry section walked into our minefield at 0312, lost three men, and kept walking. They cleared a corridor with their bodies and their boots. The corridor closed behind them. The corridor was a feint.",
  "Frontline medics are reporting a new pattern of wound — chemical exposure consistent with leaked refrigerant from broken munitions. The enemy's quartermaster is failing them faster than we are.",
  "A sergeant on the southern wall called in artillery on his own position to break a flanking attempt. He was extracted with shrapnel and a commendation. He insists the position was the right call. Nobody is arguing.",
  "Patrol Six failed to check in at 0200 and is now five hours overdue. Drone overflight shows their vehicle stationary, doors open, no bodies. The drone has been ordered to maintain orbit.",
  "An enemy probe hit our forward fuel cache and torched it before withdrawing. The fire lit the perimeter for two hours. Our sentries logged seventeen confirmed kills by the light of our own burning supplies.",
  "A captured enemy field radio is now broadcasting on their own frequency in our voice. Their sergeants are receiving contradictory orders. Their captains are arguing about it. We are listening.",
  "Reconnaissance reports a new construction at the enemy's rear: long, low, concrete, heavily camouflaged. Photographic interpretation: hardened command bunker. Photographic interpretation: target.",
  "Forward observers reported enemy troops digging defensive positions at 1400. By 1700 the positions were occupied. By 2000 they were abandoned. By 2300 they were occupied again. Whatever is happening over there, it is not orderly.",
  "A partisan cell behind enemy lines transmitted in clear, no encryption, no callsign: 'They are running. We are following. Please stop shelling.' We have stopped shelling. The partisans have not stopped following.",
  "An armoured patrol crossed a stretch of road they have crossed forty times before and lost two vehicles to a new variant of mine. The mines were not there yesterday. The mines were not there this morning.",
  "Forward Command transmitted a single word at 0617: 'Hold.' The word was repeated by every receiver on the line. The line is holding. It will continue to hold. That is the order.",
];

export const SIEGE_REPORTS = [
  "Siege conditions persist. Rationing protocols are in effect. Civilian morale is fragile.",
  "The outer perimeter has been under continuous bombardment for 72 hours. Structural integrity holding at 64%.",
  "Water distribution points have been reduced to prevent crowding at known target locations.",
  "Underground bunker capacity at 78%. Citizens in exposed hab-blocks are being relocated.",
  "Enemy has established a cordon around the eastern approaches. No convoys getting through.",
  "Counter-battery fire has silenced two enemy artillery positions. Three more remain operational.",
  "Rooftop observation teams report enemy engineering vehicles near the main gate. Siege engines being assembled.",
  "Medical supplies are running critically low. The field hospitals are performing triage. Hard choices ahead.",
  "Civilian volunteers are filling sandbags along the inner defense line. The spirit is willing. The sandbags are finite.",
  "The garrison is holding, but fatigue is setting in. Rotation schedules have been extended to 16-hour shifts.",
  "Electricity rationing has been implemented. Non-essential systems are offline. The city grows darker each night.",
  "Black market food prices have tripled. The enforcement bureau is cracking down, but supply and demand don't care about laws.",
  "The breach in the eastern curtain wall has been sealed with rubble and rebar. The seal will hold against small arms. It will not hold against another barrage.",
  "Sappers tunnelled under Outwork Six and lit a charge at 0200. The outwork came down. The garrison did not come up.",
  "Curfew has been advanced to dusk. Anyone moving after the bell is to be challenged. The watch is tired. The watch will not be gentle.",
  "Underground reserve cisterns were opened today. The water tasted of rust and time. The queues were patient anyway.",
  "Day forty-one of bombardment. The cathedral spire fell at 1430. The bells were salvaged before the masonry came down. The bells will hang from the new defences. The bells will not stop ringing.",
  "Curfew patrols arrested fourteen people last night. Twelve were citizens caught past the bell. Two were enemy infiltrators with forged papers. The patrols are getting better at telling the difference. Sometimes.",
  "The siege has lasted long enough that children born after it began are now learning to walk in the shelters. They take cover at every door slam. We are raising a generation of flinches.",
  "Volunteer surgeons from three districts have been working in shifts at the inner medical bay for nineteen days without rotation. Their hands have begun to tremble. They have not stopped operating.",
  "Sector Six has lost grid power for the eleventh time this week. Hand-cranked generators are powering the field hospitals. The hand-cranks are operated by whoever is not fighting and not bleeding. The list is shrinking.",
  "A choir began singing in the Sector Twelve shelter at lights-out. By the third night every shelter in three districts had a choir. By the fifth night the enemy began shelling at lights-out specifically. The choirs sing earlier now. The choirs do not stop.",
  "Children's brigades are running messages between strongpoints because radio is being jammed and runners are easier to replace than the radios. The children take the work seriously. The children are eight years old.",
  "Salvage crews recovered nine intact crates of pre-war pharmaceuticals from a collapsed clinic. The expiration dates are sixty years out. The pharmaceuticals work. They always did. They never forgave us for forgetting that.",
  "An enemy artillery shell fell short and landed in their own forward trench at 0318. Our observers logged it. Our observers laughed. Then our observers logged eleven more rounds landing exactly where they were aimed. The laughter stopped.",
  "Hospital Three's roof was reinforced with three layers of sandbag and one layer of concrete. The roof was hit at 1100 and held. The next roof down was hit at 1110 and did not. The casualties are being moved upward.",
  "A grandmother in Sector Two has been baking bread for the strongpoints from her own apartment, using flour smuggled in from the wastes by her grandson. The grandson did not return from the last run. The grandmother is still baking.",
  "Outwork Four was overrun at 0240. Outwork Four was retaken at 0445. The garrison is the same garrison. The garrison is now half its original size. The garrison is still there.",
  "Civilian volunteers cleared seven hundred kilograms of unexploded ordnance from the inner defence line yesterday. Three of them did not come home. The line was clear by sundown.",
  "The siege has entered its second month. Officers are running out of metaphors. The metaphors that remain are short and ugly. The men understand them anyway.",
  "A trainload of evacuees was attempted at 0300 along the only remaining rail spur. The train was hit forty minutes out. There were no survivors. There will not be another train.",
  "Defenders on the eastern wall report the enemy's artillery has begun firing on a regular schedule for the first time in weeks. Predictability is a gift. We will not refuse it.",
  "A maintenance crew restored water pressure to Sector Nine at 1620 after sixty hours of outage. The crew was photographed for the city archives. The photograph shows seven exhausted faces and one wrench. The wrench is being preserved.",
  "Counter-snipers caught an enemy spotter who had been calling artillery on hospital convoys for three days. The spotter is in custody. The artillery has not stopped. The artillery is now random. The hospital convoys are still running.",
  "Sector Four reports the queue at the water point reached two thousand people this morning. The queue dispersed in good order under shellfire. Three were lost. Nobody jumped the line.",
  "A teenager refused her shelter slot last night and went to relieve a sentry whose shift was running long. The sentry was her father. The father did not know until morning. The morning is being commemorated.",
];

export const BLOCKADE_REPORTS = [
  "Trade routes severed. Merchant convoys are being turned back or worse.",
  "Blockade is tightening. Only smuggler routes remain viable, and those carry their own risks.",
  "Fuel reserves are declining. Non-military vehicle use has been restricted.",
  "The blockade has cut off medical supply shipments. Pharmaceutical stockpiles will last 12 days at current consumption.",
  "Agricultural imports blocked. The city must survive on internal food production. It won't be enough.",
  "Diplomatic channels remain open but unproductive. The enemy's demands are unacceptable.",
  "A supply ship attempted to run the blockade. It was intercepted. Cargo: 200 tons of grain. Lost.",
  "Underground tunnels are being used to smuggle essential supplies. Capacity is limited and the enemy is searching.",
  "The blockade has been in effect for multiple cycles. Stockpiles of steel and construction materials are critically low.",
  "Wasteland settlements are offering to run supplies through contested territory. Their price is steep. Their chances are slim.",
  "A merchant caravan paid the enemy's transit fee in gold and was robbed three kilometres past the cordon anyway. The bodies were left as a message. The message was received.",
  "Coastal smuggling has tripled since the blockade tightened. Port authority looks the other way. Port authority eats from the same shelves as the rest of us.",
  "Air-drop attempts by allied factions have been intercepted twice this week. Two pilots lost. The cargo was reported as 'medical and tactical.' Everything is medical and tactical now.",
  "Strategic stockpiles of refined fuel have entered Phase 3 rationing. Civilian generators are offline. The hospitals are running on diesel scavenged from abandoned cars.",
  "A blockade-runner captain reached harbour with two thirds of his cargo intact. He paid in cash. He left in tears. He is going back tonight. He is the only one who will.",
  "Refined sugar reached the black market price of a day's wage per spoon this morning. The black market price is now classified information. The classification is not being respected.",
  "The blockade has cut scheduled imports by 94% over the past month. Citizens have started growing root vegetables on apartment balconies, in subway tunnels, in any patch of soil with three hours of light. The harvest will be small. The harvest will help.",
  "An allied freighter ran the cordon under cover of a sandstorm and unloaded at the southern dockyard before being sunk on its return run. The captain's name has been added to the city memorial. The freighter's hold contained antibiotics. The antibiotics are saving lives this hour.",
  "Smuggler convoys through the wasteland reported losses of 40% on the past week's runs. The remaining 60% delivered. The smugglers are charging triple. The smugglers are being paid.",
  "A blockade-running submarine attempted to reach the inner harbour at periscope depth. It struck a mine field neither side had charted. The crew is presumed lost. The mines were ours.",
  "The civilian fishing fleet has been impounded at the dockyard for the duration. Fishermen are being employed as harbour scouts and small-boat couriers. The fish stocks will recover. The fishermen will not return to fishing.",
  "Aerial supply drops by allied factions resumed last night after a two-week pause. Three of seven canisters were recovered. Two landed in enemy territory. Two were destroyed in the air. The recovered canisters contained insulin. The insulin is being rationed.",
  "Coastal observation reports a new enemy patrol pattern: deep-water sweeps every six hours, instead of every twelve. They are getting smarter. We are running out of routes.",
  "A neutral merchant convoy was halted, searched, and seized by enemy boarding parties. The convoy was carrying medical supplies. The captain is a third-party national. The diplomatic protests will be filed. The medical supplies will not be returned.",
  "Underground couriers report the wasteland passage is now considered the safer route over the highway. The wasteland kills slowly. The highway kills predictably.",
  "A grain consortium has offered to airdrop 800 tonnes of cereal in exchange for a twenty-year mineral rights concession. The cabinet is debating. The bakeries are watching the debate.",
  "Two blockade-running pilots collided in low cloud over the eastern approach at 0140. Both aircraft lost. Both cargoes lost. Both pilots known by name to the dispatcher who sent them. The dispatcher has requested transfer.",
  "Black market exchanges have moved underground — literally — into the storm-drain network. The patrol density required to police them is now greater than the patrol density on the perimeter. The trade-off is being examined.",
  "Fuel rationing has reached the point where ambulances are sharing batteries between calls. The mechanics are improvising. The mechanics are exhausted.",
  "A neutral country's freighter dropped anchor outside the cordon yesterday and refused to leave or unload. Their captain is on the radio every six hours offering passage to civilians. Nobody knows what to do with the offer. The offer is still on the radio.",
  "The blockade has held for ninety-four days. The blockade was projected to break the city in thirty. The projection has been revised. The blockade has not.",
];

export const MORALE_REPORTS_HIGH = [
  "War morale remains strong. The citizens believe in the defense. Don't give them a reason not to.",
  "Propaganda broadcasts are effective. Recruitment numbers are up. Whether that's patriotism or desperation is unclear.",
  "The troops are holding steady. Morale is sustained by supply regularity and clear leadership. Keep both.",
  "Civilian volunteer organizations are coordinating effectively. The home front is organized and determined.",
  "Veterans of earlier engagements are mentoring new recruits. Experience is the one resource we're not short of.",
  "Civilian work brigades are exceeding fortification quotas. Nobody asked. Nobody had to.",
  "The sector hymn is being sung in the shelters at lights-out. Off-key. Loudly. Defiantly. Let the enemy hear it.",
  "Reservist call-up returned 92% within 48 hours. The remaining 8% were already at the front, having gone without orders.",
  "A schoolteacher has been training children to identify enemy aircraft silhouettes. They take it as seriously as anything they have ever done.",
  "Recruitment offices have begun turning volunteers away at midday. The intake processors cannot handle the throughput. The waiting line stretches three blocks. The waiting line is patient.",
  "A retired field marshal has been showing up at the recruitment office every morning to volunteer. He is eighty-one. He is being politely refused. He is being politely told to come back tomorrow. He always does.",
  "Frontline letters home are now arriving in higher volume than at any point in the war. The censors report that fewer of the letters require redaction. The men have nothing left to hide.",
  "A war bond drive in Sector Eleven oversubscribed by a factor of three within forty-eight hours. The treasurer is investigating where the savings came from. The treasurer is also being told to mind their own business.",
  "Field hospitals report a marked drop in stress-related admissions among combat troops. Veterans attribute it to a sense of shared purpose. Doctors attribute it to exhaustion past the point of caring. Both may be correct.",
  "A captured enemy soldier requested asylum after observing the conduct of our forces during the last engagement. He cited the treatment of his wounded as the deciding factor. He is being processed. He may be useful.",
];

export const MORALE_REPORTS_LOW = [
  "War morale is crumbling. Desertion reports are increasing. The garrison needs a victory.",
  "Civilian protests against the war are growing. 'Peace at any price' banners spotted in three districts.",
  "Troops are questioning command decisions. Unit cohesion is fraying at the edges.",
  "War weariness is endemic. The citizens are tired of sheltering, rationing, and waiting for the all-clear.",
  "A mutiny was narrowly averted in the 3rd Infantry Brigade. The ringleaders are in custody. The grievances remain.",
  "Propaganda efforts are failing to counter the reality of empty shelves and body bags.",
  "Field promotions are being declined. Officers don't want the rank. Officers don't want the responsibility for what comes next.",
  "Whispers in the lower hab-blocks suggest the enemy's terms have been suppressed. Whispers tend to be right.",
  "A war hero refused her medal at the public ceremony. She said she had earned a coffin, not a ribbon. The broadcast was cut.",
  "Recruitment posters have been defaced in three districts. The graffiti reads: 'WHO PROFITS?' Nobody has answered it.",
  "A whisper campaign is circulating in the lower districts: that the war is being prolonged for contracts. The campaign cannot be sourced. The campaign is gaining traction. The campaign is partially true.",
  "Veterans of the first six months are refusing redeployment in unprecedented numbers. The reasons given are varied. The pattern is consistent. The replacement pipeline cannot absorb the loss.",
  "A peace march in Sector Three drew an estimated nine thousand participants this morning. The march was orderly. The march was watched. The march was photographed. The photographs are with the political office.",
  "Mothers of conscripts staged a silent vigil outside the recruitment building yesterday. They have done this every week for two months. The vigil is growing. The recruitment building is being moved to a less visible location.",
  "Radio call-in shows have begun receiving anonymous callers reciting casualty lists. The lists are accurate. The lists are not classified, exactly, but they were not meant for broadcast. The shows are being curtailed.",
  "Soldier letters home have begun including phrases that did not exist in the censorship guidelines. The censors are improvising. The phrases are spreading anyway.",
  "A field officer publicly resigned his commission at a military funeral and walked out of uniform. The footage is on every channel that the propaganda ministry does not control. The propaganda ministry controls fewer channels each week.",
];

export const CASUALTY_REPORTS = [
  "Casualty processing is running behind. Families are waiting for notification. The chaplains are overwhelmed.",
  "Field hospitals report a surge in combat injuries. Surgical teams have been on continuous rotation for 48 hours.",
  "The memorial wall in Sector Command is running out of space. A second wall is being prepared.",
  "Next of kin notifications are being delivered. The notification officers are requesting counseling. For themselves.",
  "Replacement troops are arriving, but they're green. Training time is a luxury we don't have.",
  "The wounded are being evacuated to civilian hospitals. Bed capacity is strained across all districts.",
  "A staff sergeant carried four wounded out under fire and went back for a fifth. He did not come back. The four did. They will not forget.",
  "The mortuary has begun stacking cold-storage containers in the parade ground. The parade ground is no longer a parade ground.",
  "Identification of remains is running 11 days behind. Personal effects are being returned without bodies. Families are being asked to wait. The waiting is its own wound.",
  "Combat-stress evacuations have overtaken physical wounds in the past 72 hours. The mind breaks before the body does. Always has.",
  "A field medic has been recommended for the highest decoration available. He carried wounded out of a contested building under continuous fire for nine hours. He is being recommended posthumously.",
  "The ratio of wounded to killed has shifted this month from four-to-one to two-to-one. Better armour, worse weapons. Or worse weapons, better armour. The casualty officers do not have the luxury of analysis.",
  "Three medical evacuation transports were lost to enemy fire this week. The drivers had been doing the route for nine months without incident. They knew every turn. They could not know about the new artillery position.",
  "A field surgeon completed her thousandth amputation at 0200 this morning. She marked the occasion by going outside, sitting down, and not speaking for two hours. Then she came back inside and continued.",
  "The military cemetery at the western perimeter has reached capacity. Land is being requisitioned from the civilian cemetery adjacent. The civilian dead are being relocated. The two are being interred together. Nobody objects. Everybody understands.",
  "A father identified his son's body at the casualty processing station yesterday. The father is a senior officer. The father returned to duty within the hour. The father has not slept since.",
  "Combat-stress wards report a new symptom cluster: troops who refuse to eat unless their unit eats first, even when their unit is not present. The behaviour does not respond to treatment. The behaviour responds to reassignment to the unit. Most of the units no longer exist.",
];

export const WARTIME_CIVILIAN_STORIES = [
  "A teacher in Sector 5 held classes in a bomb shelter. The lesson plan: survival arithmetic. How many rations for how many days.",
  "An elderly engineer volunteered to repair a damaged water main under fire. She fixed it in thirty minutes. The patrol that covered her lost two members.",
  "Children in the lower hab-blocks are playing a new game: 'Air Raid.' The winners are the ones who reach the shelter fastest. Nobody is winning.",
  "A bakery in the market district has stayed open throughout the bombardment. The owner says, 'People need bread more than bunkers.' The queue stretches around the block.",
  "A father carried his family's belongings across three sectors to reach safer ground. When asked what he saved, he said, 'My children. Everything else is replaceable.'",
  "The city orchestra performed a concert in the central shelter. No instruments survived the bombardment, so they sang. It was the most attended cultural event in the city's history.",
  "A veteran marshal donated his combat rations to the refugee center. When asked why, he said, 'I've been hungry before. They haven't.'",
  "Street artists are painting murals on blast-damaged walls. The images show the city as it was. Or as it could be. Hope rendered in rubble dust and stolen paint.",
  "A group of teenagers organized a communication relay using mirrors and hand signals after the comm towers went down. Military intelligence is both impressed and concerned.",
  "The municipal library took a direct hit. Volunteers recovered 40,000 books from the wreckage. A librarian was quoted: 'They can destroy the building. The words survive.'",
  "A doctor performed surgery by flashlight during a power outage. The patient survived. The doctor's hands haven't stopped shaking.",
  "War orphans are being sheltered in the sports complex. There are 847 of them as of this morning. The number grows each day.",
  "A pawnbroker in the lower market has been quietly returning wedding rings to the families of the fallen. He says he can't keep them. He won't say why.",
  "An old caretaker in the cathedral district lights one candle per casualty announcement. He has not slept in weeks. The candles outnumber the prayers.",
  "Two enemy soldiers, lost behind our lines and out of food, surrendered to a baker. She fed them, called the militia, and went back to her oven. The bread did not burn.",
  "A teenager strapped a stretcher to a salvaged hand-cart and now ferries wounded from the eastern barricade nightly. She is fourteen. She has saved nineteen people.",
  "A retired conductor has organized nightly silent vigils at the central station. No words. No banners. Just standing. The crowd grows.",
  "A married couple in Sector Eight have turned their apartment into a courier hub for letters between soldiers and their families. They charge nothing. They have processed eleven thousand letters since the siege began. They have lost both their sons.",
  "An eight-year-old girl from the lower districts memorised the names of every casualty from her hab-block and recites them at the shelter every morning. She has not missed a name. She has not missed a morning.",
  "The Sector Five fishmonger has started giving fish away once the queue at the food distribution point exceeds two hours. He says he can re-stock. The queue cannot re-feed itself.",
  "A barber in the central district has been offering free shaves to soldiers on leave. He keeps a wall of photographs of every soldier who has come through his shop. The wall is full. He has begun a second wall.",
  "Three professional musicians are playing every evening on the platform of the closed underground station, lit by candles, for an audience of evacuees. The musicians refuse payment. The audience brings food. The food is shared. The candles never run out — somebody always brings more.",
  "An old woman in Sector Twelve has been knitting socks for the front line since the first day of the war. She has produced four thousand pairs. Every soldier in the third infantry brigade is wearing her socks today. She is teaching her neighbours to knit.",
  "A schoolboy delivered a letter from the front line to his mother this morning. The letter was written by a soldier she had never met. The soldier had carried her son's last words for three weeks before finding a courier headed home. The letter has been framed.",
  "The pawnbroker in the lower market has begun returning items at no charge to families who lost a member at the front. He has not asked for the proof. He has not asked for the names. He says he can tell.",
  "A taxi driver in Sector Two has converted his vehicle into an ambulance and works the night shift in contested districts without compensation. He has been doing this for sixty-three days. He has saved one hundred and twelve lives, at minimum. He keeps the count in a notebook on the dashboard.",
  "Children in the underground shelters have begun drawing pictures of the surface as it used to be. The pictures are being collected. The collection will be displayed when the war ends. The collection is now larger than any building in the city could hold.",
  "An elderly cook from the closed restaurant district has been preparing meals for stretcher-bearers using ingredients donated by his old suppliers. The meals are simple. The meals are hot. The meals are remembered.",
  "A young woman with a degree in mechanical engineering has been organising the repair of damaged residential buildings in the bombardment zones. She works without permits, without funding, and without sleep. The buildings are being repaired anyway.",
  "A grandfather in Sector Seven has been teaching the under-tens to swim in the underground reservoir, in case the surface routes become impassable and the children need to use the water tunnels. The lessons are official now. The grandfather is being paid in food.",
  "Two librarians have been operating a pop-up reading room in the central shelter every night for the past six weeks. Children attend. Adults attend. Soldiers on leave attend. The librarians have run out of books that are not water-damaged. The librarians keep reading anyway.",
  "A retired veterinarian has been treating wounded military service animals in his garage workshop. The dogs and pack animals he has saved have returned to the front. He keeps photographs of each one. The photographs cover his walls.",
  "A widow in the harbour district has been taking in orphaned children of fallen soldiers. She has nine of them now. The neighbours bring food, fabric, and small repairs. Nobody asks her how she is doing. Everybody helps.",
  "A street artist has been painting the names of fallen soldiers on the walls of the buildings they grew up in. He has covered eleven walls. He has more names than walls. The walls he has finished are now visited daily by mourners. The mourners leave flowers. The flowers are not stolen.",
  "An old factory foreman has organised the volunteer manufacture of stretchers from scrap timber in his neighbourhood courtyard. They have produced four hundred. The stretchers are at the front. Some have come back. Some have not.",
  "A teenage girl carried her wounded brother through three districts under shellfire to reach a field hospital. She made the trip in seven hours. Her brother survived. She refuses to talk about it. She returned to the front the next morning, on her own initiative, to volunteer as a runner.",
  "A music teacher has been organising weekly concerts in the rebuilt districts. The musicians play whatever instruments survived. The audiences sit on rubble. The applause echoes off broken walls. The teacher says the concerts are her contribution to the war. The teacher's concerts are the best-attended public events in the city.",
  "A neighbourhood committee in Sector Nine has organised a system of checking on every elderly resident every six hours, regardless of bombardment. The system has not failed in eighty days. Three lives have been saved that would otherwise have been lost. Nobody on the committee was elected. Nobody on the committee will accept thanks.",
  "A retired postal worker has been hand-delivering mail across the city since the official postal service collapsed. He walks his old route every day. He is sixty-eight. He is being followed at a discreet distance by volunteer escorts who think he does not notice. He notices. He says nothing.",
  "A father in the upper districts has been teaching his three children chess every night in the shelter. He says it is to keep their minds working. He says it is to give them something to think about other than the war. The children are now better than he is. He could not be more pleased.",
  "An elderly couple have been operating a soup kitchen in the back of their bombed-out shop for the duration. They sleep on the floor of the shop. They open every morning at 0500. The queue forms by 0445. The soup is thinner each week. The kitchen has not closed once.",
];

export const INTELLIGENCE_INTERCEPTS = [
  "Enemy comms intercepted: they're concerned about supply line overextension. Push now and they'll fold.",
  "Signal intelligence suggests enemy command is relocating their headquarters. They're worried about our strike capability.",
  "Decoded transmission reveals internal disagreement among enemy leadership. The hardliners want to escalate. The realists want terms.",
  "Enemy scouts are using a new encryption protocol. Our cryptographers are working on it. Estimated time to crack: 12-36 hours.",
  "A defector from the enemy command structure has provided information about troop dispositions. Verification in progress.",
  "Intercepted logistics manifests show enemy ammunition reserves are lower than projected. Their offensive window is narrowing.",
  "Enemy morale reports captured during a raid suggest fatigue and frustration in their ranks. They're hurting too.",
  "Radio chatter indicates enemy forces are receiving reinforcements from their southern border. Timeline: 3-5 days.",
  "Satellite imagery shows construction activity at enemy rear positions. Either they're fortifying or preparing for a long campaign.",
  "A captured enemy officer is cooperating. Reluctantly. The intelligence is actionable but may be selectively truthful.",
  "Enemy quartermaster traffic shows ration cuts at the front. They are losing weight before they lose ground.",
  "A signal burst from enemy rear has been pattern-matched to a known doctrinal preparation for retreat. Or for deception. We are watching both possibilities.",
  "Captured maps show the enemy has misidentified two of our forward depots. We are leaving them misidentified. We are not stupid.",
  "Field cryptographers have flagged a new keyword in enemy traffic: 'Cathedral.' Meaning unclear. Frequency increasing. We do not like the trend.",
  "Enemy supply manifests captured from a downed transport list rations for thirty days only. Their projected campaign was forty-five. The arithmetic is in our favour.",
  "Intercepted command traffic shows the enemy's senior staff are conducting an internal investigation into intelligence leaks. The leaks are not ours. The leaks are real. We are watching the investigation with great interest.",
  "A signal-intelligence sweep identified an enemy headquarters relocation by tracking the movement of three specific encrypted handsets. The handsets have stopped moving. The new headquarters has been pinpointed. The decision on what to do about it is above our pay grade.",
  "Enemy quartermasters are now requesting medical supplies in volumes consistent with a major engagement they have not yet fought. They are anticipating something. We are now anticipating it too.",
  "A captured enemy field manual describes our doctrine in terms that suggest accurate intelligence on our internal command structure. We have a leak. The investigation has begun. The investigation will not be advertised.",
  "Intercepts of enemy field-officer chatter show repeated complaints about ammunition quality. Their forward dumps are running on stockpiles older than the war. The stockpiles are degrading. We will encourage that.",
  "Decoded transmissions reveal the enemy expects our counter-attack at the eastern flank. We were planning the counter-attack at the eastern flank. The plan is being revised. The eastern flank is being made to look more attractive.",
  "An enemy diplomatic cable, captured from a courier patrol, indicates their political leadership is split on whether to seek terms or escalate. The split is roughly even. The cable was not meant to be intercepted. The cable will not be returned.",
  "Counter-intelligence has detected three independent attempts in the past week to recruit our communications operators. The attempts were clumsy. Two of the operators reported the approach immediately. The third did not. The third is now under surveillance.",
  "Enemy weather-forecasting traffic has revealed they are planning a major operation for the next storm window. We now have the operation's projected start time. We do not yet have the operation's objective.",
  "A signals officer captured during the southern raid was carrying his unit's rotation schedule for the next three months. The schedule has been authenticated. The schedule is being exploited.",
  "Enemy social-media monitoring traffic is asking specific questions about the location of our political leadership. The questions suggest an assassination cell may be operating. Counter-intelligence is moving.",
  "Enemy artillery-spotter calls are now being made in clear, no encryption, on a frequency we are not jamming. The pattern suggests they have lost their cipher equipment. The pattern also suggests a trap. We are listening on both possibilities.",
  "Captured enemy training documents indicate they expect our forces to maintain the initiative for another six weeks. Their plan after that is unclear. Their plan suggests they have no plan after that. We will encourage the trend.",
  "An intercepted enemy promotion list shows three of their five most experienced field commanders have been removed from front-line duty in the past ten days. The reasons are not given. The pattern is unmistakable. Their bench is shorter than ours.",
];

export const DIPLOMATIC_WAR_UPDATES = [
  "Neutral parties have offered to mediate. Both sides are 'considering the proposal.' Translation: stalling.",
  "Allied cities have expressed solidarity. Material support: minimal. Moral support: adequate. Practical support: pending.",
  "The enemy has issued a public ultimatum. The terms are unacceptable. The propaganda value is concerning.",
  "Back-channel negotiations are ongoing. Progress is measured in millimeters. The war continues in meters.",
  "A neutral megacity has imposed sanctions on both parties. Their economy can afford it. Ours is less certain.",
  "Intelligence suggests a third party is supplying the enemy. Proof is circumstantial. Suspicion is not.",
  "Allied factions within the city have pledged additional militia support. Quality varies. Enthusiasm does not.",
  "The enemy ambassador (such as they have one) has been expelled. Diplomatic options are narrowing.",
  "Peace feelers are being extended through intermediaries. The enemy wants territory. We want them to stop existing. Negotiations are difficult.",
  "International observers have condemned the conflict. Their condemnation and two credits will buy a recyc-protein bar.",
  "A grain consortium from the northern townships has offered a humanitarian corridor in exchange for trade concessions in perpetuity. The price of bread is paid in sovereignty.",
  "Two minor megacities have severed diplomatic relations with the enemy in protest. They have not severed trade relations. The protest is theatre.",
  "A neutral arbitration body has scheduled hearings for after the war. The dates are tentative. The war is not.",
  "Allied intelligence services have offered actionable data on enemy logistics in exchange for post-war access rights. The price is steep. The data is verified.",
  "A neutral mediator has proposed simultaneous prisoner exchanges and humanitarian corridors. Both sides have agreed in principle. Neither side will agree in practice. The negotiations continue.",
  "A foreign minister of an aligned power has resigned in protest at his government's refusal to provide direct military assistance. His successor has signalled willingness to reopen the question. We are encouraging that willingness.",
  "The international press has begun reporting on conditions inside the city. The reports are accurate. The reports are sympathetic. The reports are not changing the political calculations of any neutral capital. They may yet.",
  "A trade bloc that imposed sanctions on us at the start of the conflict has quietly relaxed three restrictions in the past month. The restrictions concerned dual-use medical equipment. The shipments have begun arriving.",
  "Two former enemy diplomats have surfaced as private citizens in a neutral capital and have begun publishing critical analyses of their own government's war policy. The publications are widely read. The publications are quietly funded by us.",
  "A war crimes tribunal has been convened by a third-party international body. Both sides have refused to participate. Both sides are quietly preparing legal teams. The tribunal will continue regardless.",
  "A religious confederation has issued a joint declaration calling for an immediate ceasefire on humanitarian grounds. The declaration has been signed by leaders from both warring states. Neither government has responded officially. The signatures matter anyway.",
  "An expatriate community of our citizens in a neutral country has organised a fundraising campaign for war relief. The campaign has raised enough to fund three months of operations at a major hospital. The transfer is being arranged through informal channels.",
  "The enemy ambassador to a major neutral power was photographed leaving a private meeting with the mediator's chief of staff. The photograph was leaked. The photograph is now in every newspaper that opposes the war. The negotiations have not been disrupted, exactly.",
  "Aid organisations have requested permission to operate inside the city. We have granted access to four. The enemy has granted access to none. The optics are useful. The aid is more useful.",
  "A consortium of allied corporations has offered favourable financing for post-war reconstruction in exchange for preferred-vendor status on infrastructure projects. The offer is in writing. The offer assumes we win.",
  "The neutral mediator has proposed a confidence-building measure: simultaneous withdrawal of artillery from civilian areas. We have accepted in principle. The enemy has accepted in principle. Neither side has begun the actual withdrawal. The principle is at least on the record.",
  "A senior allied diplomat made an unannounced visit to the city last week and toured the bombardment zones on foot. He was photographed at every stop. He has returned home. His government's position has hardened in our favour.",
  "An enemy delegation has been observed at a third-country resort for the past four days. The composition of the delegation suggests serious negotiation rather than tactical stalling. We have prepared our counter-positions. Both sides are now waiting for someone to blink.",
  "A neutral broadcaster has agreed to carry our official statements unedited for one hour per week, in exchange for matching airtime for the enemy. We are accepting. The audience exceeds our domestic broadcast capacity by an order of magnitude.",
];

export function generateWarDispatch(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const enemyNames = ctx.hostileMegacities.map(m => m.name);
  const enemyList = enemyNames.length > 0 ? enemyNames.join(", ") : "hostile forces";
  const primaryEnemy = ctx.hostileMegacities.length > 0 ? ctx.hostileMegacities[0] : null;

  const moraleSection = ctx.warMorale > 50
    ? pick(MORALE_REPORTS_HIGH)
    : pick(MORALE_REPORTS_LOW);

  const lines = [
    pick(WAR_DISPATCH_INTROS),
    "",
    `─── CONFLICT STATUS ───`,
    `ACTIVE HOSTILITIES WITH: ${enemyList.toUpperCase()}`,
    `FRONTS: ${ctx.hostileMegacities.length} major, ${ctx.hostileLocations.length} minor`,
    `CONTESTED ZONES: ${ctx.contestedZones} | HOSTILE ZONES: ${ctx.hostileZones}`,
    `ACTIVE RAIDS: ${ctx.activeRaids.length}`,
    ctx.underSiege ? "STATUS: ** CITY UNDER SIEGE **" : ctx.blockaded ? "STATUS: ** SUPPLY BLOCKADE IN EFFECT **" : "STATUS: ACTIVE CONFLICT",
    "",
    "─── BATTLEFIELD REPORT ───",
    `BATTLES FOUGHT: ${ctx.totalBattles} | VICTORIES: ${ctx.totalVictories} | DEFEATS: ${ctx.totalDefeats}`,
    `CASUALTIES: ${ctx.casualties.toLocaleString()} | POPULATION LOSSES: ${(s.combat?.totalPopulationLosses ?? 0).toLocaleString()}`,
    `WAR MORALE: ${ctx.warMorale} (${ctx.warMorale > 70 ? "STRONG" : ctx.warMorale > 40 ? "HOLDING" : "CRITICAL"})`,
    `DOCTRINE: ${(s.combat?.activeDoctrine ?? "balanced").toUpperCase()}`,
    "",
    "─── FRONTLINE DISPATCH ───",
    pick(FRONTLINE_DISPATCHES),
    "",
    "─── MORALE ASSESSMENT ───",
    moraleSection,
    ...(primaryEnemy ? [
      "",
      "─── ENEMY INTELLIGENCE ───",
      `${primaryEnemy.name.toUpperCase()}: Threat ${Math.round(primaryEnemy.threat)} | Military: ${primaryEnemy.militaryStrength ?? "Unknown"}`,
      primaryEnemy.leader ? `Enemy Commander: ${primaryEnemy.leader.name} (${primaryEnemy.leader.title}) — Attitude: ${primaryEnemy.leader.attitude}` : "Enemy leadership: unconfirmed",
      pick(INTELLIGENCE_INTERCEPTS),
    ] : []),
    "",
    "— SECTOR COMMAND WAR ROOM",
  ];

  return {
    id: `war-dispatch-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${s.gameDate.hour}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `WAR DISPATCH — ${ctx.underSiege ? "SIEGE CONDITIONS" : ctx.blockaded ? "BLOCKADE ACTIVE" : "CONFLICT UPDATE"}`,
    body: lines.join("\n"),
    read: false,
    priority: ctx.underSiege ? "critical" : "high",
  };
}

export function generateSiegeReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = getWarContext(s);
  if (!ctx.underSiege && ctx.activeRaids.length === 0) return null;

  const r = s.resources;
  const daysOfFood = r.food > 0 ? Math.floor(r.food / Math.max(1, s.rates.foodConsumption)) : 0;
  const daysOfWater = r.water > 0 ? Math.floor(r.water / Math.max(1, s.rates.waterConsumption)) : 0;
  const powerStatus = (s.rates.powerGeneration - Math.floor(s.rates.powerDrain)) > 0 ? "OPERATIONAL" : "CRITICAL";

  // Task #222: append the per-raid signature-unit composition under each
  // raid bullet ("Hostiles spotted: 6× Rust-Pack Bikers, ...") so the
  // siege report reads as faction-flavored intel instead of an opaque
  // strength dump. composition is optional on the raid type — old
  // save-loaded raids fall through with the strength-only line.
  const raidDetails = ctx.activeRaids.slice(0, 3).flatMap(raid => {
    const head = `• ${raid.name}: Strength ${raid.enemyStrength} | Target: ${raid.targetZoneId} | Status: ${raid.status.toUpperCase()} | ETA: ${raid.ticksRemaining} ticks`;
    const spotted = raid.composition ? formatHostilesSpotted(raid.composition, raid.factionSource) : "";
    return spotted.length > 0 ? [head, `   Hostiles spotted: ${spotted}`] : [head];
  });

  const lines = [
    "SIEGE OPERATIONS CENTER — PRIORITY TRANSMISSION",
    "",
    "─── SIEGE STATUS ───",
    ctx.underSiege ? "The city is under active siege. Perimeter breaches are being contested." : "Hostile forces are conducting raid operations against city defenses.",
    "",
    "─── ACTIVE THREATS ───",
    ...(raidDetails.length > 0 ? raidDetails : ["No active raid events at this time."]),
    "",
    "─── SUPPLY STATUS ───",
    `FOOD: ${r.food} units — ${daysOfFood} cycles at current consumption`,
    `WATER: ${r.water} units — ${daysOfWater} cycles at current consumption`,
    `POWER: ${powerStatus}`,
    `AMMO: ${r.ammo} | MED SUPPLIES: ${r.medSupplies} | FUEL: ${r.fuel}`,
    daysOfFood < 5 ? "⚠ CRITICAL: Food reserves will be exhausted within 5 cycles. Rationing insufficient." : "",
    daysOfWater < 5 ? "⚠ CRITICAL: Water reserves dangerously low. Purification plants under strain." : "",
    "",
    "─── DEFENSE INTEGRITY ───",
    `City Defense Rating: ${Math.round(s.cityStats.defenseRating)}`,
    `Contested Zones: ${ctx.contestedZones} | Lost Zones: ${ctx.hostileZones}`,
    `War Morale: ${ctx.warMorale}`,
    "",
    "─── FIELD NOTE ───",
    pick(SIEGE_REPORTS),
    "",
    "─── CIVILIAN IMPACT ───",
    pick(WARTIME_CIVILIAN_STORIES),
    "",
    "— Siege Operations Command",
  ];

  return {
    id: `siege-report-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "alert",
    title: `SIEGE REPORT — ${ctx.activeRaids.length} ACTIVE THREAT${ctx.activeRaids.length !== 1 ? "S" : ""}`,
    body: lines.filter(l => l !== "").join("\n"),
    read: false,
    priority: "critical",
  };
}

export function generateBlockadeReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = getWarContext(s);
  if (!ctx.blockaded) return null;

  const r = s.resources;
  const tradeAgreements = (s.tradeAgreements ?? []).filter(t => t.status === "active");
  const disruptedTrades = tradeAgreements.filter(t => {
    const partner = ctx.hostileMegacities.find(m => m.id === t.partnerId);
    return !!partner;
  });

  const lines = [
    "BLOCKADE SITUATION REPORT — COMMAND PRIORITY",
    "",
    "─── BLOCKADE STATUS ───",
    `HOSTILE ENTITIES ENFORCING BLOCKADE: ${ctx.hostileMegacities.map(m => m.name).join(", ") || "Multiple hostile forces"}`,
    `TRADE ROUTES AFFECTED: ${disruptedTrades.length > 0 ? disruptedTrades.length + " agreements disrupted" : "All external routes under threat"}`,
    `ACTIVE TRADE AGREEMENTS: ${tradeAgreements.length} (${tradeAgreements.length - disruptedTrades.length} still viable)`,
    "",
    "─── SUPPLY IMPACT ───",
    `CREDITS: ${r.credits.toLocaleString()} cr`,
    `FOOD: ${r.food} | WATER: ${r.water} | FUEL: ${r.fuel}`,
    `STEEL: ${r.steel} | GOODS: ${r.goods} | AMMO: ${r.ammo}`,
    "",
    "─── BLOCKADE INTELLIGENCE ───",
    pick(BLOCKADE_REPORTS),
    "",
    pick(BLOCKADE_REPORTS),
    "",
    "─── DIPLOMATIC CHANNEL ───",
    pick(DIPLOMATIC_WAR_UPDATES),
    "",
    "─── RECOMMENDATION ───",
    "Prioritize internal resource production. Explore alternative supply routes through wasteland settlements. Consider military options to break the blockade.",
    "",
    "— Commerce & Supply Division, War Footing",
  ];

  return {
    id: `blockade-report-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "alert",
    title: "BLOCKADE REPORT — SUPPLY LINES SEVERED",
    body: lines.join("\n"),
    read: false,
    priority: "critical",
  };
}

export function generateWarCasualtiesReport(s: GameState): GameMessage | null {
  if (!s.gameDate || !s.combat) return null;
  const ctx = activeWarContext(s);
  if (!ctx || ctx.totalBattles === 0) return null;

  const kd = ctx.totalVictories > 0
    ? (ctx.totalVictories / Math.max(1, ctx.totalBattles) * 100).toFixed(1)
    : "0.0";

  const recentBattles = s.combat.battleLog?.slice(0, 5) ?? [];
  const battleSummaries = recentBattles.map(b =>
    `• ${b.engagementName?.toUpperCase() ?? "ENGAGEMENT"} at Zone ${b.zoneId ?? "unknown"}: ${b.victory ? "VICTORY" : "DEFEAT"} — Our losses: ${b.playerCasualties ?? 0} | Enemy: ${b.enemyCasualties ?? 0}`
  );

  const lines = [
    "CASUALTY & OPERATIONAL SUMMARY — RESTRICTED",
    "",
    "─── AGGREGATE STATISTICS ───",
    `TOTAL ENGAGEMENTS: ${ctx.totalBattles}`,
    `VICTORIES: ${ctx.totalVictories} | DEFEATS: ${ctx.totalDefeats}`,
    `WIN RATE: ${kd}%`,
    `TOTAL CASUALTIES (OURS): ${ctx.casualties.toLocaleString()}`,
    `ENEMY KILLS: ${(s.combat.totalEnemyKills ?? 0).toLocaleString()}`,
    `CIVILIAN POPULATION LOSSES: ${(s.combat.totalPopulationLosses ?? 0).toLocaleString()}`,
    "",
    ...(battleSummaries.length > 0 ? [
      "─── RECENT ENGAGEMENTS ───",
      ...battleSummaries,
      "",
    ] : []),
    "─── PERSONNEL NOTE ───",
    pick(CASUALTY_REPORTS),
    "",
    "─── HUMAN COST ───",
    pick(WARTIME_CIVILIAN_STORIES),
    "",
    "— Office of Military Records",
  ];

  return {
    id: `war-casualties-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `CASUALTY REPORT — ${ctx.casualties.toLocaleString()} TOTAL`,
    body: lines.join("\n"),
    read: false,
    priority: "high",
  };
}

export function generateWarDiplomacyUpdate(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const activePacts = (s.diplomaticPacts ?? []).filter(p => p.status === "active");
  const defensePacts = activePacts.filter(p => p.pactType === "mutual-defense");
  const brokenPacts = (s.diplomaticPacts ?? []).filter(p => p.status === "broken");

  const enemyNames = ctx.hostileMegacities.map(m => m.name);
  const friendlyFactions = s.factions.filter(f => f.isActive && f.loyalty > 50);
  const hostileFactions = s.factions.filter(f => f.isActive && f.loyalty < 20);

  const lines = [
    "DIPLOMATIC & POLITICAL INTELLIGENCE — WARTIME BRIEF",
    "",
    "─── CONFLICT PARTIES ───",
    `ENEMIES: ${enemyNames.length > 0 ? enemyNames.join(", ") : "Unidentified hostile forces"}`,
    `HOSTILE FACTIONS (INTERNAL): ${hostileFactions.length > 0 ? hostileFactions.map(f => f.name).join(", ") : "None currently"}`,
    `ALLIED FACTIONS: ${friendlyFactions.length > 0 ? friendlyFactions.map(f => f.name).join(", ") : "None confirmed"}`,
    "",
    "─── PACT STATUS ───",
    `ACTIVE PACTS: ${activePacts.length} (${defensePacts.length} mutual defense)`,
    `BROKEN PACTS: ${brokenPacts.length}`,
    ...(defensePacts.length > 0 ? defensePacts.map(p => `• Mutual Defense with ${p.partnerName}: ${p.remainingTicks} ticks remaining`) : []),
    "",
    "─── DIPLOMATIC CHANNELS ───",
    pick(DIPLOMATIC_WAR_UPDATES),
    "",
    pick(DIPLOMATIC_WAR_UPDATES),
    "",
    "─── INTERNAL POLITICS ───",
    hostileFactions.length > 0
      ? `WARNING: ${hostileFactions.length} internal faction${hostileFactions.length > 1 ? "s" : ""} with loyalty below 20. Risk of collaboration with external enemies.`
      : "Internal factions remain broadly aligned with city defense. Monitor for opportunistic defection.",
    s.cityStats.unrest > 50
      ? `Civil unrest at ${Math.round(s.cityStats.unrest)}. Anti-war sentiment is exploitable by hostile propaganda.`
      : "Public opinion broadly supports the defense effort.",
    "",
    "— Office of Wartime Diplomacy",
  ];

  return {
    id: `war-diplomacy-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: "WARTIME DIPLOMACY — STATUS UPDATE",
    body: lines.join("\n"),
    read: false,
    priority: "high",
  };
}

export function generateHomeFrontReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const cs = s.cityStats;
  const r = s.resources;

  const homeFrontIntros = [
    "Home front assessment compiled. The city endures. The question is for how long.",
    "Civilian sector report during wartime operations. The people are scared but functioning.",
    "Wartime domestic brief. The factories run. The clinics overflow. The shelters fill. Life goes on.",
    "Internal affairs summary under conflict conditions. The war is outside the walls. The suffering is inside.",
    "Municipal operations report — wartime footing. Everything costs more. Everything takes longer. Everything matters more.",
  ];

  const warEffects: string[] = [];
  if (cs.happiness < 40) warEffects.push(`Happiness at ${Math.round(cs.happiness)}. War weariness is taking its toll on civilian morale.`);
  if (cs.crime > 50) warEffects.push(`Crime at ${Math.round(cs.crime)}. Wartime conditions are creating opportunities for criminal elements.`);
  if (cs.unrest > 50) warEffects.push(`Unrest at ${Math.round(cs.unrest)}. Anti-war protests and draft resistance are increasing.`);
  if (cs.publicHealth < 50) warEffects.push(`Public health declining to ${Math.round(cs.publicHealth)}. Medical resources diverted to military casualties.`);
  if (r.food < 100) warEffects.push(`Food reserves critically low at ${r.food}. Civilian rationing is not sustainable.`);
  if (cs.employment < 60) warEffects.push(`Employment at ${Math.round(cs.employment)}%. War has disrupted normal economic activity.`);
  if (cs.employment > 90) warEffects.push(`Employment at ${Math.round(cs.employment)}%. War production has absorbed all available labor. Burnout risk rising.`);

  const warEconomyNotes = [
    "Military spending is consuming an increasing share of the budget. Civilian infrastructure maintenance is being deferred.",
    "War bonds have been issued to fund the defense. Uptake is moderate. Trust in the currency is not.",
    "Factory output has shifted to military production. Consumer goods are scarce. The black market is thriving.",
    "Construction projects are on hold. All steel and concrete has been requisitioned for defensive fortifications.",
    "Tax revenue is declining as commercial activity contracts. The treasury is burning through reserves.",
    "The war economy is generating employment but destroying wealth. A pyrrhic prosperity.",
    "Scrap metal collection drives have stripped the city of non-essential metalwork. Park benches, guard rails, decorative fixtures — all melted down for the war effort.",
    "Night shifts have been mandated in all munitions factories. Worker injuries are up 40%. Complaint forms are out of stock.",
  ];

  const lines = [
    pick(homeFrontIntros),
    "",
    "─── CIVILIAN STATUS ───",
    `POPULATION: ${fmtPop(cs.population)} | HAPPINESS: ${Math.round(cs.happiness)} | UNREST: ${Math.round(cs.unrest)}`,
    `CRIME: ${Math.round(cs.crime)} | PUBLIC HEALTH: ${Math.round(cs.publicHealth)}`,
    `EMPLOYMENT: ${Math.round(cs.employment)}% | HOUSING PRESSURE: ${Math.round(cs.housingPressure)}%`,
    "",
    ...(warEffects.length > 0 ? ["─── WARTIME IMPACTS ───", ...warEffects.map(e => `⚠ ${e}`), ""] : []),
    "─── WAR ECONOMY ───",
    pick(warEconomyNotes),
    "",
    "─── VOICES FROM THE HOME FRONT ───",
    pick(WARTIME_CIVILIAN_STORIES),
    "",
    "─── MORALE INDICATOR ───",
    ctx.warMorale > 60
      ? "The population remains resolute. Patriotic displays are visible across all sectors. The shared threat has unified disparate communities."
      : ctx.warMorale > 30
        ? "War fatigue is growing. The initial solidarity is fraying. People want normalcy. They're not getting it."
        : "Morale is collapsing. Desertion, draft evasion, and defeatism are spreading. The city needs a victory or a peace. Soon.",
    "",
    "— Department of Civilian Affairs, Wartime Division",
  ];

  return {
    id: `home-front-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `HOME FRONT REPORT — ${warEffects.length > 2 ? "STRAINED" : warEffects.length > 0 ? "HOLDING" : "STABLE"}`,
    body: lines.join("\n"),
    read: false,
    priority: warEffects.length > 2 ? "high" : "normal",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Round M additions: extra wartime/siege event types. Each follows the
// existing "rich-text inbox briefing" pattern. Generators return null when
// preconditions aren't met so the periodic dispatcher can fall through.

export const SORTIE_REPORTS = [
  "Sortie launched at 0300 from the eastern sally port. Two enemy artillery emplacements destroyed. Six of our wranglers did not return.",
  "A counter-raid against the enemy supply depot succeeded. Three days of their food, two days of their fuel — gone. They will be hungrier than us by tomorrow.",
  "Light cavalry punched through the cordon line, reached the enemy's medical tent, and fell back before reinforcements arrived. The doctors had information. We have it now.",
  "A night sortie spiked four enemy guns and burned a fuel dump. Sortie commander killed leading the withdrawal. The guns stayed spiked.",
  "Sappers crawled through the storm drains and surfaced behind the enemy's outer trench. The surprise was total. The price was heavy.",
  "A breakout attempt by the 4th Marshal Battalion punched a corridor to the contested salient. The corridor closed behind them within the hour. They are still in there. They are still fighting.",
  "Marshal scouts crossed no-man's-land at first light and returned with maps, prisoners, and one half-burned ledger. The ledger lists what the enemy expects to lose. The numbers are interesting.",
  "A lightning raid on the enemy's forward command post killed two staff officers and captured one. The captured officer is talking. The other two are not.",
  "A combined-arms breakout reached the enemy's third defensive line before being recalled by command. The line was breached. The line could have been held. The line was given back. The decision will be examined later. There is no later that is convenient.",
  "Engineer demolition teams crossed the river under fog at 0300 and destroyed two enemy pontoon bridges before withdrawing. The withdrawal was contested. The bridges remain destroyed.",
  "A motorised column ran the enemy's flank, struck their rear-area logistics, and returned through a gap in the cordon that closed within ninety minutes of their passage. Eleven vehicles went out. Eight came back. The depot is still burning.",
  "A reconnaissance-in-force probed the southern sector and confirmed the enemy has stripped reserves to reinforce the north. The opportunity window is real. The opportunity window is closing. Command is debating.",
  "A counter-raid on the enemy's artillery park spiked four guns and ignited a munitions store. The store was larger than our intelligence had estimated. The detonation was visible from the city walls.",
  "Sortie group Bravo-Two punched through the cordon, reached the enemy field hospital, and held the perimeter for thirty-eight minutes while medical specialists triaged wounded enemy personnel and our own captured. The captured were extracted. The wounded enemy were left with morphine and clear consciences. The sortie was contested on the way back. Most of the sortie returned.",
  "A small-boat raid on the enemy's harbour facilities sank two patrol craft and damaged a third. The boats were crewed by volunteers from the civilian fishing fleet. The boats were never expected to return. Two of three returned.",
  "A combined airborne and ground sortie struck the enemy's regional command post and recovered three classified intelligence binders before withdrawing. The binders are being translated. The translation is taking longer than expected because the binders are extensive.",
  "A diversion force of fifty engaged an enemy battalion long enough for the main raiding party to slip past on the flank. The fifty were not expected to disengage. The fifty did not disengage. The main raid succeeded.",
  "Sortie commander Captain Vikha led the third assault on the eastern bunker complex, broke the line, and held the position alone after her squad was reduced to combat-ineffective. She was extracted at first light. She is alive. She will not be available for further sorties.",
  "A long-range raiding patrol penetrated forty kilometres into hostile territory and destroyed an enemy fuel depot before extracting through a wasteland route nobody had attempted before. The route worked. The route is now being mapped. The route will be used again.",
  "A diversionary sortie at the western gate drew enemy reserves while the main strike hit the southern logistics hub. Both objectives succeeded. The casualties on the diversionary sortie exceeded the casualties on the main strike by a factor of three. The diversionary sortie knew this in advance.",
  "Sortie planning has been suspended for forty-eight hours after the loss of three consecutive raiding parties to a single enemy ambush position. The position has been identified. The position is being addressed. The sorties will resume.",
];

export const AERIAL_ENGAGEMENTS = [
  "Air patrol intercepted an enemy gunship over Sector 9. The gunship is in the river. Our pilot landed with one engine and three holes in the canopy.",
  "Enemy drone swarm attempted to overwhelm our point-defense net. We lost two batteries. They lost the swarm.",
  "A stratospheric reconnaissance flight was downed by enemy SAM fire. The pilot ejected over contested territory. Recovery operations ongoing.",
  "Our last working bomber struck the enemy's pontoon bridge and put it underwater. The bomber did not come home. The bridge is still underwater.",
  "Rotorcraft transport carrying medical supplies took ground fire on approach. It landed. Most of the supplies survived. Most of the crew did not.",
  "Enemy air assets are now operating from a captured airstrip 40km north. Our counter-air capability is being reorganized. Pilots are being recalled from training rotations.",
  "A dogfight over the harbor lasted nine minutes and ended with three enemy fighters and one of ours in the water. The remaining enemy aircraft turned back.",
  "Civil aviation has been grounded indefinitely. The civilian airport perimeter is now a military restricted zone. The hangars house munitions, not luggage.",
  "Air defence reported zero engagements in the last twenty-four hours, the first such period since the war began. The crews are sleeping in shifts for the first time in months. They are sleeping with their boots on.",
  "A high-altitude reconnaissance flight detected a new enemy airbase under construction sixty kilometres beyond the old front line. Construction is rapid. Construction implies they expect to be there for a while. Construction implies they expect us to be here for a while too.",
  "Two of our remaining heavy-lift aircraft were destroyed on the ground by a long-range artillery strike that should not have been possible from the enemy's known firing positions. Either the firing positions are not the known firing positions, or the artillery is not the known artillery. Both possibilities are being investigated.",
  "A captured enemy pilot has provided detailed information about their squadron's operational rhythms in exchange for medical care for his wounded co-pilot. The information is being verified. The wounded co-pilot is being treated. The pilot has been told nothing about the co-pilot's condition. The condition is poor.",
  "Enemy aircraft have begun flying at altitudes outside our SAM coverage envelope, suggesting they have identified the limits of our air defence radar. The envelope is being adjusted. The adjustment is expensive. The adjustment is necessary.",
  "A friendly-fire incident over the northern sector resulted in the loss of one of our own aircraft to our own air defences. Both the air defence crew and the pilot are blameless under the circumstances. The investigation is closed. The pilot was eight months from rotation home. He will not be rotating home.",
  "Civilian rooftop spotters in the inner districts have been credited with the early detection of three of the past five enemy air strikes. The civilian network is being formalised. The civilians are being issued binoculars and signal flags. The civilians are eating before the regulars again.",
  "Aerial reconnaissance imagery shows the enemy's main fighter base under camouflage netting that has not moved in fourteen days. The aircraft beneath are either grounded by maintenance issues or being preserved for a single decisive operation. We are preparing for both.",
  "A strategic bombing run against the enemy's industrial heart was scrubbed at the last moment when intelligence indicated civilian workers were being held on-site as human shields. The intelligence was correct. The bombing has been postponed indefinitely. The decision will be controversial.",
  "An enemy aircraft attempted a low-level penetration of our southern radar arc using terrain masking. The penetration was successful for forty kilometres. The aircraft was destroyed by a forward observer with a man-portable missile system who happened to be looking at the right valley. He has been promoted on the spot.",
  "Two of our pilots collided in low cloud on a routine patrol this morning. Both ejected. Both were recovered. Both will fly again this week. The aircraft are scrap. We have eleven aircraft left. We had thirteen at sunrise.",
  "Enemy electronic-warfare aircraft have been jamming our regional radar for three of the past five days. The jamming is sophisticated. The jamming is consistent with equipment we know they did not previously possess. Someone has supplied them. The investigation is in progress.",
  "A captured enemy reconnaissance drone is now being operated by our intelligence section against the enemy's own positions. The drone reports back to a command channel the enemy still considers secure. The intelligence is excellent. The intelligence will not last.",
];

export const CYBER_WARFARE_LINES = [
  "Enemy intrusion detected against the municipal grid. The attack was contained at the edge. Two operators are being commended. One operator is being investigated.",
  "Our cryptography teams have broken the enemy's tactical encryption. We have a 36-hour window before they rotate keys. Use it.",
  "A worm infiltrated the water treatment SCADA network. It was caught before it could trigger. Engineers are auditing every controller in the city. Every controller. By hand.",
  "Enemy disinformation has saturated the city's social channels. Three hoax air-raid signals were broadcast yesterday. Citizens are losing faith in the alarms.",
  "Our cyber-warfare unit blacked out the enemy's logistics network for eleven minutes. Eleven minutes was enough. Their resupply convoy missed its window.",
  "A deepfake broadcast purported to show the office of the Commander capitulating. The broadcast was traced and counter-broadcast within ninety minutes. The rebuttal is now winning. Barely.",
  "Enemy hackers compromised the traffic management AI in three districts. Civilian vehicles were rerouted into kill zones. Casualties: 31. Systems are now air-gapped.",
  "Our offensive cyber team has shut down the enemy's payroll system. Their conscripts have not been paid in nine days. Desertion is a contagion that does not need encryption.",
  "Enemy cyber forces have launched a coordinated denial-of-service against our emergency dispatch system. The system is degraded but functional. Backup analog dispatch via runners has been reactivated. The runners are being paid in war bonds.",
  "A previously-unknown vulnerability in our perimeter sensor network was exploited last night and patched by 0400. Three sensors were compromised. The patrol density along the affected sector has been doubled until the sensors are reauthenticated.",
  "Our cryptography section has decrypted an enemy field-radio cipher that they have been using since the start of the conflict. The decryption is being kept quiet so they continue to use it. They will eventually rotate. Until they do, every transmission is in the clear for us.",
  "An attempted intrusion into the city's water-quality monitoring system was detected and blocked at the firewall. The intruder probed for fourteen minutes before withdrawing. The signature matches enemy military cyber units. The forensic team is assembling the report. The report will be classified.",
  "A friendly cyber militia — civilians, mostly former corporate security professionals — has been offering its services to the war effort. We have accepted a vetted subset. They are operating under loose direction. They are surprisingly effective. They are also unpredictable.",
  "Enemy hackers attempted to plant ransomware on the central transport authority's scheduling system. The attempt failed. The encryption keys were exfiltrated by our counter-intrusion team and are now being used against the attackers' own systems. Mutual escalation continues.",
  "A captured enemy laptop yielded a list of intended cyber targets within the city for the next operational phase. The targets include three hospitals, two power stations, and the public broadcaster. All targets have been hardened. All targets remain at risk anyway.",
  "Our offensive cyber team has corrupted the enemy's logistical inventory database. Their forward depots are now receiving requisitions for items they do not stock and shipments of items they did not order. Their quartermasters are working in chaos. They will recover. Until they do, exploit it.",
  "A power grid fluctuation in the northern districts at 0143 has been traced to an attempted intrusion into the supervisory control system. The intrusion was repelled. Three engineers are being decorated. The grid is being audited again, by hand.",
  "Enemy electronic-warfare units have begun spoofing our emergency broadcast frequencies with false air-raid signals. The signals are convincing. Citizens are tiring of false alarms. The next real alarm may not be heeded. The propaganda effect is the actual objective.",
  "A teenage hacker in the lower districts independently identified a vulnerability in the enemy's regional communications relay and exploited it for fourteen hours before our intelligence section discovered him. He is now employed by the intelligence section. He is sixteen. He is paid in real food.",
  "A previously-isolated municipal network was breached via a contractor's laptop that had been brought home and then returned. The contractor is being interviewed. The breach has been contained. The procedures around contractor access are being rewritten.",
  "Our forward signal-intelligence units intercepted an enemy cyber-operation order in real time and warned the targeted infrastructure with twelve minutes to spare. The targeted infrastructure was a hospital. The hospital's systems were brought into a defensive posture before the attack landed. The attack failed. Twelve minutes was enough. Twelve minutes is sometimes not enough.",
];

export const PROPAGANDA_VOLLEYS = [
  "Enemy leaflet drops over Sector 3 promised amnesty and rations to anyone who lays down arms. The leaflets are being collected. The rations are not arriving.",
  "Our broadcasters aired captured enemy soldiers describing the conditions in their own ranks. The transcript is being reproduced and posted on every shelter wall.",
  "A pirate radio station has begun broadcasting on a wavelength close to ours, mixing real news with falsified casualty figures. Triangulation efforts are ongoing.",
  "Public murals depicting the sector administration as decisive and the enemy as brittle have been authorized in twelve districts. The artists are working under armed escort. Some of the paint is donated.",
  "Enemy propaganda has begun targeting specific officers by name, accusing them of corruption and incompetence. Most of the accusations are false. Some of them are not.",
  "A counter-propaganda unit has been dispatched to the refugee centers to combat defeatism. Their tools: facts, hot food, and one veteran sergeant per shelter. The sergeants seem to be the most effective tool.",
  "Children's broadcasts have been altered to teach air-raid drills as a singing game. The melody is catchy. The lesson is grim. The casualties at the schools are dropping.",
  "Two municipal journalists were caught printing enemy propaganda for hard currency. They are now in custody. The presses are now in rotation under guard.",
  "Enemy propaganda this week has shifted from claims of imminent victory to claims of unjust treatment by neutral parties. The shift is significant. They are preparing their public for a long war. So are we.",
  "Our broadcasters aired a feature on the enemy's treatment of prisoners of war based on testimony from recovered captives. The feature has been picked up by neutral broadcasters in three countries. The propaganda value is genuine. The testimony is also true.",
  "A counter-propaganda film produced in our studios has been smuggled into enemy territory and is being shown clandestinely. The film documents the conditions of enemy soldiers as described by their own letters home. The letters were genuine. The translation was accurate. The effect is reportedly significant.",
  "Enemy leaflets dropped over the western districts this week promised land grants and citizenship to anyone who turns in a serving officer. The leaflets are being collected and burned. A small number have been kept for the museum. The land grants do not exist.",
  "Our public information campaign on rationing compliance has reduced black-market food trade by an estimated thirty percent in the past month. The reduction is real. The reduction is not enough. The campaign is being intensified.",
  "Enemy radio broadcasts have begun naming individual officers and accusing them of war crimes by name and unit. The accusations are mostly false. Some are partially true. All are being examined. Some are being acted on.",
  "Children's broadcasting has been redirected to teach civic resilience and air-raid procedures through animated features. The features are produced by volunteer animators working from a converted warehouse. The features are popular. The features are also being copied and redistributed by the enemy with their voice tracks replaced.",
  "A pirate broadcaster operating from inside our own territory has been transmitting demoralising material on a frequency adjacent to ours. The broadcaster has been triangulated. The broadcaster is now in custody. The broadcaster was a former employee of our own propaganda ministry.",
  "Public posters featuring portraits of fallen soldiers, with their names, ages, and final letters home, have been authorised across all districts. The posters are being read. The posters are being added to. The posters do not need captions.",
  "Enemy media has begun running interviews with our defectors. The defectors are being treated well in the interviews. The defectors are not numerous. The interviews are persuasive to those who wish to be persuaded.",
  "A religious broadcaster from a neutral country has been airing weekly programmes calling for a negotiated peace. The programmes are listened to in both warring states. The programmes are gaining traction with civilian audiences. The military leaderships of both sides are uncomfortable.",
  "Our foreign-language broadcasting service has expanded to reach diaspora communities in three new countries. The aim is to influence those countries' domestic political discussions. The aim is being met. The audience is engaged. The funding is being increased.",
  "A rumour campaign attributing recent enemy military setbacks to internal political infighting has been amplified across our broadcasting networks. The rumour is partially true. The amplification is more than partially effective. The enemy's political leadership is now defending itself publicly. The defence is itself revealing.",
];

export const SIEGE_BREACH_LINES = [
  "Eastern curtain wall: section 7-Gamma. A 20-meter breach was opened by sustained heavy artillery. Reserve infantry has plugged the gap with rubble, sandbags, and bodies.",
  "Northern gatehouse: a sapper charge collapsed the inner gate. The outer gate held. Enemy infantry surged into the killbox between the two. The killbox functioned as designed.",
  "Sector 4 wall: a vehicle-borne explosive breached the wall and three enemy squads crossed before the aperture was sealed. They are now contained in two warehouses. Our flamethrower team is en route.",
  "Underground breach: enemy tunnellers surfaced in the lower hab-block ventilation shafts. Civilians evacuated the block within twelve minutes. The fighting in the shafts is ongoing.",
  "Harbor breakwater: a fast-attack craft punched through the boom and grounded itself near the dockyard. The crew tried to scuttle it. Most of them succeeded.",
  "Aerial breach: enemy gliders deployed from a high-altitude aircraft and landed inside the inner perimeter. Three gliders. Three squads. Two squads were eliminated within an hour. The third has gone to ground.",
  "Sewer breach: enemy infiltrators surfaced through a maintenance grate two blocks behind the main line. The grate was supposed to be welded. The maintenance log says it was. The maintenance log is being audited.",
  "Rooftop breach: enemy fast-rope teams descended from a hijacked civilian rotorcraft onto the comms tower. The tower held. The civilian pilot did not survive the engagement.",
  "Western salient: a sustained mortar barrage cracked the third reinforcement line. Engineers were on-site within fourteen minutes. The crack is now twelve metres of rubble and three rolls of razor wire. The crack is also still cracking.",
  "Industrial gate: a captured enemy assault transport rammed the outer barricade at speed. The barricade absorbed the impact. The transport's payload, which had been left on a timer, did not. The repair crew has begun work in lulls between shellfire.",
  "Sector Five wall: a microbreach was sealed within two hours by a volunteer crew of dock workers. The dock workers had no formal training in fortification. The dock workers improved on the original design. The repair has been adopted as standard.",
  "Northern outwork: enemy infantry achieved a momentary breach during the dawn assault, advanced fifty metres, and were cut off by a counter-charge from a militia detachment of retirees. The retirees took the position back. The retirees are being commended. The youngest of them is sixty-three.",
  "Underground breach: enemy combat engineers tunnelled into the sub-basement of an abandoned hospital and emerged behind our second line. They were detected within minutes by a maintenance worker who knew the building. The maintenance worker is in critical condition. The breach has been resealed.",
  "Eastern wall: a cumulative collapse of three weakened sections has created a ninety-metre breach. Reserves are committed. Civilian volunteers are filling sandbags two hundred metres back, ready to advance with the engineers. The line will hold tonight. Tomorrow is tomorrow's problem.",
  "Sky Bridge Three: enemy commandos attempted to seize the elevated transit bridge connecting the inner and outer districts. The attempt was repulsed by a security detail that included two off-duty waiters. The bridge is being reinforced. The waiters have been offered military commissions. They have declined. They are returning to their restaurant.",
  "Harbour breach: a swimmer-delivery team penetrated the inner harbour boom and attached limpet charges to two patrol craft. The charges were detected and neutralised before detonation. The swimmers were captured. The swimmers were polite. The swimmers were handed to interrogation.",
  "Bunker breach: an enemy demolition charge collapsed the upper level of Bunker Twelve. The lower level held. Sixty-three personnel were trapped for fourteen hours before extraction. All were recovered alive. Two refused medical treatment until their unit was accounted for. The unit was accounted for. The two then collapsed.",
  "Ventilation breach: enemy gas teams attempted to introduce a chemical agent through the main ventilation intake of Shelter Seven. The intake had been modified six weeks earlier to include passive carbon filtration. The modification was the work of one civilian engineer who had read about chemical attacks in a history book. The shelter is intact. The engineer is being honoured.",
  "Wall section Bravo-Eleven: a previously unidentified enemy artillery battery shelled the wall continuously for six hours and opened a breach forty metres wide. The battery has now been located. The battery has now been silenced. The breach is still being closed.",
  "Underground utility tunnel: enemy infiltrators using non-standard equipment penetrated the storm-drain network and emerged in the rear of Sector Three. They were intercepted by a patrol that had been alerted by an unusually attentive citizen. The citizen was a janitor. The janitor is being thanked. The infiltrators are being interrogated.",
  "Aerial breach: a glider assault descended on the central administrative complex at first light. Six gliders. Four were destroyed in the air. Two landed. The personnel from the two were neutralised within twenty minutes by the building's ceremonial guard, who had not been expected to see action. The ceremonial guard is now an operational unit.",
];

export const MILITIA_CALLUP_LINES = [
  "Reservist call-up returned 87% within the first 24 hours. The remaining 13% are being followed up. Some of them have already been followed up by enemy artillery.",
  "Civilian volunteer brigades have been organized in every district. The training is rudimentary. The motivation is not.",
  "A militia of dock workers, off-duty enforcers, and one retired drill instructor has held the southern checkpoint for three days unsupported.",
  "Veterans of earlier conflicts have come out of retirement in numbers. Average age of new militia commanders: 54. Average age of new militia recruits: 19. The middle of the bell curve is at the front, has been at the front, will be at the front.",
  "Hab-block muster lists were posted at dawn. By midday they were full. By dusk the supplementary lists were full. The armoury is the bottleneck now, not the will.",
  "A women's auxiliary brigade self-organized in Sector 11 and presented itself for assignment in matching armbands. Quartermaster issued rifles without comment.",
  "The municipal tram operators' union voted to release members for militia duty between shifts. The trams still run. The drivers carry sidearms now.",
  "Refugee volunteers — people who arrived at the gates last month with nothing — have requested militia training in numbers exceeding intake capacity. The intake capacity is being expanded.",
  "A retired sergeant-major has organised a militia training programme using the disused parade ground in Sector Eight. He drills new recruits at dawn and dusk every day. His students are queueing up at 0400 to be ahead of the line. He has not asked for compensation. He has not been offered any. He has not asked.",
  "A militia battalion of former civil-service clerks has been formed for rear-area security duty. They are not infantry-grade. They are excellent at logistics and paperwork. They have liberated three of our regular battalions to redeploy forward. They are very pleased with themselves. They are entitled to be.",
  "A women's auxiliary brigade has voted unanimously to request frontline assignment, citing the example of three other brigades currently in combat. Command is debating. The brigade is not waiting for the debate to conclude. The brigade is already moving forward.",
  "A militia company composed entirely of former criminal offenders, organised by a reformist priest, has been assigned to a contested checkpoint. They have held the checkpoint for nine days. They have not committed a single infraction. They are requesting amnesty for past offences in exchange for continued service. The request is being seriously considered.",
  "A teenage militia battalion — average age sixteen — has been formed in the upper districts and assigned to civil defence duties. The teenagers are not committed to combat. The teenagers have nonetheless saved an estimated four hundred lives in evacuation operations. The teenagers do not understand why anyone is impressed.",
  "Volunteer brigades from the northern townships have arrived to reinforce our garrison. They brought their own equipment, their own food, and their own commanders. They are being integrated. They are being treated with great care. They are valuable beyond their numbers.",
  "A militia of musicians, formed initially as a morale unit, has been deployed in a defensive role at the central railway station. They have held the position for eleven days. They have also continued to perform nightly. The performances draw audiences. The audiences are now used to the sound of the station's sentries clicking safety catches in time with the music.",
];

// ────────────────────────────────────────────────────────────────────────────

export function generateSortieReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;
  // Sorties are most narratively justified when there's something to break
  // out of: under siege OR active raids in progress.
  if (!ctx.underSiege && ctx.activeRaids.length === 0) return null;

  const lines = [
    "SORTIE OPERATION REPORT — RESTRICTED HANDLING",
    "",
    "─── MISSION SUMMARY ───",
    pick(SORTIE_REPORTS),
    "",
    "─── TACTICAL CONTEXT ───",
    `Active raids: ${ctx.activeRaids.length} | Hostile zones: ${ctx.hostileZones} | Contested: ${ctx.contestedZones}`,
    `Doctrine: ${(s.combat?.activeDoctrine ?? "balanced").toUpperCase()} | War morale: ${ctx.warMorale}`,
    "",
    "─── COMMANDER'S NOTE ───",
    "Sorties trade lives for initiative. The arithmetic only works if the initiative is exploited.",
    "",
    "— Forward Operations Cell, Sector Command",
  ];

  return {
    id: `sortie-report-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: "SORTIE REPORT — COUNTERATTACK SUMMARY",
    body: lines.join("\n"),
    read: false,
    priority: ctx.underSiege ? "high" : "normal",
  };
}

export function generateAerialEngagementReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const lines = [
    "AERIAL OPERATIONS DIGEST — AIR DEFENSE COMMAND",
    "",
    "─── ENGAGEMENT NOTE ───",
    pick(AERIAL_ENGAGEMENTS),
    "",
    "─── SUPPORTING DETAIL ───",
    pick(AERIAL_ENGAGEMENTS),
    "",
    "─── AIR DEFENSE STATUS ───",
    `Hostile zones overhead: ${ctx.hostileZones}`,
    `Active raid events with air component: ${ctx.activeRaids.filter(r => r.name?.toLowerCase().includes("air") || r.name?.toLowerCase().includes("strike")).length}`,
    "",
    "— Air Defense Command, Sector Operations",
  ];

  return {
    id: `aerial-engage-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: "AERIAL ENGAGEMENT — OPERATIONS DIGEST",
    body: lines.join("\n"),
    read: false,
    priority: "normal",
  };
}

export function generateCyberWarfareReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const lines = [
    "CYBER OPERATIONS BULLETIN — DIGITAL FRONT",
    "",
    "─── INCIDENT NOTE ───",
    pick(CYBER_WARFARE_LINES),
    "",
    "─── CORRELATED ACTIVITY ───",
    pick(CYBER_WARFARE_LINES),
    "",
    "─── DIGITAL POSTURE ───",
    `Enemy entities: ${ctx.hostileMegacities.length} megacities, ${ctx.hostileLocations.length} hostile locations`,
    "Counter-intrusion teams remain on continuous rotation. Recommend two-factor air-gapping for any system that touches life-critical infrastructure.",
    "",
    "— Office of Digital Defense, Wartime Division",
  ];

  return {
    id: `cyber-war-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: "CYBER WARFARE — INCIDENT BULLETIN",
    body: lines.join("\n"),
    read: false,
    priority: "high",
  };
}

export function generatePropagandaReport(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const moraleNote = ctx.warMorale > 60
    ? "Counter-propaganda is holding. Public confidence in the defense remains broadly intact."
    : ctx.warMorale > 30
      ? "The information war is contested. Each side's broadcasts cancel the other out for the median listener. The undecided are who matters."
      : "We are losing the narrative. The enemy's framing is being repeated by our own citizens. Counter-messaging is no longer enough — we need a battlefield victory to hang a story on.";

  const lines = [
    "INFORMATION WARFARE BRIEF — RESTRICTED",
    "",
    "─── INTERCEPTED VOLLEY ───",
    pick(PROPAGANDA_VOLLEYS),
    "",
    "─── OUR RESPONSE ───",
    pick(PROPAGANDA_VOLLEYS),
    "",
    "─── MORALE READING ───",
    `War morale: ${ctx.warMorale} (${ctx.warMorale > 70 ? "STRONG" : ctx.warMorale > 40 ? "HOLDING" : "CRITICAL"})`,
    moraleNote,
    "",
    "─── MOBILIZATION NOTE ───",
    pick(MILITIA_CALLUP_LINES),
    "",
    "— Office of Public Information, Wartime Division",
  ];

  return {
    id: `propaganda-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: "PROPAGANDA VOLLEY — INFORMATION FRONT",
    body: lines.join("\n"),
    read: false,
    priority: "normal",
  };
}

export function generateSiegeBreachAlert(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = getWarContext(s);
  if (!ctx.underSiege) return null;

  const lines = [
    "** PERIMETER BREACH ALERT — IMMEDIATE RESPONSE **",
    "",
    "─── BREACH DETAIL ───",
    pick(SIEGE_BREACH_LINES),
    "",
    "─── DEFENSIVE STATUS ───",
    `City Defense Rating: ${Math.round(s.cityStats.defenseRating)}`,
    `Hostile zones: ${ctx.hostileZones} | Contested: ${ctx.contestedZones}`,
    `Reserve battalions are being committed. Civilian shelters in adjacent sectors are at full capacity.`,
    "",
    "─── COMMANDER'S DIRECTIVE ───",
    "Containment first. Counterattack second. The wall is brick. The defenders are not.",
    "",
    "— Siege Operations Command",
  ];

  return {
    id: `siege-breach-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${s.gameDate.hour}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "alert",
    title: "SIEGE BREACH ALERT — PERIMETER COMPROMISED",
    body: lines.join("\n"),
    read: false,
    priority: "critical",
  };
}

export function generateWartimePeriodicMessage(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const ctx = activeWarContext(s);
  if (!ctx) return null;

  const hour = s.gameDate.hour;
  const day = s.gameDate.day;

  // Engine clock advances by 6 hours per tick (see clock.ts:advanceHour),
  // so gameDate.hour only ever holds {0, 6, 12, 18}. All wartime dispatch
  // slots must be scheduled on those four hours. Day-modulo gates keep
  // each generator on a 4- or 5-day rotation so the wartime player gets
  // variety without repetition fatigue. If a slot's generator returns
  // null (no eligible content for current state), we fall through to
  // later checks at the same hour rather than shadowing them.
  //
  // Intended wartime cadence (per in-game day, when at war):
  //   • Hour 0  (night-watch, 5-day cycle): siege-breach / war-diplomacy /
  //             war-dispatch — 3 of every 5 days produce a message
  //   • Hour 6  (dawn briefing, daily):     war-dispatch — every day
  //   • Hour 12 (midday, 4-day cycle):      sortie / siege / aerial /
  //             casualties — 1 message every day (one of four generators)
  //   • Hour 18 (evening, 4-day cycle):     blockade / cyber / home-front /
  //             propaganda — 1 message every day (one of four generators)
  // Total: ~3-4 wartime messages per in-game day, all subject to the
  // 200-message inbox cap. Any change to this cadence should be reflected
  // here AND in the invariant tests in wartimeDispatch.test.ts.

  // Hour 0 — night-watch: rare, atmosphere-heavy beats on a 5-day cycle.
  if (hour === 0 && day % 5 === 0) {
    const m = generateSiegeBreachAlert(s);
    if (m) return m;
  }
  if (hour === 0 && day % 5 === 1) {
    const m = generateWarDiplomacyUpdate(s);
    if (m) return m;
  }
  if (hour === 0 && day % 5 === 2) {
    const m = generateWarDispatch(s);
    if (m) return m;
  }

  // Hour 6 — dawn briefing: daily war dispatch.
  if (hour === 6) {
    const m = generateWarDispatch(s);
    if (m) return m;
  }

  // Hour 12 — midday operations: 4-day rotation across front-line beats.
  if (hour === 12 && day % 4 === 0) {
    const m = generateSortieReport(s);
    if (m) return m;
  }
  if (hour === 12 && day % 4 === 1) {
    const m = generateSiegeReport(s);
    if (m) return m;
  }
  if (hour === 12 && day % 4 === 2) {
    const m = generateAerialEngagementReport(s);
    if (m) return m;
  }
  if (hour === 12 && day % 4 === 3) {
    const m = generateWarCasualtiesReport(s);
    if (m) return m;
  }

  // Hour 18 — evening sit-rep: 4-day rotation across home-front and cyber beats.
  if (hour === 18 && day % 4 === 0) {
    const m = generateBlockadeReport(s);
    if (m) return m;
  }
  if (hour === 18 && day % 4 === 1) {
    const m = generateCyberWarfareReport(s);
    if (m) return m;
  }
  if (hour === 18 && day % 4 === 2) {
    const m = generateHomeFrontReport(s);
    if (m) return m;
  }
  if (hour === 18 && day % 4 === 3) {
    const m = generatePropagandaReport(s);
    if (m) return m;
  }

  return null;
}
