import { describe, expect, it } from "vitest";

import {
  buildJournalEntries,
  formatGameDate,
  groupJournalByTick,
} from "@/engine/personalJournal";
import type { GameMessage, GameState, GameEvent, StrikeRecord } from "@/engine/types";

function gd(year = 2026, month = 5, day = 1, hour = 0) {
  return { year, month, day, hour };
}

function msg(over: Partial<GameMessage> = {}): GameMessage {
  return {
    id: over.id ?? "m1",
    timestamp: over.timestamp ?? gd(),
    tick: over.tick ?? 100,
    category: over.category ?? "report",
    title: over.title ?? "Report",
    body: over.body ?? "Body.",
    read: over.read ?? false,
    priority: over.priority ?? "normal",
  };
}

function evt(over: Partial<GameEvent> = {}): GameEvent {
  return {
    id: over.id ?? "e1",
    title: over.title ?? "Event",
    description: over.description ?? "Description.",
    severity: over.severity ?? "medium",
    effects: over.effects ?? {},
    timestamp: over.timestamp ?? 1_000,
    resolved: over.resolved ?? true,
  };
}

function strk(over: Partial<StrikeRecord> = {}): StrikeRecord {
  return {
    id: over.id ?? "s1",
    tick: over.tick ?? 50,
    timestamp: over.timestamp ?? gd(),
    attackerId: over.attackerId ?? "atk",
    targetId: over.targetId ?? "tgt",
    targetName: over.targetName ?? "Some Target",
    attackType: over.attackType ?? "raid",
    targetCategory: over.targetCategory ?? "city",
    success: over.success ?? true,
    intercepted: over.intercepted ?? false,
    damageDealt: over.damageDealt ?? {},
    attackerCasualties: over.attackerCasualties ?? 0,
    civilianCasualties: over.civilianCasualties ?? 0,
    narrative: over.narrative ?? "It went down.",
  };
}

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    messages: [],
    eventHistory: [],
    strikeHistory: [],
    worldEventLog: [],
    totalTicks: 200,
    ...over,
  } as unknown as GameState;
}

describe("personalJournal.buildJournalEntries", () => {
  it("returns an empty array for an empty state", () => {
    expect(buildJournalEntries(makeState())).toEqual([]);
  });

  it("includes messages, events, strikes, and world entries", () => {
    const state = makeState({
      messages: [msg({ id: "m1", tick: 100 })],
      eventHistory: [evt({ id: "e1" })],
      strikeHistory: [strk({ id: "s1", tick: 50 })],
      worldEventLog: [
        { tick: 80, event: "world.flood", type: "natural", timestamp: 9, title: "Flood" },
      ],
    });
    const out = buildJournalEntries(state);
    expect(out).toHaveLength(4);
    const kinds = new Set(out.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["message", "event", "strike", "world"]));
  });

  it("sorts newest tick first, with realTimestamp as a tiebreaker", () => {
    const state = makeState({
      messages: [
        msg({ id: "old", tick: 10 }),
        msg({ id: "new", tick: 100 }),
        msg({ id: "mid", tick: 50 }),
      ],
    });
    const out = buildJournalEntries(state);
    expect(out.map((e) => e.id)).toEqual(["msg:new", "msg:mid", "msg:old"]);
  });

  it("respects the limit option", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg({ id: `m${i}`, tick: i }),
    );
    const out = buildJournalEntries(makeState({ messages }), { limit: 3 });
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe("msg:m9");
  });

  it("filters by kinds when provided", () => {
    const state = makeState({
      messages: [msg()],
      eventHistory: [evt()],
      strikeHistory: [strk()],
    });
    const out = buildJournalEntries(state, { kinds: ["message", "strike"] });
    expect(out.map((e) => e.kind).sort()).toEqual(["message", "strike"]);
  });

  it("maps message priority directly to severity", () => {
    const state = makeState({
      messages: [
        msg({ id: "lo", priority: "low" }),
        msg({ id: "cr", priority: "critical" }),
      ],
    });
    const out = buildJournalEntries(state);
    const byId = Object.fromEntries(out.map((e) => [e.id, e.severity]));
    expect(byId["msg:lo"]).toBe("low");
    expect(byId["msg:cr"]).toBe("critical");
  });

  it("maps event severity 'medium' to 'normal'", () => {
    const state = makeState({ eventHistory: [evt({ severity: "medium" })] });
    expect(buildJournalEntries(state)[0].severity).toBe("normal");
  });

  it("marks failed strikes as normal severity and successful as high", () => {
    const state = makeState({
      strikeHistory: [
        strk({ id: "win", success: true }),
        strk({ id: "loss", success: false }),
      ],
    });
    const sev = Object.fromEntries(
      buildJournalEntries(state).map((e) => [e.id, e.severity]),
    );
    expect(sev["strk:win"]).toBe("high");
    expect(sev["strk:loss"]).toBe("normal");
  });

  it("is deterministic across repeated calls", () => {
    const state = makeState({
      messages: [msg({ id: "a", tick: 1 }), msg({ id: "b", tick: 1 })],
    });
    expect(buildJournalEntries(state)).toEqual(buildJournalEntries(state));
  });
});

describe("personalJournal.groupJournalByTick", () => {
  it("buckets entries by tick, newest first", () => {
    const entries = buildJournalEntries(
      makeState({
        messages: [
          msg({ id: "a", tick: 5 }),
          msg({ id: "b", tick: 5 }),
          msg({ id: "c", tick: 10 }),
        ],
      }),
    );
    const days = groupJournalByTick(entries);
    expect(days.map((d) => d.tick)).toEqual([10, 5]);
    expect(days[0].entries).toHaveLength(1);
    expect(days[1].entries).toHaveLength(2);
    expect(days[0].label).toBe("TICK 10");
  });

  it("returns an empty array for no entries", () => {
    expect(groupJournalByTick([])).toEqual([]);
  });
});

describe("personalJournal.formatGameDate", () => {
  it("formats with zero-padded month/day/hour", () => {
    expect(formatGameDate({ year: 2026, month: 3, day: 7, hour: 4 })).toBe(
      "Y2026 M03 D07 04:00",
    );
  });

  it("returns empty string when undefined", () => {
    expect(formatGameDate(undefined)).toBe("");
  });
});
