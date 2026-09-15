import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMPANION_MISSION_DEFS,
  type MissionOutcome,
} from "@/engine/companionMissions";
import {
  MEGA_PROJECTS,
  type MegaProjectId,
  type MegaProjectPhase,
} from "@/engine/megaProjects";
import { type PropagandaTone } from "@/engine/propaganda";

/**
 * Drift guard: propaganda / companion-mission / mega-project unions.
 *
 *   PropagandaTone(5)        ↔ TEMPLATES[].tone usage in
 *                               engine/propaganda.ts. Every union
 *                               member must be claimed by ≥1
 *                               template; orphan tone = dead voice.
 *
 *   MissionOutcome(3)        ↔ resolveMission()'s outcome assignments
 *                               in engine/companionMissions.ts. All
 *                               three outcomes must be reachable AND
 *                               COMPANION_MISSION_DEFS must declare
 *                               at least one mission per category
 *                               (recon/combat/logistics/covert/social).
 *
 *   MegaProjectPhase(4)      ↔ literal-order pinned
 *                               locked → planning → construction →
 *                               operational AND every non-locked
 *                               phase is reachable from project
 *                               progression source code.
 *
 *   MegaProjectId(12)        ↔ MEGA_PROJECTS catalog (1:1, unique
 *                               ids, monotonically usable defs).
 */

const PROPAGANDA_SRC = readFileSync(
  join(__dirname, "..", "propaganda.ts"),
  "utf8",
);
const MISSION_SRC = readFileSync(
  join(__dirname, "..", "companionMissions.ts"),
  "utf8",
);
const MEGA_SRC = readFileSync(
  join(__dirname, "..", "megaProjects.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const PROPAGANDA_TONE = parseUnion(PROPAGANDA_SRC, "PropagandaTone");
const MISSION_OUTCOME = parseUnion(MISSION_SRC, "MissionOutcome");
const MEGA_PHASE = parseUnion(MEGA_SRC, "MegaProjectPhase");
const MEGA_ID = parseUnion(MEGA_SRC, "MegaProjectId");

const PHASE_ORDER: MegaProjectPhase[] = [
  "locked",
  "planning",
  "construction",
  "operational",
];

const MISSION_CATEGORIES = [
  "recon",
  "combat",
  "logistics",
  "covert",
  "social",
] as const;

describe("propaganda / mission / mega-project union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(PROPAGANDA_TONE.length).toBe(5);
    expect(MISSION_OUTCOME.length).toBe(3);
    expect(MEGA_PHASE.length).toBe(4);
    expect(MEGA_ID.length).toBe(12);
  });

  it("PropagandaTone — every union member is claimed by ≥1 TEMPLATE entry", () => {
    const tones = new Set<string>();
    const re = /tone:\s*"([a-zA-Z_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(PROPAGANDA_SRC)) !== null) tones.add(m[1]);
    const known = new Set(PROPAGANDA_TONE);
    for (const t of tones) {
      expect(known.has(t), `template uses unknown tone ${t}`).toBe(true);
    }
    const orphan = PROPAGANDA_TONE.filter((t) => !tones.has(t));
    expect(orphan, "PropagandaTone members unused in TEMPLATES").toEqual([]);
  });

  it("MissionOutcome — all three outcomes are reachable in resolveMission", () => {
    // resolveMission emits outcomes via assignment branches; every
    // union literal must show up in at least one `outcome = "..."`
    // or `outcome: "..."` site within companionMissions.ts.
    const known = new Set(MISSION_OUTCOME);
    const used = new Set<string>();
    const re = /outcome\s*[:=]\s*"([a-zA-Z]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(MISSION_SRC)) !== null) {
      if (known.has(m[1])) used.add(m[1]);
    }
    const orphan = MISSION_OUTCOME.filter((o) => !used.has(o));
    expect(orphan, "MissionOutcome members never assigned").toEqual([]);
    // Pin literal order success/partial/failure as the canonical
    // best→worst tier so any reorder that breaks ranking surfaces.
    expect(MISSION_OUTCOME).toEqual(["success", "partial", "failure"]);
  });

  it("COMPANION_MISSION_DEFS — every category declared in the union is represented by ≥1 mission", () => {
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const m of COMPANION_MISSION_DEFS) {
      expect(ids.has(m.id), `duplicate mission id ${m.id}`).toBe(false);
      ids.add(m.id);
      used.add(m.category);
      expect(m.minLevel).toBeGreaterThanOrEqual(1);
      expect(m.durationTicks).toBeGreaterThan(0);
      expect(m.failureChanceBase).toBeGreaterThanOrEqual(0);
      expect(m.injuryChance).toBeGreaterThanOrEqual(0);
    }
    for (const cat of MISSION_CATEGORIES) {
      expect(used.has(cat), `category ${cat} has no missions`).toBe(true);
    }
  });

  it("MegaProjectPhase — literal order pinned locked→planning→construction→operational and all phases referenced in source", () => {
    expect(MEGA_PHASE).toEqual(PHASE_ORDER);
    for (const p of PHASE_ORDER) {
      expect(MEGA_SRC, `phase ${p} not referenced`).toContain(`"${p}"`);
    }
    // Initial-state writes/reads spawn every project with phase "locked";
    // ensure that anchor exists explicitly as a phase assignment.
    expect(MEGA_SRC).toMatch(/phase:\s*"(locked|planning|construction|operational)"/);
  });

  it("MEGA_PROJECTS catalog matches MegaProjectId 1:1 with sane budget invariants", () => {
    const want = [...MEGA_ID].sort();
    const got = MEGA_PROJECTS.map((p) => p.id as string).sort();
    expect(got).toEqual(want);
    const ids = new Set<string>();
    for (const p of MEGA_PROJECTS) {
      expect(ids.has(p.id), `duplicate project id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.flavorText.length).toBeGreaterThan(0);
      expect(p.planningCost).toBeGreaterThan(0);
      expect(p.constructionCost).toBeGreaterThan(0);
      expect(p.steelCost).toBeGreaterThan(0);
      expect(p.ticksToComplete).toBeGreaterThan(0);
      expect(p.workforceRequired).toBeGreaterThan(0);
      expect(p.completionEffects.length).toBeGreaterThan(0);
      expect(p.requirements.minPopulation).toBeGreaterThan(0);
      expect(p.requirements.minCredits).toBeGreaterThan(0);
      expect(p.requirements.minSteel).toBeGreaterThan(0);
    }
    // Touch the type so an accidental drop of MegaProjectId still
    // surfaces here even if the catalog drifted alongside it.
    const sample: MegaProjectId = MEGA_PROJECTS[0].id;
    expect(typeof sample).toBe("string");
  });
});
