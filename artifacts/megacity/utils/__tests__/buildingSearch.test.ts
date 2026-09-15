import { describe, expect, it } from "vitest";
import {
  filterCategoryBuildings,
  searchAllBuildings,
  type SearchableCategory,
} from "../buildingSearch";

// Fixture mirroring the construction screen's shape: multiple categories,
// some with subcategories.
const CATS: SearchableCategory[] = [
  {
    id: "energy",
    label: "ENERGY",
    buildings: [
      { key: "solarFarm", label: "SOLAR FARM", description: "Panels in the wasteland sun." },
      { key: "fusionPlant", label: "FUSION PLANT", description: "A star in a bottle." },
    ],
  },
  {
    id: "industry",
    label: "INDUSTRY",
    buildings: [
      { key: "foundry", label: "METAL FOUNDRY", description: "Rivers of molten metal.", subcategory: "GENERAL" },
      { key: "acidPlant", label: "ACID PLANT", description: "Industrial chemistry at scale.", subcategory: "CHEMICALS" },
      { key: "solventWorks", label: "SOLVENT WORKS", description: "Cleaning agents for machines.", subcategory: "CHEMICALS" },
    ],
  },
  {
    id: "civic",
    label: "CIVIC",
    buildings: [
      { key: "clinic", label: "STREET CLINIC", description: "Free care, long queues." },
    ],
  },
];

describe("searchAllBuildings (global search)", () => {
  it("finds a building outside the currently browsed category/subcategory", () => {
    // Player is browsing ENERGY with no subcategory relevance; the tutorial
    // mentioned the foundry, which lives in INDUSTRY › GENERAL.
    const results = searchAllBuildings(CATS, "foundry");
    expect(results.map((r) => r.key)).toEqual(["foundry"]);
    expect(results[0].catId).toBe("industry");
    expect(results[0].catLabel).toBe("INDUSTRY");
    expect(results[0].subcategory).toBe("GENERAL");
  });

  it("matches across ALL categories and subcategories at once", () => {
    // "plant" appears in ENERGY (fusion) and INDUSTRY › CHEMICALS (acid).
    const results = searchAllBuildings(CATS, "plant");
    expect(results.map((r) => r.key).sort()).toEqual(["acidPlant", "fusionPlant"]);
    const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
    expect(byKey.fusionPlant.catLabel).toBe("ENERGY");
    expect(byKey.acidPlant.catLabel).toBe("INDUSTRY");
  });

  it("matches on description text too, case-insensitively", () => {
    const results = searchAllBuildings(CATS, "Molten METAL");
    expect(results.map((r) => r.key)).toEqual(["foundry"]);
  });

  it("returns [] for a blank/whitespace query (callers treat as not searching)", () => {
    expect(searchAllBuildings(CATS, "")).toEqual([]);
    expect(searchAllBuildings(CATS, "   ")).toEqual([]);
  });

  it("annotates every result with its category", () => {
    for (const r of searchAllBuildings(CATS, "a")) {
      expect(typeof r.catId).toBe("string");
      expect(r.catId.length).toBeGreaterThan(0);
      expect(typeof r.catLabel).toBe("string");
      expect(r.catLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("filterCategoryBuildings (normal browsing view)", () => {
  it("returns all buildings for the ALL chip (null subFilter)", () => {
    const industry = CATS[1];
    expect(filterCategoryBuildings(industry.buildings, null).map((b) => b.key)).toEqual([
      "foundry",
      "acidPlant",
      "solventWorks",
    ]);
  });

  it("narrows to one subcategory when a chip is selected", () => {
    const industry = CATS[1];
    expect(filterCategoryBuildings(industry.buildings, "CHEMICALS").map((b) => b.key)).toEqual([
      "acidPlant",
      "solventWorks",
    ]);
  });

  it("clearing the search restores the prior filter state unchanged", () => {
    // The screen keeps subFilter/activeCat state untouched while searching:
    // a search only swaps the list source. Simulate the full flow.
    const industry = CATS[1];
    const subFilter = "CHEMICALS";
    const before = filterCategoryBuildings(industry.buildings, subFilter);

    // Search kicks in (global, ignores the sub filter entirely)…
    const during = searchAllBuildings(CATS, "solar");
    expect(during.map((r) => r.key)).toEqual(["solarFarm"]);

    // …and clearing the query re-derives the exact same browsing list.
    const after = filterCategoryBuildings(industry.buildings, subFilter);
    expect(after).toEqual(before);
  });
});

describe("construction screen wiring", () => {
  it("uses the global search when the query is non-empty and the category filter otherwise", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/(game)/construction.tsx"),
      "utf8",
    );
    // Non-empty query → global search across allCategories (not cat.buildings).
    expect(src).toContain("searchAllBuildings(allCategories, searchQuery)");
    // Otherwise → the untouched category/subcategory browsing view.
    expect(src).toContain("filterCategoryBuildings(cat.buildings, subFilter)");
    // Search rows surface where the building lives.
    expect(src).toContain("def.catLabel");
  });

  it("makes a search breadcrumb switch to its category and subcategory before highlighting the result", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/(game)/construction.tsx"),
      "utf8",
    );
    const handler = src.match(
      /const browseSearchResultCategory = useCallback\(\(def: ListedBuilding\) => \{([\s\S]*?)\n  \}, \[\]\);/,
    )?.[1];

    expect(handler).toBeDefined();
    expect(handler).toContain("setActiveCat(def.catId)");
    expect(handler).toContain("setSubFilter(def.subcategory ?? null)");
    expect(handler).toContain('setSearchQuery("")');
    expect(handler).toContain("setHighlightKey(def.key)");
    expect(src).toContain("onPress={() => browseSearchResultCategory(def)}");
  });
});
