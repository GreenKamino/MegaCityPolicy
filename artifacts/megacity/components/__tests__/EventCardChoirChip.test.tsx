import React from "react";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      const { children, style: _s, onPress: _o, disabled: _d, ...rest } = props ?? {};
      return React.createElement(name, rest, children);
    };
  return {
    View: passthrough("View"),
    Text: passthrough("Text"),
    Pressable: passthrough("Pressable"),
    StyleSheet: {
      create: (s: any) => s,
      absoluteFill: {},
      flatten: (s: any) => s,
    },
    Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  const Icon = (_props: any) => React.createElement("Icon", null);
  return { Feather: Icon, MaterialCommunityIcons: Icon };
});

// EventCard now owns its confirmation dialog. Keep this focused chip-rendering
// test independent from GameModal's native audio implementation.
vi.mock("@/components/GameModal", () => ({
  default: () => null,
}));

const themePalette = {
  accent: "#00FF41",
  warning: "#FF9500",
  danger: "#FF3344",
  text: "#E0E0E0",
  textSecondary: "#A0A0A0",
  textMuted: "#4A5A4A",
  bg: "#0B0F0B",
  bgCard: "#141F14",
  border: "#1F2A1F",
};

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ colors: themePalette, mode: "dark" }),
}));

const mockState: {
  state: {
    officers: Array<Record<string, unknown>>;
    cityStats: Record<string, number>;
    faiths: {
      stances: Record<string, "sponsor" | "suppress" | "tolerate">;
    };
  };
} = {
  state: {
    officers: [],
    cityStats: { biosphere: 5 },
    faiths: { stances: { "free-choir": "tolerate" as "sponsor" | "suppress" | "tolerate" } },
  },
};

vi.mock("@/context/GameContext", () => ({
  useGameState: () => mockState,
}));

vi.mock("@/engine/haptics", () => ({
  playHaptic: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
}));

vi.mock("@/engine/eventFlavor", () => ({
  lookupFactionStamp: () => null,
}));

import TestRenderer, { act } from "react-test-renderer";
import EventCard from "@/components/EventCard";
import type { GameEvent } from "@/engine/types";

function setStance(stance: "sponsor" | "suppress" | "tolerate") {
  mockState.state.faiths.stances["free-choir"] = stance;
}

function setBiosphere(biosphere: number, diseaseRisk = 0) {
  mockState.state.cityStats.biosphere = biosphere;
  mockState.state.cityStats.diseaseRisk = diseaseRisk;
}

function setAppointedOfficer(overrides: Record<string, unknown> = {}) {
  mockState.state.officers = [{
    id: "repeat-crisis-officer",
    appointed: true,
    corruption: 80,
    ambition: 20,
    loyalty: 70,
    fearFactor: 0,
    competence: 80,
    rivals: [],
    ...overrides,
  }];
}

function collectText(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) collectText(c, out);
    return out;
  }
  if (node.children) collectText(node.children, out);
  return out;
}
function flatText(node: any): string {
  return collectText(node).join(" ").replace(/\s+/g, " ");
}

function findFirstPress(root: TestRenderer.ReactTestInstance): (() => void) | null {
  const found = root.findAll(
    (n) => !!n.props && typeof (n.props as any).onPress === "function",
    { deep: true },
  );
  return found.length > 0 ? ((found[0].props as any).onPress as () => void) : null;
}

function makeChainTransitEvent(): GameEvent {
  return {
    id: "trade_war_blockade_stage_1",
    chainId: "trade_war_blockade",
    title: "BLOCKADE TIGHTENS",
    description: "Convoys halted at the inner perimeter.",
    severity: "high",
    effects: { credits: -20 },
    responseOptions: [
      {
        id: "open_route",
        label: "OPEN ROUTE",
        description: "Force the convoys through.",
        // Raw base effects — EventCard will re-scale these for display.
        effects: { credits: 100, tradeIncome: 8 },
      },
      {
        id: "wait_it_out",
        label: "WAIT IT OUT",
        description: "Hold position; no transit yields.",
        effects: { happiness: -2 }, // not transit-income, no chip on this row
      },
    ],
  } as unknown as GameEvent;
}

function makeCaravanEvent(): GameEvent {
  return {
    id: "trade_caravan_arrives",
    title: "CARAVAN ARRIVES",
    description: "Goods land at the spaceport.",
    severity: "medium",
    effects: { credits: 50 },
    responseOptions: [
      {
        id: "tax_it",
        label: "TAX IT",
        // The generator already scales this, so EventCard renders as-is.
        effects: { credits: 75 }, // pretend already-scaled by sponsor mult
      },
    ],
  } as unknown as GameEvent;
}

function makeNonTransitEvent(): GameEvent {
  return {
    id: "riot_in_district",
    chainId: "civil_unrest",
    title: "RIOT",
    description: "Unrest spreads.",
    severity: "high",
    effects: { happiness: -5 },
    responseOptions: [
      {
        id: "deploy_security",
        label: "DEPLOY SECURITY",
        description: "Crack down hard.",
        effects: { credits: -30, lawOrder: 4 },
      },
    ],
  } as unknown as GameEvent;
}

function renderExpanded(event: GameEvent): string {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <EventCard event={event} onDismiss={() => {}} onRespond={() => {}} />,
    );
  });
  // Toggle expand by invoking the first Pressable's onPress.
  const press = findFirstPress(tree.root);
  act(() => {
    press?.();
  });
  const text = flatText(tree.toJSON());
  act(() => tree.unmount());
  return text;
}

function renderCollapsed(event: GameEvent): string {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <EventCard event={event} onDismiss={() => {}} onRespond={() => {}} />,
    );
  });
  const text = flatText(tree.toJSON());
  act(() => tree.unmount());
  return text;
}

describe("EventCard — Free Choir transit chip (Task #218)", () => {
  it("renders no chip and no hint when stance is tolerate (mult = 1.0)", () => {
    setStance("tolerate");
    const text = renderExpanded(makeChainTransitEvent());
    expect(text).not.toContain("FREE CHOIR");
    expect(text).not.toContain("SPONSORED");
    expect(text).not.toContain("SUPPRESSED");
    // Raw base effects rendered untouched.
    expect(text).toContain("credits: +100");
    expect(text).toContain("tradeIncome: +8");
  });

  it("under sponsor stance, shows the +25% chip and re-scales chain-stage transit yields for display", () => {
    setStance("sponsor");
    const text = renderExpanded(makeChainTransitEvent());
    expect(text).toContain("+25% FREE CHOIR");
    expect(text).toContain("SPONSORED");
    expect(text).toMatch(/BOOSTED BY 25\s*%/);
    // 100 * 1.25 = 125, 8 * 1.25 = 10
    expect(text).toContain("credits: +125");
    expect(text).toContain("tradeIncome: +10");
    // Hint appears exactly once — only the open_route row qualifies.
    const hintCount = text.match(/BOOSTED BY 25\s*%/g)?.length ?? 0;
    expect(hintCount).toBe(1);
  });

  it("under suppress stance, shows the -20% chip and shrinks chain-stage transit yields for display", () => {
    setStance("suppress");
    const text = renderExpanded(makeChainTransitEvent());
    expect(text).toContain("-20% FREE CHOIR");
    expect(text).toContain("SUPPRESSED");
    expect(text).toMatch(/REDUCED BY 20\s*%/);
    // 100 * 0.8 = 80, 8 * 0.8 = 6 (rounded)
    expect(text).toContain("credits: +80");
    expect(text).toContain("tradeIncome: +6");
  });

  it("on trade_caravan_arrives the chip renders but the displayed numbers are NOT re-scaled (already scaled at generate-time)", () => {
    setStance("sponsor");
    const text = renderExpanded(makeCaravanEvent());
    expect(text).toContain("+25% FREE CHOIR");
    expect(text).toContain("SPONSORED");
    // 75 stays 75 — must NOT become 94 (75 * 1.25 ≈ 94).
    expect(text).toContain("credits: +75");
    expect(text).not.toContain("credits: +94");
    expect(text).not.toContain("credits: +93");
  });

  it("does not render the chip on unrelated event chains, even when sponsor stance is active", () => {
    setStance("sponsor");
    const text = renderExpanded(makeNonTransitEvent());
    expect(text).not.toContain("FREE CHOIR");
    expect(text).not.toContain("SPONSORED");
    // Effects for the response render normally.
    expect(text).toContain("credits: -30");
    expect(text).toContain("lawOrder: +4");
  });
});

describe("EventCard — recurring crisis count", () => {
  it("shows the resurfacing count on a repeat crisis badge", () => {
    const event = {
      id: "biosphere_ecosystem_collapse",
      title: "ECOSYSTEM COLLAPSE",
      description: "The biosphere is failing again.",
      severity: "critical",
      effects: {},
      repeat: true,
      returnCount: 2,
    } as unknown as GameEvent;

    expect(renderCollapsed(event)).toContain("RETURNED 2 TIMES");
  });

  it("points a resurfaced biosphere crisis at its lasting fix", () => {
    setBiosphere(5);
    const event = {
      id: "biosphere_ecosystem_collapse",
      title: "ECOSYSTEM COLLAPSE",
      description: "The biosphere is failing again.",
      severity: "critical",
      effects: {},
      repeat: true,
      returnCount: 2,
    } as unknown as GameEvent;

    expect(renderCollapsed(event)).toContain(
      "LASTING FIX: Invest in reclamation domes, decontamination forests",
    );
  });

  it("points a resurfaced officer crisis at a roster-level fix", () => {
    setBiosphere(60);
    setAppointedOfficer();
    const event = {
      id: "officer_embezzlement",
      title: "EMBEZZLEMENT SCANDAL",
      description: "The same siphoning pattern is back.",
      severity: "high",
      effects: {},
      repeat: true,
      returnCount: 1,
    } as unknown as GameEvent;

    expect(renderCollapsed(event)).toContain(
      "LASTING FIX: Relieve corrupt officers and appoint cleaner replacements",
    );
  });
});
