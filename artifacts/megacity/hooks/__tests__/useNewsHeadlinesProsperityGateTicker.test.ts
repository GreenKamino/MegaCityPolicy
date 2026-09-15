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
import { PROSPERITY_GATE_HINT_ID_PREFIX } from "@/engine/prosperityTriggers";
import type { GameMessage, GameState } from "@/engine/types";

function HookHost({ state }: { state: GameState }) {
  useNewsHeadlines(state);
  return null;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
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

function gateHintMsg(id: string): GameMessage {
  return {
    id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "update",
    title: "GOLDEN-AGE COVERAGE ON HOLD",
    body: "Your city clears every prosperity bar except one.",
    read: false,
    priority: "normal",
  } as GameMessage;
}

const GATE_TAG = "ADVISORY: GOLDEN-AGE COVERAGE ON HOLD";

function gateHeadlines(): string[] {
  return addHeadlineMock.mock.calls
    .map((c) => c[0] as string)
    .filter((h) => h.startsWith(GATE_TAG));
}

// Task #553: the one-time prosperity-gate hint (fired by the engine into the
// inbox, Task #552) must ALSO scroll past on the TV-news ticker exactly once.
describe("useNewsHeadlines — prosperity gate hint ticker (Task #553)", () => {
  it("emits a scrolling headline when the gate hint appears, naming the blocker", () => {
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
            messages: [gateHintMsg(`${PROSPERITY_GATE_HINT_ID_PREFIX}biosphere-2`)],
          }),
        }),
      );
    });

    const headlines = gateHeadlines();
    expect(headlines).toHaveLength(1);
    expect(headlines[0]).toContain("WILDLANDS STEWARDSHIP");
    expect(headlines[0]).not.toMatch(/!/);
    expect(headlines[0]).not.toMatch(/\p{Extended_Pictographic}/u);

    act(() => renderer.unmount());
  });

  it("points at the housing fix for the housing-blocked variant", () => {
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
            messages: [gateHintMsg(`${PROSPERITY_GATE_HINT_ID_PREFIX}housing-2`)],
          }),
        }),
      );
    });

    const headlines = gateHeadlines();
    expect(headlines).toHaveLength(1);
    expect(headlines[0]).toContain("EXPAND HOUSING");
    expect(headlines[0]).not.toMatch(/!/);
    expect(headlines[0]).not.toMatch(/\p{Extended_Pictographic}/u);

    act(() => renderer.unmount());
  });

  it("names both blockers for the both variant", () => {
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
            messages: [gateHintMsg(`${PROSPERITY_GATE_HINT_ID_PREFIX}both-2`)],
          }),
        }),
      );
    });

    const headlines = gateHeadlines();
    expect(headlines).toHaveLength(1);
    expect(headlines[0]).toContain("BIOSPHERE AND HOUSING PRESSURE");
    expect(headlines[0]).not.toMatch(/!/);
    expect(headlines[0]).not.toMatch(/\p{Extended_Pictographic}/u);

    act(() => renderer.unmount());
  });

  it("does not re-emit while the same hint lingers in the inbox", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = gateHintMsg(`${PROSPERITY_GATE_HINT_ID_PREFIX}biosphere-5`);
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
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 9, messages: [msg] }) }),
      );
    });

    expect(gateHeadlines()).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("does not replay a hint already in the inbox at mount (save reload)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = gateHintMsg(`${PROSPERITY_GATE_HINT_ID_PREFIX}housing-7`);
    // Simulates loading a save whose inbox already holds the hint: the
    // seen-id set is seeded at mount, so the ticker must stay quiet.
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 8, messages: [msg] }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 9, messages: [msg] }) }),
      );
    });

    expect(gateHeadlines()).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("does not emit for unrelated inbox messages", () => {
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
                category: "update",
                title: "GOLDEN-AGE COVERAGE ON HOLD",
                body: "Same title but wrong id prefix — must not echo.",
                read: false,
                priority: "normal",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    expect(gateHeadlines()).toHaveLength(0);

    act(() => renderer.unmount());
  });
});
