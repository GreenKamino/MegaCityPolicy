import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getTraitVisual, DEFAULT_TRAIT_VISUAL } from "@/engine/traitIcons";

// Derive the trait list directly from the source of truth (initialState.ts)
// so this guard self-updates as new NPCs ship. The previous incarnation
// kept a hand-maintained list that silently fell behind reality.
function collectLeaderTraitsFromInitialState(): string[] {
  const initStatePath = path.resolve(__dirname, "../initialState.ts");
  const src = fs.readFileSync(initStatePath, "utf8");
  const traits = new Set<string>();
  const arrayRx = /personalityTraits\s*:\s*\[([^\]]+)\]/g;
  const stringRx = /"([a-z][a-z\- ]+)"/g;
  for (const arrayMatch of src.matchAll(arrayRx)) {
    for (const stringMatch of arrayMatch[1].matchAll(stringRx)) {
      traits.add(stringMatch[1]);
    }
  }
  return [...traits].sort();
}

const KNOWN_LEADER_TRAITS = collectLeaderTraitsFromInitialState();

describe("getTraitVisual", () => {
  it("discovers a non-trivial set of leader traits from initialState", () => {
    // Sanity: if this drops to zero we silently lost coverage.
    expect(KNOWN_LEADER_TRAITS.length).toBeGreaterThanOrEqual(80);
  });

  it("returns the default visual for empty input", () => {
    expect(getTraitVisual("")).toEqual(DEFAULT_TRAIT_VISUAL);
  });

  it("returns a non-default visual for every leader trait used in initialState", () => {
    const unmapped: string[] = [];
    for (const trait of KNOWN_LEADER_TRAITS) {
      const v = getTraitVisual(trait);
      if (v.icon === DEFAULT_TRAIT_VISUAL.icon) unmapped.push(trait);
    }
    expect(unmapped).toEqual([]);
  });

  it("normalizes case and whitespace", () => {
    const lower = getTraitVisual("authoritarian");
    expect(getTraitVisual("AUTHORITARIAN")).toEqual(lower);
    expect(getTraitVisual("  Authoritarian  ")).toEqual(lower);
  });

  it("returns the default visual for an unrecognized trait", () => {
    expect(getTraitVisual("xyzzy_nonsense_trait")).toEqual(DEFAULT_TRAIT_VISUAL);
  });

  it("each visual specifies a valid color key", () => {
    const validColors = new Set([
      "danger", "warning", "accent", "info", "textSecondary", "textMuted",
    ]);
    for (const trait of KNOWN_LEADER_TRAITS) {
      const v = getTraitVisual(trait);
      expect(validColors.has(v.color)).toBe(true);
    }
  });
});
