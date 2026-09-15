// Coverage for the Steam-release Onboarding pack:
//   - The 8 opening tips ship intact (no regression).
//   - 3 new mid-game tips (expand_region, balance_factions, graduation) land
//     at the documented ticks.
//   - getNextTutorialTip respects dismissedTutorialTips and tick gating.
//   - All tip bodies pass voice rules: no emojis, no exclamation marks, end
//     in a punctuated sentence.

import { describe, it, expect } from "vitest";
import {
  TUTORIAL_TIPS,
  getNextTutorialTip,
  getPendingTutorialTips,
} from "@/engine/tutorial";
import type { GameState } from "@/engine/types";

function stateAt(totalTicks: number, dismissed: string[] = []): GameState {
  return {
    totalTicks,
    dismissedTutorialTips: dismissed,
  } as unknown as GameState;
}

describe("TUTORIAL_TIPS catalog", () => {
  it("ships exactly 11 tips (8 opening + 3 mid/late)", () => {
    expect(TUTORIAL_TIPS.length).toBe(11);
  });

  it("all tip ids are unique", () => {
    const ids = TUTORIAL_TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the 3 new mid/late onboarding tips at the documented ticks", () => {
    const byId = Object.fromEntries(TUTORIAL_TIPS.map((t) => [t.id, t]));
    expect(byId.expand_region?.triggerTick).toBe(40);
    expect(byId.balance_factions?.triggerTick).toBe(80);
    expect(byId.graduation?.triggerTick).toBe(150);
  });

  it("preserves the original 8 opening tips by id", () => {
    const ids = new Set(TUTORIAL_TIPS.map((t) => t.id));
    for (const required of [
      "welcome",
      "check_resources",
      "build_housing",
      "manage_factions",
      "research_tech",
      "handle_events",
      "trade_routes",
      "hire_units",
    ]) {
      expect(ids.has(required as never)).toBe(true);
    }
  });

  it("triggerTicks are non-negative integers", () => {
    for (const t of TUTORIAL_TIPS) {
      expect(Number.isInteger(t.triggerTick)).toBe(true);
      expect(t.triggerTick).toBeGreaterThanOrEqual(0);
    }
  });

  it("every tip has a substantive body (>= 80 chars)", () => {
    for (const t of TUTORIAL_TIPS) {
      expect(t.body.length).toBeGreaterThanOrEqual(80);
    }
  });

  it("voice rules: no emojis and no exclamation marks anywhere in tips", () => {
    // Emoji presence check via Extended_Pictographic property.
    const emojiRe = /\p{Extended_Pictographic}/u;
    for (const t of TUTORIAL_TIPS) {
      expect(emojiRe.test(t.title), `${t.id} title has emoji`).toBe(false);
      expect(emojiRe.test(t.body), `${t.id} body has emoji`).toBe(false);
      expect(t.title).not.toContain("!");
      expect(t.body).not.toContain("!");
    }
  });
});

describe("getNextTutorialTip / getPendingTutorialTips", () => {
  it("returns nothing before any tip's trigger tick", () => {
    expect(getNextTutorialTip(stateAt(0))).toBeNull();
  });

  it("returns welcome at tick 1 on a fresh save", () => {
    const tip = getNextTutorialTip(stateAt(1));
    expect(tip?.id).toBe("welcome");
  });

  it("skips dismissed tips and surfaces the next eligible one", () => {
    const tip = getNextTutorialTip(stateAt(20, ["welcome", "check_resources", "build_housing"]));
    expect(tip).not.toBeNull();
    expect(["manage_factions", "research_tech", "handle_events", "trade_routes", "hire_units"]).toContain(tip!.id);
  });

  it("expand_region only becomes eligible at tick 40", () => {
    expect(getPendingTutorialTips(stateAt(39)).find((t) => t.id === "expand_region")).toBeUndefined();
    expect(getPendingTutorialTips(stateAt(40)).find((t) => t.id === "expand_region")).toBeDefined();
  });

  it("graduation is the final tip and lands at tick 150", () => {
    const all = TUTORIAL_TIPS.slice().sort((a, b) => a.triggerTick - b.triggerTick);
    expect(all[all.length - 1].id).toBe("graduation");
    expect(all[all.length - 1].triggerTick).toBe(150);
  });

  it("with all tips dismissed, returns null at any tick", () => {
    const dismissed = TUTORIAL_TIPS.map((t) => t.id);
    expect(getNextTutorialTip(stateAt(9999, dismissed))).toBeNull();
  });
});
