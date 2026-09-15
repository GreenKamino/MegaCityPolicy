import { describe, expect, it } from "vitest";

import {
  WEATHER_ZONES,
  WEATHER_TYPE_EFFECTS,
  WEATHER_INTENSITY_MULT,
  DEFAULT_SEASON_PROFILES,
  computeWeatherTravelEffect,
  getWeatherZonesOnPath,
  pointInWeatherZone,
  getZoneSeasonState,
  isZoneActive,
  type WeatherZone,
} from "@/engine/worldMapData";
import { getSeason, type Season } from "@/engine/weather";

describe("weather zones", () => {
  it("seeds at least one zone of every hazard type", () => {
    const types = new Set(WEATHER_ZONES.map((z) => z.type));
    expect(types.has("radiation_storm")).toBe(true);
    expect(types.has("dust_cloud")).toBe(true);
    expect(types.has("acid_rain")).toBe(true);
    expect(types.has("electromagnetic")).toBe(true);
    expect(types.has("ashfall")).toBe(true);
    expect(types.has("toxic_fog")).toBe(true);
  });

  it("uses unique zone ids", () => {
    const ids = WEATHER_ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pointInWeatherZone respects ellipse bounds", () => {
    const zone = WEATHER_ZONES[0];
    expect(pointInWeatherZone(zone.cx, zone.cy, zone)).toBe(true);
    expect(pointInWeatherZone(zone.cx + zone.rx + 1, zone.cy, zone)).toBe(false);
    expect(pointInWeatherZone(zone.cx, zone.cy + zone.ry + 1, zone)).toBe(false);
  });

  it("returns no zones when path stays outside hazards", () => {
    const zones = getWeatherZonesOnPath(0, 0, 5, 5);
    expect(zones.length).toBe(0);
  });

  it("returns the crossed zone when path passes through it", () => {
    const zone = WEATHER_ZONES[0];
    const x1 = zone.cx - zone.rx * 1.5;
    const x2 = zone.cx + zone.rx * 1.5;
    const zones = getWeatherZonesOnPath(x1, zone.cy, x2, zone.cy);
    const ids = zones.map((z) => z.id);
    expect(ids).toContain(zone.id);
  });

  it("scales total drains by intensity multiplier", () => {
    const lowZone = WEATHER_ZONES.find((z) => z.intensity === "low");
    const highZone = WEATHER_ZONES.find((z) => z.intensity === "high");
    expect(lowZone).toBeTruthy();
    expect(highZone).toBeTruthy();
    if (!lowZone || !highZone) return;

    const lowEff = computeWeatherTravelEffect([lowZone]);
    const lowBase = WEATHER_TYPE_EFFECTS[lowZone.type];
    expect(lowEff.creditsDrain).toBe(lowBase.creditsDrain * WEATHER_INTENSITY_MULT.low);
    expect(lowEff.foodDrain).toBe(lowBase.foodDrain * WEATHER_INTENSITY_MULT.low);

    const highEff = computeWeatherTravelEffect([highZone]);
    const highBase = WEATHER_TYPE_EFFECTS[highZone.type];
    expect(highEff.creditsDrain).toBe(highBase.creditsDrain * WEATHER_INTENSITY_MULT.high);
  });

  it("stacks multiple zones additively but caps each penalty", () => {
    const eff = computeWeatherTravelEffect(WEATHER_ZONES);
    expect(eff.creditsDrain).toBeGreaterThan(0);
    expect(eff.encounterChanceBoost).toBeGreaterThan(0);
    expect(eff.encounterChanceBoost).toBeLessThanOrEqual(0.6);
    expect(eff.raidSuccessPenalty).toBeLessThanOrEqual(0.55);
    expect(eff.scoutIntelPenalty).toBeLessThanOrEqual(0.85);
    expect(eff.tradeRevenuePenalty).toBeLessThanOrEqual(0.65);
    expect(eff.summaryLines.length).toBe(WEATHER_ZONES.length);
  });

  it("returns a clean zero effect for an empty zone list", () => {
    const eff = computeWeatherTravelEffect([]);
    expect(eff.creditsDrain).toBe(0);
    expect(eff.ammoDrain).toBe(0);
    expect(eff.foodDrain).toBe(0);
    expect(eff.encounterChanceBoost).toBe(0);
    expect(eff.summaryLines.length).toBe(0);
  });
});

describe("weather zone seasonal drift", () => {
  const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

  it("getSeason maps months to the four seasons", () => {
    expect(getSeason(3)).toBe("spring");
    expect(getSeason(7)).toBe("summer");
    expect(getSeason(10)).toBe("autumn");
    expect(getSeason(1)).toBe("winter");
    expect(getSeason(12)).toBe("winter");
  });

  it("authored zones expose a season profile covering every season", () => {
    for (const zone of WEATHER_ZONES) {
      expect(zone.seasonProfile, `${zone.id} should have a season profile`).toBeTruthy();
      for (const season of SEASONS) {
        expect(zone.seasonProfile?.[season], `${zone.id} missing ${season}`).toBeTruthy();
      }
    }
  });

  it("getZoneSeasonState falls back to static intensity when no season is given", () => {
    for (const zone of WEATHER_ZONES) {
      expect(getZoneSeasonState(zone)).toBe(zone.intensity);
    }
  });

  it("getZoneSeasonState honors per-zone seasonProfile overrides", () => {
    const dustBowl = WEATHER_ZONES.find((z) => z.id === "wz-dustbowl")!;
    expect(getZoneSeasonState(dustBowl, "summer")).toBe("high");
    expect(getZoneSeasonState(dustBowl, "winter")).toBe("dormant");
  });

  it("getZoneSeasonState falls back to DEFAULT_SEASON_PROFILES when seasonProfile is omitted", () => {
    const synthetic: WeatherZone = {
      id: "wz-test-default",
      cx: 0, cy: 0, rx: 1, ry: 1,
      type: "dust_cloud",
      intensity: "low",
      label: "Test",
    };
    expect(getZoneSeasonState(synthetic, "summer")).toBe(DEFAULT_SEASON_PROFILES.dust_cloud.summer);
    expect(getZoneSeasonState(synthetic, "winter")).toBe(DEFAULT_SEASON_PROFILES.dust_cloud.winter);
  });

  it("isZoneActive flips false only when the season state is dormant", () => {
    const dustBowl = WEATHER_ZONES.find((z) => z.id === "wz-dustbowl")!;
    expect(isZoneActive(dustBowl, "summer")).toBe(true);
    expect(isZoneActive(dustBowl, "winter")).toBe(false);
  });

  it("dust_cloud peaks in summer and goes dormant in winter (gameplay feel check)", () => {
    const dustBowl = WEATHER_ZONES.find((z) => z.id === "wz-dustbowl")!;
    const summerEff = computeWeatherTravelEffect([dustBowl], "summer");
    const winterEff = computeWeatherTravelEffect([dustBowl], "winter");
    expect(summerEff.creditsDrain).toBeGreaterThan(0);
    // Dormant zones contribute zero drain even when in the supplied list.
    expect(winterEff.creditsDrain).toBe(0);
    expect(winterEff.foodDrain).toBe(0);
    expect(winterEff.summaryLines.length).toBe(0);
  });

  it("getWeatherZonesOnPath skips dormant zones when a season is supplied", () => {
    const dustBowl = WEATHER_ZONES.find((z) => z.id === "wz-dustbowl")!;
    const x1 = dustBowl.cx - dustBowl.rx * 1.5;
    const x2 = dustBowl.cx + dustBowl.rx * 1.5;
    const winter = getWeatherZonesOnPath(x1, dustBowl.cy, x2, dustBowl.cy, 12, "winter");
    const summer = getWeatherZonesOnPath(x1, dustBowl.cy, x2, dustBowl.cy, 12, "summer");
    const noSeason = getWeatherZonesOnPath(x1, dustBowl.cy, x2, dustBowl.cy);
    expect(noSeason.map((z) => z.id)).toContain(dustBowl.id);
    expect(summer.map((z) => z.id)).toContain(dustBowl.id);
    expect(winter.map((z) => z.id)).not.toContain(dustBowl.id);
  });

  it("season-aware drains scale with the season's intensity", () => {
    // Sonora hot patch: summer=high (mult 3), spring=low (mult 1)
    const sonora = WEATHER_ZONES.find((z) => z.id === "wz-southwest-rad")!;
    const summerEff = computeWeatherTravelEffect([sonora], "summer");
    const springEff = computeWeatherTravelEffect([sonora], "spring");
    const base = WEATHER_TYPE_EFFECTS[sonora.type];
    expect(summerEff.creditsDrain).toBe(base.creditsDrain * WEATHER_INTENSITY_MULT.high);
    expect(springEff.creditsDrain).toBe(base.creditsDrain * WEATHER_INTENSITY_MULT.low);
    expect(summerEff.creditsDrain).toBeGreaterThan(springEff.creditsDrain);
  });

  it("seasonal zones differ across the calendar while persistent hazards stay persistent", () => {
    let drifted = 0;
    for (const zone of WEATHER_ZONES) {
      const states = new Set(SEASONS.map((s) => getZoneSeasonState(zone, s)));
      if (states.size > 1) drifted++;
    }
    // Yellowstone is an authored permanent exclusion hazard rather than a
    // seasonal weather system; every other zone has a varying profile.
    const persistent = WEATHER_ZONES.filter((zone) =>
      SEASONS.every((season) => getZoneSeasonState(zone, season) === zone.intensity),
    );
    expect(persistent.map((zone) => zone.id)).toEqual(["wz-yellowstone-ash"]);
    expect(drifted).toBe(WEATHER_ZONES.length - persistent.length);
  });
});
