// Task #493 wiring tests: war escalation, war endings, and negotiation
// outcomes must surface on the public news ticker (state.newsFeed). These
// exercise the real engine paths, not the builders in isolation — the builder
// copy rules live in newsFeed.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getDefaultAdvancedState,
  processWarEscalation,
  resolveNegotiationChoice,
  resolveWarsAgainstControlledCities,
  startWar,
  type FactionRelation,
  type NegotiationChain,
} from "@/engine/diplomacyAdvanced";
import { createInitialState } from "@/engine/initialState";
import { applyPartnerAndPlayerTickEffects } from "@/engine/partnerCityStats";
import { processNpcWorldEvents } from "@/engine/partnerDynamics";
import type { GameState, TickEntry } from "@/engine/types";

afterEach(() => {
  vi.restoreAllMocks();
});

function stateAtWar(mutate: (war: ReturnType<typeof startWar>) => void): {
  s: GameState;
  warId: string;
} {
  const s = createInitialState();
  s.totalTicks = 50;
  const war = startWar(s, "ferrograd", "Ferrograd");
  mutate(war);
  s.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };
  return { s, warId: war.id };
}

describe("war escalation news wiring", () => {
  it("escalating open war to total war lands on the news ticker", () => {
    const { s, warId } = stateAtWar((w) => {
      w.stage = "open_war";
      w.intensity = 95;
    });
    const entries: TickEntry[] = [];

    processWarEscalation(s, entries);

    expect(s.diplomacyAdvanced!.wars[0].stage).toBe("total_war");
    expect((s.newsFeed ?? []).some((n) => n.id.startsWith(`news-war-total-${warId}`))).toBe(true);
  });

  it("a war that collapses from exhaustion reports the fizzle instead of vanishing silently", () => {
    const { s, warId } = stateAtWar((w) => {
      w.stage = "skirmishes";
      w.warWeariness = 100;
    });
    const entries: TickEntry[] = [];

    processWarEscalation(s, entries);

    expect(s.diplomacyAdvanced!.wars).toHaveLength(0);
    expect((s.newsFeed ?? []).some((n) => n.id.startsWith(`news-war-exhaust-${warId}`))).toBe(true);
  });

  it("the ghost-war self-heal against a conquered city emits a war-concluded headline", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    const target = (s.externalMegacities ?? [])[0];
    expect(target).toBeDefined();
    const war = startWar(s, target.id, target.name);
    war.stage = "open_war";
    const warId = war.id;
    s.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };
    (target as { controlStatus?: string }).controlStatus = "annexed";
    const entries: TickEntry[] = [];

    resolveWarsAgainstControlledCities(s, entries);

    expect(s.diplomacyAdvanced!.wars).toHaveLength(0);
    expect((s.newsFeed ?? []).some((n) => n.id.startsWith(`news-war-concluded-${warId}`))).toBe(true);
  });
});

// Task #496: wars the engine starts between rival cities must hit the ticker
// as breaking news at the moment they are created — the player's own
// declaration is covered separately by the GameContext action path.
describe("engine-initiated war declaration news wiring", () => {
  function relation(a: string, b: string, disposition: number): FactionRelation {
    return { factionA: a, factionB: b, disposition, trend: "stable", lastEventTick: 0, events: [] };
  }

  it("a rival-vs-rival war created inside the NPC world tick lands on the news ticker", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    const partners = (s.externalMegacities ?? []).slice(0, 2);
    expect(partners.length).toBeGreaterThanOrEqual(2);
    const [a, b] = partners;
    // A fresh save only has one discovered rival — activate both so the NPC
    // world tick can see them as war candidates.
    a.isActive = true;
    b.isActive = true;
    s.diplomacyAdvanced = {
      ...getDefaultAdvancedState(),
      factionRelations: [relation(a.id, b.id, 5)],
    };
    vi.spyOn(Math, "random").mockReturnValue(0); // roll 0 < war chance → war starts

    const res = processNpcWorldEvents(s);

    const wars = res.state.diplomacyAdvanced!.wars;
    expect(wars).toHaveLength(1);
    const warId = wars[0].id;
    expect(
      (res.state.newsFeed ?? []).some((n) => n.id.startsWith(`news-war-declared-${warId}`)),
    ).toBe(true);
  });

  it("the headline survives the full partner tick pipeline (applyPartnerAndPlayerTickEffects)", () => {
    // The per-tick call site cherry-picks fields from processNpcWorldEvents'
    // returned state — this locks in that newsFeed is carried through and
    // can't be silently dropped again.
    const s = createInitialState();
    s.totalTicks = 50;
    const partners = (s.externalMegacities ?? []).slice(0, 2);
    expect(partners.length).toBeGreaterThanOrEqual(2);
    const [a, b] = partners;
    a.isActive = true;
    b.isActive = true;
    s.diplomacyAdvanced = {
      ...getDefaultAdvancedState(),
      factionRelations: [relation(a.id, b.id, 5)],
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const res = applyPartnerAndPlayerTickEffects(s);

    const wars = res.state.diplomacyAdvanced!.wars;
    expect(wars).toHaveLength(1);
    expect(
      (res.state.newsFeed ?? []).some((n) => n.id.startsWith(`news-war-declared-${wars[0].id}`)),
    ).toBe(true);
    // The INTERVENE event spawned alongside the war must survive too.
    expect(
      (res.state.activeEvents ?? []).some((e) => e.id === `npc-war-int-${wars[0].id}`),
    ).toBe(true);
  });

  it("a player-initiated war does not get a second declaration headline from the engine tick", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    const target = (s.externalMegacities ?? [])[0];
    expect(target).toBeDefined();
    const war = startWar(s, target.id, target.name);
    s.diplomacyAdvanced = {
      ...getDefaultAdvancedState(),
      wars: [war],
      // Even a hostile player↔target relation row must not re-declare the war.
      factionRelations: [relation("player", target.id, 5)],
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const res = processNpcWorldEvents(s);
    const entries: TickEntry[] = [];
    processWarEscalation(res.state, entries);

    expect(res.state.diplomacyAdvanced!.wars).toHaveLength(1);
    expect(
      (res.state.newsFeed ?? []).some((n) => n.id.startsWith("news-war-declared-")),
    ).toBe(false);
  });
});

function stateWithNegotiation(steps: NegotiationChain["steps"]): {
  s: GameState;
  neg: NegotiationChain;
} {
  const s = createInitialState();
  s.totalTicks = 50;
  const neg: NegotiationChain = {
    id: "neg-test-1",
    title: "Arms Limitation Talks",
    partnerId: "corps",
    partnerName: "The Corps",
    steps,
    currentStep: 0,
    status: "active",
    startTick: 40,
    deadlineTick: 999,
    stakesDescription: "test stakes",
  };
  s.diplomacyAdvanced = { ...getDefaultAdvancedState(), negotiations: [neg] };
  return { s, neg };
}

function choice(
  id: string,
  successChance: number,
  effects: NegotiationChain["steps"][number]["choices"][number]["effects"],
): NegotiationChain["steps"][number]["choices"][number] {
  return { id, label: id, description: id, style: "diplomatic", successChance, effects };
}

describe("negotiation outcome news wiring", () => {
  it("a chain concluding in success emits a treaty-signed headline", () => {
    const { s, neg } = stateWithNegotiation([
      { id: "step-1", prompt: "final terms", choices: [choice("accept", 95, { chainEnd: "success" })] },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0); // roll 0 < 95 → success

    const patch = resolveNegotiationChoice(s, neg.id, "accept");

    expect(patch.diplomacyAdvanced!.negotiations[0].status).toBe("success");
    expect((patch.newsFeed ?? []).some((n) => n.id.startsWith(`news-treaty-signed-${neg.id}`))).toBe(true);
  });

  it("a chain collapsing in failure emits a treaty-collapsed headline", () => {
    const { s, neg } = stateWithNegotiation([
      { id: "step-1", prompt: "final terms", choices: [choice("bluff", 5, {})] },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0.99); // roll 99 ≥ 5 → failure

    const patch = resolveNegotiationChoice(s, neg.id, "bluff");

    expect(patch.diplomacyAdvanced!.negotiations[0].status).toBe("failed");
    expect((patch.newsFeed ?? []).some((n) => n.id.startsWith(`news-treaty-collapsed-${neg.id}`))).toBe(true);
  });

  it("a successful mid-chain step that keeps the chain active stays off the ticker", () => {
    const { s, neg } = stateWithNegotiation([
      { id: "step-1", prompt: "opening terms", choices: [choice("open", 95, {})] },
      { id: "step-2", prompt: "final terms", choices: [choice("accept", 95, { chainEnd: "success" })] },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0); // success, but chain continues

    const patch = resolveNegotiationChoice(s, neg.id, "open");

    expect(patch.diplomacyAdvanced!.negotiations[0].status).toBe("active");
    expect(patch.newsFeed).toBeUndefined();
  });
});
