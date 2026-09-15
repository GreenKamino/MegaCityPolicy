// Personal Journal — derives a unified diary feed from existing player state.
//
// Sources: state.messages, state.eventHistory, state.strikeHistory,
// state.worldEventLog. Entries are sorted newest-first by tick (with a
// secondary sort on realTimestamp), then optionally grouped by tick.
//
// Pure functions only — no IO, no globals, no Date.now() inside the
// generator (tests stay deterministic).

import type { GameDate, GameEvent, GameState } from "@/engine/types";

export type JournalEntryKind = "message" | "event" | "strike" | "world";
export type JournalSeverity = "low" | "normal" | "high" | "critical";

export type JournalEntry = {
  id: string;
  kind: JournalEntryKind;
  tick: number;
  gameDate?: GameDate;
  realTimestamp?: number;
  title: string;
  body: string;
  severity: JournalSeverity;
  category?: string;
};

export type JournalDay = {
  tick: number;
  label: string;
  entries: JournalEntry[];
};

const DEFAULT_LIMIT = 200;

export function buildJournalEntries(
  state: GameState,
  opts?: { limit?: number; kinds?: JournalEntryKind[] },
): JournalEntry[] {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const kinds = opts?.kinds;
  const out: JournalEntry[] = [];

  if (!kinds || kinds.includes("message")) {
    for (const m of state.messages ?? []) {
      out.push({
        id: `msg:${m.id}`,
        kind: "message",
        tick: m.tick ?? 0,
        gameDate: m.timestamp,
        title: m.title,
        body: m.body,
        severity: mapMessagePriority(m.priority),
        category: m.category,
      });
    }
  }
  if (!kinds || kinds.includes("event")) {
    const fallbackTick = state.totalTicks ?? 0;
    for (const e of state.eventHistory ?? []) {
      out.push({
        id: `evt:${e.id}`,
        kind: "event",
        tick: fallbackTick,
        realTimestamp: e.timestamp,
        title: e.title,
        // Incident prose is legacy-only; retain a useful journal entry for
        // newly generated incidents without reintroducing a payload.
        body: e.description ?? e.title,
        severity: mapEventSeverity(e.severity),
        category: "event",
      });
    }
  }
  if (!kinds || kinds.includes("strike")) {
    for (const s of state.strikeHistory ?? []) {
      out.push({
        id: `strk:${s.id}`,
        kind: "strike",
        tick: s.tick,
        gameDate: s.timestamp,
        title: `STRIKE — ${s.targetName}`,
        body: s.narrative,
        severity: s.success ? "high" : "normal",
        category: s.attackType,
      });
    }
  }
  if (!kinds || kinds.includes("world")) {
    for (const w of state.worldEventLog ?? []) {
      out.push({
        id: `wrld:${w.tick}-${w.event}`,
        kind: "world",
        tick: w.tick,
        realTimestamp: w.timestamp,
        title: w.title ?? w.event,
        body: w.description ?? w.event,
        severity: "normal",
        category: w.type,
      });
    }
  }

  out.sort((a, b) => {
    if (b.tick !== a.tick) return b.tick - a.tick;
    const ar = a.realTimestamp ?? 0;
    const br = b.realTimestamp ?? 0;
    if (br !== ar) return br - ar;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return out.slice(0, limit);
}

export function groupJournalByTick(entries: JournalEntry[]): JournalDay[] {
  const buckets = new Map<number, JournalEntry[]>();
  for (const e of entries) {
    const arr = buckets.get(e.tick) ?? [];
    arr.push(e);
    buckets.set(e.tick, arr);
  }
  const sortedTicks = [...buckets.keys()].sort((a, b) => b - a);
  return sortedTicks.map((t) => ({
    tick: t,
    label: `TICK ${t}`,
    entries: buckets.get(t)!,
  }));
}

export function formatGameDate(d?: GameDate): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Y${d.year} M${pad(d.month)} D${pad(d.day)} ${pad(d.hour)}:00`;
}

function mapMessagePriority(p: "low" | "normal" | "high" | "critical"): JournalSeverity {
  return p;
}

function mapEventSeverity(s: GameEvent["severity"]): JournalSeverity {
  switch (s) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "normal";
    case "low": return "low";
  }
}
