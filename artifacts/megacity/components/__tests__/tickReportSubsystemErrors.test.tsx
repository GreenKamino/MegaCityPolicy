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
import type { TickSubsystemError } from "@/engine/formulas";

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

function render(subsystemErrors?: TickSubsystemError[]): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TickReportModal
        visible
        entries={[]}
        tickCount={100}
        onDismiss={() => {}}
        subsystemErrors={subsystemErrors}
      />,
    );
  });
  return tree;
}

describe("TickReportModal — offline catch-up subsystem errors", () => {
  it("renders a banner listing each failed subsystem (plural wording)", () => {
    const tree = render([
      { subsystem: "Combat", error: "engagement blew up" },
      { subsystem: "Banking", error: "bigint balance" },
    ]);
    const text = flatText(tree.toJSON());
    expect(text).toContain("2 SUBSYSTEM ERRORS DURING CATCH-UP");
    expect(text).toContain("Combat");
    expect(text).toContain("engagement blew up");
    expect(text).toContain("Banking");
    expect(text).toContain("bigint balance");
  });

  it("uses singular wording for exactly one error", () => {
    const text = flatText(render([{ subsystem: "Combat", error: "boom" }]).toJSON());
    expect(text).toContain("1 SUBSYSTEM ERROR DURING CATCH-UP");
  });

  it("falls back to 'unknown error' when the message is empty", () => {
    const text = flatText(render([{ subsystem: "Demographics", error: "" }]).toJSON());
    expect(text).toContain("Demographics");
    expect(text).toContain("unknown error");
  });

  it("renders no banner when there are no subsystem errors", () => {
    expect(flatText(render([]).toJSON())).not.toContain("DURING CATCH-UP");
    expect(flatText(render(undefined).toJSON())).not.toContain("DURING CATCH-UP");
  });

  it("shows a COPY REPORT button and fires onCopyReport when provided", () => {
    const onCopyReport = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <TickReportModal
          visible
          entries={[]}
          tickCount={100}
          onDismiss={() => {}}
          subsystemErrors={[{ subsystem: "Combat", error: "boom" }]}
          onCopyReport={onCopyReport}
        />,
      );
    });
    expect(flatText(tree.toJSON())).toContain("COPY REPORT");

    const copyBtn = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === "Copy full error report",
    )[0];
    act(() => copyBtn.props.onPress());
    expect(onCopyReport).toHaveBeenCalledTimes(1);
  });

  it("omits the COPY REPORT button when onCopyReport is not provided", () => {
    expect(flatText(render([{ subsystem: "Combat", error: "boom" }]).toJSON())).not.toContain(
      "COPY REPORT",
    );
  });
});
