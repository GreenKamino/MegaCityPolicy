import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MANUAL_SECTIONS, type ManualSection } from "@/data/manualContent";
import { IMPLANT_CATEGORIES, IMPLANTS, type ImplantRarity } from "@/engine/implants";
import { SCAVENGE_ACTIONS, SCAVENGE_ZONES } from "@/engine/scavengingData";
import { BB_EDICTS } from "@/engine/addons/bigBrother";
import { SD_EDICTS, SD_TECHNOLOGIES, SD_TECH_CATEGORIES } from "@/engine/addons/sixthDay";
import { createDistricts } from "@/engine/districts";
import { ALL_TECHNOLOGIES } from "@/engine/technologies";
import { ALL_BASE_ACHIEVEMENTS } from "@/engine/achievements";
import { WORLD_LOCATIONS, STARTING_REGIONS } from "@/engine/worldMap";
import { createInitialState } from "@/engine/initialState";
import { IDEOLOGY_AXES } from "@/engine/intrigue";
import { MEGA_PROJECTS } from "@/engine/megaProjects";
import { DIPLOMATIC_ACTION_RULES } from "@/engine/diplomacyEngine";
import { BM_TABS } from "@/data/blackMarketTabs";

// This suite is a tripwire: the GAME MANUAL (data/manualContent.ts) is authored by
// hand but quotes concrete numbers and names that come from the engine. When engine
// content changes, these assertions fail with a clear message so the manual gets
// updated in lockstep instead of silently going stale.
//
// Some source-of-truth constants live inside Expo screen .tsx files that cannot be
// imported under the node-environment vitest run (they pull in react-native, expo
// assets, etc.) and are not exported. For those we read the source file as text and
// assert against it — the same readFileSync approach used by achievementIcons.test.ts.

const PKG_ROOT = join(__dirname, "..", "..");

function findSection(title: string): ManualSection {
  const section = MANUAL_SECTIONS.find((s) => s.title.includes(title));
  expect(section, `Manual section "${title}" not found`).toBeTruthy();
  return section!;
}

function findItem(title: string, keyword: string): string {
  const section = findSection(title);
  const item = section.items.find((i) => i.toLowerCase().includes(keyword.toLowerCase()));
  expect(item, `No item mentioning "${keyword}" in manual section "${title}"`).toBeTruthy();
  return item!;
}

function firstNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  expect(match, `Pattern ${pattern} did not match "${text}"`).toBeTruthy();
  return Number(match![1].replace(/,/g, ""));
}

describe("manual stays in sync with the engine", () => {
  describe("DISTRICTS & CONSTRUCTION", () => {
    it("district count matches createDistricts()", () => {
      const item = findItem("DISTRICTS", "districts");
      const stated = firstNumber(item, /(\d+) districts/);
      expect(stated).toBe(createDistricts().length);
    });

    it("named build categories exist and the floor is honest", () => {
      const item = findItem("DISTRICTS", "build categories");
      // Category labels live in app/(game)/construction.tsx as a non-exported const
      // in an un-importable screen module, so read them out of the source text.
      const src = readFileSync(join(PKG_ROOT, "app", "(game)", "construction.tsx"), "utf8");
      const labels = new Set(
        [...src.matchAll(/^ {4}label: "([^"]+)"/gm)].map((m) => m[1].toUpperCase()),
      );
      // Every category named in the manual must exist in the construction screen.
      const named = [
        "Energy", "Water", "Food", "Housing", "Industrial", "Transit", "Security",
        "Defense", "Research", "Civic", "Farming", "Space", "Biosphere",
      ];
      for (const cat of named) {
        expect(item, `manual should name category "${cat}"`).toContain(cat);
        expect(labels.has(cat.toUpperCase()), `engine has no "${cat}" build category`).toBe(true);
      }
      // "Over 30 build categories" — meet the floor, but stay in a sane band so an
      // over-stale floor also fails.
      const floor = firstNumber(item, /(\d+) build categories/);
      expect(labels.size).toBeGreaterThanOrEqual(floor);
      expect(labels.size).toBeLessThan(floor + 30);
    });
  });

  describe("RESEARCH & TECHNOLOGY", () => {
    it("technology count meets the manual floor within a sane band", () => {
      const item = findItem("RESEARCH", "technologies");
      const floor = firstNumber(item, /(\d+)\+ technologies/);
      expect(ALL_TECHNOLOGIES.length).toBeGreaterThanOrEqual(floor);
      expect(ALL_TECHNOLOGIES.length).toBeLessThan(floor + 100);
    });

    it("technology category count matches the distinct tech categories", () => {
      const item = findItem("RESEARCH", "categories");
      const stated = firstNumber(item, /across (\d+) categories/);
      const categories = new Set(ALL_TECHNOLOGIES.map((t) => t.category));
      expect(stated).toBe(categories.size);
    });

    it("technology tier count matches the distinct tech tiers", () => {
      const item = findItem("RESEARCH", "tiers");
      const stated = firstNumber(item, /and (\d+) tiers/);
      const tiers = new Set(ALL_TECHNOLOGIES.map((t) => t.tier));
      expect(stated).toBe(tiers.size);
    });
  });

  describe("FACTIONS & DIPLOMACY", () => {
    it("rival and hidden faction counts match the initial state", () => {
      const item = findItem("FACTIONS", "rival factions");
      const factions = createInitialState().factions;
      const active = factions.filter((f) => f.isActive).length;
      const hidden = factions.filter((f) => !f.isActive).length;
      expect(firstNumber(item, /(\d+) rival factions/)).toBe(active);
      expect(firstNumber(item, /plus (\d+) hidden/)).toBe(hidden);
    });

    it("external megacity count matches the initial state", () => {
      const item = findItem("FACTIONS", "external megacities");
      const stated = firstNumber(item, /(\d+) external megacities/);
      expect(stated).toBe(createInitialState().externalMegacities.length);
    });

    it("diplomacy action count meets the manual floor within a sane band", () => {
      const item = findItem("FACTIONS", "50+ actions");
      const floor = firstNumber(item, /(\d+)\+ actions/);
      const count = Object.keys(DIPLOMATIC_ACTION_RULES).length;
      expect(count).toBeGreaterThanOrEqual(floor);
      expect(count).toBeLessThan(floor + 100);
    });

    it("named diplomacy example actions exist in DIPLOMATIC_ACTION_RULES", () => {
      // The count is open-ended (floor+band above), but the manual also lists
      // specific example actions "including ...". Those named phrases must map to
      // real action rules so a rename can't silently leave the manual stale while
      // the count stays honest.
      const item = findItem("FACTIONS", "50+ actions");
      const keys = new Set(Object.keys(DIPLOMATIC_ACTION_RULES));
      const namedExamples: Array<[phrase: string, actionId: string]> = [
        ["open communications", "open-comms"],
        ["summits", "request-summit"],
        ["treaties", "joint-treaty"],
        ["smuggling deals", "smuggling-deal"],
        ["false flags", "false-flag"],
        ["regulatory capture", "regulatory-capture"],
        ["proxy wars", "proxy-war"],
      ];
      for (const [phrase, actionId] of namedExamples) {
        expect(
          item.toLowerCase(),
          `manual should name diplomacy example "${phrase}"`,
        ).toContain(phrase.toLowerCase());
        expect(
          keys.has(actionId),
          `DIPLOMATIC_ACTION_RULES has no "${actionId}" action for manual example "${phrase}"`,
        ).toBe(true);
      }
    });
  });

  describe("LAW, ORDER & POLICIES", () => {
    it("reputation axis count matches IDEOLOGY_AXES", () => {
      const item = findItem("LAW", "axes");
      const stated = firstNumber(item, /across (\d+) axes/);
      expect(stated).toBe(IDEOLOGY_AXES.length);
    });
  });

  describe("MEGA-PROJECTS", () => {
    it("named example projects exist in MEGA_PROJECTS", () => {
      const item = findItem("MEGA-PROJECTS", "Examples");
      const names = new Set(MEGA_PROJECTS.map((p) => p.name));
      for (const name of [
        "Orbital Tether", "Neural Collective", "Quantum Computing Hub", "Titan Forge",
      ]) {
        expect(item).toContain(name);
        expect(names.has(name), `MEGA_PROJECTS has no project named "${name}"`).toBe(true);
      }
    });

    it("named phases exist in the MegaProjectPhase union", () => {
      const item = findItem("MEGA-PROJECTS", "phases");
      // MegaProjectPhase is a type-only union (no runtime value), so read it as text.
      const src = readFileSync(join(PKG_ROOT, "engine", "megaProjects.ts"), "utf8");
      const typeMatch = src.match(/export type MegaProjectPhase =([^;]+);/);
      expect(typeMatch, "MegaProjectPhase type not found").toBeTruthy();
      const union = new Set(
        [...typeMatch![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      );
      const named = ["Planning", "Construction", "Operational"];
      expect(firstNumber(item, /(\d+) phases/)).toBe(named.length);
      for (const phase of named) {
        expect(item).toContain(phase);
        expect(union.has(phase.toLowerCase()), `no "${phase}" phase in the engine`).toBe(true);
      }
    });
  });

  describe("EVENTS & ACHIEVEMENTS", () => {
    it("achievement count meets the manual floor within a sane band", () => {
      const item = findItem("ACHIEVEMENTS", "milestones");
      const floor = firstNumber(item, /(\d+)\+ achievements/);
      expect(ALL_BASE_ACHIEVEMENTS.length).toBeGreaterThanOrEqual(floor);
      expect(ALL_BASE_ACHIEVEMENTS.length).toBeLessThan(floor + 100);
    });
  });

  describe("WORLD MAP", () => {
    it("location count meets the manual floor within a sane band", () => {
      const item = findItem("WORLD MAP", "locations across");
      const floor = firstNumber(item, /(\d+)\+ locations/);
      expect(WORLD_LOCATIONS.length).toBeGreaterThanOrEqual(floor);
      expect(WORLD_LOCATIONS.length).toBeLessThan(floor + 100);
    });

    it("starting region count matches STARTING_REGIONS", () => {
      const item = findItem("WORLD MAP", "starting regions");
      const stated = firstNumber(item, /(\d+) starting regions/);
      expect(stated).toBe(STARTING_REGIONS.length);
    });
  });

  describe("BLACK MARKET", () => {
    it("tab names in the manual match BM_TABS", () => {
      const item = findItem("BLACK MARKET", "tabs");
      // BM_TABS is the single source of truth (data/blackMarketTabs.ts), imported by
      // both the black market screen and this test.
      for (const tab of BM_TABS) {
        expect(item.toLowerCase()).toContain(tab.label.toLowerCase());
      }
      // And the manual must not name tabs that no longer exist.
      const knownLabels = new Set(BM_TABS.map((t) => t.label.toLowerCase()));
      const otherTabNames = ["auction", "smuggling", "fence", "broker", "vault"];
      for (const stale of otherTabNames) {
        if (!knownLabels.has(stale)) {
          expect(item.toLowerCase()).not.toContain(`${stale} tab`);
        }
      }
    });
  });

  describe("CYBERNETICS", () => {
    it("implant category count matches IMPLANT_CATEGORIES", () => {
      const item = findItem("CYBERNETICS", "categories");
      const stated = firstNumber(item, /span (\d+) categories/);
      expect(stated).toBe(IMPLANT_CATEGORIES.length);
    });

    it("rarity tier count matches the distinct rarities in IMPLANTS", () => {
      const item = findItem("CYBERNETICS", "rarity tiers");
      const stated = firstNumber(item, /(\d+) rarity tiers/);
      const rarities = new Set<ImplantRarity>(IMPLANTS.map((i) => i.rarity));
      expect(stated).toBe(rarities.size);
      // Manual names the endpoints: "from Common to Prototype".
      expect(rarities.has("common")).toBe(true);
      expect(rarities.has("prototype")).toBe(true);
    });

    it("top implant cost matches the most expensive implant", () => {
      const item = findItem("CYBERNETICS", "credits");
      const stated = firstNumber(item, /up to ([\d,]+) credits/);
      const maxCost = Math.max(...IMPLANTS.map((i) => i.cost));
      expect(stated).toBe(maxCost);
    });
  });

  describe("SCAVENGING", () => {
    it("phase names and count match SCAVENGE_ACTIONS", () => {
      const item = findItem("SCAVENGING", "phases");
      const enginePhases = new Set(SCAVENGE_ACTIONS.map((a) => a.phase));
      const stated = firstNumber(item.replace(/four/i, "4"), /(\d+) phases/);
      expect(stated).toBe(enginePhases.size);
      // Every phase named in the manual must exist in the engine.
      const namedPhases = ["Scout", "Scavenge", "Excavate", "Reclaim"];
      for (const phase of namedPhases) {
        expect(item).toContain(phase);
        expect(enginePhases.has(phase.toLowerCase() as (typeof SCAVENGE_ACTIONS)[number]["phase"])).toBe(true);
      }
      expect(enginePhases.size).toBe(namedPhases.length);
    });

    it("stated max danger matches the most dangerous zone", () => {
      const item = findItem("SCAVENGING", "% danger");
      const stated = firstNumber(item, /reach (\d+)% danger/);
      const maxDanger = Math.max(...SCAVENGE_ZONES.map((z) => z.dangerLevel));
      expect(stated).toBe(maxDanger);
    });
  });

  describe("ADDONS & EXPANSION PACKS", () => {
    it("Sixth Day technology count is at least the manual's floor", () => {
      const item = findItem("ADDONS", "technologies");
      const floor = firstNumber(item, /(\d+)\+ technologies/);
      expect(SD_TECHNOLOGIES.length).toBeGreaterThanOrEqual(floor);
      // Keep the floor honest: if it drifts far below reality, tighten the manual.
      expect(SD_TECHNOLOGIES.length).toBeLessThan(floor + 100);
    });

    it("Sixth Day tech categories named in the manual exist in the engine", () => {
      const item = findItem("ADDONS", "DNA Science");
      const labels = Object.values(SD_TECH_CATEGORIES).map((l) => l.toUpperCase());
      for (const cat of ["DNA Science", "Genetics", "Cloning"]) {
        expect(item).toContain(cat);
        expect(labels).toContain(cat.toUpperCase());
      }
      expect(labels.length).toBe(3);
    });

    it("edicts named in the manual exist in BB_EDICTS / SD_EDICTS", () => {
      const item = findItem("ADDONS", "edicts");
      const allEdictNames = new Set([...BB_EDICTS, ...SD_EDICTS].map((e) => e.name));
      // Edict names appear in the manual verbatim.
      expect(item).toContain("The Great Purge");
      expect(item).toContain("Mass Cloning Order");
      expect(allEdictNames.has("The Great Purge")).toBe(true);
      expect(allEdictNames.has("Mass Cloning Order")).toBe(true);
    });
  });
});
