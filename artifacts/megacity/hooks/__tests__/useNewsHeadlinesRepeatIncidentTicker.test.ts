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
import type { GameEvent, GameState } from "@/engine/types";

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

function makeEvent(id: string, repeat?: boolean): GameEvent {
  return {
    id,
    title: id.toUpperCase(),
    description: "Test incident body.",
    severity: "high",
    timestamp: 0,
    resolved: false,
    ...(repeat ? { repeat: true } : {}),
  } as GameEvent;
}

const ALERT_COPY = "ALERT: New incident reported — command staff awaiting orders";
const UPDATE_COPY = "UPDATE: Known crisis resurfaced — still unresolved — command staff awaiting orders";

// Task #471: titled variants — the ticker names the specific crisis when the
// spawned event carries a title.
const titledAlert = (title: string) =>
  `ALERT: New incident reported — ${title} — command staff awaiting orders`;
const titledUpdate = (title: string) =>
  `UPDATE: ${title} resurfaced — still unresolved — command staff awaiting orders`;

const incidentCalls = () =>
  addHeadlineMock.mock.calls
    .map((c) => c[0] as string)
    .filter((h) => h.startsWith("ALERT:") || h.startsWith("UPDATE:"));

// Task #464: a re-fired stat-triggered crisis carries repeat: true from the
// engine spawner. The ticker must announce it as a resurfaced known incident
// instead of the misleading "new incident" alert.
describe("useNewsHeadlines — repeat incident ticker (Task #464)", () => {
  it("announces a brand-new incident with the ALERT wording only", () => {
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
          state: makeState({ totalTicks: 2, activeEvents: [makeEvent("biosphere_ecosystem_collapse")] }),
        }),
      );
    });

    const calls = incidentCalls();
    expect(calls).toEqual([titledAlert("BIOSPHERE_ECOSYSTEM_COLLAPSE")]);

    act(() => renderer.unmount());
  });

  it("announces a repeat spawn with the resurfaced wording, not the new-incident alert", () => {
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
          state: makeState({ totalTicks: 2, activeEvents: [makeEvent("biosphere_ecosystem_collapse", true)] }),
        }),
      );
    });

    const calls = incidentCalls();
    expect(calls).toEqual([titledUpdate("BIOSPHERE_ECOSYSTEM_COLLAPSE")]);

    act(() => renderer.unmount());
  });

  it("announces both when a fresh and a repeat incident land on the same tick", () => {
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
            activeEvents: [makeEvent("officer_embezzlement", true), makeEvent("biosphere_toxic_bloom")],
          }),
        }),
      );
    });

    const calls = incidentCalls();
    expect(calls).toContain(titledAlert("BIOSPHERE_TOXIC_BLOOM"));
    expect(calls).toContain(titledUpdate("OFFICER_EMBEZZLEMENT"));
    expect(calls).toHaveLength(2);

    act(() => renderer.unmount());
  });

  it("stays quiet when the event count does not grow", () => {
    addHeadlineMock.mockClear();
    const evt = makeEvent("biosphere_ecosystem_collapse", true);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1, activeEvents: [evt] }) }),
      );
    });
    // Same event still active on a later tick — no announcement.
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({ totalTicks: 2, activeEvents: [evt] }),
        }),
      );
    });

    expect(incidentCalls()).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("still emits the classic alert if the count grows without an identifiable new id", () => {
    addHeadlineMock.mockClear();
    const evt = makeEvent("biosphere_ecosystem_collapse");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { state: makeState({ totalTicks: 1, activeEvents: [evt] }) }),
      );
    });
    // Degenerate duplicate-id growth: fall back to the original wording rather
    // than staying silent.
    act(() => {
      renderer.update(
        React.createElement(HookHost, {
          state: makeState({ totalTicks: 2, activeEvents: [evt, { ...evt }] }),
        }),
      );
    });

    expect(incidentCalls()).toEqual([ALERT_COPY]);

    act(() => renderer.unmount());
  });

  it("repeat ticker copy carries no emojis or exclamation marks", () => {
    for (const copy of [
      ALERT_COPY,
      UPDATE_COPY,
      titledAlert("TOXIC BLOOM DETECTED"),
      titledUpdate("ECOSYSTEM COLLAPSE WARNING"),
    ]) {
      expect(copy).not.toMatch(/!/);
      expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

// Task #484: when more than 3 incidents land on the same tick (offline
// catch-up bursts, several spawners firing together), the ticker collapses
// them into one combined headline so routine city news is not pushed
// off-screen. Small batches (1-3) keep the per-event titled headlines.
describe("useNewsHeadlines — incident burst collapse (Task #484)", () => {
  function renderBurst(events: GameEvent[]) {
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
          state: makeState({ totalTicks: 2, activeEvents: events }),
        }),
      );
    });
    const calls = incidentCalls();
    act(() => renderer.unmount());
    return calls;
  }

  it("keeps per-event headlines for a batch of exactly 3", () => {
    const calls = renderBurst([
      makeEvent("toxic_bloom"),
      makeEvent("power_grid_failure"),
      makeEvent("gang_uprising"),
    ]);
    expect(calls).toEqual([
      titledAlert("TOXIC_BLOOM"),
      titledAlert("POWER_GRID_FAILURE"),
      titledAlert("GANG_UPRISING"),
    ]);
  });

  it("collapses a batch of 4 new incidents into one combined headline", () => {
    const calls = renderBurst([
      makeEvent("toxic_bloom"),
      makeEvent("power_grid_failure"),
      makeEvent("gang_uprising"),
      makeEvent("water_shortage"),
    ]);
    expect(calls).toEqual([
      "ALERT: 4 new incidents reported — TOXIC_BLOOM and 3 more — command staff awaiting orders",
    ]);
  });

  it("collapses a large mixed batch and calls out resurfaced incidents", () => {
    const calls = renderBurst([
      makeEvent("toxic_bloom"),
      makeEvent("officer_embezzlement", true),
      makeEvent("gang_uprising"),
      makeEvent("water_shortage"),
      makeEvent("riot_outbreak", true),
    ]);
    expect(calls).toEqual([
      "ALERT: 5 incidents reported — 2 resurfaced — TOXIC_BLOOM and 4 more — command staff awaiting orders",
    ]);
  });

  it("labels an all-repeat burst as known incidents resurfacing", () => {
    const calls = renderBurst([
      makeEvent("toxic_bloom", true),
      makeEvent("officer_embezzlement", true),
      makeEvent("gang_uprising", true),
      makeEvent("riot_outbreak", true),
    ]);
    expect(calls).toEqual([
      "ALERT: 4 known incidents resurfaced — TOXIC_BLOOM and 3 more — command staff awaiting orders",
    ]);
  });

  it("falls back to a count-only combined headline when no event carries a title", () => {
    const untitled = (id: string): GameEvent =>
      ({
        id,
        title: "",
        description: "Test incident body.",
        severity: "high",
        timestamp: 0,
        resolved: false,
      }) as GameEvent;
    const calls = renderBurst([
      untitled("a"),
      untitled("b"),
      untitled("c"),
      untitled("d"),
    ]);
    expect(calls).toEqual([
      "ALERT: 4 new incidents reported — command staff awaiting orders",
    ]);
  });

  it("combined burst copy carries no emojis or exclamation marks", () => {
    for (const copy of [
      "ALERT: 4 new incidents reported — TOXIC BLOOM DETECTED and 3 more — command staff awaiting orders",
      "ALERT: 5 incidents reported — 2 resurfaced — TOXIC BLOOM DETECTED and 4 more — command staff awaiting orders",
      "ALERT: 4 known incidents resurfaced — TOXIC BLOOM DETECTED and 3 more — command staff awaiting orders",
    ]) {
      expect(copy).not.toMatch(/!/);
      expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
