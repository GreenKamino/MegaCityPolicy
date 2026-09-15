import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { getBankName, getFactionName, getNodeName, getZoneName, humanizeId, itemDisplayName, techDisplayName } from "@/engine/displayNames";

const upgradesScreenSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/(game)/upgrades.tsx"),
  "utf8",
);

describe("humanizeId", () => {
  it("handles empty input safely", () => {
    expect(humanizeId("")).toBe("Unknown");
  });

  it("title-cases snake_case ids", () => {
    expect(humanizeId("flak_vest")).toBe("Flak Vest");
    expect(humanizeId("synth_adrenaline_injector")).toBe("Synth Adrenaline Injector");
  });

  it("title-cases hyphenated ids", () => {
    expect(humanizeId("nano-weave-suit")).toBe("Nano Weave Suit");
  });

  it("collapses repeated separators", () => {
    expect(humanizeId("foo__bar--baz")).toBe("Foo Bar Baz");
  });

  it("preserves single-word ids", () => {
    expect(humanizeId("relic")).toBe("Relic");
  });
});

describe("itemDisplayName", () => {
  it("resolves a known item id to its catalog name", () => {
    expect(itemDisplayName("flak_vest")).toBe("Flak Vest");
    expect(itemDisplayName("juggernaut_exo")).toBe("Juggernaut Exo-Frame");
    expect(itemDisplayName("wasteland_trophy")).toBe("Wasteland Trophy");
  });

  it("falls back to humanized id when the item is not in the catalog", () => {
    expect(itemDisplayName("totally_made_up_item")).toBe("Totally Made Up Item");
  });
});

describe("techDisplayName", () => {
  it("resolves a known technology id to its catalog name", () => {
    expect(techDisplayName("tactical_exoskeleton_armor")).toBe("Tactical Exoskeleton Armor");
  });

  it("falls back to humanized id when the tech is not in the catalog", () => {
    expect(techDisplayName("definitely_not_a_real_tech")).toBe("Definitely Not A Real Tech");
  });

  it("never returns the raw underscore id for unknowns", () => {
    const result = techDisplayName("combat_augmentation");
    expect(result).not.toBe("combat_augmentation");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("upgrade screen display-name wiring", () => {
  it("uses friendly labels in requirements and apply confirmation copy", () => {
    expect(upgradesScreenSource).toContain(
      'import { itemDisplayName, techDisplayName } from "@/engine/displayNames";',
    );
    expect(upgradesScreenSource).toMatch(
      /line:\s*`RESEARCH: \$\{techDisplayName\(techId\)\}`/,
    );
    expect(upgradesScreenSource).toMatch(
      /Research: \$\{upgrade\.reqs\.techIds\.map\(\(techId\) => techDisplayName\(techId\)\)\.join\(", "\)\}/,
    );
    expect(upgradesScreenSource).toMatch(
      /line:\s*`\$\{itemDisplayName\(req\.itemDefId\)\} \(\$\{have\}\/\$\{req\.count\}\)`/,
    );
    expect(upgradesScreenSource).toMatch(
      /Consumes: \$\{upgrade\.reqs\.items\.map\(\(r\) => `\$\{r\.count\}× \$\{itemDisplayName\(r\.itemDefId\)\}`\)/,
    );
  });

  it("keeps known and unknown requirement ids safe for the screen", () => {
    expect(itemDisplayName("flak_vest")).toBe("Flak Vest");
    expect(techDisplayName("tactical_exoskeleton_armor")).toBe("Tactical Exoskeleton Armor");

    expect(itemDisplayName("screen_only_unknown_item")).toBe("Screen Only Unknown Item");
    expect(techDisplayName("screen_only_unknown_tech")).toBe("Screen Only Unknown Tech");
  });
});

describe("getBankName", () => {
  it("maps known bank ids to their friendly names", () => {
    expect(getBankName("corpbank")).toBe("CorpBank");
    expect(getBankName("megacity-central")).toBe("MegaCity Central");
  });

  it("never leaks the raw id for unknown banks", () => {
    expect(getBankName("brand_new_bank")).toBe("Brand New Bank");
  });

  it("handles missing input safely", () => {
    expect(getBankName(undefined)).toBe("Unknown Bank");
    expect(getBankName(null)).toBe("Unknown Bank");
    expect(getBankName("")).toBe("Unknown Bank");
  });
});

describe("getZoneName", () => {
  const zones = [
    { id: "sector_alpha", name: "Sector Alpha — City Center" },
    { id: "sector_beta", name: "Sector Beta — Commercial Hub" },
  ];

  it("returns the zone's display name when found", () => {
    expect(getZoneName(zones, "sector_alpha")).toBe("Sector Alpha — City Center");
  });

  it("falls back to a humanized id when the zone is missing", () => {
    expect(getZoneName(zones, "sector_omega")).toBe("Sector Omega");
  });

  it("handles missing inputs safely", () => {
    expect(getZoneName(undefined, "sector_alpha")).toBe("Sector Alpha");
    expect(getZoneName(zones, undefined)).toBe("Unknown Zone");
    expect(getZoneName(zones, "")).toBe("Unknown Zone");
  });
});

describe("getNodeName", () => {
  it("falls back to a humanized id when the node id is unknown", () => {
    const result = getNodeName("ghost_node_id");
    expect(result).not.toBe("ghost_node_id");
    expect(result).toBe("Ghost Node Id");
  });

  it("handles missing input safely", () => {
    expect(getNodeName(undefined)).toBe("Unknown Node");
  });
});

describe("getFactionName", () => {
  const factions = [
    { id: "corporations", name: "Corporate Council" },
    { id: "undercity", name: "Undercity Denizens" },
  ];

  it("returns the faction's display name when found", () => {
    expect(getFactionName(factions, "corporations")).toBe("Corporate Council");
  });

  it("falls back to a humanized id when the faction is not registered", () => {
    expect(getFactionName(factions, "gangs")).toBe("Gangs");
    expect(getFactionName(factions, "tech_enclave")).toBe("Tech Enclave");
  });

  it("works without a factions array (edict / data-only contexts)", () => {
    expect(getFactionName(undefined, "corps")).toBe("Corps");
  });

  it("returns a friendly placeholder for missing input", () => {
    expect(getFactionName(factions, undefined)).toBe("Unaffiliated");
    expect(getFactionName(factions, "")).toBe("Unaffiliated");
  });
});
