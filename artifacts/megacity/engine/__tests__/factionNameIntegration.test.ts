import { describe, expect, it } from "vitest";

import { getFactionName } from "@/engine/displayNames";
import type { Faction } from "@/engine/types";

const factions: Faction[] = [
  {
    id: "iron_council",
    name: "The Iron Council",
    description: "",
    influence: 50,
    loyalty: 50,
    threat: 30,
    type: "law",
    isActive: true,
  } as Faction,
  {
    id: "wraith_syndicate",
    name: "Wraith Syndicate",
    description: "",
    influence: 40,
    loyalty: 20,
    threat: 70,
    type: "criminal",
    isActive: true,
  } as Faction,
];

describe("getFactionName integration", () => {
  it("returns the friendly name when id matches", () => {
    expect(getFactionName(factions, "iron_council")).toBe("The Iron Council");
    expect(getFactionName(factions, "wraith_syndicate")).toBe("Wraith Syndicate");
  });

  it("falls back to a humanized id when no match exists", () => {
    expect(getFactionName(factions, "unknown_gang")).toBe("Unknown Gang");
  });

  it("returns 'Unaffiliated' for empty/null/undefined id", () => {
    expect(getFactionName(factions, "")).toBe("Unaffiliated");
    expect(getFactionName(factions, null as any)).toBe("Unaffiliated");
    expect(getFactionName(factions, undefined as any)).toBe("Unaffiliated");
  });

  it("works with empty faction array (always falls back)", () => {
    expect(getFactionName([], "iron_council")).toBe("Iron Council");
  });

  it("works with undefined faction array", () => {
    expect(getFactionName(undefined as any, "iron_council")).toBe("Iron Council");
  });
});
