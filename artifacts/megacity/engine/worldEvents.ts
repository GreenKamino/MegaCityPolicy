import type { GameState, TickEntry } from "@/engine/types";
import { WORLD_LOCATIONS, type WorldLocation } from "@/engine/worldMap";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { applyResourceDelta } from "@/engine/resourceStorage";

export type WorldEvent = {
  id: string;
  title: string;
  description: string;
  type: "discovery" | "broadcast" | "distress" | "anomaly" | "conflict" | "trade" | "migration" | "weather" | "rumor";
  reveals?: string;
  repeatable?: boolean;
  effects?: {
    credits?: number;
    unrest?: number;
    happiness?: number;
    defenseRating?: number;
    medSupplies?: number;
  };
};

const WORLD_EVENTS: WorldEvent[] = [
  { id: "we-caravan-sighting", title: "Caravan Spotted", description: "Long-range sensors detect a merchant convoy moving through the wastes. They're heading toward Market Crossing. Goods aboard: unknown. Intent: commercial. Probably.", type: "trade" },
  { id: "we-megacity-broadcast", title: "Megacity Broadcast Intercepted", description: "Comms picked up a coded transmission from an unregistered megacity. Signal origin: south-southwest. Crypto-analysis underway. Could be Ghost Meridian. Could be a trap.", type: "broadcast", reveals: "ghost-meridian" },
  { id: "we-township-distress", title: "Township Distress Signal", description: "Emergency beacon from beyond the wastes. Faint. Repeating. 'Vault Town requests aid. Bunker seal compromised. Send help.' Coordinates locked.", type: "distress", reveals: "vault-town" },
  { id: "we-anomaly-pit", title: "Seismic Anomaly Detected", description: "Geological survey flagged rhythmic tremors from Sector 47-Delta. Pattern inconsistent with natural seismic activity. Something is moving down there. Something large.", type: "anomaly", reveals: "the-pit" },
  { id: "we-raider-conflict", title: "Raider Clan Clash", description: "Two raider clans fighting over territory near Blackridge. Collateral damage to supply lines. Could intervene. Could wait. Could sell popcorn.", type: "conflict", effects: { unrest: 2 } },
  { id: "we-refugee-wave", title: "Refugee Wave Inbound", description: "Mass migration detected. Approximately 3,000 displaced persons moving toward the city perimeter. Origin: Ember Falls geothermal zone. Volcanic activity forced evacuation.", type: "migration", reveals: "ember-falls", effects: { unrest: 3 } },
  { id: "we-trade-boom", title: "Trade Surplus Report", description: "Megacity Pacifica reports bumper harvest. Surplus grain flooding regional markets. Food prices dropping. Our merchants are salivating.", type: "trade", effects: { credits: 5000 } },
  { id: "we-silent-signal", title: "The Silent Ark Signal Decoded", description: "Crypto-team cracked part of the Ark's repeating broadcast. It's a countdown. Counting down to what? Fifty-seven days remain.", type: "broadcast", reveals: "silent-ark" },
  { id: "we-beneath-tremor", title: "Deep Earth Tremor", description: "Seismic sensors registered activity 12km below the continental shelf. Pattern matches previous readings from the structure designated 'Beneath.' They're building something down there.", type: "anomaly", reveals: "beneath" },
  { id: "we-iron-armada-spotted", title: "Iron Armada Fleet Movement", description: "Satellite tracking confirms Iron Armada fleet repositioning. Forty-seven warships changing heading. New bearing: directly toward our coastal supply routes. Brace for impact.", type: "conflict", effects: { defenseRating: -2 } },
  { id: "we-burnside-smoke", title: "Smoke Column Identified", description: "Recon drone identified a permanent smoke column 200km northeast. Analysis: underground coal seam fire. Settlement detected nearby. Inhabitants appear to be... thriving? Investigation recommended.", type: "discovery", reveals: "burnside" },
  { id: "we-silo-detected", title: "Pre-War Installation Found", description: "Ground-penetrating radar survey found a sealed missile silo beyond the eastern transport-control boundary. Warheads status: classified. Settlement built around it. Access controls remain active.", type: "discovery", reveals: "silo-nine" },
  { id: "we-candlewick-pilgrims", title: "Pilgrim Group Encountered", description: "Patrol encountered group of unarmed travellers carrying candles. Refused electronic communication. Spoke of a 'City of Light' where they live without machines. Coordinates obtained.", type: "discovery", reveals: "candlewick" },
  { id: "we-ashmouth-mining", title: "Mining Settlement Detected", description: "Mineral survey team found an active mining operation in an uncharted tunnel network. Residents hostile to initial contact but open to trade. Something else lives deeper in the tunnels.", type: "discovery", reveals: "ashmouth" },
  { id: "we-terminus-light", title: "Anomalous Light Pattern", description: "Orbital telescope flagged structured light emissions from a crater in the southern wastes. Not natural. Not any known settlement. Analysis suggests city-scale infrastructure. Hidden well.", type: "discovery", reveals: "terminus-prime" },
  { id: "we-olympus-signal", title: "Digital Consciousness Broadcast", description: "Intercepted a data packet containing what appears to be a compressed human consciousness. Origin: mountain range, far north. Header reads: 'OLYMPUS CITIZEN REGISTRY — UPLOAD PROTOCOL.'", type: "broadcast", reveals: "new-olympus" },
  { id: "we-panopticon-warning", title: "Surveillance State Warning", description: "Intelligence reports a megacity with total surveillance infrastructure northwest of our position. Citizens tracked 24/7. 'Perfect compliance scores.' Our spies lasted 4 hours before detection.", type: "broadcast", reveals: "panopticon" },
  { id: "we-ashfall-teeth", title: "Diplomatic Incident", description: "An unmarked vessel docked at Port Sulphur. Single occupant. Said nothing. Left a sealed container. Inside: human teeth. Return address traced to a volcanic region — 'Ashfall State.'", type: "anomaly", reveals: "ashfall-dominion" },
  { id: "we-recursion-glitch", title: "Cartographic Anomaly", description: "Satellite shows a city at coordinates 500-N, 50-E. Ground team found nothing. Satellite still shows a city. Second ground team: nothing. Third team hasn't reported back.", type: "anomaly", reveals: "the-recursion" },
  { id: "we-khanate-mobilise", title: "Kharkov Line Access Controls", description: "Eastern operations has added barriers, inspection teams, and vehicle staging to the Kharkov Line. Freight clearance is delayed while the new control plan is implemented.", type: "conflict", reveals: "kharkov-line", effects: { defenseRating: -1, unrest: 2 } },

  { id: "we-dust-storm", title: "Dust Storm Warning", description: "Massive dust front moving east across the Trade Corridor. Visibility: zero. Caravans rerouting. Estimated duration: 3 days. Supply delays expected.", type: "weather", repeatable: true, effects: { credits: -2000 } },
  { id: "we-acid-rain", title: "Acid Rain Advisory", description: "Chemical precipitation detected across the western reaches. pH 2.3. Infrastructure corrosion accelerating. Outdoor workers recalled. The sky smells like batteries.", type: "weather", repeatable: true, effects: { happiness: -2 } },
  { id: "we-clear-skies", title: "Clear Skies Reported", description: "First clear day in weeks. Solar arrays at peak efficiency. Citizens gathering in open areas. Morale improving. Enjoy it. Won't last.", type: "weather", repeatable: true, effects: { happiness: 3 } },
  { id: "we-rad-winds", title: "Radioactive Winds", description: "Prevailing winds shifted, carrying irradiated particulates from the Glass Desert. Perimeter sensors spiking. Seal the vents. Close the hatches.", type: "weather", repeatable: true, effects: { unrest: 3, happiness: -2 } },
  { id: "we-fog-bank", title: "Fog Bank Rolling In", description: "Dense fog blanketing the southern perimeter. Patrol visibility down to 10 metres. Sensor coverage degraded. Perfect conditions for an incursion.", type: "weather", repeatable: true, effects: { defenseRating: -1 } },

  { id: "we-trade-convoy-arrives", title: "Trade Convoy Arrives", description: "Merchant convoy from the western settlements reached Market Crossing. Goods offloaded: scrap metal, purified water, questionable pharmaceuticals. Credits flowing.", type: "trade", repeatable: true, effects: { credits: 3500 } },
  { id: "we-smuggler-interdiction", title: "Smuggler Interdiction", description: "Perimeter patrol intercepted a smuggling operation. Contraband seized: weapons, stims, forged citizenship papers. Black market taking a hit today.", type: "trade", repeatable: true, effects: { credits: 2000, unrest: -1 } },
  { id: "we-price-crash", title: "Commodity Price Crash", description: "Overproduction of recycled alloys crashed regional metal prices. Scrapyard City flooding the market. Our manufacturing sector is not amused.", type: "trade", repeatable: true, effects: { credits: -4000 } },
  { id: "we-fuel-discovery", title: "Fuel Cache Discovered", description: "Salvage team found a pre-war fuel depot, sealed and intact. Estimated yield: 40,000 litres of refined diesel. Generator capacity surge incoming.", type: "trade", repeatable: true, effects: { credits: 6000, happiness: 2 } },
  { id: "we-merchant-guild-tax", title: "Merchant Guild Levy", description: "The regional merchant guild is demanding increased transit fees. Pay up or risk trade route closures. Extortion by another name. Business as usual.", type: "trade", repeatable: true, effects: { credits: -3000 } },

  { id: "we-nomad-sighting", title: "Nomad Clan Sighted", description: "A large nomadic group spotted moving through the null zone. Estimated 400 individuals. Armed but not hostile. They're looking for water. Everyone's looking for water.", type: "migration", repeatable: true, effects: { unrest: 1 } },
  { id: "we-settler-petition", title: "Settler Petition", description: "Group of 200 settlers from the outer wastes requesting permanent residency. Skills: farming, mechanical repair, some medical training. Processing their paperwork would make the bureaucrats happy.", type: "migration", repeatable: true, effects: { happiness: 2 } },
  { id: "we-exile-caravan", title: "Exile Caravan Departing", description: "150 citizens have packed up and are leaving for the townships. Reasons cited: overcrowding, food quality, 'general existential dread.' Can't blame them.", type: "migration", repeatable: true, effects: { happiness: -2, unrest: 1 } },

  { id: "we-border-skirmish", title: "Border Skirmish", description: "Exchange of fire at Perimeter Checkpoint 7. Raider probing attack. Repelled with minimal casualties. They'll be back. They always come back.", type: "conflict", repeatable: true, effects: { defenseRating: -1, unrest: 2 } },
  { id: "we-bandit-ambush", title: "Bandit Ambush on Route 4", description: "Supply convoy ambushed between Mexico City and the megacity. Two vehicles lost. Cargo: medical supplies. Bandits growing bolder. Route needs reinforcement.", type: "conflict", repeatable: true, effects: { credits: -3000, unrest: 1 } },
  { id: "we-ceasefire-holds", title: "Ceasefire Holding", description: "The informal ceasefire along the eastern border is holding. Third consecutive week without incident. Cautious optimism. Very cautious.", type: "conflict", repeatable: true, effects: { happiness: 2, unrest: -2 } },
  { id: "we-merc-company-offer", title: "Mercenary Company Offer", description: "A freelance military company — the Rust Dogs — is offering their services. 500 armed professionals. Price is steep. Effectiveness is guaranteed. Morality is optional.", type: "conflict", repeatable: true, effects: { defenseRating: 2 } },
  { id: "we-drone-incursion", title: "Unidentified Drone Incursion", description: "Three unmarked reconnaissance drones detected over Sectors 12-15. Origin unknown. Shot down two. Third escaped. Someone's watching.", type: "conflict", repeatable: true, effects: { unrest: 2 } },

  { id: "we-old-world-signal", title: "Old World Signal", description: "Shortwave receivers picking up a pre-war automated broadcast. Emergency frequencies. 'This is FEMA Regional Command. Shelter in place. Help is coming.' Eighty years later, still broadcasting.", type: "rumor", repeatable: true },
  { id: "we-ghost-ship", title: "Ghost Ship Report", description: "Fishermen in the western reaches report a massive vessel drifting without power or crew. Lights on. No one aboard. Hull markings match no known registry.", type: "rumor", repeatable: true, effects: { unrest: 1 } },
  { id: "we-underground-railroad", title: "Underground Railroad Active", description: "Intelligence suggests an organized network is smuggling people out of hostile megacities. Destination: unknown. Operator: unknown. Purpose: humanitarian. Probably.", type: "rumor", repeatable: true },
  { id: "we-star-fall", title: "Orbital Debris Shower", description: "Pre-war satellite debris entering atmosphere tonight. Spectacular light show expected. Citizens gathering on rooftops. One piece estimated to hit within 50km. Less spectacular.", type: "rumor", repeatable: true, effects: { happiness: 1 } },
  { id: "we-water-table-shift", title: "Water Table Shift Detected", description: "Hydrological survey shows underground water levels rising in the eastern sectors. Good news for agriculture. Bad news for the tunnel networks. Trade-offs.", type: "rumor", repeatable: true, effects: { happiness: 1, credits: 1500 } },
  { id: "we-mutant-migration", title: "Mutant Herd Migration", description: "Large herd of mutated fauna moving through the southern wastes. Mostly herbivorous. Mostly. Perimeter patrols advised to maintain distance and carry extra ammunition.", type: "rumor", repeatable: true, effects: { unrest: 1 } },
  { id: "we-comms-blackout", title: "Regional Comms Blackout", description: "Electromagnetic interference blanking out communications across a 200km radius. Source: unknown. Duration: unknown. Operating blind until it clears.", type: "anomaly", repeatable: true, effects: { unrest: 3, defenseRating: -1 } },
  { id: "we-harvest-season", title: "Harvest Season Report", description: "Agricultural settlements reporting strong yields. New Eden's irradiated soil producing record crops. Quality questionable. Quantity undeniable. Full bellies don't complain.", type: "trade", repeatable: true, effects: { credits: 4000, happiness: 2 } },
];

export function rollWorldEvent(state: GameState): WorldEvent | null {
  if (state.totalTicks % 8 !== 0) return null;
  if (Math.random() > 0.35) return null;

  const discoveredIds = state.discoveredLocationIds ?? [];
  const eventLog = state.worldEventLog ?? [];
  const firedIds = new Set(eventLog.map((e) => e.event));
  const recentIds = new Set(eventLog.slice(-6).map((e) => e.event));

  const eligible = WORLD_EVENTS.filter((e) => {
    if (e.reveals && discoveredIds.includes(e.reveals)) return false;
    if (!e.repeatable && firedIds.has(e.id)) return false;
    if (e.repeatable && recentIds.has(e.id)) return false;
    return true;
  });

  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

export function processWorldEvents(s: GameState, entries: TickEntry[]): void {
  const event = rollWorldEvent(s);
  if (!event) return;

  if (!Array.isArray(s.discoveredLocationIds)) {
    s.discoveredLocationIds = [];
  }

  if (event.reveals) {
    const alreadyFound = s.discoveredLocationIds.includes(event.reveals);
    if (!alreadyFound) {
      s.discoveredLocationIds.push(event.reveals);
      entries.push({ label: "World Discovery", delta: 0, unit: "", reason: `${event.title} — New location discovered!`, severity: "positive" });
    }
  }

  if (event.effects) {
    if (event.effects.credits) {
      s.resources.credits += event.effects.credits;
      recordCreditsEarned(s, event.effects.credits);
      entries.push({ label: "World Event", delta: event.effects.credits, unit: "credits", reason: event.title, severity: event.effects.credits > 0 ? "positive" : "negative" });
    }
    if (event.effects.unrest) {
      s.cityStats.unrest = Math.min(100, Math.max(0, s.cityStats.unrest + event.effects.unrest));
    }
    if (event.effects.happiness) {
      s.cityStats.happiness = Math.min(100, Math.max(0, s.cityStats.happiness + event.effects.happiness));
    }
    if (event.effects.defenseRating) {
      s.cityStats.defenseRating = Math.min(100, Math.max(0, s.cityStats.defenseRating + event.effects.defenseRating));
    }
    if (event.effects.medSupplies) {
      applyResourceDelta(s, "medSupplies", event.effects.medSupplies);
    }
  }

  if (!s.worldEventLog) s.worldEventLog = [];
  s.worldEventLog.push({
    tick: s.totalTicks,
    event: event.id,
    type: event.type,
    timestamp: Date.now(),
    title: event.title,
    description: event.description,
    revealed: event.reveals ?? null,
  });
  if (s.worldEventLog.length > 50) {
    s.worldEventLog = s.worldEventLog.slice(-50);
  }
}
