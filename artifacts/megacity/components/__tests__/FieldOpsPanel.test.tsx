import React from "react";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      const { children, style: _style, ...rest } = props ?? {};
      return React.createElement(name, rest, children);
    };
  return {
    Platform: { OS: "web" },
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    Text: passthrough("Text"),
    View: passthrough("View"),
    StyleSheet: { create: (styles: any) => styles },
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  return {
    MaterialCommunityIcons: (_props: any) => React.createElement("Icon"),
  };
});

vi.mock("@/components/SectionHeader", () => ({
  default: () => null,
}));

vi.mock("@/hooks/useHorizontalWheelScroll", () => ({
  useHorizontalWheelScroll: () => undefined,
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#00FF41",
      danger: "#FF3344",
      text: "#E0E0E0",
      textSecondary: "#A0A0A0",
      textMuted: "#4A5A4A",
      bgCard: "#141F14",
      border: "#1F2A1F",
      warning: "#FF9500",
    },
  }),
}));

import TestRenderer, { act } from "react-test-renderer";
import FieldOpsPanel from "@/components/FieldOpsPanel";

function flatText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatText).join(" ");
  if (typeof node === "object" && "children" in node) {
    return flatText((node as { children?: unknown }).children);
  }
  return "";
}

function renderPanel(
  credits: number,
  availableUnits: number,
  extra: Partial<React.ComponentProps<typeof FieldOpsPanel>> = {},
): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <FieldOpsPanel credits={credits} availableUnits={availableUnits} {...extra} />,
    );
  });
  return tree;
}

function textFor(tree: TestRenderer.ReactTestRenderer, testID: string): string {
  const node = tree.root.findByProps({ testID });
  return flatText(node);
}

describe("FieldOpsPanel", () => {
  it("shows the catalog outcomes on a collapsed operation choice", () => {
    const tree = renderPanel(100_000, 100);
    const outcome = textFor(tree, "law-op-outcomes-underhive_sweep");

    expect(outcome).toContain("CRIME");
    expect(outcome).toContain("-3");
    expect(outcome).toContain("LAW");
    expect(outcome).toContain("+2");
    expect(outcome).toContain("RISK");
    expect(outcome).toContain("MEDIUM");
    expect(outcome).toContain("COST");
    expect(outcome).toContain("3,000");
    expect(outcome).toContain("CR");
    expect(outcome).toContain("UNITS");
    expect(outcome).toContain("10");
  });

  it("separates credit and personnel shortages from a risky but ready operation", () => {
    const shortCredits = renderPanel(1_000, 100);
    expect(textFor(shortCredits, "law-op-availability-underhive_sweep")).toContain("INSUFFICIENT CREDITS");

    const shortUnits = renderPanel(100_000, 1);
    expect(textFor(shortUnits, "law-op-availability-underhive_sweep")).toContain("INSUFFICIENT UNITS");

    const ready = renderPanel(100_000, 100);
    expect(textFor(ready, "law-op-availability-underhive_sweep")).toContain("READY TO DISPATCH");
    expect(textFor(ready, "law-op-availability-gang_bust")).toContain("READY TO DISPATCH");
  });

  it("dispatches the selected ready operation and disables it during cooldown", () => {
    const onDispatch = vi.fn();
    const tree = renderPanel(100_000, 100, { onDispatch });
    act(() => tree.root.findByProps({ testID: "law-op-underhive_sweep" }).props.onPress());
    const button = tree.root.findByProps({ testID: "law-op-dispatch-underhive_sweep" });
    act(() => button.props.onPress());
    expect(onDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: "underhive_sweep" }));

    const cooling = renderPanel(100_000, 100, {
      totalTicks: 10,
      cooldowns: { underhive_sweep: 15 },
    });
    expect(textFor(cooling, "law-op-availability-underhive_sweep")).toContain("COOLDOWN — 5 TICKS");
    act(() => cooling.root.findByProps({ testID: "law-op-underhive_sweep" }).props.onPress());
    expect(cooling.root.findByProps({ testID: "law-op-dispatch-underhive_sweep" }).props.disabled).toBe(true);
  });
});