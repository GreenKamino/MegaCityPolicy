import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getCommandMenuStatuses } from "@/engine/commandMenuStatus";
import { createInitialState } from "@/engine/initialState";

const source = (relativePath: string) =>
  readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativePath),
    "utf8",
  );

describe("command menu status source", () => {
  it("classifies critical, unread, pending, and ready work from live state", () => {
    const state = createInitialState();
    state.messages = [
      { id: "routine", read: false, priority: "normal" },
      { id: "critical", read: false, priority: "critical" },
    ] as any;
    state.activeEvents = [
      { id: "ordinary", resolved: false, severity: "high" },
      { id: "critical", resolved: false, severity: "critical" },
    ] as any;
    state.activeMissions = [
      { id: "active", resolved: false },
      { id: "complete", resolved: true },
    ] as any;
    state.officers = [{ appointed: true }, { appointed: false }] as any;
    state.activeContracts = [{ id: "contract" }] as any;
    state.factions = [{ threat: 75 }] as any;
    state.combat!.raidEventQueue = [{ status: "incoming" }] as any;
    state.autoManagers = {
      ...(state.autoManagers ?? {}),
      queue: [{}],
    } as any;
    state.dailyStreak = {
      current: 0,
      longest: 0,
      lastClaimedDay: null,
      lastVisitedDay: null,
    };

    const statuses = getCommandMenuStatuses(state, "2026-08-30");

    expect(statuses["/(game)/inbox"]).toEqual({
      tone: "critical",
      label: "1 CRITICAL",
      count: 1,
    });
    expect(statuses["/(game)/events"]).toEqual({
      tone: "critical",
      label: "1 CRITICAL",
      count: 1,
    });
    expect(statuses["/(game)/advisor-briefings"]?.tone).toBe("pending");
    expect(statuses["/(game)/military"]?.tone).toBe("critical");
    expect(statuses["/(game)/officers"]?.label).toBe("1 VACANT");
    expect(statuses["/(game)/missions"]).toEqual({
      tone: "ready",
      label: "1 COMPLETE",
      count: 1,
    });
    expect(statuses["/(game)/contracts"]?.label).toBe("1 ACTIVE");
    expect(statuses["/(game)/challenges"]?.tone).toBe("ready");
  });

  it("falls back to ordinary unread and active counts when nothing is critical", () => {
    const state = createInitialState();
    state.messages = [{ id: "routine", read: false, priority: "normal" }] as any;
    state.activeEvents = [{ id: "ordinary", resolved: false, severity: "high" }] as any;
    state.activeMissions = [{ id: "active", resolved: false }] as any;
    state.officers = [];
    state.factions = [];
    state.combat!.raidEventQueue = [];

    const statuses = getCommandMenuStatuses(state, "2026-08-30");

    expect(statuses["/(game)/inbox"]?.tone).toBe("unread");
    expect(statuses["/(game)/inbox"]?.label).toBe("1 UNREAD");
    expect(statuses["/(game)/events"]?.tone).toBe("pending");
    expect(statuses["/(game)/events"]?.label).toBe("1 ACTIVE");
    expect(statuses["/(game)/missions"]?.label).toBe("1 ACTIVE");
  });
});

describe("status-aware More menu source contract", () => {
  const moreSource = source("../../app/(game)/more.tsx");
  const bottomSource = source("../../components/BottomQuickBar.tsx");

  it("uses player-intent groups and visible labeled status chips", () => {
    expect(moreSource).toContain('from "@/engine/commandMenuCatalog"');
    expect(moreSource).toContain("COMMAND_MENU_GROUPS.map((group)");
    expect(moreSource).toContain("item.group === group.id");
    expect(moreSource).toContain("commandStatuses[item.route]");
    expect(moreSource).toContain("itemStatus.label");
    expect(moreSource).toContain('itemStatus?.tone === "critical"');
  });

  it("shares the same badge-count source with the bottom quick bar", () => {
    expect(bottomSource).toContain('from "@/engine/commandMenuStatus"');
    expect(bottomSource).toContain("getCommandMenuBadgeCount(state,");
    expect(bottomSource).not.toContain(".filter((message) => !message.read)");
    expect(bottomSource).not.toContain(".filter((officer) => !officer.appointed)");
  });
});