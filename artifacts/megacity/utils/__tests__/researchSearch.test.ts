import { describe, expect, it } from "vitest";
import {
  filterTechnologiesByCategory,
  searchAllTechnologies,
  type SearchableTechnology,
} from "../researchSearch";

const LABELS = {
  energy: "ENERGY",
  industrial: "INDUSTRIAL",
  ecology: "ECOLOGY & TAMING",
};

const TECHNOLOGIES: SearchableTechnology[] = [
  {
    id: "fusion",
    name: "Advanced Fusion Reactors",
    category: "energy",
    description: "Next-generation power for the city.",
  },
  {
    id: "foundry",
    name: "Automated Foundry",
    category: "industrial",
    description: "Industrial metal production.",
  },
  {
    id: "wasteland-atlas",
    name: "Wasteland Atlas",
    category: "ecology",
    description: "Map the recovering wilderness.",
  },
];

describe("research technology search", () => {
  it("finds a technology outside the selected category and labels its category", () => {
    const results = searchAllTechnologies(TECHNOLOGIES, "foundry", LABELS);

    expect(results.map((tech) => tech.id)).toEqual(["foundry"]);
    expect(results[0].categoryLabel).toBe("INDUSTRIAL");
  });

  it("matches names and descriptions across all categories", () => {
    const results = searchAllTechnologies(TECHNOLOGIES, "city", LABELS);

    expect(results.map((tech) => tech.id)).toEqual(["fusion"]);
    expect(results[0].categoryLabel).toBe("ENERGY");
  });

  it("returns no results for a blank query", () => {
    expect(searchAllTechnologies(TECHNOLOGIES, "   ", LABELS)).toEqual([]);
  });

  it("restores the selected category view after clearing the query", () => {
    const selectedCategory = "industrial";
    const before = filterTechnologiesByCategory(TECHNOLOGIES, selectedCategory);

    expect(searchAllTechnologies(TECHNOLOGIES, "atlas", LABELS).map((tech) => tech.id)).toEqual([
      "wasteland-atlas",
    ]);
    expect(filterTechnologiesByCategory(TECHNOLOGIES, selectedCategory)).toEqual(before);
  });
});

describe("research screen search wiring", () => {
  it("uses the global search while retaining the category browsing fallback", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/(game)/research.tsx"),
      "utf8",
    );

    expect(src).toContain("searchAllTechnologies(availableTechs, searchQuery, TECH_CATEGORY_LABELS)");
    expect(src).toContain("filterTechnologiesByCategory(availableTechs, selectedCategory)");
    expect(src).toContain("categoryLabel={tech.categoryLabel}");
  });
});