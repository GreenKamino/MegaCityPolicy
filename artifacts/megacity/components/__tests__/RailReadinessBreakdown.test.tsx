import React from "react";
import { describe, expect, it, vi } from "vitest";

import RailReadinessBreakdown from "../RailReadinessBreakdown";
import { createInitialState } from "@/engine/initialState";
import { STANDARD_RAIL_CREW } from "@/engine/railNetwork";

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      border: "border",
      info: "info",
      text: "text",
      textMuted: "muted",
      statHigh: "high",
    },
  }),
}));

vi.mock("react-native", () => {
  const passthrough = (name: string) => function Mock(props: any) {
    return { type: name, props };
  };
  return {
    View: passthrough("View"),
    Text: passthrough("Text"),
    StyleSheet: { create: (styles: any) => styles },
  };
});

describe("RailReadinessBreakdown", () => {
  it("names active module contributions and excludes incomplete or understaffed corridors", () => {
    const state = createInitialState();
    state.railCorridors = [
      {
        version: 1,
        id: "rail:operational",
        endpointId: "nova-pacifica",
        endpointKind: "megacity",
        endpointLocationId: "nova-pacifica",
        status: "completed",
        proposalTick: 0,
        distance: 100,
        totalTicks: 100,
        progressTicks: 100,
        setbackTicks: 0,
        capabilities: ["commercial"],
        staffing: { ...STANDARD_RAIL_CREW },
        installedTrainUpgrades: ["weaponized_escort_cars", "troop_transport_carriages"],
      },
      {
        version: 1,
        id: "rail:incomplete",
        endpointId: "nova-pacifica",
        endpointKind: "megacity",
        endpointLocationId: "nova-pacifica",
        status: "under_construction",
        proposalTick: 0,
        distance: 100,
        totalTicks: 100,
        progressTicks: 50,
        setbackTicks: 0,
        capabilities: ["commercial"],
        staffing: { ...STANDARD_RAIL_CREW },
        installedTrainUpgrades: ["armored_train_plating"],
      },
      {
        version: 1,
        id: "rail:understaffed",
        endpointId: "nova-pacifica",
        endpointKind: "megacity",
        endpointLocationId: "nova-pacifica",
        status: "completed",
        proposalTick: 0,
        distance: 100,
        totalTicks: 100,
        progressTicks: 100,
        setbackTicks: 0,
        capabilities: ["commercial"],
        staffing: { ...STANDARD_RAIL_CREW, security: 0 },
        installedTrainUpgrades: ["armored_train_plating"],
      },
    ];

    const element = RailReadinessBreakdown({ state }) as any;
    const rendered = JSON.stringify(element.props);

    expect(rendered).toContain("OPERATIONAL RAIL MODULES");
    expect(rendered).toContain("Weaponized escort cars");
    expect(rendered).toContain("+16 armed security");
    expect(rendered).toContain("Troop-transport carriages");
    expect(rendered).toContain("+40 troop movement capacity");
    expect(rendered).not.toContain("Armored train plating");
    expect(rendered).not.toContain("rail:incomplete");
    expect(rendered).not.toContain("rail:understaffed");
  });
});