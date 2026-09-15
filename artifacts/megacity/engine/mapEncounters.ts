import type { WorldLocation } from "./worldMap";
import type { GameState } from "./types";
import { defaultBiomeForTerrain, type Biome } from "./biomes";
import {
  WEATHER_TYPE_EFFECTS,
  WEATHER_INTENSITY_MULT,
  HAZARD_CHANCE_INTENSITY_MULT,
  type WeatherZone,
  type WeatherZoneIntensity,
} from "./worldMapData";

// Hazard encounters scale both their fire chance and their effect magnitudes
// by the highest matching crossed zone's intensity, using the shared
// HAZARD_CHANCE_INTENSITY_MULT table (low=1×, medium=1.3×, high=1.6×). Authored
// chances/effects represent the low-intensity baseline; medium and high zones
// scale them up so a fierce zone fires its signature event noticeably more
// often (and harder) than a faint one.

const INTENSITY_RANK: Record<WeatherZoneIntensity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function highestIntensityFor(
  hazardType: WeatherZone["type"],
  zones: WeatherZone[]
): WeatherZoneIntensity | null {
  let best: WeatherZoneIntensity | null = null;
  for (const z of zones) {
    if (z.type !== hazardType) continue;
    if (!best || INTENSITY_RANK[z.intensity] > INTENSITY_RANK[best]) {
      best = z.intensity;
    }
  }
  return best;
}

function scaleEffects(
  effects: EncounterOutcome["effects"],
  mult: number
): EncounterOutcome["effects"] {
  const out: EncounterOutcome["effects"] = {};
  if (effects.creditsDelta !== undefined) out.creditsDelta = Math.round(effects.creditsDelta * mult);
  if (effects.ammoDelta !== undefined) out.ammoDelta = Math.round(effects.ammoDelta * mult);
  if (effects.foodDelta !== undefined) out.foodDelta = Math.round(effects.foodDelta * mult);
  if (effects.dispositionDelta !== undefined) out.dispositionDelta = Math.round(effects.dispositionDelta * mult);
  if (effects.discoveredLocationId !== undefined) out.discoveredLocationId = effects.discoveredLocationId;
  return out;
}

export type EncounterOutcome = {
  triggered: boolean;
  title: string;
  description: string;
  effects: {
    creditsDelta?: number;
    ammoDelta?: number;
    foodDelta?: number;
    dispositionDelta?: number;
    discoveredLocationId?: string;
  };
  severity: "positive" | "negative" | "neutral" | "warning";
  // Set when this outcome came from a hazard-themed encounter (i.e. the
  // crossed weather zone fired its signature event). Generic encounters
  // leave this undefined. Used by callers to log hazard-zone events to the
  // news feed so they don't fly by unnoticed.
  hazardType?: WeatherZone["type"];
};

type EncounterDef = {
  id: string;
  title: string;
  descriptions: string[];
  chance: number;
  actions: string[];
  effects: EncounterOutcome["effects"];
  severity: EncounterOutcome["severity"];
  condition?: (loc: WorldLocation, state: GameState) => boolean;
  // When set, this encounter is only eligible if the convoy crossed a
  // weather zone of this hazard type. Hazard-themed encounters are rolled
  // before generic ones so a crossed zone has a real shot at firing its
  // signature event.
  hazardType?: WeatherZone["type"];
};

export const ENCOUNTERS: EncounterDef[] = [
  {
    id: "ambush",
    title: "AMBUSH",
    descriptions: [
      "Your team walked into a trap. Raiders opened fire from elevated positions. Casualties sustained, but the team fought through.",
      "Hostile elements engaged your operatives at close range. Equipment damaged. Personnel shaken but alive.",
      "Wasteland marauders hit your convoy. Supplies lost. The team barely escaped the kill zone.",
    ],
    chance: 0.12,
    actions: ["scout", "trade", "raid"],
    effects: { creditsDelta: -2000, ammoDelta: -10 },
    severity: "negative",
    condition: (loc) => loc.defenseRating > 30,
  },
  {
    id: "salvage_find",
    title: "SALVAGE DISCOVERED",
    descriptions: [
      "Your scouts stumbled upon an abandoned pre-war cache. Intact supplies recovered — a windfall.",
      "An old bunker, unsealed by recent seismic activity. Inside: functional equipment and sealed rations.",
      "Concealed supply drop from a faction that no longer exists. Finders keepers.",
    ],
    chance: 0.15,
    actions: ["scout"],
    effects: { creditsDelta: 3000, ammoDelta: 15 },
    severity: "positive",
  },
  {
    id: "weather_hazard",
    title: "DUST STORM WARNING",
    descriptions: [
      "A rad-storm rolled in without warning. Your team sheltered in place. Time lost. No casualties, but the operation was delayed.",
      "Toxic precipitation forced an emergency recall. Equipment decontamination required.",
      "Seismic tremors disrupted the route. Your team had to reroute through hostile terrain.",
    ],
    chance: 0.10,
    actions: ["scout", "trade", "aid"],
    effects: { creditsDelta: -1000 },
    severity: "warning",
    condition: (loc) => loc.terrain === "wasteland" || loc.terrain === "desert" || loc.terrain === "volcanic",
  },
  {
    id: "friendly_contact",
    title: "FRIENDLY CONTACT",
    descriptions: [
      "Local settlers flagged your convoy down. Offered shelter and intel in exchange for medical supplies. Relations warming.",
      "A wandering trader offered discounted goods as a gesture of goodwill. Word is spreading that you're worth dealing with.",
      "Refugees from a nearby settlement offered to share intelligence about the area. Disposition improved.",
    ],
    chance: 0.18,
    actions: ["trade", "aid"],
    effects: { dispositionDelta: 10, creditsDelta: 500 },
    severity: "positive",
  },
  {
    id: "intel_leak",
    title: "INTELLIGENCE INTERCEPTED",
    descriptions: [
      "Your operatives intercepted an encrypted transmission. After decryption: troop movements, supply caches, faction politics. Invaluable data.",
      "A defector approached your team with classified documents. Their motives are unclear, but the intel checks out.",
      "Your scouts found a dead courier carrying sealed dispatches. The intelligence reveals nearby hidden locations.",
    ],
    chance: 0.12,
    actions: ["scout", "raid"],
    effects: { creditsDelta: 1500 },
    severity: "positive",
  },
  {
    id: "trade_windfall",
    title: "PROFITABLE EXCHANGE",
    descriptions: [
      "The local market was desperate for the goods you carried. Premium prices — your merchants are ecstatic.",
      "A bidding war between local factions drove prices through the roof. Record profits on this run.",
      "Your trade caravan arrived just as a supply shortage hit. Perfect timing. Maximum margins.",
    ],
    chance: 0.14,
    actions: ["trade"],
    effects: { creditsDelta: 4000 },
    severity: "positive",
  },
  {
    id: "raider_retaliation",
    title: "RETALIATION STRIKE",
    descriptions: [
      "Your raid provoked a counter-attack. Enemy forces tracked your operatives back to the extraction point. Reinforcements required.",
      "The target hit back harder than expected. Your strike team took losses during the withdrawal.",
      "Hostile forces launched a pursuit. Your team had to abandon heavy equipment to escape.",
    ],
    chance: 0.20,
    actions: ["raid"],
    effects: { creditsDelta: -3000, ammoDelta: -20, dispositionDelta: -15 },
    severity: "negative",
  },
  {
    id: "medical_emergency",
    title: "MEDICAL EMERGENCY",
    descriptions: [
      "A member of your team contracted a local pathogen. Emergency treatment required. The mission continues, but morale is shaken.",
      "Contaminated water supplies led to illness among your operatives. Medics worked overtime to stabilize the situation.",
    ],
    chance: 0.08,
    actions: ["scout", "aid"],
    effects: { creditsDelta: -1500 },
    severity: "warning",
    condition: (loc) => loc.terrain === "swamp" || loc.terrain === "subterranean",
  },
  {
    id: "local_militia_join",
    title: "MILITIA REINFORCEMENT",
    descriptions: [
      "Impressed by your aid, a local militia offered to join your cause. Additional firepower and local knowledge acquired.",
      "Grateful settlers volunteered their fighters. 'You helped us. Now we fight for you.' Armed and ready.",
    ],
    chance: 0.10,
    actions: ["aid"],
    effects: { dispositionDelta: 20, ammoDelta: 25 },
    severity: "positive",
    condition: (loc, state) => {
      const rel = (state.locationRelations ?? {})[loc.id];
      return (rel?.aidSent ?? 0) >= 2;
    },
  },
  {
    id: "hidden_cache",
    title: "HIDDEN SUPPLY CACHE",
    descriptions: [
      "Beneath the rubble, your team uncovered a sealed military cache. Ammunition and medical supplies in excellent condition.",
      "An old emergency bunker. Someone sealed it decades ago. The supplies inside are still viable.",
    ],
    chance: 0.08,
    actions: ["scout", "raid"],
    effects: { ammoDelta: 30, foodDelta: 20, creditsDelta: 2000 },
    severity: "positive",
    condition: (loc) => loc.terrain === "urban" || loc.terrain === "subterranean",
  },
  {
    id: "wildlife_predator",
    title: "PREDATOR STALK",
    descriptions: [
      "A glow boar the size of a transport pinned your team against a wreck. Two operatives went down. The carcass fed the column for a week.",
      "Cinder wolves shadowed your route for two nights before pressing the attack. Ammunition spent. Pelts and meat recovered.",
      "A split-jaw broke from cover and took a runner before anyone fired. The team rallied and put it down. Salvage was substantial.",
    ],
    chance: 0.10,
    actions: ["scout", "raid"],
    effects: { ammoDelta: -8, foodDelta: 12 },
    severity: "warning",
    condition: (loc) => {
      const biome = defaultBiomeForTerrain(loc.terrain);
      return biome === "ash_forest" || biome === "irradiated_jungle";
    },
  },
  {
    id: "wildlife_swarm",
    title: "VERMIN SWARM",
    descriptions: [
      "Glow moths swarmed every heat source the moment lanterns went up. The team lost a night of work brushing them off.",
      "Marsh rats overran the supply tent before the perimeter watch could react. Rations spoiled. Morale lower.",
      "Spore grubs got into the food crates. Half the haul was inedible by morning.",
    ],
    chance: 0.09,
    actions: ["scout", "trade", "aid"],
    effects: { foodDelta: -8, creditsDelta: -500 },
    severity: "warning",
    condition: (loc) => {
      const biome = defaultBiomeForTerrain(loc.terrain);
      return biome === "toxic_marsh" || biome === "fungal_caves" || biome === "irradiated_jungle";
    },
  },
  {
    id: "wildlife_harvest",
    title: "GAME RECOVERED",
    descriptions: [
      "A small herd of parkland doe came through the firebreak. Clean shots. The column ate well.",
      "Your scouts brought down an ashen deer at long range. Quiet kill. Quiet meal.",
      "Brine seals had hauled out on a sandbar within rifle range. A lean week ended early.",
    ],
    chance: 0.10,
    actions: ["scout"],
    effects: { foodDelta: 18, creditsDelta: 600 },
    severity: "positive",
    condition: (loc) => {
      const biome = defaultBiomeForTerrain(loc.terrain);
      return biome === "ruined_park" || biome === "ash_forest" || biome === "dead_sea_coast";
    },
  },
  {
    id: "derelict_vessel",
    title: "DERELICT VESSEL BOARDED",
    descriptions: [
      "A pre-war freighter listed in the shallows, hull breached but holds dry. The team stripped the cargo manifests before the swell shifted her off the bar.",
      "Tide pulled back far enough to expose a half-buried tanker. Inside: sealed crates, a working diesel pump, and a logbook the brokers will pay for.",
      "Scouts boarded a fishing trawler abandoned mid-haul. Nets still strung, cold-store still cold. Whatever crewed her left in a hurry. The team didn't ask why.",
    ],
    chance: 0.13,
    actions: ["scout", "trade"],
    effects: { creditsDelta: 2800, foodDelta: 10 },
    severity: "positive",
    condition: (loc) => loc.terrain === "coastal" || loc.terrain === "offshore" || loc.terrain === "submerged",
  },
  {
    id: "tidal_trap",
    title: "TIDE STRANDING",
    descriptions: [
      "The convoy misread the tide chart. Three transports grounded on the bar and sat there bleeding hours until the next surge floated them. Schedule shot.",
      "A surge tide rolled in faster than the scouts called it. The team made high ground; one supply skid did not. Cargo lost to the chop.",
      "The estuary current pinned the column against a sandbank for half a shift. Engines stayed lit the whole time. Fuel reserves bled out.",
    ],
    chance: 0.11,
    actions: ["scout", "trade", "aid"],
    effects: { creditsDelta: -1400 },
    severity: "warning",
    condition: (loc) => loc.terrain === "coastal" || loc.terrain === "offshore" || loc.terrain === "riverine",
  },
  {
    id: "fishing_village_welcome",
    title: "VILLAGERS BREAK BREAD",
    descriptions: [
      "A fishing village hailed the convoy from a stilt-pier and waved it in. Hot food, fresh catch, and the kind of warm welcome that costs nothing and is worth more than coin.",
      "Lakeside settlement opened its smokehouse to the team. The headwoman remembered a debt the city had long since written off. The team left heavier and warmer.",
      "Coastal locals towed a stuck transport off the mud and refused payment. The captain insisted on leaving credit anyway. The settlement remembered the gesture.",
    ],
    chance: 0.10,
    actions: ["scout", "trade", "aid"],
    effects: { dispositionDelta: 5, foodDelta: 8 },
    severity: "positive",
    condition: (loc) => loc.terrain === "coastal" || loc.terrain === "lakeside" || loc.terrain === "riverine",
  },
  {
    id: "collapsed_shaft",
    title: "SHAFT COLLAPSE",
    descriptions: [
      "A support beam gave out behind the column. No casualties, but two cases of munitions and a working scanner went under thirty tonnes of rubble. Unrecoverable.",
      "Vibration from the convoy brought down a section of pre-war ducting overhead. The team dug clear in an hour, lighter on gear and heavier on dust.",
      "The tunnel floor cracked under the lead transport. Vehicle limped out. Half the cargo did not. The geologist had warned them. Nobody had listened.",
    ],
    chance: 0.13,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -2200, ammoDelta: -8 },
    severity: "negative",
    condition: (loc) => loc.terrain === "subterranean",
  },
  {
    id: "live_relay_handshake",
    title: "PRE-WAR RELAY ACTIVE",
    descriptions: [
      "Deep in a ventilation gallery the team found a relay still drawing power from a buried geothermal tap. The handshake protocol logged five other live nodes the city had never charted.",
      "A scout's handheld pinged a pre-war comms node operating on a backup loop. The intel pull dumped routing tables for half the continent's underground cable network.",
      "An automated maintenance drone, still on its rounds after a century, accepted the team's signed credentials and unlocked a sealed data vault. The brokers will fight over what came out.",
    ],
    chance: 0.10,
    actions: ["scout"],
    effects: { creditsDelta: 3200, dispositionDelta: 2 },
    severity: "positive",
    condition: (loc) => loc.terrain === "subterranean",
  },
  {
    id: "bilge_bloom",
    title: "BILGE BLOOM CONTAMINATION",
    descriptions: [
      "Spore-bloom infested the bilge of the survey vessel before anyone smelled it. Sealed rations breached. Cold-store burned out as a precaution. Nobody got sick. Nobody ate well, either.",
      "The team punched through a flooded compartment and the slick that came out the other side ate clean through three ration drums. Decon took six hours.",
      "Anaerobic muck in a half-flooded hold turned out to be alive. The biologist called it 'fascinating.' The quartermaster called it a write-off.",
    ],
    chance: 0.11,
    actions: ["scout", "trade", "aid"],
    effects: { foodDelta: -14, creditsDelta: -800 },
    severity: "warning",
    condition: (loc) => loc.terrain === "submerged" || loc.terrain === "offshore" || loc.terrain === "swamp",
  },
];

// Hazard-themed encounters fire only when the convoy path crosses a weather
// zone of the matching type. Listed first in the eligible roll order so that
// when a zone is crossed, its signature event has the chance to fire before
// any generic encounter.
export const HAZARD_ENCOUNTERS: EncounterDef[] = [
  {
    id: "hz_radiation_storm",
    title: "RAD-WAVE PASSAGE",
    descriptions: [
      "A rad-wave swept the convoy mid-route. Dosimeters maxed out. Two operatives pulled from the line for decontamination, gear scrubbed twice over.",
      "The team rode out a hot front in a culvert. Ration packs went into the burn bag — the seals had blistered. Morale held; the count did not.",
      "Hard rain of fallout caught the column in the open. Anti-rad shots burned through the medkit. Everyone walked out, no one walked easy.",
    ],
    chance: 0.45,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -1800, foodDelta: -10 },
    severity: "warning",
    hazardType: "radiation_storm",
  },
  {
    id: "hz_dust_cloud",
    title: "DUST WALL CROSSING",
    descriptions: [
      "A wall of grit closed in faster than the spotters called it. The column lashed itself together by ropes and shuffled blind for an hour.",
      "Dust got into everything — optics, breathers, ration tins. Half the day was lost stripping gear once visibility returned.",
      "The convoy missed a marker in the brownout and added a six-hour detour. Fuel and tempers ran low.",
    ],
    chance: 0.45,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -1200, foodDelta: -4 },
    severity: "warning",
    hazardType: "dust_cloud",
  },
  {
    id: "hz_acid_rain",
    title: "ACID DELUGE",
    descriptions: [
      "An acid squall stripped paint, eyepieces, and one rifle stock to bare metal. The armorer is going to have words.",
      "The team sheltered under tarps that dissolved in twenty minutes. Crates underneath fared better. Crates on top did not.",
      "Pitting on the magazines forced a full ammo audit at the next stop. A surprising amount didn't survive.",
    ],
    chance: 0.45,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -1500, ammoDelta: -12 },
    severity: "warning",
    hazardType: "acid_rain",
  },
  {
    id: "hz_electromagnetic",
    title: "DEAD COMMS WINDOW",
    descriptions: [
      "An EMP burst killed every radio on the convoy. The column ran silent for the rest of the route, missing two waypoints and a handler check-in.",
      "Optics went white. Range cards went useless. The team navigated by terrain alone and arrived two hours late and twitchy.",
      "Every set on the mission cooked at once. The signals officer is recommending hard cases on the next outing. Loudly.",
    ],
    chance: 0.45,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -1000, dispositionDelta: -5 },
    severity: "warning",
    hazardType: "electromagnetic",
  },
  {
    id: "hz_ashfall",
    title: "ASHFALL BURIAL",
    descriptions: [
      "Ash piled on the vehicles overnight. The column dug out at first light. Filters were a write-off; the spare crate emptied fast.",
      "Two crates of rations took on ash through a split seal. Inedible by the next mealtime. The cook is in a mood.",
      "Hot ash cooked through a tarp and ruined a bundle of trade goods. The smell carried for a day.",
    ],
    chance: 0.45,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -1300, foodDelta: -12 },
    severity: "warning",
    hazardType: "ashfall",
  },
  {
    id: "hz_toxic_fog",
    title: "SPORE BLOOM EXPOSURE",
    descriptions: [
      "A spore bloom rolled through the line of march. Three operatives went into seizures before the masks went on. All three pulled through. None will forget it.",
      "The fog hid more than visibility — by the time the column cleared it, two crates of supplies were rotted through with bloom growth.",
      "Bloom spores got past the seals on a casualty bag. The medics burned a week of antifungals stabilizing the team.",
    ],
    chance: 0.5,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: -2200, foodDelta: -15, ammoDelta: -4 },
    severity: "negative",
    hazardType: "toxic_fog",
  },
  // Hopeful flip-side encounters. One per hazard type, themed to that
  // hazard, much rarer than the signature negative event above (and listed
  // after it in roll order, so the negative still gets first crack).
  {
    id: "hz_radiation_storm_upside",
    title: "FALLOUT GAME RUN",
    descriptions: [
      "A herd of rad-mutated boar moved with the front, fat and slow on hot pasture. The column came out lighter on ammo and heavier on meat.",
      "Geiger ticks led the scouts to a flight of glow-fowl roosting where nothing should nest. The carcasses scrubbed down clean enough; the freezers filled.",
      "The rad-wave drove a column of mutated elk straight onto the convoy's line of fire. Strange-tasting protein, but a lot of it.",
    ],
    chance: 0.13,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { foodDelta: 22, creditsDelta: 800 },
    severity: "positive",
    hazardType: "radiation_storm",
  },
  {
    id: "hz_dust_cloud_upside",
    title: "DUST-STRIPPED CACHE",
    descriptions: [
      "The duster scoured a hilltop down to bare metal — and uncovered the hatch of a sealed pre-war supply pod. Ration tins and small arms inside, untouched.",
      "Wind shear peeled the dunes back from a half-buried convoy wreck. The crates underneath were still strapped down. The crates were still full.",
      "The storm exposed a cache marker no one had logged. Under it: a sealed drum of trade goods and a sidearm in waxed paper.",
    ],
    chance: 0.12,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: 1800, ammoDelta: 10, foodDelta: 6 },
    severity: "positive",
    hazardType: "dust_cloud",
  },
  {
    id: "hz_acid_rain_upside",
    title: "STRIPPED WRECK SALVAGE",
    descriptions: [
      "Acid rain ate the camo paint off a wreck that had been hiding in plain sight for a decade. Engine block was still good. Salvage crew is going to be pleased.",
      "The squall dissolved a tarp that had concealed a cargo trailer for years. Inside: sealed barrels, a working winch, and trade-grade copper wire.",
      "Pitting ate through the locks on three shipping containers nobody had been able to crack. The contents went straight into the buy book.",
    ],
    chance: 0.13,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: 2500 },
    severity: "positive",
    hazardType: "acid_rain",
  },
  {
    id: "hz_electromagnetic_upside",
    title: "EMP-FRIED TECH SALVAGE",
    descriptions: [
      "The burst killed everything outside a Faraday case — including the security grid on a research bunker the convoy had been told was hot. The team walked in. The team walked out heavy.",
      "An EMP-fried drone flight lay scattered in the open, beacons dead. The salvage crew stripped optics and rare-earth boards out of every airframe before any operator could reboot.",
      "Faction relays cooked offline at the worst possible time for them and the best possible time for the convoy. Two intercept caches read clean before anyone came looking.",
    ],
    chance: 0.13,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: 2200, ammoDelta: 6 },
    severity: "positive",
    hazardType: "electromagnetic",
  },
  {
    id: "hz_ashfall_upside",
    title: "ASH-PRESERVED CACHE",
    descriptions: [
      "Under the fresh ash layer, a scout's boot punched through into a bunker hatch. Sealed in by the last fall, opened up by this one. The shelving was still stocked.",
      "Ashfall smothered a fire that would have eaten a downed cargo plane. The wreck cooled enough overnight to strip; the airframe gave up sealed crates of munitions.",
      "Hot ash baked a pack of scavenger drones offline mid-flight. The column harvested processors and battery cells from the fall site at leisure.",
    ],
    chance: 0.12,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: 1500, ammoDelta: 12 },
    severity: "positive",
    hazardType: "ashfall",
  },
  {
    id: "hz_toxic_fog_upside",
    title: "BLOOM HARVEST",
    descriptions: [
      "The scouts spotted a vein of pharma-grade bloom growing only where the fog ran thickest. Two crates of raw spore harvested under mask. The medical exchange will pay double.",
      "Fog lifted long enough to reveal a stand of fruiting bodies that brokers in the Trade Quarter buy by weight. The team stripped what they could carry.",
      "A bloom-tender hidden in the fog mistook the column for a buyer and offered a cut-price sample. The sample turned out to be exactly what the broker wanted.",
    ],
    chance: 0.13,
    actions: ["scout", "trade", "aid", "raid"],
    effects: { creditsDelta: 2800, dispositionDelta: 4 },
    severity: "positive",
    hazardType: "toxic_fog",
  },
];

export function getBiomeForLocation(loc: WorldLocation): Biome {
  return defaultBiomeForTerrain(loc.terrain);
}

function computeBoostFromZones(zones: WeatherZone[]): number {
  let boost = 0;
  for (const z of zones) {
    boost += WEATHER_TYPE_EFFECTS[z.type].encounterChanceBoost * WEATHER_INTENSITY_MULT[z.intensity];
  }
  return Math.max(0, Math.min(0.6, boost));
}

function getEligibleEncounters(
  actionId: string,
  location: WorldLocation,
  state: GameState,
  zones: WeatherZone[]
): EncounterDef[] {
  const crossedTypes = new Set(zones.map((z) => z.type));
  // Hazard-themed encounters come first so a crossed weather zone has the
  // first shot at firing its signature event before generic encounters roll.
  const hazard = HAZARD_ENCOUNTERS.filter(
    (e) =>
      e.actions.includes(actionId) &&
      e.hazardType !== undefined &&
      crossedTypes.has(e.hazardType) &&
      (!e.condition || e.condition(location, state))
  );
  const generic = ENCOUNTERS.filter(
    (e) => e.actions.includes(actionId) && (!e.condition || e.condition(location, state))
  );
  return [...hazard, ...generic];
}

export function rollEncounter(
  actionId: string,
  location: WorldLocation,
  state: GameState,
  zones: WeatherZone[] = []
): EncounterOutcome | null {
  const boost = computeBoostFromZones(zones);
  const eligible = getEligibleEncounters(actionId, location, state, zones);

  for (const enc of eligible) {
    // Hazard encounters scale their authored chance (and effect magnitudes)
    // by the highest matching crossed zone's intensity, so a low-intensity
    // brush is meaningfully tamer than a high-intensity run. Generic
    // warning/negative encounters get the weather boost stacked on top, as
    // before.
    const isHazard = enc.hazardType !== undefined;
    const intensity = isHazard ? highestIntensityFor(enc.hazardType!, zones) : null;
    const intensityMult = intensity ? HAZARD_CHANCE_INTENSITY_MULT[intensity] : 1;
    const chance = Math.min(
      0.95,
      (isHazard ? enc.chance * intensityMult : enc.chance)
        + (!isHazard && (enc.severity === "negative" || enc.severity === "warning") ? boost : 0)
    );
    if (Math.random() < chance) {
      const desc = enc.descriptions[Math.floor(Math.random() * enc.descriptions.length)];
      return {
        triggered: true,
        title: enc.title,
        description: desc,
        effects: isHazard ? scaleEffects(enc.effects, intensityMult) : { ...enc.effects },
        severity: enc.severity,
        ...(enc.hazardType !== undefined ? { hazardType: enc.hazardType } : {}),
      };
    }
  }

  return null;
}

export function getEncounterChance(
  actionId: string,
  location: WorldLocation,
  state: GameState,
  zones: WeatherZone[] = []
): number {
  const boost = computeBoostFromZones(zones);
  const eligible = getEligibleEncounters(actionId, location, state, zones);
  let combinedChance = 0;
  for (const e of eligible) {
    const isHazard = e.hazardType !== undefined;
    const intensity = isHazard ? highestIntensityFor(e.hazardType!, zones) : null;
    const intensityMult = intensity ? HAZARD_CHANCE_INTENSITY_MULT[intensity] : 1;
    const chance = Math.min(
      0.95,
      (isHazard ? e.chance * intensityMult : e.chance)
        + (!isHazard && (e.severity === "negative" || e.severity === "warning") ? boost : 0)
    );
    combinedChance = 1 - (1 - combinedChance) * (1 - chance);
  }
  return Math.round(combinedChance * 100);
}

