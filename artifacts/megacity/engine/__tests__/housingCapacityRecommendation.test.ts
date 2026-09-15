import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getBestBuildableHousingCapacityOption,
  getHousingCapacityRecommendationBlocker,
  getHousingCapacityRecommendationShortfall,
  HOUSING_CAPACITY_BUILDINGS,
} from "@/engine/housingCapacity";

const constructionSource = readFileSync(
  resolve(process.cwd(), "app/(game)/construction.tsx"),
  "utf8",
);

describe("housing capacity build recommendation", () => {
  it("chooses the highest-impact affordable permanent option", () => {
    expect(
      getBestBuildableHousingCapacityOption({
        credits: 70_000,
        steel: 150,
      }),
    ).toMatchObject({
      key: "highDensityResidentialPlatforms",
      kind: "permanent",
      perBuilding: 12_000,
    });
  });

  it("skips unaffordable high-impact options and picks the best remaining build", () => {
    expect(
      getBestBuildableHousingCapacityOption({
        credits: 35_000,
        steel: 60,
      }),
    ).toMatchObject({
      key: "microApartmentHives",
      kind: "permanent",
      perBuilding: 4_000,
    });
  });

  it("does not recommend a build when the timed-order queue is full", () => {
    expect(
      getBestBuildableHousingCapacityOption({
        credits: 100_000,
        steel: 200,
        availableQueueSlots: 0,
      }),
    ).toBeNull();
  });

  it("explains when credits are the limiting resource", () => {
    expect(
      getHousingCapacityRecommendationBlocker({
        credits: 12_999,
        steel: 1_000,
      }),
    ).toContain("more credits are required");
  });

  it("reports the exact credit shortfall for the cheapest catalog option", () => {
    expect(
      getHousingCapacityRecommendationShortfall({
        credits: 12_999,
        steel: 1_000,
      }),
    ).toMatchObject({
      option: { key: "microApartmentHives" },
      credits: 1,
      steel: 0,
    });
  });

  it("explains when steel is the limiting resource", () => {
    expect(
      getHousingCapacityRecommendationBlocker({
        credits: 1_000_000,
        steel: 19,
      }),
    ).toContain("more steel is required");
  });

  it("reports the exact steel shortfall without implying credits are missing", () => {
    expect(
      getHousingCapacityRecommendationShortfall({
        credits: 1_000_000,
        steel: 19,
      }),
    ).toMatchObject({
      option: { key: "microApartmentHives" },
      credits: 0,
      steel: 1,
    });
  });

  it("names both resources when neither can cover any catalog option", () => {
    expect(
      getHousingCapacityRecommendationBlocker({
        credits: 0,
        steel: 0,
      }),
    ).toContain("more credits and steel are required");
  });

  it("reports both shortfalls from the same cheapest catalog option", () => {
    expect(
      getHousingCapacityRecommendationShortfall({
        credits: 0,
        steel: 0,
      }),
    ).toMatchObject({
      option: { key: "microApartmentHives" },
      credits: 13_000,
      steel: 20,
    });
  });

  it("explains when the timed-order queue is the blocker", () => {
    expect(
      getHousingCapacityRecommendationBlocker({
        credits: 1_000_000,
        steel: 1_000,
        availableQueueSlots: 0,
      }),
    ).toContain("timed-order queue is full");
  });

  it("does not report a resource shortfall when the timed-order queue is full", () => {
    expect(
      getHousingCapacityRecommendationShortfall({
        credits: 0,
        steel: 0,
        availableQueueSlots: 0,
      }),
    ).toBeNull();
  });

  it("keeps construction cards on the same key, label, and price catalog", () => {
    expect(constructionSource).toContain("HOUSING_CAPACITY_BUILDINGS.map");
    expect(constructionSource).toContain(
      "({ key, label, description, cost, steelCost, effect })",
    );

    for (const building of HOUSING_CAPACITY_BUILDINGS) {
      expect(
        constructionSource,
        `${building.key} must not have an inline construction definition`,
      ).not.toMatch(new RegExp(`key:\\s*["']${building.key}["']`));
    }
  });

  it("keeps the capacity catalog unique and complete", () => {
    const keys = HOUSING_CAPACITY_BUILDINGS.map((building) => building.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(HOUSING_CAPACITY_BUILDINGS).toHaveLength(14);

    for (const building of HOUSING_CAPACITY_BUILDINGS) {
      expect(building.label).not.toBe("");
      expect(building.cost).toBeGreaterThan(0);
      expect(building.steelCost).toBeGreaterThanOrEqual(0);
      expect(building.perBuilding).toBeGreaterThan(0);
    }
  });
});