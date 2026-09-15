import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) =>
    function Mock(props: any) {
      return React.createElement(name, props, props.children);
    };
  return {
    Platform: { OS: "web" },
    Modal: passthrough("Modal"),
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (styles: any) => styles,
    },
    Text: passthrough("Text"),
    View: passthrough("View"),
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  const Icon = (_props: any) => React.createElement("Icon", null);
  return { Feather: Icon, MaterialCommunityIcons: Icon };
});

const themePalette = {
  accent: "#00FF41",
  warning: "#FF9500",
  danger: "#FF3344",
  text: "#E0E0E0",
  textSecondary: "#A0A0A0",
  textMuted: "#4A5A4A",
  bg: "#0B0F0B",
  bgCard: "#141F14",
  border: "#1F2A1F",
};

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ colors: themePalette, mode: "dark" }),
}));

const gameState = {
  officers: [],
  cityStats: { biosphere: 50, diseaseRisk: 0 },
  faiths: { stances: { "free-choir": "tolerate" } },
  resources: { credits: 1_000 },
};

vi.mock("@/context/GameContext", () => ({
  useGameState: () => ({ state: gameState }),
}));

const showToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("@/engine/audio", () => ({
  playSound: vi.fn(),
}));

vi.mock("@/engine/haptics", () => ({
  playHaptic: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
}));

vi.mock("@/engine/eventFlavor", () => ({
  lookupFactionStamp: () => null,
}));

vi.mock("@/engine/eventChains", () => ({
  FREE_CHOIR_TRANSIT_CHAIN_IDS: new Set(),
}));

vi.mock("@/engine/faiths", () => ({
  applyFreeChoirTransitScale: (effects: Record<string, number>) => effects,
  getFreeChoirTransitMultiplier: () => 1,
}));

vi.mock("@/engine/recurringEvents", () => ({
  getRecurrenceFixTarget: () => null,
  getRecurrenceHintPhrase: () => null,
  getRecurrenceRemediation: () => null,
}));

import TestRenderer, { act } from "react-test-renderer";
import GameModal, { type ModalButton } from "@/components/GameModal";
import EventCard from "@/components/EventCard";
import type { EventResponse, GameEvent } from "@/engine/types";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  gameState.resources.credits = 1_000;
});

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

function findPressableWithText(
  root: TestRenderer.ReactTestInstance,
  text: string,
): TestRenderer.ReactTestInstance {
  const textNode = root.findAll(
    (node) =>
      (node as any).type === "Text" &&
      collectText(node).join("").trim() === text,
  )[0];
  if (!textNode) throw new Error(`Could not find text: ${text}`);
  let parent: TestRenderer.ReactTestInstance | null = textNode.parent;
  while (parent && (parent as any).type !== "Pressable") parent = parent.parent;
  if (!parent) throw new Error(`Could not find Pressable for text: ${text}`);
  return parent;
}

function findPressableWithAccessibilityLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const pressable = root.findAll(
    (node) =>
      (node as any).type === "Pressable" &&
      node.props.accessibilityLabel === label,
  )[0];
  if (!pressable) throw new Error(`Could not find accessibility label: ${label}`);
  return pressable;
}

function makeEvent(responseOptions?: GameEvent["responseOptions"]): GameEvent {
  return {
    id: "destructive-action-regression",
    title: "A COSTLY CRISIS",
    description: "A fixture for confirmation coverage.",
    severity: "high",
    effects: { unrest: 2 },
    responseOptions,
  } as GameEvent;
}

describe("destructive action confirmation guard", () => {
  it("dismisses a simple OK modal from the button and Escape", () => {
    const onDismiss = vi.fn();
    const listeners = new Set<(event: { key: string; preventDefault: () => void }) => void>();
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      addEventListener: (_type: string, listener: (event: { key: string; preventDefault: () => void }) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: { key: string; preventDefault: () => void }) => void) => listeners.delete(listener),
    };
    let tree!: TestRenderer.ReactTestRenderer;
    try {
      act(() => {
        tree = TestRenderer.create(
          <GameModal
            visible
            title="Error"
            message="Enter a squad name"
            buttons={[{ text: "OK" }]}
            onDismiss={onDismiss}
          />,
        );
      });

      act(() => findPressableWithText(tree.root, "OK").props.onPress());
      expect(onDismiss).toHaveBeenCalledTimes(1);

      const escape = { key: "Escape", preventDefault: vi.fn() };
      act(() => listeners.forEach((listener) => listener(escape)));
      expect(escape.preventDefault).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledTimes(2);
    } finally {
      act(() => tree?.unmount());
      (globalThis as any).window = previousWindow;
    }
  });

  it("keeps CANCEL side-effect free and commits a destructive modal action once", () => {
    vi.useFakeTimers();
    const state = { credits: 1_000, inventory: ["sealed dossier"] };
    const beforeCancel = structuredClone(state);
    const commit = vi.fn(() => {
      state.credits -= 250;
      state.inventory = [];
    });
    const onDismiss = vi.fn();
    const buttons: ModalButton[] = [
      { text: "CANCEL", style: "cancel" },
      { text: "SPEND 250 CR", style: "destructive", onPress: commit },
    ];

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <GameModal
          visible
          title="CONFIRM SPEND"
          message="Spend credits on this irreversible action?"
          buttons={buttons}
          onDismiss={onDismiss}
        />,
      );
    });

    act(() => {
      findPressableWithText(tree.root, "CANCEL").props.onPress();
    });
    expect(state).toEqual(beforeCancel);
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      findPressableWithText(tree.root, "SPEND 250 CR").props.onPress();
      vi.advanceTimersByTime(50);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ credits: 750, inventory: [] });
    expect(onDismiss).toHaveBeenCalledTimes(2);

    act(() => tree.unmount());
  });

  it("confirms EventCard dismissal only after the modal action, exactly once", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <EventCard
          event={makeEvent()}
          onDismiss={onDismiss}
        />,
      );
    });

    const dismissButton = findPressableWithAccessibilityLabel(
      tree.root,
      "Dismiss A COSTLY CRISIS",
    );
    act(() => dismissButton.props.onPress());
    expect(findPressableWithText(tree.root, "CANCEL")).toBeDefined();

    act(() => findPressableWithText(tree.root, "CANCEL").props.onPress());
    vi.advanceTimersByTime(50);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => findPressableWithAccessibilityLabel(
      tree.root,
      "Dismiss A COSTLY CRISIS",
    ).props.onPress());
    act(() => findPressableWithText(tree.root, "DISMISS").props.onPress());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
  });

  it("keeps a credit-cost event response unchanged on CANCEL and commits once", () => {
    vi.useFakeTimers();
    const response = {
      id: "pay-the-cost",
      label: "PAY THE COST",
      description: "Spend credits to resolve the crisis.",
      effects: { credits: -125, happiness: 2 },
    };
    const onRespond = vi.fn((_eventId: string, selected: EventResponse) => {
      gameState.resources.credits += selected.effects.credits ?? 0;
    });
    const beforeCancel = structuredClone(gameState);

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <EventCard
          event={makeEvent([response])}
          onDismiss={vi.fn()}
          onRespond={onRespond}
        />,
      );
    });

    const cardPressables = tree.root.findAll(
      (node) => (node as any).type === "Pressable" && typeof node.props.onPress === "function",
    );
    act(() => cardPressables[0].props.onPress());
    const responseButton = findPressableWithText(tree.root, "PAY THE COST");
    act(() => responseButton.props.onPress());

    const cancelButton = findPressableWithText(tree.root, "CANCEL");
    act(() => cancelButton.props.onPress());
    expect(gameState).toEqual(beforeCancel);
    expect(onRespond).not.toHaveBeenCalled();

    act(() => {
      findPressableWithText(tree.root, "PAY THE COST").props.onPress();
    });
    act(() => {
      findPressableWithText(tree.root, "COMMIT RESPONSE").props.onPress();
      vi.advanceTimersByTime(50);
    });
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(gameState.resources.credits).toBe(875);

    act(() => tree.unmount());
  });

  it("requires every literal destructive modal button in game screens to have a cancel affordance nearby", () => {
    const gameDir = join(process.cwd(), "app", "(game)");
    const sources = [
      ...readdirSync(gameDir)
        .filter((file) => file.endsWith(".tsx"))
        .map((file) => [file, readFileSync(join(gameDir, file), "utf8")] as const),
      ["components/EventCard.tsx", readFileSync(join(process.cwd(), "components", "EventCard.tsx"), "utf8")] as const,
    ];
    const destructiveButton = /style\s*:\s*["']destructive["']/g;
    const cancelAffordance =
      /style\s*:\s*["']cancel["']|text\s*:\s*["'](?:CANCEL|Cancel|KEEP|STAY|Abort|Stand Down|Dismiss|DISMISS|CLOSE|OK|UNDERSTOOD)["']/;

    const missingGuards: string[] = [];
    for (const [file, source] of sources) {
      for (const match of source.matchAll(destructiveButton)) {
        const start = Math.max(0, (match.index ?? 0) - 1_800);
        const end = Math.min(source.length, (match.index ?? 0) + match[0].length + 1_800);
        if (!cancelAffordance.test(source.slice(start, end))) {
          missingGuards.push(`${file}:${source.slice(0, match.index).split("\n").length}`);
        }
      }
    }

    expect(missingGuards, `Unguarded destructive buttons: ${missingGuards.join(", ")}`).toEqual([]);
  });
});