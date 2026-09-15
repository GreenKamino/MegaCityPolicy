import React from "react";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const themePalette = {
  accent: "#00FF41",
  warning: "#FF9500",
  danger: "#FF3344",
  info: "#44AAFF",
  text: "#E0E0E0",
  textSecondary: "#A0A0A0",
  textMuted: "#4A5A4A",
  bg: "#0B0F0B",
  bgCard: "#141F14",
  bgElevated: "#182218",
  border: "#1F2A1F",
};

const mocks = vi.hoisted(() => ({
  gameState: null as any,
  push: vi.fn(),
}));

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      return React.createElement(name, props, props.children);
    };
  return {
    Pressable: passthrough("Pressable"),
    StyleSheet: { create: (styles: any) => styles },
    Text: passthrough("Text"),
    View: passthrough("View"),
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  const Icon = (_props: any) => React.createElement("Icon", null);
  return { Feather: Icon };
});

vi.mock("expo-router", () => ({ router: { push: mocks.push } }));
vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ colors: themePalette, mode: "dark" }),
}));
vi.mock("@/hooks/useThemedStyles", () => ({
  makeThemedStyles: (factory: (colors: typeof themePalette) => unknown) => () =>
    factory(themePalette),
}));
vi.mock("@/context/GameContext", () => ({
  useGameState: () => ({ state: mocks.gameState }),
}));

import TestRenderer, { act } from "react-test-renderer";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";
import RustWardensPanel from "@/components/RustWardensPanel";
import { createInitialState } from "@/engine/initialState";

function collectText(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (node.children) collectText(node.children, out);
  return out;
}

function renderPanel(panel: "bloc" | "wardens", detailed: boolean) {
  mocks.gameState = createInitialState();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      panel === "bloc"
        ? <AdministrativeBlocPanel detailed={detailed} />
        : <RustWardensPanel detailed={detailed} />,
    );
  });
  return tree;
}

describe("internal faction detail navigation", () => {
  it.each([
    ["bloc", "Open Administrative Bloc faction details", "OPEN BLOC DETAILS", "Administrative Bloc faction details open"],
    ["wardens", "Open Rust Wardens faction details", "OPEN WARDEN DETAILS", "Rust Wardens faction details open"],
  ] as const)(
    "keeps %s navigation available only from the collapsed panel",
    (panel, accessibilityLabel, linkText, openLabel) => {
      const collapsed = renderPanel(panel, false);
      const collapsedLink = collapsed.root.findAll(
        (node) =>
          (node as any).type === "Pressable" &&
          node.props.accessibilityLabel === accessibilityLabel,
      )[0];
      expect(collapsedLink).toBeDefined();
      expect(collectText(collapsed.toJSON())).toContain(linkText);
      act(() => collapsed.unmount());

      const detailed = renderPanel(panel, true);
      expect(
        detailed.root.findAll(
          (node) =>
            (node as any).type === "Pressable" &&
            node.props.accessibilityLabel === accessibilityLabel,
        ),
      ).toHaveLength(0);
      expect(
        detailed.root.findAll(
          (node) =>
            (node as any).type === "View" &&
            node.props.accessibilityLabel === openLabel,
        ),
      ).toHaveLength(1);
      expect(collectText(detailed.toJSON())).toContain("DETAILS OPEN");
      expect(mocks.push).not.toHaveBeenCalled();
      act(() => detailed.unmount());
    },
  );
});