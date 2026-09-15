import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  OFFICER_AUTO_FILL_DOCTRINES,
  applyOfficerAutoFillDoctrine,
  getOfficerAutoFillCost,
} from "@/engine/officerAppointmentDoctrines";
import { sanitizeState } from "@/engine/sanitizer";

describe("officer auto-fill doctrines", () => {
  it("offers the four statecraft doctrines with complete consequence previews", () => {
    expect(OFFICER_AUTO_FILL_DOCTRINES.map((doctrine) => doctrine.id)).toEqual([
      "loyalists",
      "meritocrats",
      "faction_balance",
      "emergency_conscription",
    ]);
    for (const doctrine of OFFICER_AUTO_FILL_DOCTRINES) {
      expect(doctrine.costPerSeat).toBeGreaterThan(0);
      expect(doctrine.description).not.toBe("");
      expect(doctrine.factionConsequence).not.toBe("");
      expect([
        doctrine.competenceDelta,
        doctrine.loyaltyDelta,
        doctrine.corruptionDelta,
      ].some((value) => value !== 0)).toBe(true);
    }
  });

  it.each(OFFICER_AUTO_FILL_DOCTRINES)(
    "charges once and applies bounded officer and faction outcomes for $name",
    (doctrine) => {
      const state = createInitialState();
      state.resources.credits = 1_000_000;
      const internalBefore = state.factions.find((faction) => faction.scope === "internal");
      expect(internalBefore).toBeDefined();
      const vacancyCount = state.officers.filter((officer) => !officer.appointed).length;
      const result = applyOfficerAutoFillDoctrine(state, doctrine.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.result.filled).toBe(vacancyCount);
      expect(result.result.totalCost).toBe(getOfficerAutoFillCost(doctrine.id, vacancyCount));
      expect(result.next.resources.credits).toBe(
        state.resources.credits - result.result.totalCost,
      );
      expect(result.next.officers.every((officer) => officer.appointed)).toBe(true);
      expect(result.next.officers.every(
        (officer) => officer.competence >= 0 && officer.competence <= 100
          && officer.loyalty >= 0 && officer.loyalty <= 100
          && officer.corruption >= 0 && officer.corruption <= 100,
      )).toBe(true);
      expect(result.next.officers.every(
        (officer) => officer.appointmentMethod === doctrine.appointmentMethod,
      )).toBe(true);
      const internalAfter = result.next.factions.find((faction) => faction.id === internalBefore?.id);
      expect(internalAfter?.loyalty).toBe(
        Math.max(0, Math.min(100, (internalBefore?.loyalty ?? 0) + doctrine.factionLoyaltyDelta)),
      );
      expect(internalAfter?.influence).toBe(
        Math.max(0, Math.min(100, (internalBefore?.influence ?? 0) + doctrine.factionInfluenceDelta)),
      );
      expect(internalAfter?.threat).toBe(
        Math.max(0, Math.min(100, (internalBefore?.threat ?? 0) + doctrine.factionThreatDelta)),
      );
      expect(result.next.lastOfficerAutoFillResult).toEqual(result.result);
      expect(state.officers.every((officer) => !officer.appointed)).toBe(true);
    },
  );

  it("rejects unaffordable appointments without changing state", () => {
    const state = createInitialState();
    state.resources.credits = 0;
    const result = applyOfficerAutoFillDoctrine(state, "meritocrats");
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("Requires"),
    });
    expect(state.officers.every((officer) => !officer.appointed)).toBe(true);
    expect(state.resources.credits).toBe(0);
    expect(state.lastOfficerAutoFillResult).toBeNull();
  });

  it("preserves existing manual appointments while filling only vacant seats", () => {
    const state = createInitialState();
    state.resources.credits = 1_000_000;
    const manuallyAppointed = {
      ...state.officers[0],
      appointed: true,
      appointmentMethod: "merit" as const,
      competence: 77,
      loyalty: 66,
      corruption: 5,
    };
    state.officers[0] = manuallyAppointed;
    const result = applyOfficerAutoFillDoctrine(state, "loyalists");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.officers[0]).toEqual(manuallyAppointed);
    expect(result.result.filled).toBe(state.officers.length - 1);
  });

  it("reports actual clamped averages across active internal factions only", () => {
    const state = createInitialState();
    state.resources.credits = 1_000_000;
    const template = state.factions.find((faction) => faction.scope === "internal");
    expect(template).toBeDefined();
    if (!template) return;
    state.factions = [
      { ...template, id: "internal-high", loyalty: 99, influence: 100, threat: 1, isActive: true },
      { ...template, id: "internal-open", loyalty: 50, influence: 50, threat: 50, isActive: true },
      { ...template, id: "internal-inactive", loyalty: 20, influence: 20, threat: 20, isActive: false },
      { ...template, id: "external-control", scope: "external", loyalty: 20, influence: 20, threat: 20, isActive: true },
    ];
    const result = applyOfficerAutoFillDoctrine(state, "faction_balance");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toMatchObject({
      affectedFactionCount: 2,
      factionLoyaltyDelta: 2.5,
      factionInfluenceDelta: 0.5,
      factionThreatDelta: -1.5,
    });
    expect(result.next.factions.find((faction) => faction.id === "internal-inactive")).toEqual(
      state.factions.find((faction) => faction.id === "internal-inactive"),
    );
    expect(result.next.factions.find((faction) => faction.id === "external-control")).toEqual(
      state.factions.find((faction) => faction.id === "external-control"),
    );
  });

  it("keeps the result summary through JSON reload and save sanitization", () => {
    const state = createInitialState();
    state.resources.credits = 1_000_000;
    const result = applyOfficerAutoFillDoctrine(state, "faction_balance");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reloaded = sanitizeState(JSON.parse(JSON.stringify(result.next)));
    expect(reloaded.lastOfficerAutoFillResult).toEqual(result.result);
  });

  it("drops malformed imported result summaries instead of crashing the lobby", () => {
    const legacy = createInitialState();
    (legacy as unknown as { lastOfficerAutoFillResult: unknown }).lastOfficerAutoFillResult = {
      doctrineId: "not-a-doctrine",
      filled: Number.POSITIVE_INFINITY,
    };
    expect(sanitizeState(legacy).lastOfficerAutoFillResult).toBeNull();
  });

  it("keeps manual appointment UI and doctrine auto-fill UI as separate choices", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "app/(game)/officers.tsx"),
      "utf8",
    );
    expect(source).toContain("APPOINTMENT_METHODS.map");
    expect(source).toContain("OFFICER_AUTO_FILL_DOCTRINES.map");
    expect(source).toContain("SELECT APPOINTMENT DOCTRINE");
    expect(source).toContain("lastOfficerAutoFillResult");
    expect(source).toContain("Actual average across");
    expect(source).toContain("factionInfluenceDelta");
    expect(source).toContain("factionThreatDelta");
    expect(source).toContain("INSUFFICIENT FUNDS");
  });
});