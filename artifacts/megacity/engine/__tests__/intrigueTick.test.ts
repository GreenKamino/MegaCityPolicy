import { describe, it, expect } from "vitest";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { createDefaultPoliticsState, type CommanderReputation } from "@/engine/politicsData";
import { makePlot } from "@/engine/intrigue";
import { processIntrigueTick } from "@/engine/tickProcessors";
import type { GameState } from "@/engine/types";

// Intrigue runs on an 8-tick cadence gated at (totalTicks % 8 === 4). runTick
// increments totalTicks BEFORE runNewSystemTicks, so a starting totalTicks of 3
// lands the intrigue processor on exactly this tick with no other loyalty-
// touching processor (approval %8===0, threat-decay %3===0) also firing.
const INTRIGUE_TICK_SEED = 3;

function withReputation(s: GameState, axes: Partial<CommanderReputation>): void {
  s.politics = createDefaultPoliticsState();
  s.politics.reputation = { ...s.politics.reputation, ...axes };
}

// Law-aligned regime: harsh + orderly. Satisfies the Judges (law), alienates
// the Gangs (criminal, who want a weak, low-fear state).
const LAW_ALIGNED: Partial<CommanderReputation> = {
  fear: 78,
  stability: 88,
  mercy: 28,
  populism: 28,
  transparency: 40,
};

describe("processIntrigueTick (full runTick wiring)", () => {
  it("drifts loyalty by ideological alignment: aligned up, misaligned down", () => {
    const s = createInitialState();
    s.totalTicks = INTRIGUE_TICK_SEED;
    withReputation(s, LAW_ALIGNED);

    const judgesBefore = s.factions.find((f) => f.id === "judges")!.loyalty;
    const gangsBefore = s.factions.find((f) => f.id === "gangs")!.loyalty;

    const { newState } = runTick(s);

    const judgesAfter = newState.factions.find((f) => f.id === "judges")!.loyalty;
    const gangsAfter = newState.factions.find((f) => f.id === "gangs")!.loyalty;

    expect(judgesAfter).toBeGreaterThan(judgesBefore);
    expect(gangsAfter).toBeLessThan(gangsBefore);
  });

  it("radicalizes a misaligned, disloyal, high-threat faction", () => {
    const s = createInitialState();
    s.totalTicks = INTRIGUE_TICK_SEED;
    withReputation(s, LAW_ALIGNED);
    s.cityStats.unrest = 65;

    const { newState } = runTick(s);
    const rad = newState.intrigue?.radicalization["gangs"] ?? 0;
    expect(rad).toBeGreaterThan(0);
  });

  it("hatches a plot once a faction is radicalized past the threshold", () => {
    const s = createInitialState();
    s.totalTicks = INTRIGUE_TICK_SEED;
    withReputation(s, LAW_ALIGNED);
    // Seed the Gangs at the plot threshold (the tick recomputes unrest, so we
    // don't rely on a specific unrest value to push them over the line).
    s.intrigue = { radicalization: { gangs: 60 }, plots: [] };

    const { newState } = runTick(s);
    const plots = newState.intrigue?.plots ?? [];
    const gangsPlot = plots.find((p) => p.instigatorFactionId === "gangs");
    expect(gangsPlot).toBeDefined();
    expect(newState.intrigue!.radicalization["gangs"]).toBeGreaterThanOrEqual(60);
  });

  it("matures a coup plot into a militarist-coup / purge event chain", () => {
    const s = createInitialState();
    s.totalTicks = INTRIGUE_TICK_SEED;
    withReputation(s, { fear: 15, stability: 15, mercy: 90, populism: 90, transparency: 90 });
    s.cityStats.unrest = 70;

    // corps is a corporate faction -> coup plot type. Seed it primed to mature.
    const plot = makePlot(s.factions.find((f) => f.id === "corps")!, 0);
    plot.progress = 97;
    s.intrigue = { radicalization: { corps: 82 }, plots: [plot] };

    const { newState } = runTick(s);

    // The coup plot is handed off to the event chain and removed.
    const stillPlotting = (newState.intrigue?.plots ?? []).some((p) => p.instigatorFactionId === "corps");
    expect(stillPlotting).toBe(false);

    // A coup event chain is now live.
    const coupChain = (newState.activeEventChains ?? []).some(
      (c) => c.chainId === "militarist_coup" || c.chainId === "authoritarian_purge",
    );
    expect(coupChain).toBe(true);

    // Task #493: the coup attempt is broadcast on the news ticker.
    expect((newState.newsFeed ?? []).some((n) => n.id.startsWith(`news-coup-${plot.id}`))).toBe(true);
  });

  it("matures a criminal/cult plot into a terror-attack event", () => {
    const s = createInitialState();
    s.totalTicks = INTRIGUE_TICK_SEED;
    withReputation(s, LAW_ALIGNED);
    s.cityStats.unrest = 70;

    // gangs is criminal -> terror_cell plot type.
    const plot = makePlot(s.factions.find((f) => f.id === "gangs")!, 0);
    plot.progress = 97;
    s.intrigue = { radicalization: { gangs: 82 }, plots: [plot] };

    const { newState } = runTick(s);

    const terrorEvt = (newState.activeEvents ?? []).find((e) => e.id.startsWith("intrigue_terror_"));
    expect(terrorEvt).toBeDefined();
    // The plot lingers (matured) until the player resolves the event.
    const maturedPlot = (newState.intrigue?.plots ?? []).find((p) => p.instigatorFactionId === "gangs");
    expect(maturedPlot?.matured).toBe(true);

    // Task #493: the strike itself hits the news ticker the moment it fires.
    expect((newState.newsFeed ?? []).some((n) => n.id.startsWith(`news-terror-${plot.id}`))).toBe(true);
  });

  it("no-ops (defensively) when the regime has no reputation", () => {
    // runTick force-defaults politics, so exercise the guard by calling the
    // processor directly with a politics-less state.
    const s = createInitialState();
    s.totalTicks = INTRIGUE_TICK_SEED + 1; // s.totalTicks % 8 === 4
    s.politics = undefined;
    s.intrigue = { radicalization: { sentinel: 5 }, plots: [] };
    processIntrigueTick(s, []);
    expect(s.intrigue.radicalization).toEqual({ sentinel: 5 });
    expect(s.intrigue.plots).toEqual([]);
  });
});
