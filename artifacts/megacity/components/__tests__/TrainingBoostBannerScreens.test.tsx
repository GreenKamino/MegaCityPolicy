import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { TRAINING_EDICT_ID } from "@/engine/pendingConstruction";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import type { GameState } from "@/engine/types";

const GAME_SCREEN_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../app/(game)",
);
const RECRUITMENT_SCREENS = ["recruitment", "military", "law"] as const;

function flatText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatText).join("");
  if (typeof node === "object" && "children" in node) {
    return flatText((node as { children?: unknown }).children);
  }
  return "";
}

function renderBanner(state: GameState): string {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<TrainingBoostBanner state={state} />);
  });
  return flatText(tree.toJSON());
}

function withDoctrine(state: GameState, ticksRemaining: number): GameState {
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

describe("training boost notices on recruitment screens", () => {
  it.each(RECRUITMENT_SCREENS)(
    "%s keeps the shared banner wired to the screen state",
    (screen) => {
      const source = readFileSync(path.join(GAME_SCREEN_DIR, `${screen}.tsx`), "utf8");

      expect(source).toContain('import TrainingBoostBanner from "@/components/TrainingBoostBanner";');
      expect(source).toMatch(/<TrainingBoostBanner\s+state=\{state\}\s*\/>/);
    },
  );

  it.each(RECRUITMENT_SCREENS)(
    "%s context shows the active doctrine countdown",
    (screen) => {
      const notice = renderBanner(withDoctrine(createInitialState(), 7));

      expect(notice, `${screen} should show the doctrine notice`).toContain(
        "Accelerated Training Doctrine",
      );
      expect(notice, `${screen} should show the doctrine expiry`).toContain(
        "doctrine expires in 7 ticks",
      );
    },
  );

  it.each(RECRUITMENT_SCREENS)(
    "%s context keeps facility-only boosts free of expiry wording",
    (screen) => {
      const notice = renderBanner(withTrainingFacility(createInitialState()));

      expect(notice, `${screen} should show the facility notice`).toContain(
        "training facilities",
      );
      expect(notice, `${screen} should not imply a facility expires`).not.toContain(
        "expires in",
      );
    },
  );
});