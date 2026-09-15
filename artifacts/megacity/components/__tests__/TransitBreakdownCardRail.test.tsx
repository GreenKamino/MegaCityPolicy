import React from "react";
import { describe, expect, it, vi } from "vitest";

import TransitBreakdownCard from "../TransitBreakdownCard";
import { createInitialState } from "@/engine/initialState";

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ colors: { danger: "red" } }),
}));

vi.mock("react-native", () => {
  const React = require("react");
  const passthrough = (name: string) => function Mock(props: any) { return { type: name, props }; };
  return { View: passthrough("View"), Text: passthrough("Text"), Pressable: passthrough("Pressable"), Platform: { OS: "web" }, StyleSheet: { create: (s: any) => s } };
});

vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

describe("TransitBreakdownCard - Rail Network", () => {
  it("includes rail capacity, operational constraints, and warnings in the breakdown", () => {
    const state = createInitialState();
    state.railCorridors = [
      {
        version: 1, id: "rail:test", endpointId: "nova-pacifica", endpointKind: "megacity", endpointLocationId: "nova-pacifica", status: "under_construction",
        proposalTick: 0, distance: 100, totalTicks: 100, progressTicks: 50, setbackTicks: 0, capabilities: ["passenger"],
        committedCredits: 1000, committedSteel: 100,
        staffing: { robots: 0, engineers: 0, railWorkers: 0, security: 0, ticketing: 0, admin: 0, maintenance: 0 },
      },
      {
        version: 1, id: "rail:test2", endpointId: "test2", endpointKind: "megacity", endpointLocationId: "test2", status: "completed",
        proposalTick: 0, distance: 100, totalTicks: 100, progressTicks: 100, setbackTicks: 0, capabilities: ["passenger"],
        committedCredits: 1000, committedSteel: 100,
        staffing: { robots: 10, engineers: 2, railWorkers: 10, security: 1, ticketing: 1, admin: 1, maintenance: 1 },
      },
      {
        version: 1, id: "rail:legacy-endpoint:42", endpointId: "legacy-endpoint", endpointKind: "megacity", endpointLocationId: "legacy-endpoint", status: "completed",
        proposalTick: 0, distance: 100, totalTicks: 100, progressTicks: 100, setbackTicks: 0, capabilities: ["passenger"],
        committedCredits: 1000, committedSteel: 100,
        staffing: { robots: 0, engineers: 2, railWorkers: 10, security: 0, ticketing: 1, admin: 1, maintenance: 1 },
      }
    ];
    state.unlockedTechnologies = ["basic_railways", "advanced_train_designs", "railway_electrification"];
    state.activePolicies = ["railPublicAccessMandate"];

    const el = TransitBreakdownCard({ state }) as any;
    
    // Just stringify the React element tree props
    const detailsStr = JSON.stringify(el.props);
    expect(detailsStr).toContain("Rail Network");
    expect(detailsStr).toContain("+140"); // from capacity additions
    expect(detailsStr).toContain(
      "Understaffed corridor: Megacity Pacifica — missing engineers (2), rail workers (10), security officers (1), ticketing staff (1), administrators (1), maintenance crew (1).",
    );
    expect(detailsStr).toContain(
      "Understaffed corridor: rail:legacy-endpoint:42 — missing security officers (1).",
    );
    expect(detailsStr).toContain("RAIL NETWORK CONSTRAINTS & OPERATIONS");
    expect(detailsStr).toContain("Operating Cost");
    expect(detailsStr).toContain("Public Access Mandate (+Passenger, +Operating Cost)");
  });
});
