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
    Pressable: passthrough("Pressable"),
    StyleSheet: {
      create: (s: any) => s,
      absoluteFill: {},
      flatten: (s: any) => s,
    },
    Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
  };
});

const replaceMock = vi.fn();
vi.mock("expo-router", () => ({
  router: { replace: (...args: any[]) => replaceMock(...args), push: vi.fn() },
  // withScreenBoundary freezes blurred screens via navigation focus events;
  // these tests render outside a navigator, so stub an always-focused screen.
  useNavigation: () => ({
    isFocused: () => true,
    addListener: (_event: string, _cb: () => void) => () => {},
  }),
}));

vi.mock("@/engine/panicSave", () => ({
  triggerPanicSave: vi.fn(),
}));

vi.mock("@/engine/crashReports", () => ({
  recordCrashReport: vi.fn(),
  formatCrashReport: (r: any) => JSON.stringify(r),
  getCrashReports: () => [],
  clearCrashReports: vi.fn(),
  subscribeCrashReports: () => () => {},
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => true),
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "test" } },
}));

// GameErrorBoundary reads its palette from ThemeContext (class contextType).
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

import { withScreenBoundary } from "@/components/withScreenBoundary";

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

function findByText(node: any, needle: string): any | null {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findByText(c, needle);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const text = collectText(node).join("");
  if (text.includes(needle)) {
    if (node.children) {
      const inChild = findByText(node.children, needle);
      if (inChild) return inChild;
    }
    return node;
  }
  return null;
}

function Throwing(): React.ReactElement {
  throw new Error("BOOM_FROM_SCREEN");
}

function Healthy(): React.ReactElement {
  return React.createElement(Text, null, "HEALTHY_SCREEN_BODY");
}

describe("withScreenBoundary - per-screen error isolation", () => {
  it("shows fallback for the failing screen while a sibling chrome stays mounted", () => {
    const WrappedThrowing = withScreenBoundary(Throwing, "factions");

    // Silence the expected React error log for the throwing render.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(
          View,
          null,
          React.createElement(Text, { testID: "chrome-top-nav" }, "TOP_NAV_CHROME"),
          React.createElement(WrappedThrowing, null),
          React.createElement(Text, { testID: "chrome-bottom-bar" }, "BOTTOM_BAR_CHROME"),
        ),
      );
    });

    const text = collectText(tree.toJSON()).join(" ");
    // The failing screen's fallback rendered.
    expect(text).toContain("SYSTEM MALFUNCTION");
    expect(text).toContain("FACTIONS");
    expect(text).toContain("BOOM_FROM_SCREEN");
    // Surrounding chrome is still on screen and reachable.
    expect(text).toContain("TOP_NAV_CHROME");
    expect(text).toContain("BOTTOM_BAR_CHROME");

    // The fallback exposes a RETRY action — the chrome (sibling) is therefore
    // not blocked by a global boundary swap.
    expect(text).toContain("[ RETRY ]");
    // Non-overview screens get a BACK TO OVERVIEW affordance.
    expect(text).toContain("[ BACK TO OVERVIEW ]");

    errSpy.mockRestore();
    act(() => tree.unmount());
  });

  it("does not render fallback when the screen renders successfully", () => {
    const WrappedHealthy = withScreenBoundary(Healthy, "overview");
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(WrappedHealthy, null));
    });
    const text = collectText(tree.toJSON()).join(" ");
    expect(text).toContain("HEALTHY_SCREEN_BODY");
    expect(text).not.toContain("SYSTEM MALFUNCTION");
    act(() => tree.unmount());
  });

  it("a throw in one wrapped screen does not bubble up to a sibling wrapped screen", () => {
    const WrappedThrowing = withScreenBoundary(Throwing, "factions");
    const WrappedHealthy = withScreenBoundary(Healthy, "economy");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(
          View,
          null,
          React.createElement(WrappedThrowing, null),
          React.createElement(WrappedHealthy, null),
        ),
      );
    });

    const text = collectText(tree.toJSON()).join(" ");
    expect(text).toContain("SYSTEM MALFUNCTION");
    // The healthy sibling screen is still rendered because the per-screen
    // boundary contained the failure.
    expect(text).toContain("HEALTHY_SCREEN_BODY");

    errSpy.mockRestore();
    act(() => tree.unmount());
  });
});
