import React from "react";
import { describe, expect, it, vi } from "vitest";

// Integration test for the progressive-HUD wiring. The pure unlock rules live
// in engine/hudUnlocks.ts (covered by hudUnlocks.test.ts); here we mount the
// REAL TopNavBar / BottomQuickBar and assert the rendered tabs actually grow
// beat-by-beat for a fresh game and show EVERYTHING for legacy / skipped /
// completed saves. engine/hudUnlocks is intentionally NOT mocked.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      const { children, style: _s, onPress: _o, disabled: _d, contentContainerStyle: _c, ...rest } = props ?? {};
      return React.createElement(name, rest, children);
    };
  return {
    View: passthrough("View"),
    Text: passthrough("Text"),
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
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

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#00FF41",
      text: "#E0E0E0",
      textMuted: "#4A5A4A",
      bgSecondary: "#141F14",
      bgElevated: "#1F2A1F",
      borderBright: "#1F2A1F",
    },
    mode: "dark",
  }),
}));

// Hide hotkey badges so the only text in the tree is the tab labels (keeps the
// token assertions unambiguous).
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ showHotkeys: false }),
}));

// The components call useGameStateSelector(unlockedHudFeaturesCsv). Run the REAL
// selector against whatever state the current test installed.
let currentState: any = {};
vi.mock("@/context/GameContext", () => ({
  useGameStateSelector: (selector: (s: any) => unknown) => selector(currentState),
}));

vi.mock("@/hooks/useMouse", () => ({
  useHover: () => ({ hovered: false, handlers: {} }),
  cursorPointer: {},
}));

vi.mock("@/hooks/useKeyboardHelp", () => ({ openKeyboardHelp: () => {} }));
vi.mock("@/engine/audio", () => ({ playSound: () => {} }));
vi.mock("@/engine/haptics", () => ({ playHaptic: () => {} }));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/(game)/overview",
}));

import TestRenderer, { act } from "react-test-renderer";
import TopNavBar from "@/components/TopNavBar";
import BottomQuickBar from "@/components/BottomQuickBar";

type UnlockFields = {
  hasCompletedOnboarding?: boolean;
  didBuild?: boolean;
  didEdict?: boolean;
  didRead?: boolean;
  onboardingStep?: string;
};

function mk(over: UnlockFields = {}) {
  return {
    hasCompletedOnboarding: false,
    didBuild: false,
    didEdict: false,
    didRead: false,
    onboardingStep: "arrival",
    ...over,
  };
}

const TOP_LABELS = ["CITY", "LAW", "ECONOMY", "MAP", "BUILD", "DIPLO", "MORE"];
const BOTTOM_LABELS = [
  "INBOX",
  "RESEARCH",
  "MILITARY",
  "FACTIONS",
  "EVENTS",
  "WILDLANDS",
  "DOSSIER",
  "MISSIONS",
  "FINANCE",
  "OFFICERS",
  "SECTORS",
  "TRADE",
  "STATS",
  "CODEX",
];

function tokens(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string" || typeof node === "number") {
    for (const t of String(node).split(/\s+/)) if (t) out.push(t);
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) tokens(c, out);
    return out;
  }
  if (node.children) tokens(node.children, out);
  return out;
}

// Render a chrome component against `state` and return the known tab labels in
// the order they actually appear in the rendered tree. Deriving order from the
// tree (rather than filtering a fixed expected list) means an accidental tab
// reorder also fails the suite, not just a missing/extra tab.
function visibleLabels(Component: React.ComponentType, state: any, labels: string[]): string[] {
  currentState = state;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(React.createElement(Component));
  });
  const known = new Set(labels);
  const ordered = tokens(tree.toJSON()).filter((t) => known.has(t));
  act(() => tree.unmount());
  return ordered;
}

const topTabs = (state: any) => visibleLabels(TopNavBar, state, TOP_LABELS);
const bottomTabs = (state: any) => visibleLabels(BottomQuickBar, state, BOTTOM_LABELS);

describe("HUD chrome gating — fresh-game beat-by-beat reveal", () => {
  it("arrival shows only CITY, nothing in the quick bar", () => {
    const s = mk();
    expect(topTabs(s)).toEqual(["CITY"]);
    expect(bottomTabs(s)).toEqual([]);
  });

  it("build beat reveals BUILD in the top bar", () => {
    const s = mk({ onboardingStep: "build" });
    expect(topTabs(s)).toEqual(["CITY", "BUILD"]);
    expect(bottomTabs(s)).toEqual([]);
  });

  it("completing build (didBuild) reveals LAW", () => {
    const s = mk({ didBuild: true });
    expect(topTabs(s)).toEqual(["CITY", "LAW", "BUILD"]);
    expect(bottomTabs(s)).toEqual([]);
  });

  it("completing the edict (didEdict) reveals the DISPATCH INBOX quick-bar item", () => {
    const s = mk({ didBuild: true, didEdict: true });
    expect(topTabs(s)).toEqual(["CITY", "LAW", "BUILD"]);
    expect(bottomTabs(s)).toEqual(["INBOX"]);
  });

  it("reading the dispatch (didRead) reveals ECONOMY (top) and RESEARCH (quick bar)", () => {
    const s = mk({ didBuild: true, didEdict: true, didRead: true });
    expect(topTabs(s)).toEqual(["CITY", "LAW", "ECONOMY", "BUILD"]);
    expect(bottomTabs(s)).toEqual(["INBOX", "RESEARCH"]);
    // Late-game chrome is still hidden until orientation completes.
    expect(topTabs(s)).not.toContain("MAP");
    expect(bottomTabs(s)).not.toContain("MILITARY");
  });

  it("the visible top-bar set only ever grows across the orientation", () => {
    const ramp = [
      mk(),
      mk({ onboardingStep: "build" }),
      mk({ didBuild: true }),
      mk({ didBuild: true, didEdict: true }),
      mk({ didBuild: true, didEdict: true, didRead: true }),
    ];
    let prev: string[] = [];
    for (const s of ramp) {
      const now = topTabs(s);
      // every previously-visible label is still visible
      for (const l of prev) expect(now).toContain(l);
      expect(now.length).toBeGreaterThanOrEqual(prev.length);
      prev = now;
    }
  });
});

describe("HUD chrome gating — veterans always see everything (safety)", () => {
  it("a completed / skipped onboarding shows all top and quick-bar tabs", () => {
    const s = mk({ hasCompletedOnboarding: true });
    expect(topTabs(s)).toEqual(TOP_LABELS);
    expect(bottomTabs(s)).toEqual(BOTTOM_LABELS);
  });

  it("a legacy save (hasCompletedOnboarding undefined) shows all tabs", () => {
    const s = mk({ hasCompletedOnboarding: undefined });
    expect(topTabs(s)).toEqual(TOP_LABELS);
    expect(bottomTabs(s)).toEqual(BOTTOM_LABELS);
  });

  it("a fresh game mid-orientation never shows the full set (proves gating is live)", () => {
    const s = mk({ didBuild: true, didEdict: true, didRead: true });
    expect(topTabs(s).length).toBeLessThan(TOP_LABELS.length);
    expect(bottomTabs(s).length).toBeLessThan(BOTTOM_LABELS.length);
  });
});
