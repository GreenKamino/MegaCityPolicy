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
  // Minimum-viable shape the hook touches (mirrors the power-ticker test).
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

// The hint message applyEventDismissal (eventResolution.ts) prepends when a
// recurring stat-triggered crisis is dismissed while its condition is still
// critical (Task #456).
function hintMsg(id: string): GameMessage {
  return {
    id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "alert",
    title: "WARNING SUPPRESSED, NOT RESOLVED",
    body: "ECOSYSTEM COLLAPSE WARNING dismissed. This warning will return while the biosphere stays critical.",
    read: false,
    priority: "low",
  } as GameMessage;
}

const advisories = () =>
  addHeadlineMock.mock.calls
    .map((c) => c[0] as string)
    .filter((h) => h.startsWith("ADVISORY:"));

// Task #456: the engine's "dismissed warning will return" inbox note must ALSO
// scroll past on the TV-news ticker exactly once, so the temporary nature of
// the dismissal lands on-screen without blocking anything.
describe("useNewsHeadlines — dismissal recurrence hint ticker (Task #456)", () => {
  it("scrolls the hint once when the message appears", () => {
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
            messages: [hintMsg("dismiss-recurrence-hint-biosphere_ecosystem_collapse-2")],
          }),
        }),
      );
    });

    expect(advisories()).toHaveLength(1);
    expect(advisories()[0]).toContain(
      "WILL RETURN WHILE THE BIOSPHERE STAYS CRITICAL",
    );

    act(() => renderer.unmount());
  });

  it("does not re-scroll the same hint on later ticks", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = hintMsg("dismiss-recurrence-hint-biosphere_ecosystem_collapse-5");
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

    expect(advisories()).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("scrolls again for a distinct hint id (a later re-dismissal)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const first = hintMsg("dismiss-recurrence-hint-biosphere_ecosystem_collapse-2");
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1 }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 2, messages: [first] }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({
            totalTicks: 20,
            messages: [
              first,
              hintMsg("dismiss-recurrence-hint-biosphere_ecosystem_collapse-20"),
            ],
          }),
        }),
      );
    });

    expect(advisories()).toHaveLength(2);

    act(() => renderer.unmount());
  });

  it("ticker copy carries no emojis or exclamation marks", () => {
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
            messages: [hintMsg("dismiss-recurrence-hint-biosphere_ecosystem_collapse-2")],
          }),
        }),
      );
    });

    expect(advisories()).toHaveLength(1);
    for (const h of advisories()) {
      expect(h).not.toMatch(/!/);
      expect(h).not.toMatch(/\p{Extended_Pictographic}/u);
    }

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
                title: "WARNING SUPPRESSED, NOT RESOLVED",
                body: "Same title but unrelated id must not scroll.",
                read: false,
                priority: "low",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    expect(advisories()).toHaveLength(0);

    act(() => renderer.unmount());
  });
});
