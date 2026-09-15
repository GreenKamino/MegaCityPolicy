import React from "react";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({}));

const addHeadlineMock = vi.fn();
vi.mock("@/context/NewsContext", () => ({
  useNews: () => ({ headlines: [], addHeadline: addHeadlineMock }),
}));

import TestRenderer, { act } from "react-test-renderer";
import {
  useNewsHeadlines,
  ADVISORY_ECHO_COLLAPSE_THRESHOLD,
} from "@/hooks/useNewsHeadlines";
import type { GameMessage, GameState } from "@/engine/types";

function HookHost({ state }: { state: GameState }) {
  useNewsHeadlines(state);
  return null;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  // Minimum-viable shape the hook touches (mirrors the other ticker tests).
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

function msg(id: string, title: string, body: string): GameMessage {
  return {
    id,
    timestamp: { day: 1, tick: 0 } as any,
    tick: 1,
    category: "alert",
    title,
    body,
    read: false,
    priority: "low",
  } as GameMessage;
}

// One inbox message per advisory-echo system the hook mirrors onto the ticker.
const choirMsg = (n: number) =>
  msg(`chain_choir_ticker_${n}`, "TRADE STAGE RESOLVED", `+40 credits — Free Choir +${n}%`);
const biosphereMsg = (n: number) =>
  msg(`biosphere-crisis-tier-${n}`, "NATURE CRISES EASING", "Crisis risk eased down from high.");
const powerWarnMsg = (n: number) =>
  msg(`power-brownout-warning-${n}`, "POWER RESERVE DRAINING", "Reserve about to run out.");
const powerRecoveryMsg = (n: number) =>
  msg(`power-brownout-recovery-${n}`, "POWER GRID STABILIZED", "Reserve back in surplus.");
const dismissHintMsg = (n: number) =>
  msg(
    `dismiss-recurrence-hint-biosphere_ecosystem_collapse-${n}`,
    "WARNING SUPPRESSED, NOT RESOLVED",
    "ECOSYSTEM COLLAPSE WARNING dismissed. This warning will return while the biosphere stays critical.",
  );

// Headlines the echo systems emit start with one of these prefixes; the
// combined burst line also starts with ADVISORY:.
const echoHeadlines = () =>
  addHeadlineMock.mock.calls
    .map((c) => c[0] as string)
    .filter((h) => h.startsWith("TRADE:") || h.startsWith("POWER:") || h.startsWith("ADVISORY:") || h.startsWith("ENVIRONMENTAL:"));

function renderTicks(states: GameState[]): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(HookHost, { state: states[0] }));
  });
  for (const s of states.slice(1)) {
    act(() => {
      renderer.update(React.createElement(HookHost, { state: s }));
    });
  }
  return renderer;
}

// Task #490: after offline catch-up applies many ticks at once, several
// advisory echoes (choir trade resolutions, nature-crisis tier improvements,
// brownout warnings/recoveries, dismissed-warning return hints) can queue
// back-to-back on the first live tick. More than the threshold on one tick
// must collapse into a single combined summary line.
describe("useNewsHeadlines — advisory echo burst collapse (Task #490)", () => {
  it("collapses a cross-system burst above the threshold into one combined line", () => {
    addHeadlineMock.mockClear();
    const burst = [
      choirMsg(2),
      choirMsg(3),
      biosphereMsg(4),
      powerWarnMsg(5),
      dismissHintMsg(6),
    ];
    expect(burst.length).toBeGreaterThan(ADVISORY_ECHO_COLLAPSE_THRESHOLD);
    const renderer = renderTicks([
      makeState({ totalTicks: 1 }),
      makeState({ totalTicks: 50, messages: burst }),
    ]);

    const lines = echoHeadlines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "ADVISORY: 5 ADVISORIES ISSUED WHILE COMMAND WAS AWAY — FULL DETAILS FILED IN THE INBOX",
    );

    act(() => renderer.unmount());
  });

  it("keeps per-advisory headlines at or below the threshold", () => {
    addHeadlineMock.mockClear();
    const small = [choirMsg(2), powerRecoveryMsg(3), dismissHintMsg(4)];
    expect(small.length).toBe(ADVISORY_ECHO_COLLAPSE_THRESHOLD);
    const renderer = renderTicks([
      makeState({ totalTicks: 1 }),
      makeState({ totalTicks: 50, messages: small }),
    ]);

    const lines = echoHeadlines();
    expect(lines).toHaveLength(3);
    expect(lines.some((h) => h.startsWith("TRADE: CONVOY HAUL"))).toBe(true);
    expect(lines.some((h) => h.startsWith("POWER: GRID STABILIZED"))).toBe(true);
    expect(lines.some((h) => h.startsWith("ADVISORY: ECOSYSTEM COLLAPSE WARNING DISMISSED"))).toBe(true);
    expect(lines.some((h) => h.includes("ISSUED WHILE COMMAND WAS AWAY"))).toBe(false);

    act(() => renderer.unmount());
  });

  it("keeps a single advisory as its normal per-advisory headline", () => {
    addHeadlineMock.mockClear();
    const renderer = renderTicks([
      makeState({ totalTicks: 1 }),
      makeState({ totalTicks: 2, messages: [powerWarnMsg(2)] }),
    ]);

    const lines = echoHeadlines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "POWER: GRID BROWNOUT IMMINENT — RESERVE ABOUT TO RUN OUT AT CURRENT DEFICIT",
    );

    act(() => renderer.unmount());
  });

  it("marks all burst members seen so nothing re-echoes on later ticks", () => {
    addHeadlineMock.mockClear();
    const burst = [choirMsg(2), choirMsg(3), biosphereMsg(4), powerWarnMsg(5), dismissHintMsg(6)];
    const renderer = renderTicks([
      makeState({ totalTicks: 1 }),
      makeState({ totalTicks: 50, messages: burst }),
      makeState({ totalTicks: 51, messages: burst }),
      makeState({ totalTicks: 52, messages: burst }),
    ]);

    expect(echoHeadlines()).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it("a fresh advisory after a burst gets its own normal headline", () => {
    addHeadlineMock.mockClear();
    const burst = [choirMsg(2), choirMsg(3), biosphereMsg(4), powerWarnMsg(5)];
    const renderer = renderTicks([
      makeState({ totalTicks: 1 }),
      makeState({ totalTicks: 50, messages: burst }),
      makeState({ totalTicks: 60, messages: [...burst, powerRecoveryMsg(60)] }),
    ]);

    const lines = echoHeadlines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("ISSUED WHILE COMMAND WAS AWAY");
    expect(lines[1]).toBe(
      "POWER: GRID STABILIZED — RESERVE BACK IN SURPLUS AND BROWNOUT RISK CLEARED",
    );

    act(() => renderer.unmount());
  });

  it("combined burst copy carries no emojis or exclamation marks", () => {
    addHeadlineMock.mockClear();
    const burst = [choirMsg(2), choirMsg(3), biosphereMsg(4), powerWarnMsg(5), dismissHintMsg(6)];
    const renderer = renderTicks([
      makeState({ totalTicks: 1 }),
      makeState({ totalTicks: 50, messages: burst }),
    ]);

    for (const h of echoHeadlines()) {
      expect(h).not.toMatch(/!/);
      expect(h).not.toMatch(/\p{Extended_Pictographic}/u);
    }

    act(() => renderer.unmount());
  });
});
