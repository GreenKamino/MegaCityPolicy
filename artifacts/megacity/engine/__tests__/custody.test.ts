import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import {
  BLACKSITE_FACILITY_KEY,
  DETAINEE_ACTIONS,
  admitCustodyGroup,
  createDefaultCustodyState,
  getBlacksiteSummary,
  getDetaineeActionAvailability,
  getDetaineeRoster,
  getIncarcerationSummary,
  performDetaineeAction,
  sanitizeCustodyState,
  transitionCustodyGroup,
} from "@/engine/custody";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import { runTick } from "@/engine/formulas";
import { endWarsInvolving, getDefaultAdvancedState, recordWarCapture, startWar } from "@/engine/diplomacyAdvanced";
import type { GameState, NamedCharacter } from "@/engine/types";

function detainee(over: Partial<NamedCharacter> = {}): NamedCharacter {
  return {
    id: "npc-detainee-1",
    name: "Mara Venn",
    role: "gang_lieutenant",
    factionId: null,
    districtId: "d1",
    status: "jailed",
    notoriety: 72,
    traits: ["ruthless"],
    backstory: "A logistics officer for a local gang.",
    bornYear: 1990,
    introducedYear: 2030,
    lastSeenYear: 2030,
    history: [],
    ...over,
  };
}

function custodyState(): GameState {
  const state = createInitialState();
  state.totalTicks = 20;
  state.buildings[BLACKSITE_FACILITY_KEY] = 1;
  state.namedCharacters = [detainee()];
  state.custody = createDefaultCustodyState();
  return state;
}

describe("blacksite and detainee command", () => {
  it("derives staffed capacity from facilities and security staffing", () => {
    const state = custodyState();
    const summary = getBlacksiteSummary(state);
    expect(summary.facilities).toBe(1);
    expect(summary.nominalCapacity).toBe(80);
    expect(summary.staffedCapacity).toBe(80);
    expect(summary.readiness).toBe(1);
    expect(summary.detainees).toBe(1);
  });

  it("executes an interrogation once, records a cooldown, and applies coercive backlash once", () => {
    const state = custodyState();
    const result = performDetaineeAction(state, "npc-detainee-1", "interrogate");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.resources.credits).toBe(state.resources.credits - DETAINEE_ACTIONS.interrogate.cost);
    expect(result.state.custody?.actionHistory).toHaveLength(1);
    expect(result.state.coerciveBacklashLog).toContain("custody:npc-detainee-1:interrogate:20");
    expect(result.state.messages[0]?.title).toBe("CUSTODY ACTION COMPLETED");

    const blocked = performDetaineeAction(result.state, "npc-detainee-1", "interrogate");
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toContain("cooldown");
    expect(result.state.coerciveBacklashLog?.filter((key) => key.startsWith("custody:npc-detainee-1:interrogate")).length).toBe(1);
  });

  it("moves named detainees through lawful review without leaving a duplicate custody roster row", () => {
    const result = performDetaineeAction(custodyState(), "npc-detainee-1", "lawful-review");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.namedCharacters?.[0]?.status).toBe("active");
    expect(getDetaineeRoster(result.state)).toHaveLength(0);
    expect(result.state.custody?.records[0]?.status).toBe("released");
  });

  it("rejects blacksite actions without a facility but keeps release available", () => {
    const state = custodyState();
    state.buildings[BLACKSITE_FACILITY_KEY] = 0;
    const interrogation = getDetaineeActionAvailability(state, "npc-detainee-1", "interrogate");
    const release = getDetaineeActionAvailability(state, "npc-detainee-1", "release");
    expect(interrogation.ready).toBe(false);
    expect(interrogation.reason).toContain("Construct");
    expect(release.ready).toBe(true);
  });

  it("charges blacksite upkeep through the shared live tick pipeline", () => {
    const state = custodyState();
    const before = state.resources.credits;
    const result = runTick(state);
    expect(result.entries.some((entry) => entry.label === "Blacksite Upkeep" && entry.delta === -350)).toBe(true);
    expect(result.newState.resources.credits).toBeGreaterThan(before - 350);
  });

  it("sanitizes malformed custody records and preserves them across migration", () => {
    const malformed = sanitizeCustodyState({
      records: [
        { id: "valid", subjectId: "one", subjectName: "One", kind: "named_character", status: "held", location: "blacksite", admittedAtTick: 2, lastActionTick: 3, intelligenceValue: 44 },
        { id: "duplicate", subjectId: "one", subjectName: "Duplicate", kind: "invalid", status: "invalid", location: "invalid" },
        { id: "", subjectId: "", subjectName: 4 },
      ],
      cooldowns: { good: 18, bad: Number.NaN },
      actionHistory: [{ id: "a", targetId: "one", actionId: "interrogate", tick: 4, outcome: "completed" }],
    });
    expect(malformed.records).toHaveLength(1);
    expect(malformed.records[0]?.status).toBe("held");
    expect(malformed.cooldowns).toEqual({ good: 18 });
    expect(malformed.actionHistory).toHaveLength(1);

    const state = custodyState();
    state.custody = malformed;
    const reloaded = sanitizeState(migrateState(JSON.parse(JSON.stringify(state)) as GameState));
    expect(reloaded.custody?.records).toHaveLength(1);
    expect(reloaded.custody?.records[0]?.subjectId).toBe("one");
    expect(getIncarcerationSummary(reloaded).civilians).toBe(0);

    const legacy = custodyState();
    legacy.custody = { ...malformed, incarceration: undefined } as any;
    const migratedLegacy = sanitizeState(migrateState(JSON.parse(JSON.stringify(legacy)) as GameState));
    expect(getIncarcerationSummary(migratedLegacy).civilians).toBe(legacy.demographics.prisonPopulation);
  });

  it("tracks aggregate civilian and POW custody without counting named detainees", () => {
    const state = custodyState();
    expect(admitCustodyGroup(state, "capture-civilians", {
      id: "civilian-case-1",
      count: 42,
      role: "civilian",
      legalStatus: "pretrial",
      originKind: "unknown",
      originId: null,
      originLabel: "Not applicable",
    })).toBe(true);
    expect(admitCustodyGroup(state, "capture-pows", {
      id: "pow-unit-1",
      count: 18,
      role: "pow",
      legalStatus: "military",
      originKind: "faction",
      originId: "red-front",
      originLabel: "Red Front",
    })).toBe(true);

    const summary = getIncarcerationSummary(state);
    expect(summary).toMatchObject({ total: 60, civilians: 42, pows: 18, requiredGuards: 2 });
    expect(summary.powOrigins).toEqual([
      { key: "faction:red-front", kind: "faction", id: "red-front", label: "Red Front", count: 18 },
    ]);
    expect(getDetaineeRoster(state)).toHaveLength(3);
    expect(getDetaineeRoster(state).map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["named_character", "group", "pow"]),
    );
  });

  it("makes capture, release, escape, exchange, transfer, execution, and death transitions idempotent", () => {
    const terminalStatuses = ["released", "escaped", "exchanged", "transferred", "executed", "deceased"] as const;
    for (const status of terminalStatuses) {
      const state = createInitialState();
      state.custody = createDefaultCustodyState();
      expect(admitCustodyGroup(state, `capture-${status}`, {
        id: `group-${status}`,
        count: 5,
        role: "pow",
        legalStatus: "military",
        originKind: "unknown",
        originId: null,
        originLabel: "Unknown origin",
      })).toBe(true);
      expect(admitCustodyGroup(state, `capture-${status}`, {
        id: `duplicate-${status}`,
        count: 5,
        role: "pow",
        legalStatus: "military",
        originKind: "unknown",
        originId: null,
        originLabel: "Unknown origin",
      })).toBe(false);
      expect(transitionCustodyGroup(state, `close-${status}`, `group-${status}`, status)).toBe(true);
      expect(transitionCustodyGroup(state, `close-${status}`, `group-${status}`, status)).toBe(false);
      expect(getIncarcerationSummary(state).total).toBe(0);
    }
  });

  it("registers war captures once, preserves them through war resolution, and updates the source on exchange", () => {
    const state = createInitialState();
    const faction = state.factions[0]!;
    const war = startWar(state, faction.id, faction.name);
    state.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };

    expect(recordWarCapture(state, war.id, {
      id: "frontline-alpha",
      count: 12,
      originKind: "faction",
      originId: faction.id,
      originLabel: faction.name,
    })).toBe(true);
    expect(recordWarCapture(state, war.id, {
      id: "frontline-alpha",
      count: 12,
      originKind: "faction",
      originId: faction.id,
      originLabel: faction.name,
    })).toBe(false);
    expect(getIncarcerationSummary(state).pows).toBe(12);

    const pow = getDetaineeRoster(state).find((entry) => entry.kind === "pow");
    expect(pow?.id).toBe(`pow-war-${war.id}-frontline-alpha`);
    const exchanged = performDetaineeAction(state, pow!.id, "exchange");
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;
    expect(getIncarcerationSummary(exchanged.state).pows).toBe(0);
    expect(exchanged.state.diplomacyAdvanced?.wars[0]?.captures?.[0]?.status).toBe("exchanged");

    const ended = endWarsInvolving(exchanged.state.diplomacyAdvanced!, faction.id, exchanged.state.totalTicks, "Peace treaty");
    expect(ended.endedWars[0]?.captures?.[0]?.status).toBe("exchanged");
    expect(ended.adv.concludedWars[0]?.captures?.[0]?.id).toBe("frontline-alpha");
  });

  it("requires an active faction war channel and records the exchange across diplomacy surfaces", () => {
    const state = createInitialState();
    state.totalTicks = 24;
    const faction = state.factions[0]!;
    faction.isActive = true;
    const war = startWar(state, faction.id, faction.name);
    war.stage = "open_war";
    state.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };
    state.custody = createDefaultCustodyState();
    expect(admitCustodyGroup(state, "exchange-channel-pow", {
      id: "exchange-channel-pow",
      count: 8,
      role: "pow",
      legalStatus: "military",
      originKind: "faction",
      originId: faction.id,
      originLabel: faction.name,
    })).toBe(true);

    const target = getDetaineeRoster(state).find((entry) => entry.kind === "pow");
    expect(target).toBeTruthy();
    const first = performDetaineeAction(state, target!.id, "exchange");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const exchangedWar = first.state.diplomacyAdvanced?.wars[0];
    expect(exchangedWar?.captures ?? []).toHaveLength(0);
    expect(first.state.diplomaticHistory?.filter((entry) => entry.action === "hostage-exchange")).toHaveLength(1);
    expect(first.state.completedDiplomaticActions?.[faction.id]).toContain("hostage-exchange");
    expect(first.state.factions.find((entry) => entry.id === faction.id)?.loyalty).toBe(faction.loyalty + 1);
    expect(first.state.diplomacyAdvanced?.factionRelations.some((entry) => entry.factionB === faction.id || entry.factionA === faction.id)).toBe(true);
    expect(first.state.diplomacyAdvanced?.wars[0]?.timeline?.reports.some((entry) => entry.label.includes("Prisoner exchange completed"))).toBe(true);
    expect(first.state.custody?.actionHistory).toHaveLength(1);
    expect(first.state.newsFeed?.some((item) => item.id.startsWith("news-hostage-exchange-"))).toBe(true);

    const reloaded = sanitizeState(migrateState(JSON.parse(JSON.stringify(first.state)) as GameState));
    expect(reloaded.diplomaticHistory?.filter((entry) => entry.action === "hostage-exchange")).toHaveLength(1);
    expect(reloaded.custody?.actionHistory).toHaveLength(1);
    expect(reloaded.diplomacyAdvanced?.wars[0]?.timeline?.reports.some((entry) => entry.label.includes("Prisoner exchange completed"))).toBe(true);

    const repeated = performDetaineeAction(reloaded, target!.id, "exchange");
    expect(repeated.ok).toBe(false);
    if (repeated.ok) return;
    expect(repeated.reason).toContain("custody");
  });

  it("blocks exchanges for unknown, inactive, or no-longer-belligerent faction channels", () => {
    const state = custodyState();
    state.custody = createDefaultCustodyState();
    expect(admitCustodyGroup(state, "inactive-channel-pow", {
      id: "inactive-channel-pow",
      count: 4,
      role: "pow",
      legalStatus: "military",
      originKind: "faction",
      originId: "missing-faction",
      originLabel: "Missing faction",
    })).toBe(true);
    const target = getDetaineeRoster(state).find((entry) => entry.id === "inactive-channel-pow");
    expect(target).toBeTruthy();
    const availability = getDetaineeActionAvailability(state, target!.id, "exchange");
    expect(availability.ready).toBe(false);
    expect(availability.reason).toContain("unknown");
  });

  it("allows a named faction detainee through the active war channel and rejects the same channel after war end", () => {
    const state = custodyState();
    const faction = state.factions[0]!;
    const war = startWar(state, faction.id, faction.name);
    state.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };
    state.namedCharacters = [detainee({ id: "named-war-detainee", factionId: faction.id })];
    state.custody = createDefaultCustodyState();

    const first = performDetaineeAction(state, "named-war-detainee", "exchange");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.custody?.records[0]?.status).toBe("exchanged");
    expect(first.state.diplomaticHistory?.[0]?.factionId).toBe(faction.id);
    expect(state.custody?.incarceration.processedOperations).not.toContain("custody-exchange:named-war-detainee");

    const ended = endWarsInvolving(first.state.diplomacyAdvanced!, faction.id, first.state.totalTicks, "Ceasefire");
    const afterEnd = { ...first.state, diplomacyAdvanced: ended.adv };
    const replacement = detainee({ id: "replacement-detainee", factionId: faction.id });
    afterEnd.namedCharacters = [replacement];
    afterEnd.custody = createDefaultCustodyState();
    const blocked = getDetaineeActionAvailability(afterEnd, replacement.id, "exchange");
    expect(blocked.ready).toBe(false);
    expect(blocked.reason).toContain("active belligerent");
  });

  it("sanitizes malformed war capture sources without dropping valid history", () => {
    const state = createInitialState();
    const war = startWar(state, "red-front", "Red Front");
    const malformed = {
      ...state,
      diplomacyAdvanced: {
        ...getDefaultAdvancedState(),
        wars: [{
          ...war,
          captures: [
            null,
            { id: "", count: 5 },
            { id: "valid-capture", count: 7, originKind: "faction", originId: "red-front", originLabel: "Red Front", status: "exchanged" },
            { id: "bad-count", count: "not-a-number" },
          ],
        }],
      },
    } as GameState;
    const clean = sanitizeState(malformed);
    expect(clean.diplomacyAdvanced?.wars[0]?.captures).toEqual([
      {
        id: "valid-capture",
        count: 7,
        originKind: "faction",
        originId: "red-front",
        originLabel: "Red Front",
        status: "exchanged",
      },
    ]);
  });
});