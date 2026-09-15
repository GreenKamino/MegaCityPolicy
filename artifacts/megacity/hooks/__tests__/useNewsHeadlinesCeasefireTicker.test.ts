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
import { CEASEFIRE_HOLDS_ID_PREFIX } from "@/engine/eventResolution";
import type { GameMessage, GameState } from "@/engine/types";

function HookHost({ state }: { state: GameState }) {
  useNewsHeadlines(state);
  return null;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  // Minimum-viable shape the hook touches (mirrors the dismiss-hint test).
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

// The confirmation applyCeasefireDiplomacy (eventResolution.ts) prepends when
// accepting or countering a ceasefire cools the instigating faction (Task #564).
function holdsMsg(id: string): GameMessage {
  return {
    id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "world-news",
    title: "CEASEFIRE HOLDS",
    body: "Ceasefire holds — Iron Vultures forces are standing down. The conflict is winding down and hostile activity should taper off.",
    read: false,
    priority: "normal",
  } as GameMessage;
}

const warDesk = () =>
  addHeadlineMock.mock.calls
    .map((c) => c[0] as string)
    .filter((h) => h.startsWith("WAR DESK:"));

// Task #564: the engine's "ceasefire holds" inbox confirmation must ALSO
// scroll past on the TV-news ticker exactly once, so the war winding down
// lands on-screen without the player opening the inbox.
describe("useNewsHeadlines — ceasefire holds ticker (Task #564)", () => {
  it("scrolls the confirmation once when the message appears", () => {
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
            messages: [holdsMsg(`${CEASEFIRE_HOLDS_ID_PREFIX}iron_vultures-2`)],
          }),
        }),
      );
    });

    expect(warDesk()).toHaveLength(1);
    expect(warDesk()[0]).toContain("CEASEFIRE HOLDS");
    expect(warDesk()[0]).toContain("IRON VULTURES FORCES ARE STANDING DOWN");

    act(() => renderer.unmount());
  });

  it("does not re-scroll the same confirmation on later ticks", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = holdsMsg(`${CEASEFIRE_HOLDS_ID_PREFIX}iron_vultures-5`);
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

    expect(warDesk()).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("does not replay a confirmation already present at mount (loaded save)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const msg = holdsMsg(`${CEASEFIRE_HOLDS_ID_PREFIX}iron_vultures-3`);
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 10, messages: [msg] }) }),
      );
    });
    act(() => {
      renderer.update(
        React.createElement(HookHost, { state: makeState({ totalTicks: 11, messages: [msg] }) }),
      );
    });

    expect(warDesk()).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("scrolls again for a distinct id (a later ceasefire with another faction)", () => {
    addHeadlineMock.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    const first = holdsMsg(`${CEASEFIRE_HOLDS_ID_PREFIX}iron_vultures-2`);
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
            messages: [first, holdsMsg(`${CEASEFIRE_HOLDS_ID_PREFIX}rust_syndicate-20`)],
          }),
        }),
      );
    });

    expect(warDesk()).toHaveLength(2);

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
            messages: [holdsMsg(`${CEASEFIRE_HOLDS_ID_PREFIX}iron_vultures-2`)],
          }),
        }),
      );
    });

    expect(warDesk()).toHaveLength(1);
    for (const h of warDesk()) {
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
                category: "world-news",
                title: "CEASEFIRE HOLDS",
                body: "Same title but unrelated id must not scroll.",
                read: false,
                priority: "normal",
              } as GameMessage,
            ],
          }),
        }),
      );
    });

    expect(warDesk()).toHaveLength(0);

    act(() => renderer.unmount());
  });
});
