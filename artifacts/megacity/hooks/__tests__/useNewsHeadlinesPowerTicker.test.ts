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

function powerMsg(opts: {
  id: string;
  title: "POWER GRID BROWNOUT IMMINENT" | "POWER GRID GOING DARK";
}): GameMessage {
  return {
    id: opts.id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "alert",
    title: opts.title,
    body: "Power advisory body copy.",
    read: false,
    priority: "high",
  } as GameMessage;
}

// Task #436: the all-clear the engine fires once the grid recovers.
function recoveryMsg(id: string): GameMessage {
  return {
    id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "update",
    title: "POWER GRID STABILIZED",
    body: "Power recovery body copy.",
    read: false,
    priority: "normal",
  } as GameMessage;
}

// Task #430: the one-time imminent-brownout advisory (fired by the engine into
// the inbox) must ALSO scroll past on the TV-news ticker exactly once, so a
// player who is not on the overview power card still gets the heads-up on-screen.
describe("useNewsHeadlines — imminent brownout ticker (Task #430)", () => {
  it("emits a scrolling headline when the brownout advisory appears", () => {
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
              powerMsg({ id: "power-brownout-warning-2", title: "POWER GRID BROWNOUT IMMINENT" }),
            ],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(1);
    expect(power[0]).toBe(
      "POWER: GRID BROWNOUT IMMINENT — RESERVE ABOUT TO RUN OUT AT CURRENT DEFICIT",
    );

    act(() => renderer.unmount());
  });

  it("emits the going-dark headline when the blackout advisory appears", () => {
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
              powerMsg({ id: "power-brownout-warning-2", title: "POWER GRID GOING DARK" }),
            ],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(1);
    expect(power[0]).toContain("FULL BLACKOUT IMMINENT");

    act(() => renderer.unmount());
  });

  it("does not re-emit the same advisory on later ticks (once per episode)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = powerMsg({
      id: "power-brownout-warning-5",
      title: "POWER GRID BROWNOUT IMMINENT",
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
    // Same advisory still lingering in the inbox several ticks later must NOT
    // scroll again.
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 9, messages: [msg] }) }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("fires again for a distinct advisory id (a re-warn after recovery)", () => {
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
              powerMsg({ id: "power-brownout-warning-2", title: "POWER GRID BROWNOUT IMMINENT" }),
            ],
          }),
        }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({
            totalTicks: 20,
            messages: [
              powerMsg({ id: "power-brownout-warning-2", title: "POWER GRID BROWNOUT IMMINENT" }),
              powerMsg({ id: "power-brownout-warning-20", title: "POWER GRID GOING DARK" }),
            ],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(2);
    expect(power.some((h) => h.includes("BROWNOUT IMMINENT"))).toBe(true);
    expect(power.some((h) => h.includes("FULL BLACKOUT IMMINENT"))).toBe(true);

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
              powerMsg({ id: "power-brownout-warning-2a", title: "POWER GRID BROWNOUT IMMINENT" }),
              powerMsg({ id: "power-brownout-warning-2b", title: "POWER GRID GOING DARK" }),
            ],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(2);
    for (const h of power) {
      expect(h).not.toMatch(/!/);
      // Long em dash is intentional punctuation across the ticker copy; assert
      // only that there are no emoji/pictographs.
      expect(h).not.toMatch(/\p{Extended_Pictographic}/u);
    }

    act(() => renderer.unmount());
  });

  it("emits a scrolling all-clear when the grid recovers (Task #436)", () => {
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
            messages: [recoveryMsg("power-brownout-recovery-2")],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(1);
    expect(power[0]).toBe(
      "POWER: GRID STABILIZED — RESERVE BACK IN SURPLUS AND BROWNOUT RISK CLEARED",
    );

    act(() => renderer.unmount());
  });

  it("does not re-scroll the same all-clear on later ticks (Task #436)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = recoveryMsg("power-brownout-recovery-5");
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

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("all-clear ticker copy carries no emojis or exclamation marks (Task #436)", () => {
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
            messages: [recoveryMsg("power-brownout-recovery-2")],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(1);
    for (const h of power) {
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
                title: "POWER GRID ONLINE",
                body: "Unrelated blurb that should NOT trigger the ticker headline.",
                read: false,
                priority: "normal",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    const power = addHeadlineMock.mock.calls
      .map((c) => c[0] as string)
      .filter((h) => h.startsWith("POWER:"));
    expect(power).toHaveLength(0);

    act(() => renderer.unmount());
  });
});
