import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ROLE_LABEL,
  ROLE_ICON,
  ROLE_ORDER,
  type LoadoutRole,
} from "@/engine/loadout";
import {
  DEFAULT_TRAIT_VISUAL,
  type TraitColorKey,
} from "@/engine/traitIcons";
import type { ReputationGrade } from "@/engine/prestige";
import type { OfficerExitReason } from "@/engine/types";

/**
 * Drift guard: secondary unions binding to siblings, parsed
 * source-of-truth literal sets, and switch-case coverage.
 *
 *   LoadoutRole(6)        ↔ ROLE_LABEL / ROLE_ICON / ROLE_ORDER
 *                            (3 sibling Records / array, all 1:1)
 *                          + summarizeLoadoutByRole + getAvailableUnitsByRole
 *                            object literals parsed from source list
 *                            every union member.
 *                          + COMPOSITION_RECIPES.troop_assault default
 *                            uses only known roles.
 *
 *   TraitColorKey(6)      ↔ TRAIT_RULES.visual.color literal set parsed
 *                            from source — every authored color is in
 *                            the union; every union member used by ≥1
 *                            rule (no orphan tag).
 *                          + DEFAULT_TRAIT_VISUAL.color in union.
 *
 *   ReputationGrade(6)    ↔ calculateReputationScore branches parsed:
 *                            grade literal assignments (initial "F" +
 *                            5 if-else thresholds) cover the union.
 *                          + thresholds are strictly descending.
 *
 *   OfficerExitReason(4)  ↔ assigned exitReason literals across the
 *                            officerLifecycle.ts + officerActions.ts
 *                            sources; "died" / "retired" / "scandal"
 *                            handled by reasonText switch in lifecycle.
 */

const LOADOUT_SRC = readFileSync(
  join(__dirname, "..", "loadout.ts"),
  "utf8",
);
const TRAIT_SRC = readFileSync(
  join(__dirname, "..", "traitIcons.ts"),
  "utf8",
);
const PRESTIGE_SRC = readFileSync(
  join(__dirname, "..", "prestige.ts"),
  "utf8",
);
const OFFICER_LIFECYCLE_SRC = readFileSync(
  join(__dirname, "..", "officerLifecycle.ts"),
  "utf8",
);
const OFFICER_ACTIONS_SRC = readFileSync(
  join(__dirname, "..", "officerActions.ts"),
  "utf8",
);
const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const LOADOUT_ROLE = parseUnion(LOADOUT_SRC, "LoadoutRole");
const TRAIT_COLOR_KEY = parseUnion(TRAIT_SRC, "TraitColorKey");
const REPUTATION_GRADE = parseUnion(PRESTIGE_SRC, "ReputationGrade");
const OFFICER_EXIT_REASON = parseUnion(TYPES_SRC, "OfficerExitReason");

describe("loadout / trait / reputation / exit union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(LOADOUT_ROLE.length).toBe(6);
    expect(TRAIT_COLOR_KEY.length).toBe(6);
    expect(REPUTATION_GRADE.length).toBe(6);
    expect(OFFICER_EXIT_REASON.length).toBe(4);
  });

  it("ROLE_LABEL, ROLE_ICON, ROLE_ORDER all cover LoadoutRole exactly (1:1, no dupes)", () => {
    const want = [...LOADOUT_ROLE].sort();
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(want);
    expect(Object.keys(ROLE_ICON).sort()).toEqual(want);
    expect([...ROLE_ORDER].sort()).toEqual(want);
    expect(new Set(ROLE_ORDER).size).toBe(ROLE_ORDER.length);
    for (const r of LOADOUT_ROLE) {
      const role = r as LoadoutRole;
      expect(ROLE_LABEL[role].length).toBeGreaterThan(0);
      expect(ROLE_ICON[role].length).toBeGreaterThan(0);
    }
  });

  it("loadout.ts initial-object literals (summarizeLoadoutByRole / getAvailableUnitsByRole) list every LoadoutRole", () => {
    // Both helpers seed an `out` object literal with every role key. If a
    // role is added to the union but not seeded, the runtime accumulator
    // would crash on the first hit. Verify by parsing each helper's body.
    const sumBody = LOADOUT_SRC.match(
      /summarizeLoadoutByRole[\s\S]*?const out: Record<LoadoutRole[\s\S]*?\{([\s\S]*?)\};/,
    );
    expect(sumBody, "summarizeLoadoutByRole 'out' literal not found").not.toBeNull();
    // Match only the top-level role keys (each followed by a `{ count`
    // initializer), ignoring nested `count:` / `strength:` fields.
    const sumKeys = (sumBody![1].match(/\b(\w+):\s*\{\s*count/g) ?? []).map((s) =>
      s.match(/(\w+):/)![1],
    );
    expect([...new Set(sumKeys)].sort()).toEqual([...LOADOUT_ROLE].sort());

    const availBody = LOADOUT_SRC.match(
      /getAvailableUnitsByRole[\s\S]*?const out: Record<LoadoutRole[\s\S]*?\{([\s\S]*?)\};/,
    );
    expect(availBody, "getAvailableUnitsByRole 'out' literal not found").not.toBeNull();
    // Each role key initializes to `[]`.
    const availKeys = (availBody![1].match(/\b(\w+):\s*\[\s*\]/g) ?? []).map((s) =>
      s.match(/(\w+):/)![1],
    );
    expect([...new Set(availKeys)].sort()).toEqual([...LOADOUT_ROLE].sort());
  });

  it("COMPOSITION_RECIPES.troop_assault default-fallback recipe references only known LoadoutRoles with valid weights", () => {
    const m = LOADOUT_SRC.match(
      /troop_assault:\s*\{([^}]*)\}/,
    );
    expect(m, "troop_assault recipe not found").not.toBeNull();
    const known = new Set(LOADOUT_ROLE);
    const entries = m![1].match(/(\w+):\s*([0-9.]+)/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    let total = 0;
    for (const e of entries) {
      const [, role, weight] = e.match(/(\w+):\s*([0-9.]+)/)!;
      expect(known.has(role), `troop_assault references unknown role ${role}`).toBe(true);
      const w = parseFloat(weight);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
      total += w;
    }
    // Recipe weights conventionally sum to ~1.
    expect(total).toBeGreaterThan(0.95);
    expect(total).toBeLessThan(1.05);
  });

  it("every TRAIT_RULES.visual.color literal in traitIcons.ts is in TraitColorKey union", () => {
    const colors = (
      TRAIT_SRC.match(/color:\s*"([a-zA-Z]+)"/g) ?? []
    ).map((s) => s.match(/"([^"]+)"/)![1]);
    const known = new Set(TRAIT_COLOR_KEY);
    expect(colors.length).toBeGreaterThan(20);
    const unknown = [...new Set(colors)].filter((c) => !known.has(c));
    expect(unknown, "TRAIT_RULES color literal not in union").toEqual([]);
  });

  it("every TraitColorKey union member is used by ≥1 TRAIT_RULES rule (no orphan token)", () => {
    const colors = new Set(
      (TRAIT_SRC.match(/color:\s*"([a-zA-Z]+)"/g) ?? []).map(
        (s) => s.match(/"([^"]+)"/)![1],
      ),
    );
    const orphan = TRAIT_COLOR_KEY.filter((c) => !colors.has(c));
    expect(orphan, "TraitColorKey members unused by any rule").toEqual([]);
    // DEFAULT_TRAIT_VISUAL.color must also be in the union.
    expect(
      (TRAIT_COLOR_KEY as string[]).includes(DEFAULT_TRAIT_VISUAL.color),
    ).toBe(true);
  });

  it("calculateReputationScore branches cover ReputationGrade exactly with strictly descending thresholds", () => {
    // grade default + 5 grade assignments.
    const m = PRESTIGE_SRC.match(
      /function calculateReputationScore[\s\S]*?return \{ score: total/,
    );
    expect(m, "calculateReputationScore body not found").not.toBeNull();
    const body = m![0];
    // Initial: `let grade: ReputationGrade = "F";`
    const initial = body.match(/let grade:\s*ReputationGrade\s*=\s*"([A-Z])"/);
    expect(initial, "initial grade assignment not found").not.toBeNull();
    // Branches: `if (total >= N) grade = "X";` and chained `else if`s.
    const branches = (
      body.match(/if\s*\(total\s*>=\s*(\d+)\)\s*grade\s*=\s*"([A-Z])"/g) ?? []
    ).map((s) => {
      const mm = s.match(/>=\s*(\d+)\)\s*grade\s*=\s*"([A-Z])"/)!;
      return { threshold: parseInt(mm[1], 10), grade: mm[2] };
    });
    const grades = new Set<string>([initial![1], ...branches.map((b) => b.grade)]);
    expect([...grades].sort()).toEqual([...REPUTATION_GRADE].sort());
    // Thresholds strictly descending in source order (highest grade first).
    for (let i = 1; i < branches.length; i++) {
      expect(
        branches[i].threshold,
        `threshold for ${branches[i].grade} not less than ${branches[i - 1].grade}`,
      ).toBeLessThan(branches[i - 1].threshold);
    }
  });

  it("OfficerExitReason: every assigned exitReason literal across lifecycle/actions is in the union", () => {
    const known = new Set(OFFICER_EXIT_REASON);
    const collected = new Set<string>();
    for (const src of [OFFICER_LIFECYCLE_SRC, OFFICER_ACTIONS_SRC]) {
      for (const m of src.match(/exitReason:\s*"([a-z]+)"/g) ?? []) {
        collected.add(m.match(/"([^"]+)"/)![1]);
      }
    }
    expect(collected.size).toBeGreaterThan(0);
    const unknown = [...collected].filter((r) => !known.has(r));
    expect(unknown, "exitReason literal outside union").toEqual([]);
  });

  it("officerLifecycle reasonText switch covers OfficerExitReason exactly (3 if-branches + final else)", () => {
    // The chain: reason === "died" / "retired" / "scandal" / else
    // (else handles "dismissed"). Pin that the three explicit literals
    // are present and that exactly one union member is left for the else.
    const m = OFFICER_LIFECYCLE_SRC.match(
      /const reasonText\s*=\s*([\s\S]*?);\s*\n/,
    );
    expect(m, "reasonText chain not found").not.toBeNull();
    const explicit = new Set(
      (m![1].match(/reason === "([a-z]+)"/g) ?? []).map(
        (s) => s.match(/"([^"]+)"/)![1],
      ),
    );
    const known = new Set(OFFICER_EXIT_REASON);
    for (const r of explicit) {
      expect(known.has(r), `reasonText handles unknown reason ${r}`).toBe(true);
    }
    const unhandled = [...known].filter((r) => !explicit.has(r));
    expect(
      unhandled.length,
      "reasonText else-branch must handle exactly 1 union member",
    ).toBe(1);
  });

  // tsc reachability anchors for parsed-only unions.
  it("type-side anchors compile", () => {
    const _grade: ReputationGrade[] = REPUTATION_GRADE as ReputationGrade[];
    const _exit: OfficerExitReason[] = OFFICER_EXIT_REASON as OfficerExitReason[];
    const _color: TraitColorKey[] = TRAIT_COLOR_KEY as TraitColorKey[];
    expect(_grade.length + _exit.length + _color.length).toBe(
      REPUTATION_GRADE.length + OFFICER_EXIT_REASON.length + TRAIT_COLOR_KEY.length,
    );
  });
});
