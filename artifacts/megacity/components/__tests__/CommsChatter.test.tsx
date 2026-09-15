import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      return React.createElement(name, props, props.children);
    };
  return {
    StyleSheet: {
      create: (styles: any) => styles,
      hairlineWidth: 1,
    },
    Text: passthrough("Text"),
    View: passthrough("View"),
    Platform: { OS: "web" },
  };
});

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#00ff66",
      danger: "#ff3344",
    },
  }),
}));

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ commsChatterEnabled: true }),
}));

import TestRenderer, { act } from "react-test-renderer";

import CommsChatter from "@/components/CommsChatter";

afterEach(() => {
  vi.useRealTimers();
});

describe("CommsChatter compact layout", () => {
  it("keeps a fixed shell height and shows only a verified-signal status", () => {
    let tree!: TestRenderer.ReactTestRenderer;

    act(() => {
      tree = TestRenderer.create(<CommsChatter compact />);
    });

    const compact = () => tree.root.findByProps({ testID: "comms-chatter-compact" });
    const flattenedStyle = () =>
      Object.assign({}, ...compact().props.style.filter(Boolean));
    expect(flattenedStyle().height).toBe(30);
    expect(tree.root.find((node) => String(node.type) === "Text").props.children).toContain("VERIFIED OPERATIONAL SIGNALS ONLY");

    act(() => tree.unmount());
  });
});