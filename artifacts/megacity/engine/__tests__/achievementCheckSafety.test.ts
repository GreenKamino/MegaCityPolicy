/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { ALL_BASE_ACHIEVEMENTS } from "@/engine/achievements";
import { createInitialState } from "@/engine/initialState";

/**
 * Drift guard: achievement check-function safety.
 *
 * Every achievement entry has:
 *   check: (s: GameState) => boolean
 *
 * These closures read state fields by name. A typo
 * (`s.cityStats.popultaion`) compiles fine because TypeScript can't
 * fully constrain `s` shape against arbitrary nested record reads
 * (many fields are typed `Record<string, number>`), and the
 * resulting `undefined >= N` comparison silently evaluates to false
 * forever. The achievement just never unlocks.
 *
 * Worse: some checks index into nested records that may not exist
 * yet on a fresh state, e.g. `s.buildings.foo` where `foo` is added
 * only after the first construction. If the access chain assumes
 * intermediate structure that is missing, the check throws and (at
 * the call site) crashes the entire achievement evaluation pass.
 *
 * This guard runs every check exactly once against a freshly-minted
 * initial state and asserts:
 *   1. No check throws.
 *   2. Every check returns a boolean (never undefined / NaN /
 *      non-boolean — those would lie to the unlock pipeline).
 *   3. The count of checks that return true on createInitialState()
 *      is pinned. Note: createInitialState() in this codebase
 *      returns a heavily SEEDED PLAYTEST baseline (~30+ buildings,
 *      2000+ army, 500k+ credits, big-brother addon active,
 *      surveillance + propaganda + gangsPatrolled all on, several
 *      townships allied, locations discovered). It is NOT the
 *      actual new-player state — the new-player flow scrubs many
 *      of these via character creation and intro overlays. The
 *      pinned count therefore guards "playtest seed unlock surface"
 *      rather than "day-zero unlocks", but still catches:
 *        - new check polarities accidentally inverted,
 *        - new threshold values low enough to fire on the seed,
 *        - new state defaults that satisfy existing checks.
 */

const PLAYTEST_SEED_UNLOCK_ALLOWLIST: readonly { id: string; note: string }[] = [
  { id: "first-save", note: "saveSlot >= 0; seed has saveSlot=0 → fires." },
  { id: "first-build", note: "totalBuildings(s) > 30; seed has >30 buildings." },
  { id: "build-50", note: "totalBuildings(s) >= 50; seed satisfies." },
  { id: "credits-10k", note: "credits >= 10000; seed has more." },
  { id: "credits-100k", note: "credits >= 100000; seed has more." },
  { id: "credits-500k", note: "credits >= 500000; seed has more." },
  { id: "army-100", note: "totalUnits(s) >= 100; seed has more." },
  { id: "army-500", note: "totalUnits(s) >= 500; seed has more." },
  { id: "army-2000", note: "totalUnits(s) >= 2000; seed has more." },
  { id: "first-gunship", note: "judgeGunships >= 1; seed has at least 1." },
  { id: "defense-50", note: "defenseRating >= 50; seed exceeds." },
  { id: "wasteland-explorer", note: "5 notableLocations discovered in seed." },
  { id: "township-diplomat", note: "3 allied townships in seed." },
  { id: "bb-activated", note: "addons['big-brother'] active in seed." },
  { id: "first-contact", note: "seed has at least two active external megacities." },
  {
    id: "atr-informant-state",
    note:
      "surveillance + propaganda + gangsPatrolled all true in seed (TRUST NO ONE).",
  },
];

describe("achievement check function safety (drift guard)", () => {
  const cat = ALL_BASE_ACHIEVEMENTS;
  const fresh = createInitialState();

  it("every check function executes without throwing on initial state", () => {
    const failures: { id: string; error: string }[] = [];
    for (const a of cat) {
      try {
        a.check(fresh);
      } catch (err) {
        failures.push({
          id: a.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (failures.length > 0) {
      console.error(
        "[ach] check functions throwing on initial state:",
        failures,
      );
    }
    expect(failures).toEqual([]);
  });

  it("every check function returns a strict boolean", () => {
    const bad: { id: string; returned: string }[] = [];
    for (const a of cat) {
      let result: unknown;
      try {
        result = a.check(fresh);
      } catch {
        // already covered by previous test; skip to avoid double-reporting
        continue;
      }
      if (typeof result !== "boolean") {
        bad.push({ id: a.id, returned: `${typeof result}: ${String(result)}` });
      }
    }
    if (bad.length > 0) {
      console.error("[ach] check functions returning non-boolean:", bad);
    }
    expect(bad).toEqual([]);
  });

  it("playtest seed unlock surface stays pinned to allowlist", () => {
    const allowed = new Set(PLAYTEST_SEED_UNLOCK_ALLOWLIST.map((e) => e.id));
    const firing: string[] = [];
    for (const a of cat) {
      try {
        if (a.check(fresh) === true) firing.push(a.id);
      } catch {
        // covered by previous test
      }
    }
    const firingSet = new Set(firing);
    const unexpected = firing.filter((id) => !allowed.has(id)).sort();
    const stale = [...allowed].filter((id) => !firingSet.has(id)).sort();
    if (unexpected.length > 0) {
      console.error(
        "[ach] NEW achievements firing on the playtest seed (unexpected):",
        unexpected,
      );
    }
    if (stale.length > 0) {
      console.error(
        "[ach] PLAYTEST_SEED_UNLOCK_ALLOWLIST entries no longer firing — prune:",
        stale,
      );
    }
    expect({ unexpected, stale }).toEqual({ unexpected: [], stale: [] });
  });
});
