import React from "react";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({}));

const addHeadlineMock = vi.fn();
vi.mock("@/context/NewsContext", () => ({
  useNews: () => ({ headlines: [], addHeadline: addHeadlineMock }),
}));

import TestRenderer, { act } from "react-test-renderer";
import { useNewsHeadlines } from "@/hooks/useNewsHeadlines";
import type { GameMessage, GameState } from "@/engine/types";

function HookHost({ state }: { state: GameState }) {
  useNewsHeadlines(state);
  return null;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  // Minimum-viable shape the hook touches. Fields it doesn't read are
  // left as plausible empty defaults so we never accidentally trigger
  // unrelated headline branches in the test.
  return {
    totalTicks: 1,
    cityStats: {
      population: 1000,
      crime: 30,
      unrest: 30,
      happiness: 50,
      publicHealth: 50,
      employment: 50,
      corruption: 30,
    } as any,
    resources: { credits: 1000 } as any,
    activeEvents: [],
    unlockedTechnologies: [],
    activeResearch: undefined,
    politics: undefined,
    retinue: { totalCasualties: 0 } as any,
    messages: [],
    buildings: {} as any,
    ...overrides,
  } as unknown as GameState;
}

function tickerMsg(opts: {
  id: string;
  title: "TRADE STAGE RESOLVED" | "TRADE CARAVAN RESOLVED";
  body: string;
}): GameMessage {
  return {
    id: opts.id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "world-news",
    title: opts.title,
    body: opts.body,
    read: false,
    priority: "low",
  } as GameMessage;
}

describe("useNewsHeadlines — Free Choir transit ticker (Task #221)", () => {
  it("emits a scrolling headline when a new TRADE STAGE RESOLVED message appears", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const state1 = makeState({ totalTicks: 1, messages: [] });
    act(() => {
      renderer = TestRenderer.create(React.createElement(HookHost, { state: state1 }));
    });

    const state2 = makeState({
      totalTicks: 2,
      messages: [
        tickerMsg({
          id: "chain_choir_ticker_trade_war_blockade_tw_stage1_tw_both_2",
          title: "TRADE STAGE RESOLVED",
          body: "credits +125 · trade +10 — Free Choir +25%",
        }),
      ],
    });
    act(() => {
      renderer.update(React.createElement(HookHost, { state: state2 }));
    });

    const calls = addHeadlineMock.mock.calls.map((c) => c[0] as string);
    const choirCalls = calls.filter((h) => h.includes("FREE CHOIR PATRONAGE"));
    expect(choirCalls).toHaveLength(1);
    expect(choirCalls[0]).toBe(
      "TRADE: CONVOY HAUL credits +125 · trade +10 — Free Choir +25% (FREE CHOIR PATRONAGE)",
    );

    act(() => renderer.unmount());
  });

  it("emits a scrolling headline labeled CARAVAN for trade_caravan_arrives ticker entries", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1 }) }),
      );
    });

    const next = makeState({
      totalTicks: 2,
      messages: [
        tickerMsg({
          id: "caravan_choir_ticker_tax_it_2",
          title: "TRADE CARAVAN RESOLVED",
          body: "credits +75 — Free Choir +25%",
        }),
      ],
    });
    act(() => {
      renderer.update(React.createElement(HookHost, { state: next }));
    });

    const choir = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("FREE CHOIR PATRONAGE"));
    expect(choir).toHaveLength(1);
    expect(choir[0]).toContain("CARAVAN HAUL");
    expect(choir[0]).toContain("Free Choir +25%");

    act(() => renderer.unmount());
  });

  it("does not re-emit the same ticker on subsequent ticks (once per resolution)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = tickerMsg({
      id: "chain_choir_ticker_trade_war_blockade_tw_stage1_tw_both_5",
      title: "TRADE STAGE RESOLVED",
      body: "credits +200 — Free Choir +25%",
    });
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 4 }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 5, messages: [msg] }) }),
      );
    });
    // Same message still in the inbox several ticks later — must NOT
    // emit a duplicate scrolling headline. (addHeadline's own dedupe is
    // by exact string, so we have to gate by id at this layer too.)
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 9, messages: [msg] }) }),
      );
    });

    const choir = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("FREE CHOIR PATRONAGE"));
    expect(choir).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("emits exactly one headline per distinct message id even when bodies are identical", () => {
    // NewsContext.addHeadline dedupes by exact string, but two distinct
    // resolutions that happen to produce identical body text (same lane,
    // same deltas, same swing) are still legitimately different events;
    // the seen-id gate must let both attempts reach addHeadline so the
    // dedupe boundary is owned by NewsContext, not silently absorbed
    // here. We assert the hook calls addHeadline once per id; whether
    // the two strings collide downstream is NewsContext's contract.
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1 }) }),
      );
    });

    const body = "credits +75 — Free Choir +25%";
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({
            totalTicks: 2,
            messages: [
              tickerMsg({ id: "caravan_choir_ticker_a_2", title: "TRADE CARAVAN RESOLVED", body }),
              tickerMsg({ id: "caravan_choir_ticker_b_2", title: "TRADE CARAVAN RESOLVED", body }),
            ],
          }),
        }),
      );
    });

    const choir = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("FREE CHOIR PATRONAGE"));
    // Hook called addHeadline twice — once per distinct id — even though
    // the produced strings are identical. (Downstream NewsContext may then
    // collapse them, but that's its concern, not the hook's.)
    expect(choir).toHaveLength(2);

    act(() => renderer.unmount());
  });

  it("caps the seen-id set at 200 entries (no unbounded growth across long sessions)", () => {
    // Drive 250 distinct ticker ids through the hook and verify the
    // internal seen-id set is trimmed back down to 200. We can't read
    // the ref directly, so we re-feed the OLDEST ids on a later tick
    // and confirm they fire again (they were evicted from the set).
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1 }) }),
      );
    });

    const ids = Array.from({ length: 250 }, (_, i) => `caravan_choir_ticker_seed_${i}`);
    const messages = ids.map((id) =>
      tickerMsg({ id, title: "TRADE CARAVAN RESOLVED", body: `credits +${id.length} — Free Choir +25%` }),
    );
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 2, messages }) }),
      );
    });

    // Task #490: a 250-message burst on one tick now collapses into a single
    // combined advisory line instead of 250 individual choir headlines; the
    // count embedded in that line still proves all 250 ids were processed.
    const initialCombined = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("ADVISORIES ISSUED WHILE COMMAND WAS AWAY"));
    expect(initialCombined).toHaveLength(1);
    expect(initialCombined[0]).toContain("250 ADVISORIES");

    addHeadlineMock.mockClear();

    // Re-deliver the FIRST 50 ids on a later tick. Insertion-order Set
    // eviction means ids[0..49] should have been evicted when the set
    // was trimmed from 250 → 200, so they will fire a second time. The
    // last 200 ids would NOT fire again if re-delivered, proving the
    // cap is exactly 200.
    const oldest50 = ids.slice(0, 50).map((id) =>
      tickerMsg({ id, title: "TRADE CARAVAN RESOLVED", body: `credits +${id.length} — Free Choir +25%` }),
    );
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({ totalTicks: 3, messages: oldest50 }),
        }),
      );
    });

    // All 50 evicted ids fired again (collapsed into one combined line whose
    // count is 50) — confirms the cap actually trimmed the set down to 200
    // (not stuck at 249 due to the size-mutation bug architect flagged on the
    // first review pass).
    const refireCombined = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("ADVISORIES ISSUED WHILE COMMAND WAS AWAY"));
    expect(refireCombined).toHaveLength(1);
    expect(refireCombined[0]).toContain("50 ADVISORIES");

    // Now re-deliver one of the surviving 200 ids — must NOT fire again.
    addHeadlineMock.mockClear();
    const surviving = tickerMsg({
      id: ids[200],
      title: "TRADE CARAVAN RESOLVED",
      body: `credits +${ids[200].length} — Free Choir +25%`,
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({ totalTicks: 4, messages: [surviving] }),
        }),
      );
    });
    const survivorCalls = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("FREE CHOIR PATRONAGE"));
    expect(survivorCalls).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("does not emit a headline when no transit-ticker messages are present", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1 }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({
            totalTicks: 2,
            messages: [
              {
                id: "some_other_msg",
                timestamp: { day: 1, tick: 0 } as any,
                tick: 2,
                category: "intel",
                title: "FREE CHOIR INFLUENCE",
                body: "Some narrative blurb that should NOT trigger the ticker headline.",
                read: false,
                priority: "low",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    const choir = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("FREE CHOIR PATRONAGE"));
    expect(choir).toHaveLength(0);

    act(() => renderer.unmount());
  });
});
