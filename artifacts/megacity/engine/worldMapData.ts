import type { Biome } from "@/engine/biomes";
import type { Season } from "@/engine/weather";
import type { GameDate } from "@/engine/types";
import { getSeason } from "@/engine/weather";

export type TerrainZone = {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  opacity: number;
  label?: string;
  biome?: Biome;
  lore?: string;
};

export type ThreatLevel = "safe" | "contested" | "hostile" | "unknown";

export type WorldMapEllipse = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

/**
 * Stable map geometry for the Yellowstone exclusion area. The core is the
 * existing Atlas scar; the periphery is a wider, low-habitability band used
 * by placement and travel systems. Keep this in world coordinates so it can be
 * consumed without coupling gameplay to the renderer.
 */
export const YELLOWSTONE_EXCLUSION_ZONE = {
  core: { cx: 440, cy: 281, rx: 18, ry: 14 },
  periphery: { cx: 440, cy: 281, rx: 26, ry: 20 },
  label: "YELLOWSTONE EXCLUSION ZONE",
} as const;

export function pointInWorldMapEllipse(x: number, y: number, ellipse: WorldMapEllipse): boolean {
  if (ellipse.rx <= 0 || ellipse.ry <= 0) return false;
  const dx = (x - ellipse.cx) / ellipse.rx;
  const dy = (y - ellipse.cy) / ellipse.ry;
  return dx * dx + dy * dy <= 1;
}

export function isInsideYellowstoneCore(x: number, y: number): boolean {
  return pointInWorldMapEllipse(x, y, YELLOWSTONE_EXCLUSION_ZONE.core);
}

export function isInsideYellowstoneExclusionZone(x: number, y: number): boolean {
  return pointInWorldMapEllipse(x, y, YELLOWSTONE_EXCLUSION_ZONE.periphery);
}

export type MountainRange = {
  id: string;
  peaks: [number, number][];
  label: string;
  labelPos: [number, number];
  lore?: string;
};

export type WaterBody = {
  id: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
  rotation?: number;
  lore?: string;
};

export type CoastSegment = {
  id: string;
  points: [number, number][];
  label?: string;
  lore?: string;
};

export type CanyonMark = {
  id: string;
  x: number;
  y: number;
  angle: number;
  label: string;
  labelPos: [number, number];
  lore?: string;
};

export type PlateauMark = {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  label: string;
  labelPos: [number, number];
  lore?: string;
};

export type DriedRiver = {
  id: string;
  points: [number, number][];
  label?: string;
  labelPos?: [number, number];
  lore?: string;
};

export type DuneField = {
  id: string;
  cx: number;
  cy: number;
  count: number;
  spread: number;
  angle: number;
  label?: string;
  labelPos?: [number, number];
  lore?: string;
};

export type ScatterDots = {
  id: string;
  cx: number;
  cy: number;
  count: number;
  spread: number;
  style: "scrub" | "rubble" | "craters" | "marsh";
  label?: string;
  lore?: string;
};

export type CliffEdge = {
  id: string;
  points: [number, number][];
  label?: string;
  labelPos?: [number, number];
  lore?: string;
};

export type TerrainFeatureKind =
  | "mountain"
  | "water"
  | "canyon"
  | "plateau"
  | "river"
  | "dune"
  | "cliff";

export type TerrainFeatureTip = {
  id: string;
  kind: TerrainFeatureKind;
  name: string;
  lore: string;
  /** World-coords centroid (0..1000), used to anchor the tooltip. */
  cx: number;
  cy: number;
  /** World-coords half-extent of an interactive hitbox covering the feature. */
  hx: number;
  hy: number;
};

export type WeatherZoneIntensity = "low" | "medium" | "high";

export type WeatherZoneSeasonState = WeatherZoneIntensity | "dormant";

export type WeatherZone = {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  type: "radiation_storm" | "dust_cloud" | "acid_rain" | "electromagnetic" | "ashfall" | "toxic_fog";
  intensity: WeatherZoneIntensity;
  label: string;
  // Optional per-season override. When omitted, the zone falls back to a
  // sensible default profile derived from `type` (see DEFAULT_SEASON_PROFILES
  // below) so authored zones automatically drift across the calendar.
  seasonProfile?: Partial<Record<Season, WeatherZoneSeasonState>>;
};

export const MAP_COLORS = {
  parchment: "#D4C5A0",
  parchmentDark: "#C4B48A",
  parchmentLight: "#E8DCC4",
  ink: "#2A1F0E",
  inkFaded: "#5A4D3A",
  inkLight: "#8A7D6A",
  sepia: "#6B5B3E",
  borderWorn: "#9E8E6E",
  red: "#8B2500",
  redFaded: "#A04030",
  blue: "#2B4570",
  blueFaded: "#4A6890",
  green: "#3A5F3A",
  greenFaded: "#5A8A5A",
  orange: "#B87333",
  orangeFaded: "#C89050",
  gridLine: "#C4B48A",
  routeSafe: "#6B8E6B",
  routeContested: "#B8963A",
  routeHostile: "#8B2500",
  routeUnknown: "#9E8E6E",
  oceanBg: "#8AABB8",
  coastLine: "#4A6578",
  sandDark: "#B8A070",
};

// Decorative terrain layers (biome zones, mountain triangles, water labels,
// dried rivers, canyons, plateaus, dunes, scatter dots, cliffs, weather
// hazard blobs, accent coast strokes). Each named feature carries an
// optional `lore` blurb so worldmap.tsx can render parchment tooltips on
// hover/tap. Coordinates are in 0..1000 world space; rx/ry are half-extents.
export const TERRAIN_ZONES: (TerrainZone & { threat?: ThreatLevel })[] = [
  {
    id: "tz-pacific-greenbelt",
    cx: 360,
    cy: 222,
    rx: 28,
    ry: 38,
    color: MAP_COLORS.green,
    opacity: 0.08,
    label: "PACIFIC GREENBELT",
    lore: "The last unburned conifer corridor on the western seaboard. Ash from the Cascadia stacks settles on every needle, but the trees keep growing — taller, darker, and thicker through the trunk than the seed catalogues remember.",
  },
  {
    id: "tz-mojave-glassland",
    cx: 418,
    cy: 342,
    rx: 32,
    ry: 22,
    color: MAP_COLORS.orangeFaded,
    opacity: 0.12,
    label: "MOJAVE GLASSLAND",
    lore: "Sand fused to a green-black mirror by the warhead tests of the early Lockdown years. Caravans cross at dawn so the glare doesn't blind their lead camels, and even then the rim militias charge by the pound for crossing-rights.",
  },
  {
    id: "tz-yellowstone-scar",
    cx: YELLOWSTONE_EXCLUSION_ZONE.core.cx,
    cy: YELLOWSTONE_EXCLUSION_ZONE.core.cy,
    rx: YELLOWSTONE_EXCLUSION_ZONE.core.rx,
    ry: YELLOWSTONE_EXCLUSION_ZONE.core.ry,
    color: MAP_COLORS.redFaded,
    opacity: 0.14,
    label: "YELLOWSTONE SCAR",
    threat: "hostile",
    lore: "The Yellowstone caldera woke hard enough to redraw the western interior. The core is a hostile exclusion zone of ash-choked basins, sulphur fog, hot mud, and instruments that click without stopping. The Council marks no trade route through it and buries the records of those who try.",
  },
  {
    id: "tz-great-plains-grass",
    cx: 538,
    cy: 312,
    rx: 42,
    ry: 30,
    color: MAP_COLORS.sandDark,
    opacity: 0.07,
    label: "GREAT PLAINS GRASS-SEA",
    lore: "Wheat country gone feral. Native grasses pushed twelve feet tall after the harvesters quit, hiding everything from antelope herds to bandit camps to the rusted combines that started the whole green takeover.",
  },
  {
    id: "tz-carolina-pine-rot",
    cx: 700,
    cy: 348,
    rx: 28,
    ry: 26,
    color: MAP_COLORS.greenFaded,
    opacity: 0.09,
    label: "CAROLINA PINE-ROT",
    lore: "Loblolly forest blackened by half a century of acid rain off the Rust Belt. The trunks weep sap that solidifies into a sour amber the swamp-traders bottle and sell as solvent, lamp-oil, or both depending on the buyer.",
  },
  {
    id: "tz-yucatan-spore-jungle",
    cx: 615,
    cy: 508,
    rx: 36,
    ry: 28,
    color: MAP_COLORS.green,
    opacity: 0.11,
    label: "YUCATAN SPORE-JUNGLE",
    threat: "hostile",
    lore: "Triple-canopy growth that swallowed the Mayan ruins, the resort hotels, and three Council survey teams in the same century. Nothing comes out of it but spore-clouds and the occasional radio fragment in a dialect the linguists won't print.",
  },
];

export const THREAT_TINT: Record<ThreatLevel, string> = {
  safe: MAP_COLORS.green,
  contested: MAP_COLORS.orange,
  hostile: MAP_COLORS.red,
  unknown: MAP_COLORS.sepia,
};

export const MOUNTAIN_RANGES: MountainRange[] = [
  {
    id: "rockies",
    label: "ROCKY MOUNTAINS",
    labelPos: [445, 295],
    peaks: [
      [428, 258], [438, 268], [432, 278], [445, 286], [438, 296],
      [450, 304], [442, 314], [455, 322], [448, 332],
    ],
    lore: "Spine of the continent, now strung with rusted ski-lift cables and the carcasses of weather-radar arrays. Caravan pickets call it the Iron Vertebrae and refuse to camp on its peaks after dark.",
  },
  {
    id: "appalachians",
    label: "APPALACHIA",
    labelPos: [685, 320],
    peaks: [
      [678, 280], [685, 290], [680, 300], [690, 310], [684, 320],
      [692, 330], [686, 340], [694, 350],
    ],
    lore: "Old coal country, bones picked clean by three centuries of strip-mining and one century of nothing at all. The hollows still hum at frequencies the broadcast techs swear used to be government numbers stations.",
  },
  {
    id: "cascades",
    label: "CASCADE RANGE",
    labelPos: [358, 245],
    peaks: [
      [355, 232], [362, 244], [350, 256], [358, 268], [354, 280],
    ],
    lore: "Volcanic gut still smolders from the Cascadia Lockdown — every other ridge vents black ash that coats the firs in greasy soot. Cultists worship the calderas; everyone else stays a week downwind.",
  },
  {
    id: "sierra-madre",
    label: "SIERRA MADRE",
    labelPos: [490, 395],
    peaks: [
      [482, 372], [495, 384], [488, 396], [500, 408], [492, 420], [504, 432],
    ],
    lore: "Cartel mountains turned silver-pirate kingdom. Mule trains move the only working pre-Collapse antibiotics through these passes, and the toll is paid in blood, water, or both.",
  },
];

export const WATER_BODIES: WaterBody[] = [
  {
    id: "great-lakes",
    label: "GREAT LAKES",
    x: 645,
    y: 285,
    fontSize: 11,
    lore: "Five inland seas reduced to four-and-a-half — Erie boiled off in '67 and never came back. The remaining basins are stocked with mutated pike, drifting tanker hulks, and freshwater so soft it tastes of rust.",
  },
  {
    id: "hudson-bay",
    label: "HUDSON BAY",
    x: 605,
    y: 175,
    fontSize: 10,
    lore: "Frozen most of the year and irradiated the rest. Inuit refugee fleets winter at the rim, trading seal-fat for solar cells with whoever's willing to dock under EMP-cloud.",
  },
  {
    id: "gulf-of-mexico",
    label: "GULF OF MEXICO",
    x: 555,
    y: 410,
    fontSize: 11,
    lore: "An oil-slicked bathtub the color of old motor grease. Pirate flotillas operate between the rusted-out platforms; the Coast Guard hasn't existed in living memory.",
  },
  {
    id: "sea-of-cortez",
    label: "SEA OF CORTEZ",
    x: 458,
    y: 380,
    fontSize: 9,
    lore: "Boiling salt-shallows where the dolphins came back wrong. Cortez fishermen pull up things shaped like fish and refuse to sell them; the things still go to market anyway.",
  },
];

export const COAST_SEGMENTS: CoastSegment[] = [
  {
    id: "west-coast",
    label: "PACIFIC SHORE",
    points: [
      [350, 232], [346, 256], [344, 282], [342, 308], [344, 334], [348, 358],
    ],
    lore: "Old Highway One in pieces, one cliff-fall at a time. Surfer-raider clans hold the coves and tax everything that lands; the Council writes the whole shore off as someone else's tide.",
  },
  {
    id: "east-coast",
    label: "ATLANTIC SHORE",
    points: [
      [732, 254], [734, 278], [736, 302], [738, 326], [740, 348], [738, 372],
    ],
    lore: "A graveyard coast of half-sunk container ports and the bones of the old eastern cities. Trade still runs out of three of the deeper harbors, but the harbormasters answer to no flag the Council recognizes.",
  },
  {
    id: "south-coast",
    label: "GULF SHORE",
    points: [
      [510, 408], [538, 418], [568, 422], [598, 420], [628, 414], [658, 408],
    ],
    lore: "Oil-slick beaches and saltwater that won't lather. Pirate flotillas put in here for fuel and silence; nothing official has patrolled the strip since the second Reclamation collapsed.",
  },
  {
    id: "baja-coast",
    label: "BAJA SHORE",
    points: [
      [438, 378], [434, 398], [432, 416], [434, 432], [440, 446],
    ],
    lore: "A long thin spit of cactus and stripped resort-cement. Cortez fishermen run the western edge, cartel runners the eastern, and the two sides agreed a hundred years ago to never agree on where the middle is.",
  },
];

export const CANYON_MARKS: CanyonMark[] = [
  {
    id: "grand-canyon",
    x: 432,
    y: 320,
    angle: 35,
    label: "GRAND CANYON",
    labelPos: [432, 332],
    lore: "A scar so big the Old States used to sell tickets. Now it's a sky-corridor for smuggler dirigibles — radar can't find them inside the walls, and the rim militia takes a cut of every cargo.",
  },
  {
    id: "hells-canyon",
    x: 398,
    y: 268,
    angle: 75,
    label: "HELLS CANYON",
    labelPos: [398, 280],
    lore: "Snake River cut this gorge before any flag was planted; the gorge has outlasted every flag since. Bandit clans terraced the walls into tier-cities that share blood feuds with the floor.",
  },
];

export const PLATEAU_MARKS: PlateauMark[] = [
  {
    id: "colorado-plateau",
    cx: 445,
    cy: 318,
    rx: 22,
    ry: 18,
    label: "COLORADO PLATEAU",
    labelPos: [445, 340],
    lore: "Red mesa country, high desert where the air still bites with old fallout. Hermit-priests run weather-stations and prophecy-stations on the same rooftops, and nobody asks which is which.",
  },
  {
    id: "ozark-plateau",
    cx: 590,
    cy: 328,
    rx: 18,
    ry: 14,
    label: "OZARK PLATEAU",
    labelPos: [590, 346],
    lore: "Backwoods militia kingdom, dense as a green wall. Outsiders who walk in unannounced are catalogued by the ridge-scouts before they get fifty paces past the treeline.",
  },
];

export const DRIED_RIVERS: DriedRiver[] = [
  {
    id: "mississippi",
    label: "MISSISSIPPI",
    labelPos: [575, 350],
    points: [
      [582, 282], [580, 300], [578, 320], [576, 340],
      [574, 360], [572, 380], [568, 400], [560, 415],
    ],
    lore: "Choked with rusted barges; faction caravans use the dry bed as a road. The river itself runs three months out of twelve, and those months are the ones you don't travel.",
  },
  {
    id: "colorado-river",
    label: "COLORADO RIVER",
    labelPos: [430, 348],
    points: [
      [428, 290], [430, 308], [432, 322], [438, 338], [445, 352], [452, 366],
    ],
    lore: "Drained to a trickle by the dam-warlords upstream. The old Hoover bunker still hoards what little flow's left and rents it back to downstream sectors at gunpoint.",
  },
  {
    id: "rio-grande",
    label: "RIO GRANDE",
    labelPos: [505, 372],
    points: [
      [475, 332], [490, 348], [505, 360], [520, 372], [538, 388],
    ],
    lore: "The border that wasn't, then was, then wasn't. Now it's a chain of brackish puddles patrolled by both sides because neither side trusts the other to remember which side they were on.",
  },
  {
    id: "ohio-river",
    label: "OHIO RIVER",
    labelPos: [625, 322],
    points: [
      [598, 308], [612, 314], [628, 320], [644, 326], [658, 332],
    ],
    lore: "Acid-stained and slow. Industrial sludge from the rust-belt foundries gives it a permanent orange foam the locals call 'the broth.' Drink it and you glow; bottle it and you sell it.",
  },
];

export const DUNE_FIELDS: DuneField[] = [
  {
    id: "mojave-dunes",
    cx: 408,
    cy: 348,
    count: 14,
    spread: 22,
    angle: 18,
    label: "MOJAVE DUNES",
    labelPos: [408, 372],
    lore: "Sand creeping over what used to be Vegas. The buried casinos still light up some nights — nobody owns up to the generators, and nobody who walks out toward the glow walks back.",
  },
  {
    id: "sonoran-dunes",
    cx: 455,
    cy: 360,
    count: 11,
    spread: 20,
    angle: 25,
    label: "SONORAN WASTES",
    labelPos: [455, 380],
    lore: "Saguaros bigger than guard towers and twice as quiet. Cartel scouts hide in their shadows by day; the things that hunt the cartel scouts hide in their shadows by night.",
  },
  {
    id: "great-basin-dunes",
    cx: 395,
    cy: 308,
    count: 12,
    spread: 24,
    angle: 12,
    label: "GREAT BASIN",
    labelPos: [395, 328],
    lore: "A dust-ocean where the wind never stops. Salt-flats here can swallow a convoy whole between dawn and noon — the wreckage surfaces a year later, picked clean and polished smooth.",
  },
];

export const SCATTER_DOTS: ScatterDots[] = [
  {
    id: "dakota-badlands",
    cx: 498,
    cy: 268,
    count: 18,
    spread: 22,
    style: "scrub",
    label: "DAKOTA BADLANDS",
    lore: "Eroded clay spires the colour of old bone. The cattle-cult hermits read the wind-stripped layers like calendars and warn anyone who'll listen that the soil here has been keeping a list.",
  },
  {
    id: "rust-belt-rubble",
    cx: 642,
    cy: 296,
    count: 22,
    spread: 24,
    style: "rubble",
    label: "RUST-BELT RUBBLE",
    lore: "Whole city blocks reduced to hip-deep brick by sixty winters of freeze-and-thaw. Salvage crews work it in pairs because the loose slabs settle without warning, and the things underneath don't always wait to be found.",
  },
  {
    id: "nevada-craters",
    cx: 392,
    cy: 318,
    count: 9,
    spread: 18,
    style: "craters",
    label: "NEVADA CRATERS",
    lore: "Test-site pockmarks the survey teams stopped trying to fence off. Each crater holds a still pool of glassy water that the desert rats won't drink and the salvagers won't dive — though both keep coming back to look.",
  },
  {
    id: "trinity-craters",
    cx: 472,
    cy: 348,
    count: 7,
    spread: 16,
    style: "craters",
    label: "TRINITY FIELDS",
    lore: "The original wound, and a dozen smaller ones the histories never named. Counters tick without provocation; the prospectors who work the rim wear lead-lined boots and short contracts.",
  },
  {
    id: "everglades-marsh",
    cx: 698,
    cy: 412,
    count: 24,
    spread: 26,
    style: "marsh",
    label: "EVERGLADES",
    lore: "Salt has crept north a hundred miles since the seawalls failed. What was sawgrass is mangrove now, and what was mangrove is the kind of brackish nothing that swallows airboats whole and gives nothing back.",
  },
  {
    id: "louisiana-bayou",
    cx: 595,
    cy: 408,
    count: 20,
    spread: 22,
    style: "marsh",
    label: "LOUISIANA BAYOU",
    lore: "A maze of black water and cypress that drinks the heat and gives back fever. The bayou clans run the only safe channels and charge in rifle ammunition, because nothing else holds value past the third bend.",
  },
];

export const CLIFF_EDGES: CliffEdge[] = [
  {
    id: "big-sur-cliffs",
    label: "BIG SUR CLIFFS",
    labelPos: [340, 338],
    points: [
      [346, 318], [344, 330], [346, 342], [348, 354], [350, 366],
    ],
    lore: "Pacific bluffs gone feral. The old coast highway is half in the sea now; what's left is patrolled by surfer-raiders who'd rather drown a stranger than feed one.",
  },
  {
    id: "atlantic-palisades",
    label: "ATLANTIC PALISADES",
    labelPos: [732, 295],
    points: [
      [728, 268], [732, 282], [734, 296], [736, 310], [738, 324],
    ],
    lore: "Storm-cut basalt facing a sea no one charts anymore. Lighthouse-keeper guilds still run the lamps for whoever pays in fuel; pirate captains pay double to have them turned off.",
  },
];

export const WEATHER_ZONES: WeatherZone[] = [
  // Rad-belt: brutal in dry summer, calmer when winter snow caps the dust.
  { id: "wz-mojave-rad", cx: 415, cy: 350, rx: 50, ry: 35, type: "radiation_storm", intensity: "high", label: "Mojave Rad-Belt",
    seasonProfile: { spring: "medium", summer: "high", autumn: "medium", winter: "low" } },
  // Don't march through the Dust Bowl in summer. Goes dormant in winter.
  { id: "wz-dustbowl", cx: 530, cy: 320, rx: 60, ry: 40, type: "dust_cloud", intensity: "medium", label: "Plains Dust Bowl",
    seasonProfile: { spring: "medium", summer: "high", autumn: "medium", winter: "dormant" } },
  // Acid rain peaks with spring/autumn rain seasons.
  { id: "wz-rust-acid", cx: 650, cy: 345, rx: 55, ry: 38, type: "acid_rain", intensity: "medium", label: "Rust-Belt Acid Rain",
    seasonProfile: { spring: "high", summer: "low", autumn: "high", winter: "medium" } },
  // Arctic EMP boils in the long winter night, calms in summer.
  { id: "wz-arctic-emp", cx: 520, cy: 130, rx: 75, ry: 45, type: "electromagnetic", intensity: "high", label: "Arctic EMP Anomaly",
    seasonProfile: { spring: "medium", summer: "low", autumn: "medium", winter: "high" } },
  // Cascadia ash rolls heaviest after the summer fire season.
  { id: "wz-cascadia-ash", cx: 365, cy: 280, rx: 45, ry: 35, type: "ashfall", intensity: "medium", label: "Cascadia Ashfall",
    seasonProfile: { spring: "low", summer: "medium", autumn: "high", winter: "medium" } },
  // Gulf fog cooks in the heat, burns off in winter.
  { id: "wz-gulf-toxic", cx: 575, cy: 388, rx: 55, ry: 32, type: "toxic_fog", intensity: "high", label: "Gulf Toxic Fog",
    seasonProfile: { spring: "high", summer: "high", autumn: "medium", winter: "low" } },
  // Rockies pocket: small EMP that only really fires up in winter.
  { id: "wz-rockies-emp", cx: 445, cy: 295, rx: 35, ry: 28, type: "electromagnetic", intensity: "low", label: "Rockies EMP Pocket",
    seasonProfile: { spring: "low", summer: "dormant", autumn: "low", winter: "medium" } },
  // The Yellowstone periphery is a persistent ash hazard. This deliberately
  // overlaps the existing Rockies pocket: routes through the caldera should
  // carry both the intermittent EMP risk and the eruption's supply burden.
  { id: "wz-yellowstone-ash", cx: YELLOWSTONE_EXCLUSION_ZONE.periphery.cx, cy: YELLOWSTONE_EXCLUSION_ZONE.periphery.cy,
    rx: YELLOWSTONE_EXCLUSION_ZONE.periphery.rx, ry: YELLOWSTONE_EXCLUSION_ZONE.periphery.ry,
    type: "ashfall", intensity: "high", label: "Yellowstone Ash Exclusion",
    seasonProfile: { spring: "high", summer: "high", autumn: "high", winter: "high" } },
  // Northeast acid drizzle: a spring/autumn nuisance.
  { id: "wz-northeast-acid", cx: 720, cy: 285, rx: 40, ry: 28, type: "acid_rain", intensity: "low", label: "Northeast Acid Drizzle",
    seasonProfile: { spring: "medium", summer: "dormant", autumn: "medium", winter: "low" } },
  // Sonora hot patch: dangerous in summer, sleeping otherwise.
  { id: "wz-southwest-rad", cx: 478, cy: 332, rx: 38, ry: 30, type: "radiation_storm", intensity: "low", label: "Sonora Hot Patch",
    seasonProfile: { spring: "low", summer: "high", autumn: "medium", winter: "dormant" } },
  // Yucatan spore fog blooms in the wet warm months, dormant in winter.
  { id: "wz-centam-fog", cx: 615, cy: 510, rx: 50, ry: 38, type: "toxic_fog", intensity: "medium", label: "Yucatan Spore Fog",
    seasonProfile: { spring: "high", summer: "high", autumn: "medium", winter: "dormant" } },
];

// Default season profile per hazard type, used when an authored zone omits its
// own seasonProfile. Keeps any future zones automatically drifting too.
export const DEFAULT_SEASON_PROFILES: Record<WeatherZone["type"], Record<Season, WeatherZoneSeasonState>> = {
  radiation_storm: { spring: "medium", summer: "high",   autumn: "medium", winter: "low" },
  dust_cloud:      { spring: "medium", summer: "high",   autumn: "medium", winter: "dormant" },
  acid_rain:       { spring: "high",   summer: "low",    autumn: "high",   winter: "medium" },
  electromagnetic: { spring: "medium", summer: "low",    autumn: "medium", winter: "high" },
  ashfall:         { spring: "low",    summer: "medium", autumn: "high",   winter: "medium" },
  toxic_fog:       { spring: "high",   summer: "high",   autumn: "medium", winter: "low" },
};

export const WEATHER_INTENSITY_MULT: Record<WeatherZoneIntensity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// Hazard-themed encounter chance scales modestly with zone intensity. This is
// gentler than WEATHER_INTENSITY_MULT (which drives resource drains) because
// encounter chances are bounded — we want a high-intensity zone to fire its
// signature event noticeably more often than a low-intensity one, without
// saturating the 0.95 cap and wiping out the upside flip-side.
export const HAZARD_CHANCE_INTENSITY_MULT: Record<WeatherZoneIntensity, number> = {
  low: 1,
  medium: 1.3,
  high: 1.6,
};

// Returns the zone's effective intensity for a given season. "dormant" means
// the hazard has gone quiet and contributes no drains/penalties. When no
// season is supplied (legacy callers), the static authored intensity is used.
export function getZoneSeasonState(zone: WeatherZone, season?: Season): WeatherZoneSeasonState {
  if (!season) return zone.intensity;
  const profile = zone.seasonProfile ?? DEFAULT_SEASON_PROFILES[zone.type];
  return profile[season] ?? zone.intensity;
}

export function isZoneActive(zone: WeatherZone, season?: Season): boolean {
  return getZoneSeasonState(zone, season) !== "dormant";
}

// Convenience: derive season from a GameDate.
export function seasonFromDate(date: GameDate | null | undefined): Season | undefined {
  if (!date) return undefined;
  return getSeason(date.month);
}

export type WeatherZoneEffect = {
  // Per-zone base values; multiplied by intensity at apply time.
  creditsDrain: number;
  ammoDrain: number;
  foodDrain: number;
  encounterChanceBoost: number; // 0..0.2 per intensity step
  raidSuccessPenalty: number;   // 0..0.25 per intensity step
  scoutIntelPenalty: number;    // 0..0.5 per intensity step
  tradeRevenuePenalty: number;  // 0..0.2 per intensity step
  blurb: string;
};

export const WEATHER_TYPE_EFFECTS: Record<WeatherZone["type"], WeatherZoneEffect> = {
  radiation_storm: {
    creditsDrain: 400,
    ammoDrain: 0,
    foodDrain: 3,
    encounterChanceBoost: 0.05,
    raidSuccessPenalty: 0.05,
    scoutIntelPenalty: 0.1,
    tradeRevenuePenalty: 0.05,
    blurb: "Rad-suit wear and crew rotations bled supplies",
  },
  dust_cloud: {
    creditsDrain: 200,
    ammoDrain: 0,
    foodDrain: 2,
    encounterChanceBoost: 0.04,
    raidSuccessPenalty: 0.05,
    scoutIntelPenalty: 0.15,
    tradeRevenuePenalty: 0.08,
    blurb: "Visibility was near-zero in the dust",
  },
  acid_rain: {
    creditsDrain: 350,
    ammoDrain: 2,
    foodDrain: 0,
    encounterChanceBoost: 0.02,
    raidSuccessPenalty: 0.02,
    scoutIntelPenalty: 0.05,
    tradeRevenuePenalty: 0.05,
    blurb: "Acid pitting chewed through gear and crates",
  },
  electromagnetic: {
    creditsDrain: 150,
    ammoDrain: 0,
    foodDrain: 0,
    encounterChanceBoost: 0.06,
    raidSuccessPenalty: 0.10,
    scoutIntelPenalty: 0.25,
    tradeRevenuePenalty: 0.10,
    blurb: "EMP bursts cooked optics and comms",
  },
  ashfall: {
    creditsDrain: 250,
    ammoDrain: 0,
    foodDrain: 4,
    encounterChanceBoost: 0.03,
    raidSuccessPenalty: 0.03,
    scoutIntelPenalty: 0.10,
    tradeRevenuePenalty: 0.04,
    blurb: "Ash clogged filters and spoiled rations",
  },
  toxic_fog: {
    creditsDrain: 500,
    ammoDrain: 1,
    foodDrain: 5,
    encounterChanceBoost: 0.05,
    raidSuccessPenalty: 0.04,
    scoutIntelPenalty: 0.10,
    tradeRevenuePenalty: 0.06,
    blurb: "Operatives took medical hits from the fog",
  },
};

export function pointInWeatherZone(x: number, y: number, zone: WeatherZone): boolean {
  if (zone.rx <= 0 || zone.ry <= 0) return false;
  const dx = (x - zone.cx) / zone.rx;
  const dy = (y - zone.cy) / zone.ry;
  return dx * dx + dy * dy <= 1;
}

export function getWeatherZonesOnPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  samples: number = 12,
  season?: Season,
): WeatherZone[] {
  const hit = new Map<string, WeatherZone>();
  const steps = Math.max(2, samples);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const zone of WEATHER_ZONES) {
      if (hit.has(zone.id)) continue;
      // When a season is supplied, dormant zones don't apply travel effects.
      if (season && !isZoneActive(zone, season)) continue;
      if (pointInWeatherZone(px, py, zone)) hit.set(zone.id, zone);
    }
  }
  return Array.from(hit.values());
}

export type WeatherTravelEffect = {
  zones: WeatherZone[];
  creditsDrain: number;
  ammoDrain: number;
  foodDrain: number;
  encounterChanceBoost: number;
  raidSuccessPenalty: number;
  scoutIntelPenalty: number;
  tradeRevenuePenalty: number;
  summaryLines: string[];
};

export function computeWeatherTravelEffect(zones: WeatherZone[], season?: Season): WeatherTravelEffect {
  let creditsDrain = 0;
  let ammoDrain = 0;
  let foodDrain = 0;
  let encounterChanceBoost = 0;
  let raidSuccessPenalty = 0;
  let scoutIntelPenalty = 0;
  let tradeRevenuePenalty = 0;
  const summaryLines: string[] = [];
  for (const zone of zones) {
    const state = getZoneSeasonState(zone, season);
    if (state === "dormant") {
      // Defensive: callers shouldn't pass dormant zones, but if they do
      // (e.g. legacy call without season), skip them rather than draining.
      continue;
    }
    const eff = WEATHER_TYPE_EFFECTS[zone.type];
    const mult = WEATHER_INTENSITY_MULT[state];
    creditsDrain += eff.creditsDrain * mult;
    ammoDrain += eff.ammoDrain * mult;
    foodDrain += eff.foodDrain * mult;
    encounterChanceBoost += eff.encounterChanceBoost * mult;
    raidSuccessPenalty += eff.raidSuccessPenalty * mult;
    scoutIntelPenalty += eff.scoutIntelPenalty * mult;
    tradeRevenuePenalty += eff.tradeRevenuePenalty * mult;
    summaryLines.push(`${zone.label} (${state}) — ${eff.blurb}.`);
  }
  encounterChanceBoost = Math.min(0.6, encounterChanceBoost);
  raidSuccessPenalty = Math.min(0.55, raidSuccessPenalty);
  scoutIntelPenalty = Math.min(0.85, scoutIntelPenalty);
  tradeRevenuePenalty = Math.min(0.65, tradeRevenuePenalty);
  return {
    zones,
    creditsDrain: Math.round(creditsDrain),
    ammoDrain: Math.round(ammoDrain),
    foodDrain: Math.round(foodDrain),
    encounterChanceBoost,
    raidSuccessPenalty,
    scoutIntelPenalty,
    tradeRevenuePenalty,
    summaryLines,
  };
}

export const WEATHER_COLORS: Record<WeatherZone["type"], { fill: string; border: string; text: string }> = {
  radiation_storm: { fill: "#FFFF0010", border: "#FFFF0030", text: "#CCCC00" },
  dust_cloud: { fill: "#D4A06010", border: "#D4A06030", text: "#C89050" },
  acid_rain: { fill: "#00FF8010", border: "#00FF8030", text: "#00CC60" },
  electromagnetic: { fill: "#8080FF10", border: "#8080FF30", text: "#6666CC" },
  ashfall: { fill: "#80808010", border: "#80808030", text: "#999999" },
  toxic_fog: { fill: "#80FF0010", border: "#80FF0030", text: "#66CC00" },
};

export const NODE_COLORS: Record<string, string> = {
  player_city: MAP_COLORS.green,
  megacity: MAP_COLORS.blue,
  nation: MAP_COLORS.orange,
  township: MAP_COLORS.greenFaded,
  notable: MAP_COLORS.inkLight,
  resource_node: "#DAA520",
};

export const DANGER_LABELS: Record<string, { text: string; color: string }> = {
  safe: { text: "SAFE", color: MAP_COLORS.green },
  contested: { text: "CONTESTED", color: MAP_COLORS.orange },
  hostile: { text: "HOSTILE", color: MAP_COLORS.red },
  unknown: { text: "UNKNOWN", color: MAP_COLORS.inkLight },
};
