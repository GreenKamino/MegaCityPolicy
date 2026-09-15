import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { runNewSystemTicks } from "@/engine/tickProcessors";
import type { GameState } from "@/engine/types";

const constructionSource = readFileSync(
  resolve(__dirname, "../../app/(game)/construction.tsx"),
  "utf8",
);
const tickProcessorSource = readFileSync(
  resolve(__dirname, "../tickProcessors.ts"),
  "utf8",
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retired building narrative layer", () => {
  it("does not expose CITY RECORD dossier content in construction", () => {
    expect(constructionSource).not.toContain("CITY RECORD");
    expect(constructionSource).not.toContain("buildingNarrative");
    expect(constructionSource).not.toContain("formatCityRecord");
  });

  it("does not spawn the retired prose incident layer", () => {
    expect(tickProcessorSource).not.toContain("processBuildingIncidents");
    expect(tickProcessorSource).not.toContain("building-incident");
    expect(tickProcessorSource).not.toContain("Facility Incident");

    const state = createInitialState();
    state.totalTicks = 2;
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    runNewSystemTicks(state, []);

    expect((state.messages ?? []).some((message) => message.id.startsWith("building-incident-"))).toBe(false);
    expect("lastBuildingIncidentTick" in state).toBe(false);
  });

  it("keeps legacy incident messages and fields harmless on load", () => {
    const base = createInitialState();
    const legacy = {
      ...base,
      lastBuildingIncidentTick: 42,
      messages: [
        {
          id: "building-incident-fusion_reactor_harmonic_alarm-42",
          timestamp: base.gameDate,
          tick: 42,
          category: "report" as const,
          title: "FACILITY REPORT: legacy notice",
          body: "A report from an older save.",
          read: true,
          priority: "normal" as const,
        },
      ],
    } as unknown as GameState;

    const state = migrateState(legacy);

    expect(state.messages?.some((message) => message.id.startsWith("building-incident-"))).toBe(true);
    expect(() => runNewSystemTicks(state, [])).not.toThrow();
    // The migration intentionally preserves unknown legacy fields via its
    // compatibility spread; the retired field is inert and cannot gate a tick.
    expect((state as GameState & { lastBuildingIncidentTick?: number }).lastBuildingIncidentTick).toBe(42);
  });
});