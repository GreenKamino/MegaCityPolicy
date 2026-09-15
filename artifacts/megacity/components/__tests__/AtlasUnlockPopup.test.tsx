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


// Tell React this is an act() environment so the test renderer's act() calls
// don't log "current testing environment is not configured to support act"
// noise on every render.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mocks for native-only / asset modules so the popup can render in node. ---
vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      return React.createElement(name, props, props.children);
    };
  const View = passthrough("View");
  const Text = passthrough("Text");
  const Modal = passthrough("Modal");
  const Pressable = passthrough("Pressable");
  const AnimatedView = passthrough("AnimatedView");
  return {
    View,
    Text,
    Modal,
    Pressable,
    StyleSheet: {
      create: (s: any) => s,
      absoluteFill: {},
      flatten: (s: any) => s,
    },
    Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
    Animated: {
      View: AnimatedView,
      Value: class {
        _v: number;
        constructor(v: number) {
          this._v = v;
        }
        setValue(v: number) {
          this._v = v;
        }
      },
      timing: () => ({ start: () => {} }),
      spring: () => ({ start: () => {} }),
      parallel: () => ({ start: () => {} }),
    },
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  const Icon = (_props: any) => React.createElement("Icon", null);
  return { Feather: Icon, MaterialCommunityIcons: Icon };
});

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
}));

vi.mock("@/utils/animation", () => ({ USE_NATIVE_DRIVER: false }));

// --- Imports under test (after mocks are registered). ---
import TestRenderer, { act } from "react-test-renderer";

import AtlasUnlockPopup from "@/components/AtlasUnlockPopup";
import {
  AtlasUnlockProvider,
  useAtlasUnlock,
} from "@/context/AtlasUnlockContext";
import type {
  AtlasCapstoneGranted,
  AtlasRewardGranted,
} from "@/engine/atlasCategoryRewards";

// Helper that captures the context handle so the test can call pushUnlock the
// same way the engine does at runtime.
let capturedCtx: ReturnType<typeof useAtlasUnlock> | null = null;
function ContextProbe() {
  capturedCtx = useAtlasUnlock();
  return null;
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

// React splits text nodes around inline `{expression}` boundaries (so "+75 XP"
// arrives as ["+", "75", " XP"]). Concatenating with no separator and then
// collapsing whitespace gives us the user-visible string for substring asserts.
function flatText(node: any): string {
  return collectText(node).join("").replace(/\s+/g, " ");
}

describe("AtlasUnlockPopup rendered through AtlasUnlockContext", () => {
  it("renders nothing until pushUnlock is called", () => {
    capturedCtx = null;
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <AtlasUnlockProvider>
          <ContextProbe />
          <AtlasUnlockPopup />
        </AtlasUnlockProvider>
      );
    });
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });

  it("renders the survey-unlocked popup with category labels and total XP after pushUnlock", () => {
    capturedCtx = null;
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <AtlasUnlockProvider>
          <ContextProbe />
          <AtlasUnlockPopup />
        </AtlasUnlockProvider>
      );
    });

    const granted: AtlasRewardGranted[] = [
      { id: "zone", label: "ZONES", xp: 75 },
      { id: "mountain", label: "RANGES", xp: 75 },
    ];

    act(() => {
      capturedCtx!.pushUnlock(granted);
    });

    const json = tree.toJSON();
    expect(json).not.toBeNull();
    const text = flatText(json);

    // Header & banner copy
    expect(text).toContain("ATLAS SURVEY UNLOCKED");
    expect(text).toContain("SURVEYORS HAVE FILED THE FINAL FIELD NOTES FOR");

    // Each granted category label appears with its individual XP
    expect(text).toContain("ZONES");
    expect(text).toContain("RANGES");
    expect(text).toContain("+75 XP");

    // Total XP is the sum of granted XP
    expect(text).toContain("TOTAL AWARDED");
    expect(text).toContain("+150 XP");

    // Capstone copy must NOT appear in a non-capstone unlock
    expect(text).not.toContain("WASTELAND ATLAS COMPLETE");
    expect(text).not.toContain("Title conferred");

    act(() => tree.unmount());
  });

  it("renders the capstone variant header, capstone title, and combined XP total", () => {
    capturedCtx = null;
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <AtlasUnlockProvider>
          <ContextProbe />
          <AtlasUnlockPopup />
        </AtlasUnlockProvider>
      );
    });

    const granted: AtlasRewardGranted[] = [
      { id: "cliff", label: "CLIFFS", xp: 75 },
    ];
    const capstone: AtlasCapstoneGranted = {
      xp: 1000,
      title: "Master Cartographer",
      previousTitle: "City Commander",
    };

    act(() => {
      capturedCtx!.pushUnlock(granted, capstone);
    });

    const text = flatText(tree.toJSON());

    expect(text).toContain("WASTELAND ATLAS COMPLETE");
    expect(text).toContain("CLIFFS");
    expect(text).toContain("Master Cartographer");
    // 75 (category) + 1000 (capstone) = 1075
    expect(text).toContain("+1075 XP");

    act(() => tree.unmount());
  });

  it("dismiss removes the popup from the tree", () => {
    capturedCtx = null;
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <AtlasUnlockProvider>
          <ContextProbe />
          <AtlasUnlockPopup />
        </AtlasUnlockProvider>
      );
    });
    act(() => {
      capturedCtx!.pushUnlock([{ id: "zone", label: "ZONES", xp: 75 }]);
    });
    expect(tree.toJSON()).not.toBeNull();
    act(() => {
      capturedCtx!.dismiss();
    });
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });
});
