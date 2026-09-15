import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { rollEncounter, getEncounterChance } from "@/engine/mapEncounters";
import { WEATHER_ZONES, type WeatherZone } from "@/engine/worldMapData";
import type { WorldLocation } from "@/engine/worldMap";
import type { GameState } from "@/engine/types";

const baseLocation: WorldLocation = {
  id: "test_loc",
  name: "Test Location",
  type: "township",
  faction: "Independents",
  x: 1000,
  y: 1000,
  population: 5000,
  defenseRating: 10,
  terrain: "urban",
  connectedTo: [],
  discovered: true,
} as unknown as WorldLocation;

const baseState: GameState = {
  resources: { credits: 0, ammo: 0, food: 0 },
  totalTicks: 0,
  locationRelations: {},
  discoveredLocationIds: [],
} as unknown as GameState;

function zoneOfType(type: WeatherZone["type"]): WeatherZone {
  const z = WEATHER_ZONES.find((w) => w.type === type);
  if (!z) throw new Error(`no seeded zone of type ${type}`);
  return z;
}

function zoneOfTypeIntensity(
  type: WeatherZone["type"],
  intensity: WeatherZone["intensity"],
): WeatherZone {
  const z = WEATHER_ZONES.find((w) => w.type === type && w.intensity === intensity);
  if (!z) {
    // Synthesize one when the seeded list doesn't include the desired
    // (type, intensity) pair — keeps these scaling tests independent of map
    // authoring choices.
    return {
      id: `synthetic-${type}-${intensity}`,
      cx: 0,
      cy: 0,
      rx: 10,
      ry: 10,
      type,
      intensity,
      label: `synthetic ${type} ${intensity}`,
    } as unknown as WeatherZone;
  }
  return z;
}

const HAZARD_TITLES: Record<WeatherZone["type"], string> = {
  radiation_storm: "RAD-WAVE PASSAGE",
  dust_cloud: "DUST WALL CROSSING",
  acid_rain: "ACID DELUGE",
  electromagnetic: "DEAD COMMS WINDOW",
  ashfall: "ASHFALL BURIAL",
  toxic_fog: "SPORE BLOOM EXPOSURE",
};

const HAZARD_UPSIDE_TITLES: Record<WeatherZone["type"], string> = {
  radiation_storm: "FALLOUT GAME RUN",
  dust_cloud: "DUST-STRIPPED CACHE",
  acid_rain: "STRIPPED WRECK SALVAGE",
  electromagnetic: "EMP-FRIED TECH SALVAGE",
  ashfall: "ASH-PRESERVED CACHE",
  toxic_fog: "BLOOM HARVEST",
};

describe("hazard-specific encounters", () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    if (randomSpy) randomSpy.mockRestore();
  });

  it("each hazard type has a signature encounter that fires when its zone is crossed", () => {
    for (const type of Object.keys(HAZARD_TITLES) as WeatherZone["type"][]) {
      // Force the very first roll to succeed; that should land on the hazard
      // encounter since hazard encounters are listed first.
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType(type)]);
        expect(enc, `expected hazard encounter for ${type}`).toBeTruthy();
        expect(enc!.title).toBe(HAZARD_TITLES[type]);
      } finally {
        randomSpy.mockRestore();
      }
    }
  });

  it("does not fire a hazard encounter when no matching zone is crossed", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const enc = rollEncounter("scout", baseLocation, baseState, []);
      if (enc) seen.add(enc.title);
    }
    for (const title of Object.values(HAZARD_TITLES)) {
      expect(seen.has(title)).toBe(false);
    }
  });

  it("only fires the hazard encounter that matches the crossed zone type", () => {
    // Cross only a radiation_storm zone — the dust/EMP/etc. signatures must
    // not show up in the eligible roll.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType("radiation_storm")]);
      if (enc) seen.add(enc.title);
    }
    expect(seen.has(HAZARD_TITLES.radiation_storm)).toBe(true);
    expect(seen.has(HAZARD_TITLES.dust_cloud)).toBe(false);
    expect(seen.has(HAZARD_TITLES.electromagnetic)).toBe(false);
    expect(seen.has(HAZARD_TITLES.toxic_fog)).toBe(false);
  });

  it("getEncounterChance increases when crossing a hazard zone vs. crossing nothing", () => {
    const baseChance = getEncounterChance("scout", baseLocation, baseState, []);
    const hazardChance = getEncounterChance("scout", baseLocation, baseState, [zoneOfType("toxic_fog")]);
    expect(hazardChance).toBeGreaterThan(baseChance);
  });

  it("rollEncounter still returns null when nothing rolls in", () => {
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType("toxic_fog")]);
    expect(enc).toBeNull();
  });

  it("each hazard type has at least one positive flip-side encounter that can fire", () => {
    // Sample many rolls per hazard zone so the rarer upside event has a chance
    // to surface. Every hazard type must produce its themed upside title at
    // least once and that title must carry positive deltas.
    for (const type of Object.keys(HAZARD_UPSIDE_TITLES) as WeatherZone["type"][]) {
      let positiveCount = 0;
      let positiveSeen = false;
      for (let i = 0; i < 600; i++) {
        const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType(type)]);
        if (!enc) continue;
        if (enc.title === HAZARD_UPSIDE_TITLES[type]) {
          positiveSeen = true;
          positiveCount += 1;
          const e = enc.effects;
          const totalDelta =
            (e.creditsDelta ?? 0) +
            (e.ammoDelta ?? 0) * 100 +
            (e.foodDelta ?? 0) * 100 +
            (e.dispositionDelta ?? 0) * 100;
          expect(totalDelta).toBeGreaterThan(0);
          expect(enc.severity).toBe("positive");
        }
      }
      expect(positiveSeen, `expected upside encounter for ${type}`).toBe(true);
      expect(positiveCount, `upside count for ${type}`).toBeGreaterThan(0);
    }
  });

  it("does not fire a hazard upside encounter when no matching zone is crossed", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const enc = rollEncounter("scout", baseLocation, baseState, []);
      if (enc) seen.add(enc.title);
    }
    for (const title of Object.values(HAZARD_UPSIDE_TITLES)) {
      expect(seen.has(title)).toBe(false);
    }
  });

  it("only fires the matching hazard's upside encounter", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType("electromagnetic")]);
      if (enc) seen.add(enc.title);
    }
    expect(seen.has(HAZARD_UPSIDE_TITLES.electromagnetic)).toBe(true);
    // Other hazard upsides should not have leaked in.
    for (const t of Object.keys(HAZARD_UPSIDE_TITLES) as WeatherZone["type"][]) {
      if (t === "electromagnetic") continue;
      expect(seen.has(HAZARD_UPSIDE_TITLES[t])).toBe(false);
    }
  });

  it("the negative hazard event remains the dominant outcome over its upside", () => {
    // For every hazard, count negative vs upside hits across many trials and
    // verify the signature negative title fires strictly more often.
    for (const type of Object.keys(HAZARD_TITLES) as WeatherZone["type"][]) {
      let negative = 0;
      let upside = 0;
      for (let i = 0; i < 1500; i++) {
        const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType(type)]);
        if (!enc) continue;
        if (enc.title === HAZARD_TITLES[type]) negative += 1;
        else if (enc.title === HAZARD_UPSIDE_TITLES[type]) upside += 1;
      }
      expect(upside, `upside count for ${type}`).toBeGreaterThan(0);
      expect(
        negative,
        `expected ${HAZARD_TITLES[type]} (${negative}) > ${HAZARD_UPSIDE_TITLES[type]} (${upside})`,
      ).toBeGreaterThan(upside);
    }
  });

  it("negative hazard encounter is rolled before its upside (ordering contract)", () => {
    // Deterministic check (no Monte Carlo): force every Math.random call to
    // succeed (returns 0). The negative entry must always be picked first
    // because hazard encounters are listed negative-before-upside in
    // HAZARD_ENCOUNTERS. If a future edit ever inverts that order, this
    // assertion will catch it without relying on probability.
    for (const type of Object.keys(HAZARD_TITLES) as WeatherZone["type"][]) {
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType(type)]);
        expect(enc).toBeTruthy();
        expect(enc!.title).toBe(HAZARD_TITLES[type]);
        expect(enc!.title).not.toBe(HAZARD_UPSIDE_TITLES[type]);
      } finally {
        randomSpy.mockRestore();
      }
    }
  });

  it("hazard encounter chance scales with the highest matching zone's intensity", () => {
    // Pick a hazard type and compare encounter chances across intensities.
    // High should be strictly greater than medium, which should be strictly
    // greater than low — and crossing nothing should be lower than all.
    const type: WeatherZone["type"] = "radiation_storm";
    const baseChance = getEncounterChance("scout", baseLocation, baseState, []);
    const lowChance = getEncounterChance("scout", baseLocation, baseState, [
      zoneOfTypeIntensity(type, "low"),
    ]);
    const medChance = getEncounterChance("scout", baseLocation, baseState, [
      zoneOfTypeIntensity(type, "medium"),
    ]);
    const highChance = getEncounterChance("scout", baseLocation, baseState, [
      zoneOfTypeIntensity(type, "high"),
    ]);
    expect(lowChance).toBeGreaterThan(baseChance);
    expect(medChance).toBeGreaterThan(lowChance);
    expect(highChance).toBeGreaterThan(medChance);
  });

  it("uses the highest intensity when multiple matching zones are crossed", () => {
    const type: WeatherZone["type"] = "radiation_storm";
    const lowOnly = getEncounterChance("scout", baseLocation, baseState, [
      zoneOfTypeIntensity(type, "low"),
    ]);
    const lowPlusHigh = getEncounterChance("scout", baseLocation, baseState, [
      zoneOfTypeIntensity(type, "low"),
      zoneOfTypeIntensity(type, "high"),
    ]);
    const highOnly = getEncounterChance("scout", baseLocation, baseState, [
      zoneOfTypeIntensity(type, "high"),
    ]);
    // Adding a high zone alongside a low one should bring chance up to (or
    // very close to) the high-only chance — not stay near the low one.
    expect(lowPlusHigh).toBeGreaterThan(lowOnly);
    expect(lowPlusHigh).toBeGreaterThanOrEqual(highOnly);
  });

  it("hazard effect magnitudes scale with intensity", () => {
    // Force every random call to 0 so the negative hazard fires on the very
    // first roll. Compare credit losses for low vs high intensity zones of
    // the same hazard type — high should hit harder.
    const type: WeatherZone["type"] = "radiation_storm";
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const lowEnc = rollEncounter("scout", baseLocation, baseState, [
        zoneOfTypeIntensity(type, "low"),
      ]);
      const highEnc = rollEncounter("scout", baseLocation, baseState, [
        zoneOfTypeIntensity(type, "high"),
      ]);
      expect(lowEnc).toBeTruthy();
      expect(highEnc).toBeTruthy();
      expect(lowEnc!.title).toBe(HAZARD_TITLES[type]);
      expect(highEnc!.title).toBe(HAZARD_TITLES[type]);
      const lowLoss = Math.abs(lowEnc!.effects.creditsDelta ?? 0);
      const highLoss = Math.abs(highEnc!.effects.creditsDelta ?? 0);
      expect(highLoss).toBeGreaterThan(lowLoss);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("low-intensity hazards fire less often than high-intensity ones over many trials", () => {
    // Monte Carlo sanity check: across many runs, the signature negative
    // event should fire materially more often when crossing a high-intensity
    // zone than a low-intensity one of the same hazard type.
    const type: WeatherZone["type"] = "radiation_storm";
    let lowHits = 0;
    let highHits = 0;
    const trials = 1500;
    for (let i = 0; i < trials; i++) {
      const lo = rollEncounter("scout", baseLocation, baseState, [
        zoneOfTypeIntensity(type, "low"),
      ]);
      if (lo && lo.title === HAZARD_TITLES[type]) lowHits += 1;
      const hi = rollEncounter("scout", baseLocation, baseState, [
        zoneOfTypeIntensity(type, "high"),
      ]);
      if (hi && hi.title === HAZARD_TITLES[type]) highHits += 1;
    }
    expect(highHits).toBeGreaterThan(lowHits);
  });

  it("upside fires when the negative misses but the upside passes (deterministic)", () => {
    // Drive RNG with a scripted sequence: first roll (negative) fails, second
    // roll (upside) succeeds. This proves the upside is reachable through the
    // intended path without depending on real RNG.
    for (const type of Object.keys(HAZARD_UPSIDE_TITLES) as WeatherZone["type"][]) {
      const seq = [0.99, 0]; // miss negative, hit upside
      let i = 0;
      randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
        const v = seq[Math.min(i, seq.length - 1)];
        i += 1;
        return v;
      });
      try {
        const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType(type)]);
        expect(enc, `expected upside for ${type}`).toBeTruthy();
        expect(enc!.title).toBe(HAZARD_UPSIDE_TITLES[type]);
        expect(enc!.severity).toBe("positive");
      } finally {
        randomSpy.mockRestore();
      }
    }
  });

  it("hazard-typed outcomes carry hazardType; generic outcomes do not", () => {
    // Force the negative hazard branch on an electromagnetic zone.
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const enc = rollEncounter("scout", baseLocation, baseState, [zoneOfType("electromagnetic")]);
      expect(enc, "expected hazard fire on rng=0").toBeTruthy();
      expect(enc!.hazardType).toBe("electromagnetic");
    } finally {
      randomSpy.mockRestore();
    }
    // Generic encounter (no zones) — no hazardType should be set on the
    // outcome, so callers can distinguish weather-feed entries.
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const enc = rollEncounter("scout", baseLocation, baseState, []);
      if (enc) expect(enc.hazardType).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
    }
  });
});
