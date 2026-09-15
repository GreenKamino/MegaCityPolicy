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
import { TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX } from "@/engine/pendingConstruction";
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

function winddownMsg(id: string): GameMessage {
  return {
    id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "alert",
    title: "TRAINING DOCTRINE WINDING DOWN",
    body: "The Accelerated Training Doctrine lapses in 2 ticks.",
    read: false,
    priority: "normal",
  } as GameMessage;
}

const DOCTRINE_TAG = "ADVISORY: ACCELERATED TRAINING DOCTRINE WINDING DOWN";

function doctrineHeadlines(): string[] {
  return addHeadlineMock.mock.calls
    .map((c) => c[0] as string)
    .filter((h) => h.startsWith(DOCTRINE_TAG));
}

// Task #534: the one-time near-expiry doctrine advisory (fired by the engine
// into the inbox) must ALSO scroll past on the TV-news ticker exactly once.
describe("useNewsHeadlines — training doctrine winddown ticker (Task #534)", () => {
  it("emits a scrolling headline when the winddown advisory appears", () => {
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
            messages: [winddownMsg(`${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}2`)],
          }),
        }),
      );
    });

    const headlines = doctrineHeadlines();
    expect(headlines).toHaveLength(1);
    expect(headlines[0]).toContain("PLACE TRAINING ORDERS NOW");
    expect(headlines[0]).not.toMatch(/!/);
    expect(headlines[0]).not.toMatch(/\p{Extended_Pictographic}/u);

    act(() => renderer.unmount());
  });

  it("does not re-emit while the same advisory lingers in the inbox", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = winddownMsg(`${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}5`);
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

    expect(doctrineHeadlines()).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("fires again for a distinct advisory id (a later re-activation)", () => {
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
            messages: [winddownMsg(`${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}2`)],
          }),
        }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({
            totalTicks: 60,
            messages: [
              winddownMsg(`${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}2`),
              winddownMsg(`${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}60`),
            ],
          }),
        }),
      );
    });

    expect(doctrineHeadlines()).toHaveLength(2);

    act(() => renderer.unmount());
  });

  it("does not replay an advisory already in the inbox at mount (save reload)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = winddownMsg(`${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}7`);
    // Simulates loading a save whose inbox already holds the advisory: the
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

    expect(doctrineHeadlines()).toHaveLength(0);

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
                category: "alert",
                title: "TRAINING DOCTRINE WINDING DOWN",
                body: "Same title but wrong id prefix — must not echo.",
                read: false,
                priority: "normal",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    expect(doctrineHeadlines()).toHaveLength(0);

    act(() => renderer.unmount());
  });
});
