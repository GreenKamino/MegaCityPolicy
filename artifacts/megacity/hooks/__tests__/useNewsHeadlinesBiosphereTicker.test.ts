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
import type { NewsFeedItem } from "@/engine/newsFeed";

function HookHost({ state }: { state: GameState }) {
  useNewsHeadlines(state);
  return null;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  // Minimum-viable shape the hook touches. Fields it doesn't read are left as
  // plausible empty defaults so we never accidentally trigger unrelated
  // headline branches in the test.
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

function crisisMsg(opts: {
  id: string;
  title: "NATURE CRISES EASING" | "NATURE CRISES AT LOW RISK";
}): GameMessage {
  return {
    id: opts.id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "update",
    title: opts.title,
    body: "Biosphere advisory body copy.",
    read: false,
    priority: "normal",
  } as GameMessage;
}

function crisisRiskNews(tier: "high" | "easing", tick: number): NewsFeedItem {
  return {
    id: `news-biosphere-risk-rising-${tier}-${tick}`,
    headline: tier === "high"
      ? "NATURE DESK: NATURE CRISIS RISK HIGH — the biosphere has slipped into the highest crisis band"
      : "NATURE DESK: NATURE CRISIS RISK RISING — biosphere recovery has lost ground",
    tick,
  };
}

// Task #366: the one-time nature-crisis tier improvement advisory (fired by the
// engine into the inbox) must ALSO scroll past on the TV-news ticker exactly
// once — the win should land on-screen, not only in the inbox.
describe("useNewsHeadlines — nature-crisis tier improvement ticker (Task #366)", () => {
  it("emits a scrolling headline when the EASING advisory appears", () => {
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
              crisisMsg({ id: "biosphere-crisis-tier-easing-2", title: "NATURE CRISES EASING" }),
            ],
          }),
        }),
      );
    });

    const calls = addHeadlineMock.mock.calls.map((c) => c[0] as string);
    const crisis = calls.filter((h) => h.includes("NATURE CRISES EASING"));
    expect(crisis).toHaveLength(1);
    expect(crisis[0]).toBe(
      "ENVIRONMENTAL: NATURE CRISES EASING — biosphere investment paying off, wildlands crisis risk eased down from high",
    );

    act(() => renderer.unmount());
  });

  it("emits the LOW-RISK headline echoing the gauge wording (held low)", () => {
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
              crisisMsg({ id: "biosphere-crisis-tier-low-2", title: "NATURE CRISES AT LOW RISK" }),
            ],
          }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISES AT LOW RISK"));
    expect(crisis).toHaveLength(1);
    expect(crisis[0]).toContain("held low");

    act(() => renderer.unmount());
  });

  it("does not re-emit the same advisory on later ticks (once per improvement)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = crisisMsg({
      id: "biosphere-crisis-tier-easing-5",
      title: "NATURE CRISES EASING",
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
    // Same advisory still in the inbox several ticks later — must NOT scroll
    // again. (addHeadline's own dedupe is by exact string, so the id gate here
    // is what actually prevents the re-emit.)
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 9, messages: [msg] }) }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISES"));
    expect(crisis).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("fires again for a distinct improvement id (easing then low)", () => {
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
              crisisMsg({ id: "biosphere-crisis-tier-easing-2", title: "NATURE CRISES EASING" }),
            ],
          }),
        }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({
            totalTicks: 6,
            messages: [
              crisisMsg({ id: "biosphere-crisis-tier-easing-2", title: "NATURE CRISES EASING" }),
              crisisMsg({ id: "biosphere-crisis-tier-low-6", title: "NATURE CRISES AT LOW RISK" }),
            ],
          }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISES"));
    expect(crisis).toHaveLength(2);
    expect(crisis.some((h) => h.includes("NATURE CRISES EASING"))).toBe(true);
    expect(crisis.some((h) => h.includes("NATURE CRISES AT LOW RISK"))).toBe(true);

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
            messages: [
              crisisMsg({ id: "biosphere-crisis-tier-easing-2", title: "NATURE CRISES EASING" }),
              crisisMsg({ id: "biosphere-crisis-tier-low-2", title: "NATURE CRISES AT LOW RISK" }),
            ],
          }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISES"));
    expect(crisis).toHaveLength(2);
    for (const h of crisis) {
      expect(h).not.toMatch(/!/);
      // Long em dash is intentional ASCII-adjacent punctuation used across the
      // ticker copy; assert only that there are no emoji/pictographs.
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
                category: "update",
                title: "NATURE RESERVE OPENED",
                body: "Unrelated blurb that should NOT trigger the ticker headline.",
                read: false,
                priority: "normal",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISES"));
    expect(crisis).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("emits a headline when risk rises from low to easing", () => {
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
            newsFeed: [crisisRiskNews("easing", 2)],
          }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISIS RISK"));
    expect(crisis).toHaveLength(1);
    expect(crisis[0]).toBe(
      "NATURE DESK: NATURE CRISIS RISK RISING — biosphere recovery has lost ground — ecology desk flags a higher chance of new crises",
    );

    act(() => renderer.unmount());
  });

  it("emits the stronger headline when risk enters the highest band", () => {
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
            newsFeed: [crisisRiskNews("high", 2)],
          }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISIS RISK"));
    expect(crisis).toHaveLength(1);
    expect(crisis[0]).toContain("NATURE CRISIS RISK HIGH");
    expect(crisis[0]).not.toMatch(/!/);

    act(() => renderer.unmount());
  });

  it("does not re-emit the same worsening transition on later ticks", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const warning = crisisRiskNews("easing", 2);
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1 }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({ totalTicks: 2, newsFeed: [warning] }),
        }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({ totalTicks: 6, newsFeed: [warning] }),
        }),
      );
    });

    const crisis = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.includes("NATURE CRISIS RISK"));
    expect(crisis).toHaveLength(1);

    act(() => renderer.unmount());
  });
});
