import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resourceDisplayName,
  humanizeBuildingKey,
  getBuildingRecipes,
  hasProduction,
  getInstallationProduction,
  getProducers,
  getConsumers,
  getProducerStaffing,
  getConsumerDemand,
  getLiveBuildingCount,
  getDefinitionPreviewStaffing,
  listChainResources,
} from "@/engine/productionInfo";

const productionChainsScreenSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/(game)/production-chains.tsx"),
  "utf8",
);

describe("productionInfo — display names", () => {
  it("resolves commodity ids to their catalogue name", () => {
    expect(resourceDisplayName("iron_ore")).toBe("Iron Ore");
    expect(resourceDisplayName("steel_ingot")).toBe("Steel Ingot");
  });

  it("labels top-level military resources distinctly from commodities", () => {
    expect(resourceDisplayName("ammo")).toBe("Ammunition (Army)");
    expect(resourceDisplayName("vehicleParts")).toBe("Vehicle Parts");
  });

  it("clarifies that military rations use the shared Food pool", () => {
    expect(resourceDisplayName("rations")).toBe("Rations (Food pool)");
  });

  it("falls back to humanized id for unknown ids", () => {
    expect(resourceDisplayName("some_unknown_thing")).toBe("Some Unknown Thing");
  });

  it("humanizes camelCase building keys", () => {
    expect(humanizeBuildingKey("ammunitionPressLines")).toBe("Ammunition Press Lines");
    expect(humanizeBuildingKey("metalFoundryComplexes")).toBe("Metal Foundry Complexes");
  });
});

describe("productionInfo — civilian recipes (System C)", () => {
  it("exposes the ammunition-pressing recipe on the press-line building", () => {
    const recipes = getBuildingRecipes("ammunitionPressLines");
    const pressing = recipes.find((r) => r.id === "ammunition_pressing");
    expect(pressing).toBeDefined();
    const inputIds = pressing!.inputs.map((i) => i.id);
    expect(inputIds).toContain("steel_ingot");
    expect(inputIds).toContain("copper_ingot");
    const outputIds = pressing!.outputs.map((o) => o.id);
    expect(outputIds).toContain("ammunition_crate");
  });

  it("hasProduction is true for a producing building and false for a purely-decorative key", () => {
    expect(hasProduction("ammunitionPressLines")).toBe(true);
    expect(hasProduction("not_a_real_building_key")).toBe(false);
  });

  it("a building can run multiple recipes", () => {
    // Metal foundry mines iron/copper AND smelts steel.
    const recipes = getBuildingRecipes("metalFoundryComplexes");
    expect(recipes.length).toBeGreaterThan(1);
  });

  it("exposes the worker pool that scales each civilian producer's output", () => {
    const producer = getProducers("iron_ore").find(
      (p) => p.buildingKey === "metalFoundryComplexes",
    );
    expect(producer?.workersKey).toBe("miningCrews");
    expect(producer?.workersName).toBe("Mining Crews");
  });

  it("reads current staffing and caps the effective output multiplier", () => {
    const producer = getProducers("iron_ore").find(
      (p) => p.buildingKey === "metalFoundryComplexes",
    );
    expect(getProducerStaffing(producer!, { miningCrews: 7 }, { metalFoundryComplexes: 1 })).toMatchObject({
      workerCount: 7,
      workersName: "Mining Crews",
      outputQty: 24,
      buildingCount: 1,
      totalOutputQty: 24,
    });
    expect(getProducerStaffing(producer!, { miningCrews: 7 })?.multiplier).toBeCloseTo(1.2);
    expect(getProducerStaffing(producer!, { miningCrews: 30 }, { metalFoundryComplexes: 1 })?.multiplier).toBe(2);
    expect(getProducerStaffing(producer!, { miningCrews: 30 }, { metalFoundryComplexes: 1 })?.outputQty).toBe(40);
  });

  it("scales staffed throughput across every constructed copy", () => {
    const producer = getProducers("iron_ore").find(
      (p) => p.buildingKey === "metalFoundryComplexes",
    );
    expect(
      getProducerStaffing(producer!, { miningCrews: 7 }, { metalFoundryComplexes: 3 }),
    ).toMatchObject({
      outputQty: 24,
      buildingCount: 3,
      totalOutputQty: 72,
    });
  });

  it("reports no aggregate throughput when no producer buildings are active", () => {
    const producer = getProducers("iron_ore").find(
      (p) => p.buildingKey === "metalFoundryComplexes",
    );
    expect(
      getProducerStaffing(producer!, { miningCrews: 7 }, { metalFoundryComplexes: 0 }),
    ).toMatchObject({
      buildingCount: 0,
      totalOutputQty: 0,
    });
  });

  it("treats an omitted live building key as zero output", () => {
    const producer = getProducers("iron_ore").find(
      (p) => p.buildingKey === "metalFoundryComplexes",
    );
    expect(getProducerStaffing(producer!, { miningCrews: 7 }, {})).toMatchObject({
      buildingCount: 0,
      totalOutputQty: 0,
    });
    expect(getProducerStaffing(producer!, { miningCrews: 7 })).toMatchObject({
      buildingCount: 0,
      totalOutputQty: 0,
    });
  });

  it("keeps the one-building estimate explicit for definition previews", () => {
    const producer = getProducers("iron_ore").find(
      (p) => p.buildingKey === "metalFoundryComplexes",
    );
    expect(getDefinitionPreviewStaffing(producer!, { miningCrews: 7 })).toMatchObject({
      buildingCount: 1,
      totalOutputQty: 24,
    });
  });

  it("does not require staffing data for workerless recipes", () => {
    const producer = getProducers("copper_ingot").find(
      (p) => p.recipeName === "Copper Refining",
    );
    expect(getProducerStaffing(producer!, {})).toBeUndefined();
  });
});

describe("productionInfo — military installations (System A)", () => {
  it("exposes ammunition factory output and manning requirement", () => {
    const prod = getInstallationProduction("ammunition_factory");
    expect(prod).toBeDefined();
    expect(prod!.gatedByManning).toBe(true);
    expect(prod!.personnel).toBe(120);
    const ammo = prod!.outputs.find((o) => o.id === "ammo");
    expect(ammo?.qty).toBe(60);
  });

  it("returns undefined for an installation that produces no supply", () => {
    expect(getInstallationProduction("radar_installation")).toBeUndefined();
  });
});

describe("productionInfo — two ammo economies stay separate", () => {
  it("army ammo (resources.ammo) comes only from military installations", () => {
    const producers = getProducers("ammo");
    expect(producers.length).toBeGreaterThan(0);
    expect(producers.every((p) => p.economy === "military")).toBe(true);
    expect(
      producers.every(
        (p) => getInstallationProduction(p.buildingKey)?.gatedByManning === true,
      ),
    ).toBe(true);
  });

  it("ammunition crates come only from the civilian stockpile economy", () => {
    const producers = getProducers("ammunition_crate");
    expect(producers.length).toBeGreaterThan(0);
    expect(producers.every((p) => p.economy === "stockpile")).toBe(true);
    expect(producers.some((p) => p.buildingKey === "ammunitionPressLines")).toBe(true);
  });
});

describe("productionInfo — chain graph", () => {
  it("steel ingots are consumed by the press lines", () => {
    const consumers = getConsumers("steel_ingot");
    expect(consumers.some((c) => c.buildingKey === "ammunitionPressLines")).toBe(true);
  });

  it("scales civilian demand by constructed buildings without worker scaling", () => {
    const consumer = getConsumers("steel_ingot").find(
      (c) => c.buildingKey === "ammunitionPressLines",
    );
    expect(consumer).toBeDefined();
    expect(getConsumerDemand(consumer!, { ammunitionPressLines: 3 })).toEqual({
      buildingCount: 3,
      demandQty: consumer!.qty * 3,
    });
  });

  it("treats omitted and explicit-zero consumer buildings as zero demand", () => {
    const consumer = getConsumers("steel_ingot").find(
      (c) => c.buildingKey === "ammunitionPressLines",
    );
    expect(consumer).toBeDefined();
    expect(getConsumerDemand(consumer!, {})).toEqual({
      buildingCount: 0,
      demandQty: 0,
    });
    expect(getConsumerDemand(consumer!, { ammunitionPressLines: 0 })).toEqual({
      buildingCount: 0,
      demandQty: 0,
    });
  });

  it("uses the same zero-safe live count rule for civilian and military keys", () => {
    expect(getLiveBuildingCount({}, "ammunitionPressLines")).toBe(0);
    expect(getLiveBuildingCount({}, "ammunition_factory")).toBe(0);
    expect(getLiveBuildingCount({ ammunitionPressLines: 2 }, "ammunitionPressLines")).toBe(2);
    expect(getLiveBuildingCount({ ammunition_factory: 3 }, "ammunition_factory")).toBe(3);
  });

  it("does not report military supply as civilian demand", () => {
    expect(getConsumers("ammo")).toHaveLength(0);
  });

  it("lists chain resources sorted by name", () => {
    const list = listChainResources();
    expect(list.length).toBeGreaterThan(0);
    const names = list.map((r) => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("every producer carries a resolvable building name", () => {
    for (const { id } of listChainResources()) {
      for (const p of getProducers(id)) {
        expect(p.buildingName.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("production chains — responsive readability contract", () => {
  it("keeps the balance comparison and recipe facts as visible, wrap-safe labels", () => {
    expect(productionChainsScreenSource).toContain("CIVILIAN STOCKPILE BALANCE");
    expect(productionChainsScreenSource).toContain(">SUPPLY</Text>");
    expect(productionChainsScreenSource).toContain(">DEMAND</Text>");
    expect(productionChainsScreenSource).toContain("Output:");
    expect(productionChainsScreenSource).toContain("Staffing:");
    expect(productionChainsScreenSource).toContain("Uses:");
    expect(productionChainsScreenSource).toContain("cycleText(p.ticksPerCycle)");
    expect(productionChainsScreenSource).toContain("cycleText(c.ticksPerCycle)");
    expect(productionChainsScreenSource).toContain("<Text style={s.cardLabel}>Cycle:</Text>");
    expect(productionChainsScreenSource).toContain("flexWrap: \"wrap\"");
    expect(productionChainsScreenSource).toContain("minWidth: 0");
    expect(productionChainsScreenSource).toContain("balanceMetric");
    expect(productionChainsScreenSource).toContain("lineHeight: 17");
    expect(productionChainsScreenSource).toContain("NOT BUILT — no live output");
    expect(productionChainsScreenSource).toContain("NOT BUILT — no live demand");
    expect(productionChainsScreenSource).not.toContain("state.buildings?.[p.buildingKey] ?? 1");
  });
});
