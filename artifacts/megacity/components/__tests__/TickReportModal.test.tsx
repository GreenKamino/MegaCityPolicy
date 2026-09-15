import React from "react";
import { describe, expect, it, vi } from "vitest";

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


(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import TestRenderer, { act } from "react-test-renderer";

import TickReportModal from "@/components/TickReportModal";
import type { OfflineSimDepth } from "@/engine/offlineSimDepth";

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

function render(props: {
  simulatedTicks?: number;
  extrapolatedTicks?: number;
  offlineSimDepth?: OfflineSimDepth;
  tickCount?: number;
  catchupWallMs?: number;
  estimatedWallMs?: number;
  recentOvershootCount?: number;
  onAutoTuneDepth?: () => void;
}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TickReportModal
        visible
        entries={[]}
        tickCount={props.tickCount ?? 100}
        onDismiss={() => {}}
        simulatedTicks={props.simulatedTicks}
        extrapolatedTicks={props.extrapolatedTicks}
        offlineSimDepth={props.offlineSimDepth}
        catchupWallMs={props.catchupWallMs}
        estimatedWallMs={props.estimatedWallMs}
        recentOvershootCount={props.recentOvershootCount}
        onAutoTuneDepth={props.onAutoTuneDepth}
      />
    );
  });
  const text = flatText(tree.toJSON());
  act(() => tree.unmount());
  return text;
}

// Render and return the live tree so a test can locate and press the
// auto-tune Pressable (identified by its accessibilityLabel).
function renderTree(props: {
  offlineSimDepth?: OfflineSimDepth;
  tickCount?: number;
  catchupWallMs?: number;
  estimatedWallMs?: number;
  recentOvershootCount?: number;
  onAutoTuneDepth?: () => void;
}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TickReportModal
        visible
        entries={[]}
        tickCount={props.tickCount ?? 96}
        onDismiss={() => {}}
        offlineSimDepth={props.offlineSimDepth}
        catchupWallMs={props.catchupWallMs}
        estimatedWallMs={props.estimatedWallMs}
        recentOvershootCount={props.recentOvershootCount}
        onAutoTuneDepth={props.onAutoTuneDepth}
      />
    );
  });
  return tree;
}

describe("TickReportModal offline-depth callout", () => {
  it("shows the Lite depth line and the switch-to-Deep hint when extrapolation kicked in", () => {
    const text = render({
      simulatedTicks: 250,
      extrapolatedTicks: 100,
      offlineSimDepth: "lite",
      tickCount: 350,
    });
    expect(text).toContain("OFFLINE DEPTH: LITE");
    expect(text).toContain("FULLY SIMULATED 250 / 350 TICKS");
    expect(text).toContain("Switch to Standard or Deep in Settings to simulate more on resume.");
  });

  it("shows the Standard depth line and the switch-to-Deep hint when extrapolation kicked in", () => {
    const text = render({
      simulatedTicks: 1500,
      extrapolatedTicks: 50,
      offlineSimDepth: "standard",
      tickCount: 1550,
    });
    expect(text).toContain("OFFLINE DEPTH: STANDARD");
    expect(text).toContain("FULLY SIMULATED 1500 / 1550 TICKS");
    expect(text).toContain("Switch to Deep in Settings to simulate more on resume.");
  });

  it("shows the Deep depth line but no switch hint when extrapolation kicked in", () => {
    const text = render({
      simulatedTicks: 6000,
      extrapolatedTicks: 200,
      offlineSimDepth: "deep",
      tickCount: 6200,
    });
    expect(text).toContain("OFFLINE DEPTH: DEEP");
    expect(text).toContain("FULLY SIMULATED 6000 / 6200 TICKS");
    expect(text).not.toContain("Switch to Deep");
    expect(text).not.toContain("Switch to Standard");
  });

  it("renders no depth line and no switch hint when no ticks were extrapolated", () => {
    const text = render({
      simulatedTicks: 100,
      extrapolatedTicks: 0,
      offlineSimDepth: "lite",
      tickCount: 100,
    });
    expect(text).not.toContain("OFFLINE DEPTH");
    expect(text).not.toContain("Switch to Deep");
    expect(text).not.toContain("Switch to Standard");
  });

  it("renders no depth line when the depth setting is missing even if extrapolation happened", () => {
    const text = render({
      simulatedTicks: 250,
      extrapolatedTicks: 100,
      tickCount: 350,
    });
    expect(text).not.toContain("OFFLINE DEPTH");
  });
});

describe("TickReportModal resume-time pill", () => {
  it("shows the measured resume duration in seconds for a one-day catchup", () => {
    const text = render({
      tickCount: 96, // 1 day
      catchupWallMs: 2100,
    });
    expect(text).toContain("RESUMED 1 DAY IN 2.1s");
  });

  it("uses minute formatting for very long catch-ups", () => {
    const text = render({
      tickCount: 96 * 14, // 14 days
      catchupWallMs: 75_000, // 1m 15s
    });
    expect(text).toContain("RESUMED 14 DAYS IN 1m 15s");
  });

  it("falls back to milliseconds and minute-level wording for tiny batches", () => {
    // 1 tick = 15 minutes of in-game time, so we should see "15 MIN" not "1 DAY".
    const text = render({
      tickCount: 1,
      catchupWallMs: 4,
    });
    expect(text).toContain("RESUMED 15 MIN IN 4ms");
  });

  it("uses hour wording for sub-day catch-ups", () => {
    // 12 ticks = 3 hours of in-game time
    const text = render({
      tickCount: 12,
      catchupWallMs: 850,
    });
    expect(text).toContain("RESUMED 3 HOURS IN");
  });

  it("hides the pill when no catchup duration was measured (live tick log)", () => {
    const text = render({ tickCount: 50 });
    expect(text).not.toContain("RESUMED");
  });

  it("hides the pill when the measured duration is effectively zero", () => {
    const text = render({ tickCount: 50, catchupWallMs: 0 });
    expect(text).not.toContain("RESUMED");
  });
});

describe("TickReportModal resume-overshoot warning", () => {
  it("shows the warning when actual blew past the estimate by both ratio and absolute gap", () => {
    const text = render({
      tickCount: 96,
      catchupWallMs: 3200,       // 3.2s
      estimatedWallMs: 1000,     // 1.0s — 3.2× over and ~2.2s gap
    });
    expect(text).toContain("TOOK LONGER THAN EXPECTED");
    expect(text).toContain("ESTIMATED 1.0s");
    expect(text).toContain("lower OFFLINE SIM DEPTH in Settings");
  });

  it("hides the warning when actual is close to the estimate (within ratio)", () => {
    const text = render({
      tickCount: 96,
      catchupWallMs: 1200,
      estimatedWallMs: 1000, // only 1.2× — under 1.5× threshold
    });
    expect(text).not.toContain("TOOK LONGER THAN EXPECTED");
  });

  it("hides the warning for tiny absolute overshoots even when the ratio is high", () => {
    // 6ms vs 2ms is 3×, but the absolute gap (4ms) is tiny — staying silent
    // avoids alarm bells on micro-jitter for sub-second resumes.
    const text = render({
      tickCount: 4,
      catchupWallMs: 6,
      estimatedWallMs: 2,
    });
    expect(text).not.toContain("TOOK LONGER THAN EXPECTED");
  });

  it("hides the warning when no estimate was supplied (e.g. live tick log)", () => {
    const text = render({
      tickCount: 96,
      catchupWallMs: 5000,
    });
    expect(text).not.toContain("TOOK LONGER THAN EXPECTED");
  });

  it("hides the warning when there is no measured catch-up duration", () => {
    const text = render({
      tickCount: 96,
      estimatedWallMs: 1000,
    });
    expect(text).not.toContain("TOOK LONGER THAN EXPECTED");
  });
});

describe("TickReportModal resume-overshoot escalation wording", () => {
  // All cases are real overshoots (3.2s vs 1.0s); only the
  // recentOvershootCount changes to drive escalation tier.
  const overshootBase = { tickCount: 96, catchupWallMs: 3200, estimatedWallMs: 1000 };

  it("shows the SOFT wording when this is the first recent overshoot", () => {
    const text = render({ ...overshootBase, recentOvershootCount: 1 });
    expect(text).toContain("TOOK LONGER THAN EXPECTED — ESTIMATED");
    expect(text).not.toContain("× RECENT");
    expect(text).not.toContain("PERFORMANCE DEGRADING");
    expect(text).toContain("If this keeps happening");
  });

  it("shows the MODERATE wording with (N× RECENT) tag at counts 2-3", () => {
    const text2 = render({ ...overshootBase, recentOvershootCount: 2 });
    expect(text2).toContain("TOOK LONGER THAN EXPECTED (2× RECENT)");
    expect(text2).not.toContain("PERFORMANCE DEGRADING");

    const text3 = render({ ...overshootBase, recentOvershootCount: 3 });
    expect(text3).toContain("TOOK LONGER THAN EXPECTED (3× RECENT)");
  });

  it("escalates to SEVERE wording and stronger hint at 4+ recent overshoots", () => {
    const text = render({ ...overshootBase, recentOvershootCount: 4 });
    expect(text).toContain("RESUME PERFORMANCE DEGRADING (4× RECENT)");
    expect(text).toContain("Strongly consider lowering OFFLINE SIM DEPTH");
  });

  it("falls back to soft wording when no count was provided", () => {
    const text = render(overshootBase);
    expect(text).toContain("TOOK LONGER THAN EXPECTED — ESTIMATED");
    expect(text).not.toContain("× RECENT");
  });

  it("does not render escalated wording when this resume itself was on-budget", () => {
    // High recent count but the current resume stayed within budget — the
    // warning should not show at all (it's gated on the current overshoot).
    const text = render({
      tickCount: 96,
      catchupWallMs: 1100,
      estimatedWallMs: 1000,
      recentOvershootCount: 5,
    });
    expect(text).not.toContain("TOOK LONGER THAN EXPECTED");
    expect(text).not.toContain("PERFORMANCE DEGRADING");
  });
});

describe("TickReportModal auto-tune offline-sim-depth action", () => {
  // A real, severe overshoot (3.2s vs 1.0s, 4 recent) — the tier that
  // unlocks the one-tap auto-tune button.
  const severe = { tickCount: 96, catchupWallMs: 3200, estimatedWallMs: 1000, recentOvershootCount: 4 };

  function findAutoTuneButton(tree: TestRenderer.ReactTestRenderer) {
    return tree.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === "string" &&
        n.props.accessibilityLabel.startsWith("AUTO-TUNE: LOWER TO"),
    );
  }

  it("offers 'LOWER TO STANDARD' at the severe tier when depth is Deep", () => {
    const text = render({ ...severe, offlineSimDepth: "deep", onAutoTuneDepth: () => {} });
    expect(text).toContain("AUTO-TUNE: LOWER TO STANDARD");
  });

  it("offers 'LOWER TO LITE' at the severe tier when depth is Standard", () => {
    const text = render({ ...severe, offlineSimDepth: "standard", onAutoTuneDepth: () => {} });
    expect(text).toContain("AUTO-TUNE: LOWER TO LITE");
  });

  it("hides the button at the Lite floor — nothing lower to drop to", () => {
    const text = render({ ...severe, offlineSimDepth: "lite", onAutoTuneDepth: () => {} });
    expect(text).not.toContain("AUTO-TUNE");
  });

  it("hides the button below the severe tier (moderate count)", () => {
    const text = render({
      tickCount: 96,
      catchupWallMs: 3200,
      estimatedWallMs: 1000,
      recentOvershootCount: 3,
      offlineSimDepth: "deep",
      onAutoTuneDepth: () => {},
    });
    expect(text).toContain("TOOK LONGER THAN EXPECTED (3× RECENT)");
    expect(text).not.toContain("AUTO-TUNE");
  });

  it("hides the button when no handler is wired (e.g. live tick log)", () => {
    const text = render({ ...severe, offlineSimDepth: "deep" });
    expect(text).toContain("RESUME PERFORMANCE DEGRADING");
    expect(text).not.toContain("AUTO-TUNE");
  });

  it("invokes the handler when the button is pressed", () => {
    const onAutoTuneDepth = vi.fn();
    const tree = renderTree({ ...severe, offlineSimDepth: "deep", onAutoTuneDepth });
    try {
      const [btn] = findAutoTuneButton(tree);
      expect(btn).toBeTruthy();
      act(() => {
        btn.props.onPress();
      });
      expect(onAutoTuneDepth).toHaveBeenCalledTimes(1);
    } finally {
      act(() => tree.unmount());
    }
  });
});
