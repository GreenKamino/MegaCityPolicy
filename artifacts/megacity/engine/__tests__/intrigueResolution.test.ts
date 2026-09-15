import { describe, it, expect } from "vitest";
import { createInitialState } from "@/engine/initialState";
import {
  applyEventResponse,
  applyEventDismissal,
} from "@/engine/eventResolution";
import {
  makePlot,
  buildIntrigueWarningEvent,
  buildTerrorEvent,
} from "@/engine/intrigue";
import type { GameEvent, GameState } from "@/engine/types";

function stamp(evt: Omit<GameEvent, "timestamp" | "resolved">): GameEvent {
  return { ...evt, timestamp: Date.now(), resolved: false } as GameEvent;
}

function stateWithWarning(): { s: GameState; evt: GameEvent; plotId: string } {
  const s = createInitialState();
  const plot = makePlot(s.factions.find((f) => f.id === "gangs")!, 0);
  plot.progress = 66;
  s.intrigue = { radicalization: { gangs: 80 }, plots: [plot] };
  const evt = stamp(buildIntrigueWarningEvent(plot));
  s.activeEvents = [...s.activeEvents, evt];
  return { s, evt, plotId: plot.id };
}

describe("intrigue event resolution hook", () => {
  it("ordering a raid removes the plot, cools radicalization, raises threat, clears the event", () => {
    const { s, evt, plotId } = stateWithWarning();
    const raid = evt.responseOptions!.find((r) => r.id === "intrigue_raid")!;
    const threatBefore = s.factions.find((f) => f.id === "gangs")!.threat;

    const next = applyEventResponse(s, evt.id, raid);

    expect(next.intrigue?.plots.find((p) => p.id === plotId)).toBeUndefined();
    expect(next.intrigue?.radicalization["gangs"]).toBeLessThan(80);
    expect(next.activeEvents.find((e) => e.id === evt.id)).toBeUndefined();
    expect(next.factions.find((f) => f.id === "gangs")!.threat).toBeGreaterThan(threatBefore);
    // Task #493: dismantling a plot before it matures makes the news ticker.
    expect((next.newsFeed ?? []).some((n) => n.id.startsWith(`news-plot-foiled-${plotId}`))).toBe(true);
  });

  it("addressing grievances lowers progress and radicalization but keeps the plot", () => {
    const { s, evt, plotId } = stateWithWarning();
    const address = evt.responseOptions!.find((r) => r.id === "intrigue_address")!;

    const next = applyEventResponse(s, evt.id, address);

    const plot = next.intrigue?.plots.find((p) => p.id === plotId);
    expect(plot).toBeDefined();
    expect(plot!.progress).toBeLessThan(66);
    expect(next.intrigue?.radicalization["gangs"]).toBeLessThan(80);
    expect(next.activeEvents.find((e) => e.id === evt.id)).toBeUndefined();
  });

  it("ignoring the warning nudges progress up (plot survives)", () => {
    const { s, evt, plotId } = stateWithWarning();
    const ignore = evt.responseOptions!.find((r) => r.id === "intrigue_ignore")!;

    const next = applyEventResponse(s, evt.id, ignore);
    const plot = next.intrigue?.plots.find((p) => p.id === plotId);
    expect(plot!.progress).toBeGreaterThan(66);
  });

  it("responding to a matured terror event clears the spent plot", () => {
    const s = createInitialState();
    const plot = makePlot(s.factions.find((f) => f.id === "gangs")!, 0);
    plot.progress = 100;
    plot.matured = true;
    s.intrigue = { radicalization: { gangs: 90 }, plots: [plot] };
    const evt = stamp(buildTerrorEvent(plot));
    s.activeEvents = [...s.activeEvents, evt];

    const relief = evt.responseOptions!.find((r) => r.id === "intrigue_terror_relief")!;
    const next = applyEventResponse(s, evt.id, relief);

    expect(next.intrigue?.plots.find((p) => p.id === plot.id)).toBeUndefined();
    expect(next.intrigue?.radicalization["gangs"]).toBeLessThan(90);
    // Task #493: matured plots already made news when the crisis struck, so
    // the aftermath cleanup must NOT emit a second "foiled" headline.
    expect((next.newsFeed ?? []).some((n) => n.id.startsWith(`news-plot-foiled-${plot.id}`))).toBe(false);
  });

  it("dismissing a matured crisis event treats the plot as spent and removes it", () => {
    const s = createInitialState();
    const plot = makePlot(s.factions.find((f) => f.id === "gangs")!, 0);
    plot.progress = 100;
    plot.matured = true;
    s.intrigue = { radicalization: { gangs: 90 }, plots: [plot] };
    const evt = stamp(buildTerrorEvent(plot));
    s.activeEvents = [...s.activeEvents, evt];

    const next = applyEventDismissal(s, evt.id);
    expect(next.intrigue?.plots.find((p) => p.id === plot.id)).toBeUndefined();
    expect(next.activeEvents.find((e) => e.id === evt.id)).toBeUndefined();
  });

  it("dismissing an un-matured warning leaves the plot escalating", () => {
    const { s, evt, plotId } = stateWithWarning();
    const next = applyEventDismissal(s, evt.id);
    // The warning was ignored (not resolved) — plot persists to keep building.
    expect(next.intrigue?.plots.find((p) => p.id === plotId)).toBeDefined();
    expect(next.activeEvents.find((e) => e.id === evt.id)).toBeUndefined();
  });
});
