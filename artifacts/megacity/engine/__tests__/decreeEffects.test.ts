// Task #492 — decree effects apply through a hard-coded per-key branch chain
// in applyDecreeEffects (extracted from GameContext.issueDecree). Historically
// the `loyalty` key was declared by three seeded decrees but never applied
// (silent no-op). These tests pin the fix and guard against the same drift
// for every current and future effect key.
//
// Targeting decision under test: decree `loyalty` applies to OFFICER loyalty,
// uniformly across the roster (see engine/decrees.ts header comment).

import { describe, expect, it } from "vitest";
import { applyDecreeEffects } from "@/engine/decrees";
import { POLITICAL_DECREES, createDefaultPoliticsState, type PoliticalDecreeDef } from "@/engine/politicsData";
import { createInitialState } from "@/engine/initialState";
import type { GameState } from "@/engine/types";

// Mirror of PoliticalDecreeDef["effects"] keys. If a new key is added to the
// type and used by a seeded decree, the subset assertion below fails until
// this list is updated — and the per-key no-op guard then forces an actual
// application branch in applyDecreeEffects.
const KNOWN_EFFECT_KEYS = [
  "unrest",
  "happiness",
  "loyalty",
  "corruption",
  "credits",
  "defenseRating",
  "lawOrder",
  "fear",
  "mercy",
  "transparency",
  "populism",
  "stability",
] as const;

type EffectKey = (typeof KNOWN_EFFECT_KEYS)[number];

// Mid-range baseline so every effect (positive or negative) has headroom to
// move without hitting the 0/100 clamps.
function midBaseline(): GameState {
  const s = createInitialState();
  return {
    ...s,
    resources: { ...s.resources, credits: 500000 },
    cityStats: {
      ...s.cityStats,
      unrest: 50,
      happiness: 50,
      corruption: 50,
      lawOrder: 50,
      defenseRating: 50,
    },
    officers: s.officers.map((o) => ({ ...o, loyalty: 50 })),
    politics: {
      ...(s.politics ?? createDefaultPoliticsState()),
      reputation: {
        mercy: 50,
        fear: 50,
        transparency: 50,
        populism: 50,
        stability: 50,
        title: "",
      },
    },
  };
}

function syntheticDecree(key: EffectKey, value: number): PoliticalDecreeDef {
  return {
    id: `synthetic_${key}`,
    name: `SYNTHETIC ${key.toUpperCase()}`,
    description: "test-only decree",
    category: "control",
    cost: 0,
    cooldownTicks: 5,
    effects: { [key]: value },
  };
}

// The observable surface an effect key is allowed to land on. Bookkeeping
// fields (cooldowns, totalDecrees, lastDecreeTick, reputation title) are
// excluded on purpose — they change for EVERY decree, so a key whose only
// footprint is bookkeeping is still a silent no-op.
function effectFootprint(s: GameState) {
  return JSON.stringify({
    credits: s.resources.credits,
    totalCreditsEarned: s.totalCreditsEarned,
    cityStats: s.cityStats,
    officerLoyalty: s.officers.map((o) => o.loyalty),
    reputation: {
      mercy: s.politics?.reputation.mercy,
      fear: s.politics?.reputation.fear,
      transparency: s.politics?.reputation.transparency,
      populism: s.politics?.reputation.populism,
      stability: s.politics?.reputation.stability,
    },
  });
}

describe("decree effect drift guard", () => {
  it("every seeded decree only uses known effect keys", () => {
    for (const def of POLITICAL_DECREES) {
      for (const key of Object.keys(def.effects)) {
        expect(KNOWN_EFFECT_KEYS, `decree ${def.id} uses unknown effect key "${key}"`).toContain(key);
      }
    }
  });

  it.each(KNOWN_EFFECT_KEYS)("effect key %s is applied, not silently ignored", (key) => {
    const base = midBaseline();
    const before = effectFootprint(base);
    const after = effectFootprint(applyDecreeEffects(base, syntheticDecree(key, 3)));
    expect(after, `effect key "${key}" produced no observable change`).not.toBe(before);
  });
});

describe("loyalty decrees change officer loyalty (the historical no-op)", () => {
  const loyaltyDecrees = POLITICAL_DECREES.filter((d) => (d.effects.loyalty ?? 0) !== 0);

  it("the three seeded loyalty decrees still declare a loyalty effect", () => {
    expect(loyaltyDecrees.map((d) => d.id).sort()).toEqual([
      "grant_amnesty",
      "promote_loyalist",
      "purge_department",
    ]);
  });

  it.each(loyaltyDecrees.map((d) => [d.id, d] as const))(
    "%s shifts every officer's loyalty by its declared amount",
    (_id, def) => {
      const base = midBaseline();
      expect(base.officers.length).toBeGreaterThan(0);
      const next = applyDecreeEffects(base, def);
      for (const o of next.officers) {
        expect(o.loyalty).toBe(50 + (def.effects.loyalty ?? 0));
      }
      // Base state must not be mutated (pure function contract).
      expect(base.officers.every((o) => o.loyalty === 50)).toBe(true);
    },
  );

  it("clamps officer loyalty to [0, 100]", () => {
    const base = midBaseline();
    const low = {
      ...base,
      officers: base.officers.map((o) => ({ ...o, loyalty: 2 })),
    };
    const purged = applyDecreeEffects(low, syntheticDecree("loyalty", -5));
    for (const o of purged.officers) expect(o.loyalty).toBe(0);

    const high = {
      ...base,
      officers: base.officers.map((o) => ({ ...o, loyalty: 99 })),
    };
    const promoted = applyDecreeEffects(high, syntheticDecree("loyalty", 3));
    for (const o of promoted.officers) expect(o.loyalty).toBe(100);
  });

  it("defaults missing officer loyalty to 50 before applying the delta", () => {
    const base = midBaseline();
    const legacy = {
      ...base,
      officers: base.officers.map((o) => {
        const { loyalty: _drop, ...rest } = o;
        return rest as typeof o;
      }),
    };
    const next = applyDecreeEffects(legacy, syntheticDecree("loyalty", 3));
    for (const o of next.officers) expect(o.loyalty).toBe(53);
  });
});

describe("decree bookkeeping still intact after extraction", () => {
  it("charges cost, books cooldown, and counts the decree", () => {
    const base = midBaseline();
    const def = POLITICAL_DECREES.find((d) => d.id === "purge_department")!;
    const next = applyDecreeEffects(base, def);
    expect(next.resources.credits).toBe(base.resources.credits - def.cost);
    expect(next.politics?.decreeCooldowns[def.id]).toBe(base.totalTicks + def.cooldownTicks);
    expect(next.politics?.totalDecrees).toBe((base.politics?.totalDecrees ?? 0) + 1);
  });

  it("credit grants book gross income into totalCreditsEarned", () => {
    const base = midBaseline();
    const next = applyDecreeEffects(base, syntheticDecree("credits", 5000));
    expect(next.resources.credits).toBe(base.resources.credits + 5000);
    expect(next.totalCreditsEarned).toBe((base.totalCreditsEarned ?? 0) + 5000);
  });
});
