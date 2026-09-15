import { describe, expect, it } from "vitest";

import {
  generatePeriodicMessage,
  generateSeasonPeakAnnouncement,
  generateSeasonForecast,
} from "@/engine/inboxFlavor";
import { createInitialState } from "@/engine/initialState";
import { WEATHER_ZONES, getZoneSeasonState } from "@/engine/worldMapData";
import { getSeason, getSeasonLabel, nextSeason, type Season } from "@/engine/weather";

function stateAt(month: number, day: number, hour: number) {
  const s = createInitialState();
  s.gameDate = { year: 2200, month, day, hour };
  return s;
}

describe("seasonal dispatch — peak announcement", () => {
  it("lists every zone at peak intensity for the current season", () => {
    const s = stateAt(6, 1, 6); // summer start
    const msg = generateSeasonPeakAnnouncement(s);
    expect(msg).not.toBeNull();
    const summerPeaks = WEATHER_ZONES.filter((z) => getZoneSeasonState(z, "summer") === "high");
    expect(summerPeaks.length).toBeGreaterThan(0);
    for (const z of summerPeaks) {
      expect(msg!.body).toContain(z.label.toUpperCase());
    }
    expect(msg!.title).toContain("SUMMER");
    expect(msg!.priority).toBe("high");
  });

  it("uses a deterministic id keyed to season+year (no Date.now drift)", () => {
    const a = generateSeasonPeakAnnouncement(stateAt(3, 1, 6));
    const b = generateSeasonPeakAnnouncement(stateAt(3, 1, 6));
    expect(a!.id).toBe(b!.id);
    expect(a!.id).toMatch(/^season-peak-spring-2200$/);
  });

  it("returns a real announcement for every season (every season has a peak somewhere)", () => {
    const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
    const startMonths: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };
    for (const season of seasons) {
      const msg = generateSeasonPeakAnnouncement(stateAt(startMonths[season], 1, 6));
      expect(msg, `season ${season}`).not.toBeNull();
      expect(msg!.title).toContain(getSeasonLabel(season));
    }
  });
});

describe("seasonal dispatch — next-season forecast", () => {
  it("forecasts summer from the end of spring", () => {
    const s = stateAt(5, 25, 18);
    const msg = generateSeasonForecast(s);
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("SUMMER");
    // Dust Bowl: spring=medium, summer=high → must appear in expected peaks.
    expect(msg!.body).toContain("PLAINS DUST BOWL");
  });

  it("calls out zones going dormant", () => {
    // End of summer → autumn; Sonora hot patch summer=high, autumn=medium
    // (not dormant), so look at end of autumn → winter:
    // Yucatan Spore Fog autumn=medium → winter=dormant.
    const msg = generateSeasonForecast(stateAt(11, 25, 18));
    expect(msg).not.toBeNull();
    expect(msg!.body).toContain("GOING QUIET");
    expect(msg!.body).toContain("YUCATAN SPORE FOG");
  });

  it("calls out zones waking from dormant", () => {
    // End of winter → spring; Plains Dust Bowl winter=dormant → spring=medium.
    const msg = generateSeasonForecast(stateAt(2, 25, 18));
    expect(msg).not.toBeNull();
    expect(msg!.body).toContain("WAKING");
    expect(msg!.body).toContain("PLAINS DUST BOWL");
  });

  it("uses a deterministic id keyed to next-season+year", () => {
    const m = generateSeasonForecast(stateAt(5, 25, 18));
    expect(m!.id).toBe("season-forecast-summer-2200");
  });
});

describe("generatePeriodicMessage seasonal slots", () => {
  it("fires the peak announcement on month 3, day 1, hour 6", () => {
    const msg = generatePeriodicMessage(stateAt(3, 1, 6));
    expect(msg).not.toBeNull();
    expect(msg!.id).toMatch(/^season-peak-spring-/);
  });

  it("fires the forecast on month 5, day 25, hour 18", () => {
    const msg = generatePeriodicMessage(stateAt(5, 25, 18));
    expect(msg).not.toBeNull();
    expect(msg!.id).toMatch(/^season-forecast-summer-/);
  });

  it("does not fire seasonal dispatch on a non-matching tick", () => {
    // Month 4 day 10 hour 6 is mid-spring, doesn't match either gate.
    // We can only assert it's not a season-peak/forecast message.
    const msg = generatePeriodicMessage(stateAt(4, 10, 6));
    if (msg !== null) {
      expect(msg.id).not.toMatch(/^season-(peak|forecast)/);
    }
  });

  it("fires peak announcement for all four season starts", () => {
    const checks: [number, Season][] = [[3, "spring"], [6, "summer"], [9, "autumn"], [12, "winter"]];
    for (const [month, season] of checks) {
      const msg = generatePeriodicMessage(stateAt(month, 1, 6));
      expect(msg, `season ${season}`).not.toBeNull();
      expect(msg!.id).toBe(`season-peak-${season}-2200`);
    }
  });

  it("uses getSeason consistently with the announcement gate", () => {
    // Sanity: months 3/6/9/12 are the boundaries in getSeason.
    expect(getSeason(3)).toBe("spring");
    expect(getSeason(6)).toBe("summer");
    expect(getSeason(9)).toBe("autumn");
    expect(getSeason(12)).toBe("winter");
  });

  it("nextSeason cycles spring → summer → autumn → winter → spring (task #97)", () => {
    // The worldmap operations panel forecast box and the inboxFlavor
    // forecast generator both read from this helper; getting the cycle
    // wrong would silently mis-label every forecast.
    expect(nextSeason("spring")).toBe("summer");
    expect(nextSeason("summer")).toBe("autumn");
    expect(nextSeason("autumn")).toBe("winter");
    expect(nextSeason("winter")).toBe("spring");
  });
});

describe("route forecast computation (task #97)", () => {
  // The worldmap operations panel computes per-route forecast deltas using
  // the same getZoneSeasonState + nextSeason pair as the inbox generator.
  // This locks in the "filter to zones whose state changes" contract so a
  // future refactor doesn't silently drop a transition type from the panel.
  function diff(zones: ReadonlyArray<Parameters<typeof getZoneSeasonState>[0]>, cur: Season) {
    const nxt = nextSeason(cur);
    return zones
      .map((z) => ({
        id: z.id,
        from: getZoneSeasonState(z, cur),
        to: getZoneSeasonState(z, nxt),
      }))
      .filter((c) => c.from !== c.to);
  }

  it("surfaces zones waking from dormant next season (the main planning win)", () => {
    const z = {
      id: "wz-test-wake",
      cx: 0, cy: 0, rx: 1, ry: 1,
      type: "dust_cloud" as const,
      intensity: "medium" as const,
      label: "TEST WAKE",
      seasonProfile: { spring: "dormant", summer: "high", autumn: "medium", winter: "dormant" } as Record<Season, "dormant" | "low" | "medium" | "high">,
    };
    const out = diff([z], "spring");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "wz-test-wake", from: "dormant", to: "high" });
  });

  it("surfaces zones going dormant next season (the convoy-delay use case)", () => {
    const z = {
      id: "wz-test-quiet",
      cx: 0, cy: 0, rx: 1, ry: 1,
      type: "dust_cloud" as const,
      intensity: "medium" as const,
      label: "TEST QUIET",
      seasonProfile: { spring: "high", summer: "dormant", autumn: "dormant", winter: "low" } as Record<Season, "dormant" | "low" | "medium" | "high">,
    };
    const out = diff([z], "spring");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "wz-test-quiet", from: "high", to: "dormant" });
  });

  it("surfaces intensity shifts even when the zone stays active both seasons", () => {
    const z = {
      id: "wz-test-shift",
      cx: 0, cy: 0, rx: 1, ry: 1,
      type: "dust_cloud" as const,
      intensity: "medium" as const,
      label: "TEST SHIFT",
      seasonProfile: { spring: "low", summer: "high", autumn: "medium", winter: "low" } as Record<Season, "dormant" | "low" | "medium" | "high">,
    };
    const out = diff([z], "spring");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "wz-test-shift", from: "low", to: "high" });
  });

  it("filters out zones whose state does not change next season", () => {
    const stable = {
      id: "wz-test-stable",
      cx: 0, cy: 0, rx: 1, ry: 1,
      type: "dust_cloud" as const,
      intensity: "medium" as const,
      label: "STABLE",
      seasonProfile: { spring: "medium", summer: "medium", autumn: "medium", winter: "medium" } as Record<Season, "dormant" | "low" | "medium" | "high">,
    };
    const out = diff([stable], "spring");
    expect(out).toHaveLength(0);
  });

  it("the live WEATHER_ZONES table contains at least one zone of each transition type across the year", () => {
    // Sanity check: confirms the authored season profiles actually exercise
    // wake / quiet / intensity-shift transitions somewhere in the cycle, so
    // the forecast UI has real data to surface during normal play.
    let sawWake = false, sawQuiet = false, sawShift = false;
    const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
    for (const cur of seasons) {
      for (const c of diff(WEATHER_ZONES, cur)) {
        if (c.from === "dormant" && c.to !== "dormant") sawWake = true;
        else if (c.from !== "dormant" && c.to === "dormant") sawQuiet = true;
        else if (c.from !== "dormant" && c.to !== "dormant") sawShift = true;
      }
    }
    expect(sawWake, "no wake transitions in WEATHER_ZONES").toBe(true);
    expect(sawQuiet, "no quiet transitions in WEATHER_ZONES").toBe(true);
    expect(sawShift, "no intensity shifts in WEATHER_ZONES").toBe(true);
  });
});

describe("seasonal dispatch — edge cases", () => {
  it("respects DEFAULT_SEASON_PROFILES for zones without an authored seasonProfile", () => {
    // Synthetic zone with no seasonProfile — should fall back to the default
    // for "dust_cloud" (summer=high). getZoneSeasonState handles this; we
    // verify by direct inspection so the contract is locked in.
    const synthetic = {
      id: "wz-synth-test",
      cx: 0, cy: 0, rx: 1, ry: 1,
      type: "dust_cloud" as const,
      intensity: "medium" as const,
      label: "Synthetic Test Zone",
      // intentionally no seasonProfile
    };
    expect(getZoneSeasonState(synthetic, "summer")).toBe("high");
    expect(getZoneSeasonState(synthetic, "winter")).toBe("dormant");
  });

  it("Nov 25 forecast targets winter of the same year (year rollover stays clean)", () => {
    const m = generateSeasonForecast(stateAt(11, 25, 18));
    expect(m).not.toBeNull();
    // Forecast is fired in autumn (year 2200) about winter; the next-season
    // label is winter and the id is keyed to 2200, even though the winter
    // months will partially span into the next calendar year. This locks
    // intent: identity follows the firing year, not the forecasted season's
    // chronological year.
    expect(m!.id).toBe("season-forecast-winter-2200");
    expect(m!.title).toContain("WINTER");
  });
});
