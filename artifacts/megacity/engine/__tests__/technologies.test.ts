import { describe, it, expect } from "vitest";

import {
  ALL_TECHNOLOGIES,
  BIOSPHERE_TECHNOLOGIES,
  ECOLOGY_TECHNOLOGIES,
  TECH_MAP,
  canResearch,
  getVisibleTechnologies,
} from "@/engine/technologies";

describe("Technology tree — prerequisite DAG integrity", () => {
  it("every prerequisite resolves to a known tech id", () => {
    const missing: { tech: string; missingPrereq: string }[] = [];
    for (const tech of ALL_TECHNOLOGIES) {
      for (const prereq of tech.prerequisites) {
        if (!TECH_MAP[prereq]) {
          missing.push({ tech: tech.id, missingPrereq: prereq });
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no duplicate tech ids across all sources", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const tech of ALL_TECHNOLOGIES) {
      if (seen.has(tech.id)) dupes.push(tech.id);
      seen.add(tech.id);
    }
    expect(dupes).toEqual([]);
  });

  it("contains no cycles in the prerequisite graph", () => {
    const WHITE = 0;
    const GREY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const t of ALL_TECHNOLOGIES) color.set(t.id, WHITE);

    const cycles: string[] = [];
    const visit = (id: string, path: string[]) => {
      const c = color.get(id) ?? WHITE;
      if (c === GREY) {
        cycles.push([...path, id].join(" -> "));
        return;
      }
      if (c === BLACK) return;
      color.set(id, GREY);
      const tech = TECH_MAP[id];
      if (tech) {
        for (const p of tech.prerequisites) {
          if (TECH_MAP[p]) visit(p, [...path, id]);
        }
      }
      color.set(id, BLACK);
    };

    for (const t of ALL_TECHNOLOGIES) visit(t.id, []);
    expect(cycles).toEqual([]);
  });

  it("every tech is reachable from a tier-1 root with no prerequisites", () => {
    const roots = new Set<string>(
      ALL_TECHNOLOGIES.filter((t) => t.prerequisites.length === 0).map((t) => t.id),
    );

    const reachable = new Set<string>(roots);
    let grew = true;
    while (grew) {
      grew = false;
      for (const tech of ALL_TECHNOLOGIES) {
        if (reachable.has(tech.id)) continue;
        if (tech.prerequisites.every((p) => reachable.has(p))) {
          reachable.add(tech.id);
          grew = true;
        }
      }
    }

    const orphans = ALL_TECHNOLOGIES.filter((t) => !reachable.has(t.id)).map((t) => t.id);
    expect(orphans).toEqual([]);
  });

  it("has at least one tier-1 tech with no prerequisites in every category that has any tech", () => {
    const categoriesWithTech = new Set(ALL_TECHNOLOGIES.map((t) => t.category));
    const orphanCategories: string[] = [];
    for (const cat of categoriesWithTech) {
      const inCat = ALL_TECHNOLOGIES.filter((t) => t.category === cat);
      const hasInternalEntry = inCat.some(
        (t) =>
          t.prerequisites.length === 0 ||
          t.prerequisites.every((p) => TECH_MAP[p]?.category !== cat),
      );
      if (!hasInternalEntry) orphanCategories.push(cat);
    }
    expect(orphanCategories).toEqual([]);
  });

  it("includes the new civilian cloning chain", () => {
    expect(TECH_MAP["tissue_culture_acceleration"]).toBeDefined();
    expect(TECH_MAP["somatic_template_libraries"]).toBeDefined();
    expect(TECH_MAP["rapid_growth_vats"]).toBeDefined();
    expect(TECH_MAP["tissue_culture_acceleration"].prerequisites).toEqual([]);
    expect(TECH_MAP["somatic_template_libraries"].prerequisites).toEqual([
      "tissue_culture_acceleration",
    ]);
    expect(TECH_MAP["rapid_growth_vats"].prerequisites).toEqual([
      "somatic_template_libraries",
    ]);
    expect(TECH_MAP["tissue_culture_acceleration"].category).toBe("cloning");
  });
});

describe("Technology eligibility and visibility", () => {
  it("rejects unknown, already-unlocked, locked, and inactive-addon technologies", () => {
    expect(canResearch("not-a-tech", [])).toMatchObject({ available: false });
    expect(canResearch("advanced_fusion_reactors", ["advanced_fusion_reactors"])).toMatchObject({ available: false });
    expect(canResearch("high_density_energy_storage", [])).toMatchObject({ available: false });
    expect(canResearch("sd_dna_storage_protocols", [])).toMatchObject({ available: false });
    expect(canResearch("sd_dna_storage_protocols", [], { "sixth-day": true })).toMatchObject({ available: true });
  });

  it("exposes ecology and biosphere catalogs, gates addon catalogs, and keeps story tech event-only", () => {
    const base = getVisibleTechnologies({}, []);
    expect(BIOSPHERE_TECHNOLOGIES.every((tech) => base.includes(tech))).toBe(true);
    expect(ECOLOGY_TECHNOLOGIES.every((tech) => base.includes(tech))).toBe(true);
    expect(base.some((tech) => tech.id.startsWith("sd_"))).toBe(false);
    expect(getVisibleTechnologies({ "sixth-day": true }, []).some((tech) => tech.id.startsWith("sd_"))).toBe(true);
    expect(base.some((tech) => tech.id === "story_lazarus_protocol")).toBe(false);
  });
});
