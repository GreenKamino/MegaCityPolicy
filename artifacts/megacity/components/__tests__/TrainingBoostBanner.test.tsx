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
    View: passthrough("View"),
    Text: passthrough("Text"),
    StyleSheet: { create: (styles: any) => styles },
  };
});

vi.mock("@expo/vector-icons", () => {
  const React = require("react");
  return { Feather: (_props: any) => React.createElement("Icon") };
});

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#00FF41",
      textSecondary: "#A0A0A0",
    },
  }),
}));

import TestRenderer, { act } from "react-test-renderer";

import TrainingBoostBanner from "@/components/TrainingBoostBanner";
import { createInitialState } from "@/engine/initialState";
import {
  TRAINING_EDICT_ID,
  getTrainingSpeedSourcesLabel,
} from "@/engine/pendingConstruction";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import type { GameState } from "@/engine/types";

function flatText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatText).join("");
  if (typeof node === "object" && "children" in node) {
    return flatText((node as { children?: unknown }).children);
  }
  return "";
}

function render(state: GameState): string {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<TrainingBoostBanner state={state} />);
  });
  return flatText(tree.toJSON());
}

function withTrainingDoctrine(state: GameState, ticksRemaining: number): GameState {
  return {
    ...state,
    activeEdicts: [
      ...(state.activeEdicts ?? []),
      {
        edictId: TRAINING_EDICT_ID,
        ticksRemaining,
        issuedAtTick: state.totalTicks,
        cooldownUntilTick: 0,
      },
    ],
  };
}

function withTrainingFacility(state: GameState): GameState {
  const facility = MILITARY_BUILDINGS.find((building) => building.category === "training")!;
  const military = state.militaryOverhaul ?? createDefaultMilitaryState();
  return {
    ...state,
    militaryOverhaul: {
      ...military,
      logistics: {
        ...military.logistics,
        installationsBuilt: {
          ...(military.logistics?.installationsBuilt ?? {}),
          [facility.id]: 1,
        },
      },
    },
  };
}

describe("TrainingBoostBanner", () => {
  it("shows the doctrine countdown and omits it for permanent facility boosts", () => {
    const base = createInitialState();
    const doctrineText = render(withTrainingDoctrine(base, 7));

    expect(doctrineText).toContain("Accelerated Training Doctrine");
    expect(doctrineText).toContain("doctrine expires in 7 ticks");

    const facilityText = render(withTrainingFacility(base));
    expect(getTrainingSpeedSourcesLabel(withTrainingFacility(base))).toBe("training facilities");
    expect(facilityText).toContain("training facilities");
    expect(facilityText).not.toContain("expires in");
  });
});