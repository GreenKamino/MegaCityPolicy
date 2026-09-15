import React from "react";
import { describe, expect, it, vi } from "vitest";

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
    StyleSheet: {
      create: (s: any) => s,
      absoluteFill: {},
      flatten: (s: any) => s,
    },
    Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
  };
});

// ChromeBoundary reads its palette from ThemeContext (class contextType).
// Mock the whole context module so its real import chain (SettingsContext ->
// engine/audio -> expo-audio) never loads in the node test environment.
vi.mock("@/context/ThemeContext", () => {
  const React = require("react");
  const colors = {
    bg: "#000",
    danger: "#f00",
    accent: "#0ff",
    warning: "#fa0",
    textMuted: "#888",
    textSecondary: "#ccc",
  };
  const ThemeContext = React.createContext({
    mode: "dark",
    colors,
    toggleTheme: () => {},
    setTheme: () => {},
    isDark: true,
  });
  return {
    ThemeContext,
    useTheme: () => React.useContext(ThemeContext),
  };
});

import TestRenderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";

import ChromeBoundary from "@/components/ChromeBoundary";

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

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function Throwing(): React.ReactElement {
  throw new Error("CHROME_BOOM");
}

describe("ChromeBoundary - chrome region isolation", () => {
  it("renders children normally when they don't throw", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ChromeBoundary, {
          region: "top nav",
          children: React.createElement(Text, null, "TOP_NAV_OK"),
        }),
      );
    });
    const text = collectText(tree.toJSON()).join(" ");
    expect(text).toContain("TOP_NAV_OK");
    expect(text).not.toContain("OFFLINE");
    act(() => tree.unmount());
  });

  it("renders a compact module-offline strip when its child throws, while sibling chrome and screen content remain mounted", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(
          View,
          null,
          // Failing chrome region — should fall back to compact strip.
          React.createElement(ChromeBoundary, {
            region: "top nav",
            children: React.createElement(Throwing, null),
          }),
          // Healthy sibling chrome — must stay mounted.
          React.createElement(ChromeBoundary, {
            region: "quick bar",
            children: React.createElement(Text, null, "QUICK_BAR_CHROME_OK"),
          }),
          // Active screen body — must stay mounted.
          React.createElement(Text, { testID: "screen" }, "ACTIVE_SCREEN_BODY"),
        ),
      );
    });

    const text = norm(collectText(tree.toJSON()).join(" "));
    // Failing region shows compact fallback (NOT the full SYSTEM MALFUNCTION screen).
    expect(text).toContain("MODULE OFFLINE");
    expect(text).toContain("TOP NAV");
    expect(text).not.toContain("SYSTEM MALFUNCTION");
    // Sibling chrome and screen body stay mounted.
    expect(text).toContain("QUICK_BAR_CHROME_OK");
    expect(text).toContain("ACTIVE_SCREEN_BODY");

    errSpy.mockRestore();
    act(() => tree.unmount());
  });

  it("a throw in an overlay region (toasts/atlas popup/save indicator/comms/lazy modals) leaves all sibling overlays mounted", () => {
    // Regression for task #180: every always-mounted overlay in
    // (game)/_layout.tsx is now wrapped in its own ChromeBoundary, so a render
    // throw in any one of them must NOT take down the others.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(
          View,
          null,
          React.createElement(ChromeBoundary, {
            region: "toasts",
            children: React.createElement(Throwing, null),
          }),
          React.createElement(ChromeBoundary, {
            region: "atlas popup",
            children: React.createElement(Text, null, "ATLAS_POPUP_OK"),
          }),
          React.createElement(ChromeBoundary, {
            region: "save indicator",
            children: React.createElement(Text, null, "SAVE_INDICATOR_OK"),
          }),
          React.createElement(ChromeBoundary, {
            region: "comms chatter",
            children: React.createElement(Text, null, "COMMS_OK"),
          }),
          React.createElement(ChromeBoundary, {
            region: "achievement report",
            children: React.createElement(Text, null, "ACHIEVEMENT_OK"),
          }),
          React.createElement(ChromeBoundary, {
            region: "keyboard help",
            children: React.createElement(Text, null, "KEYBOARD_HELP_OK"),
          }),
          React.createElement(ChromeBoundary, {
            region: "whats new",
            children: React.createElement(Text, null, "WHATS_NEW_OK"),
          }),
          // Stand-in for the active screen body — must stay mounted too.
          React.createElement(Text, { testID: "screen" }, "ACTIVE_SCREEN_BODY"),
        ),
      );
    });

    const text = norm(collectText(tree.toJSON()).join(" "));
    expect(text).toContain("MODULE OFFLINE");
    expect(text).toContain("TOASTS");
    expect(text).not.toContain("SYSTEM MALFUNCTION");
    expect(text).toContain("ATLAS_POPUP_OK");
    expect(text).toContain("SAVE_INDICATOR_OK");
    expect(text).toContain("COMMS_OK");
    expect(text).toContain("ACHIEVEMENT_OK");
    expect(text).toContain("KEYBOARD_HELP_OK");
    expect(text).toContain("WHATS_NEW_OK");
    expect(text).toContain("ACTIVE_SCREEN_BODY");

    errSpy.mockRestore();
    act(() => tree.unmount());
  });

  it("a throw in one chrome region does not take down a sibling chrome region", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(
          View,
          null,
          React.createElement(ChromeBoundary, {
            region: "news ticker",
            children: React.createElement(Throwing, null),
          }),
          React.createElement(ChromeBoundary, {
            region: "sidebar",
            children: React.createElement(Text, null, "SIDEBAR_OK"),
          }),
        ),
      );
    });

    const text = norm(collectText(tree.toJSON()).join(" "));
    expect(text).toContain("MODULE OFFLINE");
    expect(text).toContain("NEWS TICKER");
    expect(text).toContain("SIDEBAR_OK");

    errSpy.mockRestore();
    act(() => tree.unmount());
  });
});
