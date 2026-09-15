import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_PLAYER_CITY_POSITION,
  STARTING_REGIONS,
  WORLD_LOCATIONS,
  YELLOWSTONE_LEGACY_LOCATION_EXCEPTIONS,
} from "@/engine/worldMap";
import { LOCATION_POSITIONS } from "@/engine/worldMapPositions";
import {
  TERRAIN_ZONES,
  WEATHER_ZONES,
  YELLOWSTONE_EXCLUSION_ZONE,
  isInsideYellowstoneCore,
  isInsideYellowstoneExclusionZone,
} from "@/engine/worldMapData";

// Regenerate the fixture with `node .local/build_na_land_fixture.mjs` if
// WORLD_MAP_BOUNDS, the projection, or the source NE polygons change.
type Ring = Array<[number, number]>;
type Polygon = Ring[];

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "fixtures/na-land-polygons.json"), "utf8"),
) as { polygons: Polygon[] };
const NA_POLYGONS: Polygon[] = fixture.polygons;

function ringContains(pt: [number, number], ring: Ring): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonContains(pt: [number, number], poly: Polygon): boolean {
  if (!ringContains(pt, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (ringContains(pt, poly[i])) return false;
  return true;
}

function isOnLand(x: number, y: number): boolean {
  for (const poly of NA_POLYGONS) if (polygonContains([x, y], poly)) return true;
  return false;
}

function distanceToCoast(x: number, y: number, max = 120): number {
  if (!isOnLand(x, y)) return 0;
  for (let r = 4; r <= max; r += 4) {
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      if (!isOnLand(x + r * Math.cos(ang), y + r * Math.sin(ang))) return r;
    }
  }
  return max;
}

function polygonArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

const MAINLAND_INDEX = NA_POLYGONS.reduce(
  (best, poly, i) => (polygonArea(poly[0]) > polygonArea(NA_POLYGONS[best][0]) ? i : best),
  0,
);

const SPREAD_ANCHORS = [
  ["burnside", 675, 332],
  ["refinery-omega", 640, 245],
  ["ironclad-garrison", 520, 365],
  ["the-threshold", 480, 305],
  ["the-wound", 400, 320],
  ["gene-vault-prime", 460, 360],
  ["sky-citadel", 460, 235],
  ["the-wailing-fields", 570, 245],
  ["the-cradle", 620, 235],
  ["machine-temple", 570, 365],
  ["golden-vault", 620, 245],
  ["candlewick", 560, 370],
  ["trade-nexus-alpha", 675, 315],
  ["signal-grave", 520, 410],
  ["dusthaven", 520, 458],
  ["worm-sign", 530, 240],
  ["the-nursery", 570, 230],
  ["iron-curtain-wall", 600, 220],
  ["rn-munitions-vault", 500, 250],
  ["rn-staghorn-wastes", 470, 320],
  ["rn-datacore-crash", 490, 335],
  ["solar-array-east", 700, 200],
  ["kharkov-line", 660, 210],
  ["mirror-lake", 715, 250],
  ["mass-grave-17", 670, 290],
  ["the-orphanage", 660, 325],
  ["dam-of-saints", 650, 400],
  ["knight-fortress", 420, 405],
  ["fort-stern", 510, 380],
  ["weather-station-prime", 405, 230],
  ["the-wall-of-names", 515, 285],
  ["rn-copper-teeth", 545, 345],
] as const;

function isOnMainland(x: number, y: number): boolean {
  return polygonContains([x, y], NA_POLYGONS[MAINLAND_INDEX]);
}

// Resource nodes deliberately placed off the NA mainland polygon. These are
// thematic offshore / undersea / orbital sites whose encounter terrain field
// describes the encounter's character rather than its strict map placement
// (e.g. tidewreck shoals are tagged 'coastal' but the platform itself sits
// over open water; the orbital anchor projects a tether onto sea coordinates).
// Any new entry here must have lore that justifies a non-land placement.
const KNOWN_OFFSHORE_LOCATIONS = new Set<string>([
  "rn-tidewreck-shoals",
  "rn-saltworks-pans",
  "rn-blackreef-platform",
  "rn-leviathan-grounds",
  "rn-server-sepulchre",
  "rn-orbital-anchor",
]);

describe("world map positions: land mask", () => {
  it("every WORLD_LOCATIONS position lands on North American terrain", () => {
    const offLand = WORLD_LOCATIONS.filter(
      (l) => !KNOWN_OFFSHORE_LOCATIONS.has(l.id) && !isOnLand(l.x, l.y),
    ).map((l) => `${l.id} (${l.x}, ${l.y})`);
    expect(offLand, `WORLD_LOCATIONS in the ocean: ${offLand.join(", ")}`).toEqual([]);
  });

  it("every STARTING_REGIONS spawn lands on North American terrain", () => {
    const offLand = STARTING_REGIONS.filter((r) => !isOnLand(r.playerX, r.playerY)).map(
      (r) => `${r.id} (${r.playerX}, ${r.playerY})`,
    );
    expect(offLand, `STARTING_REGIONS spawns in the ocean: ${offLand.join(", ")}`).toEqual([]);
  });

  it("every LOCATION_POSITIONS entry lands on North American terrain", () => {
    const offLand = Object.entries(LOCATION_POSITIONS)
      .filter(([id, p]) => !KNOWN_OFFSHORE_LOCATIONS.has(id) && !isOnLand(p.x, p.y))
      .map(([id, p]) => `${id} (${p.x}, ${p.y})`);
    expect(offLand, `LOCATION_POSITIONS in the ocean: ${offLand.join(", ")}`).toEqual([]);
  });

  // The fallback is consumed by saveLoad.ts (legacy/incomplete saves) and
  // by worldmap.tsx's DEFAULT_PLAYER_POS during the brief boot window
  // before state.playerCityPosition is populated. Pre-fix values of
  // (500,500) and (250,411) projected into the Pacific Ocean and rendered
  // the player marker offshore. Lock the fallback to the on-land
  // city-core spawn so this regression cannot reappear silently.
  it("DEFAULT_PLAYER_CITY_POSITION fallback lands on North American terrain", () => {
    const { x, y } = DEFAULT_PLAYER_CITY_POSITION;
    expect(isOnLand(x, y), `DEFAULT_PLAYER_CITY_POSITION (${x}, ${y}) is in the ocean`).toBe(true);
  });
});

describe("world map positions: deterministic spread", () => {
  it("keeps the durable LA CITY id on land in Southern California", () => {
    // Los Angeles is roughly (384, 354) in the shared Americas projection.
    // The save-compatible id intentionally remains iron-khanate.
    const laCity = LOCATION_POSITIONS["iron-khanate"];
    expect(laCity).toEqual({ x: 384, y: 354 });
    expect(isOnLand(laCity.x, laCity.y)).toBe(true);
    expect(laCity.x).toBeGreaterThanOrEqual(370);
    expect(laCity.x).toBeLessThanOrEqual(400);
    expect(laCity.y).toBeGreaterThanOrEqual(340);
    expect(laCity.y).toBeLessThanOrEqual(365);
  });

  it("keeps the deliberate de-overlap anchors stable", () => {
    const remapper = fs.readFileSync(
      path.resolve(__dirname, "../../../../.local/remap_locations.mjs"),
      "utf8",
    );

    for (const [id, x, y] of SPREAD_ANCHORS) {
      expect(LOCATION_POSITIONS[id], `missing spread anchor ${id}`).toMatchObject({ x, y });
      expect(remapper).toContain(`'${id}': { x: ${x}, y: ${y} }`);
    }
  });

  it("has no duplicate or sub-4px location pins", () => {
    const crowded: string[] = [];
    const locations = Object.entries(LOCATION_POSITIONS);

    for (let i = 0; i < locations.length; i++) {
      const [leftId, left] = locations[i];
      for (let j = i + 1; j < locations.length; j++) {
        const [rightId, right] = locations[j];
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        if (distance < 4) crowded.push(`${leftId}/${rightId} (${distance.toFixed(1)}px)`);
      }
    }

    expect(crowded, `duplicate or near-colliding pins: ${crowded.join(", ")}`).toEqual([]);
  });

  it("keeps deep zoom, counter-scaled entities, and center-aware panning aligned", () => {
    const worldMapScreen = fs.readFileSync(
      path.resolve(__dirname, "../../app/(game)/worldmap.tsx"),
      "utf8",
    );

    expect(worldMapScreen).toContain("const MAX_ZOOM = 12;");
    expect(worldMapScreen).toContain("const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));");
    expect(worldMapScreen).toContain("const nodeCounterScale = useAnimatedStyle(() =>");
    expect(worldMapScreen).toContain("const ls = OPERATIONAL_SCREEN_SCALE / scale.value;");
    expect(worldMapScreen).toContain("counterScale={nodeCounterScale}");
    expect(worldMapScreen).toContain("}, nodeCounterScale]");

    // React Native scales the map around its center. Both direct recentering
    // and minimap targeting must retain the center correction at every zoom.
    expect(worldMapScreen).toContain("screenW / 2 - px * s - CONTENT_CENTER_X * (1 - s)");
    expect(worldMapScreen).toContain("screenH / 2 - py * s - CONTENT_CENTER_Y * (1 - s)");
    expect(worldMapScreen).toContain("mapView.w / 2 - playerPxX * DEFAULT_ZOOM - CONTENT_CENTER_X * (1 - DEFAULT_ZOOM)");
    expect(worldMapScreen).toContain("mapView.h / 2 - playerPxY * DEFAULT_ZOOM - CONTENT_CENTER_Y * (1 - DEFAULT_ZOOM)");
  });

  it("keeps the legacy settlement ID at Mexico City's projected coordinate", () => {
    const mexicoCity = WORLD_LOCATIONS.find((location) => location.id === "dusthaven");
    expect(mexicoCity).toMatchObject({
      id: "dusthaven",
      name: "Mexico City",
      population: 9209944,
      defenseRating: 65,
      terrain: "urban",
      connectedTo: ["megacity", "irongate", "pilgrim-station"],
    });
    expect(LOCATION_POSITIONS["dusthaven"]).toEqual({ x: 520, y: 458 });
  });
});

describe("world map positions: Yellowstone exclusion", () => {
  it("anchors the existing Atlas scar in western Wyoming", () => {
    const scar = TERRAIN_ZONES.find((zone) => zone.id === "tz-yellowstone-scar");
    expect(scar).toMatchObject({
      cx: YELLOWSTONE_EXCLUSION_ZONE.core.cx,
      cy: YELLOWSTONE_EXCLUSION_ZONE.core.cy,
      rx: YELLOWSTONE_EXCLUSION_ZONE.core.rx,
      ry: YELLOWSTONE_EXCLUSION_ZONE.core.ry,
      threat: "hostile",
    });
    expect(scar?.label).toBe("YELLOWSTONE SCAR");
    expect(isInsideYellowstoneCore(440, 281)).toBe(true);
    expect(isInsideYellowstoneCore(460, 248)).toBe(false);
  });

  it("uses a persistent ashfall hazard for the wider exclusion periphery", () => {
    const ash = WEATHER_ZONES.find((zone) => zone.id === "wz-yellowstone-ash");
    expect(ash).toMatchObject({
      cx: YELLOWSTONE_EXCLUSION_ZONE.periphery.cx,
      cy: YELLOWSTONE_EXCLUSION_ZONE.periphery.cy,
      rx: YELLOWSTONE_EXCLUSION_ZONE.periphery.rx,
      ry: YELLOWSTONE_EXCLUSION_ZONE.periphery.ry,
      type: "ashfall",
      intensity: "high",
    });
    expect(isInsideYellowstoneExclusionZone(440, 281)).toBe(true);
    expect(isInsideYellowstoneExclusionZone(480, 281)).toBe(false);
  });

  it("keeps the core empty of ordinary authored settlements", () => {
    const ordinaryPinsInCore = WORLD_LOCATIONS.filter(
      (location) =>
        isInsideYellowstoneCore(location.x, location.y) &&
        !YELLOWSTONE_LEGACY_LOCATION_EXCEPTIONS.has(location.id),
    ).map((location) => location.id);
    expect(ordinaryPinsInCore).toEqual([]);
  });

  it("makes every existing periphery pin an explicit legacy exception", () => {
    const peripheryPins = WORLD_LOCATIONS.filter((location) =>
      isInsideYellowstoneExclusionZone(location.x, location.y),
    ).map((location) => location.id);
    expect(peripheryPins.sort()).toEqual(
      Array.from(YELLOWSTONE_LEGACY_LOCATION_EXCEPTIONS).sort(),
    );
  });

  it("keeps every starting-region spawn outside the Yellowstone core", () => {
    const unsafeStarts = STARTING_REGIONS.filter((region) =>
      isInsideYellowstoneCore(region.playerX, region.playerY),
    ).map((region) => `${region.id} (${region.playerX}, ${region.playerY})`);
    expect(unsafeStarts, `starting regions in Yellowstone core: ${unsafeStarts.join(", ")}`).toEqual([]);
  });
});

// Cross-source ID uniqueness lives in worldMapIds.test.ts.

// Lore contradictions are hard-fails (not warnings) so a green typecheck is
// the single source of truth. Convert these to console.warn if warn-only is
// preferred — land-mask and id-uniqueness checks should remain blocking.
//
// Thresholds tightened (task-87 audit). Prior values (80 / 60 / wide GULF_BOX)
// shipped loose so we wouldn't have to fix every borderline case at once. The
// audit identified these violations under the new thresholds and they were
// fixed in worldMapPositions.ts / worldMap.ts before the bar was raised:
//   COASTAL inland (>20px): port-sulphur (44px → moved to coast),
//                           harbor-of-teeth (24px → moved to coast)
//   CARDINAL drift (>12px from correct half): null-zone "eastern midlands"
//     (24px west of centroid → rewritten as "central midlands"),
//     trade-crossroads "north-central" (18px south → "mid-continental"),
//     hollow-mountain-bastion "high north" (14px south → "high country"),
//     the-threshold "heading east/west" travel verbs (originally a
//     false-positive — the bare-word regex couldn't tell direction-of-travel
//     from location lore. Now handled by stripTravelDirections() below, so
//     the threshold's lore is restored to natural cardinals: "approach from
//     the east / approach from the west").
//   GULF: no current lore matches; box tightened to the actual Gulf coast
//   bounds so future "gulf" copy lands inside it.
// If a future entry genuinely cannot be fixed, document it inline and add the
// id to KNOWN_LORE_EXCEPTIONS rather than loosening the global thresholds.
const COAST_PROX_MAX = 20;
const CARDINAL_MARGIN = 12;
const GULF_BOX = { x0: 490, x1: 625, y0: 370, y1: 415 };

// Pre-existing lore/position drift the team has reviewed and accepted.
// Prefer fixing the data over adding entries here. Intentionally empty —
// every audit case above was fixed in the data, not allow-listed.
const KNOWN_LORE_EXCEPTIONS = new Set<string>([]);

// Travel-verb cardinals ("walk east", "approach from the east", "ride south
// through the canyons") describe direction-of-travel, not where the
// location sits on the map. Strip those phrasings out of a description
// before applying the cardinal matchers so writers can use natural travel
// verbs without tripping the lore-vs-position check (task-87 had to drop
// "heading east/west" from the-threshold purely to dodge this regex).
function stripTravelDirections(text: string): string {
  const verbs =
    "walk(?:ing|s|ed)?|head(?:ing|s|ed)?|ride|rides|riding|rode|ridden|" +
    "march(?:ing|es|ed)?|approach(?:ing|es|ed)?|travel(?:l?ing|s|led)?|" +
    "trek(?:king|ked|s)?|journey(?:ing|s|ed)?|sail(?:ing|s|ed)?|" +
    "fly|flies|flying|flew|drive|drives|driving|drove|driven|" +
    "run|runs|running|ran|push(?:ing|es|ed)?|mov(?:e|es|ing|ed)|" +
    "drift(?:ing|s|ed)?|bear(?:ing|s)?|com(?:e|es|ing)|came|" +
    "go|goes|going|went|climb(?:ing|s|ed)?|hik(?:e|es|ing|ed)|" +
    "paddl(?:e|es|ing|ed)|sneak(?:ing|s|ed)?|follow(?:ing|s|ed)?|" +
    "advanc(?:e|es|ing|ed)|press(?:ing|es|ed)?|crawl(?:ing|s|ed)?|" +
    "cross(?:ing|es|ed)?|emerg(?:e|es|ing|ed)";
  const connectors =
    "(?:from\\s+|to\\s+|toward[s]?\\s+|through\\s+|across\\s+|along\\s+|" +
    "down\\s+|up\\s+|out\\s+|deeper\\s+|further\\s+|farther\\s+|back\\s+|" +
    "on\\s+|in\\s+|for\\s+|over\\s+|past\\s+|onto\\s+|into\\s+)*(?:the\\s+)?";
  // Cardinal also covers -ward/-wards/-bound suffix forms so phrasings like
  // "ride eastward" or "trekking northbound" don't leak through to the
  // EAST/NORTH literal alternatives ("eastward"/"northward" etc.).
  const cardinal = "(?:north|south|east|west)(?:ward[s]?|bound)?";
  const re = new RegExp(`\\b(?:${verbs})\\s+${connectors}${cardinal}\\b`, "gi");
  return text.replace(re, "");
}

// Negative-lookahead on bare cardinals avoids double-counting diagonals
// (northeast/southwest) which would otherwise pull lore into the wrong axis.
const NORTH = /\b(north(?!(east|west|ern|ward|bound|er[ns]|side))|northern|northernmost|northward|far north|up north|deep north|north coast|north(?:ern)? frontier)\b/;
const SOUTH = /\b(south(?!(east|west|ern|ward|bound|er[ns]|side))|southern|southernmost|southward|far south|deep south|south coast|south(?:ern)? frontier)\b/;
const EAST = /\b(east(?!(ern|ward|bound|er[ns]|side))|eastern|easternmost|eastward|east coast|atlantic seaboard|atlantic coast)\b/;
const WEST = /\b(west(?!(ern|ward|bound|er[ns]|side))|western|westernmost|westward|west coast|pacific seaboard|pacific coast)\b/;
// \b boundaries on bare port/dock so we don't false-match support / paddock.
const COASTAL = /\b(coastal|coastline|coast|harbor|harbour|port|ports|docked|docks?|seaside|seafront|shoreline|shorefront|wharf|wharves|quay|quayside|by the sea|on the coast)\b/;
const GULF = /\bgulf\b/;
const ISLAND = /\b(island|islands|archipelago|atoll)\b/;

// Terrain lore matchers. A location whose name or description leans on one
// of these words should have a terrain field that reasonably backs it up,
// so encounter biome flavor and zone descriptions stay in agreement with
// the pin's tagged terrain. Mountain lore is allowed on elevated/canyon
// pins (ridge-and-valley topography reads the same way to a player); desert
// lore is allowed on wasteland (the dust-belt aesthetic overlaps).
const MOUNTAIN = /\b(mountain|mountains|mountainside|peak|peaks|summit|alpine|highland|cordillera|massif|escarpment|ridgeline)\b/;
const DESERT = /\b(desert|deserts|arid|dune|dunes|sand sea|badlands|salt flat|salt flats)\b/;
const SWAMP = /\b(swamp|swamps|marsh|marshes|mire|bog|bogs|wetland|wetlands|fen|bayou|mangrove)\b/;
const FOREST = /\b(forest|forests|woodland|woodlands|jungle|jungles|canopy|thicket|copse|the woods|deep woods)\b/;

const MOUNTAIN_TERRAINS = new Set<string>(["mountain", "elevated", "canyon"]);
const DESERT_TERRAINS = new Set<string>(["desert", "wasteland"]);
const SWAMP_TERRAINS = new Set<string>(["swamp"]);
const FOREST_TERRAINS = new Set<string>(["forest"]);

// Locations whose terrain lore is a directional reference, not the pin's
// own terrain (e.g. "subterranean metropolis beyond the salt flats" — the
// salt flats are next door, the city itself is underground).
const KNOWN_TERRAIN_LORE_EXCEPTIONS = new Set<string>(["ghost-meridian"]);

type LocSubject = { id: string; x: number; y: number; text: string };

function buildSubjects(): LocSubject[] {
  return [
    ...WORLD_LOCATIONS.map((l) => ({
      id: l.id,
      x: l.x,
      y: l.y,
      text: `${l.id} ${l.name} ${l.description}`.toLowerCase(),
    })),
    ...STARTING_REGIONS.map((r) => ({
      id: r.id,
      x: r.playerX,
      y: r.playerY,
      text: `${r.id} ${r.name} ${r.description}`.toLowerCase(),
    })),
  ];
}

describe("world map positions: lore vs. geography", () => {
  const subjects = buildSubjects();
  const cx = subjects.reduce((s, l) => s + l.x, 0) / subjects.length;
  const cy = subjects.reduce((s, l) => s + l.y, 0) / subjects.length;

  it("cardinal direction lore matches the correct half of the map", () => {
    const violations: string[] = [];
    for (const s of subjects) {
      if (KNOWN_LORE_EXCEPTIONS.has(s.id)) continue;
      // Strip travel-verb cardinals before testing — they describe
      // direction-of-travel, not where the pin sits on the map.
      const t = stripTravelDirections(s.text);
      if (NORTH.test(t) && s.y > cy + CARDINAL_MARGIN) violations.push(`${s.id} NORTH y=${s.y}`);
      if (SOUTH.test(t) && s.y < cy - CARDINAL_MARGIN) violations.push(`${s.id} SOUTH y=${s.y}`);
      if (EAST.test(t) && s.x < cx - CARDINAL_MARGIN) violations.push(`${s.id} EAST x=${s.x}`);
      if (WEST.test(t) && s.x > cx + CARDINAL_MARGIN) violations.push(`${s.id} WEST x=${s.x}`);
    }
    expect(violations, `cardinal lore vs. position: ${violations.join("; ")}`).toEqual([]);
  });

  it("coastal lore is within reach of open water", () => {
    const violations: string[] = [];
    for (const s of subjects) {
      if (KNOWN_LORE_EXCEPTIONS.has(s.id) || !COASTAL.test(s.text)) continue;
      const d = distanceToCoast(s.x, s.y, COAST_PROX_MAX + 20);
      if (d > COAST_PROX_MAX) violations.push(`${s.id} ~${d}px inland`);
    }
    expect(violations, `coastal lore stranded inland: ${violations.join("; ")}`).toEqual([]);
  });

  it("gulf lore lands inside the Gulf bounding box", () => {
    const violations: string[] = [];
    for (const s of subjects) {
      if (KNOWN_LORE_EXCEPTIONS.has(s.id) || !GULF.test(s.text)) continue;
      if (s.x < GULF_BOX.x0 || s.x > GULF_BOX.x1 || s.y < GULF_BOX.y0 || s.y > GULF_BOX.y1) {
        violations.push(`${s.id} (${s.x}, ${s.y})`);
      }
    }
    expect(violations, `gulf lore outside the Gulf: ${violations.join("; ")}`).toEqual([]);
  });

  it("island lore is not on the NA mainland polygon", () => {
    const violations: string[] = [];
    for (const s of subjects) {
      if (KNOWN_LORE_EXCEPTIONS.has(s.id) || !ISLAND.test(s.text)) continue;
      if (isOnMainland(s.x, s.y)) violations.push(`${s.id} (${s.x}, ${s.y})`);
    }
    expect(violations, `island lore on the mainland: ${violations.join("; ")}`).toEqual([]);
  });
});

describe("world map positions: lore matchers", () => {
  it("COASTAL matches literal port/dock lore", () => {
    expect(COASTAL.test("a major port at the edge of the bay")).toBe(true);
    expect(COASTAL.test("the docks burned for three days")).toBe(true);
    expect(COASTAL.test("a single dock juts into the harbour")).toBe(true);
    expect(COASTAL.test("the coast is silent")).toBe(true);
  });

  it("COASTAL skips support / deport / paddock / portal", () => {
    expect(COASTAL.test("logistical support hub far inland")).toBe(false);
    expect(COASTAL.test("they will deport any outsider")).toBe(false);
    expect(COASTAL.test("the paddock holds the last horses")).toBe(false);
    expect(COASTAL.test("a portal of bone marks the gate")).toBe(false);
  });

  it("cardinal matchers fire on bare words but skip diagonals", () => {
    expect(NORTH.test("hidden north of the wall")).toBe(true);
    expect(NORTH.test("northeast quadrant")).toBe(false);
    expect(SOUTH.test("south of the river")).toBe(true);
    expect(SOUTH.test("southwestern reach")).toBe(false);
    expect(EAST.test("east of the salt flats")).toBe(true);
    expect(EAST.test("easterly winds")).toBe(false);
    expect(WEST.test("west of nowhere")).toBe(true);
    expect(WEST.test("northwest passage")).toBe(false);
  });

  it("travel-verb cardinals are stripped so they don't trigger position checks", () => {
    // Direction-of-travel phrasings — should NOT count as position lore.
    expect(NORTH.test(stripTravelDirections("walk north for three days"))).toBe(false);
    expect(SOUTH.test(stripTravelDirections("ride south through the canyons"))).toBe(false);
    expect(EAST.test(stripTravelDirections("approach from the east"))).toBe(false);
    expect(WEST.test(stripTravelDirections("head west and emerge 3km away"))).toBe(false);
    expect(EAST.test(stripTravelDirections("travel east across the salt flats"))).toBe(false);
    expect(NORTH.test(stripTravelDirections("trek north along the rim"))).toBe(false);
    expect(SOUTH.test(stripTravelDirections("driving south past the wreck"))).toBe(false);
    // -ward / -bound suffix forms after travel verbs must also strip cleanly.
    expect(EAST.test(stripTravelDirections("ride eastward at first light"))).toBe(false);
    expect(WEST.test(stripTravelDirections("press westward through the dust"))).toBe(false);
    expect(NORTH.test(stripTravelDirections("trekking northbound for a week"))).toBe(false);
    expect(SOUTH.test(stripTravelDirections("driven southward by the storm"))).toBe(false);
    // Position lore — must STILL match after stripping.
    expect(NORTH.test(stripTravelDirections("the northern frontier"))).toBe(true);
    expect(EAST.test(stripTravelDirections("the eastern seaboard"))).toBe(true);
    expect(SOUTH.test(stripTravelDirections("hidden in the deep south"))).toBe(true);
    expect(WEST.test(stripTravelDirections("a settlement west of nowhere"))).toBe(true);
    // Mixed sentence — only the travel clause should be stripped.
    expect(EAST.test(stripTravelDirections("the eastern keep; ride east at dawn"))).toBe(true);
  });

  it("GULF and ISLAND match their literal triggers only", () => {
    expect(GULF.test("warm gulf currents")).toBe(true);
    expect(GULF.test("ungulate herds")).toBe(false);
    expect(ISLAND.test("a forgotten island chain")).toBe(true);
    expect(ISLAND.test("an archipelago of reactors")).toBe(true);
    expect(ISLAND.test("highlander clans")).toBe(false);
  });

  it("terrain matchers fire on their cluster but skip near-misses", () => {
    expect(MOUNTAIN.test("a fortress carved into the mountainside")).toBe(true);
    expect(MOUNTAIN.test("the alpine wind never stops")).toBe(true);
    expect(MOUNTAIN.test("paramount authority")).toBe(false);
    expect(DESERT.test("the dunes have swallowed the road")).toBe(true);
    expect(DESERT.test("an arid stretch with no shelter")).toBe(true);
    expect(DESERT.test("the deserter took two rifles")).toBe(false);
    expect(SWAMP.test("the marsh hums with mosquitoes")).toBe(true);
    expect(SWAMP.test("a bayou clinic at the waterline")).toBe(true);
    expect(SWAMP.test("a swampy debriefing")).toBe(false);
    expect(FOREST.test("the canopy hides the gun emplacements")).toBe(true);
    expect(FOREST.test("a forgotten woodland chapel")).toBe(true);
    expect(FOREST.test("forestall the inevitable")).toBe(false);
  });
});

describe("world map positions: terrain lore vs. terrain field", () => {
  function checkTerrainLore(label: string, re: RegExp, allowed: Set<string>): string[] {
    const violations: string[] = [];
    for (const l of WORLD_LOCATIONS) {
      if (KNOWN_TERRAIN_LORE_EXCEPTIONS.has(l.id)) continue;
      const text = `${l.name} ${l.description}`.toLowerCase();
      if (!re.test(text)) continue;
      const t = l.terrain;
      if (!t || !allowed.has(t)) {
        violations.push(`${l.id} [${t ?? "none"}] (${label})`);
      }
    }
    return violations;
  }

  it("mountain lore lands on a mountain-cluster terrain", () => {
    const v = checkTerrainLore("MOUNTAIN", MOUNTAIN, MOUNTAIN_TERRAINS);
    expect(v, `mountain lore drift: ${v.join("; ")}`).toEqual([]);
  });

  it("desert lore lands on a desert-cluster terrain", () => {
    const v = checkTerrainLore("DESERT", DESERT, DESERT_TERRAINS);
    expect(v, `desert lore drift: ${v.join("; ")}`).toEqual([]);
  });

  it("swamp lore lands on a swamp terrain", () => {
    const v = checkTerrainLore("SWAMP", SWAMP, SWAMP_TERRAINS);
    expect(v, `swamp lore drift: ${v.join("; ")}`).toEqual([]);
  });

  it("forest lore lands on a forest terrain", () => {
    const v = checkTerrainLore("FOREST", FOREST, FOREST_TERRAINS);
    expect(v, `forest lore drift: ${v.join("; ")}`).toEqual([]);
  });

  it("an inland 'major port' would trip the coastal check", () => {
    const text = "a major port long since cut off from the sea";
    expect(COASTAL.test(text)).toBe(true);
    expect(isOnLand(500, 300)).toBe(true);
    expect(distanceToCoast(500, 300, COAST_PROX_MAX + 20)).toBeGreaterThan(COAST_PROX_MAX);
  });
});
