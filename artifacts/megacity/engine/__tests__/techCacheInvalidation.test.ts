import { beforeEach, describe, expect, it } from "vitest";

import { buildTechEffectsCache, invalidateTechCache } from "@/engine/perfCache";

describe("perfCache.buildTechEffectsCache invalidation", () => {
  beforeEach(() => {
    invalidateTechCache();
  });

  it("returns different effects when a same-length tech-set swap preserves first/last ids", () => {
    // Pick three real techs whose effects diverge. The middle slot is what
    // changes between the two arrays — first ("advanced_fusion_reactors") and
    // last ("solar_tower_efficiency") are identical, and the length is the
    // same, which is exactly the collision the old (count, first, last) cache
    // key returned a stale result for.
    const before = ["advanced_fusion_reactors", "micro_fusion_grid_nodes", "solar_tower_efficiency"];
    const after = ["advanced_fusion_reactors", "high_density_energy_storage", "solar_tower_efficiency"];

    const beforeEffects = { ...buildTechEffectsCache(before, {}) };
    const afterEffects = { ...buildTechEffectsCache(after, {}) };

    // Both arrays produce a powerGeneration sum, but the swapped middle tech
    // has a different contribution — the cached singleton must reflect that.
    expect(afterEffects.powerGeneration).not.toBe(beforeEffects.powerGeneration);
  });

  it("returns the same cached object when called twice with identical input", () => {
    const ids = ["advanced_fusion_reactors", "solar_tower_efficiency"];
    const a = buildTechEffectsCache(ids, {});
    const b = buildTechEffectsCache(ids, {});
    expect(b).toBe(a);
  });

  it("invalidateTechCache forces a fresh build on the next call", () => {
    const ids = ["advanced_fusion_reactors"];
    const a = buildTechEffectsCache(ids, {});
    invalidateTechCache();
    const b = buildTechEffectsCache(ids, {});
    expect(b).not.toBe(a);
    expect(b.powerGeneration).toBe(a.powerGeneration);
  });

  it("treats reordered tech arrays as identical content", () => {
    const a = buildTechEffectsCache(["advanced_fusion_reactors", "solar_tower_efficiency"], {});
    const totalsA = { ...a };
    const b = buildTechEffectsCache(["solar_tower_efficiency", "advanced_fusion_reactors"], {});
    expect(b.powerGeneration).toBe(totalsA.powerGeneration);
  });
});
