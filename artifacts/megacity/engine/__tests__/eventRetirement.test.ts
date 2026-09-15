import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import {
  RETIRED_EVENT_CHAIN_IDS,
  RETIRED_EVENT_IDS,
  sanitizeRetiredEvents,
} from "@/engine/eventRetirement";
import { applyEventFlavor } from "@/engine/eventFlavor";

describe("retired event content", () => {
  it("removes retired cards and chain tombstones at the save boundary", () => {
    const state = createInitialState();
    const clean = sanitizeState({
      ...state,
      activeEvents: [
        {
          id: "faith_holy_war",
          title: "ARCHIVED",
          description: "ARCHIVED",
          severity: "high",
          effects: {},
          timestamp: 1,
          resolved: false,
        },
        {
          id: "crime_wave_surge",
          title: "CRIME WAVE",
          description: "Operational incident",
          severity: "high",
          effects: {},
          timestamp: 1,
          resolved: false,
        },
      ],
      eventHistory: [
        {
          id: "chain_quiet_floors_qf_stage1",
          title: "ARCHIVED",
          description: "ARCHIVED",
          severity: "low",
          effects: {},
          timestamp: 1,
          resolved: true,
          chainId: "quiet_floors",
        },
      ],
      activeEventChains: [
        {
          chainId: "quiet_floors",
          currentStageId: "qf_stage1",
          startTick: 1,
          stageStartTick: 1,
          choicesMade: [],
          resolved: false,
        },
        {
          chainId: "reactor_meltdown",
          currentStageId: "rm_stage1",
          startTick: 1,
          stageStartTick: 1,
          choicesMade: [],
          resolved: false,
        },
      ],
    });

    expect(clean.activeEvents.map((event) => event.id)).toEqual(["crime_wave_surge"]);
    expect(clean.eventHistory).toHaveLength(0);
    expect(clean.activeEventChains?.map((chain) => chain.chainId)).toEqual([
      "reactor_meltdown",
    ]);
  });

  it("keeps the denylist explicit and event flavor is now a no-op", () => {
    expect(RETIRED_EVENT_IDS.has("faith_holy_war")).toBe(true);
    expect(RETIRED_EVENT_CHAIN_IDS.has("quiet_floors")).toBe(true);

    const event = {
      id: "crime_wave_surge",
      title: "REPORT {gangLieutenant|the gang}",
      description: "Condition report",
      severity: "high" as const,
      effects: {},
      timestamp: 1,
      resolved: false,
    };
    expect(applyEventFlavor(event, createInitialState())).toBe(event);
    expect(sanitizeRetiredEvents(createInitialState()).activeEvents).toEqual([]);
  });
});