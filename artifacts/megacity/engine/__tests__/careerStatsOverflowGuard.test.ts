// Regression test for the cross-game CareerStats overflow guard.
//
// CareerStats lives on PlayerProfile and accumulates across *every* city
// the player runs (citiesRun, totalCreditsEarned, totalCriminalsSentenced,
// totalContractsCompleted, totalDecisions, totalPopulationGoverned, ...).
// Unlike the per-game lifetime counters (clamped by `sanitizeState`), these
// have no save-load sanitizer of their own, so over a Steam-launch lifetime
// an unbounded `Math.max`/`+1` tally — or a corrupted profile blob — could
// drift toward Number.MAX_SAFE_INTEGER and render as scientific notation in
// the career/profile UI.
//
// `sanitizeCareerStats` (called on every profile load and persist) now
// floors each field at 0 and caps it at MAX_RESOURCE (1e14), the same
// ceiling the per-game counters use. These tests pin that guard.

import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStore = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: async (k: string, v: string) => { memoryStore.set(k, v); },
    removeItem: async (k: string) => { memoryStore.delete(k); },
    multiSet: async (pairs: [string, string][]) => { for (const [k, v] of pairs) memoryStore.set(k, v); },
    multiRemove: async (keys: string[]) => { for (const k of keys) memoryStore.delete(k); },
    clear: async () => { memoryStore.clear(); },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

import { sanitizeCareerStats, loadProfile, profileKey, createDefaultProfile } from "@/engine/profiles";
import type { CareerStats } from "@/engine/types";

const MAX_RESOURCE_T = 100_000_000_000_000;

beforeEach(() => {
  memoryStore.clear();
});

describe("career-stats overflow guard (cross-game tallies)", () => {
  it("caps every absurd CareerStats tally at MAX_RESOURCE", () => {
    const corrupt: CareerStats = {
      citiesRun: 1e30,
      totalPlayTime: 1e30,
      totalTicksAllCities: 1e30,
      totalPopulationGoverned: 1e30,
      totalCreditsEarned: Number.POSITIVE_INFINITY,
      totalCriminalsSentenced: 1e30,
      totalRiotsQuelled: 1e30,
      totalContractsCompleted: 1e30,
      totalDecisions: 1e30,
      highestPopulation: 1e30,
      longestCityTicks: 1e30,
      totalOfficersAppointed: 1e30,
      totalFactionWars: 1e30,
      totalResearchCompleted: 1e30,
      totalBuildingsConstructed: 1e30,
      totalMissionsCompleted: 1e30,
    };
    const clean = sanitizeCareerStats(corrupt);
    for (const v of Object.values(clean)) {
      expect(v).toBeLessThanOrEqual(MAX_RESOURCE_T);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("strips NaN/negative tallies to 0 and leaves legitimate values alone", () => {
    const corrupt = {
      citiesRun: NaN,
      totalCreditsEarned: -1e30,
      totalDecisions: 1234,
      totalContractsCompleted: 12,
    } as unknown as CareerStats;
    const clean = sanitizeCareerStats(corrupt);
    expect(clean.citiesRun).toBe(0);
    expect(clean.totalCreditsEarned).toBe(0);
    // Legitimate mid-game values pass through untouched.
    expect(clean.totalDecisions).toBe(1234);
    expect(clean.totalContractsCompleted).toBe(12);
  });

  it("returns sane defaults when career stats are missing/garbage", () => {
    const clean = sanitizeCareerStats(undefined);
    expect(clean.citiesRun).toBe(0);
    expect(clean.totalCreditsEarned).toBe(0);
    expect(Number.isFinite(clean.totalPopulationGoverned)).toBe(true);
  });

  it("clamps the career stats of a corrupted profile on load", async () => {
    const profile = createDefaultProfile("Marshal", 40, "other");
    profile.careerStats.totalCreditsEarned = 1e30;
    profile.careerStats.totalCriminalsSentenced = Number.POSITIVE_INFINITY;
    // Write the corrupted blob directly, bypassing saveProfile's sanitizer.
    memoryStore.set(profileKey(profile.id), JSON.stringify(profile));

    const loaded = await loadProfile(profile.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.careerStats.totalCreditsEarned).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(loaded!.careerStats.totalCriminalsSentenced).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(loaded!.careerStats.totalCriminalsSentenced)).toBe(true);
  });
});
