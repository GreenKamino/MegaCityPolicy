import { describe, expect, it } from "vitest";

import { resolveInitialAtlasCategory } from "@/engine/atlasDeepLink";
import { CATEGORY_LABELS } from "@/engine/firsts";

describe("resolveInitialAtlasCategory (firsts.tsx ?cat= deep-link)", () => {
  it("seeds the discovery filter when the atlas popup deep-links with cat=discovery", () => {
    expect(resolveInitialAtlasCategory("discovery")).toBe("discovery");
  });

  it("accepts every known first category as a valid filter seed", () => {
    for (const cat of Object.keys(CATEGORY_LABELS)) {
      expect(resolveInitialAtlasCategory(cat)).toBe(cat);
    }
  });

  it("falls back to the all filter when the param is missing", () => {
    expect(resolveInitialAtlasCategory(undefined)).toBe("all");
    expect(resolveInitialAtlasCategory("")).toBe("all");
  });

  it("falls back to all for unknown / malformed category values", () => {
    expect(resolveInitialAtlasCategory("not-a-real-category")).toBe("all");
    expect(resolveInitialAtlasCategory("DISCOVERY")).toBe("all"); // case-sensitive
  });

  it("uses the first entry when expo-router gives back a string array", () => {
    expect(resolveInitialAtlasCategory(["discovery", "law"])).toBe("discovery");
    expect(resolveInitialAtlasCategory([])).toBe("all");
  });
});
