import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { LORE_ENTRIES } from "@/engine/loreData";
import { WORLD_LOCATIONS, getWorldRoutes, isWorldLocationVisibleOnMap } from "@/engine/worldMap";
import { scrubLegacyContent } from "@/engine/legacyContent";

describe("retired content compatibility", () => {
  it("does not expose retired content in fresh catalogs", () => {
    const catalog = JSON.stringify({
      initial: createInitialState(),
      locations: WORLD_LOCATIONS,
      lore: LORE_ENTRIES,
    });
    expect(catalog).not.toMatch(/tenno|shogunate/i);
  });

  it("scrubs retired identities from legacy state references idempotently", () => {
    const legacy = {
      factions: [{ id: "neon-shogunate" }, { id: "law" }],
      externalMegacities: [{ id: "neon-shogunate" }, { id: "nova-pacifica" }],
      discoveredLocationIds: ["neon-shogunate", "megacity"],
      discoveredLore: ["lore_neon_shogunate", "lore_founding_charter"],
      activeEvents: [{ id: "neon_shogunate_protocol" }, { id: "gang_war" }],
      eventHistory: [{ id: "shogunate_protocol_violation" }],
      locationRelations: { "neon-shogunate": { disposition: 50 } },
      selectedTargetId: "neon-shogunate",
      diplomacyAdvanced: { factionRelations: [{ factionId: "neon-shogunate" }, { factionId: "law" }] },
    };
    const scrubbed = scrubLegacyContent(legacy);

    expect(JSON.stringify(scrubbed)).not.toMatch(/tenno|shogunate/i);
    expect(scrubLegacyContent(scrubbed)).toEqual(scrubbed);
  });

  it("never surfaces denied identities through generic map selectors", () => {
    const deniedLocation = {
      ...WORLD_LOCATIONS[0],
      id: "neon-shogunate",
      type: "megacity" as const,
    };
    expect(isWorldLocationVisibleOnMap(deniedLocation, ["neon-shogunate"])).toBe(false);
    expect(getWorldRoutes(["neon-shogunate"]).every((route) =>
      route.from !== "neon-shogunate" && route.to !== "neon-shogunate",
    )).toBe(true);
  });
});