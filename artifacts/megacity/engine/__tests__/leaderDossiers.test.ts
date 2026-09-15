import { describe, expect, it } from "vitest";

import { getLeaderDossier, LEADER_DOSSIERS, type LeaderDossier } from "@/engine/leaderDossiers";
import { createInitialState } from "@/engine/initialState";
import type { FactionLeader } from "@/engine/types";

/**
 * Leaders that intentionally have neither a `portraitId` nor a slug-matching
 * dossier entry. These resolve to `null` from `getLeaderDossier` in-game
 * (no Codex entry, no intercepted quotes). Documented here so:
 *   - Adding a new leader without a dossier fails CI immediately.
 *   - Removing a name from this list without writing a dossier also fails.
 *   - The current authoring debt is visible in one place.
 *
 * To clear an entry: add a dossier in `engine/leaderDossiers.ts` keyed by
 * either the leader's `portraitId` or the slug of their `name`, then remove
 * the name below.
 */
const UNDOSSIERED_LEADERS_ALLOWLIST = new Set<string>([
  // All previously-undossiered leaders now have authored dossiers in
  // engine/leaderDossiers.ts. Add a name here only if a new leader is
  // intentionally shipped without one (see the doc comment above).
  "Mexico City Civil Protection Directorate",
]);

function collectLeaders(): FactionLeader[] {
  const leaders: FactionLeader[] = [];
  const state = createInitialState();
  for (const f of state.factions ?? []) {
    if (f.leader) leaders.push(f.leader);
  }
  for (const t of state.townships ?? []) {
    if (t.leader) leaders.push(t.leader);
  }
  for (const m of state.externalMegacities ?? []) {
    if (m.leader) leaders.push(m.leader);
  }
  return leaders;
}

describe("LEADER_DOSSIERS coverage", () => {
  const leaders = collectLeaders();

  it("seeds at least one leader from initialState", () => {
    expect(leaders.length).toBeGreaterThan(0);
  });

  it("provides a dossier for every leader with a portraitId", () => {
    const missing: string[] = [];
    for (const leader of leaders) {
      if (!leader.portraitId) continue;
      if (!LEADER_DOSSIERS[leader.portraitId]) {
        missing.push(`${leader.name} (${leader.portraitId})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("resolves every seeded leader through getLeaderDossier or documents the gap", () => {
    const slugify = (n: string) =>
      n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const unresolvedUnexpected: string[] = [];
    const allowedButResolved: string[] = [];
    for (const leader of leaders) {
      // "Unknown" is the documented placeholder for the Unknown Faction —
      // it has no portrait, no dossier, and no in-game identity by design.
      if (leader.name === "Unknown") continue;
      const resolved = getLeaderDossier(leader);
      const isAllowed = UNDOSSIERED_LEADERS_ALLOWLIST.has(leader.name);
      const diag = `${leader.name} (portraitId=${leader.portraitId ?? "none"}, slug=${slugify(leader.name)})`;
      if (!resolved && !isAllowed) {
        unresolvedUnexpected.push(diag);
      }
      if (resolved && isAllowed) {
        allowedButResolved.push(`${diag} → resolved as "${resolved.name}"`);
      }
    }
    expect(
      unresolvedUnexpected,
      "Leader added without a dossier — author one in engine/leaderDossiers.ts or add to UNDOSSIERED_LEADERS_ALLOWLIST",
    ).toEqual([]);
    expect(
      allowedButResolved,
      "Leader now has a dossier — remove from UNDOSSIERED_LEADERS_ALLOWLIST",
    ).toEqual([]);
  });

  it("allowlist only references leaders that actually exist in initialState", () => {
    const seededNames = new Set(leaders.map((l) => l.name));
    const stale = [...UNDOSSIERED_LEADERS_ALLOWLIST].filter((n) => !seededNames.has(n));
    expect(
      stale,
      "UNDOSSIERED_LEADERS_ALLOWLIST entry no longer matches any seeded leader — remove it",
    ).toEqual([]);
  });

  it("dossiers expose all required fields with non-empty content", () => {
    for (const [key, dossier] of Object.entries(LEADER_DOSSIERS) as [string, LeaderDossier][]) {
      expect(dossier.name, `${key}.name`).toBeTruthy();
      expect(dossier.title, `${key}.title`).toBeTruthy();
      expect(dossier.affiliation, `${key}.affiliation`).toBeTruthy();
      expect(dossier.clearanceLevel, `${key}.clearanceLevel`).toBeTruthy();
      expect(dossier.physicalDescription.length, `${key}.physicalDescription`).toBeGreaterThan(40);
      expect(dossier.background.length, `${key}.background`).toBeGreaterThan(40);
      expect(dossier.psychProfile.length, `${key}.psychProfile`).toBeGreaterThan(40);
      expect(dossier.tacticalAssessment.length, `${key}.tacticalAssessment`).toBeGreaterThan(40);
      expect(dossier.recommendedApproach.length, `${key}.recommendedApproach`).toBeGreaterThan(40);
      expect(dossier.knownAssociates.length, `${key}.knownAssociates`).toBeGreaterThanOrEqual(3);
      expect(dossier.interceptedQuotes.length, `${key}.interceptedQuotes`).toBeGreaterThanOrEqual(2);
      expect(dossier.interceptedQuotes.length, `${key}.interceptedQuotes`).toBeLessThanOrEqual(5);
      for (const associate of dossier.knownAssociates) {
        expect(associate.length, `${key}.knownAssociates entry`).toBeGreaterThan(10);
      }
      for (const quote of dossier.interceptedQuotes) {
        expect(quote.length, `${key}.interceptedQuotes entry`).toBeGreaterThan(10);
      }
      expect(["MINIMAL", "LOW", "MODERATE", "HIGH", "CRITICAL", "UNKNOWN"]).toContain(dossier.threatLevel);
    }
  });
});

describe("getLeaderDossier", () => {
  it("returns null for missing leader", () => {
    expect(getLeaderDossier(null)).toBeNull();
    expect(getLeaderDossier(undefined)).toBeNull();
  });

  it("resolves by portraitId when present", () => {
    const leader: FactionLeader = {
      name: "Grand Marshal Draven Korr",
      title: "Chief of the Authority",
      attitude: "neutral",
      goals: [],
      personalityTraits: [],
      portraitId: "draven_korr",
    };
    const dossier = getLeaderDossier(leader);
    expect(dossier).not.toBeNull();
    expect(dossier?.name).toBe("Grand Marshal Draven Korr");
  });

  it("falls back to a name-slug lookup when no portraitId is set", () => {
    const leader: FactionLeader = {
      name: "Commander Silas Root",
      title: "Keeper of the Last Garden",
      attitude: "neutral",
      goals: [],
      personalityTraits: [],
    };
    const dossier = getLeaderDossier(leader);
    expect(dossier).not.toBeNull();
    expect(dossier?.affiliation).toBe("deep-root-collective");
  });

  it("supports documented abbreviated identities without partial-name matching", () => {
    const leader: FactionLeader = {
      name: "The Listener",
      title: "Voice Beyond the Static",
      attitude: "neutral",
      goals: [],
      personalityTraits: [],
      portraitId: "wrong_portrait_id",
    };
    expect(getLeaderDossier(leader)?.affiliation).toBe("ghost-relay");
  });

  it("prefers the leader name over a stale portraitId", () => {
    const leader: FactionLeader = {
      name: "Commander Silas Root",
      title: "Decoy",
      attitude: "neutral",
      goals: [],
      personalityTraits: [],
      portraitId: "draven_korr",
    };
    const dossier = getLeaderDossier(leader);
    expect(dossier?.name).toBe("Commander Silas Root");
    expect(dossier?.affiliation).toBe("deep-root-collective");
  });

  it("rejects a portrait dossier when it belongs to a different leader", () => {
    const leader: FactionLeader = {
      name: "Uncatalogued Leader",
      title: "Unknown",
      attitude: "neutral",
      goals: [],
      personalityTraits: [],
      portraitId: "draven_korr",
    };
    expect(getLeaderDossier(leader)).toBeNull();
  });

  it("returns null when no dossier matches", () => {
    const leader: FactionLeader = {
      name: "Nobody In Particular",
      title: "Person",
      attitude: "neutral",
      goals: [],
      personalityTraits: [],
      portraitId: "definitely_not_real_12345",
    };
    expect(getLeaderDossier(leader)).toBeNull();
  });
});
