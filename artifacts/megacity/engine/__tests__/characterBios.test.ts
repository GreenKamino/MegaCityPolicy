import { describe, it, expect } from "vitest";
import { generateOfficerBio, generateCharacterBio, hasCharacterTraitFlavor } from "@/engine/characterBios";
import { CITIZEN_TRAITS } from "@/engine/traits";
import type { Officer, NamedCharacter, OfficerDepartment, CharacterRole, OfficerTrait } from "@/engine/types";

const ALL_DEPTS: OfficerDepartment[] = [
  "supreme_leadership",
  "executive_council",
  "judicial",
  "law_enforcement",
  "civic",
  "infrastructure",
  "economic",
  "research",
  "defense",
  "district",
  "advisory",
];

const ALL_ROLES: CharacterRole[] = [
  "gang_lieutenant",
  "journalist",
  "tycoon",
  "agitator",
  "celebrity",
  "informant",
  "fugitive",
  "preacher",
  "union_boss",
];

const SAMPLE_TRAITS: OfficerTrait[] = [
  "efficient", "bureaucratic", "visionary", "ambitious", "loyal", "corrupt",
  "ruthless", "strategist", "diplomat", "veteran", "embittered", "paranoid",
];

function makeOfficer(overrides: Partial<Officer> = {}): Officer {
  return {
    id: "supreme-1",
    name: "Kovac Stern",
    position: "Defense High Commander",
    department: "defense",
    rank: "chief_director",
    competence: 70,
    loyalty: 50,
    ambition: 60,
    corruption: 10,
    popularity: 40,
    fearFactor: 30,
    traits: ["veteran", "strict"],
    backstory: "",
    factionAffiliation: null,
    rivals: [],
    appointed: false,
    appointmentMethod: null,
    level: 1,
    xp: 0,
    age: 48,
    appointedYear: null,
    yearsServed: 0,
    careerLog: [],
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<NamedCharacter> = {}): NamedCharacter {
  return {
    id: "npc-tycoon-2055-3-x9",
    name: "Mira Volkov",
    role: "tycoon",
    factionId: null,
    districtId: null,
    status: "active",
    notoriety: 55,
    traits: [],
    backstory: "",
    bornYear: 2020,
    introducedYear: 2055,
    lastSeenYear: 2058,
    history: [],
    ...overrides,
  };
}

describe("generateOfficerBio", () => {
  it("is deterministic for identical inputs", () => {
    const a = generateOfficerBio(makeOfficer());
    const b = generateOfficerBio(makeOfficer());
    expect(a).toBe(b);
  });

  it("is deterministic regardless of trait order", () => {
    const a = generateOfficerBio(makeOfficer({ traits: ["veteran", "strict"] }));
    const b = generateOfficerBio(makeOfficer({ traits: ["strict", "veteran"] }));
    expect(a).toBe(b);
  });

  it("varies with id", () => {
    const a = generateOfficerBio(makeOfficer({ id: "officer-a" }));
    const b = generateOfficerBio(makeOfficer({ id: "officer-b" }));
    expect(a).not.toBe(b);
  });

  it("varies with name", () => {
    const a = generateOfficerBio(makeOfficer({ name: "Alpha One" }));
    const b = generateOfficerBio(makeOfficer({ name: "Beta Two" }));
    expect(a).not.toBe(b);
  });

  it("returns a non-empty string for every department", () => {
    for (const dept of ALL_DEPTS) {
      const bio = generateOfficerBio(makeOfficer({ department: dept, id: `o-${dept}` }));
      expect(typeof bio).toBe("string");
      expect(bio.length).toBeGreaterThan(20);
      expect(bio.endsWith(".")).toBe(true);
    }
  });

  it("includes a faction line when officer is faction-aligned", () => {
    const bio = generateOfficerBio(makeOfficer({ factionAffiliation: "Iron Reform Bloc" }));
    expect(bio).toContain("Iron Reform Bloc");
  });

  it("changes when traits change", () => {
    const a = generateOfficerBio(makeOfficer({ traits: ["loyal"] }));
    const b = generateOfficerBio(makeOfficer({ traits: ["corrupt"] }));
    expect(a).not.toBe(b);
  });

  it("produces different bios across many trait combinations", () => {
    const seen = new Set<string>();
    for (const t1 of SAMPLE_TRAITS) {
      for (const t2 of SAMPLE_TRAITS) {
        if (t1 === t2) continue;
        const bio = generateOfficerBio(makeOfficer({ id: `o-${t1}-${t2}`, traits: [t1, t2] }));
        seen.add(bio);
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("adapts tenure phrasing to age band", () => {
    const young = generateOfficerBio(makeOfficer({ id: "y", age: 28 }));
    const mid = generateOfficerBio(makeOfficer({ id: "m", age: 45 }));
    const senior = generateOfficerBio(makeOfficer({ id: "s", age: 62 }));
    expect(young).not.toBe(mid);
    expect(mid).not.toBe(senior);
  });

  it("survives missing optional fields without throwing", () => {
    const minimal = makeOfficer({ traits: [], factionAffiliation: null, age: undefined as unknown as number });
    expect(() => generateOfficerBio(minimal)).not.toThrow();
    const bio = generateOfficerBio(minimal);
    expect(bio.length).toBeGreaterThan(0);
  });
});

describe("generateCharacterBio", () => {
  it("is deterministic for identical inputs", () => {
    const a = generateCharacterBio(makeCharacter());
    const b = generateCharacterBio(makeCharacter());
    expect(a).toBe(b);
  });

  it("is deterministic regardless of trait order", () => {
    const a = generateCharacterBio(makeCharacter({ traits: ["greedy", "ruthless"] }));
    const b = generateCharacterBio(makeCharacter({ traits: ["ruthless", "greedy"] }));
    expect(a).toBe(b);
  });

  it("varies with id", () => {
    const a = generateCharacterBio(makeCharacter({ id: "npc-a" }));
    const b = generateCharacterBio(makeCharacter({ id: "npc-b" }));
    expect(a).not.toBe(b);
  });

  it("returns a non-empty string for every role", () => {
    for (const role of ALL_ROLES) {
      const bio = generateCharacterBio(makeCharacter({ role, id: `npc-${role}` }));
      expect(typeof bio).toBe("string");
      expect(bio.length).toBeGreaterThan(20);
      expect(bio.endsWith(".")).toBe(true);
    }
  });

  it("includes a faction line when character is aligned", () => {
    const bio = generateCharacterBio(makeCharacter({ factionId: "Crimson Syndicate" }));
    expect(bio).toContain("Crimson Syndicate");
  });

  it("injects trait flavor sentences for known traits", () => {
    const ruthless = generateCharacterBio(makeCharacter({ id: "ru", traits: ["ruthless"] }));
    expect(/dispute|body count/i.test(ruthless)).toBe(true);

    const greedy = generateCharacterBio(makeCharacter({ id: "gr", traits: ["greedy"] }));
    expect(/personal gain|squeezing/i.test(greedy)).toBe(true);
  });

  it("changes when traits change", () => {
    const a = generateCharacterBio(makeCharacter({ id: "shared", traits: ["loyal"] }));
    const b = generateCharacterBio(makeCharacter({ id: "shared", traits: ["corrupt"] }));
    expect(a).not.toBe(b);
  });

  it("ignores unknown traits without crashing", () => {
    expect(() =>
      generateCharacterBio(makeCharacter({ id: "u", traits: ["this_is_not_a_real_trait"] })),
    ).not.toThrow();
  });

  it("scales notoriety phrasing across thresholds", () => {
    const low = generateCharacterBio(makeCharacter({ id: "low", notoriety: 5 }));
    const mid = generateCharacterBio(makeCharacter({ id: "mid", notoriety: 45 }));
    const high = generateCharacterBio(makeCharacter({ id: "high", notoriety: 90 }));
    expect(low).not.toBe(mid);
    expect(mid).not.toBe(high);
  });
});

describe("CHARACTER_TRAIT_FLAVOR coverage", () => {
  // Guards against silent gaps when event/spawn code starts attaching new
  // trait strings to NamedCharacters. The canonical pool of trait strings
  // the engine defines is CITIZEN_TRAITS — every id should resolve to at
  // least one flavor sentence so bios never go blank for a known trait.
  it("has flavor for every CITIZEN_TRAITS id", () => {
    const missing = CITIZEN_TRAITS
      .map((t) => t.id)
      .filter((id) => !hasCharacterTraitFlavor(id));
    expect(missing).toEqual([]);
  });

  it("produces a non-empty bio when a known citizen trait is attached", () => {
    for (const trait of CITIZEN_TRAITS) {
      const bio = generateCharacterBio(
        makeCharacter({ id: `cov-${trait.id}`, traits: [trait.id] }),
      );
      expect(typeof bio).toBe("string");
      expect(bio.length).toBeGreaterThan(20);
    }
  });

  it("hasCharacterTraitFlavor lookup is case-insensitive", () => {
    expect(hasCharacterTraitFlavor("RUTHLESS")).toBe(true);
    expect(hasCharacterTraitFlavor("Risk_Taking")).toBe(true);
    expect(hasCharacterTraitFlavor("definitely_not_a_real_trait")).toBe(false);
  });
});

describe("sanitizer backfill helpers", () => {
  it("backfills officer.backstory when missing on load", async () => {
    const { backfillOfficerBackstories } = await import("@/engine/sanitizer");
    const officers = [makeOfficer({ id: "no-bio", name: "No Bio" }) as Officer];
    delete (officers[0] as Partial<Officer>).backstory;
    backfillOfficerBackstories(officers);
    expect(typeof officers[0].backstory).toBe("string");
    expect((officers[0].backstory ?? "").length).toBeGreaterThan(20);
  });

  it("backfills namedCharacter.backstory when missing on load", async () => {
    const { backfillCharacterBackstories } = await import("@/engine/sanitizer");
    const chars = [makeCharacter({ id: "no-bio-npc" }) as NamedCharacter];
    delete (chars[0] as Partial<NamedCharacter>).backstory;
    backfillCharacterBackstories(chars);
    expect(typeof chars[0].backstory).toBe("string");
    expect((chars[0].backstory ?? "").length).toBeGreaterThan(20);
  });

  it("preserves existing officer.backstory on load", async () => {
    const { backfillOfficerBackstories } = await import("@/engine/sanitizer");
    const officers = [makeOfficer({ id: "had-bio", backstory: "Already authored prose." }) as Officer];
    backfillOfficerBackstories(officers);
    expect(officers[0].backstory).toBe("Already authored prose.");
  });

  it("preserves existing namedCharacter.backstory on load", async () => {
    const { backfillCharacterBackstories } = await import("@/engine/sanitizer");
    const chars = [makeCharacter({ id: "had-bio-npc", backstory: "Already authored NPC bio." }) as NamedCharacter];
    backfillCharacterBackstories(chars);
    expect(chars[0].backstory).toBe("Already authored NPC bio.");
  });

  it("ignores non-array input without throwing", async () => {
    const { backfillOfficerBackstories, backfillCharacterBackstories } = await import("@/engine/sanitizer");
    expect(() => backfillOfficerBackstories(null as unknown)).not.toThrow();
    expect(() => backfillCharacterBackstories(undefined as unknown)).not.toThrow();
    expect(() => backfillOfficerBackstories("string" as unknown)).not.toThrow();
  });

  it("skips non-object entries within the array", async () => {
    const { backfillOfficerBackstories } = await import("@/engine/sanitizer");
    const list: unknown[] = [null, undefined, makeOfficer({ id: "valid" })];
    delete (list[2] as Partial<Officer>).backstory;
    expect(() => backfillOfficerBackstories(list)).not.toThrow();
    expect(typeof (list[2] as Officer).backstory).toBe("string");
  });
});
