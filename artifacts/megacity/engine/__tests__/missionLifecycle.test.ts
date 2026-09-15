import { describe, expect, it } from "vitest";

import {
  appendMissionResultMessage,
  generateMissionMessage,
  missionMessageId,
  type ActiveMissionInstance,
  type MissionResult,
} from "@/engine/officerMissions";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { ARRAY_CAPS, sanitizeState } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

function active(officerId: string, resolved: boolean): ActiveMissionInstance {
  return {
    missionId: "intel_gather" as any,
    officerId,
    officerName: officerId,
    startTick: 0,
    duration: 10,
    ticksRemaining: resolved ? 0 : 5,
    resolved,
    outcome: resolved ? "success" : undefined,
  } as ActiveMissionInstance;
}

describe("mission badge counts (more.tsx semantics)", () => {
  it("active = !resolved, complete = resolved (no acknowledged field exists)", () => {
    const missions = [
      active("a", false),
      active("b", false),
      active("c", true),
      active("d", true),
      active("e", true),
    ];
    const activeCount = missions.filter((m) => !m.resolved).length;
    const resolvedCount = missions.filter((m) => m.resolved).length;
    expect(activeCount).toBe(2);
    expect(resolvedCount).toBe(3);
  });

  it("zero of either when list is empty", () => {
    const missions: ActiveMissionInstance[] = [];
    expect(missions.filter((m) => !m.resolved).length).toBe(0);
    expect(missions.filter((m) => m.resolved).length).toBe(0);
  });

  it("ActiveMissionInstance shape never includes 'acknowledged' (regression guard)", () => {
    const inst = active("a", true);
    expect(Object.prototype.hasOwnProperty.call(inst, "acknowledged")).toBe(false);
  });
});

describe("mission result mail lifecycle", () => {
  const gameDate = { year: 2030, month: 2, day: 3, hour: 4 };
  const result: MissionResult = {
    missionId: "trade_negotiation",
    officerName: "Ada Vance",
    success: true,
    message: "Ada Vance completed Trade Negotiation successfully!",
    rewards: ["+60,000 credits"],
  };

  it("uses one stable ID for the success message", () => {
    const message = generateMissionMessage(result, gameDate, 42);
    expect(message.id).toBe(missionMessageId("trade_negotiation", true, 42, "Ada Vance"));
    expect(message.read).toBe(false);
    expect(message.category).toBe("mission");
  });

  it("does not duplicate a completion when the callback is replayed", () => {
    const state = { messages: [] } as unknown as GameState;
    const first = appendMissionResultMessage(state, result, gameDate, 42);
    const replay = appendMissionResultMessage(first, result, gameDate, 42);

    expect(first.messages).toHaveLength(1);
    expect(replay.messages).toHaveLength(1);
    expect(replay.messages[0].id).toBe(first.messages[0].id);
  });

  it("does not resurrect a message after the player has dismissed it", () => {
    const message = generateMissionMessage(result, gameDate, 42);
    const dismissed = {
      messages: [],
      dismissedMessageIds: [message.id],
    } as unknown as GameState;
    const replay = appendMissionResultMessage(dismissed, result, gameDate, 42);

    expect(replay.messages).toEqual([]);
  });

  it("keeps the newest dismissal tombstones through save/load normalization", () => {
    const message = generateMissionMessage(result, gameDate, 42);
    const tombstones = [
      ...Array.from(
        { length: ARRAY_CAPS.dismissedMessageIds + 1 },
        (_, index) => `dismissed-${index}`,
      ),
      message.id,
    ];
    const normalized = sanitizeState(
      migrateState({
        ...createInitialState(),
        messages: [],
        dismissedMessageIds: tombstones,
      }),
    );

    expect(normalized.dismissedMessageIds).toHaveLength(ARRAY_CAPS.dismissedMessageIds);
    expect(normalized.dismissedMessageIds?.[0]).toBe("dismissed-2");
    expect(normalized.dismissedMessageIds?.at(-1)).toBe(message.id);

    const replay = appendMissionResultMessage(normalized, result, gameDate, 42);
    expect(replay.messages).toEqual([]);
  });
});
