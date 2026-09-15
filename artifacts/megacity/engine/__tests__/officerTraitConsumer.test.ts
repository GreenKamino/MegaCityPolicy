import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { TRAIT_DEFS } from "@/engine/officers";
import type { OfficerTrait } from "@/engine/types";

/**
 * Officer trait consumer drift guard.
 *
 * `OfficerTrait` is a 32-member string union. Each trait has a TRAIT_DEFS
 * entry with `effects: string` (human-readable description) and is
 * pickable by `pickTraits` (officers.ts) — meaning officers receive
 * these traits at random and the description is shown in the UI.
 *
 * Whether a trait actually CHANGES gameplay depends on whether anything
 * downstream reads it. The relevant gameplay-read patterns are:
 *   - `case "X":`         (in tickProcessors per-trait switches)
 *   - `traits.includes("X")` / `traits?.includes("X")`
 *   - `trait === "X"`
 *
 * If a trait is declared and pickable but never read, the description
 * string promises an effect that the engine never delivers — a content
 * lie. This audit pins the current set of "flavor-only" traits as
 * documented debt and fails on either growth or unannounced wiring.
 *
 * Notes:
 *   - `ensureTrait("X")` / `dropTrait("X")` in officerLifecycle.ts
 *     GRANT/REMOVE traits but don't read them for gameplay effect.
 *     They are excluded from the read scan on purpose.
 *   - `engine/traits.ts` exports CITIZEN_TRAITS — a separate citizen
 *     trait registry, not OfficerTrait. Out of scope for this audit.
 */

const ENGINE_DIR = path.resolve(__dirname, "..");

const ALL_OFFICER_TRAITS: ReadonlySet<OfficerTrait> = new Set(
  TRAIT_DEFS.map((t) => t.id),
);

/** Engine source files (excluding tests, fixtures, and addon subdirs we
 *  don't want to descend manually). Returns absolute paths. */
function listEngineSources(): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  }
  walk(ENGINE_DIR);
  return out;
}

const TRAIT_ALTERNATION = [...ALL_OFFICER_TRAITS]
  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/** Patterns that count as a gameplay-read of a trait. */
const READ_PATTERNS: RegExp[] = [
  new RegExp(`case\\s+"(${TRAIT_ALTERNATION})"\\s*:`, "g"),
  new RegExp(`traits\\??\\.includes\\("(${TRAIT_ALTERNATION})"\\)`, "g"),
  new RegExp(`trait\\s*===\\s*"(${TRAIT_ALTERNATION})"`, "g"),
];

/** Names that look like a read but are actually grants/drops, not reads. */
const READ_BLACKLIST_FILES = new Set<string>([
  // officerLifecycle ensureTrait/dropTrait are grants, not reads.
  path.join(ENGINE_DIR, "officerLifecycle.ts"),
]);

const TRAITS_READ: Set<OfficerTrait> = (() => {
  const found = new Set<OfficerTrait>();
  for (const file of listEngineSources()) {
    if (READ_BLACKLIST_FILES.has(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const re of READ_PATTERNS) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) found.add(m[1] as OfficerTrait);
    }
  }
  return found;
})();

/**
 * Documented content debt: traits declared in OfficerTrait, advertised
 * via TRAIT_DEFS.effects strings, randomly picked by pickTraits, but
 * never read by any gameplay code path.
 *
 * Subgroups (informational):
 *   - lifecycle-grant flair (granted by officerLifecycle but never read):
 *       seasoned, tenured, loyal_lifer, embittered
 *   - random-pool flair (pickable by pickTraits but never read):
 *       perfectionist, delegator, micromanager, reformist,
 *       populist, paranoid, diplomat, ruthless,
 *       veteran, intelligence_officer, peacekeeper, enforcer
 */
const FLAVOR_ONLY_ALLOWLIST: ReadonlySet<OfficerTrait> = new Set<OfficerTrait>([
  "perfectionist", "delegator", "micromanager",
  "reformist", "populist", "paranoid", "diplomat", "ruthless",
  "veteran", "intelligence_officer", "peacekeeper", "enforcer",
  "seasoned", "tenured", "loyal_lifer", "embittered",
]);

describe("OfficerTrait -> gameplay consumer wiring", () => {
  it("OfficerTrait union and TRAIT_DEFS catalog stay in sync", () => {
    expect(ALL_OFFICER_TRAITS.size).toBe(32);
    // Sanity: TRAIT_DEFS has no duplicate ids.
    const ids = TRAIT_DEFS.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("every trait read by gameplay code is a real OfficerTrait member", () => {
    // Type system already enforces this for `trait === "X"` literal
    // matches, but the regex picks up strings — guard against typos
    // anywhere a string literal sneaks past the type system.
    const stray = [...TRAITS_READ].filter((t) => !ALL_OFFICER_TRAITS.has(t));
    expect(stray, "Source code reads a trait literal not in OfficerTrait").toEqual([]);
  });

  it("no NEW flavor-only trait appears (allowlist exhaustive)", () => {
    const declaredButUnread: OfficerTrait[] = [];
    for (const t of ALL_OFFICER_TRAITS) {
      if (TRAITS_READ.has(t)) continue;
      if (!FLAVOR_ONLY_ALLOWLIST.has(t)) declaredButUnread.push(t);
    }
    expect(
      declaredButUnread,
      "New OfficerTrait declared but never read by gameplay — wire it up or add to FLAVOR_ONLY_ALLOWLIST as documented debt",
    ).toEqual([]);
  });

  it("staleness sibling: every allowlisted trait is still unread (or removed)", () => {
    const nowWired: OfficerTrait[] = [];
    const removed: OfficerTrait[] = [];
    for (const t of FLAVOR_ONLY_ALLOWLIST) {
      if (TRAITS_READ.has(t)) nowWired.push(t);
      if (!ALL_OFFICER_TRAITS.has(t)) removed.push(t);
    }
    expect(
      nowWired,
      "Allowlisted flavor-only trait is now read by gameplay — drop it from FLAVOR_ONLY_ALLOWLIST",
    ).toEqual([]);
    expect(
      removed,
      "Allowlisted trait no longer exists in OfficerTrait — drop it from FLAVOR_ONLY_ALLOWLIST",
    ).toEqual([]);
  });
});
