import { describe, expect, it } from "vitest";
import {
  EVENT_ONLY_ACTION_RULES,
  getDiplomacyCooldownRemaining,
  recordDiplomaticAction,
  type DiplomaticActionEffects,
  type EventOnlyActionId,
} from "../diplomacyEngine";
import type { GameState } from "../types";

// These guards keep the faction-screen sandbox catalog wired up. Every
// event-only action MUST appear in:
//   - partnerLedger ACTION_WEIGHTS  (so trust trends track sandbox decisions)
//   - partnerPersonality ACTION_TONE (so personality reactions fire)
// And the engine table must declare consistent shapes.

describe("EVENT_ONLY_ACTION_RULES (faction sandbox actions)", () => {
  const ids = Object.keys(EVENT_ONLY_ACTION_RULES) as EventOnlyActionId[];

  it("covers Crusader-Kings-style breadth across diplomatic / economic / covert / hostile", () => {
    // The original 3-action catalog (negotiate/suppress/fund) is too narrow
    // for sandbox play. Guard against accidental shrinkage.
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids).toContain("negotiate");
    expect(ids).toContain("suppress");
    expect(ids).toContain("fund");
  });

  it("declares cost (>=0) and at least one effect for every action", () => {
    for (const id of ids) {
      const rule = EVENT_ONLY_ACTION_RULES[id];
      expect(rule.cost, `${id} cost`).toBeGreaterThanOrEqual(0);
      const effects = rule.effects as DiplomaticActionEffects;
      const { loyalty = 0, influence = 0, threat = 0 } = effects;
      expect(
        Math.abs(loyalty) + Math.abs(influence) + Math.abs(threat),
        `${id} has zero-magnitude effects`,
      ).toBeGreaterThan(0);
    }
  });

  it("every action is recorded in partnerLedger ACTION_WEIGHTS", async () => {
    // ACTION_WEIGHTS isn't exported, but we can prove the wiring by reading
    // the source — same approach used elsewhere in the suite.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, "../partnerLedger.ts"), "utf8");
    for (const id of ids) {
      expect(src, `partnerLedger ACTION_WEIGHTS missing "${id}"`).toMatch(
        new RegExp(`["']${id}["']\\s*:`),
      );
    }
  });

  it("every action is recorded in partnerPersonality ACTION_TONE", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, "../partnerPersonality.ts"), "utf8");
    for (const id of ids) {
      expect(src, `partnerPersonality ACTION_TONE missing "${id}"`).toMatch(
        new RegExp(`["']${id}["']\\s*:`),
      );
    }
  });

  it("event-only actions have no diplomacyCooldowns row — sandbox verbs chain freely", () => {
    // Architect-flagged contract: previously, recordDiplomaticAction wrote a
    // cooldown timestamp for every action, and getDiplomacyCooldownRemaining
    // defaulted to 8 ticks. That silently throttled sandbox play. Both paths
    // must short-circuit for event-only ids.
    //
    // Note (Task #468): the loyalty-RAISING subset does carry a separate
    // per-faction anti-farming cooldown, but it lives in the
    // personalActionCooldowns map (see FACTION_DIPLOMACY_COOLDOWNS in
    // engine/interactionMenu.ts), never in diplomacyCooldowns. Hostile /
    // loyalty-lowering verbs still chain freely.
    const baseState = {
      totalTicks: 100,
      diplomacyCooldowns: {},
      diplomaticReputation: 50,
      diplomaticHistory: [],
      completedDiplomaticActions: {},
    } as unknown as GameState;

    const after = recordDiplomaticAction(
      baseState,
      "test-fac",
      "Test Faction",
      "arrange-accident",
      { accepted: true, reputationChange: 0, narrative: "" } as never,
    );
    // No cooldown row written.
    expect(Object.keys(after.diplomacyCooldowns ?? {})).toHaveLength(0);

    // And even if a stale row existed, the read path returns 0.
    const stale = {
      ...baseState,
      diplomacyCooldowns: { "test-fac::purge": 99 },
    } as GameState;
    expect(getDiplomacyCooldownRemaining(stale, "test-fac", "purge")).toBe(0);
  });

  it("every action appears in the factions screen FACTION_ACTIONS catalog", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, "../../app/(game)/factions.tsx"),
      "utf8",
    );
    for (const id of ids) {
      expect(src, `factions.tsx FACTION_ACTIONS missing "${id}"`).toMatch(
        new RegExp(`["']${id}["']\\s*:\\s*\\{`),
      );
    }
  });
});
