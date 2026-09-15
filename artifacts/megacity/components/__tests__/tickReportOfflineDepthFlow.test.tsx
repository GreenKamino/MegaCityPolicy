import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The component under test now reads its palette from ThemeContext. Mock the
// whole module so its real import chain (SettingsContext -> engine/audio ->
// expo-audio) never loads in the node test environment. Uses the real DARK
// palette so every style factory key resolves.
vi.mock("@/context/ThemeContext", async () => {
  const React = await import("react");
  const Colors = (await import("@/constants/colors")).default;
  const ThemeContext = React.createContext({
    mode: "dark",
    colors: Colors,
    toggleTheme: () => {},
    setTheme: () => {},
    isDark: true,
  });
  return { ThemeContext, useTheme: () => React.useContext(ThemeContext) };
});


// React Test Renderer wants this flag for act() batching.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Native shim — TickReportModal renders View/Text/Pressable/Modal.
vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      return React.createElement(name, props, props.children);
    };
  return {
    View: passthrough("View"),
    Text: passthrough("Text"),
    Modal: passthrough("Modal"),
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    StyleSheet: { create: (s: any) => s, absoluteFill: {}, flatten: (s: any) => s },
    Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  const Icon = (_props: any) => React.createElement("Icon", null);
  return { Feather: Icon, MaterialCommunityIcons: Icon };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import TestRenderer, { act } from "react-test-renderer";

import TickReportModal from "@/components/TickReportModal";
import { createInitialState } from "@/engine/initialState";
import type { GameState } from "@/engine/types";
import {
  runOfflineCatchup,
  type OfflineReport,
} from "@/engine/offlineCatchup";
import {
  OFFLINE_SIM_DEPTH_BATCH_LIMIT,
  type OfflineSimDepth,
} from "@/engine/offlineSimDepth";

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
  return collectText(node).join("").replace(/\s+/g, " ");
}

// Build a saved game state with `minutesAgo` of missed time at the given
// tick interval. The runOfflineCatchup helper drives the entire catch-up
// pipeline from this seed — no React, no AsyncStorage, no provider stack.
function buildSavedState(minutesAgo: number): GameState {
  const base = createInitialState();
  return {
    ...base,
    saveSlot: 1,
    tickIntervalMinutes: 15,
    // A game only accrues offline progress while it was RUNNING. createInitialState
    // starts paused (the title/onboarding default), and runOfflineCatchup now
    // short-circuits paused games, so this returning-player fixture must un-pause.
    tickPaused: false,
    lastTickTime: Date.now() - minutesAgo * 60 * 1000,
  };
}

function renderModalForReport(report: OfflineReport): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TickReportModal
        visible
        entries={report.summaryEntries}
        tickCount={report.ticksProcessed}
        simulatedTicks={report.simulatedTicks}
        extrapolatedTicks={report.extrapolatedTicks}
        offlineSimDepth={report.offlineSimDepth}
        onDismiss={() => {}}
      />,
    );
  });
  return tree;
}

beforeEach(() => {
  // Pin Math.random so per-tick randomness during catch-up doesn't introduce
  // flakiness (event roll attempts, mega-project resolution, etc.).
  vi.spyOn(Math, "random").mockReturnValue(0.42);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Offline-depth callout — runOfflineCatchup helper + TickReportModal", () => {
  it("Lite + small batch limit forces extrapolation: modal shows the depth line and the Switch hint", () => {
    const saved = buildSavedState(6 * 60);
    // calculateMissedTicks caps at 24, so 6h at 15-minute ticks = 24 missed.
    // Override Lite's batch limit to 5 so the engine's 24-missed-tick cap
    // exceeds it and the extrapolation block runs.
    const depth: OfflineSimDepth = "lite";
    const { report } = runOfflineCatchup(saved, depth, 5);
    expect(report).not.toBeNull();
    const r = report!;
    expect(r.offlineSimDepth).toBe("lite");
    expect(r.ticksProcessed).toBe(24);
    expect(r.simulatedTicks).toBe(5);
    expect(r.extrapolatedTicks).toBe(19);

    const tree = renderModalForReport(r);
    try {
      const text = flatText(tree.toJSON());
      // showExtrapolationNote && !!offlineSimDepth must both be true for
      // the depth callout to render. Asserting the rendered text
      // verifies that path end-to-end.
      expect(text).toContain("5 TICKS FULLY SIMULATED");
      expect(text).toContain("19 ESTIMATED FROM RATES");
      expect(text).toContain("OFFLINE DEPTH: LITE");
      expect(text).toContain("FULLY SIMULATED 5 / 24 TICKS");
      expect(text).toContain("Switch to Standard or Deep in Settings to simulate more on resume.");
    } finally {
      act(() => tree.unmount());
    }
  });

  it("Deep + a high batch limit covers all missed ticks: depth callout is suppressed", () => {
    const saved = buildSavedState(6 * 60);
    const depth: OfflineSimDepth = "deep";
    // Deep's production batch limit (6000) trivially covers the 24 missed
    // ticks the engine reports — exercise the default path.
    const { report } = runOfflineCatchup(saved, depth);
    expect(report).not.toBeNull();
    const r = report!;
    expect(r.offlineSimDepth).toBe("deep");
    expect(r.ticksProcessed).toBe(24);
    expect(r.simulatedTicks).toBe(24);
    expect(r.extrapolatedTicks).toBe(0);

    const tree = renderModalForReport(r);
    try {
      const text = flatText(tree.toJSON());
      // showExtrapolationNote requires extrapolatedTicks > 0; with 0 the
      // extrapolation note (and therefore the depth note) must be absent
      // — verifying the showExtrapolationNote guard wired into the modal.
      expect(text).not.toContain("ESTIMATED FROM RATES");
      expect(text).not.toContain("OFFLINE DEPTH");
      expect(text).not.toContain("Switch to Deep");
      expect(text).not.toContain("Switch to Standard");
    } finally {
      act(() => tree.unmount());
    }
  });

  it("uses OFFLINE_SIM_DEPTH_BATCH_LIMIT when no batch limit override is supplied", () => {
    // Sanity check that the helper's default batchLimit lookup matches the
    // shared table — guards against future drift between the helper default
    // and the lookup table the GameContext callers used to use directly.
    const saved = buildSavedState(6 * 60);
    const { report } = runOfflineCatchup(saved, "standard");
    expect(report).not.toBeNull();
    expect(report!.simulatedTicks).toBe(Math.min(24, OFFLINE_SIM_DEPTH_BATCH_LIMIT.standard));
  });
});
